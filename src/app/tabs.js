import { Home, ClipboardList, CalendarDays, Dumbbell, MessageCircle } from "lucide-react";

// Bottom-nav tab definitions. Coaches get the Coach Center tab; players
// don't. Train sub-views (gym | nutrition | videos) live under the Train hub.
export const coachTabs = [
  { id: "home", label: "Home", icon: Home, title: "Home" },
  { id: "practice", label: "Coach", icon: ClipboardList, title: "Coach Center" },
  { id: "calendar", label: "Schedule", icon: CalendarDays, title: "Schedule" },
  { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
  { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
];

export const playerTabs = [
  { id: "home", label: "Today", icon: Home, title: "Today" },
  { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
  { id: "calendar", label: "Schedule", icon: CalendarDays, title: "Schedule" },
  { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
];

export const TRAIN_VIEWS = ["gym", "nutrition", "videos"];
export const ALL_TAB_IDS = ["home", "practice", "calendar", "train", "messages"];

// Normalize a deep-link / notification tap into { tab, trainView }.
// Legacy tabs (gym | nutrition | videos) route into the Train hub so old
// links keep working. Unknown tabs fall back to home.
export function routeToTab(tab, sub = null) {
  const t = String(tab || "home").toLowerCase();
  if (TRAIN_VIEWS.includes(t)) return { tab: "train", trainView: t };
  if (ALL_TAB_IDS.includes(t)) {
    return {
      tab: t,
      trainView: t === "train" && TRAIN_VIEWS.includes(sub) ? sub : null,
    };
  }
  return { tab: "home", trainView: null };
}
