# Spire

Self-contained, browser-based financial analysis. Five modules, switchable from the left rail:

- **MonteVue** — portfolio risk. Monte Carlo simulation (fat-tailed, correlated, log-normal), historical crash replay, correlation heatmap, efficient frontier, and a retirement "will my money last?" planner.
- **Vantage** — company fundamentals & valuation. Enter a company's figures from its statements; get ratio analysis, a DuPont ROE breakdown, valuation multiples, ROIC, an interactive DCF, an LBO model, and a combined verdict.
- **M&A** — accretion/dilution. Two companies and a deal structure; pro-forma EPS against standalone, an attribution bridge, and the breakeven offer price.
- **Ledger** — personal finance. A month of category totals in; a Sankey of where the money went, a savings rate with a verdict, per-category judgements, what-if sliders, and a retirement handoff to MonteVue.
- **Screener** — the whole universe at once. Filter 189 companies on growth, margins, returns and multiples, see where each ranks *within its own sector*, and hand any of them to Vantage in one click.

Every number carries its interpretation: the value, a plain-English meaning, and a good/average/bad rating. A bare ratio could come from anywhere.

All the math runs in the browser and is in the code — `npm run verify:math` re-checks every engine against hand-computed cases. **The frontend makes no third-party requests**: no API keys, no CDN, no analytics, and the typefaces are bundled rather than fetched, verified with all non-local hosts blocked.

Vantage and M&A can pre-fill a company from a ticker, and Vantage sets its multiples against the sector median. **There is no backend at request time.** The figures change weekly at most, so they ship with the site as static JSON fetched from its own origin: no database in production, no API key, nothing that can be down.

## The data layer

A Python and PostgreSQL pipeline in [`ingest/`](ingest/) runs weekly on GitHub Actions against a throwaway database, and commits the results.

**Ingestion.** SEC EDGAR fundamentals for 189 US large caps, two years of daily adjusted closes (~95,000 rows), and market data. Each filer's XBRL tags are resolved to a common set of concepts, restatements are resolved by form priority, and quarters the filings never report directly are reconstructed by differencing cumulative year-to-date periods.

**Schema** — [`schema.sql`](ingest/schema.sql). Facts are stored period-aware and concept-keyed rather than as a wide table, because the same revenue figure can appear in three filings with different values and the schema has to be able to say which one wins.

**Analysis** — [`analytics.sql`](ingest/analytics.sql), eight views; the ones doing the work:

| view | what it answers | how |
|---|---|---|
| `daily_return`, `company_risk` | how volatile each stock *actually* was, and its beta | `LAG` over a per-ticker window; `STDDEV_SAMP`, `COVAR_SAMP` |
| `company_metrics` | one row per company from three sources | CTEs joining TTM flows, latest balances and market data |
| `sector_comps` | what a typical peer trades at | `PERCENTILE_CONT` medians and quartiles by sector |
| `revenue_growth` | year-over-year and 3-year CAGR | `LAG(…, 1)` and `LAG(…, 3)` over annual periods |
| `screener` | where each company sits in its sector | `PERCENT_RANK` partitioned by sector |

Two choices worth naming. **Medians, not means** — multiples are right-skewed, so one company on 90× drags a mean above anything its peers trade at. **Rank within sector, not across the universe** — a 22% net margin is ordinary in software and exceptional in retail, so ranking the raw universe on margin mostly sorts by industry.

Every ratio refuses rather than misleads: EV/EBITDA is `NULL` on non-positive EBITDA instead of negative, because a negative multiple sorts to the top of a "cheapest" list. The screener treats `NULL` as *excluded*, never as zero, and that property is pinned in the test harness.

It is a convenience, not a dependency: every field stays editable, and the app works exactly as before by hand.

## Run it

```bash
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Structure

- `src/lib/` — the pure math engines (no UI):
  - `montecarlo.ts` — the portfolio simulation engine
  - `risk.ts` — portfolio risk stats + efficient frontier
  - `crashes.ts` — historical crash replay
  - `retirement.ts` — retirement Monte Carlo
  - `analysis.ts` — company ratios, DuPont, verdicts
  - `dcf.ts` — discounted cash flow valuation
  - `assets.ts`, `format.ts` — asset data and formatting helpers
- `src/components/` — reusable UI pieces (cards, charts, inputs)
- `src/modules/` — the two modules (StressTest = MonteVue, Vantage) and Vantage's tabs
- `src/styles/theme.css` — design tokens (the single source of truth for the look)

## A note on the numbers

Asset assumptions (returns, volatilities, correlations) and crash profiles are documented long-run approximations for broad asset classes — defensible directional inputs, not live market data. Vantage analyzes whatever company figures you enter, so its output is only as good as the inputs you provide (as any DCF or ratio analysis is).

See `EXPLAINER.md` for a full line-by-line walkthrough of the MonteVue engine and codebase.
