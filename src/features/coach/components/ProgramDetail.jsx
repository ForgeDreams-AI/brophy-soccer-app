// Programs — build/view a program (an ordered sequence of days, each pointing
// to a practice) and assign it to the calendar.
//
// Program doc: { name, desc, published, days: [{ label, practiceId, note }] }.
// "Assign to calendar" opens a custom modal (never window.prompt) asking for a
// start date AND session start/end times (v1 hard-coded 15:00–17:00), then
// writes one event per day via batched importEvents with notify:false.

import { useEffect, useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  CalendarDays,
  Layers,
  Goal,
} from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { Field, Input } from "../../../components/ui/Field";
import EmptyState from "../../../components/ui/EmptyState";
import { toast } from "../../../lib/toast";
import { todayKey, addDays, formatHourTime } from "../../../lib/dates";

// ─── Pick a practice for a program day ──────────────────────────────────────
const PracticePicker = ({ practices, onPick, onClose }) => (
  <Sheet open onClose={onClose} title="Pick a practice" size="lg">
    <div className="px-5 py-4 space-y-2">
      {practices.length === 0 && (
        <p className="text-sm text-ink-faint italic text-center py-6">
          No practices yet — build one in the Practices section first.
        </p>
      )}
      {practices.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className="w-full bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] flex items-center justify-between gap-2 hover:bg-[var(--th-bg)] text-left"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink truncate">{p.name}</div>
            <div className="text-[11px] text-ink-faint">{p.blocks?.length || 0} drills</div>
          </div>
          <Plus className="w-4 h-4 text-ink-faint flex-shrink-0" />
        </button>
      ))}
    </div>
  </Sheet>
);

// ─── "Assign to calendar" modal ─────────────────────────────────────────────
// Asks for a start date and session start/end times (replacing v1's blocking
// window.prompt and its hard-coded 15:00–17:00), then the caller writes one
// event per program day via batched importEvents.
const AssignSheet = ({ program, practiceById, onAssign, onClose }) => {
  const [startDate, setStartDate] = useState(todayKey());
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("17:00");
  const [busy, setBusy] = useState(false);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startTime && endTime;
  const days = program.days?.length || 0;

  const submit = async () => {
    if (!valid || !days) return;
    setBusy(true);
    try {
      const rows = program.days.map((day, i) => {
        const practice = practiceById(day.practiceId);
        return {
          title: `${program.name}: ${day.label || `Day ${i + 1}`}${
            practice ? ` — ${practice.name}` : ""
          }`,
          date: addDays(startDate, i),
          start: startTime,
          end: endTime,
          location: "",
          type: "Practice",
          programId: program.id,
          practiceId: day.practiceId || "",
        };
      });
      await onAssign(rows);
      toast(
        `Added ${rows.length} session${rows.length === 1 ? "" : "s"} to the calendar.`,
        "success",
      );
      onClose();
    } catch (e) {
      toast("Couldn't assign — " + (e.message || "check rules."));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Assign to calendar"
      subtitle={`${program.name} · ${days} day${days === 1 ? "" : "s"}`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Btn variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn className="flex-1" onClick={submit} loading={busy} disabled={!valid || busy}>
            Assign {days} session{days === 1 ? "" : "s"}
          </Btn>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-3">
        <Field label="Start date — Day 1" hint="One calendar session per program day, in order.">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date for Day 1"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Session start">
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-label="Session start time"
            />
          </Field>
          <Field label="Session end">
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="Session end time"
            />
          </Field>
        </div>
        <p className="text-[11px] text-ink-faint leading-relaxed">
          Day 1 → {startDate}
          {formatHourTime(startTime) && ` · ${formatHourTime(startTime)}`}
          {formatHourTime(endTime) && `–${formatHourTime(endTime)}`}. Players are not
          notified about imported sessions.
        </p>
      </div>
    </Sheet>
  );
};

const ProgramCard = ({ program, onOpen }) => (
  <button
    onClick={onOpen}
    className="w-full bg-[var(--th-surface)] rounded-xl p-4 shadow-card border border-[var(--th-surface-2)] flex items-center justify-between gap-3 text-left"
  >
    <div className="min-w-0">
      <div className="font-bold text-sm text-ink leading-tight truncate">
        {program.name || "Untitled program"}
      </div>
      <div className="text-[11px] text-ink-faint mt-0.5 truncate">
        {program.days?.length || 0} day{(program.days?.length || 0) === 1 ? "" : "s"}
        {program.desc ? ` · ${program.desc}` : ""}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {program.published && (
        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent-soft text-brand-accent">
          Published
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-ink-faint" />
    </div>
  </button>
);

// ─── ProgramDetail: single-program editor ───────────────────────────────────
export const ProgramDetail = ({ coach, program, canEdit, onBack }) => {
  const confirm = useConfirm();
  const [name, setName] = useState(program.name || "");
  const [desc, setDesc] = useState(program.desc || "");
  const [days, setDays] = useState(program.days || []);
  const [published, setPublished] = useState(!!program.published);
  const [dirty, setDirty] = useState(false);
  const [pickFor, setPickFor] = useState(null); // index of day choosing a practice
  const [assigning, setAssigning] = useState(false);

  // 700ms debounced autosave.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => {
      coach.updateProgram(program.id, { name, desc, days, published });
      setDirty(false);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, days, published, dirty]);

  const snapshot = () => ({ name, desc, days, published });
  const handleBack = () => {
    if (dirty && canEdit) coach.updateProgram(program.id, snapshot());
    onBack();
  };
  const addDay = () => {
    setDays([...days, { label: `Day ${days.length + 1}`, practiceId: "", note: "" }]);
    setDirty(true);
  };
  const setDay = (i, field, value) => {
    setDays(days.map((d, j) => (j === i ? { ...d, [field]: value } : d)));
    setDirty(true);
  };
  const removeDay = (i) => {
    setDays(days.filter((_, j) => j !== i));
    setDirty(true);
  };
  const moveDay = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= days.length) return;
    const n = [...days];
    [n[i], n[j]] = [n[j], n[i]];
    setDays(n);
    setDirty(true);
  };
  const confirmDelete = async () => {
    const ok = await confirm({
      title: `Delete "${name || "this program"}"?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await coach.deleteProgram(program.id);
      onBack();
    } catch (e) {
      toast("Couldn't delete — " + e.message);
    }
  };
  const practiceById = (id) => coach.practices.find((p) => p.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button
        onClick={handleBack}
        className="text-xs font-semibold text-ink-faint flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      {canEdit ? (
        <>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder="Program name (e.g. Preseason Week 1)"
            aria-label="Program name"
            className="!text-xl !font-bold !border-0 !border-b !rounded-none !px-0 !py-1 text-ink"
          />
          <Input
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value);
              setDirty(true);
            }}
            placeholder="Short description (optional)"
            aria-label="Program description"
            className="!border-0 !px-0 !py-0 text-ink-soft"
          />
        </>
      ) : (
        <>
          <h2 className="font-display font-bold text-[26px] uppercase tracking-wide text-ink">
            {name || "Untitled"}
          </h2>
          {desc && <p className="text-sm text-ink-soft">{desc}</p>}
        </>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-ink-faint italic text-center py-6">
          No days yet.{canEdit ? " Add one below." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {days.map((day, i) => {
            const p = practiceById(day.practiceId);
            return (
              <li
                key={day.practiceId ? `${day.practiceId}-${i}` : `day-${i}`}
                className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white bg-brand-primary">
                    {i + 1}
                  </span>
                  {canEdit ? (
                    <Input
                      value={day.label}
                      onChange={(e) => setDay(i, "label", e.target.value)}
                      placeholder={`Day ${i + 1}`}
                      aria-label={`Day ${i + 1} label`}
                      className="!border-0 !border-b !rounded-none !px-0 !py-0.5 !text-sm !font-semibold text-ink flex-1"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">
                      {day.label || `Day ${i + 1}`}
                    </span>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveDay(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveDay(i, 1)}
                        disabled={i === days.length - 1}
                        aria-label="Move down"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeDay(i)}
                        aria-label="Remove day"
                        className="text-ink-faint hover:text-[var(--th-danger)]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 pl-[34px]">
                  {canEdit ? (
                    <button
                      onClick={() => setPickFor(i)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[var(--th-surface-2)] bg-[var(--th-surface)] text-ink-soft flex items-center gap-1.5"
                    >
                      <Layers className="w-3 h-3 text-brand-accent" />{" "}
                      {p ? p.name : "Pick practice"}
                    </button>
                  ) : (
                    <div className="text-[11px] text-ink-soft flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-brand-accent" />{" "}
                      {p ? p.name : "Rest / unassigned"}
                    </div>
                  )}
                  {day.note && !canEdit && (
                    <div className="text-[11px] text-ink-faint mt-1">{day.note}</div>
                  )}
                  {canEdit && (
                    <Input
                      value={day.note}
                      onChange={(e) => setDay(i, "note", e.target.value)}
                      placeholder="Note (optional)"
                      aria-label={`Day ${i + 1} note`}
                      className="!text-xs mt-1.5"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <Btn variant="outline" className="w-full" icon={Plus} onClick={addDay}>
            Add day
          </Btn>
          <Btn
            variant="accent"
            className="w-full"
            icon={CalendarDays}
            onClick={() => {
              if (!days.length) {
                toast("Add some days to the program first.");
                return;
              }
              setAssigning(true);
            }}
          >
            Assign to calendar
          </Btn>
          <label className="flex items-center justify-between bg-[var(--th-surface)] rounded-xl px-4 py-3 shadow-card border border-[var(--th-surface-2)]">
            <span className="text-sm font-semibold text-ink-soft">Published to players</span>
            <button
              onClick={() => {
                setPublished(!published);
                setDirty(true);
              }}
              role="switch"
              aria-checked={published}
              aria-label="Toggle published"
              className="w-11 h-6 rounded-full transition-colors relative bg-[var(--th-surface-2)]"
              style={published ? { backgroundColor: "var(--th-success)" } : {}}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  published ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
          <button
            onClick={confirmDelete}
            className="w-full py-2 text-[11px] font-semibold text-[var(--th-danger)] hover:opacity-80"
          >
            Delete program
          </button>
        </>
      )}
      {dirty && canEdit && (
        <p className="text-[11px] text-ink-faint text-center">Saving…</p>
      )}
      {pickFor !== null && (
        <PracticePicker
          practices={coach.practices}
          onPick={(p) => {
            setDay(pickFor, "practiceId", p.id);
            setPickFor(null);
          }}
          onClose={() => setPickFor(null)}
        />
      )}
      {assigning && (
        <AssignSheet
          program={{ ...program, ...snapshot(), id: program.id }}
          practiceById={practiceById}
          onAssign={(rows) => coach.importEvents(rows, { notify: false })}
          onClose={() => setAssigning(false)}
        />
      )}
    </div>
  );
};

// ─── ProgramsView: library list → ProgramDetail ─────────────────────────────
export const ProgramsView = ({ user, coach, canEdit, startCreating = false }) => {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(startCreating);
  const [newName, setNewName] = useState("");
  const programs = coach.programs;

  const open = programs.find((p) => p.id === openId);
  if (open)
    return (
      <ProgramDetail
        user={user}
        coach={coach}
        program={open}
        canEdit={canEdit}
        onBack={() => setOpenId(null)}
      />
    );

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const ref = await coach.addProgram(newName.trim());
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
          <div className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] space-y-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Program name (e.g. Preseason Week 1)"
            />
            <div className="flex gap-2">
              <Btn
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Btn>
              <Btn className="flex-1" onClick={create} disabled={!newName.trim()}>
                Create
              </Btn>
            </div>
          </div>
        ) : (
          <Btn className="w-full" icon={Plus} onClick={() => setCreating(true)}>
            New program
          </Btn>
        )
      ) : (
        programs.length === 0 && (
          <p className="text-sm text-ink-faint italic text-center py-6">
            Your coach hasn't published a program yet.
          </p>
        )
      )}

      {programs.length === 0 ? (
        canEdit ? (
          <EmptyState
            icon={Goal}
            title="No programs yet"
            body="Sequence your practices into a program, then assign dates to drop them on the calendar."
          />
        ) : null
      ) : (
        <ul className="space-y-2">
          {programs.map((p) => (
            <li key={p.id}>
              <ProgramCard program={p} onOpen={() => setOpenId(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProgramDetail;
