// ============================================================
// settings.ts — the assumptions the engines run on, made visible.
//
// The point of this file is not preferences. It is that the engines were
// full of numbers presented as facts: a 2% risk-free rate buried in
// risk.ts, a Student's t degrees-of-freedom of 5 controlling how severe
// the fat tails are, and an expected return and volatility for all 13
// assets. Those are ASSUMPTIONS. Exposing them is what lets the app say
// "these are my documented inputs, and here is what happens if you
// disagree" instead of asking to be taken on faith.
//
// Threading, not globals. Every engine takes an optional `assumptions`
// argument defaulting to DEFAULT_ASSUMPTIONS, so the pure functions stay
// pure and `npm run verify:math` produces bit-identical output at
// defaults. A module-level mutable config would have been less typing and
// exactly the kind of hidden state that let the correlation bug live.
// ============================================================
import type { AssetOverrides } from './assets';

// ---- Fat-tail severity ----------------------------------------------
// Exposed as named choices, not a raw number: "degrees of freedom = 5"
// means nothing to a reader, while "Realistic" does. Lower means fatter
// tails, so more frequent extreme years.
//
// The floor of 3 is not arbitrary. A Student's t has infinite variance at
// 2 or below, which would make the volatility inputs meaningless.
export type TailSeverity = 'severe' | 'realistic' | 'mild' | 'none';

export const TAIL_DOF: Record<TailSeverity, number> = {
  severe: 3,
  realistic: 5,
  mild: 10,
  none: Infinity,   // a plain normal distribution
};

export const TAIL_LABEL: Record<TailSeverity, string> = {
  severe: 'Severe',
  realistic: 'Realistic',
  mild: 'Mild',
  none: 'None (normal)',
};

// These notes describe what the setting MEASURABLY does, which is not what
// intuition expects. randFatTail rescales by sqrt((dof-2)/dof) so the
// standard deviation stays 1 and only the SHAPE changes. A low-dof t is
// therefore more peaked near the middle, with its extra mass pushed way
// out into rare events. Measured over 10 years, 40k paths:
//
//   severity   p5        p95       median max drawdown
//   severe     105,937   286,543   7.23%
//   realistic  104,033   293,827   9.61%
//   mild       103,203   295,608   10.49%
//   none       102,836   297,163   10.97%
//
// So "Severe" NARROWS the 90% range and shallows the typical drawdown.
// The risk it adds is in rare, large events, not in the everyday spread.
// Saying "crashes more often" would have been a comfortable lie.
export const TAIL_NOTE: Record<TailSeverity, string> = {
  severe:
    'Extreme years are rarer but far bigger. Counter-intuitively this narrows the 90% range and shallows the typical drawdown, because the spread concentrates near the middle.',
  realistic:
    'Extreme years happen about as often as they really do. The default, and what the documented benchmarks assume.',
  mild:
    'Closer to a bell curve. Widens the everyday range, but understates how bad a genuine crash gets.',
  none:
    'A pure bell curve. Widest everyday range, but it says a -30% year is nearly impossible, which is wrong.',
};

// Total volatility is held constant across all four settings by design, so
// the asset volatilities you enter keep meaning what they say. Only the
// shape of the distribution changes.
export const TAIL_CAVEAT =
  'All four hold total volatility constant, so your volatility inputs keep their meaning — only the shape of the distribution changes. Fatter tails move risk out of the everyday range and into rare, larger events.';

// ---- Display --------------------------------------------------------
export type Units = 'billions' | 'millions' | 'thousands';
export type NumberFormat = 'us' | 'eu';

export const UNIT_SUFFIX: Record<Units, string> = {
  billions: 'B',
  millions: 'M',
  thousands: 'K',
};

export const UNIT_LOCALE: Record<NumberFormat, string> = {
  us: 'en-US',   // 1,234.56
  eu: 'de-DE',   // 1.234,56
};

// ---- The whole settings object --------------------------------------
export type Assumptions = {
  riskFreeRate: number;
  tailSeverity: TailSeverity;
  defaultNumPaths: number;
  assetOverrides: AssetOverrides;
};

export type DisplaySettings = {
  units: Units;
  numberFormat: NumberFormat;
  currencySymbol: string;
  reduceMotion: boolean;
};

export type Settings = {
  assumptions: Assumptions;
  display: DisplaySettings;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  // Was hardcoded in risk.ts. It feeds the Sharpe ratio, so it moves
  // every risk verdict in MonteVue.
  riskFreeRate: 0.02,
  tailSeverity: 'realistic',
  defaultNumPaths: 5000,
  assetOverrides: {},
};

export const DEFAULT_DISPLAY: DisplaySettings = {
  units: 'billions',
  numberFormat: 'us',
  currencySymbol: '$',
  reduceMotion: false,
};

export const DEFAULT_SETTINGS: Settings = {
  assumptions: DEFAULT_ASSUMPTIONS,
  display: DEFAULT_DISPLAY,
};

// ---- Bounds ---------------------------------------------------------
// Not decoration. A volatility of 0 divides by zero in the Sharpe ratio,
// and a negative one is meaningless; both would produce a confidently
// wrong number, which is the failure mode this project keeps hitting.
export const BOUNDS = {
  riskFreeRate: { min: -0.02, max: 0.15 },
  expReturn: { min: -0.20, max: 0.30 },
  volatility: { min: 0.001, max: 1.0 },
} as const;

export const PATH_CHOICES = [1000, 5000, 10000] as const;

export function clamp(v: number, { min, max }: { min: number; max: number }): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// ---- Persistence reviver --------------------------------------------
// Same contract as the other revivers in persist.ts: prove the shape or
// return null. A stored setting that reaches an engine unchecked is a
// slower version of the same bug as a stored company figure.
export function reviveSettings(raw: unknown, fallback: Settings): Settings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const a = (r.assumptions ?? {}) as Record<string, unknown>;
  const d = (r.display ?? {}) as Record<string, unknown>;

  const num = (v: unknown, def: number, b?: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) ? (b ? clamp(v, b) : v) : def;

  const overrides: AssetOverrides = {};
  const src = a.assetOverrides;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [id, o] of Object.entries(src as Record<string, unknown>)) {
      if (!o || typeof o !== 'object') continue;
      const oo = o as Record<string, unknown>;
      const entry: { expReturn?: number; volatility?: number } = {};
      if (typeof oo.expReturn === 'number' && Number.isFinite(oo.expReturn)) {
        entry.expReturn = clamp(oo.expReturn, BOUNDS.expReturn);
      }
      if (typeof oo.volatility === 'number' && Number.isFinite(oo.volatility)) {
        entry.volatility = clamp(oo.volatility, BOUNDS.volatility);
      }
      if (Object.keys(entry).length > 0) overrides[id] = entry;
    }
  }

  const severity = (a.tailSeverity as TailSeverity);
  const units = d.units as Units;
  const fmt = d.numberFormat as NumberFormat;

  return {
    assumptions: {
      riskFreeRate: num(a.riskFreeRate, fallback.assumptions.riskFreeRate, BOUNDS.riskFreeRate),
      tailSeverity: severity in TAIL_DOF ? severity : fallback.assumptions.tailSeverity,
      defaultNumPaths: (PATH_CHOICES as readonly number[]).includes(num(a.defaultNumPaths, -1))
        ? (a.defaultNumPaths as number)
        : fallback.assumptions.defaultNumPaths,
      assetOverrides: overrides,
    },
    display: {
      units: units in UNIT_SUFFIX ? units : fallback.display.units,
      numberFormat: fmt in UNIT_LOCALE ? fmt : fallback.display.numberFormat,
      currencySymbol:
        typeof d.currencySymbol === 'string' && d.currencySymbol.length > 0 && d.currencySymbol.length <= 3
          ? d.currencySymbol
          : fallback.display.currencySymbol,
      reduceMotion: typeof d.reduceMotion === 'boolean' ? d.reduceMotion : fallback.display.reduceMotion,
    },
  };
}
