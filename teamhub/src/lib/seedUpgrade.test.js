import { describe, expect, it } from "vitest";
import { planLiftUpgrade, planRecipeUpgrade, planWorkoutUpgrade } from "./seedUpgrade.js";
import { RECIPE_BASE, RECIPE_SEED } from "../data/recipeSeed.js";
import { WORKOUT_SEED } from "../data/workoutSeed.js";

const apply = (docs, plan) => docs.map((d) => {
  const u = plan.updates.find((x) => x.id === d.id);
  return u ? { ...d, ...u.data } : d;
});

describe("planRecipeUpgrade", () => {
  // A seeded doc as written before the audit: base fields only.
  const v1 = RECIPE_BASE.map((r, i) => ({ ...r, id: `r${i}`, seeded: true }));

  it("adds full details to every seeded recipe and is idempotent", () => {
    const plan = planRecipeUpgrade(v1);
    expect(plan.updates).toHaveLength(RECIPE_BASE.length);
    const after = apply(v1, plan);
    expect(after.every((r) => r.steps?.length && r.ingredients?.length)).toBe(true);
    expect(planRecipeUpgrade(after).updates).toHaveLength(0);
  });

  it("never touches coach-written fields or non-seeded recipes", () => {
    const docs = [
      { ...v1[0], steps: ["coach's own steps"], ingredients: ["coach list"] },
      { ...v1[1], seeded: false },
    ];
    const plan = planRecipeUpgrade(docs);
    const u0 = plan.updates.find((u) => u.id === docs[0].id);
    expect(u0.data.steps).toBeUndefined();
    expect(u0.data.ingredients).toBeUndefined();
    expect(plan.updates.find((u) => u.id === docs[1].id)).toBeUndefined();
  });

  it("renames the duplicate post-game quesadilla", () => {
    const q = { id: "q", cat: "Post-Game", name: "Chicken Quesadilla", cal: 540, seeded: true };
    const u = planRecipeUpgrade([q]).updates[0];
    expect(u.data.name).toBe("Chicken & Black-Bean Quesadilla");
    expect(RECIPE_SEED.some((r) => r.name === u.data.name && r.steps?.length)).toBe(true);
  });
});

describe("planWorkoutUpgrade / planLiftUpgrade", () => {
  it("does nothing for a team that never used the starter library", () => {
    const docs = [{ id: "a", name: "Coach session", exercises: [] }];
    expect(planWorkoutUpgrade(docs)).toEqual({ updates: [], adds: [] });
    expect(planLiftUpgrade([{ id: "x", name: "My lift" }])).toEqual({ updates: [], adds: [] });
  });

  it("leaves edited seeded workouts alone and only adds missing starters", () => {
    const edited = { id: "w", name: "FIFA 11+ — Full (20 Min)", seeded: true, exercises: [{ name: "Coach drill", sets: 1, reps: 1 }] };
    const plan = planWorkoutUpgrade([edited]);
    expect(plan.updates).toHaveLength(0);
    // The edited doc keeps its old name, so the new full programme is added alongside.
    expect(plan.adds.map((a) => a.name)).toContain("FIFA 11+ — Full Programme (20 Min)");
    expect(plan.adds.length).toBe(WORKOUT_SEED.length);
  });
});
