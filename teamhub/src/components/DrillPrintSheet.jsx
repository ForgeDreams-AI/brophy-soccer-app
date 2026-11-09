// ─── Printable drill sheet ─────────────────────────────────────────────────
// A clean training card a coach can hand out: name, setup, diagram, how-to,
// objectives, coaching points. Opened from DrillModal's "Print / Save PDF"
// button; the sheet's Print button calls window.print() and the user picks
// "Save as PDF" (or a printer) in the system dialog — no PDF library, no
// new dependency. Print CSS in index.css hides the whole app (.app-shell)
// and prints only #print-sheet. The sheet is rendered through a portal to
// document.body (outside .app-shell) so the print CSS can't hide it.
// Anyone who can view a drill can print it — printing is read-only.
// Diagram priority matches the detail view: photo → drawn board (BoardSvg)
// → raster PNG → placeholder. The Print button waits for a diagram photo
// (or raster) to finish loading so the PDF never has a half-loaded image.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, LayoutGrid, Check } from "lucide-react";
import { BoardSvg } from "./TacticsBoard";

const RED = "#980000";
const lines = (t) => (t || "").split("\n").map((s) => s.trim()).filter(Boolean);
const durLabel = (d) => {
  const s = String(d ?? "").trim();
  if (!s) return "";
  return /min/i.test(s) ? s : `${s} min`;
};

export default function DrillPrintSheet({ drill, onClose }) {
  const s = drill.setup || {};
  const [imgOk, setImgOk] = useState(true);
  const [imgReady, setImgReady] = useState(false);
  const [rasterReady, setRasterReady] = useState(false);
  // Detail-view priority: photo wins while it loads; a failed photo falls
  // through to the drawn board, then the raster PNG.
  const showPhoto = Boolean(drill.diagramImage) && imgOk;
  const showBoard = !showPhoto && Boolean(drill.diagramData);
  const showRaster = !showPhoto && !showBoard && Boolean(drill.diagram);
  const needsImg = showPhoto || showRaster;
  const imgDone = showPhoto ? imgReady : showRaster ? rasterReady : true;
  const howTo = lines(drill.howTo);
  const objectives = (drill.objectives || [])
    .map((o) => String(o).replace(/^General:\s*/i, "").trim())
    .filter(Boolean);
  const infoStr = typeof drill.info === "string" ? drill.info : "";
  const source = infoStr.startsWith("Source: ") ? infoStr.slice(8) : "";
  const coachNotes = infoStr && !infoStr.startsWith("Source: ") ? infoStr : "";
  const equipText = Array.isArray(s.equipment)
    ? s.equipment.join(", ")
    : (s.equipment || drill.equipment || "");

  const meta = [
    s.lengthYd && s.widthYd ? { k: "Grid", v: `${s.lengthYd} × ${s.widthYd} yd` } : null,
    s.teams ? { k: "Teams", v: String(s.teams) } : null,
    s.cones ? { k: "Cones", v: String(s.cones) } : null,
    s.balls ? { k: "Balls", v: String(s.balls) } : null,
    s.goals ? { k: "Goals", v: String(s.goals) } : null,
    s.mannequins ? { k: "Mannequins", v: String(s.mannequins) } : null,
    drill.players ? { k: "Players", v: String(drill.players) } : null,
    durLabel(drill.dur) ? { k: "Minutes", v: durLabel(drill.dur) } : null,
  ].filter(Boolean);

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
              disabled={needsImg && !imgDone}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-full bg-white text-slate-900 min-h-11 disabled:opacity-50"
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
            <span className="sheet-cat inline-block text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full text-white flex-shrink-0" style={{ backgroundColor: RED }}>
              {drill.cat}
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-black leading-tight" style={{ color: RED }}>{drill.title || drill.name}</h1>
          {drill.desc ? <p className="mt-2 text-sm text-slate-600 leading-relaxed">{drill.desc}</p> : null}

          {meta.length > 0 || equipText ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {meta.map((it) => (
                  <div key={it.k} className="rounded-xl border border-slate-300 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{it.k}</div>
                    <div className="text-sm font-bold text-slate-900">{it.v}</div>
                  </div>
                ))}
              </div>
              {equipText && (
                <p className="mt-2 text-sm text-slate-700"><span className="font-bold">Equipment: </span>{equipText}</p>
              )}
            </div>
          ) : null}

          {/* diagram — photo, drawn board, raster PNG, or a placeholder */}
          <div className="sheet-diagram mt-5">
            {showPhoto ? (
              <img
                src={drill.diagramImage}
                alt="Drill diagram"
                className="w-full rounded-xl border border-slate-300"
                onLoad={() => setImgReady(true)}
                onError={() => { setImgOk(false); setImgReady(true); }}
              />
            ) : showBoard ? (
              <div className="rounded-xl border border-slate-300 overflow-hidden">
                <BoardSvg state={drill.diagramData} showLegend className="w-full" />
              </div>
            ) : showRaster ? (
              <img
                src={drill.diagram}
                alt="Drill diagram"
                className="w-full rounded-xl border border-slate-300"
                onLoad={() => setRasterReady(true)}
                onError={() => setRasterReady(true)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 py-8 flex flex-col items-center gap-2 text-slate-400">
                <LayoutGrid className="w-8 h-8" />
                <span className="text-sm font-semibold">No diagram for this drill yet</span>
              </div>
            )}
          </div>

          {howTo.length > 0 && (
            <section className="mt-5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">How to run it</h2>
              <ol className="mt-2 space-y-2">
                {howTo.map((step, i) => (
                  <li key={i} className="sheet-step flex gap-3">
                    <span className="sheet-step-num flex-shrink-0 w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ backgroundColor: RED }}>{i + 1}</span>
                    <span className="text-sm text-slate-800 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {objectives.length > 0 && (
            <section className="sheet-keep mt-5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Look for</h2>
              <ul className="mt-2 space-y-1.5">
                {objectives.map((o, i) => (
                  <li key={i} className="sheet-step flex gap-2 text-sm text-slate-800"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: RED }} />{o}</li>
                ))}
              </ul>
            </section>
          )}

          {drill.scenario ? (
            <section className="sheet-keep mt-5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Scenario</h2>
              <p className="mt-2 text-sm text-slate-800 leading-relaxed whitespace-pre-line">{drill.scenario}</p>
            </section>
          ) : null}

          {(drill.cues || []).length > 0 && (
            <section className="sheet-keep mt-5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Cues</h2>
              <ul className="mt-2 space-y-1.5">
                {drill.cues.map((c, i) => (
                  <li key={i} className="sheet-step flex gap-2 text-sm text-slate-800"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: RED }} />{c}</li>
                ))}
              </ul>
            </section>
          )}

          {coachNotes ? (
            <section className="sheet-keep mt-5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">Coaching points</h2>
              <p className="mt-2 text-sm text-slate-800 leading-relaxed whitespace-pre-line">{coachNotes}</p>
            </section>
          ) : null}

          <footer className="sheet-footer mt-6 pt-3 border-t border-slate-300 text-xs text-slate-500">
            <p className="font-bold text-slate-700">Brophy Drill Library · brophy-soccer-app.web.app</p>
            {drill.videoUrl ? <p className="mt-0.5 break-all">Video: {drill.videoUrl}</p> : null}
            {source ? <p className="mt-0.5">Source: {source}</p> : null}
            {drill.createdByName ? <p className="mt-0.5">Added by {drill.createdByName}</p> : null}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
