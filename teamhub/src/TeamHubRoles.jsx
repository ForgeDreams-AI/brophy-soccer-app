import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, Eye, Home, MessageCircle } from "lucide-react";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db, storage } from "./firebase";
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { useAuth } from "./hooks/useAuth";
import { isLoading, useAudienceCollection, useCollection, useDoc } from "./hooks/useCollection";
import { onForegroundMessage, refreshPushToken, syncAppBadge } from "./lib/notifications";
import { toast } from "./lib/toast";
import { teamDateKey, zonedDate } from "./lib/dates";
import WelcomeTour from "./WelcomeTour";
import { DEFAULT_TEAM_ID, TEAMS, TEAM_IDS, getTeam, getTeamShortName, isValidTeamId, teamDocFields } from "./data/teams";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useFirestoreResync, useFirestoreStale } from "./hooks/useFirestoreResync";
import { UpdateBanner } from "./components/UpdateUI";
import { LatestGameCard } from "./components/GameStats";
import { normalizeDrillDoc } from "./lib/drillDoc";
import { isLockedOutRole } from "./lib/teamRoles";
import { MessagesPage } from "./app/chat";
import { SIGN_CONSENT_VERSION, sha256Hex } from "./app/documents";
import { HomePage, MaxesContext, MaxesSheet, PlayerTodayPage, PushPrompt, TrainHub } from "./app/home";
import { NameGate, SettingsModal } from "./app/settings";
import { Avatar, COLORS, EMAIL_FOR_SIGNIN_KEY, EMPTY_OBJ, Header, LIBRARY_MIME_BY_EXT, LoginScreen, NoAccessScreen, TOUR_SEEN_KEY, TRAIN_VIEWS, TeamSwitcher, Toaster, audienceKeysFor, commitInChunks, deleteStorageFile, formatAgo, formatDayKey, isStaffRole, normalizeWellness, readinessFor, reportError, signOutUser, uploadFacePhoto, uploadStamp } from "./app/shared";

// Big screens load on demand (F81 code-splitting): the first screen opens
// faster, and each of these arrives the first time it's opened.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const CalendarPage = named(() => import("./app/calendar"), "CalendarPage");
const CoachCenterPage = named(() => import("./app/coach"), "CoachCenterPage");
const GymPage = named(() => import("./app/gym"), "GymPage");
const LibraryPage = named(() => import("./app/library"), "LibraryPage");
const VideosPage = named(() => import("./app/library"), "VideosPage");
const NutritionPage = named(() => import("./app/nutrition"), "NutritionPage");
const ScreenLoading = () => (
  <div className="flex items-center justify-center py-16 text-sm text-slate-400 gap-2">
    <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> Loading…
  </div>
);


/* ─── MAIN ─── */
export default function TeamHubRolesApp() {
  const { user, loading, error: authError, clearError } = useAuth();

  // ── Teams (Brophy: JVB + JVA + Varsity under one account) ──────────────
  // A user belongs to one or more teams (user.teamIds, user.primaryTeamId).
  // Players see only their own team; a coach sees their team(s); an orgAdmin
  // sees all three and switches between them. `activeTeamId` is the team
  // every team-scoped query and write below is filtered/stamped by.
  const myTeamIds = useMemo(() => {
    if (!user) return [];
    if (user.role === "orgAdmin") return [...TEAM_IDS];
    const ids = (user.teamIds || []).filter(isValidTeamId);
    if (ids.length) return ids;
    return [user.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId);
  }, [user]);
  const isCoach = user?.role === "admin" || user?.role === "orgAdmin";
  // Locked-out accounts (today: drillBuilder — drill-library-only accounts)
  // never see the app shell: the early return below renders NoAccessScreen
  // instead, and every subscription in this component is skipped with a
  // null collection (lockedOut ? null : ...), so no team data is fetched
  // behind the lock screen. Firestore rules fail closed anyway; this is
  // the UX lock. Defined here, before the first subscription.
  const lockedOut = Boolean(user) && isLockedOutRole(user.role);
  // No subscriptions until someone is signed in (and never for a locked-out
  // role). Listening while signed out was denied by the rules, popped a
  // "Some data couldn't load" toast on the login screen, and those dead
  // listeners did not restart after sign-in.
  const noData = !user || lockedOut;
  // A per-team coach (role 'admin' only — NOT the org admin). DMs are
  // between a player and their own team's coach, so the org admin never
  // subscribes to DM threads (decision 2026-11-08).
  const isTeamCoach = user?.role === "admin";
  const visibleTeams = useMemo(() => TEAMS.filter((t) => myTeamIds.includes(t.id)), [myTeamIds]);
  const canSeeMultipleTeams = visibleTeams.length > 1;
  // The user's preferred team, persisted per device so a returning user lands
  // on the team they were viewing. `activeTeamId` is derived during render
  // (never corrected in an effect): if the saved preference isn't one of the
  // user's teams (e.g. saved before a role change), fall back to their first
  // team. Deriving during render keeps this lint-clean
  // (react-hooks/set-state-in-effect).
  const [preferredTeamId, setPreferredTeamId] = useState(() => {
    try {
      const saved = localStorage.getItem("activeTeamId");
      return isValidTeamId(saved) ? saved : null;
    } catch { return null; }
  });
  const activeTeamId = myTeamIds.includes(preferredTeamId)
    ? preferredTeamId
    : (myTeamIds[0] || DEFAULT_TEAM_ID);
  useEffect(() => {
    try { localStorage.setItem("activeTeamId", activeTeamId); } catch { /* private mode */ }
  }, [activeTeamId]);

  // One-time, idempotent seed of the `teams/{teamId}` docs (name, short name,
  // level, coachUids) for the teams this user can see. A coach may create
  // their own team's doc if it's missing; only an org admin may change one —
  // see firestore.rules. Runs once per session for coaches/admins.
  const teamsSeededRef = useRef(false);
  useEffect(() => {
    if (!user || !isCoach || teamsSeededRef.current) return;
    teamsSeededRef.current = true;
    (async () => {
      try {
        for (const t of visibleTeams) {
          const ref = doc(db, "teams", t.id);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            await setDoc(ref, { ...teamDocFields(t), createdAt: serverTimestamp() });
          }
        }
      } catch {
        teamsSeededRef.current = false; // retry on a later render
      }
    })();
  }, [user, isCoach, visibleTeams]);
  // Deep link (?tab=X from a notification or shared link) picks the first tab.
  // Gym/Nutrition/Videos live under the Train hub.
  const initialTab = (() => { try { return new URLSearchParams(window.location.search).get("tab") || ""; } catch { return ""; } })();
  const [tab, setTab] = useState(() => (TRAIN_VIEWS.includes(initialTab) ? "train" : initialTab || "home"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [trainView, setTrainView] = useState(() => (TRAIN_VIEWS.includes(initialTab) ? initialTab : null)); // Train sub-page: gym | nutrition | videos
  // Opened from a chat link to a document / folder: { folder, docId, at }.
  // `at` re-keys the Documents page so each tap lands fresh on that spot.
  const [libraryFocus, setLibraryFocus] = useState(null);
  // Coach Center → Game Stats opened on one game (live banner / push link
  // "?tab=practice&game=<id>"). `at` re-keys Coach Center so it opens fresh.
  const [statsFocus, setStatsFocus] = useState(() => {
    try { const g = new URLSearchParams(window.location.search).get("game"); return g ? { gameId: g, at: 1 } : null; } catch { return null; }
  });
  const openGameStats = (gameId) => { setStatsFocus({ gameId, at: Date.now() }); setTab("practice"); };
  const [videoFocus, setVideoFocus] = useState(null);
  // A Train link tapped in chat: documents / document folders open Train →
  // Documents, videos / video folders open Train → Videos.
  const openFromChat = (a = {}) => {
    if (a.type === "videoLink" || a.type === "videoFolder") {
      setVideoFocus({ cat: a.cat || "", subfolder: a.subfolder || "", videoId: a.type === "videoLink" ? (a.videoId || "") : "", at: Date.now() });
      setTrainView("videos");
    } else {
      setLibraryFocus({ folder: a.folder || "", docId: a.type === "doc" ? (a.docId || "") : "", at: Date.now() });
      setTrainView("library");
    }
    setTab("train");
  };
  const [showTour, setShowTour] = useState(false);
  // First-login welcome tour, once per device (localStorage). Derived during
  // render instead of set from an effect.
  const [tourSeen, setTourSeen] = useState(() => { try { return Boolean(localStorage.getItem(TOUR_SEEN_KEY)); } catch { return true; } });
  const tourOpen = showTour || (Boolean(user) && !tourSeen);
  // Offer a refresh when a newer build is deployed while the app is open.
  const { updateReady, reload } = useAppUpdate();
  // Automatic live-data recovery: re-sync Firestore whenever the app comes
  // back to the foreground, so a stream killed while the app was backgrounded
  // never leaves chat and everything else frozen. Fully automatic — the
  // header Refresh button is only a backup.
  const { resync: resyncFirestore, syncing: firestoreSyncing } = useFirestoreResync();
  const firestoreStale = useFirestoreStale();

  // First-login welcome tour. "Seen" is tracked per-device in localStorage, so
  // it auto-runs once and never nags again (no backend/rules change needed).
  // Bump the key suffix to re-show the tour to everyone after a big update.
  const closeTour = () => {
    setShowTour(false); setTourSeen(true);
    try { localStorage.setItem(TOUR_SEEN_KEY, "1"); } catch { /* private mode */ }
  };

  // Shared face-photo upload for the welcome tour and the Home nudge.
  // Same flow as Settings: downscale, store under avatars/{uid}/{ts}.jpg,
  // save photoURL + photoPath on the user's doc. Returns the URL (or null).
  // On failure it toasts and throws the same message, so the caller can
  // show the reason inline instead of failing silently.
  const uploadOwnPhoto = async (file) => {
    if (!file || !user) return null;
    try {
      const oldPath = user.photoPath;
      const { snap, path } = await uploadFacePhoto(`avatars/${user.uid}/${Date.now()}`, file, 640, 0.85);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, photoPath: path });
      if (oldPath && oldPath !== path && oldPath.startsWith(`avatars/${user.uid}/`)) deleteStorageFile(oldPath);
      toast("Photo added.");
      return url;
    } catch (e) {
      const msg = "Couldn't add photo. " + (e.message || "Try again.");
      toast(msg);
      throw new Error(msg, { cause: e });
    }
  };

  // Returning from a magic-link email: finish the sign-in. If the link was
  // opened on a different device/browser (no stored email), LoginScreen asks
  // for the email inline instead of a blocking window.prompt.
  const [emailLinkPending, setEmailLinkPending] = useState(() => {
    try { return isSignInWithEmailLink(auth, window.location.href); } catch { return false; }
  });
  const completeEmailLink = async (email) => {
    await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
    try { localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY); } catch { /* private mode */ }
    window.history.replaceState({}, "", "/");
    setEmailLinkPending(false);
  };
  useEffect(() => {
    if (!emailLinkPending) return;
    let email = "";
    try { email = localStorage.getItem(EMAIL_FOR_SIGNIN_KEY) || ""; } catch { /* private mode */ }
    if (!email) return; // LoginScreen shows the confirm-email form
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        try { localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY); } catch { /* private mode */ }
        window.history.replaceState({}, "", "/");
        setEmailLinkPending(false);
      })
      .catch((e) => {
        console.error("email-link sign-in failed:", e);
        toast("Couldn't finish sign-in — " + (e.message || "link expired."));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link to the right tab when arriving via ?tab=X or notification click.
  // Workouts/Nutrition/Videos no longer have their own tabs — route those to
  // the Train hub with the matching sub-view so old links keep working.
  const routeToTab = (t) => {
    if (TRAIN_VIEWS.includes(t)) {
      setTrainView(t);
      setTab("train");
    } else {
      setTab(t);
    }
  };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if ("serviceWorker" in navigator) {
      const handler = (e) => {
        if (e.data?.type === "deeplink") {
          const url = new URL(e.data.link, window.location.origin);
          const sp = new URLSearchParams(url.search);
          const t = sp.get("tab");
          if (sp.get("game")) openGameStats(sp.get("game"));
          else if (t) routeToTab(t);
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      return () => navigator.serviceWorker.removeEventListener("message", handler);
    }
  }, []);

  // Foreground messages (app open): show an in-app banner that slides down
  // from the top, like a phone notification. (Phones don't allow
  // new Notification() from a page, so the old code showed nothing.) Tapping
  // it goes where the notification points. A chat message isn't bannered
  // while you're already in Chat.
  const [inAppBanner, setInAppBanner] = useState(null);
  const activeTabRef = useRef(null);
  useEffect(() => { activeTabRef.current = tab; }, [tab]);
  useEffect(() => {
    if (!user || lockedOut) return;
    return onForegroundMessage((payload) => {
      const n = payload.notification || {};
      const d = payload.data || {};
      const link = d.link || payload.fcmOptions?.link || "/";
      const sp = new URLSearchParams(new URL(link, window.location.origin).search);
      const tab = sp.get("tab");
      const game = sp.get("game");
      if (tab === "messages" && activeTabRef.current === "messages") return;
      try { navigator.vibrate?.(30); } catch { /* not supported */ }
      setInAppBanner({ id: Date.now(), title: n.title || d.title || "Brophy Soccer", body: n.body || d.body || "", tab, game });
    });
  }, [user, lockedOut]);
  useEffect(() => {
    if (!inAppBanner) return undefined;
    const t = setTimeout(() => setInAppBanner(null), 5000);
    return () => clearTimeout(t);
  }, [inAppBanner]);
  // Keep this device's push token current (silently, once per open).
  useEffect(() => {
    if (user?.uid && !lockedOut) refreshPushToken(user.uid);
  }, [user?.uid, lockedOut]);

  // Live from Firestore — see Build Guide §4 + §8
  const announcements = useCollection(noData ? null : ("announcements"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addAnnouncement = (title, body) =>
    addDoc(collection(db, "announcements"), {
      teamId: activeTeamId,
      title: title.trim(),
      body: (body || "").trim(),
      pinned: false,
      createdAt: serverTimestamp(),
    });

  // Team-scoped app prompts + branding: one doc per kind PER TEAM
  // (`profilePrompt_{teamId}`, `lineupLogo_{teamId}`) so a coach of one team
  // can't change another team's settings (firestore.rules appConfig). The
  // legacy global docs are still read as a fallback until each team sets its own.
  const appConfig = useCollection(noData ? null : ("appConfig"));
  const profilePrompt = appConfig.find((d) => d.id === `profilePrompt_${activeTeamId}`)
    || appConfig.find((d) => d.id === "profilePrompt");
  // Team logo used as the centered watermark on every game-day line-up.
  const lineupLogo = appConfig.find((d) => d.id === `lineupLogo_${activeTeamId}`)
    || appConfig.find((d) => d.id === "lineupLogo");
  // Game Stats stat keepers (appConfig/statKeepers_<team>): uids allowed to
  // record games + a roster snapshot their phones use (see GameStats).
  const statKeepers = appConfig.find((d) => d.id === `statKeepers_${activeTeamId}`) || null;
  const isStatKeeper = Boolean(user && (user.role === "statistician" || (statKeepers?.uids || []).includes(user.uid)));
  const setStatKeepers = (uids, roster) =>
    setDoc(doc(db, "appConfig", `statKeepers_${activeTeamId}`), { uids, roster, updatedByName: user.name, updatedAt: new Date().toISOString() });
  // Coach-set positions for the roster (see PlayersByPosition).
  const positionsByUid = appConfig.find((d) => d.id === `rosterPositions_${activeTeamId}`)?.byUid || EMPTY_OBJ;
  const setPlayerPosition = (uid, pos) =>
    setDoc(doc(db, "appConfig", `rosterPositions_${activeTeamId}`), { byUid: { [uid]: pos }, updatedByName: user.name }, { merge: true });
  const setLineupLogo = async (url, path) => {
    const oldPath = lineupLogo?.path;
    await setDoc(doc(db, "appConfig", `lineupLogo_${activeTeamId}`), { url: url || "", path: path || "", updatedByName: user.name }, { merge: true });
    if (oldPath && oldPath !== path && oldPath.startsWith(`branding/${user.uid}/`)) deleteStorageFile(oldPath);
  };
  const requestProfileUpdate = async () => {
    await setDoc(doc(db, "appConfig", `profilePrompt_${activeTeamId}`), { requestedAt: new Date().toISOString(), byName: user.name }, { merge: true });
    // Reuse the announcement fan-out so it also lands as a push to everyone.
    await addAnnouncement("Update your profile", "Please add your full name so the team roster shows who's who. Tap Update now or open Settings.");
  };
  const togglePinAnnouncement = (id, pinned) =>
    updateDoc(doc(db, "announcements", id), { pinned: !pinned });
  const updateAnnouncement = (id, { title, body }) =>
    updateDoc(doc(db, "announcements", id), { title: title.trim(), body: (body || "").trim() });
  const deleteAnnouncement = (id) => deleteDoc(doc(db, "announcements", id));

  const eventsRaw = useAudienceCollection(noData ? null : ("events"), user, null, activeTeamId);
  const groupsList = useCollection(noData ? null : ("groups"), where("teamId", "==", activeTeamId), orderBy("name"));
  // Admin-only view of signed-in players for the Groups picker. Defer the
  // listener until the user is known + actually an admin (rules deny otherwise).
  // Roster for the active team only (a coach picks players from their own
  // team; the org admin switches teams to see the others).
  // Stat keepers / statisticians load it too, so the Game Stats tracker has
  // the roster (and subs) on their phone — the rules let any team member
  // list their own team's people.
  const allUsersRaw = useCollection(
    noData ? null : (isCoach || isStatKeeper ? "users" : null),
    where("teamIds", "array-contains", activeTeamId),
    orderBy("name"),
  );
  // Games being tracked right now (by anyone — usually a stat keeper), so the
  // coach's Home shows a LIVE card and Game Stats fills in as they tap.
  const liveGames = useCollection(noData || !isCoach ? null : "games", where("teamId", "==", activeTeamId), where("status", "==", "live"));
  const invitesRaw = useCollection(noData || !isCoach ? null : ("invitedEmails"), where("teamId", "==", activeTeamId), orderBy("email"));
  // An invite marked Coach wins over an account still saying "player" (the
  // account was made before the invite was changed). People lists treat them
  // as a coach right away; the program admin's app also fixes the account
  // (below), which is what actually unlocks coach tools for them.
  const allUsers = useMemo(() => {
    const coachEmails = new Set((invitesRaw || []).filter((i) => i.role === "admin").map((i) => (i.email || i.id || "").toLowerCase()));
    if (!coachEmails.size) return allUsersRaw;
    const out = allUsersRaw.map((u) => (u.role === "player" && coachEmails.has((u.email || "").toLowerCase()) ? { ...u, role: "admin", roleFromInvite: true } : u));
    return Object.assign(out, allUsersRaw.loading ? { loading: true } : {});
  }, [allUsersRaw, invitesRaw]);
  useEffect(() => {
    if (user?.role !== "orgAdmin") return;
    const fix = allUsers.filter((u) => u.roleFromInvite);
    fix.forEach((u) => updateDoc(doc(db, "users", u.id), { role: "admin" })
      .then(() => console.info(`Role synced to coach for ${u.email}`))
      .catch((e) => console.warn("role sync failed", u.email, e?.code)));
  }, [allUsers, user?.role]);
  // Org-admin-only view of EVERY signed-in user across all three teams, for
  // the Settings admin model (§10): the program admin manages roles and team
  // assignments here. A team coach never subscribes (rules deny otherwise).
  const orgUsers = useCollection(
    noData ? null : (user?.role === "orgAdmin" ? "users" : null),
    orderBy("name"),
  );
  const events = useMemo(() => {
    if (!user) return eventsRaw;
    if (user.role === "admin") return eventsRaw;
    // Group membership stores uids (preferred). Falls back to emails for
    // players added before they signed in once.
    const myGroupIds = new Set(
      groupsList
        .filter((g) => {
          const m = g.memberUids || [];
          return m.includes(user.uid) || m.includes(user.email);
        })
        .map((g) => g.id),
    );
    return eventsRaw.filter((e) => {
      const v = e.visibleTo;
      if (!v) return true;
      const directList = v.uids || v.emails || []; // accept either name
      const groupIds = v.groupIds || [];
      if (directList.length === 0 && groupIds.length === 0) return true;
      if (directList.includes(user.uid) || directList.includes(user.email)) return true;
      return groupIds.some((id) => myGroupIds.has(id));
    });
  }, [eventsRaw, user, groupsList]);
  // Keep `audienceKeys` in sync whenever an event's visibility is set/changed.
  const withEventAudience = (data) =>
    Object.prototype.hasOwnProperty.call(data, "visibleTo")
      ? { ...data, audienceKeys: audienceKeysFor(data.visibleTo, groupsList) }
      : data;
  const addEvent = (data) =>
    addDoc(collection(db, "events"), {
      ...data,
      teamId: activeTeamId,
      audienceKeys: audienceKeysFor(data.visibleTo, groupsList),
      createdAt: serverTimestamp(),
    });
  const updateEvent = (id, data) => updateDoc(doc(db, "events", id), withEventAudience(data));
  const deleteEvent = (id) => deleteDoc(doc(db, "events", id));
  const importEvents = async (rows, { notify = true } = {}) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "events")), {
      ...r,
      // Absolute start (team time) so the reminder function can schedule the
      // 1-hour and 7 AM pings for imported / program-assigned sessions too.
      startAt: r.startAt || zonedDate(r.date, r.start),
      teamId: activeTeamId,
      audienceKeys: audienceKeysFor(r.visibleTo, groupsList),
      createdAt: serverTimestamp(),
      ...(notify ? {} : { notify: false }),
    }));
    await batch.commit();
  };

  // Personal events — own subcollection, never seen by others.
  const personalPath = user ? `users/${user.uid}/personalEvents` : null;
  const personalEvents = useCollection(noData ? null : (personalPath));
  const addPersonalEvent = (data) =>
    addDoc(collection(db, personalPath), { ...data, createdAt: serverTimestamp() });
  const updatePersonalEvent = (id, data) =>
    updateDoc(doc(db, personalPath, id), data);
  const deletePersonalEvent = (id) => deleteDoc(doc(db, personalPath, id));

  // Groups — admin manages, signed-in reads for the event visibility filter.
  const addGroup = (name) =>
    addDoc(collection(db, "groups"), {
      teamId: activeTeamId,
      name: name.trim(),
      memberUids: [],
      createdBy: user.name,
      createdAt: serverTimestamp(),
    });
  const updateGroupMembers = async (id, memberUids) => {
    await updateDoc(doc(db, "groups", id), { memberUids });
    // Re-resolve audienceKeys on every event/channel addressed to this group
    // so server-side visibility tracks the new membership.
    const nextGroups = groupsList.map((g) => (g.id === id ? { ...g, memberUids } : g));
    const batch = writeBatch(db);
    let n = 0;
    eventsRaw.forEach((e) => {
      if ((e.visibleTo?.groupIds || []).includes(id)) {
        batch.update(doc(db, "events", e.id), { audienceKeys: audienceKeysFor(e.visibleTo, nextGroups) });
        n++;
      }
    });
    const affectedChannels = [];
    chatGroups.forEach((c) => {
      if ((c.visibleTo?.groupIds || []).includes(id)) affectedChannels.push(c);
    });
    if (n) await batch.commit();
    // Channels addressed to this group: re-stamp their messages FIRST, then
    // the channel (same order as updateChatGroup), so removed members lose
    // the history and added members gain it — enforced by the rules.
    for (const c of affectedChannels) {
      await restampChannel(c.id, audienceKeysFor(c.visibleTo, nextGroups), c.teamId || activeTeamId);
    }
  };
  // Re-stamp EVERY message of a channel with the channel's audience. Queried
  // from the server (not just the messages loaded in this session), so older
  // history outside the chat window is covered too.
  const restampChannel = async (channelId, audienceKeys, teamId) => {
    const snap = await getDocs(query(collection(db, "messages"), where("teamId", "==", teamId), where("channel", "==", channelId)));
    await commitInChunks(snap.docs, (b, d) => b.update(d.ref, { audienceKeys }));
    await updateDoc(doc(db, "chatGroups", channelId), { audienceKeys });
  };
  const deleteGroup = (id) => deleteDoc(doc(db, "groups", id));
  // Org admin: remove a player's profile (e.g. someone who joined by link).
  // Their sign-in stops working until they're invited again.
  const removeUser = (uid) => deleteDoc(doc(db, "users", uid));

  const videos = useCollection(noData ? null : ("videos"), orderBy("createdAt", "desc"));
  const addVideo = (data) =>
    addDoc(collection(db, "videos"), { ...data, createdAt: serverTimestamp() });
  const updateVideo = (id, data) => updateDoc(doc(db, "videos", id), data);
  const deleteVideo = (id) => deleteDoc(doc(db, "videos", id));
  const importVideos = async (rows) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "videos")), { ...r, createdAt: serverTimestamp() }));
    await batch.commit();
  };

  // Video folders (Videos & Links under Training): coach-created top-level
  // folders and subfolders. Shared across all three teams, like the videos
  // themselves (no teamId). A folder doc is { name, parent, createdAt }.
  // parent is null for a top-level folder, or the parent folder's name for
  // a subfolder. The six built-in folders (VIDEO_CATS) always show; custom
  // folders from here join them.
  const videoFolderDocs = useCollection(noData ? null : ("videoFolders"), orderBy("name"));
  const addVideoFolder = (name, parent) =>
    addDoc(collection(db, "videoFolders"), { name: name.trim(), parent: parent || null, createdAt: serverTimestamp() });
  const deleteVideoFolder = (id) => deleteDoc(doc(db, "videoFolders", id));
  // Renaming a folder moves everything filed under it: the videos in it and,
  // for a top-level folder, its subfolders are re-filed under the new name
  // in the same batch, so nothing is ever orphaned.
  // F54: the videos are found with a fresh query (not just the ones loaded
  // on this phone) and re-filed in chunks (no 500-write batch limit); the
  // folder doc is renamed last, and the Videos page also shows any folder a
  // video is filed under, so an interrupted rename never hides anything.
  const renameVideoFolder = async (folder, newName) => {
    const name = newName.trim();
    if (!folder.parent) {
      const vids = await getDocs(query(collection(db, "videos"), where("cat", "==", folder.name)));
      await commitInChunks(vids.docs, (b, d) => b.update(d.ref, { cat: name }));
      const kids = await getDocs(query(collection(db, "videoFolders"), where("parent", "==", folder.name)));
      await commitInChunks(kids.docs, (b, d) => b.update(d.ref, { parent: name }));
    } else {
      const vids = await getDocs(query(collection(db, "videos"), where("cat", "==", folder.parent)));
      const inSub = vids.docs.filter((d) => d.data().subfolder === folder.name);
      await commitInChunks(inSub, (b, d) => b.update(d.ref, { subfolder: name }));
    }
    await updateDoc(doc(db, "videoFolders", folder.id), { name });
  };

  // Shared documents library (Train → Documents): items for all teams plus
  // the active team's own. Coaches upload to Storage library/{scope}/{uid}/.
  const libraryItems = useCollection(noData ? null : ("libraryItems"), where("teamId", "in", ["all", activeTeamId]), orderBy("createdAt", "desc"));
  const addLibraryItem = async ({ kind, file, url, title, folder, desc, scope, notify }, onProgress) => {
    const teamId = scope === "all" ? "all" : activeTeamId;
    const base = { teamId, title, folder: folder || "", desc: desc || "", notify: Boolean(notify), createdByUid: user.uid, createdByName: user.name, createdAt: serverTimestamp() };
    if (kind === "link") return addDoc(collection(db, "libraryItems"), { ...base, kind: "link", url });
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const contentType = file.type || LIBRARY_MIME_BY_EXT[ext] || "application/octet-stream";
    const safe = file.name.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(0, 80) || "file";
    const path = `library/${teamId}/${user.uid}/${uploadStamp()}-${safe}`;
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType });
    await new Promise((resolve, reject) => task.on("state_changed",
      (s) => onProgress?.(Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100)), reject, resolve));
    const fileUrl = await getDownloadURL(task.snapshot.ref);
    return addDoc(collection(db, "libraryItems"), { ...base, kind: "file", url: fileUrl, path, name: file.name, fileType: contentType, size: file.size });
  };
  const updateLibraryItem = (id, data) => updateDoc(doc(db, "libraryItems", id), data);
  const deleteLibraryItem = (id) => deleteDoc(doc(db, "libraryItems", id));

  // Drill library — building blocks for the Practice page (same CRUD as videos).
  // ONE shared library: the `drillLibrary` collection is read and written by
  // this app AND the standalone Drill Library site — a drill made in either
  // shows up in both. The shared document shape lives in src/lib/drillDoc.js.
  // `createdByUid` is stamped on create: the drillLibrary rules require it.
  const drillsRaw = useCollection(noData ? null : ("drillLibrary"), orderBy("createdAt", "desc"));
  const drills = useMemo(() => drillsRaw.map(normalizeDrillDoc), [drillsRaw]);
  const addDrill = (data) =>
    addDoc(collection(db, "drillLibrary"), {
      ...data,
      createdAt: serverTimestamp(),
      createdByUid: user.uid,
      createdByName: user.name,
    });
  const updateDrill = (id, data) => updateDoc(doc(db, "drillLibrary", id), { ...data, updatedAt: serverTimestamp() });
  const deleteDrill = (id) => deleteDoc(doc(db, "drillLibrary", id));

  // Practices — saved sessions assembled from drills (mirrors teamWorkouts).
  const practices = useCollection(noData ? null : ("practices"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  // Accepts a plain name (string) or a full template object (blank / starter / copy).
  const addPractice = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "practices"), {
      desc: "", cat: "", blocks: [], published: false,
      createdByName: user.name, createdByUid: user.uid, createdAt: serverTimestamp(),
      ...base,
      teamId: activeTeamId,
      name: (base.name || "").trim(),
    });
  };
  const updatePractice = (id, data) => updateDoc(doc(db, "practices", id), data);
  const deletePractice = (id) => deleteDoc(doc(db, "practices", id));

  // Programs — ordered sequences of practices (dates assigned at assign-time).
  const programs = useCollection(noData ? null : ("programs"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  // Accepts a plain name (string) or a full object (copy / shared curriculum).
  const addProgram = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "programs"), {
      teamId: activeTeamId, name: (base.name || "").trim(), desc: base.desc || "", days: base.days || [],
      published: !!base.published, shared: !!base.shared,
      createdByUid: user.uid, createdByName: user.name, createdAt: serverTimestamp(),
    });
  };
  const updateProgram = (id, data) => updateDoc(doc(db, "programs", id), data);
  const deleteProgram = (id) => deleteDoc(doc(db, "programs", id));

  // Game-day starting line-ups — coach assembles players onto a pitch and
  // saves the "field" under a custom name (mirrors practices CRUD).
  const lineups = useCollection(noData ? null : ("lineups"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addLineup = (data) =>
    addDoc(collection(db, "lineups"), {
      teamId: activeTeamId,
      name: (data?.name || "").trim(), formation: data?.formation || "", slots: data?.slots || [],
      createdByName: user.name, createdAt: serverTimestamp(),
    });
  const updateLineup = (id, data) => updateDoc(doc(db, "lineups", id), data);
  const deleteLineup = (id) => deleteDoc(doc(db, "lineups", id));

  // Coach-authored exercises — mixed into the public Exercise Library, same
  // shape so they slot under the same equipment/muscle tags.
  const customExercises = useCollection(noData ? null : ("customExercises"), orderBy("createdAt", "desc"));
  const addCustomExercise = (data) =>
    addDoc(collection(db, "customExercises"), { ...data, createdAt: serverTimestamp() });
  const updateCustomExercise = (id, data) => updateDoc(doc(db, "customExercises", id), data);
  const deleteCustomExercise = (id) => deleteDoc(doc(db, "customExercises", id));
  // One-tap starter library — batch-writes the curated lift seed, skipping any
  // lift whose name already exists (additive; never disturbs existing exercises).
  const seedLifts = async () => {
    const { liftSeedDocs } = await import("./data/liftSeed");
    const have = new Set(customExercises.map((e) => (e.name || "").toLowerCase().trim()));
    const fresh = liftSeedDocs().filter((l) => !have.has(l.name.toLowerCase().trim()));
    if (!fresh.length) return { added: 0, skipped: liftSeedDocs().length };
    const batch = writeBatch(db);
    fresh.forEach((l) => batch.set(doc(collection(db, "customExercises")), { ...l, createdAt: serverTimestamp() }));
    await batch.commit();
    return { added: fresh.length, skipped: liftSeedDocs().length - fresh.length };
  };

  const recipeDocs = useCollection(noData ? null : ("recipes"), orderBy("createdAt", "desc"));
  const recipes = recipeDocs; // already shaped {id, name, cat, cal, p, c, f, prep, createdAt}
  const addRecipe = (data) =>
    addDoc(collection(db, "recipes"), { ...data, createdAt: serverTimestamp() });
  const updateRecipe = (id, data) => updateDoc(doc(db, "recipes", id), data);
  const deleteRecipe = (id) => deleteDoc(doc(db, "recipes", id));
  const importRecipes = async (rows) => {
    const batch = writeBatch(db);
    rows.forEach((r) => batch.set(doc(collection(db, "recipes")), { ...r, createdAt: serverTimestamp() }));
    await batch.commit();
  };

  const categoryDocs = useCollection(noData ? null : ("categories"), orderBy("name"));
  const categories = useMemo(() => categoryDocs.map((c) => c.name).filter(Boolean), [categoryDocs]);
  const addCategory = (name) =>
    addDoc(collection(db, "categories"), { name: name.trim() });
  // One-tap starter recipes — 20 whole-food recipes per meal category, filed by
  // food-type sub-category. De-dupes by name+category so it's safe to re-run and
  // never overwrites recipes you've already added.
  const seedRecipes = async () => {
    const { recipeSeedDocs } = await import("./data/recipeSeed");
    const key = (r) => `${(r.name || "").toLowerCase().trim()}|${(r.cat || "").toLowerCase().trim()}`;
    const have = new Set(recipes.map(key));
    const all = recipeSeedDocs();
    const fresh = all.filter((r) => !have.has(key(r)));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((r) => batch.set(doc(collection(db, "recipes")), { ...r, createdAt: serverTimestamp() }));
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  };

  // Wellness — guide §4 + §8 (one doc per player per day, ID = `${uid}_${date}`).
  // The three numbers share ONE direction: 1 = worst, 5 = ready to go
  // (Energy 1 = wiped out, Soreness 1 = very sore, Tiredness 1 = exhausted).
  // A readiness verdict (Ready / Modified / Rest) is stored on the doc at
  // submit time and normalized on read, so older docs still render.
  // "Today" on the team clock (America/Phoenix) — see lib/dates.js.
  const today = teamDateKey();
  // Coach-only: the whole team's check-ins (players' read rule only allows
  // their own doc, so players don't open this query at all).
  const wellnessRaw = useCollection(noData || !isCoach ? null : ("wellnessCheckins"), where("teamId", "==", activeTeamId), where("date", "==", today));
  const wellness = useMemo(
    () => wellnessRaw.map((w) => normalizeWellness({ ...w, time: formatAgo(w.updatedAt) })),
    [wellnessRaw],
  );
  const submitWellness = ({ energy, soreness, tiredness }) => {
    const verdict = readinessFor({ energy, soreness, tiredness });
    return setDoc(doc(db, "wellnessCheckins", `${user.uid}_${today}`), {
      teamId: activeTeamId,
      uid: user.uid,
      name: user.name,
      initials: user.initials,
      energy, soreness, tiredness, verdict,
      date: today,
      updatedAt: serverTimestamp(),
    });
  };

  // Food log — private subcollection per player (guide §4 + §5)
  const logsPath = user ? `logs/${user.uid}/entries` : null;
  // Most recent 400 entries — enough for today's totals, recents and a
  // year-long streak without downloading the whole history every launch.
  const logged = useCollection(noData ? null : (logsPath), orderBy("createdAt", "desc"), limit(400));
  const addLog = async (data) => {
    const ref = await addDoc(collection(db, logsPath), { ...data, createdAt: serverTimestamp() });
    // Bump the activity marker so coach compliance view sees this player today.
    setDoc(doc(db, "mealLogActivity", `${user.uid}_${today}`), {
      teamId: activeTeamId,
      uid: user.uid,
      date: today,
      lastLoggedAt: serverTimestamp(),
    }, { merge: true }).catch(reportError("Couldn't update today's meal check-in"));
    return ref;
  };
  const updateLog = (id, data) =>
    updateDoc(doc(db, logsPath, id), data);
  const deleteLog = (id) => deleteDoc(doc(db, logsPath, id));

  // Saved / favorite foods — private per player, for one-tap re-logging.
  const savedFoodsPath = user ? `logs/${user.uid}/savedFoods` : null;
  const savedFoods = useCollection(noData ? null : (savedFoodsPath), orderBy("createdAt", "desc"));
  const addSavedFood = (data) =>
    addDoc(collection(db, savedFoodsPath), { ...data, createdAt: serverTimestamp() });
  const deleteSavedFood = (id) => deleteDoc(doc(db, savedFoodsPath, id));

  // Water tracking — one doc per player per day.
  const waterDocId = user ? `${user.uid}_${today}` : null;
  const waterToday = useCollection(
    noData ? null : (user ? "water" : null),
    where("uid", "==", user?.uid || "_"),
    where("date", "==", today),
  );
  const waterCups = waterToday[0]?.cups || 0;
  const setWaterCups = (cups) =>
    setDoc(doc(db, "water", waterDocId), {
      uid: user.uid,
      date: today,
      cups: Math.max(0, cups),
      updatedAt: serverTimestamp(),
    }, { merge: true });

  // The player's OWN daily nutrition goal (calories + protein, optional).
  // No coach sets it — the player sets it for themselves if they want to,
  // and it lives in their private food-log area (logs/{uid}/goals/main).
  // The Today page and the nutrition hero only ever show the player their
  // own goal. (Path must be a valid Firestore document: an even number of
  // segments. logs/{uid}/goal has 3 and crashes the app on sign-in.)
  const myNutritionGoal = useDoc(noData ? null : (user ? `logs/${user.uid}/goals/main` : null));
  const saveMyNutritionGoal = ({ cal, protein }) =>
    setDoc(doc(db, "logs", user.uid, "goals", "main"), {
      cal: Number(cal) || 0,
      protein: Number(protein) || 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  const clearMyNutritionGoal = () => deleteDoc(doc(db, "logs", user.uid, "goals", "main"));
  const myNutritionTotals = useMemo(() => {
    const k = formatDayKey(new Date());
    return logged.filter((l) => formatDayKey(l.createdAt) === k)
      .reduce((a, l) => ({
        cal: a.cal + (Number(l.cal) || 0),
        protein: a.protein + (Number(l.p) || 0),
        c: a.c + (Number(l.c) || 0),
        f: a.f + (Number(l.f) || 0),
      }), { cal: 0, protein: 0, c: 0, f: 0 });
  }, [logged]);

  // Coach-only compliance view — players' read rule would deny these.
  const mealLogActivityToday = useCollection(
    noData ? null : (isCoach ? "mealLogActivity" : null),
    where("teamId", "==", activeTeamId),
    where("date", "==", today),
  );

  // Player "Today" completion signals — scoped to the current user so the
  // queries satisfy the per-owner read rules.
  const myWellnessDocs = useCollection(
    noData ? null : (user ? "wellnessCheckins" : null),
    where("uid", "==", user?.uid || "_"),
    where("date", "==", today),
  );
  // The player's own wellness doc for today (normalized to the new schema).
  // The per-user query finds it even if it was logged under another team,
  // since the doc id is `${uid}_${date}` (one wellness doc per player per day).
  const myWellnessToday = myWellnessDocs[0]
    ? normalizeWellness(myWellnessDocs[0])
    : (wellness.find((w) => w.uid === user?.uid) || null);
  const wellnessLoggedToday = !!myWellnessToday;
  const loggedToday = useMemo(
    () => logged.some((l) => formatDayKey(l.createdAt) === formatDayKey(new Date())),
    [logged],
  );

  // Team documents + e-sign — coach uploads, everyone signs (signatures array).
  const documents = useCollection(noData ? null : ("documents"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const addDocument = async ({ title, file }) => {
    if (!file) throw new Error("No file selected.");
    const path = `documents/${activeTeamId}/${user.uid}/${Date.now()}-${file.name}`;
    const r = storageRef(storage, path);
    // Fingerprint of the exact file: every signature records it, and the
    // rules lock url/path/sha256 so a signed document can't be swapped.
    const sha256 = await sha256Hex(file);
    const snap = await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(snap.ref);
    return addDoc(collection(db, "documents"), {
      teamId: activeTeamId,
      title: (title || "").trim() || file.name,
      url, path, sha256, name: file.name || "", fileType: file.type || "",
      createdByName: user.name, createdAt: serverTimestamp(),
    });
  };
  const deleteDocument = (id) => deleteDoc(doc(db, "documents", id));
  // E-signature: one immutable record per signer (rules check every field).
  const signDocument = (d, { typedName, drawing, consentText }) =>
    setDoc(doc(db, "documents", d.id, "signatures", user.uid), {
      uid: user.uid,
      typedName,
      email: (auth.currentUser?.email || user.email || "").toLowerCase(),
      signedAt: serverTimestamp(),
      sha256: d.sha256 || "",
      consentVersion: SIGN_CONSENT_VERSION,
      consentText,
      drawing,
      documentTitle: (d.title || "").slice(0, 300),
      userAgent: (navigator.userAgent || "").slice(0, 500),
    });



  // Roster (invite gate) — admin manages, useAuth reads on first signup.
  // Two ways in, both team-specific:
  //  - Email invites (below): the coach adds an email to invitedEmails for
  //    one team; useAuth reads it at first sign-in.
  //  - Invite LINKS (decision 2026-11-08): a coach generates a link for ONE
  //    team and shares it; a player signing up via that link lands on that
  //    team (useAuth redeems ?invite=CODE at first sign-in). The doc id IS
  //    the code (a random token = the capability); shape documented in
  //    src/data/teams.js, rules in firestore.rules.
  // Coach-only: the roster's emails are not visible to players (rules).
  // An invite keeps the role it was sent with, but the account's role is the
  // truth (e.g. someone invited as a player and later made program admin).
  // Use the account's role when it is staff, so staff never show as players.
  const invites = useMemo(() => {
    const staffByEmail = new Map((allUsers || []).filter((u) => u.email && (isStaffRole(u.role) || u.role === "statistician")).map((u) => [u.email.toLowerCase(), u.role]));
    if (user && isStaffRole(user.role) && user.email) staffByEmail.set(user.email.toLowerCase(), user.role);
    if (!staffByEmail.size) return invitesRaw;
    const out = invitesRaw.map((inv) => {
      const r = staffByEmail.get((inv.email || inv.id || "").toLowerCase());
      return r && inv.role !== r ? { ...inv, role: r } : inv;
    });
    return Object.assign(out, invitesRaw.loading ? { loading: true } : {});
  }, [invitesRaw, allUsers, user]);
  const addInvite = (email, teamId) => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) return Promise.reject(new Error("Invalid email."));
    // The invite carries the team so a new player lands on the right team
    // (useAuth reads it at first sign-in). The coach picks the team in the
    // roster UI; default to the team currently being viewed.
    const tid = isValidTeamId(teamId) ? teamId : activeTeamId;
    return setDoc(doc(db, "invitedEmails", e), {
      email: e,
      role: "player",
      teamId: tid,
      addedBy: user.name,
      addedAt: serverTimestamp(),
    });
  };
  const removeInvite = (email) => deleteDoc(doc(db, "invitedEmails", email));
  const addInvitesBatch = async (emails, teamId) => {
    const tid = isValidTeamId(teamId) ? teamId : activeTeamId;
    const batch = writeBatch(db);
    emails.forEach((e) => {
      batch.set(doc(db, "invitedEmails", e), {
        email: e,
        role: "player",
        teamId: tid,
        addedBy: user.name,
        addedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  };
  // Random invite-link code (16 chars, no look-alikes: no 0/O/1/l).
  const makeInviteCode = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const rand = new Uint32Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(rand);
    else for (let i = 0; i < rand.length; i++) rand[i] = Math.floor(Math.random() * 4294967296);
    return Array.from(rand, (n) => chars[n % chars.length]).join("");
  };
  // Mint a team-specific invite link. expiresAt is a Date (or null = never);
  // maxUses is a number (or null = unlimited).
  const addInviteLink = async (teamId, { expiresAt = null, maxUses = null } = {}) => {
    if (!isValidTeamId(teamId)) throw new Error("Pick a team for the link.");
    const code = makeInviteCode();
    await setDoc(doc(db, "inviteLinks", code), {
      teamId,
      createdByUid: user.uid,
      createdByName: user.name,
      code,
      createdAt: serverTimestamp(),
      expiresAt: expiresAt || null,
      maxUses: maxUses || null,
      uses: 0,
    });
    return code;
  };
  const removeInviteLink = (code) => deleteDoc(doc(db, "inviteLinks", code));
  // Invite links for the team being viewed. Single-field query (no composite
  // index needed); sorted client-side in the roster UI. Players can't list
  // them (rules) — the hook swallows that permission error.
  const inviteLinks = useCollection(noData || !isCoach ? null : ("inviteLinks"), where("teamId", "==", activeTeamId));
  // Toggle a roster entry between player and admin. Updates the invite doc
  // (controls role for future first-sign-ins) AND any existing users doc with
  // that email (changes role for already-signed-up players immediately).
  // ORG-ADMIN-ONLY (decision 2026-11-08): a team coach can invite and manage
  // their roster, but only the program admin promotes/demotes anyone. The
  // rules enforce this server-side too (users + invitedEmails); this guard
  // gives a clear error instead of a silent rules denial.
  const setInviteRole = async (email, nextRole) => {
    if (user.role !== "orgAdmin") {
      throw new Error("Only the program admin can change roles.");
    }
    if (email === user.email && nextRole !== "admin") {
      throw new Error("You can't demote yourself.");
    }
    await updateDoc(doc(db, "invitedEmails", email), { role: nextRole });
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { role: nextRole })));
  };

  // Change a signed-in user's role + team assignment. ORG-ADMIN-ONLY (§10
  // admin model, decision 2026-11-08): only the program admin promotes /
  // demotes anyone — Player ↔ Team Coach ↔ Org Admin — and assigns which
  // team(s) a coach coaches. A team coach can invite and manage their roster
  // but can never promote anyone. The users-doc rules enforce this
  // server-side too (only orgAdmin may write role/teamIds); this guard gives
  // a clear error instead of a silent rules denial.
  const setUserRoleAndTeams = async (uid, email, { role, teamIds, primaryTeamId }) => {
    if (user.role !== "orgAdmin") {
      throw new Error("Only the program admin can change roles.");
    }
    if (uid === user.uid) {
      throw new Error("You can't change your own role.");
    }
    const validTeams = (teamIds || []).filter(isValidTeamId);
    if (role !== "orgAdmin" && !validTeams.length) {
      throw new Error("Pick at least one team.");
    }
    const finalRole = ["orgAdmin", "admin", "statistician"].includes(role) ? role : "player";
    // Org admins see all three teams; everyone else gets exactly the teams
    // the admin picked. Primary is the first picked team (or the existing
    // primary if it's still one of them).
    const finalTeams = finalRole === "orgAdmin" ? [...TEAM_IDS] : validTeams;
    const finalPrimary = finalTeams.includes(primaryTeamId) ? primaryTeamId : (finalTeams[0] || null);
    await updateDoc(doc(db, "users", uid), { role: finalRole, teamIds: finalTeams, primaryTeamId: finalPrimary });
    // Keep the invite record in sync so a future re-sign-in doesn't revert
    // the role. Best-effort: invite-link sign-ups have no invitedEmails doc.
    if (email) {
      try { await setDoc(doc(db, "invitedEmails", email), { role: finalRole }, { merge: true }); } catch { /* users doc is authoritative */ }
    }
  };

  // Workouts — personal (private subcollection) + team-published
  const myWorkoutsPath = user ? `users/${user.uid}/workouts` : null;
  const myWorkouts = useCollection(noData ? null : (myWorkoutsPath), orderBy("updatedAt", "desc"));
  const addMyWorkout = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, myWorkoutsPath), {
      exercises: [],
      ...base,
      name: (base.name || "").trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };
  const updateMyWorkout = (id, data) =>
    updateDoc(doc(db, myWorkoutsPath, id), { ...data, updatedAt: serverTimestamp() });
  const deleteMyWorkout = (id) => deleteDoc(doc(db, myWorkoutsPath, id));

  // Training maxes (F47) for %-of-max workouts.
  const myMaxDocs = useCollection(noData || !user ? null : `users/${user.uid}/maxes`);
  const myMaxes = useMemo(() => Object.fromEntries(myMaxDocs.map((d) => [d.id, d])), [myMaxDocs]);
  const [maxesOpen, setMaxesOpen] = useState(false); // false | true | entry (focus that lift)
  const maxesCtx = useMemo(() => ({ maxes: myMaxes, openMaxes: (entry) => setMaxesOpen(entry || true) }), [myMaxes, setMaxesOpen]);
  const teamWorkouts = useCollection(noData ? null : ("teamWorkouts"), where("teamId", "==", activeTeamId), orderBy("updatedAt", "desc"));
  const addTeamWorkout = (input) => {
    const base = typeof input === "string" ? { name: input } : (input || {});
    return addDoc(collection(db, "teamWorkouts"), {
      exercises: [],
      ...base,
      teamId: activeTeamId,
      name: (base.name || "").trim(),
      createdByUid: user.uid,
      createdByName: user.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };
  const updateTeamWorkout = (id, data) =>
    updateDoc(doc(db, "teamWorkouts", id), { ...data, updatedAt: serverTimestamp() });
  const deleteTeamWorkout = (id) => deleteDoc(doc(db, "teamWorkouts", id));
  // One-tap starter sessions — batch-writes the curated team workouts, grouped by
  // focus area. De-dupes by name so it's additive and safe to re-run.
  const seedTeamWorkouts = async () => {
    const { workoutSeedDocs } = await import("./data/workoutSeed");
    const have = new Set(teamWorkouts.map((w) => (w.name || "").toLowerCase().trim()));
    const all = workoutSeedDocs();
    const fresh = all.filter((w) => !have.has(w.name.toLowerCase().trim()));
    if (fresh.length) {
      const batch = writeBatch(db);
      fresh.forEach((w) => batch.set(doc(collection(db, "teamWorkouts")), {
        ...w, teamId: activeTeamId, createdByUid: user.uid, createdByName: user.name || "Starter",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }));
      await batch.commit();
    }
    return { added: fresh.length, skipped: all.length - fresh.length };
  };
  // One-time upgrade of starter content seeded before the 2026-11-23 content
  // audit (see lib/seedUpgrade.js — never overwrites a coach's edits). Runs
  // once per team on a coach's device, after the three lists have loaded.
  const seedUpgradeRan = useRef(false);
  useEffect(() => {
    if (user?.role !== "admin" || !activeTeamId || seedUpgradeRan.current) return;
    if (isLoading(teamWorkouts) || isLoading(customExercises) || isLoading(recipes)) return;
    const flag = `brophy.seedUpgrade.v2.${activeTeamId}`; // bump with SEED_UPGRADE_VERSION
    try { if (localStorage.getItem(flag)) return; } catch { /* storage blocked — just run (idempotent) */ }
    seedUpgradeRan.current = true;
    (async () => {
      const { planLiftUpgrade, planRecipeUpgrade, planWorkoutUpgrade } = await import("./lib/seedUpgrade");
      const w = planWorkoutUpgrade(teamWorkouts);
      const l = planLiftUpgrade(customExercises);
      const r = planRecipeUpgrade(recipes);
      const ops = [
        ...w.updates.map((u) => (b) => b.update(doc(db, "teamWorkouts", u.id), { ...u.data, updatedAt: serverTimestamp() })),
        ...w.adds.map((a) => (b) => b.set(doc(collection(db, "teamWorkouts")), {
          ...a, teamId: activeTeamId, createdByUid: user.uid, createdByName: user.name || "Starter",
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })),
        ...l.updates.map((u) => (b) => b.update(doc(db, "customExercises", u.id), u.data)),
        ...l.adds.map((a) => (b) => b.set(doc(collection(db, "customExercises")), { ...a, createdAt: serverTimestamp() })),
        ...r.updates.map((u) => (b) => b.update(doc(db, "recipes", u.id), u.data)),
      ];
      if (ops.length) await commitInChunks(ops, (b, op) => op(b));
      try { localStorage.setItem(flag, String(Date.now())); } catch { /* ignore */ }
    })().catch((e) => { seedUpgradeRan.current = false; console.warn("Starter content upgrade failed", e); });
  }, [user?.role, user?.uid, user?.name, activeTeamId, teamWorkouts, customExercises, recipes]);

  // Chat — pinned status lives on each message doc (guide §4)
  // Most recent `msgLimit` messages of the team (all channels); "Load older"
  // in the chat raises the window. Keeps launches fast as history grows.
  const MSG_PAGE = 300;
  const [msgLimit, setMsgLimit] = useState(MSG_PAGE);
  const messages = useAudienceCollection(noData ? null : ("messages"), user, "createdAt", activeTeamId, msgLimit);
  const loadOlderMessages = () => setMsgLimit((n) => n + MSG_PAGE);
  const hasOlderMessages = messages.length >= msgLimit;
  const addMessage = (text, { attachment, pinned, replyTo, poll, channel } = {}) => {
    // A message inherits the audience of its channel so hidden channels stay
    // private server-side; the Team channel is visible to everyone.
    const ch = channel && channel !== "team" ? chatGroups.find((c) => c.id === channel) : null;
    const data = {
      senderUid: user.uid,
      sender: user.name,
      initials: user.initials,
      text: (text || "").trim(),
      pinned: !!pinned,
      channel: channel || "team",
      // A message belongs to its channel's team (the "team" channel is the
      // active team's main channel). Rules + queries scope by this field.
      teamId: ch?.teamId || activeTeamId,
      audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"],
      isCoach: user.role === "admin" || user.role === "orgAdmin",
      readBy: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    };
    if (attachment) data.attachment = attachment;
    if (replyTo) {
      data.replyToId = replyTo.id;
      data.replyToSender = replyTo.sender;
      const preview = replyTo.kind === "poll"
        ? `📊 ${replyTo.question}`
        : (replyTo.text || "");
      data.replyToText = preview.slice(0, 140);
    }
    if (poll) {
      data.kind = "poll";
      data.question = poll.question;
      data.options = poll.options;
      // Totals only on the message; each vote is a private doc.
      data.voteCounts = poll.options.map(() => 0);
      data.voteTotal = 0;
    }
    return addDoc(collection(db, "messages"), data);
  };
  // Post a rendered line-up card (image blob) into a chat channel — "team" or
  // any chatGroup id. Reuses the chat image pipeline so it lands in the feed
  // exactly like a shared photo.
  // Train → Documents → "Send to chat": a message with a link back to the
  // document or folder (attachment type "doc" / "folder", no file URL — the
  // chat opens it in Documents, where the team's access rules apply).
  const sendLibraryToChat = (channel, text, attachment) => addMessage(text, { attachment, channel });
  const postLineupImage = async (blob, channel, name) => {
    const ch = channel || "team";
    const chDoc = ch !== "team" ? chatGroups.find((c) => c.id === ch) : null;
    const path = `chat/${chDoc?.teamId || activeTeamId}/${ch}/${user.uid}/${uploadStamp()}.jpg`;
    const r = storageRef(storage, path);
    const snap = await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    await addMessage(name ? `Starting XI · ${name}` : "Starting XI", {
      attachment: { type: "image", url, path, name: `${(name || "lineup").replace(/[^\w\s-]/g, "").trim() || "lineup"}.jpg` },
      channel: ch,
    });
  };
  // Game Stats → "Send report to team": the report card image + summary text
  // as a team-chat message (onMessageCreated pushes it to everyone).
  const postGameReport = async (blob, text, filename) => {
    const path = `chat/${activeTeamId}/team/${user.uid}/${uploadStamp()}.jpg`;
    const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(snap.ref);
    await addMessage(text, { attachment: { type: "image", url, path, name: filename || "game-report.jpg" }, channel: "team" });
  };
  const togglePinMessage = (id, pinned) =>
    updateDoc(doc(db, "messages", id), { pinned: !pinned });
  const deleteMessage = (id) => deleteDoc(doc(db, "messages", id));
  const markMessagesRead = async (ids) => {
    if (!ids?.length) return;
    // Chunked: a single batch over 500 writes always fails.
    await commitInChunks(ids, (b, id) => b.update(doc(db, "messages", id), {
      [`readBy.${user.uid}`]: serverTimestamp(),
    }));
  };
  // Poll votes are private (messages/{id}/votes/{uid}): players see totals
  // only, kept on the poll by the onPollVoteWritten function; the coach can
  // see who voted for what.
  const voteOnPoll = (messageId, optionIndex) =>
    setDoc(doc(db, "messages", messageId, "votes", user.uid), {
      uid: user.uid,
      option: optionIndex,
      updatedAt: serverTimestamp(),
    });
  // React to a message (👍/👎/❤️). Passing a falsy reaction clears it (toggle).
  const reactToMessage = (messageId, reaction) =>
    updateDoc(doc(db, "messages", messageId), {
      [`reactions.${user.uid}`]: reaction || deleteField(),
    });

  // Chat channels ("group chats") — admin creates, sets who can see each one.
  // Empty visibleTo = everyone. `audienceKeys` enforces this server-side.
  const chatGroups = useAudienceCollection(noData ? null : ("chatGroups"), user, "createdAt", activeTeamId);
  const addChatGroup = (name, visibleTo) =>
    addDoc(collection(db, "chatGroups"), {
      teamId: activeTeamId,
      name: name.trim(),
      visibleTo: visibleTo || { groupIds: [], uids: [] },
      audienceKeys: audienceKeysFor(visibleTo, groupsList),
      createdByName: user.name,
      createdAt: serverTimestamp(),
    });
  const deleteChatGroup = (id) => deleteDoc(doc(db, "chatGroups", id));
  // Edit who can see an existing group chat. Messages inherit their channel's
  // audience at post time, so changing the channel means re-stamping every
  // message already in it: added members gain the history, removed members
  // lose it. Both sides are enforced by rules, not just hidden in the UI.
  // The channel is written last — if the re-stamp fails partway, the channel
  // still lists its old members and a retry re-runs the whole sweep, rather
  // than leaving a private channel whose backlog is still world-readable.
  const updateChatGroup = async (id, visibleTo) => {
    const audienceKeys = audienceKeysFor(visibleTo, groupsList);
    const ch = chatGroups.find((c) => c.id === id);
    await restampChannel(id, audienceKeys, ch?.teamId || activeTeamId);
    await updateDoc(doc(db, "chatGroups", id), { visibleTo, audienceKeys });
  };

  // Scheduled reminders + polls — coach queues them; a Cloud Function fires
  // each at its sendAt time (see functions/index.js runScheduled).
  const scheduled = useCollection(noData ? null : (isCoach ? "scheduled" : null), where("teamId", "==", activeTeamId), orderBy("sendAt"));
  const addScheduled = (data) =>
    addDoc(collection(db, "scheduled"), {
      ...data,
      teamId: activeTeamId,
      sent: false,
      createdByUid: user.uid,
      createdByName: user.name,
      createdByInitials: user.initials,
      createdAt: serverTimestamp(),
    });
  const deleteScheduled = (id) => deleteDoc(doc(db, "scheduled", id));
  const pinChatGroup = (id, pinned) => updateDoc(doc(db, "chatGroups", id), { pinned: !!pinned });

  // Custom push notifications. The coach sends one now or schedules it, and
  // both paths store a doc in `pushNotifications` for the `runScheduled`
  // runner, which also handles the daily wellness auto-nudge. Team-scoped,
  // same audience pattern as announcements.
  const pushNotifications = useCollection(noData ? null : (isCoach ? "pushNotifications" : null), where("teamId", "==", activeTeamId), orderBy("sendAt", "desc"));
  const addPushNotification = (data) =>
    addDoc(collection(db, "pushNotifications"), {
      ...data,
      teamId: activeTeamId,
      status: "scheduled",
      createdByUid: user.uid,
      createdByName: user.name,
      createdAt: serverTimestamp(),
    });
  const deletePushNotification = (id) => deleteDoc(doc(db, "pushNotifications", id));
  // "Send now" queues a pushNotifications doc with sendAt = now; the
  // onPushNotificationCreated Cloud Function sends it the moment it's
  // written (the 1-minute sweep is only a safety net).
  const sendPushNotificationNow = async ({ title, body, audienceKeys, visibleTo }) => {
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
    await addPushNotification({ title, body, audienceKeys, visibleTo, sendAt: serverTimestamp(), recurrence: { type: "none", time: "", days: [] }, tz });
  };

  // One-time, idempotent backfill: stamp `audienceKeys` onto any event/channel/
  // message created before server-side visibility existed. Without it the
  // players' array-contains-any query would skip field-less legacy docs and
  // they'd vanish. Runs only for the coach (who can write all three), once per
  // session, and self-terminates once nothing is missing. Legacy events/channels
  // resolve from their saved visibleTo; messages inherit their channel's keys
  // (Team / unknown channel → everyone), matching today's all-readable behaviour.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (!isCoach || backfilledRef.current) return;
    const updates = [];
    eventsRaw.forEach((e) => {
      if (e.audienceKeys === undefined) updates.push({ ref: doc(db, "events", e.id), data: { audienceKeys: audienceKeysFor(e.visibleTo, groupsList) } });
    });
    chatGroups.forEach((c) => {
      if (c.audienceKeys === undefined) updates.push({ ref: doc(db, "chatGroups", c.id), data: { audienceKeys: audienceKeysFor(c.visibleTo, groupsList) } });
    });
    messages.forEach((m) => {
      if (m.audienceKeys === undefined) {
        const ch = m.channel && m.channel !== "team" ? chatGroups.find((c) => c.id === m.channel) : null;
        updates.push({ ref: doc(db, "messages", m.id), data: { audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"] } });
      }
    });
    if (updates.length === 0) return;
    backfilledRef.current = true;
    (async () => {
      try {
        for (let i = 0; i < updates.length; i += 400) {
          const batch = writeBatch(db);
          updates.slice(i, i + 400).forEach((u) => batch.update(u.ref, u.data));
          await batch.commit();
        }
      } catch {
        backfilledRef.current = false; // let it retry on the next render
      }
    })();
  }, [isCoach, eventsRaw, chatGroups, messages, groupsList]);

  // Direct messages with the team's coach. Players read only their own
  // thread; a team coach reads all threads on their team. The org admin
  // does not subscribe at all — DMs are between a player and their own
  // team's coach only (decision 2026-11-08). (No orderBy in the query to
  // avoid a composite index.)
  const dms = useCollection(
    noData ? null : (user && user.role !== "orgAdmin" ? "dms" : null),
    where("teamId", "==", activeTeamId),
    ...(isTeamCoach ? [] : [where("threadId", "==", user?.uid || "_")]),
    orderBy("createdAt", "desc"),
    limit(msgLimit),
  );
  const addDM = (text, threadId, { attachment } = {}) => {
    const data = {
      teamId: activeTeamId,
      threadId,
      senderUid: user.uid,
      senderName: user.name,
      isCoach: user.role === "admin",
      text: (text || "").trim(),
      readBy: { [user.uid]: serverTimestamp() },
      createdAt: serverTimestamp(),
    };
    // Photos/videos/files in a DM live on the DM doc itself — never in the
    // channel `messages` collection, where they would be team-visible.
    if (attachment) data.attachment = attachment;
    return addDoc(collection(db, "dms"), data);
  };
  // Mark DM messages read (readBy only — same pattern as channel messages).
  const markDMsRead = async (ids) => {
    if (!ids?.length) return;
    await commitInChunks(ids, (b, id) => b.update(doc(db, "dms", id), {
      [`readBy.${user.uid}`]: serverTimestamp(),
    }));
  };

  // Quote of the Day — latest coach-posted quote; posting one fans out a push.
  const quotes = useCollection(noData ? null : ("quotes"), where("teamId", "==", activeTeamId), orderBy("createdAt", "desc"));
  const todayQuote = quotes[0] || null;
  const addQuote = ({ text, author }) =>
    addDoc(collection(db, "quotes"), { teamId: activeTeamId, text, author: author || "", createdByName: user.name, createdAt: serverTimestamp() });

  // Total unread chat messages for this user → number badge on the Chat tab.
  // Mirrors the inbox: channel messages not sent by me and not yet in readBy,
  // plus DM messages not sent by me and not yet in readBy.
  const chatUnread = useMemo(
    () => messages.filter((m) => m.senderUid !== user?.uid && !m.readBy?.[user?.uid]).length
      + dms.filter((d) => d.senderUid !== user?.uid && !d.readBy?.[user?.uid]).length,
    [messages, dms, user],
  );

  // App icon badge = unread chat messages, like WhatsApp.
  useEffect(() => { if (user) syncAppBadge(chatUnread); }, [user, chatUnread]);
  const [checkin, setCheckin] = useState({ energy: 0, soreness: 0, tiredness: 0 });

  // The branded loading screen lives in index.html (it shows before any app
  // code loads). Keep it up while auth/profile loads, then fade it out.
  useEffect(() => { if (!loading) window.__hideSplash?.(); }, [loading]);
  if (loading) {
    return <div className="min-h-screen" style={{ backgroundColor: COLORS.primary }} />;
  }
  if (!user) return <LoginScreen externalError={authError} clearExternalError={clearError} emailLinkPending={emailLinkPending} onCompleteEmailLink={completeEmailLink} />;
  // Locked door: drill-library-only accounts (role drillBuilder, or any role
  // outside the three team roles) see the no-access screen instead of the
  // app shell — no team views render, and every subscription above was
  // skipped (lockedOut ? null), so no team data is fetched behind it.
  if (lockedOut) return <NoAccessScreen user={user} />;

  // Force a real first+last name before using the app (auto name = email prefix).
  const emailPrefix = (user.email || "").split("@")[0];
  const needsProfile = !user.name || user.name.trim() === emailPrefix || !user.name.trim().includes(" ");
  // The live profile (useAuth) picks up the saved name — no reload needed.
  if (needsProfile) return <NameGate user={user} />;

  // "View as player" preview — a real coach can drop their effective role to
  // player to see exactly what the team sees. Identity (uid/name) stays real.
  const realIsAdmin = user.role === "admin" || user.role === "orgAdmin";
  // An org admin gets the full coach UI (same tabs/buttons as a coach); the
  // team switcher above is what scopes them to one team at a time.
  const effUser = previewAsPlayer && realIsAdmin
    ? { ...user, role: "player" }
    : user.role === "orgAdmin"
      ? { ...user, role: "admin" }
      : user;

  // Both roles get a slim 5-tab nav. Workouts/Nutrition/Videos live under a
  // single "Train" hub so coaches aren't juggling three training-content tabs
  // (they keep every create/manage ability inside each Train sub-page).
  const coachTabs = [
    { id: "home", label: "Home", icon: Home, title: "Home" },
    { id: "practice", label: "Coach", icon: ClipboardList, title: "Coach Center" },
    { id: "calendar", label: "Schedule", icon: CalendarIcon, title: "Schedule" },
    { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
    { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
  ];
  const playerTabs = [
    { id: "home", label: "Today", icon: Home, title: "Today" },
    { id: "train", label: "Train", icon: Dumbbell, title: "Train" },
    { id: "calendar", label: "Schedule", icon: CalendarIcon, title: "Schedule" },
    { id: "messages", label: "Chat", icon: MessageCircle, title: "Team Chat" },
  ];
  const tabs = effUser.role === "admin" ? coachTabs : playerTabs;
  // Fall back to the first tab if the active one isn't available to this role
  // (e.g. a coach previewing as a player while on the Practice tab).
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "home";
  const title = (tabs.find((t) => t.id === activeTab) || tabs[0]).title;


  return (
    <MaxesContext.Provider value={maxesCtx}>
    <div
      className="app-shell min-h-screen min-h-dvh flex justify-center relative"
      style={{
        backgroundImage: "url('/brand/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundColor: COLORS.primary,
      }}
    >
      <Toaster />
      {inAppBanner && (
        <button
          key={inAppBanner.id}
          onClick={() => { if (inAppBanner.game) openGameStats(inAppBanner.game); else if (inAppBanner.tab) routeToTab(inAppBanner.tab); setInAppBanner(null); }}
          className="fixed left-3 right-3 z-[9000] flex items-start gap-3 text-left rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-slate-200 px-3.5 py-3 sm:max-w-sm sm:left-auto"
          style={{ top: "calc(10px + env(safe-area-inset-top))", animation: "banner-in .35s cubic-bezier(.2,.9,.3,1.2)" }}
          role="status"
          aria-live="polite"
        >
          <img src="/brand/favicon.png" alt="" className="w-9 h-9 rounded-xl flex-shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-slate-900 truncate">{inAppBanner.title}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">now</span>
            </span>
            {inAppBanner.body && <span className="block text-[13px] text-slate-600 leading-snug line-clamp-2">{inAppBanner.body}</span>}
          </span>
        </button>
      )}
      {/* Navy tint so the photo reads as ambient brand wallpaper, not busy. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `${COLORS.primary}D9` }}
      />
      {/* Fixed-inset app shell: a definite viewport height (top/bottom 0) that
          iOS lays out reliably — a flex column with an internal-scroll <main>
          and an in-flow bottom nav that can't scroll away. Centered without a
          transform so full-screen `fixed inset-0` modals still cover the page.
          Responsive: phone keeps the 28rem column; iPad (md) widens to 42rem;
          laptop (lg) goes full-width with a left sidebar nav instead of the
          bottom tabs. */}
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-none shadow-2xl flex flex-col lg:flex-row z-10" style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, margin: "0 auto", backgroundColor: COLORS.bg }}>
        {/* Desktop sidebar — laptop and wider only. Phone and iPad keep the
            bottom tabs. Carries the brand, the team switcher (multi-team
            users only) and the nav, so the content column can go wide. */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 z-20">
          <div className="px-5 pt-6 pb-4 flex items-center gap-3 border-b border-slate-100">
            <img src="/brand/logo.png" alt="" className="w-11 h-11 object-contain" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.18em] text-slate-400 leading-none">BROPHY</div>
              <div className="text-lg font-bold text-slate-900 leading-tight">Brophy Soccer</div>
              <div className="text-[11px] font-semibold truncate" style={{ color: COLORS.primary }}>{getTeam(activeTeamId).name}</div>
            </div>
          </div>
          {canSeeMultipleTeams && (
            <div className="px-4 pt-4 flex flex-col gap-1.5">
              {visibleTeams.map((t) => {
                const active = t.id === activeTeamId;
                return (
                  <button key={t.id} onClick={() => setPreferredTeamId(t.id)} className="text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: active ? COLORS.primary : COLORS.bg, color: active ? "#fff" : COLORS.textSecondary }}>
                    {t.shortName}
                  </button>
                );
              })}
            </div>
          )}
          <nav className="flex-1 px-3 pt-4 flex flex-col gap-1 overflow-y-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              const badge = t.id === "messages" ? chatUnread : 0;
              return (
                <button key={t.id} onClick={() => { setTrainView(null); setLibraryFocus(null); setVideoFocus(null); setStatsFocus(null); setTab(t.id); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{ backgroundColor: active ? COLORS.accentSoft : "transparent", color: active ? COLORS.accent : COLORS.textSecondary }}>
                  <span className="relative">
                    <Icon className="w-5 h-5" style={{ color: active ? COLORS.accent : COLORS.textSecondary }} fill={active ? COLORS.accent : "none"} strokeWidth={active ? 2.5 : 2} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 text-[9px] font-bold text-white rounded-full px-1 min-w-[15px] h-[15px] flex items-center justify-center leading-none border border-white" style={{ backgroundColor: "#DC2626" }}>{badge > 99 ? "99+" : badge}</span>
                    )}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-slate-200">
            <button onClick={() => setSettingsOpen(true)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 text-left">
              <Avatar photoURL={effUser.photoURL} initials={effUser.initials} size={36} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 truncate">{effUser.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{effUser.role === "orgAdmin" ? "Org Admin" : effUser.role === "admin" ? "Coach" : "Player"} · {getTeamShortName(activeTeamId)}</span>
              </span>
            </button>
          </div>
        </aside>
        {/* Content column — the phone/tablet column and the desktop content area. */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {updateReady && <UpdateBanner onReload={reload} color={COLORS.primary} />}
        <Header title={title} user={effUser} onAvatarClick={() => setSettingsOpen(true)} onPreview={() => { setPreviewAsPlayer(true); setTab("home"); }} onRefresh={resyncFirestore} refreshing={firestoreSyncing} stale={firestoreStale} />
        {canSeeMultipleTeams && <TeamSwitcher teams={visibleTeams} activeTeamId={activeTeamId} onSelect={setPreferredTeamId} />}
        {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} onSignOut={() => signOutUser(user.uid)} onReplayTour={() => { setSettingsOpen(false); setShowTour(true); }} isOrgAdmin={user.role === "orgAdmin"} orgUsers={orgUsers} setUserRoleAndTeams={setUserRoleAndTeams} />}
        <WelcomeTour key={tourOpen ? "tour-open" : "tour-closed"} open={tourOpen} role={effUser.role} onClose={closeTour} user={user} onUploadPhoto={uploadOwnPhoto} />
        {previewAsPlayer && realIsAdmin && (
          <button onClick={() => setPreviewAsPlayer(false)} className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>
            <Eye className="w-3.5 h-3.5" /> Viewing as a player — tap to exit
          </button>
        )}
        <main className="flex-1 min-h-0 overflow-y-auto pb-4">
          <Suspense fallback={<ScreenLoading />}>
          {/* Desktop content cap: the column goes wide on a laptop, but the
              pages stay readable (and the pitch stays usable) at 72rem. */}
          <div className="w-full lg:max-w-6xl lg:mx-auto h-full flex flex-col">
          {activeTab === "home" && effUser.role === "admin" && liveGames.length > 0 && (
            <div className="px-5 pt-4 -mb-1 space-y-2">
              {liveGames.map((g) => (
                <button key={g.id} onClick={() => openGameStats(g.id)} className="w-full rounded-2xl p-4 text-white flex items-center gap-3 shadow-sm text-left" style={{ backgroundColor: COLORS.primary }}>
                  <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-[11px] font-black animate-pulse">LIVE</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-black text-base truncate">{g.homeAway === "away" ? "@ " : "vs "}{g.opponent}</span>
                    <span className="block text-xs text-white/75 truncate">{g.createdByName ? `${g.createdByName} is tracking` : "Being tracked"} · tap to watch the stats live</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-white/70" />
                </button>
              ))}
            </div>
          )}
          {activeTab === "home" && effUser.role === "admin" && <HomePage user={effUser} isOrgAdmin={user.role === "orgAdmin"} practices={practices} announcements={announcements} addAnnouncement={addAnnouncement} updateAnnouncement={updateAnnouncement} togglePinAnnouncement={togglePinAnnouncement} deleteAnnouncement={deleteAnnouncement} events={events} wellness={wellness} wellnessLoading={isLoading(wellnessRaw)} invites={invites} addInvite={addInvite} removeInvite={removeInvite} addInvitesBatch={addInvitesBatch} setInviteRole={setInviteRole} inviteLinks={inviteLinks} addInviteLink={addInviteLink} removeInviteLink={removeInviteLink} mealLogActivityToday={mealLogActivityToday} documents={documents} addDocument={addDocument} deleteDocument={deleteDocument} signDocument={signDocument} allUsers={allUsers} requestProfileUpdate={requestProfileUpdate} pushNotifications={pushNotifications} addPushNotification={addPushNotification} deletePushNotification={deletePushNotification} sendPushNotificationNow={sendPushNotificationNow} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} />}
          {activeTab === "home" && effUser.role !== "admin" && <div className="px-5 pt-4 -mb-1"><PushPrompt user={effUser} /></div>}
          {activeTab === "home" && effUser.role !== "admin" && <LatestGameCard user={effUser} activeTeamId={activeTeamId} allUsers={allUsers} positionsByUid={positionsByUid} isStatKeeper={isStatKeeper} statKeepers={statKeepers} lineups={lineups} />}
          {activeTab === "home" && effUser.role !== "admin" && <PlayerTodayPage user={effUser} events={events} announcements={announcements} checkin={checkin} setCheckin={setCheckin} submitWellness={submitWellness} wellnessLoggedToday={wellnessLoggedToday} myWellness={myWellnessToday} loggedToday={loggedToday} waterCups={waterCups} setWaterCups={setWaterCups} documents={documents} signDocument={signDocument} onOpenTrain={(v) => { setTrainView(v); setTab("train"); }} onOpenSchedule={() => setTab("calendar")} practices={practices} activeTeamId={activeTeamId} todayQuote={todayQuote} addQuote={addQuote} nutritionTarget={myNutritionGoal} nutritionTotals={myNutritionTotals} profilePrompt={profilePrompt} onOpenProfile={() => setSettingsOpen(true)} onUploadPhoto={uploadOwnPhoto} />}
          {activeTab === "train" && (
            trainView ? (
              <div>
                <div className="px-5 pt-4 pb-1"><button onClick={() => { setTrainView(null); setLibraryFocus(null); setVideoFocus(null); }} className="text-xs font-semibold text-slate-500 flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Train</button></div>
                {trainView === "gym" && <GymPage user={effUser} myWorkouts={myWorkouts} addMyWorkout={addMyWorkout} updateMyWorkout={updateMyWorkout} deleteMyWorkout={deleteMyWorkout} teamWorkouts={teamWorkouts} addTeamWorkout={addTeamWorkout} updateTeamWorkout={updateTeamWorkout} deleteTeamWorkout={deleteTeamWorkout} customExercises={customExercises} addCustomExercise={addCustomExercise} updateCustomExercise={updateCustomExercise} deleteCustomExercise={deleteCustomExercise} seedLifts={seedLifts} seedTeamWorkouts={seedTeamWorkouts} />}
                {trainView === "nutrition" && <NutritionPage user={effUser} recipes={recipes} addRecipe={addRecipe} updateRecipe={updateRecipe} deleteRecipe={deleteRecipe} importRecipes={importRecipes} seedRecipes={seedRecipes} categories={categories} addCategory={addCategory} logged={logged} addLog={addLog} updateLog={updateLog} deleteLog={deleteLog} waterCups={waterCups} setWaterCups={setWaterCups} myNutritionGoal={myNutritionGoal} myNutritionTotals={myNutritionTotals} saveMyNutritionGoal={saveMyNutritionGoal} clearMyNutritionGoal={clearMyNutritionGoal} savedFoods={savedFoods} addSavedFood={addSavedFood} deleteSavedFood={deleteSavedFood} />}
                {trainView === "library" && <LibraryPage key={libraryFocus?.at || 0} focus={libraryFocus} chatGroups={chatGroups} onSendToChat={sendLibraryToChat} user={effUser} items={libraryItems} activeTeamId={activeTeamId} addItem={addLibraryItem} updateItem={updateLibraryItem} deleteItem={deleteLibraryItem} />}
                {trainView === "videos" && <VideosPage key={videoFocus?.at || 0} focus={videoFocus} chatGroups={chatGroups} onSendToChat={sendLibraryToChat} user={effUser} videos={videos} addVideo={addVideo} updateVideo={updateVideo} deleteVideo={deleteVideo} importVideos={importVideos} videoFolders={videoFolderDocs} addVideoFolder={addVideoFolder} renameVideoFolder={renameVideoFolder} deleteVideoFolder={deleteVideoFolder} />}
              </div>
            ) : <TrainHub onPick={setTrainView} />
          )}
          {activeTab === "practice" && effUser.role === "admin" && (
            <CoachCenterPage
              key={statsFocus?.at || 0}
              initialView={statsFocus ? "stats" : null}
              liveGameCount={liveGames.length}
              practiceProps={{ user: { ...effUser, isOrgAdmin: user.role === "orgAdmin" }, drills, addDrill, updateDrill, deleteDrill, practices, addPractice, updatePractice, deletePractice, programs, addProgram, updateProgram, deleteProgram, importEvents, events }}
              gameDayProps={{ user: effUser, lineups, addLineup, updateLineup, deleteLineup, allUsers, invites, chatGroups, postLineupImage, lineupLogo: lineupLogo?.url || "", setLineupLogo, teamShortName: getTeamShortName(activeTeamId), activeTeamId, positionsByUid }}
              gameStatsProps={{ user: effUser, startGameId: statsFocus?.gameId || null, activeTeamId, allUsers, lineups, positionsByUid, isCoach, canRecord: isCoach || isStatKeeper, statKeepers, setStatKeepers, onSendReport: postGameReport }}
              rosterProps={{ user: effUser, isOrgAdmin: user.role === "orgAdmin", setUserRoleAndTeams, removeUser, invites, addInvite, removeInvite, addInvitesBatch, setInviteRole, inviteLinks, addInviteLink, removeInviteLink, allUsers, requestProfileUpdate, activeTeamId, positionsByUid, setPlayerPosition }}
              calendarProps={{ user: effUser, events, practices, teamWorkouts, personalEvents, addEvent, updateEvent, addPersonalEvent, updatePersonalEvent, deleteEvent, deletePersonalEvent, importEvents, groups: groupsList, addGroup, updateGroupMembers, deleteGroup, invites, allUsers, chatGroups }}
              documentsProps={{ user: effUser, documents, rosterCount: invites.filter((i) => !isStaffRole(i.role)).length, onUpload: addDocument, onDelete: deleteDocument, onSign: signDocument }}
              announcementsProps={{ announcements, addAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement }}
            />
          )}
          {activeTab === "calendar" && <CalendarPage user={effUser} events={events} practices={practices} teamWorkouts={teamWorkouts} personalEvents={personalEvents} addEvent={addEvent} updateEvent={updateEvent} addPersonalEvent={addPersonalEvent} updatePersonalEvent={updatePersonalEvent} deleteEvent={deleteEvent} deletePersonalEvent={deletePersonalEvent} importEvents={importEvents} groups={groupsList} addGroup={addGroup} updateGroupMembers={updateGroupMembers} deleteGroup={deleteGroup} invites={invites} allUsers={allUsers} chatGroups={chatGroups} />}
          {activeTab === "messages" && <MessagesPage onOpenDocument={openFromChat} user={effUser} activeTeamId={activeTeamId} hasOlderMessages={hasOlderMessages} onLoadOlder={loadOlderMessages} isOrgAdmin={user.role === "orgAdmin"} allUsers={allUsers} messages={messages} addMessage={addMessage} togglePinMessage={togglePinMessage} deleteMessage={deleteMessage} markMessagesRead={markMessagesRead} voteOnPoll={voteOnPoll} reactToMessage={reactToMessage} rosterCount={invites.length} chatGroups={chatGroups} addChatGroup={addChatGroup} deleteChatGroup={deleteChatGroup} updateChatGroup={updateChatGroup} onPinChannel={pinChatGroup} groups={groupsList} invites={invites} announcements={announcements} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} dms={dms} addDM={addDM} markDMsRead={markDMsRead} scheduled={scheduled} addScheduled={addScheduled} deleteScheduled={deleteScheduled} />}
          </div>
          </Suspense>
        </main>
        <nav className="lg:hidden flex-shrink-0 w-full bg-white border-t border-slate-200 z-20" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="grid px-1 pt-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
            {tabs.map((t) => {
              const Icon = t.icon; const active = activeTab === t.id;
              const badge = t.id === "messages" ? chatUnread : 0;
              return (
                <button key={t.id} onClick={() => { setTrainView(null); setLibraryFocus(null); setVideoFocus(null); setStatsFocus(null); setTab(t.id); }} className="flex flex-col items-center justify-center py-1.5 gap-0.5">
                  <span className="relative">
                    <Icon className="w-5 h-5" style={{ color: active ? COLORS.accent : COLORS.textSecondary }} fill={active ? COLORS.accent : "none"} strokeWidth={active ? 2.5 : 2} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 text-[9px] font-bold text-white rounded-full px-1 min-w-[15px] h-[15px] flex items-center justify-center leading-none border border-white" style={{ backgroundColor: "#DC2626" }}>{badge > 99 ? "99+" : badge}</span>
                    )}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: active ? COLORS.accent : COLORS.textSecondary }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        </div>
      </div>
    </div>
    {maxesOpen && <MaxesSheet uid={user.uid} maxes={myMaxes} workouts={[...teamWorkouts, ...myWorkouts]} focus={maxesOpen === true ? null : maxesOpen} onClose={() => setMaxesOpen(false)} />}
    </MaxesContext.Provider>
  );
}
