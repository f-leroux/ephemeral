// Walkies — walk a corgi through a park on a crisp autumn morning. The dog trots ahead on the
// end of its leash, following a scent only it can smell (a faint shimmer on the grass shows where
// it's heading), and you follow behind. Lamp posts, trees and bollards are the trouble: if one ever
// ends up between you and the dog, the leash wraps round it and the walk is over. So you keep to
// the same side of every post as the dog, or pull the dog over to your side in time (a taut leash
// drags the dog towards you, and a straining dog drags you towards it). Benches and flower tubs are
// low: the dog and the leash pass over them, but you'd trip, so you walk round while the dog
// ducks underneath. From 15s squirrels make the dog lunge and yank you sideways; from 24s joggers
// come running down the path; posts get denser and the walk gets brisker over the minute. Every
// layout is checked against a hidden reference walk with the game's own physics (anything that
// would trip it up is removed), so there's always a way through.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 548; // where you walk
const DOGD = 112; // how far ahead the dog trots
const DOGY = PY - DOGD;
const EDGE = 20; // the hedges down both sides
const SPEED = 265;
const SLACK = 58; // how far sideways the dog can wander before the leash goes taut
const REACH = 88; // how far it can strain
const PULL_K = 6.5;
const PLAYER_R = 10;
const DOG_R = 9;
const JOG_V = 105; // joggers run down the path this much faster than the park scrolls

const speedAt = (t) => lerp(150, 245, progress(t, 60, 1.25)) * lerp(0.75, 1, easeOutCubic(clamp(t / 8, 0, 1)));

const TALL = { lamp: 6, tree: 10, bollard: 6, jogger: 11 };
const NAMES = { lamp: 'a lamp post', tree: 'a tree', bollard: 'a bollard' };

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const u = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  const qx = ax + dx * u - px;
  const qy = ay + dy * u - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function leafPath(g, s) {
  g.beginPath();
  g.moveTo(0, -s);
  g.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s);
  g.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s);
  g.closePath();
}

const LEAF_COLS = ['#e8862f', '#f2b53a', '#c9472b', '#d9692a', '#b8862c', '#f4cf55'];

// ---------- art ----------

function paintLawn(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#4f8a3f');
    base.addColorStop(0.5, '#68a650');
    base.addColorStop(1, '#4f8a3f');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // mowing stripes
    for (let x = EDGE, i = 0; x < W - EDGE; x += 40, i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,220,0.06)' : 'rgba(20,50,10,0.06)';
      g.fillRect(x, 0, 40, H);
    }
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // grass blades
    for (let i = 0; i < 1400; i++) {
      const x = rng.range(EDGE, W - EDGE);
      const y = rng.range(0, H);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(160,210,110,0.28)' : 'rgba(30,70,25,0.22)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-1.5, 1.5), y - rng.range(2, 5));
      g.stroke();
    }
    // clover patches and darker tufts
    for (let i = 0; i < 26; i++) {
      const x = rng.range(EDGE + 10, W - EDGE - 10);
      const y = rng.range(0, H);
      const r = rng.range(8, 22);
      const dark = rng.chance(0.5);
      wrap(() => {
        g.fillStyle = dark ? 'rgba(30,70,25,0.12)' : 'rgba(170,220,120,0.1)';
        g.beginPath();
        g.ellipse(x, y, r, r * 0.7, 0, 0, TAU);
        g.fill();
      });
    }
    // daisies
    for (let i = 0; i < 40; i++) {
      const x = rng.range(EDGE + 6, W - EDGE - 6);
      const y = rng.range(0, H);
      wrap(() => {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          g.beginPath();
          g.arc(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.1, 0, TAU);
          g.fill();
        }
        g.fillStyle = '#ffd23a';
        g.beginPath();
        g.arc(x, y, 0.9, 0, TAU);
        g.fill();
      });
    }
    // fallen leaves
    for (let i = 0; i < 190; i++) {
      const x = rng.range(EDGE, W - EDGE);
      const y = rng.range(0, H);
      const s = rng.range(2.2, 4.4);
      const rot = rng.range(0, TAU);
      const c = rng.pick(LEAF_COLS);
      const a = rng.range(0.55, 0.9);
      wrap(() => {
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.globalAlpha = a;
        g.fillStyle = 'rgba(30,40,10,0.25)';
        g.translate(0.8, 0.8);
        leafPath(g, s);
        g.fill();
        g.translate(-0.8, -0.8);
        g.fillStyle = c;
        leafPath(g, s);
        g.fill();
        g.strokeStyle = 'rgba(90,40,10,0.5)';
        g.lineWidth = 0.4;
        g.beginPath();
        g.moveTo(0, -s);
        g.lineTo(0, s);
        g.stroke();
        g.restore();
      });
    }
    // hedges down both sides
    for (const side of [0, 1]) {
      const x0 = side ? W - EDGE : 0;
      const hg = g.createLinearGradient(x0, 0, x0 + EDGE, 0);
      hg.addColorStop(0, side ? '#2f5a26' : '#1f3d1a');
      hg.addColorStop(1, side ? '#1f3d1a' : '#2f5a26');
      g.fillStyle = hg;
      g.fillRect(x0, 0, EDGE, H);
      for (let i = 0; i < 70; i++) {
        const x = x0 + rng.range(2, EDGE - 2);
        const y = rng.range(0, H);
        const r = rng.range(4, 9);
        const light = rng.chance(0.5);
        wrap(() => {
          g.fillStyle = light ? 'rgba(120,170,70,0.45)' : 'rgba(15,35,12,0.45)';
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
        });
      }
      for (let i = 0; i < 18; i++) {
        const x = x0 + rng.range(3, EDGE - 3);
        const y = rng.range(0, H);
        const c = rng.pick(['#f2b53a', '#e8862f', '#c9472b']);
        wrap(() => {
          g.fillStyle = c;
          g.beginPath();
          g.arc(x, y, 1.6, 0, TAU);
          g.fill();
        });
      }
      g.fillStyle = 'rgba(10,25,8,0.35)';
      g.fillRect(side ? W - EDGE - 3 : EDGE, 0, 3, H);
    }
  }, 2);
}

function paintSunlight(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const gr = g.createLinearGradient(0, 0, W * 0.6, H);
    gr.addColorStop(0, 'rgba(255,214,140,0.28)');
    gr.addColorStop(0.5, 'rgba(255,200,120,0.06)');
    gr.addColorStop(1, 'rgba(60,90,160,0.12)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // a few soft light shafts
    g.globalCompositeOperation = 'lighter';
    for (const [x, w] of [[40, 50], [150, 30], [250, 60]]) {
      const sg = g.createLinearGradient(x, 0, x + 260, H);
      sg.addColorStop(0, 'rgba(255,230,170,0.09)');
      sg.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = sg;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, 0);
      g.lineTo(x + w + 260, H);
      g.lineTo(x + 260, H);
      g.closePath();
      g.fill();
    }
  }, 1);
}

function paintLamp() {
  // base of the post at sprite (0, 36)
  return makeSprite(28, 84, (g) => {
    // plinth
    const pg = g.createLinearGradient(-7, 0, 7, 0);
    pg.addColorStop(0, '#2c4a3a');
    pg.addColorStop(0.4, '#5d8a72');
    pg.addColorStop(1, '#1b2f25');
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 36, 7.5, 4, 0, 0, TAU);
    g.fill();
    g.fillRect(-6, 26, 12, 10);
    g.beginPath();
    g.ellipse(0, 26, 6, 3, 0, 0, TAU);
    g.fill();
    // pole
    const pole = g.createLinearGradient(-2.5, 0, 2.5, 0);
    pole.addColorStop(0, '#1d3328');
    pole.addColorStop(0.35, '#6c9a80');
    pole.addColorStop(1, '#16271e');
    g.fillStyle = pole;
    g.fillRect(-2.4, -24, 4.8, 50);
    g.fillStyle = '#2c4a3a';
    for (const y of [-6, 12]) g.fillRect(-3.4, y, 6.8, 2.4);
    // lantern
    g.fillStyle = '#1d3328';
    g.fillRect(-5, -26, 10, 3);
    const glass = g.createLinearGradient(0, -38, 0, -26);
    glass.addColorStop(0, '#fff6c8');
    glass.addColorStop(1, '#ffc260');
    g.fillStyle = glass;
    g.beginPath();
    g.moveTo(-6.5, -38);
    g.lineTo(6.5, -38);
    g.lineTo(4.5, -26);
    g.lineTo(-4.5, -26);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1d3328';
    g.lineWidth = 1.2;
    g.stroke();
    g.beginPath();
    g.moveTo(0, -38);
    g.lineTo(0, -26);
    g.stroke();
    g.fillStyle = '#2c4a3a';
    g.beginPath();
    g.moveTo(-8, -38);
    g.lineTo(8, -38);
    g.lineTo(0, -44);
    g.closePath();
    g.fill();
    g.fillStyle = '#6c9a80';
    g.beginPath();
    g.arc(0, -45, 1.6, 0, TAU);
    g.fill();
  });
}

function paintTree(leaf, rng) {
  // base of the trunk at sprite (0, 42)
  return makeSprite(80, 104, (g) => {
    const tg = g.createLinearGradient(-6, 0, 6, 0);
    tg.addColorStop(0, '#4a2f1c');
    tg.addColorStop(0.4, '#8a6040');
    tg.addColorStop(1, '#3a2414');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(-9, 44);
    g.quadraticCurveTo(-5, 30, -5, 0);
    g.lineTo(5, 0);
    g.quadraticCurveTo(5, 30, 9, 44);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,20,10,0.5)';
    g.lineWidth = 0.7;
    for (const x of [-2, 1.5]) {
      g.beginPath();
      g.moveTo(x, 4);
      g.lineTo(x + 0.6, 40);
      g.stroke();
    }
    // canopy
    const [c0, c1, c2] = leaf;
    const blobs = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rng.range(-0.2, 0.2);
      blobs.push([Math.cos(a) * rng.range(12, 20), -16 + Math.sin(a) * rng.range(10, 17), rng.range(12, 16)]);
    }
    blobs.push([0, -16, 20]);
    g.fillStyle = c2;
    for (const [x, y, r] of blobs) {
      g.beginPath();
      g.arc(x + 2, y + 3, r, 0, TAU);
      g.fill();
    }
    for (const [x, y, r] of blobs) {
      const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
      gr.addColorStop(0, c0);
      gr.addColorStop(0.6, c1);
      gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, 28);
      g.save();
      g.translate(Math.cos(a) * d, -16 + Math.sin(a) * d * 0.85);
      g.rotate(rng.range(0, TAU));
      g.fillStyle = rng.chance(0.5) ? c0 : 'rgba(80,30,10,0.35)';
      leafPath(g, rng.range(1.5, 2.6));
      g.fill();
      g.restore();
    }
  });
}

function paintBollard() {
  // base at sprite (0, 12)
  return makeSprite(16, 32, (g) => {
    const bg = g.createLinearGradient(-6, 0, 6, 0);
    bg.addColorStop(0, '#1e2228');
    bg.addColorStop(0.4, '#5b6370');
    bg.addColorStop(1, '#16191e');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 12, 6, 3, 0, 0, TAU);
    g.fill();
    g.fillRect(-6, -6, 12, 18);
    const cap = g.createLinearGradient(-6, 0, 6, 0);
    cap.addColorStop(0, '#8a6520');
    cap.addColorStop(0.4, '#ffd877');
    cap.addColorStop(1, '#6e4f14');
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(0, -6, 6, 3, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(0, -7, 4.6, Math.PI, 0);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-3.5, -2, 1.5, 12);
    g.fillStyle = '#ffd877';
    g.fillRect(-6, 3, 12, 1.6);
  });
}

function paintBench() {
  // seat centred on sprite (0, 4)
  return makeSprite(76, 44, (g) => {
    g.fillStyle = 'rgba(30,40,10,0.3)';
    g.beginPath();
    g.ellipse(4, 12, 36, 7, 0, 0, TAU);
    g.fill();
    // iron ends
    g.fillStyle = '#22262c';
    for (const x of [-33, 30]) {
      g.fillRect(x, -18, 3.5, 32);
      g.beginPath();
      g.arc(x + 1.75, -18, 3, 0, TAU);
      g.fill();
    }
    // backrest slats
    for (let i = 0; i < 2; i++) {
      const y = -16 + i * 5;
      const sg = g.createLinearGradient(0, y, 0, y + 3.6);
      sg.addColorStop(0, '#d79a5a');
      sg.addColorStop(1, '#8c5a2c');
      g.fillStyle = sg;
      g.fillRect(-34, y, 68, 3.6);
    }
    // seat slats
    for (let i = 0; i < 4; i++) {
      const y = -3 + i * 4.2;
      const sg = g.createLinearGradient(0, y, 0, y + 3.4);
      sg.addColorStop(0, '#e6ad6c');
      sg.addColorStop(1, '#9a6434');
      g.fillStyle = sg;
      g.fillRect(-35, y, 70, 3.4);
      g.fillStyle = 'rgba(60,30,10,0.35)';
      g.fillRect(-35, y + 3.4, 70, 0.8);
    }
    g.fillStyle = 'rgba(255,240,200,0.25)';
    g.fillRect(-35, -3, 70, 1);
    // a little brass plaque and a leaf on the seat
    g.fillStyle = '#e8c060';
    g.fillRect(-4, -11, 8, 2.4);
    g.save();
    g.translate(14, 4);
    g.rotate(0.6);
    g.fillStyle = '#e8862f';
    leafPath(g, 3);
    g.fill();
    g.restore();
  });
}

function paintPlanter(rng, flowers) {
  return makeSprite(46, 46, (g) => {
    g.fillStyle = 'rgba(30,40,10,0.3)';
    g.beginPath();
    g.ellipse(3, 6, 20, 15, 0, 0, TAU);
    g.fill();
    const sg = g.createLinearGradient(-18, 0, 18, 0);
    sg.addColorStop(0, '#8d8172');
    sg.addColorStop(0.4, '#d8cdb8');
    sg.addColorStop(1, '#6d6356');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(0, 4, 18, 14, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#4a3020';
    g.beginPath();
    g.ellipse(0, 1, 14.5, 10.5, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, 11);
      g.fillStyle = rng.chance(0.5) ? '#3f7a32' : '#5c9c45';
      g.beginPath();
      g.ellipse(Math.cos(a) * d, 1 + Math.sin(a) * d * 0.72, 3, 2, a, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, TAU);
      const d = rng.range(0, 10);
      const x = Math.cos(a) * d;
      const y = -1 + Math.sin(a) * d * 0.7;
      g.fillStyle = rng.pick(flowers);
      for (let k = 0; k < 5; k++) {
        const b = (k / 5) * TAU;
        g.beginPath();
        g.arc(x + Math.cos(b) * 1.6, y + Math.sin(b) * 1.6, 1.4, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#ffe070';
      g.beginPath();
      g.arc(x, y, 0.9, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, 4, 17, 13, 0, Math.PI * 1.1, Math.PI * 1.6);
    g.stroke();
  });
}

function paintWalker(frame) {
  // seen from behind, walking up the screen; right hand forward holding the leash
  return makeSprite(40, 50, (g) => {
    const step = frame ? 1 : -1;
    g.fillStyle = 'rgba(20,40,10,0.3)';
    g.beginPath();
    g.ellipse(2, 16, 12, 6, 0, 0, TAU);
    g.fill();
    // legs and boots
    for (const s of [-1, 1]) {
      const off = s * step * 4;
      g.fillStyle = '#2d3550';
      g.beginPath();
      g.ellipse(s * 4.5, 12 + off, 3.6, 7, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#5a3420';
      g.beginPath();
      g.ellipse(s * 4.5, 17 + off, 3.6, 3, 0, 0, TAU);
      g.fill();
    }
    // left arm swinging
    g.fillStyle = '#23365e';
    g.beginPath();
    g.ellipse(-11, 2 - step * 3, 3.4, 7, 0.15, 0, TAU);
    g.fill();
    g.fillStyle = '#f0c8a0';
    g.beginPath();
    g.arc(-11.6, 8 - step * 3, 2.4, 0, TAU);
    g.fill();
    // coat
    const cg = g.createLinearGradient(-11, -8, 11, 10);
    cg.addColorStop(0, '#3e5c94');
    cg.addColorStop(1, '#1f2f55');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-10, -6);
    g.quadraticCurveTo(-12, 8, -9, 12);
    g.lineTo(9, 12);
    g.quadraticCurveTo(12, 8, 10, -6);
    g.quadraticCurveTo(0, -11, -10, -6);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(10,20,40,0.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(0, 11);
    g.stroke();
    // toggles of the duffle coat
    g.fillStyle = '#e8d6a8';
    for (const y of [0, 5]) g.fillRect(-6.5, y, 3, 1.2);
    // right arm reaching forward
    g.fillStyle = '#2c4475';
    g.save();
    g.translate(9, -4);
    g.rotate(-0.55);
    g.beginPath();
    g.ellipse(0, -4, 3.4, 7, 0, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.arc(12.5, -12, 2.6, 0, TAU);
    g.fill();
    // scarf
    g.fillStyle = '#d6453a';
    g.beginPath();
    g.ellipse(0, -8, 8, 3.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#f0e2c8';
    for (const x of [-4, 0, 4]) g.fillRect(x - 0.6, -10.5, 1.2, 5);
    g.fillStyle = '#d6453a';
    g.fillRect(-6, -6, 3.4, 9 + step);
    // head with bobble hat
    g.fillStyle = '#6b4226';
    g.beginPath();
    g.arc(0, -13, 6.4, 0, TAU);
    g.fill();
    const hg = g.createRadialGradient(-2, -17, 1, 0, -15, 7);
    hg.addColorStop(0, '#ff9ab8');
    hg.addColorStop(1, '#d2457a');
    g.fillStyle = hg;
    g.beginPath();
    g.arc(0, -15, 6.6, Math.PI * 0.95, Math.PI * 2.05);
    g.fill();
    g.fillStyle = '#f7e3ea';
    g.fillRect(-6.6, -14.5, 13.2, 2.4);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, -22, 2.8, 0, TAU);
    g.fill();
  });
}

function paintDog(frame) {
  // a corgi seen from above and behind, trotting up the screen
  return makeSprite(34, 48, (g) => {
    const step = frame ? 1 : -1;
    g.fillStyle = 'rgba(20,40,10,0.3)';
    g.beginPath();
    g.ellipse(2, 10, 11, 7, 0, 0, TAU);
    g.fill();
    // stubby legs
    g.fillStyle = '#f6efe2';
    for (const [x, y, s] of [[-7, -6, 1], [7, -6, -1], [-7, 11, -1], [7, 11, 1]]) {
      g.beginPath();
      g.ellipse(x, y + s * step * 2.2, 2.8, 3.6, 0, 0, TAU);
      g.fill();
    }
    // body
    const bg = g.createRadialGradient(-3, -4, 2, 0, 2, 16);
    bg.addColorStop(0, '#f6b46a');
    bg.addColorStop(0.6, '#e08a3c');
    bg.addColorStop(1, '#b8642a');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 2, 9.5, 14, 0, 0, TAU);
    g.fill();
    // fluffy white bottom
    g.fillStyle = '#fbf6ec';
    g.beginPath();
    g.ellipse(0, 13, 7.5, 4.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(200,150,110,0.35)';
    g.beginPath();
    g.moveTo(0, 10);
    g.lineTo(0, 17);
    g.lineWidth = 0.8;
    g.strokeStyle = 'rgba(180,130,90,0.5)';
    g.stroke();
    // back highlight
    g.fillStyle = 'rgba(255,230,180,0.35)';
    g.beginPath();
    g.ellipse(-2.5, -2, 3, 8, 0, 0, TAU);
    g.fill();
    // collar
    g.fillStyle = '#d63a3a';
    g.beginPath();
    g.ellipse(0, -10.5, 6.8, 2.4, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#ffd34a';
    g.beginPath();
    g.arc(0, -9, 1.4, 0, TAU);
    g.fill();
    // head
    const hg = g.createRadialGradient(-2, -17, 1, 0, -15, 9);
    hg.addColorStop(0, '#f6b46a');
    hg.addColorStop(1, '#c86e2e');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(0, -15.5, 7, 6.4, 0, 0, TAU);
    g.fill();
    // big ears
    for (const s of [-1, 1]) {
      g.fillStyle = '#c86e2e';
      g.beginPath();
      g.moveTo(s * 2.5, -19);
      g.lineTo(s * 8.5, -27);
      g.lineTo(s * 7.5, -16);
      g.closePath();
      g.fill();
      g.fillStyle = '#f2c2a8';
      g.beginPath();
      g.moveTo(s * 4, -19);
      g.lineTo(s * 7.8, -24.5);
      g.lineTo(s * 7, -17.5);
      g.closePath();
      g.fill();
    }
    // white blaze
    g.fillStyle = '#fbf6ec';
    g.beginPath();
    g.ellipse(0, -16, 1.6, 4, 0, 0, TAU);
    g.fill();
  });
}

function paintTail() {
  return makeSprite(12, 12, (g) => {
    const tg = g.createRadialGradient(-1, -1, 0.5, 0, 0, 5);
    tg.addColorStop(0, '#fff8ea');
    tg.addColorStop(1, '#e8a868');
    g.fillStyle = tg;
    g.beginPath();
    g.ellipse(0, 0, 3.2, 4.6, 0, 0, TAU);
    g.fill();
  });
}

function paintJogger(frame, kit) {
  // running down the screen towards you
  return makeSprite(34, 48, (g) => {
    const step = frame ? 1 : -1;
    g.fillStyle = 'rgba(20,40,10,0.3)';
    g.beginPath();
    g.ellipse(2, 15, 11, 6, 0, 0, TAU);
    g.fill();
    for (const s of [-1, 1]) {
      const off = s * step * 5;
      g.fillStyle = '#2a2a33';
      g.beginPath();
      g.ellipse(s * 4, 10 + off, 3.2, 6.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = kit.shoe;
      g.beginPath();
      g.ellipse(s * 4, 15 + off, 3.4, 2.6, 0, 0, TAU);
      g.fill();
    }
    for (const s of [-1, 1]) {
      g.fillStyle = '#e0a87c';
      g.beginPath();
      g.ellipse(s * 10, -1 - s * step * 4, 2.6, 5.5, 0, 0, TAU);
      g.fill();
    }
    const tg = g.createLinearGradient(-9, -8, 9, 8);
    tg.addColorStop(0, kit.top0);
    tg.addColorStop(1, kit.top1);
    g.fillStyle = tg;
    g.beginPath();
    g.ellipse(0, 0, 8.6, 9.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(-5, -1, 10, 1.6);
    g.fillStyle = '#e0a87c';
    g.beginPath();
    g.arc(0, -11, 5.6, 0, TAU);
    g.fill();
    g.fillStyle = kit.hair;
    g.beginPath();
    g.arc(0, -12.5, 5.8, Math.PI * 1.05, Math.PI * 1.95);
    g.fill();
    g.fillStyle = kit.band;
    g.fillRect(-5.8, -13, 11.6, 2.2);
    g.fillStyle = '#2a1a10';
    for (const x of [-2, 2]) {
      g.beginPath();
      g.arc(x, -10, 0.8, 0, TAU);
      g.fill();
    }
  });
}

function paintSquirrel() {
  return makeSprite(24, 28, (g) => {
    g.fillStyle = '#9b6a44';
    g.beginPath();
    g.moveTo(2, 8);
    g.bezierCurveTo(14, 8, 14, -10, 4, -12);
    g.bezierCurveTo(10, -6, 8, 2, 0, 4);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,220,180,0.4)';
    g.beginPath();
    g.ellipse(8, -4, 2, 5, 0.3, 0, TAU);
    g.fill();
    g.fillStyle = '#b07a50';
    g.beginPath();
    g.ellipse(-2, 4, 4.5, 6, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(-3, -3, 3.8, 0, TAU);
    g.fill();
    g.fillStyle = '#f2dcc0';
    g.beginPath();
    g.ellipse(-3, 5, 2.4, 3.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#9b6a44';
    g.beginPath();
    g.moveTo(-5, -5);
    g.lineTo(-6, -9);
    g.lineTo(-3.5, -6);
    g.closePath();
    g.fill();
    g.fillStyle = '#1a1010';
    g.beginPath();
    g.arc(-4.4, -3.4, 0.9, 0, TAU);
    g.fill();
  });
}

function paintPigeon(frame) {
  return makeSprite(18, 14, (g) => {
    g.fillStyle = '#8d93a0';
    if (frame) {
      g.beginPath();
      g.ellipse(-5, -1, 6, 2.4, -0.4, 0, TAU);
      g.ellipse(5, -1, 6, 2.4, 0.4, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#9ea4b2';
    g.beginPath();
    g.ellipse(0, 1, 3.4, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#5e8a7a';
    g.beginPath();
    g.arc(0, -3, 2.4, 0, TAU);
    g.fill();
    g.fillStyle = '#6a6f7a';
    g.fillRect(-1.8, 5, 3.6, 2);
    g.fillStyle = '#e08a3c';
    g.fillRect(-0.5, -6, 1, 1.4);
  });
}

export default {
  id: 'walkies',
  title: 'Walkies!',
  emoji: '🐕',
  tagline: "Follow the dog and keep its leash off every post. Don't bump anything.",
  colors: { bg: '#2f5a2c', fg: '#fff8e8', accent: '#ff9a3d' },

  music: {
    cps: 0.55,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
      const kick2 = note("c2 c2 c2 [c2 c2]").s("sine").decay(0.2).sustain(0).gain("0.8 0.8 0.8 [0.8 0.55]")
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1200).lpf(5200).gain(0.12).room(0.3)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.018 0.03 0.022 0.036]*4")
      const block = note("[~ ~ ~ g5] [~ ~ g5 ~] [~ ~ ~ g5] [~ g5 ~ c6]").s("triangle").decay(0.035).sustain(0).lpf(3500).gain(0.07).pan(0.35)
      const bass = note("<[c2 ~ g2 ~] [a2 ~ e2 ~] [d2 ~ a2 ~] [g2 ~ d2 ~] [c2 ~ g2 ~] [c2 ~ e2 ~] [f2 ~ c3 ~] [g2 ~ b2 ~]>")
        .s("sawtooth").decay(0.2).sustain(0.25).release(0.05).lpf(saw.range(420, 1600).slow(33)).lpq(4).gain(0.42)
      const walk = note("<[c3 e3 g3 a3] [a2 c#3 e3 g3] [d3 f#3 a3 c4] [g2 b2 d3 f3] [c3 e3 g3 a3] [c3 e3 g3 bb3] [f2 a2 c3 d3] [g2 b2 d3 g3]>")
        .s("sawtooth").decay(0.12).sustain(0.15).release(0.04).lpf(saw.range(500, 1400).slow(33)).gain(0.16)
      const chords = "<[e3,g3,c4] [e3,g3,a3,c#4] [f#3,a3,c4,d4] [f3,g3,b3,d4] [e3,g3,c4] [e3,g3,bb3,c4] [f3,a3,c4] [f3,g3,b3,d4]>"
      const stride = note(chords).struct("~ x ~ x").s("triangle").decay(0.16).sustain(0.05).release(0.06).gain(0.13).room(0.2)
      const honky = note(chords).add(note(12)).struct("~ x ~ x").s("square").decay(0.08).sustain(0).lpf(2200).gain(0.035).pan(0.6)
      const brass = note(chords).struct("~ ~ ~ x ~ ~ x ~").s("sawtooth").decay(0.12).sustain(0.15).release(0.05)
        .lpf(saw.range(1000, 2600).slow(33)).gain(0.05).pan(0.4)
      const pad = note(chords).s("sawtooth").attack(0.25).release(0.4).lpf(1100).gain(0.04).room(0.4)
      const tune = "<[g4 c5 e5 g5 ~ e5 g5 c6] [c#6 ~ a5 e5 g5 ~ e5 c#5] [d5 f#5 a5 d6 ~ c6 a5 f#5] [g5 ~ f5 d5 b4 d5 f5 ~] [e5 g5 c6 ~ e6 ~ d6 c6] [bb5 ~ g5 e5 c5 e5 g5 bb5] [a5 c6 ~ a5 f5 ~ a5 c6] [b5 ~ d6 ~ g5 f5 d5 b4]>"
      const rag = note(tune).s("square").decay(0.13).sustain(0.2).release(0.06).lpf(2500).gain(0.075).room(0.2).pan(0.55)
      const glock = note(tune).add(note(12)).s("triangle").decay(0.12).sustain(0).lpf(4200).gain(0.05)
        .delay(0.2).delaytime(0.341).delayfeedback(0.25).pan(0.65)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.14).sustain(0.25).release(0.05).lpf(1400).gain(0.055).pan(0.45)
      const arp = note("<[c5 e5 g5 e5]*4 [c#5 e5 a5 e5]*4 [d5 f#5 a5 f#5]*4 [d5 f5 g5 b5]*4 [c5 e5 g5 e5]*4 [c5 e5 bb5 e5]*4 [c5 f5 a5 f5]*4 [d5 f5 g5 b5]*4>")
        .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(900, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, stride, rag)],
      [8, stack(kick, clap, hats, block, bass, walk, stride, honky, rag, pad)],
      [8, stack(kick, clap, hats, shaker, block, bass, walk, stride, honky, brass, rag, glock, pad)],
      [9, stack(kick2, clap, hats, shaker, block, bass, walk, stride, honky, brass, rag, glock, low, arp, pad, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- how far the park has scrolled by time t ----
    const N = Math.ceil(70 / STEP);
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + speedAt((i - 0.5) * STEP) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, N - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };
    const tAtS = (s) => {
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] < s) lo = m;
        else hi = m;
      }
      return lo * STEP;
    };
    const END_S = cumAt(66) + H;

    // ---- the scent the dog follows, and a reference route for the walker ----
    const RES = 2;
    const NS = Math.ceil(END_S / RES) + 4;
    const XMIN = EDGE + 28;
    const XMAX = W - EDGE - 28;
    const smooth = (pts, out) => {
      let j = 0;
      for (let i = 0; i < NS; i++) {
        const s = i * RES;
        while (j < pts.length - 2 && pts[j + 1].s < s) j++;
        const a = pts[j];
        const b = pts[j + 1];
        const u = clamp((s - a.s) / (b.s - a.s), 0, 1);
        out[i] = lerp(a.x, b.x, u * u * (3 - 2 * u));
      }
    };
    const trail = new Float32Array(NS);
    const route = new Float32Array(NS);
    const at = (arr, s) => {
      const f = clamp(s / RES, 0, NS - 1.001);
      const i = Math.floor(f);
      return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
    };
    const trailAt = (s) => at(trail, s);
    const routeAt = (s) => at(route, s);

    const tpts = [{ s: -10, x: W / 2 }, { s: 560, x: W / 2 }];
    const lunges = [];
    {
      let s = 560;
      let x = W / 2;
      let lastLunge = 0;
      while (s < END_S + 200) {
        const t = tAtS(s);
        const p = progress(t, 60, 1.2);
        const v = speedAt(t);
        if (t > 15 && s - lastLunge > 650 && plan.chance(lerp(0.2, 0.34, p))) {
          // a squirrel! the dog lunges sideways after it, then trots back
          const side = x < W / 2 ? (plan.chance(0.75) ? 1 : -1) : plan.chance(0.75) ? -1 : 1;
          const xl = clamp(x + side * plan.range(105, 150), XMIN - 6, XMAX + 6);
          tpts.push({ s: s + 60, x: xl });
          lunges.push({ s: s + 60, x: xl, side: Math.sign(xl - x) || side });
          s += 60 + plan.range(100, 130);
          x = clamp(xl - side * plan.range(30, 90), XMIN, XMAX);
          tpts.push({ s, x });
          lastLunge = s;
          continue;
        }
        const ds = lerp(150, 88, p) * plan.range(0.8, 1.2);
        const amp = s < 950 ? 40 : Math.min(150, ((0.55 * SPEED) / v) * ds);
        let nx = x + plan.range(-1, 1) * amp;
        if (nx < XMIN || nx > XMAX) nx = 2 * x - nx;
        x = clamp(nx, XMIN, XMAX);
        s += ds;
        tpts.push({ s, x });
      }
      smooth(tpts, trail);
      // the walker's reference route: the scent, nudged to one side now and then
      const opts = [{ s: -10, x: 0 }];
      for (let s = 700; s < END_S + 400; s += plan.range(200, 300)) opts.push({ s, x: plan.chance(0.4) ? 0 : plan.range(18, 44) * (plan.chance(0.5) ? 1 : -1) });
      opts.push({ s: END_S + 2000, x: 0 });
      smooth(opts, route);
      for (let i = 0; i < NS; i++) route[i] = clamp(trail[i] + route[i], XMIN - 4, XMAX + 4);
    }

    // ---- the park: tall posts the leash can snag, low things only you can trip on ----
    let objs = [];
    {
      const minTrail = (s, x) => {
        let m = Infinity;
        for (let j = -36; j <= 36; j += 6) m = Math.min(m, Math.abs(x - trailAt(s + j)));
        return m;
      };
      const minRoute = (s, x) => {
        let m = Infinity;
        for (let j = -24; j <= 24; j += 6) m = Math.min(m, Math.abs(x - routeAt(s + j)));
        return m;
      };
      const fits = (kind, s, x) => {
        for (const o of objs) {
          const ds = s - o.s;
          if (Math.abs(ds) > 140) continue;
          const dx = Math.abs(x - o.x);
          const wide = (k) => (k === 'bench' ? 34 : k === 'planter' ? 20 : k === 'tree' ? 12 : 8);
          if (dx < wide(kind) + wide(o.kind) + 16 && Math.abs(ds) < 44) return false;
          // nothing hidden behind a tree's canopy
          if (o.kind === 'tree' && ds > 0 && ds < 78 && dx < 46) return false;
          if (kind === 'tree' && ds < 0 && ds > -78 && dx < 46) return false;
        }
        return true;
      };
      let rs = 650;
      let slalom = 1;
      while (rs < END_S - 100) {
        const t = tAtS(rs);
        const p = progress(t, 60, 1.2);
        const n = 1 + (plan.chance(0.35 + p * 0.5) ? 1 : 0) + (plan.chance(p * 0.55 - 0.1) ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const r = plan.next();
          const kind = t > 9 && r < 0.15 ? 'bench' : t > 5 && r < 0.27 ? 'planter' : plan.pick(['lamp', 'lamp', 'tree', 'bollard', 'bollard']);
          const s = rs + plan.range(-10, 10);
          const T = trailAt(s);
          const P = routeAt(s);
          for (let tries = 0; tries < 14; tries++) {
            let x;
            if (TALL[kind]) {
              // half the posts stand right beside the scent, on alternating sides
              if (plan.chance(0.55)) {
                slalom = -slalom;
                x = T + slalom * plan.range(28, 50);
              } else x = plan.range(EDGE + 12, W - EDGE - 12);
              if (x < EDGE + 10 || x > W - EDGE - 10) continue;
              if (minTrail(s, x) < 26 || minRoute(s, x) < 28) continue;
              if (x > Math.min(T, P) - 16 && x < Math.max(T, P) + 16) continue;
            } else if (kind === 'bench') {
              // benches can stand on the scent: the dog trots underneath
              x = plan.chance(0.5) ? T + plan.range(-12, 12) : plan.range(EDGE + 36, W - EDGE - 36);
              if (x < EDGE + 36 || x > W - EDGE - 36) continue;
              if (minRoute(s, x) < 56) continue;
            } else {
              x = plan.range(EDGE + 22, W - EDGE - 22);
              if (minRoute(s, x) < 42) continue;
            }
            if (!fits(kind, s, x)) continue;
            objs.push({ kind, s, x, v: plan.int(0, 2) });
            break;
          }
        }
        rs += lerp(118, 58, p) * plan.range(0.85, 1.15);
      }
      objs.sort((a, b) => a.s - b.s);
    }

    let joggers = [];
    {
      let tc = 25;
      while (tc < 61) {
        const sc = cumAt(tc);
        const xr = routeAt(sc);
        const td = tc - DOGD / (speedAt(tc) + JOG_V);
        const xd = trailAt(cumAt(td) + DOGD);
        for (let tries = 0; tries < 16; tries++) {
          const x = plan.range(EDGE + 16, W - EDGE - 16);
          if (Math.abs(x - xr) < 40 || Math.abs(x - xd) < 34) continue;
          // a clear lane: joggers don't run through benches and lamp posts
          const sTop = sc + JOG_V * 3.2;
          if (objs.some((o) => o.s > sc - 60 && o.s < sTop && Math.abs(o.x - x) < (o.kind === 'bench' ? 50 : 30))) continue;
          joggers.push({ kind: 'jogger', sc, tc, x, v: plan.int(0, 1) });
          break;
        }
        tc += lerp(4.2, 2.2, progress(tc, 60, 1)) * plan.range(0.8, 1.2);
      }
    }
    const jogS = (j, t) => j.sc + JOG_V * (j.tc - t);

    // ---- the walk itself: the same physics for the player and the reference walker ----
    const newState = () => ({ px: W / 2, vx: 0, dogX: W / 2, pull: 0, lo: 0 });
    const stepState = (st, t, dt, dir) => {
      const base = cumAt(t);
      st.vx += (dir * SPEED - st.vx) * Math.min(1, 20 * dt);
      const want = trailAt(base + DOGD);
      st.dogX += clamp((want - st.dogX) * 9, -340, 340) * dt;
      const d = st.dogX - st.px;
      const ex = Math.abs(d) - SLACK;
      st.pull = ex > 0 ? Math.sign(d) * Math.min(200, ex * PULL_K) : 0;
      st.px += (st.vx + st.pull) * dt;
      const lo = EDGE + PLAYER_R;
      const hi = W - EDGE - PLAYER_R;
      if (st.px < lo) {
        st.px = lo;
        if (st.vx < 0) st.vx = 0;
      } else if (st.px > hi) {
        st.px = hi;
        if (st.vx > 0) st.vx = 0;
      }
      st.dogX = clamp(st.dogX, st.px - REACH, st.px + REACH);
      st.dogX = clamp(st.dogX, EDGE + 8, W - EDGE - 8);
    };
    const hand = (st) => [st.px + 12, PY - 18];
    const collar = (st) => [st.dogX, DOGY - 6];
    const testTall = (st, x, y, r, m) => {
      if (Math.hypot(st.px - x, PY - y) < r + PLAYER_R + m) return 'you';
      if (Math.hypot(st.dogX - x, DOGY - y) < r + DOG_R + m) return 'dog';
      const [hx, hy] = hand(st);
      const [cx, cy] = collar(st);
      if (segDist(x, y, hx, hy, cx, cy) < r + 1.5 + m) return 'leash';
      return null;
    };
    const hitTest = (st, t, m) => {
      const base = cumAt(t);
      while (st.lo < objs.length && objs[st.lo].s < base - 60) st.lo++;
      for (let i = st.lo; i < objs.length && objs[i].s < base + DOGD + 40; i++) {
        const o = objs[i];
        const y = PY - (o.s - base);
        if (TALL[o.kind]) {
          const what = testTall(st, o.x, y, TALL[o.kind], m);
          if (what) return { o, what };
        } else if (o.kind === 'bench') {
          const nx = clamp(st.px, o.x - 32 - m, o.x + 32 + m);
          const ny = clamp(PY, y - 9 - m, y + 9 + m);
          if (Math.hypot(st.px - nx, PY - ny) < PLAYER_R) return { o, what: 'you' };
        } else if (Math.hypot(st.px - o.x, PY - y) < 16 + PLAYER_R + m) return { o, what: 'you' };
      }
      for (const j of joggers) {
        const y = PY - (jogS(j, t) - base);
        if (y < DOGY - 40 || y > PY + 40) continue;
        const what = testTall(st, j.x, y, TALL.jogger, m);
        if (what) return { o: j, what };
      }
      return null;
    };

    // walk the reference route; whatever trips it up is taken out of the park, until it gets through
    for (let pass = 0; pass < 120; pass++) {
      const st = newState();
      let hit = null;
      for (let i = 0; i < 60 / STEP && !hit; i++) {
        const t = i * STEP;
        const base = cumAt(t + STEP);
        const look = routeAt(base + speedAt(t) * 0.16);
        const dir = look - st.px > 4 ? 1 : look - st.px < -4 ? -1 : 0;
        stepState(st, t + STEP, STEP, dir);
        if (t > 2) hit = hitTest(st, t + STEP, 3);
      }
      if (!hit) break;
      objs = objs.filter((o) => o !== hit.o);
      joggers = joggers.filter((o) => o !== hit.o);
    }

    // ---- art ----
    const lawn = paintLawn(W, H, art);
    const sunlight = paintSunlight(W, H);
    const lamp = paintLamp();
    const trees = [
      ['#ffc070', '#e8862f', '#a24f1c'],
      ['#ffe08a', '#f2b53a', '#b8761c'],
      ['#ff9a70', '#c9472b', '#7e2414'],
    ].map((c) => paintTree(c, art));
    const bollard = paintBollard();
    const bench = paintBench();
    const planters = [
      ['#e8436a', '#ff8fb0', '#ffffff'],
      ['#8c5ae0', '#c9a2ff', '#ffd34a'],
      ['#ff7a3d', '#ffd34a', '#ffffff'],
    ].map((f) => paintPlanter(art, f));
    const walkers = [paintWalker(0), paintWalker(1)];
    const dogs = [paintDog(0), paintDog(1)];
    const tail = paintTail();
    const kits = [
      { top0: '#3fe0d0', top1: '#1590a8', shoe: '#ff5a8a', hair: '#2a1a10', band: '#ff5a8a' },
      { top0: '#ff8a5a', top1: '#d93a6a', shoe: '#3fd0ff', hair: '#e8b860', band: '#ffe14a' },
    ];
    const joggerArt = kits.map((k) => [paintJogger(0, k), paintJogger(1, k)]);
    const squirrel = paintSquirrel();
    const pigeonArt = [paintPigeon(0), paintPigeon(1)];
    const lampGlow = glowSprite('rgba(255,210,120,0.6)', 26);
    const redGlow = glowSprite('rgba(255,60,50,0.7)', 26);
    const sunGlow = glowSprite('rgba(255,236,170,0.5)', 40);
    const vignette = vignetteSprite(W, H, 0.42, '20,30,10');

    // cosmetic pigeons pecking on the grass (they flap off when the dog comes near)
    const flocks = [];
    for (let s = 500; s < END_S; s += art.range(380, 700)) {
      const x = art.range(EDGE + 30, W - EDGE - 30);
      const birds = [];
      const n = art.int(2, 4);
      for (let i = 0; i < n; i++) birds.push({ dx: art.range(-18, 18), ds: art.range(-14, 14), fly: false, fx: 0, fy: 0, vx: 0, vy: 0, ph: art.range(0, TAU) });
      flocks.push({ s, x, birds });
    }
    const squirrels = lunges.map((l) => ({ ...l, run: false, rx: 0, ry: 0 }));

    // ---- cosmetic state ----
    const fx = createParticles();
    const motes = createParticles();

    // ---- run state ----
    const st = newState();
    let time = 0;
    let clock = 0;
    let base = 0;
    let walkPh = 0;
    let dogPh = 0;
    let culprit = null;
    let shake = 0;
    let fallen = 0;
    let stepTick = 0;

    const objY = (o) => PY - (o.s - base);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir) {
        if (this.dead) return;
        time += dt;
        clock += dt;
        stepState(st, time, dt, dir);
        base = cumAt(time);
        const v = speedAt(time);
        walkPh += dt * (v / 34 + Math.abs(st.vx) / 90);
        dogPh += dt * (v / 22 + Math.abs(st.dogX - trailAt(base + DOGD)) / 30);

        const hit = time > 0.5 ? hitTest(st, time, 0) : null;
        if (hit) {
          culprit = hit;
          const { o, what } = hit;
          const name = o.kind === 'jogger' ? 'a jogger' : NAMES[o.kind];
          if (what === 'leash') this.die(o.kind === 'jogger' ? 'Your leash tripped up a jogger.' : `The leash wrapped round ${name}.`);
          else if (what === 'dog') this.die(o.kind === 'jogger' ? 'Your dog bowled over a jogger.' : `Your dog got tangled round ${name}.`);
          else if (o.kind === 'bench') this.die('Tripped over a park bench.');
          else if (o.kind === 'planter') this.die('Tripped into a flower tub.');
          else if (o.kind === 'jogger') this.die('Ran smack into a jogger.');
          else this.die(`Walked straight into ${name}.`);
          return;
        }

        // footsteps kick up leaves
        stepTick += dt;
        if (stepTick > 0.16) {
          stepTick = 0;
          if (Math.random() < 0.5) fx.burst(st.dogX, DOGY + 10, { count: 1, speed: 40, life: 0.6, size: 3.2, colors: LEAF_COLS, angle: Math.PI / 2, spread: 2, drag: 2 });
          if (Math.abs(st.vx) > 120) fx.burst(st.px, PY + 14, { count: 2, speed: 50, life: 0.5, size: 2.6, colors: LEAF_COLS, angle: Math.PI / 2, spread: 2.4, drag: 2.5 });
        }
        if (Math.abs(st.pull) > 60 && Math.random() < dt * 12) {
          fx.burst(st.px - Math.sign(st.pull) * 6, PY + 14, { count: 2, speed: 60, life: 0.4, size: 2.4, colors: ['#e8d8b0', '#c8b890'], angle: Math.PI / 2 - Math.sign(st.pull) * 0.8, spread: 0.8, drag: 3 });
        }
        if (Math.random() < dt * 6) {
          const s = base + DOGD + Math.random() * (PY + 40);
          motes.burst(trailAt(s) + (Math.random() - 0.5) * 10, PY - (s - base), { count: 1, speed: 6, life: 1.2, size: 2.4, colors: ['rgba(255,250,200,0.9)', 'rgba(220,255,170,0.9)'], round: true });
        }
        this.cosmetics(dt, v);
      },

      cosmetics(dt, v) {
        for (const f of flocks) {
          const y = PY - (f.s - base);
          if (y < -60 || y > H + 60) continue;
          for (const b of f.birds) {
            if (!b.fly) {
              const bx = f.x + b.dx;
              const by = y - b.ds;
              if (Math.hypot(bx - st.dogX, by - DOGY) < 80 || Math.hypot(bx - st.px, by - PY) < 50) {
                b.fly = true;
                b.fx = bx;
                b.fy = by;
                const away = Math.sign(bx - st.dogX) || 1;
                b.vx = away * (90 + Math.random() * 80);
                b.vy = -(140 + Math.random() * 90) - v;
              }
            } else {
              b.fx += b.vx * dt;
              b.fy += (b.vy + v) * dt;
              b.vy -= 30 * dt;
            }
          }
        }
        for (const q of squirrels) {
          const y = PY - (q.s - base);
          if (!q.run && q.s - (base + DOGD) < 70) {
            q.run = true;
            q.rx = q.x;
            q.ry = y;
          }
          if (q.run) {
            q.rx += q.side * 360 * dt;
            q.ry += (v - 40) * dt;
          }
        }
        fx.update(dt, v);
        motes.update(dt, v);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = 0.4;
        const { o, what } = culprit;
        const y = o.kind === 'jogger' ? PY - (jogS(o, time) - base) : objY(o);
        const px = what === 'you' ? st.px : what === 'dog' ? st.dogX : o.x;
        const py = what === 'you' ? PY : what === 'dog' ? DOGY : y;
        fx.burst(px, py, { count: 34, speed: 200, life: 0.9, size: 4, colors: LEAF_COLS, drag: 2.2 });
        fx.burst(px, py, { count: 12, speed: 140, life: 0.6, size: 3, colors: ['#ffffff', '#fff2b0'], drag: 3, round: true });
      },

      afterlife(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        fallen = Math.min(1, fallen + dt / 0.35);
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

        const off = base % H;
        g.drawImage(lawn.canvas, 0, off - H, W, H);
        g.drawImage(lawn.canvas, 0, off, W, H);

        // the scent the dog is following, shimmering ahead of it
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const [lw, col] of [[12, 'rgba(255,245,180,0.13)'], [3.5, 'rgba(255,252,215,0.32)']]) {
          g.strokeStyle = col;
          g.lineWidth = lw;
          g.beginPath();
          for (let y = DOGY - 6, first = true; y > -20; y -= 8) {
            const s = base + (PY - y);
            const x = trailAt(s) + Math.sin(s * 0.05 + clock * 3) * 2;
            if (first) g.moveTo(x, y);
            else g.lineTo(x, y);
            first = false;
          }
          g.stroke();
        }
        motes.render(g, true);

        // everything standing in the park, back to front
        const items = [];
        for (const o of objs) {
          const y = objY(o);
          if (y < -110) break;
          if (y > H + 60) continue;
          items.push({ y, o });
        }
        for (const j of joggers) {
          const y = PY - (jogS(j, time) - base);
          if (y > -60 && y < H + 60) items.push({ y, o: j });
        }
        items.push({ y: DOGY, o: 'dog' }, { y: PY, o: 'you' });
        items.sort((a, b) => a.y - b.y);

        const pulse = 0.5 + 0.5 * Math.sin(clock * 10);
        const [hx, hy] = hand(st);
        const [cx, cy] = collar(st);
        const leashX = (y) => lerp(cx, hx, clamp((y - cy) / (hy - cy), 0, 1));

        // pigeons (behind everything tall)
        for (const f of flocks) {
          const y = PY - (f.s - base);
          if (y < -80 || y > H + 40) continue;
          for (const b of f.birds) {
            if (b.fly) {
              if (b.fy > -30) drawSprite(g, pigeonArt[Math.floor(clock * 14 + b.ph) % 2], b.fx, b.fy, { size: 20 });
            } else {
              const peck = Math.sin(clock * 5 + b.ph) > 0.6 ? 1.5 : 0;
              drawSprite(g, pigeonArt[0], f.x + b.dx, y - b.ds + peck, { size: 15 });
            }
          }
        }
        // squirrels
        for (const q of squirrels) {
          if (q.run) {
            if (q.rx > EDGE - 10 && q.rx < W - EDGE + 10) drawSprite(g, squirrel, q.rx, q.ry + Math.abs(Math.sin(clock * 22)) * -3, { size: 22 });
          } else {
            const y = PY - (q.s - base);
            if (y > -30 && y < H) {
              g.save();
              g.translate(q.x, y);
              if (q.side < 0) g.scale(-1, 1);
              g.drawImage(squirrel.canvas, -11, -13 + Math.sin(clock * 8) * 0.8, 22, 26);
              g.restore();
            }
          }
        }

        for (const it of items) {
          const { o, y } = it;
          if (o === 'dog') {
            const strain = clamp((Math.abs(st.dogX - st.px) - SLACK) / (REACH - SLACK), 0, 1);
            const lean = clamp((trailAt(base + DOGD) - st.dogX) / 60, -1, 1);
            const bob = Math.abs(Math.sin(dogPh * Math.PI)) * 1.5;
            const wag = Math.sin(clock * 22) * 0.9;
            g.save();
            g.translate(st.dogX, DOGY - bob);
            g.rotate(lean * 0.35);
            drawSprite(g, tail, wag * 2.5, 18, { rot: wag * 0.5, size: 8 });
            const d = dogs[Math.floor(dogPh) % 2];
            g.drawImage(d.canvas, -d.w / 2, -d.h / 2, d.w, d.h);
            g.restore();
            if (strain > 0.2 && !this.dead) {
              g.fillStyle = `rgba(255,255,255,${0.5 * strain})`;
              for (let k = 0; k < 3; k++) {
                const a = -Math.PI / 2 + (k - 1) * 0.5;
                g.fillRect(st.dogX + Math.cos(a) * 20 - 1, DOGY - 18 + Math.sin(a) * 12, 2, 5);
              }
            }
            // a "!" when a squirrel is close
            const sq = squirrels.find((q) => !q.run && q.s - (base + DOGD) < 260);
            if (sq && !this.dead) {
              g.fillStyle = '#fff8e8';
              g.beginPath();
              g.arc(st.dogX + 14, DOGY - 30, 8, 0, TAU);
              g.fill();
              g.fillStyle = '#e8562a';
              g.font = `bold 12px ${BODY_FONT}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText('!', st.dogX + 14, DOGY - 29.5);
            }
            continue;
          }
          if (o === 'you') {
            const w = walkers[Math.floor(walkPh) % 2];
            const tilt = clamp(st.vx / SPEED, -1, 1) * 0.12 + clamp(st.pull / 200, -1, 1) * 0.2;
            const fall = culprit && culprit.what === 'you' ? fallen : 0;
            g.save();
            g.translate(st.px, PY - 4 + fall * 6);
            g.rotate(tilt + fall * (culprit && culprit.o.x < st.px ? 1.3 : -1.3));
            g.drawImage(w.canvas, -w.w / 2, -w.h / 2, w.w, w.h);
            g.restore();
            continue;
          }
          // tall things the leash can catch on glow red when the leash is closing on them
          if (TALL[o.kind] && !this.dead && y > cy - 12 && y < hy + 30) {
            if (Math.abs(leashX(y) - o.x) < TALL[o.kind] + 20) drawSprite(g, redGlow, o.x, y, { size: 44, alpha: 0.5 + 0.4 * pulse });
          }
          if (culprit && culprit.o === o) drawSprite(g, redGlow, o.x, y, { size: 60, alpha: 0.6 + 0.4 * pulse });
          if (o.kind === 'lamp') {
            g.fillStyle = 'rgba(20,40,10,0.28)';
            g.beginPath();
            g.ellipse(o.x + 14, y + 6, 22, 4, 0.25, 0, TAU);
            g.fill();
            drawSprite(g, lamp, o.x, y - 36);
          } else if (o.kind === 'tree') {
            g.fillStyle = 'rgba(20,40,10,0.25)';
            g.beginPath();
            g.ellipse(o.x + 18, y + 2, 30, 12, 0.2, 0, TAU);
            g.fill();
            drawSprite(g, trees[o.v], o.x, y - 42);
          } else if (o.kind === 'bollard') {
            g.fillStyle = 'rgba(20,40,10,0.28)';
            g.beginPath();
            g.ellipse(o.x + 6, y + 3, 9, 3, 0.25, 0, TAU);
            g.fill();
            drawSprite(g, bollard, o.x, y - 12);
          } else if (o.kind === 'bench') {
            drawSprite(g, bench, o.x, y - 4);
          } else if (o.kind === 'planter') {
            drawSprite(g, planters[o.v], o.x, y - 4, { size: 44 });
          } else if (o.kind === 'jogger') {
            const fr = joggerArt[o.v][Math.floor(clock * 8) % 2];
            drawSprite(g, fr, o.x, y - 6);
          }
        }

        // lamp glows
        g.globalCompositeOperation = 'lighter';
        for (const it of items) {
          if (it.o.kind === 'lamp') drawSprite(g, lampGlow, it.o.x, it.y - 68, { size: 40, alpha: 0.55 + 0.1 * Math.sin(clock * 3 + it.o.s) });
        }
        g.globalCompositeOperation = 'source-over';

        // the leash
        {
          const taut = Math.abs(st.dogX - st.px) > SLACK;
          const dx = cx - hx;
          const dy = cy - hy;
          const len = Math.hypot(dx, dy) || 1;
          const sag = taut ? 0 : (1 - Math.abs(st.dogX - st.px) / SLACK) * 9 + Math.sin(clock * 4) * 1.5;
          const mx = (hx + cx) / 2 + (-dy / len) * sag;
          const my = (hy + cy) / 2 + (dx / len) * sag;
          const bad = culprit && culprit.what === 'leash';
          g.strokeStyle = 'rgba(20,30,10,0.25)';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(hx + 3, hy + 5);
          g.quadraticCurveTo(mx + 3, my + 5, cx + 3, cy + 5);
          g.stroke();
          g.strokeStyle = bad ? `rgba(255,${60 + 80 * pulse},60,1)` : taut ? '#ff5a3a' : '#e0392b';
          g.lineWidth = taut ? 3 : 2.4;
          g.beginPath();
          g.moveTo(hx, hy);
          g.quadraticCurveTo(mx, my, cx, cy);
          g.stroke();
          g.strokeStyle = 'rgba(255,220,200,0.6)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(hx - 0.8, hy - 0.8);
          g.quadraticCurveTo(mx - 0.8, my - 0.8, cx - 0.8, cy - 0.8);
          g.stroke();
          if (bad && culprit.o.kind !== 'jogger') {
            const y = objY(culprit.o);
            g.strokeStyle = '#e0392b';
            g.lineWidth = 2.4;
            g.beginPath();
            g.ellipse(culprit.o.x, y - 6, TALL[culprit.o.kind] + 4, 4, 0, 0, TAU);
            g.stroke();
          }
        }

        fx.render(g);
        drawSprite(g, sunlight, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 10, 10, { size: 220, alpha: 0.6 });
        g.globalCompositeOperation = 'source-over';
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
