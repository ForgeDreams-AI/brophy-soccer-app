// Starter TEAM WORKOUTS — in-season prehab routines a coach can drop into
// Team Workouts in one tap. This is the routine players do BEFORE EVERY
// PRACTICE and ON THEIR OWN AT HOME. Bands only, minimal equipment.
//
// It is NOT the school lifting program (2x/week at school), which is separate
// and handled elsewhere. These routines are low-fatigue activation + prehab:
// they keep players durable in-season without adding barbell load.
//
// Structure follows the research (FIFA 11+ as the base; Copenhagen adductor
// programme; FC Barcelona ankle guidance):
//  - Pre-practice = 1 set of each as activation (~12 min).
//  - At home = the fuller 2-set dose, 2–3x/week.
//  - Match day = running parts only (FIFA 11+ Parts 1+3) — no strength block.
//  - In-season rules: cut volume, never train to failure, technique before
//    load, stop if pain > 3/10. Copenhagen is taught in person first.
//
// Seeding is additive and de-dupes by name, so it never disturbs workouts
// you've already built.
//
// Exercise shape matches a workout entry: { name, sets, reps, notes }.

export const AREA_ORDER = ["Pre-Practice Prehab", "At-Home Prehab", "FIFA 11+", "Matchday", "Hips", "Groin", "Ankles"];

export const WORKOUT_SEED = [
  // ── Pre-Practice Prehab — ~12 min, 1-set activation dose ──────────────
  {
    area: "Pre-Practice Prehab", name: "Pre-Practice Prehab — 12 Min", focus: "Before every practice · 1 set each · bands only",
    exercises: [
      { name: "Ankle Rocks", sets: "1", reps: "8 / side", notes: "Mobility first" },
      { name: "Leg Swings", sets: "1", reps: "8 / side", notes: "Let the range grow" },
      { name: "Hip Open / Close (Gate)", sets: "1", reps: "8 / side", notes: "FIFA 11+ Part 1" },
      { name: "Lateral Band Walk", sets: "1", reps: "10 steps each way", notes: "Band taut, knees out" },
      { name: "Glute Bridge", sets: "1", reps: "10–15", notes: "2–3s squeeze at top" },
      { name: "Clamshell", sets: "1", reps: "8–12 / side", notes: "Feet together" },
      { name: "Copenhagen Adductor — Isometric Short-Lever Hold", sets: "1", reps: "15–20s / side", notes: "Beginners start here · partner or bench" },
      { name: "Single-Leg Stance", sets: "1", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Band Eversion", sets: "1", reps: "15 / side", notes: "Peroneals" },
      { name: "Single-Leg Calf Raise", sets: "1", reps: "12 / leg", notes: "3s down" },
      { name: "Side Plank", sets: "1", reps: "20s / side", notes: "Hips stacked" },
      { name: "Dead Bug", sets: "1", reps: "6 / side", notes: "Low back flat" },
    ],
  },
  {
    area: "Pre-Practice Prehab", name: "Pre-Practice — Hips & Groin Only", focus: "Short version · when time is tight",
    exercises: [
      { name: "Hip Open / Close (Gate)", sets: "1", reps: "8 / side", notes: "FIFA 11+ Part 1" },
      { name: "Lateral Band Walk", sets: "1", reps: "10 steps each way", notes: "Band taut" },
      { name: "Glute Bridge", sets: "1", reps: "10–15", notes: "Squeeze at top" },
      { name: "Copenhagen Adductor — Isometric Short-Lever Hold", sets: "1", reps: "15–20s / side", notes: "Partner or bench" },
      { name: "Band Adduction", sets: "1", reps: "10 / side", notes: "Lighter groin top-up" },
    ],
  },

  // ── At-Home Prehab — fuller 2-set dose, 2–3x/week ─────────────────────
  {
    area: "At-Home Prehab", name: "At-Home Prehab — Full (2 Sets)", focus: "At home · 2 sets each · 2–3x/week",
    exercises: [
      { name: "Ankle Rocks", sets: "2", reps: "8 / side", notes: "Mobility first" },
      { name: "Lateral Band Walk", sets: "2", reps: "10 steps each way", notes: "Band taut, knees out" },
      { name: "Clamshell", sets: "2", reps: "8–12 / side", notes: "Feet together" },
      { name: "Single-Leg Glute Bridge", sets: "2", reps: "8–12 / leg", notes: "Pelvis level" },
      { name: "Fire Hydrant", sets: "3", reps: "15 / side", notes: "Hips still" },
      { name: "Standing Band Hip Flexion", sets: "2", reps: "10 / side", notes: "Torso tall" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "8–12 / side", notes: "3s down · only once the hold is easy" },
      { name: "Band Adduction", sets: "2", reps: "10 / side", notes: "Groin top-up" },
      { name: "Single-Leg Stance", sets: "3", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Band Eversion", sets: "3", reps: "15 / side", notes: "Peroneals" },
      { name: "Band Inversion", sets: "3", reps: "12–15 / side", notes: "Pair with eversion" },
      { name: "Single-Leg Calf Raise", sets: "3", reps: "12 / leg", notes: "3s down" },
      { name: "Bent-Knee Calf Raise", sets: "3", reps: "12–15 / leg", notes: "Soleus" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Hips stacked" },
      { name: "Dead Bug", sets: "3", reps: "6 / side", notes: "Low back flat" },
    ],
  },
  {
    area: "At-Home Prehab", name: "At-Home — Hips & Groin", focus: "Hips + groin block · at home",
    exercises: [
      { name: "Lateral Band Walk", sets: "2", reps: "10 steps each way", notes: "Band taut" },
      { name: "Clamshell", sets: "2", reps: "8–12 / side", notes: "Feet together" },
      { name: "Single-Leg Glute Bridge", sets: "2", reps: "8–12 / leg", notes: "Pelvis level" },
      { name: "Fire Hydrant", sets: "3", reps: "15 / side", notes: "Hips still" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "8–12 / side", notes: "3s down" },
      { name: "Band Adduction", sets: "2", reps: "10 / side", notes: "Groin top-up" },
      { name: "Adductor Squeeze", sets: "2", reps: "10", notes: "5s hold · gentle" },
    ],
  },
  {
    area: "At-Home Prehab", name: "At-Home — Ankles & Balance", focus: "Ankles + balance block · at home",
    exercises: [
      { name: "Ankle Alphabet", sets: "1", reps: "A–Z / foot", notes: "Move only at the ankle" },
      { name: "Single-Leg Stance", sets: "3", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Band Eversion", sets: "3", reps: "15 / side", notes: "Peroneals" },
      { name: "Band Inversion", sets: "3", reps: "12–15 / side", notes: "Pair with eversion" },
      { name: "Single-Leg Calf Raise", sets: "3", reps: "12 / leg", notes: "3s down" },
      { name: "Bent-Knee Calf Raise", sets: "3", reps: "12–15 / leg", notes: "Soleus" },
      { name: "Toe Walks", sets: "3", reps: "20m", notes: "Ankles straight" },
    ],
  },

  // ── FIFA 11+ — the base structure, ages 14+ ───────────────────────────
  {
    area: "FIFA 11+", name: "FIFA 11+ — Full (20 Min)", focus: "The full programme · 2x/week minimum",
    exercises: [
      { name: "Hip Open / Close (Gate)", sets: "2", reps: "8 / side", notes: "Part 1 — running" },
      { name: "Leg Swings", sets: "2", reps: "8 / side", notes: "Part 1 — running" },
      { name: "Front Plank (The Bench)", sets: "3", reps: "20–30s", notes: "Part 2 — strength" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Part 2 — strength" },
      { name: "Nordic Hamstring Curl", sets: "1", reps: "3–5", notes: "Part 2 — COACH-LED ONLY" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "Part 2 — balance" },
      { name: "Glute Bridge", sets: "2", reps: "10–15", notes: "Part 2 — squats family" },
      { name: "Hop-and-Stick", sets: "3", reps: "8 / side", notes: "Part 2 — jumping · COACH-SUPERVISED FIRST" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "8–12 / side", notes: "Added to 11+ — standard 11+ has no adductor work" },
      { name: "Single-Leg Calf Raise", sets: "3", reps: "12 / leg", notes: "Part 2 — ankle" },
    ],
  },
  {
    area: "FIFA 11+", name: "FIFA 11+ — Part 2 Only (~10 Min)", focus: "Strength / balance / plyo block alone",
    exercises: [
      { name: "Front Plank (The Bench)", sets: "3", reps: "20–30s", notes: "Part 2" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Part 2" },
      { name: "Nordic Hamstring Curl", sets: "1", reps: "3–5", notes: "Part 2 — COACH-LED ONLY" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "Part 2 — balance" },
      { name: "Glute Bridge", sets: "2", reps: "10–15", notes: "Part 2" },
      { name: "Hop-and-Stick", sets: "3", reps: "8 / side", notes: "Part 2 — COACH-SUPERVISED FIRST" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "8–12 / side", notes: "Added to 11+ — covers the groin gap" },
    ],
  },

  // ── Matchday — running parts only ──────────────────────────────────────
  {
    area: "Matchday", name: "Matchday Activation — Parts 1+3", focus: "Pre-game · running only · no strength block",
    exercises: [
      { name: "Leg Swings", sets: "1", reps: "8 / side", notes: "Part 1 — running" },
      { name: "Hip Open / Close (Gate)", sets: "1", reps: "8 / side", notes: "Part 1 — running" },
      { name: "Ankle Rocks", sets: "1", reps: "8 / side", notes: "Part 1 — running" },
      { name: "Lateral Band Walk", sets: "1", reps: "10 steps each way", notes: "Light activation only" },
      { name: "Single-Leg Stance", sets: "1", reps: "30s / leg", notes: "Part 2 skipped on match day" },
      { name: "Toe Walks", sets: "1", reps: "20m", notes: "Calves primed" },
    ],
  },

  // ── Single-focus blocks ────────────────────────────────────────────────
  {
    area: "Hips", name: "Hips — Band Block", focus: "Glute med + hip stability",
    exercises: [
      { name: "Lateral Band Walk", sets: "2", reps: "10 steps each way", notes: "Band taut, knees out" },
      { name: "Clamshell", sets: "2", reps: "8–12 / side", notes: "Feet together" },
      { name: "Glute Bridge", sets: "2", reps: "10–15", notes: "2–3s squeeze" },
      { name: "Single-Leg Glute Bridge", sets: "2", reps: "8–12 / leg", notes: "Pelvis level" },
      { name: "Fire Hydrant", sets: "3", reps: "15 / side", notes: "Hips still" },
      { name: "Standing Band Hip Flexion", sets: "2", reps: "10 / side", notes: "Torso tall" },
      { name: "Side-Lying Hip Abduction", sets: "2", reps: "10–15 / side", notes: "5s hold" },
    ],
  },
  {
    area: "Groin", name: "Groin — Copenhagen Block", focus: "Adductor strength · taught in person first",
    exercises: [
      { name: "Copenhagen Adductor — Isometric Short-Lever Hold", sets: "1", reps: "15–30s / side", notes: "Start here · partner or bench" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "8–12 / side", notes: "3s down · progress only when pain-free" },
      { name: "Band Adduction", sets: "2", reps: "10 / side", notes: "Lighter top-up" },
      { name: "Adductor Squeeze", sets: "2", reps: "10", notes: "5s hold · gentle" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Pairs with Copenhagen" },
    ],
  },
  {
    area: "Ankles", name: "Ankles — Balance & Calf Block", focus: "Sprain prevention · balance + peroneals + calf",
    exercises: [
      { name: "Single-Leg Stance", sets: "3", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Band Eversion", sets: "3", reps: "15 / side", notes: "Peroneals" },
      { name: "Band Inversion", sets: "3", reps: "12–15 / side", notes: "Pair with eversion" },
      { name: "Single-Leg Calf Raise", sets: "3", reps: "12 / leg", notes: "3s down" },
      { name: "Bent-Knee Calf Raise", sets: "3", reps: "12–15 / leg", notes: "Soleus" },
      { name: "Toe Walks", sets: "3", reps: "20m", notes: "Ankles straight" },
      { name: "Ankle Alphabet", sets: "1", reps: "A–Z / foot", notes: "Mobility + activation" },
    ],
  },
];

// Team-workout docs ready to write (caller adds createdAt/updatedAt/by fields).
export const workoutSeedDocs = () =>
  WORKOUT_SEED.map((w) => ({ name: w.name, area: w.area, focus: w.focus, exercises: w.exercises, seeded: true }));
