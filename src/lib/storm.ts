// The storm's story as a function of scroll progress p (0 = top of the page, 1 = bottom).
// The wind builds to its peak at PEAK, then drops as the eye opens. The shader uses the same p.

export const PEAK = 0.6;
const MIN_KMH = 45;
const MAX_KMH = 230;
const EYE_KMH = 12;

/** Smoothstep: 0 at a, 1 at b, eased in between (the same as GLSL smoothstep). */
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Sustained wind in km/h at progress p. */
export function windAt(p: number): number {
  if (p <= PEAK) return MIN_KMH + (MAX_KMH - MIN_KMH) * Math.pow(Math.max(p, 0) / PEAK, 1.6);
  return MAX_KMH + (EYE_KMH - MAX_KMH) * smooth(PEAK, 0.8, p);
}

// PAGASA Tropical Cyclone Wind Signal thresholds (km/h): the lowest wind for signals 1 to 5.
const SIGNAL_FROM = [39, 62, 89, 118, 185];

/** Wind signal 1 to 5 for a wind speed, or 0 below Signal No. 1 (only happens inside the eye). */
export function signalFor(kmh: number): number {
  let s = 0;
  while (s < SIGNAL_FROM.length && kmh >= SIGNAL_FROM[s]) s++;
  return s;
}
