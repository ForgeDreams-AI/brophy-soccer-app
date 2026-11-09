// ProgressBar — rounded bar with gradient fill. value 0..1.
export default function ProgressBar({
  value = 0,
  className = "",
  barClassName = "",
  from = "var(--th-primary)",
  to = "var(--th-accent)",
  height = 8,
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      className={`w-full rounded-full bg-[var(--th-surface-2)] overflow-hidden ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${barClassName}`}
        style={{
          width: `${clamped * 100}%`,
          background: `linear-gradient(90deg, ${from}, ${to})`,
          transition: "width 0.5s ease-out",
        }}
      />
    </div>
  );
}
