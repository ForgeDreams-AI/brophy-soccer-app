import { describe, it, expect } from "vitest";
import { teamDateKey, zonedDate, teamDateKeyOf } from "./dates";

describe("teamDateKey", () => {
  it("uses Arizona time, not UTC, in the evening", () => {
    // 2026-11-21 02:00 UTC = 2026-11-20 19:00 in Phoenix
    expect(teamDateKey(new Date("2026-11-21T02:00:00Z"))).toBe("2026-11-20");
  });
  it("matches UTC date in the morning", () => {
    expect(teamDateKey(new Date("2026-11-20T15:00:00Z"))).toBe("2026-11-20");
  });
});

describe("zonedDate", () => {
  it("builds the instant for a Phoenix wall-clock time", () => {
    expect(zonedDate("2026-11-20", "15:30").toISOString()).toBe("2026-11-20T22:30:00.000Z");
  });
  it("returns null for bad input", () => {
    expect(zonedDate("", "15:00")).toBeNull();
    expect(zonedDate("2026-11-20", "")).toBeNull();
    expect(zonedDate("2026-11-20", "25:00")).toBeNull();
  });
});

describe("teamDateKeyOf", () => {
  it("accepts Firestore-like timestamps", () => {
    const ts = { toDate: () => new Date("2026-11-21T05:00:00Z") };
    expect(teamDateKeyOf(ts)).toBe("2026-11-20");
  });
});
