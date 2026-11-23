// Split out of TeamHubRoles.jsx (F81). Area: home.
// Every top-level declaration here is exported for the other app modules.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Apple, Bell, BellOff, Camera, Check, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Clock, Droplet, Dumbbell, FileText, MapPin, Pin, Video, X } from "lucide-react";
import { deleteDoc, deleteField, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { isLoading } from "../hooks/useCollection";
import { NOTIF_CATEGORIES, currentPermission, enablePushNotifications, isChatMuted, isIOS, isStandalone, mutedLabel, notificationsSupported, pushEnabledOnThisDevice } from "../lib/notifications";
import { toast } from "../lib/toast";
import { teamDateKey, zonedDate } from "../lib/dates";
import { formatPrescription, resolveLoad } from "../lib/lifting";
import { getTeam, getTeamShortName } from "../data/teams";
import QuoteOfDay from "../components/QuoteOfDay";
import { PushNotificationModal } from "./chat";
import { DocumentsSection } from "./documents";
import { COLORS, Scale, VERDICTS, VERDICT_RANK, WATER_CUPS_GOAL, formatAgo, formatHourTime, readinessFor, reportError } from "./shared";

/* Assignments were removed in the Home redo (Option A) — coaches no longer assign tasks; the assignments collection is unused. */


/* ─── PLAYER "TODAY" HOME + TRAIN HUB ─── */
// onMinus (optional) adds a "−" button, e.g. to take back a water cup tapped
// by mistake (F15: the row used to be +1 only).
// Shown instead of an "empty" message while a list is still loading (F11):
// the first second after opening a screen used to say "No … yet".
export const LoadingNote = () => (
  <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
    <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> Loading…
  </div>
);

export const ChecklistRow = ({ done, icon: Icon, label, sub, onClick, accent, onMinus }) => (
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
export const PrefToggle = ({ on, onChange, label, sub }) => (
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
export const NotificationPrefs = ({ user }) => {
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

// ─── Training maxes (F47) ─────────────────────────────────────────────────
// The signed-in player's maxes { [exerciseId]: { value, unit, name } }, so any
// workout screen shows "@ 75% → 185 lb" instead of just "@ 75%".
export const MaxesContext = createContext({ maxes: {}, openMaxes: () => {} });
export const useMaxes = () => useContext(MaxesContext);

// One prescription line, personalized; a %-row with no max offers to set it.
export const PrescriptionLine = ({ entry, className = "text-[11px] text-slate-600" }) => {
  const { maxes, openMaxes } = useMaxes();
  const needs = resolveLoad(entry, maxes).needsMax;
  return (
    <div className={className}>
      {formatPrescription(entry, maxes)}
      {needs && entry.exerciseId && <button type="button" onClick={() => openMaxes(entry)} className="ml-1.5 font-bold underline" style={{ color: COLORS.primary }}>set your max</button>}
    </div>
  );
};

// "My maxes": every lift used as % of max in the team's or your workouts.
export const MaxesSheet = ({ uid, maxes, workouts = [], focus, onClose }) => {
  const lifts = useMemo(() => {
    const m = new Map();
    for (const w of workouts) for (const e of w.exercises || []) if (e.exerciseId && e.loadMode === "percent" && !m.has(e.exerciseId)) m.set(e.exerciseId, e.name || "Lift");
    for (const [id, v] of Object.entries(maxes)) if (!m.has(id)) m.set(id, v.name || "Lift");
    if (focus?.exerciseId && !m.has(focus.exerciseId)) m.set(focus.exerciseId, focus.name || "Lift");
    return [...m.entries()].sort((a, b) => (a[0] === focus?.exerciseId ? -1 : b[0] === focus?.exerciseId ? 1 : a[1].localeCompare(b[1])));
  }, [workouts, maxes, focus]);
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.entries(maxes).map(([id, v]) => [id, { value: String(v.value), unit: v.unit || "lb" }])));
  const [busy, setBusy] = useState("");
  const save = async (id, name) => {
    const d = draft[id] || {};
    const value = Number(String(d.value || "").replace(",", "."));
    setBusy(id);
    try {
      if (!d.value) await deleteDoc(doc(db, "users", uid, "maxes", id));
      else if (!(value > 0 && value < 2000)) { toast("Enter a weight, e.g. 185"); setBusy(""); return; }
      else await setDoc(doc(db, "users", uid, "maxes", id), { value, unit: d.unit || "lb", name, updatedAt: new Date().toISOString() });
      toast(d.value ? `${name}: ${value} ${d.unit || "lb"}` : `${name} max removed`, "success");
    } catch (e) { toast("Couldn't save — " + (e?.message || "")); }
    setBusy("");
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose} role="dialog" aria-label="My maxes">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base text-slate-900">My maxes</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[12px] text-slate-500 mb-3">Your training max (best weight for 1 rep) for each lift. Workouts written as "% of max" then show your exact weight.</p>
        {lifts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No workouts use % of max yet.</p>}
        <ul className="space-y-2">
          {lifts.map(([id, name]) => {
            const d = draft[id] || { value: "", unit: "lb" };
            return (
              <li key={id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${id === focus?.exerciseId ? "border-transparent ring-2" : "border-slate-200"}`} style={id === focus?.exerciseId ? { "--tw-ring-color": COLORS.primary } : undefined}>
                <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{name}</span>
                <input inputMode="decimal" value={d.value} onChange={(e) => setDraft((x) => ({ ...x, [id]: { ...d, value: e.target.value } }))} placeholder="—" className="w-20 h-10 border border-slate-200 rounded-lg px-2 text-right text-base tabular-nums" />
                <button type="button" onClick={() => setDraft((x) => ({ ...x, [id]: { ...d, unit: d.unit === "kg" ? "lb" : "kg" } }))} className="w-11 h-10 rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{d.unit}</button>
                <button type="button" disabled={busy === id} onClick={() => save(id, name)} className="h-10 px-3 rounded-lg text-white text-xs font-bold disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{busy === id ? "…" : "Save"}</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// "Turn on notifications" card (Home, players and coaches). Hidden once push
// is on for this device. On an iPhone that isn't running the Home Screen
// app, explains that step first — iOS only allows web push from there.
export const PushPrompt = ({ user }) => {
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

export const PlayerTodayPage = ({ user, events = [], announcements = [], checkin, setCheckin, submitWellness, wellnessLoggedToday, myWellness = null, loggedToday, waterCups = 0, setWaterCups, documents = [], signDocument, onOpenTrain, onOpenSchedule, practices = [], activeTeamId, todayQuote, addQuote, nutritionTarget, nutritionTotals = { cal: 0, protein: 0 }, profilePrompt, onOpenProfile, onUploadPhoto }) => {
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
  const WATER_GOAL = WATER_CUPS_GOAL;
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

export const TrainHub = ({ onPick }) => {
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
export const HomePage = ({ user, practices = [], announcements = [], events = [], wellness = [], wellnessLoading = false, invites = [], mealLogActivityToday = [], groups = [], addGroup, updateGroupMembers, deleteGroup, allUsers = [], pushNotifications = [], addPushNotification, deletePushNotification, sendPushNotificationNow, activeTeamId, todayQuote, addQuote }) => {
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email, u.name])), [allUsers]);
  const uidByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id])), [allUsers]);
  const emailByUid = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email).map((u) => [u.id, u.email])), [allUsers]);
  // Unique players on the team: signed-up players plus invited emails that
  // haven't signed up yet (coaches excluded) — one denominator everywhere.
  const playersTotal = useMemo(() => {
    const keys = new Set();
    (allUsers || []).filter((u) => u.role === "player").forEach((u) => keys.add((u.email || u.id).toLowerCase()));
    (invites || []).filter((i) => !i.role || i.role === "player").forEach((i) => keys.add((i.email || i.id).toLowerCase()));
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
