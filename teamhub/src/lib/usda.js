// USDA FoodData Central search — through the app's own server route.
//
// The USDA API key used to be baked into the public JS bundle
// (VITE_USDA_API_KEY), where anyone could copy it. Now the browser calls
// the same-origin Cloudflare Worker route /api/usda (worker/index.js), which
// adds the key from a Worker secret (USDA_API_KEY) and returns a trimmed
// result list. No key ever reaches the browser.
//
// If the route isn't available (local `npm run dev`, or a host without the
// Worker), USDA search is simply skipped and food search uses Open Food
// Facts only — it never throws at the user.

const ENDPOINT = "/api/usda";

let available = null; // null = unknown, true/false after the first call

export const usdaAvailable = () => available !== false;

export async function searchFoods(query, signal) {
  const q = (query || "").trim();
  if (!q || available === false) return [];
  let res;
  try {
    res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q.slice(0, 100))}`, { signal });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return [];
  }
  const type = res.headers.get("content-type") || "";
  // The SPA fallback answers an unknown path with index.html: no route here.
  // 503 = the Worker has no USDA_API_KEY secret yet.
  if (res.status === 404 || res.status === 503 || !type.includes("application/json")) { available = false; return []; }
  if (!res.ok) throw new Error(`USDA ${res.status}`);
  available = true;
  const data = await res.json();
  return Array.isArray(data.foods) ? data.foods : [];
}
