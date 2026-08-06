// ============================================================
// CategoryDonut.tsx — the spending split, with the total in the middle.
//
// Origin's version, minus the emoji. Arc geometry is a plain circle with
// stroke-dasharray, which is far less code than building arc paths and
// cannot produce a malformed wedge at 0% or 100%.
// ============================================================
import type { CategoryTotal } from '../lib/budget';
import { fmtMoney, fmtPct } from '../lib/format';
import './CategoryDonut.css';

type Props = {
  categories: CategoryTotal[];
  total: number;
  active: string | null;
  onHover: (id: string | null) => void;
};

const SIZE = 168;
const STROKE = 20;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2;      // px of circumference left blank between wedges

export function CategoryDonut({ categories, total, active, onHover }: Props) {
  let offset = 0;

  return (
    <div className="cd">
      <svg className="cd-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Spending by category">
        <circle className="cd-track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
        {total > 0 && categories.map((c) => {
          const len = (c.total / total) * C;
          const dash = Math.max(0, len - GAP);
          const el = (
            <circle
              key={c.id}
              className={`cd-arc ${active && active !== c.id ? 'is-dim' : ''}`}
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              stroke={c.color} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              onMouseEnter={() => onHover(c.id)}
              onMouseLeave={() => onHover(null)}
            />
          );
          offset += len;
          return el;
        })}
      </svg>

      <div className="cd-center">
        {(() => {
          const hit = active ? categories.find((c) => c.id === active) : null;
          return (
            <>
              <div className="cd-center-value tabular">{fmtMoney(hit ? hit.total : total)}</div>
              <div className="cd-center-label">
                {hit ? `${hit.name} · ${fmtPct(hit.total / total, 1)}` : 'Total spent'}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
