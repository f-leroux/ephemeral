// Graveyard Dash — Halloween night. A little trick-or-treater in a pumpkin costume runs up through
// a moonlit graveyard with a glowing pail of candy, and the ghosts want it. Every ghost drifts down
// out of the fog and homes in on wherever the kid is, a little slower than the kid but with
// momentum, so the trick is to lure it close and sidestep at the last moment (it overshoots).
// From 12s banshees hover at the top, stare (a red aim line), lock on and swoop straight down
// through where you stood; from 22s bats flap down in zigzags; from 30s ghosts come in pairs.
// Ghosts get faster, sharper and more frequent. Every arrival time is planned up front from the rng.
// The headstones are only scenery: scattered, faded into the grass and drawn under everything, so
// the kid and the ghosts pass right over them.

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

const PY = 540; // the kid's feet
const RP = 11; // the kid's radius
const RG = 13; // a ghost's radius (at its shadow on the ground)
const RB = 15; // a banshee's
const RBAT = 9;
const MINX = 30;
const MAXX = 330;
const SPEED = 290;
const STEP = 1 / 120;
const TOP = -40; // where things appear, above the fog
const HOVER = 150; // where banshees hover before they swoop
const AIM = 0.8; // how long a banshee stares before it locks on
const LOCK = 0.22; // locked on, about to swoop
const DASH = 1000;

const speedAt = (t) => lerp(120, 230, progress(t, 60, 1.2)); // how fast the ground scrolls

const CANDY = ['#ff4d6d', '#ffd23f', '#7ae582', '#58c4ff', '#c77dff', '#ffffff', '#ff9f1c'];
const MIST = ['#e6fff6', '#bff5e4', '#9ee8d6', '#ffffff'];
const LEAVES = ['#d9622b', '#b8461f', '#e8a33a', '#8a3a1c'];

// ---------- art ----------

function paintGround(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    g.fillStyle = '#2a2340';
    g.fillRect(0, 0, W, H);
    const wrap = (y, draw) => [-H, 0, H].forEach((o) => draw(y + o));
    // mossy and bare patches
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, W);
      const r = rng.range(40, 100);
      const tone = rng.pick(['rgba(52,62,74,0.45)', 'rgba(22,16,36,0.45)', 'rgba(64,50,92,0.35)']);
      wrap(rng.range(0, H), (y) => {
        const c = g.createRadialGradient(x, y, 1, x, y, r);
        c.addColorStop(0, tone);
        c.addColorStop(1, 'rgba(42,35,64,0)');
        g.fillStyle = c;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    // grass tufts
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, W);
      const col = rng.pick(['rgba(84,100,104,0.55)', 'rgba(70,64,104,0.55)', 'rgba(104,120,110,0.4)']);
      const n = rng.int(3, 5);
      const h = rng.range(3, 6);
      wrap(rng.range(0, H), (y) => {
        g.strokeStyle = col;
        g.lineWidth = 0.8;
        g.beginPath();
        for (let k = 0; k < n; k++) {
          const dx = (k - n / 2) * 1.2;
          g.moveTo(x + dx, y);
          g.lineTo(x + dx * 1.8, y - h);
        }
        g.stroke();
      });
    }
    // fallen leaves
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, W);
      const col = rng.pick(LEAVES);
      const a = rng.range(0, 6.28);
      const s = rng.range(2, 3.6);
      wrap(rng.range(0, H), (y) => {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.globalAlpha = 0.55;
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(40,16,8,0.6)';
        g.lineWidth = 0.4;
        g.beginPath();
        g.moveTo(-s, 0);
        g.lineTo(s, 0);
        g.stroke();
        g.restore();
      });
    }
    // pebbles
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const r = rng.range(0.8, 2);
      wrap(rng.range(0, H), (y) => {
        g.fillStyle = 'rgba(150,140,170,0.35)';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      });
    }
  }, 1);
}

// an iron railing along one edge of the graveyard (the 40px post spacing divides the tile)
function paintFence(H, flip) {
  const w = 30;
  return makeSprite(w, H, (g) => {
    g.translate(-w / 2, -H / 2);
    if (flip) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    const soil = g.createLinearGradient(0, 0, w, 0);
    soil.addColorStop(0, '#0e0a18');
    soil.addColorStop(0.7, '#1c1530');
    soil.addColorStop(1, 'rgba(28,21,48,0)');
    g.fillStyle = soil;
    g.fillRect(0, 0, w, H);
    // ivy
    for (let y = 0; y < H; y += 7) {
      g.fillStyle = (y / 7) % 3 ? 'rgba(40,70,56,0.7)' : 'rgba(60,96,70,0.6)';
      g.beginPath();
      g.ellipse(6 + Math.sin(y * 0.37) * 4, y, 4, 2.6, Math.sin(y) * 0.8, 0, Math.PI * 2);
      g.fill();
    }
    // rails
    g.strokeStyle = '#050309';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(11, 0);
    g.lineTo(11, H);
    g.moveTo(17, 0);
    g.lineTo(17, H);
    g.stroke();
    g.strokeStyle = 'rgba(150,140,200,0.35)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(10.4, 0);
    g.lineTo(10.4, H);
    g.stroke();
    // bars and spear tips
    for (let y = 0; y < H; y += 10) {
      g.fillStyle = '#07050c';
      g.fillRect(9, y, 10, 1.6);
    }
    for (let y = 20; y < H; y += 40) {
      g.fillStyle = '#07050c';
      g.beginPath();
      g.arc(14, y, 3.6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(14, y - 8);
      g.lineTo(17, y - 3);
      g.lineTo(11, y - 3);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(170,160,220,0.5)';
      g.beginPath();
      g.arc(13, y - 1, 1.1, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

// headstones in a three-quarter view: the face toward you, the ground point at the bottom
const STONES = {
  round: { w: 30, h: 42 },
  cross: { w: 28, h: 46 },
  obelisk: { w: 22, h: 54 },
  tomb: { w: 46, h: 34 },
};

function stoneFace(g, kind) {
  if (kind === 'round') {
    g.moveTo(-12, 14);
    g.lineTo(-12, -6);
    g.arc(0, -6, 12, Math.PI, 0);
    g.lineTo(12, 14);
    g.closePath();
  } else if (kind === 'cross') {
    g.moveTo(-4, 14);
    g.lineTo(-4, -4);
    g.lineTo(-11, -4);
    g.lineTo(-11, -11);
    g.lineTo(-4, -11);
    g.lineTo(-4, -19);
    g.lineTo(4, -19);
    g.lineTo(4, -11);
    g.lineTo(11, -11);
    g.lineTo(11, -4);
    g.lineTo(4, -4);
    g.lineTo(4, 14);
    g.closePath();
  } else if (kind === 'obelisk') {
    g.moveTo(-7, 14);
    g.lineTo(-5, -16);
    g.lineTo(0, -24);
    g.lineTo(5, -16);
    g.lineTo(7, 14);
    g.closePath();
  } else {
    g.moveTo(-21, 14);
    g.lineTo(-21, -2);
    g.lineTo(-15, -8);
    g.lineTo(15, -8);
    g.lineTo(21, -2);
    g.lineTo(21, 14);
    g.closePath();
  }
}

function paintStone(kind, rng) {
  const { w, h } = STONES[kind];
  return makeSprite(w + 8, h + 10, (g) => {
    g.translate(0, (h + 10) / 2 - 18); // the ground point sits 4px above the sprite's bottom
    // shadow on the grass
    g.fillStyle = 'rgba(8,4,16,0.5)';
    g.beginPath();
    g.ellipse(2, 13, w / 2 + 2, 5, 0, 0, Math.PI * 2);
    g.fill();
    // the side (depth), then the face
    g.save();
    g.translate(2.5, -2);
    g.fillStyle = '#3a3650';
    g.beginPath();
    stoneFace(g, kind);
    g.fill();
    g.restore();
    const sg = g.createLinearGradient(-w / 2, -h, w / 2, 14);
    sg.addColorStop(0, '#b6b2c8');
    sg.addColorStop(0.45, '#827c98');
    sg.addColorStop(1, '#4c4664');
    g.fillStyle = sg;
    g.beginPath();
    stoneFace(g, kind);
    g.fill();
    g.strokeStyle = 'rgba(20,14,32,0.8)';
    g.lineWidth = 1;
    g.stroke();
    // texture, moss and cracks
    g.save();
    g.beginPath();
    stoneFace(g, kind);
    g.clip();
    for (let i = 0; i < 26; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
      g.fillRect(rng.range(-w / 2, w / 2), rng.range(-h + 14, 14), rng.range(1, 3), rng.range(1, 2));
    }
    const moss = g.createLinearGradient(0, 4, 0, 14);
    moss.addColorStop(0, 'rgba(70,110,70,0)');
    moss.addColorStop(1, 'rgba(70,110,70,0.75)');
    g.fillStyle = moss;
    g.fillRect(-w / 2, 2, w, 13);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(90,130,80,0.6)';
      g.beginPath();
      g.arc(rng.range(-w / 2, w / 2), rng.range(-h + 18, 12), rng.range(0.8, 2), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(20,14,32,0.7)';
    g.lineWidth = 0.7;
    g.beginPath();
    let cx = rng.range(-w / 4, w / 4);
    let cy = -h + 22;
    g.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) {
      cx += rng.range(-3, 3);
      cy += rng.range(3, 6);
      g.lineTo(cx, cy);
    }
    g.stroke();
    // a lit edge from the moon (upper left)
    g.strokeStyle = 'rgba(230,230,255,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    stoneFace(g, kind);
    g.stroke();
    g.restore();
    // engraving
    g.fillStyle = 'rgba(30,24,46,0.75)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'round') {
      g.font = '700 7px Georgia, serif';
      g.fillText('R.I.P', 0, -4);
      g.fillRect(-6, 2, 12, 1);
      g.fillRect(-4, 5, 8, 1);
    } else if (kind === 'tomb') {
      g.font = '700 6px Georgia, serif';
      g.fillText('HERE LIES', 0, 1);
      g.fillRect(-10, 6, 20, 1);
    } else if (kind === 'obelisk') {
      g.fillRect(-2, -8, 4, 1);
      g.fillRect(-2.5, -4, 5, 1);
    }
  });
}

// the trick-or-treater from behind: a round pumpkin costume, a green stalk cap, and a lit
// jack-o'-lantern pail of candy in the right hand. Two frames, one per stride.
function paintKid(stride) {
  return makeSprite(40, 50, (g) => {
    g.fillStyle = 'rgba(8,4,16,0.5)';
    g.beginPath();
    g.ellipse(0, 20, 13, 5, 0, 0, Math.PI * 2);
    g.fill();
    // legs in striped tights
    for (const sd of [-1, 1]) {
      const up = sd === stride ? -3 : 0;
      g.fillStyle = '#1a1028';
      g.fillRect(sd * 4.5 - 2.2, 9 + up, 4.4, 10);
      g.fillStyle = '#7b3fb0';
      for (let y = 11; y < 19; y += 3) g.fillRect(sd * 4.5 - 2.2, y + up, 4.4, 1.4);
      g.fillStyle = '#0a0612';
      g.beginPath();
      g.ellipse(sd * 4.5, 19.5 + up, 3, 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // left arm swinging
    g.strokeStyle = '#1a1028';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-11, -2);
    g.lineTo(-15, 4 + stride * 2);
    g.stroke();
    // the pumpkin costume
    const bg = g.createRadialGradient(-5, -4, 2, 0, 1, 15);
    bg.addColorStop(0, '#ffc066');
    bg.addColorStop(0.5, '#f5861e');
    bg.addColorStop(1, '#a8440c');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 1, 13.5, 11.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,40,4,0.7)';
    g.lineWidth = 1;
    for (const k of [-0.62, -0.25, 0.25, 0.62]) {
      g.beginPath();
      g.ellipse(0, 1, Math.abs(k) * 13.5, 11.5, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(60,20,0,0.9)';
    g.beginPath();
    g.ellipse(0, 1, 13.5, 11.5, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.45)';
    g.beginPath();
    g.ellipse(-6, -4, 3.5, 2, -0.5, 0, Math.PI * 2);
    g.fill();
    // head: brown hair, a green knitted cap with a curly stalk
    g.fillStyle = '#5a3218';
    g.beginPath();
    g.arc(0, -12, 6.5, 0, Math.PI * 2);
    g.fill();
    const cg = g.createLinearGradient(-6, -20, 6, -12);
    cg.addColorStop(0, '#8ccf5a');
    cg.addColorStop(1, '#3f7a2a');
    g.fillStyle = cg;
    g.beginPath();
    g.arc(0, -13, 6.6, Math.PI, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(30,60,20,0.8)';
    g.lineWidth = 0.6;
    for (let x = -5; x <= 5; x += 2.5) {
      g.beginPath();
      g.moveTo(x, -13);
      g.lineTo(x * 0.6, -18.5);
      g.stroke();
    }
    g.strokeStyle = '#5a3a14';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -19);
    g.quadraticCurveTo(1, -24, 4, -23);
    g.stroke();
    // right arm holding the pail out to the side
    g.strokeStyle = '#1a1028';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(11, -2);
    g.lineTo(15, 3);
    g.stroke();
  });
}

function paintPail() {
  return makeSprite(18, 20, (g) => {
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, -1, 6, Math.PI, 0);
    g.stroke();
    const pg = g.createRadialGradient(-2, 1, 1, 0, 3, 8);
    pg.addColorStop(0, '#ffb340');
    pg.addColorStop(1, '#c4520e');
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 4, 7, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff1a0';
    g.beginPath();
    g.moveTo(-4, 2);
    g.lineTo(-2, 0.5);
    g.lineTo(-1.5, 2.5);
    g.closePath();
    g.moveTo(4, 2);
    g.lineTo(2, 0.5);
    g.lineTo(1.5, 2.5);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-4, 5);
    g.lineTo(-2, 6.5);
    g.lineTo(0, 5.2);
    g.lineTo(2, 6.5);
    g.lineTo(4, 5);
    g.lineTo(2, 7.8);
    g.lineTo(-2, 7.8);
    g.closePath();
    g.fill();
    // candy poking out
    for (const [x, c] of [[-3, '#ff4d6d'], [0, '#ffd23f'], [3, '#58c4ff']]) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, -0.5, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// a classic bedsheet ghost, wavy hem and all. Two frames for the flutter.
function paintGhost(frame, tint) {
  return makeSprite(44, 54, (g) => {
    const [hi, mid, lo] = tint;
    const body = () => {
      g.beginPath();
      g.moveTo(-15, 14);
      g.lineTo(-15, -6);
      g.arc(0, -6, 15, Math.PI, 0);
      g.lineTo(15, 14);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x0 = 15 - (i * 30) / n;
        const x1 = 15 - ((i + 1) * 30) / n;
        const dip = (i + frame) % 2 ? 7 : 3.5;
        g.quadraticCurveTo((x0 + x1) / 2, 14 + dip, x1, 14);
      }
      g.closePath();
    };
    const bg = g.createLinearGradient(-10, -22, 8, 22);
    bg.addColorStop(0, hi);
    bg.addColorStop(0.55, mid);
    bg.addColorStop(1, lo);
    g.fillStyle = bg;
    body();
    g.fill();
    g.strokeStyle = 'rgba(60,110,120,0.55)';
    g.lineWidth = 1;
    g.stroke();
    // folds
    g.strokeStyle = 'rgba(80,140,150,0.3)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-7, 2);
    g.quadraticCurveTo(-9, 10, -6, 17);
    g.moveTo(6, 3);
    g.quadraticCurveTo(8, 10, 5, 16);
    g.stroke();
    // little arms
    g.fillStyle = mid;
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.ellipse(sd * 16, -1 + (frame ? -2 : 1) * sd, 4.5, 3, sd * (frame ? -0.7 : -0.3), 0, Math.PI * 2);
      g.fill();
    }
    // sheen
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-6, -14, 4.5, 2.6, -0.6, 0, Math.PI * 2);
    g.fill();
    // eyes and an "oooo" mouth
    g.fillStyle = '#1b1030';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.ellipse(sd * 5.5, -6, 3, 4.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 4, 2.6, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.arc(sd * 5.5 - 1, -7.5, 1, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// a banshee: a tall, wailing violet spirit with long streaming hair
function paintBanshee(frame) {
  return makeSprite(60, 78, (g) => {
    // streaming hair behind
    g.fillStyle = 'rgba(70,30,110,0.9)';
    g.beginPath();
    g.moveTo(-14, -22);
    g.bezierCurveTo(-30, -10, -24 + frame * 4, 14, -30, 34);
    g.lineTo(-12, 10);
    g.lineTo(12, 10);
    g.lineTo(30, 34);
    g.bezierCurveTo(24 - frame * 4, 14, 30, -10, 14, -22);
    g.closePath();
    g.fill();
    // the robe, tapering into a wispy tail
    const rg = g.createLinearGradient(0, -30, 0, 38);
    rg.addColorStop(0, '#f4e8ff');
    rg.addColorStop(0.5, '#c6a8f0');
    rg.addColorStop(1, 'rgba(140,100,220,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(-13, -12);
    g.bezierCurveTo(-18, 6, -10, 22, frame ? -4 : 4, 38);
    g.bezierCurveTo(10, 22, 18, 6, 13, -12);
    g.closePath();
    g.fill();
    // arms flung out
    g.strokeStyle = '#d8c4f8';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * 11, -8);
      g.quadraticCurveTo(sd * 22, -14 - frame * 3, sd * 26, -4);
      g.stroke();
    }
    // head and hood of hair
    const hg = g.createRadialGradient(-3, -24, 1, 0, -20, 11);
    hg.addColorStop(0, '#ffffff');
    hg.addColorStop(1, '#bfa4ee');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(0, -20, 9, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a1660';
    g.beginPath();
    g.moveTo(-10, -18);
    g.quadraticCurveTo(-10, -34, 0, -33);
    g.quadraticCurveTo(10, -34, 10, -18);
    g.quadraticCurveTo(6, -28, 0, -28);
    g.quadraticCurveTo(-6, -28, -10, -18);
    g.fill();
    // hollow eyes and wailing mouth
    g.fillStyle = '#12061e';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.ellipse(sd * 3.6, -21, 2.2, 3.2, sd * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, -13.5, 2.6, 4, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintBat(frame) {
  return makeSprite(40, 24, (g) => {
    g.fillStyle = '#120a1c';
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * 3, -1);
      if (frame) {
        g.quadraticCurveTo(sd * 10, -12, sd * 19, -9);
        g.quadraticCurveTo(sd * 15, -5, sd * 16, -1);
        g.quadraticCurveTo(sd * 11, -3, sd * 10, 1);
        g.quadraticCurveTo(sd * 7, -1, sd * 3, 3);
      } else {
        g.quadraticCurveTo(sd * 10, 2, sd * 19, 7);
        g.quadraticCurveTo(sd * 14, 6, sd * 13, 9);
        g.quadraticCurveTo(sd * 9, 6, sd * 7, 8);
        g.quadraticCurveTo(sd * 5, 4, sd * 3, 3);
      }
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(170,110,230,0.6)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-3, -1);
    g.quadraticCurveTo(-10, frame ? -12 : 2, -19, frame ? -9 : 7);
    g.moveTo(3, -1);
    g.quadraticCurveTo(10, frame ? -12 : 2, 19, frame ? -9 : 7);
    g.stroke();
    g.fillStyle = '#1e1230';
    g.beginPath();
    g.ellipse(0, 1, 4, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-3, -3);
    g.lineTo(-2.5, -7);
    g.lineTo(-1, -4);
    g.lineTo(1, -4);
    g.lineTo(2.5, -7);
    g.lineTo(3, -3);
    g.fill();
    g.fillStyle = '#ff5a4a';
    g.fillRect(-2, -2, 1.3, 1.3);
    g.fillRect(0.7, -2, 1.3, 1.3);
  });
}

function paintMoon() {
  return makeSprite(70, 70, (g) => {
    const mg = g.createRadialGradient(-8, -8, 2, 0, 0, 28);
    mg.addColorStop(0, '#fffbe6');
    mg.addColorStop(0.7, '#f4e6b8');
    mg.addColorStop(1, '#d8c48c');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(0, 0, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(160,140,100,0.35)';
    for (const [x, y, r] of [[-8, -6, 5], [7, 4, 7], [-5, 12, 3.5], [10, -11, 3], [-14, 4, 2.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// bare, twisted branches reaching in over the edge of the graveyard
function paintTree(rng) {
  return makeSprite(130, 170, (g) => {
    g.translate(-65, 0);
    g.strokeStyle = '#07040d';
    g.lineCap = 'round';
    const branch = (x, y, a, len, w, depth) => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo((x + x2) / 2 + rng.range(-6, 6), (y + y2) / 2 + rng.range(-6, 6), x2, y2);
      g.stroke();
      if (depth <= 0) return;
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) branch(x2, y2, a + rng.range(-0.8, 0.8), len * rng.range(0.55, 0.75), w * 0.62, depth - 1);
    };
    for (let k = 0; k < 3; k++) branch(0, rng.range(-50, 50), rng.range(-0.5, 0.5), rng.range(40, 60), 7, 4);
  }, 2);
}

function paintJack() {
  return makeSprite(26, 24, (g) => {
    const pg = g.createRadialGradient(-3, -3, 1, 0, 1, 12);
    pg.addColorStop(0, '#ffb24a');
    pg.addColorStop(0.6, '#e86a14');
    pg.addColorStop(1, '#8a3208');
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 2, 11, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(100,30,0,0.6)';
    g.lineWidth = 0.8;
    for (const k of [-6, 0, 6]) {
      g.beginPath();
      g.ellipse(k * 0.8, 2, 3.2, 8.8, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#4a6a20';
    g.fillRect(-1.2, -9, 2.4, 4);
    g.fillStyle = '#ffe88a';
    g.beginPath();
    g.moveTo(-6, -1);
    g.lineTo(-2.5, -3);
    g.lineTo(-2.5, 1);
    g.closePath();
    g.moveTo(6, -1);
    g.lineTo(2.5, -3);
    g.lineTo(2.5, 1);
    g.closePath();
    g.moveTo(-7, 4);
    g.lineTo(-4, 6);
    g.lineTo(-2, 4.5);
    g.lineTo(0, 7);
    g.lineTo(2, 4.5);
    g.lineTo(4, 6);
    g.lineTo(7, 4);
    g.lineTo(4, 9);
    g.lineTo(-4, 9);
    g.closePath();
    g.fill();
  });
}

function paintFog(r) {
  return makeSprite(r * 2, r, (g) => {
    const fg = g.createRadialGradient(0, 0, 2, 0, 0, r);
    fg.addColorStop(0, 'rgba(210,200,240,0.55)');
    fg.addColorStop(1, 'rgba(210,200,240,0)');
    g.scale(1, 0.5);
    g.fillStyle = fg;
    g.fillRect(-r, -r, r * 2, r * 2);
  }, 1);
}

// ---------- game ----------

export default {
  id: 'graveyard',
  title: 'Graveyard Dash',
  emoji: '👻',
  tagline: 'Ghosts home in on you: lure them close, then dodge at the last second.',
  colors: { bg: '#1a1228', fg: '#f3ecff', accent: '#ff8a1e' },

  // A gothic organ-house Halloween anthem at 140 BPM in C minor: a four-on-the-floor kick, a
  // rolling octave sawtooth bass and a church organ playing Bach's Toccata in D minor (moved to C
  // minor) from the first bar, a tolling bell every four bars, then a backbeat, a choir pad and a
  // wobbling theremin tune, then claps, a shaker and a 16th arpeggio, and a finale with the organ
  // and the theremin doubled an octave down and a rising noise wash. One bar per cycle: 35 = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.25).sustain(0).gain(0.8)
      const kick2 = note("c2 c2 c2 [c2 c2]").s("sine").decay(0.22).sustain(0).gain("0.8 0.8 0.8 [0.8 0.55]")
      const snare = s("~ white ~ white").decay(0.13).sustain(0).hpf(1400).lpf(6000).gain(0.17).room(0.3)
      const clap = s("~ pink ~ pink").decay(0.08).sustain(0).hpf(1000).lpf(5000).gain(0.1).room(0.4)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const bass = note("<[c2 c3]*4 [c2 c3]*4 [ab2 ab3]*4 [g2 g3]*4>").s("sawtooth").decay(0.14).sustain(0.3).release(0.05)
        .lpf(saw.range(400, 1500).slow(35)).lpq(5).gain(0.36)
      const riff = "<[g5 f5 g5@4 ~ f5 eb5 d5 c5 b4@2 c5@3] [g4 f4 g4@4 ~ f4 eb4 d4 c4 b3@2 c4@3] [ab4 c5 eb5 ab5 eb5 c5 ab4 c5] [g4 b4 d5 g5 f5 d5 b4 d5]>"
      const organ = note(riff).s("square").attack(0.005).decay(0.2).sustain(0.5).release(0.12)
        .lpf(saw.range(1400, 2600).slow(35)).gain(0.075).room(0.5).roomsize(3)
      const organLow = note(riff).add(note(-12)).s("sawtooth").decay(0.2).sustain(0.4).release(0.1).lpf(1100).gain(0.05)
      const pad = note("<[c4,eb4,g4] [c4,eb4,g4] [ab3,c4,eb4] [g3,b3,d4]>").s("sawtooth").attack(0.4).release(0.6)
        .lpf(saw.range(500, 1800).slow(35)).gain(0.05).room(0.6).roomsize(4)
      const tune = "<[g5@3 f5] [eb5@2 d5 eb5] [c5@3 ab4] [b4@3 d5]>"
      const theremin = note(tune).s("sine").attack(0.08).decay(0.4).sustain(0.7).release(0.3)
        .vib(5).vibmod(0.45).gain(0.14).room(0.6).delay(0.25).delaytime(0.321).delayfeedback(0.3)
      const theremin2 = note(tune).add(note(-12)).s("triangle").attack(0.08).decay(0.4).sustain(0.6).release(0.3)
        .vib(5).vibmod(0.3).lpf(1600).gain(0.08)
      const bell = note("<[c5,g5,eb6] ~ ~ ~>").s("sine").decay(1.6).sustain(0).gain(0.06).room(0.7).roomsize(5)
      const arp = note("<[c5 eb5 g5 c6]*4 [c5 eb5 g5 c6]*4 [ab4 c5 eb5 ab5]*4 [g4 b4 d5 g5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3400).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
        .delay(0.2).delaytime(0.214).delayfeedback(0.25)
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(900).lpf(saw.range(800, 5000).slow(35)).gain(saw.range(0, 0.06).slow(35))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, organ, bell)],
      [8, stack(kick, snare, hats, bass, organ, pad, theremin, bell)],
      [8, stack(kick, snare, clap, shaker, bass, organ, pad, theremin, arp, bell)],
      [11, stack(kick2, snare, clap, shaker, bass, organ, organLow, pad, theremin, theremin2, arp, bell, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');

    const ground = paintGround(W, H, art);
    const fenceL = paintFence(H, false);
    const fenceR = paintFence(H, true);
    const stoneArt = {};
    for (const k of Object.keys(STONES)) stoneArt[k] = [paintStone(k, art), paintStone(k, art)];
    const kid = [paintKid(-1), paintKid(1)];
    const pail = paintPail();
    const ghostArt = [0, 1].map((f) => paintGhost(f, ['#ffffff', '#dcfff3', '#9fe3d6']));
    const bansheeArt = [paintBanshee(0), paintBanshee(1)];
    const batArt = [paintBat(0), paintBat(1)];
    const moon = paintMoon();
    const trees = [paintTree(art), paintTree(art), paintTree(art)];
    const jack = paintJack();
    const fogArt = paintFog(90);
    const warmGlow = glowSprite('rgba(255,150,50,1)', 50);
    const mintGlow = glowSprite('rgba(150,255,220,1)', 36);
    const violetGlow = glowSprite('rgba(190,130,255,1)', 40);
    const redGlow = glowSprite('rgba(255,50,60,1)', 24);
    const moonGlow = glowSprite('rgba(220,210,255,1)', 120);
    const vignette = vignetteSprite(W, H, 0.7, '10,4,20');

    // how far the ground has scrolled: depends only on time, so rows can be planned ahead
    const distTable = [0];
    for (let i = 1; i <= 66 * 120; i++) distTable.push(distTable[i - 1] + speedAt((i - 0.5) * STEP) * STEP);
    const distAt = (t) => {
      const f = clamp(t / STEP, 0, distTable.length - 1);
      const i = Math.floor(f);
      return lerp(distTable[i], distTable[Math.min(i + 1, distTable.length - 1)], f - i);
    };

    // ---- the whole night, planned up front. Each spawn knows when it reaches the kid's row ----
    const spawns = [];
    const arrivals = [];
    let T = 3.6;
    while (T < 62) {
      const p = progress(T, 60, 1.3);
      const ghost = (x0, at) => {
        const vy = lerp(170, 275, p) * plan.range(0.92, 1.08);
        spawns.push({
          kind: 'ghost', at: at - (PY - TOP) / vy, x0, vy,
          vg: lerp(130, 235, p) * plan.range(0.95, 1.05),
          acc: lerp(380, 820, p),
          react: lerp(0.3, 0.15, p),
        });
        arrivals.push(at);
      };
      const roll = plan.next();
      if (T > 12 && roll < lerp(0.2, 0.3, p)) {
        // a banshee: hovers, stares, locks on and swoops through where the kid was
        const track = plan.range(0.5, 1.2);
        const lockT = T - 0.6;
        spawns.push({ kind: 'banshee', at: lockT - AIM - track - 1, x0: plan.range(70, W - 70), track });
        arrivals.push(T);
        T += lerp(1.6, 1.0, p) * plan.range(0.9, 1.1);
      } else if (T > 22 && roll < lerp(0.2, 0.3, p) + 0.16) {
        // a little colony of bats, flapping down one zigzag path
        const A = plan.range(55, 95);
        const cx = plan.range(MINX + A, MAXX - A);
        const vy = plan.range(230, 280);
        const w = plan.range(3, 4.4);
        const ph = plan.range(0, 6.28);
        const n = T > 40 ? 4 : 3;
        for (let k = 0; k < n; k++) {
          const at = T + k * 0.24;
          spawns.push({ kind: 'bat', at: at - (PY - TOP) / vy, cx, A, w, ph, vy });
          arrivals.push(at);
        }
        T += lerp(1.4, 1.0, p) + n * 0.24;
      } else if (T > 30 && roll > 0.72) {
        // a pair, side by side
        const x0 = plan.range(80, W - 80);
        ghost(x0 - 34, T);
        ghost(x0 + 34, T + plan.range(0, 0.15));
        T += lerp(1.6, 0.9, p) * plan.range(0.9, 1.1);
      } else {
        ghost(plan.range(50, W - 50), T);
        T += lerp(1.9, 0.68, p) * plan.range(0.85, 1.15);
      }
    }
    spawns.sort((a, b) => a.at - b.at);

    // headstones scattered over the grass (cosmetic: nothing collides with them)
    const graves = [];
    for (let i = 0; i < 110; i++) {
      const kind = art.chance(0.12) ? 'tomb' : art.pick(['round', 'round', 'cross', 'obelisk']);
      graves.push({ kind, s: 60 + i * 95 + art.range(0, 50), x: art.range(MINX + 10, MAXX - 10), art: art.int(0, 1) });
    }

    // decoration along the edges (cosmetic)
    const deco = [];
    for (let i = 0; i < 80; i++) deco.push({ s: i * 190 + art.range(0, 80), side: i % 2 ? 1 : -1, tree: art.int(0, 2), jack: art.chance(0.55), ph: art.range(0, 6.28) });
    const fogs = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * W, y: 60 + i * 85, sp: 6 + Math.random() * 10, s: 0.8 + Math.random() * 0.8, a: 0.05 + Math.random() * 0.05 }));

    // ---- state ----
    const mover = createMover({ x: W / 2, minX: MINX, maxX: MAXX, speed: SPEED, accel: 20 });
    const hist = new Float32Array(120).fill(W / 2); // the kid's x over the last second
    let hi = 0;
    const histAt = (ago) => hist[(hi - Math.round(ago / STEP) + 1200) % 120];
    const actors = [];
    const fx = createParticles();
    const wisps = createParticles();
    const leaves = createParticles();
    let si = 0;
    let time = 0;
    let clock = 0;
    let dist = 0;
    let deadT = 0;
    let caughtBy = null;

    function die(reason, by) {
      game.dead = true;
      game.deathReason = reason;
      caughtBy = by;
      fx.burst(mover.x + 14, PY - 8, { count: 40, speed: 240, life: 1.2, size: 4, gravity: 260, drag: 1, colors: CANDY });
      fx.burst(mover.x, PY - 14, { count: 40, speed: 180, life: 1, size: 5, round: true, drag: 2.5, colors: MIST });
    }

    function spawn(sp) {
      if (sp.kind === 'ghost') actors.push({ kind: 'ghost', x: sp.x0, y: TOP, vx: 0, vy: sp.vy, vg: sp.vg, acc: sp.acc, react: sp.react, ph: Math.random() * 6.28 });
      else if (sp.kind === 'banshee') actors.push({ kind: 'banshee', x: sp.x0, y: TOP - 20, t0: sp.at, track: sp.track, vx: 0, ax: 0, ay: 0, tx: 0, ty: 0, phase: 'enter', ph: Math.random() * 6.28 });
      else actors.push({ kind: 'bat', t0: sp.at, cx: sp.cx, A: sp.A, w: sp.w, ph: sp.ph, vy: sp.vy, x: sp.cx + sp.A * Math.sin(sp.ph), y: TOP });
    }

    function moveActors(dt, live) {
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        if (a.kind === 'ghost') {
          a.y += a.vy * dt;
          if (live && a.y < PY - 30) {
            const want = clamp((histAt(a.react) - a.x) * 3.2, -a.vg, a.vg);
            a.vx += clamp(want - a.vx, -a.acc * dt, a.acc * dt);
          } else {
            a.vx *= Math.max(0, 1 - 1.2 * dt);
          }
          a.x = clamp(a.x + a.vx * dt, 18, W - 18);
          if (Math.random() < dt * 14) wisps.burst(a.x, a.y - 14, { count: 1, speed: 20, life: 0.7, size: 4, round: true, drag: 1, angle: -Math.PI / 2, spread: 1.5, colors: MIST });
          if (a.y > H + 60) actors.splice(i, 1);
        } else if (a.kind === 'banshee') {
          const age = time - a.t0;
          if (a.phase === 'enter' || a.phase === 'track' || a.phase === 'aim') {
            a.y = lerp(TOP - 20, HOVER, clamp(age / 1, 0, 1) ** 0.5);
            const want = clamp((mover.x - a.x) * 1.5, -90, 90);
            a.vx += clamp(want - a.vx, -300 * dt, 300 * dt);
            a.x = clamp(a.x + a.vx * dt, 40, W - 40);
            a.phase = age < 1 ? 'enter' : age < 1 + a.track ? 'track' : 'aim';
            if (age >= 1 + a.track + AIM && live) {
              a.phase = 'lock';
              a.tx = mover.x;
              a.ty = PY;
              const dx = a.tx - a.x;
              const dy = a.ty - a.y;
              const d = Math.hypot(dx, dy);
              a.ax = dx / d;
              a.ay = dy / d;
              a.lockT = time;
            }
          } else if (a.phase === 'lock') {
            if (time - a.lockT >= LOCK) a.phase = 'dash';
          } else {
            a.x += a.ax * DASH * dt;
            a.y += a.ay * DASH * dt;
            if (Math.random() < dt * 60) wisps.burst(a.x, a.y - 16, { count: 1, speed: 30, life: 0.5, size: 5, round: true, drag: 2, colors: ['#e6d4ff', '#c6a8f0', '#ffffff'] });
            if (a.y > H + 80 || a.x < -80 || a.x > W + 80) actors.splice(i, 1);
          }
        } else {
          a.y += a.vy * dt;
          a.x = a.cx + a.A * Math.sin(a.w * (time - a.t0) + a.ph);
          if (a.y > H + 40) actors.splice(i, 1);
        }
      }
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        time = t + dt;
        dist = distAt(time);
        mover.update(dt, dir);
        const x = mover.x;
        hi = (hi + 1) % 120;
        hist[hi] = x;

        while (si < spawns.length && spawns[si].at <= time) spawn(spawns[si++]);
        moveActors(dt, true);

        // ---- caught? ----
        for (const a of actors) {
          const r = a.kind === 'ghost' ? RG : a.kind === 'banshee' ? RB : RBAT;
          if (a.kind === 'banshee' && a.phase !== 'dash') continue;
          const dx = a.x - x;
          const dy = a.y - PY;
          if (dx * dx + dy * dy < (r + RP) ** 2) {
            const why = a.kind === 'ghost' ? 'Caught by a ghost. Boo!' : a.kind === 'banshee' ? 'A banshee swooped right through you.' : 'A bat got tangled in your cap.';
            die(why, a);
            return;
          }
        }

        if (Math.random() < dt * 1.5) leaves.burst(Math.random() * W, -10, { count: 1, speed: 30, life: 6, size: 3, colors: LEAVES, angle: Math.PI / 2, spread: 1 });
        fx.update(dt, 0);
        wisps.update(dt, 0);
        leaves.update(dt, speedAt(time) * 0.4);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        time += dt * 0.25;
        moveActors(dt * 0.25, false);
        fx.update(dt, 0);
        wisps.update(dt, 0);
        leaves.update(dt, 0);
      },

      render(g) {
        const off = dist % H;
        drawSprite(g, ground, W / 2, H / 2 + off);
        drawSprite(g, ground, W / 2, H / 2 + off - H);

        // faded headstones, part of the ground: everything else is drawn over them
        for (const st of graves) {
          const y = PY - (st.s - dist);
          if (y < -60 || y > H + 60) continue;
          const sp = stoneArt[st.kind][st.art];
          drawSprite(g, sp, st.x, y, { size: sp.w * 0.8, alpha: 0.38 });
        }

        // moonlight wash and the kid's warm candy-pail glow on the grass
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, moonGlow, 62, 40, { size: 520, alpha: 0.14 });
        drawSprite(g, warmGlow, mover.x + 10, PY - 2, { size: 150, alpha: 0.32 + 0.04 * Math.sin(clock * 9) });
        g.globalCompositeOperation = 'source-over';

        // shadows of everything in the air, so you can read where they'll touch down
        for (const a of actors) {
          const k = clamp((a.y + 40) / 200, 0, 1);
          const r = a.kind === 'bat' ? 8 : a.kind === 'banshee' ? 15 : 13;
          g.fillStyle = `rgba(6,2,14,${0.4 * k})`;
          g.beginPath();
          g.ellipse(a.x, a.y, r + 3, (r + 3) * 0.38, 0, 0, Math.PI * 2);
          g.fill();
        }

        // banshee aim lines
        for (const a of actors) {
          if (a.kind !== 'banshee' || (a.phase !== 'aim' && a.phase !== 'lock')) continue;
          const locked = a.phase === 'lock';
          const tx = locked ? a.tx : mover.x;
          const ty = locked ? a.ty : PY;
          const k = locked ? 1 : clamp((time - a.t0 - 1 - a.track) / AIM, 0, 1);
          g.setLineDash([8, 7]);
          g.lineDashOffset = -clock * 40;
          g.strokeStyle = locked ? 'rgba(255,60,70,0.95)' : `rgba(255,80,90,${0.25 + 0.4 * k})`;
          g.lineWidth = locked ? 3 : 1.6;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(tx, ty);
          g.stroke();
          g.setLineDash([]);
          g.lineDashOffset = 0;
          g.strokeStyle = locked ? 'rgba(255,60,70,0.9)' : `rgba(255,80,90,${0.4 * k})`;
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(tx, ty, 22, 9, 0, 0, Math.PI * 2);
          g.stroke();
        }

        // ---- everything on the ground and in the air, back to front ----
        const draw = [];
        for (const a of actors) draw.push({ y: a.y, f: () => drawActor(a) });
        draw.push({ y: PY, f: drawKid });
        draw.sort((a, b) => a.y - b.y);
        for (const d of draw) d.f();

        function drawActor(a) {
          const fade = clamp((a.y - TOP) / 70, 0, 1);
          if (a.kind === 'ghost') {
            const bob = Math.sin(clock * 5 + a.ph) * 3;
            const hy = a.y - 26 + bob;
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, mintGlow, a.x, hy, { size: 78, alpha: 0.4 * fade });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, ghostArt[Math.floor(clock * 6 + a.ph) % 2], a.x, hy, { size: 40, rot: -a.vx * 0.0016, alpha: 0.92 * fade });
          } else if (a.kind === 'banshee') {
            const bob = a.phase === 'dash' ? 0 : Math.sin(clock * 4 + a.ph) * 4;
            const hy = a.y - 30 + bob;
            const rot = a.phase === 'dash' || a.phase === 'lock' ? Math.atan2(a.ay, a.ax) - Math.PI / 2 : a.vx * 0.003;
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, violetGlow, a.x, hy, { size: 110, alpha: 0.45 * fade });
            g.globalCompositeOperation = 'source-over';
            const shake = a.phase === 'lock' ? (Math.random() - 0.5) * 3 : 0;
            drawSprite(g, bansheeArt[Math.floor(clock * 5 + a.ph) % 2], a.x + shake, hy, { size: 56, rot, alpha: fade });
            if (a.phase === 'aim' || a.phase === 'lock') {
              const k = a.phase === 'lock' ? 1 : clamp((time - a.t0 - 1 - a.track) / AIM, 0, 1);
              g.globalCompositeOperation = 'lighter';
              for (const sd of [-1, 1]) drawSprite(g, redGlow, a.x + shake + sd * 3.4, hy - 19, { size: 12 + 10 * k, alpha: 0.5 + 0.5 * k });
              g.globalCompositeOperation = 'source-over';
              g.font = '900 16px system-ui, sans-serif';
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = `rgba(255,70,80,${k})`;
              g.fillText('!', a.x, hy - 46);
            }
          } else {
            const hy = a.y - 18;
            drawSprite(g, batArt[Math.floor(clock * 14 + a.ph * 3) % 2], a.x, hy, { size: 34, rot: Math.cos(a.w * (time - a.t0) + a.ph) * 0.35, alpha: fade });
          }
        }

        function drawKid() {
          const x = mover.x;
          if (game.dead) {
            // jumps out of their skin
            const j = Math.sin(clamp(deadT * 4, 0, Math.PI)) * 16;
            drawSprite(g, kid[0], x, PY - 16 - j, { size: 40, rot: Math.sin(deadT * 30) * 0.08 * (1 - clamp(deadT, 0, 1)) });
            return;
          }
          const frame = Math.floor(dist / 22) % 2;
          const lean = mover.lean;
          drawSprite(g, kid[frame], x, PY - 16 - (frame ? 1 : 0), { size: 40, rot: lean * 0.16 });
          const px = x + 15 + lean * 2;
          const py = PY - 12 + Math.sin(dist / 7) * 1.5;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, warmGlow, px, py + 3, { size: 40, alpha: 0.5 + 0.1 * Math.sin(clock * 11) });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, pail, px, py, { size: 17, rot: -lean * 0.3 });
        }

        fx.render(g, false);
        g.globalCompositeOperation = 'lighter';
        wisps.render(g, true);
        g.globalCompositeOperation = 'source-over';

        // ---- fences, bare trees and jack-o'-lanterns along the edges ----
        drawSprite(g, fenceL, 13, H / 2 + off);
        drawSprite(g, fenceL, 13, H / 2 + off - H);
        drawSprite(g, fenceR, W - 13, H / 2 + off);
        drawSprite(g, fenceR, W - 13, H / 2 + off - H);
        for (const d of deco) {
          const y = PY - (d.s - dist);
          if (y < -120 || y > H + 120) continue;
          if (d.jack) {
            const jx = d.side < 0 ? 14 : W - 14;
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, warmGlow, jx, y, { size: 70, alpha: 0.35 + 0.1 * Math.sin(clock * 9 + d.ph) + 0.05 * Math.sin(clock * 23 + d.ph) });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, jack, jx, y, { size: 22 });
          } else {
            g.save();
            g.translate(d.side < 0 ? 0 : W, y);
            g.scale(d.side < 0 ? 1 : -1, 1);
            g.globalAlpha = 0.85;
            g.drawImage(trees[d.tree].canvas, 0, -64, 98, 128);
            g.globalAlpha = 1;
            g.restore();
          }
        }
        leaves.render(g);

        // drifting fog
        for (const f of fogs) {
          const fx2 = ((f.x + clock * f.sp) % (W + 200)) - 100;
          drawSprite(g, fogArt, fx2, f.y, { size: 260 * f.s, alpha: f.a });
        }

        // the fog bank at the top, where they come from, and the moon above it
        drawSprite(g, moon, 62, 62, { size: 50 });
        const shade = g.createLinearGradient(0, 0, 0, 130);
        shade.addColorStop(0, 'rgba(26,16,42,0.85)');
        shade.addColorStop(1, 'rgba(26,16,42,0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W, 130);
        for (let k = 0; k < 4; k++) {
          drawSprite(g, fogArt, ((k * 120 + clock * (8 + k * 3)) % (W + 240)) - 120, 20 + k * 12, { size: 300, alpha: 0.12 });
        }
        // ghosts still up in the fog show through it
        for (const a of actors) {
          if (a.y > 70) continue;
          const k = clamp((a.y - TOP) / 110, 0, 1);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, a.kind === 'banshee' ? violetGlow : mintGlow, a.x, a.y - 22, { size: 60, alpha: 0.35 * k });
          g.globalCompositeOperation = 'source-over';
        }

        drawSprite(g, vignette, W / 2, H / 2);
        if (game.dead && caughtBy) {
          g.font = '900 30px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const a = clamp(deadT * 3, 0, 1);
          g.fillStyle = `rgba(20,10,30,${0.8 * a})`;
          g.fillText('BOO!', mover.x + 2, PY - 72);
          g.fillStyle = `rgba(230,255,246,${a})`;
          g.fillText('BOO!', mover.x, PY - 74);
        }
      },
    };
    return game;
  },
};
