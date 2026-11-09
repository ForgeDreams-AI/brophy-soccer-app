// AbsenceReasonGate — forced modal for players marked absent who haven't
// explained themselves yet. Blocks the whole screen until every unexplained
// absence has a reason; stacks oldest-first so they clear in order.
// Not dismissable — submitting is the only way through.
import { useState } from "react";
import { ClipboardList, ChevronRight } from "lucide-react";
import Btn from "../../../components/ui/Btn";
import Field, { TextArea } from "../../../components/ui/Field";
import Badge from "../../../components/ui/Badge";
import { useTheme } from "../../../theme/ThemeProvider";
import { toast } from "../../../lib/toast";
import { parseDayKey } from "../../../lib/dates";

const hexToRgba = (hex, alpha) => {
  const h = String(hex || "#0B1836").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const prettyDay = (ymd) => {
  try {
    return parseDayKey(ymd).toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return ymd;
  }
};

export default function AbsenceReasonGate({ dates, onSubmit }) {
  const { t } = useTheme();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!dates || dates.length === 0) return null;
  const date = dates[0];

  const submit = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(date, reason);
      setReason("");
    } catch {
      toast("Couldn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Explain your absence"
      style={{ backgroundColor: hexToRgba(t("primaryDeep"), 0.92) }}
    >
      <div className="w-full max-w-sm rounded-[28px] bg-[var(--th-surface)] shadow-sheet overflow-hidden">
        <div className="px-6 pt-7 pb-5 bg-[color-mix(in_srgb,var(--th-danger)_90%,transparent)]">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-display font-bold text-[26px] uppercase tracking-wide text-white leading-none">
            Explain your absence
          </h2>
          {dates.length > 1 && (
            <div className="mt-2">
              <Badge tone="navy" icon={ChevronRight}>
                {dates.length} absences to explain
              </Badge>
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-ink-soft leading-relaxed mb-4">
            You were marked <span className="font-bold text-[var(--th-danger)]">absent</span>{" "}
            on <span className="font-bold text-ink">{prettyDay(date)}</span>. Please tell
            your coach why.
          </p>
          <Field label="Reason">
            <TextArea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I was sick / had a family commitment…"
            />
          </Field>
          <Btn
            variant="danger"
            size="lg"
            className="w-full mt-4"
            loading={busy}
            disabled={!reason.trim()}
            onClick={submit}
          >
            Submit reason
          </Btn>
          <p className="text-[11px] text-ink-faint text-center mt-3">
            This is required before you can continue.
          </p>
        </div>
      </div>
    </div>
  );
}
