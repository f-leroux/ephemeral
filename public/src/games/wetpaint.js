// Wet Paint — a little drop of paint races up an artist's canvas covered in cardboard stencils.
// Each stencil is a strip of card with windows cut out of it, and every window is glazed with a
// colour: only a drop of that colour can slip through. Rolling through a puddle of paint turns
// the drop that colour, so the game is reading the next stencil, finding a puddle of one of its
// colours you can reach, and lining up with that window, while steering round the puddles that
// would turn you the wrong colour at the last moment. Then more colours, narrower windows, a
// faster canvas, stray puddles right in front of the stencils and, after half a minute, stencils
// that slide from side to side. Every stencil is planned around a hidden route (a puddle, then a
// window, each in easy reach of the last) that no other puddle sits on, so there's always a way.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  easeOutCubic,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';
import { BODY_FONT } from '../engine/stage.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 540; // where the drop sits
const DROP_R = 11; // its size for touching puddles
const HIT_R = 7; // its half-width for squeezing through a window
const PUD_R = 17;
const GATE_H = 26;
const EDGE = 16; // masking tape down both sides of the canvas
const SPEED = 300;
const START = 2; // the drop starts out blue

const COLS = [
  { name: 'red', hex: '#e63946', light: '#ff9d92', dark: '#9b1b2a', ink: '#fff4ec', glyph: 'circle' },
  { name: 'yellow', hex: '#ffc627', light: '#fff2a6', dark: '#c48600', ink: '#6b4300', glyph: 'triangle' },
  { name: 'blue', hex: '#2f78e0', light: '#a2caff', dark: '#173f8f', ink: '#f2f7ff', glyph: 'square' },
  { name: 'green', hex: '#25b06a', light: '#a4f2c4', dark: '#0f6a3b', ink: '#efffef', glyph: 'diamond' },
  { name: 'purple', hex: '#9a4fe0', light: '#d9b8ff', dark: '#552088', ink: '#fbf2ff', glyph: 'star' },
];

const speedAt = (t) => lerp(150, 255, progress(t, 60, 1.2));
const coloursAt = (t) => (t < 16 ? 3 : t < 36 ? 4 : 5); // green joins at 16s, purple at 36s

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// a shape for every colour, so the colours can be told apart without seeing them
function glyphPath(g, kind, r) {
  g.beginPath();
  if (kind === 'circle') g.arc(0, 0, r, 0, TAU);
  else if (kind === 'triangle') {
    g.moveTo(0, -r * 1.15);
    g.lineTo(r * 1.08, r * 0.78);
    g.lineTo(-r * 1.08, r * 0.78);
    g.closePath();
  } else if (kind === 'square') g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  else if (kind === 'diamond') {
    g.moveTo(0, -r * 1.2);
    g.lineTo(r * 0.95, 0);
    g.lineTo(0, r * 1.2);
    g.lineTo(-r * 0.95, 0);
    g.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.5 : r * 1.2;
      if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
}

// a smooth closed blob through points at the given radii
function blobPath(g, radii, ox = 0, oy = 0) {
  const n = radii.length;
  const pt = (i) => {
    const a = ((i % n) / n) * TAU;
    return [ox + Math.cos(a) * radii[i % n], oy + Math.sin(a) * radii[i % n]];
  };
  g.beginPath();
  const [lx, ly] = pt(n - 1);
  const [fx, fy] = pt(0);
  g.moveTo((lx + fx) / 2, (ly + fy) / 2);
  for (let i = 0; i < n; i++) {
    const [px, py] = pt(i);
    const [qx, qy] = pt(i + 1);
    g.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
  }
  g.closePath();
}

// ---------- art ----------

function paintCanvas(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#ece0c8');
    base.addColorStop(0.5, '#f8f1e3');
    base.addColorStop(1, '#ece0c8');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // everything big is drawn three times, a texture height apart, so the canvas tiles
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // the linen weave
    g.fillStyle = 'rgba(140,110,70,0.07)';
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.fillStyle = 'rgba(140,110,70,0.05)';
    for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
    for (let i = 0; i < 320; i++) {
      g.fillStyle = `rgba(120,90,50,${rng.range(0.05, 0.12)})`;
      if (rng.chance(0.5)) g.fillRect(rng.range(0, W), Math.floor(rng.range(0, H / 3)) * 3, rng.range(3, 11), 1);
      else g.fillRect(Math.floor(rng.range(0, W / 3)) * 3, rng.range(0, H), 1, rng.range(3, 11));
    }
    // dried brush strokes and washes from earlier sessions
    const pastel = ['230,57,70', '255,190,40', '47,120,224', '37,176,106', '154,79,224', '255,140,60'];
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const c = rng.pick(pastel);
      const a = rng.range(0.05, 0.09);
      const x0 = rng.range(10, W - 10);
      const y0 = rng.range(0, H);
      const ang = rng.range(0, TAU);
      const len = rng.range(70, 170);
      const bend = rng.range(-40, 40);
      const lw = rng.range(14, 32);
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      const mx = (x0 + x1) / 2 - Math.sin(ang) * bend;
      const my = (y0 + y1) / 2 + Math.cos(ang) * bend;
      const bristles = [];
      for (let k = 0; k < 7; k++) bristles.push([rng.range(-0.5, 0.5) * lw, rng.range(0.6, 1.2)]);
      wrap(() => {
        g.strokeStyle = `rgba(${c},${a})`;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo(mx, my, x1, y1);
        g.stroke();
        for (const [off, w] of bristles) {
          const nx = -Math.sin(ang) * off;
          const ny = Math.cos(ang) * off;
          g.strokeStyle = `rgba(${c},${a * 1.5})`;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(x0 + nx, y0 + ny);
          g.quadraticCurveTo(mx + nx, my + ny, x1 + nx * 0.6, y1 + ny * 0.6);
          g.stroke();
        }
      });
    }
    // splatters
    for (let i = 0; i < 46; i++) {
      const c = rng.pick(pastel);
      const x = rng.range(EDGE, W - EDGE);
      const y = rng.range(0, H);
      const r = rng.range(0.8, 3.6);
      const a = rng.range(0.15, 0.32);
      wrap(() => {
        g.fillStyle = `rgba(${c},${a})`;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      });
    }
    // loose pencil sketch lines
    for (let i = 0; i < 8; i++) {
      const x = rng.range(30, W - 30);
      const y = rng.range(0, H);
      const rx = rng.range(20, 70);
      const ry = rng.range(12, 50);
      const rot = rng.range(0, TAU);
      const a0 = rng.range(0, TAU);
      const sweep = rng.range(1.5, 4.5);
      wrap(() => {
        g.strokeStyle = 'rgba(70,65,85,0.14)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.ellipse(x, y, rx, ry, rot, a0, a0 + sweep);
        g.stroke();
        g.beginPath();
        g.ellipse(x + 2, y + 1, rx * 0.97, ry * 1.02, rot, a0 + 0.3, a0 + sweep * 0.8);
        g.stroke();
      });
    }
    // masking tape holding the canvas down
    for (const left of [true, false]) {
      const x0 = left ? 0 : W - EDGE;
      const tg = g.createLinearGradient(x0, 0, x0 + EDGE, 0);
      tg.addColorStop(0, '#e2d2a2');
      tg.addColorStop(0.5, '#f1e6c2');
      tg.addColorStop(1, '#e6d8ab');
      g.fillStyle = tg;
      g.fillRect(x0, 0, EDGE, H);
      // the torn inner edge (flat at the ends so it tiles)
      const ex = left ? EDGE : W - EDGE;
      const out = left ? 1 : -1;
      g.fillStyle = '#ebdfb7';
      g.beginPath();
      g.moveTo(ex, 0);
      for (let y = 4; y < H - 4; y += 4) g.lineTo(ex + out * rng.range(0, 2.2), y);
      g.lineTo(ex, H);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(120,90,50,0.22)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ex + out * 2.2, 0);
      g.lineTo(ex + out * 2.2, H);
      g.stroke();
      // creases and fibres
      for (let k = 0; k < 18; k++) {
        const y = rng.range(8, H - 8);
        g.strokeStyle = `rgba(150,120,70,${rng.range(0.1, 0.22)})`;
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(x0 + 1, y);
        g.lineTo(x0 + EDGE - 1, y + rng.range(-5, 5));
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,240,0.25)';
      g.fillRect(x0 + (left ? 3 : 5), 0, 2, H);
    }
  }, 2);
}

function paintPuddle(col, rng) {
  return makeSprite(64, 64, (g) => {
    const r = PUD_R;
    const radii = [];
    for (let i = 0; i < 13; i++) radii.push(r * rng.range(0.84, 1.13));
    const drops = [];
    for (let k = rng.int(3, 5); k > 0; k--) {
      const a = rng.range(0, TAU);
      const d = r * rng.range(1.22, 1.62);
      drops.push([Math.cos(a) * d, Math.sin(a) * d, rng.range(1.4, 3.4)]);
    }
    // shadow
    g.fillStyle = 'rgba(70,45,20,0.2)';
    blobPath(g, radii, 1.4, 2.4);
    g.fill();
    for (const [x, y, s] of drops) {
      g.beginPath();
      g.arc(x + 1, y + 1.6, s, 0, TAU);
      g.fill();
    }
    const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r * 1.2);
    grad.addColorStop(0, col.light);
    grad.addColorStop(0.45, col.hex);
    grad.addColorStop(1, col.dark);
    g.fillStyle = grad;
    blobPath(g, radii);
    g.fill();
    g.strokeStyle = rgba(col.dark, 0.5);
    g.lineWidth = 0.8;
    g.stroke();
    for (const [x, y, s] of drops) {
      g.fillStyle = col.hex;
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.arc(x - s * 0.3, y - s * 0.35, s * 0.35, 0, TAU);
      g.fill();
    }
    // wet gloss
    g.save();
    g.translate(-r * 0.36, -r * 0.42);
    g.rotate(-0.6);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.ellipse(0, 0, r * 0.36, r * 0.15, 0, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(r * 0.28, -r * 0.55, 1.6, 0, TAU);
    g.fill();
    // its shape
    g.fillStyle = rgba(col.ink, 0.85);
    glyphPath(g, col.glyph, r * 0.34);
    g.fill();
  });
}

function paintBadge(col) {
  return makeSprite(24, 24, (g) => {
    g.fillStyle = 'rgba(60,40,20,0.3)';
    g.beginPath();
    g.arc(0.6, 1.2, 8.6, 0, TAU);
    g.fill();
    const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 9);
    gr.addColorStop(0, col.light);
    gr.addColorStop(0.6, col.hex);
    gr.addColorStop(1, col.dark);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 8.4, 0, TAU);
    g.fill();
    g.strokeStyle = '#fffaf0';
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = col.ink;
    glyphPath(g, col.glyph, 3.7);
    g.fill();
  });
}

function dropPath(g) {
  g.beginPath();
  g.moveTo(0, 19);
  g.bezierCurveTo(6, 12, 12, 6, 12, -4);
  g.arc(0, -4, 12, 0, Math.PI, true);
  g.bezierCurveTo(-12, 6, -6, 12, 0, 19);
  g.closePath();
}

function paintDrop(col) {
  return makeSprite(36, 46, (g) => {
    g.save();
    g.translate(1.5, 2.5);
    g.fillStyle = 'rgba(60,40,20,0.25)';
    dropPath(g);
    g.fill();
    g.restore();
    const gr = g.createRadialGradient(-4, -9, 1, 0, -2, 22);
    gr.addColorStop(0, col.light);
    gr.addColorStop(0.45, col.hex);
    gr.addColorStop(1, col.dark);
    g.fillStyle = gr;
    dropPath(g);
    g.fill();
    g.strokeStyle = rgba(col.dark, 0.8);
    g.lineWidth = 1.2;
    g.stroke();
    // gloss
    g.save();
    g.translate(-5.5, -10);
    g.rotate(0.5);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(0, 0, 2.8, 5, 0, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(5.5, -12, 1.3, 0, TAU);
    g.fill();
    // a happy little face, looking up the canvas
    for (const ex of [-4.4, 4.4]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(ex, -3, 3, 3.6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#1d1630';
      g.beginPath();
      g.arc(ex + 0.2, -4, 1.8, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex - 0.4, -4.8, 0.65, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#1d1630';
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, 2, 2.4, 0.25, Math.PI - 0.25);
    g.stroke();
    g.fillStyle = 'rgba(255,120,140,0.35)';
    for (const ex of [-7.6, 7.6]) {
      g.beginPath();
      g.ellipse(ex, 1.6, 2, 1.2, 0, 0, TAU);
      g.fill();
    }
    // its shape on its tummy
    g.fillStyle = rgba(col.ink, 0.75);
    g.save();
    g.translate(0, 10);
    glyphPath(g, col.glyph, 2.3);
    g.fill();
    g.restore();
  });
}

function paintSplat(col) {
  return makeSprite(80, 80, (g) => {
    const radii = [];
    for (let i = 0; i < 22; i++) radii.push(i % 2 ? 15 + Math.random() * 4 : 20 + Math.random() * 12);
    g.fillStyle = 'rgba(60,40,20,0.22)';
    blobPath(g, radii, 1.5, 2.5);
    g.fill();
    const gr = g.createRadialGradient(-6, -7, 1, 0, 0, 30);
    gr.addColorStop(0, col.light);
    gr.addColorStop(0.45, col.hex);
    gr.addColorStop(1, col.dark);
    g.fillStyle = gr;
    blobPath(g, radii);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-7, -8, 6, 2.6, -0.6, 0, TAU);
    g.fill();
    // dizzy eyes
    g.strokeStyle = '#1d1630';
    g.lineWidth = 1.8;
    g.lineCap = 'round';
    for (const ex of [-5, 5]) {
      g.beginPath();
      g.moveTo(ex - 2.4, -2.4);
      g.lineTo(ex + 2.4, 2.4);
      g.moveTo(ex + 2.4, -2.4);
      g.lineTo(ex - 2.4, 2.4);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(0, 7, 2.6, 1.8, 0, 0, TAU);
    g.stroke();
  });
}

function paintCard(w) {
  return makeSprite(w, GATE_H, (g) => {
    g.translate(-w / 2, -GATE_H / 2);
    const cg = g.createLinearGradient(0, 0, 0, GATE_H);
    cg.addColorStop(0, '#dcb682');
    cg.addColorStop(0.5, '#c99c66');
    cg.addColorStop(1, '#b0844f');
    g.fillStyle = cg;
    g.fillRect(0, 0, w, GATE_H);
    // corrugation and fibres
    for (let x = 0; x < w; x += 4) {
      g.fillStyle = 'rgba(120,80,40,0.1)';
      g.fillRect(x, 0, 1.4, GATE_H);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,30,0.18)' : 'rgba(255,235,200,0.2)';
      g.fillRect(Math.random() * w, Math.random() * GATE_H, Math.random() * 3 + 0.5, 0.7);
    }
    // old paint dabs from earlier coats
    const dabs = ['rgba(230,57,70,0.35)', 'rgba(47,120,224,0.3)', 'rgba(255,198,39,0.4)', 'rgba(37,176,106,0.3)'];
    for (let i = 0; i < 14; i++) {
      g.fillStyle = dabs[i % dabs.length];
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * GATE_H, Math.random() * 2.2 + 0.6, 0, TAU);
      g.fill();
    }
    // stencilled lettering
    g.font = `800 8px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(70,45,20,0.22)';
    for (let x = 60; x < w; x += 150) g.fillText('WET PAINT', x, GATE_H / 2 + 0.5);
    g.fillStyle = 'rgba(255,240,210,0.65)';
    g.fillRect(0, 0, w, 1.5);
    g.fillStyle = 'rgba(80,50,20,0.55)';
    g.fillRect(0, GATE_H - 2, w, 2);
  });
}

function paintStudioLight(W, H) {
  return makeSprite(W, H, (g) => {
    const gr = g.createRadialGradient(-W * 0.35, -H * 0.5, 10, -W * 0.35, -H * 0.5, H * 0.75);
    gr.addColorStop(0, 'rgba(255,250,235,0.35)');
    gr.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = gr;
    g.fillRect(-W / 2, -H / 2, W, H);
  }, 1);
}

export default {
  id: 'wetpaint',
  title: 'Wet Paint',
  emoji: '🎨',
  tagline: 'Roll through paint to change colour. Only pass windows of your colour.',
  colors: { bg: '#f3ead8', fg: '#2b2340', accent: '#e63946' },

  // Jersey club at 140 BPM in B♭ major: bouncy club kicks, squeaks, a sunny square hook.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("[bb2 ~ ~ bb2] [~ ~ bb2 ~] [bb2 ~ bb2 ~] [bb2 ~ bb2 bb2]").s("sine").decay(0.16).sustain(0).gain(0.8)
      const kick2 = note("[bb2 ~ bb2 bb2] [~ bb2 bb2 ~] [bb2 ~ bb2 ~] [bb2 bb2 bb2 bb2]").s("sine").decay(0.14).sustain(0).gain(0.75)
      const snare = s("~ pink ~ pink").decay(0.14).sustain(0).hpf(1200).lpf(5200).gain(0.17).room(0.15)
      const clap = s("~ ~ ~ [~ pink] ~ [~ pink] ~ pink").decay(0.1).sustain(0).hpf(1500).lpf(5000).gain(0.1).room(0.25)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ ~ white ~]*2").decay(0.15).sustain(0).hpf(6500).gain(0.03)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const squeak = note("[~ ~ ~ ~ ~ ~ f6 ~ ~ ~ ~ ~ ~ ~ d6 f6]").s("square").decay(0.05).sustain(0).lpf(3000).gain(0.035).pan(0.65)
      const bass = note("<[bb2 ~ ~ bb2 ~ ~ bb3 ~ bb2 ~ ~ f3 ~ ~ bb2 ~] [g2 ~ ~ g2 ~ ~ g3 ~ g2 ~ ~ d3 ~ ~ g2 ~] [eb2 ~ ~ eb2 ~ ~ eb3 ~ eb2 ~ ~ bb2 ~ ~ eb3 ~] [f2 ~ ~ f2 ~ ~ f3 ~ f2 ~ ~ c3 ~ ~ a2 ~]>")
        .s("sawtooth").decay(0.14).sustain(0.2).release(0.05).lpf(saw.range(450, 1800).slow(35)).lpq(5).gain(0.38)
      const chords = "<[bb3,d4,f4] [g3,bb3,d4] [eb3,g3,bb3] [f3,a3,c4]>"
      const stabs = note(chords).struct("~ x ~ x ~ ~ x ~").s("triangle").decay(0.2).sustain(0.05).release(0.08).gain(0.13).room(0.3)
      const stabs2 = note(chords).add(note(12)).struct("~ x ~ x ~ ~ x ~").s("sawtooth").decay(0.1).sustain(0.1).release(0.04)
        .lpf(saw.range(1200, 3200).slow(35)).gain(0.04).pan(0.4)
      const pad = note(chords).s("sawtooth").attack(0.2).sustain(0.8).release(0.4).lpf(1100).gain(0.05).room(0.4)
      const tune = "<[f5 ~ d5 f5 ~ bb5 ~ a5] [g5 ~ d5 bb4 ~ d5 f5 ~] [eb5 ~ g5 bb5 ~ c6 ~ bb5] [a5 ~ f5 c5 ~ eb5 d5 c5] [f5 ~ d5 f5 ~ bb5 ~ d6] [c6 bb5 g5 ~ d5 ~ g5 bb5] [eb6 ~ d6 bb5 ~ g5 ~ eb5] [f5 ~ a5 c6 ~ a5 f5 ~]>"
      const lead = note(tune).s("square").decay(0.14).sustain(0.3).release(0.08).lpf(2400)
        .gain(0.075).room(0.25).delay(0.2).delaytime(0.32).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.14).sustain(0.25).release(0.05).lpf(1500).gain(0.05).pan(0.45)
      const arp = note("<[bb4 d5 f5 d5]*4 [g4 bb4 d5 bb4]*4 [eb4 g4 bb4 g4]*4 [f4 a4 c5 a4]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(4000).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(2500).lpf(7000).gain(saw.range(0.005, 0.05).slow(9))
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, bass, stabs)],
      [9, stack(kick, snare, hats, squeak, bass, stabs, lead)],
      [9, stack(kick, snare, clap, hats, shaker, squeak, bass, stabs, stabs2, pad, lead, arp)],
      [9, stack(kick2, snare, clap, hats, open, shaker, squeak, bass, stabs, stabs2, pad, lead, lead2, arp, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- how far the canvas has rolled by time t, so every stencil's height is exact ----
    const N = Math.ceil(72 / STEP);
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + speedAt((i - 0.5) * STEP) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, N - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };

    // ---- the stencils, each with its hidden route: maybe a puddle, then a window ----
    const objs = [];
    const XMIN = EDGE + 26;
    const XMAX = W - EDGE - 26;
    const reach = (dt) => 0.55 * SPEED * dt;
    let prevA = 1.2;
    let exitA = 1.2; // when the drop was last clear of a stencil
    let px = W / 2;
    let col = START;
    for (let k = 0; ; k++) {
      const gap = k === 0 ? 2.2 : lerp(2.1, 1.12, progress(prevA, 60, 1.15));
      const gA = prevA + gap;
      if (gA > 64) break;
      const p = progress(gA, 60, 1.15);
      const n = coloursAt(gA);
      const recolour = k === 0 || plan.chance(lerp(0.72, 0.92, p));
      const target = recolour ? plan.pick([...Array(n).keys()].filter((c) => c !== col)) : col;
      const hw = lerp(37, 24, p);
      const late = clamp((gA - 27) / 28, 0, 1);
      const amp = gA > 27 && plan.chance(lerp(0.5, 0.85, late)) ? lerp(18, 48, late) : 0;
      const om = plan.range(1.2, 1.9);
      const ph = plan.range(0, TAU);
      const sway = (t) => amp * Math.sin(om * t + ph);

      const hold = (GATE_H / 2 + HIT_R) / speedAt(gA) + 0.05; // time spent squeezing through
      const eA = gA - hold;
      const nodes = [{ A: exitA, x: px }];
      let cx = px;
      let cA = exitA;
      const rowA = prevA + gap * plan.range(0.42, 0.55);
      const puds = [];
      if (recolour) {
        const r1 = Math.min(150, reach(rowA - exitA));
        let x = cx + plan.range(-1, 1) * r1;
        if (x < XMIN || x > XMAX) x = 2 * cx - x;
        x = clamp(x, XMIN, XMAX);
        puds.push({ kind: 'pud', A: rowA, x, c: target, v: plan.int(0, 2) });
        nodes.push({ A: rowA, x });
        cx = x;
        cA = rowA;
      }
      const lo = EDGE + hw + 6 + amp;
      const hi = W - EDGE - hw - 6 - amp;
      const r2 = Math.min(160, reach(eA - cA));
      let x0 = clamp(cx - sway(eA), lo, hi);
      for (let tries = 0; tries < 20; tries++) {
        const c = clamp(cx + plan.range(-1, 1) * r2 - sway(eA), lo, hi);
        if (Math.abs(c + sway(eA) - cx) <= r2) {
          x0 = c;
          break;
        }
      }
      const wins = [{ x0, c: target }];
      const pool = plan.shuffle([...Array(n).keys()].filter((c) => c !== target && !(recolour && c === col)));
      const want = Math.min(pool.length, 1 + (p > 0.12 ? 1 : 0) + (p > 0.45 && plan.chance(0.6) ? 1 : 0));
      for (let i = 0; i < want; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const x = plan.range(lo, hi);
          if (wins.every((w) => Math.abs(w.x0 - x) >= 2 * hw + 24)) {
            wins.push({ x0: x, c: pool[i] });
            break;
          }
        }
      }
      wins.sort((a, b) => a.x0 - b.x0);
      const wx = x0 + sway(gA + hold);
      nodes.push({ A: eA, x: x0 + sway(eA) }, { A: gA + hold, x: wx });

      // the stray puddles: never on the route, never the colour you need
      const routeX = (t) => {
        for (let i = 1; i < nodes.length; i++) {
          if (t <= nodes[i].A) return lerp(nodes[i - 1].x, nodes[i].x, (t - nodes[i - 1].A) / (nodes[i].A - nodes[i - 1].A));
        }
        return nodes[nodes.length - 1].x;
      };
      const clearOfRoute = (A, x) => {
        for (let j = -10; j <= 10; j++) {
          const t = A + j * 0.02;
          if (t < nodes[0].A || t > gA + hold) continue;
          if (Math.abs(routeX(t) - x) < PUD_R + DROP_R + 14) return false;
        }
        return true;
      };
      const band = PUD_R + GATE_H / 2 + 16;
      const dpool = [...Array(n).keys()].filter((c) => c !== target);
      const nd = (recolour ? 1 : 2) + (plan.chance(lerp(0.3, 0.85, p)) ? 1 : 0) + (plan.chance(lerp(-0.2, 0.5, p)) ? 1 : 0);
      for (let i = 0; i < nd; i++) {
        const trap = gA > 18 && i === nd - 1 && plan.chance(lerp(0.2, 0.6, p)) && rowA + 0.28 < gA - 0.3;
        const c = plan.pick(dpool);
        for (let tries = 0; tries < 14; tries++) {
          const A = trap ? plan.range(rowA + 0.28, gA - 0.3) : rowA + plan.range(-0.1, 0.1);
          const x = plan.range(EDGE + 20, W - EDGE - 20);
          const cs = cumAt(A);
          if (cumAt(gA) - cs < band || cs - cumAt(prevA) < band) continue;
          if (!clearOfRoute(A, x)) continue;
          if (puds.some((o) => Math.abs(cumAt(o.A) - cs) < 2 * PUD_R + 8 && Math.abs(o.x - x) < 2 * PUD_R + 8)) continue;
          puds.push({ kind: 'pud', A, x, c, v: plan.int(0, 2) });
          break;
        }
      }
      objs.push(...puds, { kind: 'gate', A: gA, wins, hw, amp, om, ph });
      prevA = gA;
      exitA = gA + hold;
      px = wx;
      col = target;
    }
    for (const o of objs) {
      o.cs = cumAt(o.A);
    }
    objs.sort((a, b) => a.cs - b.cs);

    // ---- art ----
    const canvasArt = paintCanvas(W, H, art);
    const puddles = COLS.map((c) => [0, 1, 2].map(() => paintPuddle(c, art)));
    const badges = COLS.map(paintBadge);
    const drops = COLS.map(paintDrop);
    const glows = COLS.map((c) => glowSprite(rgba(c.hex, 0.55), 34));
    const whiteGlow = glowSprite('rgba(255,255,255,0.9)', 30);
    const card = paintCard(W + 160);
    const cardK = card.canvas.width / card.w;
    const light = paintStudioLight(W, H);
    const vignette = vignetteSprite(W, H, 0.38, '90,55,20');
    let splat = null;

    // ---- cosmetic state ----
    const drips = createParticles();
    const splash = createParticles();
    const trail = [];

    // ---- run state ----
    const mover = createMover({ x: W / 2, minX: EDGE + DROP_R + 2, maxX: W - EDGE - DROP_R - 2, speed: SPEED, accel: 20 });
    const live = [];
    let next = 0;
    let time = 0;
    let clock = 0;
    let flow = speedAt(0);
    let colour = START;
    let prevColour = START;
    let mixT = 1;
    let trailTick = 0;
    let culprit = null; // { gate, win } that ended the run
    let shake = 0;

    const shiftOf = (o, t) => o.amp * Math.sin(o.om * t + o.ph);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir) {
        if (this.dead) return;
        time += dt;
        clock += dt;
        flow = speedAt(time);
        mover.update(dt, dir);
        const base = cumAt(time);
        while (next < objs.length && objs[next].cs - base < PY + 90) live.push(objs[next++]);
        const x = mover.x;

        for (let i = live.length - 1; i >= 0; i--) {
          const o = live[i];
          o.y = PY - (o.cs - base);
          if (o.y > H + 70) {
            live.splice(i, 1);
            continue;
          }
          if (o.kind === 'pud') {
            const dx = o.x - x;
            const dy = o.y - PY;
            const r = PUD_R * 0.85 + DROP_R;
            if (dx * dx + dy * dy < r * r) {
              if (colour !== o.c) {
                prevColour = colour;
                colour = o.c;
                mixT = 0;
                o.hit = clock;
                const c = COLS[o.c];
                splash.burst(x, PY, { count: 18, speed: 150, life: 0.55, size: 4, colors: [c.hex, c.light, c.dark], gravity: 0, drag: 3, round: true });
              }
            }
            continue;
          }
          // a stencil
          const top = o.y - GATE_H / 2;
          const bot = o.y + GATE_H / 2;
          if (o.passed) continue;
          if (PY + HIT_R > top && PY - HIT_R < bot) {
            const sh = shiftOf(o, time);
            const win = o.wins.find((w) => x - HIT_R >= w.x0 + sh - o.hw && x + HIT_R <= w.x0 + sh + o.hw);
            if (!win) {
              culprit = { gate: o, win: null };
              this.die('Splattered against the cardboard stencil.');
              return;
            }
            if (win.c !== colour) {
              culprit = { gate: o, win };
              this.die(`Only ${COLS[win.c].name} paint gets through a ${COLS[win.c].name} window, and you were ${COLS[colour].name}.`);
              return;
            }
          } else if (top >= PY + HIT_R) {
            o.passed = true;
            o.flash = clock;
            const c = COLS[colour];
            splash.burst(x, o.y - 4, { count: 22, speed: 190, life: 0.7, size: 3.4, colors: [c.hex, c.light, '#ffffff'], gravity: 260, angle: -Math.PI / 2, spread: 2.2, round: true });
          }
        }

        mixT = Math.min(1, mixT + dt / 0.18);
        // the drop paints a stripe up the canvas as it goes
        trailTick += dt;
        if (trailTick >= 1 / 40) {
          trailTick = 0;
          trail.push({ x, wy: base, c: colour });
          while (trail.length && PY + (base - trail[0].wy) > H + 30) trail.shift();
        }
        if (Math.abs(mover.vx) > 120 && Math.random() < dt * 14) {
          const c = COLS[colour];
          drips.burst(x - Math.sign(mover.vx) * 8, PY + 12, { count: 1, speed: 30, life: 0.7, size: 3.4, colors: [c.hex, c.dark], round: true, angle: Math.PI / 2, spread: 1.2 });
        }
        drips.update(dt, flow);
        splash.update(dt, flow * 0.5);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        const c = COLS[colour];
        splat = paintSplat(c);
        shake = 0.35;
        splash.burst(mover.x, PY, { count: 46, speed: 260, life: 0.9, size: 5, colors: [c.hex, c.light, c.dark], drag: 2.5, round: true });
      },

      afterlife(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        drips.update(dt);
        splash.update(dt);
      },

      render(g) {
        const base = cumAt(time);
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

        // the canvas, rolling down towards the drop
        const off = base % H;
        g.drawImage(canvasArt.canvas, 0, off - H, W, H);
        g.drawImage(canvasArt.canvas, 0, off, W, H);
        drawSprite(g, light, W / 2, H / 2);

        // paint puddles
        for (const o of live) {
          if (o.kind !== 'pud') continue;
          const wob = o.hit ? 1 + 0.18 * Math.max(0, 1 - (clock - o.hit) / 0.35) * Math.sin((clock - o.hit) * 30) : 1;
          drawSprite(g, puddles[o.c][o.v], o.x, o.y, { size: 64 * wob });
        }

        // the stripe the drop has painted
        if (trail.length > 1) {
          g.lineCap = 'round';
          g.lineJoin = 'round';
          const pts = trail.map((p) => [p.x, PY + 8 + (base - p.wy), p.c]);
          if (!this.dead) pts.push([mover.x, PY + 8, colour]);
          for (const [lw, alpha, dx, white] of [[11, 0.5, 0, false], [3, 0.3, -2.5, true]]) {
            g.lineWidth = lw;
            let i = 0;
            while (i < pts.length - 1) {
              const c = pts[i + 1][2];
              g.strokeStyle = white ? `rgba(255,255,255,${alpha})` : rgba(COLS[c].hex, alpha);
              g.beginPath();
              g.moveTo(pts[i][0] + dx, pts[i][1]);
              while (i < pts.length - 1 && pts[i + 1][2] === c) {
                i++;
                g.lineTo(pts[i][0] + dx, pts[i][1]);
              }
              g.stroke();
            }
          }
        }

        // the stencils
        const pulse = 0.5 + 0.5 * Math.sin(clock * 9);
        for (const o of live) {
          if (o.kind !== 'gate') continue;
          const sh = shiftOf(o, time);
          const top = o.y - GATE_H / 2;
          const cuts = [];
          let a = -12;
          for (const w of o.wins) {
            const wx = w.x0 + sh;
            cuts.push([a, wx - o.hw]);
            a = wx + o.hw;
          }
          cuts.push([a, W + 12]);
          g.fillStyle = 'rgba(70,45,20,0.22)';
          for (const [x0, x1] of cuts) if (x1 > x0) g.fillRect(x0 + 2, top + 5, x1 - x0, GATE_H);
          for (const [x0, x1] of cuts) {
            if (x1 <= x0) continue;
            const sx = clamp(x0 - sh + 80, 0, card.w - (x1 - x0));
            g.drawImage(card.canvas, sx * cardK, 0, (x1 - x0) * cardK, GATE_H * cardK, x0, top, x1 - x0, GATE_H);
          }
          for (const w of o.wins) {
            const wx = w.x0 + sh;
            const c = COLS[w.c];
            const mine = w.c === colour && !o.passed && !this.dead;
            if (mine) drawSprite(g, glows[w.c], wx, o.y, { size: o.hw * 3.4, alpha: 0.45 + 0.35 * pulse });
            g.fillStyle = rgba(c.hex, mine ? 0.32 : 0.2);
            g.fillRect(wx - o.hw, top, o.hw * 2, GATE_H);
            // glazing sheen
            g.fillStyle = 'rgba(255,255,255,0.22)';
            g.beginPath();
            g.moveTo(wx - o.hw + 6, top + GATE_H);
            g.lineTo(wx - o.hw + 16, top);
            g.lineTo(wx - o.hw + 22, top);
            g.lineTo(wx - o.hw + 12, top + GATE_H);
            g.closePath();
            g.fill();
            g.fillStyle = 'rgba(80,50,20,0.35)';
            g.fillRect(wx - o.hw, top, 2, GATE_H);
            g.strokeStyle = c.hex;
            g.lineWidth = mine ? 3 + pulse : 2.6;
            g.beginPath();
            g.roundRect(wx - o.hw + 1.5, top + 1.5, o.hw * 2 - 3, GATE_H - 3, 4);
            g.stroke();
            if (o.flash && clock - o.flash < 0.4) {
              drawSprite(g, whiteGlow, wx, o.y, { size: o.hw * 3, alpha: 1 - (clock - o.flash) / 0.4 });
            }
            drawSprite(g, badges[w.c], wx, o.y, { size: 21 });
          }
          if (culprit && culprit.gate === o && culprit.win) {
            const wx = culprit.win.x0 + sh;
            g.strokeStyle = `rgba(200,20,40,${0.6 + 0.4 * pulse})`;
            g.lineWidth = 3.5;
            g.beginPath();
            g.roundRect(wx - o.hw - 2, top - 2, o.hw * 2 + 4, GATE_H + 4, 6);
            g.stroke();
          }
        }

        // the drop
        const x = mover.x;
        if (this.dead && splat) {
          drawSprite(g, splat, x, PY - 4);
          if (culprit && !culprit.win) {
            g.strokeStyle = `rgba(200,20,40,${0.6 + 0.4 * pulse})`;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(x, PY - 4, 30, 0, TAU);
            g.stroke();
          }
        } else {
          drawSprite(g, glows[colour], x, PY, { size: 70, alpha: 0.4 });
          const lean = mover.lean;
          const wob = Math.sin(clock * 11) * 0.04;
          const draw = (c, alpha) => {
            const s = drops[c];
            g.save();
            g.translate(x, PY);
            g.rotate(-lean * 0.32);
            g.scale(1 - wob - Math.abs(lean) * 0.05, 1 + wob + Math.abs(lean) * 0.06);
            g.globalAlpha = alpha;
            g.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
            g.restore();
          };
          if (mixT < 1) draw(prevColour, 1);
          draw(colour, easeOutCubic(mixT));
          g.globalAlpha = 1;
        }

        drips.render(g);
        splash.render(g);
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
