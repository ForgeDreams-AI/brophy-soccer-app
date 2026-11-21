// ─── Share a print sheet as a real PDF ────────────────────────────────────
// window.print() silently does nothing in iOS in-app browsers (WKWebView),
// which is how the app is often opened from a link. So instead of relying
// on the browser's print dialog, we render the #print-sheet element to an
// actual PDF file (html2canvas + jsPDF) and hand it to the user:
//  1. iOS Safari / modern browsers: the native share sheet (Save to Files,
//     Print, AirDrop, Messages, …) via navigator.share with the PDF file.
//  2. Anything else (incl. in-app browsers): open the PDF in a new tab,
//     which hands it to the system PDF viewer where Share/Print/Save live.
//
// Why export used to FREEZE on iPhones: the old code (html2pdf.js) drew the
// whole sheet into ONE canvas at 2× — a 10-drill practice is ~1500 × 17000
// px, over Safari's 16.7-megapixel canvas limit, so the render silently
// never finished. Full-size phone photos (12 MP each, inlined as data URLs)
// added hundreds of MB of memory on top. Now:
//  - each PDF page is rendered on its own (a small canvas, capped well
//    under the iOS limit), with page breaks placed between blocks/lines
//    instead of through them;
//  - every picture is fetched with a timeout and shrunk to ≤1600 px first;
//  - the whole export has a time limit, so it errors instead of hanging.
//
// Why pictures used to come out blank: html2canvas re-downloads every <img>
// and can only draw another site's image when that site sends CORS headers
// (the Storage bucket's CORS config, teamhub/cors.json, is applied). Every
// picture is inlined as a data: URL BEFORE rendering; anything that still
// can't be read is reported instead of silently left blank.

const LETTER_MM = { w: 215.9, h: 279.4 };
const MARGIN_MM = 10;
const MAX_IMAGE_PX = 1600;          // longest side of an inlined picture
const FETCH_TIMEOUT_MS = 12_000;    // per picture
const IMAGE_LOAD_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 180_000;   // whole export (a 40-drill season PDF is ~20 pages)
const MAX_PAGE_SCALE = 2;
const MAX_CANVAS_PX = 8_000_000;    // per page canvas (iOS hard limit ≈ 16.7M)

const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(message)), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

const nextFrame = () => new Promise((r) => setTimeout(r, 0));

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

// Decode a picture and redraw it at most MAX_IMAGE_PX on its longest side
// (white background, so transparent PNG diagrams don't turn black as JPEG).
async function shrinkImage(blob) {
  if (blob.type === "image/svg+xml" || blob.type === "image/gif") return blobToDataUrl(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error("empty image");
    const k = Math.min(1, MAX_IMAGE_PX / Math.max(w, h));
    if (k === 1 && blob.size < 600_000) return blobToDataUrl(blob);
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", 0.88);
    c.width = 0; c.height = 0; // release the bitmap now (Safari is slow to GC canvases)
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchImageDataUrl(src) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit", cache: "force-cache", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") || "";
    // The SPA fallback answers unknown paths with index.html — not an image.
    if (!type.startsWith("image/")) throw new Error("not an image");
    return await shrinkImage(await res.blob());
  } finally {
    clearTimeout(t);
  }
}

const waitForImage = (img) => (img.complete && img.naturalWidth
  ? Promise.resolve()
  : withTimeout(new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true });
    img.addEventListener("error", resolve, { once: true });
  }), IMAGE_LOAD_TIMEOUT_MS, "image load timeout").catch(() => {}));

// Swap every remote <img> in `el` (the off-screen copy) for a small
// inlined version. Returns the number of pictures that could not be inlined.
async function inlineImages(el) {
  const imgs = [...el.querySelectorAll("img")].filter((img) => img.src && !img.src.startsWith("data:") && !img.src.startsWith("blob:"));
  let failed = 0;
  await Promise.all(imgs.map(async (img) => {
    img.loading = "eager";
    // Same-origin images (e.g. /brand/logo.png) are readable as-is.
    if (new URL(img.src, window.location.href).origin === window.location.origin) { await waitForImage(img); return; }
    try {
      const dataUrl = await fetchImageDataUrl(img.src);
      img.src = dataUrl;
      await waitForImage(img);
    } catch {
      failed += 1;
      // Leave nothing for html2canvas to wait on: a stalled picture used
      // to hang the render. Show a plain placeholder instead.
      const ph = document.createElement("div");
      ph.textContent = "Picture unavailable";
      ph.style.cssText = "margin:12px auto 0;padding:28px 12px;border:1px dashed #cbd5e1;border-radius:12px;color:#94a3b8;font:600 12px system-ui,sans-serif;text-align:center";
      img.replaceWith(ph);
    }
  }));
  return failed;
}

// Where to end each page (CSS px from the top of `el`). A page ends just
// above the last block / paragraph / picture that would otherwise be cut,
// as long as that keeps at least a quarter of the page filled.
export function pageBreaks(el, pageHeightPx) {
  const top0 = el.getBoundingClientRect().top;
  const total = Math.ceil(el.getBoundingClientRect().height);
  const tops = (selector) => [...el.querySelectorAll(selector)]
    .map((n) => n.getBoundingClientRect().top - top0)
    .filter((y) => y > 0 && y < total)
    .sort((a, b) => a - b);
  const blocks = tops(".sheet-step, li, section, h1, h2, h3, h4");
  const fine = tops("p, img, svg, tr, div");
  const breaks = [];
  let offset = 0;
  while (total - offset > pageHeightPx) {
    const limit = offset + pageHeightPx;
    const min = offset + pageHeightPx * 0.25;
    const pick = (list) => list.filter((y) => y > min && y <= limit).pop();
    const end = Math.floor(pick(blocks) ?? pick(fine) ?? limit);
    breaks.push(end);
    offset = end;
  }
  // Skip a last "page" that would only hold a few pixels of bottom padding.
  if (total - offset > 40 || !breaks.length) breaks.push(total);
  else breaks[breaks.length - 1] = total;
  return breaks;
}

// The preview lives in a scrolling pop-up, and html2canvas only paints what
// that pop-up shows, so pages came out mostly blank. Render from a copy
// placed behind the app in normal page flow instead, at a fixed letter width
// (phones and computers make the same PDF).
const SHEET_WIDTH_PX = 780;

function makeOffscreenCopy(el) {
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  // Behind everything (z-index -1, under the app and the preview pop-up),
  // at the page's top-left: html2canvas draws nothing placed off-screen or
  // inside a clipping/scrolling box.
  holder.style.cssText = `position:absolute;top:0;left:0;z-index:-1;width:${SHEET_WIDTH_PX}px;background:#fff;pointer-events:none;`;
  const copy = el.cloneNode(true);
  copy.removeAttribute("id");
  copy.id = "print-sheet-render";
  copy.classList.remove("shadow-2xl");
  copy.style.width = `${SHEET_WIDTH_PX}px`;
  copy.style.maxWidth = "none";
  // A tall phone photo at full width is taller than a page and gets split.
  // Cap pictures so about two drill blocks fit per page. (Scaled by
  // width:auto rather than object-fit, which html2canvas ignores.)
  copy.querySelectorAll("img").forEach((img) => {
    if (img.closest("header") || img.naturalWidth < 200) return;
    img.style.maxHeight = "380px";
    img.style.width = "auto";
    img.style.maxWidth = "100%";
    img.style.marginLeft = "auto";
    img.style.marginRight = "auto";
    img.style.display = "block";
  });
  // Same cap for drawn field diagrams (inline SVG, sized by its viewBox).
  copy.querySelectorAll("svg[viewBox]").forEach((svg) => {
    const [, , vw, vh] = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    if (!vw || !vh || vh < 150) return; // skip small icons
    const maxW = Math.round(380 * (vw / vh));
    if (maxW >= SHEET_WIDTH_PX) return;
    svg.style.width = `${maxW}px`;
    svg.style.maxWidth = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";
    svg.style.margin = "0 auto";
    const box = svg.parentElement;
    if (box && box.classList.contains("overflow-hidden")) {
      box.style.width = `${maxW}px`;
      box.style.maxWidth = "100%";
      box.style.marginLeft = "auto";
      box.style.marginRight = "auto";
    }
  });
  holder.append(copy);
  document.body.append(holder);
  return { copy, holder, remove: () => holder.remove() };
}

async function renderPdf(el, holder, filename, onProgress) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const contentW = LETTER_MM.w - MARGIN_MM * 2;
  const contentH = LETTER_MM.h - MARGIN_MM * 2;
  const widthPx = Math.ceil(el.getBoundingClientRect().width);
  const pageHeightPx = Math.floor(widthPx * (contentH / contentW));
  const breaks = pageBreaks(el, pageHeightPx);
  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  pdf.setProperties({ title: filename.replace(/\.pdf$/i, "") });

  let start = 0;
  for (let i = 0; i < breaks.length; i += 1) {
    onProgress?.(i + 1, breaks.length);
    await nextFrame(); // let the "Page 2 of 5" label paint
    const sliceH = breaks[i] - start;
    const scale = Math.min(MAX_PAGE_SCALE, Math.sqrt(MAX_CANVAS_PX / (widthPx * sliceH)));
    // Show exactly this page: a one-page-tall window onto the sheet,
    // shifted up by `start`. (Cropping with html2canvas x/y drifted.)
    holder.style.height = `${sliceH}px`;
    holder.style.overflow = "hidden";
    el.style.marginTop = `${-start}px`;
    const canvas = await html2canvas(holder, {
      width: widthPx,
      height: sliceH,
      scale,
      useCORS: true,
      imageTimeout: 5000,
      // html2canvas copies the WHOLE page and waits — with no time limit —
      // for every image in it to load (avatars, the preview behind us…).
      // One stalled picture anywhere froze the export. Copy only our sheet.
      ignoreElements: (n) => n !== document.body && document.body.contains(n) && !n.contains(holder) && !holder.contains(n),
      backgroundColor: "#ffffff",
      logging: false,
    });
    if (i > 0) pdf.addPage();
    const hMm = (sliceH / widthPx) * contentW;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_MM, MARGIN_MM, contentW, hMm, undefined, "FAST");
    canvas.width = 0; canvas.height = 0;
    start = breaks[i];
  }
  return pdf.output("blob");
}

// Returns { ok, missingImages }. ok=false only when there was nothing to
// render. Throws (with a readable message) on failure or timeout.
// onProgress(page, pages) is called as each page renders.
export async function shareSheetPdf(filename, { onProgress } = {}) {
  const el = document.getElementById("print-sheet");
  if (!el) return { ok: false, missingImages: 0 };
  let failed = 0;
  let blob;
  const { copy, holder, remove } = makeOffscreenCopy(el);
  try {
    blob = await withTimeout((async () => {
      failed = await inlineImages(copy);
      return renderPdf(copy, holder, filename, onProgress);
    })(), TOTAL_TIMEOUT_MS, "it took too long. Try again on Wi-Fi, or export fewer practices at once.");
  } finally {
    remove();
  }
  const file = new File([blob], filename, { type: "application/pdf" });
  const delivered = await deliverPdf(file, blob);
  if (!delivered) showTapToShare(file, blob);
  return { ok: true, missingImages: failed };
}

// Native share sheet (iOS Safari: Save to Files, Print, AirDrop, …), else
// a new tab with the system PDF viewer. Returns false when the browser
// refused because the original tap is too old (Safari only allows share /
// pop-ups for a few seconds after a tap, and big exports take longer).
async function deliverPdf(file, blob) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      // User dismissed the share sheet — do not pop a tab on top of it.
      if (e && e.name === "AbortError") return true;
      if (e && e.name === "NotAllowedError") return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Revoke after a minute so the tab has time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Boolean(win);
}

// A one-tap "PDF ready" button: tapping it is a fresh user gesture, so the
// share sheet / new tab is allowed this time.
function showTapToShare(file, blob) {
  document.getElementById("pdf-ready")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "pdf-ready";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "PDF ready");
  wrap.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:rgba(0,0,0,.35)";
  const card = document.createElement("div");
  card.style.cssText = "width:100%;max-width:420px;background:#fff;border-radius:20px;padding:18px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:inherit;text-align:center";
  const title = document.createElement("p");
  title.textContent = "Your PDF is ready";
  title.style.cssText = "margin:0 0 12px;font-weight:800;font-size:16px;color:#0f172a";
  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "Share / Save PDF";
  share.style.cssText = "display:block;width:100%;min-height:48px;border:0;border-radius:14px;background:#980000;color:#fff;font-weight:800;font-size:16px";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.style.cssText = "display:block;width:100%;min-height:44px;margin-top:8px;border:0;background:none;color:#475569;font-weight:700;font-size:15px";
  const close = () => wrap.remove();
  share.onclick = () => { close(); deliverPdf(file, blob); };
  cancel.onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  card.append(title, share, cancel);
  wrap.append(card);
  document.body.append(wrap);
  share.focus();
}
