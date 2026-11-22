import { describe, it, expect } from "vitest";
import { clockMs, possessionTotals, switchPossession, score, minutesPlayed, onFieldNow, playerLines, teamTotals, seasonLines, record } from "./gameStats";

describe("clock and possession", () => {
  it("adds running time", () => {
    expect(clockMs({ running: true, startedAt: 1000, elapsedMs: 5000 }, 4000)).toBe(8000);
    expect(clockMs({ running: false, startedAt: 1000, elapsedMs: 5000 }, 9999)).toBe(5000);
  });
  it("splits possession and switches", () => {
    let p = switchPossession(null, "us", 0);
    p = switchPossession(p, "them", 60_000);
    const t = possessionTotals(p, 80_000);
    expect(t.usMs).toBe(60_000);
    expect(t.themMs).toBe(20_000);
    expect(t.usPct).toBe(75);
    expect(possessionTotals(null).usPct).toBeNull();
  });
});

describe("score, minutes, on field", () => {
  const events = [
    { type: "goal", uid: "a" },
    { type: "opp_goal" },
    { type: "goal", uid: "b" },
    { type: "sub", outUid: "a", inUid: "c", ms: 30 * 60000 },
  ];
  it("scores from events", () => expect(score(events)).toEqual({ us: 2, them: 1 }));
  it("minutes follow subs", () => {
    expect(minutesPlayed(["a", "b"], events, 80 * 60000)).toEqual({ a: 30, b: 80, c: 50 });
  });
  it("on field after subs", () => expect(onFieldNow(["a", "b"], events)).toEqual(["c", "b"]));
});

describe("lines and totals", () => {
  const game = { id: "g1", starters: ["a"], clock: { running: false, elapsedMs: 80 * 60000 }, status: "final" };
  const ev = [
    { type: "goal", uid: "a" }, { type: "shot_off", uid: "a" }, { type: "shot_on", uid: "a" },
    { type: "assist", uid: "b" }, { type: "opp_shot" }, { type: "corner" },
  ];
  it("per player", () => {
    const l = playerLines(game, ev);
    expect(l.a).toMatchObject({ goal: 1, shots: 3, shot_on: 2, shot_off: 1, minutes: 80, games: 1 });
    expect(l.b.assist).toBe(1);
  });
  it("team totals", () => {
    expect(teamTotals(game, ev)).toMatchObject({ goals: 1, shots: 3, shotsOn: 2, oppShots: 1, corners: 1 });
  });
  it("season + record", () => {
    const g2 = { ...game, id: "g2" };
    const s = seasonLines([game, g2], { g1: ev, g2: [{ type: "opp_goal" }, { type: "opp_goal" }] });
    expect(s.a.goal).toBe(1);
    expect(s.a.games).toBe(2);
    expect(s.a.minutes).toBe(160);
    expect(record([game, g2], { g1: ev, g2: [{ type: "opp_goal" }] })).toEqual({ w: 1, d: 0, l: 1 });
  });
});
