// Audience helpers — the app's visibility contract. The UI authors
// `visibleTo`; every write path derives `audienceKeys` from it (that's what
// security rules enforce). Keep the pair in sync via withAudienceKeys().

// Single key for a uid or email. Emails contain "@", uids don't.
export const audienceKeyFor = (x) =>
  String(x).includes("@") ? "email:" + x : "uid:" + x;

// Turn a `visibleTo` audience ({ groupIds, uids|emails }) into the flat
// `audienceKeys` array stored on each doc. Empty audience = everyone (['*']).
// Groups are expanded to their members' keys at write time — re-run when a
// group's membership changes. A custom audience that resolves to nobody
// yields a key matching no real user (admin-only), never '*'.
export function audienceKeysFor(visibleTo, groupsList = []) {
  const v = visibleTo || {};
  const direct = [...(v.uids || []), ...(v.emails || [])];
  const groupIds = v.groupIds || [];
  if (direct.length === 0 && groupIds.length === 0) return ["*"];
  const keys = new Set(direct.map(audienceKeyFor));
  groupIds.forEach((gid) => {
    const g = (groupsList || []).find((x) => x.id === gid);
    (g?.memberUids || []).forEach((m) => keys.add(audienceKeyFor(m)));
  });
  return keys.size ? Array.from(keys) : ["uid:__none__"];
}

// Stamp audienceKeys onto a doc payload whenever it carries visibleTo.
// Use in every add/update wrapper: updateDoc(ref, withAudienceKeys(data, groups)).
export function withAudienceKeys(data, groupsList = []) {
  if (!data || !Object.prototype.hasOwnProperty.call(data, "visibleTo")) return data;
  return { ...data, audienceKeys: audienceKeysFor(data.visibleTo, groupsList) };
}

// Human-readable audience summary for pickers and list rows.
export function visibleToText(visibleTo, groupsList = []) {
  const v = visibleTo || {};
  const groupIds = v.groupIds || [];
  const direct = [...(v.uids || []), ...(v.emails || [])];
  if (groupIds.length === 0 && direct.length === 0) return "Everyone";
  const parts = [];
  groupIds.forEach((gid) => {
    const g = (groupsList || []).find((x) => x.id === gid);
    parts.push(g?.name || "Group");
  });
  if (direct.length > 0) {
    parts.push(direct.length === 1 ? "1 person" : `${direct.length} people`);
  }
  return parts.join(" · ");
}

// Client-side visibility check (mirrors the security rule intent). The real
// enforcement is server-side via audienceKeys; this is for UI filtering where
// a full-collection listener is used.
export function isVisibleToDoc(doc, user, groupsList = []) {
  if (!doc || !user) return false;
  if (user.role === "admin") return true;
  const v = doc.visibleTo;
  if (!v) return true;
  const groupIds = v.groupIds || [];
  const direct = [...(v.uids || []), ...(v.emails || [])];
  if (groupIds.length === 0 && direct.length === 0) return true;
  if (direct.includes(user.uid) || (user.email && direct.includes(user.email))) return true;
  const myGroupIds = new Set(
    (groupsList || [])
      .filter((g) => {
        const m = g.memberUids || [];
        return m.includes(user.uid) || (user.email && m.includes(user.email));
      })
      .map((g) => g.id),
  );
  return groupIds.some((id) => myGroupIds.has(id));
}
