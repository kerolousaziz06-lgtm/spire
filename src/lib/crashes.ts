// ============================================================
// crashes.ts — HISTORICAL stress testing (deterministic, not random).
//
// Unlike the Monte Carlo engine (which samples thousands of RANDOM
// futures), a crash replay is DETERMINISTIC: 2008 already happened,
// so a portfolio's path through it is a fixed calculation. Click it
// twice, get the same answer. It only changes when HOLDINGS change.
//
// For each historical crisis we store, per asset CATEGORY, an
// approximate peak-to-trough decline and a recovery time. These are
// documented, defensible round numbers for broad asset classes —
// NOT tick-by-tick data, and labeled as approximations in the UI.
//
// We shape each asset's path as: a smooth decline to its trough,
// then a recovery back toward (and past) its starting value. The
// portfolio path is the weighted sum of its assets' paths.
// ============================================================
import { ASSET_BY_ID, type Asset, type Holding } from './assets';

export type CrashEvent = {
  id: string;
  name: string;
  period: string;
  months: number;          // total span we animate (decline + recovery)
  troughMonth: number;     // month at which the bottom occurs
  blurb: string;
  // Peak-to-trough decline per category (0.55 = fell 55%).
  declineByCategory: Record<Asset['category'], number>;
};

// Documented, approximate broad-asset-class behavior in each crisis.
export const CRASH_EVENTS: CrashEvent[] = [
  {
    id: '2008',
    name: '2008 Financial Crisis',
    period: 'Oct 2007 – Mar 2013',
    months: 66,
    troughMonth: 17,
    blurb: 'Global banking collapse. Equities fell ~55%; high-quality bonds and gold held up.',
    declineByCategory: { stock: 0.55, bond: 0.05, cashlike: 0.0, alt: 0.45 },
    // note: alt (REITs fell hard, gold rose) is a blend; see per-asset tweaks below
  },
  {
    id: '2020',
    name: '2020 COVID Crash',
    period: 'Feb 2020 – Aug 2020',
    months: 7,
    troughMonth: 1,
    blurb: 'Fastest-ever bear market, then a sharp V-shaped recovery within months.',
    declineByCategory: { stock: 0.34, bond: 0.02, cashlike: 0.0, alt: 0.25 },
  },
  {
    id: '2022',
    name: '2022 Rate Hikes',
    period: 'Jan 2022 – Dec 2023',
    months: 24,
    troughMonth: 10,
    blurb: 'Inflation shock. Unusually, stocks AND bonds fell together as rates rose.',
    declineByCategory: { stock: 0.25, bond: 0.15, cashlike: 0.0, alt: 0.28 },
  },
];

// Per-asset overrides where a specific asset diverged from its
// category (the most important nuance: gold RISES in 2008).
const ASSET_DECLINE_OVERRIDE: Record<string, Record<string, number>> = {
  gold:  { '2008': -0.05, '2020': 0.03, '2022': 0.00 }, // negative decline = a gain
  reits: { '2008': 0.68, '2020': 0.40, '2022': 0.28 },  // real estate fell hardest in 2008
  nasdaq:{ '2008': 0.54, '2020': 0.30, '2022': 0.33 },  // tech fell more in 2022
  emerging: { '2008': 0.62, '2020': 0.34, '2022': 0.24 },
  hy_bonds: { '2008': 0.33, '2020': 0.20, '2022': 0.12 },
  tips:  { '2008': 0.02, '2020': 0.01, '2022': 0.12 },
};

// The decline for one asset in one crash (override if present, else category).
function assetDecline(asset: Asset, event: CrashEvent): number {
  const o = ASSET_DECLINE_OVERRIDE[asset.id]?.[event.id];
  if (o !== undefined) return o;
  return event.declineByCategory[asset.category];
}

export type CrashResult = {
  event: CrashEvent;
  startValue: number;
  path: { month: number; value: number }[]; // portfolio value each month
  troughValue: number;
  troughDrop: number;      // fraction below start at the bottom (0.32 = -32%)
  recoveryMonths: number | null; // months to get back to start (null if never within span)
  endValue: number;
};

// Shape a single asset's value over the event: peak -> trough -> recover.
// Decline phase eases down to the trough; recovery eases back up. A
// slight overshoot models markets typically recovering PAST the old high.
function assetPath(startDollars: number, decline: number, event: CrashEvent): number[] {
  const { months, troughMonth } = event;
  const out: number[] = [];
  const troughMult = 1 - decline;              // value multiplier at the bottom
  const endMult = Math.max(1.02, 1 + decline * 0.15); // modest recovery past par
  for (let m = 0; m <= months; m++) {
    let mult: number;
    if (m <= troughMonth) {
      // decline phase: ease-in from 1 down to troughMult
      const t = troughMonth === 0 ? 1 : m / troughMonth;
      const eased = t * t;                     // ease-in (accelerating fall)
      mult = 1 + (troughMult - 1) * eased;
    } else {
      // recovery phase: ease-out from troughMult up to endMult
      const t = (m - troughMonth) / (months - troughMonth);
      const eased = 1 - (1 - t) * (1 - t);     // ease-out (decelerating climb)
      mult = troughMult + (endMult - troughMult) * eased;
    }
    out.push(startDollars * mult);
  }
  return out;
}

// Replay a whole portfolio through one crash.
export function replayCrash(holdings: Holding[], event: CrashEvent): CrashResult {
  const active = holdings.filter((h) => h.dollars > 0 && ASSET_BY_ID[h.assetId]);
  const startValue = active.reduce((s, h) => s + h.dollars, 0);

  if (startValue === 0) {
    return { event, startValue: 0, path: [{ month: 0, value: 0 }],
             troughValue: 0, troughDrop: 0, recoveryMonths: null, endValue: 0 };
  }

  // Build each asset's path, then sum them month by month.
  const assetPaths = active.map((h) =>
    assetPath(h.dollars, assetDecline(ASSET_BY_ID[h.assetId], event), event)
  );

  const path: { month: number; value: number }[] = [];
  for (let m = 0; m <= event.months; m++) {
    const value = assetPaths.reduce((sum, p) => sum + p[m], 0);
    path.push({ month: m, value });
  }

  // Find the trough (lowest point) and the recovery month.
  let troughValue = startValue;
  for (const pt of path) if (pt.value < troughValue) troughValue = pt.value;
  const troughDrop = (startValue - troughValue) / startValue;

  let recoveryMonths: number | null = null;
  for (const pt of path) {
    if (pt.month > 0 && pt.value >= startValue) { recoveryMonths = pt.month; break; }
  }

  return {
    event,
    startValue,
    path,
    troughValue,
    troughDrop,
    recoveryMonths,
    endValue: path[path.length - 1].value,
  };
}
