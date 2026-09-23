// ============================================================
// Screener.tsx — rank the stored universe instead of one company.
//
// This module exists because the data layer changed what the app can be
// asked. CLAUDE.md ruled a screener out permanently on the grounds that
// it "needs current fundamentals across hundreds of companies" and the
// app had no server. That premise is gone: 189 companies are ingested
// weekly and the ratios, sector medians and percentile ranks are computed
// in SQL over the whole set at once (ingest/analytics.sql).
//
// The conductor only narrows and sorts. Nothing here computes a statistic
// — doing so would put a second implementation of a sector median next to
// the verified one, and the screen would show the unverified copy.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import {
  EMPTY_QUERY, METRICS, METRIC_BY_KEY, coverage, runQuery, sectorsOf,
  type Filter, type Metric, type Query, type ScreenerRow, type SectorComp,
} from '../lib/screener';
import { loadScreenerData } from '../lib/screenerData';
import { fmtPct } from '../lib/format';
import './Screener.css';

// Columns the table shows. Deliberately short: a screener that shows
// every metric is a spreadsheet, and the point is to compare a few.
const COLUMNS: Metric[] = [
  'market_cap', 'revenue', 'yoy_growth', 'net_margin', 'roe', 'ev_ebitda', 'pe',
];

function fmtValue(v: number | null, kind: 'pct' | 'ratio' | 'money'): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (kind === 'pct') return fmtPct(v, 1);
  if (kind === 'ratio') return v.toFixed(1) + '×';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(0) + 'M';
  return v.toFixed(0);
}

export function Screener({ onOpenCompany }: { onOpenCompany?: (t: string) => void }) {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [sectors, setSectors] = useState<SectorComp[]>([]);
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState<Query>(EMPTY_QUERY);

  useEffect(() => {
    loadScreenerData().then((d) => {
      if (d) { setRows(d.rows); setSectors(d.sectors); setGenerated(d.generated); }
      setLoading(false);
    });
  }, []);

  const all = rows ?? [];
  const available = useMemo(() => sectorsOf(all), [all]);
  const result = useMemo(() => runQuery(all, q), [all, q]);

  const setFilter = (metric: Metric, which: 'min' | 'max', raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw);
    const value = n !== null && Number.isFinite(n) ? n : null;
    setQ((prev) => {
      const filters = prev.filters.filter((f) => f.metric !== metric);
      const existing = prev.filters.find((f) => f.metric === metric)
        ?? { metric, min: null, max: null } as Filter;
      const next = { ...existing, [which]: value };
      return next.min === null && next.max === null
        ? { ...prev, filters }
        : { ...prev, filters: [...filters, next] };
    });
  };
  const filterOf = (m: Metric) => q.filters.find((f) => f.metric === m);

  const toggleSector = (s: string) =>
    setQ((p) => ({
      ...p,
      sectors: p.sectors.includes(s) ? p.sectors.filter((x) => x !== s) : [...p.sectors, s],
    }));

  const sortOn = (m: Metric) =>
    setQ((p) => p.sortBy === m
      ? { ...p, sortDir: p.sortDir === 'asc' ? 'desc' : 'asc' }
      : { ...p, sortBy: m, sortDir: METRIC_BY_KEY[m].lowerIsBetter ? 'asc' : 'desc' });

  if (loading) {
    return <div className="scr"><p className="scr-note">Loading the universe…</p></div>;
  }

  // No data published is a deployment state, not a fault. Say which, and
  // say what still works, rather than showing an empty table.
  if (!rows) {
    return (
      <div className="scr">
        <Card>
          <h2 className="section-title">Screener unavailable</h2>
          <p className="scr-note">
            The company universe has not been published to this build. Vantage
            and M&amp;A still work on figures you enter by hand.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="scr">
      <header className="scr-head">
        <div>
          <h1 className="scr-title">Screener</h1>
          <p className="scr-sub">
            {all.length} companies · filings and prices as of {generated || 'the last refresh'}
          </p>
        </div>
        <button className="scr-reset" onClick={() => setQ(EMPTY_QUERY)}>Reset</button>
      </header>

      <div className="scr-body">
        <aside className="scr-filters">
          <label className="scr-search-wrap">
            <span className="scr-label">Find</span>
            <input
              className="scr-search"
              value={q.search}
              onChange={(e) => setQ((p) => ({ ...p, search: e.target.value }))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="TICKER OR NAME"
              spellCheck={false}
            />
          </label>

          <div className="scr-group">
            <span className="scr-label">Sector</span>
            <div className="scr-sectors">
              {available.map((s) => (
                <button
                  key={s}
                  className={`scr-chip ${q.sectors.includes(s) ? 'is-on' : ''}`}
                  onClick={() => toggleSector(s)}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className="scr-group">
            <span className="scr-label">Limits</span>
            {METRICS.filter((m) => m.kind !== 'money').map((m) => {
              const f = filterOf(m.key);
              const n = coverage(all, m.key);
              return (
                <div className="scr-filter" key={m.key}>
                  <div className="scr-filter-head">
                    <span className="scr-filter-name">{m.label}</span>
                    {/* Coverage, so an empty result reads as "few filers
                        report this" rather than "the screener is broken". */}
                    <span className="scr-filter-cov">{n}/{all.length}</span>
                  </div>
                  <div className="scr-filter-row">
                    <input className="scr-num" inputMode="decimal" placeholder="min"
                      value={f?.min ?? ''} aria-label={`${m.label} minimum`}
                      onChange={(e) => setFilter(m.key, 'min', e.target.value)} />
                    <input className="scr-num" inputMode="decimal" placeholder="max"
                      value={f?.max ?? ''} aria-label={`${m.label} maximum`}
                      onChange={(e) => setFilter(m.key, 'max', e.target.value)} />
                  </div>
                  <p className="scr-filter-why">{m.meaning}</p>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="scr-results">
          <div className="scr-count">
            {result.length} of {all.length} match
            {q.sectors.length === 1 && sectors.find((s) => s.sector === q.sectors[0]) && (() => {
              const s = sectors.find((x) => x.sector === q.sectors[0])!;
              return (
                <span className="scr-median">
                  · {s.sector} median EV/EBITDA{' '}
                  <strong>{s.ev_ebitda_median !== null ? s.ev_ebitda_median.toFixed(1) + '×' : '—'}</strong>
                  {s.with_ev_ebitda < s.companies &&
                    <span className="scr-median-n"> (from {s.with_ev_ebitda} of {s.companies})</span>}
                </span>
              );
            })()}
          </div>

          <div className="scr-table-wrap">
            <table className="scr-table tabular">
              <thead>
                <tr>
                  <th className="scr-th-t">Ticker</th>
                  {COLUMNS.map((c) => (
                    <th key={c}>
                      <button className={`scr-sort ${q.sortBy === c ? 'is-on' : ''}`}
                        onClick={() => sortOn(c)} title={METRIC_BY_KEY[c].meaning}>
                        {METRIC_BY_KEY[c].label}
                        {q.sortBy === c && <span>{q.sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.map((r) => (
                  <tr key={r.ticker}>
                    <td className="scr-td-t">
                      <button className="scr-ticker" onClick={() => onOpenCompany?.(r.ticker)}
                        title={`${r.name}${r.industry ? ' · ' + r.industry : ''}`}>
                        {r.ticker}
                      </button>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c}>{fmtValue(r[c], METRIC_BY_KEY[c].kind)}</td>
                    ))}
                  </tr>
                ))}
                {result.length === 0 && (
                  <tr><td className="scr-empty" colSpan={COLUMNS.length + 1}>
                    Nothing matches. Percentages are fractions here — 0.15 is 15%.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
