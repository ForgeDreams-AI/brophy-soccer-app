import { RefreshCw, X, Sparkles } from "lucide-react";
import { RELEASES, APP_VERSION } from "../data/whatsNew";

// Thin bar shown at the very top of the app when a newer build is live. Tapping
// Refresh reloads the tab, which fetches the new HTML + assets.
export function UpdateBanner({ onReload, color = "#980000" }) {
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2 text-white text-xs font-semibold" style={{ backgroundColor: color }} role="status">
      <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 leading-tight">A new version is available.</span>
      <button onClick={onReload} className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 font-bold uppercase tracking-wider text-[11px]">Refresh</button>
    </div>
  );
}

// "What's New" screen — renders the changelog entries from data/whatsNew.js.
export function WhatsNewModal({ onClose, accent = "#980000", soft = "#FBECEC" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" style={{ color: accent }} /> What's New</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          {RELEASES.map((r) => (
            <div key={r.version}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900">{r.title || `Version ${r.version}`}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: soft, color: accent }}>v{r.version}</span>
              </div>
              {r.date && <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{r.date}</div>}
              <ul className="mt-2 space-y-1.5">
                {(r.items || []).map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug"><span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />{it}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[10px] text-slate-400 text-center pt-1">You're on version {APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
}
