// Cloudflare Worker entrypoint.
// Serves the static SPA from the ASSETS binding, plus one tiny route:
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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/img" && request.method === "GET") return proxyImage(request);
    return env.ASSETS.fetch(request);
  },
};
