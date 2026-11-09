// Date helpers — LOCAL timezone throughout. The v1 app used
// `new Date().toISOString().slice(0,10)` for "today" in several places, which
// is UTC and goes off-by-one on MST evenings (breakdown §5.4). Always use
// todayKey() / formatDayKey() here instead.

const pad = (n) => String(n).padStart(2, "0");

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : new Date());

// Local YYYY-MM-DD for right now. The canonical "today" key for attendance,
// wellness, water, and streak grouping.
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Local YYYY-MM-DD for a Firestore timestamp / Date / ISO string.
// Defaults to now when ts is nullish.
export const formatDayKey = (ts) => {
  const d = toDate(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const isToday = (dayKey) => dayKey === todayKey();

// "2026-10-05" → Date at local midnight (avoids the UTC-midnight shift that
// `new Date("2026-10-05")` introduces).
export const parseDayKey = (dayKey) => {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// Shift a YYYY-MM-DD key by n days, returning a new key.
export const addDays = (dayKey, n) => {
  const d = parseDayKey(dayKey);
  d.setDate(d.getDate() + n);
  return formatDayKey(d);
};

// Relative time: "just now", "5m ago", "3h ago", "2d ago".
export const formatAgo = (ts) => {
  if (!ts) return "just now";
  const d = toDate(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// "3:45 PM" for a Firestore timestamp / Date.
export const formatTime = (ts) => {
  if (!ts) return "now";
  return toDate(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// HTML time inputs store "HH:MM" (24-hour). Convert to "h:MM AM/PM".
export const formatHourTime = (hhmm) => {
  if (!hhmm) return "";
  const [hStr, mStr] = String(hhmm).split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${(mStr || "00").padStart(2, "0")} ${period}`;
};

// Day dividers for chat / lists: TODAY / YESTERDAY / weekday / "Oct 5".
export const formatDateHeader = (ts) => {
  const d = toDate(ts);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "YESTERDAY";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  return d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
};
