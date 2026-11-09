import { createContext, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Btn from "./Btn";
import Field, { Input } from "./Field";

const ConfirmContext = createContext(null);

// Promise-based replacement for ALL native confirm()/prompt() calls.
//
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Delete workout?", body: "This can't be undone.", danger: true });
//   if (!ok) return;
//
//   const name = await confirm.prompt({ title: "New group", label: "Group name", placeholder: "Varsity" });
//   if (name === null) return; // user cancelled
//
// Render <ConfirmProvider> once near the app root (TeamHubApp does this).
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const resolver = useRef(null);

  const settle = (value) => {
    setReq(null);
    const r = resolver.current;
    resolver.current = null;
    r?.(value);
  };

  // Built as one object inside a single useMemo — never mutated afterwards.
  const confirm = useMemo(() => {
    const fn = (opts = {}) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setReq({ kind: "confirm", ...opts });
      });
    fn.prompt = (opts = {}) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setReq({ kind: "prompt", ...opts });
      });
    return fn;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req?.kind === "confirm" && (
        <ConfirmDialogView
          title={req.title || "Are you sure?"}
          body={req.body}
          confirmLabel={req.confirmLabel || "Confirm"}
          cancelLabel={req.cancelLabel || "Cancel"}
          danger={!!req.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
      {req?.kind === "prompt" && (
        <PromptDialogView
          title={req.title || "Enter a value"}
          label={req.label}
          initial={req.initial || ""}
          placeholder={req.placeholder}
          confirmLabel={req.confirmLabel || "Save"}
          cancelLabel={req.cancelLabel || "Cancel"}
          onSubmit={(v) => settle(v)}
          onCancel={() => settle(null)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be used inside <ConfirmProvider>");
  return ctx;
}

// Presentational pieces (also usable standalone with explicit handlers).

export function ConfirmDialogView({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--th-ink)_60%,transparent)]" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-xs bg-[var(--th-surface)] rounded-[24px] p-5 shadow-sheet animate-pop-in">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-3 ${
            danger ? "bg-red-50" : "bg-[var(--th-accent-soft)]"
          }`}
        >
          <AlertTriangle className={`w-5 h-5 ${danger ? "text-[var(--th-danger)]" : "text-[var(--th-accent)]"}`} />
        </div>
        <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink leading-none">
          {title}
        </h3>
        {body && <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">{body}</p>}
        <div className="flex gap-2 mt-5">
          <Btn variant="ghost" size="sm" className="flex-1" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Btn>
          <Btn
            variant={danger ? "danger" : "primary"}
            size="sm"
            className="flex-1"
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function PromptDialogView({
  title,
  label,
  initial = "",
  placeholder,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  };
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--th-ink)_60%,transparent)]" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-xs bg-[var(--th-surface)] rounded-[24px] p-5 shadow-sheet animate-pop-in">
        <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink leading-none">
          {title}
        </h3>
        <div className="mt-4">
          <Field label={label}>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={placeholder}
            />
          </Field>
        </div>
        <div className="flex gap-2 mt-4">
          <Btn variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Btn>
          <Btn variant="primary" size="sm" className="flex-1" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Back-compat alias — import { ConfirmDialog } from "./ConfirmDialog".
export const ConfirmDialog = ConfirmDialogView;

export default ConfirmDialogView;
