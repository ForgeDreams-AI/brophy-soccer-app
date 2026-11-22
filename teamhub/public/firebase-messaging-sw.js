/* eslint-disable no-undef */
// Service worker for Firebase Cloud Messaging — shows pushes when the app is
// closed or in the background, WhatsApp-style:
//  - chat / DM messages stack into ONE notification per chat (same `tag`):
//    "Varsity chat (3 messages)" with the latest "Sender: message" lines
//  - the app icon badge counts unread chat messages (setAppBadge)
//  - tapping opens the right tab
// The server sends data-only messages: { title, body, line, group, link, tag, kind }.
// NOTE: the config below must match src/firebase.js (Brophy project).

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

// ── Badge count (unread chat messages), kept in the Cache Storage so it
// survives the worker being stopped. The app resets it to the real unread
// count whenever it's open (postMessage {type:"badge", count}).
const BADGE_KEY = "/__badge";
async function getBadge() {
  try { const c = await caches.open("brophy-meta"); const r = await c.match(BADGE_KEY); return r ? Number(await r.text()) || 0 : 0; } catch { return 0; }
}
async function setBadge(n) {
  try { const c = await caches.open("brophy-meta"); await c.put(BADGE_KEY, new Response(String(Math.max(0, n)))); } catch { /* ignore */ }
  try { if (n > 0) await self.navigator.setAppBadge?.(n); else await self.navigator.clearAppBadge?.(); } catch { /* not supported */ }
}

const MAX_LINES = 5;

messaging.onBackgroundMessage(async (payload) => {
  // Old-style messages with a `notification` block are shown by FCM itself.
  if (payload.notification) return;
  const d = payload.data || {};
  const isChat = d.kind === "chat" || d.kind === "dms";
  let title = d.title || "Brophy Soccer";
  let body = d.body || "";
  let lines = [];
  if (isChat && d.tag) {
    // Stack onto this chat's existing notification (like WhatsApp).
    const existing = await self.registration.getNotifications({ tag: d.tag });
    const prev = existing[0]?.data?.lines || [];
    lines = [...prev, d.line || body].slice(-50);
    const count = lines.length;
    title = count > 1 ? `${d.group || title} (${count} messages)` : (d.group || title);
    body = lines.slice(-MAX_LINES).join("\n");
    await setBadge((await getBadge()) + 1);
  }
  await self.registration.showNotification(title, {
    body,
    icon: "/brand/favicon.png",
    badge: "/brand/favicon.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag), // buzz again for each new message in a stack
    data: { link: d.link || "/", lines, tag: d.tag || "" },
  });
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "badge") setBadge(Number(event.data.count) || 0);
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
