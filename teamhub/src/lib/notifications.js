// Web push notifications via Firebase Cloud Messaging.
// The VAPID *public* key is generated in the Brophy Firebase console
// (Project Settings → Cloud Messaging → Web Push certificates) and set as
// VITE_FIREBASE_VAPID_KEY in .env (gitignored) and as a build secret on
// Cloudflare Pages (see .env.example). The key is public by design — it
// ships in every browser bundle — but it belongs to the Brophy project:
// the old Phoenix College key was removed in the §11 rebrand and there is
// NO fallback here. Until the Brophy key is set, push stays unconfigured
// and enablePushNotifications throws a clear error.

import { getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { messaging, db } from "../firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

export const notificationsSupported = () =>
  typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && messaging;

export const currentPermission = () =>
  typeof Notification === "undefined" ? "default" : Notification.permission;

// Request permission, register the service worker, fetch + persist the FCM
// token to the user's profile. Returns the token, or null if blocked.
export async function enablePushNotifications(uid) {
  if (!notificationsSupported()) throw new Error("Your browser doesn't support push notifications.");
  if (!VAPID_KEY) throw new Error("Push notifications aren't configured yet (missing VAPID key).");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications were blocked. Re-enable them in your browser's site settings."
      : "Permission not granted.");
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Couldn't get a push token from FCM.");

  await updateDoc(doc(db, "users", uid), {
    fcmTokens: arrayUnion(token),
    notificationsEnabledAt: new Date().toISOString(),
  });

  return token;
}

export async function disablePushNotifications(uid, token) {
  if (!token) return;
  await updateDoc(doc(db, "users", uid), {
    fcmTokens: arrayRemove(token),
  });
}

// Clear every device's token for this user (used by the "Off" toggle in
// Settings — Cloud Function has nothing to send to even though the browser
// permission technically remains granted).
export async function clearAllPushTokens(uid) {
  await updateDoc(doc(db, "users", uid), { fcmTokens: [] });
}

// Foreground messages (app is open). We show our own toast/notification.
export function onForegroundMessage(handler) {
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
