// Split out of TeamHubRoles.jsx (F81). Area: library.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Folder, Hash, Link as LinkIcon, Paperclip, Pencil, Play, Plus, Send, Trash2, Video, X } from "lucide-react";
import { isLoading } from "../hooks/useCollection";
import { toast } from "../lib/toast";
import { getTeamShortName } from "../data/teams";
import { DOC_ACCEPT, docTypeLabel } from "./documents";
import { LoadingNote } from "./home";
import { AutoGrowTextarea, CAT_ICON, COLORS, EMBED_SANDBOX, ReadOnlyHint, VIDEO_CATS, reportError, splitCSVLine, toEmbedUrl } from "./shared";


/* ─── VIDEOS (categorized library, original style) ─── */
export const VIDEO_CSV_TEMPLATE = `title,url,cat,dur,diff,desc,type,subfolder
10 Min Breathwork for Athletes,https://www.youtube.com/watch?v=n34DBL-dZNU,Breathing,10 min,Easy,"Focus + flow state breathwork",video,
Soccer Hip Mobility Routine,https://www.youtube.com/watch?v=5NN9SuYO2YU,Mobility,5 min,Easy,"Quick pre-game hip prep",video,`;

export const parseVideoCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("title") && first.includes("url");
  const rows = hasHeader ? lines.slice(1) : lines;
  // Any non-empty folder name is kept: a folder that does not exist yet is
  // created automatically on import (same as recipe categories). Blank falls
  // back to Film.
  const validCat = (c) => (c || "").trim() || "Film";
  const validDiff = (d) => ["Easy", "Medium", "Hard"].includes(d) ? d : "Easy";
  const validType = (t) => ["video", "audio", "external"].includes(t) ? t : "video";
  return rows.map((line) => {
    const c = splitCSVLine(line);
    return {
      title: (c[0] || "").trim(),
      url: (c[1] || "").trim(),
      cat: validCat((c[2] || "").trim()),
      dur: (c[3] || "").trim() || "—",
      diff: validDiff((c[4] || "").trim()),
      desc: (c[5] || "").trim(),
      type: validType((c[6] || "video").trim()),
      subfolder: (c[7] || "").trim(),
    };
  }).filter((r) => r.title && r.url);
};

/* ─── DOCUMENTS LIBRARY (Train → Documents, next to Videos) ───────────────
   Coach-shared files and links (playbooks, scouting reports, forms, training
   plans…), filed in folders. Each item is shared with ALL three teams or with
   one team (firestore.rules libraryItems + storage.rules library/). Players
   open/download; coaches add, edit and delete. Different from Coach Center →
   Documents, which is for documents players must SIGN. */
export const LIBRARY_FOLDERS = ["Playbook", "Scouting", "Forms", "Training plans", "Nutrition", "Recovery"];
export const fileSizeLabel = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
export const isHttpUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

export const LibraryItemForm = ({ initial, activeTeamId, folders, onSave, onClose }) => {
  const editing = Boolean(initial?.id);
  const [kind, setKind] = useState(initial?.kind || "file");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(initial?.url && initial?.kind === "link" ? initial.url : "");
  const [title, setTitle] = useState(initial?.title || "");
  const [folder, setFolder] = useState(initial?.folder || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [scope, setScope] = useState(initial?.teamId || "all");
  const [notify, setNotify] = useState(!editing);
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    if (!editing && kind === "file" && !file) { setErr("Pick a file to upload."); return; }
    if (kind === "link" && !isHttpUrl(url.trim())) { setErr("Enter a full link starting with https://"); return; }
    if (!editing && kind === "file" && file.size > 50 * 1024 * 1024) { setErr("That file is over 50 MB. Share it as a link (e.g. Google Drive) instead."); return; }
    const t = (title.trim() || file?.name || url.trim()).slice(0, 200);
    try {
      setProgress(0);
      await onSave({ kind, file, url: url.trim(), title: t, folder: folder.trim(), desc: desc.trim(), scope, notify }, setProgress);
      onClose();
    } catch (e) {
      setProgress(null);
      setErr((e?.code === "storage/unauthorized" || e?.code === "permission-denied") ? "You don't have permission to share to that team." : (e?.message || "Couldn't save — try again."));
    }
  };
  const busy = progress !== null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900">{editing ? "Edit document" : "Share a document"}</h3>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {!editing && (
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-full p-1">
            {[["file", "Upload a file"], ["link", "Share a link"]].map(([k, label]) => (
              <button key={k} onClick={() => setKind(k)} className={`py-1.5 rounded-full text-xs font-bold ${kind === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{label}</button>
            ))}
          </div>
        )}
        {!editing && kind === "file" && (
          <label className="block border border-dashed border-slate-300 rounded-xl px-3 py-4 text-center cursor-pointer">
            <input type="file" accept={DOC_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "")); }} />
            {file ? <span className="text-sm font-semibold text-slate-800">{file.name} <span className="text-slate-400 font-normal">· {fileSizeLabel(file.size)}</span></span>
              : <span className="text-sm text-slate-500"><Paperclip className="w-4 h-4 inline mr-1" />PDF, Word, PowerPoint, Excel, images… up to 50 MB</span>}
          </label>
        )}
        {kind === "link" && (
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Set-piece playbook)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <div>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} list="library-folders" placeholder="Folder (pick or type a new one)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="library-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <AutoGrowTextarea value={desc} onChange={(e) => setDesc(e.target.value)} minRows={2} placeholder="Short note for the team (optional)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        {!editing && (
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Share with</span>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-full p-1">
              {[["all", "All teams"], [activeTeamId, `${getTeamShortName(activeTeamId)} only`]].map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)} className={`py-1.5 rounded-full text-xs font-bold ${scope === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {!editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify players
          </label>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
        {busy && kind === "file" && !editing && (
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: COLORS.success }} /></div>
        )}
        <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50" style={{ backgroundColor: COLORS.primary }}>
          {busy ? (kind === "file" && !editing ? `Uploading… ${progress}%` : "Saving…") : editing ? "Save changes" : "Share"}
        </button>
      </div>
    </div>
  );
};

// Channel picker for sending a document or a whole folder into a chat. The
// message carries a link back here (attachment type "doc" / "folder"); tapping
// it in the chat opens Train → Documents on that folder / document.
export const SendToChatSheet = ({ label, chatGroups = [], onSend, onClose, note = "Posts a link in the chat. Tapping it opens it here in Train → Documents." }) => {
  const [busy, setBusy] = useState("");
  const channels = [{ id: "team", name: "Team" }, ...chatGroups.map((c) => ({ id: c.id, name: c.name }))];
  const send = async (ch) => {
    setBusy(ch.id);
    try { await onSend(ch.id); toast(`Sent to ${ch.name}.`, "success"); onClose(); }
    catch (e) { toast("Couldn't send — " + (e?.code === "permission-denied" ? "you can't post in that chat." : (e?.message || "try again."))); setBusy(""); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-2">
          <h3 className="font-bold text-base text-slate-900 truncate">Send {label} to…</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-2">
          {channels.map((ch) => (
            <button key={ch.id} onClick={() => send(ch)} disabled={!!busy} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-white disabled:opacity-60">
              <span className="flex items-center gap-2 font-semibold text-sm text-slate-800"><Hash className="w-4 h-4 text-slate-400" />{ch.name}</span>
              {busy === ch.id ? <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" style={{ color: COLORS.primary }} />}
            </button>
          ))}
          <p className="text-[10px] text-slate-400 leading-relaxed px-1 pt-1">{note}</p>
        </div>
      </div>
    </div>
  );
};

export const LibraryPage = ({ user, items = [], activeTeamId, addItem, updateItem, deleteItem, chatGroups = [], onSendToChat, focus = null }) => {
  const isAdmin = user.role === "admin";
  // `focus` = { folder, docId } when opened from a chat link (the page is
  // re-mounted per link, so it starts on that folder with the doc highlighted).
  const [folder, setFolder] = useState(focus?.folder || "All");
  const [sendTarget, setSendTarget] = useState(null); // { label, attachment, text }
  const focusRef = useRef(null);
  const focusDoc = focus?.docId ? items.find((i) => i.id === focus.docId) : null;
  const focusMissing = Boolean(focus?.docId) && !isLoading(items) && !focusDoc;
  useEffect(() => {
    if (focusDoc) focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusDoc]);
  const sendDoc = (i) => setSendTarget({
    label: `"${i.title}"`,
    text: `📄 ${i.title}`,
    attachment: { type: "doc", docId: i.id, name: i.title, folder: i.folder || "", docKind: i.kind || "file", fileType: i.fileType || "" },
  });
  const sendFolder = (f) => setSendTarget({
    label: `the ${f} folder`,
    text: `📁 ${f}`,
    attachment: { type: "folder", folder: f, name: f, count: items.filter((i) => i.folder === f).length },
  });
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null); // null | {} (new) | item (edit)
  const usedFolders = [...new Set(items.map((i) => i.folder).filter(Boolean))];
  const folders = [...new Set([...usedFolders, ...LIBRARY_FOLDERS])];
  const pills = ["All", ...usedFolders.sort((a, b) => a.localeCompare(b))];
  const activeFolder = pills.includes(folder) ? folder : "All";
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (activeFolder === "All" || i.folder === activeFolder || (i.id === focus?.docId && !needle))
    && (!needle || [i.title, i.desc, i.folder, i.name].some((v) => (v || "").toLowerCase().includes(needle))));
  const fmtDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString([], { month: "short", day: "numeric" }) : "");
  const remove = (i) => {
    if (!confirm(`Delete "${i.title}"? ${i.teamId === "all" ? "All three teams" : "The team"} will lose it.`)) return;
    Promise.resolve(deleteItem(i.id)).catch(reportError("Couldn't delete the document"));
  };
  return (
    <div className="px-5 pt-3 pb-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Documents</h3>
          <p className="text-xs text-slate-500">Playbooks, scouting, forms and plans from your coaches</p>
        </div>
        {isAdmin && <button onClick={() => setForm({})} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1 flex-shrink-0" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Share</button>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" />
      {pills.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
          {pills.map((f) => (
            <button key={f} onClick={() => setFolder(f)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: activeFolder === f ? COLORS.primary : "white", color: activeFolder === f ? "#fff" : COLORS.textSecondary, border: `1px solid ${activeFolder === f ? COLORS.primary : COLORS.border}` }}>{f}</button>
          ))}
        </div>
      )}
      {focusMissing && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">That document was removed or isn't shared with your team any more.</p>}
      {onSendToChat && activeFolder !== "All" && (
        <button onClick={() => sendFolder(activeFolder)} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200" style={{ color: COLORS.primary }}>
          <Folder className="w-3.5 h-3.5" /> Send the {activeFolder} folder to a chat
        </button>
      )}
      {isLoading(items) ? <p className="text-sm text-slate-400 text-center py-8">Loading documents…</p>
        : shown.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">{items.length ? "No documents match." : isAdmin ? "Nothing shared yet. Tap Share to add a playbook, form or link." : "Nothing shared yet."}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((i) => {
              const isLink = i.kind === "link";
              const isImg = !isLink && (i.fileType || "").startsWith("image/");
              return (
                <li key={i.id} ref={i.id === focus?.docId ? focusRef : undefined} className={`bg-white rounded-2xl shadow-sm border p-3 flex items-center gap-3 ${i.id === focus?.docId ? "border-transparent ring-2" : "border-slate-100"}`} style={i.id === focus?.docId ? { "--tw-ring-color": COLORS.accent } : undefined}>
                  {isImg ? <img src={i.url} alt="" loading="lazy" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 gap-0.5" style={{ backgroundColor: COLORS.accentSoft }}>
                      {isLink ? <LinkIcon className="w-4 h-4" style={{ color: COLORS.accent }} /> : <FileText className="w-4 h-4" style={{ color: COLORS.accent }} />}
                      <span className="text-[7px] font-black leading-none" style={{ color: COLORS.accent }}>{isLink ? "LINK" : docTypeLabel(i)}</span>
                    </div>}
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{i.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {[i.folder, i.teamId === "all" ? "All teams" : getTeamShortName(i.teamId), fileSizeLabel(i.size), fmtDate(i.createdAt)].filter(Boolean).join(" · ")}
                    </div>
                    {i.desc && <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{i.desc}</div>}
                  </a>
                  <a href={i.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${i.title}`} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                    {isLink ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  </a>
                  {onSendToChat && (
                    <button onClick={() => sendDoc(i)} aria-label={`Send ${i.title} to a chat`} title="Send to a chat" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => setForm(i)} aria-label={`Edit ${i.title}`} className="text-slate-300 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(i)} aria-label={`Delete ${i.title}`} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      {sendTarget && (
        <SendToChatSheet label={sendTarget.label} chatGroups={chatGroups}
          onSend={(channel) => onSendToChat(channel, sendTarget.text, sendTarget.attachment)}
          onClose={() => setSendTarget(null)} />
      )}
      {form && (
        <LibraryItemForm initial={form} activeTeamId={activeTeamId} folders={folders}
          onSave={(data, onProgress) => (form.id ? updateItem(form.id, { title: data.title, folder: data.folder, desc: data.desc, ...(form.kind === "link" ? { url: data.url } : {}) }) : addItem(data, onProgress))}
          onClose={() => setForm(null)} />
      )}
    </div>
  );
};

export const VideosPage = ({ user, videos, addVideo, updateVideo, deleteVideo, importVideos, videoFolders = [], addVideoFolder, renameVideoFolder, deleteVideoFolder, chatGroups = [], onSendToChat, focus = null }) => {
  // `focus` = { cat, subfolder, videoId } when opened from a chat link (the
  // page is re-mounted per link): starts on that folder, highlights the video
  // and opens it.
  const [catPref, setCat] = useState(focus?.cat || "Film");
  const [sendTarget, setSendTarget] = useState(null);
  const [focusDismissed, setFocusDismissed] = useState(false);
  const focusRef = useRef(null);
  const focusVideo = focus?.videoId ? videos.find((v) => v.id === focus.videoId) : null;
  const focusMissing = Boolean(focus?.videoId) && !isLoading(videos) && !focusVideo;
  useEffect(() => {
    if (focusVideo) focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusVideo]);
  const sendVideo = (v) => setSendTarget({
    label: `"${v.title}"`,
    text: `🎬 ${v.title}`,
    attachment: { type: "videoLink", videoId: v.id, name: v.title, cat: v.cat || "", subfolder: v.subfolder || "" },
  });
  const sendVideoFolder = (c, sub) => {
    const name = sub && sub !== "All" ? `${c} · ${sub}` : c;
    setSendTarget({
      label: `the ${name} folder`,
      text: `🎬 ${name}`,
      attachment: { type: "videoFolder", name, cat: c, subfolder: sub && sub !== "All" ? sub : "", count: videos.filter((v) => v.cat === c && (!sub || sub === "All" || v.subfolder === sub)).length },
    });
  };
  const [adding, setAdding] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [modal, setModal] = useState(null);
  const blank = { title: "", url: "", cat: "Film", subfolder: "", dur: "", diff: "Easy", desc: "", type: "video" };
  const [form, setForm] = useState(blank);
  const [subfolder, setSubfolder] = useState(focus?.subfolder || "All");
  const isAdmin = user.role === "admin";

  // Folder list: the six built-in folders plus any coach-created top-level
  // folders from Firestore (same union pattern as recipe categories).
  const customCats = useMemo(() => videoFolders.filter((f) => !f.parent).map((f) => f.name).filter(Boolean), [videoFolders]);
  // Any folder name a video is filed under also shows (F54: folders are
  // linked by name, so a video must never be hidden by a missing folder doc).
  const effectiveCats = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...VIDEO_CATS, ...customCats, ...videos.map((v) => v.cat)].forEach((c) => { if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    return out;
  }, [customCats, videos]);
  // If the open folder was deleted elsewhere, fall back to the first folder.
  // If the open folder was deleted elsewhere, fall back to the first folder
  // (derived during render — no state-syncing effect).
  const cat = effectiveCats.includes(catPref) ? catPref : (effectiveCats[0] || catPref);

  // Subfolders in the open folder: coach-created ones plus any typed on a
  // video already (so old videos keep their subfolder pills).
  const customSubs = useMemo(() => videoFolders.filter((f) => f.parent === cat).map((f) => f.name).filter(Boolean), [videoFolders, cat]);
  const subfolders = useMemo(() => {
    const set = new Set();
    videos.filter((v) => v.cat === cat).forEach((v) => v.subfolder && set.add(v.subfolder));
    customSubs.forEach((s) => set.add(s));
    return ["All", ...[...set].sort()];
  }, [videos, cat, customSubs]);

  // The folder the admin is looking at right now, when it is a custom one.
  // Rename and delete act on the open subfolder when one is open, otherwise
  // on the open folder. Built-in folders have no doc, so they cannot be
  // renamed or deleted.
  const activeCatDoc = videoFolders.find((f) => !f.parent && f.name === cat);
  const activeSubDoc = subfolder !== "All" ? videoFolders.find((f) => f.parent === cat && f.name === subfolder) : null;
  const managedFolder = activeSubDoc || activeCatDoc || null;

  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [folderMsg, setFolderMsg] = useState("");
  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setFolderMsg("");
    if (!name) return;
    if (effectiveCats.some((c) => c.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A folder named "${name}" already exists.`); return; }
    try {
      await addVideoFolder(name, null);
      setNewFolderName("");
      setShowNewFolder(false);
      setCat(name);
      setSubfolder("All");
      setFolderMsg(`Folder "${name}" added.`);
    } catch (e) { setFolderMsg("Couldn't add folder. " + (e.message || "Check Firestore rules.")); }
  };
  const submitNewSubfolder = async () => {
    const name = newSubName.trim();
    setFolderMsg("");
    if (!name) return;
    if (subfolders.some((s) => s !== "All" && s.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A subfolder named "${name}" already exists in ${cat}.`); return; }
    try {
      await addVideoFolder(name, cat);
      setNewSubName("");
      setShowNewSub(false);
      setSubfolder(name);
      setFolderMsg(`Subfolder "${name}" added to ${cat}.`);
    } catch (e) { setFolderMsg("Couldn't add subfolder. " + (e.message || "Check Firestore rules.")); }
  };
  const submitRename = async () => {
    if (!managedFolder) return;
    const name = renameName.trim();
    setFolderMsg("");
    if (!name || name === managedFolder.name) { setRenaming(false); return; }
    const siblings = managedFolder.parent ? subfolders.filter((s) => s !== "All") : effectiveCats;
    if (siblings.some((s) => s.toLowerCase() === name.toLowerCase())) { setFolderMsg(`A folder named "${name}" already exists.`); return; }
    try {
      await renameVideoFolder(managedFolder, name);
      if (!managedFolder.parent) setCat(name); else setSubfolder(name);
      setRenaming(false);
      setFolderMsg(`Renamed to "${name}".`);
    } catch (e) { setFolderMsg("Couldn't rename folder. " + (e.message || "Check Firestore rules.")); }
  };
  const deleteManagedFolder = async () => {
    if (!managedFolder) return;
    const inUse = managedFolder.parent
      ? videos.filter((v) => v.cat === managedFolder.parent && v.subfolder === managedFolder.name).length
      : videos.filter((v) => v.cat === managedFolder.name).length;
    const kidCount = !managedFolder.parent ? videoFolders.filter((f) => f.parent === managedFolder.name).length : 0;
    if (inUse > 0) { setFolderMsg(`This folder still has ${inUse} video${inUse === 1 ? "" : "s"}. Move or delete them first.`); return; }
    if (kidCount > 0) { setFolderMsg(`This folder still has ${kidCount} subfolder${kidCount === 1 ? "" : "s"}. Delete them first.`); return; }
    if (!confirm(`Delete the folder "${managedFolder.name}"?`)) return;
    try {
      await deleteVideoFolder(managedFolder.id);
      if (!managedFolder.parent) setCat("Film"); else setSubfolder("All");
      setFolderMsg(`Folder "${managedFolder.name}" deleted.`);
    } catch (e) { setFolderMsg("Couldn't delete folder. " + (e.message || "Check Firestore rules.")); }
  };

  const startEditVideo = (v) => {
    setEditingVideoId(v.id);
    setForm({ title: v.title || "", url: v.url || "", cat: v.cat || "Film", subfolder: v.subfolder || "", dur: v.dur || "", diff: v.diff || "Easy", desc: v.desc || "", type: v.type || "video" });
    setAdding(true);
  };
  const cancelEditVideo = () => { setEditingVideoId(null); setForm(blank); setAdding(false); };

  const doImport = async () => {
    setImportMsg("");
    const rows = parseVideoCSV(csvText);
    if (!rows.length) { setImportMsg("No valid rows. Needs title,url,cat,dur,diff,desc,type,subfolder."); return; }
    // Folders named in the sheet that do not exist yet are created first,
    // same as recipe categories on import.
    const newCats = [...new Set(rows.map((r) => r.cat))].filter((c) => c && !effectiveCats.some((e) => e.toLowerCase() === c.toLowerCase()));
    try {
      // Import the videos first; only then create any new folders, so a failed
      // import never leaves empty folders behind.
      await importVideos(rows);
      for (const c of newCats) await addVideoFolder(c, null);
      setImportMsg(`Imported ${rows.length} video${rows.length === 1 ? "" : "s"}${newCats.length ? `, added ${newCats.length} new folder${newCats.length === 1 ? "" : "s"}` : ""}.`);
      setCsvText("");
    } catch (e) {
      setImportMsg("Couldn't import — " + (e.message || "check rules?"));
    }
  };
  const filtered = videos.filter((v) => v.cat === cat && (subfolder === "All" || v.subfolder === subfolder));
  const add = async () => {
    if (!form.title.trim()) return;
    try {
      const data = { ...form, title: form.title.trim(), url: form.url.trim(), desc: form.desc.trim() };
      if (editingVideoId) await updateVideo(editingVideoId, data);
      else await addVideo(data);
      setForm(blank);
      setEditingVideoId(null);
      setAdding(false);
    } catch (e) {
      toast("Couldn't save video — " + (e.message || "check Firestore rules."));
    }
  };
  const del = (id) => {
    if (!confirm("Delete this video from the library? All three teams will lose it.")) return;
    deleteVideo(id).catch(reportError("Couldn't delete the video"));
  };

  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-900">Videos & Links</h3>
        {isAdmin ? (
          <div className="flex gap-2">
            <button onClick={() => { setImporting(!importing); setImportMsg(""); }} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border-2 bg-white" style={{ borderColor: COLORS.primary, color: COLORS.primary }}>Import</button>
            <button onClick={() => setAdding(!adding)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: COLORS.primary }}><Plus className="w-3 h-3" /> Upload</button>
          </div>
        ) : <ReadOnlyHint label="Coach uploads film & drills" />}
      </div>

      {isAdmin && importing && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <div className="text-[11px] font-semibold text-slate-600">Paste a video CSV — one video per line.</div>
          <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setImportMsg(""); }} rows={8} placeholder={VIDEO_CSV_TEMPLATE} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="flex gap-2">
            <label className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 text-center cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsvText(String(r.result)); r.readAsText(f); }} />
            </label>
            <button onClick={() => setCsvText(VIDEO_CSV_TEMPLATE)} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Fill Example</button>
            <button onClick={doImport} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: COLORS.primary }}>Import</button>
          </div>
          {importMsg && <p className="text-[10px] font-semibold px-1" style={{ color: importMsg.startsWith("Imported") ? COLORS.success : "#dc2626" }}>{importMsg}</p>}
          <p className="text-[10px] text-slate-400 leading-relaxed px-1">
            Columns: <span className="font-mono">title,url,cat,dur,diff,desc,type,subfolder</span>. <span className="font-semibold">cat</span> is a folder name. New folders are created automatically. <span className="font-semibold">subfolder</span> is optional, the name of a subfolder inside that folder, blank for none. <span className="font-semibold">diff</span> Easy/Medium/Hard. <span className="font-semibold">type</span> video/audio/external. Wrap descriptions containing commas in "quotes".
          </p>
        </div></div>
      )}

      {isAdmin && adding && (
        <div className="px-5"><div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="YouTube / Vimeo / link URL" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <div className="grid grid-cols-3 gap-2">
            <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{effectiveCats.map((c) => <option key={c}>{c}</option>)}</select>
            <input value={form.dur} onChange={(e) => setForm({ ...form, dur: e.target.value })} placeholder="Duration" className="border border-slate-200 rounded-lg px-2 py-2 text-xs" />
            <select value={form.diff} onChange={(e) => setForm({ ...form, diff: e.target.value })} className="border border-slate-200 rounded-lg px-2 py-2 text-xs">{["Easy", "Medium", "Hard"].map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <input list="video-subfolders" value={form.subfolder} onChange={(e) => setForm({ ...form, subfolder: e.target.value })} placeholder="Subfolder (optional, e.g. Opponents 2026)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <datalist id="video-subfolders">{subfolders.filter((s) => s !== "All").map((s) => <option key={s} value={s} />)}</datalist>
          <input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Short description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2"><button onClick={cancelEditVideo} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">Cancel</button><button onClick={add} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ backgroundColor: COLORS.primary }}>{editingVideoId ? "Save Changes" : "Publish"}</button></div>
        </div></div>
      )}

      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {effectiveCats.map((c) => (
            <button key={c} onClick={() => { setCat(c); setSubfolder("All"); }} className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${cat === c ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={cat === c ? { backgroundColor: COLORS.primary } : {}}>{c}</button>
          ))}
          {isAdmin && (
            <button onClick={() => { setShowNewFolder((s) => !s); setFolderMsg(""); }} className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap bg-white text-slate-600 border border-dashed border-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Folder</button>
          )}
        </div>
      </div>

      {isAdmin && showNewFolder && (
        <div className="px-5 flex gap-2">
          <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <button onClick={submitNewFolder} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Add folder</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
        </div>
      )}

      {/* Subfolder pills (only when subfolders exist for this category). Coaches
          always see the New subfolder button, even before the first one. */}
      {(subfolders.length > 1 || isAdmin) && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {subfolders.map((s) => (
              <button key={s} onClick={() => setSubfolder(s)} className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${subfolder === s ? "text-white" : "bg-white text-slate-600 border border-slate-200"}`} style={subfolder === s ? { backgroundColor: COLORS.accent, color: "#fff" } : {}}>{s}</button>
            ))}
            {isAdmin && (
              <button onClick={() => { setShowNewSub((s) => !s); setFolderMsg(""); }} className="px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-white text-slate-600 border border-dashed border-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Subfolder</button>
            )}
          </div>
        </div>
      )}

      {isAdmin && showNewSub && (
        <div className="px-5 flex gap-2">
          <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder={`New subfolder in ${cat}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
          <button onClick={submitNewSubfolder} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Add subfolder</button>
          <button onClick={() => { setShowNewSub(false); setNewSubName(""); }} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
        </div>
      )}

      <div className="px-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{cat}{subfolder !== "All" ? ` · ${subfolder}` : ""}</h3>
          {isAdmin && managedFolder && !renaming && (
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => { setRenameName(managedFolder.name); setRenaming(true); setFolderMsg(""); }} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-slate-600 flex items-center gap-1"><Pencil className="w-3 h-3" /> Rename</button>
              <button onClick={deleteManagedFolder} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white border border-slate-200 text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
            </div>
          )}
        </div>
        {isAdmin && renaming && managedFolder && (
          <div className="flex gap-2 mb-3">
            <input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="Folder name" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <button onClick={submitRename} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: COLORS.primary }}>Save</button>
            <button onClick={() => setRenaming(false)} className="px-3 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex-shrink-0">Cancel</button>
          </div>
        )}
        {folderMsg && <p className="text-[11px] font-semibold text-slate-600 mb-3">{folderMsg}</p>}
        {focusMissing && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">That video was removed from the library.</p>}
        {onSendToChat && filtered.length > 0 && (
          <button onClick={() => sendVideoFolder(cat, subfolder)} className="w-full flex items-center justify-center gap-2 py-2 mb-3 rounded-xl text-xs font-bold bg-white border border-slate-200" style={{ color: COLORS.primary }}>
            <Folder className="w-3.5 h-3.5" /> Send the {cat}{subfolder !== "All" ? ` · ${subfolder}` : ""} folder to a chat
          </button>
        )}
        {isLoading(videos) ? <LoadingNote /> : filtered.length === 0 ? <p className="text-sm text-slate-400 italic">Nothing here yet.</p> : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((v) => {
              const Icon = CAT_ICON[v.cat] || Video;
              return (
                <div key={v.id} ref={v.id === focus?.videoId ? focusRef : undefined} className={`bg-white rounded-2xl p-4 shadow-sm border relative ${v.id === focus?.videoId ? "border-transparent ring-2" : "border-slate-100"} ${onSendToChat ? "pb-11" : ""}`} style={v.id === focus?.videoId ? { "--tw-ring-color": COLORS.accent } : undefined}>
                  <button onClick={() => setModal(v)} className="text-left w-full">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: COLORS.accentSoft }}><Icon className="w-5 h-5" style={{ color: COLORS.accent }} /></div>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight pr-4">{v.title}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">{v.dur}</span><span className="text-[10px] text-slate-300">·</span>
                      <span className={`text-[10px] font-bold uppercase ${v.diff === "Easy" ? "text-emerald-600" : v.diff === "Medium" ? "text-orange-500" : "text-red-500"}`}>{v.diff}</span>
                    </div>
                    {v.desc && <p className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2">{v.desc}</p>}
                  </button>
                  {onSendToChat && (
                    <button onClick={(e) => { e.stopPropagation(); sendVideo(v); }} aria-label={`Send ${v.title} to a chat`} title="Send to a chat" className="absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); startEditVideo(v); }} title="Edit" className="text-slate-300 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); del(v.id); }} title="Delete" className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal ? <VideoModal item={modal} onClose={() => setModal(null)} />
        : focusVideo && !focusDismissed ? <VideoModal item={focusVideo} onClose={() => setFocusDismissed(true)} /> : null}
      {sendTarget && (
        <SendToChatSheet label={sendTarget.label} chatGroups={chatGroups} note="Posts a link in the chat. Tapping it opens it here in Train → Videos."
          onSend={(channel) => onSendToChat(channel, sendTarget.text, sendTarget.attachment)}
          onClose={() => setSendTarget(null)} />
      )}
    </div>
  );
};

export const VideoModal = ({ item, onClose }) => {
  const embedUrl = toEmbedUrl(item.url);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start justify-between border-b border-slate-100">
          <div className="flex-1 pr-2"><span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{item.cat}</span><h3 className="text-lg font-bold text-slate-900 mt-2 leading-tight">{item.title}</h3></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {embedUrl ? (
            <div className="aspect-video rounded-2xl bg-slate-900 overflow-hidden">
              <iframe
                src={embedUrl}
                title={item.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                sandbox={EMBED_SANDBOX}
                allowFullScreen
              />
            </div>
          ) : item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="aspect-video rounded-2xl bg-slate-900 flex items-center justify-center relative overflow-hidden block hover:opacity-90">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}><Play className="w-6 h-6 text-white fill-white ml-1" /></div>
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded">Open link ↗</div>
            </a>
          ) : (
            <div className="aspect-video rounded-2xl bg-slate-900 flex items-center justify-center text-white/50 text-xs font-medium">No URL on this video</div>
          )}
          <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
          <div className="flex gap-4 text-xs"><div><div className="text-slate-400 uppercase font-bold tracking-wider">Duration</div><div className="font-bold text-slate-900 mt-1">{item.dur}</div></div><div><div className="text-slate-400 uppercase font-bold tracking-wider">Difficulty</div><div className="font-bold text-slate-900 mt-1">{item.diff}</div></div></div>
        </div>
      </div>
    </div>
  );
};
