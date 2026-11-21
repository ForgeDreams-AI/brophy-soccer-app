// Cloudflare Worker entrypoint.
// Serves the static SPA from the ASSETS binding, plus two tiny routes:
//
//   GET /api/usda?q=<food>   USDA FoodData Central search with the key kept
//                            server-side (Worker secret USDA_API_KEY — set with
//                            `npx wrangler secret put USDA_API_KEY`). The
//                            browser never sees the key.
//
//   GET /api/img?u=<Firebase Storage download URL>
//
// A same-origin image proxy for PDF export. The browser can only draw
// another site's image into a canvas (html2canvas → PDF) when that site
// sends CORS headers, and the Firebase Storage bucket doesn't unless its
// CORS config is applied (teamhub/cors.json). Proxying through our own
// origin makes drill photos/diagrams show up in exported practice PDFs
// either way. Locked to THIS project's bucket so it can't be used as an
// open proxy; the download URL's own token is what authorizes the read,
// exactly as when the <img> loads it directly.

const ALLOWED_PREFIX = "https://firebasestorage.googleapis.com/v0/b/brophy-soccer-app.firebasestorage.app/o/";
const MAX_BYTES = 15 * 1024 * 1024;

async function proxyImage(request) {
  const u = new URL(request.url).searchParams.get("u") || "";
  if (!u.startsWith(ALLOWED_PREFIX)) return new Response("Not allowed", { status: 400 });
  const upstream = await fetch(u, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!upstream.ok) return new Response("Upstream error", { status: 502 });
  const type = upstream.headers.get("content-type") || "";
  const len = Number(upstream.headers.get("content-length") || 0);
  if (!type.startsWith("image/") || len > MAX_BYTES) return new Response("Not an image", { status: 415 });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

// USDA nutrient ids (stable across the API) → our per-100 g macro fields.
const USDA_N = { cal: 1008, p: 1003, c: 1005, f: 1004 };
const usdaMacros = (food) => {
  const out = { cal: 0, p: 0, c: 0, f: 0 };
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const val = n.value ?? n.amount;
    if (val == null) continue;
    if (id === USDA_N.cal) out.cal = Math.round(val);
    else if (id === USDA_N.p) out.p = Math.round(val);
    else if (id === USDA_N.c) out.c = Math.round(val);
    else if (id === USDA_N.f) out.f = Math.round(val);
  }
  return out;
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...extra },
});

async function usdaSearch(request, env, ctx) {
  // Same-site callers only (browsers send Sec-Fetch-Site on fetch()), so
  // other websites can't use this as a free USDA proxy on our quota.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ error: "forbidden" }, 403);
  if (!env.USDA_API_KEY) return json({ error: "USDA search is not configured" }, 503);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return json({ foods: [] });

  // Edge cache per query (1 day): repeat searches don't hit USDA at all.
  const cacheKey = new Request(`https://usda-cache.internal/search?q=${encodeURIComponent(q.toLowerCase())}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", env.USDA_API_KEY);
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");
  const upstream = await fetch(url);
  if (!upstream.ok) return json({ error: `USDA ${upstream.status}` }, 502);
  const data = await upstream.json();
  const foods = (data.foods || []).map((f) => ({
    fdcId: f.fdcId,
    name: f.description,
    brand: f.brandName || f.brandOwner || "",
    ...usdaMacros(f), // per 100 g for Foundation / SR Legacy / FNDDS
  }));
  const res = json({ foods }, 200, { "cache-control": "public, max-age=86400" });
  ctx?.waitUntil?.(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/usda" && request.method === "GET") return usdaSearch(request, env, ctx);
    if (pathname === "/api/img" && request.method === "GET") return proxyImage(request);
    return env.ASSETS.fetch(request);
  },
};
