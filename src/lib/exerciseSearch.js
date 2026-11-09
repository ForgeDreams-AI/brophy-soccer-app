// Smart exercise search — fuzzy + alias-aware, runs locally over the loaded
// exercise list (Free Exercise DB + coach-authored). Tolerates typos, partial
// words, word order, punctuation, and common gym slang / abbreviations, so you
// don't have to type the exact name the database uses.

const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Common gym slang / abbreviations → the canonical name to search for instead.
// Kept minimal (just the real name) because the alias-expanded tokens are all
// required to match. Coaches can extend per-exercise via "also known as".
const ALIASES = {
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  ohp: "overhead press",
  pushup: "push up",
  pullup: "pull up",
  situp: "sit up",
  chinup: "chin up",
  skullcrusher: "lying triceps extension",
  "skull crusher": "lying triceps extension",
  "hip thrust": "glute bridge",
  "glute bridge": "hip thrust",
  "monster walk": "lateral band walk",
  "face pull": "rear delt",
  "good morning": "good morning",
  bicep: "biceps",
  tricep: "triceps",
  quad: "quadriceps",
  ham: "hamstrings",
  glutes: "glute",
  abs: "abdominals",
  delts: "shoulders",
  lats: "lat",
  pecs: "chest",
};

// True if strings are within one edit (insert/delete/substitute) — typo tolerance.
const within1 = (a, b) => {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
};

// Single-pass alias replacement (longest keys first). A single regex pass means
// replaced text isn't re-scanned, so bidirectional aliases don't ping-pong.
const ALIAS_RE = new RegExp(
  "\\b(" + Object.keys(ALIASES).sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b",
  "g",
);
const expand = (q) => q.replace(ALIAS_RE, (m) => ALIASES[m] || m);

const haystackOf = (ex) => norm([
  ex.name,
  ...(ex.aliases || []),
  ...(ex.primaryMuscles || []),
  ...(ex.secondaryMuscles || []),
  ex.equipment,
  ex.category,
].filter(Boolean).join(" "));

// Score one token set against a haystack; -1 if any token can't be matched.
const scoreTokens = (tokens, hay, words) => {
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) { score += 3; continue; }
    if (t.length >= 4 && words.some((w) => within1(w, t))) { score += 2; continue; } // typo
    if (t.length >= 3 && words.some((w) => w.startsWith(t))) { score += 1; continue; } // partial
    return -1; // every token must match somehow
  }
  return score;
};

// Returns matching exercises, best first. Matches on the literal query OR its
// alias-expanded form (whichever lands), so "rdl" and "romanian deadlift" both work.
export function searchExercises(items, query, limit = 40) {
  const q = norm(query);
  if (!q) return [];
  const origTokens = q.split(" ").filter(Boolean);
  const expTokens = expand(q).split(" ").filter(Boolean);
  const sameExpansion = expTokens.join(" ") === origTokens.join(" ");
  const scored = [];
  for (const ex of items) {
    const hay = haystackOf(ex);
    const words = hay.split(" ");
    const name = norm(ex.name);
    let s = scoreTokens(origTokens, hay, words);
    if (s < 0 && !sameExpansion) s = scoreTokens(expTokens, hay, words);
    if (s < 0) continue;
    if (name === q) s += 10;
    else if (name.startsWith(q)) s += 5;
    else if (name.includes(q)) s += 3;
    scored.push({ ex, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.ex);
}
