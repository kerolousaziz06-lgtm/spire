// ============================================================
// CrashChart.tsx — draws a portfolio's DETERMINISTIC path through
// one historical crash: a line falling to the trough, then
// recovering. The trough is marked, and a dashed line shows the
// starting value so the drop is obvious.
// ============================================================
import { useState } from 'react';
import type { CrashResult } from '../lib/crashes';
import { fmtMoneyShort, fmtMoney, fmtPct } from '../lib/format';
import './CrashChart.css';

const W = 640, H = 300, PAD_L = 8, PAD_R = 8, PAD_T = 16, PAD_B = 28;

export function CrashChart({ result }: { result: CrashResult }) {
  const [hoverM, setHoverM] = useState<number | null>(null);
  const { path, startValue, event } = result;

  if (startValue === 0) {
    return <div className="crash-empty">Add assets to replay this crash.</div>;
  }

  const values = path.map((p) => p.value);
  const maxVal = Math.max(...values, startValue) * 1.04;
  const minVal = Math.min(...values) * 0.96;

  const xAt = (m: number) => PAD_L + (m / event.months) * (W - PAD_L - PAD_R);
  const yAt = (v: number) => PAD_T + (1 - (v - minVal) / (maxVal - minVal)) * (H - PAD_T - PAD_B);

  // The value line, split into decline (red-ish) and recovery — we draw
  // one path but color it via a gradient that shifts at the trough.
  const linePts = path.map((p) => `${xAt(p.month)},${yAt(p.value)}`);
  const line = 'M ' + linePts.join(' L ');

  // Area under the line for a subtle fill.
  const area = `M ${xAt(0)},${yAt(startValue)} L ` +
    path.map((p) => `${xAt(p.month)},${yAt(p.value)}`).join(' L ') +
    ` L ${xAt(event.months)},${H - PAD_B} L ${xAt(0)},${H - PAD_B} Z`;

  const troughPt = path.reduce((lo, p) => (p.value < lo.value ? p : lo), path[0]);

  const readM = hoverM ?? troughPt.month;
  const readPt = path[readM] ?? troughPt;
  const readDrop = (readPt.value - startValue) / startValue;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = Math.min(1, Math.max(0, (relX - PAD_L) / (W - PAD_L - PAD_R)));
    setHoverM(Math.round(frac * event.months));
  }

  const down = readDrop < 0;

  return (
    <div className="crash-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="crash-svg"
        onMouseMove={onMove} onMouseLeave={() => setHoverM(null)}
        role="img" aria-label={`${event.name}: portfolio fell ${fmtPct(result.troughDrop)} at the trough.`}>
        <defs>
          <linearGradient id="crashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* starting-value reference line */}
        <line x1={PAD_L} x2={W - PAD_R} y1={yAt(startValue)} y2={yAt(startValue)}
          stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
        <text x={PAD_L + 2} y={yAt(startValue) - 6} className="crash-axis">start</text>

        <path d={area} fill="url(#crashArea)" />
        <path d={line} fill="none" stroke="var(--loss)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" className="crash-line" />

        {/* trough marker */}
        <circle cx={xAt(troughPt.month)} cy={yAt(troughPt.value)} r="4"
          fill="var(--bg-card)" stroke="var(--loss)" strokeWidth="2" />
        <text x={xAt(troughPt.month)} y={yAt(troughPt.value) + 20} className="crash-trough-label"
          textAnchor="middle">bottom {fmtPct(result.troughDrop)}</text>

        {/* hover guide */}
        {hoverM !== null && (
          <>
            <line x1={xAt(readM)} x2={xAt(readM)} y1={PAD_T} y2={H - PAD_B}
              stroke="var(--text-secondary)" strokeWidth="1" opacity="0.3" />
            <circle cx={xAt(readM)} cy={yAt(readPt.value)} r="3.5"
              fill="#fff" stroke="var(--loss)" strokeWidth="2" />
          </>
        )}

        {/* month axis (skip any too close to the 'start' label) */}
        {path.filter((p) => p.month !== 0 && p.month / event.months > 0.1 && (p.month % Math.ceil(event.months / 5) === 0 || p.month === event.months)).map((p) => (
          <text key={p.month} x={xAt(p.month)} y={H - 8} className="crash-axis"
            textAnchor={p.month === event.months ? 'end' : 'middle'}>
            {`m${p.month}`}
          </text>
        ))}
        <text x={PAD_L} y={H - 8} className="crash-axis" textAnchor="start">start</text>
      </svg>

      <div className="crash-tooltip">
        <span className="crash-tt-month">{readM === 0 ? 'Start' : `Month ${readM}`}</span>
        <div className="crash-tt-row">
          <span className="crash-tt-val tabular">{fmtMoneyShort(readPt.value)}</span>
          <span className={`crash-tt-drop tabular ${down ? 'is-down' : 'is-up'}`}>
            {down ? '' : '+'}{fmtPct(readDrop)}
          </span>
        </div>
        <div className="crash-tt-start tabular">from {fmtMoney(startValue)}</div>
      </div>
    </div>
  );
}
