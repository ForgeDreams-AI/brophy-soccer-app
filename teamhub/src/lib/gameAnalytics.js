// ─── Game analytics (derived only) ─────────────────────────────────────────
// Deeper numbers worked out from the same game + event docs the tracker
// already records. Nothing here needs a new tap.
import { score, onFieldSpells, clockMs, minutesPlayed } from "./gameStats";

const MIN = 60000;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
export const byClock = (events) => [...events].sort((a, b) => (a.ms || 0) - (b.ms || 0) || (a.ts || 0) - (b.ts || 0));
const finals = (games) => games.filter((g) => g.status === "final");
// Sequence-based stats must never mix games: split events by game first.
const byGame = (events) => {
  const m = new Map();
  for (const e of events) { const k = e.gameId || "_"; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m.values()];
};
const resultOf = (s) => (s.us > s.them ? "W" : s.us < s.them ? "L" : "D");

// ── Shots ──────────────────────────────────────────────────────────────────
// Shot spots are 0..1 inside the attacking half (goal at the top, see
// HalfPitch). The penalty box spans x 0.208–0.792, y 0–0.303; the 6-yard box
// x 0.375–0.625, y 0–0.106. A half pitch is ~74 × 57 yards.
export function shotZone(x, y) {
  const inSix = x >= 0.375 && x <= 0.625 && y <= 0.106;
  const inBox = x >= 0.208 && x <= 0.792 && y <= 0.303;
  const yds = Math.round(Math.hypot((x - 0.5) * 74, y * 57));
  return { zone: inSix ? "six" : inBox ? "box" : "outside", central: x >= 0.35 && x <= 0.65, yds };
}
export const ZONE_LABEL = { six: "6-yard box", box: "Rest of the box", outside: "Outside the box" };

export function shotZones(shots) {
  const z = { six: { shots: 0, goals: 0 }, box: { shots: 0, goals: 0 }, outside: { shots: 0, goals: 0 } };
  const side = { central: { shots: 0, goals: 0 }, wide: { shots: 0, goals: 0 } };
  let dist = 0; let n = 0;
  for (const s of shots) {
    if (s.x == null || s.y == null) continue;
    const { zone, central, yds } = shotZone(s.x, s.y);
    const goal = s.type === "goal" ? 1 : 0;
    z[zone].shots += 1; z[zone].goals += goal;
    const k = central ? "central" : "wide"; side[k].shots += 1; side[k].goals += goal;
    dist += yds; n += 1;
  }
  for (const v of [...Object.values(z), ...Object.values(side)]) v.conversion = pct(v.goals, v.shots);
  return { zones: z, side, avgYds: n ? Math.round(dist / n) : null, mapped: n };
}

// What happened right before each of our shots: a pass to the shooter, the
// shooter winning the ball, or something else (set piece, rebound, untracked).
export function shotSources(events) {
  const out = { afterPass: { shots: 0, goals: 0 }, afterWin: { shots: 0, goals: 0 }, other: { shots: 0, goals: 0 } };
  for (const group of byGame(events)) {
  const ev = byClock(group).filter((e) => e.type !== "sub");
  ev.forEach((e, i) => {
    if (!["goal", "shot_on", "shot_off"].includes(e.type)) return;
    let j = i - 1;
    while (j >= 0 && ["assist", "key_pass"].includes(ev[j].type)) j -= 1;
    const prev = ev[j];
    const k = prev?.type === "pass" && prev.toUid === e.uid ? "afterPass" : prev?.type === "won" && prev.uid === e.uid ? "afterWin" : "other";
    out[k].shots += 1; if (e.type === "goal") out[k].goals += 1;
  });
  }
  return out;
}

// ── Possession & passing ───────────────────────────────────────────────────
// Possession chains: from winning the ball (or the first pass) until we shoot
// or lose it. Counts passes per chain and how chains end.
export function chains(events) {
  const list = [];
  let cur = null;
  const end = (outcome, goal = false) => { if (cur) { list.push({ ...cur, outcome, goal }); cur = null; } };
  for (const group of byGame(events)) {
  for (const e of byClock(group)) {
    if (e.type === "won") { end("other"); cur = { passes: 0 }; }
    else if (e.type === "pass") { if (!cur) cur = { passes: 0 }; cur.passes += 1; }
    else if (["goal", "shot_on", "shot_off"].includes(e.type)) { if (!cur) cur = { passes: 0 }; end("shot", e.type === "goal"); }
    else if (e.type === "lost" || e.type === "opp_shot" || e.type === "opp_goal") end("lost");
  }
  end("other"); // a chain never runs into the next game
  }
  const real = list.filter((c) => c.passes > 0 || c.outcome !== "other");
  const buckets = [["0–1", 0, 1], ["2–3", 2, 3], ["4–5", 4, 5], ["6+", 6, 999]].map(([label, a, b]) => {
    const inB = real.filter((c) => c.passes >= a && c.passes <= b);
    return { label, count: inB.length, shots: inB.filter((c) => c.outcome === "shot").length, shotPct: pct(inB.filter((c) => c.outcome === "shot").length, inB.length) };
  });
  return {
    count: real.length,
    avgPasses: real.length ? Math.round((real.reduce((n, c) => n + c.passes, 0) / real.length) * 10) / 10 : null,
    longest: real.reduce((m, c) => Math.max(m, c.passes), 0),
    endedInShot: pct(real.filter((c) => c.outcome === "shot").length, real.length),
    buckets,
  };
}

// Pass completion (passes vs balls lost), overall and per half.
export function passCompletion(events) {
  const by = { all: { p: 0, l: 0 }, 1: { p: 0, l: 0 }, 2: { p: 0, l: 0 } };
  for (const e of events) {
    if (e.type !== "pass" && e.type !== "lost") continue;
    const k = e.type === "pass" ? "p" : "l";
    by.all[k] += 1; by[e.half === 2 ? 2 : 1][k] += 1;
  }
  return { all: pct(by.all.p, by.all.p + by.all.l), half1: pct(by[1].p, by[1].p + by[1].l), half2: pct(by[2].p, by[2].p + by[2].l), passes: by.all.p, lost: by.all.l };
}

// Who passes to whom: [{ from, to, n }] most first.
export function passNetwork(events, limit = 8) {
  const m = {};
  for (const e of events) if (e.type === "pass" && e.uid && e.toUid) { const k = `${e.uid}>${e.toUid}`; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).map(([k, n]) => { const [from, to] = k.split(">"); return { from, to, n }; }).sort((a, b) => b.n - a.n).slice(0, limit);
}

// After a lost ball: did they shoot / score within `windowMs` before we got
// it back? Per player and in total.
export function turnoverDamage(events, windowMs = MIN) {
  const per = {}; const tot = { lost: 0, toShot: 0, toGoal: 0 };
  for (const group of byGame(events)) {
  const ev = byClock(group);
  ev.forEach((e, i) => {
    if (e.type !== "lost") return;
    const p = (per[e.uid] = per[e.uid] || { lost: 0, toShot: 0, toGoal: 0 });
    p.lost += 1; tot.lost += 1;
    for (let j = i + 1; j < ev.length; j++) {
      const n = ev[j];
      if ((n.ms || 0) - (e.ms || 0) > windowMs) break;
      if (n.type === "won" || n.type === "pass" || n.type === "save") break; // we had it again
      if (n.type === "opp_shot" || n.type === "opp_goal") {
        p.toShot += 1; tot.toShot += 1;
        if (n.type === "opp_goal") { p.toGoal += 1; tot.toGoal += 1; }
        break;
      }
    }
  });
  }
  return { total: tot, perPlayer: per };
}

// After winning the ball: did we shoot / score within `windowMs` before
// losing it?
export function regainValue(events, windowMs = MIN) {
  const per = {}; const tot = { won: 0, toShot: 0, toGoal: 0 };
  for (const group of byGame(events)) {
  const ev = byClock(group);
  ev.forEach((e, i) => {
    if (e.type !== "won") return;
    const p = (per[e.uid] = per[e.uid] || { won: 0, toShot: 0, toGoal: 0 });
    p.won += 1; tot.won += 1;
    for (let j = i + 1; j < ev.length; j++) {
      const n = ev[j];
      if ((n.ms || 0) - (e.ms || 0) > windowMs) break;
      if (n.type === "lost" || n.type === "opp_shot" || n.type === "opp_goal") break;
      if (["goal", "shot_on", "shot_off"].includes(n.type)) {
        p.toShot += 1; tot.toShot += 1;
        if (n.type === "goal") { p.toGoal += 1; tot.toGoal += 1; }
        break;
      }
    }
  });
  }
  return { total: tot, perPlayer: per };
}

// Possession % per half (saved automatically by the tracker in
// possession.byHalf; older games don't have it).
export function possessionByHalf(game, now = Date.now()) {
  const pos = game?.possession || {};
  const by = JSON.parse(JSON.stringify(pos.byHalf || {}));
  if (pos.holder && pos.since != null) {
    const h = String(pos.half || 1); by[h] = by[h] || { us: 0, them: 0 };
    by[h][pos.holder] += Math.max(0, now - pos.since);
  }
  const out = {};
  for (const h of ["1", "2"]) { const v = by[h]; if (v && (v.us || v.them)) out[h] = pct(v.us, v.us + v.them); }
  return out;
}

// ── Time & game flow ───────────────────────────────────────────────────────
export const PERIODS = [["1–15′", 0, 15], ["16–30′", 15, 30], ["31–45′", 30, 45], ["46–60′", 45, 60], ["61–75′", 60, 75], ["76′+", 75, 999]];
export function goalsByPeriod(games, eventsByGame) {
  const rows = PERIODS.map(([label]) => ({ label, for: 0, against: 0 }));
  const halves = { 1: { for: 0, against: 0 }, 2: { for: 0, against: 0 } };
  for (const g of games) {
    for (const e of eventsByGame[g.id] || []) {
      if (e.type !== "goal" && e.type !== "opp_goal") continue;
      const m = (e.ms || 0) / MIN;
      const i = PERIODS.findIndex(([, a, b]) => m >= a && m < b);
      const k = e.type === "goal" ? "for" : "against";
      rows[i < 0 ? rows.length - 1 : i][k] += 1;
      halves[e.half === 2 ? 2 : 1][k] += 1;
    }
  }
  return { periods: rows, halves };
}

// Record when we score first vs concede first.
export function firstGoalImpact(games, eventsByGame) {
  const out = { scoredFirst: { w: 0, d: 0, l: 0 }, concededFirst: { w: 0, d: 0, l: 0 }, goalless: 0 };
  for (const g of finals(games)) {
    const ev = byClock(eventsByGame[g.id] || []);
    const first = ev.find((e) => e.type === "goal" || e.type === "opp_goal");
    const r = resultOf(score(ev)).toLowerCase();
    if (!first) { out.goalless += 1; continue; }
    out[first.type === "goal" ? "scoredFirst" : "concededFirst"][r] += 1;
  }
  return out;
}

// Minutes spent winning / drawing / losing, and shots + goals in each state.
export function scoreStates(games, eventsByGame, now = Date.now()) {
  const st = { winning: { min: 0, shots: 0, oppShots: 0 }, drawing: { min: 0, shots: 0, oppShots: 0 }, losing: { min: 0, shots: 0, oppShots: 0 } };
  const state = (us, them) => (us > them ? "winning" : us < them ? "losing" : "drawing");
  for (const g of games) {
    const ev = byClock(eventsByGame[g.id] || []);
    const endMs = clockMs(g.clock, now);
    let us = 0; let them = 0; let last = 0;
    for (const e of ev) {
      const s = state(us, them);
      if (["goal", "shot_on", "shot_off"].includes(e.type)) st[s].shots += 1;
      if (e.type === "opp_shot" || e.type === "opp_goal") st[s].oppShots += 1;
      if (e.type === "goal" || e.type === "opp_goal") {
        st[s].min += Math.max(0, (e.ms || 0) - last) / MIN; last = e.ms || 0;
        if (e.type === "goal") us += 1; else them += 1;
      }
    }
    st[state(us, them)].min += Math.max(0, endMs - last) / MIN;
  }
  for (const v of Object.values(st)) v.min = Math.round(v.min);
  return st;
}

// ── Players & line-ups ─────────────────────────────────────────────────────
const overlap = (a, b) => {
  const out = [];
  for (const [a1, a2] of a) for (const [b1, b2] of b) { const s = Math.max(a1, b1); const e = Math.min(a2, b2); if (e > s) out.push([s, e]); }
  return out;
};
// Goal difference while two players were on the field together.
export function pairPlusMinus(games, eventsByGame, playerIds, minMinutes = 30, now = Date.now()) {
  const acc = {};
  for (const g of games) {
    const ev = eventsByGame[g.id] || [];
    const endMs = clockMs(g.clock, now);
    const spells = Object.fromEntries(playerIds.map((u) => [u, onFieldSpells(g.starters || [], ev, endMs, u)]).filter(([, s]) => s.length));
    const ids = Object.keys(spells);
    const goals = ev.filter((e) => e.type === "goal" || e.type === "opp_goal");
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const ov = overlap(spells[ids[i]], spells[ids[j]]);
      if (!ov.length) continue;
      const k = [ids[i], ids[j]].sort().join("|");
      const a = (acc[k] = acc[k] || { a: k.split("|")[0], b: k.split("|")[1], minutes: 0, gf: 0, ga: 0 });
      a.minutes += ov.reduce((n, [s, e]) => n + (e - s), 0) / MIN;
      for (const e of goals) if (ov.some(([s, en]) => (e.ms || 0) >= s && (e.ms || 0) <= en)) { if (e.type === "goal") a.gf += 1; else a.ga += 1; }
    }
  }
  const list = Object.values(acc).filter((p) => p.minutes >= minMinutes).map((p) => ({ ...p, minutes: Math.round(p.minutes), diff: p.gf - p.ga }));
  return {
    best: [...list].sort((x, y) => y.diff - x.diff || y.minutes - x.minutes).slice(0, 5),
    worst: [...list].sort((x, y) => x.diff - y.diff || y.minutes - x.minutes).slice(0, 5),
  };
}

// Team record when a player starts vs when they don't.
export function startRecords(games, eventsByGame, playerIds) {
  const out = Object.fromEntries(playerIds.map((u) => [u, { starts: { w: 0, d: 0, l: 0 }, without: { w: 0, d: 0, l: 0 } }]));
  for (const g of finals(games)) {
    const r = resultOf(score(eventsByGame[g.id] || [])).toLowerCase();
    for (const u of playerIds) out[u][(g.starters || []).includes(u) ? "starts" : "without"][r] += 1;
  }
  for (const v of Object.values(out)) {
    for (const k of ["starts", "without"]) { const s = v[k]; const n = s.w + s.d + s.l; s.games = n; s.winPct = pct(s.w, n); s.ppg = n ? Math.round(((s.w * 3 + s.d) / n) * 10) / 10 : null; }
  }
  return out;
}

// Goals for / against after each substitute came on.
export function subImpact(games, eventsByGame, now = Date.now()) {
  const per = {};
  for (const g of games) {
    const ev = eventsByGame[g.id] || [];
    const endMs = clockMs(g.clock, now);
    for (const s of ev.filter((e) => e.type === "sub" && e.inUid)) {
      const spell = onFieldSpells(g.starters || [], ev, endMs, s.inUid).find(([a]) => a === (s.ms || 0));
      if (!spell) continue;
      const p = (per[s.inUid] = per[s.inUid] || { apps: 0, minutes: 0, gf: 0, ga: 0 });
      p.apps += 1; p.minutes += Math.round((spell[1] - spell[0]) / MIN);
      for (const e of ev) {
        if ((e.ms || 0) < spell[0] || (e.ms || 0) > spell[1]) continue;
        if (e.type === "goal") p.gf += 1; else if (e.type === "opp_goal") p.ga += 1;
      }
    }
  }
  return per;
}

// Minutes over the season and the last 3 games; flags players who played
// (nearly) the full game in each of their last 3.
export function minutesLoad(games, eventsByGame, playerIds, now = Date.now()) {
  const sorted = [...games].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const per = Object.fromEntries(playerIds.map((u) => [u, { season: 0, last3: [], heavy: false }]));
  for (const g of sorted) {
    const ev = eventsByGame[g.id] || [];
    const endMs = clockMs(g.clock, now);
    const mins = minutesPlayed(g.starters || [], ev, endMs);
    const full = Math.max(1, Math.round(endMs / MIN));
    for (const u of playerIds) {
      const m = mins[u] || 0;
      per[u].season += m;
      if (per[u].last3.length < 3) per[u].last3.push({ m, full });
    }
  }
  for (const v of Object.values(per)) v.heavy = v.last3.length === 3 && v.last3.every(({ m, full }) => m >= full * 0.9);
  return per;
}

// ── Team & season ──────────────────────────────────────────────────────────
export function teamSeason(games, eventsByGame, keeperIds = []) {
  const fin = finals(games).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const split = () => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0, games: 0 });
  const home = split(); const away = split(); const all = split();
  const opponents = {};
  let cleanSheets = 0;
  const keepers = {};
  const discipline = {};
  for (const g of fin) {
    const ev = eventsByGame[g.id] || [];
    const s = score(ev); const r = resultOf(s).toLowerCase();
    for (const b of [all, g.homeAway === "away" ? away : home]) { b[r] += 1; b.gf += s.us; b.ga += s.them; b.games += 1; }
    const key = String(g.opponent || "Opponent").trim();
    const o = (opponents[key] = opponents[key] || split()); o[r] += 1; o.gf += s.us; o.ga += s.them; o.games += 1;
    if (s.them === 0) cleanSheets += 1;
    const gk = (g.starters || []).find((u) => keeperIds.includes(u));
    if (gk) {
      const k = (keepers[gk] = keepers[gk] || { games: 0, saves: 0, conceded: 0, cleanSheets: 0 });
      k.games += 1; k.conceded += s.them; if (s.them === 0) k.cleanSheets += 1;
      k.saves += ev.filter((e) => e.type === "save" && e.uid === gk).length;
    }
    for (const e of ev) {
      if (!["foul", "yellow", "red"].includes(e.type) || !e.uid) continue;
      const d = (discipline[e.uid] = discipline[e.uid] || { foul: 0, yellow: 0, red: 0 }); d[e.type] += 1;
    }
  }
  for (const k of Object.values(keepers)) k.savePct = pct(k.saves, k.saves + k.conceded);
  const per = (n) => (all.games ? Math.round((n / all.games) * 10) / 10 : null);
  return {
    form: fin.slice(-5).map((g) => ({ id: g.id, opponent: g.opponent, r: resultOf(score(eventsByGame[g.id] || [])) })),
    all, home, away,
    gfPerGame: per(all.gf), gaPerGame: per(all.ga), cleanSheets,
    opponents: Object.entries(opponents).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
    keepers,
    discipline: Object.entries(discipline).map(([uid, v]) => ({ uid, ...v, points: v.foul + v.yellow * 3 + v.red * 6 })).sort((a, b) => b.points - a.points),
    foulsPerGame: per(Object.values(discipline).reduce((n, d) => n + d.foul, 0)),
  };
}

// Best XI by results: in a 1-4-3-3 shape, the starters with the best points
// per start (min. `minStarts`), from each position group.
export function bestXI(records, groups, minStarts = 2) {
  const pick = (ids, n) => ids
    .filter((u) => records[u]?.starts.games >= minStarts)
    .sort((a, b) => (records[b].starts.ppg - records[a].starts.ppg) || (records[b].starts.games - records[a].starts.games))
    .slice(0, n);
  return { GK: pick(groups.GK, 1), DEF: pick(groups.DEF, 4), MID: pick(groups.MID, 3), FWD: pick(groups.FWD, 3) };
}
