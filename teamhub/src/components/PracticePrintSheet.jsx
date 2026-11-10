// ─── Printable practice sheet ──────────────────────────────────────────────
// A clean session plan a coach can hand out or share: name, description,
// session total, and every drill block in order, numbered, with its
// duration, phase and notes. Opened from the practice editor's
// "Export / Share PDF" button; the sheet's Print button calls
// window.print() and the user picks "Save as PDF" (or a printer) in the
// system dialog — no PDF library, no new dependency. Print CSS in
// index.css hides the whole app (.app-shell) and prints only #print-sheet.
// The sheet is rendered through a portal to document.body (outside
// .app-shell) so the print CSS can't hide it. Anyone who can view a
// practice can print it — printing is read-only.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

const RED = "#980000";
const durLabel = (d) => {
  const s = String(d ?? "").trim();
  if (!s) return "";
  return /min/i.test(s) ? s : `${s} min`;
};

export default function PracticePrintSheet({ practice, drills = [], teamName = "", onClose }) {
  const blocks = practice.blocks || [];
  const totalMin = blocks.reduce((s, b) => s + (parseInt(b.dur, 10) || 0), 0);
  const targetMin = practice.targetMin || 90;
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
          <p className="text-white text-sm font-bold">Print preview — this is exactly what prints</p>
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
            {practice.cat ? (
              <span className="sheet-cat inline-block text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white flex-shrink-0" style={{ backgroundColor: RED }}>
                {practice.cat}
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-3xl font-black leading-tight" style={{ color: RED }}>{practice.name || "Untitled practice"}</h1>
          {teamName ? <p className="mt-1 text-sm font-bold text-slate-500">{teamName}</p> : null}
          {practice.desc ? <p className="mt-2 text-sm text-slate-600 leading-relaxed">{practice.desc}</p> : null}

          <div className="mt-4 rounded-xl border border-slate-300 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Session total</span>
            <span className="text-sm font-bold text-slate-900">{totalMin} / {targetMin} min</span>
          </div>

          {blocks.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400 italic text-center py-4">No drills in this practice yet.</p>
          ) : (
            <ol className="mt-5 space-y-3">
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

          <footer className="sheet-footer mt-6 pt-3 border-t border-slate-300 text-xs text-slate-500">
            <p className="font-bold text-slate-700">Brophy Soccer · brophy-soccer-app.web.app</p>
            {practice.createdByName ? <p className="mt-0.5">Created by {practice.createdByName}</p> : null}
            {practice.published ? <p className="mt-0.5">Published to players</p> : null}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
