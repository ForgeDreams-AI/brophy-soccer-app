// Practices — build/view a single practice (an ordered list of drill blocks)
// and the practice library with the NewPracticeChooser entry screen.
//
// Practice doc: { name, desc, cat, published, blocks[] }.
// Blocks denormalize a drill snapshot + reference:
//   { drillId, name, cat, dur, notes }
// Deleted drills render "(drill deleted)". The debounced autosave mirrors
// v1: 700ms after the last change, with a "Saving…" indicator.

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
} from "lucide-react";
import Btn from "../../../components/ui/Btn";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { Input } from "../../../components/ui/Field";
import EmptyState from "../../../components/ui/EmptyState";
import { toast } from "../../../lib/toast";
import { DrillThumb, DrillPicker, DrillModal } from "./DrillsPage";
import { PRACTICE_STARTERS } from "./shared";
import { useTheme } from "../../../theme/ThemeProvider";

// ─── PracticeDetail: single-practice editor ─────────────────────────────────
export const PracticeDetail = ({
  coach,
  practice,
  canEdit,
  onBack,
  catOptions = [],
}) => {
  const confirm = useConfirm();
  const [name, setName] = useState(practice.name || "");
  const [desc, setDesc] = useState(practice.desc || "");
  const [cat, setCat] = useState(practice.cat || "");
  const [blocks, setBlocks] = useState(practice.blocks || []);
  const [published, setPublished] = useState(!!practice.published);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [viewDrill, setViewDrill] = useState(null);

  // 700ms debounced autosave.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const t = setTimeout(() => {
      coach.updatePractice(practice.id, { name, desc, cat, blocks, published });
      setDirty(false);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, desc, cat, blocks, published, dirty]);

  const handleBack = () => {
    if (dirty && canEdit) coach.updatePractice(practice.id, { name, desc, cat, blocks, published });
    onBack();
  };
  const setBlock = (i, field, value) => {
    setBlocks(blocks.map((b, j) => (j === i ? { ...b, [field]: value } : b)));
    setDirty(true);
  };
  const removeBlock = (i) => {
    setBlocks(blocks.filter((_, j) => j !== i));
    setDirty(true);
  };
  const moveBlock = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const n = [...blocks];
    [n[i], n[j]] = [n[j], n[i]];
    setBlocks(n);
    setDirty(true);
  };
  const addBlock = (d) => {
    // Denormalize a drill snapshot — the practice keeps its own copy so the
    // plan reads correctly even if the drill is later edited.
    setBlocks([
      ...blocks,
      { drillId: d.id, name: d.name, cat: d.cat || "", dur: d.dur || "", notes: "" },
    ]);
    setDirty(true);
    setPicker(false);
  };
  const confirmDelete = async () => {
    const ok = await confirm({
      title: `Delete "${name || "this practice"}"?`,
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await coach.deletePractice(practice.id);
      onBack();
    } catch (e) {
      toast("Couldn't delete — " + e.message);
    }
  };
  const drillById = (id) => coach.drills.find((d) => d.id === id);

  return (
    <div className="px-5 pb-4 space-y-4">
      <button
        onClick={handleBack}
        className="text-xs font-semibold text-ink-faint flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      {canEdit ? (
        <>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder="Practice name"
            aria-label="Practice name"
            className="!text-xl !font-bold !border-0 !border-b !rounded-none !px-0 !py-1 text-ink"
          />
          <Input
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value);
              setDirty(true);
            }}
            placeholder="Short description (optional)"
            aria-label="Practice description"
            className="!border-0 !px-0 !py-0 text-ink-soft"
          />
          <Input
            list="practice-cats"
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setDirty(true);
            }}
            placeholder="Category (e.g. Technical, Game Prep)"
            aria-label="Practice category"
          />
          <datalist id="practice-cats">
            {catOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      ) : (
        <>
          <h2 className="font-display font-bold text-[26px] uppercase tracking-wide text-ink">
            {name || "Untitled"}
          </h2>
          {cat && (
            <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent-soft text-brand-accent">
              {cat}
            </span>
          )}
          {desc && <p className="text-sm text-ink-soft">{desc}</p>}
        </>
      )}

      {blocks.length === 0 ? (
        <p className="text-sm text-ink-faint italic text-center py-6">
          No drills yet.{canEdit ? " Add one below." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b, i) => {
            const d = drillById(b.drillId);
            return (
              <li
                key={b.drillId ? `${b.drillId}-${i}` : `block-${i}`}
                className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white bg-brand-primary">
                    {i + 1}
                  </span>
                  {d && <DrillThumb d={d} className="w-9 h-9" />}
                  <button
                    onClick={() => d && setViewDrill(d)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="font-semibold text-sm text-ink leading-tight truncate">
                      {b.name}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {b.cat}
                      {b.dur ? ` · ${b.dur}` : ""}
                      {!d ? " · (drill deleted)" : ""}
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => moveBlock(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveBlock(i, 1)}
                        disabled={i === blocks.length - 1}
                        aria-label="Move down"
                        className="text-ink-faint hover:text-ink disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeBlock(i)}
                        aria-label="Remove block"
                        className="text-ink-faint hover:text-[var(--th-danger)]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Input
                      value={b.dur}
                      onChange={(e) => setBlock(i, "dur", e.target.value)}
                      placeholder="Time"
                      aria-label={`Block ${i + 1} time`}
                      className="!text-xs !text-center"
                    />
                    <Input
                      value={b.notes}
                      onChange={(e) => setBlock(i, "notes", e.target.value)}
                      placeholder="Notes (optional)"
                      aria-label={`Block ${i + 1} notes`}
                      className="!text-xs col-span-2"
                    />
                  </div>
                ) : b.notes ? (
                  <div className="text-[11px] text-ink-soft mt-1.5 pl-[34px]">{b.notes}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <Btn variant="outline" className="w-full" icon={Plus} onClick={() => setPicker(true)}>
            Add drill
          </Btn>
          <label className="flex items-center justify-between bg-[var(--th-surface)] rounded-xl px-4 py-3 shadow-card border border-[var(--th-surface-2)]">
            <span className="text-sm font-semibold text-ink-soft">Published to players</span>
            <button
              onClick={() => {
                setPublished(!published);
                setDirty(true);
              }}
              role="switch"
              aria-checked={published}
              aria-label="Toggle published"
              className="w-11 h-6 rounded-full transition-colors relative bg-[var(--th-surface-2)]"
              style={published ? { backgroundColor: "var(--th-success)" } : {}}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  published ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
          <button
            onClick={confirmDelete}
            className="w-full py-2 text-[11px] font-semibold text-[var(--th-danger)] hover:opacity-80"
          >
            Delete practice
          </button>
        </>
      )}
      {dirty && canEdit && (
        <p className="text-[11px] text-ink-faint text-center">Saving…</p>
      )}
      {picker && <DrillPicker drills={coach.drills} onPick={addBlock} onClose={() => setPicker(false)} />}
      {viewDrill && <DrillModal item={viewDrill} onClose={() => setViewDrill(null)} />}
    </div>
  );
};

const PracticeCard = ({ practice, onOpen }) => (
  <button
    onClick={onOpen}
    className="w-full bg-[var(--th-surface)] rounded-xl p-4 shadow-card border border-[var(--th-surface-2)] flex items-center justify-between gap-3 text-left"
  >
    <div className="min-w-0">
      <div className="font-bold text-sm text-ink leading-tight truncate">
        {practice.name || "Untitled practice"}
      </div>
      <div className="text-[11px] text-ink-faint mt-0.5 truncate">
        {practice.blocks?.length || 0} drill{(practice.blocks?.length || 0) === 1 ? "" : "s"}
        {practice.desc ? ` · ${practice.desc}` : ""}
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {practice.published && (
        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-accent-soft text-brand-accent">
          Published
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-ink-faint" />
    </div>
  </button>
);

// ─── NewPracticeChooser: blank / template / copy ────────────────────────────
export const NewPracticeChooser = ({ coach, onCreate }) => {
  const { t } = useTheme();
  const practices = coach.practices;
  // Deep-copy blocks so the new practice never shares block objects with the
  // source — editing one must not mutate the other (v1 shared by reference).
  const deepCopyBlocks = (blocks) => (blocks || []).map((b) => ({ ...b }));
  return (
    <div className="px-5 pb-4 space-y-4">
      <div>
        <h4 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">
          Start from a template
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {PRACTICE_STARTERS.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.name}
                onClick={() =>
                  onCreate({ name: tpl.name, cat: tpl.cat, desc: tpl.desc, blocks: [] })
                }
                className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] flex flex-col gap-2 text-left hover:bg-[var(--th-bg)]"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${t(tpl.colorKey)}1a` }}
                >
                  <Icon className="w-4 h-4" style={{ color: t(tpl.colorKey) }} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-ink truncate">{tpl.name}</div>
                  <div className="text-[11px] text-ink-faint line-clamp-2 leading-snug">
                    {tpl.desc}
                  </div>
                </div>
              </button>
            );
          })}
          <button
            onClick={() => onCreate({ name: "New practice", cat: "", desc: "", blocks: [] })}
            className="rounded-xl p-3 shadow-card text-white flex flex-col gap-2 text-left bg-brand-primary"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/15">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm">Blank</div>
              <div className="text-[11px] text-white/70 leading-snug">Start from scratch</div>
            </div>
          </button>
        </div>
      </div>
      {practices.length > 0 && (
        <div>
          <h4 className="text-[11px] font-black uppercase tracking-wider text-ink-faint mb-2">
            Copy from library
          </h4>
          <div className="space-y-2">
            {practices.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  onCreate({
                    name: `${p.name} (copy)`,
                    cat: p.cat || "",
                    desc: p.desc || "",
                    blocks: deepCopyBlocks(p.blocks),
                  })
                }
                className="w-full bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] flex items-center justify-between gap-2 text-left hover:bg-[var(--th-bg)]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{p.name}</div>
                  <div className="text-[11px] text-ink-faint">
                    {p.blocks?.length || 0} drills{p.cat ? ` · ${p.cat}` : ""}
                  </div>
                </div>
                <Copy className="w-4 h-4 text-ink-faint flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PracticesView: library list → PracticeDetail ───────────────────────────
export const PracticesView = ({
  user,
  coach,
  canEdit,
  initialOpenId = null,
  hideCreate = false,
}) => {
  const [openId, setOpenId] = useState(initialOpenId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [cat, setCat] = useState("All");
  const practices = coach.practices;

  const catOptions = useMemo(
    () => [...new Set(practices.map((p) => p.cat).filter(Boolean))].sort(),
    [practices],
  );
  const cats = ["All", ...catOptions];

  const open = practices.find((p) => p.id === openId);
  if (open)
    return (
      <PracticeDetail
        user={user}
        coach={coach}
        practice={open}
        canEdit={canEdit}
        catOptions={catOptions}
        onBack={() => setOpenId(null)}
      />
    );

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const ref = await coach.addPractice({ name: newName.trim() });
      setNewName("");
      setCreating(false);
      if (ref?.id) setOpenId(ref.id);
    } catch (e) {
      toast("Couldn't create — " + (e.message || "check rules."));
    }
  };
  const filtered = cat === "All" ? practices : practices.filter((p) => (p.cat || "") === cat);

  return (
    <div className="px-5 space-y-3">
      {canEdit && !hideCreate ? (
        creating ? (
          <div className="bg-[var(--th-surface)] rounded-xl p-3 shadow-card border border-[var(--th-surface-2)] space-y-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Practice name (e.g. Tuesday Session)"
            />
            <div className="flex gap-2">
              <Btn
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Btn>
              <Btn className="flex-1" onClick={create} disabled={!newName.trim()}>
                Create
              </Btn>
            </div>
          </div>
        ) : (
          <Btn className="w-full" icon={Plus} onClick={() => setCreating(true)}>
            New practice
          </Btn>
        )
      ) : (
        !canEdit &&
        practices.length === 0 && (
          <p className="text-sm text-ink-faint italic text-center py-6">
            Your coach hasn't published a practice yet.
          </p>
        )
      )}

      {cats.length > 1 && (
        <div className="overflow-x-auto -mx-5 px-5">
          <div className="flex gap-2 w-max">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  cat === c
                    ? "text-white bg-brand-primary"
                    : "bg-[var(--th-surface)] text-ink-soft border border-[var(--th-surface-2)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Copy}
          title="No practices"
          body={cat !== "All" ? `Nothing in ${cat} yet.` : "Build your first practice to get started."}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <PracticeCard practice={p} onOpen={() => setOpenId(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PracticeDetail;
