// ─── Shared drill document shape ───────────────────────────────────────────
// ONE library for the Brophy TeamHub app and the standalone Drill Library
// site: both apps read and write the `drillLibrary` collection in the
// brophy-soccer-app project. A drill made in either app shows up in both.
//
// Canonical drill doc (all fields optional except `name`):
//   name: string (required, non-empty — enforced by Firestore rules)
//   title?: string — display title; falls back to `name`
//   kind?: "drill" — anything else (e.g. legacy "point" coaching-point
//     items from the old `drills` collection) is NOT a drill and is
//     filtered out of every list
//   cat: string — one of the drill categories (both apps list the same 17
//     built-ins; both add any cat a drill uses to the filter pills, so an
//     unknown cat still renders and filters fine)
//   tags?: string[]
//   dur?: number | string — minutes (the library writes a number, the
//     team app writes a string; both display fine)
//   players?: string
//   equipment?: string — comma-separated (team app); the structured copy
//     lives in setup.equipment
//   setup?: { grid?: string ("30x20 yd"), teams?: string,
//             lengthYd?: number | null, widthYd?: number | null,
//             cones?: number | null, balls?: number | null,
//             goals?: number | null, mannequins?: number | null,
//             equipment?: string[] }
//   howTo?: string — one step per line
//   objectives?: string[]
//   desc?: string
//   info?: string — coaching points; a "Source: ..." prefix is attribution
//   videoUrl?: string
//   photos?: string[] — image URLs (team app uploads)
//   diagram?: string | null — raster PNG of the board (team app upload)
//   diagramData?: object | null — structured board JSON, the editable diagram
//     ({ field, lengthYd, widthYd, tokens, arrows, zones } — see
//     boardData.normalizeBoardState). May carry an optional `animation` field
//     ({ steps: [{ id, tokenId, path, durMs, receiverId? }] }) — a recorded
//     "Play the drill" animation; absent = a static diagram.
//   diagramImage?: string | null — setup still from the Soccer Video Library;
//     WINS over diagramData and diagram when set (photo-first rule)
//   scenario?: string
//   cues?: string[]
//   createdAt?: timestamp, updatedAt?: timestamp
//   createdByUid?: string, createdByName?: string
//
// Keep this comment in sync with the copy in the Drill Library repo
// (brophy-drill-library/src/lib/drillDoc.js). The old `drills` collection
// is dead for reads/writes after the unification; its real drills were
// copied into `drillLibrary` by the library repo's
// work/migrate-drills-to-canonical.js (kind === "point" items skipped).

export const DRILL_KIND = "drill";

// Tolerant read: fill in defaults so a doc written by either app renders
// in the other without crashing on a missing or mistyped field.
export function normalizeDrillDoc(d) {
  const doc = { ...(d || {}) };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === "string" ? v : "");
  const setup = doc.setup && typeof doc.setup === "object" ? doc.setup : {};
  return {
    ...doc,
    name: str(doc.name),
    title: str(doc.title),
    kind: str(doc.kind) || DRILL_KIND,
    cat: str(doc.cat),
    tags: arr(doc.tags),
    dur: doc.dur ?? "",
    players: str(doc.players),
    equipment: str(doc.equipment),
    setup: {
      ...setup,
      grid: str(setup.grid),
      teams: str(setup.teams),
      lengthYd: setup.lengthYd ?? null,
      widthYd: setup.widthYd ?? null,
      cones: setup.cones ?? null,
      balls: setup.balls ?? null,
      goals: setup.goals ?? null,
      mannequins: setup.mannequins ?? null,
      equipment: arr(setup.equipment),
    },
    howTo: str(doc.howTo),
    objectives: arr(doc.objectives),
    desc: str(doc.desc),
    info: str(doc.info),
    videoUrl: str(doc.videoUrl),
    photos: arr(doc.photos),
    diagram: doc.diagram || null,
    diagramData: doc.diagramData || null,
    diagramImage: doc.diagramImage || null,
    scenario: str(doc.scenario),
    cues: arr(doc.cues),
    createdByUid: str(doc.createdByUid),
    createdByName: str(doc.createdByName),
  };
}
