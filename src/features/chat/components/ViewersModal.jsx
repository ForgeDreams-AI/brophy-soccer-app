// ViewersModal — coach-only breakdown: who's seen a message / who voted for
// each poll option (and who hasn't). `groups` = [{ label, names: [] }].
import Sheet from "../../../components/ui/Sheet";

export default function ViewersModal({ title, groups = [], onClose }) {
  return (
    <Sheet open onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        {groups.map((g, gi) => (
          <div key={`vg-${gi}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              {g.label}
            </div>
            {g.names.length ? (
              <ul className="space-y-1">
                {g.names.map((n, i) => (
                  <li key={`vn-${i}`} className="text-sm text-ink-soft">
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-faint italic">Nobody yet.</p>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
