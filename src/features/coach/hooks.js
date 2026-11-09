// Coach feature — data hooks. Every Firestore read and write for the
// Coach Center (drills, practices, programs, line-ups, calendar assignment,
// chat line-up posts) lives here. Components call useCoachData(user) and
// never touch Firestore or Storage directly.
//
// Per CONTRACT hard rule 5, every Firestore write goes through these
// wrappers; docs carrying `visibleTo` stamp `audienceKeys` via
// withAudienceKeys/audienceKeysFor at write time.

import { useMemo } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { COL } from "../../data/collections";
import { useCollection } from "../../data/hooks";
import { audienceKeysFor } from "../../lib/audience";
import { downscaleImage } from "../../lib/images";

const rand = () => Math.random().toString(36).slice(2, 8);

// ─── Storage uploads (called from components, kept here so every write
// path lives in the feature's hooks) ──────────────────────────────────────────

// Downscaled JPEG drill photo → drills/{uid}/{ts}-{rand}.jpg
export async function uploadDrillPhoto(uid, file) {
  const { blob } = await downscaleImage(file);
  const path = `drills/${uid}/${Date.now()}-${rand()}.jpg`;
  const snap = await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
  return { url: await getDownloadURL(snap.ref), path };
}

// Rasterized tactics-board diagram (already a PNG blob from the board export)
// → drills/{uid}/{ts}-{rand}.png (PNG so it renders anywhere).
export async function uploadDrillDiagram(uid, pngBlob) {
  const path = `drills/${uid}/${Date.now()}-${rand()}.png`;
  const snap = await uploadBytes(ref(storage, path), pngBlob, { contentType: "image/png" });
  return { url: await getDownloadURL(snap.ref), path };
}

// Line-up watermark logo (512px, q0.9) → branding/{uid}/lineup-logo-{ts}.jpg
export async function uploadLineupLogoImage(uid, file) {
  const { blob } = await downscaleImage(file, { maxDim: 512, quality: 0.9 });
  const path = `branding/${uid}/lineup-logo-${Date.now()}.jpg`;
  const snap = await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
  return { url: await getDownloadURL(snap.ref), path };
}

// Player headshot (640px, q0.85), stored under the COACH's uid folder;
// association to the player happens via setPlayerPhoto below.
export async function uploadPlayerHeadshot(uid, file) {
  const { blob } = await downscaleImage(file, { maxDim: 640, quality: 0.85 });
  const path = `avatars/${uid}/${Date.now()}.jpg`;
  const snap = await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
  return { url: await getDownloadURL(snap.ref), path };
}

// ─── Feature hook ─────────────────────────────────────────────────────────────

export function useCoachData(user) {
  const drills = useCollection(COL.drills, orderBy("name"));
  const practices = useCollection(COL.practices, orderBy("createdAt", "desc"));
  const programs = useCollection(COL.programs, orderBy("createdAt", "desc"));
  const lineups = useCollection(COL.lineups, orderBy("createdAt", "desc"));
  const events = useCollection(COL.events);
  const allUsers = useCollection(COL.users);
  const invites = useCollection(COL.invites);
  const chatGroups = useCollection(COL.chatGroups);
  const groupsList = useCollection(COL.groups);
  const appConfig = useCollection(COL.appConfig);

  const lineupLogo = useMemo(
    () => appConfig.find((d) => d.id === "lineupLogo")?.url || "",
    [appConfig],
  );

  const data = useMemo(
    () => ({
      drills,
      practices,
      programs,
      lineups,
      events,
      allUsers,
      invites,
      chatGroups,
      lineupLogo,

      // ── Drills ──
      addDrill: (data) =>
        addDoc(collection(db, COL.drills), { ...data, createdAt: serverTimestamp() }),
      updateDrill: (id, data) => updateDoc(doc(db, COL.drills, id), data),
      deleteDrill: (id) => deleteDoc(doc(db, COL.drills, id)),

      // ── Practices ──
      addPractice: (data) =>
        addDoc(collection(db, COL.practices), {
          ...data,
          published: false,
          blocks: data.blocks || [],
          createdByName: user.name,
          createdAt: serverTimestamp(),
        }),
      updatePractice: (id, data) => updateDoc(doc(db, COL.practices, id), data),
      deletePractice: (id) => deleteDoc(doc(db, COL.practices, id)),

      // ── Programs ──
      addProgram: (name) =>
        addDoc(collection(db, COL.programs), {
          name,
          desc: "",
          published: false,
          days: [],
          createdByName: user.name,
          createdAt: serverTimestamp(),
        }),
      updateProgram: (id, data) => updateDoc(doc(db, COL.programs, id), data),
      deleteProgram: (id) => deleteDoc(doc(db, COL.programs, id)),

      // ── Line-ups ──
      addLineup: (data) =>
        addDoc(collection(db, COL.lineups), { ...data, createdAt: serverTimestamp() }),
      updateLineup: (id, data) => updateDoc(doc(db, COL.lineups, id), data),
      deleteLineup: (id) => deleteDoc(doc(db, COL.lineups, id)),

      // ── Calendar: batched event import (one event per program day) ──
      importEvents: async (rows, { notify = false } = {}) => {
        const batch = writeBatch(db);
        rows.forEach((r) =>
          batch.set(doc(collection(db, COL.events)), {
            ...r,
            audienceKeys: audienceKeysFor(r.visibleTo, groupsList),
            createdAt: serverTimestamp(),
            ...(notify ? {} : { notify: false }),
          }),
        );
        await batch.commit();
      },

      // ── Line-up watermark (appConfig/lineupLogo) ──
      setLineupLogo: (url, path) =>
        setDoc(
          doc(db, COL.appConfig, "lineupLogo"),
          { url: url || "", path: path || "", updatedByName: user.name },
          { merge: true },
        ),

      // ── Player headshot: updates the PLAYER's users doc ──
      setPlayerPhoto: (targetUid, url, path) =>
        updateDoc(doc(db, COL.users, targetUid), { photoURL: url, photoPath: path }),

      // ── Send a rendered line-up card to a chat channel ──
      postLineupImage: async (blob, channel, name) => {
        const ch = channel || "team";
        const path = `chat/${ch}/${user.uid}/${Date.now()}.jpg`;
        const snap = await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
        const url = await getDownloadURL(snap.ref);
        // A line-up post inherits the audience of its channel so hidden
        // channels stay private server-side; the Team channel is everyone.
        const grp = ch !== "team" ? chatGroups.find((c) => c.id === ch) : null;
        const title = name ? `Starting XI · ${name}` : "Starting XI";
        await addDoc(collection(db, COL.messages), {
          senderUid: user.uid,
          sender: user.name,
          initials: user.initials,
          text: title,
          pinned: false,
          channel: ch,
          audienceKeys: grp?.audienceKeys?.length ? grp.audienceKeys : ["*"],
          isCoach: user.role === "admin",
          readBy: { [user.uid]: serverTimestamp() },
          attachment: {
            type: "image",
            url,
            path,
            name: `${(name || "lineup").replace(/[^\w\s-]/g, "").trim() || "lineup"}.jpg`,
          },
          createdAt: serverTimestamp(),
        });
      },
    }),
    [drills, practices, programs, lineups, events, allUsers, invites, chatGroups, groupsList, lineupLogo, user],
  );

  return data;
}
