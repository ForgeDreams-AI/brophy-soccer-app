import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { ChevronLeft, Eye, Loader2, Shield } from "lucide-react";
import { auth } from "../firebase";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "../data/useAuth";
import { useAudienceCollection } from "../data/hooks";
import { COL } from "../data/collections";
import { APP_VERSION } from "../data/seeds/whatsNew";
import { useAppUpdate } from "../hooks/useAppUpdate";
import { onForegroundMessage } from "../lib/notifications";
import { toast } from "../lib/toast";
import { coachTabs, playerTabs, routeToTab } from "./tabs";
import { PAGES } from "./registry";
import { useConfirm, ConfirmProvider } from "../components/ui/ConfirmDialog";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import Toaster from "../components/ui/Toaster";
import { UpdateBanner, WhatsNewModal } from "../components/ui/UpdateBanner";
import WelcomeTour from "../components/WelcomeTour";
import LoginScreen, { EMAIL_FOR_SIGNIN_KEY } from "../auth/LoginScreen";
import NameGate from "../auth/NameGate";

const TOUR_SEEN_KEY = "teamhub_tour_seen_v2"; // bumped for the redesign
const LAST_SEEN_VERSION_KEY = "lastSeenVersion";

// ── App context ─────────────────────────────────────────────────────────
// Feature pages get { user } as a prop; this context covers the extras
// (preview mode, navigation) without prop drilling.
const AppContext = createContext(null);
export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() must be used inside <TeamHubApp>");
  return ctx;
};

// ── Lazy feature page with graceful "coming soon" ────────────────────────
const COMING_SOON_COPY = {
  homeAdmin: { title: "Home", body: "The coach dashboard is on its way." },
  homePlayer: { title: "Today", body: "Your daily home screen is on its way." },
  trainHub: { title: "Train", body: "The training hub is on its way." },
  gym: { title: "Gym", body: "Workouts are on their way." },
  nutrition: { title: "Nutrition", body: "Food logging is on its way." },
  videos: { title: "Videos", body: "The video library is on its way." },
  calendar: { title: "Schedule", body: "The schedule is on its way." },
  chat: { title: "Chat", body: "Team chat is on its way." },
  coach: { title: "Coach Center", body: "Practice planning is on its way." },
};

// One-shot deep-link parsing for startup: ?tab=X → { tab, trainView }.
// routeToTab already normalizes null/unknown values to home.
function initialRoute() {
  return routeToTab(new URLSearchParams(window.location.search).get("tab"));
}

function LazyPage({ pageKey, user, extraProps }) {
  // Plain lookup of the module-level pre-created components — stable
  // identity across renders, never created during render.
  const Page = PAGES[pageKey] || null;
  if (!Page) {
    const copy = COMING_SOON_COPY[pageKey] || { title: "Soon", body: "This section is on its way." };
    return (
      <div className="px-5 pt-6">
        <EmptyState title={copy.title} body={copy.body} />
      </div>
    );
  }
  return (
    <Suspense fallback={<Skeleton rows={4} className="px-5 pt-5" />}>
      <Page user={user} {...extraProps} />
    </Suspense>
  );
}

// ── Header ───────────────────────────────────────────────────────────────
function Header({ title, user, onAvatarClick, onPreview }) {
  const { team } = useTheme();
  return (
    <header className="sticky top-0 z-30 bg-[var(--th-surface)] border-b border-[var(--th-surface-2)] px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        <img src={team.assets.logo} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.18em] text-ink-faint leading-none uppercase">
            {team.shortName}
          </div>
          <h1 className="font-display font-bold text-[24px] leading-tight uppercase tracking-wide text-ink truncate">
            {title}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {user.role === "admin" && onPreview && (
          <button
            onClick={onPreview}
            aria-label="View as player"
            title="View as player"
            className="press w-9 h-9 rounded-full bg-[var(--th-surface-2)] text-brand-primary flex items-center justify-center"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        {user.role === "admin" && (
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-full text-white bg-brand-primary flex items-center gap-1">
            <Shield className="w-3 h-3" /> Coach
          </span>
        )}
        <button onClick={onAvatarClick} aria-label="Open settings" className="press rounded-full">
          <Avatar photoURL={user.photoURL} initials={user.initials} size={36} />
        </button>
      </div>
    </header>
  );
}

// ── Shell (inner — needs useConfirm, so ConfirmProvider sits above) ──────
function Shell() {
  const { team } = useTheme();
  const confirm = useConfirm();
  const { user, loading, error: authError, clearError } = useAuth();
  const [tab, setTab] = useState(() => initialRoute().tab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [trainView, setTrainView] = useState(() => initialRoute().trainView);
  const [showTour, setShowTour] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => {
    try {
      const last = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      return !!(last && last !== APP_VERSION);
    } catch {
      return false;
    }
  });

  const { updateReady, reload } = useAppUpdate();

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      /* private mode */
    }
  }, []);

  // One-shot per signed-in user: show the welcome tour on first sign-in
  // (per device). Derived during render with a previous-value guard instead
  // of an effect — the tour flag follows the user, not an external system.
  const [tourUid, setTourUid] = useState(null);
  if (user && user.uid !== tourUid) {
    setTourUid(user.uid);
    try {
      if (!localStorage.getItem(TOUR_SEEN_KEY)) setShowTour(true);
    } catch {
      /* private mode */
    }
  }
  const closeTour = () => {
    setShowTour(false);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  // Finish a magic-link sign-in when returning from email. Falls back to a
  // designed prompt (never window.prompt) when the link was opened on a
  // different device than the one that requested it.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    (async () => {
      let email = null;
      try {
        email = localStorage.getItem(EMAIL_FOR_SIGNIN_KEY);
      } catch {
        /* private mode */
      }
      if (!email) {
        email = await confirm.prompt({
          title: "Finish signing in",
          label: "Confirm the email this link was sent to",
          placeholder: "you@example.com",
          confirmLabel: "Continue",
        });
      }
      if (!email) return;
      try {
        await signInWithEmailLink(auth, email, window.location.href);
        try {
          localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY);
        } catch {
          /* private mode */
        }
        window.history.replaceState({}, "", "/");
      } catch (e) {
        console.error("email-link sign-in failed:", e);
        toast("Couldn't finish sign-in — " + (e.message || "link expired."));
      }
    })();
  }, [confirm]);

  // Startup deep-link (?tab=X) is applied via the lazy state initializers
  // above. This effect only cleans the URL afterwards and subscribes to
  // notification taps — the setState calls inside the message handler are
  // event-driven, so nothing here sets state synchronously in the effect.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if ("serviceWorker" in navigator) {
      const handler = (e) => {
        if (e.data?.type === "deeplink") {
          try {
            const url = new URL(e.data.link, window.location.origin);
            const t = new URLSearchParams(url.search).get("tab");
            if (t) {
              const { tab: nt, trainView: ntv } = routeToTab(t);
              setTab(nt);
              setTrainView(ntv);
            }
          } catch {
            /* malformed link — ignore */
          }
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

  // Foreground push — surface as a system notification while the app is open.
  useEffect(() => {
    if (!user) return;
    return onForegroundMessage((payload) => {
      const n = payload.notification || {};
      try {
        new Notification(n.title || team.pushTitle, { body: n.body, icon: team.assets.logo });
      } catch {
        /* permission revoked since enable — ignore */
      }
    });
  }, [user, team]);

  // Chat unread badge (shell chrome — mirrors the v1 root messages listener).
  const messages = useAudienceCollection(user ? COL.messages : null, user, "createdAt");
  const chatUnread = useMemo(
    () => messages.filter((m) => m.senderUid !== user?.uid && !m.readBy?.[user?.uid]).length,
    [messages, user],
  );

  const goTab = useCallback((id) => {
    setTrainView(null);
    setTab(id);
  }, []);

  const openTrain = useCallback((sub) => {
    setTrainView(sub || null);
    setTab("train");
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen min-h-dvh flex flex-col items-center justify-center gap-4 bg-brand-primary">
        <img src={team.assets.logo} alt="" className="w-20 h-20 object-contain" />
        <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
      </div>
    );
  }
  if (!user) return <LoginScreen externalError={authError} clearExternalError={clearError} />;

  // Force a real first+last name before using the app (auto name = email prefix).
  const emailPrefix = (user.email || "").split("@")[0];
  const needsProfile =
    !user.name || user.name.trim() === emailPrefix || !user.name.trim().includes(" ");
  if (needsProfile) return <NameGate user={user} onDone={() => window.location.reload()} />;

  // "View as player" preview — a coach drops their effective role to player
  // to see exactly what the team sees. Identity (uid/name) stays real.
  const realIsAdmin = user.role === "admin";
  const effUser = previewAsPlayer && realIsAdmin ? { ...user, role: "player" } : user;

  const tabs = effUser.role === "admin" ? coachTabs : playerTabs;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "home";
  const title = (tabs.find((t) => t.id === activeTab) || tabs[0]).title;
  const isAdmin = effUser.role === "admin";

  const SettingsModal = settingsOpen ? PAGES.settings || null : null;

  const appValue = {
    user: effUser,
    realUser: user,
    isAdmin,
    isPreviewing: previewAsPlayer && realIsAdmin,
    exitPreview: () => setPreviewAsPlayer(false),
    openSettings: () => setSettingsOpen(true),
    goTab,
    openTrain,
  };

  const renderMain = () => {
    if (activeTab === "home") {
      return <LazyPage pageKey={isAdmin ? "homeAdmin" : "homePlayer"} user={effUser} />;
    }
    if (activeTab === "train") {
      if (trainView) {
        return (
          <div>
            <div className="px-5 pt-4 pb-1">
              <button
                onClick={() => setTrainView(null)}
                className="press text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Train
              </button>
            </div>
            <LazyPage pageKey={trainView} user={effUser} />
          </div>
        );
      }
      return <LazyPage pageKey="trainHub" user={effUser} extraProps={{ onPick: setTrainView }} />;
    }
    if (activeTab === "practice" && isAdmin) {
      return <LazyPage pageKey="coach" user={effUser} />;
    }
    if (activeTab === "calendar") return <LazyPage pageKey="calendar" user={effUser} />;
    if (activeTab === "messages") return <LazyPage pageKey="chat" user={effUser} />;
    return null;
  };

  return (
    <AppContext.Provider value={appValue}>
      <div
        className="min-h-screen min-h-dvh flex justify-center relative"
        style={{ backgroundColor: "var(--th-primary-deep)" }}
      >
        {/* Brand wallpaper: team photo under a navy tint */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url('${team.assets.loginBg}')` }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "color-mix(in srgb, var(--th-primary) 85%, transparent)" }}
          aria-hidden="true"
        />

        <Toaster />

        {/* Fixed-inset app shell: definite viewport height (top/bottom 0) that
            iOS lays out reliably — flex column, internal-scroll <main>, and an
            in-flow bottom nav that can't scroll away. */}
        <div
          className="w-full shadow-2xl flex flex-col z-10"
          style={{
            position: "fixed",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            margin: "0 auto",
            maxWidth: "28rem",
            backgroundColor: "var(--th-bg)",
          }}
        >
          {updateReady && <UpdateBanner onReload={reload} />}
          <Header
            title={title}
            user={effUser}
            onAvatarClick={() => setSettingsOpen(true)}
            onPreview={realIsAdmin && !previewAsPlayer ? () => { setPreviewAsPlayer(true); goTab("home"); } : undefined}
          />

          {settingsOpen && SettingsModal && (
            <Suspense fallback={null}>
              <SettingsModal
                user={user}
                onClose={() => setSettingsOpen(false)}
                onSignOut={() => signOut(auth)}
                onReplayTour={() => {
                  setSettingsOpen(false);
                  setShowTour(true);
                }}
                onWhatsNew={() => {
                  setSettingsOpen(false);
                  setWhatsNewOpen(true);
                }}
              />
            </Suspense>
          )}
          {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
          <WelcomeTour open={showTour} role={effUser.role} onClose={closeTour} />

          {previewAsPlayer && realIsAdmin && (
            <button
              onClick={() => setPreviewAsPlayer(false)}
              className="press w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-[0.14em] bg-brand-accent text-[var(--th-primary-deep)]"
            >
              <Eye className="w-3.5 h-3.5" /> Viewing as a player — tap to exit
            </button>
          )}

          <main className="flex-1 min-h-0 overflow-y-auto pb-4">{renderMain()}</main>

          <nav
            className="flex-shrink-0 w-full bg-[var(--th-surface)] border-t border-[var(--th-surface-2)] z-20"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            aria-label="Primary"
          >
            <div
              className="grid px-1 pt-2"
              style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            >
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                const badge = t.id === "messages" ? chatUnread : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => goTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    className="press flex flex-col items-center justify-center py-1.5 gap-1"
                  >
                    <span className="relative">
                      <Icon
                        className="w-[22px] h-[22px]"
                        style={{ color: active ? "var(--th-accent)" : "var(--th-ink-3)" }}
                        fill={active ? "var(--th-accent)" : "none"}
                        strokeWidth={active ? 2.5 : 2}
                      />
                      {badge > 0 && (
                        <span
                          className="absolute -top-1.5 -right-2.5 text-[11px] font-bold text-white rounded-full px-1 min-w-[17px] h-[17px] flex items-center justify-center leading-none border-2 border-[var(--th-surface)] tabular"
                          style={{ backgroundColor: "var(--th-danger)" }}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: active ? "var(--th-accent)" : "var(--th-ink-3)" }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </AppContext.Provider>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────
export default function TeamHubApp() {
  return (
    <ConfirmProvider>
      <Shell />
    </ConfirmProvider>
  );
}
