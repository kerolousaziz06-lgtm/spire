import { unitSuffix, currencySymbol } from './format';
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
// A figure the user has not supplied is `null`, NOT 0. The distinction
// matters: a software company genuinely has 0 inventory, while a user who
// has not found the number yet has none. Treating those the same is how a
// tool ends up rating an empty form.
export type CompanyInput = {
  // Income statement
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  interestExpense: number | null;
  // Balance sheet
  totalAssets: number | null;
  currentAssets: number | null;
  inventory: number | null;
  cash: number | null;
  totalLiabilities: number | null;
  currentLiabilities: number | null;
  totalDebt: number | null;          // interest-bearing debt
  shareholdersEquity: number | null;
  // Cash flow
  operatingCashFlow: number | null;
  capex: number | null;              // capital expenditures (a positive number)
  // Market
  sharesOutstanding: number | null;
  sharePrice: number | null;
};

export type CompanyField = keyof CompanyInput;

// Fields that may legitimately be blank. Everything else is required, and
// any metric depending on a blank required field is SKIPPED rather than
// computed from a stand-in value.
export const OPTIONAL_FIELDS: ReadonlySet<CompanyField> = new Set<CompanyField>([
  'interestExpense',   // often only in the notes; a debt-free firm has none
  'inventory',         // absent for software and service businesses
  'totalDebt',         // must be assembled; a debt-free firm has none
  'sharesOutstanding', // only needed for per-share valuation
  'sharePrice',        // only needed to compare against the market
]);

// Display names, shared by the input sidebar and the "missing data"
// notices, so a field is called the same thing in both places.
export const FIELD_LABELS: Record<CompanyField, string> = {
  revenue: 'Revenue',
  grossProfit: 'Gross profit',
  operatingIncome: 'Operating income',
  netIncome: 'Net income',
  interestExpense: 'Interest expense',
  totalAssets: 'Total assets',
  currentAssets: 'Current assets',
  inventory: 'Inventory',
  cash: 'Cash & equivalents',
  totalLiabilities: 'Total liabilities',
  currentLiabilities: 'Current liabilities',
  totalDebt: 'Total debt',
  shareholdersEquity: "Shareholders' equity",
  operatingCashFlow: 'Operating cash flow',
  capex: 'Capital expenditures',
  sharesOutstanding: 'Shares outstanding',
  sharePrice: 'Share price',
};

// Which of `keys` the user has not supplied. Callers use this to skip a
// whole analysis and say precisely what is needed, instead of computing
// something from stand-in values.
export function missingFields(c: CompanyInput, keys: readonly CompanyField[]): CompanyField[] {
  return keys.filter((k) => c[k] === null || !Number.isFinite(c[k] as number));
}

// Where to find each figure. Shown under the field, because several of
// these are not single line items and hunting for them was the slowest
// part of entering a company.
export const FIELD_HINTS: Record<CompanyField, string> = {
  revenue: 'Income statement, top line. Also called "net sales" or "total revenue".',
  grossProfit: 'Revenue minus cost of goods sold. If not shown, subtract COGS from revenue.',
  operatingIncome: 'Income statement, after operating expenses. Also called EBIT or "operating profit".',
  netIncome: 'Income statement, bottom line, after tax and interest.',
  interestExpense: 'Often in the notes rather than on the face of the income statement. Look for "interest expense, net". Enter 0 if the company has no debt.',
  totalAssets: 'Balance sheet, the total of the asset section.',
  currentAssets: 'Balance sheet, the "total current assets" subtotal (due within a year).',
  inventory: 'Balance sheet, within current assets. Enter 0 for software and service companies, which carry none.',
  cash: 'Balance sheet, "cash and cash equivalents". Include short-term investments if broken out.',
  totalLiabilities: 'Balance sheet, total of the liabilities section. Equals total assets minus equity.',
  currentLiabilities: 'Balance sheet, the "total current liabilities" subtotal (due within a year).',
  totalDebt: 'Usually must be assembled: short-term borrowings + current portion of long-term debt + long-term debt. Excludes payables and leases. Enter 0 if debt-free.',
  shareholdersEquity: 'Balance sheet, "total stockholders\' equity". Exclude minority interest if shown separately.',
  operatingCashFlow: 'Cash flow statement, "net cash provided by operating activities".',
  capex: 'Cash flow statement, investing section: "purchases of property, plant and equipment". Enter as a positive number.',
  sharesOutstanding: 'Cover page of the 10-K, or the share count used for diluted EPS.',
  sharePrice: "Today's market price per share.",
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
  // null when the figures it depends on failed a reconciliation check.
  // The value still shows; the judgement is withheld.
  health: Health | null;
  verdict: string;      // short health label (e.g. "strong", "thin")
  inputs: CompanyField[];  // which fields it was computed from
  higherIsBetter: boolean;
};

// Small helpers for formatting inside this file.
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const mult = (x: number) => x.toFixed(2) + '\u00D7';   // ×
// Follows the Display settings: the currency glyph and the unit suffix
// are labels chosen by the user, never a conversion.
const money = (x: number) =>
  (x < 0 ? '-' : '') + currencySymbol() + Math.abs(x).toFixed(1) + unitSuffix();

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
// RECONCILIATION — do these figures describe a real company?
//
// Every ratio here is arithmetic on whatever the user typed. Without a
// check, revenue 90 with gross profit 180 yields a 200% gross margin, a
// 136.7% operating margin and a 104.4% net margin, and the tool rates all
// three STRONG. A product whose entire value is trustworthy
// interpretation must never put a confident verdict on nonsense.
//
// Two severities, because the distinction is real:
//   error   — an arithmetic impossibility. Ratings that depend on the
//             offending fields are withheld.
//   caution — unusual but genuinely possible (a one-off gain can push net
//             income above operating income). Flagged, never suppressed.
// ============================================================

export type ReconSeverity = 'error' | 'caution';

export type ReconIssue = {
  id: string;
  severity: ReconSeverity;
  fields: CompanyField[];   // which inputs to flag in the sidebar
  message: string;
};

// Only compare figures the user actually supplied.
const both = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b);

export function reconcile(c: CompanyInput): ReconIssue[] {
  const issues: ReconIssue[] = [];
  const err = (id: string, fields: CompanyField[], message: string) =>
    issues.push({ id, severity: 'error', fields, message });
  const caution = (id: string, fields: CompanyField[], message: string) =>
    issues.push({ id, severity: 'caution', fields, message });

  // ---- Income statement: each line is a subtotal of the one above ----
  if (both(c.grossProfit, c.revenue) && (c.grossProfit as number) > (c.revenue as number)) {
    err('gp>rev', ['grossProfit', 'revenue'],
      'Gross profit is larger than revenue. Gross profit is revenue minus the cost of goods sold, so it cannot exceed the top line.');
  }
  if (both(c.operatingIncome, c.grossProfit) && (c.operatingIncome as number) > (c.grossProfit as number)) {
    err('oi>gp', ['operatingIncome', 'grossProfit'],
      'Operating income is larger than gross profit. Operating expenses are subtracted from gross profit, so it cannot be higher.');
  }
  if (both(c.netIncome, c.operatingIncome) && (c.netIncome as number) > (c.operatingIncome as number)) {
    caution('ni>oi', ['netIncome', 'operatingIncome'],
      'Net income exceeds operating income. Possible through one-off gains, investment income or a tax benefit, but worth confirming.');
  }
  if (c.revenue !== null && (c.revenue as number) < 0) {
    err('rev<0', ['revenue'], 'Revenue cannot be negative.');
  }

  // ---- Balance sheet: subtotals and the accounting identity ----
  if (both(c.currentAssets, c.totalAssets) && (c.currentAssets as number) > (c.totalAssets as number)) {
    err('ca>ta', ['currentAssets', 'totalAssets'],
      'Current assets exceed total assets. Current assets are a subset of the total.');
  }
  if (both(c.totalLiabilities, c.totalAssets) && (c.totalLiabilities as number) > (c.totalAssets as number)) {
    err('tl>ta', ['totalLiabilities', 'totalAssets'],
      'Total liabilities exceed total assets, which would mean negative equity. Check both figures, and enter equity directly if it really is negative.');
  }
  if (both(c.inventory, c.currentAssets) && (c.inventory as number) > (c.currentAssets as number)) {
    err('inv>ca', ['inventory', 'currentAssets'],
      'Inventory exceeds current assets. Inventory is one component of current assets.');
  }
  if (both(c.cash, c.currentAssets) && (c.cash as number) > (c.currentAssets as number)) {
    err('cash>ca', ['cash', 'currentAssets'],
      'Cash exceeds current assets. Cash is one component of current assets.');
  }
  if (both(c.currentLiabilities, c.totalLiabilities) && (c.currentLiabilities as number) > (c.totalLiabilities as number)) {
    err('cl>tl', ['currentLiabilities', 'totalLiabilities'],
      'Current liabilities exceed total liabilities. Current liabilities are a subset of the total.');
  }
  if (c.totalAssets !== null && (c.totalAssets as number) <= 0) {
    err('ta<=0', ['totalAssets'], 'Total assets must be greater than zero.');
  }

  // Assets = Liabilities + Equity. Tolerance of 1% of total assets, since
  // filings round and the user may be typing from a summary table.
  if (c.totalAssets !== null && c.totalLiabilities !== null && c.shareholdersEquity !== null) {
    const implied = (c.totalAssets as number) - (c.totalLiabilities as number);
    const gap = Math.abs((c.shareholdersEquity as number) - implied);
    const tol = Math.max(Math.abs(c.totalAssets as number) * 0.01, 1e-9);
    if (gap > tol) {
      err('identity', ['shareholdersEquity', 'totalAssets', 'totalLiabilities'],
        `The balance sheet does not balance. Assets minus liabilities implies equity of ${money(implied)}, but ${money(c.shareholdersEquity as number)} was entered — a gap of ${money(gap)}.`);
    }
  }

  // ---- Cash flow ----
  if (c.capex !== null && (c.capex as number) < 0) {
    caution('capex<0', ['capex'],
      'Capital expenditures are usually entered as a positive number, even though the cash flow statement shows them as an outflow.');
  }

  return issues;
}

// Fields caught by an ERROR. Any metric depending on one of these has its
// rating withheld: the value is still arithmetic, but a good/average/bad
// judgement on an impossible figure would be worse than no judgement.
export function unratableFields(issues: ReconIssue[]): Set<CompanyField> {
  const out = new Set<CompanyField>();
  for (const i of issues) {
    if (i.severity === 'error') for (const f of i.fields) out.add(f);
  }
  return out;
}

// Strip the verdict from any metric that leans on a contradicted field.
export function applyReconciliation(metrics: Metric[], issues: ReconIssue[]): Metric[] {
  const bad = unratableFields(issues);
  if (bad.size === 0) return metrics;
  return metrics.map((m) => {
    const hit = m.inputs.find((f) => bad.has(f));
    if (!hit) return m;
    return { ...m, health: null, verdict: 'unrated' };
  });
}

// ---- Missing-input guards -------------------------------------------
//
// "Skip, never fake." A metric whose inputs are absent is omitted from the
// list entirely; it is not computed from 0, and it is not rated. The one
// thing this tool sells is that a number on screen can be trusted, so
// showing a confident verdict derived from a blank field would be worse
// than showing nothing.

// Every argument must be a real, finite number.
function has(...vals: (number | null)[]): boolean {
  return vals.every((v) => v !== null && Number.isFinite(v));
}

// Denominators additionally must not be zero, or the metric is Infinity.
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (!has(numerator, denominator)) return null;
  if (denominator === 0) return null;
  return (numerator as number) / (denominator as number);
}

// ============================================================
// PROFITABILITY — how much profit the company squeezes out.
// ============================================================
export function profitability(c: CompanyInput): Metric[] {
  const out: Metric[] = [];

  const grossMargin = ratio(c.grossProfit, c.revenue);
  if (grossMargin !== null) out.push({
    key: 'grossMargin', label: 'Gross margin', value: grossMargin, display: pct(grossMargin),
    meaning: `Of every $1 in sales, ${(grossMargin * 100).toFixed(0)}\u00A2 is left after the direct cost of making the product. Higher means pricing power.`,
    ...verdictify(rate(grossMargin, [0.40, 0.25], true), 'gross margin'), inputs: ['grossProfit', 'revenue'], higherIsBetter: true,
  });

  const operatingMargin = ratio(c.operatingIncome, c.revenue);
  if (operatingMargin !== null) out.push({
    key: 'operatingMargin', label: 'Operating margin', value: operatingMargin, display: pct(operatingMargin),
    meaning: `After running the whole business (not just making the product), ${(operatingMargin * 100).toFixed(0)}\u00A2 of each sales dollar remains. It shows core operating efficiency.`,
    ...verdictify(rate(operatingMargin, [0.15, 0.08], true), 'operating margin'), inputs: ['operatingIncome', 'revenue'], higherIsBetter: true,
  });

  const netMargin = ratio(c.netIncome, c.revenue);
  if (netMargin !== null) out.push({
    key: 'netMargin', label: 'Net margin', value: netMargin, display: pct(netMargin),
    meaning: `The bottom line: ${(netMargin * 100).toFixed(0)}\u00A2 of every sales dollar becomes actual profit after everything — costs, interest, taxes.`,
    ...verdictify(rate(netMargin, [0.15, 0.05], true), 'net margin'), inputs: ['netIncome', 'revenue'], higherIsBetter: true,
  });

  const roe = ratio(c.netIncome, c.shareholdersEquity);
  if (roe !== null) out.push({
    key: 'roe', label: 'Return on equity (ROE)', value: roe, display: pct(roe),
    meaning: `For every $1 owners have invested, the company earned ${(roe * 100).toFixed(0)}\u00A2 this year. The headline profitability number — but watch how much debt drives it (see DuPont).`,
    ...verdictify(rate(roe, [0.15, 0.08], true), 'ROE'), inputs: ['netIncome', 'shareholdersEquity'], higherIsBetter: true,
  });

  const roa = ratio(c.netIncome, c.totalAssets);
  if (roa !== null) out.push({
    key: 'roa', label: 'Return on assets (ROA)', value: roa, display: pct(roa),
    meaning: `For every $1 of assets the company controls, it earned ${(roa * 100).toFixed(0)}\u00A2. Unlike ROE, debt can't flatter this — it measures raw asset efficiency.`,
    ...verdictify(rate(roa, [0.08, 0.04], true), 'ROA'), inputs: ['netIncome', 'totalAssets'], higherIsBetter: true,
  });

  return out;
}

// ============================================================
// LIQUIDITY — can it pay its short-term bills?
// ============================================================
export function liquidity(c: CompanyInput): Metric[] {
  const out: Metric[] = [];

  const currentRatio = ratio(c.currentAssets, c.currentLiabilities);
  if (currentRatio !== null) out.push({
    key: 'currentRatio', label: 'Current ratio', value: currentRatio, display: mult(currentRatio),
    meaning: `The company has $${currentRatio.toFixed(2)} of short-term assets for every $1 of bills due within a year. Above 1 means it can cover them; too high can mean idle cash.`,
    ...verdictify(rate(currentRatio, [1.5, 1.0], true), 'current ratio'), inputs: ['currentAssets', 'currentLiabilities'], higherIsBetter: true,
  });

  // Inventory blank means "not found", not "none". Skipping is the
  // graceful degradation: a software company should enter 0 and get the
  // ratio, rather than have us assume 0 on their behalf.
  const quickRatio = has(c.currentAssets, c.inventory)
    ? ratio((c.currentAssets as number) - (c.inventory as number), c.currentLiabilities)
    : null;
  if (quickRatio !== null) out.push({
    key: 'quickRatio', label: 'Quick ratio', value: quickRatio, display: mult(quickRatio),
    meaning: `Like the current ratio but excludes inventory (which is hard to sell fast). $${quickRatio.toFixed(2)} of truly liquid assets per $1 of near-term bills — a stricter safety test.`,
    ...verdictify(rate(quickRatio, [1.0, 0.7], true), 'quick ratio'), inputs: ['currentAssets', 'inventory', 'currentLiabilities'], higherIsBetter: true,
  });

  const cashRatio = ratio(c.cash, c.currentLiabilities);
  if (cashRatio !== null) out.push({
    key: 'cashRatio', label: 'Cash ratio', value: cashRatio, display: mult(cashRatio),
    meaning: `The most conservative test: $${cashRatio.toFixed(2)} of pure cash per $1 of short-term bills. How much it could pay off today, without selling anything.`,
    ...verdictify(rate(cashRatio, [0.5, 0.2], true), 'cash ratio'), inputs: ['cash', 'currentLiabilities'], higherIsBetter: true,
  });

  return out;
}

// ============================================================
// LEVERAGE — how much debt, and can it handle it?
// ============================================================
export function leverage(c: CompanyInput): Metric[] {
  const out: Metric[] = [];

  const debtToEquity = ratio(c.totalDebt, c.shareholdersEquity);
  if (debtToEquity !== null) out.push({
    key: 'debtToEquity', label: 'Debt-to-equity', value: debtToEquity, display: mult(debtToEquity),
    meaning: `The company owes $${debtToEquity.toFixed(2)} of debt for every $1 of owner equity. Low is safer; high magnifies both gains and losses — and risk.`,
    ...verdictify(rate(debtToEquity, [1.0, 2.0], false), 'debt-to-equity'), inputs: ['totalDebt', 'shareholdersEquity'], higherIsBetter: false,
  });

  const debtToAssets = ratio(c.totalDebt, c.totalAssets);
  if (debtToAssets !== null) out.push({
    key: 'debtToAssets', label: 'Debt-to-assets', value: debtToAssets, display: pct(debtToAssets),
    meaning: `${(debtToAssets * 100).toFixed(0)}% of everything the company owns is financed by debt rather than owners. Lower means a sturdier balance sheet.`,
    ...verdictify(rate(debtToAssets, [0.3, 0.5], false), 'debt-to-assets'), inputs: ['totalDebt', 'totalAssets'], higherIsBetter: false,
  });

  // A reported 0 is meaningful here ("no debt cost") and is NOT the same
  // as a blank field, which we skip.
  if (has(c.operatingIncome, c.interestExpense)) {
    const interestCoverage = (c.interestExpense as number) > 0
      ? (c.operatingIncome as number) / (c.interestExpense as number)
      : Infinity;
    out.push({
      key: 'interestCoverage', label: 'Interest coverage', value: interestCoverage,
      display: isFinite(interestCoverage) ? mult(interestCoverage) : 'no debt cost',
      meaning: isFinite(interestCoverage)
        ? `Operating profit covers the interest bill ${interestCoverage.toFixed(1)} times over. Higher means comfortably able to service debt; near 1 is dangerous.`
        : `The company reports no interest expense — it isn't burdened by debt payments.`,
      ...verdictify(rate(isFinite(interestCoverage) ? interestCoverage : 99, [6, 2.5], true), 'interest coverage'), inputs: ['operatingIncome', 'interestExpense'], higherIsBetter: true,
    });
  }

  return out;
}

// ============================================================
// EFFICIENCY & CASH QUALITY — is the business well-run, and is
// its profit backed by real cash?
// ============================================================
export function efficiency(c: CompanyInput): Metric[] {
  const out: Metric[] = [];

  const assetTurnover = ratio(c.revenue, c.totalAssets);
  if (assetTurnover !== null) out.push({
    key: 'assetTurnover', label: 'Asset turnover', value: assetTurnover, display: mult(assetTurnover),
    meaning: `Each $1 of assets generates $${assetTurnover.toFixed(2)} of sales per year. Higher means the company sweats its assets harder (retailers high, utilities low).`,
    ...verdictify(rate(assetTurnover, [1.0, 0.5], true), 'asset turnover'), inputs: ['revenue', 'totalAssets'], higherIsBetter: true,
  });

  const fcfMargin = has(c.operatingCashFlow, c.capex)
    ? ratio((c.operatingCashFlow as number) - (c.capex as number), c.revenue)
    : null;
  if (fcfMargin !== null) out.push({
    key: 'fcfMargin', label: 'Free cash flow margin', value: fcfMargin, display: pct(fcfMargin),
    meaning: `After paying to maintain and grow its asset base, the company keeps ${(fcfMargin * 100).toFixed(0)}\u00A2 of real, spendable cash per sales dollar. This is the cash that funds dividends, buybacks, and debt paydown.`,
    ...verdictify(rate(fcfMargin, [0.12, 0.05], true), 'FCF margin'), inputs: ['operatingCashFlow', 'capex', 'revenue'], higherIsBetter: true,
  });

  const cashConversion = ratio(c.operatingCashFlow, c.netIncome);
  if (cashConversion !== null) out.push({
    key: 'cashConversion', label: 'Cash conversion', value: cashConversion, display: mult(cashConversion),
    meaning: `For every $1 of reported profit, the business produced $${cashConversion.toFixed(2)} of actual operating cash. Near or above 1 means earnings are cash-backed and real; well below 1 is a quality red flag.`,
    ...verdictify(rate(cashConversion, [0.9, 0.7], true), 'cash conversion'), inputs: ['operatingCashFlow', 'netIncome'], higherIsBetter: true,
  });

  return out;
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

// Returns null when any of the four inputs is missing. Callers must render
// nothing rather than a partial decomposition.
export function dupont(c: CompanyInput): DuPont | null {
  const netMargin = ratio(c.netIncome, c.revenue);
  const assetTurnover = ratio(c.revenue, c.totalAssets);
  const equityMultiplier = ratio(c.totalAssets, c.shareholdersEquity);
  const roeReported = ratio(c.netIncome, c.shareholdersEquity);
  if (netMargin === null || assetTurnover === null || equityMultiplier === null || roeReported === null) {
    return null;
  }

  const roe = netMargin * assetTurnover * equityMultiplier;

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
