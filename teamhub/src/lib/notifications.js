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
  rememberDeviceToken(token);

  return token;
}

// This device's FCM token, remembered at enable time so "Turn off" and
// sign-out remove ONLY this device (other phones keep their pushes).
const DEVICE_TOKEN_KEY = "brophy_fcm_token";
function rememberDeviceToken(token) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* private mode */ }
}
export function deviceToken() {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY) || ""; } catch { return ""; }
}
function forgetDeviceToken() {
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* private mode */ }
}

// Push is "on" for this device when permission is granted AND this
// device's token was saved (permission alone stays granted after Off).
export const pushEnabledOnThisDevice = () =>
  currentPermission() === "granted" && Boolean(deviceToken());

// Remove THIS device's token (Settings "Off" toggle, and sign-out so a
// shared phone stops receiving the previous user's pushes). Other devices
// of the same user keep theirs.
export async function disablePushOnThisDevice(uid) {
  const token = deviceToken();
  forgetDeviceToken();
  if (!uid || !token) return;
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(token) });
}

// Keep this device's push token fresh. FCM can rotate a token (browser or
// service-worker updates); a stale token means silent, missed pushes. On each
// app open (when push is on here) fetch the current token and save it if it
// changed — or once a day anyway, in case it was pruned server-side.
const LAST_SYNC_KEY = "brophy_fcm_synced_at";
export async function refreshPushToken(uid) {
  if (!uid || !notificationsSupported() || !VAPID_KEY || !pushEnabledOnThisDevice()) return;
  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return;
    const old = deviceToken();
    let last = 0;
    try { last = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0; } catch { /* private mode */ }
    if (token === old && Date.now() - last < 24 * 3600 * 1000) return;
    const patch = { fcmTokens: arrayUnion(token) };
    await updateDoc(doc(db, "users", uid), patch);
    if (old && old !== token) await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(old) });
    rememberDeviceToken(token);
    try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch { /* private mode */ }
  } catch (e) {
    console.warn("push token refresh failed:", e?.message || e);
  }
}

// iPhone/iPad: web push only works once the app is added to the Home Screen
// and opened from that icon (iOS 16.4+).
export const isIOS = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () => typeof window !== "undefined"
  && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator?.standalone === true);

// Foreground messages (app is open). The app shows its own in-app banner
// (phones don't allow new Notification() from a page).
export function onForegroundMessage(handler) {
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
