// EventRemindersEditor — coach-only. Attach auto reminders / RSVP polls to
// an event, each firing a custom lead time before it starts. Stored on the
// event doc; a Cloud Function turns them into scheduled sends.
import { BarChart3, Bell, Plus, X } from "lucide-react";
import Field, { Input, Select } from "../../../components/ui/Field";

// Lead-time presets in minutes (15m → 48h).
export const LEAD_PRESETS = [15, 30, 60, 120, 180, 360, 1440, 2880];
export const leadText = (min) => {
  const m = Math.round(Number(min) || 0);
  if (m % 1440 === 0) {
    const d = m / 1440;
    return `${d} day${d > 1 ? "s" : ""} before`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hour${h > 1 ? "s" : ""} before`;
  }
  return `${m} min before`;
};
const rrid = () => Math.random().toString(36).slice(2, 8);

export default function EventRemindersEditor({ reminders = [], setReminders, channels = [] }) {
  const add = () =>
    setReminders([
      ...reminders,
      { id: rrid(), type: "reminder", offsetMin: 60, channel: "team", channelName: "Team", question: "" },
    ]);
  const upd = (i, patch) =>
    setReminders(reminders.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const del = (i) => setReminders(reminders.filter((_, j) => j !== i));
  const unitOf = (m) => (m % 1440 === 0 ? "day" : m % 60 === 0 ? "hour" : "min");
  const FACTOR = { min: 1, hour: 60, day: 1440 };

  return (
    <div className="rounded-[14px] bg-[var(--th-surface-2)] p-2.5">
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        Auto reminders{" "}
        <span className="font-medium normal-case tracking-normal text-ink-faint">
          — ping the team before this event
        </span>
      </div>
      {reminders.map((r, i) => {
        const isPreset = LEAD_PRESETS.includes(Number(r.offsetMin));
        const unit = unitOf(Number(r.offsetMin) || 0);
        const num = Math.max(1, Math.round((Number(r.offsetMin) || 0) / FACTOR[unit]));
        return (
          <div
            key={r.id || i}
            className="mb-2 rounded-[12px] border border-[var(--th-surface-2)] bg-[var(--th-surface)] p-2.5"
          >
            <div className="mb-2 flex items-center gap-1.5">
              <div className="flex rounded-full bg-[var(--th-surface-2)] p-0.5">
                <button
                  onClick={() => upd(i, { type: "reminder" })}
                  aria-pressed={r.type !== "poll"}
                  className={`press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    r.type !== "poll" ? "bg-brand-primary text-white" : "text-ink-soft"
                  }`}
                >
                  <Bell className="h-3 w-3" /> Reminder
                </button>
                <button
                  onClick={() => upd(i, { type: "poll" })}
                  aria-pressed={r.type === "poll"}
                  className={`press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    r.type === "poll" ? "bg-brand-primary text-white" : "text-ink-soft"
                  }`}
                >
                  <BarChart3 className="h-3 w-3" /> Poll
                </button>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => del(i)}
                aria-label="Remove reminder"
                className="press text-ink-faint hover:text-[var(--th-danger)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Field>
              <Select
                value={isPreset ? String(r.offsetMin) : "custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  upd(i, { offsetMin: v === "custom" ? 90 : Number(v) });
                }}
              >
                {LEAD_PRESETS.map((m) => (
                  <option key={m} value={String(m)}>
                    {leadText(m)}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </Select>
            </Field>
            {!isPreset && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input
                  type="number"
                  min="1"
                  value={num}
                  onChange={(e) =>
                    upd(i, { offsetMin: Math.max(1, Number(e.target.value) || 1) * FACTOR[unit] })
                  }
                  className="!w-20"
                />
                <Select
                  value={unit}
                  onChange={(e) => upd(i, { offsetMin: num * FACTOR[e.target.value] })}
                  className="!w-auto"
                >
                  <option value="min">minutes</option>
                  <option value="hour">hours</option>
                  <option value="day">days</option>
                </Select>
                <span className="text-[12px] text-ink-faint">before</span>
              </div>
            )}

            {r.type === "poll" && (
              <div className="mt-1.5 space-y-1.5">
                <Field>
                  <Select
                    value={r.channel || "team"}
                    onChange={(e) => {
                      const c = channels.find((x) => x.id === e.target.value);
                      upd(i, { channel: e.target.value, channelName: c?.name || "Team" });
                    }}
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        Post to: {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Input
                    value={r.question || ""}
                    onChange={(e) => upd(i, { question: e.target.value })}
                    placeholder="Question (optional — defaults to “Who's making it?”)"
                  />
                </Field>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={add}
        className="press flex items-center gap-1 px-1 text-[12px] font-bold text-brand-primary"
      >
        <Plus className="h-3.5 w-3.5" /> Add reminder
      </button>
    </div>
  );
}
