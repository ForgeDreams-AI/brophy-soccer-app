// Badge — small pill. tones: gold / navy / green / red / blue.
export default function Badge({ tone = "navy", children, className = "", icon: Icon }) {
  const tones = {
    gold: "bg-[var(--th-accent-soft)] text-[var(--th-primary-deep)]",
    navy: "bg-brand-primary text-white",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-[var(--th-danger)]",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold leading-tight ${tones[tone]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
