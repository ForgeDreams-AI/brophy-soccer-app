import { Loader2 } from "lucide-react";

// Btn — the single button primitive.
// Variants: primary (navy pill), accent (gold), outline, danger, ghost.
// Sizes: sm / md / lg. `loading` swaps the label for a spinner.
export default function Btn({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon: Icon,
  children,
  className = "",
  type = "button",
  ...rest
}) {
  const sizes = {
    sm: "py-2 px-4 text-[11px]",
    md: "py-2.5 px-5 text-xs",
    lg: "py-3 px-6 text-sm",
  };

  const variants = {
    primary:
      "bg-brand-primary text-white hover:brightness-110 shadow-card",
    accent:
      "bg-brand-accent text-[var(--th-primary-deep)] hover:brightness-105 shadow-card",
    outline:
      "border-2 border-brand-primary text-brand-primary bg-transparent hover:bg-[color-mix(in_srgb,var(--th-primary)_5%,transparent)]",
    danger:
      "bg-[var(--th-danger)] text-white hover:brightness-110 shadow-card",
    ghost:
      "bg-transparent text-ink-soft hover:bg-[var(--th-surface-2)]",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`press inline-flex items-center justify-center gap-2 rounded-full font-bold uppercase tracking-[0.12em] disabled:opacity-40 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          {Icon && <Icon className="w-4 h-4" />}
          {children}
        </>
      )}
    </button>
  );
}
