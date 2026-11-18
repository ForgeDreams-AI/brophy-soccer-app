#!/usr/bin/env python3
"""Dedupe drills.json + build per-PDF screen manifests for diagram workers.

Step 1 (dedupe): individual drills (info does NOT start with 'Source: ') are
grouped by EXACT name; keep the FIRST occurrence in file order, drop later
copies. ALSO drop the two docs named '3v3+2 (Week 5, Session 19)' and
'3v3+2 (Week 9, Session 32, MD+1)' (doubles of Anthony's existing
drillLibrary drill '3v3+2'). Whole-session drills are never touched.

Step 2 (manifest): for each of the 34 staged PDFs, build an ordered screen
list from parse-report.md, matched to drills.json docs by session tags
(from the whole-session doc of that section), and record which screens
survive the dedupe. Written to work/per-pdf-manifest.json and split into
work/diagram-batches/batch-N.json for the diagram workers.

Outputs:
  - drills.json (rewritten in place, deduped)
  - work/drop-list.json (every dropped doc: name, tags, index, reason)
  - work/per-pdf-manifest.json (34 PDFs with ordered screens)
  - work/diagram-batches/batch-1..5.json
"""
import json, re, sys
from collections import Counter

BASE = "/home/hatch/workspace/brophy-soccer-app/drill-pdf-import"

drills = json.load(open(f"{BASE}/drills.json"))
orig = json.load(open("/tmp/orig-drills.json"))  # 150-doc pre-dedupe file (from git a07ed78)
staged = json.load(open(f"{BASE}/staging-upload-list.json"))
report = open(f"{BASE}/parse-report.md").read()

def is_whole(d):
    return (d.get("info") or "").startswith("Source: ")

# ---------- Step 1: dedupe (skipped if already done) ----------
RENAMED_3V3 = ("3v3+2 (Week 5, Session 19)", "3v3+2 (Week 9, Session 32, MD+1)")
ind_names = Counter(d["name"] for d in drills if not is_whole(d))
already = (len(drills) == 127 and not any(v > 1 for v in ind_names.values())
           and not any(d["name"] in RENAMED_3V3 for d in drills))
if already:
    print("drills.json already deduped (127 docs) — skipping rewrite")
    drop = json.load(open(f"{BASE}/work/drop-list.json"))
else:
    seen = set()
    drop = []          # (index, name, tags, reason)
    keep = []
    for i, d in enumerate(drills):
        if is_whole(d):
            keep.append(d)
            continue
        name = d["name"]
        if name in RENAMED_3V3:
            drop.append({"index": i, "name": name, "tags": d.get("tags"),
                         "reason": "double of existing drillLibrary drill '3v3+2' (Anthony, 2026-11-10) — incoming copy dropped"})
            continue
        if name in seen:
            drop.append({"index": i, "name": name, "tags": d.get("tags"),
                         "reason": "duplicate name — later copy dropped, kept first occurrence in drills.json order"})
            continue
        seen.add(name)
        keep.append(d)
    print(f"before: {len(drills)} docs")
    print(f"dropped: {len(drop)} ({sum(1 for r in drop if r['reason'].startswith('duplicate'))} dup extras + "
          f"{sum(1 for r in drop if r['reason'].startswith('double'))} 3v3+2 doubles)")
    print(f"after: {len(keep)} docs "
          f"({sum(1 for d in keep if not is_whole(d))} individual + {sum(1 for d in keep if is_whole(d))} whole-session)")
    names = Counter(d["name"] for d in keep if not is_whole(d))
    dups_left = {k: v for k, v in names.items() if v > 1}
    assert not dups_left, f"duplicates remain: {dups_left}"
    whole_before = [d["name"] for d in drills if is_whole(d)]
    whole_after = [d["name"] for d in keep if is_whole(d)]
    assert whole_before == whole_after, "whole-session docs changed!"
    assert all((d.get("info") or "").startswith("Source: ") for d in keep if is_whole(d))
    json.dump(keep, open(f"{BASE}/drills.json", "w"), indent=1)
    json.dump(drop, open(f"{BASE}/work/drop-list.json", "w"), indent=1)
    print("wrote deduped drills.json + work/drop-list.json")
    drills = keep  # noqa — manifest below uses `orig` for screen matching

# ---------- Step 2: per-PDF manifest ----------
# Parse parse-report.md sections: title, File: `drive-name`, whole-session name, screen bullets.
sections = []
for m in re.finditer(
    r"^## (.+)\n- File: `([^`]+)`\n- Session category.*?\n- Whole-session drill: \"([^\"]+)\"[^\n]*\n((?:  - .+\n)+)",
    report, re.MULTILINE):
    title, drive_file, whole_name, bullets = m.groups()
    screens = []
    for b in re.finditer(r"  - (.+?) — (?:(\d+) min|no minutes shown) — (.+)", bullets):
        screens.append({"name": b.group(1), "dur": b.group(2), "cat": b.group(3)})
    sections.append({"title": title, "drive_file": drive_file, "whole_name": whole_name, "screens": screens})
print(f"parsed {len(sections)} report sections")

by_drive = {s["drive_file"]: s for s in sections}
# staging list -> local file
local_by_drive = {e["drive_name"]: e["local_file"] for e in staged}
assert len(staged) == 34, f"expected 34 staged, got {len(staged)}"
missing = [dn for dn in local_by_drive if dn not in by_drive]
assert not missing, f"staged files with no report section: {missing}"
extra = [dn for dn in by_drive if dn not in local_by_drive]
# the dupe Session 20 " 2.pdf" is in the report? It should NOT be (34 unique parsed).
print(f"report sections without a staged file (expected: dupe only, if any): {extra}")

# Match sections to docs via the whole-session doc's tags, using the ORIGINAL
# 150-doc file so dropped screens are still mapped (they get survives=False).
# Workers key their mappings by drill NAME (unique among surviving individuals),
# never by index, so index shifts from the dedupe cannot mis-assign a diagram.
dropped_idx = {r["index"] for r in drop}
manifest = []
for sec in sections:
    whole = next((d for d in orig if d["name"] == sec["whole_name"]), None)
    assert whole is not None, f"whole-session drill not found: {sec['whole_name']}"
    tags = whole.get("tags")
    # individual docs with these exact tags, in file order = screens in order
    docs = [(i, d) for i, d in enumerate(orig)
            if not is_whole(d) and d.get("tags") == tags]
    assert len(docs) == len(sec["screens"]), (
        f"{sec['title']}: {len(docs)} tagged docs vs {len(sec['screens'])} report screens")
    screens = []
    for n, ((i, d), bullet) in enumerate(zip(docs, sec["screens"]), start=1):
        # The two renamed 3v3+2 docs carry their new names in drills.json
        # while the report still lists the original name "3v3+2".
        name_ok = (d["name"] == bullet["name"]
                   or (d["name"] in RENAMED_3V3 and bullet["name"] == "3v3+2"))
        assert name_ok, (
            f"{sec['title']} screen {n}: drills.json {d['name']!r} != report {bullet['name']!r}")
        survives = i not in dropped_idx
        screens.append({"n": n, "name": d["name"], "tags": tags,
                        "orig_index": i, "survives": survives,
                        "apply_name": d["name"] if survives else None})
    manifest.append({
        "title": sec["title"],
        "drive_file": sec["drive_file"],
        "local_file": local_by_drive[sec["drive_file"]],
        "whole_name": sec["whole_name"],
        "screen_count": len(screens),
        "surviving_screens": sum(1 for s in screens if s["survives"]),
        "screens": screens,
    })

assert len(manifest) == 34, f"expected 34 manifests, got {len(manifest)}"
print(f"built manifest for {len(manifest)} PDFs; "
      f"total screens: {sum(m['screen_count'] for m in manifest)}, "
      f"surviving: {sum(m['surviving_screens'] for m in manifest)}")

json.dump(manifest, open(f"{BASE}/work/per-pdf-manifest.json", "w"), indent=1)

# Split into 5 batches for diagram workers (7,7,7,7,6).
import os
os.makedirs(f"{BASE}/work/diagram-batches", exist_ok=True)
sizes = [7, 7, 7, 7, 6]
pos = 0
for b, size in enumerate(sizes, start=1):
    batch = manifest[pos:pos + size]
    pos += size
    json.dump(batch, open(f"{BASE}/work/diagram-batches/batch-{b}.json", "w"), indent=1)
    print(f"batch-{b}: {len(batch)} PDFs ({batch[0]['local_file'][:40]} ...)")
print("DONE")
