// Coach Center → Game Day / Roster: the coach lists their team's players and
// invites (the same queries TeamHubRoles.jsx runs).
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import { as, makeEnv, seed, seedUsers } from './helpers.js'

let env
beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await seedUsers(env)
  await seed(env, 'invitedEmails/p9@example.com', { email: 'p9@example.com', teamId: 'varsity', role: 'player' })
})

const users = (db, team) => query(collection(db, 'users'), where('teamIds', 'array-contains', team), orderBy('name'))
const invites = (db, team) => query(collection(db, 'invitedEmails'), where('teamId', '==', team), orderBy('email'))

describe('team roster queries', () => {
  test('a coach lists their own team\'s players and invites', async () => {
    const db = as(env, 'coachV').firestore()
    await assertSucceeds(getDocs(users(db, 'varsity')))
    await assertSucceeds(getDocs(invites(db, 'varsity')))
  })
  test('the org admin lists any team', async () => {
    const db = as(env, 'org').firestore()
    await assertSucceeds(getDocs(users(db, 'varsity')))
    await assertSucceeds(getDocs(invites(db, 'jvb')))
  })
  test('a coach cannot list another team', async () => {
    await assertFails(getDocs(users(as(env, 'coachJ').firestore(), 'varsity')))
  })
})

describe('player roster listing', () => {
  test('a player lists their own team (chat member lists etc.)', async () => {
    await assertSucceeds(getDocs(users(as(env, 'p1').firestore(), 'varsity')))
  })
  test('a player cannot list another team', async () => {
    await assertFails(getDocs(users(as(env, 'p1').firestore(), 'jvb')))
  })
  test('an unfiltered list of all users is denied to a coach', async () => {
    await assertFails(getDocs(collection(as(env, 'coachV').firestore(), 'users')))
  })
})

describe('statistician role', () => {
  beforeEach(async () => {
    await seed(env, 'users/stat1', { name: 'Stat Guy', email: 'stat1@example.com', role: 'statistician', teamIds: ['varsity'], primaryTeamId: 'varsity' })
  })
  const game = { teamId: 'varsity', opponent: 'Xavier', date: '2026-11-24', status: 'live' }
  test('records games for their own team without being picked', async () => {
    const { addDoc } = await import('firebase/firestore')
    await assertSucceeds(addDoc(collection(as(env, 'stat1').firestore(), 'games'), game))
  })
  test('cannot record for another team', async () => {
    const { addDoc } = await import('firebase/firestore')
    await assertFails(addDoc(collection(as(env, 'stat1').firestore(), 'games'), { ...game, teamId: 'jvb' }))
  })
  test('a plain player still cannot record', async () => {
    const { addDoc } = await import('firebase/firestore')
    await assertFails(addDoc(collection(as(env, 'p1').firestore(), 'games'), game))
  })
  test('has team-app access (shared libraries)', async () => {
    await assertSucceeds(getDocs(collection(as(env, 'stat1').firestore(), 'recipes')))
  })
  test('can sign up from a statistician invite', async () => {
    const { setDoc, doc } = await import('firebase/firestore')
    await seed(env, 'invitedEmails/new.stat@example.com', { email: 'new.stat@example.com', teamId: 'varsity', role: 'statistician' })
    const db = env.authenticatedContext('newstat', { email: 'new.stat@example.com', email_verified: true }).firestore()
    await assertSucceeds(setDoc(doc(db, 'users/newstat'), { name: 'New Stat', email: 'new.stat@example.com', role: 'statistician', teamIds: ['varsity'], primaryTeamId: 'varsity', initials: 'NS' }))
  })
})
