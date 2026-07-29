// ============================================================
// retirement.ts — a compact retirement Monte Carlo.
//
// Reuses the SAME simulation ideas as the portfolio engine (random
// returns compounded over time), but adds the thing that makes
// retirement planning distinct: money flowing IN (contributions
// while working) and OUT (withdrawals in retirement). This surfaces
// "sequence-of-returns risk" — the order returns arrive in matters
// enormously once you're adding or removing money.
//
// It answers: "will my money last?" — the probability the balance
// survives to the end of the plan.
// ============================================================

// One standard-normal draw (Box–Muller), same as the portfolio engine.
function randNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type RetirementInput = {
  currentSavings: number;    // starting balance
  annualContribution: number; // added each working year
  yearsToRetire: number;     // years until retirement
  yearsInRetirement: number; // years drawing down
  annualSpending: number;    // withdrawn each retirement year (today's dollars)
  expReturn: number;         // portfolio expected return (e.g. 0.06)
  volatility: number;        // portfolio volatility (e.g. 0.12)
};

export type RetirementResult = {
  successRate: number;       // fraction of runs where money lasts
  medianEnding: number;      // median final balance
  p10Ending: number;         // pessimistic ending
  p90Ending: number;         // optimistic ending
  medianPath: number[];      // a representative balance path (by year)
  totalYears: number;
  retireAtYear: number;
};

export function runRetirement(input: RetirementInput, numPaths = 3000): RetirementResult {
  const {
    currentSavings, annualContribution, yearsToRetire, yearsInRetirement,
    annualSpending, expReturn, volatility,
  } = input;

  const totalYears = yearsToRetire + yearsInRetirement;
  const endings: number[] = [];
  const survived: boolean[] = [];
  // collect all paths to extract a median trajectory
  const allPaths: number[][] = [];

  for (let p = 0; p < numPaths; p++) {
    let balance = currentSavings;
    const path = [balance];
    let ranDry = false;

    for (let y = 0; y < totalYears; y++) {
      // log-normal annual return (same GBM style as the portfolio engine)
      const logR = (expReturn - 0.5 * volatility * volatility) + volatility * randNormal();
      balance *= Math.exp(logR);

      if (y < yearsToRetire) {
        balance += annualContribution;      // still working: add savings
      } else {
        balance -= annualSpending;          // retired: draw down
      }

      if (balance < 0) { balance = 0; ranDry = true; }
      path.push(balance);
    }

    endings.push(balance);
    survived.push(!ranDry && balance > 0);
    allPaths.push(path);
  }

  const successRate = survived.filter(Boolean).length / numPaths;

  const sortedEnds = [...endings].sort((a, b) => a - b);
  const pct = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];

  // Representative median path: the path whose ending is closest to median ending.
  const medEnd = pct(sortedEnds, 0.5);
  let bestIdx = 0, bestDiff = Infinity;
  allPaths.forEach((pth, i) => {
    const d = Math.abs(pth[pth.length - 1] - medEnd);
    if (d < bestDiff) { bestDiff = d; bestIdx = i; }
  });

  return {
    successRate,
    medianEnding: medEnd,
    p10Ending: pct(sortedEnds, 0.10),
    p90Ending: pct(sortedEnds, 0.90),
    medianPath: allPaths[bestIdx],
    totalYears,
    retireAtYear: yearsToRetire,
  };
}
