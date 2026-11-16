// Pour Decisions — a Moroccan tea room at dusk. You hold a silver teapot high over a counter
// where tea glasses slide past on a kilim belt, from the kitchen arch on the left to the
// serving hatch on the right. The pot never stops pouring: ← and → only move the stream.
// Every glass has to reach its gold line before it goes through the hatch, and none may ever
// overflow, so you share one endless stream between glasses of very different sizes: a dab
// for a tiny glass, a long pour for a tall one or a bowl, and whatever lands between glasses
// is wasted on the belt. The tea falls from a height, so it keeps some of the pot's swing and
// lands a moment after it leaves the spout: stop sharply and the stream whips on past.
// From 18s some glasses are cracked and leak, so they need topping up just before they're
// served. The belt speeds up and the glasses come thicker and in rushes.

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

const TAU = Math.PI * 2;
const BELT_Y = 560; // where the glasses stand
const SPOUT_Y = 420; // the spout tip
const SERVE_X = 324; // a glass is judged when its centre reaches this
const FLOW = 1; // tea per second (a glass's capacity is in seconds of pouring)
const GRAV = 1800;
const CARRY = 0.75; // how much of the pot's sideways speed the falling tea keeps
const POT_SIZE = 100;

const TYPES = {
  small: { w: 24, h: 38, taper: 0.8, cap: 0.6, line: 0.55 },
  glass: { w: 30, h: 50, taper: 0.76, cap: 0.9, line: 0.6 },
  tall: { w: 30, h: 70, taper: 0.8, cap: 1.3, line: 0.62 },
  bowl: { w: 58, h: 32, taper: 0.58, cap: 1.4, line: 0.55 },
};
const HUES = [
  { band: 'rgba(200,30,60,0.62)', deep: '#8a1030' }, // ruby
  { band: 'rgba(30,150,90,0.6)', deep: '#0d5a36' }, // emerald
  { band: 'rgba(40,90,220,0.6)', deep: '#14307a' }, // cobalt
  { band: 'rgba(240,160,30,0.55)', deep: '#8a5208' }, // saffron
];

const beltSpeed = (t) => lerp(48, 90, progress(t, 60, 1.25));
const demandRate = (t) => lerp(0.34, 0.64, progress(t, 60, 1.15));

// ---------- art ----------

function glassPath(g, w, h, taper) {
  const wb = w * taper;
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(-wb / 2, h / 2 - 3);
  g.quadraticCurveTo(-wb / 2, h / 2, -wb / 2 + 3, h / 2);
  g.lineTo(wb / 2 - 3, h / 2);
  g.quadraticCurveTo(wb / 2, h / 2, wb / 2, h / 2 - 3);
  g.lineTo(w / 2, -h / 2);
}

function makeGlassBack(type) {
  const { w, h, taper } = TYPES[type];
  return makeSprite(w + 8, h + 8, (g) => {
    g.fillStyle = 'rgba(10,16,60,0.28)';
    g.beginPath();
    g.ellipse(1, h / 2 + 1, w * taper * 0.62, 3, 0, 0, TAU);
    g.fill();
    glassPath(g, w, h, taper);
    g.closePath();
    const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, 'rgba(210,230,255,0.16)');
    gr.addColorStop(0.5, 'rgba(120,150,220,0.08)');
    gr.addColorStop(1, 'rgba(210,230,255,0.2)');
    g.fillStyle = gr;
    g.fill();
  });
}

function makeGlassFront(type, hue, cracked) {
  const { w, h, taper } = TYPES[type];
  return makeSprite(w + 8, h + 8, (g) => {
    const top = -h / 2;
    const wb = w * taper;
    const at = (y) => lerp(w, wb, (y - top) / h) / 2; // half width at height y
    // coloured, gilded band
    const b0 = type === 'bowl' ? top + 4 : top + h * 0.12;
    const b1 = type === 'bowl' ? top + h * 0.42 : top + h * (type === 'tall' ? 0.42 : 0.5);
    g.beginPath();
    g.moveTo(-at(b0), b0);
    g.lineTo(at(b0), b0);
    g.lineTo(at(b1), b1);
    g.lineTo(-at(b1), b1);
    g.closePath();
    g.fillStyle = hue.band;
    g.fill();
    g.save();
    g.clip();
    // arabesque: little gold arches and diamonds along the band
    g.strokeStyle = 'rgba(255,214,110,0.95)';
    g.lineWidth = 0.8;
    const mid = (b0 + b1) / 2;
    const bh = b1 - b0;
    for (let x = -w / 2 - 2; x < w / 2 + 4; x += 7) {
      g.beginPath();
      g.moveTo(x, b1);
      g.lineTo(x, mid);
      g.arc(x + 3.5, mid, 3.5, Math.PI, 0);
      g.lineTo(x + 7, b1);
      g.stroke();
      g.fillStyle = 'rgba(255,226,140,0.95)';
      g.beginPath();
      g.moveTo(x + 3.5, b0 + bh * 0.08);
      g.lineTo(x + 5, b0 + bh * 0.22);
      g.lineTo(x + 3.5, b0 + bh * 0.36);
      g.lineTo(x + 2, b0 + bh * 0.22);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.strokeStyle = '#f2c35a';
    g.lineWidth = 1;
    for (const y of [b0, b1]) {
      g.beginPath();
      g.moveTo(-at(y), y);
      g.lineTo(at(y), y);
      g.stroke();
    }
    // glass walls
    glassPath(g, w, h, taper);
    g.strokeStyle = 'rgba(235,245,255,0.75)';
    g.lineWidth = 1.4;
    g.stroke();
    // thick base
    g.fillStyle = 'rgba(220,235,255,0.42)';
    g.beginPath();
    g.roundRect(-wb / 2 + 1, h / 2 - 4, wb - 2, 4, 2);
    g.fill();
    // gold rim
    g.strokeStyle = '#ffd56a';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-w / 2 - 0.5, top + 0.5);
    g.lineTo(w / 2 + 0.5, top + 0.5);
    g.stroke();
    // gloss
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-at(top + 4) + 3.5, top + 4);
    g.lineTo(-at(top + h - 8) + 3.5, top + h - 8);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(at(top + 6) - 4, top + 7, 1.1, 0, TAU);
    g.fill();
    if (cracked) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 0.9;
      g.beginPath();
      const cx0 = w * 0.12;
      g.moveTo(cx0, h / 2 - 3);
      g.lineTo(cx0 - 3, h / 2 - 9);
      g.lineTo(cx0 + 2, h / 2 - 13);
      g.lineTo(cx0 - 2, h / 2 - 19);
      g.moveTo(cx0 + 2, h / 2 - 13);
      g.lineTo(cx0 + 6, h / 2 - 15);
      g.stroke();
      g.strokeStyle = 'rgba(40,60,120,0.6)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(cx0 + 0.6, h / 2 - 3);
      g.lineTo(cx0 - 2.4, h / 2 - 9);
      g.lineTo(cx0 + 2.6, h / 2 - 13);
      g.stroke();
    }
  });
}

// Silver Moroccan teapot, spout to the right. The spout tip sits at (TIP_X, TIP_Y) in sprite units.
const TIP_X = 47;
const TIP_Y = -5;
function makePot() {
  return makeSprite(110, 100, (g) => {
    const silver = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, '#f6f8fb');
      gr.addColorStop(0.3, '#c9d0da');
      gr.addColorStop(0.55, '#8f99a8');
      gr.addColorStop(0.8, '#d7dde6');
      gr.addColorStop(1, '#6d7685');
      return gr;
    };
    // handle
    g.strokeStyle = '#5d6573';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-38, -10);
    g.bezierCurveTo(-58, -12, -60, 24, -36, 26);
    g.stroke();
    g.strokeStyle = '#c9d0da';
    g.lineWidth = 3;
    g.stroke();
    // spout
    g.beginPath();
    g.moveTo(4, 22);
    g.bezierCurveTo(26, 22, 30, 2, TIP_X - 2, TIP_Y - 3);
    g.lineTo(TIP_X + 1, TIP_Y + 2);
    g.bezierCurveTo(34, 10, 30, 34, 4, 34);
    g.closePath();
    g.fillStyle = silver(0, 0, 0, 34);
    g.fill();
    g.strokeStyle = '#4f5765';
    g.lineWidth = 1;
    g.stroke();
    // foot
    g.beginPath();
    g.moveTo(-28, 40);
    g.lineTo(-8, 40);
    g.lineTo(-4, 46);
    g.lineTo(-32, 46);
    g.closePath();
    g.fillStyle = silver(-32, 0, -4, 0);
    g.fill();
    g.stroke();
    // body
    g.beginPath();
    g.ellipse(-18, 18, 26, 23, 0, 0, TAU);
    g.fillStyle = silver(-44, -4, 8, 40);
    g.fill();
    g.strokeStyle = '#4f5765';
    g.stroke();
    // engraved band
    g.save();
    g.beginPath();
    g.ellipse(-18, 18, 26, 23, 0, 0, TAU);
    g.clip();
    g.strokeStyle = 'rgba(70,78,92,0.6)';
    g.lineWidth = 0.8;
    for (let x = -46; x < 12; x += 6) {
      g.beginPath();
      g.moveTo(x, 26);
      g.arc(x + 3, 20, 3, Math.PI, 0);
      g.lineTo(x + 6, 26);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-46, 12);
    g.lineTo(10, 12);
    g.moveTo(-46, 28);
    g.lineTo(10, 28);
    g.stroke();
    g.restore();
    // shoulder and lid
    g.beginPath();
    g.moveTo(-36, 0);
    g.quadraticCurveTo(-18, -8, 0, 0);
    g.lineTo(-4, -6);
    g.lineTo(-32, -6);
    g.closePath();
    g.fillStyle = silver(-36, 0, 0, 0);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-31, -6);
    g.quadraticCurveTo(-30, -26, -18, -30);
    g.quadraticCurveTo(-6, -26, -5, -6);
    g.closePath();
    g.fillStyle = silver(-31, -30, -5, -6);
    g.fill();
    g.stroke();
    // finial
    g.fillStyle = '#e8c35a';
    g.beginPath();
    g.ellipse(-18, -32, 4, 3, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(-20, -34);
    g.quadraticCurveTo(-18, -44, -16, -34);
    g.fill();
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(-19, -33, 1.2, 0, TAU);
    g.fill();
    // highlights
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(-30, 10, 4, 9, 0.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.ellipse(-24, -18, 2, 5, 0.4, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(26, 14, 1.5, 5, -0.6, 0, TAU);
    g.fill();
  });
}

function makeLantern() {
  return makeSprite(30, 56, (g) => {
    const brass = g.createLinearGradient(-14, 0, 14, 0);
    brass.addColorStop(0, '#7a4e12');
    brass.addColorStop(0.4, '#f2c35a');
    brass.addColorStop(0.7, '#b0781e');
    brass.addColorStop(1, '#5a360a');
    // glowing glass body
    g.beginPath();
    g.moveTo(-9, -12);
    g.lineTo(9, -12);
    g.lineTo(12, 6);
    g.lineTo(6, 18);
    g.lineTo(-6, 18);
    g.lineTo(-12, 6);
    g.closePath();
    const glow = g.createRadialGradient(0, 4, 1, 0, 4, 14);
    glow.addColorStop(0, '#fff3b0');
    glow.addColorStop(0.5, '#ffb43a');
    glow.addColorStop(1, '#c2410c');
    g.fillStyle = glow;
    g.fill();
    // pierced brass lattice
    g.strokeStyle = brass;
    g.lineWidth = 1.6;
    g.stroke();
    g.lineWidth = 1;
    for (const x of [-4, 4]) {
      g.beginPath();
      g.moveTo(x * 1.4, -12);
      g.lineTo(x, 18);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-12, 6);
    g.lineTo(12, 6);
    g.stroke();
    g.fillStyle = 'rgba(120,20,40,0.5)';
    for (const [x, y] of [[-7, -4], [0, -4], [7, -4], [-4, 12], [4, 12]]) {
      g.beginPath();
      g.arc(x, y, 1.6, 0, TAU);
      g.fill();
    }
    // dome cap and finial
    g.fillStyle = brass;
    g.beginPath();
    g.moveTo(-11, -12);
    g.quadraticCurveTo(0, -30, 11, -12);
    g.closePath();
    g.fill();
    g.fillRect(-1.5, -28, 3, 6);
    g.beginPath();
    g.arc(0, -26, 2.4, 0, TAU);
    g.fill();
    // base and drop
    g.beginPath();
    g.moveTo(-7, 18);
    g.lineTo(7, 18);
    g.lineTo(0, 26);
    g.closePath();
    g.fill();
  });
}

function makeBackdrop(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // Majorelle-blue plaster
    const wall = g.createLinearGradient(0, 0, 0, 560);
    wall.addColorStop(0, '#131f5e');
    wall.addColorStop(0.45, '#2443b4');
    wall.addColorStop(1, '#1a3190');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,40,0.06)';
      g.fillRect(Math.random() * W, Math.random() * 560, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // carved plaster frieze along the top
    g.fillStyle = 'rgba(240,226,196,0.14)';
    g.fillRect(0, 62, W, 14);
    g.strokeStyle = 'rgba(240,226,196,0.35)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 12) {
      g.beginPath();
      g.moveTo(x, 76);
      g.arc(x + 6, 70, 6, Math.PI, 0);
      g.stroke();
    }

    // horseshoe-arch window onto a dusk city
    const arch = () => {
      g.beginPath();
      g.moveTo(94, 342);
      g.lineTo(94, 238);
      g.arc(180, 195, 96, Math.PI - 0.46, TAU + 0.46);
      g.lineTo(266, 342);
      g.closePath();
    };
    g.save();
    arch();
    g.clip();
    const sky = g.createLinearGradient(0, 100, 0, 342);
    sky.addColorStop(0, '#24154f');
    sky.addColorStop(0.4, '#6a2f78');
    sky.addColorStop(0.72, '#dc6a5a');
    sky.addColorStop(1, '#f8b85a');
    g.fillStyle = sky;
    g.fillRect(80, 90, 200, 260);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,240,${0.3 + Math.random() * 0.6})`;
      const s = Math.random() < 0.15 ? 1.6 : 1;
      g.fillRect(90 + Math.random() * 180, 100 + Math.random() * 110, s, s);
    }
    // crescent moon
    g.fillStyle = '#fff4d2';
    g.beginPath();
    g.arc(222, 150, 13, 0, TAU);
    g.fill();
    g.fillStyle = '#3a1d62';
    g.beginPath();
    g.arc(228, 146, 11.5, 0, TAU);
    g.fill();
    // city silhouette: flat roofs, domes, a minaret, palms
    g.fillStyle = '#3a1a48';
    g.beginPath();
    g.moveTo(80, 342);
    let x = 80;
    const roof = [[18, 300], [14, 292], [22, 306], [16, 296], [26, 302], [18, 290], [20, 304], [24, 296], [30, 300], [20, 294]];
    for (const [w, y] of roof) {
      g.lineTo(x, y);
      g.lineTo(x + w, y);
      x += w;
    }
    g.lineTo(280, 342);
    g.closePath();
    g.fill();
    g.fillStyle = '#2c1238';
    g.fillRect(118, 230, 18, 80);
    g.fillRect(114, 226, 26, 6);
    g.fillRect(121, 206, 12, 22);
    g.fillRect(119, 202, 16, 5);
    g.beginPath();
    g.moveTo(121, 202);
    g.quadraticCurveTo(127, 186, 133, 202);
    g.fill();
    g.fillRect(126.4, 180, 1.2, 8);
    g.fillStyle = '#ffcf7a';
    for (const [wx, wy] of [[124, 240], [124, 262], [131, 284]]) {
      g.beginPath();
      g.moveTo(wx, wy + 6);
      g.lineTo(wx, wy + 2);
      g.arc(wx + 2, wy + 2, 2, Math.PI, 0);
      g.lineTo(wx + 4, wy + 6);
      g.fill();
    }
    g.fillStyle = '#2c1238';
    for (const [dx, dy, r] of [[200, 300, 22], [240, 306, 14]]) {
      g.beginPath();
      g.arc(dx, dy, r, Math.PI, 0);
      g.fill();
    }
    g.fillRect(199, 270, 2, 8);
    const palm = (px, py, s) => {
      g.strokeStyle = '#2c1238';
      g.lineWidth = 2.5 * s;
      g.beginPath();
      g.moveTo(px, 342);
      g.quadraticCurveTo(px + 6 * s, (342 + py) / 2, px + 2 * s, py);
      g.stroke();
      g.lineWidth = 2 * s;
      for (const a of [-2.7, -2.2, -1.7, -1.1, -0.5, -0.1]) {
        g.beginPath();
        g.moveTo(px + 2 * s, py);
        g.quadraticCurveTo(px + 2 * s + Math.cos(a) * 12 * s, py + Math.sin(a) * 10 * s, px + 2 * s + Math.cos(a) * 20 * s, py + Math.sin(a) * 4 * s + 8 * s);
        g.stroke();
      }
    };
    palm(160, 262, 1);
    palm(258, 276, 0.8);
    g.restore();
    // window frame: carved plaster with a gold inner line and a tiled border
    arch();
    g.strokeStyle = '#efe2c4';
    g.lineWidth = 12;
    g.stroke();
    g.strokeStyle = '#c8962e';
    g.lineWidth = 2;
    g.stroke();
    g.save();
    g.translate(180, 195);
    g.strokeStyle = 'rgba(30,90,70,0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 108, Math.PI - 0.52, TAU + 0.52);
    g.stroke();
    g.setLineDash([3, 4]);
    g.strokeStyle = 'rgba(240,190,80,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 113, Math.PI - 0.55, TAU + 0.55);
    g.stroke();
    g.setLineDash([]);
    g.restore();
    // sill
    g.fillStyle = '#e6d6b2';
    g.fillRect(82, 340, 196, 9);
    g.fillStyle = 'rgba(80,50,20,0.35)';
    g.fillRect(82, 349, 196, 3);

    // zellige frieze: white ground, 8-point stars in green, saffron and terracotta
    const ZY = 355;
    const ZH = 36;
    g.fillStyle = '#f3ecdc';
    g.fillRect(0, ZY, W, ZH);
    const cols = ['#1e7a52', '#e3a21a', '#c4502e', '#1d3fa8'];
    const T = 18;
    for (let i = 0; i * T < W + T; i++) {
      for (let j = 0; j < 2; j++) {
        const cx = i * T + (j ? T / 2 : 0);
        const cy = ZY + 9 + j * 18;
        g.fillStyle = cols[(i + j * 2) % cols.length];
        g.save();
        g.translate(cx, cy);
        for (const r of [0, Math.PI / 4]) {
          g.save();
          g.rotate(r);
          g.fillRect(-4.5, -4.5, 9, 9);
          g.restore();
        }
        g.fillStyle = '#f3ecdc';
        g.beginPath();
        g.arc(0, 0, 2.1, 0, TAU);
        g.fill();
        g.restore();
      }
    }
    g.fillStyle = '#7a2e1a';
    g.fillRect(0, ZY - 3, W, 3);
    g.fillRect(0, ZY + ZH, W, 3);
    g.fillStyle = '#e3a21a';
    g.fillRect(0, ZY - 5, W, 2);
    g.fillRect(0, ZY + ZH + 3, W, 2);

    // lower wall lit by the lanterns
    const lit = g.createLinearGradient(0, 420, 0, 556);
    lit.addColorStop(0, 'rgba(255,190,90,0.08)');
    lit.addColorStop(1, 'rgba(0,0,30,0.25)');
    g.fillStyle = lit;
    g.fillRect(0, 420, W, 140);

    // the counter front: carved cedar with a brass rail and studs
    const wood = g.createLinearGradient(0, 572, 0, 640);
    wood.addColorStop(0, '#8a4a1e');
    wood.addColorStop(0.5, '#6a3414');
    wood.addColorStop(1, '#3e1c08');
    g.fillStyle = wood;
    g.fillRect(0, 572, W, 68);
    for (let x = 6; x < W; x += 30) {
      g.fillStyle = 'rgba(30,10,0,0.45)';
      g.beginPath();
      g.moveTo(x, 632);
      g.lineTo(x, 600);
      g.arc(x + 9, 600, 9, Math.PI, 0);
      g.lineTo(x + 18, 632);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,190,110,0.3)';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#e8b84a';
      g.beginPath();
      g.arc(x + 24, 590, 1.8, 0, TAU);
      g.fill();
    }
    const rail = g.createLinearGradient(0, 572, 0, 579);
    rail.addColorStop(0, '#fff0a8');
    rail.addColorStop(0.5, '#d29a2e');
    rail.addColorStop(1, '#7a4e12');
    g.fillStyle = rail;
    g.fillRect(0, 572, W, 7);
  }, 2);
}

function makeLightDots(W) {
  // star-shaped specks of lantern light thrown on the wall
  return makeSprite(W, 300, (g) => {
    g.translate(-W / 2, -150);
    for (const [lx, ly] of [[34, 130], [326, 130]]) {
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU;
        const r = 24 + Math.random() * 110;
        const x = lx + Math.cos(a) * r;
        const y = ly + Math.sin(a) * r * 0.9;
        const s = 1.5 + Math.random() * 2.5 * (1 - r / 140);
        g.fillStyle = `rgba(255,200,110,${(0.5 * (1 - r / 150)).toFixed(3)})`;
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 4);
        g.fillRect(-s / 2, -s / 2, s, s);
        g.restore();
        g.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }, 1);
}

function makeKilim() {
  // one tile of the belt's woven pattern, 24 × 14
  return makeSprite(24, 14, (g) => {
    g.translate(-12, -7);
    g.fillStyle = '#a3232a';
    g.fillRect(0, 0, 24, 14);
    g.fillStyle = '#1f2a6a';
    g.beginPath();
    g.moveTo(12, 1.5);
    g.lineTo(19, 7);
    g.lineTo(12, 12.5);
    g.lineTo(5, 7);
    g.closePath();
    g.fill();
    g.fillStyle = '#f0c45a';
    g.beginPath();
    g.moveTo(12, 4.5);
    g.lineTo(15, 7);
    g.lineTo(12, 9.5);
    g.lineTo(9, 7);
    g.closePath();
    g.fill();
    g.fillStyle = '#f3e6cc';
    for (const x of [0, 24]) {
      g.beginPath();
      g.moveTo(x, 3);
      g.lineTo(x + 3, 7);
      g.lineTo(x, 11);
      g.lineTo(x - 3, 7);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 24, 1.5);
    g.fillRect(0, 12.5, 24, 1.5);
  }, 3);
}

function makeArch(side) {
  // a little horseshoe arch at one end of the belt, with a bead curtain (drawn for the right
  // end, mirrored for the left)
  return makeSprite(44, 120, (g) => {
    if (side < 0) g.scale(-1, 1);
    g.beginPath();
    g.moveTo(-16, 52);
    g.lineTo(-16, -14);
    g.arc(4, -20, 21, Math.PI - 0.3, TAU + 0.3);
    g.lineTo(26, 52);
    g.closePath();
    const dark = g.createLinearGradient(0, -40, 0, 52);
    dark.addColorStop(0, '#2a0f08');
    dark.addColorStop(1, '#5a2a10');
    g.fillStyle = dark;
    g.fill();
    g.strokeStyle = '#efe2c4';
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#c8962e';
    g.lineWidth = 1;
    g.stroke();
    // bead curtain
    for (let i = 0; i < 7; i++) {
      const x = -12 + i * 5.6;
      g.strokeStyle = 'rgba(255,220,150,0.35)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x, -34);
      g.lineTo(x, 50);
      g.stroke();
      for (let y = -32; y < 50; y += 5) {
        g.fillStyle = ['#ffcf5a', '#d0302a', '#2a9a6a', '#ffcf5a'][(i + (y + 40) / 5) & 3];
        g.globalAlpha = 0.8;
        g.beginPath();
        g.arc(x, y, 1.3, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }, 3);
}

// ---------- music: Gnawa house, 128 BPM, G Phrygian dominant over G–A♭–Fm–G ----------

const music = {
  cps: 128 / 240,
  setup: `
    const kick = note("g2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("g2 g2 g2 [g2 g2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const dum = note("g3 ~ ~ g3 ~ ~ g3 ~ ~ ~ g3 ~ g3 ~ ~ ~").s("sine").decay(0.12).sustain(0).gain(0.32)
    const tek = s("~ ~ white ~ white ~ ~ white ~ white ~ ~ white ~ white white").decay(0.035).sustain(0).hpf(3200).lpf(7000).gain(0.07).pan(0.6)
    const qraqeb = s("white*12").decay(0.03).sustain(0).hpf(6500).gain("[0.05 0.025 0.012]*4").pan(0.42)
    const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1200).lpf(6000).gain(0.14).room(0.3)
    const bass = note("<[g2 ~ g2 g3 ~ f2 ab2 ~] [ab2 ~ ab2 ab3 ~ g2 c3 ~] [f2 ~ f2 f3 ~ eb2 ab2 ~] [g2 ~ g2 b2 d3 ~ c3 b2]>")
      .s("sawtooth").decay(0.16).sustain(0.25).release(0.05).lpf(saw.range(420, 1700).slow(32)).lpq(5).gain(0.38)
    const sub = note("<g2 ab2 f2 g2>").s("sine").decay(0.5).sustain(0.4).gain(0.22)
    const chords = "<[g3,b3,d4] [ab3,c4,eb4] [f3,ab3,c4] [g3,b3,d4]>"
    const stab = note(chords).struct("~ x ~ x ~ x ~ x").s("triangle").decay(0.1).sustain(0).lpf(2400).gain(0.07).room(0.35)
    const oud = note("<[g4 ab4 b4 ab4 g4 f4 g4 d4] [ab4 b4 c5 b4 ab4 g4 ab4 eb4] [f4 g4 ab4 g4 f4 eb4 f4 c4] [g4 b4 d5 c5 b4 ab4 g4 f4]>")
      .ply(2).s("square").decay(0.07).sustain(0).lpf(saw.range(1200, 2600).slow(32)).gain(0.045)
      .delay(0.25).delaytime(0.352).delayfeedback(0.3).pan(0.35)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.4).lpf(900).gain(0.05).room(0.5)
    const tune = "<[d5@3 eb5 d5 c5 b4@2] [c5@2 eb5@2 d5 c5 b4 ab4] [g4@3 ab4 b4 c5 d5@2] [eb5 d5 c5 b4 ab4@2 g4@2]>"
    const ney = note(tune).s("sawtooth").attack(0.03).decay(0.2).sustain(0.5).release(0.1).lpf(2000).vib(5).vibmod(0.15)
      .gain(0.07).room(0.5).delay(0.2).delaytime(0.264).delayfeedback(0.25).pan(0.58)
    const neyLow = note(tune).add(note(-12)).s("square").decay(0.2).sustain(0.4).release(0.08).lpf(1300).gain(0.045)
    const arp = note("<[g5 b5 d6 b5]*4 [ab5 c6 eb6 c6]*4 [f5 ab5 c6 ab5]*4 [g5 b5 d6 f6]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.05).slow(8))
  `,
  song: `arrange(
    [8, stack(kick, dum, qraqeb, bass, sub, stab)],
    [8, stack(kick, dum, tek, qraqeb, clap, bass, sub, stab, oud, pad)],
    [8, stack(kick, dum, tek, qraqeb, clap, bass, sub, stab, pad, ney)],
    [8, stack(kick2, dum, tek, qraqeb, clap, bass, sub, stab, oud, pad, ney, neyLow, arp, wash)]
  )`,
};

export default {
  id: 'pour',
  title: 'Pour Decisions',
  emoji: '🫖',
  tagline: 'The tea never stops: fill each glass to its line, and never overflow.',
  colors: { bg: '#1d2f8a', fg: '#ffffff', accent: '#f2b233' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- art, rendered once ----
    const backdrop = makeBackdrop(W, H);
    const lightDots = makeLightDots(W);
    const lantern = makeLantern();
    const kilim = makeKilim();
    const archL = makeArch(-1);
    const archR = makeArch(1);
    const potSpr = makePot();
    const glowWarm = glowSprite('rgba(255,180,80,0.55)', 48);
    const glowGold = glowSprite('rgba(255,215,110,0.8)', 24);
    const glowRed = glowSprite('rgba(255,50,60,0.8)', 24);
    const steamSpr = glowSprite('rgba(255,255,255,0.22)', 16);
    const vignette = vignetteSprite(W, H, 0.5, '6,8,30');
    const backs = {};
    const fronts = {};
    for (const type of Object.keys(TYPES)) {
      backs[type] = makeGlassBack(type);
      fronts[type] = HUES.map((h) => [makeGlassFront(type, h, false), makeGlassFront(type, h, true)]);
    }

    const fx = createParticles();
    const sparkle = createParticles();
    const pot = createMover({ x: W * 0.68, minX: 18, maxX: W - 18, speed: 300, accel: 14 });
    const stream = []; // parcels of tea in the air, oldest first
    const cups = [];
    const puddles = [];
    const steam = [];

    let beltV = beltSpeed(0);
    let beltS = 0;
    let clock = 0;
    let nextSpawn = 0;
    let spawned = 0;
    let pending = null;
    let killer = null;
    let deathKind = '';

    const makeSpec = (t) => {
      // fixed draws per glass, whatever the player does
      const r1 = plan.next();
      const r2 = plan.next();
      const r3 = plan.next();
      const r4 = plan.next();
      const opts = [['glass', 3], ['tall', t > 3 ? 2 : 0], ['small', t > 8 ? lerp(1.2, 2.2, progress(t)) : 0], ['bowl', t > 12 ? 1 : 0]];
      let tot = opts.reduce((s, o) => s + o[1], 0) * r1;
      let type = 'glass';
      for (const [k, wgt] of opts) {
        tot -= wgt;
        if (tot <= 0 && wgt > 0) {
          type = k;
          break;
        }
      }
      const leaky = t > 18 && (type === 'glass' || type === 'tall') && r2 < lerp(0.2, 0.35, progress(t));
      return { type, leaky, hue: Math.floor(art.next() * HUES.length), r3, r4 };
    };

    const spawn = (t, x, first) => {
      const spec = first ? { type: 'tall', leaky: false, hue: 0, r3: 0.5, r4: 1 } : pending || makeSpec(t);
      const T = TYPES[spec.type];
      const cup = {
        type: spec.type,
        x: x ?? -T.w / 2 - 6,
        w: T.w,
        h: T.h,
        taper: T.taper,
        cap: T.cap,
        line: T.line,
        fill: 0,
        leak: spec.leaky ? 0.06 : 0,
        hue: spec.hue,
        state: 'open', // open → served
        pour: 0, // cosmetic: how recently tea landed in it
        drip: 0,
        lift: 0,
        flash: 0,
      };
      cups.push(cup);
      spawned++;
      pending = makeSpec(t);
      const need = cup.cap * cup.line + cup.leak * 1.5;
      const nextW = TYPES[pending.type].w;
      const minGap = (cup.w / 2 + nextW / 2 + 12) / beltV;
      let jit = lerp(0.6, 1.45, spec.r3);
      if (t > 10 && spec.r4 < lerp(0.15, 0.35, progress(t))) jit = 0.3; // a rush: the next one follows close behind
      nextSpawn = t + Math.max(minGap, (need / demandRate(t)) * jit);
    };

    // the first glass is already on the belt, the second comes out of the kitchen
    spawn(0, 60, true);
    nextSpawn = 1.2;

    const addPuddle = (x) => {
      for (const p of puddles) {
        if (Math.abs(p.x - x) < 10) {
          p.r = Math.min(16, p.r + 0.08);
          p.a = Math.min(0.6, p.a + 0.01);
          return;
        }
      }
      if (puddles.length < 40) puddles.push({ x, r: 4, a: 0.35 });
    };

    const timeToServe = (c) => (SERVE_X - c.x) / Math.max(1, beltV);

    const updateAir = (dt, game) => {
      for (let i = stream.length - 1; i >= 0; i--) {
        const p = stream[i];
        const py = p.y;
        p.vy += GRAV * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        let gone = false;
        for (const c of cups) {
          const rim = BELT_Y - c.h;
          if (p.y < rim || Math.abs(p.x - c.x) > c.w / 2 + 1) continue;
          gone = true;
          if (py < rim && Math.abs(p.x - c.x) < c.w / 2 - 2.5 && c.state === 'open') {
            c.fill += p.v;
            c.pour = 0.12;
            if (Math.random() < 0.25) {
              const lvl = BELT_Y - 4 - (Math.min(1, c.fill / c.cap)) * (c.h - 6);
              fx.burst(p.x, lvl, { count: 1, speed: 70, life: 0.35, size: 2.2, round: true, gravity: 500, angle: -Math.PI / 2, spread: 1.6, colors: ['#e9a640', '#f6cf7a', '#c27a1e'] });
            }
            if (game && !game.dead && c.fill > c.cap) {
              game.dead = true;
              game.deathReason = 'A glass overflowed.';
              killer = c;
              deathKind = 'over';
            }
          } else if (Math.random() < 0.4) {
            fx.burst(p.x, Math.min(p.y, rim + 2), { count: 2, speed: 90, life: 0.4, size: 2, round: true, gravity: 600, angle: -Math.PI / 2, spread: 2.4, colors: ['#e9a640', '#f6cf7a'] });
          }
          break;
        }
        if (!gone && p.y >= BELT_Y) {
          gone = true;
          addPuddle(p.x);
          if (Math.random() < 0.35) fx.burst(p.x, BELT_Y - 1, { count: 2, speed: 80, life: 0.4, size: 2, round: true, gravity: 600, angle: -Math.PI / 2, spread: 2.2, colors: ['#e9a640', '#f6cf7a', '#b06a1a'] });
        }
        if (gone) stream.splice(i, 1);
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      fx.update(dt);
      sparkle.update(dt);
      for (let i = puddles.length - 1; i >= 0; i--) {
        const p = puddles[i];
        p.a -= dt * 0.04;
        if (p.a <= 0 || p.x > W + 20) puddles.splice(i, 1);
      }
      if (Math.random() < dt * 6) steam.push({ x: pot.x + (Math.random() - 0.5) * 6, y: SPOUT_Y - 4, vx: (Math.random() - 0.5) * 8, life: 0, max: 1.4 });
      for (const c of cups) {
        c.pour = Math.max(0, c.pour - dt);
        c.flash = Math.max(0, c.flash - dt);
        if (c.fill > c.cap * 0.3 && Math.random() < dt * 1.2) steam.push({ x: c.x + (Math.random() - 0.5) * c.w * 0.5, y: BELT_Y - c.h, vx: (Math.random() - 0.5) * 6, life: 0, max: 1.6 });
      }
      for (let i = steam.length - 1; i >= 0; i--) {
        const s = steam[i];
        s.life += dt;
        s.y -= 18 * dt;
        s.x += (s.vx + Math.sin(clock * 2 + s.y * 0.05) * 6) * dt;
        if (s.life > s.max) steam.splice(i, 1);
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { cups, pot, stream, get beltV() { return beltV; } },

      update(dt, dir, t) {
        updateCosmetic(dt);
        beltV = beltSpeed(t);
        beltS += beltV * dt;

        // the pot moves, and pours, always
        pot.update(dt, dir);
        stream.push({ x: pot.x, y: SPOUT_Y, vx: pot.vx * CARRY, vy: 160, v: FLOW * dt });
        updateAir(dt, this);
        if (this.dead) return;

        // the belt carries glasses and puddles along
        for (const p of puddles) p.x += beltV * dt;
        while (t >= nextSpawn) spawn(nextSpawn);
        for (let i = cups.length - 1; i >= 0; i--) {
          const c = cups[i];
          c.x += beltV * dt;
          if (c.leak && c.fill > 0) {
            c.fill = Math.max(0, c.fill - c.leak * dt);
            c.drip += dt;
            if (c.drip > 0.18) {
              c.drip = 0;
              fx.burst(c.x + c.w * 0.12, BELT_Y - 3, { count: 1, speed: 20, life: 0.4, size: 2, round: true, gravity: 200, angle: Math.PI / 2, spread: 0.6, colors: ['#d08a2a'] });
              addPuddle(c.x + c.w * 0.12);
            }
          }
          if (c.state === 'open' && c.x >= SERVE_X) {
            if (c.fill < c.cap * c.line) {
              this.dead = true;
              this.deathReason = c.leak ? 'A cracked glass leaked below its line.' : 'A glass went out short of its line.';
              killer = c;
              deathKind = 'short';
              c.flash = 2;
              return;
            }
            c.state = 'served';
            sparkle.burst(c.x, BELT_Y - c.h - 6, { count: 14, speed: 120, life: 0.7, size: 3, gravity: 120, colors: ['#ffe48a', '#ffd040', '#fff6d0', '#7ee0a0'] });
          }
          if (c.x - c.w / 2 > W + 4) cups.splice(i, 1);
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        updateAir(dt, null);
        if (deathKind === 'over' && killer && Math.random() < 0.7) {
          const side = Math.random() < 0.5 ? -1 : 1;
          fx.burst(killer.x + side * killer.w * 0.5, BELT_Y - killer.h + 2, { count: 1, speed: 30, life: 0.7, size: 3, round: true, gravity: 500, angle: Math.PI / 2 - side * 0.5, spread: 0.4, colors: ['#e9a640', '#f6cf7a', '#fff3d0'] });
          if (Math.random() < 0.3) addPuddle(killer.x + side * (killer.w * 0.5 + 4));
        }
      },

      render(g) {
        g.drawImage(backdrop.canvas, 0, 0, W, H);

        // lanterns, their glow and the specks of light they throw
        const flick = 0.82 + 0.1 * Math.sin(clock * 7.3) + 0.08 * Math.sin(clock * 17.1);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.55 * flick;
        g.drawImage(lightDots.canvas, 0, 0, W, 300);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        for (const [lx, ph] of [[34, 0], [326, 1.7]]) {
          const sway = Math.sin(clock * 1.1 + ph) * 0.05;
          const ly = 130;
          g.strokeStyle = '#8a5a1a';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(lx, 0);
          g.lineTo(lx + Math.sin(sway) * 105, ly - 22);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowWarm, lx + Math.sin(sway) * 120, ly + 4, { size: 120, alpha: 0.75 * flick });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, lantern, lx + Math.sin(sway) * 120, ly, { size: 30, rot: -sway });
        }

        // the belt: a woven kilim runner sliding left to right
        const off = beltS % 24;
        for (let x = -24 + off; x < W; x += 24) g.drawImage(kilim.canvas, x, BELT_Y - 2, 24, 14);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, BELT_Y + 10, W, 2);
        for (const p of puddles) {
          g.fillStyle = `rgba(120,60,10,${p.a.toFixed(3)})`;
          g.beginPath();
          g.ellipse(p.x, BELT_Y + 5, p.r, Math.min(4, p.r * 0.35), 0, 0, TAU);
          g.fill();
        }

        // steam
        for (const s of steam) {
          const k = s.life / s.max;
          drawSprite(g, steamSpr, s.x, s.y, { size: 14 + 22 * k, alpha: Math.sin(Math.PI * k) * 0.9 });
        }

        // glasses
        for (const c of cups) {
          const yC = BELT_Y - c.h / 2;
          const spriteW = c.w + 8;
          drawSprite(g, backs[c.type], c.x, yC, { size: spriteW });
          // the tea inside
          const yb = BELT_Y - 4;
          const ih = c.h - 6;
          const wb = c.w * c.taper - 5;
          const wt = c.w - 5;
          const lv = clamp(c.fill / c.cap, 0, 1);
          if (lv > 0.005) {
            const wob = c.pour > 0 ? Math.sin(clock * 40 + c.x) * 1.2 : 0;
            const yl = yb - lv * ih;
            const wl = lerp(wb, wt, lv);
            g.beginPath();
            g.moveTo(c.x - wb / 2, yb);
            g.lineTo(c.x + wb / 2, yb);
            g.lineTo(c.x + wl / 2, yl - wob);
            g.lineTo(c.x - wl / 2, yl + wob);
            g.closePath();
            const tea = g.createLinearGradient(0, yl, 0, yb);
            tea.addColorStop(0, '#e7a640');
            tea.addColorStop(0.4, '#b9701c');
            tea.addColorStop(1, '#6e3a0c');
            g.fillStyle = tea;
            g.fill();
            // foam on top, and a mint leaf once there's enough tea
            g.strokeStyle = 'rgba(255,236,190,0.9)';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(c.x - wl / 2 + 1, yl + wob + 1);
            g.lineTo(c.x + wl / 2 - 1, yl - wob + 1);
            g.stroke();
            if (lv > 0.3) {
              g.fillStyle = '#3aa860';
              g.beginPath();
              g.ellipse(c.x - wl * 0.15, yl + 2, 3.2, 1.4, 0.3, 0, TAU);
              g.fill();
              g.fillStyle = '#2a8a4a';
              g.beginPath();
              g.ellipse(c.x + wl * 0.12, yl + 2.5, 2.6, 1.2, -0.4, 0, TAU);
              g.fill();
            }
          }
          drawSprite(g, fronts[c.type][c.hue][c.leak ? 1 : 0], c.x, yC, { size: spriteW });

          // the gold line each glass must reach (green once it's there)
          const yLine = yb - c.line * ih;
          const wLine = lerp(wb, wt, c.line) + 5;
          const reached = c.fill >= c.cap * c.line;
          const tts = timeToServe(c);
          const urgent = c.state === 'open' && !reached && tts < 1.6;
          const pulse = 0.5 + 0.5 * Math.sin(clock * 16);
          let col = reached ? '#6cf0a0' : '#ffd54a';
          if (urgent || (killer === c && deathKind === 'short')) col = pulse > 0.5 ? '#ff4050' : '#ffd0d0';
          if (c.state === 'open' || killer === c) {
            g.strokeStyle = col;
            g.lineWidth = 1.6;
            g.setLineDash([3, 2]);
            g.beginPath();
            g.moveTo(c.x - wLine / 2 + 1, yLine);
            g.lineTo(c.x + wLine / 2 - 1, yLine);
            g.stroke();
            g.setLineDash([]);
            g.fillStyle = col;
            for (const s of [-1, 1]) {
              const ex = c.x + s * (wLine / 2 + 1);
              g.beginPath();
              g.moveTo(ex + s * 4, yLine - 3);
              g.lineTo(ex, yLine);
              g.lineTo(ex + s * 4, yLine + 3);
              g.closePath();
              g.fill();
            }
          }
          // near the brim: the rim glows red
          if (c.state === 'open' && lv > 0.86) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, c.x, BELT_Y - c.h, { size: c.w + 26, alpha: clamp((lv - 0.86) / 0.14, 0, 1) * (0.6 + 0.4 * pulse) });
            g.globalCompositeOperation = 'source-over';
          }
          if (c.state === 'served' && c.x < W) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowGold, c.x, yLine, { size: c.w + 18, alpha: 0.35 });
            g.globalCompositeOperation = 'source-over';
          }
          if (urgent) {
            const yy = BELT_Y - c.h - 16 - 3 * pulse;
            g.fillStyle = '#ff4050';
            g.beginPath();
            g.arc(c.x, yy, 7, 0, TAU);
            g.fill();
            g.fillStyle = '#fff';
            g.font = 'bold 11px sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('!', c.x, yy + 0.5);
          }
        }

        // the stream of tea, from the spout down to wherever it lands
        if (stream.length) {
          const pts = [];
          if (!this.dead) pts.push([pot.x, SPOUT_Y]);
          for (let i = stream.length - 1; i >= 0; i--) pts.push([stream[i].x, stream[i].y]);
          const strokeAll = (width, color) => {
            g.strokeStyle = color;
            g.lineWidth = width;
            g.lineCap = 'round';
            g.lineJoin = 'round';
            g.beginPath();
            for (let i = 0; i < pts.length; i++) {
              const [x, y] = pts[i];
              if (i === 0) g.moveTo(x, y);
              else {
                const [px, py] = pts[i - 1];
                if (Math.abs(x - px) + Math.abs(y - py) > 34) g.moveTo(x, y);
                else g.lineTo(x, y);
              }
            }
            g.stroke();
          };
          strokeAll(8, 'rgba(110,52,8,0.5)');
          strokeAll(5.5, '#dc9530');
          strokeAll(1.8, 'rgba(255,238,180,0.9)');
        }

        // the teapot, tilted to pour, held by a hand in a linen sleeve
        const tilt = 0.42 - pot.lean * 0.08 + Math.sin(clock * 2.2) * 0.015;
        const k = POT_SIZE / 110;
        const cs = Math.cos(tilt);
        const sn = Math.sin(tilt);
        const rel = [(-52 - TIP_X) * k, (8 - TIP_Y) * k]; // the handle, relative to the tip
        const hx = pot.x + rel[0] * cs - rel[1] * sn;
        const hy = SPOUT_Y + rel[0] * sn + rel[1] * cs;
        g.save();
        g.translate(pot.x, SPOUT_Y);
        g.rotate(tilt);
        g.drawImage(potSpr.canvas, -(TIP_X + 55) * k, -(TIP_Y + 50) * k, 110 * k, 100 * k);
        g.restore();
        // sleeve from above, and the hand round the handle
        const sx = hx - 46 - pot.lean * 12;
        g.beginPath();
        g.moveTo(sx - 30, -10);
        g.lineTo(sx + 34, -10);
        g.quadraticCurveTo(hx + 22, hy - 120, hx + 12, hy - 18);
        g.lineTo(hx - 12, hy - 24);
        g.quadraticCurveTo(hx - 30, hy - 130, sx - 30, -10);
        g.closePath();
        const linen = g.createLinearGradient(sx - 30, 0, sx + 34, 0);
        linen.addColorStop(0, '#b9ae98');
        linen.addColorStop(0.45, '#fbf6ea');
        linen.addColorStop(1, '#a89c84');
        g.fillStyle = linen;
        g.fill();
        g.strokeStyle = 'rgba(60,40,20,0.45)';
        g.lineWidth = 1;
        g.stroke();
        // folds
        g.strokeStyle = 'rgba(120,100,70,0.35)';
        g.lineWidth = 1.4;
        for (const f of [-0.25, 0.1, 0.35]) {
          g.beginPath();
          g.moveTo(lerp(sx - 30, sx + 34, 0.5 + f), -10);
          g.quadraticCurveTo(lerp(hx - 30, hx + 22, 0.5 + f * 0.6), hy - 140, lerp(hx - 12, hx + 12, 0.5 + f), hy - 40);
          g.stroke();
        }
        // embroidered cuff
        g.strokeStyle = '#1e7a52';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(hx - 10, hy - 26);
        g.lineTo(hx + 10, hy - 22);
        g.stroke();
        g.strokeStyle = '#e3a21a';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(hx - 10.5, hy - 30);
        g.lineTo(hx + 10.5, hy - 26);
        g.stroke();
        // hand
        g.fillStyle = '#9a5a34';
        g.beginPath();
        g.ellipse(hx, hy - 8, 8, 10, 0.2, 0, TAU);
        g.fill();
        g.fillStyle = '#b8744a';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.ellipse(hx + 5, hy - 12 + i * 4.6, 4, 2.3, 0.15, 0, TAU);
          g.fill();
        }

        // the kitchen arch on the left and the serving hatch on the right
        g.drawImage(archL.canvas, 0, BELT_Y - 112, 44, 120);
        g.drawImage(archR.canvas, W - 44, BELT_Y - 112, 44, 120);

        fx.render(g);
        sparkle.render(g, true);

        // the spout glints
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowGold, pot.x, SPOUT_Y, { size: 22, alpha: 0.5 + 0.2 * Math.sin(clock * 5) });
        g.globalCompositeOperation = 'source-over';

        g.drawImage(vignette.canvas, 0, 0, W, H);
        if (killer && deathKind === 'short' && killer.flash > 0) {
          g.fillStyle = `rgba(255,40,60,${(0.12 * killer.flash).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
        }
      },
    };
    return game;
  },
};
