// DocumentsSection — team documents + e-sign. The coach uploads files
// (Storage `documents/{uid}/…`, Firestore `documents`); everyone signs via a
// signature modal, recorded with a timestamp into the `signatures` array
// (arrayUnion). The coach can expand any doc to see who signed.
import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Trash2,
  Check,
  PenLine,
  Upload,
} from "lucide-react";
import SectionHeader from "../../../components/ui/SectionHeader";
import Btn from "../../../components/ui/Btn";
import Field, { Input } from "../../../components/ui/Field";
import Badge from "../../../components/ui/Badge";
import EmptyState from "../../../components/ui/EmptyState";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { toast } from "../../../lib/toast";
import { docTypeLabel } from "../hooks";

// File types a coach can attach. Both MIME types and extensions are listed
// so every browser / OS file picker recognizes them.
const DOC_ACCEPT = [
  "application/pdf",
  "image/*",
  "text/plain",
  ".txt",
  ".rtf",
  ".csv",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".pages",
  ".key",
  ".numbers",
  ".odt",
  ".odp",
  ".ods",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const SignModal = ({ doc, user, onSign, onClose }) => {
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSign(doc.id, name.trim());
      onClose();
    } catch (e) {
      toast("Couldn't sign — " + (e.message || ""));
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Sign ${doc.title}`}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--th-ink)_60%,transparent)]" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[var(--th-surface)] rounded-t-[28px] sm:rounded-[28px] shadow-sheet p-5">
        <div className="w-11 h-11 rounded-2xl bg-brand-accent-soft flex items-center justify-center mb-3">
          <PenLine className="w-5 h-5 text-brand-accent" />
        </div>
        <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink leading-none">
          Sign “{doc.title}”
        </h3>
        <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
          Type your full name to sign. This records your agreement with a timestamp.
        </p>
        <div className="mt-4">
          <Field label="Your full name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </Field>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn variant="ghost" size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="md"
            className="flex-1"
            loading={busy}
            disabled={!name.trim()}
            onClick={submit}
          >
            Agree &amp; sign
          </Btn>
        </div>
      </div>
    </div>
  );
};

export default function DocumentsSection({
  user,
  documents = [],
  isAdmin,
  rosterCount = 0,
  onUpload,
  onDelete,
  onSign,
  defaultCollapsed = false,
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [signDoc, setSignDoc] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [open, setOpen] = useState(!defaultCollapsed);
  const fileRef = useRef(null);

  const doUpload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    try {
      await onUpload({ title, file: pendingFile });
      setTitle("");
      setPendingFile(null);
    } catch (e) {
      toast("Couldn't upload — " + (e.message || "check Storage rules."));
    } finally {
      setBusy(false);
    }
  };

  const del = async (d) => {
    const ok = await confirm({
      title: "Delete document?",
      body: `“${d.title}” will be removed for the whole team.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(d.id);
    } catch (e) {
      toast("Couldn't delete — " + (e.message || ""));
    }
  };

  const hasSigned = (d) => (d.signatures || []).some((s) => s.uid === user?.uid);

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Documents"
        icon={FileText}
        action={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center text-ink-soft press"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        }
      />
      {open && (
        <>
          {isAdmin && (
            <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-2.5">
              <Field label="Document title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Code of Conduct"
                />
              </Field>
              <input
                ref={fileRef}
                type="file"
                accept={DOC_ACCEPT}
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2.5 px-3 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft truncate press flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {pendingFile ? pendingFile.name : "Choose file…"}
                  </span>
                </button>
                <Btn
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  loading={busy}
                  disabled={!pendingFile}
                  onClick={doUpload}
                >
                  Upload
                </Btn>
              </div>
            </div>
          )}

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents"
              body={
                isAdmin
                  ? "Upload one for the team to read and sign."
                  : "Nothing to sign right now."
              }
            />
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const sigs = d.signatures || [];
                const mine = hasSigned(d);
                const expanded = openId === d.id;
                return (
                  <div
                    key={d.id}
                    className="bg-[var(--th-surface)] rounded-[20px] shadow-card border border-[var(--th-surface-2)] overflow-hidden"
                  >
                    <div className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-accent-soft flex flex-col items-center justify-center gap-0.5 flex-shrink-0">
                        <FileText className="w-3.5 h-3.5 text-brand-accent" />
                        <span className="text-[11px] font-black leading-none tracking-tight text-brand-accent">
                          {docTypeLabel(d)}
                        </span>
                      </div>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0"
                      >
                        <div className="text-sm font-semibold text-ink truncate">{d.title}</div>
                        <div className="text-[11px] text-ink-faint mt-0.5">
                          {isAdmin
                            ? `${sigs.length}${rosterCount ? `/${rosterCount}` : ""} signed`
                            : mine
                              ? "You've signed"
                              : "Tap to read"}
                        </div>
                      </a>
                      {isAdmin ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Btn
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpenId(expanded ? null : d.id)}
                          >
                            {expanded ? "Hide" : "Who"}
                          </Btn>
                          <button
                            type="button"
                            onClick={() => del(d)}
                            title={`Delete ${d.title}`}
                            aria-label={`Delete ${d.title}`}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-[var(--th-danger)] press"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : mine ? (
                        <Badge tone="green" icon={Check}>
                          Signed
                        </Badge>
                      ) : (
                        <Btn variant="primary" size="sm" onClick={() => setSignDoc(d)}>
                          Sign
                        </Btn>
                      )}
                    </div>
                    {isAdmin && expanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-[var(--th-surface-2)]">
                        {sigs.length === 0 ? (
                          <p className="text-[11px] text-ink-faint italic">No signatures yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {sigs.map((s, i) => (
                              <li
                                key={i}
                                className="text-[11px] text-ink-soft flex items-center gap-1.5"
                              >
                                <Check className="w-3 h-3 text-[var(--th-success)] flex-shrink-0" />
                                <span className="font-semibold">{s.name}</span>
                                <span className="text-ink-faint">
                                  · {s.ts ? new Date(s.ts).toLocaleDateString() : ""}
                                </span>
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
          )}
        </>
      )}
      {signDoc && (
        <SignModal doc={signDoc} user={user} onSign={onSign} onClose={() => setSignDoc(null)} />
      )}
    </section>
  );
}
