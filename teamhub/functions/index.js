// Push-notification fan-out triggers.
// Deployed via `firebase deploy --only functions` (needs Blaze plan).

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { searchUsda } = require("./lib/usda");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { TEAM_TZ, partsInTz, zonedTime, nextRecurring, dateKeyInTz, humanLead } = require("./lib/time");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();

// ── helpers ──────────────────────────────────────────────────────────────

// Team-scoped token collection. With a teamId, only users on that team
// (teamIds array-contains teamId) plus the org admin (who belongs to all
// three teams) get the push. Without a teamId nobody does — fail closed: a
// doc with no team (legacy or malformed) must never push to the whole
// program.
async function collectTokens({ teamId, excludeUid } = {}) {
  const all = [];
  const tokenToUid = new Map();
  if (!teamId) {
    console.warn("collectTokens: no teamId — sending to nobody.");
    return { tokens: all, tokenToUid };
  }
  const snap = await db.collection("users").where("teamIds", "array-contains", teamId).get();
  snap.forEach((d) => {
    if (excludeUid && d.id === excludeUid) return;
    // NOTE: org admins carry all three teamIds, so the array-contains
    // query above already includes them.
    const tokens = d.data().fcmTokens;
    if (Array.isArray(tokens)) {
      tokens.forEach((t) => {
        if (t && !tokenToUid.has(t)) {
          all.push(t);
          tokenToUid.set(t, d.id);
        }
      });
    }
  });
  return { tokens: all, tokenToUid };
}

async function sendToTokens({ tokens, tokenToUid }, { title, body, link, tag }) {
  if (!tokens.length) {
    console.log("No tokens to send to.");
    return;
  }
  const message = {
    notification: { title, body },
    data: { link: link || "/" },
    webpush: {
      fcmOptions: { link: link || "/" },
      notification: {
        icon: "/brand/logo.png",
        badge: "/brand/logo.png",
        tag: tag || undefined,
      },
    },
    tokens,
  };
  const resp = await getMessaging().sendEachForMulticast(message);
  console.log(`Sent ${resp.successCount} / ${tokens.length}`);

  // Prune invalid tokens from their owners' user docs.
  const stalePerUid = new Map();
  resp.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || "";
    if (code === "messaging/invalid-registration-token"
        || code === "messaging/registration-token-not-registered") {
      const tok = tokens[i];
      const uid = tokenToUid.get(tok);
      if (!uid) return;
      const arr = stalePerUid.get(uid) || [];
      arr.push(tok);
      stalePerUid.set(uid, arr);
    } else if (r.error) {
      console.warn("send error", code, r.error.message);
    }
  });
  if (stalePerUid.size) {
    const batch = db.batch();
    for (const [uid, arr] of stalePerUid) {
      batch.update(db.doc(`users/${uid}`), { fcmTokens: FieldValue.arrayRemove(...arr) });
    }
    await batch.commit();
    console.log(`Pruned ${[...stalePerUid.values()].reduce((s, a) => s + a.length, 0)} stale tokens.`);
  }
}

const trunc = (s, n = 140) => {
  if (!s) return "";
  const str = String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};

// Load every user doc once (uid + role + email + tokens) for in-JS filtering.
async function loadMembers() {
  const snap = await db.collection("users").get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Collect FCM tokens for an explicit set of uids (used for DMs + delegation).
async function tokensForUids(uids, { excludeUid } = {}) {
  const want = [...new Set(uids)].filter((u) => u && u !== excludeUid);
  const all = [];
  const tokenToUid = new Map();
  await Promise.all(want.map(async (uid) => {
    const d = await db.doc(`users/${uid}`).get();
    const tokens = d.exists ? d.data().fcmTokens : null;
    if (Array.isArray(tokens)) tokens.forEach((t) => { if (t && !tokenToUid.has(t)) { all.push(t); tokenToUid.set(t, uid); } });
  }));
  return { tokens: all, tokenToUid };
}

// Coaches of one team (role admin on that team) plus the org admin, who
// coaches all three. Used wherever a push must reach "the coaches" of the
// team a doc belongs to — never the whole program, so no teamId = nobody.
async function coachUidsForTeam(teamId) {
  if (!teamId) return [];
  const snap = await db.collection("users").where("teamIds", "array-contains", teamId).get();
  return snap.docs.filter((d) => d.data().role === "admin" || d.data().role === "orgAdmin").map((d) => d.id);
}

// Per-team coaches ONLY (role admin on that team) — the org admin is NOT
// included. Used for DMs: a DM goes to the player and their own team's
// coach, never to the org admin (decision 2026-11-08).
async function teamCoachUidsForTeam(teamId) {
  if (!teamId) return [];
  const snap = await db.collection("users").where("teamIds", "array-contains", teamId).get();
  return snap.docs.filter((d) => d.data().role === "admin").map((d) => d.id);
}

// Resolve an assignment/visibleTo audience to FCM tokens. Empty audience =
// everyone on the team; otherwise the union of listed emails + members of
// listed groups (group memberUids may hold either uids or emails) + listed
// uids, plus the team's coaches (who can see everything on their team).
async function tokensForAudience(visibleTo, { teamId, excludeUid } = {}) {
  const v = visibleTo || {};
  const emails = (v.emails || []).map((e) => (e || "").toLowerCase());
  const gids = v.groupIds || [];
  const directUids = v.uids || []; // events address people by uid
  if (!emails.length && !gids.length && !directUids.length) return collectTokens({ teamId, excludeUid });
  const groupMembers = new Set();
  await Promise.all(gids.map(async (gid) => {
    const g = await db.doc(`groups/${gid}`).get();
    (g.exists ? (g.data().memberUids || []) : []).forEach((m) => groupMembers.add(m));
  }));
  const emailSet = new Set(emails);
  const members = await loadMembers();
  const recipientUids = members
    .filter((m) => emailSet.has((m.email || "").toLowerCase()) || groupMembers.has(m.uid) || groupMembers.has(m.email))
    .map((m) => m.uid);
  const coaches = await coachUidsForTeam(teamId);
  return tokensForUids([...recipientUids, ...directUids, ...coaches], { excludeUid });
}

// Resolve a doc's flattened `audienceKeys` — the same array the security rules
// check on reads — to FCM tokens. '*', or a missing/empty array (how docs that
// predate server-side visibility look), means everyone. Coaches can read every
// channel and event, so they stay on the list regardless.
//
// Push has to be resolved from `audienceKeys` rather than re-derived from
// `visibleTo`: the keys are what the rules enforce, and for a message they're a
// snapshot of its channel's audience at post time. Re-resolving would let a
// notification reach a phone that can't open what it's announcing.
async function tokensForAudienceKeys(audienceKeys, { teamId, excludeUid } = {}) {
  const keys = Array.isArray(audienceKeys) ? audienceKeys.filter(Boolean) : [];
  if (!keys.length || keys.includes("*")) return collectTokens({ teamId, excludeUid });
  const uids = new Set(keys.filter((k) => k.startsWith("uid:")).map((k) => k.slice(4)));
  const emails = new Set(keys.filter((k) => k.startsWith("email:")).map((k) => k.slice(6).toLowerCase()));
  if (emails.size) {
    const members = await loadMembers();
    members.forEach((m) => { if (emails.has((m.email || "").toLowerCase())) uids.add(m.uid); });
  }
  (await coachUidsForTeam(teamId)).forEach((uid) => uids.add(uid));
  return tokensForUids([...uids], { excludeUid });
}

// ── triggers ─────────────────────────────────────────────────────────────

exports.onAnnouncementCreated = onDocumentCreated("announcements/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const bundle = await collectTokens({ teamId: data.teamId });
  await sendToTokens(bundle, {
    title: `📣 ${data.title || "New announcement"}`,
    body: trunc(data.body || "Tap to read."),
    link: "/?tab=home",
    tag: `announcement-${event.params.id}`,
  });
});

// Shared documents library: a coach shares a file or link and leaves
// "Notify players" on → push it to that team, or to all three teams for an
// all-teams item.
const ALL_TEAMS = ["jvb", "jva", "varsity"];
exports.onLibraryItemCreated = onDocumentCreated("libraryItems/{id}", async (event) => {
  const data = event.data?.data();
  if (!data || data.notify !== true) return;
  const teams = data.teamId === "all" ? ALL_TEAMS : [data.teamId];
  const merged = { tokens: [], tokenToUid: new Map() };
  for (const t of teams) {
    const b = await collectTokens({ teamId: t, excludeUid: data.createdByUid });
    b.tokens.forEach((tok) => {
      if (!merged.tokenToUid.has(tok)) { merged.tokens.push(tok); merged.tokenToUid.set(tok, b.tokenToUid.get(tok)); }
    });
  }
  await sendToTokens(merged, {
    title: `📄 New ${data.kind === "link" ? "link" : "document"}: ${trunc(data.title, 80)}`,
    body: data.folder ? `In ${data.folder} · tap to open` : "Tap to open",
    link: "/?tab=library",
    tag: `library-${event.params.id}`,
  });
});

// Quote of the Day: a coach posts an inspirational quote → push it to everyone.
exports.onQuoteCreated = onDocumentCreated("quotes/{id}", async (event) => {
  const data = event.data?.data();
  if (!data || !data.text) return;
  if (data.notify === false) return;
  const body = data.author ? `"${trunc(data.text, 160)}" — ${data.author}` : trunc(data.text, 180);
  const bundle = await collectTokens({ teamId: data.teamId });
  await sendToTokens(bundle, {
    title: "💬 Quote of the Day",
    body,
    link: "/?tab=home",
    tag: "quote-of-the-day", // reuse the tag so a new quote replaces the old banner
  });
});

exports.onEventCreated = onDocumentCreated("events/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  if (data.notify === false) return; // silent bulk imports skip the fan-out
  const when = [data.date, data.start && `· ${data.start}–${data.end}`, data.location && `· ${data.location}`].filter(Boolean).join(" ");
  // Events carry an audience too — a group-only event must not push its title,
  // time and location to the whole team. Team-scoped first: a JVB event
  // never pushes to Varsity phones.
  const bundle = await tokensForAudienceKeys(data.audienceKeys, { teamId: data.teamId });
  await sendToTokens(bundle, {
    title: `📅 ${data.type || "Event"}: ${data.title || "Untitled"}`,
    body: trunc(when),
    link: "/?tab=calendar",
    tag: `event-${event.params.id}`,
  });
});

exports.onMessageCreated = onDocumentCreated("messages/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  let body;
  if (data.kind === "poll") body = `📊 ${data.question || "New poll"}`;
  // A photo with a caption (game report, line-up…) shows the caption.
  else if (data.attachment?.type === "image" && data.text) body = `📷 ${trunc(data.text)}`;
  else if (data.attachment?.type === "image") body = "📷 Sent a photo";
  else if (data.attachment?.type === "video") body = "🎬 Sent a video";
  else if (data.attachment?.type === "file") body = "📎 Sent a file";
  else body = trunc(data.text);
  if (!body) return;
  // Only the message's own audience — a hidden channel's text must not go out
  // as a push to phones that can't open the channel. Team-scoped first.
  const bundle = await tokensForAudienceKeys(data.audienceKeys, { teamId: data.teamId, excludeUid: data.senderUid });
  await sendToTokens(bundle, {
    title: data.sender || "New message",
    body,
    link: "/?tab=messages",
    tag: "chat",
  });
});

// USDA food search without a public endpoint (the org blocks public
// functions): the app writes foodSearches/{id} = { uid, q }; this trigger
// fetches USDA with the Secret Manager key and writes { foods, done } back
// to the same doc, which the app is listening to. Results are cached for a
// week in usdaCache/{query}. `expireAt` lets a Firestore TTL policy delete
// old request docs (DEPLOY_PLAN step 9).
const USDA_API_KEY = defineSecret("USDA_API_KEY");
exports.onFoodSearch = onDocumentCreated({ document: "foodSearches/{id}", secrets: [USDA_API_KEY], memory: "256MiB", maxInstances: 5 }, async (event) => {
  const snap = event.data;
  const d = snap?.data();
  if (!d || typeof d.q !== "string") return;
  const q = d.q.trim().slice(0, 100);
  const expireAt = Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000);
  const cacheRef = db.doc(`usdaCache/${encodeURIComponent(q.toLowerCase()).slice(0, 700)}`);
  try {
    const cached = await cacheRef.get();
    let foods;
    if (cached.exists && (cached.data().fetchedAt?.toMillis?.() || 0) > Date.now() - 7 * 24 * 3600 * 1000) {
      foods = cached.data().foods || [];
    } else {
      foods = await searchUsda(q, { usdaKey: USDA_API_KEY.value(), fetch });
      await cacheRef.set({ foods, fetchedAt: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 8 * 24 * 3600 * 1000) });
    }
    await snap.ref.update({ foods, done: true, expireAt });
  } catch (e) {
    console.error("food search failed:", q, e);
    await snap.ref.update({ foods: [], done: true, error: String(e?.message || e).slice(0, 200), expireAt }).catch(() => {});
  }
});

// Poll votes live in messages/{id}/votes/{uid} — private to the voter and
// the team's coach (players see totals only). Keep the public tallies on the
// poll message: `voteCounts` (one count per option) + `voteTotal`. Recounted
// from the votes subcollection on every vote write, so it can't drift.
exports.onPollVoteWritten = onDocumentWritten("messages/{id}/votes/{uid}", async (event) => {
  const msgRef = db.doc(`messages/${event.params.id}`);
  const msg = await msgRef.get();
  if (!msg.exists || msg.data().kind !== "poll") return;
  const n = Array.isArray(msg.data().options) ? msg.data().options.length : 0;
  const counts = Array.from({ length: n }, () => 0);
  // Legacy votes stored on the message (before this change) still count,
  // unless that person has since voted in the new subcollection.
  const votesSnap = await msgRef.collection("votes").get();
  const seen = new Set();
  votesSnap.forEach((v) => {
    const o = v.data().option;
    seen.add(v.id);
    if (Number.isInteger(o) && o >= 0 && o < n) counts[o] += 1;
  });
  Object.entries(msg.data().votes || {}).forEach(([uid, o]) => {
    if (!seen.has(uid) && Number.isInteger(o) && o >= 0 && o < n) counts[o] += 1;
  });
  await msgRef.update({ voteCounts: counts, voteTotal: counts.reduce((a, b) => a + b, 0) });
});

// Direct messages: notify only the people in the thread — the player who owns
// it (threadId) plus the coaches of that team — never the whole team, and
// never the org admin (DMs are between a player and their own team's coach).
exports.onDMCreated = onDocumentCreated("dms/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  let body;
  if (data.attachment?.type === "image") body = "📷 Sent a photo";
  else if (data.attachment?.type === "video") body = "🎬 Sent a video";
  else if (data.attachment?.type === "file") body = "📎 Sent a file";
  else body = trunc(data.text);
  if (!body) return;
  const admins = await teamCoachUidsForTeam(data.teamId);
  const recipients = [...new Set([data.threadId, ...admins])].filter((uid) => uid && uid !== data.senderUid);
  const bundle = await tokensForUids(recipients);
  await sendToTokens(bundle, {
    title: `💬 ${data.senderName || "Direct message"}`,
    body,
    link: "/?tab=messages",
    tag: `dm-${data.threadId}`,
  });
});

// Delegation: when an event gets a "run by" coach (on create or later edit),
// notify just that coach. Guarded so unrelated event edits don't re-fire.
exports.onEventDelegated = onDocumentWritten("events/{id}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after) return;
  const runBy = after.runByUid;
  if (!runBy) return;
  if (before && before.runByUid === runBy) return; // assignment unchanged
  const when = [after.date, after.start && `· ${after.start}`].filter(Boolean).join(" ");
  const bundle = await tokensForUids([runBy]);
  await sendToTokens(bundle, {
    title: "🗒️ You're running a session",
    body: trunc(`${after.type || "Session"}: ${after.title || "Untitled"} ${when}`.trim()),
    link: "/?tab=home",
    tag: `delegation-${event.params.id}`,
  });
});

// Pre-event auto reminders: an event may carry a `reminders` array
// ([{ id, offsetMin }]) plus `startAt` (absolute start instant). On every
// event write we reconcile the derived `scheduled` docs — delete the event's
// un-sent ones and recreate any whose fire time (startAt − offset) is still
// in the future. runScheduled then fires them.
//
// Every team event ALSO gets two automatic pings, added here server-side
// (never stored on the event doc): 1 hour before kickoff, and 7:00 AM
// America/Phoenix on the day of the event. A coach reminder that already
// fires at (nearly) the same instant is not duplicated. (No RSVP: the old
// event-attached "Who's making it?" poll was dropped for Brophy, so event
// reminders are push-only now. Standalone polls — scheduled from chat or
// posted directly — still use the `scheduled` poll type and are untouched.)
//
// Edits that don't touch anything the reminders are built from (e.g. a
// readBy / notes change) are skipped, so they don't churn the queue.
const REMINDER_FIELDS = ["title", "type", "date", "start", "location", "runByUid", "runByName", "teamId"];
function reminderInputsChanged(before, after) {
  const ms = (t) => (t && t.toMillis ? t.toMillis() : null);
  const json = (v) => JSON.stringify(v === undefined ? null : v);
  if (ms(before.startAt) !== ms(after.startAt)) return true;
  if (json(before.reminders) !== json(after.reminders)) return true;
  if (json(before.visibleTo) !== json(after.visibleTo)) return true;
  return REMINDER_FIELDS.some((k) => (before[k] ?? null) !== (after[k] ?? null));
}

exports.onEventReminderSync = onDocumentWritten("events/{id}", async (event) => {
  const id = event.params.id;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (before && after && !reminderInputsChanged(before, after)) return;
  const existing = await db.collection("scheduled").where("eventId", "==", id).get();
  const batch = db.batch();
  existing.forEach((doc) => { if (!doc.data().sent) batch.delete(doc.ref); });

  const reminders = after && Array.isArray(after.reminders) ? after.reminders : [];
  const startMs = after?.startAt?.toMillis ? after.startAt.toMillis() : 0;
  if (after && startMs) {
    const when = [after.date, after.start && `at ${after.start}`, after.location && `· ${after.location}`].filter(Boolean).join(" ");
    const base = {
      eventId: id, teamId: after.teamId || null, auto: true, sent: false,
      createdByUid: after.runByUid || "", createdByName: after.runByName || "Coach", createdByInitials: "",
      createdAt: Timestamp.now(),
      visibleTo: after.visibleTo || { groupIds: [], uids: [] },
    };
    // Fire instants (minute-rounded) the coach's own reminders already
    // cover, so the automatic pings don't double-push.
    const covered = new Set();
    for (const r of reminders) {
      const offset = Math.max(0, Math.round(Number(r.offsetMin) || 0));
      const sendMs = startMs - offset * 60000;
      if (sendMs <= Date.now()) continue; // fire time already passed
      covered.add(Math.round(sendMs / 60000));
      const ref = db.collection("scheduled").doc();
      batch.set(ref, {
        ...base, reminderId: r.id || ref.id, sendAt: Timestamp.fromMillis(sendMs),
        type: "reminder",
        title: `⏰ ${after.title || after.type || "Event"} in ${humanLead(offset)}`,
        body: when || "Tap for details.",
      });
    }
    // Automatic: 1 hour before kickoff.
    const oneHourMs = startMs - 60 * 60000;
    if (oneHourMs > Date.now() && !covered.has(Math.round(oneHourMs / 60000))) {
      const ref = db.collection("scheduled").doc();
      batch.set(ref, {
        ...base, reminderId: "auto-1h", sendAt: Timestamp.fromMillis(oneHourMs),
        type: "reminder",
        title: `⏰ ${after.title || after.type || "Event"} in 1 hour`,
        body: when || "Tap for details.",
      });
    }
    // Automatic: 7:00 AM America/Phoenix on the day of the event. Skipped
    // when 7 AM is already past, or when it falls after kickoff (e.g. a 6 AM
    // session — the morning ping would arrive after the start).
    const parts = partsInTz(new Date(startMs), TEAM_TZ);
    const sevenAmMs = zonedTime(+parts.year, +parts.month - 1, +parts.day, 7, 0, TEAM_TZ);
    if (sevenAmMs > Date.now() && sevenAmMs < startMs && !covered.has(Math.round(sevenAmMs / 60000))) {
      const ref = db.collection("scheduled").doc();
      batch.set(ref, {
        ...base, reminderId: "auto-7am", sendAt: Timestamp.fromMillis(sevenAmMs),
        type: "reminder",
        title: `⏰ ${after.title || after.type || "Event"} today`,
        body: when || "Tap for details.",
      });
    }
  }
  await batch.commit();
});

// ── scheduled reminders + polls ─────────────────────────────────────────────
// Coaches create docs in `scheduled` with a future `sendAt`. This cron sweeps
// every minute and fires anything now due: a "reminder" fans out as a push
// to its audience; a "poll" is posted into a chat channel as a normal poll
// message (which the onMessageCreated trigger then pushes to the team).
// The 1-minute sweep keeps the "Send now" composer path near-instant: it
// queues a pushNotifications doc with sendAt set to now, and this sweep is
// the only route that sends it.

async function channelAudienceKeys(channel) {
  if (!channel || channel === "team") return ["*"];
  const g = await db.doc(`chatGroups/${channel}`).get();
  const keys = g.exists ? (g.data().audienceKeys || ["*"]) : ["*"];
  return Array.isArray(keys) && keys.length ? keys : ["*"];
}

// Recurrence + timezone helpers (partsInTz, zonedTime, nextRecurring, …)
// live in ./lib/time.js.

// A due item that keeps failing is retried on every sweep until it has
// failed this many times; then it is marked terminally failed so it stops
// being picked up (and the coach can see why in `lastError`).
const MAX_SEND_ATTEMPTS = 5;

// Record one failed attempt on a scheduled / pushNotifications doc. On the
// MAX_SEND_ATTEMPTS-th failure the doc is marked terminal via `terminal`.
async function recordFailure(doc, e, terminal) {
  const failCount = (Number(doc.data().failCount) || 0) + 1;
  const lastError = String((e && e.message) || e).slice(0, 500);
  const update = { failCount, lastError };
  if (failCount >= MAX_SEND_ATTEMPTS) {
    Object.assign(update, terminal);
    console.error(`giving up on ${doc.ref.path} after ${failCount} failures`);
  }
  try {
    await doc.ref.update(update);
  } catch (e2) {
    console.error("could not record failure:", doc.ref.path, e2);
  }
}

// Default hour (local, America/Phoenix) after which a player who hasn't
// logged wellness today gets one push reminder. Matches the per-team
// `wellnessNudgeHour` in src/data/teams.js.
const WELLNESS_NUDGE_HOUR = 8;

exports.runScheduled = onSchedule("every 1 minutes", async () => {
  const now = Timestamp.now();
  await processScheduledItems(now);
  await processPushNotifications(now);
  await processWellnessNudges();
});

async function processScheduledItems(now) {
  // Only unsent items (composite index scheduled(sent, sendAt)) — the sweep
  // no longer re-reads every sent item ever scheduled.
  const snap = await db.collection("scheduled").where("sent", "==", false).where("sendAt", "<=", now).get();
  const due = snap.docs;
  if (!due.length) { console.log("No scheduled items due."); return; }
  for (const doc of due) {
    const d = doc.data();
    try {
      if (d.type === "poll") {
        const audienceKeys = await channelAudienceKeys(d.channel);
        // The poll lands in its channel's team — a scheduled poll for a
        // channel of another team must never post into this one.
        let pollTeamId = d.teamId || null;
        if (d.channel && d.channel !== "team") {
          const chDoc = await db.doc(`chatGroups/${d.channel}`).get();
          if (chDoc.exists && chDoc.data().teamId) pollTeamId = chDoc.data().teamId;
        }
        await db.collection("messages").add({
          senderUid: d.createdByUid || "",
          sender: d.createdByName || "Coach",
          initials: d.createdByInitials || "",
          text: "",
          pinned: false,
          channel: d.channel || "team",
          teamId: pollTeamId,
          audienceKeys,
          isCoach: true,
          readBy: {},
          kind: "poll",
          question: d.question || "Poll",
          options: Array.isArray(d.options) ? d.options : [],
          voteCounts: (Array.isArray(d.options) ? d.options : []).map(() => 0),
          voteTotal: 0,
          createdAt: Timestamp.now(),
          scheduled: true,
        });
        // onMessageCreated fans the poll out as a push.
      } else {
        const bundle = await tokensForAudience(d.visibleTo, { teamId: d.teamId });
        await sendToTokens(bundle, {
          title: `🔔 ${d.title || "Reminder"}`,
          body: trunc(d.body || "Tap to open the app."),
          link: "/?tab=home",
          tag: `scheduled-${doc.id}`,
        });
      }
      // Recurring items advance to their next occurrence instead of finishing.
      // Missed occurrences (function was down) are skipped — we jump to the
      // next one strictly in the future, so the team isn't spammed.
      const days = Array.isArray(d.repeatDays) ? d.repeatDays : [];
      if (d.repeat && d.repeat !== "none" && days.length) {
        const tz = d.tz || TEAM_TZ;
        const cur = partsInTz(d.sendAt.toDate(), tz);
        const next = nextRecurring(Date.now(), days, +cur.hour % 24, +cur.minute, tz);
        if (next) await doc.ref.update({ sendAt: Timestamp.fromMillis(next), lastSentAt: Timestamp.now() });
        else await doc.ref.update({ sent: true, sentAt: Timestamp.now() });
      } else {
        await doc.ref.update({ sent: true, sentAt: Timestamp.now() });
      }
    } catch (e) {
      console.error("scheduled item failed:", doc.id, e);
      await recordFailure(doc, e, { sent: true, failed: true });
    }
  }
}

// Custom push notifications: the coach's "Send notification" composer
// writes a `pushNotifications` doc (status "scheduled"; "Send now" uses
// sendAt = now). This sweeps the queue for anything due. A one-off is marked
// sent; a recurring one advances to its next occurrence (same timezone-aware
// recurrence as scheduled items) instead of finishing.
// Claim one queued push (status "scheduled" → "sending") in a transaction so
// the instant trigger and the 1-minute sweep can never both send it.
// Returns the claimed data, or null when it isn't due / was already taken.
async function claimPush(ref, nowMs) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    const sendMs = d.sendAt?.toMillis ? d.sendAt.toMillis() : 0;
    if (d.status !== "scheduled" || !sendMs || sendMs > nowMs) return null;
    tx.update(ref, { status: "sending", claimedAt: Timestamp.now() });
    return d;
  });
}

// Send one claimed push and settle its status: a one-off becomes "sent", a
// recurring one goes back to "scheduled" at its next occurrence. On failure
// it returns to "scheduled" (retried by the sweep) until the retry cap.
async function deliverPush(doc, d) {
  try {
    const bundle = await tokensForAudienceKeys(d.audienceKeys, { teamId: d.teamId });
    await sendToTokens(bundle, {
      title: d.title || "Team notification",
      body: trunc(d.body || "Tap to open the app."),
      link: "/?tab=home",
      tag: `push-${doc.id}`,
    });
    const r = d.recurrence || {};
    const days = Array.isArray(r.days) ? r.days : [];
    if (r.type && r.type !== "none" && days.length) {
      const tz = d.tz || TEAM_TZ;
      const [hh, mm] = String(r.time || "08:00").split(":").map((n) => parseInt(n, 10) || 0);
      const next = nextRecurring(Date.now(), days, hh, mm, tz);
      if (next) await doc.ref.update({ status: "scheduled", sendAt: Timestamp.fromMillis(next), lastSentAt: Timestamp.now() });
      else await doc.ref.update({ status: "sent", sentAt: Timestamp.now() });
    } else {
      await doc.ref.update({ status: "sent", sentAt: Timestamp.now() });
    }
  } catch (e) {
    console.error("push notification failed:", doc.id, e);
    await doc.ref.update({ status: "scheduled" }).catch(() => { /* recorded below */ });
    await recordFailure(doc, e, { status: "failed" });
  }
}

// Instant "Send now": the coach's composer writes a pushNotifications doc
// with sendAt = now. Send it the moment it's created instead of waiting for
// the next 1-minute sweep. Future-dated (scheduled) items are left for
// runScheduled.
exports.onPushNotificationCreated = onDocumentCreated("pushNotifications/{id}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  // A few seconds of slack for clock skew between the client and the server.
  const d = await claimPush(snap.ref, Date.now() + 5000);
  if (!d) return;
  await deliverPush(snap, d);
});

// Custom push notifications: sweep the queue for anything due (scheduled
// items and recurring occurrences; "Send now" is normally sent instantly by
// onPushNotificationCreated, this is the safety net). Items stuck in
// "sending" for 5+ minutes (a crashed run) go back to the queue.
async function processPushNotifications(now) {
  const stuck = await db.collection("pushNotifications").where("status", "==", "sending").get();
  const staleMs = Date.now() - 5 * 60 * 1000;
  await Promise.all(stuck.docs
    .filter((doc) => (doc.data().claimedAt?.toMillis?.() || 0) < staleMs)
    .map((doc) => doc.ref.update({ status: "scheduled" })));
  // Only queued items (composite index pushNotifications(status, sendAt)).
  const snap = await db.collection("pushNotifications").where("status", "==", "scheduled").where("sendAt", "<=", now).get();
  if (!snap.size) { console.log("No push notifications due."); return; }
  for (const doc of snap.docs) {
    const d = await claimPush(doc.ref, now.toMillis());
    if (d) await deliverPush(doc, d);
  }
}

// Daily wellness auto-nudge: once the local clock passes the nudge hour
// (default 8:00 AM America/Phoenix), every player who has NOT logged wellness
// today gets one push reminder ("Log your wellness for today"). The pass runs
// at most once per day: a `wellnessNudgeRuns/{date}` doc is written when it
// finishes and checked first, so the every-minute sweep doesn't re-read every
// user and check-in all day. A per-player marker in `wellnessNudges` (id
// `${uid}_${date}`) still guarantees nobody is nudged twice in one day, even
// if a pass is interrupted and re-run or the player is on more than one team.
// Coaches/admins are not nudged — only players. The "logged today" check is
// team-agnostic (a player has one wellness doc per day, id `${uid}_${date}`),
// so logging under any team counts.
async function processWellnessNudges() {
  const now = new Date();
  const local = partsInTz(now, TEAM_TZ);
  if (+local.hour % 24 < WELLNESS_NUDGE_HOUR) return; // too early — wait for the cutoff
  // "Today" in America/Phoenix — the client stores the wellness `date` in
  // the team timezone too, so the two agree in the evening (UTC is already
  // tomorrow after 5 PM Arizona time).
  const today = dateKeyInTz(now, TEAM_TZ);
  const runRef = db.doc(`wellnessNudgeRuns/${today}`);
  if ((await runRef.get()).exists) return; // today's pass already ran
  const loggedSnap = await db.collection("wellnessCheckins").where("date", "==", today).get();
  const loggedUids = new Set(loggedSnap.docs.map((d) => d.data().uid));
  // Teams = the distinct teamIds across player docs (no hard-coded team list).
  const usersSnap = await db.collection("users").get();
  const byTeam = new Map(); // teamId -> [player user docs]
  usersSnap.forEach((d) => {
    const u = d.data();
    if (u.role === "admin" || u.role === "orgAdmin") return; // players only
    (Array.isArray(u.teamIds) ? u.teamIds : []).forEach((t) => {
      const arr = byTeam.get(t) || [];
      arr.push({ uid: d.id, ...u });
      byTeam.set(t, arr);
    });
  });
  for (const [teamId, players] of byTeam) {
    for (const p of players) {
      if (loggedUids.has(p.uid)) continue; // already logged today (any team)
      const markerId = `${p.uid}_${today}`;
      try {
        const marker = await db.doc(`wellnessNudges/${markerId}`).get();
        if (marker.exists) continue; // already nudged today
        const bundle = await tokensForUids([p.uid]);
        await sendToTokens(bundle, {
          title: "📋 Log your wellness for today",
          body: "Quick check-in — energy, soreness, tiredness. Takes 30 seconds.",
          link: "/?tab=home",
          tag: `wellness-nudge-${markerId}`,
        });
        await db.doc(`wellnessNudges/${markerId}`).set({
          teamId, uid: p.uid, date: today,
          nudgedAt: Timestamp.now(),
        });
      } catch (e) {
        console.error("wellness nudge failed:", teamId, p.uid, e);
      }
    }
  }
  await runRef.set({ ranAt: Timestamp.now() });
}
