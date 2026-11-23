# Content audit — training, prehab and nutrition (2026-11-23)

Read-only review of the *information* in the app: the prehab exercise library
(`src/data/liftSeed.js`), the starter team workouts (`src/data/workoutSeed.js`),
the strength templates (`src/lib/lifting.js` WORKOUT_TEMPLATES), the public
exercise database (Free Exercise DB, pinned commit), the recipe library
(`src/data/recipeSeed.js`) and the nutrition / water logic. Checks were done by
reading every entry plus scripts (macro math, cross-references, template
matching against the 876-exercise database).

Severity: 🔴 wrong or unsafe · 🟡 misleading / inconsistent · ⚪ gap / polish.

## 1. Prehab exercise library (31 exercises)

Strong overall: evidence-based (FIFA 11+, Copenhagen programme, ankle balance
work), age-aware (teens start Copenhagen at half volume, short lever first),
with sensible safety rules (stop at pain > 3/10, never to failure, Nordics and
hop-and-stick coach-supervised first). Every workout exercise exists in the
library.

| # | Sev | Finding |
|---|---|---|
| C1 | 🟡 | **Band Eversion** says the peroneals are "the muscles that stop your ankle rolling **in**". They resist the ankle rolling **over** (an inversion sprain, sole turning in). Players reading "rolling in" will picture the opposite. |
| C2 | 🟡 | Muscle tags use names the exercise database doesn't: `hip abductors` (DB: `abductors`), `hip flexors`, and `ankles` (not a muscle). Library grouping by muscle splits the same muscle into two groups. |
| C3 | ⚪ | **Ankle Alphabet** is tagged equipment "band" and tells you to loop a band, but the drill is done without one. |
| C4 | ⚪ | **Copenhagen — Full Dynamic (Long-Lever)** is level "intermediate"; it's the hardest progression (should be advanced). It's also the only library exercise not used in any workout. |
| C5 | ⚪ | Comments cite a research report at `~/workspace/research_notes/…` that isn't in the repo. |

## 2. Starter team workouts (12 routines)

| # | Sev | Finding |
|---|---|---|
| W1 | 🔴 | **"FIFA 11+ — Full (20 Min)" isn't the FIFA 11+.** It has 2 of the 6 Part 1 running exercises, a partial Part 2 (with a glute bridge, which isn't in the 11+; the 11+ uses squats), and **none of Part 3** (running across the pitch, bounding, plant & cut). Coaches will believe they're doing the programme the injury-reduction research is based on. |
| W2 | 🔴 | **"Matchday Activation — Parts 1+3"** contains no Part 3 running at all; half of it is Part 2 / band work. |
| W3 | 🟡 | **Copenhagen dose jumps for beginners:** the library says start the dynamic version at 3–5 reps/side and build to 8–12, but every workout prescribes 8–12 from day one. |
| W4 | 🟡 | **"At-Home Prehab — Full (2 Sets)"** says 2 sets each, but 9 of its 15 exercises are 3 sets (≈ 40 sets — closer to 30+ minutes than the light home dose described). Dead Bug is 3 sets here vs 2 in its own instructions. |
| W5 | ⚪ | The 12-minute pre-practice routine exists twice (a team workout and a template) with slightly different doses. |
| W6 | ⚪ | Workout exercises aren't linked to library entries (no `exerciseId`), so players can't tap an exercise to see its photos and instructions from the workout. |

## 3. Strength templates (6, coach one-tap)

| # | Sev | Finding |
|---|---|---|
| T1 | 🔴 | **Wrong exercises are picked.** The name matcher chooses "deadlift" → **Axle Deadlift** (strongman), "overhead press" → **Smith Machine** press, "pull-up" → **Band Assisted** pull-up, "lateral raise" → cable seated. |
| T2 | 🔴 | **Not found at all:** "back squat" (in 4 templates), "trap-bar deadlift", "pogo hops". Unlinked lifts can't hold a max, so the **% of max weights never fill in** for the squat — the main lift of those templates. (Correct DB entries exist: Barbell Full Squat, Trap Bar Deadlift, Barbell Deadlift, Standing Military Press, Pullups, Side Lateral Raise.) |
| T3 | 🟡 | **Adult programmes for 14–18-year-olds.** 5×5 ramping to 87.5%, an in-season squat at 85%, and "Upper Hypertrophy" (lateral raises, triceps pushdowns) contradict the app's own stance (school lifting is separate; keep players fresh in-season). Heavy % work for teens should be coach-supervised and technique-first (NSCA/AAP). |
| T4 | ⚪ | The public exercise database (876 exercises) includes strongman and novelty lifts (car deadlift, rickshaw…). Fine for coaches, noisy for players browsing. |

## 4. Recipes (132)

| # | Sev | Finding |
|---|---|---|
| R1 | 🔴 | **Only 18 of 132 recipes list ingredients, and none have instructions.** Most "recipes" are a name plus macros — a player can't actually make "Turkey Meatballs & Zucchini" from the app. |
| R2 | 🟡 | **Protein powder in ~10 recipes** (whey shakes, protein oatmeal, protein smoothies). Youth-sports guidance (AAP) is food-first for minors; these need a whole-food alternative or a note. |
| R3 | ⚪ | Macros are consistent (calories match protein/carbs/fat within 10% for 130 of 132; Mixed Fruit & Almond Bowl and Banana-Berry Fuel Smoothie are ~10–11% off). |
| R4 | ⚪ | "Chicken Quesadilla" appears twice (Post-Game and School Lunch) with different macros. |
| R5 | ⚪ | No serving size, allergen or dietary tags (vegetarian, gluten-free, nut-free) — matters for team meals and travel. |

## 5. Nutrition and hydration logic

| # | Sev | Finding |
|---|---|---|
| N1 | 🟡 | **Water goal is 8 cups (~2 L)**, hard-coded. Active teens training in Arizona heat need noticeably more (≈ 10–12+ cups on training days, more in heat) plus a urine-colour check. |
| N2 | 🟡 | **Daily goals have no guidance or guardrails.** A player can set 900 kcal with no warning. For minors that's a RED-S / disordered-eating risk; a low-calorie warning and suggested ranges (e.g. protein ≈ 1.2–2.0 g/kg) would help. |
| N3 | ⚪ | Two separate water-goal constants (`WATER_GOAL` in home, `WATER_CUPS_GOAL` in shared) that happen to match. |

## 6. "Rehab" — what's missing

Everything in the app is **injury prevention** (prehab). There is **no return-
from-injury content**: no staged ankle-sprain, hamstring-strain or groin-strain
return-to-play progressions, and no "cleared by trainer/physio" step. If
injured players are expected to use the app, add physio-approved stage
programmes with a clear "only after clearance" gate.

## Recommended fixes (in order)

1. **T1–T2:** pin each template entry to an exact database exercise id (fixes the wrong picks and makes % of max work).
2. **W1–W2:** either complete the real FIFA 11+ (all three parts, correct exercises) or rename these routines so they don't claim to be the 11+.
3. **C1, W3, W4:** fix the eversion wording, start the Copenhagen dynamic at 3–5 reps, make the "2-set" home routine actually 2 sets.
4. **R1:** add ingredients + short steps for every recipe (start with the most-used categories).
5. **N1–N2:** raise the hydration target (or make it per-player/coach-set) and add goal guardrails for minors.
6. **T3, R2:** label the heavy templates "coach-supervised, off-season" (or remove them) and give whole-food alternatives for protein-powder recipes.
7. Decide whether to add **return-to-play rehab** programmes (needs your trainer/physio to approve the content).
8. Polish: C2–C5, W5–W6, R3–R5, N3, T4.

---

## ✅ Fixes applied (2026-11-23)

| Finding | Status | What changed |
|---|---|---|
| C1 | Fixed | Band Eversion now says the peroneals stop the ankle rolling **over** (the common sprain, sole turning in). |
| C2 | Fixed | Muscle tags use the database names (`abductors`, `quadriceps` for hip-flexor work; `ankles` removed). |
| C3 | Fixed | Ankle Alphabet is body-only, no band. |
| C4 | Fixed | Copenhagen long-lever dynamic is level "expert" and is used in the new groin programmes. |
| C5 | Fixed | Comments cite the FIFA 11+ manual and Askling 2013 instead of a missing local file. |
| W1–W2 | Fixed | **"FIFA 11+ — Full Programme (20 Min)"** is the real programme: Part 1 (6 running exercises), Part 2 Level 1 (bench, side bench, hamstrings, single-leg balance, squats, jumping) and Part 3 (running across the pitch, bounding, plant & cut). The matchday routine is now **Parts 1 + 3**. Nine FIFA 11+ exercises were added to the library. |
| W3 | Fixed | The Copenhagen dynamic starts at 3–5 reps/side and builds to 8–12. |
| W4 | Fixed | The at-home "2 Sets" routine is 2 sets throughout. |
| W5 | Fixed | The 12-minute template and team workout now prescribe the same doses. |
| W6 | Fixed | Tap any exercise in a workout to open its how-to card (photos and steps). |
| T1–T2 | Fixed | Every template entry is pinned to an exact exercise (e.g. Barbell Full Squat, Trap Bar Deadlift, Pull-ups), so % of max fills in. |
| T3 | Fixed | Youth-appropriate doses (technique-first, no in-season 85%). The heavy templates are labelled "Coach-supervised · off-season". |
| T4 | Fixed | Strongman / novelty lifts are hidden from the player exercise browser. |
| R1 | Fixed | **All 132 recipes** have ingredients with amounts (1 serving, US units) and short steps with cook temps. Tap "How to make it" on a recipe card. |
| R2 | Fixed | All 9 protein-powder recipes show a **food-first swap** (Greek yogurt / milk) on the card. |
| R3 | Fixed | Mixed Fruit & Almond Bowl → 330 kcal; Banana-Berry Fuel Smoothie → 355 kcal. |
| R4 | Fixed | The Post-Game version is now "Chicken & Black-Bean Quesadilla". |
| R5 | Fixed | Recipes carry servings, dietary tags (vegetarian, vegan, gluten-free, dairy-free, nut-free, pescatarian), US top-9 allergens and when-to-eat timing. Coaches can edit all of these in the recipe form. |
| N1 / N3 | Fixed | One shared water goal: **12 cups**, plus a hydration tip (pale-yellow urine; add 2–3 cups per hour of practice in the heat). |
| N2 | Fixed | The daily goal shows guidance (2,400–3,500+ kcal on training days; protein 1.2–2.0 g/kg). It warns, and asks for confirmation, below 1,800 kcal, and flags protein outside about 50–250 g. |
| Rehab | Added (needs sign-off) | A new **Return to Play** area has 9 staged programmes (ankle sprain, hamstring strain, groin strain × 3 stages each), each gated on clearance from the athletic trainer or physio, plus 10 new rehab exercises. **These are drafts: have your athletic trainer review them before players use them.** |

**Existing data:** starter content already in Firestore upgrades automatically the next time a coach opens the app (`src/lib/seedUpgrade.js`):
- Workouts and exercises are replaced only when nobody edited them (fingerprint match against the v1 seed).
- Recipes only gain missing fields.
- New starter items are added only for teams that already used the starter library.

**Brand caveat:** recipe tags and allergens assume typical products. Bread, granola, tortillas, deli meat and seasonings vary, so players with allergies or celiac disease should check labels.

### Sources
- FIFA 11+ manual: https://www.ortho.wustl.edu/mm/files/FIFA11plus_InjuryPreventionBooklet_LowRes.pdf. Soligard et al., BMJ 2008, the original injury-reduction trial.
- Copenhagen adduction programme: Harøy et al., *Br J Sports Med* 2019.
- Hamstring L-Protocol (Extender, Diver, Glider): Askling et al., *Br J Sports Med* 2013.
- Ankle sprain rehab and return to play: Vuurberg et al., *Br J Sports Med* 2018 clinical guideline.
- Protein 1.2–2.0 g/kg and energy needs: ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada joint position, *Nutrition and Athletic Performance* (2016). RED-S: IOC consensus statement (2023).
- Youth strength training (supervised, technique-first): NSCA youth resistance training position statement (2009, updated 2014). AAP *Resistance Training for Children and Adolescents* (2020).
- Supplements and protein powder in minors (food-first): AAP *Use of Performance-Enhancing Substances* clinical report (2016).
- Hydration (urine colour, pre/during/post-exercise fluid): NATA position statement, *Fluid Replacement for the Physically Active* (2017).
