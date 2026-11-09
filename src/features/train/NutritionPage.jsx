// NutritionPage — three views: recipe library, admin manage, food logging.
//
// - Recipe doc: { name, cat, sub, cal, p, c, f, prep } (+createdAt).
//   Categories = DEFAULT list ∪ admin `categories` collection (deduped union);
//   sub filter pills derived client-side; 120-seed import with dedupe;
//   CSV import auto-creates unknown categories.
// - NutritionHero: "Today's Fuel" — kcal + protein ui ProgressBars, streak pill
//   (computeStreak, 365-day lookback), water stepper (team.targets.water).
// - Food logging: manual form with 300ms-debounced USDA/OpenFoodFacts auto-fill,
//   per-100g picks; BarcodeScannerModal (rear camera + BarcodeDetector +
//   OpenFoodFacts lookup, graceful fallback); AI photo logging (capture →
//   lib/images downscale → POST /api/food-photo → prefill + review disclaimer).
// - Food entries (logs/{uid}/entries): { name, cat, cal, p, c, f, time,
//   feeling, custom? }; grouped by meal bucket; FEELINGS rating; savedFoods
//   favorites (case-insensitive dedupe); recent-12 one-tap re-log;
//   mealLogActivity/{uid}_{date} bump happens in the addLog hook (coach
//   compliance).
// - nutritionTargets { cal, protein, visibleTo }: coach composer
//   (Everyone/Specific + group chips + player checklist); players see a
//   "Today's target" card with TargetBars vs live totals.
// (react-refresh/only-export-components is disabled project-wide in
// eslint.config.js: page modules intentionally export pure helpers too.)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  UtensilsCrossed,
  Settings2,
  Flame,
  Droplets,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Clock,
  Star,
  ScanLine,
  Camera,
  Apple,
  ChevronRight,
  Minus,
} from "lucide-react";
import Tabs from "../../components/ui/Tabs";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Sheet from "../../components/ui/Sheet";
import Btn from "../../components/ui/Btn";
import Field, { Input, Select } from "../../components/ui/Field";
import CsvImporter from "../../components/ui/CsvImporter";
import EmptyState from "../../components/ui/EmptyState";
import ProgressBar from "../../components/ui/ProgressBar";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { toast } from "../../lib/toast";
import { parseCsv } from "../../lib/csv";
import { todayKey, formatDayKey, formatTime } from "../../lib/dates";
import { hasUsdaKey, searchFoods } from "../../lib/usda";
import { searchProducts, lookupBarcode } from "../../lib/openfoodfacts";
import { downscaleImage } from "../../lib/images";
import { visibleToText } from "../../lib/audience";
import { useTheme } from "../../theme/ThemeProvider";
import {
  useTrainRecipes,
  useFoodLog,
  useSavedFoods,
  useWater,
  useNutritionTargets,
} from "./hooks";

export const DEFAULT_NUTRITION_CATEGORIES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "Pre-Game",
  "Post-Game",
];

const FEELINGS = ["Sluggish", "OK", "Good", "Energized"];
const FEELING_COLOR = {
  Sluggish: "#EF4444",
  OK: "#F59E0B",
  Good: "#10B981",
  Energized: "#0EA5E9",
};

const RECIPE_CSV_TEMPLATE =
  "name,category,calories,protein,carbs,fat,prep\n" +
  "Greek Yogurt Power Bowl,Breakfast,390,28,45,10,5 min\n" +
  "Game-Day Pasta,Pre-Game,620,24,98,12,25 min";

const toNum = (v) => Number(v) || 0;

// Consecutive days (counting back from today) with at least one log entry.
function computeStreak(entries) {
  if (!entries?.length) return 0;
  const days = new Set();
  entries.forEach((e) => {
    if (e.createdAt) days.add(formatDayKey(e.createdAt));
  });
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    if (days.has(formatDayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

// Fallback bucket for log entries that pre-date the categorical `cat` field.
function mealBucket(ts) {
  if (!ts) return "Today";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

// Default a freshly logged item to whichever standard meal slot the current
// time falls into. Players can override in the manual form before saving.
function timeOfDayCategory() {
  const h = new Date().getHours();
  if (h < 11) return "Breakfast";
  if (h < 15) return "Lunch";
  if (h < 21) return "Dinner";
  return "Snacks";
}

// Parse recipe import text: name,category,calories,protein,carbs,fat,prep.
// Handles an optional header row; unknown categories are valid (auto-created).
export function parseRecipeCsv(text) {
  let src = String(text).trim();
  const first = src.split(/\r?\n/)[0]?.toLowerCase() || "";
  if (!(first.includes("name") || first.includes("calorie"))) {
    src = "name,category,calories,protein,carbs,fat,prep\n" + src;
  }
  return parseCsv(src)
    .map((r) => ({
      name: (r.name || "").trim(),
      cat: (r.category || "").trim() || "Other",
      cal: toNum(r.calories),
      p: toNum(r.protein),
      c: toNum(r.carbs),
      f: toNum(r.fat),
      prep: (r.prep || "").trim() || "—",
    }))
    .filter((r) => r.name);
}

/* ─── NutritionHero ─────────────────────────────────────────────────────── */
function NutritionHero({ totals, streak, waterCups, setWaterCups }) {
  const { team, t } = useTheme();
  const goals = team.targets || {};
  const calGoal = goals.cal || 0;
  const proteinGoal = goals.protein || 0;
  const waterGoal = goals.water || 10;
  const dots = Array.from({ length: waterGoal }, (_, i) => i < waterCups);
  return (
    <div
      className="rounded-[20px] p-4 text-white shadow-hero"
      style={{ background: `linear-gradient(135deg, ${t("primary")}, ${t("primaryDeep")})` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.16em] font-bold opacity-70 font-display">
          Today's Fuel
        </div>
        {streak > 0 && (
          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 bg-white/15 text-brand-accent">
            <Flame className="w-3.5 h-3.5" /> {streak}-day streak
          </span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{totals.cal.toLocaleString()}</span>
              <span className="text-xs opacity-70">/ {calGoal.toLocaleString()} kcal</span>
            </div>
            <span className="text-[11px] font-semibold opacity-70">
              {calGoal ? Math.round((totals.cal / calGoal) * 100) : 0}%
            </span>
          </div>
          <ProgressBar
            value={calGoal ? totals.cal / calGoal : 0}
            from={t("accent")}
            to={t("accent")}
            className="!bg-white/20"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{totals.p}g</span>
              <span className="text-xs opacity-70">/ {proteinGoal}g protein</span>
            </div>
            <span className="text-[11px] font-semibold opacity-70">
              {proteinGoal ? Math.round((totals.p / proteinGoal) * 100) : 0}%
            </span>
          </div>
          <ProgressBar
            value={proteinGoal ? totals.p / proteinGoal : 0}
            from={t("success")}
            to={t("success")}
            className="!bg-white/20"
          />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Droplets className="w-4 h-4 flex-shrink-0" style={{ color: t("info") }} fill={t("info")} />
          <div className="flex gap-0.5 flex-shrink-0">
            {dots.map((on, i) => (
              <div
                key={i}
                className="w-2 h-3.5 rounded-sm"
                style={{ backgroundColor: on ? t("info") : "rgba(255,255,255,0.18)" }}
              />
            ))}
          </div>
          <span className="text-xs font-semibold ml-1.5 whitespace-nowrap">
            {waterCups} / {waterGoal}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setWaterCups(Math.max(0, waterCups - 1))}
            disabled={waterCups === 0}
            aria-label="One less cup"
            className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center disabled:opacity-30"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWaterCups(waterCups + 1)}
            aria-label="Add a cup"
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold"
            style={{ backgroundColor: t("accent"), color: t("primaryDeep") }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Nutrition targets: coach composer + player "Today's target" card ──── */
function TargetBar({ label, value, goal, unit }) {
  const { t } = useTheme();
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const color = pct >= 100 ? t("success") : t("accent");
  return (
    <div>
      <div className="flex justify-between text-[11px] font-semibold text-ink-soft mb-1.5">
        <span>{label}</span>
        <span>
          {value}/{goal} {unit}
        </span>
      </div>
      <ProgressBar value={goal ? value / goal : 0} from={color} to={color} />
    </div>
  );
}

function NutritionTargetsSection({
  isAdmin,
  targets = [],
  myTarget,
  myTotals = { cal: 0, protein: 0 },
  groups = [],
  roster = [],
  onAdd,
  onDelete,
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [mode, setMode] = useState("everyone");
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const players = roster.filter((r) => r.role !== "admin");
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (!isAdmin) {
    if (!myTarget || (!myTarget.cal && !myTarget.protein)) return null;
    return (
      <div className="px-5">
        <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-2.5">
          <h3 className="font-display font-bold text-[18px] uppercase tracking-wide text-ink">
            Today's target
          </h3>
          {myTarget.cal > 0 && (
            <TargetBar label="Calories" value={myTotals.cal} goal={myTarget.cal} unit="kcal" />
          )}
          {myTarget.protein > 0 && (
            <TargetBar label="Protein" value={myTotals.protein} goal={myTarget.protein} unit="g" />
          )}
        </div>
      </div>
    );
  }

  const add = async () => {
    if (!cal && !protein) return;
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try {
      await onAdd({ cal, protein, visibleTo });
      setCal("");
      setProtein("");
      setMode("everyone");
      setGroupIds([]);
      setEmails([]);
      setOpen(false);
      toast("Target saved.", "success");
    } catch (e) {
      toast("Couldn't save target — " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };
  const del = async (target) => {
    const ok = await confirm({
      title: "Delete target?",
      body: "Players will no longer see this daily target.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await onDelete(target.id);
      toast("Target deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e?.message || ""));
    }
  };

  return (
    <div className="px-5 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-[20px] uppercase tracking-wide text-ink">
          Daily Targets
        </h3>
        <Btn variant="primary" size="sm" icon={Plus} onClick={() => setOpen(true)}>
          Target
        </Btn>
      </div>
      {targets.length > 0 && (
        <ul className="space-y-1.5">
          {targets.map((target) => (
            <li
              key={target.id}
              className="flex items-center justify-between bg-[var(--th-surface)] rounded-xl px-3 py-2.5 border border-[var(--th-surface-2)] shadow-card"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink">
                  {target.cal ? `${target.cal} kcal` : ""}
                  {target.cal && target.protein ? " · " : ""}
                  {target.protein ? `${target.protein}g protein` : ""}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {visibleToText(target.visibleTo, groups)}
                </div>
              </div>
              <button
                onClick={() => del(target)}
                aria-label="Delete target"
                className="text-ink-faint hover:text-[var(--th-danger)] flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Daily target"
        subtitle="kcal + protein goal for the team or specific players"
        size="md"
        footer={
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              className="flex-1"
              loading={busy}
              disabled={!cal && !protein}
              onClick={add}
            >
              Save target
            </Btn>
          </div>
        }
      >
        <div className="px-5 pb-5 pt-1 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Calories">
              <Input
                type="number"
                value={cal}
                onChange={(e) => setCal(e.target.value)}
                placeholder="3200"
              />
            </Field>
            <Field label="Protein (g)">
              <Input
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="180"
              />
            </Field>
          </div>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "custom", label: "Specific" },
            ]}
          />
          {mode === "custom" && (
            <div className="space-y-2">
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => {
                    const on = groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggle(groupIds, setGroupIds, g.id)}
                        className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                          on
                            ? "bg-brand-primary text-white border-transparent"
                            : "bg-[var(--th-surface)] text-ink-soft border-[var(--th-surface-2)]"
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {players.length > 0 && (
                <Field label="Players">
                  <div className="max-h-36 overflow-y-auto rounded-[14px] border border-[var(--th-surface-2)] divide-y divide-[var(--th-surface-2)]">
                    {players.map((p) => {
                      const on = emails.includes(p.email);
                      return (
                        <button
                          key={p.email}
                          onClick={() => toggle(emails, setEmails, p.email)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                        >
                          <span className="text-xs font-medium text-ink truncate">{p.email}</span>
                          {on ? (
                            <Check className="w-4 h-4 flex-shrink-0 text-[var(--th-success)]" />
                          ) : (
                            <span className="w-4 h-4 rounded border border-[var(--th-surface-2)] flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/* ─── BarcodeScannerModal ───────────────────────────────────────────────── */
// Rear camera + the browser BarcodeDetector; a successful scan calls onScan
// with the raw barcode value. Graceful fallback when the API is unsupported.
function BarcodeScannerModal({ onClose, onScan }) {
  const { t } = useTheme();
  const videoRef = useRef(null);
  const onScanRef = useRef(null);
  const supported =
    typeof window !== "undefined" && "BarcodeDetector" in window;
  const [err, setErr] = useState(() =>
    supported
      ? ""
      : "Your browser doesn't support barcode scanning. Try Chrome on Android or Safari 17+ on iOS.",
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    let stream;
    let frameId;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((x) => x.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes.find((c) => c.rawValue);
            if (code) {
              cancelled = true;
              onScanRef.current(code.rawValue);
              return;
            }
          } catch {
            /* transient detect errors are fine */
          }
          frameId = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setErr("Couldn't access camera — " + (e?.message || "permission denied?"));
      }
    })();
    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (stream) stream.getTracks().forEach((x) => x.stop());
    };
  }, [supported]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--th-surface)] rounded-[24px] w-full max-w-md overflow-hidden shadow-hero"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[var(--th-surface-2)] flex items-center justify-between">
          <h3 className="font-bold text-ink flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-brand-primary" /> Scan a barcode
          </h3>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-ink-soft" />
          </button>
        </div>
        <div className="aspect-video bg-ink relative">
          {err ? (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm px-6 text-center">
              {err}
            </div>
          ) : (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-3/4 h-20 border-2 rounded-lg"
                  style={{ borderColor: t("accent"), boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
                />
              </div>
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-xs">
                  Starting camera…
                </div>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-ink-soft text-center py-3 px-4">
          Center a barcode in the box. It scans automatically.
        </p>
      </div>
    </div>
  );
}

/* ─── NutritionPage ─────────────────────────────────────────────────────── */
const blankManual = { name: "", cat: "", cal: "", p: "", c: "", f: "" };

export default function NutritionPage({ user }) {
  const isAdmin = user?.role === "admin";
  const { recipes, categories, addRecipe, updateRecipe, deleteRecipe, importRecipes, addCategory, seedRecipes } =
    useTrainRecipes();
  const { logged, addLog, updateLog, deleteLog } = useFoodLog(user?.uid);
  const { savedFoods, addSavedFood, deleteSavedFood } = useSavedFoods(user?.uid);
  const { waterCups, setWaterCups } = useWater(user?.uid);
  const {
    targets: nutritionTargets,
    groups,
    roster,
    myTarget,
    addNutritionTarget,
    deleteNutritionTarget,
  } = useNutritionTargets(user);
  const confirm = useConfirm();

  // Union of premade defaults + admin's custom categories. Defaults are
  // always available so the UI is never empty and players have a sane set
  // to file food into on day one.
  const effectiveCategories = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...DEFAULT_NUTRITION_CATEGORIES, ...categories].forEach((c) => {
      if (c && !seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    });
    return out;
  }, [categories]);

  const [view, setView] = useState("library"); // library | log | manage
  const [catPick, setCatPick] = useState(effectiveCategories[0] || "Breakfast");
  // A stale pick (e.g. after a category is removed) falls back to the first
  // available category — derived, not an effect.
  const cat = effectiveCategories.includes(catPick)
    ? catPick
    : effectiveCategories[0] || "Breakfast";

  // Food-type sub-category filter within the active meal category (e.g. Lunch
  // → "Fish & Seafood"). null = "All"; a stale pick from another category
  // resolves back to "All" via activeSub below — no reset effect needed.
  const [subCat, setSubCat] = useState(null);

  /* ── Food logging state ── */
  const [manual, setManual] = useState({ ...blankManual, cat: timeOfDayCategory() });
  const [showManual, setShowManual] = useState(false);
  // Closing the manual form clears any pending search results.
  const toggleManual = () => {
    if (showManual) {
      setSearchResults([]);
      setSearchErr("");
    }
    setShowManual(!showManual);
  };
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  // AI photo logging — POSTs to the Cloudflare Worker /api/food-photo endpoint.
  const [photoState, setPhotoState] = useState("idle"); // idle | uploading | done | error
  const [photoNote, setPhotoNote] = useState("");
  const photoInputRef = useRef(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleBarcode = useCallback(async (code) => {
    setScannerOpen(false);
    setShowManual(true);
    setPhotoState("uploading");
    setPhotoNote(`Looking up ${code}…`);
    try {
      const data = await lookupBarcode(code);
      setManual({
        name: data.name || `Product ${code}`,
        cat: timeOfDayCategory(),
        cal: data.cal != null ? String(data.cal) : "",
        p: data.p != null ? String(data.p) : "",
        c: data.c != null ? String(data.c) : "",
        f: data.f != null ? String(data.f) : "",
      });
      setPhotoNote("Open Food Facts · per 100g — adjust if your portion was different.");
      setPhotoState("done");
    } catch (e) {
      setPhotoState("error");
      setPhotoNote(e?.message || "Barcode lookup failed");
    }
  }, []);

  const analyzePhoto = async (file) => {
    if (!file) return;
    setShowManual(true);
    setPhotoState("uploading");
    setPhotoNote("Analyzing photo…");
    try {
      const { dataUrl } = await downscaleImage(file, { maxDim: 1024, quality: 0.85 });
      const imageBase64 = String(dataUrl).split(",")[1];
      const res = await fetch("/api/food-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setManual({
        name: data.name || "",
        cat: timeOfDayCategory(),
        cal: data.cal != null ? String(data.cal) : "",
        p: data.p != null ? String(data.p) : "",
        c: data.c != null ? String(data.c) : "",
        f: data.f != null ? String(data.f) : "",
      });
      const conf = data.confidence ? `${data.confidence} confidence` : "AI estimate";
      setPhotoNote(`${conf}${data.notes ? " · " + data.notes : ""} — review and adjust before logging.`);
      setPhotoState("done");
    } catch (e) {
      setPhotoState("error");
      setPhotoNote(e?.message || "Photo analysis failed");
    }
  };

  // 300ms-debounced unified food search: Open Food Facts (no key) + USDA
  // (only when a key is set). Results are per 100g; deduped by name, top 16.
  // Result clearing happens at the event sites (name input, form close), so
  // the effect only ever schedules and cancels work.
  useEffect(() => {
    const q = manual.name.trim();
    if (!showManual || q.length < 2) return undefined;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      const tasks = [searchProducts(q, ctl.signal)];
      if (hasUsdaKey()) tasks.unshift(searchFoods(q, ctl.signal));
      const settled = await Promise.allSettled(tasks);
      if (ctl.signal.aborted) return;
      const merged = [];
      const seen = new Set();
      settled.forEach((s) => {
        if (s.status !== "fulfilled") return;
        s.value.forEach((r) => {
          const key = (r.name || "").toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          merged.push(r);
        });
      });
      if (!merged.length && settled.every((s) => s.status === "rejected")) {
        const firstErr = settled.find((s) => s.status === "rejected");
        setSearchErr(firstErr?.reason?.message || "Search failed");
      } else {
        setSearchErr("");
      }
      setSearchResults(merged.slice(0, 16));
      setSearching(false);
    }, 300);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [manual.name, showManual]);

  const pickFood = (r) => {
    setManual({ ...manual, name: r.name, cal: String(r.cal), p: String(r.p), c: String(r.c), f: String(r.f) });
    setSearchResults([]);
  };

  /* ── Today's log, totals, streak, grouping ── */
  const key = todayKey();
  const todayLogs = useMemo(
    () => logged.filter((l) => formatDayKey(l.createdAt) === key),
    [logged, key],
  );
  const totals = useMemo(
    () =>
      todayLogs.reduce(
        (a, l) => ({ cal: a.cal + toNum(l.cal), p: a.p + toNum(l.p) }),
        { cal: 0, p: 0 },
      ),
    [todayLogs],
  );
  const myTotals = useMemo(
    () =>
      todayLogs.reduce(
        (a, l) => ({ cal: a.cal + toNum(l.cal), protein: a.protein + toNum(l.p) }),
        { cal: 0, protein: 0 },
      ),
    [todayLogs],
  );
  const streak = useMemo(() => computeStreak(logged), [logged]);

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

  const logRecipe = (m) =>
    addLog({
      name: m.name,
      cat: m.cat || timeOfDayCategory(),
      cal: toNum(m.cal),
      p: toNum(m.p),
      c: toNum(m.c),
      f: toNum(m.f),
      time: nowTime(),
      feeling: null,
    }).catch((e) => toast("Couldn't log — " + (e?.message || "")));

  // Quick-add: one-tap re-log a saved or recent food.
  const quickLog = async (m) => {
    try {
      await addLog({
        name: m.name,
        cat: timeOfDayCategory(),
        cal: toNum(m.cal),
        p: toNum(m.p),
        c: toNum(m.c),
        f: toNum(m.f),
        time: nowTime(),
        feeling: null,
      });
      toast(`Logged ${m.name}`, "success");
    } catch (e) {
      toast("Couldn't log — " + (e?.message || ""));
    }
  };

  // Load a food into the manual form so the portion can be tweaked before logging.
  const fillFromFood = (m) => {
    setManual({
      name: m.name || "",
      cat: manual.cat || timeOfDayCategory(),
      cal: m.cal != null ? String(m.cal) : "",
      p: m.p != null ? String(m.p) : "",
      c: m.c != null ? String(m.c) : "",
      f: m.f != null ? String(m.f) : "",
    });
    setSearchResults([]);
    setShowManual(true);
  };

  const isSaved = (name) =>
    (savedFoods || []).some(
      (s) => (s.name || "").toLowerCase() === (name || "").toLowerCase(),
    );
  const saveFood = async (m) => {
    const name = (m.name || "").trim();
    if (!name) return;
    if (isSaved(name)) {
      toast(`${name} is already saved`, "info");
      return;
    }
    try {
      await addSavedFood({
        name,
        cal: toNum(m.cal),
        p: toNum(m.p),
        c: toNum(m.c),
        f: toNum(m.f),
      });
      toast(`Saved ${name}`, "success");
    } catch (e) {
      toast("Couldn't save — " + (e?.message || ""));
    }
  };
  const removeSavedFood = async (s) => {
    const ok = await confirm({
      title: "Remove saved food?",
      body: `“${s.name}” will be removed from your favorites.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSavedFood(s.id);
    } catch (e) {
      toast("Couldn't remove — " + (e?.message || ""));
    }
  };

  // Recent distinct foods from the log (most-recent first), for quick re-logging.
  const recentFoods = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const l of logged || []) {
      const k = (l.name || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
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
        cal: toNum(manual.cal),
        p: toNum(manual.p),
        c: toNum(manual.c),
        f: toNum(manual.f),
        time: nowTime(),
        feeling: null,
        custom: true,
      });
      setManual({ ...blankManual, cat: timeOfDayCategory() });
      setSearchResults([]);
      setPhotoState("idle");
      setPhotoNote("");
      setShowManual(false);
      toast("Logged.", "success");
    } catch (e) {
      toast("Couldn't add — " + (e?.message || ""));
    }
  };
  const rate = (logId, feeling) => updateLog(logId, { feeling }).catch(() => {});
  const removeLog = async (l) => {
    const ok = await confirm({
      title: "Remove entry?",
      body: `“${l.name}” will be removed from today's log.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    deleteLog(l.id).catch((e) => toast("Couldn't remove — " + (e?.message || "")));
  };

  /* ── Admin recipe management state ── */
  const [manageMode, setManageMode] = useState("single"); // single | sheet | category
  const [single, setSingle] = useState({
    name: "",
    cat: categories[0] || "Breakfast",
    sub: "",
    cal: "",
    p: "",
    c: "",
    f: "",
    prep: "",
  });
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [newCat, setNewCat] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importingSheet, setImportingSheet] = useState(false);

  const runSeedRecipes = async () => {
    if (seeding) return;
    setSeeding(true);
    setImportMsg("");
    try {
      const { added, skipped } = await seedRecipes();
      setImportMsg(
        added
          ? `Added ${added} starter recipe${added === 1 ? "" : "s"}${skipped ? ` · ${skipped} already existed` : ""}.`
          : "All starter recipes are already added.",
      );
    } catch (e) {
      setImportMsg("Couldn't add starter recipes — " + (e?.message || "check Firestore rules."));
    } finally {
      setSeeding(false);
    }
  };

  const addSingle = async () => {
    if (!single.name.trim()) return;
    const name = single.name.trim();
    const targetCat = single.cat || "Other";
    try {
      if (targetCat && !categories.includes(targetCat)) await addCategory(targetCat);
      const data = {
        name,
        cat: targetCat,
        sub: single.sub.trim() || "",
        cal: toNum(single.cal),
        p: toNum(single.p),
        c: toNum(single.c),
        f: toNum(single.f),
        prep: single.prep || "—",
      };
      if (editingRecipeId) {
        await updateRecipe(editingRecipeId, data);
        setImportMsg(`Updated “${name}”.`);
        setEditingRecipeId(null);
      } else {
        await addRecipe(data);
        setImportMsg(`Added “${name}” to ${targetCat}.`);
      }
      setSingle({ name: "", cat: targetCat, sub: single.sub, cal: "", p: "", c: "", f: "", prep: "" });
    } catch (e) {
      setImportMsg("Couldn't save recipe — " + (e?.message || "check Firestore rules."));
    }
  };
  const startEditRecipe = (r) => {
    setEditingRecipeId(r.id);
    setSingle({
      name: r.name || "",
      cat: r.cat || categories[0] || "Breakfast",
      sub: r.sub || "",
      cal: r.cal != null ? String(r.cal) : "",
      p: r.p != null ? String(r.p) : "",
      c: r.c != null ? String(r.c) : "",
      f: r.f != null ? String(r.f) : "",
      prep: r.prep || "",
    });
    setView("manage");
    setManageMode("single");
    setImportMsg("");
  };
  const removeRecipe = async (r) => {
    const ok = await confirm({
      title: "Delete recipe?",
      body: `“${r.name}” will be removed from the library.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRecipe(r.id);
      toast("Recipe deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e?.message || ""));
    }
  };
  const submitCategory = async () => {
    const c = newCat.trim();
    if (!c || categories.includes(c)) return;
    try {
      await addCategory(c);
      setImportMsg(`Added category “${c}”.`);
      setNewCat("");
    } catch (e) {
      setImportMsg("Couldn't add category — " + (e?.message || "check Firestore rules."));
    }
  };
  const doRecipeImport = async (text) => {
    const parsed = parseRecipeCsv(text);
    if (!parsed.length) throw new Error("No valid rows found — check the format.");
    const newCats = [...new Set(parsed.map((r) => r.cat))].filter(
      (c) => c && !categories.includes(c),
    );
    for (const c of newCats) await addCategory(c);
    await importRecipes(parsed);
    return `Imported ${parsed.length} recipe${parsed.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new categor${newCats.length === 1 ? "y" : "ies"}` : ""}.`;
  };

  /* ── Library filtering ── */
  const inCat = useMemo(() => recipes.filter((m) => m.cat === cat), [recipes, cat]);
  // Food-type sub-categories present in this meal category (recipes without a
  // `sub` fall under "Other" so nothing is hidden). Only shown when there's
  // more than one, so simple libraries stay clean.
  const subCats = useMemo(() => {
    const seen = [];
    inCat.forEach((m) => {
      const s = m.sub || "Other";
      if (!seen.includes(s)) seen.push(s);
    });
    return seen;
  }, [inCat]);
  const activeSub = subCat && subCats.includes(subCat) ? subCat : null;
  const filtered = activeSub ? inCat.filter((m) => (m.sub || "Other") === activeSub) : inCat;

  const viewTabs = isAdmin
    ? [
        { id: "library", label: "Recipes", icon: BookOpen },
        { id: "manage", label: "Manage", icon: Settings2 },
      ]
    : [
        { id: "library", label: "Recipes", icon: BookOpen },
        { id: "log", label: "My Log", icon: UtensilsCrossed },
      ];

  /* ── MANAGE view ── */
  if (view === "manage" && isAdmin) {
    return (
      <div className="pt-5 pb-4 px-5 space-y-5">
        <Tabs tabs={viewTabs} value={view} onChange={setView} />
        <div>
          <h2 className="font-display font-bold text-[24px] uppercase tracking-wide text-ink">
            Manage Recipes
          </h2>
          <p className="text-xs text-ink-soft mt-0.5">
            {recipes.length} recipes · {categories.length} custom categories
          </p>
        </div>

        <SegmentedControl
          value={manageMode}
          onChange={(m) => {
            setManageMode(m);
            setImportMsg("");
          }}
          options={[
            { value: "single", label: "Add One" },
            { value: "sheet", label: "From Sheet" },
            { value: "category", label: "Category" },
          ]}
        />

        {importMsg && (
          <div className="rounded-xl px-3 py-2.5 text-xs font-semibold flex items-center gap-1.5 bg-brand-accent-soft text-brand-accent">
            <Check className="w-3.5 h-3.5" />
            {importMsg}
          </div>
        )}

        <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
            <Apple className="w-4 h-4 text-brand-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-ink">Add starter recipes</div>
            <div className="text-[11px] text-ink-soft">
              120 whole-food recipes across every meal, by food type. Skips ones you already have.
            </div>
          </div>
          <Btn variant="primary" size="sm" loading={seeding} onClick={runSeedRecipes}>
            Add
          </Btn>
        </div>

        {manageMode === "single" && (
          <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-3">
            <Field label="Recipe name">
              <Input
                value={single.name}
                onChange={(e) => setSingle({ ...single, name: e.target.value })}
                placeholder="e.g. Game-Day Pasta"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Category">
                <Select
                  value={single.cat}
                  onChange={(e) => setSingle({ ...single, cat: e.target.value })}
                >
                  {effectiveCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Food type">
                <Input
                  list="recipe-subs"
                  value={single.sub}
                  onChange={(e) => setSingle({ ...single, sub: e.target.value })}
                  placeholder="e.g. Poultry"
                />
                <datalist id="recipe-subs">
                  {[...new Set(recipes.map((r) => r.sub).filter(Boolean))].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["cal", "Cal"],
                ["p", "Protein"],
                ["c", "Carbs"],
                ["f", "Fat"],
              ].map(([k, lbl]) => (
                <Field key={k} label={lbl}>
                  <Input
                    type="number"
                    value={single[k]}
                    onChange={(e) => setSingle({ ...single, [k]: e.target.value })}
                    className="text-center"
                  />
                </Field>
              ))}
            </div>
            <Field label="Prep time">
              <Input
                value={single.prep}
                onChange={(e) => setSingle({ ...single, prep: e.target.value })}
                placeholder="e.g. 15 min"
              />
            </Field>
            <Btn variant="primary" className="w-full" onClick={addSingle}>
              {editingRecipeId ? "Save changes" : "Add recipe"}
            </Btn>
            {editingRecipeId && (
              <Btn
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setEditingRecipeId(null);
                  setSingle({
                    name: "",
                    cat: single.cat,
                    sub: "",
                    cal: "",
                    p: "",
                    c: "",
                    f: "",
                    prep: "",
                  });
                  setImportMsg("");
                }}
              >
                Cancel edit
              </Btn>
            )}
          </div>
        )}

        {manageMode === "sheet" && (
          <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-3">
            <div className="text-[11px] font-semibold text-ink-soft">
              Paste rows from a spreadsheet, or upload a .csv file. New categories are created
              automatically.
            </div>
            <Btn variant="outline" className="w-full" onClick={() => setImportingSheet(true)}>
              Open CSV importer
            </Btn>
            <p className="text-[11px] text-ink-faint leading-relaxed">
              Columns: <span className="font-mono">name,category,calories,protein,carbs,fat,prep</span>.
              The header row is optional.
            </p>
          </div>
        )}

        {manageMode === "category" && (
          <div className="space-y-3">
            <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-3">
              <Field label="New category">
                <Input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCategory()}
                  placeholder="e.g. Pre-Game"
                />
              </Field>
              <Btn variant="primary" className="w-full" onClick={submitCategory}>
                Add category
              </Btn>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <span
                  key={c}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[var(--th-surface)] border border-[var(--th-surface-2)] text-ink-soft"
                >
                  {c}
                </span>
              ))}
              {categories.length === 0 && (
                <p className="text-[11px] text-ink-faint">
                  No custom categories yet — the defaults above are always available.
                </p>
              )}
            </div>
          </div>
        )}

        <CsvImporter
          open={importingSheet}
          onClose={() => setImportingSheet(false)}
          title="Import recipes"
          subtitle="One recipe per line"
          template={RECIPE_CSV_TEMPLATE}
          importLabel="Import recipes"
          onImport={doRecipeImport}
          help={
            <>
              Columns:{" "}
              <span className="font-mono">name,category,calories,protein,carbs,fat,prep</span>.
              New categories are created automatically. Wrap descriptions containing commas in
              "quotes". The header row is optional.
            </>
          }
        />
      </div>
    );
  }

  /* ── LOG view ── */
  if (view === "log") {
    return (
      <div className="pt-5 pb-4 px-5 space-y-5">
        <Tabs tabs={viewTabs} value={view} onChange={setView} />
        <NutritionHero totals={totals} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />

        <div className="space-y-2">
          <Btn variant="primary" className="w-full" icon={Plus} onClick={toggleManual}>
            Log something
          </Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="outline" size="sm" icon={Camera} onClick={() => photoInputRef.current?.click()}>
              Photo
            </Btn>
            <Btn variant="outline" size="sm" icon={ScanLine} onClick={() => setScannerOpen(true)}>
              Barcode
            </Btn>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyzePhoto(f);
                e.target.value = "";
              }}
            />
          </div>
          {scannerOpen && <BarcodeScannerModal onClose={() => setScannerOpen(false)} onScan={handleBarcode} />}
        </div>

        {/* Quick add — one tap re-logs a saved or recent food. */}
        {(savedFoods.length > 0 || recentFoods.length > 0) && (
          <div className="space-y-3">
            {savedFoods.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-faint mb-1.5 px-1 flex items-center gap-1">
                  <Star className="w-3 h-3 text-brand-accent" /> Saved foods
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {savedFoods.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center rounded-full border border-[var(--th-surface-2)] overflow-hidden bg-[var(--th-surface)] shadow-card"
                    >
                      <button onClick={() => quickLog(s)} title={`Log ${s.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-ink">{s.name}</span>
                        <span className="text-[11px] text-ink-faint ml-1.5">{s.cal} cal</span>
                      </button>
                      <button
                        onClick={() => fillFromFood(s)}
                        title="Edit portion"
                        className="px-1.5 py-1.5 text-ink-faint hover:text-ink border-l border-[var(--th-surface-2)]"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeSavedFood(s)}
                        title="Remove from saved"
                        className="px-2 py-1.5 text-ink-faint hover:text-[var(--th-danger)] border-l border-[var(--th-surface-2)]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentFoods.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-faint mb-1.5 px-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Recent
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentFoods.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center rounded-full border border-[var(--th-surface-2)] overflow-hidden bg-[var(--th-surface)] shadow-card"
                    >
                      <button onClick={() => quickLog(r)} title={`Log ${r.name}`} className="pl-3 pr-2 py-1.5 text-left">
                        <span className="text-xs font-semibold text-ink">{r.name}</span>
                        <span className="text-[11px] text-ink-faint ml-1.5">{r.cal} cal</span>
                      </button>
                      <button
                        onClick={() => saveFood(r)}
                        title={isSaved(r.name) ? "Saved" : "Save to favorites"}
                        className="px-2 py-1.5 border-l border-[var(--th-surface-2)]"
                        style={{ color: isSaved(r.name) ? "var(--th-accent)" : "var(--th-ink-3)" }}
                      >
                        <Star className="w-3 h-3" fill={isSaved(r.name) ? "var(--th-accent)" : "none"} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {showManual && (
          <div className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] space-y-2.5">
            {photoState !== "idle" && (
              <div
                className={`rounded-xl px-3 py-2 text-[11px] font-semibold flex items-start gap-2 ${
                  photoState === "error"
                    ? "bg-red-50 text-[var(--th-danger)]"
                    : photoState === "done"
                      ? "bg-brand-accent-soft text-brand-accent"
                      : "bg-sky-50 text-sky-700"
                }`}
              >
                {photoState === "uploading" && (
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
                )}
                {photoState === "done" && <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                {photoState === "error" && <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span className="leading-snug">{photoNote}</span>
                {photoState !== "uploading" && (
                  <button
                    onClick={() => {
                      setPhotoState("idle");
                      setPhotoNote("");
                    }}
                    className="ml-auto opacity-60 hover:opacity-100 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <div className="relative">
              <Input
                value={manual.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setManual({ ...manual, name: v });
                  if (v.trim().length < 2) {
                    setSearchResults([]);
                    setSearchErr("");
                  }
                }}
                placeholder="Search foods or type your own…"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint font-semibold">
                  searching…
                </span>
              )}
            </div>
            {searchErr && <p className="text-[11px] text-[var(--th-danger)] font-medium px-1">{searchErr}</p>}
            {searchResults.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-[var(--th-surface-2)] bg-[var(--th-bg)] divide-y divide-[var(--th-surface-2)]">
                {searchResults.map((r) => (
                  <li key={r.fdcId || r.barcode || r.name}>
                    <button type="button" onClick={() => pickFood(r)} className="w-full text-left px-3 py-2.5 hover:bg-[var(--th-surface)]">
                      <div className="text-xs font-semibold text-ink leading-tight">{r.name}</div>
                      <div className="text-[11px] text-ink-soft mt-0.5">
                        {r.cal} kcal · P {r.p}g · C {r.c}g · F {r.f}g{" "}
                        <span className="text-ink-faint">(per 100g)</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Field label="Meal">
              <Select value={manual.cat} onChange={(e) => setManual({ ...manual, cat: e.target.value })}>
                {effectiveCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Calories">
                <Input type="number" value={manual.cal} onChange={(e) => setManual({ ...manual, cal: e.target.value })} />
              </Field>
              <Field label="Protein (g)">
                <Input type="number" value={manual.p} onChange={(e) => setManual({ ...manual, p: e.target.value })} />
              </Field>
              <Field label="Carbs (g)">
                <Input type="number" value={manual.c} onChange={(e) => setManual({ ...manual, c: e.target.value })} />
              </Field>
              <Field label="Fat (g)">
                <Input type="number" value={manual.f} onChange={(e) => setManual({ ...manual, f: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Btn
                variant="outline"
                size="sm"
                icon={Star}
                disabled={!manual.name.trim()}
                title="Save to favorites"
                onClick={() => saveFood(manual)}
              >
                Save
              </Btn>
              <Btn variant="primary" size="sm" className="flex-1" onClick={addManual}>
                Add to log
              </Btn>
            </div>
            {!hasUsdaKey() && (
              <p className="text-[11px] text-ink-faint px-1">
                Searching Open Food Facts. Add a USDA API key for whole-food results too (see README
                → Food search).
              </p>
            )}
          </div>
        )}

        <div>
          <h3 className="font-display font-bold text-[18px] uppercase tracking-wide text-ink mb-2 px-1">
            Today's Log
          </h3>
          {todayLogs.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Nothing logged yet"
              body="Log something above — or snap a photo and let AI guess the macros."
            />
          ) : (
            <div className="space-y-3">
              {catOrder.map((bucket) => (
                <div key={bucket}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft px-1 mb-1.5">
                    {bucket}
                  </div>
                  <ul className="bg-[var(--th-surface)] rounded-[20px] shadow-card border border-[var(--th-surface-2)] overflow-hidden">
                    {todayByCat[bucket].map((l, i, arr) => (
                      <li
                        key={l.id}
                        className={`px-4 py-3 ${i < arr.length - 1 ? "border-b border-[var(--th-surface-2)]" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
                            <Flame className="w-4 h-4 text-brand-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-ink flex items-center gap-1.5">
                              <span className="truncate">{l.name}</span>
                              {l.custom && (
                                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint bg-[var(--th-surface-2)] px-1.5 py-0.5 rounded flex-shrink-0">
                                  Custom
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-ink-soft">
                              {l.time || formatTime(l.createdAt)} · {l.cal} kcal · P{l.p}
                            </div>
                          </div>
                          <button
                            onClick={() => removeLog(l)}
                            aria-label={`Remove ${l.name}`}
                            className="text-ink-faint hover:text-[var(--th-danger)] flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="mt-2 pl-12">
                          <div className="text-[11px] font-semibold text-ink-faint uppercase tracking-wider mb-1.5">
                            How did you feel after?
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {FEELINGS.map((f) => (
                              <button
                                key={f}
                                onClick={() => rate(l.id, f)}
                                className="text-[11px] font-bold px-2.5 py-1.5 rounded-full border transition-all"
                                style={
                                  l.feeling === f
                                    ? { backgroundColor: FEELING_COLOR[f], color: "white", borderColor: FEELING_COLOR[f] }
                                    : { color: "var(--th-ink-2)", borderColor: "var(--th-surface-2)" }
                                }
                              >
                                {f}
                              </button>
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

  /* ── LIBRARY view (default) ── */
  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5">
        <Tabs tabs={viewTabs} value={view} onChange={setView} />
      </div>
      {!isAdmin && (
        <div className="px-5">
          <NutritionHero totals={totals} streak={streak} waterCups={waterCups} setWaterCups={setWaterCups} />
        </div>
      )}

      <NutritionTargetsSection
        isAdmin={isAdmin}
        targets={nutritionTargets}
        myTarget={myTarget}
        myTotals={myTotals}
        groups={groups}
        roster={roster}
        onAdd={addNutritionTarget}
        onDelete={deleteNutritionTarget}
      />

      {!isAdmin && (
        <div className="px-5">
          <button
            onClick={() => setView("log")}
            className="w-full bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)] flex items-center gap-2.5"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-sky-700" />
            </div>
            <div className="text-left flex-1">
              <div className="text-xs font-bold text-ink">My Food Log</div>
              <div className="text-[11px] text-ink-soft">
                {todayLogs.length} logged today · tap to view &amp; rate
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-faint" />
          </button>
        </div>
      )}
      {isAdmin && (
        <div className="px-5">
          <button
            onClick={() => setView("manage")}
            className="w-full bg-[var(--th-surface)] rounded-[20px] p-3 shadow-card border border-[var(--th-surface-2)] flex items-center gap-2.5"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-accent-soft flex items-center justify-center">
              <Plus className="w-4 h-4 text-brand-accent" />
            </div>
            <div className="text-left flex-1">
              <div className="text-xs font-bold text-ink">Manage Recipes</div>
              <div className="text-[11px] text-ink-soft">Add recipes &amp; categories, or import a sheet</div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-faint" />
          </button>
        </div>
      )}

      <div className="px-5 flex gap-2 overflow-x-auto">
        {effectiveCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCatPick(c)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              cat === c
                ? "bg-brand-primary text-white shadow-card"
                : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {subCats.length > 1 && (
        <div className="px-5 flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setSubCat(null)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${
              activeSub === null
                ? "bg-brand-accent text-[var(--th-primary-deep)] border-transparent shadow-card"
                : "bg-[var(--th-surface)] text-ink-soft border-[var(--th-surface-2)]"
            }`}
          >
            All
          </button>
          {subCats.map((s) => (
            <button
              key={s}
              onClick={() => setSubCat(s)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap border ${
                activeSub === s
                  ? "bg-brand-accent text-[var(--th-primary-deep)] border-transparent shadow-card"
                  : "bg-[var(--th-surface)] text-ink-soft border-[var(--th-surface-2)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 space-y-2.5">
        {filtered.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="No recipes here yet"
            body={isAdmin ? "Add the first recipe from the Manage tab." : "Check back soon — your coach is building the library."}
          />
        )}
        {filtered.map((m) => (
          <article
            key={m.id}
            className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-ink">{m.name}</h4>
                {m.sub && (
                  <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent-soft text-brand-accent">
                    {m.sub}
                  </span>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] font-semibold text-ink-soft uppercase tracking-wide">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {m.prep}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    {m.cal} kcal
                  </span>
                  <span>P {m.p}g</span>
                </div>
              </div>
              {!isAdmin ? (
                <Btn variant="primary" size="sm" className="flex-shrink-0" onClick={() => logRecipe(m)}>
                  Log
                </Btn>
              ) : (
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => startEditRecipe(m)}
                    title="Edit"
                    aria-label={`Edit ${m.name}`}
                    className="text-ink-faint hover:text-ink"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeRecipe(m)}
                    title="Delete"
                    aria-label={`Delete ${m.name}`}
                    className="text-ink-faint hover:text-[var(--th-danger)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {isAdmin && view === "library" && (
        <div className="px-5 flex justify-center">
          <button
            onClick={() => {
              setImportMsg("");
              setView("manage");
            }}
            className="text-[11px] font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1 hover:text-ink"
          >
            Go to Manage <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
