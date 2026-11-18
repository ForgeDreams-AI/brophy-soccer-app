// One-off import for the Brophy session-PDF drills.
//
// Uploads the staged session PDFs to Firebase Storage
// (drillPdfs/<anthonyUid>/<filename>), appends each PDF download URL to its
// whole-session drill's `info`, and writes all drill docs from drills.json
// into the shared `drillLibrary` collection (one library for JVB/JVA/Varsity).
//
// Run in Google Cloud Shell as logan.abele@forgedreams.ai with a throwaway
// service-account key (created for this import, deleted right after):
//
//   node import.js --key ~/drill-import-key.json [--dry-run] [--force]
//
// --dry-run prints what would happen without uploading or writing anything.
// Without --force, the script aborts if any payload drill name already
// exists in drillLibrary (re-running it must never duplicate drills).
// Anthony's Firebase uid is looked up by email (anthonyhidalgo365@gmail.com)
// and stamped as createdByUid on every doc and as the Storage path segment.
// Writes import-results.json (drill name -> new doc id) next to drills.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const admin = require("firebase-admin");

const DIR = __dirname;
const PROJECT_ID = "brophy-soccer-app";
const BUCKET = "brophy-soccer-app.firebasestorage.app";
const ANTHONY_EMAIL = "anthonyhidalgo365@gmail.com";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

async function main() {
  const keyPath = arg("--key");
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  if (!keyPath) throw new Error("Missing --key <service-account-key.json>");

  const drills = JSON.parse(fs.readFileSync(path.join(DIR, "drills.json"), "utf8"));
  const staged = JSON.parse(fs.readFileSync(path.join(DIR, "staging-upload-list.json"), "utf8"));
  console.log(`Loaded ${drills.length} drill docs, ${staged.length} staged PDFs.`);

  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(keyPath))),
    storageBucket: BUCKET,
  });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const FieldValue = admin.firestore.FieldValue;

  // Anthony's uid: createdByUid on every doc + Storage path segment.
  const anthony = await admin.auth().getUserByEmail(ANTHONY_EMAIL);
  const anthonyUid = anthony.uid;
  console.log(`Anthony uid: ${anthonyUid}`);

  // Duplicate guard: abort if any payload name already exists in drillLibrary.
  const names = [...new Set(drills.map((d) => d.name))];
  const existing = new Set();
  for (let i = 0; i < names.length; i += 30) {
    const snap = await db
      .collection("drillLibrary")
      .where("name", "in", names.slice(i, i + 30))
      .get();
    snap.forEach((doc) => existing.add(doc.data().name));
  }
  if (existing.size > 0) {
    console.log(`ABORT: ${existing.size} drill name(s) already in drillLibrary:`);
    for (const n of existing) console.log(`  - ${n}`);
    if (!force) {
      console.log("Re-run with --force to write anyway (will create duplicates).");
      process.exit(1);
    }
  } else {
    console.log("Duplicate check: no payload names exist yet.");
  }

  // Upload PDFs, minting one download token per file.
  const urlByDriveName = {};
  for (const entry of staged) {
    const localPath = path.join(DIR, entry.local_file);
    const filename = path.basename(entry.local_file);
    const dest = `drillPdfs/${anthonyUid}/${filename}`;
    const token = crypto.randomUUID();
    const url =
      `https://firebasestorage.googleapis.com/v0/b/${BUCKET}` +
      `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
    if (dryRun) {
      console.log(`[dry-run] would upload ${entry.local_file} -> ${dest}`);
    } else {
      await bucket.upload(localPath, {
        destination: dest,
        metadata: {
          contentType: "application/pdf",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      console.log(`Uploaded ${filename}`);
    }
    urlByDriveName[entry.drive_name] = url;
  }

  // Patch whole-session drills: append "PDF: <url>" to `info`, matched by
  // the "Source: <Drive filename>" line. Abort before writing if any is unmatched.
  let patched = 0;
  for (const doc of drills) {
    const info = doc.info || "";
    if (!info.startsWith("Source: ")) continue;
    const sourceName = info.slice("Source: ".length).split("\n")[0].trim();
    const url = urlByDriveName[sourceName];
    if (!url) throw new Error(`No staged PDF matches Source: ${sourceName}`);
    doc.info = `${info}\nPDF: ${url}`;
    patched++;
  }
  console.log(`Patched ${patched} whole-session drills with PDF links.`);

  // Convert timestamp markers + stamp createdByUid.
  for (const doc of drills) {
    for (const [k, v] of Object.entries(doc)) {
      if (v === "__SERVER_TIMESTAMP__") doc[k] = FieldValue.serverTimestamp();
    }
    doc.createdByUid = anthonyUid;
    // Firestore rejects undefined anywhere — fail loudly instead of writing a bad doc.
    const bad = Object.entries(doc).filter(([, v]) => v === undefined);
    if (bad.length) throw new Error(`Undefined field(s) in "${doc.name}": ${bad.map(([k]) => k).join(", ")}`);
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${drills.length} docs to drillLibrary. Done.`);
    return;
  }

  // Write in batches of 100 (batch limit is 500; 150 docs total).
  const results = [];
  for (let i = 0; i < drills.length; i += 100) {
    const batch = db.batch();
    const chunk = drills.slice(i, i + 100);
    const refs = chunk.map((doc) => {
      const ref = db.collection("drillLibrary").doc();
      batch.set(ref, doc);
      return { name: doc.name, id: ref.id };
    });
    await batch.commit();
    results.push(...refs);
    console.log(`Wrote batch ${i / 100 + 1}: ${chunk.length} docs.`);
  }

  fs.writeFileSync(
    path.join(DIR, "import-results.json"),
    JSON.stringify({ importedAt: new Date().toISOString(), docs: results }, null, 2)
  );
  console.log(`Done. Wrote ${results.length} drill docs. Results in import-results.json.`);
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e.message || e);
  process.exit(1);
});
