// ─── Live game stats: pure helpers ─────────────────────────────────────────
// A game is a `games/{id}` doc (opponent, date, starters, clock, possession);
// every tap is a `gameEvents/{id}` doc { gameId, teamId, type, uid, x, y, ms }.
// Score, possession %, minutes and every stat are DERIVED from those, so
// undo (= delete the event) always fixes everything.

// Player actions, in the order the buttons appear.
export const PLAYER_ACTIONS = [
  { id: "goal", label: "Goal", short: "G", needsSpot: true, tone: "goal" },
  { id: "shot_on", label: "Shot on target", short: "SOT", needsSpot: true, tone: "good" },
  { id: "shot_off", label: "Shot off target", short: "Off", needsSpot: true, tone: "plain" },
  { id: "assist", label: "Assist", short: "A", tone: "good" },
  { id: "key_pass", label: "Key pass", short: "KP", tone: "good" },
  { id: "won", label: "Won the ball", short: "Won", tone: "good" },
  { id: "lost", label: "Lost the ball", short: "Lost", tone: "bad" },
  { id: "save", label: "Save", short: "Sv", tone: "good" },
  { id: "foul", label: "Foul", short: "F", tone: "bad" },
  { id: "yellow", label: "Yellow card", short: "YC", tone: "yellow" },
  { id: "red", label: "Red card", short: "RC", tone: "red" },
];
// Team-level buttons (no player).
export const TEAM_ACTIONS = [
  { id: "opp_goal", label: "Opponent goal" },
  { id: "opp_shot", label: "Opponent shot" },
  { id: "corner", label: "Our corner" },
  { id: "opp_corner", label: "Their corner" },
];
export const ACTION_LABEL = Object.fromEntries([...PLAYER_ACTIONS, ...TEAM_ACTIONS, { id: "sub", label: "Substitution" }, { id: "pass", label: "Pass" }].map((a) => [a.id, a.label]));

const SHOT_TYPES = new Set(["goal", "shot_on", "shot_off"]);
export const isShot = (type) => SHOT_TYPES.has(type);

// Match clock in ms. clock = { running, startedAt (ms epoch), elapsedMs, half }.
export function clockMs(clock, now = Date.now()) {
  if (!clock) return 0;
  const base = Number(clock.elapsedMs) || 0;
  return clock.running && clock.startedAt ? base + Math.max(0, now - clock.startedAt) : base;
}
export const fmtClock = (ms) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const minuteOf = (ms) => Math.floor(Math.max(0, ms) / 60000) + 1;

// Possession = { holder: "us" | "them" | null, since (ms epoch), usMs, themMs }.
export function possessionTotals(pos, now = Date.now()) {
  let us = Number(pos?.usMs) || 0;
  let them = Number(pos?.themMs) || 0;
  if (pos?.holder && pos.since != null) {
    const d = Math.max(0, now - pos.since);
    if (pos.holder === "us") us += d; else them += d;
  }
  const total = us + them;
  return { usMs: us, themMs: them, usPct: total ? Math.round((us / total) * 100) : null };
}
// Possession after switching to `holder` (null = stop counting). Also keeps
// a per-half split in byHalf (pos.half = the half being played), saved
// automatically for the analytics.
export function switchPossession(pos, holder, now = Date.now()) {
  const t = possessionTotals(pos, now);
  const half = pos?.half || 1;
  const byHalf = { ...(pos?.byHalf || {}) };
  if (pos?.holder && pos.since != null) {
    const k = String(half);
    const cur = byHalf[k] || { us: 0, them: 0 };
    byHalf[k] = { ...cur, [pos.holder]: (cur[pos.holder] || 0) + Math.max(0, now - pos.since) };
  }
  return { holder: holder || null, since: holder ? now : null, usMs: t.usMs, themMs: t.themMs, byHalf, half };
}

// Clock paused → stop counting but remember who had the ball; clock resumed
// → carry on with them. `carrier` = uid of our player on the ball.
export function pausePossession(pos, now = Date.now()) {
  return { ...switchPossession(pos, null, now), resume: pos?.holder || pos?.resume || null, carrier: pos?.carrier || null };
}
export function resumePossession(pos, now = Date.now()) {
  const holder = pos?.holder || pos?.resume || null;
  return { ...switchPossession({ ...pos, holder: null }, holder, now), resume: null, carrier: pos?.carrier || null };
}

// Who has the ball right now: { side: "us" | "them" | null, uid }.
export function ballOwner(pos) {
  const side = pos?.holder || pos?.resume || null;
  return { side, uid: side === "us" ? pos?.carrier || null : null };
}

// Give the ball to a side (and, for us, a player). While the clock is paused
// the time isn't counted, but who has it is remembered for the restart.
export function takeBall(pos, side, carrier = null, running = true, now = Date.now()) {
  const c = side === "us" ? carrier || null : null;
  if (running) return { ...switchPossession(pos, side, now), resume: null, carrier: c };
  return { ...possessionTotalsOnly(pos), byHalf: pos?.byHalf || {}, half: pos?.half || 1, holder: null, since: null, resume: side || null, carrier: c };
}
const possessionTotalsOnly = (pos) => ({ usMs: Number(pos?.usMs) || 0, themMs: Number(pos?.themMs) || 0 });

// The stats a change of possession creates on its own:
//   them → our player        : "won"  for that player
//   our player → our player  : "pass" from the first to the second
//   our player → them        : "lost" for that player
// Each event remembers where the ball was (prevSide/prevUid) so Undo can put
// it back.
export function possessionEvents(prev, next) {
  const meta = { prevSide: prev?.side || null, prevUid: prev?.uid || null };
  if (next.side === "us" && next.uid) {
    if (prev?.side === "them") return [{ type: "won", uid: next.uid, ...meta }];
    if (prev?.side === "us" && prev.uid && prev.uid !== next.uid) return [{ type: "pass", uid: prev.uid, toUid: next.uid, ...meta }];
  }
  if (next.side === "them" && prev?.side === "us" && prev.uid) return [{ type: "lost", uid: prev.uid, ...meta }];
  return [];
}

// If the most recent tap was a pass to `uid`, who passed it (for the assist
// / key pass that goes with a shot).
export function lastPasserTo(events, uid) {
  const last = [...events].filter((e) => e.type !== "sub").sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  return last && last.type === "pass" && last.toUid === uid ? last.uid : null;
}

export function score(events) {
  let us = 0;
  let them = 0;
  for (const e of events) {
    if (e.type === "goal") us += 1;
    else if (e.type === "opp_goal") them += 1;
  }
  return { us, them };
}

const emptyLine = () => ({ goal: 0, assist: 0, shots: 0, shot_on: 0, shot_off: 0, pass: 0, key_pass: 0, won: 0, lost: 0, save: 0, foul: 0, yellow: 0, red: 0, minutes: 0, games: 0 });

// Minutes each player was on the field: starters from 0, subs move people
// on/off at the event's clock time; open spells end at endMs.
export function minutesPlayed(starters = [], events = [], endMs = 0) {
  const onSince = new Map(starters.filter(Boolean).map((u) => [u, 0]));
  const total = new Map();
  const add = (u, ms) => total.set(u, (total.get(u) || 0) + Math.max(0, ms));
  const subs = events.filter((e) => e.type === "sub").sort((a, b) => (a.ms || 0) - (b.ms || 0));
  for (const s of subs) {
    if (s.outUid && onSince.has(s.outUid)) { add(s.outUid, (s.ms || 0) - onSince.get(s.outUid)); onSince.delete(s.outUid); }
    if (s.inUid && !onSince.has(s.inUid)) onSince.set(s.inUid, s.ms || 0);
  }
  for (const [u, since] of onSince) add(u, endMs - since);
  const out = {};
  for (const [u, ms] of total) out[u] = Math.round(ms / 60000);
  return out;
}

// Who is on the field right now (starters + subs applied in order).
export function onFieldNow(starters = [], events = []) {
  const on = [...starters.filter(Boolean)];
  const subs = events.filter((e) => e.type === "sub").sort((a, b) => (a.ms || 0) - (b.ms || 0));
  for (const s of subs) {
    const i = on.indexOf(s.outUid);
    if (i >= 0) on.splice(i, 1, s.inUid); else if (s.inUid && !on.includes(s.inUid)) on.push(s.inUid);
  }
  return on;
}

// Per-player lines for one game: { [uid]: line }.
export function playerLines(game, events, now = Date.now()) {
  const lines = {};
  const line = (u) => (lines[u] = lines[u] || emptyLine());
  for (const e of events) {
    if (!e.uid || e.type === "sub") continue;
    const l = line(e.uid);
    if (e.type in l) l[e.type] += 1;
    if (isShot(e.type)) l.shots += 1;
    if (e.type === "goal") l.shot_on += 1; // a goal is a shot on target too
  }
  const mins = minutesPlayed(game?.starters || [], events, clockMs(game?.clock, now));
  for (const [u, m] of Object.entries(mins)) { line(u).minutes = m; line(u).games = 1; }
  return lines;
}

// Team totals for one game.
export function teamTotals(game, events, now = Date.now()) {
  const t = { goals: 0, oppGoals: 0, shots: 0, shotsOn: 0, oppShots: 0, corners: 0, oppCorners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, turnovers: 0 };
  for (const e of events) {
    if (e.type === "goal") { t.goals += 1; t.shots += 1; t.shotsOn += 1; }
    else if (e.type === "shot_on") { t.shots += 1; t.shotsOn += 1; }
    else if (e.type === "shot_off") t.shots += 1;
    else if (e.type === "opp_goal") { t.oppGoals += 1; t.oppShots += 1; }
    else if (e.type === "opp_shot") t.oppShots += 1;
    else if (e.type === "corner") t.corners += 1;
    else if (e.type === "opp_corner") t.oppCorners += 1;
    else if (e.type === "foul") t.fouls += 1;
    else if (e.type === "yellow") t.yellow += 1;
    else if (e.type === "red") t.red += 1;
    else if (e.type === "pass") t.passes += 1;
    else if (e.type === "lost") t.turnovers += 1;
  }
  t.possession = possessionTotals(game?.possession, now).usPct;
  return t;
}

// Season lines across games: { [uid]: line } (games = games they played in).
export function seasonLines(games, eventsByGame, now = Date.now()) {
  const out = {};
  for (const g of games) {
    const lines = playerLines(g, eventsByGame[g.id] || [], now);
    for (const [u, l] of Object.entries(lines)) {
      const s = (out[u] = out[u] || emptyLine());
      for (const k of Object.keys(s)) s[k] += l[k] || 0;
    }
  }
  return out;
}

// Record of finished games: { w, d, l }.
export function record(games, eventsByGame) {
  const r = { w: 0, d: 0, l: 0 };
  for (const g of games) {
    if (g.status !== "final") continue;
    const s = score(eventsByGame[g.id] || []);
    if (s.us > s.them) r.w += 1; else if (s.us < s.them) r.l += 1; else r.d += 1;
  }
  return r;
}

// ─── Player season profile (My Stats) ──────────────────────────────────────
// Everything here is derived from the same game + event docs; nothing new is
// recorded.

// On-field spells [from, to] in clock ms (starters from 0, subs applied).
export function onFieldSpells(starters = [], events = [], endMs = 0, uid) {
  const spells = [];
  let since = starters.includes(uid) ? 0 : null;
  const subs = events.filter((e) => e.type === "sub").sort((a, b) => (a.ms || 0) - (b.ms || 0));
  for (const s of subs) {
    if (s.outUid === uid && since != null) { spells.push([since, s.ms || 0]); since = null; }
    if (s.inUid === uid && since == null) since = s.ms || 0;
  }
  if (since != null) spells.push([since, endMs]);
  return spells;
}

// Goals for / against while `uid` was on the field.
export function plusMinus(game, events, uid, now = Date.now()) {
  const spells = onFieldSpells(game?.starters || [], events, clockMs(game?.clock, now), uid);
  const on = (ms) => spells.some(([a, b]) => ms >= a && ms <= b);
  let gf = 0; let ga = 0;
  for (const e of events) {
    if (e.type === "goal" && on(e.ms || 0)) gf += 1;
    else if (e.type === "opp_goal" && on(e.ms || 0)) ga += 1;
  }
  return { gf, ga, diff: gf - ga };
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

// Season profile for one player across games (newest first in `log`).
export function playerProfile(uid, games, eventsByGame, now = Date.now()) {
  const totals = { games: 0, starts: 0, minutes: 0, goal: 0, assist: 0, shots: 0, shot_on: 0, shot_off: 0, pass: 0, key_pass: 0, won: 0, lost: 0, save: 0, foul: 0, yellow: 0, red: 0, gf: 0, ga: 0, received: 0, oppGoalsWhileKeeping: 0 };
  const log = [];
  const shots = [];
  const passTo = {}; const passFrom = {};
  const sorted = [...games].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const g of sorted) {
    const ev = eventsByGame[g.id] || [];
    const line = playerLines(g, ev, now)[uid];
    const played = line && (line.minutes > 0 || line.games > 0);
    const touched = ev.some((e) => e.uid === uid || e.toUid === uid);
    if (!played && !touched) continue;
    const pm = plusMinus(g, ev, uid, now);
    const sc = score(ev);
    const l = line || {};
    totals.games += 1;
    if ((g.starters || []).includes(uid)) totals.starts += 1;
    for (const k of ["minutes", "goal", "assist", "shots", "shot_on", "shot_off", "pass", "key_pass", "won", "lost", "save", "foul", "yellow", "red"]) totals[k] += l[k] || 0;
    totals.gf += pm.gf; totals.ga += pm.ga;
    if ((l.save || 0) > 0) totals.oppGoalsWhileKeeping += pm.ga; // keeper: goals conceded in games they made saves
    for (const e of ev) {
      if (e.type === "pass" && e.uid === uid && e.toUid) passTo[e.toUid] = (passTo[e.toUid] || 0) + 1;
      if (e.type === "pass" && e.toUid === uid) { totals.received += 1; passFrom[e.uid] = (passFrom[e.uid] || 0) + 1; }
      if (e.uid === uid && (e.type === "goal" || e.type === "shot_on" || e.type === "shot_off") && e.x != null) shots.push(e);
    }
    log.push({ game: g, line: { ...emptyLine(), ...l }, pm, score: sc, started: (g.starters || []).includes(uid) });
  }
  const per80 = (n) => (totals.minutes ? Math.round((n / totals.minutes) * 80 * 10) / 10 : null);
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => ({ uid: u, n }));
  return {
    totals,
    log,
    shots,
    rates: {
      shotAccuracy: pct(totals.shot_on, totals.shots),       // on target / all shots
      conversion: pct(totals.goal, totals.shots),             // goals / shots
      passCompletion: pct(totals.pass, totals.pass + totals.lost), // passes / (passes + balls lost)
      savePct: pct(totals.save, totals.save + totals.oppGoalsWhileKeeping),
      goalsPer80: per80(totals.goal),
      involvementPer80: per80(totals.goal + totals.assist),
      shotsPer80: per80(totals.shots),
      passesPer80: per80(totals.pass),
      minutesPerGame: totals.games ? Math.round(totals.minutes / totals.games) : null,
      plusMinus: totals.gf - totals.ga,
    },
    passTo: top(passTo),
    passFrom: top(passFrom),
  };
}

// Re-point stats recorded for a not-yet-joined player (stand-in id
// "sheet:<Name>") to their account once they've joined. `alias` maps
// stand-in id → uid. Returns new arrays (keeps a `.loading` flag).
export function applyAliases(games = [], events = [], alias = {}) {
  if (!Object.keys(alias).length) return { games, events };
  const a = (id) => (id && alias[id]) || id;
  const keep = (src, out) => Object.assign(out, src.loading ? { loading: true } : {});
  const g2 = keep(games, games.map((g) => {
    const roster = g.roster ? Object.fromEntries(Object.entries(g.roster).map(([k, v]) => [a(k), v])) : g.roster;
    return { ...g, starters: (g.starters || []).map(a), ...(roster ? { roster } : {}) };
  }));
  const e2 = keep(events, events.map((e) => {
    const x = { ...e };
    for (const f of ["uid", "toUid", "outUid", "inUid"]) if (x[f]) x[f] = a(x[f]);
    return x;
  }));
  return { games: g2, events: e2 };
}

// ─── One tracker at a time ─────────────────────────────────────────────────
// Two phones tracking the same game would both log the same goal (double
// counts) and fight over the clock/possession. The phone that's tracking
// holds game.tracker = { uid, name, at } and refreshes `at` every 30s; a
// hold not refreshed for 90s (phone closed, lost signal) is free again.
export const TRACKER_HEARTBEAT_MS = 30000;
export const TRACKER_STALE_MS = 90000;
export function trackerStatus(tracker, uid, now = Date.now()) {
  if (!tracker?.uid || !tracker.at || now - tracker.at > TRACKER_STALE_MS) return "free";
  return tracker.uid === uid ? "mine" : "other";
}
