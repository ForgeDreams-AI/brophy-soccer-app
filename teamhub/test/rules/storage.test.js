import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { getMetadata, ref, uploadBytes, deleteObject } from 'firebase/storage'
import { setDoc, doc } from 'firebase/firestore'
import { as, makeEnv, seedUsers } from './helpers.js'

let env
beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await env?.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await seedUsers(env)
})

const bytes = new Uint8Array([1, 2, 3])
const put = (ctx, path, contentType = 'image/jpeg') => uploadBytes(ref(ctx.storage(), path), bytes, { contentType })
const head = (ctx, path) => getMetadata(ref(ctx.storage(), path))
async function seedFile(path, contentType = 'image/jpeg') {
  await env.withSecurityRulesDisabled(async (ctx) => { await put(ctx, path, contentType) })
}
const newbie = () => env.authenticatedContext('newbie', { email: 'newbie@example.com', email_verified: true })

describe('team documents (F39)', () => {
  test('player cannot write team documents', async () => {
    await assertFails(put(as(env, 'p1'), 'documents/varsity/p1/waiver.pdf', 'application/pdf'))
  })
  test('coach of the team (and org admin) can write, under their own uid', async () => {
    await assertSucceeds(put(as(env, 'coachV'), 'documents/varsity/coachV/waiver.pdf', 'application/pdf'))
    await assertSucceeds(put(as(env, 'org'), 'documents/jvb/org/waiver.pdf', 'application/pdf'))
    await assertFails(put(as(env, 'coachV'), 'documents/varsity/p1/waiver.pdf', 'application/pdf'))
    await assertFails(put(as(env, 'coachJ'), 'documents/varsity/coachJ/waiver.pdf', 'application/pdf'))
  })
  test('members of the team read; other team cannot', async () => {
    await seedFile('documents/varsity/coachV/waiver.pdf', 'application/pdf')
    await assertSucceeds(head(as(env, 'p1'), 'documents/varsity/coachV/waiver.pdf'))
    await assertFails(head(as(env, 'coachJ'), 'documents/varsity/coachV/waiver.pdf'))
  })
})

describe('DM attachments (F60)', () => {
  test('coach-dm upload: other player denied; owner player and team coach allowed', async () => {
    const path = 'chat/varsity/coach-dm/p1/photo.jpg'
    await seedFile(path)
    await assertFails(head(as(env, 'p2'), path))
    await assertSucceeds(head(as(env, 'p1'), path))
    await assertSucceeds(head(as(env, 'coachV'), path))
    // Org admin is not a DM participant; another team's coach isn't on the team.
    await assertFails(head(as(env, 'org'), path))
    await assertFails(head(as(env, 'coachJ'), path))
  })
  test('dm:{playerUid} upload by the coach: that player + coach allowed, other player denied', async () => {
    const path = 'chat/varsity/dm:p1/coachV/photo.jpg'
    await seedFile(path)
    await assertFails(head(as(env, 'p2'), path))
    await assertSucceeds(head(as(env, 'p1'), path))
    await assertSucceeds(head(as(env, 'coachV'), path))
    await assertFails(head(as(env, 'org'), path))
  })
  test('team channel stays readable by members; group channel by its audience', async () => {
    await seedFile('chat/varsity/team/p2/photo.jpg')
    await assertSucceeds(head(as(env, 'p1'), 'chat/varsity/team/p2/photo.jpg'))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'chatGroups/g1'), { teamId: 'varsity', audienceKeys: ['uid:p2'] })
    })
    await seedFile('chat/varsity/g1/p2/photo.jpg')
    await assertSucceeds(head(as(env, 'p2'), 'chat/varsity/g1/p2/photo.jpg'))
    await assertFails(head(as(env, 'p1'), 'chat/varsity/g1/p2/photo.jpg'))
    await assertSucceeds(head(as(env, 'coachV'), 'chat/varsity/g1/p2/photo.jpg'))
  })
  test('chat writes unchanged: member writes own folder', async () => {
    await assertSucceeds(put(as(env, 'p1'), 'chat/varsity/coach-dm/p1/photo.jpg'))
    await assertFails(put(as(env, 'p1'), 'chat/varsity/coach-dm/p2/photo.jpg'))
  })
})

describe('shared library uploads (F79)', () => {
  test('uninvited signed-in user cannot write drills/', async () => {
    await assertFails(put(newbie(), 'drills/newbie/d.jpg'))
  })
  test('player cannot write drills/ or drillPdfs/; coach and drill builder can', async () => {
    await assertFails(put(as(env, 'p1'), 'drills/p1/d.jpg'))
    await assertFails(put(as(env, 'p1'), 'drillPdfs/p1/d.pdf', 'application/pdf'))
    await assertSucceeds(put(as(env, 'coachV'), 'drills/coachV/d.jpg'))
    await assertSucceeds(put(as(env, 'builder'), 'drills/builder/d.jpg'))
    await assertSucceeds(put(as(env, 'builder'), 'drillPdfs/builder/d.pdf', 'application/pdf'))
  })
  test('exercises/ and branding/ are coach-only (not drill builders)', async () => {
    await assertFails(put(as(env, 'p1'), 'exercises/p1/e.jpg'))
    await assertFails(put(as(env, 'builder'), 'branding/builder/logo.png', 'image/png'))
    await assertSucceeds(put(as(env, 'coachV'), 'exercises/coachV/e.jpg'))
    await assertSucceeds(put(as(env, 'coachV'), 'branding/coachV/logo.png', 'image/png'))
  })
  test('reads need a profile', async () => {
    await seedFile('drills/coachV/d.jpg')
    await seedFile('documents/coachV/legacy.jpg')
    await assertFails(head(newbie(), 'drills/coachV/d.jpg'))
    await assertSucceeds(head(as(env, 'p1'), 'drills/coachV/d.jpg'))
    await assertFails(head(newbie(), 'documents/coachV/legacy.jpg'))
    await assertSucceeds(head(as(env, 'p1'), 'documents/coachV/legacy.jpg'))
  })
})

describe('shared documents library (Train → Documents)', () => {
  test('any coach uploads to all-teams; only that team\'s coach to a team folder; players never', async () => {
    await assertSucceeds(put(as(env, 'coachJ'), 'library/all/coachJ/playbook.pdf', 'application/pdf'))
    await assertSucceeds(put(as(env, 'coachV'), 'library/varsity/coachV/scouting.pdf', 'application/pdf'))
    await assertFails(put(as(env, 'coachJ'), 'library/varsity/coachJ/scouting.pdf', 'application/pdf'))
    await assertFails(put(as(env, 'p1'), 'library/all/p1/x.pdf', 'application/pdf'))
    await assertFails(put(as(env, 'coachV'), 'library/all/coachV/x.exe', 'application/octet-stream'))
  })
  test('team files are readable by that team only; all-teams files by any profile', async () => {
    await seedFile('library/varsity/coachV/scouting.pdf', 'application/pdf')
    await seedFile('library/all/coachV/playbook.pdf', 'application/pdf')
    await assertSucceeds(head(as(env, 'p1'), 'library/varsity/coachV/scouting.pdf'))
    await assertFails(head(as(env, 'coachJ'), 'library/varsity/coachV/scouting.pdf'))
    await assertSucceeds(head(as(env, 'coachJ'), 'library/all/coachV/playbook.pdf'))
    await assertFails(head(newbie(), 'library/all/coachV/playbook.pdf'))
  })
})

describe('cleanup of replaced files (F33)', () => {
  test('owners delete their own avatar / branding / drill files; nobody else can', async () => {
    await seedFile('avatars/p1/old.jpg')
    await seedFile('branding/coachV/old.png', 'image/png')
    await seedFile('drills/coachV/old.jpg')
    await assertFails(deleteObject(ref(as(env, 'p2').storage(), 'avatars/p1/old.jpg')))
    await assertSucceeds(deleteObject(ref(as(env, 'p1').storage(), 'avatars/p1/old.jpg')))
    await assertFails(deleteObject(ref(as(env, 'p1').storage(), 'branding/coachV/old.png')))
    await assertSucceeds(deleteObject(ref(as(env, 'coachV').storage(), 'branding/coachV/old.png')))
    await assertSucceeds(deleteObject(ref(as(env, 'coachV').storage(), 'drills/coachV/old.jpg')))
  })
})
