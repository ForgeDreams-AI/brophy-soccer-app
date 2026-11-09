// PlayerTodayPage — the player's home. Answers "what do I do today?" in one
// screen: greeting, coach profile-update prompt, hero card for today's
// session, self check-in toggle, today's assignments, the daily checklist
// (wellness / nutrition / water), a pinned-first coach note, and documents
// to sign. Receives { user } only — all data is owned here via ./hooks.js
// (contract rule 7). Navigation goes through useApp() (goTab / openTrain /
// openSettings), never through props.
import { useState } from "react";
import {
  Activity, Apple, Bell, Check, ChevronDown, ChevronRight, ChevronUp,
  ClipboardList, Clock, Droplet, Dumbbell, ExternalLink, FileText,
  MapPin, Minus, Pin, Plus, User, X,
} from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import { useApp } from "../../app/TeamHubApp";
import { toast } from "../../lib/toast";
import { formatHourTime, parseDayKey } from "../../lib/dates";
import {
  useProfilePrompt,
  useTodaysEvents,
  useNextEvent,
  useTopAnnouncement,
  useMyAttendance,
  useTodaysAssignments,
  useTeamWorkouts,
  useWater,
  useMyNutrition,
  useDocuments,
  docTypeLabel,
} from "./hooks";
import { WellnessCheckin, useWellnessCheckin } from "./WellnessCheckin";

const CHECKIN_STORAGE_KEY = "profilePromptSeen";

// ── ChecklistRow ─────────────────────────────────────────────────────────────
const ChecklistRow = ({ done, icon: Icon, label, sub, onClick, accent }) => (
  <button
    onClick={onClick}
    className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-[var(--th-surface-2)] flex items-center gap-3 text-left"
  >
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        backgroundColor: done ? "var(--th-success)" : "var(--th-surface-2)",
        color: done ? "white" : accent || undefined,
      }}
    >
      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4 text-brand-accent" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-semibold ${done ? "text-ink-faint line-through" : "text-ink"}`}>
        {label}
      </div>
      {sub && <div className="text-[11px] text-ink-soft">{sub}</div>}
    </div>
    <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
  </button>
);

// ── Documents in player mode: read-only list with the e-sign flow ────────────
const PlayerDocuments = ({ user }) => {
  const { documents, sign, hasSigned } = useDocuments(user);
  const [open, setOpen] = useState(true);
  const [signId, setSignId] = useState(null);
  const [signName, setSignName] = useState(user?.name || "");

  const submitSign = async (d) => {
    if (!signName.trim()) return;
    try {
      await sign(d.id, signName);
      setSignId(null);
    } catch (e) {
      toast("Couldn't sign — " + (e.message || ""));
    }
  };

  return (
    <section>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-ink">
          Team Documents <span className="text-[11px] font-semibold text-ink-faint">· {documents.length}</span>
        </h3>
        {open ? <ChevronUp className="w-4 h-4 text-ink-faint" /> : <ChevronDown className="w-4 h-4 text-ink-faint" />}
      </button>
      {!open ? null : documents.length === 0 ? (
        <p className="text-sm text-ink-faint italic">No documents to sign right now.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => {
            const mine = hasSigned(d);
            return (
              <li key={d.id} className="bg-white rounded-2xl shadow-sm border border-[var(--th-surface-2)] overflow-hidden">
                <div className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-accent-soft flex flex-col items-center justify-center flex-shrink-0 gap-0.5">
                    <FileText className="w-3.5 h-3.5 text-brand-accent" />
                    <span className="text-[11px] font-black leading-none tracking-tight text-brand-accent">
                      {docTypeLabel(d)}
                    </span>
                  </div>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{d.title}</div>
                    <div className="text-[11px] text-ink-soft">{mine ? "You've signed" : "Tap to read"}</div>
                  </a>
                  {mine ? (
                    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0" style={{ color: "var(--th-success)" }}>
                      <Check className="w-3.5 h-3.5" /> Signed
                    </span>
                  ) : (
                    <button
                      onClick={() => { setSignId(d.id); setSignName(user?.name || ""); }}
                      className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white bg-brand-primary flex-shrink-0"
                    >
                      Sign
                    </button>
                  )}
                </div>
                {signId === d.id && !mine && (
                  <div className="px-3 pb-3 border-t border-[var(--th-surface-2)] pt-2 space-y-2">
                    <p className="text-[11px] text-ink-soft">
                      Type your full name to sign. This records your agreement with a timestamp.
                    </p>
                    <input
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full border border-[var(--th-surface-2)] rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSignId(null)}
                        className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-xs font-bold text-ink-soft"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => submitSign(d)}
                        disabled={!signName.trim()}
                        className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white bg-brand-primary disabled:opacity-40"
                      >
                        Agree &amp; Sign
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PlayerTodayPage({ user }) {
  const { team, t } = useTheme();
  const { goTab, openTrain, openSettings } = useApp();

  const { requestedAt: promptTs } = useProfilePrompt();
  const todays = useTodaysEvents(user);
  const upcoming = useNextEvent(user);
  const topAnnounce = useTopAnnouncement(user);
  const { status: attendanceStatus, setStatus: setAttendance } = useMyAttendance(user);
  const { assignments, toggleDone } = useTodaysAssignments(user);
  const teamWorkouts = useTeamWorkouts();
  const { checkedIn: checkedInToday } = useWellnessCheckin(user);
  const { target: nutritionTarget, totals: nutritionTotals, loggedToday } = useMyNutrition(user);
  const { cups: waterCups, setCups: setWaterCups } = useWater(user);

  const waterGoal = team?.targets?.water || 8;
  const hero = todays[0];
  const firstName = (user?.name || "").split(" ")[0] || "there";

  // Coach profile-update prompt — dismissable; re-shown when the coach
  // issues a new request (requestedAt changes).
  const [seenPrompt, setSeenPrompt] = useState(() => {
    try { return localStorage.getItem(CHECKIN_STORAGE_KEY) || ""; } catch { return ""; }
  });
  // Coach profile-update prompt — dismissable; re-shown when the coach
  // issues a new request (requestedAt changes). Render-synced with a
  // previous-value guard instead of an effect.
  const [prevPromptTs, setPrevPromptTs] = useState(promptTs);
  if (promptTs !== prevPromptTs) {
    setPrevPromptTs(promptTs);
    try { setSeenPrompt(localStorage.getItem(CHECKIN_STORAGE_KEY) || ""); } catch { /* ignore */ }
  }
  const showProfilePrompt = !!promptTs && seenPrompt !== promptTs;
  const dismissProfile = () => {
    try { localStorage.setItem(CHECKIN_STORAGE_KEY, promptTs); } catch { /* ignore */ }
    setSeenPrompt(promptTs);
  };

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [openA, setOpenA] = useState(null);

  const handleCheckIn = async () => {
    try {
      await setAttendance(attendanceStatus === "present" ? "" : "present");
    } catch (e) {
      toast("Couldn't update — " + (e.message || ""));
    }
  };

  const handleToggleAssignment = async (a, done) => {
    try {
      await toggleDone(a.id, !done);
    } catch (e) {
      toast("Couldn't update — " + (e.message || ""));
    }
  };

  const bumpWater = async (delta) => {
    try {
      await setWaterCups(waterCups + delta);
    } catch (e) {
      toast("Couldn't update — " + (e.message || ""));
    }
  };

  const nutritionDone = nutritionTarget
    ? (nutritionTarget.protein > 0
      ? nutritionTotals.protein >= nutritionTarget.protein
      : nutritionTotals.cal >= nutritionTarget.cal)
    : loggedToday;
  const nutritionSub = nutritionTarget && (nutritionTarget.protein > 0 || nutritionTarget.cal > 0)
    ? [
      nutritionTarget.protein > 0 ? `Protein ${nutritionTotals.protein}/${nutritionTarget.protein}g` : null,
      nutritionTarget.cal > 0 ? `${nutritionTotals.cal}/${nutritionTarget.cal} kcal` : null,
    ].filter(Boolean).join(" · ")
    : (loggedToday ? "Nice work" : "Open nutrition");

  return (
    <div className="px-5 pt-5 pb-4 space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h2 className="text-2xl font-display font-bold text-ink mt-1 leading-tight">
          Hey,<br /><span style={{ color: t("primary") }}>{firstName}.</span>
        </h2>
      </div>

      {showProfilePrompt && (
        <div className="rounded-2xl p-3.5 shadow-sm flex items-center gap-3 bg-brand-accent-soft border border-brand-accent">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-ink">Update your info</div>
            <div className="text-[11px] text-ink-soft">Your coach asked everyone to confirm their details.</div>
          </div>
          <button
            onClick={() => { openSettings(); dismissProfile(); }}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white bg-brand-primary flex-shrink-0"
          >
            Update now
          </button>
          <button onClick={dismissProfile} aria-label="Dismiss" className="text-ink-faint flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HERO — today's session */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">Today</h3>
        {hero ? (
          <button onClick={() => goTab("calendar")} className="w-full text-left rounded-3xl p-5 shadow-card bg-brand-primary">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-brand-accent">
              {hero.type || "Session"}
            </span>
            <h4 className="text-xl font-display font-bold text-white mt-2 leading-tight">{hero.title}</h4>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-white/80">
              {hero.start && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatHourTime(hero.start)}{hero.end ? `–${formatHourTime(hero.end)}` : ""}
                </span>
              )}
              {hero.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />{hero.location}
                </span>
              )}
            </div>
          </button>
        ) : (
          <div className="rounded-3xl p-5 border border-dashed border-[var(--th-surface-2)] bg-white text-center">
            <p className="text-sm font-semibold text-ink">No session today — rest up.</p>
            {upcoming && (
              <p className="text-xs text-ink-soft mt-1">
                Next: {upcoming.title} · {parseDayKey(upcoming.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* SELF CHECK-IN — mark yourself present for today (coach sees it live) */}
      {hero && (
        <div
          className="bg-white rounded-2xl p-4 shadow-sm border flex items-center gap-3"
          style={{ borderColor: attendanceStatus === "present" ? "var(--th-success)" : "var(--th-surface-2)" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: attendanceStatus === "present" ? "var(--th-success)" : undefined }}
          >
            {attendanceStatus === "present"
              ? <Check className="w-5 h-5 text-white" />
              : <div className="w-10 h-10 rounded-full bg-brand-accent-soft flex items-center justify-center"><User className="w-5 h-5 text-brand-accent" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-ink">
              {attendanceStatus === "present" ? "You're checked in" : "Check in for today"}
            </div>
            <div className="text-[11px] text-ink-soft">
              {attendanceStatus === "present" ? "Your coach can see you're here." : "Let your coach know you're here."}
            </div>
          </div>
          <button
            onClick={handleCheckIn}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex-shrink-0 ${
              attendanceStatus === "present"
                ? "bg-[var(--th-surface-2)] text-ink-soft"
                : "text-white bg-brand-primary"
            }`}
          >
            {attendanceStatus === "present" ? "Undo" : "Check in"}
          </button>
        </div>
      )}

      {/* ASSIGNED TODAY — coach assignments, expand to see + mark done */}
      {assignments.length > 0 && (
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">Assigned today</h3>
          <div className="space-y-2">
            {assignments.map((a) => {
              const done = !!a.completedBy?.[user.uid];
              const wo = teamWorkouts.find((w) => w.id === a.workoutId);
              const ex = openA === a.id;
              return (
                <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-[var(--th-surface-2)] overflow-hidden">
                  <button onClick={() => setOpenA(ex ? null : a.id)} className="w-full p-3.5 flex items-center gap-3 text-left">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: done ? "var(--th-success)" : undefined }}
                    >
                      {done ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-brand-accent-soft flex items-center justify-center">
                          {wo ? <Dumbbell className="w-4 h-4 text-brand-accent" /> : <ClipboardList className="w-4 h-4 text-brand-accent" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${done ? "text-ink-faint line-through" : "text-ink"}`}>{a.title}</div>
                      <div className="text-[11px] text-ink-soft truncate">
                        {wo ? `${wo.exercises?.length || 0} exercise${(wo.exercises?.length || 0) === 1 ? "" : "s"}` : (a.body || "Tap for details")}
                      </div>
                    </div>
                    {ex ? <ChevronUp className="w-4 h-4 text-ink-faint" /> : <ChevronDown className="w-4 h-4 text-ink-faint" />}
                  </button>
                  {ex && (
                    <div className="px-3 pb-3 border-t border-[var(--th-surface-2)] pt-2 space-y-2">
                      {a.body && <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed">{a.body}</p>}
                      {a.link && (
                        <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary">
                          <ExternalLink className="w-3.5 h-3.5" /> Open link
                        </a>
                      )}
                      {wo && (wo.exercises || []).map((e, i) => (
                        <div key={i} className="text-xs flex items-center justify-between gap-2">
                          <span className="font-medium text-ink truncate">{e.name}</span>
                          <span className="text-ink-soft flex-shrink-0">
                            {e.sets || "—"}×{e.reps || "—"}{e.weight ? ` @ ${e.weight}` : ""}
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => handleToggleAssignment(a, done)}
                        className={`w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                          done ? "bg-[var(--th-surface-2)] text-ink-soft" : "text-white"
                        }`}
                        style={done ? {} : { backgroundColor: "var(--th-success)" }}
                      >
                        {done ? "Completed — tap to undo" : "Mark complete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CHECKLIST — daily habits with completion ticks */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">Your day</h3>
        <div className="space-y-2">
          <div>
            <ChecklistRow
              done={checkedInToday}
              icon={Activity}
              label={checkedInToday ? "Checked in" : "Daily check-in"}
              sub={checkedInToday ? "Coach can see your readiness" : "Takes 30 seconds"}
              onClick={() => setCheckinOpen((o) => !o)}
            />
            {checkinOpen && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--th-surface-2)] mt-2">
                <WellnessCheckin user={user} onDone={() => setTimeout(() => setCheckinOpen(false), 900)} />
              </div>
            )}
          </div>
          <ChecklistRow
            done={nutritionDone}
            icon={Apple}
            label={nutritionTarget && (nutritionTarget.protein > 0 || nutritionTarget.cal > 0) ? "Nutrition target" : (loggedToday ? "Meals logged" : "Log your meals")}
            sub={nutritionSub}
            onClick={() => openTrain("nutrition")}
          />
          <div className="w-full bg-white rounded-2xl p-3.5 shadow-sm border border-[var(--th-surface-2)] flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: waterCups >= waterGoal ? "var(--th-success)" : undefined }}
            >
              {waterCups >= waterGoal
                ? <Check className="w-4 h-4 text-white" />
                : <Droplet className="w-4 h-4" style={{ color: "var(--th-info)" }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${waterCups >= waterGoal ? "text-ink-faint line-through" : "text-ink"}`}>
                Water · {waterCups}/{waterGoal} cups
              </div>
              <div className="text-[11px] text-ink-soft">{waterCups >= waterGoal ? "Hydrated!" : "Tap to add a cup"}</div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => bumpWater(-1)}
                disabled={waterCups === 0}
                aria-label="One less cup"
                className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] text-ink font-bold disabled:opacity-30 flex items-center justify-center"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => bumpWater(1)}
                aria-label="Add a cup"
                className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* One-line coach note — pinned first */}
      {topAnnounce && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[var(--th-surface-2)] flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
            {topAnnounce.pinned
              ? <Pin className="w-4 h-4 text-brand-accent" />
              : <Bell className="w-4 h-4 text-brand-accent" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-brand-accent">Coach</div>
            <div className="text-sm font-semibold text-ink leading-tight">{topAnnounce.title}</div>
            {topAnnounce.body && <div className="text-xs text-ink-soft line-clamp-2 mt-0.5">{topAnnounce.body}</div>}
          </div>
        </div>
      )}

      {/* Documents to sign */}
      <PlayerDocuments user={user} />
    </div>
  );
}
