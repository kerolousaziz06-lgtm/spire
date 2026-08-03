// ============================================================
// mna.ts — accretion / dilution for an acquisition.
//
// The question: if this company buys that one, does the acquirer's
// earnings per share go UP or DOWN? That is the number a board asks
// about first, and it is not the same question as "is this a good
// price" — a deal can be accretive and still destroy value.
//
// The mechanism in one line: you add the target's earnings, subtract the
// cost of paying for it (interest on new debt, interest given up on cash
// spent), and divide by a share count that grew if you paid in stock.
// Whether EPS rises depends on which of those two grew faster.
//
// Pure functions. Numbers in, numbers out.
// ============================================================

export type MnaCompany = {
  netIncome: number;
  sharesOutstanding: number;
  sharePrice: number;
};

export type MnaDeal = {
  offerPricePerShare: number;
  // Fractions of the offer value. The caller is responsible for these
  // summing to 1; `mixSum` in the result reports what was actually given
  // so a UI can surface a mistake rather than silently under-funding.
  pctStock: number;
  pctCash: number;
  pctDebt: number;
  debtRate: number;      // interest rate on the new borrowing
  cashRate: number;      // return given up on the cash spent
  taxRate: number;
  synergies: number;     // annual PRE-TAX cost savings, 0 if none claimed
};

export type MnaResult = {
  // ---- standalone ----
  acquirerEps: number;
  targetEps: number;
  acquirerPe: number | null;
  targetPeAtOffer: number | null;

  // ---- the offer ----
  offerValue: number;
  premium: number;              // over the target's market price
  mixSum: number;               // should be 1

  // ---- funding ----
  stockConsideration: number;
  cashConsideration: number;
  debtConsideration: number;
  newSharesIssued: number;
  newInterest: number;          // pre-tax
  forgoneInterest: number;      // pre-tax

  // ---- pro forma ----
  proFormaNetIncome: number;
  proFormaShares: number;
  proFormaEps: number;

  // null when the acquirer has no positive standalone EPS to compare
  // against: "accretion" would be a ratio to zero or a negative base,
  // which reads as a number but means nothing.
  accretion: number | null;
  verdict: 'accretive' | 'neutral' | 'dilutive' | null;

  // ---- where the EPS change came from ----
  // Each is the EPS effect of one piece, so they sum to the total change.
  bridge: {
    targetEarnings: number;
    synergies: number;
    financingCost: number;
    dilutionFromShares: number;
  };

  // ---- breakevens ----
  breakevenOfferPrice: number | null;   // price at which accretion = 0
  breakevenSynergies: number | null;    // synergies needed at this price

  // Structural problems with the deal itself. An error means the verdict
  // is withheld rather than shown.
  issues: DealIssue[];
};

// ============================================================
// Deal sanity — the same rule as Vantage's reconciliation.
//
// The arithmetic will happily price a takeover at a 74% DISCOUNT to the
// market and report the result as accretive. It is not wrong; it is
// answering a question about a deal that cannot happen, because no
// shareholder tenders below the market price. Rating that "accretive"
// is the plausible-looking wrong answer this codebase keeps producing.
// ============================================================

export type DealSeverity = 'error' | 'caution';
export type DealIssue = { id: string; severity: DealSeverity; message: string };

export function dealIssues(
  acquirer: MnaCompany, target: MnaCompany, deal: MnaDeal, premium: number, mixSum: number
): DealIssue[] {
  const out: DealIssue[] = [];
  const err = (id: string, message: string) => out.push({ id, severity: 'error', message });
  const caution = (id: string, message: string) => out.push({ id, severity: 'caution', message });

  if (deal.offerPricePerShare <= 0) {
    err('offer', 'The offer per share must be greater than zero.');
  }
  if (target.sharesOutstanding <= 0) {
    err('tshares', 'The target needs a share count greater than zero, or there is nothing to buy.');
  }
  if (acquirer.sharesOutstanding <= 0) {
    err('ashares', 'The acquirer needs a share count greater than zero to have an EPS at all.');
  }
  if (deal.pctStock > 0 && acquirer.sharePrice <= 0) {
    err('astock', 'Paying in stock requires an acquirer share price: the number of new shares is the stock consideration divided by it.');
  }
  if (Math.abs(mixSum - 1) > 0.001) {
    err('mix', `Stock, cash and debt come to ${(mixSum * 100).toFixed(0)}% of the offer. They must fund exactly 100% of it.`);
  }

  // Possible, but rare enough that it is almost always a typo.
  if (target.sharePrice > 0 && premium < 0) {
    caution('discount', `The offer is ${Math.abs(premium * 100).toFixed(1)}% BELOW the target's market price. Take-unders happen in distress, but shareholders do not normally tender below what they can get on the open market.`);
  }
  if (premium > 1) {
    caution('rich', `A ${(premium * 100).toFixed(0)}% premium is very high. Check the offer price and the target's market price.`);
  }
  if (deal.taxRate < 0 || deal.taxRate > 0.6) {
    caution('tax', 'That tax rate is outside any normal corporate range.');
  }
  return out;
}

const safeDiv = (a: number, b: number): number | null =>
  b === 0 || !Number.isFinite(a / b) ? null : a / b;

export function runMna(acquirer: MnaCompany, target: MnaCompany, deal: MnaDeal): MnaResult {
  const t = deal.taxRate;
  const keep = 1 - t; // after-tax factor for anything tax-affected

  const acquirerEps = acquirer.sharesOutstanding > 0
    ? acquirer.netIncome / acquirer.sharesOutstanding : 0;
  const targetEps = target.sharesOutstanding > 0
    ? target.netIncome / target.sharesOutstanding : 0;

  const acquirerPe = safeDiv(acquirer.sharePrice, acquirerEps);
  const targetPeAtOffer = safeDiv(deal.offerPricePerShare, targetEps);

  // What the acquirer is agreeing to pay in total.
  const offerValue = target.sharesOutstanding * deal.offerPricePerShare;
  const premium = target.sharePrice > 0
    ? deal.offerPricePerShare / target.sharePrice - 1 : 0;

  const mixSum = deal.pctStock + deal.pctCash + deal.pctDebt;

  const stockConsideration = offerValue * deal.pctStock;
  const cashConsideration = offerValue * deal.pctCash;
  const debtConsideration = offerValue * deal.pctDebt;

  // Paying in stock means printing shares at the acquirer's own price.
  const newSharesIssued = acquirer.sharePrice > 0
    ? stockConsideration / acquirer.sharePrice : 0;

  // Two costs of paying: interest owed on the new debt, and the interest
  // the acquirer stops earning on the cash it hands over.
  const newInterest = debtConsideration * deal.debtRate;
  const forgoneInterest = cashConsideration * deal.cashRate;

  // Interest is deductible and synergies are taxed, so every adjustment
  // below the two net-income lines is after-tax.
  const adjustments = (deal.synergies - newInterest - forgoneInterest) * keep;
  const proFormaNetIncome = acquirer.netIncome + target.netIncome + adjustments;
  const proFormaShares = acquirer.sharesOutstanding + newSharesIssued;
  const proFormaEps = proFormaShares > 0 ? proFormaNetIncome / proFormaShares : 0;

  const issues = dealIssues(acquirer, target, deal, premium, mixSum);
  const hasError = issues.some((i) => i.severity === 'error');

  // Accretion needs a positive standalone EPS to compare against AND a
  // deal that could actually happen.
  const comparable = acquirerEps > 0 && proFormaShares > 0 && !hasError;
  const accretion = comparable ? proFormaEps / acquirerEps - 1 : null;
  const verdict: MnaResult['verdict'] =
    accretion === null ? null
      : Math.abs(accretion) < 0.0005 ? 'neutral'
      : accretion > 0 ? 'accretive' : 'dilutive';

  // Attribution. Each term is measured at the PRO-FORMA share count so
  // the four add up to the actual EPS change; splitting the denominator
  // effect out as its own term is what makes the bridge reconcile.
  const bridge = {
    targetEarnings: proFormaShares > 0 ? target.netIncome / proFormaShares : 0,
    synergies: proFormaShares > 0 ? (deal.synergies * keep) / proFormaShares : 0,
    financingCost: proFormaShares > 0
      ? (-(newInterest + forgoneInterest) * keep) / proFormaShares : 0,
    dilutionFromShares: proFormaShares > 0
      ? acquirer.netIncome / proFormaShares - acquirerEps : 0,
  };

  // ---- Breakeven offer price ----
  // Linear in the offer value V, so it solves in closed form. With
  //   m = pctStock / acquirerPrice        (new shares per unit of V)
  //   k = (debtRate*pctDebt + cashRate*pctCash) * keep   (after-tax cost per unit of V)
  // setting proFormaEps = acquirerEps and using acquirerEps * acquirerShares
  // = acquirerNetIncome collapses to:
  //   V* = (targetNetIncome + synergies*keep) / (acquirerEps * m + k)
  const m = acquirer.sharePrice > 0 ? deal.pctStock / acquirer.sharePrice : 0;
  const k = (deal.debtRate * deal.pctDebt + deal.cashRate * deal.pctCash) * keep;
  const denom = acquirerEps * m + k;
  const breakevenOfferPrice =
    comparable && denom > 0 && target.sharesOutstanding > 0
      ? (target.netIncome + deal.synergies * keep) / denom / target.sharesOutstanding
      : null;

  // ---- Breakeven synergies at the CURRENT offer price ----
  // From proFormaEps = acquirerEps:
  //   synergies = interestCost + (acquirerEps * newShares - targetNetIncome) / keep
  // A negative answer means the deal is already accretive with room to spare.
  const breakevenSynergies = comparable && keep > 0
    ? newInterest + forgoneInterest + (acquirerEps * newSharesIssued - target.netIncome) / keep
    : null;

  return {
    acquirerEps, targetEps, acquirerPe, targetPeAtOffer,
    offerValue, premium, mixSum,
    stockConsideration, cashConsideration, debtConsideration,
    newSharesIssued, newInterest, forgoneInterest,
    proFormaNetIncome, proFormaShares, proFormaEps,
    accretion, verdict, bridge,
    breakevenOfferPrice, breakevenSynergies,
    issues,
  };
}
