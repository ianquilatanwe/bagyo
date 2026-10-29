"use client";

import Lenis from "lenis";
import { useEffect, useRef } from "react";
import { releaseBirds } from "@/lib/birds";
import { createRain } from "@/lib/rain";
import { FRAG, VERT } from "@/lib/shader";
import { PEAK, signalFor, windAt } from "@/lib/storm";

const BOLTS = 4; // keep in step with BOLTS in shader.ts
const UMBRELLA_SCALE = 64 / 80; // CSS px per SVG unit: the umbrella SVG is 64 px wide for an 80-unit viewBox
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

type Strike = { x: number; y: number; top: number; seed: number; age: number; power: number; lit: boolean };

// The fixed storm canvas behind the page, the umbrella pointer, the birds layer and the wind gauge.
// One animation loop reads scroll and pointer, eases towards them, and feeds the shader and the DOM.
export function Storm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rainRef = useRef<HTMLCanvasElement>(null);
  const kmhRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const umbrellaRef = useRef<HTMLDivElement>(null);
  const birdsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const canvas = canvasRef.current!;
    const umbrella = umbrellaRef.current!;
    const rainCanvas = rainRef.current!;
    const rainCtx = rainCanvas.getContext("2d")!;
    const rain = createRain();
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    const program = gl && link(gl);
    // No WebGL: hide the canvas and let the CSS gradient in globals.css stand in. Gauge and umbrella still work.
    if (!program) root.dataset.nogl = "";
    canvas.addEventListener("webglcontextlost", () => (root.dataset.nogl = ""));
    root.dataset.umbrella = "";
    // Smooth scrolling: the wheel glides on and settles instead of stopping dead. Lenis still
    // scrolls the real page, so the CSS text fades and the #top link keep working. Phones keep
    // their own momentum; reduced motion keeps plain scrolling.
    const lenis = matchMedia("(prefers-reduced-motion: reduce)").matches ? null : new Lenis({ autoRaf: true, anchors: true, lerp: 0.08 });

    const u = (name: string) => gl && program && gl.getUniformLocation(program, name);
    const uRes = u("uRes"), uTime = u("uTime"), uP = u("uP"), uFlash = u("uFlash"), uLook = u("uLook");
    const uPointer = u("uPointer"), uStir = u("uStir"), uCharge = u("uCharge");
    const uSpin = u("uSpin"), uRainT = u("uRainT"), uGust = u("uGust"), uWindT = u("uWindT");
    const uBolt = u("uBolt"), uBoltAge = u("uBoltAge");
    const boltData = new Float32Array(BOLTS * 4), ageData = new Float32Array(BOLTS * 3);

    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let target = 0, p = 0, time = 0, flash = 0, nextFlash = 3, lastFlash = -1, look = [0, 0], lookTo = [0, 0];
    let last = performance.now(), raf = 0, shownSignal = -1, ready = false;
    // Scroll speed whips up gusts: they speed the cloud spin and the rain, so both run on their own clocks.
    let prevTarget = 0, gust = 0, spin = 0, rainT = 0, windT = 0;
    // Pointer in the shader's units (centre 0,0, y up, shorter screen side = 1). presence fades the
    // pointer's effects in and out; stir grows with how far it moved recently.
    let pointer = [0, 0], pointerTo = [0, 0], presence = 0, presenceTo = 0, stir = 0, moved = 0;
    // The same pointer in CSS pixels for the umbrella element, its sideways speed and lean.
    let px = [0, 0], prevPx = [0, 0], vx = 0, vy = 0, speed = 0, lean = 0, overLink = false;
    let invertedUntil = 0, state = "";
    // Hold to charge: the strike lands on release, bigger and forked the longer it was held.
    let chargeFrom = -1, charge = 0;
    const strikes: Strike[] = [];

    const toShader = (x: number, y: number) => {
      const m = Math.min(innerWidth, innerHeight);
      return [(x - innerWidth / 2) / m, (innerHeight / 2 - y) / m];
    };
    const inStorm = () => p < PEAK + 0.08;
    const inEye = () => p > 0.68;

    const onScroll = () => {
      const max = root.scrollHeight - innerHeight;
      target = max > 0 ? Math.min(scrollY / max, 1) : 0;
    };
    const onPointer = (e: PointerEvent) => {
      lookTo = [e.clientX / innerWidth - 0.5, 0.5 - e.clientY / innerHeight];
      const next = toShader(e.clientX, e.clientY);
      if (presenceTo) moved += Math.hypot(next[0] - pointerTo[0], next[1] - pointerTo[1]);
      pointerTo = next;
      px = [e.clientX, e.clientY];
      // Arriving (or a new touch) is not a flick: start the speed from here.
      if (!presenceTo) prevPx = px;
      presenceTo = 1;
      overLink = !!(e.target as Element).closest?.("a, button");
    };
    // Touch has no hover: the umbrella only shows while a finger is down.
    const onLeave = (e: PointerEvent) => {
      if (e.type === "pointerout" ? !e.relatedTarget : e.pointerType !== "mouse") presenceTo = 0;
      if (e.type === "pointercancel") chargeFrom = -1; // the finger started a scroll
    };
    const onDown = (e: PointerEvent) => {
      onPointer(e);
      if (e.button === 0 && !overLink && !still.matches) chargeFrom = time;
    };
    const onUp = (e: PointerEvent) => {
      const held = chargeFrom < 0 ? -1 : time - chargeFrom;
      chargeFrom = -1;
      onLeave(e);
      if (held < 0) return;
      if (inStorm()) strike(Math.min(held / 1.2, 1));
      else if (inEye()) releaseBirds(birdsRef.current!, e.clientX, e.clientY);
    };

    // Every click strikes: up to four bolts share the sky, the oldest makes way. Only the
    // full-screen flash is rate-limited (one per 0.4 s, under the three-flashes-a-second limit),
    // and the automatic lightning holds off for 2 s so it never stacks on top.
    const strike = (power: number) => {
      const [x, y] = pointerTo;
      const s: Strike = { x, y, top: x + (Math.random() - 0.5) * 0.6, seed: Math.random() * 100, age: 0, power, lit: false };
      if (strikes.length >= BOLTS) strikes.shift();
      strikes.push(s);
      nextFlash = Math.max(nextFlash, time + 2);
    };

    // Clouds are soft, so the canvas renders at ~60% of screen pixels and CSS scales it up.
    const onResize = () => {
      const scale = Math.min(devicePixelRatio, 2) * 0.6;
      canvas.width = Math.round(innerWidth * scale);
      canvas.height = Math.round(innerHeight * scale);
      gl?.viewport(0, 0, canvas.width, canvas.height);
      // The near rain is thin lines, so it renders at full sharpness.
      const dpr = Math.min(devicePixelRatio, 2);
      rainCanvas.width = Math.round(innerWidth * dpr);
      rainCanvas.height = Math.round(innerHeight * dpr);
      rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const calm = still.matches;
      const k = (rate: number) => (calm ? 1 : 1 - Math.exp(-dt * rate));

      // Reduced motion: the scene follows the scroll exactly and nothing moves on its own.
      p += (target - p) * k(5);
      const kmh = windAt(p);
      const windS = smooth(0, 0.6, p) * (1 - smooth(0.6, 0.78, p));
      // Rain slant: sideways per unit fallen. Same formula as the shader's.
      const slantNow = Math.min(0.15 + 0.5 * windS + 0.5 * gust, 0.9);
      if (!calm) {
        time += dt;
        gust += (Math.min((Math.abs(target - prevTarget) / Math.max(dt, 1e-3)) * 1.2, 1) - gust) * (1 - Math.exp(-dt * 3));
        spin += dt * (0.04 + 0.22 * windS + 0.6 * gust);
        rainT += dt * (1 + 1.5 * gust);
        windT += dt * (1 + 1.5 * gust) * slantNow;
        look = look.map((l, i) => l + (lookTo[i] - l) * k(3));
        // Sheet lightning while the storm builds, at most one every 2.5 s.
        if (time > nextFlash && p > 0.1 && p < PEAK + 0.05 && time - lastFlash > 0.4) {
          flash = 0.6 + Math.random() * 0.4;
          lastFlash = time;
          nextFlash = time + 2.5 + Math.random() * 4;
        }
        flash *= Math.exp(-dt * 7);
        stir = Math.min(stir * Math.exp(-dt * 1.5) + moved * 1.5, 1);
      } else flash = stir = gust = 0;
      prevTarget = target;
      moved = 0;
      pointer = pointerTo; // not eased: the shader's pointer must stay exactly under the umbrella
      presence += (presenceTo - presence) * (1 - Math.exp(-dt * 4));
      charge += ((chargeFrom >= 0 && inStorm() ? Math.min((time - chargeFrom) / 1.2, 1) : 0) - charge) * k(10);

      // Strikes age; each one's return stroke (90 ms in) gets the screen flash if the limit allows.
      for (const s of strikes) {
        s.age += dt;
        if (!s.lit && s.age >= 0.09) {
          s.lit = true;
          if (time - lastFlash > 0.4) {
            flash = Math.max(flash, 0.25 + 0.25 * s.power);
            lastFlash = time;
          }
        }
      }
      while (strikes.length && strikes[0].age > 1.6) strikes.shift();

      // Umbrella: leans into the wind and against your motion, shivers in strong wind, turns inside
      // out on a hard flick at Signal 4 and up, and folds over links and in the eye (no rain there).
      const vNow = (px[0] - prevPx[0]) / Math.max(dt, 1e-3), vyNow = (px[1] - prevPx[1]) / Math.max(dt, 1e-3);
      speed = Math.hypot(px[0] - prevPx[0], px[1] - prevPx[1]) / Math.max(dt, 1e-3);
      prevPx = px;
      vx += (vNow - vx) * k(10);
      vy += (vyNow - vy) * k(10);
      if (!calm && kmh >= 118 && speed > 2600 && time > invertedUntil) invertedUntil = time + 1.4;
      const nextState = overLink || inEye() ? "folded" : time < invertedUntil ? "inverted" : "open";
      if (nextState !== state) umbrella.dataset.state = state = nextState;
      const leanTo = calm ? 0 : Math.max(-40, Math.min(40, -kmh / 230 * 16 - vx * 0.02 + Math.sin(time * 11) * (kmh / 230) * 3));
      lean += (leanTo - lean) * k(9);
      umbrella.style.transform = `translate(${px[0]}px, ${px[1]}px) rotate(${lean}deg)`;
      umbrella.style.opacity = String(presence);
      umbrella.style.setProperty("--charge", charge.toFixed(3));

      // Near rain, blocked by the umbrella exactly as it is drawn this frame. Same density and wind
      // as the shader's distant rain (keep the two formulas in step with shader.ts).
      rainCtx.clearRect(0, 0, innerWidth, innerHeight);
      if (!calm) {
        const amount = (0.35 + 0.65 * smooth(0, 0.6, p)) * (1 - smooth(0.58, 0.72, p));
        const blocking = state === "open" && presence > 0.5;
        rain.step(dt, innerWidth, innerHeight, amount, slantNow, { x: px[0], y: px[1], angle: (lean * Math.PI) / 180, scale: UMBRELLA_SCALE, blocking, vx, vy });
        rain.draw(rainCtx);
      }

      if (gl && program) {
        boltData.fill(0);
        ageData.fill(0);
        strikes.forEach((s, i) => {
          boltData.set([s.x, s.y, s.top, s.seed], i * 4);
          ageData.set([s.age, s.power, 1], i * 3);
        });
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, time);
        gl.uniform1f(uP, p);
        gl.uniform1f(uFlash, flash);
        gl.uniform2f(uLook, look[0], look[1]);
        gl.uniform3f(uPointer, pointer[0], pointer[1], presence);
        gl.uniform1f(uStir, stir);
        gl.uniform1f(uCharge, charge);
        gl.uniform1f(uSpin, spin);
        gl.uniform1f(uRainT, rainT);
        gl.uniform1f(uWindT, windT);
        gl.uniform1f(uGust, gust);
        gl.uniform4fv(uBolt, boltData);
        gl.uniform3fv(uBoltAge, ageData);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // The loader lifts once the first storm frame is on screen and the fonts are in.
      if (!ready) {
        ready = true;
        document.fonts.ready.then(() => (root.dataset.ready = ""));
      }

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
    p = prevTarget = target;
    const listeners: [EventTarget, string, EventListener][] = [
      [window, "scroll", onScroll as EventListener],
      [window, "resize", onResize],
      [window, "pointermove", onPointer as EventListener],
      [window, "pointerdown", onDown as EventListener],
      [window, "pointerup", onUp as EventListener],
      [window, "pointercancel", onLeave as EventListener],
      [document, "pointerout", onLeave as EventListener],
    ];
    for (const [t, type, fn] of listeners) t.addEventListener(type, fn, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      delete root.dataset.umbrella;
      lenis?.destroy();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="storm-canvas fixed inset-0 -z-10 h-full w-full" />
      <canvas ref={rainRef} aria-hidden className="pointer-events-none fixed inset-0 -z-[5] h-full w-full" />
      <div ref={birdsRef} aria-hidden className="pointer-events-none fixed inset-0 z-20 overflow-hidden" />
      <Umbrella ref={umbrellaRef} />
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

// The pointer: an umbrella in thin line art, in the same hand as the gauge and the type. It is drawn
// white with mix-blend-mode: difference, so it stays light over the storm and turns dark over the eye's
// bright sky. Its canopy centre sits exactly on the pointer, so the rain shadow in the shader lines up.
// The ring fills while you hold to charge. States (open / inverted / folded) are CSS in globals.css.
function Umbrella({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} aria-hidden className="umbrella pointer-events-none fixed left-0 top-0 z-30 opacity-0" data-state="open">
      <svg
        viewBox="-40 -49 80 80"
        width="64"
        height="64"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="-ml-8 -mt-8 overflow-visible"
      >
        <circle className="umbrella-charge" cx="0" cy="-9" r="34" pathLength="1" strokeWidth="1.2" />
        <g className="umbrella-canopy" strokeWidth="1.5">
          <path d="M-28 4 Q-28 -22 0 -22 Q28 -22 28 4 Q21 0 14 4 Q7 0 0 4 Q-7 0 -14 4 Q-21 0 -28 4" />
          <path d="M0 -22 Q-9 -12 -14 4 M0 -22 Q9 -12 14 4" strokeWidth="1" strokeOpacity=".6" />
        </g>
        <path d="M0 -22 V-27 M0 4 V24 Q0 29 -4.5 29 Q-8 29 -8 25.5" strokeWidth="1.5" />
      </svg>
    </div>
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
