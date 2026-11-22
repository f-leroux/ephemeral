// Static Socks — a kid in fuzzy striped socks shuffles down the hallway of a 70s house over an
// avocado-green shag carpet. Every step on the shag builds static: the kid's hair stands on end
// and a crackling blue aura grows around them, wider the more they've moved (it also creeps up
// slowly just from walking forward). Anything electric or alive that comes inside the aura gets
// zapped: the cat, the dog, the goldfish bowl, the lava lamp, the record player. That ends the
// run. Brass floor vents are the way out: as soon as one comes inside the aura, the charge
// jumps to it and the aura is gone (so a big charge grounds from further away, but a small one
// has to walk right over the vent). Furniture (footstools, ferns, knitting baskets) doesn't
// care about static, but bumping into it ends the run too.
// So every dodge has a cost: move as little as you can, line up early, and route over the vents.
// From 22s cats stroll across the hall. Everything is planned up front around a hidden
// reference walker that moves well under your top speed and grounds itself on a vent every few
// seconds; every zappable thing is kept clear of that walker's aura, with a margin.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const TAU = Math.PI * 2;
const PY = 548; // the kid's screen y
const BR = 11; // the kid's body radius
const X_MIN = 34;
const X_MAX = 326;
const SPEED = 250;
const K_MOVE = 0.095; // charge per px moved sideways
const PASSIVE = 1.5; // charge per second from walking forward
const QMAX = 96;
const auraOf = (q) => BR + 3 + q;
const VENT_R = 9; // a vent grounds you when it's this close to the aura's edge
const MARGIN = 17; // the reference walker's aura is kept at least this far from zappables

const speedAt = (t) => (t >= 60 ? 265 : 140 + 125 * Math.pow(t / 60, 1.2));
// world distance walked by time t (the integral of speedAt)
const Dat = (t) => {
  if (t <= 0) return 140 * t;
  if (t <= 60) return 140 * t + ((125 * 60) / 2.2) * Math.pow(t / 60, 2.2);
  return 140 * 60 + (125 * 60) / 2.2 + 265 * (t - 60);
};

const KINDS = {
  cat: { r: 18, zap: true },
  dog: { r: 23, zap: true },
  fish: { r: 15, zap: true },
  lava: { r: 13, zap: true },
  record: { r: 21, zap: true },
  stroll: { r: 16, zap: true },
  stool: { r: 19, zap: false },
  fern: { r: 17, zap: false },
  basket: { r: 16, zap: false },
};

const DEATHS = {
  cat: ['Zapped the cat. Its fur will never lie flat again.', 'Tripped over the cat.'],
  stroll: ['Zapped the cat. It shot up the curtains.', 'Tripped over the cat.'],
  dog: ['Zapped the dog. Now it barks at your socks.', 'Tripped over the dog.'],
  fish: ['Zapped the goldfish bowl. The fish is fine. You’re not.', 'Knocked over the goldfish bowl.'],
  lava: ['Shorted the lava lamp. Pop!', 'Knocked over the lava lamp.'],
  record: ['Zapped the record player. The needle skipped right off.', 'Kicked the record player.'],
  stool: ['Tripped over the footstool.'],
  fern: ['Knocked over the fern. Soil all over the shag.'],
  basket: ['Stubbed your toe on the knitting basket.'],
};

// ---------- music: bleep techno, 132 BPM, C♯ minor over C♯m–A–E–B ----------

const music = {
  cps: 0.55, // 132 BPM, one 4/4 bar per cycle: 33 bars = 60s
  setup: `
    const kick = note("cs2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("cs2 cs2 cs2 [cs2 ~ ~ cs2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1200).lpf(6000).gain(0.16).room(0.2)
    const hat = s("~ white ~ white ~ white ~ white").decay(0.03).sustain(0).hpf(7000).gain(0.045)
    const hat16 = s("white*16").decay(0.02).sustain(0).hpf(7200).gain("[0.015 0.03 0.02 0.04]*4")
    const crackle = s("white*16").degradeBy(0.55).decay(0.012).sustain(0).hpf(6500).gain(0.035).pan(rand)
    const bass = note("<[cs2 ~ cs3 cs2 ~ cs2 gs2 ~] [a2 ~ a3 a2 ~ a2 e3 ~] [e2 ~ e3 e2 ~ e2 b2 ~] [b2 ~ b3 b2 ~ fs2 ds3 ~]>")
      .s("square").attack(0.004).decay(0.16).sustain(0.25).release(0.05).lpf(saw.range(320, 1300).slow(33)).gain(0.27)
    const sub = note("<cs2 a2 e2 b2>").s("sine").attack(0.01).decay(0.9).sustain(0.6).gain(0.24)
    const chords = "<[cs4,e4,gs4] [cs4,e4,a4] [b3,e4,gs4] [b3,ds4,fs4]>"
    const stabs = note(chords).struct("~ x ~ ~ ~ x ~ x").s("square").attack(0.003).decay(0.1).sustain(0).lpf(2000).gain(0.05).room(0.25)
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.8).lpf(saw.range(600, 1400).slow(33)).gain(0.045).room(0.5)
    const bleep = note("<[cs6 ~ gs5 ~ ~ cs6 ~ e6] [a5 ~ e5 ~ ~ a5 ~ cs6] [gs5 ~ e5 ~ ~ b5 ~ gs5] [fs5 ~ ds5 ~ ~ b5 ~ fs5]>")
      .s("sine").decay(0.09).sustain(0).gain(0.09).delay(0.3).delaytime(0.3409).delayfeedback(0.35)
    const lead = note("<[gs4 ~ b4 cs5 ~ e5 ds5 cs5] [cs5 ~ b4 a4 ~ gs4 ~ e4] [e4 ~ fs4 gs4 ~ b4 gs4 e4] [ds4 ~ fs4 b4 ~ ds5 cs5 b4]>")
      .s("square").attack(0.01).decay(0.15).sustain(0.4).release(0.1).lpf(1700).gain(0.06).vib(4).vibmod(0.1).pan(0.55)
    const arp = note("<[cs5 e5 gs5 cs6]*4 [cs5 e5 a5 cs6]*4 [b4 e5 gs5 b5]*4 [b4 ds5 fs5 b5]*4>")
      .s("triangle").decay(0.06).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, clap, hat, bass, sub, bleep)],
    [8, stack(kick, clap, hat, crackle, bass, sub, bleep, stabs, pad)],
    [8, stack(kick, clap, hat16, crackle, bass, sub, bleep, stabs, pad, lead)],
    [9, stack(kick2, clap, hat16, crackle, bass, sub, bleep, stabs, pad, lead, arp, wash)]
  )`,
};

// ---------- the plan: the reference walker, vents and everything on the carpet ----------

function buildPlan(rng) {
  const STEP = 0.01;
  const N = Math.ceil(64 / STEP);
  const xr = new Float32Array(N + 1); // reference walker x at each step
  const qr = new Float32Array(N + 1); // its charge
  const vents = [];

  // 1. the reference walker: hold, then glide sideways to a new spot, and so on
  let x = 180;
  let target = 180;
  let hold = 2.4;
  let lat = 0;
  let q = 0;
  let qTh = 30;
  let lastVent = -9;
  for (let i = 0; i <= N; i++) {
    const t = i * STEP;
    const p = progress(t, 60, 1.2);
    if (hold > 0) {
      hold -= STEP;
      if (hold <= 0) {
        let d = lerp(lerp(55, 85, p), lerp(150, 210, p), rng.next());
        let side = rng.next() < 0.5 ? -1 : 1;
        if (x + side * d > X_MAX - 16 || x + side * d < X_MIN + 16) side = -side;
        target = clamp(x + side * d, X_MIN + 16, X_MAX - 16);
        lat = lerp(0.48, 0.66, p) * SPEED;
      }
    } else {
      const dx = target - x;
      const st = lat * STEP;
      if (Math.abs(dx) <= st) {
        x = target;
        hold = lerp(1.1, 0.35, p) * lerp(0.6, 1.4, rng.next());
      } else x += Math.sign(dx) * st;
      q += K_MOVE * st;
    }
    q += PASSIVE * STEP;
    xr[i] = x;
    // ground on a vent when the charge gets high (not while gliding fast: vents go at held spots or mid-glide)
    if (t > 3.6 && q > qTh && t - lastVent > 1.4) {
      vents.push({ x, ta: t });
      lastVent = t;
      q = 0;
      qTh = lerp(lerp(26, 40, p), lerp(36, 52, p), rng.next());
    }
    qr[i] = q;
  }
  const xAt = (t) => xr[clamp(Math.round(t / STEP), 0, N)];
  const qAt = (t) => qr[clamp(Math.round(t / STEP), 0, N)];

  // a few spare vents off the route
  const spare = [];
  for (let t = 9; t < 60; t += lerp(5, 8, rng.next())) {
    const vx = lerp(X_MIN + 14, X_MAX - 14, rng.next());
    if (vents.some((v) => Math.abs(v.ta - t) < 0.5)) continue;
    spare.push({ x: vx, ta: t });
  }
  const allVents = vents.concat(spare).map((v) => ({ ...v, d: Dat(v.ta), spare: spare.includes(v) }));

  // 2. things on the carpet, kept clear of the reference walker
  const items = [];
  const posAt = (o, t) => o.x + (o.vx || 0) * (t - o.ta);
  const clearOfRoute = (o) => {
    const k = KINDS[o.kind];
    const d0 = Dat(o.ta);
    for (let tt = o.ta - 1.1; tt <= o.ta + 1.1; tt += 0.02) {
      if (tt < 0) continue;
      const dy = Dat(tt) - d0;
      const dx = xAt(tt) - posAt(o, tt);
      const need = k.zap ? auraOf(qAt(tt)) + 0.8 * k.r + MARGIN : BR + 0.85 * k.r + 13;
      if (dx * dx + dy * dy < need * need) return false;
    }
    return true;
  };
  const clearOfOthers = (o) => {
    const k = KINDS[o.kind];
    const d0 = Dat(o.ta);
    for (let j = items.length - 1; j >= 0; j--) {
      const b = items[j];
      if (o.ta - b.ta > 1.5) break;
      if (o.vx || b.vx) continue;
      const dy = d0 - b.d;
      const dx = o.x - b.x;
      const need = k.r + KINDS[b.kind].r + 8;
      if (dx * dx + dy * dy < need * need) return false;
    }
    for (const v of allVents) {
      if (Math.abs(v.ta - o.ta) > 1.2) continue;
      const dy = d0 - v.d;
      const dx = posAt(o, v.ta) - v.x;
      const need = k.r + 20;
      if (dx * dx + dy * dy < need * need) return false;
    }
    return true;
  };

  let ta = 3.2;
  while (ta < 63) {
    const p = progress(ta, 60, 1.2);
    const n = ta < 7 ? 1 : 1 + (rng.next() < lerp(0.35, 0.8, p) ? 1 : 0) + (ta > 30 && rng.next() < lerp(0, 0.45, p) ? 1 : 0);
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 18; tries++) {
        const rr = rng.next();
        let kind;
        if (ta > 22 && rr < lerp(0, 0.2, p)) kind = 'stroll';
        else {
          const zapShare = lerp(0.55, 0.72, p);
          const r2 = rng.next();
          if (r2 < zapShare) kind = ['cat', 'cat', 'dog', 'fish', 'lava', 'record'][Math.floor(rng.next() * 6)];
          else kind = ['stool', 'fern', 'basket'][Math.floor(rng.next() * 3)];
        }
        const o = { kind, ta: ta + lerp(-0.08, 0.08, rng.next()), x: 0, vx: 0 };
        // aim at where the walker was or will be (forcing it to have moved), or anywhere
        const aim = rng.next();
        if (aim < 0.35) o.x = xAt(o.ta - lerp(0.6, 1.2, rng.next())) + lerp(-18, 18, rng.next());
        else if (aim < 0.5) o.x = xAt(o.ta + lerp(0.6, 1.2, rng.next())) + lerp(-18, 18, rng.next());
        else o.x = lerp(X_MIN + 4, X_MAX - 4, rng.next());
        o.x = clamp(o.x, X_MIN, X_MAX);
        if (kind === 'stroll') {
          o.vx = (rng.next() < 0.5 ? -1 : 1) * lerp(32, 58, p) * lerp(0.85, 1.15, rng.next());
        }
        if (!clearOfRoute(o) || !clearOfOthers(o)) continue;
        o.d = Dat(o.ta);
        o.rot = lerp(-0.6, 0.6, rng.next());
        o.flip = rng.next() < 0.5;
        items.push(o);
        break;
      }
    }
    ta += lerp(0.85, 0.42, p) * lerp(0.85, 1.15, rng.next());
  }
  items.sort((a, b) => a.ta - b.ta);
  allVents.sort((a, b) => a.ta - b.ta);
  return { items, vents: allVents, xAt, qAt };
}

// ---------- art ----------

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shadow(g, rx, ry, a = 0.32, dy = 3) {
  g.fillStyle = `rgba(20,25,5,${a})`;
  g.beginPath();
  g.ellipse(2, dy, rx, ry, 0, 0, TAU);
  g.fill();
}

function paintCarpet(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#4e5a1c');
    base.addColorStop(0.5, '#68772a');
    base.addColorStop(1, '#4e5a1c');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // shag tufts: short strokes in many greens, wrapped vertically so the carpet tiles
    const cols = ['#7d8f32', '#5c6a22', '#8fa23c', '#46521a', '#6f8030', '#a0b048', '#3d4816'];
    g.lineCap = 'round';
    for (let i = 0; i < 5200; i++) {
      const x = rng.next() * W;
      const y = rng.next() * H;
      const a = rng.next() * TAU;
      const l = 2 + rng.next() * 3.5;
      g.strokeStyle = cols[(rng.next() * cols.length) | 0];
      g.globalAlpha = 0.35 + rng.next() * 0.5;
      g.lineWidth = 0.8 + rng.next() * 1.2;
      for (const oy of [0, -H, H]) {
        if (y + oy < -6 || y + oy > H + 6) continue;
        g.beginPath();
        g.moveTo(x, y + oy);
        g.lineTo(x + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // wood-panelled walls at the edges
    for (const [x0, x1] of [[0, 18], [W - 18, W]]) {
      const wg = g.createLinearGradient(x0, 0, x1, 0);
      const inner = x0 === 0 ? [0, 1] : [1, 0];
      wg.addColorStop(inner[0], '#3a2412');
      wg.addColorStop(inner[1], '#7a4e26');
      g.fillStyle = wg;
      g.fillRect(x0, 0, x1 - x0, H);
      g.strokeStyle = 'rgba(30,15,5,0.45)';
      g.lineWidth = 0.7;
      for (let k = 0; k < 6; k++) {
        const gx = x0 + 2 + rng.next() * 14;
        g.beginPath();
        g.moveTo(gx, 0);
        for (let y = 0; y <= H; y += 40) g.lineTo(gx + Math.sin((y / H) * TAU * 2 + k) * 1.5, y);
        g.stroke();
      }
      for (let y = 0; y < H; y += 160) {
        g.fillStyle = 'rgba(25,12,4,0.6)';
        g.fillRect(x0, y, x1 - x0, 1.5);
      }
      // skirting board
      const sx = x0 === 0 ? x1 - 4 : x0;
      g.fillStyle = '#c9a26a';
      g.fillRect(sx, 0, 4, H);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x0 === 0 ? x1 : x0 - 3, 0, 3, H);
    }
  }, 2);
}

function paintRug(rng, kind) {
  if (kind === 0) {
    // round braided rug in harvest gold, burnt orange and brown
    const R = 70;
    return makeSprite(R * 2 + 4, R * 2 + 4, (g) => {
      const cols = ['#d9932a', '#a8521c', '#e8b84a', '#6b3a18', '#c9702a', '#f0cc6a'];
      for (let r = R, i = 0; r > 4; r -= 5.5, i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(60,25,5,0.35)';
        g.lineWidth = 0.6;
        g.setLineDash([2, 2]);
        g.beginPath();
        g.arc(0, 0, r - 2.7, 0, TAU);
        g.stroke();
        g.setLineDash([]);
      }
      const hl = g.createRadialGradient(-20, -24, 4, 0, 0, R);
      hl.addColorStop(0, 'rgba(255,240,200,0.18)');
      hl.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = hl;
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fill();
    });
  }
  // rectangular rug with 70s chevron stripes
  const w = 150;
  const h = 96;
  return makeSprite(w + 8, h + 8, (g) => {
    g.fillStyle = '#e9d9b0';
    roundRect(g, -w / 2, -h / 2, w, h, 4);
    g.fill();
    g.save();
    roundRect(g, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 3);
    g.clip();
    const cs = ['#8a3c1a', '#c95a24', '#e8a332', '#f2d27a', '#c95a24'];
    for (let i = 0, y = -h / 2 - 30; y < h / 2 + 10; y += 9, i++) {
      g.fillStyle = cs[i % cs.length];
      g.beginPath();
      for (let x = -w / 2; x <= w / 2 + 20; x += 20) {
        g.lineTo(x, y);
        g.lineTo(x + 10, y + 10);
      }
      for (let x = w / 2 + 20; x >= -w / 2; x -= 20) {
        g.lineTo(x + 10, y + 19);
        g.lineTo(x, y + 9);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
    // fringe
    g.strokeStyle = '#e9d9b0';
    g.lineWidth = 1;
    for (let x = -w / 2 + 2; x < w / 2; x += 3) {
      for (const sy of [-1, 1]) {
        g.beginPath();
        g.moveTo(x, (sy * h) / 2);
        g.lineTo(x + (rng.next() - 0.5) * 1.5, sy * (h / 2 + 4));
        g.stroke();
      }
    }
  });
}

function paintVent() {
  return makeSprite(36, 26, (g) => {
    g.fillStyle = 'rgba(20,25,5,0.4)';
    roundRect(g, -16, -10, 34, 23, 3);
    g.fill();
    const bg = g.createLinearGradient(0, -11, 0, 11);
    bg.addColorStop(0, '#fff0b8');
    bg.addColorStop(0.35, '#d8a848');
    bg.addColorStop(1, '#7d5618');
    g.fillStyle = bg;
    roundRect(g, -17, -11, 34, 22, 3);
    g.fill();
    g.fillStyle = '#2a1c08';
    for (let x = -12; x <= 10; x += 4.4) {
      roundRect(g, x, -7, 2.4, 14, 1.2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,250,220,0.7)';
    g.fillRect(-15, -10, 30, 1.2);
    for (const [sx, sy] of [[-14.5, -8.5], [14.5, -8.5], [-14.5, 8.5], [14.5, 8.5]]) {
      g.fillStyle = '#6b4a12';
      g.beginPath();
      g.arc(sx, sy, 1.3, 0, TAU);
      g.fill();
      g.fillStyle = '#ffe9a8';
      g.fillRect(sx - 0.6, sy - 0.9, 0.8, 0.8);
    }
  });
}

function paintCat(fur, dark, sleepy = true) {
  return makeSprite(48, 46, (g) => {
    shadow(g, 20, 17);
    // curled body
    const bg = g.createRadialGradient(-4, -4, 2, 0, 0, 20);
    bg.addColorStop(0, shade(fur, 0.25));
    bg.addColorStop(0.7, fur);
    bg.addColorStop(1, shade(fur, -0.3));
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 1, 18, 16, 0, 0, TAU);
    g.fill();
    // stripes
    g.strokeStyle = dark;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    for (let a = -2.6; a < 1.2; a += 0.55) {
      g.beginPath();
      g.arc(0, 1, 13, a, a + 0.28);
      g.stroke();
    }
    // tail wrapped round
    g.strokeStyle = shade(fur, -0.1);
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 1, 17, 0.2, 1.9);
    g.stroke();
    g.strokeStyle = dark;
    g.lineWidth = 2;
    for (const a of [0.6, 1.1, 1.6]) {
      g.beginPath();
      g.arc(0, 1, 17, a, a + 0.12);
      g.stroke();
    }
    // head tucked in
    const hx = -7;
    const hy = 6;
    g.fillStyle = shade(fur, 0.12);
    g.beginPath();
    g.ellipse(hx, hy, 8.5, 7.5, 0.2, 0, TAU);
    g.fill();
    g.fillStyle = shade(fur, -0.15);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(hx + s * 7, hy - 3);
      g.lineTo(hx + s * 5.5, hy - 10);
      g.lineTo(hx + s * 2, hy - 5.5);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#f2a0a0';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(hx + s * 5.8, hy - 4);
      g.lineTo(hx + s * 5.2, hy - 8);
      g.lineTo(hx + s * 3, hy - 5.2);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1;
    if (sleepy) {
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(hx + s * 3, hy, 1.8, 0.2, Math.PI - 0.2);
        g.stroke();
      }
    }
    g.fillStyle = '#e07a7a';
    g.beginPath();
    g.moveTo(hx - 1, hy + 2.5);
    g.lineTo(hx + 1, hy + 2.5);
    g.lineTo(hx, hy + 3.6);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.5;
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(hx + s * 3, hy + 3);
        g.lineTo(hx + s * 10, hy + 3 + k * 1.5);
        g.stroke();
      }
    }
  });
}

function paintStrollCat(step) {
  // a grey cat walking right, seen from above
  return makeSprite(54, 34, (g) => {
    shadow(g, 20, 9, 0.28, 3);
    const fur = '#8a8f9a';
    // legs
    g.fillStyle = '#6f7480';
    const lp = step ? 3 : -3;
    for (const [lx, ly] of [[10 + lp, -8], [10 - lp, 8], [-9 - lp, -8], [-9 + lp, 8]]) {
      g.beginPath();
      g.ellipse(lx, ly, 3.4, 2.6, 0, 0, TAU);
      g.fill();
    }
    // tail
    g.strokeStyle = '#7a7f8a';
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-15, 0);
    g.quadraticCurveTo(-24, step ? -8 : 8, -25, step ? -2 : 2);
    g.stroke();
    // body
    const bg = g.createLinearGradient(0, -9, 0, 9);
    bg.addColorStop(0, shade(fur, -0.25));
    bg.addColorStop(0.45, shade(fur, 0.2));
    bg.addColorStop(1, shade(fur, -0.3));
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(-1, 0, 16, 8.5, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#5c616c';
    g.lineWidth = 1.6;
    for (const x of [-9, -4, 1, 6]) {
      g.beginPath();
      g.moveTo(x, -7);
      g.quadraticCurveTo(x + 1.5, 0, x, 7);
      g.stroke();
    }
    // head
    g.fillStyle = shade(fur, 0.1);
    g.beginPath();
    g.ellipse(17, 0, 7.5, 7, 0, 0, TAU);
    g.fill();
    g.fillStyle = shade(fur, -0.2);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(15, s * 4);
      g.lineTo(19, s * 10);
      g.lineTo(21, s * 3.5);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e8d84a';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(21, s * 2.6, 1.4, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#e07a7a';
    g.beginPath();
    g.arc(24, 0, 1.1, 0, TAU);
    g.fill();
  });
}

function paintDog() {
  return makeSprite(58, 54, (g) => {
    shadow(g, 25, 21);
    // white, tan and black beagle curled up
    const bg = g.createRadialGradient(-5, -5, 3, 0, 0, 24);
    bg.addColorStop(0, '#f5ede0');
    bg.addColorStop(1, '#d8cbb4');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 1, 23, 20, 0, 0, TAU);
    g.fill();
    // saddle
    g.fillStyle = '#2a2018';
    g.beginPath();
    g.ellipse(4, -5, 14, 10, 0.4, 0, TAU);
    g.fill();
    g.fillStyle = '#b8742c';
    g.beginPath();
    g.ellipse(10, 6, 9, 8, 0.2, 0, TAU);
    g.fill();
    // tail tip
    g.strokeStyle = '#2a2018';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, 1, 21, 0.4, 1.3);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 1, 21, 1.3, 1.6);
    g.stroke();
    // head resting on paws
    const hx = -9;
    const hy = 8;
    g.fillStyle = '#c8823a';
    g.beginPath();
    g.ellipse(hx, hy, 10, 9, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = '#f5ede0';
    g.beginPath();
    g.ellipse(hx - 2, hy + 4, 4, 6, -0.3, 0, TAU);
    g.fill();
    // floppy ears
    g.fillStyle = '#7a4418';
    g.beginPath();
    g.ellipse(hx - 9, hy - 1, 4, 8, 0.3, 0, TAU);
    g.ellipse(hx + 8, hy - 4, 4, 8, -0.6, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(hx + s * 3.5 - 1, hy - 1, 1.8, 0.2, Math.PI - 0.2);
      g.stroke();
    }
    g.fillStyle = '#1a1210';
    g.beginPath();
    g.ellipse(hx - 3, hy + 8, 2.4, 1.8, 0, 0, TAU);
    g.fill();
  });
}

function paintFishbowl() {
  return makeSprite(36, 36, (g) => {
    shadow(g, 15, 14);
    const wg = g.createRadialGradient(-4, -4, 2, 0, 0, 15);
    wg.addColorStop(0, '#bfeeff');
    wg.addColorStop(0.6, '#5ab8e0');
    wg.addColorStop(1, '#2a78a8');
    g.fillStyle = wg;
    g.beginPath();
    g.arc(0, 0, 15, 0, TAU);
    g.fill();
    // pebbles
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      g.fillStyle = ['#e8a0b0', '#f0e080', '#a0e0a0'][i % 3];
      g.beginPath();
      g.arc(Math.cos(a) * 11, Math.sin(a) * 11, 1.8, 0, TAU);
      g.fill();
    }
    // weed
    g.strokeStyle = '#3a9a4a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(6, 8);
    g.quadraticCurveTo(9, 2, 5, -2);
    g.stroke();
    // goldfish
    g.fillStyle = '#ff8a1a';
    g.beginPath();
    g.ellipse(-2, 1, 5, 3, 0.3, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(-6, -1);
    g.lineTo(-10, -4);
    g.lineTo(-9.5, 2.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(1.2, 1.6, 0.8, 0, TAU);
    g.fill();
    // glass rim
    g.strokeStyle = 'rgba(230,250,255,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 9.5, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(200,240,255,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 15, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-7, -8, 3.5, 1.6, -0.7, 0, TAU);
    g.fill();
  });
}

function paintLava() {
  // a lava lamp standing on the carpet (seen from the front, like it's leaning back at you)
  return makeSprite(30, 50, (g) => {
    g.fillStyle = 'rgba(20,25,5,0.35)';
    g.beginPath();
    g.ellipse(2, 20, 12, 5, 0, 0, TAU);
    g.fill();
    const metal = (x0, x1) => {
      const mg = g.createLinearGradient(x0, 0, x1, 0);
      mg.addColorStop(0, '#5a5c68');
      mg.addColorStop(0.35, '#f4f4f8');
      mg.addColorStop(1, '#4a4c58');
      return mg;
    };
    // base cone
    g.fillStyle = metal(-11, 11);
    g.beginPath();
    g.moveTo(-11, 20);
    g.lineTo(11, 20);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    // glass
    const lg = g.createLinearGradient(-8, 0, 8, 0);
    lg.addColorStop(0, '#a8183a');
    lg.addColorStop(0.4, '#ff6a3a');
    lg.addColorStop(1, '#8a1030');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-5, 6);
    g.quadraticCurveTo(-9, -6, -3.5, -17);
    g.lineTo(3.5, -17);
    g.quadraticCurveTo(9, -6, 5, 6);
    g.closePath();
    g.fill();
    // blobs
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.ellipse(-1, 1, 3.4, 4, 0, 0, TAU);
    g.ellipse(2, -8, 2.4, 3, 0.3, 0, TAU);
    g.ellipse(-1.5, -13.5, 1.6, 1.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(-4.5, -10, 1.3, 12);
    // cap
    g.fillStyle = metal(-4, 4);
    g.beginPath();
    g.moveTo(-3.8, -17);
    g.lineTo(3.8, -17);
    g.lineTo(2.5, -23);
    g.lineTo(-2.5, -23);
    g.closePath();
    g.fill();
  });
}

function paintRecordBox() {
  return makeSprite(50, 44, (g) => {
    g.fillStyle = 'rgba(20,25,5,0.35)';
    roundRect(g, -21, -16, 46, 38, 3);
    g.fill();
    const wg = g.createLinearGradient(-23, 0, 23, 0);
    wg.addColorStop(0, '#6a3e1c');
    wg.addColorStop(0.5, '#a8682e');
    wg.addColorStop(1, '#5a3418');
    g.fillStyle = wg;
    roundRect(g, -23, -19, 46, 38, 3);
    g.fill();
    g.fillStyle = '#d8d0c0';
    roundRect(g, -20, -16, 40, 32, 2);
    g.fill();
    g.fillStyle = '#9a9488';
    g.beginPath();
    g.arc(-4, 0, 14.5, 0, TAU);
    g.fill();
    // knobs
    for (const [x, y] of [[14, 11], [17, 11]]) {
      g.fillStyle = '#c9a24a';
      g.beginPath();
      g.arc(x, y, 1.4, 0, TAU);
      g.fill();
    }
  });
}

function paintVinyl() {
  return makeSprite(30, 30, (g) => {
    g.fillStyle = '#141418';
    g.beginPath();
    g.arc(0, 0, 13.5, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(120,120,140,0.35)';
    g.lineWidth = 0.4;
    for (let r = 6; r < 13; r += 1.2) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 13, -0.9, -0.5);
    g.fill();
    g.fillStyle = '#e8442a';
    g.beginPath();
    g.arc(0, 0, 4.5, 0, TAU);
    g.fill();
    g.fillStyle = '#f2d27a';
    g.fillRect(-3, -1, 3, 1);
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(0, 0, 0.8, 0, TAU);
    g.fill();
  });
}

function paintStool() {
  return makeSprite(44, 44, (g) => {
    shadow(g, 19, 18);
    const lg = g.createRadialGradient(-6, -6, 2, 0, 0, 19);
    lg.addColorStop(0, '#f0a050');
    lg.addColorStop(0.6, '#c2621e');
    lg.addColorStop(1, '#6e3010');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(0, 0, 19, 0, TAU);
    g.fill();
    // tufted segments
    g.strokeStyle = 'rgba(80,30,5,0.55)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,220,170,0.35)';
    g.beginPath();
    g.arc(0, 0, 16, 3.6, 5.0);
    g.stroke();
    g.fillStyle = '#5a2408';
    g.beginPath();
    g.arc(0, 0, 3.2, 0, TAU);
    g.fill();
    g.fillStyle = '#f2b070';
    g.beginPath();
    g.arc(-1, -1, 1, 0, TAU);
    g.fill();
  });
}

function paintFern(rng) {
  return makeSprite(46, 46, (g) => {
    shadow(g, 17, 16);
    const pg = g.createRadialGradient(-4, -4, 2, 0, 0, 14);
    pg.addColorStop(0, '#e8885a');
    pg.addColorStop(1, '#9a4a26');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(0, 0, 13, 0, TAU);
    g.fill();
    g.fillStyle = '#4a2a14';
    g.beginPath();
    g.arc(0, 0, 10, 0, TAU);
    g.fill();
    // fronds
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + rng.next() * 0.3;
      const l = 15 + rng.next() * 6;
      g.strokeStyle = i % 2 ? '#3f8a2e' : '#5aa83a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0);
      const ex = Math.cos(a) * l;
      const ey = Math.sin(a) * l;
      g.quadraticCurveTo(Math.cos(a + 0.3) * l * 0.6, Math.sin(a + 0.3) * l * 0.6, ex, ey);
      g.stroke();
      g.fillStyle = g.strokeStyle;
      for (let k = 0.3; k < 1; k += 0.14) {
        const px = Math.cos(a + 0.15 * (1 - k)) * l * k;
        const py = Math.sin(a + 0.15 * (1 - k)) * l * k;
        g.beginPath();
        g.ellipse(px, py, 4 * (1.15 - k), 1.6, a + 1.2, 0, TAU);
        g.fill();
      }
    }
  });
}

function paintBasket() {
  return makeSprite(40, 40, (g) => {
    shadow(g, 16, 15);
    const bg = g.createRadialGradient(-4, -4, 2, 0, 0, 16);
    bg.addColorStop(0, '#e8c27a');
    bg.addColorStop(1, '#8a6228');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(90,60,20,0.6)';
    g.lineWidth = 0.8;
    for (let r = 4; r < 16; r += 2.6) {
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.stroke();
    }
    // yarn balls
    for (const [x, y, c] of [[-4, -3, '#e85a8a'], [5, 2, '#4ab0d8'], [-2, 6, '#f2d23a']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 5, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x, y, 3.5, k, k + 2);
        g.stroke();
      }
    }
    // needles
    g.strokeStyle = '#c8ccd8';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-12, -10);
    g.lineTo(10, -2);
    g.moveTo(-10, -13);
    g.lineTo(9, 1);
    g.stroke();
  });
}

function paintKidBody() {
  // shoulders and arms in a striped jumper, seen from above
  return makeSprite(40, 26, (g) => {
    g.fillStyle = 'rgba(20,25,5,0.3)';
    g.beginPath();
    g.ellipse(2, 3, 17, 10, 0, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(0, 0, 17, 9.5, 0, 0, TAU);
    g.clip();
    for (let x = -18; x < 18; x += 6) {
      g.fillStyle = (x / 6) % 2 ? '#e8e0c8' : '#d8402a';
      g.fillRect(x, -10, 6, 20);
    }
    const sh = g.createLinearGradient(0, -10, 0, 10);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)');
    sh.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = sh;
    g.fillRect(-18, -10, 36, 20);
    g.restore();
    // hands
    g.fillStyle = '#f2c49a';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 16, 4, 3.2, 0, TAU);
      g.fill();
    }
  });
}

function paintKidHead() {
  return makeSprite(26, 26, (g) => {
    // hair from above: a round mop with a crown swirl
    const hg = g.createRadialGradient(-2, -2, 1, 0, 0, 10);
    hg.addColorStop(0, '#a8682e');
    hg.addColorStop(1, '#5a3010');
    g.fillStyle = hg;
    g.beginPath();
    g.arc(0, 0, 9.5, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(40,18,4,0.6)';
    g.lineWidth = 0.7;
    for (let a = 0; a < TAU; a += 0.5) {
      g.beginPath();
      g.moveTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5);
      g.quadraticCurveTo(Math.cos(a + 0.6) * 6, Math.sin(a + 0.6) * 6, Math.cos(a + 0.4) * 9, Math.sin(a + 0.4) * 9);
      g.stroke();
    }
    // nose tip peeking out at the front
    g.fillStyle = '#f2c49a';
    g.beginPath();
    g.ellipse(0, -9.6, 2.4, 1.4, 0, 0, TAU);
    g.fill();
  });
}

function paintSock() {
  return makeSprite(10, 16, (g) => {
    g.fillStyle = 'rgba(20,25,5,0.3)';
    g.beginPath();
    g.ellipse(1, 1.5, 4, 7, 0, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(0, 0, 4, 7, 0, 0, TAU);
    g.clip();
    for (let y = -8; y < 8; y += 3) {
      g.fillStyle = (y + 8) % 6 ? '#3ab0c8' : '#f2d23a';
      g.fillRect(-5, y, 10, 3);
    }
    g.fillStyle = '#ffffff';
    g.fillRect(-5, -8, 10, 3.5);
    g.restore();
  });
}

// ---------- the game ----------

export default {
  id: 'socks',
  title: 'Static Socks',
  emoji: '⚡',
  tagline: 'Moving builds static. Ground it on brass vents; zap or bump nothing.',
  colors: { bg: '#3c4a18', fg: '#ffffff', accent: '#7fe6ff' },
  music,

  create({ rng, W, H }) {
    const plan = buildPlan(rng.fork('plan'));
    const art = rng.fork('art');

    // ---- art ----
    const carpet = paintCarpet(W, H, art);
    const rugArt = [paintRug(art, 0), paintRug(art, 1)];
    const ventArt = paintVent();
    const catArts = [paintCat('#e89a42', '#a85a18'), paintCat('#3a3a40', '#1a1a1e'), paintCat('#f2ece0', '#c8b898')];
    const strollArt = [paintStrollCat(0), paintStrollCat(1)];
    const dogArt = paintDog();
    const fishArt = paintFishbowl();
    const lavaArt = paintLava();
    const recordArt = paintRecordBox();
    const vinylArt = paintVinyl();
    const stoolArt = paintStool();
    const fernArts = [paintFern(art), paintFern(art)];
    const basketArt = paintBasket();
    const kidBody = paintKidBody();
    const kidHead = paintKidHead();
    const sock = paintSock();
    const glowBlue = glowSprite('rgba(110,210,255,0.6)', 48);
    const glowViolet = glowSprite('rgba(190,140,255,0.6)', 48);
    const glowWhite = glowSprite('rgba(235,245,255,0.9)', 40);
    const glowRed = glowSprite('rgba(255,60,50,0.7)', 40);
    const glowGold = glowSprite('rgba(255,215,120,0.55)', 30);
    const glowLava = glowSprite('rgba(255,120,60,0.5)', 24);
    const vignette = vignetteSprite(W, H, 0.5, '20,22,4');
    const fx = createParticles();
    const sparks = createParticles();

    for (const o of plan.items) {
      if (o.kind === 'cat') o.art = catArts[Math.floor(art.next() * catArts.length)];
      else if (o.kind === 'fern') o.art = fernArts[Math.floor(art.next() * 2)];
    }
    const rugs = [];
    for (let d = 300; d < Dat(64) + 800; d += lerp(420, 700, art.next())) {
      rugs.push({ d, x: lerp(90, 270, art.next()), k: art.next() < 0.5 ? 0 : 1, rot: lerp(-0.3, 0.3, art.next()) });
    }
    const lint = [];
    for (let i = 0; i < 22; i++) lint.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, z: 0.4 + Math.random() * 0.6 });

    // ---- state ----
    const kid = createMover({ x: 180, minX: X_MIN, maxX: X_MAX, speed: SPEED, accel: 16 });
    let q = 0; // static charge
    let D = 0;
    let now = 0;
    let clock = 0;
    let walk = 0;
    let shake = 0;
    let flash = 0;
    let deadT = 0;
    let victim = null;
    let zapKill = false;
    const bolts = []; // short-lived lightning between the kid and something
    const trail = []; // pressed shag behind the socks
    let lastTrailD = -99;

    const xOf = (o, t) => o.x + (o.vx || 0) * (t - o.ta);
    const yOf = (d) => PY - (d - D);

    const addBolt = (x1, y1, x2, y2, life, width, color) => {
      const pts = [];
      const n = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 9));
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const nl = Math.hypot(nx, ny) || 1;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 14;
        pts.push([lerp(x1, x2, u) + (nx / nl) * j, lerp(y1, y2, u) + (ny / nl) * j]);
      }
      bolts.push({ pts, life, max: life, width, color });
    };

    const die = (o, t) => {
      const k = KINDS[o.kind];
      zapKill = k.zap && q > 5;
      const reasons = DEATHS[o.kind];
      game.dead = true;
      game.deathReason = zapKill ? reasons[0] : reasons[reasons.length - 1];
      victim = o;
      shake = 0.5;
      const vx = xOf(o, t);
      const vy = yOf(o.d);
      if (zapKill) {
        flash = 1;
        for (let i = 0; i < 3; i++) addBolt(kid.x, PY, vx, vy, 0.6, 3 - i, i ? '#bfe9ff' : '#ffffff');
        sparks.burst(vx, vy, { count: 46, speed: 260, life: 0.8, size: 3, drag: 1.5, colors: ['#ffffff', '#bfe9ff', '#7fd8ff', '#c9a8ff'] });
        if (o.kind === 'fish') fx.burst(vx, vy, { count: 30, speed: 180, life: 0.9, size: 3, drag: 2, round: true, colors: ['#bfeeff', '#5ab8e0', '#ffffff'] });
        else if (o.kind === 'lava') fx.burst(vx, vy, { count: 26, speed: 160, life: 1, size: 4, drag: 2, round: true, colors: ['#ff5a8a', '#ff8a2a', '#ffd06a'] });
        else fx.burst(vx, vy, { count: 22, speed: 120, life: 1.1, size: 3, drag: 2.2, colors: ['#e89a42', '#f2ece0', '#8a8f9a', '#ffffff'] });
      } else {
        fx.burst(kid.x, PY - 8, { count: 22, speed: 140, life: 0.8, size: 3, drag: 2.4, colors: o.kind === 'fern' ? ['#4a2a14', '#5aa83a', '#7a4a24'] : ['#ffffff', '#f2d23a', '#e85a8a'] });
      }
      q = 0;
    };

    const ground = (v) => {
      const vy = yOf(v.d);
      for (let i = 0; i < 2; i++) addBolt(kid.x, PY - 2, v.x, vy, 0.28, 2.6 - i, i ? '#9fdcff' : '#ffffff');
      sparks.burst(v.x, vy, { count: 14 + Math.round(q * 0.4), speed: 150, life: 0.5, size: 2.5, drag: 2, colors: ['#ffffff', '#bfe9ff', '#ffe08a'] });
      v.flash = 1;
      q = 0;
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.3);
      flash = Math.max(0, flash - dt * 2.2);
      fx.update(dt);
      sparks.update(dt);
      for (let i = bolts.length - 1; i >= 0; i--) {
        bolts[i].life -= dt;
        if (bolts[i].life <= 0) bolts.splice(i, 1);
      }
      for (const v of plan.vents) if (v.flash) v.flash = Math.max(0, v.flash - dt * 2.5);
      for (const m of lint) {
        m.y += (6 + 8 * m.z) * dt;
        m.x += Math.sin(clock * 0.7 + m.ph) * 5 * dt;
        if (m.y > H + 5) {
          m.y = -5;
          m.x = Math.random() * W;
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        now = t;
        D = Dat(t);
        const x0 = kid.x;
        kid.update(dt, dir);
        const moved = Math.abs(kid.x - x0);
        q = Math.min(QMAX, q + K_MOVE * moved + PASSIVE * dt);
        walk += dt * speedAt(t) * 0.055;
        updateCosmetic(dt);
        if (D - lastTrailD > 10) {
          trail.push({ x: kid.x, d: D });
          lastTrailD = D;
          if (trail.length > 80) trail.shift();
        }
        // little sparks fly off the socks while shuffling sideways
        if (moved > 0.6 && Math.random() < 0.25 + q / 200) {
          sparks.burst(kid.x + (Math.random() - 0.5) * 10, PY + 10, { count: 1, speed: 60, life: 0.35, size: 2, colors: ['#bfe9ff', '#ffffff'] });
        }

        // vents first: the charge jumps to any vent inside the aura
        for (const v of plan.vents) {
          if (v.ta < t - 1.5) continue;
          if (v.ta > t + 1.5) break;
          if (q < 3) continue;
          const dx = v.x - kid.x;
          const dy = yOf(v.d) - PY;
          const r = auraOf(q) + VENT_R;
          if (dx * dx + dy * dy < r * r) ground(v);
        }
        // then everything else
        const a2 = auraOf(q);
        for (const o of plan.items) {
          if (o.ta < t - 1.5) continue;
          if (o.ta > t + 1.5) break;
          const k = KINDS[o.kind];
          const dx = xOf(o, t) - kid.x;
          const dy = yOf(o.d) - PY;
          const r = k.zap ? a2 + 0.8 * k.r : BR + 0.85 * k.r;
          if (dx * dx + dy * dy < r * r) {
            die(o, t);
            return;
          }
        }
      },

      afterlife(dt) {
        deadT += dt;
        updateCosmetic(dt);
      },

      render(g) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12);

        // carpet and rugs
        const off = ((D % H) + H) % H;
        drawSprite(g, carpet, W / 2, H / 2 + off);
        drawSprite(g, carpet, W / 2, H / 2 + off - H);
        for (const r of rugs) {
          const y = yOf(r.d);
          if (y < -110 || y > H + 110) continue;
          drawSprite(g, rugArt[r.k], r.x, y, { rot: r.rot });
        }
        // pressed shag where the socks went
        if (trail.length > 1) {
          g.strokeStyle = 'rgba(30,40,8,0.22)';
          g.lineWidth = 14;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.beginPath();
          for (let i = 0; i < trail.length; i++) {
            const p = trail[i];
            const y = yOf(p.d) + 8;
            if (i === 0) g.moveTo(p.x, y);
            else g.lineTo(p.x, y);
          }
          g.lineTo(kid.x, PY + 8);
          g.stroke();
        }

        // vents
        for (const v of plan.vents) {
          const y = yOf(v.d);
          if (y > H + 30) continue;
          if (y < -30) break;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowGold, v.x, y, { size: 56 + Math.sin(clock * 4 + v.x) * 4, alpha: 0.5 + 0.5 * (v.flash || 0) });
          if (v.flash) drawSprite(g, glowWhite, v.x, y, { size: 90, alpha: v.flash });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, ventArt, v.x, y);
        }

        // things on the carpet
        const aura = auraOf(q);
        const dead = game.dead;
        for (const o of plan.items) {
          const y = yOf(o.d);
          if (y > H + 40) continue;
          if (y < -50) break;
          let x = xOf(o, t);
          const k = KINDS[o.kind];
          if (x < -40 || x > W + 40) continue;
          if (o === victim) x += Math.sin(deadT * 50) * 3 * Math.max(0, 1 - deadT * 1.5);
          // a red glow warns when a zappable thing gets close to the aura
          if (k.zap && !dead) {
            const gap = Math.hypot(x - kid.x, y - PY) - (aura + 0.8 * k.r);
            if (gap < 46) {
              const a = clamp(1 - gap / 46, 0, 1);
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, x, y, { size: k.r * 4.2, alpha: a * (0.6 + 0.4 * Math.sin(clock * 18)) });
              g.globalCompositeOperation = 'source-over';
            }
          }
          if (o.kind === 'cat') drawSprite(g, o.art, x, y, { rot: o.rot });
          else if (o.kind === 'stroll') {
            const st = Math.floor(clock * 6 + o.x) % 2;
            g.save();
            g.translate(x, y);
            if (o.vx < 0) g.scale(-1, 1);
            drawSprite(g, strollArt[st], 0, 0);
            g.restore();
          } else if (o.kind === 'dog') drawSprite(g, dogArt, x, y, { rot: o.rot });
          else if (o.kind === 'fish') drawSprite(g, fishArt, x, y);
          else if (o.kind === 'lava') {
            drawSprite(g, lavaArt, x, y);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowLava, x, y - 6, { size: 44 + Math.sin(clock * 2 + o.x) * 6 });
            g.globalCompositeOperation = 'source-over';
          } else if (o.kind === 'record') {
            drawSprite(g, recordArt, x, y, { rot: o.rot * 0.3 });
            const c = Math.cos(o.rot * 0.3);
            const s = Math.sin(o.rot * 0.3);
            const vx = x - 4 * c;
            const vy = y - 4 * s;
            drawSprite(g, vinylArt, vx, vy, { rot: o === victim ? 0 : clock * 3.5 });
            g.strokeStyle = '#e8e8f0';
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(x + 15 * c + 12 * s, y + 15 * s - 12 * c);
            g.lineTo(x + 6 * c - 4 * s, y + 6 * s + 4 * c);
            g.stroke();
          } else if (o.kind === 'stool') drawSprite(g, stoolArt, x, y);
          else if (o.kind === 'fern') drawSprite(g, o.art, x, y, { rot: o.rot });
          else if (o.kind === 'basket') drawSprite(g, basketArt, x, y, { rot: o.rot });
          // a zapped victim's fur stands on end
          if (o === victim && zapKill) {
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 1.2;
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * TAU;
              const r1 = k.r * 0.8;
              const r2 = k.r * (1.1 + 0.25 * Math.sin(i * 3 + deadT * 30));
              g.beginPath();
              g.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
              g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
              g.stroke();
            }
          }
        }

        // the aura
        const c = clamp(q / 70, 0, 1);
        const kx = kid.x;
        if (q > 2 && !(dead && zapKill)) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowBlue, kx, PY, { size: aura * 2.4, alpha: 0.18 + 0.2 * (1 - c) });
          drawSprite(g, glowViolet, kx, PY, { size: aura * 2.4, alpha: 0.25 * c });
          const n = 34;
          for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? `rgba(255,255,255,${0.35 + 0.3 * c})` : `rgba(${Math.round(lerp(110, 200, c))},${Math.round(lerp(220, 160, c))},255,0.8)`;
            g.lineWidth = pass ? 1 : 2.2;
            g.beginPath();
            for (let i = 0; i <= n; i++) {
              const a = (i / n) * TAU + clock * 0.8;
              const r = aura + (i % n ? (Math.random() - 0.5) * (2 + c * 4) : 0);
              const px = kx + Math.cos(a) * r;
              const py = PY + Math.sin(a) * r;
              if (i === 0) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.stroke();
          }
          // crackles from the kid to the edge of the aura
          if (Math.random() < 0.2 + c * 0.6) {
            const a = Math.random() * TAU;
            addBolt(kx, PY, kx + Math.cos(a) * aura, PY + Math.sin(a) * aura, 0.06, 1.2, '#bfe9ff');
          }
          g.globalCompositeOperation = 'source-over';
        }

        // the kid
        const lean = kid.lean;
        const step = Math.sin(walk);
        drawSprite(g, sock, kx - 6, PY + 7 + step * 6, { rot: lean * 0.3, size: 12 });
        drawSprite(g, sock, kx + 6, PY + 7 - step * 6, { rot: lean * 0.3, size: 12 });
        drawSprite(g, kidBody, kx, PY, { rot: lean * 0.12, size: 48 });
        // hair standing up with the charge
        const hl = 1 + q * 0.11;
        if (q > 4) {
          g.strokeStyle = '#7a4418';
          g.lineWidth = 1.6;
          g.lineCap = 'round';
          g.beginPath();
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * TAU + Math.sin(clock * 9 + i) * 0.06;
            const r1 = 7;
            const r2 = 10 + hl * (0.75 + 0.25 * Math.sin(i * 2.7));
            g.moveTo(kx + Math.cos(a) * r1, PY - 3 + Math.sin(a) * r1);
            g.lineTo(kx + Math.cos(a) * r2, PY - 3 + Math.sin(a) * r2);
          }
          g.stroke();
        }
        drawSprite(g, kidHead, kx, PY - 3, { size: 31 });

        // lightning bolts
        g.globalCompositeOperation = 'lighter';
        for (const b of bolts) {
          g.globalAlpha = clamp(b.life / b.max, 0, 1);
          g.strokeStyle = b.color;
          g.lineWidth = b.width;
          g.beginPath();
          for (let i = 0; i < b.pts.length; i++) {
            if (i === 0) g.moveTo(b.pts[i][0], b.pts[i][1]);
            else g.lineTo(b.pts[i][0], b.pts[i][1]);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
        sparks.render(g, true);
        g.globalCompositeOperation = 'source-over';
        fx.render(g);

        // lint drifting in the sunlight
        g.fillStyle = 'rgba(255,250,220,0.5)';
        for (const m of lint) {
          g.globalAlpha = 0.25 + 0.25 * m.z;
          g.fillRect(m.x, m.y, 1.5 * m.z + 0.5, 1.5 * m.z + 0.5);
        }
        g.globalAlpha = 1;

        drawSprite(g, vignette, W / 2, H / 2);
        if (flash > 0) {
          g.fillStyle = `rgba(220,240,255,${flash * 0.55})`;
          g.fillRect(-20, -20, W + 40, H + 40);
        }
        g.restore();
      },
    };
    return game;
  },
};
