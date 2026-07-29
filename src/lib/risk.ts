// ============================================================
// risk.ts — portfolio-level risk statistics (analytic, not simulated).
//
// These are the classic risk numbers, computed directly from the
// portfolio weights and the asset assumptions:
//   • volatility  — the portfolio's standard deviation of return,
//                   accounting for correlation (diversification!)
//   • sharpe      — return earned per unit of risk
//   • maxDrawdown — a rough estimate of a plausible peak-to-trough drop
//
// Each also gets a 0..1 "level" so the UI bars know how full to draw.
// ============================================================
import { ASSET_BY_ID, correlation, type Holding } from './assets';

const RISK_FREE = 0.02; // ~2% risk-free rate for the Sharpe ratio

export type RiskProfile = {
  expReturn: number;
  volatility: number;
  sharpe: number;
  volatilityLevel: number;
  sharpeLevel: number;
};

export function computeRiskProfile(holdings: Holding[]): RiskProfile {
  const active = holdings.filter((h) => h.dollars > 0 && ASSET_BY_ID[h.assetId]);
  const total = active.reduce((s, h) => s + h.dollars, 0);

  if (total === 0 || active.length === 0) {
    return { expReturn: 0, volatility: 0, sharpe: 0,
             volatilityLevel: 0, sharpeLevel: 0 };
  }

  // Portfolio weights (fraction of total in each asset).
  const weights = active.map((h) => h.dollars / total);
  const assets = active.map((h) => ASSET_BY_ID[h.assetId]);

  // Expected return = weighted average of each asset's expected return.
  const expReturn = assets.reduce((s, a, i) => s + weights[i] * a.expReturn, 0);

  // Portfolio variance = double sum over assets of
  //   w_i * w_j * vol_i * vol_j * correlation(i,j).
  // This is the formula that makes diversification real: when
  // correlation between two assets is low or negative, their combined
  // variance is LESS than the weighted average of the individual ones.
  let variance = 0;
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      const corr = i === j ? 1 : correlation(assets[i].id, assets[j].id);
      variance += weights[i] * weights[j] * assets[i].volatility * assets[j].volatility * corr;
    }
  }
  const volatility = Math.sqrt(Math.max(variance, 0));

  // Sharpe ratio = (return - risk-free) / volatility.
  const sharpe = volatility > 0 ? (expReturn - RISK_FREE) / volatility : 0;

  // Convert each to a 0..1 bar level against sensible reference maxima.
  const volatilityLevel = Math.min(1, volatility / 0.25); // 25% vol = full bar
  const sharpeLevel = Math.min(1, Math.max(0, sharpe / 1.5)); // Sharpe 1.5 = full

  return { expReturn, volatility, sharpe, volatilityLevel, sharpeLevel };
}

// ============================================================
// Efficient frontier support.
//
// Modern Portfolio Theory (Markowitz): for a set of assets, plotting
// every possible mix by RISK (x, volatility) vs RETURN (y) fills a
// region whose upper-left edge is the "efficient frontier" — the best
// achievable return for each level of risk. We approximate it by
// generating many random-weight portfolios and computing each one's
// (risk, return) with the SAME formulas the risk panel uses.
// ============================================================

export type FrontierPoint = { risk: number; ret: number };

// Expected return + volatility for an arbitrary set of weighted assets.
function riskReturnForWeights(assetIds: string[], weights: number[]): FrontierPoint {
  const assets = assetIds.map((id) => ASSET_BY_ID[id]);
  const ret = assets.reduce((s, a, i) => s + weights[i] * a.expReturn, 0);
  let variance = 0;
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      const corr = i === j ? 1 : correlation(assets[i].id, assets[j].id);
      variance += weights[i] * weights[j] * assets[i].volatility * assets[j].volatility * corr;
    }
  }
  return { risk: Math.sqrt(Math.max(variance, 0)), ret };
}

// Generate a cloud of random portfolios plus the current one.
export function computeFrontier(holdings: Holding[], samples = 800): {
  cloud: FrontierPoint[];
  current: FrontierPoint | null;
} {
  const active = holdings.filter((h) => h.dollars > 0 && ASSET_BY_ID[h.assetId]);
  const ids = active.map((h) => h.assetId);
  if (ids.length < 2) {
    // With <2 assets there's no frontier to trace.
    if (ids.length === 1) {
      const p = riskReturnForWeights(ids, [1]);
      return { cloud: [p], current: p };
    }
    return { cloud: [], current: null };
  }

  const cloud: FrontierPoint[] = [];
  for (let s = 0; s < samples; s++) {
    // random weights via normalized exponentials (Dirichlet-ish spread)
    const raw = ids.map(() => -Math.log(Math.random() + 1e-9));
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = raw.map((x) => x / sum);
    cloud.push(riskReturnForWeights(ids, w));
  }

  // The user's actual mix.
  const total = active.reduce((s, h) => s + h.dollars, 0);
  const curW = active.map((h) => h.dollars / total);
  const current = riskReturnForWeights(ids, curW);

  return { cloud, current };
}
