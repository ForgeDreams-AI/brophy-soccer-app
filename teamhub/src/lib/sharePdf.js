// ─── Share a print sheet as a real PDF ────────────────────────────────────
// window.print() silently does nothing in iOS in-app browsers (WKWebView),
// which is how the app is often opened from a link. So instead of relying
// on the browser's print dialog, we render the #print-sheet element to an
// actual PDF file (html2pdf.js = html2canvas + jsPDF, pagination handled
// automatically) and hand it to the user:
//  1. iOS Safari / modern browsers: the native share sheet (Save to Files,
//     Print, AirDrop, Messages, …) via navigator.share with the PDF file.
//  2. Anything else (incl. in-app browsers): open the PDF in a new tab,
//     which hands it to the system PDF viewer where Share/Print/Save live.
// Returns true when the PDF was produced (shared, opened, or the user
// cancelled the share sheet); false only when there was nothing to render.

import html2pdf from "html2pdf.js";

export async function shareSheetPdf(filename) {
  const el = document.getElementById("print-sheet");
  if (!el) return false;
  const opt = {
    margin: 10,
    filename,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] },
  };
  const blob = await html2pdf().set(opt).from(el).outputPdf("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  // Native share sheet (iOS Safari): Save to Files, Print, AirDrop, …
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      // User dismissed the share sheet — do not pop a tab on top of it.
      if (e && e.name === "AbortError") return true;
    }
  }
  // Fallback: open the PDF in a new tab (system PDF viewer, Share/Print
  // /Save live there). Revoke the object URL after a minute so the tab
  // has time to load it.
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
