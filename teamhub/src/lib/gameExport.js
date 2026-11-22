// ─── Game stats exports ────────────────────────────────────────────────────
// CSV files (open in Excel / Google Sheets / Numbers) for one game or the
// whole season, plus the plain-text summary used for the team-chat post.
import { score, teamTotals, playerLines, seasonLines, record, minuteOf, ACTION_LABEL } from "./gameStats";

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const STAT_COLUMNS = [
  ["minutes", "Minutes"], ["goal", "Goals"], ["assist", "Assists"], ["shots", "Shots"], ["shot_on", "Shots on target"],
  ["key_pass", "Key passes"], ["won", "Won ball"], ["lost", "Lost ball"], ["save", "Saves"], ["foul", "Fouls"],
  ["yellow", "Yellow cards"], ["red", "Red cards"],
];

const nameOf = (playerById, uid) => playerById[uid]?.name || "Former player";
const sortRows = (lines, playerById) => Object.entries(lines)
  .sort(([a, la], [b, lb]) => (lb.goal - la.goal) || (lb.minutes - la.minutes) || nameOf(playerById, a).localeCompare(nameOf(playerById, b)));

export const resultLetter = (s) => (s.us > s.them ? "W" : s.us < s.them ? "L" : "D");
export const gameTitle = (game) => `Brophy ${game.homeAway === "away" ? "@" : "vs"} ${game.opponent || "Opponent"}`;
export const fileSafe = (s) => String(s || "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "game";

// One game: summary block, then one row per player, then the timeline.
export function gameCsv(game, events, playerById) {
  const s = score(events);
  const t = teamTotals(game, events);
  const lines = playerLines(game, events);
  const rows = [
    ["Game", gameTitle(game)], ["Date", game.date || ""], ["Result", `${resultLetter(s)} ${s.us}-${s.them}`],
    ["Possession %", t.possession ?? ""], ["Shots", t.shots], ["Shots on target", t.shotsOn], ["Opponent shots", t.oppShots],
    ["Corners", t.corners], ["Opponent corners", t.oppCorners], [],
    ["Player", ...STAT_COLUMNS.map(([, label]) => label)],
    ...sortRows(lines, playerById).map(([uid, l]) => [nameOf(playerById, uid), ...STAT_COLUMNS.map(([k]) => l[k])]),
    [], ["Minute", "Event", "Player"],
    ...[...events].sort((a, b) => (a.ms || 0) - (b.ms || 0) || (a.ts || 0) - (b.ts || 0)).map((e) => [
      minuteOf(e.ms || 0), ACTION_LABEL[e.type] || e.type,
      e.type === "sub" ? `${nameOf(playerById, e.inUid)} on${e.outUid && e.outUid !== "__none__" ? ` for ${nameOf(playerById, e.outUid)}` : ""}` : (e.uid ? nameOf(playerById, e.uid) : ""),
    ]),
  ];
  return toCsv(rows);
}

// Season: record, one row per player, then one row per game.
export function seasonCsv(games, eventsByGame, playerById) {
  const lines = seasonLines(games, eventsByGame);
  const r = record(games, eventsByGame);
  const rows = [
    ["Record (W-D-L)", `${r.w}-${r.d}-${r.l}`], [],
    ["Player", "Games", ...STAT_COLUMNS.map(([, label]) => label)],
    ...sortRows(lines, playerById).map(([uid, l]) => [nameOf(playerById, uid), l.games, ...STAT_COLUMNS.map(([k]) => l[k])]),
    [], ["Date", "Opponent", "Home/Away", "Result", "Score", "Status"],
    ...[...games].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((g) => {
      const s = score(eventsByGame[g.id] || []);
      return [g.date, g.opponent, g.homeAway === "away" ? "Away" : "Home", g.status === "final" ? resultLetter(s) : "Live", `${s.us}-${s.them}`, g.status === "final" ? "Final" : "Live"];
    }),
  ];
  return toCsv(rows);
}

// "Joey F." style list of scorers with assists: ["Joey Fritz (Kellen Choi)"].
export function scorers(events, playerById) {
  const goals = events.filter((e) => e.type === "goal").sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const assists = events.filter((e) => e.type === "assist").sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const used = new Set(); // never mutate the events themselves
  return goals.map((g) => {
    // The assist recorded right after a goal belongs to it.
    const a = assists.find((x) => (x.ts || 0) >= (g.ts || 0) && !used.has(x));
    if (a) used.add(a);
    return { minute: minuteOf(g.ms || 0), name: nameOf(playerById, g.uid), assist: a ? nameOf(playerById, a.uid) : "" };
  });
}

// Text that goes with the report in team chat.
export function reportText(game, events, playerById) {
  const s = score(events);
  const goals = scorers(events, playerById);
  const lines = [`📊 Game report: ${gameTitle(game)} — ${resultLetter(s) === "W" ? "Win" : resultLetter(s) === "L" ? "Loss" : "Draw"} ${s.us}–${s.them}`];
  if (goals.length) lines.push(`⚽ ${goals.map((g) => `${g.name} ${g.minute}′${g.assist ? ` (${g.assist})` : ""}`).join(", ")}`);
  lines.push("Your own stats are on your Home screen → Game report.");
  return lines.join("\n");
}

// Save a file: the share sheet on phones (Save to Files, Mail, Messages…),
// otherwise a normal download.
export async function shareOrDownload(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const file = typeof File !== "undefined" ? new File([blob], filename, { type }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "shared"; } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
