import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Home, Calendar as CalendarIcon, Video, Apple, MessageCircle,
  Pin, Clock, MapPin, Plus, X, Trash2, Send, Paperclip,
  ShoppingCart, Check, Droplet, Flame, Shield, Lock, Play,
  Link as LinkIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Wind, Activity, Dumbbell, Snowflake, StretchHorizontal, FileText,
  Image as ImageIcon, Mail, ArrowRight, Layers, Reply, BarChart3, ScanLine, Camera,
  Bell, BellOff, Pencil, Copy, Download, Megaphone,
  Users, Tag, Target, Footprints, Repeat, Flag, Zap, ImagePlus, Goal, Hash, Eye,
  ClipboardList, ExternalLink, Star, Shuffle, CornerDownRight, Crosshair, Swords, LayoutGrid, SquareDashed,
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
  orderBy, where, query, getDocs,
  serverTimestamp, writeBatch, arrayUnion, deleteField,
} from "firebase/firestore";
import { auth, db, storage } from "./firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "./hooks/useAuth";
import { useCollection, useAudienceCollection, useDoc } from "./hooks/useCollection";

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
import { searchFoods, hasUsdaKey } from "./lib/usda";
import { loadExercises, exerciseImageUrl } from "./lib/exercises";
import { searchExercises } from "./lib/exerciseSearch";
import { lookupBarcode, searchProducts } from "./lib/openfoodfacts";
import {
  notificationsSupported, currentPermission,
  enablePushNotifications, clearAllPushTokens, onForegroundMessage,
} from "./lib/notifications";
import { toast } from "./lib/toast";
import WelcomeTour from "./WelcomeTour";
import {
  newEntry, formatPrescription, groupBySuperset, SUPERSET_LABELS,
  WORKOUT_TEMPLATES, buildTemplateWorkout,
} from "./lib/lifting";
import { recipeSeedDocs } from "./data/recipeSeed";
import { liftSeedDocs } from "./data/liftSeed";
import { workoutSeedDocs, AREA_ORDER } from "./data/workoutSeed";
import { TEAMS, TEAM_IDS, DEFAULT_TEAM_ID, isValidTeamId, teamDocFields, getTeam, getTeamShortName } from "./data/teams";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { APP_VERSION } from "./data/whatsNew";
import { UpdateBanner, WhatsNewModal } from "./components/UpdateUI";
import TacticsBoard, { BoardSvg } from "./components/TacticsBoard";
import { ARROW_LEGEND, wavyPath } from "./components/boardData";
import QuoteOfDay from "./components/QuoteOfDay";

/* ══════════════════════════════════════════════════════════════════════════
   TeamHubRoles — the whole Phoenix app in one component tree. It's large, so
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

const toEmbedUrl = (url) => {
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
const formatDayKey = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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
// Phoenix College Bears: navy + gold.
// CTAs use `primary` (navy + white text). `accent` is for badges + decorative.
const COLORS = {
  primary: "#002E5D",     // Bears navy (official)
  accent: "#FFC845",      // Bears gold (official — pin icons, badges, the avatar tile)
  accentSoft: "#FFF4D9",  // pale gold backgrounds
  success: "#00B27A",
  bg: "#EEF2FA",          // subtle navy tint so the app doesn't feel generic-white
  border: "#E2E8F0",
  textSecondary: "#64748B",
};
const APP_DOMAIN = "team.phoenixmensoccer.com";
const TOUR_SEEN_KEY = "teamhub_tour_seen_v1";

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
const seedAnnouncements = [
  { id: "a1", title: "Practice Moved to 5:00 PM", body: "Field 3 conflict — meet at Field 1, 5 PM sharp. Bring both jerseys.", ts: "2h ago", pinned: true },
  { id: "a2", title: "Team Photo Day — Friday", body: "Home jersey, white socks, clean cleats. Arrive 15 min early.", ts: "5h ago", pinned: false },
];
const seedEvents = [
  { id: "e1", title: "Team Practice", date: "2026-06-08", start: "15:00", end: "17:30", location: "Field 1", type: "Practice" },
  { id: "e2", title: "Game vs. Central State", date: "2026-06-09", start: "14:00", end: "16:30", location: "Memorial Stadium", type: "Game" },
  { id: "e3", title: "Morning Lift", date: "2026-06-10", start: "06:30", end: "08:00", location: "S&C Center", type: "Strength" },
];
const VIDEO_CATS = ["Film", "Breathing", "Stretching", "Mobility", "Strength", "Cooldown"];
const CAT_ICON = { Film: Video, Breathing: Wind, Stretching: StretchHorizontal, Mobility: Activity, Strength: Dumbbell, Cooldown: Snowflake };

// Drill library categories — Anthony's 15 tactical topics (Phoenix College system).
const DRILL_CATS = ["Playing from back", "Transitions to the middle third", "Possession in the middle third", "Transitions to the final third", "Possession in the final third", "Switching the point of attack", "Crossing", "Finishing", "Passing patterns", "Passing patterns to finish", "Warm up games", "Pressing when losing the ball", "Getting into shapes", "Line of confrontation", "Set pieces"];
const DRILL_CAT_ICON = {
  "Playing from back": Shield, "Transitions to the middle third": ArrowRight, "Possession in the middle third": Repeat,
  "Transitions to the final third": Zap, "Possession in the final third": Target, "Switching the point of attack": Shuffle,
  "Crossing": CornerDownRight, "Finishing": Crosshair, "Passing patterns": Footprints, "Passing patterns to finish": Goal,
  "Warm up games": Flame, "Pressing when losing the ball": Swords, "Getting into shapes": LayoutGrid,
  "Line of confrontation": ScanLine, "Set pieces": Flag,
};
// Session phases — suggested tags on the drill form (how Anthony runs practices).
const DRILL_PHASES = ["Warmup", "Team game", "Small rondo", "Bigger rondo / passing pattern", "Possession game", "Play / structured play", "Finishing pattern", "Passing pattern"];
const seedVideos = [
  { id: "v1", title: "Central State — Scouting Breakdown", cat: "Film", type: "video", dur: "12:10", diff: "Medium", desc: "Saturday's opponent. Watch the back line spacing before film session.", url: "https://youtube.com/..." },
  { id: "v2", title: "4-7-8 Breathing Technique", cat: "Breathing", type: "video", dur: "5 min", diff: "Easy", desc: "Inhale 4, hold 7, exhale 8. Drops your heart rate before lights out.", url: "https://youtube.com/..." },
  { id: "v3", title: "Box Breathing Reset", cat: "Breathing", type: "audio", dur: "8 min", diff: "Easy", desc: "Navy SEAL go-to. Use before games and high-pressure moments.", url: "" },
  { id: "v4", title: "Full-Body Static Stretch", cat: "Stretching", type: "video", dur: "15 min", diff: "Easy", desc: "End-of-day flow. Hold each position 45 seconds.", url: "https://youtube.com/..." },
  { id: "v5", title: "Explosive Hip Mobility", cat: "Mobility", type: "video", dur: "8 min", diff: "Medium", desc: "Dynamic warm-up. Get loose before sprints.", url: "https://youtube.com/..." },
  { id: "v6", title: "Thoracic Spine Series", cat: "Mobility", type: "video", dur: "6 min", diff: "Easy", desc: "Unlock your upper back. Critical for overhead athletes.", url: "https://youtube.com/..." },
  { id: "v7", title: "Posterior Chain Strength", cat: "Strength", type: "video", dur: "20 min", diff: "Hard", desc: "Hamstrings, glutes, lower back. Bodyweight or banded.", url: "https://youtube.com/..." },
  { id: "v8", title: "Cold Plunge Protocol", cat: "Cooldown", type: "external", dur: "11 min", diff: "Hard", desc: "Evidence-based cold exposure framework.", url: "https://youtube.com/..." },
  { id: "v9", title: "Post-Practice Foam Rolling", cat: "Cooldown", type: "video", dur: "10 min", diff: "Easy", desc: "Quads, IT band, calves, glutes. Slow and intentional.", url: "https://youtube.com/..." },
];
const workoutPlans = [
  { id: "wp1", title: "Pre-Game Activation", dur: "20 min" },
  { id: "wp2", title: "Post-Practice Mobility", dur: "15 min" },
  { id: "wp3", title: "Off-Day Recovery Flow", dur: "30 min" },
];
const seedMessages = [
  { id: "m1", sender: "Coach Cameron", initials: "CC", text: "Film session moved to 6 PM in Team Room A.", time: "9:14 AM", isCoach: true },
  { id: "m2", sender: "Maya Patel", initials: "MP", text: "Got it — bringing the clips from Saturday.", time: "9:16 AM" },
  { id: "m3", sender: "Coach Cameron", initials: "CC", text: "Scouting report attached — read before film.", time: "11:48 AM", isCoach: true, attachment: { type: "pdf", name: "Central_State_Scout.pdf" } },
  { id: "m4", sender: "Devin Wallace", initials: "DW", text: "This set play is clean: https://youtube.com/watch?v=abc", time: "12:15 PM" },
  { id: "m5", sender: "Coach Cameron", initials: "CC", text: "Proud of this group.", time: "1:02 PM", isCoach: true, attachment: { type: "image", name: "team_huddle.jpg" } },
];
const seedWellness = [
  { name: "Maya Patel", initials: "MP", energy: 4, soreness: 4, tiredness: 4, time: "8:10 AM" },
  { name: "Alex Chen", initials: "AC", energy: 2, soreness: 2, tiredness: 2, time: "7:52 AM" },
  { name: "Devin Wallace", initials: "DW", energy: 5, soreness: 5, tiredness: 4, time: "9:01 AM" },
  { name: "Sam Okafor", initials: "SO", energy: 3, soreness: 3, tiredness: 3, time: "8:34 AM" },
  { name: "Riley Brooks", initials: "RB", energy: 4, soreness: 4, tiredness: 3, time: "8:20 AM" },
];
const seedMeals = [
  { id: "b1", name: "Overnight Oats & Berries", cat: "Breakfast", cal: 380, p: 18, c: 58, f: 9, prep: "5 min" },
  { id: "b2", name: "Veggie Scramble & Toast", cat: "Breakfast", cal: 420, p: 26, c: 32, f: 22, prep: "10 min" },
  { id: "l1", name: "Grilled Chicken & Quinoa", cat: "Lunch", cal: 580, p: 45, c: 58, f: 14, prep: "20 min" },
  { id: "l2", name: "Turkey Avocado Wrap", cat: "Lunch", cal: 510, p: 38, c: 42, f: 20, prep: "8 min" },
  { id: "d1", name: "Steak & Sweet Potato", cat: "Dinner", cal: 680, p: 50, c: 56, f: 22, prep: "30 min" },
  { id: "s1", name: "Protein Shake", cat: "Snacks", cal: 280, p: 28, c: 28, f: 6, prep: "3 min" },
];
const seedMealCategories = ["Breakfast", "Lunch", "Dinner", "Snacks"];
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

const LoginScreen = ({ externalError, clearExternalError }) => {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // Surface auth-gate errors (e.g. "email not on roster") from useAuth.
  useEffect(() => {
    if (externalError) setErr(externalError);
  }, [externalError]);

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
            <Mail className="w-10 h-10" style={{ color: COLORS.accent }} />
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

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {bgLayer}
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <img
            src="/brand/logo.png"
            alt="Phoenix College Bears"
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
          {err && <p className="text-red-300 text-xs font-medium px-1 leading-snug">{err}</p>}
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

/* ── shared bits ── */
// Circular profile photo, falling back to initials on a colored tile. Used
// everywhere a person is shown (header, settings, line-up tokens).
const Avatar = ({ photoURL, initials = "", size = 36, bg = COLORS.primary, color = "white", className = "" }) =>
  photoURL ? (
    <img src={photoURL} alt="" className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <div className={`rounded-full flex items-center justify-center font-bold leading-none ${className}`} style={{ width: size, height: size, backgroundColor: bg, color, fontSize: Math.round(size * 0.36) }}>{initials}</div>
  );

const Header = ({ title, user, onAvatarClick, onPreview }) => (
  <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <img src="/brand/logo.png" alt="" className="w-9 h-9 object-contain" />
      <div>
        <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 leading-none">PHX BEARS</div>
        <h1 className="text-base font-bold text-slate-900 leading-tight">{title}</h1>
      </div>
    </div>
    <div className="flex items-center gap-2">
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
  <div className="flex gap-1.5 px-5 py-2 bg-white border-b border-slate-200 overflow-x-auto">
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
const DocumentRow = ({ user, d, isAdmin, rosterCount = 0, onDelete, onSign }) => {
  const [whoOpen, setWhoOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState(user.name || "");
  const sigs = d.signatures || [];
  const mine = sigs.some((s) => s.uid === user.uid);
  const submitSign = async () => {
    if (!signName.trim()) return;
    try { await onSign(d.id, signName.trim()); setSignOpen(false); }
    catch (e) { toast("Couldn't sign — " + (e.message || "")); }
  };
  return (
    <li className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 gap-0.5" style={{ backgroundColor: COLORS.accentSoft }}><FileText className="w-3.5 h-3.5" style={{ color: COLORS.accent }} /><span className="text-[7px] font-black leading-none tracking-tight" style={{ color: COLORS.accent }}>{docTypeLabel(d)}</span></div>
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{d.title}</div>
          <div className="text-[10px] text-slate-500">{isAdmin ? `${sigs.length}${rosterCount ? `/${rosterCount}` : ""} signed` : (mine ? "You've signed" : "Tap to read")}</div>
        </a>
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setWhoOpen(!whoOpen)} className="text-[11px] font-semibold" style={{ color: COLORS.primary }}>{whoOpen ? "Hide" : "Who"}</button>
            <button onClick={async () => { if (confirm(`Delete "${d.title}"?`)) { try { await onDelete(d.id); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ) : (
          mine
            ? <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0" style={{ color: COLORS.success }}><Check className="w-3.5 h-3.5" /> Signed</span>
            : <button onClick={() => { setSignOpen(true); setSignName(user.name || ""); }} className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Sign</button>
        )}
      </div>
      {isAdmin && whoOpen && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2">
          {sigs.length === 0 ? <p className="text-[11px] text-slate-400 italic">No signatures yet.</p> : (
            <ul className="space-y-1">{sigs.map((s, i) => (<li key={i} className="text-[11px] text-slate-600 flex items-center gap-1.5"><Check className="w-3 h-3" style={{ color: COLORS.success }} /> {s.name} <span className="text-slate-400">· {new Date(s.ts).toLocaleDateString()}</span></li>))}</ul>
          )}
        </div>
      )}
      {!isAdmin && signOpen && !mine && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
          <p className="text-[11px] text-slate-500">Type your full name to sign. This records your agreement with a timestamp.</p>
          <input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Your full name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2">
            <button onClick={() => setSignOpen(false)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={submitSign} disabled={!signName.trim()} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>Agree &amp; Sign</button>
          </div>
        </div>
      )}
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
      {documents.length === 0 ? (
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
const ChecklistRow = ({ done, icon: Icon, label, sub, onClick, accent }) => (
  <button onClick={onClick} className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center gap-3 text-left">
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: done ? COLORS.success : COLORS.bg, color: done ? "white" : (accent || COLORS.primary) }}>
      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-semibold ${done ? "text-slate-400 line-through" : "text-slate-900"}`}>{label}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
  </button>
);

// The player's home — one hero (today's session) + a short daily checklist with
// completion ticks, a one-line coach note, and documents to sign. Designed to
// answer "what do I do today?" in one screen. The wellness check-in is the
// main daily action here (attendance / practice check-in were removed):
// three quick 1–5 taps (Energy / Soreness / Tiredness, high = ready) and the
// player gets a decisive readiness verdict back.
const PlayerTodayPage = ({ user, events = [], announcements = [], checkin, setCheckin, submitWellness, wellnessLoggedToday, myWellness = null, loggedToday, waterCups = 0, setWaterCups, documents = [], signDocument, onOpenTrain, onOpenSchedule, practices = [], activeTeamId, todayQuote, addQuote, nutritionTarget, nutritionTotals = { cal: 0, protein: 0 }, profilePrompt, onOpenProfile }) => {
  const promptTs = profilePrompt?.requestedAt;
  const [profileDismissed, setProfileDismissed] = useState(() => { try { return localStorage.getItem("profilePromptSeen") === promptTs; } catch { return false; } });
  const showProfilePrompt = promptTs && !profileDismissed;
  const dismissProfile = () => { try { localStorage.setItem("profilePromptSeen", promptTs); } catch { /* ignore */ } setProfileDismissed(true); };
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const todayStr = fmtLocalDate(new Date());
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
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: COLORS.accent }}>{hero.type || "Session"}</span>
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
        {sortedAnnouncements.length === 0 ? (
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
          <ChecklistRow done={waterCups >= WATER_GOAL} icon={Droplet} accent="#0ea5e9" label={`Water · ${waterCups}/${WATER_GOAL} cups`} sub={waterCups >= WATER_GOAL ? "Hydrated!" : "Tap to add a cup"} onClick={() => setWaterCups(Math.min(WATER_GOAL, waterCups + 1))} />
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
const HomePage = ({ user, practices = [], announcements, events, checkin, setCheckin, wellness, submitWellness, invites, mealLogActivityToday = [], groups = [], addGroup, updateGroupMembers, deleteGroup, documents = [], addDocument, deleteDocument, signDocument, allUsers = [], pushNotifications = [], addPushNotification, deletePushNotification, sendPushNotificationNow, activeTeamId, todayQuote, addQuote }) => {
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email, u.name])), [allUsers]);
  const [saved, setSaved] = useState(false);
  const [openPlayer, setOpenPlayer] = useState(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushPerm, setPushPerm] = useState(currentPermission());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState("");
  const enablePush = async () => {
    setPushErr("");
    setPushBusy(true);
    try {
      await enablePushNotifications(user.uid);
      setPushPerm("granted");
    } catch (e) {
      setPushErr(e.message || "Couldn't enable notifications.");
    } finally {
      setPushBusy(false);
    }
  };
  const [showGroups, setShowGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);
  const isAdmin = user.role === "admin";


  const now = new Date();
  const nextEvent = useMemo(() => {
    return [...events]
      .filter((e) => new Date(e.date + "T" + e.start) >= now)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  }, [events]);

  const sorted = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const setMetric = (k, v) => { setCheckin({ ...checkin, [k]: v }); setSaved(false); };
  const submitCheckin = async () => {
    if (!checkin.energy || !checkin.soreness || !checkin.tiredness) return;
    try {
      await submitWellness(checkin);
      setSaved(true);
    } catch (e) {
      toast("Couldn't submit check-in — " + (e.message || "check Firestore rules."));
    }
  };

  const avg = (k) => (wellness.length ? wellness.reduce((s, w) => s + w[k], 0) / wellness.length : 0);
  const bars = (value, color) => (
    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: n <= value ? color : COLORS.border }} />)}</div>
  );
  const METRICS = [["energy", "Energy", COLORS.success], ["soreness", "Soreness", COLORS.accent], ["tiredness", "Tiredness", "#8b5cf6"]];

  const greeting = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      <h2 className="text-2xl font-bold text-slate-900 mt-1">Welcome,<br /><span style={{ color: COLORS.primary }}>{user.name.split(" ")[0]}.</span></h2>
      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{getTeam(activeTeamId).name}</span>
    </div>
  );

  // Today first: today's session (with its practice plan + drill count) —
  // otherwise the next upcoming event. This is the big card at the top.
  const todayStr = fmtLocalDate(new Date());
  const todays = [...events].filter((e) => e.date === todayStr).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const hero = todays[0] || null;
  const heroPlan = hero?.practiceId ? practices.find((pl) => pl.id === hero.practiceId) : null;
  const todaySection = (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Today</h3>
      {hero ? (
        <div className="rounded-3xl p-5 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #003B77)` }}>
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
        <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #003B77)` }}>
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

  const checkinSection = (
    <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-slate-900">How are you feeling today?</h3>
        {saved && <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: COLORS.success }}><Check className="w-3 h-3" /> Sent</span>}
      </div>
      <div className="space-y-3">
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Energy</div><Scale value={checkin.energy} onChange={(v) => setMetric("energy", v)} lowLabel="Wiped out" highLabel="Full tank" /></div>
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Soreness</div><Scale value={checkin.soreness} onChange={(v) => setMetric("soreness", v)} lowLabel="Very sore" highLabel="Feeling great" /></div>
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Tiredness</div><Scale value={checkin.tiredness} onChange={(v) => setMetric("tiredness", v)} lowLabel="Exhausted" highLabel="Fresh" /></div>
      </div>
      <button onClick={submitCheckin} disabled={!checkin.energy || !checkin.soreness || !checkin.tiredness}
        className="w-full mt-3 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>
        Log wellness
      </button>
      <p className="text-[10px] text-slate-400 mt-2 text-center">1 = worst, 5 = ready to go. Your coach sees the team's daily readiness.</p>
    </section>
  );

  // News for the team — read-only here. Coaches post, edit, pin and
  // delete from Coach Tools → Announcements (§9 Option B).
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
        {wellness.length === 0 && <p className="text-sm text-slate-400 italic">No check-ins yet today.</p>}
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

  const notificationsSection = (() => {
    if (!notificationsSupported()) return null;
    if (pushPerm === "granted") return null;
    return (
      <section className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>
          <Bell className="w-4 h-4" style={{ color: COLORS.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-900">Turn on notifications</div>
          <div className="text-[10px] text-slate-500 leading-snug">
            {pushPerm === "denied"
              ? "Blocked. Allow notifications in your browser settings, then refresh."
              : "Get pinged for announcements, chat, and games."}
          </div>
          {pushErr && <div className="text-[10px] text-red-500 font-medium mt-0.5">{pushErr}</div>}
        </div>
        {pushPerm !== "denied" && (
          <button onClick={enablePush} disabled={pushBusy} className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
            {pushBusy ? "…" : "Enable"}
          </button>
        )}
      </section>
    );
  })();

  const groupsSection = (() => {
    if (!isAdmin) return null;
    const createGroup = async () => {
      if (!newGroupName.trim()) return;
      try { await addGroup(newGroupName); setNewGroupName(""); } catch (e) { toast("Couldn't create — " + e.message); }
    };
    const toggleMember = (group, uid) => {
      const set = new Set(group.memberUids || []);
      if (set.has(uid)) set.delete(uid); else set.add(uid);
      updateGroupMembers(group.id, [...set]).catch(() => {});
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
                            const memberKey = inv.email;
                            const isMember = members.has(memberKey);
                            return (
                              <li key={inv.id} className="flex items-center gap-2 py-1.5">
                                <button onClick={() => toggleMember(g, memberKey)} className="flex-1 text-left text-xs font-mono text-slate-700 truncate">{inv.email}</button>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${isMember ? "text-white" : "text-slate-500 bg-slate-100"}`} style={isMember ? { backgroundColor: COLORS.success } : {}}>{isMember ? "In" : "Out"}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <button onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteGroup(g.id).catch(() => {}); }} className="w-full py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 border border-red-100 rounded-full">Delete group</button>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-slate-400 px-1 leading-relaxed">
              Note: group membership is currently keyed by email. Once a player signs in their uid is known and group filtering takes effect. Full uid-based assignment is a v1.1 polish.
            </p>
          </div>
        )}
      </section>
    );
  })();

  const nutritionComplianceSection = (() => {
    if (!isAdmin) return null;
    const loggedUids = new Set(mealLogActivityToday.map((a) => a.uid));
    const rosterEmails = invites?.length || 0;
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

  const documentsSection = <DocumentsSection user={user} documents={documents} isAdmin={isAdmin} rosterCount={(invites || []).filter((i) => i.role !== "admin").length} onUpload={addDocument} onDelete={deleteDocument} onSign={signDocument} defaultCollapsed />;

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
  const playersTotal = invites.filter((i) => i.role !== "admin").length;
  const dashStats = [
    ["Readiness", wellness.length ? avg("energy").toFixed(1) : "—", "/5"],
    ["Logged", wellness.length, `/${playersTotal}`],
    ["Meals", mealLogActivityToday.length, `/${playersTotal}`],
    ["Roster", invites.length, ""],
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
  const todayKey = fmtLocalDate(new Date());
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

  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      {greeting}
      {notificationsSection}
      {todaySection}
      {isAdmin
        ? (<>{youRunningSection}{coachDashboard}{playersSection}{announcementsSection}<QuoteOfDay quote={todayQuote} isAdmin={isAdmin} addQuote={addQuote} colors={COLORS} />{pushSection}{groupsSection}{nutritionComplianceSection}{checkinSection}</>)
        : (<>{checkinSection}{announcementsSection}<QuoteOfDay quote={todayQuote} isAdmin={isAdmin} addQuote={addQuote} colors={COLORS} />{documentsSection}</>)}
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
2026-08-15,19:30,21:30,vs ACU,Phoenix College,Game
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
  return rows.map((line) => {
    const c = splitCSVLine(line);
    return {
      date: (c[0] || "").trim(),
      start: (c[1] || "").trim() || "15:00",
      end: (c[2] || "").trim() || "17:00",
      title: (c[3] || "").trim(),
      location: (c[4] || "").trim(),
      type: validType((c[5] || "").trim()),
    };
  }).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title);
};

// Compact event chip for Month/Week views.
const EventChip = ({ ev, onClick }) => (
  <button onClick={onClick} className={`block w-full text-left rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-tight truncate ${EVENT_STYLE[ev.type] || "bg-slate-100 text-slate-700"} ${ev.isPrivate ? "ring-1 ring-slate-400 ring-inset" : ""}`} title={`${ev.title} · ${formatHourTime(ev.start)}`}>
    {ev.isPrivate && "🔒 "}{formatHourTime(ev.start).replace(/:00 /, "")} {ev.title}
  </button>
);

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
  const signedInUids = new Set(allUsers.map((u) => u.id));
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

                    <button onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteGroup(g.id).catch(() => {}); }} className="w-full py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 border border-red-100 rounded-full">Delete group</button>
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
  const todayStr = fmtLocalDate(new Date());
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
      setImportMsg(`Imported ${rows.length} event${rows.length === 1 ? "" : "s"}.`);
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
        else await addPersonalEvent(data);
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
        data.startAt = form.date && form.start ? new Date(`${form.date}T${form.start}:00`) : null;
        if (isAdmin && visibility.mode === "custom" && (visibility.groupIds.length || visibility.uids.length)) {
          data.visibleTo = { groupIds: visibility.groupIds, uids: visibility.uids };
        } else if (editingEvent) {
          // Clear visibility when editing back to "Everyone"
          data.visibleTo = null;
        }
        if (editingEvent && !editingEvent.isPrivate) await updateEvent(editingEvent.id, data);
        else await addEvent(data);
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
    if (ev.isPrivate) deletePersonalEvent(ev.id).catch(() => {});
    else deleteEvent(ev.id).catch(() => {});
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
              <textarea value={form.coachNotes} onChange={(e) => setForm({ ...form, coachNotes: e.target.value })} rows={2} placeholder="Notes for the coach running this — focus, intensity, reminders…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
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
const VIDEO_CSV_TEMPLATE = `title,url,cat,dur,diff,desc,type
10 Min Breathwork for Athletes,https://www.youtube.com/watch?v=n34DBL-dZNU,Breathing,10 min,Easy,"Focus + flow state breathwork",video
Soccer Hip Mobility Routine,https://www.youtube.com/watch?v=5NN9SuYO2YU,Mobility,5 min,Easy,"Quick pre-game hip prep",video`;

const parseVideoCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("title") && first.includes("url");
  const rows = hasHeader ? lines.slice(1) : lines;
  const validCat = (c) => VIDEO_CATS.includes(c) ? c : "Film";
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
    };
  }).filter((r) => r.title && r.url);
};

const VideosPage = ({ user, videos, addVideo, updateVideo, deleteVideo, importVideos }) => {
  const [cat, setCat] = useState("Film");
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

  // Subfolders derived from videos in the active category (so admin doesn't
  // need a separate management step — just type a name in the upload form
  // and that subfolder shows up as a pill for everyone else in that cat).
  const subfolders = useMemo(() => {
    const set = new Set();
    videos.filter((v) => v.cat === cat).forEach((v) => v.subfolder && set.add(v.subfolder));
    return ["All", ...[...set].sort()];
  }, [videos, cat]);

  const startEditVideo = (v) => {
    setEditingVideoId(v.id);
    setForm({ title: v.title || "", url: v.url || "", cat: v.cat || "Film", subfolder: v.subfolder || "", dur: v.dur || "", diff: v.diff || "Easy", desc: v.desc || "", type: v.type || "video" });
    setAdding(true);
  };
  const cancelEditVideo = () => { setEditingVideoId(null); setForm(blank); setAdding(false); };

  const doImport = async () => {
    setImportMsg("");
    const rows = parseVideoCSV(csvText);
    if (!rows.length) { setImportMsg("No valid rows — needs title,url,cat,dur,diff,desc,type."); return; }
    try {
      await importVideos(rows);
      setImportMsg(`Imported ${rows.length} video${rows.length === 1 ? "" : "s"}.`);
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
  const del = (id) => deleteVideo(id).catch(() => {});

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
            Columns: <span className="font-mono">title,url,cat,dur,diff,desc,type</span>. <span className="font-semibold">cat</span> is one of {VIDEO_CATS.join(", ")}. <span className="font-semibold">diff</span> Easy/Medium/Hard. <span className="font-semibold">type</span> video/audio/external. Wrap descriptions containing commas in "quotes".
          </p>
        </div></div>
      )}

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="YouTube / Vimeo / link URL" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-3 gap-2">
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{VIDEO_CATS.map((c) => <option key={c}>{c}</option>)}</select>
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
          {VIDEO_CATS.map((c) => (
            <button key={c} onClick={() => { setCat(c); setSubfolder("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Subfolder pills (only when subfolders exist for this category) */}
      {subfolders.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {subfolders.map((s) => (
              <button key={s} onClick={() => setSubfolder(s)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${subfolder === s ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={subfolder === s ? { backgroundColor: COLORS.accent, color: COLORS.primary } : {}}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{cat}{subfolder !== "All" ? ` · ${subfolder}` : ""}</h3>
        {filtered.length === 0 ? <p className="text-sm text-slate-400 italic">Nothing here yet.</p> : (
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
const NutritionHero = ({ totals, goal, streak, waterCups, setWaterCups }) => {
  const Bar = ({ value, target, color }) => {
    const pct = Math.min(100, target ? (value / target) * 100 : 0);
    return (
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    );
  };
  const waterDots = Array.from({ length: WATER_CUPS_GOAL }, (_, i) => i < waterCups);
  return (
    <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #003B77)` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Today's Fuel</div>
        {streak > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "rgba(244,199,94,0.22)", color: COLORS.accent }}>
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
          {goal?.cal > 0 && <Bar value={totals.cal} target={goal.cal} color={COLORS.accent} />}
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totals.p}g</span>
              <span className="text-xs opacity-70">{goal?.protein > 0 ? `/ ${goal.protein}g protein` : "protein"}</span>
            </div>
            {goal?.protein > 0 && <span className="text-[10px] font-semibold opacity-70">{Math.round((totals.p / goal.protein) * 100)}%</span>}
          </div>
          {goal?.protein > 0 && <Bar value={totals.p} target={goal.protein} color={COLORS.success} />}
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
          <button onClick={() => setWaterCups(waterCups + 1)} aria-label="Add a cup" className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: COLORS.accent, color: COLORS.primary }}>+</button>
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
const downscaleToBlob = (file, maxDim = 1600, quality = 0.86) =>
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

const DrillChip = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
    <Icon className="w-3 h-3" style={{ color: COLORS.accent }} /> {children}
  </span>
);

// Uniform drill diagram: Bears logo watermark at exactly 20% opacity behind the
// drill's diagram photo (or behind the category icon tile when no diagram yet).
const DrillDiagram = ({ d, icon: Icon, className = "" }) => (
  <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className}`}>
    <img src="/pc-bears-logo.png" alt="" aria-hidden="true" draggable="false"
      className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none select-none"
      style={{ opacity: 0.2 }} />
    {d.diagramData ? (
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

// Full uniform drill card: clear title → diagram (Bears watermark) → setup
// block → How to run it → Look for. Empty sections are hidden.
const DrillModal = ({ item, onClose }) => {
  const embedUrl = item.videoUrl ? toEmbedUrl(item.videoUrl) : null;
  const Icon = DRILL_CAT_ICON[item.cat] || Target;
  const title = item.title || item.name;
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
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
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
              <iframe src={embedUrl} title={title} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
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
  );
};

const DrillsPage = ({ user, drills, addDrill, updateDrill, deleteDrill, startCreating = false }) => {
  const isAdmin = user.role === "admin";
  const blank = { name: "", title: "", kind: "drill", cat: DRILL_CATS[0], tags: "", dur: "", players: "", equipment: "", setupLengthYd: "", setupWidthYd: "", setupCones: "", setupBalls: "", setupGoals: "", setupMannequins: "", setupTeams: "", howTo: "", objectives: "", desc: "", info: "", videoUrl: "", photos: [], diagram: "", diagramData: null, scenario: "", cues: "" };
  const [cat, setCat] = useState(DRILL_CATS[0]);
  const [tag, setTag] = useState("All");
  const [adding, setAdding] = useState(startCreating);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  // Save the tactics board: rasterize to a PNG diagram (so it renders anywhere a
  // drill diagram shows) and keep the editable JSON so it can be reopened.
  const saveBoard = async (pngBlob, state) => {
    setBoardOpen(false);
    // The board's yard dimensions are the drill's setup dimensions.
    setForm((p) => ({ ...p, diagramData: state, setupLengthYd: state?.lengthYd ?? p.setupLengthYd, setupWidthYd: state?.widthYd ?? p.setupWidthYd }));
    if (!pngBlob) return;
    setUploading(true);
    try {
      const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const r = storageRef(storage, path);
      const snap = await uploadBytes(r, pngBlob, { contentType: "image/png" });
      const url = await getDownloadURL(snap.ref);
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
  // Tag pills are scoped to the active category.
  const tags = useMemo(() => {
    const set = new Set();
    drills.filter((d) => d.cat === cat).forEach((d) => (d.tags || []).forEach((t) => set.add(t)));
    return ["All", ...[...set].sort()];
  }, [drills, cat]);
  const filtered = drills.filter((d) => (d.kind || "drill") !== "point" && d.cat === cat && (tag === "All" || (d.tags || []).includes(tag)));

  const uploadImage = async (file) => {
    const blob = await downscaleToBlob(file);
    const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return getDownloadURL(snap.ref);
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
    try { setForm((p) => ({ ...p, diagram: "" })); const url = await uploadImage(file); setForm((p) => ({ ...p, diagram: url })); }
    catch (e) { toast("Couldn't upload diagram — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    const gridMatch = String(d.setup?.grid || "").match(/(\d+)\s*[x×]\s*(\d+)/);
    const lenYd = d.setup?.lengthYd ?? d.diagramData?.lengthYd ?? (gridMatch ? gridMatch[1] : "");
    const widYd = d.setup?.widthYd ?? d.diagramData?.widthYd ?? (gridMatch ? gridMatch[2] : "");
    const equipStr = Array.isArray(d.setup?.equipment) ? d.setup.equipment.join(", ") : (d.equipment || "");
    setForm({ name: d.name || "", title: d.title || "", kind: d.kind || "drill", cat: d.cat || DRILL_CATS[0], tags: (d.tags || []).join(", "), dur: d.dur || "", players: d.players || "", equipment: equipStr, setupLengthYd: lenYd, setupWidthYd: widYd, setupCones: d.setup?.cones ?? "", setupBalls: d.setup?.balls ?? "", setupGoals: d.setup?.goals ?? "", setupMannequins: d.setup?.mannequins ?? "", setupTeams: d.setup?.teams || "", howTo: d.howTo || "", objectives: (d.objectives || []).join("\n"), desc: d.desc || "", info: d.info || "", videoUrl: d.videoUrl || "", photos: d.photos || [], diagram: d.diagram || "", diagramData: d.diagramData || null, scenario: d.scenario || "", cues: (d.cues || []).join("\n") });
    setAdding(true);
  };
  const cancel = () => { setEditingId(null); setForm(blank); setAdding(false); setNewCat(false); };
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
      photos: form.photos, diagram: form.diagram, diagramData: form.diagramData || null,
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
      setCat(data.cat);
      cancel();
    } catch (e) { toast("Couldn't save drill — " + (e.message || "check Firestore rules.")); }
  };
  // Duplicate for a progression: same drill + board, harder variation to fill in.
  const duplicateDrill = async (d) => {
    const copy = { ...d };
    delete copy.id;
    copy.name = `${d.name || "Drill"} — Progression`;
    copy.title = `${d.title || d.name || "Drill"} — Progression`;
    try { await addDrill(copy); toast("Duplicated — edit the copy for the progression."); }
    catch (e) { toast("Couldn't duplicate — " + (e.message || "check Firestore rules.")); }
  };
  const del = (id) => deleteDrill(id).catch(() => {});

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
          <textarea value={form.howTo} onChange={(e) => setForm({ ...form, howTo: e.target.value })} rows={3} placeholder="How to run it — instructions" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <textarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} rows={2} placeholder="Look for — one goal per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={2} placeholder="Description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <textarea value={form.info} onChange={(e) => setForm({ ...form, info: e.target.value })} rows={2} placeholder="How to run it" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
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
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { setDiagram(e.target.files?.[0]); setForm((p) => ({ ...p, diagramData: null })); e.target.value = ""; }} />
            </label>
          </div>
          {form.diagramData && (
            <div className="relative">
              <BoardSvg state={form.diagramData} showLegend className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          )}
          {form.diagram && !form.diagramData && (
            <div className="relative">
              <img src={form.diagram} alt="Drill diagram" className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          )}
          {uploading && <p className="text-[10px] font-semibold text-slate-400 px-1">Uploading…</p>}
          {boardOpen && <TacticsBoard initial={form.diagramData} onSave={saveBoard} onClose={() => setBoardOpen(false)} />}

          <div className="flex gap-2 pt-1">
            <button onClick={cancel} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={save} disabled={uploading || !form.name.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{editingId ? "Save changes" : "Add drill"}</button>
          </div>
        </div></div>
      )}


      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {cats.map((c) => (
            <button key={c} onClick={() => { setCat(c); setTag("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Tag pills (only when the active category has tags) */}
      {tags.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(t)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 ${tag === t ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={tag === t ? { backgroundColor: COLORS.accent, color: COLORS.primary } : {}}>{t !== "All" && <Tag className="w-2.5 h-2.5" />}{t}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{cat}{tag !== "All" ? ` · ${tag}` : ""}</h3>
        {filtered.length === 0 ? (
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

// Small reusable drill thumbnail (diagram or category-icon tile, Bears watermark).
const DrillThumb = ({ d, className = "w-10 h-10" }) => {
  const Icon = DRILL_CAT_ICON[d.cat] || Target;
  return (
    <div className={`${className} relative rounded-lg overflow-hidden bg-slate-900 flex-shrink-0`}>
      <img src="/pc-bears-logo.png" alt="" aria-hidden="true" className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none" style={{ opacity: 0.2 }} />
      {d.diagramData
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
  const hits = q ? drills.filter((d) => d.name.toLowerCase().includes(q) || (d.tags || []).some((t) => t.toLowerCase().includes(q))) : null;
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
  const [picker, setPicker] = useState(false);
  const [pickForBlock, setPickForBlock] = useState(null);
  const [viewDrill, setViewDrill] = useState(null);
  const totalMin = blocks.reduce((s, b) => s + parseBlockMin(b.dur), 0);

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => { onSave({ name, desc, cat, blocks, published, targetMin }); setDirty(false); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, cat, blocks, published, targetMin, dirty]);

  const handleBack = () => { if (dirty && canEdit) onSave({ name, desc, cat, blocks, published, targetMin }); onBack(); };
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
      {picker && <DrillPicker drills={drills} onPick={addBlock} onClose={() => setPicker(false)} />}
      {pickForBlock !== null && <DrillPicker drills={drills} onPick={(d) => fillBlock(pickForBlock, d)} onClose={() => setPickForBlock(null)} />}
      {viewDrill && <DrillModal item={viewDrill} onClose={() => setViewDrill(null)} />}
    </div>
  );
};

const PracticesView = ({ practices, drills, canEdit, add, update, del, initialOpenId = null, hideCreate = false }) => {
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [cat, setCat] = useState("All");
  const catOptions = useMemo(() => [...new Set(practices.map((p) => p.cat).filter(Boolean))].sort(), [practices]);
  const cats = ["All", ...catOptions];
  const open = practices.find((p) => p.id === openId);
  if (open) return <PracticeDetail practice={open} drills={drills} canEdit={canEdit} catOptions={catOptions} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} />;
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

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No practices{cat !== "All" ? ` in ${cat}` : ""} yet.</p>
      ) : (
        <ul className="space-y-2">{filtered.map((p) => <li key={p.id}><PracticeCard practice={p} onOpen={() => setOpenId(p.id)} /></li>)}</ul>
      )}
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
  const [pickFor, setPickFor] = useState(null); // index of day choosing a practice

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => { onSave({ name, desc, days, published, shared }); setDirty(false); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, days, published, shared, dirty]);

  const handleBack = () => { if (dirty && canEdit) onSave({ name, desc, days, published, shared }); onBack(); };
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
          <button onClick={() => onAssign({ ...program, name, days })} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 text-white" style={{ backgroundColor: COLORS.accent, color: COLORS.primary }}><CalendarIcon className="w-3.5 h-3.5" /> Assign to calendar</button>
          {user?.role === "orgAdmin" && (
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
  if (open) return <ProgramDetail program={open} practices={practices} canEdit={canEdit} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} onAssign={onAssign} user={user} />;
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

      {programs.length === 0 ? (
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const [days, setDays] = useState(() =>
    (program.days || []).map((d, i) => {
      const dt = new Date(todayStr + "T00:00:00"); dt.setDate(dt.getDate() + i);
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
  const today = new Date().toISOString().slice(0, 10);
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
      {nav.section === "practices" && nav.mode === "library" && <PracticesView practices={practices} drills={drills} canEdit={isAdmin} add={addPractice} update={updatePractice} del={deletePractice} initialOpenId={nav.openId} hideCreate />}
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
  ctx.fillStyle = "#002E5D";
  ctx.fillRect(0, 0, CARD_W, top);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText((title || "Starting XI").slice(0, 30), CARD_W / 2, 52);
  ctx.fillStyle = "#FFC845";
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
  // uploaded logo, the ACTIVE team's name is the watermark instead of the
  // old Phoenix Bears mark (the full rebrand is §11; the name comes from
  // the teams config).
  if (useLogo && logoImg && logoImg.width) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    const lw = CARD_W * 0.5;
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
      ctx.fillStyle = s.uid || s.name ? "#002E5D" : "rgba(255,255,255,0.18)";
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
const PlayerPickerSheet = ({ roster, usedUids, onPick, onClear, onUploadPhoto, onClose }) => {
  const [q, setQ] = useState("");
  const uploadRef = useRef(null);
  const [target, setTarget] = useState(null);
  const list = roster.filter((p) => (p.name || p.email || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-base text-slate-900">Pick a player</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roster…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
          <button onClick={onClear} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-red-500 bg-red-50">Clear this position</button>
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (target) onUploadPhoto(target, f); setTarget(null); }} />
          {list.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No players found.</p>}
          {list.map((p) => (
            <div key={p.uid || p.email} className={`flex items-center gap-3 px-2 py-2 rounded-xl ${usedUids.has(p.uid) && p.uid ? "opacity-40" : ""}`}>
              <button onClick={() => onPick(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <Avatar photoURL={p.photoURL} initials={p.initials} size={38} bg={COLORS.primary} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{p.name || p.email}</div>
                  {p.role === "admin" && <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Coach</div>}
                </div>
              </button>
              {p.uid && (
                <button onClick={() => { setTarget(p); uploadRef.current?.click(); }} aria-label={`Add photo for ${p.name}`} title="Add / change photo" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-slate-500 bg-slate-100">
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const GameDayPage = ({ user, lineups = [], addLineup, updateLineup, deleteLineup, allUsers = [], invites = [], chatGroups = [], postLineupImage, setPlayerPhoto, lineupLogo = "", setLineupLogo, teamShortName = "" }) => {
  const [draft, setDraft] = useState(null); // null = list view; object = editor
  const [activeSlot, setActiveSlot] = useState(null); // slot id being assigned
  const [sending, setSending] = useState(null); // lineup being sent to chat
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);
  const fieldRef = useRef(null);
  const dragRef = useRef({ id: null, moved: false, sx: 0, sy: 0 });

  // The watermark shown on every line-up — the coach's uploaded logo, or
  // the active team's name until they set one (no Phoenix Bears fallback).
  const logoUrl = lineupLogo || "";
  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const blob = await downscaleToBlob(file, 512, 0.9);
      const path = `branding/${user.uid}/lineup-logo-${Date.now()}.jpg`;
      const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
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
      rows.push({ uid: u.id, name: u.name || u.email || "Player", initials: u.initials || initialsOf(u.name || u.email || ""), photoURL: u.photoURL || "", email: u.email || "", role: u.role || "player" });
    });
    (invites || []).forEach((inv) => {
      const em = (inv.email || "").toLowerCase();
      if (em && !seen.has(em)) rows.push({ uid: "", name: inv.email, initials: initialsOf(inv.email), photoURL: "", email: inv.email, role: inv.role || "player" });
    });
    return rows.sort((a, b) => (a.role === b.role ? (a.name || "").localeCompare(b.name || "") : a.role === "admin" ? 1 : -1));
  }, [allUsers, invites]);

  const newLineup = () => setDraft({ id: null, name: "", formation: "4-3-3", slots: slotsForFormation(FORMATIONS["4-3-3"]) });
  const editLineup = (l) => setDraft({ id: l.id, name: l.name || "", formation: l.formation || "", slots: (l.slots || []).map((s) => ({ ...s, id: s.id || lid() })) });
  const changeFormation = (f) => setDraft((d) => ({ ...d, formation: f, slots: slotsForFormation(FORMATIONS[f]) }));

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
  const uploadForPlayer = async (player, file) => {
    if (!file || !player.uid) return;
    try {
      const blob = await downscaleToBlob(file, 640, 0.85);
      const path = `avatars/${user.uid}/${Date.now()}.jpg`;
      const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(snap.ref);
      await setPlayerPhoto(player.uid, url, path);
      setDraft((d) => (d ? { ...d, slots: d.slots.map((s) => (s.uid === player.uid ? { ...s, photoURL: url } : s)) } : d));
      toast(`Photo added for ${player.name}.`);
    } catch (e) { toast("Couldn't add photo — " + (e.message || "check Storage rules.")); }
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
              ? <img src={logoUrl} alt="" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
              : <span className="text-[11px] font-black px-1 text-center leading-tight" style={{ color: COLORS.primary }}>{teamShortName || "Team"}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900">Line-up watermark</div>
            <div className="text-[11px] text-slate-500 leading-snug">{lineupLogo ? "Your logo, centered on every line-up." : `Using ${teamShortName || "your team"} as the watermark. Upload your own logo.`}</div>
          </div>
          <button onClick={() => logoInputRef.current?.click()} disabled={logoBusy} className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white flex-shrink-0 disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
            {logoBusy ? "…" : lineupLogo ? "Change" : "Upload"}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadLogo(f); }} />
        </div>
        {sending && <SendLineupSheet title={sending.name} formation={sending.formation} slots={sending.slots || []} logoUrl={logoUrl} teamShortName={teamShortName} chatGroups={chatGroups} postLineupImage={postLineupImage} onClose={() => setSending(null)} />}
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pt-1">Saved line-ups</h3>
        {lineups.length === 0 ? (
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
                  <button onClick={() => { if (window.confirm(`Delete "${l.name || "this line-up"}"?`)) deleteLineup(l.id); }} aria-label="Delete" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Trash2 className="w-4 h-4 text-slate-400" /></button>
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
      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name this line-up (e.g. vs Central State)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold" />
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
          <img src={logoUrl} alt="" aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none object-contain" style={{ width: "50%", opacity: 0.6 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
        <button onClick={() => setSending({ name: (draft.name || "").trim() || `${draft.formation} line-up`, formation: draft.formation, slots: draft.slots })} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.accent, color: COLORS.primary }}>
          <Send className="w-3.5 h-3.5" /> Send to chat
        </button>
      </div>
      <p className="text-[10px] text-slate-400 text-center leading-relaxed">Tap a spot to assign a player · drag to reposition</p>
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
      {sending && <SendLineupSheet title={sending.name} formation={sending.formation} slots={sending.slots} logoUrl={logoUrl} teamShortName={teamShortName} chatGroups={chatGroups} postLineupImage={postLineupImage} onClose={() => setSending(null)} />}
    </div>
  );
};

// Roster & Invites — moved out of the coach Home tab into Coach Tools
// (§9 Option B, "The Toolbelt"). Same invite system as before: email
// invites (single + bulk), team-specific invite links, and the roster list
// with org-admin-only role badges.
const RosterInvitesPage = ({ user, isOrgAdmin = false, invites, addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks = [], addInviteLink, removeInviteLink, allUsers = [], requestProfileUpdate, activeTeamId }) => {
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

  return (
    <div className="pt-4 pb-6 px-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900">Roster &amp; Invites</h3>
        <p className="text-xs text-slate-500 mt-0.5">{invites?.length || 0} on the roster{pendingCount > 0 ? ` · ${pendingCount} invite${pendingCount === 1 ? "" : "s"} still pending` : ""}</p>
      </div>
      {requestProfileUpdate && (
        <button onClick={async () => { try { await requestProfileUpdate(); toast("Sent — everyone will be asked to add their name."); } catch (e) { toast("Couldn't send — " + (e.message || "")); } }} className="w-full py-2 rounded-full text-[11px] font-bold uppercase tracking-wider border border-slate-200 bg-white text-slate-700 flex items-center justify-center gap-1.5">
          <Bell className="w-3.5 h-3.5" /> Ask everyone to update their info
        </button>
      )}
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
                  <button onClick={() => removeInviteLink(l.id).catch(() => {})} title="Revoke link" aria-label="Revoke link" className="text-slate-300 hover:text-red-500 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(!invites || invites.length === 0) ? (
        <p className="text-sm text-slate-400 italic text-center py-3">No players on the roster yet.</p>
      ) : (
        <ul className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {invites.map((inv, i) => {
            const isCoach = inv.role === "admin";
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
              <li key={inv.id} className={`flex items-center gap-2 px-3 py-2.5 ${i < invites.length - 1 ? "border-b border-slate-100" : ""}`}>
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
                    {isCoach ? "Coach" : "Player"}
                  </button>
                ) : (
                  <span
                    title={isCoach ? "Coach — only the program admin can change roles." : "Player — only the program admin can change roles."}
                    className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0"
                    style={isCoach
                      ? { backgroundColor: COLORS.primary, color: "white" }
                      : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                  >
                    {isCoach ? "Coach" : "Player"}
                  </span>
                )}
                <button onClick={() => removeInvite(inv.id)} disabled={isSelf} title={isSelf ? "You can't remove yourself." : `Remove ${inv.email}`} aria-label={`Remove ${inv.email}`} className="text-slate-300 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
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
  const togglePin = (id, pinned) => togglePinAnnouncement(id, pinned).catch(() => {});
  const del = (id) => deleteAnnouncement(id).catch(() => {});
  const sorted = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <div className="pt-4 pb-6 px-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Announcements</h3>
          <p className="text-xs text-slate-500 mt-0.5">{announcements.length} post{announcements.length === 1 ? "" : "s"} · pinned first</p>
        </div>
        <button onClick={() => { setAdding(!adding); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1 flex-shrink-0" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Post</button>
      </div>
      {adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details…" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
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
      {sorted.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No announcements yet — post the first one.</p>}
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
const CoachCenterPage = ({ practiceProps, gameDayProps, rosterProps, calendarProps, documentsProps, announcementsProps }) => {
  const [view, setView] = useState(null); // null | practice | gameday | roster | calendar | documents | announcements
  const practices = practiceProps?.practices || [];
  const programs = practiceProps?.programs || [];
  const lineups = gameDayProps?.lineups || [];
  const invites = rosterProps?.invites || [];
  const allUsers = rosterProps?.allUsers || [];
  const events = calendarProps?.events || [];
  const documents = documentsProps?.documents || [];
  const announcements = announcementsProps?.announcements || [];
  const todayStr = fmtLocalDate(new Date());
  const upcomingCount = events.filter((e) => (e.date || "") >= todayStr).length;
  // Pending invites = roster emails nobody has signed in with yet. The
  // roster is small, so this is computed inline (no memo needed).
  const signedEmails = new Set(allUsers.map((u) => (u.email || "").toLowerCase()));
  const pendingCount = invites.filter((inv) => inv.email && !signedEmails.has(inv.email.toLowerCase())).length;

  const tiles = [
    { id: "practice", label: "Practice", sub: "Drill library, sessions & programs", icon: ClipboardList, badge: `${practices.length} session${practices.length === 1 ? "" : "s"} · ${programs.length} program${programs.length === 1 ? "" : "s"}` },
    { id: "gameday", label: "Game Day", sub: "Build & share your starting line-up", icon: Goal, badge: `${lineups.length} saved line-up${lineups.length === 1 ? "" : "s"}`, highlight: true },
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
// their private food-log area (logs/{uid}/goal). The hero bars and the
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
  const [cat, setCat] = useState(effectiveCategories[0] || "Breakfast");
  useEffect(() => {
    if (!effectiveCategories.includes(cat) && effectiveCategories.length) setCat(effectiveCategories[0]);
  }, [effectiveCategories, cat]);
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
  // Barcode scanner — uses browser BarcodeDetector + Open Food Facts lookup.
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleBarcode = async (code) => {
    setScannerOpen(false);
    setShowManual(true);
    setFormState("uploading");
    setFormNote(`Looking up ${code}…`);
    try {
      const data = await lookupBarcode(code);
      setManual({
        name: data.name || `Product ${code}`,
        cal: data.cal != null ? String(data.cal) : "",
        p: data.p != null ? String(data.p) : "",
        c: data.c != null ? String(data.c) : "",
        f: data.f != null ? String(data.f) : "",
      });
      setFormNote(`Open Food Facts · per 100g — adjust if your portion was different.`);
      setFormState("done");
    } catch (e) {
      setFormState("error");
      setFormNote(e.message || "Barcode lookup failed");
    }
  };

  useEffect(() => {
    if (!showManual) { setSearchResults([]); return; }
    const q = manual.name.trim();
    if (q.length < 2) { setSearchResults([]); setSearchErr(""); return; }
    const ctl = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      // Query Open Food Facts (no key) + USDA (if a key is set) at once, then
      // merge and de-dupe by name so one box searches everything.
      const tasks = [searchProducts(q, ctl.signal)];
      if (hasUsdaKey()) tasks.unshift(searchFoods(q, ctl.signal));
      const settled = await Promise.allSettled(tasks);
      if (ctl.signal.aborted) return;
      const merged = [];
      const seen = new Set();
      settled.forEach((s) => {
        if (s.status !== "fulfilled") return;
        s.value.forEach((r) => {
          const key = (r.name || "").toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          merged.push(r);
        });
      });
      if (!merged.length && settled.every((s) => s.status === "rejected")) {
        const firstErr = settled.find((s) => s.status === "rejected");
        setSearchErr(firstErr?.reason?.message || "search failed");
      } else {
        setSearchErr("");
      }
      setSearchResults(merged.slice(0, 16));
      setSearching(false);
    }, 300);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [manual.name, showManual]);
  const pickFood = (r) => {
    setManual({ ...manual, name: r.name, cal: String(r.cal), p: String(r.p), c: String(r.c), f: String(r.f) });
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
      setSearchResults([]);
      setFormState("idle");
      setFormNote("");
      setShowManual(false);
    } catch (e) {
      toast("Couldn't add — " + e.message);
    }
  };
  const rate = (logId, feeling) => updateLog(logId, { feeling }).catch(() => {});
  const removeLog = (logId) => deleteLog(logId).catch(() => {});

  const addSingle = async () => {
    if (!single.name.trim()) return;
    const name = single.name.trim();
    const targetCat = single.cat || "Other";
    try {
      if (targetCat && !categories.includes(targetCat)) await addCategory(targetCat);
      const data = {
        name, cat: targetCat,
        sub: single.sub.trim() || "",
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
              <button onClick={() => { setEditingRecipeId(null); setSingle({ name: "", cat: single.cat, cal: "", p: "", c: "", f: "", prep: "", ingredients: "" }); setImportMsg(""); }} className="w-full mt-1 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100">Cancel Edit</button>
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
                      <button onClick={() => deleteSavedFood(s.id)} title="Remove from saved" className="px-2 py-1.5 text-slate-300 hover:text-red-500 border-l" style={{ borderColor: COLORS.border }}><X className="w-3 h-3" /></button>
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
              {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold">searching…</span>}
            </div>
            {searchErr && <p className="text-[10px] text-red-500 font-medium px-1">{searchErr}</p>}
            {searchResults.length > 0 && (
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
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.cal} onChange={(e) => setManual({ ...manual, cal: e.target.value })} placeholder="Calories" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.p} onChange={(e) => setManual({ ...manual, p: e.target.value })} placeholder="Protein g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button onClick={() => saveFood(manual)} disabled={!manual.name.trim()} title="Save to favorites" className="px-4 py-2 rounded-full text-xs font-bold border-2 bg-white flex items-center gap-1.5 disabled:opacity-40" style={{ borderColor: COLORS.primary, color: COLORS.primary }}><Star className="w-3.5 h-3.5" fill={isSaved(manual.name) ? COLORS.primary : "none"} /> Save</button>
              <button onClick={addManual} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Add to Log</button>
            </div>
            {!hasUsdaKey() && <p className="text-[10px] text-slate-400 px-1">Searching Open Food Facts. Add a USDA API key for whole-food results too (see README → Food search).</p>}
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
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setErr("Your browser doesn't support barcode scanning. Try Chrome on Android or Safari 17+ on iOS.");
      return;
    }
    let cancelled = false;
    let stream;
    let frameId;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes.find((c) => c.rawValue);
            if (code) {
              cancelled = true;
              onScan(code.rawValue);
              return;
            }
          } catch { /* transient detect errors are fine */ }
          frameId = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setErr("Couldn't access camera — " + (e.message || "permission denied?"));
      }
    })();
    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

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
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
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

const PollCard = ({ message, own, myUid, onVote, isAdmin = false, onSeeVoters }) => {
  const votes = message.votes || {};
  const myVote = votes[myUid];
  const opts = message.options || [];
  const totals = opts.map((_, i) => Object.values(votes).filter((v) => v === i).length);
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
                <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: isMine ? (own ? "rgba(244,199,94,0.45)" : COLORS.accentSoft) : (own ? "rgba(255,255,255,0.12)" : "rgba(20,39,92,0.06)") }} />
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
    .filter((r) => r.role !== "admin")
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
  const players = (roster || []).filter((r) => r.role !== "admin");
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
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message (optional)" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
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
              {options.length < 6 && <button onClick={() => setOptions((arr) => [...arr, ""])} className="text-[11px] font-bold" style={{ color: COLORS.primary }}>+ Add option</button>}
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
                      <button onClick={() => onDelete(s.id)} aria-label="Cancel" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
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
// the scheduled reminders), then either Sends now (out immediately via the
// `sendPushNotification` callable) or Schedules it (stored in
// `pushNotifications` for the `runScheduled` runner, with an optional
// daily / weekly / custom repeat). Recurrence is stored as
// {type: "none"|"daily"|"weekly", time: "HH:MM", days: [weekday numbers]} —
// a "Custom" day pick is stored as type "weekly" with its days, since the
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
  const players = (roster || []).filter((r) => r.role !== "admin");
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
        toast("Notification sent.");
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Practice moved to 5pm)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
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
                      <button onClick={() => onDelete(n.id)} aria-label="Delete" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
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

const MessagesPage = ({ user, activeTeamId, isOrgAdmin = false, messages, addMessage, togglePinMessage, deleteMessage, markMessagesRead, voteOnPoll, reactToMessage, rosterCount = 0, chatGroups = [], addChatGroup, deleteChatGroup, updateChatGroup, onPinChannel, groups = [], invites = [], allUsers = [], announcements = [], addAnnouncement, deleteAnnouncement, dms = [], addDM, markDMsRead, scheduled = [], addScheduled, deleteScheduled }) => {
  const isAdmin = user.role === "admin";
  const [input, setInput] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [shared, setShared] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: "", options: ["", ""] });
  const [uploading, setUploading] = useState(false);
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelModal, setChannelModal] = useState(false);
  const [scheduledModal, setScheduledModal] = useState(false);
  const [viewer, setViewer] = useState(null); // { title, groups } — coach seen/voted breakdown
  const nameByUid = useMemo(() => Object.fromEntries((allUsers || []).map((u) => [u.id, u.name || u.email || "Member"])), [allUsers]);
  // email → display name, for showing roster people by name instead of address.
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email && u.name).map((u) => [u.email.toLowerCase(), u.name])), [allUsers]);
  const rosterPlayers = useMemo(() => (allUsers || []).filter((u) => u.role !== "admin"), [allUsers]);
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
  const openVoters = (m) => {
    const votes = m.votes || {};
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
  const dmThreads = useMemo(() => {
    if (isOrgAdmin) return [];
    if (!isAdmin) return [{ id: "coach-dm", name: coachDmName, dm: true }];
    const byThread = new Map();
    dms.forEach((d) => { if (!byThread.has(d.threadId)) byThread.set(d.threadId, d); });
    return [...byThread.entries()].map(([tid, d]) => ({ id: `dm:${tid}`, name: (dms.find((x) => x.threadId === tid && !x.isCoach)?.senderName) || d.senderName || "Player", dm: true }));
  }, [dms, isAdmin, isOrgAdmin, coachDmName]);
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
      await addMessage("", {
        attachment: { type: "image", url, path, name: file.name || "photo.jpg" },
        channel: effectiveChannel,
      });
    } catch (e) {
      toast("Couldn't send photo — " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // Jump to the newest messages: on opening a conversation and whenever new
  // messages arrive. Deferred across two frames so it lands after layout (and
  // late-loading images) settle, so a chat always opens pinned to the bottom.
  useEffect(() => {
    if (shared || !activeConv) return;
    const toBottom = () => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; };
    toBottom();
    const r1 = requestAnimationFrame(() => { toBottom(); requestAnimationFrame(toBottom); });
    const t = setTimeout(toBottom, 120);
    return () => { cancelAnimationFrame(r1); clearTimeout(t); };
  }, [channelMessages, dmMessages, shared, activeConv]);

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

  const togglePin = (m) => togglePinMessage(m.id, m.pinned).catch(() => {});
  const delMsg = (id) => deleteMessage(id).catch(() => {});
  const startReply = (m) => setReplyTo({ id: m.id, sender: m.sender, text: m.text, kind: m.kind, question: m.question });
  const cancelReply = () => setReplyTo(null);
  const [copiedId, setCopiedId] = useState(null);
  const copyMsg = async (m) => {
    const text = m.kind === "poll" ? m.question : m.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
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
      const text = m.kind === "poll" ? `📊 ${m.question || "Poll"}` : (m.attachment?.type === "image" ? "📷 Photo" : (m.text || ""));
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
      <div className="flex flex-col" style={{ height: "calc(100vh - 7rem - 64px)" }}>
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
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
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
          <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</div>
          <ul className="divide-y divide-slate-100">
            {channelConvs.map((c) => convRow(c))}
          </ul>
          {!isOrgAdmin && (
            <>
              <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Direct messages</div>
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
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem - 64px)" }}>
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
        <button onClick={() => { setActiveChannel(null); setShared(false); }} className="flex items-center gap-2 min-w-0">
          <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 text-left"><h3 className="font-bold text-slate-900 text-sm truncate">{activeName}</h3><p className="text-[10px] text-slate-500">{rosterCount} on roster</p></div>
        </button>
        <button onClick={() => setShared(!shared)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0" style={shared ? { backgroundColor: COLORS.primary, color: "white" } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>
          <Layers className="w-3 h-3" /> {shared ? "Chat" : "Shared"}
        </button>
      </div>

      {channelModal && (
        <ChannelModal chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onCreate={addChatGroup} onDelete={deleteChatGroup} onUpdate={updateChatGroup} onClose={() => setChannelModal(false)} />
      )}
      {viewer && (
        <ViewersModal title={viewer.title} groups={viewer.groups} onClose={() => setViewer(null)} />
      )}

      {shared ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ backgroundColor: COLORS.bg }}>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Photos & Files</h4>
            {mediaMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No files shared yet.</p> : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMsgs.map((m) => (
                  m.attachment?.type === "image" && m.attachment.url ? (
                    <a key={m.id} href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block">
                      <img src={m.attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
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
          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: COLORS.bg }}>
            {dmMessages.length === 0 && <p className="text-center text-xs text-slate-400 italic py-6">{isAdmin ? "No messages in this thread yet." : "Message your coach privately. Only you and your team's coach can see this."}</p>}
            {dmStream.map((item) => {
              if (item.kind === "divider") return <DateDivider key={item.id} label={item.label} />;
              const d = item.dm;
              const own = d.senderUid === user.uid;
              return (
                <div key={d.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${own ? "text-white" : "bg-white text-slate-900"}`} style={own ? { backgroundColor: COLORS.primary } : {}}>
                    {!own && <div className="text-[10px] font-bold mb-0.5" style={{ color: COLORS.accent }}>{d.senderName}{d.isCoach ? " · Coach" : ""}</div>}
                    <p className="leading-snug break-words select-text"><Linkify>{d.text}</Linkify></p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-white border-t border-slate-200 p-3 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={isAdmin ? "Reply…" : "Message your coach…"} className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={send} disabled={!input.trim()} className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}><Send className="w-4 h-4" /></button>
          </div>
        </>
      ) : (
        <>
          {pinnedMsgs.length > 0 && (
            <div className="bg-orange-50 border-b border-orange-100">
              <button onClick={() => setShowPinned(!showPinned)} className="w-full px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Pin className="w-3 h-3" /> {pinnedMsgs.length} Pinned</span>
                {showPinned ? <ChevronUp className="w-3.5 h-3.5 text-orange-400" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-400" />}
              </button>
              {showPinned && <ul className="px-4 pb-2 space-y-1">{pinnedMsgs.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs"><span className="font-bold text-slate-700">{m.sender.split(" ")[0]}:</span><span className="text-slate-600 truncate flex-1">{m.text}</span>{isAdmin && <button onClick={() => togglePin(m)} className="text-orange-400"><X className="w-3 h-3" /></button>}</li>
              ))}</ul>}
            </div>
          )}

          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: COLORS.bg }}>
            {stream.map((item) => {
              if (item.kind === "divider") return <DateDivider key={item.id} label={item.label} />;
              if (item.kind === "announcement") {
                const a = item.announcement;
                return (
                  <div key={item.id} className="rounded-2xl p-3.5 shadow-sm border" style={{ backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Bell className="w-3 h-3" /> Announcement</span>
                      {isAdmin && deleteAnnouncement && <button onClick={() => deleteAnnouncement(a.id).catch(() => {})} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-1">{a.title}</div>
                    {a.body && <div className="text-xs text-slate-600 mt-0.5 leading-snug">{a.body}</div>}
                  </div>
                );
              }
              const m = item.message;
              const own = isOwn(m);
              const seenN = own ? readByCount(m) : 0;
              return (
                <div key={m.id} className={`flex gap-2 group ${own ? "flex-row-reverse" : "flex-row"}`}>
                  {!own && <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.isCoach ? COLORS.primary : "#94a3b8" }}>{m.initials}</div>}
                  <div className={`max-w-[80%] flex flex-col ${own ? "items-end" : "items-start"}`}>
                    {!own && <div className="flex items-baseline gap-1.5 mb-1"><span className="text-[10px] font-bold text-slate-700">{m.sender}</span>{m.isCoach && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>Coach</span>}</div>}

                    {m.replyToId && m.replyToSender && (
                      <div className={`text-[10px] mb-1 px-2 py-1 rounded-md border-l-2 max-w-full ${own ? "self-end" : "self-start"}`} style={{ borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft }}>
                        <div className="font-bold text-slate-700">{m.replyToSender}</div>
                        <div className="text-slate-600 truncate">{m.replyToText}</div>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {own && isAdmin && <button onClick={() => togglePin(m)} className={`${m.pinned ? "text-orange-500" : "text-slate-300"} hover:text-orange-500`}><Pin className="w-3.5 h-3.5" /></button>}

                      {m.kind === "poll" ? (
                        <PollCard message={m} own={own} myUid={user.uid} onVote={(idx) => voteOnPoll(m.id, idx)} isAdmin={isAdmin} onSeeVoters={() => openVoters(m)} />
                      ) : (
                        <div className={`rounded-2xl shadow-sm overflow-hidden ${own ? "text-white" : "bg-white text-slate-900"}`} style={own ? { backgroundColor: COLORS.primary } : {}}>
                          {m.attachment?.type === "image" && m.attachment.url && (
                            <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={m.attachment.url} alt="" className="w-full max-h-80 object-cover" loading="lazy" />
                            </a>
                          )}
                          {m.text && <p className="text-sm leading-snug break-words px-3 py-2 select-text"><Linkify>{m.text}</Linkify></p>}
                          {m.attachment && m.attachment.type !== "image" && (
                            <div className={`mx-3 mb-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-slate-100"}`}><AttIcon type={m.attachment.type} /><span className="text-[11px] font-semibold truncate">{m.attachment.name}</span></div>
                          )}
                        </div>
                      )}

                      <button onClick={() => startReply(m)} aria-label="Reply" title="Reply" className="text-slate-300 hover:text-slate-600 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><Reply className="w-3.5 h-3.5" /></button>
                      {(m.text || m.kind === "poll") && <button onClick={() => copyMsg(m)} aria-label="Copy message" title="Copy" className="text-slate-300 hover:text-slate-600 md:opacity-0 md:group-hover:opacity-100 transition-opacity">{copiedId === m.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}</button>}
                      {!own && isAdmin && <button onClick={() => togglePin(m)} className={`${m.pinned ? "text-orange-500" : "text-slate-300"} hover:text-orange-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity`}><Pin className="w-3.5 h-3.5" /></button>}
                      {isAdmin && <button onClick={() => delMsg(m.id)} aria-label="Delete message" className="text-slate-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>

                    <div className="flex items-center gap-2 mt-1 px-1">
                      <span className="text-[9px] text-slate-400">{formatTime(m.createdAt)}</span>
                      {own && isAdmin ? (
                        <button onClick={() => openSeen(m)} className="text-[9px] font-semibold text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline">· Seen by {seenN}</button>
                      ) : (own && seenN > 0 && (
                        <span className="text-[9px] font-semibold text-slate-500">· Seen by {seenN}</span>
                      ))}
                    </div>
                    {reactToMessage && (
                      <div className={`flex items-center gap-1 mt-1 ${own ? "flex-row-reverse" : ""}`}>
                        {REACTIONS.map(([key, emoji]) => {
                          const reax = m.reactions || {};
                          const count = Object.values(reax).filter((v) => v === key).length;
                          const mine = reax[user.uid] === key;
                          return (
                            <button key={key} onClick={() => reactToMessage(m.id, mine ? null : key)} aria-label={key} className={`text-[11px] leading-none px-1.5 py-1 rounded-full border transition-colors ${mine ? "border-transparent" : "border-slate-200 bg-white hover:bg-slate-50"} ${count ? "" : "opacity-60"}`} style={mine ? { backgroundColor: COLORS.accentSoft } : {}}>
                              {emoji}{count > 0 ? <span className="ml-0.5 font-semibold text-slate-600">{count}</span> : ""}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {pollOpen && (
            <div className="bg-white border-t border-slate-200 px-4 py-3 space-y-2">
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

          <div className="bg-white border-t border-slate-200">
            {replyTo && (
              <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100" style={{ backgroundColor: COLORS.accentSoft }}>
                <Reply className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.primary }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-slate-700">Replying to {replyTo.sender}</div>
                  <div className="text-[11px] text-slate-600 truncate">{replyTo.kind === "poll" ? `📊 ${replyTo.question}` : replyTo.text}</div>
                </div>
                <button onClick={cancelReply} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
            )}
            {isAdmin && pinOnSend && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Pin className="w-3 h-3" /> Next message will be pinned</div>}
            {isAdmin && announceMode && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Bell className="w-3 h-3" /> Posting as an announcement to the whole team</div>}
            <div className="p-3 flex items-center gap-2">
              <button onClick={() => photoInputRef.current?.click()} disabled={uploading} aria-label="Send photo" title="Send a photo" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-wait">
                {uploading ? <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }}
              />
              <button onClick={() => setPollOpen(!pollOpen)} aria-label="Create poll" title="Create poll" className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={pollOpen ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent } : { color: COLORS.textSecondary }}><BarChart3 className="w-4 h-4" /></button>
              {isAdmin && (
                <button onClick={() => setPinOnSend(!pinOnSend)} aria-label="Pin on send" title="Pin this message when sent" className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={pinOnSend ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent } : { color: COLORS.textSecondary }}><Pin className="w-4 h-4" /></button>
              )}
              {isAdmin && effectiveChannel === "team" && (
                <button onClick={() => setAnnounceMode(!announceMode)} aria-label="Announce" title="Post as an announcement" className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={announceMode ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent } : { color: COLORS.textSecondary }}><Bell className="w-4 h-4" /></button>
              )}
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={replyTo ? `Reply to ${replyTo.sender}…` : "Message the team…"} className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={send} disabled={!input.trim()} className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}><Send className="w-4 h-4" /></button>
            </div>
          </div>
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
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="How to do it — one step per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />

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

      {workouts.length === 0 ? (
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
  const [picker, setPicker] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false); // reveal %/RPE/tempo/superset editors

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => { onSave({ name, exercises }); setDirty(false); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, exercises, dirty]);

  const handleBack = () => {
    if (dirty && canEdit) onSave({ name, exercises });
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

      {view === "library" && <ExerciseLibrary items={mergedLib.items} loading={mergedLib.loading} err={mergedLib.err} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} canEdit={isAdmin} uid={user.uid} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} seedTeamWorkouts={seedTeamWorkouts} />}
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

const SettingsModal = ({ user, onClose, onSignOut, onReplayTour, onWhatsNew }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [photo, setPhoto] = useState(user.photoURL || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await downscaleToBlob(file, 640, 0.85);
      const path = `avatars/${user.uid}/${Date.now()}.jpg`;
      const r = storageRef(storage, path);
      const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, photoPath: path });
      setPhoto(url);
    } catch (e) {
      toast("Couldn't update photo — " + (e.message || "check Storage rules."));
    } finally {
      setPhotoBusy(false);
    }
  };
  const [pushOn, setPushOn] = useState(currentPermission() === "granted");
  const [pushBusy, setPushBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fbText, setFbText] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSent, setFbSent] = useState(false);
  const sendFeedback = async () => {
    const text = fbText.trim();
    if (!text) return;
    setFbBusy(true);
    try {
      await addDoc(collection(db, "feedback"), {
        text, fromUid: user.uid, fromName: user.name || "", fromEmail: user.email || "", role: user.role || "player", createdAt: serverTimestamp(),
      });
      setFbText(""); setFbSent(true);
    } catch (e) { toast("Couldn't send feedback — " + (e.message || "")); }
    finally { setFbBusy(false); }
  };

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
        await clearAllPushTokens(user.uid);
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
                    <div className="inline-block mt-1 text-[9px] font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md" style={user.role === "admin" ? { backgroundColor: COLORS.accent, color: COLORS.primary } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}>
                      {user.role === "admin" ? "Coach" : "Player"}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

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
          </section>

          {/* ABOUT */}
          {(onReplayTour || onWhatsNew) && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Help</h4>
              <div className="space-y-2">
                {onWhatsNew && (
                  <button onClick={onWhatsNew} className="w-full bg-slate-50 rounded-2xl p-4 text-left flex items-center justify-between hover:bg-slate-100">
                    <span className="text-sm font-semibold text-slate-900">What's new</span>
                    <span className="text-lg" aria-hidden="true">✨</span>
                  </button>
                )}
                {onReplayTour && (
                  <button onClick={onReplayTour} className="w-full bg-slate-50 rounded-2xl p-4 text-left flex items-center justify-between hover:bg-slate-100">
                    <span className="text-sm font-semibold text-slate-900">Replay the welcome tour</span>
                    <span className="text-lg" aria-hidden="true">🎟️</span>
                  </button>
                )}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">About</h4>
            <div className="bg-slate-50 rounded-2xl p-4 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">App</span><span className="font-semibold text-slate-900">Phoenix Bears TeamHub</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="font-mono text-[10px] text-slate-700">{APP_VERSION}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Domain</span><span className="font-mono text-[10px] text-slate-700">{APP_DOMAIN}</span></div>
            </div>
          </section>

          {/* SEND FEEDBACK */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Send feedback</h4>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] text-slate-600">Found a bug or have an idea? Tell us — it goes straight to the team.</p>
              <textarea value={fbText} onChange={(e) => { setFbText(e.target.value); setFbSent(false); }} rows={3} placeholder="What's working, what's not, what you'd want…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={sendFeedback} disabled={fbBusy || !fbText.trim()} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{fbBusy ? "Sending…" : fbSent ? "✓ Thanks — sent!" : "Send feedback"}</button>
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
  const [tab, setTab] = useState("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [trainView, setTrainView] = useState(null); // player Train sub-page: gym | nutrition | videos
  const [showTour, setShowTour] = useState(false);
  // Pop "What's New" once after an update: if a returning user's last-seen
  // version differs from the current one, show it. First-ever users (last-seen
  // null) don't get a changelog. Computed at mount so we never setState in an
  // effect; the seen version is recorded write-only in the effect below.
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => {
    try {
      const last = localStorage.getItem("lastSeenVersion");
      return !!(last && last !== APP_VERSION);
    } catch { return false; }
  });

  // Offer a refresh when a newer build is deployed while the app is open.
  const { updateReady, reload } = useAppUpdate();

  useEffect(() => {
    try { localStorage.setItem("lastSeenVersion", APP_VERSION); } catch { /* private mode */ }
  }, []);

  // First-login welcome tour. "Seen" is tracked per-device in localStorage, so
  // it auto-runs once and never nags again (no backend/rules change needed).
  // Bump the key suffix to re-show the tour to everyone after a big update.
  useEffect(() => {
    if (user && !localStorage.getItem(TOUR_SEEN_KEY)) setShowTour(true);
  }, [user]);
  const closeTour = () => { setShowTour(false); localStorage.setItem(TOUR_SEEN_KEY, "1"); };

  // If we're returning from a magic-link email, finish the sign-in.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let email = localStorage.getItem(EMAIL_FOR_SIGNIN_KEY);
    if (!email) email = window.prompt("Confirm the email this link was sent to:");
    if (!email) return;
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY);
        window.history.replaceState({}, "", "/");
      })
      .catch((e) => {
        console.error("email-link sign-in failed:", e);
        toast("Couldn't finish sign-in — " + (e.message || "link expired."));
      });
  }, []);

  // Deep-link to the right tab when arriving via ?tab=X or notification click.
  // Workouts/Nutrition/Videos no longer have their own tabs — route those to
  // the Train hub with the matching sub-view so old links keep working.
  const routeToTab = (t) => {
    if (["gym", "nutrition", "videos"].includes(t)) {
      setTrainView(t);
      setTab("train");
    } else {
      setTab(t);
    }
  };
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tab");
    if (fromQuery) {
      routeToTab(fromQuery);
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

  // Foreground messages — show a quick toast as a notification.
  useEffect(() => {
    if (!user) return;
    return onForegroundMessage((payload) => {
      const n = payload.notification || {};
      try {
        new Notification(n.title || "Phoenix Bears", { body: n.body, icon: "/brand/logo.png" });
      } catch { /* permission revoked since enable; ignore */ }
    });
  }, [user]);

  // Live from Firestore — see Build Guide §4 + §8
  const announcements = useCollection("announcements", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addAnnouncement = (title, body) =>
    addDoc(collection(db, "announcements"), {
      teamId: activeTeamId,
      title: title.trim(),
      body: (body || "").trim(),
      pinned: false,
      createdAt: serverTimestamp(),
    });

  // App-wide prompts (e.g. "everyone update your profile"). One doc per kind.
  const appConfig = useCollection("appConfig");
  const profilePrompt = appConfig.find((d) => d.id === "profilePrompt");
  // Team logo used as the centered watermark on every game-day line-up.
  const lineupLogo = appConfig.find((d) => d.id === "lineupLogo");
  const setLineupLogo = (url, path) =>
    setDoc(doc(db, "appConfig", "lineupLogo"), { url: url || "", path: path || "", updatedByName: user.name }, { merge: true });
  const requestProfileUpdate = async () => {
    await setDoc(doc(db, "appConfig", "profilePrompt"), { requestedAt: new Date().toISOString(), byName: user.name }, { merge: true });
    // Reuse the announcement fan-out so it also lands as a push to everyone.
    await addAnnouncement("Update your profile", "Please add your full name so the team roster shows who's who. Tap Update now or open Settings.");
  };
  const togglePinAnnouncement = (id, pinned) =>
    updateDoc(doc(db, "announcements", id), { pinned: !pinned });
  const updateAnnouncement = (id, { title, body }) =>
    updateDoc(doc(db, "announcements", id), { title: title.trim(), body: (body || "").trim() });
  const deleteAnnouncement = (id) => deleteDoc(doc(db, "announcements", id));

  const eventsRaw = useAudienceCollection("events", user, null, activeTeamId);
  const groupsList = useCollection("groups", where("teamId", "==", activeTeamId), orderBy("name"));
  // Admin-only view of signed-in players for the Groups picker. Defer the
  // listener until the user is known + actually an admin (rules deny otherwise).
  // Roster for the active team only (a coach picks players from their own
  // team; the org admin switches teams to see the others).
  const allUsers = useCollection(
    isCoach ? "users" : null,
    where("teamIds", "array-contains", activeTeamId),
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
      teamId: activeTeamId,
      audienceKeys: audienceKeysFor(r.visibleTo, groupsList),
      createdAt: serverTimestamp(),
      ...(notify ? {} : { notify: false }),
    }));
    await batch.commit();
  };

  // Personal events — own subcollection, never seen by others.
  const personalPath = user ? `users/${user.uid}/personalEvents` : null;
  const personalEvents = useCollection(personalPath);
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
    chatGroups.forEach((c) => {
      if ((c.visibleTo?.groupIds || []).includes(id)) {
        batch.update(doc(db, "chatGroups", c.id), { audienceKeys: audienceKeysFor(c.visibleTo, nextGroups) });
        n++;
      }
    });
    if (n) await batch.commit();
  };
  const deleteGroup = (id) => deleteDoc(doc(db, "groups", id));

  const videos = useCollection("videos", orderBy("createdAt", "desc"));
  const addVideo = (data) =>
    addDoc(collection(db, "videos"), { ...data, createdAt: serverTimestamp() });
  const updateVideo = (id, data) => updateDoc(doc(db, "videos", id), data);
  const deleteVideo = (id) => deleteDoc(doc(db, "videos", id));
  const importVideos = async (rows) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "videos")), { ...r, createdAt: serverTimestamp() }));
    await batch.commit();
  };

  // Drill library — building blocks for the Practice page (same CRUD as videos).
  const drills = useCollection("drills", orderBy("createdAt", "desc"));
  const addDrill = (data) =>
    addDoc(collection(db, "drills"), { ...data, createdAt: serverTimestamp() });
  const updateDrill = (id, data) => updateDoc(doc(db, "drills", id), data);
  const deleteDrill = (id) => deleteDoc(doc(db, "drills", id));

  // Practices — saved sessions assembled from drills (mirrors teamWorkouts).
  const practices = useCollection("practices", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
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
  const programs = useCollection("programs", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
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
  const lineups = useCollection("lineups", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addLineup = (data) =>
    addDoc(collection(db, "lineups"), {
      teamId: activeTeamId,
      name: (data?.name || "").trim(), formation: data?.formation || "", slots: data?.slots || [],
      createdByName: user.name, createdAt: serverTimestamp(),
    });
  const updateLineup = (id, data) => updateDoc(doc(db, "lineups", id), data);
  const deleteLineup = (id) => deleteDoc(doc(db, "lineups", id));
  // A coach can set a photo on any player's profile. The image lives in the
  // coach's own avatars folder (Storage only lets you write your own), and the
  // URL is stored on the target user doc (admins may edit any user doc).
  const setPlayerPhoto = async (targetUid, url, path) =>
    updateDoc(doc(db, "users", targetUid), { photoURL: url, photoPath: path });

  // Coach-authored exercises — mixed into the public Exercise Library, same
  // shape so they slot under the same equipment/muscle tags.
  const customExercises = useCollection("customExercises", orderBy("createdAt", "desc"));
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

  const recipeDocs = useCollection("recipes", orderBy("createdAt", "desc"));
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

  const categoryDocs = useCollection("categories", orderBy("name"));
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
  const today = new Date().toISOString().slice(0, 10);
  const wellnessRaw = useCollection("wellnessCheckins", where("teamId", "==", activeTeamId), where("date", "==", today));
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
  const logged = useCollection(logsPath, orderBy("createdAt", "desc"));
  const addLog = async (data) => {
    const ref = await addDoc(collection(db, logsPath), { ...data, createdAt: serverTimestamp() });
    // Bump the activity marker so coach compliance view sees this player today.
    setDoc(doc(db, "mealLogActivity", `${user.uid}_${today}`), {
      teamId: activeTeamId,
      uid: user.uid,
      date: today,
      lastLoggedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return ref;
  };
  const updateLog = (id, data) =>
    updateDoc(doc(db, logsPath, id), data);
  const deleteLog = (id) => deleteDoc(doc(db, logsPath, id));

  // Saved / favorite foods — private per player, for one-tap re-logging.
  const savedFoodsPath = user ? `logs/${user.uid}/savedFoods` : null;
  const savedFoods = useCollection(savedFoodsPath, orderBy("createdAt", "desc"));
  const addSavedFood = (data) =>
    addDoc(collection(db, savedFoodsPath), { ...data, createdAt: serverTimestamp() });
  const deleteSavedFood = (id) => deleteDoc(doc(db, savedFoodsPath, id));

  // Water tracking — one doc per player per day.
  const waterDocId = user ? `${user.uid}_${today}` : null;
  const waterToday = useCollection(
    user ? "water" : null,
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
  // and it lives in their private food-log area (logs/{uid}/goal). The Today
  // page and the nutrition hero only ever show the player their own goal.
  const myNutritionGoal = useDoc(user ? `logs/${user.uid}/goal` : null);
  const saveMyNutritionGoal = ({ cal, protein }) =>
    setDoc(doc(db, "logs", user.uid, "goal"), {
      cal: Number(cal) || 0,
      protein: Number(protein) || 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  const clearMyNutritionGoal = () => deleteDoc(doc(db, "logs", user.uid, "goal"));
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
    isCoach ? "mealLogActivity" : null,
    where("teamId", "==", activeTeamId),
    where("date", "==", today),
  );

  // Player "Today" completion signals — scoped to the current user so the
  // queries satisfy the per-owner read rules.
  const myWellnessDocs = useCollection(
    user ? "wellnessCheckins" : null,
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
  const documents = useCollection("documents", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addDocument = async ({ title, file }) => {
    if (!file) throw new Error("No file selected.");
    const path = `documents/${activeTeamId}/${user.uid}/${Date.now()}-${file.name}`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(snap.ref);
    return addDoc(collection(db, "documents"), {
      teamId: activeTeamId,
      title: (title || "").trim() || file.name,
      url, path, name: file.name || "", fileType: file.type || "",
      createdByName: user.name, signatures: [], createdAt: serverTimestamp(),
    });
  };
  const deleteDocument = (id) => deleteDoc(doc(db, "documents", id));
  const signDocument = (id, name) =>
    updateDoc(doc(db, "documents", id), { signatures: arrayUnion({ uid: user.uid, name, ts: new Date().toISOString() }) });



  // Roster (invite gate) — admin manages, useAuth reads on first signup.
  // Two ways in, both team-specific:
  //  - Email invites (below): the coach adds an email to invitedEmails for
  //    one team; useAuth reads it at first sign-in.
  //  - Invite LINKS (decision 2026-11-08): a coach generates a link for ONE
  //    team and shares it; a player signing up via that link lands on that
  //    team (useAuth redeems ?invite=CODE at first sign-in). The doc id IS
  //    the code (a random token = the capability); shape documented in
  //    src/data/teams.js, rules in firestore.rules.
  const invites = useCollection("invitedEmails", where("teamId", "==", activeTeamId), orderBy("email"));
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
  const inviteLinks = useCollection("inviteLinks", where("teamId", "==", activeTeamId));
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

  // Workouts — personal (private subcollection) + team-published
  const myWorkoutsPath = user ? `users/${user.uid}/workouts` : null;
  const myWorkouts = useCollection(myWorkoutsPath, orderBy("updatedAt", "desc"));
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

  const teamWorkouts = useCollection("teamWorkouts", where("teamId", "==", activeTeamId), orderBy("updatedAt", "desc"));
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
  const messages = useAudienceCollection("messages", user, "createdAt", activeTeamId);
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
      isCoach: user.role === "admin",
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
      data.votes = {};
    }
    return addDoc(collection(db, "messages"), data);
  };
  // Post a rendered line-up card (image blob) into a chat channel — "team" or
  // any chatGroup id. Reuses the chat image pipeline so it lands in the feed
  // exactly like a shared photo.
  const postLineupImage = async (blob, channel, name) => {
    const ch = channel || "team";
    const chDoc = ch !== "team" ? chatGroups.find((c) => c.id === ch) : null;
    const path = `chat/${chDoc?.teamId || activeTeamId}/${ch}/${user.uid}/${Date.now()}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    await addMessage(name ? `Starting XI · ${name}` : "Starting XI", {
      attachment: { type: "image", url, path, name: `${(name || "lineup").replace(/[^\w\s-]/g, "").trim() || "lineup"}.jpg` },
      channel: ch,
    });
  };
  const togglePinMessage = (id, pinned) =>
    updateDoc(doc(db, "messages", id), { pinned: !pinned });
  const deleteMessage = (id) => deleteDoc(doc(db, "messages", id));
  const markMessagesRead = async (ids) => {
    if (!ids?.length) return;
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, "messages", id), {
        [`readBy.${user.uid}`]: serverTimestamp(),
      });
    });
    await batch.commit();
  };
  const voteOnPoll = (messageId, optionIndex) =>
    updateDoc(doc(db, "messages", messageId), {
      [`votes.${user.uid}`]: optionIndex,
    });
  // React to a message (👍/👎/❤️). Passing a falsy reaction clears it (toggle).
  const reactToMessage = (messageId, reaction) =>
    updateDoc(doc(db, "messages", messageId), {
      [`reactions.${user.uid}`]: reaction || deleteField(),
    });

  // Chat channels ("group chats") — admin creates, sets who can see each one.
  // Empty visibleTo = everyone. `audienceKeys` enforces this server-side.
  const chatGroups = useAudienceCollection("chatGroups", user, "createdAt", activeTeamId);
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
    const channelMessages = messages.filter((m) => m.channel === id);
    for (let i = 0; i < channelMessages.length; i += 400) {
      const batch = writeBatch(db);
      channelMessages.slice(i, i + 400).forEach((m) => batch.update(doc(db, "messages", m.id), { audienceKeys }));
      await batch.commit();
    }
    await updateDoc(doc(db, "chatGroups", id), { visibleTo, audienceKeys });
  };

  // Scheduled reminders + polls — coach queues them; a Cloud Function fires
  // each at its sendAt time (see functions/index.js runScheduled).
  const scheduled = useCollection(isCoach ? "scheduled" : null, where("teamId", "==", activeTeamId), orderBy("sendAt"));
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

  // Custom push notifications — coach sends one now (via the callable Cloud
  // Function, out immediately) or schedules it (stored in `pushNotifications`
  // for the `runScheduled` runner, which also handles the daily wellness
  // auto-nudge). Team-scoped, same audience pattern as announcements.
  const pushNotifications = useCollection(isCoach ? "pushNotifications" : null, where("teamId", "==", activeTeamId), orderBy("sendAt", "desc"));
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
  const sendPushNotificationNow = async ({ title, body, audienceKeys, visibleTo }) => {
    const sendPush = httpsCallable(getFunctions(), "sendPushNotification");
    await sendPush({ teamId: activeTeamId, title, body, audienceKeys, visibleTo });
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
    user && user.role !== "orgAdmin" ? "dms" : null,
    where("teamId", "==", activeTeamId),
    ...(isTeamCoach ? [] : [where("threadId", "==", user?.uid || "_")]),
  );
  const addDM = (text, threadId) =>
    addDoc(collection(db, "dms"), {
      teamId: activeTeamId,
      threadId,
      senderUid: user.uid,
      senderName: user.name,
      isCoach: user.role === "admin",
      text: (text || "").trim(),
      readBy: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    });
  // Mark DM messages read (readBy only — same pattern as channel messages).
  const markDMsRead = async (ids) => {
    if (!ids?.length) return;
    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.update(doc(db, "dms", id), {
        [`readBy.${user.uid}`]: serverTimestamp(),
      });
    });
    await batch.commit();
  };

  // Quote of the Day — latest coach-posted quote; posting one fans out a push.
  const quotes = useCollection("quotes", where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
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

  const [checkin, setCheckin] = useState({ energy: 0, soreness: 0, tiredness: 0 });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}>
        <div className="text-white/70 text-sm font-medium">Loading…</div>
      </div>
    );
  }
  if (!user) return <LoginScreen externalError={authError} clearExternalError={clearError} />;

  // Force a real first+last name before using the app (auto name = email prefix).
  const emailPrefix = (user.email || "").split("@")[0];
  const needsProfile = !user.name || user.name.trim() === emailPrefix || !user.name.trim().includes(" ");
  if (needsProfile) return <NameGate user={user} onDone={() => window.location.reload()} />;

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
      className="min-h-screen min-h-dvh flex justify-center relative"
      style={{
        backgroundImage: "url('/brand/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundColor: COLORS.primary,
      }}
    >
      <Toaster />
      {/* Navy tint so the photo reads as ambient brand wallpaper, not busy. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `${COLORS.primary}D9` }}
      />
      {/* Fixed-inset app shell: a definite viewport height (top/bottom 0) that
          iOS lays out reliably — a flex column with an internal-scroll <main>
          and an in-flow bottom nav that can't scroll away. Centered without a
          transform so full-screen `fixed inset-0` modals still cover the page. */}
      <div className="w-full max-w-md shadow-2xl flex flex-col z-10" style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, margin: "0 auto", maxWidth: "28rem", backgroundColor: COLORS.bg }}>
        {updateReady && <UpdateBanner onReload={reload} color={COLORS.primary} />}
        <Header title={title} user={effUser} onAvatarClick={() => setSettingsOpen(true)} onPreview={() => { setPreviewAsPlayer(true); setTab("home"); }} />
        {canSeeMultipleTeams && <TeamSwitcher teams={visibleTeams} activeTeamId={activeTeamId} onSelect={setPreferredTeamId} />}
        {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} onSignOut={() => signOut(auth)} onReplayTour={() => { setSettingsOpen(false); setShowTour(true); }} onWhatsNew={() => { setSettingsOpen(false); setWhatsNewOpen(true); }} />}
        {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} accent={COLORS.accent} soft={COLORS.accentSoft} />}
        <WelcomeTour open={showTour} role={effUser.role} onClose={closeTour} />
        {previewAsPlayer && realIsAdmin && (
          <button onClick={() => setPreviewAsPlayer(false)} className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>
            <Eye className="w-3.5 h-3.5" /> Viewing as a player — tap to exit
          </button>
        )}
        <main className="flex-1 min-h-0 overflow-y-auto pb-4">
          {activeTab === "home" && effUser.role === "admin" && <HomePage user={effUser} isOrgAdmin={user.role === "orgAdmin"} practices={practices} announcements={announcements} addAnnouncement={addAnnouncement} updateAnnouncement={updateAnnouncement} togglePinAnnouncement={togglePinAnnouncement} deleteAnnouncement={deleteAnnouncement} events={events} checkin={checkin} setCheckin={setCheckin} wellness={wellness} submitWellness={submitWellness} invites={invites} addInvite={addInvite} removeInvite={removeInvite} addInvitesBatch={addInvitesBatch} setInviteRole={setInviteRole} inviteLinks={inviteLinks} addInviteLink={addInviteLink} removeInviteLink={removeInviteLink} mealLogActivityToday={mealLogActivityToday} documents={documents} addDocument={addDocument} deleteDocument={deleteDocument} signDocument={signDocument} allUsers={allUsers} requestProfileUpdate={requestProfileUpdate} pushNotifications={pushNotifications} addPushNotification={addPushNotification} deletePushNotification={deletePushNotification} sendPushNotificationNow={sendPushNotificationNow} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} />}
          {activeTab === "home" && effUser.role !== "admin" && <PlayerTodayPage user={effUser} events={events} announcements={announcements} checkin={checkin} setCheckin={setCheckin} submitWellness={submitWellness} wellnessLoggedToday={wellnessLoggedToday} myWellness={myWellnessToday} loggedToday={loggedToday} waterCups={waterCups} setWaterCups={setWaterCups} documents={documents} signDocument={signDocument} onOpenTrain={(v) => { setTrainView(v); setTab("train"); }} onOpenSchedule={() => setTab("calendar")} practices={practices} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} nutritionTarget={myNutritionGoal} nutritionTotals={myNutritionTotals} profilePrompt={profilePrompt} onOpenProfile={() => setSettingsOpen(true)} />}
          {activeTab === "train" && (
            trainView ? (
              <div>
                <div className="px-5 pt-4 pb-1"><button onClick={() => setTrainView(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Train</button></div>
                {trainView === "gym" && <GymPage user={effUser} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} deleteMyWorkout={deleteMyWorkout} teamWorkouts={teamWorkouts} addTeamWorkout={addTeamWorkout} updateTeamWorkout={updateTeamWorkout} deleteTeamWorkout={deleteTeamWorkout} customExercises={customExercises} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} seedTeamWorkouts={seedTeamWorkouts} />}
                {trainView === "nutrition" && <NutritionPage user={effUser} recipes={recipes} addRecipe={addRecipe} updateRecipe={updateRecipe} deleteRecipe={deleteRecipe} importRecipes={importRecipes} seedRecipes={seedRecipes} categories={categories} addCategory={addCategory} logged={logged} addLog={addLog} updateLog={updateLog} deleteLog={deleteLog} waterCups={waterCups} setWaterCups={setWaterCups} myNutritionGoal={myNutritionGoal} myNutritionTotals={myNutritionTotals} saveMyNutritionGoal={saveMyNutritionGoal} clearMyNutritionGoal={clearMyNutritionGoal} savedFoods={savedFoods} addSavedFood={addSavedFood} deleteSavedFood={deleteSavedFood} />}
                {trainView === "videos" && <VideosPage user={effUser} videos={videos} addVideo={addVideo} updateVideo={updateVideo} deleteVideo={deleteVideo} importVideos={importVideos} />}
              </div>
            ) : <TrainHub onPick={setTrainView} />
          )}
          {activeTab === "practice" && effUser.role === "admin" && (
            <CoachCenterPage
              practiceProps={{ user: effUser, drills, addDrill, updateDrill, deleteDrill, practices, addPractice, updatePractice, deletePractice, programs, addProgram, updateProgram, deleteProgram, importEvents, events }}
              gameDayProps={{ user: effUser, lineups, addLineup, updateLineup, deleteLineup, allUsers, invites, chatGroups, postLineupImage, setPlayerPhoto, lineupLogo: lineupLogo?.url || "", setLineupLogo, teamShortName: getTeamShortName(activeTeamId) }}
              rosterProps={{ user: effUser, isOrgAdmin: user.role === "orgAdmin", invites, addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks, addInviteLink, removeInviteLink, allUsers, requestProfileUpdate, activeTeamId }}
              calendarProps={{ user: effUser, events, practices, teamWorkouts, personalEvents, addEvent, updateEvent, addPersonalEvent, updatePersonalEvent, deleteEvent, deletePersonalEvent, importEvents, groups: groupsList, addGroup, updateGroupMembers, deleteGroup, invites, allUsers, chatGroups }}
              documentsProps={{ user: effUser, documents, rosterCount: invites.filter((i) => i.role !== "admin").length, onUpload: addDocument, onDelete: deleteDocument, onSign: signDocument }}
              announcementsProps={{ announcements, addAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement }}
            />
          )}
          {activeTab === "calendar" && <CalendarPage user={effUser} events={events} practices={practices} teamWorkouts={teamWorkouts} personalEvents={personalEvents} addEvent={addEvent} updateEvent={updateEvent} addPersonalEvent={addPersonalEvent} updatePersonalEvent={updatePersonalEvent} deleteEvent={deleteEvent} deletePersonalEvent={deletePersonalEvent} importEvents={importEvents} groups={groupsList} addGroup={addGroup} updateGroupMembers={updateGroupMembers} deleteGroup={deleteGroup} invites={invites} allUsers={allUsers} chatGroups={chatGroups} />}
          {activeTab === "messages" && <MessagesPage user={effUser} activeTeamId={activeTeamId} isOrgAdmin={user.role === "orgAdmin"} allUsers={allUsers} messages={messages} addMessage={addMessage} togglePinMessage={togglePinMessage} deleteMessage={deleteMessage} markMessagesRead={markMessagesRead} voteOnPoll={voteOnPoll} reactToMessage={reactToMessage} rosterCount={invites.length} chatGroups={chatGroups} addChatGroup={addChatGroup} deleteChatGroup={deleteChatGroup} updateChatGroup={updateChatGroup} onPinChannel={pinChatGroup} groups={groupsList} invites={invites} announcements={announcements} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} dms={dms} addDM={addDM} markDMsRead={markDMsRead} scheduled={scheduled} addScheduled={addScheduled} deleteScheduled={deleteScheduled} />}
        </main>
        <nav className="flex-shrink-0 w-full bg-white border-t border-slate-200 z-20" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
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
  );
}
