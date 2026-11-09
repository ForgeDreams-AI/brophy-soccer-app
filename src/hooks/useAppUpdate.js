import { useEffect, useRef, useState } from "react";
import { BUILD_ID } from "../lib/appVersion";

// Detects when a newer build has been deployed while the app is open. Polls the
// static /version.json (emitted at build time) and flips `updateReady` once its
// build id differs from the one this tab is running. A cache-busting query plus
// `no-store` bypasses the browser and any service-worker cache so the check sees
// the freshly deployed file. We check on an interval and whenever the tab regains
// focus (covers the common "left it open overnight" case). No-ops in dev, where
// version.json isn't emitted.
export function useAppUpdate(intervalMs = 5 * 60 * 1000) {
  const [updateReady, setUpdateReady] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || found.current || document.hidden) return;
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && String(build) !== String(BUILD_ID)) {
          found.current = true;
          setUpdateReady(true);
        }
      } catch {
        /* offline, or dev with no version.json — ignore */
      }
    };
    const id = setInterval(check, intervalMs);
    const onVisible = () => { if (!document.hidden) check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return { updateReady, reload: () => window.location.reload() };
}
