-- ingest/derive_quarters.sql
--
-- Turn year-to-date cumulative periods into discrete quarters. Run AFTER
-- facts are loaded; idempotent, so re-running adds nothing.
--
-- WHY. Two separate gaps, both measured on Apple, one general fix.
--
--   Income-statement concepts: 10-Qs report discrete 3-month figures for
--   Q1-Q3, but Q4 is never filed as a quarter -- it exists only inside
--   the 10-K, folded into the annual figure. Every fiscal year carries
--   exactly three quarters; no September period appears in any year.
--
--   Cash-flow concepts are worse: the statement of cash flows in a 10-Q
--   covers the YEAR TO DATE, not the quarter. capex's 'quarters' end in
--   December 13 times out of 13 -- that is Q1 only. Q2, Q3 AND Q4 are all
--   missing. Its FY2025 rows all share one period_start:
--       ..2024-12-28  2,940M   ..2025-03-29  6,011M
--       ..2025-06-28  9,473M   ..2025-09-27 12,715M
--
-- Both are the same shape: a cumulative ladder anchored at the fiscal
-- year's start. Differencing consecutive rungs yields every discrete
-- quarter. On revenue FY2025 the ladder
--     124,300 -> 219,659 -> 313,695 -> 416,161
-- differences to 124,300 / 95,359 / 94,036 / 102,466, reproducing the
-- FILED Q2 and Q3 exactly -- which is what makes this checkable rather
-- than merely plausible. See the reconciliation query at the bottom.
--
-- Guards:
--   * built from fact_current, so restatements resolve first
--   * never derives from a derived row
--   * only inserts where no FILED quarter already covers that window, so
--     a real figure is never shadowed by an arithmetic one
--   * only emits rungs that are quarter-length; a ladder with a missing
--     rung produces a 6-month gap and is skipped, not halved
--
-- The quarter-length band must match schema.sql's period_kind band. It
-- did not once: period_kind was widened to 125 days for retail calendars
-- while this stayed at 100, so Costco's 112-day Q4 was classified as a
-- quarter and then refused by the derivation. TTM stayed empty and it
-- looked like a filer problem rather than two constants disagreeing.

INSERT INTO financial_fact (
  cik, concept, raw_tag, period_start, period_end, value,
  form, accn, filed_date, filing_fy, filing_fp, frame, is_derived
)
SELECT
  d.cik, d.concept,
  'DERIVED: cumulative difference' AS raw_tag,
  d.q_start, d.q_end, d.q_value,
  d.form, d.accn, d.filed_date, d.filing_fy,
  NULL, NULL, TRUE
FROM (
  SELECT
    cik, concept, form, accn, filed_date, filing_fy,
    COALESCE(lag(period_end) OVER w + 1, period_start) AS q_start,
    period_end                                        AS q_end,
    value - COALESCE(lag(value) OVER w, 0)            AS q_value
  FROM fact_current
  WHERE NOT is_derived
    AND period_kind IN ('quarter', 'half', 'ninemonth', 'year')
  WINDOW w AS (PARTITION BY cik, concept, period_start ORDER BY period_end)
) d
WHERE d.q_end - d.q_start BETWEEN 80 AND 125
  AND NOT EXISTS (
    SELECT 1 FROM financial_fact f
    WHERE f.cik = d.cik AND f.concept = d.concept
      AND f.period_start = d.q_start AND f.period_end = d.q_end
      AND NOT f.is_derived
  )
ON CONFLICT ON CONSTRAINT financial_fact_natural_key DO NOTHING;


-- ---------------------------------------------------------------------
-- RECONCILIATION. Not run by the pass; run it when the method is doubted.
--
-- Where a ladder rung lands on a window that was ALSO filed as a discrete
-- quarter, the differenced value must equal the filed one. That turns the
-- whole approach from plausible into checked, and it is the reason the
-- rungs with no filed counterpart can be trusted.
--
-- Measured on Apple, all 17 concepts, 13+ years:
--     overlapping 465 | exact_match 465 | mismatch 0 | worst_diff 0
--
-- THAT FIGURE WAS NOT REPRESENTATIVE, and saying "0 mismatches" from a
-- single filer was an overclaim. Across 190 companies:
--     overlapping 73,579 | exact 70,789 | mismatch 2,790 | 96.2%
--
-- The disagreements are restatements, not arithmetic: GE's revenue for
-- one quarter reads 58.4B down a ladder and 2.77B as separately filed,
-- because the scope changed (continuing vs total operations) between
-- filings. Requiring every rung to come from ONE filing makes it worse
-- (94.3%), so it is not a ladder-mixing artefact.
--
-- It does not reach the data: the NOT EXISTS guard below means a filed
-- quarter always wins and a derived one is only inserted where nothing
-- was filed. The residual risk is on those, and it is concentrated in
-- companies that restate.
--
-- WITH d AS (
--   SELECT cik, concept,
--          COALESCE(lag(period_end) OVER w + 1, period_start) AS q_start,
--          period_end AS q_end,
--          value - COALESCE(lag(value) OVER w, 0) AS q_value
--   FROM fact_current WHERE NOT is_derived
--     AND period_kind IN ('quarter','half','ninemonth','year')
--   WINDOW w AS (PARTITION BY cik, concept, period_start ORDER BY period_end))
-- SELECT count(*) AS overlapping,
--        count(*) FILTER (WHERE d.q_value =  f.value) AS exact_match,
--        count(*) FILTER (WHERE d.q_value <> f.value) AS mismatch,
--        COALESCE(max(abs(d.q_value - f.value)), 0)   AS worst_diff
-- FROM d JOIN fact_current f
--   ON f.cik = d.cik AND f.concept = d.concept
--  AND f.period_start = d.q_start AND f.period_end = d.q_end
--  AND NOT f.is_derived
-- WHERE d.q_end - d.q_start BETWEEN 80 AND 125;
