// Split out of TeamHubRoles.jsx (F81). Area: practice.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Copy, Goal, Image as ImageIcon, ImagePlus, Layers, Pencil, Play, Plus, Printer, SquareDashed, Swords, Tag, Target, Trash2, Users, X } from "lucide-react";
import { storage } from "../firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { isLoading } from "../hooks/useCollection";
import { toast } from "../lib/toast";
import { teamDateKey } from "../lib/dates";
import { getTeam } from "../data/teams";
import TacticsBoard, { BoardPlayer, BoardSvg } from "../components/TacticsBoard";
import DrillPrintSheet from "../components/DrillPrintSheet";
import PracticePrintSheet from "../components/PracticePrintSheet";
import PracticesPrintSheet from "../components/PracticesPrintSheet";
import { stripUndefined } from "../lib/drillDoc";
import { ARROW_LEGEND, wavyPath } from "../components/boardData";
import { LoadingNote } from "./home";
import { AutoGrowTextarea, COLORS, DRILL_CATS, DRILL_CAT_ICON, DRILL_PHASES, EMBED_SANDBOX, PhotoCarousel, ReadOnlyHint, deleteStorageFile, downscaleToBlob, formatHourTime, reportError, toEmbedUrl } from "./shared";


// Uniform drill diagram: Brophy logo watermark at exactly 20% opacity behind the
// drill's diagram photo (or behind the category icon tile when no diagram yet).
export const DrillDiagram = ({ d, icon: Icon, className = "" }) => (
  <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className}`}>
    <img src="/brand/logo.png" alt="" aria-hidden="true" draggable="false"
      className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none select-none"
      style={{ opacity: 0.2 }} />
    {d.diagramImage ? (
      <img src={d.diagramImage} alt="Drill diagram" className="relative w-full h-full object-cover" loading="lazy" />
    ) : d.diagramData ? (
      <BoardSvg state={d.diagramData} className="relative w-full h-full" />
    ) : d.diagram ? (
      <img src={d.diagram} alt="Drill diagram" className="relative w-full h-full object-cover" loading="lazy" />
    ) : (
      <div className="relative w-full h-full flex items-center justify-center">
        {Icon ? <Icon className="w-8 h-8 text-white/90" /> : null}
      </div>
    )}
  </div>
);

// The fixed 5-arrow board legend, shown under any drill diagram drawn on the
// board (the same legend is also baked into the exported board PNG).
export const ArrowLegendChips = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1">
    {ARROW_LEGEND.map((a) => (
      <span key={a.id} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
          {a.id === "dribble"
            ? <path d={wavyPath(1, 5, 23, 5, 2.5, 8)} fill="none" stroke="#D97706" strokeWidth={1.8} />
            : a.id === "shot"
              ? <g><line x1="1" y1="3" x2="23" y2="3" stroke="#D97706" strokeWidth={1.4} /><line x1="1" y1="7" x2="23" y2="7" stroke="#D97706" strokeWidth={1.4} /></g>
              : <line x1="1" y1="5" x2="23" y2="5" stroke="#D97706" strokeWidth={2} strokeDasharray={a.id === "run" ? "4 3" : undefined} />}
        </svg>
        {a.label}
      </span>
    ))}
  </div>
);

// Full uniform drill card: clear title → diagram (Brophy watermark) → setup
// block → How to run it → Look for. Empty sections are hidden.
export const DrillModal = ({ item, onClose }) => {
  const [printOpen, setPrintOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const embedUrl = item.videoUrl ? toEmbedUrl(item.videoUrl) : null;
  const Icon = DRILL_CAT_ICON[item.cat] || Target;
  const title = item.title || item.name;
  const hasAnimation = Boolean(item.diagramData?.animation?.steps?.length);
  const setup = item.setup || {};
  const gridLabel = setup.lengthYd && setup.widthYd ? `${setup.lengthYd} × ${setup.widthYd} yd` : setup.grid;
  const equipList = Array.isArray(setup.equipment) ? setup.equipment.join(", ") : (setup.equipment || item.equipment);
  const setupRows = [
    ["Grid", gridLabel],
    ["Teams", setup.teams],
    ["Players", item.players],
    ["Duration", item.dur],
    ["Cones", setup.cones],
    ["Balls", setup.balls],
    ["Goals", setup.goals],
    ["Mannequins", setup.mannequins],
    ["Equipment", equipList],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "" && String(v).trim());
  const howTo = item.howTo || item.desc || "";
  const objectives = (item.objectives || [])
    .map((o) => String(o).replace(/^General:\s*/i, "").trim())
    .filter(Boolean);
  const infoStr = typeof item.info === "string" ? item.info : "";
  const source = infoStr.startsWith("Source: ") ? infoStr.slice(8) : "";
  const coachNotes = infoStr && !infoStr.startsWith("Source: ") ? infoStr : "";
  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full rounded-t-3xl" style={{ backgroundColor: COLORS.primary }} />
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{item.cat}</span>
              {item.playerTag && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.playerTag}</span>}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{title}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasAnimation && (
              <button
                onClick={(e) => { e.stopPropagation(); setPlayOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full text-white min-h-11"
                style={{ backgroundColor: COLORS.primary }}
                title="Play the saved animation"
              >
                <Play className="w-3.5 h-3.5 fill-white" /> Play animation
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setPrintOpen(true); }}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white border border-slate-200 text-slate-700 min-h-11"
              title="Print / Save PDF"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <DrillDiagram d={item} icon={Icon} className="w-full aspect-[4/3]" />
          {item.diagramData && <ArrowLegendChips />}
          {setupRows.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Setup</h4>
              <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 border border-slate-100">
                {setupRows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                    <span className="text-xs font-semibold text-slate-800 text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {howTo && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">How to run it</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{howTo}</p>
            </div>
          )}
          {objectives.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Look for</h4>
              <ul className="space-y-1.5">
                {objectives.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.accent }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {coachNotes && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Coach notes</h4>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{coachNotes}</p>
            </div>
          )}
          {item.photos?.length > 0 && <PhotoCarousel photos={item.photos} />}
          {embedUrl && (
            <div className="aspect-video rounded-2xl bg-slate-900 overflow-hidden">
              <iframe src={embedUrl} title={title} className="w-full h-full" sandbox={EMBED_SANDBOX} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
            </div>
          )}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {item.tags.map((t) => <span key={t} className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">#{t}</span>)}
            </div>
          )}
          {source && <p className="text-[10px] text-slate-400">Source: {source}</p>}
        </div>
      </div>
    </div>
    {printOpen && <DrillPrintSheet drill={item} onClose={() => setPrintOpen(false)} />}
    {playOpen && <BoardPlayer state={item.diagramData} title={title} onClose={() => setPlayOpen(false)} />}
    </>
  );
};

export const DrillsPage = ({ user, drills, addDrill, updateDrill, deleteDrill, startCreating = false }) => {
  const isAdmin = user.role === "admin";
  const blank = { name: "", title: "", kind: "drill", cat: DRILL_CATS[0], tags: "", dur: "", players: "", equipment: "", setupLengthYd: "", setupWidthYd: "", setupCones: "", setupBalls: "", setupGoals: "", setupMannequins: "", setupTeams: "", howTo: "", objectives: "", desc: "", info: "", videoUrl: "", photos: [], diagram: "", diagramData: null, diagramImage: "", scenario: "", cues: "" };
  const [cat, setCat] = useState("All");
  const [tag, setTag] = useState("All");
  const [adding, setAdding] = useState(startCreating);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  // F33: pictures uploaded while editing this drill. On save, any that ended
  // up unused (replaced before saving) are deleted; on cancel, all of them.
  // Pictures already saved on a drill are never deleted here (a duplicated
  // drill can share them).
  const sessionUploads = useRef(new Set());
  const cleanupUploads = (keep = new Set()) => {
    for (const u of sessionUploads.current) if (!keep.has(u)) deleteStorageFile(u);
    sessionUploads.current = new Set();
  };

  // Save the tactics board: rasterize to a PNG diagram (so it renders anywhere a
  // drill diagram shows) and keep the editable JSON so it can be reopened.
  // Drawing a board replaces a video setup photo (photo-first rule).
  const saveBoard = async (pngBlob, state) => {
    setBoardOpen(false);
    // The board's yard dimensions are the drill's setup dimensions.
    setForm((p) => ({ ...p, diagramData: state, diagramImage: "", setupLengthYd: state?.lengthYd ?? p.setupLengthYd, setupWidthYd: state?.widthYd ?? p.setupWidthYd }));
    if (!pngBlob) return;
    setUploading(true);
    try {
      const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const r = storageRef(storage, path);
      const snap = await uploadBytes(r, pngBlob, { contentType: "image/png" });
      const url = await getDownloadURL(snap.ref);
      sessionUploads.current.add(url);
      setForm((p) => ({ ...p, diagram: url }));
    } catch (e) {
      toast("Couldn't save board image — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };

  // Categories = the defaults plus anything a coach has already typed (old coaching-point items are hidden).
  const cats = useMemo(() => {
    const set = new Set(DRILL_CATS);
    drills.filter((d) => (d.kind || "drill") !== "point").forEach((d) => d.cat && set.add(d.cat));
    return [...set];
  }, [drills]);
  // Tag pills are scoped to the active category (all drills when viewing All).
  const tags = useMemo(() => {
    const set = new Set();
    drills.filter((d) => cat === "All" || d.cat === cat).forEach((d) => (d.tags || []).forEach((t) => set.add(t)));
    return ["All", ...[...set].sort()];
  }, [drills, cat]);
  const filtered = drills.filter((d) => (d.kind || "drill") !== "point" && (cat === "All" || d.cat === cat) && (tag === "All" || (d.tags || []).includes(tag)));

  const uploadImage = async (file) => {
    const blob = await downscaleToBlob(file);
    const path = `drills/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    sessionUploads.current.add(url);
    return url;
  };
  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of Array.from(files)) urls.push(await uploadImage(f));
      setForm((p) => ({ ...p, photos: [...p.photos, ...urls] }));
    } catch (e) { toast("Couldn't upload photo — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };
  const setDiagram = async (file) => {
    if (!file) return;
    setUploading(true);
    try { setForm((p) => ({ ...p, diagram: "", diagramImage: "" })); const url = await uploadImage(file); setForm((p) => ({ ...p, diagram: url })); }
    catch (e) { toast("Couldn't upload diagram — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    const gridMatch = String(d.setup?.grid || "").match(/(\d+)\s*[x×]\s*(\d+)/);
    const lenYd = d.setup?.lengthYd ?? d.diagramData?.lengthYd ?? (gridMatch ? gridMatch[1] : "");
    const widYd = d.setup?.widthYd ?? d.diagramData?.widthYd ?? (gridMatch ? gridMatch[2] : "");
    const equipStr = Array.isArray(d.setup?.equipment) ? d.setup.equipment.join(", ") : (d.equipment || "");
    setForm({ name: d.name || "", title: d.title || "", kind: d.kind || "drill", cat: d.cat || DRILL_CATS[0], tags: (d.tags || []).join(", "), dur: d.dur || "", players: d.players || "", equipment: equipStr, setupLengthYd: lenYd, setupWidthYd: widYd, setupCones: d.setup?.cones ?? "", setupBalls: d.setup?.balls ?? "", setupGoals: d.setup?.goals ?? "", setupMannequins: d.setup?.mannequins ?? "", setupTeams: d.setup?.teams || "", howTo: d.howTo || "", objectives: (d.objectives || []).join("\n"), desc: d.desc || "", info: d.info || "", videoUrl: d.videoUrl || "", photos: d.photos || [], diagram: d.diagram || "", diagramData: d.diagramData || null, diagramImage: d.diagramImage || "", scenario: d.scenario || "", cues: (d.cues || []).join("\n") });
    setAdding(true);
  };
  const cancel = () => { cleanupUploads(); setEditingId(null); setForm(blank); setAdding(false); setNewCat(false); };
  // Structured drill record: setup carries real yard dimensions + counts.
  const buildData = () => {
    const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== "" ? n : null; };
    const lenYd = numOrNull(form.setupLengthYd), widYd = numOrNull(form.setupWidthYd);
    const equipArr = form.equipment.split(",").map((t) => t.trim()).filter(Boolean);
    return {
      name: form.name.trim(),
      title: form.title.trim(),
      kind: "drill",
      cat: (form.cat || "").trim() || DRILL_CATS[0],
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      dur: form.dur.trim(), players: form.players.trim(), equipment: form.equipment.trim(),
      setup: {
        grid: lenYd && widYd ? `${lenYd}x${widYd} yd` : "",
        teams: form.setupTeams.trim(),
        lengthYd: lenYd, widthYd: widYd,
        cones: numOrNull(form.setupCones), balls: numOrNull(form.setupBalls),
        goals: numOrNull(form.setupGoals), mannequins: numOrNull(form.setupMannequins),
        equipment: equipArr,
      },
      howTo: form.howTo.trim(),
      objectives: form.objectives.split("\n").map((t) => t.trim()).filter(Boolean),
      desc: form.desc.trim(), info: form.info.trim(), videoUrl: form.videoUrl.trim(),
      photos: form.photos, diagram: form.diagram, diagramData: form.diagramData ? stripUndefined(form.diagramData) : null,
      diagramImage: form.diagramImage || null,
      scenario: form.scenario.trim(),
      cues: form.cues.split("\n").map((t) => t.trim()).filter(Boolean),
    };
  };
  const save = async () => {
    if (!form.name.trim()) return;
    const data = buildData();
    try {
      if (editingId) await updateDrill(editingId, data);
      else await addDrill(data);
      cleanupUploads(new Set([...(data.photos || []), data.diagram, data.diagramImage].filter(Boolean)));
      if (cat !== "All") setCat(data.cat); // stay on All — the new drill is already visible there
      cancel();
    } catch (e) { toast("Couldn't save drill — " + (e.message || "check Firestore rules.")); }
  };
  // Duplicate for a progression: same drill + board, harder variation to fill in.
  const duplicateDrill = async (d) => {
    const copy = { ...d };
    delete copy.id;
    // Fresh authorship: the create rule requires createdByUid == the caller,
    // so a copy stamped with the original coach's uid would be denied.
    delete copy.createdByUid;
    delete copy.createdByName;
    copy.name = `${d.name || "Drill"} — Progression`;
    copy.title = `${d.title || d.name || "Drill"} — Progression`;
    try { await addDrill(copy); toast("Duplicated — edit the copy for the progression."); }
    catch (e) { toast("Couldn't duplicate — " + (e.message || "check Firestore rules.")); }
  };
  const del = (id) => {
    if (!confirm("Delete this drill from the shared library? Practices that use it will show it as missing.")) return;
    deleteDrill(id).catch(reportError("Couldn't delete the drill (only its creator or the program admin can)"));
  };

  return (
    <div className="pt-1 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Drill Library</h3>
        {isAdmin
          ? <button onClick={() => (adding ? cancel() : setAdding(true))} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> New drill</button>
          : <ReadOnlyHint label="Coach builds the drills" />}
      </div>

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Drill name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Display title (shown on the card — defaults to drill name)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            {newCat ? (
              <div className="flex gap-1">
                <input autoFocus value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} placeholder="New category" className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={() => { setNewCat(false); setForm({ ...form, cat: cats[0] || DRILL_CATS[0] }); }} className="px-2 rounded-lg bg-slate-100 text-slate-500" title="Back to list"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <select value={form.cat} onChange={(e) => { if (e.target.value === "__new__") { setNewCat(true); setForm({ ...form, cat: "" }); } else setForm({ ...form, cat: e.target.value }); }} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ Add new category…</option>
              </select>
            )}
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated) — or tap a phase below" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          {/* Session-phase quick-add chips */}
          <div className="flex flex-wrap gap-1.5 px-0.5">
            {DRILL_PHASES.map((p) => {
              const active = form.tags.split(",").map((t) => t.trim()).includes(p);
              return (
                <button key={p} type="button" onClick={() => {
                  const cur = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
                  const next = active ? cur.filter((t) => t !== p) : [...cur, p];
                  setForm({ ...form, tags: next.join(", ") });
                }} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${active ? "text-white border-transparent" : "text-slate-500 border-slate-200 bg-white"}`} style={active ? { backgroundColor: COLORS.primary } : {}}>{p}</button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} placeholder="Duration" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <input value={form.players} onChange={(e) => setForm({ ...form, players: e.target.value })} placeholder="# Players" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="Equipment (comma-separated)" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
          </div>
          {/* Structured setup — dimensions in yards + counts. The board uses
              the same yard dimensions, so the diagram is drawn to scale. */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Setup — grid &amp; equipment</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <input type="number" min={0} value={form.setupLengthYd} onChange={(e) => setForm({ ...form, setupLengthYd: e.target.value })} placeholder="—" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /> yd long
              </label>
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <input type="number" min={0} value={form.setupWidthYd} onChange={(e) => setForm({ ...form, setupWidthYd: e.target.value })} placeholder="—" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /> yd wide
              </label>
              <input value={form.setupTeams} onChange={(e) => setForm({ ...form, setupTeams: e.target.value })} placeholder="Teams (e.g. 4v4+2)" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="text-[11px] font-semibold text-slate-600">Cones<input type="number" min={0} value={form.setupCones} onChange={(e) => setForm({ ...form, setupCones: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Balls<input type="number" min={0} value={form.setupBalls} onChange={(e) => setForm({ ...form, setupBalls: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Goals<input type="number" min={0} value={form.setupGoals} onChange={(e) => setForm({ ...form, setupGoals: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
              <label className="text-[11px] font-semibold text-slate-600">Mannequins<input type="number" min={0} value={form.setupMannequins} onChange={(e) => setForm({ ...form, setupMannequins: e.target.value })} placeholder="0" className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-xs text-center" /></label>
            </div>
          </div>
          <AutoGrowTextarea value={form.howTo} onChange={(e) => setForm({ ...form, howTo: e.target.value })} minRows={3} placeholder="How to run it — instructions" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} minRows={2} placeholder="Look for — one goal per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} minRows={2} placeholder="Description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <AutoGrowTextarea value={form.info} onChange={(e) => setForm({ ...form, info: e.target.value })} minRows={2} placeholder="How to run it" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="Video URL (optional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />

          {/* Photo carousel uploads */}
          {form.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {form.photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  <button onClick={() => setForm((p) => ({ ...p, photos: p.photos.filter((_, j) => j !== i) }))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow"><X className="w-3 h-3 text-slate-500" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" /> Photos
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
            <button type="button" onClick={() => setBoardOpen(true)} className="flex-1 py-2 rounded-full text-xs font-bold text-white text-center flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
              <Layers className="w-3.5 h-3.5" /> {form.diagramData ? "Edit board" : "Build on the board"}
            </button>
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> {form.diagram && !form.diagramData ? "Diagram ✓" : "Diagram"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { setDiagram(e.target.files?.[0]); setForm((p) => ({ ...p, diagramData: null, diagramImage: "" })); e.target.value = ""; }} />
            </label>
          </div>
          {/* diagram — photo from the video wins, then the board, then the
              uploaded raster (photo-first rule, same as the Drill Library) */}
          {form.diagramImage ? (
            <div className="relative">
              <img src={form.diagramImage} alt="Diagram photo from the video" className="w-full rounded-xl border border-slate-100" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagramImage: "" }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          ) : form.diagramData ? (
            <div className="relative">
              <BoardSvg state={form.diagramData} showLegend className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          ) : null}
          {form.diagram && !form.diagramData && !form.diagramImage && (
            <div className="relative">
              <img src={form.diagram} alt="Drill diagram" className="w-full rounded-xl border border-slate-100" />
              <button type="button" onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 flex items-center justify-center shadow"><X className="w-3.5 h-3.5 text-slate-600" /></button>
            </div>
          )}
          {uploading && <p className="text-[10px] font-semibold text-slate-400 px-1">Uploading…</p>}
          {boardOpen && <TacticsBoard initial={form.diagramData} title={form.name || "Diagram"} onSave={saveBoard} onClose={() => setBoardOpen(false)} />}

          <div className="flex gap-2 pt-1">
            <button onClick={cancel} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={save} disabled={uploading || !form.name.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{editingId ? "Save changes" : "Add drill"}</button>
          </div>
        </div></div>
      )}


      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {["All", ...cats].map((c) => (
            <button key={c} onClick={() => { setCat(c); setTag("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
        </div>
      </div>

      {/* Tag pills (only when the active category has tags) */}
      {tags.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(t)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 ${tag === t ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={tag === t ? { backgroundColor: COLORS.accent, color: "#fff" } : {}}>{t !== "All" && <Tag className="w-2.5 h-2.5" />}{t}</button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{cat}{tag !== "All" ? ` · ${tag}` : ""}</h3>
        {isLoading(drills) ? <LoadingNote /> : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 italic">{isAdmin ? "No drills here yet — add one." : "Nothing here yet."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((d) => {
              const Icon = DRILL_CAT_ICON[d.cat] || Target;
              return (
                <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden flex flex-col">
                  <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: COLORS.primary }} />
                  <button onClick={() => setModal(d)} className="text-left w-full flex-1 flex flex-col">
                    <div className="px-3 pt-3">
                      <DrillDiagram d={d} icon={Icon} className="w-full h-24" />
                    </div>
                    <div className="p-3 pt-2.5 flex-1">
                      <h4 className="font-bold text-sm text-slate-900 leading-tight pr-4">{d.title || d.name}</h4>
                      {(d.dur || d.players || d.setup?.teams || d.setup?.grid) && (
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-semibold text-slate-500">
                          {d.dur && <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{d.dur}</span>}
                          {d.players && <span className="inline-flex items-center gap-0.5"><Users className="w-3 h-3" />{d.players}</span>}
                          {d.setup?.grid && <span className="inline-flex items-center gap-0.5"><SquareDashed className="w-3 h-3" />{d.setup.grid}</span>}
                          {d.setup?.teams && <span className="inline-flex items-center gap-0.5"><Swords className="w-3 h-3" />{d.setup.teams}</span>}
                          {d.diagramData?.animation?.steps?.length ? <span className="inline-flex items-center gap-0.5 text-sky-600"><Play className="w-3 h-3 fill-sky-600" />Animated</span> : null}
                        </div>
                      )}
                      {d.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {d.tags.slice(0, 3).map((t) => <span key={t} className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">{t}</span>)}
                        </div>
                      )}
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="absolute top-3 right-2.5 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(d); }} title="Edit" className="text-slate-300 hover:text-slate-600 bg-white/80 rounded-full p-0.5"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicateDrill(d); }} title="Duplicate for a progression" className="text-slate-300 hover:text-slate-600 bg-white/80 rounded-full p-0.5"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); del(d.id); }} title="Delete" className="text-slate-300 hover:text-red-500 bg-white/80 rounded-full p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <DrillModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
};

// Small reusable drill thumbnail (diagram or category-icon tile, Brophy watermark).
export const DrillThumb = ({ d, className = "w-10 h-10" }) => {
  const Icon = DRILL_CAT_ICON[d.cat] || Target;
  return (
    <div className={`${className} relative rounded-lg overflow-hidden bg-slate-900 flex-shrink-0`}>
      <img src="/brand/logo.png" alt="" aria-hidden="true" className="absolute inset-0 m-auto w-3/4 max-h-full object-contain pointer-events-none" style={{ opacity: 0.2 }} />
      {d.diagramImage
        ? <img src={d.diagramImage} alt="" className="relative w-full h-full object-cover" loading="lazy" />
        : d.diagramData
        ? <BoardSvg state={d.diagramData} className="relative w-full h-full" />
        : d.diagram
          ? <img src={d.diagram} alt="" className="relative w-full h-full object-cover" loading="lazy" />
          : <div className="relative w-full h-full flex items-center justify-center"><Icon className="w-4 h-4 text-white/90" /></div>}
    </div>
  );
};

export const DrillPickRow = ({ d, onPick }) => (
  <li>
    <button onClick={() => onPick(d)} className="w-full bg-white rounded-2xl p-2.5 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
      <DrillThumb d={d} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 leading-tight truncate">{d.name}</div>
        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{d.cat}{d.dur ? ` · ${d.dur}` : ""}</div>
      </div>
      <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </button>
  </li>
);

// Pick a drill to drop into a practice (mirrors the gym ExercisePicker).
export const DrillPicker = ({ drills, onPick, onClose }) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const cats = useMemo(() => [...new Set(drills.map((d) => d.cat).filter(Boolean))], [drills]);
  const hits = q ? drills.filter((d) => (d.kind || "drill") === "drill" && ((d.name || d.title || "").toLowerCase().includes(q) || (d.tags || []).some((t) => String(t).toLowerCase().includes(q)))) : null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Add a drill</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drills…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          {drills.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No drills yet — add some in the Drills tab first.</p>}
          {hits ? (
            <ul className="space-y-2">{hits.map((d) => <DrillPickRow key={d.id} d={d} onPick={onPick} />)}{hits.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No matches.</p>}</ul>
          ) : (
            cats.map((c) => (
              <div key={c}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 mt-2">{c}</h4>
                <ul className="space-y-2">{drills.filter((d) => d.cat === c).map((d) => <DrillPickRow key={d.id} d={d} onPick={onPick} />)}</ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Session phases for a timed-block practice (the 90-min high-school template).
export const SESSION_PHASES = ["Warm-Up & Rondo", "Technical", "Tactical / Positional", "Scrimmage", "Cool-Down & Debrief"];
export const SESSION_TEMPLATES = [
  { name: "Full session — 90 min", targetMin: 90, blocks: [
    { phase: "Warm-Up & Rondo", name: "Warm-Up & Rondo", dur: "12" },
    { phase: "Technical", name: "Dribbling & 1v1", dur: "12" },
    { phase: "Technical", name: "Passing & Combination", dur: "12" },
    { phase: "Technical", name: "Shooting & Crossing", dur: "12" },
    { phase: "Tactical / Positional", name: "Positional Play", dur: "12" },
    { phase: "Scrimmage", name: "Scrimmage", dur: "20" },
    { phase: "Cool-Down & Debrief", name: "Cool-Down & Debrief", dur: "10" },
  ]},
  { name: "Short session — 60 min", targetMin: 60, blocks: [
    { phase: "Warm-Up & Rondo", name: "Warm-Up & Rondo", dur: "10" },
    { phase: "Technical", name: "Technical Work", dur: "10" },
    { phase: "Tactical / Positional", name: "Tactical Work", dur: "10" },
    { phase: "Scrimmage", name: "Scrimmage", dur: "20" },
    { phase: "Cool-Down & Debrief", name: "Cool-Down & Debrief", dur: "10" },
  ]},
];
export function parseBlockMin(dur) { const n = parseInt(String(dur || ""), 10); return Number.isFinite(n) ? n : 0; }

export const PracticeCard = ({ practice, onOpen }) => (
  <button onClick={onOpen} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between gap-3 text-left">
    <div className="min-w-0">
      <div className="font-bold text-sm text-slate-900 leading-tight truncate">{practice.name || "Untitled practice"}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{practice.blocks?.length || 0} drill{(practice.blocks?.length || 0) === 1 ? "" : "s"}{(practice.blocks || []).reduce((s, b) => s + parseBlockMin(b.dur), 0) > 0 ? ` · ${(practice.blocks || []).reduce((s, b) => s + parseBlockMin(b.dur), 0)} min` : ""}{practice.desc ? ` · ${practice.desc}` : ""}</div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {practice.published && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>Published</span>}
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </div>
  </button>
);

// Build/view a single practice — an ordered list of drill blocks. Mirrors the
// gym WorkoutDetail (debounced autosave, reorder, add via picker).
export const PracticeDetail = ({ practice, drills, canEdit, onSave, onDelete, onBack, catOptions = [] }) => {
  const [name, setName] = useState(practice.name || "");
  const [desc, setDesc] = useState(practice.desc || "");
  const [cat, setCat] = useState(practice.cat || "");
  const [blocks, setBlocks] = useState(practice.blocks || []);
  const [published, setPublished] = useState(!!practice.published);
  const [targetMin, setTargetMin] = useState(practice.targetMin || 90);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [picker, setPicker] = useState(false);
  const [pickForBlock, setPickForBlock] = useState(null);
  const [viewDrill, setViewDrill] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const totalMin = blocks.reduce((s, b) => s + parseBlockMin(b.dur), 0);
  // What prints: the practice as it looks right now, including any
  // unsaved edits still in the editor.
  const currentPractice = { ...practice, name, desc, cat, blocks, published, targetMin };
  const teamName = practice.teamId ? getTeam(practice.teamId).name : "";

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, desc, cat, blocks, published, targetMin })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the practice")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, cat, blocks, published, targetMin, dirty]);

  const handleBack = () => { if (dirty && canEdit) Promise.resolve(onSave({ name, desc, cat, blocks, published, targetMin })).catch(reportError("Couldn't save the practice")); onBack(); };
  const setBlock = (i, field, value) => { setBlocks(blocks.map((b, j) => (j === i ? { ...b, [field]: value } : b))); setDirty(true); };
  const removeBlock = (i) => { setBlocks(blocks.filter((_, j) => j !== i)); setDirty(true); };
  const moveBlock = (i, dir) => { const j = i + dir; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; setBlocks(n); setDirty(true); };
  const addBlock = (d) => { setBlocks([...blocks, { drillId: d.id, name: d.name, cat: d.cat || "", dur: d.dur || "", phase: "", notes: "" }]); setDirty(true); setPicker(false); };
  // Fill a template row with a drill from the library.
  const fillBlock = (i, d) => { setBlocks(blocks.map((b, j) => (j === i ? { ...b, drillId: d.id, name: d.name, cat: d.cat || "", dur: b.dur || d.dur || "" } : b))); setDirty(true); setPickForBlock(null); };
  // Drop a timed-block template in as the session skeleton; each row gets a drill.
  const applyTemplate = (t) => { setBlocks(t.blocks.map((b) => ({ ...b, drillId: "", notes: "" }))); setTargetMin(t.targetMin); setDirty(true); };
  const confirmDelete = async () => { if (!confirm(`Delete "${practice.name}"? This can't be undone.`)) return; try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); } };
  const drillById = (id) => drills.find((d) => d.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Practice name" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
          <input value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true); }} placeholder="Short description (optional)" className="w-full text-sm text-slate-600 bg-transparent focus:outline-none" />
          <input list="practice-cats" value={cat} onChange={(e) => { setCat(e.target.value); setDirty(true); }} placeholder="Category (e.g. Technical, Game Prep)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="practice-cats">{catOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </>
      ) : (
        <><h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>{cat && <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{cat}</span>}{desc && <p className="text-sm text-slate-600">{desc}</p>}</>
      )}

      {/* Timeline total — running minutes vs the session target. */}
      <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">Session total</span>
          <span className={`text-sm font-bold ${totalMin > targetMin ? "text-red-600" : "text-slate-900"}`}>{totalMin} / {targetMin} min</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (totalMin / Math.max(1, targetMin)) * 100)}%`, backgroundColor: totalMin > targetMin ? "#DC2626" : COLORS.success }} />
        </div>
        {totalMin > targetMin && <p className="text-[11px] font-semibold text-red-600 mt-1.5">Over the planned length by {totalMin - targetMin} min — trim a block.</p>}
        {canEdit && (
          <label className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-slate-500">
            Target length
            <input type="number" min={10} max={240} value={targetMin} onChange={(e) => { setTargetMin(Number(e.target.value) || 90); setDirty(true); }} className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center" /> min
          </label>
        )}
      </div>

      {blocks.length === 0 ? (
        canEdit ? (
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Start from a template</p>
            {SESSION_TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => applyTemplate(t)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-left">
                <div className="text-sm font-bold text-slate-900">{t.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{t.blocks.map((b) => `${b.name} ${b.dur}'`).join(" · ")}</div>
              </button>
            ))}
            <p className="text-[11px] text-slate-400 text-center pt-1">…or add drills below and build it block by block.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic text-center py-6">No drills yet.</p>
        )
      ) : (
        <ul className="space-y-2">
          {blocks.map((b, i) => {
            const d = drillById(b.drillId);
            return (
              <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                  {d ? <DrillThumb d={d} className="w-9 h-9" /> : <button onClick={() => canEdit && setPickForBlock(i)} className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0" aria-label="Pick a drill"><Plus className="w-4 h-4 text-slate-400" /></button>}
                  <button onClick={() => d && setViewDrill(d)} className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm text-slate-900 leading-tight truncate">{b.name || "Pick a drill"}</div>
                    <div className="text-[10px] text-slate-500">{b.phase ? `${b.phase} · ` : ""}{b.cat}{b.dur ? ` · ${b.dur} min` : ""}{!d && b.drillId ? " · (drill deleted)" : ""}</div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveBlock(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeBlock(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <input type="number" min={0} value={b.dur} onChange={(e) => setBlock(i, "dur", e.target.value)} placeholder="Min" aria-label="Minutes" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" /> min
                    </label>
                    <select value={b.phase || ""} onChange={(e) => setBlock(i, "phase", e.target.value)} aria-label="Phase" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
                      <option value="">Phase…</option>
                      {SESSION_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input value={b.notes} onChange={(e) => setBlock(i, "notes", e.target.value)} placeholder="Notes (optional)" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                ) : (b.notes ? <div className="text-[11px] text-slate-600 mt-1.5 pl-[34px]">{b.notes}</div> : null)}
              </li>
            );
          })}
        </ul>
      )}

      {/* Export / share: a printable PDF of every block in order. */}
      <button onClick={() => setPrintOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Printer className="w-3.5 h-3.5" /> Export / Share PDF</button>

      {canEdit && (
        <>
          <button onClick={() => setPicker(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Plus className="w-3.5 h-3.5" /> Add drill</button>
          <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Published to players</span>
            <button onClick={() => { setPublished(!published); setDirty(true); }} aria-label="Toggle published" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={published ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${published ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">Delete practice</button>
        </>
      )}
      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}
      {picker && <DrillPicker drills={drills} onPick={addBlock} onClose={() => setPicker(false)} />}
      {pickForBlock !== null && <DrillPicker drills={drills} onPick={(d) => fillBlock(pickForBlock, d)} onClose={() => setPickForBlock(null)} />}
      {viewDrill && <DrillModal item={viewDrill} onClose={() => setViewDrill(null)} />}
      {printOpen && <PracticePrintSheet practice={currentPractice} drills={drills} teamName={teamName} onClose={() => setPrintOpen(false)} />}
    </div>
  );
};

export const PracticesView = ({ practices, drills, canEdit, add, update, del, initialOpenId = null, hideCreate = false }) => {
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [cat, setCat] = useState("All");
  const [printAllOpen, setPrintAllOpen] = useState(false);
  const teamName = practices.length > 0 && practices[0].teamId ? getTeam(practices[0].teamId).name : "";
  const catOptions = useMemo(() => [...new Set(practices.map((p) => p.cat).filter(Boolean))].sort(), [practices]);
  const cats = ["All", ...catOptions];
  const open = practices.find((p) => p.id === openId);
  if (open) return <PracticeDetail key={open.id} practice={open} drills={drills} canEdit={canEdit} catOptions={catOptions} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} />;
  const create = async () => {
    if (!newName.trim()) return;
    try { const ref = await add(newName); setNewName(""); setCreating(false); if (ref?.id) setOpenId(ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };
  const filtered = cat === "All" ? practices : practices.filter((p) => (p.cat || "") === cat);
  return (
    <div className="px-5 space-y-3">
      {canEdit && !hideCreate ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Practice name (e.g. Tuesday Session)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={create} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New practice</button>
        )
      ) : (!canEdit && practices.length === 0 && <ReadOnlyHint label="Your coach hasn't published a practice yet" />)}

      {cats.length > 1 && (
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="flex gap-2 w-max">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
            ))}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <button onClick={() => setPrintAllOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Printer className="w-3.5 h-3.5" /> Export all practices</button>
      )}

      {isLoading(practices) ? <LoadingNote /> : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No practices{cat !== "All" ? ` in ${cat}` : ""} yet.</p>
      ) : (
        <ul className="space-y-2">{filtered.map((p) => <li key={p.id}><PracticeCard practice={p} onOpen={() => setOpenId(p.id)} /></li>)}</ul>
      )}
      {printAllOpen && <PracticesPrintSheet practices={filtered} drills={drills} teamName={teamName} onClose={() => setPrintAllOpen(false)} />}
    </div>
  );
};

// Pick a practice for a program day.
export const PracticePicker = ({ practices, onPick, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900">Pick a practice</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-2">
        {practices.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No practices yet — build one in the Practices tab first.</p>}
        {practices.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 text-left">
            <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div><div className="text-[10px] text-slate-500">{p.blocks?.length || 0} drills</div></div>
            <Plus className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  </div>
);

export const ProgramCard = ({ program, onOpen, onCopy }) => (
  <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center gap-1 pr-2">
    <button onClick={onOpen} className="flex-1 min-w-0 p-4 flex items-center justify-between gap-3 text-left">
      <div className="min-w-0">
        <div className="font-bold text-sm text-slate-900 leading-tight truncate">{program.name || "Untitled program"}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{program.days?.length || 0} day{(program.days?.length || 0) === 1 ? "" : "s"}{program.desc ? ` · ${program.desc}` : ""}{program.createdByName ? ` · ${program.createdByName}` : ""}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {program.shared && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Shared</span>}
        {program.published && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>Published</span>}
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>
    </button>
    {onCopy && <button onClick={onCopy} title="Copy this program" aria-label="Copy program" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Copy className="w-4 h-4 text-slate-500" /></button>}
  </div>
);

// Build/view a program — an ordered sequence of days, each pointing to a practice.
export const ProgramDetail = ({ program, practices, canEdit, onSave, onDelete, onBack, onAssign, user }) => {
  const [name, setName] = useState(program.name || "");
  const [desc, setDesc] = useState(program.desc || "");
  const [days, setDays] = useState(program.days || []);
  const [published, setPublished] = useState(!!program.published);
  const [shared, setShared] = useState(!!program.shared);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [pickFor, setPickFor] = useState(null); // index of day choosing a practice

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, desc, days, published, shared })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the program")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, days, published, shared, dirty]);

  const handleBack = () => { if (dirty && canEdit) Promise.resolve(onSave({ name, desc, days, published, shared })).catch(reportError("Couldn't save the program")); onBack(); };
  const addDay = () => { setDays([...days, { label: `Day ${days.length + 1}`, practiceId: "", note: "" }]); setDirty(true); };
  const setDay = (i, field, value) => { setDays(days.map((d, j) => (j === i ? { ...d, [field]: value } : d))); setDirty(true); };
  const removeDay = (i) => { setDays(days.filter((_, j) => j !== i)); setDirty(true); };
  const moveDay = (i, dir) => { const j = i + dir; if (j < 0 || j >= days.length) return; const n = [...days]; [n[i], n[j]] = [n[j], n[i]]; setDays(n); setDirty(true); };
  const confirmDelete = async () => { if (!confirm(`Delete "${program.name}"?`)) return; try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); } };
  const practiceById = (id) => practices.find((p) => p.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Program name (e.g. Preseason Week 1)" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
          <input value={desc} onChange={(e) => { setDesc(e.target.value); setDirty(true); }} placeholder="Short description (optional)" className="w-full text-sm text-slate-600 bg-transparent focus:outline-none" />
        </>
      ) : (
        <><h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>{desc && <p className="text-sm text-slate-600">{desc}</p>}</>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No days yet.{canEdit ? " Add one below." : ""}</p>
      ) : (
        <ul className="space-y-2">
          {days.map((day, i) => {
            const p = practiceById(day.practiceId);
            return (
              <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                  {canEdit
                    ? <input value={day.label} onChange={(e) => setDay(i, "label", e.target.value)} placeholder={`Day ${i + 1}`} className="flex-1 min-w-0 text-sm font-semibold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200" />
                    : <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{day.label || `Day ${i + 1}`}</span>}
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveDay(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveDay(i, 1)} disabled={i === days.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeDay(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                <div className="mt-2 pl-[34px]">
                  {canEdit ? (
                    <button onClick={() => setPickFor(i)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3 h-3" style={{ color: COLORS.accent }} /> {p ? p.name : "Pick practice"}
                    </button>
                  ) : (
                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5"><Layers className="w-3 h-3" style={{ color: COLORS.accent }} /> {p ? p.name : "Rest / unassigned"}</div>
                  )}
                  {day.note && !canEdit && <div className="text-[11px] text-slate-500 mt-1">{day.note}</div>}
                  {canEdit && <input value={day.note} onChange={(e) => setDay(i, "note", e.target.value)} placeholder="Note (optional)" className="w-full mt-1.5 border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <button onClick={addDay} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white"><Plus className="w-3.5 h-3.5" /> Add day</button>
          <button onClick={() => onAssign({ ...program, name, days })} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 text-white" style={{ backgroundColor: COLORS.accent, color: "#fff" }}><CalendarIcon className="w-3.5 h-3.5" /> Assign to calendar</button>
          {user?.isOrgAdmin && (
            <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
              <span className="text-sm font-semibold text-slate-700">Shared curriculum <span className="block text-[11px] font-normal text-slate-500">All coaches can follow this program</span></span>
              <button onClick={() => { setShared(!shared); setDirty(true); }} aria-label="Toggle shared curriculum" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={shared ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${shared ? "left-[22px]" : "left-0.5"}`} /></button>
            </label>
          )}
          <label className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Published to players</span>
            <button onClick={() => { setPublished(!published); setDirty(true); }} aria-label="Toggle published" className="w-11 h-6 rounded-full transition-colors relative bg-slate-200" style={published ? { backgroundColor: COLORS.success } : {}}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${published ? "left-[22px]" : "left-0.5"}`} /></button>
          </label>
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">Delete program</button>
        </>
      )}
      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}
      {pickFor !== null && <PracticePicker practices={practices} onPick={(p) => { setDay(pickFor, "practiceId", p.id); setPickFor(null); }} onClose={() => setPickFor(null)} />}
    </div>
  );
};

export const ProgramsView = ({ programs, practices, canEdit, add, update, del, onAssign, onCopy, user, startCreating = false }) => {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(startCreating);
  const [newName, setNewName] = useState("");
  const open = programs.find((p) => p.id === openId);
  const sharedPrograms = programs.filter((p) => p.shared);
  const myPrograms = programs.filter((p) => !p.shared);
  if (open) return <ProgramDetail key={open.id} program={open} practices={practices} canEdit={canEdit} onSave={(d) => update(open.id, d)} onDelete={async () => { await del(open.id); setOpenId(null); }} onBack={() => setOpenId(null)} onAssign={onAssign} user={user} />;
  const create = async () => {
    if (!newName.trim()) return;
    try { const ref = await add(newName); setNewName(""); setCreating(false); if (ref?.id) setOpenId(ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };
  return (
    <div className="px-5 space-y-3">
      {canEdit ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Program name (e.g. Preseason Week 1)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={create} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New program</button>
        )
      ) : (programs.length === 0 && <ReadOnlyHint label="Your coach hasn't published a program yet" />)}

      {isLoading(programs) ? <LoadingNote /> : programs.length === 0 ? (
        canEdit ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: COLORS.accentSoft }}><Goal className="w-6 h-6" style={{ color: COLORS.accent }} /></div>
            <p className="text-sm text-slate-400 italic">Sequence your practices into a program, then assign dates to drop them on the calendar.</p>
          </div>
        ) : null
      ) : (
        <div className="space-y-4">
          {sharedPrograms.length > 0 && (
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Shared curriculum</h4>
              <ul className="space-y-2">{sharedPrograms.map((p) => <li key={p.id}><ProgramCard program={p} onOpen={() => setOpenId(p.id)} onCopy={canEdit ? () => onCopy?.(p) : undefined} /></li>)}</ul>
            </div>
          )}
          {myPrograms.length > 0 && (
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">My programs</h4>
              <ul className="space-y-2">{myPrograms.map((p) => <li key={p.id}><ProgramCard program={p} onOpen={() => setOpenId(p.id)} onCopy={canEdit ? () => onCopy?.(p) : undefined} /></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Session templates — a timed-block skeleton the coach fills with drills.
// (The 90-min default follows the high-school timed-block model; the 60-min
// variant is the same shape, compressed.)
export const PRACTICE_STARTERS = SESSION_TEMPLATES.map((t) => ({
  name: t.name, cat: "Session", targetMin: t.targetMin, blocks: t.blocks,
  desc: t.blocks.map((b) => `${b.name} ${b.dur}'`).join(" · "),
  icon: t.targetMin === 90 ? Target : Clock, color: t.targetMin === 90 ? "#2563eb" : "#16a34a",
}));

// One section row on the Practice home: title + a Create / Library split.
export const SectionBanner = ({ icon: Icon, title, count, onCreate, onLibrary }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.accentSoft }}><Icon className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
      <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-900">{title}</div><div className="text-[11px] text-slate-500">{count}</div></div>
    </div>
    <div className="grid grid-cols-2 border-t border-slate-100">
      <button onClick={onCreate} className="py-2.5 text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> Create</button>
      <button onClick={onLibrary} className="py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-center gap-1.5"><Layers className="w-3.5 h-3.5" style={{ color: COLORS.accent }} /> Library</button>
    </div>
  </div>
);

// "Create practice" entry: blank, a built-in starter, or a copy of an existing one.
export const NewPracticeChooser = ({ practices, onCreate }) => (
  <div className="px-5 pb-4 space-y-4">
    <div>
      <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Start from a template</h4>
      <div className="grid grid-cols-2 gap-2">
        {PRACTICE_STARTERS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.name} onClick={() => onCreate({ name: t.name, cat: t.cat, desc: t.desc, blocks: (t.blocks || []).map((b) => ({ ...b, drillId: "", notes: "" })), targetMin: t.targetMin || 90 })} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col gap-2 text-left hover:bg-slate-50">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${t.color}1a` }}><Icon className="w-4 h-4" style={{ color: t.color }} /></div>
              <div className="min-w-0"><div className="font-semibold text-sm text-slate-900 truncate">{t.name}</div><div className="text-[11px] text-slate-500 line-clamp-2 leading-snug">{t.desc}</div></div>
            </button>
          );
        })}
        <button onClick={() => onCreate({ name: "New practice" })} className="rounded-2xl p-3 shadow-sm text-white flex flex-col gap-2 text-left" style={{ backgroundColor: COLORS.primary }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/15"><Plus className="w-4 h-4 text-white" /></div>
          <div className="min-w-0"><div className="font-semibold text-sm">Blank</div><div className="text-[11px] text-white/70 leading-snug">Start from scratch</div></div>
        </button>
      </div>
    </div>
    {practices.length > 0 && (
      <div>
        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Copy from library</h4>
        <div className="space-y-2">
          {practices.map((p) => (
            <button key={p.id} onClick={() => onCreate({ name: `${p.name} (copy)`, cat: p.cat || "", desc: p.desc || "", blocks: p.blocks || [] })} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center justify-between gap-2 text-left hover:bg-slate-50">
              <div className="min-w-0"><div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div><div className="text-[10px] text-slate-500">{p.blocks?.length || 0} drills{p.cat ? ` · ${p.cat}` : ""}</div></div>
              <Copy className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);

// Assign a program onto the calendar — the coach picks the DATE and TIME for
// each day (no fixed drop time), so other coaches can see what is scheduled
// and what they need to run.
export const AssignProgramModal = ({ program, practices, importEvents, onClose }) => {
  const todayStr = teamDateKey();
  const [days, setDays] = useState(() =>
    (program.days || []).map((d, i) => {
      // Calendar-day arithmetic on the date string (UTC noon avoids any
      // timezone rollover), so day N is exactly N days after today.
      const [y, m, dd] = todayStr.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, dd + i, 12));
      return { date: dt.toISOString().slice(0, 10), start: "15:00", end: "17:00" };
    })
  );
  const [busy, setBusy] = useState(false);
  const setDay = (i, field, value) => setDays(days.map((d, j) => (j === i ? { ...d, [field]: value } : d)));
  const practiceById = (id) => practices.find((p) => p.id === id);
  const confirmAssign = async () => {
    const rows = program.days.map((day, i) => {
      const practice = practiceById(day.practiceId);
      return {
        title: `${program.name}: ${day.label || `Day ${i + 1}`}${practice ? ` — ${practice.name}` : ""}`,
        date: days[i]?.date || todayStr,
        start: days[i]?.start || "15:00", end: days[i]?.end || "17:00",
        location: "", type: "Practice",
        programId: program.id, practiceId: day.practiceId || "",
      };
    });
    setBusy(true);
    try { await importEvents(rows, { notify: false }); toast(`Added ${rows.length} session${rows.length === 1 ? "" : "s"} to the calendar.`); onClose(); }
    catch (e) { toast("Couldn't assign — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Assign “{program.name}”</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">Pick a date and time for each day. Other coaches will see these sessions on the calendar with the practice attached.</p>
          {program.days.map((day, i) => {
            const p = practiceById(day.practiceId);
            return (
              <div key={i} className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
                <div className="text-sm font-bold text-slate-900">{day.label || `Day ${i + 1}`}{p ? ` — ${p.name}` : " — Rest / unassigned"}</div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="date" value={days[i]?.date || ""} onChange={(e) => setDay(i, "date", e.target.value)} aria-label="Date" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                  <input type="time" value={days[i]?.start || ""} onChange={(e) => setDay(i, "start", e.target.value)} aria-label="Start time" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                  <input type="time" value={days[i]?.end || ""} onChange={(e) => setDay(i, "end", e.target.value)} aria-label="End time" className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white" />
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={confirmAssign} disabled={busy} className="flex-1 py-2.5 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Adding…" : `Add ${program.days.length} session${program.days.length === 1 ? "" : "s"} to calendar`}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PracticePage = ({ user, drills, addDrill, updateDrill, deleteDrill, practices, addPractice, updatePractice, deletePractice, programs, addProgram, updateProgram, deleteProgram, importEvents, events = [] }) => {
  const isAdmin = user.role === "admin";
  const [nav, setNav] = useState({ section: "home", mode: null, openId: null });
  const [assignTarget, setAssignTarget] = useState(null);
  const go = (section, mode, openId = null) => setNav({ section, mode, openId });
  const home = () => setNav({ section: "home", mode: null, openId: null });

  // Today's session is whichever assigned-program event lands on today.
  const today = teamDateKey();
  const todayEvent = events.find((e) => e.date === today && e.practiceId);
  const todayPractice = todayEvent && practices.find((p) => p.id === todayEvent.practiceId);

  // Assign a program: open the per-day date/time picker (no fixed drop time).
  const openAssign = (program) => {
    if (!program.days?.length) { toast("Add some days to the program first."); return; }
    setAssignTarget(program);
  };
  // Copy a shared program to make it your own.
  const copyProgram = async (program) => {
    try {
      await addProgram({ name: `${program.name} (copy)`, desc: program.desc || "", days: program.days || [], published: false, shared: false });
      toast("Copied — open it to make it yours.");
    } catch (e) { toast("Couldn't copy — " + (e.message || "check rules.")); }
  };

  const createPracticeFrom = async (data) => {
    try { const ref = await addPractice(data); if (ref?.id) go("practices", "library", ref.id); }
    catch (e) { toast("Couldn't create — " + (e.message || "check rules.")); }
  };

  // ── Home: today's session + the three section banners ──
  if (nav.section === "home") {
    return (
      <div className="pt-4 pb-4 space-y-5">
        <div className="px-5">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Today</h3>
          {todayPractice ? (
            <button onClick={() => go("practices", "library", todayPractice.id)} className="w-full text-left rounded-2xl p-4 shadow-sm" style={{ backgroundColor: COLORS.primary }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>{todayEvent?.start ? formatHourTime(todayEvent.start) : "Today's session"}</div>
              <div className="text-lg font-bold text-white mt-0.5 leading-tight">{todayPractice.name}</div>
              <div className="text-xs text-white/70 mt-0.5">{todayPractice.blocks?.length || 0} drill{(todayPractice.blocks?.length || 0) === 1 ? "" : "s"}{todayPractice.cat ? ` · ${todayPractice.cat}` : ""}</div>
            </button>
          ) : (
            <div className="rounded-2xl p-5 border border-dashed border-slate-200 bg-white text-center">
              <p className="text-sm text-slate-500 font-medium">No practice scheduled today.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Assign a program to drop sessions onto the calendar.</p>
            </div>
          )}
        </div>
        <div className="px-5 space-y-3">
          <SectionBanner icon={Target} title="Drills" count={`${drills.length} drill${drills.length === 1 ? "" : "s"}`} onCreate={() => go("drills", "create")} onLibrary={() => go("drills", "library")} />
          <SectionBanner icon={Layers} title="Practices" count={`${practices.length} practice${practices.length === 1 ? "" : "s"}`} onCreate={() => go("practices", "create")} onLibrary={() => go("practices", "library")} />
          <SectionBanner icon={Goal} title="Programs" count={`${programs.length} program${programs.length === 1 ? "" : "s"}`} onCreate={() => go("programs", "create")} onLibrary={() => go("programs", "library")} />
        </div>
      </div>
    );
  }
  // (Assign modal is rendered below, after the section screen.)

  // ── Section screens (back to home + the chosen view) ──
  const sectionTitle = { drills: "Drills", practices: "Practices", programs: "Programs" }[nav.section];
  return (
    <div className="pt-3 pb-4">
      <div className="px-5 pb-3 flex items-center justify-between">
        <button onClick={home} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Practice</button>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{sectionTitle}{nav.mode === "create" ? " · New" : ""}</span>
      </div>
      {nav.section === "drills" && <DrillsPage user={user} drills={drills} addDrill={addDrill} updateDrill={updateDrill} deleteDrill={deleteDrill} startCreating={nav.mode === "create"} />}
      {nav.section === "practices" && nav.mode === "create" && <NewPracticeChooser practices={practices} onCreate={createPracticeFrom} />}
      {nav.section === "practices" && nav.mode === "library" && <PracticesView practices={practices} drills={drills} canEdit={isAdmin} add={addPractice} update={updatePractice} del={deletePractice} initialOpenId={nav.openId} />}
      {nav.section === "programs" && <ProgramsView user={user} programs={programs} practices={practices} canEdit={isAdmin} add={addProgram} update={updateProgram} del={deleteProgram} onAssign={openAssign} onCopy={copyProgram} startCreating={nav.mode === "create"} />}
      {assignTarget && <AssignProgramModal program={assignTarget} practices={practices} importEvents={importEvents} onClose={() => setAssignTarget(null)} />}
    </div>
  );
};
