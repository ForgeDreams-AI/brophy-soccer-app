import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { DEFAULT_TEAM_ID, getTeamShortName, isValidTeamId } from "../data/teams";

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

      if (!snap.exists()) {
        // First-time sign-in. Gate on invitedEmails so randos can't join.
        // TODO (invite links, follow-up fix): accept an invite code from the
        // sign-up link — look up inviteLinks/{code}, validate it (teamId,
        // expiresAt, maxUses/uses), set teamIds/primaryTeamId from the
        // link's teamId, and bump `uses` by 1. Until then, email invites
        // below are the only way in.
        const email = (fbUser.email || "").toLowerCase();
        const inviteSnap = await getDoc(doc(db, "invitedEmails", email));
        if (!inviteSnap.exists()) {
          setError(
            `${email} isn't on the team roster. Ask your coach to add your email.`,
          );
          await signOut(auth);
          setLoading(false);
          return;
        }
        const name = fbUser.displayName || email.split("@")[0];
        const invitedRole = inviteSnap.data().role || "player";
        // The invite carries the team (see addInvite). A missing teamId
        // defaults to Varsity for now — TODO: the invite UI should always
        // set a team so no one silently lands on Varsity.
        const invitedTeamId = inviteSnap.data().teamId;
        const teamId = isValidTeamId(invitedTeamId) ? invitedTeamId : DEFAULT_TEAM_ID;
        await setDoc(ref, {
          name,
          email,
          role: invitedRole,
          teamIds: [teamId],
          primaryTeamId: teamId,
          initials: initialsFrom(name),
        });
        snap = await getDoc(ref);
      }

      const data = snap.data();
      // Backfill: users created before teams existed get their team fields.
      // A missing teamId defaults to Varsity (same TODO as above). NOTE: the
      // rules let ONLY the org admin write teamIds/primaryTeamId on someone
      // else's doc, so this attempt is denied for anyone else — the try/catch
      // below falls back to the in-memory values, which is all a fresh
      // Brophy user needs (every doc is created with its teams).
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
