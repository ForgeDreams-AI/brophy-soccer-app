// Pure, timezone-aware time helpers used by the Cloud Functions. No Firebase
// imports here, so they can be unit-tested with `node --test`.

// Every Brophy team runs on Arizona time (no DST). Wellness "today", the
// 7:00 AM event ping and the default recurrence timezone all use it.
const TEAM_TZ = "America/Phoenix";

// ── recurrence (timezone-aware) ──
// Repeat is expressed as a set of weekdays (0=Sun … 6=Sat) plus the item's
// local clock time, evaluated in the coach's IANA timezone. daily = all 7
// days, weekly = one day, custom = whichever days were picked.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Wall-clock parts (strings) of `date` in tz: year, month, day, hour,
// minute, second, weekday ("Sun"…"Sat").
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

// The calendar date (YYYY-MM-DD) of `date` in tz — e.g. the wellness "today".
function dateKeyInTz(date, tz) {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

// Human lead-time label, e.g. "1 hour", "30 min", "2 days".
function humanLead(min) {
  const m = Math.round(Number(min) || 0);
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d > 1 ? "s" : ""}`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h > 1 ? "s" : ""}`; }
  return `${m} min`;
}

module.exports = { TEAM_TZ, WEEKDAYS, partsInTz, tzOffsetMs, zonedTime, nextRecurring, dateKeyInTz, humanLead };
