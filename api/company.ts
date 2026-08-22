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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,                       // serverless: one connection per instance
  idleTimeoutMillis: 10_000,
});

const IDENTITY = `SELECT cik, ticker, name, sic FROM company WHERE ticker = $1`;

// Flows come from the TTM view, which only emits when four consecutive
// quarters exist. Stocks are the most recent instant. UNION keeps them in
// one shape without pretending they were derived the same way.
const FACTS = `
  SELECT concept, ttm_value AS value, as_of FROM ttm WHERE cik = $1
  UNION ALL
  SELECT concept, value, as_of FROM (
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

  try {
    const who = await pool.query(IDENTITY, [raw]);
    if (who.rowCount === 0) {
      return res.status(404).json({
        error: `${raw} is not in the database`,
        hint: 'ingestion runs on a schedule; not every ticker is loaded',
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
