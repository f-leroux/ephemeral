// Ninja Gorge — a ninja wall-runs up a narrow mountain gorge at dusk, painted in ink on rice
// paper. ← and → leap to that wall: the leap is an arc across the gap that takes a moment, so
// you leave a wall before the bamboo stakes on it reach you, and not so early that you land
// in front of the stakes on the other side. Spinning blades hang in the middle of the gorge from
// 8s, thorny branches reach almost all the way across from 14s, and from 20s shuriken ricochet
// from wall to wall. Hang in the air too long and you drop into the gorge. Everything is laid out
// around a hidden climb made with the ninja's own physics, so there is always a way up.

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

const STEP = 1 / 120;
const HOME_Y = 500; // where the ninja runs on the wall, on screen
const HALF = 11; // the ninja's centre sits this far off the wall face
const BOX_W = 10; // half-width of the ninja's hitbox
const BOX_H = 15; // half-height
const KICK = 290; // sideways speed of the push-off
const JUMP = 260; // upward speed of the push-off (on screen)
const ACC = 1500; // sideways pull towards the wall you're leaping to
const ACC_REV = 3000; // ...and when you change your mind mid-air
const GRAV = 800;
const RECOVER = 170; // how fast the ninja climbs back up to HOME_Y after a drop
const STAKE_P = 44; // how far bamboo stakes reach out from a wall
const BLADE_R = 19;
const STAR_R = 11;

const BLADES_FROM = 8;
const BRANCHES_FROM = 14;
const STARS_FROM = 20;

const speedAt = (t) => lerp(165, 345, progress(t, 60, 1.1)); // climbing speed, px/s
const intervalAt = (t) => lerp(1.65, 0.8, progress(t, 60, 1.05)); // seconds between the hidden climb's leaps

// the gorge: its centre line and half-width wander gently with height (world y, down is +)
const centreAt = (wy) => 180 + 9 * Math.sin(wy * 0.0043) + 5 * Math.sin(wy * 0.011 + 2);
const halfAt = (wy) => 104 + 13 * Math.sin(wy * 0.0027 + 1.3);
const leftAt = (wy) => centreAt(wy) - halfAt(wy);
const rightAt = (wy) => centreAt(wy) + halfAt(wy);
const faceAt = (side, wy) => (side < 0 ? leftAt(wy) : rightAt(wy));

// a shuriken bounces from wall to wall: 0..1..0 over one period
const tri = (u) => {
  const f = u - Math.floor(u);
  return f < 0.5 ? f * 2 : 2 - f * 2;
};
const starX = (s, t) => {
  const l = leftAt(s.y) + STAR_R + 2;
  const r = rightAt(s.y) - STAR_R - 2;
  return l + (r - l) * tri(t / s.period + s.phase);
};

// ---------- the ninja's physics (shared by the game and the hidden climb) ----------

function newNinja() {
  return { x: leftAt(HOME_Y) + HALF, ny: HOME_Y, vx: 0, vy: 0, wall: -1, target: -1, air: 0 };
}

// one fixed step; returns 'launch', 'land' or ''
function stepNinja(n, dt, dir, cam) {
  if (dir) n.target = dir;
  let ev = '';
  if (n.wall && n.target !== n.wall) {
    n.wall = 0;
    n.vx = n.target * KICK;
    n.vy = -JUMP;
    n.air = 0;
    ev = 'launch';
  }
  if (n.wall) {
    n.x = faceAt(n.wall, n.ny - cam) - n.wall * HALF;
    if (n.ny > HOME_Y) n.ny = Math.max(HOME_Y, n.ny - RECOVER * dt);
    else if (n.ny < HOME_Y) n.ny = Math.min(HOME_Y, n.ny + 80 * dt);
    return ev;
  }
  n.air += dt;
  const a = n.vx * n.target >= 0 ? ACC : ACC_REV;
  n.vx += n.target * a * dt;
  n.x += n.vx * dt;
  n.vy += GRAV * dt;
  n.ny += n.vy * dt;
  const wy = n.ny - cam;
  const l = leftAt(wy) + HALF;
  const r = rightAt(wy) - HALF;
  if (n.x <= l && n.vx < 0) {
    n.x = l;
    n.wall = -1;
  } else if (n.x >= r && n.vx > 0) {
    n.x = r;
    n.wall = 1;
  }
  if (n.wall) {
    n.vx = 0;
    n.vy = 0;
    ev = 'land';
  }
  return ev;
}

// ---------- hazards ----------

// the x-span a wall hazard covers at world height wy
function hazardSpan(h, wy) {
  return h.side < 0 ? [-40, leftAt(wy) + h.p] : [rightAt(wy) - h.p, W_ + 40];
}
const W_ = 360;

function hitsWall(h, x, wy, pad = 0) {
  if (wy + BOX_H + pad <= h.y0 || wy - BOX_H - pad >= h.y1) return false;
  const [a, b] = hazardSpan(h, wy);
  return x + BOX_W + pad > a && x - BOX_W - pad < b;
}
function hitsCircle(cx, cy, r, x, wy, pad = 0) {
  const nx = clamp(cx, x - BOX_W - pad, x + BOX_W + pad);
  const ny = clamp(cy, wy - BOX_H - pad, wy + BOX_H + pad);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

// ---------- the hidden climb, and everything laid out around it ----------

function planRun(rng) {
  const n = newNinja();
  const samples = []; // the reference ninja: { t, x, wy }
  const offs = []; // its take-offs: { t, wy, side }
  let cam = 0;
  let t = 0;
  let nextLeap = 2.7 + rng.range(0, 0.35);
  while (t < 61.5) {
    if (t >= nextLeap) {
      if (n.wall) {
        offs.push({ t, wy: n.ny - cam, side: n.wall, v: speedAt(t) });
        n.target = -n.wall;
        nextLeap = t + Math.max(0.62, intervalAt(t) * rng.range(0.78, 1.28));
      } else nextLeap = t + STEP;
    }
    cam += speedAt(t) * STEP;
    stepNinja(n, STEP, n.target, cam);
    t += STEP;
    samples.push({ t, x: n.x, wy: n.ny - cam });
  }

  // index the reference ninja by height, for quick "is this spot clear?" checks
  const BUCKET = 16;
  const buckets = new Map();
  for (const s of samples) {
    const k = Math.floor(s.wy / BUCKET);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const near = (y0, y1, fn) => {
    for (let k = Math.floor(y0 / BUCKET) - 1; k <= Math.floor(y1 / BUCKET) + 1; k++) {
      const list = buckets.get(k);
      if (list) for (const s of list) if (fn(s)) return true;
    }
    return false;
  };
  const wallClear = (h, m) =>
    !near(h.y0 - BOX_H - m, h.y1 + BOX_H + m, (s) => {
      if (s.wy + BOX_H + m <= h.y0 || s.wy - BOX_H - m >= h.y1) return false;
      const [a, b] = hazardSpan(h, s.wy);
      return s.x + BOX_W + 5 > a && s.x - BOX_W - 5 < b;
    });
  const bladeClear = (b, m) => !near(b.y - b.r - BOX_H - m, b.y + b.r + BOX_H + m, (s) => hitsCircle(b.x, b.y, b.r + 7, s.x, s.wy, m * 0.5));
  const starClear = (st) =>
    !near(st.y - STAR_R - BOX_H - 30, st.y + STAR_R + BOX_H + 30, (s) => {
      for (const dt of [-0.12, -0.06, 0, 0.06, 0.12]) {
        if (hitsCircle(starX(st, s.t + dt), st.y, STAR_R + 10, s.x, s.wy, 6)) return true;
      }
      return false;
    });

  // nothing within reach of the first ~2.3s, whatever the player does
  let early = 0;
  for (let tt = 0; tt < 2.4; tt += STEP) early += speedAt(tt) * STEP;
  const safeBelow = HOME_Y - early - 60;

  const walls = [];
  const blades = [];
  const stars = [];
  // between two take-offs the reference ninja runs up one wall; the other wall is free there,
  // so it gets stakes: the first one pushes the ninja off the wall it just left, the last ones
  // stop it from leaping back too early
  for (let j = 0; j < offs.length; j++) {
    const off = offs[j];
    const side = -off.side;
    const bottom = j === 0 ? safeBelow : offs[j - 1].wy;
    const top = off.wy;
    const tt = off.t;
    const p = progress(tt, 60, 1.1);
    const m = off.v * lerp(0.2, 0.1, p);
    const gapK = lerp(1, 0.25, p);
    let y = Math.min(bottom, safeBelow);
    let first = true;
    while (y > top - 30) {
      const branchy = tt > BRANCHES_FROM && !first && rng.chance(lerp(0.15, 0.3, p));
      const len = branchy ? rng.range(20, 26) : rng.range(36, 70 + 70 * p);
      const gw = halfAt(y) * 2;
      let placed = false;
      for (let y1 = y; y1 - len > top - (first ? 260 : 40); y1 -= 6) {
        const h = { kind: branchy ? 'branch' : 'stake', side, y0: y1 - len, y1, p: branchy ? gw - 74 : STAKE_P, t: tt };
        if (h.y1 > safeBelow) continue;
        if (wallClear(h, m)) {
          walls.push(h);
          y = h.y0;
          placed = true;
          break;
        }
      }
      if (!placed) break;
      first = false;
      // the opening before the next stakes: a spinning blade sometimes hangs in the middle of it
      const gap = rng.range(18, 60) + rng.range(0, 150) * gapK;
      if (tt > BLADES_FROM && gap > 50 && rng.chance(lerp(0.3, 0.55, p))) {
        const by = y - gap / 2;
        const b = { x: centreAt(by) + rng.range(-14, 14), y: by, r: BLADE_R, spin: rng.chance(0.5) ? 1 : -1 };
        if (b.y < safeBelow - 40 && bladeClear(b, m)) blades.push(b);
      }
      y -= gap;
    }
    // a shuriken ricocheting across the gorge somewhere along this stretch
    if (tt > STARS_FROM && rng.chance(lerp(0.3, 0.6, p))) {
      const sy = lerp(bottom, top, rng.range(0.2, 0.8));
      for (let k = 0; k < 6; k++) {
        const st = { y: sy, period: rng.range(1.0, 1.5) * lerp(1, 0.75, p), phase: rng.next() };
        if (starClear(st) && !blades.some((b) => Math.abs(b.y - sy) < 60)) {
          stars.push(st);
          break;
        }
      }
    }
  }
  walls.sort((a, b) => b.y1 - a.y1);
  blades.sort((a, b) => b.y - a.y);
  stars.sort((a, b) => b.y - a.y);
  return { walls, blades, stars };
}

// ---------- art ----------

const PAPER = '#efe4cc';
const INK = '#1b1a1f';
const RED = '#d2352b';

function paintSky(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f6ead2');
    sky.addColorStop(0.5, '#efe1c4');
    sky.addColorStop(1, '#e2d0ad');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // the setting sun, a vermilion seal of a disc
    const sun = g.createRadialGradient(232, 150, 10, 232, 150, 120);
    sun.addColorStop(0, 'rgba(232,90,60,0.32)');
    sun.addColorStop(1, 'rgba(232,90,60,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(214,62,44,0.82)';
    g.beginPath();
    g.arc(232, 150, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,190,150,0.25)';
    g.beginPath();
    g.arc(222, 140, 30, 0, Math.PI * 2);
    g.fill();
    // paper grain
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,95,60,0.06)' : 'rgba(255,255,245,0.12)';
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
    }
  }, 1);
}

// distant cliffs and pines in pale ink washes; tiles vertically
function paintCliffs(W, H, rng, tone, reach, pines) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let y = 0; y <= H; y += 20) {
        const u = (y / H) * Math.PI * 2;
        const w = reach + 26 * Math.sin(u * 2 + side) + 14 * Math.sin(u * 5 + side * 2) + (y % 80 === 0 ? 0 : rng.range(-8, 8));
        pts.push([side < 0 ? w : W - w, y]);
      }
      pts[pts.length - 1][0] = pts[0][0];
      g.fillStyle = tone;
      g.beginPath();
      g.moveTo(side < 0 ? 0 : W, 0);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(side < 0 ? 0 : W, H);
      g.closePath();
      g.fill();
      // dry-brush streaks down the rock
      g.strokeStyle = 'rgba(40,35,40,0.12)';
      g.lineWidth = 2;
      for (let k = 0; k < 24; k++) {
        const y = rng.range(0, H);
        const x = side < 0 ? rng.range(0, reach - 20) : W - rng.range(0, reach - 20);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + rng.range(-8, 8), y + 30, x + rng.range(-6, 6), y + rng.range(40, 90));
        g.stroke();
      }
      // little pines leaning out of the rock
      for (let k = 0; k < pines; k++) {
        const [px, py] = pts[1 + Math.floor(rng.range(0, pts.length - 3))];
        const lean = -side;
        const tx = px + lean * 12;
        const ty = py - 26;
        g.strokeStyle = tone;
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(px - lean * 4, py);
        g.quadraticCurveTo(px + lean * 8, py - 6, tx, ty);
        g.stroke();
        g.fillStyle = tone;
        for (let f = 0; f < 4; f++) {
          const w = 13 - f * 2.6;
          const y = py - 6 - f * 6;
          const x = px + lean * (5 + f * 2);
          g.beginPath();
          g.moveTo(x - w, y + 3);
          g.quadraticCurveTo(x, y - 3, x + w, y + 3);
          g.lineTo(x + lean * 2, y - 6);
          g.closePath();
          g.fill();
        }
      }
    }
  }, 1);
}

function paintMist(W) {
  return makeSprite(W, 120, (g) => {
    g.translate(-W / 2, -60);
    for (let k = 0; k < 7; k++) {
      const x = (k / 6) * W;
      const grad = g.createRadialGradient(x, 60, 4, x, 60, 90);
      grad.addColorStop(0, 'rgba(252,248,238,0.6)');
      grad.addColorStop(1, 'rgba(252,248,238,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, 60, 110, 46, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, 1);
}

// the near rock walls: dark ink with lighter dry-brush, moss and lichen; tiles vertically
function paintWall(H, rng) {
  const w = 140;
  return makeSprite(w, H, (g) => {
    g.translate(-w / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#1c1a1e');
    base.addColorStop(0.6, '#2e2b2e');
    base.addColorStop(1, '#4a4440');
    g.fillStyle = base;
    g.fillRect(0, 0, w, H);
    // strata: slanted blocks of rock with lit upper edges
    for (let y = -20; y < H + 20; y += rng.range(26, 48)) {
      const tilt = rng.range(-10, 10);
      g.strokeStyle = 'rgba(160,150,135,0.28)';
      g.lineWidth = rng.range(1, 2.6);
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(w * 0.5, y + tilt, w, y + tilt * 0.4);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, y + 3);
      g.quadraticCurveTo(w * 0.5, y + tilt + 3, w, y + tilt * 0.4 + 3);
      g.stroke();
    }
    // vertical cracks
    for (let k = 0; k < 16; k++) {
      let x = rng.range(10, w);
      let y = rng.range(0, H);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += rng.range(-6, 6);
        y += rng.range(8, 20);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // moss and lichen dabs, thicker near the face
    for (let k = 0; k < 140; k++) {
      const x = w - Math.abs(rng.range(0, 1) ** 2 * w);
      const y = rng.range(0, H);
      g.fillStyle = rng.chance(0.75) ? `rgba(98,120,70,${rng.range(0.25, 0.6)})` : `rgba(190,170,110,${rng.range(0.2, 0.4)})`;
      g.beginPath();
      g.ellipse(x, y, rng.range(1.5, 5), rng.range(1, 3), rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

// bamboo stakes jutting out of a wall (the wall is on the left of the sprite)
function paintStakes() {
  return makeSprite(64, 36, (g) => {
    for (const [y, len, tilt] of [[-8, 52, -0.22], [7, 46, -0.12]]) {
      g.save();
      g.translate(-30, y);
      g.rotate(tilt);
      const body = g.createLinearGradient(0, -5, 0, 5);
      body.addColorStop(0, '#d9e3a0');
      body.addColorStop(0.45, '#9fb35a');
      body.addColorStop(1, '#5c6e2c');
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(len - 14, -5);
      g.lineTo(len, 4.5); // the sharp diagonal cut
      g.lineTo(0, 5);
      g.closePath();
      g.fill();
      // the cut face, stained red
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(len - 14, -5);
      g.lineTo(len, 4.5);
      g.lineTo(len - 6, 4.8);
      g.closePath();
      g.fill();
      // nodes
      g.strokeStyle = 'rgba(50,60,20,0.8)';
      g.lineWidth = 1.6;
      for (const nx of [12, 28]) {
        g.beginPath();
        g.moveTo(nx, -5);
        g.lineTo(nx, 5);
        g.stroke();
      }
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(len - 14, -5);
      g.lineTo(len, 4.5);
      g.lineTo(0, 5);
      g.stroke();
      g.fillStyle = 'rgba(255,255,230,0.5)';
      g.fillRect(2, -3.6, len - 20, 1.4);
      g.restore();
    }
  }, 3);
}

// a gnarled, thorny dead branch (the wall is on the left of the sprite)
function paintBranch(len) {
  return makeSprite(len + 20, 40, (g) => {
    g.translate(-(len + 20) / 2 + 4, 0);
    g.lineCap = 'round';
    g.strokeStyle = INK;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, 4);
    g.bezierCurveTo(len * 0.3, -6, len * 0.6, 10, len, -2);
    g.stroke();
    g.strokeStyle = '#4a3a33';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(2, 2);
    g.bezierCurveTo(len * 0.3, -8, len * 0.6, 8, len - 4, -4);
    g.stroke();
    // twigs and red-tipped thorns
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      const x = u * len;
      const y = Math.sin(u * 6) * 3;
      const up = k % 2 ? -1 : 1;
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6, y + up * 12);
      g.stroke();
      g.fillStyle = RED;
      g.beginPath();
      g.moveTo(x + 4, y + up * 9);
      g.lineTo(x + 8, y + up * 15);
      g.lineTo(x + 8.5, y + up * 9);
      g.closePath();
      g.fill();
    }
  }, 2.5);
}

function paintBlade() {
  return makeSprite(52, 52, (g) => {
    for (let k = 0; k < 4; k++) {
      g.save();
      g.rotate((k * Math.PI) / 2);
      const grad = g.createLinearGradient(0, -24, 8, 0);
      grad.addColorStop(0, '#f2efe8');
      grad.addColorStop(0.5, '#8d8a90');
      grad.addColorStop(1, '#3a383e');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -24);
      g.quadraticCurveTo(4, -8, 9, -4);
      g.lineTo(0, 0);
      g.lineTo(-5, -6);
      g.closePath();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.stroke();
      g.restore();
    }
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, 0, 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = RED;
    g.beginPath();
    g.arc(0, 0, 3.4, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

function paintStar() {
  return makeSprite(28, 28, (g) => {
    for (let k = 0; k < 4; k++) {
      g.save();
      g.rotate((k * Math.PI) / 2);
      g.fillStyle = k % 2 ? '#c9c6cc' : '#7c7a82';
      g.beginPath();
      g.moveTo(0, -13);
      g.lineTo(3.4, -3.4);
      g.lineTo(0, 0);
      g.lineTo(-3.4, -3.4);
      g.closePath();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(0, 0, 2.2, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// the ninja; the wall is on its left. pose 0/1: running up the wall, 2: tucked mid-leap
function paintNinja(pose) {
  return makeSprite(48, 52, (g) => {
    const suit = g.createRadialGradient(2, -4, 2, 2, 2, 18);
    suit.addColorStop(0, '#4a4f86');
    suit.addColorStop(1, '#1d1f3e');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const limb = (x1, y1, x2, y2, x3, y3, w) => {
      g.strokeStyle = '#1d1f3e';
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(x3, y3);
      g.stroke();
    };
    if (pose === 2) {
      // a tight ball, knees to chest
      limb(-2, 8, 8, 12, 2, 2, 6);
      limb(-4, 2, -10, 10, -2, 12, 5.5);
      g.fillStyle = suit;
      g.beginPath();
      g.ellipse(0, 2, 11, 10, 0.3, 0, Math.PI * 2);
      g.fill();
      limb(4, -2, 12, 4, 8, 10, 4.5);
    } else {
      const a = pose === 0;
      // legs: feet planted on the wall
      limb(2, 8, a ? -6 : 4, a ? 16 : 18, -12, a ? 18 : 8, 6);
      limb(0, 9, a ? 6 : -4, a ? 18 : 16, -12, a ? 6 : 20, 6);
      g.fillStyle = suit;
      g.beginPath();
      g.ellipse(2, 0, 9, 12, -0.15, 0, Math.PI * 2);
      g.fill();
      // belt
      g.strokeStyle = '#8e2a22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-6, 6);
      g.lineTo(10, 4);
      g.stroke();
      // arms: one hand on the rock, one swinging
      limb(0, -6, -8, a ? -14 : -4, -12, a ? -20 : -8, 4.5);
      limb(4, -6, 12, a ? -2 : -10, 14, a ? 6 : -16, 4.5);
    }
    // head with the hood, eye slit looking up and out
    const hy = pose === 2 ? -9 : -15;
    const hx = pose === 2 ? 3 : 4;
    const hood = g.createRadialGradient(hx - 2, hy - 3, 1, hx, hy, 9);
    hood.addColorStop(0, '#565c98');
    hood.addColorStop(1, '#1d1f3e');
    g.fillStyle = hood;
    g.beginPath();
    g.arc(hx, hy, 8.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f0cfa4';
    g.beginPath();
    g.ellipse(hx + 3.5, hy - 1, 5.2, 2.6, -0.35, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(hx + 2.4, hy - 0.6, 1.3, 0, Math.PI * 2);
    g.arc(hx + 6, hy - 2, 1.2, 0, Math.PI * 2);
    g.fill();
    // red headband
    g.strokeStyle = RED;
    g.lineWidth = 2.6;
    g.beginPath();
    g.arc(hx, hy, 8.2, Math.PI * 0.95, Math.PI * 1.75);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(hx - 3, hy - 4, 3, 1.6, -0.5, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

function paintPetal() {
  return makeSprite(10, 8, (g) => {
    g.fillStyle = '#f4b6c2';
    g.beginPath();
    g.moveTo(-5, 0);
    g.quadraticCurveTo(0, -5, 5, -1);
    g.lineTo(3, 0);
    g.lineTo(5, 1);
    g.quadraticCurveTo(0, 5, -5, 0);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-3, -1, 4, 1);
  }, 3);
}

// ---------- the game ----------

const SMOKE = ['rgba(240,236,228,0.9)', 'rgba(200,196,190,0.8)', 'rgba(170,166,160,0.7)'];
const CHIPS = ['#4a4440', '#2e2b2e', '#8a8070'];
const PETALS = ['#f4b6c2', '#f8d0d8', '#e88aa0'];

export default {
  id: 'ninja',
  title: 'Ninja Gorge',
  emoji: '🥷',
  tagline: 'Tap ← or → to leap to that wall. Never touch a stake, blade or star.',
  colors: { bg: PAPER, fg: '#1b1a1f', accent: RED },

  // Taiko drum & bass, 168 BPM, in D (the Japanese "In" scale: D E♭ G A B♭). A two-step break,
  // floor-tom taiko and a growling sawtooth bass from the first bar; then koto-like triangle
  // plucks with echoes and a dark pad; then a breathy shakuhachi-style lead with vibrato; and a
  // finale with rolling taiko, a shaker, a rising noise wash, a 16th arpeggio and the lead doubled
  // an octave down. 42 bars = 60s.
  music: {
    cps: 0.7,
    setup: `
      const kick = note("d2 ~ ~ ~ ~ ~ ~ ~ ~ ~ d2 ~ ~ ~ ~ ~").s("sine").decay(0.28).sustain(0).gain(0.8)
      const kick2 = note("d2 ~ ~ ~ ~ ~ ~ d2 ~ ~ d2 ~ ~ ~ ~ ~").s("sine").decay(0.25).sustain(0).gain(0.8)
      const snare = s("~ ~ ~ ~ white ~ ~ ~ ~ ~ ~ ~ white ~ ~ ~").decay(0.15).sustain(0).hpf(1300).lpf(6000).gain(0.2).room(0.25)
      const ghost = s("~ ~ ~ ~ ~ ~ ~ white ~ ~ ~ ~ ~ white ~ white").decay(0.05).sustain(0).hpf(2000).lpf(5000).gain(0.06)
      const hats = s("[~ white]*8").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const taiko = note("a2 ~ ~ a2 ~ ~ d3 ~ a2 ~ ~ ~ d3 ~ a2 a2").s("sine").decay(0.22).sustain(0).gain(0.34)
      const taikoRoll = note("[d3 a2 a2 d3]*4").s("sine").decay(0.12).sustain(0).gain("[0.32 0.16 0.22 0.18]*4")
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(900).lpf(saw.range(800, 5000).slow(42)).gain(saw.range(0, 0.06).slow(42))
      const bass = note("<[d2 ~ ~ d2 ~ ~ d3 ~ ~ d2 ~ ~ eb2 ~ d2 ~] [bb2 ~ ~ bb2 ~ ~ bb2 ~ ~ a2 ~ ~ g2 ~ a2 ~] [g2 ~ ~ g2 ~ ~ d3 ~ ~ g2 ~ ~ bb2 ~ a2 ~] [a2 ~ ~ a2 ~ ~ eb3 ~ ~ d3 ~ ~ a2 ~ bb2 ~]>")
        .s("sawtooth").decay(0.2).sustain(0.4).release(0.06).lpf(saw.range(450, 1400).slow(42)).lpq(4).gain(0.36)
      const koto = note("<[d5 a4 bb4 d5 eb5 d5 a4 g4] [bb4 g4 d5 bb4 eb5 d5 bb4 a4] [g4 d4 bb4 g4 d5 bb4 a4 g4] [a4 d5 eb5 d5 a4 bb4 a4 eb4]>")
        .s("triangle").decay(0.16).sustain(0).lpf(saw.range(1800, 3400).slow(42)).gain(0.11).pan(0.4)
        .delay(0.2).delaytime(0.268).delayfeedback(0.25)
      const pad = note("<[d3,a3,eb4] [bb2,g3,d4] [g2,d3,bb3] [a2,eb3,a3]>").s("sawtooth")
        .attack(0.3).decay(0.6).sustain(0.6).release(0.5).lpf(1000).gain(0.05).room(0.4)
      const tune = "<[d5 ~ ~ eb5 d5 ~ a4 ~ bb4 ~ a4 ~ g4 ~ ~ ~] [bb4 ~ ~ d5 eb5 ~ d5 ~ bb4 ~ a4 ~ bb4 ~ ~ ~] [g5 ~ ~ eb5 d5 ~ bb4 ~ d5 ~ eb5 ~ d5 ~ ~ ~] [a4 ~ bb4 ~ a4 ~ g4 ~ eb4 ~ ~ ~ d4 ~ ~ ~]>"
      const flute = note(tune).s("triangle").attack(0.03).decay(0.3).sustain(0.5).release(0.15).lpf(2600)
        .vib(5).vibmod(0.2).gain(0.13).room(0.4).delay(0.2).delaytime(0.268).delayfeedback(0.3).pan(0.58)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.2).sustain(0.3).release(0.08).lpf(1300).gain(0.045).pan(0.42)
      const arp = note("<[d5 eb5 a5 eb5]*4 [bb4 d5 g5 d5]*4 [g4 bb4 d5 bb4]*4 [a4 d5 eb5 d5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3600).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, taiko, bass)],
      [12, stack(kick, snare, ghost, hats, taiko, bass, koto, pad)],
      [12, stack(kick2, snare, ghost, hats, taiko, bass, koto, pad, flute)],
      [10, stack(kick2, snare, ghost, shaker, taikoRoll, wash, bass, koto, pad, flute, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const { walls, blades, stars } = planRun(rng.fork('climb'));

    const sky = paintSky(W, H);
    const farCliffs = paintCliffs(W, H, art, 'rgba(176,166,150,0.55)', 140, 7);
    const midCliffs = paintCliffs(W, H, art, 'rgba(120,112,104,0.55)', 108, 5);
    const mist = paintMist(W);
    const wallTex = paintWall(H, art);
    const stakeArt = paintStakes();
    const branchArts = new Map();
    const branchArt = (len) => {
      const k = Math.round(len / 10) * 10;
      if (!branchArts.has(k)) branchArts.set(k, paintBranch(k));
      return branchArts.get(k);
    };
    const bladeArt = paintBlade();
    const starArt = paintStar();
    const ninjaArt = [paintNinja(0), paintNinja(1), paintNinja(2)];
    const petalArt = paintPetal();
    const redGlow = glowSprite('rgba(230,60,40,0.9)', 30);
    const warmGlow = glowSprite('rgba(255,170,110,0.8)', 50);
    const vignette = vignetteSprite(W, H, 0.5, '50,30,15');
    const fx = createParticles();
    const ink = createParticles();

    // moss tufts and ferns along the wall faces (cosmetic, world-fixed)
    const tufts = [];
    for (let y = 400; y > -17000; y -= art.range(40, 90)) tufts.push({ y, side: art.chance(0.5) ? -1 : 1, s: art.range(0.7, 1.3), fern: art.chance(0.35) });
    const petals = [];
    for (let i = 0; i < 14; i++) petals.push({ x: Math.random() * W, y: Math.random() * H, vx: 10 + Math.random() * 20, vy: 18 + Math.random() * 20, r: Math.random() * 6, w: 1 + Math.random() * 2 });

    const n = newNinja();
    let cam = 0;
    let clock = 0;
    let runPhase = 0;
    let spin = 0;
    let deadT = 0;
    let deathKind = '';
    let wi = 0; // first wall hazard that might still be ahead
    const scarf = [];
    for (let i = 0; i < 7; i++) scarf.push({ x: n.x, y: n.ny + i * 4 });

    const die = (game, reason, kind) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      n.vx = -n.wall * 60 || n.vx * 0.3;
      n.vy = kind === 'fall' ? n.vy : -180;
      fx.burst(n.x, n.ny, { count: 26, speed: 120, life: 1.1, size: 9, drag: 2.5, round: true, colors: SMOKE });
      fx.burst(n.x, n.ny, { count: 14, speed: 160, life: 1.2, size: 5, gravity: 120, colors: PETALS });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      for (const p of petals) {
        p.x += (p.vx + Math.sin(clock * p.w + p.r) * 16) * dt;
        p.y += p.vy * dt;
        p.r += dt * p.w;
        if (p.x > W + 10) p.x = -10;
        if (p.y > H + 10) {
          p.y = -10;
          p.x = Math.random() * W;
        }
      }
      // the headband tails stream out behind the head
      const head = headPos();
      scarf[0].x = head.x;
      scarf[0].y = head.y;
      for (let i = 1; i < scarf.length; i++) {
        const a = scarf[i - 1];
        const b = scarf[i];
        b.y += (40 + Math.sin(clock * 9 + i) * 18) * dt * 3;
        b.x += Math.sin(clock * 7 + i * 0.8) * 10 * dt - (n.wall ? n.wall * 60 * dt : 0);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        b.x = a.x + (dx / d) * 5;
        b.y = a.y + (dy / d) * 5;
      }
      fx.update(dt);
      ink.update(dt, speedAt(clock));
    };

    const headPos = () => {
      if (!n.wall) return { x: n.x + Math.cos(spin - Math.PI / 2) * 9, y: n.ny + Math.sin(spin - Math.PI / 2) * 9 };
      return { x: n.x - n.wall * 3.7, y: n.ny - 14 };
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        cam += speedAt(t) * dt;
        const wasWall = n.wall;
        const ev = stepNinja(n, dt, dir, cam);
        updateCosmetic(dt);
        const wy = n.ny - cam;
        if (n.wall) runPhase += speedAt(t) * dt;
        else spin += (n.vx > 0 ? 1 : -1) * 15 * dt;
        if (ev === 'launch') {
          spin = 0;
          fx.burst(n.x, n.ny + 6, { count: 8, speed: 90, angle: wasWall < 0 ? Math.PI : 0, spread: 1.4, life: 0.5, size: 3, gravity: 300, colors: CHIPS });
        } else if (ev === 'land') {
          ink.burst(n.x + n.wall * 6, n.ny, { count: 10, speed: 110, angle: n.wall < 0 ? 0 : Math.PI, spread: 2, life: 0.45, size: 3.5, drag: 3, colors: CHIPS });
          fx.burst(n.x + n.wall * 4, n.ny + 4, { count: 6, speed: 60, life: 0.5, size: 7, drag: 3, round: true, colors: SMOKE });
        }
        if (n.wall && Math.random() < dt * 6) {
          ink.burst(n.x + n.wall * 8, n.ny + 14, { count: 1, speed: 30, angle: Math.PI / 2, spread: 0.6, life: 0.7, size: 2.5, gravity: 400, colors: CHIPS });
        }

        // hazards
        while (wi < walls.length && walls[wi].y0 > wy + 60) wi++;
        for (let i = wi; i < walls.length && walls[i].y1 > wy - 60; i++) {
          const h = walls[i];
          if (hitsWall(h, n.x, wy)) {
            return h.kind === 'branch' ? die(this, 'Snagged on a thorny branch.', 'hit') : die(this, 'Ran into the bamboo stakes.', 'hit');
          }
        }
        for (const b of blades) {
          if (Math.abs(b.y - wy) > 60) continue;
          if (hitsCircle(b.x, b.y, b.r - 2, n.x, wy)) return die(this, 'Sliced by a spinning blade.', 'hit');
        }
        for (const s of stars) {
          if (Math.abs(s.y - wy) > 50) continue;
          if (hitsCircle(starX(s, t), s.y, STAR_R - 1, n.x, wy)) return die(this, 'Hit by a ricocheting shuriken.', 'hit');
        }
        if (t < 2.5) n.ny = Math.min(n.ny, H - 40);
        if (n.ny > H + 30) return die(this, 'Hung in the air too long and fell into the gorge.', 'fall');
      },

      afterlife(dt) {
        deadT += dt;
        n.vy += 900 * dt;
        n.ny += n.vy * dt;
        n.x += n.vx * dt;
        spin += dt * 9;
        n.wall = 0;
        updateCosmetic(dt);
      },

      render(g, t) {
        drawSprite(g, sky, W / 2, H / 2);
        // distant cliffs (slow) and nearer ones, tiling as we climb
        for (const [layer, k] of [[farCliffs, 0.22], [midCliffs, 0.45]]) {
          const off = (cam * k) % H;
          g.drawImage(layer.canvas, 0, off - H, W, H);
          g.drawImage(layer.canvas, 0, off, W, H);
        }
        // mist drifting through the gorge
        for (let k = 0; k < 3; k++) {
          const yy = ((cam * 0.7 + k * 260) % (H + 240)) - 120;
          drawSprite(g, mist, W / 2 + Math.sin(clock * 0.3 + k * 2) * 30, yy, { alpha: 0.75 });
        }

        // the walls of the gorge
        const off = cam % H;
        for (const side of [-1, 1]) {
          g.save();
          g.beginPath();
          g.moveTo(side < 0 ? -2 : W + 2, -20);
          for (let sy = -20; sy <= H + 20; sy += 16) g.lineTo(faceAt(side, sy - cam), sy);
          g.lineTo(side < 0 ? -2 : W + 2, H + 20);
          g.closePath();
          g.clip();
          if (side > 0) {
            g.translate(W, 0);
            g.scale(-1, 1);
          }
          g.drawImage(wallTex.canvas, -10, off - H, 140 + 60, H);
          g.drawImage(wallTex.canvas, -10, off, 140 + 60, H);
          g.restore();
          // a bold brush line along the face
          g.strokeStyle = INK;
          g.lineWidth = 4;
          g.lineJoin = 'round';
          g.beginPath();
          for (let sy = -20; sy <= H + 20; sy += 16) g.lineTo(faceAt(side, sy - cam), sy);
          g.stroke();
          g.strokeStyle = 'rgba(200,190,170,0.35)';
          g.lineWidth = 1.5;
          g.beginPath();
          for (let sy = -20; sy <= H + 20; sy += 16) g.lineTo(faceAt(side, sy - cam) - side * 5, sy);
          g.stroke();
        }
        // moss and ferns on the faces
        for (const tf of tufts) {
          const sy = tf.y + cam;
          if (sy < -20 || sy > H + 20) continue;
          const fx0 = faceAt(tf.side, tf.y);
          g.fillStyle = 'rgba(110,135,72,0.9)';
          g.beginPath();
          g.ellipse(fx0 - tf.side * 2, sy, 4 * tf.s, 7 * tf.s, 0, 0, Math.PI * 2);
          g.fill();
          if (tf.fern) {
            g.strokeStyle = 'rgba(90,120,60,0.9)';
            g.lineWidth = 1.4;
            for (let f = 0; f < 4; f++) {
              g.beginPath();
              g.moveTo(fx0 - tf.side * 2, sy);
              g.quadraticCurveTo(fx0 - tf.side * 4, sy - 8 - f * 3, fx0 - tf.side * (2 + f * 2), sy - 14 - f * 3);
              g.stroke();
            }
          }
        }

        // hazards
        const top = -cam - 80;
        const bottom = H - cam + 80;
        for (let i = Math.max(0, wi - 6); i < walls.length; i++) {
          const h = walls[i];
          if (h.y0 > bottom) continue;
          if (h.y1 < top) break;
          const count = Math.max(1, Math.round((h.y1 - h.y0) / 26));
          for (let k = 0; k < count; k++) {
            const wyk = h.y0 + ((k + 0.5) * (h.y1 - h.y0)) / count;
            const sy = wyk + cam;
            const face = faceAt(h.side, wyk);
            g.save();
            g.translate(face, sy);
            g.scale(-h.side, 1);
            if (h.kind === 'branch') {
              const art2 = branchArt(h.p + 6);
              drawSprite(g, art2, art2.w / 2 - 8, 0);
            } else {
              drawSprite(g, stakeArt, 22, 0);
            }
            g.restore();
            if (h.kind === 'branch') break;
          }
        }
        for (const b of blades) {
          const sy = b.y + cam;
          if (sy < -60 || sy > H + 60) continue;
          g.strokeStyle = 'rgba(30,28,32,0.8)';
          g.lineWidth = 2;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.moveTo(b.x, sy - 90);
          g.lineTo(b.x, sy - b.r);
          g.stroke();
          g.setLineDash([]);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, b.x, sy, { size: b.r * 3.4, alpha: 0.35 + 0.1 * Math.sin(clock * 6) });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, bladeArt, b.x, sy, { size: b.r * 2.6, rot: clock * 9 * b.spin });
        }
        for (const s of stars) {
          const sy = s.y + cam;
          if (sy < -40 || sy > H + 40) continue;
          for (let k = 3; k >= 1; k--) {
            drawSprite(g, starArt, starX(s, t - k * 0.03), sy, { size: STAR_R * 2.6, rot: clock * 22, alpha: 0.12 * (4 - k) });
          }
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, starX(s, t), sy, { size: 50, alpha: 0.35 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, starArt, starX(s, t), sy, { size: STAR_R * 2.6, rot: clock * 22 });
        }

        // petals drifting through
        for (const p of petals) drawSprite(g, petalArt, p.x, p.y, { size: 9, rot: p.r });

        // the ninja and its streaming red headband
        if (!this.dead || deadT < 2) {
          g.strokeStyle = RED;
          g.lineCap = 'round';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(scarf[0].x, scarf[0].y);
          for (let i = 1; i < scarf.length; i++) g.lineTo(scarf[i].x, scarf[i].y);
          g.stroke();
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(scarf[0].x, scarf[0].y);
          for (let i = 1; i < scarf.length - 2; i++) g.lineTo(scarf[i].x + 3, scarf[i].y + 2);
          g.stroke();
          if (!n.wall && !this.dead) {
            // brush speed lines behind a leap
            g.strokeStyle = 'rgba(27,26,31,0.25)';
            g.lineWidth = 2;
            for (let k = -1; k <= 1; k++) {
              g.beginPath();
              g.moveTo(n.x - Math.sign(n.vx) * 14, n.ny + k * 8);
              g.lineTo(n.x - Math.sign(n.vx) * 40, n.ny + k * 8 + 10);
              g.stroke();
            }
          }
          g.save();
          g.translate(n.x, n.ny);
          if (n.wall) {
            if (n.wall > 0) g.scale(-1, 1);
            drawSprite(g, ninjaArt[Math.floor(runPhase / 26) % 2], 0, 0, { size: 44 });
          } else {
            if (n.vx < 0 && !this.dead) g.scale(-1, 1);
            g.rotate(this.dead ? spin : Math.abs(spin));
            drawSprite(g, ninjaArt[2], 0, 0, { size: 44 });
          }
          g.restore();
        }

        ink.render(g);
        fx.render(g);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, warmGlow, 232, 150 - ((cam * 0.05) % 30), { size: 160, alpha: 0.12 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);

        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `700 13px ${BODY_FONT}`;
        g.fillStyle = 'rgba(245,236,215,0.92)';
        g.fillText(`⛰ ${Math.floor(cam / 10)} m`, 12, H - 12);
      },
    };
    return game;
  },
};
