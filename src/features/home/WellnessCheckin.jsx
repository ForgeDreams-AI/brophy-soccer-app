// Wellness check-in — shared 3-scale (energy / soreness / tiredness, 1–5)
// form + hook, imported by both the player home and coach-home features.
//
// Doc shape (firestore): wellnessCheckins/{uid}_{dateKey}
//   { uid, name, initials, feeling, soreness, tiredness, date, updatedAt }
// dateKey is LOCAL tz via lib/dates todayKey() (never UTC-sliced).
import { useCallback, useState } from "react";
import { doc, setDoc, serverTimestamp, where } from "firebase/firestore";
import { PenLine, Check } from "lucide-react";
import { db } from "../../firebase";
import { COL } from "../../data/collections";
import { useCollection } from "../../data/hooks";
import { todayKey } from "../../lib/dates";
import { toast } from "../../lib/toast";
import SegmentedControl from "../../components/ui/SegmentedControl";
import Btn from "../../components/ui/Btn";

const SCALE_OPTS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

export function useWellnessCheckin(user) {
  const uid = user?.uid || null;
  const dateKey = todayKey();
  const rows = useCollection(
    uid ? COL.wellness : null,
    where("uid", "==", uid || "_"),
    where("date", "==", dateKey),
  );
  const [saving, setSaving] = useState(false);
  const todayDoc = rows[0] || null;

  const submit = useCallback(
    async ({ feeling, soreness, tiredness }) => {
      if (!uid) throw new Error("not signed in");
      setSaving(true);
      try {
        await setDoc(
          doc(db, COL.wellness, `${uid}_${dateKey}`),
          {
            uid,
            name: user.name || "",
            initials: user.initials || "",
            feeling,
            soreness,
            tiredness,
            date: dateKey,
            updatedAt: serverTimestamp(),
          },
        );
      } finally {
        setSaving(false);
      }
    },
    [uid, dateKey, user],
  );

  return { todayDoc, checkedIn: !!todayDoc, submit, saving, dateKey };
}

const ScaleField = ({ label, lowLabel, highLabel, value, onChange }) => (
  <div>
    <div className="text-xs font-semibold text-ink mb-1.5">{label}</div>
    <SegmentedControl
      options={SCALE_OPTS}
      value={value}
      onChange={onChange}
      className="w-full"
      ariaLabel={label}
    />
    <div className="flex justify-between mt-1">
      <span className="text-[11px] text-ink-faint font-medium">{lowLabel}</span>
      <span className="text-[11px] text-ink-faint font-medium">{highLabel}</span>
    </div>
  </div>
);

export function WellnessCheckin({ user, onDone, onError }) {
  const { todayDoc, checkedIn, submit, saving } = useWellnessCheckin(user);
  const [feeling, setFeeling] = useState(null);
  const [soreness, setSoreness] = useState(null);
  const [tiredness, setTiredness] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);

  // Prefill the form from today's doc when it exists — render-synced with
  // a previous-value guard instead of an effect.
  const [prevDoc, setPrevDoc] = useState(todayDoc);
  if (todayDoc !== prevDoc) {
    setPrevDoc(todayDoc);
    if (todayDoc) {
      setFeeling(todayDoc.feeling ?? null);
      setSoreness(todayDoc.soreness ?? null);
      setTiredness(todayDoc.tiredness ?? null);
    }
  }

  const complete = feeling && soreness && tiredness;

  const handleSubmit = async () => {
    if (!complete) return;
    try {
      await submit({ feeling, soreness, tiredness });
      setSent(true);
      setEditing(false);
      onDone?.();
    } catch (e) {
      const msg = "Couldn't submit — " + (e.message || "");
      if (onError) onError(msg);
      else toast(msg);
    }
  };

  // Compact summary once today's check-in exists (tap to edit again).
  if (checkedIn && !editing) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "var(--th-success)" }}
        >
          <Check className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">Checked in</div>
          <div className="text-[11px] text-ink-soft">
            Energy {todayDoc.feeling} · Soreness {todayDoc.soreness} · Tiredness {todayDoc.tiredness}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--th-surface-2)] text-ink-soft"
        >
          <span className="inline-flex items-center gap-1">
            <PenLine className="w-3 h-3" /> Edit
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sent && (
        <span
          className="text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1"
          style={{ color: "var(--th-success)" }}
        >
          <Check className="w-3 h-3" /> Sent
        </span>
      )}
      <ScaleField
        label="Overall energy"
        lowLabel="Rough"
        highLabel="Great"
        value={feeling}
        onChange={setFeeling}
      />
      <ScaleField
        label="Soreness"
        lowLabel="None"
        highLabel="Very sore"
        value={soreness}
        onChange={setSoreness}
      />
      <ScaleField
        label="Tiredness"
        lowLabel="Fresh"
        highLabel="Exhausted"
        value={tiredness}
        onChange={setTiredness}
      />
      <Btn
        variant="primary"
        size="md"
        className="w-full"
        disabled={!complete}
        loading={saving}
        onClick={handleSubmit}
      >
        {checkedIn ? "Update check-in" : "Submit check-in"}
      </Btn>
    </div>
  );
}
