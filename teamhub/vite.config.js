import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Unique per deploy: Cloudflare Pages sets CF_PAGES_COMMIT_SHA; fall back to a
// build timestamp for local/other builds. Baked into the bundle as __BUILD_ID__
// and written to /version.json so the running app can detect a new deploy.
const buildId = process.env.CF_PAGES_COMMIT_SHA || String(Date.now())

// Emits /version.json (served alongside the app) containing the build id.
const emitVersion = () => ({
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) })
  },
})

// The /api/usda and /api/img routes live in worker/index.js. A Cloudflare
// Worker deploy (wrangler.toml) runs that file directly. For a Cloudflare
// PAGES deploy, the same code is copied to dist/_worker.js ("advanced mode"
// — Pages runs it with the same env.ASSETS binding). `.assetsignore` keeps
// the Worker deploy from serving _worker.js as a public static file.
const emitPagesWorker = () => ({
  name: 'emit-pages-worker',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_worker.js', source: readFileSync(new URL('./worker/index.js', import.meta.url), 'utf8') })
    this.emitFile({ type: 'asset', fileName: '.assetsignore', source: '_worker.js\n' })
  },
})

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), emitVersion(), emitPagesWorker()],
})
