// ─── Game analytics screens ───────────────────────────────────────────────
// Season (Team / Attack / Passing / Line-ups), per-game insights, and the
// extra player numbers. All derived (lib/gameAnalytics.js) — nothing new to
// tap while tracking.
import { useMemo } from "react";
import {
  shotZones, ZONE_LABEL, shotSources, chains, passCompletion, passNetwork, turnoverDamage, regainValue,
  possessionByHalf, goalsByPeriod, firstGoalImpact, scoreStates, pairPlusMinus, startRecords, subImpact,
  minutesLoad, teamSeason, bestXI,
} from "../lib/gameAnalytics";

const RED = "#980000";
const short = (name = "") => { const p = String(name).trim().split(/\s+/).filter(Boolean); return p.length < 2 ? p[0] || "" : `${p[0]} ${p[p.length - 1][0]}.`; };
const sign = (n) => (n > 0 ? `+${n}` : String(n));
const rec = (r) => `${r.w}–${r.d}–${r.l}`;

export const Card = ({ title, hint, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    {title && <h4 className="font-bold text-sm text-slate-900">{title}</h4>}
    {hint && <p className="text-[11px] text-slate-400 mb-1.5">{hint}</p>}
    <div className={title && !hint ? "mt-1.5" : ""}>{children}</div>
  </div>
);
const Row = ({ label, value, sub }) => (
  <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-700">{label}{sub ? <span className="block text-[10px] text-slate-400">{sub}</span> : null}</span>
    <span className="text-sm font-black tabular-nums text-slate-900 text-right">{value}</span>
  </div>
);
const Meter = ({ label, value, right }) => (
  <div className="py-1.5">
    <div className="flex justify-between text-sm"><span className="text-slate-700">{label}</span><span className="font-black tabular-nums">{value == null ? "–" : `${value}%`}{right ? <span className="text-slate-400 font-semibold"> {right}</span> : null}</span></div>
    <div className="h-2 rounded-full bg-slate-200 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${value || 0}%`, backgroundColor: RED }} /></div>
  </div>
);
const Chip = ({ r }) => (
  <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center text-xs font-black ${r === "W" ? "bg-emerald-100 text-emerald-700" : r === "L" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r}</span>
);
const Empty = ({ children }) => <p className="text-sm text-slate-400 text-center py-3">{children}</p>;

// Shot zones + distance + where shots came from (shared by season / game / player).
export function ShotInsights({ shots, events }) {
  const z = shotZones(shots);
  const src = events ? shotSources(events) : null;
  return (
    <Card title="Where the shots come from" hint={z.mapped ? `From ${z.mapped} shots with a spot · average distance ${z.avgYds} yds` : "Tap the spot on shots to fill this in."}>
      {z.mapped > 0 && (
        <>
          {Object.entries(z.zones).map(([k, v]) => <Row key={k} label={ZONE_LABEL[k]} value={`${v.goals}/${v.shots}`} sub={v.shots ? `${v.conversion}% scored` : "no shots"} />)}
          <Row label="Central" value={`${z.side.central.goals}/${z.side.central.shots}`} sub={z.side.central.shots ? `${z.side.central.conversion}% scored` : ""} />
          <Row label="Wide" value={`${z.side.wide.goals}/${z.side.wide.shots}`} sub={z.side.wide.shots ? `${z.side.wide.conversion}% scored` : ""} />
        </>
      )}
      {src && (src.afterPass.shots + src.afterWin.shots + src.other.shots) > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mt-1">How shots started</div>
          <Row label="Right after a pass" value={`${src.afterPass.goals}/${src.afterPass.shots}`} sub="goals / shots" />
          <Row label="Right after winning the ball" value={`${src.afterWin.goals}/${src.afterWin.shots}`} />
          <Row label="Other (set pieces, rebounds…)" value={`${src.other.goals}/${src.other.shots}`} />
        </div>
      )}
    </Card>
  );
}

// Possession / passing block (game or season).
function PassingInsights({ events, games, playerById }) {
  const pc = passCompletion(events);
  const ch = chains(events);
  const net = passNetwork(events, 6);
  const td = turnoverDamage(events);
  const rv = regainValue(events);
  const halves = games ? (() => {
    const acc = { 1: [], 2: [] };
    for (const g of games) { const h = possessionByHalf(g); if (h[1] != null) acc[1].push(h[1]); if (h[2] != null) acc[2].push(h[2]); }
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    return { 1: avg(acc[1]), 2: avg(acc[2]) };
  })() : null;
  const costly = Object.entries(td.perPlayer).filter(([, v]) => v.toShot > 0).sort((a, b) => b[1].toShot - a[1].toShot).slice(0, 5);
  const regainers = Object.entries(rv.perPlayer).filter(([, v]) => v.toShot > 0).sort((a, b) => b[1].toShot - a[1].toShot).slice(0, 5);
  return (
    <>
      <Card title="Passing" hint="Completion = passes vs. balls lost">
        <Meter label="Pass completion" value={pc.all} right={`(${pc.passes} passes · ${pc.lost} lost)`} />
        <Meter label="1st half" value={pc.half1} />
        <Meter label="2nd half" value={pc.half2} />
        {halves && (halves[1] != null || halves[2] != null) && (
          <>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mt-2">Possession by half</div>
            <Meter label="1st half" value={halves[1]} />
            <Meter label="2nd half" value={halves[2]} />
          </>
        )}
      </Card>
      <Card title="Possession chains" hint="Passes in a row from winning the ball until a shot or losing it">
        {ch.count ? (
          <>
            <Row label="Chains" value={ch.count} />
            <Row label="Average passes per chain" value={ch.avgPasses} />
            <Row label="Longest" value={`${ch.longest} passes`} />
            <Row label="Ended in a shot" value={`${ch.endedInShot}%`} />
            <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
              {ch.buckets.map((b) => (
                <div key={b.label} className="rounded-xl bg-slate-50 py-2">
                  <div className="text-base font-black tabular-nums">{b.count}</div>
                  <div className="text-[10px] font-bold text-slate-500">{b.label} passes</div>
                  <div className="text-[10px] text-slate-400">{b.shotPct == null ? "–" : `${b.shotPct}% → shot`}</div>
                </div>
              ))}
            </div>
          </>
        ) : <Empty>Tap who has the ball to build chains.</Empty>}
      </Card>
      <Card title="Best passing combinations" hint="Who passes to whom most">
        {net.length ? net.map((c) => <Row key={`${c.from}${c.to}`} label={`${short(playerById[c.from]?.name) || "?"} → ${short(playerById[c.to]?.name) || "?"}`} value={c.n} />) : <Empty>No passes yet.</Empty>}
      </Card>
      <Card title="Turnovers & regains" hint="Within a minute, before the ball changed hands again">
        <Row label="Lost balls that led to an opponent shot" value={`${td.total.toShot}/${td.total.lost}`} sub={td.total.toGoal ? `${td.total.toGoal} led to a goal` : ""} />
        <Row label="Won balls that led to our shot" value={`${rv.total.toShot}/${rv.total.won}`} sub={rv.total.toGoal ? `${rv.total.toGoal} led to a goal` : ""} />
        {costly.length > 0 && <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mt-2">Turnovers that cost a shot</div>}
        {costly.map(([u, v]) => <Row key={u} label={short(playerById[u]?.name) || "?"} value={`${v.toShot}`} sub={`of ${v.lost} lost${v.toGoal ? ` · ${v.toGoal} goal` : ""}`} />)}
        {regainers.length > 0 && <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mt-2">Regains that created a shot</div>}
        {regainers.map(([u, v]) => <Row key={u} label={short(playerById[u]?.name) || "?"} value={`${v.toShot}`} sub={`of ${v.won} won${v.toGoal ? ` · ${v.toGoal} goal` : ""}`} />)}
      </Card>
    </>
  );
}

// ── Per game ───────────────────────────────────────────────────────────────
export function GameInsights({ game, events, playerById }) {
  const shots = events.filter((e) => ["goal", "shot_on", "shot_off"].includes(e.type));
  const st = scoreStates([game], { [game.id]: events });
  return (
    <div className="space-y-4">
      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 px-1">Insights</h4>
      <ShotInsights shots={shots} events={events} />
      <PassingInsights events={events} games={[game]} playerById={playerById} />
      <Card title="Game state" hint="Minutes spent and shots taken while winning / drawing / losing">
        {Object.entries(st).filter(([, v]) => v.min > 0).map(([k, v]) => <Row key={k} label={k[0].toUpperCase() + k.slice(1)} value={`${v.min} min`} sub={`shots ${v.shots} · against ${v.oppShots}`} />)}
      </Card>
    </div>
  );
}

// ── Season ─────────────────────────────────────────────────────────────────
export function SeasonAnalytics({ view, games, eventsByGame, playerById, groups }) {
  const allEvents = useMemo(() => games.flatMap((g) => eventsByGame[g.id] || []), [games, eventsByGame]);
  const ids = useMemo(() => Object.keys(playerById), [playerById]);
  const keeperIds = groups?.GK?.map((p) => p.id) || [];
  if (!games.length) return <Empty>No games yet.</Empty>;

  if (view === "team") {
    const t = teamSeason(games, eventsByGame, keeperIds);
    const fg = firstGoalImpact(games, eventsByGame);
    const gp = goalsByPeriod(games, eventsByGame);
    const maxG = Math.max(1, ...gp.periods.map((r) => Math.max(r.for, r.against)));
    return (
      <div className="space-y-4">
        <Card title="Form" hint="Last 5 finished games">
          <div className="flex gap-1.5">{t.form.length ? t.form.map((f) => <Chip key={f.id} r={f.r} />) : <span className="text-sm text-slate-400">No finished games</span>}</div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div><div className="text-lg font-black">{t.gfPerGame ?? "–"}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Goals for / game</div></div>
            <div><div className="text-lg font-black">{t.gaPerGame ?? "–"}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Against / game</div></div>
            <div><div className="text-lg font-black">{t.cleanSheets}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Clean sheets</div></div>
          </div>
        </Card>
        <Card title="Home vs away">
          <Row label="Home" value={rec(t.home)} sub={`${t.home.gf}–${t.home.ga} goals`} />
          <Row label="Away" value={rec(t.away)} sub={`${t.away.gf}–${t.away.ga} goals`} />
        </Card>
        <Card title="Scoring first" hint="Result depending on who scores first">
          <Row label="When we score first" value={rec(fg.scoredFirst)} />
          <Row label="When they score first" value={rec(fg.concededFirst)} />
          {fg.goalless > 0 && <Row label="0–0 games" value={fg.goalless} />}
        </Card>
        <Card title="When goals happen" hint="Goals for (red) and against (grey) by 15 minutes">
          {gp.periods.map((r) => (
            <div key={r.label} className="flex items-center gap-2 py-1">
              <span className="w-14 text-[11px] font-bold text-slate-500 tabular-nums">{r.label}</span>
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="h-2 rounded-full" style={{ width: `${(r.for / maxG) * 100}%`, backgroundColor: RED, minWidth: r.for ? 6 : 0 }} />
                <div className="h-2 rounded-full bg-slate-400" style={{ width: `${(r.against / maxG) * 100}%`, minWidth: r.against ? 6 : 0 }} />
              </div>
              <span className="w-10 text-right text-[12px] font-bold tabular-nums">{r.for}–{r.against}</span>
            </div>
          ))}
          <Row label="1st half" value={`${gp.halves[1].for}–${gp.halves[1].against}`} />
          <Row label="2nd half" value={`${gp.halves[2].for}–${gp.halves[2].against}`} />
        </Card>
        <Card title="Keepers">
          {Object.keys(t.keepers).length ? Object.entries(t.keepers).map(([u, k]) => (
            <Row key={u} label={playerById[u]?.name || "Keeper"} value={`${k.cleanSheets} CS`} sub={`${k.games} games · ${k.saves} saves · ${k.conceded} conceded${k.savePct != null ? ` · ${k.savePct}% saves` : ""}`} />
          )) : <Empty>Set your keepers in Roster → positions.</Empty>}
        </Card>
        <Card title="Discipline" hint={t.foulsPerGame != null ? `${t.foulsPerGame} fouls per game` : ""}>
          {t.discipline.length ? t.discipline.slice(0, 6).map((d) => <Row key={d.uid} label={playerById[d.uid]?.name || "Player"} value={`${d.yellow}Y ${d.red}R`} sub={`${d.foul} fouls`} />) : <Empty>No fouls or cards recorded.</Empty>}
        </Card>
        <Card title="Opponents">
          {t.opponents.length ? t.opponents.map((o) => <Row key={o.name} label={o.name} value={rec(o)} sub={`${o.games} game${o.games === 1 ? "" : "s"} · ${o.gf}–${o.ga} goals`} />) : <Empty>No finished games.</Empty>}
        </Card>
      </div>
    );
  }

  if (view === "attack") {
    const shots = allEvents.filter((e) => ["goal", "shot_on", "shot_off"].includes(e.type));
    const st = scoreStates(games, eventsByGame);
    return (
      <div className="space-y-4">
        <ShotInsights shots={shots} events={allEvents} />
        <Card title="Game state" hint="Minutes and shots while winning / drawing / losing">
          {Object.entries(st).map(([k, v]) => <Row key={k} label={k[0].toUpperCase() + k.slice(1)} value={`${v.min} min`} sub={`shots ${v.shots} · against ${v.oppShots}`} />)}
        </Card>
      </div>
    );
  }

  if (view === "passing") return <div className="space-y-4"><PassingInsights events={allEvents} games={games} playerById={playerById} /></div>;

  // view === "lineups"
  const sr = startRecords(games, eventsByGame, ids);
  const pp = pairPlusMinus(games, eventsByGame, ids, 30);
  const si = subImpact(games, eventsByGame);
  const ml = minutesLoad(games, eventsByGame, ids);
  const xi = groups ? bestXI(sr, { GK: groups.GK.map((p) => p.id), DEF: groups.DEF.map((p) => p.id), MID: groups.MID.map((p) => p.id), FWD: groups.FWD.map((p) => p.id) }) : null;
  const starters = ids.filter((u) => sr[u]?.starts.games > 0).sort((a, b) => (sr[b].starts.ppg - sr[a].starts.ppg) || (sr[b].starts.games - sr[a].starts.games));
  const heavy = ids.filter((u) => ml[u]?.heavy);
  return (
    <div className="space-y-4">
      {xi && (
        <Card title="Best XI by results" hint="1-4-3-3 from roster positions · most points per start (min. 2 starts)">
          {[["Goalkeeper", xi.GK], ["Defenders", xi.DEF], ["Midfielders", xi.MID], ["Forwards", xi.FWD]].map(([label, list]) => (
            <Row key={label} label={label} value={list.length ? list.map((u) => short(playerById[u]?.name)).join(", ") : "–"} />
          ))}
        </Card>
      )}
      <Card title="Team results when a player starts" hint="Points per game when they start vs. when they don't (W=3, D=1)">
        {starters.length ? starters.slice(0, 12).map((u) => (
          <Row key={u} label={playerById[u]?.name} value={`${sr[u].starts.ppg} ppg`} sub={`starts ${rec(sr[u].starts)}${sr[u].without.games ? ` · without ${rec(sr[u].without)} (${sr[u].without.ppg} ppg)` : ""}`} />
        )) : <Empty>No finished games yet.</Empty>}
      </Card>
      <Card title="Best pairs on the field" hint="Goal difference while both played (30+ min together)">
        {pp.best.length ? pp.best.map((p) => <Row key={`${p.a}${p.b}`} label={`${short(playerById[p.a]?.name)} + ${short(playerById[p.b]?.name)}`} value={sign(p.diff)} sub={`${p.minutes} min · ${p.gf}–${p.ga}`} />) : <Empty>Not enough minutes together yet.</Empty>}
        {pp.worst.length > 0 && pp.worst[0].diff < 0 && (
          <>
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mt-2">Toughest pairs</div>
            {pp.worst.filter((p) => p.diff < 0).map((p) => <Row key={`w${p.a}${p.b}`} label={`${short(playerById[p.a]?.name)} + ${short(playerById[p.b]?.name)}`} value={sign(p.diff)} sub={`${p.minutes} min · ${p.gf}–${p.ga}`} />)}
          </>
        )}
      </Card>
      <Card title="Impact off the bench" hint="Goals for–against after coming on">
        {Object.keys(si).length ? Object.entries(si).sort((a, b) => (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga)).map(([u, v]) => (
          <Row key={u} label={playerById[u]?.name || "Player"} value={sign(v.gf - v.ga)} sub={`${v.apps} sub app${v.apps === 1 ? "" : "s"} · ${v.minutes} min · ${v.gf}–${v.ga}`} />
        )) : <Empty>No subs recorded yet.</Empty>}
      </Card>
      <Card title="Minutes load" hint="Season minutes · last 3 games (⚠ = full games in each of the last 3)">
        {ids.filter((u) => ml[u]?.season > 0).sort((a, b) => ml[b].season - ml[a].season).map((u) => (
          <Row key={u} label={`${heavy.includes(u) ? "⚠ " : ""}${playerById[u]?.name}`} value={`${ml[u].season} min`} sub={`last 3: ${ml[u].last3.map((x) => x.m).join(" · ")}`} />
        ))}
      </Card>
    </div>
  );
}

// ── Extra player numbers (My Stats) ────────────────────────────────────────
export function PlayerInsights({ uid, games, eventsByGame }) {
  const allEvents = games.flatMap((g) => eventsByGame[g.id] || []);
  const myShots = allEvents.filter((e) => e.uid === uid && ["goal", "shot_on", "shot_off"].includes(e.type));
  const td = turnoverDamage(allEvents).perPlayer[uid];
  const rv = regainValue(allEvents).perPlayer[uid];
  const sr = startRecords(games, eventsByGame, [uid])[uid];
  const si = subImpact(games, eventsByGame)[uid];
  const ml = minutesLoad(games, eventsByGame, [uid])[uid];
  return (
    <div className="space-y-4">
      {myShots.length > 0 && <ShotInsights shots={myShots} />}
      <Card title="Winning & losing the ball" hint="What happened within a minute after">
        <Row label="Won balls that led to our shot" value={rv ? `${rv.toShot}/${rv.won}` : "0/0"} sub={rv?.toGoal ? `${rv.toGoal} led to a goal` : ""} />
        <Row label="Lost balls that led to their shot" value={td ? `${td.toShot}/${td.lost}` : "0/0"} sub={td?.toGoal ? `${td.toGoal} led to a goal` : ""} />
      </Card>
      <Card title="Team results">
        <Row label="When you start" value={sr.starts.games ? `${rec(sr.starts)}` : "–"} sub={sr.starts.games ? `${sr.starts.ppg} points per game` : ""} />
        <Row label="When you don't start" value={sr.without.games ? `${rec(sr.without)}` : "–"} sub={sr.without.games ? `${sr.without.ppg} points per game` : ""} />
        {si && <Row label="Off the bench" value={sign(si.gf - si.ga)} sub={`${si.apps} sub app${si.apps === 1 ? "" : "s"} · ${si.gf}–${si.ga} after coming on`} />}
        {ml && <Row label="Last 3 games" value={ml.last3.map((x) => `${x.m}′`).join(" · ") || "–"} sub={ml.heavy ? "Full games in each of the last 3" : ""} />}
      </Card>
    </div>
  );
}
