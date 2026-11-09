// groups.js — shared group-membership helpers.
//
// When a group's membership changes, every doc addressed to that group must
// have its `audienceKeys` re-resolved, or server-side visibility rules go
// stale (players lose — or keep — access they shouldn't). Each feature hook
// only subscribes to its own collections, so this helper re-stamps the
// caller's local docs AND sweeps the collections no feature subscribes to
// wholesale (messages, nutritionTargets, scheduled) with an array-contains
// query. One call site per group editor; never re-implement per feature.

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { COL } from "./collections";
import { audienceKeysFor } from "../lib/audience";

// Collections swept server-side when the caller doesn't subscribe to them.
const SWEPT_COLLECTIONS = [COL.messages, COL.nutritionTargets, COL.scheduled];

/**
 * Re-resolve audienceKeys on every doc addressed to `groupId`.
 *
 * @param {Firestore} db
 * @param {string} groupId — the edited group's doc id
 * @param {Array} nextGroups — full groups list AFTER the membership edit
 *   (each { id, memberUids[] }); used to resolve groupIds → member keys
 * @param {Object} localDocs — { [collectionName]: docs[] } for collections
 *   the caller already subscribes to (e.g. events, chatGroups, assignments)
 */
export async function restampGroupAudience(
  db,
  groupId,
  nextGroups,
  localDocs = {},
) {
  const updates = [];
  const collect = (colName, docs) => {
    (docs || []).forEach((d) => {
      if ((d.visibleTo?.groupIds || []).includes(groupId)) {
        updates.push({
          ref: doc(db, colName, d.id),
          data: { audienceKeys: audienceKeysFor(d.visibleTo, nextGroups) },
        });
      }
    });
  };

  Object.entries(localDocs).forEach(([colName, docs]) => collect(colName, docs));

  for (const colName of SWEPT_COLLECTIONS) {
    if (localDocs[colName]) continue;
    try {
      const snap = await getDocs(
        query(
          collection(db, colName),
          where("visibleTo.groupIds", "array-contains", groupId),
        ),
      );
      collect(
        colName,
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      );
    } catch {
      // Collection may not exist yet on a fresh team — nothing to re-stamp.
    }
  }

  // Firestore batches cap at 500 writes; chunk to stay well under.
  for (let i = 0; i < updates.length; i += 450) {
    const batch = writeBatch(db);
    updates.slice(i, i + 450).forEach((u) => batch.update(u.ref, u.data));
    await batch.commit();
  }
  return updates.length;
}
