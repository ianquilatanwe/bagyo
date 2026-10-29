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
uniform vec2 uRes;
uniform float uTime;
uniform float uP;
uniform float uFlash;
uniform vec2 uLook;
uniform vec3 uPointer; // xy in the same units as uv, z = 0..1 how present the cursor is
uniform float uStir;   // 0..1, how hard the pointer has been moving
uniform vec4 uBolt;    // strike point xy, x where the bolt leaves the top, zigzag seed
uniform float uBoltT;  // 1 at the strike, fading to 0
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
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

// One layer of rain: each column holds drops at random heights; a drop is a bright head
// with a fading tail above it. slant tilts the columns with the wind.
float rain(vec2 uv, float cols, float speed, float slant, float len) {
  uv.x += uv.y * slant;
  float col = floor(uv.x * cols);
  float y = uv.y * cols * 0.12 + uTime * speed + hash(vec2(col, 7.0)) * 20.0;
  float cell = floor(y), f = fract(y);
  float x = fract(uv.x * cols) - (0.2 + 0.6 * hash(vec2(cell, col)));
  return smoothstep(len, 0.0, f) * smoothstep(0.12, 0.0, abs(x)) * step(0.55, hash(vec2(col, cell)));
}

// A lightning bolt from the top of the screen down to the clicked point. Its zigzag is two
// octaves of noise, pinned to zero at both ends so it always lands where you clicked.
float bolt(vec2 uv) {
  float top = 0.5 * uRes.y / min(uRes.x, uRes.y) + 0.05;
  float t = clamp((uv.y - uBolt.y) / (top - uBolt.y), 0.0, 1.0);
  float zig = (noise(vec2(uv.y * 9.0, uBolt.w)) - 0.5) * 0.14
            + (noise(vec2(uv.y * 34.0, uBolt.w + 3.0)) - 0.5) * 0.05;
  float d = abs(uv.x - mix(uBolt.x, uBolt.z, t) - zig * sin(t * 3.1416));
  // Fade out just below the strike point (a hard cut shows as a line), plus a glow where it lands.
  float end = smoothstep(-0.03, 0.01, uv.y - uBolt.y);
  return end * (exp(-d * 260.0) + 0.35 * exp(-d * 30.0)) + 0.5 * exp(-length(uv - uBolt.xy) * 14.0);
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
  float turn = uTime * (0.04 + 0.22 * wind) + (0.9 + 2.2 * wind) / (r + 0.4);
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
  // A clicked strike lights the cloud around where it lands.
  cl += uBoltT * (0.2 + 0.8 * lum) * 0.8 * exp(-length(uv - uBolt.xy) * 2.5) * vec3(0.75, 0.82, 1.0);

  // Clear sky: deep blue overhead, paler towards the wall, a small warm sun glow up and to the right.
  vec3 sky = mix(vec3(0.36, 0.6, 0.9), vec3(0.72, 0.84, 0.95), smoothstep(0.0, 0.45, r));
  sky += vec3(1.0, 0.8, 0.5) * 0.35 * exp(-8.0 * length(v - sun));
  vec3 col = mix(sky, cl, wall);

  float slant = 0.15 + 0.5 * wind;
  // Rain parts around the cursor like an umbrella: pushed outwards and thinned near it.
  vec2 ruv = uv + normalize(toP + 1e-4) * 0.1 * near;
  float rn = rain(ruv, 40.0, 1.6, slant, 0.35) * 0.5
           + rain(ruv * 1.7 + 3.0, 70.0, 2.4, slant, 0.45) * 0.35
           + rain(ruv * 0.6 + 9.0, 24.0, 1.1, slant, 0.25) * 0.7;
  col += rn * rainAmt * (1.0 - 0.85 * uPointer.z * exp(-dot(toP, toP) * 40.0)) * vec3(0.7, 0.78, 0.85);
  col += uBoltT * bolt(uv) * vec3(0.85, 0.9, 1.0);

  // Sheets of spray blowing across at the peak.
  col = mix(col, vec3(0.35, 0.42, 0.44), wind * 0.3 * fbm(uv * vec2(0.8, 3.0) + vec2(uTime * 0.8 * wind, 0.0)));

  col *= 1.0 - 0.45 * smoothstep(0.5, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  outColor = vec4(col, 1.0);
}`;
