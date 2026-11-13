"use client";
// Atelier One · generative lo-fi engine (WebAudio only, no samples, no external audio files).
// Every note is synthesised in the browser, so the music has no third-party license at all.
// It only starts after a user gesture (play button or Start), per browser autoplay rules.

export interface LofiPreset {
  name: string;
  bpm: number;
  /** chord progression, MIDI notes per bar */
  chords: number[][];
  /** pentatonic-ish melody pool (MIDI) */
  scale: number[];
  keys: "rhodes" | "marimba" | "warm" | "chip";
  drums: number; // 0..1 drum level
  crackle: number; // 0..1 vinyl crackle
  lowpass: number; // master tone (Hz)
  melody: number; // probability of a melody note per 8th
}

export const PRESETS: Record<string, LofiPreset> = {
  // Lakeside: Rhodes ii-V-I-vi in F, slow and soft
  lake: { name: "Lo-Fi Lake", bpm: 72, chords: [[55, 58, 62, 65], [53, 57, 60, 64], [50, 53, 57, 60], [52, 55, 58, 62]], scale: [69, 72, 74, 77, 79, 81, 84], keys: "rhodes", drums: 0.55, crackle: 0.45, lowpass: 2600, melody: 0.28 },
  // Floating island: bright marimba in C, a little quicker
  island: { name: "Island Breeze", bpm: 84, chords: [[48, 55, 59, 64], [45, 52, 55, 60], [53, 57, 60, 64], [55, 59, 62, 65]], scale: [72, 74, 76, 79, 81, 84, 86], keys: "marimba", drums: 0.45, crackle: 0.15, lowpass: 5200, melody: 0.4 },
  // Autumn fox: warm gramophone tone, minor 7ths, lots of crackle
  fox: { name: "Autumn Notes", bpm: 66, chords: [[45, 52, 55, 60], [50, 53, 57, 60], [43, 50, 53, 58], [48, 52, 55, 59]], scale: [64, 67, 69, 72, 74, 76], keys: "warm", drums: 0.4, crackle: 0.85, lowpass: 1900, melody: 0.24 },
  // Robot meadow: soft chiptune pads, happy major
  robot: { name: "Meadow Radio", bpm: 88, chords: [[48, 52, 55, 59], [53, 57, 60, 64], [57, 60, 64, 67], [55, 59, 62, 67]], scale: [72, 74, 76, 79, 81, 83, 84], keys: "chip", drums: 0.5, crackle: 0.2, lowpass: 4200, melody: 0.38 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Lofi {
  ctx: AudioContext | null = null;
  master!: GainNode;
  tone!: BiquadFilterNode;
  analyser!: AnalyserNode;
  noise!: AudioBuffer;
  crackleSrc: AudioBufferSourceNode | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  nextTime = 0;
  step = 0;
  playing = false;
  muted = false;
  volume = 0.55;
  constructor(public preset: LofiPreset) {}

  private init() {
    if (this.ctx) return;
    const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = this.preset.lowpass;
    this.tone.Q.value = 0.4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;
    // simple feedback delay as a "room"
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / this.preset.bpm) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    this.tone.connect(this.master);
    this.tone.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private startCrackle() {
    const ctx = this.ctx!;
    if (this.preset.crackle <= 0) return;
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const r = Math.random();
      d[i] = (Math.random() * 2 - 1) * 0.012 + (r > 0.9993 ? (Math.random() * 2 - 1) * 0.5 : 0);
    }
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.value = 0.35 * this.preset.crackle;
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start();
    this.crackleSrc = src;
  }

  private voice(midi: number, t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const k = this.preset.keys;
    const g = ctx.createGain();
    g.connect(this.tone);
    const f = mtof(midi);
    const oscs: OscillatorNode[] = [];
    const add = (type: OscillatorType, freq: number, gain: number, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const og = ctx.createGain(); og.gain.value = gain; o.connect(og); og.connect(g); oscs.push(o);
    };
    let attack = 0.01, release = dur;
    if (k === "rhodes") { add("sine", f, 1); add("sine", f * 2, 0.25, 3); add("triangle", f, 0.15, -4); attack = 0.008; }
    else if (k === "marimba") { add("sine", f, 1); add("sine", f * 4, 0.12); attack = 0.003; release = Math.min(dur, 0.7); }
    else if (k === "warm") { add("triangle", f, 0.8, -6); add("triangle", f, 0.8, 6); add("sine", f / 2, 0.3); attack = 0.05; }
    else { add("square", f, 0.18); add("triangle", f, 0.6, 5); attack = 0.02; }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vel * 0.35), t + Math.min(release, 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const o of oscs) { o.start(t); o.stop(t + release + 0.05); }
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.tone); o.start(t); o.stop(t + 0.4);
  }
  private hit(t: number, v: number, freq: number, dur: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.tone);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  private schedule() {
    const ctx = this.ctx!;
    const p = this.preset;
    const eighth = 60 / p.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.25) {
      const s = this.step % 32; // 4 bars of 8 eighths
      const bar = Math.floor(this.step / 8) % p.chords.length;
      const swing = s % 2 === 1 ? eighth * 0.16 : 0;
      const t = this.nextTime + swing;
      const chord = p.chords[bar];
      if (s % 8 === 0) {
        chord.forEach((m, i) => this.voice(m, t + i * 0.012, eighth * 7.5, 0.07));
        this.voice(chord[0] - 12, t, eighth * 3.5, 0.13);
      }
      if (s % 8 === 5) this.voice(chord[0] - 12 + (Math.random() > 0.5 ? 7 : 12), t, eighth * 2.5, 0.09);
      if (p.drums > 0) {
        const pos = s % 8;
        if (pos === 0 || (pos === 5 && Math.random() > 0.35)) this.kick(t, 0.5 * p.drums);
        if (pos === 2 || pos === 6) this.hit(t, 0.18 * p.drums, 1800, 0.16, "bandpass");
        this.hit(t, (pos % 2 ? 0.035 : 0.06) * p.drums, 8000, 0.04, "highpass");
      }
      if (Math.random() < p.melody) {
        const m = p.scale[Math.floor(Math.random() * p.scale.length)];
        this.voice(m, t, eighth * (Math.random() > 0.6 ? 3 : 1.6), 0.06);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  async play() {
    this.init();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.nextTime = ctx.currentTime + 0.08;
    this.startCrackle();
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 60);
    this.applyGain(1.2);
  }
  pause() {
    if (!this.playing || !this.ctx) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.applyGain(0.3);
    const src = this.crackleSrc; this.crackleSrc = null;
    setTimeout(() => { try { src?.stop(); } catch {} }, 400);
  }
  setMuted(m: boolean) { this.muted = m; this.applyGain(0.25); }
  private applyGain(ramp: number) {
    if (!this.ctx) return;
    const target = this.playing && !this.muted ? this.volume : 0;
    const g = this.master.gain; const now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(target, now + ramp);
  }
  level(): number {
    if (!this.ctx || !this.playing || this.muted) return 0;
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    let s = 0; for (const v of a) s += v;
    return s / a.length / 255;
  }
  bands(n = 5): number[] {
    if (!this.ctx || !this.playing || this.muted) return new Array(n).fill(0);
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    const out: number[] = []; const per = Math.floor(a.length / n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < per; j++) s += a[i * per + j]; out.push(s / per / 255); }
    return out;
  }
  dispose() { this.pause(); setTimeout(() => this.ctx?.close().catch(() => {}), 500); }
}
