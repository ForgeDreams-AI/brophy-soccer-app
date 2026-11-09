// ProgressRing — SVG ring. value 0..1. color: 'gold' | 'navy' | hex.
export default function ProgressRing({
  value = 0,
  size = 56,
  stroke = 6,
  color = "gold",
  track = "var(--th-surface-2)",
  className = "",
  children,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const strokeColor =
    color === "gold" ? "var(--th-accent)" : color === "navy" ? "var(--th-primary)" : color;

  return (
    <span className={`relative inline-flex ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
        />
      </svg>
      {children && (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      )}
    </span>
  );
}
