// Skeleton — shimmer loading placeholders. <Skeleton rows={3} /> or
// <Skeleton className="h-16 rounded-2xl" /> for a single block.
export default function Skeleton({ rows = 1, className = "", rowClassName = "h-16 rounded-[20px]" }) {
  const shimmer = {
    backgroundImage:
      "linear-gradient(100deg, var(--th-surface-2) 40%, var(--th-surface) 50%, var(--th-surface-2) 60%)",
    backgroundSize: "200% 100%",
    animation: "th-shimmer 1.4s linear infinite",
  };
  if (rows === 1 && !rowClassName) return <div className={className} style={shimmer} aria-hidden="true" />;
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={rowClassName} style={shimmer} />
      ))}
    </div>
  );
}
