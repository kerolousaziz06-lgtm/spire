// ============================================================
// LboTab.tsx — the "what would a PE firm make?" view.
//
// Interactive leveraged-buyout model. Assumptions are sliders;
// returns (IRR, MOIC), the debt-paydown schedule, and a value-
// creation attribution bridge update live. Entry EBITDA pre-fills
// from the company's operating income (a common EBITDA proxy).
// ============================================================
import { useMemo, useState, useEffect } from 'react';
import type { CompanyInput } from '../lib/analysis';
import { runLbo, type LboInput } from '../lib/lbo';
import { Card } from '../components/Card';
import './LboTab.css';

export function LboTab({ input }: { input: CompanyInput }) {
  // EBITDA proxy: operating income + a rough D&A add-back (~15%).
  const baseEbitda = Math.max(1, input.operatingIncome * 1.15);

  const [entryMultiple, setEntryMultiple] = useState(8);
  const [exitMultiple, setExitMultiple] = useState(8);
  const [leverage, setLeverage] = useState(4);
  const [ebitdaGrowth, setEbitdaGrowth] = useState(0.08);
  const [years, setYears] = useState(5);
  const [interestRate, setInterestRate] = useState(0.09);

  const lboInput: LboInput = useMemo(() => ({
    entryEbitda: baseEbitda,
    entryMultiple, exitMultiple, leverage, ebitdaGrowth, years,
    interestRate, fcfConversion: 0.55, transactionFees: 0.025,
  }), [baseEbitda, entryMultiple, exitMultiple, leverage, ebitdaGrowth, years, interestRate]);

  const r = useMemo(() => runLbo(lboInput), [lboInput]);

  const [pulse, setPulse] = useState(0);
  useEffect(() => { setPulse((k) => k + 1); }, [r.irr]);

  const irrHealth = r.irr >= 0.20 ? 'good' : r.irr >= 0.12 ? 'ok' : 'bad';
  const irrWord = irrHealth === 'good' ? 'Strong' : irrHealth === 'ok' ? 'Modest' : 'Weak';

  const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(0);

  // attribution bridge widths
  const gain = r.exitEquity - r.entryEquity;
  const parts = [
    { label: 'EBITDA growth', val: r.attribution.ebitdaGrowth, cls: 'a1' },
    { label: 'Debt paydown', val: r.attribution.debtPaydown, cls: 'a2' },
    { label: 'Multiple change', val: r.attribution.multipleChange, cls: 'a3' },
  ];
  const maxPart = Math.max(...parts.map((p) => Math.abs(p.val)), 1);

  return (
    <div className="lbo">
      {/* Hero: the returns */}
      <Card glow delay={0} className="lbo-hero">
        <div className="lbo-hero-grid">
          <div>
            <div className="lbo-label">5-YEAR IRR</div>
            <div key={pulse} className={`lbo-irr tabular is-fresh lbo-irr--${irrHealth}`}>
              {(r.irr * 100).toFixed(1)}%
            </div>
            <div className={`lbo-verdict lbo-verdict--${irrHealth}`}>{irrWord} return</div>
          </div>
          <div className="lbo-hero-side">
            <div className="lbo-moic-label">MONEY MULTIPLE</div>
            <div className="lbo-moic tabular">{r.moic.toFixed(2)}×</div>
            <div className="lbo-moic-note">
              ${r.entryEquity.toFixed(0)} in → ${r.exitEquity.toFixed(0)} out
            </div>
          </div>
        </div>
      </Card>

      {/* Assumptions */}
      <Card delay={1}>
        <div className="section-head">
          <h2 className="section-title">Deal Assumptions</h2>
          <span className="section-note">tune the structure — returns update live</span>
        </div>
        <div className="lbo-sliders">
          <Slider label="Entry multiple" value={entryMultiple} min={4} max={14} step={0.5}
            display={entryMultiple.toFixed(1) + '×'} onChange={setEntryMultiple}
            hint="EV / EBITDA paid to buy the company" />
          <Slider label="Exit multiple" value={exitMultiple} min={4} max={14} step={0.5}
            display={exitMultiple.toFixed(1) + '×'} onChange={setExitMultiple}
            hint="EV / EBITDA received when sold" />
          <Slider label="Leverage" value={leverage} min={1} max={7} step={0.5}
            display={leverage.toFixed(1) + '×'} onChange={setLeverage}
            hint="debt raised, as a multiple of EBITDA" />
          <Slider label="EBITDA growth" value={ebitdaGrowth} min={0} max={0.2} step={0.01}
            display={(ebitdaGrowth * 100).toFixed(0) + '%'} onChange={setEbitdaGrowth}
            hint="annual operating growth during the hold" />
          <Slider label="Hold period" value={years} min={3} max={7} step={1}
            display={years + ' yrs'} onChange={setYears} isInt
            hint="years until the PE firm sells" />
          <Slider label="Interest rate" value={interestRate} min={0.04} max={0.14} step={0.005}
            display={(interestRate * 100).toFixed(1) + '%'} onChange={setInterestRate}
            hint="blended cost of the debt" />
        </div>
        <div className="lbo-entry-note">
          Entry EBITDA <strong className="tabular">${baseEbitda.toFixed(0)}</strong>
          <em> (operating income + ~15% D&amp;A add-back, from your inputs)</em>
        </div>
      </Card>

      {/* Value creation bridge */}
      <Card delay={2}>
        <div className="section-head">
          <h2 className="section-title">Where the Return Comes From</h2>
        </div>
        <p className="lbo-bridge-intro">
          A PE firm's equity gain has three sources. Seeing the split is how you judge whether a deal is built on real operating improvement or just financial engineering.
        </p>
        <div className="lbo-bridge">
          {parts.map((p) => (
            <div key={p.label} className="lbo-bridge-row">
              <span className="lbo-bridge-label">{p.label}</span>
              <div className="lbo-bridge-track">
                <div className={`lbo-bridge-fill lbo-bridge-fill--${p.cls}`}
                  style={{ width: `${(Math.abs(p.val) / maxPart) * 100}%` }} />
              </div>
              <span className="lbo-bridge-val tabular">{money(p.val)}</span>
            </div>
          ))}
        </div>
        <div className="lbo-bridge-total">
          <span>Total equity gain</span>
          <span className="tabular">{money(gain)}</span>
        </div>
      </Card>

      {/* Debt paydown schedule */}
      <Card delay={3}>
        <div className="section-head">
          <h2 className="section-title">Debt Paydown</h2>
          <span className="section-note">the company's cash flow retires the debt over the hold</span>
        </div>
        <div className="lbo-table-wrap">
          <table className="lbo-table">
            <thead>
              <tr>
                <th>Year</th><th>EBITDA</th><th>Interest</th><th>Cash to debt</th><th>Debt remaining</th>
              </tr>
            </thead>
            <tbody>
              <tr className="lbo-table-entry">
                <td>Entry</td><td className="tabular">${r.schedule[0] ? (r.entryEV / entryMultiple).toFixed(0) : '—'}</td>
                <td>—</td><td>—</td><td className="tabular">${r.entryDebt.toFixed(0)}</td>
              </tr>
              {r.schedule.map((y) => (
                <tr key={y.year}>
                  <td>Y{y.year}</td>
                  <td className="tabular">${y.ebitda.toFixed(0)}</td>
                  <td className="tabular">${y.interest.toFixed(0)}</td>
                  <td className="tabular">${y.fcfForPaydown.toFixed(0)}</td>
                  <td className="tabular">${y.debtEnd.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <div className="lbo-slider">
      <div className="lbo-slider-top">
        <span className="lbo-slider-label">{label}</span>
        <span className="lbo-slider-value tabular">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(isInt ? parseInt(e.target.value) : parseFloat(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }} className="lbo-range" />
      <div className="lbo-slider-hint">{hint}</div>
    </div>
  );
}
