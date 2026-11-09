// Train feature data hooks — every Firestore read/write in this area goes
// through these wrappers (contract rule 5). Components never touch
// firebase/firestore directly; they call these hooks, which are also where
// the seed writers live.
//
// Gym owns the workout/exercise hooks; Videos + Nutrition (this section)
// own the video, recipe, food-log, and nutrition-target hooks.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { COL, userWorkouts, foodEntries, savedFoods as savedFoodsPath } from "../../data/collections";
import { useCollection, useAudienceCollection } from "../../data/hooks";
import { withAudienceKeys } from "../../lib/audience";
import { todayKey } from "../../lib/dates";
import { RECIPE_SEED } from "../../data/seeds/recipeSeed";
import { loadExercises } from "../../lib/exercises";
import { downscaleImage } from "../../lib/images";
import { liftSeedDocs } from "../../data/seeds/liftSeed";
import { workoutSeedDocs } from "../../data/seeds/workoutSeed";

// Local row keys (`__k`) keep exercise rows stable across reorder/edit — they
// are a UI artifact and must never reach Firestore, so writers strip them.
export function stripRowKeys(exercises = []) {
  if (!Array.isArray(exercises)) return exercises;
  return exercises.map((e) => {
    if (e && typeof e === "object" && "__k" in e) {
      const rest = { ...e };
      delete rest.__k;
      return rest;
    }
    return e;
  });
}

// ── Public exercise DB (Free Exercise DB, public domain) ──────────────────────
// The build has no useExerciseLib — the monolith imported one that didn't
// exist in the new layout, so this hook is the canonical port: loadExercises()
// → { items, loading, err }.
export function useExerciseLib() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    loadExercises()
      .then((list) => {
        if (live) {
          setItems(list || []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setErr(e?.message || "Couldn't load the exercise database.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  return { items, loading, err };
}

// ── Coach-authored custom exercises (`customExercises`) ────────────────────────
export function useCustomExercises() {
  const docs = useCollection(COL.customExercises, orderBy("createdAt", "desc"));

  const add = useCallback(
    (data) =>
      addDoc(collection(db, COL.customExercises), {
        ...data,
        createdAt: serverTimestamp(),
      }),
    [],
  );
  const update = useCallback(
    (id, data) => updateDoc(doc(db, COL.customExercises, id), data),
    [],
  );
  const del = useCallback(
    (id) => deleteDoc(doc(db, COL.customExercises, id)),
    [],
  );

  // One-tap starter library — batch-writes the curated lift seed, skipping any
  // lift whose name already exists (additive; never disturbs existing).
  const seed = useCallback(async () => {
    const have = new Set(docs.map((e) => (e.name || "").toLowerCase().trim()));
    const all = liftSeedDocs();
    const fresh = all.filter((l) => !have.has((l.name || "").toLowerCase().trim()));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((l) =>
        batch.set(doc(collection(db, COL.customExercises)), {
          ...l,
          createdAt: serverTimestamp(),
        }),
      );
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  }, [docs]);

  return { items: docs, add, update, del, seed };
}

// ── Photo uploads for custom exercises → exercises/{uid}/{ts}-{rand}.jpg ─────
export async function uploadExercisePhoto(uid, file) {
  const { blob } = await downscaleImage(file, { maxDim: 1600, quality: 0.86 });
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `exercises/${uid}/${Date.now()}-${rand}.jpg`;
  const r = storageRef(storage, path);
  const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return getDownloadURL(snap.ref);
}

// ── Personal workouts (`users/{uid}/workouts`) ────────────────────────────────
export function useMyWorkouts(uid) {
  const path = userWorkouts(uid);
  const items = useCollection(path, orderBy("updatedAt", "desc"));

  const add = useCallback(
    (input) => {
      const base = typeof input === "string" ? { name: input } : input || {};
      return addDoc(collection(db, path), {
        ...base,
        exercises: stripRowKeys(base.exercises || []),
        name: (base.name || "").trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [path],
  );
  const update = useCallback(
    (id, data) => {
      const clean = { ...data };
      if (Array.isArray(clean.exercises)) clean.exercises = stripRowKeys(clean.exercises);
      return updateDoc(doc(db, path, id), { ...clean, updatedAt: serverTimestamp() });
    },
    [path],
  );
  const del = useCallback((id) => deleteDoc(doc(db, path, id)), [path]);

  return { items, add, update, del };
}

// ── Team workouts (`teamWorkouts` + createdByUid/Name, area) ──────────────────
export function useTeamWorkouts(user) {
  const items = useCollection(COL.teamWorkouts, orderBy("updatedAt", "desc"));

  const add = useCallback(
    (input) => {
      const base = typeof input === "string" ? { name: input } : input || {};
      return addDoc(collection(db, COL.teamWorkouts), {
        ...base,
        exercises: stripRowKeys(base.exercises || []),
        name: (base.name || "").trim(),
        createdByUid: user?.uid || null,
        createdByName: user?.name || "Coach",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [user],
  );
  const update = useCallback((id, data) => {
    const clean = { ...data };
    if (Array.isArray(clean.exercises)) clean.exercises = stripRowKeys(clean.exercises);
    return updateDoc(doc(db, COL.teamWorkouts, id), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  }, []);
  const del = useCallback((id) => deleteDoc(doc(db, COL.teamWorkouts, id)), []);

  // One-tap starter sessions — batch-writes the curated team workouts grouped
  // by focus area. De-dupes by name so it's additive and safe to re-run.
  const seed = useCallback(async () => {
    const have = new Set(items.map((w) => (w.name || "").toLowerCase().trim()));
    const all = workoutSeedDocs();
    const fresh = all.filter((w) => !have.has((w.name || "").toLowerCase().trim()));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((w) =>
        batch.set(doc(collection(db, COL.teamWorkouts)), {
          ...w,
          createdByUid: user?.uid || null,
          createdByName: user?.name || "Starter",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  }, [items, user]);

  return { items, add, update, del, seed };
}

/* ══════════════════════ VIDEOS + NUTRITION (area section) ════════════════
   Owned by the Nutrition/Videos feature build. Doc shapes:
   - Video: { title, url, cat, subfolder, dur, diff, desc, type } + createdAt
   - Recipe: { name, cat, sub, cal, p, c, f, prep } + createdAt
   - Category: { name } + createdAt (admin-extensible meal categories)
   - Food entry (logs/{uid}/entries): { name, cat, cal, p, c, f, time,
     feeling, custom? } + createdAt
   - Saved food (logs/{uid}/savedFoods): { name, cal, p, c, f } + createdAt
   - Nutrition target: { cal, protein, visibleTo, audienceKeys,
     createdByName, createdAt } */

// ── Videos (`videos`) ───────────────────────────────────────────────────────
export function useTrainVideos() {
  const videos = useCollection(COL.videos, orderBy("createdAt", "desc"));
  return {
    videos,
    addVideo: (data) =>
      addDoc(collection(db, COL.videos), { ...data, createdAt: serverTimestamp() }),
    updateVideo: (id, data) => updateDoc(doc(db, COL.videos, id), data),
    deleteVideo: (id) => deleteDoc(doc(db, COL.videos, id)),
    importVideos: async (rows) => {
      const batch = writeBatch(db);
      rows.forEach((r) =>
        batch.set(doc(collection(db, COL.videos)), { ...r, createdAt: serverTimestamp() }),
      );
      await batch.commit();
      return rows.length;
    },
  };
}

// ── Recipes (`recipes`) + categories (`categories`) ─────────────────────────
export function useTrainRecipes() {
  const recipes = useCollection(COL.recipes, orderBy("name"));
  const categoryDocs = useCollection(COL.categories, orderBy("name"));
  const categories = useMemo(
    () => categoryDocs.map((c) => c.name).filter(Boolean),
    [categoryDocs],
  );
  return {
    recipes,
    categories,
    addRecipe: (data) =>
      addDoc(collection(db, COL.recipes), { ...data, createdAt: serverTimestamp() }),
    updateRecipe: (id, data) => updateDoc(doc(db, COL.recipes, id), data),
    deleteRecipe: (id) => deleteDoc(doc(db, COL.recipes, id)),
    importRecipes: async (rows) => {
      const batch = writeBatch(db);
      rows.forEach((r) =>
        batch.set(doc(collection(db, COL.recipes)), { ...r, createdAt: serverTimestamp() }),
      );
      await batch.commit();
      return rows.length;
    },
    addCategory: (name) =>
      addDoc(collection(db, COL.categories), {
        name: String(name).trim(),
        createdAt: serverTimestamp(),
      }),
    // One-tap 120 starter recipes — de-dupes by name+category so it's safe to
    // re-run and never overwrites recipes already added.
    seedRecipes: async () => {
      const key = (r) =>
        `${(r.name || "").toLowerCase().trim()}|${(r.cat || "").toLowerCase().trim()}`;
      const have = new Set(recipes.map(key));
      const fresh = RECIPE_SEED.filter((r) => !have.has(key(r)));
      if (fresh.length) {
        const batch = writeBatch(db);
        fresh.forEach((r) =>
          batch.set(doc(collection(db, COL.recipes)), { ...r, createdAt: serverTimestamp() }),
        );
        await batch.commit();
      }
      return { added: fresh.length, skipped: RECIPE_SEED.length - fresh.length };
    },
  };
}

// ── Food log — private subcollection per player (logs/{uid}/entries) ────────
export function useFoodLog(uid) {
  const path = foodEntries(uid);
  const logged = useCollection(path, orderBy("createdAt", "desc"));
  return {
    logged,
    addLog: async (data) => {
      if (!path) throw new Error("No user");
      const ref = await addDoc(collection(db, path), {
        ...data,
        createdAt: serverTimestamp(),
      });
      // Bump the activity marker so the coach compliance view sees this
      // player today without reading what they actually ate.
      setDoc(
        doc(db, COL.mealActivity, `${uid}_${todayKey()}`),
        { uid, date: todayKey(), lastLoggedAt: serverTimestamp() },
        { merge: true },
      ).catch(() => {});
      return ref;
    },
    updateLog: (id, data) => updateDoc(doc(db, path, id), data),
    deleteLog: (id) => deleteDoc(doc(db, path, id)),
  };
}

// ── Saved / favorite foods — private per player (logs/{uid}/savedFoods) ─────
export function useSavedFoods(uid) {
  const path = savedFoodsPath(uid);
  const savedFoods = useCollection(path, orderBy("createdAt", "desc"));
  return {
    savedFoods,
    addSavedFood: (data) =>
      addDoc(collection(db, path), { ...data, createdAt: serverTimestamp() }),
    deleteSavedFood: (id) => deleteDoc(doc(db, path, id)),
  };
}

// ── Water — one doc per player per day, id `${uid}_${date}` ─────────────────
export function useWater(uid) {
  const key = todayKey();
  const docs = useCollection(
    uid ? COL.water : null,
    where("uid", "==", uid || "_"),
    where("date", "==", key),
  );
  const waterCups = docs[0]?.cups || 0;
  const setWaterCups = (cups) => {
    if (!uid) return Promise.resolve();
    return setDoc(
      doc(db, COL.water, `${uid}_${key}`),
      { uid, date: key, cups, updatedAt: serverTimestamp() },
      { merge: true },
    );
  };
  return { waterCups, setWaterCups };
}

// ── Nutrition targets — coach sets daily kcal/protein goals ─────────────────
// Reads are audience-scoped (players only fetch docs whose audienceKeys match
// them); writes stamp audienceKeys via withAudienceKeys().
export function useNutritionTargets(user) {
  const targets = useAudienceCollection(COL.nutritionTargets, user, "createdAt");
  const groups = useCollection(COL.groups, orderBy("name"));
  const roster = useCollection(COL.invites, orderBy("email"));

  // The player's applicable target — prefer one that names them/their group
  // over a team-wide ("everyone") target.
  const myTarget = useMemo(() => {
    if (!user || (!user.uid && !user.email)) return null;
    const myGroups = new Set(
      groups
        .filter(
          (g) =>
            (g.memberUids || []).includes(user.uid) ||
            (g.memberUids || []).includes(user.email),
        )
        .map((g) => g.id),
    );
    const visible = targets.filter((t) => {
      const v = t.visibleTo || {};
      const emails = v.emails || [];
      const gids = v.groupIds || [];
      if (!emails.length && !gids.length) return true;
      if (user.email && emails.includes(user.email)) return true;
      return gids.some((id) => myGroups.has(id));
    });
    const specific = visible.find(
      (t) => t.visibleTo?.emails?.length || t.visibleTo?.groupIds?.length,
    );
    return specific || visible[0] || null;
  }, [targets, groups, user]);

  const addNutritionTarget = ({ cal, protein, visibleTo }) =>
    addDoc(
      collection(db, COL.nutritionTargets),
      withAudienceKeys(
        {
          cal: Number(cal) || 0,
          protein: Number(protein) || 0,
          visibleTo: visibleTo || { groupIds: [], emails: [] },
          createdByName: user?.name || "",
          createdAt: serverTimestamp(),
        },
        groups,
      ),
    );
  const deleteNutritionTarget = (id) => deleteDoc(doc(db, COL.nutritionTargets, id));

  return { targets, groups, roster, myTarget, addNutritionTarget, deleteNutritionTarget };
}
