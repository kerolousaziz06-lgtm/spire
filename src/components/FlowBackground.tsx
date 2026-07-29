// ============================================================
// FlowBackground.tsx — the immersive liquid-gradient backdrop
// (photo 3 vibe). A slow-moving, iridescent flow rendered on a
// canvas with layered sine-warped gradients. Purely atmospheric.
//
// It's lightweight: a handful of moving radial blobs blended
// additively, animated with requestAnimationFrame, respecting
// prefers-reduced-motion.
// ============================================================
import { useEffect, useRef } from 'react';

type Blob = { x: number; y: number; r: number; hue: number; dx: number; dy: number; phase: number };

export function FlowBackground({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cv = canvas;       // non-null locals for the closures below
    const ctx = context;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // Liquid-chrome / iridescent-silver palette — cool, glossy, metallic.
    const palette = [
      [180, 200, 230],  // cool silver-blue
      [140, 155, 185],  // steel
      [210, 215, 225],  // bright chrome highlight
      [120, 165, 210],  // cold blue
      [200, 190, 210],  // faint lilac sheen
    ];

    const blobs: Blob[] = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random(), y: 0.5 + (Math.random() - 0.5) * 0.4,
      r: 0.35 + Math.random() * 0.25,
      hue: i,
      dx: (Math.random() - 0.5) * 0.00006,
      dy: (Math.random() - 0.5) * 0.00004,
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let t = 0;
    function frame() {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter'; // additive = glow
      for (const b of blobs) {
        // drift + gentle sine sway
        const cx = (b.x + Math.sin(t * 0.002 + b.phase) * 0.06) * w;
        const cy = (b.y + Math.cos(t * 0.0015 + b.phase) * 0.05) * h;
        if (!reduce) { b.x += b.dx * 16; b.y += b.dy * 16;
          if (b.x < -0.2 || b.x > 1.2) b.dx *= -1;
          if (b.y < 0.1 || b.y > 0.9) b.dy *= -1;
        }
        const rad = b.r * Math.max(w, h);
        const [r, g, bl] = palette[b.hue % palette.length];
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${0.55 * intensity})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${bl},${0.22 * intensity})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    frame();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [intensity]);

  return <canvas ref={ref} className="flow-canvas" aria-hidden="true" />;
}
