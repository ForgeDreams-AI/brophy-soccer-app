// Tracks whether live Firestore snapshots are arriving from the server or
// only from the offline cache, so the header can show "Reconnecting..."
// when the stream has gone quiet instead of silently showing stale data.
// A snapshot from cache is normal for the first second of a load (the cache
// answers first, the server follows), so it only counts as stale when no
// server snapshot has arrived for a few seconds.
const STALE_AFTER_MS = 3000;

let lastServerAt = 0;
let cacheSeenAt = 0;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function reportSnapshot(fromCache) {
  if (fromCache) {
    if (!cacheSeenAt) cacheSeenAt = Date.now();
  } else {
    lastServerAt = Date.now();
    cacheSeenAt = 0;
  }
  notify();
}

export function isFirestoreStale(now = Date.now()) {
  return cacheSeenAt > 0 && now - lastServerAt > STALE_AFTER_MS;
}

export function subscribeFirestoreHealth(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
