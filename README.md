# Finance Suite

A suite of self-contained, browser-based financial analysis tools. Two modules so far, switchable from the left rail:

- **MonteVue** — portfolio stress testing. Monte Carlo simulation (fat-tailed, correlated, log-normal), historical crash replay, correlation heatmap, efficient frontier, and a retirement "will my money last?" planner.
- **Vantage** — company fundamentals & valuation. You input a company's numbers from its financial statements; it computes ratio analysis, a DuPont ROE breakdown, an interactive DCF valuation, and a combined executive verdict — every number shown with a plain-English meaning and a good/average/bad rating.

Everything runs entirely in the browser. No backend, no API keys, no external data dependencies — all the math is in the code.

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
