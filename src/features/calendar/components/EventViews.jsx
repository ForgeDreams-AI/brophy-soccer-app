// Calendar views + event presentation components (feature-private).
// Month / Week / Day / List renderers, the compact EventChip, the full
// EventCard, and the read-only EventDetailSheet (practice plan + workout
// expansion). All dates are local — `todayKey()` from lib/dates.
import { useMemo } from "react";
import {
  CalendarX2,
  ChevronRight,
  ClipboardList,
  Clock,
  Dumbbell,
  Lock,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import SectionHeader from "../../../components/ui/SectionHeader";
import Sheet from "../../../components/ui/Sheet";
import {
  formatDayKey,
  formatHourTime,
  parseDayKey,
  todayKey,
} from "../../../lib/dates";
import { formatPrescription } from "../../../lib/lifting";
import { visibleToText } from "../../../lib/audience";

export const EVENT_TYPES = ["Practice", "Game", "Strength", "Recovery", "Meeting"];
export const EVENT_TONE = {
  Practice: "gold",
  Game: "red",
  Strength: "navy",
  Recovery: "green",
  Meeting: "blue",
};

// Theme-var-based type tints (no hard-coded team colors).
export const eventChipClass = (type) =>
  ({
    Practice: "bg-[var(--th-accent-soft)] text-[var(--th-primary-deep)]",
    Game: "bg-red-50 text-[var(--th-danger)]",
    Strength: "bg-[color-mix(in_srgb,var(--th-primary)_10%,transparent)] text-brand-primary",
    Recovery: "bg-emerald-50 text-emerald-700",
    Meeting: "bg-sky-50 text-sky-700",
  }[type] || "bg-[var(--th-surface-2)] text-ink-soft");

// Date arithmetic helpers (local, for view navigation).
const shiftDate = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const dayKeyOf = (d) => formatDayKey(d);

// ── Compact chip (month / week cells) ───────────────────────────────────
export function EventChip({ ev, onClick }) {
  return (
    <button
      onClick={onClick}
      title={`${ev.title} · ${formatHourTime(ev.start)}`}
      className={`press flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-semibold leading-tight ${eventChipClass(ev.type)} ${
        ev.isPrivate ? "ring-1 ring-inset ring-[var(--th-ink-3)]" : ""
      }`}
    >
      {ev.isPrivate && <Lock className="h-3 w-3 flex-shrink-0" aria-label="Private" />}
      <span className="min-w-0 truncate">
        {formatHourTime(ev.start).replace(/:00 /, " ")} {ev.title}
      </span>
    </button>
  );
}

// ── Full card (day / list views) ────────────────────────────────────────
export function EventCard({
  ev,
  isAdmin,
  onEdit,
  onDelete,
  onOpen,
  nameByUid = {},
  practices = [],
  teamWorkouts = [],
  groups = [],
}) {
  const canEdit = isAdmin || ev.isPrivate;
  const runByName = ev.runByUid ? nameByUid[ev.runByUid] || ev.runByName || "" : ev.runByName || "";
  const practice = ev.practiceId ? practices.find((p) => p.id === ev.practiceId) : null;
  const workout = ev.workoutId ? teamWorkouts.find((w) => w.id === ev.workoutId) : null;
  const openable = !!(practice || workout || ev.coachNotes);
  const addressed =
    isAdmin && ev.visibleTo && (ev.visibleTo.groupIds?.length || ev.visibleTo.uids?.length || ev.visibleTo.emails?.length);

  return (
    <li>
      <Card elevation="raised">
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => onOpen?.(ev)} className="press min-w-0 flex-1 text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={EVENT_TONE[ev.type] || "navy"}>{ev.type || "Event"}</Badge>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
                <Clock className="h-3 w-3" />
                {formatHourTime(ev.start)}–{formatHourTime(ev.end)}
              </span>
              {ev.isPrivate && <Badge icon={Lock}>Private</Badge>}
              {runByName && <Badge tone="blue">Run by {runByName}</Badge>}
            </div>
            <h4 className="font-display text-[18px] font-bold uppercase leading-tight tracking-wide text-ink">
              {ev.title}
            </h4>
            {ev.location && (
              <p className="mt-1 flex items-center gap-1 text-[12px] text-ink-soft">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {ev.location}
              </p>
            )}
            {(practice || workout) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {practice && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--th-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--th-primary-deep)]">
                    <ClipboardList className="h-3 w-3" />
                    {practice.name || "Practice"} · {(practice.blocks || []).length} drill
                    {(practice.blocks || []).length === 1 ? "" : "s"}
                  </span>
                )}
                {workout && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--th-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--th-primary-deep)]">
                    <Dumbbell className="h-3 w-3" />
                    {workout.name || "Workout"} · {(workout.exercises || []).length} exercise
                    {(workout.exercises || []).length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
            {addressed && (
              <p className="mt-1.5 text-[11px] font-semibold text-ink-faint">
                Only: {visibleToText(ev.visibleTo, groups)}
              </p>
            )}
            {openable && (
              <div className="mt-2 flex items-center gap-0.5 text-[11px] font-bold text-brand-accent">
                View details <ChevronRight className="h-3.5 w-3.5" />
              </div>
            )}
          </button>
          {canEdit && (
            <div className="flex flex-shrink-0 flex-col gap-1.5">
              <button
                onClick={onEdit}
                title="Edit"
                aria-label="Edit event"
                className="press flex h-8 w-8 items-center justify-center rounded-full bg-[var(--th-surface-2)]"
              >
                <Pencil className="h-4 w-4 text-ink-soft" />
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                aria-label="Delete event"
                className="press flex h-8 w-8 items-center justify-center rounded-full bg-[var(--th-surface-2)]"
              >
                <Trash2 className="h-4 w-4 text-[var(--th-danger)]" />
              </button>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}

// ── Read-only detail (bottom sheet) ─────────────────────────────────────
// Expands the attached practice plan (drills) and/or team workout
// (exercises with prescriptions) plus the coach's notes.
export function EventDetailSheet({
  ev,
  practices = [],
  teamWorkouts = [],
  nameByUid = {},
  isAdmin,
  onEdit,
  onDelete,
  onClose,
}) {
  const practice = ev?.practiceId ? practices.find((p) => p.id === ev.practiceId) : null;
  const workout = ev?.workoutId ? teamWorkouts.find((w) => w.id === ev.workoutId) : null;
  const runByName = ev?.runByUid ? nameByUid[ev.runByUid] || ev.runByName || "" : ev?.runByName || "";
  const dateStr = ev?.date
    ? parseDayKey(ev.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "";
  const canEdit = ev && (isAdmin || ev.isPrivate);

  return (
    <Sheet
      open={!!ev}
      onClose={onClose}
      title={ev?.title || ""}
      subtitle={dateStr}
      size="md"
      footer={
        ev && canEdit ? (
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="press flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-brand-primary px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={onDelete}
              className="press flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--th-danger)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : undefined
      }
    >
      {ev && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={EVENT_TONE[ev.type] || "navy"}>{ev.type || "Event"}</Badge>
            <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-soft">
              <Clock className="h-3.5 w-3.5" />
              {formatHourTime(ev.start)}–{formatHourTime(ev.end)}
            </span>
            {ev.location && (
              <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-soft">
                <MapPin className="h-3.5 w-3.5" />
                {ev.location}
              </span>
            )}
            {ev.isPrivate && <Badge icon={Lock}>Private</Badge>}
            {runByName && <Badge tone="blue">Run by {runByName}</Badge>}
          </div>

          {ev.coachNotes && (
            <div>
              <SectionHeader title="Coach notes" className="mb-2" />
              <p className="whitespace-pre-wrap rounded-[14px] bg-[var(--th-surface-2)] p-3 text-sm leading-relaxed text-ink">
                {ev.coachNotes}
              </p>
            </div>
          )}

          {practice && (
            <div>
              <SectionHeader
                title="Practice plan"
                icon={ClipboardList}
                className="mb-2"
                action={
                  <span className="text-[11px] font-bold text-ink-faint">
                    {practice.name || "Practice"}
                  </span>
                }
              />
              <ul className="space-y-1.5">
                {(practice.blocks || []).map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      <span className="font-semibold">{b.name}</span>
                      {b.dur ? ` · ${b.dur}` : ""}
                      {b.notes ? <span className="text-ink-soft"> — {b.notes}</span> : ""}
                    </span>
                  </li>
                ))}
                {!(practice.blocks || []).length && (
                  <li className="text-[12px] italic text-ink-faint">No drills in this plan yet.</li>
                )}
              </ul>
            </div>
          )}
          {ev.practiceId && !practice && (
            <p className="text-[12px] italic text-ink-faint">Practice plan unavailable.</p>
          )}

          {workout && (
            <div>
              <SectionHeader
                title="Workout"
                icon={Dumbbell}
                className="mb-2"
                action={
                  <span className="text-[11px] font-bold text-ink-faint">
                    {workout.name || "Workout"}
                  </span>
                }
              />
              <ul className="space-y-2">
                {(workout.exercises || []).map((ex, i) => (
                  <li key={i}>
                    <div className="text-sm font-semibold leading-tight text-ink">{ex.name}</div>
                    <div className="text-[11px] text-ink-soft">{formatPrescription(ex)}</div>
                  </li>
                ))}
                {!(workout.exercises || []).length && (
                  <li className="text-[12px] italic text-ink-faint">No exercises in this workout yet.</li>
                )}
              </ul>
            </div>
          )}
          {ev.workoutId && !workout && (
            <p className="text-[12px] italic text-ink-faint">Workout unavailable.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ── Month view ──────────────────────────────────────────────────────────
export function MonthView({ cursorKey, eventsByDate, onPickDay, onOpen }) {
  const cursor = parseDayKey(cursorKey);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const start = shiftDate(first, -((first.getDay() + 7) % 7)); // Sunday start
  const today = todayKey();
  const cells = [];
  let d = new Date(start);
  while ((d <= last || d.getDay() !== 0) && cells.length < 42) {
    cells.push(new Date(d));
    d = shiftDate(d, 1);
  }
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <Card elevation="raised" className="overflow-hidden !p-0">
      <div className="grid grid-cols-7 border-b border-[var(--th-surface-2)] bg-[var(--th-surface-2)]/50">
        {dayNames.map((n, i) => (
          <div
            key={i}
            className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-ink-faint"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const key = dayKeyOf(day);
          const isToday = key === today;
          const dayEvents = eventsByDate[key] || [];
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onPickDay(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onPickDay(key);
              }}
              className={`min-h-[68px] cursor-pointer border-b border-r border-[var(--th-surface-2)] p-1 hover:bg-[var(--th-surface-2)]/40 ${
                inMonth ? "" : "opacity-50"
              } ${i % 7 === 6 ? "border-r-0" : ""}`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  isToday ? "bg-brand-primary text-white" : "text-ink"
                }`}
              >
                {day.getDate()}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <EventChip
                    key={ev.id}
                    ev={ev}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(ev);
                    }}
                  />
                ))}
                {dayEvents.length > 2 && (
                  <div className="px-1 text-[11px] font-semibold text-ink-faint">
                    +{dayEvents.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Week view ───────────────────────────────────────────────────────────
export function WeekView({ cursorKey, eventsByDate, cardProps }) {
  const cursor = parseDayKey(cursorKey);
  const start = shiftDate(cursor, -((cursor.getDay() + 7) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  const today = todayKey();

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const key = dayKeyOf(d);
        const evs = eventsByDate[key] || [];
        const isToday = key === today;
        return (
          <Card
            key={key}
            elevation="raised"
            className={isToday ? "!border-[color-mix(in_srgb,var(--th-primary)_40%,transparent)]" : ""}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-display text-[18px] font-bold uppercase tracking-wide ${
                    isToday ? "text-brand-primary" : "text-ink"
                  }`}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
                </span>
                {isToday && <Badge tone="navy">Today</Badge>}
              </div>
              <span className="text-[11px] font-semibold text-ink-faint">
                {evs.length} event{evs.length === 1 ? "" : "s"}
              </span>
            </div>
            {evs.length === 0 ? (
              <p className="text-[12px] italic text-ink-faint">Nothing scheduled.</p>
            ) : (
              <div className="space-y-1">
                {evs.map((ev) => (
                  <EventChip
                    key={ev.id}
                    ev={ev}
                    onClick={() => cardProps.onOpen(ev)}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Day view ────────────────────────────────────────────────────────────
export function DayView({ cursorKey, eventsByDate, cardPropsFor }) {
  const evs = eventsByDate[cursorKey] || [];
  if (!evs.length) {
    return (
      <Card elevation="raised">
        <EmptyState icon={CalendarX2} title="No events" body="Nothing scheduled for this day." />
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {evs.map((ev) => (
        <EventCard key={ev.id} ev={ev} {...cardPropsFor(ev)} />
      ))}
    </ul>
  );
}

// ── Upcoming list view ──────────────────────────────────────────────────
export function ListView({ allEvents, cardPropsFor }) {
  const groups = useMemo(() => {
    const today = todayKey();
    const upcoming = allEvents.filter((e) => (e.date || "") >= today);
    const map = {};
    upcoming.forEach((e) => {
      (map[e.date] = map[e.date] || []).push(e);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [allEvents]);

  if (!groups.length) {
    return (
      <Card elevation="raised">
        <EmptyState icon={CalendarX2} title="No events" body="No upcoming events on the schedule." />
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map(([date, evs]) => (
        <div key={date}>
          <h4 className="mb-2 font-display text-[18px] font-bold uppercase tracking-wide text-ink-soft">
            {parseDayKey(date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h4>
          <ul className="space-y-2">
            {evs.map((ev) => (
              <EventCard key={ev.id} ev={ev} {...cardPropsFor(ev)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Shared card props factory note: CalendarPage builds
// cardPropsFor(ev) → { isAdmin, nameByUid, practices, teamWorkouts, groups,
//                      onOpen, onEdit, onDelete }.
