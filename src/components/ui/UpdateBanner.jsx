import { RefreshCw, X, Sparkles } from "lucide-react";
import { RELEASES, APP_VERSION } from "../../data/seeds/whatsNew";

// UpdateBanner — thin bar pinned to the top of the app when a newer build is
// live (see useAppUpdate). Tapping Refresh reloads into the new deploy.
export function UpdateBanner({ onReload }) {
  return (
    <div
      className="w-full flex items-center gap-2 px-4 py-2 text-white text-xs font-semibold bg-brand-primary"
      role="status"
    >
      <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 leading-tight">A new version is available.</span>
      <button
        onClick={onReload}
        className="press px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 font-bold uppercase tracking-[0.12em] text-[11px]"
      >
        Refresh
      </button>
    </div>
  );
}

// WhatsNewModal — changelog screen from data/seeds/whatsNew.js. Pops once
// after an update for returning users; always reachable from Settings.
export function WhatsNewModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--th-ink)_60%,transparent)] flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
    >
      <div
        className="bg-[var(--th-surface)] rounded-t-[28px] sm:rounded-[28px] w-full sm:max-w-md max-h-[85vh] overflow-y-auto shadow-sheet animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--th-surface)] border-b border-[var(--th-surface-2)] px-5 py-3.5 flex items-center justify-between z-10">
          <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-accent" /> What's New
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="press w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-ink-soft" />
          </button>
        </div>
        <div className="p-5 space-y-6">
          {RELEASES.map((r) => (
            <div key={r.version}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-ink">{r.title || `Version ${r.version}`}</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--th-accent-soft)] text-[var(--th-primary-deep)]">
                  v{r.version}
                </span>
              </div>
              {r.date && <div className="text-[11px] text-ink-faint font-medium mt-0.5">{r.date}</div>}
              <ul className="mt-2 space-y-1.5">
                {(r.items || []).map((it, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-ink-soft leading-snug">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-accent flex-shrink-0" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] text-ink-faint text-center pt-1">You're on version {APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}

export default UpdateBanner;
