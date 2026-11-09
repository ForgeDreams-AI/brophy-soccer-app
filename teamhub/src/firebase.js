import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCInEIJ0wl589Zy8kiJeuH1l9y3uR2ItOY",
  authDomain: "phoenix-mens-soccer.firebaseapp.com",
  projectId: "phoenix-mens-soccer",
  storageBucket: "phoenix-mens-soccer.firebasestorage.app",
  messagingSenderId: "127145444694",
  appId: "1:127145444694:web:6439ca19555d9478eb82f7",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline-capable Firestore: recently-viewed data stays available offline and
// writes queue + sync on reconnect (multi-tab safe). Falls back gracefully if
// persistence can't initialize (e.g. unsupported browser / private mode).
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return initializeFirestore(app, {});
  }
})();
export const storage = getStorage(app);
// Messaging is only available in browser environments that support service
// workers (most modern browsers; not all SSR contexts).
export const messaging = (() => {
  try { return typeof window !== "undefined" ? getMessaging(app) : null; }
  catch { return null; }
})();
