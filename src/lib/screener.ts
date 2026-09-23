// ============================================================
// screener.ts — filtering and ranking over the stored universe.
//
// Pure: no React, no fetch, no DOM. The heavy lifting already happened in
// SQL (ingest/analytics.sql) -- ratios, sector medians, percentile ranks
// and measured volatility are all computed there, over the whole universe
// at once. This file only does what a user's live interaction needs:
// narrow a list and sort it.
//
// That split is deliberate. Recomputing a sector median in the browser
// would mean two implementations of the same statistic, and the one the
// screen shows would be the one nobody verified.
// ============================================================

/** One row of the screener view, as exported to /data/screener.json. */
export type ScreenerRow = {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  revenue: number | null;
  net_income: number | null;
  market_cap: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  free_cash_flow: number | null;
  yoy_growth: number | null;
  cagr_3y: number | null;
  pe: number | null;
  ps: number | null;
  ev_ebitda: number | null;
  ev_revenue: number | null;
  annual_volatility: number | null;
  beta_vs_universe: number | null;
  net_margin_pct_in_sector: number | null;
  growth_pct_in_sector: number | null;
  cheapness_pct_in_sector: number | null;
  roe_pct_in_sector: number | null;
  sector_size: number | null;
};

export type SectorComp = {
  sector: string;
  companies: number;
  with_ev_ebitda: number;
  ev_ebitda_q1: number | null;
  ev_ebitda_median: number | null;
  ev_ebitda_q3: number | null;
  pe_median: number | null;
  ps_median: number | null;
  ev_revenue_median: number | null;
};

/** Numeric columns a user may filter or sort on. */
export type Metric =
  | 'market_cap' | 'revenue' | 'net_income'
  | 'gross_margin' | 'operating_margin' | 'net_margin'
  | 'roe' | 'roa' | 'debt_to_equity' | 'free_cash_flow'
  | 'yoy_growth' | 'cagr_3y'
  | 'pe' | 'ps' | 'ev_ebitda' | 'ev_revenue'
  | 'annual_volatility' | 'beta_vs_universe';

export type MetricSpec = {
  key: Metric;
  label: string;
  /** How to render it. Percentages are stored as fractions. */
  kind: 'pct' | 'ratio' | 'money';
  /** A one-line meaning, because no number appears here without one. */
  meaning: string;
  /** true when a LOWER value is the better one (cheap multiples). */
  lowerIsBetter?: boolean;
};

export const METRICS: MetricSpec[] = [
  { key: 'market_cap',        label: 'Market cap',       kind: 'money',
    meaning: 'What the market says the equity is worth today.' },
  { key: 'revenue',           label: 'Revenue (TTM)',    kind: 'money',
    meaning: 'Sales over the last twelve months.' },
  { key: 'net_income',        label: 'Net income (TTM)', kind: 'money',
    meaning: 'What was left after every cost, over the last twelve months.' },
  { key: 'yoy_growth',        label: 'Revenue growth',   kind: 'pct',
    meaning: 'Latest full year against the one before it.' },
  { key: 'cagr_3y',           label: 'Growth, 3y',       kind: 'pct',
    meaning: 'Compound annual revenue growth over three years — not an average of yearly rates.' },
  { key: 'gross_margin',      label: 'Gross margin',     kind: 'pct',
    meaning: 'What survives the direct cost of the product.' },
  { key: 'operating_margin',  label: 'Operating margin', kind: 'pct',
    meaning: 'What survives running the whole business.' },
  { key: 'net_margin',        label: 'Net margin',       kind: 'pct',
    meaning: 'What survives everything, including tax and interest.' },
  { key: 'roe',               label: 'Return on equity', kind: 'pct',
    meaning: 'Profit per dollar owners put in — flattered by debt.' },
  { key: 'roa',               label: 'Return on assets', kind: 'pct',
    meaning: 'Profit per dollar of assets, which debt cannot flatter.' },
  { key: 'debt_to_equity',    label: 'Debt / equity',    kind: 'ratio',
    meaning: 'Borrowed capital against owners’ capital.', lowerIsBetter: true },
  { key: 'free_cash_flow',    label: 'Free cash flow',   kind: 'money',
    meaning: 'Operating cash left after capital spending.' },
  { key: 'pe',                label: 'P/E',              kind: 'ratio',
    meaning: 'Price per dollar of earnings. Omitted on losses.', lowerIsBetter: true },
  { key: 'ps',                label: 'P/S',              kind: 'ratio',
    meaning: 'Price per dollar of sales.', lowerIsBetter: true },
  { key: 'ev_ebitda',         label: 'EV / EBITDA',      kind: 'ratio',
    meaning: 'Whole-company value against pre-tax operating cash earnings.', lowerIsBetter: true },
  { key: 'ev_revenue',        label: 'EV / Revenue',     kind: 'ratio',
    meaning: 'Whole-company value against sales.', lowerIsBetter: true },
  { key: 'annual_volatility', label: 'Volatility',       kind: 'pct',
    meaning: 'Measured from two years of daily closes, not assumed.' },
  { key: 'beta_vs_universe',  label: 'Beta',             kind: 'ratio',
    meaning: 'How much it moves with the rest of this universe. 1.0 is average.' },
];

export const METRIC_BY_KEY: Record<Metric, MetricSpec> =
  Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<Metric, MetricSpec>;

/** A single numeric constraint. Either bound may be left open. */
export type Filter = { metric: Metric; min: number | null; max: number | null };

export type Query = {
  sectors: string[];          // empty = every sector
  filters: Filter[];
  sortBy: Metric;
  sortDir: 'asc' | 'desc';
  search: string;
};

export const EMPTY_QUERY: Query = {
  sectors: [], filters: [], sortBy: 'market_cap', sortDir: 'desc', search: '',
};

/**
 * Apply a query. A row whose value for a filtered metric is NULL is
 * EXCLUDED, never treated as zero.
 *
 * That is the whole reason this is worth stating: a company with no
 * usable EV/EBITDA is not "infinitely cheap", and coercing its NULL to 0
 * would float it to the top of a cheapest-first list — the exact class of
 * confidently wrong answer the rest of this codebase is built to avoid.
 * The SQL takes the same position, which is why the multiple is NULL
 * rather than negative for a loss-making company.
 */
export function runQuery(rows: ScreenerRow[], q: Query): ScreenerRow[] {
  const needle = q.search.trim().toUpperCase();

  const out = rows.filter((r) => {
    if (q.sectors.length && (!r.sector || !q.sectors.includes(r.sector))) return false;
    if (needle && !r.ticker.includes(needle)
        && !(r.name ?? '').toUpperCase().includes(needle)) return false;
    for (const f of q.filters) {
      const v = r[f.metric];
      if (v === null || !Number.isFinite(v)) return false;
      if (f.min !== null && v < f.min) return false;
      if (f.max !== null && v > f.max) return false;
    }
    return true;
  });

  // NULLs sort LAST in both directions. A missing figure is not the
  // smallest figure, and letting it lead an ascending sort would put
  // every unmeasurable company at the top of "cheapest first".
  const dir = q.sortDir === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const x = a[q.sortBy], y = b[q.sortBy];
    const xn = x === null || !Number.isFinite(x);
    const yn = y === null || !Number.isFinite(y);
    if (xn && yn) return a.ticker.localeCompare(b.ticker);
    if (xn) return 1;
    if (yn) return -1;
    return (x! - y!) * dir;
  });
}

/** How many rows carry a usable value for each metric — shown so an empty
 *  result reads as "nobody reports this" rather than "the tool is broken". */
export function coverage(rows: ScreenerRow[], metric: Metric): number {
  return rows.reduce((n, r) => {
    const v = r[metric];
    return n + (v !== null && Number.isFinite(v) ? 1 : 0);
  }, 0);
}

export function sectorsOf(rows: ScreenerRow[]): string[] {
  return [...new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))].sort();
}
