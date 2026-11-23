// Sandpiper — a little shorebird scurries along a misty morning beach, chasing the waves in and
// out like sandpipers do. The sea is on the left; every wave rolls in (its swell shows out at
// sea first, and a dashed line on the sand marks how far it will run up), then slides back out,
// leaving shiny wet sand where tiny sand crabs and lugworms pop up. The bird gets hungrier every
// second and only those snacks fill it up, so it has to dash down after each retreating wave,
// grab a snack and race back up the beach before the next one runs over it.
// Being caught by a wave, running out of food, or stepping on a jellyfish the sea has left
// stranded on the sand ends the run.
// The bird won't wade into still or retreating water; it simply stops at the edge. Only an
// advancing wave catches it.
// Waves come quicker and run up faster over the minute, big waves reach almost to the dunes,
// sets of two arrive back to back from ~20s, jellyfish wash up from ~12s, and snacks pop up
// further down the beach. Everything is planned up front around a hidden reference bird that
// moves at ~62% of your speed, takes one snack per wave and is never touched by the water; the
// jellyfish are kept off its path.

import { progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite, createParticles } from '../engine/kit.js';

const TAU = Math.PI * 2;
const PY = 548; // the bird's screen y
const BR = 9; // the bird's body radius
const X_MAX = 334;
const SPEED = 300;
const VREF = 0.62 * SPEED; // the reference bird's speed
const L0 = 112; // the waterline at rest
const FOOD_R = 17; // catch distance
const JELLY_R = 13;
const SNACK = 0.22;
const EDGE = 0.6 * BR; // how close to the foam the bird will stand

const drainAt = (t) => lerp(0.065, 0.12, progress(t, 60, 1.1));
const scrollAt = (t) => (t >= 60 ? 100 : 55 + 45 * Math.pow(Math.max(0, t) / 60, 1.2));
const Dat = (t) => {
  if (t <= 0) return 55 * t;
  if (t <= 60) return 55 * t + ((45 * 60) / 2.2) * Math.pow(t / 60, 2.2);
  return 55 * 60 + (45 * 60) / 2.2 + 100 * (t - 60);
};

// a wave's run-up over its life u (0..1): a quick surge, a short pause, a long slide back
function waveShape(u) {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.36) {
    const k = 1 - u / 0.36;
    return 1 - k * k;
  }
  if (u < 0.46) return 1;
  return 0.5 * (1 + Math.cos((Math.PI * (u - 0.46)) / 0.54));
}

// ---------- music: baile funk, 128 BPM, D minor over Dm–B♭–F–C ----------

const music = {
  cps: 128 / 240, // 128 BPM, one 4/4 bar per cycle: 32 bars = 60s
  setup: `
    const kick = note("d2 ~ ~ d2 ~ ~ d2 ~ ~ ~ d2 ~ ~ d2 ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
    const kick2 = note("d2 ~ ~ d2 ~ ~ d2 ~ d2 ~ d2 ~ ~ d2 ~ d2").s("sine").decay(0.18).sustain(0).gain(0.8)
    const clap = s("~ ~ ~ ~ pink ~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~").decay(0.12).sustain(0).hpf(1200).lpf(6000).gain(0.16).room(0.2)
    const tom = note("~ ~ a3 ~ ~ e3 ~ ~ ~ a3 ~ ~ ~ ~ e3 a3").s("sine").decay(0.09).sustain(0).gain(0.2)
    const hat = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.045)
    const hat16 = s("white*16").decay(0.02).sustain(0).hpf(7200).gain("[0.012 0.03 0.018 0.03]*4")
    const shaker = s("white*8").decay(0.05).sustain(0).hpf(5200).lpf(9000).gain(0.022).pan(0.62)
    const b808 = note("<d2 as2 f2 c2>").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~").s("sine").attack(0.005).decay(0.32).sustain(0.2).release(0.05).gain(0.4)
    const growl = note("<d3 as2 f3 c3>").struct("~ ~ x ~ ~ x ~ x ~ ~ x ~ ~ x ~ ~").s("sawtooth").attack(0.004).decay(0.12).sustain(0.2).release(0.04)
      .lpf(saw.range(350, 1500).slow(32)).gain(0.11)
    const chords = "<[d4,f4,a4] [d4,f4,as4] [c4,f4,a4] [c4,e4,g4]>"
    const stabs = note(chords).struct("~ ~ x ~ ~ x ~ ~ ~ ~ x ~ ~ ~ x ~").s("square").attack(0.003).decay(0.1).sustain(0).lpf(2200).gain(0.05).room(0.25)
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.8).lpf(saw.range(700, 1300).slow(32)).gain(0.042).room(0.5)
    const brass = note(chords).add(note(12)).struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ ~ ~").s("sawtooth").attack(0.01).decay(0.16).sustain(0).lpf(1800).gain(0.035)
    const tune = "<[a4 ~ a4 c5 ~ a4 g4 ~ f4 ~ g4 ~ a4 ~ ~ ~] [as4 ~ as4 d5 ~ as4 a4 ~ f4 ~ d4 ~ f4 ~ ~ ~] [c5 ~ c5 a4 ~ c5 d5 ~ c5 ~ a4 ~ f4 ~ ~ ~] [e4 ~ g4 ~ c5 ~ as4 a4 ~ g4 ~ e4 g4 ~ ~ ~]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.14).sustain(0.4).release(0.1).lpf(2200).vib(5).vibmod(0.1)
      .gain(0.062).delay(0.25).delaytime(0.3516).delayfeedback(0.3).pan(0.57)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.2).sustain(0.5).release(0.1).lpf(1200).gain(0.042)
    const arp = note("<[d5 f5 a5 f5]*4 [d5 f5 as5 f5]*4 [c5 f5 a5 f5]*4 [c5 e5 g5 e5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const surf = s("pink").slow(2).attack(1.1).decay(1.4).sustain(0).hpf(300).lpf(1400).gain(0.07).pan(sine.range(0.35, 0.65).slow(4))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.05).slow(8))
  `,
  song: `arrange(
    [8, stack(kick, clap, tom, hat, b808, growl, stabs, surf)],
    [8, stack(kick, clap, tom, hat, shaker, b808, growl, stabs, pad, lead, surf)],
    [8, stack(kick, clap, tom, hat, hat16, shaker, b808, growl, stabs, pad, lead, arp, brass, surf)],
    [8, stack(kick2, clap, tom, hat, hat16, shaker, b808, growl, stabs, pad, lead, leadLow, arp, brass, surf, wash)]
  )`,
};

// ---------- the plan: waves, snacks, jellyfish and the reference bird ----------

function tryPlan(rng) {
  const ph1 = rng.next() * TAU;
  const ph2 = rng.next() * TAU;
  const shore = (d) => 13 * Math.sin(d / 190 + ph1) + 7 * Math.sin(d / 73 + ph2);
  // wave 0 is already sliding back out when the run starts
  const waves = [{ t0: -0.9, T: 2.5, A: 75, big: false }];
  const W0 = (t) => {
    let m = 0;
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      if (w.t0 > t) continue;
      if (t - w.t0 > 3.6) break;
      const v = w.A * waveShape((t - w.t0) / w.T);
      if (v > m) m = v;
    }
    return L0 + m;
  };
  const waterX = (t, d) => W0(t) + shore(d);
  const peakOf = (w) => w.t0 + 0.36 * w.T;
  const refAt = (t) => waterX(t, Dat(t));

  const foods = [];
  const keys = [{ t: 0, x: 258 }];
  let refX = 258;
  let tHold = 0;

  const proposeWave = (prev, extra) => {
    if (waves.length === 1) return { t0: 2.7 + extra, T: 2.75, A: 88, big: false };
    const base = prev.t0 + prev.T;
    const p = progress(base, 60, 1.2);
    const T = lerp(2.75, 1.85, p) * lerp(0.93, 1.07, rng.next());
    const big = base > 9 && rng.next() < lerp(0.18, 0.32, p);
    const A = big ? lerp(166, 180, rng.next()) : lerp(lerp(80, 112, p), lerp(125, 158, p), rng.next());
    let t0 = base + lerp(0.85, 0.12, p) * lerp(0.6, 1.4, rng.next());
    if (prev.t0 > 20 && !prev.set && rng.next() < lerp(0, 0.42, p)) t0 = prev.t0 + prev.T * lerp(0.74, 0.86, rng.next());
    return { t0: t0 + extra, T, A, big, set: t0 < base };
  };

  // can the reference bird leave its spot, take a snack at (xf, ta) and get back up the beach in time?
  const feasible = (xf, ta, next, tArr, hold) => {
    const tDep = ta - Math.abs(refX - xf) / VREF;
    if (tDep < tHold + 0.05) return false;
    for (let t = tHold; t < tDep; t += 0.03) if (refAt(t) > refX - BR - 6) return false;
    for (let t = tDep; t <= ta; t += 0.02) {
      const x = lerp(refX, xf, (t - tDep) / Math.max(0.001, ta - tDep));
      if (refAt(t) > x - BR - 6) return false;
    }
    const df = Dat(ta);
    for (let t = ta - 0.4; t <= ta; t += 0.02) if (waterX(t, df) > xf - 8) return false;
    const tEnd = Math.max(next.t0 + 0.5 * next.T, tArr) + 0.1;
    for (let t = ta; t <= tEnd; t += 0.02) {
      const x = Math.min(hold, xf + VREF * (t - ta));
      if (refAt(t) > x - BR - 6) return false;
    }
    return true;
  };

  let guard = 0;
  while (guard++ < 200) {
    const prev = waves[waves.length - 1];
    const tp = peakOf(prev);
    if (tp > 61) break;
    const p = progress(tp, 60, 1.2);
    let placed = false;
    let extra = 0;
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      const next = proposeWave(prev, extra);
      waves.push(next);
      const hold = Math.min(X_MAX, L0 + next.A + 20 + BR + 12);
      const tEndWin = peakOf(next) - 0.04;
      const opts = [];
      for (let s = 0; s < 6; s++) {
        const xr = lerp(16, prev.A - 12, Math.pow(rng.next(), lerp(0.8, 1.9, p)));
        for (let ta = tp + 0.3; ta < tEndWin; ta += 0.04) {
          const xf = L0 + xr + shore(Dat(ta));
          const tArr = ta + Math.max(0, hold - xf) / VREF;
          if (feasible(xf, ta, next, tArr, hold)) opts.push({ xf, ta, tArr });
        }
      }
      if (opts.length) {
        opts.sort((a, b) => a.ta - b.ta);
        const f = clamp(lerp(0.1, 0.72, p) + (rng.next() - 0.5) * 0.5, 0, 0.999);
        const o = opts[Math.floor(f * opts.length)];
        const tDep = o.ta - Math.abs(refX - o.xf) / VREF;
        keys.push({ t: tDep, x: refX }, { t: o.ta, x: o.xf }, { t: o.tArr, x: Math.max(hold, o.xf) });
        foods.push({ x: o.xf, d: Dat(o.ta), ta: o.ta, wave: waves.length - 2, planned: true });
        refX = Math.max(hold, o.xf);
        tHold = o.tArr;
        placed = true;
      } else {
        waves.pop();
        extra += 0.3;
      }
    }
    if (!placed) {
      const next = proposeWave(prev, extra);
      waves.push(next);
      const hold = Math.min(X_MAX, L0 + next.A + 20 + BR + 12);
      if (hold > refX) {
        keys.push({ t: tHold, x: refX });
        tHold += (hold - refX) / VREF;
        keys.push({ t: tHold, x: hold });
        refX = hold;
      }
    }
  }

  // the reference path, sampled every 10ms
  const STEP = 0.01;
  const N = Math.ceil(64 / STEP);
  const xr = new Float32Array(N + 1);
  let ki = 0;
  for (let i = 0; i <= N; i++) {
    const t = i * STEP;
    while (ki < keys.length - 1 && keys[ki + 1].t <= t) ki++;
    const a = keys[ki];
    const b = keys[ki + 1];
    xr[i] = b ? lerp(a.x, b.x, clamp((t - a.t) / Math.max(0.001, b.t - a.t), 0, 1)) : a.x;
  }
  const xRef = (t) => xr[clamp(Math.round(t / STEP), 0, N)];

  // verify: the reference bird never touches the water and never goes hungry
  let hunger = 1;
  let fi = 0;
  for (let i = 0; i <= Math.round(60.5 / STEP); i++) {
    const t = i * STEP;
    if (refAt(t) > xRef(t) - BR - 3) return null;
    hunger -= drainAt(t) * STEP;
    while (fi < foods.length && foods[fi].ta <= t) {
      hunger = Math.min(1, hunger + SNACK);
      fi++;
    }
    if (hunger < 0.12) return null;
  }

  // bonus snacks: anywhere the sea uncovers, safe or not
  const near = (x, d, list, r) => list.some((o) => Math.abs(o.d - d) < r && Math.abs(o.x - x) < r);
  const firstUncovered = (x, d, from, to, margin) => {
    for (let t = from; t < to; t += 0.02) if (waterX(t, d) < x - margin) return t;
    return Infinity;
  };
  const firstCovered = (x, d, from, to, margin) => {
    for (let t = from; t < to; t += 0.02) if (waterX(t, d) >= x - margin) return t;
    return Infinity;
  };
  for (let k = 0; k < waves.length - 1; k++) {
    const w = waves[k];
    const tp = peakOf(w);
    if (tp > 60) break;
    const p = progress(tp, 60, 1.2);
    const n = (rng.next() < lerp(0.75, 0.45, p) ? 1 : 0) + (rng.next() < lerp(0.3, 0.15, p) ? 1 : 0);
    const tEnd = peakOf(waves[k + 1]);
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 10; tries++) {
        const ta = lerp(tp + 0.35, tEnd, rng.next());
        const d = Dat(ta);
        const x = L0 + lerp(14, w.A - 8, rng.next()) + shore(d);
        let ok = true;
        for (let t = ta - 0.35; t <= ta; t += 0.02) if (waterX(t, d) > x - 8) ok = false;
        if (!ok || near(x, d, foods, 30)) continue;
        foods.push({ x, d, ta, wave: k, planned: false });
        break;
      }
    }
  }
  foods.sort((a, b) => a.d - b.d);
  for (const f of foods) {
    const tp = peakOf(waves[f.wave]);
    f.tShow = Math.max(0, firstUncovered(f.x, f.d, Math.max(0, tp), f.ta + 0.01, 6));
    f.tGone = firstCovered(f.x, f.d, f.tShow + 0.05, f.tShow + 9, 4);
    f.kind = rng.next() < 0.6 ? 0 : 1;
  }

  // jellyfish washed up on the sand, kept off the reference bird's path
  const jellies = [];
  for (let k = 1; k < waves.length - 1; k++) {
    const w = waves[k];
    const tp = peakOf(w);
    if (tp < 12 || tp > 60) continue;
    const p = progress(tp, 60, 1.2);
    const n = (rng.next() < lerp(0.4, 0.85, p) ? 1 : 0) + (tp > 30 && rng.next() < lerp(0, 0.5, p) ? 1 : 0);
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 14; tries++) {
        const tc = lerp(tp + 0.5, tp + 3.2, rng.next());
        const d = Dat(tc);
        const x = L0 + lerp(22, w.A - 14, rng.next()) + shore(d);
        const tStrand = firstUncovered(x, d, tp, tp + 3.5, 6);
        if (!(tStrand < tc - 0.45)) continue;
        const tCov = firstCovered(x, d, tStrand + 0.05, tStrand + 9, 2);
        let ok = true;
        for (let t = Math.max(tStrand, tc - 1); t < Math.min(tCov, tc + 1); t += 0.02) {
          if (Math.abs(Dat(t) - d) < JELLY_R + BR + 8 && Math.abs(xRef(t) - x) < JELLY_R + BR + 12) {
            ok = false;
            break;
          }
        }
        if (!ok || near(x, d, foods, 34) || near(x, d, jellies, 40)) continue;
        jellies.push({ x, d, tc, t0: w.t0, tStrand, tCov, rot: rng.next() * TAU });
        break;
      }
    }
  }
  jellies.sort((a, b) => a.d - b.d);

  return { waves, foods, jellies, W0, waterX, shore, xRef, peakOf };
}

function buildPlan(rng) {
  let plan = null;
  for (let a = 0; a < 16 && !plan; a++) plan = tryPlan(rng.fork(`plan${a}`));
  return plan;
}

// ---------- art ----------

function paintSand(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#d9c8b4');
    base.addColorStop(0.45, '#eadbc6');
    base.addColorStop(1, '#f3e7d4');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const cols = ['#c9b49c', '#f8efe0', '#b8a28a', '#e2cfb8', '#a8927c', '#fffaf0'];
    for (let i = 0; i < 6500; i++) {
      const x = rng.next() * W;
      const y = rng.next() * H;
      const s = 0.5 + rng.next() * 1.3;
      g.fillStyle = cols[(rng.next() * cols.length) | 0];
      g.globalAlpha = 0.25 + rng.next() * 0.5;
      for (const oy of [0, -H, H]) {
        if (y + oy < -3 || y + oy > H + 3) continue;
        g.fillRect(x, y + oy, s, s);
      }
    }
    // soft wind ripples in the dry sand
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(160,135,110,0.16)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 46; i++) {
      const x = 170 + rng.next() * (W - 170);
      const y = rng.next() * H;
      const l = 18 + rng.next() * 30;
      for (const oy of [0, -H, H]) {
        if (y + oy < -20 || y + oy > H + 20) continue;
        g.beginPath();
        g.moveTo(x - l / 2, y + oy);
        g.quadraticCurveTo(x, y + oy - 3, x + l / 2, y + oy + 1);
        g.stroke();
      }
    }
  }, 2);
}

function paintDunes(H, rng) {
  // the strip of dune and marram grass along the right edge (tiles vertically)
  const w = 40;
  return makeSprite(w, H, (g) => {
    g.translate(-w / 2, -H / 2);
    const dg = g.createLinearGradient(0, 0, w, 0);
    dg.addColorStop(0, 'rgba(240,228,206,0)');
    dg.addColorStop(0.35, '#efe0c4');
    dg.addColorStop(1, '#d8c4a0');
    g.fillStyle = dg;
    g.fillRect(0, 0, w, H);
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = 18 + rng.next() * 22;
      const y = rng.next() * H;
      const n = 4 + ((rng.next() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (rng.next() - 0.5) * 1.6 - 0.35;
        const l = 8 + rng.next() * 10;
        g.strokeStyle = ['#8fa86a', '#a9bb7e', '#6f8a52', '#c2c88e'][(rng.next() * 4) | 0];
        g.lineWidth = 1 + rng.next() * 0.8;
        for (const oy of [0, -H, H]) {
          if (y + oy < -24 || y + oy > H + 24) continue;
          g.beginPath();
          g.moveTo(x, y + oy);
          g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 - 2, y + oy + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + oy + Math.sin(a) * l);
          g.stroke();
        }
      }
    }
  }, 2);
}

function paintBird() {
  return makeSprite(30, 44, (g) => {
    // tail
    g.fillStyle = '#4a3a2e';
    g.beginPath();
    g.moveTo(-4, 11);
    g.lineTo(0, 19);
    g.lineTo(4, 11);
    g.closePath();
    g.fill();
    // white flanks
    g.fillStyle = '#fbf8f2';
    g.beginPath();
    g.ellipse(0, 3, 9, 11.5, 0, 0, TAU);
    g.fill();
    // brown speckled back
    const bg = g.createLinearGradient(-8, -6, 8, 14);
    bg.addColorStop(0, '#a89078');
    bg.addColorStop(1, '#6a5544');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 4, 7.2, 10.5, 0, 0, TAU);
    g.fill();
    // scalloped feathers
    g.strokeStyle = 'rgba(55,40,28,0.7)';
    g.lineWidth = 0.7;
    for (let row = 0; row < 5; row++) {
      for (let c = -1; c <= 1; c++) {
        const x = c * 3.6 + (row % 2) * 1.8 - 0.9;
        const y = -2 + row * 3.2;
        g.beginPath();
        g.arc(x, y, 2, 0.2, Math.PI - 0.2);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(245,232,210,0.5)';
    for (let row = 0; row < 4; row++) {
      g.beginPath();
      g.arc((row % 2) * 2 - 1, row * 3.2 - 0.6, 2.4, 0.4, Math.PI - 0.4);
      g.stroke();
    }
    // dark wingtips crossing over the tail
    g.fillStyle = '#3a2c22';
    g.beginPath();
    g.moveTo(-5, 9);
    g.quadraticCurveTo(-2, 14, 1.5, 16);
    g.lineTo(-1, 10);
    g.closePath();
    g.moveTo(5, 9);
    g.quadraticCurveTo(2, 14, -1.5, 16);
    g.lineTo(1, 10);
    g.closePath();
    g.fill();
    // head
    const hg = g.createRadialGradient(-1.5, -11, 1, 0, -9, 6.5);
    hg.addColorStop(0, '#c4ad94');
    hg.addColorStop(1, '#8a7260');
    g.fillStyle = hg;
    g.beginPath();
    g.arc(0, -9, 6, 0, TAU);
    g.fill();
    // pale brows
    g.strokeStyle = '#f6efe2';
    g.lineWidth = 1.1;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 2, -14);
      g.quadraticCurveTo(s * 5, -12.5, s * 5.6, -8.5);
      g.stroke();
    }
    // eyes
    for (const s of [-1, 1]) {
      g.fillStyle = '#16100c';
      g.beginPath();
      g.arc(s * 4.4, -10.5, 1.5, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(s * 4.6, -11, 0.5, 0, TAU);
      g.fill();
    }
    // long thin bill
    g.fillStyle = '#1e1814';
    g.beginPath();
    g.moveTo(-1.3, -14.2);
    g.lineTo(0, -26);
    g.lineTo(1.3, -14.2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-0.4, -22, 0.6, 6);
  }, 3);
}

function paintCrab() {
  return makeSprite(22, 16, (g) => {
    // legs
    g.strokeStyle = '#c47a4a';
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(s * 4, 1 + i * 1.6);
        g.quadraticCurveTo(s * 8, -1 + i * 2.2, s * 9.5, 3 + i * 2.2);
        g.stroke();
      }
    }
    const cg = g.createRadialGradient(-1.5, -0.5, 0.5, 0, 1, 6);
    cg.addColorStop(0, '#ffd2a8');
    cg.addColorStop(1, '#d88a52');
    g.fillStyle = cg;
    g.beginPath();
    g.ellipse(0, 1.5, 5.6, 4.4, 0, 0, TAU);
    g.fill();
    // eye stalks
    g.strokeStyle = '#a85a30';
    g.lineWidth = 0.9;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 1.8, -2);
      g.lineTo(s * 2.4, -5);
      g.stroke();
      g.fillStyle = '#1a1210';
      g.beginPath();
      g.arc(s * 2.4, -5.4, 1.1, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-1.6, 0, 1.8, 1, -0.4, 0, TAU);
    g.fill();
  }, 3);
}

function paintWorm() {
  return makeSprite(18, 18, (g) => {
    g.lineCap = 'round';
    g.strokeStyle = '#b85a6a';
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(-6, 4);
    g.bezierCurveTo(-3, -4, 1, 6, 4, -3);
    g.quadraticCurveTo(5.5, -6, 6.5, -5);
    g.stroke();
    g.strokeStyle = '#f0a0a8';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-6, 4);
    g.bezierCurveTo(-3, -4, 1, 6, 4, -3);
    g.stroke();
    g.strokeStyle = 'rgba(120,40,50,0.5)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      const x = -5 + i * 2;
      g.beginPath();
      g.moveTo(x, -1 + Math.sin(i) * 2);
      g.lineTo(x + 0.5, 1.5 + Math.sin(i) * 2);
      g.stroke();
    }
  }, 3);
}

function paintHole() {
  return makeSprite(22, 14, (g) => {
    g.fillStyle = 'rgba(70,52,36,0.55)';
    g.beginPath();
    g.ellipse(0, 1, 8, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(40,28,18,0.75)';
    g.beginPath();
    g.ellipse(0, 1.5, 5, 3, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,248,235,0.45)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(0, 1, 8, 5, 0, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }, 3);
}

function paintJelly() {
  return makeSprite(36, 36, (g) => {
    // splayed tentacles
    g.strokeStyle = 'rgba(200,150,240,0.55)';
    g.lineWidth = 0.9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
      g.quadraticCurveTo(Math.cos(a + 0.25) * 14, Math.sin(a + 0.25) * 14, Math.cos(a - 0.1) * 16.5, Math.sin(a - 0.1) * 16.5);
      g.stroke();
    }
    const jg = g.createRadialGradient(-3, -3, 1, 0, 0, 12.5);
    jg.addColorStop(0, 'rgba(250,230,255,0.95)');
    jg.addColorStop(0.6, 'rgba(196,150,240,0.82)');
    jg.addColorStop(1, 'rgba(150,96,214,0.7)');
    g.fillStyle = jg;
    g.beginPath();
    g.arc(0, 0, 12.5, 0, TAU);
    g.fill();
    // frilly rim
    g.strokeStyle = 'rgba(120,70,190,0.8)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const r = 12.5 + Math.sin(i * 2.1) * 0.8;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke();
    // the four moon-jelly rings
    g.strokeStyle = 'rgba(230,90,170,0.85)';
    g.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      g.beginPath();
      g.arc(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 2.6, 0, TAU);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-4.5, -5.5, 3.6, 1.8, -0.7, 0, TAU);
    g.fill();
  }, 3);
}

function paintShell(rng, kind) {
  return makeSprite(14, 14, (g) => {
    if (kind === 0) {
      // scallop
      const c = ['#f2c2b0', '#f6e2c8', '#e8a890', '#fbeee4'][(rng.next() * 4) | 0];
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, 4.5);
      g.arc(0, 0.5, 5, Math.PI * 1.08, Math.PI * 1.92);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(150,90,70,0.5)';
      g.lineWidth = 0.5;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(0, 4.5);
        g.lineTo(i * 2, -3.6);
        g.stroke();
      }
    } else if (kind === 1) {
      // pebble
      const c = ['#9a958e', '#b8b0a4', '#7e7a74', '#c8c0b2'][(rng.next() * 4) | 0];
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, 3 + rng.next() * 2, 2 + rng.next() * 1.5, rng.next() * 3, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(-1, -0.8, 1.2, 0.6, 0, 0, TAU);
      g.fill();
    } else {
      // spiral whelk
      g.fillStyle = '#efdcc2';
      g.beginPath();
      g.ellipse(0, 0, 2.6, 4.6, 0.5, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(140,100,70,0.6)';
      g.lineWidth = 0.6;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(0, -2 + i * 2, 2.2 - i * 0.3, 0.3, Math.PI - 0.3);
        g.stroke();
      }
    }
  }, 3);
}

function paintWeed(rng) {
  return makeSprite(34, 22, (g) => {
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = ['#5a6a2a', '#3e4a1e', '#7a7a32', '#4a3a1e'][(rng.next() * 4) | 0];
      g.lineWidth = 1.4 + rng.next() * 1.4;
      const y = (rng.next() - 0.5) * 10;
      g.beginPath();
      g.moveTo(-14 + rng.next() * 6, y);
      g.bezierCurveTo(-4, y - 6 + rng.next() * 12, 4, y - 6 + rng.next() * 12, 13 - rng.next() * 6, y + (rng.next() - 0.5) * 8);
      g.stroke();
    }
    g.fillStyle = '#6a7a30';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc((rng.next() - 0.5) * 20, (rng.next() - 0.5) * 10, 1.4, 0, TAU);
      g.fill();
    }
  }, 2);
}

function paintPost() {
  return makeSprite(12, 12, (g) => {
    g.fillStyle = 'rgba(80,60,40,0.3)';
    g.beginPath();
    g.ellipse(2, 2, 4.5, 4, 0, 0, TAU);
    g.fill();
    const pg = g.createRadialGradient(-1, -1, 0.5, 0, 0, 4.2);
    pg.addColorStop(0, '#b8946a');
    pg.addColorStop(1, '#6a4a2c');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(0, 0, 4, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(60,40,20,0.6)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.arc(0, 0, 2.2, 0, TAU);
    g.stroke();
  }, 3);
}

// ---------- the game ----------

export default {
  id: 'sandpiper',
  title: 'Sandpiper',
  emoji: '🌊',
  tagline: "Chase the waves out for snacks to stay fed. Don't let one catch you.",
  colors: { bg: '#0f5f6e', fg: '#ffffff', accent: '#ffb38a' },
  music,

  create({ rng, W, H }) {
    const plan = buildPlan(rng.fork('plan'));
    const art = rng.fork('art');
    const { waves, foods, jellies, W0, waterX, shore, peakOf } = plan;

    // ---- art ----
    const sand = paintSand(W, H, art);
    const dunes = paintDunes(H, art);
    const bird = paintBird();
    const crab = paintCrab();
    const worm = paintWorm();
    const hole = paintHole();
    const jellyArt = paintJelly();
    const shellArts = [];
    for (let i = 0; i < 9; i++) shellArts.push(paintShell(art, i % 3));
    const weedArts = [paintWeed(art), paintWeed(art), paintWeed(art)];
    const postArt = paintPost();
    const glowSun = glowSprite('rgba(255,236,200,0.55)', 120);
    const glowSpark = glowSprite('rgba(255,255,240,0.9)', 6);
    const glowGold = glowSprite('rgba(255,214,140,0.7)', 20);
    const glowRed = glowSprite('rgba(255,70,60,0.7)', 30);
    const glowAqua = glowSprite('rgba(160,240,255,0.5)', 26);
    const glowPink = glowSprite('rgba(255,170,150,0.5)', 90);
    const vignette = vignetteSprite(W, H, 0.42, '20,40,50');
    const fx = createParticles();
    const spray = createParticles();

    const decor = [];
    for (let d = -200; d < Dat(64) + 800; d += lerp(14, 38, art.next())) {
      const r = art.next();
      if (r < 0.06) decor.push({ d, x: lerp(150, 300, art.next()), a: weedArts[(art.next() * 3) | 0], rot: art.next() * TAU, weed: true });
      else decor.push({ d, x: lerp(40, 330, art.next()), a: shellArts[(art.next() * shellArts.length) | 0], rot: art.next() * TAU });
    }
    const posts = [];
    for (let d = 0; d < Dat(64) + 800; d += 74) posts.push(d);
    const sparkles = [];
    for (let i = 0; i < 26; i++) sparkles.push({ x: Math.random() * 110, y: Math.random() * H, ph: Math.random() * TAU, sp: 2 + Math.random() * 3 });

    // ---- state ----
    let bx = 258;
    let bvx = 0;
    let hunger = 1;
    let D = 0;
    let now = 0;
    let wave = 0; // cosmetic time for the sea (keeps going after death)
    let clock = 0;
    let run = 0;
    let wet = W0(0);
    let deadT = 0;
    let deathKind = '';
    let deadX = 0;
    let shake = 0;
    let flash = 0;
    let lastPrint = 0;
    let printSide = 1;
    let pecks = 0;
    const prints = [];
    const pops = []; // "+" text when eating

    const yOf = (d) => PY - (d - D);
    const dOf = (y) => D + (PY - y);

    const die = (kind, reason) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      deadX = bx;
      shake = 0.4;
      if (kind === 'sea') {
        spray.burst(bx, PY, { count: 40, speed: 200, life: 0.9, size: 3.5, drag: 1.8, round: true, colors: ['#ffffff', '#c8f4f0', '#8ee0e0'] });
      } else if (kind === 'jelly') {
        flash = 1;
        fx.burst(bx, PY, { count: 30, speed: 180, life: 0.7, size: 3, drag: 2, colors: ['#ffffff', '#e8b8ff', '#ff8ad0'] });
      } else {
        fx.burst(bx, PY - 6, { count: 10, speed: 50, life: 1, size: 2.5, drag: 1, colors: ['#a89078', '#f6efe2'] });
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.4);
      flash = Math.max(0, flash - dt * 2);
      fx.update(dt);
      spray.update(dt);
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].life -= dt;
        pops[i].y -= 30 * dt;
        if (pops[i].life <= 0) pops.splice(i, 1);
      }
      for (const s of sparkles) {
        s.y += 12 * dt;
        if (s.y > H + 5) {
          s.y = -5;
          s.x = Math.random() * 110;
        }
      }
      wet = Math.max(W0(wave), wet - 16 * dt);
    };

    const game = {
      dead: false,
      deathReason: '',
      _plan: plan,
      get _x() {
        return bx;
      },

      update(dt, dir, t) {
        now = t;
        wave = t;
        D = Dat(t);
        updateCosmetic(dt);

        bvx += (dir * SPEED - bvx) * Math.min(1, 20 * dt);
        bx += bvx * dt;
        if (bx > X_MAX) {
          bx = X_MAX;
          bvx = 0;
        }
        run += dt * (2 + Math.abs(bvx) * 0.06);

        // the sea: the bird stops at the foam, but an advancing wave sweeps it away
        const wx = waterX(t, D);
        const wv = (W0(t) - W0(t - 0.02)) / 0.02;
        if (bx - EDGE < wx) {
          if (wv > 4) {
            const big = waves.find((w) => t >= w.t0 && t < w.t0 + w.T && w.big);
            die('sea', big ? 'Bowled over by a big wave.' : 'Caught by a wave and swept out to sea.');
            return;
          }
          bx = wx + EDGE;
          if (bvx < 0) bvx = 0;
        }

        // little feet: kick up sand and leave prints
        if (Math.abs(bvx) > 60 && Math.random() < 0.3) {
          fx.burst(bx - Math.sign(bvx) * 6, PY + 8, { count: 1, speed: 40, life: 0.4, size: 2, drag: 2, colors: ['#d8c4a8', '#c4ae92'] });
        }
        if (D - lastPrint > 9) {
          lastPrint = D;
          printSide = -printSide;
          prints.push({ x: bx + printSide * 2.6, d: D + 2 });
          if (prints.length > 140) prints.shift();
        }

        // snacks
        for (const f of foods) {
          if (f.eaten || t < f.tShow || t >= f.tGone) continue;
          const y = yOf(f.d);
          if (y < PY - 30) break;
          if (y > PY + 30) continue;
          const dx = f.x - bx;
          const dy = y - PY;
          if (dx * dx + dy * dy < FOOD_R * FOOD_R) {
            f.eaten = true;
            hunger = Math.min(1, hunger + SNACK);
            pecks = 0.25;
            fx.burst(f.x, y, { count: 12, speed: 90, life: 0.5, size: 2.5, drag: 2.5, colors: ['#ffe2a0', '#ffffff', f.kind ? '#f0a0a8' : '#ffb27a'] });
            pops.push({ x: f.x, y: y - 14, life: 0.7 });
          }
        }

        // stranded jellyfish
        for (const j of jellies) {
          const y = yOf(j.d);
          if (y < PY - 40) break;
          if (y > PY + 40) continue;
          if (t < j.tStrand || t >= j.tCov) continue;
          const dx = j.x - bx;
          const dy = y - PY;
          const r = BR + JELLY_R * 0.8;
          if (dx * dx + dy * dy < r * r) {
            die('jelly', 'Stepped on a stranded jellyfish. Ouch!');
            return;
          }
        }

        hunger -= drainAt(t) * dt;
        if (hunger <= 0) {
          hunger = 0;
          die('hunger', 'Too hungry to keep running.');
        }
        pecks = Math.max(0, pecks - dt);
      },

      afterlife(dt) {
        deadT += dt;
        wave += dt;
        updateCosmetic(dt);
        if (deathKind === 'sea') {
          bx = Math.max(-30, Math.min(bx, waterX(wave, D) - 12) - 40 * dt);
          if (Math.random() < 0.4) spray.burst(bx, PY, { count: 1, speed: 60, life: 0.5, size: 3, round: true, colors: ['#ffffff', '#c8f4f0'] });
        }
      },

      render(g) {
        const t = now;
        const tw = wave;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);

        // sand
        const off = ((D % H) + H) % H;
        drawSprite(g, sand, W / 2, H / 2 + off);
        drawSprite(g, sand, W / 2, H / 2 + off - H);

        // wet sand behind the retreating water
        const STEP = 16;
        const edgeX = (y) => waterX(tw, dOf(y)) + 3 * Math.sin(y * 0.045 + tw * 2.2) + 2 * Math.sin(y * 0.11 - tw * 3.1);
        g.beginPath();
        g.moveTo(0, -STEP);
        for (let y = -STEP; y <= H + STEP; y += STEP) g.lineTo(wet + shore(dOf(y)) + 10 + 4 * Math.sin(y * 0.03), y);
        g.lineTo(0, H + STEP);
        g.closePath();
        const wg = g.createLinearGradient(L0 - 20, 0, 330, 0);
        wg.addColorStop(0, 'rgba(110,88,70,0.42)');
        wg.addColorStop(1, 'rgba(130,105,85,0.22)');
        g.fillStyle = wg;
        g.fill();

        // shells, pebbles and seaweed
        for (const o of decor) {
          const y = yOf(o.d);
          if (y > H + 20) continue;
          if (y < -20) break;
          drawSprite(g, o.a, o.x, y, o.weed ? { rot: o.rot, size: 24, alpha: 0.6 } : { rot: o.rot });
        }
        // footprints, washed away by the sea
        g.fillStyle = 'rgba(95,72,52,0.35)';
        for (const p of prints) {
          const y = yOf(p.d);
          if (y > H + 6 || p.gone) continue;
          if (waterX(tw, p.d) > p.x - 2) {
            p.gone = true;
            continue;
          }
          g.beginPath();
          g.moveTo(p.x, y - 2.2);
          g.lineTo(p.x - 1.6, y + 1.4);
          g.moveTo(p.x, y - 2.2);
          g.lineTo(p.x + 1.6, y + 1.4);
          g.moveTo(p.x, y - 2.2);
          g.lineTo(p.x, y + 1.8);
          g.strokeStyle = 'rgba(95,72,52,0.18)';
          g.lineWidth = 0.8;
          g.stroke();
        }

        // dunes and fence posts on the right
        const doff = ((D % H) + H) % H;
        drawSprite(g, dunes, W - 20, H / 2 + doff);
        drawSprite(g, dunes, W - 20, H / 2 + doff - H);
        g.strokeStyle = 'rgba(120,90,60,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        let started = false;
        for (const pd of posts) {
          const y = yOf(pd);
          if (y > H + 80) continue;
          if (y < -80) break;
          const x = 351 + Math.sin(pd * 0.01) * 2;
          if (!started) {
            g.moveTo(x, y);
            started = true;
          } else g.quadraticCurveTo(x, y + 37 + 4, x, y);
        }
        g.stroke();
        for (const pd of posts) {
          const y = yOf(pd);
          if (y > H + 10) continue;
          if (y < -10) break;
          drawSprite(g, postArt, 351 + Math.sin(pd * 0.01) * 2, y);
        }

        // snacks (only where the sea has uncovered them)
        for (const f of foods) {
          if (f.eaten || tw < f.tShow || tw >= f.tGone) continue;
          const y = yOf(f.d);
          if (y > H + 20) continue;
          if (y < -20) break;
          const e = clamp((tw - f.tShow) / 0.35, 0, 1);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowGold, f.x, y, { size: 44 + Math.sin(clock * 6 + f.x) * 5, alpha: 0.75 * e });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, hole, f.x, y + 3);
          const bob = Math.sin(clock * 9 + f.d) * 0.8;
          drawSprite(g, f.kind ? worm : crab, f.x, y - 1 + bob, { size: (f.kind ? 19 : 21) * (0.4 + 0.6 * e) });
          if (Math.random() < 0.04) fx.burst(f.x + (Math.random() - 0.5) * 6, y + 2, { count: 1, speed: 14, life: 0.5, size: 2, round: true, colors: ['rgba(255,255,255,0.8)'] });
        }

        // jellyfish: riding in on the wave, then stranded on the sand
        for (const j of jellies) {
          const y = yOf(j.d);
          if (y > H + 30) continue;
          if (y < -30) break;
          if (tw < j.t0 || tw >= j.tCov + 0.6) continue;
          let x = j.x;
          let a = 1;
          if (tw < j.tStrand) continue; // drawn in the water further down
          if (tw >= j.tCov) {
            a = 1 - (tw - j.tCov) / 0.6;
            x = j.x - (tw - j.tCov) * 40;
          }
          if (x < -20) continue;
          if (tw >= j.tStrand && tw < j.tCov && !game.dead) {
            const gap = Math.hypot(x - bx, y - PY) - (BR + JELLY_R);
            if (gap < 40) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, x, y, { size: 60, alpha: clamp(1 - gap / 40, 0, 1) * (0.55 + 0.45 * Math.sin(clock * 16)) });
              g.globalCompositeOperation = 'source-over';
            }
          }
          drawSprite(g, jellyArt, x, y, { rot: j.rot + Math.sin(clock * 1.5 + j.x) * 0.05, alpha: a, size: 36 });
        }

        // the bird (under the water if it got caught)
        const drawBird = () => {
          let x = bx;
          let rot = clamp(bvx / SPEED, -1, 1) * 0.22;
          let y = PY - Math.abs(Math.sin(run * 3)) * (Math.abs(bvx) > 40 ? 1.6 : 0.4);
          let sz = 34;
          if (game.dead) {
            if (deathKind === 'sea') {
              rot = deadT * 7;
              y = PY + Math.sin(deadT * 5) * 3;
            } else if (deathKind === 'jelly') {
              y = PY - Math.max(0, Math.sin(Math.min(1, deadT * 2.5) * Math.PI)) * 18;
              rot = Math.sin(deadT * 30) * 0.2 * Math.max(0, 1 - deadT);
            } else {
              rot = Math.min(1, deadT * 2) * 0.5;
              sz = 34 * (1 - Math.min(1, deadT * 2) * 0.08);
            }
          }
          // shadow
          g.fillStyle = 'rgba(60,45,35,0.28)';
          g.beginPath();
          g.ellipse(x + 2, PY + 6, 9, 6.5, 0, 0, TAU);
          g.fill();
          // whirring legs
          if (!game.dead || deathKind !== 'sea') {
            g.strokeStyle = '#2a2420';
            g.lineWidth = 1.2;
            g.lineCap = 'round';
            const moving = Math.abs(bvx) > 40;
            for (const s of [-1, 1]) {
              const ph = moving ? Math.sin(run * 3 + (s > 0 ? Math.PI : 0)) * 5 : 0;
              g.beginPath();
              g.moveTo(x + s * 3, y + 4);
              g.lineTo(x + s * 3.5 + ph * 0.3, y + 11 + ph * 0.4);
              g.stroke();
            }
          }
          const peckY = pecks > 0 ? Math.sin((pecks / 0.25) * Math.PI) * 4 : 0;
          drawSprite(g, bird, x, y + 2 + peckY, { rot, size: sz });
        };
        if (deathKind !== 'sea') drawBird();

        // the sea
        g.beginPath();
        g.moveTo(-10, -STEP);
        for (let y = -STEP; y <= H + STEP; y += 8) g.lineTo(edgeX(y), y);
        g.lineTo(-10, H + STEP);
        g.closePath();
        const sg = g.createLinearGradient(0, 0, 320, 0);
        sg.addColorStop(0, 'rgba(14,98,120,1)');
        sg.addColorStop(0.3, 'rgba(36,156,170,0.94)');
        sg.addColorStop(0.65, 'rgba(110,212,206,0.72)');
        sg.addColorStop(1, 'rgba(170,236,228,0.6)');
        g.fillStyle = sg;
        g.fill();
        if (deathKind === 'sea') {
          g.globalAlpha = clamp(1 - deadT * 0.8, 0, 1);
          drawBird();
          g.globalAlpha = 1;
        }

        // jellyfish riding in on the waves
        for (const j of jellies) {
          const y = yOf(j.d);
          if (y > H + 30) continue;
          if (y < -30) break;
          if (tw < j.t0 || tw >= j.tStrand) continue;
          const x = Math.min(j.x, edgeX(y) - 10);
          const a = clamp((tw - j.t0) / 0.4, 0, 1) * 0.8;
          drawSprite(g, jellyArt, x, y + Math.sin(clock * 3 + j.x) * 2, { rot: j.rot + clock * 0.4, alpha: a, size: 34 });
        }

        // swells rolling in: each one shows how big its wave will be
        for (const w of waves) {
          if (w.t0 > tw + 1.5) break;
          if (tw < w.t0 - 1.4 || tw > w.t0 + 0.1) continue;
          const s = clamp((tw - (w.t0 - 1.4)) / 1.4, 0, 1);
          const th = (5 + (w.A / 180) * 12) * (0.6 + 0.4 * s);
          g.beginPath();
          for (let y = -STEP; y <= H + STEP; y += 16) {
            const x = lerp(-30, L0 - 12, s) + shore(dOf(y)) * s + 4 * Math.sin(y * 0.02 + w.t0);
            if (y === -STEP) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.strokeStyle = 'rgba(8,70,90,0.35)';
          g.lineWidth = th * 1.6;
          g.stroke();
          g.strokeStyle = `rgba(235,255,252,${0.35 + 0.45 * s})`;
          g.lineWidth = 1.5 + (w.A / 180) * 2.5 * s;
          g.save();
          g.translate(th * 0.5, 0);
          g.stroke();
          g.restore();
        }

        // the swash film, foam and lace along the edge
        g.beginPath();
        for (let y = -STEP; y <= H + STEP; y += 8) {
          const x = edgeX(y);
          if (y === -STEP) g.moveTo(x - 5, y);
          else g.lineTo(x - 5, y);
        }
        const wv = (W0(tw) - W0(tw - 0.03)) / 0.03;
        const surging = wv > 4;
        g.strokeStyle = 'rgba(190,245,240,0.35)';
        g.lineWidth = 14;
        g.stroke();
        g.beginPath();
        for (let y = -STEP; y <= H + STEP; y += 8) {
          const x = edgeX(y);
          if (y === -STEP) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.lineWidth = surging ? 5 : 2.6;
        g.stroke();
        g.save();
        g.translate(-9 - (surging ? 4 : 0), 0);
        g.setLineDash([7, 6]);
        g.lineDashOffset = -tw * 30;
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 1.6;
        g.stroke();
        g.setLineDash([]);
        g.restore();
        if (surging && !game.dead && Math.random() < 0.6) {
          const y = Math.random() * H;
          spray.burst(edgeX(y), y, { count: 1, speed: 70, angle: 0, spread: 1.4, life: 0.4, size: 2.5, drag: 2, round: true, colors: ['#ffffff', '#dffaf6'] });
        }
        if (surging && game.dead === false) {
          const y = PY;
          if (Math.random() < 0.3) spray.burst(edgeX(y), y, { count: 1, speed: 80, angle: 0, spread: 1, life: 0.4, size: 3, round: true, colors: ['#ffffff'] });
        }

        // sun glitter on the water
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowSun, 30, 90, { size: 300, alpha: 0.4 });
        for (const s of sparkles) {
          if (s.x > edgeX(s.y) - 14) continue;
          const a = Math.max(0, Math.sin(clock * s.sp + s.ph));
          if (a > 0.05) drawSprite(g, glowSpark, s.x, s.y, { size: 10 * a + 2, alpha: a });
        }
        g.globalCompositeOperation = 'source-over';
        spray.render(g);

        // how far the next waves will run up: a dashed line on the sand
        let warn = null;
        for (const w of waves) {
          if (w.t0 > tw + 1.4) break;
          const tp = peakOf(w);
          if (tw < w.t0 - 1.25 || tw > tp + 0.12) continue;
          const a = clamp((tw - (w.t0 - 1.25)) / 0.5, 0, 1) * clamp((tp + 0.12 - tw) / 0.2, 0, 1);
          const col = w.big ? '255,110,90' : '255,255,255';
          g.beginPath();
          for (let y = -STEP; y <= H + STEP; y += 12) {
            const x = L0 + w.A + shore(dOf(y)) + 2;
            if (y === -STEP) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.setLineDash([7, 7]);
          g.lineDashOffset = D * 0.0;
          g.strokeStyle = `rgba(${col},${0.85 * a})`;
          g.lineWidth = w.big ? 2.6 : 2;
          g.stroke();
          g.setLineDash([]);
          const rx = L0 + w.A + shore(D) + 2;
          if (!game.dead && tw < tp && bx - EDGE < rx + 2) warn = w;
          // a little marker on the line beside the bird
          g.fillStyle = `rgba(${col},${0.9 * a})`;
          g.beginPath();
          g.moveTo(rx, PY - 30);
          g.lineTo(rx + 7, PY - 36);
          g.lineTo(rx + 7, PY - 24);
          g.closePath();
          g.fill();
        }

        if (deathKind !== 'sea' || !game.dead) fx.render(g);

        // warnings over the bird
        if (warn && !game.dead) {
          const pulse = 0.6 + 0.4 * Math.sin(clock * 18);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, warn.big ? glowRed : glowAqua, bx, PY - 30, { size: 40, alpha: pulse });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = warn.big ? '#ff6a5a' : '#ffffff';
          g.font = 'bold 18px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('!', bx, PY - 30);
        }
        // "+" pops when eating
        g.font = 'bold 14px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const p of pops) {
          g.globalAlpha = clamp(p.life / 0.4, 0, 1);
          g.fillStyle = '#5a3a1a';
          g.fillText('+', p.x + 1, p.y + 1);
          g.fillStyle = '#ffe08a';
          g.fillText('+', p.x, p.y);
        }
        g.globalAlpha = 1;

        // morning haze
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowPink, W - 40, 30, { size: 260, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);

        // the hunger meter
        const bw = 150;
        const bh = 10;
        const bxl = W / 2 - bw / 2 + 10;
        const by = 616;
        const low = hunger < 0.3;
        g.fillStyle = 'rgba(20,40,50,0.45)';
        g.beginPath();
        g.roundRect(bxl - 28, by - 11, bw + 38, bh + 22, 16);
        g.fill();
        drawSprite(g, crab, bxl - 13, by + bh / 2, { size: 18 });
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath();
        g.roundRect(bxl, by, bw, bh, 5);
        g.fill();
        const col = hunger > 0.55 ? '#8fe6a8' : hunger > 0.3 ? '#ffd27a' : '#ff6a5a';
        g.fillStyle = col;
        g.globalAlpha = low ? 0.65 + 0.35 * Math.sin(clock * 14) : 1;
        g.beginPath();
        g.roundRect(bxl, by, Math.max(0.01, bw * hunger), bh, 5);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(bxl + 3, by + 2, Math.max(0, bw * hunger - 6), 2);
        if (low && !game.dead) {
          g.fillStyle = '#ff6a5a';
          g.font = 'bold 13px system-ui, sans-serif';
          g.fillText('hungry!', bx, PY + 26);
        }

        if (flash > 0) {
          g.fillStyle = `rgba(240,210,255,${flash * 0.5})`;
          g.fillRect(-20, -20, W + 40, H + 40);
        }
        g.restore();
      },
    };
    return game;
  },
};
