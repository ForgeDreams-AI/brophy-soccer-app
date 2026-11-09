// Team registry — the ONLY place team identity lives. Every brand string,
// color, asset path, and default target in the app resolves through here
// (via useTheme()), so onboarding a new team is a config entry, not a code
// change. See CONTRACT.md §1.

const BASE_COLORS = {
  primary: "#14275C",
  primaryDeep: "#0B1836",
  accent: "#F4C75E",
  accentSoft: "#FCF1D6",
  success: "#00B27A",
  danger: "#E5484D",
  info: "#0EA5E9",
  bg: "#F1F4FA",
  surface: "#FFFFFF",
  surface2: "#E8EDF6",
  ink: "#101C33",
  ink2: "#4A5A75",
  ink3: "#8B96AB",
};

const BASE_ASSETS = {
  logo: "/brand/logo.png",
  loginBg: "/brand/login-bg.jpg",
};

const BASE_TARGETS = { cal: 3200, protein: 180, water: 10 };

export const TEAMS = {
  phoenix: {
    id: "phoenix",
    name: "Phoenix College Men's Soccer",
    shortName: "Bears",
    colors: { ...BASE_COLORS },
    assets: { ...BASE_ASSETS },
    domain: "team.phoenixmensoccer.com",
    pushTitle: "Phoenix Bears",
    targets: { ...BASE_TARGETS },
  },

  // Example white-label team — proof that theming is config-only. Maroon +
  // sand; everything else (targets, danger/info/surfaces) inherits defaults.
  ridgebacks: {
    id: "ridgebacks",
    name: "Desert Ridge Women's Basketball",
    shortName: "Ridgebacks",
    colors: {
      ...BASE_COLORS,
      primary: "#6B1F2A",
      primaryDeep: "#3D1218",
      accent: "#E8C872",
      accentSoft: "#F7ECD2",
    },
    assets: { ...BASE_ASSETS },
    domain: "team.desertridgebasketball.com",
    pushTitle: "Ridgebacks",
    targets: { ...BASE_TARGETS, cal: 2600, protein: 150, water: 8 },
  },
};

export const DEFAULT_TEAM = "phoenix";

// Resolution order: explicit VITE_TEAM_ID build env → hostname match against
// a team's domain (covers custom domains + subdomains) → default team.
export function resolveTeamId() {
  const envId = typeof import.meta !== "undefined" && import.meta.env?.VITE_TEAM_ID;
  if (envId && TEAMS[envId]) return envId;
  if (typeof window !== "undefined") {
    const host = window.location.hostname || "";
    const match = Object.values(TEAMS).find(
      (t) => t.domain && (host === t.domain || host.endsWith("." + t.domain)),
    );
    if (match) return match.id;
  }
  return DEFAULT_TEAM;
}

// Full team record with colors/assets/targets merged over the base defaults,
// so a team entry only needs to specify what differs.
export function getTeam(id) {
  const t = TEAMS[id] || TEAMS[DEFAULT_TEAM];
  return {
    ...t,
    colors: { ...BASE_COLORS, ...(t.colors || {}) },
    assets: { ...BASE_ASSETS, ...(t.assets || {}) },
    targets: { ...BASE_TARGETS, ...(t.targets || {}) },
  };
}
