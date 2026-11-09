import ProgressRing from "./ProgressRing";

// StatTile — icon, big display-font number, label. Optional progress ring
// behind the value (pass progress 0..1).
export default function StatTile({ icon: Icon, value, label, progress, className = "", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`${onClick ? "press text-left cursor-pointer" : ""} bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card rounded-[20px] p-3 flex flex-col gap-1 ${className}`}
    >
      <span className="flex items-center gap-1.5 text-ink-faint">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] truncate">{label}</span>
      </span>
      <span className="relative inline-flex items-center">
        {progress != null && (
          <ProgressRing value={progress} size={44} stroke={5} className="mr-1" />
        )}
        <span className="font-display font-bold text-[30px] leading-none text-ink tabular">
          {value}
        </span>
      </span>
    </Tag>
  );
}
