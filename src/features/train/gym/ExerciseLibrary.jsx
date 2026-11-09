// ExerciseLibrary — 3-level drill-down (equipment tiles → muscle tiles →
// exercise rows). Search overrides the levels. Merges the public DB with the
// coach's custom exercises (custom first, tagged custom:true).
//
// NOTE: an early draft passed `seedTeamWorkouts` into this component — it was
// dead (never destructured or used). It stays removed: workout seeds belong to
// the Team Workouts tab (WorkoutsView `seedWorkouts`), while this library tab
// seeds coach exercises via `seedLifts`.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Plus } from "lucide-react";
import { toast } from "../../../lib/toast";
import { searchExercises } from "../../../lib/exerciseSearch";
import SearchInput from "../../../components/ui/SearchInput";
import Btn from "../../../components/ui/Btn";
import SectionHeader from "../../../components/ui/SectionHeader";
import { titleCase } from "./bits";
import ExerciseModal from "./ExerciseModal";
import CustomExerciseForm from "./CustomExerciseForm";

export default function ExerciseLibrary({
  items,
  loading,
  err,
  onPick,
  picker,
  myWorkouts = [],
  addMyWorkout,
  updateMyWorkout,
  canEdit = false,
  uid,
  addCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
  seedLifts,
}) {
  // Two-level drill: pick equipment, then pick muscle within that equipment.
  const [equip, setEquip] = useState(null); // null = show equipment tiles
  const [muscle, setMuscle] = useState(null); // null + equip set = muscle tiles
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [formItem, setFormItem] = useState(null); // null=closed, {}=new, {...}=edit
  const [seeding, setSeeding] = useState(false);

  const runSeedLifts = async () => {
    if (!seedLifts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedLifts();
      if (added) {
        toast(
          `Added ${added} starter lift${added === 1 ? "" : "s"}${
            skipped ? ` · ${skipped} already existed` : ""
          }.`,
          "success",
        );
      } else {
        toast("All starter lifts are already in your library.", "info");
      }
    } catch (e) {
      toast("Couldn't add starter lifts — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Existing equipment + muscle values power the form's datalists.
  const equipmentOptions = useMemo(
    () => [...new Set(items.map((ex) => ex.equipment).filter(Boolean))].sort(),
    [items],
  );
  const muscleOptions = useMemo(
    () => [...new Set(items.flatMap((ex) => ex.primaryMuscles || []).filter(Boolean))].sort(),
    [items],
  );

  // Modals shared across every browse level (mirrors how `selected` was reused).
  const overlays = (
    <>
      {selected && (
        <ExerciseModal
          item={selected}
          onClose={() => setSelected(null)}
          myWorkouts={myWorkouts}
          addMyWorkout={addMyWorkout}
          updateMyWorkout={updateMyWorkout}
          canEdit={canEdit && !picker}
          onEdit={(it) => {
            setSelected(null);
            setFormItem(it);
          }}
          onDelete={deleteCustomExercise}
        />
      )}
      {formItem !== null && (
        <CustomExerciseForm
          item={formItem}
          uid={uid}
          equipmentOptions={equipmentOptions}
          muscleOptions={muscleOptions}
          onSave={(data) =>
            formItem.id ? updateCustomExercise(formItem.id, data) : addCustomExercise(data)
          }
          onClose={() => setFormItem(null)}
        />
      )}
    </>
  );

  // Group by equipment (level 1).
  const byEquip = useMemo(() => {
    const map = {};
    items.forEach((ex) => {
      const e = ex.equipment || "other";
      (map[e] = map[e] || []).push(ex);
    });
    return map;
  }, [items]);
  const equipNames = useMemo(() => Object.keys(byEquip).sort(), [byEquip]);

  // Within selected equipment, group by primary muscle (level 2).
  const byMuscleForEquip = useMemo(() => {
    if (!equip) return {};
    const map = {};
    (byEquip[equip] || []).forEach((ex) => {
      const m = (ex.primaryMuscles || [])[0];
      if (!m) return;
      (map[m] = map[m] || []).push(ex);
    });
    return map;
  }, [byEquip, equip]);
  const muscleNames = useMemo(() => Object.keys(byMuscleForEquip).sort(), [byMuscleForEquip]);

  if (loading)
    return (
      <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-ink-faint`}>
        Loading exercises…
      </div>
    );
  if (err)
    return (
      <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-[var(--th-danger)]`}>
        Couldn't load: {err}
      </div>
    );

  const q = search.trim().toLowerCase();
  const searchHits = q ? searchExercises(items, search) : [];

  // Shared exercise row.
  const renderExerciseRow = (ex) => (
    <li key={ex.id || ex.name}>
      <button
        onClick={() => (onPick ? onPick(ex) : setSelected(ex))}
        className="press w-full bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)] flex items-center gap-3 text-left"
      >
        <div className="w-12 h-12 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
          <Dumbbell className="w-5 h-5 text-brand-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink leading-tight">{ex.name}</div>
          <div className="text-[11px] text-ink-faint mt-0.5 truncate">
            {titleCase(ex.equipment)}
            {ex.primaryMuscles?.length ? ` · ${ex.primaryMuscles.map(titleCase).join(", ")}` : ""}
          </div>
        </div>
        {ex.custom && (
          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--th-surface-2)] text-ink-soft flex-shrink-0">
            Team
          </span>
        )}
        {onPick ? (
          <Plus className="w-4 h-4 text-ink-faint flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
        )}
      </button>
    </li>
  );

  const searchBar = (
    <div className="px-5 space-y-2">
      {canEdit && !picker && (
        <div className="flex gap-2">
          <Btn variant="primary" onClick={() => setFormItem({})} icon={Plus} className="flex-1">
            New exercise
          </Btn>
          {seedLifts && (
            <Btn
              variant="outline"
              onClick={runSeedLifts}
              loading={seeding}
              icon={Dumbbell}
              title="Add 20 coach-ready starter lifts"
            >
              Starter lifts
            </Btn>
          )}
        </div>
      )}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name, nickname, or muscle…"
      />
    </div>
  );

  const backBtn = (label, onBack) => (
    <button
      onClick={onBack}
      className="text-[11px] font-semibold text-ink-soft flex items-center gap-1 mb-2"
    >
      <ChevronLeft className="w-3 h-3" /> {label}
    </button>
  );

  const tileGrid = (names, counts, onSelect) => (
    <div className="grid grid-cols-2 gap-3">
      {names.map((name) => (
        <button
          key={name}
          onClick={() => onSelect(name)}
          className="press bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] flex flex-col items-start text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-accent-soft flex items-center justify-center mb-2">
            <Dumbbell className="w-5 h-5 text-brand-accent" />
          </div>
          <div className="text-sm font-bold text-ink leading-tight">{titleCase(name)}</div>
          <div className="text-[11px] text-ink-faint mt-0.5">
            {counts[name]} exercise{counts[name] === 1 ? "" : "s"}
          </div>
        </button>
      ))}
    </div>
  );

  // Search overrides any level.
  if (q) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <SectionHeader
            title={`${searchHits.length} match${searchHits.length === 1 ? "" : "es"}`}
            className="mb-2"
          />
          <ul className="space-y-2">
            {searchHits.map(renderExerciseRow)}
            {searchHits.length === 0 && (
              <p className="text-sm text-ink-faint italic text-center py-6">No matches.</p>
            )}
          </ul>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 1 — equipment tiles.
  if (!equip) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <SectionHeader title="Browse by equipment" className="mb-2" />
          {tileGrid(
            equipNames,
            Object.fromEntries(equipNames.map((e) => [e, byEquip[e].length])),
            setEquip,
          )}
        </div>
        {overlays}
      </div>
    );
  }

  // Level 2 — muscle tiles within selected equipment.
  if (!muscle) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          {backBtn("Equipment", () => setEquip(null))}
          <h3 className="font-display font-bold text-[24px] uppercase tracking-wide text-ink leading-none">
            {titleCase(equip)}
          </h3>
          <p className="text-[11px] text-ink-faint mt-1 mb-3">Pick a muscle group</p>
          {muscleNames.length === 0 ? (
            <p className="text-sm text-ink-faint italic text-center py-6">
              No exercises in this category.
            </p>
          ) : (
            tileGrid(
              muscleNames,
              Object.fromEntries(muscleNames.map((m) => [m, byMuscleForEquip[m].length])),
              setMuscle,
            )
          )}
        </div>
        {overlays}
      </div>
    );
  }

  // Level 3 — exercises.
  const inMuscle = byMuscleForEquip[muscle] || [];
  return (
    <div className="space-y-3">
      {searchBar}
      <div className="px-5">
        {backBtn(titleCase(equip), () => setMuscle(null))}
        <h3 className="font-display font-bold text-[24px] uppercase tracking-wide text-ink leading-none">
          {titleCase(muscle)}
        </h3>
        <p className="text-[11px] text-ink-faint mt-1 mb-3">
          {inMuscle.length} exercise{inMuscle.length === 1 ? "" : "s"}
        </p>
        <ul className="space-y-2">{inMuscle.map(renderExerciseRow)}</ul>
      </div>
      {overlays}
    </div>
  );
}
