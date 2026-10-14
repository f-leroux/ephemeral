// Timber! — a lumberjack chops a giant redwood in a misty forest. Every tap chops from that side
// of the trunk (the lumberjack hops round to it first), the chopped log flies off and the whole
// tree drops one notch. Branches stick out of the trunk: never stand on a branch's side when it
// comes down to head height. Your energy drains all the time and every chop tops it up, so you
// have to chop faster and faster. Later, hard knots take two chops, and old iron spikes grown
// into the trunk mean that log has to be chopped from the other side.

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

const CX = 180; // the trunk's centre
const TW = 96; // trunk width
const SEG = 74; // height of one log
const GROUND = 604;
const BASE = GROUND - 24; // the bottom of the lowest log, on top of the stump
const BL = 128; // how far a branch reaches out from the trunk
const JACK_X = TW / 2 + 36; // the lumberjack's distance from the trunk's centre
const SAFE = 12; // the first logs are clear, so nothing can go wrong in the first 2s
const GAIN = 0.085; // energy back per chop

const drain = (t) => lerp(0.15, 0.48, progress(t, 60, 1.2)); // energy lost per second
const cooldown = (t) => lerp(0.2, 0.11, clamp(t / 20, 0, 1)); // the fastest the axe can swing
const rowTop = (k) => BASE - (k + 1) * SEG;

const CHIPS = ['#f6dcae', '#e7b97f', '#c98a52', '#9a5a32'];

// ---------- art ----------

function fir(g, x, base, h, col, rng) {
  const tiers = 7;
  g.fillStyle = col;
  g.fillRect(x - 2, base - h * 0.2, 4, h * 0.2);
  for (let k = 0; k < tiers; k++) {
    const u = k / tiers;
    const y = base - h * 0.12 - u * h * 0.82;
    const w = (1 - u) * h * 0.24 + 4;
    g.beginPath();
    g.moveTo(x - w, y + rng.range(-2, 3));
    g.lineTo(x - w * 0.45, y - h * 0.05);
    g.lineTo(x, y - h * 0.2);
    g.lineTo(x + w * 0.45, y - h * 0.05);
    g.lineTo(x + w, y + rng.range(-2, 3));
    g.closePath();
    g.fill();
  }
}

function paintBackground(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f4efc4');
    sky.addColorStop(0.3, '#c8e0bc');
    sky.addColorStop(0.6, '#8dbfae');
    sky.addColorStop(1, '#4f8a7c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(70, 90, 4, 70, 90, 260);
    sun.addColorStop(0, 'rgba(255,250,215,0.95)');
    sun.addColorStop(0.3, 'rgba(255,240,190,0.4)');
    sun.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // ridges of firs, fading into the mist with distance
    const layers = [
      { base: 300, col: '#a9cdb9', hMin: 110, hMax: 200, n: 16 },
      { base: 390, col: '#80b1a0', hMin: 150, hMax: 260, n: 13 },
      { base: 480, col: '#5a917f', hMin: 190, hMax: 330, n: 11 },
      { base: 570, col: '#3b6e5c', hMin: 230, hMax: 400, n: 9 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const x = (i / (L.n - 1)) * (W + 40) - 20 + rng.range(-12, 12);
        fir(g, x, L.base + rng.range(-10, 14), rng.range(L.hMin, L.hMax), L.col, rng);
      }
      g.fillStyle = L.col;
      g.fillRect(0, L.base + 10, W, H - L.base);
      const mist = g.createLinearGradient(0, L.base - 70, 0, L.base + 30);
      mist.addColorStop(0, 'rgba(235,245,225,0)');
      mist.addColorStop(1, 'rgba(235,245,225,0.32)');
      g.fillStyle = mist;
      g.fillRect(0, L.base - 70, W, 100);
    }
    // the forest floor
    const floor = g.createLinearGradient(0, GROUND - 14, 0, H);
    floor.addColorStop(0, '#5e8a3e');
    floor.addColorStop(0.4, '#466e2f');
    floor.addColorStop(1, '#2b4a21');
    g.fillStyle = floor;
    g.beginPath();
    g.moveTo(0, GROUND - 6);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, GROUND - 10 + Math.sin(x * 0.07) * 3 + rng.range(-2, 2));
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fill();
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(140,190,90,0.35)' : 'rgba(25,45,20,0.3)';
      g.fillRect(rng.range(0, W), rng.range(GROUND - 6, H), rng.range(1, 3), rng.range(1, 2.5));
    }
    // grass tufts
    g.strokeStyle = 'rgba(150,200,100,0.7)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const y = GROUND - 6 + rng.range(-2, 6);
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.moveTo(x + j * 2, y);
        g.quadraticCurveTo(x + j * 2 + rng.range(-3, 3), y - 5, x + j * 2 + rng.range(-5, 5), y - rng.range(6, 11));
        g.stroke();
      }
    }
    // toadstools
    for (const [x, y, s] of [[24, GROUND + 6, 1], [42, GROUND + 14, 0.7], [326, GROUND + 10, 0.9]]) {
      g.fillStyle = '#efe4cf';
      g.fillRect(x - 2 * s, y - 9 * s, 4 * s, 9 * s);
      g.fillStyle = '#d23b2a';
      g.beginPath();
      g.ellipse(x, y - 9 * s, 8 * s, 6 * s, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = '#fff4e6';
      for (const [dx, dy] of [[-4, -2], [1, -4], [4, -1.5]]) {
        g.beginPath();
        g.arc(x + dx * s, y - 9 * s + dy * s, 1.2 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    // wood chips round the stump
    for (let i = 0; i < 70; i++) {
      const x = CX + rng.range(-120, 120);
      g.fillStyle = rng.pick(CHIPS);
      g.save();
      g.translate(x, GROUND + rng.range(-4, 14) + Math.abs(x - CX) * 0.04);
      g.rotate(rng.range(0, Math.PI));
      g.fillRect(-2.5, -1, 5, 2);
      g.restore();
    }
  }, 1.5);
}

// the furrowed redwood bark of one log; it tiles vertically, so the trunk looks continuous
function paintLog(rng) {
  return makeSprite(TW, SEG, (g) => {
    g.translate(-TW / 2, -SEG / 2);
    const bark = g.createLinearGradient(0, 0, TW, 0);
    bark.addColorStop(0, '#d98c5c');
    bark.addColorStop(0.18, '#b8673c');
    bark.addColorStop(0.6, '#8a4528');
    bark.addColorStop(1, '#4a2014');
    g.fillStyle = bark;
    g.fillRect(0, 0, TW, SEG);
    // deep furrows (periodic in y so the logs join up seamlessly)
    for (let i = 0; i < 11; i++) {
      const x0 = rng.range(4, TW - 4);
      const amp = rng.range(1, 3);
      const ph = rng.range(0, Math.PI * 2);
      g.strokeStyle = `rgba(40,14,6,${rng.range(0.35, 0.6)})`;
      g.lineWidth = rng.range(1.5, 3.5);
      g.beginPath();
      for (let y = 0; y <= SEG; y += 4) {
        const x = x0 + amp * Math.sin((y / SEG) * Math.PI * 2 + ph);
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.strokeStyle = 'rgba(255,200,160,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 0; y <= SEG; y += 4) {
        const x = x0 + 2.5 + amp * Math.sin((y / SEG) * Math.PI * 2 + ph);
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // bark plates and a dusting of moss on the shady side
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(60,20,10,0.25)';
      g.beginPath();
      g.ellipse(rng.range(8, TW - 8), rng.range(10, SEG - 10), rng.range(2, 4), rng.range(6, 12), 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${rng.chance(0.5) ? '110,150,60' : '80,120,45'},${rng.range(0.3, 0.6)})`;
      g.beginPath();
      g.arc(TW - rng.range(2, 18), rng.range(4, SEG - 4), rng.range(1, 2.6), 0, Math.PI * 2);
      g.fill();
    }
    // a faint line where one log will be cut from the next
    g.fillStyle = 'rgba(40,12,4,0.28)';
    g.fillRect(0, 0, TW, 1.5);
    g.fillStyle = 'rgba(255,210,170,0.12)';
    g.fillRect(0, 1.5, TW, 1);
  }, 2.5);
}

// a bough reaching out to the right from the trunk's edge (mirrored for the left)
function paintBranch() {
  const h = 48;
  return makeSprite(BL + 10, h, (g) => {
    g.translate(-(BL + 10) / 2, 0);
    const wood = g.createLinearGradient(0, -9, 0, 9);
    wood.addColorStop(0, '#c07a48');
    wood.addColorStop(0.5, '#8a4a2a');
    wood.addColorStop(1, '#4e2414');
    g.fillStyle = wood;
    g.beginPath();
    g.moveTo(0, -10);
    g.quadraticCurveTo(BL * 0.5, -8, BL, -3);
    g.lineTo(BL, 2);
    g.quadraticCurveTo(BL * 0.5, 6, 0, 11);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,14,6,0.4)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(4, -5 + i * 4);
      g.lineTo(BL * 0.7, -3 + i * 2);
      g.stroke();
    }
    // fir sprigs hanging off it
    const sprig = (x, y, s) => {
      for (let k = 0; k < 3; k++) {
        const grad = g.createLinearGradient(x, y - 14 * s, x, y + 14 * s);
        grad.addColorStop(0, k === 2 ? '#7fbf62' : '#4f8f3e');
        grad.addColorStop(1, '#1f4a26');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x - 16 * s + k * 6 * s, y - 2);
        g.lineTo(x + k * 4 * s, y - 15 * s + k * 3 * s);
        g.lineTo(x + 18 * s - k * 3 * s, y + 2);
        g.lineTo(x + 2 * s, y + 13 * s - k * 2 * s);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = 'rgba(190,240,150,0.5)';
      g.lineWidth = 0.8;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 12 * s, y + k * 3 * s);
        g.stroke();
      }
    };
    sprig(BL * 0.42, -4, 0.9);
    sprig(BL * 0.68, 2, 1);
    sprig(BL * 0.92, -2, 1.1);
    // a little cut stub at the tip
    g.fillStyle = '#e9c08a';
    g.beginPath();
    g.ellipse(BL, -0.5, 1.5, 2.8, 0, 0, Math.PI * 2);
    g.fill();
  }, 2.5);
}

function paintKnot(cracked) {
  return makeSprite(54, 44, (g) => {
    const burl = g.createRadialGradient(-4, -4, 2, 0, 0, 24);
    burl.addColorStop(0, '#7a3c1e');
    burl.addColorStop(0.6, '#5a2812');
    burl.addColorStop(1, 'rgba(60,24,10,0)');
    g.fillStyle = burl;
    g.beginPath();
    g.ellipse(0, 0, 26, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(30,10,4,0.75)';
    for (let r = 4; r < 18; r += 3.5) {
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(1, 1, r * 1.2, r, 0.3, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,200,150,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(-1, -1, 15, 12, 0.3, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
    if (cracked) {
      g.strokeStyle = '#f6dcae';
      g.lineWidth = 2;
      g.lineJoin = 'round';
      for (const pts of [[[-24, -6], [-12, -2], [-6, -10], [2, -3]], [[24, 4], [12, 2], [8, 12], [0, 5]], [[-4, 16], [-1, 8], [4, 4]]]) {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    }
  }, 2.5);
}

// old iron spikes the tree grew round, sticking out of its right-hand side (mirrored for the left)
function paintSpikes() {
  return makeSprite(44, 56, (g) => {
    // the rusted plate they're nailed through
    const plate = g.createLinearGradient(-20, 0, 2, 0);
    plate.addColorStop(0, '#4a3a34');
    plate.addColorStop(1, '#7c5a48');
    g.fillStyle = plate;
    g.beginPath();
    g.moveTo(-20, -24);
    g.lineTo(-2, -26);
    g.lineTo(0, 26);
    g.lineTo(-20, 24);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(190,90,40,0.55)';
    for (const [x, y, r] of [[-14, -14, 4], [-8, 6, 5], [-15, 16, 3], [-6, -4, 2.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // red warning stripes painted by some long-gone forester
    g.fillStyle = '#d8342a';
    g.fillRect(-19, -6, 18, 4);
    g.fillRect(-19, 2, 18, 4);
    for (const y of [-16, 0, 16]) {
      const spike = g.createLinearGradient(0, y - 4, 0, y + 4);
      spike.addColorStop(0, '#d9d4cc');
      spike.addColorStop(0.5, '#8a8078');
      spike.addColorStop(1, '#3e3632');
      g.fillStyle = spike;
      g.beginPath();
      g.moveTo(-4, y - 4);
      g.lineTo(21, y);
      g.lineTo(-4, y + 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#2e2622';
      g.beginPath();
      g.arc(-6, y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(-1, y - 2, 14, 1);
    }
  }, 2.5);
}

function paintStump() {
  const w = TW + 54;
  return makeSprite(w, 40, (g) => {
    const bark = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    bark.addColorStop(0, '#c97e50');
    bark.addColorStop(0.3, '#a85b34');
    bark.addColorStop(0.7, '#7a3a22');
    bark.addColorStop(1, '#3e1a10');
    g.fillStyle = bark;
    g.beginPath();
    g.moveTo(-TW / 2, -20);
    g.lineTo(TW / 2, -20);
    g.quadraticCurveTo(TW / 2 + 4, 6, w / 2, 18);
    g.quadraticCurveTo(TW / 2 + 6, 20, TW / 2 - 6, 14);
    g.quadraticCurveTo(0, 22, -TW / 2 + 6, 14);
    g.quadraticCurveTo(-TW / 2 - 6, 20, -w / 2, 18);
    g.quadraticCurveTo(-TW / 2 - 4, 6, -TW / 2, -20);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,14,6,0.45)';
    g.lineWidth = 2;
    for (let x = -TW / 2 + 10; x < TW / 2; x += 13) {
      g.beginPath();
      g.moveTo(x, -20);
      g.quadraticCurveTo(x * 1.1, 0, x * 1.35, 16);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,60,20,0.35)';
    g.fillRect(-w / 2, 16, w, 4);
  }, 2.5);
}

// the lumberjack, facing right (towards the trunk when standing on the left)
function paintJack(swing) {
  return makeSprite(96, 96, (g) => {
    const plaid = (x, y, w, h) => {
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.fillStyle = '#c8302c';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(25,10,10,0.55)';
      for (let yy = y; yy < y + h; yy += 8) g.fillRect(x, yy, w, 3.5);
      for (let xx = x - 2; xx < x + w; xx += 8) g.fillRect(xx, y, 3.5, h);
      g.fillStyle = 'rgba(25,10,10,0.35)';
      for (let yy = y; yy < y + h; yy += 8) for (let xx = x - 2; xx < x + w; xx += 8) g.fillRect(xx, yy, 3.5, 3.5);
      g.restore();
    };
    const axe = (hx, hy, ang) => {
      g.save();
      g.translate(hx, hy);
      g.rotate(ang);
      const handle = g.createLinearGradient(0, -2, 0, 2);
      handle.addColorStop(0, '#e8bb7c');
      handle.addColorStop(1, '#9a6538');
      g.fillStyle = handle;
      g.fillRect(-6, -2, 42, 4);
      const head = g.createLinearGradient(30, -12, 42, 6);
      head.addColorStop(0, '#e9eef2');
      head.addColorStop(0.5, '#9aa6ae');
      head.addColorStop(1, '#4e5a62');
      g.fillStyle = head;
      g.beginPath();
      g.moveTo(32, -4);
      g.lineTo(44, -14);
      g.quadraticCurveTo(48, -2, 44, 8);
      g.lineTo(32, 4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(44.5, -13);
      g.quadraticCurveTo(48.5, -2, 44.5, 7);
      g.stroke();
      g.fillStyle = '#c8302c';
      g.fillRect(31, -4, 3, 8);
      g.restore();
    };
    // boots
    g.fillStyle = '#3a2416';
    g.beginPath();
    g.roundRect(-15, 37, 13, 8, 3);
    g.roundRect(1, 37, 15, 8, 3);
    g.fill();
    // jeans
    const jeans = g.createLinearGradient(-12, 0, 12, 0);
    jeans.addColorStop(0, '#5a7fb4');
    jeans.addColorStop(1, '#2e4a7a');
    g.fillStyle = jeans;
    g.beginPath();
    g.moveTo(-13, 8);
    g.lineTo(13, 8);
    g.lineTo(14, 38);
    g.lineTo(3, 38);
    g.lineTo(0, 18);
    g.lineTo(-3, 38);
    g.lineTo(-14, 38);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(-12, 20, 2, 16);
    // axe behind the body when it's raised
    if (!swing) axe(4, -12, -2.2);
    // shirt and suspenders
    plaid(-14, -20, 28, 30);
    g.fillStyle = '#4a2e1a';
    g.fillRect(-14, 7, 28, 4);
    g.fillStyle = '#d8b04a';
    g.fillRect(-2, 7, 5, 4);
    g.fillStyle = '#3d4f6e';
    g.fillRect(-9, -20, 4, 28);
    g.fillRect(5, -20, 4, 28);
    // head
    g.fillStyle = '#f2c49c';
    g.beginPath();
    g.arc(2, -30, 10, 0, Math.PI * 2);
    g.fill();
    // beard
    g.fillStyle = '#7a4424';
    g.beginPath();
    g.moveTo(-7, -30);
    g.quadraticCurveTo(-6, -14, 4, -15);
    g.quadraticCurveTo(13, -16, 12, -29);
    g.quadraticCurveTo(8, -24, 2, -25);
    g.quadraticCurveTo(-3, -25, -7, -30);
    g.fill();
    g.fillStyle = 'rgba(255,200,150,0.25)';
    g.fillRect(0, -20, 6, 1.5);
    // eye, nose
    g.fillStyle = '#2a1a12';
    g.beginPath();
    g.arc(7, -32, 1.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e6a07c';
    g.beginPath();
    g.arc(11, -28.5, 2.6, 0, Math.PI * 2);
    g.fill();
    // knit beanie with a bobble
    g.fillStyle = '#e6a63a';
    g.beginPath();
    g.moveTo(-9, -33);
    g.quadraticCurveTo(-8, -46, 3, -46);
    g.quadraticCurveTo(13, -46, 12, -34);
    g.closePath();
    g.fill();
    g.fillStyle = '#b97a1e';
    g.fillRect(-9.5, -36, 22, 4);
    g.fillStyle = 'rgba(120,70,10,0.45)';
    for (let x = -7; x < 11; x += 3) g.fillRect(x, -44, 1, 8);
    g.fillStyle = '#fff1d6';
    g.beginPath();
    g.arc(-2, -47, 4, 0, Math.PI * 2);
    g.fill();
    // arms
    g.fillStyle = '#a42724';
    if (swing) {
      g.beginPath();
      g.roundRect(4, -17, 20, 7, 3.5);
      g.fill();
      g.fillStyle = '#f2c49c';
      g.beginPath();
      g.arc(25, -13.5, 3.8, 0, Math.PI * 2);
      g.fill();
      axe(22, -13.5, 0);
    } else {
      g.save();
      g.translate(6, -16);
      g.rotate(-1.9);
      g.beginPath();
      g.roundRect(0, -3.5, 16, 7, 3.5);
      g.fill();
      g.restore();
      g.fillStyle = '#f2c49c';
      g.beginPath();
      g.arc(1, -30.5, 3.8, 0, Math.PI * 2);
      g.fill();
    }
  }, 3);
}

function paintCanopy(W) {
  return makeSprite(W, 120, (g) => {
    g.translate(-W / 2, -60);
    const shade = g.createLinearGradient(0, 0, 0, 120);
    shade.addColorStop(0, 'rgba(14,38,28,0.95)');
    shade.addColorStop(0.45, 'rgba(14,38,28,0.55)');
    shade.addColorStop(1, 'rgba(14,38,28,0)');
    g.fillStyle = shade;
    g.fillRect(0, 0, W, 120);
    // drooping fir boughs
    for (let i = 0; i < 9; i++) {
      const x = i * 45 - 10;
      const y = 6 + (i % 3) * 8;
      for (let k = 0; k < 5; k++) {
        g.fillStyle = k % 2 ? '#1f4a33' : '#2c5e3e';
        g.beginPath();
        g.moveTo(x - 30 + k * 6, y + k * 6);
        g.quadraticCurveTo(x, y + 18 + k * 7, x + 34 - k * 4, y + k * 5);
        g.quadraticCurveTo(x, y + 4 + k * 6, x - 30 + k * 6, y + k * 6);
        g.fill();
      }
    }
  }, 1.5);
}

function paintRays(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const [x0, w, a] of [[10, 40, 0.22], [80, 26, 0.16], [140, 54, 0.14], [230, 30, 0.12]]) {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `rgba(255,245,200,${a})`);
      grad.addColorStop(1, 'rgba(255,245,200,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + w, 0);
      g.lineTo(x0 + w + 210, H);
      g.lineTo(x0 + 150, H);
      g.closePath();
      g.fill();
    }
  }, 1);
}

function paintMist() {
  return makeSprite(220, 60, (g) => {
    for (let i = 0; i < 6; i++) {
      const x = -80 + i * 32;
      const grad = g.createRadialGradient(x, 0, 2, x, 0, 34);
      grad.addColorStop(0, 'rgba(240,248,235,0.5)');
      grad.addColorStop(1, 'rgba(240,248,235,0)');
      g.fillStyle = grad;
      g.fillRect(x - 40, -30, 80, 60);
    }
  }, 1);
}

function paintFerns(W) {
  return makeSprite(W, 70, (g) => {
    g.translate(-W / 2, -35);
    const frond = (x, y, len, ang, col) => {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -len * 0.15, len, 0);
      g.stroke();
      g.fillStyle = col;
      for (let u = 0.12; u < 1; u += 0.1) {
        const px = len * u;
        const py = -len * 0.15 * 4 * u * (1 - u) * 0.5;
        const l = (1 - u) * 11 + 2;
        g.beginPath();
        g.ellipse(px, py - l * 0.5, 1.8, l * 0.5, -0.3, 0, Math.PI * 2);
        g.ellipse(px, py + l * 0.5, 1.8, l * 0.5, 0.3, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    for (const [bx, flip] of [[8, 1], [W - 8, -1]]) {
      for (let i = 0; i < 6; i++) {
        const a = flip > 0 ? -1.4 + i * 0.28 : -Math.PI + 1.4 - i * 0.28;
        frond(bx, 70, 44 + (i % 3) * 8, a, i % 2 ? '#2f6a2c' : '#4c8c3a');
      }
    }
  }, 2);
}

// ---------- the game ----------

export default {
  id: 'timber',
  title: 'Timber!',
  emoji: '🪓',
  tagline: 'Tap a side to chop. Keep chopping, and never stand under a branch.',
  colors: { bg: '#2f5a4c', fg: '#fff6e0', accent: '#e8a33a' },

  // Lumberjack metal in E minor (Em – Em – C – D), 156 BPM: a rock beat with palm-muted sawtooth
  // bass and power-chord chugs from the first bar, then ride, toms and a crash every four bars,
  // then a soaring sawtooth lead with vibrato, and a finale with 16th double-kicks, a shaker and the
  // lead harmonised a fourth below. 39 bars = 60s.
  music: {
    cps: 39 / 60,
    setup: `
      const kick = note("c2 ~ c2 ~ ~ ~ c2 c2 c2 ~ c2 ~ ~ ~ c2 ~").s("sine").decay(0.16).sustain(0).gain(0.8)
      const kick16 = note("c2*16").s("sine").decay(0.09).sustain(0).gain("[0.75 0.5]*8")
      const snare = s("~ white ~ white").decay(0.15).sustain(0).hpf(1200).lpf(6000).gain(0.2).room(0.2)
      const ride = s("white*8").decay(0.05).sustain(0).hpf(7000).gain("[0.05 0.03]*4")
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.045]*4")
      const crash = s("<white ~ ~ ~>").decay(0.7).sustain(0).hpf(5000).gain(0.05)
      const toms = note("<~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a3 g3 e3 c3]>").s("sine").decay(0.12).sustain(0).gain(0.4)
      const riff = "<[e2 e2 ~ e2 e2 ~ g2 ~ e2 e2 ~ e2 a2 ~ g2 ~] [e2 e2 ~ e2 e2 ~ g2 ~ e2 e2 ~ e2 b2 ~ d3 ~] [c3 c3 ~ c3 c3 ~ e3 ~ c3 c3 ~ c3 d3 ~ e3 ~] [d3 d3 ~ d3 d3 ~ fs3 ~ d3 d3 ~ d3 e3 ~ fs3 ~]>"
      const bass = note(riff).s("sawtooth").decay(0.12).sustain(0.2).release(0.04)
        .lpf(saw.range(500, 1400).slow(39)).lpq(4).gain(0.36)
      const chug = note(riff).add(note(12)).s("sawtooth").decay(0.1).sustain(0.3).release(0.04)
        .lpf(saw.range(1100, 2200).slow(39)).gain(0.07).pan(0.35)
      const fifth = note(riff).add(note(19)).s("sawtooth").decay(0.1).sustain(0.3).release(0.04)
        .lpf(saw.range(1100, 2200).slow(39)).gain(0.05).pan(0.65)
      const tune = "<[e5 ~ g5 a5 b5 ~ a5 g5] [a5 ~ b5 d6 b5 ~ a5 ~] [g5 ~ a5 b5 e6 ~ d6 b5] [d6 c6 b5 a5 b5 ~ ~ ~]>"
      const lead = note(tune).s("sawtooth").decay(0.4).sustain(0.4).release(0.1).lpf(2400)
        .vib(5).vibmod(0.2).gain(0.085).room(0.3).delay(0.2).delaytime(0.23).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-5)).s("square").decay(0.3).sustain(0.3).release(0.08)
        .lpf(1800).gain(0.045).pan(0.4)
    `,
    song: `arrange(
      [8, stack(kick, snare, bass, chug)],
      [10, stack(kick, snare, ride, crash, toms, bass, chug, fifth)],
      [10, stack(kick, snare, ride, crash, toms, bass, chug, fifth, lead)],
      [11, stack(kick16, snare, ride, shaker, crash, toms, bass, chug, fifth, lead, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const bg = paintBackground(W, H, art);
    const logArt = [paintLog(art), paintLog(art), paintLog(art)];
    const branchArt = paintBranch();
    const knotArt = paintKnot(false);
    const crackArt = paintKnot(true);
    const spikeArt = paintSpikes();
    const stump = paintStump();
    const jackIdle = paintJack(false);
    const jackSwing = paintJack(true);
    const canopy = paintCanopy(W);
    const rays = paintRays(W, H);
    const mist = paintMist();
    const ferns = paintFerns(W);
    const redGlow = glowSprite('rgba(255,50,30,1)', 40);
    const sunGlow = glowSprite('rgba(255,240,190,1)', 60);
    const vignette = vignetteSprite(W, H, 0.5, '10,30,20');
    const fx = createParticles();
    const needles = createParticles();
    const steam = createParticles();

    const mists = [];
    for (let i = 0; i < 5; i++) mists.push({ x: art.range(-100, W + 100), y: art.range(260, 560), v: art.range(5, 14), a: art.range(0.4, 0.8), s: art.range(200, 320) });

    // ---- the tree, log by log, fixed in advance (branch side b, spike side n, chops needed) ----
    const segs = [];
    let made = 0;
    const makeSeg = () => {
      const i = made++;
      const u = clamp((i - SAFE) / 200, 0, 1);
      const seg = { b: 0, n: 0, hits: 1, cracked: false, v: i % 3, shake: 0 };
      if (i >= SAFE) {
        const roll = plan.next();
        const side = plan.chance(0.5) ? -1 : 1;
        const pSpike = i >= 75 ? lerp(0.07, 0.14, u) : 0;
        const pKnot = i >= 40 ? lerp(0.1, 0.18, u) : 0;
        const pBranch = lerp(0.45, 0.75, u);
        const roll2 = plan.next();
        if (roll < pSpike) seg.n = side;
        else if (roll < pSpike + pKnot) seg.hits = 2;
        else if (roll2 < pBranch) seg.b = side;
      }
      // the log below must still be choppable from at least one side
      const prev = segs[segs.length - 1];
      if (prev && ![-1, 1].some((s) => s !== prev.b && s !== prev.n && s !== seg.b)) seg.b = 0;
      segs.push(seg);
    };
    for (let i = 0; i < 12; i++) makeSeg();

    let side = -1;
    let energy = 1;
    let lastDir = 0;
    let pending = 0;
    let cd = 0;
    let swing = 0;
    let hop = 0;
    let drop = 0;
    let logs = 0;
    let clock = 0;
    let fallRot = 0;
    const flying = [];

    const die = (game, reason, kind) => {
      game.dead = true;
      game.deathReason = reason;
      const x = CX + side * JACK_X;
      fx.burst(x, GROUND - 60, { count: 26, speed: 200, life: 0.9, size: 4, drag: 2, gravity: 500, colors: kind === 'steam' ? ['#ffffff', '#e8f0ee'] : ['#ffe27a', '#ffffff', '#f6dcae'] });
    };

    const chop = (game, s) => {
      if (s !== side) hop = 1;
      side = s;
      swing = 0.11;
      const seg = segs[0];
      const ex = CX + s * (TW / 2);
      if (seg.b === s) return die(game, 'Walked head-first into a branch.', 'branch');
      if (seg.n === s) {
        fx.burst(ex, rowTop(0) + SEG * 0.5, { count: 24, speed: 240, life: 0.5, size: 3, drag: 2, colors: ['#fff4b0', '#ffb040', '#ffffff'] });
        return die(game, 'Your axe hit the old iron spikes in the trunk.', 'spikes');
      }
      energy = Math.min(1, energy + GAIN);
      fx.burst(ex, rowTop(0) + SEG * 0.42, { count: 12, speed: 220, angle: s < 0 ? Math.PI : 0, spread: 1.6, life: 0.7, size: 3.5, drag: 1.5, gravity: 700, colors: CHIPS });
      if (seg.hits > 1) {
        seg.hits--;
        seg.cracked = true;
        seg.shake = 1;
        return;
      }
      // the log flies off, away from the axe, and the tree drops a notch
      flying.push({ x: CX, y: rowTop(0) + SEG / 2, vx: -s * lerp(340, 460, Math.random()), vy: -lerp(160, 300, Math.random()), rot: 0, vr: -s * lerp(5, 9, Math.random()), seg });
      segs.shift();
      makeSeg();
      drop = 1;
      logs++;
      if (segs[0].b === s) die(game, 'A branch came down on your head.', 'branch');
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      drop = Math.max(0, drop - dt / 0.07);
      swing = Math.max(0, swing - dt);
      hop = Math.max(0, hop - dt / 0.12);
      for (const s of segs) s.shake = Math.max(0, s.shake - dt / 0.2);
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.vy += 1400 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y > H + 120 || f.x < -200 || f.x > W + 200) flying.splice(i, 1);
      }
      for (const m of mists) {
        m.x += m.v * dt;
        if (m.x > W + 180) m.x = -180;
      }
      if (Math.random() < dt * 3) {
        needles.burst(Math.random() * W, -6, { count: 1, speed: 30, angle: Math.PI / 2, spread: 1, life: 6, size: 3, colors: ['#c98a3a', '#e0b050', '#7fae4a'] });
      }
      for (const p of needles.list) p.vx = 20 * Math.sin(clock * 1.3 + p.y * 0.02);
      needles.update(dt);
      fx.update(dt);
      steam.update(dt);
    };

    const drawLog = (g, seg, x, y) => {
      // x is the trunk's centre, y the log's top edge
      g.drawImage(logArt[seg.v].canvas, x - TW / 2, y, TW, SEG);
      if (seg.hits > 1 || seg.cracked) drawSprite(g, seg.cracked ? crackArt : knotArt, x + 4, y + SEG * 0.5);
      if (seg.n) {
        g.save();
        g.translate(x + seg.n * (TW / 2 + 2), y + SEG * 0.42);
        g.scale(seg.n, 1);
        drawSprite(g, spikeArt, 0, 0);
        g.restore();
      }
      if (seg.b) {
        g.save();
        g.translate(x + seg.b * (TW / 2 - 4), y + SEG * 0.42);
        g.scale(seg.b, 1);
        drawSprite(g, branchArt, (BL + 10) / 2, 0);
        g.restore();
      }
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        updateCosmetic(dt);
        energy -= drain(t) * dt;
        if (energy <= 0) {
          energy = 0;
          return die(this, 'Ran out of steam. The tree wins this time.', 'steam');
        }
        if (dir !== 0 && dir !== lastDir) pending = dir;
        lastDir = dir;
        cd -= dt;
        if (pending && cd <= 0) {
          const s = pending;
          pending = 0;
          cd = cooldown(t);
          chop(this, s);
          if (this.dead) return;
        }
        if (energy < 0.3 && Math.random() < dt * 14) {
          steam.burst(CX + side * JACK_X + side * 4, GROUND - 92, { count: 1, speed: 40, angle: -Math.PI / 2, spread: 0.8, life: 0.9, size: 7, round: true, drag: 1, colors: ['rgba(255,255,255,0.7)', 'rgba(230,240,236,0.6)'] });
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        fallRot = Math.min(1, fallRot + dt * 4);
        if (Math.random() < dt * 6) {
          fx.burst(CX + side * (JACK_X + 18), GROUND - 30, { count: 1, speed: 30, life: 0.8, size: 4, colors: ['#ffe27a'] });
        }
      },

      render(g) {
        drawSprite(g, bg, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 70, 90, { size: 220, alpha: 0.5 + 0.06 * Math.sin(clock * 0.7) });
        g.globalCompositeOperation = 'source-over';
        for (const m of mists) drawSprite(g, mist, m.x, m.y, { size: m.s, alpha: m.a });
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.75 + 0.25 * Math.sin(clock * 0.5);
        g.drawImage(rays.canvas, 0, 0, W, H);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';

        // the trunk, from the top of the screen down to the stump
        const off = -SEG * drop * drop;
        for (let k = segs.length - 1; k >= 0; k--) {
          const y = rowTop(k) + off;
          if (y > H || y + SEG < -10) continue;
          const seg = segs[k];
          const sx = seg.shake ? Math.sin(clock * 90) * 3 * seg.shake : 0;
          drawLog(g, seg, CX + sx, y);
        }
        // the branch that will come down next glows red if you're standing under it
        if (!this.dead && segs[1].b === side) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, CX + side * (TW / 2 + BL * 0.55), rowTop(1) + off + SEG * 0.42, { size: 150 + 14 * Math.sin(clock * 18), alpha: 0.55 });
          g.globalCompositeOperation = 'source-over';
        }
        drawSprite(g, stump, CX, GROUND - 4);

        // logs flying off
        for (const f of flying) {
          g.save();
          g.translate(f.x, f.y);
          g.rotate(f.rot);
          drawLog(g, f.seg, 0, -SEG / 2);
          g.restore();
        }

        // the lumberjack
        const jx = CX + side * JACK_X;
        const lift = Math.sin(hop * Math.PI) * 10;
        g.save();
        g.translate(jx, GROUND - 46 - lift);
        if (this.dead) {
          g.translate(0, 30 * fallRot);
          g.rotate(-side * fallRot * 1.45);
        }
        g.scale(-side, 1);
        const spr = swing > 0 && !this.dead ? jackSwing : jackIdle;
        drawSprite(g, spr, 0, 0);
        g.restore();

        fx.render(g);
        steam.render(g);
        needles.render(g);
        drawSprite(g, ferns, W / 2, H - 35);
        drawSprite(g, canopy, W / 2, 60);

        // energy bar
        const bx = 96;
        const by = 56;
        const bw = 168;
        const low = energy < 0.3;
        g.fillStyle = 'rgba(10,25,18,0.55)';
        g.beginPath();
        g.roundRect(bx - 3, by - 3, bw + 6, 16, 8);
        g.fill();
        const fill = g.createLinearGradient(bx, 0, bx + bw, 0);
        fill.addColorStop(0, '#e2463a');
        fill.addColorStop(0.35, '#f2b23e');
        fill.addColorStop(1, '#8fdc5a');
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(bx, by, Math.max(4, bw * energy), 10, 5);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(bx + 4, by + 1.5, Math.max(0, bw * energy - 8), 2);
        if (low && !this.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, bx + bw * energy, by + 5, { size: 70, alpha: 0.4 + 0.3 * Math.sin(clock * 16) });
          g.globalCompositeOperation = 'source-over';
        }
        g.font = '700 11px system-ui, sans-serif';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,246,224,0.85)';
        g.fillText('🪓', bx - 8, by + 5);

        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = '700 13px system-ui, sans-serif';
        g.fillStyle = 'rgba(255,246,224,0.85)';
        g.fillText(`${logs} log${logs === 1 ? '' : 's'}`, 12, H - 12);

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
