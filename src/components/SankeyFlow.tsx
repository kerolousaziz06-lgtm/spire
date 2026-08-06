// ============================================================
// SankeyFlow.tsx — where the money went, as one picture.
//
// The graph (who flows to whom, how much, what share) is built in
// budget.ts. This file only decides where that lands in pixels.
//
// Four columns: sources -> Income -> savings + categories -> subcategories.
//
// Three things here are easy to get wrong and expensive to debug:
//
// 1. The scale must subtract the inter-node gaps BEFORE dividing. Divide
//    first and the bottom node in the tallest column runs off the canvas
//    by exactly the sum of the gaps.
// 2. Link gradients need gradientUnits="userSpaceOnUse". The default
//    measures the path's own bounding box, so a steeply curved ribbon
//    gets a gradient running the wrong way.
// 3. Node order is what prevents ribbons crossing. Depth 2 arrives from
//    budget.ts already ordered (savings pinned top, categories largest
//    first); depth 3 must be stacked in PARENT order, not by value.
// ============================================================
import { useMemo, useState } from 'react';
import type { FlowGraph, FlowNode } from '../lib/budget';
import { fmtMoney, fmtPct } from '../lib/format';
import { useElementSize } from '../lib/hooks';
import './SankeyFlow.css';

type Props = { graph: FlowGraph };

const NODE_W = 8;      // node bar width
const GAP = 7;         // vertical gap between sibling nodes
const PAD_T = 14;
const PAD_B = 14;
const PAD_L = 4;
const PAD_R = 4;
const MIN_H = 1.5;     // a flow under a pixel still gets a visible bar

// Gutter widths as a share of the space between the four bars. The middle
// gutter carries two labels (the trunk's, pointing right; the categories',
// pointing left), so it gets the most room.
const GUTTER_WEIGHTS = [0.26, 0.42, 0.32];

// Two lines of label. Nothing may be packed tighter than this.
const LABEL_SLOT = 30;

// Fallbacks for the first paint, before the wrapper has been measured.
const W0 = 900, H0 = 460;

type Placed = FlowNode & { x: number; y0: number; y1: number };

export function SankeyFlow({ graph }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  // The viewBox tracks the wrapper's real pixel size, so the chart fills
  // the height it is given instead of deriving height from its width.
  const { ref: wrapRef, w: measuredW, h: measuredH } = useElementSize<HTMLDivElement>();
  const W = measuredW || W0;
  const H = measuredH || H0;

  const layout = useMemo(() => place(graph, W, H), [graph, W, H]);

  if (graph.nodes.length <= 1) {
    return (
      <div className="sk-wrap" ref={wrapRef}>
        <div className="sk-empty">Enter a month's figures to see where the money goes.</div>
      </div>
    );
  }

  const { placed, links, labels } = layout;
  const byId = new Map(placed.map((n) => [n.id, n]));

  // Hovering a node dims everything not connected to it. Hovering nothing
  // leaves the whole diagram at full strength.
  const lit = (id: string) => {
    if (!hover) return true;
    if (id === hover) return true;
    return links.some(
      (l) =>
        (l.source === hover && l.target === id) ||
        (l.target === hover && l.source === id)
    );
  };

  return (
    <div className="sk-wrap" ref={wrapRef}>
      <svg className="sk-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label="Where the month's money went">
        <defs>
          {links.map((l) => {
            const s = byId.get(l.source), t = byId.get(l.target);
            if (!s || !t) return null;
            return (
              <linearGradient key={l.id} id={`skg-${l.id}`} gradientUnits="userSpaceOnUse"
                x1={s.x + NODE_W} y1={0} x2={t.x} y2={0}>
                <stop offset="0%" stopColor={s.color} />
                <stop offset="100%" stopColor={t.color} />
              </linearGradient>
            );
          })}
        </defs>

        {/* Ribbons first, so the node bars sit on top of them. */}
        <g className="sk-links">
          {links.map((l) => (
            <path
              key={l.id}
              className={`sk-link ${lit(l.source) && lit(l.target) ? '' : 'is-dim'}`}
              d={l.d}
              fill={`url(#skg-${l.id})`}
            />
          ))}
        </g>

        <g className="sk-nodes">
          {placed.map((n) => (
            <rect
              key={n.id}
              className={`sk-node ${lit(n.id) ? '' : 'is-dim'}`}
              x={n.x} y={n.y0} width={NODE_W} height={Math.max(MIN_H, n.y1 - n.y0)}
              fill={n.color}
            />
          ))}
        </g>

        <g className="sk-labels">
          {labels.map((lb) => (
            <g
              key={lb.id}
              className={`sk-label ${lit(lb.id) ? '' : 'is-dim'}`}
              onMouseEnter={() => setHover(lb.id)}
              onMouseLeave={() => setHover(null)}
            >
              {/* An invisible hit area, so a 2px flow is still hoverable. */}
              <rect className="sk-hit" x={lb.anchor === 'end' ? lb.x - 170 : lb.x}
                y={lb.y - 13} width={170} height={26} />
              <text className="sk-name" x={lb.x} y={lb.y} textAnchor={lb.anchor}>
                {lb.name}
              </text>
              <text className="sk-amt tabular" x={lb.x} y={lb.y + 14} textAnchor={lb.anchor}>
                {lb.amount} <tspan className="sk-share">({lb.share})</tspan>
              </text>
              {lb.detail && <title>{lb.detail}</title>}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ---- layout ---------------------------------------------------

type PlacedLink = { id: string; source: string; target: string; d: string };
type Label = {
  id: string; name: string; amount: string; share: string;
  x: number; y: number; anchor: 'start' | 'end'; detail?: string;
};

function place(graph: FlowGraph, W: number, H: number) {
  const cols: Placed[][] = [[], [], [], []];
  const columnNodes = [0, 1, 2, 3].map((d) => graph.nodes.filter((n) => n.depth === d));

  // ---- x positions ----
  const inner = W - PAD_L - PAD_R - NODE_W * 4;
  const gutters = GUTTER_WEIGHTS.map((g) => inner * g);
  const xs = [
    PAD_L,
    PAD_L + NODE_W + gutters[0],
    PAD_L + NODE_W * 2 + gutters[0] + gutters[1],
    PAD_L + NODE_W * 3 + gutters[0] + gutters[1] + gutters[2],
  ];

  // ---- one scale, shared by every column ----
  //
  // Each column is constrained differently: columns 0-2 all carry the full
  // denominator but hold different numbers of nodes, and column 3 carries
  // less value across more nodes. The binding constraint is whichever
  // column runs out of room first, so take the smallest scale of the four.
  const usableH = H - PAD_T - PAD_B;
  let scale = Infinity;
  for (const nodes of columnNodes) {
    if (nodes.length === 0) continue;
    const total = nodes.reduce((s, n) => s + n.value, 0);
    if (total <= 0) continue;
    // Gaps come out FIRST. Dividing before subtracting them is what pushes
    // the last node off the bottom.
    const room = usableH - GAP * (nodes.length - 1);
    scale = Math.min(scale, room / total);
  }
  if (!isFinite(scale) || scale <= 0) scale = 0;

  // ---- y positions: stack each column from the top, in the order
  //      budget.ts already put the nodes in ----
  for (let d = 0; d < 4; d++) {
    let y = PAD_T;
    for (const n of columnNodes[d]) {
      const h = Math.max(MIN_H, n.value * scale);
      cols[d].push({ ...n, x: xs[d], y0: y, y1: y + h });
      y += h + GAP;
    }
  }

  const placed = cols.flat();
  const byId = new Map(placed.map((n) => [n.id, n]));

  // ---- ribbons ----
  // Each node pays out its links from the top down, and receives them the
  // same way. Because both ends walk in the same order, ribbons nest
  // instead of crossing.
  const outAt = new Map<string, number>();
  const inAt = new Map<string, number>();
  const links: PlacedLink[] = [];

  for (const l of graph.links) {
    const s = byId.get(l.source), t = byId.get(l.target);
    if (!s || !t) continue;

    const thick = Math.max(MIN_H, l.value * scale);
    const a0 = s.y0 + (outAt.get(s.id) ?? 0);
    const b0 = t.y0 + (inAt.get(t.id) ?? 0);
    outAt.set(s.id, (outAt.get(s.id) ?? 0) + thick);
    inAt.set(t.id, (inAt.get(t.id) ?? 0) + thick);

    const xs0 = s.x + NODE_W, xt0 = t.x;
    const xm = xs0 + (xt0 - xs0) * 0.5;
    const a1 = a0 + thick, b1 = b0 + thick;

    // Top edge out, straight down the far end, bottom edge back, close.
    links.push({
      id: l.id, source: l.source, target: l.target,
      d: `M ${xs0} ${a0} C ${xm} ${a0}, ${xm} ${b0}, ${xt0} ${b0} ` +
         `L ${xt0} ${b1} C ${xm} ${b1}, ${xm} ${a1}, ${xs0} ${a1} Z`,
    });
  }

  // ---- labels ----
  // Columns 0 and 1 label to the right of their bar; columns 2 and 3 to
  // the left. Every label therefore sits in a gutter, never over a bar.
  const labels: Label[] = [];
  for (let d = 0; d < 4; d++) {
    const anchor: 'start' | 'end' = d <= 1 ? 'start' : 'end';
    const slots = cols[d].map((n) => ({
      node: n,
      y: (n.y0 + n.y1) / 2 - 4,     // 2-line block, centred on the node
    }));

    declutter(slots, H);

    for (const s of slots) {
      labels.push({
        id: s.node.id,
        name: s.node.label,
        amount: fmtMoney(s.node.value),
        share: fmtPct(s.node.share, 1),
        x: anchor === 'start' ? s.node.x + NODE_W + 10 : s.node.x - 10,
        y: s.y,
        anchor,
        detail: s.node.detail,
      });
    }
  }

  return { placed, links, labels };
}

/**
 * Push overlapping labels apart. Labels are NOT clipped to node height —
 * a 0.5% flow has a 2px bar and still needs its full name — so a column of
 * small flows would otherwise stack its text on itself.
 *
 * Two passes: shove everything down until nothing overlaps, then, if that
 * ran past the bottom edge, shove back up from the last one. Mutates in
 * place, in the order given, which is the order that keeps labels matched
 * to their bars.
 */
function declutter(slots: { y: number }[], H: number) {
  for (let i = 1; i < slots.length; i++) {
    const minY = slots[i - 1].y + LABEL_SLOT;
    if (slots[i].y < minY) slots[i].y = minY;
  }
  const last = slots[slots.length - 1];
  if (!last) return;
  if (last.y > H - PAD_B) {
    last.y = H - PAD_B;
    for (let i = slots.length - 2; i >= 0; i--) {
      const maxY = slots[i + 1].y - LABEL_SLOT;
      if (slots[i].y > maxY) slots[i].y = maxY;
    }
  }
}
