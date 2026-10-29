// Foreground rain as particles, so the umbrella can really block it. The shader draws the distant
// rain behind; these are the drops in front. A drop that hits the canopy stops, throws a small splash,
// and its water runs to that side of the rim, where it drips off and falls under gravity. Everything
// uses the umbrella's position and angle from the same frame, so the two can never drift apart.

/** The umbrella as the rain sees it, in CSS pixels. Same transform as the DOM element. */
export type Canopy = {
  x: number; // canopy centre = the pointer
  y: number;
  angle: number; // radians, clockwise (screen y points down), same as the CSS rotate()
  scale: number; // CSS pixels per SVG unit
  blocking: boolean; // open and visible (folded or inside out lets the rain through)
  vx: number; // how fast the umbrella is moving, px/s
  vy: number;
};

// The canopy in the umbrella's SVG units, measured from the canopy centre: a half-ellipse dome
// from the tip (y = -13) down to the rim (y = 13), 28 either side. Keep in step with Storm.tsx.
const RIM_Y = 13;
const HALF_W = 28;
const DOME_H = 26;

const toLocal = (c: Canopy, x: number, y: number) => {
  const dx = x - c.x, dy = y - c.y, cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  return [(dx * cos + dy * sin) / c.scale, (-dx * sin + dy * cos) / c.scale];
};

/** Which half of the canopy a point is inside: -1 left, 1 right, 0 outside. */
export function canopyHit(c: Canopy, x: number, y: number): number {
  const [lx, ly] = toLocal(c, x, y);
  if (ly > RIM_Y) return 0;
  return (lx / HALF_W) ** 2 + ((ly - RIM_Y) / DOME_H) ** 2 <= 1 ? (lx < 0 ? -1 : 1) : 0;
}

/** Screen position of the left (-1) or right (1) end of the rim. */
export function rimEnd(c: Canopy, side: number): [number, number] {
  const lx = side * HALF_W * c.scale, ly = RIM_Y * c.scale, cos = Math.cos(c.angle), sin = Math.sin(c.angle);
  return [c.x + lx * cos - ly * sin, c.y + lx * sin + ly * cos];
}

const RAIN = 0, SPLASH = 1, DRIP = 2;
type Drop = { kind: number; x: number; y: number; vx: number; vy: number; depth: number; life: number };

const GRAVITY = 2200; // px/s², for splashes and drips; rain is already at its falling speed
const DRIP_EVERY = 2.5; // drops of water that make one drip off the rim

export function createRain() {
  const drops: Drop[] = [];
  const water = [0, 0]; // collected on the left and right halves of the canopy

  /** amount 0..1 sets the density; slant is the wind (sideways px per px fallen). */
  function step(dt: number, w: number, h: number, amount: number, slant: number, c: Canopy) {
    const target = Math.round((amount * w * h) / 1300);
    let rain = 0;
    for (const d of drops) if (d.kind === RAIN) rain++;
    for (; rain < target; rain++) {
      const depth = Math.random();
      const vy = 900 + depth * 600;
      // Spawn anywhere on screen while filling up, then just above the top. x reaches back
      // upwind so the slant doesn't leave the left edge empty.
      const fill = rain < target * 0.5;
      drops.push({
        kind: RAIN,
        x: -slant * h + Math.random() * (w + slant * h),
        y: fill ? Math.random() * h : -20 - Math.random() * 60,
        vx: vy * slant,
        vy,
        depth,
        life: 1,
      });
    }
    if (!c.blocking) water[0] = water[1] = 0;

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.kind === RAIN) {
        d.vx = d.vy * slant; // gusts shear the rain the same way as the shader's
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        // Test a few points along this frame's path: a fast drop moves ~25 px a frame,
        // about the canopy's thickness, and would otherwise slip through.
        let side = 0;
        if (c.blocking) for (let s = 1; s <= 3 && !side; s++) side = canopyHit(c, d.x + (nx - d.x) * (s / 3), d.y + (ny - d.y) * (s / 3));
        if (side) {
          water[side < 0 ? 0 : 1]++;
          const hx = d.x + (nx - d.x) * 0.5, hy = d.y + (ny - d.y) * 0.5;
          for (let k = Math.random() < 0.5 ? 1 : 2; k > 0; k--)
            drops.push({ kind: SPLASH, x: hx, y: hy, vx: side * (60 + Math.random() * 160) + c.vx * 0.4, vy: -(80 + Math.random() * 180) + c.vy * 0.4, depth: 1, life: 0.35 });
          drops.splice(i, 1);
          continue;
        }
        d.x = nx;
        d.y = ny;
      } else {
        d.vy = Math.min(d.vy + GRAVITY * dt, 1400);
        // Drips pick up the wind as they fall, ending up on the rain's slant.
        if (d.kind === DRIP) d.vx += (d.vy * slant - d.vx) * Math.min(dt * 4, 1);
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt;
      }
      if (d.y > h + 40 || d.life <= 0 || d.x > w + 40 + slant * 40) drops.splice(i, 1);
    }

    // Water runs off the rim: one drip per few drops caught, from that side's rim end,
    // starting with the umbrella's own motion and then falling.
    if (c.blocking)
      for (const side of [-1, 1]) {
        const s = side < 0 ? 0 : 1;
        while (water[s] >= DRIP_EVERY) {
          water[s] -= DRIP_EVERY;
          const [x, y] = rimEnd(c, side);
          drops.push({ kind: DRIP, x, y, vx: c.vx * 0.5 + side * 15, vy: 40 + Math.max(c.vy, 0) * 0.5, depth: 1, life: 3 });
        }
      }
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = "round";
    ctx.strokeStyle = ctx.fillStyle = "rgb(205 218 228)";
    // Rain in three depth bands: nearer drops are faster, longer, brighter and thicker.
    for (let band = 0; band < 3; band++) {
      ctx.globalAlpha = 0.22 + band * 0.16;
      ctx.lineWidth = 0.8 + band * 0.4;
      ctx.beginPath();
      for (const d of drops) {
        if (d.kind !== RAIN || Math.min(Math.floor(d.depth * 3), 2) !== band) continue;
        const k = (10 + d.depth * 20) / d.vy;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vx * k, d.y - d.vy * k);
      }
      ctx.stroke();
    }
    // Drips stretch as they speed up; splashes are specks that fade.
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const d of drops) {
      if (d.kind !== DRIP) continue;
      const k = 0.018;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * k, d.y - Math.max(d.vy * k, 2));
    }
    ctx.stroke();
    for (const d of drops) {
      if (d.kind !== SPLASH) continue;
      ctx.globalAlpha = Math.max(d.life / 0.35, 0) * 0.8;
      ctx.fillRect(d.x - 0.9, d.y - 0.9, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
  }

  return { step, draw, clear: () => (drops.length = 0) };
}
