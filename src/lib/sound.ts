// The storm's sound, generated in code with the Web Audio API: no audio files to download or license.
// Off until the visitor turns it on (browsers only allow audio after a click anyway).
//
// Layers: rain (a stereo hiss bed plus thousands of individual droplet ticks, light and heavy textures
// crossfaded by the wind), wind (a howl whose pitch drifts, a whistle in gusts, a low body), umbrella
// patter (fabric taps that blur into a drumming roar in heavy rain, panned to the umbrella), thunder (three kinds, panned to the strike,
// with a reverb tail; distant thunder is wetter, close thunder drier with a low thump) and birds
// (trilled chirps). Everything ends in a compressor and a limiter so stacked thunder never clips.
//
// Nothing here touches the page: the caller passes positions as pans (-1 left … 1 right) and tells it
// when the tab is hidden. That keeps the audio testable and renderable offline.

type Pan = number;

export function createSound() {
  let ctx: AudioContext | null = null;
  let enabled = false, visible = true;
  let master: GainNode, reverb: GainNode;
  let rainGain: GainNode, rainLight: GainNode, rainHeavy: GainNode, rainTone: BiquadFilterNode;
  let windBody: GainNode, howl: GainNode, howlBand: BiquadFilterNode, whistle: GainNode, whistleBand: BiquadFilterNode;
  let brown: AudioBuffer, taps: AudioBuffer[], drum: GainNode, drumPan: StereoPannerNode;
  // Parameter updates go out about 20 times a second, not every frame: scheduling 60 changes a second
  // per parameter piles up automation events for nothing you can hear.
  let lastUpdate = 0, pendingHits = 0, cover = 0;
  const sent = new Map<AudioParam, number>();

  const sr = () => ctx!.sampleRate;
  const gain = (value = 0) => new GainNode(ctx!, { gain: value });
  const filter = (type: BiquadFilterType, frequency: number, Q = 0.7) => new BiquadFilterNode(ctx!, { type, frequency, Q });
  const panner = (pan: Pan) => new StereoPannerNode(ctx!, { pan: Math.max(-1, Math.min(1, pan)) });

  /** A stereo buffer filled sample by sample; each channel gets its own randomness (that is the width). */
  const buffer = (seconds: number, fill: (d: Float32Array, rate: number) => void, channels = 2) => {
    const b = ctx!.createBuffer(channels, Math.round(sr() * seconds), sr());
    for (let c = 0; c < channels; c++) fill(b.getChannelData(c), sr());
    return b;
  };

  // Rain texture: soft hiss plus droplets, each a tiny ringing tick (a fast-decaying sine).
  const rainTexture = (bed: number, dropsPerSecond: number, low: number, high: number) =>
    buffer(4, (d, rate) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += 0.35 * (Math.random() * 2 - 1 - lp); // one-pole lowpass: hiss without the harsh top
        d[i] = lp * bed;
      }
      for (let n = dropsPerSecond * 4; n > 0; n--) {
        const at = Math.floor(Math.random() * d.length);
        const f = low + Math.random() * (high - low), tau = rate * (0.0006 + Math.random() * 0.0025);
        const amp = 0.02 + 0.16 * Math.random() ** 3, len = Math.min(tau * 4, d.length - at);
        for (let k = 0; k < len; k++) d[at + k] += amp * Math.sin((2 * Math.PI * f * k) / rate) * Math.exp(-k / tau);
      }
    });

  const loop = (b: AudioBuffer, ...chain: AudioNode[]) => {
    const src = new AudioBufferSourceNode(ctx!, { buffer: b, loop: true });
    [src, ...chain].reduce((a, n) => (a.connect(n), n));
    src.start(0, Math.random() * b.duration);
  };

  function start() {
    ctx = new AudioContext();
    brown = buffer(4, (d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) d[i] = (last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02) * 3.5;
    });
    const white = buffer(3, (d) => d.forEach((_, i) => (d[i] = Math.random() * 2 - 1)));

    // Master: compressor for glue, then a hard limiter just under full scale.
    master = gain(1.4);
    master
      .connect(new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 3, attack: 0.01, release: 0.25 }))
      .connect(new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 }))
      .connect(ctx.destination);

    // A shared reverb: a dark, decaying noise tail, 2.6 s. Sends are taken before panning, so the
    // tail stays wide wherever the dry sound sits.
    const ir = buffer(2.6, (d, rate) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += 0.25 * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp((-3.2 * i) / rate) * Math.min(i / (rate * 0.01), 1);
      }
    });
    reverb = gain(1);
    reverb.connect(new ConvolverNode(ctx, { buffer: ir })).connect(master);

    // Rain: light and heavy textures, crossfaded by the wind, through one tone control.
    rainTone = filter("lowpass", 4000);
    rainGain = gain();
    rainTone.connect(filter("highpass", 250)).connect(rainGain).connect(master);
    rainLight = gain();
    rainHeavy = gain();
    loop(rainTexture(0.05, 500, 2500, 7500), rainLight, rainTone);
    loop(rainTexture(0.22, 2600, 1200, 6000), rainHeavy, rainTone);

    // Wind: low body, a howl (bandpassed noise whose pitch drifts), and a thin whistle in gusts.
    windBody = gain();
    loop(brown, filter("lowpass", 160), windBody, master);
    howlBand = filter("bandpass", 450, 1.6);
    howl = gain();
    loop(brown, gain(3), howlBand, howl, master);
    whistleBand = filter("bandpass", 900, 16);
    whistle = gain();
    loop(white, whistleBand, whistle, master);

    // Umbrella taps: a drop hitting taut fabric. A tiny burst of noise rings the canopy's low-mid
    // resonance (a two-pole resonator, 250-800 Hz, dying in 8-20 ms), with a faint splash on top, and
    // the whole thing softened the way cloth dulls a sound. Eight variants, so no two taps repeat.
    taps = Array.from({ length: 8 }, () => {
      const f = 250 + Math.random() * 550, tau = 0.008 + Math.random() * 0.012;
      return buffer(0.06, (d, rate) => {
        const r = Math.exp(-1 / (tau * rate)), c = 2 * r * Math.cos((2 * Math.PI * f) / rate);
        let y1 = 0, y2 = 0, prev = 0, soft = 0, peak = 0;
        for (let k = 0; k < d.length; k++) {
          const hit = k < rate * 0.003 ? Math.random() * 2 - 1 : 0;
          const y = c * y1 - r * r * y2 + hit;
          y2 = y1;
          y1 = y;
          const n = Math.random() * 2 - 1, splash = (n - prev) * Math.exp(-k / (rate * 0.004)); // highpassed noise
          prev = n;
          soft += 0.45 * (y * 0.12 + splash * 0.15 - soft); // fabric damping (one-pole lowpass)
          d[k] = soft;
          peak = Math.max(peak, Math.abs(soft));
        }
        for (let k = 0; k < d.length; k++) d[k] /= peak || 1;
      }, 1);
    });
    // When the rain is heavy the taps blur into a continuous drumming on the canopy.
    drum = gain();
    drumPan = panner(0);
    loop(white, filter("bandpass", 420, 0.9), filter("lowpass", 1600), drum, drumPan, master);
  }

  /** Smoothly move a parameter towards a value, skipping changes too small to hear. */
  const glide = (p: AudioParam, value: number, smoothing = 0.12) => {
    const prev = sent.get(p);
    if (prev !== undefined && Math.abs(prev - value) < Math.max(1e-4, Math.abs(prev) * 0.01)) return;
    sent.set(p, value);
    p.cancelScheduledValues(ctx!.currentTime);
    p.setTargetAtTime(value, ctx!.currentTime, smoothing);
  };

  const running = () => !!ctx && enabled && visible;
  const sync = () => {
    if (!ctx) return;
    if (enabled && visible) ctx.resume();
    else ctx.suspend();
  };

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (on && !ctx) start();
      sync();
    },
    /** The page tells us when the tab is hidden, so nothing plays in the background. */
    setVisible(v: boolean) {
      visible = v;
      sync();
    },

    /**
     * Every frame. rain 0..1 is the same amount the screen shows (0 from the eye to the end, so the rain
     * fades out with the picture); wind and gust 0..1; hits = umbrella hits this frame; umbrellaPan where it is.
     */
    update(rain: number, wind: number, gust: number, hits: number, umbrellaPan: Pan) {
      if (!running()) return;
      pendingHits += hits;
      const now = ctx!.currentTime;
      if (now - lastUpdate < 0.05) return;
      const hitRate = pendingHits / Math.max(now - lastUpdate, 0.05); // drops per second on the canopy
      lastUpdate = now;

      const heavy = Math.min(Math.max((wind - 0.25) / 0.5, 0), 1);
      glide(rainGain.gain, 0.75 * rain ** 1.4);
      glide(rainLight.gain, 1 - heavy * 0.85);
      glide(rainHeavy.gain, heavy);
      // Under the umbrella the open rain sounds a little duller: you're covered.
      const density = Math.min(hitRate / 40, 1); // ~40 drops/s is a full canopy in this simulation
      cover += (density - cover) * 0.3;
      glide(rainTone.frequency, (3200 + 4800 * Math.max(wind, gust * 0.7)) * (1 - 0.35 * cover));

      // The howl's pitch wanders on two slow, unrelated waves, so it never settles into a drone.
      const storm = Math.min(wind + 0.6 * gust, 1) * Math.max(rain, 0.15 * wind);
      const drift = 0.5 + 0.3 * Math.sin(now * 0.37) + 0.2 * Math.sin(now * 0.13 + 1.7);
      glide(windBody.gain, 0.45 * storm);
      glide(howl.gain, 0.16 * storm * (0.6 + 0.4 * drift));
      glide(howlBand.frequency, 260 + 520 * drift * (0.6 + 0.4 * wind) + 300 * gust, 0.4);
      glide(whistle.gain, 0.05 * Math.max(gust, wind * 0.3) * Math.max(rain, 0.1));
      glide(whistleBand.frequency, 700 + 700 * drift + 500 * gust, 0.3);

      // Umbrella patter: individual taps (mostly soft, now and then a louder one), spread a little across
      // the canopy's width and the next 50 ms. The canopy on screen is small, so each drop it catches
      // stands for a few more: a real umbrella overhead takes hundreds a second, close to your ears.
      // The heavier the rain on it, the more the drumming bed takes over and the quieter each tap gets,
      // so heavy rain is a roar, not a machine gun.
      glide(drum.gain, 0.5 * density ** 1.2, 0.15);
      glide(drumPan.pan, Math.max(-1, Math.min(1, umbrellaPan)), 0.05);
      for (let n = Math.min(Math.round(pendingHits * (2 + Math.random() * 2)), 14); n > 0; n--) {
        const src = new AudioBufferSourceNode(ctx!, {
          buffer: taps[Math.floor(Math.random() * taps.length)],
          playbackRate: 0.85 + Math.random() * 0.35,
        });
        const level = (0.07 + 0.2 * Math.random() ** 2.5) * (1 - 0.4 * density);
        src.connect(gain(level)).connect(panner(umbrellaPan + (Math.random() - 0.5) * 0.15)).connect(master);
        src.start(now + Math.random() * 0.05);
      }
      pendingHits = 0;
    },

    /** Thunder, one of three kinds at random, from where the strike landed. far = the sheet lightning:
     *  later, quieter, and mostly reverb (the wet/dry balance is the distance cue). */
    thunder(power: number, far: boolean, pan: Pan) {
      if (!running()) return;
      const c = ctx!;
      const t = c.currentTime + (far ? 0.8 + Math.random() * 1.4 : 0.03 + Math.random() * 0.08);
      const kind = far ? 1 : Math.floor(Math.random() * 3);
      const loud = (far ? 0.4 : 0.9) * (0.6 + 0.4 * power);

      const src = new AudioBufferSourceNode(c, { buffer: brown, loop: true });
      const tone = filter("lowpass", 200);
      const env = gain();
      src.connect(tone).connect(env);
      env.connect(gain(far ? 0.35 : 1)).connect(panner(pan * 0.8)).connect(master); // dry
      env.connect(gain(far ? 0.9 : 0.3)).connect(reverb); // wet, before panning
      env.gain.setValueAtTime(0, t);

      let length: number;
      if (kind === 0) {
        // Crack-boom: hits fast, and the filter closes as it rolls, bright to dark.
        length = 2.5 + 1.5 * power;
        tone.frequency.setValueAtTime(1100, t);
        tone.frequency.exponentialRampToValueAtTime(130, t + 1.4);
        env.gain.linearRampToValueAtTime(loud, t + 0.015);
        env.gain.setTargetAtTime(0, t + 0.15, length / 5);
      } else if (kind === 1) {
        // Roller: back-to-back uneven swells, each a little quieter, like echoes off cloud.
        length = (far ? 4 : 3.5) + 1.5 * power;
        tone.frequency.setValueAtTime(far ? 140 : 260, t);
        const swells = 3 + Math.floor(Math.random() * 3), segment = (length * 0.8) / swells;
        for (let i = 0; i < swells; i++) {
          const at = t + i * segment, peak = loud * (1 - (i / swells) * 0.6) * (0.6 + 0.4 * Math.random());
          env.gain.linearRampToValueAtTime(peak, at + Math.min(0.12, segment * 0.4));
          env.gain.linearRampToValueAtTime(peak * 0.35, at + segment);
        }
        env.gain.setTargetAtTime(0, t + length * 0.85, 0.4);
      } else {
        // Deep boom: one heavy, very low swell with a long tail.
        length = 3.5 + 2 * power;
        tone.frequency.setValueAtTime(100, t);
        env.gain.linearRampToValueAtTime(loud * 1.3, t + 0.18);
        env.gain.setTargetAtTime(0, t + 0.4, length / 4);
      }
      src.start(t, Math.random() * 3);
      src.stop(t + length + 2);

      // Close strikes also get a thump you feel more than hear: a low sine dropping in pitch.
      if (!far && kind !== 1) {
        const thump = new OscillatorNode(c, { type: "sine", frequency: 55 });
        const g = gain();
        thump.connect(g).connect(panner(pan * 0.3)).connect(master);
        thump.frequency.setValueAtTime(55, t);
        thump.frequency.exponentialRampToValueAtTime(30, t + 0.6);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5 * (0.6 + 0.4 * power), t + 0.012);
        g.gain.setTargetAtTime(0, t + 0.05, 0.22);
        thump.start(t);
        thump.stop(t + 1.5);
      }
    },

    /** Birds taking off where you tapped: each gives two or three short trilled chirps. */
    birds(count: number, pan: Pan) {
      if (!running()) return;
      const c = ctx!, now = c.currentTime;
      for (let i = 0; i < count; i++) {
        const out = panner(pan + (Math.random() - 0.5) * 0.6);
        out.connect(master);
        const send = gain(0.15);
        send.connect(reverb);
        let t = now + i * 0.08 + Math.random() * 0.1;
        for (let n = 2 + Math.floor(Math.random() * 2); n > 0; n--) {
          const f = 2600 + Math.random() * 1600, len = 0.07 + Math.random() * 0.05;
          // A fast vibrato (frequency modulation at ~40 Hz) turns a plain whistle into a trill.
          const osc = new OscillatorNode(c, { type: "sine" }), trill = new OscillatorNode(c, { frequency: 35 + Math.random() * 20 });
          const depth = gain(f * 0.07), env = gain();
          trill.connect(depth).connect(osc.frequency);
          osc.connect(env);
          env.connect(out);
          env.connect(send);
          osc.frequency.setValueAtTime(f * 0.85, t);
          osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + len * 0.5);
          osc.frequency.exponentialRampToValueAtTime(f, t + len);
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(0.06, t + 0.008);
          env.gain.exponentialRampToValueAtTime(0.0005, t + len);
          for (const o of [osc, trill]) {
            o.start(t);
            o.stop(t + len + 0.02);
          }
          t += len + 0.03 + Math.random() * 0.05;
        }
      }
    },
  };
}
