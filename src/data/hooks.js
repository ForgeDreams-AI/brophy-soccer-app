import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export function useCollection(name, ...constraints) {
  const [items, setItems] = useState([]);

  // Clear stale docs as soon as the collection goes away — derived during
  // render with a previous-value guard instead of an effect. The
  // subscription below only runs for a truthy name.
  const [prevName, setPrevName] = useState(name);
  if (name !== prevName) {
    setPrevName(name);
    if (!name) setItems([]);
  }

  useEffect(() => {
    if (!name) return;
    const q = query(collection(db, name), ...constraints);
    return onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return items;
}

// Audience-scoped collection. Coaches (admin) read the whole collection;
// players only fetch docs whose `audienceKeys` array includes one of their
// keys ('*' for everyone, 'uid:<uid>', or 'email:<email>'). Security rules
// reject anything else, so a hidden channel/event/message never reaches the
// device. We sort client-side so the player query stays a single
// array-contains-any filter — no composite index to deploy.
export function useAudienceCollection(name, user, orderField) {
  const [items, setItems] = useState([]);
  const uid = user?.uid;
  const email = user?.email || null;
  const role = user?.role;

  // Clear stale docs as soon as the query becomes inactive — derived
  // during render with a previous-value guard instead of an effect. The
  // subscription below only runs while a collection name and uid are both
  // present.
  const [prevActiveKey, setPrevActiveKey] = useState(null);
  const activeKey = name && uid ? `${name}|${uid}` : null;
  if (activeKey !== prevActiveKey) {
    setPrevActiveKey(activeKey);
    if (!activeKey) setItems([]);
  }

  useEffect(() => {
    if (!name || !uid) return;
    let q;
    if (role === "admin") {
      q = orderField
        ? query(collection(db, name), orderBy(orderField))
        : query(collection(db, name));
    } else {
      const keys = ["*", "uid:" + uid];
      if (email) keys.push("email:" + email);
      q = query(collection(db, name), where("audienceKeys", "array-contains-any", keys));
    }
    return onSnapshot(q, (snap) => {
      let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (orderField && role !== "admin") {
        docs = docs.sort(
          (a, b) => (a[orderField]?.seconds || 0) - (b[orderField]?.seconds || 0),
        );
      }
      setItems(docs);
    });
  }, [name, uid, email, role, orderField]);

  return items;
}

// Local-storage-backed state. JSON-serializes the value; falls back to
// `initial` when nothing is stored or parsing fails (e.g. private mode).
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode — keep in-memory only */
    }
  }, [key, value]);

  return [value, setValue];
}
