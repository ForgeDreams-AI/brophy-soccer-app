import { Inbox } from "lucide-react";
import Btn from "./Btn";

// EmptyState — icon + title + body + optional action. Use for every empty
// list instead of ad-hoc "No X yet" text.
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className = "",
}) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-10 ${className}`}>
      <div className="w-14 h-14 rounded-[20px] bg-[var(--th-surface-2)] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-ink-faint" />
      </div>
      {title && (
        <h3 className="font-display font-bold text-[20px] uppercase tracking-wide text-ink leading-none">
          {title}
        </h3>
      )}
      {body && <p className="text-[13px] text-ink-soft mt-2 leading-relaxed max-w-[26ch]">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Convenience: an action button wired for EmptyState.
export function EmptyStateAction({ children, onClick, icon }) {
  return (
    <Btn variant="outline" size="sm" onClick={onClick} icon={icon}>
      {children}
    </Btn>
  );
}
