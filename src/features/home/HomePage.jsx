// HomePage — the coach dashboard (registry key: homeAdmin). Receives
// { user } (the effective user — always admin here; the player screen lives in
// PlayerTodayPage.jsx). All data + writes come from useHomeData (hooks.js).
import { useMemo, useState } from "react";
import {
  Activity,
  Apple,
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Flag,
  HeartPulse,
  MapPin,
  Pencil,
  Pin,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import Card from "../../components/ui/Card";
import SectionHeader from "../../components/ui/SectionHeader";
import Btn from "../../components/ui/Btn";
import StatTile from "../../components/ui/StatTile";
import ProgressRing from "../../components/ui/ProgressRing";
import Badge from "../../components/ui/Badge";
import Avatar from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import ProgressBar from "../../components/ui/ProgressBar";
import Field, { Input, TextArea } from "../../components/ui/Field";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useHomeData } from "./hooks";
import { WellnessCheckin } from "./WellnessCheckin";
import {
  todayKey,
  formatAgo,
  formatHourTime,
  parseDayKey,
} from "../../lib/dates";
import { toast } from "../../lib/toast";
import {
  notificationsSupported,
  currentPermission,
  enablePushNotifications,
} from "../../lib/notifications";
import AttendanceSection from "./components/AttendanceSection";
import AttendanceArchive from "./components/AttendanceArchive";
import DocumentsSection from "./components/DocumentsSection";
import AssignmentsSection from "./components/AssignmentsSection";
import RosterManager from "./components/RosterManager";
import QuoteOfDay from "./components/QuoteOfDay";
import AbsenceReasonGate from "./components/AbsenceReasonGate";

const prettyDay = (ymd) => {
  try {
    return parseDayKey(ymd).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ymd;
  }
};

// Local-ms start of an event (handles a missing start time gracefully).
const eventStartMs = (e) => {
  try {
    const d = parseDayKey(e.date);
    const [h, m] = String(e.start || "00:00").split(":").map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.getTime();
  } catch {
    return NaN;
  }
};

const initialsOf = (s) =>
  (s || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* ── Push-enable card ───────────────────────────────────────────────────── */
function PushCard({ user }) {
  const [perm, setPerm] = useState(currentPermission());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!notificationsSupported() || perm === "granted") return null;
  const enable = async () => {
    setErr("");
    setBusy(true);
    try {
      await enablePushNotifications(user.uid);
      setPerm("granted");
    } catch (e) {
      setErr(e.message || "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card elevation="flat" className="p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
        <Bell className="w-4 h-4 text-brand-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-ink">Turn on notifications</div>
        <div className="text-[11px] text-ink-soft leading-snug">
          {perm === "denied"
            ? "Blocked. Allow notifications in your browser settings, then refresh."
            : "Get pinged for check-ins, chat, and sessions."}
        </div>
        {err && <div className="text-[11px] text-[var(--th-danger)] font-medium mt-0.5">{err}</div>}
      </div>
      {perm !== "denied" && (
        <Btn variant="primary" size="sm" loading={busy} onClick={enable}>
          Enable
        </Btn>
      )}
    </Card>
  );
}

/* ── Next Up hero ───────────────────────────────────────────────────────── */
function NextUpHero({ event }) {
  const { t } = useTheme();
  if (!event) {
    return (
      <Card elevation="raised" className="p-5 border-2 border-dashed border-[var(--th-surface-2)] text-center">
        <p className="text-sm font-semibold text-ink">No session today — rest up.</p>
      </Card>
    );
  }
  return (
    <Card
      elevation="hero"
      className="p-5 text-white overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${t("primary")}, ${t("primaryDeep")})`,
      }}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge tone="gold">{event.type || "Session"}</Badge>
        <span className="text-xs font-semibold text-white/85">
          {event.date === todayKey() ? "Today" : prettyDay(event.date)}
        </span>
      </div>
      <h4 className="font-display font-bold text-[26px] uppercase tracking-wide leading-none">
        {event.title}
      </h4>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-white/85">
        {(event.start || event.end) && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {formatHourTime(event.start)}
            {event.end ? `–${formatHourTime(event.end)}` : ""}
          </span>
        )}
        {event.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {event.location}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ── Coach dashboard tiles ──────────────────────────────────────────────── */
/* The readiness tile is custom — a value-in-ring ProgressRing whose color is
   threshold-coded (green ≥4, gold 2.5–4, red below) so the glance is visual,
   not just a number. The other five tiles use the shared StatTile. */
function Dashboard({ data }) {
  const { t } = useTheme();
  const {
    wellness,
    invites,
    attendance,
    mealLogActivityToday,
    assignments,
  } = data;
  const players = invites.filter((i) => i.role !== "admin");
  const playersTotal = players.length;
  const today = todayKey();

  const avg = (k) =>
    wellness.length ? wellness.reduce((s, w) => s + (Number(w[k]) || 0), 0) / wellness.length : 0;
  const energy = avg("feeling");
  const ring = (n, total) => (total > 0 ? Math.min(1, n / total) : 0);

  const readinessColor =
    energy >= 4 ? t("success") : energy >= 2.5 ? t("accent") : t("danger");
  const checkedIn = wellness.length;
  const present = players.filter((p) => attendance[p.email] === "present").length;
  const logged = new Set((mealLogActivityToday || []).map((a) => a.uid)).size;
  const assigned = assignments.filter((a) => (a.date || "") >= today).length;

  const tiles = [
    {
      icon: UserCheck,
      value: String(checkedIn),
      label: `Checked in${playersTotal ? ` / ${playersTotal}` : ""}`,
      progress: ring(checkedIn, playersTotal),
    },
    {
      icon: ClipboardCheck,
      value: String(present),
      label: `Present${playersTotal ? ` / ${playersTotal}` : ""}`,
      progress: ring(present, playersTotal),
    },
    {
      icon: Apple,
      value: String(logged),
      label: `Logged${playersTotal ? ` / ${playersTotal}` : ""}`,
      progress: ring(logged, playersTotal),
    },
    { icon: ClipboardList, value: String(assigned), label: "Assigned due" },
    { icon: Users, value: String(invites.length), label: "Roster" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card rounded-[20px] p-3 flex flex-col items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-ink-faint">
          <Activity className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Readiness</span>
        </span>
        <ProgressRing
          value={wellness.length ? energy / 5 : 0}
          size={58}
          stroke={7}
          color={readinessColor}
        >
          <span className="font-display font-bold text-[20px] text-ink tabular leading-none">
            {wellness.length ? energy.toFixed(1) : "—"}
          </span>
        </ProgressRing>
        <span className="text-[11px] text-ink-faint font-medium tabular">of 5</span>
      </div>
      {tiles.map((tile) => (
        <StatTile
          key={tile.label}
          icon={tile.icon}
          value={tile.value}
          label={tile.label}
          progress={tile.progress}
        />
      ))}
    </div>
  );
}

/* ── You're running (delegated sessions) ────────────────────────────────── */
function YouRunning({ user, eventsRaw, practices }) {
  const { t } = useTheme();
  const today = todayKey();
  const myRuns = useMemo(
    () =>
      (eventsRaw || [])
        .filter((e) => e.runByUid === user.uid && (e.date || "") >= today)
        .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))
        .slice(0, 3),
    [eventsRaw, user.uid, today],
  );
  if (!myRuns.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-primary">
        You're running
      </h3>
      {myRuns.map((e) => {
        const plan = e.practiceId ? practices.find((pl) => pl.id === e.practiceId) : null;
        return (
          <Card
            key={e.id}
            elevation="flat"
            className="p-4 border-l-4"
            style={{ borderLeftColor: t("primary") }}
          >
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <Badge tone="blue">{e.type || "Session"}</Badge>
              <span className="text-xs font-semibold text-ink-soft inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatHourTime(e.start)}
                {e.end ? `–${formatHourTime(e.end)}` : ""}
              </span>
              <span className="text-xs text-ink-faint">{prettyDay(e.date)}</span>
            </div>
            <h4 className="font-bold text-ink text-sm">{e.title}</h4>
            {e.location && (
              <p className="text-xs text-ink-soft mt-0.5 inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {e.location}
              </p>
            )}
            {e.coachNotes && (
              <p className="text-xs text-ink-soft mt-2 bg-[var(--th-surface-2)]/50 rounded-xl p-2.5 whitespace-pre-wrap">
                {e.coachNotes}
              </p>
            )}
            {plan && (
              <div className="mt-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint mb-1.5">
                  Plan · {plan.name || "Practice"}
                </div>
                <ul className="space-y-1">
                  {(plan.blocks || []).map((b, i) => (
                    <li key={i} className="text-xs text-ink-soft flex items-start gap-2">
                      <span className="text-ink-faint font-bold">{i + 1}.</span>
                      <span className="flex-1">
                        <span className="font-semibold text-ink">{b.name}</span>
                        {b.dur ? ` · ${b.dur}` : ""}
                        {b.notes ? <span className="text-ink-faint"> — {b.notes}</span> : ""}
                      </span>
                    </li>
                  ))}
                  {!(plan.blocks || []).length && (
                    <li className="text-xs text-ink-faint italic">No drills in this plan yet.</li>
                  )}
                </ul>
              </div>
            )}
            {!plan && e.practiceId && (
              <p className="text-[11px] text-ink-faint mt-2">Plan unavailable.</p>
            )}
          </Card>
        );
      })}
    </section>
  );
}

/* ── Announcements CRUD ─────────────────────────────────────────────────── */
function Announcements({ announcements, actions }) {
  const confirm = useConfirm();
  const [annOpen, setAnnOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "" });

  const sorted = useMemo(
    () => [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)),
    [announcements],
  );

  const save = async () => {
    if (!form.title.trim()) return;
    try {
      if (editingId) {
        await actions.updateAnnouncement(editingId, { title: form.title, body: form.body });
      } else {
        await actions.addAnnouncement(form.title, form.body);
      }
      setForm({ title: "", body: "" });
      setEditingId(null);
      setAdding(false);
    } catch (e) {
      toast("Couldn't save — " + (e.message || "check your Firestore rules."));
    }
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setForm({ title: a.title || "", body: a.body || "" });
    setAdding(true);
    setAnnOpen(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ title: "", body: "" });
    setAdding(false);
  };

  const togglePin = (id, pinned) => actions.togglePinAnnouncement(id, pinned).catch(() => {});
  const del = async (a) => {
    const ok = await confirm({
      title: "Delete announcement?",
      body: `“${a.title}” will be removed for everyone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await actions.deleteAnnouncement(a.id);
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Announcements"
        icon={Pin}
        action={
          <div className="flex items-center gap-2">
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setAdding(!adding); setAnnOpen(true); }}>
              Post
            </Btn>
            <button
              type="button"
              onClick={() => setAnnOpen((o) => !o)}
              aria-expanded={annOpen}
              className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center text-ink-soft press"
            >
              {annOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        }
      />
      {annOpen && (
        <>
          {adding && (
            <Card elevation="flat" className="p-4 space-y-3">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title"
                />
              </Field>
              <Field label="Details">
                <TextArea
                  rows={2}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Details…"
                />
              </Field>
              <div className="flex gap-2">
                <Btn variant="ghost" className="flex-1" onClick={cancelEdit}>
                  Cancel
                </Btn>
                <Btn variant="primary" className="flex-1" onClick={save} disabled={!form.title.trim()}>
                  {editingId ? "Save changes" : "Post to team"}
                </Btn>
              </div>
            </Card>
          )}
          {sorted.length === 0 ? (
            <EmptyState
              icon={Pin}
              title="No announcements"
              body="Post the first one to keep the team in the loop."
            />
          ) : (
            <ul className="space-y-2">
              {sorted.map((a) => (
                <li key={a.id}>
                  <Card elevation="flat" className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {a.pinned && <Pin className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />}
                          <h4 className="font-semibold text-ink text-sm">{a.title}</h4>
                        </div>
                        {a.body && (
                          <p className="text-xs text-ink-soft leading-snug whitespace-pre-wrap">
                            {a.body}
                          </p>
                        )}
                        <span className="text-[11px] text-ink-faint font-medium">
                          {formatAgo(a.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => togglePin(a.id, a.pinned)}
                          title={a.pinned ? "Unpin" : "Pin"}
                          aria-label={a.pinned ? "Unpin" : "Pin"}
                          className={`w-9 h-9 rounded-full flex items-center justify-center press ${
                            a.pinned ? "text-brand-accent" : "text-ink-faint hover:text-brand-accent"
                          }`}
                        >
                          <Pin className="w-4 h-4" fill={a.pinned ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(a)}
                          title="Edit"
                          aria-label="Edit"
                          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-ink press"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => del(a)}
                          title="Delete"
                          aria-label="Delete"
                          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-[var(--th-danger)] press"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ── Team readiness (wellness) ──────────────────────────────────────────── */
function TeamReadiness({ wellness }) {
  const { t } = useTheme();
  const [showPlayers, setShowPlayers] = useState(false);
  const [openPlayer, setOpenPlayer] = useState(null);

  const METRICS = useMemo(
    () => [
      { key: "feeling", label: "Energy", color: t("success") },
      { key: "soreness", label: "Soreness", color: t("accent") },
      { key: "tiredness", label: "Tiredness", color: t("info") },
    ],
    [t],
  );
  const avg = (k) =>
    wellness.length ? wellness.reduce((s, w) => s + (Number(w[k]) || 0), 0) / wellness.length : 0;

  const flagged = (w) => (Number(w.soreness) || 0) >= 4 || (Number(w.tiredness) || 0) >= 4;

  return (
    <section className="space-y-3">
      <SectionHeader title="Team readiness" icon={HeartPulse} />
      <Card elevation="flat" className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-ink-faint font-medium">
            {wellness.length} checked in today
          </span>
          <button
            type="button"
            onClick={() => setShowPlayers((s) => !s)}
            aria-expanded={showPlayers}
            className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-primary inline-flex items-center gap-1 press"
          >
            {showPlayers ? "Hide players" : `View ${wellness.length} player${wellness.length === 1 ? "" : "s"}`}
            {showPlayers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {METRICS.map(({ key, label, color }) => (
            <div key={key}>
              <div className="font-display font-bold text-[26px] leading-none text-ink tabular">
                {wellness.length ? avg(key).toFixed(1) : "—"}
                <span className="text-[11px] text-ink-faint font-medium ml-0.5">/5</span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint font-bold my-1.5">
                {label}
              </div>
              <ProgressBar
                value={wellness.length ? avg(key) / 5 : 0}
                from={color}
                to={color}
                height={6}
              />
            </div>
          ))}
        </div>
      </Card>
      {showPlayers &&
        (wellness.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="No check-ins yet"
            body="Players' wellness check-ins will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {wellness.map((w) => {
              const flag = flagged(w);
              const open = openPlayer === w.id || openPlayer === w.uid || openPlayer === w.name;
              return (
                <li key={w.id || w.uid || w.name}>
                  <Card elevation="flat" className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenPlayer(open ? null : w.id || w.uid || w.name)}
                      aria-expanded={open}
                      className="w-full p-3 flex items-center gap-3 text-left"
                    >
                      <Avatar
                        photoURL={w.photoURL}
                        initials={initialsOf(w.initials || w.name)}
                        size={38}
                        ring={flag}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink flex items-center gap-1.5 flex-wrap">
                          {w.name || "Player"}
                          {flag && (
                            <Badge tone="red" icon={Flag}>
                              Monitor
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-faint mt-0.5">
                          Energy {w.feeling} · Soreness {w.soreness} · Tired {w.tiredness}
                          {w.time ? ` · ${w.time}` : ""}
                        </div>
                      </div>
                      {open ? (
                        <ChevronUp className="w-4 h-4 text-ink-faint flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-faint flex-shrink-0" />
                      )}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-[var(--th-surface-2)] pt-3">
                        {METRICS.map(({ key, label, color }) => (
                          <div key={key}>
                            <div className="flex justify-between text-[11px] font-semibold text-ink-soft mb-1">
                              <span>{label}</span>
                              <span className="tabular">{w[key]}/5</span>
                            </div>
                            <ProgressBar
                              value={(Number(w[key]) || 0) / 5}
                              from={color}
                              to={color}
                              height={6}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/* ── Nutrition compliance ───────────────────────────────────────────────── */
function NutritionCompliance({ mealLogActivityToday, playerCount }) {
  const { t } = useTheme();
  const loggedUids = new Set((mealLogActivityToday || []).map((a) => a.uid));
  const loggedCount = loggedUids.size;
  const pct = playerCount ? Math.min(1, loggedCount / playerCount) : 0;
  return (
    <Card elevation="flat" className="p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="font-bold text-sm text-ink">Nutrition today</h3>
        <span className="text-[11px] text-ink-faint font-medium tabular">
          {loggedCount} / {playerCount} logged
        </span>
      </div>
      <ProgressBar value={pct} from={t("success")} to={t("success")} height={8} />
      <p className="text-[11px] text-ink-faint mt-2.5 leading-relaxed">
        {loggedCount === 0
          ? "Nobody on the roster has logged a meal today yet."
          : playerCount > 0 && loggedCount >= playerCount
            ? "Everyone's logged at least one meal today."
            : `${playerCount - loggedCount} player${playerCount - loggedCount === 1 ? "" : "s"} haven't logged anything yet today.`}
      </p>
    </Card>
  );
}

/* ── HomePage ───────────────────────────────────────────────────────────── */
export default function HomePage({ user }) {
  const data = useHomeData(user);

  const [archiveOpen, setArchiveOpen] = useState(false);

  const firstName = (user.name || "").split(" ")[0];
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // "Now" — impure by nature; the next-up hero must compare against the
  // current moment on each render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const nextEvent = useMemo(() => {
    return (
      [...(data.eventsRaw || [])]
        .filter((e) => {
          const ms = eventStartMs(e);
          return !Number.isNaN(ms) && ms >= now;
        })
        .sort((a, b) => eventStartMs(a) - eventStartMs(b))[0] || null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.eventsRaw]);

  // AudiencePicker "people" for the assignment modal (non-admin invites).
  const people = useMemo(
    () =>
      (data.invites || [])
        .filter((i) => i.role !== "admin" && i.email)
        .map((i) => ({
          id: i.email,
          label: data.nameByEmail[i.email] || i.email,
          sub: i.email,
        })),
    [data.invites, data.nameByEmail],
  );

  const playerCount = (data.invites || []).filter((i) => i.role !== "admin").length;
  const docRosterCount = playerCount;

  return (
    <div className="px-5 pt-5 pb-6 space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">
          {todayLabel}
        </p>
        <h2 className="font-display font-bold text-[32px] leading-none text-ink mt-1">
          Welcome,
          <br />
          <span className="text-brand-primary">{firstName}.</span>
        </h2>
      </div>

      <PushCard user={user} />

      <QuoteOfDay
        quote={data.todayQuote}
        isAdmin
        addQuote={data.addQuote}
      />

      {/* Next Up hero */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          Next up
        </h3>
        <NextUpHero event={nextEvent} />
      </section>

      {/* Dashboard tiles */}
      <Dashboard data={data} />

      {/* My check-in */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          My check-in
        </h3>
        <Card elevation="flat" className="p-4">
          <WellnessCheckin user={user} />
        </Card>
      </section>

      {/* Delegated sessions */}
      <YouRunning user={user} eventsRaw={data.eventsRaw} practices={data.practices} />

      <AssignmentsSection
        assignments={data.assignments}
        teamWorkouts={data.teamWorkouts}
        groups={data.groups}
        people={people}
        addAssignment={data.addAssignment}
        deleteAssignment={data.deleteAssignment}
      />

      <AttendanceSection
        roster={data.invites}
        statuses={data.attendance}
        setStatus={data.setAttendanceStatus}
        nameByEmail={data.nameByEmail}
        reasonsToday={data.reasonsToday}
        onOpenArchive={() => setArchiveOpen(true)}
      />

      <Announcements announcements={data.announcements} actions={data} />

      <NutritionCompliance
        mealLogActivityToday={data.mealLogActivityToday}
        playerCount={playerCount}
      />

      <TeamReadiness wellness={data.wellness} />

      <DocumentsSection
        user={user}
        documents={data.documents}
        isAdmin
        rosterCount={docRosterCount}
        onUpload={data.addDocument}
        onDelete={data.deleteDocument}
        onSign={data.signDocument}
        defaultCollapsed
      />

      <RosterManager
        user={user}
        invites={data.invites}
        nameByEmail={data.nameByEmail}
        allUsers={data.allUsers}
        groups={data.groups}
        onAdd={data.addInvite}
        onRemove={data.removeInvite}
        onAddBatch={data.addInvitesBatch}
        onSetRole={data.setInviteRole}
        onRequestProfileUpdate={data.requestProfileUpdate}
        onAddGroup={data.addGroup}
        onUpdateGroupMembers={data.updateGroupMembers}
        onDeleteGroup={data.deleteGroup}
      />

      <AttendanceArchive
        open={archiveOpen}
        history={data.attendanceHistory}
        reasons={data.allAbsenceReasons}
        nameByEmail={data.nameByEmail}
        onClose={() => setArchiveOpen(false)}
      />

      {/* Forced absence-reason gate (no-op for coaches). */}
      <AbsenceReasonGate
        dates={data.unexplainedAbsences}
        onSubmit={data.submitAbsenceReason}
      />
    </div>
  );
}
