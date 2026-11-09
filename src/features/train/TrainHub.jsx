// TrainHub — the train tab's picker: three premium cards (Gym / Nutrition /
// Videos). The shell renders this with { user, onPick } and switches to the
// matching train view when a card is tapped: onPick("gym"|"nutrition"|"videos").
import { ChevronRight, Dumbbell, Salad, Play } from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import Card from "../../components/ui/Card";

const CARDS = [
  {
    id: "gym",
    icon: Dumbbell,
    title: "Gym",
    desc: "Exercise library, coach-built lifts, and team strength programs — build the body for the game.",
  },
  {
    id: "nutrition",
    icon: Salad,
    title: "Nutrition",
    desc: "Recipes, fuel targets, and daily food logging — eat like it matters, because it does.",
  },
  {
    id: "videos",
    icon: Play,
    title: "Videos",
    desc: "The team's drill library and film room — study the game before you play it.",
  },
];

export default function TrainHub({ user, onPick }) {
  const { team } = useTheme();
  const first = (user?.name || "").split(/\s+/)[0];

  return (
    <div className="px-5 pt-4 pb-6 space-y-4">
      <div>
        <h1 className="font-display font-bold text-[34px] leading-none uppercase tracking-wide text-ink">
          Train
        </h1>
        <div className="mt-1.5 h-[3px] w-10 rounded-full bg-brand-accent" />
        <p className="text-[13px] text-ink-soft mt-2.5 leading-relaxed">
          {first ? `Ready when you are, ${first}. ` : ""}Pick a lane and get to work.
        </p>
      </div>

      <div className="space-y-3">
        {CARDS.map(({ id, icon: Icon, title, desc }) => (
          <Card key={id} elevation="raised" onClick={() => onPick(id)} className="!p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
                <Icon className="w-7 h-7 text-brand-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-[26px] leading-none uppercase tracking-wide text-ink">
                  {title}
                </div>
                <p className="text-[12px] text-ink-soft mt-1.5 leading-snug">{desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-ink-faint flex-shrink-0" />
            </div>
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-ink-faint text-center pt-1">
        {team.shortName ? `Built for ${team.shortName}.` : "Built for your team."}
      </p>
    </div>
  );
}
