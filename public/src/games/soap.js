// Soap Slide — a bar of rose soap on a wet, tiled bathroom floor. It's so slippery that a tap
// can't just nudge it: every tap sends it sliding that way until something stops it. A bottle,
// a rubber duck or any other solid thing beside it stops it next to that thing, a fluffy bath
// mat stops it on top, and the wall stops it at the edge. A drain doesn't stop anything: slide
// over one and you're gone. The floor scrolls down at you, and anything solid reaching the soap
// (or a drain sliding under it) ends the run. So every move is a little ice puzzle in real time:
// wait until the right thing is beside you, then tap. Ghost outlines show where a slide either
// way would stop right now.

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

const TAU = Math.PI * 2;
const COLS = 7;
const CW = 48; // lane width
const X0 = 12; // left wall
const PY = 540; // the soap's centre on screen
const RH = 84; // distance between rows of things
const IH = 23; // half the length of a thing's footprint along the floor
const BH = 15; // half the soap's length along the floor
const FIRST = 420; // distance to the first row
const SLIDE_V = 1500; // px/s while sliding
const v0 = 100;
const v1 = 176;

const cx = (c) => X0 + CW * (c + 0.5);
const speedAt = (t) => lerp(v0, v1, progress(t, 60, 1.5));
const rowD = (r) => FIRST + r * RH;

// constraint codes for the planner
const ANY = 0;
const FREE = 1;
const BLOCK = 2;
const MAT = 3;
const THREAT = 4;

// ---------- art ----------

const INK = '#2b1d33';

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function makeSoap(mood) {
  return makeSprite(48, 40, (g) => {
    // soft shadow
    g.fillStyle = 'rgba(20,50,50,0.28)';
    g.beginPath();
    g.ellipse(1, 15, 22, 6, 0, 0, TAU);
    g.fill();
    // front face (thickness of the bar)
    rr(g, -21, -13, 42, 30, 10);
    g.fillStyle = '#c23a76';
    g.fill();
    // top face
    rr(g, -21, -16, 42, 27, 10);
    const gr = g.createLinearGradient(0, -16, 0, 11);
    gr.addColorStop(0, '#ffd6e8');
    gr.addColorStop(0.45, '#ff8fc0');
    gr.addColorStop(1, '#f0609e');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#8e1f55';
    g.lineWidth = 1.6;
    rr(g, -21, -16, 42, 33, 10);
    g.stroke();
    // carved oval
    g.strokeStyle = 'rgba(160,30,90,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, -2.5, 15, 9.5, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,240,248,0.6)';
    g.beginPath();
    g.ellipse(0.6, -1.9, 15, 9.5, 0, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
    // face carved in the soap
    g.lineCap = 'round';
    if (mood === 'ouch') {
      g.strokeStyle = '#6a0f3c';
      g.lineWidth = 1.8;
      for (const ex of [-6, 6]) {
        g.beginPath();
        g.moveTo(ex - 2.5, -6.5);
        g.lineTo(ex + 2.5, -1.5);
        g.moveTo(ex + 2.5, -6.5);
        g.lineTo(ex - 2.5, -1.5);
        g.stroke();
      }
      g.fillStyle = '#6a0f3c';
      g.beginPath();
      g.ellipse(0, 3.5, 3, 2.4, 0, 0, TAU);
      g.fill();
    } else {
      for (const ex of [-6, 6]) {
        g.fillStyle = '#4a0a2a';
        g.beginPath();
        g.ellipse(ex, -4, 2.3, 2.8, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex + 0.8, -5, 0.9, 0, TAU);
        g.fill();
      }
      g.strokeStyle = '#6a0f3c';
      g.lineWidth = 1.5;
      g.beginPath();
      if (mood === 'whee') g.ellipse(0, 2.2, 3, 2.4, 0, 0, Math.PI);
      else g.arc(0, 0.5, 3.2, 0.3, Math.PI - 0.3);
      g.stroke();
      g.fillStyle = 'rgba(255,90,140,0.55)';
      for (const ex of [-11, 11]) {
        g.beginPath();
        g.ellipse(ex, 0, 2.6, 1.5, 0, 0, TAU);
        g.fill();
      }
    }
    // gloss
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(-11, -12, 7, 2.2, -0.15, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(14, -11.5, 1.3, 0, TAU);
    g.fill();
    // a crown of suds on top
    for (const [x, y, r] of [[-15, -15, 3.4], [-10, -17, 4], [-4, -16, 3], [9, -16.5, 3.3], [14, -15, 2.6]]) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(170,200,220,0.6)';
      g.lineWidth = 0.6;
      g.stroke();
    }
  });
}

function itemShadow(g, w, y) {
  g.fillStyle = 'rgba(20,55,55,0.3)';
  g.beginPath();
  g.ellipse(2, y, w, 5.5, 0, 0, TAU);
  g.fill();
}

function makeBottle(body, dark, label, pump) {
  return makeSprite(48, 54, (g) => {
    itemShadow(g, 18, 22);
    // body
    g.beginPath();
    g.moveTo(-14, 22);
    g.lineTo(-14, -6);
    g.quadraticCurveTo(-14, -13, -7, -14);
    g.lineTo(7, -14);
    g.quadraticCurveTo(14, -13, 14, -6);
    g.lineTo(14, 22);
    g.closePath();
    const gr = g.createLinearGradient(-14, 0, 14, 0);
    gr.addColorStop(0, dark);
    gr.addColorStop(0.3, body);
    gr.addColorStop(0.65, body);
    gr.addColorStop(1, dark);
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // label
    rr(g, -10, -2, 20, 15, 3);
    g.fillStyle = label;
    g.fill();
    g.fillStyle = dark;
    g.fillRect(-6, 2, 12, 2);
    g.fillRect(-7, 6.5, 14, 1.5);
    g.fillRect(-5, 9.5, 10, 1.2);
    // neck and cap
    if (pump) {
      rr(g, -5, -20, 10, 7, 2);
      g.fillStyle = '#f4f1ea';
      g.fill();
      g.stroke();
      rr(g, -2, -26, 4, 7, 1);
      g.fillStyle = '#e8e3d8';
      g.fill();
      g.stroke();
      rr(g, -2, -27, 12, 4, 2);
      g.fill();
      g.stroke();
    } else {
      rr(g, -8, -23, 16, 10, 3);
      g.fillStyle = '#fbf8f0';
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(-8, -16, 16, 2);
    }
    // gloss
    g.fillStyle = 'rgba(255,255,255,0.55)';
    rr(g, -11, -8, 3.5, 26, 2);
    g.fill();
  });
}

function makeDuck() {
  return makeSprite(48, 54, (g) => {
    itemShadow(g, 19, 21);
    // body
    g.beginPath();
    g.moveTo(-17, 4);
    g.quadraticCurveTo(-20, 21, 2, 21);
    g.quadraticCurveTo(19, 21, 18, 6);
    g.quadraticCurveTo(17, -2, 8, 0);
    g.lineTo(-10, 2);
    g.quadraticCurveTo(-17, -2, -17, 4);
    g.closePath();
    const gr = g.createLinearGradient(0, -2, 0, 21);
    gr.addColorStop(0, '#fff27a');
    gr.addColorStop(0.6, '#ffd21c');
    gr.addColorStop(1, '#e8a400');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // wing
    g.strokeStyle = 'rgba(190,120,0,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-6, 8);
    g.quadraticCurveTo(2, 16, 10, 8);
    g.stroke();
    // head
    g.beginPath();
    g.arc(-4, -9, 10, 0, TAU);
    g.fillStyle = '#ffe23a';
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // beak
    g.beginPath();
    g.moveTo(-13, -9);
    g.quadraticCurveTo(-22, -10, -21, -5);
    g.quadraticCurveTo(-16, -3, -11, -5);
    g.closePath();
    g.fillStyle = '#ff7a1a';
    g.fill();
    g.stroke();
    // eye
    g.fillStyle = INK;
    g.beginPath();
    g.arc(-6, -11, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(-5.4, -11.7, 0.7, 0, TAU);
    g.fill();
    // gloss
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-1, -15, 4, 2, -0.4, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(8, 6, 4, 1.6, -0.3, 0, TAU);
    g.fill();
  });
}

function makeJar() {
  return makeSprite(48, 54, (g) => {
    itemShadow(g, 18, 22);
    // glass
    rr(g, -14, -12, 28, 34, 7);
    const gr = g.createLinearGradient(-14, 0, 14, 0);
    gr.addColorStop(0, 'rgba(170,215,230,0.9)');
    gr.addColorStop(0.5, 'rgba(225,245,250,0.75)');
    gr.addColorStop(1, 'rgba(150,200,220,0.9)');
    g.fillStyle = gr;
    g.fill();
    // amber bath salts inside
    g.save();
    rr(g, -12, -2, 24, 22, 6);
    g.clip();
    const sg = g.createLinearGradient(0, -2, 0, 22);
    sg.addColorStop(0, '#ffc95c');
    sg.addColorStop(1, '#e8840c');
    g.fillStyle = sg;
    g.fillRect(-14, -2, 28, 26);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 18; i++) g.fillRect(-11 + ((i * 7.3) % 22), 0 + ((i * 5.1) % 19), 1.6, 1.6);
    g.restore();
    rr(g, -14, -12, 28, 34, 7);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // cork
    rr(g, -9, -22, 18, 11, 3);
    const cg = g.createLinearGradient(0, -22, 0, -11);
    cg.addColorStop(0, '#e0b27a');
    cg.addColorStop(1, '#a8743c');
    g.fillStyle = cg;
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(90,50,20,0.5)';
    for (const [x, y] of [[-4, -18], [3, -15], [5, -19], [-2, -14]]) g.fillRect(x, y, 1.4, 1.4);
    // twine and tag
    g.strokeStyle = '#7a4b2a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-14, -9);
    g.lineTo(14, -9);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    rr(g, -10.5, -9, 3, 26, 1.5);
    g.fill();
  });
}

function makeBrush() {
  const len = RH + IH * 2; // two rows long
  return makeSprite(48, len + 8, (g) => {
    const top = -len / 2;
    const bot = len / 2;
    g.fillStyle = 'rgba(20,55,55,0.3)';
    rr(g, -12, top + 6, 28, len, 12);
    g.fill();
    // wooden handle
    rr(g, -5, top + 44, 10, len - 46, 5);
    const hg = g.createLinearGradient(-5, 0, 5, 0);
    hg.addColorStop(0, '#9a5a28');
    hg.addColorStop(0.45, '#e2a564');
    hg.addColorStop(1, '#8a4c1e');
    g.fillStyle = hg;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = 'rgba(110,60,20,0.5)';
    g.lineWidth = 0.8;
    for (let y = top + 52; y < bot - 6; y += 9) {
      g.beginPath();
      g.moveTo(-2, y);
      g.quadraticCurveTo(0, y + 3, 2, y + 6);
      g.stroke();
    }
    // hole for hanging
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(0, bot - 9, 2, 3, 0, 0, TAU);
    g.fill();
    // brush head
    g.beginPath();
    g.ellipse(0, top + 24, 17, 22, 0, 0, TAU);
    const bg = g.createLinearGradient(-17, 0, 17, 0);
    bg.addColorStop(0, '#9a5a28');
    bg.addColorStop(0.5, '#e8b070');
    bg.addColorStop(1, '#8a4c1e');
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // bristles
    g.beginPath();
    g.ellipse(0, top + 24, 12.5, 17, 0, 0, TAU);
    g.fillStyle = '#f6efe0';
    g.fill();
    g.fillStyle = '#c9bca2';
    for (let i = -2; i <= 2; i++) {
      for (let j = -3; j <= 3; j++) {
        if (i * i * 0.09 + j * j * 0.05 > 0.75) continue;
        g.beginPath();
        g.arc(i * 4.6, top + 24 + j * 4.6, 1.3, 0, TAU);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-8, top + 12, 3, 6, 0.3, 0, TAU);
    g.fill();
  });
}

function makeTowel() {
  const len = RH * 2 + IH * 2; // three rows long
  return makeSprite(48, len + 8, (g) => {
    const top = -len / 2;
    g.fillStyle = 'rgba(20,55,55,0.3)';
    rr(g, -17, top + 5, 38, len, 16);
    g.fill();
    // rolled towel lying lengthwise
    rr(g, -19, top, 38, len, 17);
    const tg = g.createLinearGradient(-19, 0, 19, 0);
    tg.addColorStop(0, '#d8423a');
    tg.addColorStop(0.35, '#ff7a6b');
    tg.addColorStop(0.6, '#ff8a7a');
    tg.addColorStop(1, '#c2342e');
    g.fillStyle = tg;
    g.fill();
    // terry texture
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = top + 6; y < top + len - 6; y += 4) {
      for (let x = -15; x < 15; x += 4) g.fillRect(x + ((y / 4) % 2) * 2, y, 1.2, 1.2);
    }
    // white stripes
    for (const f of [0.18, 0.24, 0.76, 0.82]) {
      const y = top + len * f;
      g.fillStyle = 'rgba(255,248,240,0.9)';
      g.fillRect(-19, y, 38, 4);
    }
    rr(g, -19, top, 38, len, 17);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.stroke();
    // the spiral end of the roll
    g.strokeStyle = 'rgba(120,20,20,0.55)';
    g.lineWidth = 1.4;
    for (const yy of [top + 15, top + len - 15]) {
      g.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.2) {
        const r = 2 + a * 1.6;
        const px = Math.cos(a) * r;
        const py = yy + Math.sin(a) * r * 0.45;
        if (a === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.3)';
    rr(g, -13, top + 30, 5, len - 60, 3);
    g.fill();
  });
}

function makeDrain() {
  return makeSprite(52, 52, (g) => {
    // wet ring around it
    g.fillStyle = 'rgba(40,110,120,0.22)';
    g.beginPath();
    g.ellipse(0, 1, 25, 24, 0, 0, TAU);
    g.fill();
    // chrome rim
    g.beginPath();
    g.arc(0, 0, 21, 0, TAU);
    const cg = g.createLinearGradient(-21, -21, 21, 21);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.4, '#a9b7c2');
    cg.addColorStop(0.6, '#6c7b88');
    cg.addColorStop(1, '#e6eef3');
    g.fillStyle = cg;
    g.fill();
    g.strokeStyle = '#2a3440';
    g.lineWidth = 1.6;
    g.stroke();
    // dark hole
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    const hg = g.createRadialGradient(0, 0, 2, 0, 0, 16);
    hg.addColorStop(0, '#000000');
    hg.addColorStop(0.7, '#0a1620');
    hg.addColorStop(1, '#1d3442');
    g.fillStyle = hg;
    g.fill();
    // grate
    g.strokeStyle = '#c4d0d8';
    g.lineWidth = 2.2;
    g.save();
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    g.clip();
    for (let x = -12; x <= 12; x += 6) {
      g.beginPath();
      g.moveTo(x, -16);
      g.lineTo(x, 16);
      g.stroke();
    }
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(16, 0);
    g.stroke();
    g.restore();
    g.fillStyle = '#e8eef2';
    g.beginPath();
    g.arc(0, 0, 3, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a3440';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(-11, -14, 5, 1.8, -0.6, 0, TAU);
    g.fill();
  });
}

function makeMat(rows) {
  const len = RH * (rows - 1) + IH * 2 + 4;
  return makeSprite(48, len + 14, (g) => {
    const top = -len / 2;
    // fringe
    g.strokeStyle = '#efe6ff';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let x = -18; x <= 18; x += 3.6) {
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x + 0.6, top - 5);
      g.moveTo(x, top + len);
      g.lineTo(x - 0.6, top + len + 5);
      g.stroke();
    }
    rr(g, -22, top, 44, len, 8);
    const mg = g.createLinearGradient(0, top, 0, top + len);
    mg.addColorStop(0, '#b694ff');
    mg.addColorStop(1, '#9a72f2');
    g.fillStyle = mg;
    g.fill();
    // fluffy tufts
    for (let y = top + 4; y < top + len - 3; y += 4.4) {
      for (let x = -19; x < 19; x += 4.4) {
        const o = (Math.round((y - top) / 4.4) % 2) * 2.2;
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.arc(x + o, y, 1.9, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(70,30,150,0.18)';
        g.beginPath();
        g.arc(x + o + 0.8, y + 1, 1.2, 0, TAU);
        g.fill();
      }
    }
    // stitched border
    rr(g, -18.5, top + 3.5, 37, len - 7, 6);
    g.setLineDash([2.5, 2]);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);
    rr(g, -22, top, 44, len, 8);
    g.strokeStyle = '#5b3aa8';
    g.lineWidth = 1.6;
    g.stroke();
  });
}

function makeFloor(W) {
  // 4 rows of tiles (two checker periods), 48 × 42 each, mint and cream
  const TH = RH / 2;
  return makeSprite(W, TH * 4, (g) => {
    g.translate(-W / 2, -TH * 2);
    for (let j = 0; j < 4; j++) {
      for (let c = -1; c <= COLS; c++) {
        const x = X0 + c * CW;
        const y = j * TH;
        const mint = (c + j + 8) % 2 === 0;
        const gr = g.createLinearGradient(x, y, x + CW, y + TH);
        if (mint) {
          gr.addColorStop(0, '#a8e6d2');
          gr.addColorStop(1, '#8fd6bf');
        } else {
          gr.addColorStop(0, '#fbf6e8');
          gr.addColorStop(1, '#ece5d0');
        }
        g.fillStyle = gr;
        g.fillRect(x, y, CW, TH);
        // bevel: light top-left, dark bottom-right
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fillRect(x + 1.5, y + 1.5, CW - 3, 1.5);
        g.fillRect(x + 1.5, y + 1.5, 1.5, TH - 3);
        g.fillStyle = mint ? 'rgba(30,110,90,0.18)' : 'rgba(120,100,60,0.12)';
        g.fillRect(x + 1.5, y + TH - 3, CW - 3, 1.5);
        g.fillRect(x + CW - 3, y + 1.5, 1.5, TH - 3);
        // a glint
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.ellipse(x + 13, y + 9, 7, 2, -0.3, 0, TAU);
        g.fill();
      }
    }
    // grout
    g.fillStyle = '#7fb3a4';
    for (let c = -1; c <= COLS + 1; c++) g.fillRect(X0 + c * CW - 0.75, 0, 1.5, TH * 4);
    for (let j = 0; j <= 4; j++) g.fillRect(0, j * TH - 0.75, W, 1.5);
  }, 2);
}

function makeWalls(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const side of [0, 1]) {
      const x = side ? W - X0 : 0;
      const gr = g.createLinearGradient(x, 0, x + X0, 0);
      if (side) {
        gr.addColorStop(0, '#f6f2ea');
        gr.addColorStop(0.5, '#ffffff');
        gr.addColorStop(1, '#cfc9bd');
      } else {
        gr.addColorStop(0, '#cfc9bd');
        gr.addColorStop(0.5, '#ffffff');
        gr.addColorStop(1, '#f6f2ea');
      }
      g.fillStyle = gr;
      g.fillRect(x, 0, X0, H);
      // chrome trim against the floor
      const tx = side ? W - X0 - 2 : X0;
      g.fillStyle = '#9aa8b3';
      g.fillRect(tx, 0, 2, H);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(tx + (side ? 0 : 1), 0, 1, H);
      // shadow cast on the floor
      const sg = g.createLinearGradient(side ? W - X0 - 10 : X0 + 2, 0, side ? W - X0 - 2 : X0 + 10, 0);
      sg.addColorStop(side ? 1 : 0, 'rgba(20,60,60,0.25)');
      sg.addColorStop(side ? 0 : 1, 'rgba(20,60,60,0)');
      g.fillStyle = sg;
      g.fillRect(side ? W - X0 - 10 : X0 + 2, 0, 8, H);
    }
  }, 1);
}

function makeShade(W) {
  // steamy shade at the top so the timer reads, and window light from the upper left
  return makeSprite(W, 640, (g) => {
    g.translate(-W / 2, -320);
    const top = g.createLinearGradient(0, 0, 0, 120);
    top.addColorStop(0, 'rgba(18,58,62,0.62)');
    top.addColorStop(1, 'rgba(18,58,62,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 120);
    g.fillStyle = 'rgba(255,255,240,0.07)';
    for (const [x0, w] of [[-40, 70], [60, 26], [120, 50]]) {
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + w, 0);
      g.lineTo(x0 + w + 260, 640);
      g.lineTo(x0 + 260, 640);
      g.closePath();
      g.fill();
    }
  }, 1);
}

// ---------- music: surf rock, 156 BPM, G minor over Gm–E♭–F–D ----------

const music = {
  cps: 156 / 240,
  setup: `
    const kick = note("g2 ~ ~ g2 g2 ~ ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("g2 ~ ~ g2 g2 ~ g2 g2").s("sine").decay(0.2).sustain(0).gain(0.8)
    const snare = s("~ pink ~ pink").decay(0.15).sustain(0).hpf(800).lpf(5500).gain(0.15).room(0.35)
    const ride = s("white*8").decay(0.05).sustain(0).hpf(7000).gain("[0.04 0.022]*4")
    const tamb = s("white*16").decay(0.025).sustain(0).hpf(7200).gain("[0.012 0.03 0.018 0.03]*4")
    const toms = note("<~ ~ ~ [~ ~ ~ ~ d3 bb2 g2 d2]>").s("sine").decay(0.16).sustain(0).gain(0.4)
    const bass = note("<[g2 g2 g3 g2 d3 g2 bb2 d3] [eb2 eb2 eb3 eb2 bb2 eb2 g2 bb2] [f2 f2 f3 f2 c3 f2 a2 c3] [d2 d2 d3 d2 a2 d2 f#2 a2]>")
      .s("sawtooth").decay(0.14).sustain(0.2).release(0.04).lpf(saw.range(500, 1800).slow(39)).lpq(4).gain(0.32)
    const riff = note("<[g3 bb3 a3 g3 f3 g3 d3 f3] [eb3 g3 f3 eb3 d3 eb3 bb2 d3] [f3 a3 g3 f3 eb3 f3 c3 eb3] [d3 f#3 e3 d3 c3 d3 a2 c3]>")
      .ply(2).s("sawtooth").decay(0.07).sustain(0.1).release(0.03).lpf(saw.range(1100, 2200).slow(39)).gain(0.06).room(0.4).pan(0.4)
    const chords = "<[g3,bb3,d4] [eb3,g3,bb3] [f3,a3,c4] [d3,f#3,a3]>"
    const chop = note(chords).struct("x ~ ~ x ~ ~ x ~").s("square").decay(0.12).sustain(0).lpf(2200).gain(0.045).room(0.45).pan(0.62)
    const organ = note(chords).add(note(12)).s("square").attack(0.05).release(0.3).lpf(1300).vib(6).vibmod(0.08).gain(0.035).room(0.5)
    const tune = "<[d5@2 g5@2 f5 eb5 d5 bb4] [eb5@3 d5 eb5@2 g5@2] [f5@2 a5@2 g5 f5 eb5 c5] [d5@4 f#5@2 a5@2]>"
    const lead = note(tune).ply(4).s("sawtooth").decay(0.05).sustain(0.2).release(0.03).lpf(2400)
      .gain(0.06).room(0.5).delay(0.2).delaytime(0.288).delayfeedback(0.25).pan(0.55)
    const leadLow = note(tune).add(note(-12)).ply(2).s("square").decay(0.08).sustain(0.2).release(0.03).lpf(1500).gain(0.045)
    const arp = note("<[g5 bb5 d6 bb5]*4 [eb5 g5 bb5 g5]*4 [f5 a5 c6 a5]*4 [d5 f#5 a5 f#5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3800).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(10)).gain(saw.range(0, 0.05).slow(10))
  `,
  song: `arrange(
    [9, stack(kick, snare, ride, bass, riff, chop)],
    [10, stack(kick, snare, ride, tamb, bass, riff, chop, organ, toms)],
    [10, stack(kick, snare, ride, tamb, bass, chop, organ, toms, lead)],
    [10, stack(kick2, snare, ride, tamb, bass, riff, chop, organ, toms, lead, leadLow, arp, wash)]
  )`,
};

export default {
  id: 'soap',
  title: 'Soap Slide',
  emoji: '🧼',
  tagline: 'A tap slides you until something stops you. Dodge it all, skip drains.',
  colors: { bg: '#1f5a5c', fg: '#ffffff', accent: '#ff8fc0' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- the scroll over time (fixed, whatever the player does) ----
    const STEP = 1 / 120;
    const sTable = [0];
    for (let i = 1, s = 0; i <= 120 * 75; i++) {
      s += speedAt((i - 1) * STEP) * STEP;
      sTable.push(s);
    }
    const timeAt = (d) => {
      let lo = 0;
      let hi = sTable.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sTable[mid] < d) lo = mid + 1;
        else hi = mid;
      }
      return lo * STEP;
    };
    const endD = sTable[120 * 60] + 700;

    // ---- plan a route first: where the soap rests while each row passes ----
    // During row r's pass the soap slides from p[r] to p[r+1], stopped by something in row r,
    // and row r+1 then puts something where it was, so it has to go.
    const req = [];
    const stops = [];
    const p = [3];
    const blank = () => new Array(COLS).fill(ANY);
    let nRows = 0;
    while (rowD(nRows) < endD) nRows++;
    for (let r = 0; r < nRows; r++) req.push(blank());
    req.push(blank());
    for (let r = 0; r < nRows; r++) {
      const t = timeAt(rowD(r));
      const P = progress(t, 60, 1.5);
      const rMove = plan.next();
      const rPick = plan.next();
      const rStop = plan.next();
      const a = p[r];
      req[r][a] = FREE;
      let q = a;
      const moveP = r === 0 ? 1 : t < 10 ? 0.5 : lerp(0.52, 0.68, P);
      if (rMove < moveP) {
        const cands = [];
        for (let q2 = 0; q2 < COLS; q2++) {
          if (q2 === a) continue;
          const d = Math.sign(q2 - a);
          let ok = true;
          for (let x = a + d; x !== q2 + d; x += d) if (req[r][x] !== ANY && req[r][x] !== FREE) ok = false;
          if (!ok) continue;
          const opts = [];
          const edge = d < 0 ? 0 : COLS - 1;
          if (q2 === edge) opts.push('wall');
          else if ([ANY, THREAT, BLOCK].includes(req[r][q2 + d])) opts.push('block', 'block');
          if (t > 7 && req[r][q2] === ANY && q2 !== edge) opts.push('mat');
          if (!opts.length) continue;
          const dist = Math.abs(q2 - a);
          const w = dist === 1 ? 0.8 : dist <= 3 ? 1 : 0.55;
          cands.push({ q: q2, d, opts, w });
        }
        if (cands.length) {
          let tot = cands.reduce((s, c) => s + c.w, 0) * rPick;
          let pick = cands[cands.length - 1];
          for (const c of cands) {
            tot -= c.w;
            if (tot <= 0) {
              pick = c;
              break;
            }
          }
          const stop = pick.opts[Math.floor(rStop * pick.opts.length)];
          q = pick.q;
          for (let x = a + pick.d; x !== q; x += pick.d) req[r][x] = FREE;
          if (stop === 'mat') req[r][q] = MAT;
          else {
            req[r][q] = FREE;
            if (stop === 'block') req[r][q + pick.d] = BLOCK;
          }
          stops.push({ r, from: a, to: q, stop });
          if (req[r + 1][a] === ANY) req[r + 1][a] = THREAT;
        }
      }
      p.push(q);
    }

    // ---- fill the rows with things ----
    const items = [];
    const occ = req.map(() => new Array(COLS).fill(false));
    const BLOCK_ART = ['shampoo', 'conditioner', 'duck', 'jar'];
    const add = (kind, c, r0, r1, look) => {
      for (let r = r0; r <= r1; r++) occ[r][c] = true;
      items.push({ kind, c, r0, r1, lo: rowD(r0) - IH, hi: rowD(r1) + IH, look, spin: plan.next() * TAU });
    };
    const canExtend = (r, c, kinds) => r < nRows && !occ[r][c] && kinds.includes(req[r][c]);
    for (let r = 0; r < nRows; r++) {
      const t = timeAt(rowD(r));
      const P = progress(t, 60, 1.5);
      const drainShare = t < 10 ? 0 : lerp(0.3, 0.45, P);
      const clutterP = t < 6 ? 0.06 : lerp(0.1, 0.3, P);
      let count = 0;
      for (let c = 0; c < COLS; c++) {
        const rA = plan.next();
        const rB = plan.next();
        const rC = plan.next();
        const rLook = plan.next();
        if (occ[r][c]) {
          count++;
          continue;
        }
        const need = req[r][c];
        let kind = '';
        if (need === BLOCK) kind = 'block';
        else if (need === MAT) kind = 'mat';
        else if (need === THREAT) kind = rA < drainShare ? 'drain' : 'block';
        else if (need === ANY && count < 2 + P * 2 && rA < clutterP) {
          kind = rB < drainShare * 0.8 ? 'drain' : rB < 0.82 ? 'block' : t > 7 ? 'mat' : 'block';
        }
        if (!kind) continue;
        count++;
        if (kind === 'block') {
          // some solid things are long: a bath brush (2 rows) or a rolled towel (3 rows)
          if (rC < 0.22 && canExtend(r + 1, c, [ANY, BLOCK, THREAT])) {
            if (rC < 0.08 && canExtend(r + 2, c, [ANY, BLOCK, THREAT])) add('block', c, r, r + 2, 'towel');
            else add('block', c, r, r + 1, 'brush');
          } else add('block', c, r, r, BLOCK_ART[Math.floor(rLook * BLOCK_ART.length) % BLOCK_ART.length]);
        } else if (kind === 'mat') {
          let r1 = r;
          if (rC < 0.5 && canExtend(r + 1, c, [ANY, MAT])) {
            r1 = r + 1;
            if (rC < 0.2 && canExtend(r + 2, c, [ANY, MAT])) r1 = r + 2;
          }
          add('mat', c, r, r1, `mat${r1 - r + 1}`);
        } else add('drain', c, r, r, 'drain');
      }
    }
    items.sort((a, b) => a.lo - b.lo);

    // cosmetic puddles on the floor
    const puddles = [];
    for (let d = 200; d < endD + 600; d += art.range(90, 190)) {
      puddles.push({ d, x: art.range(X0 + 10, W - X0 - 10), w: art.range(14, 34), h: art.range(5, 10), a: art.range(-0.4, 0.4) });
    }

    // ---- art ----
    const sprites = {
      shampoo: makeBottle('#3d6cf0', '#1f3fa8', '#ffe28a', false),
      conditioner: makeBottle('#ff6f5e', '#c43a30', '#fff3e0', true),
      duck: makeDuck(),
      jar: makeJar(),
      brush: makeBrush(),
      towel: makeTowel(),
      drain: makeDrain(),
      mat1: makeMat(1),
      mat2: makeMat(2),
      mat3: makeMat(3),
    };
    const soap = { calm: makeSoap('calm'), whee: makeSoap('whee'), ouch: makeSoap('ouch') };
    const floor = makeFloor(W);
    const walls = makeWalls(W, H);
    const shade = makeShade(W);
    const glowPink = glowSprite('rgba(255,120,190,0.6)', 40);
    const glowRed = glowSprite('rgba(255,60,60,0.75)', 26);
    const glowShine = glowSprite('rgba(255,255,255,0.9)', 10);
    const vignette = vignetteSprite(W, H, 0.5, '10,40,45');
    const fx = createParticles();
    const suds = createParticles();

    // ---- state ----
    let s = 0;
    let v = v0;
    let col = 3;
    let x = cx(3);
    let slide = null; // { to, d, drain }
    let prevDir = 0;
    let now = 0;
    let clock = 0;
    let shake = 0;
    let deathKind = '';
    let deathT = -1;
    let deathX = 0;
    let deathItem = null;
    let squash = 0;
    let lastStop = '';
    let first = 0; // index of the first item that might still matter

    const yOf = (d) => PY - (d - s);
    const overlaps = (it, pad = 0) => it.lo + pad < s + BH && it.hi - pad > s - BH;
    const cellItem = (c, kind) => {
      for (let i = first; i < items.length; i++) {
        const it = items[i];
        if (it.lo > s + BH) break;
        if (it.c === c && it.kind === kind && overlaps(it)) return it;
      }
      return null;
    };
    // where a slide from column c towards d would stop right now
    const target = (c, d) => {
      let k = c;
      for (;;) {
        const n = k + d;
        if (n < 0 || n >= COLS) return { col: k, by: 'wall' };
        if (cellItem(n, 'block')) return { col: k, by: 'block' };
        k = n;
        if (cellItem(k, 'drain')) return { col: k, by: 'drain', drain: true };
        if (cellItem(k, 'mat')) return { col: k, by: 'mat' };
      }
    };
    // something solid (or a drain) in column c that reaches the soap within `ahead` px
    const incoming = (c, ahead) => {
      for (let i = first; i < items.length; i++) {
        const it = items[i];
        if (it.lo > s + BH + ahead) break;
        if (it.c === c && it.kind !== 'mat' && it.hi > s - BH) return it;
      }
      return null;
    };

    const die = (kind, reason, it) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      deathT = 0;
      deathX = x;
      deathItem = it;
      shake = kind === 'drain' ? 0.25 : 0.6;
      if (kind === 'drain') {
        fx.burst(x, PY, { count: 26, speed: 120, life: 0.9, size: 5, round: true, drag: 1.5, colors: ['rgba(190,235,255,0.9)', '#ffffff', 'rgba(140,210,240,0.8)'] });
      } else {
        suds.burst(x, PY - 8, { count: 40, speed: 230, life: 1.1, size: 8, round: true, gravity: 160, drag: 1.2, colors: ['#ffffff', '#f4fbff', '#ffd6e8'] });
        fx.burst(x, PY - 12, { count: 22, speed: 260, life: 0.8, size: 4, gravity: 500, colors: ['#ff8fc0', '#f0609e', '#ffd6e8'] });
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.8);
      squash = Math.max(0, squash - dt * 4);
      fx.update(dt);
      suds.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { p, stops, rowD, items, get s() { return s; }, get col() { return col; }, get sliding() { return !!slide; } },

      update(dt, dir, t) {
        now = t;
        updateCosmetic(dt);
        v = speedAt(t);
        s += v * dt;
        while (first < items.length && items[first].hi < s - 200) first++;

        const press = dir !== 0 && dir !== prevDir;
        prevDir = dir;
        if (press && !slide) {
          const tg = target(col, dir);
          if (tg.col !== col) {
            slide = { to: tg.col, d: dir, drain: !!tg.drain, by: tg.by };
            suds.burst(x - dir * 16, PY + 4, { count: 8, speed: 70, life: 0.6, size: 6, round: true, drag: 2, angle: dir > 0 ? Math.PI : 0, spread: 1.4, colors: ['#ffffff', 'rgba(230,245,255,0.95)'] });
          } else {
            squash = 0.6; // nudged against whatever is beside it
          }
        }
        if (slide) {
          x += slide.d * SLIDE_V * dt;
          if (Math.random() < 0.9) suds.burst(x - slide.d * 18, PY + 2 + (Math.random() - 0.5) * 18, { count: 1, speed: 30, life: 0.7, size: 7, round: true, drag: 2, colors: ['rgba(255,255,255,0.95)', 'rgba(225,242,255,0.9)'] });
          if ((x - cx(slide.to)) * slide.d >= 0) {
            x = cx(slide.to);
            col = slide.to;
            lastStop = slide.by;
            squash = 1;
            const drain = slide.drain;
            slide = null;
            if (drain) {
              die('drain', 'Slid straight down the drain.', cellItem(col, 'drain'));
              return;
            }
            fx.burst(x + (lastStop === 'mat' ? 0 : 0), PY + 10, { count: 6, speed: 60, life: 0.4, size: 3, round: true, colors: ['rgba(200,240,255,0.9)'] });
          }
        }

        // anything solid reaching the soap, or a drain sliding under it
        const here = clamp(Math.round((x - X0 - CW / 2) / CW), 0, COLS - 1);
        for (let i = first; i < items.length; i++) {
          const it = items[i];
          if (it.lo > s + BH) break;
          if (it.c !== here || it.kind === 'mat') continue;
          if (it.kind === 'block' && overlaps(it)) {
            const names = {
              shampoo: 'Bonked into the shampoo bottle.',
              conditioner: 'Bonked into the conditioner.',
              duck: 'Bonked into a rubber duck.',
              jar: 'Bonked into the bath salts.',
              brush: 'Bonked into the back brush.',
              towel: 'Bonked into a rolled-up towel.',
            };
            die('bonk', names[it.look] || 'Bonked into something.', it);
            return;
          }
          if (it.kind === 'drain' && overlaps(it, 6) && !slide) {
            die('drain', 'A drain slid right under you. Glug.', it);
            return;
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (deathT >= 0) deathT += dt;
      },

      render(g) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

        // the floor
        const period = RH * 2;
        const base = PY - FIRST - IH + 2 + s; // a tile line, aligned so rows sit on tiles
        let y0 = ((base % period) + period) % period - period;
        for (let y = y0; y < H; y += period) g.drawImage(floor.canvas, 0, y, W, period);

        // wet puddles (cosmetic)
        g.globalCompositeOperation = 'lighter';
        for (const pd of puddles) {
          const y = yOf(pd.d);
          if (y < -20 || y > H + 20) continue;
          g.fillStyle = 'rgba(170,230,255,0.13)';
          g.beginPath();
          g.ellipse(pd.x, y, pd.w, pd.h, pd.a, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.2)';
          g.beginPath();
          g.ellipse(pd.x - pd.w * 0.3, y - pd.h * 0.3, pd.w * 0.35, pd.h * 0.25, pd.a, 0, TAU);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';

        // mats and drains lie flat on the floor
        const top = s + PY + 60;
        const bottom = s - (H - PY) - 120;
        for (let i = first; i < items.length; i++) {
          const it = items[i];
          if (it.lo > top) break;
          if (it.hi < bottom || it.kind === 'block') continue;
          const yc = yOf((it.lo + it.hi) / 2);
          if (it.kind === 'mat') {
            const sp = sprites[it.look];
            g.drawImage(sp.canvas, cx(it.c) - sp.w / 2, yc - sp.h / 2, sp.w, sp.h);
          } else {
            const sp = sprites.drain;
            g.drawImage(sp.canvas, cx(it.c) - 26, yc - 26, 52, 52);
            // swirling water in the hole
            g.strokeStyle = 'rgba(120,200,235,0.45)';
            g.lineWidth = 1.5;
            const a0 = clock * 4 + it.spin;
            for (let k = 0; k < 2; k++) {
              g.beginPath();
              g.arc(cx(it.c), yc, 7 + k * 5, a0 + k * 2, a0 + k * 2 + 1.6);
              g.stroke();
            }
          }
        }

        // ghost outlines: where a slide either way would stop right now
        if (!game.dead && !slide && t > 0.3) {
          for (const d of [-1, 1]) {
            const tg = target(col, d);
            if (tg.col === col) continue;
            const gx = cx(tg.col);
            const danger = tg.drain || !!incoming(tg.col, v * 0.12);
            const colr = danger ? '230,40,50' : '15,85,95';
            const pulse = 0.6 + 0.2 * Math.sin(clock * 6);
            g.strokeStyle = `rgba(${colr},${(danger ? 0.95 : pulse).toFixed(3)})`;
            g.fillStyle = danger ? 'rgba(255,90,90,0.22)' : 'rgba(255,255,255,0.45)';
            g.lineWidth = 2;
            g.setLineDash([5, 4]);
            rr(g, gx - 20, PY - 15, 40, 30, 10);
            g.fill();
            g.stroke();
            // dotted track from the soap
            g.setLineDash([2, 6]);
            g.beginPath();
            g.moveTo(x + d * 24, PY + 1);
            g.lineTo(gx - d * 22, PY + 1);
            g.stroke();
            g.setLineDash([]);
            // arrowhead
            g.fillStyle = `rgba(${colr},0.9)`;
            g.beginPath();
            g.moveTo(gx - d * 22, PY + 1);
            g.lineTo(gx - d * 29, PY - 4);
            g.lineTo(gx - d * 29, PY + 6);
            g.closePath();
            g.fill();
            if (danger) {
              g.strokeStyle = 'rgba(255,70,70,0.95)';
              g.lineWidth = 2.5;
              g.beginPath();
              g.moveTo(gx - 6, PY - 6);
              g.lineTo(gx + 6, PY + 6);
              g.moveTo(gx + 6, PY - 6);
              g.lineTo(gx - 6, PY + 6);
              g.stroke();
            }
          }
        }

        // solid things, far to near
        const drawBlocks = (pass) => {
          for (let i = first; i < items.length; i++) {
            const it = items[i];
            if (it.lo > top) break;
            if (it.hi < bottom || it.kind !== 'block') continue;
            const yc = yOf((it.lo + it.hi) / 2);
            // blocks entirely past the soap are drawn over it, the rest under it
            const past = yOf(it.lo) > PY + BH + 4;
            if (pass !== past) continue;
            const sp = sprites[it.look];
            g.drawImage(sp.canvas, cx(it.c) - sp.w / 2, yc - sp.h / 2 - 3, sp.w, sp.h);
            // red warning glow under a thing about to reach the soap in its column
            if (!game.dead && it.c === Math.round((x - X0 - CW / 2) / CW)) {
              const gap = yOf(it.lo) - (PY - BH);
              if (gap < 0 && gap > -150) {
                g.globalCompositeOperation = 'lighter';
                drawSprite(g, glowRed, cx(it.c), yOf(it.lo) - 6, { size: 60, alpha: 0.5 + 0.4 * Math.sin(clock * 14) });
                g.globalCompositeOperation = 'source-over';
              }
            }
          }
        };
        drawBlocks(false);

        // the soap
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowPink, x, PY, { size: 96, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';
        let sw = 1;
        let shh = 1;
        let rot = 0;
        let alpha = 1;
        let sx = x;
        let sy = PY;
        let sprite = slide ? soap.whee : soap.calm;
        if (slide) {
          sw = 1.12;
          shh = 0.9;
          rot = slide.d * 0.06;
        } else if (squash > 0) {
          const k = Math.sin(squash * Math.PI) * 0.12;
          sw = 1 + k;
          shh = 1 - k;
        } else {
          sw = 1 + Math.sin(clock * 3) * 0.015;
        }
        if (deathT >= 0) {
          if (deathKind === 'drain') {
            const k = Math.min(1, deathT / 0.7);
            const dx = deathItem ? cx(deathItem.c) : deathX;
            const dy = deathItem ? yOf((deathItem.lo + deathItem.hi) / 2) : PY;
            sx = lerp(deathX, dx, Math.min(1, k * 2));
            sy = lerp(PY, dy, Math.min(1, k * 2));
            sw = shh = Math.max(0.02, 1 - k);
            rot = k * 7;
            alpha = 1 - k * 0.6;
          } else {
            const k = Math.min(1, deathT / 0.25);
            sw = 1 + 0.25 * k;
            shh = 1 - 0.35 * k;
            rot = Math.sin(deathT * 30) * 0.15 * Math.max(0, 1 - deathT * 2);
            sy = PY + 6 * k;
          }
          sprite = soap.ouch;
        }
        g.save();
        g.translate(sx, sy);
        g.rotate(rot);
        g.scale(sw, shh);
        g.globalAlpha = alpha;
        g.drawImage(sprite.canvas, -24, -20, 48, 40);
        g.restore();
        g.globalAlpha = 1;

        // "!" over the soap when something in its lane is close
        if (!game.dead && !slide) {
          const it = incoming(col, v * 0.9);
          if (it && it.lo > s - BH) {
            const k = clamp(1 - (it.lo - (s + BH)) / (v * 0.9), 0, 1);
            g.font = '900 20px "Arial Black", Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineJoin = 'round';
            g.lineWidth = 4;
            g.strokeStyle = 'rgba(40,10,20,0.85)';
            const by = PY - 34 - Math.abs(Math.sin(clock * 10)) * 3 * k;
            g.globalAlpha = 0.4 + 0.6 * k;
            g.strokeText('!', x, by);
            g.fillStyle = '#ff4a4a';
            g.fillText('!', x, by);
            g.globalAlpha = 1;
          }
        }

        suds.render(g);
        fx.render(g);
        drawBlocks(true);

        // bubbles drifting up in the steam (cosmetic)
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 9; k++) {
          const bx = X0 + ((k * 97.3 + Math.sin(clock * 0.7 + k) * 14) % (W - 2 * X0));
          const by = H - ((clock * (18 + k * 3) + k * 83) % (H + 40));
          drawSprite(g, glowShine, bx, by, { size: 6 + (k % 3) * 3, alpha: 0.35 });
        }
        g.globalCompositeOperation = 'source-over';

        g.drawImage(walls.canvas, 0, 0, W, H);
        g.drawImage(shade.canvas, 0, 0, W, H);
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };

    return game;
  },
};
