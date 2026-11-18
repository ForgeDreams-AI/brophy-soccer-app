// One-off import for the Brophy session-PDF drills.
//
// Uploads the staged session PDFs to Firebase Storage
// (drillPdfs/<anthonyUid>/<filename>) and each drill's diagram image
// (drills/<anthonyUid>/<filename>), appends each PDF download URL to its
// whole-session drill's `info`, sets each individual drill's `diagram` to
// its diagram download URL, and writes all drill docs from drills.json
// into the shared `drillLibrary` collection (one library for JVB/JVA/Varsity).
//
// KEYLESS: runs with a short-lived access token minted by impersonating the
// throwaway service account drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com
// (roles datastore.user + storage.objectAdmin + firebaseauth.viewer).
// The token is minted in Cloud Shell as Logan with:
//   gcloud auth print-access-token --impersonate-service-account=drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com
// and passed here with --token. No service-account key file is created.
// Run in Cloud Shell as logan.abele@forgedreams.ai from the run dir that
// holds drills.json, staging-upload-list.json, pdfs/ and diagrams/:
//
//   node import.js --token <access-token> [--dry-run] [--force]
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
const BUCKET = "brophy-soccer-app.firebasestorage.app";
const ANTHONY_EMAIL = "anthonyhidalgo365@gmail.com";
const SA_EMAIL = "drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

function downloadUrl(dest, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}` +
    `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`
  );
}

async function main() {
  const accessToken = arg("--token");
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  if (!accessToken) throw new Error("Missing --token <access-token> (mint with gcloud auth print-access-token --impersonate-service-account=" + SA_EMAIL + ")");

  const drills = JSON.parse(fs.readFileSync(path.join(DIR, "drills.json"), "utf8"));
  const staged = JSON.parse(fs.readFileSync(path.join(DIR, "staging-upload-list.json"), "utf8"));
  console.log(`Loaded ${drills.length} drill docs, ${staged.length} staged PDFs.`);

  // Custom credential: the Admin SDK calls getAccessToken() for every
  // request; the impersonated service-account token bypasses security
  // rules exactly like a service-account key would — without a key file.
  const tokenCredential = {
    getAccessToken: async () => ({ access_token: accessToken, expires_in: 3600 }),
  };
  admin.initializeApp({
    credential: tokenCredential,
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
    const url = downloadUrl(dest, token);
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

  // Upload diagram images, minting one download token per file, and set
  // each drill's `diagram` to its download URL. diagramFile is a local
  // staging marker only — it must NOT be written to Firestore.
  let diagrams = 0;
  for (const doc of drills) {
    const diagramFile = doc.diagramFile;
    if (!diagramFile) continue;
    const localPath = path.join(DIR, diagramFile);
    const filename = path.basename(diagramFile);
    const dest = `drills/${anthonyUid}/${filename}`;
    const token = crypto.randomUUID();
    const url = downloadUrl(dest, token);
    if (dryRun) {
      console.log(`[dry-run] would upload diagram ${diagramFile} -> ${dest} for "${doc.name}"`);
    } else {
      await bucket.upload(localPath, {
        destination: dest,
        metadata: {
          contentType: "image/jpeg",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
    }
    doc.diagram = url;
    delete doc.diagramFile;
    diagrams++;
  }
  console.log(`Attached ${diagrams} diagram images.`);

  // Convert timestamp markers + stamp createdByUid.
  for (const doc of drills) {
    for (const [k, v] of Object.entries(doc)) {
      if (v === "__SERVER_TIMESTAMP__") doc[k] = FieldValue.serverTimestamp();
    }
    doc.createdByUid = anthonyUid;
    // Firestore rejects undefined anywhere — fail loudly instead of writing a bad doc.
    const bad = Object.entries(doc).filter(([, v]) => v === undefined);
    if (bad.length) throw new Error(`Undefined field(s) in "${doc.name}": ${bad.map(([k]) => k).join(", ")}`);
    if (doc.diagramFile !== undefined) throw new Error(`diagramFile marker leaked into "${doc.name}"`);
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${drills.length} docs to drillLibrary. Done.`);
    return;
  }

  // Write in batches of 100 (batch limit is 500; 127 docs total).
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
