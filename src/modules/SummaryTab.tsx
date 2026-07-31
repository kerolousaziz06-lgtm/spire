// ============================================================
// SummaryTab.tsx — the "so what?" view.
//
// Pulls the headline from both halves into one executive verdict:
// is it a good business (quality), and is it worth the price
// (value)? The synthesis is the analyst-level payoff — quality and
// value are different questions, and a company can be strong on one
// and weak on the other.
// ============================================================
import { useMemo } from 'react';
import type { CompanyInput, Metric, Health, CompanyField } from '../lib/analysis';
import { MissingData } from '../components/MissingData';
import { profitability, liquidity, leverage, efficiency, missingFields } from '../lib/analysis';
import { runDcf } from '../lib/dcf';
import { Card } from '../components/Card';
import './SummaryTab.css';

function overall(all: Metric[]): Health {
  const score = all.reduce((s, m) => s + (m.health === 'good' ? 1 : m.health === 'ok' ? 0 : -1), 0);
  if (score > all.length * 0.3) return 'good';
  if (score < -all.length * 0.2) return 'bad';
  return 'ok';
}

// The verdict combines quality (ratios) and value (DCF). Without the
// valuation inputs there is no "is it worth the price?" half, so the
// combined verdict is withheld rather than half-computed.
const VALUE_REQUIRES: readonly CompanyField[] = [
  'operatingCashFlow', 'capex', 'totalDebt', 'cash', 'sharesOutstanding', 'sharePrice',
];

export function SummaryTab({ input }: { input: CompanyInput }) {
  const missingValue = missingFields(input, VALUE_REQUIRES);
  const all = useMemo(
    () => [...profitability(input), ...liquidity(input), ...leverage(input), ...efficiency(input)],
    [input]
  );
  const quality = overall(all);

  // Computed unconditionally to keep hook order stable; never rendered
  // when `missingValue` is non-empty.
  const dcf = useMemo(() => runDcf({
    baseFcf: Math.max(0, (input.operatingCashFlow ?? 0) - (input.capex ?? 0)),
    growth: 0.08, years: 10, terminalGrowth: 0.025, discountRate: 0.09,
    netDebt: (input.totalDebt ?? 0) - (input.cash ?? 0),
    sharesOutstanding: input.sharesOutstanding ?? 0, sharePrice: input.sharePrice ?? 0,
  }), [input]);

  const qualityWord = quality === 'good' ? 'a healthy, well-run business'
    : quality === 'ok' ? 'a mixed-quality business' : 'a financially strained business';
  const valueWord = dcf.verdict === 'undervalued' ? 'trading below its intrinsic value'
    : dcf.verdict === 'fair' ? 'trading near its intrinsic value' : 'trading above its intrinsic value';

  // The combined one-liner — the crux of the analyst's judgment.
  const headline = buildHeadline(quality, dcf.verdict);

  const strengths = all.filter((m) => m.health === 'good').slice(0, 4);
  const concerns = all.filter((m) => m.health === 'bad').slice(0, 4);

  if (missingValue.length > 0) {
    return (
      <div className="summary">
        <MissingData what="the combined verdict" fields={missingValue} />
      </div>
    );
  }

  // Narrowed by the guard above: the DCF inputs are all present here.
  const sharePrice = input.sharePrice as number;

  return (
    <div className="summary">
      <Card glow delay={0} className="summary-hero">
        <div className="summary-eyebrow">EXECUTIVE VERDICT</div>
        <h1 className="summary-headline">{headline}</h1>
        <p className="summary-detail">
          The fundamentals point to {qualityWord}, and at your DCF assumptions it's {valueWord}
          {' '}({dcf.upside >= 0 ? '+' : ''}{(dcf.upside * 100).toFixed(0)}% vs. price).
          {' '}Quality and value are separate questions — this combines both.
        </p>
      </Card>

      <div className="summary-cols">
        <Card delay={1} className="summary-col">
          <h2 className="section-title">Quality — is it a good business?</h2>
          <div className={`summary-verdict summary-verdict--${quality}`}>
            {quality === 'good' ? 'Healthy' : quality === 'ok' ? 'Mixed' : 'Strained'}
          </div>
          <div className="summary-list-label">Key strengths</div>
          {strengths.length ? strengths.map((m) => (
            <div key={m.key} className="summary-item">
              <span className="summary-dot summary-dot--good" />
              <span>{m.label} <span className="tabular summary-item-val">{m.display}</span></span>
            </div>
          )) : <div className="summary-empty">No standout strengths.</div>}
          {concerns.length > 0 && (
            <>
              <div className="summary-list-label">Watch-outs</div>
              {concerns.map((m) => (
                <div key={m.key} className="summary-item">
                  <span className="summary-dot summary-dot--bad" />
                  <span>{m.label} <span className="tabular summary-item-val">{m.display}</span></span>
                </div>
              ))}
            </>
          )}
        </Card>

        <Card delay={2} className="summary-col">
          <h2 className="section-title">Value — is it worth the price?</h2>
          <div className={`summary-verdict summary-verdict--${dcf.verdict === 'undervalued' ? 'good' : dcf.verdict === 'fair' ? 'ok' : 'bad'}`}>
            {dcf.verdict === 'undervalued' ? 'Undervalued' : dcf.verdict === 'fair' ? 'Fair' : 'Overvalued'}
          </div>
          <div className="summary-val-rows">
            <div className="summary-val-row">
              <span>Intrinsic value / share</span>
              <span className="tabular">${dcf.intrinsicPerShare.toFixed(2)}</span>
            </div>
            <div className="summary-val-row">
              <span>Market price</span>
              <span className="tabular">${sharePrice.toFixed(2)}</span>
            </div>
            <div className="summary-val-row summary-val-row--emph">
              <span>Upside / downside</span>
              <span className={`tabular ${dcf.upside >= 0 ? 'is-up' : 'is-down'}`}>
                {dcf.upside >= 0 ? '+' : ''}{(dcf.upside * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <p className="summary-val-note">
            Based on a 10-year DCF at 8% growth, 2.5% terminal, 9% discount. Tune these on the Valuation tab.
          </p>
        </Card>
      </div>
    </div>
  );
}

// The 3×3 of quality × value produces the honest combined take.
function buildHeadline(q: Health, v: 'undervalued' | 'fair' | 'overvalued'): string {
  const goodBiz = q === 'good';
  const badBiz = q === 'bad';
  if (goodBiz && v === 'undervalued') return 'A strong business at an attractive price.';
  if (goodBiz && v === 'fair') return 'A quality business, fairly priced.';
  if (goodBiz && v === 'overvalued') return 'A great business — but you may be paying up for it.';
  if (badBiz && v === 'undervalued') return 'Cheap, but for reasons — weak fundamentals.';
  if (badBiz && v === 'overvalued') return 'Weak fundamentals and a rich price — proceed carefully.';
  if (badBiz) return 'A financially strained business near fair value.';
  if (v === 'undervalued') return 'A mixed business trading below intrinsic value.';
  if (v === 'overvalued') return 'A mixed business trading above intrinsic value.';
  return 'A mixed-quality business, fairly valued.';
}
