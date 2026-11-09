/* eslint-disable no-undef */
// Service worker for Firebase Cloud Messaging — handles background pushes
// when the app tab is closed or unfocused.
// NOTE: the config below must match src/firebase.js (Brophy project).
// It was still pointing at the old Phoenix College project until §11.

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCsKiTGtjJmh9tCHCPQ82oUFLXnUcpUy6Q",
  authDomain: "brophy-soccer-app.firebaseapp.com",
  projectId: "brophy-soccer-app",
  storageBucket: "brophy-soccer-app.firebasestorage.app",
  messagingSenderId: "134702834848",
  appId: "1:134702834848:web:dc2c53a34cc542633995c5",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(notif.title || "Brophy Soccer", {
    body: notif.body || "",
    icon: "/brand/logo.png",
    badge: "/brand/logo.png",
    tag: data.tag || undefined,
    data,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        c.postMessage({ type: "deeplink", link });
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(link);
  })());
});
