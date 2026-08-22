// api/_lib/mapCompany.ts
//
// Turns rows from the ingest database into the CompanyInput shape Vantage
// already collects by hand. Pure: no database, no HTTP, no Vercel. That is
// deliberate -- it is the half worth testing, and it is testable only if it
// does not need a serverless runtime to run.
//
// The type is imported TYPE-ONLY, so it is erased at compile time and adds
// no runtime dependency in either direction. It also means the contract is
// checked by the compiler rather than by two lists kept in sync by hand,
// which was the main argument for keeping ingest in this repo at all.
import type { CompanyInput } from '../../src/lib/analysis';

/** One concept as stored: a value and the date it is "as of". */
export type FactRow = { concept: string; value: string | number; as_of: string };

export type MarketRow = {
  price: string | number | null;
  as_of: string;
  age_days: number;
} | null;

// concept name in the database -> field name in CompanyInput.
// Every CompanyInput field except sharePrice, which is in no filing.
const CONCEPT_TO_FIELD: Record<string, keyof CompanyInput> = {
  revenue: 'revenue',
  gross_profit: 'grossProfit',
  operating_income: 'operatingIncome',
  net_income: 'netIncome',
  interest_expense: 'interestExpense',
  total_assets: 'totalAssets',
  current_assets: 'currentAssets',
  inventory: 'inventory',
  cash: 'cash',
  total_liabilities: 'totalLiabilities',
  current_liabilities: 'currentLiabilities',
  total_debt: 'totalDebt',
  shareholders_equity: 'shareholdersEquity',
  operating_cash_flow: 'operatingCashFlow',
  capex: 'capex',
  depreciation_amortization: 'depreciationAmortization',
  shares_outstanding: 'sharesOutstanding',
};

// A figure this far behind the newest figure in the same response is left
// BLANK rather than returned. Measured cause: Apple stopped tagging
// interest expense after FY2023 while everything else runs to 2026, and
// ROIC derives its effective tax rate from it -- so returning the 2023
// figure beside 2026 income yields a confidently wrong ROIC. Blank makes
// Vantage skip the metric and name the missing field, which is the
// behaviour it already implements.
export const STALE_DAYS = 400;

export type Blanked = { field: keyof CompanyInput; reason: string };

export type CompanyPayload = {
  ticker: string;
  name: string;
  cik: string;
  sic: string | null;
  input: CompanyInput;
  meta: {
    asOf: Partial<Record<keyof CompanyInput, string>>;
    blanked: Blanked[];
    /** Price is scraped, not filed. Its age travels with it, always. */
    price: { value: number; asOf: string; ageDays: number } | null;
    priceNote?: string;
  };
};

const EMPTY: CompanyInput = {
  revenue: null, grossProfit: null, operatingIncome: null, netIncome: null,
  interestExpense: null, totalAssets: null, currentAssets: null, inventory: null,
  cash: null, totalLiabilities: null, currentLiabilities: null, totalDebt: null,
  shareholdersEquity: null, operatingCashFlow: null, capex: null,
  depreciationAmortization: null, sharesOutstanding: null, sharePrice: null,
};

const days = (a: string, b: string) =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export function mapCompany(
  identity: { ticker: string; name: string; cik: string; sic: string | null },
  facts: FactRow[],
  market: MarketRow,
): CompanyPayload {
  const input: CompanyInput = { ...EMPTY };
  const asOf: Partial<Record<keyof CompanyInput, string>> = {};
  const blanked: Blanked[] = [];

  const usable = facts.filter((f) => f.concept in CONCEPT_TO_FIELD);
  const newest = usable.reduce<string | null>(
    (n, f) => (n === null || f.as_of > n ? f.as_of : n), null);

  for (const f of usable) {
    const field = CONCEPT_TO_FIELD[f.concept];
    const value = typeof f.value === 'string' ? Number(f.value) : f.value;

    // NUMERIC comes back as a string from pg to avoid precision loss, so a
    // non-finite result here means the row is unusable, not merely absent.
    if (!Number.isFinite(value)) {
      blanked.push({ field, reason: 'value was not a finite number' });
      continue;
    }
    const lag = newest ? days(newest, f.as_of) : 0;
    if (lag > STALE_DAYS) {
      blanked.push({
        field,
        reason: `last reported ${f.as_of}, ${lag} days behind the rest of the filing`,
      });
      continue;
    }
    input[field] = value;
    asOf[field] = f.as_of;
  }

  let price: CompanyPayload['meta']['price'] = null;
  let priceNote: string | undefined;
  if (market && market.price !== null) {
    const value = typeof market.price === 'string'
      ? Number(market.price) : market.price;
    if (Number.isFinite(value) && value > 0) {
      input.sharePrice = value;
      asOf.sharePrice = market.as_of;
      price = { value, asOf: market.as_of, ageDays: market.age_days };
      if (market.age_days > 7) {
        priceNote = `price is ${market.age_days} days old`;
      }
    } else {
      priceNote = 'no usable price on file';
    }
  } else {
    priceNote = 'no market data on file';
  }

  return { ...identity, input, meta: { asOf, blanked, price, priceNote } };
}
