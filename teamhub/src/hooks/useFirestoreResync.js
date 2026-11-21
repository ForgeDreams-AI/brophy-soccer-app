import { useCallback, useEffect, useRef, useState } from "react";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import { db } from "../firebase";
import {
  isFirestoreStale,
  subscribeFirestoreHealth,
  requestFullResync,
} from "../lib/firestoreHealth";

// Automatic live-data recovery. The app's Firestore listeners are live
// (onSnapshot), but on iPhone the stream can die when the app is backgrounded
// and nothing re-subscribes — the offline cache then keeps showing the last
// snapshot with no error, so chat and everything else looks frozen until a
// full restart. This hook fixes that automatically in two ways: whenever the
// app comes back to the foreground after being away for a while and the
// stream is actually dead (server snapshots have stopped), or the network
// comes back, it cycles the Firestore network off and on AND bumps the
// re-subscribe generation, which tears down and re-creates every listener
// from scratch. A healthy stream is left alone on foreground return —
// resyncing it anyway on every app switch is what made the app feel slow.
// The second half is the part that matters: once the SDK has terminated a
// listener with an error, a network cycle alone will not bring it back.
// Only a fresh onSnapshot call does. No one has to tap anything. A watchdog
// covers the case where the stream dies silently while the app is open: if
// snapshots stay cache-only for a while, it resyncs on its own, backing off
// when resyncs do not help so a bad connection does not churn forever.
//
// The 30-second away-time gate keeps rapid tab switches from churning the
// connection. `resync` is also exposed for the small manual Refresh button
// in the header — a backup only, never the main fix.
const AWAY_MS = 30 * 1000;
const STALE_WATCHDOG_MS = 30 * 1000;
const AUTO_RESYNC_MIN_GAP_MS = 60 * 1000;
const AUTO_RESYNC_MAX_GAP_MS = 10 * 60 * 1000;

export function useFirestoreResync() {
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const hiddenSinceRef = useRef(null);
  const staleSinceRef = useRef(null);
  const lastAutoResyncRef = useRef(0);
  // Gap before the watchdog may resync again. It grows when a resync does
  // not clear the staleness (bad connection: tearing everything down every
  // minute just re-downloads it all and the app feels slow), and resets as
  // soon as live data flows again.
  const resyncGapRef = useRef(AUTO_RESYNC_MIN_GAP_MS);

  const resync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await disableNetwork(db);
      await enableNetwork(db);
    } catch {
      // A failed cycle leaves the SDK as it was; the re-subscribe below
      // still runs, and the listener retry logic keeps trying.
    } finally {
      // Re-create every subscription fresh. Without this, a listener the
      // SDK already terminated stays dead no matter how healthy the
      // connection is.
      requestFullResync();
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Watchdog: if live data stays cache-only for a while (a stream that died
  // silently while the app was open, so no foreground event ever fires),
  // resync on its own. Throttled so a genuinely offline phone does not
  // churn, and skipped while the browser reports no network at all.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (!isFirestoreStale(now)) {
        staleSinceRef.current = null;
        resyncGapRef.current = AUTO_RESYNC_MIN_GAP_MS;
        return;
      }
      if (!staleSinceRef.current) staleSinceRef.current = now;
      if (now - staleSinceRef.current < STALE_WATCHDOG_MS) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (now - lastAutoResyncRef.current < resyncGapRef.current) return;
      lastAutoResyncRef.current = now;
      staleSinceRef.current = null;
      resyncGapRef.current = Math.min(resyncGapRef.current * 2, AUTO_RESYNC_MAX_GAP_MS);
      resync();
    }, 15 * 1000);
    return () => clearInterval(id);
  }, [resync]);

  useEffect(() => {
    const onHidden = () => { hiddenSinceRef.current = Date.now(); };
    const onShown = () => {
      if (document.hidden) return;
      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      if (!hiddenSince) return; // never went away (initial load) — nothing to do
      if (Date.now() - hiddenSince < AWAY_MS) return;
      // Only tear everything down when the stream is actually dead. A
      // healthy stream survives being backgrounded, and resyncing it anyway
      // on every return is what made the app feel slow — every app switch
      // re-downloaded all the data for no reason.
      if (!isFirestoreStale(Date.now())) return;
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
