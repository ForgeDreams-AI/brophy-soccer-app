// AttendanceArchive — browse past attendance days + see who was out and why.
// Presented as a bottom sheet: each recorded day expands to show the absent
// list with submitted reasons (or "awaiting reason").
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Badge from "../../../components/ui/Badge";
import EmptyState from "../../../components/ui/EmptyState";
import { parseDayKey } from "../../../lib/dates";

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

export default function AttendanceArchive({ open, history = [], reasons = [], nameByEmail = {}, onClose }) {
  const [openDate, setOpenDate] = useState(null);

  const reasonFor = useMemo(() => {
    const m = {};
    reasons.forEach((r) => {
      if (r.date && r.email) m[`${r.date}|${r.email}`] = r.reason;
    });
    return m;
  }, [reasons]);

  const nm = (email) => nameByEmail[email] || email;
  const rows = history.filter((d) => d.statuses && Object.keys(d.statuses).length);

  return (
    <Sheet open={open} onClose={onClose} title="Attendance archive" size="lg">
      <div className="p-5 space-y-2">
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing recorded"
            body="Past attendance will show up here once the coach marks it."
          />
        ) : (
          rows.map((d) => {
            const entries = Object.entries(d.statuses);
            const presentN = entries.filter(([, s]) => s === "present").length;
            const absent = entries.filter(([, s]) => s === "absent").map(([email]) => email);
            const isOpen = openDate === d.date;
            return (
              <div key={d.date} className="bg-[var(--th-surface-2)]/50 rounded-[16px] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenDate(isOpen ? null : d.date)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-ink">{prettyDay(d.date)}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone="green">{presentN} in</Badge>
                    {absent.length > 0 && <Badge tone="red">{absent.length} out</Badge>}
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-ink-faint" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-ink-faint" />
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 space-y-2">
                    {absent.length === 0 ? (
                      <p className="text-[12px] text-ink-soft italic">Everyone was present.</p>
                    ) : (
                      absent.map((email) => (
                        <div key={email} className="bg-[var(--th-surface)] rounded-xl p-2.5 border border-[var(--th-surface-2)]">
                          <div className="text-[12px] font-semibold text-ink">{nm(email)}</div>
                          {reasonFor[`${d.date}|${email}`] ? (
                            <div className="text-[11px] text-ink-soft mt-0.5">
                              {reasonFor[`${d.date}|${email}`]}
                            </div>
                          ) : (
                            <div className="text-[11px] font-semibold text-brand-accent mt-0.5">
                              Awaiting reason…
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
