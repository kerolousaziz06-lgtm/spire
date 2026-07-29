// ============================================================
// CorrelationHeatmap.tsx — makes the diversification math VISIBLE.
//
// The Monte Carlo engine already uses a correlation between every
// pair of assets, but that math is invisible. This grid surfaces it:
// each cell is colored by how two held assets move together.
//   deep blue  = move together (high positive correlation)
//   neutral    = independent (near zero)
//   warm amber = move oppositely (negative correlation, diversifying)
// Hovering a cell explains it in plain language.
// ============================================================
import { useState } from 'react';
import { ASSET_BY_ID, correlation, type Holding } from '../lib/assets';
import './CorrelationHeatmap.css';

type Props = { holdings: Holding[] };

function corrColor(r: number): string {
  if (r >= 0) {
    const a = 0.12 + r * 0.68;
    return `rgba(59, 130, 246, ${a.toFixed(3)})`;
  } else {
    const a = 0.12 + Math.abs(r) * 0.68;
    return `rgba(212, 169, 76, ${a.toFixed(3)})`;
  }
}

function plainEnglish(r: number): string {
  if (r >= 0.8) return 'move almost in lockstep';
  if (r >= 0.5) return 'tend to move together';
  if (r >= 0.2) return 'move together somewhat';
  if (r > -0.2) return 'move largely independently';
  return 'tend to move oppositely — a great diversifier';
}

export function CorrelationHeatmap({ holdings }: Props) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const assets = holdings
    .filter((h) => h.dollars > 0 && ASSET_BY_ID[h.assetId])
    .map((h) => ASSET_BY_ID[h.assetId]);

  if (assets.length < 2) {
    return <div className="heat-empty">Hold at least two assets to see how they move together.</div>;
  }

  const n = assets.length;
  const hoverInfo = hover
    ? { a: assets[hover.i], b: assets[hover.j], r: correlation(assets[hover.i].id, assets[hover.j].id) }
    : null;

  return (
    <div className="heat">
      <div className="heat-grid" style={{ gridTemplateColumns: `auto repeat(${n}, 1fr)` }}>
        <div className="heat-corner" />
        {assets.map((a) => (
          <div key={`col-${a.id}`} className="heat-collabel" title={a.name}>
            <span style={{ color: a.color }}>{a.short}</span>
          </div>
        ))}

        {assets.map((rowA, i) => (
          <div key={`row-${rowA.id}`} style={{ display: 'contents' }}>
            <div className="heat-rowlabel" title={rowA.name}>
              <span style={{ color: rowA.color }}>{rowA.short}</span>
            </div>
            {assets.map((colA, j) => {
              const r = correlation(rowA.id, colA.id);
              const isHover = hover?.i === i && hover?.j === j;
              return (
                <div
                  key={`${i}-${j}`}
                  className={`heat-cell ${isHover ? 'is-hover' : ''} ${i === j ? 'is-diag' : ''}`}
                  style={{ background: i === j ? 'var(--bg-panel)' : corrColor(r) }}
                  onMouseEnter={() => setHover({ i, j })}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="heat-val tabular">{r.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="heat-footer">
        {hoverInfo ? (
          <span className="heat-explain">
            <strong style={{ color: hoverInfo.a.color }}>{hoverInfo.a.short}</strong> and{' '}
            <strong style={{ color: hoverInfo.b.color }}>{hoverInfo.b.short}</strong>{' '}
            {plainEnglish(hoverInfo.r)} <span className="tabular">({hoverInfo.r.toFixed(2)})</span>
          </span>
        ) : (
          <span className="heat-legend">
            <span className="heat-key"><span className="heat-swatch" style={{ background: 'rgba(59,130,246,0.7)' }} /> together</span>
            <span className="heat-key"><span className="heat-swatch" style={{ background: 'rgba(120,130,150,0.3)' }} /> independent</span>
            <span className="heat-key"><span className="heat-swatch" style={{ background: 'rgba(212,169,76,0.7)' }} /> opposite</span>
          </span>
        )}
      </div>
    </div>
  );
}
