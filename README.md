# Spire

Self-contained, browser-based financial analysis. Four modules, switchable from the left rail:

- **MonteVue** — portfolio risk. Monte Carlo simulation (fat-tailed, correlated, log-normal), historical crash replay, correlation heatmap, efficient frontier, and a retirement "will my money last?" planner.
- **Vantage** — company fundamentals & valuation. Enter a company's figures from its statements; get ratio analysis, a DuPont ROE breakdown, valuation multiples, ROIC, an interactive DCF, an LBO model, and a combined verdict.
- **M&A** — accretion/dilution. Two companies and a deal structure; pro-forma EPS against standalone, an attribution bridge, and the breakeven offer price.
- **Ledger** — personal finance. A month of category totals in; a Sankey of where the money went, a savings rate with a verdict, per-category judgements, what-if sliders, and a retirement handoff to MonteVue.

Every number carries its interpretation: the value, a plain-English meaning, and a good/average/bad rating. A bare ratio could come from anywhere.

All the math runs in the browser and is in the code — `npm run verify:math` re-checks every engine against hand-computed cases. **The frontend makes no third-party requests**: no API keys, no CDN, no analytics, and the typefaces are bundled rather than fetched, verified with all non-local hosts blocked.

Vantage and M&A can pre-fill a company from a ticker — 189 US large caps, drawn from real SEC filings. **There is no backend.** The figures come from quarterly filings and do not change between them, so they ship with the site as static JSON (1.3 KB per company) and are fetched from the app's own origin: no database, no API key, nothing that can be down.

Producing that data is a separate, offline step: a Python job in [`ingest/`](ingest/) reads SEC EDGAR, resolves each filer's XBRL tags to a common set of concepts, reconstructs quarters the filings never report directly, and exports the result. It runs on a laptop, not on the site.

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
