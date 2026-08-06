// ============================================================
// CashFlowChart.tsx — income against expenses, month by month.
//
// The bars are OVERLAID, not stacked and not diverging: expenses drawn
// from the baseline in terracotta, income drawn from the same baseline in
// sage BEHIND them. So the sage visible above the terracotta is the
// amount saved, and a month that overspent shows terracotta rising past
// the sage. One bar carries three quantities.
//
// This follows the reference rather than the diverging version in the
// spec (income above the axis, expenses below). Diverging needs twice the
// height to say less, and it cannot show a deficit without the reader
// comparing two lengths in opposite directions.
//
// The bone line is net saved, on the same dollar axis.
// ============================================================
import { useState } from 'react';
import type { MonthTotals } from '../lib/budget';
import { monthKey } from '../lib/budget';
import { fmtMoney, fmtMoneyShort } from '../lib/format';
import { useElementSize } from '../lib/hooks';
import './CashFlowChart.css';

type Props = { months: MonthTotals[] };

const PAD_L = 46, PAD_R = 10, PAD_T = 14, PAD_B = 26;
const W0 = 800, H0 = 220;

export function CashFlowChart({ months }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, w: mw, h: mh } = useElementSize<HTMLDivElement>();
  const W = mw || W0, H = mh || H0;

  const withData = months.filter((m) => m.hasData);
  if (withData.length === 0) {
    return <div className="cf-wrap" ref={ref}><div className="cf-empty">No months entered yet.</div></div>;
  }

  // The current calendar month is still being lived in, so its bar is
  // partial by definition and is drawn as an outline rather than a solid.
  const nowKey = monthKey(new Date());

  const top = Math.max(...withData.map((m) => Math.max(m.totalIncome, m.totalExpenses))) * 1.12 || 1;

  // The axis has to reach below zero when any month overspent. Clamping
  // the line at 0 instead drew a deficit month as "saved nothing", which
  // is the one month the chart most needs to tell the truth about.
  const worst = Math.min(0, ...withData.map((m) => m.savings));
  const bottom = worst < 0 ? worst * 1.15 : 0;

  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const band = plotW / withData.length;
  const barW = Math.min(38, band * 0.56);

  const xAt = (i: number) => PAD_L + band * (i + 0.5);
  const yAt = (v: number) => PAD_T + plotH * (1 - (v - bottom) / (top - bottom));

  const netLine = withData
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(m.savings)}`)
    .join(' ');

  // Zero and the top always. Zero is the baseline every bar grows from,
  // so it is the one tick that cannot be dropped. The floor is added only
  // when it clears the zero label; otherwise "$0" and "$-2k" stack.
  const ticks = [0, top];
  const third = bottom < 0 ? bottom : top / 2;
  if (Math.abs(yAt(third) - yAt(0)) > 14 && Math.abs(yAt(third) - yAt(top)) > 14) ticks.push(third);

  return (
    <div className="cf-wrap" ref={ref}>
      <svg className="cf-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label="Income and expenses by month">
        {ticks.map((t, i) => (
          <g key={i}>
            <line className={`cf-grid ${t === 0 ? "is-zero" : ""}`} x1={PAD_L} y1={yAt(t)} x2={W - PAD_R} y2={yAt(t)} />
            <text className="cf-tick tabular" x={PAD_L - 8} y={yAt(t) + 3} textAnchor="end">
              {fmtMoneyShort(t)}
            </text>
          </g>
        ))}

        {withData.map((m, i) => {
          const partial = m.month === nowKey;
          const x = xAt(i) - barW / 2;
          return (
            <g key={m.month}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect className="cf-hit" x={xAt(i) - band / 2} y={PAD_T} width={band} height={plotH} />
              {/* income behind */}
              <rect className={`cf-bar cf-bar--in ${partial ? 'is-partial' : ''}`}
                x={x} y={yAt(m.totalIncome)} width={barW} height={Math.max(0, yAt(0) - yAt(m.totalIncome))} />
              {/* expenses in front, same baseline */}
              <rect className={`cf-bar cf-bar--out ${partial ? 'is-partial' : ''}`}
                x={x} y={yAt(m.totalExpenses)} width={barW} height={Math.max(0, yAt(0) - yAt(m.totalExpenses))} />
              <text className="cf-month" x={xAt(i)} y={H - 9} textAnchor="middle">
                {m.month.slice(5)}
              </text>
            </g>
          );
        })}

        <path className="cf-net" d={netLine} />
        {withData.map((m, i) => (
          <circle key={m.month} className={`cf-dot ${hover === i ? 'is-on' : ''}`}
            cx={xAt(i)} cy={yAt(m.savings)} r={hover === i ? 3.5 : 2} />
        ))}
      </svg>

      {hover !== null && withData[hover] && (
        <div className="cf-tip" style={{ left: `${(xAt(hover) / W) * 100}%` }}>
          <div className="cf-tip-month">{withData[hover].month}</div>
          <div className="cf-tip-row"><span>In</span><span className="tabular">{fmtMoney(withData[hover].totalIncome)}</span></div>
          <div className="cf-tip-row"><span>Out</span><span className="tabular">{fmtMoney(withData[hover].totalExpenses)}</span></div>
          <div className={`cf-tip-row is-net ${withData[hover].savings < 0 ? 'is-neg' : ''}`}>
            <span>{withData[hover].savings < 0 ? 'Short' : 'Saved'}</span>
            <span className="tabular">{fmtMoney(Math.abs(withData[hover].savings))}</span>
          </div>
        </div>
      )}

      <div className="cf-legend">
        <span className="cf-key cf-key--in">Income</span>
        <span className="cf-key cf-key--out">Expenses</span>
        <span className="cf-key cf-key--net">Saved</span>
      </div>
    </div>
  );
}
