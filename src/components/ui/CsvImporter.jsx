import { useRef, useState } from "react";
import Sheet from "./Sheet";
import Btn from "./Btn";
import Field, { TextArea } from "./Field";

// CsvImporter — generic Sheet-based CSV import surface (used by the Videos
// and Recipe libraries; reusable anywhere rows come from a spreadsheet).
//
// Text plumbing lives here (paste textarea, file upload, fill-example,
// import button, success/error messaging). Parsing + validation stays with
// the feature: `onImport(csvText)` must throw an Error on failure, or
// resolve with a success message to display.
export default function CsvImporter({
  open,
  onClose,
  title,
  subtitle,
  template,
  help,
  importLabel = "Import",
  onImport,
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null); // { type: "ok" | "err", text }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      setMsg(null);
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    setMsg(null);
    if (!text.trim()) {
      setMsg({ type: "err", text: "Nothing to import — paste rows or tap Fill Example." });
      return;
    }
    setBusy(true);
    try {
      const message = await onImport(text);
      setText("");
      setMsg({ type: "ok", text: message || "Imported." });
    } catch (e) {
      setMsg({ type: "err", text: e?.message || "Couldn't import — check the format." });
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setText("");
    setMsg(null);
    onClose?.();
  };

  return (
    <Sheet open={open} onClose={close} title={title} subtitle={subtitle} size="md">
      <div className="px-5 pb-5 pt-1 space-y-3">
        <Field label="Rows">
          <TextArea
            rows={7}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMsg(null);
            }}
            placeholder={template}
            className="font-mono"
          />
        </Field>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
            Upload CSV
          </Btn>
          <Btn
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              setText(template || "");
              setMsg(null);
            }}
          >
            Fill Example
          </Btn>
          <Btn variant="primary" size="sm" className="flex-1" loading={busy} onClick={doImport}>
            {importLabel}
          </Btn>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {msg && (
          <p
            className={`text-[12px] font-semibold px-1 ${
              msg.type === "ok" ? "text-[var(--th-success)]" : "text-[var(--th-danger)]"
            }`}
          >
            {msg.text}
          </p>
        )}
        {help && <p className="text-[11px] text-ink-faint leading-relaxed px-1">{help}</p>}
      </div>
    </Sheet>
  );
}
