// ============================================================
// ValuationTab.tsx — the "what is it worth?" view.
//
// Cockpit-style and interactive: the DCF assumptions are sliders,
// and the intrinsic value recomputes live. Shows the projected cash
// flows, the intrinsic-vs-price verdict, and a sensitivity grid
// (how much the answer depends on the assumptions).
//
// DCF drivers are pre-filled from the company inputs (base FCF and
// net debt come straight from the statements), showing the
// statements -> valuation connection, but stay directly editable.
// ============================================================
import { useMemo, useState, useEffect } from 'react';
import { missingFields, type CompanyInput, type CompanyField } from '../lib/analysis';
import { MissingData } from '../components/MissingData';
import { runDcf, dcfSensitivity, type DcfInput } from '../lib/dcf';
import { Card } from '../components/Card';
import './ValuationTab.css';

const VERDICT_WORD = {
  undervalued: 'Undervalued',
  fair: 'Fairly valued',
  overvalued: 'Overvalued',
};

// A DCF needs free cash flow, the bridge from enterprise to equity
// value, and a share count and price to compare against.
const DCF_REQUIRES: readonly CompanyField[] = [
  'operatingCashFlow', 'capex', 'totalDebt', 'cash', 'sharesOutstanding', 'sharePrice',
];

export function ValuationTab({ input }: { input: CompanyInput }) {
  const missing = missingFields(input, DCF_REQUIRES);
  // Assumptions the user can tune. Pre-filled from the statements.
  // The ?? 0 fallbacks only keep the hooks below unconditional; nothing
  // derived from them renders while `missing` is non-empty.
  const baseFcf = Math.max(0, (input.operatingCashFlow ?? 0) - (input.capex ?? 0));
  const netDebt = (input.totalDebt ?? 0) - (input.cash ?? 0);

  const [growth, setGrowth] = useState(0.08);
  const [years, setYears] = useState(10);
  const [terminalGrowth, setTerminalGrowth] = useState(0.025);
  const [discountRate, setDiscountRate] = useState(0.09);

  // Re-derive base FCF / net debt if the underlying inputs change.
  const dcfInput: DcfInput = useMemo(() => ({
    baseFcf, growth, years, terminalGrowth, discountRate,
    netDebt, sharesOutstanding: input.sharesOutstanding ?? 0, sharePrice: input.sharePrice ?? 0,
  }), [baseFcf, growth, years, terminalGrowth, discountRate, netDebt, input.sharesOutstanding, input.sharePrice]);

  const result = useMemo(() => runDcf(dcfInput), [dcfInput]);
  const sens = useMemo(() => dcfSensitivity(dcfInput), [dcfInput]);

  const up = result.upside >= 0;

  // pulse the intrinsic value when it changes
  const [pulse, setPulse] = useState(0);
  useEffect(() => { setPulse((k) => k + 1); }, [result.intrinsicPerShare]);

  if (missing.length > 0) {
    return (
      <div className="valuation">
        <MissingData what="the DCF valuation" fields={missing} />
      </div>
    );
  }

  // Narrowed by the guard above: the DCF inputs are all present here.
  const sharePrice = input.sharePrice as number;

  return (
    <div className="val">
      {/* Hero: intrinsic value vs price */}
      <Card glow delay={0} className="val-hero">
        <div className="val-hero-grid">
          <div>
            <div className="val-label">INTRINSIC VALUE / SHARE</div>
            <div key={pulse} className="val-intrinsic tabular is-fresh">${result.intrinsicPerShare.toFixed(2)}</div>
            <div className="val-vs">
              vs. market price <span className="tabular">${sharePrice.toFixed(2)}</span>
            </div>
          </div>
          <div className="val-verdict-side">
            <div className={`val-verdict val-verdict--${result.verdict}`}>
              {VERDICT_WORD[result.verdict]}
            </div>
            <div className={`val-upside tabular ${up ? 'is-up' : 'is-down'}`}>
              {up ? '\u25B2' : '\u25BC'} {up ? '+' : ''}{(result.upside * 100).toFixed(1)}%
            </div>
            <div className="val-upside-note">{up ? 'potential upside' : 'potential downside'} to intrinsic value</div>
          </div>
        </div>
      </Card>

      {/* Assumption sliders */}
      <Card delay={1}>
        <div className="section-head">
          <h2 className="section-title">Assumptions</h2>
          <span className="section-note">tune the drivers — value updates live</span>
        </div>
        <div className="val-sliders">
          <Slider label="FCF growth rate" value={growth} min={0} max={0.25} step={0.005}
            display={(growth * 100).toFixed(1) + '%'} onChange={setGrowth}
            hint="how fast free cash flow grows during the projection" />
          <Slider label="Projection years" value={years} min={5} max={15} step={1}
            display={years + ' yrs'} onChange={setYears} isInt
            hint="how long before assuming steady perpetual growth" />
          <Slider label="Terminal growth" value={terminalGrowth} min={0} max={0.04} step={0.0025}
            display={(terminalGrowth * 100).toFixed(2) + '%'} onChange={setTerminalGrowth}
            hint="perpetual growth after the projection (keep below GDP ~3%)" />
          <Slider label="Discount rate (WACC)" value={discountRate} min={0.05} max={0.15} step={0.0025}
            display={(discountRate * 100).toFixed(2) + '%'} onChange={setDiscountRate}
            hint="required return; higher = future cash worth less today" />
        </div>
        <div className="val-derived">
          <span>Starting FCF <strong className="tabular">${baseFcf.toFixed(1)}B</strong> <em>(operating cash flow − capex, from your inputs)</em></span>
          <span>Net debt <strong className="tabular">${netDebt.toFixed(1)}B</strong> <em>(total debt − cash)</em></span>
        </div>
      </Card>

      {/* Value build-up */}
      <Card delay={2}>
        <div className="section-head">
          <h2 className="section-title">How the Value Is Built</h2>
        </div>
        <div className="val-buildup">
          <BuildRow label="PV of projected cash flows"
            value={`$${result.pvExplicit.toFixed(0)}B`}
            note={`${years} years of free cash flow, each discounted to today's dollars`} />
          <BuildRow label="PV of terminal value"
            value={`$${result.pvTerminal.toFixed(0)}B`}
            note={`everything beyond year ${years}, via the Gordon Growth model — ${(result.terminalShare * 100).toFixed(0)}% of total value`}
            warn={result.terminalShare > 0.75} />
          <BuildRow label="Enterprise value"
            value={`$${result.enterpriseValue.toFixed(0)}B`}
            note="total business value (the two above combined)" bold />
          <BuildRow label="− Net debt"
            value={`$${netDebt.toFixed(0)}B`}
            note="subtract debt (net of cash) to get what equity holders own" />
          <BuildRow label="Equity value"
            value={`$${result.equityValue.toFixed(0)}B`}
            note="value belonging to shareholders" bold />
        </div>
        {result.terminalShare > 0.75 && (
          <div className="val-flag">
            ⚠ Over {(result.terminalShare * 100).toFixed(0)}% of the value sits in the terminal value — the estimate leans heavily on assumptions about the distant future, so treat it with caution.
          </div>
        )}
      </Card>

      {/* Sensitivity grid */}
      <Card delay={3}>
        <div className="section-head">
          <h2 className="section-title">Sensitivity</h2>
          <span className="section-note">intrinsic value ($/share) across assumptions</span>
        </div>
        <p className="val-sens-intro">
          A DCF is only as good as its assumptions. This grid shows how the per-share value swings with the discount rate and terminal growth — see how much the conclusion depends on inputs you can't know for certain.
        </p>
        <div className="val-sens-wrap">
          <table className="val-sens">
            <thead>
              <tr>
                <th className="val-sens-corner">g \ r</th>
                {sens.discountRates.map((r) => (
                  <th key={r} className="tabular">{(r * 100).toFixed(1)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sens.grid.map((row, i) => (
                <tr key={i}>
                  <th className="tabular">{(sens.terminalGrowths[i] * 100).toFixed(2)}%</th>
                  {row.map((cell, j) => {
                    const diff = (cell.value - sharePrice) / sharePrice;
                    const cls = diff > 0.1 ? 'is-under' : diff < -0.1 ? 'is-over' : 'is-fair';
                    return (
                      <td key={j} className={`tabular val-sens-cell ${cls}`}>
                        ${cell.value.toFixed(0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="val-sens-legend">
          <span><span className="val-sens-swatch is-under" /> above market price (undervalued)</span>
          <span><span className="val-sens-swatch is-fair" /> near price</span>
          <span><span className="val-sens-swatch is-over" /> below price (overvalued)</span>
        </div>
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange, hint, isInt }:
  { label: string; value: number; min: number; max: number; step: number; display: string;
    onChange: (v: number) => void; hint: string; isInt?: boolean }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="val-slider">
      <div className="val-slider-top">
        <span className="val-slider-label">{label}</span>
        <span className="val-slider-value tabular">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(isInt ? parseInt(e.target.value) : parseFloat(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        className="val-range"
      />
      <div className="val-slider-hint">{hint}</div>
    </div>
  );
}

function BuildRow({ label, value, note, bold, warn }:
  { label: string; value: string; note: string; bold?: boolean; warn?: boolean }) {
  return (
    <div className={`val-build-row ${bold ? 'is-bold' : ''}`}>
      <div className="val-build-main">
        <span className="val-build-label">{label}</span>
        <span className={`val-build-value tabular ${warn ? 'is-warn' : ''}`}>{value}</span>
      </div>
      <div className="val-build-note">{note}</div>
    </div>
  );
}
