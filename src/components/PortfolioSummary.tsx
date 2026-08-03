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

// The card is sized for exactly this many rows and never grows past them, so
// the dashboard's top grid row stays put however many assets are held.
const MAX_ROWS = 4;

// One line on the card. Either a real holding, or the synthetic aggregate.
type DisplayRow = {
  key: string;
  name: string;
  dollars: number;
  swatch: string;      // a CSS background: flat colour, or a gradient
  detail?: string;     // tooltip listing what an aggregate row contains
};

// Collapse the holdings into at most MAX_ROWS lines: the largest three by
// value, then everything else summed into one "Other assets" row.
//
// This is display-only. It never reorders or mutates `holdings`, so nothing
// the math engines receive is affected by how the card chooses to show it.
function toDisplayRows(holdings: Holding[], total: number): DisplayRow[] {
  const asRow = (h: Holding): DisplayRow => {
    const a = ASSET_BY_ID[h.assetId];
    return { key: h.assetId, name: a.name, dollars: h.dollars, swatch: a.color };
  };

  const valid = holdings.filter((h) => ASSET_BY_ID[h.assetId]);
  if (valid.length <= MAX_ROWS) return valid.map(asRow);

  // Sort a copy — `holdings` is state and belongs to the parent.
  const sorted = [...valid].sort((a, b) => b.dollars - a.dollars);
  const top = sorted.slice(0, MAX_ROWS - 1);
  const rest = sorted.slice(MAX_ROWS - 1);
  const restTotal = rest.reduce((s, h) => s + h.dollars, 0);

  return [
    ...top.map(asRow),
    {
      key: '__other__',
      name: `Other assets (${rest.length})`,
      dollars: restTotal,
      // A gradient of the collapsed assets' own colours, so the row still
      // reads as "several things" rather than one anonymous block.
      // rest.length is always >= 2 here, so this is a valid gradient.
      swatch: `linear-gradient(90deg, ${rest.map((h) => ASSET_BY_ID[h.assetId].color).join(', ')})`,
      // An opaque "Other assets · 25%" would hide information the user needs,
      // so the row names its contents on hover.
      detail: rest
        .map((h) => `${ASSET_BY_ID[h.assetId].name} — ${fmtPct(total > 0 ? h.dollars / total : 0, 1)}`)
        .join('\n'),
    },
  ];
}

export function PortfolioSummary({ holdings, onOpen }: Props) {
  // Display mode for the weights shown on the card.
  const [mode, setMode] = useState<'percent' | 'dollar'>('percent');
  const total = holdings.reduce((s, h) => s + h.dollars, 0);
  const rows = toDisplayRows(holdings, total);

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
          {rows.map((r) => {
            const pct = total > 0 ? r.dollars / total : 0;
            return (
              <div
                className={`ps-row ${r.key === '__other__' ? 'is-other' : ''}`}
                key={r.key}
                title={r.detail}
              >
                <span className="ps-dot" style={{ background: r.swatch }} />
                <span className="ps-name">{r.name}</span>
                <span className="ps-weight tabular">
                  {mode === 'percent' ? fmtPct(pct, 0) : fmtMoney(r.dollars)}
                </span>
              </div>
            );
          })}
          {rows.length === 0 && (
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
