// Split out of TeamHubRoles.jsx (F81). Area: documents.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, FileText, Trash2, X } from "lucide-react";
import { isLoading, useCollection, useDoc } from "../hooks/useCollection";
import { toast } from "../lib/toast";
import { LoadingNote } from "./home";
import { COLORS } from "./shared";


/* ─── HOME: team documents + e-sign (coach uploads, everyone signs) ─── */
// File types a coach can attach as a team document. Both MIME types and
// extensions are listed so every browser / OS file picker recognizes them.
export const DOC_ACCEPT = [
  "application/pdf", "image/*", "text/plain", ".txt", ".rtf", ".csv",
  ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".pages", ".key", ".numbers", ".odt", ".odp", ".ods",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

// Short type badge (PDF / DOC / PPT / XLS / IMG …) derived from a document's
// filename or MIME type.
export const docTypeLabel = (d) => {
  const src = (d.name || d.path || d.title || "").toLowerCase();
  const ext = (src.match(/\.([a-z0-9]+)(?:\?|$)/) || [])[1] || "";
  const ft = (d.fileType || "").toLowerCase();
  const byExt = {
    pdf: "PDF", doc: "DOC", docx: "DOC", rtf: "DOC", txt: "TXT", odt: "DOC", pages: "DOC",
    ppt: "PPT", pptx: "PPT", key: "KEY", odp: "PPT",
    xls: "XLS", xlsx: "XLS", csv: "CSV", numbers: "XLS", ods: "XLS",
    jpg: "IMG", jpeg: "IMG", png: "IMG", gif: "IMG", webp: "IMG", heic: "IMG", heif: "IMG", svg: "IMG",
  };
  if (byExt[ext]) return byExt[ext];
  if (ft.includes("pdf")) return "PDF";
  if (ft.startsWith("image/")) return "IMG";
  if (ft.includes("word")) return "DOC";
  if (ft.includes("presentation") || ft.includes("powerpoint")) return "PPT";
  if (ft.includes("sheet") || ft.includes("excel")) return "XLS";
  return "FILE";
};

// Folder labels for the Coach Tools documents view (grouped by file type).
export const DOC_FOLDER_LABELS = {
  PDF: "PDFs", DOC: "Word docs", PPT: "Slides", XLS: "Spreadsheets",
  IMG: "Images", TXT: "Text files", CSV: "Data files", KEY: "Keynotes", FILE: "Other files",
};
export const DOC_FOLDER_ORDER = ["PDF", "DOC", "PPT", "XLS", "IMG", "TXT", "CSV", "KEY", "FILE"];

// Upload card shared by the Home documents section and the Coach Tools
// Documents page (same upload flow either way).
export const DocumentUploadCard = ({ onUpload }) => {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);
  const doUpload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    try { await onUpload({ title, file: pendingFile }); setTitle(""); setPendingFile(null); }
    catch (e) { toast("Couldn't upload — " + (e.message || "check Storage rules.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2 mb-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title (e.g. Code of Conduct)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
      <input ref={fileRef} type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
      <div className="flex gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 truncate px-2">{pendingFile ? pendingFile.name : "Choose file (PDF, Word, PowerPoint, Excel, image…)"}</button>
        <button onClick={doUpload} disabled={!pendingFile || busy} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
    </div>
  );
};

// One document row — icon + title + signed status, with the coach's
// who-signed view + delete, and the player's sign flow. Carries its own
// expanded state so it works flat (Home) and grouped (Coach Tools folders).
// ─── E-signatures ──────────────────────────────────────────────────────────
// Each signature is its own immutable record: documents/{id}/signatures/{uid}
// (see firestore.rules). It captures the typed legal name, a drawn
// signature, the signer's verified account email, SERVER time, the exact
// consent wording shown, and the SHA-256 of the file that was signed, so a
// signature always proves who agreed to which version, and when. Coaches
// can read (and export) the log but never edit it.
export const SIGN_CONSENT_VERSION = "v1-2026-11-21";
export const signConsentText = (title) =>
  `I have read "${title}". By typing my name and signing below I agree that this is my electronic signature, `
  + "that it is legally binding to the same extent as a handwritten signature, and that I am signing with my own account.";

// SHA-256 of a File/Blob as hex (Web Crypto). "" when unavailable.
export const sha256Hex = async (blob) => {
  try {
    const buf = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return ""; }
};

// Finger / mouse signature pad. Calls onChange(dataUrl | "") as you draw.
export const SignaturePad = ({ onChange }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  useEffect(() => {
    const c = canvasRef.current;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0F172A";
  }, []);
  const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d"); const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d"); const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height);
    hasInk.current = false; onChange("");
  };
  return (
    <div>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="w-full h-32 rounded-xl border border-dashed border-slate-300 bg-slate-50 touch-none" aria-label="Draw your signature" />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-slate-400">Sign with your finger or mouse</span>
        <button type="button" onClick={clear} className="text-[11px] font-semibold text-slate-500">Clear</button>
      </div>
    </div>
  );
};

export const SignDocumentModal = ({ user, d, onSign, onClose }) => {
  const [typedName, setTypedName] = useState(user.name || "");
  const [drawing, setDrawing] = useState("");
  const [agree, setAgree] = useState(false);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const consent = signConsentText(d.title);
  const ready = typedName.trim().length >= 2 && drawing && agree && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await onSign(d, { typedName: typedName.trim(), drawing, consentText: consent });
      toast("Signed. A copy of your signature record is saved.", "success");
      onClose();
    } catch (e) {
      toast("Couldn't sign — " + (e?.code === "permission-denied" ? "the document may have changed; reload and try again." : (e.message || "try again.")));
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-base text-slate-900 leading-tight">Sign: {d.title}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <a href={d.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className="flex items-center gap-2 text-sm font-semibold rounded-xl border border-slate-200 px-3 py-2.5" style={{ color: COLORS.primary }}>
          <FileText className="w-4 h-4" /> {opened ? "Opened — read it before signing" : "Open the document to read it"} <ExternalLink className="w-3.5 h-3.5 ml-auto" />
        </a>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full legal name</span>
          <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="First and last name" className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        </label>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Signature</span>
          <div className="mt-1"><SignaturePad onChange={setDrawing} /></div>
        </div>
        <label className="flex items-start gap-2 text-[12px] text-slate-600 leading-snug">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
          <span>{consent}</span>
        </label>
        <p className="text-[10px] text-slate-400">Signing as {user.email}. The date and time come from the server, and the record is tied to this exact file — it can't be edited afterwards.</p>
        <button onClick={submit} disabled={!ready} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Signing…" : "Agree & Sign"}</button>
      </div>
    </div>
  );
};

// CSV of a document's signature log (coach export).
export const downloadSignatureLog = (d, sigs) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const when = (ts) => (ts?.toDate ? ts.toDate().toISOString() : (ts || ""));
  const rows = [["Document", "Typed name", "Account email", "Signed at (UTC)", "File SHA-256", "Consent version", "Drawn signature", "Device"]];
  sigs.forEach((s) => rows.push([d.title, s.typedName || s.name, s.email || "", when(s.signedAt || s.ts), s.sha256 || "", s.consentVersion || "legacy (typed name only)", s.drawing ? "yes" : "no", s.userAgent || ""]));
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(d.title || "document").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document"}-signatures.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
};

export const DocumentRow = ({ user, d, isAdmin, rosterCount = 0, onDelete, onSign }) => {
  const [whoOpen, setWhoOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  // Coach: the signature log (private records). Player: only their own.
  const sigDocs = useCollection(isAdmin ? `documents/${d.id}/signatures` : null);
  const mySig = useDoc(!isAdmin ? `documents/${d.id}/signatures/${user.uid}` : null);
  // Legacy typed-name signatures (before the redesign) still count, unless
  // that person has since signed with the new record.
  const legacy = (d.signatures || []).filter((s) => !sigDocs.some((x) => x.id === s.uid));
  const sigs = [...sigDocs, ...legacy];
  const mine = Boolean(mySig) || (d.signatures || []).some((s) => s.uid === user.uid);
  const fmtWhen = (s) => {
    const t = s.signedAt?.toDate ? s.signedAt.toDate() : (s.ts ? new Date(s.ts) : null);
    return t ? t.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  };
  return (
    <li className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 gap-0.5" style={{ backgroundColor: COLORS.accentSoft }}><FileText className="w-3.5 h-3.5" style={{ color: COLORS.accent }} /><span className="text-[7px] font-black leading-none tracking-tight" style={{ color: COLORS.accent }}>{docTypeLabel(d)}</span></div>
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{d.title}</div>
          <div className="text-[10px] text-slate-500">{isAdmin ? `${sigs.length}${rosterCount ? `/${rosterCount}` : ""} signed` : (mine ? `You signed${mySig ? ` · ${fmtWhen(mySig)}` : ""}` : "Tap to read")}</div>
        </a>
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setWhoOpen(!whoOpen)} className="text-[11px] font-semibold" style={{ color: COLORS.primary }}>{whoOpen ? "Hide" : "Who"}</button>
            <button onClick={async () => { if (confirm(`Delete "${d.title}"? Players will no longer see it. Its signature records are kept on file (Firebase console).`)) { try { await onDelete(d.id); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ) : (
          mine
            ? <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 flex-shrink-0" style={{ color: COLORS.success }}><Check className="w-3.5 h-3.5" /> Signed</span>
            : <button onClick={() => setSignOpen(true)} className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Sign</button>
        )}
      </div>
      {isAdmin && whoOpen && (
        <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
          {sigs.length === 0 ? <p className="text-[11px] text-slate-400 italic">No signatures yet.</p> : (
            <ul className="space-y-1.5">{sigs.map((s, i) => (
              <li key={s.id || s.uid || i} className="text-[11px] text-slate-600 flex items-center gap-2">
                <Check className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.success }} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{s.typedName || s.name}</span>
                  {s.email ? <span className="text-slate-400"> · {s.email}</span> : null}
                  <span className="block text-[10px] text-slate-400">{fmtWhen(s)}{s.consentVersion ? "" : " · legacy (typed name only)"}</span>
                </span>
                {s.drawing && <img src={s.drawing} alt={`Signature of ${s.typedName}`} className="h-8 w-20 object-contain bg-slate-50 rounded border border-slate-100" />}
              </li>
            ))}</ul>
          )}
          {sigs.length > 0 && <button onClick={() => downloadSignatureLog(d, sigs)} className="text-[11px] font-bold" style={{ color: COLORS.primary }}>Download signature log (CSV)</button>}
        </div>
      )}
      {!isAdmin && signOpen && !mine && <SignDocumentModal user={user} d={d} onSign={onSign} onClose={() => setSignOpen(false)} />}
    </li>
  );
};

export const DocumentsSection = ({ user, documents, isAdmin, rosterCount = 0, onUpload, onDelete, onSign, defaultCollapsed = false, groupByType = false, hideHeader = false }) => {
  const [open, setOpen] = useState(!defaultCollapsed || hideHeader);
  const [closedFolders, setClosedFolders] = useState({});
  // Folder grouping (Coach Tools view): by file type, in a fixed order.
  const grouped = useMemo(() => {
    const map = {};
    (documents || []).forEach((d) => {
      const k = docTypeLabel(d);
      (map[k] = map[k] || []).push(d);
    });
    return map;
  }, [documents]);
  const folders = DOC_FOLDER_ORDER.filter((k) => grouped[k]?.length);

  return (
    <section>
      {!hideHeader && (
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">Team Documents <span className="text-[11px] font-semibold text-slate-400">· {documents.length}</span></h3>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
      )}
      {!open ? null : (<>
      {isAdmin && <DocumentUploadCard onUpload={onUpload} />}
      {isLoading(documents) ? <LoadingNote /> : documents.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{isAdmin ? "No documents yet — upload one for the team to sign." : "No documents to sign right now."}</p>
      ) : groupByType ? (
        <div className="space-y-3">
          {folders.map((k) => (
            <div key={k}>
              <button onClick={() => setClosedFolders((p) => ({ ...p, [k]: !p[k] }))} className="w-full flex items-center justify-between py-1 mb-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{DOC_FOLDER_LABELS[k] || k} <span className="text-slate-400">· {grouped[k].length}</span></h4>
                {closedFolders[k] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
              </button>
              {!closedFolders[k] && (
                <ul className="space-y-2">
                  {grouped[k].map((d) => <DocumentRow key={d.id} user={user} d={d} isAdmin={isAdmin} rosterCount={rosterCount} onDelete={onDelete} onSign={onSign} />)}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => <DocumentRow key={d.id} user={user} d={d} isAdmin={isAdmin} rosterCount={rosterCount} onDelete={onDelete} onSign={onSign} />)}
        </ul>
      )}
      </>)}
    </section>
  );
};
