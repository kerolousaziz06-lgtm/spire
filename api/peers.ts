// api/peers.ts — GET /api/peers?sic=7372
//
// A comp table by SIC code, for M&A's "fill from" and for putting a
// company next to its industry.
//
// READ THE CAVEAT BEFORE USING THIS FOR VALUATION. CLAUDE.md rules comps
// out as a module because peer prices go stale immediately. The data layer
// answers the statement-figures half of that -- filings do not move between
// quarters -- but NOT the price half. Every row therefore carries its own
// price_as_of and price_age_days, and a consumer that renders a multiple
// without showing them is reintroducing exactly the problem comps was
// rejected for.
import { Pool, types } from 'pg';

// pg parses DATE (oid 1082) into a JS Date at LOCAL midnight, which both
// shifts the day across timezones and renders as a full timestamp inside
// user-facing text. Everything downstream wants the plain 'YYYY-MM-DD'
// that Postgres actually stored, so take it verbatim.
types.setTypeParser(1082, (v) => v);

// Deployed without a database, this is the expected state rather than an
// error: the app is designed to work by hand and the ticker lookup is a
// convenience. 503 says "not configured" so the UI can hide the control
// instead of showing one that throws.
const DSN = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DSN,
  max: 1,
  idleTimeoutMillis: 10_000,
});

const PEERS = `
  WITH flows AS (
    SELECT cik, concept, ttm_value FROM ttm
    WHERE concept IN ('revenue','net_income','operating_income',
                      'depreciation_amortization')
  ),
  stocks AS (
    SELECT DISTINCT ON (cik, concept) cik, concept, value
    FROM fact_current
    WHERE period_kind = 'instant' AND concept IN ('cash','total_debt')
    ORDER BY cik, concept, period_end DESC
  )
  SELECT
    c.ticker, c.name, c.sic,
    max(f.ttm_value) FILTER (WHERE f.concept='revenue')           AS revenue,
    max(f.ttm_value) FILTER (WHERE f.concept='net_income')        AS net_income,
    max(f.ttm_value) FILTER (WHERE f.concept='operating_income')  AS operating_income,
    max(f.ttm_value) FILTER (WHERE f.concept='depreciation_amortization') AS d_and_a,
    max(s.value)     FILTER (WHERE s.concept='cash')              AS cash,
    max(s.value)     FILTER (WHERE s.concept='total_debt')        AS total_debt,
    m.price, m.market_cap, m.as_of AS price_as_of, m.age_days AS price_age_days
  FROM company c
  LEFT JOIN flows  f ON f.cik = c.cik
  LEFT JOIN stocks s ON s.cik = c.cik
  LEFT JOIN market_latest m ON m.ticker = c.ticker
  WHERE c.sic = $1
  GROUP BY c.ticker, c.name, c.sic, m.price, m.market_cap, m.as_of, m.age_days
  ORDER BY revenue DESC NULLS LAST`;

export default async function handler(req: any, res: any) {
  const sic = (req.query?.sic ?? '').toString().trim();
  if (!/^\d{3,4}$/.test(sic)) {
    return res.status(400).json({ error: 'sic must be 3 or 4 digits' });
  }

  if (!DSN) return res.status(503).json({ error: 'data service not configured' });

  try {
    const { rows } = await pool.query(PEERS, [sic.padStart(4, '0')]);

    const peers = rows.map((r) => {
      const num = (v: any) => (v === null ? null : Number(v));
      const revenue = num(r.revenue);
      const netIncome = num(r.net_income);
      const opInc = num(r.operating_income);
      const da = num(r.d_and_a);
      const cash = num(r.cash);
      const debt = num(r.total_debt);
      const cap = num(r.market_cap);

      // EV needs cap, debt and cash. EBITDA needs operating income and D&A.
      // Missing any input means the multiple is OMITTED, never estimated --
      // a comp table with an invented denominator is worse than a gap.
      const ev = cap !== null && debt !== null && cash !== null
        ? cap + debt - cash : null;
      const ebitda = opInc !== null && da !== null ? opInc + da : null;

      return {
        ticker: r.ticker, name: r.name,
        revenue, netIncome, ebitda, cash, totalDebt: debt,
        marketCap: cap, enterpriseValue: ev,
        price: num(r.price),
        priceAsOf: r.price_as_of ?? null,
        priceAgeDays: r.price_age_days ?? null,
        evToEbitda: ev !== null && ebitda !== null && ebitda > 0
          ? ev / ebitda : null,
        priceToEarnings: cap !== null && netIncome !== null && netIncome > 0
          ? cap / netIncome : null,
      };
    });

    res.setHeader('Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ sic, count: peers.length, peers });
  } catch (e: any) {
    console.error('[api/peers]', e);
    return res.status(500).json({ error: 'lookup failed' });
  }
}
