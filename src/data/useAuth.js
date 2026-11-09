import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { COL } from "./collections";

const initialsFrom = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Session + profile. First-time sign-ins are gated on the invites collection
// so only rostered emails get a usable session; the role comes from the
// invite record. `sub` is derived from the role generically — never
// hard-code team-specific subtitles here (they belong in theme/teams.js).
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
      const ref = doc(db, COL.users, fbUser.uid);
      let snap = await getDoc(ref);

      if (!snap.exists()) {
        // First-time sign-in. Gate on invitedEmails so randos can't join.
        const email = (fbUser.email || "").toLowerCase();
        const inviteSnap = await getDoc(doc(db, COL.invites, email));
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
        await setDoc(ref, {
          name,
          email,
          role: invitedRole,
          initials: initialsFrom(name),
        });
        snap = await getDoc(ref);
      }

      const data = snap.data();
      setError("");
      setUser({
        uid: fbUser.uid,
        name: data.name,
        email: data.email,
        role: data.role || "player",
        initials: data.initials || initialsFrom(data.name || ""),
        photoURL: data.photoURL || "",
        photoPath: data.photoPath || "",
        sub: data.role === "admin" ? "Head Coach" : "Player",
      });
      setLoading(false);
    });
  }, []);

  const clearError = () => setError("");
  return { user, loading, error, clearError };
}
