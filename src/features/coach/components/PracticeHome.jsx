// Practice hub — the landing for the practice planner: today's scheduled
// session (resolved from calendar events → practiceId) plus the three section
// doors (Drills, Practices, Programs), each with a Create / Library split.

import { useState } from "react";
import { Plus, ChevronLeft, Target, Layers, Goal } from "lucide-react";
import { toast } from "../../../lib/toast";
import { todayKey, formatHourTime } from "../../../lib/dates";
import DrillsPage from "./DrillsPage";
import { PracticesView, NewPracticeChooser } from "./PracticeDetail";
import { ProgramsView } from "./ProgramDetail";

// One section row on the Practice home: title + a Create / Library split.
const SectionBanner = ({ icon: Icon, title, count, onCreate, onLibrary }) => (
  <div className="bg-[var(--th-surface)] rounded-xl border border-[var(--th-surface-2)] shadow-card overflow-hidden">
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-accent-soft">
        <Icon className="w-5 h-5 text-brand-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-ink">{title}</div>
        <div className="text-[11px] text-ink-faint">{count}</div>
      </div>
    </div>
    <div className="grid grid-cols-2 border-t border-[var(--th-surface-2)]">
      <button
        onClick={onCreate}
        className="py-2.5 text-xs font-bold uppercase tracking-wider text-white flex items-center justify-center gap-1.5 bg-brand-primary"
      >
        <Plus className="w-3.5 h-3.5" /> Create
      </button>
      <button
        onClick={onLibrary}
        className="py-2.5 text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center justify-center gap-1.5"
      >
        <Layers className="w-3.5 h-3.5 text-brand-accent" /> Library
      </button>
    </div>
  </div>
);

export default function PracticeHome({ user, coach }) {
  const isAdmin = user.role === "admin";
  const [nav, setNav] = useState({ section: "home", mode: null, openId: null });
  const go = (section, mode, openId = null) => setNav({ section, mode, openId });
  const home = () => setNav({ section: "home", mode: null, openId: null });

  // Today's session is whichever calendar event lands on today with a
  // practiceId (program days assigned to the calendar carry it).
  const today = todayKey();
  const todayEvent = coach.events.find((e) => e.date === today && e.practiceId);
  const todayPractice =
    todayEvent && coach.practices.find((p) => p.id === todayEvent.practiceId);

  const createPracticeFrom = async (data) => {
    try {
      const ref = await coach.addPractice(data);
      if (ref?.id) go("practices", "library", ref.id);
    } catch (e) {
      toast("Couldn't create — " + (e.message || "check rules."));
    }
  };

  // ── Home: today's session + the three section banners ──
  if (nav.section === "home") {
    return (
      <div className="pt-4 pb-4 space-y-5">
        <div className="px-5">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">
            Today
          </h3>
          {todayPractice ? (
            <button
              onClick={() => go("practices", "library", todayPractice.id)}
              className="w-full text-left rounded-xl p-4 shadow-card bg-brand-primary"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-brand-accent">
                {todayEvent?.start ? formatHourTime(todayEvent.start) : "Today's session"}
              </div>
              <div className="text-lg font-bold text-white mt-0.5 leading-tight">
                {todayPractice.name}
              </div>
              <div className="text-xs text-white/70 mt-0.5">
                {todayPractice.blocks?.length || 0} drill
                {(todayPractice.blocks?.length || 0) === 1 ? "" : "s"}
                {todayPractice.cat ? ` · ${todayPractice.cat}` : ""}
              </div>
            </button>
          ) : (
            <div className="rounded-xl p-5 border border-dashed border-[var(--th-surface-2)] bg-[var(--th-surface)] text-center">
              <p className="text-sm text-ink-soft font-medium">No practice scheduled today.</p>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Assign a program to drop sessions onto the calendar.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 space-y-3">
          <SectionBanner
            icon={Target}
            title="Drills"
            count={`${coach.drills.length} drill${coach.drills.length === 1 ? "" : "s"}`}
            onCreate={() => go("drills", "create")}
            onLibrary={() => go("drills", "library")}
          />
          <SectionBanner
            icon={Layers}
            title="Practices"
            count={`${coach.practices.length} practice${
              coach.practices.length === 1 ? "" : "s"
            }`}
            onCreate={() => go("practices", "create")}
            onLibrary={() => go("practices", "library")}
          />
          <SectionBanner
            icon={Goal}
            title="Programs"
            count={`${coach.programs.length} program${coach.programs.length === 1 ? "" : "s"}`}
            onCreate={() => go("programs", "create")}
            onLibrary={() => go("programs", "library")}
          />
        </div>
      </div>
    );
  }

  // ── Section screens (back to home + the chosen view) ──
  const sectionTitle = { drills: "Drills", practices: "Practices", programs: "Programs" }[
    nav.section
  ];
  return (
    <div className="pt-3 pb-4">
      <div className="px-5 pb-3 flex items-center justify-between">
        <button
          onClick={home}
          className="text-xs font-semibold text-ink-faint flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Practice
        </button>
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          {sectionTitle}
          {nav.mode === "create" ? " · New" : ""}
        </span>
      </div>
      {nav.section === "drills" && (
        <DrillsPage user={user} coach={coach} startCreating={nav.mode === "create"} />
      )}
      {nav.section === "practices" && nav.mode === "create" && (
        <NewPracticeChooser coach={coach} onCreate={createPracticeFrom} />
      )}
      {nav.section === "practices" && nav.mode === "library" && (
        <PracticesView
          user={user}
          coach={coach}
          canEdit={isAdmin}
          initialOpenId={nav.openId}
          hideCreate
        />
      )}
      {nav.section === "programs" && (
        <ProgramsView
          user={user}
          coach={coach}
          canEdit={isAdmin}
          startCreating={nav.mode === "create"}
        />
      )}
    </div>
  );
}
