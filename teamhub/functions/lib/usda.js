// USDA FoodData Central search (server side). Pure — no Firebase imports.
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

// Returns up to 8 foods { fdcId, name, brand, cal, p, c, f } per 100 g.
async function searchUsda(query, { usdaKey, fetch }) {
  const q = String(query || "").trim().slice(0, 100);
  if (q.length < 2) return [];
  if (!usdaKey) throw new Error("USDA_API_KEY is not set");
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", usdaKey);
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA ${res.status}`);
  const data = await res.json();
  return (data.foods || []).map((f) => ({ fdcId: f.fdcId, name: f.description, brand: f.brandName || f.brandOwner || "", ...usdaMacros(f) }));
}

module.exports = { searchUsda, usdaMacros };
