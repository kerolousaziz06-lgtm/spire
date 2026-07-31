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
import { computeRiskProfile } from '../src/lib/risk';
import { CRASH_EVENTS, replayCrash } from '../src/lib/crashes';
import { dupont, SAMPLE_INPUT } from '../src/lib/analysis';
import { runDcf } from '../src/lib/dcf';
import { runLbo, SAMPLE_LBO } from '../src/lib/lbo';

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
