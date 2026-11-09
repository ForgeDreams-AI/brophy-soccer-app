// WorkoutsView — list of workouts (personal or team): create flow with
// starter-name chips, optional "Starter set" seed, area grouping for team
// workouts; opens WorkoutDetail for the selected row.
import { useMemo, useState } from "react";
import { ClipboardList, Dumbbell, Plus } from "lucide-react";
import { AREA_ORDER } from "../../../data/seeds/workoutSeed";
import { toast } from "../../../lib/toast";
import Btn from "../../../components/ui/Btn";
import { Input } from "../../../components/ui/Field";
import EmptyState from "../../../components/ui/EmptyState";
import SectionHeader from "../../../components/ui/SectionHeader";
import { WorkoutCard, ReadOnlyHint } from "./bits";
import WorkoutDetail from "./WorkoutDetail";

const WORKOUT_STARTERS = ["Push Day", "Pull Day", "Leg Day", "Full Body", "Upper Body", "Core & Mobility"];

export default function WorkoutsView({
  workouts,
  canEdit,
  add,
  update,
  del,
  readOnlyLabel,
  lib,
  seedWorkouts,
  groupByArea,
}) {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [seeding, setSeeding] = useState(false);

  const runSeedWorkouts = async () => {
    if (!seedWorkouts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedWorkouts();
      if (added) {
        toast(
          `Added ${added} starter workout${added === 1 ? "" : "s"}${
            skipped ? ` · ${skipped} already existed` : ""
          }.`,
          "success",
        );
      } else {
        toast("All starter workouts are already added.", "info");
      }
    } catch (e) {
      toast("Couldn't add starter workouts — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Group workouts by focus area (seeded ones carry `area`; manual ones fall
  // under "Your workouts"). Known areas render in a sensible order first.
  const grouped = useMemo(() => {
    if (!groupByArea) return null;
    const byArea = {};
    workouts.forEach((w) => {
      const a = w.area || "Your workouts";
      (byArea[a] = byArea[a] || []).push(w);
    });
    const order = [...AREA_ORDER, "Your workouts"];
    return Object.keys(byArea)
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map((area) => ({ area, items: byArea[area] }));
  }, [workouts, groupByArea]);

  const open = workouts.find((w) => w.id === openId);
  if (open) {
    return (
      <WorkoutDetail
        key={open.id}
        workout={open}
        canEdit={canEdit}
        lib={lib}
        onSave={(d) => update(open.id, d)}
        onDelete={async () => {
          await del(open.id);
          setOpenId(null);
        }}
        onDuplicate={async () => {
          try {
            const ref = await add({
              name: `${open.name} (copy)`,
              exercises: open.exercises || [],
            });
            if (ref?.id) setOpenId(ref.id);
            toast("Workout duplicated.", "success");
          } catch (e) {
            toast("Couldn't duplicate — " + (e.message || ""));
          }
        }}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const create = async (name) => {
    const n = (name || newName).trim();
    if (!n) return;
    try {
      const ref = await add(n);
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
          <div className="bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)] space-y-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Workout name (e.g. Pull Day)"
            />
            <div className="flex flex-wrap gap-1.5">
              {WORKOUT_STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => create(s)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--th-surface-2)] text-ink-soft"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="flex-1"
              >
                Cancel
              </Btn>
              <Btn variant="primary" onClick={() => create()} className="flex-1">
                Create
              </Btn>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Btn variant="primary" onClick={() => setCreating(true)} icon={Plus} className="flex-1">
              New workout
            </Btn>
            {seedWorkouts && (
              <Btn
                variant="outline"
                onClick={runSeedWorkouts}
                loading={seeding}
                icon={ClipboardList}
                title="Add 20 ready-made workouts grouped by focus area"
              >
                Starter set
              </Btn>
            )}
          </div>
        )
      ) : (
        readOnlyLabel && <ReadOnlyHint label={readOnlyLabel} />
      )}

      {workouts.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No workouts yet"
          body={
            canEdit && seedWorkouts
              ? "Tap “Starter set” for 20 ready-made sessions, or create your own."
              : canEdit
                ? "Create your first workout above."
                : "Your coach hasn't published any workouts yet."
          }
        />
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(({ area, items }) => (
            <div key={area}>
              <SectionHeader title={area} className="mb-1.5" />
              <ul className="space-y-2">
                {items.map((w) => (
                  <li key={w.id}>
                    <WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.focus || w.createdByName} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.createdByName} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
