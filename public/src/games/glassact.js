// Glass Act — a glassblowers' workshop on Murano. Masters lean out of the arches of the gallery
// and toss freshly cooled glass baubles down to you, the apprentice with the padded basket.
// Glass only survives a soft catch: at the moment it drops into the basket you have to be moving
// the way it's moving. A bauble lobbed straight down needs you standing still under it; one
// thrown across the room is drifting sideways, so you must be running along with it as it lands.
// Standing still under a drifter, running through a straight one, running against one, or
// letting one hit the floor shatters it, and the run is over.
//
// Every throw shows its landing ring on the floor as soon as the master winds up: gold rings
// with a dot mean "stand still", teal rings with chevrons mean "run this way", and a ring turns
// green while your speed would make a soft catch. A faint dashed line on the floor shows the
// glass's path from the arch.
// The whole sequence is planned up front around a hidden reference apprentice who runs at ~80%
// of your speed, so every catch can be made from wherever the previous one left you. Over the
// minute, flights get shorter, catches come closer together, more throws drift, and from ~22s
// two drifters can come down one after the other for a single run-through.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, createMover, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const PY = 548; // the apprentice's line (floor under the basket)
const S = 270; // top speed
const CATCH_R = 28; // how far off-centre the basket still catches
const TOL = 150; // how different your speed and the glass's may be for a soft catch
const ARCH_X = [30, 80, 130, 180, 230, 280, 330];
const ARCH_Y = 126; // the throwers' hands, on the floor plane
const HAND_H = 26; // release height above that
const CATCH_H = 14; // the basket's height
const LX_MIN = 40;
const LX_MAX = 320;
const DX_MIN = 62; // drifters land far enough from the walls to run on through
const DX_MAX = 298;
const WIND = 0.45;
const BAR_Y = 138; // top of the gallery balustrade

const GLASS = [
  { deep: '#0a2a8a', mid: '#2f6cf0', hi: '#bfe0ff', spark: '#7fb0ff' }, // cobalt
  { deep: '#6a0418', mid: '#e0234a', hi: '#ffc2cc', spark: '#ff7a90' }, // ruby
  { deep: '#06502e', mid: '#18b56a', hi: '#c4ffd8', spark: '#6cf0a8' }, // emerald
  { deep: '#7a3a00', mid: '#f29a16', hi: '#fff0b8', spark: '#ffc860' }, // amber
  { deep: '#3e0a6a', mid: '#9a4ae8', hi: '#ead2ff', spark: '#c79aff' }, // amethyst
  { deep: '#005a60', mid: '#18c8c8', hi: '#ccfffa', spark: '#70f0ea' }, // aqua
];

// ---------- the plan: every throw, decided up front ----------

function makePlan(rng) {
  const list = [];
  const archFree = ARCH_X.map(() => -9);
  let L = 2.7; // the first catch
  let pos = 180; // where the reference apprentice is
  let first = true;
  const need = (from, b) => {
    const a = b.drift ? b.lx - Math.sign(b.bv) * 48 : b.lx;
    return Math.abs(a - from) / (0.8 * S) + (b.drift ? 48 / (0.8 * S) : 0.16) + 0.1;
  };
  const after = (b) => (b.drift ? clamp(b.lx + Math.sign(b.bv) * 25, 20, 340) : b.lx);
  const place = (b, Lt, n) => {
    // the arch must be free; wait for it if not
    Lt = Math.max(Lt, archFree[b.a] + WIND + b.T + 0.05);
    b.L = Lt;
    b.tr = Lt - b.T; // release
    // the landing ring always shows early enough to get there
    b.tw = Math.min(b.tr - WIND, Lt - n - 0.35);
    archFree[b.a] = b.tr + 0.35;
    list.push(b);
    return Lt;
  };
  let colorIx = rng.int(0, GLASS.length - 1);
  const nextColor = () => {
    colorIx = (colorIx + rng.int(1, GLASS.length - 1)) % GLASS.length;
    return colorIx;
  };
  while (L < 61.5) {
    const p = progress(L, 60, 1.25);
    const T = lerp(1.45, 0.92, p) * rng.range(0.94, 1.08);
    const arcH = rng.range(90, 150) * lerp(1, 0.8, p);
    let b = null;
    if (!first && rng.chance(lerp(0.34, 0.62, p))) {
      const sgn = rng.chance(0.5) ? 1 : -1;
      const bv = rng.range(175, 232);
      const opts = [];
      ARCH_X.forEach((x, i) => {
        const lx = x + sgn * bv * T;
        if (lx >= DX_MIN && lx <= DX_MAX) opts.push(i);
      });
      if (opts.length) {
        const a = rng.pick(opts);
        b = { a, x0: ARCH_X[a], lx: ARCH_X[a] + sgn * bv * T, T, bv: sgn * bv, drift: true, arcH, col: nextColor() };
      }
    }
    if (!b) {
      let a = rng.int(0, ARCH_X.length - 1);
      if (first) a = 3;
      const lx = clamp(ARCH_X[a] + rng.range(-20, 20), LX_MIN, LX_MAX);
      b = { a, x0: ARCH_X[a], lx, T, bv: (lx - ARCH_X[a]) / T, drift: false, arcH, col: nextColor() };
    }
    const n = need(pos, b);
    if (!first) {
      const gapMin = lerp(1.25, 0.4, p) * rng.range(0.95, 1.3);
      L += Math.max(gapMin, n * lerp(1.4, 1.02, p));
    }
    L = place(b, L, n);
    pos = after(b);
    first = false;
    // a run-through pair: a second drifter landing just ahead, the same way
    if (b.drift && L > 22 && rng.chance(lerp(0.12, 0.26, p))) {
      const sgn = Math.sign(b.bv);
      const dt = rng.range(0.3, 0.4);
      const lx2 = b.lx + sgn * S * 0.82 * dt;
      const T2 = T * rng.range(0.92, 1.05);
      if (lx2 >= DX_MIN && lx2 <= DX_MAX) {
        const cands = [];
        ARCH_X.forEach((x, i) => {
          const v = ((lx2 - x) * sgn) / T2;
          if (v >= 165 && v <= 240 && i !== b.a) cands.push(i);
        });
        if (cands.length) {
          const a = rng.pick(cands);
          const b2 = { a, x0: ARCH_X[a], lx: lx2, T: T2, bv: (lx2 - ARCH_X[a]) / T2, drift: true, arcH: arcH * 0.9, col: nextColor(), pair: true };
          const want = L + dt;
          const got = place(b2, want, n + dt);
          if (got > want + 0.01) {
            // the arch wasn't free in time: it simply comes later, as its own catch
          }
          L = got;
          pos = after(b2);
        }
      }
    }
  }
  return list.sort((x, y) => x.L - y.L);
}

// ---------- art ----------

function paintScene(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the wall behind the gallery: old brick lit from below by the furnaces
    const wall = g.createLinearGradient(0, 0, 0, 150);
    wall.addColorStop(0, '#1a0c10');
    wall.addColorStop(1, '#4a1e16');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, 150);
    for (let y = 0; y < 150; y += 7) {
      const off = (y / 7) % 2 ? 0 : 9;
      for (let x = -off; x < W; x += 18) {
        g.fillStyle = `rgba(${rng.chance(0.5) ? '150,60,40' : '90,30,24'},${rng.range(0.15, 0.4).toFixed(3)})`;
        g.fillRect(x + 0.6, y + 0.6, 16.8, 5.8);
      }
    }
    // the arches of the gallery, glowing from the furnaces behind
    for (const ax of ARCH_X) {
      const x0 = ax - 21;
      g.save();
      g.beginPath();
      g.moveTo(x0, BAR_Y + 4);
      g.lineTo(x0, 82);
      g.arc(ax, 82, 21, Math.PI, TAU);
      g.lineTo(ax + 21, BAR_Y + 4);
      g.closePath();
      const inner = g.createLinearGradient(0, 60, 0, BAR_Y);
      inner.addColorStop(0, '#2a0e0a');
      inner.addColorStop(0.6, '#8a2e10');
      inner.addColorStop(1, '#ff8a2a');
      g.fillStyle = inner;
      g.fill();
      g.clip();
      // a furnace mouth deep inside
      const fm = g.createRadialGradient(ax, BAR_Y - 6, 2, ax, BAR_Y - 6, 26);
      fm.addColorStop(0, 'rgba(255,230,150,0.9)');
      fm.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = fm;
      g.fillRect(x0, 60, 42, 90);
      // shelves of finished glass in silhouette
      g.fillStyle = 'rgba(30,8,6,0.55)';
      g.fillRect(x0, 92, 42, 2);
      for (let k = 0; k < 3; k++) {
        const vx = x0 + 7 + k * 13 + rng.range(-2, 2);
        g.beginPath();
        g.ellipse(vx, 88, 3.2, 4.5, 0, 0, TAU);
        g.fill();
        g.fillRect(vx - 1, 82, 2, 4);
      }
      g.restore();
      // stone frame
      g.strokeStyle = '#d8b48a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, BAR_Y + 2);
      g.lineTo(x0, 82);
      g.arc(ax, 82, 21, Math.PI, TAU);
      g.lineTo(ax + 21, BAR_Y + 2);
      g.stroke();
      g.strokeStyle = 'rgba(80,40,20,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(ax, 82, 23, Math.PI, TAU);
      g.stroke();
      // keystone
      g.fillStyle = '#e8c89a';
      g.beginPath();
      g.moveTo(ax - 4, 58);
      g.lineTo(ax + 4, 58);
      g.lineTo(ax + 3, 65);
      g.lineTo(ax - 3, 65);
      g.closePath();
      g.fill();
    }
    // cornice above the arches
    g.fillStyle = '#c89c70';
    g.fillRect(0, 46, W, 5);
    g.fillStyle = 'rgba(60,24,12,0.6)';
    g.fillRect(0, 51, W, 3);
    g.fillStyle = 'rgba(255,230,190,0.35)';
    g.fillRect(0, 46, W, 1);

    // the floor: Venetian terrazzo, speckled marble chips in warm lime
    const floor = g.createLinearGradient(0, 150, 0, H);
    floor.addColorStop(0, '#6a3a28');
    floor.addColorStop(0.35, '#a8735a');
    floor.addColorStop(1, '#8a5a44');
    g.fillStyle = floor;
    g.fillRect(0, 150, W, H - 150);
    const chips = ['#e8d2b8', '#c25a3a', '#f2e6d0', '#5a2a1e', '#d89a6a', '#7a8a7a', '#ffffff'];
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(0, W);
      const y = rng.range(150, H);
      g.fillStyle = rng.pick(chips);
      g.globalAlpha = rng.range(0.15, 0.55);
      const s = rng.range(0.6, 2.2);
      g.fillRect(x, y, s, s * rng.range(0.6, 1.2));
    }
    g.globalAlpha = 1;
    // inlaid border bands and a big compass-rose medallion
    g.strokeStyle = 'rgba(40,14,10,0.55)';
    g.lineWidth = 6;
    g.strokeRect(10, 170, W - 20, H - 186);
    g.strokeStyle = 'rgba(240,220,190,0.35)';
    g.lineWidth = 1.5;
    g.strokeRect(17, 177, W - 34, H - 200);
    const mx = W / 2;
    const my = 340;
    g.fillStyle = 'rgba(40,14,10,0.35)';
    g.beginPath();
    g.arc(mx, my, 74, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(240,220,190,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx, my, 70, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(mx, my, 52, 0, TAU);
    g.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k * TAU) / 16;
      const r = k % 2 ? 40 : 66;
      g.fillStyle = k % 4 === 0 ? 'rgba(200,70,40,0.55)' : k % 2 ? 'rgba(240,220,190,0.3)' : 'rgba(30,60,90,0.45)';
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(mx + Math.cos(a - 0.17) * 14, my + Math.sin(a - 0.17) * 14);
      g.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
      g.lineTo(mx + Math.cos(a + 0.17) * 14, my + Math.sin(a + 0.17) * 14);
      g.closePath();
      g.fill();
    }
    // the apprentice's runner: a worn crimson strip along the catching line
    const run = g.createLinearGradient(0, PY - 22, 0, PY + 26);
    run.addColorStop(0, '#5a0e18');
    run.addColorStop(0.5, '#8a1a26');
    run.addColorStop(1, '#4a0a14');
    g.fillStyle = run;
    g.fillRect(0, PY - 20, W, 44);
    g.fillStyle = 'rgba(255,200,120,0.5)';
    g.fillRect(0, PY - 20, W, 1.5);
    g.fillRect(0, PY + 22, W, 1.5);
    g.strokeStyle = 'rgba(255,200,120,0.18)';
    g.lineWidth = 1;
    for (let x = 6; x < W; x += 14) {
      g.beginPath();
      g.moveTo(x, PY - 16);
      g.lineTo(x + 7, PY - 10);
      g.lineTo(x + 14, PY - 16);
      g.moveTo(x, PY + 18);
      g.lineTo(x + 7, PY + 12);
      g.lineTo(x + 14, PY + 18);
      g.stroke();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(0,0,0,${rng.range(0.03, 0.1).toFixed(3)})`;
      g.fillRect(rng.range(0, W), rng.range(PY - 20, PY + 24), rng.range(1, 4), 1);
    }
    // crates of straw at the far bottom
    for (const cx of [40, 320]) {
      g.fillStyle = '#5a3418';
      g.fillRect(cx - 26, 598, 52, 34);
      g.fillStyle = '#7a4a22';
      for (let k = 0; k < 3; k++) g.fillRect(cx - 26, 600 + k * 11, 52, 8);
      g.fillStyle = '#e8c25a';
      for (let k = 0; k < 30; k++) {
        g.save();
        g.translate(cx + rng.range(-24, 24), 598 + rng.range(-3, 2));
        g.rotate(rng.range(-1, 1));
        g.fillRect(-4, -0.6, 8, 1.2);
        g.restore();
      }
    }
    // furnace light spilling down the floor from the gallery
    g.globalCompositeOperation = 'lighter';
    const spill = g.createLinearGradient(0, 140, 0, 420);
    spill.addColorStop(0, 'rgba(255,140,50,0.28)');
    spill.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = spill;
    g.fillRect(0, 140, W, 280);
    g.globalCompositeOperation = 'source-over';
  });
}

function paintBalustrade(W) {
  return makeSprite(W, 26, (g) => {
    g.translate(-W / 2, -13);
    g.fillStyle = 'rgba(20,6,4,0.45)';
    g.fillRect(0, 20, W, 6);
    // balusters
    for (let x = 4; x < W; x += 10) {
      const grad = g.createLinearGradient(x - 3, 0, x + 3, 0);
      grad.addColorStop(0, '#8a6444');
      grad.addColorStop(0.5, '#f0d6b0');
      grad.addColorStop(1, '#9a7250');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - 1.6, 5);
      g.quadraticCurveTo(x - 4, 11, x - 1.6, 13);
      g.quadraticCurveTo(x - 3.4, 17, x - 2, 20);
      g.lineTo(x + 2, 20);
      g.quadraticCurveTo(x + 3.4, 17, x + 1.6, 13);
      g.quadraticCurveTo(x + 4, 11, x + 1.6, 5);
      g.closePath();
      g.fill();
    }
    // handrail and plinth
    const rail = g.createLinearGradient(0, 0, 0, 6);
    rail.addColorStop(0, '#fff0d6');
    rail.addColorStop(1, '#b08860');
    g.fillStyle = rail;
    g.fillRect(0, 0, W, 6);
    g.fillStyle = '#9a7454';
    g.fillRect(0, 19, W, 3);
  });
}

function makeChandelier() {
  return makeSprite(120, 50, (g) => {
    g.strokeStyle = 'rgba(255,220,170,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -25);
    g.lineTo(0, -8);
    g.stroke();
    const arms = [-46, -30, -14, 14, 30, 46];
    const cols = ['#ff7a90', '#7fb0ff', '#6cf0a8', '#ffc860', '#c79aff', '#70f0ea'];
    arms.forEach((ax, i) => {
      g.strokeStyle = cols[i];
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(0, -4);
      g.quadraticCurveTo(ax * 0.6, 14, ax, 2);
      g.stroke();
      g.fillStyle = '#fff6e0';
      g.fillRect(ax - 1.5, -6, 3, 8);
      g.fillStyle = cols[(i + 2) % 6];
      g.beginPath();
      g.ellipse(ax, 4, 4, 2, 0, 0, TAU);
      g.fill();
    });
    const body = g.createLinearGradient(0, -10, 0, 20);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(1, '#9ad0ff');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 4, 7, 12, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#ff7a90';
    g.beginPath();
    g.arc(0, 18, 3.5, 0, TAU);
    g.fill();
  });
}

function makeGlassBody(c) {
  return makeSprite(26, 26, (g) => {
    const r = 11;
    const grad = g.createRadialGradient(-3, -4, 1, 0, 0, r);
    grad.addColorStop(0, c.hi);
    grad.addColorStop(0.45, c.mid);
    grad.addColorStop(1, c.deep);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.clip();
    // twisted ribbons of latticino
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = k === 1 ? 'rgba(255,240,200,0.55)' : 'rgba(255,255,255,0.32)';
      g.lineWidth = k === 1 ? 1.2 : 1.8;
      g.beginPath();
      for (let s = 0; s <= 24; s++) {
        const yy = -r + (2 * r * s) / 24;
        const xx = Math.sin((s / 24) * Math.PI * 1.7 + k * 2.1) * r * 0.65;
        if (s) g.lineTo(xx, yy);
        else g.moveTo(xx, yy);
      }
      g.stroke();
    }
    // a millefiori flower
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6;
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.arc(3 + Math.cos(a) * 2.4, 3 + Math.sin(a) * 2.4, 1.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = c.spark;
    g.beginPath();
    g.arc(3, 3, 1.2, 0, TAU);
    g.fill();
    // inner shadow
    const sh = g.createRadialGradient(-2, -3, r * 0.4, 0, 0, r);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,20,0.4)');
    g.fillStyle = sh;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(0, 0, r - 0.4, 0, TAU);
    g.stroke();
  });
}

function makeGlint() {
  return makeSprite(26, 26, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(-4, -5, 3.4, 1.9, -0.7, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.ellipse(5, 5, 2, 1.1, -0.7, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 8.6, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke();
  });
}

function makeApprentice() {
  return makeSprite(44, 56, (g) => {
    // legs
    g.fillStyle = '#2a1e2a';
    g.fillRect(-8, 14, 6, 12);
    g.fillRect(2, 14, 6, 12);
    g.fillStyle = '#1a0e08';
    g.beginPath();
    g.roundRect(-9.5, 24, 8, 4, 2);
    g.roundRect(1.5, 24, 8, 4, 2);
    g.fill();
    // shirt
    const shirt = g.createLinearGradient(-12, -10, 12, 12);
    shirt.addColorStop(0, '#fff8ec');
    shirt.addColorStop(1, '#d8c8b4');
    g.fillStyle = shirt;
    g.beginPath();
    g.roundRect(-12, -12, 24, 28, 7);
    g.fill();
    // leather apron
    const ap = g.createLinearGradient(0, -8, 0, 18);
    ap.addColorStop(0, '#8a4a24');
    ap.addColorStop(1, '#5a2c12');
    g.fillStyle = ap;
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(8, -6);
    g.lineTo(10, 17);
    g.lineTo(-10, 17);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,210,150,0.35)';
    g.lineWidth = 0.8;
    g.stroke();
    g.strokeStyle = '#5a2c12';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(-5, -12);
    g.moveTo(8, -6);
    g.lineTo(5, -12);
    g.stroke();
    // head
    g.fillStyle = '#f0c29a';
    g.beginPath();
    g.arc(0, -19, 8, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(200,110,80,0.35)';
    g.beginPath();
    g.arc(-4.5, -17, 2, 0, TAU);
    g.arc(4.5, -17, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(-2.8, -19.5, 1.1, 0, TAU);
    g.arc(2.8, -19.5, 1.1, 0, TAU);
    g.fill();
    g.strokeStyle = '#7a3a24';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, -16.5, 2.2, 0.2, Math.PI - 0.2);
    g.stroke();
    // a teal cap
    g.fillStyle = '#1aa8a0';
    g.beginPath();
    g.arc(0, -22, 8.4, Math.PI, TAU);
    g.fill();
    g.fillStyle = '#0e7a74';
    g.fillRect(-9, -23, 18, 2.5);
    g.fillStyle = '#7ff0e6';
    g.beginPath();
    g.arc(0, -30, 2, 0, TAU);
    g.fill();
  });
}

function makeBasket() {
  return makeSprite(56, 26, (g) => {
    // wicker bowl
    const grad = g.createLinearGradient(0, -6, 0, 12);
    grad.addColorStop(0, '#e8b860');
    grad.addColorStop(1, '#8a5a20');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-25, -3);
    g.quadraticCurveTo(-22, 12, 0, 12);
    g.quadraticCurveTo(22, 12, 25, -3);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(90,50,10,0.6)';
    g.lineWidth = 0.9;
    for (let x = -22; x <= 22; x += 4) {
      g.beginPath();
      g.moveTo(x, -2);
      g.quadraticCurveTo(x * 0.9, 6, x * 0.75, 11);
      g.stroke();
    }
    for (let y = 1; y < 11; y += 3) {
      g.beginPath();
      g.moveTo(-24 + y * 0.6, y);
      g.lineTo(24 - y * 0.6, y);
      g.stroke();
    }
    // velvet cushion
    const vel = g.createRadialGradient(-4, -6, 1, 0, -3, 22);
    vel.addColorStop(0, '#ff6a8a');
    vel.addColorStop(1, '#8a0a2e');
    g.fillStyle = vel;
    g.beginPath();
    g.ellipse(0, -3, 23, 5.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,220,230,0.4)';
    g.beginPath();
    g.ellipse(-6, -5, 8, 1.6, 0, 0, TAU);
    g.fill();
    // rim
    g.strokeStyle = '#ffd890';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(0, -3, 25, 6.5, 0, 0, TAU);
    g.stroke();
  });
}

function makeMaster(skin, beard, cap) {
  return makeSprite(36, 40, (g) => {
    // shoulders
    const sh = g.createLinearGradient(0, 2, 0, 20);
    sh.addColorStop(0, '#f4ead8');
    sh.addColorStop(1, '#b8a890');
    g.fillStyle = sh;
    g.beginPath();
    g.roundRect(-15, 4, 30, 18, 8);
    g.fill();
    g.fillStyle = '#6a3618';
    g.beginPath();
    g.moveTo(-8, 6);
    g.lineTo(8, 6);
    g.lineTo(10, 22);
    g.lineTo(-10, 22);
    g.closePath();
    g.fill();
    // head
    g.fillStyle = skin;
    g.beginPath();
    g.arc(0, -5, 8.5, 0, TAU);
    g.fill();
    // beard and moustache
    g.fillStyle = beard;
    g.beginPath();
    g.arc(0, -1, 7.5, 0.1, Math.PI - 0.1);
    g.fill();
    g.beginPath();
    g.ellipse(-3, -2.5, 3.6, 1.4, 0.2, 0, TAU);
    g.ellipse(3, -2.5, 3.6, 1.4, -0.2, 0, TAU);
    g.fill();
    g.fillStyle = '#1a0e08';
    g.beginPath();
    g.arc(-3, -6.5, 1.1, 0, TAU);
    g.arc(3, -6.5, 1.1, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(200,90,60,0.4)';
    g.beginPath();
    g.arc(0, -4.5, 1.6, 0, TAU);
    g.fill();
    // cap
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, -11, 9.5, 5, 0, Math.PI, TAU);
    g.fill();
    g.fillRect(-10, -12, 20, 2.4);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-9, -15, 8, 1.2);
  });
}

// ---------- music: tarantella techno in 12/8, 132 BPM (dotted-quarter beat), A minor ----------

const music = {
  cps: 0.55, // one 12/8 bar per cycle: 33 bars = 60s
  setup: `
    const kick = note("a2 ~ ~ a2 ~ ~ a2 ~ ~ a2 ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("a2 ~ ~ a2 ~ ~ a2 ~ a2 a2 ~ a2").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ ~ ~ pink ~ ~ ~ ~ ~ pink ~ ~").decay(0.13).sustain(0).hpf(1100).lpf(6000).gain(0.15).room(0.25)
    const tamb = s("white*12").decay(0.03).sustain(0).hpf(6500).gain("[0.05 0.014 0.026]*4")
    const jingle = s("white*24").decay(0.018).sustain(0).hpf(6800).gain(saw.range(0.006, 0.04))
    const frame = note("~ ~ e3 ~ ~ a3 ~ ~ e3 ~ a3 ~").s("sine").decay(0.1).sustain(0).gain(0.2)
    const bass = note("<[a2 ~ e3 a2 ~ e3 a2 ~ e3 a3 ~ e3] [d2 ~ a2 d2 ~ a2 d2 ~ a2 d3 ~ a2] [g2 ~ d3 g2 ~ d3 g2 ~ d3 g3 ~ d3] [c3 ~ g3 c3 ~ g3 c3 ~ g3 c4 ~ g3] [f2 ~ c3 f2 ~ c3 f2 ~ c3 f3 ~ c3] [d2 ~ a2 d2 ~ a2 d2 ~ a2 d3 ~ a2] [e2 ~ b2 e2 ~ b2 e2 ~ b2 e3 ~ b2] [e2 ~ b2 e2 ~ gs2 e2 ~ b2 e3 ~ d3]>")
      .s("sawtooth").attack(0.004).decay(0.13).sustain(0.2).release(0.05).lpf(saw.range(420, 1700).slow(33)).lpq(4).gain(0.3)
    const sub = note("<a2 d2 g2 c3 f2 d2 e2 e2>").struct("x ~ ~ x ~ ~ x ~ ~ x ~ ~").s("sine").decay(0.3).sustain(0.3).gain(0.22)
    const chords = "<[a3,c4,e4] [d4,f4,a4] [d4,g4,b4] [c4,e4,g4] [c4,f4,a4] [d4,f4,a4] [e4,gs4,b4] [d4,e4,gs4,b4]>"
    const chops = note(chords).struct("~ x x ~ x x ~ x x ~ x x").s("square").attack(0.003).decay(0.08).sustain(0).lpf(2000).gain(0.042).pan(0.42)
    const pad = note(chords).s("sawtooth").attack(0.35).release(0.7).lpf(saw.range(700, 1400).slow(33)).gain(0.04).room(0.5)
    const glass = note("<[a5 c6 e6]*4 [a5 d6 f6]*4 [g5 b5 d6]*4 [g5 c6 e6]*4 [a5 c6 f6]*4 [a5 d6 f6]*4 [gs5 b5 e6]*4 [gs5 b5 d6]*4>")
      .s("sine").attack(0.004).decay(0.28).sustain(0).gain(0.045).delay(0.3).delaytime(0.2273).delayfeedback(0.3).pan(sine.range(0.3, 0.7).slow(2))
    const tune = "<[e5 ~ e5 e5 d5 c5 b4 ~ c5 a4 ~ ~] [f5 ~ f5 f5 e5 d5 c5 ~ d5 a4 ~ ~] [d5 ~ d5 d5 c5 b4 g4 ~ b4 d5 ~ ~] [e5 ~ e5 e5 d5 c5 g4 ~ c5 e5 ~ ~] [a5 ~ a5 a5 g5 f5 c5 ~ f5 a5 ~ g5] [f5 ~ f5 f5 e5 d5 a4 ~ d5 f5 ~ e5] [e5 f5 e5 ds5 e5 f5 e5 ~ b4 gs4 ~ b4] [e5 ~ d5 c5 ~ b4 a4 ~ gs4 b4 ~ ~]>"
    const lead = note(tune).s("square").attack(0.008).decay(0.12).sustain(0.45).release(0.08).lpf(2300).vib(6).vibmod(0.07)
      .gain(0.06).delay(0.18).delaytime(0.3409).delayfeedback(0.22).pan(0.56)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.01).decay(0.15).sustain(0.4).release(0.08).lpf(1400).gain(0.04).pan(0.46)
    const wash = s("pink*6").decay(0.12).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, clap, tamb, bass, sub, chops)],
    [8, stack(kick, clap, tamb, frame, bass, sub, chops, pad, glass)],
    [8, stack(kick, clap, tamb, jingle, frame, bass, sub, chops, pad, glass, lead)],
    [9, stack(kick2, clap, tamb, jingle, frame, bass, sub, chops, pad, glass, lead, leadLow, wash)]
  )`,
};

export default {
  id: 'glassact',
  title: 'Glass Act',
  emoji: '🔮',
  tagline: 'Catch every bauble: stand still for straight ones, run with drifters.',
  colors: { bg: '#1c0c10', fg: '#fff4e0', accent: '#ff9a3c' },
  music,

  create({ rng, W, H }) {
    const plan = makePlan(rng.fork('plan'));
    const art = rng.fork('art');

    // ---- art ----
    const scene = paintScene(W, H, art);
    const balustrade = paintBalustrade(W);
    const chandelier = makeChandelier();
    const bodies = GLASS.map(makeGlassBody);
    const glint = makeGlint();
    const apprentice = makeApprentice();
    const basket = makeBasket();
    const masters = [
      makeMaster('#e8b88e', '#d8d0c8', '#2a2a40'),
      makeMaster('#c8905e', '#2a1a10', '#8a1a26'),
      makeMaster('#f0c8a0', '#a85a28', '#1a4a3a'),
      makeMaster('#a8683e', '#1a1210', '#3a2a5a'),
    ];
    const glowFire = glowSprite('rgba(255,150,60,0.7)', 40);
    const glowWarm = glowSprite('rgba(255,220,160,0.8)', 24);
    const glowCols = GLASS.map((c) => glowSprite(`rgba(${parseInt(c.mid.slice(1, 3), 16)},${parseInt(c.mid.slice(3, 5), 16)},${parseInt(c.mid.slice(5, 7), 16)},0.75)`, 22));
    const glowGreen = glowSprite('rgba(90,255,150,0.7)', 30);
    const vignette = vignetteSprite(W, H, 0.6, '20,4,6');

    const fx = createParticles();
    const sparks = createParticles();
    const embers = [];
    for (let i = 0; i < 26; i++) embers.push({ x: Math.random() * W, y: 150 + Math.random() * (H - 150), s: 0.8 + Math.random() * 1.6, ph: Math.random() * TAU, v: 6 + Math.random() * 14 });
    const rings = [];

    // ---- state ----
    const mover = createMover({ x: W / 2, minX: 20, maxX: W - 20, speed: S, accel: 16 });
    const balls = plan.map((b) => ({ ...b, state: 'wait', spin: Math.random() * TAU }));
    let next = 0; // first ball not yet resolved
    let caught = 0;
    let now = 0;
    let clock = 0;
    let shake = 0;
    let deathX = W / 2;
    let crash = 0;
    let lastCatch = -9;
    let catchCol = 0;
    let walk = 0;
    const pile = []; // little baubles shown in the basket after a catch

    const posOf = (b, t) => {
      const u = clamp((t - b.tr) / b.T, 0, 1.2);
      const x = lerp(b.x0, b.lx, u);
      const gy = lerp(ARCH_Y, PY, u);
      const h = lerp(HAND_H, CATCH_H, Math.min(u, 1)) + b.arcH * 4 * u * (1 - u);
      return { u, x, gy, h };
    };

    const shatter = (x, y, b, big) => {
      const c = GLASS[b.col];
      fx.burst(x, y, { count: big ? 46 : 30, speed: big ? 260 : 200, life: 0.9, size: 3.4, colors: [c.hi, c.mid, c.spark, '#ffffff'], gravity: 420, angle: -Math.PI / 2, spread: Math.PI * 1.6, drag: 1.2 });
      sparks.burst(x, y, { count: 18, speed: 160, life: 0.5, size: 2, colors: ['#ffffff', c.spark], drag: 2 });
      rings.push({ x, y, age: 0, max: 0.5, r0: 6, r1: big ? 60 : 40, col: '255,240,220' });
    };

    const resolve = (b, game) => {
      const dx = mover.x - b.lx;
      const dv = mover.vx - b.bv;
      if (Math.abs(dx) < CATCH_R && Math.abs(dv) < TOL) {
        b.state = 'caught';
        caught++;
        lastCatch = now;
        catchCol = b.col;
        pile.push({ col: b.col, off: dx, age: 0 });
        if (pile.length > 3) pile.shift();
        sparks.burst(mover.x, PY - CATCH_H - 4, { count: 14, speed: 110, life: 0.5, size: 2.2, colors: ['#fff6d0', GLASS[b.col].spark], angle: -Math.PI / 2, spread: 2.4, drag: 2 });
        rings.push({ x: mover.x, y: PY - CATCH_H, age: 0, max: 0.4, r0: 10, r1: 34, col: '120,255,170' });
        return;
      }
      b.state = 'broken';
      game.dead = true;
      shake = 0.5;
      crash = 1;
      deathX = mover.x;
      if (Math.abs(dx) >= CATCH_R) {
        game.deathReason = 'Missed one. It shattered on the floor.';
        shatter(b.lx, PY - 2, b, true);
      } else {
        if (!b.drift) game.deathReason = 'Caught it on the run, so it cracked. Stand still for straight throws.';
        else if (mover.vx * b.bv < 0) game.deathReason = 'Ran against a drifting bauble. It smashed in the basket.';
        else game.deathReason = 'Too stiff! A drifting bauble needs you running with it.';
        shatter(mover.x, PY - CATCH_H, b, true);
      }
    };

    const stepBalls = (game, live) => {
      for (const b of balls) {
        if (b.state === 'wait' && now >= b.tw) b.state = 'wind';
        if (b.state === 'wind' && now >= b.tr) b.state = 'fly';
        if (b.state === 'fly' && now >= b.L) {
          if (live && !game.dead) resolve(b, game);
          else if (!live) {
            b.state = 'broken';
            shatter(b.lx, PY - 2, b, false);
          }
        }
      }
      while (next < balls.length && balls[next].state !== 'wait' && balls[next].state !== 'wind' && balls[next].state !== 'fly') next++;
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      crash = Math.max(0, crash - dt * 0.6);
      fx.update(dt);
      sparks.update(dt);
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += dt;
        if (rings[i].age > rings[i].max) rings.splice(i, 1);
      }
      for (const e of embers) {
        e.ph += dt * 1.3;
        e.y -= dt * e.v;
        e.x += Math.sin(e.ph) * dt * 8;
        if (e.y < 140) {
          e.y = H + 4;
          e.x = Math.random() * W;
        }
      }
      for (const b of balls) if (b.state === 'fly' || b.state === 'wind') b.spin += dt * (b.drift ? Math.sign(b.bv) * 7 : 3);
      for (const p of pile) p.age += dt;
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { balls, mover },

      update(dt, dir, t) {
        now = t + dt;
        mover.update(dt, dir);
        walk += (Math.abs(mover.vx) * dt) / 8;
        updateCosmetic(dt);
        stepBalls(this, true);
      },

      afterlife(dt) {
        now += dt;
        mover.vx *= 0.9;
        updateCosmetic(dt);
        stepBalls(this, false);
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 9 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 9 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.fillStyle = '#1c0c10';
        g.fillRect(-8, -8, W + 16, H + 16);
        g.drawImage(scene.canvas, 0, 0, W, H);

        // the furnaces breathe behind the arches; the chandelier glitters
        g.globalCompositeOperation = 'lighter';
        ARCH_X.forEach((ax, i) => {
          const f = 0.55 + 0.2 * Math.sin(clock * 3.1 + i * 1.7) + 0.1 * Math.sin(clock * 7.3 + i);
          drawSprite(g, glowFire, ax, BAR_Y - 8, { size: 70, alpha: f });
        });
        drawSprite(g, glowWarm, W / 2, 22, { size: 150, alpha: 0.35 + 0.05 * Math.sin(clock * 2) });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, chandelier, W / 2, 20);

        // landing rings and floor paths of every throw that's been announced
        let soonest = null;
        for (const b of balls) {
          if (b.state !== 'wind' && b.state !== 'fly') continue;
          if (!soonest || b.L < soonest.L) soonest = b;
        }
        for (const b of balls) {
          if (b.state !== 'wind' && b.state !== 'fly') continue;
          const left = b.L - now;
          const k = clamp(1 - left / 1.6, 0, 1);
          const pos = posOf(b, now);
          // the dashed path on the floor
          g.setLineDash([4, 7]);
          g.lineDashOffset = -clock * 30;
          g.strokeStyle = `rgba(255,236,200,${(0.22 + 0.3 * k).toFixed(3)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(b.state === 'fly' ? pos.x : b.x0, b.state === 'fly' ? pos.gy : ARCH_Y + 14);
          g.lineTo(b.lx, PY);
          g.stroke();
          g.setLineDash([]);
          const ok = b === soonest && Math.abs(mover.vx - b.bv) < TOL && !this.dead;
          const base = b.drift ? '80,230,230' : '255,205,90';
          const col = ok ? '110,255,160' : base;
          const a = 0.4 + 0.55 * k;
          const rx = lerp(CATCH_R + 14, CATCH_R, k);
          if (b === soonest) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, ok ? glowGreen : glowCols[b.col], b.lx, PY, { size: 70, alpha: 0.35 + 0.3 * k });
            g.globalCompositeOperation = 'source-over';
          }
          g.fillStyle = `rgba(${col},${(0.1 + 0.12 * k).toFixed(3)})`;
          g.beginPath();
          g.ellipse(b.lx, PY, rx, rx * 0.34, 0, 0, TAU);
          g.fill();
          g.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
          g.lineWidth = b === soonest ? 3 : 2;
          g.beginPath();
          g.ellipse(b.lx, PY, rx, rx * 0.34, 0, 0, TAU);
          g.stroke();
          if (b.drift) {
            // chevrons sliding the way you'll have to run
            const sgn = Math.sign(b.bv);
            const ph = (clock * 2.2) % 1;
            for (let j = 0; j < 3; j++) {
              const off = (j - 1 + ph) * 13 * sgn;
              const al = a * (1 - Math.abs(j - 1 + ph - 0.5) / 1.6);
              g.strokeStyle = `rgba(${col},${Math.max(0, al).toFixed(3)})`;
              g.lineWidth = 3;
              g.lineCap = 'round';
              g.lineJoin = 'round';
              g.beginPath();
              g.moveTo(b.lx + off - 4 * sgn, PY - 6);
              g.lineTo(b.lx + off + 3 * sgn, PY);
              g.lineTo(b.lx + off - 4 * sgn, PY + 6);
              g.stroke();
            }
          } else {
            // a solid dot: hold still
            g.fillStyle = `rgba(${col},${a.toFixed(3)})`;
            g.beginPath();
            g.ellipse(b.lx, PY, 6, 3.2, 0, 0, TAU);
            g.fill();
            g.strokeStyle = `rgba(${col},${(a * 0.6).toFixed(3)})`;
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(b.lx - 10, PY);
            g.lineTo(b.lx - 16, PY);
            g.moveTo(b.lx + 10, PY);
            g.lineTo(b.lx + 16, PY);
            g.stroke();
          }
        }

        // the masters in the arches
        for (const b of balls) {
          if (b.state !== 'wind' && !(b.state !== 'wait' && now - b.tr < 0.35 && now >= b.tr)) continue;
          const m = masters[b.a % masters.length];
          const winding = b.state === 'wind';
          const rise = winding ? clamp((now - b.tw) / 0.25, 0, 1) : clamp(1 - (now - b.tr - 0.15) / 0.2, 0, 1);
          const x = b.x0;
          const y = BAR_Y - 27 + (1 - rise) * 30;
          // throwing arm
          let hx;
          let hy;
          if (winding) {
            const k = clamp((now - (b.tr - WIND)) / WIND, 0, 1);
            hx = x + 9 - (b.drift ? Math.sign(b.bv) * 6 * k : 0);
            hy = y - 4 - 10 * k;
          } else {
            const k = clamp((now - b.tr) / 0.3, 0, 1);
            hx = x + (b.drift ? Math.sign(b.bv) * 12 * k : 0) + 4;
            hy = y + 8 * k;
          }
          g.strokeStyle = '#e8dcc8';
          g.lineWidth = 6;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x + 10, y + 7);
          g.lineTo(hx, hy);
          g.stroke();
          drawSprite(g, m, x, y, { size: 42 });
          if (winding) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowCols[b.col], hx, hy - 4, { size: 34, alpha: 0.7 });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, bodies[b.col], hx, hy - 4, { size: 22, rot: b.spin });
            drawSprite(g, glint, hx, hy - 4, { size: 22 });
          }
        }
        g.drawImage(balustrade.canvas, 0, BAR_Y, W, 26);

        // embers drifting up in the furnace heat
        g.globalCompositeOperation = 'lighter';
        for (const e of embers) {
          g.fillStyle = `rgba(255,${(150 + 60 * Math.sin(e.ph)) | 0},70,${(0.35 + 0.25 * Math.sin(e.ph * 2)).toFixed(3)})`;
          g.fillRect(e.x, e.y, e.s, e.s);
        }
        g.globalCompositeOperation = 'source-over';

        // flying glass: shadows first, then the baubles
        const flying = balls.filter((b) => b.state === 'fly');
        for (const b of flying) {
          const p = posOf(b, now);
          const sa = clamp(0.4 - p.h / 500, 0.12, 0.4);
          g.fillStyle = `rgba(30,8,6,${sa.toFixed(3)})`;
          g.beginPath();
          g.ellipse(p.x, p.gy, 10 - p.h / 40, 4 - p.h / 100, 0, 0, TAU);
          g.fill();
        }
        flying.sort((a, b) => posOf(a, now).gy - posOf(b, now).gy);
        for (const b of flying) {
          const p = posOf(b, now);
          const size = 25 + p.h * 0.06;
          const y = p.gy - p.h;
          // a little motion trail
          const back = posOf(b, now - 0.05);
          g.strokeStyle = `rgba(255,240,220,0.18)`;
          g.lineWidth = size * 0.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(back.x, back.gy - back.h);
          g.lineTo(p.x, y);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowCols[b.col], p.x, y, { size: size * 2.2, alpha: 0.55 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, bodies[b.col], p.x, y, { size, rot: b.spin });
          drawSprite(g, glint, p.x, y, { size });
        }

        // the apprentice
        {
          const px = this.dead ? deathX : mover.x;
          const lean = this.dead ? 0 : mover.lean;
          const moving = Math.abs(mover.vx) > 30 && !this.dead;
          g.fillStyle = 'rgba(20,4,4,0.4)';
          g.beginPath();
          g.ellipse(px, PY + 20, 18, 5, 0, 0, TAU);
          g.fill();
          g.save();
          g.translate(px, PY - 4);
          g.rotate(lean * 0.16);
          const bob = moving ? Math.abs(Math.sin(walk)) * -2 : 0;
          g.translate(0, bob);
          // a bit of stride
          if (moving) {
            const sw = Math.sin(walk) * 3;
            g.fillStyle = '#2a1e2a';
            g.fillRect(-8, 14 + sw * 0.3, 6, 3);
          }
          drawSprite(g, apprentice, 0, -6);
          // arms reaching to the basket
          g.strokeStyle = '#f4ead8';
          g.lineWidth = 4.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(-11, -12);
          g.lineTo(-19, -6);
          g.moveTo(11, -12);
          g.lineTo(19, -6);
          g.stroke();
          g.fillStyle = '#f0c29a';
          g.beginPath();
          g.arc(-20, -6, 2.6, 0, TAU);
          g.arc(20, -6, 2.6, 0, TAU);
          g.fill();
          drawSprite(g, basket, 0, -4 - CATCH_H + 10);
          // the last few catches nestled in the cushion
          pile.forEach((p, i) => {
            const k = clamp(p.age / 0.15, 0, 1);
            const ox = clamp(p.off * -0.4, -12, 12) + (i - 1) * 7;
            drawSprite(g, bodies[p.col], ox, -14 - (1 - k) * 8, { size: 12 });
            drawSprite(g, glint, ox, -14 - (1 - k) * 8, { size: 12 });
          });
          g.restore();
          // a warm pulse of light on each catch
          const since = now - lastCatch;
          if (since < 0.35 && !this.dead) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowCols[catchCol], px, PY - 16, { size: 90, alpha: 1 - since / 0.35 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // rings, shards and sparkles
        for (const r of rings) {
          const k = r.age / r.max;
          g.strokeStyle = `rgba(${r.col},${(1 - k).toFixed(3)})`;
          g.lineWidth = 3 * (1 - k) + 1;
          g.beginPath();
          g.ellipse(r.x, r.y, lerp(r.r0, r.r1, k), lerp(r.r0, r.r1, k) * 0.45, 0, 0, TAU);
          g.stroke();
        }
        fx.render(g);
        sparks.render(g, true);

        if (crash > 0) {
          g.fillStyle = `rgba(255,240,230,${(crash * crash * 0.25).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
          const a = Math.min(1, crash * 2);
          g.font = `900 40px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 6;
          g.strokeStyle = `rgba(90,10,20,${a.toFixed(3)})`;
          g.fillStyle = `rgba(255,246,230,${a.toFixed(3)})`;
          const y = 420 - (1 - crash) * 24;
          g.strokeText('CRASH!', W / 2, y);
          g.fillText('CRASH!', W / 2, y);
        }
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);

        // the tally of baubles saved
        {
          const x = 14;
          const y = H - 30;
          g.fillStyle = 'rgba(20,6,8,0.75)';
          g.strokeStyle = 'rgba(255,200,120,0.6)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.roundRect(x, y - 14, 74, 28, 7);
          g.fill();
          g.stroke();
          drawSprite(g, bodies[catchCol], x + 15, y, { size: 16 });
          drawSprite(g, glint, x + 15, y, { size: 16 });
          g.font = `800 15px ${BODY_FONT}`;
          g.textAlign = 'right';
          g.textBaseline = 'middle';
          g.fillStyle = '#ffd890';
          g.fillText(String(caught), x + 66, y + 1);
        }
      },
    };
    return game;
  },
};
