import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { reportSnapshot } from "../lib/firestoreHealth";

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
// switch) repopulates the list on its own. Retries are capped so a
// permanently broken listener stops trying on its own.
const RETRY_DELAYS_MS = [1000, 5000, 15000, 30000, 60000];
const TRANSIENT_CODES = new Set(["unauthenticated", "unavailable"]);

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
    if (!TRANSIENT_CODES.has(err?.code)) return;
    if (attemptsRef.current >= RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[attemptsRef.current];
    attemptsRef.current += 1;
    timerRef.current = setTimeout(() => setRetryKey((k) => k + 1), delay);
  }, [label]);
  return { retryKey, noteSnapshot, noteError, cancelRetry };
}

export function useCollection(name, ...constraints) {
  const [items, setItems] = useState([]);
  const fingerprint = constraints.map(constraintFingerprint).join("|");
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useCollection " + name);

  useEffect(() => {
    if (!name) {
      setItems([]);
      return;
    }
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
  }, [name, fingerprint, retryKey]);

  return items;
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
export function useAudienceCollection(name, user, orderField, teamId) {
  const [items, setItems] = useState([]);
  const uid = user?.uid;
  const email = user?.email || null;
  const role = user?.role;
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useAudienceCollection " + name);

  useEffect(() => {
    if (!name || !uid) {
      setItems([]);
      return;
    }
    const teamFilter = teamId ? [where("teamId", "==", teamId)] : [];
    let q;
    if (role === "admin" || role === "orgAdmin") {
      q = orderField
        ? query(collection(db, name), ...teamFilter, orderBy(orderField))
        : query(collection(db, name), ...teamFilter);
    } else {
      const keys = ["*", "uid:" + uid];
      if (email) keys.push("email:" + email);
      q = query(collection(db, name), ...teamFilter, where("audienceKeys", "array-contains-any", keys));
    }
    const unsub = onSnapshot(
      q,
      (snap) => {
        reportSnapshot(snap.metadata.fromCache);
        noteSnapshot();
        let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (orderField && role !== "admin" && role !== "orgAdmin") {
          docs = docs.sort(
            (a, b) => (a[orderField]?.seconds || 0) - (b[orderField]?.seconds || 0),
          );
        }
        setItems(docs);
      },
      noteError,
    );
    return () => { cancelRetry(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, uid, email, role, orderField, teamId, retryKey]);

  return items;
}

// Single-document subscription. `path` is a Firestore doc path
// ("collection/doc" or "collection/doc/subcollection/doc"). Returns the
// doc data (with `id`) or null when the path is empty / the doc is missing.
// Used for per-player private docs (e.g. the player's own nutrition goal).
export function useDoc(path) {
  const [data, setData] = useState(null);
  const { retryKey, noteSnapshot, noteError, cancelRetry } = useListenerRetry("useDoc " + path);

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
  }, [path, retryKey]);

  return data;
}
