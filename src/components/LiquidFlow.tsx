// ============================================================
// LiquidFlow.tsx — a WebGL fragment shader that reproduces the
// "liquid glass" marbled flow texture (domain-warped fractal
// noise + caustic banding), recolored to the site's dark palette
// instead of rainbow. Purely atmospheric; sits behind the hero.
//
// The texture comes from fbm (fractal Brownian motion) noise fed
// through itself twice (domain warping) — the standard technique
// for that folded, oil-on-water ridged look.
// ============================================================
import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// The fragment shader is where the liquid texture lives.
const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;

// --- hash + value noise ---
float hash(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  // quintic smoothstep — smoother than cubic, kills graininess
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i + vec2(0.0,0.0));
  float b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0));
  float d = hash(i + vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
// fractal brownian motion — stacked noise octaves
float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for(int i=0;i<6;i++){
    v += amp * noise(p);
    p = rot * p;
    amp *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv;
  p.x *= uRes.x / uRes.y;
  p *= 1.7;                       // larger features = smoother, less grainy

  float t = uTime * 0.05;

  // --- domain warping: fbm of fbm, the key to the liquid ridges ---
  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p + 3.2*q + vec2(1.7, 9.2) + 0.15*t),
                fbm(p + 3.2*q + vec2(8.3, 2.8) - 0.12*t));
  float f = fbm(p + 3.2*r);

  // smooth caustic banding — the glossy folded light
  float warp = length(r);
  float bands = 0.5 + 0.5 * sin( (f * 4.0 + warp * 4.0) * 3.14159 );
  bands = pow(bands, 1.6);        // tighten highlights for a wet sheen

  // --- palette: dark bone/ink, glassy, NOT rainbow ---
  vec3 ground = vec3(0.075, 0.065, 0.050);
  vec3 mid    = vec3(0.34, 0.33, 0.30);
  vec3 hi     = vec3(0.88, 0.85, 0.78);   // bright bone gloss
  vec3 sheen  = vec3(0.55, 0.62, 0.68);   // cool liquid-metal sheen

  // smooth gradient base (no hard noise showing) + glossy bands on top
  vec3 col = mix(ground, mid, smoothstep(0.2, 0.85, f));
  col = mix(col, sheen, smoothstep(0.45, 0.8, warp) * 0.4);
  col = mix(col, hi, bands * smoothstep(0.4, 0.95, f) * 0.85);

  // ---- RIVER BAND: confine the flow to a horizontal ribbon ----
  // centered vertically, feathered top & bottom into black.
  float band = smoothstep(0.0, 0.28, uv.y) * smoothstep(1.0, 0.72, uv.y);
  // slight wave to the band centerline so the river undulates
  float center = 0.5 + 0.06 * sin(uv.x * 3.0 + uTime * 0.15);
  float dist = abs(uv.y - center);
  band *= smoothstep(0.42, 0.06, dist);

  vec3 pageBg = vec3(0.090, 0.078, 0.059);   // matches --ground
  vec3 outCol = mix(pageBg, col, band);

  gl_FragColor = vec4(outCol, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
  }
  return s;
}

export function LiquidFlow({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cv = canvas;
    const glCtx = cv.getContext('webgl');
    if (!glCtx) return;
    const gl = glCtx;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // fullscreen triangle-pair
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(uRes, cv.width, cv.height);
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const start = performance.now();
    function frame(now: number) {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    frame(start);
    if (reduce) { gl.uniform1f(uTime, 8.0); gl.drawArrays(gl.TRIANGLES, 0, 6); }

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
