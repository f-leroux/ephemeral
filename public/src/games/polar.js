// Polar Night — an explorer in an orange parka tiptoes across the sea ice in the long arctic
// night, torch in hand. Polar bears, walruses and arctic foxes lie asleep on the ice, and any of
// them caught in the torch beam for half a second wakes up. The only cover is the ice blocks:
// each one throws a long shadow away from the torch, and the shadows swing as you walk, so you
// keep sliding sideways to keep every sleeper in the dark. Bump into anything (an ice block, a
// sleeping animal, or, from 24s, the open water of a lead) and the run is over.
// Every layout is checked in advance against a planner that walks it at the explorer's own speed,
// so there is always a way through.

import {
  createParticles,
  createMover,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const PY = 540; // the explorer's centre
const PR = 11; // the explorer's radius
const TORCH_Y = PY - 20; // where the beam starts
const RANGE = 320; // how far the beam reaches
const HALF = 0.42; // the beam's half-angle (about 24°)
const TAN = Math.tan(HALF);
const WAKE = 0.45; // seconds of torchlight that wake a sleeper
const CALM = 0.7; // how fast a stirring sleeper settles again in the dark (per second)
const MINX = 22;
const MAXX = 338;
const SPEED = 230;

// the ice slides towards you a little faster all the time
const V0 = 62;
const V1 = 140;
const VP = 1.25;
const speedAt = (t) => V0 + (V1 - V0) * Math.pow(clamp(t / 60, 0, 1), VP);
const scrollAt = (t) => V0 * t + ((V1 - V0) * 60 * Math.pow(Math.max(0, t) / 60, VP + 1)) / (VP + 1);

const KINDS = {
  bear: { r: 19, size: 60, name: 'polar bear' },
  walrus: { r: 19, size: 64, name: 'walrus' },
  fox: { r: 10, size: 34, name: 'arctic fox' },
};

const SNOW = ['#ffffff', '#e4f0fb', '#c9dcef'];
const ICE = ['#ffffff', '#d6ecfb', '#9cc8ea'];
const SPLASH = ['#ffffff', '#bfe6ff', '#5fa8d8'];

// ---------- light ----------

// is (ax, ay) inside the torch beam held at x = tx (ignoring shadows)?
// (the planner passes a margin m so its route never grazes the edge of the beam)
function inBeam(tx, ax, ay, m = 0) {
  const dx = ax - tx;
  const dy = TORCH_Y - ay;
  if (dy <= -m || dx * dx + dy * dy > (RANGE + m) ** 2) return false;
  return Math.abs(dx) < dy * TAN + m;
}

// does an ice block stand between the torch at x = tx and (ax, ay)?
function shaded(tx, ax, ay, rocks, m = 0) {
  const sx = ax - tx;
  const sy = ay - TORCH_Y;
  const L2 = sx * sx + sy * sy;
  for (const r of rocks) {
    if (r.y < ay - r.r || r.y > TORCH_Y + r.r) continue;
    const u = clamp(((r.x - tx) * sx + (r.y - TORCH_Y) * sy) / L2, 0, 1);
    const px = tx + sx * u - r.x;
    const py = TORCH_Y + sy * u - r.y;
    if (px * px + py * py < (r.r - m) ** 2) return true;
  }
  return false;
}

// ---------- art ----------

// sea ice, painted as if in daylight: the night is laid over it later (tiles vertically)
function paintIce(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#eef4fa');
    base.addColorStop(1, '#d3e1ee');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) fn(dy);
    };
    // patches of bare, wind-polished blue ice
    for (let i = 0; i < 9; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const rx = rng.range(30, 80);
      const ry = rx * rng.range(0.4, 0.8);
      const rot = rng.range(-0.5, 0.5);
      wrap((dy) => {
        const grad = g.createRadialGradient(x, y + dy, 2, x, y + dy, rx);
        grad.addColorStop(0, 'rgba(140,186,224,0.55)');
        grad.addColorStop(0.7, 'rgba(160,200,232,0.3)');
        grad.addColorStop(1, 'rgba(160,200,232,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x, y + dy, rx, ry, rot, 0, Math.PI * 2);
        g.fill();
      });
    }
    // sastrugi: ripples the wind carves in the snow
    g.lineCap = 'round';
    for (let i = 0; i < 80; i++) {
      const x = rng.range(-20, W);
      const y = rng.range(0, H);
      const len = rng.range(14, 40);
      const bow = rng.range(-4, 4);
      wrap((dy) => {
        g.strokeStyle = 'rgba(130,160,196,0.45)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x, y + dy);
        g.quadraticCurveTo(x + len / 2, y + dy + bow - 2, x + len, y + dy + 1);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + 1, y + dy - 1.5);
        g.quadraticCurveTo(x + len / 2, y + dy + bow - 3.5, x + len - 1, y + dy - 0.5);
        g.stroke();
      });
    }
    // pressure cracks
    for (let i = 0; i < 5; i++) {
      const pts = [[rng.range(0, W), rng.range(0, H)]];
      let a = rng.range(0, Math.PI * 2);
      for (let k = 0; k < 9; k++) {
        a += rng.range(-0.6, 0.6);
        const [px, py] = pts[pts.length - 1];
        pts.push([px + Math.cos(a) * rng.range(10, 22), py + Math.sin(a) * rng.range(10, 22)]);
      }
      wrap((dy) => {
        for (const [lw, col, off] of [[2.2, 'rgba(70,112,160,0.45)', 0], [1, 'rgba(255,255,255,0.75)', -1]]) {
          g.strokeStyle = col;
          g.lineWidth = lw;
          g.beginPath();
          pts.forEach(([px, py], k) => (k ? g.lineTo(px, py + dy + off) : g.moveTo(px, py + dy + off)));
          g.stroke();
        }
      });
    }
    // frost sparkle
    for (let i = 0; i < 200; i++) {
      g.fillStyle = rng.chance(0.6) ? 'rgba(255,255,255,0.9)' : 'rgba(120,160,205,0.4)';
      const s = rng.range(0.6, 1.6);
      g.fillRect(rng.range(0, W), rng.range(0, H), s, s);
    }
  }, 1.5);
}

// a chunky ice block seen from above, lit from the top left; its footprint is a circle of radius 26
function paintBlock(rng) {
  return makeSprite(68, 68, (g) => {
    const n = rng.int(7, 9);
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.18, 0.18);
      const rr = 26 * rng.range(0.88, 1.05);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const poly = (ps, dx = 0, dy = 0) => {
      g.beginPath();
      ps.forEach(([x, y], k) => (k ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)));
      g.closePath();
    };
    // contact shadow and the block's flank
    g.fillStyle = 'rgba(40,70,120,0.3)';
    poly(pts, 3, 7);
    g.fill();
    g.fillStyle = '#5a8cbf';
    poly(pts, 0, 5);
    g.fill();
    // top face
    const top = g.createLinearGradient(-22, -24, 22, 24);
    top.addColorStop(0, '#f6fcff');
    top.addColorStop(0.5, '#c4e2f6');
    top.addColorStop(1, '#85b6de');
    g.fillStyle = top;
    poly(pts);
    g.fill();
    // facets, each shaded by which way it faces
    const c = [rng.range(-7, 3), rng.range(-7, 2)];
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % n];
      const mid = Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      const lit = Math.cos(mid + 2.3);
      g.fillStyle = lit > 0 ? `rgba(255,255,255,${0.35 * lit})` : `rgba(40,100,170,${-0.3 * lit})`;
      g.beginPath();
      g.moveTo(c[0], c[1]);
      g.lineTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(c[0], c[1]);
      g.lineTo(a[0], a[1]);
      g.stroke();
    }
    // a cap of snow
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = rng.range(7, 12);
      g.lineTo(c[0] - 2 + Math.cos(a) * rr, c[1] - 2 + Math.sin(a) * rr * 0.8);
    }
    g.closePath();
    g.fill();
    // crisp edges where the light catches them
    g.lineWidth = 1.4;
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % n];
      const mid = Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      g.strokeStyle = Math.cos(mid + 2.3) > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(50,95,150,0.6)';
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    // cracks inside the ice
    g.strokeStyle = 'rgba(90,150,205,0.5)';
    g.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) {
      let x = rng.range(-14, 14);
      let y = rng.range(-14, 14);
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        x += rng.range(-7, 7);
        y += rng.range(-7, 7);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 3);
}

// curled up asleep, seen from above
function paintBear() {
  return makeSprite(60, 52, (g) => {
    g.fillStyle = 'rgba(40,60,110,0.3)';
    g.beginPath();
    g.ellipse(3, 5, 27, 20, -0.15, 0, Math.PI * 2);
    g.fill();
    const fur = g.createRadialGradient(-4, -6, 2, 2, 2, 30);
    fur.addColorStop(0, '#ffffff');
    fur.addColorStop(0.55, '#f2eee2');
    fur.addColorStop(1, '#c3cad6');
    g.fillStyle = fur;
    g.beginPath();
    g.ellipse(4, 2, 23, 17, -0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(16, 9, 10, 8, 0.5, 0, Math.PI * 2); // hind leg
    g.fill();
    g.fillStyle = '#e9e5d8';
    g.beginPath();
    g.ellipse(25, 1, 3.4, 2.6, 0, 0, Math.PI * 2); // tail
    g.fill();
    // fur texture
    g.strokeStyle = 'rgba(160,170,190,0.55)';
    g.lineWidth = 0.9;
    g.lineCap = 'round';
    for (const [x, y, a] of [[0, -8, 0.4], [8, -6, 0.2], [14, -1, 0.5], [4, 6, 0.3], [10, 12, 0.7], [-4, 2, 0.2], [18, 5, 0.6]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      g.stroke();
    }
    // front paws, tucked under the chin
    for (const [x, y] of [[-12, 9], [-3, 12]]) {
      g.fillStyle = '#f4f1e8';
      g.beginPath();
      g.ellipse(x, y, 6.5, 4.3, 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4a4650';
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.arc(x - 5, y + k * 1.8, 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
    // head resting on the paws
    const head = g.createRadialGradient(-17, -9, 1, -15, -5, 13);
    head.addColorStop(0, '#ffffff');
    head.addColorStop(1, '#d9dbe0');
    g.fillStyle = head;
    g.beginPath();
    g.arc(-15, -5, 10.5, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [[-10, -15], [-20, -14]]) {
      g.fillStyle = '#ebe8de';
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b9b2a6';
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f7f3ea';
    g.beginPath();
    g.ellipse(-22, -1, 6.5, 4.8, 0.5, 0, Math.PI * 2); // muzzle
    g.fill();
    g.fillStyle = '#1c1b22';
    g.beginPath();
    g.ellipse(-26.5, 1.5, 2.5, 1.9, 0.5, 0, Math.PI * 2);
    g.fill();
    // closed eyes
    g.strokeStyle = '#2a2830';
    g.lineWidth = 1.1;
    for (const [x, y] of [[-17, -8], [-12, -6]]) {
      g.beginPath();
      g.arc(x, y - 1.2, 2, 0.4, Math.PI - 0.4);
      g.stroke();
    }
  }, 3);
}

function paintWalrus() {
  return makeSprite(64, 44, (g) => {
    g.fillStyle = 'rgba(40,60,110,0.3)';
    g.beginPath();
    g.ellipse(3, 5, 29, 16, 0, 0, Math.PI * 2);
    g.fill();
    // rear flippers
    g.fillStyle = '#7d5446';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(24, s * 2);
      g.quadraticCurveTo(33, s * 4, 31, s * 12);
      g.quadraticCurveTo(28, s * 9, 22, s * 6);
      g.closePath();
      g.fill();
    }
    const body = g.createRadialGradient(-2, -6, 2, 4, 2, 30);
    body.addColorStop(0, '#dcae95');
    body.addColorStop(0.55, '#b27e68');
    body.addColorStop(1, '#7c5244');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(4, 0, 25, 15, 0, 0, Math.PI * 2);
    g.fill();
    // fore flippers
    g.fillStyle = '#8a5d4d';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(-8, s * 14, 8, 3.6, s * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // wrinkles
    g.strokeStyle = 'rgba(100,58,46,0.5)';
    g.lineWidth = 1;
    for (const x of [-2, 6, 14]) {
      g.beginPath();
      g.arc(x + 14, 0, 14, Math.PI - 0.6, Math.PI + 0.6);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,230,210,0.35)';
    g.beginPath();
    g.ellipse(0, -6, 12, 4, -0.1, 0, Math.PI * 2);
    g.fill();
    // head and whiskery muzzle
    g.fillStyle = '#b8846d';
    g.beginPath();
    g.arc(-19, 0, 10.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0bba2';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(-26, s * 3.6, 4.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(90,50,40,0.7)';
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(-27.5 + (k % 2) * 2.5, s * (2 + k * 1.2), 0.55, 0, Math.PI * 2);
        g.fill();
      }
    }
    // tusks
    g.strokeStyle = '#fff6df';
    g.lineCap = 'round';
    g.lineWidth = 2.4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(-29, s * 2.6);
      g.quadraticCurveTo(-34, s * 3.4, -37, s * 2.2);
      g.stroke();
    }
    // closed eyes
    g.strokeStyle = '#3a221b';
    g.lineWidth = 1.1;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(-17, s * 6, 1.8, -0.3, Math.PI + 0.3, s < 0);
      g.stroke();
    }
  }, 3);
}

function paintFox() {
  return makeSprite(36, 34, (g) => {
    g.fillStyle = 'rgba(40,60,110,0.3)';
    g.beginPath();
    g.ellipse(2, 3, 15, 13, 0, 0, Math.PI * 2);
    g.fill();
    const fur = g.createRadialGradient(-3, -4, 1, 0, 0, 15);
    fur.addColorStop(0, '#ffffff');
    fur.addColorStop(1, '#cdd6e2');
    g.fillStyle = fur;
    g.beginPath();
    g.arc(1, 0, 11.5, 0, Math.PI * 2);
    g.fill();
    // the bushy tail wrapped around, nose tucked into it
    g.strokeStyle = '#f4f6fa';
    g.lineCap = 'round';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(1, 0, 11, 0.2, 2.6);
    g.stroke();
    g.strokeStyle = 'rgba(170,185,205,0.6)';
    g.lineWidth = 1;
    for (let a = 0.4; a < 2.5; a += 0.35) {
      g.beginPath();
      g.moveTo(1 + Math.cos(a) * 9, Math.sin(a) * 9);
      g.lineTo(1 + Math.cos(a + 0.15) * 14, Math.sin(a + 0.15) * 14);
      g.stroke();
    }
    // head
    g.fillStyle = '#fbfcfe';
    g.beginPath();
    g.arc(-5, -3, 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#eef1f6';
    for (const [x, y, a] of [[-3, -10, -0.2], [-10, -7, -1.1]]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-3, 1);
      g.lineTo(0, -5);
      g.lineTo(3, 1);
      g.closePath();
      g.fill();
      g.fillStyle = '#c8b9b6';
      g.beginPath();
      g.moveTo(-1.4, 0.5);
      g.lineTo(0, -3);
      g.lineTo(1.4, 0.5);
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = '#eef1f6';
    }
    g.fillStyle = '#1b1a20';
    g.beginPath();
    g.arc(-10, 1, 1.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a2830';
    g.lineWidth = 0.9;
    for (const [x, y] of [[-7, -4], [-3.5, -5]]) {
      g.beginPath();
      g.arc(x, y - 0.8, 1.4, 0.4, Math.PI - 0.4);
      g.stroke();
    }
  }, 3);
}

// the explorer from above, walking up the screen with the torch held out in front
function paintExplorer(step) {
  return makeSprite(40, 56, (g) => {
    g.fillStyle = 'rgba(30,45,90,0.35)';
    g.beginPath();
    g.ellipse(1, 8, 14, 16, 0, 0, Math.PI * 2);
    g.fill();
    // boots, one ahead of the other
    g.fillStyle = '#2b2a33';
    for (const s of [-1, 1]) {
      const fwd = (s > 0) === !!step ? -5 : 4;
      g.beginPath();
      g.ellipse(s * 6, 14 + fwd, 3.6, 5.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // backpack with a rolled sleeping mat
    g.fillStyle = '#2f5a4a';
    g.beginPath();
    g.roundRect(-9, 6, 18, 13, 4);
    g.fill();
    g.fillStyle = '#3c9bd6';
    g.beginPath();
    g.roundRect(-11, 16, 22, 6, 3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-10, 17, 20, 1.3);
    // parka
    const coat = g.createRadialGradient(-4, -4, 2, 0, 2, 16);
    coat.addColorStop(0, '#ffb066');
    coat.addColorStop(0.6, '#f2731f');
    coat.addColorStop(1, '#b84a0e');
    g.fillStyle = coat;
    g.beginPath();
    g.ellipse(0, 2, 12.5, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(-12, 4.5, 24, 1.6); // reflective stripe
    // arms reaching forward to the torch
    g.strokeStyle = '#e5661a';
    g.lineCap = 'round';
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 10, -1);
      g.quadraticCurveTo(s * 9, -12, s * 2.5, -17);
      g.stroke();
    }
    g.fillStyle = '#3b3640';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 2.2, -17.5, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // the torch
    g.fillStyle = '#9aa4b2';
    g.fillRect(-2, -26, 4, 9);
    g.fillStyle = '#c9d2dc';
    g.fillRect(-3, -27.5, 6, 3);
    g.fillStyle = '#fff4c8';
    g.fillRect(-2.2, -27.8, 4.4, 1.2);
    // the hood seen from behind, its fur trim showing round the front
    const hood = g.createRadialGradient(-2.5, -1, 1, 0, -3, 9);
    hood.addColorStop(0, '#ff9a4a');
    hood.addColorStop(0.7, '#e8681c');
    hood.addColorStop(1, '#b4470f');
    g.fillStyle = hood;
    g.beginPath();
    g.arc(0, -3, 7.8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(150,55,10,0.6)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(0, -10);
    g.quadraticCurveTo(0.8, -3, 0, 4.5);
    g.stroke();
    g.fillStyle = '#f6ecda';
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + 0.35 + (k / 10) * (Math.PI - 0.7);
      g.beginPath();
      g.arc(Math.cos(a) * 7.6, -3 + Math.sin(a) * 7.6, 1.9 + (k % 2) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-3, -1, 2.4, 1.5, -0.5, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// soft curtains of aurora reflected on the ice
function paintAurora(w, h, col) {
  return makeSprite(w, h, (g) => {
    for (let k = 0; k < 3; k++) {
      const grad = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, col.replace('A', '0'));
      grad.addColorStop(0.3 + k * 0.15, col.replace('A', '0.55'));
      grad.addColorStop(1, col.replace('A', '0'));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-w / 2, -h / 2 + k * 20);
      g.bezierCurveTo(-w / 6, -h / 2 + 60 + k * 30, w / 6, h / 2 - 120, w / 2, -h / 2 + 80 + k * 40);
      g.lineTo(w / 2, -h / 2 + 150 + k * 40);
      g.bezierCurveTo(w / 6, h / 2 - 40, -w / 6, -h / 2 + 140 + k * 30, -w / 2, -h / 2 + 90 + k * 20);
      g.closePath();
      g.fill();
    }
  }, 0.5);
}

// ---------- the layout ----------

function build(plan, W) {
  const solids = []; // ice blocks and sleepers: { type, x, D, r, ... }, D = how far up the ice they lie
  const leads = []; // open water: { D, h, bridges: [[x0, x1], ...] }
  const groups = [];
  let maxD = 0;
  const group = (t) => {
    const g = { t, removed: false };
    groups.push(g);
    return g;
  };
  const free = (x, D, r) => {
    for (const o of solids) {
      if (Math.abs(o.D - D) > 120) continue;
      const dx = o.x - x;
      const dD = o.D - D;
      if (dx * dx + dD * dD < (o.r + r + 8) ** 2) return false;
    }
    for (const l of leads) if (Math.abs(l.D - D) < l.h / 2 + r + 26) return false;
    return x - r > 4 && x + r < W - 4;
  };
  const addRock = (g, x, D, r) => {
    const o = { type: 'rock', x, D, r, group: g, art: plan.int(0, 3), flip: plan.chance(0.5) };
    solids.push(o);
    maxD = Math.max(maxD, D + r);
    return o;
  };
  const addAnimal = (g, kind, x, D) => {
    const o = { type: 'animal', kind, x, D, r: KINDS[kind].r, group: g, flip: plan.chance(0.5), ph: plan.range(0, 6.28) };
    solids.push(o);
    maxD = Math.max(maxD, D + o.r);
    return o;
  };

  // a couple of blocks already in view at the start, away from the middle
  const g0 = group(0);
  addRock(g0, 64, scrollAt(0) - 210, 24);
  addRock(g0, 296, scrollAt(0) - 330, 22);

  let t = 0.2;
  let nextLead = 24;
  let tries = 0;
  while (t < 60 && tries++ < 400) {
    const p = progress(t, 60, 1.2);
    const Dtop = scrollAt(t) + 70;
    const g = group(t);

    if (t >= nextLead) {
      // a lead of open water right across the ice, crossed only on its ice bridges
      const h = plan.range(24, 32);
      const D = Math.max(Dtop, maxD + h / 2 + 30);
      const w = lerp(84, 54, p);
      const bridges = [];
      const nb = p > 0.45 && plan.chance(0.5) ? 2 : 1;
      if (nb === 1) {
        const c = plan.range(30 + w / 2, W - 30 - w / 2);
        bridges.push([c - w / 2, c + w / 2]);
      } else {
        const c1 = plan.range(26 + w / 2, W / 2 - 30);
        const c2 = plan.range(W / 2 + 30, W - 26 - w / 2);
        bridges.push([c1 - w / 2, c1 + w / 2], [c2 - w / 2, c2 + w / 2]);
      }
      leads.push({ D, h, bridges, group: g });
      maxD = Math.max(maxD, D + h / 2);
      nextLead = t + lerp(7, 4.2, p) * plan.range(0.85, 1.2);
      t += lerp(1.6, 0.8, p);
      continue;
    }

    const roll = plan.next();
    const sleeper = () => {
      if (t > 16 && plan.chance(0.3)) return 'fox';
      return plan.chance(0.55) ? 'bear' : 'walrus';
    };
    if (t > 6 && roll < 0.18) {
      // a sleeper out in the open near one edge: stay well away from that side
      const kind = sleeper();
      const r = KINDS[kind].r;
      const left = plan.chance(0.5);
      const x = left ? plan.range(18 + r, 70) : plan.range(W - 70, W - 18 - r);
      if (free(x, Dtop, r)) addAnimal(g, kind, x, Dtop);
    } else if (t > 12 && roll < 0.36) {
      // a ridge of blocks, with two sleepers behind it
      const n = plan.chance(0.5) ? 2 : 3;
      const rr = plan.range(18, 23);
      const span = (n - 1) * rr * 1.5;
      const x0 = plan.range(30 + rr, W - 30 - rr - span);
      if ([...Array(n)].every((_, k) => free(x0 + k * rr * 1.5, Dtop, rr))) {
        for (let k = 0; k < n; k++) addRock(g, x0 + k * rr * 1.5, Dtop + plan.range(-4, 4), rr);
        for (let k = 0; k < 2; k++) {
          const kind = sleeper();
          const ar = KINDS[kind].r;
          const ax = clamp(x0 + plan.range(-10, span + 10), 18 + ar, W - 18 - ar);
          const aD = Dtop + rr + ar + plan.range(6, lerp(30, 70, p));
          if (free(ax, aD, ar)) addAnimal(g, kind, ax, aD);
        }
      }
    } else if (t > 26 && roll < 0.52) {
      // one big block with sleepers peeking out on both sides
      const rr = plan.range(26, 32);
      const x = plan.range(70, W - 70);
      if (free(x, Dtop, rr)) {
        addRock(g, x, Dtop, rr);
        for (const s of [-1, 1]) {
          const kind = plan.chance(0.6) ? 'bear' : 'walrus';
          const ar = KINDS[kind].r;
          const ax = clamp(x + s * rr * plan.range(0.6, 1.1), 18 + ar, W - 18 - ar);
          const aD = Dtop + rr + ar + plan.range(10, 50);
          if (free(ax, aD, ar)) addAnimal(g, kind, ax, aD);
        }
      }
    } else if (roll < 0.8) {
      // a sleeper curled up behind a block; further off the block's line later, so its shadow swings more
      const kind = sleeper();
      const ar = KINDS[kind].r;
      const rr = kind === 'fox' ? plan.range(15, 20) : plan.range(lerp(24, 20, p), lerp(31, 27, p));
      const x = plan.range(40 + rr, W - 40 - rr);
      if (free(x, Dtop, rr)) {
        addRock(g, x, Dtop, rr);
        const ax = clamp(x + plan.range(-1, 1) * rr * lerp(0.2, 1, p), 18 + ar, W - 18 - ar);
        const aD = Dtop + rr + ar + plan.range(4, lerp(24, 80, p));
        if (free(ax, aD, ar)) addAnimal(g, kind, ax, aD);
      }
    } else {
      // loose blocks: obstacles, and cover for later
      const n = plan.chance(0.4) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const rr = plan.range(16, 26);
        const x = plan.range(20 + rr, W - 20 - rr);
        const D = Dtop + k * plan.range(50, 90);
        if (free(x, D, rr)) addRock(g, x, D, rr);
      }
    }
    t += lerp(2.3, 0.85, p) * plan.range(0.8, 1.2);
  }
  solids.sort((a, b) => a.D - b.D);
  leads.sort((a, b) => a.D - b.D);
  return { solids, leads, groups };
}

// Walk the layout with a planner at a little under the explorer's speed, keeping every sleeper's
// stirring well short of waking. Wherever it gets stuck, the newest group of things in the way is
// taken out and the walk resumes from a checkpoint, so every run has a way through.
function solve(world) {
  const { solids, leads } = world;
  const DT = 1 / 30;
  const COLW = 5; // one column per step: 150 units/s, well under the explorer's top speed
  const LIMIT = 0.45;
  const cols = [];
  for (let x = MINX; x <= MAXX + 0.01; x += COLW) cols.push(x);
  const NC = cols.length;
  const animals = solids.filter((o) => o.type === 'animal');
  animals.forEach((a, i) => (a.ai = i));
  const NA = Math.max(1, animals.length);
  const STEPS = Math.round(60.5 / DT);
  let cur = new Float32Array(NC * NA);
  let nxt = new Float32Array(NC * NA);
  let reach = new Uint8Array(NC);
  let nreach = new Uint8Array(NC);
  const from = new Int8Array(STEPS * NC);
  reach[Math.round((180 - MINX) / COLW)] = 1;
  const checkpoints = [];
  const blocked = new Uint8Array(NC);
  const lit = new Uint8Array(NC * 16);
  let k = 0;
  let guard = 0;
  while (k < STEPS && guard++ < 20000) {
    if (k % 30 === 0) checkpoints[k / 30] = { cur: cur.slice(), reach: reach.slice() };
    const t = (k + 1) * DT;
    const S = scrollAt(t);
    const rocks = [];
    const act = [];
    const near = [];
    for (const o of solids) {
      if (o.group.removed) continue;
      o.y = S - o.D;
      if (o.y > PY + 60 || o.y < PY - RANGE - 60) continue;
      if (o.type === 'rock') rocks.push(o);
      else if (o.y > PY - RANGE - 5 && o.y < TORCH_Y && act.length < 16) act.push(o);
      if (Math.abs(o.y - PY) < o.r + PR + 8) near.push(o);
    }
    const wet = [];
    for (const l of leads) {
      if (l.group.removed) continue;
      l.y = S - l.D;
      if (Math.abs(l.y - PY) < l.h / 2 + PR + 3) wet.push(l);
    }
    for (let i = 0; i < NC; i++) {
      const x = cols[i];
      let b = 0;
      for (const o of near) {
        const dy = o.y - PY;
        const rr = o.r + PR + 6;
        if (dy * dy + (o.x - x) ** 2 < rr * rr) b = 1;
      }
      for (const l of wet) if (!l.bridges.some(([x0, x1]) => x > x0 + PR + 4 && x < x1 - PR - 4)) b = 1;
      blocked[i] = b;
      for (let j = 0; j < act.length; j++) {
        const a = act[j];
        lit[j * NC + i] = inBeam(x, a.x, a.y, 12) && !shaded(x, a.x, a.y, rocks, 5) ? 1 : 0;
      }
    }
    nreach.fill(0);
    let any = false;
    for (let i = 0; i < NC; i++) {
      if (blocked[i]) continue;
      let best = Infinity;
      let bd = 9;
      for (const d of [0, -1, 1]) {
        const p = i + d;
        if (p < 0 || p >= NC || !reach[p]) continue;
        let cost = 0;
        for (let j = 0; j < act.length; j++) {
          const m = cur[p * NA + act[j].ai];
          cost = Math.max(cost, lit[j * NC + i] ? m + DT / WAKE : m - DT * CALM);
        }
        if (cost < best) {
          best = cost;
          bd = d;
        }
      }
      if (bd === 9 || best >= LIMIT) continue;
      const p = i + bd;
      nxt.set(cur.subarray(p * NA, p * NA + NA), i * NA);
      for (let j = 0; j < act.length; j++) {
        const q = i * NA + act[j].ai;
        nxt[q] = lit[j * NC + i] ? nxt[q] + DT / WAKE : Math.max(0, nxt[q] - DT * CALM);
      }
      nreach[i] = 1;
      from[k * NC + i] = bd;
      any = true;
    }
    if (!any) {
      // stuck: take out the newest group that's in the way and go back to before it appeared
      let worst = null;
      for (const o of [...rocks, ...act, ...near, ...wet]) if (!worst || o.group.t > worst.t) worst = o.group;
      if (!worst || worst.t <= 0) worst = worst || world.groups[0];
      worst.removed = true;
      const c = Math.min(Math.floor(k / 30), Math.floor(worst.t / DT / 30));
      checkpoints.length = c + 1;
      cur = checkpoints[c].cur.slice();
      reach = checkpoints[c].reach.slice();
      k = c * 30;
      checkpoints.length = c; // re-saved on the way through
      continue;
    }
    [cur, nxt] = [nxt, cur];
    [reach, nreach] = [nreach, reach];
    k++;
  }
  // the route, for testing
  const route = new Float32Array(STEPS);
  let i = reach.indexOf(1);
  for (let s = STEPS - 1; s >= 0 && i >= 0; s--) {
    route[s] = cols[i];
    i += from[s * NC + i];
  }
  world.solids = solids.filter((o) => !o.group.removed);
  world.leads = leads.filter((l) => !l.group.removed);
  world.route = route;
  world.routeDt = DT;
  return world;
}

// ---------- the game ----------

export default {
  id: 'polar',
  title: 'Polar Night',
  emoji: '🔦',
  tagline: 'Keep every sleeping animal in the shadows. Bump into nothing.',
  colors: { bg: '#0c1730', fg: '#eaf4ff', accent: '#ff8a2a' },

  // Icy minimal techno in G♯ minor (G♯m – E – B – F♯), 128 BPM: four-on-the-floor kick, a rolling
  // offbeat sawtooth bass whose filter opens across the whole minute, and a tiptoeing pizzicato
  // motif from the first bar; then claps and a cold pad; then ice-crystal bells with echoes, a
  // shaker and a haunting square lead; and a finale with offbeat open hats, chord stabs and the
  // lead doubled an octave down. 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("gs2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ white]*4").decay(0.16).sustain(0).hpf(6500).gain(0.03)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.14).room(0.35)
      const bass = note("<[~ gs2 gs2 gs3 ~ gs2 gs2 ds3 ~ gs2 gs2 gs3 ~ gs2 b2 ds3] [~ e2 e2 e3 ~ e2 e2 b2 ~ e2 e2 e3 ~ e2 gs2 b2] [~ b2 b2 b3 ~ b2 b2 fs3 ~ b2 b2 b3 ~ b2 ds3 fs3] [~ fs2 fs2 fs3 ~ fs2 fs2 cs3 ~ fs2 fs2 fs3 ~ fs2 as2 cs3]>")
        .s("sawtooth").decay(0.1).sustain(0.15).release(0.04).lpf(saw.range(400, 1400).slow(32)).lpq(5).gain(0.34)
      const pizz = note("<[gs4 ~ ds5 ~ b4 ~ ds5 gs4] [e4 ~ b4 ~ gs4 ~ b4 e4] [ds4 ~ fs4 b4 ~ ds5 ~ b4] [cs4 ~ fs4 as4 ~ cs5 as4 fs4]>")
        .s("triangle").decay(0.09).sustain(0).lpf(3000).gain(0.12).pan(0.4)
      const pad = note("<[gs3,b3,ds4] [e3,gs3,b3] [ds3,fs3,b3] [cs3,fs3,as3]>").s("sawtooth")
        .attack(0.4).decay(0.8).sustain(0.6).release(0.6).lpf(saw.range(600, 1400).slow(32)).gain(0.06).room(0.5)
      const stab = note("<[gs4,b4,ds5] [gs4,b4,e5] [fs4,b4,ds5] [fs4,as4,cs5]>").struct("[~ x]*4").s("sawtooth")
        .decay(0.12).sustain(0).lpf(1800).gain(0.05).pan(0.6)
      const ice = note("<[gs5 b5 ds6 b5]*4 [gs5 b5 e6 b5]*4 [fs5 b5 ds6 b5]*4 [fs5 as5 cs6 as5]*4>").s("triangle")
        .decay(0.08).sustain(0).lpf(5000).gain(0.045).delay(0.3).delaytime(0.35).delayfeedback(0.35)
        .pan(sine.range(0.25, 0.75).slow(4))
      const tune = "<[ds5 ~ ~ cs5 b4 ~ gs4 ~] [b4 ~ ~ cs5 ds5 ~ e5 ~] [fs5 ~ ~ e5 ds5 ~ b4 ~] [cs5 ~ as4 ~ fs4 ~ ~ ~]>"
      const lead = note(tune).s("square").decay(0.3).sustain(0.3).release(0.15).lpf(2200).vib(5).vibmod(0.1)
        .gain(0.075).room(0.4).delay(0.25).delaytime(0.35).delayfeedback(0.3).pan(0.6)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.25).sustain(0.3).release(0.1)
        .lpf(1300).gain(0.05).pan(0.4)
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, pizz)],
      [8, stack(kick, hats, clap, bass, pizz, pad)],
      [8, stack(kick, hats, clap, shaker, bass, pizz, pad, ice, lead)],
      [8, stack(kick, hats, open, clap, shaker, bass, pizz, pad, stab, ice, lead, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const world = solve(build(rng.fork('plan'), W));
    const { solids, leads } = world;
    const animals = solids.filter((o) => o.type === 'animal');
    for (const a of animals) a.meter = 0;

    const ice = paintIce(W, H, art);
    const blocks = [0, 1, 2, 3].map(() => paintBlock(art));
    const sleeperArt = { bear: paintBear(), walrus: paintWalrus(), fox: paintFox() };
    const explorer = [paintExplorer(0), paintExplorer(1)];
    const auroraG = paintAurora(520, 420, 'rgba(90,255,180,A)');
    const auroraV = paintAurora(520, 420, 'rgba(180,110,255,A)');
    const torchGlow = glowSprite('rgba(255,214,150,0.95)', 40);
    const redGlow = glowSprite('rgba(255,70,50,1)', 40);
    const flagGlow = glowSprite('rgba(255,150,90,0.9)', 20);
    const vignette = vignetteSprite(W, H, 0.6, '2,6,20');

    // the night, rebuilt every frame: a darkness layer with the beam cut out of it
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    const darkC = mk();
    const lightC = mk();
    const dg = darkC.getContext('2d');
    const lg = lightC.getContext('2d');

    // lead edges and floes (cosmetic)
    for (const l of leads) {
      l.top = [];
      l.bot = [];
      for (let x = -12; x <= W + 12; x += 10) {
        l.top.push(art.range(-3, 3));
        l.bot.push(art.range(-3, 3));
      }
      l.floes = [];
      for (let k = 0; k < 5; k++) {
        const fx = art.range(10, W - 10);
        if (l.bridges.some(([a, b]) => fx > a - 10 && fx < b + 10)) continue;
        l.floes.push({ x: fx, dy: art.range(-l.h * 0.25, l.h * 0.25), s: art.range(3, 6), a: art.range(0, 3) });
      }
    }

    const fx = createParticles();
    const breath = createParticles();
    const flakes = [];
    for (let i = 0; i < 70; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, vy: 20 + Math.random() * 30, ph: Math.random() * 6, s: 1 + Math.random() * 1.8 });
    const steps = [];
    const player = createMover({ x: 180, minX: MINX, maxX: MAXX, speed: SPEED, accel: 16 });

    let S = 0;
    let lastStep = 0;
    let stepSide = 1;
    let clock = 0;
    let lo = 0;
    let passed = 0;
    let deadT = 0;
    let deathKind = '';
    let killer = null;
    let breathT = 0.6;
    let shake = 0;

    const die = (game, reason, kind, by) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      killer = by;
      if (kind === 'water') {
        fx.burst(player.x, PY, { count: 40, speed: 200, life: 0.9, size: 4, round: true, gravity: 260, drag: 1, colors: SPLASH });
      } else if (kind === 'bump') {
        fx.burst(player.x, PY - 12, { count: 26, speed: 180, life: 0.7, size: 3.5, gravity: 200, drag: 1.5, colors: ICE });
      } else {
        fx.burst(by.x, by.y, { count: 30, speed: 170, life: 0.9, size: 3.5, round: true, drag: 2, colors: SNOW });
        shake = 1;
      }
    };

    const updateCosmetic = (dt, v) => {
      clock += dt;
      for (const f of flakes) {
        f.y += (f.vy + v) * dt;
        f.x += Math.sin(clock * 0.8 + f.ph) * 12 * dt;
        if (f.y > H + 4) {
          f.y = -4;
          f.x = Math.random() * W;
        }
      }
      fx.update(dt);
      breath.update(dt, v * 0.6);
      shake = Math.max(0, shake - dt * 2.5);
    };

    const game = {
      dead: false,
      deathReason: '',
      _route: world.route, // the planner's way through (for testing)
      _routeDt: world.routeDt,

      update(dt, dir, t) {
        const tt = t + dt;
        const v = speedAt(tt);
        S = scrollAt(tt);
        updateCosmetic(dt, v);
        player.update(dt, dir);

        // footprints and frosty breath
        if (S - lastStep > 15) {
          lastStep = S;
          stepSide = -stepSide;
          steps.push({ x: player.x + stepSide * 5, D: S - (PY + 12) });
          if (steps.length > 60) steps.shift();
        }
        breathT -= dt;
        if (breathT <= 0) {
          breathT = 0.9 + Math.random() * 0.5;
          breath.burst(player.x, PY - 16, { count: 6, speed: 26, angle: -Math.PI / 2, spread: 1, life: 1.1, size: 6, round: true, drag: 1.5, colors: ['rgba(235,245,255,0.35)'] });
        }

        while (lo < solids.length && S - solids[lo].D > H + 80) lo++;
        const rocks = [];
        for (let i = lo; i < solids.length; i++) {
          const o = solids[i];
          o.y = S - o.D;
          if (o.y < -RANGE) break;
          if (o.type === 'rock') rocks.push(o);
        }
        for (const l of leads) l.y = S - l.D;

        // bumping into things
        for (let i = lo; i < solids.length; i++) {
          const o = solids[i];
          if (o.y < PY - 60) break;
          const dx = o.x - player.x;
          const dy = o.y - PY;
          const rr = o.r + PR - 2;
          if (dx * dx + dy * dy < rr * rr) {
            if (o.type === 'rock') return die(this, 'Walked into an ice block.', 'bump', o);
            return die(this, `Tripped over a sleeping ${KINDS[o.kind].name}.`, 'trip', o);
          }
        }
        for (const l of leads) {
          if (Math.abs(l.y - PY) > l.h / 2 + PR - 4) continue;
          if (!l.bridges.some(([x0, x1]) => player.x - PR + 3 > x0 && player.x + PR - 3 < x1)) {
            return die(this, 'Fell through a lead into the icy sea.', 'water', l);
          }
        }

        // the torch
        for (let i = lo; i < solids.length; i++) {
          const a = solids[i];
          if (a.y < PY - RANGE - 10) break;
          if (a.type !== 'animal') continue;
          if (a.y > PY + 30 && !a.passed) {
            a.passed = true;
            passed++;
          }
          if (inBeam(player.x, a.x, a.y) && !shaded(player.x, a.x, a.y, rocks)) a.meter += dt / WAKE;
          else a.meter = Math.max(0, a.meter - dt * CALM);
          if (a.meter >= 1) {
            a.meter = 1;
            return die(this, `${a.kind === 'fox' ? 'An' : 'A'} ${KINDS[a.kind].name} woke up in your torchlight.`, 'wake', a);
          }
        }
      },

      afterlife(dt) {
        deadT += dt;
        updateCosmetic(dt, 0);
        if (killer && deathKind === 'wake' && Math.random() < dt * 10) {
          fx.burst(killer.x, killer.y, { count: 2, speed: 60, life: 0.6, size: 3, round: true, drag: 2, colors: SNOW });
        }
      },

      render(g) {
        const sx = shake ? Math.sin(clock * 70) * 4 * shake : 0;
        g.save();
        g.translate(sx, 0);

        // the ice
        const off = S % H;
        g.drawImage(ice.canvas, 0, off - H, W, H);
        g.drawImage(ice.canvas, 0, off, W, H);
        g.fillStyle = 'rgba(70,100,150,0.25)';
        for (const s of steps) {
          const y = S - s.D;
          if (y > H + 6) continue;
          g.beginPath();
          g.ellipse(s.x, y, 2.6, 4, 0, 0, Math.PI * 2);
          g.fill();
        }

        // leads of open water
        for (const l of leads) {
          if (l.y < -40 || l.y > H + 40) continue;
          const edges = [-12, ...l.bridges.flat(), W + 12];
          for (let s = 0; s < edges.length; s += 2) {
            const x0 = edges[s];
            const x1 = edges[s + 1];
            const j0 = Math.floor((x0 + 12) / 10);
            const j1 = Math.ceil((x1 + 12) / 10);
            const path = () => {
              g.beginPath();
              g.moveTo(x0, l.y - l.h / 2);
              for (let j = j0 + 1; j < j1; j++) g.lineTo(j * 10 - 12, l.y - l.h / 2 + l.top[j]);
              g.lineTo(x1, l.y - l.h / 2);
              g.quadraticCurveTo(x1 + 6, l.y, x1, l.y + l.h / 2);
              for (let j = j1 - 1; j > j0; j--) g.lineTo(j * 10 - 12, l.y + l.h / 2 + l.bot[j]);
              g.lineTo(x0, l.y + l.h / 2);
              g.quadraticCurveTo(x0 - 6, l.y, x0, l.y - l.h / 2);
              g.closePath();
            };
            path();
            g.fillStyle = '#0b2b44';
            g.fill();
            g.strokeStyle = 'rgba(255,255,255,0.9)';
            g.lineWidth = 2.5;
            g.stroke();
            g.strokeStyle = 'rgba(90,150,200,0.7)';
            g.lineWidth = 1;
            g.stroke();
          }
          // ripples and little floes
          g.strokeStyle = 'rgba(120,190,235,0.35)';
          g.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            for (let x = -10; x <= W + 10; x += 8) {
              if (l.bridges.some(([a, b]) => x > a - 6 && x < b + 6)) {
                g.moveTo(x + 8, l.y);
                continue;
              }
              g.lineTo(x, l.y - l.h / 4 + (k * l.h) / 4 + Math.sin(x * 0.12 + clock * 2 + k) * 1.5);
            }
            g.stroke();
          }
          g.fillStyle = 'rgba(240,250,255,0.9)';
          for (const f of l.floes) {
            g.beginPath();
            g.ellipse(f.x + Math.sin(clock + f.a) * 2, l.y + f.dy, f.s, f.s * 0.6, f.a, 0, Math.PI * 2);
            g.fill();
          }
        }

        // blocks and sleepers
        for (let i = lo; i < solids.length; i++) {
          const o = solids[i];
          if (o.y < -60) break;
          if (o.y > H + 60) continue;
          if (o.type === 'rock') {
            drawSprite(g, blocks[o.art], o.x, o.y, { size: o.r * 2 * (68 / 52), rot: o.flip ? Math.PI : 0 });
          } else {
            const K = KINDS[o.kind];
            const breathe = 1 + 0.035 * Math.sin(clock * 2.2 + o.ph);
            const jit = o.meter > 0 ? (Math.random() - 0.5) * 3 * o.meter : 0;
            g.save();
            g.translate(o.x + jit, o.y);
            if (o.flip) g.scale(-1, 1);
            g.scale(breathe, 1 / breathe);
            drawSprite(g, sleeperArt[o.kind], 0, 0, { size: K.size });
            g.restore();
          }
        }

        // snow falling through the night
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (const f of flakes) g.fillRect(f.x, f.y, f.s, f.s);

        // the night, with the beam cut out of it and the blocks' shadows put back
        const tx = player.x;
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.clearRect(0, 0, W, H);
        lg.globalCompositeOperation = 'source-over';
        const beam = lg.createRadialGradient(tx, TORCH_Y, 6, tx, TORCH_Y, RANGE * 1.06);
        beam.addColorStop(0, 'rgba(255,236,200,1)');
        beam.addColorStop(0.75, 'rgba(255,226,180,0.9)');
        beam.addColorStop(0.94, 'rgba(255,220,170,0.45)');
        beam.addColorStop(1, 'rgba(255,220,170,0)');
        lg.fillStyle = beam;
        lg.beginPath();
        lg.moveTo(tx, TORCH_Y);
        lg.arc(tx, TORCH_Y, RANGE * 1.06, -Math.PI / 2 - HALF, -Math.PI / 2 + HALF);
        lg.closePath();
        lg.fill();
        // a little spill around the explorer's feet
        const spill = lg.createRadialGradient(tx, PY, 2, tx, PY, 46);
        spill.addColorStop(0, 'rgba(255,230,190,0.55)');
        spill.addColorStop(1, 'rgba(255,230,190,0)');
        lg.fillStyle = spill;
        lg.fillRect(tx - 46, PY - 46, 92, 92);
        lg.globalCompositeOperation = 'destination-out';
        lg.fillStyle = '#000';
        for (let i = lo; i < solids.length; i++) {
          const o = solids[i];
          if (o.y < TORCH_Y - RANGE - o.r - 20) break;
          if (o.type !== 'rock' || o.y > TORCH_Y + o.r) continue;
          const dx = o.x - tx;
          const dy = o.y - TORCH_Y;
          const d = Math.hypot(dx, dy);
          if (d <= o.r + 1) continue;
          const base = Math.atan2(dy, dx);
          const half = Math.asin(o.r / d);
          const tl = Math.sqrt(d * d - o.r * o.r);
          const far = RANGE * 1.6;
          lg.beginPath();
          lg.moveTo(tx + Math.cos(base - half) * tl, TORCH_Y + Math.sin(base - half) * tl);
          lg.lineTo(tx + Math.cos(base - half) * far, TORCH_Y + Math.sin(base - half) * far);
          lg.lineTo(tx + Math.cos(base + half) * far, TORCH_Y + Math.sin(base + half) * far);
          lg.lineTo(tx + Math.cos(base + half) * tl, TORCH_Y + Math.sin(base + half) * tl);
          lg.closePath();
          lg.fill();
        }
        lg.globalCompositeOperation = 'source-over';

        dg.setTransform(1, 0, 0, 1, 0, 0);
        dg.globalCompositeOperation = 'source-over';
        dg.clearRect(0, 0, W, H);
        dg.fillStyle = 'rgba(5,11,32,0.8)';
        dg.fillRect(0, 0, W, H);
        dg.globalCompositeOperation = 'destination-out';
        dg.drawImage(lightC, 0, 0);
        dg.globalCompositeOperation = 'source-over';
        g.drawImage(darkC, 0, 0, W, H);
        g.globalCompositeOperation = 'multiply';
        g.globalAlpha = 0.3;
        g.drawImage(lightC, 0, 0, W, H);
        g.globalAlpha = 1;

        // aurora light shimmering on the ice
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, auroraG, W / 2 + Math.sin(clock * 0.13) * 50, 190 + Math.sin(clock * 0.21) * 30, { alpha: 0.09 + 0.03 * Math.sin(clock * 0.7) });
        drawSprite(g, auroraV, W / 2 - 30 + Math.sin(clock * 0.1 + 2) * 60, 300 + Math.cos(clock * 0.17) * 40, { alpha: 0.06 + 0.025 * Math.sin(clock * 0.9 + 1) });
        // reflector flags at the ice bridges
        for (const l of leads) {
          if (l.y < -30 || l.y > H + 30) continue;
          for (const [a, b] of l.bridges) {
            for (const x of [a, b]) drawSprite(g, flagGlow, x, l.y - l.h / 2 - 4, { size: 22, alpha: 0.55 + 0.2 * Math.sin(clock * 4 + x) });
          }
        }
        g.globalCompositeOperation = 'source-over';
        for (const l of leads) {
          if (l.y < -30 || l.y > H + 30) continue;
          for (const [a, b] of l.bridges) {
            for (const x of [a, b]) {
              g.strokeStyle = '#2b2a33';
              g.lineWidth = 1.5;
              g.beginPath();
              g.moveTo(x, l.y - l.h / 2 + 2);
              g.lineTo(x, l.y - l.h / 2 - 12);
              g.stroke();
              g.fillStyle = '#ff6a2a';
              g.beginPath();
              g.moveTo(x, l.y - l.h / 2 - 12);
              g.lineTo(x + (x === a ? -7 : 7), l.y - l.h / 2 - 9);
              g.lineTo(x, l.y - l.h / 2 - 6);
              g.closePath();
              g.fill();
            }
          }
        }

        // sleepers: snoring, or stirring in the light
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = lo; i < solids.length; i++) {
          const a = solids[i];
          if (a.y < -30) break;
          if (a.type !== 'animal' || a.y > H + 30) continue;
          if (a.meter > 0.02) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, a.x, a.y, { size: a.r * 4 + 20 * a.meter, alpha: 0.25 + 0.5 * a.meter });
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = `rgba(255,90,60,${0.5 + 0.5 * a.meter})`;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(a.x, a.y, a.r + 9, -Math.PI / 2, -Math.PI / 2 + a.meter * Math.PI * 2);
            g.stroke();
            g.font = '900 18px system-ui, sans-serif';
            g.fillStyle = `rgba(255,${200 - 140 * a.meter},${120 - 80 * a.meter},${0.6 + 0.4 * a.meter})`;
            g.fillText(a.meter > 0.5 ? '!' : '?', a.x + a.r * 0.6, a.y - a.r - 14);
            if (this.dead && a === killer) {
              // eyes wide open
              const ex = a.x + (a.flip ? 1 : -1) * (a.kind === 'fox' ? 6 : 15);
              g.fillStyle = '#ffe36a';
              for (const s of [-1, 1]) {
                g.beginPath();
                g.arc(ex + s * 2.5, a.y - 6, 1.8, 0, Math.PI * 2);
                g.fill();
              }
            }
          } else {
            g.font = '700 10px system-ui, sans-serif';
            for (let k = 0; k < 2; k++) {
              const u = (clock * 0.5 + k * 0.5 + a.ph) % 1;
              g.fillStyle = `rgba(200,225,255,${0.7 * Math.sin(u * Math.PI)})`;
              g.fillText('z', a.x + a.r * 0.4 + u * 10, a.y - a.r - 2 - u * 14);
            }
          }
        }

        // the explorer
        const step = Math.floor(S / 15) % 2;
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, torchGlow, player.x, TORCH_Y - 4, { size: 54, alpha: 0.85 + 0.1 * Math.sin(clock * 9) });
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(player.x, PY);
        if (this.dead && deathKind === 'water') {
          const k = Math.min(1, deadT * 2);
          g.scale(1 - 0.4 * k, 1 - 0.4 * k);
          g.globalAlpha = 1 - 0.8 * k;
        } else if (this.dead) {
          g.rotate(Math.sin(deadT * 30) * 0.12 * Math.max(0, 1 - deadT * 2));
        } else {
          g.rotate(player.lean * 0.12);
        }
        drawSprite(g, explorer[step], 0, 4);
        g.restore();
        g.globalAlpha = 1;
        breath.render(g);
        fx.render(g);
        g.restore();

        drawSprite(g, vignette, W / 2, H / 2);
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = '700 13px system-ui, sans-serif';
        g.fillStyle = 'rgba(234,244,255,0.9)';
        g.fillText(`💤 ${passed} tiptoed past`, 12, H - 12);
      },
    };
    return game;
  },
};
