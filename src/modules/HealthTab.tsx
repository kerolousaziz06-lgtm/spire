// ============================================================
// HealthTab.tsx — the "is this a good business?" view.
//
// Report-style, top-to-bottom reading flow: a headline verdict,
// then grouped ratio sections (Profitability / Liquidity /
// Leverage / Efficiency), then the DuPont breakdown as a visual
// centerpiece. Every number carries its meaning and verdict.
// ============================================================
import { useMemo } from 'react';
import type { CompanyInput, Metric, Health } from '../lib/analysis';
import { missingFields } from '../lib/analysis';
import { MissingData } from '../components/MissingData';
import { profitability, liquidity, leverage, efficiency, dupont, reconcile, applyReconciliation, unratableFields } from '../lib/analysis';
import { ReconNotice } from '../components/ReconNotice';
import { Card } from '../components/Card';
import { MetricRow } from '../components/MetricRow';
import './HealthTab.css';

// Roll a group of metrics into one overall health for the headline.
function overall(all: Metric[]): Health {
  const score = all.reduce((s, m) => s + (m.health === 'good' ? 1 : m.health === 'ok' ? 0 : -1), 0);
  if (score > all.length * 0.3) return 'good';
  if (score < -all.length * 0.2) return 'bad';
  return 'ok';
}

const HEALTH_WORD: Record<Health, string> = { good: 'Financially healthy', ok: 'Mixed health', bad: 'Financially strained' };

export function HealthTab({ input }: { input: CompanyInput }) {
  const issues = useMemo(() => reconcile(input), [input]);
  const prof = useMemo(() => applyReconciliation(profitability(input), issues), [input, issues]);
  const liq = useMemo(() => applyReconciliation(liquidity(input), issues), [input, issues]);
  const lev = useMemo(() => applyReconciliation(leverage(input), issues), [input, issues]);
  const eff = useMemo(() => applyReconciliation(efficiency(input), issues), [input, issues]);
  const dp = useMemo(() => dupont(input), [input]);

  const all = [...prof, ...liq, ...lev, ...eff];
  const rated = all.filter((m) => m.health !== null);
  const goodCount = rated.filter((m) => m.health === 'good').length;

  // The headline is a judgement on the whole company, so it needs figures
  // that at least describe a possible one. Any hard contradiction, or too
  // little data to be meaningful, and it is withheld entirely.
  const hasError = issues.some((i) => i.severity === 'error');
  const tooThin = rated.length < 4;
  const verdict = overall(rated);

  return (
    <div className="health">
      {issues.length > 0 && <ReconNotice issues={issues} />}

      {/* Headline verdict — withheld when the inputs contradict each other */}
      {hasError || tooThin ? (
        <Card delay={0} className="health-headline">
          <div className="health-badge health-badge--withheld">Verdict withheld</div>
          <p className="health-headline-sub">
            {hasError
              ? 'These figures contradict each other, so an overall judgement would be misleading. Individual ratios still compute where they can; the ones that depend on the contradicted figures are marked unrated.'
              : `Only ${rated.length} ${rated.length === 1 ? 'ratio' : 'ratios'} can be computed so far. Enter more of the statement figures for an overall read.`}
          </p>
        </Card>
      ) : (
        <Card glow delay={0} className="health-headline">
          <div className={`health-badge health-badge--${verdict}`}>{HEALTH_WORD[verdict]}</div>
          <p className="health-headline-sub">
            {goodCount} of {rated.length} key metrics rate as strong. Read down for what each one means and where the business is solid or exposed.
          </p>
        </Card>
      )}

      <Section title="Profitability" note="How much profit the company squeezes from sales" metrics={prof} delay={1} />
      <Section title="Liquidity" note="Can it cover its short-term bills?" metrics={liq} delay={2} />
      <Section title="Leverage" note="How much debt — and can it handle it?" metrics={lev} delay={3} />
      <Section title="Efficiency & Cash Quality" note="Is it well-run, and is profit backed by real cash?" metrics={eff} delay={4} />

      {/* DuPont centerpiece */}
      <Card delay={5} className="dupont-card">
        <div className="section-head">
          <h2 className="section-title">DuPont Breakdown — why the ROE is what it is</h2>
        </div>
        <p className="dupont-intro">
          Return on equity alone hides <em>how</em> a company earns its returns. DuPont splits it into three drivers, so you can see whether ROE comes from fat margins, efficient asset use, or simply a lot of debt.
        </p>

        {dp === null ? (
          <MissingData
            what="the DuPont breakdown"
            fields={missingFields(input, ['netIncome', 'revenue', 'totalAssets', 'shareholdersEquity'])}
          />
        ) : (
          <>

          <div className="dupont-flow">
            <DuPontFactor label="Net margin" value={(dp.netMargin * 100).toFixed(1) + '%'} sub="profit per sales dollar" />
            <span className="dupont-op">{"\u00D7"}</span>
            <DuPontFactor label="Asset turnover" value={dp.assetTurnover.toFixed(2) + '\u00D7'} sub="sales per asset dollar" />
            <span className="dupont-op">{"\u00D7"}</span>
            <DuPontFactor label="Equity multiplier" value={dp.equityMultiplier.toFixed(2) + '\u00D7'} sub="leverage (assets/equity)" />
            <span className="dupont-op">=</span>
            <DuPontFactor label="ROE" value={(dp.roe * 100).toFixed(1) + '%'} sub="return on equity" highlight />
          </div>

          <div className={`dupont-driver dupont-driver--${dp.equityMultiplier >= 3 ? 'warn' : 'good'}`}>
            {dp.driver}
          </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Section({ title, note, metrics, delay }:
  { title: string; note: string; metrics: Metric[]; delay: number }) {
  return (
    <Card delay={delay} className="health-section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="section-note">{note}</span>
      </div>
      <div className="health-metrics">
        {metrics.map((m) => <MetricRow key={m.key} metric={m} />)}
      </div>
    </Card>
  );
}

function DuPontFactor({ label, value, sub, highlight }:
  { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`dupont-factor ${highlight ? 'is-highlight' : ''}`}>
      <div className="dupont-factor-value tabular">{value}</div>
      <div className="dupont-factor-label">{label}</div>
      <div className="dupont-factor-sub">{sub}</div>
    </div>
  );
}
