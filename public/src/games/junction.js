// Jungle Junction — a little red steam train runs up a jungle railway that keeps forking and
// merging, and you never touch the throttle or the wheel: ← and → only throw the points. The
// lever is shared by every set of points on the line, so whichever way it's thrown is the branch
// the engine takes at the next fork. Boulders, fallen trees, buffer stops at the end of sidings
// and broken bridges block branches, and from 14s rocks tumble down onto the line (a shadow and
// a red ring warn first). A glowing route shows where the lever will send you over the next
// two forks. Every layout is built so that from any clear branch there is always a clear way on.

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

const X = [84, 180, 276]; // the three track lines
const J = 110; // length of the fork / crossover at the start of each section
const TRAIN_Y = 462; // where the engine's nose sits on screen
const LOCO_L = 62;
const CAR_L = 44;
const GAP = 5;
const GAUGE = 7;
const SLEEPER = 14;
const TILE_H = 480;
const EDGE_H = 600;

const vAt = (t) => lerp(150, 335, progress(t, 60, 1.2));
const smooth = (u) => u * u * (3 - 2 * u);

const REASONS = {
  rock: 'Ploughed into a boulder on the line.',
  fall: 'Hit a rock that tumbled onto the line.',
  log: 'Hit a fallen tree across the track.',
  buffers: 'Ran into the buffers at the end of a siding.',
  bridge: 'Took the broken bridge into the river.',
};

// ---------- art ----------

function wrapY(h, y, draw) {
  draw(y);
  if (y < 60) draw(y + h);
  if (y > h - 60) draw(y - h);
}

function leafShape(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(wid, -len * 0.45, 0, -len);
  g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
  g.closePath();
}

function paintGround(rng) {
  return makeSprite(360, TILE_H, (g) => {
    g.translate(-180, -TILE_H / 2);
    const base = g.createLinearGradient(0, 0, 360, TILE_H);
    base.addColorStop(0, '#1f4a29');
    base.addColorStop(0.5, '#24522c');
    base.addColorStop(1, '#1c4426');
    g.fillStyle = base;
    g.fillRect(0, 0, 360, TILE_H);
    // mottled soil and moss
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, 360);
      const y = rng.range(0, TILE_H);
      const r = rng.range(10, 34);
      const dark = rng.chance(0.55);
      wrapY(TILE_H, y, (yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
        gr.addColorStop(0, dark ? 'rgba(14,34,18,0.35)' : 'rgba(70,120,50,0.22)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
    // leaf litter
    const litter = ['#3d7a3a', '#2f6a32', '#5c8f3c', '#7a6a2e', '#8a5a2a', '#4a8840'];
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, 360);
      const y = rng.range(0, TILE_H);
      const rot = rng.range(0, Math.PI * 2);
      const len = rng.range(5, 11);
      const col = rng.pick(litter);
      wrapY(TILE_H, y, (yy) => {
        g.save();
        g.translate(x, yy);
        g.rotate(rot);
        g.fillStyle = col;
        g.globalAlpha = 0.75;
        leafShape(g, len, len * 0.4);
        g.fill();
        g.globalAlpha = 0.4;
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 0.5;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -len);
        g.stroke();
        g.restore();
      });
    }
    g.globalAlpha = 1;
    // ferns
    for (let i = 0; i < 18; i++) {
      const x = rng.range(0, 360);
      const y = rng.range(0, TILE_H);
      const n = rng.int(6, 9);
      const size = rng.range(16, 28);
      const tone = rng.range(0, 1);
      const fronds = [];
      for (let k = 0; k < n; k++) fronds.push([(k / n) * Math.PI * 2 + rng.range(-0.2, 0.2), size * rng.range(0.75, 1.1)]);
      wrapY(TILE_H, y, (yy) => {
        for (const [a, len] of fronds) {
          g.save();
          g.translate(x, yy);
          g.rotate(a);
          g.strokeStyle = `rgb(${Math.round(lerp(40, 80, tone))},${Math.round(lerp(110, 150, tone))},${Math.round(lerp(45, 60, tone))})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(3, -len * 0.5, 0, -len);
          g.stroke();
          g.fillStyle = `rgba(${Math.round(lerp(40, 75, tone))},${Math.round(lerp(105, 140, tone))},${Math.round(lerp(42, 55, tone))},0.7)`;
          for (let s = 0.2; s < 0.95; s += 0.13) {
            const w = (1 - s) * 5 + 1.5;
            g.beginPath();
            g.ellipse(-w * 0.7, -len * s, w, 1.6, -0.5, 0, Math.PI * 2);
            g.ellipse(w * 0.7 + 1, -len * s, w, 1.6, 0.5, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
        }
      });
    }
    // flowers
    const petals = ['#ff6fa0', '#ffb23a', '#ffffff', '#ff5a3a', '#c98aff'];
    for (let i = 0; i < 34; i++) {
      const x = rng.range(0, 360);
      const y = rng.range(0, TILE_H);
      const col = rng.pick(petals);
      const r = rng.range(1.6, 2.6);
      wrapY(TILE_H, y, (yy) => {
        g.fillStyle = col;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * r, yy + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffe36a';
        g.beginPath();
        g.arc(x, yy, r * 0.6, 0, Math.PI * 2);
        g.fill();
      });
    }
    // mossy stones
    for (let i = 0; i < 12; i++) {
      const x = rng.range(0, 360);
      const y = rng.range(0, TILE_H);
      const r = rng.range(3, 6);
      wrapY(TILE_H, y, (yy) => {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(x + 1.5, yy + 1.5, r, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        const sg = g.createLinearGradient(x - r, yy - r, x + r, yy + r);
        sg.addColorStop(0, '#9a9a88');
        sg.addColorStop(1, '#4e5048');
        g.fillStyle = sg;
        g.beginPath();
        g.ellipse(x, yy, r, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(90,150,60,0.7)';
        g.beginPath();
        g.ellipse(x - r * 0.3, yy - r * 0.3, r * 0.6, r * 0.35, -0.4, 0, Math.PI * 2);
        g.fill();
      });
    }
  }, 2);
}

function paintEdge(rng, flip) {
  return makeSprite(96, EDGE_H, (g) => {
    g.translate(-48, -EDGE_H / 2);
    if (flip) {
      g.translate(96, 0);
      g.scale(-1, 1);
    }
    // dark undergrowth hugging the edge
    const dark = g.createLinearGradient(0, 0, 70, 0);
    dark.addColorStop(0, 'rgba(6,22,10,0.95)');
    dark.addColorStop(0.55, 'rgba(10,32,14,0.6)');
    dark.addColorStop(1, 'rgba(10,32,14,0)');
    g.fillStyle = dark;
    g.fillRect(0, 0, 70, EDGE_H);
    const greens = [
      ['#1d5a2a', '#2f8a3c', '#5cb85a'],
      ['#174a24', '#28763a', '#4aa04c'],
      ['#235f2c', '#3a9848', '#7ccc6a'],
    ];
    for (let i = 0; i < 26; i++) {
      const y = rng.range(0, EDGE_H);
      const x = rng.range(-6, 22);
      const len = rng.range(40, 78);
      const wid = len * rng.range(0.32, 0.45);
      const a = Math.PI / 2 + rng.range(-0.7, 0.7);
      const pal = rng.pick(greens);
      const splits = rng.chance(0.6);
      const cuts = [];
      for (let s = 0.3; s < 0.9; s += 0.16) cuts.push(s + rng.range(-0.04, 0.04));
      const draw = (yy) => {
        g.save();
        g.translate(x, yy);
        g.rotate(a);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.save();
        g.translate(4, 4);
        leafShape(g, len, wid);
        g.fill();
        g.restore();
        const lg = g.createLinearGradient(-wid, 0, wid, 0);
        lg.addColorStop(0, pal[0]);
        lg.addColorStop(0.5, pal[1]);
        lg.addColorStop(1, pal[0]);
        g.fillStyle = lg;
        leafShape(g, len, wid);
        g.fill();
        // monstera slits
        if (splits) {
          g.strokeStyle = 'rgba(8,28,12,0.9)';
          g.lineWidth = 1.6;
          for (const s of cuts) {
            g.beginPath();
            g.moveTo(wid * 0.25, -len * s);
            g.lineTo(wid * 0.75, -len * (s + 0.05));
            g.moveTo(-wid * 0.25, -len * s);
            g.lineTo(-wid * 0.75, -len * (s + 0.05));
            g.stroke();
          }
        }
        g.strokeStyle = pal[2];
        g.globalAlpha = 0.7;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(1.5, -len * 0.5, 0, -len * 0.95);
        g.stroke();
        g.globalAlpha = 1;
        g.restore();
      };
      draw(y);
      if (y < 90) draw(y + EDGE_H);
      if (y > EDGE_H - 90) draw(y - EDGE_H);
    }
    // a few hanging vines and red heliconia flowers
    for (let i = 0; i < 5; i++) {
      const y = rng.range(0, EDGE_H);
      const x = rng.range(14, 40);
      const draw = (yy) => {
        for (let k = 0; k < 4; k++) {
          g.fillStyle = k % 2 ? '#ff5a2a' : '#ffc23a';
          g.beginPath();
          g.moveTo(x + k * 3, yy + k * 7);
          g.lineTo(x + k * 3 + 9, yy + k * 7 + 3);
          g.lineTo(x + k * 3, yy + k * 7 + 6);
          g.closePath();
          g.fill();
        }
      };
      draw(y);
      if (y > EDGE_H - 40) draw(y - EDGE_H);
    }
  }, 2);
}

function paintDapple(rng) {
  const spots = [];
  for (let i = 0; i < 22; i++) spots.push([rng.range(0, 360), rng.range(0, EDGE_H), rng.range(40, 110), rng.chance(0.35)]);
  const shade = makeSprite(360, EDGE_H, (g) => {
    g.translate(-180, -EDGE_H / 2);
    for (const [x, y, r, sun] of spots) {
      if (sun) continue;
      wrapY(EDGE_H, y, (yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
        gr.addColorStop(0, 'rgba(0,18,6,0.28)');
        gr.addColorStop(1, 'rgba(0,18,6,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
  }, 1);
  const sun = makeSprite(360, EDGE_H, (g) => {
    g.translate(-180, -EDGE_H / 2);
    for (const [x, y, r, s] of spots) {
      if (!s) continue;
      wrapY(EDGE_H, y, (yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, r * 0.7);
        gr.addColorStop(0, 'rgba(255,236,160,0.16)');
        gr.addColorStop(1, 'rgba(255,236,160,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
  }, 1);
  return { shade, sun };
}

function makeLoco() {
  return makeSprite(30, 64, (g) => {
    g.lineJoin = 'round';
    // chassis and running boards
    g.fillStyle = '#231c20';
    g.beginPath();
    g.roundRect(-13, -26, 26, 56, 3);
    g.fill();
    // wheels peeking out at the sides
    g.fillStyle = '#121014';
    for (const y of [-16, -4, 8, 20]) {
      g.fillRect(-15, y - 3, 3, 6);
      g.fillRect(12, y - 3, 3, 6);
    }
    g.fillStyle = '#c9a23a';
    for (const y of [-16, -4, 8, 20]) {
      g.fillRect(-15, y - 0.6, 3, 1.2);
      g.fillRect(12, y - 0.6, 3, 1.2);
    }
    // cowcatcher
    const pg = g.createLinearGradient(0, -32, 0, -24);
    pg.addColorStop(0, '#ffd23a');
    pg.addColorStop(1, '#c2861c');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(-12, -24);
    g.lineTo(0, -32);
    g.lineTo(12, -24);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80,40,0,0.7)';
    g.lineWidth = 0.8;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(k * 4.5, -24);
      g.lineTo(k * 1.2, -30);
      g.stroke();
    }
    // boiler
    const bg = g.createLinearGradient(-9, 0, 9, 0);
    bg.addColorStop(0, '#5a0a0c');
    bg.addColorStop(0.25, '#b81c22');
    bg.addColorStop(0.45, '#ff6a5a');
    bg.addColorStop(0.6, '#d8282c');
    bg.addColorStop(1, '#5a0a0c');
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(-9, -24, 18, 34, 5);
    g.fill();
    // smokebox
    const sb = g.createLinearGradient(-9, 0, 9, 0);
    sb.addColorStop(0, '#111');
    sb.addColorStop(0.45, '#4a4650');
    sb.addColorStop(1, '#111');
    g.fillStyle = sb;
    g.beginPath();
    g.roundRect(-9, -25, 18, 8, 4);
    g.fill();
    // brass bands
    g.fillStyle = '#e8c04a';
    for (const y of [-16, -6, 4]) g.fillRect(-9, y, 18, 1.4);
    // chimney
    g.fillStyle = '#0c0a0c';
    g.beginPath();
    g.arc(0, -19, 4.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6a6470';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#2a1a14';
    g.beginPath();
    g.arc(0, -19, 2.6, 0, Math.PI * 2);
    g.fill();
    // domes
    const dome = (y, r) => {
      const dg = g.createRadialGradient(-r * 0.4, y - r * 0.4, 0.5, 0, y, r);
      dg.addColorStop(0, '#fff3b0');
      dg.addColorStop(0.5, '#e8b83a');
      dg.addColorStop(1, '#8a5a12');
      g.fillStyle = dg;
      g.beginPath();
      g.arc(0, y, r, 0, Math.PI * 2);
      g.fill();
    };
    dome(-9, 3.8);
    dome(0, 3);
    // headlamp
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(0, -26.5, 2, 0, Math.PI * 2);
    g.fill();
    // cab
    const cg = g.createLinearGradient(-12, 0, 12, 0);
    cg.addColorStop(0, '#0f3a1e');
    cg.addColorStop(0.4, '#2f8a4a');
    cg.addColorStop(0.55, '#5ab86a');
    cg.addColorStop(1, '#0f3a1e');
    g.fillStyle = '#f2e6c4';
    g.beginPath();
    g.roundRect(-12.5, 10, 25, 20, 3);
    g.fill();
    g.fillStyle = cg;
    g.beginPath();
    g.roundRect(-11.5, 11, 23, 18, 3);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, 11);
    g.lineTo(0, 29);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-7, 12, 3, 16);
  });
}

function makeCar(kind) {
  return makeSprite(30, 46, (g) => {
    g.fillStyle = '#231c20';
    g.beginPath();
    g.roundRect(-13, -22, 26, 44, 3);
    g.fill();
    g.fillStyle = '#121014';
    for (const y of [-14, 14]) {
      g.fillRect(-15, y - 3, 3, 6);
      g.fillRect(12, y - 3, 3, 6);
    }
    // couplings
    g.fillStyle = '#3a3238';
    g.fillRect(-1.5, -23, 3, 3);
    g.fillRect(-1.5, 20, 3, 3);
    if (kind === 'coach') {
      g.fillStyle = '#f2e6c4';
      g.beginPath();
      g.roundRect(-12.5, -21, 25, 42, 4);
      g.fill();
      const rg = g.createLinearGradient(-12, 0, 12, 0);
      rg.addColorStop(0, '#6a1a10');
      rg.addColorStop(0.4, '#c8462a');
      rg.addColorStop(0.55, '#ff8a5a');
      rg.addColorStop(1, '#6a1a10');
      g.fillStyle = rg;
      g.beginPath();
      g.roundRect(-11.5, -20, 23, 40, 4);
      g.fill();
      g.fillStyle = '#f2e6c4';
      g.fillRect(-11.5, -1, 23, 2);
      g.fillStyle = 'rgba(40,20,10,0.6)';
      for (const y of [-13, 9]) {
        g.beginPath();
        g.arc(0, y, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'bananas') {
      const wg = g.createLinearGradient(-12, 0, 12, 0);
      wg.addColorStop(0, '#5a3418');
      wg.addColorStop(0.5, '#9a6232');
      wg.addColorStop(1, '#5a3418');
      g.fillStyle = wg;
      g.beginPath();
      g.roundRect(-12.5, -21, 25, 42, 2);
      g.fill();
      g.fillStyle = '#3a2210';
      g.fillRect(-10, -18, 20, 36);
      // banana bunches
      const bun = [[-5, -12], [5, -10], [-4, 0], [5, 2], [-5, 12], [4, 12], [0, -4], [0, 7]];
      for (const [bx, by] of bun) {
        for (let k = 0; k < 4; k++) {
          g.strokeStyle = k % 2 ? '#ffd83a' : '#f5c21a';
          g.lineWidth = 2.2;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(bx + 6, by + k * 1.4 - 2, 6, Math.PI * 0.8, Math.PI * 1.15);
          g.stroke();
        }
        g.fillStyle = '#4a7a2a';
        g.fillRect(bx - 1, by - 3, 2, 2);
      }
      g.strokeStyle = 'rgba(255,220,160,0.35)';
      g.lineWidth = 1;
      g.strokeRect(-12, -20.5, 24, 41);
    } else {
      // flatbed with logs
      g.fillStyle = '#5a4030';
      g.fillRect(-12.5, -21, 25, 42);
      for (const lx of [-7.5, 0, 7.5]) {
        const lg = g.createLinearGradient(lx - 3.6, 0, lx + 3.6, 0);
        lg.addColorStop(0, '#4a2a14');
        lg.addColorStop(0.45, '#a8703a');
        lg.addColorStop(1, '#4a2a14');
        g.fillStyle = lg;
        g.beginPath();
        g.roundRect(lx - 3.6, -21, 7.2, 42, 3);
        g.fill();
        g.fillStyle = '#e0b878';
        g.beginPath();
        g.ellipse(lx, -20.5, 3.4, 1.6, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(120,70,30,0.8)';
        g.lineWidth = 0.6;
        g.beginPath();
        g.ellipse(lx, -20.5, 1.8, 0.8, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#2a2a30';
      for (const y of [-9, 9]) g.fillRect(-13, y, 26, 1.6);
    }
  });
}

function makeShadow(w, h) {
  return makeSprite(w + 16, h + 16, (g) => {
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 4);
    g.fill();
  }, 2);
}

function makeRock(rng) {
  const pts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 14 * rng.range(0.82, 1.08);
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]);
  }
  return makeSprite(36, 34, (g) => {
    const path = () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.closePath();
    };
    g.save();
    g.translate(2.5, 3);
    path();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill();
    g.restore();
    path();
    const rg = g.createRadialGradient(-5, -6, 1, 0, 0, 16);
    rg.addColorStop(0, '#c8c0b0');
    rg.addColorStop(0.5, '#8a8274');
    rg.addColorStop(1, '#45403a');
    g.fillStyle = rg;
    g.fill();
    g.strokeStyle = 'rgba(30,25,20,0.6)';
    g.lineWidth = 1;
    g.stroke();
    // cracks
    g.strokeStyle = 'rgba(40,32,26,0.7)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-3, -10);
    g.lineTo(0, -3);
    g.lineTo(-2, 4);
    g.moveTo(0, -3);
    g.lineTo(7, 2);
    g.stroke();
    // moss cap
    g.fillStyle = 'rgba(90,160,60,0.85)';
    g.beginPath();
    g.ellipse(-4, -8, 7, 4, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(150,210,90,0.6)';
    g.beginPath();
    g.ellipse(-5, -9, 3.5, 1.8, -0.4, 0, Math.PI * 2);
    g.fill();
  });
}

function makeLog() {
  return makeSprite(60, 22, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.roundRect(-26, -5, 56, 13, 6);
    g.fill();
    const bg = g.createLinearGradient(0, -7, 0, 7);
    bg.addColorStop(0, '#a87848');
    bg.addColorStop(0.4, '#7a4e2a');
    bg.addColorStop(1, '#3a2210');
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(-28, -7, 54, 13, 6);
    g.fill();
    // bark lines
    g.strokeStyle = 'rgba(40,20,8,0.6)';
    g.lineWidth = 0.8;
    for (let x = -22; x < 22; x += 5) {
      g.beginPath();
      g.moveTo(x, -6);
      g.quadraticCurveTo(x + 2, 0, x - 1, 5);
      g.stroke();
    }
    // cut end with rings
    g.fillStyle = '#e2b77a';
    g.beginPath();
    g.ellipse(25, -0.5, 3.6, 6.4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(130,80,30,0.8)';
    g.beginPath();
    g.ellipse(25, -0.5, 2, 3.8, 0, 0, Math.PI * 2);
    g.stroke();
    // moss and a leafy twig
    g.fillStyle = 'rgba(90,160,60,0.85)';
    g.beginPath();
    g.ellipse(-12, -5, 8, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3f9a40';
    for (const [x, y, a] of [[-24, -8, -0.6], [-20, -9, 0.4], [6, -8, -0.3]]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      leafShape(g, 7, 3);
      g.fill();
      g.restore();
    }
  });
}

function makeBuffers() {
  return makeSprite(34, 26, (g) => {
    // earth mound
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(1, -5, 16, 8, 0, 0, Math.PI * 2);
    g.fill();
    const mg = g.createRadialGradient(0, -8, 1, 0, -5, 16);
    mg.addColorStop(0, '#8a6a42');
    mg.addColorStop(1, '#4a3420');
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(0, -6, 15, 7, 0, 0, Math.PI * 2);
    g.fill();
    // red & white beam
    g.fillStyle = '#f4f0e8';
    g.fillRect(-14, -2, 28, 6);
    g.fillStyle = '#d0262a';
    for (let x = -14; x < 14; x += 7) {
      g.beginPath();
      g.moveTo(x, -2);
      g.lineTo(x + 3.5, -2);
      g.lineTo(x + 7, 4);
      g.lineTo(x + 3.5, 4);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.8;
    g.strokeRect(-14, -2, 28, 6);
    // the two buffers
    for (const bx of [-GAUGE, GAUGE]) {
      g.fillStyle = '#2a2a2e';
      g.fillRect(bx - 1.5, 4, 3, 4);
      const bg = g.createRadialGradient(bx - 1, 9, 0.3, bx, 9.5, 3.2);
      bg.addColorStop(0, '#d8d8de');
      bg.addColorStop(1, '#4a4a52');
      g.fillStyle = bg;
      g.beginPath();
      g.arc(bx, 9.5, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    // lamp
    g.fillStyle = '#222';
    g.fillRect(-1.5, -9, 3, 7);
    g.fillStyle = '#ff3a2a';
    g.beginPath();
    g.arc(0, -10, 2.6, 0, Math.PI * 2);
    g.fill();
  });
}

function makePuff() {
  return makeSprite(32, 32, (g) => {
    const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.5, 'rgba(225,228,232,0.65)');
    gr.addColorStop(1, 'rgba(200,205,210,0)');
    g.fillStyle = gr;
    g.fillRect(-16, -16, 32, 32);
  }, 1);
}

function makeButterfly() {
  return makeSprite(18, 14, (g) => {
    for (const s of [-1, 1]) {
      const wg = g.createRadialGradient(s * 4, -1, 0.5, s * 4, 0, 6);
      wg.addColorStop(0, '#9ae8ff');
      wg.addColorStop(0.6, '#2a8aff');
      wg.addColorStop(1, '#0a2a6a');
      g.fillStyle = wg;
      g.beginPath();
      g.ellipse(s * 4.5, -1.5, 4.5, 4, s * 0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(s * 3.5, 3.5, 3, 2.6, -s * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#1a1a1a';
    g.fillRect(-0.7, -4, 1.4, 9);
  }, 2);
}

// ---------- music: ragga jungle, 160 BPM, A minor ----------

const music = {
  cps: 160 / 240,
  setup: `
    const kick = note("a2 ~ a2 ~ ~ ~ ~ ~ ~ ~ a2 a2 ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
    const kick2 = note("a2 ~ a2 ~ ~ ~ a2 ~ ~ ~ a2 a2 ~ ~ a2 ~").s("sine").decay(0.18).sustain(0).gain(0.8)
    const snare = s("~ ~ ~ ~ pink ~ ~ pink ~ pink ~ ~ ~ ~ pink ~").decay(0.13).sustain(0).hpf(800).lpf(5500).gain(0.15).room(0.25)
    const ghost = s("~ ~ ~ pink ~ ~ pink ~ ~ ~ ~ pink ~ pink ~ ~").decay(0.06).sustain(0).hpf(1200).lpf(5000).gain(0.05)
    const rush = s("<~ [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ pink pink pink pink]>").decay(0.08).sustain(0).hpf(900).lpf(5500).gain(0.09)
    const hats = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.045 0.025]*4")
    const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.012 0.03 0.018 0.03]*4")
    const open = s("[~ white]*4").decay(0.12).sustain(0).hpf(7500).gain(0.025)
    const roots = "<a2 f2 c3 g2>"
    const sub = note(roots).s("sine").attack(0.01).decay(0.9).sustain(0.5).release(0.2).gain(0.38)
    const reeseLine = "<[a2@3 a3] [f2@3 f3] [c3@3 c4] [g2@3 g3]>"
    const reese = note(reeseLine).s("sawtooth").attack(0.02).sustain(0.7).release(0.1)
      .lpf(saw.range(280, 1500).slow(40)).lpq(5).gain(0.09).pan(0.4)
    const reese2 = note(reeseLine).add(note(0.18)).s("sawtooth").attack(0.02).sustain(0.7).release(0.1)
      .lpf(saw.range(280, 1500).slow(40)).lpq(5).gain(0.09).pan(0.6)
    const marimba = note("<[a4 ~ c5 e5 ~ a5 ~ e5 ~ c5 ~ e5 a4 ~ g4 ~] [f4 ~ a4 c5 ~ f5 ~ c5 ~ a4 ~ c5 f4 ~ e4 ~] [c5 ~ e5 g5 ~ c6 ~ g5 ~ e5 ~ g5 c5 ~ b4 ~] [g4 ~ b4 d5 ~ g5 ~ d5 ~ b4 ~ d5 g4 ~ a4 ~]>")
      .s("triangle").decay(0.12).sustain(0).lpf(3200).gain(0.08).delay(0.25).delaytime(0.281).delayfeedback(0.3).pan(0.4)
    const chords = "<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4]>"
    const stabs = note(chords).struct("~ ~ x ~ ~ ~ x ~").s("square").decay(0.12).sustain(0)
      .lpf(saw.range(900, 2400).slow(40)).gain(0.05).room(0.35).pan(0.6)
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.6).lpf(1000).gain(0.04).room(0.6)
    const tune = "<[e5@3 d5 c5@2 a4@2] [c5@3 d5 c5@2 a4@2] [g5@3 e5 d5@2 c5@2] [b4@3 c5 d5@4]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.2).sustain(0.5).release(0.1).lpf(2400).vib(5).vibmod(0.1)
      .gain(0.07).delay(0.2).delaytime(0.281).delayfeedback(0.25).pan(0.5)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1400).gain(0.055)
    const arp = note("<[a4 c5 e5 a5]*4 [f4 a4 c5 f5]*4 [c5 e5 g5 c6]*4 [g4 b4 d5 g5]*4>")
      .s("triangle").decay(0.06).sustain(0).lpf(3600).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(10)).gain(saw.range(0, 0.055).slow(10))
  `,
  song: `arrange(
    [10, stack(kick, snare, hats, sub, reese, reese2, marimba)],
    [10, stack(kick, snare, ghost, hats, sub, reese, reese2, marimba, stabs, pad)],
    [10, stack(kick, snare, ghost, rush, shaker, hats, sub, reese, reese2, marimba, stabs, pad, lead, arp)],
    [10, stack(kick2, snare, ghost, rush, shaker, hats, open, sub, reese, reese2, marimba, stabs, pad, lead, leadLow, arp, wash)]
  )`,
};

// ---------- the line ----------

function buildLine(rng) {
  // distance travelled over time, to place things by when the engine gets there
  const table = [0];
  let dist = 0;
  for (let i = 1; i <= 1300; i++) {
    dist += vAt((i - 0.5) * 0.05) * 0.05;
    table.push(dist);
  }
  const timeAt = (y) => {
    if (y <= 0) return 0;
    let i = 1;
    while (i < table.length && table[i] < y) i++;
    if (i >= table.length) return 65;
    return (i - 1 + (y - table[i - 1]) / (table[i] - table[i - 1])) * 0.05;
  };
  const end = table[Math.round(61 / 0.05)] + 900;

  const rows = [{ y0: -520, y1: 270, ms: -520, exits: [[], [], []], on: [true, true, true], hz: [null, null, null], live: [false, true, false], reach: [false, true, false], river: null }];
  let lastRiver = 0;
  let ref = 1;
  let lastSafe = 1;
  while (rows[rows.length - 1].y1 < end) {
    const k = rows.length;
    const p = rows[k - 1];
    const y0 = p.y1;
    const tp = timeAt(y0);
    const P = progress(tp, 60, 1.2);
    const v = vAt(tp);
    const riverDraw = rng.next();
    const hasRiver = tp > 7 && k - lastRiver >= 5 && riverDraw < 0.3;
    if (hasRiver) lastRiver = k;
    const lenDraw = rng.next();
    const L = hasRiver ? J + 118 + lenDraw * 20 : lerp(lerp(205, 172, P), lerp(250, 200, P), lenDraw);
    const row = { y0, y1: y0 + L, ms: y0 + J, exits: [[], [], []], on: [false, false, false], hz: [null, null, null], live: [false, false, false], reach: [false, false, false], river: null };
    if (hasRiver) row.river = { s: y0 + J + 22, e: y0 + J + 22 + 58 };

    // forks, crossovers or straight on, for every track coming in
    for (let i = 0; i < 3; i++) {
      const r1 = rng.next();
      const r2 = rng.next();
      if (!p.on[i] || (p.hz[i] && p.hz[i].type === 'buffers')) continue;
      const pj = tp < 3.5 ? 0 : p.live[i] ? lerp(0.5, 0.8, P) : 0.3;
      let ex = [i];
      if (r1 < pj) {
        if (i === 0) ex = [0, 1];
        else if (i === 2) ex = [1, 2];
        else ex = r2 < 0.2 ? [0, 2] : r2 < 0.6 ? [0, 1] : [1, 2];
      } else if (tp >= 3.5 && r1 < pj + 0.07) {
        ex = i === 1 ? [r2 < 0.5 ? 0 : 2] : [1];
      }
      row.exits[i] = ex;
    }
    // no crossing diagonals
    for (const [a, b] of [[0, 1], [1, 2]]) {
      if (row.exits[a].includes(b) && row.exits[b].includes(a)) {
        const keep = row.exits[b].filter((e) => e !== a);
        row.exits[b] = keep.length ? keep : [b];
      }
    }
    for (let i = 0; i < 3; i++) {
      for (const e of row.exits[i]) {
        row.on[e] = true;
        if (p.live[i]) row.reach[e] = true;
      }
    }

    // obstacles, never leaving a clear branch without a clear way on
    const fits = (j) => {
      row.hz[j] = { type: 'x' };
      let ok = true;
      for (let i = 0; i < 3; i++) {
        if (p.live[i] && row.exits[i].length && !row.exits[i].some((e) => !row.hz[e])) ok = false;
      }
      row.hz[j] = null;
      return ok;
    };
    const place = (j, b, c, dpos) => {
      let type;
      if (row.river) type = 'bridge';
      else if (tp > 14 && b < lerp(0.25, 0.45, P)) type = 'fall';
      else type = c < 0.4 ? 'rock' : c < 0.74 ? 'log' : 'buffers';
      const hz = { type, x: X[j] };
      if (type === 'bridge') {
        const { s, e } = row.river;
        hz.gapA = s + (e - s) * 0.3;
        hz.gapB = e - (e - s) * 0.3;
        hz.y = (s + e) / 2;
        hz.hit = hz.gapA;
      } else if (type === 'buffers') {
        hz.y = row.y1 - 18;
        hz.hit = hz.y - 13;
      } else {
        hz.y = row.ms + (row.y1 - row.ms) * lerp(0.3, 0.62, dpos);
        hz.hit = hz.y - (type === 'log' ? 8 : 14);
      }
      if (type === 'fall') {
        hz.warnD = y0 - v * lerp(1.7, 1.2, P);
        hz.landD = y0 - v * lerp(0.95, 0.65, P);
      }
      row.hz[j] = hz;
    };
    let count = 0;
    // along a reference route, block one branch of most forks, and usually the other side from
    // last time, so the lever keeps having to be thrown back and forth
    const fDraw = rng.next();
    const sDraw = rng.next();
    const hb = rng.next();
    const hc = rng.next();
    const hd = rng.next();
    const rex = row.exits[ref];
    if (tp >= 5.5 && rex.length === 2 && fDraw < lerp(0.5, 0.88, P)) {
      const safeSide = sDraw < lerp(0.6, 0.75, P) ? -lastSafe : lastSafe;
      const j = safeSide < 0 ? rex[1] : rex[0];
      if (fits(j)) {
        place(j, hb, hc, hd);
        count++;
      }
    }
    const cands = rng.shuffle([0, 1, 2]);
    const maxHz = P < 0.15 ? 1 : 2;
    for (const j of cands) {
      const a = rng.next();
      const b = rng.next();
      const c = rng.next();
      const dpos = rng.next();
      if (tp < 5.5 || !row.on[j] || row.hz[j] || count >= maxHz) continue;
      const ph = lerp(0.35, 0.65, P) * (row.reach[j] ? 1 : 0.35);
      if (a >= ph || !fits(j)) continue;
      place(j, b, c, dpos);
      count++;
    }
    const clear = rex.filter((e) => !row.hz[e]);
    if (rex.length === 2 && clear.length === 1) lastSafe = clear[0] === rex[0] ? -1 : 1;
    ref = clear.length === 2 ? clear[sDraw < 0.5 ? 0 : 1] : clear[0];
    for (let j = 0; j < 3; j++) row.live[j] = row.reach[j] && !row.hz[j];
    rows.push(row);
  }
  return rows;
}

// ---------- the game ----------

export default {
  id: 'junction',
  title: 'Jungle Junction',
  emoji: '🚂',
  tagline: 'Throw the points ← → so the train takes a clear branch at every fork.',
  colors: { bg: '#12301c', fg: '#fff4d6', accent: '#ffb52e' },
  music,

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const rows = buildLine(rng);

    const ground = paintGround(art);
    const edgeL = paintEdge(art, false);
    const edgeR = paintEdge(art, true);
    const dapple = paintDapple(art);
    const locoSpr = makeLoco();
    const carSpr = [makeCar('bananas'), makeCar('coach'), makeCar('logs')];
    const locoShadow = makeShadow(26, 60);
    const carShadow = makeShadow(26, 44);
    const rockSpr = [makeRock(art), makeRock(art), makeRock(art)];
    const logSpr = makeLog();
    const buffersSpr = makeBuffers();
    const puffSpr = makePuff();
    const flySpr = makeButterfly();
    const glowAmber = glowSprite('rgba(255,190,60,0.9)', 32);
    const glowRed = glowSprite('rgba(255,60,40,0.9)', 32);
    const glowLamp = glowSprite('rgba(255,240,180,0.8)', 24);
    const vignette = vignetteSprite(W, H, 0.6, '4,18,8');

    const fx = createParticles();
    const puffs = [];
    const flies = [];
    for (let i = 0; i < 3; i++) flies.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6, vx: 0, vy: 0 });

    // ---- state ----
    let d = 0; // the engine's nose, in distance along the line
    let v = vAt(0);
    let lever = 1;
    let leverFlip = 0;
    let r = 0; // the section the engine's nose is in
    let lane = 1;
    const routeFrom = new Int8Array(rows.length).fill(-1);
    const routeTo = new Int8Array(rows.length).fill(-1);
    routeFrom[0] = 1;
    routeTo[0] = 1;
    let clock = 0;
    let shake = 0;
    let puffTimer = 0;
    let crashT = 0;
    let crashKind = '';
    let crashV = 0;
    let crashSide = 1;

    const rowAt = (y) => {
      let lo = 0;
      let hi = rows.length - 1;
      if (y < rows[0].y0) return -1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (rows[mid].y0 <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const xOn = (row, from, to, y) => {
      if (from === to || y >= row.y0 + J) return X[to];
      const u = clamp((y - row.y0) / J, 0, 1);
      return lerp(X[from], X[to], smooth(u));
    };
    const posAt = (y) => {
      const q = rowAt(y);
      if (q < 0 || routeTo[q] < 0) return X[q < 0 ? 1 : lane];
      return xOn(rows[q], routeFrom[q], routeTo[q], y);
    };
    const hzVisible = (hz) => hz.type !== 'fall' || d >= hz.warnD;
    const sy = (y) => TRAIN_Y - (y - d);

    const choose = (ex) => (ex.length === 2 ? (lever < 0 ? ex[0] : ex[1]) : ex[0]);

    // the route the lever will take over the next forks, for the preview line
    const preview = () => {
      const pts = [];
      let q = r;
      let ln = lane;
      let from = routeFrom[r];
      let forks = 0;
      let next = null;
      let blocked = null;
      for (let y = d; y < d + 620; y += 8) {
        while (q + 1 < rows.length && rows[q + 1].y0 <= y) {
          q++;
          const ex = rows[q].exits[ln];
          if (!ex.length) return { pts, next, blocked };
          if (ex.length === 2) {
            forks++;
            if (!next) next = { q, lane: ln };
            if (forks > 2) return { pts, next, blocked };
          }
          from = ln;
          ln = choose(ex);
        }
        const row = rows[q];
        pts.push([xOn(row, from, ln, y), y]);
        const hz = row.hz[ln];
        if (hz && hzVisible(hz) && y >= hz.hit) {
          blocked = hz;
          return { pts, next, blocked };
        }
      }
      return { pts, next, blocked };
    };

    const crash = (game, hz) => {
      game.dead = true;
      game.deathReason = REASONS[hz.type];
      crashKind = hz.type;
      crashV = v * 0.5;
      crashSide = lane === 0 ? 1 : lane === 2 ? -1 : (Math.floor(d) % 2 ? 1 : -1);
      shake = 0.6;
      const x = posAt(d);
      const y = TRAIN_Y;
      if (hz.type === 'bridge') {
        fx.burst(x, y - 4, { count: 40, speed: 200, life: 0.9, size: 4, gravity: 300, angle: -Math.PI / 2, spread: 2.6, colors: ['#bff4ff', '#7ad8e8', '#ffffff', '#3aa8b8'], round: true });
      } else {
        fx.burst(x, y - 4, { count: 30, speed: 210, life: 0.9, size: 4, gravity: 160, drag: 1.2, colors: hz.type === 'log' ? ['#a87848', '#7a4e2a', '#e2b77a', '#3f9a40'] : ['#c8c0b0', '#8a8274', '#5a5248', '#5aa04a'] });
        fx.burst(x, y - 4, { count: 16, speed: 260, life: 0.5, size: 2.5, colors: ['#fff3c0', '#ffc35a', '#ff8a2a'] });
      }
      for (let i = 0; i < 10; i++) puffs.push({ x: x + (Math.random() - 0.5) * 20, y: y + Math.random() * 20, r: 10 + Math.random() * 10, life: 0, max: 1.4 + Math.random(), vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40 });
    };

    const updateCosmetic = (dt, scroll) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.4);
      leverFlip = Math.max(0, leverFlip - dt * 5);
      fx.update(dt, scroll);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += (p.vy + scroll) * dt;
        p.vx *= 1 - dt * 1.5;
        p.r += 20 * dt;
        if (p.life > p.max) puffs.splice(i, 1);
      }
      for (const f of flies) {
        f.ph += dt * 3;
        f.vx += (Math.random() - 0.5) * 300 * dt;
        f.vy += (Math.random() - 0.5) * 300 * dt;
        f.vx *= 1 - dt;
        f.vy *= 1 - dt;
        f.x += f.vx * dt;
        f.y += (f.vy + scroll * 0.3) * dt;
        if (f.x < 30) f.vx += 80 * dt;
        if (f.x > W - 30) f.vx -= 80 * dt;
        if (f.y > H + 20) {
          f.y = -20;
          f.x = 40 + Math.random() * (W - 80);
        }
        if (f.y < -40) f.y = H;
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      _debug: { rows, get lane() { return lane; }, get r() { return r; } },

      update(dt, dir, t) {
        v = vAt(t);
        updateCosmetic(dt, v);
        if (dir && dir !== lever) {
          lever = dir;
          leverFlip = 1;
        }
        d += v * dt;
        // over a set of points: the lever decides
        while (r + 1 < rows.length && rows[r + 1].y0 <= d) {
          r++;
          const ex = rows[r].exits[lane];
          const to = ex.length ? choose(ex) : lane;
          routeFrom[r] = lane;
          routeTo[r] = to;
          lane = to;
        }
        const hz = rows[r].hz[lane];
        if (hz && d >= hz.hit) {
          crash(this, hz);
          return;
        }
        // steam
        puffTimer -= dt;
        if (puffTimer <= 0) {
          puffTimer = lerp(0.09, 0.05, progress(t));
          const cy = d - 19;
          const x = posAt(cy);
          puffs.push({ x: x + (Math.random() - 0.5) * 3, y: sy(cy), r: 7 + Math.random() * 3, life: 0, max: 0.8 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 30, vy: -v * 0.25 });
        }
      },

      afterlife(dt) {
        crashT += dt;
        crashV *= Math.max(0, 1 - dt * 6);
        d += crashV * dt;
        updateCosmetic(dt, crashV);
        if (Math.random() < dt * 14) {
          const x = posAt(d - 20);
          puffs.push({ x: x + crashSide * 8, y: TRAIN_Y + 20, r: 8 + Math.random() * 6, life: 0, max: 1.2 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 40, vy: -30 });
        }
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
        const shy = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0;
        g.save();
        g.translate(sx, shy);

        const yMin = d - (H - TRAIN_Y) - 40;
        const yMax = d + TRAIN_Y + 40;

        // jungle floor
        for (let k = Math.floor(yMin / TILE_H); k <= Math.floor(yMax / TILE_H); k++) {
          g.drawImage(ground.canvas, -6, sy((k + 1) * TILE_H), W + 12, TILE_H + 1);
        }

        const first = Math.max(0, rowAt(yMin));
        let last = first;
        while (last + 1 < rows.length && rows[last + 1].y0 <= yMax) last++;

        // rivers
        for (let q = first; q <= last; q++) {
          const rv = rows[q].river;
          if (!rv) continue;
          const top = sy(rv.e);
          const bot = sy(rv.s);
          g.fillStyle = '#4a3820';
          g.fillRect(-6, top - 8, W + 12, bot - top + 16);
          const wg = g.createLinearGradient(0, top, 0, bot);
          wg.addColorStop(0, '#1d6a6e');
          wg.addColorStop(0.5, '#2a8f8a');
          wg.addColorStop(1, '#1d6a6e');
          g.fillStyle = wg;
          g.fillRect(-6, top, W + 12, bot - top);
          g.strokeStyle = 'rgba(200,250,240,0.35)';
          g.lineWidth = 1.2;
          for (let k = 0; k < 6; k++) {
            const yy = top + 6 + k * ((bot - top - 12) / 5);
            const off = ((clock * (30 + k * 6) + k * 57) % 90) - 90;
            g.beginPath();
            for (let x = off; x < W + 90; x += 90) {
              g.moveTo(x, yy);
              g.lineTo(x + 26, yy);
            }
            g.stroke();
          }
          // reedy banks
          g.fillStyle = 'rgba(90,150,60,0.9)';
          for (let x = 4; x < W; x += 11) {
            g.fillRect(x, top - 9, 2, 6);
            g.fillRect(x + 5, bot + 3, 2, 6);
          }
        }

        // collect the track pieces in view
        const pieces = []; // { x0, x1, a, b, curve, bed }
        const add = (x0, x1, a, b, curve, bed) => {
          const aa = Math.max(a, yMin);
          const bb = Math.min(b, yMax);
          if (bb > aa) pieces.push({ x0, x1, a, b, aa, bb, curve, bed });
        };
        const bridges = [];
        for (let q = first; q <= last; q++) {
          const row = rows[q];
          for (let i = 0; i < 3; i++) for (const e of row.exits[i]) add(X[i], X[e], row.y0, row.y0 + J, i !== e, true);
          for (let j = 0; j < 3; j++) {
            if (!row.on[j]) continue;
            const hz = row.hz[j];
            const top = hz && hz.type === 'buffers' ? hz.y + 8 : row.y1;
            if (row.river) {
              const { s, e } = row.river;
              add(X[j], X[j], row.ms, s - 6, false, true);
              if (hz && hz.type === 'bridge') {
                add(X[j], X[j], s - 6, hz.gapA, false, false);
                add(X[j], X[j], hz.gapB, e + 6, false, false);
              } else add(X[j], X[j], s - 6, e + 6, false, false);
              add(X[j], X[j], e + 6, top, false, true);
              bridges.push({ x: X[j], s, e, hz: hz && hz.type === 'bridge' ? hz : null });
            } else add(X[j], X[j], row.ms, top, false, true);
          }
        }
        const xAt = (pc, y) => (pc.curve ? lerp(pc.x0, pc.x1, smooth(clamp((y - pc.a) / (pc.b - pc.a), 0, 1))) : pc.x0);
        const slopeAt = (pc, y) => {
          if (!pc.curve) return 0;
          const u = clamp((y - pc.a) / (pc.b - pc.a), 0, 1);
          return ((pc.x1 - pc.x0) * 6 * u * (1 - u)) / (pc.b - pc.a);
        };
        const line = (pc, off) => {
          const n = pc.curve ? 14 : 1;
          for (let k = 0; k <= n; k++) {
            const y = lerp(pc.aa, pc.bb, k / n);
            const x = xAt(pc, y);
            const sl = slopeAt(pc, y);
            const len = Math.hypot(1, sl);
            const px = x + (off * 1) / len;
            const py = sy(y) + (off * sl) / len;
            if (k === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
        };

        // ballast
        g.lineCap = 'butt';
        g.lineJoin = 'round';
        g.strokeStyle = '#4a4034';
        g.lineWidth = 32;
        g.beginPath();
        for (const pc of pieces) if (pc.bed) line(pc, 0);
        g.stroke();
        g.strokeStyle = '#7a6c58';
        g.lineWidth = 25;
        g.beginPath();
        for (const pc of pieces) if (pc.bed) line(pc, 0);
        g.stroke();
        g.strokeStyle = 'rgba(160,145,120,0.35)';
        g.lineWidth = 3;
        g.setLineDash([2, 5]);
        g.beginPath();
        for (const pc of pieces) if (pc.bed) {
          line(pc, -9);
          line(pc, 9);
        }
        g.stroke();
        g.setLineDash([]);

        // bridge decks
        for (const br of bridges) {
          const top = sy(br.e + 7);
          const bot = sy(br.s - 7);
          const segs = br.hz ? [[sy(br.hz.gapA), bot], [top, sy(br.hz.gapB)]] : [[top, bot]];
          g.fillStyle = 'rgba(0,30,30,0.4)';
          g.fillRect(br.x - 15, top + 6, 34, bot - top);
          for (const [a, b] of segs) {
            const dg = g.createLinearGradient(br.x - 17, 0, br.x + 17, 0);
            dg.addColorStop(0, '#4a2e18');
            dg.addColorStop(0.5, '#8a5a32');
            dg.addColorStop(1, '#4a2e18');
            g.fillStyle = dg;
            g.fillRect(br.x - 17, a, 34, b - a);
            g.fillStyle = '#3a2210';
            g.fillRect(br.x - 17, a, 3, b - a);
            g.fillRect(br.x + 14, a, 3, b - a);
          }
          if (br.hz) {
            // splintered ends and a warning glow over the gap
            const ga = sy(br.hz.gapA);
            const gb = sy(br.hz.gapB);
            g.fillStyle = '#8a5a32';
            for (let k = -3; k <= 3; k++) {
              const h = 3 + ((k * 7 + 11) % 5);
              g.fillRect(br.x + k * 4.5 - 1.5, ga - h, 3, h);
              g.fillRect(br.x + k * 4.5 - 1.5, gb, 3, 2 + ((k * 5 + 7) % 4));
            }
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, br.x, (ga + gb) / 2, { size: 64, alpha: 0.35 + 0.2 * Math.sin(clock * 8) });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // sleepers
        g.fillStyle = 'rgba(0,0,0,0.3)';
        const sleepers = (dx, dy, hw, hh) => {
          g.beginPath();
          for (const pc of pieces) {
            for (let y = Math.ceil(pc.aa / SLEEPER) * SLEEPER; y < pc.bb; y += SLEEPER) {
              const x = xAt(pc, y) + dx;
              const sl = slopeAt(pc, y);
              const len = Math.hypot(1, sl);
              const nx = 1 / len;
              const ny = sl / len;
              const tx = sl / len;
              const ty = -1 / len;
              const cy = sy(y) + dy;
              g.moveTo(x - nx * hw - tx * hh, cy - ny * hw - ty * hh);
              g.lineTo(x + nx * hw - tx * hh, cy + ny * hw - ty * hh);
              g.lineTo(x + nx * hw + tx * hh, cy + ny * hw + ty * hh);
              g.lineTo(x - nx * hw + tx * hh, cy - ny * hw + ty * hh);
              g.closePath();
            }
          }
          g.fill();
        };
        sleepers(1.5, 2, 12, 2.8);
        g.fillStyle = '#6a4428';
        sleepers(0, 0, 12, 2.6);
        g.fillStyle = 'rgba(255,220,170,0.18)';
        sleepers(0, -1.4, 11.5, 0.8);

        // rails
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(0,0,0,0.4)';
        g.lineWidth = 3.4;
        g.beginPath();
        for (const pc of pieces) {
          line(pc, -GAUGE + 1);
          line(pc, GAUGE + 1);
        }
        g.stroke();
        g.strokeStyle = '#5e5a62';
        g.lineWidth = 3;
        g.beginPath();
        for (const pc of pieces) {
          line(pc, -GAUGE);
          line(pc, GAUGE);
        }
        g.stroke();
        g.strokeStyle = '#e4e0e8';
        g.lineWidth = 1.2;
        g.beginPath();
        for (const pc of pieces) {
          line(pc, -GAUGE - 0.4);
          line(pc, GAUGE - 0.4);
        }
        g.stroke();
        g.lineCap = 'butt';

        // the route ahead
        const pv = this.dead ? { pts: [], next: null, blocked: null } : preview();

        // points: the blade the lever has set glows on every fork still ahead
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        for (let q = Math.max(first, r + 1); q <= last; q++) {
          const row = rows[q];
          for (let i = 0; i < 3; i++) {
            const ex = row.exits[i];
            if (ex.length !== 2) continue;
            const to = choose(ex);
            const pc = { x0: X[i], x1: X[to], a: row.y0, b: row.y0 + J, curve: to !== i };
            pc.aa = row.y0;
            pc.bb = row.y0 + 34;
            g.strokeStyle = 'rgba(255,200,80,0.55)';
            g.lineWidth = 2.4;
            g.beginPath();
            line(pc, -GAUGE);
            line(pc, GAUGE);
            g.stroke();
          }
        }
        g.globalCompositeOperation = 'source-over';
        g.lineCap = 'butt';

        // preview route
        if (pv.pts.length > 1) {
          const col = pv.blocked ? '255,80,60' : '255,215,110';
          g.globalCompositeOperation = 'lighter';
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const [w, a] of [[9, 0.12], [3, 0.5]]) {
            g.strokeStyle = `rgba(${col},${a})`;
            g.lineWidth = w;
            g.setLineDash(w > 5 ? [] : [10, 8]);
            g.lineDashOffset = -clock * 60;
            g.beginPath();
            pv.pts.forEach(([x, y], k) => (k ? g.lineTo(x, sy(y)) : g.moveTo(x, sy(y))));
            g.stroke();
          }
          g.setLineDash([]);
          g.globalCompositeOperation = 'source-over';
          g.lineCap = 'butt';
        }

        // obstacles
        for (let q = first; q <= last; q++) {
          const row = rows[q];
          for (let j = 0; j < 3; j++) {
            const hz = row.hz[j];
            if (!hz || hz.type === 'bridge') continue;
            const y = sy(hz.y);
            if (hz.type === 'rock') drawSprite(g, rockSpr[(q + j) % 3], hz.x, y, { size: 36 });
            else if (hz.type === 'log') drawSprite(g, logSpr, hz.x + ((q % 2) ? 3 : -3), y, { size: 60, rot: (q % 3 - 1) * 0.12 });
            else if (hz.type === 'buffers') {
              drawSprite(g, buffersSpr, hz.x, y, { size: 34 });
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, hz.x, y - 10, { size: 26, alpha: 0.5 + 0.4 * Math.sin(clock * 6 + q) });
              g.globalCompositeOperation = 'source-over';
            } else if (hz.type === 'fall' && d >= hz.warnD) {
              const u = clamp((d - hz.warnD) / (hz.landD - hz.warnD), 0, 1);
              const pulse = 0.5 + 0.5 * Math.sin(clock * 14);
              g.fillStyle = `rgba(0,0,0,${(0.2 + 0.3 * u).toFixed(3)})`;
              g.beginPath();
              g.ellipse(hz.x, y + 2, 6 + 10 * u, 4 + 7 * u, 0, 0, Math.PI * 2);
              g.fill();
              if (u >= 1) drawSprite(g, rockSpr[(q + j) % 3], hz.x, y, { size: 36 });
              g.strokeStyle = `rgba(255,${Math.round(150 - 90 * u)},60,${(0.5 + 0.5 * pulse).toFixed(3)})`;
              g.lineWidth = 2.2;
              g.beginPath();
              g.arc(hz.x, y, 20, 0, Math.PI * 2);
              g.stroke();
            }
            if (pv.blocked === hz) {
              g.strokeStyle = `rgba(255,70,50,${(0.6 + 0.4 * Math.sin(clock * 12)).toFixed(3)})`;
              g.lineWidth = 2.5;
              g.beginPath();
              g.arc(hz.x, y, 23, 0, Math.PI * 2);
              g.stroke();
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowRed, hz.x, y, { size: 80, alpha: 0.45 });
              g.globalCompositeOperation = 'source-over';
            }
          }
        }
        if (pv.blocked && pv.blocked.type === 'bridge') {
          const b = pv.blocked;
          g.strokeStyle = `rgba(255,70,50,${(0.6 + 0.4 * Math.sin(clock * 12)).toFixed(3)})`;
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(b.x, sy(b.y), 24, 0, Math.PI * 2);
          g.stroke();
        }

        // the lamp at the next fork shows which way the lever is set
        if (pv.next) {
          const row = rows[pv.next.q];
          const lx = X[pv.next.lane] + (pv.next.lane === 0 ? 27 : -27);
          const ly = sy(row.y0) + 4;
          const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
          g.strokeStyle = '#2a2420';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(lx, ly);
          g.lineTo(lx, ly + 12);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowAmber, lx, ly, { size: 46 + 8 * pulse + 20 * leverFlip, alpha: 0.6 });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = '#1a1612';
          g.beginPath();
          g.arc(lx, ly, 10, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#c9a23a';
          g.lineWidth = 1.6;
          g.stroke();
          g.fillStyle = '#ffd36a';
          g.beginPath();
          g.moveTo(lx + lever * 6, ly);
          g.lineTo(lx - lever * 3, ly - 6);
          g.lineTo(lx - lever * 3, ly + 6);
          g.closePath();
          g.fill();
        }

        // the train
        const vehicles = [{ front: d, len: LOCO_L, spr: locoSpr, sh: locoShadow }];
        let f = d - LOCO_L - GAP;
        for (let k = 0; k < 3; k++) {
          vehicles.push({ front: f, len: CAR_L, spr: carSpr[k], sh: carShadow });
          f -= CAR_L + GAP;
        }
        const crashK = this.dead ? clamp(crashT * 2.2, 0, 1) : 0;
        for (let k = vehicles.length - 1; k >= 0; k--) {
          const vh = vehicles[k];
          const bunch = crashK * k * 7;
          const yf = vh.front - 6 + bunch;
          const yb = vh.front - vh.len + 6 + bunch;
          const xf = posAt(yf);
          const xb = posAt(yb);
          let rot = Math.atan2(xf - xb, yf - yb);
          let cx = (xf + xb) / 2;
          const cy = sy((yf + yb) / 2);
          if (this.dead && crashKind !== 'bridge') {
            const side = k % 2 ? -crashSide : crashSide;
            rot += side * crashK * (k === 0 ? 0.5 : 0.35);
            cx += side * crashK * (k === 0 ? 10 : 6);
          }
          let alpha = 1;
          let size = vh.spr.w;
          if (this.dead && crashKind === 'bridge' && k === 0) {
            alpha = 1 - crashK * 0.7;
            size = vh.spr.w * (1 - crashK * 0.25);
            rot += crashK * 0.3;
          }
          drawSprite(g, vh.sh, cx + 4, cy + 5, { rot, size: vh.sh.w * (size / vh.spr.w), alpha: 0.8 * alpha });
          drawSprite(g, vh.spr, cx, cy, { rot, size, alpha });
        }
        // headlamp
        {
          const x = posAt(d - 2);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowLamp, x, TRAIN_Y - 2, { size: 30, alpha: 0.7 });
          g.globalCompositeOperation = 'source-over';
        }

        // falling rocks in the air
        for (let q = first; q <= last; q++) {
          for (let j = 0; j < 3; j++) {
            const hz = rows[q].hz[j];
            if (!hz || hz.type !== 'fall' || d < hz.warnD || d >= hz.landD) continue;
            const u = clamp((d - hz.warnD) / (hz.landD - hz.warnD), 0, 1);
            const y = sy(hz.y) - (1 - u * u) * 150;
            drawSprite(g, rockSpr[(q + j) % 3], hz.x + (1 - u) * 18, y, { size: 36 + (1 - u) * 22, rot: u * 3 });
          }
        }

        // steam
        for (const p of puffs) {
          const k = p.life / p.max;
          drawSprite(g, puffSpr, p.x, p.y, { size: p.r * 2, alpha: Math.min(1, k * 6) * (1 - k) * 0.85 });
        }
        fx.render(g);

        // butterflies
        for (const fl of flies) {
          const flap = 0.35 + 0.65 * Math.abs(Math.sin(fl.ph * 4));
          g.save();
          g.translate(fl.x, fl.y);
          g.rotate(Math.atan2(fl.vx, -fl.vy) * 0.3);
          g.scale(flap, 1);
          g.drawImage(flySpr.canvas, -9, -7, 18, 14);
          g.restore();
        }

        // canopy at the edges and dappled light
        const eo = (d * 1.18) % EDGE_H;
        for (const k of [-1, 0]) {
          g.drawImage(edgeL.canvas, -26, eo + k * EDGE_H, 96, EDGE_H);
          g.drawImage(edgeR.canvas, W - 70, eo + k * EDGE_H + 230, 96, EDGE_H);
          g.drawImage(edgeR.canvas, W - 70, eo + (k - 1) * EDGE_H + 230, 96, EDGE_H);
        }
        const dofs = (d * 1.05) % EDGE_H;
        for (const k of [-1, 0]) g.drawImage(dapple.shade.canvas, 0, dofs + k * EDGE_H, W, EDGE_H);
        g.globalCompositeOperation = 'lighter';
        for (const k of [-1, 0]) g.drawImage(dapple.sun.canvas, 0, dofs + k * EDGE_H, W, EDGE_H);
        g.globalCompositeOperation = 'source-over';
        g.restore();

        g.drawImage(vignette.canvas, 0, 0, W, H);

        // lever lamps
        for (const s of [-1, 1]) {
          const x = s < 0 ? 30 : W - 30;
          const y = H - 34;
          const on = lever === s;
          if (on) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowAmber, x, y, { size: 70 + 30 * leverFlip, alpha: 0.7 });
            g.globalCompositeOperation = 'source-over';
          }
          const bg = g.createRadialGradient(x - 4, y - 4, 2, x, y, 18);
          bg.addColorStop(0, on ? '#ffe9a0' : '#3a3630');
          bg.addColorStop(1, on ? '#d88a1a' : '#1a1814');
          g.fillStyle = bg;
          g.beginPath();
          g.arc(x, y, 17, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = on ? '#fff2c0' : '#8a7a5a';
          g.lineWidth = 2;
          g.stroke();
          g.fillStyle = on ? '#3a1e00' : '#8a7a5a';
          g.beginPath();
          g.moveTo(x + s * 8, y);
          g.lineTo(x - s * 5, y - 8);
          g.lineTo(x - s * 5, y + 8);
          g.closePath();
          g.fill();
        }
      },
    };
    return game;
  },
};
