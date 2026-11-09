// SectionHeader — display-font uppercase title with a gold accent bar and
// an optional right-side action. Use for every major section instead of
// the old text-[10px] font-black uppercase eyebrow pattern (critique #2).
export default function SectionHeader({ title, action, icon: Icon, className = "" }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-4 h-4 text-brand-accent flex-shrink-0" />}
        <div className="min-w-0">
          <h2 className="font-display font-bold text-[22px] leading-none uppercase tracking-wide text-ink truncate">
            {title}
          </h2>
          <div className="mt-1 h-[3px] w-8 rounded-full bg-brand-accent" />
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
