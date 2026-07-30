// ============================================================
// FanChart.tsx — the centerpiece: the "fan of possible futures".
//
// It receives the simulation result and draws, left-to-right by year:
//   • a wide shaded band from the 5th to 95th percentile (the full range)
//   • a darker band from 25th to 75th (the likely middle)
//   • a bright line for the median (p50)
//   • a few faint "spaghetti" sample paths for texture
//   • a hover layer: move your mouse and a tooltip shows that year's
//     median and range.
//
// We build the shapes as SVG <path> strings. A small helper turns a
// (year, dollars) point into an (x, y) pixel position.
// ============================================================
import { useState } from 'react';
import type { SimulationResult } from '../lib/montecarlo';
import { fmtMoneyShort, fmtMoney } from '../lib/format';
import { useElementSize } from '../lib/hooks';
import './FanChart.css';

type Props = { result: SimulationResult };

const PAD_L = 8;    // left padding
const PAD_R = 8;    // right padding
const PAD_T = 16;   // top padding
const PAD_B = 28;   // bottom padding (room for year labels)

// Fallbacks for the first paint, before the wrapper has been measured.
const W0 = 640, H0 = 300;

export function FanChart({ result }: Props) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  // The viewBox tracks the wrapper's real pixel size, so the chart fills the
  // height the grid hands it instead of deriving height from its width.
  const { ref: wrapRef, w: measuredW, h: measuredH } = useElementSize<HTMLDivElement>();
  const W = measuredW || W0;
  const H = measuredH || H0;

  const { bands, years, startValue } = result;
  if (bands.length === 0 || startValue === 0) {
    return <div className="fan-empty">Add some assets to see possible futures.</div>;
  }

  // ---- Figure out the value range so the chart fits vertically ----
  // The top of the chart = a bit above the highest p95; bottom = 0-ish
  // (or just below the lowest p5) so the whole fan is visible.
  const maxVal = Math.max(...bands.map((b) => b.p95)) * 1.05;
  const minVal = Math.min(...bands.map((b) => b.p5)) * 0.9;

  // ---- Coordinate helpers: (year, dollars) -> pixels ----
  const xAt = (year: number) =>
    PAD_L + (year / years) * (W - PAD_L - PAD_R);
  const yAt = (val: number) =>
    PAD_T + (1 - (val - minVal) / (maxVal - minVal)) * (H - PAD_T - PAD_B);

  // Build an SVG path for a line through one percentile series.
  const linePath = (key: 'p5' | 'p25' | 'p50' | 'p75' | 'p95') =>
    bands.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(b.year)} ${yAt(b[key])}`).join(' ');

  // Build a closed band between two percentile series (upper across, lower back).
  const bandPath = (upper: 'p95' | 'p75', lower: 'p5' | 'p25') => {
    const top = bands.map((b) => `${xAt(b.year)} ${yAt(b[upper])}`);
    const bottom = [...bands].reverse().map((b) => `${xAt(b.year)} ${yAt(b[lower])}`);
    return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
  };

  // The year the tooltip is reading (default: last year).
  const readYear = hoverYear ?? years;
  const readBand = bands[readYear] ?? bands[bands.length - 1];

  // Convert a mouse position into the nearest year, for the tooltip.
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;   // back to internal coords
    const frac = Math.min(1, Math.max(0, (relX - PAD_L) / (W - PAD_L - PAD_R)));
    setHoverYear(Math.round(frac * years));
  }

  return (
    <div className="fan-wrap">
      {/* Own measured box: the readout bar below must not count toward the
          plot's height, so the ref goes on a wrapper around the svg only. */}
      <div className="fan-plot" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="fan"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverYear(null)}
        role="img"
        aria-label={`Projected portfolio value over ${years} years. Median ends near ${fmtMoney(result.median)}.`}
      >
        <defs>
          <linearGradient id="bandOuter" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="bandInner" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-bright)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines (subtle) + the "starting value" reference line */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD_L} x2={W - PAD_R}
            y1={PAD_T + f * (H - PAD_T - PAD_B)} y2={PAD_T + f * (H - PAD_T - PAD_B)}
            stroke="var(--border)" strokeWidth="1" />
        ))}
        <line x1={PAD_L} x2={W - PAD_R} y1={yAt(startValue)} y2={yAt(startValue)}
          stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />

        {/* the bands, outer first then inner on top */}
        <path d={bandPath('p95', 'p5')} fill="url(#bandOuter)" className="fan-band" />
        <path d={bandPath('p75', 'p25')} fill="url(#bandInner)" className="fan-band" />

        {/* faint sample paths for texture */}
        {result.samplePaths.slice(0, 18).map((p, i) => (
          <path key={i}
            d={p.map((v, y) => `${y === 0 ? 'M' : 'L'} ${xAt(y)} ${yAt(v)}`).join(' ')}
            fill="none" stroke="var(--accent-bright)" strokeOpacity="0.06" strokeWidth="1" />
        ))}

        {/* median line, drawn with a grow-in animation */}
        <path d={linePath('p50')} fill="none" stroke="var(--accent-bright)"
          strokeWidth="2.5" className="fan-median" strokeLinecap="round" strokeLinejoin="round" />

        {/* hover guide + dot */}
        {hoverYear !== null && (
          <>
            <line x1={xAt(readYear)} x2={xAt(readYear)} y1={PAD_T} y2={H - PAD_B}
              stroke="var(--accent-bright)" strokeWidth="1" opacity="0.4" />
            <circle cx={xAt(readYear)} cy={yAt(readBand.p50)} r="4"
              fill="var(--accent-bright)" stroke="var(--bg-base)" strokeWidth="2" />
          </>
        )}

        {/* year labels along the bottom */}
        {bands.filter((b) => b.year % Math.ceil(years / 5) === 0 || b.year === years).map((b) => (
          <text key={b.year} x={xAt(b.year)} y={H - 8}
            className="fan-axis" textAnchor={b.year === 0 ? 'start' : b.year === years ? 'end' : 'middle'}>
            {b.year === 0 ? 'now' : `y${b.year}`}
          </text>
        ))}
      </svg>
      </div>

      {/* Readout bar BELOW the chart — never overlaps the plot. Shows
          the hovered year (or the final year by default). */}
      <div className="fan-readout">
        <span className="fan-ro-year">{readYear === 0 ? 'Today' : `Year ${readYear}`}</span>
        <div className="fan-ro-main">
          <span className="fan-ro-label">Median</span>
          <span className="tabular fan-ro-med">{fmtMoneyShort(readBand.p50)}</span>
        </div>
        <div className="fan-ro-range tabular">
          <span className="fan-ro-swatch" /> {fmtMoneyShort(readBand.p5)} – {fmtMoneyShort(readBand.p95)}
          <span className="fan-ro-conf"> · 90% range</span>
        </div>
      </div>
    </div>
  );
}
