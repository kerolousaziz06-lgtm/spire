// ============================================================
// montecarlo.ts — the simulation engine (the "calculator brain").
//
// GOAL: given a portfolio (how much money in each asset), simulate
// thousands of possible futures over N years and report the range
// of where the money could end up.
//
// The whole thing is built from a few small, honest pieces:
//   1. randNormal()      — draw one random number from a bell curve
//   2. choleskyDecompose — a trick to make random draws CORRELATED
//   3. simulateOnePath   — roll one possible future, year by year
//   4. runSimulation     — do that thousands of times, collect stats
//
// These are PURE functions: same input -> same kind of output, no
// screen/UI involved. That makes them easy to test and reason about.
// ============================================================

import { ASSET_BY_ID, correlation, type Holding } from './assets';
export type { Holding };

export type SimulationInput = {
  holdings: Holding[];   // what the user owns
  years: number;         // how far into the future (e.g. 10)
  numPaths: number;      // how many futures to simulate (e.g. 5000)
};

export type SimulationResult = {
  startValue: number;
  years: number;
  numPaths: number;
  // For each year (0..years), the percentile bands across all paths.
  // These are what the fan chart draws.
  bands: {
    year: number;
    p5: number; p25: number; p50: number; p75: number; p95: number;
  }[];
  // Final-year summary stats
  median: number;
  p5: number;    // worst-case-ish (5th percentile)
  p95: number;   // best-case-ish (95th percentile)
  probLoss: number;      // fraction of paths ending below start
  totalReturnPct: number; // median total return vs start
  // Typical worst peak-to-trough drop within a path (median across
  // paths of each path's own max drawdown). A REAL drawdown number.
  medianMaxDrawdown: number;
  // A few sample individual paths, for drawing faint "spaghetti" lines
  samplePaths: number[][];
};

// ------------------------------------------------------------------
// 1. randNormal — one random draw from a standard normal (bell curve)
//    mean 0, standard deviation 1.
//
// JavaScript's Math.random() gives a FLAT number in [0,1) — every
// value equally likely. But real returns cluster near the average
// and rarely go extreme — a bell shape. The Box–Muller transform
// converts two flat randoms into one bell-curve random. This is the
// bridge from "flat dice" to "realistic returns."
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// 1. randNormal — one draw from a standard normal (bell curve),
//    mean 0, standard deviation 1, via the Box–Muller transform.
//    Math.random() is FLAT; real returns cluster near the mean in a
//    bell shape, so we convert two flat draws into one bell-curve draw.
// ------------------------------------------------------------------
function randNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // avoid 0 (log(0) is -Infinity)
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ------------------------------------------------------------------
// 1b. randFatTail — a FAT-TAILED draw (Student's t-distribution).
//
// A pure normal curve badly understates crash risk: it says a −30%
// year is essentially impossible, yet those happen. Real return
// distributions have "fat tails" — extreme moves occur far more
// often than a bell curve predicts. The Student's t-distribution
// captures this with a "degrees of freedom" (ν) parameter: low ν =
// fatter tails, and as ν→∞ it becomes the normal curve.
//
// We build a t-draw as: normal / sqrt(chi-square(ν)/ν). Then we
// RESCALE by sqrt((ν-2)/ν) so the distribution still has standard
// deviation 1 — that way our volatility inputs stay calibrated and
// only the TAIL SHAPE changes, not the overall spread.
// ------------------------------------------------------------------
const T_DOF = 5; // degrees of freedom: 5 gives realistically fat tails

function randChiSquare(k: number): number {
  // Sum of k squared standard normals ~ chi-square with k dof.
  let s = 0;
  for (let i = 0; i < k; i++) { const z = randNormal(); s += z * z; }
  return s;
}

function randFatTail(): number {
  const z = randNormal();
  const chi = randChiSquare(T_DOF);
  const tRaw = z / Math.sqrt(chi / T_DOF);      // raw Student's t
  const rescale = Math.sqrt((T_DOF - 2) / T_DOF); // so std dev stays ~1
  return tRaw * rescale;
}

// ------------------------------------------------------------------
// 2. choleskyDecompose — the "make randoms move together" trick.
//
// If we drew each asset's random return independently, bonds and
// stocks would wander with no relationship — unrealistic. We want
// them CORRELATED (stocks down often means bonds flat/up).
//
// Cholesky takes the correlation matrix and produces a lower-triangular
// matrix L. When we multiply independent bell-curve draws by L, the
// results come out with exactly the correlations we asked for. You
// don't need to memorize the math — think of L as a "mixing recipe"
// that blends independent randoms into correlated ones.
// ------------------------------------------------------------------
function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        // Guard against tiny negative from floating point -> sqrt NaN
        L[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 1e-12));
      } else {
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// Build the correlation matrix for just the assets in this portfolio,
// in the given order.
function buildCorrMatrix(assetIds: string[]): number[][] {
  return assetIds.map((a) => assetIds.map((b) => (a === b ? 1 : correlation(a, b))));
}

// Multiply the mixing matrix L by a vector of independent draws z,
// giving correlated draws. (Standard matrix-times-vector.)
function correlate(L: number[][], z: number[]): number[] {
  const n = L.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
    out[i] = s;
  }
  return out;
}

// ------------------------------------------------------------------
// 3. simulateOnePath — roll a single possible future.
//
// Start with the user's dollars. For each year, draw a correlated
// random return for each asset, grow that asset's dollars by its
// return, and record the new total. Return the yearly totals.
// ------------------------------------------------------------------
function simulateOnePath(
  holdings: Holding[],
  years: number,
  L: number[][]
): number[] {
  // Current dollars in each asset (a copy we mutate as years pass).
  let values = holdings.map((h) => h.dollars);
  const assets = holdings.map((h) => ASSET_BY_ID[h.assetId]);

  const path: number[] = [values.reduce((a, b) => a + b, 0)]; // year 0 = start

  for (let year = 0; year < years; year++) {
    // one independent FAT-TAILED draw per asset (realistic extremes)...
    const z = assets.map(() => randFatTail());
    // ...blended into correlated draws by the mixing recipe.
    const correlated = correlate(L, z);

    for (let a = 0; a < assets.length; a++) {
      const asset = assets[a];
      // GEOMETRIC (log-normal) returns. Real asset prices follow
      // geometric Brownian motion: they compound multiplicatively and
      // can fall steeply but NEVER below zero. We model the log-return
      // as normal, then exponentiate. The −0.5·σ² term is the standard
      // "volatility drag" / Itô correction, so the AVERAGE compounded
      // return still matches the asset's expected return rather than
      // drifting high. This is the textbook GBM formulation.
      const mu = asset.expReturn;
      const sigma = asset.volatility;
      const logReturn = (mu - 0.5 * sigma * sigma) + sigma * correlated[a];
      values[a] = values[a] * Math.exp(logReturn); // always > 0
    }
    path.push(values.reduce((a, b) => a + b, 0)); // total after this year
  }
  return path;
}

// ------------------------------------------------------------------
// small helper: the p-th percentile of a sorted array.
// percentile(sorted, 0.5) = median; 0.05 = 5th percentile; etc.
// ------------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ------------------------------------------------------------------
// 4. runSimulation — the public function. Runs many paths and
//    summarizes them into the bands + stats the UI needs.
// ------------------------------------------------------------------
export function runSimulation(input: SimulationInput): SimulationResult {
  const { holdings, years, numPaths } = input;
  const active = holdings.filter((h) => h.dollars > 0 && ASSET_BY_ID[h.assetId]);
  const startValue = active.reduce((sum, h) => sum + h.dollars, 0);

  // Edge case: nothing invested -> flat result, no simulation needed.
  if (active.length === 0 || startValue === 0) {
    const flat = Array.from({ length: years + 1 }, (_, y) => ({
      year: y, p5: 0, p25: 0, p50: 0, p75: 0, p95: 0,
    }));
    return { startValue: 0, years, numPaths, bands: flat, median: 0, p5: 0, p95: 0,
             probLoss: 0, totalReturnPct: 0, medianMaxDrawdown: 0, samplePaths: [] };
  }

  // Prepare the correlation mixing recipe ONCE (not per path — faster).
  const corr = buildCorrMatrix(active.map((h) => h.assetId));
  const L = choleskyDecompose(corr);

  // Run all the paths. allPaths[i] is one future's yearly totals.
  const allPaths: number[][] = [];
  for (let i = 0; i < numPaths; i++) {
    allPaths.push(simulateOnePath(active, years, L));
  }

  // For each year, gather every path's value and compute percentiles.
  const bands = [];
  for (let y = 0; y <= years; y++) {
    const col = allPaths.map((p) => p[y]).sort((a, b) => a - b);
    bands.push({
      year: y,
      p5: percentile(col, 0.05),
      p25: percentile(col, 0.25),
      p50: percentile(col, 0.50),
      p75: percentile(col, 0.75),
      p95: percentile(col, 0.95),
    });
  }

  // Final-year summary.
  const finals = allPaths.map((p) => p[years]).sort((a, b) => a - b);
  const median = percentile(finals, 0.5);
  const p5 = percentile(finals, 0.05);
  const p95 = percentile(finals, 0.95);
  const lossCount = finals.filter((v) => v < startValue).length;
  const probLoss = lossCount / finals.length;
  const totalReturnPct = (median - startValue) / startValue;

  // REAL max drawdown: for each path, walk it tracking the running
  // peak and the largest drop below that peak. Then take the median
  // across paths — a genuine simulation-based figure that replaces
  // the old volatility×2.5 guess.
  const pathDrawdowns = allPaths.map((p) => {
    let peak = p[0], maxDD = 0;
    for (const v of p) {
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }).sort((a, b) => a - b);
  const medianMaxDrawdown = percentile(pathDrawdowns, 0.5);

  // Keep a handful of full paths for the faint "spaghetti" lines.
  const samplePaths = allPaths.slice(0, 40);

  return { startValue, years, numPaths, bands, median, p5, p95,
           probLoss, totalReturnPct, medianMaxDrawdown, samplePaths };
}
