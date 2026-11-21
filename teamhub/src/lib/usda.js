// USDA FoodData Central search — through a Firestore-triggered function.
//
// The USDA API key never reaches the browser. The org blocks PUBLIC Cloud
// Functions, so instead of an HTTP endpoint the app writes a small request
// doc (foodSearches/{id} = { uid, q }) and the onFoodSearch function (an
// event trigger, not public) fetches USDA with the Secret Manager key and
// writes { foods, done } back onto that doc, which we listen for here.
//
// Any problem (offline, function not deployed, no secret, slow) just means
// no USDA results: food search still shows Open Food Facts. Never throws at
// the user.

import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const TIMEOUT_MS = 9000;
const cache = new Map(); // normalized query → foods (this page load)
let available = true;

export const usdaAvailable = () => available;

export async function searchFoods(query, signal) {
  const q = (query || "").trim().slice(0, 100);
  const key = q.toLowerCase();
  const uid = auth.currentUser?.uid;
  if (q.length < 2 || !uid || !available) return [];
  if (cache.has(key)) return cache.get(key);
  let ref;
  try {
    ref = await addDoc(collection(db, "foodSearches"), { uid, q, createdAt: serverTimestamp() });
  } catch (e) {
    if (e?.code === "permission-denied") available = false;
    return [];
  }
  return new Promise((resolve) => {
    let unsub = () => {};
    const finish = (foods) => { clearTimeout(timer); unsub(); resolve(foods); };
    const timer = setTimeout(() => finish([]), TIMEOUT_MS);
    signal?.addEventListener("abort", () => finish([]), { once: true });
    unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (!d?.done) return;
      const foods = Array.isArray(d.foods) ? d.foods : [];
      if (!d.error) cache.set(key, foods);
      finish(foods);
    }, () => finish([]));
  });
}
