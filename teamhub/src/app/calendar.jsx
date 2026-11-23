// Split out of TeamHubRoles.jsx (F81). Area: calendar.
// Every top-level declaration here is exported for the other app modules.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Clock, Dumbbell, Lock, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "../lib/toast";
import { teamDateKey, zonedDate } from "../lib/dates";
import { PrescriptionLine } from "./home";
import { AutoGrowTextarea, COLORS, EVENT_STYLE, formatHourTime, reportError, splitCSVLine } from "./shared";


/* ─── CALENDAR ─── */
export const EVENT_CSV_TEMPLATE = `date,start,end,title,location,type
2026-08-15,19:30,21:30,vs Opponent,Field 1,Game
2026-09-01,16:30,18:30,@ Yavapai,Yavapai,Game`;

// Local-date helpers (avoids UTC drift from new Date("2026-06-08") parsing).
export const parseLocalDate = (yyyyMmDd) => {
  if (!yyyyMmDd) return new Date();
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const fmtLocalDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
export const startOfWeek = (d) => addDays(d, -((d.getDay() + 7) % 7)); // Sun = 0
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const sameDay = (a, b) => fmtLocalDate(a) === fmtLocalDate(b);

export const parseScheduleCSV = (text) => {
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
export const EventCard = ({ ev, isAdmin, onEdit, onDelete, onOpen, nameByUid = {}, practices = [], teamWorkouts = [] }) => {
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
export const EventDetailModal = ({ ev, practices = [], teamWorkouts = [], nameByUid = {}, onClose }) => {
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
                    <PrescriptionLine entry={ex} className="text-[11px] text-slate-500" />
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
export const GroupsModal = ({ groups, allUsers, invites, onClose, addGroup, updateGroupMembers, deleteGroup }) => {
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
export const LEAD_PRESETS = [15, 30, 60, 120, 180, 360, 1440, 2880];
export const leadText = (min) => {
  const m = Math.round(Number(min) || 0);
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d > 1 ? "s" : ""} before`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h > 1 ? "s" : ""} before`; }
  return `${m} min before`;
};
export const rrid = () => Math.random().toString(36).slice(2, 8);

// Coach-only: attach EXTRA auto reminders to an event, each firing a custom
// amount of time before it starts. Stored on the event; a Cloud Function turns
// them into scheduled sends. Every team event ALSO gets two automatic pings
// (1 hour before kickoff + 7:00 AM on the day, America/Phoenix), added
// server-side — those are not listed here. (No RSVP: the old event-attached
// "Who's making it?" poll was dropped for Brophy.)
export const EventRemindersEditor = ({ reminders = [], setReminders }) => {
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

export const CalendarPage = ({ user, events, personalEvents = [], addEvent, updateEvent, addPersonalEvent, updatePersonalEvent, deleteEvent, deletePersonalEvent, importEvents, groups = [], addGroup, updateGroupMembers, deleteGroup, invites = [], allUsers = [], practices = [], teamWorkouts = [] }) => {
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
