// One-time upgrade of starter content that was already seeded into Firestore
// before the 2026-11-23 content audit (FIFA 11+ rebuilt, prehab text fixes,
// full recipes, return-to-play programmes).
//
// The rule everywhere: never overwrite a coach's edits.
//  - Workouts / exercises: a seeded doc is replaced with the new version only
//    if it still matches its v1 fingerprint (unedited). Renamed workouts move
//    to their new name the same way.
//  - Recipes: only ADD fields a seeded recipe doesn't have (steps, tags, …).
//    The old short ingredient list and two corrected calorie values are
//    replaced only when they still equal the original seed values.
//  - New starter items are added only where the coach already used the
//    starter library (at least one seeded doc exists), and never duplicated.
//
// Pure functions: each returns { updates: [{id, data}], adds: [doc] } for the
// caller to write.
import { WORKOUT_SEED, WORKOUT_V1_FP, WORKOUT_RENAMES, fpExercises } from "../data/workoutSeed.js";
import { liftSeedDocs, LIFT_V1_FP, fpLift } from "../data/liftSeed.js";
import { RECIPE_SEED, RECIPE_BASE, RECIPE_RENAMES } from "../data/recipeSeed.js";

export const SEED_UPGRADE_VERSION = 2;

const norm = (s) => String(s || "").toLowerCase().trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function planWorkoutUpgrade(teamWorkouts = []) {
  const updates = [];
  const byName = new Map(WORKOUT_SEED.map((w) => [w.name, w]));
  const seededAny = teamWorkouts.some((w) => w.seeded);
  const finalNames = new Set();
  for (const w of teamWorkouts) {
    const newName = WORKOUT_RENAMES[w.name] || w.name;
    finalNames.add(norm(w.name));
    if (!w.seeded) continue;
    const seed = byName.get(newName);
    const v1 = WORKOUT_V1_FP[w.name];
    if (!seed || !v1 || fpExercises(w.exercises) !== v1) continue; // edited or unknown — leave it
    const renamed = newName !== w.name;
    if (!renamed && fpExercises(seed.exercises) === v1 && w.focus === seed.focus && w.area === seed.area) continue;
    // A renamed doc must not collide with a workout already using the new name.
    if (renamed && teamWorkouts.some((o) => o.id !== w.id && norm(o.name) === norm(newName))) continue;
    updates.push({ id: w.id, data: { name: seed.name, area: seed.area, focus: seed.focus, exercises: seed.exercises } });
    finalNames.add(norm(seed.name));
  }
  const adds = seededAny
    ? WORKOUT_SEED.filter((w) => !finalNames.has(norm(w.name)))
        .map((w) => ({ name: w.name, area: w.area, focus: w.focus, exercises: w.exercises, seeded: true }))
    : [];
  return { updates, adds };
}

export function planLiftUpgrade(customExercises = []) {
  const updates = [];
  const seeds = liftSeedDocs();
  const byName = new Map(seeds.map((l) => [l.name, l]));
  const seededAny = customExercises.some((e) => e.seeded);
  const have = new Set(customExercises.map((e) => norm(e.name)));
  for (const e of customExercises) {
    if (!e.seeded) continue;
    const seed = byName.get(e.name);
    const v1 = LIFT_V1_FP[e.name];
    if (!seed || !v1 || fpLift(e) !== v1 || fpLift(seed) === v1) continue;
    const data = { ...seed };
    delete data.images; // keep any photos the coach added
    delete data.aliases;
    updates.push({ id: e.id, data });
  }
  const adds = seededAny ? seeds.filter((l) => !have.has(norm(l.name))) : [];
  return { updates, adds };
}

const DETAIL_FIELDS = ["steps", "servings", "tags", "allergens", "timing", "swap"];
// Calories corrected in the audit: { "cat|name": oldCal }.
const CAL_FIXES = { "Breakfast|Mixed Fruit & Almond Bowl": 300, "Pre-Game|Banana-Berry Fuel Smoothie": 320 };

export function planRecipeUpgrade(recipes = []) {
  const updates = [];
  const seedByKey = new Map(RECIPE_SEED.map((r) => [`${r.cat}|${r.name}`, r]));
  const baseByKey = new Map(RECIPE_BASE.map((r) => [`${r.cat}|${r.name}`, r]));
  const taken = new Set(recipes.map((r) => `${norm(r.cat)}|${norm(r.name)}`));
  for (const r of recipes) {
    if (!r.seeded) continue;
    const oldKey = `${r.cat}|${r.name}`;
    const data = {};
    let key = oldKey;
    const rename = RECIPE_RENAMES[oldKey];
    if (rename && !taken.has(`${norm(r.cat)}|${norm(rename)}`)) {
      data.name = rename;
      key = `${r.cat}|${rename}`;
    }
    const seed = seedByKey.get(key);
    if (!seed) continue;
    for (const f of DETAIL_FIELDS) {
      if (seed[f] !== undefined && !same(r[f], seed[f]) && (r[f] === undefined || r[f] === null || (Array.isArray(r[f]) && !r[f].length))) data[f] = seed[f];
    }
    const base = baseByKey.get(key);
    const oldIngredients = base?.ingredients || [];
    if (seed.ingredients && (!r.ingredients || !r.ingredients.length || same(r.ingredients, oldIngredients))
      && !same(r.ingredients, seed.ingredients)) data.ingredients = seed.ingredients;
    if (CAL_FIXES[oldKey] !== undefined && r.cal === CAL_FIXES[oldKey] && seed.cal !== r.cal) data.cal = seed.cal;
    if (Object.keys(data).length) updates.push({ id: r.id, data });
  }
  return { updates, adds: [] };
}
