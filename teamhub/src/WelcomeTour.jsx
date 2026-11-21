import { useRef, useState } from "react";

// Brand palette (mirrors COLORS in TeamHubRoles so the tour matches the app).
const RED = "#980000";
const ACCENT = "#A6192E";

// Role-aware welcome walkthrough. Self-contained: a centered card carousel that
// steps through the app's features with Back / Next / Skip. Shown automatically
// on first login (caller tracks "seen" in localStorage) and replayable anytime
// from Settings. No DOM anchoring, so it can't break the live layout.

const COACH_STEPS = [
  { icon: "👋", title: "Welcome, Coach!", body: "Here's a quick 30-second tour of everything you can do. You can replay it anytime from Settings." },
  { icon: "🏠", title: "Home", body: "Post announcements the whole team sees instantly, and get a snapshot of what's coming up." },
  { icon: "⚽", title: "Practice", body: "Build and share practice plans and your drill library so everyone knows the session." },
  { icon: "📅", title: "Schedule", body: "Create games, practices, and events. Choose exactly who sees each one (everyone, a group, or specific players)." },
  { icon: "💪", title: "Train", body: "Your hub for workouts, nutrition, and the video library. Create and assign training content here." },
  { icon: "💬", title: "Chat", body: "Team channels plus private messages. You can make a channel visible to just one group, and pin important posts." },
  { icon: "🧑‍🤝‍🧑", title: "Roster & documents", body: "Invite players by email, manage the roster, share documents for e-signing, and see each player's daily wellness check-in." },
  { icon: "🔔", title: "Notifications", body: "Turn these on (in Settings) so players get a ping for every new announcement, event, and message." },
  { icon: "✅", title: "You're all set!", body: "That's the whole app. Tap “Replay the tour” in Settings whenever you want to see this again." },
];

const PLAYER_STEPS = [
  { icon: "👋", title: "Welcome to the team app!", body: "Here's a quick 30-second tour. You can replay it anytime from Settings." },
  { icon: "📸", title: "Add your face photo", body: "Add a photo of your face so your coach can put you on the game day roster. It only takes a second.", photo: true },
  { icon: "🏠", title: "Today", body: "Your home base. Announcements from your coach and what is happening today." },
  { icon: "💪", title: "Train", body: "Your workouts, nutrition, and video library. Log your meals and water right here." },
  { icon: "📅", title: "Schedule", body: "All your games, practices, and events. Tap any one for the details." },
  { icon: "💬", title: "Chat", body: "Team channels plus a private line straight to your coach." },
  { icon: "📄", title: "Documents & profile", body: "Sign any team documents your coach shares, and keep your profile up to date." },
  { icon: "🔔", title: "Notifications", body: "Turn these on (in Settings) so you never miss an announcement, event, or message." },
  { icon: "✅", title: "All set!", body: "That's everything. You can replay this tour anytime from Settings." },
];

export default function WelcomeTour({ open, role, onClose, user, onUploadPhoto }) {
  const steps = role === "admin" ? COACH_STEPS : PLAYER_STEPS;
  const [i, setI] = useState(0);
  // Face photo for this player (local state: the parent's user object is only
  // loaded once at sign-in, so it does not refresh after an upload).
  const [photoUrl, setPhotoUrl] = useState(user?.photoURL || "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Starts at step 0 each time it opens: the parent re-mounts it via `key`.

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  const handlePhotoFile = async (file) => {
    if (!file || !onUploadPhoto) return;
    setPhotoBusy(true);
    setPhotoErr("");
    try {
      const url = await onUploadPhoto(file);
      if (url) setPhotoUrl(url);
    } catch (e) {
      setPhotoErr(e.message || "Couldn't add photo. Try again.");
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label="Welcome tour"
      style={{ backgroundColor: "rgba(20,39,92,0.72)" }}>
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="px-6 pt-7 pb-5 text-center" style={{ backgroundColor: RED }}>
          <div className="text-5xl mb-2" aria-hidden="true">{step.icon}</div>
          <h2 className="text-white text-lg font-black">{step.title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-center">
          <p className="text-sm text-slate-600 leading-relaxed min-h-[64px]">{step.body}</p>

          {/* Face photo upload (player tour only). Never blocks the tour:
              Next and Skip stay available whether or not a photo is added. */}
          {step.photo && (
            <div className="mb-4">
              {photoUrl ? (
                <div>
                  <img src={photoUrl} alt="Your face photo" className="w-24 h-24 rounded-full object-cover mx-auto border-4" style={{ borderColor: ACCENT }} />
                  <p className="text-xs font-bold mt-2" style={{ color: RED }}>Photo added. You are set for the game day roster.</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                    className="mt-2 text-[11px] font-bold text-slate-500 underline disabled:opacity-50">
                    {photoBusy ? "Adding photo..." : "Change photo"}
                  </button>
                </div>
              ) : onUploadPhoto ? (
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={photoBusy}
                    className="px-4 py-2.5 rounded-full text-xs font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: RED }}>
                    {photoBusy ? "Adding..." : "Take photo"}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                    className="px-4 py-2.5 rounded-full text-xs font-bold disabled:opacity-50"
                    style={{ backgroundColor: "#F1F5F9", color: "#334155" }}>
                    {photoBusy ? "Adding..." : "Upload photo"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">You can add your photo later from Settings.</p>
              )}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handlePhotoFile(f); }} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handlePhotoFile(f); }} />
              {photoErr && <p className="text-xs text-red-600 leading-snug mt-3">{photoErr}</p>}
            </div>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 my-4" aria-hidden="true">
            {steps.map((_, idx) => (
              <span key={idx} className="h-1.5 rounded-full transition-all"
                style={{ width: idx === i ? 18 : 6, backgroundColor: idx === i ? ACCENT : "#E2E8F0" }} />
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
              style={{ backgroundColor: RED }}>
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
