// Split out of TeamHubRoles.jsx (F81). Area: nutrition.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useMemo, useRef, useState } from "react";
import { Apple, Check, ChevronLeft, ChevronRight, Clock, Droplet, Flame, Pencil, Plus, ScanLine, Star, Trash2, X } from "lucide-react";
import { searchFoods, usdaAvailable } from "../lib/usda";
import { lookupBarcode, searchProducts } from "../lib/openfoodfacts";
import { toast } from "../lib/toast";
import { COLORS, CSV_TEMPLATE, FEELINGS, FEELING_COLOR, WATER_CUPS_GOAL, computeStreak, formatDayKey, formatTime, mealBucket, parseRecipeCSV, reportError } from "./shared";


/* ─── NUTRITION (log presets + custom food + post-meal rating) ─── */
export const HeroBar = ({ value, target, color }) => {
  const pct = Math.min(100, target ? (value / target) * 100 : 0);
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
      <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
};
export const NutritionHero = ({ totals, goal, streak, waterCups, setWaterCups }) => {
  const waterDots = Array.from({ length: WATER_CUPS_GOAL }, (_, i) => i < waterCups);
  return (
    <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, #6E0000)` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Today's Fuel</div>
        {streak > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: "rgba(166,25,46,0.22)", color: COLORS.accent }}>
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totals.cal.toLocaleString()}</span>
              <span className="text-xs opacity-70">{goal?.cal > 0 ? `/ ${goal.cal.toLocaleString()} kcal` : "kcal"}</span>
            </div>
            {goal?.cal > 0 && <span className="text-[10px] font-semibold opacity-70">{Math.round((totals.cal / goal.cal) * 100)}%</span>}
          </div>
          {goal?.cal > 0 && <HeroBar value={totals.cal} target={goal.cal} color={COLORS.accent} />}
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{totals.p}g</span>
              <span className="text-xs opacity-70">{goal?.protein > 0 ? `/ ${goal.protein}g protein` : "protein"}</span>
            </div>
            {goal?.protein > 0 && <span className="text-[10px] font-semibold opacity-70">{Math.round((totals.p / goal.protein) * 100)}%</span>}
          </div>
          {goal?.protein > 0 && <HeroBar value={totals.p} target={goal.protein} color={COLORS.success} />}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">Carbs</div>
            <div className="text-base font-bold">{totals.c}g</div>
          </div>
          <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">Fat</div>
            <div className="text-base font-bold">{totals.f}g</div>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Droplet className="w-4 h-4 flex-shrink-0" style={{ color: "#7DD3FC" }} fill="#7DD3FC" />
          <div className="flex gap-0.5 flex-shrink-0">
            {waterDots.map((on, i) => (
              <div key={i} className="w-2 h-3 rounded-sm" style={{ backgroundColor: on ? "#7DD3FC" : "rgba(255,255,255,0.18)" }} />
            ))}
          </div>
          <span className="text-xs font-semibold ml-2">{waterCups} / {WATER_CUPS_GOAL}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setWaterCups(Math.max(0, waterCups - 1))} disabled={waterCups === 0} aria-label="One less cup" className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-sm font-bold disabled:opacity-30">−</button>
          <button onClick={() => setWaterCups(waterCups + 1)} aria-label="Add a cup" className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: COLORS.accent, color: "#fff" }}>+</button>
        </div>
      </div>
    </div>
  );
};
export const DEFAULT_NUTRITION_CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snacks", "Pre-Game", "Post-Game"];

// Default a freshly logged item to whichever standard meal slot the current
// time falls into. Players can override in the manual form before saving.
export const timeOfDayCategory = () => {
  const h = new Date().getHours();
  if (h < 11) return "Breakfast";
  if (h < 15) return "Lunch";
  if (h < 21) return "Dinner";
  return "Snacks";
};

export const TargetBar = ({ label, value, goal, unit }) => {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1"><span>{label}</span><span>{value}/{goal} {unit}</span></div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? COLORS.success : COLORS.accent }} /></div>
    </div>
  );
};

// The player's OWN daily goal (calories + protein, optional). No coach sets
// it — the player sets it for themselves if they want to, and it lives in
// their private food-log area (logs/{uid}/goals/main). The hero bars and the
// Today checklist show progress against this goal when one is set.
export const MyNutritionGoalSection = ({ goal, totals = { cal: 0, protein: 0 }, onSave, onClear }) => {
  const [open, setOpen] = useState(false);
  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [busy, setBusy] = useState(false);
  const hasGoal = goal && (goal.cal > 0 || goal.protein > 0);

  const startEdit = () => {
    setCal(goal?.cal ? String(goal.cal) : "");
    setProtein(goal?.protein ? String(goal.protein) : "");
    setOpen(true);
  };
  const save = async () => {
    if (!cal && !protein) return;
    setBusy(true);
    try {
      await onSave({ cal, protein });
      setOpen(false);
    } catch (e) {
      toast("Couldn't save goal — " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!confirm("Clear your daily goal?")) return;
    try { await onClear(); setOpen(false); } catch (e) { toast("Couldn't clear — " + (e.message || "")); }
  };

  return (
    <div className="px-5">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">My daily goal</h3>
          {hasGoal && !open && (
            <div className="flex gap-1.5">
              <button onClick={startEdit} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Edit</button>
              <button onClick={clear} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Clear</button>
            </div>
          )}
        </div>
        {hasGoal && !open ? (
          <div className="space-y-2">
            {goal.cal > 0 && <TargetBar label="Calories" value={totals.cal} goal={goal.cal} unit="kcal" />}
            {goal.protein > 0 && <TargetBar label="Protein" value={totals.protein} goal={goal.protein} unit="g" />}
            <p className="text-[10px] text-slate-400">Your goal is just for you — coaches don't set it.</p>
          </div>
        ) : open ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={cal} onChange={(e) => setCal(e.target.value)} placeholder="Calories" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Protein g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || (!cal && !protein)} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save goal"}</button>
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full text-xs font-bold bg-slate-100 text-slate-600">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500">No goal set — totally optional. Set your own daily calories and protein if you want something to aim at.</p>
            <button onClick={startEdit} className="mt-2 w-full py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Set my goal</button>
          </div>
        )}
      </div>
    </div>
  );
};


export const NutritionPage = ({ user, recipes, addRecipe, updateRecipe, deleteRecipe, importRecipes, seedRecipes, categories, addCategory, logged, addLog, updateLog, deleteLog, waterCups, setWaterCups, myNutritionGoal, myNutritionTotals, saveMyNutritionGoal, clearMyNutritionGoal, savedFoods = [], addSavedFood, deleteSavedFood }) => {
  const isAdmin = user.role === "admin";
  // Union of premade defaults + admin's custom categories. Defaults are
  // always available so the UI is never empty and players have a sane set
  // to file food into on day one.
  const effectiveCategories = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...DEFAULT_NUTRITION_CATEGORIES, ...categories].forEach((c) => {
      if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    });
    return out;
  }, [categories]);
  const [catPref, setCat] = useState(effectiveCategories[0] || "Breakfast");
  const cat = effectiveCategories.includes(catPref) ? catPref : (effectiveCategories[0] || catPref);
  const [sub, setSub] = useState(null);
  // Food-type sub-category filter within the active meal category (e.g. Lunch →
  // "Fish & Seafood"). null = "All". A stale pick (from another category) simply
  // resolves back to "All" via `activeSub` below — no reset effect needed.
  const [subCat, setSubCat] = useState(null);
  const [manual, setManual] = useState({ name: "", cat: timeOfDayCategory(), cal: "", p: "", c: "", f: "" });
  const [showManual, setShowManual] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  // Status note for the log form (barcode lookups) — shown as a banner above
  // the manual entry fields. (Food photo AI was removed — no photo flow.)
  const [formState, setFormState] = useState("idle"); // idle | uploading | done | error
  const [formNote, setFormNote] = useState("");
  // Barcode scanner — html5-qrcode + Open Food Facts lookup.
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleBarcode = async (code) => {
    setScannerOpen(false);
    setShowManual(true);
    setFormState("uploading");
    setFormNote(`Looking up ${code}…`);
    try {
      const data = await lookupBarcode(code);
      applyPer100(data.name || `Product ${code}`, data);
      setFormNote(`Open Food Facts · values per 100g — set the amount you ate below.`);
      setFormState("done");
    } catch (e) {
      setFormState("error");
      setFormNote(e.message || "Barcode lookup failed");
    }
  };

  const searchQuery = showManual ? manual.name.trim() : "";
  const searchActive = searchQuery.length >= 2;
  useEffect(() => {
    if (!searchActive) return;
    const q = searchQuery;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      // Open Food Facts (packaged foods, instant) and USDA (whole foods, via
      // a server function — a second or two) run at once. Results show as
      // each source answers, USDA first in the list, de-duped by name.
      const bySource = { usda: [], off: [] };
      const errors = [];
      const show = () => {
        const merged = [];
        const seen = new Set();
        [...bySource.usda, ...bySource.off].forEach((r) => {
          const key = (r.name || "").toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          merged.push(r);
        });
        setSearchResults(merged.slice(0, 16));
      };
      const run = (src, p) => p.then((rows) => { if (!ctl.signal.aborted) { bySource[src] = rows || []; show(); } })
        .catch((e) => { if (e?.name !== "AbortError") errors.push(e); });
      const tasks = [run("off", searchProducts(q, ctl.signal))];
      if (usdaAvailable()) tasks.push(run("usda", searchFoods(q, ctl.signal)));
      await Promise.all(tasks);
      if (ctl.signal.aborted) return;
      setSearchErr(!bySource.usda.length && !bySource.off.length && errors.length ? (errors[0]?.message || "search failed") : "");
      setSearching(false);
    }, 300);
    return () => { clearTimeout(timer); ctl.abort(); setSearching(false); };
  }, [searchQuery, searchActive]);
  // Search and barcode results are per 100 g. Keep the base values and let
  // the player enter the amount they actually ate; macros scale from it.
  const [per100, setPer100] = useState(null); // { cal, p, c, f } | null
  const [grams, setGrams] = useState("100");
  const scaled = (base, g) => {
    const k = (Number(g) || 0) / 100;
    return {
      cal: String(Math.round((Number(base.cal) || 0) * k)),
      p: String(Math.round((Number(base.p) || 0) * k)),
      c: String(Math.round((Number(base.c) || 0) * k)),
      f: String(Math.round((Number(base.f) || 0) * k)),
    };
  };
  const applyPer100 = (name, base) => {
    setPer100(base);
    setGrams("100");
    setManual((m) => ({ ...m, name, ...scaled(base, 100) }));
  };
  const changeGrams = (g) => {
    setGrams(g);
    if (per100) setManual((m) => ({ ...m, ...scaled(per100, g) }));
  };
  const pickFood = (r) => {
    applyPer100(r.name, r);
    setSearchResults([]);
  };
  // admin recipe management
  const [mode, setMode] = useState("single");
  const [single, setSingle] = useState({ name: "", cat: categories[0] || "Breakfast", sub: "", cal: "", p: "", c: "", f: "", prep: "", ingredients: "" });
  const [seeding, setSeeding] = useState(false);
  const runSeedRecipes = async () => {
    if (!seedRecipes || seeding) return;
    setSeeding(true);
    setImportMsg("");
    try {
      const { added, skipped } = await seedRecipes();
      setImportMsg(added ? `Added ${added} starter recipe${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.` : "All starter recipes are already added.");
    } catch (e) {
      setImportMsg("Couldn't add starter recipes — " + (e.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [newCat, setNewCat] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const inCat = recipes.filter((m) => m.cat === cat);
  // Food-type sub-categories present in this meal category (recipes without a
  // `sub` fall under "Other" so nothing is hidden). Only shown when there's more
  // than one, so simple libraries stay clean.
  const subCats = useMemo(() => {
    const seen = [];
    inCat.forEach((m) => { const s = m.sub || "Other"; if (!seen.includes(s)) seen.push(s); });
    return seen;
  }, [inCat]);
  // A sub pick only applies if it exists in the current category, so switching
  // meal categories cleanly falls back to "All" without a reset effect.
  const activeSub = subCat && subCats.includes(subCat) ? subCat : null;
  const filtered = activeSub ? inCat.filter((m) => (m.sub || "Other") === activeSub) : inCat;
  const todayKey = formatDayKey(new Date());
  const todayLogs = logged.filter((l) => formatDayKey(l.createdAt) === todayKey);
  const totals = todayLogs.reduce((a, l) => ({ cal: a.cal + (l.cal || 0), p: a.p + (l.p || 0), c: a.c + (l.c || 0), f: a.f + (l.f || 0) }), { cal: 0, p: 0, c: 0, f: 0 });
  const streak = computeStreak(logged);
  // Group today's log by the categorical bucket the user (or recipe) picked
  // when logging. Falls back to the time-of-day bucket for older entries
  // that pre-date the `cat` field, so existing data isn't orphaned.
  const todayByCat = useMemo(() => {
    const map = {};
    todayLogs.forEach((l) => {
      const c = l.cat || mealBucket(l.createdAt) || "Other";
      (map[c] = map[c] || []).push(l);
    });
    return map;
  }, [todayLogs]);
  const catOrder = useMemo(() => {
    const present = Object.keys(todayByCat);
    const known = effectiveCategories.filter((c) => present.includes(c));
    const extras = present.filter((c) => !effectiveCategories.includes(c));
    return [...known, ...extras];
  }, [todayByCat, effectiveCategories]);

  const nowTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const log = (m) => addLog({ name: m.name, cat: m.cat || timeOfDayCategory(), cal: m.cal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0, time: nowTime(), feeling: null }).catch((e) => toast("Couldn't log — " + e.message));

  // Quick-add: one-tap re-log a saved or recent food.
  const quickLog = async (m) => {
    try { await addLog({ name: m.name, cat: timeOfDayCategory(), cal: Number(m.cal) || 0, p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0, time: nowTime(), feeling: null }); toast(`Logged ${m.name}`); }
    catch (e) { toast("Couldn't log — " + (e.message || "")); }
  };
  // Load a food into the manual form so the portion can be tweaked before logging.
  const fillFromFood = (m) => {
    setManual({ name: m.name || "", cat: manual.cat || timeOfDayCategory(), cal: m.cal != null ? String(m.cal) : "", p: m.p != null ? String(m.p) : "", c: m.c != null ? String(m.c) : "", f: m.f != null ? String(m.f) : "" });
    setSearchResults([]);
    setShowManual(true);
  };
  const isSaved = (name) => (savedFoods || []).some((s) => (s.name || "").toLowerCase() === (name || "").toLowerCase());
  const saveFood = async (m) => {
    const name = (m.name || "").trim();
    if (!name || !addSavedFood) return;
    if (isSaved(name)) { toast(`${name} is already saved`); return; }
    try { await addSavedFood({ name, cal: Number(m.cal) || 0, p: Number(m.p) || 0, c: Number(m.c) || 0, f: Number(m.f) || 0 }); toast(`Saved ${name}`); }
    catch (e) { toast("Couldn't save — " + (e.message || "")); }
  };
  // Recent distinct foods from the log (most-recent first), for quick re-logging.
  const recentFoods = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const l of logged || []) {
      const key = (l.name || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: l.name, cal: l.cal || 0, p: l.p || 0, c: l.c || 0, f: l.f || 0 });
      if (out.length >= 12) break;
    }
    return out;
  }, [logged]);
  const addManual = async () => {
    if (!manual.name.trim()) return;
    try {
      await addLog({
        name: manual.name.trim(),
        cat: manual.cat || timeOfDayCategory(),
        cal: Number(manual.cal) || 0,
        p: Number(manual.p) || 0,
        c: Number(manual.c) || 0,
        f: Number(manual.f) || 0,
        time: nowTime(),
        feeling: null,
        custom: true,
      });
      setManual({ name: "", cat: timeOfDayCategory(), cal: "", p: "", c: "", f: "" });
      setPer100(null);
      setGrams("100");
      setSearchResults([]);
      setFormState("idle");
      setFormNote("");
      setShowManual(false);
    } catch (e) {
      toast("Couldn't add — " + e.message);
    }
  };
  const rate = (logId, feeling) => updateLog(logId, { feeling }).catch(reportError("Couldn't save the rating"));
  const removeLog = (logId) => deleteLog(logId).catch(reportError("Couldn't remove the entry"));

  const addSingle = async () => {
    if (!single.name.trim()) return;
    const name = single.name.trim();
    const targetCat = single.cat || "Other";
    try {
      if (targetCat && !categories.includes(targetCat)) await addCategory(targetCat);
      const data = {
        name, cat: targetCat,
        sub: (single.sub || "").trim(),
        cal: Number(single.cal) || 0,
        p: Number(single.p) || 0,
        c: Number(single.c) || 0,
        f: Number(single.f) || 0,
        prep: single.prep || "—",
        ingredients: single.ingredients.split(",").map((x) => x.trim()).filter(Boolean),
      };
      if (editingRecipeId) {
        await updateRecipe(editingRecipeId, data);
        setImportMsg(`Updated "${name}".`);
        setEditingRecipeId(null);
      } else {
        await addRecipe(data);
        setImportMsg(`Added "${name}" to ${targetCat}.`);
      }
      setSingle({ name: "", cat: targetCat, sub: single.sub, cal: "", p: "", c: "", f: "", prep: "", ingredients: "" });
    } catch (e) {
      setImportMsg("Couldn't save recipe — " + (e.message || "check Firestore rules."));
    }
  };
  const startEditRecipe = (r) => {
    setEditingRecipeId(r.id);
    setSingle({
      name: r.name || "",
      cat: r.cat || categories[0] || "Breakfast",
      sub: r.sub || "",
      cal: String(r.cal || ""),
      p: String(r.p || ""),
      c: String(r.c || ""),
      f: String(r.f || ""),
      prep: r.prep || "",
      ingredients: (r.ingredients || []).join(", "),
    });
    setSub("manage");
    setMode("single");
    setImportMsg("");
  };
  const removeRecipe = (id) => {
    if (!confirm("Delete this recipe?")) return;
    deleteRecipe(id).catch((e) => toast("Couldn't delete — " + e.message));
  };
  const submitCategory = async () => {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    try {
      await addCategory(c);
      setImportMsg(`Added category "${c}".`);
      setNewCat("");
    } catch (e) {
      setImportMsg("Couldn't add category — " + (e.message || "check Firestore rules."));
    }
  };
  const doImport = async () => {
    const parsed = parseRecipeCSV(csvText);
    if (!parsed.length) { setImportMsg("No valid rows found — check the format."); return; }
    const newCats = [...new Set(parsed.map((r) => r.cat))].filter((c) => c && !categories.includes(c));
    try {
      for (const c of newCats) await addCategory(c);
      await importRecipes(parsed);
      setImportMsg(`Imported ${parsed.length} recipe${parsed.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new categor${newCats.length === 1 ? "y" : "ies"}` : ""}.`);
      setCsvText("");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check Firestore rules."));
    }
  };

  if (sub === "manage") {
    return (
      <div className="px-5 pt-5 pb-4 space-y-5">
        <button onClick={() => { setSub(null); setImportMsg(""); }} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back to Nutrition</button>
        <div><h2 className="text-xl font-bold text-slate-900">Manage Recipes</h2><p className="text-xs text-slate-500 mt-0.5">{recipes.length} recipes · {categories.length} categories</p></div>

        <div className="bg-white rounded-full p-1 flex border border-slate-100 shadow-sm">
          {[["single", "Add One"], ["sheet", "From Sheet"], ["category", "Category"]].map(([id, lbl]) => (
            <button key={id} onClick={() => { setMode(id); setImportMsg(""); }} className={`flex-1 text-xs font-semibold py-2 rounded-full ${mode === id ? "text-white" : "text-slate-500"}`} style={mode === id ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
          ))}
        </div>

        {importMsg && <div className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Check className="w-3.5 h-3.5" />{importMsg}</div>}

        {seedRecipes && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Apple className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900">Add starter recipes</div>
              <div className="text-[10px] text-slate-500">132 recipes across every meal, by food type — including simple school-lunch picks (5 ingredients or less). Skips ones you already have.</div>
            </div>
            <button onClick={runSeedRecipes} disabled={seeding} className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-full text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{seeding ? "Adding…" : "Add"}</button>
          </div>
        )}

        {mode === "single" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            <input value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} placeholder="Recipe name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="grid grid-cols-2 gap-2">
              <select value={single.cat} onChange={(e) => setSingle({ ...single, cat: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">{effectiveCategories.map((c) => <option key={c}>{c}</option>)}</select>
              <input list="recipe-subs" value={single.sub} onChange={(e) => setSingle({ ...single, sub: e.target.value })} placeholder="Food type (e.g. Poultry)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <datalist id="recipe-subs">{[...new Set(recipes.map((r) => r.sub).filter(Boolean))].map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[["cal", "Cal"], ["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]].map(([k, lbl]) => (
                <input key={k} type="number" value={single[k]} onChange={(e) => setSingle({ ...single, [k]: e.target.value })} placeholder={lbl} className="border border-slate-200 rounded-lg px-2 py-2 text-xs text-center focus:outline-none focus:ring-2 focus:ring-slate-200" />
              ))}
            </div>
            <input value={single.prep} onChange={(e) => setSingle({ ...single, prep: e.target.value })} placeholder="Prep time (e.g. 15 min)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <input value={single.ingredients} onChange={(e) => setSingle({ ...single, ingredients: e.target.value })} placeholder="Main ingredients, comma-separated (e.g. chicken, rice, beans)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={addSingle} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>{editingRecipeId ? "Save Changes" : "Add Recipe"}</button>
            {editingRecipeId && (
              <button onClick={() => { setEditingRecipeId(null); setSingle({ name: "", cat: single.cat, sub: "", cal: "", p: "", c: "", f: "", prep: "", ingredients: "" }); setImportMsg(""); }} className="w-full mt-1 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100">Cancel Edit</button>
            )}
          </div>
        )}

        {mode === "sheet" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600">Paste rows from a spreadsheet, or upload a .csv</div>
              <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6} placeholder={CSV_TEMPLATE} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <div className="flex gap-2">
                <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer">
                  Upload CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result)); r.readAsText(f); }} />
                </label>
                <button onClick={() => setCsvText(CSV_TEMPLATE)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Fill Example</button>
              </div>
              <button onClick={doImport} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Import Recipes</button>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed px-1">Columns: name, category, calories, protein, carbs, fat, prep. New categories are created automatically. The header row is optional.</p>
          </div>
        )}

        {mode === "category" && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitCategory()} placeholder="New category (e.g. Pre-Game)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button onClick={submitCategory} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Add Category</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">{c}</span>)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sub === "log") {
    return (
      <div className="px-5 pt-5 pb-4 space-y-5">
        <button onClick={() => setSub(null)} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back to Meals</button>
        <NutritionHero totals={totals} goal={myNutritionGoal} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />

        <button onClick={() => setShowManual(!showManual)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: COLORS.primary }}>
          <Plus className="w-3.5 h-3.5" /> Log Something
        </button>
        <button onClick={() => setScannerOpen(true)} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>
          <ScanLine className="w-3.5 h-3.5" /> Scan a Barcode
        </button>
        {scannerOpen && <BarcodeScannerModal onClose={() => setScannerOpen(false)} onScan={handleBarcode} />}

        {/* Quick add — one tap re-logs a saved or recent food. */}
        {(savedFoods.length > 0 || recentFoods.length > 0) && (
          <div className="space-y-3">
            {savedFoods.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1 flex items-center gap-1"><Star className="w-3 h-3" style={{ color: COLORS.accent }} /> Saved foods</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedFoods.map((s) => (
                    <div key={s.id} className="flex items-center rounded-full border overflow-hidden bg-white" style={{ borderColor: COLORS.border }}>
                      <button onClick={() => quickLog(s)} title={`Log ${s.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-slate-800">{s.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">{s.cal} cal</span>
                      </button>
                      <button onClick={() => fillFromFood(s)} title="Edit portion" className="px-1.5 py-1.5 text-slate-300 hover:text-slate-600 border-l" style={{ borderColor: COLORS.border }}><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => { if (confirm(`Remove "${s.name}" from saved foods?`)) Promise.resolve(deleteSavedFood(s.id)).catch(reportError("Couldn't remove it")); }} title="Remove from saved" className="px-2 py-1.5 text-slate-300 hover:text-red-500 border-l" style={{ borderColor: COLORS.border }}><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentFoods.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentFoods.map((r, i) => (
                    <div key={i} className="flex items-center rounded-full border overflow-hidden bg-white" style={{ borderColor: COLORS.border }}>
                      <button onClick={() => quickLog(r)} title={`Log ${r.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-slate-800">{r.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">{r.cal} cal</span>
                      </button>
                      <button onClick={() => saveFood(r)} title={isSaved(r.name) ? "Saved" : "Save to favorites"} className="px-2 py-1.5 border-l" style={{ borderColor: COLORS.border, color: isSaved(r.name) ? COLORS.accent : "#cbd5e1" }}><Star className="w-3 h-3" fill={isSaved(r.name) ? COLORS.accent : "none"} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {showManual && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
            {formState !== "idle" && (
              <div className="rounded-lg px-3 py-2 text-[11px] font-semibold flex items-start gap-2" style={{
                backgroundColor: formState === "error" ? "#FEE2E2" : formState === "done" ? COLORS.accentSoft : "#E0F2FE",
                color: formState === "error" ? "#991B1B" : formState === "done" ? COLORS.primary : "#075985",
              }}>
                {formState === "uploading" && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />}
                {formState === "done" && <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                {formState === "error" && <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span className="leading-snug">{formNote}</span>
                {formState !== "uploading" && (
                  <button onClick={() => { setFormState("idle"); setFormNote(""); }} className="ml-auto opacity-60 hover:opacity-100 flex-shrink-0" aria-label="Dismiss"><X className="w-3 h-3" /></button>
                )}
              </div>
            )}
            <div className="relative">
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Search foods or type your own…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              {searching && searchActive && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-semibold">searching…</span>}
            </div>
            {searchErr && <p className="text-[10px] text-red-500 font-medium px-1">{searchErr}</p>}
            {searchActive && searchResults.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-200">
                {searchResults.map((r) => (
                  <li key={r.fdcId || r.barcode || r.name}>
                    <button type="button" onClick={() => pickFood(r)} className="w-full text-left px-3 py-2 hover:bg-white">
                      <div className="text-xs font-semibold text-slate-900 leading-tight">{r.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{r.cal} kcal · P {r.p}g · C {r.c}g · F {r.f}g <span className="text-slate-400">(per 100g)</span></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <select value={manual.cat} onChange={(e) => setManual({ ...manual, cat: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {effectiveCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
            {per100 && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold">Amount eaten</span>
                <input type="number" min="0" value={grams} onChange={(e) => changeGrams(e.target.value)} className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                <span>g</span>
                <span className="text-[10px] text-slate-400">(values scale from per-100 g)</span>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.cal} onChange={(e) => setManual({ ...manual, cal: e.target.value })} placeholder="Calories" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.p} onChange={(e) => setManual({ ...manual, p: e.target.value })} placeholder="Protein g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="grid grid-cols-2 gap-2"><input type="number" value={manual.c} onChange={(e) => setManual({ ...manual, c: e.target.value })} placeholder="Carbs g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /><input type="number" value={manual.f} onChange={(e) => setManual({ ...manual, f: e.target.value })} placeholder="Fat g" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            <div className="flex gap-2">
              <button onClick={() => saveFood(manual)} disabled={!manual.name.trim()} title="Save to favorites" className="px-4 py-2 rounded-full text-xs font-bold border-2 bg-white flex items-center gap-1.5 disabled:opacity-40" style={{ borderColor: COLORS.primary, color: COLORS.primary }}><Star className="w-3.5 h-3.5" fill={isSaved(manual.name) ? COLORS.primary : "none"} /> Save</button>
              <button onClick={addManual} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Add to Log</button>
            </div>

          </div>
        )}

        <div>
          <h3 className="font-bold text-sm text-slate-900 mb-2 px-1">Today's Log</h3>
          {todayLogs.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-8 bg-white rounded-2xl shadow-sm border border-slate-100">Nothing logged yet today.</p>
          ) : (
            <div className="space-y-3">
              {catOrder.map((bucket) => (
                <div key={bucket}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 px-1 mb-1.5">{bucket}</div>
                  <ul className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {todayByCat[bucket].map((l, i, arr) => (
                      <li key={l.id} className={`px-4 py-3 ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft }}><Flame className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">{l.name}{l.custom && <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Custom</span>}</div>
                            <div className="text-[10px] text-slate-500">{l.time || formatTime(l.createdAt)} · {l.cal} kcal · P{l.p}</div>
                          </div>
                          <button onClick={() => removeLog(l.id)} aria-label={`Remove ${l.name}`} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="mt-2 pl-12">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">How did you feel after?</div>
                          <div className="flex gap-1.5">
                            {FEELINGS.map((f) => (
                              <button key={f} onClick={() => rate(l.id, f)} className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all" style={l.feeling === f ? { backgroundColor: FEELING_COLOR[f], color: "white", borderColor: FEELING_COLOR[f] } : { color: COLORS.textSecondary, borderColor: COLORS.border }}>{f}</button>
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-5 pb-4 space-y-5">
      {/* Today's totals up front — calories, protein, carbs, fat, water — with
          progress against the player's OWN goal when they set one. */}
      <div className="px-5">
        <NutritionHero totals={totals} goal={myNutritionGoal} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />
      </div>
      <MyNutritionGoalSection goal={myNutritionGoal} totals={myNutritionTotals} onSave={saveMyNutritionGoal} onClear={clearMyNutritionGoal} />
      <div className="px-5 space-y-2">
        <button onClick={() => setSub("log")} className="w-full py-3 rounded-full text-sm font-bold uppercase tracking-wider text-white flex items-center justify-center gap-2 shadow-sm" style={{ backgroundColor: COLORS.primary }}>
          <Plus className="w-4 h-4" /> Log Food · {todayLogs.length} logged today
        </button>
        {isAdmin && (
          <button onClick={() => setSub("manage")} className="w-full bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.accentSoft }}><Plus className="w-4 h-4" style={{ color: COLORS.accent }} /></div>
            <div className="text-left flex-1"><div className="text-xs font-bold text-slate-900">Manage Recipes</div><div className="text-[10px] text-slate-500">Add recipes & categories, or import a sheet</div></div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>
      <div className="px-5 flex gap-2 overflow-x-auto">
        {effectiveCategories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
        ))}
      </div>
      {subCats.length > 1 && (
        <div className="px-5 flex gap-1.5 overflow-x-auto">
          <button onClick={() => setSubCat(null)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${activeSub === null ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200"}`} style={activeSub === null ? { backgroundColor: COLORS.accent } : {}}>All</button>
          {subCats.map((s) => (
            <button key={s} onClick={() => setSubCat(s)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${activeSub === s ? "text-white border-transparent" : "bg-white text-slate-500 border-slate-200"}`} style={activeSub === s ? { backgroundColor: COLORS.accent } : {}}>{s}</button>
          ))}
        </div>
      )}
      <div className="px-5 space-y-2.5">
        {filtered.length === 0 && <p className="text-sm text-slate-400 italic text-center py-8 bg-white rounded-2xl shadow-sm border border-slate-100">No recipes here yet.</p>}
        {filtered.map((m) => (
          <article key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-900">{m.name}</h4>
                {m.sub && <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{m.sub}</span>}
                {m.ingredients && m.ingredients.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">{m.ingredients.join(" · ")}</div>
                )}
                <div className="flex items-center gap-3 mt-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{m.prep}</span><span className="flex items-center gap-1"><Flame className="w-3 h-3" />{m.cal} kcal</span><span>P {m.p}g</span><span>C {m.c}g</span><span>F {m.f}g</span></div>
              </div>
              {!isAdmin ? (
                <button onClick={() => log(m)} className="flex-shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>Log</button>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => startEditRecipe(m)} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeRecipe(m.id)} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

/* ─── BARCODE SCANNER MODAL ─── */
export const BarcodeScannerModal = ({ onClose, onScan }) => {
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });

  useEffect(() => {
    let cancelled = false;
    let scanner = null;
    (async () => {
      try {
        // Loaded on demand — keeps the scanner library out of the main bundle.
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode("brophy-barcode-scanner", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          // Never use the browser's native BarcodeDetector: Safari on iPhone
          // does not support it, which is why the old scanner always failed
          // there. The library's own decoder works wherever getUserMedia does.
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10 },
          (decodedText) => {
            if (cancelled) return;
            cancelled = true;
            onScanRef.current(decodedText);
          },
          () => { /* per-frame misses are normal */ }
        );
        if (cancelled) {
          // Unmounted while the camera was starting: release it.
          scanner.stop().catch(() => {});
          return;
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr("Couldn't access camera - " + (e?.message || e || "permission denied?"));
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      scanner = null;
      if (s) {
        // stop() throws when the camera never started; clear() frees the view.
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* already cleared */ } });
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><ScanLine className="w-4 h-4" style={{ color: COLORS.primary }} /> Scan a barcode</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="aspect-video bg-slate-900 relative">
          {err ? (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm px-6 text-center">{err}</div>
          ) : (
            <>
              <div id="brophy-barcode-scanner" className="w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 h-20 border-2 rounded-lg" style={{ borderColor: COLORS.accent, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }} />
              </div>
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs">Starting camera…</div>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-slate-500 text-center py-3 px-4">Center a barcode in the box. It scans automatically.</p>
      </div>
    </div>
  );
};
