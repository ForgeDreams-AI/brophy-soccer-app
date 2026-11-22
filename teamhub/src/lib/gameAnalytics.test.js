import { describe, it, expect } from "vitest";
import {
  shotZone, shotZones, shotSources, chains, passCompletion, passNetwork, turnoverDamage, regainValue,
  possessionByHalf, goalsByPeriod, firstGoalImpact, scoreStates, pairPlusMinus, startRecords, subImpact,
  minutesLoad, teamSeason, bestXI,
} from "./gameAnalytics";

const M = 60000;
let ts = 0; const E = (o) => ({ ts: ++ts, half: 1, ...o });

describe("shots", () => {
  it("zones and distance", () => {
    expect(shotZone(0.5, 0.05)).toMatchObject({ zone: "six", central: true });
    expect(shotZone(0.3, 0.2)).toMatchObject({ zone: "box", central: false });
    expect(shotZone(0.5, 0.5)).toMatchObject({ zone: "outside", yds: 29 });
    const z = shotZones([{ type: "goal", x: 0.5, y: 0.05 }, { type: "shot_off", x: 0.5, y: 0.5 }, { type: "shot_on" }]);
    expect(z.zones.six).toMatchObject({ shots: 1, goals: 1, conversion: 100 });
    expect(z.zones.outside.conversion).toBe(0);
    expect(z.mapped).toBe(2);
  });
  it("sources", () => {
    const s = shotSources([
      E({ type: "pass", uid: "a", toUid: "b", ms: 1 }), E({ type: "goal", uid: "b", ms: 2 }), E({ type: "assist", uid: "a", ms: 2 }),
      E({ type: "won", uid: "c", ms: 3 }), E({ type: "shot_off", uid: "c", ms: 4 }),
      E({ type: "shot_on", uid: "d", ms: 5 }),
    ]);
    expect(s.afterPass).toEqual({ shots: 1, goals: 1 });
    expect(s.afterWin).toEqual({ shots: 1, goals: 0 });
    expect(s.other).toEqual({ shots: 1, goals: 0 });
  });
});

describe("possession & passing", () => {
  const ev = [
    E({ type: "won", uid: "a", ms: 1 }), E({ type: "pass", uid: "a", toUid: "b", ms: 2 }), E({ type: "pass", uid: "b", toUid: "a", ms: 3 }),
    E({ type: "shot_on", uid: "a", ms: 4 }),
    E({ type: "won", uid: "c", ms: 5 }), E({ type: "lost", uid: "c", ms: 6 }),
    E({ type: "opp_shot", ms: 20000 }),
    E({ type: "won", uid: "b", ms: 70000, half: 2 }), E({ type: "pass", uid: "b", toUid: "a", ms: 71000, half: 2 }), E({ type: "goal", uid: "a", ms: 80000, half: 2 }),
  ];
  it("chains", () => {
    const c = chains(ev);
    expect(c.count).toBe(3);
    expect(c.longest).toBe(2);
    expect(c.endedInShot).toBe(67);
    expect(c.buckets.find((b) => b.label === "2–3")).toMatchObject({ count: 1, shots: 1 });
  });
  it("completion by half + network", () => {
    expect(passCompletion(ev)).toMatchObject({ all: 75, half1: 67, half2: 100, passes: 3, lost: 1 });
    expect(passNetwork(ev)[0]).toEqual({ from: "b", to: "a", n: 2 });
  });
  it("turnovers that led to shots, regains that led to shots", () => {
    const t = turnoverDamage(ev);
    expect(t.total).toEqual({ lost: 1, toShot: 1, toGoal: 0 });
    expect(t.perPlayer.c.toShot).toBe(1);
    const r = regainValue(ev);
    expect(r.total).toEqual({ won: 3, toShot: 2, toGoal: 1 });
  });
  it("possession by half (saved by the tracker)", () => {
    expect(possessionByHalf({ possession: { byHalf: { 1: { us: 60, them: 40 }, 2: { us: 30, them: 70 } } } })).toEqual({ 1: 60, 2: 30 });
    expect(possessionByHalf({ possession: { byHalf: {}, holder: "us", since: 0, half: 2 } }, 1000)).toEqual({ 2: 100 });
    expect(possessionByHalf({})).toEqual({});
  });
});

describe("flow", () => {
  const g1 = { id: "g1", status: "final", starters: ["a", "b"], clock: { elapsedMs: 80 * M }, date: "2026-11-01", homeAway: "home", opponent: "Jesuit" };
  const g2 = { id: "g2", status: "final", starters: ["a"], clock: { elapsedMs: 80 * M }, date: "2026-11-08", homeAway: "away", opponent: "Xavier" };
  const ebg = {
    g1: [E({ type: "opp_goal", ms: 10 * M }), E({ type: "goal", uid: "a", ms: 50 * M, half: 2 }), E({ type: "goal", uid: "b", ms: 70 * M, half: 2 }), E({ type: "shot_on", uid: "a", ms: 75 * M, half: 2 })],
    g2: [E({ type: "goal", uid: "a", ms: 5 * M }), E({ type: "sub", outUid: "a", inUid: "b", ms: 40 * M }), E({ type: "opp_goal", ms: 60 * M, half: 2 }), E({ type: "foul", uid: "b", ms: 61 * M }), E({ type: "yellow", uid: "b", ms: 61 * M })],
  };
  it("goals by period and half", () => {
    const g = goalsByPeriod([g1, g2], ebg);
    expect(g.periods[0]).toMatchObject({ for: 1, against: 1 });
    expect(g.periods[3]).toMatchObject({ for: 1, against: 0 });
    expect(g.halves[2]).toEqual({ for: 2, against: 1 });
  });
  it("first goal impact", () => {
    expect(firstGoalImpact([g1, g2], ebg)).toEqual({ scoredFirst: { w: 0, d: 1, l: 0 }, concededFirst: { w: 1, d: 0, l: 0 }, goalless: 0 });
  });
  it("score states", () => {
    const s = scoreStates([g1], ebg);
    expect(s.losing.min).toBe(40); expect(s.drawing.min).toBe(30); expect(s.winning.min).toBe(10);
    expect(s.winning.shots).toBe(1);
  });
  it("pairs, start records, sub impact, minutes load", () => {
    const pp = pairPlusMinus([g1, g2], ebg, ["a", "b"], 10);
    expect(pp.best[0]).toMatchObject({ minutes: 80, gf: 2, ga: 1, diff: 1 });
    const sr = startRecords([g1, g2], ebg, ["a", "b"]);
    expect(sr.a.starts).toMatchObject({ w: 1, d: 1, games: 2, winPct: 50, ppg: 2 });
    expect(sr.b.without).toMatchObject({ d: 1, games: 1 });
    expect(subImpact([g1, g2], ebg).b).toEqual({ apps: 1, minutes: 40, gf: 0, ga: 1 });
    const ml = minutesLoad([g1, g2], ebg, ["a", "b"]);
    expect(ml.a.season).toBe(120); expect(ml.a.heavy).toBe(false);
  });
  it("team season", () => {
    const t = teamSeason([g1, g2], ebg, ["a"]);
    expect(t.all).toMatchObject({ w: 1, d: 1, l: 0, gf: 3, ga: 2 });
    expect(t.home.w).toBe(1); expect(t.away.d).toBe(1);
    expect(t.form.map((f) => f.r)).toEqual(["W", "D"]);
    expect(t.opponents.map((o) => o.name).sort()).toEqual(["Jesuit", "Xavier"]);
    expect(t.keepers.a).toMatchObject({ games: 2, conceded: 2 });
    expect(t.discipline[0]).toMatchObject({ uid: "b", foul: 1, yellow: 1 });
  });
  it("best XI by points per start", () => {
    const rec = { a: { starts: { games: 3, ppg: 2 } }, b: { starts: { games: 3, ppg: 1 } }, c: { starts: { games: 1, ppg: 3 } } };
    expect(bestXI(rec, { GK: [], DEF: ["a", "b", "c"], MID: [], FWD: [] }).DEF).toEqual(["a", "b"]);
  });
});

describe("season numbers never mix games", () => {
  it("chains / turnovers / sources are per game", () => {
    const two = [
      { gameId: "a", type: "won", uid: "x", ms: 100, ts: 1 }, { gameId: "a", type: "pass", uid: "x", toUid: "y", ms: 200, ts: 2 },
      { gameId: "b", type: "pass", uid: "y", toUid: "x", ms: 150, ts: 3 }, { gameId: "b", type: "goal", uid: "x", ms: 250, ts: 4 },
      { gameId: "a", type: "lost", uid: "y", ms: 300, ts: 5 }, { gameId: "b", type: "opp_shot", ms: 320, ts: 6 },
    ];
    const c = chains(two);
    expect(c.longest).toBe(1); // not 2: the passes are in different games
    expect(turnoverDamage(two).total.toShot).toBe(0); // the opp shot was in the other game
    expect(shotSources(two).afterPass.goals).toBe(1);
  });
});
