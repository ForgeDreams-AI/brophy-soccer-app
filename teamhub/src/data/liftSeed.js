// Starter PREHAB library — in-season recovery / joint strength / band work
// for Brophy high-school players (ages 14–18). This is the routine players do
// BEFORE EVERY PRACTICE and ON THEIR OWN AT HOME. Bands only, minimal
// equipment — it is NOT the school lifting program (2x/week at school), which
// is separate and handled elsewhere.
//
// Evidence base: FIFA 11+ (ages 14+) as the structure; the Copenhagen
// adductor programme (Haroy et al., BJSM 2019 — 41% lower groin-problem risk;
// Fujisaki et al. 2022, Japanese high-school boys); FC Barcelona Innovation
// Hub ankle + Copenhagen guidance; NSCA/AAP youth resistance-training
// guidance. See ~/workspace/research_notes/pro-soccer-inseason-prehab-band-work-20261109-0311/report.md
// for the full evidence and sources.
//
// Doses: pre-practice = 1 set of each as activation; at home = the fuller
// 2-set dose, 2-3x/week. Teenagers start Copenhagen at ~50% of adult volume
// and at the short-lever / isometric level first. In-season rules: cut volume,
// never train to failure, technique before load, stop if pain > 3/10.
//
// Shapes match a coach-authored custom exercise exactly (see
// CustomExerciseForm), so they group by equipment/muscle and are searchable
// just like the public Free Exercise DB entries.
//
// `type` is the movement block (used only for grouping in the seed dialog);
// it isn't persisted. Everything else is written to the `customExercises`
// collection verbatim. Seeding is additive and de-dupes by name, so it never
// touches lifts you've already created.

export const LIFT_SEED = [
  // ── Mobility — 0–2 min, dynamic first ─────────────────────────────────
  {
    type: "Mobility", name: "Ankle Rocks", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["ankle mobilization", "knee over toe rocks"],
    instructions: [
      "Stand facing a wall, one foot forward, knee tracking over the toes.",
      "Rock the knee forward over the toes without lifting the heel, then back.",
      "8 per side, slow and controlled — opens ankle range before running.",
    ],
  },
  {
    type: "Mobility", name: "Leg Swings", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["hip flexors", "glutes"],
    aliases: ["front-to-back leg swings", "dynamic leg swing"],
    instructions: [
      "Hold a wall or partner for balance and swing one leg forward and back.",
      "Keep the swing relaxed and let the range grow — do not force it.",
      "8 per side, then switch legs.",
    ],
  },
  {
    type: "Mobility", name: "Hip Open / Close (Gate)", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hip flexors"], secondaryMuscles: ["glutes", "adductors"],
    aliases: ["gate opener", "hip circles"],
    instructions: [
      "Walk forward, lifting one knee and opening the hip out to the side, then set the foot down.",
      "On the way back, lift the knee and close the hip in across the body.",
      "8 per side each direction — part of FIFA 11+ Part 1 (Hip out / Hip in).",
    ],
  },

  // ── Hips — band work, 2–5 min ─────────────────────────────────────────
  {
    type: "Hips — Band", name: "Lateral Band Walk", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hip abductors"],
    aliases: ["monster walk", "band walks", "crab walk"],
    instructions: [
      "Loop a mini-band above your knees (ankles = harder), quarter-squat, chest up.",
      "Step sideways keeping tension on the band — don't let the knees collapse in.",
      "10 steps each way, 1–2 sets. Keep the band taut the whole time.",
    ],
  },
  {
    type: "Hips — Band", name: "Clamshell", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hip abductors"], secondaryMuscles: ["glutes"],
    aliases: ["band clamshell"],
    instructions: [
      "Lie on your side, knees bent, band around your lower thighs, feet together.",
      "Rotate the top knee up like opening a clamshell, keeping the feet touching.",
      "2 sets of 8–12 per side. Don't roll the hips back — stay stacked.",
    ],
  },
  {
    type: "Hips — Band", name: "Glute Bridge", equipment: "band", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    aliases: ["band glute bridge", "hip bridge"],
    instructions: [
      "Lie on your back, knees bent, band just above the knees, feet flat.",
      "Drive through your heels and squeeze your glutes to lift your hips until your body is flat from knee to shoulder.",
      "Hold 2–3 seconds at the top, then lower under control. 2 sets of 10–15.",
    ],
  },
  {
    type: "Hips — Band", name: "Single-Leg Glute Bridge", equipment: "band", level: "intermediate", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings"],
    aliases: ["single leg bridge", "sl glute bridge"],
    instructions: [
      "Lie on your back, one knee bent with the foot flat, the other leg extended straight up.",
      "Drive through the planted heel to lift your hips, keeping the pelvis level — don't let it tip.",
      "2 sets of 8–12 per leg. Slow and controlled.",
    ],
  },
  {
    type: "Hips — Band", name: "Fire Hydrant", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["glutes"], secondaryMuscles: ["hip abductors"],
    aliases: ["band fire hydrant", "quadruped hip abduction"],
    instructions: [
      "On hands and knees, band just above the knees, back flat.",
      "Lift one knee out to the side like a dog at a hydrant, keeping the knee bent 90°.",
      "3 sets of 15 per side. Don't let the hips rock — the movement is all in the hip.",
    ],
  },
  {
    type: "Hips — Band", name: "Standing Band Hip Flexion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hip flexors"], secondaryMuscles: ["quadriceps"],
    aliases: ["band knee drive", "hip flexor march"],
    instructions: [
      "Stand tall with a band looped around one ankle, anchored low behind you.",
      "Drive the knee up against the band to hip height, then lower slowly.",
      "10 per side. Keep the torso tall — no leaning back.",
    ],
  },
  {
    type: "Hips — Band", name: "Side-Lying Hip Abduction", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hip abductors"], secondaryMuscles: ["glutes"],
    aliases: ["side lying leg lift", "band leg lift"],
    instructions: [
      "Lie on your side, bottom leg bent, top leg straight, band around the ankles.",
      "Lift the top leg up and slightly back, hold 5 seconds, then lower slowly.",
      "2 sets of 10–15 per side.",
    ],
  },

  // ── Groin — Copenhagen adductor programme ──────────────────────────────
  // The single best-evidenced groin intervention (Haroy et al. 2019: 41%
  // lower groin-problem risk). Teach IN PERSON first — do not assign the full
  // dynamic version as unsupervised homework in week 1. Start at Level 1–2
  // (short lever / isometric) and progress only if pain is 3/10 or less with
  // no next-day soreness that limits training. Needs a partner or a bench.
  {
    type: "Groin — Copenhagen", name: "Copenhagen Adductor — Isometric Short-Lever Hold", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["adductors"], secondaryMuscles: ["abdominals"],
    aliases: ["copenhagen hold", "short lever copenhagen", "copenhagen level 1"],
    instructions: [
      "Lie on your side on your forearm, trunk in line with hips and knees.",
      "Rest your top knee on a bench (or your partner's hands) and lift your hips into a side plank.",
      "Hold 15–30 seconds per side. This is the starting level — master it before going dynamic. Stop if pain is over 3/10.",
    ],
  },
  {
    type: "Groin — Copenhagen", name: "Copenhagen Adductor — Short-Lever Dynamic", equipment: "body only", level: "intermediate", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["adductors"], secondaryMuscles: ["abdominals"],
    aliases: ["copenhagen level 2", "short lever copenhagen dynamic"],
    instructions: [
      "Same set-up as the hold, with your top knee supported on a bench or by a partner.",
      "Lift your hips, then lower them slowly with control (about 3 seconds down).",
      "3–5 reps per side to start, building toward 8–12. Only progress when the hold is easy and pain-free.",
    ],
  },
  {
    type: "Groin — Copenhagen", name: "Copenhagen Adductor — Full Dynamic (Long-Lever)", equipment: "body only", level: "intermediate", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["adductors"], secondaryMuscles: ["abdominals"],
    aliases: ["copenhagen adduction", "copenhagen plank", "copenhagen level 4"],
    instructions: [
      "Lie on your side on your forearm. Your top ankle rests on a bench (or is held by a partner); bottom leg hangs below.",
      "Lift your hips into a straight line, then pull the bottom leg up to touch the top ankle — lower slowly, about 3 seconds down.",
      "In-season maintenance is 1 set of 12–15 per side, 1–2 times a week. Teenagers start at about half the adult volume. Stop and see the physio if pain is over 3/10 or at the pubic bone.",
    ],
  },
  {
    type: "Groin — Copenhagen", name: "Band Adduction", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["adductors"], secondaryMuscles: ["hip flexors"],
    aliases: ["standing band adduction", "cable adduction"],
    instructions: [
      "Stand sideways to a low anchor with a band looped around your far ankle.",
      "Pull the leg across your body against the band, then return slowly.",
      "10 per side. A lighter groin top-up for days between Copenhagen sessions.",
    ],
  },
  {
    type: "Groin — Copenhagen", name: "Adductor Squeeze", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["adductors"], secondaryMuscles: [],
    aliases: ["ball squeeze", "adductor ball squeeze"],
    instructions: [
      "Lie on your back, knees bent, a ball (or pillow) between your knees.",
      "Squeeze the ball and hold 5 seconds, then release slowly.",
      "2 sets of 10. Gentle groin activation — good on sore days.",
    ],
  },

  // ── Ankles — balance + calf, 7–10 min ──────────────────────────────────
  {
    type: "Ankles", name: "Single-Leg Stance", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["single leg balance", "balance hold"],
    instructions: [
      "Stand on one leg, knee soft, hips level, eyes forward.",
      "Hold 30 seconds per leg. Progress: eyes closed, then on a folded towel, then with a ball toss or head turns.",
      "3 sets of 30 seconds per leg. The single most evidence-backed ankle drill — balance work cuts sprains by about a third.",
    ],
  },
  {
    type: "Ankles", name: "Band Eversion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["resisted eversion", "peroneal band work"],
    instructions: [
      "Sit with a band looped around your forefoot, anchored to the inside.",
      "Turn the sole of your foot outward against the band, then return slowly.",
      "3 sets of 15 per side. This trains the peroneals — the muscles that stop your ankle rolling in.",
    ],
  },
  {
    type: "Ankles", name: "Band Inversion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["resisted inversion", "tibialis band work"],
    instructions: [
      "Sit with a band looped around your forefoot, anchored to the outside.",
      "Turn the sole of your foot inward against the band, then return slowly.",
      "3 sets of 12–15 per side. Pair it with eversion for balanced ankle strength.",
    ],
  },
  {
    type: "Ankles", name: "Single-Leg Calf Raise", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["unilateral calf raise", "one leg calf raise"],
    instructions: [
      "Stand on one leg on the edge of a step, heel hanging off.",
      "Rise up on your toes, then lower slowly — 3 seconds down, heel below the step edge.",
      "3 sets of 12 per leg. Full range, slow eccentric.",
    ],
  },
  {
    type: "Ankles", name: "Bent-Knee Calf Raise", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["soleus calf raise", "seated calf raise"],
    instructions: [
      "Stand on one leg with the knee bent about 90° (or sit with weight on the knee).",
      "Rise up on the ball of the foot and lower slowly.",
      "3 sets of 12–15 per leg. The bent knee targets the soleus — the endurance calf that stabilises the ankle.",
    ],
  },
  {
    type: "Ankles", name: "Toe Walks", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["ankles"],
    aliases: ["tiptoe walks"],
    instructions: [
      "Walk on your tiptoes with tall posture, small quick steps.",
      "3 sets of 20 metres. Keep the ankles straight — don't let them roll out.",
    ],
  },
  {
    type: "Ankles", name: "Ankle Alphabet", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["ankles"], secondaryMuscles: ["calves"],
    aliases: ["ankle circles", "abc ankle"],
    instructions: [
      "Sit with a band looped around your forefoot, leg extended.",
      "Trace the alphabet A–Z with your big toe, moving only at the ankle.",
      "One full alphabet per foot. Mobility + activation — good at-home solo drill.",
    ],
  },
  {
    type: "Ankles", name: "Hop-and-Stick", equipment: "body only", level: "intermediate", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["quadriceps", "glutes"],
    aliases: ["single leg hop and hold", "landing drill"],
    instructions: [
      "Hop on one leg from a small height (20–30 cm) and land softly, knee over toe, and HOLD for 2 seconds without wobbling.",
      "3 sets of 8 per side. COACH-SUPERVISED FIRST — learn the landing with a coach before doing it alone. Not for a player returning from a sprain without clearance.",
    ],
  },

  // ── Core + landing — 10–12 min ────────────────────────────────────────
  {
    type: "Core", name: "Side Plank", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["abdominals"], secondaryMuscles: ["adductors"],
    aliases: ["sideways bench", "fifa 11+ sideways bench"],
    instructions: [
      "Lie on your side on your forearm, feet stacked, body in a straight line.",
      "Hold 20–30 seconds per side, 3 sets. Part of FIFA 11+ Part 2 — progress by lifting the top leg.",
      "Keep the hips stacked — don't let them sag or roll forward.",
    ],
  },
  {
    type: "Core", name: "Dead Bug", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["abdominals"], secondaryMuscles: ["hip flexors"],
    aliases: ["deadbug"],
    instructions: [
      "Lie on your back, arms up, hips and knees at 90°, low back pressed flat to the floor.",
      "Slowly extend one arm and the opposite leg, keeping the low back glued down, then return.",
      "2 sets of 6 per side. If the back arches, shorten the reach.",
    ],
  },
  {
    type: "Core", name: "Front Plank (The Bench)", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["abdominals"], secondaryMuscles: ["glutes"],
    aliases: ["plank", "fifa 11+ bench"],
    instructions: [
      "Forearms on the floor, body in a straight line from head to heels, glutes and abs braced.",
      "Hold 20–30 seconds, 3 sets. Part of FIFA 11+ Part 2 — progress by alternating leg lifts.",
      "Don't let the hips sag or pike up.",
    ],
  },

  // ── Hamstrings — coach-led, FIFA 11+ Part 2 ───────────────────────────
  // Nordic curls belong in the coach-led pre-practice block, NOT as
  // unsupervised homework for beginners. Keep it in the library so coaches
  // can prescribe it — with the supervision note in the instructions.
  {
    type: "Hamstrings", name: "Nordic Hamstring Curl", equipment: "body only", level: "expert", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes"],
    aliases: ["nordic curl"],
    instructions: [
      "Kneel with your ankles anchored under a pad or held by a partner.",
      "Keeping a straight line from knee to head, lower your torso toward the floor as slowly as you can.",
      "Catch yourself with your hands, then push back to the start. COACH-LED ONLY until your form is checked — do not learn this alone at home. FIFA 11+ Part 2: beginner 3–5 reps, intermediate 7–10, advanced 12–15.",
    ],
  },
];

// Map each seed exercise into a Firestore `customExercises` doc. Drops the
// display-only `type` field. Caller adds createdAt.
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
