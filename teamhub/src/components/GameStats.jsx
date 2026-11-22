// ─── Live game stats (Coach Center → Game Stats) ──────────────────────────
// Built for one thumb on a phone at the side of the field:
//   tap a PLAYER → tap what they did (big buttons) → for shots, tap WHERE.
// Score, clock, possession toggle, subs and undo are always on screen.
// Every tap is its own `gameEvents` doc; score / possession % / minutes /
// season stats are all derived from those (lib/gameStats.js), so undo is
// just "delete the last event". Firestore's offline cache queues taps made
// with no signal and syncs them later.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, where, orderBy } from "firebase/firestore";
import { Play, Pause, Undo2, ArrowLeftRight, X, Plus, ChevronLeft, ChevronRight, Trash2, Flag, BarChart3, Users, FileDown, Send, Sheet as SheetIcon, Printer } from "lucide-react";
import { db } from "../firebase";
import { useCollection, isLoading } from "../hooks/useCollection";
import { toast } from "../lib/toast";
import { shareSheetPdf } from "../lib/sharePdf";
import { gameCsv, seasonCsv, scorers, reportText, shareOrDownload, fileSafe, gameTitle, resultLetter } from "../lib/gameExport";
import { teamDateKey } from "../lib/dates";
import { groupByPosition } from "../data/rosterPositions";
import {
  PLAYER_ACTIONS, ACTION_LABEL, isShot, clockMs, fmtClock, minuteOf,
  possessionTotals, switchPossession, pausePossession, resumePossession, score, onFieldNow, playerLines, teamTotals, seasonLines, record,
} from "../lib/gameStats";

const RED = "#980000";
// Wall-clock reads happen in tap handlers only (not during render).
const nowMs = () => Date.now();
const buzz = () => { try { navigator.vibrate?.(12); } catch { /* not supported */ } };
const shortName = (name = "") => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (p.length < 2) return p[0] || "";
  return `${p[0]} ${p[p.length - 1][0]}.`;
};
const abbr = (s) => (String(s || "OPP").replace(/[^A-Za-z ]/g, "").trim().slice(0, 3) || "OPP").toUpperCase();

const Face = ({ p, size = 40 }) => (p?.photoURL ? (
  <img src={p.photoURL} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
) : (
  <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ width: size, height: size, backgroundColor: RED, fontSize: Math.round(size * 0.36) }}>
    {p?.initials || "?"}
  </div>
));

// Bottom sheet that sits above everything (incl. the live tracker).
const Sheet = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center" onClick={onClose} role="dialog" aria-label={title}>
    <div className="w-full max-w-md bg-white rounded-t-3xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base text-slate-900">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>
);

// Attacking half of a pitch (goal at the top). Used to tap a shot location
// and to draw shot maps. x, y are 0..1 inside this half.
const HalfPitch = ({ onTap, shots = [], className = "" }) => {
  const ref = useRef(null);
  const tap = (e) => {
    if (!onTap) return;
    const r = ref.current.getBoundingClientRect();
    onTap({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  return (
    <svg ref={ref} viewBox="0 0 100 70" className={`w-full rounded-2xl ${onTap ? "cursor-crosshair" : ""} ${className}`} style={{ background: "linear-gradient(180deg,#2E7D46,#276b3c)", touchAction: "manipulation" }} onClick={tap}>
      <g fill="none" stroke="rgba(255,255,255,.7)" strokeWidth=".6">
        <rect x="2" y="2" width="96" height="66" />
        <rect x="22" y="2" width="56" height="20" />
        <rect x="38" y="2" width="24" height="7" />
        <path d="M40 22 A10 10 0 0 0 60 22" />
        <path d="M38 68 A12 12 0 0 1 62 68" />
        <rect x="44" y="0.4" width="12" height="1.6" fill="rgba(255,255,255,.85)" />
      </g>
      <circle cx="50" cy="15" r=".8" fill="rgba(255,255,255,.8)" />
      {shots.map((s, i) => (
        <circle key={s.id || i} cx={2 + s.x * 96} cy={2 + s.y * 66} r={s.type === "goal" ? 2.4 : 1.8}
          fill={s.type === "goal" ? "#facc15" : s.type === "shot_on" ? "#fff" : "rgba(255,255,255,.15)"}
          stroke={s.type === "goal" ? "#854d0e" : "#fff"} strokeWidth=".5" />
      ))}
    </svg>
  );
};

const ShotLegend = () => (
  <div className="flex justify-center gap-4 text-[11px] text-slate-500 mt-2">
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 border border-yellow-800" />Goal</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-400" />On target</span>
    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-slate-400" />Off target</span>
  </div>
);

const TONE = {
  goal: "bg-yellow-400 text-yellow-950",
  good: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  bad: "bg-slate-100 text-slate-700",
  plain: "bg-white text-slate-800 border border-slate-200",
  yellow: "bg-yellow-100 text-yellow-900 border border-yellow-300",
  red: "bg-red-100 text-red-800 border border-red-200",
};

// ─── Live tracker (full screen) ────────────────────────────────────────────
function LiveTracker({ game, events, players, playerById, user, onClose }) {
  const [now, setNow] = useState(nowMs);
  const [who, setWho] = useState(null);         // player whose action we're picking
  const [spotFor, setSpotFor] = useState(null); // { uid, type } waiting for a shot location
  const [assistFor, setAssistFor] = useState(null); // goal scorer uid → pick assist
  const [subStep, setSubStep] = useState(null); // null | { out } (picking who comes on)
  const [feedOpen, setFeedOpen] = useState(false);
  const running = Boolean(game.clock?.running);

  // Tick the clock display; keep the screen awake while tracking.
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    let lock = null;
    navigator.wakeLock?.request?.("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, []);

  const ms = clockMs(game.clock, now);
  const sc = score(events);
  const poss = possessionTotals(game.possession, now);
  const onField = onFieldNow(game.starters || [], events);
  const onSet = new Set(onField);
  const bench = players.filter((p) => !onSet.has(p.id));
  const fieldPlayers = onField.map((u) => playerById[u] || { id: u, name: "Player", initials: "?" });
  const lines = useMemo(() => playerLines(game, events, now), [game, events, now]);

  const gameRef = doc(db, "games", game.id);
  const save = (patch) => updateDoc(gameRef, patch).catch((e) => toast("Couldn't save — " + (e?.message || "")));
  const add = async (type, extra = {}) => {
    buzz();
    try {
      await addDoc(collection(db, "gameEvents"), {
        teamId: game.teamId, gameId: game.id, type, ms: clockMs(game.clock), half: game.clock?.half || 1,
        ts: nowMs(), by: user.uid, byName: user.name || "", createdAt: serverTimestamp(), ...extra,
      });
    } catch (e) { toast("Couldn't save — " + (e?.message || "")); }
  };

  const toggleClock = () => {
    buzz();
    const t = nowMs();
    if (running) save({ clock: { ...game.clock, running: false, startedAt: null, elapsedMs: clockMs(game.clock, t) }, possession: pausePossession(game.possession, t) });
    else save({ clock: { ...game.clock, running: true, startedAt: t }, possession: resumePossession(game.possession, t) });
  };
  const setPoss = (holder) => {
    if (!running) { toast("Start the clock first.", "info"); return; }
    if (game.possession?.holder === holder) return; // already theirs
    buzz();
    save({ possession: switchPossession(game.possession, holder) });
  };
  const endHalf = () => {
    const t = nowMs();
    const half = game.clock?.half || 1;
    if (half >= 2) {
      if (!confirm(`End the game? Final score ${sc.us}–${sc.them}.`)) return;
      save({ status: "final", clock: { ...game.clock, running: false, startedAt: null, elapsedMs: clockMs(game.clock, t) }, possession: { ...switchPossession(game.possession, null, t), resume: null } });
      onClose();
      return;
    }
    save({ clock: { ...game.clock, running: false, startedAt: null, elapsedMs: clockMs(game.clock, t), half: 2 }, possession: { ...switchPossession(game.possession, null, t), resume: null } });
    toast("Halftime. Tap play to start the 2nd half.", "success");
  };
  const undo = async () => {
    const last = [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    if (!last) return;
    buzz();
    try {
      await deleteDoc(doc(db, "gameEvents", last.id));
      const p = playerById[last.uid];
      toast(`Undid: ${ACTION_LABEL[last.type] || last.type}${p ? ` — ${shortName(p.name)}` : ""}`, "success");
    } catch (e) { toast("Couldn't undo — " + (e?.message || "")); }
  };

  const pickAction = (a) => {
    const uid = who.id;
    setWho(null);
    if (a.needsSpot) { setSpotFor({ uid, type: a.id }); return; }
    add(a.id, { uid });
  };
  const placeShot = (spot) => {
    const { uid, type } = spotFor;
    setSpotFor(null);
    add(type, { uid, ...(spot || {}) });
    if (type === "goal") setAssistFor(uid);
  };

  const half = game.clock?.half || 1;
  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Score + clock */}
      <div className="text-white px-3 pt-2 pb-3" style={{ backgroundColor: RED }}>
        <div className="flex items-center justify-between">
          <button onClick={onClose} aria-label="Close tracker" className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">{half === 1 ? "1st half" : "2nd half"}</div>
          <button onClick={endHalf} className="text-[11px] font-bold uppercase tracking-wider px-3 h-10 rounded-full bg-white/15">{half === 1 ? "Halftime" : "End game"}</button>
        </div>
        <div className="flex items-center justify-center gap-4 mt-1">
          <div className="text-center"><div className="text-[11px] font-bold text-white/80">BRO</div><div className="text-4xl font-black leading-none tabular-nums">{sc.us}</div></div>
          <button onClick={toggleClock} className="flex flex-col items-center px-4 py-1.5 rounded-2xl bg-white/15 active:bg-white/25 min-w-[112px]" aria-label={running ? "Pause clock" : "Start clock"}>
            <span className="text-2xl font-black tabular-nums leading-tight">{fmtClock(ms)}</span>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/85">{running ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> {ms ? "Resume" : "Kick off"}</>}</span>
          </button>
          <div className="text-center"><div className="text-[11px] font-bold text-white/80">{abbr(game.opponent)}</div><div className="text-4xl font-black leading-none tabular-nums">{sc.them}</div></div>
        </div>
      </div>

      {/* Possession */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {[["us", "Our ball"], ["them", "Their ball"]].map(([h, label]) => {
            const active = game.possession?.holder === h;
            return (
              <button key={h} onClick={() => setPoss(h)}
                className={`h-12 rounded-2xl text-sm font-black uppercase tracking-wide transition ${active ? "text-white shadow" : "bg-white text-slate-500 border border-slate-200"} ${running ? "" : "opacity-50"}`}
                style={active ? { backgroundColor: h === "us" ? RED : "#334155" } : undefined}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="h-1.5 rounded-full bg-slate-300 mt-2 overflow-hidden"><div className="h-full" style={{ width: `${poss.usPct ?? 50}%`, backgroundColor: RED }} /></div>
        <div className="flex justify-between text-[10px] font-bold text-slate-500 mt-1"><span>Possession {poss.usPct ?? "–"}%</span><span>{poss.usPct == null ? "–" : 100 - poss.usPct}%</span></div>
      </div>

      {/* Players on the field */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 pb-1.5">Tap a player</div>
        <div className="grid grid-cols-3 gap-2">
          {fieldPlayers.map((p) => {
            const l = lines[p.id];
            const bits = l ? [l.goal && `${l.goal}G`, l.assist && `${l.assist}A`, l.shots && `${l.shots}Sh`].filter(Boolean).join(" · ") : "";
            return (
              <button key={p.id} onClick={() => { buzz(); setWho(p); }} className="bg-white rounded-2xl border border-slate-200 shadow-sm active:scale-[.97] active:bg-slate-50 transition flex flex-col items-center justify-center gap-1 py-2.5 px-1 min-h-[92px]">
                <Face p={p} size={40} />
                <span className="text-[13px] font-bold text-slate-900 leading-tight text-center break-words">{shortName(p.name)}</span>
                <span className="text-[10px] font-semibold text-slate-400 h-3 leading-none">{bits}</span>
              </button>
            );
          })}
          {fieldPlayers.length === 0 && <p className="col-span-3 text-sm text-slate-400 text-center py-6">No starters set. Use Sub to put players on.</p>}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="bg-white border-t border-slate-200 px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] grid grid-cols-5 gap-1.5">
        <button onClick={undo} disabled={!events.length} className="h-14 rounded-xl bg-slate-100 text-slate-700 flex flex-col items-center justify-center text-[10px] font-bold disabled:opacity-40"><Undo2 className="w-5 h-5" />Undo</button>
        <button onClick={() => add("opp_shot")} className="h-14 rounded-xl bg-slate-100 text-slate-700 flex flex-col items-center justify-center text-[10px] font-bold leading-tight text-center">Opp<br />shot</button>
        <button onClick={() => { if (confirm(`Goal for ${game.opponent || "the opponent"}?`)) add("opp_goal"); }} className="h-14 rounded-xl bg-slate-800 text-white flex flex-col items-center justify-center text-[10px] font-bold leading-tight text-center">Opp<br />goal</button>
        <button onClick={() => setSubStep({})} className="h-14 rounded-xl bg-slate-100 text-slate-700 flex flex-col items-center justify-center text-[10px] font-bold"><ArrowLeftRight className="w-5 h-5" />Sub</button>
        <button onClick={() => setFeedOpen(true)} className="h-14 rounded-xl bg-slate-100 text-slate-700 flex flex-col items-center justify-center text-[10px] font-bold"><Flag className="w-5 h-5" />More</button>
      </div>

      {who && (
        <Sheet title={who.name} onClose={() => setWho(null)}>
          <button onClick={() => pickAction(PLAYER_ACTIONS[0])} className={`w-full h-16 rounded-2xl text-lg font-black mb-2 active:scale-[.98] ${TONE.goal}`}>⚽ Goal</button>
          <div className="grid grid-cols-2 gap-2">
            {PLAYER_ACTIONS.slice(1).map((a) => (
              <button key={a.id} onClick={() => pickAction(a)} className={`h-14 rounded-2xl text-[15px] font-bold active:scale-[.98] ${TONE[a.tone]}`}>{a.label}</button>
            ))}
          </div>
        </Sheet>
      )}

      {spotFor && (
        <Sheet title={`Where was the ${spotFor.type === "goal" ? "goal" : "shot"} from?`} onClose={() => placeShot(null)}>
          <HalfPitch onTap={placeShot} />
          <button onClick={() => placeShot(null)} className="w-full h-12 mt-3 rounded-2xl text-sm font-bold text-slate-500 bg-slate-100">Skip</button>
        </Sheet>
      )}

      {assistFor && (
        <Sheet title="Assist by?" onClose={() => setAssistFor(null)}>
          <div className="grid grid-cols-3 gap-2">
            {fieldPlayers.filter((p) => p.id !== assistFor).map((p) => (
              <button key={p.id} onClick={() => { add("assist", { uid: p.id }); setAssistFor(null); }} className="rounded-2xl border border-slate-200 py-2 flex flex-col items-center gap-1 active:bg-slate-50">
                <Face p={p} size={34} /><span className="text-xs font-bold text-slate-800 text-center leading-tight">{shortName(p.name)}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setAssistFor(null)} className="w-full h-12 mt-3 rounded-2xl text-sm font-bold text-slate-500 bg-slate-100">No assist</button>
        </Sheet>
      )}

      {subStep && (
        <Sheet title={subStep.out === "__none__" ? "Who's coming on?" : subStep.out ? `Who's coming on for ${shortName(playerById[subStep.out]?.name)}?` : "Who's coming off?"} onClose={() => setSubStep(null)}>
          <div className="grid grid-cols-3 gap-2">
            {(subStep.out ? bench : fieldPlayers).map((p) => (
              <button key={p.id} onClick={() => {
                if (!subStep.out) { setSubStep({ out: p.id }); return; }
                add("sub", { outUid: subStep.out, inUid: p.id });
                toast(subStep.out === "__none__" ? `${shortName(p.name)} on` : `${shortName(p.name)} on for ${shortName(playerById[subStep.out]?.name)}`, "success");
                setSubStep(null);
              }} className="rounded-2xl border border-slate-200 py-2 flex flex-col items-center gap-1 active:bg-slate-50">
                <Face p={p} size={34} /><span className="text-xs font-bold text-slate-800 text-center leading-tight">{shortName(p.name)}</span>
              </button>
            ))}
          </div>
          {!subStep.out && bench.length > 0 && fieldPlayers.length < 11 && (
            <button onClick={() => setSubStep({ out: "__none__" })} className="w-full h-12 mt-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100">Just add a player (no one off)</button>
          )}
        </Sheet>
      )}

      {feedOpen && (
        <Sheet title="More" onClose={() => setFeedOpen(false)}>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button onClick={() => { add("corner"); setFeedOpen(false); }} className="h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-700">Our corner</button>
            <button onClick={() => { add("opp_corner"); setFeedOpen(false); }} className="h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-700">Their corner</button>
          </div>
          <EventFeed events={events} playerById={playerById} canDelete />
        </Sheet>
      )}
    </div>
  );
}

// ─── Event list (newest first) ─────────────────────────────────────────────
function EventFeed({ events, playerById, canDelete }) {
  const list = [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!list.length) return <p className="text-sm text-slate-400 text-center py-4">Nothing recorded yet.</p>;
  const del = async (e) => {
    if (!confirm(`Delete "${ACTION_LABEL[e.type] || e.type}"?`)) return;
    try { await deleteDoc(doc(db, "gameEvents", e.id)); } catch (err) { toast("Couldn't delete — " + (err?.message || "")); }
  };
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((e) => {
        const who = e.type === "sub"
          ? `${shortName(playerById[e.inUid]?.name) || "?"} on${e.outUid && e.outUid !== "__none__" ? ` for ${shortName(playerById[e.outUid]?.name) || "?"}` : ""}`
          : (playerById[e.uid] ? shortName(playerById[e.uid].name) : "");
        return (
          <li key={e.id} className="flex items-center gap-2 py-2">
            <span className="w-9 text-[11px] font-bold text-slate-400 tabular-nums">{minuteOf(e.ms || 0)}′</span>
            <span className="flex-1 min-w-0 text-sm text-slate-800"><span className="font-semibold">{ACTION_LABEL[e.type] || e.type}</span>{who ? <span className="text-slate-500"> · {who}</span> : null}</span>
            {canDelete && <button onClick={() => del(e)} aria-label="Delete" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 active:bg-slate-100"><Trash2 className="w-4 h-4" /></button>}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Stats table ───────────────────────────────────────────────────────────
const COLS = [
  ["games", "GP"], ["minutes", "Min"], ["goal", "G"], ["assist", "A"], ["shots", "Sh"], ["shot_on", "SOT"],
  ["key_pass", "KP"], ["won", "Won"], ["lost", "Lost"], ["save", "Sv"], ["yellow", "YC"],
];
function StatsTable({ lines, playerById, season = false, highlightUid = null, print = false }) {
  const [sort, setSort] = useState("goal");
  const cols = season ? COLS : COLS.filter(([k]) => k !== "games");
  const rows = Object.entries(lines)
    .map(([uid, l]) => ({ uid, p: playerById[uid], l }))
    .filter((r) => r.p)
    .sort((a, b) => (b.l[sort] - a.l[sort]) || String(a.p.name).localeCompare(String(b.p.name)));
  if (!rows.length) return <p className="text-sm text-slate-400 text-center py-4">No player stats yet.</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-400">
            <th className={`text-left font-bold py-2 pl-1 bg-white ${print ? "" : "sticky left-0"}`}>Player</th>
            {cols.map(([k, label]) => (
              <th key={k} className="font-bold px-1.5 py-2">
                {print ? label : <button onClick={() => setSort(k)} className={sort === k ? "text-slate-900 underline" : ""}>{label}</button>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ uid, p, l }) => (
            <tr key={uid} className={`border-t border-slate-100 ${uid === highlightUid ? "bg-yellow-50" : ""}`}>
              <td className={`py-2 pl-1 pr-2 font-semibold text-slate-800 whitespace-nowrap ${print ? "" : "sticky left-0"} ${uid === highlightUid ? "bg-yellow-50" : "bg-white"}`}>{print ? p.name : shortName(p.name)}{uid === highlightUid ? <span className="ml-1 text-[10px] font-black text-yellow-700">YOU</span> : null}</td>
              {cols.map(([k]) => <td key={k} className={`text-center px-1.5 ${l[k] ? "text-slate-900" : "text-slate-300"}`}>{l[k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Bar = ({ label, us, them, pct = false }) => {
  const total = (us || 0) + (them || 0);
  const w = pct ? us : total ? Math.round((us / total) * 100) : 50;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-sm font-bold text-slate-800 tabular-nums"><span>{pct ? `${us}%` : us}</span><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span><span>{pct ? `${100 - us}%` : them}</span></div>
      <div className="h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden"><div className="h-full" style={{ width: `${w}%`, backgroundColor: RED }} /></div>
    </div>
  );
};

// ─── Report: printable sheet (→ PDF) ───────────────────────────────────────
// Same pipeline as practice PDFs (lib/sharePdf renders #print-sheet page by
// page). highlightUid = a player viewing their own report.
function GameReportSheet({ game, events, playerById, highlightUid, onClose }) {
  const [busy, setBusy] = useState("");
  const sc = score(events);
  const t = teamTotals(game, events);
  const lines = playerLines(game, events);
  const shots = events.filter((e) => isShot(e.type) && e.x != null);
  const goals = scorers(events, playerById);
  const mine = highlightUid ? lines[highlightUid] : null;
  const cards = events.filter((e) => e.type === "yellow" || e.type === "red").sort((a, b) => (a.ms || 0) - (b.ms || 0));
  const save = async () => {
    setBusy("Making PDF…");
    try {
      const res = await shareSheetPdf(`${fileSafe(`${gameTitle(game)} ${game.date}`)}.pdf`, { onProgress: (i, n) => setBusy(n > 1 ? `Page ${i} of ${n}…` : "Making PDF…") });
      if (res?.missingImages) toast(`${res.missingImages} picture(s) couldn't be added.`);
    } catch (e) { toast("Couldn't make the PDF — " + (e?.message || "try again.")); }
    setBusy("");
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/60 overflow-y-auto" role="dialog" aria-label="Game report">
      <div className="min-h-full flex flex-col items-center px-3 py-4">
        <div className="w-full max-w-[820px] flex items-center justify-between gap-2 mb-3">
          <p className="text-white text-sm font-bold">Game report</p>
          <div className="flex gap-2">
            <button onClick={save} disabled={!!busy} className="flex items-center gap-1.5 text-xs font-bold px-4 h-11 rounded-full bg-white text-slate-900 disabled:opacity-60"><Printer className="w-4 h-4" />{busy || "Save / Share PDF"}</button>
            <button onClick={onClose} className="flex items-center gap-1 text-xs font-bold px-4 h-11 rounded-full bg-white/15 text-white"><X className="w-4 h-4" />Close</button>
          </div>
        </div>
        <div id="print-sheet" className="w-full max-w-[820px] bg-white text-slate-900 px-6 py-6">
          <div className="flex items-center justify-between border-b-4 pb-3" style={{ borderColor: RED }}>
            <div className="flex items-center gap-3">
              <img src="/brand/logo.png" alt="" className="h-12 w-auto" />
              <div>
                <div className="text-[11px] font-black tracking-[0.2em] text-slate-400">GAME REPORT</div>
                <div className="text-xl font-black">{gameTitle(game)}</div>
                <div className="text-xs text-slate-500">{game.date} · {game.homeAway === "away" ? "Away" : "Home"}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black tabular-nums">{sc.us}–{sc.them}</div>
              <div className="text-xs font-black tracking-wider" style={{ color: RED }}>{game.status === "final" ? ({ W: "WIN", L: "LOSS", D: "DRAW" })[resultLetter(sc)] : "IN PROGRESS"}</div>
            </div>
          </div>

          {mine && (
            <div className="mt-4 rounded-xl bg-yellow-50 border border-yellow-200 p-3 sheet-keep">
              <div className="text-[11px] font-black tracking-wider text-yellow-800">YOUR GAME — {playerById[highlightUid]?.name}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-sm">
                {[["Minutes", mine.minutes], ["Goals", mine.goal], ["Assists", mine.assist], ["Shots", mine.shots], ["On target", mine.shot_on], ["Key passes", mine.key_pass], ["Won ball", mine.won], ["Saves", mine.save]]
                  .filter(([, v], i) => v || i < 4).map(([k, v]) => <span key={k}><b className="tabular-nums">{v}</b> <span className="text-slate-600">{k}</span></span>)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-4 sheet-keep">
            <div>
              <h4 className="text-xs font-black tracking-wider text-slate-500 mb-1">TEAM</h4>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {[["Possession", t.possession == null ? "–" : `${t.possession}%`, t.possession == null ? "–" : `${100 - t.possession}%`], ["Shots", t.shots, t.oppShots], ["On target", t.shotsOn, t.oppGoals], ["Corners", t.corners, t.oppCorners], ["Fouls", t.fouls, ""], ["Cards", `${t.yellow}Y ${t.red}R`, ""]].map(([k, a, b]) => (
                    <tr key={k} className="border-b border-slate-100"><td className="py-1 text-slate-600">{k}</td><td className="py-1 text-right font-bold">{a}</td><td className="py-1 text-right text-slate-500 w-14">{b}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 mt-1">Brophy · {game.opponent}</p>
              {goals.length > 0 && (
                <>
                  <h4 className="text-xs font-black tracking-wider text-slate-500 mt-3 mb-1">GOALS</h4>
                  <ul className="text-sm space-y-0.5">{goals.map((g, i) => <li key={i}>⚽ <b>{g.name}</b> {g.minute}′{g.assist ? <span className="text-slate-500"> (assist {g.assist})</span> : null}</li>)}</ul>
                </>
              )}
              {cards.length > 0 && (
                <>
                  <h4 className="text-xs font-black tracking-wider text-slate-500 mt-3 mb-1">CARDS</h4>
                  <ul className="text-sm space-y-0.5">{cards.map((c) => <li key={c.id}>{c.type === "red" ? "🟥" : "🟨"} {playerById[c.uid]?.name || "Player"} {minuteOf(c.ms || 0)}′</li>)}</ul>
                </>
              )}
            </div>
            <div>
              <h4 className="text-xs font-black tracking-wider text-slate-500 mb-1">SHOT MAP</h4>
              <HalfPitch shots={shots} />
              <ShotLegend />
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-xs font-black tracking-wider text-slate-500 mb-1">PLAYERS</h4>
            <StatsTable lines={lines} playerById={playerById} highlightUid={highlightUid} print />
          </div>
          <div className="mt-4 pt-2 border-t border-slate-200 text-[10px] text-slate-400 sheet-footer">Brophy Soccer · recorded live in the team app</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Report card image (posted to team chat) ───────────────────────────────
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function renderReportCard(game, events, playerById) {
  const W = 1080; const H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const sc = score(events); const t = teamTotals(game, events); const lines = playerLines(game, events);
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, Segoe UI, sans-serif`;
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  x.fillStyle = RED; x.fillRect(0, 0, W, 470);
  const logo = await loadImg("/brand/logo-white.png");
  if (logo) { const lw = 260; x.globalAlpha = 0.95; x.drawImage(logo, 60, 50, lw, (logo.height / logo.width) * lw); x.globalAlpha = 1; }
  x.textAlign = "right"; x.fillStyle = "rgba(255,255,255,.8)"; x.font = font(800, 30); x.fillText("GAME REPORT", W - 60, 85);
  x.font = font(600, 30); x.fillText(`${game.date || ""} · ${game.homeAway === "away" ? "Away" : "Home"}`, W - 60, 128);
  x.textAlign = "center"; x.fillStyle = "#fff";
  x.font = font(800, 40); x.fillText("BROPHY", W / 2 - 240, 250); x.fillText(abbr(game.opponent) === "OPP" ? "OPPONENT" : String(game.opponent).toUpperCase().slice(0, 14), W / 2 + 240, 250);
  x.font = font(900, 170); x.fillText(String(sc.us), W / 2 - 240, 410); x.fillText(String(sc.them), W / 2 + 240, 410);
  x.font = font(800, 60); x.fillText("–", W / 2, 380);
  const res = game.status === "final" ? ({ W: "WIN", L: "LOSS", D: "DRAW" })[resultLetter(sc)] : "IN PROGRESS";
  x.font = font(900, 34); const rw = x.measureText(res).width + 60;
  x.fillStyle = "#fff"; x.beginPath(); x.roundRect?.(W / 2 - rw / 2, 418, rw, 52, 26); x.fill();
  x.fillStyle = RED; x.fillText(res, W / 2, 456);
  let y = 560;
  const goals = scorers(events, playerById);
  x.textAlign = "left"; x.fillStyle = "#0f172a";
  if (goals.length) {
    x.font = font(800, 30); x.fillStyle = "#64748b"; x.fillText("GOALS", 70, y); y += 50;
    x.fillStyle = "#0f172a";
    for (const g of goals.slice(0, 5)) {
      x.font = font(700, 38); x.fillText(`⚽ ${g.name}  ${g.minute}′`, 70, y);
      if (g.assist) { x.font = font(500, 30); x.fillStyle = "#64748b"; x.fillText(`assist ${g.assist}`, 140, y + 38); x.fillStyle = "#0f172a"; y += 38; }
      y += 58;
    }
    y += 10;
  }
  x.font = font(800, 30); x.fillStyle = "#64748b"; x.fillText("TEAM", 70, y); y += 30;
  const rows = [["Possession", t.possession, t.possession == null ? null : 100 - t.possession, true], ["Shots", t.shots, t.oppShots], ["On target", t.shotsOn, t.oppGoals], ["Corners", t.corners, t.oppCorners]];
  for (const [label, a, b, pct] of rows) {
    if (a == null) continue;
    y += 58;
    x.font = font(800, 38); x.fillStyle = "#0f172a"; x.textAlign = "left"; x.fillText(pct ? `${a}%` : String(a), 70, y);
    x.textAlign = "right"; x.fillText(pct ? `${b}%` : String(b), W - 70, y);
    x.textAlign = "center"; x.font = font(700, 28); x.fillStyle = "#64748b"; x.fillText(label.toUpperCase(), W / 2, y - 4);
    const tot = (a || 0) + (b || 0); const share = pct ? a / 100 : tot ? a / tot : 0.5;
    x.fillStyle = "#e2e8f0"; x.fillRect(70, y + 14, W - 140, 12); x.fillStyle = RED; x.fillRect(70, y + 14, (W - 140) * share, 12);
  }
  // Top performers: goals + assists, then shots.
  const top = Object.entries(lines).filter(([u]) => playerById[u])
    .map(([u, l]) => ({ u, l, k: l.goal * 3 + l.assist * 2 + l.shot_on + l.key_pass + l.save }))
    .filter((r) => r.k > 0).sort((a, b) => b.k - a.k).slice(0, 3);
  if (top.length && y < H - 260) {
    y += 90; x.textAlign = "left"; x.font = font(800, 30); x.fillStyle = "#64748b"; x.fillText("STANDOUTS", 70, y);
    for (const r of top) {
      y += 54; x.font = font(700, 34); x.fillStyle = "#0f172a"; x.fillText(playerById[r.u].name, 70, y);
      const bits = [r.l.goal && `${r.l.goal}G`, r.l.assist && `${r.l.assist}A`, r.l.shot_on && `${r.l.shot_on} SOT`, r.l.key_pass && `${r.l.key_pass} KP`, r.l.save && `${r.l.save} save${r.l.save > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
      x.textAlign = "right"; x.font = font(600, 30); x.fillStyle = "#475569"; x.fillText(bits, W - 70, y); x.textAlign = "left";
    }
  }
  x.fillStyle = "#f1f5f9"; x.fillRect(0, H - 90, W, 90);
  x.textAlign = "center"; x.font = font(600, 28); x.fillStyle = "#475569"; x.fillText("Your own stats: open the app → Home → Game report", W / 2, H - 36);
  return new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.9));
}

// ─── One game: summary ─────────────────────────────────────────────────────
function GameSummary({ game, events, playerById, isCoach, canRecord = isCoach, onTrack, onBack, highlightUid = null, onSendReport }) {
  const sc = score(events);
  const t = teamTotals(game, events);
  const lines = playerLines(game, events);
  const shots = events.filter((e) => isShot(e.type) && e.x != null);
  const [reportOpen, setReportOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const exportCsv = () => shareOrDownload(`${fileSafe(`${gameTitle(game)} ${game.date}`)}.csv`, gameCsv(game, events, playerById), "text/csv")
    .catch((e) => toast("Couldn't export — " + (e?.message || "")));
  const send = async () => {
    if (!onSendReport) return;
    if (!confirm(`Post the game report to team chat? Everyone gets a notification${game.reportSentAt ? " (it was already sent once)" : ""}.`)) return;
    setSending(true);
    try {
      const blob = await renderReportCard(game, events, playerById);
      await onSendReport(blob, reportText(game, events, playerById), `${fileSafe(gameTitle(game))}.jpg`);
      await updateDoc(doc(db, "games", game.id), { reportSentAt: new Date().toISOString() });
      toast("Report sent to the team chat.", "success");
    } catch (e) { toast("Couldn't send — " + (e?.message || "")); }
    setSending(false);
  };
  const del = async () => {
    if (!confirm(`Delete the game vs ${game.opponent} and all its stats?`)) return;
    try {
      await Promise.all(events.map((e) => deleteDoc(doc(db, "gameEvents", e.id))));
      await deleteDoc(doc(db, "games", game.id));
      onBack();
    } catch (e) { toast("Couldn't delete — " + (e?.message || "")); }
  };
  return (
    <div className="px-5 pt-3 pb-8 space-y-4">
      {onBack && <button onClick={onBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> All games</button>}
      <div className="rounded-2xl text-white p-4 text-center" style={{ backgroundColor: RED }}>
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">{game.status === "final" ? "Final" : "Live"} · {game.date} · {game.homeAway === "away" ? "Away" : "Home"}</div>
        <div className="flex items-center justify-center gap-5 mt-1">
          <div><div className="text-[11px] font-bold text-white/80">Brophy</div><div className="text-4xl font-black tabular-nums">{sc.us}</div></div>
          <div className="text-white/60 font-bold">–</div>
          <div><div className="text-[11px] font-bold text-white/80 max-w-[120px] truncate">{game.opponent}</div><div className="text-4xl font-black tabular-nums">{sc.them}</div></div>
        </div>
        {canRecord && (
          <button onClick={onTrack} className="mt-3 h-11 px-5 rounded-full bg-white text-sm font-black inline-flex items-center gap-2" style={{ color: RED }}>
            <Play className="w-4 h-4" /> {game.status === "final" ? "Edit stats" : "Open live tracker"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setReportOpen(true)} className="h-12 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5"><FileDown className="w-4 h-4" /> PDF report</button>
        <button onClick={exportCsv} className="h-12 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5"><SheetIcon className="w-4 h-4" /> Export CSV</button>
        {isCoach && onSendReport && (
          <button onClick={send} disabled={sending} className="col-span-2 h-14 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: RED }}>
            <Send className="w-4 h-4" /> {sending ? "Sending…" : game.reportSentAt ? "Send report again" : "Send report to team"}
          </button>
        )}
        {isCoach && game.reportSentAt && <p className="col-span-2 text-[11px] text-slate-400 text-center -mt-1">Sent to team chat {new Date(game.reportSentAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        {t.possession != null && <Bar label="Possession" us={t.possession} pct />}
        <Bar label="Shots" us={t.shots} them={t.oppShots} />
        <Bar label="On target" us={t.shotsOn} them={t.oppGoals} />
        <Bar label="Corners" us={t.corners} them={t.oppCorners} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h4 className="font-bold text-sm text-slate-900 mb-2">Shot map</h4>
        <HalfPitch shots={shots} />
        <ShotLegend />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h4 className="font-bold text-sm text-slate-900 mb-1">Players</h4>
        <StatsTable lines={lines} playerById={playerById} highlightUid={highlightUid} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h4 className="font-bold text-sm text-slate-900 mb-1">Timeline</h4>
        <EventFeed events={events} playerById={playerById} canDelete={canRecord} />
      </div>
      {isCoach && <button onClick={del} className="w-full text-xs font-bold text-red-500 py-2">Delete this game</button>}
      {reportOpen && <GameReportSheet game={game} events={events} playerById={playerById} highlightUid={highlightUid} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

// ─── New game ──────────────────────────────────────────────────────────────
function NewGameSheet({ players, lineups, onCreate, onClose }) {
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(teamDateKey());
  const [homeAway, setHomeAway] = useState("home");
  const [starters, setStarters] = useState([]);
  const [busy, setBusy] = useState(false);
  const ids = new Set(players.map((p) => p.id));
  const fromLineup = (l) => setStarters((l.slots || []).map((s) => s.uid).filter((u) => u && ids.has(u)).slice(0, 11));
  const toggle = (id) => setStarters((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 11 ? s : [...s, id]));
  const create = async () => {
    if (!opponent.trim()) { toast("Add the opponent's name."); return; }
    setBusy(true);
    try { await onCreate({ opponent: opponent.trim(), date, homeAway, starters }); } finally { setBusy(false); }
  };
  return (
    <Sheet title="New game" onClose={onClose}>
      <div className="space-y-3">
        <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent (e.g. Jesuit)" className="w-full h-12 border border-slate-200 rounded-xl px-3 text-base" autoFocus />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 h-12 border border-slate-200 rounded-xl px-3 text-base bg-white" />
          <div className="flex rounded-xl bg-slate-100 p-1">
            {["home", "away"].map((h) => (
              <button key={h} onClick={() => setHomeAway(h)} className={`px-3 rounded-lg text-sm font-bold capitalize ${homeAway === h ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{h}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Starters ({starters.length}/11)</span>
            {starters.length > 0 && <button onClick={() => setStarters([])} className="text-[11px] font-semibold text-slate-400">Clear</button>}
          </div>
          {lineups.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1">
              {lineups.map((l) => (
                <button key={l.id} onClick={() => fromLineup(l)} className="flex-shrink-0 h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-700 bg-white">Use “{l.name || l.formation || "Line-up"}”</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 max-h-[38vh] overflow-y-auto">
            {players.map((p) => {
              const on = starters.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggle(p.id)} className={`rounded-xl py-2 px-1 flex flex-col items-center gap-1 border ${on ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-800"}`} style={on ? { backgroundColor: RED } : undefined}>
                  <span className={on ? "rounded-full ring-2 ring-white" : ""}><Face p={p} size={30} /></span><span className="text-[11px] font-bold leading-tight text-center">{shortName(p.name)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={create} disabled={busy} className="w-full h-14 rounded-2xl text-white text-base font-black disabled:opacity-50" style={{ backgroundColor: RED }}>
          {busy ? "…" : "Start tracking"}
        </button>
      </div>
    </Sheet>
  );
}

const sameRoster = (a, b) => {
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  if (ka.join("|") !== kb.join("|")) return false;
  return ka.every((k) => ["name", "initials", "photoURL"].every((f) => (a[k]?.[f] || "") === (b[k]?.[f] || "")));
};

// ─── Coach: choose stat keepers ────────────────────────────────────────────
// Anyone on the team can be one: a player who is injured or sitting out, a
// team manager, or a parent who has an account on the team.
function StatKeepersSheet({ allUsers, activeTeamId, players, current, onSave, onClose }) {
  const [sel, setSel] = useState(current);
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => {
    const staff = (allUsers || []).filter((u) => u.role !== "player" && (u.teamIds || []).includes(activeTeamId) && u.role !== "admin" && u.role !== "orgAdmin");
    return [...players, ...staff].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [allUsers, activeTeamId, players]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Sheet title="Stat keepers" onClose={onClose}>
      <p className="text-[13px] text-slate-500 leading-snug mb-3">They can record games from their phone (start games, tap stats, undo, subs). Only coaches can delete games or send reports. Coaches can always record.</p>
      <div className="grid grid-cols-2 gap-1.5 max-h-[50vh] overflow-y-auto">
        {people.map((p) => {
          const on = sel.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} className={`flex items-center gap-2 px-2 py-2 rounded-xl border text-left ${on ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-800"}`} style={on ? { backgroundColor: RED } : undefined}>
              <span className={on ? "rounded-full ring-2 ring-white" : ""}><Face p={p} size={28} /></span>
              <span className="text-[13px] font-bold leading-tight min-w-0 break-words">{p.name}</span>
            </button>
          );
        })}
      </div>
      <button disabled={busy} onClick={async () => { setBusy(true); await onSave(sel); setBusy(false); }} className="w-full h-14 mt-3 rounded-2xl text-white text-base font-black disabled:opacity-50" style={{ backgroundColor: RED }}>
        {busy ? "…" : `Save${sel.length ? ` (${sel.length})` : ""}`}
      </button>
    </Sheet>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function GameStatsPage({ user, activeTeamId, allUsers = [], lineups = [], positionsByUid, isCoach = false, canRecord = isCoach, statKeepers = null, setStatKeepers, onSendReport, startGameId = null }) {
  const games = useCollection(activeTeamId ? "games" : null, where("teamId", "==", activeTeamId), orderBy("date", "desc"));
  const allEvents = useCollection(activeTeamId ? "gameEvents" : null, where("teamId", "==", activeTeamId));
  const [tab, setTab] = useState("games");
  const [openId, setOpenId] = useState(startGameId);
  const [tracking, setTracking] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [keepersOpen, setKeepersOpen] = useState(false);

  // Players on this team, ordered GK → DEF → MID → FWD (roster positions),
  // with names resolved like the roster.
  // A stat keeper's phone doesn't load the team list (the rules don't let a
  // player list the roster), so it uses the roster snapshot the coach saves
  // on appConfig/statKeepers_<team>.
  const snapshotUsers = useMemo(() => Object.entries(statKeepers?.roster || {}).map(([id, r]) => ({ id, role: "player", teamIds: [activeTeamId], ...r })), [statKeepers, activeTeamId]);
  const players = useMemo(() => {
    const source = (allUsers || []).length ? allUsers : snapshotUsers;
    const team = source.filter((u) => (u.role || "player") === "player" && (u.teamIds || []).includes(activeTeamId));
    const { groups } = groupByPosition(team, activeTeamId, positionsByUid || {});
    return [...groups.GK, ...groups.DEF, ...groups.MID, ...groups.FWD, ...groups.NONE];
  }, [allUsers, snapshotUsers, activeTeamId, positionsByUid]);
  // Names: live accounts first, then the roster snapshot saved on each game
  // (players' phones don't load the team list, and people can leave the team).
  const playerById = useMemo(() => {
    const m = {};
    for (const g of games) for (const [uid, r] of Object.entries(g.roster || {})) m[uid] = m[uid] || { id: uid, name: r.name, initials: r.initials || "" };
    for (const p of players) m[p.id] = p;
    if (user?.uid && !m[user.uid] && user.name) m[user.uid] = { id: user.uid, name: user.name, initials: user.initials || "", photoURL: user.photoURL };
    return m;
  }, [games, players, user]);
  // Coach: keep the stat keepers' roster snapshot current (only when there
  // are stat keepers, and only when names/photos actually changed).
  const keeperUids = useMemo(() => statKeepers?.uids || [], [statKeepers]);
  useEffect(() => {
    if (!isCoach || !setStatKeepers || !keeperUids.length || !(allUsers || []).length) return;
    const roster = Object.fromEntries(players.map((p) => [p.id, { name: p.name || "", initials: p.initials || "", photoURL: p.photoURL || "" }]));
    // Compare without caring about key order (Firestore may return maps in another order).
    if (!sameRoster(roster, statKeepers?.roster || {})) setStatKeepers(keeperUids, roster).catch(() => {});
  }, [isCoach, setStatKeepers, keeperUids, allUsers, players, statKeepers]);
  const eventsByGame = useMemo(() => {
    const m = {};
    for (const e of allEvents) (m[e.gameId] = m[e.gameId] || []).push(e);
    return m;
  }, [allEvents]);

  const createGame = async ({ opponent, date, homeAway, starters }) => {
    try {
      const ref = await addDoc(collection(db, "games"), {
        teamId: activeTeamId, opponent, date, homeAway, starters, status: "live",
        // Name snapshot so reports read well on every phone, forever.
        roster: Object.fromEntries(players.map((p) => [p.id, { name: p.name || "", initials: p.initials || "" }])),
        clock: { running: false, startedAt: null, elapsedMs: 0, half: 1 },
        possession: { holder: null, since: null, usMs: 0, themMs: 0 },
        createdBy: user.uid, createdByName: user.name || "", createdAt: serverTimestamp(),
      });
      setNewOpen(false);
      setOpenId(ref.id);
      setTracking(ref.id);
    } catch (e) { toast("Couldn't create the game — " + (e?.message || "")); }
  };

  const trackingGame = tracking && games.find((g) => g.id === tracking);
  if (trackingGame) {
    return <LiveTracker game={trackingGame} events={eventsByGame[trackingGame.id] || []} players={players} playerById={playerById} user={user} onClose={() => setTracking(null)} />;
  }
  const openGame = openId && games.find((g) => g.id === openId);
  if (openGame) {
    return <GameSummary game={openGame} events={eventsByGame[openGame.id] || []} playerById={playerById} isCoach={isCoach} canRecord={canRecord} onTrack={() => setTracking(openGame.id)} onBack={() => setOpenId(null)} highlightUid={isCoach ? null : user.uid} onSendReport={onSendReport} />;
  }

  const rec = record(games, eventsByGame);
  const season = seasonLines(games, eventsByGame);
  const seasonShots = allEvents.filter((e) => isShot(e.type) && e.x != null);
  return (
    <div className="px-5 pt-3 pb-8 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Game Stats</h3>
          <p className="text-xs text-slate-500 mt-0.5">Record {rec.w}–{rec.d}–{rec.l} (W–D–L)</p>
          {isCoach && setStatKeepers && (
            <button onClick={() => setKeepersOpen(true)} className="mt-1.5 text-[11px] font-bold px-2.5 h-7 rounded-full border border-slate-200 bg-white text-slate-700 inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Stat keepers{keeperUids.length ? ` (${keeperUids.length})` : ""}
            </button>
          )}
          {!isCoach && canRecord && <p className="text-[11px] font-bold mt-1" style={{ color: RED }}>You're a stat keeper</p>}
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {[["games", "Games"], ["season", "Season"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3 h-8 rounded-lg text-xs font-bold ${tab === id ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "games" ? (
        <>
          {canRecord && (
            <button onClick={() => setNewOpen(true)} className="w-full rounded-2xl p-4 text-white flex items-center gap-3 shadow-sm" style={{ backgroundColor: RED }}>
              <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Plus className="w-6 h-6" /></span>
              <span className="text-left"><span className="block font-black text-base">New game</span><span className="block text-xs text-white/75">Track it live from your phone</span></span>
            </button>
          )}
          {isLoading(games) ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          ) : games.length === 0 ? (
            <div className="rounded-2xl p-6 border border-dashed border-slate-200 bg-white text-center">
              <BarChart3 className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mt-2">No games yet</p>
              <p className="text-xs text-slate-400">Start one at kickoff: tap a player, then what they did.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {games.map((g) => {
                const s = score(eventsByGame[g.id] || []);
                const result = g.status !== "final" ? "LIVE" : s.us > s.them ? "W" : s.us < s.them ? "L" : "D";
                return (
                  <li key={g.id}>
                    <button onClick={() => (g.status === "live" && canRecord ? (setOpenId(g.id), setTracking(g.id)) : setOpenId(g.id))} className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3 text-left">
                      <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black ${result === "LIVE" ? "text-white animate-pulse" : result === "W" ? "bg-emerald-100 text-emerald-700" : result === "L" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`} style={result === "LIVE" ? { backgroundColor: RED, fontSize: 10 } : undefined}>{result}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-slate-900 truncate">{g.homeAway === "away" ? "@ " : "vs "}{g.opponent}</span>
                        <span className="block text-xs text-slate-500">{g.date}</span>
                      </span>
                      <span className="text-lg font-black tabular-nums text-slate-900">{s.us}–{s.them}</span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <button onClick={() => shareOrDownload(`Brophy-season-stats-${teamDateKey()}.csv`, seasonCsv(games, eventsByGame, playerById), "text/csv").catch((e) => toast("Couldn't export — " + (e?.message || "")))}
            className="w-full h-12 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-1.5"><SheetIcon className="w-4 h-4" /> Export season (CSV)</button>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-1.5"><Users className="w-4 h-4" /> Season — players</h4>
            <p className="text-[11px] text-slate-400 mb-1">Tap a column to sort.</p>
            <StatsTable lines={season} playerById={playerById} season highlightUid={isCoach ? null : user.uid} />
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h4 className="font-bold text-sm text-slate-900 mb-2">Season shot map</h4>
            <HalfPitch shots={seasonShots} />
            <ShotLegend />
          </div>
        </>
      )}

      {keepersOpen && <StatKeepersSheet allUsers={allUsers} activeTeamId={activeTeamId} players={players} current={keeperUids} onSave={async (uids) => {
        const roster = Object.fromEntries(players.map((p) => [p.id, { name: p.name || "", initials: p.initials || "", photoURL: p.photoURL || "" }]));
        try { await setStatKeepers(uids, roster); toast(uids.length ? "Stat keepers saved." : "No stat keepers now.", "success"); setKeepersOpen(false); } catch (e) { toast("Couldn't save — " + (e?.message || "")); }
      }} onClose={() => setKeepersOpen(false)} />}
      {newOpen && <NewGameSheet players={players} lineups={lineups} onCreate={createGame} onClose={() => setNewOpen(false)} />}
    </div>
  );
}

// ─── Player Home: latest game report ───────────────────────────────────────
// Shows the most recent finished game with the player's own line; tap to
// open the full report (their row highlighted) and their season stats.
export function LatestGameCard({ user, activeTeamId, allUsers = [], positionsByUid, isStatKeeper = false, statKeepers = null, lineups = [] }) {
  const games = useCollection(activeTeamId ? "games" : null, where("teamId", "==", activeTeamId), orderBy("date", "desc"));
  const allEvents = useCollection(activeTeamId ? "gameEvents" : null, where("teamId", "==", activeTeamId));
  const [open, setOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const game = games.find((g) => g.status === "final");
  if (!game && !isStatKeeper) return null;
  const live = games.find((g) => g.status === "live");
  const keeperButton = isStatKeeper && (
    <button onClick={() => setRecordOpen(true)} className="w-full rounded-2xl p-4 text-white flex items-center gap-3 shadow-sm mb-2" style={{ backgroundColor: RED }}>
      <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><BarChart3 className="w-6 h-6" /></span>
      <span className="flex-1 text-left"><span className="block font-black text-base">Record game stats</span><span className="block text-xs text-white/75">{live ? `Live now: vs ${live.opponent} — tap to keep tracking` : "You're a stat keeper"}</span></span>
      <ChevronRight className="w-5 h-5 text-white/70" />
    </button>
  );
  const recordOverlay = recordOpen && createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-50 overflow-y-auto" role="dialog" aria-label="Game Stats" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-slate-900">Game Stats</span>
        <button onClick={() => setRecordOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-w-md mx-auto">
        <GameStatsPage user={user} activeTeamId={activeTeamId} allUsers={allUsers} lineups={lineups} positionsByUid={positionsByUid} canRecord statKeepers={statKeepers} />
      </div>
    </div>,
    document.body,
  );
  if (!game) return <div className="px-5 pt-4 -mb-1">{keeperButton}{recordOverlay}</div>;
  const events = allEvents.filter((e) => e.gameId === game.id);
  const sc = score(events);
  const me = playerLines(game, events)[user.uid];
  const mine = me ? [me.goal && `${me.goal} goal${me.goal > 1 ? "s" : ""}`, me.assist && `${me.assist} assist${me.assist > 1 ? "s" : ""}`, me.shots && `${me.shots} shot${me.shots > 1 ? "s" : ""}`, me.save && `${me.save} save${me.save > 1 ? "s" : ""}`, me.minutes && `${me.minutes} min`].filter(Boolean).join(" · ") : "";
  const res = resultLetter(sc);
  return (
    <div className="px-5 pt-4 -mb-1">
      {keeperButton}
      {recordOverlay}
      <button onClick={() => setOpen(true)} className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 text-left">
        <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black ${res === "W" ? "bg-emerald-100 text-emerald-700" : res === "L" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{res}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-black tracking-wider text-slate-400">GAME REPORT · {game.date}</span>
          <span className="block font-bold text-slate-900 truncate">{gameTitle(game)} · {sc.us}–{sc.them}</span>
          <span className="block text-xs text-slate-500 truncate">{mine ? `You: ${mine}` : "Tap to see the team's stats"}</span>
        </span>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-50 overflow-y-auto" role="dialog" aria-label="Game report" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
            <span className="font-bold text-slate-900">Game report</span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
          <div className="max-w-md mx-auto">
            <GameStatsPage user={user} activeTeamId={activeTeamId} allUsers={allUsers} positionsByUid={positionsByUid} startGameId={game.id} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
