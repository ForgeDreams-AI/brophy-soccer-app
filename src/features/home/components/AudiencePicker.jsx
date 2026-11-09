// AudiencePicker — authors the `visibleTo` audience for a doc (events,
// assignments, nutrition targets…). Value shape: { groupIds: [], emails: [] }.
// Empty audience = everyone. Callers pass `groups` (with memberUids) and
// `people` ([{ id, label, sub }]). Every write path keeps the pair in sync via
// lib/audience's withAudienceKeys (contract rule 9).
import { Check, Users, Globe } from "lucide-react";
import SegmentedControl from "../../../components/ui/SegmentedControl";
import { visibleToText } from "../../../lib/audience";

const toggle = (list, v) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export default function AudiencePicker({ value, onChange, groups = [], people = [] }) {
  const v = value || { groupIds: [], emails: [] };
  const groupIds = v.groupIds || [];
  const emails = v.emails || [];
  const mode = groupIds.length || emails.length ? "custom" : "everyone";
  const summary = visibleToText(v, groups);

  return (
    <div className="space-y-2.5">
      <SegmentedControl
        ariaLabel="Audience"
        className="w-full"
        value={mode}
        onChange={(m) =>
          m === "everyone"
            ? onChange({ groupIds: [], emails: [] })
            : onChange({ groupIds, emails })
        }
        options={[
          { value: "everyone", label: "Everyone", icon: Globe },
          { value: "custom", label: "Specific people", icon: Users },
        ]}
      />
      {mode === "everyone" ? (
        <p className="text-[11px] text-ink-faint leading-relaxed">
          The whole team will see this.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onChange({ groupIds: toggle(groupIds, g.id), emails })}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-colors ${
                      on
                        ? "bg-brand-primary text-white border-brand-primary"
                        : "bg-[var(--th-surface)] text-ink-soft border-[var(--th-surface-2)]"
                    }`}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
          {people.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-[14px] border border-[var(--th-surface-2)] divide-y divide-[var(--th-surface-2)]">
              {people.map((p) => {
                const on = emails.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange({ groupIds, emails: toggle(emails, p.id) })}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--th-surface-2)]/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink truncate">
                        {p.label}
                      </span>
                      {p.sub && p.sub !== p.label && (
                        <span className="block text-[11px] text-ink-faint truncate">{p.sub}</span>
                      )}
                    </span>
                    {on ? (
                      <span className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-[var(--th-surface-2)] flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-ink-faint">
            {summary === "Everyone" ? "No one selected yet." : `Visible to: ${summary}`}
          </p>
        </div>
      )}
    </div>
  );
}
