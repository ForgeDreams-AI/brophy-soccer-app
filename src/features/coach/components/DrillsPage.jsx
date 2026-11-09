// Drill Library — the coach's drill catalog: category filter + tag pills,
// 2-col cards, add/edit in a Sheet (photo uploads + TacticsBoard diagrams),
// and a detail modal. Drill doc shape (mirrors v1 exactly):
//   { name, cat, tags[], dur, players, equipment, desc, info, videoUrl,
//     photos[], diagram (PNG URL), diagramData (editable board JSON) }

import { useMemo, useState } from "react";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Tag,
  Clock,
  Users,
  Dumbbell,
  ImagePlus,
  Layers,
  Image as ImageIcon,
  Target,
} from "lucide-react";
import { useTheme } from "../../../theme/ThemeProvider";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { Field, Input, TextArea, Select } from "../../../components/ui/Field";
import SearchInput from "../../../components/ui/SearchInput";
import EmptyState from "../../../components/ui/EmptyState";
import { toast } from "../../../lib/toast";
import TacticsBoard from "../TacticsBoard";
import { uploadDrillPhoto, uploadDrillDiagram } from "../hooks";
import { DRILL_CATS, DRILL_CAT_ICON, toEmbedUrl, ReadOnlyHint } from "./shared";

const blankForm = () => ({
  name: "",
  cat: DRILL_CATS[0],
  tags: "",
  dur: "",
  players: "",
  equipment: "",
  desc: "",
  info: "",
  videoUrl: "",
  photos: [],
  diagram: "",
  diagramData: null,
});

// ─── Small reusable drill thumbnail (photo or category-icon tile) ───────────
export const DrillThumb = ({ d, className = "w-10 h-10" }) => {
  const Icon = DRILL_CAT_ICON[d.cat] || Target;
  return d.photos?.[0] ? (
    <img
      src={d.photos[0]}
      alt=""
      className={`${className} rounded-lg object-cover flex-shrink-0`}
      loading="lazy"
    />
  ) : (
    <div
      className={`${className} rounded-lg flex items-center justify-center flex-shrink-0 bg-brand-accent-soft`}
    >
      <Icon className="w-4 h-4 text-brand-accent" />
    </div>
  );
};

const DrillChip = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft bg-[var(--th-surface-2)] rounded-full px-2.5 py-1">
    <Icon className="w-3 h-3 text-brand-accent" /> {children}
  </span>
);

// Snap photo carousel inside the drill detail modal.
const PhotoCarousel = ({ photos = [] }) => {
  const [idx, setIdx] = useState(0);
  if (!photos.length) return null;
  return (
    <div className="relative">
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-brand-deep [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", aspectRatio: "4 / 3" }}
      >
        {photos.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Photo ${i + 1}`}
            className="w-full h-full flex-shrink-0 snap-center object-cover"
            loading="lazy"
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Drill detail modal ─────────────────────────────────────────────────────
export const DrillModal = ({ item, onClose }) => {
  const embedUrl = item.videoUrl ? toEmbedUrl(item.videoUrl) : null;
  return (
    <Sheet open onClose={onClose} title={item.name} size="lg" subtitle={item.cat || "Drill"}>
      <div className="px-5 py-4 space-y-4">
        {item.photos?.length > 0 && <PhotoCarousel photos={item.photos} />}
        {(item.dur || item.players || item.equipment) && (
          <div className="flex flex-wrap gap-1.5">
            {item.dur && <DrillChip icon={Clock}>{item.dur}</DrillChip>}
            {item.players && <DrillChip icon={Users}>{item.players}</DrillChip>}
            {item.equipment && <DrillChip icon={Dumbbell}>{item.equipment}</DrillChip>}
          </div>
        )}
        {item.desc && <p className="text-sm text-ink-soft leading-relaxed">{item.desc}</p>}
        {item.info && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              Coaching points
            </h4>
            <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">{item.info}</p>
          </div>
        )}
        {embedUrl && (
          <div className="aspect-video rounded-2xl bg-brand-deep overflow-hidden">
            <iframe
              src={embedUrl}
              title={item.name}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}
        {item.diagram && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              Diagram
            </h4>
            <img
              src={item.diagram}
              alt="Drill diagram"
              className="w-full rounded-2xl border border-[var(--th-surface-2)]"
            />
          </div>
        )}
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-semibold text-ink-soft bg-[var(--th-surface-2)] rounded-full px-2 py-0.5"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
};

// ─── Pick a drill to drop into a practice block ─────────────────────────────
export const DrillPicker = ({ drills, onPick, onClose }) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const cats = useMemo(() => [...new Set(drills.map((d) => d.cat).filter(Boolean))], [drills]);
  const hits = q
    ? drills.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.tags || []).some((t) => t.toLowerCase().includes(q)),
      )
    : null;
  const row = (d) => (
    <button
      key={d.id}
      onClick={() => onPick(d)}
      className="w-full bg-[var(--th-surface)] rounded-xl p-2.5 shadow-card border border-[var(--th-surface-2)] flex items-center gap-3 hover:bg-[var(--th-bg)] text-left"
    >
      <DrillThumb d={d} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink leading-tight truncate">{d.name}</div>
        <div className="text-[11px] text-ink-faint mt-0.5 truncate">
          {d.cat}
          {d.dur ? ` · ${d.dur}` : ""}
        </div>
      </div>
      <Plus className="w-4 h-4 text-ink-faint flex-shrink-0" />
    </button>
  );
  return (
    <Sheet open onClose={onClose} title="Add a drill" size="lg">
      <div className="px-5 py-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search drills…" />
        {drills.length === 0 && (
          <p className="text-sm text-ink-faint italic text-center py-6">
            No drills yet — add some in the Drills tab first.
          </p>
        )}
        {hits ? (
          <div className="space-y-2">
            {hits.map(row)}
            {hits.length === 0 && (
              <p className="text-sm text-ink-faint italic text-center py-4">No matches.</p>
            )}
          </div>
        ) : (
          cats.map((c) => (
            <div key={c}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5 mt-2">
                {c}
              </h4>
              <div className="space-y-2">{drills.filter((d) => d.cat === c).map(row)}</div>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
};

// ─── Drill Library page ─────────────────────────────────────────────────────
export default function DrillsPage({ user, coach, startCreating = false }) {
  const { t } = useTheme();
  const confirm = useConfirm();
  const isAdmin = user.role === "admin";
  const drills = coach.drills;

  const [cat, setCat] = useState(DRILL_CATS[0]);
  const [tag, setTag] = useState("All");
  const [sheetOpen, setSheetOpen] = useState(startCreating);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [modal, setModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  // Categories = the defaults plus anything a coach has already typed.
  const cats = useMemo(() => {
    const set = new Set(DRILL_CATS);
    drills.forEach((d) => d.cat && set.add(d.cat));
    return [...set];
  }, [drills]);
  // Tag pills are scoped to the active category.
  const tags = useMemo(() => {
    const set = new Set();
    drills
      .filter((d) => d.cat === cat)
      .forEach((d) => (d.tags || []).forEach((tagName) => set.add(tagName)));
    return ["All", ...[...set].sort()];
  }, [drills, cat]);
  const filtered = drills.filter(
    (d) => d.cat === cat && (tag === "All" || (d.tags || []).includes(tag)),
  );

  // ── Uploads ──
  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of Array.from(files)) {
        const { url } = await uploadDrillPhoto(user.uid, f);
        urls.push(url);
      }
      setForm((p) => ({ ...p, photos: [...p.photos, ...urls] }));
    } catch (e) {
      toast("Couldn't upload photo — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };
  const setDiagramUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      setForm((p) => ({ ...p, diagram: "" }));
      const { url } = await uploadDrillPhoto(user.uid, file);
      setForm((p) => ({ ...p, diagram: url }));
    } catch (e) {
      toast("Couldn't upload diagram — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };
  // Save the tactics board: rasterize to a PNG diagram (so it renders anywhere
  // a drill diagram shows) and keep the editable JSON so it can be reopened.
  const saveBoard = async (pngBlob, state) => {
    setBoardOpen(false);
    setForm((p) => ({ ...p, diagramData: state }));
    if (!pngBlob) return;
    setUploading(true);
    try {
      const { url } = await uploadDrillDiagram(user.uid, pngBlob);
      setForm((p) => ({ ...p, diagram: url }));
    } catch (e) {
      toast("Couldn't save board image — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };

  // ── Add / edit ──
  const startEdit = (d) => {
    setEditingId(d.id);
    setForm({
      name: d.name || "",
      cat: d.cat || DRILL_CATS[0],
      tags: (d.tags || []).join(", "),
      dur: d.dur || "",
      players: d.players || "",
      equipment: d.equipment || "",
      desc: d.desc || "",
      info: d.info || "",
      videoUrl: d.videoUrl || "",
      photos: d.photos || [],
      diagram: d.diagram || "",
      diagramData: d.diagramData || null,
    });
    setSheetOpen(true);
  };
  const cancel = () => {
    setEditingId(null);
    setForm(blankForm());
    setSheetOpen(false);
    setNewCat(false);
  };
  const save = async () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      cat: (form.cat || "").trim() || DRILL_CATS[0],
      tags: form.tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      dur: form.dur.trim(),
      players: form.players.trim(),
      equipment: form.equipment.trim(),
      desc: form.desc.trim(),
      info: form.info.trim(),
      videoUrl: form.videoUrl.trim(),
      photos: form.photos,
      diagram: form.diagram,
      diagramData: form.diagramData || null,
    };
    try {
      if (editingId) await coach.updateDrill(editingId, data);
      else await coach.addDrill(data);
      setCat(data.cat);
      cancel();
      toast(editingId ? "Drill saved." : "Drill added.", "success");
    } catch (e) {
      toast("Couldn't save drill — " + (e.message || "check Firestore rules."));
    }
  };
  // v1 deleted drills with NO confirmation — every destructive action must
  // confirm (CONTRACT hard rule 8).
  const del = async (d) => {
    const ok = await confirm({
      title: `Delete "${d.name}"?`,
      body: "The drill, its photos and its diagram will be gone. Practices that reference it keep their own snapshots.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await coach.deleteDrill(d.id);
      toast("Drill deleted.", "success");
    } catch (e) {
      toast("Couldn't delete — " + (e.message || "check Firestore rules."));
    }
  };

  return (
    <div className="pt-1 pb-4 space-y-5">
      <div className="px-5 flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink">
          Drill Library
        </h3>
        {isAdmin ? (
          <Btn
            size="sm"
            icon={Plus}
            onClick={() => (sheetOpen ? cancel() : (setForm(blankForm()), setEditingId(null), setSheetOpen(true)))}
          >
            New drill
          </Btn>
        ) : (
          <ReadOnlyHint label="Coach builds the drills" />
        )}
      </div>

      {/* Category pills */}
      <div className="overflow-x-auto px-5">
        <div className="flex gap-2 w-max">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCat(c);
                setTag("All");
              }}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
                cat === c
                  ? "text-white"
                  : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
              }`}
              style={cat === c ? { backgroundColor: t("primary") } : {}}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Tag pills (only when the active category has tags) */}
      {tags.length > 1 && (
        <div className="overflow-x-auto px-5">
          <div className="flex gap-1.5 w-max">
            {tags.map((tagName) => (
              <button
                key={tagName}
                onClick={() => setTag(tagName)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 ${
                  tag === tagName
                    ? ""
                    : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
                }`}
                style={
                  tag === tagName
                    ? { backgroundColor: t("accent"), color: t("primary") }
                    : {}
                }
              >
                {tagName !== "All" && <Tag className="w-2.5 h-2.5" />}
                {tagName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-5">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">
          {cat}
          {tag !== "All" ? ` · ${tag}` : ""}
        </h3>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No drills here"
            body={isAdmin ? "Add the first drill in this category." : "Nothing here yet."}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((d) => {
              const Icon = DRILL_CAT_ICON[d.cat] || Target;
              return (
                <div
                  key={d.id}
                  className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] relative"
                >
                  <button onClick={() => setModal(d)} className="text-left w-full">
                    {d.photos?.[0] ? (
                      <img
                        src={d.photos[0]}
                        alt=""
                        className="w-full h-24 object-cover rounded-lg mb-2.5"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-24 rounded-lg mb-2.5 flex items-center justify-center bg-brand-accent-soft">
                        <Icon className="w-7 h-7 text-brand-accent" />
                      </div>
                    )}
                    <h4 className="font-bold text-sm text-ink leading-tight pr-4">{d.name}</h4>
                    {(d.dur || d.players) && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] font-semibold text-ink-faint">
                        {d.dur && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {d.dur}
                          </span>
                        )}
                        {d.players && (
                          <span className="inline-flex items-center gap-0.5">
                            <Users className="w-3 h-3" />
                            {d.players}
                          </span>
                        )}
                      </div>
                    )}
                    {d.tags?.length > 0 && (
                      <p className="text-[11px] text-ink-faint mt-1 truncate">
                        {d.tags.map((t) => `#${t}`).join(" ")}
                      </p>
                    )}
                  </button>
                  {isAdmin && (
                    <div className="absolute top-2.5 right-2.5 flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(d);
                        }}
                        title="Edit"
                        aria-label={`Edit ${d.name}`}
                        className="text-ink-faint hover:text-ink bg-[var(--th-bg)] rounded-full p-0.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          del(d);
                        }}
                        title="Delete"
                        aria-label={`Delete ${d.name}`}
                        className="text-ink-faint hover:text-[var(--th-danger)] bg-[var(--th-bg)] rounded-full p-0.5"
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

      {/* Add / edit sheet */}
      {isAdmin && (
        <Sheet
          open={sheetOpen}
          onClose={cancel}
          title={editingId ? "Edit drill" : "New drill"}
          subtitle={form.cat || ""}
          size="lg"
          footer={
            <div className="flex gap-2">
              <Btn variant="outline" className="flex-1" onClick={cancel}>
                Cancel
              </Btn>
              <Btn
                className="flex-1"
                onClick={save}
                loading={uploading}
                disabled={uploading || !form.name.trim()}
              >
                {editingId ? "Save changes" : "Add drill"}
              </Btn>
            </div>
          }
        >
          <div className="px-5 py-4 space-y-3">
            <Field label="Drill name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Rondo 4v2"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {newCat ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={form.cat}
                    onChange={(e) => setForm({ ...form, cat: e.target.value })}
                    placeholder="New category"
                    className="flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setNewCat(false);
                      setForm({ ...form, cat: cats[0] || DRILL_CATS[0] });
                    }}
                    className="px-2 rounded-lg bg-[var(--th-surface-2)] text-ink-soft"
                    title="Back to list"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Field label="Category">
                  <Select
                    value={form.cat}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setNewCat(true);
                        setForm({ ...form, cat: "" });
                      } else setForm({ ...form, cat: e.target.value });
                    }}
                  >
                    {cats.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__new__">Add new category…</option>
                  </Select>
                </Field>
              )}
              <Field label="Tags" hint="Comma-separated">
                <Input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="e.g. pressing, wide"
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Duration">
                <Input
                  value={form.dur}
                  onChange={(e) => setForm({ ...form, dur: e.target.value })}
                  placeholder="15 min"
                />
              </Field>
              <Field label="Players">
                <Input
                  value={form.players}
                  onChange={(e) => setForm({ ...form, players: e.target.value })}
                  placeholder="12"
                />
              </Field>
              <Field label="Equipment">
                <Input
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  placeholder="cones, balls"
                />
              </Field>
            </div>
            <Field label="Description">
              <TextArea
                rows={2}
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder="What the drill is"
              />
            </Field>
            <Field label="Coaching points" hint="How to run it">
              <TextArea
                rows={2}
                value={form.info}
                onChange={(e) => setForm({ ...form, info: e.target.value })}
                placeholder="Coaching points / how to run it"
              />
            </Field>
            <Field label="Video URL">
              <Input
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="Video URL (optional)"
              />
            </Field>

            {/* Photo carousel uploads */}
            {form.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-1">
                {form.photos.map((src, i) => (
                  <div key={`${src}-${i}`} className="relative flex-shrink-0">
                    <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    <button
                      onClick={() =>
                        setForm((p) => ({ ...p, photos: p.photos.filter((_, j) => j !== i) }))
                      }
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--th-surface)] border border-[var(--th-surface-2)] flex items-center justify-center shadow"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3 text-ink-soft" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <label className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold text-ink-soft text-center cursor-pointer flex items-center justify-center gap-1.5">
                <ImagePlus className="w-3.5 h-3.5" /> Photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold text-ink-soft text-center flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                {form.diagramData ? "Board · saved" : "Board"}
              </button>
              <label className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold text-ink-soft text-center cursor-pointer flex items-center justify-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                {form.diagram && !form.diagramData ? "Diagram · set" : "Diagram"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setDiagramUpload(e.target.files?.[0]);
                    setForm((p) => ({ ...p, diagramData: null }));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {form.diagram && (
              <div className="relative">
                <img
                  src={form.diagram}
                  alt="Drill diagram"
                  className="w-full rounded-xl border border-[var(--th-surface-2)]"
                />
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, diagram: "", diagramData: null }))}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[color-mix(in_srgb,var(--th-surface)_90%,transparent)] border border-[var(--th-surface-2)] flex items-center justify-center shadow"
                  aria-label="Remove diagram"
                >
                  <X className="w-3.5 h-3.5 text-ink-soft" />
                </button>
              </div>
            )}
            {uploading && (
              <p className="text-[11px] font-semibold text-ink-faint px-1">Uploading…</p>
            )}
            {boardOpen && (
              <TacticsBoard
                initial={form.diagramData}
                onSave={saveBoard}
                onClose={() => setBoardOpen(false)}
              />
            )}
          </div>
        </Sheet>
      )}

      {modal && <DrillModal item={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
