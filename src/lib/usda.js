// Thin wrapper around USDA FoodData Central search.
// Get a free key at https://fdc.nal.usda.gov/api-key-signup.html
// then put it in .env.local as VITE_USDA_API_KEY=...
// (See teamhub/README.md → "Food search".)

const KEY = import.meta.env.VITE_USDA_API_KEY;
const BASE = "https://api.nal.usda.gov/fdc/v1";

// USDA nutrient IDs — stable across the API.
const N = { cal: 1008, p: 1003, c: 1005, f: 1004 };

const pickNutrients = (food) => {
  const out = { cal: 0, p: 0, c: 0, f: 0 };
  for (const n of food.foodNutrients || []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const val = n.value ?? n.amount;
    if (val == null) continue;
    if (id === N.cal) out.cal = Math.round(val);
    else if (id === N.p) out.p = Math.round(val);
    else if (id === N.c) out.c = Math.round(val);
    else if (id === N.f) out.f = Math.round(val);
  }
  return out;
};

export const hasUsdaKey = () => Boolean(KEY);

export async function searchFoods(query, signal) {
  if (!query?.trim()) return [];
  if (!KEY) throw new Error("Missing VITE_USDA_API_KEY (see README → Food search)");

  const url = new URL(`${BASE}/foods/search`);
  url.searchParams.set("api_key", KEY);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS)");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`USDA ${res.status}`);

  const data = await res.json();
  return (data.foods || []).map((f) => ({
    fdcId: f.fdcId,
    name: f.description,
    brand: f.brandName || f.brandOwner || "",
    ...pickNutrients(f), // values are per 100g for Foundation/SR/FNDDS
  }));
}
