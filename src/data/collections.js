// COL — every Firestore collection name in one place. Feature hooks must
// import from here; never hard-code a collection path in a component.
// (Phase 2 adds per-team scoping; call sites won't change.)
export const COL = {
  users: "users",
  invites: "invitedEmails",
  announcements: "announcements",
  appConfig: "appConfig",
  events: "events",
  groups: "groups",
  videos: "videos",
  drills: "drills",
  practices: "practices",
  programs: "programs",
  lineups: "lineups",
  teamWorkouts: "teamWorkouts",
  customExercises: "customExercises",
  recipes: "recipes",
  categories: "categories",
  nutritionTargets: "nutritionTargets",
  messages: "messages",
  chatGroups: "chatGroups",
  dms: "dms",
  scheduled: "scheduled",
  documents: "documents",
  attendance: "attendance",
  attendanceReasons: "attendanceReasons",
  wellness: "wellnessCheckins",
  water: "water",
  assignments: "assignments",
  quotes: "quotes",
  feedback: "feedback",
  mealActivity: "mealLogActivity",
};

// Subcollection path helpers (doc id = uid unless noted).
export const personalEvents = (uid) => (uid ? `users/${uid}/personalEvents` : null);
export const userWorkouts = (uid) => (uid ? `users/${uid}/workouts` : null);
export const foodEntries = (uid) => (uid ? `logs/${uid}/entries` : null);
export const savedFoods = (uid) => (uid ? `logs/${uid}/savedFoods` : null);
