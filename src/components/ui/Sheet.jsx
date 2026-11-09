import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Bottom sheet — the standard modal surface. Slides up with a spring,
// has a drag handle, sticky header (title + X), and optional footer.
// Sizes: sm (max-h 50vh), md (70vh), lg (85vh), full (92vh).
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
  dismissable = true,
}) {
  const sheetRef = useRef(null);
  const drag = useRef(null);

  const heights = { sm: "50vh", md: "70vh", lg: "85vh", full: "92vh" };

  // Lock background scroll while open; Escape dismisses.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && dismissable) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, dismissable]);

  // Swipe-down on the handle zone dismisses the sheet.
  const onPointerDown = (e) => {
    if (!dismissable || !sheetRef.current) return;
    drag.current = { y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (dy > 8) d.moved = true;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (sheetRef.current) sheetRef.current.style.transform = "";
    if (d.moved && dy > 90 && dismissable) onClose?.();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--th-ink)_60%,transparent)] backdrop-blur-[1px]"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className="relative w-full sm:max-w-md bg-[var(--th-surface)] rounded-t-[28px] sm:rounded-[28px] shadow-sheet flex flex-col overflow-hidden animate-sheet-up"
        style={{ maxHeight: heights[size] }}
      >
        {/* Drag handle zone */}
        <div
          className="pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none select-none flex-shrink-0"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-hidden="true"
        >
          <div className="w-10 h-1.5 rounded-full bg-[var(--th-surface-2)]" />
        </div>

        {/* Sticky header */}
        {(title || dismissable) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-1 pb-3 flex-shrink-0">
            <div className="min-w-0">
              {title && (
                <h2 className="font-display font-bold text-[26px] leading-none uppercase tracking-wide text-ink truncate">
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-[11px] text-ink-faint font-medium mt-1">{subtitle}</p>}
            </div>
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="press w-8 h-8 rounded-full bg-[var(--th-surface-2)] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-ink-soft" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">{children}</div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-[var(--th-surface-2)] bg-[var(--th-surface)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
