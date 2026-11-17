import { useCallback, useEffect, useRef, useState } from "react";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import { db } from "../firebase";
import { isFirestoreStale, subscribeFirestoreHealth } from "../lib/firestoreHealth";

// Automatic live-data recovery. The app's Firestore listeners are live
// (onSnapshot), but on iPhone the stream can die when the app is backgrounded
// and nothing re-subscribes — the offline cache then keeps showing the last
// snapshot with no error, so chat and everything else looks frozen until a
// full restart. This hook fixes that automatically: whenever the app comes
// back to the foreground after being away for a while, or the network comes
// back, it cycles the Firestore network off and on, which forces the SDK to
// drop any dead stream and re-establish every listener. No one has to tap
// anything.
//
// The 30-second away-time gate keeps rapid tab switches from churning the
// connection. `resync` is also exposed for the small manual Refresh button
// in the header — a backup only, never the main fix.
const AWAY_MS = 30 * 1000;

export function useFirestoreResync() {
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const hiddenSinceRef = useRef(null);

  const resync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await disableNetwork(db);
      await enableNetwork(db);
    } catch {
      // A failed cycle leaves the SDK as it was; the listener retry logic
      // in useCollection keeps trying in the background.
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const onHidden = () => { hiddenSinceRef.current = Date.now(); };
    const onShown = () => {
      if (document.hidden) return;
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (!hiddenSince) return; // never went away (initial load) — nothing to do
      if (Date.now() - hiddenSince < AWAY_MS) return;
      resync();
    };
    const onVisibility = () => {
      if (document.hidden) onHidden();
      else onShown();
    };
    const onOnline = () => { hiddenSinceRef.current = null; resync(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onHidden);
    window.addEventListener("focus", onShown);
    window.addEventListener("pageshow", onShown);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onHidden);
      window.removeEventListener("focus", onShown);
      window.removeEventListener("pageshow", onShown);
      window.removeEventListener("online", onOnline);
    };
  }, [resync]);

  return { resync, syncing };
}

// Subtle "Reconnecting..." state for the header. True only when snapshots
// have been served from the offline cache with no server snapshot following
// for a few seconds — the visible sign of a dead stream.
export function useFirestoreStale() {
  const [stale, setStale] = useState(() => isFirestoreStale());
  useEffect(() => {
    const check = () => {
      const next = isFirestoreStale();
      setStale((prev) => (prev === next ? prev : next));
    };
    const unsub = subscribeFirestoreHealth(check);
    const id = setInterval(check, 1000);
    return () => { unsub(); clearInterval(id); };
  }, []);
  return stale;
}
