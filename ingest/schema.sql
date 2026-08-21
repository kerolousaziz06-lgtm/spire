-- ingest/schema.sql
--
-- Run once against the target Postgres:
--   psql "$DATABASE_URL" -f ingest/schema.sql
--
-- Four deviations from the original spec in CLAUDE.md. Each was measured
-- against Apple's real companyfacts payload, not reasoned about; the
-- evidence is quoted where it matters. Read the notes before changing
-- anything back.

BEGIN;

CREATE TABLE IF NOT EXISTS company (
  cik        CHAR(10)     PRIMARY KEY,
  ticker     VARCHAR(10)  NOT NULL,
  name       TEXT         NOT NULL,
  sic        CHAR(4),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_ticker_idx ON company (ticker);
CREATE INDEX IF NOT EXISTS company_sic_idx    ON company (sic);


-- DEVIATION 1 -- the spec's PRIMARY KEY cannot be created.
--
--   PRIMARY KEY (cik, concept, period_end, period_start, form)
--
-- Two independent failures, both measured on Apple:
--
--   a) Postgres PK columns are implicitly NOT NULL, but period_start is
--      NULL for every point-in-time concept: Assets 146/146 rows,
--      Liabilities 144/144, StockholdersEquity 264/264, Cash 228/228.
--      Every balance-sheet insert would be rejected.
--
--   b) It is not unique even for flow concepts. The FY2019 revenue period
--      (2018-09-30..2019-09-28) appears in three separate 10-K filings
--      with identical period_start/period_end/form, differing only by
--      accn and filed_date.
--
-- So: a surrogate key, plus a natural-key UNIQUE that includes accn and
-- uses NULLS NOT DISTINCT (Postgres 15+) so two NULL period_starts
-- collide as intended rather than silently allowing duplicate rows.
CREATE TABLE IF NOT EXISTS financial_fact (
  id           BIGSERIAL   PRIMARY KEY,
  cik          CHAR(10)    NOT NULL REFERENCES company(cik) ON DELETE CASCADE,
  concept      TEXT        NOT NULL,   -- normalized name, e.g. "revenue"
  raw_tag      TEXT        NOT NULL,   -- the XBRL tag it actually came from
  period_start DATE,                   -- NULL for point-in-time concepts
  period_end   DATE        NOT NULL,
  value        NUMERIC     NOT NULL,
  form         VARCHAR(10) NOT NULL,   -- '10-K' '10-Q' '10-K/A' ...
  accn         VARCHAR(25) NOT NULL,   -- accession number of the filing
  filed_date   DATE        NOT NULL,

  -- US filers file 10-Qs for Q1-Q3 only; Q4 exists solely inside the 10-K,
  -- folded into the annual figure. Measured on Apple: every fiscal year
  -- carries exactly three quarters, never four, with no September period
  -- in any year. So Q4 has to be synthesised, and a synthesised figure is
  -- NOT a reported fact -- it is arithmetic over four of them. This flag
  -- and a raw_tag of 'DERIVED: FY-(Q1+Q2+Q3)' keep that visible, because
  -- a derived number that cannot be told apart from a filed one is how a
  -- wrong figure survives review.
  is_derived   BOOLEAN     NOT NULL DEFAULT FALSE,

  -- DEVIATION 2 -- fy/fp describe the FILING, not the fact. Renamed so the
  -- trap cannot be walked into again. Measured: the same FY2019 revenue
  -- fact carries fy=2019, fy=2020 and fy=2021 in three successive 10-Ks,
  -- and Revenues entries covering CY2016Q4 and CY2017Q1 are both stamped
  -- fp='FY' because they appeared inside a 10-K.
  --
  -- The spec's TTM view filtered on `fiscal_qtr IN ('Q1'..'Q4')`. Built
  -- from fp, that filter drops real quarters and admits annual figures --
  -- the HAVING COUNT(*)=4 guard meant to prevent a silently-25%-wrong TTM
  -- would have produced one. Never derive a period from these columns.
  filing_fy    INT,
  filing_fp    CHAR(2),

  -- Undocumented in the spec: SEC also returns `frame`, a calendar-aligned
  -- label ('CY2019', 'CY2018Q1'). Useful for cross-company alignment when
  -- fiscal calendars differ, but only 39/117 entries carry it on Apple's
  -- main revenue tag, so it is stored and never relied upon.
  frame        TEXT,

  -- DEVIATION 3 -- period type is DERIVED from the dates, never read off
  -- a label. Thresholds measured across 4 flow concepts on Apple, 823
  -- period-bearing facts, zero unclassified:
  --
  --     90d x380  97d x24     -> quarter   (97 = 53-week fiscal year)
  --    181d x92  188d x20     -> half
  --    272d x98  279d x20     -> ninemonth
  --    363d x154 370d x35     -> year
  --
  -- DEVIATION 4 -- 'half' and 'ninemonth' are CUMULATIVE year-to-date
  -- figures, 230 of them in that sample. The spec does not mention them.
  -- Summing anything that merely has a start date double-counts badly;
  -- only period_kind='quarter' is additive.
  period_kind  TEXT GENERATED ALWAYS AS (
    CASE
      WHEN period_start IS NULL                        THEN 'instant'
      WHEN period_end - period_start BETWEEN  80 AND 100 THEN 'quarter'
      WHEN period_end - period_start BETWEEN 170 AND 190 THEN 'half'
      WHEN period_end - period_start BETWEEN 260 AND 285 THEN 'ninemonth'
      WHEN period_end - period_start BETWEEN 350 AND 380 THEN 'year'
      ELSE 'other'
    END
  ) STORED,

  CONSTRAINT financial_fact_natural_key
    UNIQUE NULLS NOT DISTINCT (cik, concept, period_start, period_end, accn)
);

CREATE INDEX IF NOT EXISTS fact_lookup_idx
  ON financial_fact (cik, concept, period_kind, period_end DESC);


-- Restatement resolution. The spec described this as a query-time rule, so
-- every observation is stored and the winner is chosen here -- discarding
-- restatements at ingest would be irreversible and unauditable.
--
-- NOTE a contradiction in the spec: it lists 10-K=1, 10-K/A=2 and says
-- "prefer the lowest priority number", but also says "a 10-K/A beats a
-- 10-K because it is an authoritative correction". Those disagree. The
-- prose is right -- an amendment supersedes what it amends -- so the
-- amended forms sort first here.
CREATE OR REPLACE VIEW fact_current AS
SELECT DISTINCT ON (cik, concept, period_start, period_end) *
FROM financial_fact
ORDER BY
  cik, concept, period_start, period_end,
  CASE form
    WHEN '10-K/A' THEN 1
    WHEN '10-K'   THEN 2
    WHEN '10-Q/A' THEN 3
    WHEN '10-Q'   THEN 4
    ELSE 9
  END,
  filed_date DESC;


-- TTM: the four most recent QUARTERS, per (cik, concept).
--
-- Rewritten from the spec's version, which anchored the 12-month window on
-- the company's overall max period_end. Concepts do not share a latest
-- quarter, so that anchor silently truncates the slower ones.
--
-- Two guards, both refusing to emit rather than emitting a wrong number:
--   COUNT(*) = 4          -- three quarters is wrong by ~25%
--   span BETWEEN 240..300 -- four quarters really do span ~270 days, so a
--                            gap year cannot masquerade as a clean TTM
CREATE OR REPLACE VIEW ttm AS
WITH ranked AS (
  SELECT cik, concept, period_end, value,
         ROW_NUMBER() OVER (
           PARTITION BY cik, concept ORDER BY period_end DESC
         ) AS rn
  FROM fact_current
  WHERE period_kind = 'quarter'
)
SELECT
  cik,
  concept,
  MAX(period_end) AS as_of,
  SUM(value)      AS ttm_value
FROM ranked
WHERE rn <= 4
GROUP BY cik, concept
HAVING COUNT(*) = 4
   AND MAX(period_end) - MIN(period_end) BETWEEN 240 AND 300;

-- Market data. Not in any filing: price, market cap and beta come from
-- yfinance, which is scraping Yahoo's internal API rather than reading an
-- official feed. Yahoo has broken it without warning before.
--
-- So this table is deliberately APPEND-ONLY and every row carries its own
-- as_of. The frontend must show the last-known price WITH its date rather
-- than hiding the section -- a silently stale price is the failure mode
-- that matters, because sharePrice sets the premium in M&A and drives the
-- "offer below market price" sanity check. A stale price moves that
-- verdict without saying so.
CREATE TABLE IF NOT EXISTS market_data (
  ticker             VARCHAR(10) NOT NULL,
  as_of              DATE        NOT NULL,
  price              NUMERIC,
  market_cap         NUMERIC,
  shares_outstanding NUMERIC,
  beta               NUMERIC,
  currency           CHAR(3),
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, as_of)
);

-- Latest row per ticker, with its age exposed so a consumer cannot read
-- the price without also being able to read how old it is.
CREATE OR REPLACE VIEW market_latest AS
SELECT DISTINCT ON (ticker)
  ticker, as_of, price, market_cap, shares_outstanding, beta, currency,
  (CURRENT_DATE - as_of) AS age_days
FROM market_data
ORDER BY ticker, as_of DESC;

COMMIT;
