import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export function useCollection(name, ...constraints) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!name) {
      setItems([]);
      return;
    }
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

  useEffect(() => {
    if (!name || !uid) {
      setItems([]);
      return;
    }
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
