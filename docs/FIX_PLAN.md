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
| F84 (part) | `public/drill-bank.json` may be fetched by the Drill Library site. | Kept. |
| F08, F32, F44 | `coachUids`, `scenario/cues` (shared schema with the Drill Library site), bearer document URLs | Documented, unchanged. |

## 8. Rollout checklist (after merge)

1. Back up Firestore (console export).
2. Deploy rules **first**: `firebase deploy --only firestore:rules,storage`.
3. Deploy indexes: `firebase deploy --only firestore:indexes`, then wait for "Enabled". New chat and scheduler queries need them.
4. Deploy functions: `firebase deploy --only functions`. Confirm deletion of `sendPushNotification`.
5. Merge to `main` to deploy the frontend.
6. **Audit existing profiles:** in the console, list `users` where `role == "orgAdmin"` and confirm each one is legitimate. F01 may already have been exploited.
7. Smoke test: invite-link sign-up, email-invite sign-up, uninvited Google account (must be refused), wellness after 5 PM, chat send/read, scheduled reminder.
