// api/company.ts — GET /api/company?ticker=AAPL
//
// Returns a pre-filled CompanyInput for Vantage. The mapping lives in
// _lib/mapCompany.ts so it can be tested without a serverless runtime;
// this file is the thin part: parse, query, hand off, serialise.
//
// TTM for flow concepts, latest reading for point-in-time ones. They are
// not interchangeable: summing four quarters of Assets is meaningless,
// and taking the latest quarter of Revenue understates it fourfold.
import { Pool, types } from 'pg';

// pg parses DATE (oid 1082) into a JS Date at LOCAL midnight, which both
// shifts the day across timezones and renders as a full timestamp inside
// user-facing text. Everything downstream wants the plain 'YYYY-MM-DD'
// that Postgres actually stored, so take it verbatim.
types.setTypeParser(1082, (v) => v);
import { mapCompany, type FactRow, type MarketRow } from './_lib/mapCompany';

// Deployed without a database, this is the expected state rather than an
// error: the app is designed to work by hand and the ticker lookup is a
// convenience. 503 says "not configured" so the UI can hide the control
// instead of showing one that throws.
const DSN = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DSN,
  max: 1,                       // serverless: one connection per instance
  idleTimeoutMillis: 10_000,
});

const IDENTITY = `SELECT cik, ticker, name, sic FROM company WHERE ticker = $1`;

// Flows come from the TTM view, which only emits when four consecutive
// quarters exist. Stocks are the most recent instant. UNION keeps them in
// one shape without pretending they were derived the same way.
// Three sources, in preference order, tagged so the caller knows which it
// got. TTM is best -- it is the last twelve months. But it needs four
// consecutive quarters, and plenty of filers never produce that: Broadcom,
// Mastercard, Caterpillar and PNC all failed it, and dropping them would
// have been far worse than showing their most recent FULL YEAR, which is
// what a 10-K reports and what Vantage was built around in the first place.
//
// Stocks are point-in-time and have no annual equivalent; the latest
// reading is the only sensible answer for them.
const FACTS = `
  SELECT concept, ttm_value AS value, as_of, 'ttm' AS basis
  FROM ttm WHERE cik = $1
  UNION ALL
  SELECT concept, value, as_of, 'annual' FROM (
    SELECT DISTINCT ON (concept) concept, value, period_end AS as_of
    FROM fact_current
    WHERE cik = $1 AND period_kind = 'year' AND NOT is_derived
    ORDER BY concept, period_end DESC
  ) y
  UNION ALL
  SELECT concept, value, as_of, 'instant' FROM (
    SELECT DISTINCT ON (concept) concept, value, period_end AS as_of
    FROM fact_current WHERE cik = $1 AND period_kind = 'instant'
    ORDER BY concept, period_end DESC
  ) s`;

const MARKET = `
  SELECT price, as_of, age_days FROM market_latest WHERE ticker = $1`;

export default async function handler(req: any, res: any) {
  const raw = (req.query?.ticker ?? '').toString().trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(raw)) {
    return res.status(400).json({ error: 'ticker must look like a ticker' });
  }

  if (!DSN) return res.status(503).json({ error: 'data service not configured' });

  try {
    const who = await pool.query(IDENTITY, [raw]);
    if (who.rowCount === 0) {
      // Say how many ARE loaded. "Not in the database" alone leaves the
      // user unable to tell a missing company from a broken service.
      const n = await pool.query(`SELECT count(*)::int AS n FROM company`);
      return res.status(404).json({
        error: `${raw} has not been ingested yet`,
        hint: `${n.rows[0].n} companies are loaded; ingestion runs on a schedule`,
        loaded: n.rows[0].n,
      });
    }
    const { cik, ticker, name, sic } = who.rows[0];
    const [facts, market] = await Promise.all([
      pool.query(FACTS, [cik]),
      pool.query(MARKET, [ticker]),
    ]);

    const payload = mapCompany(
      { ticker, name, cik, sic },
      facts.rows as FactRow[],
      (market.rows[0] ?? null) as MarketRow,
    );

    // Ingestion is quarterly and the data is immutable between runs, so a
    // long cache is honest here. stale-while-revalidate keeps a slow cold
    // query from ever being user-visible.
    res.setHeader('Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(payload);
  } catch (e: any) {
    // Never leak a connection string or a driver stack trace to the client.
    console.error('[api/company]', e);
    return res.status(500).json({ error: 'lookup failed' });
  }
}
