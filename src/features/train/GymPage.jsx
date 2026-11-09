// GymPage — the gym sub-view: Library | My Workouts | Team Workouts.
// Owns all its data through features/train/hooks.js (contract rule 7):
// the shell passes only { user }.
//
// Coach-authored exercises sit at the front of the library, tagged custom so
// they render their own photos + get edit/delete. They still group by the
// same equipment/muscle fields as the public DB.
import { useMemo, useState } from "react";
import { ClipboardList, Dumbbell, Users } from "lucide-react";
import Tabs from "../../components/ui/Tabs";
import {
  useCustomExercises,
  useExerciseLib,
  useMyWorkouts,
  useTeamWorkouts,
} from "./hooks";
import ExerciseLibrary from "./gym/ExerciseLibrary";
import WorkoutsView from "./gym/WorkoutsView";

export default function GymPage({ user }) {
  const isAdmin = user?.role === "admin";
  const [view, setView] = useState("library");

  const pubLib = useExerciseLib();
  const custom = useCustomExercises();
  const mine = useMyWorkouts(user?.uid);
  const team = useTeamWorkouts(user);

  const mergedLib = useMemo(
    () => ({
      items: [...custom.items.map((c) => ({ ...c, custom: true })), ...pubLib.items],
      loading: pubLib.loading,
      err: pubLib.err,
    }),
    [custom.items, pubLib.items, pubLib.loading, pubLib.err],
  );

  const subtabs = [
    { id: "library", label: "Library", icon: Dumbbell },
    { id: "mine", label: "My Workouts", icon: ClipboardList },
    { id: "team", label: "Team Workouts", icon: Users },
  ];

  return (
    <div className="pt-3 pb-4 space-y-4">
      <div className="px-5">
        <Tabs tabs={subtabs} value={view} onChange={setView} />
      </div>

      {view === "library" && (
        <ExerciseLibrary
          items={mergedLib.items}
          loading={mergedLib.loading}
          err={mergedLib.err}
          myWorkouts={mine.items}
          addMyWorkout={mine.add}
          updateMyWorkout={mine.update}
          canEdit={isAdmin}
          uid={user?.uid}
          addCustomExercise={custom.add}
          updateCustomExercise={custom.update}
          deleteCustomExercise={custom.del}
          seedLifts={custom.seed}
        />
      )}
      {view === "mine" && (
        <WorkoutsView
          workouts={mine.items}
          canEdit
          add={mine.add}
          update={mine.update}
          del={mine.del}
          lib={mergedLib}
        />
      )}
      {view === "team" && (
        <WorkoutsView
          workouts={team.items}
          canEdit={isAdmin}
          add={team.add}
          update={team.update}
          del={team.del}
          lib={mergedLib}
          readOnlyLabel="Published by your coach"
          seedWorkouts={isAdmin ? team.seed : null}
          groupByArea
        />
      )}
    </div>
  );
}
