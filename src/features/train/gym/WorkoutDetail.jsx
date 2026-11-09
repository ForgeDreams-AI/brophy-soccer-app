// WorkoutDetail — the workout editor.
// - Editable name with 700ms debounced autosave.
// - Per-exercise sets/reps/load (text inputs stored as strings — preserved),
//   lb↔% toggle, move up/down, notes.
// - Advanced row: % max, RPE, tempo, superset cycler (SUPERSET_LABELS).
// - Add via ExercisePicker, template browser (WORKOUT_TEMPLATES +
//   buildTemplateWorkout), duplicate ("{name} (copy)"), delete (useConfirm).
// - Read-only mode renders superset groups via groupBySuperset +
//   formatPrescription.
//
// Exercise rows carry stable `__k` keys (see gym/bits.jsx) instead of array
// indices, so inputs keep focus/state when rows move or edit.
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardList,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import {
  buildTemplateWorkout,
  formatPrescription,
  groupBySuperset,
  newEntry,
  SUPERSET_LABELS,
  WORKOUT_TEMPLATES,
} from "../../../lib/lifting";
import { toast } from "../../../lib/toast";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { Input } from "../../../components/ui/Field";
import EmptyState from "../../../components/ui/EmptyState";
import { makeRowKey, supersetBlockKey, withRowKeys } from "./bits";
import ExercisePicker from "./ExercisePicker";

const blockInputCls =
  "border border-[var(--th-surface-2)] rounded-lg px-2 py-1.5 text-xs text-center bg-[var(--th-surface)] text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-primary";

export default function WorkoutDetail({
  workout,
  canEdit,
  lib,
  onSave,
  onDelete,
  onDuplicate,
  onBack,
}) {
  const confirm = useConfirm();
  const [name, setName] = useState(workout.name || "");
  const [exercises, setExercises] = useState(() => withRowKeys(workout.exercises || []));
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false); // reveal %/RPE/tempo/superset editors

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => {
      onSave({ name, exercises });
      setDirty(false);
    }, 700);
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
  const removeEx = (i) => {
    setExercises(exercises.filter((_, j) => j !== i));
    setDirty(true);
  };
  const moveEx = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setExercises(next);
    setDirty(true);
  };
  const addEx = (ex) => {
    setExercises([...exercises, { ...newEntry(ex), __k: makeRowKey() }]);
    setDirty(true);
    setPicker(false);
  };
  // Apply a ready-made strength template: matches each prescribed lift to the
  // library, appends its exercises, and names an untitled workout after it.
  const applyTemplate = (tpl) => {
    const built = buildTemplateWorkout(tpl, lib.items || []);
    setExercises([...exercises, ...withRowKeys(built.exercises)]);
    if (!name.trim()) setName(built.name);
    setDirty(true);
    setTplOpen(false);
    setAdvanced(true);
    toast(`Added "${built.name}" exercises.`, "success");
  };
  const cycleGroup = (i) => {
    const cur = exercises[i]?.group || "";
    const next = SUPERSET_LABELS[(SUPERSET_LABELS.indexOf(cur) + 1) % SUPERSET_LABELS.length];
    setEx(i, "group", next);
  };
  const groups = groupBySuperset(exercises);

  const confirmDelete = async () => {
    const ok = await confirm({
      title: `Delete "${workout.name || "this workout"}"?`,
      body: "The workout and its exercises will be gone for good. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete();
    } catch (e) {
      toast("Couldn't delete — " + e.message);
    }
  };

  return (
    <div className="px-5 pb-4 space-y-4">
      <button
        onClick={handleBack}
        className="text-[11px] font-semibold text-ink-soft flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      {canEdit ? (
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          placeholder="Workout name"
          className="!border-0 !border-b !rounded-none !px-0 !pb-1 !text-xl font-bold text-ink focus:!border-[var(--th-surface-2)]"
        />
      ) : (
        <h2 className="font-display font-bold text-[26px] uppercase tracking-wide text-ink leading-none">
          {name || "Untitled"}
        </h2>
      )}

      {exercises.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No exercises yet"
          body={canEdit ? "Add one below to start building this session." : ""}
        />
      ) : canEdit ? (
        <ul className="space-y-2">
          {exercises.map((ex, i) => (
            <li
              key={ex.__k || `fallback-${i}`}
              className="bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)]"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-sm text-ink leading-tight flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{ex.name}</span>
                  {ex.group && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white bg-brand-accent flex-shrink-0">
                      SS {ex.group}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveEx(i, -1)}
                    disabled={i === 0}
                    className="text-ink-faint hover:text-ink disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveEx(i, +1)}
                    disabled={i === exercises.length - 1}
                    className="text-ink-faint hover:text-ink disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeEx(i)}
                    className="text-ink-faint hover:text-[var(--th-danger)]"
                    aria-label="Remove exercise"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={ex.sets}
                    onChange={(e) => setEx(i, "sets", e.target.value)}
                    placeholder="Sets"
                    className={blockInputCls}
                  />
                  <input
                    value={ex.reps}
                    onChange={(e) => setEx(i, "reps", e.target.value)}
                    placeholder="Reps"
                    className={blockInputCls}
                  />
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => setEx(i, "loadMode", ex.loadMode === "percent" ? "weight" : "percent")}
                      title="Toggle load: absolute weight or % of the athlete's max"
                      className="px-2 rounded-lg text-[11px] font-bold border border-[var(--th-surface-2)] text-ink-soft bg-[var(--th-surface-2)] flex-shrink-0"
                    >
                      {ex.loadMode === "percent" ? "%" : "lb"}
                    </button>
                    {ex.loadMode === "percent" ? (
                      <input
                        value={ex.pct || ""}
                        onChange={(e) => setEx(i, "pct", e.target.value)}
                        placeholder="% max"
                        className={`${blockInputCls} w-full min-w-0`}
                      />
                    ) : (
                      <input
                        value={ex.weight || ""}
                        onChange={(e) => setEx(i, "weight", e.target.value)}
                        placeholder="Weight"
                        className={`${blockInputCls} w-full min-w-0`}
                      />
                    )}
                  </div>
                </div>
                {advanced && (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={ex.rpe || ""}
                      onChange={(e) => setEx(i, "rpe", e.target.value)}
                      placeholder="RPE"
                      className={blockInputCls}
                    />
                    <input
                      value={ex.tempo || ""}
                      onChange={(e) => setEx(i, "tempo", e.target.value)}
                      placeholder="Tempo"
                      className={blockInputCls}
                    />
                    <button
                      type="button"
                      onClick={() => cycleGroup(i)}
                      title="Superset — adjacent exercises sharing a label run back-to-back"
                      className="border border-[var(--th-surface-2)] rounded-lg px-2 py-1.5 text-[11px] text-center font-semibold text-ink-soft bg-[var(--th-surface-2)]"
                    >
                      {ex.group ? `Superset ${ex.group}` : "Superset"}
                    </button>
                  </div>
                )}
                <input
                  value={ex.notes || ""}
                  onChange={(e) => setEx(i, "notes", e.target.value)}
                  placeholder="Notes (optional)"
                  className={`${blockInputCls} w-full !text-left`}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const superset = g.group && g.items.length > 1;
            return (
              <li
                key={supersetBlockKey(g)}
                className={`bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)] ${
                  superset ? "border-l-4" : ""
                }`}
                style={superset ? { borderLeftColor: "var(--th-accent)" } : undefined}
              >
                {superset && (
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-brand-accent">
                    Superset {g.group}
                  </div>
                )}
                <div className="space-y-2">
                  {g.items.map(({ entry, index }) => (
                    <div key={`row-${index}`}>
                      <div className="font-semibold text-sm text-ink leading-tight">
                        {entry.name}
                      </div>
                      <div className="text-[11px] text-ink-soft">
                        {formatPrescription(entry)}
                      </div>
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
            <Btn variant="outline" onClick={() => setPicker(true)} icon={Plus} className="flex-1">
              Add exercise
            </Btn>
            <Btn
              variant="outline"
              onClick={() => setTplOpen(true)}
              icon={ClipboardList}
              title="Start from a ready-made strength template"
              className="!border-brand-primary !text-brand-primary"
            >
              Template
            </Btn>
          </div>
          {exercises.length > 0 && (
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="w-full py-1.5 text-[11px] font-semibold text-ink-soft"
            >
              {advanced ? "Hide" : "Show"} % max · RPE · tempo · supersets
            </button>
          )}
          {onDuplicate && (
            <Btn variant="outline" onClick={onDuplicate} icon={Copy} className="w-full">
              Duplicate workout
            </Btn>
          )}
          <button
            onClick={confirmDelete}
            className="w-full py-2 text-[11px] font-semibold text-[var(--th-danger)]"
          >
            Delete workout
          </button>
        </>
      )}

      {dirty && canEdit && (
        <p className="text-[11px] text-ink-faint text-center">Saving…</p>
      )}

      {picker && (
        <ExercisePicker
          items={lib.items}
          loading={lib.loading}
          err={lib.err}
          onPick={addEx}
          onClose={() => setPicker(false)}
        />
      )}

      <Sheet open={tplOpen} onClose={() => setTplOpen(false)} title="Start from a template" size="lg">
        <p className="text-[11px] text-ink-faint px-1 pb-3 leading-relaxed">
          Adds ready-made exercises with %-of-max, RPE and supersets already
          prescribed. Loads individualize once each athlete has a max on file.
        </p>
        <div className="space-y-2">
          {WORKOUT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className="press w-full text-left bg-[var(--th-surface)] rounded-[20px] p-3.5 shadow-card border border-[var(--th-surface-2)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-ink">{tpl.name}</div>
                <div className="text-[11px] font-semibold text-ink-faint flex-shrink-0">
                  {tpl.entries.length} lifts
                </div>
              </div>
              <div className="text-[11px] text-ink-soft mt-0.5 leading-snug">{tpl.desc}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
