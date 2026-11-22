import { describe, it, expect } from "vitest";
import { toCsv, gameCsv, seasonCsv, scorers, reportText, fileSafe } from "./gameExport";

const P = { a: { name: "Joey Fritz" }, b: { name: "Kellen Choi" }, c: { name: "O'Neil, Sam" } };
const game = { id: "g1", opponent: "Jesuit", date: "2026-11-20", homeAway: "home", status: "final", starters: ["a", "b"], clock: { elapsedMs: 80 * 60000 }, possession: { usMs: 60, themMs: 40 } };
const ev = [
  { type: "goal", uid: "a", ms: 12 * 60000, ts: 1 },
  { type: "assist", uid: "b", ms: 12 * 60000, ts: 2 },
  { type: "opp_goal", ms: 30 * 60000, ts: 3 },
  { type: "goal", uid: "c", ms: 70 * 60000, ts: 4 },
  { type: "sub", outUid: "b", inUid: "c", ms: 60 * 60000, ts: 5 },
];

describe("csv", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "x\ny", 3]])).toBe('"a,b","say ""hi""","x\ny",3\r\n');
  });
  it("game csv has summary, players and timeline", () => {
    const csv = gameCsv(game, ev, P);
    expect(csv).toContain("Game,Brophy vs Jesuit");
    expect(csv).toContain("Result,W 2-1");
    expect(csv).toContain("Possession %,60");
    expect(csv).toMatch(/Joey Fritz,80,1,0,1,1/);
    expect(csv).toContain('"O\'Neil, Sam",20,1');
    expect(csv).toMatch(/13,Goal,Joey Fritz/);
    expect(csv).toContain(`"O'Neil, Sam on for Kellen Choi"`);
  });
  it("season csv has record and games", () => {
    const csv = seasonCsv([game], { g1: ev }, P);
    expect(csv).toContain("Record (W-D-L),1-0-0");
    expect(csv).toContain("2026-11-20,Jesuit,Home,W,2-1,Final");
  });
});

describe("report text", () => {
  it("lists scorers with assists (and doesn't change the events)", () => {
    scorers(ev, P);
    expect(scorers(ev, P)).toEqual([
      { minute: 13, name: "Joey Fritz", assist: "Kellen Choi" },
      { minute: 71, name: "O'Neil, Sam", assist: "" },
    ]);
    const t = reportText(game, ev, P);
    expect(t).toContain("Win 2–1");
    expect(t).toContain("Joey Fritz 13′ (Kellen Choi)");
  });
  it("safe file names", () => expect(fileSafe("Brophy vs St. Mary's!")).toBe("Brophy-vs-St-Marys"));
});
