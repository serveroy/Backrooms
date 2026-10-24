// Procedural audio engine. Every sound in the game is synthesized with the
// Web Audio API at runtime — there are no audio files.

const rand = (a, b) => a + Math.random() * (b - a);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.8, sfx: 1, ambience: 1, music: 0.8 };
    this.layers = {};
    this.loops = new Set();
  }

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.music.connect(this.master);
    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.25;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(this.reverb);
    this.setReverb({ size: 1, decay: 1.2, wet: 0.25 });
    // a global low-pass used for muffling (pause, death, underwater)
    this.muffle = 1;
    this.noiseBuf = this.makeNoise('white', 3);
    this.pinkBuf = this.makeNoise('pink', 4);
    this.brownBuf = this.makeNoise('brown', 4);
    this.applyVolumes();
    this.ready = true;
    this.listenerPos = [0, 0, 0];
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.ambience, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music, t, 0.05);
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  makeNoise(kind, seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  setReverb({ size = 1, decay = 1.2, wet = 0.25 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * Math.min(6, decay * 1.6 + 0.1));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      const pre = Math.floor(ctx.sampleRate * 0.008 * size);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const env = i < pre ? 0 : Math.exp((-t * 6.9) / decay);
        // damping increases over time (air + soft surfaces)
        const k = Math.min(0.92, 0.25 + t * 0.6);
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * env * 2.2;
      }
    }
    this.reverb.buffer = buf;
    this.reverbOut.gain.setTargetAtTime(wet, ctx.currentTime, 0.1);
  }

  // ------------------------------------------------------------------ helpers

  noiseSrc(buf = this.noiseBuf, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 1;
    return s;
  }

  env(gainNode, t, a, peak, d, sustain = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }

  filter(type, freq, Q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  /** Output node for a sound: either dry bus or a spatial panner. */
  out(opts = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    const bus = opts.bus === 'amb' ? this.amb : opts.bus === 'music' ? this.music : this.sfx;
    let last = g;
    if (opts.lowpass) {
      const f = this.filter('lowpass', opts.lowpass, 0.7);
      g.connect(f);
      last = f;
    }
    if (opts.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 1.5;
      p.rolloffFactor = opts.rolloff ?? 1.1;
      p.maxDistance = 80;
      p.positionX.value = opts.pos[0];
      p.positionY.value = opts.pos[1];
      p.positionZ.value = opts.pos[2];
      last.connect(p);
      last = p;
      g.panner = p;
    }
    last.connect(bus);
    const wet = opts.wet ?? 0.6;
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      last.connect(s).connect(this.reverbSend);
    }
    return g;
  }

  setListener(pos, fwd, up = [0, 1, 0]) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    this.listenerPos = pos;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos[0], t, 0.02);
      L.positionY.setTargetAtTime(pos[1], t, 0.02);
      L.positionZ.setTargetAtTime(pos[2], t, 0.02);
      L.forwardX.setTargetAtTime(fwd[0], t, 0.02);
      L.forwardY.setTargetAtTime(fwd[1], t, 0.02);
      L.forwardZ.setTargetAtTime(fwd[2], t, 0.02);
      L.upX.value = up[0];
      L.upY.value = up[1];
      L.upZ.value = up[2];
    } else {
      L.setPosition(pos[0], pos[1], pos[2]);
      L.setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]);
    }
  }

  // ------------------------------------------------------------------ ambient layers

  /** Fluorescent light hum. level 0..1 */
  startHum() {
    if (!this.ctx || this.layers.hum) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.amb);
    const parts = [];
    const add = (type, f, g, filt) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      if (filt) o.connect(filt).connect(gg);
      else o.connect(gg);
      gg.connect(out);
      o.start();
      parts.push(o);
      return o;
    };
    add('sine', 60, 0.05);
    add('sawtooth', 120, 0.06, this.filter('bandpass', 240, 1.6));
    add('square', 120.3, 0.018, this.filter('lowpass', 520, 0.8));
    add('sine', 180, 0.012);
    add('triangle', 360, 0.006);
    add('sine', 14200, 0.0016);
    // electrical buzz band
    const n = this.noiseSrc(this.pinkBuf, true);
    const nf = this.filter('bandpass', 2800, 0.7);
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    n.connect(nf).connect(ng).connect(out);
    n.start();
    // slow wobble
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.17;
    const lg = ctx.createGain();
    lg.gain.value = 0.08;
    lfo.connect(lg).connect(out.gain);
    lfo.start();
    this.layers.hum = { out, parts: [...parts, n, lfo], level: 0 };
  }

  setHum(level) {
    const h = this.layers.hum;
    if (!h) return;
    h.level = level;
    h.out.gain.setTargetAtTime(level * 0.55, this.ctx.currentTime, 0.4);
  }

  /** Low room tone: brown noise rumble. */
  startRoomTone() {
    if (!this.ctx || this.layers.room) return;
    const ctx = this.ctx;
    const src = this.noiseSrc(this.brownBuf, true);
    const f = this.filter('lowpass', 180, 0.5);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    this.layers.room = { src, g, f };
  }

  setRoomTone(level, cutoff = 180) {
    const r = this.layers.room;
    if (!r) return;
    r.g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.6);
    r.f.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.6);
  }

  /** Generic looping noise bed (rain, ocean, steam, wind...). */
  startBed(name, { buf = 'pink', type = 'bandpass', freq = 1000, Q = 0.7, gain = 0.1, lfo = 0, lfoDepth = 0 } = {}) {
    if (!this.ctx) return;
    if (this.layers[name]) return this.layers[name];
    const ctx = this.ctx;
    const src = this.noiseSrc(buf === 'white' ? this.noiseBuf : buf === 'brown' ? this.brownBuf : this.pinkBuf, true);
    const f = this.filter(type, freq, Q);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    const layer = { src, g, f, gain, parts: [src] };
    if (lfo) {
      const o = ctx.createOscillator();
      o.frequency.value = lfo;
      const og = ctx.createGain();
      og.gain.value = lfoDepth;
      o.connect(og).connect(g.gain);
      o.start();
      layer.parts.push(o);
    }
    g.gain.setTargetAtTime(gain, ctx.currentTime, 1.5);
    this.layers[name] = layer;
    return layer;
  }

  setBed(name, gain) {
    const l = this.layers[name];
    if (l) l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.5);
  }

  stopLayer(name, fade = 1) {
    const l = this.layers[name];
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = l.g || l.out;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, fade / 4);
    const parts = l.parts || [l.src];
    setTimeout(() => {
      for (const p of parts) {
        try {
          p.stop();
        } catch (e) {
          /* already stopped */
        }
      }
    }, fade * 1000 + 200);
    delete this.layers[name];
  }

  stopAllLayers() {
    for (const k of Object.keys(this.layers)) this.stopLayer(k, 0.5);
  }

  // ------------------------------------------------------------------ one-shots

  footstep(surface, intensity = 1, pos = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const o = this.out({ gain: 0.55 * intensity, wet: surface === 'carpet' ? 0.25 : 0.7, pos, ref: 2 });
    const thump = () => {
      const s = ctx.createOscillator();
      s.frequency.setValueAtTime(rand(70, 95), t);
      s.frequency.exponentialRampToValueAtTime(40, t + 0.08);
      const g = ctx.createGain();
      s.connect(g).connect(o);
      this.env(g, t, 0.004, 0.35, 0.09);
      s.start(t);
      s.stop(t + 0.15);
    };
    const burst = (type, f, Q, peak, dec, delay = 0, rate = 1) => {
      const n = this.noiseSrc();
      n.playbackRate.value = rate;
      const fl = this.filter(type, f, Q);
      const g = ctx.createGain();
      n.connect(fl).connect(g).connect(o);
      this.env(g, t + delay, 0.004, peak, dec);
      const off = Math.random() * 2;
      n.start(t + delay, off);
      n.stop(t + delay + dec + 0.05);
    };
    switch (surface) {
      case 'carpet':
        thump();
        burst('lowpass', rand(500, 750), 0.7, 0.5, 0.08);
        // moist squish
        burst('bandpass', rand(1100, 1700), 2.5, 0.12, 0.14, 0.02, 0.7);
        break;
      case 'wetcarpet':
        thump();
        burst('lowpass', 600, 0.7, 0.4, 0.07);
        burst('bandpass', rand(1400, 2200), 3, 0.25, 0.18, 0.015, 0.6);
        break;
      case 'concrete':
        thump();
        burst('bandpass', rand(1800, 2600), 1.2, 0.5, 0.05);
        burst('highpass', 4000, 0.7, 0.18, 0.03);
        break;
      case 'tile':
        burst('bandpass', rand(2600, 3400), 2, 0.6, 0.045);
        burst('highpass', 5000, 0.7, 0.25, 0.025);
        thump();
        break;
      case 'water':
        burst('bandpass', rand(900, 1400), 1.5, 0.5, 0.25, 0, 0.8);
        burst('highpass', 3000, 0.5, 0.25, 0.18, 0.03);
        break;
      case 'metal': {
        thump();
        burst('bandpass', 900, 3, 0.8, 0.06);
        for (const f of [430, 1170, 2310]) {
          const s = ctx.createOscillator();
          s.frequency.value = f * rand(0.97, 1.03);
          const g = ctx.createGain();
          s.connect(g).connect(o);
          this.env(g, t, 0.002, 0.12, 0.3);
          s.start(t);
          s.stop(t + 0.35);
        }
        break;
      }
      case 'wood':
        thump();
        burst('bandpass', rand(600, 900), 2, 0.5, 0.07);
        break;
      default:
        thump();
        burst('lowpass', 900, 0.7, 0.4, 0.07);
    }
  }

  play(name, opts = {}) {
    if (!this.ctx) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try {
      fn(this, this.ctx, this.ctx.currentTime + (opts.delay || 0) + 0.005, opts);
    } catch (e) {
      console.warn('sound failed', name, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Sound library: fn(engine, ctx, t, opts)
// ---------------------------------------------------------------------------

function osc(ctx, type, f) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  return o;
}

function distortion(ctx, amount) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = c;
  return ws;
}

export const SOUNDS = {
  click(E, ctx, t, o) {
    const out = E.out({ gain: 0.35, wet: 0.1, ...o });
    for (const dt of [0, 0.045]) {
      const n = E.noiseSrc();
      const f = E.filter('highpass', 2500, 0.7);
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(out);
      E.env(g, t + dt, 0.001, 0.6, 0.012);
      n.start(t + dt);
      n.stop(t + dt + 0.03);
    }
  },
  pickup(E, ctx, t, o) {
    const out = E.out({ gain: 0.4, wet: 0.2, ...o });
    const n = E.noiseSrc();
    const f = E.filter('bandpass', 3500, 1.2);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    E.env(g, t, 0.01, 0.3, 0.15);
    n.start(t);
    n.stop(t + 0.2);
    const s = osc(ctx, 'sine', 900);
    const sg = ctx.createGain();
    s.connect(sg).connect(out);
    E.env(sg, t + 0.03, 0.003, 0.08, 0.1);
    s.start(t + 0.03);
    s.stop(t + 0.2);
  },
  drink(E, ctx, t, o) {
    const out = E.out({ gain: 0.6, wet: 0.15, ...o });
    // cap twist
    const n = E.noiseSrc();
    const f = E.filter('bandpass', 4200, 2);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    E.env(g, t, 0.005, 0.35, 0.12);
    n.start(t);
    n.stop(t + 0.2);
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.35 + i * 0.42 + rand(-0.03, 0.03);
      const s = osc(ctx, 'sine', 260);
      s.frequency.setValueAtTime(rand(300, 360), tt);
      s.frequency.exponentialRampToValueAtTime(rand(110, 140), tt + 0.12);
      const sg = ctx.createGain();
      s.connect(sg).connect(out);
      E.env(sg, tt, 0.01, 0.4, 0.14);
      s.start(tt);
      s.stop(tt + 0.2);
      const w = E.noiseSrc();
      const wf = E.filter('bandpass', rand(700, 1100), 4);
      const wg = ctx.createGain();
      w.connect(wf).connect(wg).connect(out);
      E.env(wg, tt, 0.02, 0.15, 0.2);
      w.start(tt, Math.random());
      w.stop(tt + 0.3);
    }
    // relieved breath
    const b = E.noiseSrc();
    const bf = E.filter('bandpass', 900, 0.8);
    const bg = ctx.createGain();
    b.connect(bf).connect(bg).connect(out);
    E.env(bg, t + 2.1, 0.15, 0.12, 0.6);
    b.start(t + 2.1, Math.random());
    b.stop(t + 3);
  },
  eat(E, ctx, t, o) {
    const out = E.out({ gain: 0.5, wet: 0.1, ...o });
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.28 + rand(0, 0.05);
      const n = E.noiseSrc();
      const f = E.filter('bandpass', rand(1500, 2600), 1.5);
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(out);
      E.env(g, tt, 0.005, 0.35, 0.09);
      n.start(tt, Math.random());
      n.stop(tt + 0.12);
    }
  },
  page(E, ctx, t, o) {
    const out = E.out({ gain: 0.35, wet: 0.15, ...o });
    const n = E.noiseSrc();
    const f = E.filter('bandpass', 5000, 0.9);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    const gg = g.gain;
    gg.setValueAtTime(0.0001, t);
    for (let i = 0; i < 6; i++) gg.linearRampToValueAtTime(rand(0.05, 0.35), t + 0.03 + i * 0.04);
    gg.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.start(t);
    n.stop(t + 0.4);
  },
  heartbeat(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.7, wet: 0, bus: 'sfx' });
    for (const [dt, a] of [
      [0, 1],
      [0.22, 0.7],
    ]) {
      const s = osc(ctx, 'sine', 58);
      s.frequency.setValueAtTime(70, t + dt);
      s.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      const g = ctx.createGain();
      s.connect(g).connect(out);
      E.env(g, t + dt, 0.008, 0.7 * a, 0.16);
      s.start(t + dt);
      s.stop(t + dt + 0.22);
    }
  },
  breath(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.25, wet: 0.05 });
    const dur = o.dur ?? 0.6;
    const n = E.noiseSrc();
    const f = E.filter('bandpass', o.inhale ? 1400 : 800, 0.9);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.start(t, Math.random() * 2);
    n.stop(t + dur + 0.05);
  },
  hurt(E, ctx, t, o) {
    const out = E.out({ gain: 0.6, wet: 0.2, ...o });
    const n = E.noiseSrc();
    const f = E.filter('lowpass', 1200, 0.7);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    E.env(g, t, 0.005, 0.8, 0.25);
    n.start(t);
    n.stop(t + 0.3);
    const s = osc(ctx, 'sawtooth', 160);
    s.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const sf = E.filter('lowpass', 700, 1);
    const sg = ctx.createGain();
    s.connect(sf).connect(sg).connect(out);
    E.env(sg, t, 0.01, 0.3, 0.3);
    s.start(t);
    s.stop(t + 0.4);
  },
  stinger(E, ctx, t, o) {
    // dissonant string-like stab
    const out = E.out({ gain: o.gain ?? 0.7, wet: 0.8 });
    const base = o.base ?? rand(180, 260);
    for (const r of [1, 1.06, 1.414, 1.5, 2.12]) {
      const s = osc(ctx, 'sawtooth', base * r);
      const v = osc(ctx, 'sine', rand(5, 7));
      const vg = ctx.createGain();
      vg.gain.value = base * r * 0.012;
      v.connect(vg).connect(s.frequency);
      const f = E.filter('bandpass', base * r * 2.5, 1.2);
      const g = ctx.createGain();
      s.connect(f).connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur ?? 2.2));
      s.start(t);
      v.start(t);
      s.stop(t + (o.dur ?? 2.2) + 0.1);
      v.stop(t + (o.dur ?? 2.2) + 0.1);
    }
  },
  drone(E, ctx, t, o) {
    // slow ominous swell
    const dur = o.dur ?? 6;
    const out = E.out({ gain: o.gain ?? 0.3, wet: 0.9, bus: 'amb' });
    for (const f0 of [41, 55, 61.7, 82]) {
      const s = osc(ctx, 'sawtooth', f0 * (o.pitch ?? 1));
      const f = E.filter('lowpass', 300, 1);
      f.frequency.setValueAtTime(120, t);
      f.frequency.linearRampToValueAtTime(500, t + dur * 0.6);
      f.frequency.linearRampToValueAtTime(100, t + dur);
      const g = ctx.createGain();
      s.connect(f).connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.start(t);
      s.stop(t + dur + 0.1);
    }
  },
  static(E, ctx, t, o) {
    const dur = o.dur ?? 0.4;
    const out = E.out({ gain: o.gain ?? 0.3, wet: 0.2, ...o });
    const n = E.noiseSrc();
    const f = E.filter('bandpass', rand(1500, 4000), 0.5);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    let tt = t;
    while (tt < t + dur) {
      g.gain.setValueAtTime(Math.random() < 0.6 ? rand(0.2, 0.7) : 0.0001, tt);
      tt += rand(0.008, 0.04);
    }
    g.gain.setValueAtTime(0.0001, t + dur);
    n.start(t, Math.random());
    n.stop(t + dur + 0.05);
  },
  noclip(E, ctx, t) {
    const out = E.out({ gain: 0.7, wet: 0.9 });
    // reality tearing: falling whoosh + deep boom + glitch
    const n = E.noiseSrc(E.pinkBuf);
    const f = E.filter('bandpass', 300, 0.8);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 2.2);
    const g = ctx.createGain();
    n.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    n.start(t);
    n.stop(t + 2.6);
    const s = osc(ctx, 'sine', 70);
    s.frequency.setValueAtTime(110, t + 0.1);
    s.frequency.exponentialRampToValueAtTime(28, t + 2);
    const sg = ctx.createGain();
    s.connect(sg).connect(out);
    E.env(sg, t + 0.1, 0.05, 0.9, 2);
    s.start(t + 0.1);
    s.stop(t + 2.3);
    SOUNDS.static(E, ctx, t, { dur: 0.8, gain: 0.35 });
  },
  boom(E, ctx, t, o) {
    // distant heavy impact (door slam / something big)
    const out = E.out({ gain: o.gain ?? 0.5, wet: 1.0, lowpass: 900, ...o });
    const s = osc(ctx, 'sine', 55);
    s.frequency.setValueAtTime(80, t);
    s.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = ctx.createGain();
    s.connect(g).connect(out);
    E.env(g, t, 0.01, 0.9, 0.9);
    s.start(t);
    s.stop(t + 1);
    const n = E.noiseSrc(E.brownBuf);
    const ng = ctx.createGain();
    n.connect(ng).connect(out);
    E.env(ng, t, 0.005, 0.6, 0.5);
    n.start(t, Math.random());
    n.stop(t + 0.6);
  },
  sputter(E, ctx, t, o) {
    // fluorescent tube popping back on
    const out = E.out({ gain: o.gain ?? 0.18, wet: 0.3, ...o });
    for (let i = 0; i < 3; i++) {
      const tt = t + i * rand(0.03, 0.07);
      const s = osc(ctx, 'sawtooth', 120);
      const f = E.filter('bandpass', 2400, 2);
      const g = ctx.createGain();
      s.connect(f).connect(g).connect(out);
      E.env(g, tt, 0.002, 0.4, 0.04);
      s.start(tt);
      s.stop(tt + 0.06);
    }
    const n = E.noiseSrc();
    const nf = E.filter('highpass', 3000, 0.7);
    const ng = ctx.createGain();
    n.connect(nf).connect(ng).connect(out);
    E.env(ng, t, 0.001, 0.25, 0.03);
    n.start(t, Math.random());
    n.stop(t + 0.05);
  },
  drip(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.25, wet: 0.9, ...o });
    const s = osc(ctx, 'sine', 1400);
    const f0 = rand(1100, 1900);
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.04);
    const g = ctx.createGain();
    s.connect(g).connect(out);
    E.env(g, t, 0.001, 0.4, 0.06);
    s.start(t);
    s.stop(t + 0.1);
  },
  creak(E, ctx, t, o) {
    const dur = o.dur ?? 1.2;
    const out = E.out({ gain: o.gain ?? 0.25, wet: 0.7, ...o });
    const s = osc(ctx, 'sawtooth', 28);
    s.frequency.setValueAtTime(rand(18, 30), t);
    s.frequency.linearRampToValueAtTime(rand(30, 50), t + dur);
    const f = E.filter('bandpass', 900, 8);
    f.frequency.setValueAtTime(rand(500, 800), t);
    f.frequency.linearRampToValueAtTime(rand(900, 1500), t + dur);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.1);
    g.gain.linearRampToValueAtTime(0.4, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.start(t);
    s.stop(t + dur + 0.05);
  },
  whisper(E, ctx, t, o) {
    const dur = o.dur ?? 1.6;
    const out = E.out({ gain: o.gain ?? 0.18, wet: 0.6, ...o });
    const n = E.noiseSrc();
    const f1 = E.filter('bandpass', 1200, 6);
    const f2 = E.filter('bandpass', 2500, 5);
    const g = ctx.createGain();
    n.connect(f1).connect(g);
    n.connect(f2).connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    let tt = t;
    while (tt < t + dur) {
      const syl = rand(0.08, 0.2);
      g.gain.linearRampToValueAtTime(rand(0.3, 0.9), tt + syl * 0.3);
      g.gain.linearRampToValueAtTime(0.02, tt + syl);
      f1.frequency.setValueAtTime(rand(700, 1600), tt);
      f2.frequency.setValueAtTime(rand(1800, 3200), tt);
      tt += syl + rand(0, 0.06);
    }
    g.gain.linearRampToValueAtTime(0.0001, tt + 0.05);
    n.start(t, Math.random());
    n.stop(tt + 0.1);
  },
  knock(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.4, wet: 0.8, lowpass: 1500, ...o });
    const n = o.count ?? 3;
    for (let i = 0; i < n; i++) {
      const tt = t + i * rand(0.22, 0.32);
      const s = osc(ctx, 'sine', 140);
      s.frequency.setValueAtTime(180, tt);
      s.frequency.exponentialRampToValueAtTime(90, tt + 0.05);
      const g = ctx.createGain();
      s.connect(g).connect(out);
      E.env(g, tt, 0.002, 0.8, 0.12);
      s.start(tt);
      s.stop(tt + 0.15);
      const nn = E.noiseSrc();
      const nf = E.filter('bandpass', 700, 1.5);
      const ng = ctx.createGain();
      nn.connect(nf).connect(ng).connect(out);
      E.env(ng, tt, 0.001, 0.4, 0.05);
      nn.start(tt, Math.random());
      nn.stop(tt + 0.08);
    }
  },
  // ---- entities
  howl(E, ctx, t, o) {
    // the Howler: a strained, distorted roar with a falling pitch
    const dur = o.dur ?? 2.2;
    const out = E.out({ gain: o.gain ?? 0.9, wet: 0.8, ref: 3, rolloff: 0.8, ...o });
    const f0 = rand(95, 130);
    const src = osc(ctx, 'sawtooth', f0);
    src.frequency.setValueAtTime(f0 * 1.6, t);
    src.frequency.exponentialRampToValueAtTime(f0, t + 0.4);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    const vib = osc(ctx, 'sine', 7.5);
    const vg = ctx.createGain();
    vg.gain.value = 9;
    vib.connect(vg).connect(src.frequency);
    const dist = distortion(ctx, 30);
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    src.connect(pre).connect(dist);
    const mix = ctx.createGain();
    for (const [ff, q, gg] of [
      [650, 5, 1],
      [1150, 6, 0.7],
      [2600, 7, 0.4],
    ]) {
      const bp = E.filter('bandpass', ff, q);
      bp.frequency.setValueAtTime(ff * 1.2, t);
      bp.frequency.linearRampToValueAtTime(ff * 0.85, t + dur);
      const g = ctx.createGain();
      g.gain.value = gg;
      dist.connect(bp).connect(g).connect(mix);
    }
    const n = E.noiseSrc();
    const nf = E.filter('bandpass', 1600, 1);
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    n.connect(nf).connect(ng).connect(mix);
    const g = ctx.createGain();
    mix.connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.12);
    g.gain.setValueAtTime(0.7, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t);
    vib.start(t);
    n.start(t, Math.random());
    src.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
    n.stop(t + dur + 0.1);
  },
  gallop(E, ctx, t, o) {
    // heavy four-limbed running thuds
    const out = E.out({ gain: o.gain ?? 0.7, wet: 0.5, ref: 2, ...o });
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.075 + (i > 1 ? 0.04 : 0);
      const s = osc(ctx, 'sine', 60);
      s.frequency.setValueAtTime(rand(70, 90), tt);
      s.frequency.exponentialRampToValueAtTime(35, tt + 0.08);
      const g = ctx.createGain();
      s.connect(g).connect(out);
      E.env(g, tt, 0.003, 0.6, 0.1);
      s.start(tt);
      s.stop(tt + 0.14);
      const n = E.noiseSrc();
      const f = E.filter('lowpass', 500, 0.7);
      const ng = ctx.createGain();
      n.connect(f).connect(ng).connect(out);
      E.env(ng, tt, 0.002, 0.4, 0.06);
      n.start(tt, Math.random());
      n.stop(tt + 0.09);
    }
  },
  growl(E, ctx, t, o) {
    const dur = o.dur ?? 1.5;
    const out = E.out({ gain: o.gain ?? 0.6, wet: 0.5, ...o });
    const s = osc(ctx, 'sawtooth', rand(65, 85));
    const n = E.noiseSrc();
    const nf = E.filter('lowpass', 400, 1);
    const mix = ctx.createGain();
    const am = osc(ctx, 'sine', rand(18, 28));
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    am.connect(amg).connect(mix.gain);
    s.connect(E.filter('lowpass', 500, 2)).connect(mix);
    n.connect(nf).connect(mix);
    const g = ctx.createGain();
    mix.connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const x of [s, n, am]) {
      x.start(t);
      x.stop(t + dur + 0.05);
    }
  },
  bark(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.7, wet: 0.6, ...o });
    for (let i = 0; i < (o.count ?? 2); i++) {
      const tt = t + i * rand(0.25, 0.35);
      const s = osc(ctx, 'sawtooth', rand(180, 240));
      s.frequency.exponentialRampToValueAtTime(110, tt + 0.18);
      const d = distortion(ctx, 20);
      const f = E.filter('bandpass', 900, 2);
      const g = ctx.createGain();
      s.connect(d).connect(f).connect(g).connect(out);
      E.env(g, tt, 0.01, 0.6, 0.2);
      s.start(tt);
      s.stop(tt + 0.25);
    }
  },
  giggle(E, ctx, t, o) {
    // the Smiler's breathy, wet giggle
    const out = E.out({ gain: o.gain ?? 0.35, wet: 0.8, ...o });
    const n = E.noiseSrc();
    const f = E.filter('bandpass', 1100, 4);
    const s = osc(ctx, 'sine', 330);
    const g = ctx.createGain();
    const sg = ctx.createGain();
    sg.gain.value = 0.15;
    n.connect(f).connect(g);
    s.connect(sg).connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    let tt = t;
    for (let i = 0; i < 6; i++) {
      g.gain.linearRampToValueAtTime(0.6, tt + 0.03);
      g.gain.linearRampToValueAtTime(0.02, tt + 0.1);
      s.frequency.setValueAtTime(rand(280, 420) * (1 - i * 0.04), tt);
      tt += rand(0.11, 0.16);
    }
    g.gain.linearRampToValueAtTime(0.0001, tt);
    n.start(t, Math.random());
    s.start(t);
    n.stop(tt + 0.05);
    s.stop(tt + 0.05);
  },
  partyHorn(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.4, wet: 0.5, ...o });
    const s = osc(ctx, 'sawtooth', 380);
    s.frequency.setValueAtTime(330, t);
    s.frequency.linearRampToValueAtTime(420, t + 0.15);
    s.frequency.setValueAtTime(420, t + 0.6);
    s.frequency.linearRampToValueAtTime(360, t + 0.8);
    const f = E.filter('bandpass', 1400, 1.5);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.5, t + 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.85);
    s.start(t);
    s.stop(t + 0.9);
  },
  partyVoice(E, ctx, t, o) {
    // a cheerful, wrong, sing-song "ha-ha-ha =)"
    const out = E.out({ wet: 0.6, ...o, gain: (o.gain ?? 0.45) * 1.8 });
    const notes = [660, 784, 660, 880];
    notes.forEach((f, i) => {
      const tt = t + i * 0.16;
      const s = osc(ctx, 'triangle', f * rand(0.98, 1.02));
      const bp = E.filter('bandpass', 1800, 2);
      const g = ctx.createGain();
      s.connect(bp).connect(g).connect(out);
      E.env(g, tt, 0.01, 0.5, 0.13);
      s.start(tt);
      s.stop(tt + 0.16);
    });
  },
  flutter(E, ctx, t, o) {
    const dur = o.dur ?? 1;
    const out = E.out({ gain: o.gain ?? 0.4, wet: 0.4, ...o });
    const n = E.noiseSrc();
    const f = E.filter('bandpass', 350, 1.2);
    const g = ctx.createGain();
    const am = osc(ctx, 'square', rand(22, 30));
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    am.connect(amg).connect(g.gain);
    n.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.5, t);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.start(t, Math.random());
    am.start(t);
    n.stop(t + dur + 0.05);
    am.stop(t + dur + 0.05);
  },
  screech(E, ctx, t, o) {
    const dur = o.dur ?? 1.2;
    const out = E.out({ gain: o.gain ?? 0.5, wet: 0.7, ...o });
    const s = osc(ctx, 'sawtooth', 1200);
    s.frequency.setValueAtTime(rand(900, 1300), t);
    s.frequency.linearRampToValueAtTime(rand(1600, 2200), t + dur * 0.4);
    s.frequency.linearRampToValueAtTime(rand(700, 1000), t + dur);
    const v = osc(ctx, 'sine', 11);
    const vg = ctx.createGain();
    vg.gain.value = 60;
    v.connect(vg).connect(s.frequency);
    const f = E.filter('bandpass', 2500, 3);
    const d = distortion(ctx, 8);
    const g = ctx.createGain();
    s.connect(d).connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t);
    v.start(t);
    s.stop(t + dur + 0.05);
    v.stop(t + dur + 0.05);
  },
  alarm(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.25, wet: 0.6, ...o });
    const dur = o.dur ?? 1.8;
    const s = osc(ctx, 'square', 650);
    for (let k = 0; k < dur / 0.45; k++) s.frequency.setValueAtTime(k % 2 ? 900 : 650, t + k * 0.45);
    const f = E.filter('lowpass', 2500, 1);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.05);
    g.gain.setValueAtTime(0.4, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.start(t);
    s.stop(t + dur + 0.05);
  },
  ding(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.35, wet: 0.7, ...o });
    for (const [f, dt] of [
      [1318.5, 0],
      [1046.5, 0.35],
    ]) {
      for (const h of [1, 2.76, 5.4]) {
        const s = osc(ctx, 'sine', f * h);
        const g = ctx.createGain();
        s.connect(g).connect(out);
        E.env(g, t + dt, 0.003, 0.3 / h, 1.5 / h);
        s.start(t + dt);
        s.stop(t + dt + 1.6);
      }
    }
  },
  phone(E, ctx, t, o) {
    // an old office phone ringing somewhere
    const out = E.out({ gain: o.gain ?? 0.2, wet: 0.7, lowpass: 2500, ...o });
    for (let r = 0; r < (o.rings ?? 2); r++) {
      const t0 = t + r * 3;
      for (const f of [440, 480]) {
        const s = osc(ctx, 'sine', f);
        const g = ctx.createGain();
        const am = osc(ctx, 'square', 20);
        const ag = ctx.createGain();
        ag.gain.value = 0.5;
        am.connect(ag).connect(g.gain);
        s.connect(g).connect(out);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
        g.gain.setValueAtTime(0.4, t0 + 1.9);
        g.gain.linearRampToValueAtTime(0.0001, t0 + 2.0);
        s.start(t0);
        am.start(t0);
        s.stop(t0 + 2.05);
        am.stop(t0 + 2.05);
      }
    }
  },
  door(E, ctx, t, o) {
    SOUNDS.creak(E, ctx, t, { dur: 0.9, gain: 0.3, ...o });
    SOUNDS.knock(E, ctx, t + 0.85, { count: 1, gain: 0.35, ...o });
  },
  spark(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.35, wet: 0.4, ...o });
    for (let i = 0; i < 8; i++) {
      const tt = t + rand(0, 0.35);
      const n = E.noiseSrc();
      const f = E.filter('highpass', 2000, 0.7);
      const g = ctx.createGain();
      n.connect(f).connect(g).connect(out);
      E.env(g, tt, 0.001, rand(0.2, 0.8), rand(0.01, 0.04));
      n.start(tt, Math.random());
      n.stop(tt + 0.06);
    }
  },
  clank(E, ctx, t, o) {
    const out = E.out({ gain: o.gain ?? 0.35, wet: 0.9, ...o });
    for (const f of [180, 470, 1013, 1777]) {
      const s = osc(ctx, 'sine', f * rand(0.95, 1.05));
      const g = ctx.createGain();
      s.connect(g).connect(out);
      E.env(g, t, 0.002, 0.25, rand(0.6, 1.4));
      s.start(t);
      s.stop(t + 1.5);
    }
  },
  musicBox(E, ctx, t, o) {
    // "Happy Birthday", slightly detuned, on a toy music box
    const out = E.out({ gain: o.gain ?? 0.22, wet: 0.7, bus: 'music', ...o });
    const N = { G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784 };
    const seq = [
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
      ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
      ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2],
    ];
    const beat = (o.tempo ?? 0.42) * rand(0.97, 1.08);
    let tt = t;
    for (const [n, d] of seq) {
      const f = N[n] * 2 * (o.detune ?? rand(0.985, 1.01));
      for (const h of [1, 3.01, 5.2]) {
        const s = osc(ctx, 'sine', f * h);
        const g = ctx.createGain();
        s.connect(g).connect(out);
        E.env(g, tt, 0.002, 0.25 / (h * h), 1.2 / h);
        s.start(tt);
        s.stop(tt + 1.3);
      }
      tt += d * beat;
    }
    return tt - t;
  },
  piano(E, ctx, t, o) {
    // slow, melancholic old-hotel piano phrase
    const out = E.out({ gain: o.gain ?? 0.18, wet: 0.9, bus: 'music', lowpass: 2200, ...o });
    const scale = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3];
    let tt = t;
    for (let i = 0; i < (o.notes ?? 8); i++) {
      const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      for (const h of [1, 2, 3.01, 4.2]) {
        const s = osc(ctx, h === 1 ? 'triangle' : 'sine', f * h);
        const g = ctx.createGain();
        s.connect(g).connect(out);
        E.env(g, tt, 0.004, 0.3 / h, 2.5 / h);
        s.start(tt);
        s.stop(tt + 2.6);
      }
      tt += rand(0.5, 1.1);
    }
  },
};
