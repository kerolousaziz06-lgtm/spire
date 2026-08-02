// ============================================================
// Settings.tsx — the assumptions, made visible and arguable.
//
// This is not a preferences screen. Every engine number that used to be
// hardcoded is here, with a line saying what it affects, so the app can
// say "these are my documented inputs; here is what happens if you
// disagree" instead of asking to be taken on faith.
//
// Changes apply immediately. There is no Save button, because watching a
// number move as you change the assumption behind it is the whole point.
// ============================================================
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { ASSETS, statsFor, type Holding } from '../lib/assets';
import { runSimulation } from '../lib/montecarlo';
import { fmtMoney, fmtPct } from '../lib/format';
import {
  BOUNDS, PATH_CHOICES, TAIL_CAVEAT, TAIL_DOF, TAIL_LABEL, TAIL_NOTE,
  clamp, type Assumptions, type DisplaySettings, type Settings, type TailSeverity,
  type Units, type NumberFormat,
} from '../lib/settings';
import './Settings.css';

type Section = 'assumptions' | 'assets' | 'display' | 'data' | 'about';

const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  { id: 'assumptions', label: 'Assumptions', blurb: 'What the engines assume' },
  { id: 'assets', label: 'Assets', blurb: 'Return and risk per asset' },
  { id: 'display', label: 'Display', blurb: 'Units and formatting' },
  { id: 'data', label: 'Data', blurb: 'Saved inputs' },
  { id: 'about', label: 'About', blurb: 'Where the numbers come from' },
];

// A fixed reference mix for the fat-tail comparison, so the table means
// the same thing regardless of what the user currently holds.
const REFERENCE: Holding[] = [
  { assetId: 'us_stocks', dollars: 60000 },
  { assetId: 'bonds', dollars: 40000 },
];

type Props = {
  settings: Settings;
  onSettings: (next: Settings) => void;
  onResetSettings: () => void;
  onClearAllData: () => void;
};

export function Settings({ settings, onSettings, onResetSettings, onClearAllData }: Props) {
  const [section, setSection] = useState<Section>('assumptions');
  const { assumptions, display } = settings;

  const setA = (patch: Partial<Assumptions>) =>
    onSettings({ ...settings, assumptions: { ...assumptions, ...patch } });
  const setD = (patch: Partial<DisplaySettings>) =>
    onSettings({ ...settings, display: { ...display, ...patch } });

  return (
    <div className="module set">
      <header className="topbar">
        <div>
          <h1 className="topbar-title">Settings</h1>
          <p className="topbar-subtitle">
            The assumptions behind every number in the suite. Changes apply immediately.
          </p>
        </div>
      </header>

      <div className="set-body">
        <nav className="set-rail" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`set-rail-item ${section === s.id ? 'is-active' : ''}`}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'true' : undefined}
            >
              <span className="set-rail-label">{s.label}</span>
              <span className="set-rail-blurb">{s.blurb}</span>
            </button>
          ))}
        </nav>

        <div className="set-panel">
          {section === 'assumptions' && <AssumptionsSection assumptions={assumptions} setA={setA} />}
          {section === 'assets' && <AssetsSection assumptions={assumptions} setA={setA} />}
          {section === 'display' && <DisplaySection display={display} setD={setD} />}
          {section === 'data' && (
            <DataSection onResetSettings={onResetSettings} onClearAllData={onClearAllData} />
          )}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

// ---- Assumptions -----------------------------------------------------

function AssumptionsSection({ assumptions, setA }:
  { assumptions: Assumptions; setA: (p: Partial<Assumptions>) => void }) {

  // All four severities on one reference portfolio. Computed once and
  // memoised. This table exists because the setting behaves against
  // intuition: total volatility is held constant, so fatter tails do not
  // widen the everyday range, they concentrate it and push the risk into
  // rare events. Showing the numbers that DO move is more honest than a
  // note claiming the switch "adds risk".
  const comparison = useMemo(() => {
    return (Object.keys(TAIL_DOF) as TailSeverity[]).map((sev) => {
      const r = runSimulation({
        holdings: REFERENCE, years: 10, numPaths: 2500,
        assumptions: { ...assumptions, tailSeverity: sev },
      });
      return { sev, maxDD: r.medianMaxDrawdown, spread: r.p95 - r.p5, p5: r.p5 };
    });
    // Deliberately keyed off the overrides and risk-free rate too: an asset
    // edit changes these numbers and the table should follow.
  }, [assumptions.assetOverrides, assumptions.riskFreeRate]);

  return (
    <div className="set-stack">
      <Card>
        <SettingHead
          title="Risk-free rate"
          note="The return you could earn with no risk. Used in the Sharpe ratio, so it moves every risk verdict in MonteVue."
        />
        <div className="set-row">
          <input
            className="set-range"
            type="range"
            min={BOUNDS.riskFreeRate.min} max={BOUNDS.riskFreeRate.max} step={0.0025}
            value={assumptions.riskFreeRate}
            onChange={(e) => setA({ riskFreeRate: clamp(Number(e.target.value), BOUNDS.riskFreeRate) })}
            aria-label="Risk-free rate"
          />
          <span className="set-value tabular">{fmtPct(assumptions.riskFreeRate, 2)}</span>
        </div>
      </Card>

      <Card>
        <SettingHead
          title="Fat-tail severity"
          note="How often extreme years happen. Controls the Student's t degrees of freedom in the simulation."
        />
        <div className="set-choices">
          {(Object.keys(TAIL_DOF) as TailSeverity[]).map((sev) => (
            <button
              key={sev}
              className={`set-choice ${assumptions.tailSeverity === sev ? 'is-active' : ''}`}
              onClick={() => setA({ tailSeverity: sev })}
              aria-pressed={assumptions.tailSeverity === sev}
            >
              {TAIL_LABEL[sev]}
              <span className="set-choice-sub tabular">
                {Number.isFinite(TAIL_DOF[sev]) ? `dof ${TAIL_DOF[sev]}` : 'normal'}
              </span>
            </button>
          ))}
        </div>
        <p className="set-note set-note--selected">{TAIL_NOTE[assumptions.tailSeverity]}</p>

        <div className="set-compare">
          <div className="set-compare-head">
            <span>Effect on a 60/40 portfolio over 10 years</span>
            <span className="set-compare-hint">2,500 paths</span>
          </div>
          <table className="set-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th className="num">Typical worst drop</th>
                <th className="num">90% range</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(({ sev, maxDD, spread }) => (
                <tr key={sev} className={assumptions.tailSeverity === sev ? 'is-active' : ''}>
                  <td>{TAIL_LABEL[sev]}</td>
                  <td className="num tabular">{fmtPct(maxDD)}</td>
                  <td className="num tabular">{fmtMoney(spread)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="set-note">{TAIL_CAVEAT}</p>
        </div>
      </Card>

      <Card>
        <SettingHead
          title="Default simulation paths"
          note="How many possible futures MonteVue rolls. More paths means steadier percentiles and a slower recompute."
        />
        <div className="set-choices">
          {PATH_CHOICES.map((n) => (
            <button
              key={n}
              className={`set-choice ${assumptions.defaultNumPaths === n ? 'is-active' : ''}`}
              onClick={() => setA({ defaultNumPaths: n })}
              aria-pressed={assumptions.defaultNumPaths === n}
            >
              <span className="tabular">{n.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---- Assets ----------------------------------------------------------

function AssetsSection({ assumptions, setA }:
  { assumptions: Assumptions; setA: (p: Partial<Assumptions>) => void }) {

  const setOverride = (id: string, key: 'expReturn' | 'volatility', raw: string) => {
    const next = { ...assumptions.assetOverrides };
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Cleared: fall back to the built-in value rather than storing 0.
      const entry = { ...next[id] };
      delete entry[key];
      if (Object.keys(entry).length === 0) delete next[id];
      else next[id] = entry;
    } else {
      const v = clamp(Number(trimmed) / 100, BOUNDS[key]);
      next[id] = { ...next[id], [key]: v };
    }
    setA({ assetOverrides: next });
  };

  const resetRow = (id: string) => {
    const next = { ...assumptions.assetOverrides };
    delete next[id];
    setA({ assetOverrides: next });
  };

  return (
    <div className="set-stack">
      <Card>
        <SettingHead
          title="Asset assumptions"
          note="Long-run approximations, not facts. Expected return feeds the projection and the frontier; volatility feeds both plus the Sharpe ratio."
        />
        <table className="set-table set-table--assets">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Expected return</th>
              <th className="num">Volatility</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((a) => {
              const o = assumptions.assetOverrides[a.id];
              const live = statsFor(a, assumptions.assetOverrides);
              const edited = !!o;
              return (
                <tr key={a.id} className={edited ? 'is-edited' : ''}>
                  <td>
                    <span className="set-swatch" style={{ background: a.color }} />
                    {a.name}
                  </td>
                  <td className="num">
                    <input
                      className="set-cell tabular" type="number" step="0.1"
                      value={o?.expReturn !== undefined ? +(o.expReturn * 100).toFixed(2) : ''}
                      placeholder={(a.expReturn * 100).toFixed(1)}
                      onChange={(e) => setOverride(a.id, 'expReturn', e.target.value)}
                      aria-label={`${a.name} expected return, percent`}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="set-cell tabular" type="number" step="0.1"
                      value={o?.volatility !== undefined ? +(o.volatility * 100).toFixed(2) : ''}
                      placeholder={(a.volatility * 100).toFixed(1)}
                      onChange={(e) => setOverride(a.id, 'volatility', e.target.value)}
                      aria-label={`${a.name} volatility, percent`}
                    />
                  </td>
                  <td className="num">
                    {edited && (
                      <button className="set-rowreset" onClick={() => resetRow(a.id)}
                        title={`Restore ${fmtPct(a.expReturn)} / ${fmtPct(a.volatility)}`}>
                        reset
                      </button>
                    )}
                    {!edited && <span className="set-rowhint tabular">{fmtPct(live.expReturn)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="set-note">
          Entered as percentages. Bounded to {fmtPct(BOUNDS.expReturn.min, 0)}–{fmtPct(BOUNDS.expReturn.max, 0)} for
          return and {fmtPct(BOUNDS.volatility.min, 1)}–{fmtPct(BOUNDS.volatility.max, 0)} for volatility: a volatility
          of zero divides by zero in the Sharpe ratio, and a negative one means nothing. Leave a cell blank to use the
          built-in value.
        </p>
      </Card>

      <Card>
        <SettingHead
          title="Correlations"
          note="Read-only, on purpose."
        />
        <p className="set-note">
          The pairwise correlations are hand-picked and are <strong>not mutually consistent</strong>: 2,336 of the
          8,178 portfolios you can build produce a matrix that is not positive semi-definite, worst eigenvalue −0.32.
          Every engine repairs it to the nearest valid matrix before use, shifting a correlation by up to 0.165 in the
          worst case. Allowing edits here would invite arbitrarily invalid matrices and lean harder on that repair, so
          they are shown rather than exposed.
        </p>
      </Card>
    </div>
  );
}

// ---- Display ---------------------------------------------------------

function DisplaySection({ display, setD }:
  { display: DisplaySettings; setD: (p: Partial<DisplaySettings>) => void }) {
  return (
    <div className="set-stack">
      <Card>
        <SettingHead
          title="Units"
          note="A label only. The app never rescales your figures — enter everything in one unit and this says which."
        />
        <div className="set-choices">
          {(['billions', 'millions', 'thousands'] as Units[]).map((u) => (
            <button key={u} className={`set-choice ${display.units === u ? 'is-active' : ''}`}
              onClick={() => setD({ units: u })} aria-pressed={display.units === u}>
              {u[0].toUpperCase() + u.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SettingHead title="Number format" note="Which separators to use for thousands and decimals." />
        <div className="set-choices">
          <button className={`set-choice ${display.numberFormat === 'us' ? 'is-active' : ''}`}
            onClick={() => setD({ numberFormat: 'us' })} aria-pressed={display.numberFormat === 'us'}>
            US <span className="set-choice-sub tabular">1,234.56</span>
          </button>
          <button className={`set-choice ${display.numberFormat === 'eu' ? 'is-active' : ''}`}
            onClick={() => setD({ numberFormat: 'eu' })} aria-pressed={display.numberFormat === 'eu'}>
            European <span className="set-choice-sub tabular">1.234,56</span>
          </button>
        </div>
      </Card>

      <Card>
        <SettingHead
          title="Currency symbol"
          note="Cosmetic only. It does NOT convert anything — the figures stay exactly as you entered them."
        />
        <div className="set-choices">
          {['$', '£', '€', '¥'].map((c) => (
            <button key={c} className={`set-choice ${display.currencySymbol === c ? 'is-active' : ''}`}
              onClick={() => setD({ currencySymbol: c })} aria-pressed={display.currencySymbol === c}>
              <span className="tabular">{c}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SettingHead
          title="Reduce motion"
          note="Turns off the chart draw-in and card entrance animations. Your OS setting is respected already; this forces it on."
        />
        <div className="set-choices">
          <button className={`set-choice ${display.reduceMotion ? 'is-active' : ''}`}
            onClick={() => setD({ reduceMotion: true })} aria-pressed={display.reduceMotion}>On</button>
          <button className={`set-choice ${!display.reduceMotion ? 'is-active' : ''}`}
            onClick={() => setD({ reduceMotion: false })} aria-pressed={!display.reduceMotion}>Follow system</button>
        </div>
      </Card>
    </div>
  );
}

// ---- Data ------------------------------------------------------------

function DataSection({ onResetSettings, onClearAllData }:
  { onResetSettings: () => void; onClearAllData: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="set-stack">
      <Card>
        <SettingHead
          title="Reset assumptions"
          note="Restores the risk-free rate, fat-tail severity, path count and every asset override to the documented defaults."
        />
        <button className="set-btn" onClick={onResetSettings}>Reset to defaults</button>
      </Card>

      <Card>
        <SettingHead
          title="Clear stored data"
          note="Removes your saved portfolio, company figures and settings from this browser. Nothing was ever sent anywhere — it is all local."
        />
        {confirming ? (
          <div className="set-confirm">
            <span className="set-confirm-q">Clear everything and reload the samples?</span>
            <button className="set-btn set-btn--danger" onClick={() => { onClearAllData(); setConfirming(false); }}>
              Yes, clear it
            </button>
            <button className="set-btn" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button className="set-btn" onClick={() => setConfirming(true)}>Clear stored data</button>
        )}
      </Card>
    </div>
  );
}

// ---- About -----------------------------------------------------------

function AboutSection() {
  return (
    <div className="set-stack">
      <Card>
        <SettingHead title="Where the asset numbers come from" note="" />
        <p className="set-note">
          Expected returns and volatilities are long-run historical approximations, rounded to values that are simple
          to defend rather than precise to a decimal. They are nominal, not inflation-adjusted, which matches how
          people read an account balance. They are assumptions, which is why they are editable.
        </p>
      </Card>

      <Card>
        <SettingHead title="Correlations are repaired" note="" />
        <p className="set-note">
          The pairwise correlations are chosen independently and are not mutually consistent, so for many portfolios
          they do not form a valid (positive semi-definite) matrix. Every engine projects to the nearest valid one
          before use. Measured across all 8,178 possible portfolios: 2,336 needed repair, worst eigenvalue −0.32, and
          the largest single correlation shift is 0.165.
        </p>
      </Card>

      <Card>
        <SettingHead title="Verified benchmarks" note="Re-checked by npm run verify:math" />
        <ul className="set-list">
          <li>100% S&amp;P over 10 years annualizes to 6.03%, correctly below the 7% arithmetic input because of volatility drag</li>
          <li>100% cash stays flat</li>
          <li>2008 replay: −55.00% all-stocks, −39.30% for the default mix, identical on every repeat</li>
          <li>DuPont's three factors multiply back to reported ROE exactly</li>
          <li>LBO IRR of 13.65% reconciles to MOIC^(1/years)−1; raising leverage 2.0× to 5.0× lifts it to 20.64%</li>
        </ul>
      </Card>
    </div>
  );
}

// ---- shared ----------------------------------------------------------

function SettingHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="set-head">
      <h2 className="set-title">{title}</h2>
      {note && <p className="set-sub">{note}</p>}
    </div>
  );
}
