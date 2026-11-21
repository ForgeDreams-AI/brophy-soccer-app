# Drill PDF import — ALREADY RUN (2026-11-18)

This one-off pipeline imported 127 drills from 35 session PDFs into the
production `drillLibrary` collection (see `import-results.json`). It is kept
for reference only.

**Do not re-run `import.js` without reading it first:**
- It writes straight to production (project, bucket and service account are
  hard-coded) and bypasses security rules.
- Its duplicate check reads only the first 300 drills (no pagination), and a
  re-run overwrites the uploaded PDFs/diagrams (old download URLs break).
- `work/dedupe_and_manifest.py` and the ffmpeg lists use absolute paths from
  the original sandbox and won't run as-is.
