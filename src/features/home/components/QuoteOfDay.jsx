// QuoteOfDay — the latest coach-posted quote as a banner on Home.
// Coaches get an inline composer (bottom sheet); posting writes a `quotes`
// doc, which a Cloud Function fans out as a push notification to the team.
import { useState } from "react";
import { Quote, Pencil, Send } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import Field, { Input, TextArea } from "../../../components/ui/Field";
import { toast } from "../../../lib/toast";

export default function QuoteOfDay({ quote, isAdmin, addQuote }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  if (!quote && !isAdmin) return null;

  const post = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addQuote({ text: text.trim(), author: author.trim() });
      setText("");
      setAuthor("");
      setOpen(false);
    } catch (e) {
      toast("Couldn't post quote — " + (e.message || "check your permissions."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-[20px] p-4 bg-brand-accent-soft border border-[color-mix(in_srgb,var(--th-accent)_30%,transparent)] shadow-card">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center flex-shrink-0">
            <Quote className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              Quote of the day
            </div>
            {quote ? (
              <>
                <p className="text-sm font-semibold text-ink mt-1 leading-snug">
                  “{quote.text}”
                </p>
                {quote.author && (
                  <p className="text-[11px] font-medium text-ink-soft mt-1">— {quote.author}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-soft mt-1 italic">
                No quote yet. Post one to inspire the team.
              </p>
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Post a new quote"
              aria-label="Post a new quote"
              className="flex-shrink-0 w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center text-white press"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Post a quote"
          subtitle="It lands on everyone's home screen — and as a push notification."
          size="sm"
        >
          <div className="p-5 space-y-4">
            <Field label="Quote">
              <TextArea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Today's quote…"
              />
            </Field>
            <Field label="Author">
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author (optional)"
              />
            </Field>
            <div className="flex gap-2">
              <Btn variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                loading={busy}
                disabled={!text.trim()}
                onClick={post}
                icon={Send}
              >
                Post &amp; notify
              </Btn>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
