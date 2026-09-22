-- ingest/analytics.sql
--
-- The analytical layer: everything the raw tables cannot answer on their
-- own. Run AFTER schema.sql. Views only -- no data, so re-running is free
-- and a view can be corrected without touching what was ingested.
--
-- These exist because the pipeline could previously answer only "what are
-- this one company's figures". Ranking a universe, finding a peer median,
-- or measuring how volatile a stock ACTUALLY was are all set problems, and
-- set problems belong in SQL rather than in a loop in application code.


-- ---------------------------------------------------------------------
-- 1. Daily returns.  LAG() over a per-ticker window.
--
-- A return needs the PREVIOUS close, which is the textbook case for a
-- window function: self-joining prices to themselves on "the day before"
-- is wrong the moment a market holiday moves it, and correct only if you
-- rank rows first -- which is what LAG already does.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW daily_return AS
SELECT
  ticker,
  day,
  close,
  LAG(close) OVER w                        AS prev_close,
  close / LAG(close) OVER w - 1            AS ret
FROM price_history
WINDOW w AS (PARTITION BY ticker ORDER BY day);


-- ---------------------------------------------------------------------
-- 2. Realised volatility and beta, MEASURED.
--
-- MonteVue has always taken volatility as an assumption from assets.ts.
-- With a return series it can be observed instead. Annualised by sqrt(252)
-- -- the convention, and stated rather than buried, because it is an
-- assumption of its own (it presumes returns are serially uncorrelated).
--
-- STDDEV_SAMP, not POP: this is a sample of history, not the population
-- of all days that will ever exist.
--
-- Beta is covariance with the market over the market's variance. SPY is
-- not in the universe, so the equal-weighted mean of every company's
-- daily return stands in for the market. That is a real deviation from
-- a cap-weighted index and is why the column is named beta_vs_universe.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW market_return AS
SELECT day, AVG(ret) AS mkt_ret
FROM daily_return
WHERE ret IS NOT NULL
GROUP BY day
HAVING COUNT(*) >= 20;          -- a "market" of three stocks is not one


CREATE OR REPLACE VIEW company_risk AS
SELECT
  r.ticker,
  COUNT(*)                                        AS trading_days,
  MIN(r.day)                                      AS since,
  MAX(r.day)                                      AS through,
  STDDEV_SAMP(r.ret) * SQRT(252)                  AS annual_volatility,
  -- Total return over the window, annualised by its actual length rather
  -- than an assumed 252 days, so a short series is not overstated.
  (MAX(r.close) FILTER (WHERE r.day = (SELECT MAX(day) FROM daily_return d2 WHERE d2.ticker = r.ticker))
   / MIN(r.close) FILTER (WHERE r.day = (SELECT MIN(day) FROM daily_return d3 WHERE d3.ticker = r.ticker AND d3.ret IS NOT NULL)))
    ^ (365.0 / NULLIF(MAX(r.day) - MIN(r.day), 0)) - 1   AS annual_return,
  COVAR_SAMP(r.ret, m.mkt_ret) / NULLIF(VAR_SAMP(m.mkt_ret), 0) AS beta_vs_universe
FROM daily_return r
JOIN market_return m USING (day)
WHERE r.ret IS NOT NULL
GROUP BY r.ticker
HAVING COUNT(*) >= 120;         -- under ~6 months, vol is noise


-- ---------------------------------------------------------------------
-- 3. Per-company metrics: the screener's base table.
--
-- Joins the three data sources -- trailing-twelve-month flows, latest
-- point-in-time balances, and market data -- into one row per company.
--
-- Every ratio is NULLIF-guarded on its denominator. A margin on zero
-- revenue is not 0 and not infinity; it is unanswerable, and SQL's NULL
-- says exactly that. Multiples on negative earnings are omitted for the
-- same reason a negative P/E is omitted in the UI: it sorts as "cheap".
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW company_metrics AS
WITH flows AS (
  SELECT cik,
         MAX(ttm_value) FILTER (WHERE concept = 'revenue')                   AS revenue,
         MAX(ttm_value) FILTER (WHERE concept = 'gross_profit')              AS gross_profit,
         MAX(ttm_value) FILTER (WHERE concept = 'operating_income')          AS operating_income,
         MAX(ttm_value) FILTER (WHERE concept = 'net_income')                AS net_income,
         MAX(ttm_value) FILTER (WHERE concept = 'depreciation_amortization') AS d_and_a,
         MAX(ttm_value) FILTER (WHERE concept = 'operating_cash_flow')       AS ocf,
         MAX(ttm_value) FILTER (WHERE concept = 'capex')                     AS capex,
         MAX(as_of)                                                          AS flows_as_of
  FROM ttm GROUP BY cik
),
stocks AS (
  SELECT cik,
         MAX(value) FILTER (WHERE concept = 'total_assets')        AS total_assets,
         MAX(value) FILTER (WHERE concept = 'total_liabilities')   AS total_liabilities,
         MAX(value) FILTER (WHERE concept = 'shareholders_equity') AS equity,
         MAX(value) FILTER (WHERE concept = 'cash')                AS cash,
         MAX(value) FILTER (WHERE concept = 'total_debt')          AS total_debt
  FROM (
    SELECT DISTINCT ON (cik, concept) cik, concept, value
    FROM fact_current WHERE period_kind = 'instant'
    ORDER BY cik, concept, period_end DESC
  ) latest GROUP BY cik
)
SELECT
  c.cik, c.ticker, c.name, c.sector, c.industry, c.sic,
  f.flows_as_of,
  f.revenue, f.gross_profit, f.operating_income, f.net_income,
  f.ocf, f.capex,
  s.total_assets, s.total_liabilities, s.equity, s.cash, s.total_debt,
  m.price, m.market_cap, m.as_of AS price_as_of,
  k.annual_volatility, k.beta_vs_universe,

  f.gross_profit     / NULLIF(f.revenue, 0)        AS gross_margin,
  f.operating_income / NULLIF(f.revenue, 0)        AS operating_margin,
  f.net_income       / NULLIF(f.revenue, 0)        AS net_margin,
  f.net_income       / NULLIF(s.equity, 0)         AS roe,
  f.net_income       / NULLIF(s.total_assets, 0)   AS roa,
  s.total_debt       / NULLIF(s.equity, 0)         AS debt_to_equity,
  (f.ocf - f.capex)                                AS free_cash_flow,

  -- EBITDA only where BOTH inputs exist. Operating income alone is not
  -- EBITDA, and the LBO tab's old "roughly 15% add-back" proxy is exactly
  -- the invented number this column refuses to reproduce.
  CASE WHEN f.operating_income IS NOT NULL AND f.d_and_a IS NOT NULL
       THEN f.operating_income + f.d_and_a END     AS ebitda,

  CASE WHEN m.market_cap IS NOT NULL AND s.total_debt IS NOT NULL AND s.cash IS NOT NULL
       THEN m.market_cap + s.total_debt - s.cash END AS enterprise_value,

  CASE WHEN f.net_income > 0
       THEN m.market_cap / f.net_income END        AS pe,
  CASE WHEN f.revenue > 0
       THEN m.market_cap / f.revenue END           AS ps,
  CASE WHEN s.equity > 0
       THEN m.market_cap / s.equity END            AS pb
FROM company c
LEFT JOIN flows  f USING (cik)
LEFT JOIN stocks s USING (cik)
LEFT JOIN market_latest m ON m.ticker = c.ticker
LEFT JOIN company_risk  k ON k.ticker = c.ticker;


-- ---------------------------------------------------------------------
-- 4. EV/EBITDA, kept separate so the guard is visible.
--
-- A negative or near-zero EBITDA makes this multiple meaningless, not
-- large: it flips sign and sorts to the top of a "cheapest" list. Snowflake
-- runs negative EBITDA in this universe, so this is live, not theoretical.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW company_multiples AS
SELECT
  ticker, sector, industry, name,
  market_cap, enterprise_value, ebitda, pe, ps, pb,
  CASE WHEN ebitda > 0 THEN enterprise_value / ebitda END AS ev_ebitda,
  CASE WHEN revenue  > 0 THEN enterprise_value / revenue END AS ev_revenue
FROM company_metrics;


-- ---------------------------------------------------------------------
-- 5. Sector comparables.  PERCENTILE_CONT for medians.
--
-- The MEDIAN, not the mean. Multiples are right-skewed -- one company on
-- 90x drags a mean far above anything in the set -- so a mean "typical
-- multiple" is a number no peer trades near. PERCENTILE_CONT interpolates
-- between the two middle rows, which is what a comp table wants.
--
-- Quartiles come along because the spread is the useful part: a median
-- EV/EBITDA of 20x means something different when the range is 18-22 than
-- when it is 8-60.
--
-- Each aggregate ignores NULL independently, so a sector keeps its median
-- P/E even where half its members have no usable EBITDA.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW sector_comps AS
SELECT
  sector,
  COUNT(*)                                                          AS companies,
  COUNT(ev_ebitda)                                                  AS with_ev_ebitda,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ev_ebitda)           AS ev_ebitda_q1,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ev_ebitda)           AS ev_ebitda_median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ev_ebitda)           AS ev_ebitda_q3,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY pe)                  AS pe_median,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ps)                  AS ps_median,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ev_revenue)          AS ev_revenue_median
FROM company_multiples
WHERE sector IS NOT NULL
GROUP BY sector
HAVING COUNT(*) >= 3;          -- a "median" of two is just the midpoint


-- ---------------------------------------------------------------------
-- 6. Revenue growth and CAGR.  LAG over annual periods.
--
-- Year-over-year needs the prior year's figure for the SAME company,
-- which is LAG partitioned by company. The multi-year CAGR uses the value
-- three rows back, so it is a genuine compound rate rather than an
-- average of yearly changes -- averaging growth rates overstates, because
-- +50% then -50% is not 0%.
--
-- Annual periods only, and never derived rows: a CAGR computed across a
-- reconstructed quarter would be measuring arithmetic, not the filings.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW revenue_growth AS
WITH annual AS (
  SELECT f.cik, c.ticker, c.sector,
         f.period_end, f.value AS revenue
  FROM fact_current f
  JOIN company c USING (cik)
  WHERE f.concept = 'revenue'
    AND f.period_kind = 'year'
    AND NOT f.is_derived
)
SELECT
  cik, ticker, sector, period_end, revenue,
  LAG(revenue)    OVER w                                   AS prev_revenue,
  revenue / NULLIF(LAG(revenue) OVER w, 0) - 1             AS yoy_growth,
  LAG(revenue, 3) OVER w                                   AS revenue_3y_ago,
  CASE WHEN LAG(revenue, 3) OVER w > 0
       THEN (revenue / LAG(revenue, 3) OVER w) ^ (1.0/3.0) - 1
  END                                                      AS cagr_3y,
  ROW_NUMBER() OVER (PARTITION BY cik ORDER BY period_end DESC) AS recency
FROM annual
WINDOW w AS (PARTITION BY cik ORDER BY period_end);


-- ---------------------------------------------------------------------
-- 7. The screener.  CTEs stacked, PERCENT_RANK within sector.
--
-- The question this answers and the old pipeline could not: "which
-- companies in this universe look like X", against every company at once.
--
-- PERCENT_RANK is what makes a cross-sector comparison honest. A 22% net
-- margin is unremarkable in software and exceptional in retail, so the
-- absolute figure is shown alongside its position WITHIN its own sector.
-- Ranking the whole universe on a raw margin just sorts by industry.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW screener AS
WITH latest_growth AS (
  SELECT cik, yoy_growth, cagr_3y, period_end AS growth_as_of
  FROM revenue_growth WHERE recency = 1
),
base AS (
  SELECT m.*, g.yoy_growth, g.cagr_3y, g.growth_as_of,
         x.ev_ebitda, x.ev_revenue
  FROM company_metrics m
  LEFT JOIN latest_growth g USING (cik)
  LEFT JOIN company_multiples x USING (ticker)
)
SELECT
  ticker, name, sector, industry,
  revenue, net_income, market_cap,
  gross_margin, operating_margin, net_margin, roe, roa,
  debt_to_equity, free_cash_flow,
  yoy_growth, cagr_3y,
  pe, ps, ev_ebitda, ev_revenue,
  annual_volatility, beta_vs_universe,

  -- Position within the company's own sector, 0 = lowest, 1 = highest.
  -- NULLs are excluded from each ranking independently by the FILTER-free
  -- behaviour of window functions over NULL: they rank last, so every
  -- rank is explicitly NULLed out where its input is missing rather than
  -- letting a company with no margin appear to be the worst in its sector.
  CASE WHEN net_margin IS NOT NULL
       THEN PERCENT_RANK() OVER (PARTITION BY sector ORDER BY net_margin) END      AS net_margin_pct_in_sector,
  CASE WHEN yoy_growth IS NOT NULL
       THEN PERCENT_RANK() OVER (PARTITION BY sector ORDER BY yoy_growth) END      AS growth_pct_in_sector,
  CASE WHEN ev_ebitda IS NOT NULL
       THEN PERCENT_RANK() OVER (PARTITION BY sector ORDER BY ev_ebitda DESC) END  AS cheapness_pct_in_sector,
  CASE WHEN roe IS NOT NULL
       THEN PERCENT_RANK() OVER (PARTITION BY sector ORDER BY roe) END             AS roe_pct_in_sector,

  COUNT(*) OVER (PARTITION BY sector) AS sector_size
FROM base;
