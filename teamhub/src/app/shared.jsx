// Split out of TeamHubRoles.jsx (F81). Area: shared.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Activity, ArrowRight, CornerDownRight, Crosshair, Dumbbell, ExternalLink, Eye, Flag, Flame, Footprints, Goal, LayoutGrid, Lock, Mail, RefreshCw, Repeat, ScanLine, Shield, Shuffle, Snowflake, Star, StretchHorizontal, Swords, Target, Video, Wind, Zap } from "lucide-react";
import { GoogleAuthProvider, sendSignInLinkToEmail, signInWithPopup, signOut } from "firebase/auth";
import { writeBatch } from "firebase/firestore";
import { auth, db, storage } from "../firebase";
import { deleteObject, ref as storageRef, uploadBytes } from "firebase/storage";
import { disablePushOnThisDevice } from "../lib/notifications";
import { toast } from "../lib/toast";
import { teamDateKeyOf } from "../lib/dates";







// F33: delete a replaced file from Storage (a path or a download URL). Best
// effort: if it's someone else's file or already gone, nothing happens.
export const deleteStorageFile = (pathOrUrl) => {
  if (!pathOrUrl) return;
  try { deleteObject(storageRef(storage, pathOrUrl)).catch(() => {}); } catch { /* bad path */ }
};



// Turn a `visibleTo` audience ({ groupIds, uids|emails }) into the flat
// `audienceKeys` array we store on each doc so security rules can enforce
// visibility server-side. Empty audience = everyone (['*']). Groups are
// expanded to their members' keys at write time; re-run when a group's
// membership changes. A custom audience that resolves to nobody yields a
// key that matches no real user (admin-only), never '*'.
export const audienceKeyFor = (x) => (String(x).includes("@") ? "email:" + x : "uid:" + x);
export const audienceKeysFor = (visibleTo, groupsList = []) => {
  const v = visibleTo || {};
  const direct = [...(v.uids || []), ...(v.emails || [])];
  const groupIds = v.groupIds || [];
  if (direct.length === 0 && groupIds.length === 0) return ["*"];
  const keys = new Set(direct.map(audienceKeyFor));
  groupIds.forEach((gid) => {
    const g = (groupsList || []).find((x) => x.id === gid);
    (g?.memberUids || []).forEach((m) => keys.add(audienceKeyFor(m)));
  });
  return keys.size ? Array.from(keys) : ["uid:__none__"];
};








// Sign out, first removing THIS device's push token so a shared phone stops
// receiving the previous user's notifications.
export const signOutUser = async (uid) => {
  try { await disablePushOnThisDevice(uid); } catch { /* offline — still sign out */ }
  await signOut(auth);
};

// Error reporter for fire-and-forget actions (delete, pin, rate…): a failed
// write must never look like it worked. Replaces the old `.catch(() => {})`.
export const reportError = (what = "That didn't save") => (e) => {
  console.error(what, e);
  toast(`${what} — ${e?.code === "permission-denied" ? "you don't have permission." : (e?.message || "try again.")}`);
};

// Unique-ish file stamp for upload paths.
export const uploadStamp = () => Date.now();

// Batched writes in chunks (Firestore allows at most 500 ops per batch).
export const commitInChunks = async (items, apply, size = 450) => {
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db);
    items.slice(i, i + size).forEach((it) => apply(batch, it));
    await batch.commit();
  }
};





















/* ══════════════════════════════════════════════════════════════════════════
   TeamHubRoles — the whole Brophy app in one component tree. It's large, so
   use this map (search for the ALL-CAPS section markers below) to jump around.
   Reusable logic and data now live in sibling folders, imported above:
     lib/     — pure helpers + integrations (lifting engine, usda, exercises,
                exerciseSearch, openfoodfacts, notifications, toast)
     hooks/   — React data hooks (useAuth, useCollection)
     data/    — seed content (recipeSeed = 120 recipes, liftSeed = prehab starter set: bands-only hips / groin / ankles)

   SECTION MAP (grep the marker to jump):
     AUTH + TIME HELPERS ....... login/error + date utilities
     THEME / COLORS ............ COLORS, DEFAULT_NUTRITION_CATEGORIES, seeds
     HOME ...................... coach dashboard + player "Today" + wellness,
                                 push notifications, documents/e-sign
     CALENDAR .................. events
     VIDEOS .................... categorized video library
     NUTRITION ................. recipes (meal category → food-type sub), food
                                 log, targets, USDA/barcode/photo logging
     PRACTICE .................. drill library, practices, programs
     CHAT ...................... pins, threads, polls, reactions, read receipts
     GYM ....................... exercise library (+ starter lifts), My/Team
                                 workouts, WorkoutDetail (lifting engine)
     SETTINGS MODAL ............ profile + notification prefs
     MAIN ...................... App root: Firestore wiring + tab router
   ══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────
   AUTH + TIME HELPERS
   ────────────────────────────────────────────── */
export const prettyAuthError = (e) => {
  switch (e?.code) {
    case "auth/invalid-email": return "That email doesn't look right.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Email or password is incorrect.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request": return "Sign-in cancelled.";
    case "auth/network-request-failed": return "Network issue — try again.";
    case "auth/too-many-requests": return "Too many tries. Wait a minute.";
    default: return e?.message || "Sign in failed.";
  }
};

// YouTube start offsets: "90", "90s", "1m30s", "1h2m3s" → seconds.
export const parseYouTubeStart = (t) => {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10) || null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) || null;
};
// Embedded players get a sandbox (scripts + same-origin are needed by
// YouTube/Vimeo/Instagram players; no top navigation, no forms).
export const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export const toEmbedUrl = (url) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) {
        const start = parseYouTubeStart(u.searchParams.get("t") || u.searchParams.get("start"));
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
        const start = parseYouTubeStart(u.searchParams.get("t"));
        return `https://www.youtube.com/embed/${v}${start ? `?start=${start}` : ""}`;
      }
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    // Instagram posts / reels / IGTV — embed the public post via /embed. Reels
    // usually show a thumbnail that plays on tap; private posts won't embed.
    if (host === "instagram.com" || host === "instagr.am") {
      const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([^/?]+)/);
      if (m) {
        const type = m[1] === "reels" ? "reel" : m[1];
        return `https://www.instagram.com/${type}/${m[2]}/embed`;
      }
    }
  } catch { /* not a parseable URL */ }
  return null;
};

export const formatAgo = (ts) => {
  if (!ts) return "just now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const formatTime = (ts) => {
  if (!ts) return "now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// HTML time inputs store as "HH:MM" (24-hour). Convert to "h:MM AM/PM".
export const formatHourTime = (hhmm) => {
  if (!hhmm) return "";
  const [hStr, mStr] = String(hhmm).split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${(mStr || "00").padStart(2, "0")} ${period}`;
};

// Daily water guide (8-oz cups) for the nutrition hero and the Today
// checklist. Active teens training in Arizona heat need ~10-12+ cups on
// training days, plus more during/after hot sessions, so the default is 12.
// There is no team-wide calorie/protein target — each player sets their own
// daily goal if they want one (see MyNutritionGoalSection).
export const WATER_CUPS_GOAL = 12;
export const HYDRATION_TIP = "Aim for pale-yellow pee. Add 2–3 cups per hour of practice in the heat, and drink before you're thirsty.";

export const mealBucket = (ts) => {
  if (!ts) return "Today";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
};

// Consecutive days (counting back from today) with at least one log entry.
export const computeStreak = (entries) => {
  if (!entries?.length) return 0;
  const days = new Set();
  entries.forEach((e) => { if (e.createdAt) days.add(formatDayKey(e.createdAt)); });
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    if (days.has(formatDayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
};

// Local YYYY-MM-DD used as a grouping key for date dividers.
// Team-clock (America/Phoenix) YYYY-MM-DD — see lib/dates.js.
export const formatDayKey = (ts) => teamDateKeyOf(ts);

export const formatDateHeader = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "YESTERDAY";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  return d.toLocaleDateString([], { month: "short", day: "numeric" }).toUpperCase();
};

/* ──────────────────────────────────────────────
   THEME
   ────────────────────────────────────────────── */
// Brophy College Preparatory (Broncos) — Classic Brophy (Option A, §11).
// Primary red #980000 sampled from brophyprep.org's header (Nov 2026);
// accent red #A6192E is the site's own --brophy-red CSS variable.
// accentSoft / bg are pale red tints DERIVED from #980000 (not from the site).
// CTAs use `primary` (red + white text). `accent` is for badges + decorative.
// Stable empty object (a fresh {} each render would re-run memos).
export const EMPTY_OBJ = Object.freeze({});

// Staff = anyone who is not a player: team coaches ("admin"), the program
// admin ("orgAdmin") and drill builders. People lists use this so staff are
// never shown or counted as players.
export const STAFF_ROLES = new Set(["admin", "orgAdmin", "drillBuilder"]);
export const isStaffRole = (role) => STAFF_ROLES.has(role);
export const staffLabel = (role) => (role === "orgAdmin" ? "Admin" : role === "drillBuilder" ? "Builder" : role === "admin" ? "Coach" : role === "statistician" ? "Statistician" : "Player");
// Roles a roster entry can be set to (program admin only).
export const ROSTER_ROLES = [["player", "Player"], ["admin", "Coach"], ["statistician", "Statistician"]];

export const COLORS = {
  primary: "#980000",     // Brophy Red (site header)
  accent: "#A6192E",      // Brophy red (site --brophy-red variable)
  accentSoft: "#FBECEC",  // pale red backgrounds (derived)
  success: "#00B27A",
  bg: "#FAF4F4",          // subtle red tint so the app doesn't feel generic-white (derived)
  border: "#E2E8F0",
  textSecondary: "#64748B",
};
// Production domain (decided 2026-11-08, §11).
export const APP_DOMAIN = "BrophySoccer.forgedreams.ai";
export const TOUR_SEEN_KEY = "teamhub_tour_seen_v1";
// Sub-pages of the Train hub (also valid ?tab= deep links).
export const TRAIN_VIEWS = ["gym", "nutrition", "videos", "library"];

// Toast host — renders transient messages dispatched via toast(). Rendered once
// at the app root; aria-live so screen readers announce them.
export const Toaster = () => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((cur) => [...cur, t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 4000);
    };
    window.addEventListener("teamhub-toast", onToast);
    return () => window.removeEventListener("teamhub-toast", onToast);
  }, []);
  if (!items.length) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-3 space-y-2" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} role="status" className="rounded-xl px-4 py-3 text-sm font-medium shadow-lg text-white flex items-start gap-2"
          style={{ backgroundColor: t.type === "success" ? COLORS.success : t.type === "info" ? COLORS.primary : "#DC2626" }}>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
};

/* ──────────────────────────────────────────────
   SEED DATA  (real app → Firestore)
   ────────────────────────────────────────────── */
// Starts clean for Brophy — no sample announcements; coaches post real ones.
export const VIDEO_CATS = ["Film", "Breathing", "Stretching", "Mobility", "Strength", "Cooldown"];
export const CAT_ICON = { Film: Video, Breathing: Wind, Stretching: StretchHorizontal, Mobility: Activity, Strength: Dumbbell, Cooldown: Snowflake };

// Drill library categories — Brophy's 18 tactical topics, in session-flow
// order: warm up, technique, passing, staples, possessions, attacking,
// then the rest. Coaches can also add their own from the drill form; those
// show in the filter once a drill uses them, but they are not part of this
// built-in list.
export const DRILL_CATS = ["Warm up games", "Technique Drills", "Passing patterns", "Passing patterns to finish", "Staple Drills", "Possession in the middle third", "Possession in the final third", "Transitions to the final third", "Switching the point of attack", "Crossing", "Finishing", "Playing from back", "Transitions to the middle third", "Pressing when losing the ball", "Getting into shapes", "Line of confrontation", "Set pieces", "Full Practices"];
export const DRILL_CAT_ICON = {
  "Playing from back": Shield, "Transitions to the middle third": ArrowRight, "Possession in the middle third": Repeat,
  "Transitions to the final third": Zap, "Possession in the final third": Target, "Switching the point of attack": Shuffle,
  "Crossing": CornerDownRight, "Finishing": Crosshair, "Passing patterns": Footprints, "Passing patterns to finish": Goal,
  "Warm up games": Flame, "Pressing when losing the ball": Swords, "Getting into shapes": LayoutGrid,
  "Line of confrontation": ScanLine, "Set pieces": Flag,
  "Technique Drills": Activity, "Staple Drills": Star,
};
// Session phases — suggested tags on the drill form (how Anthony runs practices).
export const DRILL_PHASES = ["Warmup", "Team game", "Small rondo", "Bigger rondo / passing pattern", "Possession game", "Play / structured play", "Finishing pattern", "Passing pattern"];
export const CSV_TEMPLATE = "name,category,calories,protein,carbs,fat,prep\nGreek Yogurt Power Bowl,Breakfast,390,28,45,10,5 min\nGame-Day Pasta,Pre-Game,620,24,98,12,25 min";

export const splitCSVLine = (line) => {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
};
export const parseRecipeCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("name") || first.includes("category") || first.includes("calorie");
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows.map((line) => {
    const c = splitCSVLine(line);
    return { name: c[0] || "", cat: c[1] || "Other", cal: Number(c[2]) || 0, p: Number(c[3]) || 0, c: Number(c[4]) || 0, f: Number(c[5]) || 0, prep: c[6] || "—" };
  }).filter((r) => r.name);
};
export const EVENT_STYLE = {
  Practice: "bg-orange-100 text-orange-700", Game: "bg-red-100 text-red-700",
  Strength: "bg-purple-100 text-purple-700", Recovery: "bg-emerald-100 text-emerald-700",
  Meeting: "bg-blue-100 text-blue-700",
};
export const FEELINGS = ["Sluggish", "OK", "Good", "Energized"];
export const FEELING_COLOR = { Sluggish: "#EF4444", OK: "#F59E0B", Good: "#10B981", Energized: "#0EA5E9" };

/* ──────────────────────────────────────────────
   LOGIN  (Email link / passwordless + Google)
   ────────────────────────────────────────────── */
export const EMAIL_FOR_SIGNIN_KEY = "emailForSignIn";

export const LoginScreen = ({ externalError, clearExternalError, emailLinkPending = false, onCompleteEmailLink }) => {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // Auth-gate errors (e.g. "email not on roster") from useAuth win over
  // local ones; typing clears both.
  const shownErr = externalError || err;

  // Magic link opened on another device/browser: ask for the email inline
  // (the old code used a blocking window.prompt).
  const confirmEmailLink = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) { setErr("Enter the email the link was sent to."); return; }
    setErr(""); setBusy(true);
    try { await onCompleteEmailLink(e); }
    catch (ex) { setErr(prettyAuthError(ex)); }
    finally { setBusy(false); }
  };

  const sendLink = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) { setErr("Enter a valid email."); return; }
    setErr("");
    clearExternalError?.();
    setBusy(true);
    try {
      await sendSignInLinkToEmail(auth, e, {
        url: window.location.origin + "/",
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_FOR_SIGNIN_KEY, e);
      setLinkSent(true);
    } catch (ex) {
      setErr(prettyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr("");
    clearExternalError?.();
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (ex) {
      setErr(prettyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  const bgLayer = (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/brand/login-bg.jpg')" }}
      />
      {/* Soft "spotlight": photo is clearly visible at the edges, gradually
          dims toward center so the form's white text stays readable. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% 50%, ${COLORS.primary}CC 0%, ${COLORS.primary}66 70%, ${COLORS.primary}33 100%)`,
        }}
      />
    </>
  );

  if (linkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        {bgLayer}
        <div className="w-full max-w-sm text-center relative z-10">
          <div className="w-16 h-16 mx-auto flex items-center justify-center mb-5">
            <Mail className="w-10 h-10" style={{ color: "#fff" }} />
          </div>
          <h1 className="text-white font-black text-2xl tracking-tight">Check your email</h1>
          <p className="text-white/80 text-sm mt-3 leading-relaxed">
            We sent a sign-in link to <span className="font-semibold text-white">{email}</span>.<br />
            Tap the link on this device to finish signing in.
          </p>
          <button onClick={() => { setLinkSent(false); setErr(""); }} className="mt-6 text-[11px] font-bold uppercase tracking-wider text-white/70 hover:text-white">
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  if (emailLinkPending) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        {bgLayer}
        <div className="w-full max-w-sm relative z-10 space-y-3">
          <h1 className="text-white font-black text-2xl tracking-tight text-center">Finish signing in</h1>
          <p className="text-white/80 text-sm text-center">Confirm the email address the sign-in link was sent to.</p>
          <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); clearExternalError?.(); }} onKeyDown={(e) => e.key === "Enter" && confirmEmailLink()}
            type="email" placeholder="Email" autoComplete="email" disabled={busy}
            className="w-full bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60" />
          {shownErr && <p className="text-red-300 text-xs font-medium px-1 leading-snug">{shownErr}</p>}
          <button onClick={confirmEmailLink} disabled={busy} className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: COLORS.primary }}>
            {busy ? "Signing in…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {bgLayer}
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <img
            src="/brand/logo-white.png"
            alt="Brophy College Preparatory"
            className="w-28 h-28 mx-auto mb-3 object-contain drop-shadow-lg"
          />
          <h1 className="text-white font-black text-3xl tracking-tight">Welcome</h1>
          <p className="text-white/60 text-xs mt-1.5 font-medium tracking-wide">{APP_DOMAIN}</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); clearExternalError?.(); }} onKeyDown={(e) => e.key === "Enter" && sendLink()}
              type="email" placeholder="Email" autoComplete="email" disabled={busy}
              className="w-full bg-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60" />
          </div>
          {shownErr && <p className="text-red-300 text-xs font-medium px-1 leading-snug">{shownErr}</p>}
          <button onClick={sendLink} disabled={busy} className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: COLORS.primary }}>
            {busy ? "Sending…" : <>Email me a sign-in link <ArrowRight className="w-4 h-4" /></>}
          </button>
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">or</span>
            <div className="flex-1 h-px bg-white/15" />
          </div>
          <button onClick={google} disabled={busy} className="w-full py-3 rounded-xl font-bold text-sm bg-white text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60">
            <span className="text-base font-black" style={{ color: "#4285F4" }}>G</span> Continue with Google
          </button>
          {/iPad|iPhone|iPod/.test(navigator.userAgent) && (
            <p className="text-[11px] text-white/60 text-center leading-snug">On iPhone, if Google shows an error, use <span className="font-bold text-white/80">Email me a sign-in link</span> above.</p>
          )}
        </div>

        <div className="mt-6 bg-white/10 rounded-xl p-3">
          <p className="text-white/70 text-[11px] leading-relaxed">
            <span className="font-bold text-white/90">Players:</span> ask your coach to add your email to the team roster first, then sign in.<br />
            <span className="font-bold text-white/90">Coach:</span> add roster emails from Coach Tools after signing in.
          </p>
        </div>
      </div>
    </div>
  );
};

// ── locked door for accounts with no team-app role ───────────────────────
// A signed-in account whose role is NOT one of the three team roles has no
// team-app access. Today that is the drillBuilder role: those accounts build
// drills in the standalone Drill Library site (brophy-drill-library.web.app)
// and never see team content here. NoAccessScreen renders INSTEAD of the app
// shell (see the lockedOut early return in TeamHubRolesApp); the account
// stays signed in — signing out is their choice via the button below.
// Firestore rules fail closed for these accounts anyway; this is the UX lock.
// (Role list lives in ./lib/teamRoles.js — this file only exports components.)
export const NoAccessScreen = ({ user }) => (
  <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/brand/login-bg.jpg')" }} />
    <div
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse 90% 70% at 50% 50%, ${COLORS.primary}CC 0%, ${COLORS.primary}66 70%, ${COLORS.primary}33 100%)`,
      }}
    />
    <div className="w-full max-w-sm relative z-10 text-center">
      <img
        src="/brand/logo-white.png"
        alt="Brophy College Preparatory"
        className="w-28 h-28 mx-auto mb-3 object-contain drop-shadow-lg"
      />
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/15 flex items-center justify-center">
        <Lock className="w-6 h-6 text-white" />
      </div>
      <h1 className="text-white font-black text-2xl tracking-tight">Drill Library account</h1>
      <p className="text-white/80 text-sm mt-3 leading-relaxed">
        This account is set up for the Brophy Drill Library only, so it
        doesn&rsquo;t have access to the team app.
      </p>
      {user?.email ? (
        <p className="text-white/60 text-xs mt-2 font-medium">Signed in as {user.email}</p>
      ) : null}
      <a
        href="https://brophy-drill-library.web.app"
        className="mt-6 w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 hover:opacity-90"
        style={{ backgroundColor: COLORS.primary }}
      >
        Open the Drill Library <ExternalLink className="w-4 h-4" />
      </a>
      <button
        onClick={() => signOut(auth)}
        className="mt-3 w-full py-3 rounded-xl font-bold text-sm bg-white text-slate-700 hover:bg-slate-50"
      >
        Sign out
      </button>
    </div>
  </div>
);

/* ── shared bits ── */
// Text box that grows with what you type, up to `maxRows` lines (default 5),
// then scrolls inside itself so you can review everything before sending.
// `onSubmit` (chat): Enter sends on a keyboard device, Shift+Enter adds a
// line; on phones (coarse pointer) Enter adds a line and the Send button
// sends. Never sends mid-IME composition.
export const isCoarsePointer = () => {
  try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
};
export const AutoGrowTextarea = ({ value, onChange, onSubmit, minRows = 1, maxRows = 5, className = "", ...rest }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    el.style.height = "auto";
    const max = line * maxRows + pad + border;
    const min = line * minRows + pad + border;
    const next = Math.max(min, Math.min(el.scrollHeight + border, max));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight + border > max ? "auto" : "hidden";
  }, [value, minRows, maxRows]);
  const onKeyDown = (e) => {
    if (onSubmit && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !isCoarsePointer()) {
      e.preventDefault();
      onSubmit();
    }
    rest.onKeyDown?.(e);
  };
  return (
    <textarea ref={ref} rows={minRows} value={value} onChange={onChange} {...rest} onKeyDown={onKeyDown}
      className={`resize-none leading-5 ${className}`} />
  );
};
// Circular profile photo, falling back to initials on a colored tile. Used
// everywhere a person is shown (header, settings, line-up tokens).
export const Avatar = ({ photoURL, initials = "", size = 36, bg = COLORS.primary, color = "white", className = "" }) =>
  photoURL ? (
    <img src={photoURL} alt="" className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <div className={`rounded-full flex items-center justify-center font-bold leading-none ${className}`} style={{ width: size, height: size, backgroundColor: bg, color, fontSize: Math.round(size * 0.36) }}>{initials}</div>
  );

export const Header = ({ title, user, onAvatarClick, onPreview, onRefresh, refreshing = false, stale = false }) => (
  <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <img src="/brand/logo.png" alt="" className="w-9 h-9 object-contain lg:hidden" />
      <div>
        <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 leading-none">BROPHY</div>
        <h1 className="text-base font-bold text-slate-900 leading-tight">{title}</h1>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {stale && (
        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Reconnecting...
        </span>
      )}
      {onRefresh && (
        <button onClick={onRefresh} aria-label="Refresh" title="Refresh" disabled={refreshing} className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-50" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
      {user.role === "admin" && onPreview && (
        <button onClick={onPreview} aria-label="View as player" title="View as player" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
          <Eye className="w-4 h-4" />
        </button>
      )}
      {user.role === "admin" && (
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}>
          <Shield className="w-2.5 h-2.5" /> Admin
        </span>
      )}
      <button onClick={onAvatarClick} aria-label="Open settings" className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center">
        <Avatar photoURL={user.photoURL} initials={user.initials} size={36} />
      </button>
    </div>
  </header>
);

// Team switcher — shown in the app shell when the user can see more than
// one team (a coach of several teams, or the org admin). Players see only
// their own team, so they never get a switcher.
export const TeamSwitcher = ({ teams, activeTeamId, onSelect }) => (
  <div className="flex gap-1.5 px-5 py-2 bg-white border-b border-slate-200 overflow-x-auto lg:hidden">
    {teams.map((t) => {
      const active = t.id === activeTeamId;
      return (
        <button key={t.id} onClick={() => onSelect(t.id)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider" style={{ backgroundColor: active ? COLORS.primary : COLORS.bg, color: active ? "#fff" : COLORS.textSecondary }}>
          {t.shortName}
        </button>
      );
    })}
  </div>
);

export const ReadOnlyHint = ({ label }) => (
  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> {label}</span>
);

/* ─── Wellness readiness verdict ───
   The three wellness numbers share ONE direction: 1 = worst, 5 = ready to go
   (Energy 1 = wiped out, Soreness 1 = very sore, Tiredness 1 = exhausted).
   The verdict is decisive on purpose: average the three; avg >= 4 = Ready,
   avg >= 2.5 = Modified (take it easy), below that = Rest. Any single 1
   forces Rest no matter the average — a 1 anywhere means something is wrong.
   The verdict is stored on the wellness doc at submit time (so the coach
   list and the server can read it without recomputing) and recomputed here
   for display, so older docs without a stored verdict still render. */
export const VERDICTS = {
  Ready: { label: "Ready", color: "#00b27a", bg: "#e6f7ef", hint: "Good to go — full training." },
  Modified: { label: "Modified", color: "#d97706", bg: "#fef3c7", hint: "Take it easy — lighten the load." },
  Rest: { label: "Rest", color: "#dc2626", bg: "#fee2e2", hint: "Rest today — something is off." },
};
export const readinessFor = (w = {}) => {
  const vals = [w.energy, w.soreness, w.tiredness].map((n) => Number(n) || 0);
  if (vals.some((n) => n === 1)) return "Rest";
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 4) return "Ready";
  if (avg >= 2.5) return "Modified";
  return "Rest";
};
// Verdict rank for sorting: Rest and Modified float to the top of the coach list.
export const VERDICT_RANK = { Rest: 0, Modified: 1, Ready: 2 };
// Normalize a wellness doc to the new schema (older docs stored `feeling`
// for energy and no verdict). Cheap backward-compat for reads.
export const normalizeWellness = (w = {}) => {
  const energy = w.energy ?? w.feeling ?? 0;
  const soreness = w.soreness ?? 0;
  const tiredness = w.tiredness ?? 0;
  const norm = { ...w, energy, soreness, tiredness };
  norm.verdict = w.verdict || readinessFor(norm);
  norm.avg = (energy + soreness + tiredness) / 3;
  return norm;
};

export const Scale = ({ value, onChange, lowLabel, highLabel }) => (
  <div>
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className="flex-1 h-8 rounded-lg transition-all" style={{ backgroundColor: value && n <= value ? COLORS.primary : COLORS.bg, border: `1px solid ${COLORS.border}` }} aria-label={`${n}`}>
          <span className="text-xs font-bold" style={{ color: value && n <= value ? "white" : COLORS.textSecondary }}>{n}</span>
        </button>
      ))}
    </div>
    <div className="flex justify-between mt-1"><span className="text-[9px] text-slate-400 font-medium">{lowLabel}</span><span className="text-[9px] text-slate-400 font-medium">{highLabel}</span></div>
  </div>
);
export const LIBRARY_MIME_BY_EXT = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  pages: "application/vnd.apple.pages", key: "application/vnd.apple.keynote", numbers: "application/vnd.apple.numbers",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic",
};

/* ─── PRACTICE: Drill Library (Phase 1) ───────────────────────────────────
   Same structure as the Videos library: category pills + cards + detail modal
   + admin add/edit. Drills are the building blocks coaches assemble into
   practices (Phase 2) and programs (Phase 3). Categories and tags are both
   coach-extensible — type a new one and it shows up as a pill for everyone. */

// Downscale an image client-side before upload (mirrors the chat uploader).
// iPhone photos are HEIC by default, and the Image/canvas path can reject
// on them, so try the bitmap decoder first (it handles HEIC on iOS and
// respects the photo's orientation), then fall back to the Image path.
export const downscaleToBlob = (file, maxDim = 1600, quality = 0.86, type = "image/jpeg") =>
  new Promise((resolve, reject) => {
    let triedImage = false;
    const drawToBlob = (source, w, h, onFail) => {
      try {
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = dw; canvas.height = dh;
        canvas.getContext("2d").drawImage(source, 0, 0, dw, dh);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else if (onFail) onFail();
          else reject(new Error("Could not shrink image"));
        }, type, quality);
      } catch (e) {
        if (onFail) onFail();
        else reject(e);
      }
    };
    const loadViaImage = () => {
      if (triedImage) { reject(new Error("Could not read image")); return; }
      triedImage = true;
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); drawToBlob(img, img.width, img.height, null); };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = URL.createObjectURL(file);
    };
    if (typeof createImageBitmap === "function") {
      createImageBitmap(file, { imageOrientation: "from-image" })
        .then((bmp) => {
          drawToBlob(bmp, bmp.width, bmp.height, () => loadViaImage());
          if (bmp.close) bmp.close();
        })
        .catch(() => loadViaImage());
    } else {
      loadViaImage();
    }
  });

// Upload a face photo: shrink it first when the browser can read it. If the
// shrink step fails (an iPhone HEIC photo can trip the canvas path), upload
// the original file instead so the photo still saves. Returns the upload
// snapshot and the Storage path.
export const uploadFacePhoto = async (pathBase, file, maxDim = 640, quality = 0.85) => {
  let blob = null;
  try { blob = await downscaleToBlob(file, maxDim, quality); } catch { /* fall back to the original file */ }
  if (blob) {
    const path = `${pathBase}.jpg`;
    const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
    return { snap, path };
  }
  const name = file.name || "";
  const dot = name.lastIndexOf(".");
  const rawExt = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const safeExt = /^[a-z0-9]{2,5}$/.test(rawExt) ? `.${rawExt}` : ".jpg";
  const path = `${pathBase}${safeExt}`;
  const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type || "image/jpeg" });
  return { snap, path };
};

// Swipeable, native-scroll photo carousel with dot indicators.
export const PhotoCarousel = ({ photos = [], className = "" }) => {
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  if (!photos.length) return null;
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-slate-900 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none", aspectRatio: "4 / 3" }}>
        {photos.map((src, i) => (
          <img key={i} src={src} alt={`Photo ${i + 1}`} className="w-full h-full flex-shrink-0 snap-center object-cover" loading="lazy" />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {photos.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
};
