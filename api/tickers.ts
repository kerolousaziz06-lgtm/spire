// api/tickers.ts — GET /api/tickers
//
// What is actually loaded. Exists because the first version of the ticker
// field accepted any input and 404'd on most of it: typing four real
// companies and having three fail reads as a broken tool, not an empty
// database. Coverage depends on what the scheduled job has ingested, so
// the UI has to be able to say so rather than let the user guess.
import { Pool, types } from 'pg';

types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10_000,
});

export default async function handler(_req: any, res: any) {
  try {
    const { rows } = await pool.query(
      `SELECT c.ticker, c.name
       FROM company c
       -- Only list companies that will actually answer. A row with no
       -- usable facts would 200 with an empty CompanyInput, which is a
       -- worse experience than an honest 404.
       WHERE EXISTS (SELECT 1 FROM financial_fact f WHERE f.cik = c.cik)
       ORDER BY c.ticker`);
    res.setHeader('Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ count: rows.length, tickers: rows });
  } catch (e: any) {
    console.error('[api/tickers]', e);
    return res.status(500).json({ error: 'lookup failed' });
  }
}
