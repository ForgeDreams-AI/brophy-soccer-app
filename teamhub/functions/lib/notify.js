// ─── Who gets a push, and how it reads (WhatsApp-style) ────────────────────
// Per-user preferences live on users/{uid}.notifPrefs:
//   { chat, dms, announcements, schedule, reminders, library, quotes,
//     wellness: boolean (default on), preview: boolean (default on),
//     muted: { [chatKey]: untilMs | -1 (always) } }
// Chat keys: team_<teamId> (team channel), group_<channelId>, dm_<threadId>.

const CATEGORIES = ["chat", "dms", "announcements", "schedule", "reminders", "library", "quotes", "wellness"];

const chatKeyForMessage = (m) => (!m.channel || m.channel === "team" ? `team_${m.teamId}` : `group_${m.channel}`);
const chatKeyForDM = (d) => `dm_${d.threadId}`;

function isMuted(prefs, chatKey, now = Date.now()) {
  const until = prefs && prefs.muted ? prefs.muted[chatKey] : undefined;
  if (until == null) return false;
  return Number(until) === -1 || Number(until) > now;
}

// Should this user get a push of `category` (for `chatKey`)? An @mention
// gets through a muted chat (like WhatsApp), but not a category turned off.
function shouldNotify(prefs, { category, chatKey, mentioned = false, now = Date.now() } = {}) {
  if (category && prefs && prefs[category] === false) return false;
  if (chatKey && isMuted(prefs, chatKey, now) && !mentioned) return false;
  return true;
}

// Message previews in chat/DM pushes (off = "New message").
const previewOn = (prefs) => !(prefs && prefs.preview === false);

// Users @mentioned in a message: "@Joey", "@joey fritz" (first name, or full
// name with spaces removed), case-insensitive.
function mentionedUids(text, members) {
  const t = String(text || "").toLowerCase();
  if (!t.includes("@")) return [];
  const tags = new Set((t.match(/@[\p{L}\p{N}_.-]+/gu) || []).map((s) => s.slice(1).replace(/[.]+$/, "")));
  const out = [];
  for (const m of members) {
    const name = String(m.name || "").toLowerCase().trim();
    if (!name) continue;
    const first = name.split(/\s+/)[0];
    const full = name.replace(/\s+/g, "");
    if (tags.has(first) || tags.has(full) || t.includes(`@${name}`)) out.push(m.uid);
  }
  return out;
}

// One line of a grouped chat notification: "Joey: hi" in a group, "hi" in a DM.
const chatLine = ({ sender, body, isGroup }) => (isGroup && sender ? `${sender}: ${body}` : body);

module.exports = { CATEGORIES, chatKeyForMessage, chatKeyForDM, isMuted, shouldNotify, previewOn, mentionedUids, chatLine };
