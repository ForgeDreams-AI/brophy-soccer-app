import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Unique per deploy (build timestamp; a CI commit SHA if one is provided).
// Baked into the bundle as __BUILD_ID__ and written to /version.json so the
// running app can detect a new deploy and offer a refresh.
const buildId = process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || String(Date.now())

// Emits /version.json (served alongside the app) containing the build id.
const emitVersion = () => ({
  name: 'emit-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) })
  },
})

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // A production build without the web-push VAPID key ships an app where
  // nobody can turn on notifications ("missing VAPID key") — that happened
  // on 2026-11-21. The key is PUBLIC and lives in the committed
  // .env.production, so this only fires if that file is missing/emptied.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && mode === 'production' && !env.VITE_FIREBASE_VAPID_KEY) {
    const msg = 'VITE_FIREBASE_VAPID_KEY is missing — push notifications would be broken. '
      + 'Put the Web Push public key in teamhub/.env.production (see README → Push notifications).'
    // CI only checks that the code builds; a real (deploy) build must stop.
    if (process.env.CI) console.warn(`\n⚠ ${msg}\n`)
    else throw new Error(msg)
  }
  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [react(), emitVersion()],
  }
})
