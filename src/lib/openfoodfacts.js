// Open Food Facts — free, no key, 3.7M+ packaged products by barcode.
// https://world.openfoodfacts.org
// CC-BY licensed; attribution lives in the barcode result card.

const BASE = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "code,product_name,brands,nutriments,image_small_url";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export async function lookupBarcode(barcode, signal) {
  if (!barcode) throw new Error("No barcode provided.");
  const url = `${BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error("Barcode not found in Open Food Facts.");
  }
  const p = data.product;
  const n = p.nutriments || {};
  const cal =
    n["energy-kcal_100g"] ??
    n["energy-kcal"] ??
    (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0); // kJ → kcal
  const name = [p.brands, p.product_name].filter(Boolean).join(" — ").trim()
    || `Product ${barcode}`;
  return {
    barcode: p.code || barcode,
    name,
    cal: num(cal),
    p: num(n["proteins_100g"] ?? n["proteins"]),
    c: num(n["carbohydrates_100g"] ?? n["carbohydrates"]),
    f: num(n["fat_100g"] ?? n["fat"]),
    imageUrl: p.image_small_url || null,
  };
}

// Free-text product search (no key needed). Powers the unified food search
// alongside USDA. Values are per 100g, matching the USDA results shape.
const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

export async function searchProducts(query, signal) {
  if (!query?.trim()) return [];
  const url = new URL(SEARCH_URL);
  url.searchParams.set("search_terms", query.trim());
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "12");
  url.searchParams.set("fields", FIELDS);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
  const data = await res.json();
  return (data.products || []).map((p) => {
    const n = p.nutriments || {};
    const cal =
      n["energy-kcal_100g"] ??
      n["energy-kcal"] ??
      (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0);
    const name = [p.brands, p.product_name].filter(Boolean).join(" — ").trim();
    return {
      barcode: p.code,
      name,
      brand: p.brands || "",
      cal: num(cal),
      p: num(n["proteins_100g"] ?? n["proteins"]),
      c: num(n["carbohydrates_100g"] ?? n["carbohydrates"]),
      f: num(n["fat_100g"] ?? n["fat"]),
      imageUrl: p.image_small_url || null,
      source: "off",
    };
  }).filter((r) => r.name && (r.cal || r.p || r.c || r.f));
}
