// Card — 3 elevation tiers so list rows, content cards, and heroes never
// look interchangeable (design critique #6).
//   flat   — tinted surface-2, no border/shadow (quiet grouping)
//   raised — white, hairline border, soft shadow (default content card)
//   hero   — navy→deep gradient, white text (feature moments)
export default function Card({ elevation = "raised", className = "", children, onClick, ...rest }) {
  const tiers = {
    flat: "bg-[var(--th-surface-2)]",
    raised: "bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card",
    hero: "text-white shadow-hero",
  };
  const heroStyle =
    elevation === "hero"
      ? { background: "linear-gradient(135deg, var(--th-primary) 0%, var(--th-primary-deep) 100%)" }
      : undefined;

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={heroStyle}
      className={`${onClick ? "press text-left w-full cursor-pointer" : ""} rounded-[20px] p-4 ${tiers[elevation]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
