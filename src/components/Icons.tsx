// ============================================================
// Icons.tsx — small, consistent SVG icons (stroke width 1.75).
// The design skill requires vector icons, never emoji, and one
// consistent stroke width across the set. Each icon is a tiny
// React component that takes a size and inherits text color.
// ============================================================
import type { CSSProperties } from 'react';

type IconProps = { size?: number; style?: CSSProperties };

// A shared wrapper so every icon has identical stroke settings.
function Svg({ size = 20, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// The MonteVue brand mark: a prism splitting one line into a fan.
// (Name + logo + core feature all reinforce each other.)
export function LogoMark({ size = 28, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={style} aria-hidden="true">
      {/* incoming single beam */}
      <path d="M3 16 H12" stroke="var(--text-secondary)" strokeWidth="1.75" strokeLinecap="round" />
      {/* the prism triangle */}
      <path d="M12 8 L20 16 L12 24 Z" stroke="var(--accent-bright)" strokeWidth="1.75" strokeLinejoin="round" fill="var(--accent-dim)" />
      {/* the fan of outgoing futures */}
      <path d="M20 16 L29 9"  stroke="#60A5FA" strokeWidth="1.75" strokeLinecap="round" opacity="0.9" />
      <path d="M20 16 L29 16" stroke="#3B82F6" strokeWidth="1.75" strokeLinecap="round" opacity="0.7" />
      <path d="M20 16 L29 23" stroke="#2563EB" strokeWidth="1.75" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
);
export const IconStress = (p: IconProps) => (
  <Svg {...p}><path d="M3 12h3l3 7 4-14 3 7h5" /></Svg>
);
export const IconScreener = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>
);
export const IconValuation = (p: IconProps) => (
  <Svg {...p}><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>
);
export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Svg>
);
export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Svg>
);
