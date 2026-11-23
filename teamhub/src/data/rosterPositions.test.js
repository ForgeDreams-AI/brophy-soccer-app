import { describe, it, expect } from "vitest";
import { namesMatch, groupByPosition, emailMatches } from "./rosterPositions";

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
    expect(notJoined.GK).toEqual(["Brannen Marks"]);
    expect(notJoined.MID).not.toContain("Kellen Choi");
  });
  it("other teams have no sheet: everyone unassigned until set", () => {
    const { groups } = groupByPosition(players, "jvb", { a: "MID" });
    expect(groups.MID.map((p) => p.id)).toEqual(["a"]);
    expect(groups.NONE).toHaveLength(3);
  });
});

describe("emails and nicknames (from the live picker)", () => {
  it("matches Brophy-style emails", () => {
    expect(emailMatches("cbyers27@brophybroncos.org", "Conor Byers")).toBe(true);
    expect(emailMatches("ccicalese30@brophybroncos.org", "Cade Cicalese")).toBe(true);
    expect(emailMatches("bjaitehkabba27@brophybroncos.org", "Bangally Jaiteh-Kabba")).toBe(true);
    expect(emailMatches("cbyers27@brophybroncos.org", "Cade Cicalese")).toBe(false);
  });
  it("Francisco matches Franco", () => {
    expect(namesMatch("Francisco Coury", "Franco Coury")).toBe(true);
  });
  it("shows the sheet name for email-only accounts", () => {
    const { groups } = groupByPosition([{ id: "x", name: "cbyers27@brophybroncos.org", email: "cbyers27@brophybroncos.org" }], "varsity");
    expect(groups.FWD[0].name).toBe("Conor Byers");
    expect(groups.FWD[0].initials).toBe("CB");
  });
});
