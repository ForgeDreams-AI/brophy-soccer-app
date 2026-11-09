// Starter lift library — 20 coach-ready lifts a Phoenix admin can drop into the
// exercise library in one tap. Shapes match a coach-authored custom exercise
// exactly (see CustomExerciseForm), so they group by equipment/muscle and are
// searchable just like the public Free Exercise DB entries.
//
// `type` is the movement pattern (used only for grouping in the seed dialog);
// it isn't persisted. Everything else is written to the `customExercises`
// collection verbatim. Seeding is additive and de-dupes by name, so it never
// touches lifts you've already created.

export const LIFT_SEED = [
  // ── Squat ──────────────────────────────────────────────────────────────
  {
    type: "Squat", name: "Back Squat", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "hamstrings", "lower back"],
    aliases: ["squat", "barbell squat"],
    instructions: [
      "Set the bar across your upper traps, brace your core, and unrack.",
      "Sit down and back, keeping your chest tall and knees tracking over your toes.",
      "Descend until your hips are at least parallel, then drive through mid-foot to stand.",
    ],
  },
  {
    type: "Squat", name: "Front Squat", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "abdominals"],
    aliases: ["front rack squat"],
    instructions: [
      "Rack the bar on your front delts with elbows high and fingers under the bar.",
      "Brace hard and squat straight down, keeping the torso vertical.",
      "Drive up without letting the elbows drop.",
    ],
  },
  {
    type: "Squat", name: "Goblet Squat", equipment: "dumbbell", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"],
    aliases: ["kettlebell goblet squat"],
    instructions: [
      "Hold a dumbbell or kettlebell against your chest with both hands.",
      "Squat down between your knees, keeping your chest up.",
      "Stand back up, squeezing your glutes at the top.",
    ],
  },
  // ── Hinge ──────────────────────────────────────────────────────────────
  {
    type: "Hinge", name: "Romanian Deadlift", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    aliases: ["rdl"],
    instructions: [
      "Stand tall holding the bar at your hips with a slight knee bend.",
      "Push your hips back and lower the bar along your legs until you feel a hamstring stretch.",
      "Drive your hips forward to return to standing — keep the bar close throughout.",
    ],
  },
  {
    type: "Hinge", name: "Trap-Bar Deadlift", equipment: "other", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "quadriceps", "traps"],
    aliases: ["hex bar deadlift"],
    instructions: [
      "Stand inside the trap bar and grip the handles at your sides.",
      "Brace, drop your hips, and drive through the floor to stand tall.",
      "Lower under control back to the floor.",
    ],
  },
  {
    type: "Hinge", name: "Hip Thrust", equipment: "barbell", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    aliases: ["barbell hip thrust", "glute bridge"],
    instructions: [
      "Sit with your upper back on a bench and roll a padded bar over your hips.",
      "Drive through your heels to lift your hips until your body is flat from knee to shoulder.",
      "Squeeze your glutes at the top, then lower under control.",
    ],
  },
  {
    type: "Hinge", name: "Nordic Hamstring Curl", equipment: "body only", level: "expert", mechanic: "isolation", category: "strength",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes"],
    aliases: ["nordic curl"],
    instructions: [
      "Kneel with your ankles anchored under a pad or held by a partner.",
      "Keeping a straight line from knee to head, lower your torso toward the floor as slowly as you can.",
      "Catch yourself with your hands, then push back to the start. Great for hamstring-injury prevention.",
    ],
  },
  // ── Single-leg ─────────────────────────────────────────────────────────
  {
    type: "Single-Leg", name: "Bulgarian Split Squat", equipment: "dumbbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "hamstrings"],
    aliases: ["rear foot elevated split squat", "bss"],
    instructions: [
      "Rest your rear foot on a bench behind you, holding dumbbells at your sides.",
      "Lower your back knee toward the floor, keeping the front shin near vertical.",
      "Drive through the front heel to stand. Complete all reps, then switch legs.",
    ],
  },
  {
    type: "Single-Leg", name: "Walking Lunge", equipment: "dumbbell", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "hamstrings"],
    aliases: ["dumbbell lunge"],
    instructions: [
      "Hold dumbbells at your sides and step forward into a lunge.",
      "Lower until both knees are about 90°, then drive up and step through with the other leg.",
      "Keep your torso tall and continue walking forward.",
    ],
  },
  {
    type: "Single-Leg", name: "Single-Leg RDL", equipment: "dumbbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    aliases: ["sl rdl", "single leg romanian deadlift"],
    instructions: [
      "Balance on one leg holding a dumbbell in the opposite hand.",
      "Hinge at the hip, lowering the weight while your free leg extends behind you.",
      "Return to standing with control. Builds balance and posterior-chain strength.",
    ],
  },
  // ── Push ───────────────────────────────────────────────────────────────
  {
    type: "Push", name: "Bench Press", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders"],
    aliases: ["barbell bench", "flat bench"],
    instructions: [
      "Lie on the bench, grip the bar slightly wider than shoulder width, and unrack.",
      "Lower the bar to mid-chest with elbows tucked ~45°.",
      "Press back up to lockout.",
    ],
  },
  {
    type: "Push", name: "Incline Dumbbell Press", equipment: "dumbbell", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "triceps"],
    aliases: ["incline db press"],
    instructions: [
      "Set a bench to ~30° and press two dumbbells to arm's length overhead.",
      "Lower under control until you feel a stretch across the chest.",
      "Press back up without clanging the dumbbells together.",
    ],
  },
  {
    type: "Push", name: "Overhead Press", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "traps"],
    aliases: ["ohp", "military press", "strict press"],
    instructions: [
      "Hold the bar at your front delts, elbows just in front of the bar, core braced.",
      "Press overhead, moving your head slightly back then through as the bar passes.",
      "Lock out with the bar over your mid-foot, then lower to the shoulders.",
    ],
  },
  // ── Pull ───────────────────────────────────────────────────────────────
  {
    type: "Pull", name: "Pull-up", equipment: "body only", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "middle back"],
    aliases: ["pullup", "chin up"],
    instructions: [
      "Hang from a bar with an overhand grip, shoulders set down and back.",
      "Pull your chest toward the bar by driving your elbows down.",
      "Lower under control to a full hang.",
    ],
  },
  {
    type: "Pull", name: "Barbell Row", equipment: "barbell", level: "intermediate", mechanic: "compound", category: "strength",
    primaryMuscles: ["middle back"], secondaryMuscles: ["lats", "biceps"],
    aliases: ["bent over row", "pendlay row"],
    instructions: [
      "Hinge to ~45°, holding the bar with an overhand grip.",
      "Row the bar to your lower ribs, squeezing your shoulder blades together.",
      "Lower with control, keeping your back flat throughout.",
    ],
  },
  {
    type: "Pull", name: "Lat Pulldown", equipment: "cable", level: "beginner", mechanic: "compound", category: "strength",
    primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "middle back"],
    aliases: ["pulldown"],
    instructions: [
      "Sit and grip the bar wider than shoulder width, thighs anchored.",
      "Pull the bar to your upper chest, leading with the elbows.",
      "Return to a full stretch under control.",
    ],
  },
  // ── Power / Olympic ────────────────────────────────────────────────────
  {
    type: "Power", name: "Hang Power Clean", equipment: "barbell", level: "expert", mechanic: "compound", category: "olympic weightlifting",
    primaryMuscles: ["traps"], secondaryMuscles: ["hamstrings", "glutes", "shoulders"],
    aliases: ["power clean", "hang clean"],
    instructions: [
      "Start with the bar at mid-thigh, back flat, shoulders over the bar.",
      "Explosively extend hips and shrug, pulling yourself under the bar.",
      "Catch on the front delts in a quarter squat, then stand tall. Move the bar FAST.",
    ],
  },
  {
    type: "Power", name: "Box Jump", equipment: "body only", level: "beginner", mechanic: "compound", category: "plyometrics",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "calves"],
    aliases: ["plyo box jump"],
    instructions: [
      "Stand a comfortable distance from a sturdy box.",
      "Dip and swing your arms, then jump and land softly on top with bent knees.",
      "Stand tall, then step down and reset each rep.",
    ],
  },
  {
    type: "Power", name: "Lateral Bound", equipment: "body only", level: "beginner", mechanic: "compound", category: "plyometrics",
    primaryMuscles: ["glutes"], secondaryMuscles: ["quadriceps", "hamstrings", "calves"],
    aliases: ["skater jump", "speed skater"],
    instructions: [
      "Balance on one leg, then push off laterally to land on the opposite leg.",
      "Stick the landing with a soft, stable knee before bounding back.",
      "Builds change-of-direction power for cutting and sprinting.",
    ],
  },
  // ── Core ───────────────────────────────────────────────────────────────
  {
    type: "Core", name: "Copenhagen Plank", equipment: "body only", level: "intermediate", mechanic: "isolation", category: "strength",
    primaryMuscles: ["adductors"], secondaryMuscles: ["abdominals"],
    aliases: ["copenhagen adduction"],
    instructions: [
      "Lie on your side with your top foot on a bench, bottom leg hanging.",
      "Prop on your forearm and lift your hips so your body forms a straight line.",
      "Hold for time, then switch sides. Targets groin/adductor strength for injury prevention.",
    ],
  },
];

// Map each seed lift into a Firestore `customExercises` doc. Drops the display-
// only `type` field. Caller adds createdAt.
export const liftSeedDocs = () =>
  LIFT_SEED.map((lift) => {
    const doc = { ...lift };
    delete doc.type;
    return {
      ...doc,
      secondaryMuscles: doc.secondaryMuscles || [],
      aliases: doc.aliases || [],
      images: [],
      seeded: true,
    };
  });
