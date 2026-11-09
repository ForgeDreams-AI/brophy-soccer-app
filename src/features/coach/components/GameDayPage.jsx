// Game Day — starting line-ups. The coach drops players onto a soccer pitch
// (each token = the player's photo with their name under it), names the
// "field", saves it, and can send it to any group chat as a branded image.
// Formation presets seed the slot positions; slots are draggable and
// tap-to-assign. Positions are normalized 0..1 so the pitch scales to any size
// and rasterizes cleanly for the chat card.
//
// Lineup doc: { name, formation: "4-3-3",
//   slots: [{ id, x, y, label: "GK", uid, name, initials, photoURL }] }
//
// NOTE: slot photoURLs are resolved at render time from the users docs
// (usersByUid) so a changed player photo flows through automatically; the
// photoURL field on old docs is kept as a backwards-compatible fallback.

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  ChevronLeft,
  Goal,
  Hash,
  Camera,
} from "lucide-react";
import { useTheme } from "../../../theme/ThemeProvider";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import Avatar from "../../../components/ui/Avatar";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import SearchInput from "../../../components/ui/SearchInput";
import { Input } from "../../../components/ui/Field";
import { toast } from "../../../lib/toast";
import { lid, clampN, shortName, initialsOf } from "./shared";
import { uploadLineupLogoImage, uploadPlayerHeadshot } from "../hooks";

// Formation → outfield rows (defense → attack); the goalkeeper is implied.
const FORMATIONS = {
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
const slotsForFormation = (rows) => {
  const out = [{ id: lid(), x: 0.5, y: 0.92, label: "GK", uid: "", name: "", initials: "", photoURL: "" }];
  const n = rows.length;
  rows.forEach((count, i) => {
    const y = n === 1 ? 0.45 : 0.76 - (i * (0.76 - 0.17)) / (n - 1);
    for (let k = 0; k < count; k++) {
      out.push({ id: lid(), x: (k + 1) / (count + 1), y, label: "", uid: "", name: "", initials: "", photoURL: "" });
    }
  });
  return out;
};

// SVG pitch markings (white lines), portrait, drawn over a green field.
const PitchLines = () => {
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

// ─── Branded export — raw Canvas 2D, no library ─────────────────────────────
// 800×1120 JPEG: 120px banner in the team navy (team.colors.primary), gold
// team accent "Formation · 4-3-3", green pitch with stripes + canvas-drawn
// markings, logo watermark (only if canvas-readable), R=44 player tokens
// (photo clipped in a circle or navy/initials), white ring, dark name pill.
//
// CORS strategy: photos load crossOrigin="anonymous"; a 2×2 getImageData
// taint probe runs per origin; on failure we fall back to initials —
// "the send always succeeds."
const CARD_W = 800, CARD_H = 1120;

const loadCorsImage = (url) =>
  new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
const canvasReadable = (img) => {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    cx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
};
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export const renderLineupBlob = async ({ title, formation, slots, logoUrl, colors }) => {
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
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  const top = 120; // banner height
  // banner — team navy, gold formation line
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, 0, CARD_W, top);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText((title || "Starting XI").slice(0, 30), CARD_W / 2, 52);
  ctx.fillStyle = colors.accent;
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillText(formation ? `Formation · ${formation}` : "Starting XI", CARD_W / 2, 92);
  // pitch
  const pTop = top, pH = CARD_H - top;
  const grad = ctx.createLinearGradient(0, pTop, 0, CARD_H);
  grad.addColorStop(0, "#2E7D46");
  grad.addColorStop(1, "#276b3c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, pTop, CARD_W, pH);
  // mow stripes
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < 10; i += 2) ctx.fillRect(0, pTop + (pH / 10) * i, CARD_W, pH / 10);
  // lines
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  const px = (nx) => 8 + nx * (CARD_W - 16);
  const py = (ny) => pTop + 6 + ny * (pH - 12);
  ctx.strokeRect(px(0), py(0), px(1) - px(0), py(1) - py(0));
  ctx.beginPath();
  ctx.moveTo(px(0), (pTop + CARD_H) / 2);
  ctx.lineTo(px(1), (pTop + CARD_H) / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CARD_W / 2, (pTop + CARD_H) / 2, 70, 0, Math.PI * 2);
  ctx.stroke();
  // watermark — team logo centered on the pitch at 60% opacity, behind the
  // player tokens so faces stay legible.
  if (useLogo && logoImg && logoImg.width) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    const lw = CARD_W * 0.5;
    const scale = lw / logoImg.width;
    const lh = logoImg.height * scale;
    ctx.drawImage(logoImg, (CARD_W - lw) / 2, pTop + (pH - lh) / 2, lw, lh);
    ctx.restore();
  }
  // tokens
  const R = 44;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const cx = px(s.x), cy = py(s.y);
    ctx.save();
    if (usePhotos && imgs[i]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const im = imgs[i];
      const scale = Math.max((2 * R) / im.width, (2 * R) / im.height);
      const dw = im.width * scale, dh = im.height * scale;
      ctx.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = s.uid || s.name ? colors.primary : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.initials || s.label || "", cx, cy);
      ctx.restore();
    }
    // ring
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // name pill
    const label = s.name ? shortName(s.name) : s.label || "";
    if (label) {
      ctx.font = "bold 24px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      const pw = tw + 22, ph = 34, ly = cy + R + 8;
      ctx.fillStyle = "rgba(10,20,45,0.82)";
      roundRect(ctx, cx - pw / 2, ly, pw, ph, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, cx, ly + ph / 2 + 1);
    }
  }
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
  );
};

// ─── SendLineupSheet: channel picker → renders the card and posts it ────────
const SendLineupSheet = ({ coach, title, formation, slots, logoUrl, colors, onClose }) => {
  const [busy, setBusy] = useState("");
  const channels = [
    { id: "team", name: "Team" },
    ...(coach.chatGroups || []).map((c) => ({ id: c.id, name: c.name })),
  ];
  const send = async (ch) => {
    setBusy(ch.id);
    try {
      const blob = await renderLineupBlob({ title, formation, slots, logoUrl, colors });
      if (!blob) throw new Error("couldn't render the card");
      await coach.postLineupImage(blob, ch.id, title);
      toast(`Sent to ${ch.name}.`, "success");
      onClose();
    } catch (e) {
      toast("Couldn't send — " + (e.message || "check rules."));
      setBusy("");
    }
  };
  return (
    <Sheet open onClose={onClose} title="Send line-up to…" size="sm">
      <div className="px-4 py-4 space-y-2">
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => send(ch)}
            disabled={!!busy}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--th-surface-2)] bg-[var(--th-surface)] disabled:opacity-60"
          >
            <span className="flex items-center gap-2 font-semibold text-sm text-ink">
              <Hash className="w-4 h-4 text-ink-faint" />
              {ch.name}
            </span>
            {busy === ch.id ? (
              <span className="inline-block w-4 h-4 border-2 border-[var(--th-surface-2)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-brand-primary" />
            )}
          </button>
        ))}
        <p className="text-[11px] text-ink-faint leading-relaxed px-1 pt-1">
          The line-up is posted as an image. Player faces show if photos are set; otherwise
          their initials appear.
        </p>
      </div>
    </Sheet>
  );
};

// ─── PlayerPickerSheet: assign a roster player to the active slot ───────────
const PlayerPickerSheet = ({ roster, usedUids, onPick, onClear, onUploadPhoto, onClose }) => {
  const [q, setQ] = useState("");
  const uploadRef = useRef(null);
  const [target, setTarget] = useState(null);
  const list = roster.filter((p) => (p.name || p.email || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open onClose={onClose} title="Pick a player" size="lg">
      <div className="px-4 py-4 space-y-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search roster…" />
        <button
          onClick={onClear}
          className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider text-[var(--th-danger)]"
          style={{ backgroundColor: "color-mix(in srgb, var(--th-danger) 10%, transparent)" }}
        >
          Clear this position
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (target) onUploadPhoto(target, f);
            setTarget(null);
          }}
        />
        {list.length === 0 && (
          <p className="text-sm text-ink-faint italic text-center py-4">No players found.</p>
        )}
        {list.map((p) => (
          <div
            key={p.uid || p.email}
            className={`flex items-center gap-3 px-2 py-2 rounded-xl ${
              usedUids.has(p.uid) && p.uid ? "opacity-40" : ""
            }`}
          >
            <button
              onClick={() => onPick(p)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <Avatar photoURL={p.photoURL} initials={p.initials} size={38} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink truncate">{p.name || p.email}</div>
                {p.role === "admin" && (
                  <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                    Coach
                  </div>
                )}
              </div>
            </button>
            {p.uid && (
              <button
                onClick={() => {
                  setTarget(p);
                  uploadRef.current?.click();
                }}
                aria-label={`Add photo for ${p.name}`}
                title="Add / change photo"
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-ink-faint bg-[var(--th-surface-2)]"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
};

// ─── GameDayPage: line-up builder ────────────────────────────────────────────
export default function GameDayPage({ user, coach }) {
  const { team } = useTheme();
  const confirm = useConfirm();
  const colors = team.colors;

  const [draft, setDraft] = useState(null); // null = list view; object = editor
  const [activeSlot, setActiveSlot] = useState(null); // slot id being assigned
  const [sending, setSending] = useState(null); // lineup being sent to chat
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);
  const fieldRef = useRef(null);
  const dragRef = useRef({ id: null, moved: false, sx: 0, sy: 0 });

  // The watermark on every line-up — the coach's uploaded logo, or the team
  // brand mark until they set one.
  const logoUrl = coach.lineupLogo || team.assets.logo;
  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const { url, path } = await uploadLineupLogoImage(user.uid, file);
      await coach.setLineupLogo(url, path);
      toast("Line-up logo updated.", "success");
    } catch (e) {
      toast("Couldn't upload logo — " + (e.message || "check Storage rules."));
    } finally {
      setLogoBusy(false);
    }
  };

  // Live users docs keyed by uid — slot photoURLs resolve against these at
  // render time so a changed photo flows through (old doc photoURL = fallback).
  const usersByUid = useMemo(() => {
    const m = new Map();
    (coach.allUsers || []).forEach((u) => {
      const key = u.uid || u.id;
      if (key) m.set(key, u);
    });
    return m;
  }, [coach.allUsers]);
  const photoFor = (slot) =>
    (slot.uid && usersByUid.get(slot.uid)?.photoURL) || slot.photoURL || "";

  // Combined roster: signed-in users (with photos) first, then any invited
  // emails that never created an account.
  const roster = useMemo(() => {
    const rows = [];
    const seen = new Set();
    (coach.allUsers || []).forEach((u) => {
      const em = (u.email || "").toLowerCase();
      seen.add(em);
      const uid = u.uid || u.id;
      rows.push({
        uid,
        name: u.name || u.email || "Player",
        initials: u.initials || initialsOf(u.name || u.email || ""),
        photoURL: u.photoURL || "",
        email: u.email || "",
        role: u.role || "player",
      });
    });
    (coach.invites || []).forEach((inv) => {
      const em = (inv.email || "").toLowerCase();
      if (em && !seen.has(em))
        rows.push({
          uid: "",
          name: inv.email,
          initials: initialsOf(inv.email),
          photoURL: "",
          email: inv.email,
          role: inv.role || "player",
        });
    });
    return rows.sort((a, b) =>
      a.role === b.role ? (a.name || "").localeCompare(b.name || "") : a.role === "admin" ? 1 : -1,
    );
  }, [coach.allUsers, coach.invites]);

  const newLineup = () =>
    setDraft({ id: null, name: "", formation: "4-3-3", slots: slotsForFormation(FORMATIONS["4-3-3"]) });
  const editLineup = (l) =>
    setDraft({
      id: l.id,
      name: l.name || "",
      formation: l.formation || "",
      slots: (l.slots || []).map((s) => ({ ...s, id: s.id || lid() })),
    });

  // Changing formation rebuilds slots — warn first (v1 discarded assignments
  // silently), then preserve players where old and new slots map 1:1 by label
  // (e.g. GK → GK).
  const changeFormation = async (f) => {
    if (!draft || f === draft.formation) return;
    const assigned = draft.slots.filter((s) => s.uid || s.name);
    if (assigned.length > 0) {
      const ok = await confirm({
        title: `Switch to ${f}?`,
        body: "This rebuilds every slot on the pitch. Slots with matching position labels keep their players; the rest reset.",
        confirmLabel: "Change formation",
        danger: true,
      });
      if (!ok) return;
    }
    const byLabel = new Map(); // label → assigned old slot (1:1 by label)
    draft.slots.forEach((s) => {
      if (s.label && (s.uid || s.name) && !byLabel.has(s.label)) byLabel.set(s.label, s);
    });
    const used = new Set();
    const slots = slotsForFormation(FORMATIONS[f]).map((s) => {
      if (s.label && byLabel.has(s.label) && !used.has(s.label)) {
        used.add(s.label);
        const old = byLabel.get(s.label);
        return { ...s, uid: old.uid, name: old.name, initials: old.initials, photoURL: old.photoURL };
      }
      return s;
    });
    setDraft((d) => ({ ...d, formation: f, slots }));
  };

  const assignPlayer = (player) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) => {
        if (s.id === activeSlot)
          return {
            ...s,
            uid: player.uid,
            name: player.name,
            initials: player.initials,
            photoURL: player.photoURL || "",
          };
        // One player per line-up: clear them from their previous slot.
        if (player.uid && s.uid === player.uid)
          return { ...s, uid: "", name: "", initials: "", photoURL: "" };
        return s;
      }),
    }));
    setActiveSlot(null);
  };
  const clearSlot = () => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) =>
        s.id === activeSlot ? { ...s, uid: "", name: "", initials: "", photoURL: "" } : s,
      ),
    }));
    setActiveSlot(null);
  };
  const uploadForPlayer = async (player, file) => {
    if (!file || !player.uid) return;
    try {
      const { url, path } = await uploadPlayerHeadshot(user.uid, file);
      await coach.setPlayerPhoto(player.uid, url, path);
      setDraft((d) =>
        d
          ? { ...d, slots: d.slots.map((s) => (s.uid === player.uid ? { ...s, photoURL: url } : s)) }
          : d,
      );
      toast(`Photo added for ${player.name}.`, "success");
    } catch (e) {
      toast("Couldn't add photo — " + (e.message || "check Storage rules."));
    }
  };

  // Drag tokens; a tap (no drag) opens the picker.
  const onDown = (e, slot) => {
    e.stopPropagation();
    dragRef.current = { id: slot.id, moved: false, sx: e.clientX, sy: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d.id || !fieldRef.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    const rect = fieldRef.current.getBoundingClientRect();
    const x = clampN((e.clientX - rect.left) / rect.width, 0.05, 0.95);
    const y = clampN((e.clientY - rect.top) / rect.height, 0.04, 0.96);
    setDraft((dr) => ({
      ...dr,
      slots: dr.slots.map((s) => (s.id === d.id ? { ...s, x, y } : s)),
    }));
  };
  const onUp = (e, slot) => {
    const d = dragRef.current;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = { id: null, moved: false, sx: 0, sy: 0 };
    if (!d.moved) setActiveSlot(slot.id);
  };

  const save = async () => {
    const name = (draft.name || "").trim() || `${draft.formation} line-up`;
    try {
      const payload = { name, formation: draft.formation, slots: draft.slots };
      if (draft.id) await coach.updateLineup(draft.id, payload);
      else await coach.addLineup(payload);
      toast("Line-up saved.", "success");
      setDraft(null);
    } catch (e) {
      toast("Couldn't save — " + (e.message || "check rules."));
    }
  };
  const del = async (l) => {
    const ok = await confirm({
      title: `Delete "${l.name || "this line-up"}"?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await coach.deleteLineup(l.id);
      toast("Line-up deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e.message || "check rules."));
    }
  };
  // Slots with photoURLs resolved from the live users docs for anything that
  // leaves the screen (export + send); the editor resolves per-token below.
  const resolvedSlots = (slots) =>
    (slots || []).map((s) => ({ ...s, photoURL: photoFor(s) }));

  // ── List view ──
  if (!draft) {
    return (
      <div className="pt-4 pb-6 px-5 space-y-4">
        <button
          onClick={newLineup}
          className="w-full rounded-xl p-4 flex items-center gap-3 text-white shadow-card bg-brand-primary"
        >
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="font-bold">New line-up</div>
            <div className="text-xs text-white/70">Build a starting XI on the field</div>
          </div>
        </button>
        {/* Watermark logo — centered on every line-up at 60% */}
        <div className="rounded-xl bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-[var(--th-bg)]">
            <img
              src={logoUrl}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-ink">Line-up watermark</div>
            <div className="text-[11px] text-ink-faint leading-snug">
              {coach.lineupLogo ? "Your logo, centered on every line-up." : "Using the team logo. Upload your own."}
            </div>
          </div>
          <Btn
            size="sm"
            onClick={() => logoInputRef.current?.click()}
            loading={logoBusy}
            disabled={logoBusy}
            className="flex-shrink-0"
          >
            {coach.lineupLogo ? "Change" : "Upload"}
          </Btn>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              uploadLogo(f);
            }}
          />
        </div>
        {sending && (
          <SendLineupSheet
            coach={coach}
            title={sending.name}
            formation={sending.formation}
            slots={resolvedSlots(sending.slots)}
            logoUrl={logoUrl}
            colors={colors}
            onClose={() => setSending(null)}
          />
        )}
        <h3 className="text-[11px] font-black uppercase tracking-wider text-ink-faint pt-1">
          Saved line-ups
        </h3>
        {coach.lineups.length === 0 ? (
          <div className="rounded-xl p-6 border border-dashed border-[var(--th-surface-2)] bg-[var(--th-surface)] text-center">
            <Goal className="w-7 h-7 mx-auto mb-1.5 text-brand-accent" />
            <p className="text-sm text-ink-soft font-medium">No line-ups yet.</p>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Create one, then send it to any team chat.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {coach.lineups.map((l) => {
              const filled = (l.slots || []).filter((s) => s.uid || s.name).length;
              return (
                <div
                  key={l.id}
                  className="rounded-xl bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card p-3.5 flex items-center gap-3"
                >
                  <div className="w-11 h-14 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#2E7D46]">
                    <span className="text-[11px] font-black text-white/90">
                      {l.formation || "XI"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-ink truncate">
                      {l.name || "Untitled line-up"}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {filled}/11 players{l.formation ? ` · ${l.formation}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setSending(l)}
                    aria-label="Send to chat"
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-brand-accent-soft text-brand-primary"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => editLineup(l)}
                    aria-label="Edit"
                    className="w-9 h-9 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center flex-shrink-0"
                  >
                    <Pencil className="w-4 h-4 text-ink-faint" />
                  </button>
                  <button
                    onClick={() => del(l)}
                    aria-label="Delete"
                    className="w-9 h-9 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4 text-ink-faint" />
                  </button>
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
        <button
          onClick={() => setDraft(null)}
          className="text-xs font-semibold text-ink-faint flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Line-ups
        </button>
        <Btn size="sm" onClick={save}>
          Save
        </Btn>
      </div>
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Name this line-up (e.g. vs Central State)"
        aria-label="Line-up name"
      />
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {Object.keys(FORMATIONS).map((f) => (
          <button
            key={f}
            onClick={() => changeFormation(f)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0 border ${
              draft.formation === f
                ? "text-white bg-brand-primary border-brand-primary"
                : "bg-[var(--th-surface)] text-ink-soft border-[var(--th-surface-2)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div
        ref={fieldRef}
        className="relative w-full rounded-xl overflow-hidden shadow-inner select-none"
        style={{
          aspectRatio: "68 / 105",
          background: "linear-gradient(180deg,#2E7D46,#276b3c)",
          touchAction: "none",
        }}
      >
        {/* mow stripes */}
        {[0, 2, 4, 6, 8].map((i) => (
          <div
            key={i}
            className="absolute left-0 right-0"
            style={{ top: `${i * 10}%`, height: "10%", backgroundColor: "rgba(255,255,255,0.04)" }}
          />
        ))}
        <PitchLines />
        {/* watermark — centered team logo at 60%, behind the tokens */}
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none object-contain"
          style={{ width: "50%", opacity: 0.6 }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        {draft.slots.map((s) => {
          const photo = photoFor(s);
          return (
            <div
              key={s.id}
              onPointerDown={(e) => onDown(e, s)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, s)}
              className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: "translate(-50%,-50%)",
                touchAction: "none",
              }}
            >
              <div
                className="rounded-full border-2 border-white shadow-md overflow-hidden flex items-center justify-center bg-brand-primary"
                style={{ width: 44, height: 44 }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                    {s.initials || (s.uid || s.name ? "" : <Plus className="w-4 h-4" />) || s.label}
                  </div>
                )}
              </div>
              <span
                className="mt-1 px-1.5 py-0.5 rounded text-[11px] font-bold text-white leading-none max-w-[72px] truncate"
                style={{ backgroundColor: "rgba(10,20,45,0.8)" }}
              >
                {s.name ? shortName(s.name) : s.label || "Add"}
              </span>
            </div>
          );
        })}
      </div>
      <Btn
        variant="accent"
        className="w-full"
        icon={Send}
        onClick={() =>
          setSending({
            name: (draft.name || "").trim() || `${draft.formation} line-up`,
            formation: draft.formation,
            slots: draft.slots,
          })
        }
      >
        Send to chat
      </Btn>
      <p className="text-[11px] text-ink-faint text-center leading-relaxed">
        Tap a spot to assign a player · drag to reposition
      </p>
      {activeSlot && (
        <PlayerPickerSheet
          roster={roster}
          usedUids={usedUids}
          onPick={assignPlayer}
          onClear={clearSlot}
          onUploadPhoto={uploadForPlayer}
          onClose={() => setActiveSlot(null)}
        />
      )}
      {sending && (
        <SendLineupSheet
          coach={coach}
          title={sending.name}
          formation={sending.formation}
          slots={resolvedSlots(sending.slots)}
          logoUrl={logoUrl}
          colors={colors}
          onClose={() => setSending(null)}
        />
      )}
    </div>
  );
}
