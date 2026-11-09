// ─── Team-app roles ────────────────────────────────────────────────────────
// The three roles that may use the Brophy team app: orgAdmin (program
// admin), admin (team coach), player. Any signed-in account whose role is
// NOT one of these has no team-app access — today that is the drillBuilder
// role: those accounts build drills in the standalone Drill Library site
// (brophy-drill-library.web.app) and see a locked screen here instead of
// the app (NoAccessScreen in TeamHubRoles.jsx, gated by `lockedOut`).
// Firestore rules fail closed for these accounts anyway; the screen is the
// UX lock. Kept in its own file so TeamHubRoles.jsx only exports components
// (react-refresh/only-export-components).

export const TEAM_APP_ROLES = ["admin", "orgAdmin", "player"];

export const isLockedOutRole = (role) => !TEAM_APP_ROLES.includes(role);
