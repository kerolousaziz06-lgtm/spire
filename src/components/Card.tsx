// ============================================================
// Card.tsx — the reusable surfaces everything is built from.
//   <Card>        a plain rounded panel with padding
//   <StatCard>    a labelled metric with an optional up/down delta
// Building these once and reusing them is what keeps the whole
// app visually consistent (the "design system" discipline).
// ============================================================
import type { ReactNode, CSSProperties } from 'react';
import { IconArrowUp, IconArrowDown } from './Icons';
import './Card.css';

type CardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  glow?: boolean;          // adds the blue glow for the "hero" card
  delay?: number;          // stagger index for the fade-up entrance
};

export function Card({ children, className = '', style, glow, delay = 0 }: CardProps) {
  return (
    <div
      className={`card ${glow ? 'card--glow' : ''} ${className}`}
      style={{ animationDelay: `${delay * 60}ms`, ...style }}
    >
      {children}
    </div>
  );
}

type StatCardProps = {
  label: string;           // e.g. "MEDIAN OUTCOME"
  value: string;           // e.g. "$142,300"
  delta?: number;          // e.g. +21 or -3 (percent). Optional.
  deltaSuffix?: string;    // e.g. "%"
  hint?: string;           // small sub-label under the value
  delay?: number;
};

// Turns a number like +21 into a green "▲ +21%" and -3 into a
// red "▼ -3%". Color is ALWAYS paired with an arrow, never alone —
// that's an accessibility rule (don't rely on color to convey meaning).
export function StatCard({ label, value, delta, deltaSuffix = '%', hint, delay = 0 }: StatCardProps) {
  const hasDelta = typeof delta === 'number';
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="statcard" delay={delay}>
      <div className="statcard-label">{label}</div>
      <div className="statcard-value tabular">{value}</div>
      <div className="statcard-bottom">
        {hasDelta && (
          <span className={`delta ${positive ? 'delta--up' : 'delta--down'}`}>
            {positive ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
            <span className="tabular">{positive ? '+' : ''}{delta}{deltaSuffix}</span>
          </span>
        )}
        {hint && <span className="statcard-hint">{hint}</span>}
      </div>
    </Card>
  );
}
