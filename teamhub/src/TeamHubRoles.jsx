import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  Home, Calendar as CalendarIcon, Video, Apple, MessageCircle,
  Pin, Clock, MapPin, Plus, X, Trash2, Send, Paperclip,
  Check, Droplet, Flame, Shield, Lock, Play,
  Link as LinkIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Wind, Activity, Dumbbell, Snowflake, StretchHorizontal, FileText,
  Image as ImageIcon, Mail, ArrowRight, Layers, Reply, BarChart3, ScanLine, Camera,
  Bell, BellOff, Pencil, Copy, Download, Printer, Megaphone, Maximize2,
  Users, Tag, Target, Footprints, Repeat, Flag, Zap, ImagePlus, Goal, Hash, Eye,
  ClipboardList, ExternalLink, Star, Shuffle, CornerDownRight, Crosshair, Swords, LayoutGrid, SquareDashed,
  RefreshCw, ArrowUp,
} from "lucide-react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc,
  orderBy, where, query, getDocs, limit,
  serverTimestamp, writeBatch, deleteField,
} from "firebase/firestore";
import { auth, db, storage } from "./firebase";
import { ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

// F33: delete a replaced file from Storage (a path or a download URL). Best
// effort: if it's someone else's file or already gone, nothing happens.
const deleteStorageFile = (pathOrUrl) => {
  if (!pathOrUrl) return;
  try { deleteObject(storageRef(storage, pathOrUrl)).catch(() => {}); } catch { /* bad path */ }
};
import { useAuth } from "./hooks/useAuth";
import { useCollection, useAudienceCollection, useDoc, isLoading } from "./hooks/useCollection";

// Turn a `visibleTo` audience ({ groupIds, uids|emails }) into the flat
// `audienceKeys` array we store on each doc so security rules can enforce
// visibility server-side. Empty audience = everyone (['*']). Groups are
// expanded to their members' keys at write time; re-run when a group's
// membership changes. A custom audience that resolves to nobody yields a
// key that matches no real user (admin-only), never '*'.
const audienceKeyFor = (x) => (String(x).includes("@") ? "email:" + x : "uid:" + x);
const audienceKeysFor = (visibleTo, groupsList = []) => {
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
import { searchFoods, usdaAvailable } from "./lib/usda";
import { loadExercises, exerciseImageUrl } from "./lib/exercises";
import { searchExercises } from "./lib/exerciseSearch";
import { lookupBarcode, searchProducts } from "./lib/openfoodfacts";
import {
  notificationsSupported, currentPermission,
  enablePushNotifications, disablePushOnThisDevice, pushEnabledOnThisDevice, onForegroundMessage, refreshPushToken, isIOS, isStandalone, isChatMuted, mutedLabel, clearChatNotifications, syncAppBadge, NOTIF_CATEGORIES,
} from "./lib/notifications";
import { toast } from "./lib/toast";
import { teamDateKey, teamDateKeyOf, zonedDate } from "./lib/dates";

// Sign out, first removing THIS device's push token so a shared phone stops
// receiving the previous user's notifications.
const signOutUser = async (uid) => {
  try { await disablePushOnThisDevice(uid); } catch { /* offline — still sign out */ }
  await signOut(auth);
};

// Error reporter for fire-and-forget actions (delete, pin, rate…): a failed
// write must never look like it worked. Replaces the old `.catch(() => {})`.
const reportError = (what = "That didn't save") => (e) => {
  console.error(what, e);
  toast(`${what} — ${e?.code === "permission-denied" ? "you don't have permission." : (e?.message || "try again.")}`);
};

// Unique-ish file stamp for upload paths.
const uploadStamp = () => Date.now();

// Batched writes in chunks (Firestore allows at most 500 ops per batch).
const commitInChunks = async (items, apply, size = 450) => {
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db);
    items.slice(i, i + size).forEach((it) => apply(batch, it));
    await batch.commit();
  }
};
import WelcomeTour from "./WelcomeTour";
import {
  newEntry, formatPrescription, groupBySuperset, SUPERSET_LABELS,
  WORKOUT_TEMPLATES, buildTemplateWorkout,
} from "./lib/lifting";
import { recipeSeedDocs } from "./data/recipeSeed";
import { liftSeedDocs } from "./data/liftSeed";
import { workoutSeedDocs, AREA_ORDER } from "./data/workoutSeed";
import { TEAMS, TEAM_IDS, DEFAULT_TEAM_ID, isValidTeamId, teamDocFields, getTeam, getTeamShortName } from "./data/teams";
import { POSITIONS, groupByPosition } from "./data/rosterPositions";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useFirestoreResync, useFirestoreStale } from "./hooks/useFirestoreResync";
import { BUILD_ID } from "./lib/appVersion";
import { UpdateBanner } from "./components/UpdateUI";
import TacticsBoard, { BoardSvg, BoardPlayer } from "./components/TacticsBoard";
import DrillPrintSheet from "./components/DrillPrintSheet";
import PracticePrintSheet from "./components/PracticePrintSheet";
import PracticesPrintSheet from "./components/PracticesPrintSheet";
import GameStatsPage, { LatestGameCard } from "./components/GameStats";
import { normalizeDrillDoc, stripUndefined } from "./lib/drillDoc";
import { isLockedOutRole } from "./lib/teamRoles";
import { ARROW_LEGEND, wavyPath } from "./components/boardData";
import QuoteOfDay from "./components/QuoteOfDay";

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
const prettyAuthError = (e) => {
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
const parseYouTubeStart = (t) => {
  if (!t) return null;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10) || null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) || null;
};
// Embedded players get a sandbox (scripts + same-origin are needed by
// YouTube/Vimeo/Instagram players; no top navigation, no forms).
const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

const toEmbedUrl = (url) => {
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

const formatAgo = (ts) => {
  if (!ts) return "just now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const formatTime = (ts) => {
  if (!ts) return "now";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// HTML time inputs store as "HH:MM" (24-hour). Convert to "h:MM AM/PM".
const formatHourTime = (hhmm) => {
  if (!hhmm) return "";
  const [hStr, mStr] = String(hhmm).split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${(mStr || "00").padStart(2, "0")} ${period}`;
};

// Daily water guide shown in the nutrition hero (cups). There is no
// team-wide calorie/protein target — each player sets their own daily goal
// if they want one (see MyNutritionGoalSection).
const WATER_CUPS_GOAL = 8;

const mealBucket = (ts) => {
  if (!ts) return "Today";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
};

// Consecutive days (counting back from today) with at least one log entry.
const computeStreak = (entries) => {
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
const formatDayKey = (ts) => teamDateKeyOf(ts);

const formatDateHeader = (ts) => {
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
const EMPTY_OBJ = Object.freeze({});

// Staff = anyone who is not a player: team coaches ("admin"), the program
// admin ("orgAdmin") and drill builders. People lists use this so staff are
// never shown or counted as players.
const STAFF_ROLES = new Set(["admin", "orgAdmin", "drillBuilder"]);
const isStaffRole = (role) => STAFF_ROLES.has(role);
const staffLabel = (role) => (role === "orgAdmin" ? "Admin" : role === "drillBuilder" ? "Builder" : role === "admin" ? "Coach" : "Player");

const COLORS = {
  primary: "#980000",     // Brophy Red (site header)
  accent: "#A6192E",      // Brophy red (site --brophy-red variable)
  accentSoft: "#FBECEC",  // pale red backgrounds (derived)
  success: "#00B27A",
  bg: "#FAF4F4",          // subtle red tint so the app doesn't feel generic-white (derived)
  border: "#E2E8F0",
  textSecondary: "#64748B",
};
// Production domain (decided 2026-11-08, §11).
const APP_DOMAIN = "BrophySoccer.forgedreams.ai";
const TOUR_SEEN_KEY = "teamhub_tour_seen_v1";
// Sub-pages of the Train hub (also valid ?tab= deep links).
const TRAIN_VIEWS = ["gym", "nutrition", "videos", "library"];

// Toast host — renders transient messages dispatched via toast(). Rendered once
// at the app root; aria-live so screen readers announce them.
const Toaster = () => {
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
const VIDEO_CATS = ["Film", "Breathing", "Stretching", "Mobility", "Strength", "Cooldown"];
const CAT_ICON = { Film: Video, Breathing: Wind, Stretching: StretchHorizontal, Mobility: Activity, Strength: Dumbbell, Cooldown: Snowflake };

// Drill library categories — Brophy's 18 tactical topics, in session-flow
// order: warm up, technique, passing, staples, possessions, attacking,
// then the rest. Coaches can also add their own from the drill form; those
// show in the filter once a drill uses them, but they are not part of this
// built-in list.
const DRILL_CATS = ["Warm up games", "Technique Drills", "Passing patterns", "Passing patterns to finish", "Staple Drills", "Possession in the middle third", "Possession in the final third", "Transitions to the final third", "Switching the point of attack", "Crossing", "Finishing", "Playing from back", "Transitions to the middle third", "Pressing when losing the ball", "Getting into shapes", "Line of confrontation", "Set pieces", "Full Practices"];
const DRILL_CAT_ICON = {
  "Playing from back": Shield, "Transitions to the middle third": ArrowRight, "Possession in the middle third": Repeat,
  "Transitions to the final third": Zap, "Possession in the final third": Target, "Switching the point of attack": Shuffle,
  "Crossing": CornerDownRight, "Finishing": Crosshair, "Passing patterns": Footprints, "Passing patterns to finish": Goal,
  "Warm up games": Flame, "Pressing when losing the ball": Swords, "Getting into shapes": LayoutGrid,
  "Line of confrontation": ScanLine, "Set pieces": Flag,
  "Technique Drills": Activity, "Staple Drills": Star,
};
// Session phases — suggested tags on the drill form (how Anthony runs practices).
const DRILL_PHASES = ["Warmup", "Team game", "Small rondo", "Bigger rondo / passing pattern", "Possession game", "Play / structured play", "Finishing pattern", "Passing pattern"];
const CSV_TEMPLATE = "name,category,calories,protein,carbs,fat,prep\nGreek Yogurt Power Bowl,Breakfast,390,28,45,10,5 min\nGame-Day Pasta,Pre-Game,620,24,98,12,25 min";

const splitCSVLine = (line) => {
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
const parseRecipeCSV = (text) => {
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
const EVENT_STYLE = {
  Practice: "bg-orange-100 text-orange-700", Game: "bg-red-100 text-red-700",
  Strength: "bg-purple-100 text-purple-700", Recovery: "bg-emerald-100 text-emerald-700",
  Meeting: "bg-blue-100 text-blue-700",
};
const FEELINGS = ["Sluggish", "OK", "Good", "Energized"];
const FEELING_COLOR = { Sluggish: "#EF4444", OK: "#F59E0B", Good: "#10B981", Energized: "#0EA5E9" };

/* ──────────────────────────────────────────────
   LOGIN  (Email link / passwordless + Google)
   ────────────────────────────────────────────── */
const EMAIL_FOR_SIGNIN_KEY = "emailForSignIn";

const LoginScreen = ({ externalError, clearExternalError, emailLinkPending = false, onCompleteEmailLink }) => {
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
const isCoarsePointer = () => {
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
const Avatar = ({ photoURL, initials = "", size = 36, bg = COLORS.primary, color = "white", className = "" }) =>
  photoURL ? (
    <img src={photoURL} alt="" className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <div className={`rounded-full flex items-center justify-center font-bold leading-none ${className}`} style={{ width: size, height: size, backgroundColor: bg, color, fontSize: Math.round(size * 0.36) }}>{initials}</div>
  );

const Header = ({ title, user, onAvatarClick, onPreview, onRefresh, refreshing = false, stale = false }) => (
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
const TeamSwitcher = ({ teams, activeTeamId, onSelect }) => (
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

const ReadOnlyHint = ({ label }) => (
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
const VERDICTS = {
  Ready: { label: "Ready", color: "#00b27a", bg: "#e6f7ef", hint: "Good to go — full training." },
  Modified: { label: "Modified", color: "#d97706", bg: "#fef3c7", hint: "Take it easy — lighten the load." },
  Rest: { label: "Rest", color: "#dc2626", bg: "#fee2e2", hint: "Rest today — something is off." },
};
const readinessFor = (w = {}) => {
  const vals = [w.energy, w.soreness, w.tiredness].map((n) => Number(n) || 0);
  if (vals.some((n) => n === 1)) return "Rest";
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg >= 4) return "Ready";
  if (avg >= 2.5) return "Modified";
  return "Rest";
};
// Verdict rank for sorting: Rest and Modified float to the top of the coach list.
const VERDICT_RANK = { Rest: 0, Modified: 1, Ready: 2 };
// Normalize a wellness doc to the new schema (older docs stored `feeling`
// for energy and no verdict). Cheap backward-compat for reads.
const normalizeWellness = (w = {}) => {
  const energy = w.energy ?? w.feeling ?? 0;
  const soreness = w.soreness ?? 0;
  const tiredness = w.tiredness ?? 0;
  const norm = { ...w, energy, soreness, tiredness };
  norm.verdict = w.verdict || readinessFor(norm);
  norm.avg = (energy + soreness + tiredness) / 3;
  return norm;
};

const Scale = ({ value, onChange, lowLabel, highLabel }) => (
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

/* ─── HOME: team documents + e-sign (coach uploads, everyone signs) ─── */
// File types a coach can attach as a team document. Both MIME types and
// extensions are listed so every browser / OS file picker recognizes them.
const DOC_ACCEPT = [
  "application/pdf", "image/*", "text/plain", ".txt", ".rtf", ".csv",
  ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".pages", ".key", ".numbers", ".odt", ".odp", ".ods",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

// Short type badge (PDF / DOC / PPT / XLS / IMG …) derived from a document's
// filename or MIME type.
const docTypeLabel = (d) => {
  const src = (d.name || d.path || d.title || "").toLowerCase();
  const ext = (src.match(/\.([a-z0-9]+)(?:\?|$)/) || [])[1] || "";
  const ft = (d.fileType || "").toLowerCase();
  const byExt = {
    pdf: "PDF", doc: "DOC", docx: "DOC", rtf: "DOC", txt: "TXT", odt: "DOC", pages: "DOC",
    ppt: "PPT", pptx: "PPT", key: "KEY", odp: "PPT",
    xls: "XLS", xlsx: "XLS", csv: "CSV", numbers: "XLS", ods: "XLS",
    jpg: "IMG", jpeg: "IMG", png: "IMG", gif: "IMG", webp: "IMG", heic: "IMG", heif: "IMG", svg: "IMG",
  };
  if (byExt[ext]) return byExt[ext];
  if (ft.includes("pdf")) return "PDF";
  if (ft.startsWith("image/")) return "IMG";
  if (ft.includes("word")) return "DOC";
  if (ft.includes("presentation") || ft.includes("powerpoint")) return "PPT";
  if (ft.includes("sheet") || ft.includes("excel")) return "XLS";
  return "FILE";
};

// Folder labels for the Coach Tools documents view (grouped by file type).
const DOC_FOLDER_LABELS = {
  PDF: "PDFs", DOC: "Word docs", PPT: "Slides", XLS: "Spreadsheets",
  IMG: "Images", TXT: "Text files", CSV: "Data files", KEY: "Keynotes", FILE: "Other files",
};
const DOC_FOLDER_ORDER = ["PDF", "DOC", "PPT", "XLS", "IMG", "TXT", "CSV", "KEY", "FILE"];

// Upload card shared by the Home documents section and the Coach Tools
// Documents page (same upload flow either way).
const DocumentUploadCard = ({ onUpload }) => {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);
  const doUpload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    try { await onUpload({ title, file: pendingFile }); setTitle(""); setPendingFile(null); }
    catch (e) { toast("Couldn't upload — " + (e.message || "check Storage rules.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2 mb-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title (e.g. Code of Conduct)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
      <input ref={fileRef} type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
      <div className="flex gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 truncate px-2">{pendingFile ? pendingFile.name : "Choose file (PDF, Word, PowerPoint, Excel, image…)"}</button>
        <button onClick={doUpload} disabled={!pendingFile || busy} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
    </div>
  );
};

// One document row — icon + title + signed status, with the coach's
// who-signed view + delete, and the player's sign flow. Carries its own
// expanded state so it works flat (Home) and grouped (Coach Tools folders).
// ─── E-signatures ──────────────────────────────────────────────────────────
// Each signature is its own immutable record: documents/{id}/signatures/{uid}
// (see firestore.rules). It captures the typed legal name, a drawn
// signature, the signer's verified account email, SERVER time, the exact
// consent wording shown, and the SHA-256 of the file that was signed, so a
// signature always proves who agreed to which version, and when. Coaches
// can read (and export) the log but never edit it.
const SIGN_CONSENT_VERSION = "v1-2026-11-21";
const signConsentText = (title) =>
  `I have read "${title}". By typing my name and signing below I agree that this is my electronic signature, `
  + "that it is legally binding to the same extent as a handwritten signature, and that I am signing with my own account.";

// SHA-256 of a File/Blob as hex (Web Crypto). "" when unavailable.
const sha256Hex = async (blob) => {
  try {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
};

// Finger / mouse signature pad. Calls onChange(dataUrl | "") as you draw.
const SignaturePad = ({ onChange }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  useEffect(() => {
    const c = canvasRef.current;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0F172A";
  }, []);
  const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d"); const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d"); const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height);
    hasInk.current = false; onChange("");
  };
  return (
    <div>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="w-full h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50 touch-none" aria-label="Draw your signature" />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-slate-400">Sign with your finger or mouse</span>
        <button type="button" onClick={clear} className="text-[11px] font-semibold text-slate-500">Clear</button>
      </div>
    </div>
  );
};

export const SignDocumentModal = ({ user, d, onSign, onClose }) => {
  const [typedName, setTypedName] = useState(user.name || "");
  const [drawing, setDrawing] = useState("");
  const [agree, setAgree] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const consent = signConsentText(d.title);
  const ready = typedName.trim().length >= 2 && drawing && agree && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await onSign(d, { typedName: typedName.trim(), drawing, consentText: consent });
      toast("Signed. A copy of your signature record is saved.", "success");
      onClose();
    } catch (e) {
      toast("Couldn't sign — " + (e?.code === "permission-denied" ? "the document may have changed; reload and try again." : (e.message || "try again.")));
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-base text-slate-900 leading-tight">Sign: {d.title}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className="flex items-center gap-2 text-sm font-semibold rounded-xl border border-slate-200 px-3 py-2.5" style={{ color: COLORS.primary }}>
          <FileText className="w-4 h-4" /> {opened ? "Opened — read it before signing" : "Open the document to read it"} <ExternalLink className="w-3.5 h-3.5 ml-auto" />
        </a>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full legal name</span>
          <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="First and last name" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        </label>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Signature</span>
          <div className="mt-1"><SignaturePad onChange={setDrawing} /></div>
        </div>
        <label className="flex items-start gap-2 text-[12px] text-slate-600 leading-snug">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>{consent}</span>
        </label>
        <p className="text-[10px] text-slate-400">Signing as {user.email}. The date and time come from the server, and the record is tied to this exact file — it can't be edited afterwards.</p>
        <button onClick={submit} disabled={!ready} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Signing…" : "Agree & Sign"}</button>
      </div>
    </div>
  );
};

// CSV of a document's signature log (coach export).
const downloadSignatureLog = (d, sigs) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const when = (ts) => (ts?.toDate ? ts.toDate().toISOString() : (ts || ""));
  const rows = [["Document", "Typed name", "Account email", "Signed at (UTC)", "File SHA-256", "Consent version", "Drawn signature", "Device"]];
  sigs.forEach((s) => rows.push([d.title, s.typedName || s.name, s.email || "", when(s.signedAt || s.ts), s.sha256 || "", s.consentVersion || "legacy (typed name only)", s.drawing ? "yes" : "no", s.userAgent || ""]));
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(d.title || "document").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document"}-signatures.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
};

const DocumentRow = ({ user, d, isAdmin, rosterCount = 0, onDelete, onSign }) => {
  const [whoOpen, setWhoOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  // Coach: the signature log (private records). Player: only their own.
  const sigDocs = useCollection(isAdmin ? `documents/${d.id}/signatures` : null);
  const mySig = useDoc(!isAdmin ? `documents/${d.id}/signatures/${user.uid}` : null);
  // Legacy typed-name signatures (before the redesign) still count, unless
  // that person has since signed with the new record.
  const legacy = (d.signatures || []).filter((s) => !sigDocs.some((x) => x.id === s.uid));
  const sigs = [...sigDocs, ...legacy];
  const mine = Boolean(mySig) || (d.signatures || []).some((s) => s.uid === user.uid);
  const fmtWhen = (s) => {
    const t = s.signedAt?.toDate ? s.signedAt.toDate() : (s.ts ? new Date(s.ts) : null);
    return t ? t.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  };
  return (
    <li className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 gap-0.5" style={{ backgroundColor: COLORS.accentSoft }}><FileText className="w-3.5 h-3.5" style={{ color: COLORS.accent }} /><span className="text-[7px] font-black leading-none tracking-tight" style={{ color: COLORS.accent }}>{docTypeLabel(d)}</span></div>
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{d.title}</div>
          <div className="text-[10px] text-slate-500">{isAdmin ? `${sigs.length}${rosterCount ? `/${rosterCount}` : ""} signed` : (mine ? `You signed${mySig ? ` · ${fmtWhen(mySig)}` : ""}` : "Tap to read")}</div>
        </a>
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setWhoOpen(!whoOpen)} className="text-[11px] font-semibold" style={{ color: COLORS.primary }}>{whoOpen ? "Hide" : "Who"}</button>
            <button onClick={async () => { if (confirm(`Delete "${d.title}"? Players will no longer see it. Its signature records are kept on file (Firebase console).`)) { try { await onDelete(d.id); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ) : (
          mine
            ? <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0" style={{ color: COLORS.success }}><Check className="w-3.5 h-3.5" /> Signed</span>
            : <button onClick={() => setSignOpen(true)} className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Sign</button>
        )}
      </div>
      {isAdmin && whoOpen && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
          {sigs.length === 0 ? <p className="text-[11px] text-slate-400 italic">No signatures yet.</p> : (
            <ul className="space-y-1.5">{sigs.map((s, i) => (
              <li key={s.id || s.uid || i} className="text-[11px] text-slate-600 flex items-center gap-2">
                <Check className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.success }} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{s.typedName || s.name}</span>
                  {s.email ? <span className="text-slate-400"> · {s.email}</span> : null}
                  <span className="block text-[10px] text-slate-400">{fmtWhen(s)}{s.consentVersion ? "" : " · legacy (typed name only)"}</span>
                </span>
                {s.drawing && <img src={s.drawing} alt={`Signature of ${s.typedName}`} className="h-8 w-20 object-contain bg-slate-50 rounded border border-slate-100" />}
              </li>
            ))}</ul>
          )}
          {sigs.length > 0 && <button onClick={() => downloadSignatureLog(d, sigs)} className="text-[11px] font-bold" style={{ color: COLORS.primary }}>Download signature log (CSV)</button>}
        </div>
      )}
      {!isAdmin && signOpen && !mine && <SignDocumentModal user={user} d={d} onSign={onSign} onClose={() => setSignOpen(false)} />}
    </li>
  );
};

const DocumentsSection = ({ user, documents, isAdmin, rosterCount = 0, onUpload, onDelete, onSign, defaultCollapsed = false, groupByType = false, hideHeader = false }) => {
  const [open, setOpen] = useState(!defaultCollapsed || hideHeader);
  const [closedFolders, setClosedFolders] = useState({});
  // Folder grouping (Coach Tools view): by file type, in a fixed order.
  const grouped = useMemo(() => {
    const map = {};
    (documents || []).forEach((d) => {
      const k = docTypeLabel(d);
      (map[k] = map[k] || []).push(d);
    });
    return map;
  }, [documents]);
  const folders = DOC_FOLDER_ORDER.filter((k) => grouped[k]?.length);

  return (
    <section>
      {!hideHeader && (
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Team Documents <span className="text-[11px] font-semibold text-slate-400">· {documents.length}</span></h3>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      )}
      {!open ? null : (<>
      {isAdmin && <DocumentUploadCard onUpload={onUpload} />}
      {isLoading(documents) ? <LoadingNote /> : documents.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{isAdmin ? "No documents yet — upload one for the team to sign." : "No documents to sign right now."}</p>
      ) : groupByType ? (
        <div className="space-y-3">
          {folders.map((k) => (
            <div key={k}>
              <button onClick={() => setClosedFolders((p) => ({ ...p, [k]: !p[k] }))} className="w-full flex items-center justify-between py-1 mb-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{DOC_FOLDER_LABELS[k] || k} <span className="text-slate-400">· {grouped[k].length}</span></h4>
                {closedFolders[k] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
              </button>
              {!closedFolders[k] && (
                <ul className="space-y-2">
                  {grouped[k].map((d) => <DocumentRow key={d.id} user={user} d={d} isAdmin={isAdmin} rosterCount={rosterCount} onDelete={onDelete} onSign={onSign} />)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => <DocumentRow key={d.id} user={user} d={d} isAdmin={isAdmin} rosterCount={rosterCount} onDelete={onDelete} onSign={onSign} />)}
        </ul>
      )}
      </>)}
    </section>
  );
};
/* Assignments were removed in the Home redo (Option A) — coaches no longer assign tasks; the assignments collection is unused. */


/* ─── PLAYER "TODAY" HOME + TRAIN HUB ─── */
// onMinus (optional) adds a "−" button, e.g. to take back a water cup tapped
// by mistake (F15: the row used to be +1 only).
// Shown instead of an "empty" message while a list is still loading (F11):
// the first second after opening a screen used to say "No … yet".
const LoadingNote = () => (
  <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
    <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> Loading…
  </div>
);

const ChecklistRow = ({ done, icon: Icon, label, sub, onClick, accent, onMinus }) => (
  <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center">
    <button onClick={onClick} className="flex-1 min-w-0 p-3.5 flex items-center gap-3 text-left">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: done ? COLORS.success : COLORS.bg, color: done ? "white" : (accent || COLORS.primary) }}>
        {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>{label}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
      {!onMinus && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
    </button>
    {onMinus && (
      <button onClick={onMinus} aria-label="Take one back" className="w-11 h-11 mr-2 rounded-full bg-slate-100 text-slate-600 text-lg font-bold flex items-center justify-center flex-shrink-0">−</button>
    )}
  </div>
);

// The player's home — one hero (today's session) + a short daily checklist with
// completion ticks, a one-line coach note, and documents to sign. Designed to
// answer "what do I do today?" in one screen. The wellness check-in is the
// main daily action here (attendance / practice check-in were removed):
// three quick 1–5 taps (Energy / Soreness / Tiredness, high = ready) and the
// player gets a decisive readiness verdict back.
const PrefToggle = ({ on, onChange, label, sub }) => (
  <button type="button" onClick={() => onChange(!on)} className="w-full flex items-center gap-3 py-2.5 text-left">
    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-slate-900">{label}</span>{sub ? <span className="block text-[11px] text-slate-500 leading-snug">{sub}</span> : null}</span>
    <span className={`w-11 h-6 rounded-full p-0.5 transition flex-shrink-0 ${on ? "" : "bg-slate-300"}`} style={on ? { backgroundColor: COLORS.primary } : undefined}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </span>
  </button>
);

// WhatsApp-style notification settings (Settings → Notifications): which
// kinds of pushes this person wants, message previews, and muted chats.
// Saved on users/{uid}.notifPrefs; the server reads the same fields.
const NotificationPrefs = ({ user }) => {
  const prefs = user.notifPrefs || {};
  const set = async (field, value) => {
    try { await updateDoc(doc(db, "users", user.uid), { [`notifPrefs.${field}`]: value }); } catch (e) { toast("Couldn't save — " + (e?.message || "")); }
  };
  const mutedChats = Object.entries(prefs.muted || {}).filter(([k]) => isChatMuted(prefs, k));
  const chatName = (k) => (k.startsWith("team_") ? `${getTeamShortName(k.slice(5))} chat` : k.startsWith("dm_") ? "Direct messages" : "Group chat");
  return (
    <div className="bg-slate-50 rounded-2xl px-4 py-2 mt-2">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-2">Notify me about</div>
      <div className="divide-y divide-slate-200">
        {NOTIF_CATEGORIES.map(([key, label, sub]) => (
          <PrefToggle key={key} on={prefs[key] !== false} onChange={(v) => set(key, v)} label={label} sub={sub} />
        ))}
        <PrefToggle on={prefs.preview !== false} onChange={(v) => set("preview", v)} label="Show message preview" sub="Off: chat notifications just say “New message”." />
      </div>
      {mutedChats.length > 0 && (
        <>
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 pt-3">Muted chats</div>
          {mutedChats.map(([k, until]) => (
            <div key={k} className="flex items-center gap-2 py-2">
              <BellOff className="w-4 h-4 text-slate-400" />
              <span className="flex-1 text-sm text-slate-800">{chatName(k)} <span className="text-[11px] text-slate-500">· {mutedLabel(until)}</span></span>
              <button onClick={() => set(`muted.${k}`, deleteField())} className="text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>Unmute</button>
            </div>
          ))}
        </>
      )}
      <p className="text-[10px] text-slate-400 py-2">Coach notifications sent to you directly always come through. Mute a chat with the bell at the top of it.</p>
    </div>
  );
};

// "Turn on notifications" card (Home, players and coaches). Hidden once push
// is on for this device. On an iPhone that isn't running the Home Screen
// app, explains that step first — iOS only allows web push from there.
const PushPrompt = ({ user }) => {
  const [perm, setPerm] = useState(() => (pushEnabledOnThisDevice() ? "granted" : currentPermission() === "denied" ? "denied" : "default"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem("pushPromptHidden") === "1"; } catch { return false; } });
  if (perm === "granted" || hidden) return null;
  const iosNeedsInstall = isIOS() && !isStandalone();
  if (!iosNeedsInstall && !notificationsSupported()) return null;
  const enable = async () => {
    setErr(""); setBusy(true);
    try { await enablePushNotifications(user.uid); setPerm("granted"); toast("Notifications on for this phone.", "success"); } catch (e) { setErr(e.message || "Couldn't enable notifications."); } finally { setBusy(false); }
  };
  const hide = () => { setHidden(true); try { sessionStorage.setItem("pushPromptHidden", "1"); } catch { /* private mode */ } };
  return (
    <section className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>
          <Bell className="w-4 h-4" style={{ color: COLORS.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-900">Turn on notifications</div>
          <div className="text-[11px] text-slate-500 leading-snug">
            {iosNeedsInstall
              ? "On iPhone, add the app to your Home Screen first, then open it from that icon."
              : perm === "denied"
                ? "Blocked on this phone. Allow notifications for this site in your settings, then reopen the app."
                : "Chat, game reports, schedule changes and reminders — right away."}
          </div>
          {err && <div className="text-[11px] text-red-500 font-medium mt-0.5">{err}</div>}
        </div>
        {!iosNeedsInstall && perm !== "denied" && (
          <button onClick={enable} disabled={busy} className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
            {busy ? "…" : "Turn on"}
          </button>
        )}
        <button onClick={hide} aria-label="Not now" className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
      </div>
      {iosNeedsInstall && (
        <ol className="mt-2 ml-12 text-[11px] text-slate-600 leading-relaxed list-decimal pl-4">
          <li>Tap the <b>Share</b> button in Safari (square with an arrow).</li>
          <li>Choose <b>Add to Home Screen</b>.</li>
          <li>Open Brophy Soccer from the new icon, come back here and tap <b>Turn on</b>.</li>
        </ol>
      )}
    </section>
  );
};

const PlayerTodayPage = ({ user, events = [], announcements = [], checkin, setCheckin, submitWellness, wellnessLoggedToday, myWellness = null, loggedToday, waterCups = 0, setWaterCups, documents = [], signDocument, onOpenTrain, onOpenSchedule, practices = [], activeTeamId, todayQuote, addQuote, nutritionTarget, nutritionTotals = { cal: 0, protein: 0 }, profilePrompt, onOpenProfile, onUploadPhoto }) => {
  const promptTs = profilePrompt?.requestedAt;
  const [profileDismissed, setProfileDismissed] = useState(() => { try { return localStorage.getItem("profilePromptSeen") === promptTs; } catch { return false; } });
  const showProfilePrompt = promptTs && !profileDismissed;
  const dismissProfile = () => { try { localStorage.setItem("profilePromptSeen", promptTs); } catch { /* ignore */ } setProfileDismissed(true); };
  // Face-photo nudge: players only, until a photo exists. Dismiss hides it
  // for this visit only (plain state, no localStorage), so it comes back on
  // the next visit until the player adds a photo.
  const [photoDismissed, setPhotoDismissed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoAdded, setPhotoAdded] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const photoInputRef = useRef(null);
  const showPhotoNudge = user.role === "player" && !user.photoURL && !photoAdded && !photoDismissed;
  const handlePhotoFile = async (file) => {
    if (!file || !onUploadPhoto) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try { const url = await onUploadPhoto(file); if (url) setPhotoAdded(url); }
    catch (e) { setPhotoErr(e.message || "Couldn't add photo. Try again."); }
    finally { setPhotoBusy(false); }
  };
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const todayStr = teamDateKey();
  const todays = events.filter((e) => e.date === todayStr).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const hero = todays[0];
  const upcoming = !hero ? [...events].filter((e) => e.date > todayStr).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] : null;
  const sortedAnnouncements = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const WATER_GOAL = 8;
  const setMetric = (k, v) => { setCheckin({ ...checkin, [k]: v }); setSaved(false); };
  const submit = async () => {
    if (!checkin.energy || !checkin.soreness || !checkin.tiredness) return;
    try { await submitWellness(checkin); setSaved(true); setTimeout(() => setWellnessOpen(false), 800); }
    catch (e) { toast("Couldn't submit — " + (e.message || "")); }
  };
  // The player's own verdict for today (from their submitted doc, if any).
  const myVerdict = myWellness ? (myWellness.verdict || readinessFor(myWellness)) : null;
  const myVerdictStyle = myVerdict ? VERDICTS[myVerdict] : null;
  const firstName = (user.name || "").split(" ")[0];
  const teamName = getTeam(activeTeamId).name;
  const heroPlan = hero?.practiceId ? practices.find((p) => p.id === hero.practiceId) : null;

  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">Hey,<br /><span style={{ color: COLORS.primary }}>{firstName}.</span></h2>
        <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{teamName}</span>
      </div>

      {showPhotoNudge && (
        <div className="rounded-2xl p-3.5 shadow-sm" style={{ backgroundColor: COLORS.accentSoft, border: `1px solid ${COLORS.accent}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accent }}>
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900">Add your face photo</div>
              <div className="text-[11px] text-slate-600">So your coach can put you on the game day roster.</div>
            </div>
            <button onClick={() => photoInputRef.current?.click()} disabled={photoBusy} className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{photoBusy ? "Adding..." : "Add photo"}</button>
            <button onClick={() => setPhotoDismissed(true)} className="text-slate-400 flex-shrink-0" aria-label="Dismiss"><X className="w-4 h-4" /></button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handlePhotoFile(f); }} />
          </div>
          {photoErr && <p className="text-xs text-red-600 leading-snug mt-2">{photoErr}</p>}
        </div>
      )}

      {showProfilePrompt && (
        <div className="rounded-2xl p-3.5 shadow-sm flex items-center gap-3" style={{ backgroundColor: COLORS.accentSoft, border: `1px solid ${COLORS.accent}` }}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">Update your info</div>
            <div className="text-[11px] text-slate-600">Your coach asked everyone to confirm their name.</div>
          </div>
          <button onClick={() => { onOpenProfile?.(); dismissProfile(); }} className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Update now</button>
          <button onClick={dismissProfile} className="text-slate-400 flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* HERO — today's session */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Today</h3>
        {hero ? (
          <button onClick={onOpenSchedule} className="w-full text-left rounded-3xl p-5 shadow-sm" style={{ backgroundColor: COLORS.primary }}>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }}>{hero.type || "Session"}</span>
            <h4 className="text-xl font-bold text-white mt-2 leading-tight">{hero.title}</h4>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-white/80">
              {hero.start && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatHourTime(hero.start)}{hero.end ? `–${formatHourTime(hero.end)}` : ""}</span>}
              {hero.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{hero.location}</span>}
            </div>
            {heroPlan && <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "white" }}><ClipboardList className="w-3.5 h-3.5" />{heroPlan.name || "Practice plan"}{(heroPlan.blocks || []).length ? ` · ${(heroPlan.blocks || []).length} drills` : ""}</div>}
          </button>
        ) : (
          <div className="rounded-3xl p-5 border border-dashed border-slate-200 bg-white text-center">
            <p className="text-sm font-semibold text-slate-700">No session today — rest up.</p>
            {upcoming && <p className="text-xs text-slate-500 mt-1">Next: {upcoming.title} · {new Date(upcoming.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>}
          </div>
        )}
      </div>

      {/* WELLNESS CHECK-IN — the main daily action. Three quick 1–5 taps
          (high = ready to go) and a decisive verdict back: Ready / Modified /
          Rest. The coach sees it live on their wellness list. */}
      <div className="rounded-2xl p-4 shadow-sm border" style={{ backgroundColor: wellnessLoggedToday && myVerdictStyle ? myVerdictStyle.bg : "white", borderColor: wellnessLoggedToday && myVerdictStyle ? myVerdictStyle.color : "#e2e8f0" }}>
        <button onClick={() => setWellnessOpen((o) => !o)} className="w-full flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: wellnessLoggedToday && myVerdictStyle ? myVerdictStyle.color : COLORS.accentSoft }}>
            {wellnessLoggedToday ? <Check className="w-5 h-5 text-white" /> : <Activity className="w-5 h-5" style={{ color: COLORS.accent }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">Wellness check-in</div>
            {wellnessLoggedToday && myVerdict ? (
              <div className="text-[11px] text-slate-600">
                <span className="font-bold" style={{ color: myVerdictStyle.color }}>{myVerdict}</span> — {myVerdictStyle.hint} · E{myWellness.energy} S{myWellness.soreness} T{myWellness.tiredness}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">How are you feeling today? Takes 30 seconds.</div>
            )}
          </div>
          {wellnessLoggedToday ? (
            <span className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white border border-slate-200 text-slate-600 flex-shrink-0" onClick={(e) => { e.stopPropagation(); setCheckin({ energy: myWellness?.energy || 0, soreness: myWellness?.soreness || 0, tiredness: myWellness?.tiredness || 0 }); setSaved(false); setWellnessOpen(true); }}>Update</span>
          ) : (
            wellnessOpen ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}
        </button>
        {(!wellnessLoggedToday || wellnessOpen) && (
          <div className="mt-3 space-y-3">
            {saved && <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: COLORS.success }}><Check className="w-3 h-3" /> Sent</span>}
            <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Energy</div><Scale value={checkin.energy} onChange={(v) => setMetric("energy", v)} lowLabel="Wiped out" highLabel="Full tank" /></div>
            <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Soreness</div><Scale value={checkin.soreness} onChange={(v) => setMetric("soreness", v)} lowLabel="Very sore" highLabel="Feeling great" /></div>
            <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Tiredness</div><Scale value={checkin.tiredness} onChange={(v) => setMetric("tiredness", v)} lowLabel="Exhausted" highLabel="Fresh" /></div>
            <button onClick={submit} disabled={!checkin.energy || !checkin.soreness || !checkin.tiredness} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>Log wellness</button>
          </div>
        )}
      </div>

      {/* NEWS — coach announcements, pinned first */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">News</h3>
        {isLoading(announcements) ? <LoadingNote /> : sortedAnnouncements.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No news from your coach yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedAnnouncements.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>{a.pinned ? <Pin className="w-4 h-4" style={{ color: COLORS.accent }} /> : <Bell className="w-4 h-4" style={{ color: COLORS.accent }} />}</div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 leading-tight">{a.title}</div>
                  {a.body && <div className="text-xs text-slate-500 leading-snug mt-0.5">{a.body}</div>}
                  <div className="text-[10px] text-slate-400 font-medium mt-1">{formatAgo(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quote of the day — kept small and unobtrusive below News */}
      <QuoteOfDay quote={todayQuote} isAdmin={false} addQuote={addQuote} colors={COLORS} />

      {/* Documents to sign */}
      <DocumentsSection user={user} documents={documents} isAdmin={false} onSign={signDocument} />

      {/* CHECKLIST — daily habits with completion ticks (secondary, kept low) */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Your day</h3>
        <div className="space-y-2">
          {nutritionTarget && (nutritionTarget.protein > 0 || nutritionTarget.cal > 0) ? (
            <ChecklistRow
              done={nutritionTarget.protein > 0 ? nutritionTotals.protein >= nutritionTarget.protein : nutritionTotals.cal >= nutritionTarget.cal}
              icon={Apple}
              label="Nutrition target"
              sub={[nutritionTarget.protein > 0 ? `Protein ${nutritionTotals.protein}/${nutritionTarget.protein}g` : null, nutritionTarget.cal > 0 ? `${nutritionTotals.cal}/${nutritionTarget.cal} kcal` : null].filter(Boolean).join(" · ")}
              onClick={() => onOpenTrain("nutrition")}
            />
          ) : (
            <ChecklistRow done={loggedToday} icon={Apple} label={loggedToday ? "Meals logged" : "Log your meals"} sub={loggedToday ? "Nice work" : "Open nutrition"} onClick={() => onOpenTrain("nutrition")} />
          )}
          <ChecklistRow done={waterCups >= WATER_GOAL} icon={Droplet} accent="#0ea5e9" label={`Water · ${waterCups}/${WATER_GOAL} cups`} sub={waterCups >= WATER_GOAL ? "Hydrated!" : "Tap to add a cup"} onClick={() => setWaterCups(Math.min(WATER_GOAL, waterCups + 1))} onMinus={waterCups > 0 ? () => setWaterCups(waterCups - 1) : undefined} />
        </div>
      </div>
    </div>
  );
};

const TrainHub = ({ onPick }) => {
  const cards = [
    ["gym", "Workouts", Dumbbell, "Your lifts & exercises"],
    ["nutrition", "Nutrition", Apple, "Meals, recipes & water"],
    ["videos", "Videos", Video, "Film, drills & guides"],
    ["library", "Documents", FileText, "Playbooks, forms & plans"],
  ];
  return (
    <div className="px-5 pt-5 pb-4 space-y-3">
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Train</h3>
      {cards.map(([id, label, Icon, sub]) => (
        <button key={id} onClick={() => onPick(id)} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Icon className="w-6 h-6" style={{ color: COLORS.accent }} /></div>
          <div className="flex-1 min-w-0"><div className="font-bold text-slate-900">{label}</div><div className="text-xs text-slate-500">{sub}</div></div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </button>
      ))}
    </div>
  );
};

/* ─── HOME ─── */
// Coach Home. (Players get PlayerTodayPage — this component is only mounted
// for coaches; see the tab router in TeamHubRolesApp.)
const HomePage = ({ user, practices = [], announcements = [], events = [], wellness = [], wellnessLoading = false, invites = [], mealLogActivityToday = [], groups = [], addGroup, updateGroupMembers, deleteGroup, allUsers = [], pushNotifications = [], addPushNotification, deletePushNotification, sendPushNotificationNow, activeTeamId, todayQuote, addQuote }) => {
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email, u.name])), [allUsers]);
  const uidByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id])), [allUsers]);
  const emailByUid = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.id, u.email])), [allUsers]);
  // Unique players on the team: signed-up players plus invited emails that
  // haven't signed up yet (coaches excluded) — one denominator everywhere.
  const playersTotal = useMemo(() => {
    const keys = new Set();
    (allUsers || []).filter((u) => u.role === "player").forEach((u) => keys.add((u.email || u.id).toLowerCase()));
    (invites || []).filter((i) => i.role !== "admin" && i.role !== "orgAdmin").forEach((i) => keys.add((i.email || i.id).toLowerCase()));
    return keys.size;
  }, [allUsers, invites]);
  const [openPlayer, setOpenPlayer] = useState(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);
  const isAdmin = user.role === "admin";


  // "Now" refreshes every minute so the next-event card doesn't go stale.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const nextEvent = useMemo(() => {
    return [...events]
      .filter((e) => (zonedDate(e.date, e.start || "00:00")?.getTime() ?? 0) >= nowMs)
      .sort((a, b) => ((a.date || "") + (a.start || "")).localeCompare((b.date || "") + (b.start || "")))[0];
  }, [events, nowMs]);

  const sorted = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));


  const avg = (k) => (wellness.length ? wellness.reduce((s, w) => s + w[k], 0) / wellness.length : 0);
  const bars = (value, color) => (
    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: n <= value ? color : COLORS.border }} />)}</div>
  );
  const METRICS = [["energy", "Energy", COLORS.success], ["soreness", "Soreness", COLORS.accent], ["tiredness", "Tiredness", "#8b5cf6"]];

  const greeting = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      <h2 className="text-2xl font-bold text-slate-900 mt-1">Welcome,<br /><span style={{ color: COLORS.primary }}>{(user.name || "Coach").split(" ")[0]}.</span></h2>
      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{getTeam(activeTeamId).name}</span>
    </div>
  );

  // Today first: today's session (with its practice plan + drill count) —
  // otherwise the next upcoming event. This is the big card at the top.
  const todayStr = teamDateKey();
  const todays = [...events].filter((e) => e.date === todayStr).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const hero = todays[0] || null;
  const heroPlan = hero?.practiceId ? practices.find((pl) => pl.id === hero.practiceId) : null;
  const todaySection = (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Today</h3>
      {hero ? (
        <div className="rounded-3xl p-5 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #6E0000)` }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">{hero.type || "Session"}</span>
            <span className="text-xs font-semibold opacity-90">{new Date(hero.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
          <h4 className="text-xl font-bold leading-tight">{hero.title}</h4>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs opacity-90">
            {hero.start && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatHourTime(hero.start)}{hero.end ? `–${formatHourTime(hero.end)}` : ""}</span>}
            {hero.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{hero.location}</span>}
          </div>
          {heroPlan && <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/15"><ClipboardList className="w-3.5 h-3.5" />{heroPlan.name || "Practice plan"}{(heroPlan.blocks || []).length ? ` · ${(heroPlan.blocks || []).length} drills` : ""}</div>}
        </div>
      ) : nextEvent ? (
        <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #6E0000)` }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">Next up</span>
            <span className="text-xs font-semibold opacity-90">{new Date(nextEvent.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
          <h4 className="text-lg font-bold leading-tight">{nextEvent.title}</h4>
          <div className="flex items-center gap-4 mt-2 text-xs opacity-90">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatHourTime(nextEvent.start)}–{formatHourTime(nextEvent.end)}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{nextEvent.location}</span>
          </div>
        </div>
      ) : <p className="text-sm text-slate-400 italic">No upcoming events.</p>}
    </section>
  );

  const announcementsSection = (
    <section>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setAnnOpen(!annOpen)} className="flex items-center gap-1.5">
          <h3 className="text-base font-bold text-slate-900">Announcements <span className="text-[11px] font-semibold text-slate-400">· {announcements.length}</span></h3>
          {annOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      </div>
      {annOpen && (<>
      <ul className="space-y-2.5">
        {sorted.map((a) => (
          <li key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">{a.pinned && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.accent }} />}<h4 className="font-semibold text-slate-900 text-sm">{a.title}</h4></div>
                <p className="text-xs text-slate-500 leading-snug">{a.body}</p><span className="text-[10px] text-slate-400 font-medium">{formatAgo(a.createdAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {isAdmin && <p className="text-[10px] text-slate-400 px-1 pt-2">Post or edit announcements from Coach Tools → Announcements.</p>}
      </>)}
    </section>
  );

  const wellnessSorted = useMemo(
    () => [...wellness].sort((a, b) => (VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]) || ((a.avg || 0) - (b.avg || 0))),
    [wellness],
  );
  const restCount = wellness.filter((w) => w.verdict === "Rest").length;
  const modifiedCount = wellness.filter((w) => w.verdict === "Modified").length;

  const playersSection = (
    <section>
      <h3 className="text-base font-bold text-slate-900 mb-3">Players</h3>
      <button
        onClick={() => setShowPlayers(!showPlayers)}
        className="w-full text-left rounded-2xl p-4 mb-3 border border-slate-100 bg-white shadow-sm hover:bg-slate-50 transition-colors"
        aria-expanded={showPlayers}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm text-slate-900">Team Readiness</h4>
          <span className="text-[10px] text-slate-400 font-medium">{wellness.length} checked in today{restCount > 0 ? ` · ${restCount} rest` : ""}{modifiedCount > 0 ? ` · ${modifiedCount} modified` : ""}</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {METRICS.map(([k, lbl, color]) => (
            <div key={k}>
              <div className="text-lg font-bold text-slate-900">{wellness.length ? avg(k).toFixed(1) : "—"}<span className="text-[10px] text-slate-400 font-medium">/5</span></div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{lbl}</div>
              {bars(Math.round(avg(k)), color)}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: COLORS.primary }}>
            {showPlayers ? "Hide players" : `View ${wellness.length} player${wellness.length === 1 ? "" : "s"}`}
          </span>
          {showPlayers ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {showPlayers && (
      <ul className="space-y-2">
        {wellness.length === 0 && <p className="text-sm text-slate-400 italic">{wellnessLoading ? "Loading check-ins…" : "No check-ins yet today."}</p>}
        {wellnessSorted.map((w) => {
          const vStyle = VERDICTS[w.verdict] || VERDICTS.Modified;
          const open = openPlayer === w.name;
          return (
            <li key={w.name} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <button onClick={() => setOpenPlayer(open ? null : w.name)} className="w-full p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: vStyle.color }}>{w.initials}</div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">{w.name}<span className="text-[8px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: vStyle.color }}>{w.verdict}</span></div>
                  <div className="text-[10px] text-slate-500">Energy {w.energy} · Soreness {w.soreness} · Tired {w.tiredness} · {w.time}</div>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-3">
                  {METRICS.map(([k, lbl, color]) => (
                    <div key={k}><div className="flex justify-between text-[10px] font-semibold text-slate-600 mb-1"><span>{lbl}</span><span>{w[k]}/5</span></div>{bars(w[k], color)}</div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </section>
  );

  const notificationsSection = <PushPrompt user={user} />;

  const groupsSection = (() => {
    if (!isAdmin) return null;
    const createGroup = async () => {
      if (!newGroupName.trim()) return;
      try { await addGroup(newGroupName); setNewGroupName(""); } catch (e) { toast("Couldn't create — " + e.message); }
    };
    const toggleMember = (group, uid) => {
      const set = new Set(group.memberUids || []);
      if (set.has(uid)) set.delete(uid); else set.add(uid);
      // Store the uid once the player has signed in; drop any legacy email
      // key for the same player so membership isn't double-counted.
      const email = emailByUid[uid];
      if (email) set.delete(email);
      updateGroupMembers(group.id, [...set]).catch(reportError("Couldn't update the group"));
    };
    return (
      <section>
        <button onClick={() => setShowGroups(!showGroups)} className="w-full flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Groups · {groups?.length || 0}</h3>
          {showGroups ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showGroups && (
          <div className="space-y-2">
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
              <div className="flex gap-2">
                <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} placeholder="Group name (e.g. Forwards, Captains)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                <button onClick={createGroup} className="py-2 px-3 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Add</button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed px-1">
                Create groups to send events to subsets of the roster — e.g. only Forwards see a position-specific film session. Players see only events addressed to them or to a group they belong to.
              </p>
            </div>

            {(!groups || groups.length === 0) ? (
              <p className="text-sm text-slate-400 italic text-center py-3">No groups yet.</p>
            ) : groups.map((g) => {
              const open = openGroupId === g.id;
              const members = new Set(g.memberUids || []);
              return (
                <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <button onClick={() => setOpenGroupId(open ? null : g.id)} className="w-full p-3 flex items-center justify-between gap-2">
                    <div className="flex-1 text-left">
                      <div className="text-sm font-bold text-slate-900">{g.name}</div>
                      <div className="text-[10px] text-slate-500">{members.size} member{members.size === 1 ? "" : "s"}</div>
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {open && (
                    <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                      {(invites || []).length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">Add roster players first, then come back to assign them.</p>
                      ) : (
                        <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                          {invites.map((inv) => {
                            // Use email as id for ones without a uid; here we don't know uid for not-yet-signed-in players.
                            // We'll fall back to the doc id (email) — works for filter once player signs in and uid is known.
                            // Better future: resolve email→uid via users collection.
                            // uid when the player has signed in (preferred),
                            // else the invite email until they do.
                            const uid = uidByEmail[(inv.email || "").toLowerCase()];
                            const memberKey = uid || inv.email;
                            const isMember = members.has(memberKey) || members.has(inv.email);
                            return (
                              <li key={inv.id} className="flex items-center gap-2 py-1.5">
                                <button onClick={() => toggleMember(g, memberKey)} className="flex-1 text-left text-xs font-mono text-slate-700 truncate">{inv.email}</button>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${isMember ? "text-white" : "text-slate-500 bg-slate-100"}`} style={isMember ? { backgroundColor: COLORS.success } : {}}>{isMember ? "In" : "Out"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <button onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteGroup(g.id).catch(reportError("Couldn't delete the group")); }} className="w-full py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 border border-red-100 rounded-full">Delete group</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  })();

  const nutritionComplianceSection = (() => {
    if (!isAdmin) return null;
    const loggedUids = new Set(mealLogActivityToday.map((a) => a.uid));
    const rosterEmails = playersTotal;
    const loggedCount = loggedUids.size;
    const pct = rosterEmails ? Math.round((loggedCount / rosterEmails) * 100) : 0;
    return (
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-slate-900">Nutrition Today</h3>
          <span className="text-[10px] text-slate-400 font-medium">{loggedCount} / {rosterEmails} logged</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS.success }} />
        </div>
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
          {loggedCount === 0
            ? "Nobody on the roster has logged a meal today yet."
            : loggedCount === rosterEmails
            ? "Everyone's logged at least one meal today. 🎯"
            : `${rosterEmails - loggedCount} player${rosterEmails - loggedCount === 1 ? "" : "s"} haven't logged anything yet today.`}
        </p>
      </section>
    );
  })();


  // Custom push notifications — the coach's way to reach the team directly
  // (send now, schedule, or set a recurring reminder). The full composer
  // lives in PushNotificationModal; this is just the entry point.
  const queuedPushCount = (pushNotifications || []).filter((n) => n.status === "scheduled").length;
  const pushSection = (
    <section>
      <button
        onClick={() => setPushModalOpen(true)}
        className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>
          <Bell className="w-5 h-5" style={{ color: COLORS.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900">Send notification</div>
          <div className="text-[11px] text-slate-500">{queuedPushCount > 0 ? `${queuedPushCount} scheduled · tap to compose or manage` : "Push a message to the team, a group, or specific players"}</div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
      </button>
    </section>
  );

  // Compact at-a-glance dashboard so the coach gets the key numbers without
  // scrolling; the full management sections sit collapsed below.
  const readyCount = wellness.length - restCount - modifiedCount;
  const dashStats = [
    ["Ready", wellness.length ? readyCount : "—", wellness.length ? `/${wellness.length}` : ""],
    ["Logged", wellness.length, `/${playersTotal}`],
    ["Meals", new Set(mealLogActivityToday.map((a) => a.uid)).size, `/${playersTotal}`],
    ["Players", playersTotal, ""],
  ];
  const coachDashboard = (
    <div className="grid grid-cols-2 gap-2">
      {dashStats.map(([label, value, sub]) => (
        <div key={label} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
          <div className="text-xl font-bold text-slate-900">{value}<span className="text-[10px] text-slate-400 font-medium ml-0.5">{sub}</span></div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );

  // Sessions this coach has been delegated to run (assigned on the calendar),
  // surfaced with the head coach's plan + notes so they know what to deliver.
  const todayKey = teamDateKey();
  const myRuns = (events || [])
    .filter((e) => e.runByUid === user.uid && (e.date || "") >= todayKey)
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))
    .slice(0, 3);
  const youRunningSection = myRuns.length ? (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: COLORS.primary }}>You're running</h3>
      {myRuns.map((e) => {
        const plan = e.practiceId ? practices.find((pl) => pl.id === e.practiceId) : null;
        return (
          <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 border-l-4" style={{ borderLeftColor: COLORS.primary }}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{e.type || "Session"}</span>
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" />{formatHourTime(e.start)}–{formatHourTime(e.end)}</span>
              <span className="text-xs text-slate-500">{new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
            <h4 className="font-bold text-slate-900 text-sm">{e.title}</h4>
            {e.location && <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</p>}
            {e.coachNotes && <p className="text-xs text-slate-600 mt-2 bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">{e.coachNotes}</p>}
            {plan && (
              <div className="mt-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Plan · {plan.name || "Practice"}</div>
                <ul className="space-y-1">
                  {(plan.blocks || []).map((b, i) => (
                    <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                      <span className="text-slate-300 font-bold">{i + 1}.</span>
                      <span className="flex-1"><span className="font-semibold">{b.name}</span>{b.dur ? ` · ${b.dur}` : ""}{b.notes ? <span className="text-slate-500"> — {b.notes}</span> : ""}</span>
                    </li>
                  ))}
                  {!(plan.blocks || []).length && <li className="text-xs text-slate-400 italic">No drills in this plan yet.</li>}
                </ul>
              </div>
            )}
            {!plan && e.practiceId && <p className="text-[11px] text-slate-400 mt-2">Plan unavailable.</p>}
          </div>
        );
      })}
    </section>
  ) : null;

  // Coaches only read the team's readiness (playersSection above). They
  // never log wellness themselves, so the check-in card is players only.
  // It stays in the non-admin branch below and in PlayerTodayPage.
  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      {greeting}
      {notificationsSection}
      {todaySection}
      {youRunningSection}{coachDashboard}{playersSection}{announcementsSection}<QuoteOfDay quote={todayQuote} isAdmin={isAdmin} addQuote={addQuote} colors={COLORS} />{pushSection}{groupsSection}{nutritionComplianceSection}
      {pushModalOpen && (
        <PushNotificationModal
          pushNotifications={pushNotifications}
          onAdd={addPushNotification}
          onDelete={deletePushNotification}
          onSendNow={sendPushNotificationNow}
          groups={groups}
          roster={invites}
          nameByEmail={nameByEmail}
          onClose={() => setPushModalOpen(false)}
        />
      )}
    </div>
  );
};

/* ─── CALENDAR ─── */
const EVENT_CSV_TEMPLATE = `date,start,end,title,location,type
2026-08-15,19:30,21:30,vs Opponent,Field 1,Game
2026-09-01,16:30,18:30,@ Yavapai,Yavapai,Game`;

// Local-date helpers (avoids UTC drift from new Date("2026-06-08") parsing).
const parseLocalDate = (yyyyMmDd) => {
  if (!yyyyMmDd) return new Date();
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const fmtLocalDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const startOfWeek = (d) => addDays(d, -((d.getDay() + 7) % 7)); // Sun = 0
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const sameDay = (a, b) => fmtLocalDate(a) === fmtLocalDate(b);

const parseScheduleCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("date") && first.includes("title");
  const rows = hasHeader ? lines.slice(1) : lines;
  const validType = (t) => ["Practice", "Game", "Strength", "Recovery", "Meeting"].includes(t) ? t : "Practice";
  const parsed = rows.map((line) => {
    const c = splitCSVLine(line);
    return {
      date: (c[0] || "").trim(),
      start: (c[1] || "").trim() || "15:00",
      end: (c[2] || "").trim() || "17:00",
      title: (c[3] || "").trim(),
      location: (c[4] || "").trim(),
      type: validType((c[5] || "").trim()),
    };
  });
  const kept = parsed.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title
    && /^\d{1,2}:\d{2}$/.test(r.start) && /^\d{1,2}:\d{2}$/.test(r.end) && r.end > r.start);
  // Rows that were dropped (bad date/time, no title, end before start) are
  // counted so the import message can say so instead of hiding them.
  kept.skipped = parsed.length - kept.length;
  return kept;
};

// Full card for Day/List views.
const EventCard = ({ ev, isAdmin, onEdit, onDelete, onOpen, nameByUid = {}, practices = [], teamWorkouts = [] }) => {
  const canEdit = isAdmin || ev.isPrivate;
  const runByName = ev.runByUid ? nameByUid[ev.runByUid] : "";
  const practice = ev.practiceId ? practices.find((p) => p.id === ev.practiceId) : null;
  const workout = ev.workoutId ? teamWorkouts.find((w) => w.id === ev.workoutId) : null;
  const openable = !!(practice || workout || ev.coachNotes);
  return (
    <li className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onOpen?.(ev)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${EVENT_STYLE[ev.type]}`}>{ev.type}</span>
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" />{formatHourTime(ev.start)}–{formatHourTime(ev.end)}</span>
            {ev.isPrivate && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Private</span>}
            {runByName && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">Run by {runByName}</span>}
          </div>
          <h4 className="font-bold text-slate-900 text-sm">{ev.title}</h4>
          {ev.location && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</p>}
          {(practice || workout) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {practice && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><ClipboardList className="w-3 h-3" />{practice.name || "Practice"} · {(practice.blocks || []).length} drill{(practice.blocks || []).length === 1 ? "" : "s"}</span>}
              {workout && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Dumbbell className="w-3 h-3" />{workout.name || "Workout"} · {(workout.exercises || []).length} exercise{(workout.exercises || []).length === 1 ? "" : "s"}</span>}
            </div>
          )}
          {openable && <div className="text-[10px] font-bold mt-1.5 flex items-center gap-0.5" style={{ color: COLORS.accent }}>Tap to view details <ChevronRight className="w-3 h-3" /></div>}
        </button>
        {canEdit && (
          <div className="flex flex-col gap-1.5">
            <button onClick={onEdit} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
            <button onClick={onDelete} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
    </li>
  );
};

// Read-only event detail: surfaces the attached practice plan (its drills) and/or
// team workout (its exercises with prescriptions) plus the coach's notes, so a
// calendar entry opens into everything it points at.
const EventDetailModal = ({ ev, practices = [], teamWorkouts = [], nameByUid = {}, onClose }) => {
  if (!ev) return null;
  const practice = ev.practiceId ? practices.find((p) => p.id === ev.practiceId) : null;
  const workout = ev.workoutId ? teamWorkouts.find((w) => w.id === ev.workoutId) : null;
  const runByName = ev.runByUid ? nameByUid[ev.runByUid] : "";
  const dateStr = ev.date ? parseLocalDate(ev.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${EVENT_STYLE[ev.type] || "bg-slate-100 text-slate-700"}`}>{ev.type}</span>
            <h3 className="font-bold text-slate-900 text-base truncate">{ev.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {dateStr && <span className="font-semibold text-slate-700">{dateStr}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatHourTime(ev.start)}–{formatHourTime(ev.end)}</span>
            {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
            {runByName && <span className="text-indigo-600 font-semibold">Run by {runByName}</span>}
          </div>

          {ev.coachNotes && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Coach notes</div>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{ev.coachNotes}</p>
            </div>
          )}

          {practice && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Practice plan · {practice.name || "Practice"}</div>
              <ul className="space-y-1.5">
                {(practice.blocks || []).map((b, i) => (
                  <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white mt-0.5" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                    <span className="flex-1"><span className="font-semibold">{b.name}</span>{b.dur ? ` · ${b.dur}` : ""}{b.notes ? <span className="text-slate-500"> — {b.notes}</span> : ""}</span>
                  </li>
                ))}
                {!(practice.blocks || []).length && <li className="text-xs text-slate-400 italic">No drills in this plan yet.</li>}
              </ul>
            </div>
          )}
          {ev.practiceId && !practice && <p className="text-xs text-slate-400 italic">Practice plan unavailable.</p>}

          {workout && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1"><Dumbbell className="w-3 h-3" /> Workout · {workout.name || "Workout"}</div>
              <ul className="space-y-1.5">
                {(workout.exercises || []).map((ex, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-semibold text-slate-800 leading-tight">{ex.name}</div>
                    <div className="text-[11px] text-slate-500">{formatPrescription(ex)}</div>
                  </li>
                ))}
                {!(workout.exercises || []).length && <li className="text-xs text-slate-400 italic">No exercises in this workout yet.</li>}
              </ul>
            </div>
          )}
          {ev.workoutId && !workout && <p className="text-xs text-slate-400 italic">Workout unavailable.</p>}
        </div>
      </div>
    </div>
  );
};

// Modal that lets the coach create groups, name them, and add players by
// picking from the signed-in user roster (uid) or invited-only emails.
const GroupsModal = ({ groups, allUsers, invites, onClose, addGroup, updateGroupMembers, deleteGroup }) => {
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [showInvitedFallback, setShowInvitedFallback] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    if (!newName.trim()) return;
    try { await addGroup(newName); setNewName(""); setErr(""); }
    catch (e) { setErr("Couldn't create — " + (e.message || "")); }
  };

  const toggleMember = (group, key) => {
    const set = new Set(group.memberUids || []);
    if (set.has(key)) set.delete(key); else set.add(key);
    updateGroupMembers(group.id, [...set]).catch((e) => setErr("Couldn't update — " + (e.message || "")));
  };

  // Players already signed in (have uids). Plus optionally those still
  // invited-only (key by email until they sign in once).
  const signedInEmails = new Set(allUsers.map((u) => (u.email || "").toLowerCase()).filter(Boolean));
  const invitedOnly = (invites || []).filter((i) => !signedInEmails.has((i.email || "").toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-base text-slate-900">Groups · {groups.length}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Group name (e.g. Forwards, Captains)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={create} className="px-3 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Add</button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Create a group, then pick members below. When you add a calendar event with custom visibility, you can address it to whole groups instead of clicking everyone individually.
            </p>
            {err && <p className="text-[10px] text-red-500 font-semibold">{err}</p>}
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-3">No groups yet.</p>
          ) : groups.map((g) => {
            const open = openId === g.id;
            const memberSet = new Set(g.memberUids || []);
            const memberCount = memberSet.size;
            return (
              <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <button onClick={() => setOpenId(open ? null : g.id)} className="w-full p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-slate-900">{g.name}</div>
                    <div className="text-[10px] text-slate-500">{memberCount} member{memberCount === 1 ? "" : "s"}</div>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {open && (
                  <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                    {allUsers.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No signed-in players yet. They'll appear here after first login.</p>
                    ) : (
                      <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {allUsers.map((p) => {
                          const on = memberSet.has(p.id);
                          return (
                            <li key={p.id} className="flex items-center gap-2 py-1.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: p.role === "admin" ? COLORS.primary : "#94a3b8" }}>{p.initials || (p.name || "?")[0]}</div>
                              <button onClick={() => toggleMember(g, p.id)} className="flex-1 text-left min-w-0">
                                <div className="text-xs font-semibold text-slate-900 truncate">{p.name || p.email}</div>
                                <div className="text-[10px] text-slate-500 truncate font-mono">{p.email}</div>
                              </button>
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0 ${on ? "text-white" : "text-slate-500 bg-slate-100"}`} style={on ? { backgroundColor: COLORS.success } : {}}>{on ? "In" : "Out"}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {invitedOnly.length > 0 && (
                      <details open={showInvitedFallback} onToggle={(e) => setShowInvitedFallback(e.currentTarget.open)} className="bg-slate-50 rounded-lg p-2">
                        <summary className="text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer px-1">+ Add invited-only players ({invitedOnly.length})</summary>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1 px-1">Players who haven't signed in yet are keyed by email. The app matches their uid once they sign in.</p>
                        <ul className="mt-2 max-h-40 overflow-y-auto divide-y divide-slate-100">
                          {invitedOnly.map((inv) => {
                            const on = memberSet.has(inv.email);
                            return (
                              <li key={inv.id} className="flex items-center gap-2 py-1.5">
                                <button onClick={() => toggleMember(g, inv.email)} className="flex-1 text-left text-[11px] font-mono text-slate-700 truncate">{inv.email}</button>
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${on ? "text-white" : "text-slate-500 bg-slate-100"}`} style={on ? { backgroundColor: COLORS.success } : {}}>{on ? "In" : "Out"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}

                    <button onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteGroup(g.id).catch(reportError("Couldn't delete the group")); }} className="w-full py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 border border-red-100 rounded-full">Delete group</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Lead-time presets (minutes before the event) + a readable label.
const LEAD_PRESETS = [15, 30, 60, 120, 180, 360, 1440, 2880];
const leadText = (min) => {
  const m = Math.round(Number(min) || 0);
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d > 1 ? "s" : ""} before`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h > 1 ? "s" : ""} before`; }
  return `${m} min before`;
};
const rrid = () => Math.random().toString(36).slice(2, 8);

// Coach-only: attach EXTRA auto reminders to an event, each firing a custom
// amount of time before it starts. Stored on the event; a Cloud Function turns
// them into scheduled sends. Every team event ALSO gets two automatic pings
// (1 hour before kickoff + 7:00 AM on the day, America/Phoenix), added
// server-side — those are not listed here. (No RSVP: the old event-attached
// "Who's making it?" poll was dropped for Brophy.)
const EventRemindersEditor = ({ reminders = [], setReminders }) => {
  const add = () => setReminders([...reminders, { id: rrid(), type: "reminder", offsetMin: 60 }]);
  const upd = (i, patch) => setReminders(reminders.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const del = (i) => setReminders(reminders.filter((_, j) => j !== i));
  const unitOf = (m) => (m % 1440 === 0 ? "day" : m % 60 === 0 ? "hour" : "min");
  const FACTOR = { min: 1, hour: 60, day: 1440 };
  return (
    <div className="bg-slate-50 rounded-lg p-2 space-y-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-1">
        Extra reminders <span className="font-medium normal-case tracking-normal text-slate-400">— the team is already pinged 1 hour before and at 7 AM on the day; add more here if you want</span>
      </div>
      {reminders.map((r, i) => {
        const isPreset = LEAD_PRESETS.includes(Number(r.offsetMin));
        const unit = unitOf(Number(r.offsetMin) || 0);
        const num = Math.max(1, Math.round((Number(r.offsetMin) || 0) / FACTOR[unit]));
        return (
          <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>🔔 Reminder</span>
              <div className="flex-1" />
              <button onClick={() => del(i)} aria-label="Remove reminder" className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
            <select
              value={isPreset ? String(r.offsetMin) : "custom"}
              onChange={(e) => { const v = e.target.value; upd(i, { offsetMin: v === "custom" ? 90 : Number(v) }); }}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
            >
              {LEAD_PRESETS.map((m) => <option key={m} value={String(m)}>{leadText(m)}</option>)}
              <option value="custom">Custom…</option>
            </select>
            {!isPreset && (
              <div className="flex items-center gap-1.5">
                <input type="number" min="1" value={num} onChange={(e) => upd(i, { offsetMin: Math.max(1, Number(e.target.value) || 1) * FACTOR[unit] })} className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                <select value={unit} onChange={(e) => upd(i, { offsetMin: num * FACTOR[e.target.value] })} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                  <option value="min">minutes</option><option value="hour">hours</option><option value="day">days</option>
                </select>
                <span className="text-[11px] text-slate-400">before</span>
              </div>
            )}
          </div>
        );
      })}
      <button onClick={add} className="text-[11px] font-bold flex items-center gap-1" style={{ color: COLORS.primary }}><Plus className="w-3 h-3" /> Add reminder</button>
    </div>
  );
};

const CalendarPage = ({ user, events, personalEvents = [], addEvent, updateEvent, addPersonalEvent, updatePersonalEvent, deleteEvent, deletePersonalEvent, importEvents, groups = [], addGroup, updateGroupMembers, deleteGroup, invites = [], allUsers = [], practices = [], teamWorkouts = [] }) => {
  const [detailEvent, setDetailEvent] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null); // { id, isPrivate } | null
  const [addMode, setAddMode] = useState("team"); // "team" | "personal"
  const [visibility, setVisibility] = useState({ mode: "everyone", groupIds: [], uids: [] });
  const [importing, setImporting] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [silentImport, setSilentImport] = useState(true);
  const [view, setView] = useState("list"); // month | week | day | list
  const [cursor, setCursor] = useState(new Date());
  const todayStr = teamDateKey();
  const blank = { title: "", date: todayStr, start: "15:00", end: "17:00", location: "", type: "Practice", runByUid: "", practiceId: "", workoutId: "", coachNotes: "", reminders: [] };
  const [form, setForm] = useState(blank);
  const isAdmin = user.role === "admin";
  // Coaches a session can be delegated to, and a uid→name lookup for badges.
  const coaches = useMemo(() => (allUsers || []).filter((u) => u.role === "admin"), [allUsers]);
  const nameByUid = useMemo(() => Object.fromEntries((allUsers || []).map((u) => [u.id, u.name || u.email || ""])), [allUsers]);

  // Merge team events + personal events (with isPrivate flag) for rendering.
  const allEvents = useMemo(() => [
    ...events,
    ...personalEvents.map((p) => ({ ...p, isPrivate: true })),
  ], [events, personalEvents]);

  const eventsByDate = useMemo(() => {
    const map = {};
    allEvents.forEach((e) => {
      if (!e.date) return;
      (map[e.date] = map[e.date] || []).push(e);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.start || "").localeCompare(b.start || "")));
    return map;
  }, [allEvents]);

  const doImport = async () => {
    setImportMsg("");
    const rows = parseScheduleCSV(csvText);
    if (!rows.length) { setImportMsg("No valid rows — needs date,start,end,title,location,type."); return; }
    try {
      await importEvents(rows, { notify: !silentImport });
      setImportMsg(`Imported ${rows.length} event${rows.length === 1 ? "" : "s"}.${rows.skipped ? ` Skipped ${rows.skipped} row${rows.skipped === 1 ? "" : "s"} with a bad date, time or title.` : ""}`);
      setCsvText("");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check rules?"));
    }
  };
  const add = async () => {
    if (!form.title.trim()) { toast("Give the event a title."); return; }
    if (form.start && form.end && form.end <= form.start) {
      toast("End time must be after the start time."); return;
    }
    try {
      const data = { ...form, title: form.title.trim(), location: form.location.trim() };
      if (addMode === "personal") {
        // Personal events never carry delegation or auto-reminder fields.
        delete data.runByUid; delete data.practiceId; delete data.workoutId; delete data.coachNotes;
        delete data.reminders; delete data.startAt;
        if (editingEvent && editingEvent.isPrivate) await updatePersonalEvent(editingEvent.id, data);
        else {
          await addPersonalEvent(data);
          // Switched a team event to personal while editing: move it.
          if (editingEvent && !editingEvent.isPrivate) await deleteEvent(editingEvent.id);
        }
      } else {
        // Delegation: which coach runs this session + the plan/workout/notes.
        data.runByUid = form.runByUid || null;
        data.runByName = form.runByUid ? (coaches.find((c) => c.id === form.runByUid)?.name || "") : (user.name || "Coach");
        data.practiceId = form.practiceId || null;
        data.workoutId = form.workoutId || null;
        data.workoutName = form.workoutId ? (teamWorkouts.find((w) => w.id === form.workoutId)?.name || "") : "";
        data.coachNotes = (form.coachNotes || "").trim() || null;
        // Auto reminders: store a cleaned list + the absolute start instant
        // (local → Timestamp) so a Cloud Function can fire them before kickoff.
        // The two automatic pings (1 hour before + 7 AM on the day) are added
        // server-side — the list below is only the coach's extra reminders.
        data.reminders = (form.reminders || []).map((r) => ({
          id: r.id || rrid(),
          type: "reminder",
          offsetMin: Math.max(1, Math.round(Number(r.offsetMin) || 0)),
        }));
        // Team time (America/Phoenix), not the coach's device timezone.
        data.startAt = zonedDate(form.date, form.start);
        if (isAdmin && visibility.mode === "custom" && !visibility.groupIds.length && !visibility.uids.length) {
          toast("Pick at least one group or player, or choose Everyone."); return;
        }
        if (isAdmin && visibility.mode === "custom" && (visibility.groupIds.length || visibility.uids.length)) {
          data.visibleTo = { groupIds: visibility.groupIds, uids: visibility.uids };
        } else if (editingEvent) {
          // Clear visibility when editing back to "Everyone"
          data.visibleTo = null;
        }
        if (editingEvent && !editingEvent.isPrivate) await updateEvent(editingEvent.id, data);
        else {
          await addEvent(data);
          // Switched a personal event to team while editing: move it.
          if (editingEvent && editingEvent.isPrivate) await deletePersonalEvent(editingEvent.id);
        }
      }
      setForm(blank);
      setVisibility({ mode: "everyone", groupIds: [], uids: [] });
      setEditingEvent(null);
      setAdding(false);
    } catch (e) {
      toast("Couldn't save event — " + (e.message || "check Firestore rules."));
    }
  };
  const startEditEvent = (ev) => {
    setEditingEvent({ id: ev.id, isPrivate: !!ev.isPrivate });
    setForm({
      title: ev.title || "",
      date: ev.date || todayStr,
      start: ev.start || "15:00",
      end: ev.end || "17:00",
      location: ev.location || "",
      type: ev.type || "Practice",
      runByUid: ev.runByUid || "",
      practiceId: ev.practiceId || "",
      workoutId: ev.workoutId || "",
      coachNotes: ev.coachNotes || "",
      reminders: ev.reminders || [],
    });
    setAddMode(ev.isPrivate ? "personal" : "team");
    if (ev.visibleTo && (ev.visibleTo.groupIds?.length || ev.visibleTo.uids?.length || ev.visibleTo.emails?.length)) {
      setVisibility({
        mode: "custom",
        groupIds: ev.visibleTo.groupIds || [],
        uids: ev.visibleTo.uids || ev.visibleTo.emails || [],
      });
    } else {
      setVisibility({ mode: "everyone", groupIds: [], uids: [] });
    }
    setAdding(true);
  };
  const cancelEditEvent = () => {
    setEditingEvent(null);
    setForm(blank);
    setVisibility({ mode: "everyone", groupIds: [], uids: [] });
    setAdding(false);
  };
  const del = (ev) => {
    if (!confirm(`Delete "${ev.title || "this event"}"?${ev.isPrivate ? "" : " Players will no longer see it."}`)) return;
    if (ev.isPrivate) deletePersonalEvent(ev.id).catch(reportError("Couldn't delete the event"));
    else deleteEvent(ev.id).catch(reportError("Couldn't delete the event"));
  };

  // ── View navigation ───────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === "month") return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${s.toLocaleDateString("en-US", { month: "short" })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
        : `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
    }
    if (view === "day") return cursor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    return "All Upcoming";
  }, [view, cursor]);

  const nav = (dir) => {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (view === "week") setCursor(addDays(cursor, 7 * dir));
    else if (view === "day") setCursor(addDays(cursor, dir));
  };

  // ── View renderers ────────────────────────────────────────────────────
  const renderMonth = () => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const start = startOfWeek(first);
    const cells = [];
    let d = new Date(start);
    while (d <= last || d.getDay() !== 0) {
      cells.push(new Date(d));
      d = addDays(d, 1);
      if (cells.length >= 42) break;
    }
    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {dayNames.map((d, i) => <div key={i} className="text-center text-[10px] font-black uppercase tracking-wider text-slate-500 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDay(d, new Date());
            const dayEvents = eventsByDate[fmtLocalDate(d)] || [];
            return (
              <button key={i} onClick={() => { setCursor(d); setView("day"); }} className={`min-h-[64px] p-1 border-b border-r border-slate-100 text-left ${inMonth ? "bg-white" : "bg-slate-50"} ${i % 7 === 6 ? "border-r-0" : ""} hover:bg-slate-50`}>
                <div className={`text-[10px] font-bold ${isToday ? "text-white rounded-full w-5 h-5 flex items-center justify-center" : inMonth ? "text-slate-700" : "text-slate-400"}`} style={isToday ? { backgroundColor: COLORS.primary } : {}}>{d.getDate()}</div>
                <div className="space-y-0.5 mt-0.5">
                  {dayEvents.slice(0, 2).map((ev) => (
                    <div key={ev.id} className={`rounded px-1 py-0.5 text-[8px] font-semibold leading-tight truncate ${EVENT_STYLE[ev.type] || "bg-slate-100 text-slate-700"} ${ev.isPrivate ? "ring-1 ring-slate-400 ring-inset" : ""}`}>
                      {ev.isPrivate && "🔒"}{ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <div className="text-[8px] text-slate-400 font-semibold px-1">+{dayEvents.length - 2}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <div className="space-y-2">
        {days.map((d) => {
          const evs = eventsByDate[fmtLocalDate(d)] || [];
          const isToday = sameDay(d, new Date());
          return (
            <div key={fmtLocalDate(d)} className={`bg-white rounded-2xl p-3 shadow-sm border ${isToday ? "border-slate-300" : "border-slate-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className={`text-base font-black ${isToday ? "" : "text-slate-900"}`} style={isToday ? { color: COLORS.primary } : {}}>{d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}</span>
                  {isToday && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: COLORS.primary, color: "white" }}>Today</span>}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{evs.length} event{evs.length === 1 ? "" : "s"}</span>
              </div>
              {evs.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Nothing scheduled.</p>
              ) : (
                <div className="space-y-1">
                  {evs.map((ev) => (
                    <button key={ev.id} onClick={() => setDetailEvent(ev)} className="w-full flex items-center gap-2 text-[11px] text-left hover:bg-slate-50 rounded px-1 -mx-1 py-0.5">
                      <span className="font-semibold text-slate-700 w-12 flex-shrink-0">{formatHourTime(ev.start)}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${EVENT_STYLE[ev.type] || "bg-slate-100 text-slate-700"} flex-shrink-0`}>{ev.type[0]}</span>
                      <span className="font-semibold text-slate-900 truncate flex-1">{ev.isPrivate && "🔒 "}{ev.title}</span>
                      {(ev.practiceId || ev.workoutId) && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const evs = eventsByDate[fmtLocalDate(cursor)] || [];
    return evs.length === 0 ? (
      <p className="text-sm text-slate-400 italic text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-100">Nothing scheduled for this day.</p>
    ) : (
      <ul className="space-y-2">
        {evs.map((ev) => <EventCard key={ev.id} ev={ev} isAdmin={isAdmin} nameByUid={nameByUid} practices={practices} teamWorkouts={teamWorkouts} onOpen={setDetailEvent} onEdit={() => startEditEvent(ev)} onDelete={() => del(ev)} />)}
      </ul>
    );
  };

  const renderList = () => {
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const upcoming = allEvents
      .filter((e) => parseLocalDate(e.date) >= today0)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const grouped = upcoming.reduce((acc, e) => ((acc[e.date] = acc[e.date] || []).push(e), acc), {});
    if (!upcoming.length) return <p className="text-sm text-slate-400 italic text-center py-12 bg-white rounded-2xl shadow-sm border border-slate-100">No upcoming events.</p>;
    return Object.entries(grouped).map(([date, evs]) => (
      <div key={date}>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{parseLocalDate(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h4>
        <ul className="space-y-2">
          {evs.map((ev) => <EventCard key={ev.id} ev={ev} isAdmin={isAdmin} nameByUid={nameByUid} practices={practices} teamWorkouts={teamWorkouts} onOpen={setDetailEvent} onEdit={() => startEditEvent(ev)} onDelete={() => del(ev)} />)}
        </ul>
      </div>
    ));
  };

  return (
    <div className="px-5 pt-5 pb-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Schedule</h3>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setGroupsOpen(true)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>Groups</button>
          )}
          {isAdmin && (
            <button onClick={() => { setImporting(!importing); setImportMsg(""); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>Import</button>
          )}
          <button onClick={() => { setAdding(!adding); setAddMode(isAdmin ? "team" : "personal"); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}>
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      {groupsOpen && <GroupsModal groups={groups} allUsers={allUsers} invites={invites} onClose={() => setGroupsOpen(false)} addGroup={addGroup} updateGroupMembers={updateGroupMembers} deleteGroup={deleteGroup} />}

      {/* View switcher */}
      <div className="bg-white rounded-full p-1 flex border border-slate-100 shadow-sm">
        {[["month", "Month"], ["week", "Week"], ["day", "Day"], ["list", "Upcoming"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setView(k)} className={`flex-1 text-[11px] font-semibold py-1.5 rounded-full ${view === k ? "text-white" : "text-slate-500"}`} style={view === k ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
        ))}
      </div>

      {/* Nav row (Day/Week/Month) */}
      {view !== "list" && (
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => nav(-1)} aria-label="Previous" className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center"><ChevronLeft className="w-4 h-4 text-slate-600" /></button>
          <div className="flex-1 text-center text-sm font-bold text-slate-900">{navLabel}</div>
          <button onClick={() => setCursor(new Date())} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-slate-600 border border-slate-200">Today</button>
          <button onClick={() => nav(1)} aria-label="Next" className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center"><ChevronRight className="w-4 h-4 text-slate-600" /></button>
        </div>
      )}

      {/* Import panel (admin) */}
      {isAdmin && importing && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">Paste a schedule CSV — one event per line.</div>
          <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setImportMsg(""); }} rows={8} placeholder={EVENT_CSV_TEMPLATE} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2">
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result)); r.readAsText(f); }} />
            </label>
            <button onClick={() => setCsvText(EVENT_CSV_TEMPLATE)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Fill Example</button>
            <button onClick={doImport} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Import</button>
          </div>
          {importMsg && <p className="text-[10px] font-semibold px-1" style={{ color: importMsg.startsWith("Imported") ? COLORS.success : "#dc2626" }}>{importMsg}</p>}
          <label className="flex items-center gap-2 px-1 cursor-pointer">
            <input type="checkbox" checked={silentImport} onChange={(e) => setSilentImport(e.target.checked)} className="w-3.5 h-3.5 accent-slate-700" />
            <span className="text-[11px] font-semibold text-slate-700">Don't ping players (silent import)</span>
          </label>
        </div>
      )}

      {/* Add panel */}
      {adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          {isAdmin && (
            <div className="flex bg-slate-100 rounded-full p-0.5">
              <button onClick={() => setAddMode("team")} className={`flex-1 text-[11px] font-bold py-1.5 rounded-full ${addMode === "team" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Team-wide</button>
              <button onClick={() => setAddMode("personal")} className={`flex-1 text-[11px] font-bold py-1.5 rounded-full ${addMode === "personal" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>Personal (only me)</button>
            </div>
          )}
          {!isAdmin && (
            <p className="text-[10px] text-slate-400 leading-relaxed px-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Personal event — only you can see this.</p>
          )}
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">{Object.keys(EVENT_STYLE).map((t) => <option key={t}>{t}</option>)}</select>
            <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />

          {isAdmin && addMode === "team" && (
            <div className="bg-slate-50 rounded-lg p-2 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-1">Visible to</div>
              <div className="flex bg-white rounded-full p-0.5 border border-slate-200">
                <button onClick={() => setVisibility({ ...visibility, mode: "everyone" })} className={`flex-1 text-[10px] font-bold py-1.5 rounded-full ${visibility.mode === "everyone" ? "text-white" : "text-slate-500"}`} style={visibility.mode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
                <button onClick={() => setVisibility({ ...visibility, mode: "custom" })} className={`flex-1 text-[10px] font-bold py-1.5 rounded-full ${visibility.mode === "custom" ? "text-white" : "text-slate-500"}`} style={visibility.mode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Custom</button>
              </div>
              {visibility.mode === "custom" && (
                <div className="space-y-2">
                  {groups.length > 0 && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 px-1">Groups</div>
                      <div className="flex flex-wrap gap-1">
                        {groups.map((g) => {
                          const on = visibility.groupIds.includes(g.id);
                          return (
                            <button key={g.id} onClick={() => setVisibility({ ...visibility, groupIds: on ? visibility.groupIds.filter((x) => x !== g.id) : [...visibility.groupIds, g.id] })} className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {allUsers.length > 0 && (
                    <details className="bg-white rounded-md border border-slate-200 p-1.5">
                      <summary className="text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer px-1">+ Specific players ({visibility.uids.length})</summary>
                      <ul className="mt-2 max-h-40 overflow-y-auto divide-y divide-slate-100">
                        {allUsers.map((p) => {
                          const on = visibility.uids.includes(p.id);
                          return (
                            <li key={p.id}>
                              <button onClick={() => setVisibility({ ...visibility, uids: on ? visibility.uids.filter((x) => x !== p.id) : [...visibility.uids, p.id] })} className="w-full flex items-center justify-between gap-2 py-1.5 px-1">
                                <span className="text-[11px] font-semibold text-slate-700 truncate">{p.name || p.email}</span>
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${on ? "text-white" : "text-slate-500 bg-slate-100"}`} style={on ? { backgroundColor: COLORS.success } : {}}>{on ? "Selected" : "—"}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                  {groups.length === 0 && allUsers.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic px-1">No groups or signed-in players yet. Create a group via the Groups button above, or wait for players to sign in.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {isAdmin && addMode === "team" && (
            <div className="bg-slate-50 rounded-lg p-2 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-1">
                Run by / plan <span className="font-medium normal-case tracking-normal text-slate-400">— optional</span>
              </div>
              <select value={form.runByUid} onChange={(e) => setForm({ ...form, runByUid: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Run by — head coach (default)</option>
                {coaches.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
              </select>
              <select value={form.practiceId} onChange={(e) => setForm({ ...form, practiceId: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">No practice plan attached</option>
                {practices.map((pl) => <option key={pl.id} value={pl.id}>{pl.name || "Untitled practice"}</option>)}
              </select>
              <select value={form.workoutId} onChange={(e) => setForm({ ...form, workoutId: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">No workout attached</option>
                {teamWorkouts.map((w) => <option key={w.id} value={w.id}>{w.name || "Untitled workout"}</option>)}
              </select>
              <AutoGrowTextarea value={form.coachNotes} onChange={(e) => setForm({ ...form, coachNotes: e.target.value })} minRows={2} placeholder="Notes for the coach running this — focus, intensity, reminders…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}

          {isAdmin && addMode === "team" && (
            <EventRemindersEditor reminders={form.reminders} setReminders={(r) => setForm({ ...form, reminders: r })} />
          )}

          <div className="flex gap-2">
            <button onClick={cancelEditEvent} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>{editingEvent ? "Save Changes" : (addMode === "personal" ? "Add to My Calendar" : "Add to Calendar")}</button>
          </div>
        </div>
      )}

      {/* The actual view */}
      {view === "month" && renderMonth()}
      {view === "week" && renderWeek()}
      {view === "day" && renderDay()}
      {view === "list" && <div className="space-y-5">{renderList()}</div>}

      {detailEvent && <EventDetailModal ev={detailEvent} practices={practices} teamWorkouts={teamWorkouts} nameByUid={nameByUid} onClose={() => setDetailEvent(null)} />}
    </div>
  );
};

/* ─── VIDEOS (categorized library, original style) ─── */
const VIDEO_CSV_TEMPLATE = `title,url,cat,dur,diff,desc,type,subfolder
10 Min Breathwork for Athletes,https://www.youtube.com/watch?v=n34DBL-dZNU,Breathing,10 min,Easy,"Focus + flow state breathwork",video,
Soccer Hip Mobility Routine,https://www.youtube.com/watch?v=5NN9SuYO2YU,Mobility,5 min,Easy,"Quick pre-game hip prep",video,`;

const parseVideoCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("title") && first.includes("url");
  const rows = hasHeader ? lines.slice(1) : lines;
  // Any non-empty folder name is kept: a folder that does not exist yet is
  // created automatically on import (same as recipe categories). Blank falls
  // back to Film.
  const validCat = (c) => (c || "").trim() || "Film";
  const validDiff = (d) => ["Easy", "Medium", "Hard"].includes(d) ? d : "Easy";
  const validType = (t) => ["video", "audio", "external"].includes(t) ? t : "video";
  return rows.map((line) => {
    const c = splitCSVLine(line);
    return {
      title: (c[0] || "").trim(),
      url: (c[1] || "").trim(),
      cat: validCat((c[2] || "").trim()),
      dur: (c[3] || "").trim() || "—",
      diff: validDiff((c[4] || "").trim()),
      desc: (c[5] || "").trim(),
      type: validType((c[6] || "video").trim()),
      subfolder: (c[7] || "").trim(),
    };
  }).filter((r) => r.title && r.url);
};

/* ─── DOCUMENTS LIBRARY (Train → Documents, next to Videos) ───────────────
   Coach-shared files and links (playbooks, scouting reports, forms, training
   plans…), filed in folders. Each item is shared with ALL three teams or with
   one team (firestore.rules libraryItems + storage.rules library/). Players
   open/download; coaches add, edit and delete. Different from Coach Center →
   Documents, which is for documents players must SIGN. */
const LIBRARY_FOLDERS = ["Playbook", "Scouting", "Forms", "Training plans", "Nutrition", "Recovery"];
const LIBRARY_MIME_BY_EXT = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  pages: "application/vnd.apple.pages", key: "application/vnd.apple.keynote", numbers: "application/vnd.apple.numbers",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic",
};
const fileSizeLabel = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
const isHttpUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

const LibraryItemForm = ({ initial, activeTeamId, folders, onSave, onClose }) => {
  const editing = Boolean(initial?.id);
  const [kind, setKind] = useState(initial?.kind || "file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(initial?.url && initial?.kind === "link" ? initial.url : "");
  const [title, setTitle] = useState(initial?.title || "");
  const [folder, setFolder] = useState(initial?.folder || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [scope, setScope] = useState(initial?.teamId || "all");
  const [notify, setNotify] = useState(!editing);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    if (!editing && kind === "file" && !file) { setErr("Pick a file to upload."); return; }
    if (kind === "link" && !isHttpUrl(url.trim())) { setErr("Enter a full link starting with https://"); return; }
    if (!editing && kind === "file" && file.size > 50 * 1024 * 1024) { setErr("That file is over 50 MB. Share it as a link (e.g. Google Drive) instead."); return; }
    const t = (title.trim() || file?.name || url.trim()).slice(0, 200);
    try {
      setProgress(0);
      await onSave({ kind, file, url: url.trim(), title: t, folder: folder.trim(), desc: desc.trim(), scope, notify }, setProgress);
      onClose();
    } catch (e) {
      setProgress(null);
      setErr((e?.code === "storage/unauthorized" || e?.code === "permission-denied") ? "You don't have permission to share to that team." : (e?.message || "Couldn't save — try again."));
    }
  };
  const busy = progress !== null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900">{editing ? "Edit document" : "Share a document"}</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-full p-1">
            {[["file", "Upload a file"], ["link", "Share a link"]].map(([k, label]) => (
              <button key={k} onClick={() => setKind(k)} className={`py-1.5 rounded-full text-xs font-bold ${kind === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{label}</button>
            ))}
          </div>
        )}
        {!editing && kind === "file" && (
          <label className="block border border-dashed border-slate-300 rounded-xl px-3 py-4 text-center cursor-pointer">
            <input type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
            {file ? <span className="text-sm font-semibold text-slate-800">{file.name} <span className="text-slate-400 font-normal">· {fileSizeLabel(file.size)}</span></span>
              : <span className="text-sm text-slate-500"><Paperclip className="w-4 h-4 inline mr-1" />PDF, Word, PowerPoint, Excel, images… up to 50 MB</span>}
          </label>
        )}
        {kind === "link" && (
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Set-piece playbook)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <div>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} list="library-folders" placeholder="Folder (pick or type a new one)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="library-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <AutoGrowTextarea value={desc} onChange={(e) => setDesc(e.target.value)} minRows={2} placeholder="Short note for the team (optional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        {!editing && (
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Share with</span>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-full p-1">
              {[["all", "All teams"], [activeTeamId, `${getTeamShortName(activeTeamId)} only`]].map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)} className={`py-1.5 rounded-full text-xs font-bold ${scope === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {!editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify players
          </label>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
        {busy && kind === "file" && !editing && (
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: COLORS.success }} /></div>
        )}
        <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
          {busy ? (kind === "file" && !editing ? `Uploading… ${progress}%` : "Saving…") : editing ? "Save changes" : "Share"}
        </button>
      </div>
    </div>
  );
};

export const LibraryPage = ({ user, items = [], activeTeamId, addItem, updateItem, deleteItem }) => {
  const isAdmin = user.role === "admin";
  const [folder, setFolder] = useState("All");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // null | {} (new) | item (edit)
  const usedFolders = [...new Set(items.map((i) => i.folder).filter(Boolean))];
  const folders = [...new Set([...usedFolders, ...LIBRARY_FOLDERS])];
  const pills = ["All", ...usedFolders.sort((a, b) => a.localeCompare(b))];
  const activeFolder = pills.includes(folder) ? folder : "All";
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (activeFolder === "All" || i.folder === activeFolder)
    && (!needle || [i.title, i.desc, i.folder, i.name].some((v) => (v || "").toLowerCase().includes(needle))));
  const fmtDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString([], { month: "short", day: "numeric" }) : "");
  const remove = (i) => {
    if (!confirm(`Delete "${i.title}"? ${i.teamId === "all" ? "All three teams" : "The team"} will lose it.`)) return;
    Promise.resolve(deleteItem(i.id)).catch(reportError("Couldn't delete the document"));
  };
  return (
    <div className="px-5 pt-3 pb-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Documents</h3>
          <p className="text-xs text-slate-500">Playbooks, scouting, forms and plans from your coaches</p>
        </div>
        {isAdmin && <button onClick={() => setForm({})} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1 flex-shrink-0" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Share</button>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
      {pills.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
          {pills.map((f) => (
            <button key={f} onClick={() => setFolder(f)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: activeFolder === f ? COLORS.primary : "white", color: activeFolder === f ? "#fff" : COLORS.textSecondary, border: `1px solid ${activeFolder === f ? COLORS.primary : COLORS.border}` }}>{f}</button>
          ))}
        </div>
      )}
      {isLoading(items) ? <p className="text-sm text-slate-400 text-center py-8">Loading documents…</p>
        : shown.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{items.length ? "No documents match." : isAdmin ? "Nothing shared yet. Tap Share to add a playbook, form or link." : "Nothing shared yet."}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((i) => {
              const isLink = i.kind === "link";
              const isImg = !isLink && (i.fileType || "").startsWith("image/");
              return (
                <li key={i.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex items-center gap-3">
                  {isImg ? <img src={i.url} alt="" loading="lazy" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 gap-0.5" style={{ backgroundColor: COLORS.accentSoft }}>
                      {isLink ? <LinkIcon className="w-4 h-4" style={{ color: COLORS.accent }} /> : <FileText className="w-4 h-4" style={{ color: COLORS.accent }} />}
                      <span className="text-[7px] font-black leading-none" style={{ color: COLORS.accent }}>{isLink ? "LINK" : docTypeLabel(i)}</span>
                    </div>}
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{i.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {[i.folder, i.teamId === "all" ? "All teams" : getTeamShortName(i.teamId), fileSizeLabel(i.size), fmtDate(i.createdAt)].filter(Boolean).join(" · ")}
                    </div>
                    {i.desc && <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{i.desc}</div>}
                  </a>
                  <a href={i.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${i.title}`} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                    {isLink ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </a>
                  {isAdmin && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => setForm(i)} aria-label={`Edit ${i.title}`} className="text-slate-300 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(i)} aria-label={`Delete ${i.title}`} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      {form && (
        <LibraryItemForm initial={form} activeTeamId={activeTeamId} folders={folders}
          onSave={(data, onProgress) => (form.id ? updateItem(form.id, { title: data.title, folder: data.folder, desc: data.desc, ...(form.kind === "link" ? { url: data.url } : {}) }) : addItem(data, onProgress))}
          onClose={() => setForm(null)} />
      )}
    </div>
  );
};

const VideosPage = ({ user, videos, addVideo, updateVideo, deleteVideo, importVideos, videoFolders = [], addVideoFolder, renameVideoFolder, deleteVideoFolder }) => {
  const [catPref, setCat] = useState("Film");
  const [adding, setAdding] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [modal, setModal] = useState(null);
  const blank = { title: "", url: "", cat: "Film", subfolder: "", dur: "", diff: "Easy", desc: "", type: "video" };
  const [form, setForm] = useState(blank);
  const [subfolder, setSubfolder] = useState("All");
  const isAdmin = user.role === "admin";

  // Folder list: the six built-in folders plus any coach-created top-level
  // folders from Firestore (same union pattern as recipe categories).
  const customCats = useMemo(() => videoFolders.filter((f) => !f.parent).map((f) => f.name).filter(Boolean), [videoFolders]);
  // Any folder name a video is filed under also shows (F54: folders are
  // linked by name, so a video must never be hidden by a missing folder doc).
  const effectiveCats = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...VIDEO_CATS, ...customCats, ...videos.map((v) => v.cat)].forEach((c) => { if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    return out;
  }, [customCats, videos]);
  // If the open folder was deleted elsewhere, fall back to the first folder.
  // If the open folder was deleted elsewhere, fall back to the first folder
  // (derived during render — no state-syncing effect).
  const cat = effectiveCats.includes(catPref) ? catPref : (effectiveCats[0] || catPref);

  // Subfolders in the open folder: coach-created ones plus any typed on a
  // video already (so old videos keep their subfolder pills).
  const customSubs = useMemo(() => videoFolders.filter((f) => f.parent === cat).map((f) => f.name).filter(Boolean), [videoFolders, cat]);
  const subfolders = useMemo(() => {
    const set = new Set();
    videos.filter((v) => v.cat === cat).forEach((v) => v.subfolder && set.add(v.subfolder));
    customSubs.forEach((s) => set.add(s));
    return ["All", ...[...set].sort()];
  }, [videos, cat, customSubs]);

  // The folder the admin is looking at right now, when it is a custom one.
  // Rename and delete act on the open subfolder when one is open, otherwise
  // on the open folder. Built-in folders have no doc, so they cannot be
  // renamed or deleted.
  const activeCatDoc = videoFolders.find((f) => !f.parent && f.name === cat);
  const activeSubDoc = subfolder !== "All" ? videoFolders.find((f) => f.parent === cat && f.name === subfolder) : null;
  const managedFolder = activeSubDoc || activeCatDoc || null;

  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [folderMsg, setFolderMsg] = useState("");
  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setFolderMsg("");
    if (!name) return;
    if (effectiveCats.some((c) => c.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A folder named "${name}" already exists.`); return; }
    try {
      await addVideoFolder(name, null);
      setNewFolderName("");
      setShowNewFolder(false);
      setCat(name);
      setSubfolder("All");
      setFolderMsg(`Folder "${name}" added.`);
    } catch (e) { setFolderMsg("Couldn't add folder. " + (e.message || "Check Firestore rules.")); }
  };
  const submitNewSubfolder = async () => {
    const name = newSubName.trim();
    setFolderMsg("");
    if (!name) return;
    if (subfolders.some((s) => s !== "All" && s.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A subfolder named "${name}" already exists in ${cat}.`); return; }
    try {
      await addVideoFolder(name, cat);
      setNewSubName("");
      setShowNewSub(false);
      setSubfolder(name);
      setFolderMsg(`Subfolder "${name}" added to ${cat}.`);
    } catch (e) { setFolderMsg("Couldn't add subfolder. " + (e.message || "Check Firestore rules.")); }
  };
  const submitRename = async () => {
    if (!managedFolder) return;
    const name = renameName.trim();
    setFolderMsg("");
    if (!name || name === managedFolder.name) { setRenaming(false); return; }
    const siblings = managedFolder.parent ? subfolders.filter((s) => s !== "All") : effectiveCats;
    if (siblings.some((s) => s.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A folder named "${name}" already exists.`); return; }
    try {
      await renameVideoFolder(managedFolder, name);
      if (!managedFolder.parent) setCat(name); else setSubfolder(name);
      setRenaming(false);
      setFolderMsg(`Renamed to "${name}".`);
    } catch (e) { setFolderMsg("Couldn't rename folder. " + (e.message || "Check Firestore rules.")); }
  };
  const deleteManagedFolder = async () => {
    if (!managedFolder) return;
    const inUse = managedFolder.parent
      ? videos.filter((v) => v.cat === managedFolder.parent && v.subfolder === managedFolder.name).length
      : videos.filter((v) => v.cat === managedFolder.name).length;
    const kidCount = !managedFolder.parent ? videoFolders.filter((f) => f.parent === managedFolder.name).length : 0;
    if (inUse > 0) { setFolderMsg(`This folder still has ${inUse} video${inUse === 1 ? "" : "s"}. Move or delete them first.`); return; }
    if (kidCount > 0) { setFolderMsg(`This folder still has ${kidCount} subfolder${kidCount === 1 ? "" : "s"}. Delete them first.`); return; }
    if (!confirm(`Delete the folder "${managedFolder.name}"?`)) return;
    try {
      await deleteVideoFolder(managedFolder.id);
      if (!managedFolder.parent) setCat("Film"); else setSubfolder("All");
      setFolderMsg(`Folder "${managedFolder.name}" deleted.`);
    } catch (e) { setFolderMsg("Couldn't delete folder. " + (e.message || "Check Firestore rules.")); }
  };

  const startEditVideo = (v) => {
    setEditingVideoId(v.id);
    setForm({ title: v.title || "", url: v.url || "", cat: v.cat || "Film", subfolder: v.subfolder || "", dur: v.dur || "", diff: v.diff || "Easy", desc: v.desc || "", type: v.type || "video" });
    setAdding(true);
  };
  const cancelEditVideo = () => { setEditingVideoId(null); setForm(blank); setAdding(false); };

  const doImport = async () => {
    setImportMsg("");
    const rows = parseVideoCSV(csvText);
    if (!rows.length) { setImportMsg("No valid rows. Needs title,url,cat,dur,diff,desc,type,subfolder."); return; }
    // Folders named in the sheet that do not exist yet are created first,
    // same as recipe categories on import.
    const newCats = [...new Set(rows.map((r) => r.cat))].filter((c) => c && !effectiveCats.some((e) => e.toLowerCase() === c.toLowerCase()));
    try {
      // Import the videos first; only then create any new folders, so a failed
      // import never leaves empty folders behind.
      await importVideos(rows);
      for (const c of newCats) await addVideoFolder(c, null);
      setImportMsg(`Imported ${rows.length} video${rows.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new folder${newCats.length === 1 ? "" : "s"}` : ""}.`);
      setCsvText("");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check rules?"));
    }
  };
  const filtered = videos.filter((v) => v.cat === cat && (subfolder === "All" || v.subfolder === subfolder));
  const add = async () => {
    if (!form.title.trim()) return;
    try {
      const data = { ...form, title: form.title.trim(), url: form.url.trim(), desc: form.desc.trim() };
      if (editingVideoId) await updateVideo(editingVideoId, data);
      else await addVideo(data);
      setForm(blank);
      setEditingVideoId(null);
      setAdding(false);
    } catch (e) {
      toast("Couldn't save video — " + (e.message || "check Firestore rules."));
    }
  };
  const del = (id) => {
    if (!confirm("Delete this video from the library? All three teams will lose it.")) return;
    deleteVideo(id).catch(reportError("Couldn't delete the video"));
  };

  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Videos & Links</h3>
        {isAdmin ? (
          <div className="flex gap-2">
            <button onClick={() => { setImporting(!importing); setImportMsg(""); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>Import</button>
            <button onClick={() => setAdding(!adding)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Upload</button>
          </div>
        ) : <ReadOnlyHint label="Coach uploads film & drills" />}
      </div>

      {isAdmin && importing && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">Paste a video CSV — one video per line.</div>
          <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setImportMsg(""); }} rows={8} placeholder={VIDEO_CSV_TEMPLATE} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2">
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result)); r.readAsText(f); }} />
            </label>
            <button onClick={() => setCsvText(VIDEO_CSV_TEMPLATE)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Fill Example</button>
            <button onClick={doImport} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Import</button>
          </div>
          {importMsg && <p className="text-[10px] font-semibold px-1" style={{ color: importMsg.startsWith("Imported") ? COLORS.success : "#dc2626" }}>{importMsg}</p>}
          <p className="text-[10px] text-slate-400 leading-relaxed px-1">
            Columns: <span className="font-mono">title,url,cat,dur,diff,desc,type,subfolder</span>. <span className="font-semibold">cat</span> is a folder name. New folders are created automatically. <span className="font-semibold">subfolder</span> is optional, the name of a subfolder inside that folder, blank for none. <span className="font-semibold">diff</span> Easy/Medium/Hard. <span className="font-semibold">type</span> video/audio/external. Wrap descriptions containing commas in "quotes".
          </p>
        </div></div>
      )}

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="YouTube / Vimeo / link URL" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-3 gap-2">
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{effectiveCats.map((c) => <option key={c}>{c}</option>)}</select>
            <input value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} placeholder="Duration" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <select value={form.diff} onChange={(e) => setForm({ ...form, diff: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{["Easy", "Medium", "Hard"].map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <input list="video-subfolders" value={form.subfolder} onChange={(e) => setForm({ ...form, subfolder: e.target.value })} placeholder="Subfolder (optional, e.g. Opponents 2026)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="video-subfolders">{subfolders.filter((s) => s !== "All").map((s) => <option key={s} value={s} />)}</datalist>
          <input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Short description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2"><button onClick={cancelEditVideo} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>{editingVideoId ? "Save Changes" : "Publish"}</button></div>
        </div></div>
      )}

      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {effectiveCats.map((c) => (
            <button key={c} onClick={() => { setCat(c); setSubfolder("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
          {isAdmin && (
            <button onClick={() => { setShowNewFolder((s) => !s); setFolderMsg(""); }} className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap bg-white text-slate-600 border border-dashed border-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Folder</button>
          )}
        </div>
      </div>

      {isAdmin && showNewFolder && (
        <div className="px-5 flex gap-2">
          <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <button onClick={submitNewFolder} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Add folder</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
        </div>
      )}

      {/* Subfolder pills (only when subfolders exist for this category). Coaches
          always see the New subfolder button, even before the first one. */}
      {(subfolders.length > 1 || isAdmin) && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {subfolders.map((s) => (
              <button key={s} onClick={() => setSubfolder(s)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${subfolder === s ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={subfolder === s ? { backgroundColor: COLORS.accent, color: "#fff" } : {}}>{s}</button>
            ))}
            {isAdmin && (
              <button onClick={() => { setShowNewSub((s) => !s); setFolderMsg(""); }} className="px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-white text-slate-600 border border-dashed border-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Subfolder</button>
            )}
          </div>
        </div>
      )}

      {isAdmin && showNewSub && (
        <div className="px-5 flex gap-2">
          <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder={`New subfolder in ${cat}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <button onClick={submitNewSubfolder} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Add subfolder</button>
          <button onClick={() => { setShowNewSub(false); setNewSubName(""); }} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
        </div>
      )}

      <div className="px-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{cat}{subfolder !== "All" ? ` · ${subfolder}` : ""}</h3>
          {isAdmin && managedFolder && !renaming && (
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => { setRenameName(managedFolder.name); setRenaming(true); setFolderMsg(""); }} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-slate-600 flex items-center gap-1"><Pencil className="w-3 h-3" /> Rename</button>
              <button onClick={deleteManagedFolder} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
            </div>
          )}
        </div>
        {isAdmin && renaming && managedFolder && (
          <div className="flex gap-2 mb-3">
            <input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="Folder name" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={submitRename} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Save</button>
            <button onClick={() => setRenaming(false)} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
          </div>
        )}
        {folderMsg && <p className="text-[11px] font-semibold text-slate-600 mb-3">{folderMsg}</p>}
        {isLoading(videos) ? <LoadingNote /> : filtered.length === 0 ? <p className="text-sm text-slate-400 italic">Nothing here yet.</p> : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((v) => {
              const Icon = CAT_ICON[v.cat] || Video;
              return (
                <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative">
                  <button onClick={() => setModal(v)} className="text-left w-full">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: COLORS.accentSoft }}><Icon className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight pr-4">{v.title}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{v.dur}</span><span className="text-[10px] text-slate-300">·</span>
                      <span className={`text-[10px] font-bold uppercase ${v.diff === "Easy" ? "text-emerald-600" : v.diff === "Medium" ? "text-orange-500" : "text-red-500"}`}>{v.diff}</span>
                    </div>
                    {v.desc && <p className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2">{v.desc}</p>}
                  </button>
                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); startEditVideo(v); }} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); del(v.id); }} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <VideoModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
};

const VideoModal = ({ item, onClose }) => {
  const embedUrl = toEmbedUrl(item.url);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2"><span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{item.cat}</span><h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{item.title}</h3></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {embedUrl ? (
            <div className="aspect-video rounded-2xl bg-slate-900 overflow-hidden">
              <iframe
                src={embedUrl}
                title={item.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                sandbox={EMBED_SANDBOX}
                allowFullScreen
              />
            </div>
          ) : item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="aspect-video rounded-2xl bg-slate-900 flex items-center justify-center relative overflow-hidden block hover:opacity-90">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}><Play className="w-6 h-6 text-white fill-white ml-1" /></div>
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded">Open link ↗</div>
            </a>
          ) : (
            <div className="aspect-video rounded-2xl bg-slate-900 flex items-center justify-center text-white/50 text-xs font-medium">No URL on this video</div>
          )}
          <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
          <div className="flex gap-4 text-xs"><div><div className="text-slate-400 uppercase font-bold tracking-wider">Duration</div><div className="font-bold text-slate-900 mt-1">{item.dur}</div></div><div><div className="text-slate-400 uppercase font-bold tracking-wider">Difficulty</div><div className="font-bold text-slate-900 mt-1">{item.diff}</div></div></div>
        </div>
      </div>
    </div>
  );
};

/* ─── NUTRITION (log presets + custom food + post-meal rating) ─── */
const HeroBar = ({ value, target, color }) => {
  const pct = Math.min(100, target ? (value / target) * 100 : 0);
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
      <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};
const NutritionHero = ({ totals, goal, streak, waterCups, setWaterCups }) => {
  const waterDots = Array.from({ length: WATER_CUPS_GOAL }, (_, i) => i < waterCups);
  return (
    <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #6E0000)` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Today's Fuel</div>
        {streak > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "rgba(166,25,46,0.22)", color: COLORS.accent }}>
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totals.cal.toLocaleString()}</span>
              <span className="text-xs opacity-70">{goal?.cal > 0 ? `/ ${goal.cal.toLocaleString()} kcal` : "kcal"}</span>
            </div>
            {goal?.cal > 0 && <span className="text-[10px] font-semibold opacity-70">{Math.round((totals.cal / goal.cal) * 100)}%</span>}
          </div>
          {goal?.cal > 0 && <HeroBar value={totals.cal} target={goal.cal} color={COLORS.accent} />}
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totals.p}g</span>
              <span className="text-xs opacity-70">{goal?.protein > 0 ? `/ ${goal.protein}g protein` : "protein"}</span>
            </div>
            {goal?.protein > 0 && <span className="text-[10px] font-semibold opacity-70">{Math.round((totals.p / goal.protein) * 100)}%</span>}
          </div>
          {goal?.protein > 0 && <HeroBar value={totals.p} target={goal.protein} color={COLORS.success} />}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">Carbs</div>
            <div className="text-base font-bold">{totals.c}g</div>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">Fat</div>
            <div className="text-base font-bold">{totals.f}g</div>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Droplet className="w-4 h-4 flex-shrink-0" style={{ color: "#7DD3FC" }} fill="#7DD3FC" />
          <div className="flex gap-0.5 flex-shrink-0">
            {waterDots.map((on, i) => (
              <div key={i} className="w-2 h-3 rounded-sm" style={{ backgroundColor: on ? "#7DD3FC" : "rgba(255,255,255,0.18)" }} />
            ))}
          </div>
          <span className="text-xs font-semibold ml-2">{waterCups} / {WATER_CUPS_GOAL}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setWaterCups(Math.max(0, waterCups - 1))} disabled={waterCups === 0} aria-label="One less cup" className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-sm font-bold disabled:opacity-30">−</button>
          <button onClick={() => setWaterCups(waterCups + 1)} aria-label="Add a cup" className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: COLORS.accent, color: "#fff" }}>+</button>
        </div>
      </div>
    </div>
  );
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
const downscaleToBlob = (file, maxDim = 1600, quality = 0.86, type = "image/jpeg") =>
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
const uploadFacePhoto = async (pathBase, file, maxDim = 640, quality = 0.85) => {
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
const PhotoCarousel = ({ photos = [], className = "" }) => {
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

// Uniform drill diagram: Brophy logo watermark at exactly 20% opacity behind the
// drill's diagram photo (or behind the category icon tile when no diagram yet).
const DrillDiagram = ({ d, icon: Icon, className = "" }) => (
  <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className}`}>
    <img src="/brand/logo.png" alt="" aria-hidden="true" draggable="false"
      className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none select-none"
      style={{ opacity: 0.2 }} />
    {d.diagramImage ? (
      <img src={d.diagramImage} alt="Drill diagram" className="relative w-full h-full object-cover" loading="lazy" />
    ) : d.diagramData ? (
      <BoardSvg state={d.diagramData} className="relative w-full h-full" />
    ) : d.diagram ? (
      <img src={d.diagram} alt="Drill diagram" className="relative w-full h-full object-cover" loading="lazy" />
    ) : (
      <div className="relative w-full h-full flex items-center justify-center">
        {Icon ? <Icon className="w-8 h-8 text-white/90" /> : null}
      </div>
    )}
  </div>
);

// The fixed 5-arrow board legend, shown under any drill diagram drawn on the
// board (the same legend is also baked into the exported board PNG).
const ArrowLegendChips = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1">
    {ARROW_LEGEND.map((a) => (
      <span key={a.id} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
          {a.id === "dribble"
            ? <path d={wavyPath(1, 5, 23, 5, 2.5, 8)} fill="none" stroke="#D97706" strokeWidth={1.8} />
            : a.id === "shot"
              ? <g><line x1="1" y1="3" x2="23" y2="3" stroke="#D97706" strokeWidth={1.4} /><line x1="1" y1="7" x2="23" y2="7" stroke="#D97706" strokeWidth={1.4} /></g>
              : <line x1="1" y1="5" x2="23" y2="5" stroke="#D97706" strokeWidth={2} strokeDasharray={a.id === "run" ? "4 3" : undefined} />}
        </svg>
        {a.label}
      </span>
    ))}
  </div>
);

// Full uniform drill card: clear title → diagram (Brophy watermark) → setup
// block → How to run it → Look for. Empty sections are hidden.
export const DrillModal = ({ item, onClose }) => {
  const [printOpen, setPrintOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const embedUrl = item.videoUrl ? toEmbedUrl(item.videoUrl) : null;
  const Icon = DRILL_CAT_ICON[item.cat] || Target;
  const title = item.title || item.name;
  const hasAnimation = Boolean(item.diagramData?.animation?.steps?.length);
  const setup = item.setup || {};
  const gridLabel = setup.lengthYd && setup.widthYd ? `${setup.lengthYd} × ${setup.widthYd} yd` : setup.grid;
  const equipList = Array.isArray(setup.equipment) ? setup.equipment.join(", ") : (setup.equipment || item.equipment);
  const setupRows = [
    ["Grid", gridLabel],
    ["Teams", setup.teams],
    ["Players", item.players],
    ["Duration", item.dur],
    ["Cones", setup.cones],
    ["Balls", setup.balls],
    ["Goals", setup.goals],
    ["Mannequins", setup.mannequins],
    ["Equipment", equipList],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "" && String(v).trim());
  const howTo = item.howTo || item.desc || "";
  const objectives = (item.objectives || [])
    .map((o) => String(o).replace(/^General:\s*/i, "").trim())
    .filter(Boolean);
  const infoStr = typeof item.info === "string" ? item.info : "";
  const source = infoStr.startsWith("Source: ") ? infoStr.slice(8) : "";
  const coachNotes = infoStr && !infoStr.startsWith("Source: ") ? infoStr : "";
  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full rounded-t-3xl" style={{ backgroundColor: COLORS.primary }} />
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{item.cat}</span>
              {item.playerTag && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.playerTag}</span>}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{title}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasAnimation && (
              <button
                onClick={(e) => { e.stopPropagation(); setPlayOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full text-white min-h-11"
                style={{ backgroundColor: COLORS.primary }}
                title="Play the saved animation"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Play animation
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setPrintOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white border border-slate-200 text-slate-700 min-h-11"
              title="Print / Save PDF"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <DrillDiagram d={item} icon={Icon} className="w-full aspect-[4/3]" />
          {item.diagramData && <ArrowLegendChips />}
          {setupRows.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Setup</h4>
              <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 border border-slate-100">
                {setupRows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                    <span className="text-xs font-semibold text-slate-800 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {howTo && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">How to run it</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{howTo}</p>
            </div>
          )}
          {objectives.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Look for</h4>
              <ul className="space-y-1.5">
                {objectives.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.accent }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {coachNotes && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Coach notes</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{coachNotes}</p>
            </div>
          )}
          {item.photos?.length > 0 && <PhotoCarousel photos={item.photos} />}
          {embedUrl && (
            <div className="aspect-video rounded-2xl bg-slate-900 overflow-hidden">
              <iframe src={embedUrl} title={title} className="w-full h-full" sandbox={EMBED_SANDBOX} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            </div>
          )}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {item.tags.map((t) => <span key={t} className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">#{t}</span>)}
            </div>
          )}
          {source && <p className="text-[10px] text-slate-400">Source: {source}</p>}
        </div>
      </div>
    </div>
    {printOpen && <DrillPrintSheet drill={item} onClose={() => setPrintOpen(false)} />}
    {playOpen && <BoardPlayer state={item.diagramData} title={title} onClose={() => setPlayOpen(false)} />}
    </>
  );
};

const DrillsPage = ({ user, drills, addDrill, updateDrill, deleteDrill, startCreating = false }) => {
  const isAdmin = user.role === "admin";
  const blank = { name: "", title: "", kind: "drill", cat: DRILL_CATS[0], tags: "", dur: "", players: "", equipment: "", setupLengthYd: "", setupWidthYd: "", setupCones: "", setupBalls: "", setupGoals: "", setupMannequins: "", setupTeams: "", howTo: "", objectives: "", desc: "", info: "", videoUrl: "", photos: [], diagram: "", diagramData: null, diagramImage: "", scenario: "", cues: "" };
  const [cat, setCat] = useState("All");
  const [tag, setTag] = useState("All");
  const [adding, setAdding] = useState(startCreating);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  // F33: pictures uploaded while editing this drill. On save, any that ended
  // up unused (replaced before saving) are deleted; on cancel, all of them.
  // Pictures already saved on a drill are never deleted here (a duplicated
  // drill can share them).
  const sessionUploads = useRef(new Set());
  const cleanupUploads = (keep = new Set()) => {
    for (const u of sessionUploads.current) if (!keep.has(u)) deleteStorageFile(u);
    sessionUploads.current = new Set();
  };

  // Save the tactics board: rasterize to a PNG diagram (so it renders anywhere a
  // drill diagram shows) and keep the editable JSON so it can be reopened.
  // Drawing a board replaces a video setup photo (photo-first rule).
  const saveBoard = async (pngBlob, state) => {
    setBoardOpen(false);
    // The board's yard dimensions are the drill's setup dimensions.
    setForm((p) => ({ ...p, diagramData: state, diagramImage: "", setupLengthYd: state?.lengthYd ?? p.setupLengthYd, setupWidthYd: state?.widthYd ?? p.setupWidthYd }));
    if (!pngBlob) return;
    setUploading(true);
    try {
      const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const r = storageRef(storage, path);
      const snap = await uploadBytes(r, pngBlob, { contentType: "image/png" });
      const url = await getDownloadURL(snap.ref);
      sessionUploads.current.add(url);
      setForm((p) => ({ ...p, diagram: url }));
    } catch (e) {
      toast("Couldn't save board image — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };

  // Categories = the defaults plus anything a coach has already typed (old coaching-point items are hidden).
  const cats = useMemo(() => {
    const set = new Set(DRILL_CATS);
    drills.filter((d) => (d.kind || "drill") !== "point").forEach((d) => d.cat && set.add(d.cat));
    return [...set];
  }, [drills]);
  // Tag pills are scoped to the active category (all drills when viewing All).
  const tags = useMemo(() => {
    const set = new Set();
    drills.filter((d) => cat === "All" || d.cat === cat).forEach((d) => (d.tags || []).forEach((t) => set.add(t)));
    return ["All", ...[...set].sort()];
  }, [drills, cat]);
  const filtered = drills.filter((d) => (d.kind || "drill") !== "point" && (cat === "All" || d.cat === cat) && (tag === "All" || (d.tags || []).includes(tag)));

  const uploadImage = async (file) => {
    const blob = await downscaleToBlob(file);
    const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    sessionUploads.current.add(url);
    return url;
  };
  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of Array.from(files)) urls.push(await uploadImage(f));
      setForm((p) => ({ ...p, photos: [...p.photos, ...urls] }));
    } catch (e) { toast("Couldn't upload photo — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };
  const setDiagram = async (file) => {
    if (!file) return;
    setUploading(true);
    try { setForm((p) => ({ ...p, diagram: "", diagramImage: "" })); const url = await uploadImage(file); setForm((p) => ({ ...p, diagram: url })); }
    catch (e) { toast("Couldn't upload diagram — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    const gridMatch = String(d.setup?.grid || "").match(/(\d+)\s*[x×]\s*(\d+)/);
    const lenYd = d.setup?.lengthYd ?? d.diagramData?.lengthYd ?? (gridMatch ? gridMatch[1] : "");
    const widYd = d.setup?.widthYd ?? d.diagramData?.widthYd ?? (gridMatch ? gridMatch[2] : "");
    const equipStr = Array.isArray(d.setup?.equipment) ? d.setup.equipment.join(", ") : (d.equipment || "");
    setForm({ name: d.name || "", title: d.title || "", kind: d.kind || "drill", cat: d.cat || DRILL_CATS[0], tags: (d.tags || []).join(", "), dur: d.dur || "", players: d.players || "", equipment: equipStr, setupLengthYd: lenYd, setupWidthYd: widYd, setupCones: d.setup?.cones ?? "", setupBalls: d.setup?.balls ?? "", setupGoals: d.setup?.goals ?? "", setupMannequins: d.setup?.mannequins ?? "", setupTeams: d.setup?.teams || "", howTo: d.howTo || "", objectives: (d.objectives || []).join("\n"), desc: d.desc || "", info: d.info || "", videoUrl: d.videoUrl || "", photos: d.photos || [], diagram: d.diagram || "", diagramData: d.diagramData || null, diagramImage: d.diagramImage || "", scenario: d.scenario || "", cues: (d.cues || []).join("\n") });
    setAdding(true);
  };
  const cancel = () => { cleanupUploads(); setEditingId(null); setForm(blank); setAdding(false); setNewCat(false); };
  // Structured drill record: setup carries real yard dimensions + counts.
  const buildData = () => {
    const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== "" ? n : null; };
    const lenYd = numOrNull(form.setupLengthYd), widYd = numOrNull(form.setupWidthYd);
    const equipArr = form.equipment.split(",").map((t) => t.trim()).filter(Boolean);
    return {
      name: form.name.trim(),
      title: form.title.trim(),
      kind: "drill",
      cat: (form.cat || "").trim() || DRILL_CATS[0],
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      dur: form.dur.trim(), players: form.players.trim(), equipment: form.equipment.trim(),
      setup: {
        grid: lenYd && widYd ? `${lenYd}x${widYd} yd` : "",
        teams: form.setupTeams.trim(),
        lengthYd: lenYd, widthYd: widYd,
        cones: numOrNull(form.setupCones), balls: numOrNull(form.setupBalls),
        goals: numOrNull(form.setupGoals), mannequins: numOrNull(form.setupMannequins),
        equipment: equipArr,
      },
      howTo: form.howTo.trim(),
      objectives: form.objectives.split("\n").map((t) => t.trim()).filter(Boolean),
      desc: form.desc.trim(), info: form.info.trim(), videoUrl: form.videoUrl.trim(),
      photos: form.photos, diagram: form.diagram, diagramData: form.diagramData ? stripUndefined(form.diagramData) : null,
      diagramImage: form.diagramImage || null,
      scenario: form.scenario.trim(),
      cues: form.cues.split("\n").map((t) => t.trim()).filter(Boolean),
    };
  };
  const save = async () => {
    if (!form.name.trim()) return;
    const data = buildData();
    try {
      if (editingId) await updateDrill(editingId, data);
      else await addDrill(data);
      cleanupUploads(new Set([...(data.photos || []), data.diagram, data.diagramImage].filter(Boolean)));
      if (cat !== "All") setCat(data.cat); // stay on All — the new drill is already visible there
      cancel();
    } catch (e) { toast("Couldn't save drill — " + (e.message || "check Firestore rules.")); }
  };
  // Duplicate for a progression: same drill + board, harder variation to fill in.
  const duplicateDrill = async (d) => {
    const copy = { ...d };
    delete copy.id;
    // Fresh authorship: the create rule requires createdByUid == the caller,
    // so a copy stamped with the original coach's uid would be denied.
    delete copy.createdByUid;
    delete copy.createdByName;
    copy.name = `${d.name || "Drill"} — Progression`;
    copy.title = `${d.title || d.name || "Drill"} — Progression`;
    try { await addDrill(copy); toast("Duplicated — edit the copy for the progression."); }
    catch (e) { toast("Couldn't duplicate — " + (e.message || "check Firestore rules.")); }
  };
  const del = (id) => {
    if (!confirm("Delete this drill from the shared library? Practices that use it will show it as missing.")) return;
    deleteDrill(id).catch(reportError("Couldn't delete the drill (only its creator or the program admin can)"));
  };

  return (
    <div className="pt-1 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Drill Library</h3>
        {isAdmin
          ? <button onClick={() => (adding ? cancel() : setAdding(true))} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> New drill</button>
          : <ReadOnlyHint label="Coach builds the drills" />}
      </div>

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Drill name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Display title (shown on the card — defaults to drill name)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            {newCat ? (
              <div className="flex gap-1">
                <input autoFocus value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} placeholder="New category" className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={() => { setNewCat(false); setForm({ ...form, cat: cats[0] || DRILL_CATS[0] }); }} className="px-2 rounded-lg bg-slate-100 text-slate-500" title="Back to list"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <select value={form.cat} onChange={(e) => { if (e.target.value === "__new__") { setNewCat(true); setForm({ ...form, cat: "" }); } else setForm({ ...form, cat: e.target.value }); }} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ Add new category…</option>
              </select>
            )}
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated) — or tap a phase below" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {/* Session-phase quick-add chips */}
          <div className="flex flex-wrap gap-1.5 px-0.5">
            {DRILL_PHASES.map((p) => {
              const active = form.tags.split(",").map((t) => t.trim()).includes(p);
              return (
                <button key={p} type="button" onClick={() => {
                  const cur = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
                  const next = active ? cur.filter((t) => t !== p) : [...cur, p];
                  setForm({ ...form, tags: next.join(", ") });
                }} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${active ? "text-white border-transparent" : "text-slate-500 border-slate-200 bg-white"}`} style={active ? { backgroundColor: COLORS.primary } : {}}>{p}</button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} placeholder="Duration" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <input value={form.players} onChange={(e) => setForm({ ...form, players: e.target.value })} placeholder="# Players" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Equipment (comma-separated)" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
          </div>
          {/* Structured setup — dimensions in yards + counts. The board uses
              the same yard dimensions, so the diagram is drawn to scale. */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Setup — grid &amp; equipment</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <input type="number" min={0} value={form.setupLengthYd} onChange={(e) => setForm({ ...form, setupLengthYd: e.target.value })} placeholder="—" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /> yd long
              </label>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <input type="number" min={0} value={form.setupWidthYd} onChange={(e) => setForm({ ...form, setupWidthYd: e.target.value })} placeholder="—" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /> yd wide
              </label>
              <input value={form.setupTeams} onChange={(e) => setForm({ ...form, setupTeams: e.target.value })} placeholder="Teams (e.g. 4v4+2)" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="text-[11px] font-semibold text-slate-600">Cones<input type="number" min={0} value={form.setupCones} onChange={(e) => setForm({ ...form, setupCones: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Balls<input type="number" min={0} value={form.setupBalls} onChange={(e) => setForm({ ...form, setupBalls: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Goals<input type="number" min={0} value={form.setupGoals} onChange={(e) => setForm({ ...form, setupGoals: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Mannequins<input type="number" min={0} value={form.setupMannequins} onChange={(e) => setForm({ ...form, setupMannequins: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
            </div>
          </div>
          <AutoGrowTextarea value={form.howTo} onChange={(e) => setForm({ ...form, howTo: e.target.value })} minRows={3} placeholder="How to run it — instructions" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} minRows={2} placeholder="Look for — one goal per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} minRows={2} placeholder="Description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.info} onChange={(e) => setForm({ ...form, info: e.target.value })} minRows={2} placeholder="How to run it" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="Video URL (optional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />

          {/* Photo carousel uploads */}
          {form.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {form.photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  <button onClick={() => setForm((p) => ({ ...p, photos: p.photos.filter((_, j) => j !== i) }))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow"><X className="w-3 h-3 text-slate-500" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" /> Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" onClick={() => setBoardOpen(true)} className="flex-1 py-2 rounded-full text-xs font-bold text-white text-center flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
              <Layers className="w-3.5 h-3.5" /> {form.diagramData ? "Edit board" : "Build on the board"}
            </button>
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> {form.diagram && !form.diagramData ? "Diagram ✓" : "Diagram"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { setDiagram(e.target.files?.[0]); setForm((p) => ({ ...p, diagramData: null, diagramImage: "" })); e.target.value = ""; }} />
            </label>
          </div>
          {/* diagram — photo from the video wins, then the board, then the
              uploaded raster (photo-first rule, same as the Drill Library) */}
          {form.diagramImage ? (
            <div className="relative">
              <img src={form.diagramImage} alt="Diagram photo from the video" className="w-full rounded-xl border border-slate-100" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagramImage: "" }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          ) : form.diagramData ? (
            <div className="relative">
              <BoardSvg state={form.diagramData} showLegend className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          ) : null}
          {form.diagram && !form.diagramData && !form.diagramImage && (
            <div className="relative">
              <img src={form.diagram} alt="Drill diagram" className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          )}
          {uploading && <p className="text-[10px] font-semibold text-slate-400 px-1">Uploading…</p>}
          {boardOpen && <TacticsBoard initial={form.diagramData} title={form.name || "Diagram"} onSave={saveBoard} onClose={() => setBoardOpen(false)} />}

          <div className="flex gap-2 pt-1">
            <button onClick={cancel} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={save} disabled={uploading || !form.name.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{editingId ? "Save changes" : "Add drill"}</button>
          </div>
        </div></div>
      )}


      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {["All", ...cats].map((c) => (
            <button key={c} onClick={() => { setCat(c); setTag("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Tag pills (only when the active category has tags) */}
      {tags.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(t)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 ${tag === t ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={tag === t ? { backgroundColor: COLORS.accent, color: "#fff" } : {}}>{t !== "All" && <Tag className="w-2.5 h-2.5" />}{t}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{cat}{tag !== "All" ? ` · ${tag}` : ""}</h3>
        {isLoading(drills) ? <LoadingNote /> : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 italic">{isAdmin ? "No drills here yet — add one." : "Nothing here yet."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((d) => {
              const Icon = DRILL_CAT_ICON[d.cat] || Target;
              return (
                <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden flex flex-col">
                  <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: COLORS.primary }} />
                  <button onClick={() => setModal(d)} className="text-left w-full flex-1 flex flex-col">
                    <div className="px-3 pt-3">
                      <DrillDiagram d={d} icon={Icon} className="w-full h-24" />
                    </div>
                    <div className="p-3 pt-2.5 flex-1">
                      <h4 className="font-bold text-sm text-slate-900 leading-tight pr-4">{d.title || d.name}</h4>
                      {(d.dur || d.players || d.setup?.teams || d.setup?.grid) && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-semibold text-slate-500">
                          {d.dur && <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{d.dur}</span>}
                          {d.players && <span className="inline-flex items-center gap-0.5"><Users className="w-3 h-3" />{d.players}</span>}
                          {d.setup?.grid && <span className="inline-flex items-center gap-0.5"><SquareDashed className="w-3 h-3" />{d.setup.grid}</span>}
                          {d.setup?.teams && <span className="inline-flex items-center gap-0.5"><Swords className="w-3 h-3" />{d.setup.teams}</span>}
                          {d.diagramData?.animation?.steps?.length ? <span className="inline-flex items-center gap-0.5 text-sky-600"><Play className="w-3 h-3 fill-sky-600" />Animated</span> : null}
                        </div>
                      )}
                      {d.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {d.tags.slice(0, 3).map((t) => <span key={t} className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="absolute top-3 right-2.5 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(d); }} title="Edit" className="text-slate-300 hover:text-slate-600 bg-white/80 rounded-full p-0.5"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicateDrill(d); }} title="Duplicate for a progression" className="text-slate-300 hover:text-slate-600 bg-white/80 rounded-full p-0.5"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); del(d.id); }} title="Delete" className="text-slate-300 hover:text-red-500 bg-white/80 rounded-full p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <DrillModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
};

// Small reusable drill thumbnail (diagram or category-icon tile, Brophy watermark).
const DrillThumb = ({ d, className = "w-10 h-10" }) => {
  const Icon = DRILL_CAT_ICON[d.cat] || Target;
  return (
    <div className={`${className} relative rounded-lg overflow-hidden bg-slate-900 flex-shrink-0`}>
      <img src="/brand/logo.png" alt="" aria-hidden="true" className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none" style={{ opacity: 0.2 }} />
      {d.diagramImage
        ? <img src={d.diagramImage} alt="" className="relative w-full h-full object-cover" loading="lazy" />
        : d.diagramData
        ? <BoardSvg state={d.diagramData} className="relative w-full h-full" />
        : d.diagram
          ? <img src={d.diagram} alt="" className="relative w-full h-full object-cover" loading="lazy" />
          : <div className="relative w-full h-full flex items-center justify-center"><Icon className="w-4 h-4 text-white/90" /></div>}
    </div>
  );
};

const DrillPickRow = ({ d, onPick }) => (
  <li>
    <button onClick={() => onPick(d)} className="w-full bg-white rounded-2xl p-2.5 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
      <DrillThumb d={d} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 leading-tight truncate">{d.name}</div>
        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{d.cat}{d.dur ? ` · ${d.dur}` : ""}</div>
      </div>
      <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </button>
  </li>
);

// Pick a drill to drop into a practice (mirrors the gym ExercisePicker).
const DrillPicker = ({ drills, onPick, onClose }) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const cats = useMemo(() => [...new Set(drills.map((d) => d.cat).filter(Boolean))], [drills]);
  const hits = q ? drills.filter((d) => (d.kind || "drill") === "drill" && ((d.name || d.title || "").toLowerCase().includes(q) || (d.tags || []).some((t) => String(t).toLowerCase().includes(q)))) : null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Add a drill</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drills…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          {drills.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No drills yet — add some in the Drills tab first.</p>}
          {hits ? (
            <ul className="space-y-2">{hits.map((d) => <DrillPickRow key={d.id} d={d} onPick={onPick} />)}{hits.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No matches.</p>}</ul>
          ) : (
            cats.map((c) => (
              <div key={c}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 mt-2">{c}</h4>
                <ul className="space-y-2">{drills.filter((d) => d.cat === c).map((d) => <DrillPickRow key={d.id} d={d} onPick={onPick} />)}</ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Session phases for a timed-block practice (the 90-min high-school template).
const SESSION_PHASES = ["Warm-Up & Rondo", "Technical", "Tactical / Positional", "Scrimmage", "Cool-Down & Debrief"];
const SESSION_TEMPLATES = [
  { name: "Full session — 90 min", targetMin: 90, blocks: [
    { phase: "Warm-Up & Rondo", name: "Warm-Up & Rondo", dur: "12" },
    { phase: "Technical", name: "Dribbling & 1v1", dur: "12" },
    { phase: "Technical", name: "Passing & Combination", dur: "12" },
    { phase: "Technical", name: "Shooting & Crossing", dur: "12" },
    { phase: "Tactical / Positional", name: "Positional Play", dur: "12" },
    { phase: "Scrimmage", name: "Scrimmage", dur: "20" },
    { phase: "Cool-Down & Debrief", name: "Cool-Down & Debrief", dur: "10" },
  ]},
  { name: "Short session — 60 min", targetMin: 60, blocks: [
    { phase: "Warm-Up & Rondo", name: "Warm-Up & Rondo", dur: "10" },
    { phase: "Technical", name: "Technical Work", dur: "10" },
    { phase: "Tactical / Positional", name: "Tactical Work", dur: "10" },
    { phase: "Scrimmage", name: "Scrimmage", dur: "20" },
    { phase: "Cool-Down & Debrief", name: "Cool-Down & Debrief", dur: "10" },
  ]},
];
function parseBlockMin(dur) { const n = parseInt(String(dur || ""), 10); return Number.isFinite(n) ? n : 0; }

const PracticeCard = ({ practice, onOpen }) => (
  <button onClick={onOpen} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3 text-left">
    <div className="min-w-0">
      <div className="font-bold text-sm text-slate-900 leading-tight truncate">{practice.name || "Untitled practice"}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{practice.blocks?.length || 0} drill{(practice.blocks?.length || 0) === 1 ? "" : "s"}{(practice.blocks || []).reduce((s, b) => s + parseBlockMin(b.dur), 0) > 0 ? ` · ${(practice.blocks || []).reduce((s, b) => s + parseBlockMin(b.dur), 0)} min` : ""}{practice.desc ? ` · ${practice.desc}` : ""}</div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {practice.published && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>Published</span>}
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </div>
  </button>
);

// Build/view a single practice — an ordered list of drill blocks. Mirrors the
// gym WorkoutDetail (debounced autosave, reorder, add via picker).
const PracticeDetail = ({ practice, drills, canEdit, onSave, onDelete, onBack, catOptions = [] }) => {
  const [name, setName] = useState(practice.name || "");
  const [desc, setDesc] = useState(practice.desc || "");
  const [cat, setCat] = useState(practice.cat || "");
  const [blocks, setBlocks] = useState(practice.blocks || []);
  const [published, setPublished] = useState(!!practice.published);
  const [targetMin, setTargetMin] = useState(practice.targetMin || 90);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [picker, setPicker] = useState(false);
  const [pickForBlock, setPickForBlock] = useState(null);
  const [viewDrill, setViewDrill] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const totalMin = blocks.reduce((s, b) => s + parseBlockMin(b.dur), 0);
  // What prints: the practice as it looks right now, including any
  // unsaved edits still in the editor.
  const currentPractice = { ...practice, name, desc, cat, blocks, published, targetMin };
  const teamName = practice.teamId ? getTeam(practice.teamId).name : "";

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, desc, cat, blocks, published, targetMin })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the practice")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, cat, blocks, published, targetMin, dirty]);

  const handleBack = () => { if (dirty && canEdit) Promise.resolve(onSave({ name, desc, cat, blocks, published, targetMin })).catch(reportError("Couldn't save the practice")); onBack(); };
  const setBlock = (i, field, value) => { setBlocks(blocks.map((b, j) => (j === i ? { ...b, [field]: value } : b))); setDirty(true); };
  const removeBlock = (i) => { setBlocks(blocks.filter((_, j) => j !== i)); setDirty(true); };
  const moveBlock = (i, dir) => { const j = i + dir; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; setBlocks(n); setDirty(true); };
  const addBlock = (d) => { setBlocks([...blocks, { drillId: d.id, name: d.name, cat: d.cat || "", dur: d.dur || "", phase: "", notes: "" }]); setDirty(true); setPicker(false); };
  // Fill a template row with a drill from the library.
  const fillBlock = (i, d) => { setBlocks(blocks.map((b, j) => (j === i ? { ...b, drillId: d.id, name: d.name, cat: d.cat || "", dur: b.dur || d.dur || "" } : b))); setDirty(true); setPickForBlock(null); };
  // Drop a timed-block template in as the session skeleton; each row gets a drill.
  const applyTemplate = (t) => { setBlocks(t.blocks.map((b) => ({ ...b, drillId: "", notes: "" }))); setTargetMin(t.targetMin); setDirty(true); };
  const confirmDelete = async () => { if (!confirm(`Delete "${practice.name}"? This can't be undone.`)) return; try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); } };
  const drillById = (id) => drills.find((d) => d.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Practice name" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
          <input value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true); }} placeholder="Short description (optional)" className="w-full text-sm text-slate-600 bg-transparent focus:outline-none" />
          <input list="practice-cats" value={cat} onChange={(e) => { setCat(e.target.value); setDirty(true); }} placeholder="Category (e.g. Technical, Game Prep)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="practice-cats">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </>
      ) : (
        <><h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>{cat && <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{cat}</span>}{desc && <p className="text-sm text-slate-600">{desc}</p>}</>
      )}

      {/* Timeline total — running minutes vs the session target. */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">Session total</span>
          <span className={`text-sm font-bold ${totalMin > targetMin ? "text-red-600" : "text-slate-900"}`}>{totalMin} / {targetMin} min</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (totalMin / Math.max(1, targetMin)) * 100)}%`, backgroundColor: totalMin > targetMin ? "#DC2626" : COLORS.success }} />
        </div>
        {totalMin > targetMin && <p className="text-[11px] font-semibold text-red-600 mt-1.5">Over the planned length by {totalMin - targetMin} min — trim a block.</p>}
        {canEdit && (
          <label className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-slate-500">
            Target length
            <input type="number" min={10} max={240} value={targetMin} onChange={(e) => { setTargetMin(Number(e.target.value) || 90); setDirty(true); }} className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center" /> min
          </label>
        )}
      </div>

      {blocks.length === 0 ? (
        canEdit ? (
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Start from a template</p>
            {SESSION_TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => applyTemplate(t)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-left">
                <div className="text-sm font-bold text-slate-900">{t.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{t.blocks.map((b) => `${b.name} ${b.dur}'`).join(" · ")}</div>
              </button>
            ))}
            <p className="text-[11px] text-slate-400 text-center pt-1">…or add drills below and build it block by block.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic text-center py-6">No drills yet.</p>
        )
      ) : (
        <ul className="space-y-2">
          {blocks.map((b, i) => {
            const d = drillById(b.drillId);
            return (
              <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                  {d ? <DrillThumb d={d} className="w-9 h-9" /> : <button onClick={() => canEdit && setPickForBlock(i)} className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0" aria-label="Pick a drill"><Plus className="w-4 h-4 text-slate-400" /></button>}
                  <button onClick={() => d && setViewDrill(d)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm text-slate-900 leading-tight truncate">{b.name || "Pick a drill"}</div>
                    <div className="text-[10px] text-slate-500">{b.phase ? `${b.phase} · ` : ""}{b.cat}{b.dur ? ` · ${b.dur} min` : ""}{!d && b.drillId ? " · (drill deleted)" : ""}</div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeBlock(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <input type="number" min={0} value={b.dur} onChange={(e) => setBlock(i, "dur", e.target.value)} placeholder="Min" aria-label="Minutes" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" /> min
                    </label>
                    <select value={b.phase || ""} onChange={(e) => setBlock(i, "phase", e.target.value)} aria-label="Phase" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                      <option value="">Phase…</option>
                      {SESSION_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input value={b.notes} onChange={(e) => setBlock(i, "notes", e.target.value)} placeholder="Notes (optional)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                ) : (b.notes ? <div className="text-[11px] text-slate-600 mt-1.5 pl-[34px]">{b.notes}</div> : null)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Export / share: a printable PDF of every block in order. */}
      <button onClick={() => setPrintOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Printer className="w-3.5 h-3.5" /> Export / Share PDF</button>

      {canEdit && (
        <>
          <button onClick={() => setPicker(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Plus className="w-3.5 h-3.5" /> Add drill</button>
          <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Published to players</span>
            <button onClick={() => { setPublished(!published); setDirty(true); }} aria-label="Toggle published" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={published ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${published ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">Delete practice</button>
        </>
      )}
      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}
      {picker && <DrillPicker drills={drills} onPick={addBlock} onClose={() => setPicker(false)} />}
      {pickForBlock !== null && <DrillPicker drills={drills} onPick={(d) => fillBlock(pickForBlock, d)} onClose={() => setPickForBlock(null)} />}
      {viewDrill && <DrillModal item={viewDrill} onClose={() => setViewDrill(null)} />}
      {printOpen && <PracticePrintSheet practice={currentPractice} drills={drills} teamName={teamName} onClose={() => setPrintOpen(false)} />}
    </div>
  );
};

const PracticesView = ({ practices, drills, canEdit, add, update, del, initialOpenId = null, hideCreate = false }) => {
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [cat, setCat] = useState("All");
  const [printAllOpen, setPrintAllOpen] = useState(false);
  const teamName = practices.length > 0 && practices[0].teamId ? getTeam(practices[0].teamId).name : "";
  const catOptions = useMemo(() => [...new Set(practices.map((p) => p.cat).filter(Boolean))].sort(), [practices]);
  const cats = ["All", ...catOptions];
  const open = practices.find((p) => p.id === openId);
  if (open) return <PracticeDetail key={open.id} practice={open} drills={drills} canEdit={canEdit} catOptions={catOptions} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} />;
  const create = async () => {
    if (!newName.trim()) return;
    try { const ref = await add(newName); setNewName(""); setCreating(false); if (ref?.id) setOpenId(ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };
  const filtered = cat === "All" ? practices : practices.filter((p) => (p.cat || "") === cat);
  return (
    <div className="px-5 space-y-3">
      {canEdit && !hideCreate ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Practice name (e.g. Tuesday Session)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={create} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New practice</button>
        )
      ) : (!canEdit && practices.length === 0 && <ReadOnlyHint label="Your coach hasn't published a practice yet" />)}

      {cats.length > 1 && (
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="flex gap-2 w-max">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <button onClick={() => setPrintAllOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Printer className="w-3.5 h-3.5" /> Export all practices</button>
      )}

      {isLoading(practices) ? <LoadingNote /> : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No practices{cat !== "All" ? ` in ${cat}` : ""} yet.</p>
      ) : (
        <ul className="space-y-2">{filtered.map((p) => <li key={p.id}><PracticeCard practice={p} onOpen={() => setOpenId(p.id)} /></li>)}</ul>
      )}
      {printAllOpen && <PracticesPrintSheet practices={filtered} drills={drills} teamName={teamName} onClose={() => setPrintAllOpen(false)} />}
    </div>
  );
};

// Pick a practice for a program day.
const PracticePicker = ({ practices, onPick, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900">Pick a practice</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-2">
        {practices.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No practices yet — build one in the Practices tab first.</p>}
        {practices.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 text-left">
            <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div><div className="text-[10px] text-slate-500">{p.blocks?.length || 0} drills</div></div>
            <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  </div>
);

const ProgramCard = ({ program, onOpen, onCopy }) => (
  <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-1 pr-2">
    <button onClick={onOpen} className="flex-1 min-w-0 p-4 flex items-center justify-between gap-3 text-left">
      <div className="min-w-0">
        <div className="font-bold text-sm text-slate-900 leading-tight truncate">{program.name || "Untitled program"}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{program.days?.length || 0} day{(program.days?.length || 0) === 1 ? "" : "s"}{program.desc ? ` · ${program.desc}` : ""}{program.createdByName ? ` · ${program.createdByName}` : ""}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {program.shared && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Shared</span>}
        {program.published && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>Published</span>}
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>
    </button>
    {onCopy && <button onClick={onCopy} title="Copy this program" aria-label="Copy program" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Copy className="w-4 h-4 text-slate-500" /></button>}
  </div>
);

// Build/view a program — an ordered sequence of days, each pointing to a practice.
const ProgramDetail = ({ program, practices, canEdit, onSave, onDelete, onBack, onAssign, user }) => {
  const [name, setName] = useState(program.name || "");
  const [desc, setDesc] = useState(program.desc || "");
  const [days, setDays] = useState(program.days || []);
  const [published, setPublished] = useState(!!program.published);
  const [shared, setShared] = useState(!!program.shared);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [pickFor, setPickFor] = useState(null); // index of day choosing a practice

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, desc, days, published, shared })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the program")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, days, published, shared, dirty]);

  const handleBack = () => { if (dirty && canEdit) Promise.resolve(onSave({ name, desc, days, published, shared })).catch(reportError("Couldn't save the program")); onBack(); };
  const addDay = () => { setDays([...days, { label: `Day ${days.length + 1}`, practiceId: "", note: "" }]); setDirty(true); };
  const setDay = (i, field, value) => { setDays(days.map((d, j) => (j === i ? { ...d, [field]: value } : d))); setDirty(true); };
  const removeDay = (i) => { setDays(days.filter((_, j) => j !== i)); setDirty(true); };
  const moveDay = (i, dir) => { const j = i + dir; if (j < 0 || j >= days.length) return; const n = [...days]; [n[i], n[j]] = [n[j], n[i]]; setDays(n); setDirty(true); };
  const confirmDelete = async () => { if (!confirm(`Delete "${program.name}"?`)) return; try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); } };
  const practiceById = (id) => practices.find((p) => p.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Program name (e.g. Preseason Week 1)" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
          <input value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true); }} placeholder="Short description (optional)" className="w-full text-sm text-slate-600 bg-transparent focus:outline-none" />
        </>
      ) : (
        <><h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>{desc && <p className="text-sm text-slate-600">{desc}</p>}</>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No days yet.{canEdit ? " Add one below." : ""}</p>
      ) : (
        <ul className="space-y-2">
          {days.map((day, i) => {
            const p = practiceById(day.practiceId);
            return (
              <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                  {canEdit
                    ? <input value={day.label} onChange={(e) => setDay(i, "label", e.target.value)} placeholder={`Day ${i + 1}`} className="flex-1 min-w-0 text-sm font-semibold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200" />
                    : <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{day.label || `Day ${i + 1}`}</span>}
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveDay(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveDay(i, 1)} disabled={i === days.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeDay(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                <div className="mt-2 pl-[34px]">
                  {canEdit ? (
                    <button onClick={() => setPickFor(i)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3 h-3" style={{ color: COLORS.accent }} /> {p ? p.name : "Pick practice"}
                    </button>
                  ) : (
                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5"><Layers className="w-3 h-3" style={{ color: COLORS.accent }} /> {p ? p.name : "Rest / unassigned"}</div>
                  )}
                  {day.note && !canEdit && <div className="text-[11px] text-slate-500 mt-1">{day.note}</div>}
                  {canEdit && <input value={day.note} onChange={(e) => setDay(i, "note", e.target.value)} placeholder="Note (optional)" className="w-full mt-1.5 border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <button onClick={addDay} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Plus className="w-3.5 h-3.5" /> Add day</button>
          <button onClick={() => onAssign({ ...program, name, days })} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 text-white" style={{ backgroundColor: COLORS.accent, color: "#fff" }}><CalendarIcon className="w-3.5 h-3.5" /> Assign to calendar</button>
          {user?.isOrgAdmin && (
            <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
              <span className="text-sm font-semibold text-slate-700">Shared curriculum <span className="block text-[11px] font-normal text-slate-500">All coaches can follow this program</span></span>
              <button onClick={() => { setShared(!shared); setDirty(true); }} aria-label="Toggle shared curriculum" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={shared ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${shared ? "left-[22px]" : "left-0.5"}`} /></button>
            </label>
          )}
          <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Published to players</span>
            <button onClick={() => { setPublished(!published); setDirty(true); }} aria-label="Toggle published" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={published ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${published ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">Delete program</button>
        </>
      )}
      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}
      {pickFor !== null && <PracticePicker practices={practices} onPick={(p) => { setDay(pickFor, "practiceId", p.id); setPickFor(null); }} onClose={() => setPickFor(null)} />}
    </div>
  );
};

const ProgramsView = ({ programs, practices, canEdit, add, update, del, onAssign, onCopy, user, startCreating = false }) => {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(startCreating);
  const [newName, setNewName] = useState("");
  const open = programs.find((p) => p.id === openId);
  const sharedPrograms = programs.filter((p) => p.shared);
  const myPrograms = programs.filter((p) => !p.shared);
  if (open) return <ProgramDetail key={open.id} program={open} practices={practices} canEdit={canEdit} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} onAssign={onAssign} user={user} />;
  const create = async () => {
    if (!newName.trim()) return;
    try { const ref = await add(newName); setNewName(""); setCreating(false); if (ref?.id) setOpenId(ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };
  return (
    <div className="px-5 space-y-3">
      {canEdit ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Program name (e.g. Preseason Week 1)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={create} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New program</button>
        )
      ) : (programs.length === 0 && <ReadOnlyHint label="Your coach hasn't published a program yet" />)}

      {isLoading(programs) ? <LoadingNote /> : programs.length === 0 ? (
        canEdit ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: COLORS.accentSoft }}><Goal className="w-6 h-6" style={{ color: COLORS.accent }} /></div>
            <p className="text-sm text-slate-400 italic">Sequence your practices into a program, then assign dates to drop them on the calendar.</p>
          </div>
        ) : null
      ) : (
        <div className="space-y-4">
          {sharedPrograms.length > 0 && (
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Shared curriculum</h4>
              <ul className="space-y-2">{sharedPrograms.map((p) => <li key={p.id}><ProgramCard program={p} onOpen={() => setOpenId(p.id)} onCopy={canEdit ? () => onCopy?.(p) : undefined} /></li>)}</ul>
            </div>
          )}
          {myPrograms.length > 0 && (
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">My programs</h4>
              <ul className="space-y-2">{myPrograms.map((p) => <li key={p.id}><ProgramCard program={p} onOpen={() => setOpenId(p.id)} onCopy={canEdit ? () => onCopy?.(p) : undefined} /></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Session templates — a timed-block skeleton the coach fills with drills.
// (The 90-min default follows the high-school timed-block model; the 60-min
// variant is the same shape, compressed.)
const PRACTICE_STARTERS = SESSION_TEMPLATES.map((t) => ({
  name: t.name, cat: "Session", targetMin: t.targetMin, blocks: t.blocks,
  desc: t.blocks.map((b) => `${b.name} ${b.dur}'`).join(" · "),
  icon: t.targetMin === 90 ? Target : Clock, color: t.targetMin === 90 ? "#2563eb" : "#16a34a",
}));

// One section row on the Practice home: title + a Create / Library split.
const SectionBanner = ({ icon: Icon, title, count, onCreate, onLibrary }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.accentSoft }}><Icon className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
      <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-900">{title}</div><div className="text-[11px] text-slate-500">{count}</div></div>
    </div>
    <div className="grid grid-cols-2 border-t border-slate-100">
      <button onClick={onCreate} className="py-2.5 text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> Create</button>
      <button onClick={onLibrary} className="py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-center gap-1.5"><Layers className="w-3.5 h-3.5" style={{ color: COLORS.accent }} /> Library</button>
    </div>
  </div>
);

// "Create practice" entry: blank, a built-in starter, or a copy of an existing one.
const NewPracticeChooser = ({ practices, onCreate }) => (
  <div className="px-5 pb-4 space-y-4">
    <div>
      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Start from a template</h4>
      <div className="grid grid-cols-2 gap-2">
        {PRACTICE_STARTERS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.name} onClick={() => onCreate({ name: t.name, cat: t.cat, desc: t.desc, blocks: (t.blocks || []).map((b) => ({ ...b, drillId: "", notes: "" })), targetMin: t.targetMin || 90 })} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col gap-2 text-left hover:bg-slate-50">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${t.color}1a` }}><Icon className="w-4 h-4" style={{ color: t.color }} /></div>
              <div className="min-w-0"><div className="font-semibold text-sm text-slate-900 truncate">{t.name}</div><div className="text-[11px] text-slate-500 line-clamp-2 leading-snug">{t.desc}</div></div>
            </button>
          );
        })}
        <button onClick={() => onCreate({ name: "New practice" })} className="rounded-2xl p-3 shadow-sm text-white flex flex-col gap-2 text-left" style={{ backgroundColor: COLORS.primary }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/15"><Plus className="w-4 h-4 text-white" /></div>
          <div className="min-w-0"><div className="font-semibold text-sm">Blank</div><div className="text-[11px] text-white/70 leading-snug">Start from scratch</div></div>
        </button>
      </div>
    </div>
    {practices.length > 0 && (
      <div>
        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Copy from library</h4>
        <div className="space-y-2">
          {practices.map((p) => (
            <button key={p.id} onClick={() => onCreate({ name: `${p.name} (copy)`, cat: p.cat || "", desc: p.desc || "", blocks: p.blocks || [] })} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between gap-2 text-left hover:bg-slate-50">
              <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div><div className="text-[10px] text-slate-500">{p.blocks?.length || 0} drills{p.cat ? ` · ${p.cat}` : ""}</div></div>
              <Copy className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

// Assign a program onto the calendar — the coach picks the DATE and TIME for
// each day (no fixed drop time), so other coaches can see what is scheduled
// and what they need to run.
const AssignProgramModal = ({ program, practices, importEvents, onClose }) => {
  const todayStr = teamDateKey();
  const [days, setDays] = useState(() =>
    (program.days || []).map((d, i) => {
      // Calendar-day arithmetic on the date string (UTC noon avoids any
      // timezone rollover), so day N is exactly N days after today.
      const [y, m, dd] = todayStr.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, dd + i, 12));
      return { date: dt.toISOString().slice(0, 10), start: "15:00", end: "17:00" };
    })
  );
  const [busy, setBusy] = useState(false);
  const setDay = (i, field, value) => setDays(days.map((d, j) => (j === i ? { ...d, [field]: value } : d)));
  const practiceById = (id) => practices.find((p) => p.id === id);
  const confirmAssign = async () => {
    const rows = program.days.map((day, i) => {
      const practice = practiceById(day.practiceId);
      return {
        title: `${program.name}: ${day.label || `Day ${i + 1}`}${practice ? ` — ${practice.name}` : ""}`,
        date: days[i]?.date || todayStr,
        start: days[i]?.start || "15:00", end: days[i]?.end || "17:00",
        location: "", type: "Practice",
        programId: program.id, practiceId: day.practiceId || "",
      };
    });
    setBusy(true);
    try { await importEvents(rows, { notify: false }); toast(`Added ${rows.length} session${rows.length === 1 ? "" : "s"} to the calendar.`); onClose(); }
    catch (e) { toast("Couldn't assign — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Assign “{program.name}”</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">Pick a date and time for each day. Other coaches will see these sessions on the calendar with the practice attached.</p>
          {program.days.map((day, i) => {
            const p = practiceById(day.practiceId);
            return (
              <div key={i} className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
                <div className="text-sm font-bold text-slate-900">{day.label || `Day ${i + 1}`}{p ? ` — ${p.name}` : " — Rest / unassigned"}</div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="date" value={days[i]?.date || ""} onChange={(e) => setDay(i, "date", e.target.value)} aria-label="Date" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                  <input type="time" value={days[i]?.start || ""} onChange={(e) => setDay(i, "start", e.target.value)} aria-label="Start time" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                  <input type="time" value={days[i]?.end || ""} onChange={(e) => setDay(i, "end", e.target.value)} aria-label="End time" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={confirmAssign} disabled={busy} className="flex-1 py-2.5 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Adding…" : `Add ${program.days.length} session${program.days.length === 1 ? "" : "s"} to calendar`}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PracticePage = ({ user, drills, addDrill, updateDrill, deleteDrill, practices, addPractice, updatePractice, deletePractice, programs, addProgram, updateProgram, deleteProgram, importEvents, events = [] }) => {
  const isAdmin = user.role === "admin";
  const [nav, setNav] = useState({ section: "home", mode: null, openId: null });
  const [assignTarget, setAssignTarget] = useState(null);
  const go = (section, mode, openId = null) => setNav({ section, mode, openId });
  const home = () => setNav({ section: "home", mode: null, openId: null });

  // Today's session is whichever assigned-program event lands on today.
  const today = teamDateKey();
  const todayEvent = events.find((e) => e.date === today && e.practiceId);
  const todayPractice = todayEvent && practices.find((p) => p.id === todayEvent.practiceId);

  // Assign a program: open the per-day date/time picker (no fixed drop time).
  const openAssign = (program) => {
    if (!program.days?.length) { toast("Add some days to the program first."); return; }
    setAssignTarget(program);
  };
  // Copy a shared program to make it your own.
  const copyProgram = async (program) => {
    try {
      await addProgram({ name: `${program.name} (copy)`, desc: program.desc || "", days: program.days || [], published: false, shared: false });
      toast("Copied — open it to make it yours.");
    } catch (e) { toast("Couldn't copy — " + (e.message || "check rules.")); }
  };

  const createPracticeFrom = async (data) => {
    try { const ref = await addPractice(data); if (ref?.id) go("practices", "library", ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };

  // ── Home: today's session + the three section banners ──
  if (nav.section === "home") {
    return (
      <div className="pt-4 pb-4 space-y-5">
        <div className="px-5">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Today</h3>
          {todayPractice ? (
            <button onClick={() => go("practices", "library", todayPractice.id)} className="w-full text-left rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.primary }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>{todayEvent?.start ? formatHourTime(todayEvent.start) : "Today's session"}</div>
              <div className="text-lg font-bold text-white mt-0.5 leading-tight">{todayPractice.name}</div>
              <div className="text-xs text-white/70 mt-0.5">{todayPractice.blocks?.length || 0} drill{(todayPractice.blocks?.length || 0) === 1 ? "" : "s"}{todayPractice.cat ? ` · ${todayPractice.cat}` : ""}</div>
            </button>
          ) : (
            <div className="rounded-2xl p-5 border border-dashed border-slate-200 bg-white text-center">
              <p className="text-sm text-slate-500 font-medium">No practice scheduled today.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Assign a program to drop sessions onto the calendar.</p>
            </div>
          )}
        </div>
        <div className="px-5 space-y-3">
          <SectionBanner icon={Target} title="Drills" count={`${drills.length} drill${drills.length === 1 ? "" : "s"}`} onCreate={() => go("drills", "create")} onLibrary={() => go("drills", "library")} />
          <SectionBanner icon={Layers} title="Practices" count={`${practices.length} practice${practices.length === 1 ? "" : "s"}`} onCreate={() => go("practices", "create")} onLibrary={() => go("practices", "library")} />
          <SectionBanner icon={Goal} title="Programs" count={`${programs.length} program${programs.length === 1 ? "" : "s"}`} onCreate={() => go("programs", "create")} onLibrary={() => go("programs", "library")} />
        </div>
      </div>
    );
  }
  // (Assign modal is rendered below, after the section screen.)

  // ── Section screens (back to home + the chosen view) ──
  const sectionTitle = { drills: "Drills", practices: "Practices", programs: "Programs" }[nav.section];
  return (
    <div className="pt-3 pb-4">
      <div className="px-5 pb-3 flex items-center justify-between">
        <button onClick={home} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Practice</button>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{sectionTitle}{nav.mode === "create" ? " · New" : ""}</span>
      </div>
      {nav.section === "drills" && <DrillsPage user={user} drills={drills} addDrill={addDrill} updateDrill={updateDrill} deleteDrill={deleteDrill} startCreating={nav.mode === "create"} />}
      {nav.section === "practices" && nav.mode === "create" && <NewPracticeChooser practices={practices} onCreate={createPracticeFrom} />}
      {nav.section === "practices" && nav.mode === "library" && <PracticesView practices={practices} drills={drills} canEdit={isAdmin} add={addPractice} update={updatePractice} del={deletePractice} initialOpenId={nav.openId} />}
      {nav.section === "programs" && <ProgramsView user={user} programs={programs} practices={practices} canEdit={isAdmin} add={addProgram} update={updateProgram} del={deleteProgram} onAssign={openAssign} onCopy={copyProgram} startCreating={nav.mode === "create"} />}
      {assignTarget && <AssignProgramModal program={assignTarget} practices={practices} importEvents={importEvents} onClose={() => setAssignTarget(null)} />}
    </div>
  );
};

/* ─── GAME DAY: starting line-ups ─────────────────────────────────────────
   A coach drops players onto a soccer pitch (each token = the player's photo
   with their name under it), names the "field", saves it, and can send it to
   any group chat as an image. Formations seed the slot positions; slots are
   draggable and tap-to-assign. Positions are normalized 0..1 so the pitch
   scales to any size and rasterizes cleanly for the chat card.
   ──────────────────────────────────────────────────────────────────────── */
const lid = () => Math.random().toString(36).slice(2, 9);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
// Formations with a hand-set shape instead of even rows. 4-3-3 is the
// coach's layout: back four, one holding midfielder in the middle, two
// midfielders ahead of him, three forwards (x/y are 0..1 of the pitch).
const FORMATION_LAYOUTS = {
  "4-3-3": [
    [0.2, 0.745], [0.4, 0.745], [0.6, 0.745], [0.8, 0.745],
    [0.5, 0.45],
    [0.34, 0.32], [0.66, 0.32],
    [0.25, 0.155], [0.5, 0.155], [0.75, 0.155],
  ],
};

const slotsForFormation = (rows) => {
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
const shortName = (name = "") => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  if (p.length === 1) return p[0];
  return `${p[0]} ${p[p.length - 1][0]}.`;
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

// Rasterize a line-up to a JPEG blob for the chat card. Photos are drawn with
// crossOrigin; if the Storage bucket doesn't allow canvas reads (CORS), we fall
// back to initials so the send always succeeds.
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
  } catch { return false; }
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
// Default line-up watermark: the Brophy logo (the same one that watermarks
// drill diagrams), in white so it reads on the green pitch. A coach can
// upload their own logo to replace it.
const BRAND_WATERMARK = "/brand/logo-white.png";
const BRAND_WATERMARK_ALPHA = 0.35;

const renderLineupBlob = async (title, formation, slots, logoUrl, teamShortName = "") => {
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
const SendLineupSheet = ({ title, formation, slots, logoUrl, teamShortName = "", chatGroups = [], postLineupImage, onClose }) => {
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
const PlayerPickerSheet = ({ roster, activeTeamId, positionsByUid = EMPTY_OBJ, usedUids, onPick, onClear, onClose }) => {
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

const GameDayPage = ({ user, lineups = [], addLineup, updateLineup, deleteLineup, allUsers = [], invites = [], chatGroups = [], postLineupImage, lineupLogo = "", setLineupLogo, teamShortName = "", activeTeamId, positionsByUid = EMPTY_OBJ }) => {
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
const PlayersByPosition = ({ allUsers = [], activeTeamId, byUid = {}, onSetPosition }) => {
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

const RosterInvitesPage = ({ user, isOrgAdmin = false, invites = [], addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks = [], addInviteLink, removeInviteLink, allUsers = [], removeUser, requestProfileUpdate, activeTeamId, positionsByUid = {}, setPlayerPosition }) => {
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
const AnnouncementsPage = ({ announcements, addAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement }) => {
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
const DocumentsPage = ({ user, documents, rosterCount = 0, onUpload, onDelete, onSign }) => {
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
const CoachCenterPage = ({ practiceProps, gameDayProps, gameStatsProps, rosterProps, calendarProps, documentsProps, announcementsProps }) => {
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
const DEFAULT_NUTRITION_CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-Game", "Post-Game"];

// Default a freshly logged item to whichever standard meal slot the current
// time falls into. Players can override in the manual form before saving.
const timeOfDayCategory = () => {
  const h = new Date().getHours();
  if (h < 11) return "Breakfast";
  if (h < 15) return "Lunch";
  if (h < 21) return "Dinner";
  return "Snacks";
};

const TargetBar = ({ label, value, goal, unit }) => {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1"><span>{label}</span><span>{value}/{goal} {unit}</span></div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? COLORS.success : COLORS.accent }} /></div>
    </div>
  );
};

// The player's OWN daily goal (calories + protein, optional). No coach sets
// it — the player sets it for themselves if they want to, and it lives in
// their private food-log area (logs/{uid}/goals/main). The hero bars and the
// Today checklist show progress against this goal when one is set.
const MyNutritionGoalSection = ({ goal, totals = { cal: 0, protein: 0 }, onSave, onClear }) => {
  const [open, setOpen] = useState(false);
  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [busy, setBusy] = useState(false);
  const hasGoal = goal && (goal.cal > 0 || goal.protein > 0);

  const startEdit = () => {
    setCal(goal?.cal ? String(goal.cal) : "");
    setProtein(goal?.protein ? String(goal.protein) : "");
    setOpen(true);
  };
  const save = async () => {
    if (!cal && !protein) return;
    setBusy(true);
    try {
      await onSave({ cal, protein });
      setOpen(false);
    } catch (e) {
      toast("Couldn't save goal — " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!confirm("Clear your daily goal?")) return;
    try { await onClear(); setOpen(false); } catch (e) { toast("Couldn't clear — " + (e.message || "")); }
  };

  return (
    <div className="px-5">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">My daily goal</h3>
          {hasGoal && !open && (
            <div className="flex gap-1.5">
              <button onClick={startEdit} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Edit</button>
              <button onClick={clear} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Clear</button>
            </div>
          )}
        </div>
        {hasGoal && !open ? (
          <div className="space-y-2">
            {goal.cal > 0 && <TargetBar label="Calories" value={totals.cal} goal={goal.cal} unit="kcal" />}
            {goal.protein > 0 && <TargetBar label="Protein" value={totals.protein} goal={goal.protein} unit="g" />}
            <p className="text-[10px] text-slate-400">Your goal is just for you — coaches don't set it.</p>
          </div>
        ) : open ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={cal} onChange={(e) => setCal(e.target.value)} placeholder="Calories" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Protein g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || (!cal && !protein)} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save goal"}</button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full text-xs font-bold bg-slate-100 text-slate-600">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500">No goal set — totally optional. Set your own daily calories and protein if you want something to aim at.</p>
            <button onClick={startEdit} className="mt-2 w-full py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Set my goal</button>
          </div>
        )}
      </div>
    </div>
  );
};


const NutritionPage = ({ user, recipes, addRecipe, updateRecipe, deleteRecipe, importRecipes, seedRecipes, categories, addCategory, logged, addLog, updateLog, deleteLog, waterCups, setWaterCups, myNutritionGoal, myNutritionTotals, saveMyNutritionGoal, clearMyNutritionGoal, savedFoods = [], addSavedFood, deleteSavedFood }) => {
  const isAdmin = user.role === "admin";
  // Union of premade defaults + admin's custom categories. Defaults are
  // always available so the UI is never empty and players have a sane set
  // to file food into on day one.
  const effectiveCategories = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...DEFAULT_NUTRITION_CATEGORIES, ...categories].forEach((c) => {
      if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    });
    return out;
  }, [categories]);
  const [catPref, setCat] = useState(effectiveCategories[0] || "Breakfast");
  const cat = effectiveCategories.includes(catPref) ? catPref : (effectiveCategories[0] || catPref);
  const [sub, setSub] = useState(null);
  // Food-type sub-category filter within the active meal category (e.g. Lunch →
  // "Fish & Seafood"). null = "All". A stale pick (from another category) simply
  // resolves back to "All" via `activeSub` below — no reset effect needed.
  const [subCat, setSubCat] = useState(null);
  const [manual, setManual] = useState({ name: "", cat: timeOfDayCategory(), cal: "", p: "", c: "", f: "" });
  const [showManual, setShowManual] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  // Status note for the log form (barcode lookups) — shown as a banner above
  // the manual entry fields. (Food photo AI was removed — no photo flow.)
  const [formState, setFormState] = useState("idle"); // idle | uploading | done | error
  const [formNote, setFormNote] = useState("");
  // Barcode scanner — html5-qrcode + Open Food Facts lookup.
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleBarcode = async (code) => {
    setScannerOpen(false);
    setShowManual(true);
    setFormState("uploading");
    setFormNote(`Looking up ${code}…`);
    try {
      const data = await lookupBarcode(code);
      applyPer100(data.name || `Product ${code}`, data);
      setFormNote(`Open Food Facts · values per 100g — set the amount you ate below.`);
      setFormState("done");
    } catch (e) {
      setFormState("error");
      setFormNote(e.message || "Barcode lookup failed");
    }
  };

  const searchQuery = showManual ? manual.name.trim() : "";
  const searchActive = searchQuery.length >= 2;
  useEffect(() => {
    if (!searchActive) return;
    const q = searchQuery;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      // Open Food Facts (packaged foods, instant) and USDA (whole foods, via
      // a server function — a second or two) run at once. Results show as
      // each source answers, USDA first in the list, de-duped by name.
      const bySource = { usda: [], off: [] };
      const errors = [];
      const show = () => {
        const merged = [];
        const seen = new Set();
        [...bySource.usda, ...bySource.off].forEach((r) => {
          const key = (r.name || "").toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          merged.push(r);
        });
        setSearchResults(merged.slice(0, 16));
      };
      const run = (src, p) => p.then((rows) => { if (!ctl.signal.aborted) { bySource[src] = rows || []; show(); } })
        .catch((e) => { if (e?.name !== "AbortError") errors.push(e); });
      const tasks = [run("off", searchProducts(q, ctl.signal))];
      if (usdaAvailable()) tasks.push(run("usda", searchFoods(q, ctl.signal)));
      await Promise.all(tasks);
      if (ctl.signal.aborted) return;
      setSearchErr(!bySource.usda.length && !bySource.off.length && errors.length ? (errors[0]?.message || "search failed") : "");
      setSearching(false);
    }, 300);
    return () => { clearTimeout(timer); ctl.abort(); setSearching(false); };
  }, [searchQuery, searchActive]);
  // Search and barcode results are per 100 g. Keep the base values and let
  // the player enter the amount they actually ate; macros scale from it.
  const [per100, setPer100] = useState(null); // { cal, p, c, f } | null
  const [grams, setGrams] = useState("100");
  const scaled = (base, g) => {
    const k = (Number(g) || 0) / 100;
    return {
      cal: String(Math.round((Number(base.cal) || 0) * k)),
      p: String(Math.round((Number(base.p) || 0) * k)),
      c: String(Math.round((Number(base.c) || 0) * k)),
      f: String(Math.round((Number(base.f) || 0) * k)),
    };
  };
  const applyPer100 = (name, base) => {
    setPer100(base);
    setGrams("100");
    setManual((m) => ({ ...m, name, ...scaled(base, 100) }));
  };
  const changeGrams = (g) => {
    setGrams(g);
    if (per100) setManual((m) => ({ ...m, ...scaled(per100, g) }));
  };
  const pickFood = (r) => {
    applyPer100(r.name, r);
    setSearchResults([]);
  };
  // admin recipe management
  const [mode, setMode] = useState("single");
  const [single, setSingle] = useState({ name: "", cat: categories[0] || "Breakfast", sub: "", cal: "", p: "", c: "", f: "", prep: "", ingredients: "" });
  const [seeding, setSeeding] = useState(false);
  const runSeedRecipes = async () => {
    if (!seedRecipes || seeding) return;
    setSeeding(true);
    setImportMsg("");
    try {
      const { added, skipped } = await seedRecipes();
      setImportMsg(added ? `Added ${added} starter recipe${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All starter recipes are already added.");
    } catch (e) {
      setImportMsg("Couldn't add starter recipes — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [newCat, setNewCat] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const inCat = recipes.filter((m) => m.cat === cat);
  // Food-type sub-categories present in this meal category (recipes without a
  // `sub` fall under "Other" so nothing is hidden). Only shown when there's more
  // than one, so simple libraries stay clean.
  const subCats = useMemo(() => {
    const seen = [];
    inCat.forEach((m) => { const s = m.sub || "Other"; if (!seen.includes(s)) seen.push(s); });
    return seen;
  }, [inCat]);
  // A sub pick only applies if it exists in the current category, so switching
  // meal categories cleanly falls back to "All" without a reset effect.
  const activeSub = subCat && subCats.includes(subCat) ? subCat : null;
  const filtered = activeSub ? inCat.filter((m) => (m.sub || "Other") === activeSub) : inCat;
  const todayKey = formatDayKey(new Date());
  const todayLogs = logged.filter((l) => formatDayKey(l.createdAt) === todayKey);
  const totals = todayLogs.reduce((a, l) => ({ cal: a.cal + (l.cal || 0), p: a.p + (l.p || 0), c: a.c + (l.c || 0), f: a.f + (l.f || 0) }), { cal: 0, p: 0, c: 0, f: 0 });
  const streak = computeStreak(logged);
  // Group today's log by the categorical bucket the user (or recipe) picked
  // when logging. Falls back to the time-of-day bucket for older entries
  // that pre-date the `cat` field, so existing data isn't orphaned.
  const todayByCat = useMemo(() => {
    const map = {};
    todayLogs.forEach((l) => {
      const c = l.cat || mealBucket(l.createdAt) || "Other";
      (map[c] = map[c] || []).push(l);
    });
    return map;
  }, [todayLogs]);
  const catOrder = useMemo(() => {
    const present = Object.keys(todayByCat);
    const known = effectiveCategories.filter((c) => present.includes(c));
    const extras = present.filter((c) => !effectiveCategories.includes(c));
    return [...known, ...extras];
  }, [todayByCat, effectiveCategories]);

  const nowTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const log = (m) => addLog({ name: m.name, cat: m.cat || timeOfDayCategory(), cal: m.cal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0, time: nowTime(), feeling: null }).catch((e) => toast("Couldn't log — " + e.message));

  // Quick-add: one-tap re-log a saved or recent food.
  const quickLog = async (m) => {
    try { await addLog({ name: m.name, cat: timeOfDayCategory(), cal: Number(m.cal) || 0, p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, time: nowTime(), feeling: null }); toast(`Logged ${m.name}`); }
    catch (e) { toast("Couldn't log — " + (e.message || "")); }
  };
  // Load a food into the manual form so the portion can be tweaked before logging.
  const fillFromFood = (m) => {
    setManual({ name: m.name || "", cat: manual.cat || timeOfDayCategory(), cal: m.cal != null ? String(m.cal) : "", p: m.p != null ? String(m.p) : "", c: m.c != null ? String(m.c) : "", f: m.f != null ? String(m.f) : "" });
    setSearchResults([]);
    setShowManual(true);
  };
  const isSaved = (name) => (savedFoods || []).some((s) => (s.name || "").toLowerCase() === (name || "").toLowerCase());
  const saveFood = async (m) => {
    const name = (m.name || "").trim();
    if (!name || !addSavedFood) return;
    if (isSaved(name)) { toast(`${name} is already saved`); return; }
    try { await addSavedFood({ name, cal: Number(m.cal) || 0, p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0 }); toast(`Saved ${name}`); }
    catch (e) { toast("Couldn't save — " + (e.message || "")); }
  };
  // Recent distinct foods from the log (most-recent first), for quick re-logging.
  const recentFoods = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const l of logged || []) {
      const key = (l.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: l.name, cal: l.cal || 0, p: l.p || 0, c: l.c || 0, f: l.f || 0 });
      if (out.length >= 12) break;
    }
    return out;
  }, [logged]);
  const addManual = async () => {
    if (!manual.name.trim()) return;
    try {
      await addLog({
        name: manual.name.trim(),
        cat: manual.cat || timeOfDayCategory(),
        cal: Number(manual.cal) || 0,
        p: Number(manual.p) || 0,
        c: Number(manual.c) || 0,
        f: Number(manual.f) || 0,
        time: nowTime(),
        feeling: null,
        custom: true,
      });
      setManual({ name: "", cat: timeOfDayCategory(), cal: "", p: "", c: "", f: "" });
      setPer100(null);
      setGrams("100");
      setSearchResults([]);
      setFormState("idle");
      setFormNote("");
      setShowManual(false);
    } catch (e) {
      toast("Couldn't add — " + e.message);
    }
  };
  const rate = (logId, feeling) => updateLog(logId, { feeling }).catch(reportError("Couldn't save the rating"));
  const removeLog = (logId) => deleteLog(logId).catch(reportError("Couldn't remove the entry"));

  const addSingle = async () => {
    if (!single.name.trim()) return;
    const name = single.name.trim();
    const targetCat = single.cat || "Other";
    try {
      if (targetCat && !categories.includes(targetCat)) await addCategory(targetCat);
      const data = {
        name, cat: targetCat,
        sub: (single.sub || "").trim(),
        cal: Number(single.cal) || 0,
        p: Number(single.p) || 0,
        c: Number(single.c) || 0,
        f: Number(single.f) || 0,
        prep: single.prep || "—",
        ingredients: single.ingredients.split(",").map((x) => x.trim()).filter(Boolean),
      };
      if (editingRecipeId) {
        await updateRecipe(editingRecipeId, data);
        setImportMsg(`Updated "${name}".`);
        setEditingRecipeId(null);
      } else {
        await addRecipe(data);
        setImportMsg(`Added "${name}" to ${targetCat}.`);
      }
      setSingle({ name: "", cat: targetCat, sub: single.sub, cal: "", p: "", c: "", f: "", prep: "", ingredients: "" });
    } catch (e) {
      setImportMsg("Couldn't save recipe — " + (e.message || "check Firestore rules."));
    }
  };
  const startEditRecipe = (r) => {
    setEditingRecipeId(r.id);
    setSingle({
      name: r.name || "",
      cat: r.cat || categories[0] || "Breakfast",
      sub: r.sub || "",
      cal: String(r.cal || ""),
      p: String(r.p || ""),
      c: String(r.c || ""),
      f: String(r.f || ""),
      prep: r.prep || "",
      ingredients: (r.ingredients || []).join(", "),
    });
    setSub("manage");
    setMode("single");
    setImportMsg("");
  };
  const removeRecipe = (id) => {
    if (!confirm("Delete this recipe?")) return;
    deleteRecipe(id).catch((e) => toast("Couldn't delete — " + e.message));
  };
  const submitCategory = async () => {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    try {
      await addCategory(c);
      setImportMsg(`Added category "${c}".`);
      setNewCat("");
    } catch (e) {
      setImportMsg("Couldn't add category — " + (e.message || "check Firestore rules."));
    }
  };
  const doImport = async () => {
    const parsed = parseRecipeCSV(csvText);
    if (!parsed.length) { setImportMsg("No valid rows found — check the format."); return; }
    const newCats = [...new Set(parsed.map((r) => r.cat))].filter((c) => c && !categories.includes(c));
    try {
      for (const c of newCats) await addCategory(c);
      await importRecipes(parsed);
      setImportMsg(`Imported ${parsed.length} recipe${parsed.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new categor${newCats.length === 1 ? "y" : "ies"}` : ""}.`);
      setCsvText("");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check Firestore rules."));
    }
  };

  if (sub === "manage") {
    return (
      <div className="px-5 pt-5 pb-4 space-y-5">
        <button onClick={() => { setSub(null); setImportMsg(""); }} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back to Nutrition</button>
        <div><h2 className="text-xl font-bold text-slate-900">Manage Recipes</h2><p className="text-xs text-slate-500 mt-0.5">{recipes.length} recipes · {categories.length} categories</p></div>

        <div className="bg-white rounded-full p-1 flex border border-slate-100 shadow-sm">
          {[["single", "Add One"], ["sheet", "From Sheet"], ["category", "Category"]].map(([id, lbl]) => (
            <button key={id} onClick={() => { setMode(id); setImportMsg(""); }} className={`flex-1 text-xs font-semibold py-2 rounded-full ${mode === id ? "text-white" : "text-slate-500"}`} style={mode === id ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
          ))}
        </div>

        {importMsg && <div className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Check className="w-3.5 h-3.5" />{importMsg}</div>}

        {seedRecipes && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Apple className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900">Add starter recipes</div>
              <div className="text-[10px] text-slate-500">132 recipes across every meal, by food type — including simple school-lunch picks (5 ingredients or less). Skips ones you already have.</div>
            </div>
            <button onClick={runSeedRecipes} disabled={seeding} className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{seeding ? "Adding…" : "Add"}</button>
          </div>
        )}

        {mode === "single" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            <input value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} placeholder="Recipe name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="grid grid-cols-2 gap-2">
              <select value={single.cat} onChange={(e) => setSingle({ ...single, cat: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">{effectiveCategories.map((c) => <option key={c}>{c}</option>)}</select>
              <input list="recipe-subs" value={single.sub} onChange={(e) => setSingle({ ...single, sub: e.target.value })} placeholder="Food type (e.g. Poultry)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <datalist id="recipe-subs">{[...new Set(recipes.map((r) => r.sub).filter(Boolean))].map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[["cal", "Cal"], ["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]].map(([k, lbl]) => (
                <input key={k} type="number" value={single[k]} onChange={(e) => setSingle({ ...single, [k]: e.target.value })} placeholder={lbl} className="border border-slate-200 rounded-lg px-2 py-2 text-xs text-center focus:outline-none focus:ring-2 focus:ring-slate-200" />
              ))}
            </div>
            <input value={single.prep} onChange={(e) => setSingle({ ...single, prep: e.target.value })} placeholder="Prep time (e.g. 15 min)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <input value={single.ingredients} onChange={(e) => setSingle({ ...single, ingredients: e.target.value })} placeholder="Main ingredients, comma-separated (e.g. chicken, rice, beans)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={addSingle} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>{editingRecipeId ? "Save Changes" : "Add Recipe"}</button>
            {editingRecipeId && (
              <button onClick={() => { setEditingRecipeId(null); setSingle({ name: "", cat: single.cat, sub: "", cal: "", p: "", c: "", f: "", prep: "", ingredients: "" }); setImportMsg(""); }} className="w-full mt-1 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100">Cancel Edit</button>
            )}
          </div>
        )}

        {mode === "sheet" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600">Paste rows from a spreadsheet, or upload a .csv</div>
              <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6} placeholder={CSV_TEMPLATE} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <div className="flex gap-2">
                <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer">
                  Upload CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result)); r.readAsText(f); }} />
                </label>
                <button onClick={() => setCsvText(CSV_TEMPLATE)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Fill Example</button>
              </div>
              <button onClick={doImport} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Import Recipes</button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed px-1">Columns: name, category, calories, protein, carbs, fat, prep. New categories are created automatically. The header row is optional.</p>
          </div>
        )}

        {mode === "category" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitCategory()} placeholder="New category (e.g. Pre-Game)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={submitCategory} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Add Category</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">{c}</span>)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sub === "log") {
    return (
      <div className="px-5 pt-5 pb-4 space-y-5">
        <button onClick={() => setSub(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back to Meals</button>
        <NutritionHero totals={totals} goal={myNutritionGoal} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />

        <button onClick={() => setShowManual(!showManual)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
          <Plus className="w-3.5 h-3.5" /> Log Something
        </button>
        <button onClick={() => setScannerOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
          <ScanLine className="w-3.5 h-3.5" /> Scan a Barcode
        </button>
        {scannerOpen && <BarcodeScannerModal onClose={() => setScannerOpen(false)} onScan={handleBarcode} />}

        {/* Quick add — one tap re-logs a saved or recent food. */}
        {(savedFoods.length > 0 || recentFoods.length > 0) && (
          <div className="space-y-3">
            {savedFoods.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1 flex items-center gap-1"><Star className="w-3 h-3" style={{ color: COLORS.accent }} /> Saved foods</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedFoods.map((s) => (
                    <div key={s.id} className="flex items-center rounded-full border overflow-hidden bg-white" style={{ borderColor: COLORS.border }}>
                      <button onClick={() => quickLog(s)} title={`Log ${s.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">{s.cal} cal</span>
                      </button>
                      <button onClick={() => fillFromFood(s)} title="Edit portion" className="px-1.5 py-1.5 text-slate-300 hover:text-slate-600 border-l" style={{ borderColor: COLORS.border }}><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => { if (confirm(`Remove "${s.name}" from saved foods?`)) Promise.resolve(deleteSavedFood(s.id)).catch(reportError("Couldn't remove it")); }} title="Remove from saved" className="px-2 py-1.5 text-slate-300 hover:text-red-500 border-l" style={{ borderColor: COLORS.border }}><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentFoods.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentFoods.map((r, i) => (
                    <div key={i} className="flex items-center rounded-full border overflow-hidden bg-white" style={{ borderColor: COLORS.border }}>
                      <button onClick={() => quickLog(r)} title={`Log ${r.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-slate-800">{r.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">{r.cal} cal</span>
                      </button>
                      <button onClick={() => saveFood(r)} title={isSaved(r.name) ? "Saved" : "Save to favorites"} className="px-2 py-1.5 border-l" style={{ borderColor: COLORS.border, color: isSaved(r.name) ? COLORS.accent : "#cbd5e1" }}><Star className="w-3 h-3" fill={isSaved(r.name) ? COLORS.accent : "none"} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {showManual && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            {formState !== "idle" && (
              <div className="rounded-lg px-3 py-2 text-[11px] font-semibold flex items-start gap-2" style={{
                backgroundColor: formState === "error" ? "#FEE2E2" : formState === "done" ? COLORS.accentSoft : "#E0F2FE",
                color: formState === "error" ? "#991B1B" : formState === "done" ? COLORS.primary : "#075985",
              }}>
                {formState === "uploading" && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />}
                {formState === "done" && <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                {formState === "error" && <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span className="leading-snug">{formNote}</span>
                {formState !== "uploading" && (
                  <button onClick={() => { setFormState("idle"); setFormNote(""); }} className="ml-auto opacity-60 hover:opacity-100 flex-shrink-0" aria-label="Dismiss"><X className="w-3 h-3" /></button>
                )}
              </div>
            )}
            <div className="relative">
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Search foods or type your own…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              {searching && searchActive && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold">searching…</span>}
            </div>
            {searchErr && <p className="text-[10px] text-red-500 font-medium px-1">{searchErr}</p>}
            {searchActive && searchResults.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                {searchResults.map((r) => (
                  <li key={r.fdcId || r.barcode || r.name}>
                    <button type="button" onClick={() => pickFood(r)} className="w-full text-left px-3 py-2 hover:bg-white">
                      <div className="text-xs font-semibold text-slate-900 leading-tight">{r.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{r.cal} kcal · P {r.p}g · C {r.c}g · F {r.f}g <span className="text-slate-400">(per 100g)</span></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <select value={manual.cat} onChange={(e) => setManual({ ...manual, cat: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {effectiveCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
            {per100 && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold">Amount eaten</span>
                <input type="number" min="0" value={grams} onChange={(e) => changeGrams(e.target.value)} className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <span>g</span>
                <span className="text-[10px] text-slate-400">(values scale from per-100 g)</span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.cal} onChange={(e) => setManual({ ...manual, cal: e.target.value })} placeholder="Calories" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.p} onChange={(e) => setManual({ ...manual, p: e.target.value })} placeholder="Protein g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.c} onChange={(e) => setManual({ ...manual, c: e.target.value })} placeholder="Carbs g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.f} onChange={(e) => setManual({ ...manual, f: e.target.value })} placeholder="Fat g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button onClick={() => saveFood(manual)} disabled={!manual.name.trim()} title="Save to favorites" className="px-4 py-2 rounded-full text-xs font-bold border-2 bg-white flex items-center gap-1.5 disabled:opacity-40" style={{ borderColor: COLORS.primary, color: COLORS.primary }}><Star className="w-3.5 h-3.5" fill={isSaved(manual.name) ? COLORS.primary : "none"} /> Save</button>
              <button onClick={addManual} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Add to Log</button>
            </div>

          </div>
        )}

        <div>
          <h3 className="font-bold text-sm text-slate-900 mb-2 px-1">Today's Log</h3>
          {todayLogs.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-8 bg-white rounded-2xl shadow-sm border border-slate-100">Nothing logged yet today.</p>
          ) : (
            <div className="space-y-3">
              {catOrder.map((bucket) => (
                <div key={bucket}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 px-1 mb-1.5">{bucket}</div>
                  <ul className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {todayByCat[bucket].map((l, i, arr) => (
                      <li key={l.id} className={`px-4 py-3 ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Flame className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">{l.name}{l.custom && <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Custom</span>}</div>
                            <div className="text-[10px] text-slate-500">{l.time || formatTime(l.createdAt)} · {l.cal} kcal · P{l.p}</div>
                          </div>
                          <button onClick={() => removeLog(l.id)} aria-label={`Remove ${l.name}`} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="mt-2 pl-12">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">How did you feel after?</div>
                          <div className="flex gap-1.5">
                            {FEELINGS.map((f) => (
                              <button key={f} onClick={() => rate(l.id, f)} className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all" style={l.feeling === f ? { backgroundColor: FEELING_COLOR[f], color: "white", borderColor: FEELING_COLOR[f] } : { color: COLORS.textSecondary, borderColor: COLORS.border }}>{f}</button>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-5 pb-4 space-y-5">
      {/* Today's totals up front — calories, protein, carbs, fat, water — with
          progress against the player's OWN goal when they set one. */}
      <div className="px-5">
        <NutritionHero totals={totals} goal={myNutritionGoal} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />
      </div>
      <MyNutritionGoalSection goal={myNutritionGoal} totals={myNutritionTotals} onSave={saveMyNutritionGoal} onClear={clearMyNutritionGoal} />
      <div className="px-5 space-y-2">
        <button onClick={() => setSub("log")} className="w-full py-3 rounded-full text-sm font-bold uppercase tracking-wider text-white flex items-center justify-center gap-2 shadow-sm" style={{ backgroundColor: COLORS.primary }}>
          <Plus className="w-4 h-4" /> Log Food · {todayLogs.length} logged today
        </button>
        {isAdmin && (
          <button onClick={() => setSub("manage")} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.accentSoft }}><Plus className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
            <div className="text-left flex-1"><div className="text-xs font-bold text-slate-900">Manage Recipes</div><div className="text-[10px] text-slate-500">Add recipes & categories, or import a sheet</div></div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>
      <div className="px-5 flex gap-2 overflow-x-auto">
        {effectiveCategories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
        ))}
      </div>
      {subCats.length > 1 && (
        <div className="px-5 flex gap-1.5 overflow-x-auto">
          <button onClick={() => setSubCat(null)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${activeSub === null ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200"}`} style={activeSub === null ? { backgroundColor: COLORS.accent } : {}}>All</button>
          {subCats.map((s) => (
            <button key={s} onClick={() => setSubCat(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${activeSub === s ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200"}`} style={activeSub === s ? { backgroundColor: COLORS.accent } : {}}>{s}</button>
          ))}
        </div>
      )}
      <div className="px-5 space-y-2.5">
        {filtered.length === 0 && <p className="text-sm text-slate-400 italic text-center py-8 bg-white rounded-2xl shadow-sm border border-slate-100">No recipes here yet.</p>}
        {filtered.map((m) => (
          <article key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-900">{m.name}</h4>
                {m.sub && <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{m.sub}</span>}
                {m.ingredients && m.ingredients.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">{m.ingredients.join(" · ")}</div>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.prep}</span><span className="flex items-center gap-1"><Flame className="w-3 h-3" />{m.cal} kcal</span><span>P {m.p}g</span><span>C {m.c}g</span><span>F {m.f}g</span></div>
              </div>
              {!isAdmin ? (
                <button onClick={() => log(m)} className="flex-shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>Log</button>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => startEditRecipe(m)} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeRecipe(m.id)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/* ─── BARCODE SCANNER MODAL ─── */
const BarcodeScannerModal = ({ onClose, onScan }) => {
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });

  useEffect(() => {
    let cancelled = false;
    let scanner = null;
    (async () => {
      try {
        // Loaded on demand — keeps the scanner library out of the main bundle.
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode("brophy-barcode-scanner", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          // Never use the browser's native BarcodeDetector: Safari on iPhone
          // does not support it, which is why the old scanner always failed
          // there. The library's own decoder works wherever getUserMedia does.
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10 },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            onScanRef.current(decodedText);
          },
          () => { /* per-frame misses are normal */ }
        );
        if (cancelled) {
          // Unmounted while the camera was starting: release it.
          scanner.stop().catch(() => {});
          return;
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr("Couldn't access camera - " + (e?.message || e || "permission denied?"));
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      scanner = null;
      if (s) {
        // stop() throws when the camera never started; clear() frees the view.
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* already cleared */ } });
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><ScanLine className="w-4 h-4" style={{ color: COLORS.primary }} /> Scan a barcode</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="aspect-video bg-slate-900 relative">
          {err ? (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm px-6 text-center">{err}</div>
          ) : (
            <>
              <div id="brophy-barcode-scanner" className="w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-20 border-2 rounded-lg" style={{ borderColor: COLORS.accent, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
              </div>
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs">Starting camera…</div>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-slate-500 text-center py-3 px-4">Center a barcode in the box. It scans automatically.</p>
      </div>
    </div>
  );
};

/* ─── CHAT (pin + shared media/links + threads + polls + read receipts + photos) ─── */
const URL_RE = /(https?:\/\/[^\s]+)/;
// Render chat text with clickable links. Trailing punctuation is kept out of
// the href so "see https://x.com." doesn't carry the period into the link.
const Linkify = ({ children, className = "" }) => {
  const text = children || "";
  if (typeof text !== "string" || !URL_RE.test(text)) return text;
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (i % 2 === 0) return part;
    const trail = (part.match(/[.,;:!?)\]}'"]+$/) || [""])[0];
    const href = trail ? part.slice(0, -trail.length) : part;
    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`underline underline-offset-2 break-all ${className}`}>{href}</a>{trail}
      </span>
    );
  });
};
// Reactions a member can leave on a message — one at a time, tap to toggle.
const REACTIONS = [["like", "👍"], ["dislike", "👎"], ["heart", "❤️"]];

/* ─── iMessage-style chat pieces ─────────────────────────────────────────── */
const IOS_GRAY = "#E9E9EB";
const GROUP_GAP_MS = 5 * 60 * 1000; // messages within 5 min from one sender group together
const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : Date.now());

// Bubble corners like iMessage: fully round, with the corner nearest the
// next/previous bubble from the same sender tightened.
const bubbleRadius = (own, first, last) => {
  const big = "18px", small = "6px";
  return own
    ? `${big} ${first ? big : small} ${last ? big : small} ${big}`
    : `${first ? big : small} ${big} ${big} ${last ? big : small}`;
};

// Long-press (touch), right-click (mouse) or double-click opens the message
// menu. Moving the finger (scrolling) cancels the press.
const LongPress = ({ onLong, children, className = "", style }) => {
  const timer = useRef(null);
  const origin = useRef(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return (
    <div
      className={className}
      style={{ WebkitTouchCallout: "none", ...style }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => { timer.current = null; onLong(); if (navigator.vibrate) navigator.vibrate(10); }, 420);
      }}
      onPointerMove={(e) => {
        if (!timer.current || !origin.current) return;
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => { e.preventDefault(); clear(); onLong(); }}
      onDoubleClick={(e) => { e.preventDefault(); onLong(); }}
    >
      {children}
    </div>
  );
};

// Tapback badge on the bubble's corner — only when someone has reacted.
const ReactionBadge = ({ reactions = {}, myUid, own, onClick }) => {
  const counts = REACTIONS.map(([key, emoji]) => [key, emoji, Object.values(reactions).filter((v) => v === key).length]).filter(([, , n]) => n > 0);
  if (!counts.length) return null;
  const total = counts.reduce((s, [, , n]) => s + n, 0);
  const mine = Boolean(reactions[myUid]);
  return (
    <button onClick={onClick} aria-label={`${total} reaction${total === 1 ? "" : "s"}`}
      className={`absolute -top-3 ${own ? "-left-2" : "-right-2"} z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] leading-none shadow-sm border`}
      style={{ backgroundColor: mine ? COLORS.accentSoft : "#fff", borderColor: mine ? COLORS.accent : "#E2E8F0" }}>
      {counts.map(([key, emoji]) => <span key={key}>{emoji}</span>)}
      {total > 1 && <span className="text-[10px] font-bold text-slate-500 ml-0.5">{total}</span>}
    </button>
  );
};

// Context menu for a message (iOS style): tapback row + actions.
const MessageActionSheet = ({ preview, own, myReaction, onReact, actions = [], onClose }) => (
  <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 bg-black/35 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-xs space-y-2" onClick={(e) => e.stopPropagation()}>
      {onReact && (
        <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
          <div className="flex items-center gap-1 bg-white rounded-full shadow-xl px-2 py-1.5">
            {REACTIONS.map(([key, emoji]) => (
              <button key={key} onClick={() => { onReact(myReaction === key ? null : key); onClose(); }} aria-label={key}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-transform active:scale-90"
                style={myReaction === key ? { backgroundColor: COLORS.accentSoft } : {}}>{emoji}</button>
            ))}
          </div>
        </div>
      )}
      <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
        <div className="max-w-full rounded-[18px] px-3.5 py-2 text-[15px] leading-snug shadow-xl line-clamp-6 break-words"
          style={own ? { backgroundColor: COLORS.primary, color: "#fff" } : { backgroundColor: "#fff", color: "#0F172A" }}>{preview}</div>
      </div>
      <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
        <div className="w-56 bg-white/95 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.label} onClick={() => { a.onClick(); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-[15px] ${a.danger ? "text-red-600" : "text-slate-900"} active:bg-slate-100`}>
                {a.label}<Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

// Message box: one ＋ button (opens a tray of attachments/tools), a
// full-width text field that grows to 5 lines, and the send arrow inside it.
const ChatComposer = ({ value, onChange, onSend, placeholder, uploading = false, actions = [], banner = null }) => {
  const [trayOpen, setTrayOpen] = useState(false);
  const canSend = value.trim().length > 0;
  return (
    <div className="bg-white/95 backdrop-blur border-t border-slate-200 shrink-0">
      {banner}
      {trayOpen && actions.length > 0 && (
        <div className="px-3 pt-3 pb-1 grid grid-cols-4 gap-1">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.key} disabled={a.disabled} onClick={() => { a.onClick(); if (!a.keepOpen) setTrayOpen(false); }}
                className="flex flex-col items-center gap-1 py-1.5 rounded-2xl disabled:opacity-40 active:bg-slate-100">
                <span className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                  style={a.active ? { backgroundColor: COLORS.primary, color: "#fff" } : { backgroundColor: "#F1F5F9", color: COLORS.primary }}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="px-3 py-2 flex items-end gap-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {actions.length > 0 && (
          <button onClick={() => setTrayOpen((o) => !o)} aria-label={trayOpen ? "Close attachments" : "Add a photo, video, file or poll"} aria-expanded={trayOpen}
            className="w-9 h-9 mb-[2px] rounded-full flex items-center justify-center shrink-0 transition-transform"
            style={{ backgroundColor: "#F1F5F9", color: COLORS.textSecondary, transform: trayOpen ? "rotate(45deg)" : "none" }}>
            {uploading ? <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-end rounded-[20px] border border-slate-300 bg-white pl-3.5 pr-1 py-1 focus-within:border-slate-400">
          <AutoGrowTextarea value={value} onChange={onChange} onSubmit={onSend} placeholder={placeholder} aria-label="Message"
            className="flex-1 min-w-0 bg-transparent text-[15px] py-1 focus:outline-none" />
          <button onClick={onSend} disabled={!canSend} aria-label="Send"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 transition-opacity"
            style={{ backgroundColor: COLORS.primary, opacity: canSend ? 1 : 0.25 }}>
            <ArrowUp className="w-[18px] h-[18px]" strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};

const PollCard = ({ message, own, myUid, onVote, isAdmin = false, onSeeVoters }) => {
  // My own vote doc (private); tallies come from `voteCounts` on the poll
  // (server-maintained). Legacy polls fall back to the old votes map.
  const myVoteDoc = useDoc(message?.id && myUid ? `messages/${message.id}/votes/${myUid}` : null);
  const legacy = message.votes || {};
  const myVote = myVoteDoc ? myVoteDoc.option : legacy[myUid];
  const opts = message.options || [];
  const totals = Array.isArray(message.voteCounts)
    ? opts.map((_, i) => Number(message.voteCounts[i]) || 0)
    : opts.map((_, i) => Object.values(legacy).filter((v) => v === i).length);
  const totalVotes = totals.reduce((a, b) => a + b, 0);
  const handle = (i) => { if (myVote !== i) onVote(i).catch((e) => toast("Couldn't vote — " + (e.message || ""))); };
  return (
    <div className={`rounded-2xl px-3 py-2.5 shadow-sm w-64 ${own ? "text-white" : "bg-white text-slate-900"}`} style={own ? { backgroundColor: COLORS.primary } : {}}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${own ? "text-white/70" : "text-slate-500"}`}>
        <BarChart3 className="w-3 h-3" /> Poll
      </div>
      <p className="text-sm font-semibold leading-snug break-words mb-2">{message.question}</p>
      <ul className="space-y-1.5">
        {opts.map((opt, i) => {
          const count = totals[i] || 0;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const isMine = myVote === i;
          return (
            <li key={i}>
              <button onClick={() => handle(i)} className="w-full text-left relative rounded-lg overflow-hidden border" style={{ borderColor: isMine ? COLORS.accent : (own ? "rgba(255,255,255,0.2)" : COLORS.border) }}>
                <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: isMine ? (own ? "rgba(166,25,46,0.45)" : COLORS.accentSoft) : (own ? "rgba(255,255,255,0.12)" : "rgba(152,0,0,0.06)") }} />
                <div className="relative px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate flex items-center gap-1">
                    {isMine && <Check className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.accent }} />}
                    {opt}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80">{count} · {pct}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`text-[10px] mt-2 ${own ? "text-white/60" : "text-slate-400"}`}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"}{myVote != null ? " · You voted" : ""}
      </div>
      {isAdmin && onSeeVoters && (
        <button onClick={onSeeVoters} className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${own ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-slate-700"}`}>
          See who voted →
        </button>
      )}
    </div>
  );
};

// Pick who an item is for: Everyone, or a mix of existing groups + individual
// players. Players show the display name from their own profile, with their
// email underneath as the disambiguator. Shared by the create form and the
// after-the-fact membership editor below so the two can't drift apart.
const AudiencePicker = ({ groups = [], players = [], nameOf, mode, setMode, groupIds, setGroupIds, emails, setEmails }) => {
  const toggle = (arr, setArr, val) => setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setMode("everyone")} className={`flex-1 py-2 rounded-full text-xs font-bold ${mode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={mode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
        <button onClick={() => setMode("custom")} className={`flex-1 py-2 rounded-full text-xs font-bold ${mode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={mode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
      </div>
      {mode === "custom" && (
        <div className="space-y-2">
          {groups.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Groups</p>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>;
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Players</p>
            {players.length === 0 ? <p className="text-[11px] text-slate-400 italic">No players on the roster yet.</p> : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {players.map((p) => {
                  const on = emails.includes(p.email);
                  const nm = nameOf(p.email);
                  return (
                    <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                      <span className="min-w-0 flex-1">
                        {nm
                          ? <><span className="text-xs font-semibold text-slate-800 truncate block leading-tight">{nm}</span><span className="text-[10px] font-mono text-slate-400 truncate block leading-tight">{p.email}</span></>
                          : <span className="text-xs font-mono text-slate-700 truncate block">{p.email}</span>}
                      </span>
                      {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// One row in "Your group chats" — names who can see it and, when expanded,
// lets the coach add or remove people and whole groups after creation.
const ChannelRow = ({ channel, groups, players, nameOf, onUpdate, onDelete }) => {
  const v = channel.visibleTo || {};
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("everyone");
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);

  // Re-seed from the live doc each time the editor opens, so a membership
  // change made elsewhere isn't clobbered by stale state from a previous open.
  const startEdit = () => {
    const vv = channel.visibleTo || {};
    setMode((vv.emails || []).length || (vv.groupIds || []).length ? "custom" : "everyone");
    setGroupIds(vv.groupIds || []);
    setEmails(vv.emails || []);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try { await onUpdate(channel.id, visibleTo); setEditing(false); toast("Members updated"); }
    catch (e) { toast("Couldn't update — " + (e.message || "")); }
    finally { setBusy(false); }
  };

  const audience = [
    ...(v.groupIds || []).map((gid) => groups.find((g) => g.id === gid)?.name).filter(Boolean),
    ...(v.emails || []).map((em) => nameOf(em) || em),
  ];

  return (
    <li className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate">#{channel.name}</div>
          <div className="text-[10px] text-slate-400 truncate">{audience.length ? audience.join(", ") : "Everyone"}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => (editing ? setEditing(false) : startEdit())} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>{editing ? "Cancel" : "Members"}</button>
          <button onClick={async () => { if (confirm(`Delete "${channel.name}"?`)) { try { await onDelete(channel.id); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} className="text-slate-300 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
          <AudiencePicker groups={groups} players={players} nameOf={nameOf} mode={mode} setMode={setMode} groupIds={groupIds} setGroupIds={setGroupIds} emails={emails} setEmails={setEmails} />
          <button onClick={save} disabled={busy} className="w-full py-2 rounded-full text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save members"}</button>
        </div>
      )}
    </li>
  );
};

// Coach-only: create a group chat and choose who can see it (everyone, or a mix
// of existing groups + individual players). Also lists channels, edits their
// membership after creation, and deletes them.
const ChannelModal = ({ chatGroups, groups, roster, nameByEmail = {}, onCreate, onDelete, onUpdate, onClose }) => {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || [])
    .filter((r) => !isStaffRole(r.role))
    // Show players with a known name first, then alphabetically by name/email.
    .sort((a, b) => (nameOf(a.email) || a.email || "").localeCompare(nameOf(b.email) || b.email || ""));

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try { await onCreate(name, visibleTo); setName(""); setMode("everyone"); setGroupIds([]); setEmails([]); }
    catch (e) { toast("Couldn't create — " + (e.message || "")); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Group chats</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group chat name (e.g. Captains)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <AudiencePicker groups={groups} players={players} nameOf={nameOf} mode={mode} setMode={setMode} groupIds={groupIds} setGroupIds={setGroupIds} emails={emails} setEmails={setEmails} />
            <button onClick={create} disabled={busy || !name.trim()} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Creating…" : "Create group chat"}</button>
          </div>

          {chatGroups.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Your group chats</p>
              <ul className="space-y-1.5">
                {chatGroups.map((c) => (
                  <ChannelRow key={c.id} channel={c} groups={groups} players={players} nameOf={nameOf} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Coach-only: schedule a push reminder or a chat poll to fire at a future time.
// Docs land in the `scheduled` collection; a Cloud Function sweeps and sends
// them (see functions/index.js runScheduled).
const tsMillis = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : (ts instanceof Date ? ts.getTime() : 0));
const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Next local occurrence (Date) on one of `days` at h:m, strictly in the future.
const nextLocalOccurrence = (days, h, m) => {
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const c = new Date();
    c.setDate(c.getDate() + i);
    c.setHours(h, m, 0, 0);
    if (days.includes(c.getDay()) && c.getTime() > now) return c;
  }
  return null;
};
// Short human label for a scheduled item's recurrence.
const repeatLabel = (s) => {
  if (!s.repeat || s.repeat === "none") return "";
  if (s.repeat === "daily") return "Daily";
  const days = s.repeatDays || [];
  if (s.repeat === "weekly") return `Weekly · ${DOW_ABBR[days[0]] || ""}`;
  return days.map((d) => DOW_ABBR[d]).join(" ");
};
const ScheduledModal = ({ scheduled = [], onAdd, onDelete, chatGroups = [], groups = [], roster = [], nameByEmail = {}, onClose }) => {
  const [kind, setKind] = useState("reminder"); // reminder | poll
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | custom
  const [customDays, setCustomDays] = useState([]); // weekday numbers for custom
  // reminder
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audMode, setAudMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  // poll
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [channel, setChannel] = useState("team");

  const channels = [{ id: "team", name: "Team" }, ...chatGroups.map((c) => ({ id: c.id, name: c.name }))];
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || []).filter((r) => !isStaffRole(r.role));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setOpt = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));

  const reset = () => { setWhen(""); setRepeat("none"); setCustomDays([]); setTitle(""); setBody(""); setAudMode("everyone"); setGroupIds([]); setEmails([]); setQuestion(""); setOptions(["", ""]); setChannel("team"); };

  const submit = async () => {
    let at = when ? new Date(when) : null;
    if (!at || isNaN(at.getTime())) { toast("Pick a date & time."); return; }
    // Resolve recurrence into a weekday set + first send time.
    let repeatDays = [];
    if (repeat === "daily") repeatDays = [0, 1, 2, 3, 4, 5, 6];
    else if (repeat === "weekly") repeatDays = [at.getDay()];
    else if (repeat === "custom") {
      if (!customDays.length) { toast("Pick at least one day to repeat on."); return; }
      repeatDays = [...customDays].sort();
      // If the picked start isn't on a chosen day (or is past), snap to the next match.
      if (!repeatDays.includes(at.getDay()) || at.getTime() <= Date.now()) {
        const nxt = nextLocalOccurrence(repeatDays, at.getHours(), at.getMinutes());
        if (!nxt) { toast("Couldn't find a matching day."); return; }
        at = nxt;
      }
    }
    if (at.getTime() <= Date.now()) { toast("Pick a date & time in the future."); return; }
    if (kind === "reminder" && !title.trim() && !body.trim()) { toast("Add a title or message."); return; }
    if (kind === "poll") {
      const opts = options.map((o) => o.trim()).filter(Boolean);
      if (!question.trim() || opts.length < 2) { toast("A poll needs a question and at least 2 options."); return; }
    }
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
    const recur = { repeat, repeatDays, tz };
    setBusy(true);
    try {
      if (kind === "reminder") {
        const visibleTo = audMode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
        await onAdd({ type: "reminder", title: title.trim(), body: body.trim(), visibleTo, sendAt: at, ...recur });
      } else {
        const opts = options.map((o) => o.trim()).filter(Boolean);
        const ch = channels.find((c) => c.id === channel);
        await onAdd({ type: "poll", question: question.trim(), options: opts, channel, channelName: ch?.name || "Team", sendAt: at, ...recur });
      }
      reset();
      toast("Scheduled.");
    } catch (e) { toast("Couldn't schedule — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };

  // Hide event-attached auto reminders here — those are managed on the event.
  const list = [...scheduled].filter((s) => !s.auto).sort((a, b) => tsMillis(a.sendAt) - tsMillis(b.sendAt));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><Clock className="w-4 h-4" style={{ color: COLORS.primary }} /> Scheduled</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setKind("reminder")} className={`flex-1 py-2 rounded-full text-xs font-bold ${kind === "reminder" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={kind === "reminder" ? { backgroundColor: COLORS.primary } : {}}>🔔 Reminder</button>
            <button onClick={() => setKind("poll")} className={`flex-1 py-2 rounded-full text-xs font-bold ${kind === "poll" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={kind === "poll" ? { backgroundColor: COLORS.primary } : {}}>📊 Poll</button>
          </div>

          {kind === "reminder" ? (
            <div className="space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reminder title (e.g. Bring both jerseys)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <AutoGrowTextarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message (optional)" minRows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Send to</p>
                <div className="flex gap-2">
                  <button onClick={() => setAudMode("everyone")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
                  <button onClick={() => setAudMode("custom")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
                </div>
              </div>
              {audMode === "custom" && (
                <div className="space-y-2">
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {groups.map((g) => { const on = groupIds.includes(g.id); return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>; })}
                    </div>
                  )}
                  {players.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {players.map((p) => { const on = emails.includes(p.email); const nm = nameOf(p.email); return (
                        <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                          <span className="text-xs text-slate-700 truncate">{nm || p.email}</span>
                          {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                        </button>
                      ); })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll question (e.g. Who's making the game?)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  {options.length > 2 && <button onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {options.length < 4 && <button onClick={() => setOptions((arr) => [...arr, ""])} className="text-[11px] font-bold" style={{ color: COLORS.primary }}>+ Add option</button>}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Post to</p>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{repeat === "none" ? "When" : "Starts"}</p>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Repeat</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[["none", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["custom", "Custom"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setRepeat(val)} className={`py-1.5 rounded-full text-[11px] font-bold ${repeat === val ? "text-white" : "bg-slate-100 text-slate-600"}`} style={repeat === val ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
              ))}
            </div>
            {repeat === "custom" && (
              <div className="flex justify-between gap-1 mt-2">
                {DOW_LETTERS.map((ltr, d) => { const on = customDays.includes(d); return (
                  <button key={d} onClick={() => setCustomDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])} className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${on ? "text-white" : "bg-slate-100 text-slate-500"}`} style={on ? { backgroundColor: COLORS.primary } : {}} aria-label={DOW_ABBR[d]}>{ltr}</button>
                ); })}
              </div>
            )}
            {repeat === "weekly" && when && <p className="text-[10px] text-slate-400 mt-1">Repeats every {DOW_ABBR[new Date(when).getDay()]}.</p>}
          </div>
          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Scheduling…" : "Schedule it"}</button>

          {list.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Queued</p>
              <ul className="space-y-1.5">
                {list.map((s) => {
                  const label = s.type === "poll" ? `📊 ${s.question || "Poll"} → ${s.channelName || "Team"}` : `🔔 ${s.title || s.body || "Reminder"}`;
                  const rep = repeatLabel(s);
                  const recurring = !!rep;
                  return (
                    <li key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{label}</div>
                        <div className="text-[10px] text-slate-500">{recurring ? "Next: " : ""}{new Date(tsMillis(s.sendAt)).toLocaleString([], { weekday: recurring ? "short" : undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{s.sent && !recurring ? " · Sent" : ""}</div>
                      </div>
                      {recurring
                        ? <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5" style={{ backgroundColor: COLORS.primary, color: "white" }}><Repeat className="w-2.5 h-2.5" />{rep}</span>
                        : s.sent ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.primary }}>Scheduled</span>}
                      <button onClick={() => { if (confirm("Cancel this scheduled item?")) Promise.resolve(onDelete(s.id)).catch(reportError("Couldn't cancel it")); }} aria-label="Cancel" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Custom push notifications — the coach composes a title + message, picks an
// audience (whole team, groups, or specific players — same picker pattern as
// the scheduled reminders), then either Sends now or Schedules it. Both paths
// store a doc in `pushNotifications` for the `runScheduled` runner: Send now
// writes sendAt as now, so the sweep picks it up within a few minutes, and
// Schedule writes a future sendAt, with an optional daily / weekly / custom
// repeat. Recurrence is stored as
// {type: "none"|"daily"|"weekly", time: "HH:MM", days: [weekday numbers]}.
// A "Custom" day pick is stored as type "weekly" with its days, since the
// runner only needs the weekday set + time.
const PushNotificationModal = ({ pushNotifications = [], onAdd, onDelete, onSendNow, groups = [], roster = [], nameByEmail = {}, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [sendMode, setSendMode] = useState("now"); // now | schedule
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | custom
  const [customDays, setCustomDays] = useState([]); // weekday numbers for custom
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audMode, setAudMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);

  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || []).filter((r) => !isStaffRole(r.role));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const reset = () => { setSendMode("now"); setWhen(""); setRepeat("none"); setCustomDays([]); setTitle(""); setBody(""); setAudMode("everyone"); setGroupIds([]); setEmails([]); };

  const submit = async () => {
    if (!title.trim() && !body.trim()) { toast("Add a title or message."); return; }
    const visibleTo = audMode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    const audienceKeys = audienceKeysFor(visibleTo, groups);
    setBusy(true);
    try {
      if (sendMode === "now") {
        await onSendNow({ title: title.trim(), body: body.trim(), audienceKeys, visibleTo });
        reset();
        toast("Queued. It goes out within a few minutes.");
      } else {
        let at = when ? new Date(when) : null;
        if (!at || isNaN(at.getTime())) { toast("Pick a date & time."); return; }
        // Resolve recurrence into a weekday set + first send time.
        let repeatDays = [];
        if (repeat === "daily") repeatDays = [0, 1, 2, 3, 4, 5, 6];
        else if (repeat === "weekly") repeatDays = [at.getDay()];
        else if (repeat === "custom") {
          if (!customDays.length) { toast("Pick at least one day to repeat on."); return; }
          repeatDays = [...customDays].sort();
          // If the picked start isn't on a chosen day (or is past), snap to the next match.
          if (!repeatDays.includes(at.getDay()) || at.getTime() <= Date.now()) {
            const nxt = nextLocalOccurrence(repeatDays, at.getHours(), at.getMinutes());
            if (!nxt) { toast("Couldn't find a matching day."); return; }
            at = nxt;
          }
        }
        if (at.getTime() <= Date.now()) { toast("Pick a date & time in the future."); return; }
        const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
        const recurrence = repeat === "none"
          ? { type: "none", time: "", days: [] }
          : { type: repeat === "custom" ? "weekly" : repeat, time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`, days: repeatDays };
        await onAdd({ title: title.trim(), body: body.trim(), audienceKeys, visibleTo, sendAt: at, recurrence, tz });
        reset();
        toast("Scheduled.");
      }
    } catch (e) { toast("Couldn't send — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };

  // Queued (scheduled) first, then sent — newest first within each group.
  const list = [...pushNotifications].sort((a, b) => {
    const sa = a.status === "sent" ? 1 : 0, sb = b.status === "sent" ? 1 : 0;
    return (sa - sb) || (tsMillis(b.sendAt || b.createdAt) - tsMillis(a.sendAt || a.createdAt));
  });
  const recurrenceLabel = (n) => {
    const r = n.recurrence || {};
    if (!r.type || r.type === "none") return "";
    if (r.type === "daily") return "Daily";
    const days = (r.days || []).map((d) => DOW_ABBR[d]).join(" ");
    return r.days && r.days.length > 1 ? days : `Weekly · ${DOW_ABBR[(r.days || [])[0]] || ""}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><Bell className="w-4 h-4" style={{ color: COLORS.primary }} /> Send notification</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setSendMode("now")} className={`flex-1 py-2 rounded-full text-xs font-bold ${sendMode === "now" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={sendMode === "now" ? { backgroundColor: COLORS.primary } : {}}>Send now</button>
            <button onClick={() => setSendMode("schedule")} className={`flex-1 py-2 rounded-full text-xs font-bold ${sendMode === "schedule" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={sendMode === "schedule" ? { backgroundColor: COLORS.primary } : {}}>Schedule</button>
          </div>

          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Practice time change)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <AutoGrowTextarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" minRows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Send to</p>
              <div className="flex gap-2">
                <button onClick={() => setAudMode("everyone")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
                <button onClick={() => setAudMode("custom")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
              </div>
            </div>
            {audMode === "custom" && (
              <div className="space-y-2">
                {groups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => { const on = groupIds.includes(g.id); return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>; })}
                  </div>
                )}
                {players.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {players.map((p) => { const on = emails.includes(p.email); const nm = nameOf(p.email); return (
                      <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                        <span className="text-xs text-slate-700 truncate">{nm || p.email}</span>
                        {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                      </button>
                    ); })}
                  </div>
                )}
              </div>
            )}
          </div>

          {sendMode === "schedule" && (
            <>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{repeat === "none" ? "When" : "Starts"}</p>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Repeat</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[["none", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["custom", "Custom"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setRepeat(val)} className={`py-1.5 rounded-full text-[11px] font-bold ${repeat === val ? "text-white" : "bg-slate-100 text-slate-600"}`} style={repeat === val ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
                  ))}
                </div>
                {repeat === "custom" && (
                  <div className="flex justify-between gap-1 mt-2">
                    {DOW_LETTERS.map((ltr, d) => { const on = customDays.includes(d); return (
                      <button key={d} onClick={() => setCustomDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])} className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${on ? "text-white" : "bg-slate-100 text-slate-500"}`} style={on ? { backgroundColor: COLORS.primary } : {}} aria-label={DOW_ABBR[d]}>{ltr}</button>
                    ); })}
                  </div>
                )}
                {repeat === "weekly" && when && <p className="text-[10px] text-slate-400 mt-1">Repeats every {DOW_ABBR[new Date(when).getDay()]}.</p>}
              </div>
            </>
          )}

          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Sending…" : sendMode === "now" ? "Send now" : "Schedule it"}</button>
          {sendMode === "now" && <p className="text-[11px] text-slate-400 text-center">Goes out within a few minutes.</p>}

          {list.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Notifications</p>
              <ul className="space-y-1.5">
                {list.map((n) => {
                  const rep = recurrenceLabel(n);
                  const sent = n.status === "sent";
                  return (
                    <li key={n.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">🔔 {n.title || n.body || "Notification"}</div>
                        <div className="text-[10px] text-slate-500 truncate">{n.body && n.title ? n.body : ""}{sent ? "Sent" : ""}{!sent && n.sendAt ? new Date(tsMillis(n.sendAt)).toLocaleString([], { weekday: rep ? "short" : undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                      </div>
                      {rep
                        ? <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5" style={{ backgroundColor: COLORS.primary, color: "white" }}><Repeat className="w-2.5 h-2.5" />{rep}</span>
                        : sent ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.primary }}>Scheduled</span>}
                      <button onClick={() => { if (confirm("Delete this notification?")) Promise.resolve(onDelete(n.id)).catch(reportError("Couldn't delete it")); }} aria-label="Delete" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Coach-only roster breakdown: who's seen a message / who voted for each poll
// option (and who hasn't). `groups` = [{ label, names: [] }].
const ViewersModal = ({ title, groups = [], onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900 truncate pr-2">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{g.label}</div>
            {g.names.length
              ? <ul className="space-y-1">{g.names.map((n, i) => <li key={i} className="text-sm text-slate-700">{n}</li>)}</ul>
              : <p className="text-xs text-slate-400 italic">Nobody yet.</p>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// A day separator in a chat feed — a thin line on each side of the date, so
// messages break cleanly from one day to the next (Today / Yesterday / date).
const DateDivider = ({ label }) => (
  <div className="flex items-center gap-3 my-1.5">
    <div className="flex-1 h-px bg-slate-200" />
    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex-shrink-0">{label}</span>
    <div className="flex-1 h-px bg-slate-200" />
  </div>
);

// Fullscreen in-app video player. Chat videos play in a small bubble, which
// is too small to see on a phone, so tapping the expand button opens the
// video here instead — full screen, inside the app, with a big close button.
// No new tab, no leaving the app.
const VideoViewer = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} aria-label="Close video" className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

export const MessagesPage = ({ user, activeTeamId, isOrgAdmin = false, hasOlderMessages = false, onLoadOlder, messages, addMessage, togglePinMessage, deleteMessage, markMessagesRead, voteOnPoll, reactToMessage, rosterCount = 0, chatGroups = [], addChatGroup, deleteChatGroup, updateChatGroup, onPinChannel, groups = [], invites = [], allUsers = [], announcements = [], addAnnouncement, deleteAnnouncement, dms = [], addDM, markDMsRead, scheduled = [], addScheduled, deleteScheduled }) => {
  const isAdmin = user.role === "admin";
  const [input, setInput] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [shared, setShared] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [actionMsg, setActionMsg] = useState(null); // message whose long-press menu is open
  const [dmAction, setDmAction] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: "", options: ["", ""] });
  const [uploading, setUploading] = useState(false);
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelModal, setChannelModal] = useState(false);
  const [scheduledModal, setScheduledModal] = useState(false);
  const [viewer, setViewer] = useState(null); // { title, groups } — coach seen/voted breakdown
  const [videoViewer, setVideoViewer] = useState(null); // url of the video playing fullscreen in-app
  const nameByUid = useMemo(() => Object.fromEntries((allUsers || []).map((u) => [u.id, u.name || u.email || "Member"])), [allUsers]);
  // email → display name, for showing roster people by name instead of address.
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email && u.name).map((u) => [u.email.toLowerCase(), u.name])), [allUsers]);
  const rosterPlayers = useMemo(() => (allUsers || []).filter((u) => !isStaffRole(u.role)), [allUsers]);
  const openSeen = (m) => {
    const seenUids = Object.keys(m.readBy || {}).filter((uid) => uid !== m.senderUid);
    const seenSet = new Set(seenUids);
    const seenNames = seenUids.map((uid) => nameByUid[uid] || "Member").sort();
    const notSeen = rosterPlayers.filter((pp) => pp.id !== m.senderUid && !seenSet.has(pp.id)).map((pp) => pp.name || pp.email).sort();
    setViewer({ title: "Seen by", groups: [
      { label: `Seen · ${seenNames.length}`, names: seenNames },
      { label: `Not yet · ${notSeen.length}`, names: notSeen },
    ] });
  };
  const openVoters = async (m) => {
    // Coach-only: read the private vote docs (plus any legacy map entries).
    const votes = { ...(m.votes || {}) };
    try {
      const snap = await getDocs(collection(db, "messages", m.id, "votes"));
      snap.forEach((v) => { votes[v.id] = v.data().option; });
    } catch (e) { reportError("Couldn't load the votes")(e); return; }
    const voterSet = new Set(Object.keys(votes));
    const grps = (m.options || []).map((opt, i) => ({
      label: `${opt} · ${Object.values(votes).filter((v) => v === i).length}`,
      names: Object.entries(votes).filter(([, v]) => v === i).map(([uid]) => nameByUid[uid] || "Member").sort(),
    }));
    const nonVoters = rosterPlayers.filter((pp) => !voterSet.has(pp.id)).map((pp) => pp.name || pp.email).sort();
    grps.push({ label: `Didn't vote · ${nonVoters.length}`, names: nonVoters });
    setViewer({ title: m.question || "Poll results", groups: grps });
  };
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const feedRef = useRef(null);
  const readMarkedRef = useRef(new Set());

  // Which group chats this user is allowed to see (coach sees all). Empty
  // visibleTo = everyone. Filtered client-side, same as event visibility.
  const myGroupIds = useMemo(() => new Set((groups || [])
    .filter((g) => (g.memberUids || []).includes(user.uid) || (g.memberUids || []).includes(user.email))
    .map((g) => g.id)), [groups, user]);
  const visibleChannels = useMemo(() => (chatGroups || []).filter((c) => {
    if (isAdmin) return true;
    const v = c.visibleTo || {};
    const emails = v.emails || []; const uids = v.uids || []; const gids = v.groupIds || [];
    if (!emails.length && !uids.length && !gids.length) return true;
    if (uids.includes(user.uid) || emails.includes(user.email)) return true;
    return gids.some((id) => myGroupIds.has(id));
  }), [chatGroups, isAdmin, myGroupIds, user]);
  const [announceMode, setAnnounceMode] = useState(false);
  // The active team's coach(es), for naming the player's DM thread
  // ("Coach Kelly" instead of a generic "Coach"). The org admin is not a
  // DM participant, so only per-team coaches (role 'admin') count here.
  const teamCoaches = useMemo(() => (allUsers || []).filter((u) => u.role === "admin" && (u.teamIds || []).includes(activeTeamId)), [allUsers, activeTeamId]);
  const coachDmName = useMemo(() => {
    if (teamCoaches.length !== 1) return "Coach";
    const parts = (teamCoaches[0].name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? `Coach ${parts[parts.length - 1]}` : "Coach";
  }, [teamCoaches]);
  // Direct messages with the team's coach. Players get one thread with their
  // own team's coach; a coach sees one pill per player who has a thread on
  // their team. The org admin gets none — DMs are player ↔ own team's coach
  // only (decision 2026-11-08).
  // A coach can also START a thread with any player on the team (the
  // thread exists locally until the first message is sent).
  const [startedDm, setStartedDm] = useState(null); // { uid, name }
  const dmThreads = useMemo(() => {
    if (isOrgAdmin) return [];
    if (!isAdmin) return [{ id: "coach-dm", name: coachDmName, dm: true }];
    const byThread = new Map();
    dms.forEach((d) => { if (!byThread.has(d.threadId)) byThread.set(d.threadId, d); });
    const threads = [...byThread.entries()].map(([tid, d]) => ({ id: `dm:${tid}`, name: (dms.find((x) => x.threadId === tid && !x.isCoach)?.senderName) || d.senderName || "Player", dm: true }));
    if (startedDm && !byThread.has(startedDm.uid)) threads.unshift({ id: `dm:${startedDm.uid}`, name: startedDm.name || "Player", dm: true });
    return threads;
  }, [dms, isAdmin, isOrgAdmin, coachDmName, startedDm]);
  const dmPlayers = useMemo(
    () => (isAdmin && !isOrgAdmin ? allUsers.filter((u) => u.role === "player" && u.id !== user.uid) : []),
    [allUsers, isAdmin, isOrgAdmin, user.uid],
  );
  const startDmWith = (uid) => {
    const p = dmPlayers.find((u) => u.id === uid);
    if (!p) return;
    setStartedDm({ uid, name: p.name || p.email || "Player" });
    setActiveChannel(`dm:${uid}`);
  };
  const channels = [
    { id: "team", name: "Team", channel: true },
    ...visibleChannels.map((c) => ({ id: c.id, name: c.name, pinned: !!c.pinned, channel: true })),
    ...dmThreads,
  ];
  const validIds = channels.map((c) => c.id);
  const activeConv = activeChannel && validIds.includes(activeChannel) ? activeChannel : null;
  const activeName = (channels.find((c) => c.id === activeConv) || {}).name || "Chat";
  const effectiveChannel = activeConv || "team";
  const isDM = effectiveChannel === "coach-dm" || effectiveChannel.startsWith("dm:");
  const dmThreadId = !isDM ? null : (effectiveChannel === "coach-dm" ? user.uid : effectiveChannel.slice(3));
  const dmMessages = useMemo(() => {
    if (!isDM) return [];
    const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
    return dms.filter((d) => d.threadId === dmThreadId).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  }, [dms, isDM, dmThreadId]);
  const channelMessages = useMemo(() => messages.filter((m) => (m.channel || "team") === effectiveChannel), [messages, effectiveChannel]);
  // WhatsApp-style notifications for this conversation: the same keys/tags
  // the server uses (functions/lib/notify.js). Opening a chat clears its
  // notifications on the phone; the bell mutes it (8 h / 1 week / always).
  const chatKey = isDM ? `dm_${dmThreadId}` : effectiveChannel === "team" ? `team_${activeTeamId}` : `group_${effectiveChannel}`;
  const notifTag = isDM ? `dm-${dmThreadId}` : `chat-${chatKey}`;
  const muted = isChatMuted(user.notifPrefs, chatKey);
  const [muteOpen, setMuteOpen] = useState(false);
  const convCount = isDM ? dmMessages.length : channelMessages.length;
  useEffect(() => {
    if (activeConv) clearChatNotifications(notifTag);
  }, [activeConv, notifTag, convCount]);
  const setMute = async (until) => {
    setMuteOpen(false);
    try {
      await updateDoc(doc(db, "users", user.uid), { [`notifPrefs.muted.${chatKey}`]: until == null ? deleteField() : until });
      toast(until == null ? "Notifications on for this chat." : until === -1 ? "Muted — you'll still get @mentions." : "Muted. @mentions still come through.", "success");
    } catch (e) { toast("Couldn't change — " + (e?.message || "")); }
  };

  // Downscale + upload an image to Firebase Storage, post as a new message.
  const downscaleImage = (file, maxDim = 1600, quality = 0.86) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = URL.createObjectURL(file);
    });

  const sendImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await downscaleImage(file);
      // Namespace by channel so Storage rules can gate reads to the channel's
      // audience (a hidden channel's images stay private, like its messages).
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.jpg`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "image", url, path, name: file.name || "photo.jpg" } });
      } else {
        await addMessage("", {
          attachment: { type: "image", url, path, name: file.name || "photo.jpg" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send photo — " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // File extension from a name, lowercased; fallback when there is none.
  const FILE_MIME_BY_EXT = {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  };
  const fileExt = (name, fallback) => {
    const parts = String(name || "").split(".");
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
    return ext || fallback;
  };

  // Upload a video file as-is (no downscaling) and post it as a new message.
  const sendVideo = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast("Video is too big. Keep it under 100 MB."); return; }
    setUploading(true);
    try {
      const ext = fileExt(file.name, "mp4");
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, file, { contentType: file.type || "video/mp4" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "video", url, path, name: file.name || "video.mp4" } });
      } else {
        await addMessage("", {
          attachment: { type: "video", url, path, name: file.name || "video.mp4" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send video: " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // Upload a document as-is and post it as a new message.
  const sendFile = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast("File is too big. Keep it under 25 MB."); return; }
    setUploading(true);
    try {
      const ext = fileExt(file.name, "bin");
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      // Some browsers report an empty type for Office files; Storage rules
      // reject application/octet-stream, so infer it from the extension.
      const snap = await uploadBytes(ref, file, { contentType: file.type || FILE_MIME_BY_EXT[ext] || "application/octet-stream" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "file", url, path, name: file.name || "file" } });
      } else {
        await addMessage("", {
          attachment: { type: "file", url, path, name: file.name || "file" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send file: " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // Jump to the newest messages on opening a conversation. After that, only
  // follow new messages if the user is already near the bottom — if they
  // scrolled up to read older messages, stay put and let them read.
  // Deferred across two frames so it lands after layout (and late-loading
  // images) settle, so a chat always opens pinned to the bottom.
  const nearBottomRef = useRef(true);
  const lastConvRef = useRef(null);
  useEffect(() => {
    if (shared || !activeConv) return;
    const isNewConv = lastConvRef.current !== activeConv;
    lastConvRef.current = activeConv;
    if (!isNewConv && !nearBottomRef.current) return;
    const toBottom = () => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; };
    toBottom();
    const r1 = requestAnimationFrame(() => { toBottom(); requestAnimationFrame(toBottom); });
    const t = setTimeout(toBottom, 120);
    return () => { cancelAnimationFrame(r1); clearTimeout(t); };
  }, [channelMessages, dmMessages, shared, activeConv]);
  // As the message box grows (up to 5 lines) the feed gets shorter; keep the
  // newest messages in view if the user was already at the bottom.
  useLayoutEffect(() => {
    if (nearBottomRef.current && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [input]);
  // Track whether the user is near the bottom of the feed, so new messages
  // only pull the view down when they're already reading the newest ones.
  const onFeedScroll = (e) => {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Mark every visible message (that isn't ours and we haven't read) as read.
  useEffect(() => {
    if (shared || !activeConv) return;
    const toMark = channelMessages
      .filter((m) => m.senderUid !== user.uid)
      .filter((m) => !m.readBy?.[user.uid])
      .filter((m) => !readMarkedRef.current.has(m.id))
      .map((m) => m.id);
    if (!toMark.length) return;
    toMark.forEach((id) => readMarkedRef.current.add(id));
    markMessagesRead(toMark).catch(() => {
      toMark.forEach((id) => readMarkedRef.current.delete(id));
    });
  }, [channelMessages, shared, activeConv, user.uid, markMessagesRead]);

  // Same for DMs: opening a thread marks its messages read (so the thread's
  // unread badge clears, like a channel's).
  const dmReadMarkedRef = useRef(new Set());
  useEffect(() => {
    if (shared || !activeConv || !isDM) return;
    const toMark = dmMessages
      .filter((d) => d.senderUid !== user.uid)
      .filter((d) => !d.readBy?.[user.uid])
      .filter((d) => !dmReadMarkedRef.current.has(d.id))
      .map((d) => d.id);
    if (!toMark.length) return;
    toMark.forEach((id) => dmReadMarkedRef.current.add(id));
    markDMsRead?.(toMark).catch(() => {
      toMark.forEach((id) => dmReadMarkedRef.current.delete(id));
    });
  }, [dmMessages, shared, activeConv, isDM, user.uid, markDMsRead]);

  const isOwn = (m) => m.senderUid === user.uid;
  const readByCount = (m) => Object.keys(m.readBy || {}).filter((uid) => uid !== user.uid).length;

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    const wasReply = replyTo;
    setInput("");
    setReplyTo(null);
    try {
      if (isDM) {
        await addDM(text, dmThreadId);
      } else if (announceMode && isAdmin) {
        await addAnnouncement(text, "");
        setAnnounceMode(false);
      } else {
        await addMessage(text, { pinned: isAdmin && pinOnSend, replyTo: wasReply, channel: effectiveChannel });
        if (pinOnSend) setPinOnSend(false);
      }
    } catch (e) {
      toast("Couldn't send — " + (e.message || "check Firestore rules."));
      setInput(text);
      setReplyTo(wasReply);
    }
  };

  const sendPoll = async () => {
    const opts = pollDraft.options.map((o) => o.trim()).filter(Boolean);
    if (!pollDraft.question.trim() || opts.length < 2) return;
    try {
      await addMessage("", { poll: { question: pollDraft.question.trim(), options: opts }, channel: effectiveChannel });
      setPollDraft({ question: "", options: ["", ""] });
      setPollOpen(false);
    } catch (e) {
      toast("Couldn't create poll — " + (e.message || ""));
    }
  };

  const togglePin = (m) => togglePinMessage(m.id, m.pinned).catch(reportError("Couldn't pin the message"));
  const delMsg = (id) => {
    if (!confirm("Delete this message for everyone?")) return;
    deleteMessage(id).catch(reportError("Couldn't delete the message"));
  };
  const startReply = (m) => setReplyTo({ id: m.id, sender: m.sender, text: m.text, kind: m.kind, question: m.question });
  const cancelReply = () => setReplyTo(null);
  const copyMsg = async (m) => {
    const text = m.kind === "poll" ? m.question : m.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch { /* clipboard unavailable — text is still selectable manually */ }
  };

  const pinnedMsgs = channelMessages.filter((m) => m.pinned);
  const mediaMsgs = channelMessages.filter((m) => m.attachment);
  const linkMsgs = channelMessages.filter((m) => URL_RE.test(m.text || ""));

  const AttIcon = ({ type }) => type === "image" ? <ImageIcon className="w-4 h-4" /> : type === "video" ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />;

  // Build the message stream with date dividers interleaved.
  const stream = useMemo(() => {
    // In the Team channel, announcements appear inline as broadcast cards,
    // interleaved with messages by time — one place for team-wide comms.
    const items = channelMessages.map((m) => ({ ts: m.createdAt, kind: "msg", message: m }));
    if (effectiveChannel === "team") {
      announcements.forEach((a) => items.push({ ts: a.createdAt, kind: "announcement", announcement: a }));
    }
    const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
    items.sort((a, b) => ms(a.ts) - ms(b.ts));
    const out = [];
    let lastDay = null;
    items.forEach((it) => {
      const day = formatDayKey(it.ts);
      if (day !== lastDay) {
        out.push({ kind: "divider", id: `div-${day}`, label: formatDateHeader(it.ts) });
        lastDay = day;
      }
      out.push(it.kind === "announcement" ? { kind: "announcement", id: `a-${it.announcement.id}`, announcement: it.announcement } : { kind: "msg", id: it.message.id, message: it.message });
    });
    return out;
  }, [channelMessages, announcements, effectiveChannel]);

  // DM thread with the same day dividers interleaved (kept chronological).
  const dmStream = useMemo(() => {
    const out = [];
    let lastDay = null;
    (dmMessages || []).forEach((d) => {
      const day = formatDayKey(d.createdAt);
      if (day && day !== lastDay) { out.push({ kind: "divider", id: `dmdiv-${day}`, label: formatDateHeader(d.createdAt) }); lastDay = day; }
      out.push({ kind: "dm", id: d.id, dm: d });
    });
    return out;
  }, [dmMessages]);

  const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
  const convMetaById = useMemo(() => {
    const meta = {};
    const bump = (id, t, raw, text, sender) => {
      const cur = meta[id] || { lastTs: 0, lastAt: null, lastText: "", lastSender: "", unread: 0 };
      if (t >= cur.lastTs) { cur.lastTs = t; cur.lastAt = raw; cur.lastText = text; cur.lastSender = sender; }
      meta[id] = cur;
    };
    messages.forEach((m) => {
      const id = m.channel || "team";
      const text = m.kind === "poll" ? `📊 ${m.question || "Poll"}` : (m.attachment?.type === "image" ? "📷 Photo" : m.attachment?.type === "video" ? "🎬 Video" : m.attachment?.type === "file" ? "📎 File" : (m.text || ""));
      bump(id, msOf(m.createdAt), m.createdAt, text, m.sender);
      if (m.senderUid !== user.uid && !m.readBy?.[user.uid]) meta[id].unread = (meta[id].unread || 0) + 1;
    });
    dms.forEach((d) => {
      const id = isAdmin ? `dm:${d.threadId}` : "coach-dm";
      bump(id, msOf(d.createdAt), d.createdAt, d.text || "", d.senderName);
      if (d.senderUid !== user.uid && !d.readBy?.[user.uid]) meta[id].unread = (meta[id].unread || 0) + 1;
    });
    return meta;
  }, [messages, dms, isAdmin, user.uid]);
  const convList = channels
    .map((c) => ({ ...c, meta: convMetaById[c.id] || {} }))
    .sort((a, b) => {
      if (a.id === "team") return -1;
      if (b.id === "team") return 1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.meta.lastTs || 0) - (a.meta.lastTs || 0);
    });
  // Professional inbox layout: channels first (Team, then custom), then
  // direct messages — never mixed into one flat list.
  const channelConvs = convList.filter((c) => c.channel);
  const dmConvs = convList.filter((c) => c.dm);

  // One conversation row, shared by the Channels and Direct messages
  // sections (avatar, name, unread badge, last-message preview, time).
  const convRow = (c) => {
    const meta = c.meta || {};
    const preview = meta.lastText
      ? `${!c.dm && meta.lastSender ? meta.lastSender.split(" ")[0] + ": " : ""}${meta.lastText}`
      : "No messages yet";
    return (
      <li key={c.id} className="flex items-center bg-white hover:bg-slate-50">
        <button onClick={() => { setActiveChannel(c.id); setShared(false); }} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: c.dm ? "#94a3b8" : COLORS.primary }}>{c.dm ? (c.name || "?")[0]?.toUpperCase() : <Hash className="w-4 h-4" />}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {(c.id === "team" || c.pinned) && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: c.id === "team" ? COLORS.accent : "#94a3b8" }} />}
              <span className="text-sm font-bold text-slate-900 truncate">{c.name}</span>
              {meta.unread > 0 && <span className="text-[10px] font-bold text-white rounded-full px-1.5 min-w-[18px] text-center flex-shrink-0" style={{ backgroundColor: COLORS.accent }}>{meta.unread}</span>}
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{preview}</div>
          </div>
          {meta.lastAt && <span className="text-[9px] text-slate-400 flex-shrink-0 self-start">{formatTime(meta.lastAt)}</span>}
        </button>
        {isAdmin && c.channel && c.id !== "team" && onPinChannel && (
          <button onClick={() => onPinChannel(c.id, !c.pinned)} title={c.pinned ? "Unpin" : "Pin to top"} className={`px-3 py-3 flex-shrink-0 ${c.pinned ? "text-orange-500" : "text-slate-300"} hover:text-orange-500`}><Pin className="w-4 h-4" /></button>
        )}
      </li>
    );
  };

  if (!activeConv) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div><h3 className="font-bold text-slate-900 text-sm">Messages</h3><p className="text-[10px] text-slate-500">{getTeam(activeTeamId).shortName} · {rosterCount} on roster</p></div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setScheduledModal(true)} title="Scheduled reminders & polls" className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                <Clock className="w-3 h-3" /> Scheduled
              </button>
              <button onClick={() => setChannelModal(true)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1 text-white" style={{ backgroundColor: COLORS.primary }}>
                <Plus className="w-3 h-3" /> Group
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
          <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</div>
          <ul className="divide-y divide-slate-100">
            {channelConvs.map((c) => convRow(c))}
          </ul>
          {!isOrgAdmin && (
            <>
              <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Direct messages</div>
              {dmPlayers.length > 0 && (
                <div className="px-4 pb-2">
                  <select value="" onChange={(e) => startDmWith(e.target.value)} aria-label="Message a player" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white text-slate-600">
                    <option value="">+ Message a player…</option>
                    {dmPlayers.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
                  </select>
                </div>
              )}
              {dmConvs.length === 0 ? (
                <p className="px-4 py-2 text-xs text-slate-400 italic">No direct messages yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dmConvs.map((c) => convRow(c))}
                </ul>
              )}
            </>
          )}
        </div>
        {channelModal && (
          <ChannelModal chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onCreate={addChatGroup} onDelete={deleteChatGroup} onUpdate={updateChatGroup} onClose={() => setChannelModal(false)} />
        )}
        {scheduledModal && (
          <ScheduledModal scheduled={scheduled} onAdd={addScheduled} onDelete={deleteScheduled} chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onClose={() => setScheduledModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
        <button onClick={() => { setActiveChannel(null); setShared(false); }} className="flex items-center gap-2 min-w-0">
          <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 text-left"><h3 className="font-bold text-slate-900 text-sm truncate">{activeName}</h3><p className="text-[10px] text-slate-500">{rosterCount} on roster</p></div>
        </button>
        <button onClick={() => setMuteOpen(true)} aria-label={muted ? "Chat muted — change" : "Mute notifications"} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ml-auto" style={{ backgroundColor: muted ? COLORS.accentSoft : "transparent" }}>
          {muted ? <BellOff className="w-4 h-4" style={{ color: COLORS.primary }} /> : <Bell className="w-4 h-4 text-slate-400" />}
        </button>
        <button onClick={() => setShared(!shared)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0" style={shared ? { backgroundColor: COLORS.primary, color: "white" } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>
          <Layers className="w-3 h-3" /> {shared ? "Chat" : "Shared"}
        </button>
      </div>

      {muteOpen && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center" onClick={() => setMuteOpen(false)} role="dialog" aria-label="Mute notifications">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">{muted ? `Muted · ${mutedLabel(user.notifPrefs?.muted?.[chatKey])}` : `Mute ${activeName}`}</h3>
            <p className="text-[12px] text-slate-500 mb-3">You won't get notifications from this chat. Messages still arrive, and @mentions still notify you.</p>
            {[["8 hours", 8], ["1 week", 168], ["Always", -1]].map(([label, hours]) => (
              <button key={label} onClick={() => setMute(hours === -1 ? -1 : Date.now() + hours * 3600e3)} className="w-full h-12 mb-2 rounded-2xl bg-slate-100 text-sm font-bold text-slate-800">{label}</button>
            ))}
            {muted && <button onClick={() => setMute(null)} className="w-full h-12 rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Unmute</button>}
          </div>
        </div>
      )}
      {channelModal && (
        <ChannelModal chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onCreate={addChatGroup} onDelete={deleteChatGroup} onUpdate={updateChatGroup} onClose={() => setChannelModal(false)} />
      )}
      {viewer && (
        <ViewersModal title={viewer.title} groups={viewer.groups} onClose={() => setViewer(null)} />
      )}
      {videoViewer && (
        <VideoViewer url={videoViewer} onClose={() => setVideoViewer(null)} />
      )}

      {shared ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5" style={{ backgroundColor: COLORS.bg }}>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Photos & Files</h4>
            {mediaMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No files shared yet.</p> : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMsgs.map((m) => (
                  m.attachment?.type === "video" && m.attachment.url ? (
                    <button key={m.id} onClick={() => setVideoViewer(m.attachment.url)} aria-label="Watch video fullscreen" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block relative">
                      <video src={m.attachment.url} preload="metadata" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-5 h-5 text-white fill-white ml-0.5" /></span></span>
                    </button>
                  ) : m.attachment?.type === "image" && m.attachment.url ? (
                    <a key={m.id} href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block">
                      <img src={m.attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </a>
                  ) : m.attachment?.type === "file" && m.attachment.url ? (
                    <a key={m.id} href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><AttIcon type={m.attachment.type} /></div>
                      <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                      <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                    </a>
                  ) : (
                    <div key={m.id} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><AttIcon type={m.attachment.type} /></div>
                      <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                      <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Links</h4>
            {linkMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No links shared yet.</p> : (
              <ul className="space-y-2">
                {linkMsgs.map((m) => { const url = (m.text.match(URL_RE) || [])[0]; return (
                  <li key={m.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#E0F2FE", color: "#0284c7" }}><LinkIcon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-slate-900 truncate">{url}</div><div className="text-[10px] text-slate-400">shared by {m.sender.split(" ")[0]}</div></div>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        </div>
      ) : isDM ? (
        <>
          <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
            <div className="min-h-full flex flex-col justify-end px-3 py-4">
            {isLoading(dms) ? <LoadingNote /> : dmMessages.length === 0 && <p className="text-center text-xs text-slate-400 italic py-6">{isAdmin ? "No messages in this thread yet." : "Message your coach privately. Only you and your team's coach can see this."}</p>}
            {dmStream.map((item, idx) => {
              if (item.kind === "divider") return <div key={item.id} className="pt-3"><DateDivider label={item.label} /></div>;
              const d = item.dm;
              const own = d.senderUid === user.uid;
              const sameSender = (o) => o && o.kind !== "divider" && o.dm?.senderUid === d.senderUid
                && Math.abs(tsMs(o.dm.createdAt) - tsMs(d.createdAt)) < GROUP_GAP_MS;
              const first = !sameSender(dmStream[idx - 1]);
              const last = !sameSender(dmStream[idx + 1]);
              return (
                <div key={d.id} className={`flex flex-col ${own ? "items-end" : "items-start"} ${first ? "mt-3" : "mt-0.5"}`}>
                  {!own && first && <div className="px-3 mb-0.5 text-[11px] font-semibold text-slate-500">{d.senderName}{d.isCoach ? " · Coach" : ""}</div>}
                  <LongPress onLong={() => (d.text ? setDmAction(d) : null)} className="max-w-[78%] select-none">
                    <div className="overflow-hidden" style={{ borderRadius: bubbleRadius(own, first, last), backgroundColor: own ? COLORS.primary : IOS_GRAY, color: own ? "#fff" : "#0F172A" }}>
                      {d.attachment?.type === "image" && d.attachment.url && (
                        <img src={d.attachment.url} alt="" className="w-full max-h-80 object-cover" loading="lazy" />
                      )}
                      {d.attachment?.type === "video" && d.attachment.url && (
                        <div className="relative">
                          <video src={d.attachment.url} controls playsInline preload="metadata" className="w-full max-h-80 object-cover" />
                          <button onClick={() => setVideoViewer(d.attachment.url)} aria-label="Watch fullscreen" title="Watch fullscreen" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><Maximize2 className="w-4 h-4" /></button>
                        </div>
                      )}
                      {d.attachment?.type === "file" && d.attachment.url && (
                        <a href={d.attachment.url} target="_blank" rel="noopener noreferrer" className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={d.attachment.type} /><span className="text-[12px] font-semibold truncate">{d.attachment.name}</span></a>
                      )}
                      {d.text && <p className="px-3.5 py-2 text-[15px] leading-snug break-words"><Linkify>{d.text}</Linkify></p>}
                    </div>
                  </LongPress>
                  {last && <div className="mt-1 px-1 text-[11px] text-slate-400">{formatTime(d.createdAt)}</div>}
                </div>
              );
            })}
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendVideo(f); e.target.value = ""; }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />
          <ChatComposer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSend={send}
            uploading={uploading}
            placeholder={isAdmin ? "Reply" : "Message your coach"}
            actions={[
              { key: "photo", label: "Photo", icon: Camera, disabled: uploading, onClick: () => photoInputRef.current?.click() },
              { key: "video", label: "Video", icon: Video, disabled: uploading, onClick: () => videoInputRef.current?.click() },
              { key: "file", label: "File", icon: Paperclip, disabled: uploading, onClick: () => fileInputRef.current?.click() },
            ]}
          />
          {dmAction && (
            <MessageActionSheet
              preview={dmAction.text}
              own={dmAction.senderUid === user.uid}
              actions={[{ label: "Copy", icon: Copy, onClick: () => copyMsg(dmAction) }]}
              onClose={() => setDmAction(null)}
            />
          )}
        </>
      ) : (
        <>
          {pinnedMsgs.length > 0 && (
            <div className="bg-orange-50 border-b border-orange-100 shrink-0">
              <button onClick={() => setShowPinned(!showPinned)} className="w-full px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Pin className="w-3 h-3" /> {pinnedMsgs.length} Pinned</span>
                {showPinned ? <ChevronUp className="w-3.5 h-3.5 text-orange-400" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-400" />}
              </button>
              {showPinned && <ul className="px-4 pb-2 space-y-1">{pinnedMsgs.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs"><span className="font-bold text-slate-700">{m.sender.split(" ")[0]}:</span><span className="text-slate-600 truncate flex-1">{m.text}</span>{isAdmin && <button onClick={() => togglePin(m)} className="text-orange-400"><X className="w-3 h-3" /></button>}</li>
              ))}</ul>}
            </div>
          )}

          <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
            <div className="min-h-full flex flex-col justify-end px-3 py-4">
            {hasOlderMessages && onLoadOlder && (
              <button onClick={onLoadOlder} className="self-center text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500">Load older messages</button>
            )}
            {isLoading(messages) && <p className="text-center text-xs text-slate-400 py-6">Loading messages…</p>}
            {!isLoading(messages) && stream.length === 0 && <p className="text-center text-xs text-slate-400 italic py-6">No messages here yet. Say hello!</p>}
            {stream.map((item, idx) => {
              if (item.kind === "divider") return <div key={item.id} className="pt-3"><DateDivider label={item.label} /></div>;
              if (item.kind === "announcement") {
                const a = item.announcement;
                return (
                  <div key={item.id} className="mt-3 rounded-2xl p-3.5 shadow-sm border" style={{ backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Bell className="w-3 h-3" /> Announcement</span>
                      {isAdmin && deleteAnnouncement && <button onClick={() => { if (confirm("Delete this announcement?")) deleteAnnouncement(a.id).catch(reportError("Couldn't delete the announcement")); }} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-1">{a.title}</div>
                    {a.body && <div className="text-xs text-slate-600 mt-0.5 leading-snug">{a.body}</div>}
                  </div>
                );
              }
              const m = item.message;
              const own = isOwn(m);
              // iMessage-style grouping: consecutive messages from one sender
              // (within 5 min) share one name, one avatar and one timestamp.
              const sameSender = (o) => o && o.kind === "msg" && o.message.senderUid === m.senderUid
                && Math.abs(tsMs(o.message.createdAt) - tsMs(m.createdAt)) < GROUP_GAP_MS;
              const first = !sameSender(stream[idx - 1]);
              const last = !sameSender(stream[idx + 1]);
              const seenN = own ? readByCount(m) : 0;
              const reacted = m.reactions && Object.keys(m.reactions).length > 0;
              const status = seenN ? `Read by ${seenN}` : "Delivered";
              return (
                <div key={m.id} className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} ${reacted ? "pt-2.5" : ""}`}>
                  {!own && (last ? <Avatar initials={m.initials} size={28} bg={m.isCoach ? COLORS.primary : "#94a3b8"} className="flex-shrink-0" /> : <div className="w-7 flex-shrink-0" />)}
                  <div className={`max-w-[78%] flex flex-col ${own ? "items-end" : "items-start"}`}>
                    {!own && first && (
                      <div className="flex items-baseline gap-1.5 mb-0.5 px-3">
                        <span className="text-[11px] font-semibold text-slate-500">{m.sender}</span>
                        {m.isCoach && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>Coach</span>}
                      </div>
                    )}
                    {m.replyToId && m.replyToSender && (
                      <div className="text-[11px] mb-0.5 px-3 py-1 rounded-2xl max-w-full border border-slate-200 bg-white/70 text-slate-500 truncate">
                        <Reply className="w-3 h-3 inline -mt-0.5 mr-1" /><span className="font-semibold text-slate-600">{m.replyToSender}</span> {m.replyToText}
                      </div>
                    )}
                    <LongPress onLong={() => setActionMsg(m)} className="relative max-w-full select-none">
                      <ReactionBadge reactions={m.reactions} myUid={user.uid} own={own} onClick={() => setActionMsg(m)} />
                      {m.kind === "poll" ? (
                        <PollCard message={m} own={own} myUid={user.uid} onVote={(idx2) => voteOnPoll(m.id, idx2)} isAdmin={isAdmin} onSeeVoters={() => openVoters(m)} />
                      ) : (
                        <div className="overflow-hidden" style={{ borderRadius: bubbleRadius(own, first, last), backgroundColor: own ? COLORS.primary : IOS_GRAY, color: own ? "#fff" : "#0F172A" }}>
                          {m.attachment?.type === "image" && m.attachment.url && (
                            <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={m.attachment.url} alt="" className="w-full max-h-80 object-cover" loading="lazy" />
                            </a>
                          )}
                          {m.attachment?.type === "video" && m.attachment.url && (
                            <div className="relative">
                              <video src={m.attachment.url} controls playsInline preload="metadata" className="w-full max-h-80 object-cover" />
                              <button onClick={() => setVideoViewer(m.attachment.url)} aria-label="Watch fullscreen" title="Watch fullscreen" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><Maximize2 className="w-4 h-4" /></button>
                            </div>
                          )}
                          {m.text && <p className="text-[15px] leading-snug break-words px-3.5 py-2"><Linkify>{m.text}</Linkify></p>}
                          {m.attachment && m.attachment.type !== "image" && m.attachment.type !== "video" && (
                            m.attachment.type === "file" && m.attachment.url ? (
                              <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={m.attachment.type} /><span className="text-[12px] font-semibold truncate">{m.attachment.name}</span></a>
                            ) : (
                              <div className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={m.attachment.type} /><span className="text-[12px] font-semibold truncate">{m.attachment.name}</span></div>
                            )
                          )}
                        </div>
                      )}
                    </LongPress>
                    {last && (
                      <div className="flex items-center gap-1 mt-1 px-1 text-[11px] text-slate-400">
                        {m.pinned && <Pin className="w-3 h-3 text-orange-500" />}
                        <span>{formatTime(m.createdAt)}</span>
                        {own && (isAdmin
                          ? <button onClick={() => openSeen(m)} className="font-medium hover:underline">· {status}</button>
                          : <span className="font-medium">· {status}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {pollOpen && (
            <div className="bg-white border-t border-slate-200 px-4 py-3 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Create poll</span>
                <button onClick={() => { setPollOpen(false); setPollDraft({ question: "", options: ["", ""] }); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <input value={pollDraft.question} onChange={(e) => setPollDraft({ ...pollDraft, question: e.target.value })} placeholder="Ask the team a question…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              {pollDraft.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input value={opt} onChange={(e) => { const copy = [...pollDraft.options]; copy[i] = e.target.value; setPollDraft({ ...pollDraft, options: copy }); }} placeholder={`Option ${i + 1}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                  {pollDraft.options.length > 2 && (
                    <button onClick={() => setPollDraft({ ...pollDraft, options: pollDraft.options.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                {pollDraft.options.length < 4 && (
                  <button onClick={() => setPollDraft({ ...pollDraft, options: [...pollDraft.options, ""] })} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">+ Option</button>
                )}
                <button onClick={sendPoll} disabled={!pollDraft.question.trim() || pollDraft.options.filter((o) => o.trim()).length < 2} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>Send poll</button>
              </div>
            </div>
          )}

          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendVideo(f); e.target.value = ""; }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />
          <ChatComposer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSend={send}
            uploading={uploading}
            placeholder={replyTo ? `Reply to ${replyTo.sender}` : "Message"}
            actions={[
              { key: "photo", label: "Photo", icon: Camera, disabled: uploading, onClick: () => photoInputRef.current?.click() },
              { key: "video", label: "Video", icon: Video, disabled: uploading, onClick: () => videoInputRef.current?.click() },
              { key: "file", label: "File", icon: Paperclip, disabled: uploading, onClick: () => fileInputRef.current?.click() },
              { key: "poll", label: "Poll", icon: BarChart3, active: pollOpen, onClick: () => setPollOpen(!pollOpen) },
              ...(isAdmin ? [{ key: "pin", label: "Pin next", icon: Pin, active: pinOnSend, onClick: () => setPinOnSend(!pinOnSend) }] : []),
              ...(isAdmin && effectiveChannel === "team" ? [{ key: "announce", label: "Announce", icon: Bell, active: announceMode, onClick: () => setAnnounceMode(!announceMode) }] : []),
            ]}
            banner={<>
              {replyTo && (
                <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100" style={{ backgroundColor: COLORS.accentSoft }}>
                  <Reply className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-700">Replying to {replyTo.sender}</div>
                    <div className="text-[11px] text-slate-600 truncate">{replyTo.kind === "poll" ? `📊 ${replyTo.question}` : replyTo.text}</div>
                  </div>
                  <button onClick={cancelReply} aria-label="Cancel reply" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                </div>
              )}
              {isAdmin && pinOnSend && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Pin className="w-3 h-3" /> Next message will be pinned</div>}
              {isAdmin && announceMode && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Bell className="w-3 h-3" /> Posting as an announcement to the whole team</div>}
            </>}
          />
          {actionMsg && (
            <MessageActionSheet
              preview={actionMsg.kind === "poll" ? `📊 ${actionMsg.question}` : (actionMsg.text || (actionMsg.attachment ? `📎 ${actionMsg.attachment.name || actionMsg.attachment.type}` : ""))}
              own={isOwn(actionMsg)}
              myReaction={(actionMsg.reactions || {})[user.uid]}
              onReact={reactToMessage ? (r) => reactToMessage(actionMsg.id, r).catch(reportError("Couldn't save your reaction")) : null}
              actions={[
                { label: "Reply", icon: Reply, onClick: () => startReply(actionMsg) },
                ...((actionMsg.text || actionMsg.kind === "poll") ? [{ label: "Copy", icon: Copy, onClick: () => copyMsg(actionMsg) }] : []),
                ...(isAdmin ? [{ label: actionMsg.pinned ? "Unpin" : "Pin", icon: Pin, onClick: () => togglePin(actionMsg) }] : []),
                ...(isAdmin && actionMsg.kind === "poll" ? [{ label: "See who voted", icon: BarChart3, onClick: () => openVoters(actionMsg) }] : []),
                ...(isAdmin && isOwn(actionMsg) ? [{ label: "Seen by", icon: Eye, onClick: () => openSeen(actionMsg) }] : []),
                ...(isAdmin ? [{ label: "Delete", icon: Trash2, danger: true, onClick: () => delMsg(actionMsg.id) }] : []),
              ]}
              onClose={() => setActionMsg(null)}
            />
          )}
        </>
      )}
    </div>
  );
};

/* ─── GYM (Free Exercise DB — Unlicense / public domain) ─── */
const titleCase = (s) =>
  String(s || "").split(/[\s_-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const useExerciseLib = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loadExercises()
      .then((d) => { if (alive) { setItems(d); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message || "Failed to load"); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  return { items, loading, err };
};

// Coach-authored exercise editor — same fields/structure as public library
// entries (equipment + muscle "tags", level, mechanic, how-to steps, photos)
// so custom exercises render identically. Tags are free-text + extensible.
const CustomExerciseForm = ({ item, uid, equipmentOptions = [], muscleOptions = [], onSave, onClose }) => {
  const editing = !!item?.id;
  const [name, setName] = useState(item?.name || "");
  const [equipment, setEquipment] = useState(item?.equipment || "");
  const [primary, setPrimary] = useState((item?.primaryMuscles || []).join(", "));
  const [aliases, setAliases] = useState((item?.aliases || []).join(", "));
  const [level, setLevel] = useState(item?.level || "beginner");
  const [mechanic, setMechanic] = useState(item?.mechanic || "");
  const [instructions, setInstructions] = useState((item?.instructions || []).join("\n"));
  const [photos, setPhotos] = useState(item?.images || []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadImage = async (file) => {
    const blob = await downscaleToBlob(file);
    const path = `exercises/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return getDownloadURL(snap.ref);
  };
  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try { const urls = []; for (const f of Array.from(files)) urls.push(await uploadImage(f)); setPhotos((p) => [...p, ...urls]); }
    catch (e) { toast("Couldn't upload photo — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const data = {
      name: name.trim(),
      equipment: equipment.trim() || "other",
      primaryMuscles: primary.split(",").map((s) => s.trim()).filter(Boolean),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      secondaryMuscles: item?.secondaryMuscles || [],
      level: level || "beginner",
      mechanic: mechanic.trim(),
      instructions: instructions.split("\n").map((s) => s.trim()).filter(Boolean),
      images: photos,
    };
    try { await onSave(data); onClose(); }
    catch (e) { toast("Couldn't save — " + (e.message || "check Firestore rules.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">{editing ? "Edit exercise" : "New exercise"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            <input list="ex-equip" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Equipment" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input list="ex-muscle" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="Muscles (comma-sep)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <datalist id="ex-equip">{equipmentOptions.map((o) => <option key={o} value={o} />)}</datalist>
            <datalist id="ex-muscle">{muscleOptions.map((o) => <option key={o} value={o} />)}</datalist>
          </div>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Also known as… (comma-separated nicknames)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{["beginner", "intermediate", "expert"].map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</select>
            <input list="ex-mech" value={mechanic} onChange={(e) => setMechanic(e.target.value)} placeholder="Mechanic (e.g. compound)" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <datalist id="ex-mech"><option value="compound" /><option value="isolation" /></datalist>
          </div>
          <AutoGrowTextarea value={instructions} onChange={(e) => setInstructions(e.target.value)} minRows={4} placeholder="How to do it — one step per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />

          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow"><X className="w-3 h-3 text-slate-500" /></button>
                </div>
              ))}
            </div>
          )}
          <label className="w-full py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
            <ImagePlus className="w-3.5 h-3.5" /> Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
          {uploading && <p className="text-[10px] font-semibold text-slate-400 px-1">Uploading…</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={save} disabled={busy || uploading || !name.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{editing ? "Save changes" : "Add exercise"}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ExerciseLibrary = ({ items, loading, err, onPick, picker, myWorkouts = [], addMyWorkout, updateMyWorkout, canEdit = false, uid, addCustomExercise, updateCustomExercise, deleteCustomExercise, seedLifts }) => {
  // Two-level drill: pick equipment, then pick muscle within that equipment.
  const [equip, setEquip] = useState(null);    // null = show equipment tiles
  const [muscle, setMuscle] = useState(null);  // null + equip set = show muscle tiles
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [formItem, setFormItem] = useState(null); // null=closed, {}=new, {...}=edit
  const [seeding, setSeeding] = useState(false);
  const runSeedLifts = async () => {
    if (!seedLifts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedLifts();
      toast(added ? `Added ${added} prehab starter exercise${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All prehab starter exercises are already in your library.");
    } catch (e) {
      toast("Couldn't add prehab starter exercises — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Existing equipment + muscle values power the form's datalists.
  const equipmentOptions = useMemo(() => [...new Set(items.map((ex) => ex.equipment).filter(Boolean))].sort(), [items]);
  const muscleOptions = useMemo(() => [...new Set(items.flatMap((ex) => ex.primaryMuscles || []).filter(Boolean))].sort(), [items]);

  // Modals shared across every browse level (mirrors how `selected` was reused).
  const overlays = (
    <>
      {selected && <ExerciseModal item={selected} onClose={() => setSelected(null)} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} canEdit={canEdit && !picker} onEdit={(it) => { setSelected(null); setFormItem(it); }} onDelete={deleteCustomExercise} />}
      {formItem !== null && <CustomExerciseForm item={formItem} uid={uid} equipmentOptions={equipmentOptions} muscleOptions={muscleOptions} onSave={(data) => (formItem.id ? updateCustomExercise(formItem.id, data) : addCustomExercise(data))} onClose={() => setFormItem(null)} />}
    </>
  );

  // Group by equipment (level 1).
  const byEquip = useMemo(() => {
    const map = {};
    items.forEach((ex) => {
      const e = ex.equipment || "other";
      (map[e] = map[e] || []).push(ex);
    });
    return map;
  }, [items]);
  const equipNames = useMemo(() => Object.keys(byEquip).sort(), [byEquip]);

  // Within selected equipment, group by primary muscle (level 2).
  const byMuscleForEquip = useMemo(() => {
    if (!equip) return {};
    const map = {};
    (byEquip[equip] || []).forEach((ex) => {
      const m = (ex.primaryMuscles || [])[0];
      if (!m) return;
      (map[m] = map[m] || []).push(ex);
    });
    return map;
  }, [byEquip, equip]);
  const muscleNames = useMemo(() => Object.keys(byMuscleForEquip).sort(), [byMuscleForEquip]);

  if (loading) return <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-slate-400`}>Loading exercises…</div>;
  if (err) return <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-red-500`}>Couldn't load: {err}</div>;

  const q = search.trim().toLowerCase();
  const searchHits = q ? searchExercises(items, search) : [];

  // Shared exercise row + search overlay.
  const renderExerciseRow = (ex) => (
    <li key={ex.id || ex.name}>
      <button onClick={() => onPick ? onPick(ex) : setSelected(ex)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-tight">{ex.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">{titleCase(ex.equipment)}{ex.primaryMuscles?.length ? ` · ${ex.primaryMuscles.map(titleCase).join(", ")}` : ""}</div>
        </div>
        {onPick ? <Plus className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
      </button>
    </li>
  );

  const searchBar = (
    <div className="px-5 space-y-2">
      {canEdit && !picker && (
        <div className="flex gap-2">
          <button onClick={() => setFormItem({})} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New exercise</button>
          {seedLifts && (
            <button onClick={runSeedLifts} disabled={seeding} title="Add the prehab starter set — bands only, hips / groin / ankles" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white disabled:opacity-50" style={{ borderColor: COLORS.primary, color: COLORS.primary }}><Dumbbell className="w-3.5 h-3.5" /> {seeding ? "Adding…" : "Prehab starter"}</button>
          )}
        </div>
      )}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, nickname, or muscle…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
    </div>
  );

  // Search overrides any level.
  if (q) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{searchHits.length} match{searchHits.length === 1 ? "" : "es"}</h3>
          <ul className="space-y-2">
            {searchHits.map(renderExerciseRow)}
            {searchHits.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No matches.</p>}
          </ul>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 1 — equipment tiles.
  if (!equip) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Or browse by equipment</h3>
          <div className="grid grid-cols-2 gap-3">
            {equipNames.map((e) => (
              <button key={e} onClick={() => setEquip(e)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-start text-left hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                <div className="text-sm font-bold text-slate-900 leading-tight">{titleCase(e)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{byEquip[e].length} exercise{byEquip[e].length === 1 ? "" : "s"}</div>
              </button>
            ))}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 2 — muscle tiles within selected equipment.
  if (!muscle) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <button onClick={() => setEquip(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-2"><ChevronLeft className="w-3 h-3" /> Equipment</button>
          <h3 className="text-lg font-bold text-slate-900">{titleCase(equip)}</h3>
          <p className="text-[11px] text-slate-500 mb-3">Pick a muscle group</p>
          <div className="grid grid-cols-2 gap-3">
            {muscleNames.map((m) => (
              <button key={m} onClick={() => setMuscle(m)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-start text-left hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                <div className="text-sm font-bold text-slate-900 leading-tight">{titleCase(m)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{byMuscleForEquip[m].length} exercise{byMuscleForEquip[m].length === 1 ? "" : "s"}</div>
              </button>
            ))}
            {muscleNames.length === 0 && <p className="text-sm text-slate-400 italic col-span-2 text-center py-6">No exercises in this category.</p>}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 3 — exercises.
  const inMuscle = byMuscleForEquip[muscle] || [];
  return (
    <div className="space-y-3">
      {searchBar}
      <div className="px-5">
        <button onClick={() => setMuscle(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-2"><ChevronLeft className="w-3 h-3" /> {titleCase(equip)}</button>
        <h3 className="text-lg font-bold text-slate-900">{titleCase(muscle)}</h3>
        <p className="text-[11px] text-slate-500">{inMuscle.length} exercise{inMuscle.length === 1 ? "" : "s"}</p>
      </div>
      <div className="px-5">
        <ul className="space-y-2">
          {inMuscle.map(renderExerciseRow)}
        </ul>
      </div>
      {overlays}
    </div>
  );
};

const ExercisePicker = ({ items, loading, err, onPick, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900">Add an exercise</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="py-3">
        <ExerciseLibrary items={items} loading={loading} err={err} onPick={onPick} picker />
      </div>
    </div>
  </div>
);

const WorkoutCard = ({ workout, onOpen, byline }) => (
  <button onClick={onOpen} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>
      <Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-slate-900 leading-tight truncate">{workout.name || "Untitled"}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">
        {(workout.exercises?.length || 0)} exercise{(workout.exercises?.length || 0) === 1 ? "" : "s"}{byline ? ` · ${byline}` : ""}
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
  </button>
);

const WORKOUT_STARTERS = ["Push Day", "Pull Day", "Leg Day", "Full Body", "Upper Body", "Core & Mobility"];

const WorkoutsView = ({ workouts, canEdit, add, update, del, readOnlyLabel, lib, seedWorkouts, groupByArea }) => {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [seeding, setSeeding] = useState(false);
  const runSeedWorkouts = async () => {
    if (!seedWorkouts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedWorkouts();
      toast(added ? `Added ${added} starter workout${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All starter workouts are already added.");
    } catch (e) {
      toast("Couldn't add starter workouts — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Group workouts by focus area (seeded ones carry `area`; manual ones fall
  // under "Your workouts"). Known areas render in a sensible order first.
  const grouped = useMemo(() => {
    if (!groupByArea) return null;
    const byArea = {};
    workouts.forEach((w) => { const a = w.area || "Your workouts"; (byArea[a] = byArea[a] || []).push(w); });
    const order = [...AREA_ORDER, "Your workouts"];
    return Object.keys(byArea)
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map((area) => ({ area, items: byArea[area] }));
  }, [workouts, groupByArea]);

  const open = workouts.find((w) => w.id === openId);
  if (open) {
    return (
      <WorkoutDetail
        key={open.id}
        workout={open}
        canEdit={canEdit}
        lib={lib}
        onSave={(d) => update(open.id, d)}
        onDelete={async () => { await del(open.id); setOpenId(null); }}
        onDuplicate={async () => {
          try { const ref = await add({ name: `${open.name} (copy)`, exercises: open.exercises || [] }); if (ref?.id) setOpenId(ref.id); }
          catch (e) { toast("Couldn't duplicate — " + (e.message || "")); }
        }}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const create = async (name) => {
    const n = (name || newName).trim();
    if (!n) return;
    try {
      const ref = await add(n);
      setNewName("");
      setCreating(false);
      if (ref?.id) setOpenId(ref.id);
    } catch (e) {
      toast("Couldn't create — " + (e.message || "check rules."));
    }
  };

  return (
    <div className="px-5 space-y-3">
      {canEdit ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Workout name (e.g. Pull Day)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex flex-wrap gap-1.5">
              {WORKOUT_STARTERS.map((s) => <button key={s} onClick={() => create(s)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{s}</button>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={() => create()} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setCreating(true)} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
              <Plus className="w-3.5 h-3.5" /> New workout
            </button>
            {seedWorkouts && (
              <button onClick={runSeedWorkouts} disabled={seeding} title="Add the prehab starter routines — pre-practice + at home" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white disabled:opacity-50" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
                <ClipboardList className="w-3.5 h-3.5" /> {seeding ? "Adding…" : "Starter set"}
              </button>
            )}
          </div>
        )
      ) : (
        readOnlyLabel && <ReadOnlyHint label={readOnlyLabel} />
      )}

      {isLoading(workouts) ? <LoadingNote /> : workouts.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No workouts yet.{canEdit && seedWorkouts ? " Tap “Starter set” for the prehab routines." : ""}</p>
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(({ area, items }) => (
            <div key={area}>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 px-1 mb-1.5">{area}</div>
              <ul className="space-y-2">
                {items.map((w) => (
                  <li key={w.id}><WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.focus || w.createdByName} /></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.createdByName} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Download a workout as a clean standalone file the player keeps for
// themselves — a self-contained HTML page they can open, print, or save.
// It is theirs to keep; nothing is shared back to the team.
const downloadWorkoutFile = (workout) => {
  const esc = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const rows = (workout.exercises || []).map((ex, i) => {
    const rx = [ex.sets ? `${ex.sets} sets` : "", ex.reps ? `× ${ex.reps}` : ""].filter(Boolean).join(" ");
    const load = ex.pct ? ` @ ${ex.pct}%` : ex.weight ? ` @ ${ex.weight}` : "";
    const notes = [ex.rpe ? `RPE ${ex.rpe}` : "", ex.tempo || "", ex.notes || ""].filter(Boolean).join(" · ");
    return `<tr><td>${i + 1}</td><td><strong>${esc(ex.name)}</strong>${notes ? `<div class="notes">${esc(notes)}</div>` : ""}</td><td>${esc(rx + load)}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(workout.name || "My Program")} — Brophy Soccer</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:24px 20px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}.sub{color:#64748b;font-size:13px;margin-bottom:20px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
td:first-child{width:28px;color:#94a3b8}.notes{font-size:12px;color:#64748b;margin-top:2px}
footer{margin-top:24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}
@media print{body{padding:0}}
</style></head><body>
<h1>${esc(workout.name || "My Program")}</h1>
<div class="sub">Brophy Soccer · My program · ${esc(date)}</div>
<table><thead><tr><th>#</th><th>Exercise</th><th>Sets × Reps</th></tr></thead><tbody>${rows || `<tr><td colspan="3">No exercises yet.</td></tr>`}</tbody></table>
<footer>In-season rules: bands only for prehab · never train to failure · technique before load · stop if pain is over 3/10. School lifting (2×/week) is separate from this prehab routine.</footer>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (workout.name || "my-program").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-program";
  a.href = url; a.download = `brophy-${slug}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const WorkoutDetail = ({ workout, canEdit, lib, onSave, onDelete, onDuplicate, onBack }) => {
  const [name, setName] = useState(workout.name || "");
  const [exercises, setExercises] = useState(workout.exercises || []);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [picker, setPicker] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false); // reveal %/RPE/tempo/superset editors

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, exercises })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the workout")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, exercises, dirty]);

  const handleBack = () => {
    if (dirty && canEdit) Promise.resolve(onSave({ name, exercises })).catch(reportError("Couldn't save the workout"));
    onBack();
  };

  const setEx = (i, field, value) => {
    setExercises(exercises.map((e, j) => (j === i ? { ...e, [field]: value } : e)));
    setDirty(true);
  };
  const removeEx = (i) => { setExercises(exercises.filter((_, j) => j !== i)); setDirty(true); };
  const moveEx = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises]; [next[i], next[j]] = [next[j], next[i]];
    setExercises(next); setDirty(true);
  };
  const addEx = (ex) => {
    setExercises([...exercises, newEntry(ex)]);
    setDirty(true);
    setPicker(false);
  };
  // Apply a ready-made strength template: matches each prescribed lift to the
  // library, appends its exercises, and names an untitled workout after it.
  const applyTemplate = (tpl) => {
    const built = buildTemplateWorkout(tpl, lib.items || []);
    setExercises([...exercises, ...built.exercises]);
    if (!name.trim()) setName(built.name);
    setDirty(true);
    setTplOpen(false);
    setAdvanced(true);
  };
  const cycleGroup = (i) => {
    const cur = exercises[i]?.group || "";
    const next = SUPERSET_LABELS[(SUPERSET_LABELS.indexOf(cur) + 1) % SUPERSET_LABELS.length];
    setEx(i, "group", next);
  };
  const groups = groupBySuperset(exercises);

  const confirmDelete = async () => {
    if (!confirm(`Delete "${workout.name}"? This can't be undone.`)) return;
    try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); }
  };

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Workout name" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
      ) : (
        <h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>
      )}

      {exercises.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No exercises yet.{canEdit ? " Add one below." : ""}</p>
      ) : canEdit ? (
        <ul className="space-y-2">
          {exercises.map((ex, i) => (
            <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-sm text-slate-900 leading-tight flex items-center gap-1.5">
                  {ex.name}
                  {ex.group && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: COLORS.accent }}>SS {ex.group}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveEx(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveEx(i, +1)} disabled={i === exercises.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => removeEx(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input value={ex.sets} onChange={(e) => setEx(i, "sets", e.target.value)} placeholder="Sets" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                  <input value={ex.reps} onChange={(e) => setEx(i, "reps", e.target.value)} placeholder="Reps" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => setEx(i, "loadMode", ex.loadMode === "percent" ? "weight" : "percent")}
                      title="Toggle load: absolute weight or % of the athlete's max"
                      className="px-2 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 bg-slate-50 flex-shrink-0"
                    >{ex.loadMode === "percent" ? "%" : "lb"}</button>
                    {ex.loadMode === "percent" ? (
                      <input value={ex.pct || ""} onChange={(e) => setEx(i, "pct", e.target.value)} placeholder="% max" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    ) : (
                      <input value={ex.weight || ""} onChange={(e) => setEx(i, "weight", e.target.value)} placeholder="Weight" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    )}
                  </div>
                </div>
                {advanced && (
                  <div className="grid grid-cols-3 gap-2">
                    <input value={ex.rpe || ""} onChange={(e) => setEx(i, "rpe", e.target.value)} placeholder="RPE" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    <input value={ex.tempo || ""} onChange={(e) => setEx(i, "tempo", e.target.value)} placeholder="Tempo" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    <button type="button" onClick={() => cycleGroup(i)} title="Superset — adjacent exercises sharing a label run back-to-back" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-semibold text-slate-600 bg-slate-50">{ex.group ? `Superset ${ex.group}` : "Superset"}</button>
                  </div>
                )}
                <input value={ex.notes || ""} onChange={(e) => setEx(i, "notes", e.target.value)} placeholder="Notes (optional)" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {groups.map((g, gi) => {
            const superset = g.group && g.items.length > 1;
            return (
              <li key={gi} className={`bg-white rounded-2xl p-3 shadow-sm border border-slate-100 ${superset ? "border-l-4" : ""}`} style={superset ? { borderLeftColor: COLORS.accent } : {}}>
                {superset && <div className="text-[9px] font-black uppercase tracking-wider mb-1.5" style={{ color: COLORS.accent }}>Superset {g.group}</div>}
                <div className="space-y-2">
                  {g.items.map(({ entry, index }) => (
                    <div key={index}>
                      <div className="font-semibold text-sm text-slate-900 leading-tight">{entry.name}</div>
                      <div className="text-[11px] text-slate-600">{formatPrescription(entry)}</div>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setPicker(true)} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
              <Plus className="w-3.5 h-3.5" /> Add exercise
            </button>
            <button onClick={() => setTplOpen(true)} title="Start from a ready-made strength template" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
              <ClipboardList className="w-3.5 h-3.5" /> Template
            </button>
          </div>
          {exercises.length > 0 && (
            <button onClick={() => setAdvanced((v) => !v)} className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
              {advanced ? "Hide" : "Show"} % max · RPE · tempo · supersets
            </button>
          )}
          {onDuplicate && (
            <button onClick={onDuplicate} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
              <Copy className="w-3.5 h-3.5" /> Duplicate workout
            </button>
          )}
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">
            Delete workout
          </button>
        </>
      )}

      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}

      {exercises.length > 0 && (
        <button onClick={() => downloadWorkoutFile({ name, exercises })} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
          <Download className="w-3.5 h-3.5" /> Download a copy to keep
        </button>
      )}

      {picker && (
        <ExercisePicker items={lib.items} loading={lib.loading} err={lib.err} onPick={addEx} onClose={() => setPicker(false)} />
      )}

      {tplOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setTplOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
              <h3 className="text-base font-bold text-slate-900">Start from a template</h3>
              <button onClick={() => setTplOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[11px] text-slate-500 px-1 pb-1">Adds ready-made exercises with %-of-max, RPE and supersets already prescribed. Loads individualize once each athlete has a max on file.</p>
              {WORKOUT_TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)} className="w-full text-left bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">{tpl.name}</div>
                    <div className="text-[10px] font-semibold text-slate-400">{tpl.entries.length} lifts</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GymPage = ({ user, myWorkouts, addMyWorkout, updateMyWorkout, deleteMyWorkout, teamWorkouts, addTeamWorkout, updateTeamWorkout, deleteTeamWorkout, customExercises = [], addCustomExercise, updateCustomExercise, deleteCustomExercise, seedLifts, seedTeamWorkouts }) => {
  const isAdmin = user.role === "admin";
  const [view, setView] = useState("library");
  const lib = useExerciseLib();

  // Coach-authored exercises sit at the front of the library, tagged custom so
  // they render their own photos + get edit/delete. They still group by the
  // same equipment/muscle fields as the public DB.
  const mergedLib = useMemo(() => ({
    items: [...customExercises.map((c) => ({ ...c, custom: true })), ...lib.items],
    loading: lib.loading,
    err: lib.err,
  }), [customExercises, lib.items, lib.loading, lib.err]);

  const subtabs = [
    ["library", "Library"],
    ["mine", "My Workouts"],
    ["team", "Team Workouts"],
  ];

  return (
    <div className="pt-3 pb-4 space-y-4">
      <div className="px-5">
        <div className="bg-white rounded-full p-1 flex border border-slate-100 shadow-sm">
          {subtabs.map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)} className={`flex-1 text-[11px] font-semibold py-2 rounded-full ${view === k ? "text-white" : "text-slate-500"}`} style={view === k ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-slate-500 mt-2 px-1">Pre-Practice Prehab — bands only, ~12 min before every practice and at home. Your school lifting (2×/week) is separate.</p>
      </div>

      {view === "library" && <ExerciseLibrary items={mergedLib.items} loading={mergedLib.loading} err={mergedLib.err} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} canEdit={isAdmin} uid={user.uid} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} />}
      {view === "mine" && (
        <WorkoutsView
          workouts={myWorkouts}
          canEdit
          add={addMyWorkout}
          update={updateMyWorkout}
          del={deleteMyWorkout}
          lib={mergedLib}
        />
      )}
      {view === "team" && (
        <WorkoutsView
          workouts={teamWorkouts}
          canEdit={isAdmin}
          add={addTeamWorkout}
          update={updateTeamWorkout}
          del={deleteTeamWorkout}
          lib={mergedLib}
          readOnlyLabel="Published by your coach"
          seedWorkouts={isAdmin ? seedTeamWorkouts : null}
          groupByArea
        />
      )}
    </div>
  );
};

const ExerciseModal = ({ item, onClose, myWorkouts = [], addMyWorkout, updateMyWorkout, canEdit = false, onEdit, onDelete }) => {
  // Custom exercises store full Storage URLs (often several); public-DB ones
  // store a single relative path resolved through the CDN.
  const customPhotos = item.custom ? (item.images || []) : [];
  const img = item.custom ? (item.images?.[0] || null) : exerciseImageUrl(item.images?.[0]);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const addToExisting = async (w) => {
    setMsg("");
    try {
      const exercises = [...(w.exercises || []), {
        exerciseId: item.id, name: item.name, equipment: item.equipment || "",
        sets: "3", reps: "10", weight: "", notes: "",
      }];
      await updateMyWorkout(w.id, { exercises });
      setMsg(`Added to "${w.name}".`);
      setPicking(false);
    } catch (e) { setMsg("Couldn't add — " + (e.message || "")); }
  };
  const addToNew = async () => {
    if (!newName.trim()) return;
    setMsg("");
    try {
      const ref = await addMyWorkout(newName);
      // Newly created workout has no exercises yet; append this one.
      await updateMyWorkout(ref.id, {
        exercises: [{
          exerciseId: item.id, name: item.name, equipment: item.equipment || "",
          sets: "3", reps: "10", weight: "", notes: "",
        }],
      });
      setMsg(`Created "${newName.trim()}" and added.`);
      setNewName(""); setCreating(false); setPicking(false);
    } catch (e) { setMsg("Couldn't create — " + (e.message || "")); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{titleCase(item.equipment)}</span>
              {item.custom && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>Team</span>}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{item.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {item.custom && canEdit && onEdit && <button onClick={() => onEdit(item)} title="Edit" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700"><Pencil className="w-4 h-4" /></button>}
            {item.custom && canEdit && onDelete && <button onClick={async () => { if (confirm(`Delete "${item.name}"?`)) { try { await onDelete(item.id); onClose(); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} title="Delete" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {customPhotos.length > 0 ? (
            <PhotoCarousel photos={customPhotos} />
          ) : img ? (
            <div className="aspect-video rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
              <img src={img} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
            </div>
          ) : (
            <div className="aspect-video rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs">No image</div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            {item.primaryMuscles?.length > 0 && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Primary</div><div className="font-semibold text-slate-900 mt-1">{item.primaryMuscles.map(titleCase).join(", ")}</div></div>
            )}
            {item.secondaryMuscles?.length > 0 && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Secondary</div><div className="font-semibold text-slate-900 mt-1">{item.secondaryMuscles.map(titleCase).join(", ")}</div></div>
            )}
            {item.mechanic && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Mechanic</div><div className="font-semibold text-slate-900 mt-1">{titleCase(item.mechanic)}</div></div>
            )}
            {item.level && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Level</div><div className="font-semibold text-slate-900 mt-1">{titleCase(item.level)}</div></div>
            )}
          </div>

          {item.instructions?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">How to do it</h4>
              <ol className="space-y-2">
                {item.instructions.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white mt-0.5" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Add to workout */}
          {updateMyWorkout && (
            <div className="pt-2 border-t border-slate-100">
              {!picking ? (
                <button onClick={() => setPicking(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
                  <Plus className="w-3.5 h-3.5" /> Add to Workout
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Add to…</span>
                    <button onClick={() => { setPicking(false); setCreating(false); setMsg(""); }} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                  {!creating ? (
                    <>
                      {myWorkouts.length > 0 && (
                        <ul className="space-y-1">
                          {myWorkouts.map((w) => (
                            <li key={w.id}>
                              <button onClick={() => addToExisting(w)} className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2 flex items-center justify-between text-left">
                                <span className="text-xs font-semibold text-slate-900 truncate">{w.name}</span>
                                <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">{w.exercises?.length || 0} ex</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button onClick={() => setCreating(true)} className="w-full bg-white border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                        <Plus className="w-3.5 h-3.5" /> New Workout
                      </button>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addToNew()} placeholder="Workout name (e.g. Pull Day)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                      <button onClick={addToNew} className="px-3 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
                    </div>
                  )}
                  {msg && <p className="text-[10px] font-semibold px-1" style={{ color: msg.startsWith("Added") || msg.startsWith("Created") ? COLORS.success : "#dc2626" }}>{msg}</p>}
                </div>
              )}
            </div>
          )}

          {!item.custom && (
            <p className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
              Data from <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer" className="underline">Free Exercise DB</a> (public domain).
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── SETTINGS MODAL ─── */
const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Settings — a professional page: Profile, Team & Role, People & Roles
// (org admin only), Notifications, Help, About. Tester feedback was removed
// outright (decision 2026-11-08, §10) — no feedback form exists anywhere.
const ROLE_LABELS = { player: "Player", admin: "Team Coach", orgAdmin: "Org Admin" };

const SettingsModal = ({ user, onClose, onSignOut, onReplayTour, isOrgAdmin = false, orgUsers = [], setUserRoleAndTeams }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [photo, setPhoto] = useState(user.photoURL || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const photoInputRef = useRef(null);
  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const oldPath = user.photoPath;
      const { snap, path } = await uploadFacePhoto(`avatars/${user.uid}/${Date.now()}`, file, 640, 0.85);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, photoPath: path });
      if (oldPath && oldPath !== path && oldPath.startsWith(`avatars/${user.uid}/`)) deleteStorageFile(oldPath);
      setPhoto(url);
    } catch (e) {
      const msg = "Couldn't update photo. " + (e.message || "Try again.");
      toast(msg);
      setPhotoErr(msg);
    } finally {
      setPhotoBusy(false);
    }
  };
  // On = this device has a saved token (permission alone stays granted after Off).
  const [pushOn, setPushOn] = useState(() => pushEnabledOnThisDevice());
  const [pushBusy, setPushBusy] = useState(false);
  const [err, setErr] = useState("");

  // iOS Safari → needs PWA install for push to work at all.
  const isIOS = typeof navigator !== "undefined"
    && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined"
    && (window.matchMedia?.("(display-mode: standalone)").matches
        || window.navigator?.standalone === true);
  const needsIOSInstall = isIOS && !isStandalone;

  const saveName = async () => {
    const name = nameInput.trim();
    if (!name || name === user.name) { setEditingName(false); return; }
    setSavingName(true);
    setErr("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name,
        initials: initialsOf(name),
      });
      setEditingName(false);
    } catch (e) {
      setErr("Couldn't save name — " + (e.message || ""));
    } finally {
      setSavingName(false);
    }
  };

  const togglePush = async () => {
    setErr("");
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePushOnThisDevice(user.uid);
        setPushOn(false);
      } else {
        await enablePushNotifications(user.uid);
        setPushOn(true);
      }
    } catch (e) {
      setErr(e.message || "Couldn't update notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const denied = currentPermission() === "denied";

  // ── People & Roles (org admin only) ──────────────────────────────────────
  // Who can make a coach, and at what level: ONLY the program admin
  // (orgAdmin) promotes/demotes anyone — Player / Team Coach / Org Admin —
  // and assigns which team(s) a coach coaches. A team coach can't promote
  // anyone. setUserRoleAndTeams + the users-doc rules enforce it server-side
  // too (only orgAdmin may write role/teamIds).
  const [roleSearch, setRoleSearch] = useState("");
  const [editingUid, setEditingUid] = useState(null);
  const [editRole, setEditRole] = useState("player");
  const [editTeams, setEditTeams] = useState([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const myTeams = useMemo(() => {
    const ids = (user.teamIds || []).filter(isValidTeamId);
    if (ids.length) return ids;
    return [user.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId);
  }, [user]);
  const filteredUsers = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    const list = (orgUsers || []).slice().sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
    if (!q) return list;
    return list.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [orgUsers, roleSearch]);
  const openEditor = (u) => {
    setEditingUid(u.id);
    setEditRole(u.role === "orgAdmin" ? "orgAdmin" : u.role === "admin" ? "admin" : "player");
    const teams = (u.teamIds || []).filter(isValidTeamId);
    setEditTeams(teams.length ? teams : [u.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId));
    setEditErr(""); setEditMsg("");
  };
  const saveEditor = async (u) => {
    if (!setUserRoleAndTeams) return;
    setEditBusy(true); setEditErr(""); setEditMsg("");
    try {
      await setUserRoleAndTeams(u.id, u.email, { role: editRole, teamIds: editTeams, primaryTeamId: editTeams[0] });
      setEditMsg(`${u.name || u.email} is now ${ROLE_LABELS[editRole] || "Player"}.`);
      setEditingUid(null);
    } catch (e) { setEditErr(e.message || "Couldn't save — try again."); }
    finally { setEditBusy(false); }
  };
  const toggleEditTeam = (teamId) => {
    setEditTeams((prev) => prev.includes(teamId) ? prev.filter((t) => t !== teamId) : [...prev, teamId]);
  };
  const roleBadgeStyle = (role) => role === "orgAdmin"
    ? { backgroundColor: COLORS.primary, color: "white" }
    : role === "admin"
    ? { backgroundColor: COLORS.accent, color: "#fff" }
    : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-base text-slate-900">Settings</h3>
          <button onClick={onClose} aria-label="Close settings" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* PROFILE */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Profile</h4>
            <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <Avatar photoURL={photo} initials={user.initials} size={48} bg={COLORS.accent} color={COLORS.primary} />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow border-2 border-white disabled:opacity-60"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  {photoBusy ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-3 h-3" />}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadPhoto(f); }} />
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveName()}
                      placeholder="Your name"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingName(false); setNameInput(user.name); }} disabled={savingName} className="flex-1 py-1.5 rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                      <button onClick={saveName} disabled={savingName || !nameInput.trim()} className="flex-1 py-1.5 rounded-full text-[11px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{savingName ? "Saving…" : "Save"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">{user.name}</span>
                      <button onClick={() => setEditingName(true)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline flex-shrink-0">Edit</button>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate font-mono">{user.email}</div>
                  </>
                )}
              </div>
            </div>
            {photoErr && <p className="text-xs text-red-600 leading-snug px-1 mt-2">{photoErr}</p>}
          </section>

          {/* TEAM & ROLE */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Team &amp; Role</h4>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md" style={roleBadgeStyle(user.role)}>
                  {ROLE_LABELS[user.role] || "Player"}
                </span>
                <span className="text-xs text-slate-600">
                  {myTeams.map((t) => getTeamShortName(t)).join(" · ") || "No team assigned yet"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Only the program admin can change your role or teams. A player can be on more than one team; a coach coaches the team (or teams) they are assigned to.
              </p>
            </div>
          </section>

          {/* PEOPLE & ROLES — org admin only */}
          {isOrgAdmin && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">People &amp; Roles</h4>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] text-slate-500 leading-snug">
                  Promote or demote anyone, and assign which team (or teams) a coach coaches. Team coaches can&apos;t change roles — only you can.
                </p>
                <input
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 bg-white"
                />
                {editMsg && <p className="text-[11px] text-green-700 font-semibold bg-green-50 border border-green-100 rounded-lg px-3 py-2">{editMsg}</p>}
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-2">{roleSearch ? "No one matches that search." : "No signed-in users yet."}</p>
                ) : (
                  <ul className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {filteredUsers.map((u) => {
                      const isSelf = u.id === user.uid;
                      const editing = editingUid === u.id;
                      const teams = (u.teamIds || []).filter(isValidTeamId);
                      return (
                        <li key={u.id} className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <Avatar photoURL={u.photoURL} initials={u.initials} size={36} bg={COLORS.accent} color={COLORS.primary} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {u.name || u.email}
                                {isSelf && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">You</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate font-mono">{u.email}</div>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[9px] font-black uppercase tracking-[0.12em] px-2 py-0.5 rounded-md" style={roleBadgeStyle(u.role)}>
                                  {ROLE_LABELS[u.role] || "Player"}
                                </span>
                                {u.role === "player" && !u.photoURL && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">No photo</span>
                                )}
                                {teams.map((t) => (
                                  <span key={t} className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{getTeamShortName(t)}</span>
                                ))}
                              </div>
                            </div>
                            {!isSelf && (
                              <button
                                onClick={() => (editing ? setEditingUid(null) : openEditor(u))}
                                className="text-[11px] font-bold text-slate-600 underline flex-shrink-0"
                              >
                                {editing ? "Close" : "Manage"}
                              </button>
                            )}
                          </div>
                          {editing && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-1.5">Role</div>
                                <div className="flex gap-1.5">
                                  {["player", "admin", "orgAdmin"].map((r) => (
                                    <button
                                      key={r}
                                      onClick={() => setEditRole(r)}
                                      className="flex-1 py-2 rounded-full text-[11px] font-bold disabled:opacity-50"
                                      style={editRole === r
                                        ? { backgroundColor: COLORS.primary, color: "white" }
                                        : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                                    >
                                      {ROLE_LABELS[r]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-1.5">Teams</div>
                                {editRole === "orgAdmin" ? (
                                  <p className="text-[11px] text-slate-500">Org admins see all three teams — JVB, JVA, and Varsity.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {TEAMS.map((t) => {
                                      const on = editTeams.includes(t.id);
                                      return (
                                        <button
                                          key={t.id}
                                          onClick={() => toggleEditTeam(t.id)}
                                          aria-pressed={on}
                                          className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                                          style={on
                                            ? { backgroundColor: COLORS.primary, color: "white" }
                                            : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                                        >
                                          {t.shortName}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              {editErr && <p className="text-[11px] text-red-500 font-medium">{editErr}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => setEditingUid(null)} disabled={editBusy} className="flex-1 py-2 rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                                <button
                                  onClick={() => saveEditor(u)}
                                  disabled={editBusy || (editRole !== "orgAdmin" && editTeams.length === 0)}
                                  className="flex-1 py-2 rounded-full text-[11px] font-bold text-white disabled:opacity-50"
                                  style={{ backgroundColor: COLORS.primary }}
                                >
                                  {editBusy ? "Saving…" : "Save changes"}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* NOTIFICATIONS */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Notifications</h4>
            {needsIOSInstall ? (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">📱 Install for notifications</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  On iPhone, push notifications only work when the app is installed to your home screen.
                </p>
                <ol className="text-[11px] text-slate-700 leading-relaxed pl-4 list-decimal space-y-1">
                  <li>Tap the <span className="font-semibold">Share</span> button in Safari's toolbar (square with arrow).</li>
                  <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
                  <li>Open the app from your home screen icon and come back here.</li>
                </ol>
              </div>
            ) : !notificationsSupported() ? (
              <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-500 italic">Push notifications aren't supported in this browser.</div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900">Push notifications</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    {denied
                      ? "Blocked. Allow in your browser's site settings, then refresh."
                      : pushOn
                      ? "On — you'll be pinged for announcements, chat, and events."
                      : "Get pinged for announcements, chat, and events."}
                  </div>
                </div>
                <button
                  onClick={togglePush}
                  disabled={pushBusy || denied}
                  className="text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2 rounded-full disabled:opacity-50 flex-shrink-0"
                  style={pushOn
                    ? { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }
                    : { backgroundColor: COLORS.primary, color: "white" }}
                >
                  {pushBusy ? "…" : pushOn ? "Turn Off" : "Turn On"}
                </button>
              </div>
            )}
            <NotificationPrefs user={user} />
          </section>

          {/* ABOUT */}
          {onReplayTour && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Help</h4>
              <div className="space-y-2">
                <button onClick={onReplayTour} className="w-full bg-slate-50 rounded-2xl p-4 text-left flex items-center justify-between hover:bg-slate-100">
                  <span className="text-sm font-semibold text-slate-900">Replay the welcome tour</span>
                  <span className="text-lg" aria-hidden="true">🎟️</span>
                </button>
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">About</h4>
            <div className="bg-slate-50 rounded-2xl p-4 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">App</span><span className="font-semibold text-slate-900">Brophy Soccer</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="font-mono text-[10px] text-slate-700">{BUILD_ID}</span></div>
            </div>
          </section>

          {err && <p className="text-xs text-red-500 text-center px-1">{err}</p>}

          {/* SIGN OUT */}
          <button onClick={() => { onClose(); onSignOut(); }} className="w-full py-3 rounded-full text-xs font-black uppercase tracking-[0.16em] text-red-600 border-2 border-red-100 hover:bg-red-50">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

// Blocking gate shown when a player's profile still has the auto-generated name
// (email prefix / single word) so the roster can show real names.
const NameGate = ({ user, onDone }) => {
  const prefix = (user.email || "").split("@")[0];
  const auto = !user.name || user.name.trim() === prefix || !user.name.trim().includes(" ");
  const parts = (user.name || "").trim().split(/\s+/);
  const [first, setFirst] = useState(auto ? "" : parts[0] || "");
  const [last, setLast] = useState(auto ? "" : parts.slice(1).join(" "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const name = `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
    if (!first.trim() || !last.trim()) { setErr("Please enter your first and last name."); return; }
    setBusy(true); setErr("");
    try { await updateDoc(doc(db, "users", user.uid), { name, initials: initialsOf(name) }); onDone(); }
    catch (e) { setErr(e.message || "Couldn't save — try again."); setBusy(false); }
  };
  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: COLORS.primary }}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="text-center">
          <img src="/brand/logo.png" alt="" className="w-12 h-12 object-contain mx-auto mb-2" />
          <h2 className="text-lg font-bold text-slate-900">Add your name</h2>
          <p className="text-xs text-slate-500 mt-1">So your coach and teammates know who's who on the roster.</p>
        </div>
        <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {err && <p className="text-[11px] text-red-500 font-medium">{err}</p>}
        <button onClick={save} disabled={busy || !first.trim() || !last.trim()} className="w-full py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save & continue"}</button>
        <button onClick={() => signOut(auth)} className="w-full text-[11px] font-semibold text-slate-400">Not you? Sign out</button>
      </div>
    </div>
  );
};

/* ─── MAIN ─── */
export default function TeamHubRolesApp() {
  const { user, loading, error: authError, clearError } = useAuth();

  // ── Teams (Brophy: JVB + JVA + Varsity under one account) ──────────────
  // A user belongs to one or more teams (user.teamIds, user.primaryTeamId).
  // Players see only their own team; a coach sees their team(s); an orgAdmin
  // sees all three and switches between them. `activeTeamId` is the team
  // every team-scoped query and write below is filtered/stamped by.
  const myTeamIds = useMemo(() => {
    if (!user) return [];
    if (user.role === "orgAdmin") return [...TEAM_IDS];
    const ids = (user.teamIds || []).filter(isValidTeamId);
    if (ids.length) return ids;
    return [user.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId);
  }, [user]);
  const isCoach = user?.role === "admin" || user?.role === "orgAdmin";
  // Locked-out accounts (today: drillBuilder — drill-library-only accounts)
  // never see the app shell: the early return below renders NoAccessScreen
  // instead, and every subscription in this component is skipped with a
  // null collection (lockedOut ? null : ...), so no team data is fetched
  // behind the lock screen. Firestore rules fail closed anyway; this is
  // the UX lock. Defined here, before the first subscription.
  const lockedOut = Boolean(user) && isLockedOutRole(user.role);
  // No subscriptions until someone is signed in (and never for a locked-out
  // role). Listening while signed out was denied by the rules, popped a
  // "Some data couldn't load" toast on the login screen, and those dead
  // listeners did not restart after sign-in.
  const noData = !user || lockedOut;
  // A per-team coach (role 'admin' only — NOT the org admin). DMs are
  // between a player and their own team's coach, so the org admin never
  // subscribes to DM threads (decision 2026-11-08).
  const isTeamCoach = user?.role === "admin";
  const visibleTeams = useMemo(() => TEAMS.filter((t) => myTeamIds.includes(t.id)), [myTeamIds]);
  const canSeeMultipleTeams = visibleTeams.length > 1;
  // The user's preferred team, persisted per device so a returning user lands
  // on the team they were viewing. `activeTeamId` is derived during render
  // (never corrected in an effect): if the saved preference isn't one of the
  // user's teams (e.g. saved before a role change), fall back to their first
  // team. Deriving during render keeps this lint-clean
  // (react-hooks/set-state-in-effect).
  const [preferredTeamId, setPreferredTeamId] = useState(() => {
    try {
      const saved = localStorage.getItem("activeTeamId");
      return isValidTeamId(saved) ? saved : null;
    } catch { return null; }
  });
  const activeTeamId = myTeamIds.includes(preferredTeamId)
    ? preferredTeamId
    : (myTeamIds[0] || DEFAULT_TEAM_ID);
  useEffect(() => {
    try { localStorage.setItem("activeTeamId", activeTeamId); } catch { /* private mode */ }
  }, [activeTeamId]);

  // One-time, idempotent seed of the `teams/{teamId}` docs (name, short name,
  // level, coachUids) for the teams this user can see. A coach may create
  // their own team's doc if it's missing; only an org admin may change one —
  // see firestore.rules. Runs once per session for coaches/admins.
  const teamsSeededRef = useRef(false);
  useEffect(() => {
    if (!user || !isCoach || teamsSeededRef.current) return;
    teamsSeededRef.current = true;
    (async () => {
      try {
        for (const t of visibleTeams) {
          const ref = doc(db, "teams", t.id);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, { ...teamDocFields(t), createdAt: serverTimestamp() });
          }
        }
      } catch {
        teamsSeededRef.current = false; // retry on a later render
      }
    })();
  }, [user, isCoach, visibleTeams]);
  // Deep link (?tab=X from a notification or shared link) picks the first tab.
  // Gym/Nutrition/Videos live under the Train hub.
  const initialTab = (() => { try { return new URLSearchParams(window.location.search).get("tab") || ""; } catch { return ""; } })();
  const [tab, setTab] = useState(() => (TRAIN_VIEWS.includes(initialTab) ? "train" : initialTab || "home"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [trainView, setTrainView] = useState(() => (TRAIN_VIEWS.includes(initialTab) ? initialTab : null)); // Train sub-page: gym | nutrition | videos
  const [showTour, setShowTour] = useState(false);
  // First-login welcome tour, once per device (localStorage). Derived during
  // render instead of set from an effect.
  const [tourSeen, setTourSeen] = useState(() => { try { return Boolean(localStorage.getItem(TOUR_SEEN_KEY)); } catch { return true; } });
  const tourOpen = showTour || (Boolean(user) && !tourSeen);
  // Offer a refresh when a newer build is deployed while the app is open.
  const { updateReady, reload } = useAppUpdate();
  // Automatic live-data recovery: re-sync Firestore whenever the app comes
  // back to the foreground, so a stream killed while the app was backgrounded
  // never leaves chat and everything else frozen. Fully automatic — the
  // header Refresh button is only a backup.
  const { resync: resyncFirestore, syncing: firestoreSyncing } = useFirestoreResync();
  const firestoreStale = useFirestoreStale();

  // First-login welcome tour. "Seen" is tracked per-device in localStorage, so
  // it auto-runs once and never nags again (no backend/rules change needed).
  // Bump the key suffix to re-show the tour to everyone after a big update.
  const closeTour = () => {
    setShowTour(false); setTourSeen(true);
    try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* private mode */ }
  };

  // Shared face-photo upload for the welcome tour and the Home nudge.
  // Same flow as Settings: downscale, store under avatars/{uid}/{ts}.jpg,
  // save photoURL + photoPath on the user's doc. Returns the URL (or null).
  // On failure it toasts and throws the same message, so the caller can
  // show the reason inline instead of failing silently.
  const uploadOwnPhoto = async (file) => {
    if (!file || !user) return null;
    try {
      const oldPath = user.photoPath;
      const { snap, path } = await uploadFacePhoto(`avatars/${user.uid}/${Date.now()}`, file, 640, 0.85);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, photoPath: path });
      if (oldPath && oldPath !== path && oldPath.startsWith(`avatars/${user.uid}/`)) deleteStorageFile(oldPath);
      toast("Photo added.");
      return url;
    } catch (e) {
      const msg = "Couldn't add photo. " + (e.message || "Try again.");
      toast(msg);
      throw new Error(msg, { cause: e });
    }
  };

  // Returning from a magic-link email: finish the sign-in. If the link was
  // opened on a different device/browser (no stored email), LoginScreen asks
  // for the email inline instead of a blocking window.prompt.
  const [emailLinkPending, setEmailLinkPending] = useState(() => {
    try { return isSignInWithEmailLink(auth, window.location.href); } catch { return false; }
  });
  const completeEmailLink = async (email) => {
    await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
    try { localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY); } catch { /* private mode */ }
    window.history.replaceState({}, "", "/");
    setEmailLinkPending(false);
  };
  useEffect(() => {
    if (!emailLinkPending) return;
    let email = "";
    try { email = localStorage.getItem(EMAIL_FOR_SIGNIN_KEY) || ""; } catch { /* private mode */ }
    if (!email) return; // LoginScreen shows the confirm-email form
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        try { localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY); } catch { /* private mode */ }
        window.history.replaceState({}, "", "/");
        setEmailLinkPending(false);
      })
      .catch((e) => {
        console.error("email-link sign-in failed:", e);
        toast("Couldn't finish sign-in — " + (e.message || "link expired."));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link to the right tab when arriving via ?tab=X or notification click.
  // Workouts/Nutrition/Videos no longer have their own tabs — route those to
  // the Train hub with the matching sub-view so old links keep working.
  const routeToTab = (t) => {
    if (TRAIN_VIEWS.includes(t)) {
      setTrainView(t);
      setTab("train");
    } else {
      setTab(t);
    }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if ("serviceWorker" in navigator) {
      const handler = (e) => {
        if (e.data?.type === "deeplink") {
          const url = new URL(e.data.link, window.location.origin);
          const t = new URLSearchParams(url.search).get("tab");
          if (t) routeToTab(t);
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

  // Foreground messages (app open): show an in-app banner that slides down
  // from the top, like a phone notification. (Phones don't allow
  // new Notification() from a page, so the old code showed nothing.) Tapping
  // it goes where the notification points. A chat message isn't bannered
  // while you're already in Chat.
  const [inAppBanner, setInAppBanner] = useState(null);
  const activeTabRef = useRef(null);
  useEffect(() => { activeTabRef.current = tab; }, [tab]);
  useEffect(() => {
    if (!user || lockedOut) return;
    return onForegroundMessage((payload) => {
      const n = payload.notification || {};
      const d = payload.data || {};
      const link = d.link || payload.fcmOptions?.link || "/";
      const tab = new URLSearchParams(new URL(link, window.location.origin).search).get("tab");
      if (tab === "messages" && activeTabRef.current === "messages") return;
      try { navigator.vibrate?.(30); } catch { /* not supported */ }
      setInAppBanner({ id: Date.now(), title: n.title || d.title || "Brophy Soccer", body: n.body || d.body || "", tab });
    });
  }, [user, lockedOut]);
  useEffect(() => {
    if (!inAppBanner) return undefined;
    const t = setTimeout(() => setInAppBanner(null), 5000);
    return () => clearTimeout(t);
  }, [inAppBanner]);
  // Keep this device's push token current (silently, once per open).
  useEffect(() => {
    if (user?.uid && !lockedOut) refreshPushToken(user.uid);
  }, [user?.uid, lockedOut]);

  // Live from Firestore — see Build Guide §4 + §8
  const announcements = useCollection(noData ? null : ("announcements"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addAnnouncement = (title, body) =>
    addDoc(collection(db, "announcements"), {
      teamId: activeTeamId,
      title: title.trim(),
      body: (body || "").trim(),
      pinned: false,
      createdAt: serverTimestamp(),
    });

  // Team-scoped app prompts + branding: one doc per kind PER TEAM
  // (`profilePrompt_{teamId}`, `lineupLogo_{teamId}`) so a coach of one team
  // can't change another team's settings (firestore.rules appConfig). The
  // legacy global docs are still read as a fallback until each team sets its own.
  const appConfig = useCollection(noData ? null : ("appConfig"));
  const profilePrompt = appConfig.find((d) => d.id === `profilePrompt_${activeTeamId}`)
    || appConfig.find((d) => d.id === "profilePrompt");
  // Team logo used as the centered watermark on every game-day line-up.
  const lineupLogo = appConfig.find((d) => d.id === `lineupLogo_${activeTeamId}`)
    || appConfig.find((d) => d.id === "lineupLogo");
  // Game Stats stat keepers (appConfig/statKeepers_<team>): uids allowed to
  // record games + a roster snapshot their phones use (see GameStats).
  const statKeepers = appConfig.find((d) => d.id === `statKeepers_${activeTeamId}`) || null;
  const isStatKeeper = Boolean(user && (statKeepers?.uids || []).includes(user.uid));
  const setStatKeepers = (uids, roster) =>
    setDoc(doc(db, "appConfig", `statKeepers_${activeTeamId}`), { uids, roster, updatedByName: user.name, updatedAt: new Date().toISOString() });
  // Coach-set positions for the roster (see PlayersByPosition).
  const positionsByUid = appConfig.find((d) => d.id === `rosterPositions_${activeTeamId}`)?.byUid || EMPTY_OBJ;
  const setPlayerPosition = (uid, pos) =>
    setDoc(doc(db, "appConfig", `rosterPositions_${activeTeamId}`), { byUid: { [uid]: pos }, updatedByName: user.name }, { merge: true });
  const setLineupLogo = async (url, path) => {
    const oldPath = lineupLogo?.path;
    await setDoc(doc(db, "appConfig", `lineupLogo_${activeTeamId}`), { url: url || "", path: path || "", updatedByName: user.name }, { merge: true });
    if (oldPath && oldPath !== path && oldPath.startsWith(`branding/${user.uid}/`)) deleteStorageFile(oldPath);
  };
  const requestProfileUpdate = async () => {
    await setDoc(doc(db, "appConfig", `profilePrompt_${activeTeamId}`), { requestedAt: new Date().toISOString(), byName: user.name }, { merge: true });
    // Reuse the announcement fan-out so it also lands as a push to everyone.
    await addAnnouncement("Update your profile", "Please add your full name so the team roster shows who's who. Tap Update now or open Settings.");
  };
  const togglePinAnnouncement = (id, pinned) =>
    updateDoc(doc(db, "announcements", id), { pinned: !pinned });
  const updateAnnouncement = (id, { title, body }) =>
    updateDoc(doc(db, "announcements", id), { title: title.trim(), body: (body || "").trim() });
  const deleteAnnouncement = (id) => deleteDoc(doc(db, "announcements", id));

  const eventsRaw = useAudienceCollection(noData ? null : ("events"), user, null, activeTeamId);
  const groupsList = useCollection(noData ? null : ("groups"), where("teamId", "==", activeTeamId), orderBy("name"));
  // Admin-only view of signed-in players for the Groups picker. Defer the
  // listener until the user is known + actually an admin (rules deny otherwise).
  // Roster for the active team only (a coach picks players from their own
  // team; the org admin switches teams to see the others).
  const allUsersRaw = useCollection(
    noData ? null : (isCoach ? "users" : null),
    where("teamIds", "array-contains", activeTeamId),
    orderBy("name"),
  );
  const invitesRaw = useCollection(noData || !isCoach ? null : ("invitedEmails"), where("teamId", "==", activeTeamId), orderBy("email"));
  // An invite marked Coach wins over an account still saying "player" (the
  // account was made before the invite was changed). People lists treat them
  // as a coach right away; the program admin's app also fixes the account
  // (below), which is what actually unlocks coach tools for them.
  const allUsers = useMemo(() => {
    const coachEmails = new Set((invitesRaw || []).filter((i) => i.role === "admin").map((i) => (i.email || i.id || "").toLowerCase()));
    if (!coachEmails.size) return allUsersRaw;
    const out = allUsersRaw.map((u) => (u.role === "player" && coachEmails.has((u.email || "").toLowerCase()) ? { ...u, role: "admin", roleFromInvite: true } : u));
    return Object.assign(out, allUsersRaw.loading ? { loading: true } : {});
  }, [allUsersRaw, invitesRaw]);
  useEffect(() => {
    if (user?.role !== "orgAdmin") return;
    const fix = allUsers.filter((u) => u.roleFromInvite);
    fix.forEach((u) => updateDoc(doc(db, "users", u.id), { role: "admin" })
      .then(() => console.info(`Role synced to coach for ${u.email}`))
      .catch((e) => console.warn("role sync failed", u.email, e?.code)));
  }, [allUsers, user?.role]);
  // Org-admin-only view of EVERY signed-in user across all three teams, for
  // the Settings admin model (§10): the program admin manages roles and team
  // assignments here. A team coach never subscribes (rules deny otherwise).
  const orgUsers = useCollection(
    noData ? null : (user?.role === "orgAdmin" ? "users" : null),
    orderBy("name"),
  );
  const events = useMemo(() => {
    if (!user) return eventsRaw;
    if (user.role === "admin") return eventsRaw;
    // Group membership stores uids (preferred). Falls back to emails for
    // players added before they signed in once.
    const myGroupIds = new Set(
      groupsList
        .filter((g) => {
          const m = g.memberUids || [];
          return m.includes(user.uid) || m.includes(user.email);
        })
        .map((g) => g.id),
    );
    return eventsRaw.filter((e) => {
      const v = e.visibleTo;
      if (!v) return true;
      const directList = v.uids || v.emails || []; // accept either name
      const groupIds = v.groupIds || [];
      if (directList.length === 0 && groupIds.length === 0) return true;
      if (directList.includes(user.uid) || directList.includes(user.email)) return true;
      return groupIds.some((id) => myGroupIds.has(id));
    });
  }, [eventsRaw, user, groupsList]);
  // Keep `audienceKeys` in sync whenever an event's visibility is set/changed.
  const withEventAudience = (data) =>
    Object.prototype.hasOwnProperty.call(data, "visibleTo")
      ? { ...data, audienceKeys: audienceKeysFor(data.visibleTo, groupsList) }
      : data;
  const addEvent = (data) =>
    addDoc(collection(db, "events"), {
      ...data,
      teamId: activeTeamId,
      audienceKeys: audienceKeysFor(data.visibleTo, groupsList),
      createdAt: serverTimestamp(),
    });
  const updateEvent = (id, data) => updateDoc(doc(db, "events", id), withEventAudience(data));
  const deleteEvent = (id) => deleteDoc(doc(db, "events", id));
  const importEvents = async (rows, { notify = true } = {}) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "events")), {
      ...r,
      // Absolute start (team time) so the reminder function can schedule the
      // 1-hour and 7 AM pings for imported / program-assigned sessions too.
      startAt: r.startAt || zonedDate(r.date, r.start),
      teamId: activeTeamId,
      audienceKeys: audienceKeysFor(r.visibleTo, groupsList),
      createdAt: serverTimestamp(),
      ...(notify ? {} : { notify: false }),
    }));
    await batch.commit();
  };

  // Personal events — own subcollection, never seen by others.
  const personalPath = user ? `users/${user.uid}/personalEvents` : null;
  const personalEvents = useCollection(noData ? null : (personalPath));
  const addPersonalEvent = (data) =>
    addDoc(collection(db, personalPath), { ...data, createdAt: serverTimestamp() });
  const updatePersonalEvent = (id, data) =>
    updateDoc(doc(db, personalPath, id), data);
  const deletePersonalEvent = (id) => deleteDoc(doc(db, personalPath, id));

  // Groups — admin manages, signed-in reads for the event visibility filter.
  const addGroup = (name) =>
    addDoc(collection(db, "groups"), {
      teamId: activeTeamId,
      name: name.trim(),
      memberUids: [],
      createdBy: user.name,
      createdAt: serverTimestamp(),
    });
  const updateGroupMembers = async (id, memberUids) => {
    await updateDoc(doc(db, "groups", id), { memberUids });
    // Re-resolve audienceKeys on every event/channel addressed to this group
    // so server-side visibility tracks the new membership.
    const nextGroups = groupsList.map((g) => (g.id === id ? { ...g, memberUids } : g));
    const batch = writeBatch(db);
    let n = 0;
    eventsRaw.forEach((e) => {
      if ((e.visibleTo?.groupIds || []).includes(id)) {
        batch.update(doc(db, "events", e.id), { audienceKeys: audienceKeysFor(e.visibleTo, nextGroups) });
        n++;
      }
    });
    const affectedChannels = [];
    chatGroups.forEach((c) => {
      if ((c.visibleTo?.groupIds || []).includes(id)) affectedChannels.push(c);
    });
    if (n) await batch.commit();
    // Channels addressed to this group: re-stamp their messages FIRST, then
    // the channel (same order as updateChatGroup), so removed members lose
    // the history and added members gain it — enforced by the rules.
    for (const c of affectedChannels) {
      await restampChannel(c.id, audienceKeysFor(c.visibleTo, nextGroups), c.teamId || activeTeamId);
    }
  };
  // Re-stamp EVERY message of a channel with the channel's audience. Queried
  // from the server (not just the messages loaded in this session), so older
  // history outside the chat window is covered too.
  const restampChannel = async (channelId, audienceKeys, teamId) => {
    const snap = await getDocs(query(collection(db, "messages"), where("teamId", "==", teamId), where("channel", "==", channelId)));
    await commitInChunks(snap.docs, (b, d) => b.update(d.ref, { audienceKeys }));
    await updateDoc(doc(db, "chatGroups", channelId), { audienceKeys });
  };
  const deleteGroup = (id) => deleteDoc(doc(db, "groups", id));
  // Org admin: remove a player's profile (e.g. someone who joined by link).
  // Their sign-in stops working until they're invited again.
  const removeUser = (uid) => deleteDoc(doc(db, "users", uid));

  const videos = useCollection(noData ? null : ("videos"), orderBy("createdAt", "desc"));
  const addVideo = (data) =>
    addDoc(collection(db, "videos"), { ...data, createdAt: serverTimestamp() });
  const updateVideo = (id, data) => updateDoc(doc(db, "videos", id), data);
  const deleteVideo = (id) => deleteDoc(doc(db, "videos", id));
  const importVideos = async (rows) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "videos")), { ...r, createdAt: serverTimestamp() }));
    await batch.commit();
  };

  // Video folders (Videos & Links under Training): coach-created top-level
  // folders and subfolders. Shared across all three teams, like the videos
  // themselves (no teamId). A folder doc is { name, parent, createdAt }.
  // parent is null for a top-level folder, or the parent folder's name for
  // a subfolder. The six built-in folders (VIDEO_CATS) always show; custom
  // folders from here join them.
  const videoFolderDocs = useCollection(noData ? null : ("videoFolders"), orderBy("name"));
  const addVideoFolder = (name, parent) =>
    addDoc(collection(db, "videoFolders"), { name: name.trim(), parent: parent || null, createdAt: serverTimestamp() });
  const deleteVideoFolder = (id) => deleteDoc(doc(db, "videoFolders", id));
  // Renaming a folder moves everything filed under it: the videos in it and,
  // for a top-level folder, its subfolders are re-filed under the new name
  // in the same batch, so nothing is ever orphaned.
  // F54: the videos are found with a fresh query (not just the ones loaded
  // on this phone) and re-filed in chunks (no 500-write batch limit); the
  // folder doc is renamed last, and the Videos page also shows any folder a
  // video is filed under, so an interrupted rename never hides anything.
  const renameVideoFolder = async (folder, newName) => {
    const name = newName.trim();
    if (!folder.parent) {
      const vids = await getDocs(query(collection(db, "videos"), where("cat", "==", folder.name)));
      await commitInChunks(vids.docs, (b, d) => b.update(d.ref, { cat: name }));
      const kids = await getDocs(query(collection(db, "videoFolders"), where("parent", "==", folder.name)));
      await commitInChunks(kids.docs, (b, d) => b.update(d.ref, { parent: name }));
    } else {
      const vids = await getDocs(query(collection(db, "videos"), where("cat", "==", folder.parent)));
      const inSub = vids.docs.filter((d) => d.data().subfolder === folder.name);
      await commitInChunks(inSub, (b, d) => b.update(d.ref, { subfolder: name }));
    }
    await updateDoc(doc(db, "videoFolders", folder.id), { name });
  };

  // Shared documents library (Train → Documents): items for all teams plus
  // the active team's own. Coaches upload to Storage library/{scope}/{uid}/.
  const libraryItems = useCollection(noData ? null : ("libraryItems"), where("teamId", "in", ["all", activeTeamId]), orderBy("createdAt", "desc"));
  const addLibraryItem = async ({ kind, file, url, title, folder, desc, scope, notify }, onProgress) => {
    const teamId = scope === "all" ? "all" : activeTeamId;
    const base = { teamId, title, folder: folder || "", desc: desc || "", notify: Boolean(notify), createdByUid: user.uid, createdByName: user.name, createdAt: serverTimestamp() };
    if (kind === "link") return addDoc(collection(db, "libraryItems"), { ...base, kind: "link", url });
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const contentType = file.type || LIBRARY_MIME_BY_EXT[ext] || "application/octet-stream";
    const safe = file.name.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "file";
    const path = `library/${teamId}/${user.uid}/${uploadStamp()}-${safe}`;
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType });
    await new Promise((resolve, reject) => task.on("state_changed",
      (s) => onProgress?.(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)), reject, resolve));
    const fileUrl = await getDownloadURL(task.snapshot.ref);
    return addDoc(collection(db, "libraryItems"), { ...base, kind: "file", url: fileUrl, path, name: file.name, fileType: contentType, size: file.size });
  };
  const updateLibraryItem = (id, data) => updateDoc(doc(db, "libraryItems", id), data);
  const deleteLibraryItem = (id) => deleteDoc(doc(db, "libraryItems", id));

  // Drill library — building blocks for the Practice page (same CRUD as videos).
  // ONE shared library: the `drillLibrary` collection is read and written by
  // this app AND the standalone Drill Library site — a drill made in either
  // shows up in both. The shared document shape lives in src/lib/drillDoc.js.
  // `createdByUid` is stamped on create: the drillLibrary rules require it.
  const drillsRaw = useCollection(noData ? null : ("drillLibrary"), orderBy("createdAt", "desc"));
  const drills = useMemo(() => drillsRaw.map(normalizeDrillDoc), [drillsRaw]);
  const addDrill = (data) =>
    addDoc(collection(db, "drillLibrary"), {
      ...data,
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      createdByName: user.name,
    });
  const updateDrill = (id, data) => updateDoc(doc(db, "drillLibrary", id), { ...data, updatedAt: serverTimestamp() });
  const deleteDrill = (id) => deleteDoc(doc(db, "drillLibrary", id));

  // Practices — saved sessions assembled from drills (mirrors teamWorkouts).
  const practices = useCollection(noData ? null : ("practices"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  // Accepts a plain name (string) or a full template object (blank / starter / copy).
  const addPractice = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "practices"), {
      desc: "", cat: "", blocks: [], published: false,
      createdByName: user.name, createdByUid: user.uid, createdAt: serverTimestamp(),
      ...base,
      teamId: activeTeamId,
      name: (base.name || "").trim(),
    });
  };
  const updatePractice = (id, data) => updateDoc(doc(db, "practices", id), data);
  const deletePractice = (id) => deleteDoc(doc(db, "practices", id));

  // Programs — ordered sequences of practices (dates assigned at assign-time).
  const programs = useCollection(noData ? null : ("programs"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  // Accepts a plain name (string) or a full object (copy / shared curriculum).
  const addProgram = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "programs"), {
      teamId: activeTeamId, name: (base.name || "").trim(), desc: base.desc || "", days: base.days || [],
      published: !!base.published, shared: !!base.shared,
      createdByUid: user.uid, createdByName: user.name, createdAt: serverTimestamp(),
    });
  };
  const updateProgram = (id, data) => updateDoc(doc(db, "programs", id), data);
  const deleteProgram = (id) => deleteDoc(doc(db, "programs", id));

  // Game-day starting line-ups — coach assembles players onto a pitch and
  // saves the "field" under a custom name (mirrors practices CRUD).
  const lineups = useCollection(noData ? null : ("lineups"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addLineup = (data) =>
    addDoc(collection(db, "lineups"), {
      teamId: activeTeamId,
      name: (data?.name || "").trim(), formation: data?.formation || "", slots: data?.slots || [],
      createdByName: user.name, createdAt: serverTimestamp(),
    });
  const updateLineup = (id, data) => updateDoc(doc(db, "lineups", id), data);
  const deleteLineup = (id) => deleteDoc(doc(db, "lineups", id));

  // Coach-authored exercises — mixed into the public Exercise Library, same
  // shape so they slot under the same equipment/muscle tags.
  const customExercises = useCollection(noData ? null : ("customExercises"), orderBy("createdAt", "desc"));
  const addCustomExercise = (data) =>
    addDoc(collection(db, "customExercises"), { ...data, createdAt: serverTimestamp() });
  const updateCustomExercise = (id, data) => updateDoc(doc(db, "customExercises", id), data);
  const deleteCustomExercise = (id) => deleteDoc(doc(db, "customExercises", id));
  // One-tap starter library — batch-writes the curated lift seed, skipping any
  // lift whose name already exists (additive; never disturbs existing exercises).
  const seedLifts = async () => {
    const have = new Set(customExercises.map((e) => (e.name || "").toLowerCase().trim()));
    const fresh = liftSeedDocs().filter((l) => !have.has(l.name.toLowerCase().trim()));
    if (!fresh.length) return { added: 0, skipped: liftSeedDocs().length };
    const batch = writeBatch(db);
    fresh.forEach((l) => batch.set(doc(collection(db, "customExercises")), { ...l, createdAt: serverTimestamp() }));
    await batch.commit();
    return { added: fresh.length, skipped: liftSeedDocs().length - fresh.length };
  };

  const recipeDocs = useCollection(noData ? null : ("recipes"), orderBy("createdAt", "desc"));
  const recipes = recipeDocs; // already shaped {id, name, cat, cal, p, c, f, prep, createdAt}
  const addRecipe = (data) =>
    addDoc(collection(db, "recipes"), { ...data, createdAt: serverTimestamp() });
  const updateRecipe = (id, data) => updateDoc(doc(db, "recipes", id), data);
  const deleteRecipe = (id) => deleteDoc(doc(db, "recipes", id));
  const importRecipes = async (rows) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "recipes")), { ...r, createdAt: serverTimestamp() }));
    await batch.commit();
  };

  const categoryDocs = useCollection(noData ? null : ("categories"), orderBy("name"));
  const categories = useMemo(() => categoryDocs.map((c) => c.name).filter(Boolean), [categoryDocs]);
  const addCategory = (name) =>
    addDoc(collection(db, "categories"), { name: name.trim() });
  // One-tap starter recipes — 20 whole-food recipes per meal category, filed by
  // food-type sub-category. De-dupes by name+category so it's safe to re-run and
  // never overwrites recipes you've already added.
  const seedRecipes = async () => {
    const key = (r) => `${(r.name || "").toLowerCase().trim()}|${(r.cat || "").toLowerCase().trim()}`;
    const have = new Set(recipes.map(key));
    const all = recipeSeedDocs();
    const fresh = all.filter((r) => !have.has(key(r)));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((r) => batch.set(doc(collection(db, "recipes")), { ...r, createdAt: serverTimestamp() }));
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  };

  // Wellness — guide §4 + §8 (one doc per player per day, ID = `${uid}_${date}`).
  // The three numbers share ONE direction: 1 = worst, 5 = ready to go
  // (Energy 1 = wiped out, Soreness 1 = very sore, Tiredness 1 = exhausted).
  // A readiness verdict (Ready / Modified / Rest) is stored on the doc at
  // submit time and normalized on read, so older docs still render.
  // "Today" on the team clock (America/Phoenix) — see lib/dates.js.
  const today = teamDateKey();
  // Coach-only: the whole team's check-ins (players' read rule only allows
  // their own doc, so players don't open this query at all).
  const wellnessRaw = useCollection(noData || !isCoach ? null : ("wellnessCheckins"), where("teamId", "==", activeTeamId), where("date", "==", today));
  const wellness = useMemo(
    () => wellnessRaw.map((w) => normalizeWellness({ ...w, time: formatAgo(w.updatedAt) })),
    [wellnessRaw],
  );
  const submitWellness = ({ energy, soreness, tiredness }) => {
    const verdict = readinessFor({ energy, soreness, tiredness });
    return setDoc(doc(db, "wellnessCheckins", `${user.uid}_${today}`), {
      teamId: activeTeamId,
      uid: user.uid,
      name: user.name,
      initials: user.initials,
      energy, soreness, tiredness, verdict,
      date: today,
      updatedAt: serverTimestamp(),
    });
  };

  // Food log — private subcollection per player (guide §4 + §5)
  const logsPath = user ? `logs/${user.uid}/entries` : null;
  // Most recent 400 entries — enough for today's totals, recents and a
  // year-long streak without downloading the whole history every launch.
  const logged = useCollection(noData ? null : (logsPath), orderBy("createdAt", "desc"), limit(400));
  const addLog = async (data) => {
    const ref = await addDoc(collection(db, logsPath), { ...data, createdAt: serverTimestamp() });
    // Bump the activity marker so coach compliance view sees this player today.
    setDoc(doc(db, "mealLogActivity", `${user.uid}_${today}`), {
      teamId: activeTeamId,
      uid: user.uid,
      date: today,
      lastLoggedAt: serverTimestamp(),
    }, { merge: true }).catch(reportError("Couldn't update today's meal check-in"));
    return ref;
  };
  const updateLog = (id, data) =>
    updateDoc(doc(db, logsPath, id), data);
  const deleteLog = (id) => deleteDoc(doc(db, logsPath, id));

  // Saved / favorite foods — private per player, for one-tap re-logging.
  const savedFoodsPath = user ? `logs/${user.uid}/savedFoods` : null;
  const savedFoods = useCollection(noData ? null : (savedFoodsPath), orderBy("createdAt", "desc"));
  const addSavedFood = (data) =>
    addDoc(collection(db, savedFoodsPath), { ...data, createdAt: serverTimestamp() });
  const deleteSavedFood = (id) => deleteDoc(doc(db, savedFoodsPath, id));

  // Water tracking — one doc per player per day.
  const waterDocId = user ? `${user.uid}_${today}` : null;
  const waterToday = useCollection(
    noData ? null : (user ? "water" : null),
    where("uid", "==", user?.uid || "_"),
    where("date", "==", today),
  );
  const waterCups = waterToday[0]?.cups || 0;
  const setWaterCups = (cups) =>
    setDoc(doc(db, "water", waterDocId), {
      uid: user.uid,
      date: today,
      cups: Math.max(0, cups),
      updatedAt: serverTimestamp(),
    }, { merge: true });

  // The player's OWN daily nutrition goal (calories + protein, optional).
  // No coach sets it — the player sets it for themselves if they want to,
  // and it lives in their private food-log area (logs/{uid}/goals/main).
  // The Today page and the nutrition hero only ever show the player their
  // own goal. (Path must be a valid Firestore document: an even number of
  // segments. logs/{uid}/goal has 3 and crashes the app on sign-in.)
  const myNutritionGoal = useDoc(noData ? null : (user ? `logs/${user.uid}/goals/main` : null));
  const saveMyNutritionGoal = ({ cal, protein }) =>
    setDoc(doc(db, "logs", user.uid, "goals", "main"), {
      cal: Number(cal) || 0,
      protein: Number(protein) || 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  const clearMyNutritionGoal = () => deleteDoc(doc(db, "logs", user.uid, "goals", "main"));
  const myNutritionTotals = useMemo(() => {
    const k = formatDayKey(new Date());
    return logged.filter((l) => formatDayKey(l.createdAt) === k)
      .reduce((a, l) => ({
        cal: a.cal + (Number(l.cal) || 0),
        protein: a.protein + (Number(l.p) || 0),
        c: a.c + (Number(l.c) || 0),
        f: a.f + (Number(l.f) || 0),
      }), { cal: 0, protein: 0, c: 0, f: 0 });
  }, [logged]);

  // Coach-only compliance view — players' read rule would deny these.
  const mealLogActivityToday = useCollection(
    noData ? null : (isCoach ? "mealLogActivity" : null),
    where("teamId", "==", activeTeamId),
    where("date", "==", today),
  );

  // Player "Today" completion signals — scoped to the current user so the
  // queries satisfy the per-owner read rules.
  const myWellnessDocs = useCollection(
    noData ? null : (user ? "wellnessCheckins" : null),
    where("uid", "==", user?.uid || "_"),
    where("date", "==", today),
  );
  // The player's own wellness doc for today (normalized to the new schema).
  // The per-user query finds it even if it was logged under another team,
  // since the doc id is `${uid}_${date}` (one wellness doc per player per day).
  const myWellnessToday = myWellnessDocs[0]
    ? normalizeWellness(myWellnessDocs[0])
    : (wellness.find((w) => w.uid === user?.uid) || null);
  const wellnessLoggedToday = !!myWellnessToday;
  const loggedToday = useMemo(
    () => logged.some((l) => formatDayKey(l.createdAt) === formatDayKey(new Date())),
    [logged],
  );

  // Team documents + e-sign — coach uploads, everyone signs (signatures array).
  const documents = useCollection(noData ? null : ("documents"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addDocument = async ({ title, file }) => {
    if (!file) throw new Error("No file selected.");
    const path = `documents/${activeTeamId}/${user.uid}/${Date.now()}-${file.name}`;
    const r = storageRef(storage, path);
    // Fingerprint of the exact file: every signature records it, and the
    // rules lock url/path/sha256 so a signed document can't be swapped.
    const sha256 = await sha256Hex(file);
    const snap = await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(snap.ref);
    return addDoc(collection(db, "documents"), {
      teamId: activeTeamId,
      title: (title || "").trim() || file.name,
      url, path, sha256, name: file.name || "", fileType: file.type || "",
      createdByName: user.name, createdAt: serverTimestamp(),
    });
  };
  const deleteDocument = (id) => deleteDoc(doc(db, "documents", id));
  // E-signature: one immutable record per signer (rules check every field).
  const signDocument = (d, { typedName, drawing, consentText }) =>
    setDoc(doc(db, "documents", d.id, "signatures", user.uid), {
      uid: user.uid,
      typedName,
      email: (auth.currentUser?.email || user.email || "").toLowerCase(),
      signedAt: serverTimestamp(),
      sha256: d.sha256 || "",
      consentVersion: SIGN_CONSENT_VERSION,
      consentText,
      drawing,
      documentTitle: (d.title || "").slice(0, 300),
      userAgent: (navigator.userAgent || "").slice(0, 500),
    });



  // Roster (invite gate) — admin manages, useAuth reads on first signup.
  // Two ways in, both team-specific:
  //  - Email invites (below): the coach adds an email to invitedEmails for
  //    one team; useAuth reads it at first sign-in.
  //  - Invite LINKS (decision 2026-11-08): a coach generates a link for ONE
  //    team and shares it; a player signing up via that link lands on that
  //    team (useAuth redeems ?invite=CODE at first sign-in). The doc id IS
  //    the code (a random token = the capability); shape documented in
  //    src/data/teams.js, rules in firestore.rules.
  // Coach-only: the roster's emails are not visible to players (rules).
  // An invite keeps the role it was sent with, but the account's role is the
  // truth (e.g. someone invited as a player and later made program admin).
  // Use the account's role when it is staff, so staff never show as players.
  const invites = useMemo(() => {
    const staffByEmail = new Map((allUsers || []).filter((u) => u.email && isStaffRole(u.role)).map((u) => [u.email.toLowerCase(), u.role]));
    if (user && isStaffRole(user.role) && user.email) staffByEmail.set(user.email.toLowerCase(), user.role);
    if (!staffByEmail.size) return invitesRaw;
    const out = invitesRaw.map((inv) => {
      const r = staffByEmail.get((inv.email || inv.id || "").toLowerCase());
      return r && inv.role !== r ? { ...inv, role: r } : inv;
    });
    return Object.assign(out, invitesRaw.loading ? { loading: true } : {});
  }, [invitesRaw, allUsers, user]);
  const addInvite = (email, teamId) => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return Promise.reject(new Error("Invalid email."));
    // The invite carries the team so a new player lands on the right team
    // (useAuth reads it at first sign-in). The coach picks the team in the
    // roster UI; default to the team currently being viewed.
    const tid = isValidTeamId(teamId) ? teamId : activeTeamId;
    return setDoc(doc(db, "invitedEmails", e), {
      email: e,
      role: "player",
      teamId: tid,
      addedBy: user.name,
      addedAt: serverTimestamp(),
    });
  };
  const removeInvite = (email) => deleteDoc(doc(db, "invitedEmails", email));
  const addInvitesBatch = async (emails, teamId) => {
    const tid = isValidTeamId(teamId) ? teamId : activeTeamId;
    const batch = writeBatch(db);
    emails.forEach((e) => {
      batch.set(doc(db, "invitedEmails", e), {
        email: e,
        role: "player",
        teamId: tid,
        addedBy: user.name,
        addedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  };
  // Random invite-link code (16 chars, no look-alikes: no 0/O/1/l).
  const makeInviteCode = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const rand = new Uint32Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(rand);
    else for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 4294967296);
    return Array.from(rand, (n) => chars[n % chars.length]).join("");
  };
  // Mint a team-specific invite link. expiresAt is a Date (or null = never);
  // maxUses is a number (or null = unlimited).
  const addInviteLink = async (teamId, { expiresAt = null, maxUses = null } = {}) => {
    if (!isValidTeamId(teamId)) throw new Error("Pick a team for the link.");
    const code = makeInviteCode();
    await setDoc(doc(db, "inviteLinks", code), {
      teamId,
      createdByUid: user.uid,
      createdByName: user.name,
      code,
      createdAt: serverTimestamp(),
      expiresAt: expiresAt || null,
      maxUses: maxUses || null,
      uses: 0,
    });
    return code;
  };
  const removeInviteLink = (code) => deleteDoc(doc(db, "inviteLinks", code));
  // Invite links for the team being viewed. Single-field query (no composite
  // index needed); sorted client-side in the roster UI. Players can't list
  // them (rules) — the hook swallows that permission error.
  const inviteLinks = useCollection(noData || !isCoach ? null : ("inviteLinks"), where("teamId", "==", activeTeamId));
  // Toggle a roster entry between player and admin. Updates the invite doc
  // (controls role for future first-sign-ins) AND any existing users doc with
  // that email (changes role for already-signed-up players immediately).
  // ORG-ADMIN-ONLY (decision 2026-11-08): a team coach can invite and manage
  // their roster, but only the program admin promotes/demotes anyone. The
  // rules enforce this server-side too (users + invitedEmails); this guard
  // gives a clear error instead of a silent rules denial.
  const setInviteRole = async (email, nextRole) => {
    if (user.role !== "orgAdmin") {
      throw new Error("Only the program admin can change roles.");
    }
    if (email === user.email && nextRole !== "admin") {
      throw new Error("You can't demote yourself.");
    }
    await updateDoc(doc(db, "invitedEmails", email), { role: nextRole });
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { role: nextRole })));
  };

  // Change a signed-in user's role + team assignment. ORG-ADMIN-ONLY (§10
  // admin model, decision 2026-11-08): only the program admin promotes /
  // demotes anyone — Player ↔ Team Coach ↔ Org Admin — and assigns which
  // team(s) a coach coaches. A team coach can invite and manage their roster
  // but can never promote anyone. The users-doc rules enforce this
  // server-side too (only orgAdmin may write role/teamIds); this guard gives
  // a clear error instead of a silent rules denial.
  const setUserRoleAndTeams = async (uid, email, { role, teamIds, primaryTeamId }) => {
    if (user.role !== "orgAdmin") {
      throw new Error("Only the program admin can change roles.");
    }
    if (uid === user.uid) {
      throw new Error("You can't change your own role.");
    }
    const validTeams = (teamIds || []).filter(isValidTeamId);
    if (role !== "orgAdmin" && !validTeams.length) {
      throw new Error("Pick at least one team.");
    }
    const finalRole = role === "orgAdmin" ? "orgAdmin" : role === "admin" ? "admin" : "player";
    // Org admins see all three teams; everyone else gets exactly the teams
    // the admin picked. Primary is the first picked team (or the existing
    // primary if it's still one of them).
    const finalTeams = finalRole === "orgAdmin" ? [...TEAM_IDS] : validTeams;
    const finalPrimary = finalTeams.includes(primaryTeamId) ? primaryTeamId : (finalTeams[0] || null);
    await updateDoc(doc(db, "users", uid), { role: finalRole, teamIds: finalTeams, primaryTeamId: finalPrimary });
    // Keep the invite record in sync so a future re-sign-in doesn't revert
    // the role. Best-effort: invite-link sign-ups have no invitedEmails doc.
    if (email) {
      try { await setDoc(doc(db, "invitedEmails", email), { role: finalRole }, { merge: true }); } catch { /* users doc is authoritative */ }
    }
  };

  // Workouts — personal (private subcollection) + team-published
  const myWorkoutsPath = user ? `users/${user.uid}/workouts` : null;
  const myWorkouts = useCollection(noData ? null : (myWorkoutsPath), orderBy("updatedAt", "desc"));
  const addMyWorkout = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, myWorkoutsPath), {
      exercises: [],
      ...base,
      name: (base.name || "").trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };
  const updateMyWorkout = (id, data) =>
    updateDoc(doc(db, myWorkoutsPath, id), { ...data, updatedAt: serverTimestamp() });
  const deleteMyWorkout = (id) => deleteDoc(doc(db, myWorkoutsPath, id));

  const teamWorkouts = useCollection(noData ? null : ("teamWorkouts"), where("teamId", "==", activeTeamId), orderBy("updatedAt", "desc"));
  const addTeamWorkout = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "teamWorkouts"), {
      exercises: [],
      ...base,
      teamId: activeTeamId,
      name: (base.name || "").trim(),
      createdByUid: user.uid,
      createdByName: user.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };
  const updateTeamWorkout = (id, data) =>
    updateDoc(doc(db, "teamWorkouts", id), { ...data, updatedAt: serverTimestamp() });
  const deleteTeamWorkout = (id) => deleteDoc(doc(db, "teamWorkouts", id));
  // One-tap starter sessions — batch-writes the curated team workouts, grouped by
  // focus area. De-dupes by name so it's additive and safe to re-run.
  const seedTeamWorkouts = async () => {
    const have = new Set(teamWorkouts.map((w) => (w.name || "").toLowerCase().trim()));
    const all = workoutSeedDocs();
    const fresh = all.filter((w) => !have.has(w.name.toLowerCase().trim()));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((w) => batch.set(doc(collection(db, "teamWorkouts")), {
        ...w, teamId: activeTeamId, createdByUid: user.uid, createdByName: user.name || "Starter",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }));
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  };

  // Chat — pinned status lives on each message doc (guide §4)
  // Most recent `msgLimit` messages of the team (all channels); "Load older"
  // in the chat raises the window. Keeps launches fast as history grows.
  const MSG_PAGE = 300;
  const [msgLimit, setMsgLimit] = useState(MSG_PAGE);
  const messages = useAudienceCollection(noData ? null : ("messages"), user, "createdAt", activeTeamId, msgLimit);
  const loadOlderMessages = () => setMsgLimit((n) => n + MSG_PAGE);
  const hasOlderMessages = messages.length >= msgLimit;
  const addMessage = (text, { attachment, pinned, replyTo, poll, channel } = {}) => {
    // A message inherits the audience of its channel so hidden channels stay
    // private server-side; the Team channel is visible to everyone.
    const ch = channel && channel !== "team" ? chatGroups.find((c) => c.id === channel) : null;
    const data = {
      senderUid: user.uid,
      sender: user.name,
      initials: user.initials,
      text: (text || "").trim(),
      pinned: !!pinned,
      channel: channel || "team",
      // A message belongs to its channel's team (the "team" channel is the
      // active team's main channel). Rules + queries scope by this field.
      teamId: ch?.teamId || activeTeamId,
      audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"],
      isCoach: user.role === "admin" || user.role === "orgAdmin",
      readBy: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    };
    if (attachment) data.attachment = attachment;
    if (replyTo) {
      data.replyToId = replyTo.id;
      data.replyToSender = replyTo.sender;
      const preview = replyTo.kind === "poll"
        ? `📊 ${replyTo.question}`
        : (replyTo.text || "");
      data.replyToText = preview.slice(0, 140);
    }
    if (poll) {
      data.kind = "poll";
      data.question = poll.question;
      data.options = poll.options;
      // Totals only on the message; each vote is a private doc.
      data.voteCounts = poll.options.map(() => 0);
      data.voteTotal = 0;
    }
    return addDoc(collection(db, "messages"), data);
  };
  // Post a rendered line-up card (image blob) into a chat channel — "team" or
  // any chatGroup id. Reuses the chat image pipeline so it lands in the feed
  // exactly like a shared photo.
  const postLineupImage = async (blob, channel, name) => {
    const ch = channel || "team";
    const chDoc = ch !== "team" ? chatGroups.find((c) => c.id === ch) : null;
    const path = `chat/${chDoc?.teamId || activeTeamId}/${ch}/${user.uid}/${uploadStamp()}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    await addMessage(name ? `Starting XI · ${name}` : "Starting XI", {
      attachment: { type: "image", url, path, name: `${(name || "lineup").replace(/[^\w\s-]/g, "").trim() || "lineup"}.jpg` },
      channel: ch,
    });
  };
  // Game Stats → "Send report to team": the report card image + summary text
  // as a team-chat message (onMessageCreated pushes it to everyone).
  const postGameReport = async (blob, text, filename) => {
    const path = `chat/${activeTeamId}/team/${user.uid}/${uploadStamp()}.jpg`;
    const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    await addMessage(text, { attachment: { type: "image", url, path, name: filename || "game-report.jpg" }, channel: "team" });
  };
  const togglePinMessage = (id, pinned) =>
    updateDoc(doc(db, "messages", id), { pinned: !pinned });
  const deleteMessage = (id) => deleteDoc(doc(db, "messages", id));
  const markMessagesRead = async (ids) => {
    if (!ids?.length) return;
    // Chunked: a single batch over 500 writes always fails.
    await commitInChunks(ids, (b, id) => b.update(doc(db, "messages", id), {
      [`readBy.${user.uid}`]: serverTimestamp(),
    }));
  };
  // Poll votes are private (messages/{id}/votes/{uid}): players see totals
  // only, kept on the poll by the onPollVoteWritten function; the coach can
  // see who voted for what.
  const voteOnPoll = (messageId, optionIndex) =>
    setDoc(doc(db, "messages", messageId, "votes", user.uid), {
      uid: user.uid,
      option: optionIndex,
      updatedAt: serverTimestamp(),
    });
  // React to a message (👍/👎/❤️). Passing a falsy reaction clears it (toggle).
  const reactToMessage = (messageId, reaction) =>
    updateDoc(doc(db, "messages", messageId), {
      [`reactions.${user.uid}`]: reaction || deleteField(),
    });

  // Chat channels ("group chats") — admin creates, sets who can see each one.
  // Empty visibleTo = everyone. `audienceKeys` enforces this server-side.
  const chatGroups = useAudienceCollection(noData ? null : ("chatGroups"), user, "createdAt", activeTeamId);
  const addChatGroup = (name, visibleTo) =>
    addDoc(collection(db, "chatGroups"), {
      teamId: activeTeamId,
      name: name.trim(),
      visibleTo: visibleTo || { groupIds: [], uids: [] },
      audienceKeys: audienceKeysFor(visibleTo, groupsList),
      createdByName: user.name,
      createdAt: serverTimestamp(),
    });
  const deleteChatGroup = (id) => deleteDoc(doc(db, "chatGroups", id));
  // Edit who can see an existing group chat. Messages inherit their channel's
  // audience at post time, so changing the channel means re-stamping every
  // message already in it: added members gain the history, removed members
  // lose it. Both sides are enforced by rules, not just hidden in the UI.
  // The channel is written last — if the re-stamp fails partway, the channel
  // still lists its old members and a retry re-runs the whole sweep, rather
  // than leaving a private channel whose backlog is still world-readable.
  const updateChatGroup = async (id, visibleTo) => {
    const audienceKeys = audienceKeysFor(visibleTo, groupsList);
    const ch = chatGroups.find((c) => c.id === id);
    await restampChannel(id, audienceKeys, ch?.teamId || activeTeamId);
    await updateDoc(doc(db, "chatGroups", id), { visibleTo, audienceKeys });
  };

  // Scheduled reminders + polls — coach queues them; a Cloud Function fires
  // each at its sendAt time (see functions/index.js runScheduled).
  const scheduled = useCollection(noData ? null : (isCoach ? "scheduled" : null), where("teamId", "==", activeTeamId), orderBy("sendAt"));
  const addScheduled = (data) =>
    addDoc(collection(db, "scheduled"), {
      ...data,
      teamId: activeTeamId,
      sent: false,
      createdByUid: user.uid,
      createdByName: user.name,
      createdByInitials: user.initials,
      createdAt: serverTimestamp(),
    });
  const deleteScheduled = (id) => deleteDoc(doc(db, "scheduled", id));
  const pinChatGroup = (id, pinned) => updateDoc(doc(db, "chatGroups", id), { pinned: !!pinned });

  // Custom push notifications. The coach sends one now or schedules it, and
  // both paths store a doc in `pushNotifications` for the `runScheduled`
  // runner, which also handles the daily wellness auto-nudge. Team-scoped,
  // same audience pattern as announcements.
  const pushNotifications = useCollection(noData ? null : (isCoach ? "pushNotifications" : null), where("teamId", "==", activeTeamId), orderBy("sendAt", "desc"));
  const addPushNotification = (data) =>
    addDoc(collection(db, "pushNotifications"), {
      ...data,
      teamId: activeTeamId,
      status: "scheduled",
      createdByUid: user.uid,
      createdByName: user.name,
      createdAt: serverTimestamp(),
    });
  const deletePushNotification = (id) => deleteDoc(doc(db, "pushNotifications", id));
  // "Send now" queues a pushNotifications doc with sendAt = now; the
  // onPushNotificationCreated Cloud Function sends it the moment it's
  // written (the 1-minute sweep is only a safety net).
  const sendPushNotificationNow = async ({ title, body, audienceKeys, visibleTo }) => {
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
    await addPushNotification({ title, body, audienceKeys, visibleTo, sendAt: serverTimestamp(), recurrence: { type: "none", time: "", days: [] }, tz });
  };

  // One-time, idempotent backfill: stamp `audienceKeys` onto any event/channel/
  // message created before server-side visibility existed. Without it the
  // players' array-contains-any query would skip field-less legacy docs and
  // they'd vanish. Runs only for the coach (who can write all three), once per
  // session, and self-terminates once nothing is missing. Legacy events/channels
  // resolve from their saved visibleTo; messages inherit their channel's keys
  // (Team / unknown channel → everyone), matching today's all-readable behaviour.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (!isCoach || backfilledRef.current) return;
    const updates = [];
    eventsRaw.forEach((e) => {
      if (e.audienceKeys === undefined) updates.push({ ref: doc(db, "events", e.id), data: { audienceKeys: audienceKeysFor(e.visibleTo, groupsList) } });
    });
    chatGroups.forEach((c) => {
      if (c.audienceKeys === undefined) updates.push({ ref: doc(db, "chatGroups", c.id), data: { audienceKeys: audienceKeysFor(c.visibleTo, groupsList) } });
    });
    messages.forEach((m) => {
      if (m.audienceKeys === undefined) {
        const ch = m.channel && m.channel !== "team" ? chatGroups.find((c) => c.id === m.channel) : null;
        updates.push({ ref: doc(db, "messages", m.id), data: { audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"] } });
      }
    });
    if (updates.length === 0) return;
    backfilledRef.current = true;
    (async () => {
      try {
        for (let i = 0; i < updates.length; i += 400) {
          const batch = writeBatch(db);
          updates.slice(i, i + 400).forEach((u) => batch.update(u.ref, u.data));
          await batch.commit();
        }
      } catch {
        backfilledRef.current = false; // let it retry on the next render
      }
    })();
  }, [isCoach, eventsRaw, chatGroups, messages, groupsList]);

  // Direct messages with the team's coach. Players read only their own
  // thread; a team coach reads all threads on their team. The org admin
  // does not subscribe at all — DMs are between a player and their own
  // team's coach only (decision 2026-11-08). (No orderBy in the query to
  // avoid a composite index.)
  const dms = useCollection(
    noData ? null : (user && user.role !== "orgAdmin" ? "dms" : null),
    where("teamId", "==", activeTeamId),
    ...(isTeamCoach ? [] : [where("threadId", "==", user?.uid || "_")]),
    orderBy("createdAt", "desc"),
    limit(msgLimit),
  );
  const addDM = (text, threadId, { attachment } = {}) => {
    const data = {
      teamId: activeTeamId,
      threadId,
      senderUid: user.uid,
      senderName: user.name,
      isCoach: user.role === "admin",
      text: (text || "").trim(),
      readBy: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    };
    // Photos/videos/files in a DM live on the DM doc itself — never in the
    // channel `messages` collection, where they would be team-visible.
    if (attachment) data.attachment = attachment;
    return addDoc(collection(db, "dms"), data);
  };
  // Mark DM messages read (readBy only — same pattern as channel messages).
  const markDMsRead = async (ids) => {
    if (!ids?.length) return;
    await commitInChunks(ids, (b, id) => b.update(doc(db, "dms", id), {
      [`readBy.${user.uid}`]: serverTimestamp(),
    }));
  };

  // Quote of the Day — latest coach-posted quote; posting one fans out a push.
  const quotes = useCollection(noData ? null : ("quotes"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const todayQuote = quotes[0] || null;
  const addQuote = ({ text, author }) =>
    addDoc(collection(db, "quotes"), { teamId: activeTeamId, text, author: author || "", createdByName: user.name, createdAt: serverTimestamp() });

  // Total unread chat messages for this user → number badge on the Chat tab.
  // Mirrors the inbox: channel messages not sent by me and not yet in readBy,
  // plus DM messages not sent by me and not yet in readBy.
  const chatUnread = useMemo(
    () => messages.filter((m) => m.senderUid !== user?.uid && !m.readBy?.[user?.uid]).length
      + dms.filter((d) => d.senderUid !== user?.uid && !d.readBy?.[user?.uid]).length,
    [messages, dms, user],
  );

  // App icon badge = unread chat messages, like WhatsApp.
  useEffect(() => { if (user) syncAppBadge(chatUnread); }, [user, chatUnread]);
  const [checkin, setCheckin] = useState({ energy: 0, soreness: 0, tiredness: 0 });

  // The branded loading screen lives in index.html (it shows before any app
  // code loads). Keep it up while auth/profile loads, then fade it out.
  useEffect(() => { if (!loading) window.__hideSplash?.(); }, [loading]);
  if (loading) {
    return <div className="min-h-screen" style={{ backgroundColor: COLORS.primary }} />;
  }
  if (!user) return <LoginScreen externalError={authError} clearExternalError={clearError} emailLinkPending={emailLinkPending} onCompleteEmailLink={completeEmailLink} />;
  // Locked door: drill-library-only accounts (role drillBuilder, or any role
  // outside the three team roles) see the no-access screen instead of the
  // app shell — no team views render, and every subscription above was
  // skipped (lockedOut ? null), so no team data is fetched behind it.
  if (lockedOut) return <NoAccessScreen user={user} />;

  // Force a real first+last name before using the app (auto name = email prefix).
  const emailPrefix = (user.email || "").split("@")[0];
  const needsProfile = !user.name || user.name.trim() === emailPrefix || !user.name.trim().includes(" ");
  // The live profile (useAuth) picks up the saved name — no reload needed.
  if (needsProfile) return <NameGate user={user} />;

  // "View as player" preview — a real coach can drop their effective role to
  // player to see exactly what the team sees. Identity (uid/name) stays real.
  const realIsAdmin = user.role === "admin" || user.role === "orgAdmin";
  // An org admin gets the full coach UI (same tabs/buttons as a coach); the
  // team switcher above is what scopes them to one team at a time.
  const effUser = previewAsPlayer && realIsAdmin
    ? { ...user, role: "player" }
    : user.role === "orgAdmin"
      ? { ...user, role: "admin" }
      : user;

  // Both roles get a slim 5-tab nav. Workouts/Nutrition/Videos live under a
  // single "Train" hub so coaches aren't juggling three training-content tabs
  // (they keep every create/manage ability inside each Train sub-page).
  const coachTabs = [
    { id: "home", label: "Home", icon: Home, title: "Home" },
    { id: "practice", label: "Coach", icon: ClipboardList, title: "Coach Center" },
    { id: "calendar", label: "Schedule", icon: CalendarIcon, title: "Schedule" },
    { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
    { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
  ];
  const playerTabs = [
    { id: "home", label: "Today", icon: Home, title: "Today" },
    { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
    { id: "calendar", label: "Schedule", icon: CalendarIcon, title: "Schedule" },
    { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
  ];
  const tabs = effUser.role === "admin" ? coachTabs : playerTabs;
  // Fall back to the first tab if the active one isn't available to this role
  // (e.g. a coach previewing as a player while on the Practice tab).
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "home";
  const title = (tabs.find((t) => t.id === activeTab) || tabs[0]).title;


  return (
    <div
      className="app-shell min-h-screen min-h-dvh flex justify-center relative"
      style={{
        backgroundImage: "url('/brand/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundColor: COLORS.primary,
      }}
    >
      <Toaster />
      {inAppBanner && (
        <button
          key={inAppBanner.id}
          onClick={() => { if (inAppBanner.tab) routeToTab(inAppBanner.tab); setInAppBanner(null); }}
          className="fixed left-3 right-3 z-[9000] flex items-start gap-3 text-left rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-slate-200 px-3.5 py-3 sm:max-w-sm sm:left-auto"
          style={{ top: "calc(10px + env(safe-area-inset-top))", animation: "banner-in .35s cubic-bezier(.2,.9,.3,1.2)" }}
          role="status"
          aria-live="polite"
        >
          <img src="/brand/favicon.png" alt="" className="w-9 h-9 rounded-xl flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-slate-900 truncate">{inAppBanner.title}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">now</span>
            </span>
            {inAppBanner.body && <span className="block text-[13px] text-slate-600 leading-snug line-clamp-2">{inAppBanner.body}</span>}
          </span>
        </button>
      )}
      {/* Navy tint so the photo reads as ambient brand wallpaper, not busy. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `${COLORS.primary}D9` }}
      />
      {/* Fixed-inset app shell: a definite viewport height (top/bottom 0) that
          iOS lays out reliably — a flex column with an internal-scroll <main>
          and an in-flow bottom nav that can't scroll away. Centered without a
          transform so full-screen `fixed inset-0` modals still cover the page.
          Responsive: phone keeps the 28rem column; iPad (md) widens to 42rem;
          laptop (lg) goes full-width with a left sidebar nav instead of the
          bottom tabs. */}
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-none shadow-2xl flex flex-col lg:flex-row z-10" style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, margin: "0 auto", backgroundColor: COLORS.bg }}>
        {/* Desktop sidebar — laptop and wider only. Phone and iPad keep the
            bottom tabs. Carries the brand, the team switcher (multi-team
            users only) and the nav, so the content column can go wide. */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 z-20">
          <div className="px-5 pt-6 pb-4 flex items-center gap-3 border-b border-slate-100">
            <img src="/brand/logo.png" alt="" className="w-11 h-11 object-contain" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 leading-none">BROPHY</div>
              <div className="text-lg font-bold text-slate-900 leading-tight">Brophy Soccer</div>
              <div className="text-[11px] font-semibold truncate" style={{ color: COLORS.primary }}>{getTeam(activeTeamId).name}</div>
            </div>
          </div>
          {canSeeMultipleTeams && (
            <div className="px-4 pt-4 flex flex-col gap-1.5">
              {visibleTeams.map((t) => {
                const active = t.id === activeTeamId;
                return (
                  <button key={t.id} onClick={() => setPreferredTeamId(t.id)} className="text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: active ? COLORS.primary : COLORS.bg, color: active ? "#fff" : COLORS.textSecondary }}>
                    {t.shortName}
                  </button>
                );
              })}
            </div>
          )}
          <nav className="flex-1 px-3 pt-4 flex flex-col gap-1 overflow-y-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              const badge = t.id === "messages" ? chatUnread : 0;
              return (
                <button key={t.id} onClick={() => { setTrainView(null); setTab(t.id); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{ backgroundColor: active ? COLORS.accentSoft : "transparent", color: active ? COLORS.accent : COLORS.textSecondary }}>
                  <span className="relative">
                    <Icon className="w-5 h-5" style={{ color: active ? COLORS.accent : COLORS.textSecondary }} fill={active ? COLORS.accent : "none"} strokeWidth={active ? 2.5 : 2} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 text-[9px] font-bold text-white rounded-full px-1 min-w-[15px] h-[15px] flex items-center justify-center leading-none border border-white" style={{ backgroundColor: "#DC2626" }}>{badge > 99 ? "99+" : badge}</span>
                    )}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-200">
            <button onClick={() => setSettingsOpen(true)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 text-left">
              <Avatar photoURL={effUser.photoURL} initials={effUser.initials} size={36} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 truncate">{effUser.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{effUser.role === "orgAdmin" ? "Org Admin" : effUser.role === "admin" ? "Coach" : "Player"} · {getTeamShortName(activeTeamId)}</span>
              </span>
            </button>
          </div>
        </aside>
        {/* Content column — the phone/tablet column and the desktop content area. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {updateReady && <UpdateBanner onReload={reload} color={COLORS.primary} />}
        <Header title={title} user={effUser} onAvatarClick={() => setSettingsOpen(true)} onPreview={() => { setPreviewAsPlayer(true); setTab("home"); }} onRefresh={resyncFirestore} refreshing={firestoreSyncing} stale={firestoreStale} />
        {canSeeMultipleTeams && <TeamSwitcher teams={visibleTeams} activeTeamId={activeTeamId} onSelect={setPreferredTeamId} />}
        {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} onSignOut={() => signOutUser(user.uid)} onReplayTour={() => { setSettingsOpen(false); setShowTour(true); }} isOrgAdmin={user.role === "orgAdmin"} orgUsers={orgUsers} setUserRoleAndTeams={setUserRoleAndTeams} />}
        <WelcomeTour key={tourOpen ? "tour-open" : "tour-closed"} open={tourOpen} role={effUser.role} onClose={closeTour} user={user} onUploadPhoto={uploadOwnPhoto} />
        {previewAsPlayer && realIsAdmin && (
          <button onClick={() => setPreviewAsPlayer(false)} className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>
            <Eye className="w-3.5 h-3.5" /> Viewing as a player — tap to exit
          </button>
        )}
        <main className="flex-1 min-h-0 overflow-y-auto pb-4">
          {/* Desktop content cap: the column goes wide on a laptop, but the
              pages stay readable (and the pitch stays usable) at 72rem. */}
          <div className="w-full lg:max-w-6xl lg:mx-auto h-full flex flex-col">
          {activeTab === "home" && effUser.role === "admin" && <HomePage user={effUser} isOrgAdmin={user.role === "orgAdmin"} practices={practices} announcements={announcements} addAnnouncement={addAnnouncement} updateAnnouncement={updateAnnouncement} togglePinAnnouncement={togglePinAnnouncement} deleteAnnouncement={deleteAnnouncement} events={events} wellness={wellness} wellnessLoading={isLoading(wellnessRaw)} invites={invites} addInvite={addInvite} removeInvite={removeInvite} addInvitesBatch={addInvitesBatch} setInviteRole={setInviteRole} inviteLinks={inviteLinks} addInviteLink={addInviteLink} removeInviteLink={removeInviteLink} mealLogActivityToday={mealLogActivityToday} documents={documents} addDocument={addDocument} deleteDocument={deleteDocument} signDocument={signDocument} allUsers={allUsers} requestProfileUpdate={requestProfileUpdate} pushNotifications={pushNotifications} addPushNotification={addPushNotification} deletePushNotification={deletePushNotification} sendPushNotificationNow={sendPushNotificationNow} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} />}
          {activeTab === "home" && effUser.role !== "admin" && <div className="px-5 pt-4 -mb-1"><PushPrompt user={effUser} /></div>}
          {activeTab === "home" && effUser.role !== "admin" && <LatestGameCard user={effUser} activeTeamId={activeTeamId} allUsers={allUsers} positionsByUid={positionsByUid} isStatKeeper={isStatKeeper} statKeepers={statKeepers} lineups={lineups} />}
          {activeTab === "home" && effUser.role !== "admin" && <PlayerTodayPage user={effUser} events={events} announcements={announcements} checkin={checkin} setCheckin={setCheckin} submitWellness={submitWellness} wellnessLoggedToday={wellnessLoggedToday} myWellness={myWellnessToday} loggedToday={loggedToday} waterCups={waterCups} setWaterCups={setWaterCups} documents={documents} signDocument={signDocument} onOpenTrain={(v) => { setTrainView(v); setTab("train"); }} onOpenSchedule={() => setTab("calendar")} practices={practices} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} nutritionTarget={myNutritionGoal} nutritionTotals={myNutritionTotals} profilePrompt={profilePrompt} onOpenProfile={() => setSettingsOpen(true)} onUploadPhoto={uploadOwnPhoto} />}
          {activeTab === "train" && (
            trainView ? (
              <div>
                <div className="px-5 pt-4 pb-1"><button onClick={() => setTrainView(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Train</button></div>
                {trainView === "gym" && <GymPage user={effUser} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} deleteMyWorkout={deleteMyWorkout} teamWorkouts={teamWorkouts} addTeamWorkout={addTeamWorkout} updateTeamWorkout={updateTeamWorkout} deleteTeamWorkout={deleteTeamWorkout} customExercises={customExercises} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} seedTeamWorkouts={seedTeamWorkouts} />}
                {trainView === "nutrition" && <NutritionPage user={effUser} recipes={recipes} addRecipe={addRecipe} updateRecipe={updateRecipe} deleteRecipe={deleteRecipe} importRecipes={importRecipes} seedRecipes={seedRecipes} categories={categories} addCategory={addCategory} logged={logged} addLog={addLog} updateLog={updateLog} deleteLog={deleteLog} waterCups={waterCups} setWaterCups={setWaterCups} myNutritionGoal={myNutritionGoal} myNutritionTotals={myNutritionTotals} saveMyNutritionGoal={saveMyNutritionGoal} clearMyNutritionGoal={clearMyNutritionGoal} savedFoods={savedFoods} addSavedFood={addSavedFood} deleteSavedFood={deleteSavedFood} />}
                {trainView === "library" && <LibraryPage user={effUser} items={libraryItems} activeTeamId={activeTeamId} addItem={addLibraryItem} updateItem={updateLibraryItem} deleteItem={deleteLibraryItem} />}
                {trainView === "videos" && <VideosPage user={effUser} videos={videos} addVideo={addVideo} updateVideo={updateVideo} deleteVideo={deleteVideo} importVideos={importVideos} videoFolders={videoFolderDocs} addVideoFolder={addVideoFolder} renameVideoFolder={renameVideoFolder} deleteVideoFolder={deleteVideoFolder} />}
              </div>
            ) : <TrainHub onPick={setTrainView} />
          )}
          {activeTab === "practice" && effUser.role === "admin" && (
            <CoachCenterPage
              practiceProps={{ user: { ...effUser, isOrgAdmin: user.role === "orgAdmin" }, drills, addDrill, updateDrill, deleteDrill, practices, addPractice, updatePractice, deletePractice, programs, addProgram, updateProgram, deleteProgram, importEvents, events }}
              gameDayProps={{ user: effUser, lineups, addLineup, updateLineup, deleteLineup, allUsers, invites, chatGroups, postLineupImage, lineupLogo: lineupLogo?.url || "", setLineupLogo, teamShortName: getTeamShortName(activeTeamId), activeTeamId, positionsByUid }}
              gameStatsProps={{ user: effUser, activeTeamId, allUsers, lineups, positionsByUid, isCoach, canRecord: isCoach || isStatKeeper, statKeepers, setStatKeepers, onSendReport: postGameReport }}
              rosterProps={{ user: effUser, isOrgAdmin: user.role === "orgAdmin", removeUser, invites, addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks, addInviteLink, removeInviteLink, allUsers, requestProfileUpdate, activeTeamId, positionsByUid, setPlayerPosition }}
              calendarProps={{ user: effUser, events, practices, teamWorkouts, personalEvents, addEvent, updateEvent, addPersonalEvent, updatePersonalEvent, deleteEvent, deletePersonalEvent, importEvents, groups: groupsList, addGroup, updateGroupMembers, deleteGroup, invites, allUsers, chatGroups }}
              documentsProps={{ user: effUser, documents, rosterCount: invites.filter((i) => !isStaffRole(i.role)).length, onUpload: addDocument, onDelete: deleteDocument, onSign: signDocument }}
              announcementsProps={{ announcements, addAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement }}
            />
          )}
          {activeTab === "calendar" && <CalendarPage user={effUser} events={events} practices={practices} teamWorkouts={teamWorkouts} personalEvents={personalEvents} addEvent={addEvent} updateEvent={updateEvent} addPersonalEvent={addPersonalEvent} updatePersonalEvent={updatePersonalEvent} deleteEvent={deleteEvent} deletePersonalEvent={deletePersonalEvent} importEvents={importEvents} groups={groupsList} addGroup={addGroup} updateGroupMembers={updateGroupMembers} deleteGroup={deleteGroup} invites={invites} allUsers={allUsers} chatGroups={chatGroups} />}
          {activeTab === "messages" && <MessagesPage user={effUser} activeTeamId={activeTeamId} hasOlderMessages={hasOlderMessages} onLoadOlder={loadOlderMessages} isOrgAdmin={user.role === "orgAdmin"} allUsers={allUsers} messages={messages} addMessage={addMessage} togglePinMessage={togglePinMessage} deleteMessage={deleteMessage} markMessagesRead={markMessagesRead} voteOnPoll={voteOnPoll} reactToMessage={reactToMessage} rosterCount={invites.length} chatGroups={chatGroups} addChatGroup={addChatGroup} deleteChatGroup={deleteChatGroup} updateChatGroup={updateChatGroup} onPinChannel={pinChatGroup} groups={groupsList} invites={invites} announcements={announcements} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} dms={dms} addDM={addDM} markDMsRead={markDMsRead} scheduled={scheduled} addScheduled={addScheduled} deleteScheduled={deleteScheduled} />}
          </div>
        </main>
        <nav className="lg:hidden flex-shrink-0 w-full bg-white border-t border-slate-200 z-20" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="grid px-1 pt-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((t) => {
              const Icon = t.icon; const active = activeTab === t.id;
              const badge = t.id === "messages" ? chatUnread : 0;
              return (
                <button key={t.id} onClick={() => { setTrainView(null); setTab(t.id); }} className="flex flex-col items-center justify-center py-1.5 gap-0.5">
                  <span className="relative">
                    <Icon className="w-5 h-5" style={{ color: active ? COLORS.accent : COLORS.textSecondary }} fill={active ? COLORS.accent : "none"} strokeWidth={active ? 2.5 : 2} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 text-[9px] font-bold text-white rounded-full px-1 min-w-[15px] h-[15px] flex items-center justify-center leading-none border border-white" style={{ backgroundColor: "#DC2626" }}>{badge > 99 ? "99+" : badge}</span>
                    )}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: active ? COLORS.accent : COLORS.textSecondary }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        </div>
      </div>
    </div>
  );
}
