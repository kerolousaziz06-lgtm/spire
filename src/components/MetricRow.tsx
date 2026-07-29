// ============================================================
// MetricRow.tsx — the core "value + meaning + verdict" unit.
//
// This is the design philosophy made concrete: NO number ever
// appears alone. Every metric shows its value, a plain-English
// explanation of what it means, and a good/average/bad health
// pill. This is how a viewer (or interviewer) sees that the
// numbers are understood, not just displayed.
// ============================================================
import type { Metric } from '../lib/analysis';
import './MetricRow.css';

export function MetricRow({ metric }: { metric: Metric }) {
  return (
    <div className="mr">
      <div className="mr-top">
        <span className="mr-label">{metric.label}</span>
        <div className="mr-right">
          <span className="mr-value tabular">{metric.display}</span>
          <span className={`mr-pill mr-pill--${metric.health}`}>{metric.verdict}</span>
        </div>
      </div>
      <p className="mr-meaning">{metric.meaning}</p>
    </div>
  );
}
