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

// Full re-subscribe generation. Bumping it tears down and re-creates every
// onSnapshot listener at once (the hooks in useCollection.js read it with
// useSyncExternalStore and list it in their effect deps). This is the piece
// a network cycle alone cannot do: once the SDK has terminated a listener
// with an error, disableNetwork/enableNetwork will not bring it back.
// Only a fresh onSnapshot call re-attaches it. The generation bump is what
// makes a foreground return actually recover a dead stream instead of just
// restarting a healthy one.
let resyncGen = 0;
const resyncListeners = new Set();

export function getResyncGeneration() {
  return resyncGen;
}

export function subscribeResyncGeneration(fn) {
  resyncListeners.add(fn);
  return () => { resyncListeners.delete(fn); };
}

export function requestFullResync() {
  resyncGen += 1;
  resyncListeners.forEach((fn) => fn());
}
