# Fix Plan — Brophy Soccer (TeamHub)

Companion to `docs/APP_WALKTHROUGH.md`. Finding IDs (F01…F87) refer to that document's Master Findings Table.

**Goal:** close every finding that can be fixed in code, with tests, without a product decision. Anything that needs a decision is listed in §7 with a safe default.

**Deploy note:** this repo has no CI deploy. Rules, indexes and functions changes take effect only after someone runs `firebase deploy` (see §8). The frontend deploys on push to `main` (Cloudflare).

---

## Phase 0 — Safety net (do first)

| Step | Findings | Change |
|---|---|---|
| 0.1 | F80 | Add **Firestore and Storage rules tests** (`@firebase/rules-unit-testing` + emulator) under `teamhub/test/rules/`. |
| 0.2 | F80 | Add **unit tests** (Vitest) for pure helpers: dates, `audienceKeysFor`, `readinessFor`, recurrence math in functions. |
| 0.3 | F80 | Make `npm run lint` pass. It currently has 31 errors, including `process` undefined in `vite.config.js`, unused vars and setState-in-effect. |
| 0.4 | F80 | Add GitHub Actions CI: lint, build, unit tests and rules tests on every PR. |

## Phase 1 — Security (🔴 + rules hardening)

| Step | Findings | Change |
|---|---|---|
| 1.1 | **F01** | `users` create rule validates the doc. It may contain only `name,email,role,teamIds,primaryTeamId,initials,inviteCode`, with exactly one valid team and a verified email. The role and team must match either the caller's `invitedEmails/{email}` doc, or a **live** `inviteLinks/{inviteCode}`, in which case the role is `player`. |
| 1.2 | **F02** | `users` delete becomes org admin only, and never your own doc. A coach may update **only** `photoURL/photoPath` on a non-org-admin teammate. |
| 1.3 | F40 | An invite link's `uses` may be bumped only in the same batch that creates the caller's user doc with that `inviteCode` (`getAfter`). `useAuth` writes user + increment as **one batch**. |
| 1.4 | F05 | `invitedEmails` read: own email, org admin, or coach of the team (players no longer read the roster). The client stops subscribing for players. |
| 1.5 | F10 | `wellnessCheckins`, `water`, `mealLogActivity`: an update also requires that the *existing* doc belongs to the caller. |
| 1.6 | F17 | `appConfig` becomes team-scoped (`lineupLogo_{teamId}`, `profilePrompt_{teamId}`, written by that team's coach). Legacy global docs stay readable as a fallback. Global ids are org admin only. |
| 1.7 | F38 (partial) | `documents.signatures`: a member may only **append their own** signature. Coaches can no longer edit signatures. |
| 1.8 | F27 | `drillLibrary` delete: creator or org admin only (update stays collaborative). |
| 1.9 | F39, F79 | Storage: team documents can be written by a coach of that team only. `drills/`, `drillPdfs/`, `exercises/` and `branding/` writes require a coach or drill-builder profile. Reads require an existing profile. |
| 1.10 | F60 | Storage: explicit read rule for DM attachment folders (`coach-dm` and `dm:{playerUid}`). Only the player and that team's coach can read them. |
| 1.11 | — | Shared libraries (`videos`, `videoFolders`, `recipes`, `categories`, `customExercises`, `appConfig`) are read only by accounts with a team profile, not by any signed-in Google account. |
| 1.12 | F70 | Functions: no "send to everyone" fallback when a doc has no `teamId` (fail closed). |
| 1.13 | F87, F69 | Remember this device's FCM token. "Turn off" and sign-out remove **only this device's** token. The toggle reflects whether a token is stored. |

## Phase 2 — One definition of "today" (Arizona time)

| Step | Findings | Change |
|---|---|---|
| 2.1 | F09, F30, F51 | New `src/lib/dates.js`: `TEAM_TZ = "America/Phoenix"`, `teamDateKey()`, `zonedDate(dateStr, timeStr)`. Replace every `toISOString().slice(0,10)` used as "today". |
| 2.2 | F67 | Functions compute the wellness "today" in America/Phoenix. |
| 2.3 | F19 | Event `startAt` is built in team time, not the coach's device timezone. |
| 2.4 | F18 | `importEvents` (CSV + Assign Program) computes `startAt`, so reminders work. |

## Phase 3 — Stop losing data silently

| Step | Findings | Change |
|---|---|---|
| 3.1 | F20, F42, F27, F36 + register | Replace every `.catch(() => {})` on a user action with a toast. Add confirms to destructive deletes: event, video, drill, announcement, invite link, chat message, scheduled item, push notification, saved food. |
| 3.2 | F25, F45 | Practice, program and workout autosave: on failure show a toast and keep the "unsaved" state. `key={id}` on `WorkoutDetail`. |
| 3.3 | F26 | Pass the real org-admin flag to `ProgramDetail` (Shared curriculum toggle). |
| 3.4 | F57 | Group membership changes re-stamp **all** messages in affected channels (queried server-side, not just loaded ones). The same applies to channel edits. |
| 3.5 | F59 | Read receipts are written in chunks of ≤ 450 per batch. |
| 3.6 | F03 | `useAuth` gets try/catch, so the app never hangs on "Loading…". |
| 3.7 | F73, F07 | Live profile subscription (role, team and name changes apply without reload). NameGate no longer reloads the page. |
| 3.8 | F76 | Persistent permission errors on a live list show a toast instead of a silent empty list. Known coach-only queries are no longer opened by players. |
| 3.9 | F49, F13, F29, F21, F35, F43, F74 | Crash and logic fixes: recipe form reset; null guards; drill picker; Team↔Personal edit duplicate; formation-change confirm; announcement edit id; `primaryTeamId` null. |
| 3.10 | F71, F22, F72 | Functions: retry cap with a `failed` status; reminder sync skips no-op edits; scheduled reminders include coaches. |
| 3.11 | F04 | Remove the always-denied legacy team backfill. |
| 3.12 | F11 (key screens) | Loading state for the coach readiness list, nutrition compliance and chat feed. |

## Phase 4 — Scale and cost

| Step | Findings | Change |
|---|---|---|
| 4.1 | F58, F77 | Chat and DMs load the most recent 300 with **"Load older"**. The food log loads the most recent 400. New composite indexes are added. |
| 4.2 | F66 | Scheduler queries only unsent items (`sent==false` / `status=="scheduled"`, with indexes). The wellness pass runs **once per day** (marker doc). |
| 4.3 | F68 | Remove the unused `sendPushNotification` callable. |
| 4.4 | F78 | Lazy-load `html2pdf.js` and `html5-qrcode` (out of the main bundle). |
| 4.5 | F83 | Remove the dead composite indexes. |

## Phase 5 — Correctness polish and cleanup

| Findings | Change |
|---|---|
| F12 | Dashboard counts: unique players, the same denominator everywhere. |
| F14 | Group membership stores uids when the player has signed up. |
| F15 | Water −1 button. |
| F16, F24, F48, F75 | Delete unreachable or unused code (`HomePage` player branch, `EventChip`, unused prop, dead styles). |
| F23 | CSV imports report how many rows were skipped. |
| F31 | The drill print sheet uses the PDF share path (works in iOS in-app browsers). |
| F33 | Delete the old Storage object when an avatar or line-up logo is replaced. |
| F37 | The line-up logo keeps PNG transparency. |
| F41 | Org admin can remove a player who joined by link. |
| F46 | Pin Free Exercise DB to a fixed commit. |
| F52, F53 | Grams/portion scaling for per-100 g foods; the search spinner resets. |
| F54 | Block duplicate video folder names. |
| F55, F56 | YouTube `t=1m30s`; iframe sandbox; create import folders only after a successful import. |
| F61 | Coach can start a DM with a player. |
| F63, F64, F65 | Org-admin posts styled as coach; infer file MIME from the extension; poll option limit unified (4). |
| F06 | Magic-link email confirmation inline (no `window.prompt`). |
| F84 (part) | Delete the stale root `TeamHubRoles.jsx` demo. |
| F85, F86 | README matches reality; the drill-import folder is marked "already run". |

## 7. Needs a decision (not changed, or safe default applied)

| Finding | Question | Default in this plan |
|---|---|---|
| F28 | Should `drillLibrary` be publicly readable without sign-in? | **Unchanged** (the other Drill Library site may rely on it). |
| F34 | May coaches set photos of minors without consent? | Unchanged; documented. |
| F38 | Is a typed-name e-signature enough (waivers, medical)? | Hardened rules only (1.7); no redesign. |
| F62 | Should players see who voted for what? | Unchanged. |
| F50 | USDA key proxy depends on whether production is Cloudflare Pages or a Worker. | Unchanged until hosting is confirmed. |
| F47 | Finish %-of-max (store each athlete's maxes) or remove the toggle? | Unchanged. |
| F81 | Split the 9.8k-line file into per-area modules. | Separate refactor project once tests exist (Phase 0 enables it). |
| F82 | Purge ~100 MB of media from git history. This rewrites history and needs a force-push. | Not done. |
| F84 (part) | `public/drill-bank.json` was public (783 drills downloadable without signing in) and used by nothing, including the Drill Library. | Deleted (drills are signed-in only). |
| F08, F32, F44 | `coachUids`, `scenario/cues` (shared schema with the Drill Library site), bearer document URLs | Documented, unchanged. |

## 8. Rollout checklist (after merge)

1. Back up Firestore to `gs://brophy-soccer-app-backups/firestore-backups/<date>`. That bucket is in us-central1, like the database. The Storage bucket is in us-east1, so Firestore can't export to it. See `DEPLOY_PLAN.md` step 2.
2. Deploy rules **first**: `firebase deploy --only firestore:rules,storage`.
3. Deploy indexes: `firebase deploy --only firestore:indexes`, then wait for "Enabled". New chat and scheduler queries need them.
4. Deploy functions: `firebase deploy --only functions`. Confirm deletion of `sendPushNotification`.
5. Merge to `main` to deploy the frontend.
6. **Audit existing profiles:** in the console, list `users` where `role == "orgAdmin"` and confirm each one is legitimate. F01 may already have been exploited.
7. Smoke test: invite-link sign-up, email-invite sign-up, uninvited Google account (must be refused), wellness after 5 PM, chat send/read, scheduled reminder.

---

## 9. Status (implemented on branch `claude/full-app-walkthrough-audit-ytqu45`)

**Verification:**
- `npm run lint`: 0 problems (it had 31 errors).
- `npm run build`: passes. The main bundle dropped from 2.55 MB to 1.26 MB.
- `npm test` (Vitest): 5/5.
- `functions: npm test`: 11/11.
- `npm run test:rules` (emulators): **58/58**. 35 of these fail against the old rules.
- Headless smoke test of the built app: the sign-in screen loads with no runtime errors.

**Not verified here:** signed-in screens against a real project. There are no test accounts, and the app points at production. Please run the §8 smoke test after deploying.

| Status | Findings |
|---|---|
| ✅ Fixed | F01, F02, F03, F04, F05, F06, F07, F09, F10, F12, F13, F14, F16, F17, F18, F19, F20, F21, F22, F23, F24, F25, F26, F27, F29, F30, F31, F35, F36, F37, F39, F40, F41, F42, F43, F45, F46, F48, F49, F51, F52, F53, F55, F56, F57, F58, F59, F60, F61, F63, F64, F65, F66, F67, F68, F69, F70, F71, F72, F73, F74, F75, F76, F77, F78, F79, F80, F83, F84 (root demo), F85, F86, F87 |
| 🟡 Partial | F11: loading states on the coach readiness list and chat feed only. F38: signatures are append-own only and coaches can't edit them; no audit trail or document hash. F15: undo exists in the Nutrition hero; the Today checklist row is still +1 only. F54: duplicate folder names are blocked; folders are still linked by name. |
| ✅ Decided 2026-11-21 + done | F28 drill library is signed-in only · F62 players see poll totals only (private vote docs + `voteCounts`; run `functions/scripts/migrate-poll-votes.js` once) · F34 players set their own photo only (coach photo upload removed, rules deny) |
| ⏸ Needs decision (unchanged) | F44, F47, F81, F84 (`drill-bank.json`), F08, F32 |
| ⏸ Not done | F33 (Storage orphan cleanup): the Storage rules don't allow deletes on these paths, so cleanup needs a rules change or a scheduled function. |

**Behaviour changes to tell coaches about:**
- Sign-up is now enforced server-side. An account must match a roster email (role and team) or a live invite link.
- Players no longer see the roster's email list.
- Line-up logo and "update your profile" prompts are now per team. Each team's coach sets its own, and the old global logo is used until they do.
- Chat shows the latest 300 messages, with "Load older".
- "Turn off notifications" now affects only the current device. Signing out stops pushes to that device.
- Deleting events, videos, drills, announcements, messages or invite links now asks for confirmation.
- A drill can only be deleted by the coach who created it, or by the program admin.
- Wellness, water and meal days roll over at midnight Arizona time (not 5 PM). The wellness reminder goes out once a day at 8 AM.

## 10. Round 2 (requested 2026-11-21)

- **Instant notifications:** "Send now" is sent by the `onPushNotificationCreated` trigger the moment it's saved. On the emulator it went out in about 1.4 s; before, it waited up to 60 s for the sweep. Chat, DM, announcement and event pushes were already instant.
- **Diagram board:**
  - Neutral (light grey) player token.
  - A **Blank field** preset.
  - Custom grids: 1–8 **columns × rows** sections on the Grid and Blank presets, with snapping to the section lines.
  - **Line** and **Dashed line** tools, with no arrowhead and no number badge.
- **Practice PDF pictures:**
  - The cause: the Storage bucket sends no CORS header (confirmed), so the PDF renderer silently dropped photos.
  - Pictures are now inlined before rendering. The app tries a direct fetch, then the same-origin `/api/img` Worker proxy, and warns about any picture it still can't load.
  - The full fix is turning on bucket CORS (`DEPLOY_PLAN.md` step 6).
- **Text boxes:**
  - Chat, DM and form text areas grow to 5 lines, then scroll.
  - Enter sends on a keyboard. Shift+Enter, or the Enter key on a phone, adds a new line.
  - The chat feed stays pinned to the newest message.
- **Deploying:** see `docs/DEPLOY_PLAN.md`. It is written for an agent to follow step by step.

## 11. Round 3 (requested 2026-11-21)

- **F38, e-signatures redesigned:**
  - Each signature is its own record, `documents/{id}/signatures/{uid}`. It can't be edited once written; only the org admin can delete one.
  - Each record holds: the typed legal name, a drawn signature (PNG), the verified account email, the server time (enforced: `signedAt == request.time`), the exact consent wording and its version, the SHA-256 hash of the signed file, and the device.
  - Once a document is uploaded, its file can't be swapped (`url`, `path` and `sha256` are locked).
  - Coaches see the full log and can download it as CSV. Legacy typed-name signatures still display.
  - 5 new rules tests.
- **F50, the USDA key is out of the browser bundle:**
  - The app calls `/api/usda`. The Worker adds the key from the secret `USDA_API_KEY`, accepts same-site requests only, and caches results for a day.
  - The build also emits `dist/_worker.js`, so this works on Cloudflare Pages too.
  - Rotate the old key, since it was public (deploy plan step 9).
- **F82, repo size:**
  - The 89 MB of intermediate WAVs are removed from the files and gitignored. They can be rebuilt from the MP3s (`videos/walkthrough/README.md`).
  - Purging them from history needs a force-push; it is deploy plan step 11 and needs Batman's explicit go.

## 12. Documents library (requested 2026-11-21)

- **Train → Documents** sits next to Videos.
- Coaches share **files** (PDF, Word, PowerPoint, Excel, images, Pages, Keynote, Numbers, OpenDocument; up to 50 MB, with an upload progress bar) or **links** (Google Drive and so on).
- Items go into folders (pick one or type a new one), with an optional note, a search box, and folder filters.
- Each item is shared with **all teams** or with **one team**. Edit and delete are coach-only.
- With **"Notify players"** on, the `onLibraryItemCreated` function sends a push.
- Under the hood:
  - Data: `libraryItems`; files: Storage `library/{all|team}/{uid}/`.
  - New index: `libraryItems (teamId, createdAt desc)`.
  - 5 new rules tests (68 total).
  - Deep link: `?tab=library`.
- This is separate from Coach Center → Documents, which is for documents players must **sign**.

## 13. Hosting confirmed: Firebase Hosting (2026-11-21)

- The live app is **https://brophy-soccer-app.web.app** on Firebase Hosting, not Cloudflare. After the merge it still served the old pre-audit build, because Hosting only updates on `firebase deploy --only hosting`.
- The `/api/usda` and `/api/img` routes moved from the unused Cloudflare Worker to the **`api` Cloud Function**, reached through the Hosting rewrite `/api/**`. The USDA key is a Secret Manager secret.
  - 3 new unit tests.
  - Emulator check: the rewrite works, cross-site requests get 403, and only this bucket is allowed for images.
- `DEPLOY_PLAN.md` step 9 is rewritten for Firebase Hosting, and the README and rollback steps are updated.

## 14. Food search without public functions (2026-11-21)

- The org policy blocks public Cloud Functions, so the `api` HTTP function couldn't be reached (HTTP 403).
- USDA search now uses a **Firestore trigger** instead:
  1. The app writes `foodSearches/{id}` = `{ uid, q }`.
  2. `onFoodSearch` fetches USDA with the Secret Manager key.
  3. The function writes `{ foods, done }` back, cached for a week in `usdaCache`.
- In the app, Open Food Facts results show right away and USDA results follow.
- The rules allow only the requester to read their own request; clients can never write results. 1 new rules test (69 total).
- On the emulator, the round trip worked and the cache answered in about 1 s.
- The `/api` Hosting rewrite and the image proxy were removed; PDF pictures load directly now that CORS is on.
