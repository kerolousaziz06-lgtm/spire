// ============================================================
// RetirementCard.tsx — a compact "will my money last?" planner
// that fills the right-column space in MonteVue and reuses the
// Monte Carlo idea for a relatable, personal question.
// ============================================================
import { useMemo, useState } from 'react';
import { runRetirement, type RetirementInput } from '../lib/retirement';
import { Card } from './Card';
import { fmtMoneyShort } from '../lib/format';
import './RetirementCard.css';

const DEFAULTS: RetirementInput = {
  currentSavings: 50000,
  annualContribution: 12000,
  yearsToRetire: 30,
  yearsInRetirement: 30,
  annualSpending: 60000,
  expReturn: 0.06,
  volatility: 0.12,
};

export function RetirementCard() {
  const [inp, setInp] = useState<RetirementInput>(DEFAULTS);
  const [open, setOpen] = useState(false);

  const res = useMemo(() => runRetirement(inp), [inp]);

  const health = res.successRate >= 0.85 ? 'good' : res.successRate >= 0.6 ? 'ok' : 'bad';
  const healthWord = health === 'good' ? 'On track' : health === 'ok' ? 'Borderline' : 'At risk';

  // Build a tiny sparkline path from the median trajectory.
  const spark = useMemo(() => {
    const p = res.medianPath;
    const max = Math.max(...p, 1);
    const W = 240, H = 60;
    const pts = p.map((v, i) => {
      const x = (i / (p.length - 1)) * W;
      const y = H - (v / max) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const retireX = (res.retireAtYear / (p.length - 1)) * W;
    return { d: 'M ' + pts.join(' L '), W, H, retireX };
  }, [res]);

  function set<K extends keyof RetirementInput>(k: K, v: number) {
    setInp((s) => ({ ...s, [k]: v }));
  }

  return (
    <Card delay={5}>
      <div className="ret-head">
        <h2 className="section-title">Will My Money Last?</h2>
        <button className="ret-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Adjust'}
        </button>
      </div>

      <div className="ret-hero">
        <div className={`ret-rate ret-rate--${health}`}>{(res.successRate * 100).toFixed(0)}%</div>
        <div className="ret-hero-side">
          <div className={`ret-badge ret-badge--${health}`}>{healthWord}</div>
          <div className="ret-hero-note">chance savings last {inp.yearsInRetirement} yrs of retirement</div>
        </div>
      </div>

      {/* sparkline: accumulation then drawdown */}
      <svg className="ret-spark" viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none">
        <line x1={spark.retireX} y1={0} x2={spark.retireX} y2={spark.H}
          stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        <path d={spark.d} fill="none" stroke="var(--accent-bright)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="ret-spark-labels">
        <span>now</span><span>retire (y{inp.yearsToRetire})</span><span>end</span>
      </div>

      <div className="ret-stats">
        <div><span>Median ending</span><strong className="tabular">{fmtMoneyShort(res.medianEnding)}</strong></div>
        <div><span>Pessimistic</span><strong className="tabular">{fmtMoneyShort(res.p10Ending)}</strong></div>
      </div>

      {open && (
        <div className="ret-controls">
          <Field label="Current savings" value={inp.currentSavings} step={5000} onChange={(v) => set('currentSavings', v)} prefix="$" />
          <Field label="Saved per year" value={inp.annualContribution} step={1000} onChange={(v) => set('annualContribution', v)} prefix="$" />
          <Field label="Years to retire" value={inp.yearsToRetire} step={1} onChange={(v) => set('yearsToRetire', v)} />
          <Field label="Years retired" value={inp.yearsInRetirement} step={1} onChange={(v) => set('yearsInRetirement', v)} />
          <Field label="Spending / year" value={inp.annualSpending} step={5000} onChange={(v) => set('annualSpending', v)} prefix="$" />
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, step, onChange, prefix }:
  { label: string; value: number; step: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <label className="ret-field">
      <span>{label}</span>
      <div className="ret-input-wrap">
        {prefix && <span className="ret-prefix">{prefix}</span>}
        <input className="ret-input tabular" type="number" value={value} step={step}
          onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))} />
      </div>
    </label>
  );
}
