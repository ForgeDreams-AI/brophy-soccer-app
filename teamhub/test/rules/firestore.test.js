import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import {
  Timestamp, serverTimestamp, deleteDoc, doc, getDoc, increment, setDoc, updateDoc, writeBatch,
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

  test('coach cannot edit a teammate\'s profile, not even the photo (players set their own)', async () => {
    const db = as(env, 'coachV').firestore()
    await assertFails(updateDoc(doc(db, 'users/p1'), { photoURL: 'https://x/y.jpg', photoPath: 'avatars/coachV/y.jpg' }))
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

describe('e-signatures (F38 redesign)', () => {
  const SHA = 'a'.repeat(64)
  const good = (uid, extra = {}) => ({
    uid, typedName: 'Player One', email: `${uid}@example.com`, signedAt: serverTimestamp(),
    sha256: SHA, consentVersion: 'v1', consentText: 'I agree.', drawing: 'data:image/png;base64,AAAA', ...extra,
  })
  beforeEach(async () => {
    await seed(env, 'documents/d1', { teamId: 'varsity', title: 'Waiver', url: 'https://x/w.pdf', path: 'documents/varsity/coachV/w.pdf', sha256: SHA, signatures: [{ uid: 'p2', name: 'legacy' }] })
  })
  test('a member signs once, as themselves, with server time and the file hash', async () => {
    const db = as(env, 'p1').firestore()
    await assertSucceeds(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1')))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { typedName: 'Changed Name' }))) // immutable
  })
  test('rejects forged identity, client time, wrong hash, bad drawing, extra fields', async () => {
    const db = as(env, 'p1').firestore()
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p2'), good('p2', { email: 'p1@example.com' })))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { email: 'someone@example.com' })))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { signedAt: Timestamp.fromDate(new Date('2020-01-01')) })))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { sha256: 'b'.repeat(64) })))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { drawing: 'javascript:alert(1)' })))
    await assertFails(setDoc(doc(db, 'documents/d1/signatures/p1'), good('p1', { approvedByCoach: true })))
  })
  test('other team cannot sign; coach cannot edit or delete a signature; org admin can delete', async () => {
    await assertFails(setDoc(doc(as(env, 'coachJ').firestore(), 'documents/d1/signatures/coachJ'), good('coachJ')))
    await seed(env, 'documents/d1/signatures/p2', { uid: 'p2', typedName: 'Player Two' })
    await assertFails(updateDoc(doc(as(env, 'coachV').firestore(), 'documents/d1/signatures/p2'), { typedName: 'x' }))
    await assertFails(deleteDoc(doc(as(env, 'coachV').firestore(), 'documents/d1/signatures/p2')))
    await assertSucceeds(deleteDoc(doc(as(env, 'org').firestore(), 'documents/d1/signatures/p2')))
  })
  test('signatures are private to the signer and the team coach', async () => {
    await seed(env, 'documents/d1/signatures/p2', { uid: 'p2', typedName: 'Player Two' })
    await assertFails(getDoc(doc(as(env, 'p1').firestore(), 'documents/d1/signatures/p2')))
    await assertSucceeds(getDoc(doc(as(env, 'p2').firestore(), 'documents/d1/signatures/p2')))
    await assertSucceeds(getDoc(doc(as(env, 'coachV').firestore(), 'documents/d1/signatures/p2')))
  })
  test('the signed file is fixed; legacy signatures array is read-only', async () => {
    const coach = as(env, 'coachV').firestore()
    await assertSucceeds(updateDoc(doc(coach, 'documents/d1'), { title: 'Waiver v2' }))
    await assertFails(updateDoc(doc(coach, 'documents/d1'), { url: 'https://x/other.pdf' }))
    await assertFails(updateDoc(doc(coach, 'documents/d1'), { sha256: 'c'.repeat(64) }))
    await assertFails(updateDoc(doc(coach, 'documents/d1'), { signatures: [] }))
    await assertFails(updateDoc(doc(as(env, 'p1').firestore(), 'documents/d1'), { signatures: [{ uid: 'p2', name: 'legacy' }, { uid: 'p1', name: 'p1' }] }))
  })
})

describe('appConfig (F17)', () => {
  test('team coach writes only their own team-scoped docs', async () => {
    const db = as(env, 'coachV').firestore()
    await assertSucceeds(setDoc(doc(db, 'appConfig/lineupLogo_varsity'), { url: 'x' }))
    await assertSucceeds(setDoc(doc(db, 'appConfig/profilePrompt_varsity'), { active: true }))
    await assertSucceeds(setDoc(doc(db, 'appConfig/rosterPositions_varsity'), { byUid: { u1: 'GK' } }))
    await assertFails(setDoc(doc(db, 'appConfig/rosterPositions_jvb'), { byUid: { u1: 'GK' } }))
    await assertFails(setDoc(doc(db, 'appConfig/lineupLogo_jvb'), { url: 'x' }))
    await assertFails(setDoc(doc(db, 'appConfig/lineupLogo'), { url: 'x' }))
    await assertFails(setDoc(doc(db, 'appConfig/somethingElse_varsity'), { url: 'x' }))
  })
  test('org admin writes any id; player cannot write', async () => {
    await assertSucceeds(setDoc(doc(as(env, 'org').firestore(), 'appConfig/lineupLogo'), { url: 'x' }))
    await assertSucceeds(setDoc(doc(as(env, 'org').firestore(), 'appConfig/lineupLogo_jva'), { url: 'x' }))
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'appConfig/lineupLogo_varsity'), { url: 'x' }))
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'appConfig/rosterPositions_varsity'), { byUid: { p1: 'FWD' } }))
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
  test('read is signed-in only (no longer public)', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'drillLibrary/dr1')))
    await assertSucceeds(getDoc(doc(as(env, 'builder').firestore(), 'drillLibrary/dr1')))
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), 'drillLibrary/dr1')))
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

describe('poll votes are private (players see totals only)', () => {
  beforeEach(async () => {
    await seed(env, 'messages/poll1', { kind: 'poll', teamId: 'varsity', channel: 'team', audienceKeys: ['*'], senderUid: 'coachV', question: 'Q', options: ['A', 'B'], voteCounts: [0, 0] })
    await seed(env, 'messages/hidden', { kind: 'poll', teamId: 'varsity', channel: 'g1', audienceKeys: ['uid:p2'], senderUid: 'coachV', question: 'Q', options: ['A', 'B'] })
  })
  test('a player votes as themselves on a valid option only', async () => {
    const db = as(env, 'p1').firestore()
    await assertSucceeds(setDoc(doc(db, 'messages/poll1/votes/p1'), { uid: 'p1', option: 1 }))
    await assertFails(setDoc(doc(db, 'messages/poll1/votes/p2'), { uid: 'p2', option: 1 }))
    await assertFails(setDoc(doc(db, 'messages/poll1/votes/p1'), { uid: 'p1', option: 5 }))
    await assertFails(setDoc(doc(db, 'messages/poll1/votes/p1'), { uid: 'p1', option: 0, extra: true }))
  })
  test('cannot vote on a poll outside your audience', async () => {
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'messages/hidden/votes/p1'), { uid: 'p1', option: 0 }))
    await assertSucceeds(setDoc(doc(as(env, 'p2').firestore(), 'messages/hidden/votes/p2'), { uid: 'p2', option: 0 }))
  })
  test('players cannot see who others voted for; the team coach can', async () => {
    await seed(env, 'messages/poll1/votes/p2', { uid: 'p2', option: 0 })
    await assertFails(getDoc(doc(as(env, 'p1').firestore(), 'messages/poll1/votes/p2')))
    await assertSucceeds(getDoc(doc(as(env, 'p2').firestore(), 'messages/poll1/votes/p2')))
    await assertSucceeds(getDoc(doc(as(env, 'coachV').firestore(), 'messages/poll1/votes/p2')))
    await assertFails(getDoc(doc(as(env, 'coachJ').firestore(), 'messages/poll1/votes/p2')))
  })
  test('players can no longer write votes or vote counts on the message', async () => {
    const db = as(env, 'p1').firestore()
    await assertFails(updateDoc(doc(db, 'messages/poll1'), { 'votes.p1': 0 }))
    await assertFails(updateDoc(doc(db, 'messages/poll1'), { voteCounts: [9, 9] }))
  })
})

describe('shared documents library (libraryItems)', () => {
  const item = (teamId, uid, extra = {}) => ({ teamId, title: 'Playbook', kind: 'file', createdByUid: uid, ...extra })
  test('who can share what', async () => {
    await assertSucceeds(setDoc(doc(as(env, 'coachJ').firestore(), 'libraryItems/a'), item('all', 'coachJ')))
    await assertSucceeds(setDoc(doc(as(env, 'coachV').firestore(), 'libraryItems/b'), item('varsity', 'coachV', { kind: 'link', url: 'https://drive.google.com/x' })))
    await assertFails(setDoc(doc(as(env, 'coachJ').firestore(), 'libraryItems/c'), item('varsity', 'coachJ')))
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'libraryItems/d'), item('all', 'p1')))
    await assertFails(setDoc(doc(as(env, 'coachV').firestore(), 'libraryItems/e'), item('all', 'coachJ')))
  })
  test('who can see what', async () => {
    await seed(env, 'libraryItems/all1', item('all', 'coachJ'))
    await seed(env, 'libraryItems/v1', item('varsity', 'coachV'))
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), 'libraryItems/all1')))
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), 'libraryItems/v1')))
    await assertFails(getDoc(doc(as(env, 'coachJ').firestore(), 'libraryItems/v1')))
    await assertFails(getDoc(doc(as(env, 'builder').firestore(), 'libraryItems/all1')))
  })
  test('edit and delete: scope fixed; team items by that team\'s coach', async () => {
    await seed(env, 'libraryItems/v1', item('varsity', 'coachV'))
    await assertSucceeds(updateDoc(doc(as(env, 'coachV').firestore(), 'libraryItems/v1'), { title: 'Scouting v2', folder: 'Scouting' }))
    await assertFails(updateDoc(doc(as(env, 'coachV').firestore(), 'libraryItems/v1'), { teamId: 'all' }))
    await assertFails(deleteDoc(doc(as(env, 'coachJ').firestore(), 'libraryItems/v1')))
    await assertFails(deleteDoc(doc(as(env, 'p1').firestore(), 'libraryItems/v1')))
    await assertSucceeds(deleteDoc(doc(as(env, 'org').firestore(), 'libraryItems/v1')))
  })
})

describe('USDA food search requests', () => {
  test('a team member asks as themselves; nobody reads others or edits', async () => {
    const db = as(env, 'p1').firestore()
    await assertSucceeds(setDoc(doc(db, 'foodSearches/s1'), { uid: 'p1', q: 'chicken', createdAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'foodSearches/s2'), { uid: 'p2', q: 'chicken' }))
    await assertFails(setDoc(doc(db, 'foodSearches/s3'), { uid: 'p1', q: 'chicken', foods: [], done: true }))
    await assertFails(setDoc(doc(as(env, 'builder').firestore(), 'foodSearches/s4'), { uid: 'builder', q: 'rice' }))
    await seed(env, 'foodSearches/s5', { uid: 'p2', q: 'rice', foods: [], done: true })
    await assertFails(getDoc(doc(db, 'foodSearches/s5')))
    await assertSucceeds(getDoc(doc(as(env, 'p2').firestore(), 'foodSearches/s5')))
    await assertFails(updateDoc(doc(as(env, 'p2').firestore(), 'foodSearches/s5'), { foods: [{ name: 'fake' }] }))
    await assertFails(getDoc(doc(db, 'usdaCache/rice')))
  })
})

describe('game stats (games + gameEvents)', () => {
  test('team coach records; other team coach and players cannot write', async () => {
    const c = as(env, 'coachV').firestore()
    await assertSucceeds(setDoc(doc(c, 'games/g1'), { teamId: 'varsity', opponent: 'Jesuit' }))
    await assertSucceeds(setDoc(doc(c, 'gameEvents/e1'), { teamId: 'varsity', gameId: 'g1', type: 'goal' }))
    await assertFails(setDoc(doc(c, 'gameEvents/e2'), { teamId: 'varsity', type: 'goal' }))
    await assertFails(setDoc(doc(c, 'games/g2'), { teamId: 'jvb', opponent: 'X' }))
    await assertFails(setDoc(doc(as(env, 'p1').firestore(), 'gameEvents/e3'), { teamId: 'varsity', gameId: 'g1', type: 'goal' }))
  })
  test('team members read their team only', async () => {
    await seed(env, 'games/g9', { teamId: 'varsity', opponent: 'Jesuit' })
    await assertSucceeds(getDoc(doc(as(env, 'p1').firestore(), 'games/g9')))
    await assertFails(getDoc(doc(newbie().firestore(), 'games/g9')))
  })
})
