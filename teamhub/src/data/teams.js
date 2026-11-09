// Brophy College Prep — the three teams under one account.
// Single source of truth for team identity. Every team-scoped query, write,
// and security rule keys off these ids; add a team here and it flows through
// the app (the Firestore `teams/{teamId}` docs carry the same ids — see the
// shape below).
export const TEAMS = [
  { id: "jvb", name: "Brophy JVB", shortName: "JVB", level: "JV B" },
  { id: "jva", name: "Brophy JVA", shortName: "JVA", level: "JV A" },
  { id: "varsity", name: "Brophy Varsity", shortName: "Varsity", level: "Varsity" },
];

export const TEAM_IDS = TEAMS.map((t) => t.id);

// A user with no team assigned yet lands on Varsity (the invite flow sets a
// real team; this is only the fallback — see useAuth).
export const DEFAULT_TEAM_ID = "varsity";

export const getTeam = (id) =>
  TEAMS.find((t) => t.id === id) || TEAMS.find((t) => t.id === DEFAULT_TEAM_ID);

export const getTeamShortName = (id) => getTeam(id).shortName;

export const isValidTeamId = (id) => TEAM_IDS.includes(id);

// Firestore `teams/{teamId}` doc shape (seeded idempotently on admin login,
// see TeamHubRolesApp — only an org admin or a coach of that team can create
// it; only an org admin can change it):
// {
//   name: "Brophy JVB",        // display name
//   shortName: "JVB",          // short label (switcher, subtitles)
//   level: "JV B",             // program level
//   coachUids: ["uid", ...],   // coaches of this team (informational; the
//                              // user doc's teamIds + role enforce access)
//   createdAt: <server timestamp>,
// }
export const teamDocFields = (team) => ({
  name: team.name,
  shortName: team.shortName,
  level: team.level,
  coachUids: [],
});

// Firestore `inviteLinks/{code}` doc shape (team invite links, decision
// 2026-11-08 — a coach generates a link for ONE team; a player signing up
// via that link lands on that team). The doc id IS the code (random token).
// Generation + redemption logic lands in a follow-up fix (TODOs in
// TeamHubRoles.jsx near addInvite and in useAuth.js at the invite gate);
// the firestore.rules block for inviteLinks already supports the flow.
// {
//   teamId: "jva",             // the team the link invites to
//   createdByUid: "uid",       // coach who generated it
//   createdByName: "Marc Kelly",
//   code: "<same as doc id>",  // random token
//   createdAt: <server timestamp>,
//   expiresAt: <timestamp> | null,  // null = never expires
//   maxUses: <number> | null,       // null = unlimited
//   uses: 0,                        // redemption count
// }
