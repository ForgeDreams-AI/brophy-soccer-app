// SettingsModal — overlay Sheet for profile edit, photo upload, push
// preferences, feedback, app info, and sign out. Props: { user, onClose,
// onSignOut, onReplayTour, onWhatsNew } (user is the REAL user).

import { useRef, useState } from "react";
import {
  Camera,
  Loader2,
  User,
  Bell,
  MessageSquare,
  Info,
  Sparkles,
  RotateCcw,
  LogOut,
  Smartphone,
} from "lucide-react";
import { useTheme } from "../../theme/ThemeProvider";
import Sheet from "../../components/ui/Sheet";
import Avatar from "../../components/ui/Avatar";
import Btn from "../../components/ui/Btn";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { Field, Input, TextArea } from "../../components/ui/Field";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { toast } from "../../lib/toast";
import {
  notificationsSupported,
  currentPermission,
  enablePushNotifications,
  clearAllPushTokens,
} from "../../lib/notifications";
import { BUILD_ID } from "../../lib/appVersion";
import { useSettingsActions } from "./hooks";

export default function SettingsModal({ user, onClose, onSignOut, onReplayTour, onWhatsNew }) {
  const { team } = useTheme();
  const confirm = useConfirm();
  const { saveName, uploadPhoto, sendFeedback } = useSettingsActions(user);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [photo, setPhoto] = useState(user.photoURL || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);

  const [pushOn, setPushOn] = useState(currentPermission() === "granted");
  const [pushBusy, setPushBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fbText, setFbText] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const [fbSent, setFbSent] = useState(false);

  // iOS Safari needs a PWA install for push to work at all.
  const isIOS =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator?.standalone === true);
  const needsIOSInstall = isIOS && !isStandalone;
  const denied = currentPermission() === "denied";

  const handlePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await uploadPhoto(file);
      setPhoto(url);
      toast("Photo updated", "success");
    } catch (e) {
      toast("Couldn't update photo — " + (e.message || "check Storage rules."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSaveName = async () => {
    const name = nameInput.trim();
    if (!name || name === user.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setErr("");
    try {
      await saveName(name);
      setEditingName(false);
      toast("Name saved", "success");
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
        await clearAllPushTokens(user.uid);
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

  const handleSendFeedback = async () => {
    const text = fbText.trim();
    if (!text) return;
    setFbBusy(true);
    try {
      await sendFeedback(text);
      setFbText("");
      setFbSent(true);
      toast("Feedback sent — thank you", "success");
    } catch (e) {
      toast("Couldn't send feedback — " + (e.message || ""));
    } finally {
      setFbBusy(false);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Sign out?",
      body: "You'll need to sign back in to keep using TeamHub.",
      confirmLabel: "Sign Out",
      danger: true,
    });
    if (!ok) return;
    onClose();
    onSignOut();
  };

  return (
    <Sheet open onClose={onClose} title={`${team.shortName} TeamHub`} subtitle="Settings" size="lg">
      <div className="p-5 space-y-6">
        {/* PROFILE */}
        <section>
          <SectionHeader title="Profile" icon={User} className="mb-3" />
          <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 flex items-start gap-3">
            <div className="relative flex-shrink-0">
              <Avatar photoURL={photo} initials={user.initials} size={52} ring />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                aria-label="Change profile photo"
                className="press absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-card border-2 border-[var(--th-surface)] bg-brand-primary disabled:opacity-60"
              >
                {photoBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  handlePhoto(f);
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="space-y-2">
                  <Field label="Name">
                    <Input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                      placeholder="Your name"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Btn
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      disabled={savingName}
                      onClick={() => {
                        setEditingName(false);
                        setNameInput(user.name || "");
                      }}
                    >
                      Cancel
                    </Btn>
                    <Btn
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      loading={savingName}
                      disabled={!nameInput.trim()}
                      onClick={handleSaveName}
                    >
                      Save
                    </Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-ink truncate">{user.name}</span>
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-[11px] font-semibold text-ink-faint hover:text-ink underline flex-shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-[11px] text-ink-soft truncate font-mono">{user.email}</div>
                  <div className="mt-1.5">
                    <Badge tone={user.role === "admin" ? "gold" : "navy"}>
                      {user.role === "admin" ? "Coach" : "Player"}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* NOTIFICATIONS */}
        <section>
          <SectionHeader title="Notifications" icon={Bell} className="mb-3" />
          {needsIOSInstall ? (
            <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 space-y-2">
              <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                Install for notifications
              </div>
              <p className="text-[11px] text-ink-soft leading-relaxed">
                On iPhone, push notifications only work when the app is installed to your home
                screen.
              </p>
              <ol className="text-[11px] text-ink-soft leading-relaxed pl-4 list-decimal space-y-1">
                <li>
                  Tap the <span className="font-semibold">Share</span> button in Safari's toolbar
                  (square with arrow).
                </li>
                <li>
                  Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.
                </li>
                <li>Open the app from your home screen icon and come back here.</li>
              </ol>
            </div>
          ) : !notificationsSupported() ? (
            <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 text-[11px] text-ink-faint italic">
              Push notifications aren't supported in this browser.
            </div>
          ) : (
            <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink">Push notifications</div>
                <div className="text-[11px] text-ink-soft leading-snug">
                  {denied
                    ? "Blocked. Allow in your browser's site settings, then refresh."
                    : pushOn
                    ? "On — you'll be pinged for announcements, chat, and events."
                    : "Get pinged for announcements, chat, and events."}
                </div>
              </div>
              <Btn
                variant={pushOn ? "outline" : "primary"}
                size="sm"
                className="flex-shrink-0"
                loading={pushBusy}
                disabled={denied}
                onClick={togglePush}
              >
                {pushOn ? "Turn Off" : "Turn On"}
              </Btn>
            </div>
          )}
        </section>

        {/* APP */}
        <section>
          <SectionHeader title="App" icon={Info} className="mb-3" />
          <div className="space-y-2">
            {(onWhatsNew || onReplayTour) && (
              <>
                {onWhatsNew && (
                  <button
                    onClick={onWhatsNew}
                    className="press w-full bg-[var(--th-surface-2)] rounded-[20px] p-4 text-left flex items-center justify-between hover:brightness-95"
                  >
                    <span className="text-sm font-semibold text-ink">What's new</span>
                    <Sparkles className="w-5 h-5 text-brand-accent" aria-hidden="true" />
                  </button>
                )}
                {onReplayTour && (
                  <button
                    onClick={onReplayTour}
                    className="press w-full bg-[var(--th-surface-2)] rounded-[20px] p-4 text-left flex items-center justify-between hover:brightness-95"
                  >
                    <span className="text-sm font-semibold text-ink">Replay the welcome tour</span>
                    <RotateCcw className="w-5 h-5 text-brand-accent" aria-hidden="true" />
                  </button>
                )}
              </>
            )}
            <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ink-faint">App</span>
                <span className="font-semibold text-ink">{team.shortName} TeamHub</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">Version</span>
                <span className="font-mono text-[11px] text-ink-soft">{BUILD_ID}</span>
              </div>
              {team.domain && (
                <div className="flex justify-between">
                  <span className="text-ink-faint">Domain</span>
                  <span className="font-mono text-[11px] text-ink-soft">{team.domain}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FEEDBACK */}
        <section>
          <SectionHeader title="Send feedback" icon={MessageSquare} className="mb-3" />
          <div className="bg-[var(--th-surface-2)] rounded-[20px] p-4 space-y-2">
            <p className="text-[11px] text-ink-soft">
              Found a bug or have an idea? Tell us — it goes straight to the team.
            </p>
            <Field label="Your feedback">
              <TextArea
                value={fbText}
                onChange={(e) => {
                  setFbText(e.target.value);
                  setFbSent(false);
                }}
                rows={3}
                placeholder="What's working, what's not, what you'd want…"
              />
            </Field>
            <Btn
              variant="primary"
              size="md"
              className="w-full"
              loading={fbBusy}
              disabled={!fbText.trim()}
              onClick={handleSendFeedback}
            >
              {fbSent ? "Thanks — sent!" : "Send feedback"}
            </Btn>
          </div>
        </section>

        {err && <p className="text-[11px] text-[var(--th-danger)] text-center px-1">{err}</p>}

        {/* SIGN OUT */}
        <section>
          <SectionHeader title="Danger" icon={LogOut} className="mb-3" />
          <Btn variant="danger" size="lg" className="w-full" onClick={handleSignOut}>
            Sign Out
          </Btn>
        </section>
      </div>
    </Sheet>
  );
}
