// Shelf Life — a librarian walks the floor of a grand white-and-gold baroque library with a
// stack of books balanced on their head, and a clumsy apprentice on the gallery above keeps
// dropping more books over the railing. Every book has to land on top of the stack: one on
// the floor and the run is over.
// The catch is that the stack sways. It's a springy column that lags behind your head and
// overshoots when you stop, so the top (where books land) is never quite where you are, and
// every book you catch makes the stack taller, slower and wilder. Sway too far and the whole
// stack topples. Start and stop gently, lean into the swing, and don't move twice in time
// with it.
// Ink pots fall too from 6s: let them pass (one on top and the books are ruined). Heavy
// atlases from 14s jolt the stack when they land off-centre, quick pairs of books from 18s,
// gusts from the tall windows push the top sideways from 20s (the curtains billow first),
// and from 26s some books are tossed and slide down a slanted path. Each item hangs from the
// apprentice's hand at the railing before it's let go, and a marker at the top of the stack
// shows where it will land. Everything is planned up front around a hidden reference top
// that moves well under your speed, and ink pots are kept clear of it.

import {
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
const BASE_Y = 566; // the top of the librarian's head = the bottom of the stack
const FLOOR_Y = 606; // where the back wall meets the floor
const FEET_Y = 632;
const HAND_Y = 76; // centre of an item held over the railing
const X_MIN = 44;
const X_MAX = 316;
const SPEED = 245;
const ACC = 1250; // px/s², how hard the librarian speeds up and slows down
const ZETA = 0.17; // the stack's damping
const H_CAP = 418; // the stack is planned to never get taller than this
const START_BOOKS = 3;

// sway: the stack's natural frequency drops as it grows; how far it may lean grows a little too
const omegaFor = (h) => TAU * lerp(1.55, 0.62, clamp((h - 30) / (H_CAP - 30), 0, 1));
const limitFor = (h) => 44 + 0.15 * h;
// how strongly the head's acceleration rocks the stack (a short stack is stiffer)
const coupleFor = (h) => lerp(0.5, 0.7, clamp(h / H_CAP, 0, 1));
const catchTol = (w) => w / 2 + 6;
const inkTol = (w) => w / 2 + 5;

const BOOK_COLS = ['#b8323a', '#1f6f78', '#2b3f78', '#2f7a4a', '#6b3a78', '#d39a2c', '#c45a2a', '#3a8fb0', '#8a2f52', '#4f6b2e'];

// ---------- music: nu-jazz breakbeat, 132 BPM, D Dorian over Dm9–G13–Cmaj9–A7alt ----------

const music = {
  cps: 0.55, // 132 BPM, one 4/4 bar per cycle: 33 bars = 60s
  setup: `
    const kick = note("e2 ~ ~ ~ ~ ~ ~ e2 ~ ~ e2 ~ ~ ~ ~ ~").s("sine").decay(0.24).sustain(0).gain(0.8)
    const kick2 = note("e2 ~ ~ e2 ~ ~ ~ e2 ~ ~ e2 ~ ~ e2 ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
    const snare = s("~ ~ ~ ~ pink ~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~").decay(0.16).sustain(0).hpf(900).lpf(5200).gain(0.17).room(0.2)
    const ghost = s("~ ~ ~ pink ~ ~ pink ~ ~ pink ~ ~ ~ ~ ~ pink").decay(0.05).sustain(0).hpf(1400).lpf(4800).gain(0.045)
    const hat = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.035 0.05]*4")
    const hat16 = s("white*16").decay(0.02).sustain(0).hpf(7200).gain("[0.012 0.026 0.018 0.03]*4")
    const ride = s("[white ~ white white]*2").decay(0.18).sustain(0).hpf(6500).lpf(11000).gain(0.022)
    const shaker = s("[~ white ~ white]*4").decay(0.045).sustain(0).hpf(5200).lpf(9000).gain(0.022).pan(0.62)
    const toms = note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a2 ~ e2 c2").s("sine").decay(0.18).sustain(0).gain(0.32)
    const bass = note("<[d2 ~ a2 d3 ~ c3 a2 f2] [g2 ~ d3 f3 ~ d3 b2 a2] [c2 ~ g2 c3 ~ b2 g2 e2] [a2 ~ e3 g3 ~ e3 cs3 a2]>")
      .s("sawtooth").attack(0.005).decay(0.22).sustain(0.3).release(0.06).lpf(saw.range(380, 1500).slow(33)).gain(0.32)
    const sub = note("<d2 g2 c2 a2>").s("sine").decay(0.8).sustain(0.5).gain(0.2)
    const chords = "<[f3,a3,c4,e4] [f3,a3,b3,e4] [e3,g3,b3,d4] [g3,cs4,f4,as4]>"
    const rhodes = note(chords).struct("~ x ~ ~ x ~ ~ x").s("triangle").attack(0.004).decay(0.4).sustain(0.08).release(0.15)
      .lpf(saw.range(1400, 2800).slow(33)).gain(0.11).room(0.3)
    const pad = note(chords).s("sawtooth").attack(0.5).release(0.8).lpf(850).gain(0.04).room(0.6)
    const stabs = note(chords).add(note(12)).struct("~ ~ ~ x ~ ~ x ~").s("sawtooth").attack(0.004).decay(0.12).sustain(0)
      .lpf(2400).gain(0.045).pan(0.4)
    const tune = "<[a4 c5 d5 e5@2 d5 c5 a4] [b4@2 a4 g4 f4@2 e4 f4] [g4 a4 b4 d5@2 e5 d5 b4] [cs5@3 e5 g5@2 f5 e5]>"
    const trumpet = note(tune).s("square").attack(0.02).decay(0.2).sustain(0.5).release(0.12).lpf(1900).vib(5).vibmod(0.15)
      .gain(0.065).delay(0.25).delaytime(0.3409).delayfeedback(0.3).pan(0.57)
    const sax = note(tune).add(note(-12)).s("sawtooth").attack(0.03).decay(0.25).sustain(0.5).release(0.1).lpf(1200).gain(0.045)
    const vibes = note("<[f4 a4 c5 e5]*2 [f4 a4 b4 e5]*2 [e4 g4 b4 d5]*2 [g4 cs5 f5 as5]*2>")
      .s("sine").attack(0.003).decay(0.3).sustain(0).gain(0.07).delay(0.3).delaytime(0.2273).delayfeedback(0.35).pan(sine.range(0.3, 0.7).slow(2))
    const arp = note("<[d5 f5 a5 c6]*4 [b4 d5 f5 a5]*4 [c5 e5 g5 b5]*4 [cs5 e5 g5 as5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3400).gain(0.035).pan(sine.range(0.35, 0.65).slow(3))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, snare, hat, bass, sub, rhodes)],
    [8, stack(kick, snare, ghost, hat, shaker, bass, sub, rhodes, pad, trumpet)],
    [8, stack(kick, snare, ghost, hat16, shaker, bass, sub, rhodes, pad, stabs, trumpet, vibes)],
    [9, stack(kick2, snare, ghost, hat16, ride, shaker, toms, bass, sub, rhodes, pad, stabs, trumpet, sax, vibes, arp, wash)]
  )`,
};

// ---------- the plan: every item that falls, decided up front ----------

function buildPlan(rng) {
  const books = []; // the stack's books, in order (the first START_BOOKS are already on the head)
  for (let i = 0; i < START_BOOKS; i++) books.push({ h: lerp(10, 12, rng.next()), w: lerp(62, 72, rng.next()), T: -1, kind: 'book' });

  // pass 1: when and where every book lands (the hidden reference top visits each in turn)
  const lands = [];
  let T = 3.1;
  let X = 180 + (rng.next() < 0.5 ? -1 : 1) * lerp(55, 95, rng.next());
  lands.push({ T, X, quick: false });
  while (T < 61) {
    const r = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
    const p = progress(T, 60, 1.3);
    let dT = lerp(2.05, 1.0, p) * lerp(0.9, 1.1, r[0]);
    let maxD = lerp(100, 150, p) * dT - 12;
    let minD = Math.min(maxD, lerp(46, 80, p));
    const quick = T > 18 && r[1] < lerp(0.12, 0.3, p);
    if (quick) {
      dT = lerp(0.6, 0.72, r[2]);
      maxD = 58;
      minD = 26;
    }
    let side = r[3] < 0.5 ? -1 : 1;
    const d = lerp(minD, maxD, r[4]);
    if (X + side * d > 300 || X + side * d < 60) side = -side;
    X = clamp(X + side * d, 60, 300);
    T += dT;
    lands.push({ T, X, quick });
  }

  // kinds and sizes
  const items = [];
  for (const l of lands) {
    const r = [rng.next(), rng.next(), rng.next(), rng.next()];
    let kind = 'book';
    if (l.T > 14 && !l.quick && r[0] < 0.2) kind = 'atlas';
    else if (l.T > 26 && !l.quick && r[0] < 0.48) kind = 'drift';
    const h = kind === 'atlas' ? lerp(14, 16, r[1]) : lerp(8.5, 12, r[1]);
    const w = kind === 'atlas' ? lerp(76, 82, r[2]) : lerp(52, 70, r[2]);
    items.push({ kind, T: l.T, X: l.X, h, w, quick: l.quick, vx: kind === 'drift' ? (r[3] < 0.5 ? -1 : 1) * lerp(45, 85, rng.next()) : 0 });
  }
  // keep the stack under the cap by the end of the minute
  const h0 = books.reduce((a, b) => a + b.h, 0);
  const sum = items.filter((it) => it.T <= 60.5).reduce((a, b) => a + b.h, 0);
  const k = Math.min(1, (H_CAP - h0) / sum);
  for (const it of items) it.h *= k;

  // ink pots between books, kept clear of the reference top
  const refAt = (t) => {
    if (t <= items[0].T) return items[0].X;
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1];
      const b = items[i];
      if (t <= b.T) return lerp(a.X, b.X, (t - a.T) / (b.T - a.T));
    }
    return items[items.length - 1].X;
  };
  const inks = [];
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1];
    const b = items[i];
    if (a.T < 6 || b.T - a.T < 0.9) continue;
    const p = progress(a.T, 60, 1.3);
    const n = rng.next() < lerp(0.4, 0.95, p) ? (a.T > 30 && rng.next() < lerp(0, 0.55, p) ? 2 : 1) : 0;
    const used = [];
    for (let j = 0; j < n; j++) {
      for (let tries = 0; tries < 24; tries++) {
        const t = lerp(a.T + 0.4, b.T - 0.35, rng.next());
        const x = lerp(40, 320, rng.next());
        if (Math.abs(x - refAt(t)) < 74) continue;
        if (t - a.T < 0.6 && Math.abs(x - a.X) < 70) continue;
        if (b.T - t < 0.8 && Math.abs(x - b.X) < 70) continue;
        if (used.some((u) => Math.abs(u.T - t) < 0.3)) continue;
        const ink = { kind: 'ink', T: t, X: x, h: 20, w: 18, vx: 0 };
        used.push(ink);
        inks.push(ink);
        break;
      }
    }
  }

  const all = items.concat(inks).sort((a, b) => a.T - b.T);
  // stack height under each landing, then the fall that gets there on time
  let hNow = h0;
  for (const it of all) {
    it.hUnder = hNow;
    if (it.kind !== 'ink') hNow += it.h;
    const p = progress(it.T, 60, 1.3);
    it.g = lerp(390, 620, p) * (it.kind === 'atlas' ? 1.2 : 1);
    it.v0 = 20;
    const d = Math.max(30, BASE_Y - it.hUnder - it.h / 2 - HAND_Y);
    const tf = (-it.v0 + Math.sqrt(it.v0 * it.v0 + 2 * it.g * d)) / it.g;
    it.tDrop = it.T - tf;
    it.tf = tf;
    it.hold = lerp(0.95, 0.6, p);
    it.tHold = it.tDrop - it.hold;
    it.x0 = it.X - it.vx * tf;
    if (it.x0 < 30 || it.x0 > 330) {
      it.x0 = clamp(it.x0, 30, 330);
      it.vx = (it.X - it.x0) / tf;
    }
  }

  // gusts from the windows
  const gusts = [];
  let gt = lerp(20, 23, rng.next());
  while (gt < 60) {
    const p = progress(gt, 60, 1.3);
    gusts.push({ t: gt, warn: 1.2, dur: lerp(1.2, 1.6, rng.next()), dir: rng.next() < 0.5 ? -1 : 1, F: lerp(300, 560, p) });
    gt += lerp(7.5, 4.6, p) * lerp(0.85, 1.2, rng.next());
  }
  return { books, items: all, gusts };
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

function paintBook(w, h, col, style, rng) {
  return makeSprite(w + 2, h + 2, (g) => {
    const x0 = -w / 2;
    const y0 = -h / 2;
    if (style === 'atlas') {
      const gr = g.createLinearGradient(0, y0, 0, y0 + h);
      gr.addColorStop(0, shade(col, 0.25));
      gr.addColorStop(0.3, shade(col, 0.05));
      gr.addColorStop(1, shade(col, -0.45));
      g.fillStyle = gr;
      roundRect(g, x0, y0, w, h, 3);
      g.fill();
      // brass corners
      g.fillStyle = '#e8c062';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * (w / 2), y0);
        g.lineTo(sx * (w / 2 - 9), y0);
        g.lineTo(sx * (w / 2), y0 + 7);
        g.fill();
        g.beginPath();
        g.moveTo(sx * (w / 2), y0 + h);
        g.lineTo(sx * (w / 2 - 9), y0 + h);
        g.lineTo(sx * (w / 2), y0 + h - 7);
        g.fill();
      }
      // a gilt globe on the spine
      g.strokeStyle = '#f2d27a';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, h * 0.32, 0, TAU);
      g.moveTo(-h * 0.32, 0);
      g.lineTo(h * 0.32, 0);
      g.moveTo(0, -h * 0.32);
      g.quadraticCurveTo(h * 0.2, 0, 0, h * 0.32);
      g.quadraticCurveTo(-h * 0.2, 0, 0, -h * 0.32);
      g.stroke();
      g.fillStyle = 'rgba(242,210,122,0.85)';
      g.fillRect(-w * 0.36, -1, w * 0.18, 2);
      g.fillRect(w * 0.18, -1, w * 0.18, 2);
    } else if (style === 'edge') {
      // the fore-edge: pages between two covers
      g.fillStyle = shade(col, -0.2);
      roundRect(g, x0, y0, w, h, 2);
      g.fill();
      const pg = g.createLinearGradient(0, y0 + 2, 0, y0 + h - 2);
      pg.addColorStop(0, '#fbf3dc');
      pg.addColorStop(1, '#d9c9a2');
      g.fillStyle = pg;
      g.fillRect(x0 + 3, y0 + 1.8, w - 4, h - 3.6);
      g.strokeStyle = 'rgba(150,120,80,0.35)';
      g.lineWidth = 0.4;
      for (let y = y0 + 3; y < y0 + h - 2; y += 1.3) {
        g.beginPath();
        g.moveTo(x0 + 3, y);
        g.lineTo(x0 + w - 1, y);
        g.stroke();
      }
      g.fillStyle = shade(col, 0.15);
      g.fillRect(x0, y0, w, 1.8);
    } else {
      // a rounded leather or cloth spine
      const gr = g.createLinearGradient(0, y0, 0, y0 + h);
      gr.addColorStop(0, shade(col, -0.25));
      gr.addColorStop(0.3, shade(col, 0.28));
      gr.addColorStop(0.55, col);
      gr.addColorStop(1, shade(col, -0.45));
      g.fillStyle = gr;
      roundRect(g, x0, y0, w, h, Math.min(3, h / 2.5));
      g.fill();
      g.fillStyle = 'rgba(242,206,110,0.9)';
      const bands = rng.next() < 0.5 ? [7, 10] : [6];
      for (const b of bands) {
        g.fillRect(x0 + b, y0 + 0.5, 1.2, h - 1);
        g.fillRect(x0 + w - b - 1.2, y0 + 0.5, 1.2, h - 1);
      }
      if (style === 'label') {
        const lw = w * lerp(0.28, 0.4, rng.next());
        g.fillStyle = shade(col, -0.55);
        g.fillRect(-lw / 2, y0 + h * 0.22, lw, h * 0.56);
        g.strokeStyle = 'rgba(242,206,110,0.9)';
        g.lineWidth = 0.6;
        g.strokeRect(-lw / 2, y0 + h * 0.22, lw, h * 0.56);
        g.fillStyle = 'rgba(242,206,110,0.8)';
        g.fillRect(-lw / 2 + 3, -0.5, lw - 6, 1);
      } else {
        g.fillStyle = 'rgba(255,240,200,0.55)';
        for (let x = x0 + 16; x < x0 + w - 16; x += 3.2) g.fillRect(x, -0.6, 1.6, 1.2);
      }
    }
    g.strokeStyle = 'rgba(30,15,5,0.5)';
    g.lineWidth = 0.6;
    roundRect(g, x0 + 0.3, y0 + 0.3, w - 0.6, h - 0.6, 2);
    g.stroke();
  });
}

function paintInk() {
  return makeSprite(22, 26, (g) => {
    // glass bottle with indigo ink
    const gl = g.createLinearGradient(-9, 0, 9, 0);
    gl.addColorStop(0, '#2a2f6e');
    gl.addColorStop(0.35, '#4b55b8');
    gl.addColorStop(1, '#141640');
    g.fillStyle = gl;
    g.beginPath();
    g.moveTo(-8, -3);
    g.quadraticCurveTo(-9, 10, -6, 11);
    g.lineTo(6, 11);
    g.quadraticCurveTo(9, 10, 8, -3);
    g.quadraticCurveTo(8, -6, 4, -6);
    g.lineTo(-4, -6);
    g.quadraticCurveTo(-8, -6, -8, -3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(-6, -3, 2, 10);
    // label
    g.fillStyle = '#f2e6c8';
    g.fillRect(-5, 1, 10, 6);
    g.fillStyle = '#20245a';
    g.fillRect(-3, 3, 6, 1);
    g.fillRect(-2, 5, 4, 0.8);
    // neck and cork
    g.fillStyle = '#3b44a0';
    g.fillRect(-3.5, -9, 7, 4);
    g.fillStyle = '#b07a44';
    roundRect(g, -3, -12.5, 6, 4.5, 1.5);
    g.fill();
    g.fillStyle = '#d9a46a';
    g.fillRect(-2, -12, 1.5, 3.5);
  });
}

function paintLibrarian() {
  // body from the shoulders down to the knees; the head is drawn on top, arms and legs live
  return makeSprite(44, 46, (g) => {
    // cardigan
    const cg = g.createLinearGradient(-16, 0, 16, 0);
    cg.addColorStop(0, '#a8741c');
    cg.addColorStop(0.45, '#e2a73a');
    cg.addColorStop(1, '#9a6614');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-13, -21);
    g.quadraticCurveTo(-17, -16, -16, 2);
    g.lineTo(-14, 12);
    g.lineTo(14, 12);
    g.lineTo(16, 2);
    g.quadraticCurveTo(17, -16, 13, -21);
    g.closePath();
    g.fill();
    // blouse and collar
    g.fillStyle = '#f7f1e4';
    g.beginPath();
    g.moveTo(-5, -22);
    g.lineTo(5, -22);
    g.lineTo(2, 2);
    g.lineTo(-2, 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-6, -22);
    g.lineTo(0, -17);
    g.lineTo(-2, -14);
    g.lineTo(-7, -19);
    g.closePath();
    g.moveTo(6, -22);
    g.lineTo(0, -17);
    g.lineTo(2, -14);
    g.lineTo(7, -19);
    g.closePath();
    g.fill();
    // buttons
    g.fillStyle = '#6b3d0c';
    for (let y = -10; y <= 6; y += 5.5) {
      g.beginPath();
      g.arc(3.6, y, 1, 0, TAU);
      g.fill();
    }
    // skirt
    const sg = g.createLinearGradient(0, 8, 0, 22);
    sg.addColorStop(0, '#1d5e66');
    sg.addColorStop(1, '#123d44');
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(-14, 9);
    g.lineTo(14, 9);
    g.lineTo(17, 22);
    g.lineTo(-17, 22);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 0.8;
    for (const x of [-8, 0, 8]) {
      g.beginPath();
      g.moveTo(x, 10);
      g.lineTo(x * 1.25, 22);
      g.stroke();
    }
    // a pencil in the pocket
    g.fillStyle = '#f4d23c';
    g.fillRect(-11, -9, 1.6, 8);
    g.fillStyle = '#e88';
    g.fillRect(-11, -10.5, 1.6, 1.6);
  });
}

function paintHead() {
  return makeSprite(30, 30, (g) => {
    // hair back
    g.fillStyle = '#5a3218';
    g.beginPath();
    g.ellipse(0, 0, 12.5, 12, 0, 0, TAU);
    g.fill();
    // face
    const fg = g.createRadialGradient(-2, 1, 1, 0, 2, 11);
    fg.addColorStop(0, '#ffe2c8');
    fg.addColorStop(1, '#e9b28c');
    g.fillStyle = fg;
    g.beginPath();
    g.ellipse(0, 2.5, 9.5, 10, 0, 0, TAU);
    g.fill();
    // fringe
    g.fillStyle = '#6b3c1e';
    g.beginPath();
    g.moveTo(-11, -1);
    g.quadraticCurveTo(-9, -11, 0, -11);
    g.quadraticCurveTo(9, -11, 11, -1);
    g.quadraticCurveTo(5, -6, 1, -4);
    g.quadraticCurveTo(-4, -7, -11, -1);
    g.fill();
    g.fillStyle = 'rgba(255,200,150,0.25)';
    g.beginPath();
    g.ellipse(-4, -8, 4, 1.5, -0.3, 0, TAU);
    g.fill();
    // cheeks
    g.fillStyle = 'rgba(240,120,110,0.35)';
    g.beginPath();
    g.ellipse(-6, 6, 2.6, 1.6, 0, 0, TAU);
    g.ellipse(6, 6, 2.6, 1.6, 0, 0, TAU);
    g.fill();
    // smile
    g.strokeStyle = '#8a3b2a';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 6.5, 2.6, 0.3, Math.PI - 0.3);
    g.stroke();
  });
}

function paintBackground(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // painted ceiling fresco
    const sky = g.createLinearGradient(0, 0, 0, 54);
    sky.addColorStop(0, '#3f6f9e');
    sky.addColorStop(1, '#8fb7d6');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 54);
    for (let i = 0; i < 14; i++) {
      const x = rng.next() * W;
      const y = 10 + rng.next() * 40;
      const r = 8 + rng.next() * 16;
      const cg = g.createRadialGradient(x, y, 1, x, y, r);
      cg.addColorStop(0, 'rgba(255,240,230,0.85)');
      cg.addColorStop(1, 'rgba(255,220,210,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r, 0, 0, TAU);
      g.fill();
    }
    // gilded frame under the fresco
    const gold = (y0, y1) => {
      const gg = g.createLinearGradient(0, y0, 0, y1);
      gg.addColorStop(0, '#fff0b0');
      gg.addColorStop(0.45, '#d6a843');
      gg.addColorStop(1, '#7d5714');
      return gg;
    };
    g.fillStyle = gold(50, 56);
    g.fillRect(0, 50, W, 6);

    // back wall: white and gold bookcases
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 56, W, FLOOR_Y - 56);
    const bays = [[14, 112], [124, 236], [248, 346]];
    for (const [a, b] of bays) {
      // case interior
      g.fillStyle = '#6e5232';
      g.fillRect(a, 104, b - a, FLOOR_Y - 120);
      for (let y = 108; y < FLOOR_Y - 20; y += 44) {
        // books on the shelf
        let x = a + 2;
        while (x < b - 4) {
          const bw = 4 + rng.next() * 5;
          const bh = 26 + rng.next() * 12;
          const c = ['#7a3b2a', '#a8763c', '#d8c49a', '#5b6b3a', '#8a5a2a', '#e6d6b0', '#6a2e2e', '#9c8a5a', '#3f4d5c'][(rng.next() * 9) | 0];
          const lean = rng.next() < 0.06 ? 0.2 : 0;
          g.save();
          g.translate(x + bw / 2, y + 40);
          g.rotate(lean);
          const bg = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
          bg.addColorStop(0, shade(c, -0.25));
          bg.addColorStop(0.4, shade(c, 0.15));
          bg.addColorStop(1, shade(c, -0.35));
          g.fillStyle = bg;
          g.fillRect(-bw / 2, -bh, bw, bh);
          g.fillStyle = 'rgba(240,205,120,0.6)';
          g.fillRect(-bw / 2, -bh + 4, bw, 1);
          g.fillRect(-bw / 2, -6, bw, 1);
          g.restore();
          x += bw + (lean ? 3 : 0.4);
        }
        // shelf board
        g.fillStyle = '#f6efe0';
        g.fillRect(a - 2, y + 40, b - a + 4, 4);
        g.fillStyle = '#c9a24a';
        g.fillRect(a - 2, y + 44, b - a + 4, 1.2);
        g.fillStyle = 'rgba(40,20,5,0.3)';
        g.fillRect(a, y + 45, b - a, 3);
      }
      // arched top of each bay
      g.fillStyle = '#f6efe0';
      g.beginPath();
      g.moveTo(a - 2, 104);
      g.lineTo(a - 2, 96);
      g.quadraticCurveTo((a + b) / 2, 70, b + 2, 96);
      g.lineTo(b + 2, 104);
      g.closePath();
      g.fill();
      g.strokeStyle = '#c9a24a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(a, 100);
      g.quadraticCurveTo((a + b) / 2, 76, b, 100);
      g.stroke();
      // cartouche
      g.fillStyle = gold(80, 92);
      g.beginPath();
      g.ellipse((a + b) / 2, 88, 10, 6, 0, 0, TAU);
      g.fill();
    }
    // pilasters between the bays
    for (const x of [0, 112, 236, 346]) {
      const pw = x === 0 || x === 346 ? 14 : 12;
      const pg = g.createLinearGradient(x, 0, x + pw, 0);
      pg.addColorStop(0, '#d9cdb2');
      pg.addColorStop(0.4, '#fffaf0');
      pg.addColorStop(1, '#cbbd9e');
      g.fillStyle = pg;
      g.fillRect(x, 60, pw, FLOOR_Y - 60);
      g.fillStyle = gold(60, 72);
      g.fillRect(x - 1, 96, pw + 2, 8);
      g.fillStyle = 'rgba(201,162,74,0.7)';
      g.fillRect(x + pw / 2 - 0.6, 110, 1.2, FLOOR_Y - 130);
    }
    // a haze so the stack in front stands out
    const hz = g.createLinearGradient(0, 100, 0, FLOOR_Y);
    hz.addColorStop(0, 'rgba(246,238,222,0.55)');
    hz.addColorStop(1, 'rgba(246,238,222,0.38)');
    g.fillStyle = hz;
    g.fillRect(0, 96, W, FLOOR_Y - 96);

    // the gallery: balustrade across the top
    g.fillStyle = 'rgba(40,25,10,0.25)';
    g.fillRect(0, 96, W, 8);
    for (let x = 6; x < W; x += 15) {
      const bg = g.createLinearGradient(x - 4, 0, x + 4, 0);
      bg.addColorStop(0, '#d8ccb0');
      bg.addColorStop(0.45, '#fffbf2');
      bg.addColorStop(1, '#c4b593');
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(x - 2.5, 62);
      g.lineTo(x + 2.5, 62);
      g.quadraticCurveTo(x + 6, 74, x + 2.5, 84);
      g.lineTo(x - 2.5, 84);
      g.quadraticCurveTo(x - 6, 74, x - 2.5, 62);
      g.fill();
    }
    g.fillStyle = gold(56, 63);
    g.fillRect(0, 56, W, 7);
    g.fillStyle = '#f8f1e2';
    g.fillRect(0, 84, W, 10);
    g.fillStyle = gold(92, 97);
    g.fillRect(0, 92, W, 4);
    g.fillStyle = 'rgba(201,162,74,0.9)';
    for (let x = 4; x < W; x += 8) g.fillRect(x, 87, 3, 3);

    // skirting and parquet floor
    g.fillStyle = '#f4ecdb';
    g.fillRect(0, FLOOR_Y - 8, W, 8);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, FLOOR_Y - 9, W, 1.5);
    const fl = g.createLinearGradient(0, FLOOR_Y, 0, H);
    fl.addColorStop(0, '#9c6634');
    fl.addColorStop(1, '#c4894a');
    g.fillStyle = fl;
    g.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    g.strokeStyle = 'rgba(70,35,10,0.35)';
    g.lineWidth = 0.7;
    for (let x = -40; x < W + 40; x += 14) {
      for (let y = FLOOR_Y; y < H; y += 10) {
        const o = ((y - FLOOR_Y) / 10) % 2 ? 7 : 0;
        g.beginPath();
        g.moveTo(x + o, y);
        g.lineTo(x + o + 7, y + 10);
        g.stroke();
      }
    }
    // crimson runner
    const rg = g.createLinearGradient(0, FLOOR_Y + 6, 0, H);
    rg.addColorStop(0, '#7a1e22');
    rg.addColorStop(1, '#a8302e');
    g.fillStyle = rg;
    g.fillRect(0, FLOOR_Y + 10, W, H - FLOOR_Y - 10);
    g.fillStyle = '#d9a843';
    g.fillRect(0, FLOOR_Y + 12, W, 1.3);
    for (let x = 6; x < W; x += 18) {
      g.beginPath();
      g.moveTo(x, FLOOR_Y + 22);
      g.lineTo(x + 5, FLOOR_Y + 17);
      g.lineTo(x + 10, FLOOR_Y + 22);
      g.lineTo(x + 5, FLOOR_Y + 27);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, FLOOR_Y, W, 3);
  }, 2);
}

function paintWindow() {
  // a sliver of a tall window at the edge of the room, with a crimson curtain
  return makeSprite(36, 230, (g) => {
    const glass = g.createLinearGradient(0, -115, 0, 115);
    glass.addColorStop(0, '#fff6dc');
    glass.addColorStop(1, '#ffd890');
    g.fillStyle = glass;
    g.fillRect(-18, -105, 36, 210);
    g.strokeStyle = 'rgba(160,120,60,0.7)';
    g.lineWidth = 1.5;
    for (let y = -105; y <= 105; y += 30) {
      g.beginPath();
      g.moveTo(-18, y);
      g.lineTo(18, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, -105);
    g.lineTo(0, 105);
    g.stroke();
    // frame
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 3;
    g.strokeRect(-18, -105, 36, 210);
  });
}

function paintCurtain() {
  return makeSprite(24, 240, (g) => {
    const cg = g.createLinearGradient(-12, 0, 12, 0);
    cg.addColorStop(0, '#5e1016');
    cg.addColorStop(0.3, '#b8303a');
    cg.addColorStop(0.55, '#7a1820');
    cg.addColorStop(0.8, '#c23a42');
    cg.addColorStop(1, '#5e1016');
    g.fillStyle = cg;
    g.fillRect(-12, -120, 24, 240);
    g.fillStyle = '#e0b04a';
    g.fillRect(-12, -120, 24, 6);
    for (let x = -10; x < 12; x += 4) {
      g.beginPath();
      g.moveTo(x, 112);
      g.lineTo(x + 2, 120);
      g.lineTo(x + 4, 112);
      g.fill();
    }
  });
}

function paintBeam() {
  return makeSprite(120, 420, (g) => {
    const bg = g.createLinearGradient(-60, 0, 60, 0);
    bg.addColorStop(0, 'rgba(255,220,150,0)');
    bg.addColorStop(0.5, 'rgba(255,220,150,0.16)');
    bg.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = bg;
    g.fillRect(-60, -210, 120, 420);
    const fade = g.createLinearGradient(0, -210, 0, 210);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(-60, -210, 120, 420);
  }, 1);
}

// ---------- the game ----------

export default {
  id: 'shelflife',
  title: 'Shelf Life',
  emoji: '📚',
  tagline: 'Catch every book on your swaying stack. Let ink pass. Don’t topple!',
  colors: { bg: '#24384c', fg: '#ffffff', accent: '#e8b84a' },
  music,

  create({ rng, W, H }) {
    const plan = buildPlan(rng.fork('plan'));
    const art = rng.fork('art');

    // ---- art ----
    const bg = paintBackground(W, H, art);
    const win = paintWindow();
    const curtain = paintCurtain();
    const beam = paintBeam();
    const body = paintLibrarian();
    const head = paintHead();
    const inkArt = paintInk();
    const styles = ['spine', 'label', 'edge', 'spine', 'label'];
    let ci = Math.floor(art.next() * BOOK_COLS.length);
    const bookArt = (b) => {
      ci = (ci + 1 + Math.floor(art.next() * 3)) % BOOK_COLS.length;
      const col = b.kind === 'atlas' ? ['#22503a', '#5a1a22', '#1e2f5a'][Math.floor(art.next() * 3)] : BOOK_COLS[ci];
      return paintBook(b.w, b.h, col, b.kind === 'atlas' ? 'atlas' : styles[Math.floor(art.next() * styles.length)], art);
    };
    for (const b of plan.books) b.art = bookArt(b);
    for (const it of plan.items) if (it.kind !== 'ink') it.art = bookArt(it);
    const glowWarm = glowSprite('rgba(255,210,130,0.55)', 40);
    const glowRed = glowSprite('rgba(255,50,40,0.75)', 40);
    const glowGreen = glowSprite('rgba(120,255,160,0.55)', 40);
    const glowGold = glowSprite('rgba(255,215,110,0.7)', 40);
    const vignette = vignetteSprite(W, H, 0.42, '30,18,8');
    const fx = createParticles();
    const motes = [];
    for (let i = 0; i < 26; i++) motes.push({ x: Math.random() * W, y: 100 + Math.random() * 480, ph: Math.random() * TAU, z: 0.4 + Math.random() * 0.6 });

    // ---- state ----
    const stack = plan.books.map((b) => ({ ...b, o: 0, land: -9 }));
    let hStack = stack.reduce((a, b) => a + b.h, 0);
    let bx = 180; // the librarian
    let bvx = 0;
    let s = 0; // how far the top of the stack leans from straight above the head (px)
    let sv = 0;
    let now = 0;
    let clock = 0;
    let walk = 0;
    let shake = 0;
    let caught = 0;
    let warnLevel = 0;
    let gustNow = 0; // signed force, for drawing
    let ii = 0; // first unresolved item
    const loose = []; // items that missed the stack and fall to the floor
    const flyers = []; // the stack's books after a collapse
    let inkSplat = null;

    const topX = () => bx + s + (stack.length ? stack[stack.length - 1].o : 0);
    const topW = () => (stack.length ? stack[stack.length - 1].w : 60);
    const itemX = (it, t) => it.x0 + it.vx * clamp(t - it.tDrop, 0, it.tf);
    const itemY = (it, t) => {
      const tt = Math.max(0, t - it.tDrop);
      return HAND_Y + it.v0 * tt + 0.5 * it.g * tt * tt;
    };
    const gustForce = (t) => {
      for (const gu of plan.gusts) {
        const a = t - gu.t - gu.warn;
        if (a >= 0 && a < gu.dur) return gu.dir * gu.F * Math.sin((Math.PI * a) / gu.dur);
      }
      return 0;
    };
    const gustWarn = (t) => {
      for (const gu of plan.gusts) {
        const a = t - gu.t;
        if (a >= 0 && a < gu.warn + gu.dur) return { dir: gu.dir, a, warn: gu.warn, dur: gu.dur };
      }
      return null;
    };
    // the stack's books, laid along its bend: centre x, centre y, tilt
    const bookPose = (i, cum, b) => {
      const u = (cum + b.h / 2) / Math.max(hStack, 1);
      return {
        x: bx + s * u * u + b.o,
        y: BASE_Y - cum - b.h / 2,
        rot: Math.atan((2 * s * u) / Math.max(hStack, 1)),
      };
    };

    const collapse = () => {
      let cum = 0;
      const dir = Math.sign(s || bvx || 1);
      for (let i = 0; i < stack.length; i++) {
        const b = stack[i];
        const pz = bookPose(i, cum, b);
        cum += b.h;
        const k = (cum / Math.max(hStack, 1));
        flyers.push({
          x: pz.x,
          y: pz.y,
          rot: pz.rot,
          vx: dir * k * lerp(60, 200, Math.random()) + sv * k * 0.5 + (Math.random() - 0.5) * 60,
          vy: -lerp(20, 160, Math.random()) * k,
          vr: (Math.random() - 0.5) * 8 * k + dir * 2 * k,
          art: b.art,
          w: b.w,
          h: b.h,
          rest: false,
        });
      }
      stack.length = 0;
    };

    const die = (why, culprit) => {
      game.dead = true;
      game.deathReason = why;
      shake = 0.5;
      if (culprit && culprit.kind === 'ink') {
        inkSplat = { x: topX(), y: BASE_Y - hStack, t: clock };
        fx.burst(topX(), BASE_Y - hStack - 4, { count: 50, speed: 240, life: 1.1, size: 5, gravity: 520, drag: 0.6, round: true, colors: ['#20245a', '#3b44a0', '#141640', '#5a64d0'] });
        fx.burst(topX(), BASE_Y - hStack - 4, { count: 12, speed: 160, life: 0.6, size: 3, gravity: 400, colors: ['rgba(220,235,255,0.9)', 'rgba(180,200,255,0.8)'] });
      }
      collapse();
      if (culprit && culprit.kind !== 'ink') {
        flyers.push({ x: culprit.cx, y: culprit.cy, rot: 0, vx: culprit.vx || (Math.random() - 0.5) * 40, vy: 260, vr: (Math.random() - 0.5) * 6, art: culprit.art, w: culprit.w, h: culprit.h, rest: false });
      }
      fx.burst(bx, BASE_Y - 30, { count: 26, speed: 150, life: 1.1, size: 3.5, gravity: 120, drag: 1.4, colors: ['#fbf3dc', '#ffffff', '#efe2c0'] });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.4);
      fx.update(dt);
      for (const m of motes) {
        m.y -= (4 + 6 * m.z) * dt;
        m.x += (Math.sin(clock * 0.6 + m.ph) * 6 + gustNow * 0.06 * m.z) * dt;
        if (m.y < 96) {
          m.y = 590;
          m.x = Math.random() * W;
        }
        if (m.x < -5) m.x = W + 4;
        if (m.x > W + 5) m.x = -4;
      }
      for (const f of flyers) {
        if (f.rest) continue;
        f.vy += 900 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        const floor = FEET_Y - f.h / 2 + (f.x % 7) * 0.6;
        if (f.y > floor) {
          f.y = floor;
          if (Math.abs(f.vy) < 120) {
            f.rest = true;
            f.rot = Math.round(f.rot / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3;
          } else {
            f.vy *= -0.3;
            f.vx *= 0.6;
            f.vr *= 0.5;
            fx.burst(f.x, floor + f.h / 2, { count: 4, speed: 60, life: 0.5, size: 2.5, gravity: 200, colors: ['#fbf3dc', '#d9b98a'] });
          }
        }
        if (f.x < 8 || f.x > W - 8) f.vx = -f.vx * 0.5;
      }
      for (let i = loose.length - 1; i >= 0; i--) {
        const l = loose[i];
        l.vy += l.g * dt;
        l.y += l.vy * dt;
        l.x += l.vx * dt;
        l.rot += l.vr * dt;
        if (l.y > FEET_Y - 6) {
          if (l.kind === 'ink') {
            fx.burst(l.x, FEET_Y - 4, { count: 22, speed: 150, life: 0.8, size: 3.5, gravity: 500, round: true, colors: ['#20245a', '#3b44a0', '#5a64d0'] });
            fx.burst(l.x, FEET_Y - 4, { count: 10, speed: 120, life: 0.5, size: 2, gravity: 500, colors: ['rgba(220,235,255,0.9)'] });
          }
          loose.splice(i, 1);
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { plan, get x() { return bx; }, get vx() { return bvx; }, get s() { return s; }, get sv() { return sv; }, get h() { return hStack; }, get top() { return topX(); }, get ii() { return ii; }, omegaFor, limitFor },

      update(dt, dir, t) {
        now = t;
        updateCosmetic(dt);

        // the librarian walks (a little softer near the walls)
        let target = dir * SPEED;
        if (dir < 0) target *= clamp((bx - X_MIN) / 34, 0.15, 1);
        if (dir > 0) target *= clamp((X_MAX - bx) / 34, 0.15, 1);
        const dv = clamp(target - bvx, -ACC * dt, ACC * dt);
        bvx += dv;
        bx += bvx * dt;
        if (bx < X_MIN) {
          bx = X_MIN;
          bvx = Math.max(0, bvx);
        } else if (bx > X_MAX) {
          bx = X_MAX;
          bvx = Math.min(0, bvx);
        }
        const aBase = dv / dt;
        walk += Math.abs(bvx) * dt;

        // the stack sways: a damped spring, pushed by the head's acceleration and by gusts
        const w = omegaFor(hStack);
        gustNow = gustForce(t);
        const acc = -w * w * s - 2 * ZETA * w * sv - aBase * coupleFor(hStack) + gustNow;
        sv += acc * dt;
        s += sv * dt;
        const lim = limitFor(hStack);
        warnLevel = clamp((Math.abs(s) / lim - 0.55) / 0.45, 0, 1);
        // nothing can topple it in the first seconds
        if (t < 2.4 && Math.abs(s) > lim * 0.9) {
          s = Math.sign(s) * lim * 0.9;
          sv *= 0.5;
        }
        if (Math.abs(s) > lim) {
          die('The stack swayed too far and toppled over.');
          return;
        }

        // items reaching the top of the stack
        while (ii < plan.items.length && plan.items[ii].T <= t) {
          const it = plan.items[ii++];
          const x = itemX(it, it.T);
          const dx = x - topX();
          const tol = catchTol(topW());
          if (it.kind === 'ink') {
            if (Math.abs(dx) < inkTol(topW())) {
              die('Caught an ink pot. Ink all over the books!', it);
              return;
            }
            loose.push({ kind: 'ink', x, y: itemY(it, it.T), vx: it.vx, vy: it.v0 + it.g * it.tf, g: it.g, rot: 0, vr: (Math.random() - 0.5) * 6 });
            continue;
          }
          if (Math.abs(dx) > tol) {
            die(it.kind === 'atlas' ? 'Missed a heavy atlas. It hit the floor.' : 'Missed a book. It hit the floor.', { ...it, cx: x, cy: itemY(it, it.T), vx: it.vx });
            return;
          }
          const top = stack[stack.length - 1];
          const o = clamp((top ? top.o : 0) * 0.45 + dx * 0.7, -15, 15);
          stack.push({ ...it, o, land: clock });
          hStack += it.h;
          caught++;
          // landing off-centre gives the stack a shove (atlases much more)
          sv += dx * (it.kind === 'atlas' ? 4.2 : 1.6) + it.vx * 0.3;
          fx.burst(x, BASE_Y - hStack + it.h, { count: it.kind === 'atlas' ? 14 : 8, speed: 80, life: 0.5, size: 2.5, drag: 2.5, colors: ['rgba(255,250,235,0.9)', 'rgba(240,220,170,0.8)'] });
          fx.burst(x, BASE_Y - hStack + it.h / 2, { count: 6, speed: 110, life: 0.45, size: 2, colors: ['#fff2b0', '#ffd36a'] });
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        s *= 0.98;
      },

      render(g) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);
        g.drawImage(bg.canvas, 0, 0, W, H);

        // windows and curtains at the sides (they billow before a gust)
        const gw = gustWarn(t);
        drawSprite(g, win, 18, 260);
        drawSprite(g, win, W - 18, 260);
        for (const side of [-1, 1]) {
          let billow = Math.sin(clock * 1.3 + side) * 0.02;
          if (gw && gw.dir === -side) {
            // the gust blows in from this side's window
            const e = gw.a < gw.warn ? gw.a / gw.warn : 1 - (gw.a - gw.warn) / gw.dur;
            billow += e * (0.35 + 0.06 * Math.sin(clock * 22));
          }
          g.save();
          g.translate(side < 0 ? 30 : W - 30, 144);
          g.rotate(-side * billow);
          g.drawImage(curtain.canvas, -12, 0, 24, 240);
          g.restore();
        }

        // sunbeams and dust motes
        g.globalCompositeOperation = 'lighter';
        g.save();
        g.translate(70, 330);
        g.rotate(-0.5);
        g.globalAlpha = 0.8 + 0.2 * Math.sin(clock * 0.4);
        g.drawImage(beam.canvas, -60, -210, 120, 420);
        g.restore();
        g.save();
        g.translate(W - 70, 330);
        g.rotate(0.5);
        g.globalAlpha = 0.8 + 0.2 * Math.sin(clock * 0.37 + 1);
        g.drawImage(beam.canvas, -60, -210, 120, 420);
        g.restore();
        g.globalAlpha = 1;
        for (const m of motes) {
          g.fillStyle = `rgba(255,236,190,${0.35 + 0.35 * Math.sin(clock * 1.7 + m.ph) ** 2})`;
          g.fillRect(m.x, m.y, 1.4 * m.z + 0.6, 1.4 * m.z + 0.6);
        }
        g.globalCompositeOperation = 'source-over';

        // gust streaks
        if (gw) {
          const blowing = gw.a >= gw.warn;
          const e = blowing ? Math.sin((Math.PI * (gw.a - gw.warn)) / gw.dur) : gw.a / gw.warn;
          g.strokeStyle = `rgba(255,255,255,${(blowing ? 0.55 : 0.3) * e})`;
          g.lineWidth = 1.5;
          for (let k = 0; k < 9; k++) {
            const y = BASE_Y - hStack * (0.35 + 0.08 * k) + Math.sin(k * 3.1) * 10;
            const span = W + 160;
            const x = ((clock * (blowing ? 420 : 200) + k * 97) % span) - 80;
            const xx = gw.dir > 0 ? x : W - x;
            g.beginPath();
            g.moveTo(xx, y);
            g.quadraticCurveTo(xx - gw.dir * 20, y - 3, xx - gw.dir * 44, y + 1);
            g.stroke();
          }
          if (!blowing) {
            g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(clock * 14)})`;
            g.font = '800 26px sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(gw.dir > 0 ? '»' : '«', gw.dir > 0 ? 54 : W - 54, BASE_Y - hStack * 0.6);
          }
        }

        // the floor shadow and the librarian's legs
        const lean = clamp(bvx / SPEED, -1, 1);
        g.fillStyle = 'rgba(40,10,5,0.35)';
        g.beginPath();
        g.ellipse(bx, FEET_Y + 1, 20, 4.5, 0, 0, TAU);
        g.fill();
        const ph = walk / 9;
        const moving = Math.min(1, Math.abs(bvx) / 60);
        for (const side of [-1, 1]) {
          const sw = Math.sin(ph + (side > 0 ? Math.PI : 0)) * 5 * moving;
          const lift = Math.max(0, -Math.cos(ph + (side > 0 ? Math.PI : 0))) * 2.5 * moving;
          g.strokeStyle = '#2a1a14';
          g.lineWidth = 4.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(bx + side * 5, FEET_Y - 22);
          g.lineTo(bx + side * 5 + sw, FEET_Y - 4 - lift);
          g.stroke();
          g.fillStyle = '#5a2e14';
          g.beginPath();
          g.ellipse(bx + side * 5 + sw + side * 1.5, FEET_Y - 2 - lift, 4.5, 2.5, 0, 0, TAU);
          g.fill();
        }
        g.lineCap = 'butt';

        // body, arms and head
        const bob = Math.abs(Math.sin(ph)) * 1.2 * moving;
        g.save();
        g.translate(bx, FEET_Y - 40 - bob);
        g.rotate(lean * 0.06);
        g.drawImage(body.canvas, -22, -23, 44, 46);
        g.restore();
        const b0 = stack[0];
        const handY = BASE_Y - (b0 ? b0.h / 2 : 5);
        const hw = (b0 ? b0.w / 2 : 30) - 2;
        if (!game.dead) {
          for (const side of [-1, 1]) {
            const sx = bx + side * 13;
            const sy = FEET_Y - 59 - bob;
            const hx = bx + side * hw;
            g.strokeStyle = '#c8901e';
            g.lineWidth = 5.5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(sx, sy);
            g.quadraticCurveTo(sx + side * 12, sy - 6, hx, handY + 1);
            g.stroke();
            g.lineCap = 'butt';
          }
        }
        g.drawImage(head.canvas, bx - 15, FEET_Y - 80 - bob, 30, 30);
        // eyes and glasses (looking at the next book)
        const nxt = plan.items[ii];
        const look = nxt && !game.dead ? clamp((itemX(nxt, t) - bx) / 120, -1, 1) : 0;
        const ey = FEET_Y - 66 - bob;
        for (const side of [-1, 1]) {
          const ex = bx + side * 4.5;
          g.fillStyle = '#2a1a14';
          g.beginPath();
          g.arc(ex + look * 1.2, ey - (game.dead ? -0.5 : 0.8), 1.4, 0, TAU);
          g.fill();
          g.strokeStyle = '#3a2416';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(ex, ey, 3.6, 0, TAU);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(bx - 1, ey);
        g.lineTo(bx + 1, ey);
        g.stroke();
        if (warnLevel > 0.4 && !game.dead) {
          g.fillStyle = 'rgba(160,220,255,0.9)';
          g.beginPath();
          g.ellipse(bx + 10, ey - 6, 1.5, 2.4, 0, 0, TAU);
          g.fill();
        }

        // the stack
        let cum = 0;
        for (let i = 0; i < stack.length; i++) {
          const b = stack[i];
          const pz = bookPose(i, cum, b);
          cum += b.h;
          const sq = clock - b.land < 0.15 ? (1 - (clock - b.land) / 0.15) * 1.5 : 0;
          drawSprite(g, b.art, pz.x, pz.y + sq, { rot: pz.rot, size: b.w + 2 });
        }
        if (stack.length && !game.dead) {
          // hands over the bottom book
          for (const side of [-1, 1]) {
            g.fillStyle = '#f2c7a2';
            g.beginPath();
            g.ellipse(bx + side * hw, handY + 1, 3.6, 4.2, 0, 0, TAU);
            g.fill();
          }
          // danger: the stack glows red as it nears toppling
          if (warnLevel > 0) {
            const tx = bx + s;
            const ty = BASE_Y - hStack;
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, tx, ty + 12, { size: 90 + 40 * warnLevel, alpha: warnLevel * (0.55 + 0.35 * Math.sin(clock * 20)) });
            g.globalCompositeOperation = 'source-over';
            if (warnLevel > 0.35) {
              g.fillStyle = '#ff3b30';
              g.font = '900 20px sans-serif';
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText('!', tx + Math.sign(s) * 22, ty - 14);
            }
          }
        }

        // items: held over the railing, falling, and their landing markers
        const tX = topX();
        const tW = topW();
        for (let i = ii; i < plan.items.length; i++) {
          const it = plan.items[i];
          if (it.tHold > t) break;
          const x = itemX(it, t);
          const y = it.tDrop > t ? HAND_Y + Math.sin(clock * 9 + i) * 0.8 : itemY(it, t);
          const landY = BASE_Y - it.hUnder;
          const lx = it.X;
          // marker on the stack's top level
          if (!game.dead) {
            const ink = it.kind === 'ink';
            const near = Math.abs(lx - tX) < (ink ? inkTol(tW) : catchTol(tW));
            const soon = clamp(1 - (it.T - t) / 1.4, 0, 1);
            // a dotted guide down to it
            g.strokeStyle = ink ? 'rgba(255,70,60,0.35)' : 'rgba(255,220,120,0.4)';
            g.lineWidth = 1.2;
            g.setLineDash([2, 5]);
            g.beginPath();
            g.moveTo(x, y + it.h / 2 + 3);
            if (it.vx) {
              const tt = Math.max(0, t - it.tDrop);
              for (let k = 1; k <= 10; k++) {
                const ft = tt + ((it.tf - tt) * k) / 10;
                g.lineTo(it.x0 + it.vx * ft, HAND_Y + it.v0 * ft + 0.5 * it.g * ft * ft + it.h / 2);
              }
            } else g.lineTo(lx, landY - 6);
            g.stroke();
            g.setLineDash([]);
            if (ink) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, lx, landY - 4, { size: 30 + 20 * soon, alpha: 0.25 + 0.4 * soon });
              g.globalCompositeOperation = 'source-over';
              const r = 5 + (near ? 1.5 : 0);
              g.strokeStyle = 'rgba(40,10,5,0.5)';
              g.lineWidth = near ? 5.5 : 4.5;
              g.beginPath();
              g.moveTo(lx - r, landY - 10 - r);
              g.lineTo(lx + r, landY - 10 + r);
              g.moveTo(lx + r, landY - 10 - r);
              g.lineTo(lx - r, landY - 10 + r);
              g.stroke();
              g.strokeStyle = near ? '#ff2a20' : 'rgba(255,80,70,0.9)';
              g.lineWidth = near ? 3 : 2;
              g.beginPath();
              g.moveTo(lx - r, landY - 10 - r);
              g.lineTo(lx + r, landY - 10 + r);
              g.moveTo(lx + r, landY - 10 - r);
              g.lineTo(lx - r, landY - 10 + r);
              g.stroke();
            } else {
              const col = near ? '120,255,150' : '255,214,100';
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, near ? glowGreen : glowGold, lx, landY - 4, { size: 26 + 26 * soon, alpha: 0.3 + 0.45 * soon });
              g.globalCompositeOperation = 'source-over';
              g.strokeStyle = 'rgba(40,20,5,0.45)';
              g.lineWidth = 4;
              g.strokeRect(lx - it.w / 2, landY - it.h - 1, it.w, it.h);
              g.strokeStyle = `rgba(${col},${0.6 + 0.4 * soon})`;
              g.lineWidth = 2;
              g.setLineDash([4, 3]);
              g.strokeRect(lx - it.w / 2, landY - it.h - 1, it.w, it.h);
              g.setLineDash([]);
              g.fillStyle = `rgba(${col},0.95)`;
              g.strokeStyle = 'rgba(40,20,5,0.6)';
              g.lineWidth = 1.5;
              g.beginPath();
              g.moveTo(lx - 6, landY - it.h - 12);
              g.lineTo(lx + 6, landY - it.h - 12);
              g.lineTo(lx, landY - it.h - 4);
              g.closePath();
              g.stroke();
              g.fill();
            }
          }
          // the item itself
          const spin = it.tDrop > t ? 0 : it.vx ? (t - it.tDrop) * it.vx * 0.012 : Math.sin((t - it.tDrop) * 6 + i) * 0.06;
          if (it.kind === 'ink') {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, x, y, { size: 44, alpha: 0.45 + 0.2 * Math.sin(clock * 10) });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, inkArt, x, y, { rot: spin * 3, size: 22 });
          } else {
            drawSprite(g, it.art, x, y, { rot: spin, size: it.w + 2 });
          }
          // the apprentice's hand at the railing (pulls back after letting go)
          const after = t - it.tDrop;
          if (after < 0.3) {
            const hx = it.x0;
            const up = after > 0 ? after / 0.3 : 0;
            const hy = HAND_Y - it.h / 2 - 4 - up * 20;
            g.fillStyle = '#2b3f78';
            g.fillRect(hx - 5, 50 - up * 10, 10, hy - 50 + up * 10);
            g.fillStyle = '#e9e2d0';
            g.fillRect(hx - 5.5, hy - 4, 11, 3);
            g.fillStyle = '#f2c7a2';
            g.beginPath();
            g.ellipse(hx, hy + 1.5, 5, 4, 0, 0, TAU);
            g.fill();
          }
        }

        // what missed the stack, then the collapse
        for (const l of loose) drawSprite(g, inkArt, l.x, l.y, { rot: l.rot, size: 22 });
        for (const f of flyers) drawSprite(g, f.art, f.x, f.y, { rot: f.rot, size: f.w + 2 });
        if (inkSplat) {
          const a = clamp(1 - (clock - inkSplat.t) / 2, 0, 1);
          g.fillStyle = `rgba(32,36,90,${0.6 * a})`;
          g.beginPath();
          g.ellipse(inkSplat.x, inkSplat.y, 24, 8, 0, 0, TAU);
          g.fill();
        }

        fx.render(g);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowWarm, bx, BASE_Y - hStack * 0.5, { size: 120, alpha: 0.12 });
        g.globalCompositeOperation = 'source-over';
        g.drawImage(vignette.canvas, 0, 0, W, H);

        // books caught
        g.fillStyle = 'rgba(30,12,6,0.55)';
        roundRect(g, W - 60, H - 26, 50, 18, 6);
        g.fill();
        g.fillStyle = '#e8b84a';
        g.fillRect(W - 54, H - 21, 9, 3);
        g.fillStyle = '#b8323a';
        g.fillRect(W - 55, H - 18, 11, 3);
        g.fillStyle = '#1f6f78';
        g.fillRect(W - 54, H - 15, 10, 3);
        g.fillStyle = '#fff4dc';
        g.font = '700 12px sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(String(caught), W - 40, H - 16.5);
        g.restore();
      },
    };
    return game;
  },
};
