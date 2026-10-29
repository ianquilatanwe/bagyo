// The storm's sound, generated in code with the Web Audio API: no audio files to download or license.
// Rain is filtered noise, thunder is a noise burst plus a low rumble, birds are short whistles. Off until
// the visitor turns it on (browsers only allow audio after a click anyway); paused while the tab is hidden.

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode, rainGain: GainNode, rainTone: BiquadFilterNode, windGain: GainNode, patterGain: GainNode;
  let white: AudioBuffer, brown: AudioBuffer;
  let enabled = false;

  const noise = (seconds: number, brownian: boolean) => {
    const b = ctx!.createBuffer(1, ctx!.sampleRate * seconds, ctx!.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      // Brown noise: each sample drifts from the last, which leaves mostly low rumble.
      d[i] = brownian ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
    }
    return b;
  };
  const loop = (buffer: AudioBuffer, ...chain: AudioNode[]) => {
    const src = ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    [src, ...chain].reduce((a, b) => (a.connect(b), b));
    src.start(0, Math.random() * buffer.duration);
  };
  const filter = (type: BiquadFilterType, frequency: number, Q = 0.7) => new BiquadFilterNode(ctx!, { type, frequency, Q });
  const gain = (value = 0) => new GainNode(ctx!, { gain: value });

  function start() {
    ctx = new AudioContext();
    white = noise(3, false);
    brown = noise(4, true);
    // A compressor keeps several thunderclaps at once from clipping.
    master = gain(0.9);
    master.connect(new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 6 })).connect(ctx.destination);
    // Rain: hiss with the lows cut; the wind opens the top end up, so heavier rain sounds harsher.
    rainTone = filter("lowpass", 3000);
    rainGain = gain();
    loop(white, filter("highpass", 500), rainTone, rainGain, master);
    // Wind: a low rumble that rises with the storm and with gusts.
    windGain = gain();
    loop(brown, filter("lowpass", 260), windGain, master);
    // Drops on the umbrella: a tighter, brighter band of noise, loud only while drops are hitting it.
    patterGain = gain();
    loop(white, filter("bandpass", 2400, 1.4), patterGain, master);
  }

  const ramp = (p: AudioParam, value: number, smoothing = 0.25) => p.setTargetAtTime(value, ctx!.currentTime, smoothing);

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (on && !ctx) start();
      if (!ctx) return;
      if (on && document.visibilityState === "visible") ctx.resume();
      else ctx.suspend();
    },
    onVisibility() {
      if (!ctx || !enabled) return;
      if (document.visibilityState === "visible") ctx.resume();
      else ctx.suspend();
    },

    /** Every frame: rain 0..1 (the same amount the screen shows), wind 0..1, gust 0..1, umbrella hits per second. */
    update(rain: number, wind: number, gust: number, hitsPerSecond: number) {
      if (!ctx || !enabled) return;
      ramp(rainGain.gain, 0.35 * rain ** 1.5); // light rain stays audible; the fade to 0 is still smooth
      ramp(rainTone.frequency, 2600 + 4500 * Math.max(wind, gust * 0.7));
      ramp(windGain.gain, 0.55 * Math.min(wind + 0.6 * gust, 1) * Math.max(rain, 0.15 * wind));
      ramp(patterGain.gain, Math.min(hitsPerSecond / 400, 1) * 0.22, 0.08);
    },

    /** Thunder for a strike, one of three kinds at random; far (the sheet lightning) is a quiet,
     *  delayed roll. All of it is low rumble: no high crack, which sounded like a hit on the umbrella. */
    thunder(power: number, far: boolean) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime + (far ? 0.8 + Math.random() * 1.4 : 0.03 + Math.random() * 0.1);
      const kind = far ? 1 : Math.floor(Math.random() * 3);
      const loud = (far ? 0.35 : 0.85) * (0.6 + 0.4 * power);
      const src = ctx.createBufferSource();
      src.buffer = brown;
      src.loop = true;
      const tone = filter("lowpass", 200);
      const g = gain();
      src.connect(tone).connect(g).connect(master);
      g.gain.setValueAtTime(0, t);
      let length: number;
      if (kind === 0) {
        // Crack-boom: hits fast, and the filter closes as it rolls, so it goes from bright to dark.
        length = 2.5 + 1.5 * power;
        tone.frequency.setValueAtTime(900, t);
        tone.frequency.exponentialRampToValueAtTime(130, t + 1.4);
        g.gain.linearRampToValueAtTime(loud, t + 0.02);
        g.gain.setTargetAtTime(0, t + 0.15, length / 5);
      } else if (kind === 1) {
        // Roller: a few uneven swells, each a little quieter, like thunder echoing off cloud.
        length = (far ? 4 : 3.5) + 1.5 * power;
        tone.frequency.setValueAtTime(far ? 130 : 240, t);
        const swells = 3 + Math.floor(Math.random() * 3);
        const segment = (length * 0.8) / swells; // swells back to back, so the ramps stay in time order
        for (let i = 0; i < swells; i++) {
          const at = t + i * segment;
          const peak = loud * (1 - (i / swells) * 0.6) * (0.6 + 0.4 * Math.random());
          g.gain.linearRampToValueAtTime(peak, at + Math.min(0.12, segment * 0.4));
          g.gain.linearRampToValueAtTime(peak * 0.35, at + segment);
        }
        g.gain.setTargetAtTime(0, t + length * 0.85, 0.4);
      } else {
        // Deep boom: one heavy, very low swell with a long tail.
        length = 3.5 + 2 * power;
        tone.frequency.setValueAtTime(95, t);
        g.gain.linearRampToValueAtTime(loud * 1.3, t + 0.18);
        g.gain.setTargetAtTime(0, t + 0.4, length / 4);
      }
      src.start(t, Math.random() * 3);
      src.stop(t + length + 1.5);
    },

    /** Birds taking off: each gives two or three quick rising whistles. */
    birds(count: number) {
      if (!ctx || !enabled) return;
      const now = ctx.currentTime;
      for (let i = 0; i < count; i++) {
        let t = now + i * 0.09 + Math.random() * 0.12;
        for (let c = 2 + Math.floor(Math.random() * 2); c > 0; c--) {
          const osc = new OscillatorNode(ctx, { type: "sine" });
          const g = gain();
          osc.connect(g).connect(master);
          const f = 2400 + Math.random() * 1400;
          osc.frequency.setValueAtTime(f, t);
          osc.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.05);
          osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 0.1);
          osc.start(t);
          osc.stop(t + 0.12);
          t += 0.1 + Math.random() * 0.06;
        }
      }
    },
  };
}
