// ============================================================
// hooks.ts — small reusable hooks.
//   useCountUp     — animates a number from 0 to target when triggered
//   useReveal      — adds 'is-visible' when an element scrolls into view
//   useElementSize — reports an element's live pixel size
// ============================================================
import { useEffect, useRef, useState } from 'react';

// Animate a number up to `target` over `duration` ms, easing out.
export function useCountUp(target: number, duration = 1100, start = true): number {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!start) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setVal(target); return; }
    let t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, start]);
  return val;
}

// Reveal-on-scroll: returns a ref + whether it's visible yet.
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// Report an element's live pixel size.
//
// Why the charts need this: every SVG here used `width:100%; height:auto`
// with a fixed viewBox, so its height was dictated by its WIDTH. That makes
// it impossible to fit a chart into a height budget — the whole reason the
// dashboard overflowed the viewport. Measuring the box and feeding the real
// pixel dimensions into the viewBox lets a chart fill whatever space the
// grid gives it, at any aspect ratio, without distortion.
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Round to whole pixels: sub-pixel churn would re-render on every
      // fractional layout change for no visual benefit.
      setSize((prev) => {
        const w = Math.round(width), h = Math.round(height);
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, ...size };
}
