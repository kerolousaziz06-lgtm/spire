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
  color: string;      // swatch only; accent tokens are monochrome now
};

// The asset universe. Grouped by category for readability.
export const ASSETS: Asset[] = [
  // ---- Stocks & equity indexes ----
  { id: 'us_stocks',   name: 'S&P 500 (US Large Cap)', short: 'S&P 500',  category: 'stock', expReturn: 0.070, volatility: 0.155, color: '#E3D9C4' },
  { id: 'nasdaq',      name: 'Nasdaq 100 (QQQ)',       short: 'Nasdaq',   category: 'stock', expReturn: 0.085, volatility: 0.200, color: '#D9A55C' },
  { id: 'small_cap',   name: 'US Small Cap',           short: 'Small Cap',category: 'stock', expReturn: 0.075, volatility: 0.210, color: '#C2724F' },
  { id: 'intl_stocks', name: 'International Stocks',    short: 'Intl.',    category: 'stock', expReturn: 0.065, volatility: 0.170, color: '#A8607A' },
  { id: 'emerging',    name: 'Emerging Markets',       short: 'Emerging', category: 'stock', expReturn: 0.075, volatility: 0.240, color: '#8E6BA8' },

  // ---- Bonds & fixed income ----
  { id: 'bonds',       name: 'US Bonds (Aggregate)',   short: 'Bonds',    category: 'bond',  expReturn: 0.035, volatility: 0.055, color: '#6E86B8' },
  { id: 'tips',        name: 'Treasury TIPS',          short: 'TIPS',     category: 'bond',  expReturn: 0.030, volatility: 0.050, color: '#7FA8B5' },
  { id: 'hy_bonds',    name: 'High-Yield Bonds',       short: 'HY Bonds', category: 'bond',  expReturn: 0.050, volatility: 0.100, color: '#7FA98C' },

  // ---- Cash-like ----
  { id: 'savings',     name: 'Savings / HYSA',         short: 'Savings',  category: 'cashlike', expReturn: 0.040, volatility: 0.005, color: '#9DB86A' },
  { id: 'cd',          name: 'Certificate of Deposit', short: 'CD',       category: 'cashlike', expReturn: 0.045, volatility: 0.003, color: '#B9C29A' },
  { id: 'cash',        name: 'Cash (Checking)',        short: 'Cash',     category: 'cashlike', expReturn: 0.000, volatility: 0.000, color: '#9A9188' },

  // ---- Alternatives ----
  { id: 'reits',       name: 'Real Estate (REITs)',    short: 'REITs',    category: 'alt',   expReturn: 0.065, volatility: 0.190, color: '#B5799B' },
  { id: 'gold',        name: 'Gold',                   short: 'Gold',     category: 'alt',   expReturn: 0.040, volatility: 0.150, color: '#D4B36A' },
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

// ============================================================
// Correlation MATRIX construction — and why it needs repairing.
//
// correlation() above answers one pair at a time from hand-picked
// numbers: a category default, overridden where we know a specific pair
// better. Each value is reasonable on its own. A SET of independently
// chosen pairwise correlations, though, is not guaranteed to describe a
// world that can actually exist.
//
// A valid correlation matrix must be positive semi-definite. Informally:
// the correlations have to be mutually consistent. If A and B both move
// with C, then A and B cannot be strongly opposed to each other. Ours
// break that. Measured on this asset universe, the smallest eigenvalue
// turns negative once a portfolio holds 8 of them, reaching -0.32 for all
// 13. The strongest offending direction weights us_stocks +0.69 against
// hy_bonds -0.51 and nasdaq -0.28: us_stocks|hy_bonds is pinned at 0.55
// by an override while nasdaq|hy_bonds falls back to the stock/bond
// category default of -0.05, and no real market can do both.
//
// Everything downstream then breaks. Cholesky cannot decompose such a
// matrix, and portfolio variance can come out negative.
//
// So repair it to the nearest valid matrix before anyone uses it, using
// the spectral form of Higham's nearest-correlation-matrix method: take
// the eigendecomposition, lift any eigenvalue below a small floor up to
// it, rebuild, then rescale so the diagonal is exactly 1 again.
// ============================================================

// Floor for repaired eigenvalues. Not 0 and not 1e-12: Cholesky divides
// by the square root of these, so a near-zero floor produces a
// catastrophically ill-conditioned decomposition. Valid sub-matrices in
// this universe bottom out near 0.10, so 0.01 leaves conditioning intact
// while barely moving the matrix.
const MIN_EIGENVALUE = 0.01;

// Cyclic Jacobi eigensolver for symmetric matrices. Returns the
// eigenvalues and a matrix whose COLUMN i is the eigenvector for
// values[i]. Small, dependency-free, and exact enough for 13x13.
function jacobiEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-20) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-20) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

// Project a symmetric matrix onto the nearest valid correlation matrix.
// Returns the input untouched when it is already valid, so portfolios
// that were always fine keep their exact previous numbers.
export function nearestValidCorrelation(raw: number[][]): number[][] {
  const n = raw.length;
  if (n < 2) return raw.map((r) => r.slice());

  const { values, vectors } = jacobiEigen(raw);
  if (Math.min(...values) >= MIN_EIGENVALUE) return raw.map((r) => r.slice());

  const lifted = values.map((x) => Math.max(x, MIN_EIGENVALUE));

  // Rebuild: C' = V diag(lifted) V^T
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i][k] * lifted[k] * vectors[j][k];
      out[i][j] = s;
      out[j][i] = s;
    }
  }

  // Rescale to unit diagonal. This is a congruence transform by a
  // positive diagonal, so it preserves positive definiteness.
  const d = out.map((row, i) => Math.sqrt(row[i]));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i][j] /= d[i] * d[j];
    out[i][i] = 1;
  }
  return out;
}

// Memoised because computeFrontier asks for the same matrix 800 times per
// render. Keyed on the ids in order, since a different order is a
// different (permuted) matrix.
const matrixCache = new Map<string, number[][]>();

// The only correlation matrix anyone downstream should use. Guaranteed
// positive definite.
export function correlationMatrix(ids: string[]): number[][] {
  const key = ids.join('|');
  const hit = matrixCache.get(key);
  if (hit) return hit;

  const raw = ids.map((a) => ids.map((b) => (a === b ? 1 : correlation(a, b))));
  const fixed = nearestValidCorrelation(raw);

  if (matrixCache.size > 512) matrixCache.clear();
  matrixCache.set(key, fixed);
  return fixed;
}

// A portfolio holding: an asset id and the dollars held in it.
export type Holding = { assetId: string; dollars: number };
