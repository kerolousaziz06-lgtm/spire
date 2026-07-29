// ============================================================
// dcf.ts — the Vantage valuation engine (pure math).
//
// A DCF (Discounted Cash Flow) estimates what a company is worth
// TODAY by projecting its future free cash flows and discounting
// them back to the present (a dollar next year is worth less than a
// dollar today). It answers "what SHOULD this be worth?" — separate
// from the health analysis, which asks "is this a good business?".
//
// This is the textbook two-stage DCF:
//   Stage 1: project FCF growing at `growth` for `years`.
//   Stage 2: a terminal value capturing everything after, via the
//            Gordon Growth model.
//   Discount all of it at the discount rate (WACC-like) to today.
// ============================================================

export type DcfInput = {
  baseFcf: number;          // starting free cash flow (year 0)
  growth: number;           // annual FCF growth during the projection (0.08 = 8%)
  years: number;            // length of the explicit projection (e.g. 10)
  terminalGrowth: number;   // perpetual growth after year N (e.g. 0.025)
  discountRate: number;     // required return / WACC (e.g. 0.09)
  netDebt: number;          // total debt minus cash (to bridge to equity)
  sharesOutstanding: number;
  sharePrice: number;       // current market price, for comparison
};

export type DcfYear = { year: number; fcf: number; discounted: number };

export type DcfResult = {
  projected: DcfYear[];
  pvExplicit: number;       // present value of the projection years
  terminalValue: number;    // undiscounted terminal value at year N
  pvTerminal: number;       // its present value today
  enterpriseValue: number;  // pvExplicit + pvTerminal
  equityValue: number;      // enterprise value - net debt
  intrinsicPerShare: number;
  upside: number;           // (intrinsic - price) / price
  verdict: 'undervalued' | 'fair' | 'overvalued';
  terminalShare: number;    // what fraction of value is terminal (a caution flag)
};

export function runDcf(input: DcfInput): DcfResult {
  const { baseFcf, growth, years, terminalGrowth, discountRate,
          netDebt, sharesOutstanding, sharePrice } = input;

  // --- Stage 1: project and discount each year's FCF ---
  const projected: DcfYear[] = [];
  let pvExplicit = 0;
  let lastFcf = baseFcf;
  for (let y = 1; y <= years; y++) {
    const fcf = baseFcf * Math.pow(1 + growth, y);
    // discount factor = 1 / (1+r)^y  — turns a future dollar into today's
    const discounted = fcf / Math.pow(1 + discountRate, y);
    projected.push({ year: y, fcf, discounted });
    pvExplicit += discounted;
    lastFcf = fcf;
  }

  // --- Stage 2: terminal value via Gordon Growth ---
  // TV = FCF_(N+1) / (r - g) = lastFcf*(1+g) / (discount - terminalGrowth)
  // Represents the value of ALL cash flows beyond the projection.
  const denom = discountRate - terminalGrowth;
  const terminalValue = denom > 0 ? (lastFcf * (1 + terminalGrowth)) / denom : 0;
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, years);

  // --- Bridge to per-share intrinsic value ---
  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicPerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;

  const upside = sharePrice > 0 ? (intrinsicPerShare - sharePrice) / sharePrice : 0;
  const verdict: DcfResult['verdict'] =
    upside > 0.15 ? 'undervalued' : upside < -0.15 ? 'overvalued' : 'fair';

  const terminalShare = enterpriseValue > 0 ? pvTerminal / enterpriseValue : 0;

  return {
    projected, pvExplicit, terminalValue, pvTerminal,
    enterpriseValue, equityValue, intrinsicPerShare, upside, verdict, terminalShare,
  };
}

// ------------------------------------------------------------------
// Sensitivity grid: intrinsic value per share across a range of
// discount rates (columns) and terminal growth rates (rows). This is
// the classic "how much does my answer depend on my assumptions?"
// table every DCF should carry — because small assumption changes
// swing valuation a lot.
// ------------------------------------------------------------------
export type SensitivityCell = { discountRate: number; terminalGrowth: number; value: number };

export function dcfSensitivity(input: DcfInput): {
  discountRates: number[];
  terminalGrowths: number[];
  grid: SensitivityCell[][];
} {
  const discountRates = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => input.discountRate + d);
  const terminalGrowths = [-0.01, -0.005, 0, 0.005, 0.01].map((g) => input.terminalGrowth + g);

  const grid = terminalGrowths.map((tg) =>
    discountRates.map((dr) => {
      const r = runDcf({ ...input, discountRate: dr, terminalGrowth: tg });
      return { discountRate: dr, terminalGrowth: tg, value: r.intrinsicPerShare };
    })
  );

  return { discountRates, terminalGrowths, grid };
}
