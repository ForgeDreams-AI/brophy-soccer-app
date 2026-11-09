// Coach Center — the coach tab root. Two doors: the practice planner
// (drill library, sessions, programs) and the game-day line-up builder.
// All data comes from useCoachData (src/features/coach/hooks.js); this page
// owns the single Firestore subscription set for the feature.

import { useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Goal } from "lucide-react";
import { useCoachData } from "./hooks";
import PracticeHome from "./components/PracticeHome";
import GameDayPage from "./components/GameDayPage";

export default function CoachCenterPage({ user }) {
  const coach = useCoachData(user);
  const [view, setView] = useState(null); // null | "practice" | "gameday"

  if (view === "practice" || view === "gameday") {
    return (
      <div>
        <div className="px-5 pt-4 pb-1">
          <button
            onClick={() => setView(null)}
            className="text-xs font-semibold text-ink-faint flex items-center gap-1"
          >
            <ChevronLeft className="w-3 h-3" /> Coach Center
          </button>
        </div>
        {view === "practice" ? (
          <PracticeHome user={user} coach={coach} />
        ) : (
          <GameDayPage user={user} coach={coach} />
        )}
      </div>
    );
  }

  return (
    <div className="pt-5 pb-6 px-5 space-y-3">
      <button
        onClick={() => setView("practice")}
        className="w-full rounded-xl p-5 bg-[var(--th-surface)] border border-[var(--th-surface-2)] shadow-card flex items-center gap-4 text-left"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-brand-accent-soft">
          <ClipboardList className="w-6 h-6 text-brand-accent" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-ink">Practice</div>
          <div className="text-xs text-ink-faint mt-0.5">Drill library, sessions & programs</div>
        </div>
        <ChevronRight className="w-5 h-5 text-ink-faint" />
      </button>
      <button
        onClick={() => setView("gameday")}
        className="w-full rounded-xl p-5 shadow-card flex items-center gap-4 text-left text-white bg-brand-primary"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/15">
          <Goal className="w-6 h-6 text-brand-accent" />
        </div>
        <div className="flex-1">
          <div className="font-bold">Game Day</div>
          <div className="text-xs text-white/70 mt-0.5">Build & share your starting line-up</div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/50" />
      </button>
    </div>
  );
}
