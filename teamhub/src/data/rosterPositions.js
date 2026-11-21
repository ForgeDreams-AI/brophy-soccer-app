// ─── Players by position ───────────────────────────────────────────────────
// The coach's position list (Roster & Invites → Players by position).
// Starting point: the coach's roster sheet, matched to app accounts by name.
// A coach can move anyone; those choices are saved per team in
// appConfig/rosterPositions_<teamId> as { byUid: { <uid>: "GK" | ... } } and
// always win over the sheet.

export const POSITIONS = [
  { id: "GK", label: "Goalkeepers" },
  { id: "DEF", label: "Defenders" },
  { id: "MID", label: "Midfielders" },
  { id: "FWD", label: "Forwards" },
];

// From the coach's roster sheet (2026-11-21).
export const SHEET_ROSTER = {
  varsity: {
    GK: ["Brannen Marks", "Franco Coury", "Carlos Ramos"],
    DEF: ["Austin Schenk", "Gavin Hamilton", "Alex Swiergol", "Cruz Wie", "Cade Cicalese", "Eli Halpert", "Max Garske", "Miguel Suady"],
    MID: ["Shubhan Kulkarni", "Will Osborne", "Kellen Choi", "Hugh Healy", "Bangally Jaiteh-Kabba", "Brody Haegen", "Nucci Quoshili", "Lucas DiPasquale", "Stadon Pricher"],
    FWD: ["Joey Fritz", "Conor Byers", "Jackson Ducusin", "Will Chucri", "Emilio Coker", "Neal Mahoney", "Jonah Geist"],
  },
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z\s-]/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const parts = (s) => norm(s).split(" ").filter(Boolean);

// Does an app account's name match a sheet name? Exact full name, or the
// same first + last name (ignoring middle names), or the same last name with
// a matching first initial ("W. Osborne", "Will Osborne Jr" → Will Osborne).
// A common nickname pair is accepted too (Will/William, Alex/Alexander, …).
const NICK = { will: "william", alex: "alexander", max: "maxwell", joey: "joseph", eli: "elijah", cade: "cade", nucci: "nucci" };
const first = (w) => NICK[w] || w;
export function namesMatch(appName, sheetName) {
  const a = parts(appName);
  const b = parts(sheetName);
  if (!a.length || !b.length) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const aLast = a[a.length - 1];
  const bLast = b.slice(1).join(" ");
  const lastOk = aLast === b[b.length - 1] || a.slice(1).join(" ") === bLast || a.join("").endsWith(b.slice(1).join(""));
  if (!lastOk) return false;
  if (first(a[0]) === first(b[0])) return true;
  return a[0].length <= 2 && a[0][0] === b[0][0];
}

// Group the team's players into GK / DEF / MID / FWD (+ unassigned).
// Returns { groups: { GK: [...], ... , NONE: [...] }, notJoined: { GK: [names], ... } }
// players: user docs with role "player" on this team.
export function groupByPosition(players, teamId, byUid = {}) {
  const sheet = SHEET_ROSTER[teamId] || {};
  const groups = { GK: [], DEF: [], MID: [], FWD: [], NONE: [] };
  const matchedSheet = new Set();
  for (const p of players) {
    let pos = byUid[p.id];
    let sheetName = null;
    for (const [sp, names] of Object.entries(sheet)) {
      const hit = names.find((n) => !matchedSheet.has(n) && namesMatch(p.name, n));
      if (hit) { sheetName = hit; if (!pos) pos = sp; break; }
    }
    if (sheetName) matchedSheet.add(sheetName);
    groups[POSITIONS.some((x) => x.id === pos) ? pos : "NONE"].push(p);
  }
  const byName = (x, y) => String(x.name || "").localeCompare(String(y.name || ""));
  Object.values(groups).forEach((g) => g.sort(byName));
  const notJoined = {};
  for (const [sp, names] of Object.entries(sheet)) notJoined[sp] = names.filter((n) => !matchedSheet.has(n));
  return { groups, notJoined };
}
