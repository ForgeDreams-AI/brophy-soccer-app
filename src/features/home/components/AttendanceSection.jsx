// AttendanceSection — coach marks today's attendance. Each player gets an
// In/Out segmented toggle; absent players show their submitted reason (or an
// "awaiting reason" flag). Attendance lives in attendance/{YYYY-MM-DD}
// with a `statuses` map keyed by email.
import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, Archive } from "lucide-react";
import SectionHeader from "../../../components/ui/SectionHeader";
import Avatar from "../../../components/ui/Avatar";
import Badge from "../../../components/ui/Badge";
import Btn from "../../../components/ui/Btn";
import EmptyState from "../../../components/ui/EmptyState";
import SegmentedControl from "../../../components/ui/SegmentedControl";
import { toast } from "../../../lib/toast";

const initialsOf = (s) =>
  (s || "?")
    .replace(/@.*/, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const PlayerRow = ({ player, displayName, status, reason, setStatus }) => {
  const toggle = async (next) => {
    try {
      await setStatus(player.email, status === next ? "" : next);
    } catch (e) {
      toast("Couldn't update — " + (e.message || ""));
    }
  };
  return (
    <div className="bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)]">
      <div className="flex items-center gap-3">
        <Avatar initials={initialsOf(displayName)} size={38} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink truncate">{displayName}</div>
          {status === "absent" && (
            <div className="text-[11px] mt-0.5">
              {reason ? (
                <span className="text-ink-soft">
                  <span className="font-semibold">Reason:</span> {reason}
                </span>
              ) : (
                <span className="font-semibold text-brand-accent">Awaiting reason…</span>
              )}
            </div>
          )}
        </div>
        <SegmentedControl
          ariaLabel={`Attendance for ${displayName}`}
          value={status || "none"}
          onChange={(v) => toggle(v === "none" ? "" : v)}
          options={[
            { value: "present", label: "In", icon: Check },
            { value: "absent", label: "Out", icon: X },
          ]}
        />
      </div>
    </div>
  );
};

export default function AttendanceSection({
  roster = [],
  statuses = {},
  setStatus,
  nameByEmail = {},
  reasonsToday = {},
  onOpenArchive,
}) {
  const [open, setOpen] = useState(false);
  const players = roster.filter((r) => r.role !== "admin");
  const present = players.filter((p) => statuses[p.email] === "present").length;
  const absent = players.filter((p) => statuses[p.email] === "absent").length;
  const nm = (p) => nameByEmail[p.email] || p.name || p.email;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Attendance"
        icon={Archive}
        action={
          <div className="flex items-center gap-2">
            {onOpenArchive && (
              <Btn variant="ghost" size="sm" onClick={onOpenArchive}>
                Archive
              </Btn>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center text-ink-soft press"
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        }
      />
      <div className="flex items-center gap-2">
        <Badge tone="green">
          {present}/{players.length} in
        </Badge>
        {absent > 0 && <Badge tone="red">{absent} out</Badge>}
      </div>
      {open &&
        (players.length === 0 ? (
          <EmptyState
            icon={Check}
            title="No players"
            body="Add players to the roster before marking attendance."
          />
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <PlayerRow
                key={p.email}
                player={p}
                displayName={nm(p)}
                status={statuses[p.email] || ""}
                reason={reasonsToday[p.email]}
                setStatus={setStatus}
              />
            ))}
          </div>
        ))}
    </section>
  );
}
