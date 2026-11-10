// ─── Printable practices sheet (bulk export) ───────────────────────────────
// One PDF for a whole set of practices: each practice gets its own section
// (name, description, session total, then every drill block in order,
// numbered, with duration, phase and notes). Opened from the Practices
// library's "Export all" button; the sheet's Print button calls
// window.print() and the user picks "Save as PDF" (or a printer) in the
// system dialog — no PDF library, no new dependency. Print CSS in
// index.css hides the whole app (.app-shell) and prints only #print-sheet.
// The sheet is rendered through a portal to document.body (outside
// .app-shell) so the print CSS can't hide it. Anyone who can view the
// practices can print them — printing is read-only.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

const RED = "#980000";
const durLabel = (d) => {
  const s = String(d ?? "").trim();
  if (!s) return "";
  return /min/i.test(s) ? s : `${s} min`;
};

export default function PracticesPrintSheet({ practices = [], drills = [], teamName = "", onClose }) {
  const drillById = (id) => (drills || []).find((d) => d.id === id);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="print-overlay fixed inset-0 z-50 bg-black/60 overflow-y-auto" role="dialog" aria-label="Print preview">
      <div className="min-h-full flex flex-col items-center px-3 py-4 sm:py-8" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {/* toolbar — screen only, never prints */}
        <div className="print:hidden w-full max-w-[820px] flex items-center justify-between gap-3 mb-3">
          <p className="text-white text-sm font-bold">Print preview — {practices.length} practice{practices.length === 1 ? "" : "s"}</p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-full bg-white text-slate-900 min-h-11"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-full bg-white/15 text-white min-h-11" aria-label="Close preview">
              <X className="w-4 h-4" /> Close
            </button>
          </div>
        </div>

        {/* the sheet */}
        <div id="print-sheet" className="w-full max-w-[820px] bg-white text-slate-900 shadow-2xl px-6 py-6 sm:px-9 sm:py-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Brophy College Prep · Soccer</p>
            {teamName ? <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white flex-shrink-0" style={{ backgroundColor: RED }}>{teamName}</span> : null}
          </div>
          <h1 className="mt-1 text-3xl font-black leading-tight" style={{ color: RED }}>Practices</h1>
          <p className="mt-1 text-sm text-slate-500">{practices.length} practice{practices.length === 1 ? "" : "s"} · each block in order</p>

          {practices.map((practice, pi) => {
            const blocks = practice.blocks || [];
            const totalMin = blocks.reduce((s, b) => s + (parseInt(b.dur, 10) || 0), 0);
            const targetMin = practice.targetMin || 90;
            return (
              <section key={practice.id || pi} className="mt-8" style={pi > 0 ? { breakBefore: "page" } : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black leading-tight" style={{ color: RED }}>{practice.name || "Untitled practice"}</h2>
                  {practice.cat ? (
                    <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white flex-shrink-0" style={{ backgroundColor: RED }}>{practice.cat}</span>
                  ) : null}
                </div>
                {practice.desc ? <p className="mt-1 text-sm text-slate-600 leading-relaxed">{practice.desc}</p> : null}
                <div className="mt-3 rounded-xl border border-slate-300 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Session total</span>
                  <span className="text-sm font-bold text-slate-900">{totalMin} / {targetMin} min</span>
                </div>
                {blocks.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400 italic">No drills in this practice yet.</p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {blocks.map((b, i) => {
                      const d = drillById(b.drillId);
                      const desc = d && d.desc ? String(d.desc) : "";
                      return (
                        <li key={i} className="sheet-step flex gap-3 rounded-xl border border-slate-300 px-4 py-3">
                          <span className="sheet-step-num flex-shrink-0 w-7 h-7 rounded-full text-white text-sm font-black flex items-center justify-center" style={{ backgroundColor: RED }}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-bold text-base text-slate-900 leading-tight">{b.name || "Pick a drill"}</span>
                              {durLabel(b.dur) ? <span className="text-sm font-bold text-slate-700 flex-shrink-0">{durLabel(b.dur)}</span> : null}
                            </div>
                            {(b.phase || b.cat) ? (
                              <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                {[b.phase, b.cat].filter(Boolean).join(" · ")}
                              </div>
                            ) : null}
                            {desc ? <p className="text-sm text-slate-600 leading-relaxed mt-1">{desc}</p> : null}
                            {b.notes ? <p className="text-sm text-slate-700 leading-relaxed mt-1"><span className="font-bold">Notes: </span>{b.notes}</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}

          <footer className="sheet-footer mt-8 pt-3 border-t border-slate-300 text-xs text-slate-500">
            <p className="font-bold text-slate-700">Brophy Soccer · brophy-soccer-app.web.app</p>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
