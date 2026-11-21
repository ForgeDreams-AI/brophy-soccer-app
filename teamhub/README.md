# TeamHub — Brophy Soccer

Mobile-first team app for Brophy Soccer. Built per `../TeamHub_Build_Guide.md`.

- **Production URL:** `BrophySoccer.forgedreams.ai`
- **Hosting:** **Firebase Hosting** at https://brophy-soccer-app.web.app (deploy: `npm run build && npx firebase-tools@14 deploy --only hosting`). Merging to `main` does NOT redeploy the site. `/api/**` is rewritten to the `api` Cloud Function (food search, PDF picture proxy). The Cloudflare files (`wrangler.toml`, `worker/`) are unused leftovers.
- **Backend:** Firebase Auth + Firestore (project: `brophy-soccer-app`)
- **Stack:** Vite + React + Tailwind v3 + Firebase JS SDK + lucide-react

## What's wired

All six tabs are live-Firestore-backed:

| Tab | Collection(s) | Who writes |
|---|---|---|
| Home — announcements | `announcements` | admin |
| Home — wellness check-ins | `wellnessCheckins/{uid}_{date}` | player (own) |
| Calendar | `events` | admin |
| Videos & Links | `videos` (with YouTube/Vimeo embed) | admin |
| Gym — Library | Free Exercise DB (Unlicense, public) | n/a |
| Gym — My Workouts | `users/{uid}/workouts` | player (own, private) |
| Gym — Team Workouts | `teamWorkouts` | admin |
| Nutrition — recipes/categories | `recipes`, `categories` | admin |
| Nutrition — food log | `logs/{uid}/entries` | player (own, private) |
| Nutrition — USDA food search | external API | n/a |
| Chat | `messages` | author (admin can pin/delete) |

## Local dev

```bash
npm install
npm run dev          # → http://localhost:5173 (talks to the PRODUCTION Firebase project)
npm run lint
npm test             # unit tests (Vitest, src/**/*.test.js)
npm run test:rules   # Firestore + Storage rules tests on the emulators (needs Java 21)
(cd functions && npm test)   # Cloud Functions helper tests
```

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request.

`.env.local` holds your USDA key (see below). Restart `npm run dev` after editing env vars — Vite reads them only at boot.

## Food search (USDA FoodData Central)

The "Log Something Else" form has built-in auto-fill search powered by USDA's free API.

1. Get a key (instant, no card): <https://fdc.nal.usda.gov/api-key-signup.html>
2. Store it as a **Firebase secret**, never in the app bundle: `npx firebase-tools@14 functions:secrets:set USDA_API_KEY`, then deploy the `api` function. The browser calls `/api/usda`, and the function adds the key.
3. Without the secret (or in local `npm run dev`), food search uses Open Food Facts only.

Values are per 100g — adjust calories/protein after autofill if your portion was different.

## Sign-up is invite-only (enforced by the rules)

A profile can only be created from a matching roster invite (`invitedEmails/{email}`) or a live team invite link (`?invite=CODE`). The Firestore rules check every field against the invite, so an uninvited account can't create a profile even with the SDK. Roles and team assignment are changed only by the program admin (Settings → People & Roles).

**Bootstrap the first program admin:** Firebase console → Firestore → create `invitedEmails/<your-email>` with `{ email, role: "orgAdmin", teamId: "varsity" }` → sign in.

## Deploy the website (Firebase Hosting)

```bash
cd teamhub
npm ci && npm run build
npx firebase-tools@14 deploy --only hosting --project brophy-soccer-app
```

- **Live at:** https://brophy-soccer-app.web.app. Merging to `main` does **not** deploy it.
- **Build variable:** `VITE_FIREBASE_VAPID_KEY` (web push) must be set in `.env` on the machine that builds.
- **Custom domain (optional):** Firebase console → Hosting → Add custom domain (for example `BrophySoccer.forgedreams.ai`), then add that domain under Authentication → Settings → Authorized domains.

## Deploying rules, indexes and functions

Nothing below deploys automatically — run it from `teamhub/` after merging. Order matters:

```bash
npx firebase-tools@14 login
npx firebase-tools@14 deploy --only firestore:rules,storage     # 1. rules
npx firebase-tools@14 deploy --only firestore:indexes           # 2. indexes (wait until "Enabled" in the console)
npx firebase-tools@14 deploy --only functions                   # 3. functions (Blaze plan)
```

Always run `npm run test:rules` before deploying rules. Don't paste rules into the console by hand — that's how git and production drift apart.

## Game Day line-up photos (Storage CORS)

The Game Day builder exports a line-up as an image to send to chat. To bake each
player's **profile photo** into that image, the browser has to read the photos
back off the canvas, which requires CORS on the Storage bucket. Apply it once:

```bash
gsutil cors set cors.json gs://brophy-soccer-app.firebasestorage.app
```

Without it, the line-up still sends fine — players just show as their initials
instead of their faces.

## Files at a glance

The app UI still lives in one big component (`TeamHubRoles.jsx`) — open it and
use the **SECTION MAP** comment at the top to jump around. Reusable logic, data
hooks, and seed content have been split into folders so they're easy to find and
reuse:

```
src/
├── TeamHubRoles.jsx   ← the app (LoginScreen + tabs + workouts + nutrition + chat)
├── firebase.js        ← Firebase config (client-side, safe to commit)
├── WelcomeTour.jsx    ← role-aware onboarding walkthrough
├── main.jsx           ← React entry point
├── index.css          ← Tailwind entry
├── hooks/             ← React data hooks
│   ├── useAuth.js         ← Auth hook (auto-creates player profile on first login)
│   └── useCollection.js   ← onSnapshot helpers (incl. audience-scoped reads)
├── lib/               ← pure helpers + integrations
│   ├── lifting.js         ← strength engine: %-of-max, RPE/tempo/supersets,
│   │                        PR detection (Epley), one-tap workout templates
│   ├── usda.js            ← USDA FoodData Central wrapper
│   ├── openfoodfacts.js   ← Open Food Facts + barcode lookup
│   ├── exercises.js       ← Free Exercise DB loader
│   ├── exerciseSearch.js  ← fuzzy, alias-aware exercise search
│   ├── notifications.js   ← push (FCM) wiring
│   └── toast.js           ← lightweight toast
└── data/              ← seed content a coach can load in one tap
    ├── recipeSeed.js      ← 120 whole-food recipes (20 per meal category,
    │                        filed by food-type sub-category)
    └── liftSeed.js        ← 20 coach-ready starter lifts across movement patterns

firestore.rules        ← role-based access (paste into console after edits)
firebase.json          ← Firestore rules deploy config
.firebaserc            ← Firebase project alias
.env.example           ← committed template
.env.local             ← gitignored, holds real keys
```

## Training features (coach)

- **Strength templates** — in a Team Workout, tap **Template** to drop in a
  ready-made session (5×5, Upper Hypertrophy, Lower Power, Soccer Off-Season /
  In-Season). Prescriptions come in with sets/reps, %-of-max, RPE and supersets.
- **Richer prescriptions** — each exercise can be loaded by absolute weight *or*
  as a **% of the athlete's max**, with optional **RPE**, **tempo**, and
  **superset** labels (toggle "Show % max · RPE · tempo · supersets").
- **Starter lifts** — Gym → Library → **Starter lifts** adds 20 curated lifts
  (squat/hinge/single-leg/push/pull/power/core) to your library. Additive — it
  skips any lift you already have.
- **Starter recipes** — Nutrition → Manage Recipes → **Add starter recipes**
  loads 120 whole-food recipes, browsable by meal category and food-type
  sub-category. Additive — it skips recipes you already have.

## Backlog

See `../docs/FIX_PLAN.md` (§7 "Needs a decision") and `../docs/APP_WALKTHROUGH.md`.

## Build guide

The original architectural decisions and data model live in `../TeamHub_Build_Guide.md`.
