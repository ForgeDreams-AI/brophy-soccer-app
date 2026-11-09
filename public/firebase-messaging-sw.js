/* eslint-disable no-undef */
// Service worker for Firebase Cloud Messaging — handles background pushes
// when the app tab is closed or unfocused.

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCInEIJ0wl589Zy8kiJeuH1l9y3uR2ItOY",
  authDomain: "phoenix-mens-soccer.firebaseapp.com",
  projectId: "phoenix-mens-soccer",
  storageBucket: "phoenix-mens-soccer.firebasestorage.app",
  messagingSenderId: "127145444694",
  appId: "1:127145444694:web:6439ca19555d9478eb82f7",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(notif.title || "Phoenix Bears", {
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
