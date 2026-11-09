// AudiencePicker — "Everyone" vs "Specific people" selector: a mix of
// existing groups + individual players. Players show the display name from
// their profile, with their email underneath as the disambiguator. Shared by
// ChannelModal, ChannelRow, and ScheduledModal so the three can't drift.
import { Check } from "lucide-react";

export default function AudiencePicker({
  groups = [],
  players = [],
  nameOf,
  mode,
  setMode,
  groupIds,
  setGroupIds,
  emails,
  setEmails,
}) {
  const toggle = (arr, setArr, val) =>
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  return (
    <>
      <div className="flex gap-2">
        {[
          ["everyone", "Everyone"],
          ["custom", "Specific people"],
        ].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setMode(val)}
            className={`flex-1 py-2 rounded-full text-xs font-bold ${
              mode === val ? "bg-brand-primary text-white" : "bg-[var(--th-surface-2)] text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "custom" && (
        <div className="space-y-2">
          {groups.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1">
                Groups
              </p>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggle(groupIds, setGroupIds, g.id)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        on
                          ? "bg-brand-primary text-white border-brand-primary"
                          : "bg-white text-ink-soft border-[var(--th-surface-2)]"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1">
              Players
            </p>
            {players.length === 0 ? (
              <p className="text-[11px] text-ink-faint italic">No players on the roster yet.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--th-surface-2)] divide-y divide-[var(--th-surface-2)]">
                {players.map((p) => {
                  const on = emails.includes(p.email);
                  const nm = nameOf(p.email);
                  return (
                    <button
                      key={p.email}
                      type="button"
                      onClick={() => toggle(emails, setEmails, p.email)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--th-surface-2)] text-left"
                    >
                      <span className="min-w-0 flex-1">
                        {nm ? (
                          <>
                            <span className="text-xs font-semibold text-ink truncate block leading-tight">
                              {nm}
                            </span>
                            <span className="text-[11px] font-mono text-ink-faint truncate block leading-tight">
                              {p.email}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-mono text-ink-soft truncate block">
                            {p.email}
                          </span>
                        )}
                      </span>
                      {on ? (
                        <Check className="w-4 h-4 flex-shrink-0 text-brand-success" />
                      ) : (
                        <span className="w-4 h-4 rounded border border-[var(--th-surface-2)] flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
