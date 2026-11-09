import { Search, X } from "lucide-react";

// SearchInput — rounded search field with icon and a clear button.
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className = "",
  autoFocus = false,
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-[var(--th-surface-2)] rounded-full pl-10 pr-9 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--th-primary)_30%,transparent)] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="press absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--th-surface)] flex items-center justify-center shadow-card"
        >
          <X className="w-3.5 h-3.5 text-ink-soft" />
        </button>
      )}
    </div>
  );
}
