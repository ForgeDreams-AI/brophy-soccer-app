import { lazy } from "react";

// Feature-module registry. Feature teams deliver pages under src/features/;
// the shell loads them lazily so the app compiles and runs even when a
// feature directory hasn't landed yet — missing pages render a "coming soon"
// placeholder instead of breaking the build.
//
// Expected deliveries (see CONTRACT.md §6). Every page receives { user }
// (the effective user — already role-adjusted for coach "view as player").
// Pages own their Firestore reads/writes via the data hooks in src/data/;
// the shell never prop-drills data.
//
//   home/HomePage.jsx            coach dashboard
//   home/PlayerTodayPage.jsx     player "today" screen
//   train/TrainHub.jsx           train picker            (also receives onPick)
//   train/GymPage.jsx            gym sub-view
//   train/NutritionPage.jsx      nutrition sub-view
//   train/VideosPage.jsx         videos sub-view
//   calendar/CalendarPage.jsx    schedule
//   chat/MessagesPage.jsx        team chat + DMs
//   coach/CoachCenterPage.jsx    practice builder + game day
//   settings/SettingsModal.jsx   overlay  ({ user, onClose, onSignOut, onReplayTour, onWhatsNew })

const modules = import.meta.glob("../features/**/*.{jsx,js}");

const SPECS = {
  homeAdmin: "home/HomePage.jsx",
  homePlayer: "home/PlayerTodayPage.jsx",
  trainHub: "train/TrainHub.jsx",
  gym: "train/GymPage.jsx",
  nutrition: "train/NutritionPage.jsx",
  videos: "train/VideosPage.jsx",
  calendar: "calendar/CalendarPage.jsx",
  chat: "chat/MessagesPage.jsx",
  coach: "coach/CoachCenterPage.jsx",
  settings: "settings/SettingsModal.jsx",
};

// React.lazy component for a page key, or null when the feature hasn't
// been delivered yet.
export function pageFor(key) {
  const rel = SPECS[key];
  if (!rel) return null;
  const load = modules[`../features/${rel}`];
  return load ? lazy(load) : null;
}

// Pre-created once at module load (never during render): each page key's
// lazy component, so the shell always references a stable component
// identity. `lazy()` itself never triggers the dynamic import — pages still
// load on first render, exactly as before. Undelivered features map to null
// and render the "coming soon" placeholder.
export const PAGES = {};
for (const key of Object.keys(SPECS)) PAGES[key] = pageFor(key);
