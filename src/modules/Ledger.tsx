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
// It does NOT own the figures. Those are the user's data and live in
// App.tsx, above the point where this unmounts on navigation.
//
// Working name. "Ledger" is a placeholder alongside the unresolved suite
// name.
// ============================================================
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { BudgetEntry } from '../components/BudgetEntry';
import { CashFlowChart } from '../components/CashFlowChart';
import { CategoryDonut } from '../components/CategoryDonut';
import { SankeyFlow, minHeightFor } from '../components/SankeyFlow';
import {
  annualSavings, applyWhatIf, buildFlow, childrenOf, computeMonth, computeSeries,
  emptyMonth, isWhatIfActive, monthKey, monthLabel, rateCategory, rateSavings, runway,
  SUBCATEGORY_BY_ID,
  type BudgetData, type MonthEntry, type SubcategoryId, type WhatIf,
} from '../lib/budget';
import { computeRiskProfile } from '../lib/risk';
import { runRetirement } from '../lib/retirement';
import type { Holding } from '../lib/assets';
import type { Assumptions } from '../lib/settings';
import { fmtInputCommas, fmtMoney, fmtPct, parseMoneyInput } from '../lib/format';
import './Ledger.css';

type Tab = 'flow' | 'categories' | 'goals';

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'flow', label: 'Flow', blurb: 'Where the money went' },
  { id: 'categories', label: 'Categories', blurb: 'What each line is worth' },
  { id: 'goals', label: 'Goals', blurb: 'What it adds up to' },
];

type Props = {
  data: BudgetData;
  onChange: (next: BudgetData) => void;
  onReset: () => void;
  // For the retirement handoff. This module's output becomes MonteVue's
  // input, which is the one thing neither reference app can do.
  holdings: Holding[];
  assumptions: Assumptions;
};

export function Ledger({ data, onChange, onReset, holdings, assumptions }: Props) {
  const [tab, setTab] = useState<Tab>('flow');
  const [collapsed, setCollapsed] = useState(false);
  const [whatIf, setWhatIf] = useState<WhatIf>({});
  const [hoverCat, setHoverCat] = useState<string | null>(null);

  // Which month is being edited. Defaults to the newest entered.
  const sortedKeys = useMemo(
    () => [...data.months].map((m) => m.month).sort(),
    [data.months]
  );
  const [active, setActive] = useState<string>(() => sortedKeys[sortedKeys.length - 1] ?? monthKey(new Date()));

  const entry = data.months.find((m) => m.month === active) ?? emptyMonth(active);

  // What-if runs the SAME path as real data: adjust the entry, then
  // recompute. Two code paths for "the numbers" is how a displayed figure
  // drifts from the one actually used.
  const shown = useMemo(() => applyWhatIf(entry, whatIf), [entry, whatIf]);
  const totals = useMemo(() => computeMonth(shown), [shown]);
  const baseTotals = useMemo(() => computeMonth(entry), [entry]);
  const graph = useMemo(() => buildFlow(totals), [totals]);
  const series = useMemo(() => computeSeries(data.months), [data.months]);
  const verdict = rateSavings(totals.savingsRate);
  const active_ = isWhatIfActive(whatIf);

  function updateEntry(next: MonthEntry) {
    const months = data.months.some((m) => m.month === next.month)
      ? data.months.map((m) => (m.month === next.month ? next : m))
      : [...data.months, next];
    onChange({ ...data, months });
  }

  function stepMonth(delta: number) {
    const [y, m] = active.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setActive(monthKey(d));
  }

  return (
    <div className="ledger">
      <BudgetEntry
        entry={entry}
        onChange={updateEntry}
        onReset={onReset}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <div className="ledger-main">
        <header className="ledger-header">
          <div>
            <div className="ledger-kicker">Cash flow</div>
            <div className="ledger-monthpick">
              <button onClick={() => stepMonth(-1)} aria-label="Previous month">‹</button>
              <h1 className="ledger-month">{monthLabel(active)}</h1>
              <button onClick={() => stepMonth(1)} aria-label="Next month">›</button>
            </div>
          </div>

          <nav className="ledger-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`ledger-tab ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
                title={t.blurb}
              >{t.label}</button>
            ))}
          </nav>
        </header>

        {active_ && (
          <div className="ledger-whatif-banner">
            <span>
              Showing a what-if, not what happened. Saved{' '}
              <strong className="tabular">{fmtMoney(baseTotals.savings)}</strong> → {' '}
              <strong className="tabular">{fmtMoney(totals.savings)}</strong>.
            </span>
            <button onClick={() => setWhatIf({})}>Clear</button>
          </div>
        )}

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

        {tab === 'flow' && (
          <div className="ledger-panel">
            {series.months.filter((m) => m.hasData).length > 1 && (
              <Card delay={0} className="ledger-cf-card">
                <h2 className="section-title">Month by month</h2>
                <div className="ledger-cf-body"><CashFlowChart months={series.months} /></div>
              </Card>
            )}

            <Card delay={1} className="ledger-flow-card">
              <div className="ledger-flow-head">
                <h2 className="section-title">Where it went</h2>
                <span className="ledger-flow-note">
                  every share is % of {fmtMoney(graph.denominator)}
                </span>
              </div>
              {/* Reserve the height the label column actually needs. Below
                  it the chart would have to clip, and this project's
                  deliberate failure mode is to scroll instead. */}
              <div className="ledger-flow-body"
                style={{ minHeight: minHeightFor(graph.nodes.filter((n) => n.depth === 3).length) }}>
                <SankeyFlow graph={graph} />
              </div>
            </Card>
          </div>
        )}

        {tab === 'categories' && (
          <div className="ledger-panel ledger-cats">
            <Card delay={0} className="ledger-donut-card">
              <h2 className="section-title">Spending split</h2>
              <div className="ledger-donut-row">
                <CategoryDonut
                  categories={totals.categories}
                  total={totals.totalExpenses}
                  active={hoverCat}
                  onHover={setHoverCat}
                />
                <div className="ledger-fixvar">
                  <FixVar label="Fixed commitments" value={totals.fixedTotal} total={totals.totalExpenses}
                    note="Rent, insurance, a car payment. Not this month's decision." />
                  <FixVar label="Variable spending" value={totals.variableTotal} total={totals.totalExpenses}
                    note="The part that responds to a choice, and the only part the sliders touch." />
                </div>
              </div>
            </Card>

            {/* The thing no consumer app does: every category carries its
                interpretation and a verdict, not just an amount. */}
            <Card delay={1} className="ledger-list-card">
              <div className="ledger-flow-head">
                <h2 className="section-title">Every category, judged</h2>
                <span className="ledger-flow-note">bands are rules of thumb, not your data</span>
              </div>
              <div className="ledger-list">
                {totals.categories.map((c) => {
                  const v = rateCategory(c, totals.totalIncome);
                  return (
                    <div
                      key={c.id}
                      className={`ledger-row ${hoverCat && hoverCat !== c.id ? 'is-dim' : ''}`}
                      onMouseEnter={() => setHoverCat(c.id)}
                      onMouseLeave={() => setHoverCat(null)}
                    >
                      <span className="ledger-row-dot" style={{ background: c.color }} />
                      <div className="ledger-row-body">
                        <div className="ledger-row-top">
                          <span className="ledger-row-name">{c.name}</span>
                          <span className="ledger-row-amt tabular">{fmtMoney(c.total)}</span>
                        </div>
                        {v && <div className="ledger-row-meaning">{v.meaning}</div>}
                      </div>
                      {v && <span className={`ledger-verdict is-${v.health}`}>{v.label}</span>}
                    </div>
                  );
                })}
                {totals.categories.length === 0 && (
                  <p className="ledger-empty">Nothing entered for this month yet.</p>
                )}
              </div>
            </Card>

            <Card delay={2} className="ledger-whatif-card">
              <div className="ledger-flow-head">
                <h2 className="section-title">What if</h2>
                <span className="ledger-flow-note">variable lines only</span>
              </div>
              <p className="ledger-note">
                Fixed commitments have no slider on purpose. Offering one on rent implies a choice
                that is not on the table this month, and a savings rate built on pretending
                otherwise is worth nothing.
              </p>
              <div className="ledger-sliders">
                {topVariable(totals).map((s) => {
                  const mult = whatIf[s.id] ?? 1;
                  return (
                    <div className="ledger-slider" key={s.id}>
                      <div className="ledger-slider-top">
                        <span>{SUBCATEGORY_BY_ID[s.id]?.name ?? s.id}</span>
                        <span className="tabular">
                          {fmtMoney(s.amount * mult)}
                          {Math.abs(mult - 1) > 1e-9 && (
                            <em className="ledger-slider-delta">
                              {mult < 1 ? '−' : '+'}{fmtPct(Math.abs(1 - mult), 0)}
                            </em>
                          )}
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={1.5} step={0.05} value={mult}
                        onChange={(e) => setWhatIf({ ...whatIf, [s.id]: Number(e.target.value) })}
                        aria-label={`Adjust ${SUBCATEGORY_BY_ID[s.id]?.name ?? s.id}`}
                      />
                    </div>
                  );
                })}
                {topVariable(totals).length === 0 && (
                  <p className="ledger-empty">No variable spending entered for this month.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === 'goals' && (
          <GoalsTab data={data} onChange={onChange} series={series}
            holdings={holdings} assumptions={assumptions} />
        )}
      </div>
    </div>
  );
}

// The six largest variable lines. Sliders on all twenty-six would be a
// control panel, not a lever.
function topVariable(totals: ReturnType<typeof computeMonth>) {
  return totals.categories
    .flatMap((c) => c.children.filter((s) => !s.fixed))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6) as { id: SubcategoryId; amount: number }[];
}

// ---- Goals ----------------------------------------------------

function GoalsTab({ data, onChange, series, holdings, assumptions }: {
  data: BudgetData;
  onChange: (next: BudgetData) => void;
  series: ReturnType<typeof computeSeries>;
  holdings: Holding[];
  assumptions: Assumptions;
}) {
  const [years, setYears] = useState(25);
  const annual = annualSavings(series);
  const months = runway(data.cashOnHand, series.avgExpenses);
  const risk = computeRiskProfile(holdings, assumptions);

  // The suite advantage: this module's output is MonteVue's input. The
  // portfolio's OWN return and volatility are used, not a generic 7%, so
  // changing the portfolio changes this answer.
  const plan = useMemo(() => {
    if (annual <= 0 || series.avgExpenses <= 0) return null;
    return runRetirement({
      currentSavings: data.cashOnHand ?? 0,
      annualContribution: annual,
      yearsToRetire: years,
      yearsInRetirement: 30,
      annualSpending: series.avgExpenses * 12,
      expReturn: risk.expReturn,
      volatility: risk.volatility,
    }, 2000);
  }, [annual, years, data.cashOnHand, series.avgExpenses, risk.expReturn, risk.volatility]);

  return (
    <div className="ledger-panel ledger-goals">
      <Card delay={0}>
        <h2 className="section-title">Emergency fund</h2>
        <label className="ledger-cash">
          <span>Cash on hand</span>
          <input
            className="be-input tabular" inputMode="decimal"
            value={data.cashOnHand === null ? '' : fmtInputCommas(data.cashOnHand)}
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange({ ...data, cashOnHand: v === '' ? null : Math.max(0, parseMoneyInput(v)) });
            }}
          />
        </label>
        {months === null ? (
          <p className="ledger-note">
            Enter cash on hand, and a month of expenses, to see how long it would cover you.
          </p>
        ) : (
          <>
            <div className="ledger-big tabular">{months.toFixed(1)} months</div>
            <p className="ledger-note">
              {fmtMoney(data.cashOnHand ?? 0)} against average spending of {fmtMoney(series.avgExpenses)} a month.
              Three to six months is the usual target.
            </p>
          </>
        )}
      </Card>

      <Card delay={1}>
        <h2 className="section-title">At this savings rate</h2>
        {annual <= 0 ? (
          <p className="ledger-note">Nothing is being saved yet, so there is nothing to project.</p>
        ) : (
          <>
            <div className="ledger-big tabular">{fmtMoney(annual)}<span className="ledger-big-unit">/year</span></div>
            <p className="ledger-note">
              Twelve months at the current run rate ({fmtMoney(series.avgSavings)} a month across{' '}
              {series.months.filter((m) => m.hasData).length} month
              {series.months.filter((m) => m.hasData).length === 1 ? '' : 's'} entered).
            </p>
          </>
        )}
      </Card>

      <Card delay={2} className="ledger-plan-card">
        <div className="ledger-flow-head">
          <h2 className="section-title">Will it last?</h2>
          <span className="ledger-flow-note">run through MonteVue</span>
        </div>
        {!plan ? (
          <p className="ledger-note">
            Needs both a positive savings rate and a month of expenses.
          </p>
        ) : (
          <>
            <div className="ledger-plan-controls">
              <label>
                <span>Years until you stop working</span>
                <input type="range" min={5} max={45} step={1} value={years}
                  onChange={(e) => setYears(Number(e.target.value))} />
                <strong className="tabular">{years}</strong>
              </label>
            </div>
            <div className={`ledger-big tabular ${plan.successRate >= 0.8 ? 'is-good' : plan.successRate >= 0.5 ? 'is-ok' : 'is-bad'}`}>
              {fmtPct(plan.successRate, 0)}
            </div>
            <p className="ledger-note">
              of {' '}
              simulated futures still have money after 30 years of retirement, saving{' '}
              {fmtMoney(annual)} a year and spending {fmtMoney(series.avgExpenses * 12)} a year once
              retired. Growth uses your own portfolio's {fmtPct(risk.expReturn, 1)} return and{' '}
              {fmtPct(risk.volatility, 1)} volatility, so changing the portfolio in MonteVue changes
              this number.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

// ---- small pieces ---------------------------------------------

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

function FixVar({ label, value, total, note }:
  { label: string; value: number; total: number; note: string }) {
  const share = total > 0 ? value / total : 0;
  return (
    <div className="ledger-fixvar-row">
      <div className="ledger-fixvar-top">
        <span>{label}</span>
        <span className="tabular">{fmtMoney(value)} · {fmtPct(share, 0)}</span>
      </div>
      <div className="ledger-fixvar-track">
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <div className="ledger-fixvar-note">{note}</div>
    </div>
  );
}
