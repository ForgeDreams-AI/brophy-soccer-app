// ChannelModal — coach-only: create a group chat and choose who can see it
// (everyone, or a mix of existing groups + individual players). Also lists
// channels, edits their membership after creation (re-stamps message
// audienceKeys via hooks.updateChatGroup), and deletes them (confirm).
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { Input } from "../../../components/ui/Field";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";
import AudiencePicker from "./AudiencePicker";

// One row in "Your group chats" — names who can see it and, when expanded,
// lets the coach add or remove people and whole groups after creation.
function ChannelRow({ channel, groups, players, nameOf, onUpdate, onDelete }) {
  const confirm = useConfirm();
  const v = channel.visibleTo || {};
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("everyone");
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);

  // Re-seed from the live doc each time the editor opens, so a membership
  // change made elsewhere isn't clobbered by stale state from a previous open.
  const startEdit = () => {
    const vv = channel.visibleTo || {};
    setMode((vv.emails || []).length || (vv.groupIds || []).length ? "custom" : "everyone");
    setGroupIds(vv.groupIds || []);
    setEmails(vv.emails || []);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try {
      await onUpdate(channel.id, visibleTo);
      setEditing(false);
      toast("Members updated", "success");
    } catch (e) {
      toast("Couldn't update — " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${channel.name}"?`,
      body: "The channel and its message history stay in the database, but nobody will see it anymore.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(channel.id);
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  const audience = [
    ...(v.groupIds || []).map((gid) => groups.find((g) => g.id === gid)?.name).filter(Boolean),
    ...(v.emails || []).map((em) => nameOf(em) || em),
  ];

  return (
    <li className="bg-[var(--th-surface-2)] rounded-xl px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink truncate">#{channel.name}</div>
          <div className="text-[11px] text-ink-faint truncate">
            {audience.length ? audience.join(", ") : "Everyone"}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
              editing ? "bg-[var(--th-surface-2)] text-ink-soft" : "bg-brand-primary text-white"
            }`}
          >
            {editing ? "Cancel" : "Members"}
          </button>
          <button
            onClick={remove}
            aria-label={`Delete ${channel.name}`}
            className="text-ink-faint hover:text-[var(--th-danger)] p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-[var(--th-surface-2)] space-y-2">
          <AudiencePicker
            groups={groups}
            players={players}
            nameOf={nameOf}
            mode={mode}
            setMode={setMode}
            groupIds={groupIds}
            setGroupIds={setGroupIds}
            emails={emails}
            setEmails={setEmails}
          />
          <Btn size="sm" className="w-full" loading={busy} onClick={save}>
            Save members
          </Btn>
        </div>
      )}
    </li>
  );
}

export default function ChannelModal({
  chatGroups,
  groups,
  roster,
  nameByEmail = {},
  onCreate,
  onDelete,
  onUpdate,
  onClose,
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || [])
    .filter((r) => r.role !== "admin")
    // Players with a known name first, then alphabetically by name/email.
    .sort((a, b) =>
      (nameOf(a.email) || a.email || "").localeCompare(nameOf(b.email) || b.email || ""),
    );

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try {
      await onCreate(name, visibleTo);
      setName("");
      setMode("everyone");
      setGroupIds([]);
      setEmails([]);
      toast("Group chat created", "success");
    } catch (e) {
      toast("Couldn't create — " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Group chats" size="lg">
      <div className="space-y-4">
        <div className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group chat name (e.g. Captains)"
          />
          <AudiencePicker
            groups={groups}
            players={players}
            nameOf={nameOf}
            mode={mode}
            setMode={setMode}
            groupIds={groupIds}
            setGroupIds={setGroupIds}
            emails={emails}
            setEmails={setEmails}
          />
          <Btn
            className="w-full"
            loading={busy}
            disabled={!name.trim()}
            icon={Plus}
            onClick={create}
          >
            Create group chat
          </Btn>
        </div>

        {chatGroups.length > 0 && (
          <div className="pt-2 border-t border-[var(--th-surface-2)]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">
              Your group chats
            </p>
            <ul className="space-y-1.5">
              {chatGroups.map((c) => (
                <ChannelRow
                  key={c.id}
                  channel={c}
                  groups={groups}
                  players={players}
                  nameOf={nameOf}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
