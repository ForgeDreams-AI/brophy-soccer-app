// Home feature data hooks. Per the feature contract (rule 5), every Firestore
// write for the home feature lives here — components call these hooks and
// never write directly. Collection names come from COL (never hard-coded).
import { useCallback, useMemo } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { COL, foodEntries } from "../../data/collections";
import { useCollection, useAudienceCollection } from "../../data/hooks";
import { todayKey, formatDayKey, formatAgo } from "../../lib/dates";
import { withAudienceKeys } from "../../lib/audience";
import { restampGroupAudience } from "../../data/groups";

// ── Coach profile-update prompt ─────────────────────────────────────────────
// appConfig/profilePrompt: { requestedAt (ISO), byName }. The player page
// compares requestedAt against the localStorage "profilePromptSeen" key.
export function useProfilePrompt() {
  const docs = useCollection(COL.appConfig);
  const prompt = useMemo(
    () => docs.find((d) => d.id === "profilePrompt") || null,
    [docs],
  );
  return { requestedAt: prompt?.requestedAt || null, byName: prompt?.byName || "" };
}

// ── Today's events (hero card) + next upcoming event ─────────────────────────
export function useTodaysEvents(user) {
  const key = todayKey();
  const events = useAudienceCollection(COL.events, user);
  return useMemo(
    () =>
      events
        .filter((e) => e.date === key)
        .sort((a, b) => (a.start || "").localeCompare(b.start || "")),
    [events, key],
  );
}

export function useNextEvent(user) {
  const key = todayKey();
  const events = useAudienceCollection(COL.events, user);
  return useMemo(() => {
    const future = events.filter((e) => e.date > key);
    future.sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
    return future[0] || null;
  }, [events, key]);
}

// ── Coach note: pinned announcements first ───────────────────────────────────
// Announcements carry no audienceKeys (shape preserved from v1) and the rules
// let any signed-in member read them — plain listener, not audience-scoped
// (an audience query would silently return zero docs for players).
// eslint-disable-next-line no-unused-vars
export function useTopAnnouncement(_user) {
  const items = useCollection(COL.announcements, orderBy("createdAt", "desc"));
  return useMemo(() => {
    const sorted = [...items].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return sorted[0] || null;
  }, [items]);
}

// ── Player self check-in (attendance merge) ──────────────────────────────────
// One doc per day: attendance/{dateKey} with a `statuses` map keyed by email.
// Players write ONLY their own status (rules allow that); coach writes any.
export function useMyAttendance(user) {
  const key = todayKey();
  const docs = useCollection(
    user ? COL.attendance : null,
    where("date", "==", key),
  );
  const status = user ? docs[0]?.statuses?.[user.email] || "" : "";

  const setStatus = useCallback(
    (next) =>
      setDoc(
        doc(db, COL.attendance, key),
        {
          date: key,
          statuses: { [user.email]: next },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    [user, key],
  );

  return { status, setStatus };
}

// ── Assignments due today + mark-complete toggle ─────────────────────────────
// completedBy is a map: { [uid]: { name, ts } } — toggling off deletes the key.
export function useTodaysAssignments(user) {
  const key = todayKey();
  const all = useAudienceCollection(COL.assignments, user);
  const todays = useMemo(
    () => all.filter((a) => a.date === key),
    [all, key],
  );

  const toggleDone = useCallback(
    (id, done) =>
      updateDoc(doc(db, COL.assignments, id), {
        [`completedBy.${user.uid}`]: done
          ? { name: user.name || "", ts: new Date().toISOString() }
          : deleteField(),
      }),
    [user],
  );

  return { assignments: todays, toggleDone };
}

export function useTeamWorkouts() {
  return useCollection(COL.teamWorkouts);
}

// ── Water — one doc per player per day: water/{uid}_{dateKey} { cups } ───────
export function useWater(user) {
  const key = todayKey();
  const uid = user?.uid || null;
  const rows = useCollection(
    uid ? COL.water : null,
    where("uid", "==", uid || "_"),
    where("date", "==", key),
  );
  const cups = rows[0]?.cups || 0;

  const setCups = useCallback(
    (next) =>
      setDoc(
        doc(db, COL.water, `${uid}_${key}`),
        { uid, date: key, cups: Math.max(0, next), updatedAt: serverTimestamp() },
        { merge: true },
      ),
    [uid, key],
  );

  return { cups, setCups };
}

// ── Nutrition target (coach-set) + today's logged totals for this player ─────
// Targets are read by everyone (rules) and filtered client-side against
// visibleTo — plain listener, not audience-scoped, so this keeps working
// whether or not target docs carry audienceKeys.
export function useMyNutrition(user) {
  const targets = useCollection(COL.nutritionTargets, orderBy("createdAt"));
  const entries = useCollection(
    user ? foodEntries(user.uid) : null,
  );

  const target = useMemo(() => {
    if (!targets.length) return null;
    const specific = targets.find(
      (t) => (t.visibleTo?.emails?.length || 0) + (t.visibleTo?.groupIds?.length || 0) > 0,
    );
    return specific || targets[0];
  }, [targets]);

  const totals = useMemo(() => {
    const key = todayKey();
    return entries
      .filter((l) => formatDayKey(l.createdAt) === key)
      .reduce(
        (a, l) => ({
          cal: a.cal + (Number(l.cal) || 0),
          protein: a.protein + (Number(l.p) || 0),
        }),
        { cal: 0, protein: 0 },
      );
  }, [entries]);

  const loggedToday = entries.some((l) => formatDayKey(l.createdAt) === todayKey());

  return { target, totals, loggedToday };
}

// ── Documents (player mode: read-only list + e-sign) ──────────────────────────
// signatures is an array of { uid, name, ts }; signing appends via arrayUnion.
// NOTE: documents carry no audienceKeys (shape preserved from v1) and the
// rules allow any signed-in member to read them — so this is a plain
// full-collection listener, not an audience-scoped one (audience filtering
// would silently return zero docs for players).
export function useDocuments(user) {
  const docs = useCollection(COL.documents, orderBy("createdAt", "desc"));

  const sign = useCallback(
    (id, name) =>
      updateDoc(doc(db, COL.documents, id), {
        signatures: arrayUnion({
          uid: user.uid,
          name: (name || "").trim(),
          ts: new Date().toISOString(),
        }),
      }),
    [user],
  );

  const hasSigned = useCallback(
    (d) => (d.signatures || []).some((s) => s.uid === user?.uid),
    [user],
  );

  return { documents: docs, sign, hasSigned };
}

// Short type badge (PDF / DOC / PPT / XLS / IMG …) derived from filename or MIME.
export const docTypeLabel = (d) => {
  const src = (d.name || d.path || d.title || "").toLowerCase();
  const ext = (src.match(/\.([a-z0-9]+)(?:\?|$)/) || [])[1] || "";
  const ft = (d.fileType || "").toLowerCase();
  const byExt = {
    pdf: "PDF", doc: "DOC", docx: "DOC", rtf: "DOC", txt: "TXT", odt: "DOC", pages: "DOC",
    ppt: "PPT", pptx: "PPT", key: "KEY", odp: "PPT",
    xls: "XLS", xlsx: "XLS", csv: "CSV", numbers: "XLS", ods: "XLS",
    jpg: "IMG", jpeg: "IMG", png: "IMG", gif: "IMG", webp: "IMG", heic: "IMG", heif: "IMG", svg: "IMG",
  };
  if (byExt[ext]) return byExt[ext];
  if (ft.includes("pdf")) return "PDF";
  if (ft.startsWith("image/")) return "IMG";
  if (ft.includes("word")) return "DOC";
  if (ft.includes("presentation") || ft.includes("powerpoint")) return "PPT";
  if (ft.includes("sheet") || ft.includes("excel")) return "XLS";
  return "FILE";
};

// ── Coach home data (HomePage.jsx) ─────────────────────────────────────────
// `useHomeData(user)` aggregates every Firestore read the coach dashboard
// needs plus all of its writes (contract rule 5). Doc shapes preserved from
// v1; any doc carrying `visibleTo` stamps `audienceKeys` via withAudienceKeys
// at write time (contract rule 9). "Today" keys always come from todayKey()
// (LOCAL tz), never from UTC slicing.

export function useHomeData(user) {
  const uid = user?.uid;
  const admin = user?.role === "admin";
  const today = todayKey();

  // ── Reads ──
  const announcements = useCollection(COL.announcements, orderBy("createdAt", "desc"));
  // Full event set for the coach (audience-filtered for players): drives the
  // Next Up hero + the "You're running" delegated sessions.
  const eventsRaw = useAudienceCollection(COL.events, user);
  const practices = useCollection(COL.practices, orderBy("createdAt", "desc"));
  const wellnessRaw = useCollection(COL.wellness, where("date", "==", today));
  const wellness = useMemo(
    () => wellnessRaw.map((w) => ({ ...w, time: formatAgo(w.updatedAt) })),
    [wellnessRaw],
  );
  const invites = useCollection(COL.invites, orderBy("email"));
  const groups = useCollection(COL.groups, orderBy("name"));
  const documents = useCollection(COL.documents, orderBy("createdAt", "desc"));
  const attendanceDocs = useCollection(COL.attendance, where("date", "==", today));
  const attendance = attendanceDocs[0]?.statuses || {};
  const attendanceHistory = useCollection(COL.attendance, orderBy("date", "desc"), limit(60));
  // Coach reads everyone's reasons; a player reads only their own (rules).
  const allAbsenceReasons = useCollection(
    admin ? COL.attendanceReasons : null,
    orderBy("date", "desc"),
    limit(300),
  );
  const myAbsenceReasons = useCollection(
    !admin && uid ? COL.attendanceReasons : null,
    where("uid", "==", uid || "__none__"),
  );
  const assignments = useCollection(COL.assignments, orderBy("date"));
  const teamWorkouts = useCollection(COL.teamWorkouts, orderBy("updatedAt", "desc"));
  // Admin-only: resolves invite emails → display names. Deferred until the
  // user is known + actually an admin (rules deny otherwise).
  const allUsers = useCollection(admin ? COL.users : null, orderBy("name"));
  const mealLogActivityToday = useCollection(
    admin ? COL.mealActivity : null,
    where("date", "==", today),
  );
  const quotes = useCollection(COL.quotes, orderBy("createdAt", "desc"));
  const todayQuote = quotes[0] || null;

  const nameByEmail = useMemo(
    () =>
      Object.fromEntries(
        (allUsers || []).filter((u) => u.email).map((u) => [u.email, u.name]),
      ),
    [allUsers],
  );

  // Reasons recorded for today's absences, keyed by email (coach view).
  const reasonsToday = useMemo(() => {
    const m = {};
    (allAbsenceReasons || []).forEach((r) => {
      if (r.date === today && r.email) m[r.email] = r.reason;
    });
    return m;
  }, [allAbsenceReasons, today]);

  // Dates this player was marked absent but hasn't explained yet — oldest
  // first, so the forced prompt clears them in order. Empty for coaches.
  const unexplainedAbsences = useMemo(() => {
    if (!user || admin) return [];
    const email = (user.email || "").toLowerCase();
    const answered = new Set(myAbsenceReasons.map((r) => r.date));
    return attendanceHistory
      .filter((d) => d.statuses && d.statuses[email] === "absent" && !answered.has(d.date))
      .map((d) => d.date)
      .sort();
  }, [user, admin, myAbsenceReasons, attendanceHistory]);

  // ── Writes ──
  const byName = user?.name || "";

  // Announcements — shape { title, body, pinned, createdAt }.
  const addAnnouncement = (title, body) =>
    addDoc(collection(db, COL.announcements), {
      title: (title || "").trim(),
      body: (body || "").trim(),
      pinned: false,
      createdAt: serverTimestamp(),
    });
  const updateAnnouncement = (id, { title, body }) =>
    updateDoc(doc(db, COL.announcements, id), {
      title: (title || "").trim(),
      body: (body || "").trim(),
    });
  const togglePinAnnouncement = (id, pinned) =>
    updateDoc(doc(db, COL.announcements, id), { pinned: !pinned });
  const deleteAnnouncement = (id) => deleteDoc(doc(db, COL.announcements, id));

  // One app-wide prompt ("everyone update your profile"). One doc per kind;
  // reuses the announcement fan-out so it also lands as a push to everyone.
  const requestProfileUpdate = async () => {
    await setDoc(
      doc(db, COL.appConfig, "profilePrompt"),
      { requestedAt: new Date().toISOString(), byName },
      { merge: true },
    );
    await addAnnouncement(
      "Update your profile",
      "Please add your full name so the team roster shows who's who. Tap Update now or open Settings.",
    );
  };

  // Roster (invite gate) — docs { email, role, addedBy, addedAt }, id = email.
  const addInvite = (email) => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return Promise.reject(new Error("Invalid email."));
    return setDoc(doc(db, COL.invites, e), {
      email: e,
      role: "player",
      addedBy: byName,
      addedAt: serverTimestamp(),
    });
  };
  const removeInvite = (email) => deleteDoc(doc(db, COL.invites, email));
  const addInvitesBatch = async (emails) => {
    const batch = writeBatch(db);
    emails.forEach((e) => {
      batch.set(doc(db, COL.invites, e), {
        email: e,
        role: "player",
        addedBy: byName,
        addedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  };
  // Toggles a roster entry between player and admin. Updates the invite doc
  // (controls role for future first-sign-ins) AND any existing users doc with
  // that email (changes role for already-signed-up players immediately).
  // Self-demotion is blocked.
  const setInviteRole = async (email, nextRole) => {
    if (email === user.email && nextRole !== "admin") {
      throw new Error("You can't demote yourself.");
    }
    await updateDoc(doc(db, COL.invites, email), { role: nextRole });
    const snap = await getDocs(
      query(collection(db, COL.users), where("email", "==", email)),
    );
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { role: nextRole })));
  };

  // Groups — docs { name, memberUids[], createdBy, createdAt }.
  const addGroup = (name) =>
    addDoc(collection(db, COL.groups), {
      name: name.trim(),
      memberUids: [],
      createdBy: byName,
      createdAt: serverTimestamp(),
    });
  const updateGroupMembers = async (id, memberUids) => {
    await updateDoc(doc(db, COL.groups, id), { memberUids });
    // Re-resolve audienceKeys on every doc addressed to this group so
    // server-side visibility tracks the new membership (shared helper also
    // sweeps chat messages, nutrition targets, and scheduled sends).
    const nextGroups = groups.map((g) => (g.id === id ? { ...g, memberUids } : g));
    await restampGroupAudience(db, id, nextGroups, {
      [COL.events]: eventsRaw,
      [COL.assignments]: assignments,
    });
  };
  const deleteGroup = (id) => deleteDoc(doc(db, COL.groups, id));

  // Team documents + e-sign — docs { title, url, name, path, fileType,
  // createdByName, signatures[], createdAt }. Files live in Storage
  // `documents/{uid}/{ts}-{filename}`.
  const addDocument = async ({ title, file }) => {
    if (!file) throw new Error("No file selected.");
    const path = `documents/${uid}/${Date.now()}-${file.name}`;
    const snap = await uploadBytes(storageRef(storage, path), file, {
      contentType: file.type || "application/octet-stream",
    });
    const url = await getDownloadURL(snap.ref);
    return addDoc(collection(db, COL.documents), {
      title: (title || "").trim() || file.name,
      url,
      path,
      name: file.name || "",
      fileType: file.type || "",
      createdByName: byName,
      signatures: [],
      createdAt: serverTimestamp(),
    });
  };
  const deleteDocument = (id) => deleteDoc(doc(db, COL.documents, id));
  const signDocument = (id, name) =>
    updateDoc(doc(db, COL.documents, id), {
      signatures: arrayUnion({ uid, name, ts: new Date().toISOString() }),
    });

  // Daily attendance — one doc per day (id = date) with a `statuses` map
  // keyed by email. The merge only touches the given email's key.
  const setAttendanceStatus = (email, status) =>
    setDoc(
      doc(db, COL.attendance, today),
      { date: today, statuses: { [email]: status }, updatedAt: serverTimestamp() },
      { merge: true },
    );

  // Absence reasons — doc id `${date}__${uid}`, shape { date, uid, email,
  // name, reason, createdAt }.
  const submitAbsenceReason = (date, reason) =>
    setDoc(
      doc(db, COL.attendanceReasons, `${date}__${uid}`),
      {
        date,
        uid,
        email: (user.email || "").toLowerCase(),
        name: byName,
        reason: (reason || "").trim(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

  // Assignments — docs { title, workoutId, workoutName, body, link, date,
  // visibleTo, audienceKeys, completedBy, createdByUid, createdByName,
  // createdAt }.
  const addAssignment = ({ title, workoutId, workoutName, body, link, date, visibleTo }) =>
    addDoc(
      collection(db, COL.assignments),
      withAudienceKeys(
        {
          title: (title || workoutName || "Workout").trim(),
          workoutId: workoutId || "",
          workoutName: workoutName || "",
          body: (body || "").trim(),
          link: (link || "").trim(),
          date: date || today,
          visibleTo: visibleTo || { groupIds: [], emails: [] },
          completedBy: {},
          createdByUid: uid,
          createdByName: byName,
          createdAt: serverTimestamp(),
        },
        groups,
      ),
    );
  const deleteAssignment = (id) => deleteDoc(doc(db, COL.assignments, id));

  // Quote of the day — docs { text, author, createdByName, createdAt }.
  // A Cloud Function fans each post out as a team push notification.
  const addQuote = ({ text, author }) =>
    addDoc(collection(db, COL.quotes), {
      text,
      author: author || "",
      createdByName: byName,
      createdAt: serverTimestamp(),
    });

  return {
    // streams
    announcements,
    eventsRaw,
    practices,
    wellness,
    invites,
    groups,
    documents,
    attendance,
    attendanceHistory,
    allAbsenceReasons,
    myAbsenceReasons,
    assignments,
    teamWorkouts,
    allUsers,
    mealLogActivityToday,
    todayQuote,
    nameByEmail,
    reasonsToday,
    unexplainedAbsences,
    // actions
    addAnnouncement,
    updateAnnouncement,
    togglePinAnnouncement,
    deleteAnnouncement,
    requestProfileUpdate,
    addInvite,
    removeInvite,
    addInvitesBatch,
    setInviteRole,
    addGroup,
    updateGroupMembers,
    deleteGroup,
    addDocument,
    deleteDocument,
    signDocument,
    setAttendanceStatus,
    submitAbsenceReason,
    addAssignment,
    deleteAssignment,
    addQuote,
  };
}
