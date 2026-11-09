import { RefreshCw } from "lucide-react";

// Thin bar shown at the very top of the app when a newer build is live. Tapping
// Refresh reloads the tab, which fetches the new HTML + assets.
export function UpdateBanner({ onReload, color = "#980000" }) {
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2 text-white text-xs font-semibold" style={{ backgroundColor: color }} role="status">
      <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 leading-tight">A new version is available.</span>
      <button onClick={onReload} className="px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 font-bold uppercase tracking-wider text-[11px]">Refresh</button>
    </div>
  );
}
