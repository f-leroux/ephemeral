// Short Stack — the breakfast rush at a roadside diner. Batter gets ladled onto a long griddle, and
// you are the spatula sliding along under it. Every pancake has to be flipped once its first side is
// golden, then served once its second side is done; you only flip by holding still under a ready one.
// Let a single pancake burn and breakfast is over. It's plate spinning: more pancakes on the griddle at
// once, cooking faster, and from 25s small "silver dollars" that are ready (and burn) even sooner.

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

const SPOTS = [36, 93.6, 151.2, 208.8, 266.4, 324];
const ROW_Y = 498; // pancake centres on the griddle
const GRIDDLE_TOP = 432;
const GRIDDLE_BOTTOM = 566;
const LEAD = 0.8; // the ladle shows where batter goes this long before it pours
const CATCH = 27; // how close the spatula has to be under a pancake (just under half the gap between spots)
const DWELL = 0.1; // and for how long, to flip it
const STILL = 170; // slower than this counts as holding still
const SETTLE = 14; // once you let go near a pancake, the spatula settles in under it this fast
const FLIP_ANIM = 0.36;
const SCOOP = 0.42; // the spatula's scoop-and-flick, purely cosmetic
const PLATE = { x: 300, y: 312 };

// ---------- art ----------

function paintKitchen(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // cream subway tiles
    g.fillStyle = '#f6ead2';
    g.fillRect(0, 0, W, GRIDDLE_TOP);
    g.strokeStyle = 'rgba(170,140,100,0.22)';
    g.lineWidth = 1;
    for (let y = 0, row = 0; y < GRIDDLE_TOP; y += 14, row++) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = row % 2 ? 14 : 0; x < W; x += 28) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 14);
        g.stroke();
      }
    }
    // the stainless hood across the top
    const hood = g.createLinearGradient(0, 0, 0, 78);
    hood.addColorStop(0, '#8d96a0');
    hood.addColorStop(0.55, '#d9dee3');
    hood.addColorStop(1, '#a4acb5');
    g.fillStyle = hood;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, 62);
    g.lineTo(W - 14, 78);
    g.lineTo(14, 78);
    g.lineTo(0, 62);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1;
    for (let x = 6; x < W; x += 5) {
      g.beginPath();
      g.moveTo(x, 4);
      g.lineTo(x + 1, 58);
      g.globalAlpha = 0.08 + rng.range(0, 0.12);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#6e7780';
    for (let x = 20; x < W; x += 40) {
      g.beginPath();
      g.arc(x, 70, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,30,20,0.18)';
    g.fillRect(14, 78, W - 28, 6);

    // the order rail with tickets
    g.fillStyle = '#c3c9cf';
    g.fillRect(16, 104, W - 32, 7);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(16, 104, W - 32, 2);
    for (let i = 0; i < 6; i++) {
      const tx = 28 + i * 54 + rng.range(-6, 6);
      const tw = 40;
      const th = rng.range(30, 40);
      g.save();
      g.translate(tx + tw / 2, 108);
      g.rotate(rng.range(-0.06, 0.06));
      g.fillStyle = 'rgba(60,40,20,0.15)';
      g.fillRect(-tw / 2 + 2, 2, tw, th);
      g.fillStyle = i % 3 === 1 ? '#fff6c9' : '#fffdf6';
      g.fillRect(-tw / 2, 0, tw, th);
      g.fillStyle = '#d7263d';
      g.fillRect(-tw / 2, 0, tw, 5);
      g.strokeStyle = 'rgba(40,40,80,0.55)';
      g.lineWidth = 1;
      for (let y = 11; y < th - 4; y += 6) {
        g.beginPath();
        g.moveTo(-tw / 2 + 5, y);
        g.lineTo(-tw / 2 + 5 + rng.range(12, 30), y + rng.range(-1, 1));
        g.stroke();
      }
      g.restore();
    }

    // the pass-through window into the dining room
    const wx = 18;
    const wy = 158;
    const ww = W - 36;
    const wh = 140;
    const room = g.createLinearGradient(0, wy, 0, wy + wh);
    room.addColorStop(0, '#2f6f73');
    room.addColorStop(1, '#245457');
    g.fillStyle = room;
    g.fillRect(wx, wy, ww, wh);
    // big windows with the morning outside
    for (let i = 0; i < 3; i++) {
      const x = wx + 14 + i * 108;
      const sky = g.createLinearGradient(0, wy + 12, 0, wy + 82);
      sky.addColorStop(0, '#9fd3f0');
      sky.addColorStop(0.7, '#ffd9a8');
      sky.addColorStop(1, '#ffc180');
      g.fillStyle = sky;
      g.fillRect(x, wy + 12, 86, 70);
      // a road sign and a far mesa
      g.fillStyle = 'rgba(190,110,90,0.6)';
      g.beginPath();
      g.moveTo(x, wy + 82);
      g.lineTo(x + 10, wy + 66);
      g.lineTo(x + 40, wy + 64);
      g.lineTo(x + 48, wy + 82);
      g.closePath();
      g.fill();
      g.fillStyle = '#f2f2f2';
      g.fillRect(x, wy + 46, 86, 3);
      g.fillRect(x + 42, wy + 12, 3, 70);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.moveTo(x + 6, wy + 12);
      g.lineTo(x + 26, wy + 12);
      g.lineTo(x + 6, wy + 40);
      g.closePath();
      g.fill();
    }
    // red booths
    for (let i = 0; i < 4; i++) {
      const bx = wx + 6 + i * 82;
      const b = g.createLinearGradient(0, wy + 86, 0, wy + 130);
      b.addColorStop(0, '#ef4057');
      b.addColorStop(1, '#a3162a');
      g.fillStyle = b;
      g.beginPath();
      g.roundRect(bx, wy + 84, 30, 50, 6);
      g.fill();
      g.beginPath();
      g.roundRect(bx + 44, wy + 84, 30, 50, 6);
      g.fill();
      g.fillStyle = '#e9edf0';
      g.fillRect(bx + 26, wy + 106, 22, 5);
      g.fillStyle = '#9aa3ab';
      g.fillRect(bx + 35, wy + 111, 3, 24);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(bx + 3, wy + 88, 3, 40);
      g.fillRect(bx + 47, wy + 88, 3, 40);
    }
    // window frame, chrome
    g.strokeStyle = '#b9c0c7';
    g.lineWidth = 6;
    g.strokeRect(wx, wy, ww, wh);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1.5;
    g.strokeRect(wx - 2, wy - 2, ww + 4, wh + 4);

    // the pass shelf and its heat lamps
    const shelf = g.createLinearGradient(0, 298, 0, 324);
    shelf.addColorStop(0, '#eef1f4');
    shelf.addColorStop(0.4, '#b5bcc4');
    shelf.addColorStop(1, '#7c858e');
    g.fillStyle = shelf;
    g.fillRect(6, 298, W - 12, 24);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(6, 322, W - 12, 6);

    // black and white checks under the shelf
    for (let y = 334, r = 0; y < GRIDDLE_TOP - 6; y += 12, r++) {
      for (let x = 0, c = r % 2; x < W; x += 12, c++) {
        g.fillStyle = c % 2 ? '#1d1b1f' : '#f4efe6';
        g.fillRect(x, y, 12, 12);
      }
    }
    g.fillStyle = '#d7263d';
    g.fillRect(0, 328, W, 6);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 328, W, 1.5);

    // the griddle: a backsplash lip, a dark seasoned plate, and a chrome front with knobs
    const lip = g.createLinearGradient(0, GRIDDLE_TOP - 12, 0, GRIDDLE_TOP);
    lip.addColorStop(0, '#dfe4e9');
    lip.addColorStop(1, '#7e8790');
    g.fillStyle = lip;
    g.fillRect(0, GRIDDLE_TOP - 12, W, 12);
    const plate = g.createLinearGradient(0, GRIDDLE_TOP, 0, GRIDDLE_BOTTOM);
    plate.addColorStop(0, '#1b1c20');
    plate.addColorStop(0.5, '#2e3036');
    plate.addColorStop(1, '#202126');
    g.fillStyle = plate;
    g.fillRect(0, GRIDDLE_TOP, W, GRIDDLE_BOTTOM - GRIDDLE_TOP);
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, W);
      const y = rng.range(GRIDDLE_TOP, GRIDDLE_BOTTOM);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)';
      g.lineWidth = rng.range(0.6, 1.6);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(14, 50), y + rng.range(-1, 1));
      g.stroke();
    }
    // seasoned patches where pancakes always go
    for (const sx of SPOTS) {
      const c = g.createRadialGradient(sx, ROW_Y, 4, sx, ROW_Y, 34);
      c.addColorStop(0, 'rgba(70,45,25,0.35)');
      c.addColorStop(1, 'rgba(70,45,25,0)');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(sx, ROW_Y, 34, 22, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the sheen of oil
    const sheen = g.createLinearGradient(0, GRIDDLE_TOP, W, GRIDDLE_BOTTOM);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.45, 'rgba(255,240,210,0.07)');
    sheen.addColorStop(0.55, 'rgba(255,240,210,0)');
    g.fillStyle = sheen;
    g.fillRect(0, GRIDDLE_TOP, W, GRIDDLE_BOTTOM - GRIDDLE_TOP);
    // front: grease trough and chrome panel
    g.fillStyle = '#0f0f12';
    g.fillRect(0, GRIDDLE_BOTTOM, W, 8);
    const front = g.createLinearGradient(0, GRIDDLE_BOTTOM + 8, 0, H);
    front.addColorStop(0, '#e6eaee');
    front.addColorStop(0.25, '#aeb6be');
    front.addColorStop(1, '#6d757e');
    g.fillStyle = front;
    g.fillRect(0, GRIDDLE_BOTTOM + 8, W, H - GRIDDLE_BOTTOM - 8);
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    for (let x = 3; x < W; x += 4) {
      g.globalAlpha = rng.range(0.1, 0.4);
      g.beginPath();
      g.moveTo(x, GRIDDLE_BOTTOM + 10);
      g.lineTo(x, H);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (const kx of [40, 120, 240, 320]) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.arc(kx + 1, 612, 13, 0, Math.PI * 2);
      g.fill();
      const k = g.createRadialGradient(kx - 4, 606, 1, kx, 610, 13);
      k.addColorStop(0, '#5a5a62');
      k.addColorStop(1, '#141418');
      g.fillStyle = k;
      g.beginPath();
      g.arc(kx, 610, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d7263d';
      g.fillRect(kx - 1.5, 599, 3, 8);
    }
  }, 1.5);
}

function paintSign() {
  return makeSprite(150, 36, (g) => {
    g.fillStyle = 'rgba(20,10,20,0.55)';
    g.beginPath();
    g.roundRect(-72, -16, 144, 32, 8);
    g.fill();
    g.font = 'bold 20px "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,90,140,0.6)';
    g.strokeText('PANCAKES', 0, 1);
    g.fillStyle = '#ffe3ef';
    g.fillText('PANCAKES', 0, 1);
  });
}

// A pancake from slightly above. kind: raw (pale batter), bubbles (holes popping in the batter),
// golden (the cooked side up), edge (a dark ring for an underside about to burn), burnt.
function paintPancake(kind) {
  return makeSprite(64, 44, (g) => {
    const rx = 27;
    const ry = 16.5;
    if (kind === 'raw' || kind === 'golden' || kind === 'burnt') {
      // the side, a little thickness
      g.fillStyle = kind === 'raw' ? '#d8b878' : kind === 'golden' ? '#c9893c' : '#1d130c';
      g.beginPath();
      g.ellipse(0, 3, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (kind === 'raw') {
      const c = g.createRadialGradient(-6, -5, 2, 0, 0, rx);
      c.addColorStop(0, '#fff6dc');
      c.addColorStop(0.7, '#f6e2b4');
      c.addColorStop(1, '#ead097');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.ellipse(-8, -6, 9, 3.5, -0.2, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'bubbles') {
      // matte set edges and little open bubbles: the classic sign it's ready to flip
      const c = g.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx);
      c.addColorStop(0, 'rgba(235,205,150,0)');
      c.addColorStop(1, 'rgba(214,170,100,0.85)');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      const holes = [[-14, -2], [-6, 6], [3, -7], [10, 3], [16, -4], [-2, -1], [6, 9], [-12, -9], [13, -10], [-18, 5], [20, 4]];
      for (const [x, y] of holes) {
        const r = 1.4 + ((x * 7 + y * 3) & 3) * 0.35;
        g.fillStyle = 'rgba(190,140,70,0.9)';
        g.beginPath();
        g.ellipse(x, y, r + 0.8, (r + 0.8) * 0.65, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(120,80,35,0.9)';
        g.beginPath();
        g.ellipse(x, y + 0.3, r, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'golden') {
      const c = g.createRadialGradient(-4, -4, 2, 0, 0, rx);
      c.addColorStop(0, '#f2b85d');
      c.addColorStop(0.55, '#d9913d');
      c.addColorStop(0.85, '#e7b066');
      c.addColorStop(1, '#f3d28f');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      // lacy browning
      g.fillStyle = 'rgba(150,80,25,0.28)';
      for (let i = 0; i < 30; i++) {
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const a = (h - Math.floor(h)) * Math.PI * 2;
        const h2 = Math.sin(i * 78.233) * 12345.678;
        const d = Math.sqrt(h2 - Math.floor(h2)) * 0.72;
        g.beginPath();
        g.ellipse(Math.cos(a) * rx * d, Math.sin(a) * ry * d, 2.4, 1.5, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,240,200,0.35)';
      g.beginPath();
      g.ellipse(-7, -6, 10, 3.5, -0.2, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'edge') {
      const c = g.createRadialGradient(0, 0, rx * 0.45, 0, 0, rx);
      c.addColorStop(0, 'rgba(60,30,10,0)');
      c.addColorStop(0.75, 'rgba(70,35,12,0.55)');
      c.addColorStop(1, 'rgba(25,12,5,0.95)');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'burnt') {
      const c = g.createRadialGradient(-4, -4, 2, 0, 0, rx);
      c.addColorStop(0, '#4a2b16');
      c.addColorStop(0.6, '#26160c');
      c.addColorStop(1, '#0d0806');
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,120,40,0.35)';
      for (const [x, y] of [[-10, 2], [8, -5], [14, 6], [-2, -8]]) {
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

// The player: a slotted steel turner on a wooden handle, seen from above.
function paintSpatula() {
  return makeSprite(64, 150, (g) => {
    g.translate(0, -40);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.moveTo(-25, -12);
    g.lineTo(27, -12);
    g.lineTo(21, 28);
    g.lineTo(-19, 28);
    g.closePath();
    g.fill();
    // blade
    const b = g.createLinearGradient(-26, 0, 26, 0);
    b.addColorStop(0, '#8e98a2');
    b.addColorStop(0.3, '#f4f7fa');
    b.addColorStop(0.55, '#c3cbd3');
    b.addColorStop(1, '#7a848e');
    g.fillStyle = b;
    g.beginPath();
    g.moveTo(-26, -16);
    g.lineTo(26, -16);
    g.lineTo(20, 24);
    g.quadraticCurveTo(0, 30, -20, 24);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,66,74,0.7)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(-26, -16, 52, 2);
    // slots
    g.fillStyle = '#3b4048';
    for (const x of [-12, -4, 4, 12]) {
      g.beginPath();
      g.roundRect(x - 1.8, -8, 3.6, 22, 1.8);
      g.fill();
    }
    // neck and rivets
    g.fillStyle = '#9aa3ac';
    g.beginPath();
    g.moveTo(-6, 25);
    g.lineTo(6, 25);
    g.lineTo(4, 50);
    g.lineTo(-4, 50);
    g.closePath();
    g.fill();
    // handle
    const h = g.createLinearGradient(-8, 0, 8, 0);
    h.addColorStop(0, '#5e2f17');
    h.addColorStop(0.4, '#b0663a');
    h.addColorStop(1, '#4a2410');
    g.fillStyle = h;
    g.beginPath();
    g.roundRect(-8, 48, 16, 62, 6);
    g.fill();
    g.fillStyle = '#e7e2d8';
    for (const y of [58, 98]) {
      g.beginPath();
      g.arc(0, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(40,18,8,0.4)';
    g.lineWidth = 0.8;
    for (const x of [-4, 3]) {
      g.beginPath();
      g.moveTo(x, 52);
      g.lineTo(x + 0.5, 106);
      g.stroke();
    }
  });
}

function paintLadle() {
  return makeSprite(120, 90, (g) => {
    // long handle up and to the left, a deep bowl of batter at the bottom right
    g.strokeStyle = '#aab2ba';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-56, -42);
    g.quadraticCurveTo(-10, -30, 26, 12);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-54, -43);
    g.quadraticCurveTo(-10, -32, 25, 10);
    g.stroke();
    const b = g.createRadialGradient(28, 18, 2, 34, 24, 22);
    b.addColorStop(0, '#f2f5f8');
    b.addColorStop(1, '#78828c');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(36, 24, 20, 14, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#f7e6bd';
    g.beginPath();
    g.ellipse(36, 24, 20, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.ellipse(30, 22.5, 7, 2, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintPlate() {
  return makeSprite(80, 30, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(0, 6, 36, 9, 0, 0, Math.PI * 2);
    g.fill();
    const p = g.createRadialGradient(-6, -2, 2, 0, 2, 36);
    p.addColorStop(0, '#ffffff');
    p.addColorStop(0.8, '#e9eef2');
    p.addColorStop(1, '#b9c3cb');
    g.fillStyle = p;
    g.beginPath();
    g.ellipse(0, 2, 36, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d7263d';
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(0, 2, 31, 8, 0, 0, Math.PI * 2);
    g.stroke();
  });
}

// ---------- game ----------

export default {
  id: 'pancakes',
  title: 'Short Stack',
  emoji: '🥞',
  tagline: 'Hold the spatula still under a pancake once its ring turns gold to flip it, then again to serve it. Let a single one burn and breakfast is over.',
  colors: { bg: '#f6ead2', fg: '#3a1f12', accent: '#d7263d' },

  // Jukebox rock 'n' roll: a 12-bar boogie-woogie in A at 144 BPM, three choruses of 20 seconds.
  // A shuffled walking sawtooth bass, kick, backbeat snare and piano comping from the first bar, with
  // hi-hats joining halfway through the first chorus; the second chorus brings handclaps and a raspy
  // sawtooth "sax" tune; the third goes four-on-the-floor with a tambourine, a harmony sax a third
  // below and rolling piano triplets. 36 bars = 60s.
  music: {
    cps: 36 / 60,
    setup: `
      const roots = "<45 45 45 45 38 38 45 45 40 38 45 40>"
      const kick = note("a2 ~ a2 ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick4 = note("a2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ white ~ white").decay(0.13).sustain(0).hpf(1200).lpf(6000).gain(0.18)
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1500).lpf(5000).gain(0.14).room(0.25).roomsize(2)
      const hats = s("[white ~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.05)
        .mask("<0 0 0 0 0 0 1 1 1 1 1 1>")
      const tamb = s("[white white white]*4").decay(0.025).sustain(0).hpf(6500).gain("[0.045 0.02 0.03]*4")
      const bass = note("[0 ~ 4] [7 ~ 9] [10 ~ 9] [7 ~ 4]".add(roots))
        .s("sawtooth").decay(0.15).sustain(0.4).release(0.05).lpf(saw.range(650, 1400).slow(36)).gain(0.34)
      const chords = "<[a3,cs4,e4,g4] [a3,cs4,e4,g4] [a3,cs4,e4,g4] [a3,cs4,e4,g4] [a3,c4,d4,fs4] [a3,c4,d4,fs4] [a3,cs4,e4,g4] [a3,cs4,e4,g4] [b3,d4,e4,gs4] [a3,c4,d4,fs4] [a3,cs4,e4,g4] [b3,d4,e4,gs4]>"
      const comp = note(chords).struct("[~ ~ x]*4").s("triangle").decay(0.12).sustain(0.15)
        .lpf(saw.range(1600, 2800).slow(36)).gain(0.09).pan(0.6)
      const rolls = note(chords).struct("[x x x]*4").s("square").decay(0.06).sustain(0).lpf(2000).gain(0.045).pan(0.35)
      const sax = note("<[[a4 ~ c5] [cs5 ~ e5] [~ ~ e5] [cs5 ~ a4]] [[e5 ~ ~] [g5 ~ e5] [fs5 ~ e5] [c5 ~ cs5]] [[a4 ~ c5] [cs5 ~ e5] [~ ~ e5] [cs5 ~ a4]] [[a5 ~ g5] [e5 ~ cs5] [e5 ~ ~] ~] [[d5 ~ fs5] [a5 ~ fs5] [c5 ~ a4] [fs4 ~ a4]] [[a5 ~ ~] [fs5 ~ a5] [c5 ~ d5] ~] [[a4 ~ c5] [cs5 ~ e5] [~ ~ e5] [cs5 ~ a4]] [[e5 ~ cs5] [a4 ~ c5] [cs5 ~ ~] ~] [[b4 ~ d5] [e5 ~ gs5] [b5 ~ gs5] [e5 ~ d5]] [[a4 ~ d5] [fs5 ~ a5] [fs5 ~ d5] [c5 ~ a4]] [[cs5 ~ e5] [a5 ~ e5] [cs5 ~ a4] [c5 ~ cs5]] [[e5 ~ ~] [gs4 ~ b4] [d5 ~ e5] ~]>")
        .s("sawtooth").attack(0.01).decay(0.18).sustain(0.5).release(0.08).lpf(1900).gain(0.075).pan(0.5)
        .delay(0.12).delaytime(0.278).delayfeedback(0.2)
      const sax2 = note("<[[e4 ~ a4] [a4 ~ cs5] [~ ~ cs5] [a4 ~ e4]] [[cs5 ~ ~] [e5 ~ cs5] [d5 ~ cs5] [a4 ~ a4]] [[e4 ~ a4] [a4 ~ cs5] [~ ~ cs5] [a4 ~ e4]] [[e5 ~ e5] [cs5 ~ a4] [cs5 ~ ~] ~] [[a4 ~ d5] [fs5 ~ d5] [a4 ~ fs4] [d4 ~ fs4]] [[fs5 ~ ~] [d5 ~ fs5] [a4 ~ a4] ~] [[e4 ~ a4] [a4 ~ cs5] [~ ~ cs5] [a4 ~ e4]] [[cs5 ~ a4] [e4 ~ a4] [a4 ~ ~] ~] [[gs4 ~ b4] [b4 ~ e5] [gs5 ~ e5] [b4 ~ b4]] [[fs4 ~ a4] [d5 ~ fs5] [d5 ~ a4] [a4 ~ fs4]] [[a4 ~ cs5] [e5 ~ cs5] [a4 ~ e4] [a4 ~ a4]] [[b4 ~ ~] [e4 ~ gs4] [b4 ~ b4] ~]>")
        .s("square").attack(0.01).decay(0.18).sustain(0.4).release(0.08).lpf(1500).gain(0.05).pan(0.35)
    `,
    song: `arrange(
      [12, stack(kick, snare, hats, bass, comp)],
      [12, stack(kick, snare, clap, hats, bass, comp, sax)],
      [12, stack(kick4, snare, clap, hats, tamb, bass, comp, rolls, sax, sax2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const kitchen = paintKitchen(W, H, art);
    const sign = paintSign();
    const signGlow = glowSprite('rgba(255,70,140,1)', 60);
    const lampGlow = glowSprite('rgba(255,170,70,1)', 60);
    const heatGlow = glowSprite('rgba(255,110,30,1)', 40);
    const goldGlow = glowSprite('rgba(255,210,90,1)', 30);
    const fireGlow = glowSprite('rgba(255,120,30,1)', 50);
    const vignette = vignetteSprite(W, H, 0.42, '50,25,10');
    const cake = {
      raw: paintPancake('raw'),
      bubbles: paintPancake('bubbles'),
      golden: paintPancake('golden'),
      edge: paintPancake('edge'),
      burnt: paintPancake('burnt'),
    };
    const spatulaArt = paintSpatula();
    const ladleArt = paintLadle();
    const plateArt = paintPlate();

    // ---- every pancake of the morning, decided up front ----
    const defs = [];
    {
      let T = 1.0;
      while (T < 64) {
        const p = progress(T, 60, 1.3);
        const small = T > 25 && plan.chance(lerp(0.15, 0.35, p));
        let cA = lerp(3.6, 2.1, p) * plan.range(0.9, 1.15);
        let wA = lerp(4.0, 1.6, p) * plan.range(0.9, 1.1);
        if (small) (cA *= 0.75), (wA *= 0.85);
        const cB = cA * plan.range(0.72, 0.9);
        const wB = wA * plan.range(0.9, 1.05);
        defs.push({ T, cA, wA, cB, wB, small, u: plan.next() });
        T += plan.range(lerp(3.0, 1.15, p), lerp(3.6, 1.45, p));
      }
    }

    const spatula = createMover({ x: W / 2 - 28.8, minX: SPOTS[0], maxX: SPOTS[5], speed: 330, accel: 24 });
    const fx = createParticles();
    const spots = SPOTS.map(() => null);
    const reserved = SPOTS.map(() => false);
    const ladles = [];
    const flyers = [];
    let nextDef = 0;
    let served = 0;
    let stackBase = 0; // pancakes on the plate that's out on the pass right now
    let plateSlide = 0;
    let lastT = 0;
    let clock = 0;
    let culprit = -1;
    let deadT = 0;
    let heat = 0;
    let scoop = null; // { t0, kind: 'flip' | 'serve' }

    const game = {
      dead: false,
      deathReason: '',
      spots,
      get spatula() {
        return spatula;
      },

      update(dt, dir, t) {
        lastT = t;
        clock += dt;
        heat = progress(t, 60, 1.3);
        spatula.update(dt, dir);
        // let go near a pancake and the spatula settles in under it instead of sliding past
        if (dir === 0) {
          let near = -1;
          for (let i = 0; i < SPOTS.length; i++) if (spots[i] && Math.abs(spatula.x - SPOTS[i]) < CATCH) near = i;
          if (near >= 0) {
            const k = Math.min(1, SETTLE * dt);
            spatula.vx *= 1 - k;
            spatula.x += (SPOTS[near] - spatula.x) * k;
          }
        }

        // the cook reaches over with the ladle, then pours (never more on the griddle than the rush allows)
        const cap = Math.round(lerp(3, 5, heat));
        while (nextDef < defs.length && defs[nextDef].T - LEAD <= t) {
          let busy = ladles.filter((l) => !l.poured).length;
          for (const s of spots) if (s) busy++;
          if (busy >= cap) break;
          const free = [];
          for (let i = 0; i < SPOTS.length; i++) if (!spots[i] && !reserved[i]) free.push(i);
          if (!free.length) break;
          const d = defs[nextDef++];
          const i = free[Math.min(free.length - 1, Math.floor(d.u * free.length))];
          reserved[i] = true;
          ladles.push({ i, t0: t, at: t + LEAD, d, poured: false });
        }
        for (let k = ladles.length - 1; k >= 0; k--) {
          const l = ladles[k];
          if (!l.poured && t >= l.at) {
            l.poured = true;
            reserved[l.i] = false;
            const d = l.d;
            spots[l.i] = { d, side: 1, start: t, readyAt: t + d.cA, burnAt: t + d.cA + d.wA, dwell: 0, flipT: -9, born: clock };
            fx.burst(SPOTS[l.i], ROW_Y, { count: 8, speed: 60, life: 0.4, size: 2.4, round: true, gravity: 200, angle: -Math.PI / 2, spread: 2.6, colors: ['#fff3d0', '#ffe2a0'] });
          }
          if (l.poured && t > l.at + 0.35) ladles.splice(k, 1);
        }

        // cooking, flipping and serving
        for (let i = 0; i < SPOTS.length; i++) {
          const s = spots[i];
          if (!s) continue;
          if (t >= s.burnAt) {
            this.dead = true;
            culprit = i;
            s.burnt = true;
            this.deathReason = s.side === 1 ? 'A pancake burned before you flipped it.' : 'A pancake burned before you served it.';
            fx.burst(SPOTS[i], ROW_Y - 10, { count: 40, speed: 120, life: 1.4, size: 9, round: true, gravity: -60, drag: 1.2, colors: ['#3a3533', '#57504c', '#2a2624', '#76706a'] });
            return;
          }
          const under = Math.abs(spatula.x - SPOTS[i]) < CATCH && Math.abs(spatula.vx) < STILL;
          if (t >= s.readyAt && under) {
            s.dwell += dt;
            if (s.dwell >= DWELL) {
              if (s.side === 1) {
                s.side = 2;
                s.start = t;
                s.readyAt = t + s.d.cB;
                s.burnAt = s.readyAt + s.d.wB;
                s.dwell = 0;
                s.flipT = clock;
                scoop = { t0: clock, kind: 'flip' };
                fx.burst(SPOTS[i], ROW_Y + 4, { count: 12, speed: 110, life: 0.45, size: 2.6, round: true, gravity: 320, angle: -Math.PI / 2, spread: 2.8, colors: ['#ffe066', '#fff2b0', '#ffd27a'] });
              } else {
                spots[i] = null;
                flyers.push({ x0: SPOTS[i], t0: clock, small: s.d.small });
                scoop = { t0: clock, kind: 'serve' };
                fx.burst(SPOTS[i], ROW_Y, { count: 10, speed: 90, life: 0.4, size: 2.4, round: true, gravity: 260, angle: -Math.PI / 2, spread: 2.4, colors: ['#ffe066', '#ffffff'] });
              }
            }
          } else {
            s.dwell = 0;
          }
          // steam, and smoke when it's close to burning
          const left = (s.burnAt - t) / (s.burnAt - s.readyAt);
          if (Math.random() < dt * 5) fx.burst(SPOTS[i] + (Math.random() - 0.5) * 30, ROW_Y - 6, { count: 1, speed: 20, life: 1.0, size: 6, round: true, gravity: -40, angle: -Math.PI / 2, spread: 0.8, colors: ['rgba(255,255,255,0.35)'] });
          if (t >= s.readyAt && left < 0.4 && Math.random() < dt * 14) fx.burst(SPOTS[i] + (Math.random() - 0.5) * 24, ROW_Y - 8, { count: 1, speed: 30, life: 1.0, size: 8, round: true, gravity: -60, angle: -Math.PI / 2, spread: 0.7, colors: ['rgba(90,80,75,0.55)', 'rgba(60,55,50,0.5)'] });
        }

        for (let k = flyers.length - 1; k >= 0; k--) {
          const f = flyers[k];
          if (clock - f.t0 >= 0.55) {
            flyers.splice(k, 1);
            served++;
            stackBase++;
            if (stackBase >= 7) {
              stackBase = 0;
              plateSlide = 1;
            }
          }
        }
        plateSlide = Math.max(0, plateSlide - dt * 2.5);
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        if (culprit >= 0 && Math.random() < 0.6) fx.burst(SPOTS[culprit] + (Math.random() - 0.5) * 30, ROW_Y - 10, { count: 2, speed: 50, life: 1.6, size: 12, round: true, gravity: -80, drag: 0.6, colors: ['rgba(60,55,52,0.7)', 'rgba(90,84,80,0.6)', 'rgba(40,36,34,0.7)'] });
        fx.update(dt);
      },

      render(g) {
        const t = lastT;
        drawSprite(g, kitchen, W / 2, H / 2);

        // neon sign in the dining room and the heat lamps over the pass
        const flick = 0.85 + 0.15 * Math.sin(clock * 23) * Math.sin(clock * 7.3);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, signGlow, W / 2, 196, { size: 220, alpha: 0.32 * flick });
        for (const lx of [90, 270]) drawSprite(g, lampGlow, lx, 300, { size: 150, alpha: 0.32 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, sign, W / 2, 196, { size: 150, alpha: 0.9 + 0.1 * flick });
        for (const lx of [90, 270]) {
          g.fillStyle = '#3a3d42';
          g.fillRect(lx - 1, 142, 2, 140);
          g.fillStyle = '#c62a3c';
          g.beginPath();
          g.moveTo(lx - 18, 290);
          g.lineTo(lx - 8, 278);
          g.lineTo(lx + 8, 278);
          g.lineTo(lx + 18, 290);
          g.closePath();
          g.fill();
          g.fillStyle = '#ffcf7a';
          g.fillRect(lx - 14, 289, 28, 3);
        }

        // the plate on the pass, stacking up
        const slide = plateSlide;
        if (slide > 0) {
          // the full plate being whisked away, a fresh one arriving
          const ox = PLATE.x + (1 - slide) * 120;
          drawSprite(g, plateArt, ox, PLATE.y, { size: 80 });
          for (let k = 0; k < 7; k++) drawSprite(g, cake.golden, ox, PLATE.y - 4 - k * 5, { size: 52 });
        }
        const px = PLATE.x - slide * 140;
        drawSprite(g, plateArt, px, PLATE.y, { size: 80, alpha: 1 - slide * 0.5 });
        for (let k = 0; k < stackBase; k++) drawSprite(g, cake.golden, px, PLATE.y - 4 - k * 5, { size: 52 });
        if (stackBase > 0) {
          // a pat of butter on top
          const ty = PLATE.y - 4 - (stackBase - 1) * 5 - 3;
          g.fillStyle = '#fff1a8';
          g.fillRect(px - 5, ty - 4, 10, 6);
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.fillRect(px - 5, ty - 4, 10, 1.5);
        }
        // tally on the ticket
        g.fillStyle = '#fffdf6';
        g.fillRect(16, 302, 64, 18);
        g.fillStyle = '#3a1f12';
        g.font = 'bold 12px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`SERVED ${served}`, 48, 311.5);
        g.textBaseline = 'alphabetic';

        // the burners under the griddle, hotter as the rush builds
        g.globalCompositeOperation = 'lighter';
        for (const sx of SPOTS) drawSprite(g, heatGlow, sx, ROW_Y + 4, { size: 74, alpha: 0.07 + 0.12 * heat + 0.03 * Math.sin(clock * 3 + sx) });
        g.globalCompositeOperation = 'source-over';

        // where the next batter goes
        for (const l of ladles) {
          if (l.poured) continue;
          const u = clamp((t - l.t0) / LEAD, 0, 1);
          g.strokeStyle = `rgba(255,236,190,${0.35 + 0.4 * u})`;
          g.lineWidth = 2;
          g.setLineDash([5, 5]);
          g.lineDashOffset = -clock * 20;
          const r = l.d.small ? 0.72 : 1;
          g.beginPath();
          g.ellipse(SPOTS[l.i], ROW_Y, 27 * r, 16.5 * r, 0, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }

        // the pancakes (the ones mid-flip are drawn after the spatula, since they're up in the air off it)
        const airborne = [];
        for (let i = 0; i < SPOTS.length; i++) {
          const s = spots[i];
          if (!s) continue;
          const x = SPOTS[i];
          const size = (s.d.small ? 0.72 : 1) * 64;
          const ready = t >= s.readyAt;
          const toReady = clamp((t - s.start) / Math.max(0.01, s.readyAt - s.start), 0, 1);
          const left = clamp((s.burnAt - t) / (s.burnAt - s.readyAt), 0, 1);
          const grow = clamp((clock - s.born) / 0.3, 0, 1);
          const fu = (clock - s.flipT) / FLIP_ANIM;
          if (s.burnt) {
            drawSprite(g, cake.burnt, x, ROW_Y, { size });
            continue;
          }
          if (fu >= 0 && fu < 1) {
            airborne.push({ x, size, fu });
            continue;
          }
          const sz = size * (0.4 + 0.6 * grow);
          if (s.side === 1) {
            drawSprite(g, cake.raw, x, ROW_Y, { size: sz });
            if (toReady > 0.35) drawSprite(g, cake.bubbles, x, ROW_Y, { size: sz, alpha: clamp((toReady - 0.35) / 0.65, 0, 1) });
          } else {
            drawSprite(g, cake.golden, x, ROW_Y, { size: sz });
          }
          if (ready && left < 0.6) drawSprite(g, cake.edge, x, ROW_Y, { size: sz, alpha: clamp((0.6 - left) / 0.6, 0, 1) });

          // the ring: filling while it cooks, gold and draining once it's ready
          const rx = size * 0.5;
          const ry = size * 0.31;
          g.lineCap = 'round';
          if (!ready) {
            g.strokeStyle = 'rgba(255,255,255,0.18)';
            g.lineWidth = 2.5;
            g.beginPath();
            g.ellipse(x, ROW_Y + 1, rx, ry, 0, 0, Math.PI * 2);
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.75)';
            g.beginPath();
            g.ellipse(x, ROW_Y + 1, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * toReady);
            g.stroke();
          } else {
            const pulse = 0.5 + 0.5 * Math.sin(clock * (left < 0.4 ? 20 : 9));
            const r = Math.round(lerp(255, 255, left));
            const gg = Math.round(lerp(50, 205, left));
            const b = Math.round(lerp(40, 70, left));
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, goldGlow, x, ROW_Y, { size: size * 1.5, alpha: 0.18 + 0.14 * pulse });
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = `rgb(${r},${gg},${b})`;
            g.lineWidth = 4;
            g.beginPath();
            g.ellipse(x, ROW_Y + 1, rx + 3, ry + 3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
            g.stroke();
            // a little "flip me" chevron above it
            const cy = ROW_Y - ry - 14 - pulse * 4;
            g.fillStyle = `rgb(${r},${gg},${b})`;
            g.beginPath();
            g.moveTo(x - 8, cy + 5);
            g.lineTo(x, cy - 4);
            g.lineTo(x + 8, cy + 5);
            g.lineTo(x + 4, cy + 5);
            g.lineTo(x, cy + 1);
            g.lineTo(x - 4, cy + 5);
            g.closePath();
            g.fill();
            if (s.dwell > 0) {
              g.strokeStyle = '#ffffff';
              g.lineWidth = 2;
              g.beginPath();
              g.ellipse(x, ROW_Y + 1, rx + 7, ry + 7, 0, 0, Math.PI * 2 * (s.dwell / DWELL));
              g.stroke();
            }
          }
        }

        // the spatula: at rest it slides along the front of the griddle; on a flip or a serve it jabs
        // in under the pancake, flicks its blade up (squashed, as it tilts away from us) and settles back
        const sx = spatula.x;
        g.fillStyle = 'rgba(255,240,200,0.08)';
        g.fillRect(sx - CATCH, GRIDDLE_TOP, CATCH * 2, GRIDDLE_BOTTOM - GRIDDLE_TOP);
        const fk = scoop ? (clock - scoop.t0) / SCOOP : 1;
        if (fk >= 0 && fk < 1) {
          const serve = scoop.kind === 'serve';
          const jab = fk < 0.18 ? Math.sin((fk / 0.18) * Math.PI * 0.5) : 1 - Math.pow((fk - 0.18) / 0.82, 2);
          const tilt = fk < 0.12 ? 0 : Math.sin(clamp((fk - 0.12) / 0.6, 0, 1) * Math.PI);
          const wrist = serve ? 0.55 * tilt : -0.32 * Math.sin(clamp((fk - 0.12) / 0.6, 0, 1) * Math.PI * 2);
          const pivotY = 622; // the hand, down on the handle
          g.save();
          g.translate(sx + (serve ? tilt * 8 : 0), pivotY - jab * 30);
          g.rotate(spatula.lean * 0.05 + wrist);
          g.scale(1 + tilt * 0.08, 1 - tilt * 0.45);
          drawSprite(g, spatulaArt, 0, 572 - pivotY, { size: 64 });
          g.restore();
          // a swoosh off the blade's edge
          if (tilt > 0.15) {
            const by = 516 - jab * 30 + tilt * 22;
            g.globalCompositeOperation = 'lighter';
            g.strokeStyle = `rgba(255,244,214,${0.5 * tilt})`;
            g.lineWidth = 3;
            g.lineCap = 'round';
            g.beginPath();
            if (serve) g.arc(sx + 30, by, 34, Math.PI * 1.05, Math.PI * 1.45);
            else g.arc(sx, by + 6, 30, Math.PI * 1.15, Math.PI * 1.85);
            g.stroke();
            g.globalCompositeOperation = 'source-over';
          }
        } else {
          drawSprite(g, spatulaArt, sx, 572, { size: 64, rot: spatula.lean * 0.05 });
        }

        // pancakes mid-flip: up off the blade, over, and back down golden side up
        for (const a of airborne) {
          g.save();
          g.translate(a.x, ROW_Y - Math.sin(Math.PI * a.fu) * 46);
          g.scale(1, Math.max(0.06, Math.abs(Math.cos(Math.PI * a.fu))));
          g.rotate((a.fu - 0.5) * 0.4);
          const sp = a.fu < 0.5 ? cake.raw : cake.golden;
          g.drawImage(sp.canvas, -a.size / 2, -(a.size * 44) / 64 / 2, a.size, (a.size * 44) / 64);
          g.restore();
        }

        // ladles reaching in from the cook's side
        for (const l of ladles) {
          const u = clamp((t - l.t0) / LEAD, 0, 1);
          const e = 1 - Math.pow(1 - u, 3);
          const lx = SPOTS[l.i] - 36;
          const ly = lerp(330, 460, e) - (l.poured ? (t - l.at) * 160 : 0);
          const tilt = l.poured ? 0.7 : u > 0.85 ? (u - 0.85) * 4 : 0;
          drawSprite(g, ladleArt, lx, ly - 24, { size: 120, rot: tilt, alpha: l.poured ? clamp(1 - (t - l.at) / 0.35, 0, 1) : 1 });
          if (u > 0.85 && !l.poured) {
            g.strokeStyle = '#f7e6bd';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(SPOTS[l.i] + 2, ly - 4);
            g.lineTo(SPOTS[l.i], ROW_Y);
            g.stroke();
          }
        }

        // pancakes on their way to the plate
        for (const f of flyers) {
          const u = clamp((clock - f.t0) / 0.55, 0, 1);
          const x = lerp(f.x0, PLATE.x, u);
          const y = lerp(ROW_Y, PLATE.y - 4 - stackBase * 5, u) - Math.sin(Math.PI * u) * 110;
          drawSprite(g, cake.golden, x, y, { size: lerp(f.small ? 46 : 64, 52, u), rot: u * Math.PI * 2 });
        }

        fx.render(g);

        // the burnt one, smoking and flaring
        if (this.dead && culprit >= 0) {
          const x = SPOTS[culprit];
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, fireGlow, x, ROW_Y - 6, { size: 110 + Math.sin(clock * 17) * 12, alpha: 0.55 + 0.25 * Math.sin(clock * 29) });
          g.globalCompositeOperation = 'source-over';
          const blink = Math.sin(clock * 12) > 0;
          g.strokeStyle = blink ? '#ff3b30' : 'rgba(255,59,48,0.4)';
          g.lineWidth = 3;
          g.beginPath();
          g.ellipse(x, ROW_Y + 1, 36, 23, 0, 0, Math.PI * 2);
          g.stroke();
          // the smoke alarm on the hood
          g.fillStyle = blink ? '#ff3b30' : '#7a1d18';
          g.beginPath();
          g.arc(W - 36, 40, 6, 0, Math.PI * 2);
          g.fill();
          if (blink) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, fireGlow, W - 36, 40, { size: 70, alpha: 0.5 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
