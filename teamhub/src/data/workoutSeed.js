// Starter TEAM WORKOUTS — ~20 ready-to-run sessions a coach can drop into Team
// Workouts in one tap, grouped into focus areas (Strength, Speed & Power,
// Conditioning, Recovery & Care, Soccer). Each becomes a teamWorkouts doc with
// its exercises, so players see the full session. Seeding is additive and
// de-dupes by name, so it never disturbs workouts you've already built.
//
// Exercise shape matches a workout entry: { name, sets, reps, notes }. Loads are
// written as human notes (e.g. "85% 1RM") so they read clearly without needing
// each athlete's max on file.

export const AREA_ORDER = ["Strength", "Speed & Power", "Conditioning", "Recovery & Care", "Soccer"];

export const WORKOUT_SEED = [
  // ── Strength ─────────────────────────────────────────────────────────────
  {
    area: "Strength", name: "Lower Body Strength", focus: "Max strength · posterior chain + legs",
    exercises: [
      { name: "Back Squat", sets: "4", reps: "4", notes: "85% 1RM · 3 min rest" },
      { name: "Romanian Deadlift", sets: "4", reps: "6", notes: "RPE 8" },
      { name: "Bulgarian Split Squat", sets: "3", reps: "8 / leg", notes: "Controlled" },
      { name: "Standing Calf Raise", sets: "3", reps: "10", notes: "2s pause at top" },
      { name: "Weighted Plank", sets: "3", reps: "40s", notes: "Brace hard" },
    ],
  },
  {
    area: "Strength", name: "Upper Body Strength", focus: "Push / pull max strength",
    exercises: [
      { name: "Bench Press", sets: "4", reps: "4", notes: "85% 1RM · 3 min rest" },
      { name: "Weighted Pull-up", sets: "4", reps: "5", notes: "RPE 8" },
      { name: "Overhead Press", sets: "3", reps: "5", notes: "80% 1RM" },
      { name: "Barbell Row", sets: "3", reps: "6", notes: "Controlled tempo" },
      { name: "Face Pull", sets: "3", reps: "12", notes: "Shoulder health" },
    ],
  },
  {
    area: "Strength", name: "Full-Body Strength", focus: "Big compounds, balanced push/pull",
    exercises: [
      { name: "Trap-Bar Deadlift", sets: "4", reps: "5", notes: "80% 1RM" },
      { name: "Bench Press", sets: "3", reps: "6", notes: "RPE 8" },
      { name: "Pull-up", sets: "3", reps: "8", notes: "Add weight if easy" },
      { name: "Walking Lunge", sets: "3", reps: "10 / leg", notes: "Dumbbells" },
      { name: "Pallof Press", sets: "3", reps: "10 / side", notes: "Anti-rotation core" },
    ],
  },
  {
    area: "Strength", name: "Max Strength — Lower", focus: "Heavy, low-volume peaking",
    exercises: [
      { name: "Back Squat", sets: "5", reps: "3", notes: "87% 1RM · full rest" },
      { name: "Hip Thrust", sets: "4", reps: "5", notes: "RPE 8" },
      { name: "Nordic Hamstring Curl", sets: "3", reps: "6", notes: "Slow eccentric" },
      { name: "Copenhagen Plank", sets: "3", reps: "20s / side", notes: "Adductor strength" },
    ],
  },
  {
    area: "Strength", name: "Hypertrophy — Full Body", focus: "Muscle gain · 8–12 reps near failure",
    exercises: [
      { name: "Front Squat", sets: "3", reps: "10", notes: "RPE 8" },
      { name: "Incline Dumbbell Press", sets: "3", reps: "10", notes: "1–2 reps in reserve" },
      { name: "Lat Pulldown", sets: "3", reps: "12", notes: "Full stretch" },
      { name: "Walking Lunge", sets: "3", reps: "12 / leg", notes: "Dumbbells" },
      { name: "Dumbbell Curl + Triceps Pushdown", sets: "3", reps: "12", notes: "Superset" },
    ],
  },

  // ── Speed & Power ────────────────────────────────────────────────────────
  {
    area: "Speed & Power", name: "Explosive Power", focus: "Speed-strength · move fast",
    exercises: [
      { name: "Hang Power Clean", sets: "5", reps: "3", notes: "~70% 1RM · max bar speed" },
      { name: "Trap-Bar Jump", sets: "4", reps: "3", notes: "30–40% 1RM · explosive" },
      { name: "Box Jump", sets: "4", reps: "4", notes: "Step down, reset each rep" },
      { name: "Med-Ball Rotational Throw", sets: "3", reps: "5 / side", notes: "Full hip turn" },
      { name: "Broad Jump", sets: "3", reps: "4", notes: "Stick the landing" },
    ],
  },
  {
    area: "Speed & Power", name: "Acceleration & Speed", focus: "First-step + top-end speed",
    exercises: [
      { name: "Wall Drive Drill", sets: "3", reps: "10 / leg", notes: "Sharp knee drive" },
      { name: "10m Sprints", sets: "6", reps: "1", notes: "Full recovery" },
      { name: "Resisted Sprint (sled/band)", sets: "4", reps: "15m", notes: "Drive phase" },
      { name: "Flying 20s", sets: "4", reps: "1", notes: "Build-up then max 20m" },
      { name: "A-Skips", sets: "3", reps: "20m", notes: "Rhythm + posture" },
    ],
  },
  {
    area: "Speed & Power", name: "Plyometrics", focus: "Reactive strength + landing control",
    exercises: [
      { name: "Pogo Hops", sets: "3", reps: "10", notes: "Stiff ankles, quick contacts" },
      { name: "Box Jump", sets: "4", reps: "4", notes: "Soft landing" },
      { name: "Lateral Bound", sets: "4", reps: "4 / side", notes: "Stick it" },
      { name: "Depth Drop to Stick", sets: "3", reps: "4", notes: "Land + hold 2s" },
      { name: "Single-Leg Bound", sets: "3", reps: "5 / leg", notes: "Distance + control" },
    ],
  },
  {
    area: "Speed & Power", name: "Change of Direction", focus: "Cutting + agility",
    exercises: [
      { name: "5-10-5 Shuttle", sets: "6", reps: "1", notes: "Full recovery between" },
      { name: "Cone Cut Drill", sets: "4", reps: "2", notes: "Plant + accelerate out" },
      { name: "Lateral Shuffle", sets: "3", reps: "20m", notes: "Stay low" },
      { name: "Reactive Mirror Drill", sets: "4", reps: "20s", notes: "React to partner" },
    ],
  },

  // ── Conditioning ─────────────────────────────────────────────────────────
  {
    area: "Conditioning", name: "Repeat-Sprint Engine", focus: "Repeat-sprint ability",
    exercises: [
      { name: "30m Repeat Sprints", sets: "8", reps: "1", notes: "25s between reps" },
      { name: "Shuttle Runs (5-10-5)", sets: "6", reps: "1", notes: "Full recovery" },
      { name: "Kettlebell Swing", sets: "4", reps: "20", notes: "Hip snap, RPE 7" },
      { name: "Sled Push", sets: "5", reps: "20m", notes: "Heavy, steady" },
    ],
  },
  {
    area: "Conditioning", name: "Aerobic Base", focus: "Build the engine",
    exercises: [
      { name: "Tempo Run", sets: "1", reps: "15 min", notes: "Conversational pace" },
      { name: "Bike Intervals", sets: "6", reps: "2 min", notes: "2 min easy between" },
      { name: "Row", sets: "4", reps: "500m", notes: "Steady, controlled" },
      { name: "Cooldown Jog", sets: "1", reps: "8 min", notes: "Easy" },
    ],
  },
  {
    area: "Conditioning", name: "Match-Fit Circuit", focus: "Full-body engine circuit",
    exercises: [
      { name: "Assault Bike", sets: "5", reps: "30s", notes: "All-out · circuit" },
      { name: "Burpees", sets: "5", reps: "12", notes: "Circuit" },
      { name: "Kettlebell Swing", sets: "5", reps: "15", notes: "Circuit" },
      { name: "Mountain Climbers", sets: "5", reps: "30s", notes: "Circuit" },
      { name: "Plank", sets: "5", reps: "45s", notes: "Rest 90s, repeat" },
    ],
  },
  {
    area: "Conditioning", name: "Small-Sided Games", focus: "Conditioning with the ball",
    exercises: [
      { name: "4v4 Small-Sided Game", sets: "6", reps: "3 min", notes: "2 min rest · high intensity" },
      { name: "Transition Runs", sets: "4", reps: "1", notes: "End-to-end on the whistle" },
      { name: "Recovery Walk", sets: "1", reps: "5 min", notes: "Between blocks" },
    ],
  },

  // ── Recovery & Care ──────────────────────────────────────────────────────
  {
    area: "Recovery & Care", name: "Mobility Flow", focus: "Movement prep + range of motion",
    exercises: [
      { name: "World's Greatest Stretch", sets: "2", reps: "5 / side", notes: "Open hips + T-spine" },
      { name: "90/90 Hip Switch", sets: "2", reps: "8 / side", notes: "Controlled" },
      { name: "Couch Stretch", sets: "2", reps: "45s / side", notes: "Hip flexors" },
      { name: "T-Spine Rotation", sets: "2", reps: "8 / side", notes: "Reach and rotate" },
      { name: "Ankle Wall Mobilization", sets: "2", reps: "10 / side", notes: "Knee over toe" },
    ],
  },
  {
    area: "Recovery & Care", name: "Prehab & Injury Prevention", focus: "Stay durable — hamstrings, groin, ankles",
    exercises: [
      { name: "Nordic Hamstring Curl", sets: "3", reps: "6", notes: "Slow eccentric" },
      { name: "Copenhagen Plank", sets: "3", reps: "20s / side", notes: "Adductor strength" },
      { name: "Banded Monster Walk", sets: "3", reps: "12 / side", notes: "Glute med" },
      { name: "Single-Leg Balance", sets: "3", reps: "30s / leg", notes: "Eyes closed to progress" },
      { name: "Calf Raise (bent + straight)", sets: "3", reps: "12", notes: "Achilles resilience" },
    ],
  },
  {
    area: "Recovery & Care", name: "Active Recovery", focus: "Flush + down-regulate",
    exercises: [
      { name: "Light Bike or Jog", sets: "1", reps: "12 min", notes: "Easy pace" },
      { name: "Foam Rolling", sets: "1", reps: "8 min", notes: "Quads, glutes, calves, back" },
      { name: "Dynamic Stretch", sets: "1", reps: "6 min", notes: "Full body" },
      { name: "Diaphragmatic Breathing", sets: "1", reps: "3 min", notes: "Down-regulate" },
    ],
  },
  {
    area: "Recovery & Care", name: "Core Stability", focus: "Anti-rotation + bracing",
    exercises: [
      { name: "Pallof Press", sets: "3", reps: "10 / side", notes: "Anti-rotation" },
      { name: "Dead Bug", sets: "3", reps: "8 / side", notes: "Low back flat" },
      { name: "Side Plank", sets: "3", reps: "30s / side", notes: "Stack hips" },
      { name: "Bird Dog", sets: "3", reps: "8 / side", notes: "Slow, no wobble" },
      { name: "Hollow Hold", sets: "3", reps: "20s", notes: "Ribs down" },
    ],
  },

  // ── Soccer ───────────────────────────────────────────────────────────────
  {
    area: "Soccer", name: "Soccer · Off-Season Power", focus: "Posterior chain, repeat-sprint, CoD",
    exercises: [
      { name: "Trap-Bar Deadlift", sets: "4", reps: "4", notes: "82% 1RM" },
      { name: "Nordic Hamstring Curl", sets: "3", reps: "6", notes: "Injury prevention" },
      { name: "Lateral Bound", sets: "4", reps: "4 / side", notes: "Stick the landing" },
      { name: "Repeat-Sprint (30m)", sets: "8", reps: "1", notes: "25s between reps" },
      { name: "Copenhagen Plank", sets: "3", reps: "20s / side", notes: "Adductor strength" },
    ],
  },
  {
    area: "Soccer", name: "Soccer · In-Season Maintenance", focus: "Keep strength + speed on low volume",
    exercises: [
      { name: "Back Squat", sets: "3", reps: "3", notes: "85% 1RM · low volume" },
      { name: "Hip Thrust", sets: "3", reps: "6", notes: "RPE 7" },
      { name: "Pogo Hops", sets: "3", reps: "10", notes: "Quick contacts" },
      { name: "Acceleration Sprints (20m)", sets: "5", reps: "1", notes: "Full recovery" },
    ],
  },
  {
    area: "Soccer", name: "Matchday Activation", focus: "Prime the body pre-game",
    exercises: [
      { name: "Dynamic Warm-up", sets: "1", reps: "6 min", notes: "Leg swings, lunges, skips" },
      { name: "Band Glute Activation", sets: "2", reps: "12", notes: "Monster walks + bridges" },
      { name: "Short Sprints (build-ups)", sets: "4", reps: "1", notes: "70→90→100%" },
      { name: "Ball Work / Rondo", sets: "1", reps: "8 min", notes: "Sharp touches" },
    ],
  },
];

// Team-workout docs ready to write (caller adds createdAt/updatedAt/by fields).
export const workoutSeedDocs = () =>
  WORKOUT_SEED.map((w) => ({ name: w.name, area: w.area, focus: w.focus, exercises: w.exercises, seeded: true }));
