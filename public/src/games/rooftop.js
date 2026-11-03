// Rooftop Rockets — Bonfire Night over an old terrace of chimney stacks. A chimney sweep hops from
// stack to stack while someone keeps lighting rockets in the chimney pots. The only move is a
// leap: hold ← or → to wind it up (a dotted arc and a landing ring show where it will come down,
// sweeping out and back while you hold), let go to jump. Come down short or long and you slide off
// the slates; stand on a chimney when its rocket goes up and you go up with it. Every lit chimney
// shows its rocket, a sparking fuse, a red glow and a countdown ring, and the sweep gets a "!"
// whenever the chimney under them is lit. Over the minute the leap winds up faster, fuses get
// shorter, two chimneys get lit at once, and from 28s fuse cords strung along the ridge burn from
// stack to stack towards you. The terrace is planned up front from the rng, and every fuse is
// only lit if there's still a free chimney the sweep can reach.

import { DISPLAY_FONT, BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const ROOF = 600; // the terrace's ridge on screen
const DMAX = 175; // the longest leap
const MINJ = 10; // shorter than this and letting go does nothing
const REACH = 150; // neighbouring chimneys are never further apart than this (centre to centre)
const TOL = 3; // landing leniency past a chimney's edge
const BLAST = 0.42; // how long a rocket's flame jet stands on its chimney
const COOL = 0.7; // a chimney can't be relit straight after its rocket has gone
const SPAN = 7200; // the terrace runs this far either way
const CAPH = 7;

const SOOT = ['#2a2630', '#45404c', '#1a181e', '#6a6470'];
const BRICK = ['#a65a3e', '#7e3626', '#c88a5a', '#5a2a20'];
const FIRE = ['#fff4c0', '#ffd24a', '#ff9a2a', '#ff5a2a'];
const SHOWS = [
  ['#ff5a6a', '#ffb0bc', '#ffffff'],
  ['#5ad8ff', '#bdf0ff', '#ffffff'],
  ['#ffd24a', '#fff3b0', '#ff9a2a'],
  ['#9aff6a', '#e0ffd0', '#ffffff'],
  ['#c88aff', '#f0d8ff', '#ffffff'],
  ['#ff8a3a', '#ffd0a0', '#fff3b0'],
];

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sg = g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, '#060a1c');
    sg.addColorStop(0.4, '#101a3c');
    sg.addColorStop(0.62, '#262552');
    sg.addColorStop(0.74, '#4e2f50');
    sg.addColorStop(0.82, '#7a3e3a');
    sg.addColorStop(1, '#24182a');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      const y = rng.range(0, H * 0.6);
      g.fillStyle = `rgba(255,${rng.int(230, 255)},${rng.int(210, 255)},${rng.range(0.25, 0.9) * (1 - y / (H * 0.7))})`;
      const s = rng.chance(0.08) ? 1.6 : 0.9;
      g.fillRect(rng.range(0, W), y, s, s);
    }
    // the moon, hazy through the bonfire smoke
    const mx = W * 0.8;
    const my = H * 0.17;
    const halo = g.createRadialGradient(mx, my, 10, mx, my, 70);
    halo.addColorStop(0, 'rgba(255,240,210,0.35)');
    halo.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = halo;
    g.fillRect(mx - 70, my - 70, 140, 140);
    const mg = g.createRadialGradient(mx - 5, my - 5, 2, mx, my, 17);
    mg.addColorStop(0, '#fffbe8');
    mg.addColorStop(1, '#e8d8b0');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(mx, my, 16, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(170,150,120,0.35)';
    for (const [dx, dy, r] of [[-5, -3, 4], [4, 5, 3], [6, -6, 2], [-3, 7, 2.5]]) {
      g.beginPath();
      g.arc(mx + dx, my + dy, r, 0, TAU);
      g.fill();
    }
    // long smoky clouds lit orange from below
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-40, W + 40);
      const y = rng.range(H * 0.45, H * 0.72);
      const r = rng.range(30, 70);
      const cg = g.createRadialGradient(x, y, 2, x, y, r);
      cg.addColorStop(0, y > H * 0.6 ? 'rgba(150,80,70,0.3)' : 'rgba(70,60,110,0.3)');
      cg.addColorStop(1, 'rgba(60,40,80,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, r * 2, r * 0.45, 0, 0, TAU);
      g.fill();
    }
  }, 1);
}

// the far city: domes, spires, a clock tower and endless terraces, tiled sideways
function paintFar(rng) {
  const w = 720;
  const h = 190;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const base = h;
    g.fillStyle = '#1c1a3c';
    let x = -10;
    while (x < w + 10) {
      const bw = rng.range(20, 50);
      const bh = rng.range(30, 70);
      g.fillRect(x, base - bh, bw + 1, bh);
      // pitched roofs and chimney stubs
      g.beginPath();
      g.moveTo(x, base - bh);
      g.lineTo(x + bw / 2, base - bh - rng.range(4, 12));
      g.lineTo(x + bw + 1, base - bh);
      g.fill();
      if (rng.chance(0.6)) g.fillRect(x + rng.range(3, bw - 8), base - bh - 9, 4, 9);
      x += bw;
    }
    // landmarks
    const dome = (cx, r) => {
      g.fillRect(cx - r - 6, base - 80, r * 2 + 12, 80);
      g.beginPath();
      g.arc(cx, base - 80, r, Math.PI, 0);
      g.fill();
      g.fillRect(cx - 3, base - 80 - r - 16, 6, 16);
      g.beginPath();
      g.arc(cx, base - 80 - r - 18, 3, 0, TAU);
      g.fill();
    };
    dome(150, 26);
    const spire = (cx, hh) => {
      g.fillRect(cx - 6, base - hh * 0.6, 12, hh * 0.6);
      g.beginPath();
      g.moveTo(cx - 6, base - hh * 0.6);
      g.lineTo(cx, base - hh);
      g.lineTo(cx + 6, base - hh * 0.6);
      g.fill();
    };
    spire(60, 120);
    spire(470, 104);
    spire(640, 92);
    // clock tower
    const tx = 330;
    g.fillRect(tx - 10, base - 150, 20, 150);
    g.fillRect(tx - 12, base - 160, 24, 14);
    g.beginPath();
    g.moveTo(tx - 12, base - 160);
    g.lineTo(tx, base - 186);
    g.lineTo(tx + 12, base - 160);
    g.fill();
    g.fillStyle = 'rgba(255,230,160,0.85)';
    g.beginPath();
    g.arc(tx, base - 140, 6, 0, TAU);
    g.fill();
    g.strokeStyle = '#1c1a3c';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tx, base - 140);
    g.lineTo(tx, base - 144.5);
    g.moveTo(tx, base - 140);
    g.lineTo(tx + 3, base - 139);
    g.stroke();
    // windows
    for (let i = 0; i < 140; i++) {
      g.fillStyle = rng.chance(0.75) ? `rgba(255,${rng.int(180, 220)},120,${rng.range(0.4, 0.8)})` : 'rgba(170,200,255,0.5)';
      g.fillRect(rng.range(0, w), base - rng.range(4, 60), 1.6, 1.6);
    }
    // bonfire glow along the bottom
    for (let i = 0; i < 6; i++) {
      const bx = rng.range(20, w - 20);
      const gg = g.createRadialGradient(bx, base, 2, bx, base, 60);
      gg.addColorStop(0, 'rgba(255,140,60,0.45)');
      gg.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = gg;
      g.fillRect(bx - 60, base - 60, 120, 60);
    }
  }, 2);
}

// the nearer rooftops: a darker row of houses with chimneys and lit windows
function paintMid(rng) {
  const w = 720;
  const h = 170;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    let x = -10;
    while (x < w + 10) {
      const bw = rng.range(50, 90);
      const top = rng.range(50, 100);
      g.fillStyle = rng.pick(['#14112a', '#171430', '#120f26']);
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, top + 20);
      g.lineTo(x + bw / 2, top);
      g.lineTo(x + bw, top + 20);
      g.lineTo(x + bw, h);
      g.closePath();
      g.fill();
      // bonfire light catching the roof edges
      g.strokeStyle = 'rgba(255,130,70,0.28)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, top + 20);
      g.lineTo(x + bw / 2, top);
      g.stroke();
      // chimney stacks with pots
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const cx = x + rng.range(10, bw - 22);
        const ch = rng.range(18, 34);
        const cy = top + 20 - ((cx - x) < bw / 2 ? (cx - x) / (bw / 2) : (x + bw - cx) / (bw / 2)) * 20;
        g.fillStyle = '#1a1530';
        g.fillRect(cx, cy - ch, 14, ch + 4);
        g.fillRect(cx - 1.5, cy - ch - 3, 17, 3);
        for (let p = 0; p < 2; p++) g.fillRect(cx + 2 + p * 6, cy - ch - 8, 4, 6);
      }
      // windows, mostly warm
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < Math.floor(bw / 18); c++) {
          if (!rng.chance(0.45)) continue;
          const wx = x + 8 + c * 18;
          const wy = top + 34 + r * 34;
          g.fillStyle = rng.chance(0.8) ? `rgba(255,${rng.int(170, 210)},110,${rng.range(0.55, 0.9)})` : 'rgba(150,190,255,0.55)';
          g.fillRect(wx, wy, 7, 10);
          g.fillStyle = 'rgba(20,16,40,0.7)';
          g.fillRect(wx + 3, wy, 1, 10);
          g.fillRect(wx, wy + 4.5, 7, 1);
        }
      }
      x += bw - 1;
    }
  }, 2);
}

// the slate roof the chimneys stand on, tiled sideways
function paintRoof(rng, h) {
  const w = 240;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const rg = g.createLinearGradient(0, 0, 0, h);
    rg.addColorStop(0, '#3a3d56');
    rg.addColorStop(1, '#16182a');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    for (let row = 0; row * 7 < h; row++) {
      const y = 6 + row * 7;
      const off = row % 2 ? 6 : 0;
      for (let x = -12 + off; x < w; x += 12) {
        const v = rng.range(-12, 12);
        g.fillStyle = `rgb(${50 + v},${54 + v},${76 + v})`;
        g.fillRect(x + 0.5, y, 11, 6.2);
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(x + 0.5, y, 11, 1);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + 11.5, y, 0.6, 6.2);
      }
      g.fillStyle = `rgba(0,0,10,${0.1 + row * 0.07})`;
      g.fillRect(0, y, w, 7);
    }
    // ridge tiles
    g.fillStyle = '#5a4448';
    g.fillRect(0, 0, w, 6);
    for (let x = 0; x < w; x += 16) {
      const tg = g.createLinearGradient(0, 0, 0, 6);
      tg.addColorStop(0, '#8a6a64');
      tg.addColorStop(1, '#4a3438');
      g.fillStyle = tg;
      g.beginPath();
      g.ellipse(x + 8, 3.5, 8, 3.6, 0, Math.PI, 0);
      g.lineTo(x + 16, 6);
      g.lineTo(x, 6);
      g.fill();
    }
    g.fillStyle = 'rgba(255,170,110,0.25)';
    g.fillRect(0, 0, w, 1);
  }, 2);
}

// a tall strip of brickwork for chimney stacks (cut to each chimney's size)
function paintBricks(rng, kind) {
  const w = 70;
  const h = 150;
  const pal = kind === 0 ? ['#9a4a34', '#8a3f2e', '#a8573c', '#7e3626', '#b06244'] : kind === 1 ? ['#b8925a', '#a8824e', '#c8a46a', '#96703e', '#bc9a62'] : ['#6a4a44', '#5a3c38', '#7a5650', '#4e3430', '#845e54'];
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    g.fillStyle = kind === 1 ? '#6e5634' : '#4a2a22';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row * 5 < h; row++) {
      const off = row % 2 ? -5 : 0;
      for (let x = off; x < w; x += 10) {
        g.fillStyle = rng.pick(pal);
        g.fillRect(x + 0.5, row * 5 + 0.6, 9, 4);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + 0.5, row * 5 + 0.6, 9, 0.8);
        if (rng.chance(0.12)) {
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.fillRect(x + 0.5, row * 5 + 0.6, 9, 4);
        }
      }
    }
    // soot streaks from the top
    const sg = g.createLinearGradient(0, 0, 0, 50);
    sg.addColorStop(0, 'rgba(20,14,16,0.75)');
    sg.addColorStop(1, 'rgba(20,14,16,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, w, 50);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(20,14,16,0.25)';
      g.fillRect(rng.range(0, w), 0, rng.range(2, 5), rng.range(20, 70));
    }
  }, 2);
}

function paintShade() {
  return makeSprite(64, 8, (g) => {
    g.translate(-32, -4);
    const sg = g.createLinearGradient(0, 0, 64, 0);
    sg.addColorStop(0, 'rgba(255,170,100,0.22)');
    sg.addColorStop(0.18, 'rgba(255,170,100,0.06)');
    sg.addColorStop(0.55, 'rgba(0,0,20,0)');
    sg.addColorStop(1, 'rgba(0,0,20,0.55)');
    g.fillStyle = sg;
    g.fillRect(0, 0, 64, 8);
  }, 1);
}

function paintCap() {
  return makeSprite(80, CAPH + 2, (g) => {
    g.translate(-40, -(CAPH + 2) / 2);
    const cg = g.createLinearGradient(0, 0, 0, CAPH);
    cg.addColorStop(0, '#d8d0c4');
    cg.addColorStop(0.4, '#a8a094');
    cg.addColorStop(1, '#5e5850');
    g.fillStyle = cg;
    g.fillRect(0, 0, 80, CAPH);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 0, 80, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, CAPH, 80, 2);
  }, 2);
}

function paintPot(color) {
  return makeSprite(14, 22, (g) => {
    const [light, mid, dark] = color;
    const pg = g.createLinearGradient(-6, 0, 6, 0);
    pg.addColorStop(0, light);
    pg.addColorStop(0.45, mid);
    pg.addColorStop(1, dark);
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(-6, 11);
    g.lineTo(-4.4, -7);
    g.lineTo(4.4, -7);
    g.lineTo(6, 11);
    g.closePath();
    g.fill();
    // rim and banding
    g.fillStyle = mid;
    g.fillRect(-5.6, -10, 11.2, 3.6);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-5.6, -10, 11.2, 0.9);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-5, 3, 10.6, 1.2);
    g.fillStyle = '#120c0c';
    g.beginPath();
    g.ellipse(0, -10, 4.2, 1.3, 0, 0, TAU);
    g.fill();
    // soot round the mouth
    g.fillStyle = 'rgba(20,14,16,0.5)';
    g.fillRect(-5.6, -8, 11.2, 2);
  }, 3);
}

// a stick rocket: red and gold body, a cone nose and a long stick
function paintRocket() {
  return makeSprite(12, 44, (g) => {
    g.fillStyle = '#c8a070';
    g.fillRect(-0.9, 2, 1.8, 20);
    const bg = g.createLinearGradient(-4, 0, 4, 0);
    bg.addColorStop(0, '#ff7a6a');
    bg.addColorStop(0.5, '#d8283a');
    bg.addColorStop(1, '#7a1020');
    g.fillStyle = bg;
    g.fillRect(-4, -12, 8, 16);
    g.fillStyle = '#ffd24a';
    g.fillRect(-4, -8, 8, 2);
    g.fillRect(-4, -1, 8, 1.4);
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.moveTo(-4.6, -12);
    g.lineTo(0, -21);
    g.lineTo(4.6, -12);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(-3, -11, 1.2, 14);
    g.fillStyle = '#3a2a20';
    g.fillRect(-1.2, 4, 2.4, 2);
  }, 3);
}

// the sweep, side view facing right. poses: 0 stand, 1 crouch (winding up), 2 leap, 3 tumble
function paintSweep(pose) {
  return makeSprite(44, 60, (g) => {
    const out = '#0c0a12';
    const crouch = pose === 1 ? 4 : 0;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // the brush pole over the shoulder, bristle head up behind
    g.strokeStyle = '#6a4424';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(5, 6 + crouch);
    g.lineTo(-13, -22 + crouch);
    g.stroke();
    g.strokeStyle = '#a87a4a';
    g.lineWidth = 0.8;
    g.stroke();
    g.save();
    g.translate(-14, -24 + crouch);
    g.fillStyle = '#1a1416';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      g.save();
      g.rotate(a);
      g.fillRect(-0.6, 0, 1.2, 7.5);
      g.restore();
    }
    g.fillStyle = '#3a2a24';
    g.beginPath();
    g.arc(0, 0, 2.6, 0, TAU);
    g.fill();
    g.restore();
    // legs
    const legs = pose === 1 ? [[-3, 22, -6, 26], [4, 22, 6, 26]] : pose === 2 ? [[-3, 14, -9, 20], [4, 15, 9, 18]] : pose === 3 ? [[-3, 16, -10, 12], [4, 16, 10, 22]] : [[-3, 18, -3, 28], [4, 18, 4, 28]];
    for (const [x0, y0, x1, y1] of legs) {
      g.strokeStyle = out;
      g.lineWidth = 5.6;
      g.beginPath();
      g.moveTo(x0, y0 - 6);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = '#3a3a4e';
      g.lineWidth = 3.8;
      g.stroke();
      g.fillStyle = '#18141a';
      g.beginPath();
      g.ellipse(x1 + 1.5, y1 + 1, 3.6, 2, 0, 0, TAU);
      g.fill();
    }
    // tailcoat
    const cy = crouch;
    const cg = g.createLinearGradient(-8, 0, 8, 0);
    cg.addColorStop(0, '#5a6280');
    cg.addColorStop(0.5, '#3e4560');
    cg.addColorStop(1, '#262b40');
    g.fillStyle = cg;
    g.strokeStyle = out;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-7, -6 + cy);
    g.lineTo(7, -6 + cy);
    g.lineTo(8, 12 + cy);
    g.lineTo(-6, 14 + cy);
    g.lineTo(-10, 16 + cy);
    g.closePath();
    g.fill();
    g.stroke();
    // shirt front, buttons
    g.fillStyle = '#e8e2d4';
    g.beginPath();
    g.moveTo(2, -6 + cy);
    g.lineTo(7, -6 + cy);
    g.lineTo(6, 4 + cy);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffcf5a';
    for (const y of [0, 4.5, 9]) {
      g.beginPath();
      g.arc(4.6, y + cy, 0.9, 0, TAU);
      g.fill();
    }
    // arm holding the pole
    const armUp = pose === 2 ? -6 : pose === 3 ? -10 : 0;
    g.strokeStyle = out;
    g.lineWidth = 4.8;
    g.beginPath();
    g.moveTo(-2, -3 + cy);
    g.lineTo(5, 5 + cy + armUp);
    g.stroke();
    g.strokeStyle = '#4a5270';
    g.lineWidth = 3.2;
    g.stroke();
    g.fillStyle = '#f0c49a';
    g.beginPath();
    g.arc(5.5, 5.5 + cy + armUp, 1.9, 0, TAU);
    g.fill();
    // red neckerchief
    g.fillStyle = '#e8342e';
    g.beginPath();
    g.moveTo(-5, -8 + cy);
    g.lineTo(7, -8 + cy);
    g.lineTo(3, -3 + cy);
    g.closePath();
    g.fill();
    g.fillStyle = '#b81e1e';
    g.beginPath();
    g.moveTo(-5, -8 + cy);
    g.lineTo(-10, -2 + cy + (pose === 2 ? -4 : 0));
    g.lineTo(-7, -2 + cy);
    g.closePath();
    g.fill();
    // head
    const hx = 2;
    const hy = -15 + cy;
    const hg = g.createRadialGradient(hx + 1, hy - 2, 1, hx, hy, 8);
    hg.addColorStop(0, '#ffdcb8');
    hg.addColorStop(1, '#e0a87e');
    g.fillStyle = hg;
    g.strokeStyle = out;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(hx, hy, 7, 0, TAU);
    g.fill();
    g.stroke();
    // soot smudges and a rosy cheek
    g.fillStyle = 'rgba(40,34,40,0.55)';
    g.beginPath();
    g.ellipse(hx - 2.5, hy + 3, 3, 1.6, 0.4, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(hx + 4, hy - 4, 1.8, 1, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,110,100,0.45)';
    g.beginPath();
    g.arc(hx + 4, hy + 2.5, 1.7, 0, TAU);
    g.fill();
    // eye
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(hx + 3.4, hy - 1, 1.9, pose === 3 ? 2.4 : 2, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1420';
    g.beginPath();
    g.arc(hx + 4, hy - 0.8, 1, 0, TAU);
    g.fill();
    // grin (or an O of surprise when tumbling)
    g.strokeStyle = '#5a2a20';
    g.lineWidth = 0.9;
    g.beginPath();
    if (pose === 3) g.arc(hx + 4.5, hy + 3.5, 1.3, 0, TAU);
    else g.arc(hx + 3.5, hy + 2.6, 2.4, 0.2, 1.4);
    g.stroke();
    // battered top hat
    g.fillStyle = '#16131c';
    g.strokeStyle = out;
    g.lineWidth = 1;
    g.save();
    g.translate(hx, hy - 6);
    g.rotate(pose === 3 ? -0.5 : -0.08);
    g.fillRect(-9, -1.6, 18, 2.6);
    g.beginPath();
    g.moveTo(-6, -1);
    g.lineTo(-6.5, -15);
    g.lineTo(6.5, -16);
    g.lineTo(6, -1);
    g.closePath();
    g.fill();
    g.fillStyle = '#8a2a30';
    g.fillRect(-6.1, -5, 12.2, 2.6);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(-5.6, -15, 1.2, 13);
    g.fillRect(-9, -1.6, 18, 0.7);
    g.restore();
  }, 3);
}

function paintSmoke() {
  return makeSprite(40, 40, (g) => {
    const sg = g.createRadialGradient(0, 0, 2, 0, 0, 20);
    sg.addColorStop(0, 'rgba(120,110,130,0.5)');
    sg.addColorStop(0.6, 'rgba(90,82,104,0.25)');
    sg.addColorStop(1, 'rgba(80,70,96,0)');
    g.fillStyle = sg;
    g.fillRect(-20, -20, 40, 40);
  }, 1);
}

// a tall flame jet, drawn with 'lighter'
function paintJet() {
  return makeSprite(40, 160, (g) => {
    const jg = g.createLinearGradient(0, 80, 0, -80);
    jg.addColorStop(0, 'rgba(255,250,220,1)');
    jg.addColorStop(0.2, 'rgba(255,200,80,0.9)');
    jg.addColorStop(0.6, 'rgba(255,110,40,0.45)');
    jg.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = jg;
    g.beginPath();
    g.moveTo(-7, 80);
    g.quadraticCurveTo(-18, 0, 0, -80);
    g.quadraticCurveTo(18, 0, 7, 80);
    g.closePath();
    g.fill();
  }, 1);
}

// ---------- game ----------

export default {
  id: 'rooftop',
  title: 'Rooftop Rockets',
  emoji: '🎆',
  tagline: 'Hold ← or → to wind up a leap, let go to land. Get off lit chimneys!',
  colors: { bg: '#121834', fg: '#fff3e0', accent: '#ff8a2a' },

  // Grime at 140 BPM in G minor (London's own, for a London rooftop): a syncopated kick, snare on
  // two and four, 16th hats, a sine sub and a square "eskimo" bass riff with its filter opening over
  // the minute, and sawtooth string stabs from the first bar; then square eski clicks, claps and
  // a square lead with dotted-eighth echoes; then a pad and a glittering triangle "firework"
  // arpeggio; and a finale with a busier kick, the lead doubled an octave down by a sawtooth and a
  // rising noise wash. One bar per cycle: 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("g2 ~ ~ ~ ~ ~ g2 ~ ~ ~ g2 ~ ~ ~ ~ ~").s("sine").decay(0.25).sustain(0).gain(0.8)
      const kick2 = note("g2 ~ ~ g2 ~ ~ g2 ~ g2 ~ g2 ~ ~ ~ g2 g2").s("sine").decay(0.22).sustain(0).gain(0.8)
      const snare = s("~ pink ~ pink").decay(0.13).sustain(0).hpf(900).lpf(5200).gain(0.15).room(0.25)
      const clap = s("~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~ ~ ~ ~ pink ~").decay(0.08).sustain(0).hpf(1400).lpf(5000).gain(0.08).room(0.35)
      const hats = s("white*16").decay(0.025).sustain(0).hpf(7000).gain("[0.03 0.012 0.045 0.012]*4")
      const sub = note("<[g2@3 g2@2 g2@3] [eb2@3 eb2@2 eb2@3] [c2@3 c2@2 c2@3] [d2@3 d2@2 d2@3]>")
        .s("sine").attack(0.01).decay(0.3).sustain(0.5).release(0.08).gain(0.36)
      const eski = note("<[g3 ~ g3 ~ ~ bb3 ~ g3 ~ ~ d4 ~ g3 ~ f3 ~] [eb3 ~ eb3 ~ ~ g3 ~ eb3 ~ ~ bb3 ~ eb3 ~ d3 ~] [c3 ~ c3 ~ ~ eb3 ~ c3 ~ ~ g3 ~ c3 ~ bb2 ~] [d3 ~ d3 ~ ~ f#3 ~ d3 ~ ~ a3 ~ d3 ~ c3 ~]>")
        .s("square").decay(0.12).sustain(0).lpf(saw.range(500, 2200).slow(35)).lpq(6).gain(0.11)
      const chords = "<[g4,bb4,d5] [eb4,g4,bb4] [c4,eb4,g4] [d4,f#4,a4]>"
      const stabs = note(chords).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("sawtooth").decay(0.14).sustain(0).lpf(2400).gain(0.06).room(0.3).pan(0.42)
      const clicks = note("~ g6 ~ ~ ~ ~ d6 ~ ~ g6 ~ ~ ~ ~ ~ bb6").s("square").decay(0.03).sustain(0).lpf(3000).gain(0.035).pan(0.65)
      const tune = "<[g5 ~ d5 g5 ~ bb5 a5 g5] [eb5 ~ g5 bb5 ~ g5 f5 eb5] [c5 ~ eb5 g5 ~ f5 eb5 c5] [d5 ~ f#5 a5 ~ c6 bb5 a5] [g5 ~ d5 g5 ~ bb5 c6 d6] [eb6 ~ d6 bb5 ~ g5 bb5 eb6] [c6 ~ bb5 g5 ~ eb5 f5 g5] [a5 ~ f#5 d5 ~ a5 ~ ~]>"
      const lead = note(tune).s("square").attack(0.005).decay(0.1).sustain(0.35).release(0.06).lpf(2600)
        .gain(0.065).delay(0.22).delaytime(0.321).delayfeedback(0.3).pan(0.6)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.4).release(0.06).lpf(1400).gain(0.06).pan(0.45)
      const sparkle = note("<[g5 bb5 d6 g6]*4 [eb5 g5 bb5 eb6]*4 [c5 eb5 g5 c6]*4 [d5 f#5 a5 d6]*4>")
        .s("triangle").decay(0.06).sustain(0).lpf(4000).gain(0.045).delay(0.25).delaytime(0.214).delayfeedback(0.3).pan(sine.range(0.25, 0.75).slow(2))
      const pad = note("<[g3,bb3,d4] [eb3,g3,bb3] [c3,eb3,g3] [d3,f#3,a3]>").s("sawtooth").attack(0.3).release(0.5).lpf(1000).gain(0.045).room(0.5)
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(35)).gain(saw.range(0, 0.06).slow(35))
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, sub, eski, stabs)],
      [8, stack(kick, snare, clap, hats, sub, eski, stabs, clicks, lead)],
      [8, stack(kick, snare, clap, hats, sub, eski, stabs, clicks, lead, sparkle, pad)],
      [11, stack(kick2, snare, clap, hats, sub, eski, stabs, clicks, lead, low, sparkle, pad, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const look = rng.fork('look');
    const art = rng.fork('art');

    // ---- art ----
    const sky = paintSky(W, H, art);
    const far = paintFar(art);
    const mid = paintMid(art);
    const roofH = H - ROOF + 12;
    const roof = paintRoof(art, roofH);
    const bricks = [0, 1, 2].map((k) => paintBricks(art, k));
    const shade = paintShade();
    const cap = paintCap();
    const pots = [
      paintPot(['#e08a5a', '#b8603a', '#6e3420']),
      paintPot(['#e8c890', '#c09a60', '#7a5a34']),
      paintPot(['#a8a8b0', '#7a7a86', '#44444e']),
    ];
    const rocket = paintRocket();
    const sweep = [0, 1, 2, 3].map(paintSweep);
    const smokeArt = paintSmoke();
    const jet = paintJet();
    const warmGlow = glowSprite('rgba(255,190,120,1)', 40);
    const redGlow = glowSprite('rgba(255,70,40,1)', 32);
    const fireGlow = glowSprite('rgba(255,170,60,1)', 32);
    const whiteGlow = glowSprite('rgba(255,245,230,1)', 40);
    const greenGlow = glowSprite('rgba(120,255,150,1)', 24);
    const vignette = vignetteSprite(W, H, 0.6, '6,6,20');

    // ---- the terrace, planned up front: neighbours are never more than REACH apart ----
    const mk = (x, w) => {
      const n = w < 40 ? 1 : w < 52 ? 2 : 3;
      const potXs = [];
      for (let k = 0; k < n; k++) potXs.push((k - (n - 1) / 2) * Math.min(13, (w - 12) / Math.max(1, n - 1 || 1)));
      return {
        x,
        w,
        top: plan.range(468, 556),
        brick: look.int(0, 2),
        pot: look.int(0, 2),
        potXs,
        potH: potXs.map(() => look.range(0.85, 1.1)),
        rocketPot: look.int(0, n - 1),
        fuse: null,
        cool: 0,
      };
    };
    const start = mk(0, 60);
    start.top = 530;
    const right = [];
    const left = [];
    for (const [list, sign] of [[right, 1], [left, -1]]) {
      let prev = start;
      while (Math.abs(prev.x) < SPAN) {
        const w = plan.chance(0.25) ? plan.range(52, 64) : plan.range(30, 52);
        const gap = plan.range(18, 76);
        let dx = prev.w / 2 + gap + w / 2;
        if (dx > REACH) dx = REACH;
        const c = mk(prev.x + sign * dx, w);
        list.push(c);
        prev = c;
      }
    }
    const chims = [...left.reverse(), start, ...right];
    const START = left.length;

    const chimneyAt = (x) => {
      let lo = 0;
      let hi = chims.length - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (chims[m].x <= x) lo = m;
        else hi = m - 1;
      }
      for (const i of [lo, lo + 1]) {
        const c = chims[i];
        if (c && Math.abs(x - c.x) <= c.w / 2 + TOL) return i;
      }
      return -1;
    };

    // ---- the fuses, planned up front (who gets lit is decided when they're lit, without the rng) ----
    const events = [];
    {
      let T = 1.4;
      while (T < 62) {
        const p = progress(T, 60, 1.2);
        const kind = T > 28 && plan.chance(0.24) ? 'chain' : 'rocket';
        const self = T < 6 ? true : plan.chance(lerp(0.62, 0.78, p));
        let extra = T > 10 && plan.chance(lerp(0.15, 0.6, p)) ? 1 : 0;
        if (T > 38 && plan.chance(0.3)) extra++;
        events.push({ t: T, kind, self, extra, u: [plan.next(), plan.next(), plan.next(), plan.next()], warn: lerp(2.3, 1.25, p), v: lerp(150, 210, p) });
        T += (kind === 'chain' ? 2 : 1) * lerp(2.6, 1.1, p) * plan.range(0.85, 1.15);
      }
    }

    // ---- state ----
    const P = { x: start.x, y: start.top, on: START, air: null, face: 1, charge: 0, cdir: 0, phase: 1, land: 0, vx: 0, vy: 0, rot: 0 };
    let camX = start.x - W / 2;
    let time = 0;
    let clock = 0;
    let ei = 0;
    let deadT = 0;
    let death = '';
    let shake = 0;
    const lit = []; // chimneys with a lit fuse
    const cords = []; // fuse cords burning along the ridge
    const rockets = []; // rockets on their way up
    const shells = []; // cosmetic fireworks rising from the city
    const flashes = [];
    const smoke = [];
    let nextShell = 0.3;
    const skyfx = createParticles(); // fireworks, additive, screen space
    const sparks = createParticles(); // fuse sparks and flame, additive, world space
    const fx = createParticles(); // soot and brick dust, world space

    const free = (i) => i >= 0 && !chims[i].fuse && time >= chims[i].cool;
    const home = () => (P.air ? P.air.target : P.on);

    // is there a chimney (other than `from`, not lit, not in `skip`) the sweep can leap to from x?
    function hasEscape(x, from, skip) {
      const i0 = chimneyAt(x) >= 0 ? chimneyAt(x) : from;
      for (let i = Math.max(0, i0 - 4); i <= Math.min(chims.length - 1, i0 + 4); i++) {
        if (i === from || skip.includes(i) || chims[i].fuse) continue;
        const c = chims[i];
        const a = c.x - c.w / 2 + 2;
        const b = c.x + c.w / 2 - 2;
        const lo1 = x + MINJ + 6;
        const hi1 = x + DMAX - 14;
        const lo2 = x - DMAX + 14;
        const hi2 = x - MINJ - 6;
        // a comfortable stretch of its top must be in range, not just a corner
        if (Math.min(b, hi1) - Math.max(a, lo1) >= 16 || Math.min(b, hi2) - Math.max(a, lo2) >= 16) return true;
      }
      return false;
    }

    function light(i, at, chain = false) {
      chims[i].fuse = { lit: time, at, chain, blown: false };
      lit.push(i);
    }

    function fire(ev) {
      const h = home();
      const px = P.air ? P.air.x1 : P.x;
      if (ev.kind === 'chain' && h >= 0 && free(h)) {
        const side = ev.u[0] < 0.5 ? -1 : 1;
        const n = 2 + (ev.u[1] < 0.5 ? 1 : 0);
        const chain = [h];
        for (let k = 1; k <= n; k++) {
          const j = h + side * k;
          if (j < 0 || j >= chims.length || !free(j)) break;
          chain.unshift(j);
        }
        if (chain.length >= 2) {
          if (!hasEscape(px, h, chain)) chain.pop();
          if (chain.length >= 2) {
            const w0 = lerp(1.5, 1.15, progress(ev.t, 60, 1));
            const x0 = chims[chain[0]].x;
            const t0 = time + w0;
            for (const j of chain) light(j, t0 + Math.abs(chims[j].x - x0) / ev.v, true);
            cords.push({ ids: chain, t0, v: ev.v, dir: -side, x0, x1: chims[chain.at(-1)].x, born: time });
            return;
          }
        }
      }
      const targets = [];
      if (ev.self && h >= 0 && free(h)) targets.push(h);
      const near = [];
      for (let i = 0; i < chims.length; i++) {
        if (i !== h && free(i) && Math.abs(chims[i].x - px) < 210) near.push(i);
      }
      near.sort((a, b) => Math.abs(chims[a].x - px) - Math.abs(chims[b].x - px));
      const others = ev.extra + (ev.self ? 0 : 1);
      for (let k = 0; k < others && near.length; k++) targets.push(near.splice(Math.floor(ev.u[k] ** 1.4 * near.length), 1)[0]);
      // always leave a way out
      if (h >= 0 && (targets.includes(h) || chims[h].fuse)) {
        while (targets.length && !hasEscape(px, h, targets)) {
          const k = targets.findLastIndex((j) => j !== h);
          if (k >= 0) targets.splice(k, 1);
          else if (targets.includes(h)) targets.splice(targets.indexOf(h), 1);
          else break;
        }
      }
      for (const j of targets) light(j, time + ev.warn);
    }

    function potTop(c, k = c.rocketPot) {
      return { x: c.x + c.potXs[k], y: c.top - 20 * c.potH[k] };
    }

    function firework(x, y, big = false) {
      const pal = SHOWS[(Math.random() * SHOWS.length) | 0];
      skyfx.burst(x, y, { count: big ? 90 : 60, speed: big ? 240 : 180, life: 1.5, size: 3, gravity: 70, drag: 1.4, colors: pal });
      if (Math.random() < 0.4) skyfx.burst(x, y, { count: 24, speed: 90, life: 1.9, size: 1.6, gravity: 40, drag: 1, colors: ['#fff3b0', '#ffd24a'] });
      flashes.push({ x, y, life: 0.5, max: 0.5, size: big ? 200 : 140, color: pal[0] });
    }

    function blastFx(c) {
      const pt = potTop(c);
      rockets.push({ x: pt.x, y: pt.y - 10, vy: -520, burstY: 70 + Math.random() * 170, trail: 0 });
      sparks.burst(pt.x, pt.y - 4, { count: 30, speed: 260, life: 0.6, size: 2.6, gravity: 300, colors: FIRE, angle: -Math.PI / 2, spread: 1.1 });
      fx.burst(pt.x, pt.y, { count: 10, speed: 70, life: 1, size: 5, gravity: -30, drag: 1, colors: SOOT, angle: -Math.PI / 2, spread: 2.4 });
      if (Math.abs(c.x - P.x) < 260) shake = Math.max(shake, 0.12);
    }

    function die(kind) {
      game.dead = true;
      death = kind;
      if (kind === 'blast') {
        game.deathReason = 'Rode a rocket off the rooftops.';
        P.vy = -620;
        P.vx = (Math.random() - 0.5) * 80;
        sparks.burst(P.x, P.y - 10, { count: 50, speed: 300, life: 0.8, size: 3, gravity: 200, colors: FIRE });
        fx.burst(P.x, P.y - 14, { count: 30, speed: 180, life: 1.1, size: 4, gravity: 120, drag: 1.2, colors: SOOT });
        shake = 0.4;
      } else {
        game.deathReason = 'Missed the chimney and slid off the roof.';
        P.vy = 60;
        P.vx = P.face * 50;
        fx.burst(P.x, P.y, { count: 14, speed: 90, life: 0.7, size: 3, gravity: 200, colors: ['#5a5e78', '#3a3d56', '#8a8ea8'] });
        shake = 0.15;
      }
    }

    function jump(d) {
      let x1 = P.x + d;
      let target = chimneyAt(x1);
      if (target < 0 && time < 2.4) {
        // a fumble in the opening seconds is caught by the nearest chimney
        let best = P.on;
        for (let i = Math.max(0, P.on - 3); i <= Math.min(chims.length - 1, P.on + 3); i++) {
          if (Math.abs(chims[i].x - x1) < Math.abs(chims[best].x - x1)) best = i;
        }
        target = best;
        const c = chims[best];
        x1 = clamp(x1, c.x - c.w / 2 + 3, c.x + c.w / 2 - 3);
      }
      const y1 = target >= 0 ? chims[target].top : ROOF + 4;
      const dist = Math.abs(x1 - P.x);
      P.air = { x0: P.x, y0: P.y, x1, y1, t0: time, T: 0.34 + dist / 650, h: 24 + dist * 0.2 + Math.max(0, P.y - y1) * 0.5, target };
      P.face = Math.sign(d) || P.face;
      fx.burst(P.x, P.y, { count: 6, speed: 60, life: 0.5, size: 3, drag: 2, colors: BRICK, angle: Math.PI / 2, spread: 2 });
    }

    function land() {
      const a = P.air;
      P.x = a.x1;
      P.y = a.y1;
      P.air = null;
      P.land = 1;
      if (a.target < 0) {
        die('fall');
        return;
      }
      P.on = a.target;
      fx.burst(P.x, P.y, { count: 8, speed: 70, life: 0.5, size: 3, drag: 2.5, gravity: 120, colors: SOOT, angle: -Math.PI / 2, spread: 3 });
      const c = chims[P.on];
      if (c.fuse && time >= c.fuse.at) die('blast');
    }

    function stepFuses() {
      for (let k = lit.length - 1; k >= 0; k--) {
        const c = chims[lit[k]];
        const f = c.fuse;
        if (!f.blown && time >= f.at) {
          f.blown = true;
          blastFx(c);
        }
        if (time >= f.at + BLAST) {
          c.fuse = null;
          c.cool = time + COOL;
          lit.splice(k, 1);
        } else if (!f.blown && Math.random() < 0.5) {
          const pt = potTop(c);
          sparks.burst(pt.x, pt.y - 2, { count: 1, speed: 80, life: 0.35, size: 2, gravity: 260, colors: FIRE, angle: -Math.PI / 2, spread: 2.2 });
        } else if (f.blown) {
          const pt = potTop(c);
          sparks.burst(pt.x, pt.y - 4, { count: 3, speed: 240, life: 0.4, size: 2.4, gravity: 200, colors: FIRE, angle: -Math.PI / 2, spread: 0.6 });
        }
      }
      for (let k = cords.length - 1; k >= 0; k--) {
        const cd = cords[k];
        const sx = sparkX(cd);
        if (time > cd.t0 && sx !== null && Math.random() < 0.8) {
          sparks.burst(sx, cordY(cd, sx), { count: 1, speed: 70, life: 0.3, size: 1.8, gravity: 200, colors: FIRE });
        }
        if (time > cd.t0 + Math.abs(cd.x1 - cd.x0) / cd.v + 0.6) cords.splice(k, 1);
      }
    }

    function sparkX(cd) {
      if (time < cd.t0) return null;
      const d = (time - cd.t0) * cd.v;
      if (d > Math.abs(cd.x1 - cd.x0)) return null;
      return cd.x0 + cd.dir * d;
    }
    // the cord sags between neighbouring chimney caps
    function cordY(cd, x) {
      for (let k = 0; k < cd.ids.length - 1; k++) {
        const a = chims[cd.ids[k]];
        const b = chims[cd.ids[k + 1]];
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        if (x >= lo && x <= hi) {
          const s = (x - a.x) / (b.x - a.x);
          return lerp(a.top + 2, b.top + 2, s) + Math.sin(s * Math.PI) * 16;
        }
      }
      return chims[cd.ids.at(-1)].top;
    }

    function cosmetic(dt, rate) {
      clock += dt;
      const d = dt * rate;
      // fireworks over the city
      nextShell -= d;
      if (nextShell <= 0) {
        nextShell = 0.5 + Math.random() * 1.1;
        shells.push({ x: 30 + Math.random() * (W - 60), y: 440, vy: -330 - Math.random() * 120, burstY: 70 + Math.random() * 200 });
      }
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.y += s.vy * d;
        s.vy += 120 * d;
        if (Math.random() < 0.6) skyfx.burst(s.x, s.y, { count: 1, speed: 20, life: 0.4, size: 1.6, gravity: 40, colors: ['#ffd8a0', '#ffffff'] });
        if (s.y <= s.burstY || s.vy > -60) {
          firework(s.x, s.y);
          shells.splice(i, 1);
        }
      }
      // rockets launched from the chimneys burst high over the terrace
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * d;
        r.vy -= 600 * d;
        sparks.burst(r.x, r.y + 8, { count: 2, speed: 50, life: 0.35, size: 2, gravity: 80, colors: FIRE, angle: Math.PI / 2, spread: 0.8 });
        if (r.y <= r.burstY) {
          firework(r.x - camX, r.y, true);
          rockets.splice(i, 1);
        }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life -= d;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
      }
      // chimney smoke
      if (Math.random() < d * 5) {
        const i = chimneyAt(camX + Math.random() * W);
        if (i >= 0 && !chims[i].fuse) {
          const c = chims[i];
          const k = (Math.random() * c.potXs.length) | 0;
          const pt = potTop(c, k);
          smoke.push({ x: pt.x, y: pt.y - 4, r: 6, life: 3, max: 3, vx: 10 + Math.random() * 6 });
        }
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.life -= d;
        s.x += s.vx * d;
        s.y -= 16 * d;
        s.r += 7 * d;
        if (s.life <= 0) smoke.splice(i, 1);
      }
      skyfx.update(d);
      sparks.update(d);
      fx.update(d);
      shake = Math.max(0, shake - dt);
      P.land = Math.max(0, P.land - dt * 5);
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        time = t + dt;
        const p = progress(time, 60, 1.25);
        const rate = lerp(240, 380, p); // how fast a leap winds up

        // ---- the sweep ----
        if (P.air) {
          const a = P.air;
          const s = (time - a.t0) / a.T;
          if (s >= 1) land();
          else {
            P.x = lerp(a.x0, a.x1, s);
            P.y = lerp(a.y0, a.y1, s) - a.h * 4 * s * (1 - s);
          }
        } else if (dir !== 0) {
          if (dir !== P.cdir) {
            P.cdir = dir;
            P.charge = 0;
            P.phase = 1;
            P.face = dir;
          }
          P.charge += P.phase * rate * dt;
          if (P.charge >= DMAX) {
            P.charge = 2 * DMAX - P.charge;
            P.phase = -1;
          } else if (P.charge <= 0) {
            P.charge = -P.charge;
            P.phase = 1;
          }
        } else if (P.cdir) {
          if (P.charge > MINJ) jump(P.cdir * P.charge);
          P.cdir = 0;
          P.charge = 0;
        }
        if (game.dead) {
          cosmetic(dt, 1);
          return;
        }

        // ---- fuses ----
        while (ei < events.length && events[ei].t <= time) fire(events[ei++]);
        stepFuses();
        if (!P.air) {
          const c = chims[P.on];
          if (c.fuse && time >= c.fuse.at) {
            die('blast');
            cosmetic(dt, 1);
            return;
          }
        }

        // ---- camera: keep the sweep centred, leaning towards where they're aiming ----
        const aim = P.cdir ? P.cdir * P.charge * 0.45 : P.air ? (P.air.x1 - P.x) * 0.3 : 0;
        camX += (P.x + aim - W / 2 - camX) * Math.min(1, 4 * dt);
        cosmetic(dt, 1);
      },

      afterlife(dt) {
        deadT += dt;
        time += dt * 0.5;
        stepFuses();
        P.vy += 1100 * dt;
        P.x += P.vx * dt;
        P.y += P.vy * dt;
        P.rot += dt * (death === 'blast' ? 9 : 5) * P.face;
        if (death === 'blast' && Math.random() < 0.5) fx.burst(P.x, P.y - 10, { count: 1, speed: 30, life: 0.8, size: 4, gravity: -20, colors: SOOT });
        cosmetic(dt, 0.6);
      },

      render(g) {
        const kx = shake > 0 ? (Math.random() - 0.5) * 9 * shake : 0;
        const ky = shake > 0 ? (Math.random() - 0.5) * 9 * shake : 0;
        g.save();
        g.translate(kx, ky);

        // ---- sky and fireworks ----
        drawSprite(g, sky, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        for (const f of flashes) {
          const a = f.life / f.max;
          drawSprite(g, whiteGlow, f.x, f.y, { size: f.size * (1.2 - 0.4 * a), alpha: 0.3 * a });
        }
        g.globalCompositeOperation = 'source-over';
        skyfx.render(g, true);
        for (const s of shells) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, fireGlow, s.x, s.y, { size: 14, alpha: 0.8 });
          g.globalCompositeOperation = 'source-over';
        }

        // ---- the city behind, in parallax ----
        const tile = (spr, k, y) => {
          const off = (((-camX * k) % spr.w) + spr.w) % spr.w;
          for (let x = off - spr.w; x < W; x += spr.w) g.drawImage(spr.canvas, x, y - spr.h, spr.w, spr.h);
        };
        tile(far, 0.15, 470);
        // drifting bonfire smoke
        g.fillStyle = 'rgba(120,80,100,0.08)';
        for (let i = 0; i < 5; i++) {
          const x = ((i * 157 + clock * 9 - camX * 0.25) % (W + 200) + W + 200) % (W + 200) - 100;
          g.beginPath();
          g.ellipse(x, 430 + i * 9, 110, 14, 0, 0, TAU);
          g.fill();
        }
        tile(mid, 0.45, ROOF + 6);
        const haze = g.createLinearGradient(0, 380, 0, ROOF);
        haze.addColorStop(0, 'rgba(40,30,60,0)');
        haze.addColorStop(1, 'rgba(30,20,44,0.45)');
        g.fillStyle = haze;
        g.fillRect(0, 380, W, ROOF - 380);

        // ---- the terrace roof ----
        {
          const off = (((-camX) % 240) + 240) % 240;
          for (let x = off - 240; x < W; x += 240) g.drawImage(roof.canvas, x, ROOF, 240, roofH);
        }

        // ---- chimneys ----
        const i0 = Math.max(0, lowerIndex(camX - 80));
        const visible = [];
        for (let i = i0; i < chims.length; i++) {
          const c = chims[i];
          if (c.x - c.w / 2 - camX > W + 20) break;
          if (c.x + c.w / 2 - camX < -20) continue;
          visible.push(i);
        }
        for (const i of visible) drawChimney(chims[i]);

        // smoke
        for (const s of smoke) drawSprite(g, smokeArt, s.x - camX, s.y, { size: s.r * 2.4, alpha: 0.7 * Math.min(1, s.life / s.max * 2) });

        // fuse cords
        for (const cd of cords) drawCord(cd);

        // jets and glows of lit chimneys
        g.globalCompositeOperation = 'lighter';
        for (const i of visible) {
          const c = chims[i];
          const f = c.fuse;
          if (!f) continue;
          const sx = c.x - camX;
          if (f.blown) {
            const k = clamp((time - f.at) / BLAST, 0, 1);
            const pt = potTop(c);
            const hh = 150 * (1 - k * 0.5);
            g.globalAlpha = 1 - k * 0.6;
            g.drawImage(jet.canvas, pt.x - camX - 14, pt.y - hh, 28, hh + 6);
            g.globalAlpha = 1;
            drawSprite(g, fireGlow, sx, c.top - 10, { size: 120, alpha: 0.9 - 0.6 * k });
          } else {
            const k = clamp((time - f.lit) / (f.at - f.lit), 0, 1);
            const pulse = 0.6 + 0.4 * Math.sin(clock * (8 + 14 * k));
            drawSprite(g, redGlow, sx, c.top, { size: c.w + 40, alpha: (0.25 + 0.5 * k) * pulse });
            const pt = potTop(c);
            drawSprite(g, fireGlow, pt.x - camX, pt.y - 2, { size: 20 + 10 * pulse, alpha: 0.9 });
          }
        }
        g.globalCompositeOperation = 'source-over';
        // countdown rings over lit chimneys
        for (const i of visible) {
          const c = chims[i];
          const f = c.fuse;
          if (!f || f.blown) continue;
          const k = clamp((time - f.lit) / (f.at - f.lit), 0, 1);
          const rx = c.x - camX;
          const ry = c.top + 22;
          g.fillStyle = 'rgba(14,10,24,0.65)';
          g.beginPath();
          g.arc(rx, ry, 9, 0, TAU);
          g.fill();
          g.strokeStyle = `rgb(255,${Math.round(210 - 160 * k)},${Math.round(80 - 50 * k)})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(rx, ry, 9, -Math.PI / 2, -Math.PI / 2 + TAU * k);
          g.stroke();
          g.fillStyle = '#fff3e0';
          g.font = `900 9px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(f.chain ? '~' : '!', rx, ry + 0.5);
        }

        // rockets on their way up
        for (const r of rockets) drawSprite(g, rocket, r.x - camX, r.y, { size: 10 });

        // ---- the aim ----
        if (!game.dead && !P.air && P.cdir) drawAim();

        // ---- the sweep ----
        drawSweep();

        g.save();
        g.translate(-camX, 0);
        fx.render(g, false);
        sparks.render(g, true);
        g.restore();

        // a lit chimney under the sweep: a red "!" over their head
        if (!game.dead) {
          const h = home();
          const f = h >= 0 ? chims[h].fuse : null;
          if (f && !f.blown) {
            const blink = 0.6 + 0.4 * Math.sin(clock * 18);
            const x = P.x - camX;
            const y = P.y - 66;
            g.fillStyle = `rgba(210,30,30,${0.85 * blink + 0.15})`;
            g.beginPath();
            g.arc(x, y, 10, 0, TAU);
            g.fill();
            g.fillStyle = '#fff';
            g.font = `900 15px ${BODY_FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('!', x, y + 1);
          }
        }

        // a hint for the first seconds
        if (time < 4.5 && !game.dead) {
          const a = clamp(4.5 - time, 0, 1) * 0.9;
          g.font = `800 14px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = `rgba(10,8,24,${a * 0.7})`;
          g.fillText('HOLD TO AIM · LET GO TO LEAP', W / 2 + 1, 392);
          g.fillStyle = `rgba(255,236,200,${a})`;
          g.fillText('HOLD TO AIM · LET GO TO LEAP', W / 2, 391);
        }

        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        if (game.dead) {
          const word = death === 'blast' ? 'WHOOSH!' : 'WHOOPS!';
          const a = clamp(deadT * 3, 0, 1);
          g.font = `800 32px ${DISPLAY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = `rgba(10,8,24,${0.8 * a})`;
          g.fillText(word, W / 2 + 2, 302);
          g.fillStyle = `rgba(255,190,80,${a})`;
          g.fillText(word, W / 2, 300);
        }

        function lowerIndex(x) {
          let lo = 0;
          let hi = chims.length - 1;
          while (lo < hi) {
            const m = (lo + hi + 1) >> 1;
            if (chims[m].x <= x) lo = m;
            else hi = m - 1;
          }
          return lo;
        }

        function drawChimney(c) {
          const sx = c.x - camX;
          const x = sx - c.w / 2;
          const bodyTop = c.top + CAPH;
          const bh = ROOF + 4 - bodyTop;
          const tex = bricks[c.brick];
          const scale = tex.canvas.width / tex.w;
          // shadow on the slates
          g.fillStyle = 'rgba(6,4,14,0.35)';
          g.fillRect(x + c.w - 2, ROOF, 10, 6);
          g.drawImage(tex.canvas, 0, 0, Math.min(tex.w, c.w) * scale, Math.min(tex.h, bh) * scale, x, bodyTop, c.w, bh);
          g.drawImage(shade.canvas, x, bodyTop, c.w, bh);
          // flashing where it meets the roof
          g.fillStyle = '#5a5e6e';
          g.fillRect(x - 2, ROOF, c.w + 4, 4);
          g.fillStyle = 'rgba(255,255,255,0.15)';
          g.fillRect(x - 2, ROOF, c.w + 4, 1);
          // pots, the rocket in its pot, and the cap
          const potArt = pots[c.pot];
          c.potXs.forEach((px, k) => {
            const hh = 22 * c.potH[k];
            if (c.fuse && !c.fuse.blown && k === c.rocketPot) {
              const wob = Math.sin(clock * 40) * 0.6;
              drawSprite(g, rocket, sx + px + wob, c.top - hh - 6, { size: 9 });
            }
            g.drawImage(potArt.canvas, sx + px - 6.5, c.top - hh + 1, 13, hh);
          });
          g.drawImage(cap.canvas, x - 4, c.top, c.w + 8, CAPH + 2);
        }

        function drawCord(cd) {
          const spark = sparkX(cd);
          const a = chims[cd.ids[0]];
          const b = chims[cd.ids.at(-1)];
          const lo = Math.min(a.x, b.x);
          const hi = Math.max(a.x, b.x);
          // burnt part: the spark has already passed it
          const step = 6;
          const burnt = (x) => spark === null ? time > cd.t0 : cd.dir > 0 ? x < spark : x > spark;
          g.lineWidth = 2;
          let prev = null;
          for (let x = lo; x <= hi + 0.1; x += step) {
            const xx = Math.min(x, hi);
            const y = cordY(cd, xx);
            if (prev) {
              g.strokeStyle = burnt(xx) ? 'rgba(90,80,80,0.45)' : '#e8d8a8';
              g.beginPath();
              g.moveTo(prev[0] - camX, prev[1]);
              g.lineTo(xx - camX, y);
              g.stroke();
            }
            prev = [xx, y];
          }
          if (spark !== null) {
            const sx = spark - camX;
            const sy = cordY(cd, spark);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, fireGlow, sx, sy, { size: 34 + Math.sin(clock * 30) * 6 });
            drawSprite(g, whiteGlow, sx, sy, { size: 14 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        function drawAim() {
          const d = P.cdir * P.charge;
          const x1 = P.x + d;
          const ti = chimneyAt(x1);
          const c = ti >= 0 ? chims[ti] : null;
          const y1 = c ? c.top : ROOF + 2;
          const dist = Math.abs(d);
          const hh = 24 + dist * 0.2 + Math.max(0, P.y - y1) * 0.5;
          const ok = c && ti !== P.on ? (c.fuse ? 'lit' : 'ok') : c ? 'same' : 'gap';
          const col = ok === 'ok' ? '120,255,150' : ok === 'lit' ? '255,190,70' : ok === 'same' ? '220,220,240' : '255,80,70';
          for (let k = 1; k <= 14; k++) {
            const s = k / 15;
            const x = lerp(P.x, x1, s) - camX;
            const y = lerp(P.y - 12, y1 - 4, s) - hh * 4 * s * (1 - s);
            g.fillStyle = `rgba(${col},${0.35 + 0.5 * s})`;
            g.beginPath();
            g.arc(x, y, 1.6 + s, 0, TAU);
            g.fill();
          }
          const lx = x1 - camX;
          g.globalCompositeOperation = 'lighter';
          if (ok === 'ok') drawSprite(g, greenGlow, lx, y1, { size: 46, alpha: 0.7 });
          else if (ok === 'gap') drawSprite(g, redGlow, lx, y1, { size: 40, alpha: 0.6 });
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = `rgb(${col})`;
          g.lineWidth = 2.4;
          g.beginPath();
          g.ellipse(lx, y1, 9, 3.6, 0, 0, TAU);
          g.stroke();
          if (ok === 'gap') {
            g.beginPath();
            g.moveTo(lx - 4, y1 - 10);
            g.lineTo(lx + 4, y1 - 2);
            g.moveTo(lx + 4, y1 - 10);
            g.lineTo(lx - 4, y1 - 2);
            g.stroke();
          }
        }

        function drawSweep() {
          const x = P.x - camX;
          const y = P.y;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, warmGlow, x, y - 22, { size: 74, alpha: 0.28 });
          g.globalCompositeOperation = 'source-over';
          let pose = 0;
          if (game.dead) pose = 3;
          else if (P.air) pose = 2;
          else if (P.cdir) pose = 1;
          const squash = !P.air && !game.dead ? (P.cdir ? 0.1 * (P.charge / DMAX) : 0) + 0.12 * P.land : 0;
          g.save();
          g.translate(x, y);
          if (game.dead) g.rotate(P.rot);
          else if (P.air) g.rotate(P.face * 0.18 * Math.sin(clamp((time - P.air.t0) / P.air.T, 0, 1) * Math.PI));
          g.scale(P.face * (1 + squash * 0.6), 1 - squash);
          g.drawImage(sweep[pose].canvas, -22, -59, 44, 60);
          g.restore();
        }
      },
    };
    return game;
  },
};
