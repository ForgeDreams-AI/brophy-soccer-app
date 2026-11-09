# Brophy Soccer App (TeamHub) — Codebase Breakdown

> Read-only analysis of `~/workspace/brophy-soccer-app/` — a fresh clone of the
> Phoenix College TeamHub app (Vite + React + Firebase, Cloudflare Pages).
> Written 2026-11-08. No code was modified.
>
> **One-line summary:** a complete single-team soccer app (roster, schedule,
> training, nutrition, chat, coach tools, push notifications) built as one
> 8,413-line React file with **no concept of multiple teams anywhere** — every
> collection, rule, and screen assumes exactly one team. Making it Brophy
> (JVB + JVA + Varsity under one account) is mostly a data-model + branding
> job, not a feature job.

---

## 0. Overview — what the app is

TeamHub is a mobile-first team app for a soccer program. Players sign in with
Google (or an email link), see today's schedule, check in, log food and
workouts, watch film/drills, and chat with the team. Coaches (role `admin`)
run everything from the same app: roster/invites, announcements, calendar,
practice plans, drill library, game-day lineups, attendance, documents, and
nutrition targets. Data lives in Firebase (Auth, Firestore, Storage, FCM
push); the frontend is a Vite + React 19 + Tailwind SPA served by a
Cloudflare Worker (which also proxies a Gemini AI food-photo endpoint).
Deploy target is Cloudflare Pages.

- **Stack:** Vite 8, React 19, Tailwind 3, Firebase 12, lucide-react.
- **Size:** `teamhub/src/TeamHubRoles.jsx` is **8,413 lines** — the entire app
  (all screens, all logic) in one file. Supporting files are small libs,
  hooks, seeds, and components.
- **Build:** `npm run build` passes clean (verified 2026-11-08, 2.36s).
- **Live Phoenix deployment:** `team.phoenixmensoccer.com`, Firebase project
  `phoenix-mens-soccer`, Cloudflare Pages + Worker.

### Needs fixing for Brophy
- None at this level — the overview holds. The work is in the sections below.

---

## 1. Auth & Roles

**How it works**

- Sign-in: Google popup (`signInWithPopup` + `GoogleAuthProvider`) or email
  sign-in link (`signInWithEmailLink`). Login screen is `LoginScreen`
  (`TeamHubRoles.jsx:378`).
- **Invite gate:** on first sign-in, `useAuth.js` checks
  `invitedEmails/{lowercased-email}`. If the email is not on the roster, the
  user is signed straight back out with *"isn't on the team roster. Ask your
  coach to add your email."* Coaches add emails (single + CSV batch) from the
  Home page.
- **Roles — only two:** `admin` (coach) and `player` (default). Role is a
  plain string field on the `users/{uid}` doc, set from the invite at first
  sign-in. There is no separate "assistant coach", "head coach", or "org
  admin" role. `isAdmin = user.role === "admin"` is checked inline in
  dozens of places.
- **Permissions:** enforced in two layers — (a) Firestore rules (see §12),
  (b) UI gating (coach-only tabs and buttons hidden for players). Role
  changes are admin-only, and a coach cannot change their own role from the
  roster UI.
- **Profile:** name, initials, photo (Storage `avatars/`). Player subtitle is
  hard-coded: `sub: role === "admin" ? "Head Coach" : "Player · Varsity"`
  (`src/hooks/useAuth.js:63`).
- **Sessions:** Firebase Auth persistence; Firestore offline cache
  (`persistentLocalCache`, multi-tab) in `src/firebase.js`.

### Needs fixing for Brophy
- **Per-team coaches:** one `admin` role currently = coach of the (only)
  team. Brophy needs a coach per team (JVB, JVA, Varsity) who admins only
  their team, plus an org-level admin (e.g. Marc Kelly) who sees all three.
  Decide: new roles (`coach:{teamId}` / `orgAdmin`) or a `teams[]` + `role`
  model on the user doc.
- **"Player · Varsity" subtitle** (`useAuth.js:63`) must become per-team
  (JVB / JVA / Varsity) based on the player's assigned team.
- **Invite flow is single-roster:** invites must carry a `teamId` so a new
  player lands on the right team. Same for the batch CSV import.
- **Firebase project swap:** `src/firebase.js` is hard-coded to
  `phoenix-mens-soccer` (apiKey, authDomain, projectId, storageBucket,
  messagingSenderId, appId). Replace with the Brophy project config once the
  Firebase project (being created on `logan.abele@forgedreams.ai`) is ready.
  Enable Google + email-link sign-in in the new project's Auth console.

---

## 2. Teams & Rosters

**How it works**

- **There is no `teams` collection and no `teamId` field anywhere in the
  code** (grep for `teamId` returns nothing). The app assumes one team.
- **Roster = `invitedEmails` + `users`.** `invitedEmails/{email}` docs hold
  `{ role, ... }` (coach or player). `users/{uid}` docs hold profile + role.
  The Home page (coach view) lists the roster, lets coaches add/remove
  invites, batch-import, and flip roles.
- **Groups:** coaches can create named sub-groups (`groups` collection,
  e.g. "Starters", "Defenders") used to target events, nutrition targets,
  and chat channels. Groups are the only sub-team slicing that exists.
- **Attendance:** daily `attendance/{date}` doc with a `statuses` map
  (email → present/absent); players self-check-in (own email only); coaches
  mark anyone. `attendanceReasons/{date}__{uid}` holds absence reasons.
- **No roster cap found:** no `MAX_PLAYERS` / limit constant anywhere.
  Invites are one doc per email; roster lists render in full. (At very
  large sizes the roster list may want pagination, but nothing enforces a
  limit today.)

### Needs fixing for Brophy
- **Add a `teams` collection** (`teams/{teamId}`: name, short name, level,
  branding, coach UIDs) with `jvb`, `jva`, `varsity`.
- **Add `teamId` to `users`, `invitedEmails`, `events`, `announcements`,
  `messages`, `chatGroups`, `groups`, `practices`, `programs`, `lineups`,
  `teamWorkouts`, `nutritionTargets`, `documents`, `assignments`, and every
  other team-scoped doc** (see §12 for the full list), and scope every
  query + rule by it.
- **Team switcher UI:** coaches (and org admin) need to pick which team
  they're viewing; players see only their own team. Decide whether a player
  can belong to more than one team (e.g. a JVA player called up to Varsity).
- **Unlimited players/coaches:** already effectively unlimited — keep it
  that way; verify the roster/invite UI stays usable at Brophy roster sizes
  (each team can be 25–30+ players, 3 teams + staff).
- **Group model:** keep groups, but scope them per team (a "Starters" group
  in JVB is not the Varsity one).

---

## 3. Home / Announcements

**How it works**

- **Two different Home screens by role.** Coach sees `HomePage`
  (`TeamHubRoles.jsx:1175`): announcements (create/edit/pin/delete),
  today's practice, attendance marking, roster/invite management, documents,
  assignments, meal-log activity, groups. Player sees `PlayerTodayPage`
  (`:989`): today's events, pinned announcements, check-in button, wellness
  check-in, water tracker, documents awaiting signature, today's assignments,
  nutrition totals vs target.
- **Announcements** (`announcements` collection): title, body, pinned,
  timestamp. Coach-only write; everyone reads. Pinned ones stick to the top.
- **Quote of the Day:** `QuoteOfDay.jsx` component + `quotes` collection;
  coach can add quotes.
- **Wellness check-in:** players submit a daily wellness form
  (`wellnessCheckins`); coach reads the whole team.
- **Documents:** coaches upload files (PDF/Office/images, Storage
  `documents/`, max 50 MB); players sign them (a `signatures` map on the
  doc). Used for handbooks, waivers, etc.
- **Assignments:** coach creates tasks (often linking a team workout);
  players mark themselves done (`completedBy` map).

### Needs fixing for Brophy
- **Scope everything by team:** announcements, attendance, documents,
  assignments, wellness, and meal-log activity must all be per-team, with
  the coach only seeing their team's data and the org admin seeing all three.
- **Seed/demo content:** the file ships with sample announcements
  ("Practice Moved to 5:00 PM", "Team Photo Day") and sample events
  (see §4) — strip or replace with Brophy content before first use.
- **Documents:** fine as-is once team-scoped; confirm what Brophy needs
  signed (if anything) vs. what can be dropped.

---

## 4. Calendar & Events

**How it works**

- `CalendarPage` (`TeamHubRoles.jsx:2108`): month view of `events`
  (Practice / Game / Strength / other) with detail modal, plus players'
  **personal events** (`users/{uid}/personalEvents`, private).
- **Event fields:** title, date, start/end, location, type, `runByUid`,
  linked `practiceId` / `workoutId`, coach notes, reminders. Events carry
  an `audienceKeys` array (everyone / a group / specific people) — players
  only read events addressed to them.
- **Reminders:** per-event reminder channels (team channel or a chat
  group); the Cloud Function `onEventReminderSync` keeps them in sync.
- **Groups modal:** create/edit/delete groups from the calendar; CSV
  import of events is supported (`importEvents`).
- **Event delegation:** `onEventDelegated` function (a coach can hand an
  event to another coach).

### Needs fixing for Brophy
- **Team-scoped events:** every event needs a `teamId`; the calendar must
  filter to the active team (and the org admin needs an all-teams view).
- **Audience model:** `audienceKeys` currently keys on uid/email — keep,
  but make sure a JVB event can never leak to a Varsity player.
- **Import:** the CSV event import is handy for loading Brophy's season
  schedules — keep, but add a team column.
- **Strip Phoenix sample events** (e.g. "Game vs. Central State",
  "Memorial Stadium", `2026-08-15 … vs ACU, Phoenix College`).

---

## 5. Videos & Drills

**How it works**

- **Videos** (`VideosPage`, `:2572`): `videos` collection — YouTube-linked
  items with category (Film / Breathing / Stretching / Mobility / Strength /
  Cooldown), type (video / audio / external), duration, difficulty,
  description. Coach-only add/edit/delete; CSV import supported.
- **Drill library** (`DrillsPage`, `:3051`): `drills` collection — the
  deepest content in the app. Each drill has: name, kind
  (drill vs. coaching point), one of **15 tactical categories** ("Playing
  from back", "Transitions to the middle third", …, "Set pieces" —
  `DRILL_CATS`, `:291`, described in-code as *"Anthony's 15 tactical topics
  (Phoenix College system)"*), tags, duration, players, equipment, setup
  grid, setup teams, how-to, objectives, description, video URL, photos,
  **diagram** (with a Bears-logo watermark, see §11), scenario, and cues.
- **Coaching Points** (`CoachingPointsPage`, `:3357`): same `drills`
  collection, `kind: "point"` — short teaching points rather than full drills.
- **Drill bank:** `public/drill-bank.json` (20,351 lines) is a large
  pre-built drill dataset.
- **Drill picker:** `DrillPicker` lets a coach pull drills into a practice
  plan.

### Needs fixing for Brophy
- **Drill categories are Phoenix College's system** — decide with Marc
  Kelly whether Brophy uses the same 15 topics, a subset, or Brophy's own
  categories. This is a coaching decision, not just a rename.
- **Seed videos are Phoenix-specific** ("Central State — Scouting
  Breakdown", etc.) — replace with Brophy film or clear them.
- **Bears watermark on every drill diagram** (`:2887–:2902`, `:3477`) —
  swap to the Brophy logo (see §11).
- **Team-scope drills/videos:** decide whether the drill library is shared
  across all three Brophy teams (likely yes — one library) or per-team.
  The `drills`/`videos` collections currently have no team field either way.

---

## 6. Gym & Training (Train tab)

**How it works**

- **Train hub** (`TrainHub`, `:1154`): three sub-pages — Gym, Nutrition,
  Videos. (Players reach them from the Train tab; the coach's Coach tab
  also links in.)
- **Gym** (`GymPage`, `:6995`): **my workouts** (private,
  `users/{uid}/workouts`) and **team workouts** (`teamWorkouts`, coach
  publishes). Workout builder with sets/reps, exercise picker, and a
  built-in **exercise library** (`ExerciseLibrary`, `:6476`) seeded from
  `src/data/liftSeed.js` (234 lines) plus coach-created **custom exercises**
  (`customExercises` collection, with photos in Storage `exercises/`).
- **Programs** (`ProgramsView`, `:3813`): an ordered sequence of days, each
  pointing at a practice; assignable to the team. **Practices**
  (`PracticesView`, `:3637`): a session built from drills via the picker,
  with phases (Warmup, Team game, Small rondo, …, Finishing pattern —
  `DRILL_PHASES`).
- **Lifting lib** (`src/lib/lifting.js`, `src/lib/exercises.js`,
  `src/lib/exerciseSearch.js`): exercise data, search, and 1RM / load
  helpers.

### Needs fixing for Brophy
- **Team-scope team workouts and programs:** a Varsity lifting program
  must not show up for JVB players. My-workouts are already private (fine).
- **Seed lifts/workouts** (`liftSeed.js`, `workoutSeed.js`) are generic
  enough to keep, but review for college-level loads vs. high-school
  appropriateness with the Brophy coaches.
- **Shared vs. per-team exercise library:** custom exercises are currently
  global — decide if all three teams share one library (probably yes).

---

## 7. Nutrition & Food Logging

**How it works**

- `NutritionPage` (`TeamHubRoles.jsx:4607`): recipes, food logging, water,
  targets.
- **Recipes** (`recipes` collection + `recipeSeed.js`, 181 lines): name,
  category (Breakfast/Lunch/Dinner/Snacks), calories, protein/carbs/fat,
  prep time. Coach adds/edits; CSV import supported.
- **Food log** (`logs/{uid}/entries`, private per player): search via
  **USDA FoodData Central API** (`src/lib/usda.js`, needs
  `VITE_USDA_API_KEY`) and **Open Food Facts** (`src/lib/openfoodfacts.js`);
  **barcode scanner** (`BarcodeScannerModal`, `:5236`); saved/favorite
  foods (`logs/{uid}/savedFoods`) for one-tap re-logging.
- **Food photo AI:** photo → Cloudflare Worker → **Gemini 2.0 Flash**
  returns structured nutrition (see §13).
- **Water:** `water/{uid-date}` docs, cup counter on the Today page.
- **Nutrition targets** (`nutritionTargets`): coach sets daily kcal/protein
  goals per group or player; player sees totals vs. target. **Meal-log
  activity** (`mealLogActivity/{uid-date}`): a privacy-preserving "did they
  log today" marker so the coach sees compliance without reading what the
  player ate.

### Needs fixing for Brophy
- **Targets per team:** nutrition targets must be set per team (a Varsity
  target is not a JVB target). Scope `nutritionTargets` by `teamId`.
- **USDA API key:** the repo's `.env.example` already has a placeholder
  `VITE_USDA_API_KEY` — get a fresh free key for Brophy (or reuse the
  existing one if it is Anthony's).
- **Recipes:** seed recipes are generic — keep or replace with Brophy's
  preferred meals; categories are coach-editable (`categories` collection).
- **Gemini food-photo:** needs the Worker's `GEMINI_API_KEY` secret set in
  the new Cloudflare deployment (see §13).

---

## 8. Chat & Messaging

**How it works**

- `MessagesPage` (`TeamHubRoles.jsx:5787`): the full chat system.
- **Team channel** (everyone) + **custom channels** (`chatGroups`
  collection): coach creates channels, sets visibility by group / specific
  players; visibility is enforced server-side via `audienceKeys` on the
  channel and copied onto each message at post time.
- **DMs with the coach** (`dms` collection): a player reads/writes only
  their own thread (`threadId == uid`); coach reads/writes any thread.
- **Features:** polls (vote, see voters), emoji reactions, message pins,
  read receipts (`readBy`), image attachments (Storage `chat/`, max 10 MB),
  linkify, date dividers, **scheduled messages** (`scheduled` collection —
  coach composes now, a Cloud Function sends at `sendAt`).
- **Push fan-out:** every new message/DM triggers an FCM push to the
  channel's audience (see §13).

### Needs fixing for Brophy
- **The big one — team isolation:** chat is the highest-risk area for
  cross-team leaks. Every channel, message, and DM must carry a `teamId`,
  and the rules must enforce that a JVB player can never read/post in a
  Varsity channel. The existing `audienceKeys` machinery is a good base —
  extend it with `teamId`, don't replace it.
- **DMs:** currently "DMs with the coach" (singular coach). Brophy needs
  DMs with *your team's* coach — scope by team, and decide whether players
  can DM the org admin.
- **Scheduled messages:** scope by team as well.

---

## 9. Coach Tools (Coach Center)

**How it works**

- The **Coach tab** (admin only, `practice` tab id, label "Coach") opens
  `CoachCenterPage` (`:4474`), a hub over:
  - **PracticePage** (`:3913`): home (today's session + banners), **Drills**
    library, **Practices** (session builder), **Programs** (multi-day plans).
  - **GameDayPage** (`:4259`): build game-day **lineups**
    (`lineups` collection) — formation builder with draggable slots, player
    picker from the roster, photo upload per player, and **SendLineupSheet**
    (`:4181`), which renders the lineup as a shareable image with the team
    logo watermark and can post it to a chat channel.
  - **CoachingPointsPage** (`:3357`): short teaching points library.
- Coaches also do roster/invite management, announcements, calendar, and
  documents from the Home tab (see §3).

### Needs fixing for Brophy
- **Everything here is per-team:** drills, practices, programs, lineups,
  and coaching points all need `teamId` and a team picker. A JVB coach
  building a lineup must only see JVB players in the picker.
- **Lineup sheet branding:** the logo watermark and any "Phoenix"/"Bears"
  text on the lineup image must use the active team's branding.
- **Org admin view:** Marc Kelly (or whoever runs the program) needs to see
  all three teams' coach tools, while a single-team coach sees only theirs.

---

## 10. Settings & Admin

**How it works**

- `SettingsModal` (`TeamHubRoles.jsx:7214`): profile (name, photo), sign
  out, replay the welcome tour (`WelcomeTour.jsx`), "What's New"
  (`src/data/whatsNew.js`), and an app-info row that reads **"Phoenix
  Bears TeamHub"** (`:7428`).
- **Admin promotion:** there is no self-serve admin UI — making someone a
  coach is done by setting `role: "admin"` on their `users` doc (or via the
  invite's role). The Build Guide §7 documents this as a manual step.
- **Feedback:** any signed-in user can submit tester feedback (`feedback`
  collection, write-only for players, admin-only read); a Cloud Function
  emails it to the coach via Gmail (see §13).
- **App updates:** `useAppUpdate.js` + `UpdateUI.jsx` + `appVersion.js` —
  version check and "new version available" prompt.

### Needs fixing for Brophy
- **Rename "Phoenix Bears TeamHub"** (`:7428`) and any other app-name
  strings.
- **Decide the admin model:** who can make a coach, and at what level
  (per-team coach vs. org admin). If roles move to custom claims (per the
  Build Guide §11), this is where that lands.
- **Feedback email destination:** point it at the Brophy coach's email, not
  Phoenix's (see §13).

---

## 11. Branding / Theming

**What is hard-coded to Phoenix**

| Where | What |
|---|---|
| `src/TeamHubRoles.jsx:236–247` | `COLORS`: primary `#002E5D` (Bears navy), accent `#FFC845` (Bears gold); `APP_DOMAIN = "team.phoenixmensoccer.com"` |
| `teamhub/index.html` | `<title>Phoenix Men's Soccer</title>`, `theme-color #002E5D`, favicon `/brand/logo.png` |
| `teamhub/public/brand/logo.png`, `login-bg.jpg` | Bears logo + login background (751 KB / 951 KB) |
| `teamhub/public/pc-bears-logo.png` | Bears logo used as the watermark on every drill diagram and lineup sheet (`TeamHubRoles.jsx:2889, 3477`) |
| `TeamHubRoles.jsx:467` | Login screen `alt="Phoenix College Bears"` |
| `TeamHubRoles.jsx:7428` | Settings "Phoenix Bears TeamHub" |
| `TeamHubRoles.jsx:7578` | Push fallback title `"Phoenix Bears"` |
| `teamhub/wrangler.toml:1` | Worker name `phoenix-mens-soccer-app` |
| `teamhub/functions/package.json` | Description "Phoenix Bears push-notification fan-out functions" |
| `src/lib/notifications.js` | Hard-coded VAPID public key (belongs to the Phoenix Firebase project) |
| `src/hooks/useAuth.js:63` | Player subtitle "Player · Varsity" |
| `TeamHubRoles.jsx:291` | Drill categories: "Anthony's 15 tactical topics (Phoenix College system)" |
| `TeamHubRoles.jsx:280–311` | Sample announcements, events, and videos (Central State, ACU, Memorial Stadium) |

### Needs fixing for Brophy
- **New brand assets:** Brophy logo (light + dark if needed), login
  background, favicon. Replace `public/brand/logo.png`,
  `public/brand/login-bg.jpg`, and `public/pc-bears-logo.png` (or point the
  watermark at the new logo).
- **Colors:** replace navy/gold with Brophy's colors in `COLORS`
  (`TeamHubRoles.jsx:238–240`) and `theme-color` in `index.html`.
- **Strings:** title, `APP_DOMAIN`, Settings name, push fallback title,
  login alt text, worker name, functions description.
- **Per-team branding:** if JVB/JVA/Varsity get distinct accents (or all
  share Brophy maroon/gold), decide now — the `COLORS` object is currently
  global, not per-team. The team switcher (§2) is the natural place to vary
  it.
- **VAPID key:** generate a new Web Push key pair in the Brophy Firebase
  project and replace the hard-coded key in `src/lib/notifications.js`
  (or move it to `VITE_FIREBASE_VAPID_KEY`).

---

## 12. Data Model & Firestore Rules

**Collections used** (from `collection(` calls in `TeamHubRoles.jsx` + rules)

| Collection | Holds | Who writes |
|---|---|---|
| `users` | Profile: name, email, role, initials, photoURL, fcmTokens | Self (limited fields) / admin |
| `invitedEmails` | Roster gate: `{email: {role}}` | Admin |
| `announcements` | Title, body, pinned, ts | Admin |
| `events` | Calendar events + audienceKeys | Admin |
| `videos` | Video library items | Admin |
| `drills` | Drill + coaching-point library | Admin |
| `practices` | Practice session plans | Admin |
| `programs` | Multi-day program plans | Admin |
| `lineups` | Game-day lineups | Admin |
| `customExercises` | Coach-created exercises | Admin |
| `teamWorkouts` | Coach-published workouts | Admin |
| `nutritionTargets` | Kcal/protein goals per group/player | Admin |
| `documents` | Team docs + signatures map | Admin upload; players sign |
| `assignments` | Tasks + completedBy map | Admin; players mark done |
| `groups` | Named sub-groups + members | Admin |
| `chatGroups` | Chat channels + visibleTo/audienceKeys | Admin |
| `messages` | Chat messages + readBy/votes/reactions | Anyone (audience-checked) |
| `dms` | Coach DM threads | Player (own) / admin |
| `scheduled` | Scheduled messages | Admin |
| `attendance` | Daily statuses map | Admin; players self-check-in |
| `attendanceReasons` | Absence reasons (`{date}__{uid}`) | Own player / admin |
| `wellnessCheckins` | Daily wellness forms | Own player |
| `logs/{uid}/entries` | Private food log | Own player |
| `logs/{uid}/savedFoods` | Favorite foods | Own player |
| `users/{uid}/workouts` | Private workouts | Own player |
| `users/{uid}/personalEvents` | Private calendar events | Own player |
| `water` | Daily water cups | Own player |
| `mealLogActivity` | "Logged today" markers | Own player |
| `quotes` | Quote of the Day | Admin |
| `recipes` | Recipe library | Admin |
| `categories` | Recipe categories | Admin |
| `feedback` | Tester feedback | Any user (write-only) |
| `appConfig` | App-wide prompts | Admin |

**Rules model** (`firestore.rules`, `storage.rules`)

- Two roles only: `signedIn()` and `isAdmin()` (role == `admin` on the
  user's doc). Private data is per-uid (food log, workouts, water).
- **Audience model:** `audienceKeys` (`*`, `uid:…`, `email:…`) gates events
  and chat — a doc is readable only if it carries a key the reader holds.
  Chat posting is validated so a player cannot forge a wider audience or
  post as a coach.
- Storage mirrors this: `chat/`, `avatars/`, `branding/`, `drills/`,
  `exercises/`, `documents/` paths, 10 MB image cap (50 MB documents).
- No `teamId` in any rule. No per-team scoping at all.

### Needs fixing for Brophy
- **The core change of the whole project:** add `teams/{teamId}` and a
  `teamId` field to every team-scoped collection above, then rewrite the
  rules so every read/write is scoped by team (plus the existing audience
  checks). Sketch: `isMemberOf(teamId)` (user doc carries `teamIds[]`),
  `isCoachOf(teamId)`, `isOrgAdmin()`; add `teamId` to `audienceKeys`
  checks.
- **Migrate the rules file** (`firestore.rules`) and `storage.rules`
  (storage paths are currently uid-scoped only — chat images in a Varsity
  channel must not be readable by a JVB player; the channel-audience check
  already exists, extend it with team).
- **Seed data:** decide what ships in the new project — the seed files
  (`liftSeed.js`, `recipeSeed.js`, `workoutSeed.js`, `drill-bank.json`)
  are content, not Phoenix-specific, but the *sample* announcements/events/
  videos baked into `TeamHubRoles.jsx` must be cleared.
- **No data migration needed** (fresh project, fresh data) — but the rules
  + functions must be deployed to the new Firebase project from day one.

---

## 13. Integrations & Push

**What is wired up**

- **Firebase Cloud Messaging (FCM) push:** `src/lib/notifications.js`
  (VAPID key, service worker `public/firebase-messaging-sw.js`). Cloud
  Functions fan out a push on new announcements, quotes, events, messages,
  DMs, and assignments (`functions/index.js`: `onAnnouncementCreated`,
  `onQuoteCreated`, `onEventCreated`, `onMessageCreated`, `onDMCreated`,
  `onAssignmentCreated`). Tokens are stored on the user doc (`fcmTokens`)
  and pruned when invalid.
- **Scheduled runner:** `runScheduled` (every 5 min) fires due scheduled
  messages; `onEventReminderSync` keeps event reminders in sync;
  `onEventDelegated` handles hand-offs.
- **Gemini food-photo AI:** Cloudflare Worker (`worker/index.js`, 94
  lines) proxies `/api/*` to **Gemini 2.0 Flash** with a server-side
  `GEMINI_API_KEY` secret; the app sends a food photo and gets structured
  nutrition back. The Worker also serves the SPA bundle (`dist/`, SPA
  fallback).
- **USDA FoodData Central** (`src/lib/usda.js`) + **Open Food Facts**
  (`src/lib/openfoodfacts.js`) for food search; barcode scanner included.
- **Feedback email:** `onFeedbackCreated` sends tester feedback via
  **Gmail + nodemailer** (needs a Gmail app-password secret).
- **Hosting:** Cloudflare Pages (Worker + `dist/` assets). `wrangler.toml`
  names the worker `phoenix-mens-soccer-app`. Firebase Hosting is *not*
  used; `firebase.json` only wires Firestore/Storage rules + Functions.
- **Cost note from the code:** Functions deploy with a comment *"needs
  Blaze plan"* (`functions/index.js:2`) — Cloud Functions (2nd gen) require
  the pay-as-you-go Blaze plan (still $0 at low volume, but a billing
  account must be attached).

### Needs fixing for Brophy
- **Redeploy everything to the new project:** Functions (new Firebase
  project), Worker (new Cloudflare worker + `GEMINI_API_KEY` secret), Pages
  site (new domain). Rename the worker.
- **Blaze plan:** attach billing to the Brophy Firebase project for
  Functions — confirm who pays (Logan's account) and that the Blaze plan is
  acceptable.
- **VAPID key + FCM:** new key pair from the Brophy project; update
  `src/lib/notifications.js` and the service worker registration.
- **Push fan-out must be team-scoped:** the current `collectTokens()` reads
  *all* users — for Brophy it must only notify the audience of the team
  the announcement/message belongs to.
- **Gmail secret for feedback email:** set `GMAIL_*` secrets (or equivalent)
  in the new project, and point the recipient at the Brophy coach.
- **USDA key:** fresh `VITE_USDA_API_KEY` for Brophy (free, no card).

---

## 14. File Map — the important files

| File | What it is |
|---|---|
| `teamhub/src/TeamHubRoles.jsx` (8,413 lines) | **The whole app.** All screens, all logic, all components. Start here; every section above lives in this file. |
| `teamhub/src/firebase.js` (40 lines) | Firebase init + hard-coded Phoenix config. First file to change for Brophy. |
| `teamhub/src/hooks/useAuth.js` | Sign-in, invite gate, role assignment, profile shaping. |
| `teamhub/src/hooks/useCollection.js` | Firestore live-query hook used everywhere. |
| `teamhub/src/hooks/useAppUpdate.js` | Version-check / update prompt. |
| `teamhub/src/components/TacticsBoard.jsx` | Tactics board component. |
| `teamhub/src/components/QuoteOfDay.jsx` | Quote of the Day card. |
| `teamhub/src/components/UpdateUI.jsx` | Update-available UI. |
| `teamhub/src/lib/notifications.js` | FCM push: permission, token, VAPID key (hard-coded). |
| `teamhub/src/lib/usda.js`, `openfoodfacts.js` | Food search APIs. |
| `teamhub/src/lib/lifting.js`, `exercises.js`, `exerciseSearch.js` | Gym/exercise data + helpers. |
| `teamhub/src/lib/toast.js`, `appVersion.js` | Toast + version helpers. |
| `teamhub/src/data/liftSeed.js`, `workoutSeed.js`, `recipeSeed.js`, `whatsNew.js` | Seed content. |
| `teamhub/public/drill-bank.json` (20,351 lines) | Large pre-built drill dataset. |
| `teamhub/public/brand/logo.png`, `login-bg.jpg` | Phoenix Bears brand assets. |
| `teamhub/public/pc-bears-logo.png` | Bears logo watermark for drills/lineups. |
| `teamhub/public/firebase-messaging-sw.js` | FCM service worker. |
| `teamhub/firestore.rules`, `storage.rules` | Security rules (single-team, no teamId). |
| `teamhub/functions/index.js` | Push fan-out, scheduled runner, feedback email. |
| `teamhub/worker/index.js` (94 lines) | Cloudflare Worker: serves SPA + Gemini food-photo proxy. |
| `teamhub/firebase.json`, `wrangler.toml` | Deploy config (Firebase rules/functions; Cloudflare Pages + Worker). |
| `teamhub/index.html` | Title "Phoenix Men's Soccer", theme-color, favicon. |
| `teamhub/src/WelcomeTour.jsx` | First-run guided tour. |
| `teamhub/src/main.jsx`, `index.css` | App entry + Tailwind styles. |
| `TeamHubRoles.jsx` (repo root, 66 KB) | Older copy of the monolith at repo root (the app's original file). |
| `TeamHub_Build_Guide.md` (repo root) | Build & deployment guide; §11 sketches the multi-team (SaaS) path — the design note for the 3-team work. |
| `teamhub/README.md` | App README. |

---

## Suggested fix order (for working through section by section)

1. **Firebase project + config** (§1, §13) — swap `src/firebase.js`, enable
   Auth providers, deploy rules/functions, set secrets (VAPID, Gemini, Gmail, USDA).
2. **Data model + rules** (§12, §2) — `teams` collection, `teamId` everywhere,
   rewritten rules. This is the foundation; everything else sits on it.
3. **Auth & roles** (§1) — per-team coaches + org admin, invite flow with
   `teamId`, "Player · Varsity" → per-team subtitle.
4. **Branding** (§11) — Brophy logo/colors/strings/domain.
5. **Team scoping, section by section** (§3–§10) — Home, Calendar, Videos &
   Drills, Gym, Nutrition, Chat, Coach Tools, Settings — each with a team
   picker/filter and audience checks.
6. **Push fan-out scoping** (§13) — notify only the relevant team.
7. **Content cleanup** (§3–§5) — strip Phoenix sample announcements, events,
   videos; confirm drill categories with the Brophy coaches.
8. **Deploy + verify** — Cloudflare Pages + Worker live, test all three teams
   end to end.
