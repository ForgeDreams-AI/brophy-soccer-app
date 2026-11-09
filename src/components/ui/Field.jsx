import { forwardRef } from "react";

const inputCls =
  "w-full bg-[var(--th-surface)] border border-[var(--th-surface-2)] rounded-[14px] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--th-primary)_30%,transparent)] focus:border-brand-primary transition-shadow disabled:opacity-50";

// Field — label + control + hint/error. Wrap Input / TextArea / Select.
export function Field({ label, hint, error, children, className = "", htmlFor }) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      {label && (
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft mb-1.5">
          {label}
        </span>
      )}
      {children}
      {error ? (
        <span className="block text-[11px] font-medium text-[var(--th-danger)] mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-ink-faint mt-1.5 leading-snug">{hint}</span>
      ) : null}
    </label>
  );
}

export const Input = forwardRef(function Input({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`${inputCls} ${className}`} {...rest} />;
});

export const TextArea = forwardRef(function TextArea({ className = "", rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={`${inputCls} resize-y ${className}`} {...rest} />;
});

export const Select = forwardRef(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${inputCls} appearance-none ${className}`} {...rest}>
      {children}
    </select>
  );
});
export default Field;
