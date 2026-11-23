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

export const AREA_ORDER = ["Pre-Practice Prehab", "At-Home Prehab", "FIFA 11+", "Matchday", "Hips", "Groin", "Ankles", "Return to Play"];

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
      { name: "Fire Hydrant", sets: "2", reps: "15 / side", notes: "Hips still" },
      { name: "Standing Band Hip Flexion", sets: "2", reps: "10 / side", notes: "Torso tall" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "3–5 / side → build to 8–12", notes: "3s down · only once the hold is easy" },
      { name: "Band Adduction", sets: "2", reps: "10 / side", notes: "Groin top-up" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Band Eversion", sets: "2", reps: "15 / side", notes: "Peroneals" },
      { name: "Band Inversion", sets: "2", reps: "12–15 / side", notes: "Pair with eversion" },
      { name: "Single-Leg Calf Raise", sets: "2", reps: "12 / leg", notes: "3s down" },
      { name: "Bent-Knee Calf Raise", sets: "2", reps: "12–15 / leg", notes: "Soleus" },
      { name: "Side Plank", sets: "2", reps: "20–30s / side", notes: "Hips stacked" },
      { name: "Dead Bug", sets: "2", reps: "6 / side", notes: "Low back flat" },
    ],
  },
  {
    area: "At-Home Prehab", name: "At-Home — Hips & Groin", focus: "Hips + groin block · at home",
    exercises: [
      { name: "Lateral Band Walk", sets: "2", reps: "10 steps each way", notes: "Band taut" },
      { name: "Clamshell", sets: "2", reps: "8–12 / side", notes: "Feet together" },
      { name: "Single-Leg Glute Bridge", sets: "2", reps: "8–12 / leg", notes: "Pelvis level" },
      { name: "Fire Hydrant", sets: "3", reps: "15 / side", notes: "Hips still" },
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "3–5 / side → build to 8–12", notes: "3s down · only once the hold is easy" },
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

  // ── FIFA 11+ — the real programme (official manual, Level 1) ─────────
  // Part 1 running (~8 min) → Part 2 strength/plyo/balance (~10 min) →
  // Part 3 running (~2 min). At least 2x/week. Level 1 doses shown; move to
  // Level 2/3 only when an exercise is easy with perfect form.
  {
    area: "FIFA 11+", name: "FIFA 11+ — Full Programme (20 Min)", focus: "Official FIFA 11+ · Parts 1–3 · Level 1 · 2x/week minimum",
    exercises: [
      { name: "Running — Straight Ahead", sets: "2", reps: "length of the course", notes: "Part 1 — running" },
      { name: "Hip Open / Close (Gate)", sets: "2", reps: "hip out, then hip in", notes: "Part 1 — running hip out / hip in" },
      { name: "Running — Circling Partner", sets: "2", reps: "every cone", notes: "Part 1 — running" },
      { name: "Running — Shoulder Contact", sets: "2", reps: "every cone", notes: "Part 1 — running" },
      { name: "Running — Quick Forwards & Backwards", sets: "2", reps: "2 cones fwd, 1 back", notes: "Part 1 — running" },
      { name: "Front Plank (The Bench)", sets: "3", reps: "20–30s", notes: "Part 2 — Level 1 static" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Part 2 — sideways bench, Level 1 static" },
      { name: "Nordic Hamstring Curl", sets: "1", reps: "3–5", notes: "Part 2 — beginner · COACH-LED ONLY" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "Part 2 — hold the ball" },
      { name: "Squats with Toe Raise", sets: "2", reps: "30s", notes: "Part 2 — Level 1" },
      { name: "Vertical Jumps", sets: "2", reps: "30s", notes: "Part 2 — Level 1" },
      { name: "Running Across the Pitch", sets: "2", reps: "~40 m at 75–80%", notes: "Part 3 — running" },
      { name: "Bounding", sets: "2", reps: "across the pitch", notes: "Part 3 — running" },
      { name: "Plant & Cut", sets: "2", reps: "alternate sides", notes: "Part 3 — running" },
    ],
  },
  {
    area: "FIFA 11+", name: "FIFA 11+ — Part 2 Only (~10 Min)", focus: "Strength / balance / plyo block · Level 1",
    exercises: [
      { name: "Front Plank (The Bench)", sets: "3", reps: "20–30s", notes: "Level 1 static" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "Sideways bench, Level 1 static" },
      { name: "Nordic Hamstring Curl", sets: "1", reps: "3–5", notes: "Beginner · COACH-LED ONLY" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "Hold the ball" },
      { name: "Squats with Toe Raise", sets: "2", reps: "30s", notes: "Level 1" },
      { name: "Vertical Jumps", sets: "2", reps: "30s", notes: "Level 1" },
    ],
  },
  {
    area: "FIFA 11+", name: "FIFA 11+ Plus Groin (Copenhagen Add-On)", focus: "FIFA 11+ Part 2 + the Copenhagen groin exercise (the 11+ has no adductor work)",
    exercises: [
      { name: "Front Plank (The Bench)", sets: "3", reps: "20–30s", notes: "11+ Part 2" },
      { name: "Side Plank", sets: "3", reps: "20–30s / side", notes: "11+ Part 2" },
      { name: "Nordic Hamstring Curl", sets: "1", reps: "3–5", notes: "COACH-LED ONLY" },
      { name: "Single-Leg Stance", sets: "2", reps: "30s / leg", notes: "11+ Part 2" },
      { name: "Squats with Toe Raise", sets: "2", reps: "30s", notes: "11+ Part 2" },
      { name: "Vertical Jumps", sets: "2", reps: "30s", notes: "11+ Part 2" },
      { name: "Copenhagen Adductor — Isometric Short-Lever Hold", sets: "1", reps: "15–20s / side", notes: "Add-on · progress to the dynamic version when easy" },
    ],
  },

  // ── Matchday — FIFA 11+ Parts 1 and 3 only (no strength block) ─────────
  {
    area: "Matchday", name: "Matchday Warm-Up — FIFA 11+ Parts 1 + 3", focus: "Pre-game · running parts of the 11+ only · no strength block",
    exercises: [
      { name: "Running — Straight Ahead", sets: "2", reps: "length of the course", notes: "Part 1" },
      { name: "Hip Open / Close (Gate)", sets: "2", reps: "hip out, then hip in", notes: "Part 1" },
      { name: "Running — Circling Partner", sets: "2", reps: "every cone", notes: "Part 1" },
      { name: "Running — Shoulder Contact", sets: "2", reps: "every cone", notes: "Part 1" },
      { name: "Running — Quick Forwards & Backwards", sets: "2", reps: "2 cones fwd, 1 back", notes: "Part 1" },
      { name: "Running Across the Pitch", sets: "2", reps: "~40 m at 75–80%", notes: "Part 3" },
      { name: "Bounding", sets: "2", reps: "across the pitch", notes: "Part 3" },
      { name: "Plant & Cut", sets: "2", reps: "alternate sides", notes: "Part 3" },
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
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "3–5 / side → build to 8–12", notes: "3s down · progress only when pain-free" },
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

  // ── Return to Play — ONLY after athletic-trainer / physio clearance ───
  // Staged and criteria-based: move to the next stage only when the listed
  // criteria are met and there's no pain during or the day after. Drafted
  // from published return-to-play guidance; your athletic trainer adjusts
  // doses and decides when a player is ready for full training and games.
  {
    area: "Return to Play", name: "Return to Play — Ankle Sprain · Stage 1 (Move & Load)", focus: "Trainer-cleared only · walking pain-free → progress when you can do 20 single-leg calf raises",
    exercises: [
      { name: "Ankle Alphabet", sets: "2", reps: "A–Z / foot", notes: "Pain-free range only" },
      { name: "Double-Leg Calf Raise", sets: "3", reps: "15", notes: "3s down" },
      { name: "Band Eversion", sets: "3", reps: "15", notes: "Light band" },
      { name: "Band Inversion", sets: "3", reps: "12–15", notes: "Light band" },
      { name: "Single-Leg Stance", sets: "3", reps: "30s / leg", notes: "Hold a wall at first" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Ankle Sprain · Stage 2 (Balance & Hop)", focus: "Trainer-cleared only · progress when you can hop and land 10x on the injured leg without pain or wobble",
    exercises: [
      { name: "Single-Leg Calf Raise", sets: "3", reps: "12–20 / leg", notes: "3s down" },
      { name: "Single-Leg Stance", sets: "3", reps: "30s / leg", notes: "Eyes closed, then on a towel" },
      { name: "Lateral Line Hops", sets: "3", reps: "20s", notes: "Both feet → injured leg" },
      { name: "Hop-and-Stick", sets: "3", reps: "6 / side", notes: "Small hops · stick 2s" },
      { name: "Progressive Running", sets: "1", reps: "jog → 75%", notes: "Straight lines only" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Ankle Sprain · Stage 3 (Cut & Play)", focus: "Trainer-cleared only · back to full training when you cut at full speed with no pain or giving way",
    exercises: [
      { name: "Figure-8 & Cutting Runs", sets: "4", reps: "wide → sharp cuts", notes: "Half speed → full speed" },
      { name: "Plant & Cut", sets: "3", reps: "alternate sides", notes: "80–90% speed" },
      { name: "Hop-and-Stick", sets: "3", reps: "8 / side", notes: "Add direction changes" },
      { name: "Passing & Kicking Progression", sets: "1", reps: "short → long", notes: "With the ball" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Hamstring Strain · Stage 1 (Isometrics & Extender)", focus: "Trainer-cleared only · walking and jogging pain-free → progress when the Extender is pain-free at full range",
    exercises: [
      { name: "Isometric Hamstring Bridge (Heel Dig)", sets: "5", reps: "10–30s hold", notes: "Effort pain ≤ 3/10" },
      { name: "Hamstring Extender (L-Protocol)", sets: "3", reps: "12", notes: "Daily · slow" },
      { name: "Glute Bridge", sets: "2", reps: "10–15", notes: "Both legs" },
      { name: "Progressive Running", sets: "1", reps: "easy jog", notes: "Pain-free only" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Hamstring Strain · Stage 2 (L-Protocol)", focus: "Trainer-cleared only · progress when Diver and Glider are pain-free and you run 75% strides comfortably",
    exercises: [
      { name: "Hamstring Extender (L-Protocol)", sets: "3", reps: "12", notes: "Daily" },
      { name: "Hamstring Diver (L-Protocol)", sets: "3", reps: "6", notes: "Every other day" },
      { name: "Hamstring Glider (L-Protocol)", sets: "3", reps: "4", notes: "Every third day" },
      { name: "Single-Leg Glute Bridge", sets: "2", reps: "8–12 / leg", notes: "Pelvis level" },
      { name: "Progressive Running", sets: "1", reps: "60% → 75% strides", notes: "Next speed only if fine the day after" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Hamstring Strain · Stage 3 (Sprint & Nordic)", focus: "Trainer-cleared only · back to full training after pain-free full sprints and the trainer's strength check",
    exercises: [
      { name: "Progressive Running", sets: "1", reps: "90% → full sprints", notes: "Build over sessions" },
      { name: "Nordic Hamstring Curl", sets: "2", reps: "3–5", notes: "Coach-led · slow lowering" },
      { name: "Hamstring Diver (L-Protocol)", sets: "3", reps: "6", notes: "Faster tempo" },
      { name: "Bounding", sets: "2", reps: "across the pitch", notes: "Only once sprints are pain-free" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Groin Strain · Stage 1 (Squeeze & Lift)", focus: "Trainer-cleared only · progress when the adductor squeeze and side-lying lift are pain-free",
    exercises: [
      { name: "Adductor Squeeze", sets: "3", reps: "10 × 5s", notes: "Pain ≤ 3/10" },
      { name: "Side-Lying Adductor Lift", sets: "3", reps: "10–15", notes: "Slow" },
      { name: "Glute Bridge", sets: "2", reps: "10–15", notes: "" },
      { name: "Progressive Running", sets: "1", reps: "easy jog", notes: "Straight lines" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Groin Strain · Stage 2 (Copenhagen Build)", focus: "Trainer-cleared only · progress when the Copenhagen hold is easy and lateral moves are pain-free",
    exercises: [
      { name: "Copenhagen Adductor — Isometric Short-Lever Hold", sets: "3", reps: "15–30s / side", notes: "Start here" },
      { name: "Band Adduction", sets: "3", reps: "10–12", notes: "" },
      { name: "Lateral Band Walk", sets: "2", reps: "10 steps each way", notes: "" },
      { name: "Progressive Running", sets: "1", reps: "jog → 75% + side shuffles", notes: "" },
      { name: "Passing & Kicking Progression", sets: "1", reps: "short passes only", notes: "No long kicks yet" },
    ],
  },
  {
    area: "Return to Play", name: "Return to Play — Groin Strain · Stage 3 (Cut, Kick & Play)", focus: "Trainer-cleared only · back to full training when you cut, sprint and strike the ball hard without pain",
    exercises: [
      { name: "Copenhagen Adductor — Short-Lever Dynamic", sets: "1", reps: "3–5 / side → build to 8–12", notes: "3s down" },
      { name: "Figure-8 & Cutting Runs", sets: "4", reps: "wide → sharp cuts", notes: "" },
      { name: "Plant & Cut", sets: "3", reps: "alternate sides", notes: "80–90% speed" },
      { name: "Passing & Kicking Progression", sets: "1", reps: "long passes → shooting", notes: "Shooting last" },
    ],
  },
];

// ── One-time upgrade of already-seeded workouts ─────────────────────────────
// Fingerprints of the v1 starter workouts (before the 2026-11-23 content
// audit). A workout in the database is upgraded to the new version ONLY if it
// still matches its v1 fingerprint (nobody edited it). Renamed ones map below.
export const WORKOUT_V1_FP = {"Pre-Practice Prehab — 12 Min":"13r0bv4","Pre-Practice — Hips & Groin Only":"slppwf","At-Home Prehab — Full (2 Sets)":"8mn5j2","At-Home — Hips & Groin":"1sy6rls","At-Home — Ankles & Balance":"1fqm2ky","FIFA 11+ — Full (20 Min)":"1ej12ld","FIFA 11+ — Part 2 Only (~10 Min)":"1fx53zu","Matchday Activation — Parts 1+3":"6q2a0c","Hips — Band Block":"liz9kn","Groin — Copenhagen Block":"1nsf6j3","Ankles — Balance & Calf Block":"1saihqg"};
export const WORKOUT_RENAMES = {
  "FIFA 11+ — Full (20 Min)": "FIFA 11+ — Full Programme (20 Min)",
  "Matchday Activation — Parts 1+3": "Matchday Warm-Up — FIFA 11+ Parts 1 + 3",
};
export const fpString = (s) => { let x = 5381; for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(36); };
export const fpExercises = (exs) => fpString(JSON.stringify((exs || []).map((e) => [e.name, String(e.sets), String(e.reps), e.notes || ""])));

// Team-workout docs ready to write (caller adds createdAt/updatedAt/by fields).
export const workoutSeedDocs = () =>
  WORKOUT_SEED.map((w) => ({ name: w.name, area: w.area, focus: w.focus, exercises: w.exercises, seeded: true }));
