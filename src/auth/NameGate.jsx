import { useState } from "react";
import { signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useTheme } from "../theme/ThemeProvider";
import { COL } from "../data/collections";
import Btn from "../components/ui/Btn";
import Field, { Input } from "../components/ui/Field";

const initialsOf = (name) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Blocking gate shown when a profile still has the auto-generated name
// (email prefix / single word) so the roster shows real names.
export default function NameGate({ user, onDone }) {
  const { team } = useTheme();
  const prefix = (user.email || "").split("@")[0];
  const auto = !user.name || user.name.trim() === prefix || !user.name.trim().includes(" ");
  const parts = (user.name || "").trim().split(/\s+/);
  const [first, setFirst] = useState(auto ? "" : parts[0] || "");
  const [last, setLast] = useState(auto ? "" : parts.slice(1).join(" "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const name = `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
    if (!first.trim() || !last.trim()) {
      setErr("Please enter your first and last name.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await updateDoc(doc(db, COL.users, user.uid), { name, initials: initialsOf(name) });
      onDone();
    } catch (e) {
      setErr(e.message || "Couldn't save — try again.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center px-6 bg-brand-primary">
      <div className="w-full max-w-sm bg-[var(--th-surface)] rounded-[28px] shadow-hero p-6 space-y-4 animate-pop-in">
        <div className="text-center">
          <img src={team.assets.logo} alt="" className="w-14 h-14 object-contain mx-auto mb-3" />
          <h2 className="font-display font-bold text-[28px] uppercase tracking-wide text-ink leading-none">
            Add your name
          </h2>
          <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">
            So your coach and teammates know who's who on the {team.shortName} roster.
          </p>
        </div>
        <Field label="First name">
          <Input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" />
        </Field>
        <Field label="Last name" error={err}>
          <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" />
        </Field>
        <Btn
          variant="primary"
          size="lg"
          className="w-full"
          onClick={save}
          loading={busy}
          disabled={!first.trim() || !last.trim()}
        >
          {busy ? "Saving…" : "Save & continue"}
        </Btn>
        <button
          onClick={() => signOut(auth)}
          className="press w-full text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint py-1"
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
