# TeamHub Foundation — Feature Team Contract

This is the contract every feature team builds against. The foundation owns:
theme, auth gates, app shell + tab router, UI primitives, data hooks,
collection names, and shared lib helpers. Feature teams own everything under
`src/features/` — their components, their Firestore reads/writes, their
Storage uploads.

## 1. Theme API

```js
import { useTheme } from "../theme/ThemeProvider"; // adjust depth

const { team, t } = useTheme();
// team.name, team.shortName, team.colors, team.assets ({logo, loginBg}),
// team.domain, team.pushTitle, team.targets ({cal, protein, water})
// t("primary") → raw hex for inline styles when a Tailwind class won't do
```

- Prefer Tailwind theme classes, which resolve through CSS vars set by
  `ThemeProvider`: `bg-brand-primary`, `text-brand-accent`, `bg-brand-accent-soft`,
  `bg-ink` / `text-ink-soft` / `text-ink-faint`, `font-display` (Barlow Condensed),
  `shadow-card` / `shadow-hero` / `shadow-sheet`, `rounded-xl` (= 20px).
- `document.title` and the `theme-color` meta are set per-team at runtime —
  never set them yourself.
- Team config lives ONLY in `src/theme/teams.js`. Adding a team = adding an
  entry there (see the `ridgebacks` example). Nothing else changes.

## 2. UI components (`src/components/ui/`)

All primitives use Barlow Condensed display headings and Lucide icons.

| Component | Import | Key props |
|---|---|---|
| `Sheet` | `./Sheet` | `open, onClose, title, subtitle, size="sm\|md\|lg\|full", footer, dismissable` — bottom sheet with drag handle, spring-up, sticky header |
| `ConfirmProvider, useConfirm` | `./ConfirmDialog` | `const confirm = useConfirm(); await confirm({title, body, confirmLabel, danger}) → bool; await confirm.prompt({title, label, initial, placeholder, confirmLabel}) → string\|null` |
| `Btn` | `./Btn` | `variant="primary\|accent\|outline\|danger\|ghost", size="sm\|md\|lg", loading, icon` |
| `Card` | `./Card` | `elevation="flat\|raised\|hero", onClick?` |
| `SectionHeader` | `./SectionHeader` | `title, action?, icon?` — display-font title + gold accent bar |
| `Avatar` | `./Avatar` | `photoURL, initials, size=36, ring` |
| `EmptyState` | `./EmptyState` | `icon, title, body, action` |
| `SegmentedControl` | `./SegmentedControl` | `options=[{value,label,icon?}], value, onChange` |
| `Field, Input, TextArea, Select` | `./Field` | `<Field label hint error><Input …/></Field>` |
| `SearchInput` | `./SearchInput` | `value, onChange, placeholder` |
| `Badge` | `./Badge` | `tone="gold\|navy\|green\|red\|blue", icon?` |
| `StatTile` | `./StatTile` | `icon, value, label, progress? (0..1 ring)` |
| `ProgressRing` | `./ProgressRing` | `value (0..1), size, stroke, color="gold\|navy\|hex"` |
| `ProgressBar` | `./ProgressBar` | `value (0..1), from, to, height` |
| `Skeleton` | `./Skeleton` | `rows` |
| `Tabs` | `./Tabs` | `tabs=[{id,label,icon?}], value, onChange` — in-page pill switcher |
| `Toaster` | (shell only) | Rendered once at app root. Fire via `toast(msg, type)` from `lib/toast` |
| `UpdateBanner, WhatsNewModal` | `./UpdateBanner` | Shell-owned; `WhatsNewModal({onClose})` reads `data/seeds/whatsNew` |
| `WelcomeTour` | `../WelcomeTour` | Shell-owned: `{open, role, onClose}` |

## 3. Data (`src/data/`)

- `COL` (`./collections`) — collection-name constants. Import these; never
  hard-code a collection path.
- Subcollection helpers: `personalEvents(uid)`, `userWorkouts(uid)`,
  `foodEntries(uid)`, `savedFoods(uid)`.
- `types.js` — JSDoc `@typedef` for User, Team, EventDoc, MessageDoc,
  WorkoutDoc, ExerciseEntry, RecipeDoc, FoodEntry, DrillDoc, PracticeDoc,
  ProgramDoc, LineupDoc, VisibleTo, AssignmentDoc. Read before touching a shape.
- Hooks (`./hooks`): `useCollection(name, ...constraints)`,
  `useAudienceCollection(name, user, orderField?)`, `useLocalStorage(key, initial)`.
- `useAuth()` (`./useAuth`) → `{ user, loading, error, clearError }`.
  `user.role` is `"admin" | "player"`; `user.sub` is `"Head Coach" | "Player"`.

## 4. Lib (`src/lib/`)

| Module | Exports |
|---|---|
| `dates` | `todayKey()` (LOCAL tz — fixes the v1 UTC bug), `formatDayKey`, `parseDayKey`, `addDays`, `isToday`, `formatAgo`, `formatTime`, `formatHourTime`, `formatDateHeader` |
| `csv` | `parseCsv(text)` — quoted commas handled → array of objects by header row |
| `images` | `downscaleImage(file, {maxDim, quality}) → {blob, dataUrl}` + presets `downscaleChatImage`, `downscaleAvatar`, `downscaleLogo` |
| `audience` | `audienceKeysFor(visibleTo, groups)`, `withAudienceKeys(data, groups)`, `audienceKeyFor(x)`, `visibleToText(visibleTo, groups)`, `isVisibleToDoc(doc, user, groups)` |
| `toast` | `toast(message, type="error"\|"success"\|"info")` |
| `lifting` | workout engine: `newEntry, formatPrescription, groupBySuperset, SUPERSET_LABELS, WORKOUT_TEMPLATES, buildTemplateWorkout` |
| `usda`, `openfoodfacts`, `exercises`, `exerciseSearch` | food/exercise data integrations (see each file's header) |
| `notifications` | `notificationsSupported, currentPermission, enablePushNotifications, disablePushNotifications, clearAllPushTokens, onForegroundMessage` |
| `appVersion` | `BUILD_ID` (baked at build time) |
| Seeds | `src/data/seeds/{recipeSeed, liftSeed, workoutSeed, whatsNew}.js` |

## 5. App shell (`src/app/`)

- `tabs.js` — `coachTabs`, `playerTabs`, `TRAIN_VIEWS`, `routeToTab(tab, sub) → {tab, trainView}` (deep links + notification taps; legacy `gym|nutrition|videos` route into Train).
- `TeamHubApp.jsx` — thin shell: auth gates → fixed-inset `max-w-md` column → Header (logo, shortName eyebrow, title, coach "view as player" eye, avatar→settings) → preview banner → `<main>` → 5-button bottom nav (gold active, chat unread badge) → Toaster/UpdateBanner/WhatsNewModal/WelcomeTour. Exports `useApp()` → `{ user, realUser, isAdmin, isPreviewing, exitPreview, openSettings, goTab, openTrain }`.
- `registry.js` — `pageFor(key)` lazy-loads `src/features/**`; missing features render a "coming soon" placeholder so the app always compiles.
- `main.jsx` — `StrictMode → ThemeProvider → ConfirmProvider → TeamHubApp`.

## 6. Feature module layout

```
src/features/<area>/
  <Area>Page.jsx        default export; receives { user } (effective user)
  hooks.js              data hooks owning this area's reads/writes
  components/           area-private components
```

Expected pages and their props:

| Key | File | Props |
|---|---|---|
| `homeAdmin` | `home/HomePage.jsx` | `{ user }` |
| `homePlayer` | `home/PlayerTodayPage.jsx` | `{ user }` |
| `trainHub` | `train/TrainHub.jsx` | `{ user, onPick }` — `onPick("gym"\|"nutrition"\|"videos")` |
| `gym` / `nutrition` / `videos` | `train/GymPage.jsx` etc. | `{ user }` |
| `calendar` | `calendar/CalendarPage.jsx` | `{ user }` |
| `chat` | `chat/MessagesPage.jsx` | `{ user }` |
| `coach` | `coach/CoachCenterPage.jsx` | `{ user }` (admin only) |
| `settings` | `settings/SettingsModal.jsx` | `{ user, onClose, onSignOut, onReplayTour, onWhatsNew }` — overlay; `user` is the REAL user |

## 7. HARD RULES

1. **Lucide icons only. No emoji anywhere** — not in UI, not in tour steps, not in chat chrome you build.
2. **Never `window.confirm()` / `window.prompt()` / `alert()`** — use `useConfirm()` (confirm + prompt variants). The one historical exception (magic-link email fallback) already uses `confirm.prompt()`.
3. **Never hard-code team colors or names.** No `#14275C`, no `"Phoenix"`, no `"Bears"` outside `src/theme/teams.js`. Use `useTheme()` + Tailwind theme classes. (Third-party brand colors like Google `#4285F4` are fine.)
4. **Minimum text size 11px.** No `text-[8px]` / `text-[9px]` micro-labels.
5. **Every Firestore write goes through your feature's hooks**, and any doc carrying `visibleTo` must stamp `audienceKeys` via `withAudienceKeys(data, groups)` from `lib/audience` at write time.
6. **Use `todayKey()` / `formatDayKey()` from `lib/dates`** for "today" — never `toISOString().slice(0,10)` (UTC bug).
7. **No prop drilling from the shell.** Pages own their data via `src/data/hooks`. The shell passes `{ user }` and navigation callbacks only.
8. **Destructive actions always confirm** via `useConfirm({ danger: true })` — no silent deletes.
9. **Keep the `visibleTo` → `audienceKeys` pair in sync** — it is the security boundary (rules enforce `audienceKeys`).
10. **Feature code must compile standalone**: never import from another feature's directory. Shared code goes in `components/ui/`, `lib/`, or `data/`.
11. **Group membership edits must re-stamp everywhere.** Call
    `restampGroupAudience(db, groupId, nextGroups, localDocs)` from
    `src/data/groups.js` after any `groups/{id}` membership write — it
    re-resolves `audienceKeys` on the caller's local docs AND sweeps
    `messages`, `nutritionTargets`, and `scheduled` server-side. Never
    re-implement a per-feature subset; a partial re-stamp silently leaks or
    hides docs.

## 8. Integration notes (Phase 1 completion, 2026-10-01)

- **New shared modules** (all in `components/ui/` or `data/`, per rule 10):
  - `src/data/groups.js` — `restampGroupAudience(db, groupId, nextGroups, localDocs)` (see rule 11).
  - `src/components/ui/CsvImporter.jsx` — shared CSV import Sheet (calendar keeps its own richer `ImportPanel`; don't merge without checking both).
  - `src/components/ui/ReadOnlyHint.jsx` — canonical player read-only marker; gym's local copy now re-exports this.
- **`Field` has both exports**: `components/ui/Field.jsx` exports named `Field`
  plus named `Input`/`TextArea`/`Select` and a default `Field`. Either import
  style compiles.
- **Tailwind opacity modifiers are BROKEN on theme colors.** `brand-*`, `ink*`,
  and `var(--th-*)` colors resolve through CSS vars, and Tailwind v3 emits
  `rgb(var(--th-x) / N)` which is invalid for hex vars — the alpha is silently
  dropped. Never write `bg-brand-primary/10`, `text-ink/60`,
  `bg-[var(--th-danger)]/90`, etc. Use
  `bg-[color-mix(in_srgb,var(--th-primary)_10%,transparent)]`
  (underscores for spaces in arbitrary values).
- **JSX files must end in `.jsx`.** Vite does not transform JSX in `.js`
  files (`coach/components/shared.js` was renamed to `shared.jsx` for this).
- **Import depth**: files directly under `src/features/<area>/` use
  `../../components/ui`; files under `src/features/<area>/*/` (components/,
  gym/) use `../../../components/ui`. A wrong depth fails the build.
- **White-label delta in backend**: `worker/index.js` has one string change —
  the food-photo prompt says "team sports app" instead of "college soccer
  team app". Everything else in `functions/`, `worker/`, `firestore.rules`,
  `storage.rules`, `firebase.json`, `.firebaserc` is byte-identical to the
  Phoenix source.
- **Deploy-time Firestore indexes needed**: chat pagination requires composite
  indexes on `messages (channel ASC, createdAt DESC)` and
  `messages (audienceKeys ARRAY, channel ASC, createdAt DESC)`. First runtime
  error will link the Firebase console "create index" shortcut.
- **`nutritionTargets` now stamps `audienceKeys`** (v1 docs lack it — players
  on old docs need a backfill before the new app build reads them).
