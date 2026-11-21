import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  Timestamp, deleteDoc, doc, getDoc, increment, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore'
import { as, makeEnv, seed, seedUsers } from './helpers.js'

let env
beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await seedUsers(env)
})

const HOUR = 3600 * 1000

// A fresh, profile-less account signing in for the first time.
function newbie(email = 'newbie@example.com', verified = true) {
  return env.authenticatedContext('newbie', { email, email_verified: verified })
}
const profile = (over = {}) => ({
  name: 'New Person', initials: 'NP', email: 'newbie@example.com',
  role: 'player', teamIds: ['varsity'], primaryTeamId: 'varsity', ...over,
})

describe('users create (F01)', () => {
  test('uninvited user cannot create a profile', async () => {
    const db = newbie().firestore()
    await assertFails(setDoc(doc(db, 'users/newbie'), profile()))
  })

  test('cannot self-create as orgAdmin without a matching invite', async () => {
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'varsity', role: 'player' })
    const db = newbie().firestore()
    await assertFails(setDoc(doc(db, 'users/newbie'), profile({ role: 'orgAdmin' })))
    await assertFails(setDoc(doc(db, 'users/newbie'), profile({ role: 'admin' })))
  })

  test('email invite: create succeeds with matching role + team', async () => {
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'jva', role: 'admin' })
    const db = newbie().firestore()
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), profile({ role: 'admin', teamIds: ['jva'], primaryTeamId: 'jva' })))
  })

  test('email invite: wrong team, extra teams, extra keys or unverified email are denied', async () => {
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'jva', role: 'player' })
    const db = newbie().firestore()
    await assertFails(setDoc(doc(db, 'users/newbie'), profile()))
    await assertFails(setDoc(doc(db, 'users/newbie'), profile({ teamIds: ['jva', 'varsity'], primaryTeamId: 'jva' })))
    await assertFails(setDoc(doc(db, 'users/newbie'), profile({ teamIds: ['jva'], primaryTeamId: 'jva', fcmTokens: [] })))
    const unverified = newbie('newbie@example.com', false).firestore()
    await assertFails(setDoc(doc(unverified, 'users/newbie'), profile({ teamIds: ['jva'], primaryTeamId: 'jva' })))
  })

  test('email invite: profile email must be the token email (lowercased)', async () => {
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'varsity', role: 'player' })
    const db = newbie('NewBie@Example.com').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), profile()))
  })

  test('cannot create someone else\'s profile', async () => {
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'varsity', role: 'player' })
    const db = newbie().firestore()
    await assertFails(setDoc(doc(db, 'users/someoneElse'), profile()))
  })
})

describe('invite links (F01 + F40)', () => {
  const link = (over = {}) => ({
    teamId: 'jvb', createdByUid: 'coachJ', createdByName: 'Coach J', code: 'CODE1',
    createdAt: Timestamp.now(), expiresAt: null, maxUses: null, uses: 0, ...over,
  })
  const linkProfile = (over = {}) => profile({ teamIds: ['jvb'], primaryTeamId: 'jvb', inviteCode: 'CODE1', ...over })

  function redeem(db, data = linkProfile()) {
    const b = writeBatch(db)
    b.set(doc(db, 'users/newbie'), data)
    b.update(doc(db, 'inviteLinks/CODE1'), { uses: increment(1) })
    return b.commit()
  }

  test('user create + uses increment in one batch succeeds', async () => {
    await seed(env, 'inviteLinks/CODE1', link({ maxUses: 5, expiresAt: Timestamp.fromMillis(Date.now() + HOUR) }))
    await assertSucceeds(redeem(newbie().firestore()))
  })

  test('uses bump alone fails (also for an existing user)', async () => {
    await seed(env, 'inviteLinks/CODE1', link())
    await assertFails(updateDoc(doc(newbie().firestore(), 'inviteLinks/CODE1'), { uses: increment(1) }))
    await assertFails(updateDoc(doc(as(env, 'p1').firestore(), 'inviteLinks/CODE1'), { uses: increment(1) }))
  })

  test('link role is always player', async () => {
    await seed(env, 'inviteLinks/CODE1', link())
    await assertFails(redeem(newbie().firestore(), linkProfile({ role: 'admin' })))
  })

  test('link team must match the profile team', async () => {
    await seed(env, 'inviteLinks/CODE1', link())
    await assertFails(redeem(newbie().firestore(), linkProfile({ teamIds: ['varsity'], primaryTeamId: 'varsity' })))
  })

  test('expired link fails', async () => {
    await seed(env, 'inviteLinks/CODE1', link({ expiresAt: Timestamp.fromMillis(Date.now() - HOUR) }))
    await assertFails(redeem(newbie().firestore()))
    await assertFails(setDoc(doc(newbie().firestore(), 'users/newbie'), linkProfile()))
  })

  test('used-up link fails', async () => {
    await seed(env, 'inviteLinks/CODE1', link({ maxUses: 2, uses: 2 }))
    await assertFails(redeem(newbie().firestore()))
    await assertFails(setDoc(doc(newbie().firestore(), 'users/newbie'), linkProfile()))
  })

  test('unknown or empty code fails', async () => {
    await assertFails(setDoc(doc(newbie().firestore(), 'users/newbie'), linkProfile({ inviteCode: 'NOPE' })))
    await seed(env, 'invitedEmails/newbie@example.com', { email: 'newbie@example.com', teamId: 'jvb', role: 'player' })
    await assertFails(setDoc(doc(newbie().firestore(), 'users/newbie'), linkProfile({ inviteCode: '' })))
  })

  test('coach can still change expiry / cap', async () => {
    await seed(env, 'inviteLinks/CODE1', link())
    await assertSucceeds(updateDoc(doc(as(env, 'coachJ').firestore(), 'inviteLinks/CODE1'), { maxUses: 10 }))
    await assertFails(updateDoc(doc(as(env, 'coachV').firestore(), 'inviteLinks/CODE1'), { maxUses: 10 }))
  })
})

describe('users update + delete (F02)', () => {
  test('coach cannot delete own or others\' user docs', async () => {
    const db = as(env, 'coachV').firestore()
    await assertFails(deleteDoc(doc(db, 'users/p1')))
    await assertFails(deleteDoc(doc(db, 'users/coachV')))
  })

  test('org admin can delete others but not self', async () => {
    const db = as(env, 'org').firestore()
    await assertSucceeds(deleteDoc(doc(db, 'users/p1')))
    await assertFails(deleteDoc(doc(db, 'users/org')))
  })

  test('coach can only update photo fields of a teammate', async () => {
    const db = as(env, 'coachV').firestore()
    await assertSucceeds(updateDoc(doc(db, 'users/p1'), { photoURL: 'https://x/y.jpg', photoPath: 'avatars/coachV/y.jpg' }))
    await assertFails(updateDoc(doc(db, 'users/p1'), { name: 'Renamed' }))
    await assertFails(updateDoc(doc(db, 'users/p1'), { fcmTokens: [] }))
    await assertFails(updateDoc(doc(db, 'users/p1'), { role: 'admin' }))
  })

  test('coach cannot touch the org admin doc or another team\'s player', async () => {
    await assertFails(updateDoc(doc(as(env, 'coachV').firestore(), 'users/org'), { photoURL: 'https://x/y.jpg' }))
    await assertFails(updateDoc(doc(as(env, 'coachJ').firestore(), 'users/p1'), { photoURL: 'https://x/y.jpg' }))
  })

  test('player edits own profile fields only', async () => {
    const db = as(env, 'p1').firestore()
    await assertSucceeds(updateDoc(doc(db, 'users/p1'), { name: 'P One', fcmTokens: ['t'] }))
    await assertFails(updateDoc(doc(db, 'users/p1'), { role: 'orgAdmin' }))
    await assertFails(updateDoc(doc(db, 'users/p1'), { teamIds: ['varsity', 'jvb'] }))
  })
})

describe('invitedEmails read (F05)', () => {
  beforeEach(async () => {
    await seed(env, 'invitedEmails/someone@example.com', { email: 'someone@example.com', teamId: 'varsity', role: 'player' })
    await seed(env, 'invitedEmails/p1@example.com', { email: 'p1@example.com', teamId: 'varsity', role: 'player' })
  })
  test('player cannot read the team roster, but can read their own invite', async () => {
    const db = as(env, 'p1').firestore()
    await assertFails(getDoc(doc(db, 'invitedEmails/someone@example.com')))
    await assertSucceeds(getDoc(doc(db, 'invitedEmails/p1@example.com')))
  })
  test('coach of the team and org admin can read; other team\'s coach cannot', async () => {
    await assertSucceeds(getDoc(doc(as(env, 'coachV').firestore(), 'invitedEmails/someone@example.com')))
    await assertSucceeds(getDoc(doc(as(env, 'org').firestore(), 'invitedEmails/someone@example.com')))
    await assertFails(getDoc(doc(as(env, 'coachJ').firestore(), 'invitedEmails/someone@example.com')))
  })
})

describe('wellness / water / mealLogActivity (F10)', () => {
  test('overwriting another player\'s wellness doc is denied', async () => {
    await seed(env, 'wellnessCheckins/p2_2026-11-20', { uid: 'p2', teamId: 'varsity', date: '2026-11-20', energy: 3 })
    const db = as(env, 'p1').firestore()
    await assertFails(setDoc(doc(db, 'wellnessCheckins/p2_2026-11-20'), { uid: 'p1', teamId: 'varsity', date: '2026-11-20', energy: 1 }))
  })
  test('player creates and updates own wellness doc', async () => {
    const db = as(env, 'p1').firestore()
    const data = { uid: 'p1', teamId: 'varsity', date: '2026-11-20', energy: 4 }
    await assertSucceeds(setDoc(doc(db, 'wellnessCheckins/p1_2026-11-20'), data))
    await assertSucceeds(setDoc(doc(db, 'wellnessCheckins/p1_2026-11-20'), { ...data, energy: 5 }))
    await assertFails(setDoc(doc(db, 'wellnessCheckins/p1_2026-11-21'), { ...data, uid: 'p2' }))
  })
  test('water: own create/update ok, overwrite of another\'s denied, delete denied', async () => {
    await seed(env, 'water/p2_2026-11-20', { uid: 'p2', date: '2026-11-20', glasses: 3 })
    const db = as(env, 'p1').firestore()
    await assertSucceeds(setDoc(doc(db, 'water/p1_2026-11-20'), { uid: 'p1', date: '2026-11-20', glasses: 1 }))
    await assertSucceeds(updateDoc(doc(db, 'water/p1_2026-11-20'), { glasses: 2 }))
    await assertFails(setDoc(doc(db, 'water/p2_2026-11-20'), { uid: 'p1', date: '2026-11-20', glasses: 0 }))
    await assertFails(deleteDoc(doc(db, 'water/p1_2026-11-20')))
  })
  test('mealLogActivity: overwrite of another player\'s marker denied', async () => {
    await seed(env, 'mealLogActivity/p2_2026-11-20', { uid: 'p2', teamId: 'varsity', date: '2026-11-20' })
    const db = as(env, 'p1').firestore()
    await assertFails(setDoc(doc(db, 'mealLogActivity/p2_2026-11-20'), { uid: 'p1', teamId: 'varsity', date: '2026-11-20' }))
    await assertSucceeds(setDoc(doc(db, 'mealLogActivity/p1_2026-11-20'), { uid: 'p1', teamId: 'varsity', date: '2026-11-20' }))
  })
})

describe('documents signatures (F38)', () => {
  const sig = (uid) => ({ uid, name: uid, signedAt: '2026-11-20' })
  beforeEach(async () => {
    await seed(env, 'documents/d1', { teamId: 'varsity', title: 'Waiver', signatures: [sig('p2')] })
  })
  test('member can append only their own signature', async () => {
    const db = as(env, 'p1').firestore()
    await assertFails(updateDoc(doc(db, 'documents/d1'), { signatures: [sig('p2'), sig('p3')] }))
    await assertFails(updateDoc(doc(db, 'documents/d1'), { signatures: [sig('p1')] }))
    await assertFails(updateDoc(doc(db, 'documents/d1'), { signatures: [sig('p2'), sig('p1'), sig('p1')] }))
    await assertSucceeds(updateDoc(doc(db, 'documents/d1'), { signatures: [sig('p2'), sig('p1')] }))
  })
  test('first signature on a doc with no signatures field', async () => {
    await seed(env, 'documents/d2', { teamId: 'varsity', title: 'Medical' })
    await assertSucceeds(updateDoc(doc(as(env, 'p1').firestore(), 'documents/d2'), { signatures: [sig('p1')] }))
  })
  test('coach cannot edit signatures but can edit other fields', async () => {
    const db = as(env, 'coachV').firestore()
    await assertFails(updateDoc(doc(db, 'documents/d1'), { signatures: [] }))
    await assertSucceeds(updateDoc(doc(db, 'documents/d1'), { title: 'Waiver v2' }))
  })
  test('other team cannot sign', async () => {
    await assertFails(updateDoc(doc(as(env, 'coachJ').firestore(), 'documents/d1'), { signatures: [sig('p2'), sig('coachJ')] }))
  })
})

describe('appConfig (F17)', () => {
  test('team coach writes only their own team-scoped docs', async () => {
    const db = as(env, 'coachV').firestore()
    await assertSucceeds(setDoc(doc(db, 'appConfig/lineupLogo_varsity'), { url: 'x' }))
    await assertSucceeds(setDoc(doc(db, 'appConfig/profilePrompt_varsity'), { active: true }))
    await assertFails(setDoc(doc(db, 'appConfig/lineupLogo_jvb'), { url: 'x' }))
    await assertFails(setDoc(doc(db, 'appConfig/lineupLogo'), { url: 'x' }))
    await assertFails(setDoc(doc(db, 'appConfig/somethingElse_varsity'), { url: 'x' }))
  })
  test('org admin writes any id; player cannot write', async () => {
    await assertSucceeds(setDoc(doc(as(env, 'org').firestore(), 'appConfig/lineupLogo'), { url: 'x' }))
    await assertSucceeds(setDoc(doc(as(env, 'org').firestore(), 'appConfig/lineupLogo_jva'), { url: 'x' }))
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'appConfig/lineupLogo_varsity'), { url: 'x' }))
  })
  test('read needs a team-app profile', async () => {
    await seed(env, 'appConfig/lineupLogo', { url: 'x' })
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), 'appConfig/lineupLogo')))
    await assertFails(getDoc(doc(newbie().firestore(), 'appConfig/lineupLogo')))
    await assertFails(getDoc(doc(as(env, 'builder').firestore(), 'appConfig/lineupLogo')))
  })
})

describe('drillLibrary (F27)', () => {
  beforeEach(async () => {
    await seed(env, 'drillLibrary/dr1', { name: 'Rondo', createdByUid: 'coachV' })
  })
  test('non-creator coach cannot delete; creator and org admin can', async () => {
    await assertFails(deleteDoc(doc(as(env, 'coachJ').firestore(), 'drillLibrary/dr1')))
    await assertFails(deleteDoc(doc(as(env, 'builder').firestore(), 'drillLibrary/dr1')))
    await assertSucceeds(deleteDoc(doc(as(env, 'coachV').firestore(), 'drillLibrary/dr1')))
  })
  test('org admin can delete any drill', async () => {
    await assertSucceeds(deleteDoc(doc(as(env, 'org').firestore(), 'drillLibrary/dr1')))
  })
  test('update stays collaborative but cannot change createdByUid', async () => {
    const db = as(env, 'coachJ').firestore()
    await assertSucceeds(updateDoc(doc(db, 'drillLibrary/dr1'), { name: 'Rondo 2' }))
    await assertFails(updateDoc(doc(db, 'drillLibrary/dr1'), { createdByUid: 'coachJ' }))
    await assertFails(updateDoc(doc(as(env, 'p1').firestore(), 'drillLibrary/dr1'), { name: 'x' }))
  })
  test('read stays public', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'drillLibrary/dr1')))
  })
})

describe('shared libraries need a team-app profile', () => {
  const libs = ['videos', 'videoFolders', 'customExercises', 'recipes', 'categories']
  beforeEach(async () => {
    for (const c of libs) await seed(env, `${c}/x`, { name: 'x' })
  })
  test.each(libs)('%s: unreadable for a signed-in user with no profile', async (c) => {
    await assertFails(getDoc(doc(newbie().firestore(), `${c}/x`)))
  })
  test.each(libs)('%s: readable by a player', async (c) => {
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), `${c}/x`)))
  })
})

describe('wellnessNudgeRuns', () => {
  test('clients can neither read nor write', async () => {
    await seed(env, 'wellnessNudgeRuns/2026-11-20', { ranAt: Timestamp.now() })
    await assertFails(getDoc(doc(as(env, 'org').firestore(), 'wellnessNudgeRuns/2026-11-20')))
    await assertFails(setDoc(doc(as(env, 'org').firestore(), 'wellnessNudgeRuns/2026-11-21'), { ranAt: 1 }))
  })
})
