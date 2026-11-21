import { describe, it, expect } from "vitest";
import { namesMatch, groupByPosition } from "./rosterPositions";

describe("namesMatch", () => {
  it("matches exact, case and punctuation", () => {
    expect(namesMatch("joey fritz", "Joey Fritz")).toBe(true);
    expect(namesMatch("Bangally Jaiteh Kabba", "Bangally Jaiteh-Kabba")).toBe(true);
  });
  it("ignores middle names and accepts nicknames/initials", () => {
    expect(namesMatch("William James Osborne", "Will Osborne")).toBe(true);
    expect(namesMatch("W Osborne", "Will Osborne")).toBe(true);
  });
  it("rejects different people", () => {
    expect(namesMatch("Will Chucri", "Will Osborne")).toBe(false);
    expect(namesMatch("Jonah Fritz", "Joey Fritz")).toBe(false);
  });
});

describe("groupByPosition", () => {
  const players = [
    { id: "a", name: "Joey Fritz" },
    { id: "b", name: "Franco Coury" },
    { id: "c", name: "New Kid" },
    { id: "d", name: "Kellen Choi" },
  ];
  it("uses the sheet, coach overrides win, unknowns are unassigned", () => {
    const { groups, notJoined } = groupByPosition(players, "varsity", { d: "DEF" });
    expect(groups.FWD.map((p) => p.id)).toEqual(["a"]);
    expect(groups.GK.map((p) => p.id)).toEqual(["b"]);
    expect(groups.DEF.map((p) => p.id)).toEqual(["d"]);
    expect(groups.NONE.map((p) => p.id)).toEqual(["c"]);
    expect(notJoined.GK).toEqual(["Brannen Marks", "Carlos Ramos"]);
    expect(notJoined.MID).not.toContain("Kellen Choi");
  });
  it("other teams have no sheet: everyone unassigned until set", () => {
    const { groups } = groupByPosition(players, "jvb", { a: "MID" });
    expect(groups.MID.map((p) => p.id)).toEqual(["a"]);
    expect(groups.NONE).toHaveLength(3);
  });
});
