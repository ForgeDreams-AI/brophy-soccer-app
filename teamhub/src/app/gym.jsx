// Split out of TeamHubRoles.jsx (F81). Area: gym.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Copy, Download, Dumbbell, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { storage } from "../firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { isLoading } from "../hooks/useCollection";
import { exerciseImageUrl, loadExercises } from "../lib/exercises";
import { searchExercises } from "../lib/exerciseSearch";
import { toast } from "../lib/toast";
import { SUPERSET_LABELS, WORKOUT_TEMPLATES, buildTemplateWorkout, groupBySuperset, newEntry } from "../lib/lifting";
import { AREA_ORDER } from "../data/workoutSeed";
import { LoadingNote, PrescriptionLine, useMaxes } from "./home";
import { AutoGrowTextarea, COLORS, PhotoCarousel, ReadOnlyHint, downscaleToBlob, reportError } from "./shared";


/* ─── GYM (Free Exercise DB — Unlicense / public domain) ─── */
export const titleCase = (s) =>
  String(s || "").split(/[\s_-]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

export const useExerciseLib = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loadExercises()
      // Strongman lifts (car deadlift, rickshaw, log press…) aren't for high
      // school soccer players — hide them from the library.
      .then((d) => { if (alive) { setItems(d.filter((x) => x.category !== "strongman")); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message || "Failed to load"); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  return { items, loading, err };
};

// Coach-authored exercise editor — same fields/structure as public library
// entries (equipment + muscle "tags", level, mechanic, how-to steps, photos)
// so custom exercises render identically. Tags are free-text + extensible.
export const CustomExerciseForm = ({ item, uid, equipmentOptions = [], muscleOptions = [], onSave, onClose }) => {
  const editing = !!item?.id;
  const [name, setName] = useState(item?.name || "");
  const [equipment, setEquipment] = useState(item?.equipment || "");
  const [primary, setPrimary] = useState((item?.primaryMuscles || []).join(", "));
  const [aliases, setAliases] = useState((item?.aliases || []).join(", "));
  const [level, setLevel] = useState(item?.level || "beginner");
  const [mechanic, setMechanic] = useState(item?.mechanic || "");
  const [instructions, setInstructions] = useState((item?.instructions || []).join("\n"));
  const [photos, setPhotos] = useState(item?.images || []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadImage = async (file) => {
    const blob = await downscaleToBlob(file);
    const path = `exercises/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    return getDownloadURL(snap.ref);
  };
  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try { const urls = []; for (const f of Array.from(files)) urls.push(await uploadImage(f)); setPhotos((p) => [...p, ...urls]); }
    catch (e) { toast("Couldn't upload photo — " + (e.message || "check Storage rules.")); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const data = {
      name: name.trim(),
      equipment: equipment.trim() || "other",
      primaryMuscles: primary.split(",").map((s) => s.trim()).filter(Boolean),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      secondaryMuscles: item?.secondaryMuscles || [],
      level: level || "beginner",
      mechanic: mechanic.trim(),
      instructions: instructions.split("\n").map((s) => s.trim()).filter(Boolean),
      images: photos,
    };
    try { await onSave(data); onClose(); }
    catch (e) { toast("Couldn't save — " + (e.message || "check Firestore rules.")); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">{editing ? "Edit exercise" : "New exercise"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-2 gap-2">
            <input list="ex-equip" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Equipment" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input list="ex-muscle" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="Muscles (comma-sep)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <datalist id="ex-equip">{equipmentOptions.map((o) => <option key={o} value={o} />)}</datalist>
            <datalist id="ex-muscle">{muscleOptions.map((o) => <option key={o} value={o} />)}</datalist>
          </div>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Also known as… (comma-separated nicknames)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{["beginner", "intermediate", "expert"].map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}</select>
            <input list="ex-mech" value={mechanic} onChange={(e) => setMechanic(e.target.value)} placeholder="Mechanic (e.g. compound)" className="border border-slate-200 rounded-lg px-3 py-2 text-xs" />
            <datalist id="ex-mech"><option value="compound" /><option value="isolation" /></datalist>
          </div>
          <AutoGrowTextarea value={instructions} onChange={(e) => setInstructions(e.target.value)} minRows={4} placeholder="How to do it — one step per line" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />

          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {photos.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow"><X className="w-3 h-3 text-slate-500" /></button>
                </div>
              ))}
            </div>
          )}
          <label className="w-full py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer flex items-center justify-center gap-1.5">
            <ImagePlus className="w-3.5 h-3.5" /> Add photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
          {uploading && <p className="text-[10px] font-semibold text-slate-400 px-1">Uploading…</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={save} disabled={busy || uploading || !name.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{editing ? "Save changes" : "Add exercise"}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExerciseLibrary = ({ items, loading, err, onPick, picker, myWorkouts = [], addMyWorkout, updateMyWorkout, canEdit = false, uid, addCustomExercise, updateCustomExercise, deleteCustomExercise, seedLifts }) => {
  // Two-level drill: pick equipment, then pick muscle within that equipment.
  const [equip, setEquip] = useState(null);    // null = show equipment tiles
  const [muscle, setMuscle] = useState(null);  // null + equip set = show muscle tiles
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [formItem, setFormItem] = useState(null); // null=closed, {}=new, {...}=edit
  const [seeding, setSeeding] = useState(false);
  const runSeedLifts = async () => {
    if (!seedLifts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedLifts();
      toast(added ? `Added ${added} prehab starter exercise${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All prehab starter exercises are already in your library.");
    } catch (e) {
      toast("Couldn't add prehab starter exercises — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Existing equipment + muscle values power the form's datalists.
  const equipmentOptions = useMemo(() => [...new Set(items.map((ex) => ex.equipment).filter(Boolean))].sort(), [items]);
  const muscleOptions = useMemo(() => [...new Set(items.flatMap((ex) => ex.primaryMuscles || []).filter(Boolean))].sort(), [items]);

  // Modals shared across every browse level (mirrors how `selected` was reused).
  const overlays = (
    <>
      {selected && <ExerciseModal item={selected} onClose={() => setSelected(null)} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} canEdit={canEdit && !picker} onEdit={(it) => { setSelected(null); setFormItem(it); }} onDelete={deleteCustomExercise} />}
      {formItem !== null && <CustomExerciseForm item={formItem} uid={uid} equipmentOptions={equipmentOptions} muscleOptions={muscleOptions} onSave={(data) => (formItem.id ? updateCustomExercise(formItem.id, data) : addCustomExercise(data))} onClose={() => setFormItem(null)} />}
    </>
  );

  // Group by equipment (level 1).
  const byEquip = useMemo(() => {
    const map = {};
    items.forEach((ex) => {
      const e = ex.equipment || "other";
      (map[e] = map[e] || []).push(ex);
    });
    return map;
  }, [items]);
  const equipNames = useMemo(() => Object.keys(byEquip).sort(), [byEquip]);

  // Within selected equipment, group by primary muscle (level 2).
  const byMuscleForEquip = useMemo(() => {
    if (!equip) return {};
    const map = {};
    (byEquip[equip] || []).forEach((ex) => {
      const m = (ex.primaryMuscles || [])[0];
      if (!m) return;
      (map[m] = map[m] || []).push(ex);
    });
    return map;
  }, [byEquip, equip]);
  const muscleNames = useMemo(() => Object.keys(byMuscleForEquip).sort(), [byMuscleForEquip]);

  if (loading) return <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-slate-400`}>Loading exercises…</div>;
  if (err) return <div className={`${picker ? "" : "px-5"} pt-10 text-center text-sm text-red-500`}>Couldn't load: {err}</div>;

  const q = search.trim().toLowerCase();
  const searchHits = q ? searchExercises(items, search) : [];

  // Shared exercise row + search overlay.
  const renderExerciseRow = (ex) => (
    <li key={ex.id || ex.name}>
      <button onClick={() => onPick ? onPick(ex) : setSelected(ex)} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-tight">{ex.name}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">{titleCase(ex.equipment)}{ex.primaryMuscles?.length ? ` · ${ex.primaryMuscles.map(titleCase).join(", ")}` : ""}</div>
        </div>
        {onPick ? <Plus className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
      </button>
    </li>
  );

  const searchBar = (
    <div className="px-5 space-y-2">
      {canEdit && !picker && (
        <div className="flex gap-2">
          <button onClick={() => setFormItem({})} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3.5 h-3.5" /> New exercise</button>
          {seedLifts && (
            <button onClick={runSeedLifts} disabled={seeding} title="Add the prehab starter set — bands only, hips / groin / ankles" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white disabled:opacity-50" style={{ borderColor: COLORS.primary, color: COLORS.primary }}><Dumbbell className="w-3.5 h-3.5" /> {seeding ? "Adding…" : "Prehab starter"}</button>
          )}
        </div>
      )}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, nickname, or muscle…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
    </div>
  );

  // Search overrides any level.
  if (q) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{searchHits.length} match{searchHits.length === 1 ? "" : "es"}</h3>
          <ul className="space-y-2">
            {searchHits.map(renderExerciseRow)}
            {searchHits.length === 0 && <p className="text-sm text-slate-400 italic text-center py-6">No matches.</p>}
          </ul>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 1 — equipment tiles.
  if (!equip) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Or browse by equipment</h3>
          <div className="grid grid-cols-2 gap-3">
            {equipNames.map((e) => (
              <button key={e} onClick={() => setEquip(e)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-start text-left hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                <div className="text-sm font-bold text-slate-900 leading-tight">{titleCase(e)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{byEquip[e].length} exercise{byEquip[e].length === 1 ? "" : "s"}</div>
              </button>
            ))}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 2 — muscle tiles within selected equipment.
  if (!muscle) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="px-5">
          <button onClick={() => setEquip(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-2"><ChevronLeft className="w-3 h-3" /> Equipment</button>
          <h3 className="text-lg font-bold text-slate-900">{titleCase(equip)}</h3>
          <p className="text-[11px] text-slate-500 mb-3">Pick a muscle group</p>
          <div className="grid grid-cols-2 gap-3">
            {muscleNames.map((m) => (
              <button key={m} onClick={() => setMuscle(m)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-start text-left hover:bg-slate-50">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: COLORS.accentSoft }}><Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                <div className="text-sm font-bold text-slate-900 leading-tight">{titleCase(m)}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{byMuscleForEquip[m].length} exercise{byMuscleForEquip[m].length === 1 ? "" : "s"}</div>
              </button>
            ))}
            {muscleNames.length === 0 && <p className="text-sm text-slate-400 italic col-span-2 text-center py-6">No exercises in this category.</p>}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  // Level 3 — exercises.
  const inMuscle = byMuscleForEquip[muscle] || [];
  return (
    <div className="space-y-3">
      {searchBar}
      <div className="px-5">
        <button onClick={() => setMuscle(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-2"><ChevronLeft className="w-3 h-3" /> {titleCase(equip)}</button>
        <h3 className="text-lg font-bold text-slate-900">{titleCase(muscle)}</h3>
        <p className="text-[11px] text-slate-500">{inMuscle.length} exercise{inMuscle.length === 1 ? "" : "s"}</p>
      </div>
      <div className="px-5">
        <ul className="space-y-2">
          {inMuscle.map(renderExerciseRow)}
        </ul>
      </div>
      {overlays}
    </div>
  );
};

export const ExercisePicker = ({ items, loading, err, onPick, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900">Add an exercise</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
      <div className="py-3">
        <ExerciseLibrary items={items} loading={loading} err={err} onPick={onPick} picker />
      </div>
    </div>
  </div>
);

export const WorkoutCard = ({ workout, onOpen, byline }) => (
  <button onClick={onOpen} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 hover:bg-slate-50 text-left">
    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}>
      <Dumbbell className="w-5 h-5" style={{ color: COLORS.accent }} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-slate-900 leading-tight truncate">{workout.name || "Untitled"}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">
        {(workout.exercises?.length || 0)} exercise{(workout.exercises?.length || 0) === 1 ? "" : "s"}{byline ? ` · ${byline}` : ""}
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
  </button>
);

export const WORKOUT_STARTERS = ["Push Day", "Pull Day", "Leg Day", "Full Body", "Upper Body", "Core & Mobility"];

export const WorkoutsView = ({ workouts, canEdit, add, update, del, readOnlyLabel, lib, seedWorkouts, groupByArea }) => {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [seeding, setSeeding] = useState(false);
  const runSeedWorkouts = async () => {
    if (!seedWorkouts || seeding) return;
    setSeeding(true);
    try {
      const { added, skipped } = await seedWorkouts();
      toast(added ? `Added ${added} starter workout${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All starter workouts are already added.");
    } catch (e) {
      toast("Couldn't add starter workouts — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  // Group workouts by focus area (seeded ones carry `area`; manual ones fall
  // under "Your workouts"). Known areas render in a sensible order first.
  const grouped = useMemo(() => {
    if (!groupByArea) return null;
    const byArea = {};
    workouts.forEach((w) => { const a = w.area || "Your workouts"; (byArea[a] = byArea[a] || []).push(w); });
    const order = [...AREA_ORDER, "Your workouts"];
    return Object.keys(byArea)
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map((area) => ({ area, items: byArea[area] }));
  }, [workouts, groupByArea]);

  const open = workouts.find((w) => w.id === openId);
  if (open) {
    return (
      <WorkoutDetail
        key={open.id}
        workout={open}
        canEdit={canEdit}
        lib={lib}
        onSave={(d) => update(open.id, d)}
        onDelete={async () => { await del(open.id); setOpenId(null); }}
        onDuplicate={async () => {
          try { const ref = await add({ name: `${open.name} (copy)`, exercises: open.exercises || [] }); if (ref?.id) setOpenId(ref.id); }
          catch (e) { toast("Couldn't duplicate — " + (e.message || "")); }
        }}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const create = async (name) => {
    const n = (name || newName).trim();
    if (!n) return;
    try {
      const ref = await add(n);
      setNewName("");
      setCreating(false);
      if (ref?.id) setOpenId(ref.id);
    } catch (e) {
      toast("Couldn't create — " + (e.message || "check rules."));
    }
  };

  return (
    <div className="px-5 space-y-3">
      {canEdit ? (
        creating ? (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Workout name (e.g. Pull Day)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex flex-wrap gap-1.5">
              {WORKOUT_STARTERS.map((s) => <button key={s} onClick={() => create(s)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{s}</button>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewName(""); }} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={() => create()} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setCreating(true)} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
              <Plus className="w-3.5 h-3.5" /> New workout
            </button>
            {seedWorkouts && (
              <button onClick={runSeedWorkouts} disabled={seeding} title="Add the prehab starter routines — pre-practice + at home" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white disabled:opacity-50" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
                <ClipboardList className="w-3.5 h-3.5" /> {seeding ? "Adding…" : "Starter set"}
              </button>
            )}
          </div>
        )
      ) : (
        readOnlyLabel && <ReadOnlyHint label={readOnlyLabel} />
      )}

      {isLoading(workouts) ? <LoadingNote /> : workouts.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No workouts yet.{canEdit && seedWorkouts ? " Tap “Starter set” for the prehab routines." : ""}</p>
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(({ area, items }) => (
            <div key={area}>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 px-1 mb-1.5">{area}</div>
              <ul className="space-y-2">
                {items.map((w) => (
                  <li key={w.id}><WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.focus || w.createdByName} /></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => (
            <li key={w.id}>
              <WorkoutCard workout={w} onOpen={() => setOpenId(w.id)} byline={w.createdByName} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Download a workout as a clean standalone file the player keeps for
// themselves — a self-contained HTML page they can open, print, or save.
// It is theirs to keep; nothing is shared back to the team.
export const downloadWorkoutFile = (workout) => {
  const esc = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const rows = (workout.exercises || []).map((ex, i) => {
    const rx = [ex.sets ? `${ex.sets} sets` : "", ex.reps ? `× ${ex.reps}` : ""].filter(Boolean).join(" ");
    const load = ex.pct ? ` @ ${ex.pct}%` : ex.weight ? ` @ ${ex.weight}` : "";
    const notes = [ex.rpe ? `RPE ${ex.rpe}` : "", ex.tempo || "", ex.notes || ""].filter(Boolean).join(" · ");
    return `<tr><td>${i + 1}</td><td><strong>${esc(ex.name)}</strong>${notes ? `<div class="notes">${esc(notes)}</div>` : ""}</td><td>${esc(rx + load)}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(workout.name || "My Program")} — Brophy Soccer</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:24px 20px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}.sub{color:#64748b;font-size:13px;margin-bottom:20px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
td:first-child{width:28px;color:#94a3b8}.notes{font-size:12px;color:#64748b;margin-top:2px}
footer{margin-top:24px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}
@media print{body{padding:0}}
</style></head><body>
<h1>${esc(workout.name || "My Program")}</h1>
<div class="sub">Brophy Soccer · My program · ${esc(date)}</div>
<table><thead><tr><th>#</th><th>Exercise</th><th>Sets × Reps</th></tr></thead><tbody>${rows || `<tr><td colspan="3">No exercises yet.</td></tr>`}</tbody></table>
<footer>In-season rules: bands only for prehab · never train to failure · technique before load · stop if pain is over 3/10. School lifting (2×/week) is separate from this prehab routine.</footer>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (workout.name || "my-program").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-program";
  a.href = url; a.download = `brophy-${slug}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const WorkoutDetail = ({ workout, canEdit, lib, onSave, onDelete, onDuplicate, onBack }) => {
  // W6: tap an exercise name to open its how-to (photos + steps), matched by
  // its library id or, for starter workouts, by name.
  const [howTo, setHowTo] = useState(null);
  const libItemFor = (entry) => {
    const items = lib?.items || [];
    return (entry.exerciseId && items.find((x) => x.id === entry.exerciseId))
      || items.find((x) => (x.name || "").toLowerCase() === String(entry.name || "").toLowerCase())
      || null;
  };
  const [name, setName] = useState(workout.name || "");
  const [exercises, setExercises] = useState(workout.exercises || []);
  const [dirty, setDirty] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [picker, setPicker] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false); // reveal %/RPE/tempo/superset editors

  useEffect(() => {
    if (!dirty || !canEdit) return;
    // A failed save shows an error and stays "unsaved" (the next edit or
    // Back retries) instead of silently dropping the change.
    const t = setTimeout(() => {
      setDirty(false);
      Promise.resolve(onSave({ name, exercises })).then(() => setSaveErr(""), (e) => { setSaveErr("Not saved — check your connection, then edit again to retry."); reportError("Couldn't save the workout")(e); });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, exercises, dirty]);

  const handleBack = () => {
    if (dirty && canEdit) Promise.resolve(onSave({ name, exercises })).catch(reportError("Couldn't save the workout"));
    onBack();
  };

  const setEx = (i, field, value) => {
    setExercises(exercises.map((e, j) => (j === i ? { ...e, [field]: value } : e)));
    setDirty(true);
  };
  const removeEx = (i) => { setExercises(exercises.filter((_, j) => j !== i)); setDirty(true); };
  const moveEx = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises]; [next[i], next[j]] = [next[j], next[i]];
    setExercises(next); setDirty(true);
  };
  const addEx = (ex) => {
    setExercises([...exercises, newEntry(ex)]);
    setDirty(true);
    setPicker(false);
  };
  // Apply a ready-made strength template: matches each prescribed lift to the
  // library, appends its exercises, and names an untitled workout after it.
  const applyTemplate = (tpl) => {
    const built = buildTemplateWorkout(tpl, lib.items || []);
    setExercises([...exercises, ...built.exercises]);
    if (!name.trim()) setName(built.name);
    setDirty(true);
    setTplOpen(false);
    setAdvanced(true);
  };
  const cycleGroup = (i) => {
    const cur = exercises[i]?.group || "";
    const next = SUPERSET_LABELS[(SUPERSET_LABELS.indexOf(cur) + 1) % SUPERSET_LABELS.length];
    setEx(i, "group", next);
  };
  const groups = groupBySuperset(exercises);

  const confirmDelete = async () => {
    if (!confirm(`Delete "${workout.name}"? This can't be undone.`)) return;
    try { await onDelete(); } catch (e) { toast("Couldn't delete — " + e.message); }
  };

  return (
    <div className="px-5 pb-4 space-y-4">
      <button onClick={handleBack} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>

      {canEdit ? (
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="Workout name" className="w-full text-xl font-bold text-slate-900 bg-transparent focus:outline-none border-b border-transparent focus:border-slate-200 pb-1" />
      ) : (
        <h2 className="text-xl font-bold text-slate-900">{name || "Untitled"}</h2>
      )}

      {exercises.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">No exercises yet.{canEdit ? " Add one below." : ""}</p>
      ) : canEdit ? (
        <ul className="space-y-2">
          {exercises.map((ex, i) => (
            <li key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-semibold text-sm text-slate-900 leading-tight flex items-center gap-1.5">
                  {ex.name}
                  {ex.group && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: COLORS.accent }}>SS {ex.group}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveEx(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button onClick={() => moveEx(i, +1)} disabled={i === exercises.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => removeEx(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input value={ex.sets} onChange={(e) => setEx(i, "sets", e.target.value)} placeholder="Sets" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                  <input value={ex.reps} onChange={(e) => setEx(i, "reps", e.target.value)} placeholder="Reps" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => setEx(i, "loadMode", ex.loadMode === "percent" ? "weight" : "percent")}
                      title="Toggle load: absolute weight or % of the athlete's max"
                      className="px-2 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 bg-slate-50 flex-shrink-0"
                    >{ex.loadMode === "percent" ? "%" : "lb"}</button>
                    {ex.loadMode === "percent" ? (
                      <input value={ex.pct || ""} onChange={(e) => setEx(i, "pct", e.target.value)} placeholder="% max" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    ) : (
                      <input value={ex.weight || ""} onChange={(e) => setEx(i, "weight", e.target.value)} placeholder="Weight" className="w-full min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    )}
                  </div>
                </div>
                {advanced && (
                  <div className="grid grid-cols-3 gap-2">
                    <input value={ex.rpe || ""} onChange={(e) => setEx(i, "rpe", e.target.value)} placeholder="RPE" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    <input value={ex.tempo || ""} onChange={(e) => setEx(i, "tempo", e.target.value)} placeholder="Tempo" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center" />
                    <button type="button" onClick={() => cycleGroup(i)} title="Superset — adjacent exercises sharing a label run back-to-back" className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center font-semibold text-slate-600 bg-slate-50">{ex.group ? `Superset ${ex.group}` : "Superset"}</button>
                  </div>
                )}
                <input value={ex.notes || ""} onChange={(e) => setEx(i, "notes", e.target.value)} placeholder="Notes (optional)" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {groups.map((g, gi) => {
            const superset = g.group && g.items.length > 1;
            return (
              <li key={gi} className={`bg-white rounded-2xl p-3 shadow-sm border border-slate-100 ${superset ? "border-l-4" : ""}`} style={superset ? { borderLeftColor: COLORS.accent } : {}}>
                {superset && <div className="text-[9px] font-black uppercase tracking-wider mb-1.5" style={{ color: COLORS.accent }}>Superset {g.group}</div>}
                <div className="space-y-2">
                  {g.items.map(({ entry, index }) => (
                    <div key={index}>
                      {libItemFor(entry)
                        ? <button type="button" onClick={() => setHowTo(libItemFor(entry))} className="font-semibold text-sm text-slate-900 leading-tight text-left underline decoration-slate-300 underline-offset-2">{entry.name}</button>
                        : <div className="font-semibold text-sm text-slate-900 leading-tight">{entry.name}</div>}
                      <PrescriptionLine entry={entry} />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setPicker(true)} className="flex-1 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
              <Plus className="w-3.5 h-3.5" /> Add exercise
            </button>
            <button onClick={() => setTplOpen(true)} title="Start from a ready-made strength template" className="py-2.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
              <ClipboardList className="w-3.5 h-3.5" /> Template
            </button>
          </div>
          {exercises.length > 0 && (
            <button onClick={() => setAdvanced((v) => !v)} className="w-full py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
              {advanced ? "Hide" : "Show"} % max · RPE · tempo · supersets
            </button>
          )}
          {onDuplicate && (
            <button onClick={onDuplicate} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
              <Copy className="w-3.5 h-3.5" /> Duplicate workout
            </button>
          )}
          <button onClick={confirmDelete} className="w-full py-2 text-[11px] font-semibold text-red-500 hover:text-red-600">
            Delete workout
          </button>
        </>
      )}

      {dirty && canEdit && <p className="text-[10px] text-slate-400 text-center">Saving…</p>}
      {!dirty && saveErr && <p className="text-[10px] text-red-500 font-semibold text-center">{saveErr}</p>}

      {exercises.length > 0 && (
        <button onClick={() => downloadWorkoutFile({ name, exercises })} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 bg-white">
          <Download className="w-3.5 h-3.5" /> Download a copy to keep
        </button>
      )}

      {picker && (
        <ExercisePicker items={lib.items} loading={lib.loading} err={lib.err} onPick={addEx} onClose={() => setPicker(false)} />
      )}

      {tplOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setTplOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
              <h3 className="text-base font-bold text-slate-900">Start from a template</h3>
              <button onClick={() => setTplOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[11px] text-slate-500 px-1 pb-1">Adds ready-made exercises with %-of-max, RPE and supersets already prescribed. Loads individualize once each athlete has a max on file.</p>
              {WORKOUT_TEMPLATES.map((tpl) => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)} className="w-full text-left bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">{tpl.name}</div>
                    <div className="text-[10px] font-semibold text-slate-400">{tpl.entries.length} lifts</div>
                  </div>
                  {tpl.supervised && <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Coach-supervised</span>}
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {howTo && <ExerciseModal item={howTo} onClose={() => setHowTo(null)} />}
    </div>
  );
};

export const GymPage = ({ user, myWorkouts, addMyWorkout, updateMyWorkout, deleteMyWorkout, teamWorkouts, addTeamWorkout, updateTeamWorkout, deleteTeamWorkout, customExercises = [], addCustomExercise, updateCustomExercise, deleteCustomExercise, seedLifts, seedTeamWorkouts }) => {
  const isAdmin = user.role === "admin";
  const [view, setView] = useState("library");
  const lib = useExerciseLib();
  const { maxes, openMaxes } = useMaxes();

  // Coach-authored exercises sit at the front of the library, tagged custom so
  // they render their own photos + get edit/delete. They still group by the
  // same equipment/muscle fields as the public DB.
  const mergedLib = useMemo(() => ({
    items: [...customExercises.map((c) => ({ ...c, custom: true })), ...lib.items],
    loading: lib.loading,
    err: lib.err,
  }), [customExercises, lib.items, lib.loading, lib.err]);

  const subtabs = [
    ["library", "Library"],
    ["mine", "My Workouts"],
    ["team", "Team Workouts"],
  ];

  return (
    <div className="pt-3 pb-4 space-y-4">
      <div className="px-5">
        <div className="bg-white rounded-full p-1 flex border border-slate-100 shadow-sm">
          {subtabs.map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)} className={`flex-1 text-[11px] font-semibold py-2 rounded-full ${view === k ? "text-white" : "text-slate-500"}`} style={view === k ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-slate-500 mt-2 px-1">Pre-Practice Prehab — bands only, ~12 min before every practice and at home. Your school lifting (2×/week) is separate.</p>
        <button type="button" onClick={() => openMaxes()} className="mt-2 w-full h-11 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-2">
          <Dumbbell className="w-4 h-4" style={{ color: COLORS.primary }} /> My maxes{Object.keys(maxes).length ? ` (${Object.keys(maxes).length})` : ""}
        </button>
      </div>

      {view === "library" && <ExerciseLibrary items={mergedLib.items} loading={mergedLib.loading} err={mergedLib.err} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} canEdit={isAdmin} uid={user.uid} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} />}
      {view === "mine" && (
        <WorkoutsView
          workouts={myWorkouts}
          canEdit
          add={addMyWorkout}
          update={updateMyWorkout}
          del={deleteMyWorkout}
          lib={mergedLib}
        />
      )}
      {view === "team" && (
        <WorkoutsView
          workouts={teamWorkouts}
          canEdit={isAdmin}
          add={addTeamWorkout}
          update={updateTeamWorkout}
          del={deleteTeamWorkout}
          lib={mergedLib}
          readOnlyLabel="Published by your coach"
          seedWorkouts={isAdmin ? seedTeamWorkouts : null}
          groupByArea
        />
      )}
    </div>
  );
};

export const ExerciseModal = ({ item, onClose, myWorkouts = [], addMyWorkout, updateMyWorkout, canEdit = false, onEdit, onDelete }) => {
  // Custom exercises store full Storage URLs (often several); public-DB ones
  // store a single relative path resolved through the CDN.
  const customPhotos = item.custom ? (item.images || []) : [];
  const img = item.custom ? (item.images?.[0] || null) : exerciseImageUrl(item.images?.[0]);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");

  const addToExisting = async (w) => {
    setMsg("");
    try {
      const exercises = [...(w.exercises || []), {
        exerciseId: item.id, name: item.name, equipment: item.equipment || "",
        sets: "3", reps: "10", weight: "", notes: "",
      }];
      await updateMyWorkout(w.id, { exercises });
      setMsg(`Added to "${w.name}".`);
      setPicking(false);
    } catch (e) { setMsg("Couldn't add — " + (e.message || "")); }
  };
  const addToNew = async () => {
    if (!newName.trim()) return;
    setMsg("");
    try {
      const ref = await addMyWorkout(newName);
      // Newly created workout has no exercises yet; append this one.
      await updateMyWorkout(ref.id, {
        exercises: [{
          exerciseId: item.id, name: item.name, equipment: item.equipment || "",
          sets: "3", reps: "10", weight: "", notes: "",
        }],
      });
      setMsg(`Created "${newName.trim()}" and added.`);
      setNewName(""); setCreating(false); setPicking(false);
    } catch (e) { setMsg("Couldn't create — " + (e.message || "")); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{titleCase(item.equipment)}</span>
              {item.custom && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>Team</span>}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{item.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {item.custom && canEdit && onEdit && <button onClick={() => onEdit(item)} title="Edit" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700"><Pencil className="w-4 h-4" /></button>}
            {item.custom && canEdit && onDelete && <button onClick={async () => { if (confirm(`Delete "${item.name}"?`)) { try { await onDelete(item.id); onClose(); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} title="Delete" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {customPhotos.length > 0 ? (
            <PhotoCarousel photos={customPhotos} />
          ) : img ? (
            <div className="aspect-video rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center">
              <img src={img} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
            </div>
          ) : (
            <div className="aspect-video rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs">No image</div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            {item.primaryMuscles?.length > 0 && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Primary</div><div className="font-semibold text-slate-900 mt-1">{item.primaryMuscles.map(titleCase).join(", ")}</div></div>
            )}
            {item.secondaryMuscles?.length > 0 && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Secondary</div><div className="font-semibold text-slate-900 mt-1">{item.secondaryMuscles.map(titleCase).join(", ")}</div></div>
            )}
            {item.mechanic && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Mechanic</div><div className="font-semibold text-slate-900 mt-1">{titleCase(item.mechanic)}</div></div>
            )}
            {item.level && (
              <div><div className="text-slate-400 uppercase font-bold tracking-wider">Level</div><div className="font-semibold text-slate-900 mt-1">{titleCase(item.level)}</div></div>
            )}
          </div>

          {item.instructions?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">How to do it</h4>
              <ol className="space-y-2">
                {item.instructions.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white mt-0.5" style={{ backgroundColor: COLORS.primary }}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Add to workout */}
          {updateMyWorkout && (
            <div className="pt-2 border-t border-slate-100">
              {!picking ? (
                <button onClick={() => setPicking(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
                  <Plus className="w-3.5 h-3.5" /> Add to Workout
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Add to…</span>
                    <button onClick={() => { setPicking(false); setCreating(false); setMsg(""); }} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                  {!creating ? (
                    <>
                      {myWorkouts.length > 0 && (
                        <ul className="space-y-1">
                          {myWorkouts.map((w) => (
                            <li key={w.id}>
                              <button onClick={() => addToExisting(w)} className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2 flex items-center justify-between text-left">
                                <span className="text-xs font-semibold text-slate-900 truncate">{w.name}</span>
                                <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">{w.exercises?.length || 0} ex</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button onClick={() => setCreating(true)} className="w-full bg-white border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                        <Plus className="w-3.5 h-3.5" /> New Workout
                      </button>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addToNew()} placeholder="Workout name (e.g. Pull Day)" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                      <button onClick={addToNew} className="px-3 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Create</button>
                    </div>
                  )}
                  {msg && <p className="text-[10px] font-semibold px-1" style={{ color: msg.startsWith("Added") || msg.startsWith("Created") ? COLORS.success : "#dc2626" }}>{msg}</p>}
                </div>
              )}
            </div>
          )}

          {!item.custom && (
            <p className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
              Data from <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer" className="underline">Free Exercise DB</a> (public domain).
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
