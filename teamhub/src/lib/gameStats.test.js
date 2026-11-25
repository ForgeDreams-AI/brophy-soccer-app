import { describe, it, expect } from "vitest";
import { onFieldSpells, plusMinus, playerProfile, clockMs, possessionTotals, switchPossession, pausePossession, resumePossession, ballOwner, takeBall, possessionEvents, lastPasserTo, score, minutesPlayed, onFieldNow, playerLines, teamTotals, seasonLines, record } from "./gameStats";

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

describe("edge cases", () => {
  it("pause/resume keeps possession with the same side", () => {
    let p = switchPossession(null, "them", 0);
    p = pausePossession(p, 10_000);
    expect(p.holder).toBeNull();
    expect(p.resume).toBe("them");
    expect(possessionTotals(p, 999_999).themMs).toBe(10_000); // paused time not counted
    p = resumePossession(p, 50_000);
    expect(p.holder).toBe("them");
    expect(possessionTotals(p, 55_000).themMs).toBe(15_000);
  });
  it("resume with nobody remembered stays off", () => {
    expect(resumePossession({ holder: null, usMs: 5, themMs: 0 }, 10).holder).toBeNull();
  });
  it("player subbed off and back on gets both spells", () => {
    const ev = [
      { type: "sub", outUid: "a", inUid: "c", ms: 20 * 60000 },
      { type: "sub", outUid: "c", inUid: "a", ms: 50 * 60000 },
    ];
    expect(minutesPlayed(["a"], ev, 80 * 60000)).toEqual({ a: 50, c: 30 });
    expect(onFieldNow(["a", "b"], ev)).toEqual(["a", "b"]);
  });
  it("adding a player with no one off", () => {
    const ev = [{ type: "sub", outUid: "__none__", inUid: "z", ms: 10 * 60000 }];
    expect(onFieldNow(["a"], ev)).toEqual(["a", "z"]);
    expect(minutesPlayed(["a"], ev, 40 * 60000)).toEqual({ a: 40, z: 30 });
  });
  it("events without ms / unknown types don't crash", () => {
    const l = playerLines({ starters: [] }, [{ type: "weird", uid: "a" }, { type: "goal", uid: "a" }]);
    expect(l.a.goal).toBe(1);
    expect(score([{ type: "goal" }, {}]).us).toBe(1);
  });
  it("cards and fouls count in team totals", () => {
    const t = teamTotals({}, [{ type: "yellow", uid: "a" }, { type: "red", uid: "a" }, { type: "foul", uid: "b" }]);
    expect([t.yellow, t.red, t.fouls]).toEqual([1, 1, 1]);
    expect(t.possession).toBeNull();
  });
});

describe("tap-to-possess", () => {
  const them = { side: "them", uid: null };
  const joey = { side: "us", uid: "j" };
  const kel = { side: "us", uid: "k" };
  it("won / pass / lost are automatic", () => {
    expect(possessionEvents(them, joey)).toEqual([{ type: "won", uid: "j", prevSide: "them", prevUid: null }]);
    expect(possessionEvents(joey, kel)).toEqual([{ type: "pass", uid: "j", toUid: "k", prevSide: "us", prevUid: "j" }]);
    expect(possessionEvents(kel, them)).toEqual([{ type: "lost", uid: "k", prevSide: "us", prevUid: "k" }]);
  });
  it("no stat for kickoff, same player, or unknown carrier", () => {
    expect(possessionEvents({ side: null }, joey)).toEqual([]);
    expect(possessionEvents(joey, joey)).toEqual([]);
    expect(possessionEvents({ side: "us", uid: null }, joey)).toEqual([]);
    expect(possessionEvents(them, them)).toEqual([]);
  });
  it("takeBall counts time only while running and keeps the carrier", () => {
    let p = takeBall(null, "us", "j", true, 0);
    expect(ballOwner(p)).toEqual({ side: "us", uid: "j" });
    p = takeBall(p, "them", null, true, 30_000);
    expect(possessionTotals(p, 40_000)).toMatchObject({ usMs: 30_000, themMs: 10_000 });
    p = pausePossession(p, 40_000);
    p = takeBall(p, "us", "k", false, 50_000); // tapped during a stoppage
    expect(possessionTotals(p, 90_000)).toMatchObject({ usMs: 30_000, themMs: 10_000 });
    expect(ballOwner(p)).toEqual({ side: "us", uid: "k" });
    p = resumePossession(p, 100_000);
    expect(ballOwner(p)).toEqual({ side: "us", uid: "k" });
    expect(possessionTotals(p, 105_000).usMs).toBe(35_000);
  });
  it("last passer only when the pass was the latest tap", () => {
    const ev = [{ type: "pass", uid: "j", toUid: "k", ts: 2 }, { type: "won", uid: "j", ts: 1 }];
    expect(lastPasserTo(ev, "k")).toBe("j");
    expect(lastPasserTo([...ev, { type: "lost", uid: "k", ts: 3 }], "k")).toBeNull();
    expect(lastPasserTo(ev, "x")).toBeNull();
  });
  it("passes and turnovers count", () => {
    const t = teamTotals({}, [{ type: "pass", uid: "j", toUid: "k" }, { type: "lost", uid: "k" }]);
    expect([t.passes, t.turnovers]).toEqual([1, 1]);
    expect(playerLines({}, [{ type: "pass", uid: "j", toUid: "k" }]).j.pass).toBe(1);
  });
});

describe("player profile (My Stats)", () => {
  const g1 = { id: "g1", date: "2026-11-01", starters: ["a", "b"], clock: { elapsedMs: 80 * 60000 }, status: "final" };
  const g2 = { id: "g2", date: "2026-11-08", starters: ["b"], clock: { elapsedMs: 80 * 60000 }, status: "final" };
  const ev = {
    g1: [
      { type: "goal", uid: "a", ms: 10 * 60000, x: 0.5, y: 0.2, ts: 1 },
      { type: "pass", uid: "b", toUid: "a", ms: 20 * 60000, ts: 2 },
      { type: "shot_off", uid: "a", ms: 21 * 60000, ts: 3 },
      { type: "opp_goal", ms: 50 * 60000, ts: 4 },
      { type: "sub", outUid: "a", inUid: "c", ms: 40 * 60000, ts: 5 },
      { type: "lost", uid: "a", ms: 30 * 60000, ts: 6 },
      { type: "pass", uid: "a", toUid: "b", ms: 31 * 60000, ts: 7 },
    ],
    g2: [{ type: "sub", outUid: "b", inUid: "a", ms: 60 * 60000 }, { type: "goal", uid: "a", ms: 70 * 60000 }],
  };
  it("totals, starts, minutes, plus/minus", () => {
    const pr = playerProfile("a", [g1, g2], ev);
    expect(pr.totals).toMatchObject({ games: 2, starts: 1, minutes: 60, goal: 2, shots: 3, pass: 1, lost: 1, received: 1 });
    expect(pr.totals.gf).toBe(2); // goal at 10' (on) + goal at 70' in g2 (on from 60')
    expect(pr.totals.ga).toBe(0); // opp goal at 50' — already subbed off at 40'
    expect(pr.log[0].game.id).toBe("g2"); // newest first
    expect(pr.shots).toHaveLength(1); // only shots with a spot
  });
  it("rates", () => {
    const pr = playerProfile("a", [g1, g2], ev);
    expect(pr.rates.conversion).toBe(67);
    expect(pr.rates.passCompletion).toBe(50);
    expect(pr.rates.goalsPer80).toBe(2.7);
    expect(pr.passFrom[0]).toEqual({ uid: "b", n: 1 });
    expect(pr.passTo[0]).toEqual({ uid: "b", n: 1 });
  });
  it("player with no games", () => {
    const pr = playerProfile("zz", [g1], ev);
    expect(pr.totals.games).toBe(0);
    expect(pr.rates.conversion).toBeNull();
  });
  it("on-field spells", () => {
    expect(onFieldSpells(["a"], ev.g1, 80 * 60000, "a")).toEqual([[0, 40 * 60000]]);
    expect(onFieldSpells(["b"], ev.g2, 80 * 60000, "a")).toEqual([[60 * 60000, 80 * 60000]]);
    expect(plusMinus(g1, ev.g1, "c")).toEqual({ gf: 0, ga: 1, diff: -1 });
  });
});

describe("possession by half is recorded automatically", () => {
  it("splits time into the half being played", () => {
    let p = takeBall({ half: 1 }, "us", "j", true, 0);
    p = takeBall(p, "them", null, true, 30_000);           // 30s us in half 1
    p = { ...switchPossession(p, null, 40_000), half: 2 }; // 10s them, then halftime
    p = takeBall(p, "us", "k", true, 100_000);
    p = switchPossession(p, null, 120_000);                // 20s us in half 2
    expect(p.byHalf).toEqual({ 1: { us: 30_000, them: 10_000 }, 2: { us: 20_000, them: 0 } });
  });
});

describe("applyAliases (not-yet-joined players)", () => {
  it("re-points stand-in ids to the joined account everywhere", async () => {
    const { applyAliases, playerLines } = await import("./gameStats.js");
    const games = Object.assign([{ id: "g", starters: ["sheet:Brannen Marks", "u2"], roster: { "sheet:Brannen Marks": { name: "Brannen Marks" } } }], { loading: false });
    const events = [
      { id: "1", gameId: "g", type: "goal", uid: "sheet:Brannen Marks", ms: 1000 },
      { id: "2", gameId: "g", type: "pass", uid: "u2", toUid: "sheet:Brannen Marks", ms: 2000 },
      { id: "3", gameId: "g", type: "sub", outUid: "sheet:Brannen Marks", inUid: "u3", ms: 3000 },
    ];
    const { games: g, events: e } = applyAliases(games, events, { "sheet:Brannen Marks": "u1" });
    expect(g[0].starters).toEqual(["u1", "u2"]);
    expect(Object.keys(g[0].roster)).toEqual(["u1"]);
    expect(e.map((x) => [x.uid, x.toUid, x.outUid])).toEqual([["u1", undefined, undefined], ["u2", "u1", undefined], [undefined, undefined, "u1"]]);
    expect(playerLines(g[0], e).u1.goal).toBe(1);
  });
  it("is a no-op without aliases and keeps the loading flag", async () => {
    const { applyAliases } = await import("./gameStats.js");
    const games = Object.assign([], { loading: true });
    expect(applyAliases(games, [], {}).games.loading).toBe(true);
    expect(applyAliases(games, [], { a: "b" }).games.loading).toBe(true);
  });
});

describe("trackerStatus (one tracker at a time)", () => {
  it("free / mine / other, and a stale hold is free", async () => {
    const { trackerStatus, TRACKER_STALE_MS } = await import("./gameStats.js");
    const now = 1_000_000;
    expect(trackerStatus(null, "a", now)).toBe("free");
    expect(trackerStatus({ uid: "a", at: now - 1000 }, "a", now)).toBe("mine");
    expect(trackerStatus({ uid: "b", at: now - 1000 }, "a", now)).toBe("other");
    expect(trackerStatus({ uid: "b", at: now - TRACKER_STALE_MS - 1 }, "a", now)).toBe("free");
  });
});
