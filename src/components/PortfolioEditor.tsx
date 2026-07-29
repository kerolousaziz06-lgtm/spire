// ============================================================
// PortfolioEditor.tsx — the focused modal for editing the portfolio.
//
// KEY IDEA: it edits a DRAFT copy, not the live portfolio. You can
// change things freely; nothing affects the simulation until you
// press "Save". "Cancel" or clicking the dimmed backdrop throws the
// draft away. This is the standard, safe modal pattern.
//
// It receives the current holdings, and two callbacks:
//   onSave(next)  — commit the draft
//   onClose()     — discard and close
// ============================================================
import { useState, useEffect } from 'react';
import { ASSETS, ASSET_BY_ID, type Holding } from '../lib/assets';
import { fmtMoney, fmtInputCommas, parseMoneyInput } from '../lib/format';
import './PortfolioEditor.css';

type Props = {
  holdings: Holding[];
  onSave: (next: Holding[]) => void;
  onClose: () => void;
};

export function PortfolioEditor({ holdings, onSave, onClose }: Props) {
  // The draft: a private copy we mutate freely. Starts as a clone of
  // the real holdings. Saving sends this up; closing discards it.
  const [draft, setDraft] = useState<Holding[]>(() => holdings.map((h) => ({ ...h })));
  const [showAdd, setShowAdd] = useState(false);

  // Tracks whether the current mouse press STARTED on the backdrop.
  // We only close on backdrop click if the press both started AND
  // ended there — otherwise a slider drag that happens to release
  // over the dim area would wrongly close the modal.
  const [pressedBackdrop, setPressedBackdrop] = useState(false);

  const total = draft.reduce((s, h) => s + h.dollars, 0);

  // Let the Escape key close the modal (accessibility nicety).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setDollars(assetId: string, dollars: number) {
    setDraft((d) => d.map((h) => (h.assetId === assetId ? { ...h, dollars: Math.max(0, dollars) } : h)));
  }
  function remove(assetId: string) {
    setDraft((d) => d.filter((h) => h.assetId !== assetId));
  }
  function add(assetId: string) {
    if (draft.some((h) => h.assetId === assetId)) return;
    setDraft((d) => [...d, { assetId, dollars: 10000 }]);
    setShowAdd(false);
  }

  const available = ASSETS.filter((a) => !draft.some((h) => h.assetId === a.id));
  const sliderMax = Math.max(total, 100000);

  return (
    // The backdrop: dim everything behind. Closing on backdrop click
    // requires the press to START on the backdrop (onMouseDown) and
    // END on it (onMouseUp) — so a drag that merely releases here
    // (e.g. after dragging a slider) will NOT close the modal.
    <div
      className="pe-backdrop"
      onMouseDown={(e) => setPressedBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (pressedBackdrop && e.target === e.currentTarget) onClose();
        setPressedBackdrop(false);
      }}
      role="presentation"
    >
      {/* stopPropagation not needed now; the target checks above handle it */}
      <div className="pe-modal" role="dialog" aria-modal="true" aria-label="Edit portfolio">
        <div className="pe-head">
          <h2 className="pe-title">Edit Portfolio</h2>
          <button className="pe-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="pe-list">
          {draft.map((h) => {
            const asset = ASSET_BY_ID[h.assetId];
            if (!asset) return null;
            return (
              <div className="pe-row" key={h.assetId}>
                <div className="pe-row-top">
                  <span className="pe-dot" style={{ background: asset.color }} />
                  <span className="pe-name">{asset.name}</span>
                  <button className="pe-remove" onClick={() => remove(h.assetId)} aria-label={`Remove ${asset.name}`}>×</button>
                </div>

                <div className="pe-controls">
                  <div className="pe-input-wrap">
                    <span className="pe-currency">$</span>
                    {/* text input (not number) so we can show commas */}
                    <input
                      className="pe-input tabular"
                      type="text"
                      inputMode="numeric"
                      value={fmtInputCommas(h.dollars)}
                      placeholder="0"
                      onChange={(e) => setDollars(h.assetId, parseMoneyInput(e.target.value))}
                      aria-label={`${asset.name} dollar amount`}
                    />
                  </div>

                  <input
                    className="pe-slider"
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={1000}
                    value={h.dollars}
                    onChange={(e) => setDollars(h.assetId, Number(e.target.value))}
                    style={{ ['--fill' as string]: `${(h.dollars / sliderMax) * 100}%`, ['--track' as string]: asset.color }}
                    aria-label={`${asset.name} slider`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {available.length > 0 && (
          <div className="pe-add-wrap">
            {showAdd ? (
              <div className="pe-add-menu">
                {available.map((a) => (
                  <button key={a.id} className="pe-add-item" onClick={() => add(a.id)}>
                    <span className="pe-dot" style={{ background: a.color }} />
                    {a.name}
                  </button>
                ))}
              </div>
            ) : (
              <button className="pe-add-btn" onClick={() => setShowAdd(true)}>+ Add asset</button>
            )}
          </div>
        )}

        <div className="pe-footer">
          <div className="pe-total">
            <span>Total</span>
            <span className="tabular pe-total-amount">{fmtMoney(total)}</span>
          </div>
          <div className="pe-actions">
            <button className="pe-btn pe-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="pe-btn pe-btn-primary" onClick={() => onSave(draft)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
