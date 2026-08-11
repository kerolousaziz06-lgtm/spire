// ============================================================
// budget.ts — the personal finance engine. Numbers in, numbers out.
//
// The whole design turns on two things being DERIVED rather than entered:
//
//   category total = sum of its subcategories
//   savings        = total income - total expenses
//
// Neither can be typed, so neither can disagree with anything else. The
// alternative (enter a category total AND its parts, then check they
// match) creates a state where they do not match, and every downstream
// number then depends on which of the two you happened to read. That is
// the shape of the correlation-matrix bug: a contradiction that a later
// reader has to notice. Here there is nothing to notice.
//
// The same rule makes the Sankey correct for free. A Sankey is only
// readable if every node's inflow equals its outflow; because the totals
// are sums of their parts, that identity holds by construction and the
// chart never has to reconcile anything.
//
// Sankey NODES AND LINKS are built here; PIXELS are not. The graph
// (who flows to whom, how much, what share) is data. Where that lands on
// screen belongs to the component.
// ============================================================

// Type-only, so this adds no runtime dependency on the Vantage engine.
// The verdict scale is shared on purpose: good/ok/bad means the same
// thing here as it does on a ratio, and MetricRow already renders it.
import type { Health } from './analysis';

// ---- Taxonomy ------------------------------------------------

export type IncomeSourceId = 'paycheck' | 'business' | 'interest' | 'other_income';

export type CategoryId =
  | 'housing' | 'food' | 'transport' | 'bills'
  | 'shopping' | 'travel' | 'health' | 'other';

export type SubcategoryId = string;

export type IncomeSource = {
  id: IncomeSourceId;
  name: string;
  color: string;
  hint: string;
};

export type Subcategory = {
  id: SubcategoryId;
  parent: CategoryId;
  name: string;
  // Fixed commitments are hard to change this month (rent, insurance,
  // a car payment). Variable ones respond to a decision. The split is
  // what makes the what-if sliders honest: cutting rent 30% is not a
  // choice you get to make in the same sense that dining out is.
  fixed: boolean;
};

export type Category = {
  id: CategoryId;
  name: string;
  color: string;
  // Rule-of-thumb share of income, as [low, high]. These are budgeting
  // heuristics (the 50/30/20 split, and BLS Consumer Expenditure Survey
  // shares), NOT measurements of this user or anything else. Every
  // surface that shows a verdict from these must say so.
  typical: [number, number];
};

// Income sources take the cool end of the muted family, against the warm
// categories on the right. The diagram then runs cool -> bone -> warm from
// left to right, which is the reference's hue journey and the reason it
// reads as one movement rather than a pile of ribbons.
//
// A luminance-only ramp off the bone was tried first and failed: at the
// 0.24 ribbon opacity these sit at, three tints of the same cream are one
// grey slab, and 83% / 15% / 2% of income became indistinguishable.
export const INCOME_SOURCES: IncomeSource[] = [
  { id: 'paycheck',     name: 'Paychecks',      color: '#6FA3A8', hint: 'Take-home pay, after tax and deductions.' },
  { id: 'business',     name: 'Business income', color: '#5B87AD', hint: 'Self-employment, freelance, side work.' },
  { id: 'interest',     name: 'Interest & dividends', color: '#8AA0C4', hint: 'Savings interest, dividends, distributions.' },
  { id: 'other_income', name: 'Other income',   color: '#8E93A6', hint: 'Gifts, refunds, reimbursements, anything else.' },
];

// Category hues are the muted asset swatches from assets.ts, reused
// deliberately. The monochrome-structure rule says the only hues in the
// app are semantic; a Sankey needs categorical identity, which is the
// same justification already accepted for the 13 asset swatches. The one
// genuinely semantic hue here is savings, which takes --gain.
export const CATEGORIES: Category[] = [
  { id: 'housing',  name: 'Housing',            color: '#D9A55C', typical: [0.25, 0.35] },
  { id: 'food',     name: 'Food & Dining',      color: '#A8607A', typical: [0.10, 0.15] },
  { id: 'transport',name: 'Auto & Transport',   color: '#6E86B8', typical: [0.10, 0.15] },
  { id: 'bills',    name: 'Bills & Utilities',  color: '#7FA8B5', typical: [0.05, 0.10] },
  { id: 'shopping', name: 'Shopping',           color: '#8E6BA8', typical: [0.03, 0.08] },
  { id: 'travel',   name: 'Travel & Lifestyle', color: '#C2724F', typical: [0.03, 0.08] },
  { id: 'health',   name: 'Health & Wellness',  color: '#7FA98C', typical: [0.03, 0.08] },
  { id: 'other',    name: 'Other',              color: '#9A9188', typical: [0.02, 0.08] },
];

export const SUBCATEGORIES: Subcategory[] = [
  { id: 'rent_mortgage',   parent: 'housing',   name: 'Rent / Mortgage',      fixed: true },
  { id: 'home_upkeep',     parent: 'housing',   name: 'Home improvement',     fixed: false },
  { id: 'property_costs',  parent: 'housing',   name: 'Property tax & insurance', fixed: true },

  { id: 'groceries',       parent: 'food',      name: 'Groceries',            fixed: false },
  { id: 'restaurants',     parent: 'food',      name: 'Restaurants & bars',   fixed: false },
  { id: 'coffee',          parent: 'food',      name: 'Coffee',               fixed: false },

  { id: 'auto_payment',    parent: 'transport', name: 'Auto payment',         fixed: true },
  { id: 'gas',             parent: 'transport', name: 'Gas',                  fixed: false },
  { id: 'auto_upkeep',     parent: 'transport', name: 'Auto maintenance',     fixed: false },
  { id: 'transit',         parent: 'transport', name: 'Transit & rideshare',  fixed: false },

  { id: 'electricity',     parent: 'bills',     name: 'Gas & electric',       fixed: true },
  { id: 'water',           parent: 'bills',     name: 'Water',                fixed: true },
  { id: 'internet',        parent: 'bills',     name: 'Internet & cable',     fixed: true },
  { id: 'phone',           parent: 'bills',     name: 'Phone',                fixed: true },
  { id: 'garbage',         parent: 'bills',     name: 'Garbage',              fixed: true },

  { id: 'general_shop',    parent: 'shopping',  name: 'Shopping',             fixed: false },
  { id: 'clothing',        parent: 'shopping',  name: 'Clothing',             fixed: false },
  { id: 'furniture',       parent: 'shopping',  name: 'Furniture & housewares', fixed: false },

  { id: 'vacation',        parent: 'travel',    name: 'Travel & vacation',    fixed: false },
  { id: 'entertainment',   parent: 'travel',    name: 'Entertainment',        fixed: false },
  { id: 'subscriptions',   parent: 'travel',    name: 'Subscriptions',        fixed: true },

  { id: 'medical',         parent: 'health',    name: 'Medical',              fixed: false },
  { id: 'fitness',         parent: 'health',    name: 'Fitness',              fixed: true },
  { id: 'insurance_health',parent: 'health',    name: 'Health insurance',     fixed: true },

  { id: 'pets',            parent: 'other',     name: 'Pets',                 fixed: false },
  { id: 'gifts',           parent: 'other',     name: 'Gifts & donations',    fixed: false },
  { id: 'education',       parent: 'other',     name: 'Education',            fixed: true },
  { id: 'misc',            parent: 'other',     name: 'Everything else',      fixed: false },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export const SUBCATEGORY_BY_ID: Record<SubcategoryId, Subcategory> =
  Object.fromEntries(SUBCATEGORIES.map((s) => [s.id, s]));

export const SOURCE_BY_ID: Record<IncomeSourceId, IncomeSource> =
  Object.fromEntries(INCOME_SOURCES.map((s) => [s.id, s])) as Record<IncomeSourceId, IncomeSource>;

export function childrenOf(id: CategoryId): Subcategory[] {
  return SUBCATEGORIES.filter((s) => s.parent === id);
}

// ---- Input ---------------------------------------------------

// 'YYYY-MM'. A string key rather than a Date so it survives JSON, sorts
// lexicographically, and carries no timezone.
export type MonthKey = string;

// null means "not entered", 0 means "entered, and it was zero". Vantage
// learned this the expensive way: coercing a blank to 0 made "I have not
// found this yet" indistinguishable from a real zero, and every metric
// downstream was computed from the 0.
export type MonthEntry = {
  month: MonthKey;
  income: Partial<Record<IncomeSourceId, number | null>>;
  spend: Partial<Record<SubcategoryId, number | null>>;
};

export type BudgetData = {
  months: MonthEntry[];
  // Used for the emergency-fund runway. Not a flow, so it is not in the
  // Sankey and not part of any month.
  cashOnHand: number | null;
};

export function emptyMonth(month: MonthKey): MonthEntry {
  return { month, income: {}, spend: {} };
}

export function monthKey(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// A blank contributes nothing. This is the ONLY place a null becomes a
// number, so "blank means zero for the purpose of summing" lives in one
// spot rather than being re-decided at each call site.
function sum(values: (number | null | undefined)[]): number {
  let t = 0;
  for (const v of values) if (typeof v === 'number' && isFinite(v) && v > 0) t += v;
  return t;
}

// ---- Derived totals ------------------------------------------

export type CategoryTotal = {
  id: CategoryId;
  name: string;
  color: string;
  total: number;
  // Every child that carries a figure, largest first.
  children: { id: SubcategoryId; name: string; amount: number; fixed: boolean }[];
  fixedTotal: number;
  variableTotal: number;
};

export type MonthTotals = {
  month: MonthKey;
  sources: { id: IncomeSourceId; name: string; color: string; amount: number }[];
  totalIncome: number;
  categories: CategoryTotal[];     // only those with a nonzero total, largest first
  totalExpenses: number;
  // DERIVED. Negative when the month spent more than it earned.
  savings: number;
  // null when there is no income to divide by, rather than Infinity or a
  // made-up 0%. A month with expenses and no income has no savings RATE;
  // it has a deficit, which `savings` already states.
  savingsRate: number | null;
  fixedTotal: number;
  variableTotal: number;
  // True once any figure has been entered. Distinguishes "an empty month"
  // from "a month where everything really was zero".
  hasData: boolean;
};

export function computeMonth(entry: MonthEntry): MonthTotals {
  const sources = INCOME_SOURCES
    .map((s) => ({ id: s.id, name: s.name, color: s.color, amount: sum([entry.income[s.id]]) }))
    .filter((s) => s.amount > 0);

  const totalIncome = sum(sources.map((s) => s.amount));

  const categories: CategoryTotal[] = CATEGORIES
    .map((c) => {
      const children = childrenOf(c.id)
        .map((s) => ({ id: s.id, name: s.name, amount: sum([entry.spend[s.id]]), fixed: s.fixed }))
        .filter((s) => s.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      // The category total is the sum of its parts. It is never entered,
      // so it can never disagree with them.
      const total = sum(children.map((s) => s.amount));
      return {
        id: c.id, name: c.name, color: c.color, total, children,
        fixedTotal: sum(children.filter((s) => s.fixed).map((s) => s.amount)),
        variableTotal: sum(children.filter((s) => !s.fixed).map((s) => s.amount)),
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const totalExpenses = sum(categories.map((c) => c.total));

  // DERIVED, and allowed to be negative. Clamping this at 0 would hide
  // exactly the month the user most needs to see.
  const savings = totalIncome - totalExpenses;

  const anyEntered =
    Object.values(entry.income).some((v) => typeof v === 'number') ||
    Object.values(entry.spend).some((v) => typeof v === 'number');

  return {
    month: entry.month,
    sources,
    totalIncome,
    categories,
    totalExpenses,
    savings,
    savingsRate: totalIncome > 0 ? savings / totalIncome : null,
    fixedTotal: sum(categories.map((c) => c.fixedTotal)),
    variableTotal: sum(categories.map((c) => c.variableTotal)),
    hasData: anyEntered,
  };
}

// ---- The Sankey graph ----------------------------------------

export type FlowKind = 'source' | 'trunk' | 'savings' | 'deficit' | 'category' | 'sub';

export type FlowNode = {
  id: string;
  label: string;
  value: number;
  depth: 0 | 1 | 2 | 3;
  color: string;
  kind: FlowKind;
  // Share of total income. ONE denominator for every node at every level.
  //
  // Monarch changes denominator between levels and contradicts itself in
  // the process: a category is labelled as a share of INCOME while its
  // only child — the identical dollars, one unsplit flow — is labelled as
  // a share of EXPENSES, so the same money carries two percentages in one
  // diagram. A single denominator costs nothing and cannot do that.
  // Harness section J reproduces both readings from one fixture.
  share: number;
  // Set on an aggregate row, naming what it swallowed.
  detail?: string;
};

export type FlowLink = { id: string; source: string; target: string; value: number; };

export type FlowGraph = {
  nodes: FlowNode[];
  links: FlowLink[];
  totalIncome: number;
  // Every `share` divides by this. Named so the chart can print it.
  denominator: number;
  deficit: boolean;
};

// Fold the smallest children of a category into one row below this share
// of income. A 0.3% flow is 2px tall and its label is 26px tall, so past
// a handful of them the column is all label and no chart.
const MIN_CHILD_SHARE = 0.015;

// Folding one row into "Other (1)" is strictly worse than showing it: same
// height, less information. Only fold when it actually buys space.
const MIN_FOLD_COUNT = 2;

/**
 * Build the four-layer graph:
 *
 *   income sources -> Income -> savings + categories -> subcategories
 *
 * Savings terminates at depth 2 with no children, and is pinned to the top
 * of its column so it reads first. Categories follow, largest first.
 * Children are ordered by (parent, amount desc) so ribbons do not cross.
 */
export function buildFlow(t: MonthTotals): FlowGraph {
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // A deficit month has no savings flow to draw. Rather than a negative
  // ribbon (which has no geometry), the shortfall enters as a SOURCE:
  // money drawn from savings or borrowed to cover the gap. The diagram
  // then balances, and the red band on the income side is the point.
  const deficit = t.savings < 0;
  const drawnDown = deficit ? -t.savings : 0;

  // Both sides divide by the same number, and that number is what the
  // month actually had available to spend.
  const denominator = t.totalIncome + drawnDown;
  const share = (v: number) => (denominator > 0 ? v / denominator : 0);

  const push = (n: FlowNode) => { nodes.push(n); return n.id; };

  // depth 0 — where the money came from
  for (const s of t.sources) {
    push({ id: `src:${s.id}`, label: s.name, value: s.amount, depth: 0, color: s.color, kind: 'source', share: share(s.amount) });
    links.push({ id: `l:src:${s.id}`, source: `src:${s.id}`, target: 'trunk', value: s.amount });
  }

  if (deficit) {
    push({
      id: 'src:deficit', label: 'Drawn from savings', value: drawnDown, depth: 0,
      color: 'var(--loss)', kind: 'deficit', share: share(drawnDown),
      detail: 'This month spent more than it earned. The gap came from savings or borrowing.',
    });
    links.push({ id: 'l:src:deficit', source: 'src:deficit', target: 'trunk', value: drawnDown });
  }

  // depth 1 — the trunk. Always exactly 100%.
  push({ id: 'trunk', label: deficit ? 'Available' : 'Income', value: denominator, depth: 1, color: '#ECE7DB', kind: 'trunk', share: 1 });

  // depth 2 — savings first, then categories largest first.
  if (!deficit && t.savings > 0) {
    push({ id: 'savings', label: 'Savings', value: t.savings, depth: 2, color: 'var(--gain)', kind: 'savings', share: share(t.savings) });
    links.push({ id: 'l:savings', source: 'trunk', target: 'savings', value: t.savings });
  }

  for (const c of t.categories) {
    push({ id: `cat:${c.id}`, label: c.name, value: c.total, depth: 2, color: c.color, kind: 'category', share: share(c.total) });
    links.push({ id: `l:cat:${c.id}`, source: 'trunk', target: `cat:${c.id}`, value: c.total });

    // depth 3 — children, in their parent's order. A category with one
    // child gets no depth-3 node: the ribbon would restate the parent.
    if (c.children.length < 2) continue;

    const big = c.children.filter((s) => share(s.amount) >= MIN_CHILD_SHARE);
    const small = c.children.filter((s) => share(s.amount) < MIN_CHILD_SHARE);
    const fold = small.length >= MIN_FOLD_COUNT;
    const shown = fold ? big : c.children;

    for (const s of shown) {
      push({ id: `sub:${s.id}`, label: s.name, value: s.amount, depth: 3, color: c.color, kind: 'sub', share: share(s.amount) });
      links.push({ id: `l:sub:${s.id}`, source: `cat:${c.id}`, target: `sub:${s.id}`, value: s.amount });
    }

    if (fold) {
      const rest = small.reduce((n, s) => n + s.amount, 0);
      push({
        // NOT "Other (n)": there is already a category called Other, and a
        // chart that shows three unrelated things under one word is worse
        // than one that shows a longer word.
        id: `sub:${c.id}:other`, label: `+${small.length} smaller`, value: rest, depth: 3,
        color: c.color, kind: 'sub', share: share(rest),
        detail: small.map((s) => `${s.name} — ${(share(s.amount) * 100).toFixed(1)}%`).join('\n'),
      });
      links.push({ id: `l:sub:${c.id}:other`, source: `cat:${c.id}`, target: `sub:${c.id}:other`, value: rest });
    }
  }

  return { nodes, links, totalIncome: t.totalIncome, denominator, deficit };
}

/**
 * Every node's inflow equals its outflow, and each column sums to the
 * denominator (bar depth 3, which is ragged because not every category
 * has children). True by construction; asserted anyway, because "by
 * construction" is a claim about code that keeps getting edited.
 */
export function flowImbalance(g: FlowGraph): number {
  let worst = 0;
  for (const n of g.nodes) {
    if (n.kind === 'sub' || n.kind === 'savings' || n.kind === 'deficit') continue;
    const out = g.links.filter((l) => l.source === n.id).reduce((s, l) => s + l.value, 0);
    if (out === 0) continue;   // a leaf category with no children
    worst = Math.max(worst, Math.abs(out - n.value));
  }
  const inflow = g.links.filter((l) => l.target === 'trunk').reduce((s, l) => s + l.value, 0);
  if (g.nodes.length) worst = Math.max(worst, Math.abs(inflow - g.denominator));
  return worst;
}

// ---- Verdicts ------------------------------------------------

export type Verdict = { health: Health; label: string; meaning: string };

/**
 * The hero metric. Monarch shows the savings rate as the fourth stat card
 * with no interpretation; here it is the number the module is about, and
 * it carries a judgement like every other number in the suite.
 *
 * Bands are the common planning rule of thumb (the 20 in 50/30/20), not a
 * measurement. Anything that shows this must say where it comes from.
 */
export function rateSavings(rate: number | null): Verdict | null {
  if (rate === null) return null;
  if (rate < 0) return {
    health: 'bad', label: 'spending over',
    meaning: 'This month spent more than it earned, so the gap came out of savings or onto credit.',
  };
  if (rate < 0.10) return {
    health: 'bad', label: 'thin',
    meaning: 'Under 10% leaves little room for a bad month, and it is the range where one repair bill becomes debt.',
  };
  if (rate < 0.20) return {
    health: 'ok', label: 'on track',
    meaning: 'Between 10% and 20% is the range most planning advice targets.',
  };
  return {
    health: 'good', label: 'strong',
    meaning: 'Above 20% builds a cushion quickly and buys the option to stop working sooner.',
  };
}

/**
 * A category against its rule-of-thumb share of income. This is what the
 * reference apps do not do: Monarch shows "Groceries $800" and stops, so
 * you are left to decide on your own whether $800 is a lot.
 */
export function rateCategory(c: CategoryTotal, totalIncome: number): Verdict | null {
  if (totalIncome <= 0) return null;
  const [lo, hi] = CATEGORY_BY_ID[c.id].typical;
  const share = c.total / totalIncome;
  const band = `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`;
  const got = `${(share * 100).toFixed(1)}% of income`;
  if (share > hi) return {
    health: 'bad', label: 'high', meaning: `${got}, against a typical ${band}.`,
  };
  if (share < lo) return {
    health: 'good', label: 'low', meaning: `${got}, under the typical ${band}.`,
  };
  return {
    health: 'ok', label: 'normal', meaning: `${got}, inside the typical ${band}.`,
  };
}

/** Cash on hand divided by average monthly spend. Months of cover. */
export function runway(cashOnHand: number | null, avgMonthlyExpenses: number): number | null {
  if (cashOnHand === null || !isFinite(cashOnHand) || cashOnHand < 0) return null;
  if (avgMonthlyExpenses <= 0) return null;
  return cashOnHand / avgMonthlyExpenses;
}

// ---- Sample -------------------------------------------------

// A plausible month, so the module says something the first time it is
// opened. Savings lands at 19.7%, inside the "on track" band, which is a
// more useful starting point than either extreme.
export const SAMPLE_MONTH: MonthEntry = {
  month: '2026-05',
  income: { paycheck: 8600, business: 1500, interest: 234 },
  spend: {
    rent_mortgage: 2800, home_upkeep: 600,
    groceries: 800, restaurants: 500, coffee: 200,
    auto_payment: 420, gas: 160, auto_upkeep: 60,
    electricity: 200, water: 60, internet: 90, phone: 85, garbage: 50,
    general_shop: 400, clothing: 300,
    vacation: 900, entertainment: 200,
    insurance_health: 240, fitness: 45,
    pets: 80, gifts: 50, misc: 60,
  },
};

// A few months of history, so the cash-flow chart has a shape and the
// run rate is an average rather than one reading. February is deliberately
// a deficit month: the diagram has to handle a negative savings figure,
// and a sample that only ever shows good months would never exercise it.
function shift(base: MonthEntry, month: MonthKey, income: number, spend: number): MonthEntry {
  const scale = (rec: Record<string, number | null | undefined>, k: number) =>
    Object.fromEntries(
      Object.entries(rec).map(([id, v]) => [id, typeof v === 'number' ? Math.round(v * k) : v])
    );
  return {
    month,
    income: scale(base.income, income) as MonthEntry['income'],
    spend: scale(base.spend, spend) as MonthEntry['spend'],
  };
}

export const SAMPLE_BUDGET: BudgetData = {
  months: [
    shift(SAMPLE_MONTH, '2026-01', 0.97, 0.94),
    shift(SAMPLE_MONTH, '2026-02', 0.82, 1.19),   // low income, holiday spending
    shift(SAMPLE_MONTH, '2026-03', 1.01, 0.98),
    shift(SAMPLE_MONTH, '2026-04', 0.99, 1.05),
    SAMPLE_MONTH,
  ],
  cashOnHand: 24000,
};

// ---- Across months -------------------------------------------

export type Series = {
  months: MonthTotals[];          // oldest first
  avgIncome: number;
  avgExpenses: number;
  avgSavings: number;
  // Savings rate of the WHOLE period, not the mean of the monthly rates.
  // Averaging rates weights a $500 month the same as a $9,000 one.
  overallSavingsRate: number | null;
};

export function computeSeries(entries: MonthEntry[]): Series {
  const months = [...entries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(computeMonth);

  const withData = months.filter((m) => m.hasData);
  const n = withData.length || 1;
  const income = withData.reduce((s, m) => s + m.totalIncome, 0);
  const expenses = withData.reduce((s, m) => s + m.totalExpenses, 0);

  return {
    months,
    avgIncome: income / n,
    avgExpenses: expenses / n,
    avgSavings: (income - expenses) / n,
    overallSavingsRate: income > 0 ? (income - expenses) / income : null,
  };
}

/** Twelve months at the current run rate. Feeds MonteVue's retirement engine. */
export function annualSavings(s: Series): number {
  return s.avgSavings * 12;
}

// ---- What-if -------------------------------------------------

// A multiplier per subcategory: 0.7 means "spend 30% less on this".
export type WhatIf = Partial<Record<SubcategoryId, number>>;

/**
 * Re-run a month with some lines scaled. Returns a MonthEntry, not
 * totals, so everything downstream (the Sankey, the verdicts, the
 * savings rate) recomputes through exactly the same path as real data.
 * Two code paths for "the numbers" is how a displayed figure drifts from
 * the one actually used.
 *
 * Only VARIABLE lines are adjustable. Offering a slider on rent implies a
 * choice that is not on the table this month, and a savings rate built on
 * pretending otherwise is worth nothing.
 */
export function applyWhatIf(entry: MonthEntry, what: WhatIf): MonthEntry {
  const spend: MonthEntry['spend'] = { ...entry.spend };
  for (const [id, mult] of Object.entries(what)) {
    const sub = SUBCATEGORY_BY_ID[id];
    if (!sub || sub.fixed) continue;
    const base = spend[id];
    if (typeof base !== 'number' || !isFinite(base)) continue;
    if (typeof mult !== 'number' || !isFinite(mult)) continue;
    spend[id] = Math.max(0, base * Math.max(0, mult));
  }
  return { ...entry, spend };
}

export function isWhatIfActive(what: WhatIf): boolean {
  return Object.values(what).some((v) => typeof v === 'number' && Math.abs(v - 1) > 1e-9);
}

// ---- Persistence reviver -------------------------------------

/**
 * Storage can fail in the one way that matters: succeeding with the wrong
 * shape. Anything that does not survive this becomes a null, and nulls are
 * skipped when summing, so a corrupt file degrades to a blank month rather
 * than to a wrong total.
 */
export function reviveBudget(raw: unknown, fallback: BudgetData): BudgetData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BudgetData>;
  if (!Array.isArray(r.months)) return null;

  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

  const months: MonthEntry[] = [];
  for (const m of r.months) {
    if (!m || typeof m !== 'object') continue;
    const e = m as Partial<MonthEntry>;
    if (typeof e.month !== 'string' || !/^\d{4}-\d{2}$/.test(e.month)) continue;

    const income: MonthEntry['income'] = {};
    for (const s of INCOME_SOURCES) {
      const v = num((e.income as Record<string, unknown>)?.[s.id]);
      if (v !== null) income[s.id] = v;
    }
    const spend: MonthEntry['spend'] = {};
    for (const s of SUBCATEGORIES) {
      const v = num((e.spend as Record<string, unknown>)?.[s.id]);
      if (v !== null) spend[s.id] = v;
    }
    months.push({ month: e.month, income, spend });
  }

  if (months.length === 0) return null;
  return { months, cashOnHand: num(r.cashOnHand) ?? fallback.cashOnHand };
}
