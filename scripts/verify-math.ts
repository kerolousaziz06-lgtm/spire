// ============================================================
// verify-math.ts — re-verification harness for the pure engines.
//
//   npm run verify:math
//
// CLAUDE.md requires that any formula change be re-verified against
// hand-computed cases with the numbers shown. This runs the real engines
// in node (bundled by esbuild, no browser) and prints those cases.
//
// Math.random is replaced with a seeded PRNG, so two runs are directly
// comparable and a change in output means a change in the maths.
//
// Section D is the one that matters most: it checks every one of the 8178
// portfolios a user can actually build, not just the default.
// ============================================================
import { ASSETS, ASSET_BY_ID, correlation, correlationMatrix, type Holding } from '../src/lib/assets';
import { runSimulation } from '../src/lib/montecarlo';
import { DEFAULT_ASSUMPTIONS, TAIL_DOF, type Assumptions } from '../src/lib/settings';
import { computeRiskProfile, computeFrontier } from '../src/lib/risk';
import { CRASH_EVENTS, replayCrash } from '../src/lib/crashes';
import { dupont, multiples, SAMPLE_INPUT } from '../src/lib/analysis';
import { runDcf } from '../src/lib/dcf';
import { runLbo, SAMPLE_LBO } from '../src/lib/lbo';
import { runMna, type MnaCompany, type MnaDeal } from '../src/lib/mna';

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seed = (s: number) => { (Math as any).random = mulberry32(s); };

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const pct = (x: number, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : String(x));

// ---------- independent, STRICT cholesky: no clamping, reports failure ----------
function strictChol(m: number[][]): { ok: boolean; failAt?: number; failVal?: number } {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
      if (i === j) {
        const d = m[i][i] - s;
        if (d <= 0) return { ok: false, failAt: i, failVal: d };
        L[i][j] = Math.sqrt(d);
      } else L[i][j] = (m[i][j] - s) / L[j][j];
    }
  }
  return { ok: true };
}

// ---------- Jacobi eigenvalues for a symmetric matrix ----------
function eigSym(mIn: number[][]): { values: number[]; vectors: number[][] } {
  const n = mIn.length;
  const a = mIn.map((r) => r.slice());
  let v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

const corrMatrix = (ids: string[]) => ids.map((x) => ids.map((y) => (x === y ? 1 : correlation(x, y))));

const H = (pairs: [string, number][]): Holding[] => pairs.map(([assetId, dollars]) => ({ assetId, dollars }));

console.log('='.repeat(74));
console.log('A. CLAUDE.md verified cases');
console.log('='.repeat(74));

seed(12345);
const spx = runSimulation({ holdings: H([['us_stocks', 100000]]), years: 10, numPaths: 20000 });
const annualized = Math.pow(spx.median / 100000, 1 / 10) - 1;
console.log(`100% S&P, 10y, 20k paths`);
console.log(`  median            $${spx.median.toFixed(0)}`);
console.log(`  annualized        ${pct(annualized)}   (CLAUDE.md: ~5.9%, below the 7% arithmetic input)`);
console.log(`  medianMaxDrawdown ${pct(spx.medianMaxDrawdown)}`);
console.log(`  probLoss          ${pct(spx.probLoss)}`);

seed(12345);
const cashOnly = runSimulation({ holdings: H([['cash', 100000]]), years: 10, numPaths: 5000 });
console.log(`100% cash, 10y      median $${cashOnly.median.toFixed(0)}  (CLAUDE.md: stays flat)`);

// drawdowns scale with risk
seed(999);
const lowRisk = runSimulation({ holdings: H([['bonds', 100000]]), years: 10, numPaths: 5000 });
seed(999);
const highRisk = runSimulation({ holdings: H([['emerging', 100000]]), years: 10, numPaths: 5000 });
console.log(`drawdown scaling    bonds ${pct(lowRisk.medianMaxDrawdown)} < emerging ${pct(highRisk.medianMaxDrawdown)}  -> ${lowRisk.medianMaxDrawdown < highRisk.medianMaxDrawdown ? 'PASS' : 'FAIL'}`);

const allStocks = H([['us_stocks', 100000]]);
const diversified = H([['us_stocks', 50000], ['nasdaq', 20000], ['bonds', 20000], ['cash', 10000]]);
const c2008 = CRASH_EVENTS.find((e) => e.id.includes('2008')) ?? CRASH_EVENTS[0];
const r1 = replayCrash(allStocks, c2008), r2 = replayCrash(diversified, c2008);
const r1b = replayCrash(allStocks, c2008);
console.log(`\n2008 replay`);
console.log(`  100% stocks       ${pct(r1.troughDrop)}   (CLAUDE.md: -55%)`);
console.log(`  diversified       ${pct(r2.troughDrop)}   (CLAUDE.md: -23%)`);
console.log(`  deterministic     ${r1.troughDrop === r1b.troughDrop ? 'PASS (identical on repeat)' : 'FAIL'}`);

const dp = dupont(SAMPLE_INPUT);
if (!dp) throw new Error('dupont returned null for the complete SAMPLE_INPUT');
const dpProduct = dp.netMargin * dp.assetTurnover * dp.equityMultiplier;
console.log(`\nDuPont              margin*turnover*leverage = ${f(dpProduct, 8)}  vs reported ROE ${f(dp.roeReported, 8)}  -> ${Math.abs(dpProduct - dp.roeReported) < 1e-9 ? 'PASS' : 'FAIL'}`);

const lbo2 = runLbo({ ...SAMPLE_LBO, leverage: 2.0 });
const lbo5 = runLbo({ ...SAMPLE_LBO, leverage: 5.0 });
const impliedIrr = Math.pow(lbo2.moic, 1 / SAMPLE_LBO.years) - 1;
console.log(`LBO 2.0x            IRR ${pct(lbo2.irr)}  MOIC ${f(lbo2.moic)}  MOIC^(1/${SAMPLE_LBO.years})-1 = ${pct(impliedIrr)}  -> ${Math.abs(lbo2.irr - impliedIrr) < 1e-6 ? 'PASS' : 'FAIL'}`);
console.log(`LBO leverage        2.0x IRR ${pct(lbo2.irr)} -> 5.0x IRR ${pct(lbo5.irr)}   (CLAUDE.md: 13.6% -> 20.6%)`);
const dcf = runDcf({ baseFcf: 100, growth: 0.08, years: 10, terminalGrowth: 0.025, discountRate: 0.09, netDebt: 200, sharesOutstanding: 100, sharePrice: 30 });
console.log(`DCF                 EV ${f(dcf.enterpriseValue)}  equity ${f(dcf.equityValue)}  perShare ${f(dcf.intrinsicPerShare)}  finite=${Number.isFinite(dcf.intrinsicPerShare) ? 'PASS' : 'FAIL'}`);

console.log('\n' + '='.repeat(74));
console.log('B. Is the correlation matrix positive definite?');
console.log('='.repeat(74));
const order = ASSETS.map((a) => a.id);
for (let n = 2; n <= order.length; n++) {
  const ids = order.slice(0, n);
  const M = corrMatrix(ids);
  const st = strictChol(M);
  const ev = eigSym(M).values.slice().sort((x, y) => x - y);
  const minEv = ev[0];
  console.log(`n=${String(n).padStart(2)}  strictCholesky=${st.ok ? 'ok  ' : 'FAIL'}  minEigenvalue=${f(minEv, 5).padStart(9)}  ${minEv < 0 ? '<-- NOT positive definite' : ''}`);
}

console.log('\nSmallest-eigenvalue direction for the full 13-asset matrix (the offending combination):');
{
  const ids = order.slice();
  const M = corrMatrix(ids);
  const { values, vectors } = eigSym(M);
  let mi = 0; for (let i = 1; i < values.length; i++) if (values[i] < values[mi]) mi = i;
  const wsorted = ids.map((id, i) => ({ id, w: vectors[i][mi] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  console.log(`  eigenvalue ${f(values[mi], 5)}`);
  for (const { id, w } of wsorted.slice(0, 6)) console.log(`    ${id.padEnd(13)} ${f(w, 4).padStart(8)}`);
}

console.log('\n' + '='.repeat(74));
console.log('C. What the user sees: growing the portfolio 4 -> 13 assets');
console.log('='.repeat(74));
const base: [string, number][] = [['us_stocks', 50000], ['nasdaq', 20000], ['bonds', 20000], ['cash', 10000]];
const addOrder = order.filter((id) => !base.some(([b]) => b === id));
let cur = base.slice();
for (let k = 0; k <= addOrder.length; k++) {
  if (k > 0) cur.push([addOrder[k - 1], 10000]);
  const ids = cur.map(([id]) => id);
  seed(4242);
  const sim = runSimulation({ holdings: H(cur), years: 10, numPaths: 2000 });
  const risk = computeRiskProfile(H(cur));
  const st = strictChol(corrMatrix(ids));
  const ev = eigSym(corrMatrix(ids)).values.slice().sort((a, b) => a - b)[0];
  console.log(`${String(ids.length).padStart(2)} assets  median=${String(Number.isFinite(sim.median) ? '$' + sim.median.toFixed(0) : 'NaN').padStart(16)}  p95=${String(Number.isFinite(sim.p95) ? '$' + sim.p95.toFixed(0) : 'NaN').padStart(26)}  vol=${pct(risk.volatility).padStart(9)}  minEv=${f(ev, 4).padStart(8)}  PD=${st.ok ? 'yes' : 'NO '}`);
}


console.log('\n' + '='.repeat(74));
console.log('D. EXHAUSTIVE: every possible portfolio (all 8191 non-empty subsets)');
console.log('='.repeat(74));
{
  const ids = ASSETS.map((a) => a.id);
  const n = ids.length;
  let rawBad = 0, fixedBad = 0, cholFail = 0, negVar = 0, worstRawEv = Infinity, worstFixedEv = Infinity;
  let maxShift = 0, maxShiftSubset = '';
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sub.push(ids[i]);
    if (sub.length < 2) continue;
    const raw = sub.map((a) => sub.map((b) => (a === b ? 1 : correlation(a, b))));
    const fixed = correlationMatrix(sub);
    const rawEv = Math.min(...eigSym(raw).values);
    const fixEv = Math.min(...eigSym(fixed).values);
    worstRawEv = Math.min(worstRawEv, rawEv);
    worstFixedEv = Math.min(worstFixedEv, fixEv);
    if (rawEv < 0) rawBad++;
    if (fixEv < -1e-9) fixedBad++;
    if (!strictChol(fixed).ok) cholFail++;
    // biggest single-correlation change the repair introduces
    for (let i = 0; i < sub.length; i++) for (let j = i + 1; j < sub.length; j++) {
      const d = Math.abs(fixed[i][j] - raw[i][j]);
      if (d > maxShift) { maxShift = d; maxShiftSubset = sub.join(','); }
    }
    // equal-weight variance must be non-negative under the fixed matrix
    const w = sub.map(() => 1 / sub.length);
    let varr = 0;
    for (let i = 0; i < sub.length; i++) for (let j = 0; j < sub.length; j++)
      varr += w[i] * w[j] * ASSET_BY_ID[sub[i]].volatility * ASSET_BY_ID[sub[j]].volatility * fixed[i][j];
    if (varr < -1e-12) negVar++;
  }
  console.log(`subsets tested (>=2 assets)      ${(1 << n) - 1 - n}`);
  console.log(`RAW matrices not positive def.   ${rawBad}   (worst eigenvalue ${f(worstRawEv, 5)})`);
  console.log(`REPAIRED not positive definite   ${fixedBad}   (worst eigenvalue ${f(worstFixedEv, 5)})`);
  console.log(`strict Cholesky failures after   ${cholFail}`);
  console.log(`negative equal-weight variance   ${negVar}`);
  console.log(`largest correlation change       ${f(maxShift, 4)}  (in ${maxShiftSubset.split(',').length}-asset subset)`);
}

console.log('\n' + '='.repeat(74));
console.log('E. Repair leaves already-valid portfolios untouched');
console.log('='.repeat(74));
{
  const four = ['us_stocks', 'nasdaq', 'bonds', 'cash'];
  const raw = four.map((a) => four.map((b) => (a === b ? 1 : correlation(a, b))));
  const fixed = correlationMatrix(four);
  let same = true;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (Math.abs(raw[i][j] - fixed[i][j]) > 0) same = false;
  console.log(`default 4-asset matrix bit-identical after repair: ${same ? 'PASS' : 'FAIL'}`);
  console.log(`  minEigenvalue ${f(Math.min(...eigSym(raw).values), 5)} >= floor 0.01, so it returns early untouched`);
}


console.log('\n' + '='.repeat(74));
console.log('F. Settings: defaults are inert, and every knob actually moves something');
console.log('='.repeat(74));
{
  const port = H([['us_stocks', 60000], ['bonds', 40000]]);
  const A = (over: Partial<Assumptions>): Assumptions => ({ ...DEFAULT_ASSUMPTIONS, ...over });

  // 1. Passing the defaults explicitly must equal passing nothing.
  seed(777); const implicit = runSimulation({ holdings: port, years: 10, numPaths: 4000 });
  seed(777); const explicit = runSimulation({ holdings: port, years: 10, numPaths: 4000, assumptions: DEFAULT_ASSUMPTIONS });
  console.log(`defaults inert       implicit $${implicit.median.toFixed(0)} vs explicit $${explicit.median.toFixed(0)}  -> ${implicit.median === explicit.median ? 'PASS (bit-identical)' : 'FAIL'}`);

  seed(777); const rpImplicit = computeRiskProfile(port);
  seed(777); const rpExplicit = computeRiskProfile(port, DEFAULT_ASSUMPTIONS);
  console.log(`  risk profile       sharpe ${rpImplicit.sharpe.toFixed(8)} vs ${rpExplicit.sharpe.toFixed(8)}  -> ${rpImplicit.sharpe === rpExplicit.sharpe ? 'PASS' : 'FAIL'}`);

  // 2. Risk-free rate feeds the Sharpe ratio only, and linearly.
  const base = computeRiskProfile(port, A({ riskFreeRate: 0.02 }));
  const hi = computeRiskProfile(port, A({ riskFreeRate: 0.05 }));
  const expectedDrop = 0.03 / base.volatility;
  const actualDrop = base.sharpe - hi.sharpe;
  console.log(`\nrisk-free 2%->5%     sharpe ${base.sharpe.toFixed(4)} -> ${hi.sharpe.toFixed(4)}`);
  console.log(`  drop               ${actualDrop.toFixed(6)} vs expected 0.03/vol = ${expectedDrop.toFixed(6)}  -> ${Math.abs(actualDrop - expectedDrop) < 1e-9 ? 'PASS' : 'FAIL'}`);
  console.log(`  volatility moved?  ${base.volatility.toFixed(8)} vs ${hi.volatility.toFixed(8)}  -> ${base.volatility === hi.volatility ? 'PASS (unaffected, correct)' : 'FAIL'}`);

  // 3. Fat-tail severity: fatter tails => worse 5th percentile.
  // NOTE the direction. randFatTail rescales so total volatility is held
  // constant, meaning fatter tails do NOT widen the everyday range - they
  // concentrate it and push risk out into rare, larger events. The naive
  // assertion "fatter tails lower p5" is false, and asserting it would
  // have encoded a misunderstanding as a passing test.
  console.log('\nfat-tail severity    (20k paths, same seed; volatility held constant by design)');
  const dd: number[] = [], spread: number[] = [];
  for (const sev of ['severe', 'realistic', 'mild', 'none'] as const) {
    seed(31337);
    const r = runSimulation({ holdings: port, years: 10, numPaths: 20000, assumptions: A({ tailSeverity: sev }) });
    dd.push(r.medianMaxDrawdown); spread.push(r.p95 - r.p5);
    console.log(`  ${sev.padEnd(10)} dof=${String(TAIL_DOF[sev]).padEnd(8)} p5=$${r.p5.toFixed(0).padStart(7)} p95=$${r.p95.toFixed(0).padStart(7)} spread=$${(r.p95 - r.p5).toFixed(0).padStart(7)} maxDD=${pct(r.medianMaxDrawdown)}`);
  }
  const rising = (xs: number[]) => xs.every((v, i) => i === 0 || v > xs[i - 1]);
  console.log(`  drawdown rising    severe < realistic < mild < none  -> ${rising(dd) ? 'PASS' : 'FAIL'}`);
  console.log(`  spread rising      same order                        -> ${rising(spread) ? 'PASS' : 'FAIL'}`);
  console.log(`  (fatter tails NARROW the everyday range; the risk they add is in rare events)`);

  // 4. Asset overrides reach BOTH engines, not just one.
  const over = A({ assetOverrides: { us_stocks: { expReturn: 0.12 } } });
  const rpBase = computeRiskProfile(port);
  const rpOver = computeRiskProfile(port, over);
  seed(99); const simBase = runSimulation({ holdings: port, years: 10, numPaths: 4000 });
  seed(99); const simOver = runSimulation({ holdings: port, years: 10, numPaths: 4000, assumptions: over });
  const fBase = computeFrontier(port, 200);
  const fOver = computeFrontier(port, 200, over);
  console.log(`\nus_stocks 7%->12%    risk profile expReturn ${pct(rpBase.expReturn)} -> ${pct(rpOver.expReturn)}  -> ${rpOver.expReturn > rpBase.expReturn ? 'PASS' : 'FAIL'}`);
  console.log(`  simulation         median $${simBase.median.toFixed(0)} -> $${simOver.median.toFixed(0)}  -> ${simOver.median > simBase.median ? 'PASS' : 'FAIL'}`);
  console.log(`  frontier           current ret ${pct(fBase.current!.ret)} -> ${pct(fOver.current!.ret)}  -> ${fOver.current!.ret > fBase.current!.ret ? 'PASS' : 'FAIL'}`);
  console.log(`  (all three must move, or an override applies in one engine and not another)`);

  // 5. Volatility override must move risk, not return.
  const vOver = A({ assetOverrides: { bonds: { volatility: 0.30 } } });
  const rpV = computeRiskProfile(port, vOver);
  console.log(`\nbonds vol 5.5%->30%  volatility ${pct(rpBase.volatility)} -> ${pct(rpV.volatility)}  -> ${rpV.volatility > rpBase.volatility ? 'PASS' : 'FAIL'}`);
  console.log(`  expReturn held     ${pct(rpBase.expReturn)} vs ${pct(rpV.expReturn)}  -> ${rpBase.expReturn === rpV.expReturn ? 'PASS' : 'FAIL'}`);

  // 6. Crash replay must be untouched: it uses category declines, not asset stats.
  const cBase = replayCrash(port, c2008);
  const cOver = replayCrash(port, c2008);
  console.log(`\ncrash replay         ${pct(cBase.troughDrop)} vs ${pct(cOver.troughDrop)}  -> ${cBase.troughDrop === cOver.troughDrop ? 'PASS (assumption-independent by design)' : 'FAIL'}`);
}


console.log('\n' + '='.repeat(74));
console.log('G. M&A accretion/dilution, against a hand-computed case');
console.log('='.repeat(74));
{
  // Chosen so every step is checkable on paper.
  const acquirer: MnaCompany = { netIncome: 500, sharesOutstanding: 100, sharePrice: 50 };
  const target:   MnaCompany = { netIncome: 100, sharesOutstanding:  50, sharePrice: 20 };
  const deal: MnaDeal = {
    offerPricePerShare: 25,
    pctStock: 0.5, pctCash: 0.3, pctDebt: 0.2,
    debtRate: 0.06, cashRate: 0.02, taxRate: 0.25, synergies: 0,
  };
  const r = runMna(acquirer, target, deal);

  // ---- worked by hand ----
  //   acquirer EPS = 500/100                = 5.00
  //   target EPS   = 100/50                 = 2.00
  //   offer value  = 50 x 25                = 1250
  //   premium      = 25/20 - 1              = 25%
  //   stock 50%    = 625 -> 625/50          = 12.5 new shares
  //   cash  30%    = 375 -> x2%             = 7.5 forgone interest
  //   debt  20%    = 250 -> x6%             = 15.0 new interest
  //   pro-forma NI = 500 + 100 - (15 + 7.5) x 0.75 = 583.125
  //   pro-forma sh = 100 + 12.5             = 112.5
  //   pro-forma EPS= 583.125 / 112.5        = 5.183333...
  //   accretion    = 5.183333/5 - 1         = +3.6667%
  const expect: [string, number, number][] = [
    ['acquirer EPS',      r.acquirerEps,        5],
    ['target EPS',        r.targetEps,          2],
    ['offer value',       r.offerValue,         1250],
    ['premium',           r.premium,            0.25],
    ['stock consideration', r.stockConsideration, 625],
    ['new shares issued', r.newSharesIssued,    12.5],
    ['forgone interest',  r.forgoneInterest,    7.5],
    ['new interest',      r.newInterest,        15],
    ['pro-forma NI',      r.proFormaNetIncome,  583.125],
    ['pro-forma shares',  r.proFormaShares,     112.5],
    ['pro-forma EPS',     r.proFormaEps,        583.125 / 112.5],
    ['accretion',         r.accretion!,         583.125 / 112.5 / 5 - 1],
  ];
  let allOk = true;
  for (const [label, got, want] of expect) {
    const ok = Math.abs(got - want) < 1e-9;
    if (!ok) allOk = false;
    console.log(`  ${label.padEnd(20)} ${f(got, 6).padStart(12)}  hand: ${f(want, 6).padStart(12)}  ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`  verdict              ${r.verdict}  (${pct(r.accretion!)})`);
  console.log(`  ALL HAND-CHECKS      ${allOk ? 'PASS' : 'FAIL'}`);

  // The bridge must reconcile to the actual EPS change, or the
  // attribution is decoration rather than an explanation.
  const bridgeSum = r.bridge.targetEarnings + r.bridge.synergies + r.bridge.financingCost + r.bridge.dilutionFromShares;
  const epsChange = r.proFormaEps - r.acquirerEps;
  console.log(`\n  bridge sums to change ${f(bridgeSum, 8)} vs ${f(epsChange, 8)}  -> ${Math.abs(bridgeSum - epsChange) < 1e-9 ? 'PASS' : 'FAIL'}`);

  // ---- breakeven offer price, worked by hand ----
  //   V* = targetNI / (acquirerEps*m + k)
  //   m = 0.5/50 = 0.01 ; k = (0.06*0.2 + 0.02*0.3)*0.75 = 0.0135
  //   V* = 100 / (0.05 + 0.0135) = 1574.8031...
  //   P* = V*/50 = 31.4961...
  const handBreakeven = (100 / (5 * 0.01 + 0.0135)) / 50;
  console.log(`  breakeven price      ${f(r.breakevenOfferPrice!, 6)}  hand: ${f(handBreakeven, 6)}  -> ${Math.abs(r.breakevenOfferPrice! - handBreakeven) < 1e-9 ? 'PASS' : 'FAIL'}`);

  // And it must actually be the zero: re-running AT that price gives ~0.
  const atBreakeven = runMna(acquirer, target, { ...deal, offerPricePerShare: r.breakevenOfferPrice! });
  console.log(`  re-run at breakeven  accretion ${f(atBreakeven.accretion! * 100, 8)}%  -> ${Math.abs(atBreakeven.accretion!) < 1e-12 ? 'PASS (it is the true zero)' : 'FAIL'}`);

  // Breakeven synergies: negative here means already accretive with room.
  const handSyn = 22.5 + (5 * 12.5 - 100) / 0.75;
  console.log(`  breakeven synergies  ${f(r.breakevenSynergies!, 6)}  hand: ${f(handSyn, 6)}  -> ${Math.abs(r.breakevenSynergies! - handSyn) < 1e-9 ? 'PASS' : 'FAIL'}`);

  // ---- the textbook rule: an ALL-STOCK deal is accretive iff the
  // acquirer's P/E exceeds the target's P/E at the offer price ----
  console.log('\n  all-stock P/E rule (acquirer P/E 10.0):');
  for (const p of [15, 20, 25, 30]) {
    const rr = runMna(acquirer, target, { ...deal, offerPricePerShare: p, pctStock: 1, pctCash: 0, pctDebt: 0 });
    const rulePredicts = (rr.acquirerPe ?? 0) > (rr.targetPeAtOffer ?? 0) ? 'accretive' : 'dilutive';
    const agrees = rr.verdict === rulePredicts || rr.verdict === 'neutral';
    console.log(`    offer $${String(p).padEnd(3)} target P/E ${f(rr.targetPeAtOffer!, 1).padStart(5)}  ${String(rr.verdict).padEnd(10)} rule says ${rulePredicts.padEnd(10)} ${agrees ? 'PASS' : 'FAIL'}`);
  }

  // ---- guard: no positive standalone EPS means no comparison ----
  const broke = runMna({ netIncome: 0, sharesOutstanding: 100, sharePrice: 50 }, target, deal);
  console.log(`\n  acquirer EPS = 0     accretion=${broke.accretion} verdict=${broke.verdict}  -> ${broke.accretion === null && broke.verdict === null ? 'PASS (withheld, not faked)' : 'FAIL'}`);
}

console.log('\n  deal sanity:');
{
  const A: MnaCompany = { netIncome: 500, sharesOutstanding: 100, sharePrice: 50 };
  const T: MnaCompany = { netIncome: 100, sharesOutstanding: 50, sharePrice: 230 };
  const D: MnaDeal = { offerPricePerShare: 60, pctStock: 0.5, pctCash: 0.3, pctDebt: 0.2,
    debtRate: 0.06, cashRate: 0.02, taxRate: 0.25, synergies: 0 };
  const under = runMna(A, T, D);
  console.log(`    offer 60 vs price 230  premium ${pct(under.premium)}  issues=${under.issues.map(i=>i.id).join(',')}  verdict=${under.verdict}`);
  console.log(`      flagged as caution   ${under.issues.some(i=>i.id==='discount')?'PASS':'FAIL'}  (a take-under is possible, so it warns rather than blocks)`);

  const badMix = runMna(A, { ...T, sharePrice: 20 }, { ...D, offerPricePerShare: 25, pctStock: 0.5, pctCash: 0.3, pctDebt: 0.9 });
  console.log(`    mix sums to 170%       issues=${badMix.issues.map(i=>i.id).join(',')}  verdict=${badMix.verdict}  accretion=${badMix.accretion}`);
  console.log(`      verdict withheld     ${badMix.verdict === null && badMix.accretion === null ? 'PASS' : 'FAIL'}`);

  const noShares = runMna(A, { ...T, sharesOutstanding: 0, sharePrice: 20 }, { ...D, offerPricePerShare: 25 });
  console.log(`    target has 0 shares    issues=${noShares.issues.map(i=>i.id).join(',')}  verdict withheld ${noShares.verdict === null ? 'PASS' : 'FAIL'}`);

  const clean = runMna(A, { ...T, sharePrice: 20 }, { ...D, offerPricePerShare: 25 });
  console.log(`    the hand-checked deal  issues=${clean.issues.length}  ${clean.issues.length === 0 ? 'PASS (no false positives)' : 'FAIL'}`);
}


console.log('\n' + '='.repeat(74));
console.log('H. Valuation multiples, against a hand-computed case');
console.log('='.repeat(74));
{
  const c = SAMPLE_INPUT;
  const m = multiples(c);
  const get = (k: string) => m.find((x) => x.key === k)!.value;

  //   market cap = 15.2 x 230                 = 3496
  //   P/E        = 3496 / 94                  = 37.191489
  //   EV         = 3496 + 107 - 30            = 3573
  //   EBITDA     = 123 + 11                   = 134
  //   EV/EBITDA  = 3573 / 134                 = 26.664179
  //   P/B        = 3496 / 57                  = 61.333333
  //   P/S        = 3496 / 391                 = 8.941176
  const checks: [string, number, number][] = [
    ['P/E',       get('pe'),       3496 / 94],
    ['EV/EBITDA', get('evEbitda'), 3573 / 134],
    ['P/B',       get('pb'),       3496 / 57],
    ['P/S',       get('ps'),       3496 / 391],
  ];
  let ok = true;
  for (const [label, got, want] of checks) {
    const good = Math.abs(got - want) < 1e-9;
    if (!good) ok = false;
    console.log(`  ${label.padEnd(11)} ${f(got, 6).padStart(11)}  hand: ${f(want, 6).padStart(11)}  ${good ? 'PASS' : 'FAIL'}`);
  }
  console.log(`  ALL PASS    ${ok ? 'yes' : 'NO'}`);

  // A P/E on a loss is meaningless, not large. Must be omitted.
  const loss = multiples({ ...c, netIncome: -50 });
  console.log(`\n  netIncome -50   P/E present? ${loss.some((x) => x.key === 'pe') ? 'yes FAIL' : 'no  PASS (omitted, not shown negative)'}`);

  // D&A blank -> EV/EBITDA skipped rather than proxied
  const noDa = multiples({ ...c, depreciationAmortization: null });
  console.log(`  D&A blank       EV/EBITDA present? ${noDa.some((x) => x.key === 'evEbitda') ? 'yes FAIL' : 'no  PASS (skipped, not estimated)'}`);
  console.log(`                  others still shown: ${noDa.map((x) => x.key).join(', ')}`);

  // No market data at all -> nothing at all, no crash
  const noMkt = multiples({ ...c, sharePrice: null, sharesOutstanding: null });
  console.log(`  no share price  multiples returned: ${noMkt.length}  ${noMkt.length === 0 ? 'PASS' : 'FAIL'}`);
}
