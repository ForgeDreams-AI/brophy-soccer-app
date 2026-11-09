import { useState } from "react";
import {
  Flag,
  Home,
  ClipboardList,
  CalendarDays,
  Dumbbell,
  MessageCircle,
  Users,
  Bell,
  CheckCircle2,
  FileText,
  Sparkles,
} from "lucide-react";
import Btn from "./ui/Btn";

// Role-aware welcome walkthrough. Self-contained centered-card carousel — no
// DOM anchoring, so it can't break the live layout. Shown automatically on
// first login (caller tracks "seen" in localStorage); replayable from
// Settings. Icons are Lucide only — never emoji.

const COACH_STEPS = [
  { Icon: Flag, title: "Welcome, Coach!", body: "A quick 30-second tour of everything you can do. Replay it anytime from Settings." },
  { Icon: Home, title: "Home", body: "Post announcements the whole team sees instantly, and get a snapshot of what's coming up." },
  { Icon: ClipboardList, title: "Coach Center", body: "Build practice plans, browse your drill library, and draw up game-day line-ups." },
  { Icon: CalendarDays, title: "Schedule", body: "Create games, practices, and events — and choose exactly who sees each one: everyone, a group, or specific players." },
  { Icon: Dumbbell, title: "Train", body: "Your hub for workouts, nutrition targets, and the video library. Create and assign training content here." },
  { Icon: MessageCircle, title: "Chat", body: "Team channels plus private messages. Make a channel visible to just one group, and pin the posts that matter." },
  { Icon: Users, title: "Roster & documents", body: "Invite players by email, manage the roster, share documents for e-signing, and take daily attendance." },
  { Icon: Bell, title: "Notifications", body: "Turn these on in Settings so players get a ping for every announcement, event, and message." },
  { Icon: CheckCircle2, title: "You're all set!", body: "That's the whole app. Tap “Replay the tour” in Settings whenever you want to see this again." },
];

const PLAYER_STEPS = [
  { Icon: Flag, title: "Welcome to the team!", body: "A quick 30-second tour. Replay it anytime from Settings." },
  { Icon: Home, title: "Today", body: "Your home base — announcements from your coach and what's happening today." },
  { Icon: Dumbbell, title: "Train", body: "Your workouts, nutrition targets, and video library. Log your meals and water right here." },
  { Icon: CalendarDays, title: "Schedule", body: "All your games, practices, and events. Tap any one for the details." },
  { Icon: MessageCircle, title: "Chat", body: "Team channels plus a private line straight to your coach." },
  { Icon: FileText, title: "Documents & profile", body: "Sign any team documents your coach shares, and keep your profile up to date." },
  { Icon: Bell, title: "Notifications", body: "Turn these on in Settings so you never miss an announcement, event, or message." },
  { Icon: CheckCircle2, title: "All set!", body: "That's everything. You can replay this tour anytime from Settings." },
];

export default function WelcomeTour({ open, role, onClose }) {
  const steps = role === "admin" ? COACH_STEPS : PLAYER_STEPS;
  const [i, setI] = useState(0);

  // Always start at the beginning each time it opens — derived during
  // render with a previous-value guard instead of an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setI(0);
  }

  if (!open) return null;
  const { Icon, title, body } = steps[i];
  const last = i === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-5 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      style={{ backgroundColor: "color-mix(in srgb, var(--th-primary-deep) 78%, transparent)" }}
    >
      <div className="w-full max-w-sm rounded-[28px] bg-[var(--th-surface)] shadow-sheet overflow-hidden animate-pop-in">
        {/* Header band */}
        <div className="px-6 pt-8 pb-6 text-center bg-brand-primary relative overflow-hidden">
          <Sparkles className="absolute top-4 right-5 w-5 h-5 text-[color-mix(in_srgb,var(--th-accent)_60%,transparent)]" aria-hidden="true" />
          <div
            className="w-16 h-16 mx-auto rounded-[22px] bg-white/10 flex items-center justify-center mb-3"
            aria-hidden="true"
          >
            <Icon className="w-8 h-8 text-brand-accent" />
          </div>
          <h2 className="text-white font-display font-bold text-[30px] uppercase tracking-wide leading-none">
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-center">
          <p className="text-sm text-ink-soft leading-relaxed min-h-[64px]">{body}</p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 my-4" aria-hidden="true">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className="h-1.5 rounded-full transition-all duration-200"
                style={{
                  width: idx === i ? 20 : 6,
                  backgroundColor: idx === i ? "var(--th-accent)" : "var(--th-surface-2)",
                }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="press px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint disabled:opacity-30"
            >
              Back
            </button>
            <Btn
              variant="primary"
              size="md"
              className="flex-1"
              onClick={() => (last ? onClose() : setI((n) => Math.min(steps.length - 1, n + 1)))}
            >
              {last ? "Let's go!" : "Next"}
            </Btn>
          </div>

          {!last && (
            <button
              onClick={onClose}
              className="press mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint"
            >
              Skip the tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
