// ============================================================
// lbo.ts — a leveraged buyout (LBO) engine (pure math).
//
// An LBO models a PE firm buying a company mostly with borrowed
// money, using the company's own cash flow to pay down that debt,
// then selling years later. The equity return is amplified by the
// leverage — the core of private-equity math.
//
// Flow:
//   ENTRY   — buy at (entry multiple × EBITDA); fund with debt + equity
//   OPERATE — EBITDA grows; free cash flow sweeps down the debt
//   EXIT    — sell at (exit multiple × exit EBITDA); repay remaining debt
//   RETURNS — what's left is equity value → MOIC and IRR
//
// MOIC = exit equity / entry equity (a multiple, e.g. 2.5x)
// IRR  = the annualized return that reconciles entry to exit
// ============================================================

export type LboInput = {
  entryEbitda: number;        // EBITDA at purchase
  entryMultiple: number;      // EV / EBITDA paid at entry (e.g. 8.0)
  exitMultiple: number;       // EV / EBITDA received at exit (e.g. 8.5)
  leverage: number;           // debt as a multiple of EBITDA (e.g. 4.0)
  ebitdaGrowth: number;       // annual EBITDA growth (e.g. 0.08)
  years: number;              // hold period (e.g. 5)
  interestRate: number;       // blended rate on the debt (e.g. 0.09)
  fcfConversion: number;      // fraction of EBITDA that becomes debt-paydown cash (e.g. 0.55)
  transactionFees: number;    // fees as fraction of entry EV (e.g. 0.025)
};

export const SAMPLE_LBO: LboInput = {
  entryEbitda: 100,
  entryMultiple: 8.0,
  exitMultiple: 8.0,
  leverage: 4.0,
  ebitdaGrowth: 0.08,
  years: 5,
  interestRate: 0.09,
  fcfConversion: 0.55,
  transactionFees: 0.025,
};

export type LboYear = {
  year: number;
  ebitda: number;
  interest: number;
  fcfForPaydown: number;
  debtStart: number;
  debtEnd: number;
};

export type LboResult = {
  entryEV: number;
  entryDebt: number;
  entryEquity: number;
  schedule: LboYear[];
  exitEbitda: number;
  exitEV: number;
  exitDebt: number;
  exitEquity: number;
  moic: number;
  irr: number;
  // attribution: where did the equity gain come from?
  attribution: {
    ebitdaGrowth: number;
    debtPaydown: number;
    multipleChange: number;
  };
};

export function runLbo(input: LboInput): LboResult {
  const {
    entryEbitda, entryMultiple, exitMultiple, leverage, ebitdaGrowth,
    years, interestRate, fcfConversion, transactionFees,
  } = input;

  // --- ENTRY ---
  const entryEV = entryEbitda * entryMultiple;
  const entryDebt = entryEbitda * leverage;
  const fees = entryEV * transactionFees;
  // equity check = what the PE firm must put in
  const entryEquity = entryEV - entryDebt + fees;

  // --- OPERATE: grow EBITDA, sweep FCF to pay down debt ---
  const schedule: LboYear[] = [];
  let debt = entryDebt;
  let ebitda = entryEbitda;

  for (let y = 1; y <= years; y++) {
    ebitda = ebitda * (1 + ebitdaGrowth);
    const interest = debt * interestRate;
    // cash available to pay down debt = EBITDA-based FCF minus interest
    const fcf = ebitda * fcfConversion - interest;
    const debtStart = debt;
    debt = Math.max(0, debt - Math.max(0, fcf));
    schedule.push({
      year: y, ebitda, interest,
      fcfForPaydown: Math.max(0, fcf),
      debtStart, debtEnd: debt,
    });
  }

  // --- EXIT ---
  const exitEbitda = ebitda;
  const exitEV = exitEbitda * exitMultiple;
  const exitDebt = debt;
  const exitEquity = exitEV - exitDebt;

  // --- RETURNS ---
  const moic = entryEquity > 0 ? exitEquity / entryEquity : 0;
  // IRR from a simple two-point cash flow (−equity now, +equity at exit)
  const irr = entryEquity > 0 && exitEquity > 0
    ? Math.pow(exitEquity / entryEquity, 1 / years) - 1
    : 0;

  // --- ATTRIBUTION: decompose the equity gain into its three drivers ---
  // 1) EBITDA growth at constant (entry) multiple
  const gainFromEbitda = (exitEbitda - entryEbitda) * entryMultiple;
  // 2) multiple change on exit EBITDA
  const gainFromMultiple = exitEbitda * (exitMultiple - entryMultiple);
  // 3) debt paydown (reduction in net debt accrues to equity)
  const gainFromPaydown = entryDebt - exitDebt;

  return {
    entryEV, entryDebt, entryEquity,
    schedule, exitEbitda, exitEV, exitDebt, exitEquity,
    moic, irr,
    attribution: {
      ebitdaGrowth: gainFromEbitda,
      debtPaydown: gainFromPaydown,
      multipleChange: gainFromMultiple,
    },
  };
}
