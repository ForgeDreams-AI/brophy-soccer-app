// Tactics board — a lightweight coach's board (TacticalPad-style): drag
// player tokens (home / away / neutral), the ball, cones and goals around a
// field, and draw movement / pass arrows (gold) or plain field lines (white).
// The field backdrop switches per sport so it works for any team.
// Self-contained SVG (no external assets) so it themes, serializes, and
// exports to PNG cleanly. Positions are normalized 0..1 so the board scales
// to any size.
//
// API: <TacticsBoard initial={diagramData} onSave={saveBoard} onClose={...} />
// onSave(pngBlob, state) — pngBlob is a rasterized image saved as the drill
// diagram; state is { field, tokens, arrows } JSON so the board is re-editable.
//
// Copied from the v1 app; API unchanged. The editing chrome (header, toolbar,
// token colors) resolves through the white-label theme instead of v1's
// hard-coded slate/navy.

import { useRef, useState } from "react";
import { X, Trash2, RotateCcw, Undo2, MousePointer2, Spline, Save } from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";

const W = 680, H = 1000; // portrait board
const R = 20;            // token radius in board units
const rid = () => Math.random().toString(36).slice(2, 9);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const FIELDS = [
  ["soccer", "Soccer — Full"],
  ["soccer-half", "Soccer — Half"],
  ["soccer-third", "Soccer — Att. third"],
  ["soccer-box", "Soccer — Penalty box"],
  ["basketball", "Basketball"],
  ["football", "Football"],
  ["blank", "Blank"],
];
const bgFor = (field) => (field === "basketball" ? "#B5763B" : field === "blank" ? "#3A7A4E" : "#2E7D46");

// A hand-drawn "dribble" squiggle from (x1,y1)→(x2,y2): a sine wave along the
// line, tapered to 0 at both ends so it starts/ends cleanly. Returns an SVG path.
const wavyPath = (x1, y1, x2, y2, amp = 7, wl = 20) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux; // along + perpendicular
  const steps = Math.max(8, Math.round(len / 6));
  let d = `M ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * (len / wl) * Math.PI * 2) * amp * Math.sin(t * Math.PI);
    const x = x1 + ux * len * t + px * off, y = y1 + uy * len * t + py * off;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

// White line style shared by all field markings.
const L = { fill: "none", stroke: "rgba(255,255,255,0.85)", strokeWidth: 3 };

function Field({ field }) {
  const m = 26, x0 = m, y0 = m, x1 = W - m, y1 = H - m, cx = W / 2, cy = H / 2;
  const bg = <rect x={0} y={0} width={W} height={H} fill={bgFor(field)} />;

  if (field === "blank") {
    return <g>{bg}<rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...L} /></g>;
  }

  // Soccer surfaces — attacking view, goal at the TOP.
  if (field === "soccer-half" || field === "soccer-third" || field === "soccer-box") {
    const boxW = field === "soccer-box" ? 600 : field === "soccer-third" ? 460 : 400;
    const boxD = field === "soccer-box" ? 560 : field === "soccer-third" ? 300 : 180;
    const sixW = boxW * 0.5, sixD = boxD * 0.32, spot = y0 + boxD * 0.66;
    const goalW = field === "soccer-box" ? 240 : 130;
    return (
      <g>
        {bg}
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...L} />
        <rect x={cx - goalW / 2} y={y0 - 6} width={goalW} height={6} fill="rgba(255,255,255,0.9)" />
        <rect x={cx - boxW / 2} y={y0} width={boxW} height={boxD} {...L} />
        <rect x={cx - sixW / 2} y={y0} width={sixW} height={sixD} {...L} />
        <circle cx={cx} cy={spot} r={4} fill="rgba(255,255,255,0.85)" />
        <path d={`M ${cx - 80} ${y0 + boxD} A 90 90 0 0 0 ${cx + 80} ${y0 + boxD}`} {...L} />
        {field === "soccer-half" && (
          <>
            <line x1={x0} y1={y1} x2={x1} y2={y1} {...L} />
            <path d={`M ${cx - 90} ${y1} A 90 90 0 0 0 ${cx + 90} ${y1}`} {...L} />
          </>
        )}
        {field === "soccer-third" && <line x1={x0} y1={y1} x2={x1} y2={y1} {...L} strokeDasharray="10 8" />}
      </g>
    );
  }

  if (field === "basketball") {
    const keyW = 160, keyH = 190, ftR = 60, hoopY = 44;
    const arc = (top) => {
      const r = 240, y = top ? y0 + 2 : y1 - 2;
      return `M ${x0 + 18} ${y} A ${r} ${r} 0 0 ${top ? 1 : 0} ${x1 - 18} ${y}`;
    };
    return (
      <g>
        {bg}
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...L} />
        <line x1={x0} y1={cy} x2={x1} y2={cy} {...L} />
        <circle cx={cx} cy={cy} r={70} {...L} />
        {/* top */}
        <rect x={cx - keyW / 2} y={y0} width={keyW} height={keyH} {...L} />
        <circle cx={cx} cy={y0 + keyH} r={ftR} {...L} />
        <line x1={cx - 40} y1={y0 + hoopY} x2={cx + 40} y2={y0 + hoopY} {...L} />
        <circle cx={cx} cy={y0 + hoopY + 12} r={9} {...L} />
        <path d={arc(true)} {...L} />
        {/* bottom */}
        <rect x={cx - keyW / 2} y={y1 - keyH} width={keyW} height={keyH} {...L} />
        <circle cx={cx} cy={y1 - keyH} r={ftR} {...L} />
        <line x1={cx - 40} y1={y1 - hoopY} x2={cx + 40} y2={y0 + hoopY - 12} {...L} />
        <circle cx={cx} cy={y1 - hoopY - 12} r={9} {...L} />
        <path d={arc(false)} {...L} />
      </g>
    );
  }

  if (field === "football") {
    const ez = 120; // end-zone depth
    const lines = [];
    const top = y0 + ez, bot = y1 - ez;
    const step = (bot - top) / 10;
    for (let i = 0; i <= 10; i++) {
      const y = top + step * i;
      lines.push(<line key={i} x1={x0} y1={y} x2={x1} y2={y} {...L} strokeWidth={i === 5 ? 4 : 2} />);
    }
    return (
      <g>
        {bg}
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...L} />
        <line x1={x0} y1={top} x2={x1} y2={top} {...L} />
        <line x1={x0} y1={bot} x2={x1} y2={bot} {...L} />
        {lines}
      </g>
    );
  }

  // soccer (default)
  const boxW = 380, boxH = 150, gW = 190, gH = 60;
  return (
    <g>
      {bg}
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={0} y={(H / 10) * i} width={W} height={H / 10} fill={i % 2 ? "#2A7341" : "#2E7D46"} />
      ))}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...L} />
      <line x1={x0} y1={cy} x2={x1} y2={cy} {...L} />
      <circle cx={cx} cy={cy} r={90} {...L} />
      <circle cx={cx} cy={cy} r={5} fill="rgba(255,255,255,0.85)" />
      <rect x={cx - boxW / 2} y={y0} width={boxW} height={boxH} {...L} />
      <rect x={cx - gW / 2} y={y0} width={gW} height={gH} {...L} />
      <rect x={cx - boxW / 2} y={y1 - boxH} width={boxW} height={boxH} {...L} />
      <rect x={cx - gW / 2} y={y1 - gH} width={gW} height={gH} {...L} />
    </g>
  );
}

// A goal, drawn as a white frame with a light net, centered on (x,y).
function Goal({ x, y }) {
  const w = 84, h = 34;
  const left = x - w / 2, top = y - h / 2;
  const nets = [];
  for (let i = 1; i < 6; i++) nets.push(<line key={"v" + i} x1={left + (w / 6) * i} y1={top} x2={left + (w / 6) * i} y2={top + h} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />);
  nets.push(<line key="h" x1={left} y1={y} x2={left + w} y2={y} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />);
  return (
    <g>
      <rect x={left} y={top} width={w} height={h} rx={3} fill="rgba(255,255,255,0.14)" stroke="#fff" strokeWidth={3} />
      {nets}
    </g>
  );
}

export default function TacticsBoard({ initial, onSave, onClose }) {
  const { t } = useTheme();
  // Token + annotation colors resolve through the team theme: home discs wear
  // the team navy, movement arrows wear the team gold.
  const TEAM = { home: t("primary"), away: t("danger"), neutral: t("accent") };
  const ARROW = t("accent");
  const LINE = "#FFFFFF"; // field-line color

  const svgRef = useRef(null);
  const [field, setField] = useState(() => initial?.field || "soccer");
  const [tokens, setTokens] = useState(() => initial?.tokens || []);
  const [arrows, setArrows] = useState(() => initial?.arrows || []);
  const [mode, setMode] = useState("move");       // move | draw
  const [drawKind, setDrawKind] = useState("run"); // run | pass | line
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const dragId = useRef(null);
  const drawFrom = useRef(null);
  const moved = useRef(false);
  const undoStack = useRef([]);

  const snapshot = () => {
    undoStack.current.push({ field, tokens, arrows });
    if (undoStack.current.length > 60) undoStack.current.shift();
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev) { setField(prev.field ?? field); setTokens(prev.tokens); setArrows(prev.arrows); setSelId(null); }
  };

  const toBoard = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const nextLabel = (kind) => {
    if (kind === "home" || kind === "away" || kind === "neutral") return String(tokens.filter((t) => t.kind === kind).length + 1);
    return "";
  };
  const addToken = (kind) => {
    snapshot();
    const y = kind === "away" ? 0.28 : kind === "home" ? 0.72 : kind === "goal" ? 0.08 : 0.5;
    const spread = tokens.filter((t) => t.kind === kind).length;
    const x = kind === "goal" ? 0.5 : clamp01(0.2 + (spread % 5) * 0.15);
    setTokens((ts) => [...ts, { id: rid(), kind, x, y, label: nextLabel(kind) }]);
  };

  const onTokenDown = (e, t) => {
    e.stopPropagation();
    if (mode !== "move") { setSelId(t.id); return; }
    e.preventDefault();
    dragId.current = t.id;
    moved.current = false;
    setSelId(t.id);
    svgRef.current.setPointerCapture?.(e.pointerId);
  };
  const onBoardDown = (e) => {
    if (mode === "draw") {
      const p = toBoard(e);
      drawFrom.current = p;
      setDraft({ from: p, to: p });
      svgRef.current.setPointerCapture?.(e.pointerId);
    } else if (e.target === svgRef.current || e.target.dataset?.pitch) {
      setSelId(null);
    }
  };
  const onMove = (e) => {
    if (dragId.current) {
      if (!moved.current) { moved.current = true; snapshot(); }
      const p = toBoard(e);
      setTokens((ts) => ts.map((t) => (t.id === dragId.current ? { ...t, x: p.x, y: p.y } : t)));
    } else if (drawFrom.current) {
      setDraft({ from: drawFrom.current, to: toBoard(e) });
    }
  };
  const onUp = () => {
    dragId.current = null;
    moved.current = false;
    if (drawFrom.current && draft) {
      const dx = draft.to.x - draft.from.x, dy = draft.to.y - draft.from.y;
      if (Math.hypot(dx, dy) > 0.03) {
        snapshot();
        setArrows((as) => [...as, { id: rid(), ...draft, kind: drawKind }]);
      }
    }
    drawFrom.current = null;
    setDraft(null);
  };

  const removeSelected = () => {
    if (!selId) return;
    snapshot();
    setTokens((ts) => ts.filter((t) => t.id !== selId));
    setArrows((as) => as.filter((a) => a.id !== selId));
    setSelId(null);
  };
  const setLabel = (id, label) => setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, label: label.slice(0, 3) } : t)));
  const clearBoard = () => { snapshot(); setTokens([]); setArrows([]); setSelId(null); };
  const changeField = (f) => { if (f !== field) { snapshot(); setField(f); } };

  // Rasterize the current board (minus editing chrome) to a PNG blob.
  const exportPng = () => new Promise((resolve, reject) => {
    const node = svgRef.current.cloneNode(true);
    node.setAttribute("width", W);
    node.setAttribute("height", H);
    node.querySelectorAll("[data-skip]").forEach((n) => n.remove());
    const xml = new XMLSerializer().serializeToString(node);
    const src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = W * scale; canvas.height = H * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("render failed"));
    img.src = src;
  });

  const save = async () => {
    setBusy(true);
    setSelId(null);
    try {
      const blob = await exportPng();
      await onSave?.(blob, { field, tokens, arrows });
    } catch {
      await onSave?.(null, { field, tokens, arrows });
    } finally {
      setBusy(false);
    }
  };

  const arrowPx = (a) => ({ x1: a.from.x * W, y1: a.from.y * H, x2: a.to.x * W, y2: a.to.y * H });
  const strokeFor = (kind) => (kind === "line" ? LINE : ARROW);
  const sel = tokens.find((t) => t.id === selId) || null;
  const TOKEN_BTNS = [
    ["home", "Home", TEAM.home], ["away", "Away", TEAM.away], ["neutral", "Neutral", TEAM.neutral],
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-brand-primary w-full sm:max-w-lg sm:rounded-3xl overflow-hidden flex flex-col max-h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white text-sm font-bold flex-shrink-0">Board</span>
            <select value={field} onChange={(e) => changeField(e.target.value)} aria-label="Field type" className="text-[11px] font-semibold bg-white/10 text-white rounded px-1.5 py-1 outline-none cursor-pointer">
              {FIELDS.map(([id, lbl]) => <option key={id} value={id} className="text-ink">{lbl}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} disabled={busy} title="Undo" className="w-9 h-9 rounded-full flex items-center justify-center text-white bg-white/10 hover:bg-white/20 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
            <button onClick={save} disabled={busy} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-brand-accent text-[var(--th-primary-deep)]"><Save className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save"}</button>
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-white bg-white/10 hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* board */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-sm rounded-xl shadow-2xl touch-none"
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerDown={onBoardDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          >
            <defs>
              <marker id="tb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={ARROW} />
              </marker>
            </defs>
            <g data-pitch="1"><Field field={field} /></g>

            {/* committed runs (arrow), passes (dashed + order number), dribbles (wavy), lines (white) */}
            {(() => {
              let passSeq = 0;
              return arrows.map((a) => {
                const p = arrowPx(a);
                const onDown = (e) => { e.stopPropagation(); if (mode === "move") setSelId(a.id); };
                const cursor = { cursor: mode === "move" ? "pointer" : "crosshair" };
                const passNo = a.kind === "pass" ? ++passSeq : null;
                const mid = { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
                return (
                  <g key={a.id}>
                    {a.kind === "dribble" ? (
                      <path d={wavyPath(p.x1, p.y1, p.x2, p.y2)} fill="none" stroke={ARROW} strokeWidth={3.5} strokeLinecap="round" markerEnd="url(#tb-arrow)" onPointerDown={onDown} style={cursor} />
                    ) : (
                      <line {...p} stroke={strokeFor(a.kind)} strokeWidth={4} strokeLinecap="round" strokeDasharray={a.kind === "pass" ? "2 12" : undefined} markerEnd={a.kind === "line" ? undefined : "url(#tb-arrow)"} onPointerDown={onDown} style={cursor} />
                    )}
                    {passNo != null && (
                      <g style={{ pointerEvents: "none" }}>
                        <circle cx={mid.x} cy={mid.y} r={12} fill="#111827" stroke="#fff" strokeWidth={1.5} />
                        <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize={13} fontWeight="700" fill="#fff">{passNo}</text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}
            {draft && (drawKind === "dribble"
              ? <path data-skip d={wavyPath(draft.from.x * W, draft.from.y * H, draft.to.x * W, draft.to.y * H)} fill="none" stroke={ARROW} strokeWidth={4} strokeLinecap="round" markerEnd="url(#tb-arrow)" />
              : <line data-skip x1={draft.from.x * W} y1={draft.from.y * H} x2={draft.to.x * W} y2={draft.to.y * H} stroke={strokeFor(drawKind)} strokeWidth={4} strokeLinecap="round" strokeDasharray={drawKind === "pass" ? "2 12" : undefined} markerEnd={drawKind === "line" ? undefined : "url(#tb-arrow)"} />)}

            {/* tokens */}
            {tokens.map((tok) => {
              const x = tok.x * W, y = tok.y * H;
              const selected = tok.id === selId;
              const halo = selected ? <circle data-skip cx={x} cy={y} r={R + 5} fill="none" stroke={t("accent")} strokeWidth={3} strokeDasharray="3 3" /> : null;
              if (tok.kind === "ball") {
                return (
                  <g key={tok.id} onPointerDown={(e) => onTokenDown(e, tok)} style={{ cursor: "grab" }}>
                    {selected && <circle data-skip cx={x} cy={y} r={R * 0.9} fill="none" stroke={t("accent")} strokeWidth={3} strokeDasharray="3 3" />}
                    <circle cx={x} cy={y} r={R * 0.62} fill="#fff" stroke="#111" strokeWidth={2} />
                    <circle cx={x} cy={y} r={R * 0.24} fill="#111" />
                  </g>
                );
              }
              if (tok.kind === "cone") {
                return (
                  <g key={tok.id} onPointerDown={(e) => onTokenDown(e, tok)} style={{ cursor: "grab" }}>
                    {halo}
                    <polygon points={`${x},${y - R * 0.9} ${x - R * 0.7},${y + R * 0.7} ${x + R * 0.7},${y + R * 0.7}`} fill="#F97316" stroke="#7C2D12" strokeWidth={2} />
                  </g>
                );
              }
              if (tok.kind === "goal") {
                return (
                  <g key={tok.id} onPointerDown={(e) => onTokenDown(e, tok)} style={{ cursor: "grab" }}>
                    {selected && <rect data-skip x={x - 48} y={y - 22} width={96} height={44} rx={4} fill="none" stroke={t("accent")} strokeWidth={3} strokeDasharray="3 3" />}
                    <Goal x={x} y={y} />
                  </g>
                );
              }
              // home / away / neutral disc
              return (
                <g key={tok.id} onPointerDown={(e) => onTokenDown(e, tok)} style={{ cursor: "grab" }}>
                  {halo}
                  <circle cx={x} cy={y} r={R} fill={TEAM[tok.kind] || "#64748B"} stroke="rgba(0,0,0,0.4)" strokeWidth={2} />
                  {tok.label ? <text x={x} y={y + R * 0.34} textAnchor="middle" fontSize={R * 0.85} fontWeight="700" fill="#fff" style={{ pointerEvents: "none" }}>{tok.label}</text> : null}
                </g>
              );
            })}
          </svg>
        </div>

        {/* selection bar */}
        {sel && (sel.kind === "home" || sel.kind === "away" || sel.kind === "neutral") && (
          <div className="px-3 py-2 bg-brand-deep border-t border-white/10 flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/40">Number</span>
            <input value={sel.label} onChange={(e) => setLabel(sel.id, e.target.value)} maxLength={3} className="w-16 bg-white/10 text-white text-xs font-bold text-center rounded px-2 py-1.5 border border-white/15 outline-none" />
            <button onClick={removeSelected} className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-[var(--th-danger)] text-white"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        )}
        {sel && !(sel.kind === "home" || sel.kind === "away" || sel.kind === "neutral") && (
          <div className="px-3 py-2 bg-brand-deep border-t border-white/10 flex items-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-white/40">Selected</span>
            <button onClick={removeSelected} className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full bg-[var(--th-danger)] text-white"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        )}

        {/* toolbar */}
        <div className="bg-brand-deep border-t border-white/10 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {TOKEN_BTNS.map(([kind, lbl, color]) => (
              <button key={kind} onClick={() => addToken(kind)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20"><span className="w-3 h-3 rounded-full" style={{ background: color }} /> {lbl}</button>
            ))}
            <button onClick={() => addToken("ball")} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20"><span className="w-3 h-3 rounded-full bg-white border border-black" /> Ball</button>
            <button onClick={() => addToken("cone")} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20"><span className="w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: "9px solid #F97316" }} /> Cone</button>
            <button onClick={() => addToken("goal")} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20"><span className="w-3.5 h-2 border-2 border-white rounded-sm" /> Goal</button>
            <button onClick={clearBoard} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white/10 text-white hover:bg-white/20"><RotateCcw className="w-3.5 h-3.5" /> Clear</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-white/5 rounded-full p-1">
              <button onClick={() => setMode("move")} aria-pressed={mode === "move"} className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${mode === "move" ? "text-white" : "text-white/50"}`} style={mode === "move" ? { backgroundColor: t("primary") } : {}}><MousePointer2 className="w-3.5 h-3.5" /> Move</button>
              <button onClick={() => setMode("draw")} aria-pressed={mode === "draw"} className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${mode === "draw" ? "text-white" : "text-white/50"}`} style={mode === "draw" ? { backgroundColor: t("primary") } : {}}><Spline className="w-3.5 h-3.5" /> Draw</button>
            </div>
            {mode === "draw" && (
              <div className="flex items-center gap-1">
                {[["run", "Run"], ["pass", "Pass"], ["dribble", "Dribble"], ["line", "Line"]].map(([k, lbl]) => (
                  <button key={k} onClick={() => setDrawKind(k)} aria-pressed={drawKind === k} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border ${drawKind === k ? "text-white border-brand-accent" : "text-white/60 border-white/15 bg-white/5"}`} style={drawKind === k ? { backgroundColor: `${t("accent")}40` } : {}}>{lbl}</button>
                ))}
              </div>
            )}
            <span className="text-[11px] text-white/40 font-medium ml-auto">{mode === "draw" ? (drawKind === "line" ? "Drag to draw a white field line" : drawKind === "dribble" ? "Drag to draw a dribble" : drawKind === "pass" ? "Drag to draw a pass (auto-numbered)" : "Drag to draw a run") : "Drag players, ball, cones & goals"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
