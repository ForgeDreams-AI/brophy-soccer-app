import React, { useEffect, useState } from "react";

// Brand palette (mirrors COLORS in TeamHubRoles so the tour matches the app).
const NAVY = "#002E5D";
const GOLD = "#FFC845";

// Role-aware welcome walkthrough. Self-contained: a centered card carousel that
// steps through the app's features with Back / Next / Skip. Shown automatically
// on first login (caller tracks "seen" in localStorage) and replayable anytime
// from Settings. No DOM anchoring, so it can't break the live layout.

const COACH_STEPS = [
  { icon: "👋", title: "Welcome, Coach!", body: "Here's a quick 30-second tour of everything you can do. You can replay it anytime from Settings." },
  { icon: "🏠", title: "Home", body: "Post announcements the whole team sees instantly, and get a snapshot of what's coming up." },
  { icon: "⚽", title: "Practice", body: "Build and share practice plans and your drill library so everyone knows the session." },
  { icon: "📅", title: "Schedule", body: "Create games, practices, and events — and choose exactly who sees each one (everyone, a group, or specific players)." },
  { icon: "💪", title: "Train", body: "Your hub for workouts, nutrition targets, and the video library. Create and assign training content here." },
  { icon: "💬", title: "Chat", body: "Team channels plus private messages. You can make a channel visible to just one group, and pin important posts." },
  { icon: "🧑‍🤝‍🧑", title: "Roster & documents", body: "Invite players by email, manage the roster, share documents for e-signing, and take daily attendance." },
  { icon: "🔔", title: "Notifications", body: "Turn these on (in Settings) so players get a ping for every new announcement, event, and message." },
  { icon: "✅", title: "You're all set!", body: "That's the whole app. Tap “Replay the tour” in Settings whenever you want to see this again." },
];

const PLAYER_STEPS = [
  { icon: "👋", title: "Welcome to the team app!", body: "Here's a quick 30-second tour. You can replay it anytime from Settings." },
  { icon: "🏠", title: "Today", body: "Your home base — announcements from your coach and what's happening today." },
  { icon: "💪", title: "Train", body: "Your workouts, nutrition targets, and video library. Log your meals and water right here." },
  { icon: "📅", title: "Schedule", body: "All your games, practices, and events. Tap any one for the details." },
  { icon: "💬", title: "Chat", body: "Team channels plus a private line straight to your coach." },
  { icon: "📄", title: "Documents & profile", body: "Sign any team documents your coach shares, and keep your profile up to date." },
  { icon: "🔔", title: "Notifications", body: "Turn these on (in Settings) so you never miss an announcement, event, or message." },
  { icon: "✅", title: "All set!", body: "That's everything. You can replay this tour anytime from Settings." },
];

export default function WelcomeTour({ open, role, onClose }) {
  const steps = role === "admin" ? COACH_STEPS : PLAYER_STEPS;
  const [i, setI] = useState(0);

  // Always start at the beginning each time it opens.
  useEffect(() => { if (open) setI(0); }, [open]);

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="Welcome tour"
      style={{ backgroundColor: "rgba(20,39,92,0.72)" }}>
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="px-6 pt-7 pb-5 text-center" style={{ backgroundColor: NAVY }}>
          <div className="text-5xl mb-2" aria-hidden="true">{step.icon}</div>
          <h2 className="text-white text-lg font-black">{step.title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-center">
          <p className="text-sm text-slate-600 leading-relaxed min-h-[64px]">{step.body}</p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 my-4" aria-hidden="true">
            {steps.map((_, idx) => (
              <span key={idx} className="h-1.5 rounded-full transition-all"
                style={{ width: idx === i ? 18 : 6, backgroundColor: idx === i ? GOLD : "#E2E8F0" }} />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="px-4 py-2.5 rounded-full text-xs font-bold text-slate-500 disabled:opacity-30">
              Back
            </button>
            <button
              onClick={() => (last ? onClose() : setI((n) => Math.min(steps.length - 1, n + 1)))}
              className="flex-1 py-2.5 rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: NAVY }}>
              {last ? "Let's go!" : "Next"}
            </button>
          </div>

          {!last && (
            <button onClick={onClose} className="mt-3 text-[11px] font-semibold text-slate-400">
              Skip the tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
