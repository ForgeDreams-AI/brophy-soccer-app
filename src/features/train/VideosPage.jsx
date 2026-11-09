// VideosPage — the Videos & Links library: category pills (Film / Breathing /
// Stretching / Mobility / Strength / Cooldown), client-side-derived subfolder
// pills, a 2-col card grid (difficulty color-coded, duration, line-clamp-2
// descriptions), an admin add/edit Sheet, CSV import via the shared
// ui/CsvImporter, and a player embed modal. Players see a ReadOnlyHint.
// (react-refresh/only-export-components is disabled project-wide in
// eslint.config.js: page modules intentionally export pure helpers too.)
//
// Video doc: { title, url, cat, subfolder, dur, diff, desc, type } (+createdAt).
// `type` (video/audio/external) is preserved on the doc and parsed on import,
// but rendering treats everything through toEmbedUrl with an external-tile
// fallback — same as the v1 app.
import { useMemo, useState } from "react";
import {
  Video,
  Wind,
  StretchHorizontal,
  Activity,
  Dumbbell,
  Snowflake,
  Play,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import Sheet from "../../components/ui/Sheet";
import Btn from "../../components/ui/Btn";
import Field, { Input, TextArea, Select } from "../../components/ui/Field";
import CsvImporter from "../../components/ui/CsvImporter";
import ReadOnlyHint from "../../components/ui/ReadOnlyHint";
import EmptyState from "../../components/ui/EmptyState";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { toast } from "../../lib/toast";
import { parseCsv } from "../../lib/csv";
import { useTrainVideos } from "./hooks";

export const VIDEO_CATS = ["Film", "Breathing", "Stretching", "Mobility", "Strength", "Cooldown"];
const CAT_ICON = {
  Film: Video,
  Breathing: Wind,
  Stretching: StretchHorizontal,
  Mobility: Activity,
  Strength: Dumbbell,
  Cooldown: Snowflake,
};
const DIFFS = ["Easy", "Medium", "Hard"];
const DIFF_CLS = {
  Easy: "text-green-600",
  Medium: "text-amber-600",
  Hard: "text-red-500",
};
const TYPES = ["video", "audio", "external"];

const VIDEO_CSV_TEMPLATE = `title,url,cat,dur,diff,desc,type
10 Min Breathwork for Athletes,https://www.youtube.com/watch?v=n34DBL-dZNU,Breathing,10 min,Easy,"Focus + flow state breathwork",video
Soccer Hip Mobility Routine,https://www.youtube.com/watch?v=5NN9SuYO2YU,Mobility,5 min,Easy,"Quick pre-game hip prep",video`;

// YouTube (watch/shorts/live/youtu.be, incl. t/start) / Vimeo / Instagram
// (post/reel/tv) → embed URL. Anything else → null (renders an external tile).
export function toEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) {
        const t = u.searchParams.get("t") || u.searchParams.get("start");
        const start = t ? parseInt(t, 10) : null;
        return `https://www.youtube.com/embed/${v}${start ? `?start=${start}` : ""}`;
      }
      if (u.pathname.startsWith("/embed/")) return url;
      const shortMatch = u.pathname.match(/^\/(?:shorts|live)\/([^/?]+)/);
      if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
    }
    if (host === "youtu.be") {
      const v = u.pathname.replace(/^\//, "");
      if (v) {
        const t = u.searchParams.get("t");
        const start = t ? parseInt(t, 10) : null;
        return `https://www.youtube.com/embed/${v}${start ? `?start=${start}` : ""}`;
      }
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
    // Instagram posts / reels / IGTV — embed the public post via /embed.
    // Private posts won't embed; they fall back to the external tile.
    if (host === "instagram.com" || host === "instagr.am") {
      const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([^/?]+)/);
      if (m) {
        const type = m[1] === "reels" ? "reel" : m[1];
        return `https://www.instagram.com/${type}/${m[2]}/embed`;
      }
    }
  } catch {
    /* not a parseable URL */
  }
  return null;
}

// Parse import text into video rows. Handles an optional header row and
// invalid cat/diff/type values (they fall back to sane defaults).
export function parseVideoCsv(text) {
  let rows = text;
  const first = String(text).trim().split(/\r?\n/)[0]?.toLowerCase() || "";
  if (!(first.includes("title") && first.includes("url"))) {
    rows = "title,url,cat,dur,diff,desc,type\n" + String(text).trim();
  }
  const validCat = (c) => (VIDEO_CATS.includes(c) ? c : "Film");
  const validDiff = (d) => (DIFFS.includes(d) ? d : "Easy");
  const validType = (x) => (TYPES.includes(x) ? x : "video");
  return parseCsv(rows)
    .map((r) => ({
      title: (r.title || "").trim(),
      url: (r.url || "").trim(),
      cat: validCat((r.cat || "").trim()),
      subfolder: "",
      dur: (r.dur || "").trim() || "—",
      diff: validDiff((r.diff || "").trim()),
      desc: (r.desc || "").trim(),
      type: validType((r.type || "").trim()),
    }))
    .filter((r) => r.title && r.url);
}

const VideoModal = ({ item, onClose }) => {
  const embedUrl = toEmbedUrl(item.url);
  return (
    <Sheet open onClose={onClose} title={item.title} subtitle={item.cat} size="md">
      <div className="px-5 pb-5 pt-1 space-y-4">
        {embedUrl ? (
          <div className="aspect-video rounded-[20px] bg-ink overflow-hidden">
            <iframe
              src={embedUrl}
              title={item.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="aspect-video rounded-[20px] bg-ink flex items-center justify-center relative overflow-hidden hover:opacity-90"
          >
            <div className="w-14 h-14 rounded-full bg-brand-primary flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            </div>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              Open link <ExternalLink className="w-3 h-3" />
            </div>
          </a>
        ) : (
          <div className="aspect-video rounded-[20px] bg-ink flex items-center justify-center text-white/50 text-xs font-medium">
            No URL on this video
          </div>
        )}
        {item.desc && <p className="text-sm text-ink-soft leading-relaxed">{item.desc}</p>}
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-ink-faint uppercase font-bold tracking-wider text-[11px]">
              Duration
            </div>
            <div className="font-bold text-ink mt-1">{item.dur}</div>
          </div>
          <div>
            <div className="text-ink-faint uppercase font-bold tracking-wider text-[11px]">
              Difficulty
            </div>
            <div className={`font-bold mt-1 ${DIFF_CLS[item.diff] || ""}`}>{item.diff}</div>
          </div>
          {item.subfolder && (
            <div>
              <div className="text-ink-faint uppercase font-bold tracking-wider text-[11px]">
                Folder
              </div>
              <div className="font-bold text-ink mt-1">{item.subfolder}</div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
};

const blankForm = {
  title: "",
  url: "",
  cat: "Film",
  subfolder: "",
  dur: "",
  diff: "Easy",
  desc: "",
  type: "video",
};

export default function VideosPage({ user }) {
  const { videos, addVideo, updateVideo, deleteVideo, importVideos } = useTrainVideos();
  const confirm = useConfirm();
  const isAdmin = user?.role === "admin";

  const [cat, setCat] = useState("Film");
  const [subfolder, setSubfolder] = useState("All");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);

  // Subfolders derived from videos in the active category — the coach just
  // types a name in the form and the pill appears for everyone.
  const subfolders = useMemo(() => {
    const set = new Set();
    videos.filter((v) => v.cat === cat).forEach((v) => v.subfolder && set.add(v.subfolder));
    return ["All", ...[...set].sort()];
  }, [videos, cat]);

  const openAdd = () => {
    setEditingId(null);
    setForm(blankForm);
    setSheetOpen(true);
  };
  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({
      title: v.title || "",
      url: v.url || "",
      cat: v.cat || "Film",
      subfolder: v.subfolder || "",
      dur: v.dur || "",
      diff: v.diff || "Easy",
      desc: v.desc || "",
      type: v.type || "video",
    });
    setSheetOpen(true);
  };
  const save = async () => {
    if (!form.title.trim()) {
      toast("Give the video a title first.", "info");
      return;
    }
    if (!form.url.trim()) {
      toast("Add a YouTube / Vimeo / link URL.", "info");
      return;
    }
    try {
      const data = {
        ...form,
        title: form.title.trim(),
        url: form.url.trim(),
        subfolder: form.subfolder.trim(),
        dur: form.dur.trim() || "—",
        desc: form.desc.trim(),
      };
      if (editingId) await updateVideo(editingId, data);
      else await addVideo(data);
      setSheetOpen(false);
      setEditingId(null);
      setForm(blankForm);
      toast(editingId ? "Video updated." : "Video published.", "success");
    } catch (e) {
      toast("Couldn't save the video — " + (e?.message || "check Firestore rules."));
    }
  };
  const del = async (v) => {
    const ok = await confirm({
      title: "Delete video?",
      body: `“${v.title}” will be removed from the library.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteVideo(v.id);
      toast("Video deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e?.message || ""));
    }
  };
  const doCsvImport = async (text) => {
    const rows = parseVideoCsv(text);
    if (!rows.length) throw new Error("No valid rows — need at least a title and a URL per row.");
    await importVideos(rows);
    return `Imported ${rows.length} video${rows.length === 1 ? "" : "s"}.`;
  };

  const filtered = videos.filter(
    (v) => v.cat === cat && (subfolder === "All" || v.subfolder === subfolder),
  );

  return (
    <div className="pt-5 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink">
          Videos &amp; Links
        </h3>
        {isAdmin ? (
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              Import
            </Btn>
            <Btn variant="primary" size="sm" icon={Plus} onClick={openAdd}>
              Upload
            </Btn>
          </div>
        ) : (
          <ReadOnlyHint label="Coach uploads film & drills" />
        )}
      </div>

      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {VIDEO_CATS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                setSubfolder("All");
              }}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                cat === c
                  ? "bg-brand-primary text-white shadow-card"
                  : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Subfolder pills (only when subfolders exist for this category) */}
      {subfolders.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {subfolders.map((s) => (
              <button
                key={s}
                onClick={() => setSubfolder(s)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                  subfolder === s
                    ? "bg-brand-accent text-[var(--th-primary-deep)] shadow-card"
                    : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-faint mb-3">
          {cat}
          {subfolder !== "All" ? ` · ${subfolder}` : ""}
        </h3>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Video}
            title="Nothing here yet"
            body={isAdmin ? "Upload the first video for this category." : "Your coach hasn't added any videos here yet."}
            action={isAdmin ? <Btn variant="primary" size="sm" icon={Plus} onClick={openAdd}>Upload video</Btn> : null}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((v) => {
              const Icon = CAT_ICON[v.cat] || Video;
              return (
                <div
                  key={v.id}
                  className="bg-[var(--th-surface)] rounded-[20px] p-4 shadow-card border border-[var(--th-surface-2)] relative"
                >
                  <button onClick={() => setModal(v)} className="text-left w-full">
                    <div className="w-10 h-10 rounded-xl bg-brand-accent-soft flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 text-brand-accent" />
                    </div>
                    <h4 className="font-bold text-sm text-ink leading-tight pr-4">{v.title}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] font-semibold text-ink-soft uppercase">
                        {v.dur}
                      </span>
                      <span className="text-[11px] text-ink-faint">·</span>
                      <span
                        className={`text-[11px] font-bold uppercase ${DIFF_CLS[v.diff] || "text-ink-soft"}`}
                      >
                        {v.diff}
                      </span>
                    </div>
                    {v.desc && (
                      <p className="text-[11px] text-ink-soft mt-1.5 leading-snug line-clamp-2">
                        {v.desc}
                      </p>
                    )}
                  </button>
                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(v);
                        }}
                        title="Edit"
                        className="text-ink-faint hover:text-ink"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          del(v);
                        }}
                        title="Delete"
                        className="text-ink-faint hover:text-[var(--th-danger)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin add/edit sheet */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingId ? "Edit video" : "Upload video"}
        subtitle="YouTube, Vimeo, Instagram, or any link"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => setSheetOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" className="flex-1" onClick={save}>
              {editingId ? "Save changes" : "Publish"}
            </Btn>
          </div>
        }
      >
        <div className="px-5 pb-5 pt-1 space-y-3">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Full-Body Strength Session"
            />
          </Field>
          <Field label="URL">
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="YouTube / Vimeo / link URL"
              inputMode="url"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Category">
              <Select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>
                {VIDEO_CATS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duration">
              <Input
                value={form.dur}
                onChange={(e) => setForm({ ...form, dur: e.target.value })}
                placeholder="10 min"
              />
            </Field>
            <Field label="Difficulty">
              <Select value={form.diff} onChange={(e) => setForm({ ...form, diff: e.target.value })}>
                {DIFFS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Subfolder" hint="Optional — typed once, shows up as a pill for everyone.">
            <Input
              list="video-subfolders"
              value={form.subfolder}
              onChange={(e) => setForm({ ...form, subfolder: e.target.value })}
              placeholder="e.g. Opponents 2026"
            />
            <datalist id="video-subfolders">
              {subfolders
                .filter((s) => s !== "All")
                .map((s) => (
                  <option key={s} value={s} />
                ))}
            </datalist>
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <TextArea
              rows={2}
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Short description"
            />
          </Field>
        </div>
      </Sheet>

      {/* Admin CSV import */}
      <CsvImporter
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import videos"
        subtitle="One video per line"
        template={VIDEO_CSV_TEMPLATE}
        importLabel="Import videos"
        onImport={doCsvImport}
        help={
          <>
            Columns: <span className="font-mono">title,url,cat,dur,diff,desc,type</span>.{" "}
            <span className="font-semibold">cat</span> is one of {VIDEO_CATS.join(", ")}.{" "}
            <span className="font-semibold">diff</span> is Easy / Medium / Hard.{" "}
            <span className="font-semibold">type</span> is video / audio / external. Wrap
            descriptions containing commas in "quotes". The header row is optional.
          </>
        }
      />

      {modal && <VideoModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
