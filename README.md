# TeamHub — shared team-app codebase (Phase 1)

Mobile-first team app, rebuilt as a **white-label-ready shared codebase**.
Phoenix College men's soccer runs this code on its own Firebase project,
deployment, and domain (`team.phoenixmenssoccer.com`); future white-label
teams will run the **same** code with their own branding + config.

- **Production URL (Phoenix):** `https://team.phoenixmensoccer.com`
- **Hosting:** Cloudflare Pages (+ Worker for `/api/*`)
- **Backend:** Firebase Auth + Firestore + Cloud Functions + FCM
  (project: `phoenix-mens-soccer` — Phoenix keeps its own project)
- **Stack:** Vite + React 19 + Tailwind v3 + Firebase JS SDK + lucide-react

## White-label model

All team identity lives in **one file**: `src/theme/teams.js`.

- `TEAMS` — one entry per team: name, shortName, colors, assets (logo,
  login background), domain, push title, nutrition targets.
- `ThemeProvider` sets CSS vars (`--th-*`) at runtime, plus
  `document.title` and the `theme-color` meta per team.
- Team resolution order: `VITE_TEAM_ID` env → hostname match
  (custom domain / subdomain) → default team.
- Firebase project config injects via `VITE_FIREBASE_*` env vars
  (`src/firebase.js`); the Phoenix defaults stay in source.

**Onboarding a new team = one `teams.js` entry + env vars. No code changes.**

The `ridgebacks` entry in `teams.js` is a working proof: a second team with
different colors, name, domain, and targets, sharing 100% of the app code.

## Project layout

```
src/
├── app/               shell: TeamHubApp (auth gates, tab router, header,
│                      bottom nav), tabs.js, registry.js (lazy feature pages),
│                      main.jsx
├── theme/             ThemeProvider + teams.js (the ONLY place team
│                      identity lives)
├── auth/              LoginScreen (email-link + Google), NameGate
├── components/
│   ├── ui/            design system: Sheet, ConfirmDialog, Btn, Card,
│   │                  SectionHeader, Avatar, EmptyState, SegmentedControl,
│   │                  Field/Input/TextArea/Select, SearchInput, Badge,
│   │                  StatTile, ProgressRing/Bar, Skeleton, Tabs, Toaster,
│   │                  UpdateBanner, CsvImporter, ReadOnlyHint
│   └── WelcomeTour.jsx
├── data/              COL (collection names — never hard-code a path),
│                      types.js (JSDoc shape contracts), useAuth,
│                      useCollection / useAudienceCollection / useLocalStorage,
│                      groups.js, seeds/
├── lib/               dates (LOCAL-tz today — the v1 UTC bug is fixed),
│                      csv, images (downscale presets), audience
│                      (visibleTo ↔ audienceKeys — the security boundary),
│                      toast, lifting, usda, openfoodfacts, exercises,
│                      exerciseSearch, notifications, appVersion
└── features/          one folder per area; each owns its components,
    ├── home/          its Firestore reads/writes, its Storage uploads.
    ├── train/         Home (coach + player), Train hub (Gym / Nutrition /
    ├── calendar/      Videos), Calendar, Chat, Coach Center (drills,
    ├── chat/          practices, programs, game-day lineups), Settings.
    ├── coach/
    └── settings/

functions/             Cloud Functions: push fan-out (announcements, messages,
                       DMs, assignments), event reminders/delegation,
                       runScheduled sweeper, feedback handler
worker/                Cloudflare Worker: POST /api/food-photo (Gemini proxy —
                       API key stays server-side), SPA fallback
firestore.rules / storage.rules   role-based access, audience-scoped reads
```

**Contract:** `CONTRACT.md` is the law — theme API, UI primitives, data
rules, and 10 hard rules (Lucide only, no `window.confirm/prompt`, no
hard-coded team colors/names, min 11px text, writes through feature hooks,
`audienceKeys` stamped on every `visibleTo` write, no cross-feature imports).

## What's wired

| Tab | Collections | Who writes |
|---|---|---|
| Home — announcements | `announcements` | admin |
| Home — wellness / water | `wellnessCheckins/{uid}_{date}`, `water` | player (own) |
| Home — attendance | `attendance/{date}`, `attendanceReasons` | admin + self check-in |
| Home — documents (e-sign) | `documents` | admin uploads, players sign |
| Home — roster / invites / groups | `users`, `invitedEmails`, `groups` | admin |
| Home — assignments | `assignments` | admin assigns, players complete |
| Train — Gym library | Free Exercise DB + `customExercises` | admin (custom) |
| Train — My / Team workouts | `users/{uid}/workouts`, `teamWorkouts` | player / admin |
| Train — Nutrition recipes/targets | `recipes`, `categories`, `nutritionTargets` | admin |
| Train — food log | `logs/{uid}/entries`, `logs/{uid}/savedFoods` | player (own) |
| Train — food search | USDA (optional key), Open Food Facts, barcode, AI photo (`/api/food-photo`) | n/a |
| Train — Videos & links | `videos` (YouTube/Vimeo/Instagram embed) | admin |
| Schedule | `events`, `users/{uid}/personalEvents` | admin / player (own) |
| Chat | `messages`, `chatGroups`, `dms`, `scheduled` | author (admin can pin/delete) |
| Coach Center — drills/practices/programs | `drills`, `practices`, `programs` | admin |
| Coach Center — game-day lineups | `lineups` | admin |
| Settings / feedback | `users/{uid}`, `feedback` | player (own) / anyone |

## Local dev

```bash
npm install
npm run dev     # → http://localhost:5173
```

Copy `.env.example` to `.env.local` and fill in real values. Restart
`npm run dev` after editing env vars — Vite reads them only at boot.

- `VITE_USDA_API_KEY` — USDA FoodData Central key (free, instant, no card):
  <https://fdc.nal.usda.gov/api-key-signup.html>
- `VITE_FIREBASE_VAPID_KEY` — Firebase console → Project Settings →
  Cloud Messaging → Web configuration → Generate key pair (public key).
- `VITE_TEAM_ID` — serve as a specific team locally (default: `phoenix`).
- `VITE_FIREBASE_*` — only needed for a non-Phoenix deployment.

## Checks

```bash
npm run build   # production build — must pass before any deploy
npx eslint src/ # must be clean (0 errors, 0 warnings)
```

## Make yourself coach (admin)

After your first sign-in: Firebase console → Firestore → `users/<your-uid>` →
change `role` from `"player"` to `"admin"` → reload the app.

## Deploy (Cloudflare Pages)

1. Push to GitHub. From the repo root:
   ```bash
   git add -A && git commit -m "…" && git push
   ```
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
   Build settings: Framework preset **Vite**, build command `npm run build`,
   output directory `dist`, root directory `teamhub`.
   Environment variables (production AND preview): `VITE_USDA_API_KEY`,
   `VITE_FIREBASE_VAPID_KEY` (and `VITE_TEAM_ID` / `VITE_FIREBASE_*` for a
   white-label deployment).
3. Custom domain: Pages project → Custom domains → `team.phoenixmensoccer.com`.
4. Firebase console → Authentication → Settings → Authorized domains → add
   `team.phoenixmensoccer.com` (and `*.pages.dev` preview URLs).

### Ongoing deploys

Just push to `main` — Pages auto-builds and deploys. PR branches get preview
URLs automatically.

## Backend ops runbook

**Firestore / Storage rules** — edit `firestore.rules` / `storage.rules`, then
publish: paste into the Firebase console, or
`firebase deploy --only firestore:rules` / `--only storage`
(needs `firebase-tools` + `firebase login`).

**Storage CORS (game-day lineup photos)** — the lineup export bakes player
photos into the image; the bucket needs CORS once:
```bash
gsutil cors set cors.json gs://phoenix-mens-soccer.firebasestorage.app
```
Without it, lineups still send — players show as initials.

**Cloud Functions** — `functions/` (Node 20, Blaze plan):
`firebase deploy --only functions`.

**Worker env** — `GEMINI_API_KEY` must be set on the Cloudflare Worker
(`wrangler.toml` / dashboard) for AI photo food logging.

## Coach feature notes

- **Strength templates** — in a Team Workout, tap **Template** for ready-made
  sessions (5×5, Upper Hypertrophy, Lower Power, Soccer Off-Season/In-Season)
  with sets/reps, %-of-max, RPE, tempo, supersets.
- **Starter content** — Gym → Library → **Starter lifts** (20 curated lifts);
  Nutrition → Manage → **Add starter recipes** (120 whole-food recipes).
  Both are additive — existing items are skipped.
- **Practice builder** — drills library (photos + tactics-board diagrams),
  practices (debounced autosave, block reorder), programs (multi-day plans,
  "Assign to calendar" asks for a start date in a designed dialog).
- **Game-day lineups** — drag-and-drop pitch, 7 formations, branded image
  export straight to a chat channel.

## What's next (Phase 2+)

- Multi-tenant data model: `teams/{teamId}` + `teamId` on every doc, rules
  rewrite, custom-claim roles — see `../GOAL.md` Phase 2.
- Org admin surface (`orghub/`): team provisioning, Stripe subscriptions
  per team (pricing research feeds this), billing portal.
- White-label hosting: `*.forgedreams.ai` wildcard + custom-domain mapping,
  per-team title/favicon/theme at the edge.
- App Store path: research feeds the wrapper/native decision; the app is
  already mobile-first (safe-area, fixed shell, touch targets).

The original v1 architectural decisions and data model live in
`../TeamHub_Build_Guide.md`; the code/design audit is
`../files/teamhub-code-design-breakdown.md`.
