// ============================================================
// Mna.tsx — does this acquisition raise or lower the acquirer's EPS?
//
// A different input SHAPE from the other modules, which is what makes it
// a module rather than a tab: two companies plus a deal structure.
//
// Both sides source from saved Vantage companies first, because the six
// figures the maths needs are already in CompanyInput and retyping them
// would be the entry burden that ruled Comps out. Every field stays
// editable for a company nobody wants to save.
// ============================================================
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { MissingData } from '../components/MissingData';
import { runMna, type MnaCompany, type MnaDeal } from '../lib/mna';
import { FIELD_LABELS, type CompanyInput, type CompanyField } from '../lib/analysis';
import type { CompanyPreset } from '../lib/presets';
import { fmtMoney, fmtPct, fmtPctSigned } from '../lib/format';
import './Mna.css';

export type MnaSide = { label: string; company: MnaCompany };
export type MnaState = { acquirer: MnaSide; target: MnaSide; deal: MnaDeal };

// The three figures the maths actually reads. Anything else in
// CompanyInput is irrelevant to accretion.
export const MNA_REQUIRES: readonly CompanyField[] = [
  'netIncome', 'sharesOutstanding', 'sharePrice',
];

export function companyFromInput(input: CompanyInput): MnaCompany | null {
  const ok = MNA_REQUIRES.every((k) => input[k] !== null && Number.isFinite(input[k] as number));
  if (!ok) return null;
  return {
    netIncome: input.netIncome as number,
    sharesOutstanding: input.sharesOutstanding as number,
    sharePrice: input.sharePrice as number,
  };
}

export const DEFAULT_MNA: MnaState = {
  acquirer: { label: 'Acquirer', company: { netIncome: 500, sharesOutstanding: 100, sharePrice: 50 } },
  target: { label: 'Target', company: { netIncome: 100, sharesOutstanding: 50, sharePrice: 20 } },
  deal: {
    offerPricePerShare: 25,
    pctStock: 0.5, pctCash: 0.3, pctDebt: 0.2,
    debtRate: 0.06, cashRate: 0.02, taxRate: 0.25, synergies: 0,
  },
};

type Props = {
  state: MnaState;
  onState: (next: MnaState) => void;
  onReset: () => void;
  presets: CompanyPreset[];
  currentCompany: CompanyInput;
};

export function Mna({ state, onState, onReset, presets, currentCompany }: Props) {
  const { acquirer, target, deal } = state;
  const r = useMemo(() => runMna(acquirer.company, target.company, deal), [acquirer, target, deal]);

  const setSide = (which: 'acquirer' | 'target', next: MnaSide) =>
    onState({ ...state, [which]: next });
  const setDeal = (patch: Partial<MnaDeal>) => onState({ ...state, deal: { ...deal, ...patch } });

  // Stock and cash are chosen; debt is whatever is left. This makes the
  // mix always sum to 100% by construction rather than by validation.
  const setMix = (key: 'pctStock' | 'pctCash', v: number) => {
    const other = key === 'pctStock' ? deal.pctCash : deal.pctStock;
    const capped = Math.min(Math.max(v, 0), 1 - other);
    const nextStock = key === 'pctStock' ? capped : deal.pctStock;
    const nextCash = key === 'pctCash' ? capped : deal.pctCash;
    setDeal({ pctStock: nextStock, pctCash: nextCash, pctDebt: 1 - nextStock - nextCash });
  };

  return (
    <div className="module mna">
      <header className="topbar">
        <div>
          <h1 className="topbar-title">M&amp;A</h1>
          <p className="topbar-subtitle">
            Does buying this company raise or lower the acquirer's earnings per share?
          </p>
        </div>
        <button className="topbar-reset" onClick={onReset}>Reset deal</button>
      </header>

      <div className="mna-grid">
        <SidePanel
          role="Acquirer" side={acquirer} presets={presets} currentCompany={currentCompany}
          onChange={(next) => setSide('acquirer', next)}
          eps={r.acquirerEps} pe={r.acquirerPe}
        />
        <SidePanel
          role="Target" side={target} presets={presets} currentCompany={currentCompany}
          onChange={(next) => setSide('target', next)}
          eps={r.targetEps} pe={r.targetPeAtOffer} peLabel="P/E at offer"
        />

        <Card className="mna-deal">
          <h2 className="section-title">Deal structure</h2>

          <Field label="Offer per share" note={`${fmtPct(r.premium)} premium to the market price`}>
            <input className="mna-num tabular" type="number" step="0.5" min={0}
              value={deal.offerPricePerShare}
              onChange={(e) => setDeal({ offerPricePerShare: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>

          <div className="mna-mix">
            <div className="mna-mix-head">
              <span>Consideration mix</span>
              <span className="mna-mix-total tabular">{fmtMoney(r.offerValue)} total</span>
            </div>
            <MixRow label="Stock" v={deal.pctStock} amount={r.stockConsideration}
              onChange={(v) => setMix('pctStock', v)} />
            <MixRow label="Cash" v={deal.pctCash} amount={r.cashConsideration}
              onChange={(v) => setMix('pctCash', v)} />
            {/* Debt is the remainder, so the three always sum to 100%. */}
            <MixRow label="Debt" v={deal.pctDebt} amount={r.debtConsideration} readOnly />
          </div>

          <div className="mna-rates">
            <Field label="Rate on new debt" note="Interest the acquirer pays to borrow">
              <PctInput v={deal.debtRate} onChange={(v) => setDeal({ debtRate: v })} />
            </Field>
            <Field label="Return on cash used" note="Interest the acquirer stops earning">
              <PctInput v={deal.cashRate} onChange={(v) => setDeal({ cashRate: v })} />
            </Field>
            <Field label="Tax rate" note="Interest is deductible; synergies are taxed">
              <PctInput v={deal.taxRate} onChange={(v) => setDeal({ taxRate: v })} />
            </Field>
            <Field label="Annual synergies" note="Pre-tax cost savings. Leave at 0 to claim none.">
              <input className="mna-num tabular" type="number" step="1"
                value={deal.synergies}
                onChange={(e) => setDeal({ synergies: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        </Card>

        <Card className="mna-result" glow>
          {r.issues.length > 0 && (
            <div className={`mna-issues ${r.issues.some((i) => i.severity === 'error') ? 'is-error' : 'is-caution'}`} role="alert">
              <div className="mna-issues-head">
                {r.issues.some((i) => i.severity === 'error')
                  ? 'This deal cannot be evaluated as structured'
                  : 'Worth checking'}
              </div>
              <ul>{r.issues.map((i) => <li key={i.id}>{i.message}</li>)}</ul>
            </div>
          )}
          {r.accretion === null ? (
            <MissingData
              what="an accretion verdict"
              fields={['netIncome', 'sharesOutstanding']}
            />
          ) : (
            <>
              <div className={`mna-verdict mna-verdict--${r.verdict}`}>
                {r.verdict === 'accretive' ? 'Accretive' : r.verdict === 'dilutive' ? 'Dilutive' : 'Roughly neutral'}
                <span className="mna-verdict-num tabular">{fmtPctSigned(r.accretion)}</span>
              </div>
              <p className="mna-verdict-sub">
                Pro-forma EPS of <strong className="tabular">{r.proFormaEps.toFixed(2)}</strong> against a standalone{' '}
                <strong className="tabular">{r.acquirerEps.toFixed(2)}</strong>. Earnings rise by{' '}
                {fmtMoney(target.company.netIncome)}, and the share count rises{' '}
                {fmtPct(r.newSharesIssued / (r.proFormaShares - r.newSharesIssued))}; whichever grew faster decides
                the sign.
              </p>

              <div className="mna-bridge">
                <div className="mna-bridge-head">Where the EPS change comes from</div>
                <BridgeRow label="Target earnings" v={r.bridge.targetEarnings} />
                <BridgeRow label="Synergies, after tax" v={r.bridge.synergies} />
                <BridgeRow label="Financing cost, after tax" v={r.bridge.financingCost} />
                <BridgeRow label="New shares issued" v={r.bridge.dilutionFromShares} />
                <BridgeRow label="Net change" v={r.proFormaEps - r.acquirerEps} total />
              </div>

              <div className="mna-breakevens">
                <Breakeven
                  label="Breakeven offer price"
                  value={r.breakevenOfferPrice !== null ? `$${r.breakevenOfferPrice.toFixed(2)}` : '—'}
                  note={r.breakevenOfferPrice !== null
                    ? `Above this the deal turns dilutive. You are offering $${deal.offerPricePerShare.toFixed(2)}.`
                    : 'Not defined for this structure.'}
                />
                <Breakeven
                  label="Synergies needed"
                  value={r.breakevenSynergies !== null ? fmtMoney(Math.max(0, r.breakevenSynergies)) : '—'}
                  note={r.breakevenSynergies !== null && r.breakevenSynergies <= 0
                    ? `None. The deal works without synergies, with ${fmtMoney(-r.breakevenSynergies)} of headroom.`
                    : 'Annual pre-tax savings required just to hold EPS flat.'}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- one company ----------------------------------------------------

function SidePanel({ role, side, presets, currentCompany, onChange, eps, pe, peLabel = 'P/E' }: {
  role: string; side: MnaSide; presets: CompanyPreset[]; currentCompany: CompanyInput;
  onChange: (next: MnaSide) => void; eps: number; pe: number | null; peLabel?: string;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const fromCurrent = companyFromInput(currentCompany);

  const set = (patch: Partial<MnaCompany>) =>
    onChange({ ...side, company: { ...side.company, ...patch } });

  const useSource = (label: string, c: MnaCompany) => {
    onChange({ label, company: c });
    setSourceOpen(false);
  };

  return (
    <Card className="mna-side">
      <div className="mna-side-head">
        <div>
          <div className="mna-role">{role}</div>
          <input
            className="mna-label"
            value={side.label}
            onChange={(e) => onChange({ ...side, label: e.target.value.slice(0, 40) })}
            aria-label={`${role} name`}
          />
        </div>
        <div className="mna-source">
          <button className="mna-source-btn" onClick={() => setSourceOpen((o) => !o)} aria-expanded={sourceOpen}>
            Fill from…
          </button>
          {sourceOpen && (
            <div className="mna-source-menu">
              <button
                className="mna-source-item"
                disabled={!fromCurrent}
                onClick={() => fromCurrent && useSource('Current Vantage company', fromCurrent)}
              >
                Current Vantage figures
                {!fromCurrent && <span className="mna-source-why">needs net income, shares and price</span>}
              </button>
              {presets.length === 0 && (
                <span className="mna-source-empty">No saved companies yet.</span>
              )}
              {presets.map((p) => {
                const c = companyFromInput(p.input);
                return (
                  <button
                    key={p.id} className="mna-source-item" disabled={!c}
                    onClick={() => c && useSource(p.name, c)}
                  >
                    {p.name}
                    {!c && <span className="mna-source-why">missing figures</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mna-fields">
        <Field label={FIELD_LABELS.netIncome} note="">
          <input className="mna-num tabular" type="number" step="1" value={side.company.netIncome}
            onChange={(e) => set({ netIncome: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={FIELD_LABELS.sharesOutstanding} note="">
          <input className="mna-num tabular" type="number" step="0.1" min={0} value={side.company.sharesOutstanding}
            onChange={(e) => set({ sharesOutstanding: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label={FIELD_LABELS.sharePrice} note="">
          <input className="mna-num tabular" type="number" step="0.5" min={0} value={side.company.sharePrice}
            onChange={(e) => set({ sharePrice: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
      </div>

      <div className="mna-derived">
        <span>EPS <strong className="tabular">{eps.toFixed(2)}</strong></span>
        <span>{peLabel} <strong className="tabular">{pe !== null && Number.isFinite(pe) ? pe.toFixed(1) + '×' : '—'}</strong></span>
        <span>Market cap <strong className="tabular">{fmtMoney(side.company.sharesOutstanding * side.company.sharePrice)}</strong></span>
      </div>
    </Card>
  );
}

// ---- small pieces ---------------------------------------------------

function Field({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <label className="mna-field">
      <span className="mna-field-label">{label}</span>
      {children}
      {note && <span className="mna-field-note">{note}</span>}
    </label>
  );
}

function PctInput({ v, onChange }: { v: number; onChange: (v: number) => void }) {
  return (
    <div className="mna-pct">
      <input className="mna-num tabular" type="number" step="0.5" min={0} max={100}
        value={+(v * 100).toFixed(2)}
        onChange={(e) => onChange(Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)))} />
      <span className="mna-pct-sign">%</span>
    </div>
  );
}

function MixRow({ label, v, amount, onChange, readOnly }: {
  label: string; v: number; amount: number; onChange?: (v: number) => void; readOnly?: boolean;
}) {
  return (
    <div className={`mna-mixrow ${readOnly ? 'is-derived' : ''}`}>
      <span className="mna-mixrow-label">{label}</span>
      <input
        className="mna-mixrange" type="range" min={0} max={1} step={0.01} value={v}
        onChange={(e) => onChange?.(Number(e.target.value))}
        disabled={readOnly} aria-label={`${label} share of consideration`}
      />
      <span className="mna-mixrow-pct tabular">{fmtPct(v, 0)}</span>
      <span className="mna-mixrow-amt tabular">{fmtMoney(amount)}</span>
    </div>
  );
}

function BridgeRow({ label, v, total }: { label: string; v: number; total?: boolean }) {
  const sign = v > 0.0000001 ? 'up' : v < -0.0000001 ? 'down' : 'flat';
  return (
    <div className={`mna-bridgerow ${total ? 'is-total' : ''}`}>
      <span>{label}</span>
      <span className={`mna-bridgeval tabular mna-bridgeval--${sign}`}>
        {sign === 'up' ? '▲ ' : sign === 'down' ? '▼ ' : ''}
        {v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(3)}
      </span>
    </div>
  );
}

function Breakeven({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="mna-breakeven">
      <div className="mna-breakeven-label">{label}</div>
      <div className="mna-breakeven-value tabular">{value}</div>
      <p className="mna-breakeven-note">{note}</p>
    </div>
  );
}
