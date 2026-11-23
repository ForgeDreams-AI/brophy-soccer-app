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
// guidance. FIFA 11+ structure/doses: the official FIFA 11+ manual (Level 1);
// hamstring return-to-play: Askling et al., BJSM 2013 (L-protocol).
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
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["ankle mobilization", "knee over toe rocks"],
    instructions: [
      "Stand facing a wall, one foot forward, knee tracking over the toes.",
      "Rock the knee forward over the toes without lifting the heel, then back.",
      "8 per side, slow and controlled — opens ankle range before running.",
    ],
  },
  {
    type: "Mobility", name: "Leg Swings", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["quadriceps", "glutes"],
    aliases: ["front-to-back leg swings", "dynamic leg swing"],
    instructions: [
      "Hold a wall or partner for balance and swing one leg forward and back.",
      "Keep the swing relaxed and let the range grow — do not force it.",
      "8 per side, then switch legs.",
    ],
  },
  {
    type: "Mobility", name: "Hip Open / Close (Gate)", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "adductors"],
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
    primaryMuscles: ["glutes"], secondaryMuscles: ["abductors"],
    aliases: ["monster walk", "band walks", "crab walk"],
    instructions: [
      "Loop a mini-band above your knees (ankles = harder), quarter-squat, chest up.",
      "Step sideways keeping tension on the band — don't let the knees collapse in.",
      "10 steps each way, 1–2 sets. Keep the band taut the whole time.",
    ],
  },
  {
    type: "Hips — Band", name: "Clamshell", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["abductors"], secondaryMuscles: ["glutes"],
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
    primaryMuscles: ["glutes"], secondaryMuscles: ["abductors"],
    aliases: ["band fire hydrant", "quadruped hip abduction"],
    instructions: [
      "On hands and knees, band just above the knees, back flat.",
      "Lift one knee out to the side like a dog at a hydrant, keeping the knee bent 90°.",
      "3 sets of 15 per side. Don't let the hips rock — the movement is all in the hip.",
    ],
  },
  {
    type: "Hips — Band", name: "Standing Band Hip Flexion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: [],
    aliases: ["band knee drive", "hip flexor march"],
    instructions: [
      "Stand tall with a band looped around one ankle, anchored low behind you.",
      "Drive the knee up against the band to hip height, then lower slowly.",
      "10 per side. Keep the torso tall — no leaning back.",
    ],
  },
  {
    type: "Hips — Band", name: "Side-Lying Hip Abduction", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["abductors"], secondaryMuscles: ["glutes"],
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
    type: "Groin — Copenhagen", name: "Copenhagen Adductor — Full Dynamic (Long-Lever)", equipment: "body only", level: "expert", mechanic: "isolation", category: "prehab",
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
    primaryMuscles: ["adductors"], secondaryMuscles: ["quadriceps"],
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
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["single leg balance", "balance hold"],
    instructions: [
      "Stand on one leg, knee soft, hips level, eyes forward.",
      "Hold 30 seconds per leg. Progress: eyes closed, then on a folded towel, then with a ball toss or head turns.",
      "3 sets of 30 seconds per leg. The single most evidence-backed ankle drill — balance work cuts sprains by about a third.",
    ],
  },
  {
    type: "Ankles", name: "Band Eversion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["resisted eversion", "peroneal band work"],
    instructions: [
      "Sit with a band looped around your forefoot, anchored to the inside.",
      "Turn the sole of your foot outward against the band, then return slowly.",
      "3 sets of 15 per side. This trains the peroneals — the muscles that stop your ankle rolling over (the common sprain, where the sole turns in).",
    ],
  },
  {
    type: "Ankles", name: "Band Inversion", equipment: "band", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["resisted inversion", "tibialis band work"],
    instructions: [
      "Sit with a band looped around your forefoot, anchored to the outside.",
      "Turn the sole of your foot inward against the band, then return slowly.",
      "3 sets of 12–15 per side. Pair it with eversion for balanced ankle strength.",
    ],
  },
  {
    type: "Ankles", name: "Single-Leg Calf Raise", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["unilateral calf raise", "one leg calf raise"],
    instructions: [
      "Stand on one leg on the edge of a step, heel hanging off.",
      "Rise up on your toes, then lower slowly — 3 seconds down, heel below the step edge.",
      "3 sets of 12 per leg. Full range, slow eccentric.",
    ],
  },
  {
    type: "Ankles", name: "Bent-Knee Calf Raise", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["soleus calf raise", "seated calf raise"],
    instructions: [
      "Stand on one leg with the knee bent about 90° (or sit with weight on the knee).",
      "Rise up on the ball of the foot and lower slowly.",
      "3 sets of 12–15 per leg. The bent knee targets the soleus — the endurance calf that stabilises the ankle.",
    ],
  },
  {
    type: "Ankles", name: "Toe Walks", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["tiptoe walks"],
    instructions: [
      "Walk on your tiptoes with tall posture, small quick steps.",
      "3 sets of 20 metres. Keep the ankles straight — don't let them roll out.",
    ],
  },
  {
    type: "Ankles", name: "Ankle Alphabet", equipment: "body only", level: "beginner", mechanic: "isolation", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["ankle circles", "abc ankle"],
    instructions: [
      "Sit with your leg extended and the heel just off the floor (or on a pillow).",
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
    primaryMuscles: ["abdominals"], secondaryMuscles: ["quadriceps"],
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

  // ── FIFA 11+ — running drills (Parts 1 and 3) and Level 1 Part 2 ──────
  // From the official FIFA 11+ manual. Part 1 is done in pairs along 6 pairs
  // of cones ~5–6 m apart (~20 m course), jog out, jog back. Each 2 sets.
  {
    type: "FIFA 11+", name: "Running — Straight Ahead", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["calves", "hamstrings"],
    aliases: ["fifa 11+ jogging", "jog straight ahead"],
    instructions: [
      "FIFA 11+ Part 1. Jog together with a partner to the last cone, then jog back.",
      "Knees soft, landing on the ball of the foot; knee in line with the foot, never caving inward.",
      "2 sets. Speed up a little on the second.",
    ],
  },
  {
    type: "FIFA 11+", name: "Running — Circling Partner", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["abductors", "adductors"],
    aliases: ["fifa 11+ circling partner"],
    instructions: [
      "FIFA 11+ Part 1. Jog to the first cone, shuffle sideways toward your partner, shuffle a full circle around each other, shuffle back to the cone.",
      "Hips and knees bent slightly, weight on the balls of the feet.",
      "Repeat at every cone. 2 sets.",
    ],
  },
  {
    type: "FIFA 11+", name: "Running — Shoulder Contact", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "calves"],
    aliases: ["fifa 11+ jumping with shoulder contact"],
    instructions: [
      "FIFA 11+ Part 1. Jog to the first cone, shuffle sideways toward your partner, then jump sideways into each other shoulder-to-shoulder.",
      "Land on both feet with hips and knees bent — knees never cave inward. Shuffle back and repeat at every cone.",
      "2 sets. Controlled contact, not a collision.",
    ],
  },
  {
    type: "FIFA 11+", name: "Running — Quick Forwards & Backwards", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["hamstrings", "calves"],
    aliases: ["fifa 11+ quick forwards backwards"],
    instructions: [
      "FIFA 11+ Part 1. Sprint quickly to the second cone, run backwards quickly to the first cone, keeping hips and knees slightly bent.",
      "Repeat, two cones forward and one back, all the way down the course.",
      "2 sets. Small, quick steps.",
    ],
  },
  {
    type: "FIFA 11+", name: "Squats with Toe Raise", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "calves"],
    aliases: ["fifa 11+ squats", "squat to calf raise"],
    instructions: [
      "FIFA 11+ Part 2, Level 1. Feet hip-width apart, hands on hips.",
      "Bend hips, knees and ankles until the knees are at about 90°, chest up, knees over the toes (never caving in). Stand up quickly, then rise onto your toes, and lower slowly.",
      "2 sets of 30 seconds.",
    ],
  },
  {
    type: "FIFA 11+", name: "Vertical Jumps", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "calves"],
    aliases: ["fifa 11+ jumping", "squat jumps"],
    instructions: [
      "FIFA 11+ Part 2, Level 1. Feet hip-width apart, hands on hips.",
      "Bend hips, knees and ankles until the knees are at about 90°, hold 2 seconds, then jump as high as you can and land softly on the balls of the feet, knees bent and in line with the toes.",
      "2 sets of 30 seconds.",
    ],
  },
  {
    type: "FIFA 11+", name: "Running Across the Pitch", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["hamstrings", "calves"],
    aliases: ["fifa 11+ part 3 running"],
    instructions: [
      "FIFA 11+ Part 3. Run across the pitch (about 40 m) at 75–80% of your top speed, then jog the rest of the way.",
      "Upright body, hip-knee-foot in a straight line; knees never cave inward. Jog back easy.",
      "2 sets.",
    ],
  },
  {
    type: "FIFA 11+", name: "Bounding", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["glutes"], secondaryMuscles: ["quadriceps", "calves"],
    aliases: ["fifa 11+ bounding", "running bounds"],
    instructions: [
      "FIFA 11+ Part 3. Run with high bounding steps: knee of the leading leg high, opposite arm swinging forward.",
      "Land on the ball of the foot with the knee bent and in line with the foot. Jog back to recover.",
      "2 sets across the pitch.",
    ],
  },
  {
    type: "FIFA 11+", name: "Plant & Cut", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes", "adductors"],
    aliases: ["fifa 11+ plant and cut", "cutting drill"],
    instructions: [
      "FIFA 11+ Part 3. Jog 4–5 steps, then plant on the outside leg and cut to change direction, then accelerate 5–7 steps at 80–90% speed before slowing down.",
      "Keep the plant knee bent and over the foot — never caving inward. Alternate sides.",
      "2 sets.",
    ],
  },

  {
    type: "Ankles", name: "Pogo Hops", equipment: "body only", level: "beginner", mechanic: "compound", category: "prehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["quadriceps"],
    aliases: ["ankle hops", "pogo jumps"],
    instructions: [
      "Stand tall, feet hip-width. Bounce on the balls of your feet with stiff ankles and almost straight knees — like a pogo stick.",
      "Quick, light contacts; heels barely touch. Stay quiet on landing.",
      "2–3 sets of 10–20. Builds springy ankles for sprinting.",
    ],
  },

  // ── Return to play (only with athletic-trainer / physio clearance) ─────
  // Staged, criteria-based. Hamstring stages use the Askling L-protocol
  // (Extender, Diver, Glider), which returned players faster than
  // conventional rehab in elite footballers (Askling et al., BJSM 2013).
  {
    type: "Return to Play", name: "Hamstring Extender (L-Protocol)", equipment: "body only", level: "beginner", mechanic: "isolation", category: "rehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: [],
    aliases: ["askling extender", "l-protocol extender"],
    instructions: [
      "Lie on your back, hold the injured leg's thigh with both hands so the hip is bent to about 90°.",
      "Slowly straighten the knee as far as feels comfortable, then bend it back. Never push into sharp pain.",
      "Start 3 sets of 12, every day, slow and controlled. Only after clearance from your athletic trainer.",
    ],
  },
  {
    type: "Return to Play", name: "Hamstring Diver (L-Protocol)", equipment: "body only", level: "intermediate", mechanic: "compound", category: "rehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    aliases: ["askling diver", "l-protocol diver"],
    instructions: [
      "Stand on the injured leg, knee slightly bent. Reach both arms forward while the other leg lifts behind you, like diving — hinge at the hip, back flat.",
      "Go only as far as pain-free and return. Start slow, then build speed over the days.",
      "3 sets of 6, every other day. Only after clearance from your athletic trainer.",
    ],
  },
  {
    type: "Return to Play", name: "Hamstring Glider (L-Protocol)", equipment: "body only", level: "intermediate", mechanic: "compound", category: "rehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["adductors"],
    aliases: ["askling glider", "l-protocol glider"],
    instructions: [
      "Stand holding a rail, injured leg in front with the knee slightly bent, the other foot on a towel or slider.",
      "Slide the back leg away slowly, lowering your hips, then pull yourself back using your arms (not the hamstring).",
      "3 sets of 4, every third day. Only after clearance from your athletic trainer.",
    ],
  },
  {
    type: "Return to Play", name: "Isometric Hamstring Bridge (Heel Dig)", equipment: "body only", level: "beginner", mechanic: "isolation", category: "rehab",
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes"],
    aliases: ["heel dig", "hamstring isometric"],
    instructions: [
      "Lie on your back, knees bent, heels on the floor. Dig your heels into the floor (or lift into a small bridge) and hold.",
      "Hold 10–30 seconds at an effort that stays pain-free (no more than 3/10).",
      "4–5 holds. Early-stage loading — only after clearance from your athletic trainer.",
    ],
  },
  {
    type: "Return to Play", name: "Progressive Running", equipment: "body only", level: "beginner", mechanic: "compound", category: "rehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["hamstrings", "calves"],
    aliases: ["return to running", "jog stride sprint"],
    instructions: [
      "Build speed in steps over sessions: easy jog → 60% strides → 75% → 90% → full sprints.",
      "Move to the next speed only when the previous one is pain-free during AND the day after.",
      "Your athletic trainer sets the distances and when you're ready for full speed.",
    ],
  },
  {
    type: "Return to Play", name: "Double-Leg Calf Raise", equipment: "body only", level: "beginner", mechanic: "isolation", category: "rehab",
    primaryMuscles: ["calves"], secondaryMuscles: [],
    aliases: ["two leg calf raise"],
    instructions: [
      "Stand on both feet, holding a wall for balance. Rise onto your toes, then lower slowly (3 seconds down).",
      "Keep the weight even through both feet and the ankles straight — don't let them roll out.",
      "3 sets of 15. Progress to single-leg calf raises when this is easy and pain-free.",
    ],
  },
  {
    type: "Return to Play", name: "Lateral Line Hops", equipment: "body only", level: "intermediate", mechanic: "compound", category: "rehab",
    primaryMuscles: ["calves"], secondaryMuscles: ["quadriceps", "glutes"],
    aliases: ["side to side hops", "line hops"],
    instructions: [
      "Stand beside a line. Hop side to side over it on both feet, quick and light; progress to the injured leg only.",
      "Land softly, knee over the toes, ankle straight.",
      "3 sets of 20 seconds. Only when single-leg balance and calf raises are pain-free.",
    ],
  },
  {
    type: "Return to Play", name: "Figure-8 & Cutting Runs", equipment: "body only", level: "intermediate", mechanic: "compound", category: "rehab",
    primaryMuscles: ["quadriceps"], secondaryMuscles: ["adductors", "abductors", "calves"],
    aliases: ["figure eight run", "cutting progression"],
    instructions: [
      "Run figure-8s around two cones ~10 m apart, starting at half speed with wide turns.",
      "Progress to tighter turns, then sharp 45° and 90° cuts at higher speed.",
      "Stop if you feel pain or the joint gives way. A player who can't cut can't safely play.",
    ],
  },
  {
    type: "Return to Play", name: "Side-Lying Adductor Lift", equipment: "body only", level: "beginner", mechanic: "isolation", category: "rehab",
    primaryMuscles: ["adductors"], secondaryMuscles: [],
    aliases: ["side lying adduction", "inner thigh lift"],
    instructions: [
      "Lie on your injured side, bottom leg straight, top leg bent with the foot on the floor in front.",
      "Lift the bottom leg a few inches, hold 2 seconds, lower slowly.",
      "3 sets of 10–15, pain-free (no more than 3/10).",
    ],
  },
  {
    type: "Return to Play", name: "Passing & Kicking Progression", equipment: "body only", level: "beginner", mechanic: "compound", category: "rehab",
    primaryMuscles: ["adductors"], secondaryMuscles: ["quadriceps", "abdominals"],
    aliases: ["kicking progression"],
    instructions: [
      "Start with short inside-foot passes (5–10 m), then longer passes, then driven balls, then shooting.",
      "Increase distance and power only when the previous step is pain-free during and the day after.",
      "Groin injuries: long kicking and shooting come last.",
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

// ── One-time upgrade of already-seeded exercises ────────────────────────────
// Fingerprints of the v1 seed (before the 2026-11-23 content audit). A seeded
// exercise in the database is updated to the new text ONLY if it still matches
// its v1 fingerprint, i.e. no coach has edited it.
export const LIFT_V1_FP = {"Ankle Rocks":"cacklo","Leg Swings":"n9cbkx","Hip Open / Close (Gate)":"1xcr1ot","Lateral Band Walk":"1ekch7v","Clamshell":"1ic1e0p","Glute Bridge":"hr7fqu","Single-Leg Glute Bridge":"1cjfg55","Fire Hydrant":"1oii37l","Standing Band Hip Flexion":"e76510","Side-Lying Hip Abduction":"wobgiu","Copenhagen Adductor — Isometric Short-Lever Hold":"1g1es2o","Copenhagen Adductor — Short-Lever Dynamic":"108ep44","Copenhagen Adductor — Full Dynamic (Long-Lever)":"unwzbo","Band Adduction":"113pi10","Adductor Squeeze":"1mntzjl","Single-Leg Stance":"1nt3ars","Band Eversion":"sm5m6c","Band Inversion":"ychy52","Single-Leg Calf Raise":"5ygrao","Bent-Knee Calf Raise":"17nr2aa","Toe Walks":"4e5ao5","Ankle Alphabet":"156n2tc","Hop-and-Stick":"15stnzu","Side Plank":"hgc07l","Dead Bug":"7awze5","Front Plank (The Bench)":"1d0udyz","Nordic Hamstring Curl":"ncxgdi"};
const fpHash = (s) => { let x = 5381; for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(36); };
export const fpLift = (l) => fpHash(JSON.stringify([l.equipment || "", l.level || "", l.primaryMuscles || [], l.secondaryMuscles || [], l.instructions || []]));
