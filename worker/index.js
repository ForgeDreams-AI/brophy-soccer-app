// Cloudflare Worker entrypoint.
// Handles /api/* routes server-side (Gemini food-photo proxy lives here so
// the API key never reaches the browser) and falls through to the static
// SPA assets binding for everything else.

const FOOD_PHOTO_PROMPT = `You are a nutrition estimation assistant for a team sports app. Given a photo of food, identify the dish and estimate its nutritional content for the single serving visible in the image.

Respond ONLY with a JSON object in this exact shape — no markdown fences, no commentary:
{
  "name": "<short dish name, 1-5 words>",
  "cal": <integer calories>,
  "p": <integer grams protein>,
  "c": <integer grams carbs>,
  "f": <integer grams fat>,
  "confidence": "low" | "medium" | "high",
  "notes": "<optional, max 1 sentence: any caveat about portion or accuracy>"
}

Be conservative on confidence — if the image is dark, blurry, or you can't tell the food apart, say "low". If the dish is clear and well-known, say "high". Estimate to whole numbers.`;

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleFoodPhoto(request, env) {
  if (!env.GEMINI_API_KEY) {
    return jsonError(500, "Server is missing GEMINI_API_KEY");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const { imageBase64, mimeType = "image/jpeg" } = body || {};
  if (!imageBase64) return jsonError(400, "Missing imageBase64");

  const b64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: FOOD_PHOTO_PROMPT },
        { inlineData: { mimeType, data: b64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return jsonError(resp.status, `Gemini error: ${err.slice(0, 400)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return jsonError(502, "Gemini returned no text");

  try {
    const parsed = JSON.parse(text);
    return Response.json(parsed);
  } catch {
    return jsonError(502, "Gemini returned non-JSON: " + text.slice(0, 200));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/food-photo") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handleFoodPhoto(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
