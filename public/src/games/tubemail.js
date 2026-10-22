// Tube Mail — a brass message capsule shoots through the pneumatic post tubes under an old city.
// You ride the inside wall of the tube: left and right roll you around it, and the shutters,
// spinning fans and steam pipes rushing at you out of the dark only leave certain openings; be
// lined up with one as it reaches you. The air pressure climbs, so everything comes faster and
// the openings narrow; twin-gap shutters arrive at 9s, steam pipes at 11s, spinning fans at 16s
// and spiral runs of shutters at 26s. Every layout is built around a hidden route that rolls no
// faster than the capsule can, so there is always a way through.

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
import { BODY_FONT } from '../engine/stage.js';

const TAU = Math.PI * 2;
const CX = 180;
const CY = 312;
const R = 214; // the tube's radius on screen at the capsule's depth
const ZFAR = 13; // how far ahead the tube is drawn
const RIB = 0.62; // spacing of the brass rings along the tube
const PH = 0.11; // the capsule's angular half-width
const HIT_PAD = PH * 0.8; // a little forgiving at the edges
const ROT = 3.5; // roll speed, radians per second
const ROT_ACC = 12;
const INNER = 0.6; // obstacles reach from the wall to this fraction of the radius
const PLAYER_R = R - 32;

// distance travelled down the tube: speed rises from V0 to V1 over the minute
const V0 = 5.2;
const V1 = 9.6;
const VC = 1.2;
const speedAt = (t) => V0 + (V1 - V0) * Math.pow(clamp(t / 60, 0, 1), VC);
const sOf = (t) => {
  const u = Math.min(t, 60) / 60;
  const s = V0 * Math.min(t, 60) + ((V1 - V0) * 60 * Math.pow(u, VC + 1)) / (VC + 1);
  return t > 60 ? s + V1 * (t - 60) : s;
};

const wrap = (a) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
};
const norm = (a) => ((a % TAU) + TAU) % TAU;

const gapAt = (p) => lerp(1.45, 0.72, p);
const spacingAt = (p) => lerp(1.25, 0.8, p);
const reachFor = (dt) => Math.min(Math.PI, ROT * Math.max(0, dt - 0.15) * 0.62);

// ---------- the route ----------

function planRoute(rng) {
  const list = [];
  let T = 3;
  let Tp = 0;
  let A = 0;
  let nA = 0;
  const add = (o, at) => {
    o.T = at;
    o.S = sOf(at);
    o.A = nA;
    list.push(o);
  };
  while (T < 63) {
    const p = progress(T, 60, 1.15);
    let reach = reachFor(T - Tp);
    if (T < 8) reach = Math.min(reach, 1.5);
    const gw = gapAt(p) * rng.range(0.92, 1.08) + (T < 9 ? 0.2 : 0);
    const roll = rng.next();
    let kind = 'plate';
    if (T > 26 && roll < 0.18) kind = 'spiral';
    else if (T > 16 && roll < 0.42) kind = 'fan';
    else if (T > 11 && roll < 0.62) kind = 'pipes';
    else if (T > 9 && roll < 0.78) kind = 'twin';
    nA = A + rng.range(-reach, reach);

    if (kind === 'plate') {
      add({ kind, gaps: [{ c: nA, w: gw }] }, T);
    } else if (kind === 'twin') {
      add({ kind: 'plate', gaps: [{ c: nA, w: gw * 0.92 }, { c: nA + Math.PI + rng.range(-0.7, 0.7), w: gw * 0.92 }] }, T);
    } else if (kind === 'pipes') {
      const pw = lerp(0.42, 0.6, p);
      const clear = pw / 2 + PH + 0.22;
      const pipes = [];
      // one pipe right where the last opening was, so standing still is never the answer
      if (Math.abs(wrap(A - nA)) > clear) pipes.push(A);
      const n = rng.int(2, T > 35 ? 5 : 3);
      for (let i = 0; i < n; i++) pipes.push(nA + clear + rng.range(0, TAU - 2 * clear));
      add({ kind, pipes, pw }, T);
    } else if (kind === 'fan') {
      const n = rng.int(2, p > 0.45 ? 4 : 3);
      const ow = Math.min(gw * 1.1, TAU / n - 0.55);
      const omega = (rng.chance(0.5) ? 1 : -1) * lerp(0.9, 2.3, p) * rng.range(0.85, 1.1);
      add({ kind, n, ow, omega, phase: nA }, T);
    } else {
      // a spiral run: shutters in quick succession, each opening a step further round
      const k = rng.int(3, 5);
      const dir = rng.chance(0.5) ? 1 : -1;
      const step = rng.range(0.4, 0.62);
      const sp = lerp(0.46, 0.4, p);
      add({ kind: 'plate', gaps: [{ c: nA, w: gw + 0.15 }] }, T);
      for (let i = 1; i < k; i++) {
        T += sp;
        nA += dir * step;
        add({ kind: 'plate', gaps: [{ c: nA, w: gw + 0.15 }] }, T);
      }
    }
    Tp = T;
    A = nA;
    T += spacingAt(progress(T, 60, 1.15)) * rng.range(0.92, 1.15);
  }
  return list;
}

// the solid parts of an obstacle at time `t`, as [from, to] angle spans in world space
function solids(o, t) {
  if (o.kind === 'pipes') return o.pipes.map((c) => [c - o.pw / 2, c + o.pw / 2]);
  let open;
  if (o.kind === 'fan') {
    open = [];
    const base = o.phase + o.omega * (t - o.T);
    for (let k = 0; k < o.n; k++) open.push({ c: base + (k * TAU) / o.n, w: o.ow });
  } else open = o.gaps;
  const sorted = open.map((g) => ({ c: norm(g.c), w: g.w })).sort((a, b) => a.c - b.c);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const from = a.c + a.w / 2;
    let to = b.c - b.w / 2;
    if (i === sorted.length - 1) to += TAU;
    if (to > from + 0.01) out.push([from, to]);
  }
  return out;
}

function blockedAt(o, theta, t) {
  for (const [a1, a2] of solids(o, t)) {
    const half = (a2 - a1) / 2;
    if (Math.abs(wrap(theta - (a1 + a2) / 2)) < half + HIT_PAD) return true;
  }
  return false;
}

// ---------- art ----------

function paintCapsule() {
  // seen from behind and a little above, nose pointing down the tube: a rounded brass pill with
  // little copper fins, a porthole showing the letter inside, and a ridged rear cap
  return makeSprite(64, 82, (g) => {
    const top = -32;
    const bot = 22;
    const wt = 12;
    const wb = 19;
    // soft contact shadow on the tube wall
    const sh = g.createRadialGradient(0, bot + 9, 2, 0, bot + 9, 26);
    sh.addColorStop(0, 'rgba(10,6,2,0.55)');
    sh.addColorStop(1, 'rgba(10,6,2,0)');
    g.fillStyle = sh;
    g.beginPath();
    g.ellipse(0, bot + 9, 26, 9, 0, 0, TAU);
    g.fill();
    // copper fins on both flanks, near the rear
    for (const sd of [-1, 1]) {
      const fin = g.createLinearGradient(sd * wb, 0, sd * (wb + 9), 0);
      fin.addColorStop(0, '#7a3418');
      fin.addColorStop(0.5, '#e0874a');
      fin.addColorStop(1, '#8a3c1a');
      g.fillStyle = fin;
      g.beginPath();
      g.moveTo(sd * (wb - 3), bot - 20);
      g.quadraticCurveTo(sd * (wb + 9), bot - 8, sd * (wb + 9), bot + 2);
      g.lineTo(sd * (wb - 1), bot + 1);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,214,170,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(sd * (wb - 2), bot - 19);
      g.quadraticCurveTo(sd * (wb + 8), bot - 8, sd * (wb + 8.5), bot + 1);
      g.stroke();
    }
    // the body: sides that bulge gently and round off into the nose
    const body = g.createLinearGradient(-wb, 0, wb, 0);
    body.addColorStop(0, '#4a2c0c');
    body.addColorStop(0.18, '#b8842c');
    body.addColorStop(0.34, '#ffe9a6');
    body.addColorStop(0.42, '#fff8dc');
    body.addColorStop(0.52, '#e3b04c');
    body.addColorStop(0.8, '#94621c');
    body.addColorStop(1, '#3e240a');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-wb, bot);
    g.bezierCurveTo(-wb - 1, bot - 22, -wt - 2, top + 10, -wt, top + 2);
    g.bezierCurveTo(-wt + 1, top - 9, wt - 1, top - 9, wt, top + 2);
    g.bezierCurveTo(wt + 2, top + 10, wb + 1, bot - 22, wb, bot);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,22,6,0.8)';
    g.lineWidth = 1;
    g.stroke();
    // a bright specular streak down the left shoulder, and a cooler rim light on the right
    g.strokeStyle = 'rgba(255,255,240,0.75)';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-wt + 4, top + 1);
    g.bezierCurveTo(-wt + 2, top + 16, -wb + 5, bot - 18, -wb + 5, bot - 5);
    g.stroke();
    g.strokeStyle = 'rgba(190,240,225,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(wt - 1, top + 4);
    g.bezierCurveTo(wt + 1, top + 16, wb - 1, bot - 18, wb - 1, bot - 3);
    g.stroke();
    // nose highlight
    const nose = g.createRadialGradient(-3, top - 2, 0.5, -2, top, 9);
    nose.addColorStop(0, 'rgba(255,255,245,0.95)');
    nose.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = nose;
    g.beginPath();
    g.arc(-2, top, 9, 0, TAU);
    g.fill();
    // riveted copper bands
    for (const y of [top + 7, bot - 7]) {
      const w = lerp(wt + 1, wb, (y - top) / (bot - top)) + 0.5;
      const band = g.createLinearGradient(-w, 0, w, 0);
      band.addColorStop(0, '#4a1a0a');
      band.addColorStop(0.35, '#d8743c');
      band.addColorStop(0.45, '#ffc49a');
      band.addColorStop(0.7, '#a24a20');
      band.addColorStop(1, '#3a1406');
      g.fillStyle = band;
      g.beginPath();
      g.roundRect(-w, y - 2.5, w * 2, 5, 2);
      g.fill();
      g.fillStyle = 'rgba(255,230,200,0.9)';
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.arc((i * w) / 2.6, y, 0.8, 0, TAU);
        g.fill();
      }
    }
    // the porthole: a thick brass bezel, dark glass, and the letter with its red wax seal
    const py = top + 21;
    const bez = g.createLinearGradient(-8, py - 8, 8, py + 8);
    bez.addColorStop(0, '#fff2c0');
    bez.addColorStop(0.5, '#b07a26');
    bez.addColorStop(1, '#4a2c0c');
    g.fillStyle = bez;
    g.beginPath();
    g.arc(0, py, 8.5, 0, TAU);
    g.fill();
    const glass = g.createRadialGradient(-2, py - 2, 1, 0, py, 7);
    glass.addColorStop(0, '#3c6a62');
    glass.addColorStop(1, '#12261f');
    g.fillStyle = glass;
    g.beginPath();
    g.arc(0, py, 6.6, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(0, py, 6.6, 0, TAU);
    g.clip();
    g.translate(0, py + 0.5);
    g.rotate(-0.12);
    g.fillStyle = '#fbf3df';
    g.fillRect(-5.5, -3.6, 11, 7.2);
    g.strokeStyle = 'rgba(140,110,80,0.8)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-5.5, -3.6);
    g.lineTo(0, 0.6);
    g.lineTo(5.5, -3.6);
    g.stroke();
    g.fillStyle = '#d0312f';
    g.beginPath();
    g.arc(0, 0.6, 1.6, 0, TAU);
    g.fill();
    g.restore();
    // glass glint
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-2.6, py - 3, 2.4, 1.1, -0.6, 0, TAU);
    g.fill();
    // the rear cap, nearest to us, with turned rings and a handle
    const cap = g.createRadialGradient(-6, bot - 3, 1, 0, bot, wb + 2);
    cap.addColorStop(0, '#fff6d0');
    cap.addColorStop(0.45, '#dcaa44');
    cap.addColorStop(1, '#5a3510');
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, bot, wb + 1, 8.5, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#3b230a';
    g.lineWidth = 1.2;
    g.stroke();
    g.strokeStyle = 'rgba(80,48,12,0.55)';
    g.lineWidth = 0.6;
    for (const k of [0.78, 0.56]) {
      g.beginPath();
      g.ellipse(0, bot, (wb + 1) * k, 8.5 * k, 0, 0, TAU);
      g.stroke();
    }
    const hub = g.createRadialGradient(-1.5, bot - 1.5, 0.3, 0, bot, 5);
    hub.addColorStop(0, '#fff4c8');
    hub.addColorStop(1, '#8a5a18');
    g.fillStyle = hub;
    g.beginPath();
    g.ellipse(0, bot, 5, 2.8, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#4a2e0e';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-3.5, bot);
    g.lineTo(3.5, bot);
    g.stroke();
    // green felt buffer ring along the lower lip
    g.strokeStyle = '#2f6a58';
    g.lineWidth = 2.2;
    g.beginPath();
    g.ellipse(0, bot, wb + 1, 8.5, 0, 0.12, Math.PI - 0.12);
    g.stroke();
    g.strokeStyle = 'rgba(160,230,200,0.4)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.ellipse(0, bot + 0.6, wb + 0.5, 8, 0, 0.5, Math.PI - 0.5);
    g.stroke();
  });
}

function paintGauge() {
  return makeSprite(64, 64, (g) => {
    const bez = g.createLinearGradient(-30, -30, 30, 30);
    bez.addColorStop(0, '#fff0b0');
    bez.addColorStop(0.5, '#b0802a');
    bez.addColorStop(1, '#4a2e0e');
    g.fillStyle = bez;
    g.beginPath();
    g.arc(0, 0, 30, 0, TAU);
    g.fill();
    const face = g.createRadialGradient(-6, -8, 2, 0, 0, 25);
    face.addColorStop(0, '#fffbea');
    face.addColorStop(1, '#d9ccaa');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, 0, 25, 0, TAU);
    g.fill();
    // red zone
    g.strokeStyle = '#c83a2a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 21, -Math.PI * 0.05, Math.PI * 0.25);
    g.stroke();
    g.strokeStyle = '#3a2a18';
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      g.lineWidth = i % 5 ? 0.8 : 1.6;
      g.beginPath();
      g.moveTo(Math.cos(a) * 23, Math.sin(a) * 23);
      g.lineTo(Math.cos(a) * (i % 5 ? 19.5 : 17), Math.sin(a) * (i % 5 ? 19.5 : 17));
      g.stroke();
    }
    g.fillStyle = '#3a2a18';
    g.font = `700 6px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.fillText('ATM', 0, 13);
  });
}

function paintPlateRivet() {
  return makeSprite(8, 8, (g) => {
    const r = g.createRadialGradient(-1, -1, 0.3, 0, 0, 3.5);
    r.addColorStop(0, '#fff2c0');
    r.addColorStop(0.6, '#a07a38');
    r.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(0, 0, 3.5, 0, TAU);
    g.fill();
  });
}

// colours: [r, g, b]
const FOG = [7, 12, 11];
const mix = (c, f, k = 1) => {
  const r = Math.round(lerp(c[0] * k, FOG[0], f));
  const gg = Math.round(lerp(c[1] * k, FOG[1], f));
  const b = Math.round(lerp(c[2] * k, FOG[2], f));
  return `rgb(${r},${gg},${b})`;
};
const WALLS = [
  // brass sections and green copper sections take turns down the line
  { a: [150, 104, 44], b: [118, 80, 32], rib: [255, 214, 120], seam: [60, 38, 12] },
  { a: [64, 132, 112], b: [48, 104, 90], rib: [170, 240, 200], seam: [16, 46, 38] },
];
const SECTION = 34;

// ---------- the game ----------

export default {
  id: 'tubemail',
  title: 'Tube Mail',
  emoji: '📨',
  tagline: 'Roll around the tube to line up with each opening. Any hit ends it.',
  colors: { bg: '#10201b', fg: '#f8e9c4', accent: '#e8ad3e' },

  // Big beat in E minor, 136 BPM: a broken breakbeat kick and snare under a fat, filtered
  // sawtooth bass riff from bar one, then brassy square chord stabs and claps, then a screaming
  // sawtooth "siren" lead with echoes, and a finale with four-on-the-floor kicks, a pink-noise
  // riser, 16th hats, a 16th arpeggio and the lead doubled an octave down. 34 bars = 60s.
  music: {
    cps: 34 / 60,
    setup: `
      const kick = note("e2 ~ ~ ~ ~ ~ ~ e2 ~ ~ e2 ~ ~ ~ ~ ~").s("sine").decay(0.25).sustain(0).gain(0.8)
      const kick4 = note("e2 ~ ~ ~ e2 ~ ~ e2 e2 ~ e2 ~ e2 ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const snare = s("~ ~ ~ ~ white ~ ~ ~ ~ ~ ~ ~ white ~ ~ ~").decay(0.16).sustain(0).hpf(1200).lpf(6000).gain(0.2).room(0.2)
      const ghost = s("~ ~ ~ ~ ~ ~ ~ white ~ white ~ ~ ~ ~ ~ white").decay(0.06).sustain(0).hpf(1800).lpf(5000).gain(0.07)
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1400).lpf(5000).gain(0.11).room(0.3)
      const hats = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.025 0.05]*4")
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const riser = s("pink*16").decay(0.06).sustain(0).lpf(saw.range(600, 5000).slow(9)).gain(saw.range(0.01, 0.05).slow(9))
      const bass = note("<[e2 ~ e2 g2 ~ e2 ~ d3 ~ e2 ~ b2 ~ a2 g2 ~] [e2 ~ e2 g2 ~ e2 ~ d3 ~ e2 ~ b2 d3 ~ b2 a2] [c3 ~ c3 e3 ~ c3 ~ g3 ~ c3 ~ e3 ~ d3 c3 ~] [d3 ~ d3 fs3 ~ d3 ~ a3 ~ b2 ~ b2 d3 ~ b2 ~]>")
        .s("sawtooth").decay(0.18).sustain(0.35).release(0.05).lpf(saw.range(500, 1500).slow(34)).gain(0.36)
      const chords = "<[e4,g4,b4] [e4,g4,b4] [c4,e4,g4] [d4,fs4,a4]>"
      const stabs = note(chords).struct("~ x ~ ~ ~ x ~ x ~ ~ ~ x ~ ~ x ~").s("square").decay(0.12).sustain(0)
        .lpf(saw.range(1200, 2600).slow(34)).gain(0.07).room(0.2).pan(0.4)
      const tune = "<[b4 ~ ~ e5 ~ ~ d5 b4 ~ ~ a4 ~ b4 ~ ~ ~] [b4 ~ ~ e5 ~ ~ g5 fs5 ~ e5 ~ d5 e5 ~ ~ ~] [g5 ~ ~ e5 ~ ~ c5 e5 ~ ~ g5 ~ a5 ~ g5 ~] [fs5 ~ ~ d5 ~ ~ a4 d5 ~ fs5 ~ e5 d5 ~ b4 ~]>"
      const lead = note(tune).s("sawtooth").decay(0.22).sustain(0.3).release(0.08).lpf(2600).gain(0.075)
        .delay(0.25).delaytime(0.33).delayfeedback(0.3).pan(0.58)
      const lead2 = note(tune).add(note(-12)).s("square").decay(0.2).sustain(0.25).release(0.05).lpf(1500).gain(0.05).pan(0.42)
      const arp = note("<[e5 g5 b5 g5]*4 [e5 g5 b5 g5]*4 [c5 e5 g5 e5]*4 [d5 fs5 a5 fs5]*4>")
        .s("triangle").decay(0.08).sustain(0).lpf(3800).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, bass)],
      [8, stack(kick, snare, ghost, clap, hats, bass, stabs)],
      [9, stack(kick, snare, ghost, clap, hats, bass, stabs, lead)],
      [9, stack(kick4, snare, ghost, clap, hats16, riser, bass, stabs, lead, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const route = planRoute(rng.fork('route'));
    const capsule = paintCapsule();
    const gauge = paintGauge();
    const rivet = paintPlateRivet();
    const lampGlow = glowSprite('rgba(255,196,110,1)', 40);
    const endGlow = glowSprite('rgba(255,236,190,1)', 90);
    const redGlow = glowSprite('rgba(255,90,50,1)', 20);
    const steamGlow = glowSprite('rgba(230,240,235,0.9)', 16);
    const vignette = vignetteSprite(W, H, 0.6, '4,10,8');
    // the curve of the tube wall: the near wall falls away into shadow towards the screen edges
    const shade = makeSprite(W * 2, H * 2, (g) => {
      const gr = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 2.1);
      gr.addColorStop(0, 'rgba(6,10,8,0)');
      gr.addColorStop(1, 'rgba(6,10,8,0.75)');
      g.fillStyle = gr;
      g.fillRect(-W, -H, W * 2, H * 2);
    }, 0.5);
    const sparks = createParticles();
    const debris = createParticles();

    let theta = 0; // the capsule's angle round the tube (the camera rolls with it)
    let omega = 0;
    let s = 0;
    let next = 0;
    let now = 0;
    let clock = 0;
    let flash = 0;
    let speed = V0;
    let passGlow = 0;

    // cosmetic speed streaks along the walls
    const streaks = [];
    for (let i = 0; i < 34; i++) streaks.push({ a: Math.random() * TAU, S: Math.random() * ZFAR, len: 0.5 + Math.random() * 0.8 });

    const center = (z) => {
      const u = clamp((z - 1) / (ZFAR - 1), 0, 1);
      const k = u * u;
      return [CX + 58 * Math.sin(s * 0.041 + 1) * k, CY + (-34 + 26 * Math.sin(s * 0.029)) * k];
    };
    const radius = (z) => R / z;
    const scr = (a) => a - theta + Math.PI / 2;
    const fogAt = (z) => clamp(1 - Math.exp(-(z - 0.7) * 0.36), 0, 1);
    const fogObs = (z) => fogAt(z) * 0.55;

    const die = (game, o) => {
      game.dead = true;
      game.deathReason =
        o.kind === 'fan' ? 'Chopped by a spinning fan.' : o.kind === 'pipes' ? 'Clipped a steam pipe.' : 'Slammed into a shutter.';
      flash = 1;
      const px = CX;
      const py = CY + PLAYER_R;
      sparks.burst(px, py, { count: 50, speed: 340, life: 0.9, size: 3, colors: ['#ffe9a8', '#ffb43a', '#ff7a2a', '#ffffff'], drag: 1.5, gravity: 260 });
      debris.burst(px, py - 10, { count: 22, speed: 220, life: 1.6, size: 7, colors: ['#f4ead2', '#e8dcc0', '#fffaf0'], drag: 1.2, gravity: 180, angle: -Math.PI / 2, spread: 2.6 });
      debris.burst(px, py, { count: 10, speed: 160, life: 1.4, size: 5, colors: ['#d9a43c', '#8a5a1a', '#c0262b'], drag: 1, gravity: 300 });
    };

    const cosmetic = (dt, moving) => {
      clock += dt;
      flash = Math.max(0, flash - dt * 2.5);
      passGlow = Math.max(0, passGlow - dt * 4);
      if (moving) {
        for (const st of streaks) {
          if (st.S - s + 1 < 0.5) {
            st.S = s + ZFAR * (0.6 + Math.random() * 0.5);
            st.a = Math.random() * TAU;
          }
        }
      }
      sparks.update(dt);
      debris.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        omega += (-dir * ROT - omega) * Math.min(1, ROT_ACC * dt);
        theta += omega * dt;
        speed = speedAt(t);
        now = t + dt;
        s = sOf(now);
        while (next < route.length && route[next].S <= s) {
          const o = route[next];
          if (blockedAt(o, theta, t + dt)) {
            die(this, o);
            return;
          }
          passGlow = 1;
          next++;
        }
        cosmetic(dt, true);
        // the capsule's felt scrapes the wall when rolling hard
        if (Math.abs(omega) > ROT * 0.6 && Math.random() < 0.6) {
          const side = omega > 0 ? 1 : -1;
          sparks.burst(CX + side * 18, CY + PLAYER_R + 20, { count: 1, speed: 120, angle: Math.PI / 2 + side * 0.9, spread: 0.6, life: 0.35, size: 2, colors: ['#ffd27a', '#ffffff'], gravity: 400 });
        }
      },

      afterlife(dt) {
        cosmetic(dt, false);
      },

      render(g) {
        g.fillStyle = '#0a1210';
        g.fillRect(0, 0, W, H);

        // ---- the tube wall: concentric bands from near to far ----
        const first = Math.floor((s - 0.6) / RIB) + 1; // first rib with z > 0.4
        const ribs = [];
        for (let j = first; ; j++) {
          const S = j * RIB;
          const z = S - s + 1;
          if (z > ZFAR) break;
          if (z < 0.4) continue;
          ribs.push({ j, S, z });
        }
        const wallOf = (j) => WALLS[Math.abs(Math.floor((j * RIB) / SECTION)) % 2];
        const band = (j) => (Math.abs(j) % 2 ? wallOf(j).b : wallOf(j).a);
        g.fillStyle = mix(band(first - 1), 0, 0.9);
        g.fillRect(0, 0, W, H);
        for (const rb of ribs) {
          const [x, y] = center(rb.z);
          g.fillStyle = mix(band(rb.j), fogAt(rb.z));
          g.beginPath();
          g.arc(x, y, radius(rb.z), 0, TAU);
          g.fill();
        }
        {
          const [x, y] = center(ZFAR);
          g.fillStyle = mix([20, 30, 26], 0.6);
          g.beginPath();
          g.arc(x, y, radius(ZFAR), 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, endGlow, x, y, { size: 190 + 12 * Math.sin(clock * 3), alpha: 0.75 });
          g.globalCompositeOperation = 'source-over';
        }
        // brass rings
        for (const rb of ribs) {
          const [x, y] = center(rb.z);
          const w = wallOf(rb.j);
          const f = fogAt(rb.z);
          g.strokeStyle = mix(w.rib, f, 0.8);
          g.lineWidth = Math.max(0.6, 4 / rb.z);
          g.beginPath();
          g.arc(x, y, radius(rb.z) - 2 / rb.z, 0, TAU);
          g.stroke();
        }
        // seams running along the tube, so the roll is easy to feel
        g.lineWidth = 2;
        for (let k = 0; k < 8; k++) {
          const a = scr((k * TAU) / 8 + 0.2);
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          g.strokeStyle = k % 2 ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.5)';
          g.beginPath();
          ribs.forEach((rb, i) => {
            const [x, y] = center(rb.z);
            const r = radius(rb.z);
            if (i) g.lineTo(x + ca * r, y + sa * r);
            else g.moveTo(x + ca * r, y + sa * r);
          });
          g.stroke();
          // rivets where seams cross the nearest rings
          if (k % 2 === 0) {
            for (const rb of ribs) {
              if (rb.z > 4.5) break;
              const [x, y] = center(rb.z);
              const r = radius(rb.z) - 3 / rb.z;
              drawSprite(g, rivet, x + ca * r, y + sa * r, { size: 9 / rb.z, alpha: 1 - fogAt(rb.z) });
            }
          }
        }
        drawSprite(g, shade, CX, CY);
        // lamps along the wall
        g.globalCompositeOperation = 'lighter';
        const l0 = Math.floor((s - 0.5) / 5) + 1;
        for (let m = l0; m < l0 + 4; m++) {
          const z = m * 5 + 2 - s + 1;
          if (z < 0.5 || z > ZFAR) continue;
          const [x, y] = center(z);
          const a = scr(m * 2.39);
          const r = radius(z) * 0.94;
          drawSprite(g, lampGlow, x + Math.cos(a) * r, y + Math.sin(a) * r, { size: 160 / z, alpha: 0.85 * (1 - fogAt(z)) });
        }
        // speed streaks
        g.lineCap = 'round';
        for (const st of streaks) {
          const z1 = st.S - s + 1;
          const z2 = z1 + st.len;
          if (z1 < 0.5 || z2 > ZFAR) continue;
          const a = scr(st.a);
          const [x1, y1] = center(z1);
          const [x2, y2] = center(z2);
          const r1 = radius(z1) * 0.92;
          const r2 = radius(z2) * 0.92;
          g.strokeStyle = `rgba(255,226,170,${(0.32 * (1 - fogAt(z1))).toFixed(3)})`;
          g.lineWidth = Math.max(0.6, 2.4 / z1);
          g.beginPath();
          g.moveTo(x1 + Math.cos(a) * r1, y1 + Math.sin(a) * r1);
          g.lineTo(x2 + Math.cos(a) * r2, y2 + Math.sin(a) * r2);
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';

        // ---- obstacles: far ones first, the capsule, then whatever has just gone past ----
        const visible = [];
        for (let i = Math.max(0, next - 2); i < route.length; i++) {
          const z = route[i].S - s + 1;
          if (z > ZFAR) break;
          if (z > 0.42) visible.push([route[i], z]);
        }
        const drawObstacle = (o, z) => {
          const [x, y] = center(z);
          const ro = radius(z);
          const ri = ro * INNER;
          const f = fogObs(z);
          const fadeIn = clamp((ZFAR - z) / 1.5, 0, 1);
          const fadeOut = z < 1 ? clamp((z - 0.42) / 0.5, 0, 1) : 1;
          g.globalAlpha = fadeIn * fadeOut;
          const spans = solids(o, now);
          if (o.kind === 'fan') {
            // hub and spokes
            g.strokeStyle = mix([90, 104, 112], f);
            g.lineWidth = Math.max(1, 5 / z);
            g.beginPath();
            for (const [a1, a2] of spans) {
              const a = scr((a1 + a2) / 2);
              g.moveTo(x, y);
              g.lineTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri);
            }
            g.stroke();
            g.fillStyle = mix([150, 160, 166], f);
            g.beginPath();
            g.arc(x, y, ro * 0.1, 0, TAU);
            g.fill();
            g.fillStyle = mix([200, 60, 40], f);
            g.beginPath();
            g.arc(x, y, ro * 0.04, 0, TAU);
            g.fill();
          }
          for (const [a1, a2] of spans) {
            const s1 = scr(a1);
            const s2 = scr(a2);
            if (o.kind === 'pipes') {
              // a copper steam pipe across the wall
              const grad = g.createRadialGradient(x, y, ri, x, y, ro);
              grad.addColorStop(0, mix([150, 60, 36], f));
              grad.addColorStop(0.5, mix([230, 120, 70], f));
              grad.addColorStop(1, mix([110, 40, 24], f));
              g.fillStyle = grad;
            } else if (o.kind === 'fan') {
              g.fillStyle = mix([88, 106, 118], f);
            } else {
              const grad = g.createRadialGradient(x, y, ri, x, y, ro);
              grad.addColorStop(0, mix([70, 72, 66], f));
              grad.addColorStop(0.55, mix([44, 46, 42], f));
              grad.addColorStop(1, mix([26, 28, 26], f));
              g.fillStyle = grad;
            }
            g.beginPath();
            g.arc(x, y, ro, s1, s2);
            g.arc(x, y, ri, s2, s1, true);
            g.closePath();
            g.fill();
            // bevelled rims
            g.strokeStyle = o.kind === 'pipes' ? mix([255, 190, 140], f) : o.kind === 'fan' ? mix([210, 225, 235], f) : mix([200, 160, 90], f);
            g.lineWidth = Math.max(0.7, 2.5 / z);
            g.beginPath();
            g.arc(x, y, ri, s1, s2);
            g.stroke();
            if (o.kind === 'pipes') {
              // flanges at both ends of the pipe
              g.strokeStyle = mix([80, 40, 26], f);
              g.lineWidth = Math.max(1, 5 / z);
              g.beginPath();
              for (const a of [s1 + 0.04, s2 - 0.04]) {
                g.moveTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri);
                g.lineTo(x + Math.cos(a) * ro, y + Math.sin(a) * ro);
              }
              g.stroke();
            } else {
              // amber hazard edges
              g.strokeStyle = o.kind === 'fan' ? mix([255, 90, 60], f) : mix([255, 180, 58], f);
              g.lineWidth = Math.max(1, 6 / z);
              g.beginPath();
              for (const a of [s1, s2]) {
                g.moveTo(x + Math.cos(a) * ri, y + Math.sin(a) * ri);
                g.lineTo(x + Math.cos(a) * ro, y + Math.sin(a) * ro);
              }
              g.stroke();
              if (o.kind === 'plate' && z < 6) {
                const rm = (ro + ri) / 2;
                const n = Math.floor((a2 - a1) / 0.32);
                for (let i = 1; i < n; i++) {
                  const a = s1 + ((s2 - s1) * i) / n;
                  drawSprite(g, rivet, x + Math.cos(a) * rm, y + Math.sin(a) * rm, { size: 12 / z, alpha: (1 - f) * g.globalAlpha });
                }
              }
            }
          }
          // warning lights at the edges of every opening, and steam from the pipes
          g.globalCompositeOperation = 'lighter';
          const rm = ri + (ro - ri) * 0.55;
          for (const [a1, a2] of spans) {
            for (const a of [scr(a1), scr(a2)]) {
              const blink = o.kind === 'pipes' ? steamGlow : redGlow;
              const k = o.kind === 'pipes' ? 0.35 + 0.2 * Math.sin(clock * 9 + a1 * 5) : 0.55 + 0.35 * Math.sin(clock * 10 + a1 * 3);
              drawSprite(g, blink, x + Math.cos(a) * rm, y + Math.sin(a) * rm, { size: 60 / z, alpha: k * (1 - f) * fadeIn * fadeOut });
            }
          }
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        };
        for (let i = visible.length - 1; i >= 0; i--) if (visible[i][1] >= 1) drawObstacle(...visible[i]);

        // ---- the capsule ----
        if (!this.dead) {
          const py = CY + PLAYER_R;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, lampGlow, CX, py + 8, { size: 110, alpha: 0.28 + passGlow * 0.3 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, capsule, CX, py, { rot: -omega * 0.05 + Math.sin(clock * 30) * 0.01 });
        }
        sparks.render(g, true);
        debris.render(g);

        for (let i = visible.length - 1; i >= 0; i--) if (visible[i][1] < 1) drawObstacle(...visible[i]);

        // ---- pressure gauge ----
        const gx = 40;
        const gy = H - 40;
        drawSprite(g, gauge, gx, gy);
        const k = (speed - V0) / (V1 - V0);
        const na = Math.PI * 0.75 + (0.15 + k * 0.8) * Math.PI * 1.5 + Math.sin(clock * 40) * 0.015;
        g.strokeStyle = '#b02a1e';
        g.lineWidth = 1.8;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(gx, gy);
        g.lineTo(gx + Math.cos(na) * 19, gy + Math.sin(na) * 19);
        g.stroke();
        g.fillStyle = '#3a2a18';
        g.beginPath();
        g.arc(gx, gy, 2.5, 0, TAU);
        g.fill();

        drawSprite(g, vignette, W / 2, H / 2);
        if (flash > 0) {
          g.fillStyle = `rgba(255,230,190,${(flash * 0.5).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
        }
      },
    };
    return game;
  },
};
