// Split out of TeamHubRoles.jsx (F81). Area: settings.
// Every top-level declaration here is exported for the other app modules.
import { useMemo, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { getDownloadURL } from "firebase/storage";
import { currentPermission, disablePushOnThisDevice, enablePushNotifications, notificationsSupported, pushEnabledOnThisDevice } from "../lib/notifications";
import { toast } from "../lib/toast";
import { DEFAULT_TEAM_ID, TEAMS, getTeamShortName, isValidTeamId } from "../data/teams";
import { BUILD_ID } from "../lib/appVersion";
import { NotificationPrefs } from "./home";
import { Avatar, COLORS, deleteStorageFile, uploadFacePhoto } from "./shared";


/* ─── SETTINGS MODAL ─── */
export const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Settings — a professional page: Profile, Team & Role, People & Roles
// (org admin only), Notifications, Help, About. Tester feedback was removed
// outright (decision 2026-11-08, §10) — no feedback form exists anywhere.
export const ROLE_LABELS = { player: "Player", admin: "Team Coach", orgAdmin: "Org Admin" };

export const SettingsModal = ({ user, onClose, onSignOut, onReplayTour, isOrgAdmin = false, orgUsers = [], setUserRoleAndTeams }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [photo, setPhoto] = useState(user.photoURL || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const photoInputRef = useRef(null);
  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const oldPath = user.photoPath;
      const { snap, path } = await uploadFacePhoto(`avatars/${user.uid}/${Date.now()}`, file, 640, 0.85);
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, "users", user.uid), { photoURL: url, photoPath: path });
      if (oldPath && oldPath !== path && oldPath.startsWith(`avatars/${user.uid}/`)) deleteStorageFile(oldPath);
      setPhoto(url);
    } catch (e) {
      const msg = "Couldn't update photo. " + (e.message || "Try again.");
      toast(msg);
      setPhotoErr(msg);
    } finally {
      setPhotoBusy(false);
    }
  };
  // On = this device has a saved token (permission alone stays granted after Off).
  const [pushOn, setPushOn] = useState(() => pushEnabledOnThisDevice());
  const [pushBusy, setPushBusy] = useState(false);
  const [err, setErr] = useState("");

  // iOS Safari → needs PWA install for push to work at all.
  const isIOS = typeof navigator !== "undefined"
    && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined"
    && (window.matchMedia?.("(display-mode: standalone)").matches
        || window.navigator?.standalone === true);
  const needsIOSInstall = isIOS && !isStandalone;

  const saveName = async () => {
    const name = nameInput.trim();
    if (!name || name === user.name) { setEditingName(false); return; }
    setSavingName(true);
    setErr("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name,
        initials: initialsOf(name),
      });
      setEditingName(false);
    } catch (e) {
      setErr("Couldn't save name — " + (e.message || ""));
    } finally {
      setSavingName(false);
    }
  };

  const togglePush = async () => {
    setErr("");
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePushOnThisDevice(user.uid);
        setPushOn(false);
      } else {
        await enablePushNotifications(user.uid);
        setPushOn(true);
      }
    } catch (e) {
      setErr(e.message || "Couldn't update notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const denied = currentPermission() === "denied";

  // ── People & Roles (org admin only) ──────────────────────────────────────
  // Who can make a coach, and at what level: ONLY the program admin
  // (orgAdmin) promotes/demotes anyone — Player / Team Coach / Org Admin —
  // and assigns which team(s) a coach coaches. A team coach can't promote
  // anyone. setUserRoleAndTeams + the users-doc rules enforce it server-side
  // too (only orgAdmin may write role/teamIds).
  const [roleSearch, setRoleSearch] = useState("");
  const [editingUid, setEditingUid] = useState(null);
  const [editRole, setEditRole] = useState("player");
  const [editTeams, setEditTeams] = useState([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [editMsg, setEditMsg] = useState("");
  const myTeams = useMemo(() => {
    const ids = (user.teamIds || []).filter(isValidTeamId);
    if (ids.length) return ids;
    return [user.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId);
  }, [user]);
  const filteredUsers = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    const list = (orgUsers || []).slice().sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
    if (!q) return list;
    return list.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [orgUsers, roleSearch]);
  const openEditor = (u) => {
    setEditingUid(u.id);
    setEditRole(u.role === "orgAdmin" ? "orgAdmin" : u.role === "admin" ? "admin" : "player");
    const teams = (u.teamIds || []).filter(isValidTeamId);
    setEditTeams(teams.length ? teams : [u.primaryTeamId || DEFAULT_TEAM_ID].filter(isValidTeamId));
    setEditErr(""); setEditMsg("");
  };
  const saveEditor = async (u) => {
    if (!setUserRoleAndTeams) return;
    setEditBusy(true); setEditErr(""); setEditMsg("");
    try {
      await setUserRoleAndTeams(u.id, u.email, { role: editRole, teamIds: editTeams, primaryTeamId: editTeams[0] });
      setEditMsg(`${u.name || u.email} is now ${ROLE_LABELS[editRole] || "Player"}.`);
      setEditingUid(null);
    } catch (e) { setEditErr(e.message || "Couldn't save — try again."); }
    finally { setEditBusy(false); }
  };
  const toggleEditTeam = (teamId) => {
    setEditTeams((prev) => prev.includes(teamId) ? prev.filter((t) => t !== teamId) : [...prev, teamId]);
  };
  const roleBadgeStyle = (role) => role === "orgAdmin"
    ? { backgroundColor: COLORS.primary, color: "white" }
    : role === "admin"
    ? { backgroundColor: COLORS.accent, color: "#fff" }
    : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-base text-slate-900">Settings</h3>
          <button onClick={onClose} aria-label="Close settings" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* PROFILE */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Profile</h4>
            <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <Avatar photoURL={photo} initials={user.initials} size={48} bg={COLORS.accent} color={COLORS.primary} />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoBusy}
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow border-2 border-white disabled:opacity-60"
                  style={{ backgroundColor: COLORS.primary }}
                >
                  {photoBusy ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-3 h-3" />}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadPhoto(f); }} />
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveName()}
                      placeholder="Your name"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingName(false); setNameInput(user.name); }} disabled={savingName} className="flex-1 py-1.5 rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                      <button onClick={saveName} disabled={savingName || !nameInput.trim()} className="flex-1 py-1.5 rounded-full text-[11px] font-bold text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>{savingName ? "Saving…" : "Save"}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 truncate">{user.name}</span>
                      <button onClick={() => setEditingName(true)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline flex-shrink-0">Edit</button>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate font-mono">{user.email}</div>
                  </>
                )}
              </div>
            </div>
            {photoErr && <p className="text-xs text-red-600 leading-snug px-1 mt-2">{photoErr}</p>}
          </section>

          {/* TEAM & ROLE */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Team &amp; Role</h4>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] px-2 py-0.5 rounded-md" style={roleBadgeStyle(user.role)}>
                  {ROLE_LABELS[user.role] || "Player"}
                </span>
                <span className="text-xs text-slate-600">
                  {myTeams.map((t) => getTeamShortName(t)).join(" · ") || "No team assigned yet"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Only the program admin can change your role or teams. A player can be on more than one team; a coach coaches the team (or teams) they are assigned to.
              </p>
            </div>
          </section>

          {/* PEOPLE & ROLES — org admin only */}
          {isOrgAdmin && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">People &amp; Roles</h4>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] text-slate-500 leading-snug">
                  Promote or demote anyone, and assign which team (or teams) a coach coaches. Team coaches can&apos;t change roles — only you can.
                </p>
                <input
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 bg-white"
                />
                {editMsg && <p className="text-[11px] text-green-700 font-semibold bg-green-50 border border-green-100 rounded-lg px-3 py-2">{editMsg}</p>}
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-2">{roleSearch ? "No one matches that search." : "No signed-in users yet."}</p>
                ) : (
                  <ul className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {filteredUsers.map((u) => {
                      const isSelf = u.id === user.uid;
                      const editing = editingUid === u.id;
                      const teams = (u.teamIds || []).filter(isValidTeamId);
                      return (
                        <li key={u.id} className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <Avatar photoURL={u.photoURL} initials={u.initials} size={36} bg={COLORS.accent} color={COLORS.primary} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {u.name || u.email}
                                {isSelf && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">You</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate font-mono">{u.email}</div>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span className="text-[9px] font-black uppercase tracking-[0.12em] px-2 py-0.5 rounded-md" style={roleBadgeStyle(u.role)}>
                                  {ROLE_LABELS[u.role] || "Player"}
                                </span>
                                {u.role === "player" && !u.photoURL && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">No photo</span>
                                )}
                                {teams.map((t) => (
                                  <span key={t} className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{getTeamShortName(t)}</span>
                                ))}
                              </div>
                            </div>
                            {!isSelf && (
                              <button
                                onClick={() => (editing ? setEditingUid(null) : openEditor(u))}
                                className="text-[11px] font-bold text-slate-600 underline flex-shrink-0"
                              >
                                {editing ? "Close" : "Manage"}
                              </button>
                            )}
                          </div>
                          {editing && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-1.5">Role</div>
                                <div className="flex gap-1.5">
                                  {["player", "admin", "orgAdmin"].map((r) => (
                                    <button
                                      key={r}
                                      onClick={() => setEditRole(r)}
                                      className="flex-1 py-2 rounded-full text-[11px] font-bold disabled:opacity-50"
                                      style={editRole === r
                                        ? { backgroundColor: COLORS.primary, color: "white" }
                                        : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                                    >
                                      {ROLE_LABELS[r]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 mb-1.5">Teams</div>
                                {editRole === "orgAdmin" ? (
                                  <p className="text-[11px] text-slate-500">Org admins see all three teams — JVB, JVA, and Varsity.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {TEAMS.map((t) => {
                                      const on = editTeams.includes(t.id);
                                      return (
                                        <button
                                          key={t.id}
                                          onClick={() => toggleEditTeam(t.id)}
                                          aria-pressed={on}
                                          className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                                          style={on
                                            ? { backgroundColor: COLORS.primary, color: "white" }
                                            : { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                                        >
                                          {t.shortName}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              {editErr && <p className="text-[11px] text-red-500 font-medium">{editErr}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => setEditingUid(null)} disabled={editBusy} className="flex-1 py-2 rounded-full bg-slate-200 text-[11px] font-bold text-slate-700 disabled:opacity-50">Cancel</button>
                                <button
                                  onClick={() => saveEditor(u)}
                                  disabled={editBusy || (editRole !== "orgAdmin" && editTeams.length === 0)}
                                  className="flex-1 py-2 rounded-full text-[11px] font-bold text-white disabled:opacity-50"
                                  style={{ backgroundColor: COLORS.primary }}
                                >
                                  {editBusy ? "Saving…" : "Save changes"}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* NOTIFICATIONS */}
          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Notifications</h4>
            {needsIOSInstall ? (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">📱 Install for notifications</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  On iPhone, push notifications only work when the app is installed to your home screen.
                </p>
                <ol className="text-[11px] text-slate-700 leading-relaxed pl-4 list-decimal space-y-1">
                  <li>Tap the <span className="font-semibold">Share</span> button in Safari's toolbar (square with arrow).</li>
                  <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
                  <li>Open the app from your home screen icon and come back here.</li>
                </ol>
              </div>
            ) : !notificationsSupported() ? (
              <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-500 italic">Push notifications aren't supported in this browser.</div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900">Push notifications</div>
                  <div className="text-[11px] text-slate-500 leading-snug">
                    {denied
                      ? "Blocked. Allow in your browser's site settings, then refresh."
                      : pushOn
                      ? "On — you'll be pinged for announcements, chat, and events."
                      : "Get pinged for announcements, chat, and events."}
                  </div>
                </div>
                <button
                  onClick={togglePush}
                  disabled={pushBusy || denied}
                  className="text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2 rounded-full disabled:opacity-50 flex-shrink-0"
                  style={pushOn
                    ? { backgroundColor: COLORS.bg, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }
                    : { backgroundColor: COLORS.primary, color: "white" }}
                >
                  {pushBusy ? "…" : pushOn ? "Turn Off" : "Turn On"}
                </button>
              </div>
            )}
            <NotificationPrefs user={user} />
          </section>

          {/* ABOUT */}
          {onReplayTour && (
            <section>
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">Help</h4>
              <div className="space-y-2">
                <button onClick={onReplayTour} className="w-full bg-slate-50 rounded-2xl p-4 text-left flex items-center justify-between hover:bg-slate-100">
                  <span className="text-sm font-semibold text-slate-900">Replay the welcome tour</span>
                  <span className="text-lg" aria-hidden="true">🎟️</span>
                </button>
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 mb-2 px-1">About</h4>
            <div className="bg-slate-50 rounded-2xl p-4 text-[11px] space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">App</span><span className="font-semibold text-slate-900">Brophy Soccer</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="font-mono text-[10px] text-slate-700">{BUILD_ID}</span></div>
            </div>
          </section>

          {err && <p className="text-xs text-red-500 text-center px-1">{err}</p>}

          {/* SIGN OUT */}
          <button onClick={() => { onClose(); onSignOut(); }} className="w-full py-3 rounded-full text-xs font-black uppercase tracking-[0.16em] text-red-600 border-2 border-red-100 hover:bg-red-50">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

// Blocking gate shown when a player's profile still has the auto-generated name
// (email prefix / single word) so the roster can show real names.
export const NameGate = ({ user, onDone }) => {
  const prefix = (user.email || "").split("@")[0];
  const auto = !user.name || user.name.trim() === prefix || !user.name.trim().includes(" ");
  const parts = (user.name || "").trim().split(/\s+/);
  const [first, setFirst] = useState(auto ? "" : parts[0] || "");
  const [last, setLast] = useState(auto ? "" : parts.slice(1).join(" "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const name = `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
    if (!first.trim() || !last.trim()) { setErr("Please enter your first and last name."); return; }
    setBusy(true); setErr("");
    try { await updateDoc(doc(db, "users", user.uid), { name, initials: initialsOf(name) }); onDone(); }
    catch (e) { setErr(e.message || "Couldn't save — try again."); setBusy(false); }
  };
  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center px-6" style={{ backgroundColor: COLORS.primary }}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="text-center">
          <img src="/brand/logo.png" alt="" className="w-12 h-12 object-contain mx-auto mb-2" />
          <h2 className="text-lg font-bold text-slate-900">Add your name</h2>
          <p className="text-xs text-slate-500 mt-1">So your coach and teammates know who's who on the roster.</p>
        </div>
        <input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        {err && <p className="text-[11px] text-red-500 font-medium">{err}</p>}
        <button onClick={save} disabled={busy || !first.trim() || !last.trim()} className="w-full py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save & continue"}</button>
        <button onClick={() => signOut(auth)} className="w-full text-[11px] font-semibold text-slate-400">Not you? Sign out</button>
      </div>
    </div>
  );
};
