import { describe, it, expect } from "vitest";
import { clockMs, possessionTotals, switchPossession, pausePossession, resumePossession, ballOwner, takeBall, possessionEvents, lastPasserTo, score, minutesPlayed, onFieldNow, playerLines, teamTotals, seasonLines, record } from "./gameStats";

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
