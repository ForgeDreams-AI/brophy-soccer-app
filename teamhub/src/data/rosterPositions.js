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
const NICK = { will: "william", alex: "alexander", max: "maxwell", joey: "joseph", eli: "elijah", franco: "francisco", conor: "connor", hugh: "hugh" };
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

// Does a school email belong to a sheet name? Brophy addresses look like
// first initial + last name + class year ("cbyers27@" → C. Byers); also
// accepts firstlast / first.last.
export function emailMatches(email, sheetName) {
  const local = String(email || "").toLowerCase().split("@")[0].replace(/[^a-z]/g, "");
  const b = parts(sheetName);
  if (!local || b.length < 2) return false;
  const last = b.slice(1).join("");
  const firsts = new Set([b[0], first(b[0])]);
  if (local === b[0][0] + last) return true;
  for (const f of firsts) if (local === f + last) return true;
  return false;
}

const looksLikeEmail = (s) => String(s || "").includes("@");
// A person (user doc or invite) matches a sheet name by name or by email.
export function personMatches(person, sheetName) {
  const name = looksLikeEmail(person.name) ? "" : person.name;
  return (name && namesMatch(name, sheetName)) || emailMatches(person.email || (looksLikeEmail(person.name) ? person.name : ""), sheetName);
}

// The name to show: the person's own name, or — when they never set one
// (it's blank or just their email) — the name from the coach's sheet.
export function displayName(person, sheetName) {
  const name = String(person.name || "").trim();
  if (name && !looksLikeEmail(name)) return name;
  if (sheetName) return sheetName;
  return String(person.email || name).split("@")[0] || "Player";
}

const initialsOf = (n) => parts(n).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Group the team's players into GK / DEF / MID / FWD (+ unassigned).
// Returns { groups: { GK: [...], ... , NONE: [...] }, notJoined: { GK: [names], ... } }
// players: people with an `id` (uid, or email for not-yet-joined invites).
// Each returned person has `name` resolved (see displayName) and `sheetName`.
export function groupByPosition(players, teamId, byUid = {}) {
  const sheet = SHEET_ROSTER[teamId] || {};
  const groups = { GK: [], DEF: [], MID: [], FWD: [], NONE: [] };
  const matchedSheet = new Set();
  for (const p of players) {
    let pos = byUid[p.id];
    let sheetName = null;
    for (const [sp, names] of Object.entries(sheet)) {
      const hit = names.find((n) => !matchedSheet.has(n) && personMatches(p, n));
      if (hit) { sheetName = hit; if (!pos) pos = sp; break; }
    }
    if (sheetName) matchedSheet.add(sheetName);
    const name = displayName(p, sheetName);
    const initials = (p.initials && !looksLikeEmail(p.name) && p.name) ? p.initials : initialsOf(name);
    groups[POSITIONS.some((x) => x.id === pos) ? pos : "NONE"].push({ ...p, name, initials, sheetName });
  }
  const byName = (x, y) => String(x.name || "").localeCompare(String(y.name || ""));
  Object.values(groups).forEach((g) => g.sort(byName));
  const notJoined = {};
  for (const [sp, names] of Object.entries(sheet)) notJoined[sp] = names.filter((n) => !matchedSheet.has(n));
  return { groups, notJoined };
}
