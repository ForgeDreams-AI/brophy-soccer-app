// Calendar data hook — owns every read and write for the schedule feature.
// Every doc carrying `visibleTo` gets `audienceKeys` stamped at write time
// via lib/audience (the security boundary); the UI only authors `visibleTo`.
// Group membership changes re-resolve audienceKeys across every addressed
// event/chatGroup in a single batched write so visibility tracks membership.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { COL, personalEvents as personalEventsPath } from "../../data/collections";
import { useAudienceCollection, useCollection } from "../../data/hooks";
import { audienceKeysFor, withAudienceKeys } from "../../lib/audience";
import { restampGroupAudience } from "../../data/groups";

export function useCalendar(user) {
  // Team events, audience-scoped (players only receive docs addressed to
  // them; admins read the whole collection).
  const events = useAudienceCollection(COL.events, user);
  const personalEvents = useCollection(personalEventsPath(user?.uid));
  const groups = useCollection(COL.groups);
  const allUsers = useCollection(COL.users);
  const invites = useCollection(COL.invites);
  const practices = useCollection(COL.practices, orderBy("createdAt", "desc"));
  const teamWorkouts = useCollection(COL.teamWorkouts, orderBy("createdAt", "desc"));
  const chatGroups = useCollection(COL.chatGroups);

  // ── Team events ───────────────────────────────────────────────────────
  // addEvent always stamps audienceKeys (absent visibleTo = everyone).
  const addEvent = (data) =>
    addDoc(collection(db, COL.events), {
      ...data,
      audienceKeys: audienceKeysFor(data.visibleTo ?? null, groups),
      createdAt: serverTimestamp(),
    });
  // updateEvent only stamps when the patch carries visibleTo.
  const updateEvent = (id, data) =>
    updateDoc(doc(db, COL.events, id), withAudienceKeys(data, groups));
  const deleteEvent = (id) => deleteDoc(doc(db, COL.events, id));

  const importEvents = async (rows, { notify = true } = {}) => {
    const batch = writeBatch(db);
    rows.forEach((r) =>
      batch.set(doc(collection(db, COL.events)), {
        ...r,
        audienceKeys: audienceKeysFor(null, groups),
        createdAt: serverTimestamp(),
        ...(notify ? {} : { notify: false }),
      }),
    );
    await batch.commit();
  };

  // ── Personal events (users/{uid}/personalEvents) — owner only ─────────
  const path = personalEventsPath(user?.uid);
  const addPersonalEvent = (data) =>
    addDoc(collection(db, path), { ...data, createdAt: serverTimestamp() });
  const updatePersonalEvent = (id, data) => updateDoc(doc(db, path, id), data);
  const deletePersonalEvent = (id) => deleteDoc(doc(db, path, id));

  // ── Groups ────────────────────────────────────────────────────────────
  const addGroup = (name) =>
    addDoc(collection(db, COL.groups), {
      name: String(name || "").trim(),
      memberUids: [],
      createdBy: user?.name || "",
      createdAt: serverTimestamp(),
    });

  const updateGroupMembers = async (id, memberUids) => {
    await updateDoc(doc(db, COL.groups, id), { memberUids });
    // Re-resolve audienceKeys on every doc addressed to this group so
    // server-side visibility tracks the new membership (shared helper also
    // sweeps chat messages, assignments, nutrition targets, scheduled sends).
    const nextGroups = groups.map((g) => (g.id === id ? { ...g, memberUids } : g));
    await restampGroupAudience(db, id, nextGroups, {
      [COL.events]: events,
      [COL.chatGroups]: chatGroups,
    });
  };
  const deleteGroup = (id) => deleteDoc(doc(db, COL.groups, id));

  return {
    events,
    personalEvents,
    groups,
    allUsers,
    invites,
    practices,
    teamWorkouts,
    chatGroups,
    addEvent,
    updateEvent,
    deleteEvent,
    importEvents,
    addPersonalEvent,
    updatePersonalEvent,
    deletePersonalEvent,
    addGroup,
    updateGroupMembers,
    deleteGroup,
  };
}
