// Tabs — pill tab switcher (in-page, not the bottom nav).
// tabs: [{ id, label, icon? }]
export default function Tabs({ tabs, value, onChange, className = "" }) {
  return (
    <div className={`flex gap-1 p-1 rounded-full bg-[var(--th-surface-2)] ${className}`} role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`press flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
              active ? "bg-[var(--th-surface)] text-brand-primary shadow-card" : "text-ink-faint"
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
