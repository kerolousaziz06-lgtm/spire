// ============================================================
// assets.ts — the "memory box" of market assumptions.
//
// A Monte Carlo simulation needs to know how each asset TENDS to
// behave: its average yearly NOMINAL return, its volatility (annual
// standard deviation), and how assets move together (correlation).
// These are long-run historical approximations — simple, round, and
// defensible, not precise predictions. All returns are NOMINAL
// (not inflation-adjusted), matching how people see account balances.
//
// Everything downstream reads from here, so to add or retune an
// asset you only edit THIS file.
// ============================================================

export type Asset = {
  id: string;
  name: string;
  short: string;
  category: 'stock' | 'bond' | 'cashlike' | 'alt';
  expReturn: number;   // expected ANNUAL nominal return (0.07 = 7%)
  volatility: number;  // annual standard deviation (0.155 = 15.5%)
  color: string;
};

// The asset universe. Grouped by category for readability.
export const ASSETS: Asset[] = [
  // ---- Stocks & equity indexes ----
  { id: 'us_stocks',   name: 'S&P 500 (US Large Cap)', short: 'S&P 500',  category: 'stock', expReturn: 0.070, volatility: 0.155, color: 'var(--accent)' },
  { id: 'nasdaq',      name: 'Nasdaq 100 (QQQ)',       short: 'Nasdaq',   category: 'stock', expReturn: 0.085, volatility: 0.200, color: 'var(--accent-bright)' },
  { id: 'small_cap',   name: 'US Small Cap',           short: 'Small Cap',category: 'stock', expReturn: 0.075, volatility: 0.210, color: '#FFB37A' },
  { id: 'intl_stocks', name: 'International Stocks',    short: 'Intl.',    category: 'stock', expReturn: 0.065, volatility: 0.170, color: '#FFD9A0' },
  { id: 'emerging',    name: 'Emerging Markets',       short: 'Emerging', category: 'stock', expReturn: 0.075, volatility: 0.240, color: '#FF8FA3' },

  // ---- Bonds & fixed income ----
  { id: 'bonds',       name: 'US Bonds (Aggregate)',   short: 'Bonds',    category: 'bond',  expReturn: 0.035, volatility: 0.055, color: '#9FC7FF' },
  { id: 'tips',        name: 'Treasury TIPS',          short: 'TIPS',     category: 'bond',  expReturn: 0.030, volatility: 0.050, color: '#C3D9FF' },
  { id: 'hy_bonds',    name: 'High-Yield Bonds',       short: 'HY Bonds', category: 'bond',  expReturn: 0.050, volatility: 0.100, color: '#B8A7FF' },

  // ---- Cash-like ----
  { id: 'savings',     name: 'Savings / HYSA',         short: 'Savings',  category: 'cashlike', expReturn: 0.040, volatility: 0.005, color: '#8FE3C2' },
  { id: 'cd',          name: 'Certificate of Deposit', short: 'CD',       category: 'cashlike', expReturn: 0.045, volatility: 0.003, color: '#B6F0D8' },
  { id: 'cash',        name: 'Cash (Checking)',        short: 'Cash',     category: 'cashlike', expReturn: 0.000, volatility: 0.000, color: '#EFDCD3' },

  // ---- Alternatives ----
  { id: 'reits',       name: 'Real Estate (REITs)',    short: 'REITs',    category: 'alt',   expReturn: 0.065, volatility: 0.190, color: '#D9A7FF' },
  { id: 'gold',        name: 'Gold',                   short: 'Gold',     category: 'alt',   expReturn: 0.040, volatility: 0.150, color: '#FFD75E' },
];

export const ASSET_BY_ID: Record<string, Asset> =
  Object.fromEntries(ASSETS.map((a) => [a.id, a]));

// ---- Correlation via category + tweaks -------------------------
// Hand-maintaining a full NxN matrix gets error-prone as assets
// grow. Instead we derive correlation from broad CATEGORY behavior,
// with a few specific overrides. This keeps things defensible and
// easy to extend: add an asset above and it inherits sensible
// correlations automatically.
//
// Base correlation BETWEEN categories:
const CATEGORY_CORR: Record<string, Record<string, number>> = {
  stock:    { stock: 0.80, bond: -0.05, cashlike: 0.00, alt: 0.45 },
  bond:     { stock: -0.05, bond: 0.70, cashlike: 0.15, alt: 0.20 },
  cashlike: { stock: 0.00, bond: 0.15, cashlike: 0.95, alt: 0.05 },
  alt:      { stock: 0.45, bond: 0.20, cashlike: 0.05, alt: 0.30 },
};

// A few specific pair overrides (more accurate than category defaults).
const PAIR_OVERRIDES: Record<string, number> = {
  'nasdaq|us_stocks': 0.90,
  'us_stocks|small_cap': 0.82,
  'us_stocks|intl_stocks': 0.80,
  'intl_stocks|emerging': 0.85,
  'gold|us_stocks': 0.05,     // gold is a genuine diversifier
  'tips|bonds': 0.80,
  'hy_bonds|us_stocks': 0.55, // high-yield behaves partly like stocks
  'savings|cd': 0.90,
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

// Public: correlation between two asset ids.
export function correlation(idA: string, idB: string): number {
  if (idA === idB) return 1;
  const override = PAIR_OVERRIDES[pairKey(idA, idB)];
  if (override !== undefined) return override;
  const a = ASSET_BY_ID[idA], b = ASSET_BY_ID[idB];
  if (!a || !b) return 0;
  return CATEGORY_CORR[a.category]?.[b.category] ?? 0;
}

// A portfolio holding: an asset id and the dollars held in it.
export type Holding = { assetId: string; dollars: number };
