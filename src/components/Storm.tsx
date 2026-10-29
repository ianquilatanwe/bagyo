"use client";

import { useEffect, useRef } from "react";
import { FRAG, VERT } from "@/lib/shader";
import { PEAK, signalFor, windAt } from "@/lib/storm";

// The fixed storm canvas behind the page, plus the wind gauge drawn over it.
// One animation loop reads the scroll position, eases towards it, and feeds the shader and the gauge.
export function Storm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kmhRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    const program = gl && link(gl);
    // No WebGL: hide the canvas and let the CSS gradient in globals.css stand in. The gauge still works.
    if (!program) document.documentElement.dataset.nogl = "";
    canvas.addEventListener("webglcontextlost", () => (document.documentElement.dataset.nogl = ""));

    const u = (name: string) => gl && program && gl.getUniformLocation(program, name);
    const uRes = u("uRes"), uTime = u("uTime"), uP = u("uP"), uFlash = u("uFlash"), uLook = u("uLook");

    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let target = 0, p = 0, time = 0, flash = 0, nextFlash = 3, look = [0, 0], lookTo = [0, 0];
    let last = performance.now(), raf = 0, shownSignal = -1;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      target = max > 0 ? Math.min(scrollY / max, 1) : 0;
    };
    const onPointer = (e: PointerEvent) => (lookTo = [e.clientX / innerWidth - 0.5, 0.5 - e.clientY / innerHeight]);
    // Clouds are soft, so the canvas renders at ~60% of screen pixels and CSS scales it up.
    const onResize = () => {
      const scale = Math.min(devicePixelRatio, 2) * 0.6;
      canvas.width = Math.round(innerWidth * scale);
      canvas.height = Math.round(innerHeight * scale);
      gl?.viewport(0, 0, canvas.width, canvas.height);
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const calm = still.matches;

      // Reduced motion: the scene follows the scroll exactly and nothing moves on its own.
      p = calm ? target : p + (target - p) * (1 - Math.exp(-dt * 5));
      if (!calm) {
        time += dt;
        look = look.map((l, i) => l + (lookTo[i] - l) * (1 - Math.exp(-dt * 3)));
        // Lightning only while the storm is building, at most one strike every 2.5 s
        // (well under the three-flashes-a-second limit).
        if (time > nextFlash && p > 0.1 && p < PEAK + 0.05) {
          flash = 0.6 + Math.random() * 0.4;
          nextFlash = time + 2.5 + Math.random() * 4;
        }
        flash *= Math.exp(-dt * 7);
      } else flash = 0;

      if (gl && program) {
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, time);
        gl.uniform1f(uP, p);
        gl.uniform1f(uFlash, flash);
        gl.uniform2f(uLook, look[0], look[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      const kmh = windAt(p);
      kmhRef.current!.textContent = String(Math.round(kmh));
      fillRef.current!.style.transform = `scaleY(${kmh / 230})`;
      const signal = signalFor(kmh);
      if (signal !== shownSignal) {
        shownSignal = signal;
        labelRef.current!.textContent = signal ? `Signal No. ${signal}` : "Eye of the storm";
      }
      raf = requestAnimationFrame(frame);
    };

    onResize();
    onScroll();
    p = target;
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    addEventListener("pointermove", onPointer);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="storm-canvas fixed inset-0 -z-10 h-full w-full" />
      {/* Decorative read-out: the same signal is named in each section's heading. */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-4 left-4 z-10 flex items-end gap-3 rounded-2xl bg-ink/55 px-4 py-3 font-mono text-foam backdrop-blur-md sm:bottom-6 sm:left-6"
      >
        <div className="h-14 w-1.5 overflow-hidden rounded-full bg-foam/20">
          <div ref={fillRef} className="h-full w-full origin-bottom bg-foam" />
        </div>
        <div className="leading-none">
          <span ref={kmhRef} className="font-display text-5xl font-extrabold tabular-nums">45</span>
          <span className="ml-1 text-xs uppercase tracking-widest text-foam/70">km/h</span>
          <span ref={labelRef} className="mt-2 block text-xs uppercase tracking-widest text-foam/80">
            Signal No. 1
          </span>
        </div>
      </div>
    </>
  );
}

function link(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  return program;
}
