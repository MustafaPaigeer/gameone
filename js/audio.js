// Self-contained Web Audio sound engine. Every sound is synthesized at runtime
// (oscillators + filtered noise), so there are no audio asset files and the
// project stays dependency-free. Music is a light procedural loop.
//
// Browsers block audio until a user gesture, so init() must be called from a
// click/tap (the Play button) before anything will be heard.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = localStorage.getItem("laststand_muted") === "1";
    this.lastShot = 0;
    this.lastHit = 0;
    this.musicTimer = null;   // timer for the next sparse ambient note
    this.drone = null;        // continuous atmospheric drone nodes
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem("laststand_muted", m ? "1" : "0");
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---- synthesis helpers ----
  tone(freq, dur, { type = "square", gain = 0.3, sweepTo = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { gain = 0.3, type = "lowpass", freq = 1000, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  // ---- game events ----
  shoot() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    if (t - this.lastShot < 0.055) return; // throttle dense auto-fire
    this.lastShot = t;
    this.tone(440, 0.07, { type: "square", gain: 0.10, sweepTo: 180 });
    this.noise(0.05, { gain: 0.07, type: "highpass", freq: 1600 });
  }
  hit() {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    if (t - this.lastHit < 0.035) return; // many hits/sec — keep it sparse
    this.lastHit = t;
    this.noise(0.04, { gain: 0.05, type: "bandpass", freq: 2600 });
  }
  kill(type) {
    if (type === "boss" || type === "tank") {
      this.tone(190, 0.30, { type: "sawtooth", gain: 0.28, sweepTo: 70 });
      this.noise(0.28, { gain: 0.22, type: "lowpass", freq: 700 });
    } else {
      this.tone(240, 0.12, { type: "triangle", gain: 0.14, sweepTo: 90 });
    }
  }
  explosion() {
    this.noise(0.45, { gain: 0.4, type: "lowpass", freq: 700 });
    this.tone(95, 0.45, { type: "sine", gain: 0.3, sweepTo: 45 });
  }
  titan() {
    this.tone(65, 0.8, { type: "sawtooth", gain: 0.42, sweepTo: 110 });
    this.noise(0.8, { gain: 0.25, type: "lowpass", freq: 420 });
  }
  bossSpawn() {
    this.tone(110, 0.6, { type: "sawtooth", gain: 0.35, sweepTo: 55 });
  }
  playerHit() {
    this.tone(170, 0.18, { type: "square", gain: 0.18, sweepTo: 80 });
  }
  waveClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.18, { type: "triangle", gain: 0.2, delay: i * 0.09 }));
  }
  gameOver() {
    this.stopMusic();
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone(f, 0.45, { type: "sawtooth", gain: 0.24, delay: i * 0.18 }));
  }
  buy() {
    this.tone(880, 0.08, { type: "square", gain: 0.16 });
    this.tone(1320, 0.1, { type: "square", gain: 0.12, delay: 0.06 });
  }

  // ---- ambient music: a low evolving drone + sparse, non-rhythmic tones ----
  // No beat/loop to grate on the ear — just atmosphere under the action.
  startMusic() {
    if (!this.ctx || this.drone) return;
    const t = this.ctx.currentTime;

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16, t + 2.5); // slow fade-in
    out.connect(this.musicGain);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 360;
    lp.connect(out);

    // Layered low drone, slightly detuned so it breathes instead of sitting flat.
    const freqs = [55, 82.5, 110]; // A1, ~E2, A2
    const oscs = freqs.map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? "sine" : "triangle";
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(lp);
      o.start(t);
      return o;
    });

    // Very slow cutoff sweep (~20s cycle) gives it a sense of motion.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
    lfo.start(t);

    this.drone = { out, oscs, lfo };
    this.scheduleAmbientNote();
  }

  scheduleAmbientNote() {
    const gap = 3500 + Math.random() * 4500; // 3.5–8s, irregular
    this.musicTimer = setTimeout(() => {
      if (this.ctx && !this.muted && this.drone) {
        const scale = [220, 261.63, 293.66, 329.63, 392, 440]; // A natural minor
        const f = scale[Math.floor(Math.random() * scale.length)];
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.9);  // soft swell
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8); // long fade
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 3);
      }
      if (this.drone) this.scheduleAmbientNote();
    }, gap);
  }

  stopMusic() {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    if (this.drone) {
      const t = this.ctx ? this.ctx.currentTime : 0;
      const { out, oscs, lfo } = this.drone;
      try {
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); // fade out, no click
      } catch { /* ignore */ }
      const stopAt = t + 0.45;
      oscs.forEach((o) => { try { o.stop(stopAt); } catch { /* ignore */ } });
      try { lfo.stop(stopAt); } catch { /* ignore */ }
      this.drone = null;
    }
  }
}
