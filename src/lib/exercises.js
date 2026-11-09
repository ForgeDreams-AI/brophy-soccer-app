// Free Exercise DB — public domain (Unlicense)
// https://github.com/yuhonas/free-exercise-db
// 800+ exercises with images and step-by-step instructions.

const DATA_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

// jsdelivr mirrors raw GitHub, faster + no rate-limiting concerns.
const IMG_BASE =
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

export const exerciseImageUrl = (relPath) =>
  relPath ? `${IMG_BASE}/${relPath}` : null;

let cached = null;
let inflight = null;

export function loadExercises() {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch(DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cached = Array.isArray(data) ? data : [];
      inflight = null;
      return cached;
    })
    .catch((e) => {
      inflight = null;
      throw e;
    });
  return inflight;
}
