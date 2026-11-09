// RosterManager — the coach's roster + invite gate + groups, in one tabbed
// card. Invited emails must be on the roster before players can sign in.
// Single add, bulk add (regex-parsed, de-duped), role toggle admin↔player
// (self-demotion blocked), remove, and group CRUD.
import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Users,
  Layers,
  Bell,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import Tabs from "../../../components/ui/Tabs";
import SectionHeader from "../../../components/ui/SectionHeader";
import Btn from "../../../components/ui/Btn";
import { Input, TextArea } from "../../../components/ui/Field";
import EmptyState from "../../../components/ui/EmptyState";
import Badge from "../../../components/ui/Badge";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const parseEmails = (text) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => EMAIL_RE.test(s)),
  ),
];

const SingleAdd = ({ onAdd }) => {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const submit = async () => {
    setMsg("");
    setErr(false);
    try {
      await onAdd(email);
      setMsg(`Added ${email.trim().toLowerCase()}.`);
      setEmail("");
    } catch (e) {
      setMsg(e.message || "Couldn't add — check rules.");
      setErr(true);
    }
  };
  return (
    <>
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setMsg("");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="player@example.com"
          className="flex-1"
        />
        <Btn variant="primary" size="sm" icon={Plus} onClick={submit}>
          Add
        </Btn>
      </div>
      {msg && (
        <p
          className={`text-[11px] font-semibold px-1 ${err ? "text-[var(--th-danger)]" : "text-[var(--th-success)]"}`}
        >
          {msg}
        </p>
      )}
    </>
  );
};

const BulkAdd = ({ onAddBatch, onClose }) => {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setMsg("");
    const emails = parseEmails(text);
    if (!emails.length) {
      setMsg("No valid emails found — paste one per line or comma-separated.");
      return;
    }
    setBusy(true);
    try {
      await onAddBatch(emails);
      setMsg(`Added ${emails.length} email${emails.length === 1 ? "" : "s"}.`);
      setText("");
      onClose();
    } catch (e) {
      setMsg("Couldn't import — " + (e.message || "check rules."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TextArea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMsg("");
        }}
        placeholder={"Paste emails — one per line, or comma-separated.\n\nalex@example.com\nmaya@example.com\ndevin@example.com"}
        className="font-mono text-xs"
      />
      {msg && <p className="text-[11px] font-semibold px-1 text-[var(--th-danger)]">{msg}</p>}
      <div className="flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" className="flex-1" loading={busy} onClick={submit}>
          Add all
        </Btn>
      </div>
    </>
  );
};

const RosterTab = ({
  user,
  invites = [],
  nameByEmail = {},
  onAdd,
  onRemove,
  onAddBatch,
  onSetRole,
  onRequestProfileUpdate,
}) => {
  const confirm = useConfirm();
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggleRole = async (inv) => {
    const next = inv.role === "admin" ? "player" : "admin";
    try {
      await onSetRole(inv.email, next);
      toast(
        `${inv.email} is now ${next === "admin" ? "a coach" : "a player"}.`,
        "success",
      );
    } catch (e) {
      toast(e.message || "Couldn't change role.");
    }
  };

  const remove = async (inv) => {
    const ok = await confirm({
      title: "Remove from roster?",
      body: `“${inv.email}” won't be able to sign in anymore.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await onRemove(inv.email);
    } catch (e) {
      toast("Couldn't remove — " + (e.message || ""));
    }
  };

  return (
    <div className="space-y-2.5">
      {onRequestProfileUpdate && (
        <Btn
          variant="outline"
          size="sm"
          className="w-full"
          icon={Bell}
          onClick={async () => {
            try {
              await onRequestProfileUpdate();
              toast("Sent — everyone will be asked to add their name.", "success");
            } catch (e) {
              toast("Couldn't send — " + (e.message || ""));
            }
          }}
        >
          Ask everyone to update their info
        </Btn>
      )}

      <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-2.5">
        {!bulkOpen ? (
          <>
            <SingleAdd onAdd={onAdd} />
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="w-full py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] border-2 border-[var(--th-surface-2)] text-ink-soft bg-transparent hover:bg-[var(--th-surface-2)]/50 press"
            >
              Paste many
            </button>
            <p className="text-[11px] text-ink-faint leading-relaxed px-1">
              Players need their email on the roster before they can sign in. Then
              share the app URL — they pick “Email me a sign-in link” or “Continue
              with Google” and they're in.
            </p>
          </>
        ) : (
          <BulkAdd onAddBatch={onAddBatch} onClose={() => setBulkOpen(false)} />
        )}
      </div>

      {(!invites || invites.length === 0) ? (
        <EmptyState
          icon={Users}
          title="No players yet"
          body="Add emails to build your roster."
        />
      ) : (
        <ul className="bg-[var(--th-surface)] rounded-[20px] shadow-card border border-[var(--th-surface-2)] overflow-hidden divide-y divide-[var(--th-surface-2)]">
          {invites.map((inv) => {
            const isCoach = inv.role === "admin";
            const isSelf = inv.email === user.email;
            return (
              <li key={inv.email || inv.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className="truncate flex-1 min-w-0">
                  {nameByEmail[inv.email] ? (
                    <>
                      <span className="text-[13px] font-semibold text-ink">
                        {nameByEmail[inv.email]}
                      </span>
                      <span className="text-[11px] text-ink-faint ml-1.5">{inv.email}</span>
                    </>
                  ) : (
                    <span className="text-[13px] font-mono text-ink-soft">{inv.email}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => toggleRole(inv)}
                  disabled={isSelf}
                  title={
                    isSelf
                      ? "You can't change your own role here."
                      : isCoach
                        ? "Make player"
                        : "Make coach"
                  }
                  className={`text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-full flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed press ${
                    isCoach
                      ? "bg-brand-primary text-white"
                      : "bg-[var(--th-surface-2)] text-ink-soft"
                  }`}
                >
                  {isCoach ? "Coach" : "Player"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(inv)}
                  disabled={isSelf}
                  title={isSelf ? "You can't remove yourself." : `Remove ${inv.email}`}
                  aria-label={`Remove ${inv.email}`}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-[var(--th-danger)] disabled:opacity-40 disabled:cursor-not-allowed press flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const GroupsTab = ({
  groups = [],
  invites = [],
  uidByEmail = {},
  onAddGroup,
  onUpdateGroupMembers,
  onDeleteGroup,
}) => {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);

  const createGroup = async () => {
    if (!newName.trim()) return;
    try {
      await onAddGroup(newName);
      setNewName("");
    } catch (e) {
      toast("Couldn't create — " + (e.message || ""));
    }
  };

  // Membership keys: the signed-in uid when known, else the invite email
  // (fallback for players who haven't signed in yet).
  const keyFor = (inv) => uidByEmail[inv.email] || inv.email;

  const toggleMember = (group, inv) => {
    const key = keyFor(inv);
    const set = new Set(group.memberUids || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onUpdateGroupMembers(group.id, [...set]).catch((e) =>
      toast("Couldn't update — " + (e.message || "")),
    );
  };

  const del = async (g) => {
    const ok = await confirm({
      title: "Delete group?",
      body: `“${g.name}” will be removed. Events addressed to it become team-wide.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDeleteGroup(g.id);
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-2.5">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createGroup()}
            placeholder="Group name (e.g. Forwards, Captains)"
            className="flex-1"
          />
          <Btn variant="primary" size="sm" onClick={createGroup}>
            Add
          </Btn>
        </div>
        <p className="text-[11px] text-ink-faint leading-relaxed px-1">
          Create groups to send events and assignments to subsets of the roster —
          e.g. only Forwards see a position-specific film session.
        </p>
      </div>

      {(!groups || groups.length === 0) ? (
        <EmptyState
          icon={Layers}
          title="No groups"
          body="Group players for position-specific events and assignments."
        />
      ) : (
        groups.map((g) => {
          const open = openGroupId === g.id;
          const members = new Set(g.memberUids || []);
          return (
            <div
              key={g.id}
              className="bg-[var(--th-surface)] rounded-[20px] shadow-card border border-[var(--th-surface-2)] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenGroupId(open ? null : g.id)}
                aria-expanded={open}
                className="w-full p-4 flex items-center justify-between gap-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink truncate">{g.name}</div>
                  <div className="text-[11px] text-ink-faint">
                    {members.size} member{members.size === 1 ? "" : "s"}
                  </div>
                </div>
                {open ? (
                  <ChevronUp className="w-4 h-4 text-ink-faint flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-ink-faint flex-shrink-0" />
                )}
              </button>
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-[var(--th-surface-2)] space-y-2.5">
                  {(invites || []).length === 0 ? (
                    <p className="text-[11px] text-ink-faint italic py-2">
                      Add roster players first, then come back to assign them.
                    </p>
                  ) : (
                    <ul className="max-h-56 overflow-y-auto divide-y divide-[var(--th-surface-2)]">
                      {invites.map((inv) => {
                        const isMember = members.has(keyFor(inv));
                        return (
                          <li key={inv.email || inv.id} className="flex items-center gap-2 py-2">
                            <span className="flex-1 min-w-0 text-[13px] font-mono text-ink-soft truncate">
                              {inv.email}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleMember(g, inv)}
                              aria-pressed={isMember}
                              className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-full press ${
                                isMember
                                  ? "bg-[var(--th-success)] text-white"
                                  : "bg-[var(--th-surface-2)] text-ink-faint"
                              }`}
                            >
                              {isMember ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              {isMember ? "In" : "Out"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Btn
                    variant="danger"
                    size="sm"
                    className="w-full"
                    icon={Trash2}
                    onClick={() => del(g)}
                  >
                    Delete group
                  </Btn>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default function RosterManager(props) {
  const [tab, setTab] = useState("roster");
  const { invites = [], allUsers = [], groups = [] } = props;

  // Map invite emails → signed-in uids for group membership keys.
  const uidByEmail = useMemo(() => {
    const m = {};
    (allUsers || []).forEach((u) => {
      if (u.email && u.uid) m[u.email] = u.uid;
    });
    return m;
  }, [allUsers]);

  return (
    <section className="space-y-3">
      <SectionHeader title="Roster" icon={Users} />
      <div className="flex items-center gap-2">
        <Badge tone="navy">{invites.length} total</Badge>
        <Badge tone="green">
          {invites.filter((i) => i.role !== "admin").length} players
        </Badge>
        <Badge tone="gold">
          {invites.filter((i) => i.role === "admin").length} coaches
        </Badge>
      </div>
      <Tabs
        tabs={[
          { id: "roster", label: "Roster", icon: Users },
          { id: "groups", label: "Groups", icon: Layers },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "roster" ? (
        <RosterTab {...props} />
      ) : (
        <GroupsTab groups={groups} invites={invites} uidByEmail={uidByEmail} {...props} />
      )}
    </section>
  );
}
