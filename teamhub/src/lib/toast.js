// Lightweight global toasts — call toast(msg) from anywhere; <Toaster/>
// (rendered once at the app root) listens and renders them. Avoids prop
// drilling and replaces blocking alert() dialogs.
export function toast(message, type = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("teamhub-toast", {
      detail: { message: String(message || ""), type, id: Math.random().toString(36).slice(2) },
    }),
  );
}
