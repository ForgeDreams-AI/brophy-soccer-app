// AssignModal — coach creates a new assignment: optional linked team
// workout, title, instructions, link, due date, and audience. The caller
// passes `people` ([{ id, label, sub }]) for the AudiencePicker.
import { useState } from "react";
import { Dumbbell } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import Field, { Input, TextArea, Select } from "../../../components/ui/Field";
import { todayKey, parseDayKey } from "../../../lib/dates";
import { toast } from "../../../lib/toast";
import AudiencePicker from "./AudiencePicker";

const prettyDay = (ymd) => {
  try {
    return parseDayKey(ymd).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ymd;
  }
};

export default function AssignModal({
  teamWorkouts = [],
  groups = [],
  people = [],
  onCreate,
  onClose,
}) {
  const [workoutId, setWorkoutId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [date, setDate] = useState(todayKey());
  const [visibleTo, setVisibleTo] = useState({ groupIds: [], emails: [] });
  const [busy, setBusy] = useState(false);

  const wo = teamWorkouts.find((w) => w.id === workoutId);
  const finalTitle = title.trim() || wo?.name || "";
  const canCreate = !!finalTitle && !!date && !busy;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      await onCreate({
        title: finalTitle,
        workoutId,
        workoutName: wo?.name || "",
        body: body.trim(),
        link: link.trim(),
        date,
        visibleTo,
      });
      onClose();
    } catch (e) {
      toast("Couldn't assign — " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="New assignment" size="lg">
      <div className="p-5 space-y-4">
        <Field label="Linked workout" hint="Optional — attach a team workout session.">
          <Select value={workoutId} onChange={(e) => setWorkoutId(e.target.value)}>
            <option value="">No linked workout</option>
            {teamWorkouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={wo ? wo.name : "e.g. Watch film, Read pp. 10–15"}
          />
        </Field>

        <Field label="Instructions">
          <TextArea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What should they do? e.g. watch this clip and note 3 takeaways."
          />
        </Field>

        <Field label="Link">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Video, article, or doc URL (optional)"
            inputMode="url"
          />
        </Field>

        <Field label="Due date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-[11px] text-ink-faint mt-1.5">{prettyDay(date)}</p>
        </Field>

        <Field label="Who sees this">
          <AudiencePicker
            value={visibleTo}
            onChange={setVisibleTo}
            groups={groups}
            people={people}
          />
        </Field>

        <Btn
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={!canCreate}
          onClick={create}
          icon={Dumbbell}
        >
          {busy ? "Assigning…" : "Assign"}
        </Btn>
      </div>
    </Sheet>
  );
}
