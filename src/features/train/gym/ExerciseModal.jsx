// ExerciseModal — exercise detail: photos, muscles, mechanic, level,
// instructions; "Add to workout" (existing personal workout or a new one);
// coaches can edit/delete their own custom exercises here.
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { Input } from "../../../components/ui/Field";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";
import { exerciseImageUrl } from "../../../lib/exercises";
import { PhotoCarousel, titleCase } from "./bits";

export default function ExerciseModal({
  item,
  onClose,
  myWorkouts = [],
  addMyWorkout,
  updateMyWorkout,
  canEdit = false,
  onEdit,
  onDelete,
}) {
  const confirm = useConfirm();
  // Custom exercises store full Storage URLs (often several); public-DB ones
  // store a single relative path resolved through the CDN.
  const customPhotos = item.custom ? item.images || [] : [];
  const img = item.custom ? item.images?.[0] || null : exerciseImageUrl(item.images?.[0]);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const addToExisting = async (w) => {
    setMsg("");
    try {
      const exercises = [
        ...(w.exercises || []),
        {
          exerciseId: item.id,
          name: item.name,
          equipment: item.equipment || "",
          sets: "3",
          reps: "10",
          weight: "",
          notes: "",
        },
      ];
      await updateMyWorkout(w.id, { exercises });
      setMsg(`Added to "${w.name}".`);
      setPicking(false);
    } catch (e) {
      setMsg("Couldn't add — " + (e.message || ""));
    }
  };

  const addToNew = async () => {
    if (!newName.trim()) return;
    setMsg("");
    try {
      const ref = await addMyWorkout(newName);
      // Newly created workout has no exercises yet; append this one.
      await updateMyWorkout(ref.id, {
        exercises: [
          {
            exerciseId: item.id,
            name: item.name,
            equipment: item.equipment || "",
            sets: "3",
            reps: "10",
            weight: "",
            notes: "",
          },
        ],
      });
      setMsg(`Created "${newName.trim()}" and added.`);
      setNewName("");
      setCreating(false);
      setPicking(false);
    } catch (e) {
      setMsg("Couldn't create — " + (e.message || ""));
    }
  };

  const removeCustom = async () => {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      body: "It will be removed from the library for everyone. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(item.id);
      onClose();
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      subtitle={
        item.custom
          ? `${titleCase(item.equipment)} · Coach exercise`
          : titleCase(item.equipment)
      }
      size="lg"
    >
      <div className="space-y-4">
        {item.custom && canEdit && (onEdit || onDelete) && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(item)}
                className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold uppercase tracking-wider text-ink-soft flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={removeCustom}
                className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold uppercase tracking-wider text-[var(--th-danger)] flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        )}

        {customPhotos.length > 0 ? (
          <PhotoCarousel photos={customPhotos} />
        ) : img ? (
          <div className="aspect-video rounded-2xl bg-[var(--th-surface-2)] overflow-hidden flex items-center justify-center">
            <img src={img} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
          </div>
        ) : (
          <div className="aspect-video rounded-2xl bg-[var(--th-surface-2)] flex items-center justify-center text-ink-faint text-xs">
            No image
          </div>
        )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            {item.primaryMuscles?.length > 0 && (
              <div>
                <div className="text-[11px] text-ink-faint uppercase font-bold tracking-wider">Primary</div>
                <div className="font-semibold text-ink mt-1">{item.primaryMuscles.map(titleCase).join(", ")}</div>
              </div>
            )}
            {item.secondaryMuscles?.length > 0 && (
              <div>
                <div className="text-[11px] text-ink-faint uppercase font-bold tracking-wider">Secondary</div>
                <div className="font-semibold text-ink mt-1">{item.secondaryMuscles.map(titleCase).join(", ")}</div>
              </div>
            )}
            {item.mechanic && (
              <div>
                <div className="text-[11px] text-ink-faint uppercase font-bold tracking-wider">Mechanic</div>
                <div className="font-semibold text-ink mt-1">{titleCase(item.mechanic)}</div>
              </div>
            )}
            {item.level && (
              <div>
                <div className="text-[11px] text-ink-faint uppercase font-bold tracking-wider">Level</div>
                <div className="font-semibold text-ink mt-1">{titleCase(item.level)}</div>
              </div>
            )}
          </div>

          {item.instructions?.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-2">
                How to do it
              </h4>
              <ol className="space-y-2">
                {item.instructions.map((step, i) => (
                  <li key={`step-${i}`} className="flex gap-2 text-sm text-ink-soft leading-snug">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center text-white bg-brand-primary mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Add to workout */}
          {updateMyWorkout && (
            <div className="pt-3 border-t border-[var(--th-surface-2)]">
              {!picking ? (
                <Btn variant="primary" onClick={() => setPicking(true)} icon={Plus} className="w-full">
                  Add to workout
                </Btn>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Add to…</span>
                    <button
                      onClick={() => {
                        setPicking(false);
                        setCreating(false);
                        setMsg("");
                      }}
                      className="text-[11px] text-ink-soft"
                    >
                      Cancel
                    </button>
                  </div>
                  {!creating ? (
                    <>
                      {myWorkouts.length > 0 && (
                        <ul className="space-y-1">
                          {myWorkouts.map((w) => (
                            <li key={w.id}>
                              <button
                                onClick={() => addToExisting(w)}
                                className="w-full bg-[var(--th-surface-2)] rounded-lg px-3 py-2 flex items-center justify-between text-left"
                              >
                                <span className="text-xs font-semibold text-ink truncate">{w.name}</span>
                                <span className="text-[11px] text-ink-faint flex-shrink-0 ml-2">
                                  {w.exercises?.length || 0} ex
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        onClick={() => setCreating(true)}
                        className="w-full bg-[var(--th-surface)] border-2 border-dashed border-[var(--th-surface-2)] rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft"
                      >
                        <Plus className="w-3.5 h-3.5" /> New workout
                      </button>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addToNew()}
                        placeholder="Workout name (e.g. Pull Day)"
                      />
                      <Btn variant="primary" onClick={addToNew}>
                        Create
                      </Btn>
                    </div>
                  )}
                  {msg && (
                    <p className="text-[11px] font-semibold px-1 text-ink-soft">{msg}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!item.custom && (
            <p className="text-[11px] text-ink-faint leading-relaxed pt-2 border-t border-[var(--th-surface-2)]">
              Data from{" "}
              <a
                href="https://github.com/yuhonas/free-exercise-db"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Free Exercise DB
              </a>{" "}
              (public domain).
            </p>
          )}
      </div>
    </Sheet>
  );
}
