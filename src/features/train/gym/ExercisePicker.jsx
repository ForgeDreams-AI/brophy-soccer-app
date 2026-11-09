// ExercisePicker — "Add an exercise" sheet: the full ExerciseLibrary in
// picker mode (row tap → onPick(exercise) instead of opening the detail).
import Sheet from "../../../components/ui/Sheet";
import ExerciseLibrary from "./ExerciseLibrary";

export default function ExercisePicker({ items, loading, err, onPick, onClose }) {
  return (
    <Sheet open onClose={onClose} title="Add an exercise" size="lg">
      <div className="-mx-5">
        <ExerciseLibrary items={items} loading={loading} err={err} onPick={onPick} picker />
      </div>
    </Sheet>
  );
}
