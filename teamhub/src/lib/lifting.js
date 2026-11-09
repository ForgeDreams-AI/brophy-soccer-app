// Strength-prescription engine — the "new training features" ported from the
// ForgeDreams platform and adapted for Phoenix's flat data model.
//
// A workout exercise entry can prescribe load either as an absolute WEIGHT or as
// a PERCENT of the athlete's training max for that lift. Per-athlete maxes live
// at users/{uid}/maxes/{exerciseId}, so the same %-based program renders a
// different, individualized weight for every athlete off their own max — the
// core of real strength programming. Everything here is pure logic (no Firebase)
// so it's easy to test and reuse.

export const ROUND_INCREMENT = 5; // round resolved loads to the nearest 5 (plates)

export const roundLoad = (v, inc = ROUND_INCREMENT) =>
  inc > 0 ? Math.round(v / inc) * inc : Math.round(v);

// A fresh exercise entry. Extends the legacy { sets, reps, weight, notes } shape
// with an optional %-based load + RPE / tempo / superset — absolute weight stays
// the default so nothing changes for a plain workout, and old workouts (which
// lack these fields) still render correctly.
export const newEntry = (ex = {}) => ({
  exerciseId: ex.id || "",
  name: ex.name || "",
  equipment: ex.equipment || "",
  sets: "3",
  reps: "10",
  loadMode: "weight", // "weight" | "percent"
  weight: "",         // absolute load (loadMode === "weight")
  pct: "",            // % of training max (loadMode === "percent")
  rpe: "",            // optional RPE, e.g. "8"
  tempo: "",          // optional tempo, e.g. "31X1"
  group: "",          // superset label — adjacent entries sharing a label superset
  notes: "",
});

// The athlete's max for an entry's lift. maxesById: { [exerciseId]: { value, unit } }.
export const maxFor = (entry, maxesById) =>
  (entry?.exerciseId && maxesById && maxesById[entry.exerciseId]) || null;

// Resolve a prescribed load for a given athlete's maxes.
// → { mode, pct?, weight?, resolved, unit, needsMax }
export function resolveLoad(entry, maxesById = {}) {
  if (entry?.loadMode === "percent" && entry.pct !== "" && entry.pct != null) {
    const pct = Number(entry.pct);
    const max = maxFor(entry, maxesById);
    if (max && Number(max.value) > 0 && !Number.isNaN(pct)) {
      return { mode: "percent", pct, unit: max.unit || "lb", resolved: roundLoad((Number(max.value) * pct) / 100), needsMax: false };
    }
    return { mode: "percent", pct, unit: "lb", resolved: null, needsMax: !Number.isNaN(pct) };
  }
  return { mode: "weight", weight: entry?.weight || "", resolved: null, needsMax: false };
}

// One-line prescription for read-only views, individualized when a max exists.
// e.g. "5 × 5 @ 75% → 185 lb", "3 × 10 @ 135", "4 × 8 · RPE 8 · 31X1"
export function formatPrescription(entry, maxesById = {}) {
  const sets = entry.sets || "—", reps = entry.reps || "—";
  const load = resolveLoad(entry, maxesById);
  let loadStr = "";
  if (load.mode === "percent") {
    loadStr = ` @ ${load.pct}%`;
    if (load.resolved != null) loadStr += ` → ${load.resolved} ${load.unit}`;
  } else if (load.weight) {
    loadStr = ` @ ${load.weight}`;
  }
  const extras = [];
  if (entry.rpe) extras.push(`RPE ${entry.rpe}`);
  if (entry.tempo) extras.push(entry.tempo);
  if (entry.notes) extras.push(entry.notes);
  return `${sets} × ${reps}${loadStr}${extras.length ? " · " + extras.join(" · ") : ""}`;
}

// Bracket adjacent entries that share a superset label for display.
// → [{ group: "A"|"", items: [{ entry, index }] }]
export function groupBySuperset(entries = []) {
  const out = [];
  entries.forEach((entry, index) => {
    const g = (entry.group || "").trim();
    const last = out[out.length - 1];
    if (g && last && last.group === g) last.items.push({ entry, index });
    else out.push({ group: g, items: [{ entry, index }] });
  });
  return out;
}

// Superset labels a coach can cycle through (A–F is plenty for one session).
export const SUPERSET_LABELS = ["", "A", "B", "C", "D", "E", "F"];

// ── Logging + PR detection ──────────────────────────────────────────────────
// Estimated 1-rep max from a logged set (Epley). Used to turn "225 × 5" into a
// comparable 1RM so a heavier-for-reps day counts as a PR.
export const epley1RM = (weight, reps) => {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r > 0)) return 0;
  return Math.round(w * (1 + r / 30));
};

// Best estimated 1RM across the sets an athlete logged for one exercise.
export function bestE1RM(sets = []) {
  let e1rm = 0, top = null;
  for (const s of sets) {
    const e = epley1RM(s.weight, s.reps);
    if (e > e1rm) { e1rm = e; top = s; }
  }
  return { e1rm, set: top };
}

// Compare a logged session against current maxes → the PRs it set.
// entries: [{ exerciseId, name, sets:[{weight,reps,rpe}] }]; maxesById: {id:{value,unit}}
export function detectPRs(entries = [], maxesById = {}) {
  const prs = [];
  for (const en of entries) {
    const { e1rm, set } = bestE1RM(en.sets || []);
    if (!e1rm) continue;
    const cur = maxesById[en.exerciseId];
    if (e1rm > (cur ? Number(cur.value) : 0)) {
      prs.push({ exerciseId: en.exerciseId, name: en.name, e1rm, weight: set?.weight, reps: set?.reps, unit: (cur && cur.unit) || "lb" });
    }
  }
  return prs;
}

// ── Program templates ───────────────────────────────────────────────────────
// Ready-made strength templates a coach applies in one tap (the "hours to
// minutes" lever). Each entry matches an exercise by name against the library so
// %-of-max + PR tracking work out of the box. `weeks` are suggested weekly
// percentage ramps a coach can run the same workout through.
export const WORKOUT_TEMPLATES = [
  {
    id: "5x5", name: "5×5 Linear Strength",
    desc: "The classic. Big compounds, 5×5 at ~80% — add weight as maxes climb.",
    weeks: [80, 82.5, 85, 87.5],
    entries: [
      { match: "back squat", sets: "5", reps: "5", pct: "80" },
      { match: "bench press", sets: "5", reps: "5", pct: "80" },
      { match: "deadlift", sets: "1", reps: "5", pct: "85" },
      { match: "barbell row", sets: "5", reps: "5", pct: "75" },
    ],
  },
  {
    id: "upper", name: "Upper Hypertrophy",
    desc: "Push/pull volume for size — moderate loads, higher reps, supersets.",
    entries: [
      { match: "bench press", sets: "4", reps: "8", pct: "70", group: "A" },
      { match: "pull-up", sets: "4", reps: "8", rpe: "8", group: "A" },
      { match: "overhead press", sets: "3", reps: "10", rpe: "8", group: "B" },
      { match: "lateral raise", sets: "3", reps: "15", rpe: "9", group: "B" },
      { match: "triceps pushdown", sets: "3", reps: "12", rpe: "9" },
    ],
  },
  {
    id: "lower", name: "Lower Power",
    desc: "Speed + strength for the posterior chain and legs.",
    weeks: [75, 80, 85],
    entries: [
      { match: "back squat", sets: "5", reps: "3", pct: "75" },
      { match: "romanian deadlift", sets: "4", reps: "6", rpe: "8" },
      { match: "walking lunge", sets: "3", reps: "10", rpe: "8", group: "A" },
      { match: "hanging leg raise", sets: "3", reps: "12", rpe: "9", group: "A" },
    ],
  },
  {
    id: "soccer-power", name: "Soccer · Off-Season Power",
    desc: "Posterior chain, repeat-sprint prep, and hamstring-injury resilience.",
    entries: [
      { match: "trap-bar deadlift", sets: "4", reps: "4", pct: "82" },
      { match: "nordic hamstring curl", sets: "3", reps: "6", rpe: "8", notes: "Slow eccentric" },
      { match: "lateral bound", sets: "4", reps: "4", notes: "Per side · stick the landing", group: "A" },
      { match: "copenhagen adductor — full dynamic", sets: "1", reps: "12", notes: "Per side · adductor strength", group: "A" },
      { match: "hip thrust", sets: "3", reps: "8", rpe: "8" },
    ],
  },
  {
    id: "soccer-inseason", name: "Soccer · In-Season Maintenance",
    desc: "Reduced volume — keep strength and speed sharp through the schedule.",
    entries: [
      { match: "back squat", sets: "3", reps: "3", pct: "85", notes: "Low volume, high quality" },
      { match: "hip thrust", sets: "3", reps: "6", rpe: "7" },
      { match: "pogo hops", sets: "3", reps: "10", notes: "Stiff ankles, quick contacts" },
    ],
  },
  {
    id: "prehab-12", name: "Pre-Practice Prehab — 12 Min",
    desc: "Bands only, before every practice and at home. Hips → groin → ankles → core. 1 set pre-practice, 2 sets at home 2–3x/week. School lifting is separate.",
    entries: [
      { match: "ankle rocks", sets: "1", reps: "8", notes: "Per side · mobility first" },
      { match: "leg swings", sets: "1", reps: "8", notes: "Per side" },
      { match: "hip open / close", sets: "1", reps: "8", notes: "Per side · FIFA 11+ Part 1" },
      { match: "lateral band walk", sets: "1", reps: "10", notes: "Steps each way · band taut" },
      { match: "glute bridge", sets: "1", reps: "10", notes: "2–3s squeeze at top" },
      { match: "clamshell", sets: "1", reps: "8", notes: "Per side" },
      { match: "copenhagen adductor — isometric", sets: "1", reps: "15", notes: "Seconds per side · partner or bench" },
      { match: "single-leg stance", sets: "1", reps: "30", notes: "Seconds per leg" },
      { match: "band eversion", sets: "1", reps: "15", notes: "Per side" },
      { match: "single-leg calf raise", sets: "1", reps: "12", notes: "Per leg · 3s down" },
      { match: "side plank", sets: "1", reps: "20", notes: "Seconds per side" },
      { match: "dead bug", sets: "1", reps: "6", notes: "Per side" },
    ],
  },
];

const titleCaseWords = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

// Turn a template into a workout {name, exercises} by matching each entry's name
// to the exercise library (so exerciseId links → %-max + PRs work). Unmatched
// entries still land with their prescription; the coach can swap the exercise.
export function buildTemplateWorkout(template, libItems = []) {
  const findEx = (match) => {
    const q = String(match || "").toLowerCase();
    return libItems.find((x) => (x.name || "").toLowerCase() === q)
      || libItems.find((x) => (x.name || "").toLowerCase().includes(q))
      || libItems.find((x) => q.split(" ").every((w) => (x.name || "").toLowerCase().includes(w)))
      || null;
  };
  const exercises = template.entries.map((t) => {
    const ex = findEx(t.match);
    const base = newEntry({ id: ex?.id || "", name: ex?.name || titleCaseWords(t.match), equipment: ex?.equipment || "" });
    return {
      ...base,
      sets: t.sets ?? base.sets,
      reps: t.reps ?? base.reps,
      loadMode: t.pct != null ? "percent" : "weight",
      pct: t.pct != null ? String(t.pct) : "",
      rpe: t.rpe || "",
      tempo: t.tempo || "",
      group: t.group || "",
      notes: t.notes || "",
    };
  });
  return { name: template.name, exercises };
}

// Seed a log's set rows from a workout entry's prescription (so the athlete just
// confirms/adjusts). Resolves %-based loads to real weights off their max.
export function seedLogSets(entry, maxesById = {}) {
  const n = Math.max(1, Math.min(12, parseInt(entry?.sets, 10) || 1));
  const load = resolveLoad(entry, maxesById);
  const weight = load.mode === "percent" ? (load.resolved != null ? String(load.resolved) : "") : (entry?.weight || "");
  const reps = String(entry?.reps || "").split(/[-–]/)[0].trim(); // "8-10" → "8"
  return Array.from({ length: n }, () => ({ weight, reps, rpe: entry?.rpe || "" }));
}
