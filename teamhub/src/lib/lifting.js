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
// Ready-made strength templates a coach applies in one tap. Each entry is
// PINNED to an exact exercise (`id` from the Free Exercise DB, or the name of
// a prehab-library exercise), so the right lift is used and %-of-max works.
// Doses follow youth resistance-training guidance (NSCA / AAP) for 14–18
// year-olds: technique first, moderate loads, never to failure, and heavier
// %-based work only under coach supervision. Players' school lifting is
// separate — these are for coaches who run strength sessions themselves.
export const WORKOUT_TEMPLATES = [
  {
    id: "strength-base", name: "Strength Base · Off-Season (Coach-Supervised)",
    desc: "Off-season, coach-supervised, technique first. 3×5 on the big lifts, building ~70% → 80% over 4 weeks. Never to failure.",
    supervised: true,
    weeks: [70, 72.5, 75, 80],
    entries: [
      { id: "Barbell_Full_Squat", match: "back squat", sets: "3", reps: "5", pct: "70" },
      { id: "Barbell_Bench_Press_-_Medium_Grip", match: "bench press", sets: "3", reps: "5", pct: "70" },
      { id: "Trap_Bar_Deadlift", match: "trap-bar deadlift", sets: "2", reps: "5", pct: "70", notes: "Trap bar is easier to learn than a straight-bar deadlift" },
      { id: "Bent_Over_Barbell_Row", match: "barbell row", sets: "3", reps: "8", rpe: "7" },
    ],
  },
  {
    id: "upper", name: "Upper Body · Off-Season",
    desc: "Push/pull balance for posture and contact strength. Moderate loads, 8–12 reps, leave 2–3 reps in the tank.",
    supervised: true,
    entries: [
      { id: "Barbell_Bench_Press_-_Medium_Grip", match: "bench press", sets: "3", reps: "8", pct: "65", group: "A" },
      { id: "Pullups", match: "pull-up", sets: "3", reps: "6–8", rpe: "7", group: "A", notes: "Band-assisted if needed" },
      { id: "Barbell_Shoulder_Press", match: "overhead press", sets: "3", reps: "8–10", rpe: "7", group: "B" },
      { id: "Side_Lateral_Raise", match: "lateral raise", sets: "2", reps: "12–15", rpe: "7", group: "B" },
      { id: "Pushups", match: "push-up", sets: "2", reps: "10–15", rpe: "7" },
    ],
  },
  {
    id: "lower", name: "Lower Power · Off-Season (Coach-Supervised)",
    desc: "Speed + strength for the legs and posterior chain. Low reps, crisp technique, full rest.",
    supervised: true,
    weeks: [70, 75, 77.5],
    entries: [
      { id: "Barbell_Full_Squat", match: "back squat", sets: "4", reps: "3", pct: "70", notes: "Fast up, controlled down" },
      { id: "Romanian_Deadlift", match: "romanian deadlift", sets: "3", reps: "6–8", rpe: "7" },
      { id: "Barbell_Walking_Lunge", match: "walking lunge", sets: "3", reps: "8 / leg", rpe: "7", group: "A", notes: "Dumbbells or bodyweight to start" },
      { id: "Hanging_Leg_Raise", match: "hanging leg raise", sets: "3", reps: "10", rpe: "7", group: "A" },
    ],
  },
  {
    id: "soccer-power", name: "Soccer · Off-Season Power",
    desc: "Posterior chain, repeat-sprint prep and hamstring/groin injury resilience.",
    supervised: true,
    entries: [
      { id: "Trap_Bar_Deadlift", match: "trap-bar deadlift", sets: "3", reps: "4", pct: "75" },
      { lib: "Nordic Hamstring Curl", match: "nordic hamstring curl", sets: "2", reps: "3–5", notes: "Coach-led · slow lowering" },
      { id: "Lateral_Bound", match: "lateral bound", sets: "3", reps: "4 / side", notes: "Stick the landing", group: "A" },
      { lib: "Copenhagen Adductor — Short-Lever Dynamic", match: "copenhagen adductor — short-lever dynamic", sets: "1", reps: "3–5 / side → 8–12", notes: "Adductor strength", group: "A" },
      { id: "Barbell_Hip_Thrust", match: "hip thrust", sets: "3", reps: "8", rpe: "7" },
    ],
  },
  {
    id: "soccer-inseason", name: "Soccer · In-Season Maintenance",
    desc: "1–2x/week, low volume, keep strength and speed without adding fatigue. Never the day before a game; never to failure.",
    entries: [
      { id: "Barbell_Full_Squat", match: "back squat", sets: "2", reps: "3", pct: "75", notes: "Low volume, high quality" },
      { id: "Barbell_Hip_Thrust", match: "hip thrust", sets: "2", reps: "6", rpe: "7" },
      { lib: "Pogo Hops", match: "pogo hops", sets: "2", reps: "10", notes: "Stiff ankles, quick contacts" },
      { lib: "Copenhagen Adductor — Isometric Short-Lever Hold", match: "copenhagen adductor — isometric", sets: "1", reps: "15–20s / side" },
    ],
  },
  {
    id: "prehab-12", name: "Pre-Practice Prehab — 12 Min",
    desc: "Bands only, before every practice and at home. Hips → groin → ankles → core. 1 set pre-practice, 2 sets at home 2–3x/week. School lifting is separate.",
    entries: [
      { lib: "Ankle Rocks", match: "ankle rocks", sets: "1", reps: "8 / side", notes: "Mobility first" },
      { lib: "Leg Swings", match: "leg swings", sets: "1", reps: "8 / side", notes: "Let the range grow" },
      { lib: "Hip Open / Close (Gate)", match: "hip open / close", sets: "1", reps: "8 / side", notes: "FIFA 11+ Part 1" },
      { lib: "Lateral Band Walk", match: "lateral band walk", sets: "1", reps: "10 steps each way", notes: "Band taut, knees out" },
      { lib: "Glute Bridge", match: "glute bridge", sets: "1", reps: "10–15", notes: "2–3s squeeze at top" },
      { lib: "Clamshell", match: "clamshell", sets: "1", reps: "8–12 / side", notes: "Feet together" },
      { lib: "Copenhagen Adductor — Isometric Short-Lever Hold", match: "copenhagen adductor — isometric", sets: "1", reps: "15–20s / side", notes: "Partner or bench" },
      { lib: "Single-Leg Stance", match: "single-leg stance", sets: "1", reps: "30s / leg", notes: "Eyes closed to progress" },
      { lib: "Band Eversion", match: "band eversion", sets: "1", reps: "15 / side", notes: "Peroneals" },
      { lib: "Single-Leg Calf Raise", match: "single-leg calf raise", sets: "1", reps: "12 / leg", notes: "3s down" },
      { lib: "Side Plank", match: "side plank", sets: "1", reps: "20s / side", notes: "Hips stacked" },
      { lib: "Dead Bug", match: "dead bug", sets: "1", reps: "6 / side", notes: "Low back flat" },
    ],
  },
];

const titleCaseWords = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

// Turn a template into a workout {name, exercises} by matching each entry's name
// to the exercise library (so exerciseId links → %-max + PRs work). Unmatched
// entries still land with their prescription; the coach can swap the exercise.
export function buildTemplateWorkout(template, libItems = []) {
  const findEx = (match, pin = {}) => {
    // Pinned first: exact database id, or exact prehab-library name.
    if (pin.id) { const hit = libItems.find((x) => x.id === pin.id); if (hit) return hit; }
    if (pin.lib) { const hit = libItems.find((x) => (x.name || "").toLowerCase() === pin.lib.toLowerCase()); if (hit) return hit; }
    const q = String(match || "").toLowerCase();
    return libItems.find((x) => (x.name || "").toLowerCase() === q)
      || libItems.find((x) => (x.name || "").toLowerCase().includes(q))
      || libItems.find((x) => q.split(" ").every((w) => (x.name || "").toLowerCase().includes(w)))
      || null;
  };
  const exercises = template.entries.map((t) => {
    const ex = findEx(t.match, t);
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
