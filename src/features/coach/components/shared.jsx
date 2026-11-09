// Shared coach-feature constants + helpers. Imports nothing from other
// feature directories (CONTRACT hard rule 10).

import {
  Flame,
  Footprints,
  Repeat,
  Target,
  Layers,
  Flag,
  Zap,
  Users,
  Snowflake,
  Lock,
} from "lucide-react";

// ─── Id / math / name helpers ─────────────────────────────────────────────────
export const lid = () => Math.random().toString(36).slice(2, 9);
export const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// First name + last initial, e.g. "Maya P." — compact but recognizable on
// the pitch tokens and the exported card.
export const shortName = (name = "") => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  if (p.length === 1) return p[0];
  return `${p[0]} ${p[p.length - 1][0]}.`;
};

// ─── Drills ──────────────────────────────────────────────────────────────────
export const DRILL_CATS = [
  "Warm-up",
  "Technical",
  "Possession",
  "Finishing",
  "Tactical",
  "Set Pieces",
  "Conditioning",
  "Small-Sided",
  "Cool-down",
];
export const DRILL_CAT_ICON = {
  "Warm-up": Flame,
  Technical: Footprints,
  Possession: Repeat,
  Finishing: Target,
  Tactical: Layers,
  "Set Pieces": Flag,
  Conditioning: Zap,
  "Small-Sided": Users,
  "Cool-down": Snowflake,
};

// Read-only hint for non-coach viewers of the practice areas.
export const ReadOnlyHint = ({ label }) => (
  <span className="text-[11px] text-ink-faint font-medium inline-flex items-center gap-1">
    <Lock className="w-3 h-3" /> {label}
  </span>
);

// ─── Practice starter templates ──────────────────────────────────────────────
// Template colors are THEME COLOR KEYS (resolved via t(key)) — never
// hard-coded hexes, so white-label teams get their own palette automatically.
export const PRACTICE_STARTERS = [
  { name: "Technical Day", cat: "Technical", desc: "Warm-up → technical work → small-sided games.", icon: Target, colorKey: "info" },
  { name: "Game Prep", cat: "Game Prep", desc: "Activation, shape work, set pieces.", icon: Flag, colorKey: "success" },
  { name: "Conditioning", cat: "Conditioning", desc: "Fitness blocks with the ball.", icon: Zap, colorKey: "accent" },
  { name: "Recovery", cat: "Recovery", desc: "Light mobility and regeneration.", icon: Snowflake, colorKey: "primary" },
];

// ─── Video embed (YouTube / Vimeo / Instagram) ───────────────────────────────
export const toEmbedUrl = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) {
        const t = u.searchParams.get("t") || u.searchParams.get("start");
        const start = t ? parseInt(t, 10) : null;
        return `https://www.youtube.com/embed/${v}${start ? `?start=${start}` : ""}`;
      }
      if (u.pathname.startsWith("/embed/")) return url;
      // /shorts/<id> and /live/<id>
      const shortMatch = u.pathname.match(/^\/(?:shorts|live)\/([^/?]+)/);
      if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
    }
    if (host === "youtu.be") {
      const v = u.pathname.replace(/^\//, "");
      if (v) {
        const t = u.searchParams.get("t");
        const start = t ? parseInt(t, 10) : null;
        return `https://www.youtube.com/embed/${v}${start ? `?start=${start}` : ""}`;
      }
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    // Instagram posts / reels / IGTV — embed the public post via /embed.
    // Private posts won't embed.
    if (host === "instagram.com" || host === "instagr.am") {
      const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([^/?]+)/);
      if (m) {
        const type = m[1] === "reels" ? "reel" : m[1];
        return `https://www.instagram.com/${type}/${m[2]}/embed`;
      }
    }
  } catch {
    /* not a parseable URL */
  }
  return null;
};
