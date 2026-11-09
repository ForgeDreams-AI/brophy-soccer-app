/* global __BUILD_ID__ */
// Build id baked in at compile time by vite.config.js (via `define`). Every
// deploy gets a fresh id (the Cloudflare commit SHA, or a build timestamp), so
// the running tab can tell when a newer version has shipped and offer a refresh.
// Falls back to "dev" when running the dev server (no define replacement quirks).
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
