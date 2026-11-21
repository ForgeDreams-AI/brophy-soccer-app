import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { collection, doc, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "../lib/toast";
import {
  reportSnapshot,
  getResyncGeneration,
  subscribeResyncGeneration,
} from "../lib/firestoreHealth";

// Stable fingerprint of a Firestore query constraint, so the subscription
// re-runs only when the query actually changes (e.g. the active teamId
// filter flips from "jvb" to "varsity"). The constraint objects are rebuilt
// on every render, so depending on the objects themselves would re-subscribe
// constantly; the fingerprint is derived from their values instead.
const constraintFingerprint = (c) => {
  if (!c || typeof c !== "object") return String(c);
  if (c.type === "where") {
    const field = c._field?.segments?.join(".") || "?";
    let value;
    try { value = JSON.stringify(c._value); } catch { value = "?"; }
    return `where:${field}:${c._op}:${value}`;
  }
  if (c.type === "orderBy") {
    return `orderBy:${c._field?.segments?.join(".") || "?"}:${c._direction}`;
  }
  if (c.type === "limit") return `limit:${c._limit}`;
  return c.type || "?";
};

// Self-healing for onSnapshot listeners. When a listener dies with a
// transient error (e.g. the stream dropped while the app was backgrounded),
// the error callback used to only log a warning and the list stayed stale
// until a full reload. Now transient errors schedule a re-subscribe with
// backoff instead. Genuine permission errors are never retried — a locked-out
// role stays locked out, and the corrected subscription (e.g. after a team
// switch) repopulates the list on its own. Retries never give up: the
// delays cap at 60s and keep coming, because a stream that stays dead for
// two minutes is still worth recovering without a full restart.
const RETRY_DELAYS_MS = [1000, 5000, 15000, 30000, 60000];
const TRANSIENT_CODES = new Set(["unauthenticated", "unavailable"]);

// Initial value of every list before its first snapshot. Pages can tell
// "still loading" apart from "really empty" with isLoading(list). It is a
// normal (empty) array everywhere else, so existing code keeps working.
const LOADING = Object.freeze(Object.assign([], { loading: true }));
const EMPTY = Object.freeze([]);
export const isLoading = (list) => Boolean(list && list.loading);

// A permission error that survives a few seconds is a real problem (a rules
// change, a wrong query) — say so once instead of silently showing an empty
// list. Short-lived ones (team switch, sign-out) are cancelled by cleanup.
const PERMISSION_GRACE_MS = 4000;
const reportedPermission = new Set();
function schedulePermissionToast(label) {
  return setTimeout(() => {
    if (reportedPermission.has(label)) return;
    reportedPermission.add(label);
    console.error(label + ": permission denied");
    toast("Some data couldn't load (no permission). If this keeps happening, tell your coach.");
  }, PERMISSION_GRACE_MS);
}

function useListenerRetry(label) {
  const [retryKey, setRetryKey] = useState(0);
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const cancelRetry = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const noteSnapshot = useCallback(() => {
    attemptsRef.current = 0;
    cancelRetry();
  }, [cancelRetry]);
  const noteError = useCallback((err) => {
    console.warn(label + " listen failed:", err?.code || err);
    if (err?.code === "permission-denied") {
      clearTimeout(timerRef.current);
      timerRef.current = schedulePermissionToast(label);
      return;
    }
    if (!TRANSIENT_CODES.has(err?.code)) return;
    const delay = RETRY_DELAYS_MS[Math.min(attemptsRef.current, RETRY_DELAYS_MS.length - 1)];
    attemptsRef.current += 1;
    timerRef.current = setTimeout(() => setRetryKey((k) => k + 1), delay);
  }, [label]);
  return { retryKey, noteSnapshot, noteError, cancelRetry };
}

export function useCollection(name, ...constraints) {
  const [items, setItems] = useState(LOADING);
  const fingerprint = constraints.map(constraintFingerprint).join("|");
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useCollection " + name);
  // A foreground re-sync bumps this generation, which tears down and
  // re-creates this subscription from scratch. That is the only way to bring
  // back a listener the SDK already terminated with an error.
  const resyncGen = useSyncExternalStore(subscribeResyncGeneration, getResyncGeneration);

  useEffect(() => {
    if (!name) return; // disabled subscription → [] (see return below)
    const q = query(collection(db, name), ...constraints);
    // A permission error here is expected during auth/team transitions (e.g.
    // the active team just changed and the old listener is being replaced);
    // swallow it — the corrected subscription repopulates the list.
    const unsub = onSnapshot(
      q,
      (snap) => {
        reportSnapshot(snap.metadata.fromCache);
        noteSnapshot();
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      noteError,
    );
    return () => { cancelRetry(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fingerprint, retryKey, resyncGen]);

  return name ? items : EMPTY;
}

// Audience-scoped collection. Coaches (admin) read the whole collection;
// players only fetch docs whose `audienceKeys` array includes one of their
// keys ('*' for everyone, 'uid:<uid>', or 'email:<email>'). Security rules
// reject anything else, so a hidden channel/event/message never reaches the
// device. We sort client-side so the player query stays a single
// array-contains-any filter — no composite index to deploy.
//
// `teamId` scopes the query to one team (the active team). Coaches and
// players alike only ever read their active team's docs; an org admin
// switches teams to see the others. Pass null to skip the filter (only for
// collections that are not team-scoped).
// `max` (optional, needs `orderField`) keeps only the most recent `max` docs
// (ordered newest-first on the server, returned oldest-first).
export function useAudienceCollection(name, user, orderField, teamId, max = 0) {
  const [items, setItems] = useState(LOADING);
  const uid = user?.uid;
  const email = user?.email || null;
  const role = user?.role;
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useAudienceCollection " + name);
  const resyncGen = useSyncExternalStore(subscribeResyncGeneration, getResyncGeneration);

  useEffect(() => {
    if (!name || !uid) return; // disabled → [] (see return below)
    const teamFilter = teamId ? [where("teamId", "==", teamId)] : [];
    const windowed = Boolean(orderField && max > 0);
    // Windowed queries read newest-first + limit (indexes: teamId+createdAt
    // desc, and teamId+audienceKeys+createdAt desc for players).
    const tail = windowed ? [orderBy(orderField, "desc"), limit(max)] : [];
    let q;
    if (role === "admin" || role === "orgAdmin") {
      q = windowed
        ? query(collection(db, name), ...teamFilter, ...tail)
        : orderField
          ? query(collection(db, name), ...teamFilter, orderBy(orderField))
          : query(collection(db, name), ...teamFilter);
    } else {
      const keys = ["*", "uid:" + uid];
      if (email) keys.push("email:" + email);
      q = query(collection(db, name), ...teamFilter, where("audienceKeys", "array-contains-any", keys), ...tail);
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        reportSnapshot(snap.metadata.fromCache);
        noteSnapshot();
        let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (windowed || (orderField && role !== "admin" && role !== "orgAdmin")) {
          docs = docs.sort(
            // A just-sent doc has no server timestamp yet: keep it last (newest).
            (a, b) => (a[orderField]?.seconds ?? 9e15) - (b[orderField]?.seconds ?? 9e15),
          );
        }
        setItems(docs);
      },
      noteError,
    );
    return () => { cancelRetry(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, uid, email, role, orderField, teamId, max, retryKey, resyncGen]);

  return name && uid ? items : EMPTY;
}

// Single-document subscription. `path` is a Firestore doc path
// ("collection/doc" or "collection/doc/subcollection/doc"). Returns the
// doc data (with `id`) or null when the path is empty / the doc is missing.
// Used for per-player private docs (e.g. the player's own nutrition goal).
export function useDoc(path) {
  const [data, setData] = useState(null);
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useDoc " + path);
  const resyncGen = useSyncExternalStore(subscribeResyncGeneration, getResyncGeneration);

  useEffect(() => {
    if (!path) return;
    const unsub = onSnapshot(
      doc(db, path),
      (snap) => {
        reportSnapshot(snap.metadata.fromCache);
        noteSnapshot();
        setData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      noteError,
    );
    return () => { cancelRetry(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, retryKey, resyncGen]);

  return data;
}
