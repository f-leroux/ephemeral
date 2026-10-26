// Bird of Paradise — a dance-off on a rainforest branch at dawn. A showy red rival dances a
// little routine of hops on its branch for one bar of the song, then it's your turn: copy it on
// the next bar, hop for hop and on the same beats, to win over the plain brown female watching
// from above. Every hop is a tap of ← or →; a wrong way, an extra hop, a missed step or a hop off
// the beat ends the dance. Routines get longer and quicker (eighth-note hops from ~9s), and from
// ~20s "mirror" rounds ask for the opposite of every hop. Taps during the rival's bar are free
// (practise along). Your turn always opens with a free beat (counted in on the track) before the
// first hop, and rings on the track mark the beats to hop on. Every routine is planned up front from the rng, so it's the same show for all.

import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';
import { BODY_FONT } from '../engine/stage.js';

const CPS = 0.55; // the song: one bar per cycle, 132 BPM
const BEAT = 1 / (4 * CPS);
const BAR = 4 * BEAT;
const SLOT = BEAT / 2; // routines live on an eighth-note grid, 8 slots per bar
const ROUNDS = 16; // bar 0 is the intro, then 16 × (rival's bar + your bar) = 33 bars = 60s
const COUNTS = [2, 2, 3, 3, 3, 4, 3, 4, 4, 3, 4, 4, 4, 4, 4, 4];
const FIRST_SLOT = 2; // a beat to settle in at the start of every turn before the first hop
const OFFBEATS_FROM = 2; // first round with eighth-note hops
const MIRROR_FROM = 5; // first mirror round
const PERCH = 44; // spacing of the spots along a branch
const MAXP = 3; // spots run from -3 to 3
const CX = 180;
const HOP = 0.17; // a hop's flight time
const RIVAL_FEET = 322;
const PLAYER_FEET = 560;
const PIP_Y = 432;

const perchX = (p) => CX + p * PERCH;

// ---------- the whole show, planned up front ----------

function planShow(rng) {
  const mirrors = [];
  for (let r = 0; r < ROUNDS; r++) {
    let m = false;
    if (r === MIRROR_FROM) m = true;
    else if (r > MIRROR_FROM && !(mirrors[r - 1] && r < 11)) m = rng.chance(lerp(0.3, 0.5, (r - MIRROR_FROM) / (ROUNDS - MIRROR_FROM)));
    mirrors.push(m);
  }
  const rounds = [];
  let pos = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const mirror = mirrors[r];
    const k = mirror ? -1 : 1;
    const count = COUNTS[r] - (mirror ? 1 : 0);
    const pOff = r < OFFBEATS_FROM ? 0 : lerp(0.18, 0.5, (r - OFFBEATS_FROM) / (ROUNDS - OFFBEATS_FROM));
    const endLimit = mirrors[r + 1] ? MAXP - 1 : MAXP;
    let steps = null;
    for (let tries = 0; tries < 400 && !steps; tries++) {
      // the rhythm: which eighth-note slots get a hop
      const set = new Set();
      let guard = 0;
      while (set.size < count && guard++ < 50) {
        const off = rng.chance(pOff);
        const s = off ? 3 + 2 * rng.int(0, 2) : 2 * rng.int(1, 3);
        if (r < 2 && s === 6 && set.size === 0) continue; // ease in: don't start on the last beat
        set.add(s);
      }
      if (set.size < count) continue;
      const slots = [...set].sort((a, b) => a - b);
      if (slots.some((s, i) => i >= 2 && s - slots[i - 2] === 2)) continue; // no three eighths in a row
      // the directions: both birds stay on their branches
      let cum = 0;
      const out = [];
      let ok = true;
      for (const s of slots) {
        const opts = [-1, 1].filter((d) => Math.abs(pos + cum + d) <= MAXP && Math.abs(pos + k * (cum + d)) <= MAXP);
        if (!opts.length) {
          ok = false;
          break;
        }
        const d = opts.length === 2 ? (rng.chance(0.5) ? -1 : 1) : opts[0];
        cum += d;
        out.push({ slot: s, d });
      }
      if (!ok || Math.abs(pos + k * cum) > endLimit) continue;
      // keep the very first routines readable
      if (r === 0 && out[0].d === out[1].d && rng.chance(0.5)) continue;
      steps = out;
    }
    if (!steps) steps = [{ slot: FIRST_SLOT, d: pos > 0 ? -1 : 1 }, { slot: 6, d: pos > 0 ? 1 : -1 }];
    const demo = (1 + 2 * r) * BAR;
    const resp = demo + BAR;
    const p = progress(resp, 60, 1.2);
    const R = {
      mirror,
      demo,
      resp,
      start: pos,
      steps: steps.map((s) => ({ ...s, dt: demo + s.slot * SLOT, t: resp + s.slot * SLOT, want: s.d * k })),
      early: lerp(0.2, 0.15, p),
      late: lerp(0.22, 0.16, p),
      k: 0,
    };
    R.zone = Math.min(resp, R.steps[0].t - R.early);
    rounds.push(R);
    pos += k * steps.reduce((a, s) => a + s.d, 0);
  }
  return rounds;
}

// ---------- art ----------

const LEAF_DARK = '#0b2a1f';

function leaf(g, x, y, len, w, rot, fill, vein = 'rgba(255,255,255,0.12)') {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -w, len, 0);
  g.quadraticCurveTo(len * 0.45, w, 0, 0);
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.95, 0);
  g.stroke();
  g.restore();
}

function paintForest(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2f7a63');
    sky.addColorStop(0.35, '#3f8f6a');
    sky.addColorStop(0.7, '#1f5a44');
    sky.addColorStop(1, '#0f3328');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // dawn light breaking through the canopy, upper left
    const sun = g.createRadialGradient(70, 60, 10, 70, 60, 300);
    sun.addColorStop(0, 'rgba(255,236,170,0.75)');
    sun.addColorStop(0.3, 'rgba(250,210,130,0.3)');
    sun.addColorStop(1, 'rgba(250,210,130,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // far trunks in the haze
    for (let k = 0; k < 9; k++) {
      const x = rng.range(-10, W + 10);
      const w = rng.range(8, 22);
      g.fillStyle = `rgba(30,80,62,${rng.range(0.35, 0.6)})`;
      g.fillRect(x, 0, w, H);
      g.fillStyle = 'rgba(200,240,200,0.06)';
      g.fillRect(x + 2, 0, 2, H);
    }
    // far foliage clouds
    for (let k = 0; k < 70; k++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(-20, H * 0.9);
      g.fillStyle = `rgba(${rng.int(40, 70)},${rng.int(110, 150)},${rng.int(80, 105)},${rng.range(0.2, 0.45)})`;
      g.beginPath();
      g.ellipse(x, y, rng.range(18, 46), rng.range(12, 30), rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    // mid trunks with mossy bark
    for (const [x, w] of [[22, 34], [318, 42], [250, 16]]) {
      const bark = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      bark.addColorStop(0, '#13261d');
      bark.addColorStop(0.5, '#2f3f2c');
      bark.addColorStop(1, '#0e1d16');
      g.fillStyle = bark;
      g.fillRect(x - w / 2, 0, w, H);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(110,160,70,${rng.range(0.15, 0.4)})`;
        g.beginPath();
        g.ellipse(x + rng.range(-w / 2, w / 2), rng.range(0, H), rng.range(2, 6), rng.range(4, 10), 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // hanging lianas with leaves
    for (let k = 0; k < 9; k++) {
      let x = rng.range(10, W - 10);
      const len = rng.range(120, 380);
      g.strokeStyle = 'rgba(28,60,36,0.85)';
      g.lineWidth = rng.range(1.5, 3);
      g.beginPath();
      g.moveTo(x, -5);
      const sway = rng.range(-30, 30);
      g.bezierCurveTo(x + sway, len * 0.3, x - sway, len * 0.7, x + sway * 0.4, len);
      g.stroke();
      for (let y = 20; y < len; y += rng.range(16, 30)) {
        const u = y / len;
        const lx = x + sway * (3 * u * (1 - u) * (1 - 2 * u)) + sway * 0.4 * u * u * u;
        leaf(g, lx, y, rng.range(10, 18), rng.range(4, 7), (rng.chance(0.5) ? 0.6 : Math.PI - 0.6) + rng.range(-0.3, 0.3), 'rgba(52,120,64,0.9)');
      }
    }
    // canopy at the top
    for (let k = 0; k < 60; k++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(-10, 70);
      leaf(g, x, y, rng.range(30, 60), rng.range(10, 18), rng.range(0.6, 2.5), `rgba(${rng.int(14, 40)},${rng.int(60, 100)},${rng.int(40, 60)},0.95)`);
    }
    // undergrowth: big ferns and leaves at the bottom
    for (let k = 0; k < 50; k++) {
      const x = rng.range(-20, W + 20);
      const y = H - rng.range(-10, 60);
      leaf(g, x, y, rng.range(30, 70), rng.range(10, 20), -rng.range(0.5, 2.6), `rgba(${rng.int(10, 30)},${rng.int(50, 85)},${rng.int(35, 55)},0.95)`);
    }
  }, 1);
}

// a soft diagonal shaft of light
function paintBeam() {
  return makeSprite(120, 760, (g) => {
    const grad = g.createLinearGradient(-60, 0, 60, 0);
    grad.addColorStop(0, 'rgba(255,240,180,0)');
    grad.addColorStop(0.5, 'rgba(255,240,180,0.5)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-26, -380);
    g.lineTo(26, -380);
    g.lineTo(60, 380);
    g.lineTo(-60, 380);
    g.closePath();
    g.fill();
  }, 1);
}

// a mossy branch across the screen, with marks for the seven spots
function paintBranch(W, rng, tint, spots) {
  const h = 60;
  return makeSprite(W + 40, h, (g) => {
    g.translate(-(W + 40) / 2, -h / 2);
    const y0 = h / 2;
    const bark = g.createLinearGradient(0, y0 - 9, 0, y0 + 11);
    bark.addColorStop(0, tint[0]);
    bark.addColorStop(0.45, tint[1]);
    bark.addColorStop(1, tint[2]);
    g.fillStyle = bark;
    g.beginPath();
    g.moveTo(0, y0 - 10);
    for (let x = 0; x <= W + 40; x += 20) g.lineTo(x, y0 - 8 + Math.sin(x * 0.05) * 1.6);
    for (let x = W + 40; x >= 0; x -= 20) g.lineTo(x, y0 + 10 + Math.sin(x * 0.07 + 1) * 1.6);
    g.closePath();
    g.fill();
    // bark grain
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let k = 0; k < 40; k++) {
      const x = rng.range(0, W + 40);
      g.beginPath();
      g.moveTo(x, y0 + rng.range(-5, 6));
      g.lineTo(x + rng.range(10, 30), y0 + rng.range(-5, 6));
      g.stroke();
    }
    g.fillStyle = 'rgba(255,230,190,0.18)';
    g.fillRect(0, y0 - 8, W + 40, 2);
    // moss on top
    for (let k = 0; k < 110; k++) {
      const x = rng.range(0, W + 40);
      g.fillStyle = `rgba(${rng.int(90, 140)},${rng.int(150, 190)},${rng.int(60, 90)},${rng.range(0.5, 0.9)})`;
      g.beginPath();
      g.ellipse(x, y0 - 9 + rng.range(-1, 2), rng.range(2, 6), rng.range(1.5, 3), 0, 0, Math.PI * 2);
      g.fill();
    }
    // hanging moss strands
    g.strokeStyle = 'rgba(120,160,80,0.6)';
    for (let k = 0; k < 18; k++) {
      const x = rng.range(0, W + 40);
      g.beginPath();
      g.moveTo(x, y0 + 9);
      g.quadraticCurveTo(x + rng.range(-4, 4), y0 + 16, x + rng.range(-3, 3), y0 + rng.range(16, 28));
      g.stroke();
    }
    // the spots: little cushions of brighter moss
    if (spots) {
      for (let p = -MAXP; p <= MAXP; p++) {
        const x = perchX(p) + 20;
        g.fillStyle = 'rgba(190,230,120,0.75)';
        g.beginPath();
        g.ellipse(x, y0 - 9, 9, 3.2, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,220,0.45)';
        g.beginPath();
        g.ellipse(x - 2, y0 - 10, 4, 1.4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // an orchid or two
    for (let k = 0; k < 2; k++) {
      const x = rng.range(30, W + 10);
      for (let f = 0; f < 3; f++) {
        const fx = x + f * 8;
        const fy = y0 + 14 + f * 6;
        g.fillStyle = f % 2 ? '#f39ad0' : '#e86fb8';
        for (let a = 0; a < 5; a++) {
          g.beginPath();
          g.ellipse(fx + Math.cos(a * 1.256) * 3.4, fy + Math.sin(a * 1.256) * 3.4, 3.2, 2, a * 1.256, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffe36e';
        g.beginPath();
        g.arc(fx, fy, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 2);
}

// the player: a superb bird-of-paradise in full display, a black cape fanned out around an
// electric-blue breast shield and two blue "eyes"
function paintPlayer() {
  return makeSprite(84, 84, (g) => {
    // cape
    const cape = g.createRadialGradient(0, -2, 6, 0, -2, 40);
    cape.addColorStop(0, '#20263a');
    cape.addColorStop(0.7, '#0c0f18');
    cape.addColorStop(1, '#05060a');
    g.fillStyle = cape;
    g.beginPath();
    g.moveTo(-36, 10);
    g.quadraticCurveTo(-42, -30, 0, -38);
    g.quadraticCurveTo(42, -30, 36, 10);
    g.quadraticCurveTo(18, 2, 0, 6);
    g.quadraticCurveTo(-18, 2, -36, 10);
    g.fill();
    // scalloped feather tips with a violet sheen
    g.strokeStyle = 'rgba(140,120,255,0.45)';
    g.lineWidth = 1.3;
    for (let k = 0; k < 11; k++) {
      const a = Math.PI * (1.05 + (k / 10) * 0.9);
      g.beginPath();
      g.arc(Math.cos(a) * 30, -6 + Math.sin(a) * 28, 6, a - 1, a + 1);
      g.stroke();
    }
    // feet and legs
    g.strokeStyle = '#1b1e2a';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 5, 18);
      g.lineTo(s * 6, 30);
      g.lineTo(s * 10, 33);
      g.moveTo(s * 6, 30);
      g.lineTo(s * 2, 33);
      g.stroke();
    }
    // body
    g.fillStyle = '#0b0d14';
    g.beginPath();
    g.ellipse(0, 12, 12, 13, 0, 0, Math.PI * 2);
    g.fill();
    // breast shield
    const shield = g.createLinearGradient(0, 0, 0, 18);
    shield.addColorStop(0, '#b8fbff');
    shield.addColorStop(0.45, '#3fe0ff');
    shield.addColorStop(1, '#127fd0');
    g.fillStyle = shield;
    g.beginPath();
    g.moveTo(-24, 2);
    g.quadraticCurveTo(0, 26, 24, 2);
    g.quadraticCurveTo(0, 14, -24, 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.moveTo(-14, 8);
    g.quadraticCurveTo(0, 17, 12, 9);
    g.quadraticCurveTo(0, 13.5, -14, 8);
    g.fill();
    // the blue "eyes"
    for (const s of [-1, 1]) {
      g.fillStyle = '#5ff2ff';
      g.beginPath();
      g.ellipse(s * 8, -10, 4.2, 3.4, s * 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(s * 8 - 1.2, -11.2, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    // the real beak and eye, small, between them
    g.fillStyle = '#2b2e3a';
    g.beginPath();
    g.moveTo(-2.5, -6);
    g.lineTo(2.5, -6);
    g.lineTo(0, -1);
    g.closePath();
    g.fill();
  }, 3);
}

// the rival: a raggiana bird-of-paradise, yellow head, emerald throat, a fountain of orange-red
// plumes from its flanks
function paintRival() {
  return makeSprite(96, 88, (g) => {
    g.lineCap = 'round';
    // plumes
    for (const s of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const u = k / 8;
        const grad = g.createLinearGradient(0, 10, s * 44, -30);
        grad.addColorStop(0, '#c4321e');
        grad.addColorStop(0.5, '#f0702a');
        grad.addColorStop(1, 'rgba(255,190,90,0.9)');
        g.strokeStyle = grad;
        g.lineWidth = 3.4 - u * 1.4;
        g.beginPath();
        g.moveTo(s * 6, 12);
        g.bezierCurveTo(s * (18 + u * 10), -4 - u * 10, s * (30 + u * 12), -18 - u * 10, s * (36 + u * 10), -30 + u * 30);
        g.stroke();
      }
    }
    // wings, raised
    for (const s of [-1, 1]) {
      g.fillStyle = '#4a2416';
      g.beginPath();
      g.moveTo(s * 6, -2);
      g.quadraticCurveTo(s * 24, -22, s * 18, -32);
      g.quadraticCurveTo(s * 12, -14, s * 4, 6);
      g.fill();
    }
    // legs
    g.strokeStyle = '#6d6f7e';
    g.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 5, 22);
      g.lineTo(s * 6, 34);
      g.lineTo(s * 10, 37);
      g.moveTo(s * 6, 34);
      g.lineTo(s * 2, 37);
      g.stroke();
    }
    // body
    const body = g.createRadialGradient(-3, 6, 2, 0, 10, 16);
    body.addColorStop(0, '#8a4a2a');
    body.addColorStop(1, '#4a2214');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 12, 11, 15, 0, 0, Math.PI * 2);
    g.fill();
    // emerald throat
    const throat = g.createLinearGradient(0, -10, 0, 6);
    throat.addColorStop(0, '#5cf0a0');
    throat.addColorStop(1, '#0f8a52');
    g.fillStyle = throat;
    g.beginPath();
    g.ellipse(0, -2, 8, 7, 0, 0, Math.PI * 2);
    g.fill();
    // yellow head
    const head = g.createRadialGradient(-3, -16, 1, 0, -13, 10);
    head.addColorStop(0, '#fff3a0');
    head.addColorStop(1, '#e8b81e');
    g.fillStyle = head;
    g.beginPath();
    g.arc(0, -13, 9, 0, Math.PI * 2);
    g.fill();
    // eyes and beak
    for (const s of [-1, 1]) {
      g.fillStyle = '#1a1206';
      g.beginPath();
      g.arc(s * 4, -15, 1.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s * 4 - 0.6, -15.6, 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#a9c3d6';
    g.beginPath();
    g.moveTo(-3, -11);
    g.lineTo(3, -11);
    g.lineTo(0, -4);
    g.closePath();
    g.fill();
  }, 3);
}

// the female judge: plain brown with a barred breast, perched side-on
function paintFemale() {
  return makeSprite(44, 44, (g) => {
    g.fillStyle = '#5a3a24';
    g.beginPath();
    g.moveTo(-4, 6);
    g.lineTo(-18, 16);
    g.lineTo(-14, 6);
    g.closePath();
    g.fill();
    const body = g.createRadialGradient(2, 0, 2, 2, 2, 14);
    body.addColorStop(0, '#9a6a42');
    body.addColorStop(1, '#5c3a22');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(2, 4, 12, 9, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9c39a';
    g.beginPath();
    g.ellipse(6, 7, 7, 6, -0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(90,60,30,0.7)';
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(1 + k * 2.5, 3 + k * 2);
      g.lineTo(7 + k * 2.5, 2 + k * 2);
      g.stroke();
    }
    g.fillStyle = '#3a2414';
    g.beginPath();
    g.arc(9, -6, 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9fb9d0';
    g.beginPath();
    g.moveTo(14, -7);
    g.lineTo(21, -5);
    g.lineTo(14, -3.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(11, -7.5, 1.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(11.4, -7.5, 0.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6d6f7e';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, 12);
    g.lineTo(0, 18);
    g.moveTo(5, 12);
    g.lineTo(5, 18);
    g.stroke();
  }, 3);
}

function paintHeart(color) {
  return makeSprite(20, 18, (g) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 7);
    g.bezierCurveTo(-11, -1, -6, -10, 0, -4);
    g.bezierCurveTo(6, -10, 11, -1, 0, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-4, -3, 2, 1.3, -0.6, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

function paintButterfly(c1, c2) {
  return makeSprite(24, 18, (g) => {
    for (const s of [-1, 1]) {
      const grad = g.createLinearGradient(0, 0, s * 11, -6);
      grad.addColorStop(0, c2);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(s * 6, -3, 6, 5, s * 0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(s * 4.5, 4, 4, 3.5, -s * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#1a1a1a';
    g.fillRect(-0.8, -6, 1.6, 12);
  }, 3);
}

// a big foreground leaf for the corners
function paintBigLeaf(len, w, fill) {
  return makeSprite(len, w * 2 + 4, (g) => {
    g.translate(-len / 2, 0);
    const grad = g.createLinearGradient(0, -w, 0, w);
    grad.addColorStop(0, fill[0]);
    grad.addColorStop(1, fill[1]);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.4, -w * 1.1, len, 0);
    g.quadraticCurveTo(len * 0.4, w * 1.1, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(200,255,200,0.25)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.96, 0);
    g.stroke();
    g.lineWidth = 0.9;
    for (let k = 1; k < 9; k++) {
      const x = (k / 9) * len * 0.9;
      const ww = Math.sin((x / len) * Math.PI) * w * 0.9;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + 8, -ww * 0.5, x + 14, -ww);
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + 8, ww * 0.5, x + 14, ww);
      g.stroke();
    }
  }, 2);
}

function paintArrow(color) {
  return makeSprite(30, 30, (g) => {
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(13, 0);
    g.lineTo(1, -11);
    g.lineTo(1, -5);
    g.lineTo(-12, -5);
    g.lineTo(-12, 5);
    g.lineTo(1, 5);
    g.lineTo(1, 11);
    g.closePath();
    g.stroke();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(-10, -4, 11, 2.5);
  }, 3);
}

// violet shimmer around the edges for mirror rounds
function paintMirrorFrame(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const [x0, y0, x1, y1] of [[0, 0, 40, 0], [W, 0, W - 40, 0]]) {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(200,120,255,0.7)');
      grad.addColorStop(1, 'rgba(200,120,255,0)');
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x1), 0, 40, H);
    }
    g.strokeStyle = 'rgba(240,210,255,0.55)';
    g.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const y = 80 + k * 100;
      g.beginPath();
      g.moveTo(6, y);
      g.lineTo(18, y - 22);
      g.moveTo(W - 6, y + 40);
      g.lineTo(W - 18, y + 18);
      g.stroke();
    }
  }, 1);
}

// ---------- the game ----------

const FEATHERS = ['#0b0d14', '#20263a', '#3fe0ff', '#b8fbff', '#127fd0'];
const SPARK = ['#b8fbff', '#5ff2ff', '#fff6c0', '#ffffff'];
const PLUMES = ['#f0702a', '#ffbe5a', '#c4321e'];
const LEAVES = ['#5fae5a', '#3f8a4a', '#9fd06a'];

export default {
  id: 'paradise',
  title: 'Bird of Paradise',
  emoji: '🪶',
  tagline: 'Watch the rival dance, then copy it with ← → taps on the same beats.',
  colors: { bg: '#123c2e', fg: '#fff6dc', accent: '#3fe0ff' },

  // Samba house, 132 BPM, G major (G – Em – C – D7). Four-on-the-floor kick, surdo, tamborim
  // clicks and a syncopated sawtooth bass with its filter opening over the minute from bar one;
  // then claps, partido-alto piano stabs, an agogô bell and a warm pad; then a caixa snare and a
  // bright square lead; and a finale with the ganzá shaker, a rising noise wash, a 16th arpeggio,
  // samba whistles and the lead doubled an octave down. 33 bars = 60s.
  music: {
    cps: CPS,
    setup: `
      const kick = note("g2*4").s("sine").decay(0.24).sustain(0).gain(0.8)
      const surdo = note("~ d3 ~ [g2 ~ ~ g2]").s("sine").decay(0.35).sustain(0).gain(0.34)
      const tamb = note("d6 ~ d6 d6 ~ d6 d6 ~ d6 ~ d6 d6 ~ d6 d6 ~").s("triangle").decay(0.035).sustain(0).lpf(5000).gain("[0.07 0.04 0.05 0.04]*4")
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.03 0.045 0.03]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.13).room(0.3)
      const caixa = s("white*16").decay(0.035).sustain(0).hpf(2500).lpf(6000).gain("[0.07 0.025 0.04 0.025]*4")
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(900).lpf(saw.range(900, 5000).slow(9)).gain(saw.range(0, 0.06).slow(9))
      const bass = note("<[g2 ~ g3 g2 ~ g2 d3 ~ g2 ~ g3 g2 ~ b2 d3 ~] [e2 ~ e3 e2 ~ e2 b2 ~ e2 ~ e3 e2 ~ g2 b2 ~] [c3 ~ c3 g2 ~ c3 g3 ~ c3 ~ c3 g2 ~ e3 g3 ~] [d3 ~ d3 a2 ~ d3 a2 ~ d3 ~ fs3 d3 ~ a2 c3 ~]>")
        .s("sawtooth").decay(0.15).sustain(0.3).release(0.05).lpf(saw.range(420, 1500).slow(33)).lpq(5).gain(0.36)
      const piano = note("<[g3,b3,d4] [e3,g3,b3] [c4,e4,g4] [d4,fs4,a4,c5]>").struct("x ~ ~ x ~ ~ x ~ ~ x ~ x ~ ~ x ~")
        .s("triangle").decay(0.2).sustain(0).lpf(2600).gain(0.09).pan(0.4)
      const agogo = note("b5 ~ g5 ~ b5 b5 g5 ~ b5 ~ g5 g5 ~ b5 g5 ~").s("square").decay(0.08).sustain(0).lpf(2400).gain(0.035).pan(0.65)
      const pad = note("<[g3,b3,d4] [e3,g3,b3] [c3,e3,g3] [d3,fs3,a3]>").s("sawtooth")
        .attack(0.3).decay(0.7).sustain(0.6).release(0.5).lpf(1000).gain(0.045).room(0.4)
      const tune = "<[d5 ~ g5 ~ b5 ~ a5 g5 ~ e5 ~ g5 ~ ~ d5 ~] [e5 ~ g5 ~ b5 ~ a5 g5 ~ fs5 ~ e5 ~ ~ b4 ~] [c5 ~ e5 ~ g5 ~ e5 g5 ~ a5 ~ g5 ~ e5 ~ ~] [fs5 ~ a5 ~ fs5 ~ d5 ~ e5 ~ fs5 ~ a5 ~ ~ ~]>"
      const lead = note(tune).s("square").decay(0.18).sustain(0.35).release(0.08).lpf(2400).vib(5).vibmod(0.1)
        .gain(0.08).room(0.3).delay(0.2).delaytime(0.341).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.2).sustain(0.3).release(0.08).lpf(1300).gain(0.045).pan(0.45)
      const arp = note("<[g4 b4 d5 b4]*4 [e4 g4 b4 g4]*4 [c5 e5 g5 e5]*4 [d5 fs5 a5 fs5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3800).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
      const apito = note("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ b5 ~ b5 b5").s("sine").decay(0.07).sustain(0.3).release(0.03).gain(0.06)
    `,
    song: `arrange(
      [8, stack(kick, surdo, tamb, hats, bass)],
      [8, stack(kick, surdo, tamb, hats, clap, bass, piano, agogo, pad)],
      [8, stack(kick, surdo, tamb, hats, clap, caixa, bass, piano, agogo, pad, lead)],
      [9, stack(kick, surdo, tamb, shaker, clap, caixa, wash, bass, piano, agogo, pad, lead, lead2, arp, apito)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const rounds = planShow(rng.fork('show'));

    const forest = paintForest(W, H, art);
    const beam = paintBeam();
    const topBranch = paintBranch(W, art, ['#7a5a3c', '#4e3624', '#24170e'], false);
    const lowBranch = paintBranch(W, art, ['#86643f', '#57402a', '#2a1c10'], true);
    const femaleBranch = paintBranch(170, art, ['#6e5236', '#47321f', '#20150c'], false);
    const playerArt = paintPlayer();
    const rivalArt = paintRival();
    const femaleArt = paintFemale();
    const heartArt = paintHeart('#ff5c8a');
    const brokenArt = paintHeart('#7a5060');
    const flies = [paintButterfly('#3fa0ff', '#0a2a6a'), paintButterfly('#ffb02e', '#6a2a00'), paintButterfly('#ff6ad0', '#5a0a4a')];
    const bigLeafA = paintBigLeaf(150, 34, ['#1d6a3e', '#0b3a20']);
    const bigLeafB = paintBigLeaf(130, 28, ['#2a7a44', '#0e4224']);
    const arrowWarm = paintArrow('#ffb347');
    const arrowCool = paintArrow('#5ff2ff');
    const arrowBad = paintArrow('#ff4d5e');
    const mirrorFrame = paintMirrorFrame(W, H);
    const goldGlow = glowSprite('rgba(255,220,140,0.8)', 60);
    const cyanGlow = glowSprite('rgba(80,230,255,0.85)', 40);
    const warmGlow = glowSprite('rgba(255,150,70,0.85)', 40);
    const violetGlow = glowSprite('rgba(200,120,255,0.85)', 40);
    const vignette = vignetteSprite(W, H, 0.6, '2,14,10');
    const fx = createParticles();
    const glow = createParticles();

    const motes = [];
    for (let i = 0; i < 36; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 1.8, ph: Math.random() * 6, v: 4 + Math.random() * 10 });
    const butterflies = [];
    for (let i = 0; i < 3; i++) butterflies.push({ x: Math.random() * W, y: 120 + Math.random() * 380, ph: Math.random() * 6, sp: 0.15 + Math.random() * 0.2, art: flies[i] });
    const hearts = []; // { x, y, vx, vy, life, broken }

    // the player bird
    const me = { pos: 0, from: 0, hopT: -9, dir: 0, shimmy: -9, shimmyDir: 0, fall: null };
    let prevDir = 0;
    let ri = 0;
    let clock = 0;
    let lastBeat = -1;
    let beatPulse = 0;
    let fails = null; // { slot, d } of the fatal hop, for the pips
    let hits = []; // the player's hops in the current round: { slot, d, t }
    let femaleMood = 0; // cosmetic: ramps up with every good hop
    let femaleJump = -9;

    const die = (game, reason, t, wrongDir = 0) => {
      game.dead = true;
      game.deathReason = reason;
      const x = birdX(me, t);
      me.fall = { x, y: PLAYER_FEET - 26, vx: (wrongDir || (Math.random() < 0.5 ? -1 : 1)) * 70, vy: -200, rot: 0 };
      fx.burst(x, PLAYER_FEET - 26, { count: 26, speed: 170, life: 1.3, size: 5, gravity: 140, drag: 1.5, colors: FEATHERS });
      fx.burst(x, PLAYER_FEET - 4, { count: 12, speed: 110, life: 0.8, size: 3, gravity: 300, colors: LEAVES });
      for (let i = 0; i < 3; i++) hearts.push({ x: 92 + i * 10, y: 128, vx: (i - 1) * 20, vy: -50, life: 1.4, broken: true });
      if (wrongDir) fails = { d: wrongDir, t };
    };

    const birdX = (b, t) => {
      const u = clamp((t - b.hopT) / HOP, 0, 1);
      return perchX(lerp(b.from, b.pos, u));
    };
    const hopLift = (hopT, t) => {
      const u = (t - hopT) / HOP;
      return u >= 0 && u <= 1 ? Math.sin(u * Math.PI) * 22 : 0;
    };

    // where the rival is at time t, and when its current hop started
    const rivalAt = (t) => {
      const bar = Math.floor(t / BAR);
      if (bar < 1) return { from: 0, pos: 0, hopT: -9, dancing: false };
      const r = Math.min(ROUNDS - 1, Math.floor((bar - 1) / 2));
      const R = rounds[r];
      let pos = R.start;
      let from = R.start;
      let hopT = -9;
      for (const s of R.steps) {
        if (s.dt <= t) {
          from = pos;
          pos += s.d;
          hopT = s.dt;
        }
      }
      const dancing = t < R.resp;
      // after a mirror round it glides back to stand where you are
      const back = R.resp + BAR - 0.36;
      const next = R.start + (R.mirror ? -1 : 1) * R.steps.reduce((a, s) => a + s.d, 0);
      if (t >= back && next !== pos) return { from: pos, pos: next, hopT: back, slow: true, dancing };
      return { from, pos, hopT, dancing };
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock = t;
        const press = dir !== 0 && dir !== prevDir ? dir : 0;
        prevDir = dir;

        const beat = Math.floor(t / BEAT);
        if (beat !== lastBeat) {
          lastBeat = beat;
          beatPulse = 1;
        }
        beatPulse = Math.max(0, beatPulse - dt * 4);

        const R = rounds[ri];
        if (R) {
          const n = R.steps.length;
          if (R.k < n && t > R.steps[R.k].t + R.late) {
            return die(this, R.k === 0 ? 'Froze and missed the first hop of the dance.' : 'Froze and missed a hop of the dance.', t);
          }
          if (press) {
            if (t >= R.zone && (R.k < n || t < R.resp + BAR)) {
              if (R.k >= n) return die(this, 'Added a hop the rival never did.', t, press);
              const st = R.steps[R.k];
              if (t < st.t - R.early) return die(this, 'Hopped too early, off the beat.', t, press);
              if (press !== st.want) {
                return die(this, R.mirror ? 'Hopped the rival’s way in a mirror round.' : 'Hopped the wrong way.', t, press);
              }
              R.k++;
              me.from = me.pos;
              me.pos += press;
              me.hopT = t;
              me.dir = press;
              hits.push({ slot: st.slot, d: press, t });
              femaleMood = Math.min(1, femaleMood + 0.04);
              const x = perchX(me.pos);
              glow.burst(x, PLAYER_FEET - 28, { count: 12, speed: 120, life: 0.6, size: 3, drag: 2.5, colors: SPARK });
              fx.burst(x, PLAYER_FEET, { count: 4, speed: 60, angle: -Math.PI / 2, spread: 2.4, life: 0.6, size: 3, gravity: 260, colors: LEAVES });
              if (R.k === n) {
                femaleJump = t;
                for (let i = 0; i < 3; i++) hearts.push({ x: 86 + Math.random() * 20, y: 126, vx: (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 30, life: 1.4, broken: false });
              }
            } else {
              // practising along during the rival's bar is free
              me.shimmy = t;
              me.shimmyDir = press;
            }
          }
          if (R.k >= n && t >= R.resp + BAR) {
            ri++;
            hits = [];
          }
        }
        this.cosmetic(dt);
      },

      cosmetic(dt) {
        for (const m of motes) {
          m.y -= m.v * dt;
          m.x += Math.sin(clock * 0.7 + m.ph) * 6 * dt;
          if (m.y < -5) {
            m.y = H + 5;
            m.x = Math.random() * W;
          }
        }
        for (const b of butterflies) {
          b.ph += dt;
          b.x += Math.cos(b.ph * b.sp * 3) * 30 * dt + 8 * dt;
          b.y += Math.sin(b.ph * 1.3) * 22 * dt;
          if (b.x > W + 20) b.x = -20;
        }
        for (let i = hearts.length - 1; i >= 0; i--) {
          const h = hearts[i];
          h.life -= dt;
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          if (h.broken) h.vy += 160 * dt;
          if (h.life <= 0) hearts.splice(i, 1);
        }
        if (me.fall) {
          me.fall.vy += 900 * dt;
          me.fall.x += me.fall.vx * dt;
          me.fall.y += me.fall.vy * dt;
          me.fall.rot += me.fall.vx > 0 ? 6 * dt : -6 * dt;
        }
        fx.update(dt);
        glow.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        this.cosmetic(dt);
      },

      render(g, t) {
        const p = progress(clock, 60, 1);
        drawSprite(g, forest, W / 2, H / 2);

        // shafts of morning light, brighter as the sun climbs
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const a = (0.12 + 0.1 * p) * (0.7 + 0.3 * Math.sin(clock * 0.6 + k * 2));
          g.save();
          g.translate(70 + k * 90, 300);
          g.rotate(-0.32);
          drawSprite(g, beam, 0, 0, { alpha: a });
          g.restore();
        }
        drawSprite(g, goldGlow, 70, 60, { size: 340, alpha: 0.25 + 0.15 * p + beatPulse * 0.06 });
        g.globalCompositeOperation = 'source-over';

        // pollen motes
        g.fillStyle = 'rgba(255,245,200,0.7)';
        for (const m of motes) {
          g.globalAlpha = 0.4 + 0.4 * Math.sin(clock * 2 + m.ph);
          g.fillRect(m.x, m.y, m.s, m.s);
        }
        g.globalAlpha = 1;
        for (const b of butterflies) {
          const flap = 0.35 + 0.65 * Math.abs(Math.sin(b.ph * 14));
          g.save();
          g.translate(b.x, b.y);
          g.scale(flap, 1);
          drawSprite(g, b.art, 0, 0, { size: 18 });
          g.restore();
        }

        const bar = Math.floor(clock / BAR);
        const r = bar < 1 ? -1 : Math.min(ROUNDS - 1, Math.floor((bar - 1) / 2));
        const R = r >= 0 ? rounds[r] : null;
        const yourBar = R && clock >= R.resp;
        const mirror = R && R.mirror && !this.dead;
        if (mirror) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, mirrorFrame, W / 2, H / 2, { alpha: 0.55 + 0.25 * Math.sin(clock * 8) });
          g.globalCompositeOperation = 'source-over';
        }

        // the female judge, top left
        drawSprite(g, femaleBranch, 70, 152);
        const fjump = clock - femaleJump < 0.35 ? Math.sin(((clock - femaleJump) / 0.35) * Math.PI) * 8 : 0;
        drawSprite(g, femaleArt, 92, 128 - fjump, { size: 40 });
        for (const h of hearts) drawSprite(g, h.broken ? brokenArt : heartArt, h.x, h.y, { size: 14, alpha: clamp(h.life, 0, 1) });

        // the rival
        drawSprite(g, topBranch, W / 2, RIVAL_FEET + 10);
        const rv = rivalAt(clock);
        const ru = clamp((clock - rv.hopT) / (rv.slow ? 0.3 : HOP), 0, 1);
        const rx = perchX(lerp(rv.from, rv.pos, ru));
        const rlift = ru > 0 && ru < 1 ? Math.sin(ru * Math.PI) * (rv.slow ? 10 : 24) : 0;
        const rsq = rlift === 0 && clock - rv.hopT < HOP + 0.1 ? 1 - 0.12 * Math.sin(((clock - rv.hopT - HOP) / 0.1) * Math.PI) : 1;
        if (rv.dancing && R) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, warmGlow, rx, RIVAL_FEET - 34 - rlift, { size: 110, alpha: 0.3 + 0.25 * beatPulse });
          g.globalCompositeOperation = 'source-over';
        }
        g.save();
        g.translate(rx, RIVAL_FEET - rlift);
        const rb = rv.dancing ? 1 + 0.04 * beatPulse : 1;
        g.scale(rb * (2 - rsq), rb * rsq);
        drawSprite(g, rivalArt, 0, -40, { size: 88 });
        g.restore();
        // the rival's arrows pop up as it hops
        if (R && rv.dancing) {
          for (const s of R.steps) {
            const age = clock - s.dt;
            if (age < 0 || age > 0.55) continue;
            const k = age / 0.55;
            g.save();
            g.translate(rx + s.d * (54 + k * 14), RIVAL_FEET - 52 - rlift);
            if (s.d < 0) g.scale(-1, 1);
            drawSprite(g, arrowWarm, 0, 0, { size: 34, alpha: 1 - k * k });
            g.restore();
          }
        }

        // the player's branch and bird
        drawSprite(g, lowBranch, W / 2, PLAYER_FEET + 10);
        if (yourBar && !this.dead) {
          // a ring under you pulsing on the beat
          g.strokeStyle = R.mirror ? `rgba(220,160,255,${0.35 + 0.5 * beatPulse})` : `rgba(120,240,255,${0.35 + 0.5 * beatPulse})`;
          g.lineWidth = 2.5;
          g.beginPath();
          g.ellipse(birdX(me, clock), PLAYER_FEET + 1, 26 + 8 * beatPulse, 6 + 2 * beatPulse, 0, 0, Math.PI * 2);
          g.stroke();
        }
        if (me.fall) {
          g.save();
          g.translate(me.fall.x, me.fall.y);
          g.rotate(me.fall.rot);
          drawSprite(g, playerArt, 0, 0, { size: 76 });
          g.restore();
        } else {
          const x = birdX(me, clock);
          const lift = hopLift(me.hopT, clock);
          const land = clock - me.hopT - HOP;
          const sq = land >= 0 && land < 0.1 ? 1 - 0.14 * Math.sin((land / 0.1) * Math.PI) : 1;
          const sh = clock - me.shimmy < 0.2 ? Math.sin(((clock - me.shimmy) / 0.2) * Math.PI) : 0;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, cyanGlow, x, PLAYER_FEET - 30 - lift, { size: 96, alpha: 0.28 + 0.2 * beatPulse });
          g.globalCompositeOperation = 'source-over';
          g.save();
          g.translate(x + sh * me.shimmyDir * 5, PLAYER_FEET - lift);
          g.rotate(sh * me.shimmyDir * 0.12 + (lift ? me.dir * 0.12 : 0));
          g.scale(2 - sq, sq);
          drawSprite(g, playerArt, 0, -38, { size: 76 });
          g.restore();
        }

        // big leaves framing the stage
        g.save();
        g.translate(-10, 470);
        g.rotate(-0.5 + Math.sin(clock * 0.8) * 0.03);
        drawSprite(g, bigLeafA, 75, 0);
        g.restore();
        g.save();
        g.translate(W + 10, 640);
        g.rotate(Math.PI + 0.55 + Math.sin(clock * 0.7 + 1) * 0.03);
        drawSprite(g, bigLeafB, 65, 0);
        g.restore();
        g.save();
        g.translate(W + 6, 90);
        g.rotate(Math.PI - 0.5 + Math.sin(clock * 0.6 + 2) * 0.03);
        drawSprite(g, bigLeafB, 65, 0);
        g.restore();

        glow.render(g, true);
        fx.render(g);
        drawSprite(g, vignette, W / 2, H / 2);

        // the banner
        let title = 'GET READY';
        let sub = 'watch the rival dance first';
        let color = '#fff6dc';
        if (R) {
          if (yourBar) {
            title = 'YOUR TURN';
            sub = R.mirror ? 'MIRROR — hop the opposite way' : 'same hops, same beats';
            color = R.mirror ? '#e4b8ff' : '#7ff2ff';
          } else {
            title = 'WATCH';
            sub = R.mirror ? 'MIRROR ROUND ⇄' : `dance ${r + 1}`;
            color = R.mirror ? '#e4b8ff' : '#ffc070';
          }
        }
        const barT = clock - Math.max(0, bar) * BAR;
        // the last beat of the rival's bar counts you in
        const countIn = R && !yourBar && barT >= 3 * BEAT;
        if (countIn) {
          title = 'GET SET…';
          sub = 'your turn next — watch the track ▼';
          color = R.mirror ? '#e4b8ff' : '#7ff2ff';
        }
        const pop = 1 + 0.25 * Math.max(0, 1 - (countIn ? barT - 3 * BEAT : barT) / 0.18);
        if (!this.dead) {
          g.save();
          g.translate(W / 2, 196);
          g.scale(pop, pop);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 30px ${BODY_FONT}`;
          g.fillStyle = 'rgba(0,20,12,0.55)';
          g.fillText(title, 2, 2);
          g.fillStyle = color;
          g.fillText(title, 0, 0);
          g.font = `600 13px ${BODY_FONT}`;
          g.fillStyle = 'rgba(255,250,230,0.85)';
          g.fillText(sub, 0, 26);
          g.restore();
        }

        // the beat track: eight pips per bar and a cursor sweeping across
        const px0 = 68;
        const pdx = 32;
        const live = R && !this.dead;
        const hot = live && (yourBar || countIn);
        const trackRgb = !live ? '255,250,230' : yourBar || countIn ? (R.mirror ? '220,160,255' : '120,240,255') : '255,180,100';
        g.fillStyle = 'rgba(4,24,16,0.72)';
        g.beginPath();
        g.arc(px0 - 4, PIP_Y, 22, Math.PI / 2, Math.PI * 1.5);
        g.arc(px0 + pdx * 7 + 4, PIP_Y, 22, -Math.PI / 2, Math.PI / 2);
        g.closePath();
        g.fill();
        g.strokeStyle = `rgba(${trackRgb},${live ? (hot ? 0.55 + 0.45 * beatPulse : 0.4 + 0.3 * beatPulse) : 0.25})`;
        g.lineWidth = hot ? 3 : 2;
        g.stroke();
        if (hot) {
          g.globalCompositeOperation = 'lighter';
          for (let s = 0; s < 8; s += 2) drawSprite(g, R.mirror ? violetGlow : cyanGlow, px0 + s * pdx + pdx / 2, PIP_Y, { size: 70, alpha: 0.12 + 0.12 * beatPulse });
          g.globalCompositeOperation = 'source-over';
        }
        for (let s = 0; s < 8; s++) {
          const x = px0 + s * pdx;
          const big = s % 2 === 0;
          g.fillStyle = big ? 'rgba(255,250,230,0.45)' : 'rgba(255,250,230,0.22)';
          g.beginPath();
          g.arc(x, PIP_Y, big ? 5 : 3, 0, Math.PI * 2);
          g.fill();
        }
        // on your turn, rings mark the beats to hop on (the way to hop is yours to remember)
        if (live && yourBar) {
          for (let i = R.k; i < R.steps.length; i++) {
            const st = R.steps[i];
            const near = clamp(1 - (st.t - clock) / 0.5, 0, 1);
            g.strokeStyle = `rgba(${trackRgb},${0.35 + 0.6 * near})`;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(px0 + st.slot * pdx, PIP_Y, 11 - 3 * near, 0, Math.PI * 2);
            g.stroke();
          }
        }
        // a bouncing pointer draws your eye to the track as your turn begins
        if (live && (countIn || (yourBar && clock < R.steps[0].t))) {
          const bob = Math.abs(Math.sin(clock * Math.PI / BEAT)) * 6;
          g.fillStyle = `rgb(${trackRgb})`;
          g.strokeStyle = 'rgba(0,20,12,0.6)';
          g.lineWidth = 2;
          for (const x of [px0 - 22, px0 + pdx * 7 + 22]) {
            g.beginPath();
            g.moveTo(x, PIP_Y - 30 + bob);
            g.lineTo(x - 8, PIP_Y - 44 + bob);
            g.lineTo(x + 8, PIP_Y - 44 + bob);
            g.closePath();
            g.stroke();
            g.fill();
          }
          g.font = `800 13px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(yourBar ? 'GO!' : 'READY', W / 2, PIP_Y - 34 - bob * 0.5);
        }
        if (bar >= 1 && !this.dead) {
          const u = barT / BAR;
          const cx = px0 - pdx / 2 + u * pdx * 8;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, yourBar ? (R.mirror ? violetGlow : cyanGlow) : warmGlow, cx, PIP_Y, { size: 40, alpha: 0.7 });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.fillRect(cx - 1, PIP_Y - 13, 2, 26);
        }
        if (R) {
          const marks = yourBar ? hits.map((h) => ({ slot: h.slot, d: h.d, t: h.t, art: arrowCool })) : R.steps.map((s) => ({ slot: s.slot, d: s.d, t: s.dt, art: arrowWarm }));
          for (const m of marks) {
            const age = clock - m.t;
            if (age < 0) continue;
            const a = yourBar ? 1 : Math.max(0, 1 - age / 0.5);
            if (a <= 0) continue;
            g.save();
            g.translate(px0 + m.slot * pdx, PIP_Y);
            if (m.d < 0) g.scale(-1, 1);
            drawSprite(g, m.art, 0, 0, { size: 22 * (1 + 0.3 * Math.max(0, 1 - age / 0.15)), alpha: a });
            g.restore();
          }
        }
        if (fails && this.dead) {
          const slot = clamp(Math.round((fails.t - Math.floor(fails.t / BAR) * BAR) / SLOT), 0, 7);
          g.save();
          g.translate(px0 + slot * pdx, PIP_Y);
          if (fails.d < 0) g.scale(-1, 1);
          drawSprite(g, arrowBad, 0, 0, { size: 24 });
          g.restore();
        }
      },
    };
    return game;
  },
};
