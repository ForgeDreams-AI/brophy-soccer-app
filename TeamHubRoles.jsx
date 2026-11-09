import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Home, Calendar as CalendarIcon, Video, Apple, MessageCircle,
  Pin, Clock, MapPin, Plus, X, Trash2, Send, Paperclip,
  ShoppingCart, Check, Droplet, Flame, User, Shield, Lock, Play,
  Link as LinkIcon, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Wind, Activity, Dumbbell, Snowflake, StretchHorizontal, FileText,
  Image as ImageIcon, Mail, ArrowRight, Layers,
} from "lucide-react";

/* ──────────────────────────────────────────────
   THEME
   ────────────────────────────────────────────── */
const COLORS = {
  primary: "#0F2C4D", accent: "#FF6B35", accentSoft: "#FFE7DC",
  success: "#00B27A", bg: "#F8F9FB", border: "#E2E8F0", textSecondary: "#64748B",
};
const COACH_EMAIL = "coach@coachcameron.com";

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
  { name: "Maya Patel", initials: "MP", feeling: 4, soreness: 2, tiredness: 2, time: "8:10 AM" },
  { name: "Alex Chen", initials: "AC", feeling: 2, soreness: 4, tiredness: 4, time: "7:52 AM" },
  { name: "Devin Wallace", initials: "DW", feeling: 5, soreness: 1, tiredness: 2, time: "9:01 AM" },
  { name: "Sam Okafor", initials: "SO", feeling: 3, soreness: 3, tiredness: 3, time: "8:34 AM" },
  { name: "Riley Brooks", initials: "RB", feeling: 4, soreness: 2, tiredness: 3, time: "8:20 AM" },
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
   LOGIN  (real app → Firebase Auth, email/password + Google)
   ────────────────────────────────────────────── */
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!email.includes("@") || !pw.trim()) { setErr("Enter your email and password."); return; }
    const e = email.trim().toLowerCase();
    if (e === COACH_EMAIL) {
      onLogin({ name: "Coach Cameron", initials: "CC", role: "admin", sub: "Head Coach" });
    } else {
      const local = e.split("@")[0];
      const name = local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      onLogin({ name, initials, role: "player", sub: "Player · Varsity" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: COLORS.primary }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: COLORS.accent }}>
            <span className="text-white font-black text-lg">TH</span>
          </div>
          <h1 className="text-white font-black text-3xl tracking-tight">Welcome</h1>
          <p className="text-white/50 text-xs mt-1.5 font-medium tracking-wide">app.coachcameron.com</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()}
              type="email" placeholder="Email" autoComplete="email"
              className="w-full bg-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()}
              type="password" placeholder="Password" autoComplete="current-password"
              className="w-full bg-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          {err && <p className="text-red-300 text-xs font-medium px-1">{err}</p>}
          <button onClick={submit} className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 hover:opacity-90" style={{ backgroundColor: COLORS.accent }}>
            Sign In <ArrowRight className="w-4 h-4" />
          </button>
          <button className="w-full py-3 rounded-xl font-bold text-sm bg-white text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50">
            <span className="text-base font-black" style={{ color: "#4285F4" }}>G</span> Continue with Google
          </button>
        </div>

        <div className="mt-6 bg-white/10 rounded-xl p-3">
          <p className="text-white/70 text-[11px] leading-relaxed">
            <span className="font-bold text-white/90">Demo logins</span> (any password):<br />
            • Coach view → <span className="font-mono">{COACH_EMAIL}</span><br />
            • Player view → any other email (e.g. <span className="font-mono">jordan@team.com</span>)
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── shared bits ── */
const Header = ({ title, user, onLogout }) => (
  <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}>
        <span className="text-white font-black text-xs">TH</span>
      </div>
      <div>
        <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 leading-none">TEAM HUB</div>
        <h1 className="text-base font-bold text-slate-900 leading-tight">{title}</h1>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {user.role === "admin" && (
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}>
          <Shield className="w-2.5 h-2.5" /> Admin
        </span>
      )}
      <button onClick={onLogout} aria-label="Log out" className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: COLORS.accent }}>
        {user.initials}
      </button>
    </div>
  </header>
);

const ReadOnlyHint = ({ label }) => (
  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> {label}</span>
);

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

/* ─── HOME ─── */
const HomePage = ({ user, announcements, setAnnouncements, events, checkin, setCheckin, wellness, setWellness }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [saved, setSaved] = useState(false);
  const [openPlayer, setOpenPlayer] = useState(null);
  const isAdmin = user.role === "admin";

  const now = new Date("2026-06-06T12:00:00");
  const nextEvent = useMemo(() => {
    return [...events]
      .filter((e) => new Date(e.date + "T" + e.start) >= now)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  }, [events]);

  const add = () => {
    if (!form.title.trim()) return;
    setAnnouncements([{ id: `a${Date.now()}`, title: form.title, body: form.body, ts: "just now", pinned: false }, ...announcements]);
    setForm({ title: "", body: "" }); setAdding(false);
  };
  const togglePin = (id) => setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)));
  const del = (id) => setAnnouncements(announcements.filter((a) => a.id !== id));
  const sorted = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const setMetric = (k, v) => { setCheckin({ ...checkin, [k]: v }); setSaved(false); };
  const submitCheckin = () => {
    if (!checkin.feeling || !checkin.soreness || !checkin.tiredness) return;
    setWellness([{ name: user.name, initials: user.initials, feeling: checkin.feeling, soreness: checkin.soreness, tiredness: checkin.tiredness, time: "just now" }, ...wellness.filter((w) => w.name !== user.name)]);
    setSaved(true);
  };

  const avg = (k) => (wellness.length ? wellness.reduce((s, w) => s + w[k], 0) / wellness.length : 0);
  const bars = (value, color) => (
    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: n <= value ? color : COLORS.border }} />)}</div>
  );
  const METRICS = [["feeling", "Energy", COLORS.success], ["soreness", "Soreness", COLORS.accent], ["tiredness", "Tiredness", "#8b5cf6"]];

  const greeting = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Saturday, June 6</p>
      <h2 className="text-2xl font-bold text-slate-900 mt-1">Welcome,<br /><span style={{ color: COLORS.primary }}>{user.name.split(" ")[0]}.</span></h2>
    </div>
  );

  const nextUpSection = (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Next Up</h3>
      {nextEvent ? (
        <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #1a4378)` }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">{nextEvent.type}</span>
            <span className="text-xs font-semibold opacity-90">{new Date(nextEvent.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
          <h4 className="text-lg font-bold leading-tight">{nextEvent.title}</h4>
          <div className="flex items-center gap-4 mt-2 text-xs opacity-90">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{nextEvent.start}–{nextEvent.end}</span>
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
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Overall energy</div><Scale value={checkin.feeling} onChange={(v) => setMetric("feeling", v)} lowLabel="Rough" highLabel="Great" /></div>
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Soreness</div><Scale value={checkin.soreness} onChange={(v) => setMetric("soreness", v)} lowLabel="None" highLabel="Very sore" /></div>
        <div><div className="text-xs font-semibold text-slate-700 mb-1.5">Tiredness</div><Scale value={checkin.tiredness} onChange={(v) => setMetric("tiredness", v)} lowLabel="Fresh" highLabel="Exhausted" /></div>
      </div>
      <button onClick={submitCheckin} disabled={!checkin.feeling || !checkin.soreness || !checkin.tiredness}
        className="w-full mt-3 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.accent }}>
        Submit Check-in
      </button>
      <p className="text-[10px] text-slate-400 mt-2 text-center">Your coach sees the team's daily readiness.</p>
    </section>
  );

  const announcementsSection = (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-slate-900">Announcements</h3>
        {isAdmin ? (
          <button onClick={() => setAdding(!adding)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.accent }}><Plus className="w-3 h-3" /> Post</button>
        ) : <ReadOnlyHint label="Posted by your coach" />}
      </div>
      {isAdmin && adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-3 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Details…" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2"><button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Post to Team</button></div>
        </div>
      )}
      <ul className="space-y-2.5">
        {sorted.map((a) => (
          <li key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">{a.pinned && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.accent }} />}<h4 className="font-semibold text-slate-900 text-sm">{a.title}</h4></div>
                <p className="text-xs text-slate-500 leading-snug">{a.body}</p><span className="text-[10px] text-slate-400 font-medium">{a.ts}</span>
              </div>
              {isAdmin && <div className="flex flex-col gap-1.5"><button onClick={() => togglePin(a.id)} className="text-slate-300 hover:text-orange-500"><Pin className="w-4 h-4" /></button><button onClick={() => del(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  const playersSection = (
    <section>
      <h3 className="text-base font-bold text-slate-900 mb-3">Players</h3>
      <div className="rounded-2xl p-4 mb-3 border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm text-slate-900">Team Readiness</h4>
          <span className="text-[10px] text-slate-400 font-medium">{wellness.length} checked in today</span>
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
      </div>
      <ul className="space-y-2">
        {wellness.length === 0 && <p className="text-sm text-slate-400 italic">No check-ins yet today.</p>}
        {wellness.map((w) => {
          const flag = w.soreness >= 4 || w.tiredness >= 4;
          const open = openPlayer === w.name;
          return (
            <li key={w.name} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <button onClick={() => setOpenPlayer(open ? null : w.name)} className="w-full p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: flag ? COLORS.accent : "#94a3b8" }}>{w.initials}</div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">{w.name}{flag && <span className="text-[8px] font-bold uppercase tracking-wider text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: COLORS.accent }}>Monitor</span>}</div>
                  <div className="text-[10px] text-slate-500">Energy {w.feeling} · Soreness {w.soreness} · Tired {w.tiredness} · {w.time}</div>
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
    </section>
  );

  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      {greeting}
      {nextUpSection}
      {isAdmin ? (<>{announcementsSection}{playersSection}</>) : (<>{checkinSection}{announcementsSection}</>)}
    </div>
  );
};

/* ─── CALENDAR ─── */
const CalendarPage = ({ user, events, setEvents }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", date: "2026-06-11", start: "15:00", end: "17:00", location: "", type: "Practice" });
  const isAdmin = user.role === "admin";
  const add = () => { if (!form.title.trim()) return; setEvents([...events, { ...form, id: `e${Date.now()}` }]); setForm({ title: "", date: "2026-06-11", start: "15:00", end: "17:00", location: "", type: "Practice" }); setAdding(false); };
  const del = (id) => setEvents(events.filter((e) => e.id !== id));
  const grouped = useMemo(() => { const s = [...events].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); return s.reduce((acc, e) => ((acc[e.date] = acc[e.date] || []).push(e), acc), {}); }, [events]);

  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">Schedule</h3>
        {isAdmin ? <button onClick={() => setAdding(!adding)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.accent }}><Plus className="w-3 h-3" /> Add Event</button> : <ReadOnlyHint label="Coach sets the schedule" />}
      </div>
      {isAdmin && adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">{Object.keys(EVENT_STYLE).map((t) => <option key={t}>{t}</option>)}</select>
            <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2"><button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Add to Calendar</button></div>
        </div>
      )}
      {Object.entries(grouped).map(([date, evs]) => (
        <div key={date}>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h4>
          <ul className="space-y-2">
            {evs.map((ev) => (
              <li key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1"><span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${EVENT_STYLE[ev.type]}`}>{ev.type}</span><span className="text-xs font-semibold text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" />{ev.start}–{ev.end}</span></div>
                    <h4 className="font-bold text-slate-900 text-sm">{ev.title}</h4>
                    {ev.location && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</p>}
                  </div>
                  {isAdmin && <button onClick={() => del(ev.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

/* ─── VIDEOS (categorized library, original style) ─── */
const VideosPage = ({ user, videos, setVideos }) => {
  const [cat, setCat] = useState("Film");
  const [adding, setAdding] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: "", url: "", cat: "Film", dur: "", diff: "Easy", desc: "", type: "video" });
  const isAdmin = user.role === "admin";
  const filtered = videos.filter((v) => v.cat === cat);
  const add = () => { if (!form.title.trim()) return; setVideos([{ ...form, id: `v${Date.now()}` }, ...videos]); setForm({ title: "", url: "", cat: "Film", dur: "", diff: "Easy", desc: "", type: "video" }); setAdding(false); };
  const del = (id) => setVideos(videos.filter((v) => v.id !== id));

  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">Videos & Links</h3>
        {isAdmin ? <button onClick={() => setAdding(!adding)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.accent }}><Plus className="w-3 h-3" /> Upload</button> : <ReadOnlyHint label="Coach uploads film & drills" />}
      </div>

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="YouTube / Vimeo / link URL" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-3 gap-2">
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{VIDEO_CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <input value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} placeholder="Duration" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <select value={form.diff} onChange={(e) => setForm({ ...form, diff: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{["Easy", "Medium", "Hard"].map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Short description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2"><button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Publish</button></div>
        </div></div>
      )}

      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {VIDEO_CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
        </div>
      </div>

      <div className="px-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{cat}</h3>
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
                  </button>
                  {isAdmin && <button onClick={() => del(v.id)} className="absolute top-3 right-3 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Workout plans */}
      <div className="px-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <button onClick={() => setShowPlans(!showPlans)} className="w-full p-4 flex items-center justify-between">
            <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-slate-500" /><h3 className="font-bold text-sm text-slate-900">Workout Plans</h3></div>
            {showPlans ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showPlans && <ul className="border-t border-slate-100">{workoutPlans.map((p) => (
            <li key={p.id} className="border-b border-slate-100 last:border-0"><div className="flex items-center justify-between p-4"><div><div className="font-semibold text-sm text-slate-900">{p.title}</div><div className="text-xs text-slate-500">{p.dur}</div></div><LinkIcon className="w-4 h-4 text-slate-300" /></div></li>
          ))}</ul>}
        </div>
      </div>

      {modal && <VideoModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
};

const VideoModal = ({ item, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="p-5 flex items-start justify-between border-b border-slate-100">
        <div className="flex-1 pr-2"><span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{item.cat}</span><h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{item.title}</h3></div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="aspect-video rounded-2xl bg-slate-900 flex items-center justify-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.accent }}><Play className="w-6 h-6 text-white fill-white ml-1" /></div>
          <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded">{item.dur}</div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
        <div className="flex gap-4 text-xs"><div><div className="text-slate-400 uppercase font-bold tracking-wider">Duration</div><div className="font-bold text-slate-900 mt-1">{item.dur}</div></div><div><div className="text-slate-400 uppercase font-bold tracking-wider">Difficulty</div><div className="font-bold text-slate-900 mt-1">{item.diff}</div></div></div>
      </div>
    </div>
  </div>
);

/* ─── NUTRITION (log presets + custom food + post-meal rating) ─── */
const NutritionPage = ({ user, recipes, setRecipes, categories, setCategories, logged, setLogged }) => {
  const isAdmin = user.role === "admin";
  const [cat, setCat] = useState(categories[0] || "Breakfast");
  const [sub, setSub] = useState(null);
  const [manual, setManual] = useState({ name: "", cal: "", p: "" });
  const [showManual, setShowManual] = useState(false);
  // admin recipe management
  const [mode, setMode] = useState("single");
  const [single, setSingle] = useState({ name: "", cat: categories[0] || "Breakfast", cal: "", p: "", c: "", f: "", prep: "" });
  const [csvText, setCsvText] = useState("");
  const [newCat, setNewCat] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const filtered = recipes.filter((m) => m.cat === cat);
  const totals = logged.reduce((a, l) => ({ cal: a.cal + (l.cal || 0), p: a.p + (l.p || 0) }), { cal: 0, p: 0 });

  const log = (m) => setLogged([{ ...m, logId: `lg${Date.now()}`, time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), feeling: null }, ...logged]);
  const addManual = () => { if (!manual.name.trim()) return; setLogged([{ name: manual.name.trim(), cal: Number(manual.cal) || 0, p: Number(manual.p) || 0, logId: `lg${Date.now()}`, time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), feeling: null, custom: true }, ...logged]); setManual({ name: "", cal: "", p: "" }); setShowManual(false); };
  const rate = (logId, feeling) => setLogged(logged.map((l) => (l.logId === logId ? { ...l, feeling } : l)));
  const removeLog = (logId) => setLogged(logged.filter((l) => l.logId !== logId));

  const addSingle = () => {
    if (!single.name.trim()) return;
    setRecipes([{ id: `r${Date.now()}`, name: single.name.trim(), cat: single.cat, cal: Number(single.cal) || 0, p: Number(single.p) || 0, c: Number(single.c) || 0, f: Number(single.f) || 0, prep: single.prep || "—" }, ...recipes]);
    if (!categories.includes(single.cat)) setCategories([...categories, single.cat]);
    setImportMsg(`Added "${single.name.trim()}" to ${single.cat}.`);
    setSingle({ name: "", cat: single.cat, cal: "", p: "", c: "", f: "", prep: "" });
  };
  const addCategory = () => {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    setCategories([...categories, c]);
    setImportMsg(`Added category "${c}".`);
    setNewCat("");
  };
  const doImport = () => {
    const parsed = parseRecipeCSV(csvText);
    if (!parsed.length) { setImportMsg("No valid rows found — check the format."); return; }
    const withIds = parsed.map((r, i) => ({ ...r, id: `r${Date.now()}-${i}` }));
    const newCats = [...new Set(parsed.map((r) => r.cat))].filter((c) => !categories.includes(c));
    if (newCats.length) setCategories([...categories, ...newCats]);
    setRecipes([...withIds, ...recipes]);
    setImportMsg(`Imported ${parsed.length} recipe${parsed.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new categor${newCats.length === 1 ? "y" : "ies"}` : ""}.`);
    setCsvText("");
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

        {mode === "single" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            <input value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} placeholder="Recipe name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <select value={single.cat} onChange={(e) => setSingle({ ...single, cat: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">{categories.map((c) => <option key={c}>{c}</option>)}</select>
            <div className="grid grid-cols-4 gap-2">
              {[["cal", "Cal"], ["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]].map(([k, lbl]) => (
                <input key={k} type="number" value={single[k]} onChange={(e) => setSingle({ ...single, [k]: e.target.value })} placeholder={lbl} className="border border-slate-200 rounded-lg px-2 py-2 text-xs text-center focus:outline-none focus:ring-2 focus:ring-slate-200" />
              ))}
            </div>
            <input value={single.prep} onChange={(e) => setSingle({ ...single, prep: e.target.value })} placeholder="Prep time (e.g. 15 min)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={addSingle} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.accent }}>Add Recipe</button>
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
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="New category (e.g. Pre-Game)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={addCategory} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.accent }}>Add Category</button>
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
        <div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #1a4378)` }}>
          <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Today's Fuel</div>
          <div className="text-2xl font-bold mt-1">{totals.cal} <span className="text-xs opacity-70">kcal</span> · {totals.p}g <span className="text-xs opacity-70">protein</span></div>
        </div>

        <button onClick={() => setShowManual(!showManual)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.accent }}><Plus className="w-3.5 h-3.5" /> Log Something Else</button>
        {showManual && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="What did you eat?" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.cal} onChange={(e) => setManual({ ...manual, cal: e.target.value })} placeholder="Calories (optional)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.p} onChange={(e) => setManual({ ...manual, p: e.target.value })} placeholder="Protein g (optional)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <button onClick={addManual} className="w-full py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Add to Log</button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100"><h3 className="font-bold text-sm text-slate-900">Today's Log</h3></div>
          {logged.length === 0 ? <p className="text-sm text-slate-400 italic text-center py-8">Nothing logged yet.</p> : (
            <ul>{logged.map((l, i) => (
              <li key={l.logId} className={`px-4 py-3 ${i < logged.length - 1 ? "border-b border-slate-100" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Flame className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">{l.name}{l.custom && <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Custom</span>}</div>
                    <div className="text-[10px] text-slate-500">{l.time} · {l.cal} kcal · P{l.p}</div>
                  </div>
                  <button onClick={() => removeLog(l.logId)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-2 pl-12">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">How did you feel after?</div>
                  <div className="flex gap-1.5">
                    {FEELINGS.map((f) => (
                      <button key={f} onClick={() => rate(l.logId, f)} className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all" style={l.feeling === f ? { backgroundColor: FEELING_COLOR[f], color: "white", borderColor: FEELING_COLOR[f] } : { color: COLORS.textSecondary, borderColor: COLORS.border }}>{f}</button>
                    ))}
                  </div>
                </div>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5 space-y-2">
        {!isAdmin && (
          <button onClick={() => setSub("log")} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E0F2FE" }}><User className="w-4 h-4" style={{ color: "#0284c7" }} /></div>
            <div className="text-left flex-1"><div className="text-xs font-bold text-slate-900">My Food Log</div><div className="text-[10px] text-slate-500">{logged.length} logged today · tap to view & rate</div></div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setSub("manage")} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.accentSoft }}><Plus className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
            <div className="text-left flex-1"><div className="text-xs font-bold text-slate-900">Manage Recipes</div><div className="text-[10px] text-slate-500">Add recipes & categories, or import a sheet</div></div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>
      <div className="px-5 flex gap-2 overflow-x-auto">
        {categories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
        ))}
      </div>
      <div className="px-5 space-y-2.5">
        {filtered.map((m) => (
          <article key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-900">{m.name}</h4>
                <div className="flex items-center gap-3 mt-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.prep}</span><span className="flex items-center gap-1"><Flame className="w-3 h-3" />{m.cal} kcal</span><span>P {m.p}g</span></div>
              </div>
              {!isAdmin && <button onClick={() => log(m)} className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>Log</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/* ─── CHAT (pin + shared media/links) ─── */
const URL_RE = /(https?:\/\/[^\s]+)/;
const MessagesPage = ({ user, messages, setMessages, pinned, setPinned }) => {
  const isAdmin = user.role === "admin";
  const [input, setInput] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [shared, setShared] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);
  const feedRef = useRef(null);
  useEffect(() => { if (feedRef.current && !shared) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages, shared]);

  const send = () => {
    if (!input.trim()) return;
    const id = `m${Date.now()}`;
    setMessages([...messages, { id, sender: user.name, initials: user.initials, text: input.trim(), time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), own: true, isCoach: user.role === "admin" }]);
    if (pinOnSend) setPinned([...pinned, id]);
    setInput("");
  };
  const togglePin = (id) => setPinned(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
  const delMsg = (id) => { setMessages(messages.filter((m) => m.id !== id)); setPinned(pinned.filter((x) => x !== id)); };
  const pinnedMsgs = messages.filter((m) => pinned.includes(m.id));
  const mediaMsgs = messages.filter((m) => m.attachment);
  const linkMsgs = messages.filter((m) => URL_RE.test(m.text || ""));

  const AttIcon = ({ type }) => type === "image" ? <ImageIcon className="w-4 h-4" /> : type === "video" ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem - 64px)" }}>
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div><h3 className="font-bold text-slate-900 text-sm">Team Chat</h3><p className="text-[10px] text-slate-500">12 members · <span style={{ color: COLORS.success }}>● 4 online</span></p></div>
        <button onClick={() => setShared(!shared)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5" style={shared ? { backgroundColor: COLORS.primary, color: "white" } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>
          <Layers className="w-3 h-3" /> {shared ? "Chat" : "Shared"}
        </button>
      </div>

      {shared ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ backgroundColor: COLORS.bg }}>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Photos & Files</h4>
            {mediaMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No files shared yet.</p> : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMsgs.map((m) => (
                  <div key={m.id} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><AttIcon type={m.attachment.type} /></div>
                    <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                    <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                  </div>
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
      ) : (
        <>
          {pinnedMsgs.length > 0 && (
            <div className="bg-orange-50 border-b border-orange-100">
              <button onClick={() => setShowPinned(!showPinned)} className="w-full px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Pin className="w-3 h-3" /> {pinnedMsgs.length} Pinned</span>
                {showPinned ? <ChevronUp className="w-3.5 h-3.5 text-orange-400" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-400" />}
              </button>
              {showPinned && <ul className="px-4 pb-2 space-y-1">{pinnedMsgs.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs"><span className="font-bold text-slate-700">{m.sender.split(" ")[0]}:</span><span className="text-slate-600 truncate flex-1">{m.text}</span>{isAdmin && <button onClick={() => togglePin(m.id)} className="text-orange-400"><X className="w-3 h-3" /></button>}</li>
              ))}</ul>}
            </div>
          )}

          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: COLORS.bg }}>
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-2 group ${m.own ? "flex-row-reverse" : "flex-row"}`}>
                {!m.own && <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: m.isCoach ? COLORS.primary : "#94a3b8" }}>{m.initials}</div>}
                <div className={`max-w-[75%] flex flex-col ${m.own ? "items-end" : "items-start"}`}>
                  {!m.own && <div className="flex items-baseline gap-1.5 mb-1"><span className="text-[10px] font-bold text-slate-700">{m.sender}</span>{m.isCoach && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>Coach</span>}</div>}
                  <div className="flex items-center gap-1.5">
                    {m.own && isAdmin && <button onClick={() => togglePin(m.id)} className={`${pinned.includes(m.id) ? "text-orange-500" : "text-slate-300"} hover:text-orange-500`}><Pin className="w-3.5 h-3.5" /></button>}
                    <div className={`rounded-2xl px-3 py-2 shadow-sm ${m.own ? "text-white" : "bg-white text-slate-900"}`} style={m.own ? { backgroundColor: COLORS.primary } : {}}>
                      <p className="text-sm leading-snug break-words">{m.text}</p>
                      {m.attachment && <div className={`mt-2 rounded-xl p-2 flex items-center gap-2 ${m.own ? "bg-white/15" : "bg-slate-100"}`}><AttIcon type={m.attachment.type} /><span className="text-[11px] font-semibold truncate">{m.attachment.name}</span></div>}
                    </div>
                    {!m.own && isAdmin && <button onClick={() => togglePin(m.id)} className={`${pinned.includes(m.id) ? "text-orange-500" : "text-slate-300"} hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity`}><Pin className="w-3.5 h-3.5" /></button>}
                    {isAdmin && <button onClick={() => delMsg(m.id)} aria-label="Delete message" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1">{m.time}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border-t border-slate-200">
            {isAdmin && pinOnSend && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Pin className="w-3 h-3" /> Next message will be pinned</div>}
            <div className="p-3 flex items-center gap-2">
              <button className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"><Paperclip className="w-4 h-4" /></button>
              {isAdmin && (
                <button onClick={() => setPinOnSend(!pinOnSend)} aria-label="Pin on send" title="Pin this message when sent" className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={pinOnSend ? { backgroundColor: COLORS.accentSoft, color: COLORS.accent } : { color: COLORS.textSecondary }}><Pin className="w-4 h-4" /></button>
              )}
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message the team…" className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={send} disabled={!input.trim()} className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ backgroundColor: COLORS.accent }}><Send className="w-4 h-4" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ─── MAIN ─── */
export default function TeamHubRolesApp() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [announcements, setAnnouncements] = useState(seedAnnouncements);
  const [events, setEvents] = useState(seedEvents);
  const [videos, setVideos] = useState(seedVideos);
  const [messages, setMessages] = useState(seedMessages);
  const [pinned, setPinned] = useState([]);
  const [recipes, setRecipes] = useState(seedMeals);
  const [categories, setCategories] = useState(seedMealCategories);
  const [logged, setLogged] = useState([]);
  const [checkin, setCheckin] = useState({ feeling: 0, soreness: 0, tiredness: 0 });
  const [wellness, setWellness] = useState(seedWellness);

  if (!user) return <LoginScreen onLogin={(u) => { setUser(u); setTab("home"); setLogged([]); setCheckin({ feeling: 0, soreness: 0, tiredness: 0 }); }} />;

  const tabs = [
    { id: "home", label: "Home", icon: Home, title: "Home" },
    { id: "calendar", label: "Calendar", icon: CalendarIcon, title: "Calendar" },
    { id: "videos", label: "Videos", icon: Video, title: "Videos & Links" },
    { id: "nutrition", label: "Nutrition", icon: Apple, title: "Nutrition" },
    { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
  ];
  const title = tabs.find((t) => t.id === tab).title;

  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: COLORS.bg }}>
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl flex flex-col relative" style={{ backgroundColor: COLORS.bg }}>
        <Header title={title} user={user} onLogout={() => setUser(null)} />
        <main className="flex-1 overflow-y-auto pb-24">
          {tab === "home" && <HomePage user={user} announcements={announcements} setAnnouncements={setAnnouncements} events={events} checkin={checkin} setCheckin={setCheckin} wellness={wellness} setWellness={setWellness} />}
          {tab === "calendar" && <CalendarPage user={user} events={events} setEvents={setEvents} />}
          {tab === "videos" && <VideosPage user={user} videos={videos} setVideos={setVideos} />}
          {tab === "nutrition" && <NutritionPage user={user} recipes={recipes} setRecipes={setRecipes} categories={categories} setCategories={setCategories} logged={logged} setLogged={setLogged} />}
          {tab === "messages" && <MessagesPage user={user} messages={messages} setMessages={setMessages} pinned={pinned} setPinned={setPinned} />}
        </main>
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 z-20" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="grid grid-cols-5 px-2 pt-2">
            {tabs.map((t) => {
              const Icon = t.icon; const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="flex flex-col items-center justify-center py-1.5 gap-0.5">
                  <Icon className="w-5 h-5" style={{ color: active ? COLORS.accent : COLORS.textSecondary }} fill={active ? COLORS.accent : "none"} strokeWidth={active ? 2.5 : 2} />
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
