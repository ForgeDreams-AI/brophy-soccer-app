// GroupsModal — admin manages calendar visibility groups: create, accordion
// per-group member In/Out toggles (signed-in players keyed by uid,
// invited-only players keyed by email), and delete (always confirmed).
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Users } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import EmptyState from "../../../components/ui/EmptyState";
import { Field, Input } from "../../../components/ui/Field";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";

export default function GroupsModal({
  open,
  groups = [],
  allUsers = [],
  invites = [],
  onClose,
  addGroup,
  updateGroupMembers,
  deleteGroup,
}) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState("");

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await addGroup(newName);
      setNewName("");
      setErr("");
    } catch (e) {
      setErr("Couldn't create — " + (e.message || ""));
    }
  };

  const toggleMember = (group, key) => {
    const set = new Set(group.memberUids || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    updateGroupMembers(group.id, [...set]).catch((e) =>
      setErr("Couldn't update — " + (e.message || "")),
    );
  };

  const remove = async (group) => {
    const ok = await confirm({
      title: "Delete group?",
      body: `Remove "${group.name}"? Events addressed to it keep their other audience keys, but this group will no longer resolve.`,
      confirmLabel: "Delete group",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGroup(group.id);
      if (openId === group.id) setOpenId(null);
      toast("Group deleted.", "success");
    } catch (e) {
      setErr("Couldn't delete — " + (e.message || ""));
    }
  };

  // Signed-in players key by uid; invited-only (never logged in) key by email
  // until they sign in and the app matches their uid.
  const signedInEmails = new Set((allUsers || []).map((u) => (u.email || "").toLowerCase()).filter(Boolean));
  const invitedOnly = (invites || []).filter(
    (i) => i.email && !signedInEmails.has(i.email.toLowerCase()),
  );

  return (
    <Sheet open={open} onClose={onClose} title="Groups" subtitle="Address calendar events to whole groups" size="lg">
      <div className="space-y-4">
        <div className="rounded-[16px] bg-[var(--th-surface-2)] p-3">
          <div className="flex gap-2">
            <Field className="flex-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Group name (e.g. Forwards, Captains)"
              />
            </Field>
            <Btn variant="primary" size="md" icon={Plus} onClick={create} className="flex-shrink-0">
              Add
            </Btn>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-faint">
            Create a group, then pick members below. When you add a calendar event with custom
            visibility, you can address it to whole groups instead of clicking everyone individually.
          </p>
          {err && <p className="mt-1 px-1 text-[11px] font-semibold text-[var(--th-danger)]">{err}</p>}
        </div>

        {groups.length === 0 ? (
          <EmptyState icon={Users} title="No groups" body="Create your first group above to get started." />
        ) : (
          groups.map((g) => {
            const openAccordion = openId === g.id;
            const memberSet = new Set(g.memberUids || []);
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-[16px] border border-[var(--th-surface-2)] bg-[var(--th-surface)] shadow-card"
              >
                <button
                  onClick={() => setOpenId(openAccordion ? null : g.id)}
                  className="press flex w-full items-center justify-between gap-2 p-3 text-left"
                  aria-expanded={openAccordion}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{g.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {memberSet.size} member{memberSet.size === 1 ? "" : "s"}
                    </div>
                  </div>
                  {openAccordion ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-ink-faint" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-faint" />
                  )}
                </button>

                {openAccordion && (
                  <div className="space-y-2 border-t border-[var(--th-surface-2)] p-3 pt-2">
                    {allUsers.length === 0 ? (
                      <p className="text-[12px] italic text-ink-faint">
                        No signed-in players yet. They'll appear here after first login.
                      </p>
                    ) : (
                      <ul className="max-h-56 divide-y divide-[var(--th-surface-2)] overflow-y-auto">
                        {allUsers.map((p) => {
                          const on = memberSet.has(p.id);
                          return (
                            <li key={p.id} className="flex items-center gap-2 py-1.5">
                              <div
                                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                                  p.role === "admin" ? "bg-brand-primary" : "bg-[var(--th-ink-3)]"
                                }`}
                              >
                                {p.initials || (p.name || "?")[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[12px] font-semibold text-ink">
                                  {p.name || p.email}
                                </div>
                                <div className="truncate font-mono text-[11px] text-ink-faint">
                                  {p.email}
                                </div>
                              </div>
                              <button
                                onClick={() => toggleMember(g, p.id)}
                                aria-pressed={on}
                                className={`press flex-shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                                  on
                                    ? "bg-[var(--th-success)] text-white"
                                    : "bg-[var(--th-surface-2)] text-ink-soft"
                                }`}
                              >
                                {on ? "In" : "Out"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {invitedOnly.length > 0 && (
                      <details className="rounded-[12px] bg-[var(--th-surface-2)] p-2">
                        <summary className="cursor-pointer px-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                          + Add invited-only players ({invitedOnly.length})
                        </summary>
                        <p className="mt-1 px-1 text-[11px] leading-relaxed text-ink-faint">
                          Players who haven't signed in yet are keyed by email. The app matches
                          their uid once they sign in.
                        </p>
                        <ul className="mt-2 max-h-40 divide-y divide-[var(--th-surface)] overflow-y-auto">
                          {invitedOnly.map((inv) => {
                            const on = memberSet.has(inv.email);
                            return (
                              <li key={inv.id || inv.email} className="flex items-center gap-2 py-1.5">
                                <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                                  {inv.email}
                                </div>
                                <button
                                  onClick={() => toggleMember(g, inv.email)}
                                  aria-pressed={on}
                                  className={`press flex-shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                                    on
                                      ? "bg-[var(--th-success)] text-white"
                                      : "bg-[var(--th-surface)] text-ink-soft"
                                  }`}
                                >
                                  {on ? "In" : "Out"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}

                    <button
                      onClick={() => remove(g)}
                      className="press flex w-full items-center justify-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--th-danger)_30%,transparent)] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--th-danger)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete group
                    </button>
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
