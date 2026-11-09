// Push-notification fan-out triggers.
// Deployed via `firebase deploy --only functions` (needs Blaze plan).

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();

// ── helpers ──────────────────────────────────────────────────────────────

// Team-scoped token collection. With a teamId, only users on that team
// (teamIds array-contains teamId) plus the org admin (who belongs to all
// three teams) get the push. Without a teamId it falls back to everyone —
// used only for docs that predate teams.
async function collectTokens({ teamId, excludeUid } = {}) {
  const snap = teamId
    ? await db.collection("users").where("teamIds", "array-contains", teamId).get()
    : await db.collection("users").get();
  const all = [];
  const tokenToUid = new Map();
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

async function adminUids() {
  const snap = await db.collection("users").where("role", "==", "admin").get();
  return snap.docs.map((d) => d.id);
}

// Coaches of one team (role admin on that team) plus the org admin, who
// coaches all three. Used wherever a push must reach "the coaches" of the
// team a doc belongs to — never the whole program.
async function coachUidsForTeam(teamId) {
  if (!teamId) return adminUids();
  const snap = await db.collection("users").where("teamIds", "array-contains", teamId).get();
  return snap.docs.filter((d) => d.data().role === "admin" || d.data().role === "orgAdmin").map((d) => d.id);
}

// Resolve an assignment/visibleTo audience to FCM tokens. Empty audience =
// everyone; otherwise the union of listed emails + members of listed groups
// (group memberUids may hold either uids or emails).
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
  return tokensForUids([...recipientUids, ...directUids], { excludeUid });
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

// Human lead-time label, e.g. "1 hour", "30 min", "2 days".
function humanLead(min) {
  const m = Math.round(Number(min) || 0);
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d > 1 ? "s" : ""}`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h > 1 ? "s" : ""}`; }
  return `${m} min`;
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
  else if (data.attachment?.type === "image") body = "📷 Sent a photo";
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

// Direct messages: notify only the people in the thread — the player who owns
// it (threadId) plus the coaches of that team — never the whole team.
exports.onDMCreated = onDocumentCreated("dms/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const body = trunc(data.text);
  if (!body) return;
  const admins = await coachUidsForTeam(data.teamId);
  const recipients = [...new Set([data.threadId, ...admins])].filter((uid) => uid && uid !== data.senderUid);
  const bundle = await tokensForUids(recipients);
  await sendToTokens(bundle, {
    title: `💬 ${data.senderName || "Direct message"}`,
    body,
    link: "/?tab=messages",
    tag: `dm-${data.threadId}`,
  });
});

// Assignments / to-dos: notify only the players the assignment is for.
exports.onAssignmentCreated = onDocumentCreated("assignments/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const bundle = await tokensForAudience(data.visibleTo, { teamId: data.teamId, excludeUid: data.createdByUid });
  await sendToTokens(bundle, {
    title: `✅ New: ${data.title || data.workoutName || "Assignment"}`,
    body: trunc(data.body || (data.link ? "Tap to open the link." : "Tap for details.")),
    link: "/?tab=home",
    tag: `assignment-${event.params.id}`,
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

// Pre-event auto reminders/polls: an event may carry a `reminders` array
// ([{ id, type, offsetMin, channel?, question? }]) plus `startAt` (absolute
// start instant). On every event write we reconcile the derived `scheduled`
// docs — delete the event's un-sent ones and recreate any whose fire time
// (startAt − offset) is still in the future. runScheduled then fires them.
exports.onEventReminderSync = onDocumentWritten("events/{id}", async (event) => {
  const id = event.params.id;
  const after = event.data?.after?.data();
  const existing = await db.collection("scheduled").where("eventId", "==", id).get();
  const batch = db.batch();
  existing.forEach((doc) => { if (!doc.data().sent) batch.delete(doc.ref); });

  const reminders = after && Array.isArray(after.reminders) ? after.reminders : [];
  const startMs = after?.startAt?.toMillis ? after.startAt.toMillis() : 0;
  if (after && reminders.length && startMs) {
    for (const r of reminders) {
      const offset = Math.max(0, Math.round(Number(r.offsetMin) || 0));
      const sendMs = startMs - offset * 60000;
      if (sendMs <= Date.now()) continue; // fire time already passed
      const ref = db.collection("scheduled").doc();
      const common = {
        eventId: id, teamId: after.teamId || null, reminderId: r.id || ref.id, auto: true, sent: false,
        sendAt: Timestamp.fromMillis(sendMs),
        createdByUid: after.runByUid || "", createdByName: after.runByName || "Coach", createdByInitials: "",
        createdAt: Timestamp.now(),
      };
      if (r.type === "poll") {
        batch.set(ref, {
          ...common, type: "poll",
          question: (r.question || "").trim() || `Who's making ${after.title || "it"}?`,
          options: Array.isArray(r.options) && r.options.length ? r.options : ["In", "Out", "Maybe"],
          channel: r.channel || "team", channelName: r.channelName || "Team",
        });
      } else {
        const when = [after.date, after.start && `at ${after.start}`, after.location && `· ${after.location}`].filter(Boolean).join(" ");
        batch.set(ref, {
          ...common, type: "reminder",
          title: `⏰ ${after.title || after.type || "Event"} in ${humanLead(offset)}`,
          body: when || "Tap for details.",
          visibleTo: after.visibleTo || { groupIds: [], uids: [] },
        });
      }
    }
  }
  await batch.commit();
});

// ── custom push notifications ─────────────────────────────────────────────
// A coach (or the org admin) sends a custom push now, from the app's "Send
// notification" tool. The push goes out immediately, team-scoped, to the
// notification's audience (resolved from `audienceKeys`, the same array the
// security rules enforce on reads). The send is recorded in
// `pushNotifications` with status "sent" so the coach sees it in the
// composer's history. Scheduled / recurring notifications are NOT sent here —
// they're stored by the client and picked up by runScheduled below.
exports.sendPushNotification = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to send a notification.");
  const { teamId, title, body, audienceKeys, visibleTo } = request.data || {};
  if (!teamId || typeof teamId !== "string") throw new HttpsError("invalid-argument", "A team is required.");
  const cleanTitle = String(title || "").trim();
  const cleanBody = String(body || "").trim();
  if (!cleanTitle && !cleanBody) throw new HttpsError("invalid-argument", "Add a title or message.");
  // Only a coach of that team (or the org admin, who coaches all three) may
  // push to it — never a player, and never to another team.
  const caller = await db.doc(`users/${request.auth.uid}`).get();
  const c = caller.exists ? caller.data() : {};
  const isOrgAdmin = c.role === "orgAdmin";
  const isTeamCoach = c.role === "admin" && Array.isArray(c.teamIds) && c.teamIds.includes(teamId);
  if (!isOrgAdmin && !isTeamCoach) throw new HttpsError("permission-denied", "Only a coach of this team can send notifications.");
  const bundle = await tokensForAudienceKeys(audienceKeys, { teamId });
  await sendToTokens(bundle, {
    title: cleanTitle || "Team notification",
    body: trunc(cleanBody || "Tap to open the app."),
    link: "/?tab=home",
    tag: `push-${Date.now()}`,
  });
  const ref = await db.collection("pushNotifications").add({
    teamId,
    title: cleanTitle,
    body: cleanBody,
    audienceKeys: Array.isArray(audienceKeys) ? audienceKeys : ["*"],
    visibleTo: visibleTo || { groupIds: [], emails: [] },
    sendAt: Timestamp.now(),
    recurrence: { type: "none", time: "", days: [] },
    status: "sent",
    sentAt: Timestamp.now(),
    createdByUid: request.auth.uid,
    createdByName: c.name || "Coach",
    createdAt: Timestamp.now(),
  });
  return { id: ref.id, sent: true };
});

// ── scheduled reminders + polls ─────────────────────────────────────────────
// Coaches create docs in `scheduled` with a future `sendAt`. This cron sweeps
// every 5 minutes and fires anything now due: a "reminder" fans out as a push
// to its audience; a "poll" is posted into a chat channel as a normal poll
// message (which the onMessageCreated trigger then pushes to the team).

async function channelAudienceKeys(channel) {
  if (!channel || channel === "team") return ["*"];
  const g = await db.doc(`chatGroups/${channel}`).get();
  const keys = g.exists ? (g.data().audienceKeys || ["*"]) : ["*"];
  return Array.isArray(keys) && keys.length ? keys : ["*"];
}

// ── recurrence (timezone-aware) ──
// Repeat is expressed as a set of weekdays (0=Sun … 6=Sat) plus the item's
// local clock time, evaluated in the coach's IANA timezone. daily = all 7
// days, weekly = one day, custom = whichever days were picked.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function partsInTz(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  return p;
}
// Offset (ms) between the given tz's wall clock and UTC at `date`.
function tzOffsetMs(date, tz) {
  const p = partsInTz(date, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - (Math.floor(date.getTime() / 1000) * 1000);
}
// Absolute ms for a wall-clock time (y,mo,d,h,mi) in tz. Two-pass to settle DST.
function zonedTime(y, mo, d, h, mi, tz) {
  let ts = Date.UTC(y, mo, d, h, mi, 0) - tzOffsetMs(new Date(Date.UTC(y, mo, d, h, mi, 0)), tz);
  ts = Date.UTC(y, mo, d, h, mi, 0) - tzOffsetMs(new Date(ts), tz);
  return ts;
}
// Next instant strictly after `nowMs` that falls on one of `repeatDays` at the
// local (h:mi) in tz. Looks ahead up to 14 days (covers weekly + custom).
function nextRecurring(nowMs, repeatDays, h, mi, tz) {
  const base = partsInTz(new Date(nowMs), tz);
  const y0 = +base.year, m0 = +base.month - 1, d0 = +base.day;
  for (let i = 0; i < 14; i++) {
    const probe = partsInTz(new Date(Date.UTC(y0, m0, d0 + i, 12, 0, 0)), tz);
    const wd = WEEKDAYS.indexOf(probe.weekday);
    if (!repeatDays.includes(wd)) continue;
    const ts = zonedTime(+probe.year, +probe.month - 1, +probe.day, h, mi, tz);
    if (ts > nowMs) return ts;
  }
  return null;
}

// Default hour (local, America/Phoenix) after which a player who hasn't
// logged wellness today gets one push reminder. Matches the per-team
// `wellnessNudgeHour` in src/data/teams.js.
const WELLNESS_NUDGE_HOUR = 8;

exports.runScheduled = onSchedule("every 5 minutes", async () => {
  const now = Timestamp.now();
  await processScheduledItems(now);
  await processPushNotifications(now);
  await processWellnessNudges();
});

async function processScheduledItems(now) {
  // Range-only query (single-field index, auto-created); filter `sent` in JS so
  // no composite index is required.
  const snap = await db.collection("scheduled").where("sendAt", "<=", now).get();
  const due = snap.docs.filter((d) => !d.data().sent);
  if (!due.length) { console.log("No scheduled items due."); return; }
  for (const doc of due) {
    const d = doc.data();
    try {
      if (d.type === "poll") {
        const audienceKeys = await channelAudienceKeys(d.channel);
        await db.collection("messages").add({
          senderUid: d.createdByUid || "",
          sender: d.createdByName || "Coach",
          initials: d.createdByInitials || "",
          text: "",
          pinned: false,
          channel: d.channel || "team",
          teamId: d.teamId || null,
          audienceKeys,
          isCoach: true,
          readBy: {},
          kind: "poll",
          question: d.question || "Poll",
          options: Array.isArray(d.options) ? d.options : [],
          votes: {},
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
        const tz = d.tz || "America/Phoenix";
        const cur = partsInTz(d.sendAt.toDate(), tz);
        const next = nextRecurring(Date.now(), days, +cur.hour % 24, +cur.minute, tz);
        if (next) await doc.ref.update({ sendAt: Timestamp.fromMillis(next), lastSentAt: Timestamp.now() });
        else await doc.ref.update({ sent: true, sentAt: Timestamp.now() });
      } else {
        await doc.ref.update({ sent: true, sentAt: Timestamp.now() });
      }
    } catch (e) {
      console.error("scheduled item failed:", doc.id, e);
    }
  }
}

// Custom push notifications (see sendPushNotification above): sweep the
// `pushNotifications` queue for anything due. A one-off is marked sent; a
// recurring one advances to its next occurrence (same timezone-aware
// recurrence as scheduled items) instead of finishing.
async function processPushNotifications(now) {
  // Range-only query; filter `status` in JS so no composite index is needed
  // (same pattern as processScheduledItems above).
  const snap = await db.collection("pushNotifications").where("sendAt", "<=", now).get();
  const due = snap.docs.filter((d) => d.data().status === "scheduled");
  if (!due.length) { console.log("No push notifications due."); return; }
  for (const doc of due) {
    const d = doc.data();
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
        const tz = d.tz || "America/Phoenix";
        const [hh, mm] = String(r.time || "08:00").split(":").map((n) => parseInt(n, 10) || 0);
        const next = nextRecurring(Date.now(), days, hh, mm, tz);
        if (next) await doc.ref.update({ sendAt: Timestamp.fromMillis(next), lastSentAt: Timestamp.now() });
        else await doc.ref.update({ status: "sent", sentAt: Timestamp.now() });
      } else {
        await doc.ref.update({ status: "sent", sentAt: Timestamp.now() });
      }
    } catch (e) {
      console.error("push notification failed:", doc.id, e);
    }
  }
}

// Daily wellness auto-nudge: once the local clock passes the nudge hour
// (default 8:00 AM America/Phoenix), every player who has NOT logged wellness
// today gets one push reminder ("Log your wellness for today"). A marker doc
// in `wellnessNudges` (id `${uid}_${date}`, one per player per day)
// guarantees nobody is nudged twice in one day, even if the function runs
// many times or the player is on more than one team. Coaches/admins are not
// nudged — only players. The "logged today" check is team-agnostic (a player
// has one wellness doc per day, id `${uid}_${date}`), so logging under any
// team counts.
async function processWellnessNudges() {
  const tz = "America/Phoenix";
  const local = partsInTz(new Date(), tz);
  if (+local.hour < WELLNESS_NUDGE_HOUR) return; // too early — wait for the cutoff
  // The client's wellness doc date is the UTC date (toISOString), so match it.
  const today = new Date().toISOString().slice(0, 10);
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
}

// ── tester feedback → email (via Gmail) ─────────────────────────────────────
// Sends from the same Google account that owns this Firebase project, so the
// app password below belongs to it too — Gmail SMTP requires the authenticated
// user and the From address to match, so these can't drift apart.
// Set the app password once (generated at myaccount.google.com → Security →
// 2-Step Verification → App passwords, signed in as the account below):
//   firebase functions:secrets:set GMAIL_APP_PASSWORD
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const FEEDBACK_FROM = "phoenixcollegesoccer@gmail.com";
const FEEDBACK_TO = "phoenixcollegesoccer@gmail.com";

exports.onFeedbackCreated = onDocumentCreated(
  { document: "feedback/{id}", secrets: [GMAIL_APP_PASSWORD] },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.text) return;
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: FEEDBACK_FROM, pass: GMAIL_APP_PASSWORD.value() },
    });
    const who = `${data.fromName || "A tester"} · ${data.fromEmail || "no email"} · ${data.role || "member"}`;
    await transporter.sendMail({
      from: `TeamHub Feedback <${FEEDBACK_FROM}>`,
      to: FEEDBACK_TO,
      replyTo: data.fromEmail || FEEDBACK_FROM,
      subject: `TeamHub feedback — ${data.fromName || "a tester"}`,
      text: `${data.text}\n\n— ${who}\nSent: ${new Date().toISOString()}`,
    });
  },
);
