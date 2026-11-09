// Avatar — circular profile photo, falling back to initials on a navy tile.
export default function Avatar({ photoURL, initials, size = 36, ring = false, className = "" }) {
  const px = typeof size === "number" ? size : 36;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 bg-brand-primary text-white font-bold ${
        ring ? "ring-2 ring-brand-accent ring-offset-2 ring-offset-[var(--th-surface)]" : ""
      } ${className}`}
      style={{ width: px, height: px, fontSize: Math.max(10, px * 0.36) }}
      aria-hidden="true"
    >
      {photoURL ? (
        <img src={photoURL} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="leading-none select-none">{initials || "?"}</span>
      )}
    </span>
  );
}
