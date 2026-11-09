import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

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

export function useCollection(name, ...constraints) {
  const [items, setItems] = useState([]);
  const fingerprint = constraints.map(constraintFingerprint).join("|");

  useEffect(() => {
    if (!name) {
      setItems([]);
      return;
    }
    const q = query(collection(db, name), ...constraints);
    // A permission error here is expected during auth/team transitions (e.g.
    // the active team just changed and the old listener is being replaced);
    // swallow it — the corrected subscription repopulates the list.
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("useCollection listen failed:", name, err?.code || err),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fingerprint]);

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
    return onSnapshot(
      q,
      (snap) => {
        let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (orderField && role !== "admin" && role !== "orgAdmin") {
          docs = docs.sort(
            (a, b) => (a[orderField]?.seconds || 0) - (b[orderField]?.seconds || 0),
          );
        }
        setItems(docs);
      },
      (err) => console.warn("useAudienceCollection listen failed:", name, err?.code || err),
    );
  }, [name, uid, email, role, orderField, teamId]);

  return items;
}
