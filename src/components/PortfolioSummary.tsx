// ============================================================
// PortfolioSummary.tsx — the read-only card in the left column.
//
// Shows the current portfolio and a $/% toggle that flips how each
// holding's weight is displayed (percent of portfolio, or dollar
// amount). The toggle is a real control, so it must NOT open the
// editor — only the list/total area does that.
// ============================================================
import { useState } from 'react';
import { ASSET_BY_ID, type Holding } from '../lib/assets';
import { fmtMoney, fmtPct } from '../lib/format';
import { Card } from './Card';
import './PortfolioSummary.css';

type Props = {
  holdings: Holding[];
  onOpen: () => void;
};

export function PortfolioSummary({ holdings, onOpen }: Props) {
  // Display mode for the weights shown on the card.
  const [mode, setMode] = useState<'percent' | 'dollar'>('percent');
  const total = holdings.reduce((s, h) => s + h.dollars, 0);

  return (
    <Card delay={0}>
      {/* Header row: title + toggle. This row does NOT open the editor. */}
      <div className="ps-head">
        <h2 className="section-title">Your Portfolio</h2>
        <div className="ps-toggle" role="group" aria-label="Display mode">
          <button
            className={mode === 'dollar' ? 'is-active' : ''}
            onClick={() => setMode('dollar')}
            aria-pressed={mode === 'dollar'}
          >$</button>
          <button
            className={mode === 'percent' ? 'is-active' : ''}
            onClick={() => setMode('percent')}
            aria-pressed={mode === 'percent'}
          >%</button>
        </div>
      </div>

      {/* Clickable area: the list + bar + total. Clicking opens the editor. */}
      <button className="ps-open" onClick={onOpen} aria-label="Edit portfolio">
        <div className="ps-list">
          {holdings.map((h) => {
            const asset = ASSET_BY_ID[h.assetId];
            if (!asset) return null;
            const pct = total > 0 ? h.dollars / total : 0;
            return (
              <div className="ps-row" key={h.assetId}>
                <span className="ps-dot" style={{ background: asset.color }} />
                <span className="ps-name">{asset.name}</span>
                <span className="ps-weight tabular">
                  {mode === 'percent' ? fmtPct(pct, 0) : fmtMoney(h.dollars)}
                </span>
              </div>
            );
          })}
          {holdings.length === 0 && (
            <div className="ps-empty">No assets yet — click to add some.</div>
          )}
        </div>

        {/* A slim stacked bar showing the allocation visually */}
        {total > 0 && (
          <div className="ps-bar">
            {holdings.map((h) => {
              const asset = ASSET_BY_ID[h.assetId];
              if (!asset) return null;
              return (
                <span
                  key={h.assetId}
                  className="ps-bar-seg"
                  style={{ width: `${(h.dollars / total) * 100}%`, background: asset.color }}
                />
              );
            })}
          </div>
        )}

        <div className="ps-total">
          <span>Total invested</span>
          <span className="tabular ps-total-amount">{fmtMoney(total)}</span>
        </div>

        <div className="ps-edit-hint">Click to edit ›</div>
      </button>
    </Card>
  );
}
