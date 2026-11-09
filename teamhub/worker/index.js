// Cloudflare Worker entrypoint.
// Static SPA only: every request falls through to the ASSETS binding.
// (The old /api/food-photo Gemini proxy was removed — food photo AI is not
// part of the app. There are currently no /api/* routes.)
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
