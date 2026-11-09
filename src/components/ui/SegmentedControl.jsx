// SegmentedControl — pill options (e.g. Everyone / Specific, In / Out).
// options: [{ value, label, icon? }]
export default function SegmentedControl({ options, value, onChange, className = "", ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex p-1 rounded-full bg-[var(--th-surface-2)] gap-0.5 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`press flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
              active ? "bg-brand-primary text-white shadow-card" : "text-ink-soft"
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
