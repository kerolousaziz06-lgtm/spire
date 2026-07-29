// ============================================================
// EfficientFrontier.tsx — the iconic Modern Portfolio Theory visual.
//
// Plots a cloud of possible portfolios by RISK (x) vs RETURN (y).
// The upper-left boundary is the "efficient frontier": the best
// return for each risk level. The user's current portfolio is a
// bright marker — you can see if it sits near the frontier (efficient)
// or below it (leaving return on the table for its risk).
// ============================================================
import { useState } from 'react';
import type { FrontierPoint } from '../lib/risk';
import { fmtPct } from '../lib/format';
import './EfficientFrontier.css';

type Props = { cloud: FrontierPoint[]; current: FrontierPoint | null };

const W = 460, H = 300, PAD_L = 44, PAD_R = 16, PAD_T = 16, PAD_B = 36;

export function EfficientFrontier({ cloud, current }: Props) {
  const [hoverCurrent, setHoverCurrent] = useState(false);

  if (cloud.length < 2) {
    return <div className="ef-empty">Hold at least two assets to map the risk–return frontier.</div>;
  }

  const risks = cloud.map((p) => p.risk);
  const rets = cloud.map((p) => p.ret);
  const minRisk = Math.min(...risks) * 0.9;
  const maxRisk = Math.max(...risks) * 1.05;
  const minRet = Math.min(...rets) * 0.9;
  const maxRet = Math.max(...rets) * 1.05;

  const xAt = (risk: number) => PAD_L + ((risk - minRisk) / (maxRisk - minRisk)) * (W - PAD_L - PAD_R);
  const yAt = (ret: number) => PAD_T + (1 - (ret - minRet) / (maxRet - minRet)) * (H - PAD_T - PAD_B);

  // Approximate the efficient frontier line: bucket by risk, take the
  // max return in each bucket, connect those points.
  const buckets = 24;
  const best: (FrontierPoint | null)[] = new Array(buckets).fill(null);
  for (const p of cloud) {
    const b = Math.min(buckets - 1, Math.floor(((p.risk - minRisk) / (maxRisk - minRisk)) * buckets));
    if (b >= 0 && (!best[b] || p.ret > best[b]!.ret)) best[b] = p;
  }
  const frontierPts = best.filter((p): p is FrontierPoint => p !== null);
  const frontierPath = frontierPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(p.risk)} ${yAt(p.ret)}`).join(' ');

  return (
    <div className="ef">
      <svg viewBox={`0 0 ${W} ${H}`} className="ef-svg" role="img"
        aria-label="Risk versus return scatter of possible portfolios, with the efficient frontier and your portfolio marked.">
        {/* axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--border-strong)" strokeWidth="1" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--border-strong)" strokeWidth="1" />

        {/* y gridlines + labels (return) */}
        {[0, 0.5, 1].map((f) => {
          const ret = minRet + f * (maxRet - minRet);
          const y = yAt(ret);
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} className="ef-axis" textAnchor="end">{fmtPct(ret, 0)}</text>
            </g>
          );
        })}
        {/* x labels (risk) */}
        {[0, 0.5, 1].map((f) => {
          const risk = minRisk + f * (maxRisk - minRisk);
          return (
            <text key={f} x={xAt(risk)} y={H - PAD_B + 16} className="ef-axis" textAnchor="middle">
              {fmtPct(risk, 0)}
            </text>
          );
        })}

        {/* the cloud of portfolios */}
        {cloud.map((p, i) => (
          <circle key={i} cx={xAt(p.risk)} cy={yAt(p.ret)} r="2.2"
            fill="var(--accent)" opacity="0.28" />
        ))}

        {/* the efficient frontier line */}
        <path d={frontierPath} fill="none" stroke="var(--accent-bright)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="ef-frontier" />

        {/* the user's current portfolio */}
        {current && (
          <g onMouseEnter={() => setHoverCurrent(true)} onMouseLeave={() => setHoverCurrent(false)}>
            <circle cx={xAt(current.risk)} cy={yAt(current.ret)} r="9"
              fill="var(--accent-glow)" opacity="0.5" className="ef-you-halo" />
            <circle cx={xAt(current.risk)} cy={yAt(current.ret)} r="5"
              fill="#fff" stroke="var(--accent-bright)" strokeWidth="2.5" />
            {hoverCurrent && (
              <text x={xAt(current.risk)} y={yAt(current.ret) - 14} className="ef-you-label" textAnchor="middle">
                you
              </text>
            )}
          </g>
        )}

        {/* axis titles */}
        <text x={(W) / 2} y={H - 4} className="ef-axistitle" textAnchor="middle">Risk (volatility) →</text>
        <text x={12} y={H / 2} className="ef-axistitle" textAnchor="middle"
          transform={`rotate(-90 12 ${H / 2})`}>Return →</text>
      </svg>

      <div className="ef-footer">
        <span className="ef-key"><span className="ef-dot ef-dot-you" /> your portfolio</span>
        <span className="ef-key"><span className="ef-line" /> efficient frontier</span>
        <span className="ef-key"><span className="ef-dot ef-dot-cloud" /> possible mixes</span>
        {current && (
          <span className="ef-current tabular">
            {fmtPct(current.ret, 1)} return · {fmtPct(current.risk, 1)} risk
          </span>
        )}
      </div>
    </div>
  );
}
