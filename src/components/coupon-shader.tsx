"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export interface CouponShaderProps {
  className?: string;
  /** Animation speed multiplier (automatically forced to 0 under prefers-reduced-motion). */
  speed?: number;
  /** Subtlety of color modulation (0..1). */
  intensity?: number;
  /** Subtlety of GPU paper-grain dithering (0..1). */
  noise?: number;
  colorBack?: string;
  colors?: [string, string, string];
}

const DEFAULT_COLORS: [string, string, string] = ["#eef1ef", "#dcefe5", "#d3dcd8"];

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;

uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform float u_intensity;
uniform float u_noise;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_res, vec2(1.0));
  vec2 p = uv * 2.0 - 1.0;
  float aspect = u_res.x / max(u_res.y, 1.0);
  p.x *= aspect;

  float t = u_time;
  float w1 = sin(p.x * 1.45 + t * 0.9 + cos(p.y * 1.15 - t * 0.6));
  float w2 = cos(p.y * 1.6 - t * 0.75 + sin(p.x * 0.95 + t * 0.5));
  float wave = 0.5 + 0.5 * sin((w1 + w2) * 1.25);
  float ridge = smoothstep(0.15, 0.88, 0.5 + 0.5 * cos(p.x * 0.8 - p.y * 1.1 + w1 * 0.65));

  vec3 col = mix(u_c0, u_c1, wave * (0.55 + u_intensity));
  col = mix(col, u_c2, ridge * (0.45 + u_intensity * 0.8));

  // Fine print-press / coupon-stock grain computed directly on GPU.
  float grain = (hash(gl_FragCoord.xy + fract(t) * 67.0) - 0.5) * (0.08 * u_noise);
  col = clamp(col + grain, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCED_QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

function hexToVec3(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [0.933, 0.945, 0.937]; // #eef1ef fallback
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Lightweight zero-dependency WebGL fragment shader scoped strictly to the Hero
 * landing section. Uses HarnKan's pale coupon-stock palette (#eef1ef, #dcefe5,
 * #d3dcd8), stops under prefers-reduced-motion, and pauses offscreen.
 */
export function CouponShader({
  className = "",
  speed = 0.15,
  intensity = 0.14,
  noise = 0.35,
  colorBack = "#eef1ef",
  colors = DEFAULT_COLORS,
}: CouponShaderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const effectiveSpeed = reducedMotion ? 0 : speed;
  const [, c1Hex, c2Hex] = colors;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const fallback = () => {
      canvas.style.display = "none";
    };

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      fallback();
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      fallback();
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      fallback();
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      fallback();
      return;
    }

    canvas.style.display = "block";
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_res");
    const uC0 = gl.getUniformLocation(program, "u_c0");
    const uC1 = gl.getUniformLocation(program, "u_c1");
    const uC2 = gl.getUniformLocation(program, "u_c2");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");
    const uNoise = gl.getUniformLocation(program, "u_noise");

    const c0 = hexToVec3(colorBack);
    const c1 = hexToVec3(c1Hex);
    const c2 = hexToVec3(c2Hex);

    gl.uniform3f(uC0, c0[0], c0[1], c0[2]);
    gl.uniform3f(uC1, c1[0], c1[1], c1[2]);
    gl.uniform3f(uC2, c2[0], c2[1], c2[2]);
    gl.uniform1f(uIntensity, intensity);
    gl.uniform1f(uNoise, noise);

    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let lastTs = 0;
    let disposed = false;

    const resize = () => {
      if (disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const draw = (t: number) => {
      if (disposed) return;
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      lastTs = 0;
    };

    const tick = (now: number) => {
      if (disposed || !visible || document.hidden || effectiveSpeed === 0) {
        stopLoop();
        return;
      }
      if (lastTs === 0) lastTs = now;
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      elapsed += dt * effectiveSpeed;
      draw(elapsed);
      raf = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (disposed || !visible || document.hidden) return;
      if (effectiveSpeed === 0) {
        draw(elapsed);
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };

    resize();
    draw(elapsed);

    const ro = new ResizeObserver(() => {
      resize();
      draw(elapsed);
    });
    ro.observe(wrap);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) startLoop();
        else stopLoop();
      },
      { threshold: 0.01 },
    );
    io.observe(wrap);

    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      stopLoop();
      fallback();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [colorBack, c1Hex, c2Hex, intensity, noise, effectiveSpeed]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden ${className}`}
      style={{
        WebkitMaskImage: "radial-gradient(ellipse 92% 88% at 50% 48%, #000 42%, transparent 100%)",
        maskImage: "radial-gradient(ellipse 92% 88% at 50% 48%, #000 42%, transparent 100%)",
        backgroundImage: `radial-gradient(ellipse at 25% 25%, ${c1Hex} 0%, transparent 65%), radial-gradient(ellipse at 75% 75%, ${c2Hex} 0%, transparent 65%)`,
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
