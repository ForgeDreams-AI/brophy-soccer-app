import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

// Per-deployment Firebase config. Defaults are the Phoenix deployment
// (project phoenix-mens-soccer — locked: Phoenix keeps its own project,
// deployment, and domain). White-label deployments inject their own project
// via VITE_FIREBASE_* env vars (Cloudflare Pages → Environment variables)
// with zero code changes; the theme layer (src/theme/teams.js) handles
// branding separately.
const env = (k, fallback) => import.meta.env?.[k] || fallback;

const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY", "AIzaSyCInEIJ0wl589Zy8kiJeuH1l9y3uR2ItOY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN", "phoenix-mens-soccer.firebaseapp.com"),
  projectId: env("VITE_FIREBASE_PROJECT_ID", "phoenix-mens-soccer"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET", "phoenix-mens-soccer.firebasestorage.app"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID", "127145444694"),
  appId: env("VITE_FIREBASE_APP_ID", "1:127145444694:web:6439ca19555d9478eb82f7"),
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
