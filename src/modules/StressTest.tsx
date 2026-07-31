// ============================================================
// StressTest.tsx — the module, now fully wired (Week 3).
//
// This is the "conductor." It owns the view state:
//   • numPaths   — how many futures to simulate (from the pills)
//   • years, viewMode, editorOpen
//
// It does NOT own `holdings`. That is the user's data and lives in
// App.tsx, above the point where this component unmounts on navigation.
//
// Whenever holdings or numPaths change, useMemo re-runs the engine
// and every child (stat cards, fan chart, risk profile) receives
// fresh real numbers. This is the reactive "cockpit": change a
// control on the left, watch everything recompute.
// ============================================================
import { useMemo, useState, useEffect } from 'react';
import { Card, StatCard } from '../components/Card';
import { TopBar } from '../components/TopBar';
import { PortfolioSummary } from '../components/PortfolioSummary';
import { PortfolioEditor } from '../components/PortfolioEditor';
import { FanChart } from '../components/FanChart';
import { CrashChart } from '../components/CrashChart';
import { CorrelationHeatmap } from '../components/CorrelationHeatmap';
import { RetirementCard } from '../components/RetirementCard';
import { EfficientFrontier } from '../components/EfficientFrontier';
import { runSimulation, type Holding } from '../lib/montecarlo';
import { computeRiskProfile, computeFrontier } from '../lib/risk';
import { CRASH_EVENTS, replayCrash } from '../lib/crashes';
import { fmtMoney, fmtPctSigned, fmtPct } from '../lib/format';
import './StressTest.css';


const DEFAULT_YEARS = 10;

// `holdings` lives in App, not here. This component unmounts whenever the
// user navigates to another module, so state held locally would be lost.
// See the note at the top of App.tsx.
type Props = {
  holdings: Holding[];
  onHoldings: (next: Holding[]) => void;
  onResetHoldings: () => void;
};

export function StressTest({ holdings, onHoldings, onResetHoldings }: Props) {
  const [numPaths, setNumPaths] = useState(5000);
  const [editorOpen, setEditorOpen] = useState(false);
  const [years, setYears] = useState(DEFAULT_YEARS);
  // Which chart to show in the center: the forward forecast, or a
  // specific historical crash replay (by event id).
  const [viewMode, setViewMode] = useState<'forecast' | string>('forecast');

  // Re-run the simulation only when holdings or numPaths change.
  // useMemo caches the result so re-renders (like hovering the chart)
  // don't needlessly re-simulate thousands of paths.
  const result = useMemo(
    () => runSimulation({ holdings, years, numPaths }),
    [holdings, years, numPaths]
  );

  // Risk stats (volatility, max drawdown, Sharpe) from the same portfolio.
  const risk = useMemo(() => computeRiskProfile(holdings), [holdings]);

  // Deterministic crash replays — recomputed only when holdings change
  // (not random, so no need to depend on numPaths/years).
  const crashResults = useMemo(
    () => CRASH_EVENTS.map((e) => replayCrash(holdings, e)),
    [holdings]
  );
  const activeCrash = crashResults.find((c) => c.event.id === viewMode) ?? null;

  // Efficient frontier: cloud of random mixes + the current portfolio.
  const frontier = useMemo(() => computeFrontier(holdings), [holdings]);

  // Brief "just recomputed" pulse on the hero number. We bump a key
  // whenever the median changes; the animation replays via that key.
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => { setPulseKey((k) => k + 1); }, [result.median]);

  const gained = result.median >= result.startValue;

  return (
    <div className="module">
      <TopBar
        title="Portfolio Stress Test"
        subtitle="Simulate thousands of possible futures and replay historical crashes"
        numPaths={numPaths}
        onNumPaths={setNumPaths}
        onReset={onResetHoldings}
        resetLabel="Reset portfolio"
      />

      <div className="cockpit">
        {/* Read-only summary that opens the editor modal */}
        <aside className="area-portfolio">
          <PortfolioSummary holdings={holdings} onOpen={() => setEditorOpen(true)} />
        </aside>

        {/* Hero + the three stat cards beneath it */}
        <section className="area-hero">
          <Card glow delay={1} className="hero">
            <div className="hero-top">
              <div className="hero-label">MEDIAN PROJECTED VALUE · {years} {years === 1 ? 'YEAR' : 'YEARS'}</div>
              <div className="hero-yearpick">
                <span className="hero-yearval tabular">{years}y</span>
                <input
                  className="hero-slider"
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  style={{ ['--fill' as string]: `${((years - 1) / 29) * 100}%` }}
                  aria-label="Projection horizon in years"
                />
              </div>
            </div>
            <div key={pulseKey} className="hero-value tabular is-fresh">{fmtMoney(result.median)}</div>
            <div className="hero-sub">
              {result.startValue > 0 ? (
                <span className={`delta ${gained ? 'delta--up' : 'delta--down'}`}>
                  {gained ? '\u25B2' : '\u25BC'} {fmtPctSigned(result.totalReturnPct)}
                </span>
              ) : (
                <span className="delta delta--neutral">—</span>
              )}
              <span className="hero-hint">
                {result.startValue > 0
                  ? `across ${numPaths.toLocaleString()} simulated futures`
                  : 'add assets to run a simulation'}
              </span>
            </div>
          </Card>

          <div className="stat-row">
            <StatCard label="Worst case (5%)" value={fmtMoney(result.p5)}
              delta={result.startValue > 0 ? Math.round(((result.p5 - result.startValue) / result.startValue) * 100) : undefined}
              hint="vs. today" delay={2} />
            <StatCard label="Best case (95%)" value={fmtMoney(result.p95)}
              delta={result.startValue > 0 ? Math.round(((result.p95 - result.startValue) / result.startValue) * 100) : undefined}
              hint="vs. today" delay={3} />
            <StatCard label="Chance of loss" value={fmtPct(result.probLoss)}
              hint="of ending below start" delay={4} />
          </div>
        </section>

        {/* Forward forecast, or the selected crash replay */}
        <section className="area-fan">
          <Card delay={5} className="chart-card">
            {viewMode === 'forecast' || !activeCrash ? (
              <>
                <div className="section-head">
                  <h2 className="section-title">Fan of Possible Futures</h2>
                  <span className="section-note">hover to inspect any year</span>
                </div>
                <FanChart result={result} />
              </>
            ) : (
              <>
                <div className="section-head">
                  <div>
                    <h2 className="section-title">{activeCrash.event.name}</h2>
                    <span className="crash-period">{activeCrash.event.period}</span>
                  </div>
                  <button className="crash-back" onClick={() => setViewMode('forecast')}>
                    ‹ Back to forecast
                  </button>
                </div>
                <CrashChart result={activeCrash} />
                <p className="crash-blurb">{activeCrash.event.blurb}</p>
              </>
            )}
          </Card>
        </section>

        {/* Crash replays — top right, alongside the hero */}
        <aside className="area-crash">
          <Card delay={2}>
            <h2 className="section-title" style={{ marginBottom: 'var(--stack-gap)' }}>Historical Crash Replay</h2>
            <div className="replay-list">
              {crashResults.map((c) => (
                <ReplayRow
                  key={c.event.id}
                  name={c.event.name}
                  drop={c.startValue > 0 ? fmtPct(c.troughDrop) : '—'}
                  recovery={c.startValue > 0 ? (c.recoveryMonths != null ? `${(c.recoveryMonths / 12).toFixed(1)} yrs` : 'not within span') : '—'}
                  active={viewMode === c.event.id}
                  disabled={c.startValue === 0}
                  onClick={() => setViewMode(viewMode === c.event.id ? 'forecast' : c.event.id)}
                />
              ))}
            </div>
            <p className="replay-note">Click a crisis to replay your portfolio through it.</p>
          </Card>
        </aside>

        {/* Risk readouts — left column, level with the fan chart */}
        <aside className="area-risk">
          <Card delay={4}>
            <h2 className="section-title" style={{ marginBottom: 'var(--stack-gap)' }}>Risk Profile</h2>
            <div className="risk-list">
              <RiskRow label="Volatility"   value={fmtPct(risk.volatility)}   level={risk.volatilityLevel} />
              <RiskRow label="Median max drawdown" value={fmtPct(result.medianMaxDrawdown)} level={Math.min(1, result.medianMaxDrawdown / 0.5)} />
              <RiskRow label="Sharpe ratio" value={risk.sharpe.toFixed(2)}    level={risk.sharpeLevel} />
            </div>
          </Card>

        </aside>

        {/* Retirement — bottom left, extended to meet the frontier's bottom */}
        <aside className="area-money">
          <RetirementCard />
        </aside>

        {/* Narrow slot, middle right. The frontier goes here: it is a fixed
            scatter of the same cloud whatever the portfolio holds, so it
            reads fine at 360px and never grows. */}
        <section className="area-sidechart">
          <Card delay={6}>
            <div className="section-head">
              <h2 className="section-title">Risk vs. Return Frontier</h2>
              <span className="section-note">Modern Portfolio Theory</span>
            </div>
            <EfficientFrontier cloud={frontier.cloud} current={frontier.current} />
          </Card>
        </section>

        {/* Wide bottom slot. The correlation matrix goes here because it is
            the one chart whose size scales with the portfolio — it draws an
            N x N grid, one row and column per holding, so it needs the width. */}
        <section className="area-widechart">
          <Card delay={7}>
            <div className="section-head">
              <h2 className="section-title">How Your Assets Move Together</h2>
              <span className="section-note">correlation · hover a cell</span>
            </div>
            <CorrelationHeatmap holdings={holdings} />
          </Card>
        </section>
      </div>

      {/* The editor modal — only rendered when open. Save commits the
          draft to holdings (triggering a re-simulation); close discards. */}
      {editorOpen && (
        <PortfolioEditor
          holdings={holdings}
          onSave={(next) => { onHoldings(next); setEditorOpen(false); }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}

function ReplayRow({ name, drop, recovery, active, disabled, onClick }:
  { name: string; drop: string; recovery: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`replay-row ${active ? 'is-active' : ''}`} onClick={onClick} disabled={disabled}>
      <div>
        <div className="replay-event">{name}</div>
        <div className="replay-recovery">{recovery === '—' ? 'add assets to replay' : `Recovered in ${recovery}`}</div>
      </div>
      <span className={`delta ${drop === '—' ? 'delta--neutral' : 'delta--down'} tabular`}>{drop}</span>
    </button>
  );
}

function RiskRow({ label, value, level }: { label: string; value: string; level: number }) {
  return (
    <div className="risk-row">
      <div className="risk-top">
        <span className="risk-label">{label}</span>
        <span className="risk-value tabular">{value}</span>
      </div>
      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${Math.min(100, level * 100)}%` }} />
      </div>
    </div>
  );
}
