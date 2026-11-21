// Same-origin API for the web app, served on Firebase Hosting through a
// rewrite (firebase.json: /api/** → the `api` function). Two routes:
//
//   GET /api/usda?q=<food>  USDA FoodData Central search. The USDA key stays
//                           server-side (Secret Manager secret USDA_API_KEY);
//                           the browser never sees it.
//   GET /api/img?u=<url>    Image proxy for PDF export, locked to this
//                           project's Storage bucket (backup for when the
//                           bucket's CORS config isn't applied).
//
// Pure request handler (no Firebase imports) so it's unit-testable.

const BUCKET_PREFIX = "https://firebasestorage.googleapis.com/v0/b/brophy-soccer-app.firebasestorage.app/o/";
const MAX_IMG_BYTES = 15 * 1024 * 1024;
const USDA_N = { cal: 1008, p: 1003, c: 1005, f: 1004 };

function usdaMacros(food) {
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
}

const json = (status, body, cache = "no-store") => ({
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff" },
  body: JSON.stringify(body),
});

// req: { method, path, query, headers }  deps: { usdaKey, fetch }
async function handleApi(req, { usdaKey, fetch }) {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  const path = (req.path || "").replace(/\/+$/, "");

  if (path === "/api/usda") {
    // Same-site callers only (browsers send Sec-Fetch-Site on fetch()), so
    // other websites can't use this as a free USDA proxy on our quota.
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin") return json(403, { error: "forbidden" });
    if (!usdaKey) return json(503, { error: "USDA search is not configured" });
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q.length < 2) return json(200, { foods: [] });
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", usdaKey);
    url.searchParams.set("query", q);
    url.searchParams.set("pageSize", "8");
    url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");
    const upstream = await fetch(url);
    if (!upstream.ok) return json(502, { error: `USDA ${upstream.status}` });
    const data = await upstream.json();
    const foods = (data.foods || []).map((f) => ({
      fdcId: f.fdcId, name: f.description, brand: f.brandName || f.brandOwner || "", ...usdaMacros(f),
    }));
    // Cached a day by the Firebase Hosting CDN (s-maxage) and the browser.
    return json(200, { foods }, "public, max-age=86400, s-maxage=86400");
  }

  if (path === "/api/img") {
    const u = String(req.query.u || "");
    if (!u.startsWith(BUCKET_PREFIX)) return json(400, { error: "not allowed" });
    const upstream = await fetch(u);
    if (!upstream.ok) return json(502, { error: "upstream error" });
    const type = upstream.headers.get("content-type") || "";
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!type.startsWith("image/") || buf.length > MAX_IMG_BYTES) return json(415, { error: "not an image" });
    return { status: 200, headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=86400", "x-content-type-options": "nosniff" }, body: buf };
  }

  return json(404, { error: "not found" });
}

module.exports = { handleApi, BUCKET_PREFIX };
