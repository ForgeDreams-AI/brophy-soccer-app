// PollCard — a poll message: per-option counts + percent bars, tap to
// vote/change vote, admin "see who voted". Votes are stored as
// message.votes = { uid: optionIndex } (shape preserved from v1).
import { BarChart3, Check, ChevronRight } from "lucide-react";

export default function PollCard({ message, own, myUid, onVote, isAdmin = false, onSeeVoters }) {
  const votes = message.votes || {};
  const myVote = votes[myUid];
  const opts = message.options || [];
  const totals = opts.map((_, i) => Object.values(votes).filter((v) => v === i).length);
  const totalVotes = totals.reduce((a, b) => a + b, 0);

  const handle = (i) => {
    if (myVote !== i) onVote(i).catch((e) => console.warn("vote failed", e));
  };

  return (
    <div
      className={`rounded-xl px-3 py-2.5 shadow-card w-64 ${
        own ? "bg-brand-primary text-white" : "bg-white text-ink"
      }`}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${
          own ? "text-white/70" : "text-ink-faint"
        }`}
      >
        <BarChart3 className="w-3.5 h-3.5" /> Poll
      </div>
      <p className="text-sm font-semibold leading-snug break-words mb-2">{message.question}</p>
      <ul className="space-y-1.5">
        {opts.map((opt, i) => {
          const count = totals[i] || 0;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const isMine = myVote === i;
          return (
            <li key={`${message.id}-opt-${i}`}>
              <button
                onClick={() => handle(i)}
                className={`w-full text-left relative rounded-lg overflow-hidden border ${
                  isMine
                    ? "border-brand-accent"
                    : own
                      ? "border-white/20"
                      : "border-[var(--th-surface-2)]"
                }`}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isMine
                      ? own
                        ? "rgba(244,199,94,0.45)"
                        : "var(--th-accent-soft)"
                      : own
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(16,28,51,0.05)",
                  }}
                />
                <div className="relative px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate flex items-center gap-1">
                    {isMine && <Check className="w-3 h-3 flex-shrink-0 text-brand-accent" />}
                    {opt}
                  </span>
                  <span className="text-[11px] font-semibold opacity-80 flex-shrink-0">
                    {count} · {pct}%
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`text-[11px] mt-2 ${own ? "text-white/60" : "text-ink-faint"}`}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"}
        {myVote != null ? " · You voted" : ""}
      </div>
      {isAdmin && onSeeVoters && (
        <button
          onClick={onSeeVoters}
          className={`mt-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-0.5 ${
            own ? "text-white/80 hover:text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          See who voted <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
