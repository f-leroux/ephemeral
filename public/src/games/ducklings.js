// Duck Crossing — a mother duck leads her ducklings across a busy city on a sunny morning. The
// ducklings follow her exact path, one behind the other, so wherever she crosses a street the whole
// line crosses there too, a little later. The trick is picking a crossing point where the traffic
// leaves room for everyone, not just for her. More ducklings join over the minute and the line gets
// longer, the streets get wider, and buses, bikes and trams join the cars.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  circleRect,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const MY = 466; // mother duck's screen y
const SP = 15; // spacing between ducks along the path
const R_MOM = 8; // collision radii
const R_DUCK = 5.5;
const R_PLAN = 9.5; // the planner keeps a little more room than the collisions need
const START_DUCKS = 3;
const JOINS = [7, 15, 24, 33, 43]; // a new duckling joins the end of the line
const MAX_DUCKS = START_DUCKS + JOINS.length;
const MSPEED = 230;
const CURB = 6;
const TABLE_DT = 0.01;
const TABLE_T = 72;

const speedAt = (t) => lerp(100, 165, progress(t, 60, 1.15));
const mod = (a, n) => ((a % n) + n) % n;

const LANE = {
  car: { h: 36, hw: 11.5 },
  bus: { h: 40, hw: 14 },
  bike: { h: 26, hw: 6.5 },
  tram: { h: 46, hw: 15.5 },
};

// ---------- art ----------

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// draws fn at y and at y ± H so decorations tile seamlessly
const wrapY = (H, y, r, fn) => {
  fn(y);
  if (y - r < 0) fn(y + H);
  if (y + r > H) fn(y - H);
};

function paintSidewalk(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    g.fillStyle = '#d6cbb7';
    g.fillRect(0, 0, W, H);
    // paving slabs, offset every other row
    const S = 40;
    for (let row = 0; row < H / S; row++) {
      const off = row % 2 ? S / 2 : 0;
      for (let x = -S + off; x < W + S; x += S) {
        const tone = rng.pick(['#dcd2bf', '#d2c6b0', '#e0d7c6', '#cdc1aa', '#d8ccb5']);
        const grad = g.createLinearGradient(x, row * S, x + S, row * S + S);
        grad.addColorStop(0, tone);
        grad.addColorStop(1, rng.chance(0.5) ? '#c9bda6' : '#d3c8b3');
        g.fillStyle = grad;
        g.fillRect(x + 1, row * S + 1, S - 2, S - 2);
        g.fillStyle = 'rgba(255,250,235,0.35)';
        g.fillRect(x + 1, row * S + 1, S - 2, 1.2);
        g.fillStyle = 'rgba(90,75,55,0.16)';
        g.fillRect(x + 1, row * S + S - 2.2, S - 2, 1.2);
      }
    }
    // grit and stains
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(80,65,45,0.12)' : 'rgba(255,255,245,0.18)';
      g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(0.6, 1.6), rng.range(0.6, 1.6));
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.range(30, W - 30);
      const y = rng.range(0, H);
      const r = rng.range(5, 14);
      wrapY(H, y, r, (yy) => {
        const c = g.createRadialGradient(x, yy, 0, x, yy, r);
        c.addColorStop(0, 'rgba(110,95,70,0.18)');
        c.addColorStop(1, 'rgba(110,95,70,0)');
        g.fillStyle = c;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
    // fallen leaves
    for (let i = 0; i < 26; i++) {
      const x = rng.range(10, W - 10);
      const y = rng.range(0, H);
      const a = rng.range(0, 6.28);
      const col = rng.pick(['#9bb84a', '#c9b448', '#7fa040', '#d39a3c']);
      wrapY(H, y, 5, (yy) => {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x, yy, 4, 2, a, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(70,60,30,0.4)';
        g.lineWidth = 0.5;
        g.beginPath();
        g.moveTo(x - Math.cos(a) * 4, yy - Math.sin(a) * 4);
        g.lineTo(x + Math.cos(a) * 4, yy + Math.sin(a) * 4);
        g.stroke();
      });
    }
    // planted verges along both edges
    for (const side of [0, 1]) {
      const x0 = side ? W - 18 : 0;
      g.fillStyle = '#5a4630';
      g.fillRect(x0, 0, 18, H);
      g.fillStyle = '#b8ad98';
      g.fillRect(side ? W - 20 : 16, 0, 4, H);
      g.fillStyle = 'rgba(255,255,240,0.3)';
      g.fillRect(side ? W - 20 : 16, 0, 1.2, H);
      for (let i = 0; i < 70; i++) {
        const bx = side ? rng.range(W - 17, W + 4) : rng.range(-4, 17);
        const by = rng.range(0, H);
        const r = rng.range(4, 9);
        const col = rng.pick(['#6f9a3c', '#5a8632', '#86ad48', '#4b7a2c']);
        wrapY(H, by, r, (yy) => {
          const c = g.createRadialGradient(bx - r * 0.3, yy - r * 0.3, 1, bx, yy, r);
          c.addColorStop(0, col);
          c.addColorStop(1, 'rgba(40,70,25,0)');
          g.fillStyle = c;
          g.beginPath();
          g.arc(bx, yy, r, 0, Math.PI * 2);
          g.fill();
        });
        if (rng.chance(0.12)) {
          const fc = rng.pick(['#ffd34d', '#f37aa0', '#ffffff', '#b78cf0']);
          wrapY(H, by, 3, (yy) => {
            g.fillStyle = fc;
            g.beginPath();
            g.arc(bx, yy, 1.8, 0, Math.PI * 2);
            g.fill();
          });
        }
      }
    }
  }, 1);
}

function paintAsphalt(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#454950');
    base.addColorStop(0.5, '#51555d');
    base.addColorStop(1, '#454950');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 20; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(30, 90);
      const tone = rng.pick(['rgba(30,32,38,0.22)', 'rgba(120,122,128,0.1)']);
      wrapY(H, y, r, (yy) => {
        const c = g.createRadialGradient(x, yy, 0, x, yy, r);
        c.addColorStop(0, tone);
        c.addColorStop(1, tone.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = c;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
    // patched repairs
    for (let i = 0; i < 6; i++) {
      const x = rng.range(0, W - 60);
      const y = rng.range(0, H);
      const w = rng.range(30, 80);
      const h = rng.range(14, 40);
      wrapY(H, y, h, (yy) => {
        g.fillStyle = 'rgba(38,40,46,0.55)';
        g.fillRect(x, yy, w, h);
        g.strokeStyle = 'rgba(20,20,25,0.4)';
        g.lineWidth = 1;
        g.strokeRect(x, yy, w, h);
      });
    }
    // grain
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = rng.chance(0.55) ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.14)';
      g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(0.6, 1.4), rng.range(0.6, 1.4));
    }
    // oil stains
    for (let i = 0; i < 12; i++) {
      const x = rng.range(20, W - 20);
      const y = rng.range(0, H);
      const r = rng.range(5, 13);
      wrapY(H, y, r, (yy) => {
        const c = g.createRadialGradient(x, yy, 0, x, yy, r);
        c.addColorStop(0, 'rgba(15,15,22,0.4)');
        c.addColorStop(1, 'rgba(15,15,22,0)');
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, yy, r * 1.4, r, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
    // cracks
    g.lineWidth = 0.8;
    for (let i = 0; i < 9; i++) {
      let x = rng.range(0, W);
      let y = rng.range(20, H - 40);
      g.strokeStyle = 'rgba(15,15,20,0.5)';
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += rng.range(-9, 9);
        y += rng.range(2, 7);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // manhole covers
    for (let i = 0; i < 3; i++) {
      const x = rng.range(50, W - 50);
      const y = rng.range(0, H);
      wrapY(H, y, 12, (yy) => {
        const c = g.createRadialGradient(x - 3, yy - 3, 1, x, yy, 11);
        c.addColorStop(0, '#6b6e74');
        c.addColorStop(1, '#3a3d42');
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, yy, 11, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(20,20,25,0.7)';
        g.lineWidth = 1.2;
        g.stroke();
        g.lineWidth = 0.7;
        for (let k = -6; k <= 6; k += 3) {
          g.beginPath();
          g.moveTo(x - 8, yy + k);
          g.lineTo(x + 8, yy + k);
          g.stroke();
        }
      });
    }
  }, 1);
}

function paintTrees(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const trees = [];
    for (const side of [0, 1]) {
      for (let y = rng.range(0, 60); y < H; y += rng.range(95, 140)) {
        trees.push({ x: side ? W + rng.range(-8, 10) : rng.range(-10, 8), y, r: rng.range(30, 42) });
      }
    }
    // dappled shade first, cast down and to the right by the morning sun
    for (const t of trees) {
      wrapY(H, t.y + 18, t.r + 20, (yy) => {
        g.fillStyle = 'rgba(25,35,30,0.22)';
        g.beginPath();
        g.arc(t.x + 14, yy, t.r * 1.05, 0, Math.PI * 2);
        g.fill();
      });
    }
    for (const t of trees) {
      wrapY(H, t.y, t.r + 10, (yy) => {
        for (let k = 0; k < 9; k++) {
          const a = rng.range(0, 6.28);
          const d = rng.range(0, t.r * 0.55);
          const cx = t.x + Math.cos(a) * d;
          const cy = yy + Math.sin(a) * d;
          const r = t.r * rng.range(0.45, 0.65);
          const c = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 1, cx, cy, r);
          c.addColorStop(0, rng.pick(['#9ccc5c', '#8cc053', '#a6d168']));
          c.addColorStop(0.6, '#4f8b36');
          c.addColorStop(1, '#2c5a26');
          g.fillStyle = c;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
        }
        // leaf texture
        for (let k = 0; k < 40; k++) {
          const a = rng.range(0, 6.28);
          const d = rng.range(0, t.r);
          g.fillStyle = rng.chance(0.5) ? 'rgba(210,240,150,0.35)' : 'rgba(20,50,20,0.3)';
          g.beginPath();
          g.ellipse(t.x + Math.cos(a) * d, yy + Math.sin(a) * d, 2.4, 1.3, a, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
  }, 2);
}

// A vehicle from above, facing right (+x).
function paintVehicle(kind, rng) {
  if (kind === 'bike') {
    const jersey = rng.pick(['#e8452c', '#2f7fe0', '#22b07a', '#f2a20c', '#9b4fd8']);
    const sprite = makeSprite(34, 22, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(3, 4, 14, 5, 0, 0, Math.PI * 2);
      g.fill();
      // wheels and frame
      g.fillStyle = '#1d1f24';
      for (const x of [-10, 10]) {
        g.beginPath();
        g.ellipse(x, 0, 5.5, 1.4, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#c9ccd2';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-10, 0);
      g.lineTo(10, 0);
      g.stroke();
      g.strokeStyle = '#2a2c30';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(8, -5);
      g.lineTo(8, 5);
      g.stroke();
      // rider: shoulders, arms, helmet
      const b = g.createLinearGradient(0, -6, 0, 6);
      b.addColorStop(0, jersey);
      b.addColorStop(0.5, '#ffffff');
      b.addColorStop(0.55, jersey);
      b.addColorStop(1, jersey);
      g.fillStyle = b;
      g.beginPath();
      g.ellipse(-2, 0, 5, 6.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#e2b48a';
      g.lineWidth = 1.8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, s * 5);
        g.lineTo(8, s * 4.5);
        g.stroke();
      }
      const h = g.createRadialGradient(2, -1.5, 0.5, 3, 0, 4);
      h.addColorStop(0, '#ffffff');
      h.addColorStop(1, jersey);
      g.fillStyle = h;
      g.beginPath();
      g.ellipse(3.5, 0, 4, 3.4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.6;
      g.stroke();
    });
    return { sprite, len: 26, name: 'cyclist' };
  }
  if (kind === 'bus' || kind === 'tram') {
    const tram = kind === 'tram';
    const len = tram ? 170 : 104;
    const wid = tram ? 30 : 27;
    const sprite = makeSprite(len + 10, wid + 12, (g) => {
      g.fillStyle = 'rgba(0,0,0,0.3)';
      rr(g, -len / 2 + 4, -wid / 2 + 5, len, wid, 6);
      g.fill();
      const sections = tram ? [[-len / 2, len / 2 - 4], [4, len / 2]] : [[-len / 2, len / 2]];
      const [c0, c1, c2] = tram ? ['#14706e', '#2ab3ac', '#0e5452'] : ['#a8221d', '#e0463c', '#861814'];
      for (const [a, b] of sections) {
        const body = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
        body.addColorStop(0, c2);
        body.addColorStop(0.2, c1);
        body.addColorStop(0.8, c0);
        body.addColorStop(1, c2);
        g.fillStyle = body;
        rr(g, a, -wid / 2, b - a, wid, tram ? 8 : 5);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1;
        g.stroke();
        // roof
        g.fillStyle = tram ? '#e9e4d6' : '#f1ece2';
        rr(g, a + 6, -wid / 2 + 4, b - a - 12, wid - 8, 4);
        g.fill();
        // windows down both sides
        g.fillStyle = '#2a3846';
        for (const s of [-1, 1]) g.fillRect(a + 8, s > 0 ? wid / 2 - 3.2 : -wid / 2 + 1.2, b - a - 16, 2);
        g.fillStyle = 'rgba(160,200,230,0.5)';
        for (let x = a + 10; x < b - 10; x += 12) {
          for (const s of [-1, 1]) g.fillRect(x, s > 0 ? wid / 2 - 3 : -wid / 2 + 1.4, 1.2, 1.6);
        }
        // roof units
        g.fillStyle = '#bdb6a7';
        for (let x = a + 16; x < b - 22; x += 30) {
          rr(g, x, -5, 14, 10, 2);
          g.fill();
          g.fillStyle = 'rgba(80,75,65,0.6)';
          g.fillRect(x + 2, -1, 10, 2);
          g.fillStyle = '#bdb6a7';
        }
      }
      if (tram) {
        // the gangway and the pantograph
        g.fillStyle = '#2b2d33';
        g.fillRect(-4, -wid / 2 + 3, 8, wid - 6);
        g.strokeStyle = 'rgba(200,200,200,0.4)';
        g.lineWidth = 0.6;
        for (let x = -3; x <= 3; x += 1.5) {
          g.beginPath();
          g.moveTo(x, -wid / 2 + 3);
          g.lineTo(x, wid / 2 - 3);
          g.stroke();
        }
        g.strokeStyle = '#3a3c42';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-len / 4 - 14, 0);
        g.lineTo(-len / 4, -8);
        g.lineTo(-len / 4 + 14, 0);
        g.lineTo(-len / 4, 8);
        g.closePath();
        g.stroke();
        g.fillStyle = '#ffd54a';
        g.fillRect(-len / 4 - 1, -11, 2, 22);
      }
      // windscreen and lights at the front, red lights at the back
      g.fillStyle = '#26333f';
      rr(g, len / 2 - 6, -wid / 2 + 3, 4.5, wid - 6, 2);
      g.fill();
      g.fillStyle = 'rgba(180,220,255,0.35)';
      g.fillRect(len / 2 - 5.5, -wid / 2 + 4, 1.2, wid - 8);
      g.fillStyle = '#fff6c8';
      for (const s of [-1, 1]) g.fillRect(len / 2 - 1.8, s * (wid / 2 - 4) - 1.5, 1.8, 3);
      g.fillStyle = '#ff3b30';
      for (const s of [-1, 1]) g.fillRect(-len / 2, s * (wid / 2 - 4) - 1.5, 1.8, 3);
      if (!tram) {
        // a destination sign above the windscreen
        g.fillStyle = '#1a1a1a';
        g.fillRect(len / 2 - 13, -6, 5, 12);
        g.fillStyle = '#ffb21a';
        g.fillRect(len / 2 - 12, -4.5, 3, 9);
      }
    });
    return { sprite, len, name: tram ? 'tram' : 'bus' };
  }
  // cars: a sedan, a taxi or a van
  const type = kind === 'taxi' ? 'taxi' : kind === 'van' ? 'van' : 'car';
  const len = type === 'van' ? 54 : 46;
  const wid = type === 'van' ? 24 : 22;
  const color =
    type === 'taxi' ? ['#f4c21b', '#ffe066', '#b88a0c'] : type === 'van' ? ['#e4e4df', '#ffffff', '#a9aaa4'] : rng.pick([
      ['#2f6fd6', '#6fa3ff', '#1c4596'],
      ['#2c9a62', '#64d39a', '#1b6640'],
      ['#c43a52', '#f2788d', '#86202f'],
      ['#3b3f47', '#7a808b', '#22252b'],
      ['#e07b1f', '#ffb05c', '#a5520d'],
      ['#8e98a4', '#d3dae2', '#5c6570'],
    ]);
  const sprite = makeSprite(len + 10, wid + 12, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    rr(g, -len / 2 + 3.5, -wid / 2 + 4.5, len, wid, 7);
    g.fill();
    const body = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
    body.addColorStop(0, color[2]);
    body.addColorStop(0.3, color[0]);
    body.addColorStop(0.5, color[1]);
    body.addColorStop(0.7, color[0]);
    body.addColorStop(1, color[2]);
    g.fillStyle = body;
    rr(g, -len / 2, -wid / 2, len, wid, type === 'van' ? 4 : 7);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 1;
    g.stroke();
    // mirrors
    g.fillStyle = color[2];
    const mx = type === 'van' ? len * 0.2 : len * 0.1;
    for (const s of [-1, 1]) g.fillRect(mx, s * (wid / 2 + 1.5) - 1.2, 3, 2.4);
    const glass = (x0, x1, inset0, inset1) => {
      const gl = g.createLinearGradient(x0, 0, x1, 0);
      gl.addColorStop(0, '#24313d');
      gl.addColorStop(1, '#5d7d98');
      g.fillStyle = gl;
      g.beginPath();
      g.moveTo(x0, -wid / 2 + inset0);
      g.lineTo(x1, -wid / 2 + inset1);
      g.lineTo(x1, wid / 2 - inset1);
      g.lineTo(x0, wid / 2 - inset0);
      g.closePath();
      g.fill();
    };
    if (type === 'van') {
      glass(len * 0.24, len * 0.36, 2.5, 3.5);
      g.fillStyle = '#f4f4f0';
      rr(g, -len / 2 + 2, -wid / 2 + 2.5, len * 0.72, wid - 5, 2);
      g.fill();
      g.strokeStyle = 'rgba(120,120,115,0.45)';
      g.lineWidth = 0.8;
      for (let x = -len / 2 + 8; x < len * 0.2; x += 6) {
        g.beginPath();
        g.moveTo(x, -wid / 2 + 3.5);
        g.lineTo(x, wid / 2 - 3.5);
        g.stroke();
      }
    } else {
      glass(len * 0.08, len * 0.25, 3, 4.5);
      glass(-len * 0.3, -len * 0.2, 4, 3.5);
      g.fillStyle = color[1];
      rr(g, -len * 0.2, -wid / 2 + 3.6, len * 0.28, wid - 7.2, 3);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(-len * 0.18, -wid / 2 + 4.6, len * 0.24, 1.4);
      // a crease down the bonnet
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.moveTo(len * 0.27, -3);
      g.lineTo(len / 2 - 3, -2);
      g.moveTo(len * 0.27, 3);
      g.lineTo(len / 2 - 3, 2);
      g.stroke();
    }
    if (type === 'taxi') {
      g.fillStyle = '#ffffff';
      rr(g, -len * 0.1, -4, 7, 8, 1.5);
      g.fill();
      g.fillStyle = '#e8452c';
      g.fillRect(-len * 0.1 + 1, -1, 5, 2);
      g.fillStyle = '#1b1b1b';
      for (let x = -len / 2 + 3; x < len / 2 - 4; x += 4) {
        for (const s of [-1, 1]) g.fillRect(x, s * (wid / 2 - 1.2) - 0.6, 2, 1.2);
      }
    }
    g.fillStyle = '#fff6c8';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(len / 2 - 1.5, s * (wid / 2 - 4), 1.6, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e0221c';
    for (const s of [-1, 1]) g.fillRect(-len / 2, s * (wid / 2 - 4) - 1.8, 1.8, 3.6);
  });
  return { sprite, len, name: type === 'taxi' ? 'taxi' : type === 'van' ? 'van' : 'car' };
}

// Mother duck (a mallard hen) from above, facing up.
function paintMother() {
  return makeSprite(32, 48, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(3, 6, 11, 16, 0, 0, Math.PI * 2);
    g.fill();
    // tail
    g.fillStyle = '#4b3522';
    g.beginPath();
    g.moveTo(-5.5, 13);
    g.quadraticCurveTo(0, 25, 5.5, 13);
    g.fill();
    // body
    const b = g.createRadialGradient(-3, -1, 1, 0, 3, 15);
    b.addColorStop(0, '#b38c60');
    b.addColorStop(0.6, '#86643f');
    b.addColorStop(1, '#5a4129');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 3, 11, 15, 0, 0, Math.PI * 2);
    g.fill();
    // scalloped feathers
    g.lineWidth = 0.8;
    for (let row = 0; row < 6; row++) {
      const y = -6 + row * 4;
      const half = 9 - Math.abs(row - 2) * 1.2;
      for (let x = -half; x <= half; x += 3.4) {
        g.strokeStyle = 'rgba(55,35,18,0.55)';
        g.beginPath();
        g.arc(x + (row % 2) * 1.7, y, 1.9, 0.1, Math.PI - 0.1);
        g.stroke();
        g.strokeStyle = 'rgba(240,210,160,0.35)';
        g.beginPath();
        g.arc(x + (row % 2) * 1.7, y + 0.8, 1.9, 0.3, Math.PI - 0.3);
        g.stroke();
      }
    }
    // folded wings with the blue speculum
    for (const s of [-1, 1]) {
      g.fillStyle = 'rgba(70,48,28,0.55)';
      g.beginPath();
      g.ellipse(s * 6.5, 6, 4, 11, s * -0.12, 0, Math.PI * 2);
      g.fill();
      const sp = g.createLinearGradient(s * 5, 8, s * 9, 12);
      sp.addColorStop(0, '#3a4fd0');
      sp.addColorStop(1, '#7f5be0');
      g.fillStyle = sp;
      g.beginPath();
      g.ellipse(s * 7.5, 10, 1.8, 4, s * -0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(s * 7.5 - 1, 14.2, 2, 0.8);
    }
    // head
    const h = g.createRadialGradient(-2, -15, 1, 0, -13, 7);
    h.addColorStop(0, '#a98458');
    h.addColorStop(1, '#6a4c30');
    g.fillStyle = h;
    g.beginPath();
    g.arc(0, -13, 6.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3e2a17';
    g.beginPath();
    g.ellipse(0, -13.5, 2.3, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(s * 4.6, -15, 1.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(s * 4.6 - 0.6, -15.8, 0.6, 0.6);
    }
    // bill
    const bl = g.createLinearGradient(0, -18, 0, -26);
    bl.addColorStop(0, '#d8772a');
    bl.addColorStop(1, '#f0a050');
    g.fillStyle = bl;
    g.beginPath();
    g.moveTo(-3, -18.5);
    g.quadraticCurveTo(-3.4, -25.5, 0, -26);
    g.quadraticCurveTo(3.4, -25.5, 3, -18.5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(50,30,15,0.7)';
    g.beginPath();
    g.ellipse(0, -21.5, 1.4, 2.4, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintDuckling() {
  return makeSprite(20, 26, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(2, 4.5, 6.5, 8, 0, 0, Math.PI * 2);
    g.fill();
    // fuzz around the edge
    g.strokeStyle = '#ffe680';
    g.lineWidth = 1;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 5.5, 2 + Math.sin(a) * 7);
      g.lineTo(Math.cos(a) * 7.4, 2 + Math.sin(a) * 9);
      g.stroke();
    }
    const b = g.createRadialGradient(-2, 0, 0.5, 0, 2, 8);
    b.addColorStop(0, '#fff6b0');
    b.addColorStop(0.55, '#f8d43c');
    b.addColorStop(1, '#d09a26');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 2, 6.5, 8, 0, 0, Math.PI * 2);
    g.fill();
    // the brown back patches of a mallard duckling
    g.fillStyle = 'rgba(120,85,35,0.75)';
    g.beginPath();
    g.ellipse(0, 4.5, 3.3, 4.6, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 4, 6, 1.5, 2.2, s * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    // head
    const h = g.createRadialGradient(-1.2, -7, 0.4, 0, -6, 5);
    h.addColorStop(0, '#fff6b0');
    h.addColorStop(1, '#f2c632');
    g.fillStyle = h;
    g.beginPath();
    g.arc(0, -6, 4.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120,85,35,0.8)';
    g.beginPath();
    g.ellipse(0, -6.2, 1.5, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 3.2, -7.3, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e08a3a';
    g.beginPath();
    g.ellipse(0, -10.6, 1.7, 2.3, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintMarking(text, color) {
  return makeSprite(34, 16, (g) => {
    g.fillStyle = color;
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, 1);
  });
}

function paintBikeIcon() {
  return makeSprite(28, 18, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.6;
    for (const x of [-7, 7]) {
      g.beginPath();
      g.arc(x, 3, 4.5, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-7, 3);
    g.lineTo(-2, -4);
    g.lineTo(5, -4);
    g.lineTo(7, 3);
    g.moveTo(-2, -4);
    g.lineTo(0, 3);
    g.lineTo(5, -4);
    g.stroke();
  });
}

// ---------- game ----------

export default {
  id: 'ducklings',
  title: 'Duck Crossing',
  emoji: '🦆',
  tagline: 'Lead your ducklings across the busy streets: they follow your exact path, a step behind. If anything on the road touches you or any duckling, the parade is over.',
  colors: { bg: '#4a4e55', fg: '#fff8e4', accent: '#ffd23f' },

  // Brass-band street funk: a New Orleans style parade in B♭ major at 128 BPM, like the duck family
  // marching through town. A sousaphone-like sawtooth bass and a funky kick from the first bar, then
  // clavinet stabs and horn hits, then the trumpet tune, and for the finale a trombone countermelody,
  // a cowbell and busier hats. 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("c2").struct("x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick2 = note("c2").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const snare = s("~ pink ~ pink").decay(0.14).sustain(0).hpf(900).lpf(5200).gain(0.18).room(0.2)
      const ghosts = s("pink").struct("~ ~ ~ x ~ ~ ~ ~ ~ x ~ ~ ~ ~ x ~").decay(0.05).sustain(0).hpf(1800).lpf(5000).gain(0.06)
      const hats = s("white*8").decay(0.03).sustain(0).hpf(6800).gain("[0.05 0.025]*4")
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.055 0.02 0.035 0.02]*4")
      const bass = note("<[bb2 ~ ~ bb2 ~ ~ f2 ~ bb2 ~ ab2 ~ ~ f2 g2 ~] [eb2 ~ ~ eb2 ~ ~ bb2 ~ eb3 ~ db3 ~ ~ bb2 c3 ~] [g2 ~ ~ g2 ~ ~ d3 ~ g2 ~ f2 ~ ~ d3 e2 ~] [f2 ~ ~ f2 ~ ~ c3 ~ f2 ~ eb2 ~ ~ c3 a2 ~]>")
        .s("sawtooth").decay(0.16).sustain(0.3).release(0.05).lpf(saw.range(500, 1100).slow(32)).lpq(4).gain(0.36)
      const clav = note("<[bb3,d4,ab4] [eb4,g4,db5] [g3,bb3,f4] [f3,a3,eb4]>").struct("~ x ~ x ~ ~ x ~ ~ x ~ x ~ ~ x ~")
        .s("square").decay(0.05).sustain(0).lpf(2400).gain(0.05).pan(0.35)
      const horns = note("<[bb4,d5,f5] [eb5,g5,bb5] [d5,f5,bb5] [c5,eb5,a5]>").struct("~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ ~ ~")
        .s("sawtooth").attack(0.01).decay(0.12).sustain(0.35).release(0.08).lpf(2000).gain(0.075).pan(0.6)
      const lead = note("<[bb4 ~ d5 f5 ~ g5 f5 d5] [eb5 ~ g5 ~ f5 eb5 db5 ~] [d5 ~ bb4 ~ c5 d5 f5 g5] [a5 ~ f5 ~ eb5 ~ c5 ~]>")
        .s("sawtooth").attack(0.02).decay(0.15).sustain(0.5).release(0.1).lpf(1900).gain(0.08).room(0.3)
      const bone = note("<[d4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ eb4 ~ ~ ~] [bb3 ~ ~ ~ d4 ~ ~ ~] [c4 ~ ~ ~ a3 ~ ~ ~]>")
        .s("sawtooth").attack(0.04).decay(0.3).sustain(0.6).release(0.15).lpf(1100).gain(0.09)
      const cowbell = note("f5").struct("x ~ x x ~ x ~ x").s("square").decay(0.04).sustain(0).lpf(3000).gain(0.035)
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, bass)],
      [8, stack(kick, snare, ghosts, hats, bass, clav, horns)],
      [8, stack(kick2, snare, ghosts, hats, bass, clav, horns, lead)],
      [8, stack(kick2, snare, ghosts, hats16, bass, clav, horns, lead, bone, cowbell)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const sidewalk = paintSidewalk(W, H, art);
    const asphalt = paintAsphalt(W, H, art);
    const trees = paintTrees(W, H, art);
    const momArt = paintMother();
    const duckArt = paintDuckling();
    const busText = paintMarking('BUS', 'rgba(255,240,220,0.8)');
    const bikeIcon = paintBikeIcon();
    const sunGlow = glowSprite('rgba(255,228,160,1)', 140);
    const amber = glowSprite('rgba(255,180,40,1)', 16);
    const vignette = vignetteSprite(W, H, 0.5, '20,22,28');
    const vehicleArt = {
      car: [0, 1, 2, 3].map(() => paintVehicle('car', art)),
      taxi: [paintVehicle('taxi', art)],
      van: [paintVehicle('van', art)],
      bus: [paintVehicle('bus', art)],
      bike: [0, 1, 2].map(() => paintVehicle('bike', art)),
      tram: [paintVehicle('tram', art)],
    };

    // ---- time ↔ distance walked (the walking pace only depends on time) ----
    const tab = new Float64Array(Math.ceil(TABLE_T / TABLE_DT) + 1);
    for (let i = 1; i < tab.length; i++) tab[i] = tab[i - 1] + speedAt((i - 0.5) * TABLE_DT) * TABLE_DT;
    const scrollAt = (t) => {
      const f = clamp(t / TABLE_DT, 0, tab.length - 1.001);
      const i = Math.floor(f);
      return lerp(tab[i], tab[i + 1], f - i);
    };
    const timeAt = (s) => {
      if (s <= 0) return 0;
      let lo = 0;
      let hi = tab.length - 1;
      if (s >= tab[hi]) return TABLE_T;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (tab[m] < s) lo = m;
        else hi = m;
      }
      return (lo + (s - tab[lo]) / (tab[hi] - tab[lo])) * TABLE_DT;
    };
    const ducksAt = (t) => START_DUCKS + JOINS.filter((j) => j <= t).length;

    // ---- the whole city, laid out up front so it never depends on how you play ----
    const plan = rng.fork('plan');
    const roads = [];
    const lanes = [];
    const carX = (lane, c, t) => mod(c.u0 + lane.dir * lane.v * t, lane.Lp) - lane.M;
    // the time window during which the line (mother plus ducklings) is on this lane
    const windowOf = (lane) => {
      const n = ducksAt(timeAt(lane.d + lane.hw + R_PLAN + MAX_DUCKS * SP));
      return [timeAt(lane.d - lane.hw - R_PLAN), timeAt(lane.d + lane.hw + R_PLAN + n * SP)];
    };
    // does this car pass over [a, b] while the line is on its lane?
    const sweeps = (lane, c, tA, tB, a, b) => {
      const xa = carX(lane, c, tA);
      const xb = xa + lane.dir * lane.v * (tB - tA);
      const lo = Math.min(xa, xb) - c.len / 2 - R_PLAN;
      const hi = Math.max(xa, xb) + c.len / 2 + R_PLAN;
      for (const k of [-1, 0, 1]) if (lo + k * lane.Lp < b && hi + k * lane.Lp > a) return true;
      return false;
    };

    function makeLane(kind, dir, d, p) {
      const { h, hw } = LANE[kind];
      const tram = kind === 'tram';
      const M = tram ? 210 : 130;
      const Lp = W + 2 * M + plan.range(0, tram ? 120 : 220);
      const lane = { kind, dir, d, h, hw, Lp, M: (Lp - W) / 2, cars: [] };
      const jitter = plan.range(0.85, 1.15);
      lane.v = jitter * (kind === 'bike' ? lerp(130, 235, p) : kind === 'bus' ? lerp(75, 145, p) : tram ? lerp(65, 105, p) : lerp(85, 190, p));
      const gapMin = kind === 'bike' ? lerp(70, 30, p) : lerp(130, 45, p);
      const gapMax = kind === 'bike' ? lerp(220, 110, p) : lerp(320, 150, p);
      let u = plan.range(0, 140);
      for (;;) {
        let vt;
        if (kind === 'bike') vt = plan.pick(vehicleArt.bike);
        else if (kind === 'bus') vt = plan.chance(0.65) ? vehicleArt.bus[0] : vehicleArt.taxi[0];
        else if (tram) vt = vehicleArt.tram[0];
        else {
          const r = plan.next();
          vt = r < 0.22 ? vehicleArt.taxi[0] : r < 0.36 ? vehicleArt.van[0] : plan.pick(vehicleArt.car);
        }
        if (u + vt.len > Lp - gapMin) break;
        lane.cars.push({ u0: u + vt.len / 2, len: vt.len, art: vt });
        u += vt.len + plan.range(gapMin, gapMax);
        if (tram) break;
      }
      return lane;
    }

    let D = scrollAt(2.9) + LANE.car.hw + R_PLAN + CURB + 4;
    let prevX = W / 2;
    let freeFrom = 0;
    const end = scrollAt(61) + H;
    while (D < end) {
      const t0 = timeAt(D);
      const p = progress(t0, 60, 1.25);
      const road = { d0: D, lanes: [] };
      let kinds;
      if (t0 > 28 && plan.chance(0.2)) {
        kinds = plan.chance(0.5) ? ['tram'] : ['car', 'tram', 'car'];
      } else {
        const nl = t0 < 9 ? 1 : t0 < 20 ? plan.int(1, 2) : t0 < 36 ? plan.int(2, 3) : plan.int(2, 4);
        kinds = [];
        for (let k = 0; k < nl; k++) {
          const opts = ['car', 'car'];
          if (t0 > 12) opts.push('bike');
          if (t0 > 20) opts.push('bus');
          kinds.push(plan.pick(opts));
        }
      }
      const oneWay = kinds.length === 1 || plan.chance(0.35);
      const dirA = plan.chance(0.5) ? 1 : -1;
      let d = D + CURB;
      kinds.forEach((kind, k) => {
        const dir = oneWay ? dirA : k < kinds.length / 2 ? dirA : -dirA;
        const lane = makeLane(kind, dir, d + LANE[kind].h / 2, p);
        lane.road = road;
        lane.split = k > 0 && road.lanes[k - 1].dir !== dir;
        road.lanes.push(lane);
        d += LANE[kind].h;
      });
      road.d1 = d + CURB;

      // a guaranteed crossing point, reachable from the last one, that every lane leaves open
      const first = road.lanes[0];
      const last = road.lanes.at(-1);
      const freeTime = Math.max(0, timeAt(first.d - first.hw - R_PLAN) - freeFrom);
      const maxShift = Math.min(150, 0.6 * MSPEED * freeTime);
      const cx = clamp(prevX + plan.range(-maxShift, maxShift), 40, W - 40);
      const cw = lerp(78, 30, p);
      for (const lane of road.lanes) {
        const [tA, tB] = windowOf(lane);
        lane.cars = lane.cars.filter((c) => !sweeps(lane, c, tA, tB, cx - cw / 2, cx + cw / 2));
      }
      road.cx = cx;
      prevX = cx;
      freeFrom = timeAt(last.d + last.hw + R_PLAN);
      roads.push(road);
      lanes.push(...road.lanes);
      D = road.d1 + lerp(150, 70, p) * plan.range(0.8, 1.3);
    }

    // ---- state ----
    const mom = createMover({ x: W / 2, minX: 18, maxX: W - 18, speed: MSPEED, accel: 20 });
    const fx = createParticles();
    const history = []; // mother's x by distance walked, so each duckling can follow her path
    for (let s = -200; s <= 0; s += 2) history.push({ s, x: W / 2 });
    let scroll = 0;
    let lastT = 0;
    let clock = 0;
    let deadT = 0;
    let nDucks = START_DUCKS;
    let honk = null;
    const pops = [];
    const ducks = []; // positions this frame: [0] is the mother
    let scatter = null;

    const pathX = (s) => {
      for (let i = history.length - 1; i > 0; i--) {
        const a = history[i - 1];
        if (a.s <= s) {
          const b = history[i];
          return b.s === a.s ? b.x : lerp(a.x, b.x, (s - a.s) / (b.s - a.s));
        }
      }
      return history[0].x;
    };
    const laneY = (lane) => MY - (lane.d - scroll);

    function layout() {
      ducks.length = 0;
      ducks.push({ x: mom.x, y: MY, rot: Math.atan2(mom.vx, speedAt(lastT)), mom: true });
      for (let i = 1; i <= nDucks; i++) {
        const s = scroll - i * SP;
        const x = pathX(s);
        const rot = Math.atan2(pathX(s + 4) - pathX(s - 4), 8);
        ducks.push({ x, y: MY + i * SP, rot, mom: false });
      }
    }
    layout();

    const game = {
      dead: false,
      deathReason: '',
      get lanes() {
        return lanes;
      },

      update(dt, dir, t) {
        clock += dt;
        lastT = t + dt;
        mom.update(dt, dir);
        scroll = scrollAt(lastT);
        history.push({ s: scroll, x: mom.x });
        if (history.length > 600) history.splice(0, history.length - 600);

        const n = ducksAt(lastT);
        const joined = n > nDucks;
        nDucks = n;
        layout();
        if (joined) {
          pops.push({ i: n, life: 1.2 });
          fx.burst(ducks[n].x, ducks[n].y, { count: 14, speed: 70, life: 0.6, size: 2.5, round: true, colors: ['#fff6b0', '#ffd23f', '#ffffff'] });
        }
        for (const pp of pops) pp.life -= dt;
        while (pops.length && pops[0].life <= 0) pops.shift();

        // anything on the road touching the line?
        for (const lane of lanes) {
          const y = laneY(lane);
          if (y < MY - 40 || y > MY + MAX_DUCKS * SP + 40) continue;
          for (const c of lane.cars) {
            const x = carX(lane, c, lastT);
            if (x + c.len / 2 < -10 || x - c.len / 2 > W + 10) continue;
            for (let i = 0; i < ducks.length; i++) {
              const dk = ducks[i];
              if (!circleRect(dk.x, dk.y, i === 0 ? R_MOM : R_DUCK, x - c.len / 2, y - lane.hw, c.len, lane.hw * 2)) continue;
              this.dead = true;
              const name = c.art.name;
              const a = name === 'tram' ? 'the' : 'a';
              this.deathReason =
                i === 0
                  ? `Mother Duck waddled right in front of ${a} ${name}. The ducklings scattered.`
                  : `${name === 'tram' ? 'The tram' : `A ${name}`} cut through the line and duckling #${i} scattered.`;
              honk = { x: clamp(x, 50, W - 50), y: y - 26, text: name === 'cyclist' ? 'DING!' : 'HONK!' };
              fx.burst(dk.x, dk.y, { count: 30, speed: 150, life: 1, size: 3.5, drag: 2, colors: i === 0 ? ['#86643f', '#b38c60', '#5a4129', '#f5ecd8'] : ['#ffe066', '#f8d43c', '#fff6b0', '#b08030'] });
              scatter = ducks.map((dd) => {
                const ang = Math.random() * Math.PI * 2;
                const sp = 70 + Math.random() * 90;
                return { ...dd, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: ang + Math.PI / 2 };
              });
              return;
            }
          }
        }
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        if (scatter) {
          for (const d of scatter) {
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vx *= 1 - dt * 0.8;
            d.vy *= 1 - dt * 0.8;
          }
        }
        fx.update(dt);
      },

      render(g) {
        const t = lastT;
        const off = mod(scroll, H);
        drawSprite(g, sidewalk, W / 2, H / 2 + off);
        drawSprite(g, sidewalk, W / 2, H / 2 + off - H);

        // roads
        const sc = asphalt.canvas.width / asphalt.w;
        const strip = (top, h) => {
          const ty = mod(top - scroll, H);
          const a = Math.min(h, H - ty);
          g.drawImage(asphalt.canvas, 0, ty * sc, W * sc, a * sc, 0, top, W, a);
          if (h > a) g.drawImage(asphalt.canvas, 0, 0, W * sc, (h - a) * sc, 0, top + a, W, h - a);
        };
        for (const road of roads) {
          const top = MY - (road.d1 - scroll);
          const bot = MY - (road.d0 - scroll);
          if (bot < -10 || top > H + 10) continue;
          strip(top, bot - top);
          // curbs
          for (const [y, s] of [[top, 1], [bot - CURB, -1]]) {
            g.fillStyle = '#c4bcad';
            g.fillRect(0, y, W, CURB);
            g.fillStyle = 'rgba(255,255,245,0.5)';
            g.fillRect(0, s > 0 ? y : y + CURB - 1.5, W, 1.5);
            g.fillStyle = 'rgba(30,30,35,0.45)';
            g.fillRect(0, s > 0 ? y + CURB : y - 2, W, 2);
          }
          for (const lane of road.lanes) {
            const y = laneY(lane);
            const yt = y - lane.h / 2;
            if (lane.kind === 'bike') {
              g.fillStyle = 'rgba(70,170,95,0.42)';
              g.fillRect(0, yt, W, lane.h);
              for (let x = 50; x < W; x += 130) drawSprite(g, bikeIcon, x, y, { rot: lane.dir < 0 ? Math.PI : 0, size: 22 });
            } else if (lane.kind === 'bus') {
              g.fillStyle = 'rgba(190,55,45,0.38)';
              g.fillRect(0, yt, W, lane.h);
              for (let x = 70; x < W; x += 150) drawSprite(g, busText, x, y, { rot: lane.dir < 0 ? Math.PI : 0, size: 32 });
            } else if (lane.kind === 'tram') {
              g.fillStyle = 'rgba(120,110,95,0.35)';
              g.fillRect(0, yt + 3, W, lane.h - 6);
              for (const s of [-1, 1]) {
                g.fillStyle = '#2a2b2f';
                g.fillRect(0, y + s * 9 - 1.5, W, 3);
                g.fillStyle = '#c9ccd3';
                g.fillRect(0, y + s * 9 - 1.5, W, 1);
              }
            }
            // the line between this lane and the previous one
            if (lane !== road.lanes[0]) {
              const yb = yt + lane.h;
              if (lane.split) {
                g.fillStyle = '#f2c230';
                g.fillRect(0, yb - 2.5, W, 1.8);
                g.fillRect(0, yb + 0.7, W, 1.8);
              } else {
                g.fillStyle = 'rgba(245,245,240,0.85)';
                for (let x = 6; x < W; x += 34) g.fillRect(x, yb - 1.2, 18, 2.4);
              }
            }
          }
        }

        // traffic, with an amber flash at the edge where something is about to drive in
        for (const lane of lanes) {
          const y = laneY(lane);
          if (y < -40 || y > H + 40) continue;
          for (const c of lane.cars) {
            const x = carX(lane, c, t);
            if (x + c.len / 2 > -6 && x - c.len / 2 < W + 6) {
              drawSprite(g, c.art.sprite, x, y + (lane.kind === 'bike' ? Math.sin(clock * 9 + c.u0) * 0.8 : 0), { rot: lane.dir < 0 ? Math.PI : 0 });
            } else {
              const dist = lane.dir > 0 ? -(x + c.len / 2) : x - c.len / 2 - W;
              const eta = dist / lane.v;
              if (eta > 0 && eta < 1.3) {
                const ex = lane.dir > 0 ? 9 : W - 9;
                const a = (1 - eta / 1.3) * (0.55 + 0.45 * Math.sin(clock * 18));
                g.globalCompositeOperation = 'lighter';
                drawSprite(g, amber, ex, y, { size: 36, alpha: a * 0.8 });
                g.globalCompositeOperation = 'source-over';
                g.fillStyle = `rgba(255,190,60,${0.4 + a * 0.6})`;
                g.beginPath();
                g.moveTo(ex + lane.dir * 6, y);
                g.lineTo(ex - lane.dir * 4, y - 6);
                g.lineTo(ex - lane.dir * 4, y + 6);
                g.closePath();
                g.fill();
              }
            }
          }
        }

        // the duck family, tail first so the mother sits on top
        const fam = scatter || ducks;
        for (let i = fam.length - 1; i >= 0; i--) {
          const d = fam[i];
          const wob = this.dead ? Math.sin(clock * 30 + i) * 0.25 : Math.sin(clock * 13 + i * 1.7) * 0.13;
          let size = d.mom ? 28 : 16.5;
          const pop = pops.find((pp) => pp.i === i);
          if (pop) size *= 1 + Math.max(0, pop.life - 0.9) * 2.5;
          drawSprite(g, d.mom ? momArt : duckArt, d.x, d.y, { rot: d.rot + wob, size });
        }
        for (const pp of pops) {
          const d = ducks[pp.i];
          if (!d) continue;
          g.fillStyle = `rgba(255,236,150,${clamp(pp.life, 0, 1)})`;
          g.font = 'bold 14px sans-serif';
          g.textAlign = 'center';
          g.fillText('+1', d.x + 16, d.y - 6 - (1.2 - pp.life) * 24);
          g.strokeStyle = `rgba(255,236,150,${clamp(pp.life - 0.6, 0, 1)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(d.x, d.y, 8 + (1.2 - pp.life) * 30, 0, Math.PI * 2);
          g.stroke();
        }

        fx.render(g);

        const toff = mod(scroll, H);
        drawSprite(g, trees, W / 2, H / 2 + toff, { size: W });
        drawSprite(g, trees, W / 2, H / 2 + toff - H, { size: W });

        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 30, -30, { size: 520, alpha: 0.28 });
        g.globalCompositeOperation = 'source-over';

        if (honk) {
          const k = clamp(deadT * 6, 0, 1);
          g.save();
          g.translate(honk.x, honk.y);
          g.rotate(-0.12);
          g.scale(0.6 + k * 0.5 + Math.sin(deadT * 30) * 0.03, 0.6 + k * 0.5);
          g.font = 'bold 22px sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 5;
          g.strokeStyle = '#2a1a10';
          g.strokeText(honk.text, 0, 0);
          g.fillStyle = '#ffd23f';
          g.fillText(honk.text, 0, 0);
          g.restore();
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
