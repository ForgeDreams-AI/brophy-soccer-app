// Free Exercise DB — public domain (Unlicense)
// https://github.com/yuhonas/free-exercise-db
// 800+ exercises with images and step-by-step instructions.

const DATA_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json";

// Pinned to a fixed commit so upstream changes can't alter or break the
// library at runtime. Bump deliberately after checking the new data.
// jsdelivr mirrors raw GitHub, faster + no rate-limiting concerns.
const IMG_BASE =
  "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises";

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
