import { Lock } from "lucide-react";

// ReadOnlyHint — tiny marker used on player-visible libraries, e.g.
// "Coach uploads film & drills". Renders a lock + label; nothing else.
export default function ReadOnlyHint({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
      <Lock className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
