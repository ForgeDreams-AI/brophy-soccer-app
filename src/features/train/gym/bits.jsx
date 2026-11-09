// Small shared bits for the gym views: title-casing, stable row keys,
// workout cards, the read-only hint, and the photo carousel.
import { useRef, useState } from "react";
import { ChevronRight, Dumbbell } from "lucide-react";

export const titleCase = (s) =>
  String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());

// Stable React keys for exercise rows. The key lives on the row object itself
// (spread-preserved by every edit/reorder) instead of on the array index, so
// controlled inputs never lose focus or swap DOM when a row moves.
let keyCounter = 0;
export const makeRowKey = () =>
  `ex-row-${Date.now().toString(36)}-${(keyCounter++).toString(36)}`;
export const withRowKeys = (entries = []) =>
  (entries || []).map((e) => ({ ...e, __k: e?.__k || makeRowKey() }));

// Deterministic block keys for the read-only superset render: a superset's
// identity is its label + member indices; a solo row is keyed by its index.
// Both are stable for a fixed entries array (no reordering in read-only).
export const supersetBlockKey = (group) =>
  group.group
    ? `ss-${group.group}-${group.items.map(({ index }) => index).join(".")}`
    : `row-${group.items[0]?.index}`;

export const WorkoutCard = ({ workout, onOpen, byline }) => (
  <button
    onClick={onOpen}
    className="press w-full bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] flex items-center gap-3 text-left"
  >
    <div className="w-11 h-11 rounded-xl bg-brand-accent-soft flex items-center justify-center flex-shrink-0">
      <Dumbbell className="w-5 h-5 text-brand-accent" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-ink leading-tight truncate">
        {workout.name || "Untitled"}
      </div>
      <div className="text-[11px] text-ink-faint mt-0.5">
        {(workout.exercises?.length || 0)} exercise
        {(workout.exercises?.length || 0) === 1 ? "" : "s"}
        {byline ? ` · ${byline}` : ""}
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-ink-faint flex-shrink-0" />
  </button>
);

// Re-exported from the shared ui primitive so the gym keeps one canonical
// read-only marker (same import path as before: { ReadOnlyHint } from "./bits").
export { default as ReadOnlyHint } from "../../../components/ui/ReadOnlyHint";

export const PhotoCarousel = ({ photos = [], className = "" }) => {
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  if (!photos.length) return null;
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-[var(--th-surface-2)]"
        style={{ aspectRatio: "4 / 3" }}
      >
        {photos.map((src) => (
          <img
            key={src}
            src={src}
            alt="Exercise photo"
            className="w-full h-full flex-shrink-0 snap-center object-cover"
            loading="lazy"
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {photos.map((src, i) => (
            <span
              key={`dot-${src}`}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === idx ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
