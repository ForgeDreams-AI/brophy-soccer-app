import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

// Toaster — global toast host. Call toast(msg, type) from lib/toast anywhere;
// this renders once at the app root and listens on the `teamhub-toast` event.
// aria-live so screen readers announce toasts. Types: success | error | info.
const TONE = {
  success: { bg: "var(--th-success)", Icon: CheckCircle2 },
  error: { bg: "var(--th-danger)", Icon: AlertCircle },
  info: { bg: "var(--th-primary)", Icon: Info },
};

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((cur) => [...cur.slice(-2), t]); // cap at 3 visible
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 4000);
    };
    window.addEventListener("teamhub-toast", onToast);
    return () => window.removeEventListener("teamhub-toast", onToast);
  }, []);

  if (!items.length) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 space-y-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const { bg, Icon } = TONE[t.type] || TONE.error;
        return (
          <div
            key={t.id}
            role="status"
            className="animate-pop-in rounded-2xl pl-3 pr-4 py-3 text-[13px] font-medium shadow-hero text-white flex items-center gap-2.5 pointer-events-auto"
            style={{ backgroundColor: bg }}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 leading-snug">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
