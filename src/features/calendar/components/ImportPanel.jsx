// ImportPanel — admin CSV import for schedule events. Uses lib/csv's
// parseCsv; accepts a header row (or bare rows, header prepended). Silent
// import is the default ("Don't ping players" checked).
import { useState } from "react";
import { FileUp, Upload, Wand2 } from "lucide-react";
import Card from "../../../components/ui/Card";
import Btn from "../../../components/ui/Btn";
import { Field, TextArea } from "../../../components/ui/Field";
import { parseCsv } from "../../../lib/csv";
import { toast } from "../../../lib/toast";
import { EVENT_TYPES } from "./EventViews";

export const EVENT_CSV_TEMPLATE = `date,start,end,title,location,type
2026-08-15,19:30,21:30,vs Rivals,Main Field,Game
2026-09-01,16:30,18:30,@ Opponents,Away Field,Game`;

const validType = (t) => (EVENT_TYPES.includes(t) ? t : "Practice");

function rowsFromCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const csvText =
    first.includes("date") && first.includes("title")
      ? text
      : `date,start,end,title,location,type\n${text}`;
  return parseCsv(csvText)
    .map((o) => ({
      date: String(o.date || "").trim(),
      start: String(o.start || "").trim() || "15:00",
      end: String(o.end || "").trim() || "17:00",
      title: String(o.title || "").trim(),
      location: String(o.location || "").trim(),
      type: validType(String(o.type || "").trim()),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.title);
}

export default function ImportPanel({ importEvents }) {
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [silentImport, setSilentImport] = useState(true);
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    setImportMsg("");
    const rows = rowsFromCsv(csvText);
    if (!rows.length) {
      setImportMsg("No valid rows — needs date,start,end,title,location,type.");
      return;
    }
    setBusy(true);
    try {
      await importEvents(rows, { notify: !silentImport });
      setImportMsg(`Imported ${rows.length} event${rows.length === 1 ? "" : "s"}.`);
      setCsvText("");
      toast(`Imported ${rows.length} event${rows.length === 1 ? "" : "s"}.`, "success");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check rules?"));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
      setImportMsg("");
    };
    reader.readAsText(file);
  };

  return (
    <Card elevation="raised">
      <div className="text-[12px] font-semibold text-ink-soft">
        Paste a schedule CSV — one event per line.
      </div>
      <Field className="mt-2">
        <TextArea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setImportMsg("");
          }}
          rows={8}
          placeholder={EVENT_CSV_TEMPLATE}
          className="font-mono !text-[12px]"
        />
      </Field>
      <div className="mt-2 flex gap-2">
        <label className="press flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--th-surface-2)] py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
          <FileUp className="h-3.5 w-3.5" /> Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => pickFile(e.target.files && e.target.files[0])}
          />
        </label>
        <Btn variant="ghost" size="md" icon={Wand2} onClick={() => setCsvText(EVENT_CSV_TEMPLATE)} className="flex-1 !bg-[var(--th-surface-2)]">
          Fill Example
        </Btn>
        <Btn variant="primary" size="md" icon={Upload} loading={busy} onClick={doImport} className="flex-1">
          Import
        </Btn>
      </div>
      {importMsg && (
        <p
          className={`mt-2 px-1 text-[11px] font-semibold ${
            importMsg.startsWith("Imported") ? "text-[var(--th-success)]" : "text-[var(--th-danger)]"
          }`}
        >
          {importMsg}
        </p>
      )}
      <label className="mt-2 flex cursor-pointer items-center gap-2 px-1">
        <input
          type="checkbox"
          checked={silentImport}
          onChange={(e) => setSilentImport(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--th-primary)]"
        />
        <span className="text-[12px] font-semibold text-ink-soft">Don't ping players (silent import)</span>
      </label>
    </Card>
  );
}
