import { useState } from "react";
import { sendSignInLinkToEmail, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { Mail, ArrowRight } from "lucide-react";
import { auth } from "../firebase";
import { useTheme } from "../theme/ThemeProvider";
import Btn from "../components/ui/Btn";

const EMAIL_FOR_SIGNIN_KEY = "emailForSignIn";
export { EMAIL_FOR_SIGNIN_KEY };

// Maps Firebase auth errors to friendly copy. Kept in sync with the v1 app.
export const prettyAuthError = (e) => {
  switch (e?.code) {
    case "auth/invalid-email":
      return "That email doesn't look right.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in cancelled.";
    case "auth/network-request-failed":
      return "Network issue — try again.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute.";
    default:
      return e?.message || "Sign in failed.";
  }
};

// Full-bleed branded login: team login-bg photo under a navy gradient scrim,
// centered logo, display-font welcome, email-link + Google buttons, roster hint.
// All identity strings come from the team theme — no hard-coded team names.
export default function LoginScreen({ externalError, clearExternalError }) {
  const { team } = useTheme();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // Surface auth-gate errors (e.g. "email not on roster") from useAuth.
  // Derived during render with a previous-value guard instead of an
  // effect: err follows externalError, re-syncing only when the prop value
  // actually changes.
  const [prevExternalError, setPrevExternalError] = useState(null);
  if (externalError !== prevExternalError) {
    setPrevExternalError(externalError);
    if (externalError) setErr(externalError);
  }

  const sendLink = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) {
      setErr("Enter a valid email.");
      return;
    }
    setErr("");
    clearExternalError?.();
    setBusy(true);
    try {
      await sendSignInLinkToEmail(auth, e, {
        url: window.location.origin + "/",
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_FOR_SIGNIN_KEY, e);
      setLinkSent(true);
    } catch (ex) {
      setErr(prettyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErr("");
    clearExternalError?.();
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (ex) {
      setErr(prettyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  const bgLayer = (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${team.assets.loginBg}')` }}
        aria-hidden="true"
      />
      {/* Navy gradient scrim: photo visible at the edges, form readable in
          the middle. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, var(--th-primary-deep) 0%, var(--th-primary) 55%, var(--th-primary-deep) 100%)",
          opacity: 0.88,
        }}
        aria-hidden="true"
      />
    </>
  );

  if (linkSent) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center px-6 relative overflow-hidden">
        {bgLayer}
        <div className="w-full max-w-sm text-center relative z-10 animate-pop-in">
          <div className="w-16 h-16 mx-auto rounded-[20px] bg-white/10 flex items-center justify-center mb-5">
            <Mail className="w-8 h-8 text-brand-accent" />
          </div>
          <h1 className="text-white font-display font-bold text-[32px] uppercase tracking-wide">
            Check your email
          </h1>
          <p className="text-white/80 text-sm mt-3 leading-relaxed">
            We sent a sign-in link to <span className="font-semibold text-white">{email}</span>.
            <br />
            Tap the link on this device to finish signing in.
          </p>
          <button
            onClick={() => {
              setLinkSent(false);
              setErr("");
            }}
            className="press mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 hover:text-white"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center px-6 relative overflow-hidden">
      {bgLayer}
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <img
            src={team.assets.logo}
            alt={`${team.name} logo`}
            className="w-28 h-28 mx-auto mb-4 object-contain drop-shadow-xl"
          />
          <h1 className="text-white font-display font-bold text-[40px] leading-none uppercase tracking-wide">
            Welcome to
            <br />
            {team.shortName} TeamHub
          </h1>
          <p className="text-white/60 text-xs mt-2 font-medium tracking-[0.18em] uppercase">
            {team.domain}
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr("");
                clearExternalError?.();
              }}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
              type="email"
              placeholder="Email"
              autoComplete="email"
              disabled={busy}
              aria-label="Email"
              className="w-full bg-white/10 border border-white/15 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--th-accent)_60%,transparent)] disabled:opacity-60"
            />
          </div>
          {err && (
            <p className="text-red-300 text-xs font-medium px-1 leading-snug" role="alert">
              {err}
            </p>
          )}
          <Btn
            variant="accent"
            size="lg"
            className="w-full"
            onClick={sendLink}
            loading={busy}
            icon={busy ? undefined : ArrowRight}
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Btn>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-semibold">
              or
            </span>
            <div className="flex-1 h-px bg-white/15" />
          </div>
          <button
            onClick={google}
            disabled={busy}
            className="press w-full py-3.5 rounded-2xl font-bold text-sm bg-white text-ink flex items-center justify-center gap-2.5 hover:bg-slate-50 disabled:opacity-60 shadow-hero"
          >
            <span className="text-base font-black" style={{ color: "#4285F4" }} aria-hidden="true">
              G
            </span>
            Continue with Google
          </button>
        </div>

        <div className="mt-6 bg-white/10 border border-white/10 rounded-2xl p-4">
          <p className="text-white/70 text-[11px] leading-relaxed">
            <span className="font-bold text-white/90">Players:</span> ask your coach to add your
            email to the team roster first, then sign in.
            <br />
            <span className="font-bold text-white/90">Coach:</span> add roster emails from the Home
            page after signing in.
          </p>
        </div>
      </div>
    </div>
  );
}
