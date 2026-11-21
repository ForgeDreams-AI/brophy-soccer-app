const test = require("node:test");
const assert = require("node:assert");
const { handleApi, BUCKET_PREFIX } = require("../lib/api");

const usdaFetch = async (u) => {
  assert.strictEqual(new URL(u).searchParams.get("api_key"), "SECRET");
  return new Response(JSON.stringify({ foods: [{ fdcId: 1, description: "Chicken breast", foodNutrients: [{ nutrientId: 1008, value: 165 }, { nutrientId: 1003, value: 31 }] }] }));
};
const req = (path, query = {}, headers = { "sec-fetch-site": "same-origin" }) => ({ method: "GET", path, query, headers });

test("usda: same-site search returns trimmed foods, never the key", async () => {
  const r = await handleApi(req("/api/usda", { q: "chicken" }), { usdaKey: "SECRET", fetch: usdaFetch });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(JSON.parse(r.body).foods[0], { fdcId: 1, name: "Chicken breast", brand: "", cal: 165, p: 31, c: 0, f: 0 });
  assert.ok(!r.body.includes("SECRET"));
});
test("usda: cross-site 403, no key 503, short query empty", async () => {
  assert.strictEqual((await handleApi(req("/api/usda", { q: "rice" }, { "sec-fetch-site": "cross-site" }), { usdaKey: "SECRET", fetch: usdaFetch })).status, 403);
  assert.strictEqual((await handleApi(req("/api/usda", { q: "rice" }), { usdaKey: "", fetch: usdaFetch })).status, 503);
  assert.deepStrictEqual(JSON.parse((await handleApi(req("/api/usda", { q: "r" }), { usdaKey: "SECRET", fetch: usdaFetch })).body), { foods: [] });
});
test("img: only this bucket, only images", async () => {
  const imgFetch = async (u) => new Response("IMG", { headers: { "content-type": u.includes("bad") ? "text/html" : "image/jpeg" } });
  assert.strictEqual((await handleApi(req("/api/img", { u: BUCKET_PREFIX + "drills%2Fa.jpg" }), { fetch: imgFetch })).status, 200);
  assert.strictEqual((await handleApi(req("/api/img", { u: "https://evil.example/a.jpg" }), { fetch: imgFetch })).status, 400);
  assert.strictEqual((await handleApi(req("/api/img", { u: BUCKET_PREFIX + "bad" }), { fetch: imgFetch })).status, 415);
});
