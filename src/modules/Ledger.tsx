// ============================================================
// Ledger.tsx — where the month's money went.
//
// A different input SHAPE again, which is what makes it a module: one
// month of category totals, not a portfolio and not a company's
// statements. Roughly fifteen numbers, about two minutes.
//
// The reference apps (Monarch, Origin) both sync to banks through Plaid
// and work off a transaction feed. This app has no backend, so that path
// is closed. It stays closed on purpose: the Sankey never needed the
// transactions, only the category totals, and typing fifteen totals is a
// thing someone will actually do. Vantage already proved that entering
// ONE company is a five-minute friction point; two hundred transactions
// is not a smaller version of that problem.
//
// Working name. "Ledger" is a placeholder alongside the unresolved suite
// name.
// ============================================================
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { SankeyFlow } from '../components/SankeyFlow';
import {
  buildFlow, computeMonth, monthLabel, rateSavings, SAMPLE_MONTH,
  type MonthEntry,
} from '../lib/budget';
import { fmtMoney, fmtPct } from '../lib/format';
import './Ledger.css';

type Props = {
  month?: MonthEntry;
};

export function Ledger({ month = SAMPLE_MONTH }: Props) {
  const [entry] = useState<MonthEntry>(month);

  const totals = useMemo(() => computeMonth(entry), [entry]);
  const graph = useMemo(() => buildFlow(totals), [totals]);
  const verdict = rateSavings(totals.savingsRate);

  return (
    <div className="ledger">
      <div className="ledger-top">
        <div>
          <div className="ledger-kicker">Cash flow</div>
          <h1 className="ledger-month">{monthLabel(totals.month)}</h1>
        </div>
      </div>

      {/* The stat row. Savings rate is the hero: Monarch buries it as the
          fourth card with no interpretation, and it is the one number on
          this screen that answers a question rather than reporting one. */}
      <div className="ledger-stats">
        <Stat label="Total income" value={fmtMoney(totals.totalIncome)} tone="gain" />
        <Stat label="Total expenses" value={fmtMoney(totals.totalExpenses)} tone="loss" />
        <Stat
          label={totals.savings < 0 ? 'Shortfall' : 'Total saved'}
          value={fmtMoney(Math.abs(totals.savings))}
          tone={totals.savings < 0 ? 'loss' : 'gain'}
          arrow={totals.savings < 0 ? '↓' : '↑'}
        />
        <div className={`ledger-stat is-hero ${verdict ? `is-${verdict.health}` : ''}`}>
          <div className="ledger-stat-label">Savings rate</div>
          <div className="ledger-stat-value tabular">
            {totals.savingsRate === null ? '—' : fmtPct(totals.savingsRate, 1)}
          </div>
          {verdict && <div className="ledger-stat-verdict">{verdict.label}</div>}
        </div>
      </div>

      {verdict && <p className="ledger-meaning">{verdict.meaning}</p>}

      <Card delay={0} className="ledger-flow-card">
        <div className="ledger-flow-head">
          <h2 className="section-title">Where it went</h2>
          <span className="ledger-flow-note">
            every share is % of {fmtMoney(graph.denominator)}
          </span>
        </div>
        <div className="ledger-flow-body">
          <SankeyFlow graph={graph} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone, arrow }:
  { label: string; value: string; tone: 'gain' | 'loss'; arrow?: string }) {
  return (
    <div className={`ledger-stat is-${tone}`}>
      <div className="ledger-stat-label">{label}</div>
      <div className="ledger-stat-value tabular">
        {/* Colour never travels alone: every tinted figure carries a glyph. */}
        {arrow && <span className="ledger-stat-arrow">{arrow}</span>}{value}
      </div>
    </div>
  );
}
