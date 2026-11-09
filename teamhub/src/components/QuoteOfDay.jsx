import { useState } from "react";
import { Quote, Send, Pencil, X } from "lucide-react";
import { toast } from "../lib/toast";

// Quote of the Day — shows the latest coach-posted quote as a banner on Home.
// Coaches get an inline composer to post a new one; posting writes a `quotes`
// doc, which a Cloud Function fans out as a push notification to the team.
// `colors` supplies the brand palette (primary/accent/accentSoft/bg).
export default function QuoteOfDay({ quote, isAdmin, addQuote, colors }) {
  const C = colors || { primary: "#980000", accent: "#A6192E", accentSoft: "#FBECEC" };
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addQuote({ text: text.trim(), author: author.trim() });
      setText(""); setAuthor(""); setOpen(false);
    } catch (e) {
      toast("Couldn't post quote — " + (e.message || "check your permissions."));
    } finally {
      setBusy(false);
    }
  };

  if (!quote && !isAdmin) return null;

  return (
    <div className="px-5 pt-4">
      <div className="rounded-2xl p-4 shadow-sm border" style={{ backgroundColor: C.accentSoft, borderColor: "rgba(0,0,0,0.06)" }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.primary }}>
            <Quote className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: C.primary }}>Quote of the Day</div>
            {quote ? (
              <>
                <p className="text-sm font-semibold text-slate-800 mt-1 leading-snug">“{quote.text}”</p>
                {quote.author && <p className="text-[11px] font-medium text-slate-500 mt-1">— {quote.author}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500 mt-1 italic">No quote yet. Post one to inspire the team.</p>
            )}
          </div>
          {isAdmin && !open && (
            <button onClick={() => setOpen(true)} title="Post a new quote" className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: C.primary }}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {isAdmin && open && (
          <div className="mt-3 space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Today's quote…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <div className="flex gap-2">
              <button onClick={() => { setOpen(false); setText(""); setAuthor(""); }} className="flex-1 py-2 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5"><X className="w-3.5 h-3.5" /> Cancel</button>
              <button onClick={post} disabled={busy || !text.trim()} className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: C.primary }}><Send className="w-3.5 h-3.5" /> {busy ? "Posting…" : "Post & notify"}</button>
            </div>
            <p className="text-[10px] text-slate-500 px-1">Posting sends a push notification to the team.</p>
          </div>
        )}
      </div>
    </div>
  );
}
