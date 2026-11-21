const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  TEAM_TZ, partsInTz, tzOffsetMs, zonedTime, nextRecurring, dateKeyInTz, humanLead,
} = require("../lib/time");

const iso = (ms) => new Date(ms).toISOString();

test("TEAM_TZ is Arizona time", () => {
  assert.equal(TEAM_TZ, "America/Phoenix");
});

test("dateKeyInTz: Phoenix evening is still the previous UTC day", () => {
  // 7:00 PM Friday 20 Nov in Phoenix (UTC-7) — already Saturday in UTC.
  assert.equal(dateKeyInTz(new Date("2026-11-21T02:00:00Z"), TEAM_TZ), "2026-11-20");
  assert.equal(new Date("2026-11-21T02:00:00Z").toISOString().slice(0, 10), "2026-11-21");
});

test("dateKeyInTz: morning, midnight boundary and zero padding", () => {
  assert.equal(dateKeyInTz(new Date("2026-11-21T15:00:00Z"), TEAM_TZ), "2026-11-21");
  assert.equal(dateKeyInTz(new Date("2026-03-05T06:59:59Z"), TEAM_TZ), "2026-03-04");
  assert.equal(dateKeyInTz(new Date("2026-03-05T07:00:00Z"), TEAM_TZ), "2026-03-05");
  assert.equal(dateKeyInTz(new Date("2026-01-01T12:00:00Z"), "UTC"), "2026-01-01");
});

test("tzOffsetMs: Phoenix is a fixed UTC-7 (no DST)", () => {
  assert.equal(tzOffsetMs(new Date("2026-01-15T12:00:00Z"), TEAM_TZ), -7 * 3600e3);
  assert.equal(tzOffsetMs(new Date("2026-07-15T12:00:00Z"), TEAM_TZ), -7 * 3600e3);
});

test("zonedTime: wall clock to instant", () => {
  // 7:00 AM Phoenix = 14:00 UTC.
  assert.equal(iso(zonedTime(2026, 10, 20, 7, 0, TEAM_TZ)), "2026-11-20T14:00:00.000Z");
  // DST zone: 9:00 AM New York in July (EDT, UTC-4) and January (EST, UTC-5).
  assert.equal(iso(zonedTime(2026, 6, 1, 9, 0, "America/New_York")), "2026-07-01T13:00:00.000Z");
  assert.equal(iso(zonedTime(2026, 0, 15, 9, 0, "America/New_York")), "2026-01-15T14:00:00.000Z");
});

test("partsInTz: weekday and fields", () => {
  const p = partsInTz(new Date("2026-11-21T02:00:00Z"), TEAM_TZ);
  assert.equal(p.weekday, "Fri");
  assert.equal(+p.hour % 24, 19);
  assert.equal(p.day, "20");
});

test("nextRecurring: later today when the time hasn't passed yet", () => {
  // Fri 20 Nov 2026, 6:00 AM Phoenix; daily at 8:00.
  const now = Date.parse("2026-11-20T13:00:00Z");
  assert.equal(iso(nextRecurring(now, [0, 1, 2, 3, 4, 5, 6], 8, 0, TEAM_TZ)), "2026-11-20T15:00:00.000Z");
});

test("nextRecurring: strictly after now — tomorrow when today's slot is now/past", () => {
  const now = Date.parse("2026-11-20T15:00:00Z"); // exactly 8:00 AM Phoenix
  assert.equal(iso(nextRecurring(now, [0, 1, 2, 3, 4, 5, 6], 8, 0, TEAM_TZ)), "2026-11-21T15:00:00.000Z");
});

test("nextRecurring: weekly picks the next matching weekday", () => {
  // From Fri 20 Nov (evening Phoenix), next Monday 16:30 → Mon 23 Nov.
  const now = Date.parse("2026-11-21T02:00:00Z");
  assert.equal(iso(nextRecurring(now, [1], 16, 30, TEAM_TZ)), "2026-11-23T23:30:00.000Z");
  // Same weekday as today but time passed → a week later.
  assert.equal(iso(nextRecurring(now, [5], 9, 0, TEAM_TZ)), "2026-11-27T16:00:00.000Z");
});

test("nextRecurring: no repeat days → null", () => {
  assert.equal(nextRecurring(Date.now(), [], 8, 0, TEAM_TZ), null);
});

test("humanLead labels", () => {
  assert.equal(humanLead(30), "30 min");
  assert.equal(humanLead(60), "1 hour");
  assert.equal(humanLead(120), "2 hours");
  assert.equal(humanLead(1440), "1 day");
  assert.equal(humanLead(2880), "2 days");
  assert.equal(humanLead(90), "90 min");
});
