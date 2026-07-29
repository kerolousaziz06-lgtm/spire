// ============================================================
// analysis.ts — the Vantage fundamentals engine (pure math).
//
// The user inputs one company's numbers (from its financial
// statements). This file turns those raw numbers into the ratios,
// decompositions, and verdicts a real analyst computes — each with
// a plain-English meaning and a good/average/bad health rating.
//
// Everything here is pure: numbers in, analysis out, no screen code.
// Every formula is the textbook definition, chosen to be defensible.
// ============================================================

// ---- The raw inputs the user provides (from the statements) ----
// All in the same currency unit (e.g. millions). We keep the set
// small and standard — the figures anyone can read off a 10-K.
export type CompanyInput = {
  // Income statement
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  interestExpense: number;
  // Balance sheet
  totalAssets: number;
  currentAssets: number;
  inventory: number;
  cash: number;
  totalLiabilities: number;
  currentLiabilities: number;
  totalDebt: number;          // interest-bearing debt
  shareholdersEquity: number;
  // Cash flow
  operatingCashFlow: number;
  capex: number;              // capital expenditures (a positive number)
  // Market (optional, for valuation context)
  sharesOutstanding: number;
  sharePrice: number;
};

// A sensible default so the module opens with something real to see.
// (Approximate Apple-like figures, in billions — illustrative.)
export const SAMPLE_INPUT: CompanyInput = {
  revenue: 391,
  grossProfit: 180,
  operatingIncome: 123,
  netIncome: 94,
  interestExpense: 4,
  totalAssets: 365,
  currentAssets: 153,
  inventory: 7,
  cash: 30,
  totalLiabilities: 308,
  currentLiabilities: 176,
  totalDebt: 107,
  shareholdersEquity: 57,
  operatingCashFlow: 118,
  capex: 10,
  sharesOutstanding: 15.2,
  sharePrice: 230,
};

// ---- Verdict scale: every metric gets one of these ----
export type Health = 'good' | 'ok' | 'bad';

export type Metric = {
  key: string;
  label: string;
  value: number;
  display: string;      // preformatted (e.g. "24.0%" or "1.85×")
  meaning: string;      // plain-English "what this tells you"
  health: Health;
  verdict: string;      // short health label (e.g. "strong", "thin")
  higherIsBetter: boolean;
};

// Small helpers for formatting inside this file.
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const mult = (x: number) => x.toFixed(2) + '\u00D7';   // ×
const money = (x: number) => (x < 0 ? '-$' : '$') + Math.abs(x).toFixed(1) + 'B';

// Build a verdict from thresholds. `bands` is [goodAt, okAt] for
// higher-is-better metrics, or [goodBelow, okBelow] when lower is better.
function rate(value: number, bands: [number, number], higherIsBetter: boolean): { health: Health } {
  const [a, b] = bands;
  if (higherIsBetter) {
    if (value >= a) return { health: 'good' };
    if (value >= b) return { health: 'ok' };
    return { health: 'bad' };
  } else {
    if (value <= a) return { health: 'good' };
    if (value <= b) return { health: 'ok' };
    return { health: 'bad' };
  }
}

// ============================================================
// PROFITABILITY — how much profit the company squeezes out.
// ============================================================
export function profitability(c: CompanyInput): Metric[] {
  const grossMargin = c.grossProfit / c.revenue;
  const operatingMargin = c.operatingIncome / c.revenue;
  const netMargin = c.netIncome / c.revenue;
  const roe = c.netIncome / c.shareholdersEquity;
  const roa = c.netIncome / c.totalAssets;

  return [
    {
      key: 'grossMargin', label: 'Gross margin', value: grossMargin, display: pct(grossMargin),
      meaning: `Of every $1 in sales, ${(grossMargin * 100).toFixed(0)}\u00A2 is left after the direct cost of making the product. Higher means pricing power.`,
      ...verdictify(rate(grossMargin, [0.40, 0.25], true), 'gross margin'), higherIsBetter: true,
    },
    {
      key: 'operatingMargin', label: 'Operating margin', value: operatingMargin, display: pct(operatingMargin),
      meaning: `After running the whole business (not just making the product), ${(operatingMargin * 100).toFixed(0)}\u00A2 of each sales dollar remains. It shows core operating efficiency.`,
      ...verdictify(rate(operatingMargin, [0.15, 0.08], true), 'operating margin'), higherIsBetter: true,
    },
    {
      key: 'netMargin', label: 'Net margin', value: netMargin, display: pct(netMargin),
      meaning: `The bottom line: ${(netMargin * 100).toFixed(0)}\u00A2 of every sales dollar becomes actual profit after everything — costs, interest, taxes.`,
      ...verdictify(rate(netMargin, [0.15, 0.05], true), 'net margin'), higherIsBetter: true,
    },
    {
      key: 'roe', label: 'Return on equity (ROE)', value: roe, display: pct(roe),
      meaning: `For every $1 owners have invested, the company earned ${(roe * 100).toFixed(0)}\u00A2 this year. The headline profitability number — but watch how much debt drives it (see DuPont).`,
      ...verdictify(rate(roe, [0.15, 0.08], true), 'ROE'), higherIsBetter: true,
    },
    {
      key: 'roa', label: 'Return on assets (ROA)', value: roa, display: pct(roa),
      meaning: `For every $1 of assets the company controls, it earned ${(roa * 100).toFixed(0)}\u00A2. Unlike ROE, debt can't flatter this — it measures raw asset efficiency.`,
      ...verdictify(rate(roa, [0.08, 0.04], true), 'ROA'), higherIsBetter: true,
    },
  ];
}

// ============================================================
// LIQUIDITY — can it pay its short-term bills?
// ============================================================
export function liquidity(c: CompanyInput): Metric[] {
  const currentRatio = c.currentAssets / c.currentLiabilities;
  const quickRatio = (c.currentAssets - c.inventory) / c.currentLiabilities;
  const cashRatio = c.cash / c.currentLiabilities;

  return [
    {
      key: 'currentRatio', label: 'Current ratio', value: currentRatio, display: mult(currentRatio),
      meaning: `The company has $${currentRatio.toFixed(2)} of short-term assets for every $1 of bills due within a year. Above 1 means it can cover them; too high can mean idle cash.`,
      ...verdictify(rate(currentRatio, [1.5, 1.0], true), 'current ratio'), higherIsBetter: true,
    },
    {
      key: 'quickRatio', label: 'Quick ratio', value: quickRatio, display: mult(quickRatio),
      meaning: `Like the current ratio but excludes inventory (which is hard to sell fast). $${quickRatio.toFixed(2)} of truly liquid assets per $1 of near-term bills — a stricter safety test.`,
      ...verdictify(rate(quickRatio, [1.0, 0.7], true), 'quick ratio'), higherIsBetter: true,
    },
    {
      key: 'cashRatio', label: 'Cash ratio', value: cashRatio, display: mult(cashRatio),
      meaning: `The most conservative test: $${cashRatio.toFixed(2)} of pure cash per $1 of short-term bills. How much it could pay off today, without selling anything.`,
      ...verdictify(rate(cashRatio, [0.5, 0.2], true), 'cash ratio'), higherIsBetter: true,
    },
  ];
}

// ============================================================
// LEVERAGE — how much debt, and can it handle it?
// ============================================================
export function leverage(c: CompanyInput): Metric[] {
  const debtToEquity = c.totalDebt / c.shareholdersEquity;
  const debtToAssets = c.totalDebt / c.totalAssets;
  const interestCoverage = c.interestExpense > 0 ? c.operatingIncome / c.interestExpense : Infinity;

  return [
    {
      key: 'debtToEquity', label: 'Debt-to-equity', value: debtToEquity, display: mult(debtToEquity),
      meaning: `The company owes $${debtToEquity.toFixed(2)} of debt for every $1 of owner equity. Low is safer; high magnifies both gains and losses — and risk.`,
      ...verdictify(rate(debtToEquity, [1.0, 2.0], false), 'debt-to-equity'), higherIsBetter: false,
    },
    {
      key: 'debtToAssets', label: 'Debt-to-assets', value: debtToAssets, display: pct(debtToAssets),
      meaning: `${(debtToAssets * 100).toFixed(0)}% of everything the company owns is financed by debt rather than owners. Lower means a sturdier balance sheet.`,
      ...verdictify(rate(debtToAssets, [0.3, 0.5], false), 'debt-to-assets'), higherIsBetter: false,
    },
    {
      key: 'interestCoverage', label: 'Interest coverage', value: interestCoverage,
      display: isFinite(interestCoverage) ? mult(interestCoverage) : 'no debt cost',
      meaning: isFinite(interestCoverage)
        ? `Operating profit covers the interest bill ${interestCoverage.toFixed(1)} times over. Higher means comfortably able to service debt; near 1 is dangerous.`
        : `The company reports no interest expense — it isn't burdened by debt payments.`,
      ...verdictify(rate(isFinite(interestCoverage) ? interestCoverage : 99, [6, 2.5], true), 'interest coverage'), higherIsBetter: true,
    },
  ];
}

// ============================================================
// EFFICIENCY & CASH QUALITY — is the business well-run, and is
// its profit backed by real cash?
// ============================================================
export function efficiency(c: CompanyInput): Metric[] {
  const assetTurnover = c.revenue / c.totalAssets;
  const fcf = c.operatingCashFlow - c.capex;
  const fcfMargin = fcf / c.revenue;
  // Cash conversion: does reported profit turn into real operating cash?
  const cashConversion = c.netIncome !== 0 ? c.operatingCashFlow / c.netIncome : 0;

  return [
    {
      key: 'assetTurnover', label: 'Asset turnover', value: assetTurnover, display: mult(assetTurnover),
      meaning: `Each $1 of assets generates $${assetTurnover.toFixed(2)} of sales per year. Higher means the company sweats its assets harder (retailers high, utilities low).`,
      ...verdictify(rate(assetTurnover, [1.0, 0.5], true), 'asset turnover'), higherIsBetter: true,
    },
    {
      key: 'fcfMargin', label: 'Free cash flow margin', value: fcfMargin, display: pct(fcfMargin),
      meaning: `After paying to maintain and grow its asset base, the company keeps ${(fcfMargin * 100).toFixed(0)}\u00A2 of real, spendable cash per sales dollar. This is the cash that funds dividends, buybacks, and debt paydown.`,
      ...verdictify(rate(fcfMargin, [0.12, 0.05], true), 'FCF margin'), higherIsBetter: true,
    },
    {
      key: 'cashConversion', label: 'Cash conversion', value: cashConversion, display: mult(cashConversion),
      meaning: `For every $1 of reported profit, the business produced $${cashConversion.toFixed(2)} of actual operating cash. Near or above 1 means earnings are cash-backed and real; well below 1 is a quality red flag.`,
      ...verdictify(rate(cashConversion, [0.9, 0.7], true), 'cash conversion'), higherIsBetter: true,
    },
  ];
}

// ============================================================
// DUPONT — decomposes ROE into its three drivers, revealing WHY
// the company is (or isn't) profitable: margins, efficiency, or debt.
// ROE = Net Margin  ×  Asset Turnover  ×  Equity Multiplier
// ============================================================
export type DuPont = {
  netMargin: number;
  assetTurnover: number;
  equityMultiplier: number;
  roe: number;              // the three multiplied back together
  roeReported: number;      // net income / equity, as a cross-check
  driver: string;           // which factor dominates, in words
};

export function dupont(c: CompanyInput): DuPont {
  const netMargin = c.netIncome / c.revenue;
  const assetTurnover = c.revenue / c.totalAssets;
  const equityMultiplier = c.totalAssets / c.shareholdersEquity;
  const roe = netMargin * assetTurnover * equityMultiplier;
  const roeReported = c.netIncome / c.shareholdersEquity;

  // Identify the standout driver for a plain-English takeaway.
  let driver: string;
  if (equityMultiplier >= 3) {
    driver = `This ROE is heavily leverage-driven — the company multiplies returns with a lot of debt (equity multiplier ${equityMultiplier.toFixed(1)}\u00D7). Impressive ROE, but riskier than it looks.`;
  } else if (netMargin >= 0.15) {
    driver = `This ROE is powered mainly by strong profit margins (${(netMargin * 100).toFixed(0)}%) — a high-quality driver, meaning the company simply keeps a lot of each sale.`;
  } else if (assetTurnover >= 1) {
    driver = `This ROE is driven mainly by efficiency — the company turns its assets over quickly (${assetTurnover.toFixed(1)}\u00D7), earning through volume rather than fat margins.`;
  } else {
    driver = `No single factor dominates — ROE comes from a balance of margins, asset efficiency, and moderate leverage.`;
  }

  return { netMargin, assetTurnover, equityMultiplier, roe, roeReported, driver };
}

// Attach the verdict label text to a rated metric.
function verdictify(r: { health: Health }, _name: string): { health: Health; verdict: string } {
  const labels: Record<Health, string> = { good: 'strong', ok: 'average', bad: 'weak' };
  return { health: r.health, verdict: labels[r.health] };
}

// Re-export formatters for the UI layer's convenience.
export const vfmt = { pct, mult, money };
