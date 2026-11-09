// AddEventSheet — bottom sheet for creating/editing events. Admins get a
// Team-wide / Personal toggle plus visibility, delegation (run-by coach,
// practice/workout attachments, coach notes), and reminders/polls. Players
// only ever create personal events. All writes stamp audienceKeys via the
// feature hooks (lib/audience) — the UI only authors `visibleTo`.
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import SegmentedControl from "../../../components/ui/SegmentedControl";
import SearchInput from "../../../components/ui/SearchInput";
import Field, { Input, Select, TextArea } from "../../../components/ui/Field";
import Badge from "../../../components/ui/Badge";
import { toast } from "../../../lib/toast";
import { todayKey } from "../../../lib/dates";
import { visibleToText } from "../../../lib/audience";
import { EVENT_TYPES } from "./EventViews";
import EventRemindersEditor from "./EventRemindersEditor";

const rrid = () => Math.random().toString(36).slice(2, 8);

export default function AddEventSheet({ open, onClose, user, cal, editing, defaultDate }) {
  const isAdmin = user.role === "admin";
  const [addMode, setAddMode] = useState("team");
  const [form, setForm] = useState(null);
  const [visibility, setVisibility] = useState({ mode: "everyone", groupIds: [], uids: [] });
  const [playerSearch, setPlayerSearch] = useState("");

  const coaches = useMemo(
    () => (cal.allUsers || []).filter((u) => u.role === "admin"),
    [cal.allUsers],
  );
  const reminderChannels = useMemo(
    () => [{ id: "team", name: "Team" }, ...(cal.chatGroups || []).map((c) => ({ id: c.id, name: c.name }))],
    [cal.chatGroups],
  );
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return cal.allUsers || [];
    return (cal.allUsers || []).filter((p) =>
      `${p.name || ""} ${p.email || ""}`.toLowerCase().includes(q),
    );
  }, [cal.allUsers, playerSearch]);

  const blank = () => ({
    title: "",
    date: defaultDate || todayKey(),
    start: "15:00",
    end: "17:00",
    location: "",
    type: "Practice",
    runByUid: "",
    practiceId: "",
    workoutId: "",
    coachNotes: "",
    reminders: [],
  });

  // (Re)initialize whenever the sheet opens: prefill when editing, blank
  // otherwise. Render-synced with a previous-value guard instead of an
  // effect — the form state is derived from the open/editing props.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const ev = editing
        ? (editing.isPrivate
            ? cal.personalEvents.find((p) => p.id === editing.id)
            : cal.events.find((e) => e.id === editing.id))
        : null;
      if (ev) {
        setForm({
          title: ev.title || "",
          date: ev.date || defaultDate || todayKey(),
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
      } else {
        setForm(blank());
        setAddMode(isAdmin ? "team" : "personal");
        setVisibility({ mode: "everyone", groupIds: [], uids: [] });
      }
      setPlayerSearch("");
    }
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast("Give the event a title.");
      return;
    }
    if (form.start && form.end && form.end <= form.start) {
      toast("End time must be after the start time.");
      return;
    }
    try {
      const data = { ...form, title: form.title.trim(), location: form.location.trim() };
      if (addMode === "personal") {
        // Personal events never carry delegation or auto-reminder fields.
        delete data.runByUid;
        delete data.practiceId;
        delete data.workoutId;
        delete data.coachNotes;
        delete data.reminders;
        delete data.startAt;
        if (editing && editing.isPrivate) await cal.updatePersonalEvent(editing.id, data);
        else await cal.addPersonalEvent(data);
      } else {
        // Delegation: which coach runs this session + the plan/workout/notes.
        data.runByUid = form.runByUid || null;
        data.runByName = form.runByUid
          ? coaches.find((c) => c.id === form.runByUid)?.name || ""
          : user.name || "Coach";
        data.practiceId = form.practiceId || null;
        data.workoutId = form.workoutId || null;
        data.workoutName = form.workoutId
          ? cal.teamWorkouts.find((w) => w.id === form.workoutId)?.name || ""
          : "";
        data.coachNotes = (form.coachNotes || "").trim() || null;
        // Cleaned reminder/poll list + absolute start instant (local → Date)
        // so a Cloud Function can fire them before kickoff.
        data.reminders = (form.reminders || []).map((r) => ({
          id: r.id || rrid(),
          type: r.type === "poll" ? "poll" : "reminder",
          offsetMin: Math.max(1, Math.round(Number(r.offsetMin) || 0)),
          ...(r.type === "poll"
            ? {
                channel: r.channel || "team",
                channelName: r.channelName || "Team",
                question: (r.question || "").trim(),
                options: ["In", "Out", "Maybe"],
              }
            : {}),
        }));
        data.startAt = form.date && form.start ? new Date(`${form.date}T${form.start}:00`) : null;
        if (
          isAdmin &&
          visibility.mode === "custom" &&
          (visibility.groupIds.length || visibility.uids.length)
        ) {
          data.visibleTo = { groupIds: visibility.groupIds, uids: visibility.uids };
        } else if (editing) {
          // Clear visibility when saving back to "Everyone".
          data.visibleTo = null;
        }
        if (editing && !editing.isPrivate) await cal.updateEvent(editing.id, data);
        else await cal.addEvent(data);
      }
      toast(editing ? "Event updated." : "Event added.", "success");
      onClose();
    } catch (e) {
      toast("Couldn't save event — " + (e.message || "check Firestore rules."));
    }
  };

  if (!form) return null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit event" : "New event"}
      subtitle={addMode === "personal" ? "Personal — only you can see this" : "Team calendar"}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Btn variant="ghost" size="md" onClick={onClose} className="flex-1">
            Cancel
          </Btn>
          <Btn variant="primary" size="md" onClick={save} className="flex-1">
            {editing ? "Save changes" : addMode === "personal" ? "Add to my calendar" : "Add to calendar"}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3">
        {isAdmin && (
          <SegmentedControl
            ariaLabel="Event audience"
            className="w-full [&>button]:flex-1"
            options={[
              { value: "team", label: "Team-wide" },
              { value: "personal", label: "Personal" },
            ]}
            value={addMode}
            onChange={setAddMode}
          />
        )}
        {!isAdmin && (
          <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-faint">
            <Lock className="h-3.5 w-3.5" /> Personal event — only you can see this.
          </p>
        )}

        <Field label="Title">
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Event title"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {EVENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Start">
            <Input type="time" value={form.start} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          <Field label="End">
            <Input type="time" value={form.end} onChange={(e) => set({ end: e.target.value })} />
          </Field>
        </div>

        <Field label="Location">
          <Input
            value={form.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Location"
          />
        </Field>

        {isAdmin && addMode === "team" && (
          <div className="rounded-[14px] bg-[var(--th-surface-2)] p-2.5">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
              Visible to
            </div>
            <SegmentedControl
              ariaLabel="Visibility"
              className="w-full bg-[var(--th-surface)] [&>button]:flex-1"
              options={[
                { value: "everyone", label: "Everyone" },
                { value: "custom", label: "Custom" },
              ]}
              value={visibility.mode}
              onChange={(mode) => setVisibility({ ...visibility, mode })}
            />
            {visibility.mode === "custom" && (
              <div className="mt-2 space-y-2">
                {(cal.groups || []).length > 0 && (
                  <div>
                    <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                      Groups
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(cal.groups || []).map((g) => {
                        const on = visibility.groupIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() =>
                              setVisibility({
                                ...visibility,
                                groupIds: on
                                  ? visibility.groupIds.filter((x) => x !== g.id)
                                  : [...visibility.groupIds, g.id],
                              })
                            }
                            aria-pressed={on}
                            className={`press rounded-full px-3 py-1.5 text-[11px] font-bold ${
                              on
                                ? "bg-brand-primary text-white"
                                : "bg-[var(--th-surface)] text-ink-soft"
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(cal.allUsers || []).length > 0 && (
                  <div>
                    <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                      Specific players ({visibility.uids.length} selected)
                    </div>
                    <SearchInput
                      value={playerSearch}
                      onChange={setPlayerSearch}
                      placeholder="Search players"
                      className="mb-1.5 [&_input]:!bg-[var(--th-surface)]"
                    />
                    <ul className="max-h-44 divide-y divide-[var(--th-surface-2)] overflow-y-auto rounded-[12px] bg-[var(--th-surface)] px-2">
                      {filteredPlayers.map((p) => {
                        const on = visibility.uids.includes(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              onClick={() =>
                                setVisibility({
                                  ...visibility,
                                  uids: on
                                    ? visibility.uids.filter((x) => x !== p.id)
                                    : [...visibility.uids, p.id],
                                })
                              }
                              aria-pressed={on}
                              className="press flex w-full items-center justify-between gap-2 py-2 text-left"
                            >
                              <span className="min-w-0 truncate text-[12px] font-semibold text-ink">
                                {p.name || p.email}
                              </span>
                              <Badge tone={on ? "green" : "navy"} className={on ? "" : "!bg-[var(--th-surface-2)] !text-ink-faint"}>
                                {on ? "Selected" : "Add"}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {!(cal.groups || []).length && !(cal.allUsers || []).length && (
                  <p className="px-1 text-[11px] italic text-ink-faint">
                    No groups or signed-in players yet. Create a group via the Groups button, or
                    wait for players to sign in.
                  </p>
                )}
              </div>
            )}
            {visibility.mode === "everyone" && (
              <p className="mt-2 px-1 text-[11px] text-ink-faint">Everyone on the team can see it.</p>
            )}
            {visibility.mode === "custom" && (visibility.groupIds.length || visibility.uids.length) > 0 && (
              <p className="mt-2 px-1 text-[11px] font-semibold text-ink-soft">
                {visibleToText({ groupIds: visibility.groupIds, uids: visibility.uids }, cal.groups)}
              </p>
            )}
          </div>
        )}

        {isAdmin && addMode === "team" && (
          <div className="rounded-[14px] bg-[var(--th-surface-2)] p-2.5">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
              Run by / plan{" "}
              <span className="font-medium normal-case tracking-normal text-ink-faint">
                — optional
              </span>
            </div>
            <div className="space-y-2">
              <Field>
                <Select value={form.runByUid} onChange={(e) => set({ runByUid: e.target.value })}>
                  <option value="">Run by — head coach (default)</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Select value={form.practiceId} onChange={(e) => set({ practiceId: e.target.value })}>
                  <option value="">No practice plan attached</option>
                  {(cal.practices || []).map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name || "Untitled practice"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Select value={form.workoutId} onChange={(e) => set({ workoutId: e.target.value })}>
                  <option value="">No workout attached</option>
                  {(cal.teamWorkouts || []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || "Untitled workout"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <TextArea
                  value={form.coachNotes}
                  onChange={(e) => set({ coachNotes: e.target.value })}
                  rows={2}
                  placeholder="Notes for the coach running this — focus, intensity, reminders…"
                />
              </Field>
            </div>
          </div>
        )}

        {isAdmin && addMode === "team" && (
          <EventRemindersEditor
            reminders={form.reminders}
            setReminders={(r) => set({ reminders: r })}
            channels={reminderChannels}
          />
        )}
      </div>
    </Sheet>
  );
}
