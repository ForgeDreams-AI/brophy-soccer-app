// One-off migration (run ONCE after deploying the new rules + functions):
// moves legacy poll votes out of the public `votes` map on each poll message
// into private messages/{id}/votes/{uid} docs, writes `voteCounts` /
// `voteTotal`, and deletes the map so players can no longer see who voted
// for what. Idempotent — re-running finds nothing left to move.
//
//   cd teamhub/functions
//   GOOGLE_CLOUD_PROJECT=brophy-soccer-app node scripts/migrate-poll-votes.js --dry-run
//   GOOGLE_CLOUD_PROJECT=brophy-soccer-app node scripts/migrate-poll-votes.js
//
// Needs Application Default Credentials with Firestore access
// (`gcloud auth application-default login` as a project owner/editor).

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

const DRY = process.argv.includes("--dry-run");
initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || "brophy-soccer-app" });
const db = getFirestore();

(async () => {
  const polls = await db.collection("messages").where("kind", "==", "poll").get();
  let moved = 0, messages = 0;
  for (const m of polls.docs) {
    const d = m.data();
    const votes = d.votes && typeof d.votes === "object" ? d.votes : {};
    const entries = Object.entries(votes).filter(([, o]) => Number.isInteger(o));
    if (!entries.length && !("votes" in d)) continue;
    const n = Array.isArray(d.options) ? d.options.length : 0;
    const existing = await m.ref.collection("votes").get();
    const have = new Set(existing.docs.map((v) => v.id));
    const counts = Array.from({ length: n }, () => 0);
    existing.forEach((v) => { const o = v.data().option; if (Number.isInteger(o) && o >= 0 && o < n) counts[o] += 1; });
    const batch = db.batch();
    for (const [uid, o] of entries) {
      if (have.has(uid) || o < 0 || o >= n) continue;
      batch.set(m.ref.collection("votes").doc(uid), { uid, option: o, updatedAt: Timestamp.now() });
      counts[o] += 1;
      moved += 1;
    }
    batch.update(m.ref, { votes: FieldValue.delete(), voteCounts: counts, voteTotal: counts.reduce((a, b) => a + b, 0) });
    messages += 1;
    if (!DRY) await batch.commit();
  }
  console.log(`${DRY ? "[dry run] would move" : "Moved"} ${moved} vote(s) across ${messages} poll(s).`);
})().catch((e) => { console.error(e); process.exit(1); });
