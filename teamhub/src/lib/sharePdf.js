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
//
// Why pictures used to come out blank: html2canvas re-downloads every <img>
// to draw it, and a browser only lets a page read another site's image
// pixels when that site sends CORS headers. Firebase Storage sends none
// unless the bucket's CORS config is applied (teamhub/cors.json), so drill
// photos/diagrams on screen were silently skipped in the PDF. Now every
// picture is inlined as a data: URL BEFORE rendering — first by a direct
// CORS fetch (works once the bucket CORS is set), else through the app's
// same-origin /api/img proxy (the `api` Cloud Function, functions/lib/api.js). Anything that still can't
// be read is reported instead of silently left blank.

const PROXY_PATH = "/api/img?u=";

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function fetchImageDataUrl(src) {
  const tryFetch = async (url) => {
    const res = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") || "";
    // The SPA fallback answers unknown paths with index.html — not an image.
    if (!type.startsWith("image/")) throw new Error("not an image");
    return blobToDataUrl(await res.blob());
  };
  try { return await tryFetch(src); } catch { /* no CORS on the source — try the proxy */ }
  return tryFetch(PROXY_PATH + encodeURIComponent(src));
}

const waitForImage = (img) => (img.complete && img.naturalWidth
  ? Promise.resolve()
  : new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  }));

// Swap every remote <img> in `el` for an inlined copy. Returns a restore
// function and the number of pictures that could not be inlined.
async function inlineImages(el) {
  const imgs = [...el.querySelectorAll("img")].filter((img) => img.src && !img.src.startsWith("data:") && !img.src.startsWith("blob:"));
  const originals = [];
  let failed = 0;
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute("src");
    // Same-origin images (e.g. /brand/logo.png) are readable as-is.
    if (new URL(img.src, window.location.href).origin === window.location.origin) { await waitForImage(img); return; }
    try {
      const dataUrl = await fetchImageDataUrl(img.src);
      originals.push([img, src]);
      img.src = dataUrl;
      await waitForImage(img);
    } catch {
      failed += 1;
    }
  }));
  const restore = () => originals.forEach(([img, src]) => { img.src = src; });
  return { restore, failed };
}

// Returns { ok, missingImages }. ok=false only when there was nothing to render.
export async function shareSheetPdf(filename) {
  const el = document.getElementById("print-sheet");
  if (!el) return { ok: false, missingImages: 0 };
  const { restore, failed } = await inlineImages(el);
  let blob;
  try {
    const opt = {
      margin: 10,
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };
    // Loaded on demand — html2pdf (html2canvas + jsPDF) is large and only
    // needed when someone exports a sheet.
    const { default: html2pdf } = await import("html2pdf.js");
    blob = await html2pdf().set(opt).from(el).outputPdf("blob");
  } finally {
    restore();
  }
  const file = new File([blob], filename, { type: "application/pdf" });
  // Native share sheet (iOS Safari): Save to Files, Print, AirDrop, …
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return { ok: true, missingImages: failed };
    } catch (e) {
      // User dismissed the share sheet — do not pop a tab on top of it.
      if (e && e.name === "AbortError") return { ok: true, missingImages: failed };
    }
  }
  // Fallback: open the PDF in a new tab (system PDF viewer, Share/Print
  // /Save live there). Revoke the object URL after a minute so the tab
  // has time to load it.
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ok: true, missingImages: failed };
}
