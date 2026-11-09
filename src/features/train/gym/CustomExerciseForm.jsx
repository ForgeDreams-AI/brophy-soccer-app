// CustomExerciseForm — coach-authored exercise composer (new or edit).
// Writes doc { name, equipment, primaryMuscles[], aliases[], secondaryMuscles[],
// level, mechanic, instructions[], images[] } via onSave; photos upload to
// exercises/{uid}/{ts}-{rand}.jpg through the feature's upload hook.
import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Btn from "../../../components/ui/Btn";
import Field, { Input, TextArea, Select } from "../../../components/ui/Field";
import { toast } from "../../../lib/toast";
import { uploadExercisePhoto } from "../hooks";

export default function CustomExerciseForm({
  item,
  uid,
  equipmentOptions = [],
  muscleOptions = [],
  onSave,
  onClose,
}) {
  const editing = !!item?.id;
  const [name, setName] = useState(item?.name || "");
  const [equipment, setEquipment] = useState(item?.equipment || "");
  const [primary, setPrimary] = useState((item?.primaryMuscles || []).join(", "));
  const [aliases, setAliases] = useState((item?.aliases || []).join(", "));
  const [level, setLevel] = useState(item?.level || "beginner");
  const [mechanic, setMechanic] = useState(item?.mechanic || "");
  const [instructions, setInstructions] = useState((item?.instructions || []).join("\n"));
  const [photos, setPhotos] = useState(item?.images || []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const addPhotos = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of Array.from(files)) urls.push(await uploadExercisePhoto(uid, f));
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      toast("Couldn't upload photo — " + (e.message || "check Storage rules."));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const data = {
      name: name.trim(),
      equipment: equipment.trim() || "other",
      primaryMuscles: primary.split(",").map((s) => s.trim()).filter(Boolean),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      secondaryMuscles: item?.secondaryMuscles || [],
      level: level || "beginner",
      mechanic: mechanic.trim(),
      instructions: instructions.split("\n").map((s) => s.trim()).filter(Boolean),
      images: photos,
    };
    try {
      await onSave(data);
      onClose();
    } catch (e) {
      toast("Couldn't save — " + (e.message || "check Firestore rules."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? "Edit exercise" : "New exercise"}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Btn>
          <Btn
            variant="primary"
            onClick={save}
            loading={busy}
            disabled={!name.trim() || uploading}
            className="flex-1"
          >
            {editing ? "Save changes" : "Add exercise"}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise name"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Equipment">
            <Input
              list="ex-equip"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              placeholder="Equipment"
            />
            <datalist id="ex-equip">
              {equipmentOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Muscles">
            <Input
              list="ex-muscle"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="Comma-separated"
            />
            <datalist id="ex-muscle">
              {muscleOptions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Also known as" hint="Comma-separated nicknames — searchable">
          <Input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="e.g. RDL, Romanian dead lift"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Level">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {["beginner", "intermediate", "expert"].map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mechanic">
            <Input
              list="ex-mech"
              value={mechanic}
              onChange={(e) => setMechanic(e.target.value)}
              placeholder="e.g. compound"
            />
            <datalist id="ex-mech">
              <option value="compound" />
              <option value="isolation" />
            </datalist>
          </Field>
        </div>
        <Field label="How to do it" hint="One step per line">
          <TextArea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="How to do it — one step per line"
          />
        </Field>

        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {photos.map((src) => (
              <div key={src} className="relative flex-shrink-0">
                <img
                  src={src}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <button
                  onClick={() => setPhotos((p) => p.filter((u) => u !== src))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--th-surface)] border border-[var(--th-surface-2)] flex items-center justify-center shadow-card"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3 text-ink-soft" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="w-full py-2.5 rounded-full bg-[var(--th-surface-2)] text-[11px] font-bold text-ink-soft text-center cursor-pointer flex items-center justify-center gap-1.5">
          <ImagePlus className="w-3.5 h-3.5" /> Add photos
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
        {uploading && (
          <p className="text-[11px] font-semibold text-ink-faint px-1">Uploading…</p>
        )}
      </div>
    </Sheet>
  );
}
