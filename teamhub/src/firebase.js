import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

const SAME_SITE_AUTH_HOSTS = ["brophy-soccer-app.firebaseapp.com"];

const firebaseConfig = {
  apiKey: "AIzaSyCsKiTGtjJmh9tCHCPQ82oUFLXnUcpUy6Q",
  // Google sign-in runs its handler page on `authDomain`. When that's a
  // different site from the one the app is open on, iPhone Safari (storage
  // partitioning) loses the sign-in state: "Unable to process request due to
  // missing initial state". So use the app's own host when Google has it as
  // an authorized redirect URI (https://<host>/__/auth/handler in the OAuth
  // client — add a host here only after it's added there).
  authDomain: SAME_SITE_AUTH_HOSTS.includes(globalThis.location?.hostname) ? globalThis.location.hostname : "brophy-soccer-app.firebaseapp.com",
  projectId: "brophy-soccer-app",
  storageBucket: "brophy-soccer-app.firebasestorage.app",
  messagingSenderId: "134702834848",
  appId: "1:134702834848:web:dc2c53a34cc542633995c5",
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
