const test = require("node:test");
const assert = require("node:assert");
const { searchUsda } = require("../lib/usda");

test("searchUsda maps foods and sends the key only upstream", async () => {
  const fetch = async (u) => {
    assert.strictEqual(new URL(u).searchParams.get("api_key"), "SECRET");
    return new Response(JSON.stringify({ foods: [{ fdcId: 1, description: "Chicken breast", foodNutrients: [{ nutrientId: 1008, value: 165 }, { nutrientId: 1003, value: 31 }] }] }));
  };
  const foods = await searchUsda("chicken", { usdaKey: "SECRET", fetch });
  assert.deepStrictEqual(foods, [{ fdcId: 1, name: "Chicken breast", brand: "", cal: 165, p: 31, c: 0, f: 0 }]);
});
test("searchUsda: short query empty, missing key and HTTP errors throw", async () => {
  assert.deepStrictEqual(await searchUsda("c", { usdaKey: "K", fetch: async () => { throw new Error("no"); } }), []);
  await assert.rejects(searchUsda("rice", { usdaKey: "", fetch }));
  await assert.rejects(searchUsda("rice", { usdaKey: "K", fetch: async () => new Response("x", { status: 429 }) }));
});
