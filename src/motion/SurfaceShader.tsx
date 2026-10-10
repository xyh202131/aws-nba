import { useEffect, useRef, useState } from "react";
import { stormLightFragment } from "./storm-light.glsl";
import { useMotionActivity } from "./useMotionActivity";

export type SkyPalette = readonly [
  high: string,
  main: string,
  mid: string,
  low: string,
];
const DARK: SkyPalette = ["#87909f", "#515b6d", "#343f52", "#202a3b"];
const LIGHT: SkyPalette = ["#E8EAEE", "#CDD3D9", "#B7BDC9", "#8C94A4"];
export interface SurfaceShaderProps {
  className?: string;
  lightPalette?: SkyPalette;
  darkPalette?: SkyPalette;
  lightYshift?: number;
  motionScale?: number;
  paused?: boolean;
  maxPixelCount?: number;
}

/** Original FeralUI Sky GLSL/noise/uniforms/time step; standalone lifecycle and explicit fallback. */
export function SurfaceShader({
  className = "",
  lightPalette = LIGHT,
  darkPalette = DARK,
  lightYshift = 0.09,
  motionScale = 1,
  paused = false,
  maxPixelCount = 960 * 540,
}: SurfaceShaderProps) {
  // NBA studio uses an explicitly light theme.
  const dark = false;
  const ref = useRef<HTMLCanvasElement>(null);
  const activity = useMotionActivity(ref, !paused && motionScale > 0);
  const live = useRef({ running: false, motionScale });
  const refresh = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    live.current = { running: activity.running, motionScale };
    refresh.current?.();
  }, [activity.running, motionScale]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) {
      setFailed(true);
      return;
    }
    let request = 0,
      last = 0,
      time = 20.75,
      disposed = false;
    let program: WebGLProgram | null = null,
      buffer: WebGLBuffer | null = null,
      texture: WebGLTexture | null = null;
    const compiled: WebGLShader[] = [];
    let observer: ResizeObserver | null = null;
    const clear = () => {
      disposed = true;
      cancelAnimationFrame(request);
      observer?.disconnect();
      refresh.current = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      compiled.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      clear();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    try {
      setFailed(false);
      program = gl.createProgram();
      if (!program) throw new Error("WebGL program unavailable");
      for (const [type, source] of [
        [
          gl.VERTEX_SHADER,
          "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}",
        ],
        [gl.FRAGMENT_SHADER, stormLightFragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("WebGL shader unavailable");
        compiled.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error("WebGL shader compile failed");
        gl.attachShader(program, shader);
      }
      gl.bindAttribLocation(program, 0, "p");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("WebGL link failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const noise = new Uint8Array(256 * 256 * 4);
      for (let i = 0; i < 256 * 256; i++) {
        const value = (Math.random() * 256) | 0;
        noise[i * 4] = noise[i * 4 + 1] = noise[i * 4 + 2] = value;
        noise[i * 4 + 3] = 255;
      }
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        256,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        noise,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const uniform = (name: string) => gl.getUniformLocation(program!, name);
      gl.uniform1i(uniform("u_noise"), 0);
      const palette = dark ? darkPalette : lightPalette;
      ["u_high", "u_main", "u_mid", "u_low"].forEach((name, index) => {
        const color = parseInt(palette[index].slice(1), 16);
        gl.uniform3f(
          uniform(name),
          ((color >> 16) & 255) / 255,
          ((color >> 8) & 255) / 255,
          (color & 255) / 255,
        );
      });
      gl.uniform1f(uniform("u_nscale"), 0.35 + 0.92 * 1.15);
      gl.uniform1f(uniform("u_warp"), 0.1 * 0.47);
      gl.uniform1f(uniform("u_wind"), 1 * 0.36);
      gl.uniform2f(uniform("u_dirv"), 1, 0);
      gl.uniform1f(uniform("u_yshift"), dark ? 0.09 : lightYshift);
      const resolution = uniform("u_res"),
        clock = uniform("u_t");
      const draw = (now: number) => {
        if (disposed) return;
        if (last && live.current.running)
          time +=
            0.58 *
            1.2 *
            live.current.motionScale *
            Math.min(0.05, (now - last) / 1000);
        last = now;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform1f(clock, time);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.dataset.frame = time.toFixed(6);
        if (live.current.running) request = requestAnimationFrame(draw);
      };
      const restart = () => {
        if (disposed) return;
        cancelAnimationFrame(request);
        last = 0;
        request = requestAnimationFrame(draw);
      };
      refresh.current = restart;
      observer = new ResizeObserver(() => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(3, window.devicePixelRatio || 1);
        const scale = Math.min(
          1,
          Math.sqrt(
            Math.max(1, maxPixelCount) /
              Math.max(1, rect.width * rect.height * ratio * ratio),
          ),
        );
        canvas.width = Math.max(1, Math.floor(rect.width * ratio * scale));
        canvas.height = Math.max(1, Math.floor(rect.height * ratio * scale));
        restart();
      });
      observer.observe(canvas);
      restart();
    } catch {
      clear();
      setFailed(true);
    }
    return () => {
      clear();
      canvas.removeEventListener("webglcontextlost", contextLost);
    };
  }, [dark, lightPalette, darkPalette, lightYshift, maxPixelCount]);
  return (
    <div
      className={`qx-shader-surface ${className}`}
      data-renderer="feralui-sky"
      data-color-scheme={dark ? "dark" : "light"}
      data-motion-state={
        failed
          ? "fallback"
          : activity.reduced
            ? "reduced"
            : activity.running
              ? "running"
              : "paused"
      }
    >
      <canvas
        ref={ref}
        aria-hidden="true"
        style={{ visibility: failed ? "hidden" : undefined }}
      />
      {failed ? (
        <span className="qx-shader-fallback" role="status">
          WebGL 不可用 · 显示静态底色
        </span>
      ) : null}
    </div>
  );
}
