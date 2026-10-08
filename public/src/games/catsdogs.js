// Cats & Dogs — it's raining cats and dogs over a back garden, and you are the fence down the middle.
// Every cat has to touch down in the cat garden on the left of the fence, every dog in the dog yard on
// the right. You never catch anyone: you slide the boundary so that each one lands on its own side,
// reading who comes down first. Later the wind gets up and blows them sideways, and some umbrellas
// turn inside out and drop like stones.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const GROUND = 578; // where paws touch the lawn
const SPAWN_Y = -50;
const FENCE_MIN = 26;
const EDGE = 26; // nobody lands closer than this to the side of the screen
const TABLE_DT = 0.01;
const FAST_V = 360; // an umbrella blown inside out

const smooth = (u) => u * u * (3 - 2 * u);

const CAT_COATS = [
  { fur: '#f0a04b', dark: '#c0661c', belly: '#ffe2bd', stripes: true },
  { fur: '#9aa3ad', dark: '#5d6670', belly: '#e3e7ea', stripes: true },
  { fur: '#3b3540', dark: '#1d1920', belly: '#f4f0ea', stripes: false },
  { fur: '#f3ece2', dark: '#c9a27a', belly: '#ffffff', stripes: false, patches: ['#e08a3c', '#3b3540'] },
];
const DOG_COATS = [
  { fur: '#c98a4b', dark: '#6e3f1b', muzzle: '#f6ead8', ears: '#7a4a22' },
  { fur: '#e7b866', dark: '#b07a32', muzzle: '#f7e1b0', ears: '#c58f42' },
  { fur: '#f4f1ea', dark: '#9b9488', muzzle: '#ffffff', ears: '#2a2a2a', spots: true },
  { fur: '#3a3330', dark: '#1a1614', muzzle: '#5a4f49', ears: '#241e1b' },
];
const CAT_UMB = ['#ff6f91', '#ff9f43', '#e84a5f', '#ff8fb8'];
const DOG_UMB = ['#3fa7f5', '#2ec4b6', '#5b7cfa', '#4fc3e8'];

// ---------- art ----------

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(clamp(k > 0 ? v + (255 - v) * k : v * (1 + k), 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function paintGarden(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // a soft, showery sky clearing to warm light near the rooftops
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#7f9fc8');
    sky.addColorStop(0.45, '#b8cbe3');
    sky.addColorStop(0.85, '#f1dccb');
    sky.addColorStop(1, '#f7e6d2');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, GROUND);
    // a faint rainbow behind it all
    g.lineWidth = 7;
    const bands = ['rgba(255,90,90,0.16)', 'rgba(255,170,70,0.16)', 'rgba(255,235,90,0.15)', 'rgba(110,210,110,0.14)', 'rgba(90,160,255,0.14)', 'rgba(150,110,230,0.13)'];
    bands.forEach((c, i) => {
      g.strokeStyle = c;
      g.beginPath();
      g.arc(W * 0.62, 470, 250 - i * 7, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    });
    // far rooftops
    let x = -10;
    while (x < W + 10) {
      const w = rng.range(46, 78);
      const h = rng.range(60, 110);
      const top = 520 - h;
      const wall = rng.pick(['#c9a9a0', '#b7a2b4', '#a9b3c6', '#c7b49a']);
      g.fillStyle = wall;
      g.fillRect(x, top, w, 80 + h);
      g.fillStyle = rng.pick(['#7d5e66', '#6b6080', '#5f6b84', '#83634e']);
      g.beginPath();
      g.moveTo(x - 4, top + 2);
      g.lineTo(x + w / 2, top - rng.range(18, 30));
      g.lineTo(x + w + 4, top + 2);
      g.closePath();
      g.fill();
      if (rng.chance(0.6)) {
        g.fillStyle = '#7a5a50';
        g.fillRect(x + w * 0.7, top - 26, 8, 20);
      }
      for (let wy = top + 14; wy < 540; wy += 24) {
        for (let wx = x + 8; wx < x + w - 12; wx += 18) {
          g.fillStyle = rng.chance(0.3) ? 'rgba(255,225,150,0.75)' : 'rgba(70,80,110,0.45)';
          g.fillRect(wx, wy, 9, 12);
        }
      }
      x += w + rng.range(-4, 6);
    }
    // a misty band in front of the houses
    const mist = g.createLinearGradient(0, 470, 0, 560);
    mist.addColorStop(0, 'rgba(240,225,215,0)');
    mist.addColorStop(1, 'rgba(240,225,215,0.65)');
    g.fillStyle = mist;
    g.fillRect(0, 470, W, 90);
    // a hedge along the back of the garden
    for (let i = 0; i < 70; i++) {
      const hx = rng.range(-10, W + 10);
      const hy = rng.range(540, 566);
      const r = rng.range(10, 20);
      const c = g.createRadialGradient(hx - r * 0.3, hy - r * 0.4, 1, hx, hy, r);
      c.addColorStop(0, rng.pick(['#6fa652', '#5d9447', '#7cb35c']));
      c.addColorStop(1, '#2f5a2a');
      g.fillStyle = c;
      g.beginPath();
      g.arc(hx, hy, r, 0, Math.PI * 2);
      g.fill();
    }
    // the lawn
    const lawn = g.createLinearGradient(0, GROUND - 14, 0, H);
    lawn.addColorStop(0, '#8cc65a');
    lawn.addColorStop(0.3, '#6fae46');
    lawn.addColorStop(1, '#3f7a2c');
    g.fillStyle = lawn;
    g.fillRect(0, GROUND - 14, W, H - GROUND + 14);
    g.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const bx = rng.range(0, W);
      const by = rng.range(GROUND - 14, H);
      g.strokeStyle = rng.pick(['rgba(160,215,110,0.6)', 'rgba(50,100,35,0.5)', 'rgba(120,180,80,0.6)']);
      g.lineWidth = rng.range(0.8, 1.6);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + rng.range(-2, 2), by - rng.range(3, 7));
      g.stroke();
    }
    // daisies and clover
    for (let i = 0; i < 26; i++) {
      const fx = rng.range(8, W - 8);
      const fy = rng.range(GROUND + 6, H - 6);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 1.6, 1.8, 1.1, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(fx, fy, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    // stepping-stone puddles
    for (let i = 0; i < 5; i++) {
      const px = rng.range(30, W - 30);
      const py = rng.range(GROUND + 18, H - 14);
      const c = g.createRadialGradient(px, py, 1, px, py, 18);
      c.addColorStop(0, 'rgba(200,225,245,0.55)');
      c.addColorStop(1, 'rgba(150,190,220,0)');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(px, py, 18, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

// A cat basket on the left edge and a dog kennel on the right: where everybody's heading.
function paintHomes() {
  const basket = makeSprite(70, 60, (g) => {
    g.fillStyle = 'rgba(30,50,20,0.3)';
    g.beginPath();
    g.ellipse(0, 22, 32, 6, 0, 0, Math.PI * 2);
    g.fill();
    const b = g.createLinearGradient(0, -4, 0, 24);
    b.addColorStop(0, '#e9b97a');
    b.addColorStop(1, '#9b6a35');
    g.fillStyle = b;
    g.beginPath();
    g.moveTo(-30, 0);
    g.quadraticCurveTo(-28, 24, 0, 24);
    g.quadraticCurveTo(28, 24, 30, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(110,70,30,0.55)';
    g.lineWidth = 1;
    for (let y = 4; y < 22; y += 4) {
      g.beginPath();
      g.moveTo(-28 + y * 0.2, y);
      g.lineTo(28 - y * 0.2, y);
      g.stroke();
    }
    // a pink cushion and a ball of yarn
    const c = g.createRadialGradient(-4, -6, 1, 0, -2, 26);
    c.addColorStop(0, '#ffc2d4');
    c.addColorStop(1, '#e46a92');
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(0, 0, 27, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b55dd6';
    g.beginPath();
    g.arc(18, -10, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,220,255,0.7)';
    g.lineWidth = 1;
    for (const a of [0.3, 1.2, 2.2]) {
      g.beginPath();
      g.ellipse(18, -10, 6, 3, a, 0, Math.PI * 2);
      g.stroke();
    }
  });
  const kennel = makeSprite(70, 76, (g) => {
    g.fillStyle = 'rgba(30,50,20,0.3)';
    g.beginPath();
    g.ellipse(0, 32, 34, 6, 0, 0, Math.PI * 2);
    g.fill();
    const w = g.createLinearGradient(-28, 0, 28, 0);
    w.addColorStop(0, '#4f8fd0');
    w.addColorStop(1, '#2d5f9a');
    g.fillStyle = w;
    g.fillRect(-26, -6, 52, 38);
    g.strokeStyle = 'rgba(20,40,80,0.35)';
    g.lineWidth = 1;
    for (let x = -18; x < 26; x += 9) {
      g.beginPath();
      g.moveTo(x, -6);
      g.lineTo(x, 32);
      g.stroke();
    }
    g.fillStyle = '#c84a3a';
    g.beginPath();
    g.moveTo(-33, -4);
    g.lineTo(0, -32);
    g.lineTo(33, -4);
    g.lineTo(28, 0);
    g.lineTo(0, -24);
    g.lineTo(-28, 0);
    g.closePath();
    g.fill();
    g.fillStyle = '#1b1410';
    g.beginPath();
    g.moveTo(-12, 32);
    g.lineTo(-12, 10);
    g.arc(0, 10, 12, Math.PI, 0);
    g.lineTo(12, 32);
    g.closePath();
    g.fill();
    // a bone on the sign
    g.fillStyle = '#fff8ea';
    g.fillRect(-8, -16, 16, 4);
    for (const [bx, by] of [[-8, -17], [-8, -11], [8, -17], [8, -11]]) {
      g.beginPath();
      g.arc(bx, by, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  });
  return { basket, kennel };
}

function drawCat(g, c, { arms = 'up', scared = false } = {}) {
  // tail
  g.strokeStyle = c.fur;
  g.lineWidth = 4.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(8, 18);
  g.quadraticCurveTo(22, 16, 18, 2);
  g.quadraticCurveTo(16, -4, 20, -6);
  g.stroke();
  g.strokeStyle = c.dark;
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(19.6, -2);
  g.lineTo(20, -6);
  g.stroke();
  // back legs dangling
  g.fillStyle = c.fur;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * 5.5, 22, 3.6, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.belly;
    g.beginPath();
    g.ellipse(s * 5.5, 26, 3, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.fur;
  }
  // body
  const b = g.createRadialGradient(-3, 4, 1, 0, 8, 14);
  b.addColorStop(0, shade(c.fur, 0.25));
  b.addColorStop(1, c.dark);
  g.fillStyle = b;
  g.beginPath();
  g.ellipse(0, 9, 10, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.belly;
  g.beginPath();
  g.ellipse(0, 11, 5.5, 9, 0, 0, Math.PI * 2);
  g.fill();
  if (c.patches) {
    g.fillStyle = c.patches[0];
    g.beginPath();
    g.ellipse(-6, 6, 4, 6, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.patches[1];
    g.beginPath();
    g.ellipse(6, 13, 3.5, 5, -0.3, 0, Math.PI * 2);
    g.fill();
  }
  // arms reaching up to the handle
  g.strokeStyle = c.fur;
  g.lineWidth = 4.2;
  if (arms === 'up') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 8, 2);
      g.quadraticCurveTo(s * 11, -12, s * 2, -27);
      g.stroke();
    }
    g.fillStyle = c.belly;
    g.beginPath();
    g.arc(0, -28, 3.6, 0, Math.PI * 2);
    g.fill();
  } else {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 8, 3);
      g.lineTo(s * 9, 16);
      g.stroke();
    }
  }
  // head
  const hy = -8;
  g.fillStyle = c.fur;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 10.5, hy - 2);
    g.lineTo(s * 9, hy - 16);
    g.lineTo(s * 2.5, hy - 9);
    g.closePath();
    g.fill();
    g.fillStyle = '#f7a8bd';
    g.beginPath();
    g.moveTo(s * 8.5, hy - 5);
    g.lineTo(s * 8.2, hy - 12.5);
    g.lineTo(s * 4.5, hy - 8.5);
    g.closePath();
    g.fill();
    g.fillStyle = c.fur;
  }
  const hg = g.createRadialGradient(-3, hy - 4, 1, 0, hy, 12);
  hg.addColorStop(0, shade(c.fur, 0.3));
  hg.addColorStop(1, c.fur);
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(0, hy, 11.5, 10, 0, 0, Math.PI * 2);
  g.fill();
  if (c.stripes) {
    g.strokeStyle = c.dark;
    g.lineWidth = 1.4;
    for (const dx of [-3, 0, 3]) {
      g.beginPath();
      g.moveTo(dx, hy - 9.5);
      g.lineTo(dx * 0.8, hy - 5.5);
      g.stroke();
    }
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 11, hy + 1);
      g.lineTo(s * 7.5, hy + 1.5);
      g.stroke();
    }
  }
  if (c.patches) {
    g.fillStyle = c.patches[0];
    g.beginPath();
    g.ellipse(-5, hy - 5, 5, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = c.belly;
  g.beginPath();
  g.ellipse(0, hy + 4.5, 5.5, 3.8, 0, 0, Math.PI * 2);
  g.fill();
  // eyes
  for (const s of [-1, 1]) {
    g.fillStyle = '#b8e05a';
    g.beginPath();
    g.ellipse(s * 4.4, hy - 1.5, 2.8, scared ? 3.2 : 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.ellipse(s * 4.4, hy - 1.5, scared ? 1.6 : 0.9, scared ? 1.9 : 2.3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(s * 4.4 - 1.4, hy - 3.4, 1.1, 1.1);
  }
  g.fillStyle = '#ef7d9c';
  g.beginPath();
  g.moveTo(-1.6, hy + 2.6);
  g.lineTo(1.6, hy + 2.6);
  g.lineTo(0, hy + 4.4);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,30,30,0.7)';
  g.lineWidth = 0.8;
  if (scared) {
    g.fillStyle = '#5a2030';
    g.beginPath();
    g.ellipse(0, hy + 6.6, 1.6, 1.8, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(0, hy + 4.4);
    g.quadraticCurveTo(-1.5, hy + 6.4, -3, hy + 5.4);
    g.moveTo(0, hy + 4.4);
    g.quadraticCurveTo(1.5, hy + 6.4, 3, hy + 5.4);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(s * 5, hy + 4 + k);
      g.lineTo(s * 15, hy + 3 + k * 2.4);
      g.stroke();
    }
  }
}

function drawDog(g, c, { arms = 'up', scared = false } = {}) {
  // wagging tail
  g.strokeStyle = c.fur;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-8, 17);
  g.quadraticCurveTo(-18, 14, -17, 3);
  g.stroke();
  g.strokeStyle = c.muzzle;
  g.beginPath();
  g.moveTo(-17.2, 5);
  g.lineTo(-17, 2);
  g.stroke();
  // legs
  for (const s of [-1, 1]) {
    g.fillStyle = c.fur;
    g.beginPath();
    g.ellipse(s * 5.5, 22, 3.9, 5.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = c.muzzle;
    g.beginPath();
    g.ellipse(s * 5.5, 26.5, 3.4, 2.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  // body
  const b = g.createRadialGradient(-3, 4, 1, 0, 9, 15);
  b.addColorStop(0, shade(c.fur, 0.2));
  b.addColorStop(1, c.dark);
  g.fillStyle = b;
  g.beginPath();
  g.ellipse(0, 9, 11, 13, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.muzzle;
  g.beginPath();
  g.ellipse(0, 11, 5.5, 8.5, 0, 0, Math.PI * 2);
  g.fill();
  if (c.spots) {
    g.fillStyle = '#2a2a2a';
    for (const [x, y, r] of [[-6, 4, 2], [5, 9, 1.6], [-4, 16, 1.4], [7, 2, 1.3]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // a red collar with a gold tag
  g.fillStyle = '#d63a3a';
  g.fillRect(-8, -2.5, 16, 3);
  g.fillStyle = '#ffd34d';
  g.beginPath();
  g.arc(0, 2, 2, 0, Math.PI * 2);
  g.fill();
  // arms
  g.strokeStyle = c.fur;
  g.lineWidth = 4.4;
  if (arms === 'up') {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 9, 3);
      g.quadraticCurveTo(s * 12, -12, s * 2, -27);
      g.stroke();
    }
    g.fillStyle = c.muzzle;
    g.beginPath();
    g.arc(0, -28, 3.8, 0, Math.PI * 2);
    g.fill();
  } else {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 9, 4);
      g.lineTo(s * 9.5, 17);
      g.stroke();
    }
  }
  // head
  const hy = -9;
  const hg = g.createRadialGradient(-3, hy - 4, 1, 0, hy, 12);
  hg.addColorStop(0, shade(c.fur, 0.25));
  hg.addColorStop(1, c.fur);
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(0, hy, 11, 10.5, 0, 0, Math.PI * 2);
  g.fill();
  if (c.spots) {
    g.fillStyle = '#2a2a2a';
    g.beginPath();
    g.arc(5, hy - 5, 2.3, 0, Math.PI * 2);
    g.fill();
  }
  // floppy ears
  g.fillStyle = c.ears;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * 11, hy + (scared ? -4 : 1), 4.5, 9, s * (scared ? -0.9 : 0.35), 0, Math.PI * 2);
    g.fill();
  }
  // muzzle, nose, tongue
  g.fillStyle = c.muzzle;
  g.beginPath();
  g.ellipse(0, hy + 4.5, 6.5, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1414';
  g.beginPath();
  g.ellipse(0, hy + 2, 2.8, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillRect(-1.2, hy + 1, 1.2, 0.9);
  if (scared) {
    g.fillStyle = '#5a2020';
    g.beginPath();
    g.ellipse(0, hy + 7, 2.2, 2.4, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#f2788e';
    g.beginPath();
    g.ellipse(1.2, hy + 8.5, 2.2, 3, 0.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,20,20,0.7)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-3.5, hy + 6);
    g.quadraticCurveTo(0, hy + 7.4, 3.5, hy + 6);
    g.stroke();
  }
  for (const s of [-1, 1]) {
    g.fillStyle = '#1b1414';
    g.beginPath();
    g.arc(s * 4.3, hy - 3, scared ? 2.2 : 1.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(s * 4.3 - 1.1, hy - 4.4, 1, 1);
    g.strokeStyle = 'rgba(30,20,10,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(s * 2.5, hy - 6.6 - (scared ? 1.2 : 0));
    g.lineTo(s * 6, hy - 7.2);
    g.stroke();
  }
}

function drawUmbrella(g, color, flipped) {
  const top = -46;
  const rim = -28;
  const hw = 27;
  // the shaft and handle
  g.strokeStyle = '#4a3a30';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, flipped ? rim + 4 : top + 2);
  g.lineTo(0, -28);
  g.stroke();
  if (!flipped) {
    const c = g.createLinearGradient(-hw, 0, hw, 0);
    c.addColorStop(0, shade(color, -0.3));
    c.addColorStop(0.35, shade(color, 0.25));
    c.addColorStop(1, shade(color, -0.35));
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-hw, rim);
    g.bezierCurveTo(-hw, top - 2, hw, top - 2, hw, rim);
    // scalloped edge
    const n = 6;
    for (let k = n; k > 0; k--) {
      const x0 = -hw + ((k - 1) / n) * hw * 2;
      const x1 = -hw + (k / n) * hw * 2;
      g.quadraticCurveTo((x0 + x1) / 2, rim - 5, x0, rim);
    }
    g.closePath();
    g.fill();
    // panels
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.9;
    for (let k = 1; k < 6; k++) {
      const x = -hw + (k / 6) * hw * 2;
      g.beginPath();
      g.moveTo(0, top + 2);
      g.quadraticCurveTo(x * 0.7, top + 4, x, rim - 1);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-9, top + 9, 8, 3.5, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3a30';
    g.beginPath();
    g.arc(0, top + 0.5, 2, 0, Math.PI * 2);
    g.fill();
  } else {
    // blown inside out: a cup opening upwards, ribs sticking out
    g.fillStyle = shade(color, -0.15);
    g.beginPath();
    g.moveTo(-hw - 2, top - 2);
    g.quadraticCurveTo(-10, rim + 8, 0, rim + 4);
    g.quadraticCurveTo(10, rim + 8, hw + 2, top - 2);
    g.lineTo(hw - 6, top + 4);
    g.lineTo(hw - 10, top - 3);
    g.lineTo(hw - 16, top + 6);
    g.quadraticCurveTo(0, rim - 4, -hw + 12, top + 5);
    g.lineTo(-hw + 6, top - 2);
    g.closePath();
    g.fill();
    g.strokeStyle = '#3d3029';
    g.lineWidth = 1;
    for (const s of [-1, -0.5, 0.5, 1]) {
      g.beginPath();
      g.moveTo(0, rim + 4);
      g.lineTo(s * (hw + 4), top - 6 + Math.abs(s) * 3);
      g.stroke();
    }
  }
}

function paintFaller(type, coat, umb, flipped) {
  return makeSprite(64, 100, (g) => {
    g.translate(0, 8);
    drawUmbrella(g, umb, flipped);
    if (type === 'cat') drawCat(g, coat, { scared: flipped });
    else drawDog(g, coat, { scared: flipped });
  });
}

function paintWalker(type, coat, scared) {
  return makeSprite(44, 64, (g) => {
    g.translate(0, 2);
    if (type === 'cat') drawCat(g, coat, { arms: 'down', scared });
    else drawDog(g, coat, { arms: 'down', scared });
  });
}

// The player: a fence post seen end on, with a two-way sign on top.
function paintFence() {
  return makeSprite(70, 124, (g) => {
    // the post
    const p = g.createLinearGradient(-8, 0, 8, 0);
    p.addColorStop(0, '#7a5232');
    p.addColorStop(0.4, '#c89a66');
    p.addColorStop(1, '#5e3d22');
    g.fillStyle = p;
    g.beginPath();
    g.moveTo(-7, 58);
    g.lineTo(-7, -14);
    g.lineTo(0, -21);
    g.lineTo(7, -14);
    g.lineTo(7, 58);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,35,15,0.4)';
    g.lineWidth = 0.8;
    for (const x of [-3, 2]) {
      g.beginPath();
      g.moveTo(x, -12);
      g.lineTo(x + 0.6, 56);
      g.stroke();
    }
    // the end of the cross rails
    for (const y of [8, 36]) {
      g.fillStyle = '#a77a4c';
      g.fillRect(-9, y, 18, 6);
      g.fillStyle = 'rgba(255,240,210,0.35)';
      g.fillRect(-9, y, 18, 1.5);
    }
    // the sign: cat garden this way, dog yard that way
    const sy = -38;
    const arrow = (s, col, dark) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, sy - 11);
      g.lineTo(s * 24, sy - 11);
      g.lineTo(s * 33, sy);
      g.lineTo(s * 24, sy + 11);
      g.lineTo(0, sy + 11);
      g.closePath();
      g.fill();
      g.strokeStyle = dark;
      g.lineWidth = 1.5;
      g.stroke();
    };
    arrow(-1, '#ff8fb0', '#b83d68');
    arrow(1, '#6cc0f2', '#2a6fa8');
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-30, sy - 10, 60, 3.5);
    // a cat face on the left, a dog face on the right
    g.fillStyle = '#fff';
    const cx = -15;
    g.beginPath();
    g.moveTo(cx - 6.5, sy - 2);
    g.lineTo(cx - 6, sy - 9);
    g.lineTo(cx - 2, sy - 5);
    g.lineTo(cx + 2, sy - 5);
    g.lineTo(cx + 6, sy - 9);
    g.lineTo(cx + 6.5, sy - 2);
    g.arc(cx, sy + 0.5, 6.6, 0, Math.PI);
    g.closePath();
    g.fill();
    const dx = 15;
    g.beginPath();
    g.arc(dx, sy + 0.5, 6.2, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(dx + s * 6.5, sy + 1.5, 2.6, 5, s * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#b83d68';
    for (const s of [-1, 1]) g.fillRect(cx + s * 2.6 - 0.8, sy - 0.5, 1.6, 2);
    g.fillStyle = '#2a6fa8';
    for (const s of [-1, 1]) g.fillRect(dx + s * 2.4 - 0.8, sy - 1.5, 1.6, 2);
    g.beginPath();
    g.ellipse(dx, sy + 2.5, 1.8, 1.3, 0, 0, Math.PI * 2);
    g.fill();
    // nail
    g.fillStyle = '#d9d2c4';
    g.beginPath();
    g.arc(0, sy, 1.6, 0, Math.PI * 2);
    g.fill();
  });
}

function paintCloud(rng) {
  return makeSprite(180, 80, (g) => {
    for (let i = 0; i < 14; i++) {
      const x = rng.range(-62, 62);
      const y = rng.range(-14, 14) - Math.abs(x) * 0.08;
      const r = rng.range(16, 30) * (1 - Math.abs(x) / 140);
      const c = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
      c.addColorStop(0, 'rgba(255,255,255,0.95)');
      c.addColorStop(0.7, 'rgba(225,232,245,0.85)');
      c.addColorStop(1, 'rgba(160,175,205,0)');
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

// ---------- game ----------

export default {
  id: 'catsdogs',
  title: 'Cats & Dogs',
  emoji: '☔',
  tagline: 'It’s raining cats and dogs! Slide the fence so every cat lands to its left and every dog to its right; one in the wrong garden and it’s chaos.',
  colors: { bg: '#9fb7d8', fg: '#2b2440', accent: '#ff6f91' },

  // Ska: a bouncy, cartoonish rush in E♭ major at 144 BPM. Kick and backbeat snare with a walking
  // sawtooth bass and offbeat square "skank" chords from the first bar; then hi-hats and an organ
  // bubble; then the horn section's tune; then four-on-the-floor kicks, a second horn in thirds,
  // brass stabs and a shaker for the finale. 36 bars = 60s.
  music: {
    cps: 36 / 60,
    setup: `
      const kick = note("eb2 ~ eb2 ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick4 = note("eb2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ white ~ white").decay(0.12).sustain(0).hpf(1300).lpf(6000).gain(0.18)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(6500).gain("[0.02 0.035 0.045 0.035]*4")
      const chords = "<[eb4,g4,bb4] [c4,eb4,g4] [ab3,c4,eb4] [bb3,d4,f4]>"
      const bass = note("<[eb2 g2 bb2 c3 eb3 c3 bb2 g2] [c2 eb2 g2 bb2 c3 bb2 g2 eb2] [ab2 c3 eb3 f3 ab2 g2 f2 eb2] [bb2 d3 f3 ab3 f3 d3 bb2 d3]>")
        .s("sawtooth").decay(0.16).sustain(0.35).release(0.05).lpf(saw.range(700, 1300).slow(36)).gain(0.32)
      const skank = note(chords).struct("[~ x]*4").s("square")
        .decay(0.07).sustain(0).hpf(450).lpf(saw.range(1800, 3000).slow(36)).gain(0.07).pan(0.4)
      const organ = note(chords).struct("[~ x x ~]*2").s("triangle").decay(0.12).sustain(0.2).gain(0.07).pan(0.62)
      const horns = note("<[bb4 ~ g4 bb4 eb5 ~ d5 eb5] [g5 ~ eb5 c5 d5 ~ eb5 ~] [c5 ~ ab4 c5 eb5 ~ f5 eb5] [d5 ~ f5 ~ bb4 c5 d5 ~]>")
        .s("sawtooth").attack(0.01).decay(0.2).sustain(0.45).release(0.08).lpf(2100).gain(0.07).pan(0.55)
        .delay(0.15).delaytime(0.3125).delayfeedback(0.2)
      const horns2 = note("<[g4 ~ eb4 g4 c5 ~ bb4 c5] [eb5 ~ c5 ab4 bb4 ~ c5 ~] [ab4 ~ f4 ab4 c5 ~ d5 c5] [bb4 ~ d5 ~ g4 a4 bb4 ~]>")
        .s("square").attack(0.01).decay(0.2).sustain(0.4).release(0.08).lpf(1700).gain(0.05).pan(0.4)
      const stabs = note(chords).struct("x ~ ~ x ~ ~ x ~").s("sawtooth").decay(0.12).sustain(0).lpf(2200).gain(0.06)
    `,
    song: `arrange(
      [8, stack(kick, snare, bass, skank)],
      [9, stack(kick, snare, hats, bass, skank, organ)],
      [9, stack(kick, snare, hats, bass, skank, organ, horns)],
      [10, stack(kick4, snare, hats, shaker, bass, skank, organ, horns, horns2, stabs)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const garden = paintGarden(W, H, art);
    const homes = paintHomes();
    const fenceArt = paintFence();
    const clouds = [paintCloud(art), paintCloud(art), paintCloud(art)];
    const sunGlow = glowSprite('rgba(255,236,190,1)', 120);
    const markGlow = glowSprite('rgba(255,255,255,1)', 18);
    const vignette = vignetteSprite(W, H, 0.4, '40,30,60');
    const looks = {
      cat: CAT_COATS.map((c, i) => ({ coat: c, float: paintFaller('cat', c, CAT_UMB[i], false), flip: paintFaller('cat', c, CAT_UMB[(i + 2) % 4], true), walk: paintWalker('cat', c, false), mad: paintWalker('cat', c, true) })),
      dog: DOG_COATS.map((c, i) => ({ coat: c, float: paintFaller('dog', c, DOG_UMB[i], false), flip: paintFaller('dog', c, DOG_UMB[(i + 1) % 4], true), walk: paintWalker('dog', c, false), mad: paintWalker('dog', c, true) })),
    };

    const fence = createMover({ x: W / 2, minX: FENCE_MIN, maxX: W - FENCE_MIN, speed: 300, accel: 20 });
    const fx = createParticles();
    const plan = rng.fork('plan');
    const deco = rng.fork('deco');

    // ---- the wind: calm at first, then gusts that swing from one side to the other ----
    const wph = [plan.range(0, 6.28), plan.range(0, 6.28)];
    const windAt = (t) => {
      if (t < 13) return 0;
      const ramp = clamp((t - 13) / 6, 0, 1) * lerp(20, 55, progress(t, 60, 1.1));
      return ramp * (0.65 * Math.sin(0.42 * t + wph[0]) + 0.35 * Math.sin(1.1 * t + wph[1]));
    };
    const drift = [0];
    for (let i = 1; i <= 6800; i++) drift.push(drift[i - 1] + windAt((i - 0.5) * TABLE_DT) * TABLE_DT);
    const Dat = (t) => {
      const f = clamp(t, 0, 67.99) / TABLE_DT;
      const i = Math.floor(f);
      return drift[i] + (drift[i + 1] - drift[i]) * (f - i);
    };

    // ---- a route the fence could take, then every landing placed on the right side of it ----
    const way = [{ t: 0, x: W / 2 }];
    {
      let t = 2.4;
      let x = W / 2;
      way.push({ t, x });
      while (t < 66) {
        const p = progress(t, 60, 1.2);
        let nx = plan.range(60, W - 60);
        if (Math.abs(nx - x) < 60) nx = x + (nx > x ? 1 : -1) * 90;
        nx = clamp(nx, 60, W - 60);
        const vmax = lerp(120, 240, p) / 1.5; // smoothstep peaks at 1.5× its average speed
        t += Math.max(Math.abs(nx - x) / vmax, plan.range(lerp(1.2, 0.5, p), lerp(2.4, 1.2, p)));
        x = nx;
        way.push({ t, x });
        if (plan.chance(0.25)) {
          t += plan.range(0.4, lerp(1.4, 0.6, p));
          way.push({ t, x });
        }
      }
    }
    const routeX = (t) => {
      for (let i = 1; i < way.length; i++) {
        if (t <= way[i].t) {
          const a = way[i - 1];
          const b = way[i];
          return a.x + (b.x - a.x) * smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
        }
      }
      return way.at(-1).x;
    };

    const fallers = [];
    const add = (T, type, p) => {
      const f = routeX(T);
      const margin = lerp(52, 18, p);
      const spread = lerp(100, 46, p);
      let s = type === 'cat' ? -1 : 1;
      let L = f + s * plan.range(margin, margin + spread);
      if (L < EDGE || L > W - EDGE) {
        s = -s;
        type = type === 'cat' ? 'dog' : 'cat';
        L = f + s * plan.range(margin, margin + spread);
      }
      L = clamp(L, EDGE, W - EDGE);
      if (type === 'cat' ? L > f - margin * 0.8 : L < f + margin * 0.8) return; // no room either side
      const fast = T > 26 && plan.chance(lerp(0.1, 0.3, p));
      const v = fast ? FAST_V : plan.range(lerp(140, 175, p), lerp(165, 230, p));
      fallers.push({
        T,
        type,
        L,
        v,
        fast,
        k: fast ? 0.25 : 1, // how much the wind carries it
        A: fast ? 0 : plan.range(4, lerp(14, 26, p)),
        w: plan.range(1.3, 2.3),
        ph: plan.range(0, 6.28),
        look: looks[type][deco.int(0, 3)],
        done: false,
      });
    };
    {
      let T = 3.2;
      let lastType = 'dog';
      while (T < 62) {
        const p = progress(T, 60, 1.25);
        // mostly alternate, so the fence keeps getting squeezed from both sides
        const type = plan.chance(lerp(0.6, 0.72, p)) ? (lastType === 'cat' ? 'dog' : 'cat') : lastType;
        add(T, type, p);
        lastType = type;
        if (T > 11 && plan.chance(lerp(0.12, 0.35, p))) {
          // a pair landing together, one either side
          add(T + plan.range(0.05, 0.2), type === 'cat' ? 'dog' : 'cat', p);
        }
        T += plan.range(lerp(1.4, 0.45, p), lerp(2.0, 0.72, p));
      }
    }
    fallers.sort((a, b) => a.T - b.T);

    const xAt = (f, t) => {
      const u = f.T - t;
      return f.L - f.k * (Dat(f.T) - Dat(t)) + f.A * Math.sin(f.w * u + f.ph) - f.A * Math.sin(f.ph);
    };
    const yAt = (f, t) => GROUND - f.v * (f.T - t);
    const spawnT = (f) => f.T - (GROUND - SPAWN_Y) / f.v;

    // ---- cosmetic bits ----
    const rain = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 8 + Math.random() * 10, v: 520 + Math.random() * 260 }));
    const cloudPos = clouds.map((c, i) => ({ art: c, x: deco.range(0, W), y: 40 + i * 62 + deco.range(-14, 14), v: deco.range(4, 9), s: deco.range(0.9, 1.25) }));
    const leaves = Array.from({ length: 8 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, c: Math.random() < 0.5 ? '#e0913a' : '#c9612f' }));
    const walkers = [];

    let next = 0;
    let lastT = 0;
    let clock = 0;
    let wind = 0;
    let deadT = 0;
    let culprit = null;

    const game = {
      dead: false,
      deathReason: '',
      get fence() {
        return fence;
      },
      fallers,
      xAt,
      routeX,

      update(dt, dir, t) {
        lastT = t;
        clock += dt;
        wind = windAt(t);
        fence.update(dt, dir);

        while (next < fallers.length && fallers[next].T <= t + dt) {
          const f = fallers[next++];
          f.done = true;
          const ok = f.type === 'cat' ? f.L < fence.x : f.L > fence.x;
          const col = f.type === 'cat' ? ['#ffd1de', '#ffffff', '#ff9fbc'] : ['#cfeaff', '#ffffff', '#8fcdf5'];
          fx.burst(f.L, GROUND + 2, { count: 10, speed: 90, life: 0.45, size: 2.6, round: true, gravity: 260, angle: -Math.PI / 2, spread: 2.4, colors: ['#e8f4ff', '#bcd8ee', ...col] });
          if (!ok) {
            this.dead = true;
            culprit = f;
            this.deathReason = f.type === 'cat' ? 'A cat landed in the dog yard. Fur flew everywhere.' : 'A dog landed in the cat garden. Total chaos.';
            fx.burst(f.L, GROUND - 20, { count: 50, speed: 220, life: 1.1, size: 4, round: true, gravity: 120, drag: 1.5, colors: [f.look.coat.fur, f.look.coat.dark, '#ffffff', '#ffe066'] });
            return;
          }
          walkers.push({ x: f.L, dir: f.type === 'cat' ? -1 : 1, look: f.look, t0: clock, sp: 70 + Math.random() * 30 });
        }

        for (let i = walkers.length - 1; i >= 0; i--) {
          const w = walkers[i];
          w.x += w.dir * w.sp * dt;
          if (w.x < -30 || w.x > W + 30) walkers.splice(i, 1);
        }
        for (const r of rain) {
          r.y += r.v * dt;
          r.x += wind * 3 * dt;
          if (r.y > GROUND + 10) {
            if (Math.random() < 0.05) fx.burst(r.x, GROUND + 4 + Math.random() * 40, { count: 2, speed: 40, life: 0.25, size: 1.6, round: true, gravity: 200, angle: -Math.PI / 2, spread: 1.5, colors: ['#e2f0ff'] });
            r.y -= GROUND + 40;
            r.x = Math.random() * (W + 80) - 40;
          }
        }
        for (const l of leaves) {
          l.x += (wind * 2.2 + Math.sin(clock + l.r) * 10) * dt;
          l.y += (30 + Math.sin(clock * 2 + l.r) * 12) * dt;
          l.r += l.vr * dt;
          if (l.y > GROUND) (l.y = -10), (l.x = Math.random() * W);
          if (l.x < -20) l.x = W + 20;
          if (l.x > W + 20) l.x = -20;
        }
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        if (culprit && Math.random() < 0.35) fx.burst(culprit.L + (Math.random() - 0.5) * 30, GROUND - 20, { count: 2, speed: 120, life: 0.6, size: 3, round: true, gravity: 100, colors: [culprit.look.coat.fur, '#ffffff'] });
        for (const r of rain) {
          r.y += r.v * dt;
          if (r.y > GROUND + 10) r.y -= GROUND + 40;
        }
        fx.update(dt);
      },

      render(g) {
        const t = lastT;
        drawSprite(g, garden, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.8, 120, { size: 360, alpha: 0.28 });
        g.globalCompositeOperation = 'source-over';
        for (const c of cloudPos) {
          c.x += (c.v + wind * 0.3) * 0.008;
          if (c.x > W + 110) c.x = -110;
          if (c.x < -110) c.x = W + 110;
          drawSprite(g, c.art, c.x, c.y, { size: 180 * c.s, alpha: 0.85 });
        }

        // the two gardens: tinted either side of the fence, with a line of light rising from it
        const fxp = fence.x;
        g.fillStyle = 'rgba(255,130,170,0.09)';
        g.fillRect(0, 0, fxp, GROUND - 14);
        g.fillStyle = 'rgba(90,175,240,0.09)';
        g.fillRect(fxp, 0, W - fxp, GROUND - 14);
        g.fillStyle = 'rgba(255,110,160,0.22)';
        g.fillRect(0, GROUND - 14, fxp, H - GROUND + 14);
        g.fillStyle = 'rgba(70,160,240,0.22)';
        g.fillRect(fxp, GROUND - 14, W - fxp, H - GROUND + 14);
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 2;
        g.setLineDash([6, 9]);
        g.lineDashOffset = -clock * 30;
        g.beginPath();
        g.moveTo(fxp, 470);
        g.lineTo(fxp, 0);
        g.stroke();
        g.setLineDash([]);

        drawSprite(g, homes.basket, 22, GROUND + 6, { size: 70 });
        drawSprite(g, homes.kennel, W - 22, GROUND - 4, { size: 70 });

        // rain
        g.strokeStyle = 'rgba(235,245,255,0.45)';
        g.lineWidth = 1.1;
        g.beginPath();
        const slant = wind * 0.012;
        for (const r of rain) {
          g.moveTo(r.x, r.y);
          g.lineTo(r.x - slant * r.l * 4, r.y - r.l);
        }
        g.stroke();
        for (const l of leaves) {
          g.save();
          g.translate(l.x, l.y);
          g.rotate(l.r);
          g.fillStyle = l.c;
          g.beginPath();
          g.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }

        // shadows and landing marks on the lawn
        for (let i = next; i < fallers.length; i++) {
          const f = fallers[i];
          if (spawnT(f) > t) break;
          const x = xAt(f, t);
          const u = clamp(1 - (f.T - t) / 3.5, 0, 1);
          g.fillStyle = `rgba(20,40,20,${0.08 + 0.3 * u})`;
          g.beginPath();
          g.ellipse(x, GROUND + 4, 6 + 12 * u, 2 + 3 * u, 0, 0, Math.PI * 2);
          g.fill();
          if (f.T - t < 1.6) {
            const wrong = f.type === 'cat' ? x >= fxp : x <= fxp;
            const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
            g.strokeStyle = wrong ? `rgba(255,60,60,${0.55 + 0.4 * pulse})` : f.type === 'cat' ? 'rgba(255,120,170,0.85)' : 'rgba(70,160,240,0.85)';
            g.lineWidth = 2.2;
            g.beginPath();
            g.ellipse(x, GROUND + 4, 12 + 8 * u, 3.5 + 2 * u, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }

        // animals that made it, trotting off to their side
        for (const w of walkers) {
          const bob = Math.abs(Math.sin((clock - w.t0) * 12)) * 3;
          g.save();
          g.translate(w.x, GROUND - 22 - bob);
          if (w.dir > 0) g.scale(-1, 1);
          g.rotate(Math.sin((clock - w.t0) * 12) * 0.08);
          g.drawImage(w.look.walk.canvas, -18, -26, 36, 52);
          g.restore();
        }

        // the fence
        drawSprite(g, fenceArt, fxp, GROUND - 48, { size: 70, rot: fence.lean * 0.04 });

        // everyone still in the air, the latest to land drawn first
        for (let i = fallers.length - 1; i >= next; i--) {
          const f = fallers[i];
          if (spawnT(f) > t) continue;
          const x = xAt(f, t);
          const y = yAt(f, t);
          const sway = f.fast ? Math.sin(clock * 22 + f.ph) * 0.25 : -f.A * f.w * Math.cos(f.w * (f.T - t) + f.ph) * 0.012 + f.k * windAt(t) * 0.005;
          drawSprite(g, f.fast ? f.look.flip : f.look.float, x, y - 46, { size: 64, rot: sway });
          if (f.T - t < 1.6) {
            const wrong = f.type === 'cat' ? x >= fxp : x <= fxp;
            if (wrong) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, markGlow, x, y - 104, { size: 30, alpha: 0.5 });
              g.globalCompositeOperation = 'source-over';
              g.fillStyle = '#ff3b4a';
              g.font = 'bold 20px sans-serif';
              g.textAlign = 'center';
              g.fillText('!', x, y - 96);
            }
          }
        }

        // the one that landed on the wrong side, hissing or barking
        if (this.dead && culprit) {
          const shake = Math.sin(clock * 50) * 2.5;
          g.fillStyle = '#ffe066';
          g.beginPath();
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 + clock;
            const r = k % 2 ? 22 : 36 + Math.sin(clock * 9) * 3;
            g.lineTo(culprit.L + Math.cos(a) * r, GROUND - 74 + Math.sin(a) * r * 0.7);
          }
          g.closePath();
          g.fill();
          g.fillStyle = '#c0242f';
          g.font = 'bold 18px sans-serif';
          g.textAlign = 'center';
          g.fillText(culprit.type === 'cat' ? 'HISS!' : 'WOOF!', culprit.L, GROUND - 68);
          g.drawImage(culprit.look.mad.canvas, culprit.L - 18 + shake, GROUND - 48, 36, 52);
        }

        fx.render(g);
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
