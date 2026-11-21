// Shared setup for the security-rules tests. Runs only against the local
// emulators (demo- project id: no real Firebase project is ever touched).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PROJECT_ID = 'demo-brophy'

function hostPort(envVar, fallbackPort) {
  const v = process.env[envVar]
  if (!v) return { host: '127.0.0.1', port: fallbackPort }
  const i = v.lastIndexOf(':')
  return { host: v.slice(0, i), port: Number(v.slice(i + 1)) }
}

export async function makeEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8'),
      ...hostPort('FIRESTORE_EMULATOR_HOST', 8080),
    },
    storage: {
      rules: readFileSync(resolve(root, 'storage.rules'), 'utf8'),
      ...hostPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
    },
  })
}

// Seed user profiles. Every test file starts from this cast.
export const USERS = {
  org: { name: 'Org Admin', email: 'org@example.com', role: 'orgAdmin', teamIds: ['jvb', 'jva', 'varsity'], primaryTeamId: 'varsity' },
  coachV: { name: 'Coach V', email: 'coachv@example.com', role: 'admin', teamIds: ['varsity'], primaryTeamId: 'varsity' },
  coachJ: { name: 'Coach J', email: 'coachj@example.com', role: 'admin', teamIds: ['jvb'], primaryTeamId: 'jvb' },
  p1: { name: 'Player One', email: 'p1@example.com', role: 'player', teamIds: ['varsity'], primaryTeamId: 'varsity' },
  p2: { name: 'Player Two', email: 'p2@example.com', role: 'player', teamIds: ['varsity'], primaryTeamId: 'varsity' },
  builder: { name: 'Drill Builder', email: 'builder@example.com', role: 'drillBuilder', teamIds: [], primaryTeamId: null },
}

export async function seedUsers(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, `users/${uid}`), data)
    }
  })
}

export async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

// An authenticated context for a seeded user (email verified).
export function as(env, uid) {
  const email = USERS[uid]?.email || `${uid}@example.com`
  return env.authenticatedContext(uid, { email, email_verified: true })
}
