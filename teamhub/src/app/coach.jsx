// Split out of TeamHubRoles.jsx (F81). Area: coach.
// Every top-level declaration here is exported for the other app modules.
import { useMemo, useRef, useState } from "react";
import { BarChart3, Bell, Calendar as CalendarIcon, ChevronLeft, ClipboardList, Copy, FileText, Goal, Hash, Link as LinkIcon, Megaphone, Pencil, Pin, Plus, Send, Trash2, Users, X } from "lucide-react";
import { storage } from "../firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { isLoading } from "../hooks/useCollection";
import { toast } from "../lib/toast";
import { teamDateKey } from "../lib/dates";
import { TEAMS, getTeam } from "../data/teams";
import { POSITIONS, groupByPosition } from "../data/rosterPositions";
import GameStatsPage from "../components/GameStats";
import { CalendarPage } from "./calendar";
import { DocumentsSection } from "./documents";
import { LoadingNote } from "./home";
import { PracticePage } from "./practice";
import { initialsOf } from "./settings";
import { AutoGrowTextarea, Avatar, COLORS, EMPTY_OBJ, downscaleToBlob, formatAgo, isStaffRole, reportError, staffLabel, uploadStamp } from "./shared";


/* ─── GAME DAY: starting line-ups ─────────────────────────────────────────
   A coach drops players onto a soccer pitch (each token = the player's photo
   with their name under it), names the "field", saves it, and can send it to
   any group chat as an image. Formations seed the slot positions; slots are
   draggable and tap-to-assign. Positions are normalized 0..1 so the pitch
   scales to any size and rasterizes cleanly for the chat card.
   ──────────────────────────────────────────────────────────────────────── */
export const lid = () => Math.random().toString(36).slice(2, 9);
export const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Formation → outfield rows (defense → attack); the goalkeeper is implied.
export const FORMATIONS = {
  "4-4-2": [4, 4, 2],
  "4-3-3": [4, 3, 3],
  "4-2-3-1": [4, 2, 3, 1],
  "3-5-2": [3, 5, 2],
  "3-4-3": [3, 4, 3],
  "5-3-2": [5, 3, 2],
  "4-5-1": [4, 5, 1],
};

// Build empty slots at their formation positions. GK near the bottom, forwards
// near the top; each row spread evenly across the width.
// Formations with a hand-set shape instead of even rows. 4-3-3 is the
// coach's layout: back four, one holding midfielder in the middle, two
// midfielders ahead of him, three forwards (x/y are 0..1 of the pitch).
export const FORMATION_LAYOUTS = {
  "4-3-3": [
    [0.2, 0.745], [0.4, 0.745], [0.6, 0.745], [0.8, 0.745],
    [0.5, 0.45],
    [0.34, 0.32], [0.66, 0.32],
    [0.25, 0.155], [0.5, 0.155], [0.75, 0.155],
  ],
};

export const slotsForFormation = (rows) => {
  const out = [{ id: lid(), x: 0.5, y: 0.92, label: "GK", uid: "", name: "", initials: "", photoURL: "" }];
  const layout = Object.entries(FORMATIONS).find(([, r]) => r === rows)?.[0];
  if (layout && FORMATION_LAYOUTS[layout]) {
    FORMATION_LAYOUTS[layout].forEach(([x, y]) => out.push({ id: lid(), x, y, label: "", uid: "", name: "", initials: "", photoURL: "" }));
    return out;
  }
  const n = rows.length;
  rows.forEach((count, i) => {
    const y = n === 1 ? 0.45 : 0.76 - (i * (0.76 - 0.17)) / (n - 1);
    for (let k = 0; k < count; k++) {
      out.push({ id: lid(), x: (k + 1) / (count + 1), y, label: "", uid: "", name: "", initials: "", photoURL: "" });
    }
  });
  return out;
};

// First name + last initial, e.g. "Maya P." — compact but recognizable.
export const shortName = (name = "") => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  if (p.length === 1) return p[0];
  return `${p[0]} ${p[p.length - 1][0]}.`;
};

// SVG pitch markings (white lines), portrait, drawn over a green field.
export const PitchLines = () => {
  const L = { fill: "none", stroke: "rgba(255,255,255,0.8)", strokeWidth: 0.5 };
  return (
    <svg viewBox="0 0 68 105" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
      <rect x="2" y="2" width="64" height="101" {...L} />
      <line x1="2" y1="53.5" x2="66" y2="53.5" {...L} />
      <circle cx="34" cy="53.5" r="9.15" {...L} />
      <circle cx="34" cy="53.5" r="0.6" fill="rgba(255,255,255,0.8)" />
      {/* top box (attacking goal) */}
      <rect x="13.85" y="2" width="40.3" height="16.5" {...L} />
      <rect x="24.85" y="2" width="18.3" height="5.5" {...L} />
      <path d="M 26.7 18.5 A 9.15 9.15 0 0 0 41.3 18.5" {...L} />
      {/* bottom box (own goal) */}
      <rect x="13.85" y="86.5" width="40.3" height="16.5" {...L} />
      <rect x="24.85" y="97.5" width="18.3" height="5.5" {...L} />
      <path d="M 26.7 86.5 A 9.15 9.15 0 0 1 41.3 86.5" {...L} />
    </svg>
  );
};

// Rasterize a line-up to a JPEG blob for the chat card. Photos are drawn with
// crossOrigin; if the Storage bucket doesn't allow canvas reads (CORS), we fall
// back to initials so the send always succeeds.
export const CARD_W = 800, CARD_H = 1120;
export const loadCorsImage = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
export const canvasReadable = (img) => {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    cx.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
};
export const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
// Default line-up watermark: the Brophy logo (the same one that watermarks
// drill diagrams), in white so it reads on the green pitch. A coach can
// upload their own logo to replace it.
export const BRAND_WATERMARK = "/brand/logo-white.png";
export const BRAND_WATERMARK_ALPHA = 0.35;

export const renderLineupBlob = async (title, formation, slots, logoUrl, teamShortName = "") => {
  const [imgs, logoImg] = await Promise.all([
    Promise.all(slots.map((s) => loadCorsImage(s.photoURL))),
    loadCorsImage(logoUrl),
  ]);
  const firstImg = imgs.find(Boolean);
  // Probe each source independently — taint is per-origin, so a same-origin
  // brand logo can be safe even when Storage-hosted photos are not.
  const usePhotos = firstImg ? canvasReadable(firstImg) : false;
  const useLogo = logoImg ? canvasReadable(logoImg) : false;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  const top = 120; // banner height
  // banner
  ctx.fillStyle = "#980000";
  ctx.fillRect(0, 0, CARD_W, top);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText((title || "Starting XI").slice(0, 30), CARD_W / 2, 52);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(formation ? `Formation · ${formation}` : "Starting XI", CARD_W / 2, 92);
  // pitch
  const pTop = top, pH = CARD_H - top;
  const grad = ctx.createLinearGradient(0, pTop, 0, CARD_H);
  grad.addColorStop(0, "#2E7D46"); grad.addColorStop(1, "#276b3c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, pTop, CARD_W, pH);
  // mow stripes
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 10; i += 2) ctx.fillRect(0, pTop + (pH / 10) * i, CARD_W, pH / 10);
  // lines
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3;
  const px = (nx) => 8 + nx * (CARD_W - 16);
  const py = (ny) => pTop + 6 + ny * (pH - 12);
  ctx.strokeRect(px(0), py(0), px(1) - px(0), py(1) - py(0));
  ctx.beginPath(); ctx.moveTo(px(0), (pTop + CARD_H) / 2); ctx.lineTo(px(1), (pTop + CARD_H) / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(CARD_W / 2, (pTop + CARD_H) / 2, 70, 0, Math.PI * 2); ctx.stroke();
  // watermark — the coach's uploaded logo centered on the pitch at 60%
  // opacity, behind the player tokens so faces stay legible. With no
  // uploaded logo, the ACTIVE team's name is the watermark instead
  // (the Brophy logo watermarks drill diagrams; the name comes from
  // the teams config).
  if (useLogo && logoImg && logoImg.width) {
    ctx.save();
    ctx.globalAlpha = logoUrl === BRAND_WATERMARK ? BRAND_WATERMARK_ALPHA : 0.6;
    const lw = CARD_W * (logoUrl === BRAND_WATERMARK ? 0.7 : 0.5);
    const scale = lw / logoImg.width;
    const lh = logoImg.height * scale;
    ctx.drawImage(logoImg, (CARD_W - lw) / 2, pTop + (pH - lh) / 2, lw, lh);
    ctx.restore();
  } else if (teamShortName) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 100px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(teamShortName, CARD_W / 2, pTop + pH / 2);
    ctx.restore();
  }
  // tokens
  const R = 44;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const cx = px(s.x), cy = py(s.y);
    ctx.save();
    if (usePhotos && imgs[i]) {
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const im = imgs[i];
      const scale = Math.max((2 * R) / im.width, (2 * R) / im.height);
      const dw = im.width * scale, dh = im.height * scale;
      ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = s.uid || s.name ? "#980000" : "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(s.initials || s.label || "", cx, cy);
      ctx.restore();
    }
    // ring
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // name pill
    const label = s.name ? shortName(s.name) : (s.label || "");
    if (label) {
      ctx.font = "bold 24px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      const pw = tw + 22, ph = 34, ly = cy + R + 8;
      ctx.fillStyle = "rgba(10,20,45,0.82)";
      roundRect(ctx, cx - pw / 2, ly, pw, ph, 10); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, cx, ly + ph / 2 + 1);
    }
  }
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
};

// Bottom-sheet channel picker → renders the card and posts it.
export const SendLineupSheet = ({ title, formation, slots, logoUrl, teamShortName = "", chatGroups = [], postLineupImage, onClose }) => {
  const [busy, setBusy] = useState("");
  const channels = [{ id: "team", name: "Team" }, ...chatGroups.map((c) => ({ id: c.id, name: c.name }))];
  const send = async (ch) => {
    setBusy(ch.id);
    try {
      const blob = await renderLineupBlob(title, formation, slots, logoUrl, teamShortName);
      if (!blob) throw new Error("couldn't render the card");
      await postLineupImage(blob, ch.id, title);
      toast(`Sent to ${ch.name}.`);
      onClose();
    } catch (e) {
      toast("Couldn't send — " + (e.message || "check rules."));
      setBusy("");
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900">Send line-up to…</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          {channels.map((ch) => (
            <button key={ch.id} onClick={() => send(ch)} disabled={!!busy} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-white disabled:opacity-60">
              <span className="flex items-center gap-2 font-semibold text-sm text-slate-800"><Hash className="w-4 h-4 text-slate-400" />{ch.name}</span>
              {busy === ch.id ? <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" style={{ color: COLORS.primary }} />}
            </button>
          ))}
          <p className="text-[10px] text-slate-400 leading-relaxed px-1 pt-1">The line-up is posted as an image. Player faces show if photos are set; otherwise their initials appear.</p>
        </div>
      </div>
    </div>
  );
};

// Player picker sheet — assign a roster player to the active slot, and (coach)
// upload a photo for any player who has an account.
// Players set their own face photo (Settings / Home); coaches can't change
// it (decision 2026-11-21 — these are minors).
export const PlayerPickerSheet = ({ roster, activeTeamId, positionsByUid = EMPTY_OBJ, usedUids, onPick, onClear, onClose }) => {
  const [q, setQ] = useState("");
  // Players only, grouped like the roster (GK / DEF / MID / FWD), names
  // resolved from the coach's sheet when an account has only an email.
  const { groups } = useMemo(() => groupByPosition(roster, activeTeamId, positionsByUid), [roster, activeTeamId, positionsByUid]);
  const needle = q.trim().toLowerCase();
  const hit = (p) => !needle || `${p.name} ${p.email}`.toLowerCase().includes(needle);
  const sections = [...POSITIONS, { id: "NONE", label: "No position yet" }]
    .map((pos) => ({ ...pos, list: groups[pos.id].filter(hit) }))
    .filter((sec) => sec.list.length);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-base text-slate-900">Pick a player</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          <button onClick={onClear} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-red-500 bg-red-50">Clear this position</button>
          {sections.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No players found.</p>}
          {sections.map((sec) => (
            <div key={sec.id}>
              <div className="sticky top-[57px] z-[5] bg-slate-100 rounded-lg px-3 py-1.5 mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {sec.label} <span className="text-slate-400">{sec.list.length}</span>
              </div>
              {sec.list.map((p) => (
                <div key={p.id} className={`flex items-center gap-3 px-2 py-2 rounded-xl ${p.uid && usedUids.has(p.uid) ? "opacity-40" : ""}`}>
                  <button onClick={() => onPick(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Avatar photoURL={p.photoURL} initials={p.initials} size={38} bg={COLORS.primary} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
                      {!p.uid && <div className="text-[10px] font-semibold text-slate-400">Not in the app yet</div>}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const GameDayPage = ({ user, lineups = [], addLineup, updateLineup, deleteLineup, allUsers = [], invites = [], chatGroups = [], postLineupImage, lineupLogo = "", setLineupLogo, teamShortName = "", activeTeamId, positionsByUid = EMPTY_OBJ }) => {
  const [draft, setDraft] = useState(null); // null = list view; object = editor
  const [activeSlot, setActiveSlot] = useState(null); // slot id being assigned
  const [sending, setSending] = useState(null); // lineup being sent to chat
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);
  const fieldRef = useRef(null);
  const dragRef = useRef({ id: null, moved: false, sx: 0, sy: 0 });

  // The watermark shown on every line-up — the coach's uploaded logo, or
  // the Brophy logo until they set one.
  const logoUrl = lineupLogo || BRAND_WATERMARK;
  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      // PNG keeps the logo's transparency on the line-up card (JPEG would
      // paint a black box behind it).
      const blob = await downscaleToBlob(file, 512, 0.9, "image/png");
      const path = `branding/${user.uid}/lineup-logo-${uploadStamp()}.png`;
      const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/png" });
      const url = await getDownloadURL(snap.ref);
      await setLineupLogo(url, path);
      toast("Line-up logo updated.");
    } catch (e) { toast("Couldn't upload logo — " + (e.message || "check Storage rules.")); }
    finally { setLogoBusy(false); }
  };

  // Combined roster: signed-in users (with photos) first, then any invited
  // emails that never created an account.
  const roster = useMemo(() => {
    const rows = [];
    const seen = new Set();
    (allUsers || []).forEach((u) => {
      const em = (u.email || "").toLowerCase();
      seen.add(em);
      if ((u.role || "player") !== "player") return; // players only — no coaches
      rows.push({ id: u.id, uid: u.id, name: u.name || u.email || "Player", initials: u.initials || initialsOf(u.name || u.email || ""), photoURL: u.photoURL || "", email: u.email || "", role: "player" });
    });
    (invites || []).forEach((inv) => {
      const em = (inv.email || "").toLowerCase();
      if (em && !seen.has(em) && (inv.role || "player") === "player") rows.push({ id: em, uid: "", name: inv.email, initials: initialsOf(inv.email), photoURL: "", email: inv.email, role: "player" });
    });
    return rows;
  }, [allUsers, invites]);

  const newLineup = () => setDraft({ id: null, name: "", formation: "4-3-3", slots: slotsForFormation(FORMATIONS["4-3-3"]) });
  const editLineup = (l) => setDraft({ id: l.id, name: l.name || "", formation: l.formation || "", slots: (l.slots || []).map((s) => ({ ...s, id: s.id || lid() })) });
  const changeFormation = (f) => {
    const placed = (draft?.slots || []).filter((s) => s.uid || s.email || s.name).length;
    if (placed && !confirm(`Switch to ${f}? The ${placed} player${placed === 1 ? "" : "s"} you placed will be cleared.`)) return;
    setDraft((d) => ({ ...d, formation: f, slots: slotsForFormation(FORMATIONS[f]) }));
  };

  const assignPlayer = (player) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) => {
        if (s.id === activeSlot) return { ...s, uid: player.uid, name: player.name, initials: player.initials, photoURL: player.photoURL || "" };
        if (player.uid && s.uid === player.uid) return { ...s, uid: "", name: "", initials: "", photoURL: "" };
        return s;
      }),
    }));
    setActiveSlot(null);
  };
  const clearSlot = () => {
    setDraft((d) => ({ ...d, slots: d.slots.map((s) => (s.id === activeSlot ? { ...s, uid: "", name: "", initials: "", photoURL: "" } : s)) }));
    setActiveSlot(null);
  };

  // Drag tokens; a tap (no drag) opens the picker.
  const onDown = (e, slot) => { e.stopPropagation(); dragRef.current = { id: slot.id, moved: false, sx: e.clientX, sy: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d.id || !fieldRef.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    const rect = fieldRef.current.getBoundingClientRect();
    const x = clampN((e.clientX - rect.left) / rect.width, 0.05, 0.95);
    const y = clampN((e.clientY - rect.top) / rect.height, 0.04, 0.96);
    setDraft((dr) => ({ ...dr, slots: dr.slots.map((s) => (s.id === d.id ? { ...s, x, y } : s)) }));
  };
  const onUp = (e, slot) => { const d = dragRef.current; e.currentTarget.releasePointerCapture?.(e.pointerId); dragRef.current = { id: null, moved: false, sx: 0, sy: 0 }; if (!d.moved) setActiveSlot(slot.id); };

  const save = async () => {
    const name = (draft.name || "").trim() || `${draft.formation} line-up`;
    try {
      const payload = { name, formation: draft.formation, slots: draft.slots };
      if (draft.id) await updateLineup(draft.id, payload); else await addLineup(payload);
      toast("Line-up saved.");
      setDraft(null);
    } catch (e) { toast("Couldn't save — " + (e.message || "check rules.")); }
  };

  // ── List view ──
  if (!draft) {
    return (
      <div className="pt-4 pb-6 px-5 space-y-4">
        <button onClick={newLineup} className="w-full rounded-2xl p-4 flex items-center gap-3 text-white shadow-sm" style={{ backgroundColor: COLORS.primary }}>
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Plus className="w-5 h-5" /></div>
          <div className="text-left"><div className="font-bold">New line-up</div><div className="text-xs text-white/70">Build a starting XI on the field</div></div>
        </button>
        {/* Watermark — the coach's uploaded logo, or the active team's name
            until they set one. Centered on every line-up at 60%. */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ backgroundColor: COLORS.bg }}>
            {logoUrl
              ? <img src={lineupLogo || "/brand/logo.png"} alt="" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              : <span className="text-[11px] font-black px-1 text-center leading-tight" style={{ color: COLORS.primary }}>{teamShortName || "Team"}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">Line-up watermark</div>
            <div className="text-[11px] text-slate-500 leading-snug">{lineupLogo ? "Your logo, centered on every line-up." : "Using the Brophy logo. Upload your own to replace it."}</div>
            {lineupLogo && (
              <button type="button" onClick={async () => { try { await setLineupLogo("", ""); toast("Back to the Brophy logo."); } catch (e) { toast("Couldn't change — " + (e?.message || "")); } }} className="text-[11px] font-semibold underline text-slate-500 mt-0.5">Use the Brophy logo</button>
            )}
          </div>
          <button onClick={() => logoInputRef.current?.click()} disabled={logoBusy} className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
            {logoBusy ? "…" : lineupLogo ? "Change" : "Upload"}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadLogo(f); }} />
        </div>
        {sending && <SendLineupSheet title={sending.name} formation={sending.formation} slots={sending.slots || []} logoUrl={logoUrl} teamShortName={teamShortName} chatGroups={chatGroups} postLineupImage={postLineupImage} onClose={() => setSending(null)} />}
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pt-1">Saved line-ups</h3>
        {isLoading(lineups) ? <LoadingNote /> : lineups.length === 0 ? (
          <div className="rounded-2xl p-6 border border-dashed border-slate-200 bg-white text-center">
            <Goal className="w-7 h-7 mx-auto mb-1.5" style={{ color: COLORS.accent }} />
            <p className="text-sm text-slate-500 font-medium">No line-ups yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Create one, then send it to any team chat.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lineups.map((l) => {
              const filled = (l.slots || []).filter((s) => s.uid || s.name).length;
              return (
                <div key={l.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5 flex items-center gap-3">
                  <div className="w-11 h-14 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#2E7D46" }}>
                    <span className="text-[10px] font-black text-white/90">{l.formation || "XI"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{l.name || "Untitled line-up"}</div>
                    <div className="text-[11px] text-slate-500">{filled}/11 players{l.formation ? ` · ${l.formation}` : ""}</div>
                  </div>
                  <button onClick={() => setSending(l)} aria-label="Send to chat" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.primary }}><Send className="w-4 h-4" /></button>
                  <button onClick={() => editLineup(l)} aria-label="Edit" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Pencil className="w-4 h-4 text-slate-500" /></button>
                  <button onClick={() => { if (window.confirm(`Delete "${l.name || "this line-up"}"?`)) Promise.resolve(deleteLineup(l.id)).catch(reportError("Couldn't delete the line-up")); }} aria-label="Delete" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Trash2 className="w-4 h-4 text-slate-400" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Editor ──
  const usedUids = new Set(draft.slots.filter((s) => s.uid).map((s) => s.uid));
  return (
    <div className="pt-3 pb-6 px-4 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setDraft(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Line-ups</button>
        <button onClick={save} className="text-[11px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>Save</button>
      </div>
      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name this line-up" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold" />
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {Object.keys(FORMATIONS).map((f) => (
          <button key={f} onClick={() => changeFormation(f)} className="text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0 border" style={draft.formation === f ? { backgroundColor: COLORS.primary, color: "white", borderColor: COLORS.primary } : { backgroundColor: "white", color: COLORS.textSecondary, borderColor: COLORS.border }}>{f}</button>
        ))}
      </div>
      <div ref={fieldRef} className="relative w-full rounded-2xl overflow-hidden shadow-inner select-none" style={{ aspectRatio: "68 / 105", background: "linear-gradient(180deg,#2E7D46,#276b3c)", touchAction: "none" }}>
        {/* mow stripes */}
        {[0, 2, 4, 6, 8].map((i) => (<div key={i} className="absolute left-0 right-0" style={{ top: `${i * 10}%`, height: "10%", backgroundColor: "rgba(255,255,255,0.04)" }} />))}
        <PitchLines />
        {/* watermark — uploaded logo, or the active team's name, at 60%,
            behind the tokens */}
        {logoUrl ? (
          <img src={logoUrl} alt="" aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none object-contain" style={lineupLogo ? { width: "50%", opacity: 0.6 } : { width: "70%", opacity: BRAND_WATERMARK_ALPHA }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center" style={{ width: "85%", opacity: 0.35 }}>
            <span className="font-black text-white text-center leading-none" style={{ fontSize: 56 }}>{teamShortName}</span>
          </div>
        )}
        {draft.slots.map((s) => (
          <div
            key={s.id}
            onPointerDown={(e) => onDown(e, s)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, s)}
            className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: "translate(-50%,-50%)", touchAction: "none" }}
          >
            <div className="rounded-full border-2 border-white shadow-md overflow-hidden flex items-center justify-center" style={{ width: 44, height: 44 }}>
              {s.photoURL
                ? <img src={s.photoURL} alt="" className="w-full h-full object-cover pointer-events-none" />
                : <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: s.uid || s.name ? COLORS.primary : "rgba(255,255,255,0.22)" }}>{s.initials || (s.uid || s.name ? "" : <Plus className="w-4 h-4" />) || s.label}</div>}
            </div>
            <span className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white leading-none max-w-[72px] truncate" style={{ backgroundColor: "rgba(10,20,45,0.8)" }}>{s.name ? shortName(s.name) : s.label || "Add"}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setSending({ name: (draft.name || "").trim() || `${draft.formation} line-up`, formation: draft.formation, slots: draft.slots })} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.accent, color: "#fff" }}>
          <Send className="w-3.5 h-3.5" /> Send to chat
        </button>
      </div>
      <p className="text-[10px] text-slate-400 text-center leading-relaxed">Tap a spot to assign a player · drag to reposition</p>
      {activeSlot && (
        <PlayerPickerSheet
          roster={roster}
          activeTeamId={activeTeamId}
          positionsByUid={positionsByUid}
          usedUids={usedUids}
          onPick={assignPlayer}
          onClear={clearSlot}
          onClose={() => setActiveSlot(null)}
        />
      )}
      {sending && <SendLineupSheet title={sending.name} formation={sending.formation} slots={sending.slots} logoUrl={logoUrl} teamShortName={teamShortName} chatGroups={chatGroups} postLineupImage={postLineupImage} onClose={() => setSending(null)} />}
    </div>
  );
};

// Roster & Invites — moved out of the coach Home tab into Coach Tools
// (§9 Option B, "The Toolbelt"). Same invite system as before: email
// invites (single + bulk), team-specific invite links, and the roster list
// with org-admin-only role badges.
// Players by position — players only (no coaches), in GK / DEF / MID / FWD
// columns like the coach's roster sheet. Starts from the sheet (matched by
// name, see data/rosterPositions.js); a coach taps a player to move them and
// that choice is saved for the team. Sheet names with no account yet are
// listed faded as "not in app yet".
export const PlayersByPosition = ({ allUsers = [], activeTeamId, byUid = {}, onSetPosition }) => {
  const players = useMemo(
    () => (allUsers || []).filter((u) => u.role === "player" && (u.teamIds || []).includes(activeTeamId)),
    [allUsers, activeTeamId],
  );
  const { groups, notJoined } = useMemo(() => groupByPosition(players, activeTeamId, byUid), [players, activeTeamId, byUid]);
  const [moving, setMoving] = useState(null); // player being moved
  const waiting = Object.values(notJoined).reduce((n, l) => n + l.length, 0);
  const move = async (pos) => {
    const p = moving;
    setMoving(null);
    try { await onSetPosition(p.id, pos); } catch (e) { toast("Couldn't save — " + (e?.message || "try again.")); }
  };
  const playerRow = (p) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onSetPosition && setMoving(p)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left active:bg-slate-100"
    >
      <Avatar photoURL={p.photoURL} initials={p.initials} size={26} />
      <span className="text-[13px] font-semibold text-slate-800 leading-tight break-words min-w-0">{p.name || p.email}</span>
    </button>
  );
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 text-center text-white font-bold" style={{ backgroundColor: COLORS.primary }}>
        Roster
        <div className="text-[11px] font-semibold text-white/80">
          {players.length} player{players.length === 1 ? "" : "s"} in the app{waiting ? ` · ${waiting} not signed up yet` : ""}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
        {POSITIONS.map((pos) => (
          <div key={pos.id} className="min-w-0 border-b border-slate-100 sm:border-b-0">
            <div className="px-2 py-2 bg-slate-100 text-center text-[12px] font-bold text-slate-700">
              {pos.label} <span className="text-slate-400 font-semibold">{groups[pos.id].length}</span>
            </div>
            <div className="p-1">
              {groups[pos.id].map(playerRow)}
              {(notJoined[pos.id] || []).map((n) => (
                <div key={n} className="flex items-center gap-2 px-2 py-1.5 opacity-50" title="Not in the app yet">
                  <div className="w-[26px] h-[26px] rounded-full border border-dashed border-slate-300 flex-shrink-0" />
                  <span className="text-[13px] text-slate-500 leading-tight min-w-0">{n}<span className="block text-[10px]">not in app yet</span></span>
                </div>
              ))}
              {!groups[pos.id].length && !(notJoined[pos.id] || []).length && (
                <p className="text-[11px] text-slate-400 text-center py-3">No one yet</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {groups.NONE.length > 0 && (
        <div className="border-t border-slate-100">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50">
            No position yet ({groups.NONE.length}) — tap to place
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 p-1">
            {groups.NONE.map(playerRow)}
          </div>
        </div>
      )}
      {onSetPosition && <p className="text-[10px] text-slate-400 text-center py-2">Tap a player to change their position. Coaches aren't listed.</p>}
      {moving && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setMoving(null)} role="dialog" aria-label="Change position">
          <div className="w-full max-w-sm bg-white rounded-2xl p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pb-1">
              <Avatar photoURL={moving.photoURL} initials={moving.initials} size={32} />
              <div className="font-bold text-slate-900">{moving.name || moving.email}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map((pos) => (
                <button key={pos.id} type="button" onClick={() => move(pos.id)}
                  className="py-3 rounded-xl text-sm font-bold border border-slate-200 text-slate-800 active:bg-slate-100">
                  {pos.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => move("NONE")} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500">No position</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const RosterInvitesPage = ({ user, isOrgAdmin = false, invites = [], addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks = [], addInviteLink, removeInviteLink, allUsers = [], removeUser, requestProfileUpdate, activeTeamId, positionsByUid = {}, setPlayerPosition }) => {
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email, u.name])), [allUsers]);
  // Teams this coach can invite/link to: the org admin sees all three, a
  // team coach sees only their own team(s).
  const myTeams = useMemo(() => {
    if (isOrgAdmin) return [...TEAMS];
    const mine = TEAMS.filter((t) => (user.teamIds || []).includes(t.id));
    return mine.length ? mine : [getTeam(activeTeamId)];
  }, [isOrgAdmin, user.teamIds, activeTeamId]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState(activeTeamId);
  const [inviteMsg, setInviteMsg] = useState("");
  // Invite-link generator state (team-specific links, see addInviteLink).
  const [linkTeamId, setLinkTeamId] = useState(activeTeamId);
  // Follow the team switcher: when the active team changes (JVB / JVA /
  // Varsity pills in the header), the invite and link dropdowns follow it.
  // useState only reads activeTeamId once at mount, so without this the
  // dropdowns stayed stuck on the team that was active when the page first
  // opened — the page looked like tapping the switcher did nothing.
  // Derived during render (not in an effect) to stay lint-clean; a manual
  // pick in either dropdown still sticks until the switcher is tapped again.
  const [prevActiveTeamId, setPrevActiveTeamId] = useState(activeTeamId);
  if (prevActiveTeamId !== activeTeamId) {
    setPrevActiveTeamId(activeTeamId);
    setInviteTeamId(activeTeamId);
    setLinkTeamId(activeTeamId);
  }
  const [linkExpiry, setLinkExpiry] = useState("");
  const [linkMaxUses, setLinkMaxUses] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  const [lastLink, setLastLink] = useState(null); // { code, url }
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const parseEmails = (text) => [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ),
  ];

  const submitInvite = async () => {
    setInviteMsg("");
    try {
      await addInvite(inviteEmail, inviteTeamId);
      setInviteMsg(`Added ${inviteEmail.trim().toLowerCase()} to ${getTeam(inviteTeamId).shortName}.`);
      setInviteEmail("");
    } catch (e) {
      setInviteMsg(e.message || "Couldn't add — check rules.");
    }
  };

  const submitBulk = async () => {
    setInviteMsg("");
    const emails = parseEmails(bulkText);
    if (!emails.length) {
      setInviteMsg("No valid emails found — paste one per line or comma-separated.");
      return;
    }
    try {
      await addInvitesBatch(emails, inviteTeamId);
      setInviteMsg(`Added ${emails.length} email${emails.length === 1 ? "" : "s"} to ${getTeam(inviteTeamId).shortName}.`);
      setBulkText("");
      setBulkOpen(false);
    } catch (e) {
      setInviteMsg("Couldn't import — " + (e.message || "check rules."));
    }
  };

  // Generate a team-specific invite link. Expiry is a calendar date (the
  // link stays live through the end of that day); max uses is optional.
  const submitInviteLink = async () => {
    setLinkMsg("");
    setLinkBusy(true);
    try {
      const maxUses = linkMaxUses.trim() ? Math.max(1, parseInt(linkMaxUses, 10) || 0) : null;
      const expiresAt = linkExpiry ? new Date(`${linkExpiry}T23:59:59`) : null;
      const code = await addInviteLink(linkTeamId, { expiresAt, maxUses });
      const url = `${window.location.origin}/?invite=${code}`;
      setLastLink({ code, url });
      setLinkExpiry("");
      setLinkMaxUses("");
      setLinkMsg(`Link created for ${getTeam(linkTeamId).shortName}.`);
    } catch (e) {
      setLinkMsg(e.message || "Couldn't create the link — check rules.");
    } finally {
      setLinkBusy(false);
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkMsg("Copied — share it with the player.");
    } catch {
      setLinkMsg("Copy didn't work — long-press the link to copy it manually.");
    }
  };

  // Invite-link status + expiry label, precomputed per link. Done here (not
  // in the JSX) because the Timestamp's .toDate() is an impure call the
  // compiler flags during render — expiry comes from the .seconds field.
  const sortedLinks = useMemo(() => {
    const nowMs = new Date().getTime();
    return [...(inviteLinks || [])]
      .map((l) => {
        const uses = l.uses || 0;
        let expMs = l.expiresAt == null
          ? null
          : typeof l.expiresAt.seconds === "number"
            ? l.expiresAt.seconds * 1000
            : new Date(l.expiresAt).getTime();
        if (expMs != null && Number.isNaN(expMs)) expMs = null;
        const status = (l.maxUses != null && uses >= l.maxUses)
          ? "Used up"
          : (expMs != null && expMs <= nowMs) ? "Expired" : "Active";
        const expiryLabel = expMs == null
          ? "Never"
          : new Date(expMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return { ...l, _status: status, _expiryLabel: expiryLabel };
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [inviteLinks]);

  // Pending invites = roster emails nobody has signed in with yet.
  const signedEmails = useMemo(() => new Set((allUsers || []).map((u) => (u.email || "").toLowerCase())), [allUsers]);
  const pendingCount = (invites || []).filter((inv) => inv.email && !signedEmails.has(inv.email.toLowerCase())).length;

  // Players who joined through an invite link never get an invitedEmails
  // entry, so they never showed in this list even though they are on the
  // team. They are the signed-in team members (allUsers is already scoped
  // to this team) with no matching invite email.
  const invitedEmailsSet = useMemo(() => new Set((invites || []).map((inv) => (inv.email || "").toLowerCase())), [invites]);
  const linkJoiners = useMemo(() => (allUsers || []).filter((u) => (u.email || u.name) && !invitedEmailsSet.has((u.email || "").toLowerCase())), [allUsers, invitedEmailsSet]);
  const rosterTotal = (invites?.length || 0) + linkJoiners.length;

  return (
    <div className="pt-4 pb-6 px-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">Roster &amp; Invites</h3>
        <p className="text-xs text-slate-500 mt-0.5">{getTeam(activeTeamId).name} · {rosterTotal} on the roster{pendingCount > 0 ? ` · ${pendingCount} invite${pendingCount === 1 ? "" : "s"} still pending` : ""}</p>
      </div>
      {requestProfileUpdate && (
        <button onClick={async () => { try { await requestProfileUpdate(); toast("Sent — everyone will be asked to add their name."); } catch (e) { toast("Couldn't send — " + (e.message || "")); } }} className="w-full py-2 rounded-full text-[11px] font-bold uppercase tracking-wider border border-slate-200 bg-white text-slate-700 flex items-center justify-center gap-1.5">
          <Bell className="w-3.5 h-3.5" /> Ask everyone to update their info
        </button>
      )}
      <PlayersByPosition allUsers={allUsers} activeTeamId={activeTeamId} byUid={positionsByUid} onSetPosition={setPlayerPosition} />
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
        {myTeams.length > 1 && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">Invite to team</span>
            <select
              value={inviteTeamId}
              onChange={(e) => setInviteTeamId(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {!bulkOpen ? (
          <>
            <input
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteMsg(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitInvite()}
              type="email"
              placeholder="player@example.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="flex gap-2">
              <button onClick={submitInvite} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
              <button onClick={() => { setBulkOpen(true); setInviteMsg(""); }} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider border border-slate-200 text-slate-700 bg-white">
                Paste many
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={bulkText}
              onChange={(e) => { setBulkText(e.target.value); setInviteMsg(""); }}
              rows={6}
              placeholder={"Paste emails — one per line, or comma-separated.\n\nalex@example.com\nmaya@example.com\ndevin@example.com"}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="flex gap-2">
              <button onClick={() => { setBulkOpen(false); setBulkText(""); setInviteMsg(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={submitBulk} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>
                Add all
              </button>
            </div>
          </>
        )}
        {inviteMsg && (
          <p className="text-[10px] font-semibold px-1" style={{ color: inviteMsg.startsWith("Added") ? COLORS.success : "#dc2626" }}>{inviteMsg}</p>
        )}
        <p className="text-[10px] text-slate-400 leading-relaxed px-1">
          Players need their email on the roster before they can sign in. Then share the app URL — they pick "Email me a sign-in link" or "Continue with Google" and they're in.
        </p>
      </div>

      {/* Invite links — share a link instead of adding emails. Anyone who
          signs up with it joins THAT team (useAuth redeems ?invite=CODE
          at first sign-in). Optional expiry date + max uses. */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
          <h4 className="text-xs font-bold text-slate-900">Invite links</h4>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed px-1">
          Share a link instead of adding emails — anyone who signs up with it joins that team.
        </p>
        {myTeams.length > 1 && (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">Link for team</span>
            <select
              value={linkTeamId}
              onChange={(e) => setLinkTeamId(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">Expires (optional)</span>
            <input
              type="date"
              value={linkExpiry}
              onChange={(e) => setLinkExpiry(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="w-24 flex-shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">Max uses</span>
            <input
              type="number"
              min="1"
              value={linkMaxUses}
              onChange={(e) => setLinkMaxUses(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="∞"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </div>
        <button onClick={submitInviteLink} disabled={linkBusy} className="w-full py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
          <LinkIcon className="w-3.5 h-3.5" /> {linkBusy ? "Creating…" : "Create link"}
        </button>
        {lastLink && (
          <div className="flex gap-2 items-center">
            <input readOnly value={lastLink.url} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-700 bg-slate-50 focus:outline-none" />
            <button onClick={() => copyLink(lastLink.url)} className="py-2 px-3 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1 flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
        )}
        {linkMsg && (
          <p className="text-[10px] font-semibold px-1" style={{ color: linkMsg.startsWith("Link created") || linkMsg.startsWith("Copied") ? COLORS.success : "#dc2626" }}>{linkMsg}</p>
        )}
        {sortedLinks.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {sortedLinks.map((l) => {
              const status = l._status;
              return (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1 min-w-0 truncate">
                    <span className="text-xs font-semibold text-slate-800">{getTeam(l.teamId).shortName}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">{l.uses || 0}{l.maxUses != null ? `/${l.maxUses}` : ""} uses · expires {l._expiryLabel}</span>
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0" style={status === "Active" ? { backgroundColor: COLORS.success + "1A", color: COLORS.success } : { backgroundColor: "#fee2e2", color: "#dc2626" }}>{status}</span>
                  <button onClick={() => { if (confirm("Revoke this invite link? Anyone who hasn't joined yet won't be able to use it.")) removeInviteLink(l.id).catch(reportError("Couldn't revoke the link")); }} title="Revoke link" aria-label="Revoke link" className="text-slate-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {rosterTotal === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-3">No players on the roster yet.</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {invites.map((inv, i) => {
            const isCoach = isStaffRole(inv.role);
            const isSelf = inv.email === user.email;
            const toggleRole = async () => {
              const next = isCoach ? "player" : "admin";
              try {
                await setInviteRole(inv.email, next);
                setInviteMsg(`${inv.email} is now ${next === "admin" ? "a coach" : "a player"}.`);
              } catch (e) {
                setInviteMsg(e.message || "Couldn't change role.");
              }
            };
            return (
              <li key={inv.id} className={`flex items-center gap-2 px-3 py-2.5 ${i < rosterTotal - 1 ? "border-b border-slate-100" : ""}`}>
                <span className="truncate flex-1">
                  {nameByEmail[inv.email]
                    ? <><span className="text-xs font-semibold text-slate-800">{nameByEmail[inv.email]}</span><span className="text-[10px] text-slate-400 ml-1.5">{inv.email}</span></>
                    : <span className="text-xs font-mono text-slate-700">{inv.email}</span>}
                </span>
                {/* Role is org-admin-only (decision 2026-11-08): a team
                    coach sees the badge but can't promote/demote anyone.
                    setInviteRole + the rules enforce it server-side too. */}
                {isOrgAdmin ? (
                  <button
                    onClick={toggleRole}
                    disabled={isSelf}
                    title={isSelf ? "You can't change your own role here." : isCoach ? "Make player" : "Make coach"}
                    className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={isCoach
                      ? { backgroundColor: COLORS.primary, color: "white" }
                      : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                  >
                    {staffLabel(isCoach ? inv.role : "player")}
                  </button>
                ) : (
                  <span
                    title={isCoach ? "Coach — only the program admin can change roles." : "Player — only the program admin can change roles."}
                    className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0"
                    style={isCoach
                      ? { backgroundColor: COLORS.primary, color: "white" }
                      : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                  >
                    {staffLabel(isCoach ? inv.role : "player")}
                  </span>
                )}
                <button onClick={() => { if (confirm(`Remove ${inv.email} from the roster? They won't be able to sign up with this invite.`)) Promise.resolve(removeInvite(inv.id)).catch(reportError("Couldn't remove the invite")); }} disabled={isSelf} title={isSelf ? "You can't remove yourself." : `Remove ${inv.email}`} aria-label={`Remove ${inv.email}`} className="text-slate-300 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
          {/* Players who joined through an invite link: they have a users
              doc but no invitedEmails entry, so they are listed here with a
              "Via link" tag. Only the program admin can remove one (deletes
              their profile — firestore.rules users delete). */}
          {linkJoiners.map((u, j) => {
            const isCoach = isStaffRole(u.role);
            const displayName = (u.name || "").trim();
            return (
              <li key={u.id} className={`flex items-center gap-2 px-3 py-2.5 ${j < linkJoiners.length - 1 ? "border-b border-slate-100" : ""}`}>
                <span className="truncate flex-1">
                  {displayName
                    ? <><span className="text-xs font-semibold text-slate-800">{displayName}</span>{u.email ? <span className="text-[10px] text-slate-400 ml-1.5">{u.email}</span> : null}</>
                    : <span className="text-xs font-mono text-slate-700">{u.email}</span>}
                </span>
                <span title="Joined through an invite link." className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>Via link</span>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0" style={isCoach ? { backgroundColor: COLORS.primary, color: "white" } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}>
                  {staffLabel(isCoach ? u.role : "player")}
                </span>
                {isOrgAdmin && removeUser && u.id !== user.uid && (
                  <button onClick={() => { if (confirm(`Remove ${displayName || u.email} from the team? They'll lose access until invited again.`)) Promise.resolve(removeUser(u.id)).catch(reportError("Couldn't remove the player")); }} aria-label={`Remove ${displayName || u.email}`} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// Announcements — management moved out of the coach Home tab into Coach
// Tools (§9 Option B). Home keeps a read-only news list; posting, editing,
// pinning and deleting live here.
export const AnnouncementsPage = ({ announcements, addAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement }) => {
  const [adding, setAdding] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const add = async () => {
    if (!form.title.trim()) return;
    try {
      if (editingAnnouncementId) {
        await updateAnnouncement(editingAnnouncementId, { title: form.title, body: form.body });
      } else {
        await addAnnouncement(form.title, form.body);
      }
      setForm({ title: "", body: "" });
      setEditingAnnouncementId(null);
      setAdding(false);
    } catch (e) {
      toast("Couldn't save — " + (e.message || "check your Firestore rules."));
    }
  };
  const startEdit = (a) => {
    setEditingAnnouncementId(a.id);
    setForm({ title: a.title || "", body: a.body || "" });
    setAdding(true);
  };
  const cancelEdit = () => {
    setEditingAnnouncementId(null);
    setForm({ title: "", body: "" });
    setAdding(false);
  };
  const togglePin = (id, pinned) => togglePinAnnouncement(id, pinned).catch(reportError("Couldn't pin the announcement"));
  const del = (id) => {
    if (!confirm("Delete this announcement?")) return;
    deleteAnnouncement(id).catch(reportError("Couldn't delete the announcement"));
  };
  const sorted = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <div className="pt-4 pb-6 px-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Announcements</h3>
          <p className="text-xs text-slate-500 mt-0.5">{announcements.length} post{announcements.length === 1 ? "" : "s"} · pinned first</p>
        </div>
        <button onClick={() => { setEditingAnnouncementId(null); setForm({ title: "", body: "" }); setAdding(!adding); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1 flex-shrink-0" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Post</button>
      </div>
      {adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details…" minRows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2"><button onClick={cancelEdit} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>{editingAnnouncementId ? "Save Changes" : "Post to Team"}</button></div>
        </div>
      )}
      <ul className="space-y-2.5">
        {sorted.map((a) => (
          <li key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">{a.pinned && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.accent }} />}<h4 className="font-semibold text-slate-900 text-sm">{a.title}</h4></div>
                <p className="text-xs text-slate-500 leading-snug">{a.body}</p><span className="text-[10px] text-slate-400 font-medium">{formatAgo(a.createdAt)}</span>
              </div>
              <div className="flex flex-col gap-1.5"><button onClick={() => togglePin(a.id, a.pinned)} title="Pin" className="text-slate-300 hover:text-orange-500"><Pin className="w-4 h-4" /></button><button onClick={() => startEdit(a)} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-4 h-4" /></button><button onClick={() => del(a.id)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>
            </div>
          </li>
        ))}
      </ul>
      {isLoading(announcements) ? <LoadingNote /> : sorted.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No announcements yet — post the first one.</p>}
    </div>
  );
};

// Documents — moved out of the coach Home tab into Coach Tools (§9
// Option B). Same upload + sign flow as Home, grouped into folders by file
// type. The org admin sees one team at a time via the team switcher, so
// folders stay per-team.
export const DocumentsPage = ({ user, documents, rosterCount = 0, onUpload, onDelete, onSign }) => {
  return (
    <div className="pt-4 pb-6 px-5">
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-900">Documents</h3>
        <p className="text-xs text-slate-500 mt-0.5">Handbooks, itineraries &amp; forms — {documents.length} file{documents.length === 1 ? "" : "s"}</p>
      </div>
      <DocumentsSection user={user} documents={documents} isAdmin rosterCount={rosterCount} onUpload={onUpload} onDelete={onDelete} onSign={onSign} groupByType hideHeader />
    </div>
  );
};

// Coach Center — the Coach tab. Option B ("The Toolbelt", §9): six simple
// tiles, one per area — tap a tile, you're in that area. Everything here is
// per-team (Fix 1 model); the org admin switches teams with the one team
// switcher in the header, a single-team coach sees only theirs.
export const CoachCenterPage = ({ practiceProps, gameDayProps, gameStatsProps, rosterProps, calendarProps, documentsProps, announcementsProps }) => {
  const [view, setView] = useState(null); // null | practice | gameday | roster | calendar | documents | announcements
  const practices = practiceProps?.practices || [];
  const programs = practiceProps?.programs || [];
  const lineups = gameDayProps?.lineups || [];
  const invites = rosterProps?.invites || [];
  const allUsers = rosterProps?.allUsers || [];
  const events = calendarProps?.events || [];
  const documents = documentsProps?.documents || [];
  const announcements = announcementsProps?.announcements || [];
  const todayStr = teamDateKey();
  const upcomingCount = events.filter((e) => (e.date || "") >= todayStr).length;
  // Pending invites = roster emails nobody has signed in with yet. The
  // roster is small, so this is computed inline (no memo needed).
  const signedEmails = new Set(allUsers.map((u) => (u.email || "").toLowerCase()));
  const pendingCount = invites.filter((inv) => inv.email && !signedEmails.has(inv.email.toLowerCase())).length;

  const tiles = [
    { id: "practice", label: "Practice", sub: "Drill library, sessions & programs", icon: ClipboardList, badge: `${practices.length} session${practices.length === 1 ? "" : "s"} · ${programs.length} program${programs.length === 1 ? "" : "s"}` },
    { id: "gameday", label: "Game Day", sub: "Build & share your starting line-up", icon: Goal, badge: `${lineups.length} saved line-up${lineups.length === 1 ? "" : "s"}`, highlight: true },
    { id: "stats", label: "Game Stats", sub: "Track games live, season stats", icon: BarChart3, badge: "Live tracker" },
    { id: "roster", label: "Roster & Invites", sub: "Players, coaches & invite links", icon: Users, badge: `${invites.length} on roster`, alert: pendingCount > 0 ? `${pendingCount} pending` : null },
    { id: "calendar", label: "Calendar", sub: "Practices, games & events", icon: CalendarIcon, badge: `${upcomingCount} upcoming` },
    { id: "documents", label: "Documents", sub: "Handbooks, itineraries & forms", icon: FileText, badge: `${documents.length} file${documents.length === 1 ? "" : "s"}` },
    { id: "announcements", label: "Announcements", sub: "News for the team", icon: Megaphone, badge: `${announcements.length} post${announcements.length === 1 ? "" : "s"}` },
  ];

  if (view) {
    return (
      <div>
        <div className="px-5 pt-4 pb-1">
          <button onClick={() => setView(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Coach Center</button>
        </div>
        {view === "practice" && <PracticePage {...practiceProps} />}
        {view === "gameday" && <GameDayPage {...gameDayProps} />}
        {view === "stats" && <GameStatsPage {...gameStatsProps} />}
        {view === "roster" && <RosterInvitesPage {...rosterProps} />}
        {view === "calendar" && <CalendarPage {...calendarProps} />}
        {view === "documents" && <DocumentsPage {...documentsProps} />}
        {view === "announcements" && <AnnouncementsPage {...announcementsProps} />}
      </div>
    );
  }
  return (
    <div className="pt-5 pb-6 px-5">
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setView(t.id)} className={`rounded-2xl p-4 shadow-sm flex flex-col items-start gap-2.5 text-left ${t.highlight ? "text-white" : "bg-white border border-slate-100"}`} style={t.highlight ? { backgroundColor: COLORS.primary } : {}}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.highlight ? "bg-white/15" : ""}`} style={t.highlight ? {} : { backgroundColor: COLORS.accentSoft }}>
                <Icon className="w-5 h-5" style={{ color: COLORS.accent }} />
              </div>
              <div className="min-w-0">
                <div className={`font-bold text-sm leading-tight ${t.highlight ? "" : "text-slate-900"}`}>{t.label}</div>
                <div className={`text-[11px] leading-snug mt-0.5 ${t.highlight ? "text-white/70" : "text-slate-500"}`}>{t.sub}</div>
              </div>
              <div className="flex flex-wrap gap-1 mt-auto">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.highlight ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>{t.badge}</span>
                {t.alert && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{t.alert}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
