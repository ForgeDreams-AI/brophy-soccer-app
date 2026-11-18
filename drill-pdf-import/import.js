// One-off import for the Brophy session-PDF drills.
//
// Uploads the staged session PDFs to Firebase Storage
// (drillPdfs/<anthonyUid>/<filename>) and each drill's diagram image
// (drills/<anthonyUid>/<filename>), appends each PDF download URL to its
// whole-session drill's `info`, sets each individual drill's `diagram` to
// its diagram download URL, and writes all drill docs from drills.json
// into the shared `drillLibrary` collection (one library for JVB/JVA/Varsity).
//
// KEYLESS + SDK-FREE: talks to the Firestore and Cloud Storage REST APIs
// directly with fetch, using a short-lived access token minted by
// impersonating the throwaway service account
// drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com
// (roles datastore.user + storage.objectAdmin + firebaseauth.viewer).
// The token is minted in Cloud Shell as Logan with:
//   gcloud auth print-access-token --impersonate-service-account=drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com
// and passed here with --token. No service-account key file is created.
// (Why REST, not the Admin SDK: firebase-admin 11's Firestore/Storage
// clients reject a bare getAccessToken-only credential — they demand a
// certificate credential or application default credentials — so the SDK
// cannot run off a raw impersonated token. The REST APIs accept the same
// token as a plain Bearer token, and a service-account token bypasses
// Firestore security rules, exactly like the Admin SDK would.)
//
// Run in Cloud Shell as logan.abele@forgedreams.ai from the run dir that
// holds drills.json, staging-upload-list.json, pdfs/ and diagrams/
// (Node 18+ for global fetch):
//
//   node import.js --token <access-token> [--dry-run] [--force]
//
// --dry-run still runs the duplicate guard (it needs the token) and then
// prints what would happen without uploading or writing anything.
// Without --force, the script aborts if any payload drill name already
// exists in drillLibrary (re-running it must never duplicate drills).
// Anthony's Firebase uid is looked up via the Identity Toolkit REST API
// (falls back to the verified uid from the session-1 dry run, printed
// as a warning if the lookup fails) and stamped as createdByUid on
// every doc and as the Storage path segment.
// Writes import-results.json (drill name -> new doc id) next to drills.json.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = __dirname;
const PROJECT_ID = "brophy-soccer-app";
const BUCKET = "brophy-soccer-app.firebasestorage.app";
const ANTHONY_EMAIL = "anthonyhidalgo365@gmail.com";
const ANTHONY_UID_VERIFIED = "yddRw1GmozXJ6Il3PARvhZoDVaa2"; // resolved by getUserByEmail in the session-1 dry run
const SA_EMAIL = "drill-pdf-import@brophy-soccer-app.iam.gserviceaccount.com";

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const STORAGE_BASE = `https://storage.googleapis.com/storage/v1/b/${BUCKET}`;
const STORAGE_UPLOAD_BASE = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

// --- Firestore REST value conversion ---
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toValue(val)])),
      },
    };
  }
  throw new Error(`Unsupported value type for Firestore: ${typeof v}`);
}
function toFields(doc) {
  return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, toValue(v)]));
}
function fromFields(fields) {
  // Minimal reverse conversion, only for the verification read-back.
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ("stringValue" in v) out[k] = v.stringValue;
    else if ("integerValue" in v) out[k] = Number(v.integerValue);
    else if ("arrayValue" in v) out[k] = (v.arrayValue.values || []).map((x) => x.stringValue ?? null);
    else out[k] = v;
  }
  return out;
}

// Firestore auto-IDs: 20 chars from [A-Za-z0-9].
function genDocId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(20);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function downloadUrl(dest, token) {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}` +
    `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`
  );
}

async function api(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${opts.method || "GET"} ${url} -> HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function main() {
  const accessToken = arg("--token");
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  if (!accessToken) {
    throw new Error(
      "Missing --token <access-token> (mint with gcloud auth print-access-token --impersonate-service-account=" +
        SA_EMAIL +
        ")"
    );
  }

  const drills = JSON.parse(fs.readFileSync(path.join(DIR, "drills.json"), "utf8"));
  const staged = JSON.parse(fs.readFileSync(path.join(DIR, "staging-upload-list.json"), "utf8"));
  console.log(`Loaded ${drills.length} drill docs, ${staged.length} staged PDFs.`);

  // Anthony's uid via Identity Toolkit REST (falls back to the verified uid).
  let anthonyUid = ANTHONY_UID_VERIFIED;
  try {
    const lookup = await api(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
      accessToken,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: [ANTHONY_EMAIL] }) }
    );
    const found = (lookup.users || [])[0];
    if (found && found.localId) {
      anthonyUid = found.localId;
      console.log(`Anthony uid (verified via lookup): ${anthonyUid}`);
    } else {
      console.log(`WARNING: lookup returned no user; using verified uid ${anthonyUid}`);
    }
  } catch (e) {
    console.log(`WARNING: uid lookup failed (${e.message}); using verified uid ${anthonyUid}`);
  }

  // Duplicate guard: list existing drillLibrary docs and compare names.
  const existingDocs = await api(
    `${FIRESTORE_BASE}/documents/drillLibrary?pageSize=300`,
    accessToken
  );
  const existingNames = new Set(
    (existingDocs.documents || []).map((d) => d.fields?.name?.stringValue).filter(Boolean)
  );
  const clashes = [...new Set(drills.map((d) => d.name))].filter((n) => existingNames.has(n));
  if (clashes.length > 0) {
    console.log(`ABORT: ${clashes.length} drill name(s) already in drillLibrary:`);
    for (const n of clashes) console.log(`  - ${n}`);
    if (!force) {
      console.log("Re-run with --force to write anyway (will create duplicates).");
      process.exit(1);
    }
  } else {
    console.log(`Duplicate check: no payload names exist yet (${existingNames.size} docs currently in drillLibrary).`);
  }

  // Upload helper: media upload, then patch the download-token metadata.
  async function uploadFile(localPath, dest, contentType) {
    const token = crypto.randomUUID();
    const url = downloadUrl(dest, token);
    if (dryRun) {
      console.log(`[dry-run] would upload ${path.basename(localPath)} -> ${dest}`);
      return url;
    }
    const bytes = fs.readFileSync(localPath);
    await api(`${STORAGE_UPLOAD_BASE}?uploadType=media&name=${encodeURIComponent(dest)}`, accessToken, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    await api(`${STORAGE_BASE}/o/${encodeURIComponent(dest)}`, accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: token } }),
    });
    console.log(`Uploaded ${path.basename(localPath)}`);
    return url;
  }

  // Upload PDFs, one download token per file.
  const urlByDriveName = {};
  for (const entry of staged) {
    const filename = path.basename(entry.local_file);
    const dest = `drillPdfs/${anthonyUid}/${filename}`;
    urlByDriveName[entry.drive_name] = await uploadFile(
      path.join(DIR, entry.local_file),
      dest,
      "application/pdf"
    );
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

  // Upload diagram images and set each drill's `diagram` to its download URL.
  // diagramFile is a local staging marker only — it must NOT be written to Firestore.
  let diagrams = 0;
  for (const doc of drills) {
    const diagramFile = doc.diagramFile;
    if (!diagramFile) continue;
    const filename = path.basename(diagramFile);
    const dest = `drills/${anthonyUid}/${filename}`;
    doc.diagram = await uploadFile(path.join(DIR, diagramFile), dest, "image/jpeg");
    delete doc.diagramFile;
    diagrams++;
  }
  console.log(`Attached ${diagrams} diagram images.`);

  // Convert timestamp markers + stamp createdByUid.
  for (const doc of drills) {
    for (const [k, v] of Object.entries(doc)) {
      if (v === "__SERVER_TIMESTAMP__") doc[k] = new Date();
    }
    doc.createdByUid = anthonyUid;
    const bad = Object.entries(doc).filter(([, v]) => v === undefined);
    if (bad.length) throw new Error(`Undefined field(s) in "${doc.name}": ${bad.map(([k]) => k).join(", ")}`);
    if (doc.diagramFile !== undefined) throw new Error(`diagramFile marker leaked into "${doc.name}"`);
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${drills.length} docs to drillLibrary. Done.`);
    return;
  }

  // Write in batches of 100 via batchWrite (limit is 500; 127 docs total).
  // Write.update creates the document when it does not exist.
  const results = [];
  for (let i = 0; i < drills.length; i += 100) {
    const chunk = drills.slice(i, i + 100);
    const writes = chunk.map((doc) => {
      const id = genDocId();
      results.push({ name: doc.name, id });
      return {
        update: {
          name: `${FIRESTORE_BASE}/documents/drillLibrary/${id}`,
          fields: toFields(doc),
        },
      };
    });
    await api(`${FIRESTORE_BASE}/documents:batchWrite`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    });
    console.log(`Wrote batch ${i / 100 + 1}: ${chunk.length} docs.`);
  }

  fs.writeFileSync(
    path.join(DIR, "import-results.json"),
    JSON.stringify({ importedAt: new Date().toISOString(), docs: results }, null, 2)
  );
  console.log(`Done. Wrote ${results.length} drill docs. Results in import-results.json.`);

  // Verification: list the collection and check what landed.
  const after = await api(`${FIRESTORE_BASE}/documents/drillLibrary?pageSize=300`, accessToken);
  const allDocs = after.documents || [];
  const mine = allDocs.filter((d) => d.fields?.createdByUid?.stringValue === anthonyUid);
  console.log(`Verification: ${allDocs.length} docs in drillLibrary, ${mine.length} with createdByUid == Anthony.`);
  const sampleWhole = mine.map((d) => fromFields(d.fields)).find((d) => (d.info || "").includes("PDF: https://"));
  const sampleIndiv = mine.map((d) => fromFields(d.fields)).find((d) => (d.diagram || "").startsWith("https://"));
  console.log(`Verification: whole-session drill with PDF link: ${sampleWhole ? `"${sampleWhole.name}"` : "NONE FOUND"}`);
  console.log(`Verification: individual drill with diagram link: ${sampleIndiv ? `"${sampleIndiv.name}"` : "NONE FOUND"}`);
  if (mine.length !== drills.length || !sampleWhole || !sampleIndiv) {
    throw new Error("Verification FAILED — counts or sample links do not match. See above.");
  }
  console.log("Verification PASSED.");
}

if (require.main === module) {
  main().catch((e) => {
    console.error("IMPORT FAILED:", e.message || e);
    process.exit(1);
  });
}

module.exports = { toValue, toFields, downloadUrl, genDocId };
