import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getTeam, resolveTeamId } from "./teams";

const ThemeContext = createContext(null);

// CSS vars driven from the team config. Kept in one map so the runtime
// setter, tailwind.config colors, and useTheme() can never drift apart.
const VAR_MAP = {
  primary: "--th-primary",
  primaryDeep: "--th-primary-deep",
  accent: "--th-accent",
  accentSoft: "--th-accent-soft",
  success: "--th-success",
  danger: "--th-danger",
  info: "--th-info",
  bg: "--th-bg",
  surface: "--th-surface",
  surface2: "--th-surface-2",
  ink: "--th-ink",
  ink2: "--th-ink-2",
  ink3: "--th-ink-3",
};

function applyTeam(team) {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(VAR_MAP)) {
    root.style.setProperty(cssVar, team.colors[key]);
  }
  document.title = `${team.shortName} TeamHub`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", team.colors.primary);
}

export function ThemeProvider({ children }) {
  // Resolve once at mount — the team is a deployment-level constant, not
  // reactive state (per-deployment config injection arrives in Phase 2).
  const [team] = useState(() => getTeam(resolveTeamId()));

  useEffect(() => {
    applyTeam(team);
  }, [team]);

  const value = useMemo(() => ({ team }), [team]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// useTheme() → { team, t }
//   team — the full resolved team record (name, shortName, colors, assets,
//          domain, pushTitle, targets)
//   t(key) — raw color hex for a colors key, e.g. t('primary'), t('accent')
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  const { team } = ctx;
  return useMemo(
    () => ({
      team,
      t: (key) => team.colors[key],
    }),
    [team],
  );
}
