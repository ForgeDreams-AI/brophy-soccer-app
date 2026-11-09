// ScheduledModal — coach-only: schedule a push reminder or a chat poll to
// fire at a future time. Docs land in the `scheduled` collection with shape
// { type, title, body, visibleTo, question, options, channel, channelName,
//   sendAt, repeat, repeatDays[], tz, sent, auto }; a Cloud Function sweeps
// and sends them (functions/index.js runScheduled) — the client only
// lists/cancels. `auto: true` docs (event-attached reminders) are hidden
// here; those are managed on the event.
import { useState } from "react";
import { BarChart3, Bell, Check, Repeat, Trash2, X } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { Input, TextArea, Select, Field } from "../../../components/ui/Field";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";
import { TEAM_CHANNEL } from "../hooks";
import AudiencePicker from "./AudiencePicker";

const tsMillis = (ts) =>
  ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : ts instanceof Date ? ts.getTime() : 0;

const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Next local occurrence (Date) on one of `days` at h:m, strictly in the future.
const nextLocalOccurrence = (days, h, m) => {
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const c = new Date();
    c.setDate(c.getDate() + i);
    c.setHours(h, m, 0, 0);
    if (days.includes(c.getDay()) && c.getTime() > now) return c;
  }
  return null;
};

// Short human label for a scheduled item's recurrence.
const repeatLabel = (s) => {
  if (!s.repeat || s.repeat === "none") return "";
  if (s.repeat === "daily") return "Daily";
  const days = s.repeatDays || [];
  if (s.repeat === "weekly") return `Weekly · ${DOW_ABBR[days[0]] || ""}`;
  return days.map((d) => DOW_ABBR[d]).join(" ");
};

// Poll option drafts carry stable ids so adding/removing an option never
// shifts input focus or text (no index keys).
let schedOptSeq = 0;
const newSchedOpt = (text = "") => ({ id: `sopt-${++schedOptSeq}`, text });

export default function ScheduledModal({
  scheduled = [],
  onAdd,
  onDelete,
  chatGroups = [],
  groups = [],
  roster = [],
  nameByEmail = {},
  onClose,
}) {
  const confirm = useConfirm();
  const [kind, setKind] = useState("reminder"); // reminder | poll
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | custom
  const [customDays, setCustomDays] = useState([]); // weekday numbers for custom
  // reminder
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audMode, setAudMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  // poll
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([newSchedOpt(), newSchedOpt()]);
  const [channel, setChannel] = useState(TEAM_CHANNEL);

  const channels = [{ id: TEAM_CHANNEL, name: "Team" }, ...chatGroups.map((c) => ({ id: c.id, name: c.name }))];
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || []).filter((r) => r.role !== "admin");
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setOpt = (id, v) => setOptions((o) => o.map((x) => (x.id === id ? { ...x, text: v } : x)));

  const reset = () => {
    setWhen("");
    setRepeat("none");
    setCustomDays([]);
    setTitle("");
    setBody("");
    setAudMode("everyone");
    setGroupIds([]);
    setEmails([]);
    setQuestion("");
    setOptions([newSchedOpt(), newSchedOpt()]);
    setChannel(TEAM_CHANNEL);
  };

  const submit = async () => {
    let at = when ? new Date(when) : null;
    if (!at || isNaN(at.getTime())) {
      toast("Pick a date & time.");
      return;
    }
    // Resolve recurrence into a weekday set + first send time.
    let repeatDays = [];
    if (repeat === "daily") repeatDays = [0, 1, 2, 3, 4, 5, 6];
    else if (repeat === "weekly") repeatDays = [at.getDay()];
    else if (repeat === "custom") {
      if (!customDays.length) {
        toast("Pick at least one day to repeat on.");
        return;
      }
      repeatDays = [...customDays].sort();
      // If the picked start isn't on a chosen day (or is past), snap to the next match.
      if (!repeatDays.includes(at.getDay()) || at.getTime() <= Date.now()) {
        const nxt = nextLocalOccurrence(repeatDays, at.getHours(), at.getMinutes());
        if (!nxt) {
          toast("Couldn't find a matching day.");
          return;
        }
        at = nxt;
      }
    }
    if (at.getTime() <= Date.now()) {
      toast("Pick a date & time in the future.");
      return;
    }
    if (kind === "reminder" && !title.trim() && !body.trim()) {
      toast("Add a title or message.");
      return;
    }
    if (kind === "poll") {
      const opts = options.map((o) => o.text.trim()).filter(Boolean);
      if (!question.trim() || opts.length < 2) {
        toast("A poll needs a question and at least 2 options.");
        return;
      }
    }
    const tz = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      } catch {
        return "";
      }
    })();
    const recur = { repeat, repeatDays, tz };
    setBusy(true);
    try {
      if (kind === "reminder") {
        const visibleTo = audMode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
        await onAdd({ type: "reminder", title: title.trim(), body: body.trim(), visibleTo, sendAt: at, ...recur });
      } else {
        const opts = options.map((o) => o.text.trim()).filter(Boolean);
        const ch = channels.find((c) => c.id === channel);
        await onAdd({
          type: "poll",
          question: question.trim(),
          options: opts,
          channel,
          channelName: ch?.name || "Team",
          sendAt: at,
          ...recur,
        });
      }
      reset();
      toast("Scheduled.", "success");
    } catch (e) {
      toast("Couldn't schedule — " + (e.message || "check rules."));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (s) => {
    const ok = await confirm({
      title: "Cancel this scheduled item?",
      body: "It won't be sent.",
      confirmLabel: "Cancel it",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(s.id);
    } catch (e) {
      toast("Couldn't cancel — " + (e.message || ""));
    }
  };

  // Hide event-attached auto reminders here — those are managed on the event.
  const list = [...scheduled].filter((s) => !s.auto).sort((a, b) => tsMillis(a.sendAt) - tsMillis(b.sendAt));

  return (
    <Sheet open onClose={onClose} title="Scheduled" size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          {[
            ["reminder", "Reminder", Bell],
            ["poll", "Poll", BarChart3],
          ].map(([val, label, Icon]) => (
            <button
              key={val}
              type="button"
              onClick={() => setKind(val)}
              className={`flex-1 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 ${
                kind === val ? "bg-brand-primary text-white" : "bg-[var(--th-surface-2)] text-ink-soft"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {kind === "reminder" ? (
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reminder title (e.g. Bring both jerseys)"
            />
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message (optional)"
              rows={2}
            />
            <Field label="Send to">
              <div className="flex gap-2">
                {[
                  ["everyone", "Everyone"],
                  ["custom", "Specific people"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAudMode(val)}
                    className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${
                      audMode === val
                        ? "bg-brand-primary text-white"
                        : "bg-[var(--th-surface-2)] text-ink-soft"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            {audMode === "custom" && (
              <AudiencePicker
                groups={groups}
                players={players}
                nameOf={nameOf}
                mode={audMode}
                setMode={setAudMode}
                groupIds={groupIds}
                setGroupIds={setGroupIds}
                emails={emails}
                setEmails={setEmails}
              />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Poll question (e.g. Who's making the game?)"
            />
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <Input value={o.text} onChange={(e) => setOpt(o.id, e.target.value)} placeholder={`Option ${i + 1}`} />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((arr) => arr.filter((x) => x.id !== o.id))}
                    className="text-ink-faint hover:text-[var(--th-danger)]"
                    aria-label={`Remove option ${i + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                type="button"
                onClick={() => setOptions((arr) => [...arr, newSchedOpt()])}
                className="text-[11px] font-bold text-brand-primary"
              >
                + Add option
              </button>
            )}
            <Field label="Post to">
              <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <Field label={repeat === "none" ? "When" : "Starts"}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Repeat">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ["none", "Once"],
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["custom", "Custom"],
            ].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRepeat(val)}
                className={`py-1.5 rounded-full text-[11px] font-bold ${
                  repeat === val
                    ? "bg-brand-primary text-white"
                    : "bg-[var(--th-surface-2)] text-ink-soft"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {repeat === "custom" && (
            <div className="flex justify-between gap-1 mt-2">
              {DOW_LETTERS.map((ltr, d) => {
                const on = customDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggle(customDays, setCustomDays, d)}
                    className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${
                      on ? "bg-brand-primary text-white" : "bg-[var(--th-surface-2)] text-ink-soft"
                    }`}
                    aria-label={DOW_ABBR[d]}
                  >
                    {ltr}
                  </button>
                );
              })}
            </div>
          )}
          {repeat === "weekly" && when && (
            <p className="text-[11px] text-ink-faint mt-1">
              Repeats every {DOW_ABBR[new Date(when).getDay()]}.
            </p>
          )}
        </Field>
        <Btn className="w-full" loading={busy} onClick={submit}>
          Schedule it
        </Btn>

        {list.length > 0 && (
          <div className="pt-2 border-t border-[var(--th-surface-2)]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">
              Queued
            </p>
            <ul className="space-y-1.5">
              {list.map((s) => {
                const rep = repeatLabel(s);
                const recurring = !!rep;
                const Icon = s.type === "poll" ? BarChart3 : Bell;
                const label =
                  s.type === "poll"
                    ? `${s.question || "Poll"} → ${s.channelName || "Team"}`
                    : s.title || s.body || "Reminder";
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 bg-[var(--th-surface-2)] rounded-xl px-3 py-2"
                  >
                    <Icon className="w-4 h-4 text-ink-faint flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-ink truncate">{label}</div>
                      <div className="text-[11px] text-ink-faint">
                        {recurring ? "Next: " : ""}
                        {new Date(tsMillis(s.sendAt)).toLocaleString([], {
                          weekday: recurring ? "short" : undefined,
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {s.sent && !recurring ? " · Sent" : ""}
                      </div>
                    </div>
                    {recurring ? (
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5 bg-brand-primary text-white">
                        <Repeat className="w-2.5 h-2.5" />
                        {rep}
                      </span>
                    ) : s.sent ? (
                      <Check className="w-3.5 h-3.5 flex-shrink-0 text-brand-success" />
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 bg-brand-accent-soft text-brand-primary">
                        Scheduled
                      </span>
                    )}
                    <button
                      onClick={() => cancel(s)}
                      aria-label="Cancel scheduled item"
                      className="text-ink-faint hover:text-[var(--th-danger)] flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
