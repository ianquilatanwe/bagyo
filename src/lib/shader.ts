// One full-screen fragment shader draws the whole storm. We look straight up into it:
// spiral cloud bands that turn faster near the centre, three layers of slanted rain,
// and an eye that opens onto clear sky once the wind peaks. uP is scroll progress (0..1).

// A single triangle that covers the screen; no vertex buffer needed.
export const VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
// Whole numbers default to medium precision in fragment shaders, and phone GPUs (Adreno) really do run
// them at 16 bits; the hash below needs full 32-bit integers or the clouds flatten out.
precision highp int;
uniform vec2 uRes;
uniform float uTime;
uniform float uP;
uniform float uFlash;
uniform vec2 uLook;
uniform vec3 uPointer; // xy in the same units as uv, z = 0..1 how present the cursor is
uniform float uStir;   // 0..1, how hard the pointer has been moving
#define BOLTS 4
uniform vec4 uBolt[BOLTS];    // per strike: point xy, x where it leaves the top, zigzag seed
uniform vec3 uBoltAge[BOLTS]; // per strike: seconds since the click, charge 0..1 (bigger, forked), 1 if in use
uniform float uCharge; // 0..1 while the pointer is held down, before the strike
uniform float uSpin;   // cloud spin angle, 0..2π (kept small: phone GPUs lose sin/cos accuracy on big angles)
uniform float uRainT;  // rain fall clock, also sped up by gusts
uniform float uWindT;  // how far the wind has carried the rain: the sum of slant × fall clock
uniform float uGust;   // 0..1, how fast the page is being scrolled
out vec4 outColor;

// Random value 0..1 for a grid cell. Integer maths (the pcg2d hash), so it is exact on every GPU;
// the usual fract(sin(...))-style float hashes lose precision on phone GPUs and turn noise blocky.
float hash(vec2 p) {
  // Shift by 2^22 first: converting a negative int to uint is handled differently by some phone drivers.
  uvec2 v = uvec2(ivec2(floor(p)) + (1 << 22));
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return float(v.x ^ v.y) / 4294967295.0;
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// One layer of rain. Each column holds drops at random heights; a drop is a bright head with a
// fading tail above it. Drops fall with the fall clock and are carried sideways by the wind clock,
// so a change of wind only changes where drops go next; it never slides the drops already falling
// (shearing the whole field by the slant did, which showed as rain jumping sideways on scroll).
// The tail leans by the current slant, so it can reach into the next few columns: check those too.
float rain(vec2 uv, float cols, float speed, float slant, float len) {
  float rows = cols * 0.12;                // cells are this many times taller than wide
  float fall = speed / rows;               // fall speed in this layer's units
  float x = (uv.x - uWindT * fall) * cols; // in column widths, moving with the wind
  float v = 0.0;
  for (int k = 0; k < 5; k++) {
    float col = floor(x) + float(k);
    float y = uv.y * rows + uRainT * speed + hash(vec2(col, 7.0)) * 20.0;
    float cell = floor(y), f = fract(y);
    float head = col + 0.2 + 0.6 * hash(vec2(cell, col));
    float d = abs(x - (head - slant * f / 0.12));
    v = max(v, smoothstep(len, 0.0, f) * smoothstep(0.12, 0.0, d) * step(0.55, hash(vec2(col, cell))));
  }
  return v;
}

float zig(float y, float seed) {
  return (noise(vec2(y * 9.0, seed)) - 0.5) * 0.14 + (noise(vec2(y * 34.0, seed + 3.0)) - 0.5) * 0.05;
}

// One jagged lightning segment from a (bottom) up to b (top). The zigzag is pinned to zero at both
// ends so the bolt always lands exactly at a. width < 1 thins the core.
float boltX(float y, vec2 a, vec2 b, float seed) {
  float t = clamp((y - a.y) / (b.y - a.y), 0.0, 1.0);
  return mix(a.x, b.x, t) + zig(y, seed) * sin(t * 3.1416);
}

float boltSeg(vec2 uv, vec2 a, vec2 b, float seed, float width) {
  // Distance measured across the bolt, not just sideways: where the zigzag runs steeply sideways,
  // sideways distance jumps between pixel rows and leaves the bolt in broken horizontal slices.
  float x = boltX(uv.y, a, b, seed);
  float slope = (boltX(uv.y + 0.002, a, b, seed) - x) / 0.002;
  float d = abs(uv.x - x) / sqrt(1.0 + slope * slope);
  // Fade out just past each end (a hard cut shows as a line).
  float inside = smoothstep(-0.03, 0.01, uv.y - a.y) * smoothstep(0.01, -0.01, uv.y - b.y);
  return inside * (exp(-d * 260.0 / width) + 0.35 * width * exp(-d * 30.0));
}

// How bright a strike's channel is over time, like the real thing: nothing for the first 90 ms
// (the leader is still stepping down), then the bright return stroke, two weaker re-strikes down the
// same channel, and each decays fast. Only the thin channel flickers; the cloud glow is one soft pulse.
float stroke(float age) {
  float t = age - 0.09;
  if (t < 0.0) return 0.0;
  return exp(-t * 14.0) + 0.6 * step(0.11, t) * exp(-(t - 0.11) * 20.0)
       + 0.4 * step(0.24, t) * exp(-(t - 0.24) * 20.0);
}

// One clicked strike. The leader grows down from the cloud in visible steps, dim and branching;
// when it touches down the return stroke lights the whole channel (thicker while brightest), then
// it fades through a violet afterglow. A charged strike is wider and keeps a fork. glow returns the
// soft light it throws on the clouds.
vec3 strike(vec2 uv, vec4 b, vec3 info, out float glow) {
  glow = 0.0;
  if (info.z < 0.5) return vec3(0.0);
  float age = info.x, power = info.y;
  vec2 a = b.xy, top = vec2(b.z, 0.5 * uRes.y / min(uRes.x, uRes.y) + 0.05);

  float grow = floor(min(age / 0.09, 1.0) * 7.0) / 7.0;
  float tipY = mix(top.y, a.y - 0.05, grow);
  float shown = smoothstep(tipY - 0.01, tipY + 0.01, uv.y);
  float s = stroke(age);
  float after = step(0.09, age) * 0.15 * exp(-(age - 0.09) * 2.5);
  float bright = age < 0.09 ? 0.3 : s + after;
  float w = (1.0 + 0.8 * power) * (0.55 + 0.5 * min(s, 1.0));

  float ch = boltSeg(uv, a, top, b.w, w);
  float jy = mix(a.y, top.y, 0.5);
  vec2 joint = vec2(mix(a.x, top.x, 0.5) + zig(jy, b.w), jy);
  float side = fract(b.w) > 0.5 ? 1.0 : -1.0;
  vec2 tip = vec2(a.x + side * (0.12 + 0.15 * power), mix(a.y, top.y, 0.22));
  ch += smoothstep(0.4, 0.7, power) * 0.7 * boltSeg(uv, tip, joint, b.w + 11.0, 0.6);
  // A leader branch that never reaches the ground: seen while the leader searches, gone soon after.
  float jy2 = mix(a.y, top.y, 0.78);
  vec2 joint2 = vec2(mix(a.x, top.x, 0.78) + zig(jy2, b.w), jy2);
  vec2 tip2 = vec2(joint2.x - side * 0.1, mix(a.y, top.y, 0.55));
  ch += exp(-max(age - 0.09, 0.0) * 10.0) * 0.6 * boltSeg(uv, tip2, joint2, b.w + 23.0, 0.5);

  glow = step(0.09, age) * exp(-(age - 0.09) * 6.0) * (0.8 + 0.6 * power);
  float impact = (0.5 + 0.5 * power) * s * exp(-length(uv - a) * 14.0 / w);
  vec3 tint = mix(vec3(0.72, 0.62, 1.0), vec3(0.88, 0.93, 1.0), min(s * 2.0, 1.0));
  return (shown * ch * bright + impact) * tint;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float p = uP;

  float wind = smoothstep(0.0, 0.6, p) * (1.0 - smoothstep(0.6, 0.78, p));
  float eye = smoothstep(0.6, 0.82, p);
  float rainAmt = (0.35 + 0.65 * smoothstep(0.0, 0.6, p)) * (1.0 - smoothstep(0.58, 0.72, p));

  // Cloud spiral: rotate each point by an angle that grows towards the centre.
  vec2 v = uv + uLook * 0.04;
  float r = length(v);
  float turn = uSpin + (0.9 + 2.2 * wind) / (r + 0.4);
  // Moving the pointer stirs the clouds around it: an extra twist that fades with distance.
  vec2 toP = uv - uPointer.xy;
  float near = uPointer.z * exp(-dot(toP, toP) * 6.0);
  vec2 q = rot(turn) * (uPointer.xy + rot(uStir * near * 1.8) * (v - uPointer.xy));
  float c = fbm(q * 2.0 + vec2(uTime * 0.03, 0.0));
  float d = fbm(q * 4.5 + c * 1.8 - vec2(0.0, uTime * 0.05));
  float cloud = 0.6 * c + 0.4 * d;

  // The eye: below 0 radius it is closed; it opens to 0.42 (wider on tall phone screens, where
  // the text wraps onto more lines), with a ragged cloud edge.
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.0);
  float eyeR = mix(-0.4, 0.42 + 0.3 * tall, eye);
  float wall = smoothstep(eyeR - 0.04, eyeR + 0.16, r + (cloud - 0.5) * 0.3);

  // Typhoon light turns greenish at the peak.
  vec3 dark = mix(vec3(0.10, 0.13, 0.17), vec3(0.06, 0.10, 0.10), wind);
  vec3 lite = mix(vec3(0.46, 0.52, 0.58), vec3(0.30, 0.40, 0.38), wind);
  float lum = smoothstep(0.3, 0.85, cloud);
  vec3 cl = mix(dark, lite, lum);

  // Late sun lighting the inside of the eyewall.
  // The sun sits up and to the right and leans towards the cursor. The wall opposite it is lit,
  // so the warm side swings round as you move.
  vec2 sun = mix(vec2(0.18, 0.22), uPointer.xy, 0.45 * uPointer.z);
  float facing = 0.6 + 0.4 * dot(normalize(v + 1e-4), -normalize(sun + 1e-4));
  float rim = eye * smoothstep(eyeR + 0.4, eyeR + 0.02, r) * facing;
  cl = mix(cl, mix(vec3(0.62, 0.52, 0.48), vec3(1.0, 0.88, 0.72), lum), rim);

  // Lightning lights the thick cloud more than the thin.
  cl += uFlash * (0.15 + 0.7 * lum) * vec3(0.75, 0.82, 1.0);
  // Clicked strikes, and the light each throws on the cloud around where it lands.
  vec3 bolts = vec3(0.0);
  float boltGlow = 0.0;
  for (int i = 0; i < BOLTS; i++) {
    float g;
    bolts += strike(uv, uBolt[i], uBoltAge[i], g);
    boltGlow += g * exp(-length(uv - uBolt[i].xy) * 2.5);
  }
  cl += boltGlow * (0.2 + 0.8 * lum) * vec3(0.75, 0.82, 1.0);
  // Holding the pointer down gathers a steady charge glow in the cloud around it.
  cl += uCharge * (0.1 + 0.3 * lum) * exp(-length(toP) * 7.0) * vec3(0.55, 0.65, 1.0);

  // Clear sky: deep blue overhead, paler towards the wall, a small warm sun glow up and to the right.
  vec3 sky = mix(vec3(0.36, 0.6, 0.9), vec3(0.72, 0.84, 0.95), smoothstep(0.0, 0.45, r));
  sky += vec3(1.0, 0.8, 0.5) * 0.35 * exp(-8.0 * length(v - sun));
  vec3 col = mix(sky, cl, wall);

  float slant = min(0.15 + 0.5 * wind + 0.5 * uGust, 0.9);
  // Two distant layers only. The near rain is drawn as particles (rain.ts) so the umbrella can block it.
  float rn = rain(uv, 40.0, 1.6, slant, 0.35) * 0.5
           + rain(uv * 1.7 + 3.0, 70.0, 2.4, slant, 0.45) * 0.35;

  col += rn * rainAmt * 0.55 * vec3(0.7, 0.78, 0.85);
  col += bolts;

  // Sheets of spray blowing across at the peak.
  float spray = (wind * 0.3 + uGust * 0.25 * (1.0 - eye));
  col = mix(col, vec3(0.35, 0.42, 0.44), spray * fbm(uv * vec2(0.8, 3.0) + vec2(uWindT * 0.6, 0.0)));

  col *= 1.0 - 0.45 * smoothstep(0.5, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  outColor = vec4(col, 1.0);
}`;
