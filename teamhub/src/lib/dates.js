// ─── Team time (America/Phoenix) ───────────────────────────────────────────
// ONE definition of "today" for the whole app. Brophy plays in Arizona, which
// is UTC−7 with no daylight saving. Using `new Date().toISOString()` for
// "today" (the old code) flipped the day at 5 PM local time, so evening
// wellness check-ins, water and meal markers were filed under tomorrow and
// the server's "8 AM" wellness nudge fired at 5 PM the day before.
// Every per-day doc id (`${uid}_${date}`) and every "is this event today"
// check uses teamDateKey(). The Cloud Functions use the same zone
// (functions/lib/time.js → dateKeyInTz).

export const TEAM_TZ = "America/Phoenix";

// Wall-clock parts of `date` in `tz`.
function partsInTz(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  return p;
}

// YYYY-MM-DD of `date` (default: now) on the team's clock.
export function teamDateKey(date = new Date(), tz = TEAM_TZ) {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

// Offset (ms) between tz wall clock and UTC at `date`.
function tzOffsetMs(date, tz) {
  const p = partsInTz(date, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

// Absolute Date for a team-clock date ("YYYY-MM-DD") + time ("HH:MM").
// Returns null for missing/invalid input. Independent of the device's
// timezone, so a coach whose phone is set to another zone still schedules
// reminders at the right instant.
export function zonedDate(dateStr, timeStr = "00:00", tz = TEAM_TZ) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "").trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [+dm[1], +dm[2] - 1, +dm[3]];
  const [h, mi] = [+tm[1], +tm[2]];
  if (h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo, d, h, mi, 0);
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  ts = guess - tzOffsetMs(new Date(ts), tz); // second pass settles DST zones
  const out = new Date(ts);
  return Number.isNaN(out.getTime()) ? null : out;
}

// Team-clock day key of a Firestore Timestamp / Date / millis.
export function teamDateKeyOf(ts, tz = TEAM_TZ) {
  if (!ts) return teamDateKey(new Date(), tz);
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(d.getTime()) ? teamDateKey(new Date(), tz) : teamDateKey(d, tz);
}

