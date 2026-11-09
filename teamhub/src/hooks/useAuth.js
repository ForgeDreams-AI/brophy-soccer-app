import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
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
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      const ref = doc(db, "users", fbUser.uid);
      let snap = await getDoc(ref);
      // A player arriving via a team invite link (?invite=CODE) redeems it
      // here, at first sign-in. A returning user (doc exists) ignores the
      // param — they're already on a team.
      const inviteCode = readInviteCode();

      if (!snap.exists()) {
        // First-time sign-in. Two ways in, in this order:
        //  1. Invite link — the code names the team; no email invite needed.
        //  2. Email invite — the coach added this email to the roster.
        const email = (fbUser.email || "").toLowerCase();
        const name = fbUser.displayName || email.split("@")[0];
        let invitedRole = "player";
        let teamId = null;

        if (inviteCode) {
          const linkSnap = await getDoc(doc(db, "inviteLinks", inviteCode));
          if (linkSnap.exists()) {
            const link = linkSnap.data();
            const expiry = linkExpiryMs(link.expiresAt);
            const uses = typeof link.uses === "number" ? link.uses : 0;
            const live = isValidTeamId(link.teamId)
              && (expiry == null || expiry > Date.now())
              && (link.maxUses == null || uses < link.maxUses);
            if (live) teamId = link.teamId;
          }
          if (!teamId) {
            // Invalid / expired / used-up link: show a clear error and do
            // NOT create the user on a wrong team. Clear the param so a
            // retry signs in through the normal email-invite path.
            setError(
              "That invite link is invalid, expired, or already used up. Ask your coach for a new link — or sign in with an email that's already on the roster.",
            );
            clearInviteParam();
            await signOut(auth);
            setLoading(false);
            return;
          }
        } else {
          const inviteSnap = await getDoc(doc(db, "invitedEmails", email));
          if (!inviteSnap.exists()) {
            setError(
              `${email} isn't on the team roster. Ask your coach to add your email.`,
            );
            await signOut(auth);
            setLoading(false);
            return;
          }
          invitedRole = inviteSnap.data().role || "player";
          // The invite carries the team (see addInvite). A missing teamId
          // falls back to Varsity — the invite UI always sets a team, so
          // this should never happen on a fresh Brophy invite.
          const invitedTeamId = inviteSnap.data().teamId;
          teamId = isValidTeamId(invitedTeamId) ? invitedTeamId : DEFAULT_TEAM_ID;
        }

        await setDoc(ref, {
          name,
          email,
          role: invitedRole,
          teamIds: [teamId],
          primaryTeamId: teamId,
          initials: initialsFrom(name),
        });
        if (inviteCode) {
          // Bump the link's use count (atomic server-side increment). If it
          // fails (e.g. the link was exhausted between the read and this
          // write), the player is already legitimately on the team — don't
          // fail their sign-in over it.
          try {
            await updateDoc(doc(db, "inviteLinks", inviteCode), { uses: increment(1) });
          } catch (e) {
            console.warn("invite link use-count bump failed:", e?.code || e);
          }
          clearInviteParam();
        }
        snap = await getDoc(ref);
      } else if (inviteCode) {
        // Returning user with a stale ?invite= in the URL — drop it.
        clearInviteParam();
      }

      const data = snap.data();
      // Backfill: users created before teams existed get their team fields.
      // A missing teamId defaults to Varsity. NOTE: the rules let ONLY the
      // org admin write teamIds/primaryTeamId on someone else's doc, so this
      // attempt is denied for anyone else — the try/catch below falls back
      // to the in-memory values, which is all a fresh Brophy user needs
      // (every doc is created with its teams).
      let teamIds = Array.isArray(data.teamIds) ? data.teamIds.filter(isValidTeamId) : [];
      let primaryTeamId = isValidTeamId(data.primaryTeamId) ? data.primaryTeamId : null;
      if (!teamIds.length) teamIds = [primaryTeamId || DEFAULT_TEAM_ID];
      if (!primaryTeamId) primaryTeamId = teamIds[0];
      if (!Array.isArray(data.teamIds) || !isValidTeamId(data.primaryTeamId)) {
        try {
          await updateDoc(ref, { teamIds, primaryTeamId });
        } catch {
          // Rules / offline — the in-memory values below still apply.
        }
      }

      setError("");
      setUser({
        uid: fbUser.uid,
        name: data.name,
        email: data.email,
        role: data.role || "player",
        teamIds,
        primaryTeamId,
        initials: data.initials || initialsFrom(data.name || ""),
        photoURL: data.photoURL || "",
        photoPath: data.photoPath || "",
        sub: data.role === "admin" || data.role === "orgAdmin"
          ? (data.role === "orgAdmin" ? "Program Admin" : "Head Coach")
          : `Player · ${getTeamShortName(primaryTeamId)}`,
      });
      setLoading(false);
    });
  }, []);

  const clearError = () => setError("");
  return { user, loading, error, clearError };
}
