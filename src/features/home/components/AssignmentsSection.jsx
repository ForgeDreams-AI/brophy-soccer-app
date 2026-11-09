// AssignmentsSection — coach assigns a task (optionally a linked team
// workout) with a due date + audience; expanding a row shows who's marked it
// done. New assignments go through the AssignModal.
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Plus,
  Trash2,
  Check,
  ClipboardList,
} from "lucide-react";
import SectionHeader from "../../../components/ui/SectionHeader";
import Btn from "../../../components/ui/Btn";
import EmptyState from "../../../components/ui/EmptyState";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";
import { todayKey, parseDayKey } from "../../../lib/dates";
import { visibleToText } from "../../../lib/audience";
import AssignModal from "./AssignModal";

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

export default function AssignmentsSection({
  assignments = [],
  teamWorkouts = [],
  groups = [],
  people = [],
  addAssignment,
  deleteAssignment,
}) {
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [expandId, setExpandId] = useState(null);

  const today = todayKey();
  const playersTotal = people.length;
  const upcoming = [...assignments]
    .filter((a) => (a.date || "") >= today)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const del = async (a) => {
    const ok = await confirm({
      title: "Delete assignment?",
      body: `“${a.title}” will be removed for everyone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAssignment(a.id);
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Assignments"
        icon={ClipboardList}
        action={
          <div className="flex items-center gap-2">
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => setModalOpen(true)}>
              Assign
            </Btn>
            <button
              type="button"
              onClick={() => setListOpen((o) => !o)}
              aria-expanded={listOpen}
              className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center text-ink-soft press"
            >
              {listOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        }
      />
      {listOpen &&
        (upcoming.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nothing assigned"
            body="Assign a task, workout, or reading to the team."
            action={<Btn variant="outline" size="sm" icon={Plus} onClick={() => setModalOpen(true)}>New assignment</Btn>}
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((a) => {
              const doneNames = Object.values(a.completedBy || {}).map((c) => c.name);
              const expanded = expandId === a.id;
              const audience = visibleToText(a.visibleTo, groups);
              return (
                <div
                  key={a.id}
                  className="bg-[var(--th-surface)] rounded-[20px] shadow-card border border-[var(--th-surface-2)] overflow-hidden"
                >
                  <div className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
                      <Dumbbell className="w-4 h-4 text-brand-accent" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandId(expanded ? null : a.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-semibold text-ink truncate">{a.title}</div>
                      <div className="text-[11px] text-ink-faint mt-0.5">
                        {prettyDay(a.date)} · {doneNames.length}
                        {playersTotal ? `/${playersTotal}` : ""} done
                        {audience !== "Everyone" && ` · ${audience}`}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => del(a)}
                      title={`Delete ${a.title}`}
                      aria-label={`Delete ${a.title}`}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-[var(--th-danger)] press flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {expanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-[var(--th-surface-2)]">
                      {a.body && (
                        <p className="text-[13px] text-ink-soft whitespace-pre-wrap leading-relaxed mb-2">
                          {a.body}
                        </p>
                      )}
                      {a.link && (
                        <a
                          href={a.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-semibold text-brand-primary break-all"
                        >
                          {a.link}
                        </a>
                      )}
                      {doneNames.length === 0 ? (
                        <p className="text-[11px] text-ink-faint italic">
                          No one has marked this done yet.
                        </p>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5 mt-2">
                          {doneNames.map((n, i) => (
                            <li
                              key={i}
                              className="text-[11px] font-semibold text-ink-soft bg-[var(--th-surface-2)] rounded-full px-2.5 py-1 inline-flex items-center gap-1"
                            >
                              <Check className="w-3 h-3 text-[var(--th-success)]" />
                              {n}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      {modalOpen && (
        <AssignModal
          teamWorkouts={teamWorkouts}
          groups={groups}
          people={people}
          onCreate={addAssignment}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
