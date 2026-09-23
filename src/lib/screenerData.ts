// ============================================================
// screenerData.ts — load the exported analytical views.
//
// Same shape as tickerFetch: static JSON from this app's own origin, no
// database, no key. Produced by ingest/export_analytics.py straight from
// the SQL views, so the numbers on screen are the numbers the queries
// computed — there is no second implementation to drift from them.
// ============================================================
import type { ScreenerRow, SectorComp } from './screener';

const DATA_ROOT = '/data';

export type ScreenerData = {
  generated: string;
  rows: ScreenerRow[];
  sectors: SectorComp[];
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

/**
 * Revive a screener row. Every numeric field is coerced to number-or-null
 * and nothing else is trusted.
 *
 * A row missing its ticker is dropped rather than repaired: it cannot be
 * identified, so anything it contributed to a filter or a sort would be
 * attributed to nothing.
 */
function reviveRow(raw: unknown): ScreenerRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ticker !== 'string' || !r.ticker) return null;
  return {
    ticker: r.ticker,
    name: typeof r.name === 'string' ? r.name : r.ticker,
    sector: str(r.sector),
    industry: str(r.industry),
    revenue: num(r.revenue),
    net_income: num(r.net_income),
    market_cap: num(r.market_cap),
    gross_margin: num(r.gross_margin),
    operating_margin: num(r.operating_margin),
    net_margin: num(r.net_margin),
    roe: num(r.roe),
    roa: num(r.roa),
    debt_to_equity: num(r.debt_to_equity),
    free_cash_flow: num(r.free_cash_flow),
    yoy_growth: num(r.yoy_growth),
    cagr_3y: num(r.cagr_3y),
    pe: num(r.pe),
    ps: num(r.ps),
    ev_ebitda: num(r.ev_ebitda),
    ev_revenue: num(r.ev_revenue),
    annual_volatility: num(r.annual_volatility),
    beta_vs_universe: num(r.beta_vs_universe),
    net_margin_pct_in_sector: num(r.net_margin_pct_in_sector),
    growth_pct_in_sector: num(r.growth_pct_in_sector),
    cheapness_pct_in_sector: num(r.cheapness_pct_in_sector),
    roe_pct_in_sector: num(r.roe_pct_in_sector),
    sector_size: num(r.sector_size),
  };
}

function reviveSector(raw: unknown): SectorComp | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sector !== 'string' || !r.sector) return null;
  return {
    sector: r.sector,
    companies: num(r.companies) ?? 0,
    with_ev_ebitda: num(r.with_ev_ebitda) ?? 0,
    ev_ebitda_q1: num(r.ev_ebitda_q1),
    ev_ebitda_median: num(r.ev_ebitda_median),
    ev_ebitda_q3: num(r.ev_ebitda_q3),
    pe_median: num(r.pe_median),
    ps_median: num(r.ps_median),
    ev_revenue_median: num(r.ev_revenue_median),
  };
}

async function getJson(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${DATA_ROOT}/${path}`);
    if (!res.ok) return null;
    // A static host answers 200 with an HTML fallback for an unknown
    // path, so a missing file can arrive looking like success.
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Null when the data is not published — the module then says so rather
 *  than rendering an empty table that reads as a broken screen. */
export async function loadScreenerData(): Promise<ScreenerData | null> {
  const [s, sec] = await Promise.all([getJson('screener.json'), getJson('sectors.json')]);
  if (!s || typeof s !== 'object') return null;

  const rowsRaw = (s as { rows?: unknown }).rows;
  if (!Array.isArray(rowsRaw)) return null;
  const rows = rowsRaw.flatMap((r) => { const v = reviveRow(r); return v ? [v] : []; });
  if (rows.length === 0) return null;

  const secRaw = sec && typeof sec === 'object'
    ? (sec as { sectors?: unknown }).sectors : null;
  const sectors = Array.isArray(secRaw)
    ? secRaw.flatMap((r) => { const v = reviveSector(r); return v ? [v] : []; })
    : [];

  const generated = typeof (s as { generated?: unknown }).generated === 'string'
    ? (s as { generated: string }).generated : '';

  return { generated, rows, sectors };
}
