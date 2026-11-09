// Settings data layer — every Firestore/Storage write for this feature goes
// through these hooks (contract rule 5). Doc shapes preserved from v1.

import { doc, updateDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { COL } from "../../data/collections";
import { downscaleImage } from "../../lib/images";

// initialsOf — v1 behavior: first letters of the first two words, uppercased.
export const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function useSettingsActions(user) {
  const uid = user?.uid;

  // Save a new display name (+ auto-derived initials) to users/{uid}.
  const saveName = async (name) => {
    await updateDoc(doc(db, COL.users, uid), {
      name,
      initials: initialsOf(name),
    });
  };

  // Downscale to 640px JPEG, upload to avatars/{uid}/{ts}.jpg, persist
  // photoURL + photoPath on the user doc. Returns the download URL.
  const uploadPhoto = async (file) => {
    const { blob } = await downscaleImage(file, { maxDim: 640, quality: 0.85 });
    const path = `avatars/${uid}/${Date.now()}.jpg`;
    const snap = await uploadBytes(storageRef(storage, path), blob, {
      contentType: "image/jpeg",
    });
    const url = await getDownloadURL(snap.ref);
    await updateDoc(doc(db, COL.users, uid), { photoURL: url, photoPath: path });
    return url;
  };

  // Write a feedback doc — shape preserved from v1.
  const sendFeedback = async (text) => {
    await addDoc(collection(db, COL.feedback), {
      text,
      fromUid: uid,
      fromName: user?.name || "",
      fromEmail: user?.email || "",
      role: user?.role || "player",
      createdAt: serverTimestamp(),
    });
  };

  return { saveName, uploadPhoto, sendFeedback };
}
