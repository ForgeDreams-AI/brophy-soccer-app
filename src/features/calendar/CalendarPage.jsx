// CalendarPage — the team's schedule. Month / week / day / upcoming list
// views, date navigation, team + personal events, admin group management,
// CSV import, and auto reminders/polls. All dates local (todayKey()).
import { useMemo, useState } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Upload,
  Users,
} from "lucide-react";
import Btn from "../../components/ui/Btn";
import SegmentedControl from "../../components/ui/SegmentedControl";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useLocalStorage } from "../../data/hooks";
import { toast } from "../../lib/toast";
import {
  addDays as shiftDayKey,
  formatDayKey,
  parseDayKey,
  todayKey,
} from "../../lib/dates";
import { useCalendar } from "./hooks";
import {
  DayView,
  EventDetailSheet,
  ListView,
  MonthView,
  WeekView,
} from "./components/EventViews";
import GroupsModal from "./components/GroupsModal";
import AddEventSheet from "./components/AddEventSheet";
import ImportPanel from "./components/ImportPanel";

const VIEW_OPTIONS = [
  { value: "month", label: "Month", icon: CalendarDays },
  { value: "week", label: "Week", icon: CalendarRange },
  { value: "day", label: "Day", icon: Calendar },
  { value: "list", label: "Upcoming", icon: List },
];

export default function CalendarPage({ user }) {
  const cal = useCalendar(user);
  const isAdmin = user.role === "admin";
  const confirm = useConfirm();

  const [view, setView] = useLocalStorage("teamhub-cal-view", "list");
  const [cursorKey, setCursorKey] = useState(todayKey());
  const [detailEvent, setDetailEvent] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null); // { id, isPrivate } | null
  const [importing, setImporting] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);

  // Merge team events + personal events (isPrivate flag) for rendering.
  const allEvents = useMemo(() => {
    const merged = [
      ...cal.events,
      ...cal.personalEvents.map((p) => ({ ...p, isPrivate: true })),
    ];
    merged.sort((a, b) =>
      String(a.date + (a.start || "")).localeCompare(String(b.date + (b.start || ""))),
    );
    return merged;
  }, [cal.events, cal.personalEvents]);

  const eventsByDate = useMemo(() => {
    const map = {};
    allEvents.forEach((e) => {
      if (!e.date) return;
      (map[e.date] = map[e.date] || []).push(e);
    });
    return map;
  }, [allEvents]);

  const nameByUid = useMemo(
    () =>
      Object.fromEntries(
        (cal.allUsers || []).map((u) => [u.id, u.name || u.email || ""]),
      ),
    [cal.allUsers],
  );

  // ── Edit / delete ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditingEvent(null);
    setSheetOpen(true);
  };
  const startEdit = (ev) => {
    setDetailEvent(null);
    setEditingEvent({ id: ev.id, isPrivate: !!ev.isPrivate });
    setSheetOpen(true);
  };
  const handleDelete = async (ev) => {
    const ok = await confirm({
      title: "Delete event?",
      body: `"${ev.title}" will be removed${ev.isPrivate ? " from your personal calendar" : " from the team calendar"}. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      if (ev.isPrivate) await cal.deletePersonalEvent(ev.id);
      else await cal.deleteEvent(ev.id);
      setDetailEvent(null);
      toast("Event deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  // Shared card props, with per-event edit/delete handlers.
  const cardPropsBase = {
    isAdmin,
    nameByUid,
    practices: cal.practices,
    teamWorkouts: cal.teamWorkouts,
    groups: cal.groups,
    onOpen: setDetailEvent,
  };
  const cardPropsFor = (ev) => ({
    ...cardPropsBase,
    onEdit: () => startEdit(ev),
    onDelete: () => handleDelete(ev),
  });

  // ── View navigation ─────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    const cursor = parseDayKey(cursorKey);
    if (view === "month")
      return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (view === "week") {
      const s = new Date(cursor);
      s.setDate(s.getDate() - ((s.getDay() + 7) % 7));
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${s.toLocaleDateString("en-US", { month: "short" })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
        : `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
    }
    if (view === "day")
      return cursor.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return "All upcoming";
  }, [view, cursorKey]);

  const nav = (dir) => {
    if (view === "month") {
      const c = parseDayKey(cursorKey);
      setCursorKey(formatDayKey(new Date(c.getFullYear(), c.getMonth() + dir, 1)));
    } else if (view === "week") {
      setCursorKey(shiftDayKey(cursorKey, 7 * dir));
    } else if (view === "day") {
      setCursorKey(shiftDayKey(cursorKey, dir));
    }
  };

  return (
    <div className="space-y-4 px-5 pb-8 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[26px] font-bold uppercase leading-none tracking-wide text-ink">
          Schedule
        </h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Btn variant="outline" size="sm" icon={Users} onClick={() => setGroupsOpen(true)}>
              Groups
            </Btn>
          )}
          {isAdmin && (
            <Btn variant="outline" size="sm" icon={Upload} onClick={() => setImporting((v) => !v)}>
              Import
            </Btn>
          )}
          <Btn variant="primary" size="sm" icon={Plus} onClick={openAdd}>
            Add
          </Btn>
        </div>
      </div>

      {/* View switcher */}
      <SegmentedControl
        ariaLabel="Calendar view"
        className="w-full [&>button]:flex-1"
        options={VIEW_OPTIONS}
        value={view}
        onChange={setView}
      />

      {/* Date navigation (month / week / day) */}
      {view !== "list" && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => nav(-1)}
            aria-label="Previous"
            className="press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--th-surface)] shadow-card"
          >
            <ChevronLeft className="h-4 w-4 text-ink-soft" />
          </button>
          <div className="min-w-0 flex-1 text-center text-sm font-bold text-ink">{navLabel}</div>
          <button
            onClick={() => setCursorKey(todayKey())}
            className="press flex-shrink-0 rounded-full border border-[var(--th-surface-2)] bg-[var(--th-surface)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft"
          >
            Today
          </button>
          <button
            onClick={() => nav(1)}
            aria-label="Next"
            className="press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--th-surface)] shadow-card"
          >
            <ChevronRight className="h-4 w-4 text-ink-soft" />
          </button>
        </div>
      )}

      {/* Admin import panel */}
      {isAdmin && importing && <ImportPanel importEvents={cal.importEvents} />}

      {/* Views */}
      {view === "month" && (
        <MonthView
          cursorKey={cursorKey}
          eventsByDate={eventsByDate}
          onPickDay={(key) => {
            setCursorKey(key);
            setView("day");
          }}
          onOpen={setDetailEvent}
        />
      )}
      {view === "week" && (
        <WeekView
          cursorKey={cursorKey}
          eventsByDate={eventsByDate}
          cardProps={{ onOpen: setDetailEvent }}
        />
      )}
      {view === "day" && (
        <DayView cursorKey={cursorKey} eventsByDate={eventsByDate} cardPropsFor={cardPropsFor} />
      )}
      {view === "list" && <ListView allEvents={allEvents} cardPropsFor={cardPropsFor} />}

      {/* Overlays */}
      <AddEventSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditingEvent(null);
        }}
        user={user}
        cal={cal}
        editing={editingEvent}
        defaultDate={cursorKey}
      />

      <GroupsModal
        open={groupsOpen}
        groups={cal.groups}
        allUsers={cal.allUsers}
        invites={cal.invites}
        onClose={() => setGroupsOpen(false)}
        addGroup={cal.addGroup}
        updateGroupMembers={cal.updateGroupMembers}
        deleteGroup={cal.deleteGroup}
      />

      <EventDetailSheet
        ev={detailEvent}
        practices={cal.practices}
        teamWorkouts={cal.teamWorkouts}
        nameByUid={nameByUid}
        isAdmin={isAdmin}
        onEdit={() => detailEvent && startEdit(detailEvent)}
        onDelete={() => detailEvent && handleDelete(detailEvent)}
        onClose={() => setDetailEvent(null)}
      />
    </div>
  );
}
