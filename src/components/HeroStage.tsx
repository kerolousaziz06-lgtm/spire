// ============================================================
// HeroStage.tsx — the wordmark, the framed map, and the arch lens,
// drawn as ONE svg.
//
// They have to share a coordinate space. The composition needs the arch
// to cut the wordmark exactly where the two meet, and the lens to sit
// exactly over the panel. Done as separate HTML elements, those two
// alignments depend on a CSS font's rendered width and on percentage
// padding resolving the same way in two different boxes — they drift
// apart at the first viewport you did not test.
//
// In one viewBox every relationship is arithmetic and holds at every
// size, which is the same reason the dashboard charts derive their
// viewBox from a measured box rather than assuming one.
//
// Geometry, all in design units (the viewBox is 1000 x 780):
//
//   the three arches are CONCENTRIC — same centre, different radii —
//   because each one's apex and radius shift by the same amount, so
//   cy = apex + r is identical for all three. That is what keeps the
//   knockout gap and the outer rule evenly spaced all the way round.
// ============================================================
import mapImg from '../assets/downtown-map.jpg';
import './HeroStage.css';

type Props = { brand: string };

const VB_W = 1000;
const VB_H = 780;

// ---- the panel: the full map, out of focus ----
const PANEL = { x: 225, y: 310, w: 550, h: 455 };

// ---- the lens: an arch, rising above the panel into the word ----
const ARCH_R = 178;
const ARCH_CX = 500;
const ARCH_APEX = 260;               // 50 units above the panel's top edge
const ARCH_CY = ARCH_APEX + ARCH_R;  // shared by all three arches
const ARCH_BOTTOM = PANEL.y + PANEL.h;

const KNOCK_GAP = 13;   // dark gap between the cut letters and the rim
const RULE_GAP = 30;    // the free-standing rule outside the lens

/** An arch: vertical sides, a semicircular top, open at the bottom. */
function arch(r: number, bottom: number): string {
  const l = ARCH_CX - r, right = ARCH_CX + r;
  return `M ${l} ${bottom} L ${l} ${ARCH_CY} A ${r} ${r} 0 0 1 ${right} ${ARCH_CY} L ${right} ${bottom} Z`;
}

// The wordmark fills a fixed share of the width whatever the name is, so
// a longer one shrinks instead of running off the edge. 0.62em is the
// average advance of Space Grotesk's caps; it only has to be close, the
// text is centred.
function fontSizeFor(brand: string): number {
  const target = 860;
  return Math.min(278, target / (Math.max(1, brand.length) * 0.62));
}

export function HeroStage({ brand }: Props) {
  const fs = fontSizeFor(brand);

  return (
    <svg
      className="hs"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`${brand} — a map of Lower Manhattan's Financial District beneath the wordmark`}
    >
      <defs>
        <clipPath id="hs-panel">
          <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} />
        </clipPath>

        <clipPath id="hs-lens">
          <path d={arch(ARCH_R, ARCH_BOTTOM)} />
        </clipPath>

        {/* Blur bleeds past whatever it is applied to, so the filter box is
            grown and the result clipped back to the panel. */}
        <filter id="hs-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>

        {/* White shows the letters, black hides them. The black arch is
            KNOCK_GAP larger than the lens, so the cut reads as deliberate
            rather than as the image happening to cover the type. */}
        {/* maskUnits MUST be userSpaceOnUse. The default is
            objectBoundingBox, which resolves the mask REGION against the
            masked element's own bbox while the content below is in user
            space — the two disagree and the mask silently does nothing,
            leaving the type drawn straight over the arch. */}
        <mask id="hs-knock" maskUnits="userSpaceOnUse"
          x="0" y="0" width={VB_W} height={VB_H}>
          <rect width={VB_W} height={VB_H} fill="#fff" />
          <path d={arch(ARCH_R + KNOCK_GAP, ARCH_BOTTOM + KNOCK_GAP)} fill="#000" />
        </mask>
      </defs>

      {/* the panel, out of focus */}
      <g clipPath="url(#hs-panel)">
        <image
          href={mapImg}
          x={PANEL.x - 14} y={PANEL.y - 14}
          width={PANEL.w + 28} height={PANEL.h + 28}
          preserveAspectRatio="xMidYMid slice"
          filter="url(#hs-soft)"
        />
        <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h}
          className="hs-panel-tint" />
      </g>

      {/* the lens: the same map, sharp and slightly enlarged, so it reads
          as magnification rather than as a hole cut in a blur */}
      <g clipPath="url(#hs-lens)">
        <image
          href={mapImg}
          x={PANEL.x - PANEL.w * 0.09} y={PANEL.y - PANEL.h * 0.09}
          width={PANEL.w * 1.18} height={PANEL.h * 1.18}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h}
        className="hs-panel-edge" />

      {/* the free-standing rule outside the lens */}
      <path d={arch(ARCH_R + RULE_GAP, ARCH_BOTTOM)} className="hs-rule" />
      {/* the lens rim */}
      <path d={arch(ARCH_R, ARCH_BOTTOM)} className="hs-rim" />

      {/* The wordmark last, so the arch cuts it rather than the other way
          round. Its baseline sits below the arch's apex — that overlap is
          the whole composition. */}
      <text
        className="hs-word"
        x={ARCH_CX} y={300}
        fontSize={fs}
        textAnchor="middle"
        mask="url(#hs-knock)"
      >{brand}</text>
    </svg>
  );
}
