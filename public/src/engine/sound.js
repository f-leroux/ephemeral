// Procedural sound effects: every sound is a small settings object, synthesized in JS
// into an AudioBuffer once, then played as often as needed. No audio files.
//
// Only the engine uses these now (intro, countdown, GO, ticks, death, fanfare: see playCue). Games have a
// Strudel song instead of sound effects (see music.js); the `sfx` kit they receive is silent.
//
// A sound spec (all optional):
//   wave      'sine' | 'triangle' | 'square' | 'saw' | 'noise'   (default 'square')
//   freq      start frequency in Hz (default 440). For 'noise' it sets how bright/rough it is.
//   freqEnd   end frequency; the pitch slides there over the sound's length (default = freq)
//   attack, sustain, release   envelope in seconds (defaults 0.005, 0.05, 0.15)
//   volume    0..1 (default 0.5)
//   noise     0..1, blends noise into a tonal wave (grit for explosions, hits)
//   vibrato   depth as a fraction of pitch (e.g. 0.05), with vibratoRate in Hz
//   lowpass   cutoff in Hz, softens harsh waves (0 = off)
//
// Games get an `sfx` object in create():
//   const zap = sfx.sound({ wave: 'saw', freq: 900, freqEnd: 200, release: 0.2 });
//   sfx.play(zap, { volume: 1, pitch: 1, pan: 0, delay: 0 });   // pan -1 (left) .. 1 (right)
// sfx.loop(spec) also exists for a sustained sound (returns { set({ volume, pitch }), stop() }),
// but games should avoid continuous sounds: players find them annoying. Prefer one-shots.
// Loops are stopped automatically when the run ends.

const MUTE_KEY = 'ephemeral:muted';
const MASTER = 0.7;

let ctx = null;
let master = null;
let muted = false;
try {
  muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

// Must be called from a user gesture (a tap or key press) or browsers keep audio locked.
export function unlockAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    // a limiter so overlapping sounds (explosion + thud + crash) never distort
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // storage unavailable: mute just won't be remembered
  }
  if (master) master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.02);
}

export function suspendAudio(on) {
  if (!ctx) return;
  if (on) ctx.suspend();
  else ctx.resume();
}

export function synthesize(spec, sampleRate, loop = false) {
  const {
    wave = 'square',
    freq = 440,
    freqEnd = freq,
    attack = 0.005,
    sustain = 0.05,
    release = 0.15,
    volume = 0.5,
    noise = 0,
    vibrato = 0,
    vibratoRate = 6,
    lowpass = 0,
  } = spec;
  // Loops are one steady second (no envelope, no slide). Whole-number frequencies complete
  // whole cycles in that second, so the loop point is seamless.
  const dur = loop ? 2 : attack + sustain + release; // loops: render 2s, keep the settled second one
  const f0 = loop ? Math.max(1, Math.round(freq)) : freq;
  const vRate = loop ? Math.round(vibratoRate) : vibratoRate;
  const n = Math.max(1, Math.ceil(dur * sampleRate));
  const data = new Float32Array(n);
  const ratio = loop ? 1 : freqEnd / freq;
  const lpA = lowpass ? 1 - Math.exp((-2 * Math.PI * lowpass) / sampleRate) : 1;
  let phase = 0;
  let held = Math.random() * 2 - 1;
  let lp = 0;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let f = f0 * Math.pow(ratio, t / dur);
    if (vibrato) f *= 1 + vibrato * Math.sin(2 * Math.PI * vRate * t);
    phase += f / sampleRate;
    if (phase >= 1) {
      phase -= Math.floor(phase);
      held = Math.random() * 2 - 1; // sample-and-hold noise, pitched by freq
    }
    let s;
    switch (wave) {
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case 'saw':
        s = 2 * phase - 1;
        break;
      case 'noise':
        s = held;
        break;
      default:
        s = phase < 0.5 ? 0.7 : -0.7;
    }
    if (noise) s = s * (1 - noise) + (Math.random() * 2 - 1) * noise;
    lp += lpA * (s - lp);
    s = lp;

    let env = 1;
    if (!loop) {
      if (t < attack) env = t / attack;
      else if (t > attack + sustain) env = Math.pow(Math.max(0, 1 - (t - attack - sustain) / release), 2);
    }
    data[i] = s * env * volume;
  }
  return loop ? data.slice(n >> 1) : data;
}

function toBuffer(data) {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  return buf;
}

// A per-run sound kit. Everything is a silent no-op when audio is unavailable, or when
// `silent` is set (a game's own effects are dropped while its music plays).
export function createSfx({ silent = false } = {}) {
  const loops = new Set();
  const lastPlayed = new Map();

  const sfx = {
    sound(spec) {
      return { spec, buffer: ctx ? toBuffer(synthesize(spec, ctx.sampleRate)) : null };
    },

    play(sound, { volume = 1, pitch = 1, pan = 0, delay = 0, force = false } = {}) {
      if (!ctx || !sound?.buffer || muted || silent) return;
      // the same sound can't retrigger more than ~25 times a second (unless it's a chord: force)
      const now = ctx.currentTime;
      if (!delay && !force && now - (lastPlayed.get(sound) ?? -1) < 0.04) return;
      lastPlayed.set(sound, now);
      const src = ctx.createBufferSource();
      src.buffer = sound.buffer;
      src.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      let node = src.connect(gain);
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        node = node.connect(p);
      }
      node.connect(master);
      src.start(now + delay);
    },

    loop(spec) {
      if (!ctx || silent) return { set() {}, stop() {} };
      const src = ctx.createBufferSource();
      src.buffer = toBuffer(synthesize(spec, ctx.sampleRate, true));
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(master);
      src.start();
      const handle = {
        set({ volume, pitch } = {}) {
          const t = ctx.currentTime;
          if (volume != null) gain.gain.setTargetAtTime(Math.max(0, volume), t, 0.06);
          if (pitch != null) src.playbackRate.setTargetAtTime(Math.max(0.05, pitch), t, 0.06);
        },
        stop(fade = 0.15) {
          if (!loops.has(handle)) return;
          loops.delete(handle);
          gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
          src.stop(ctx.currentTime + fade + 0.05);
        },
      };
      handle.set({ volume: 1 });
      loops.add(handle);
      return handle;
    },

    stopLoops(fade = 0.3) {
      for (const l of [...loops]) l.stop(fade);
    },
  };
  return sfx;
}

// ---------- the engine's own sounds (same every day) ----------

// Each cue is a list of voices [spec, { pitch, delay, volume }], picked on the soundboard.
const bells = { wave: 'sine', freq: 523.25, attack: 0.003, sustain: 0.02, release: 1.8, volume: 0.18 };
const pop = { wave: 'triangle', freq: 523.25, attack: 0.003, sustain: 0.04, release: 0.3, volume: 0.35, lowpass: 3000 };
const heart = { wave: 'sine', freq: 120, freqEnd: 80, attack: 0.003, sustain: 0.03, release: 0.15, volume: 0.55 };
const tadaG = { wave: 'saw', freq: 392, sustain: 0.08, release: 0.15, volume: 0.12, lowpass: 1500 };
const tadaC = { wave: 'saw', freq: 523.25, sustain: 0.3, release: 0.8, volume: 0.12, lowpass: 1500 };
const CUES = {
  // intro: a gentle breeze, then bells as the title snaps together
  swell: [[{ wave: 'noise', freq: 250, freqEnd: 900, attack: 1.4, sustain: 0.2, release: 1.3, volume: 0.14, lowpass: 600 }, {}]],
  chord: [1, 1.26, 1.5, 2].map((p, i) => [bells, { pitch: p, delay: i * 0.09 }]),
  // 3-2-1: a marimba note (with a faint high overtone), then GO: an octave pop, low then high
  beep: [
    [{ wave: 'sine', freq: 523.25, attack: 0.002, sustain: 0.01, release: 0.35, volume: 0.4 }, {}],
    [{ wave: 'sine', freq: 2093, attack: 0.001, sustain: 0.005, release: 0.05, volume: 0.08 }, {}],
  ],
  go: [1, 2].map((p, i) => [pop, { pitch: p, delay: i * 0.08 }]),
  // death: glass breaking
  death: [
    [{ wave: 'noise', freq: 6000, freqEnd: 3000, attack: 0.001, sustain: 0.02, release: 0.25, volume: 0.25 }, {}],
    [{ wave: 'sine', freq: 1760, freqEnd: 880, sustain: 0.02, release: 0.5, volume: 0.12 }, {}],
    [{ wave: 'sine', freq: 2349, freqEnd: 1175, sustain: 0.02, release: 0.5, volume: 0.08 }, {}],
  ],
  // surviving: ta… da!
  fanfare: [
    ...[1, 1.26, 1.5].map((p) => [tadaG, { pitch: p }]),
    ...[1, 1.26, 1.5, 2].map((p) => [tadaC, { pitch: p, delay: 0.22 }]),
  ],
  // the last ten seconds without music: a heartbeat, rising
  tick: [
    [heart, {}],
    [heart, { delay: 0.14, volume: 0.8 }],
  ],
};

let engineKit = null;
let cueSounds = null;

// Plays an engine cue. `at` delays the whole cue; `pitch` shifts it (the final ticks rise).
export function playCue(name, { at = 0, pitch = 1 } = {}) {
  if (!ctx) return;
  if (!engineKit) {
    engineKit = createSfx();
    cueSounds = new Map();
  }
  for (const [spec, { pitch: p = 1, delay = 0, volume = 1 } = {}] of CUES[name] ?? []) {
    if (!cueSounds.has(spec)) cueSounds.set(spec, engineKit.sound(spec));
    engineKit.play(cueSounds.get(spec), { pitch: p * pitch, delay: at + delay, volume, force: true });
  }
}
