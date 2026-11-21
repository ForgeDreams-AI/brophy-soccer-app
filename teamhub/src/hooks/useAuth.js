import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, writeBatch, increment } from "firebase/firestore";
import { auth, db } from "../firebase";
import { DEFAULT_TEAM_ID, getTeamShortName, isValidTeamId } from "../data/teams";

// Invite-link redemption: a coach shares a link like
// <app>/?invite=CODE. Read the code from the URL ("" when absent).
const readInviteCode = () => {
  try {
    return new URLSearchParams(window.location.search).get("invite") || "";
  } catch { return ""; }
};

// Drop ?invite= from the URL (after redemption, or after a bad link so a
// retry signs in through the normal email-invite path).
const clearInviteParam = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("invite")) return;
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch { /* private mode / odd URL — harmless */ }
};

// Expiry of an invite link as epoch ms (null = never expires). Accepts a
// Firestore Timestamp, a Date, or a raw number.
const linkExpiryMs = (expiresAt) => {
  if (!expiresAt) return null;
  if (typeof expiresAt.toMillis === "function") return expiresAt.toMillis();
  if (typeof expiresAt.seconds === "number") return expiresAt.seconds * 1000;
  const d = new Date(expiresAt);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const initialsFrom = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Build the in-app user object from the profile doc.
const toUser = (uid, data) => {
  const teamIds = Array.isArray(data.teamIds) ? data.teamIds.filter(isValidTeamId) : [];
  const primaryTeamId = isValidTeamId(data.primaryTeamId) ? data.primaryTeamId : (teamIds[0] || DEFAULT_TEAM_ID);
  if (!teamIds.length) teamIds.push(primaryTeamId);
  return {
    uid,
    name: data.name || "",
    email: data.email || "",
    role: data.role || "player",
    teamIds,
    primaryTeamId,
    initials: data.initials || initialsFrom(data.name || ""),
    photoURL: data.photoURL || "",
    photoPath: data.photoPath || "",
    sub: data.role === "admin" || data.role === "orgAdmin"
      ? (data.role === "orgAdmin" ? "Program Admin" : "Head Coach")
      : `Player · ${getTeamShortName(primaryTeamId)}`,
  };
};

class GateError extends Error {}

// First sign-in: create the profile from an invite link or an email invite.
// The security rules re-check every field against the invite (firestore.rules
// users/{uid} create), so this is the happy path, not the enforcement.
async function createProfile(fbUser, inviteCode) {
  const email = (fbUser.email || "").toLowerCase();
  const name = fbUser.displayName || email.split("@")[0];
  const ref = doc(db, "users", fbUser.uid);
  const profile = { name, email, initials: initialsFrom(name) };

  if (inviteCode) {
    const linkSnap = await getDoc(doc(db, "inviteLinks", inviteCode));
    const link = linkSnap.exists() ? linkSnap.data() : null;
    const expiry = link ? linkExpiryMs(link.expiresAt) : null;
    const uses = link && typeof link.uses === "number" ? link.uses : 0;
    const live = link
      && isValidTeamId(link.teamId)
      && (expiry == null || expiry > Date.now())
      && (link.maxUses == null || uses < link.maxUses);
    if (!live) {
      clearInviteParam();
      throw new GateError(
        "That invite link is invalid, expired, or already used up. Ask your coach for a new link — or sign in with an email that's already on the roster.",
      );
    }
    // Profile + use-count bump in ONE batch: the rules only allow the bump
    // alongside the creation of a profile carrying this inviteCode, so a
    // link's uses can't be burned by anyone else.
    const batch = writeBatch(db);
    batch.set(ref, { ...profile, role: "player", teamIds: [link.teamId], primaryTeamId: link.teamId, inviteCode });
    batch.update(doc(db, "inviteLinks", inviteCode), { uses: increment(1) });
    await batch.commit();
    clearInviteParam();
    return;
  }

  const inviteSnap = await getDoc(doc(db, "invitedEmails", email));
  if (!inviteSnap.exists()) {
    throw new GateError(`${email} isn't on the team roster. Ask your coach to add your email.`);
  }
  const inv = inviteSnap.data();
  const role = inv.role || "player";
  // The rules require the invite's team (legacy invites without one = varsity).
  const teamId = inv.teamId || DEFAULT_TEAM_ID;
  if (!isValidTeamId(teamId)) {
    throw new GateError("Your roster invite has no valid team. Ask your coach to re-add your email.");
  }
  const batch = writeBatch(db);
  batch.set(ref, { ...profile, role, teamIds: [teamId], primaryTeamId: teamId });
  await batch.commit();
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      unsubProfile();
      unsubProfile = () => {};
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const ref = doc(db, "users", fbUser.uid);
      const inviteCode = readInviteCode();
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) await createProfile(fbUser, inviteCode);
        else if (inviteCode) clearInviteParam(); // returning user, stale link
      } catch (e) {
        // Never leave the app stuck on "Loading…": show why and sign out.
        const msg = e instanceof GateError
          ? e.message
          : e?.code === "permission-denied"
            ? "Your invite doesn't match this account. Ask your coach to check the roster email and team."
            : "Couldn't load your profile — check your connection and try again.";
        if (!(e instanceof GateError)) console.error("profile setup failed:", e);
        setError(msg);
        setUser(null);
        setLoading(false);
        try { await signOut(auth); } catch { /* already signed out */ }
        return;
      }

      // Live profile: role / team / name / photo changes apply immediately,
      // no reload needed (an org admin's role edit, NameGate, Settings).
      unsubProfile = onSnapshot(
        ref,
        (s) => {
          if (!s.exists()) {
            // Profile removed (e.g. an org admin removed the player).
            setError("Your account was removed from the team. Ask your coach if this is a mistake.");
            setUser(null);
            setLoading(false);
            signOut(auth).catch(() => { /* already signed out */ });
            return;
          }
          setError("");
          const next = toUser(fbUser.uid, s.data());
          // Keep the same object when nothing visible changed (e.g. an FCM
          // token write), so downstream effects don't re-run needlessly.
          setUser((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
          setLoading(false);
        },
        (e) => {
          console.error("profile listen failed:", e);
          setError("Couldn't load your profile — check your connection and try again.");
          setLoading(false);
        },
      );
    });
    return () => { unsubProfile(); unsubAuth(); };
  }, []);

  const clearError = () => setError("");
  return { user, loading, error, clearError };
}
