// Champagne Waltz — a waiter in a white mess jacket crosses a candlelit palazzo ballroom in the
// middle of a grand ball, a silver tray of brimming coupes held high, weaving between waltzing
// couples and dinner tables. Nothing stops instantly on the polished marble: every start, stop
// and turn sloshes the champagne, and the slosh rings on like a pendulum, so a jerky dodge (or a
// second one in time with the first wave) slops it over the rim. A footman tops the glasses up
// every 15s, so there's less and less room in them as the dancing gets busier.
// Every layout is built around a hidden, gently curving route, so there is always a way through.

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

const PY = 540; // the waiter's centre
const RP = 11; // the waiter's radius
const TRAY_DX = 15; // where the tray is held, from the waiter's centre
const TRAY_DY = -17;
const MINX = 28;
const MAXX = 332;
const STEP = 1 / 120;

// walking on polished marble: quick to get going, slow to stop, a sharper jolt when you turn back
const VMAX = 240;
const A_GO = 520;
const A_BRAKE = 1000;
const A_COAST = 420;

// the champagne is a damped pendulum driven by the waiter's acceleration (s = 1: over the rim)
const OMEGA = 7; // about 0.9s per slosh
const ZETA = 0.1;
const KS = (0.24 * OMEGA * OMEGA) / A_GO; // holding a direction from rest leans it to ~0.4
const WALL_K = 0.0146; // walking into the wall at full speed: a jolt of ~0.5

// the footman's top-ups: [time, how much room is left in the glass]
const TOPUPS = [
  [15, 0.86],
  [30, 0.75],
  [45, 0.66],
];

const speedAt = (t) => lerp(170, 300, progress(t, 60, 1.2));

const GOWNS = [
  ['#3b6fe0', '#1a347e', '#cfe0ff'], // sapphire
  ['#d2304a', '#6e1022', '#ffd2da'], // ruby
  ['#2fa77a', '#0f5238', '#d2ffe9'], // emerald
  ['#9a54d8', '#4a1f78', '#ecd8ff'], // amethyst
  ['#f0b43c', '#9a6410', '#fff1c8'], // gold
  ['#f07aa8', '#9a2e5c', '#ffe0ee'], // rose
];
const HAIR = ['#2a1810', '#5a3218', '#d6a95c', '#1a1414', '#8a3a1c'];

const FIZZ = ['#fff6d0', '#ffe08a', '#f5c64a', '#ffffff'];
const GLASS = ['#ffffff', '#e8f4ff', '#bcd8f0'];

// ---------- art ----------

function paintFloor(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // ivory marble
    g.fillStyle = '#ece0c8';
    g.fillRect(0, 0, W, H);
    // soft clouding (drawn a tile up and down too, so the scrolling tile has no seam)
    const wrap = (y, draw) => [-H, 0, H].forEach((o) => draw(y + o));
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, W);
      const r = rng.range(30, 80);
      const warm = rng.chance(0.5);
      wrap(rng.range(0, H), (y) => {
        const c = g.createRadialGradient(x, y, 1, x, y, r);
        c.addColorStop(0, warm ? 'rgba(214,190,150,0.35)' : 'rgba(255,250,238,0.45)');
        c.addColorStop(1, 'rgba(214,190,150,0)');
        g.fillStyle = c;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    // black marble diamonds (a diagonal checker; the 40px period divides the tile height)
    const D = 20;
    const diamond = (cx, cy) => {
      g.beginPath();
      g.moveTo(cx, cy - D);
      g.lineTo(cx + D, cy);
      g.lineTo(cx, cy + D);
      g.lineTo(cx - D, cy);
      g.closePath();
    };
    for (let j = -1; j <= H / 40 + 1; j++) {
      for (let i = -1; i <= W / 40 + 1; i++) {
        const cx = i * 40;
        const cy = j * 40;
        const grad = g.createLinearGradient(cx - D, cy - D, cx + D, cy + D);
        grad.addColorStop(0, '#3a2a30');
        grad.addColorStop(0.5, '#1d1418');
        grad.addColorStop(1, '#2c1e24');
        g.fillStyle = grad;
        diamond(cx, cy);
        g.fill();
      }
    }
    // marble veins
    for (let i = 0; i < 26; i++) {
      const x0 = rng.range(0, W);
      const y0 = rng.range(0, H);
      const len = rng.range(40, 120);
      const a = rng.range(-0.6, 0.6) + Math.PI / 2;
      const light = rng.chance(0.5);
      wrap(y0, (y) => {
        g.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(120,90,70,0.2)';
        g.lineWidth = rng.range(0.5, 1.2);
        g.beginPath();
        g.moveTo(x0, y);
        let x = x0;
        let yy = y;
        for (let k = 0; k < 6; k++) {
          x += Math.cos(a) * (len / 6) + rng.range(-5, 5);
          yy += Math.sin(a) * (len / 6);
          g.lineTo(x, yy);
        }
        g.stroke();
      });
    }
    // gold inlay along the diamond edges
    g.strokeStyle = 'rgba(214,168,74,0.55)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (let k = -H; k <= W + H; k += 40) {
      g.moveTo(k, 0);
      g.lineTo(k - H, H);
      g.moveTo(k - H, 0);
      g.lineTo(k, H);
    }
    g.stroke();
    // an inlaid compass-rose medallion in the middle of the tile
    const mx = W / 2;
    const my = H / 2;
    const ring = g.createRadialGradient(mx, my, 10, mx, my, 70);
    ring.addColorStop(0, '#f4ead4');
    ring.addColorStop(0.8, '#e6d6b4');
    ring.addColorStop(1, '#c9a860');
    g.fillStyle = ring;
    g.beginPath();
    g.arc(mx, my, 70, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b8862e';
    g.lineWidth = 3;
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.arc(mx, my, 63, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const long = k % 2 === 0;
      const r1 = long ? 58 : 38;
      const w = long ? 0.16 : 0.2;
      g.fillStyle = k % 4 === 0 ? '#8e1c2c' : long ? '#1d1418' : '#c9963a';
      g.beginPath();
      g.moveTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1);
      g.lineTo(mx + Math.cos(a + w) * 14, my + Math.sin(a + w) * 14);
      g.lineTo(mx, my);
      g.lineTo(mx + Math.cos(a - w) * 14, my + Math.sin(a - w) * 14);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#d8aa48';
    g.beginPath();
    g.arc(mx, my, 6, 0, Math.PI * 2);
    g.fill();
    // a soft polish sheen
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 6; i++) g.fillRect(rng.range(0, W), 0, rng.range(8, 30), H);
  }, 1);
}

// crimson velvet drapes and gilded pilasters down each side of the floor
function paintWall(H, flip) {
  const w = 30;
  return makeSprite(w, H, (g) => {
    g.translate(-w / 2, -H / 2);
    if (flip) {
      g.translate(w, 0);
      g.scale(-1, 1);
    }
    for (let x = 0; x < w; x += 6) {
      const fold = g.createLinearGradient(x, 0, x + 6, 0);
      fold.addColorStop(0, '#4a0a16');
      fold.addColorStop(0.5, '#a2182e');
      fold.addColorStop(1, '#3a0610');
      g.fillStyle = fold;
      g.fillRect(x, 0, 6, H);
    }
    // gold fringe along the floor's edge
    const fr = g.createLinearGradient(w - 6, 0, w, 0);
    fr.addColorStop(0, '#8a5a14');
    fr.addColorStop(0.5, '#f2cc6a');
    fr.addColorStop(1, '#9a6a1c');
    g.fillStyle = fr;
    g.fillRect(w - 5, 0, 5, H);
    g.fillStyle = 'rgba(60,30,0,0.35)';
    for (let y = 0; y < H; y += 4) g.fillRect(w - 5, y, 5, 1);
    // gilded pilasters every 160 (the period divides the tile height)
    for (let y = 40; y < H; y += 160) {
      const pg = g.createLinearGradient(0, 0, w, 0);
      pg.addColorStop(0, '#6a4410');
      pg.addColorStop(0.45, '#f6d681');
      pg.addColorStop(1, '#9a6c1e');
      g.fillStyle = pg;
      g.beginPath();
      g.roundRect(2, y - 20, w - 4, 40, 4);
      g.fill();
      g.strokeStyle = 'rgba(80,40,0,0.5)';
      g.lineWidth = 1;
      g.strokeRect(6, y - 14, w - 12, 28);
      g.fillStyle = 'rgba(255,250,220,0.6)';
      g.fillRect(9, y - 12, 3, 24);
    }
  }, 2);
}

// a waltzing couple seen from above: gentleman on the left, lady (and her gown) on the right
function paintCouple(rng, [gown, gownDark, trim], hair) {
  return makeSprite(64, 64, (g) => {
    // shadow
    g.fillStyle = 'rgba(20,4,10,0.32)';
    g.beginPath();
    g.ellipse(3, 5, 27, 21, 0, 0, Math.PI * 2);
    g.fill();
    // the gown: a flared, scalloped circle with pleats
    const gx = 8;
    const R = 17;
    const gg = g.createRadialGradient(gx - 6, -6, 2, gx, 0, R + 2);
    gg.addColorStop(0, trim);
    gg.addColorStop(0.35, gown);
    gg.addColorStop(1, gownDark);
    g.fillStyle = gg;
    g.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = R + (i % 2 ? -1.3 : 1.1);
      g.lineTo(gx + Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.1;
      g.moveTo(gx + Math.cos(a) * 6, Math.sin(a) * 6);
      g.lineTo(gx + Math.cos(a) * (R - 1), Math.sin(a) * (R - 1));
    }
    g.stroke();
    // lace hem
    g.strokeStyle = trim;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.2;
    g.setLineDash([2, 2]);
    g.beginPath();
    g.arc(gx, 0, R - 1.5, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    // bodice and bare shoulders
    g.fillStyle = gownDark;
    g.beginPath();
    g.ellipse(gx + 1, 0, 5, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f1c9a8';
    g.beginPath();
    g.ellipse(gx - 1, 0, 3, 6.5, 0, 0, Math.PI * 2);
    g.fill();
    // her head: an updo with a bun and a jewelled comb
    g.fillStyle = hair;
    g.beginPath();
    g.arc(gx + 0.5, 0, 3.8, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(gx + 3.6, 0.5, 2.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.arc(gx - 0.5, -1.5, 1.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffe9a0';
    g.fillRect(gx + 2.2, -2.4, 1.2, 4.8);
    // his tails, sweeping behind him
    g.fillStyle = '#0c0a10';
    g.beginPath();
    g.moveTo(-10, -5);
    g.quadraticCurveTo(-19, -4, -21, -1);
    g.lineTo(-15, 0);
    g.lineTo(-21, 1);
    g.quadraticCurveTo(-19, 4, -10, 5);
    g.closePath();
    g.fill();
    // his shoulders in a black tailcoat
    const cg = g.createLinearGradient(-14, -10, -2, 10);
    cg.addColorStop(0, '#3a3644');
    cg.addColorStop(0.5, '#15121a');
    cg.addColorStop(1, '#050408');
    g.fillStyle = cg;
    g.beginPath();
    g.ellipse(-8, 0, 6, 10.5, 0, 0, Math.PI * 2);
    g.fill();
    // his arm round her back, hers on his shoulder
    g.strokeStyle = '#16131c';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-7, -9);
    g.quadraticCurveTo(0, -12, gx + 2, -6);
    g.stroke();
    g.strokeStyle = '#f1c9a8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(gx - 2, -5);
    g.quadraticCurveTo(0, -9, -6, -7);
    g.stroke();
    // joined hands held out to the side, in white gloves
    g.strokeStyle = '#16131c';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-7, 9);
    g.lineTo(-1, 14);
    g.stroke();
    g.strokeStyle = '#f1c9a8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(gx - 2, 5);
    g.lineTo(1, 14);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 14.5, 2.3, 0, Math.PI * 2);
    g.fill();
    // white collar and his head
    g.fillStyle = '#f4f0ea';
    g.beginPath();
    g.ellipse(-5, 0, 1.6, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = rng.pick(['#1a1210', '#3a2414', '#6a6a70']);
    g.beginPath();
    g.arc(-8, 0, 4.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.ellipse(-9, -1.5, 2, 1.2, 0.5, 0, Math.PI * 2);
    g.fill();
  });
}

// a round dinner table: white cloth, gilt plates, a rose centrepiece and a candle
function paintTable(rng) {
  return makeSprite(48, 48, (g) => {
    g.fillStyle = 'rgba(20,4,10,0.3)';
    g.beginPath();
    g.arc(3, 4, 21, 0, Math.PI * 2);
    g.fill();
    // the hem of the cloth, gathered in swags
    g.fillStyle = '#d6cbb6';
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = 19.5 + (i % 2 ? -1.2 : 0.6);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    const cg = g.createRadialGradient(-6, -6, 2, 0, 0, 18);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.7, '#f3ede2');
    cg.addColorStop(1, '#ddd2bf');
    g.fillStyle = cg;
    g.beginPath();
    g.arc(0, 0, 17, 0, Math.PI * 2);
    g.fill();
    // place settings
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 12;
      const y = Math.sin(a) * 12;
      g.fillStyle = '#fffdf8';
      g.beginPath();
      g.arc(x, y, 3.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c99a3e';
      g.lineWidth = 0.7;
      g.stroke();
      g.fillStyle = 'rgba(200,230,255,0.8)';
      g.beginPath();
      g.arc(Math.cos(a + 0.35) * 8, Math.sin(a + 0.35) * 8, 1.1, 0, Math.PI * 2);
      g.fill();
    }
    // roses
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * 4.5;
      const y = Math.sin(a) * 4.5;
      g.fillStyle = '#2a5a2a';
      g.beginPath();
      g.ellipse(x * 1.3, y * 1.3, 2, 1.1, a, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rng.pick(['#c41f3a', '#a5142c', '#e0405a']);
      g.beginPath();
      g.arc(x, y, 2.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(80,0,16,0.6)';
      g.beginPath();
      g.arc(x + 0.3, y + 0.3, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // the candle
    g.fillStyle = '#fff6dc';
    g.beginPath();
    g.arc(0, 0, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd36a';
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
  });
}

// the waiter seen from above, walking up the room: white mess jacket, gold epaulettes, his
// right arm raised to the tray (the tray itself is drawn live, champagne and all)
function paintWaiter() {
  return makeSprite(44, 44, (g) => {
    g.fillStyle = 'rgba(20,4,10,0.35)';
    g.beginPath();
    g.ellipse(2, 5, 15, 11, 0, 0, Math.PI * 2);
    g.fill();
    // black trousers stepping out under the jacket
    g.fillStyle = '#121016';
    g.beginPath();
    g.ellipse(-4, 8, 3, 4, 0, 0, Math.PI * 2);
    g.ellipse(4, 6, 3, 4, 0, 0, Math.PI * 2);
    g.fill();
    // left arm folded behind the back with a napkin
    g.fillStyle = '#e8e2d6';
    g.beginPath();
    g.ellipse(-11, 3, 3, 4.5, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-9, 4, 9, 4, 1.5);
    g.fill();
    // right arm raised to the tray
    g.strokeStyle = '#efe9de';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(9, -1);
    g.quadraticCurveTo(14, -6, 12, -13);
    g.stroke();
    g.strokeStyle = 'rgba(150,140,125,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(11, 0);
    g.quadraticCurveTo(16, -6, 14, -12);
    g.stroke();
    // the jacket
    const jg = g.createLinearGradient(-12, -8, 12, 8);
    jg.addColorStop(0, '#ffffff');
    jg.addColorStop(0.55, '#ece6da');
    jg.addColorStop(1, '#b9b0a0');
    g.fillStyle = jg;
    g.beginPath();
    g.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,8,18,0.85)';
    g.lineWidth = 1.3;
    g.stroke();
    // epaulettes
    for (const sx of [-1, 1]) {
      g.fillStyle = '#e2b347';
      g.beginPath();
      g.ellipse(sx * 8.5, -1, 3, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff1b8';
      g.fillRect(sx * 8.5 - 1.5, -2, 3, 0.8);
    }
    // slicked black hair with a neat parting
    const hg = g.createRadialGradient(-1.5, -2.5, 0.5, 0, 0, 5.5);
    hg.addColorStop(0, '#5a5060');
    hg.addColorStop(0.5, '#1a1620');
    hg.addColorStop(1, '#08060a');
    g.fillStyle = hg;
    g.beginPath();
    g.arc(0, -1, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-1.5, -5.5);
    g.lineTo(-1.5, 2.5);
    g.stroke();
  });
}

function paintTray() {
  return makeSprite(28, 28, (g) => {
    g.fillStyle = 'rgba(20,4,10,0.3)';
    g.beginPath();
    g.arc(2, 3, 12, 0, Math.PI * 2);
    g.fill();
    const tg = g.createRadialGradient(-4, -4, 1, 0, 0, 12);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.45, '#d8dce4');
    tg.addColorStop(1, '#8a909c');
    g.fillStyle = tg;
    g.beginPath();
    g.arc(0, 0, 11.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6a707c';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.arc(0, 0, 9.8, Math.PI * 0.9, Math.PI * 1.6);
    g.stroke();
  });
}

// the glow and crystal drops of a chandelier, seen from below as a pool of light on the floor
function paintSparkle() {
  return makeSprite(12, 12, (g) => {
    g.fillStyle = '#fff8e0';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(1, -1);
    g.lineTo(6, 0);
    g.lineTo(1, 1);
    g.lineTo(0, 6);
    g.lineTo(-1, 1);
    g.lineTo(-6, 0);
    g.lineTo(-1, -1);
    g.closePath();
    g.fill();
  }, 2);
}

// ---------- game ----------

export default {
  id: 'champagne',
  title: 'Champagne Waltz',
  emoji: '🥂',
  tagline: 'Dodge the dancers, but move smoothly: jerky turns spill the champagne.',
  colors: { bg: '#2a0b14', fg: '#f8e9c8', accent: '#e8b84a' },

  // A symphonic electro waltz in 3/4 at 168 BPM in D minor, like a masked ball turned rave:
  // a kick and an "oom-pah-pah" of bass and string stabs from the first bar, then a sweeping
  // violin tune and timpani, a harp arpeggio, brushes and brass, and a three-on-the-floor finale
  // with the tune doubled an octave down. One bar per cycle: 56 bars = 60s.
  music: {
    cps: 56 / 60,
    setup: `
      const kick = note("d2 ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
      const kick3 = note("d2 d2 d2").s("sine").decay(0.18).sustain(0).gain("[0.8 0.55 0.62]")
      const chords = "<[f3,a3,d4] [g3,as3,d4] [g3,c4,e4] [f3,a3,c4] [f3,as3,d4] [g3,as3,d4] [e3,a3,cs4] [e3,g3,cs4]>"
      const roots = "<d2 g2 c3 f2 as2 g2 a2 a2>"
      const bass = note(roots).struct("x ~ ~").s("sawtooth").decay(0.4).sustain(0.2).release(0.1)
        .lpf(saw.range(450, 1300).slow(56)).lpq(3).gain(0.42)
      const bass2 = note(roots).struct("x ~ ~ ~ x x").s("sawtooth").decay(0.3).sustain(0.2).release(0.08)
        .lpf(saw.range(450, 1300).slow(56)).lpq(3).gain(0.4)
      const pah = note(chords).struct("~ x x").s("sawtooth").decay(0.16).sustain(0).lpf(1700).gain(0.075)
      const hats = s("~ white white").decay(0.03).sustain(0).hpf(7000).gain(0.04)
      const hats6 = s("white*6").decay(0.025).sustain(0).hpf(7000).gain("[0.05 0.025 0.04 0.025 0.04 0.025]")
      const snare = s("~ pink pink").decay(0.09).sustain(0).hpf(1200).lpf(6000).gain("[0 0.13 0.09]").room(0.25)
      const timp = note("<d2 d2 g2 g2 as2 g2 a2 [a2 a2 a2 a2 a2 a2]>").s("sine").decay(0.4).sustain(0).gain(0.32)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.6)
        .lpf(saw.range(500, 2000).slow(56)).gain(0.055).room(0.5).roomsize(4)
      const tune = "<[a4@4 d5 e5] [f5@4 e5 d5] [e5@4 c5 d5] [c5@2 a4@4] [d5@4 f5 d5] [as4@4 d5 as4] [a4@2 cs5@2 e5@2] [g5@2 f5@2 e5@2]>"
      const violin = note(tune).s("sawtooth").attack(0.03).decay(0.3).sustain(0.55).release(0.15).lpf(2400)
        .vib(5.5).vibmod(0.12).gain(0.08).room(0.4).delay(0.18).delaytime(0.357).delayfeedback(0.25)
      const cello = note(tune).add(note(-12)).s("sawtooth").attack(0.03).decay(0.3).sustain(0.5).release(0.15)
        .lpf(1400).gain(0.055)
      const harp = note("<[d4 f4 a4 d5 a4 f4] [g4 as4 d5 g5 d5 as4] [c4 e4 g4 c5 g4 e4] [f4 a4 c5 f5 c5 a4] [as3 d4 f4 as4 f4 d4] [g3 as3 d4 g4 d4 as3] [a3 cs4 e4 a4 e4 cs4] [a3 cs4 e4 g4 e4 cs4]>")
        .s("triangle").decay(0.12).sustain(0).lpf(3200).gain(0.09)
        .delay(0.2).delaytime(0.179).delayfeedback(0.3).pan(sine.range(0.3, 0.7).slow(3))
      const bells = note("<[d6 a5 f5 a5 d6 f6] [g6 d6 as5 d6 g6 d6] [e6 c6 g5 c6 e6 g6] [f6 c6 a5 c6 f6 a5] [f6 d6 as5 d6 f6 as5] [g6 d6 as5 d6 g6 as5] [e6 cs6 a5 cs6 e6 a5] [g6 e6 cs6 e6 g6 a6]>")
        .s("sine").decay(0.08).sustain(0).gain(0.04).delay(0.25).delaytime(0.268).delayfeedback(0.3)
      const brass = note("<[d3,a3,d4] ~ [c3,g3,c4] [c3,f3,a3] [as2,f3,as3] ~ [a2,e3,a3] [a2,e3,cs4,g4]>")
        .struct("x ~ ~").s("sawtooth").attack(0.01).decay(0.3).sustain(0.2).release(0.1).lpf(1800).gain(0.07)
      const wash = s("pink").attack(0.4).release(0.4).hpf(2500).lpf(7000).gain(0.025)
    `,
    song: `arrange(
      [8, stack(kick, bass, pah, hats)],
      [16, stack(kick, bass, pah, hats, timp, pad, violin)],
      [16, stack(kick, snare, bass, pah, hats6, timp, pad, violin, harp, brass)],
      [16, stack(kick3, snare, bass2, pah, hats6, timp, pad, violin, cello, harp, bells, brass, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const routeRng = rng.fork('route');
    const plan = rng.fork('plan');

    const floor = paintFloor(W, H, art);
    const wallL = paintWall(H, false);
    const wallR = paintWall(H, true);
    const couples = GOWNS.map((c, i) => paintCouple(art, c, HAIR[i % HAIR.length]));
    const tables = [paintTable(art), paintTable(art)];
    const waiter = paintWaiter();
    const tray = paintTray();
    const sparkle = paintSparkle();
    const candle = glowSprite('rgba(255,190,90,1)', 24);
    const pool = glowSprite('rgba(255,200,120,1)', 90);
    const goldGlow = glowSprite('rgba(255,215,120,1)', 30);
    const redGlow = glowSprite('rgba(255,60,70,1)', 30);
    const vignette = vignetteSprite(W, H, 0.6, '30,4,12');

    // how far the floor has scrolled: depends only on time, so layouts can be planned ahead
    const distTable = [0];
    for (let i = 1; i <= 66 * 120; i++) distTable.push(distTable[i - 1] + speedAt((i - 0.5) * STEP) * STEP);
    const distAt = (t) => {
      const f = clamp(t / STEP, 0, distTable.length - 1);
      const i = Math.floor(f);
      return lerp(distTable[i], distTable[Math.min(i + 1, distTable.length - 1)], f - i);
    };

    // ---- the hidden route: a gently curving line whose sideways speed only changes a little at a time ----
    const route = [{ t: 0, x: W / 2 }];
    let routeV = 0;
    function extendRoute(until) {
      while (route[route.length - 1].t < until) {
        const last = route[route.length - 1];
        const p = progress(last.t, 60, 1.3);
        const dT = last.t < 2 ? 2.2 : routeRng.range(0.55, 0.9);
        const lim = lerp(65, 112, p);
        const dv = lerp(60, 95, p);
        let v = routeV + routeRng.range(-1, 1) * dv;
        if (last.x < 95) v += dv * 0.7;
        if (last.x > W - 95) v -= dv * 0.7;
        routeV = clamp(v, -lim, lim);
        if (last.t < 2) routeV = 0;
        const x = clamp(last.x + routeV * dT, 50, W - 50);
        routeV = (x - last.x) / dT;
        route.push({ t: last.t + dT, x });
      }
    }
    let ri = 0;
    function routeAt(t) {
      if (t <= 0) return route[0].x;
      while (ri > 0 && route[ri].t > t) ri--;
      while (ri < route.length - 2 && route[ri + 1].t < t) ri++;
      const a = route[ri];
      const b = route[ri + 1];
      return lerp(a.x, b.x, clamp((t - a.t) / (b.t - a.t), 0, 1));
    }

    // ---- dancers and tables. x, s (distance up the room) at time t ----
    const obstacles = [];
    function posOf(o, t) {
      let x = o.x0 + o.vx * (t - o.T);
      let s = o.s0;
      if (o.orbit) {
        const a = o.w * t + o.ph;
        x += o.ro * Math.cos(a);
        s += o.ro * Math.sin(a);
      }
      return { x, s };
    }
    // keeps clear of the route by a margin around the moment the obstacle passes the waiter
    function clearOfRoute(o, margin) {
      const R = o.r + RP + margin;
      for (let tt = o.T - 1.2; tt <= o.T + 1.2; tt += 1 / 40) {
        const p = posOf(o, tt);
        const dy = p.s - distAt(tt);
        if (Math.abs(dy) > R) continue;
        const dx = p.x - routeAt(tt);
        if (dx * dx + dy * dy < R * R) return false;
      }
      return true;
    }
    function clearOfOthers(o) {
      for (const q of obstacles) {
        if (Math.abs(q.s0 - o.s0) > 160) continue;
        for (let tt = o.T - 4; tt <= o.T + 1; tt += 0.05) {
          const a = posOf(o, tt);
          const b = posOf(q, tt);
          const R = o.r + q.r + 3;
          if ((a.x - b.x) ** 2 + (a.s - b.s) ** 2 < R * R) return false;
        }
      }
      return true;
    }
    function inRoom(o) {
      for (const tt of [o.T - 4, o.T + 1.5]) {
        const x = posOf(o, tt).x;
        if (x < MINX + 10 || x > MAXX - 10) return false;
      }
      return true;
    }

    let lastT = 0;
    let lastRow = 0;
    function place(until) {
      while (lastT < until) {
        const first = lastT === 0;
        const p = progress(lastT, 60, 1.25);
        const T = first ? 3 : lastT + lerp(0.85, 0.42, p) * plan.range(0.85, 1.15);
        extendRoute(T + 3);
        const s0 = distAt(T);
        const margin = lerp(16, 10, p);
        if (T > 7 && T - lastRow > 2.4 && plan.chance(lerp(0.18, 0.32, p))) {
          // a row of dinner tables across the floor, with one way through
          lastRow = T;
          const gap = lerp(64, 46, p);
          const rx = routeAt(T);
          const off = plan.range(0, 20);
          for (let x = MINX + 6 + off; x <= MAXX - 4; x += 44) {
            const o = { kind: 'table', r: 17, x0: x + plan.range(-3, 3), vx: 0, s0: s0 + plan.range(-6, 6), T, art: plan.int(0, 1), spin: plan.range(0, 6.28) };
            if (Math.abs(o.x0 - rx) < gap + 17) continue;
            if (!clearOfRoute(o, margin) || !clearOfOthers(o)) continue;
            obstacles.push(o);
          }
        } else {
          const n = Math.max(1, Math.round(lerp(1.1, 2.4, p) + plan.range(-0.45, 0.45)));
          for (let k = 0, tries = 0; k < n && tries < 14; tries++) {
            let o;
            if (T > 24 && plan.chance(lerp(0.25, 0.45, p))) {
              // a couple twirling round and round a gilt ring on the floor
              o = {
                kind: 'orbit', r: 21, x0: plan.range(70, W - 70), vx: 0, s0: s0 + plan.range(-20, 20), T,
                orbit: true, ro: plan.range(26, 36), w: (plan.chance(0.5) ? 1 : -1) * plan.range(1.5, lerp(2, 2.8, p)), ph: plan.range(0, 6.28),
              };
            } else {
              const drift = lerp(14, T > 36 ? 70 : 52, p);
              o = { kind: 'couple', r: 22, x0: plan.range(40, W - 40), vx: plan.range(-1, 1) * drift, s0: s0 + plan.range(-25, 25), T };
            }
            o.art = plan.int(0, couples.length - 1);
            o.spin = plan.range(0, 6.28);
            o.spinV = (plan.chance(0.75) ? 1 : -1) * plan.range(2.2, 3.2);
            if (!inRoom(o) || !clearOfRoute(o, margin) || !clearOfOthers(o)) continue;
            obstacles.push(o);
            k++;
          }
        }
        lastT = T;
      }
    }

    extendRoute(8);
    place(5);

    // ---- state ----
    const fx = createParticles();
    const glints = createParticles();
    const motes = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.4, sp: 8 + Math.random() * 18, ph: Math.random() * 6.28 }));
    const popups = [];

    let x = W / 2;
    let v = 0;
    let s = 0; // the slosh
    let sv = 0;
    let thr = 1; // how far it can slosh before it goes over the rim
    let topIdx = 0;
    let pourT = 0; // a pour animation after each top-up
    let jolt = 0; // remembers a recent bump into the wall, for the death message
    let dist = 0;
    let time = 0;
    let clock = 0;
    let walk = 0;
    let deadT = 0;
    let cause = '';
    let puddle = 0;

    function die(reason, kind) {
      game.dead = true;
      game.deathReason = reason;
      cause = kind;
      const tx = x + TRAY_DX;
      const ty = PY + TRAY_DY;
      if (kind === 'spill') {
        const ang = s > 0 ? 0 : Math.PI;
        fx.burst(tx, ty, { count: 70, speed: 260, life: 1.1, size: 3.5, round: true, drag: 2.2, angle: ang, spread: 1.6, colors: FIZZ });
      } else {
        fx.burst(tx, ty, { count: 60, speed: 240, life: 1.1, size: 3.5, round: true, drag: 2, colors: FIZZ });
        fx.burst(tx, ty, { count: 26, speed: 220, life: 1, size: 3, drag: 1.6, colors: GLASS });
      }
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        time = t + dt;
        extendRoute(time + 7);
        place(time + 4.5);
        dist = distAt(time);

        // ---- walking on marble ----
        const vPrev = v;
        if (dir !== 0) {
          const acc = v * dir < 0 ? A_BRAKE : A_GO;
          const target = dir * VMAX;
          v += Math.sign(target - v) * Math.min(Math.abs(target - v), acc * dt);
        } else {
          v -= Math.sign(v) * Math.min(Math.abs(v), A_COAST * dt);
        }
        const a = (v - vPrev) / dt;
        x += v * dt;
        let bump = 0;
        if (x < MINX) {
          x = MINX;
          bump = v;
          v = 0;
        } else if (x > MAXX) {
          x = MAXX;
          bump = v;
          v = 0;
        }
        walk += Math.abs(v) * dt * 0.05 + dt * 2.2;

        // ---- the champagne sloshes ----
        sv += (-OMEGA * OMEGA * s - 2 * ZETA * OMEGA * sv - KS * a) * dt;
        if (bump) {
          sv += bump * WALL_K;
          if (Math.abs(bump) > 60) jolt = 1;
        }
        s += sv * dt;
        jolt = Math.max(0, jolt - dt);
        if (time < 2 && Math.abs(s) > thr * 0.95) {
          // nothing goes over the rim in the first two seconds: it just laps at it
          s = Math.sign(s) * thr * 0.95;
          sv *= -0.3;
        }

        // ---- the footman tops the glasses up (only once the champagne has settled a little) ----
        if (topIdx < TOPUPS.length && time >= TOPUPS[topIdx][0] && Math.abs(s) < TOPUPS[topIdx][1] * 0.75) {
          thr = TOPUPS[topIdx][1];
          topIdx++;
          pourT = 1;
          popups.push({ text: 'TOPPED UP!', x: clamp(x, 70, W - 70), y: PY - 52, life: 1.4 });
          fx.burst(x + TRAY_DX, PY + TRAY_DY, { count: 14, speed: 60, life: 0.7, size: 2.4, round: true, drag: 3, angle: -Math.PI / 2, spread: 1.4, colors: FIZZ });
        }
        pourT = Math.max(0, pourT - dt);

        // ---- bumping into anyone or anything ----
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          const p = posOf(o, time);
          const y = PY - (p.s - dist);
          if (y > H + 80) {
            obstacles.splice(i, 1);
            continue;
          }
          const R = o.r + RP;
          if ((p.x - x) ** 2 + (y - PY) ** 2 < R * R) {
            const what = o.kind === 'table' ? 'Walked into a dinner table.' : o.kind === 'orbit' ? 'Swept up by a twirling couple.' : 'Bumped into a waltzing couple.';
            die(`${what} The tray went flying.`, 'bump');
            return;
          }
        }

        // ---- over the rim ----
        const r = Math.abs(s) / thr;
        if (r >= 1) {
          die(jolt > 0 ? 'Bumped the wall and slopped the champagne.' : 'Turned too sharply: the champagne slopped over the rim.', 'spill');
          return;
        }
        if (r > 0.72 && Math.random() < (r - 0.72) * 2.4) {
          // a few drops lapping over the edge as a warning
          fx.burst(x + TRAY_DX + Math.sign(-s) * 6, PY + TRAY_DY, { count: 1, speed: 70, life: 0.5, size: 2.2, round: true, drag: 2, angle: s > 0 ? 0.3 : Math.PI - 0.3, spread: 0.8, colors: FIZZ });
        }
        if (Math.random() < dt * 6) {
          glints.burst(Math.random() * W, Math.random() * H, { count: 1, speed: 4, life: 0.9, size: 1, colors: ['#fff1c0'] });
        }

        fx.update(dt, speedAt(t) * 0.3);
        glints.update(dt, speedAt(t));
        for (let i = popups.length - 1; i >= 0; i--) {
          popups[i].life -= dt;
          popups[i].y -= 18 * dt;
          if (popups[i].life <= 0) popups.splice(i, 1);
        }
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        puddle = Math.min(1, puddle + dt * 1.6);
        sv += (-OMEGA * OMEGA * s - 2 * ZETA * OMEGA * sv) * dt;
        s += sv * dt;
        fx.update(dt, 0);
        glints.update(dt, 0);
        for (let i = popups.length - 1; i >= 0; i--) {
          popups[i].life -= dt;
          if (popups[i].life <= 0) popups.splice(i, 1);
        }
      },

      render(g) {
        // ---- the ballroom floor ----
        const off = dist % H;
        drawSprite(g, floor, W / 2, H / 2 + off);
        drawSprite(g, floor, W / 2, H / 2 + off - H);

        // pools of chandelier light on the marble (and their crystal glints)
        g.globalCompositeOperation = 'lighter';
        const span = 300;
        const base = Math.floor(dist / span);
        for (let k = base - 1; k <= base + 3; k++) {
          const y = PY - (k * span - dist) - 200;
          if (y < -200 || y > H + 200) continue;
          const cx = k % 2 ? W * 0.3 : W * 0.7;
          const flick = 0.2 + 0.03 * Math.sin(clock * 7 + k) + 0.02 * Math.sin(clock * 13 + k * 2);
          drawSprite(g, pool, cx, y, { size: 300, alpha: flick });
        }
        g.globalCompositeOperation = 'source-over';

        // ---- gilt rings under the twirling couples, drift marks in front of the others ----
        for (const o of obstacles) {
          const y0 = PY - (o.s0 - dist);
          if (y0 < -80 || y0 > H + 60) continue;
          if (o.orbit) {
            const cx = o.x0;
            g.fillStyle = 'rgba(255,90,90,0.12)';
            g.beginPath();
            g.arc(cx, y0, o.ro + o.r, 0, Math.PI * 2);
            g.fill();
            g.lineDashOffset = -clock * 12 * Math.sign(o.w);
            g.setLineDash([6, 5]);
            for (const [c, lw] of [['rgba(40,8,18,0.6)', 4], ['rgba(240,190,80,0.95)', 2]]) {
              g.strokeStyle = c;
              g.lineWidth = lw;
              g.beginPath();
              g.arc(cx, y0, o.ro, 0, Math.PI * 2);
              g.stroke();
            }
            g.setLineDash([]);
            g.lineDashOffset = 0;
          } else if (o.kind === 'couple' && Math.abs(o.vx) > 18) {
            const p = posOf(o, time);
            const y = PY - (p.s - dist);
            const d = Math.sign(o.vx);
            const k = clamp((Math.abs(o.vx) - 18) / 40, 0.25, 1);
            g.lineCap = 'round';
            for (const [c, lw] of [[`rgba(40,8,18,${0.55 * k})`, 4.2], [`rgba(245,195,80,${0.95 * k})`, 2.2]]) {
              g.strokeStyle = c;
              g.lineWidth = lw;
              for (let n = 0; n < 2; n++) {
                const ax = p.x + d * (o.r + 8 + n * 7 + ((clock * 14) % 7));
                g.beginPath();
                g.moveTo(ax - d * 4, y - 5);
                g.lineTo(ax, y);
                g.lineTo(ax - d * 4, y + 5);
                g.stroke();
              }
            }
          }
        }

        // ---- tables and dancers ----
        for (const o of obstacles) {
          const p = posOf(o, time);
          const y = PY - (p.s - dist);
          if (y < -50 || y > H + 50) continue;
          if (o.kind === 'table') {
            drawSprite(g, tables[o.art], p.x, y, { size: 48, rot: o.spin });
          } else {
            const rot = o.spin + o.spinV * clock;
            drawSprite(g, couples[o.art], p.x, y, { size: 64, rot });
          }
        }
        g.globalCompositeOperation = 'lighter';
        for (const o of obstacles) {
          if (o.kind !== 'table') continue;
          const p = posOf(o, time);
          const y = PY - (p.s - dist);
          if (y < -50 || y > H + 50) continue;
          drawSprite(g, candle, p.x, y, { size: 34 + Math.sin(clock * 9 + o.x0) * 3, alpha: 0.75 });
        }
        g.globalCompositeOperation = 'source-over';

        // ---- the waiter ----
        const r = clamp(s / thr, -1.3, 1.3);
        const danger = Math.abs(r);
        if (cause === 'spill' && puddle > 0) {
          g.fillStyle = `rgba(245,200,80,${0.35 * puddle})`;
          g.beginPath();
          g.ellipse(x + TRAY_DX + Math.sign(s) * 14, PY - 4, 22 * puddle, 10 * puddle, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, goldGlow, x, PY, { size: 84, alpha: 0.45 });
        if (danger > 0.6 && !game.dead) drawSprite(g, redGlow, x + TRAY_DX, PY + TRAY_DY, { size: 60, alpha: (danger - 0.6) * 1.6 });
        g.globalCompositeOperation = 'source-over';
        const lean = v / VMAX;
        const bob = game.dead ? 0 : Math.sin(walk * 2) * 0.06;
        drawSprite(g, waiter, x, PY, { size: 54, rot: lean * 0.12 + bob });
        if (!(game.dead && cause === 'bump')) {
          const tx = x + TRAY_DX + lean * 1.5;
          const ty = PY + TRAY_DY;
          drawSprite(g, tray, tx, ty, { size: 33 });
          // three brimming coupes; the champagne in each leans with the slosh
          const sh = r * 1.8;
          for (const [gx, gy] of [[-4.9, -3], [4.9, -3], [0, 4.7]]) {
            const cx = tx + gx;
            const cy = ty + gy;
            g.fillStyle = 'rgba(230,244,255,0.85)';
            g.beginPath();
            g.arc(cx, cy, 4.2, 0, Math.PI * 2);
            g.fill();
            g.save();
            g.beginPath();
            g.arc(cx, cy, 3.5, 0, Math.PI * 2);
            g.clip();
            g.fillStyle = danger > 0.75 ? '#ffcf4a' : '#f2c24c';
            g.beginPath();
            g.arc(cx - sh, cy, 3.4 * (0.82 + 0.18 / thr), 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,250,220,0.85)';
            g.beginPath();
            g.arc(cx - sh - 1, cy - 1, 1, 0, Math.PI * 2);
            g.fill();
            g.restore();
            g.strokeStyle = 'rgba(160,190,220,0.9)';
            g.lineWidth = 0.7;
            g.beginPath();
            g.arc(cx, cy, 4.2, 0, Math.PI * 2);
            g.stroke();
          }
        }

        // ---- the slosh gauge: a coupe seen side-on under the waiter ----
        if (!game.dead) {
          const gx = clamp(x, 34, W - 34);
          const gy = 594;
          const half = 21;
          const bowl = () => {
            g.beginPath();
            g.moveTo(gx - half, gy);
            g.bezierCurveTo(gx - half, gy + 13, gx + half, gy + 13, gx + half, gy);
            g.closePath();
          };
          g.fillStyle = 'rgba(30,6,14,0.45)';
          g.beginPath();
          g.ellipse(gx, gy + 12, 30, 22, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(220,235,255,0.18)';
          bowl();
          g.fill();
          // the champagne: its surface reaches the rim exactly when it spills
          const depth = 7.5 * thr;
          const e = -r * depth;
          g.save();
          bowl();
          g.clip();
          const lg = g.createLinearGradient(0, gy, 0, gy + 12);
          lg.addColorStop(0, '#ffe58a');
          lg.addColorStop(1, '#d99a1c');
          g.fillStyle = lg;
          g.beginPath();
          g.moveTo(gx - half - 4, gy + depth - (e * (half + 4)) / half);
          g.lineTo(gx + half + 4, gy + depth + (e * (half + 4)) / half);
          g.lineTo(gx + half + 4, gy + 16);
          g.lineTo(gx - half - 4, gy + 16);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(255,255,240,0.8)';
          for (let i = 0; i < 6; i++) {
            const bx = gx - 12 + i * 5;
            const by = gy + 11 - ((clock * 9 + i * 2.3) % 7);
            g.fillRect(bx, by, 1, 1);
          }
          g.restore();
          // the glass
          const hot = danger > 0.7;
          const pulse = hot ? 0.6 + 0.4 * Math.sin(clock * 22) : 1;
          g.strokeStyle = hot ? `rgba(255,${Math.round(110 * pulse)},90,0.95)` : 'rgba(240,248,255,0.9)';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(gx - half, gy);
          g.bezierCurveTo(gx - half, gy + 13, gx + half, gy + 13, gx + half, gy);
          g.stroke();
          g.beginPath();
          g.moveTo(gx, gy + 9.8);
          g.lineTo(gx, gy + 24);
          g.stroke();
          g.beginPath();
          g.ellipse(gx, gy + 25, 8, 2, 0, 0, Math.PI * 2);
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(gx - half + 3, gy + 2);
          g.quadraticCurveTo(gx - half + 5, gy + 7, gx - half + 10, gy + 8.5);
          g.stroke();
          // the rim marks: red when the champagne is close to them
          for (const sd of [-1, 1]) {
            const near = clamp(sd * -r, 0, 1);
            g.fillStyle = near > 0.7 ? '#ff4a4a' : 'rgba(255,240,200,0.9)';
            g.beginPath();
            g.arc(gx + sd * half, gy, 1.8 + near * 1.2, 0, Math.PI * 2);
            g.fill();
          }
          if (pourT > 0) {
            g.strokeStyle = `rgba(255,220,110,${pourT})`;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(gx + 3, gy - 22);
            g.quadraticCurveTo(gx + 2, gy - 10, gx, gy + depth);
            g.stroke();
          }
          // a bottle hovering over the glass just before a top-up
          if (topIdx < TOPUPS.length) {
            const until = TOPUPS[topIdx][0] - time;
            if (until < 1.8) {
              const k = clamp(1 - until / 1.8, 0, 1);
              g.globalAlpha = Math.min(1, k * 2);
              g.save();
              g.translate(gx + 12, gy - 20);
              g.rotate(-0.9 * k);
              g.fillStyle = '#1f4a2a';
              g.beginPath();
              g.roundRect(-4, -14, 8, 16, 3);
              g.fill();
              g.fillStyle = '#e8b84a';
              g.fillRect(-2, -20, 4, 7);
              g.fillStyle = '#f6efe0';
              g.fillRect(-4, -8, 8, 5);
              g.restore();
              g.globalAlpha = 1;
            }
          }
        }

        fx.render(g, false);

        // ---- velvet drapes and pilasters at the edges of the floor ----
        drawSprite(g, wallL, 15 - 2, H / 2 + off);
        drawSprite(g, wallL, 15 - 2, H / 2 + off - H);
        drawSprite(g, wallR, W - 15 + 2, H / 2 + off);
        drawSprite(g, wallR, W - 15 + 2, H / 2 + off - H);

        // floating gold dust and crystal glints from the chandeliers above
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(255,220,150,0.5)';
        for (const m of motes) {
          const y = (m.y + clock * m.sp + dist * 0.25) % (H + 10);
          const mx = (m.x + Math.sin(clock * 0.7 + m.ph) * 12 + W) % W;
          g.beginPath();
          g.arc(mx, y, m.r, 0, Math.PI * 2);
          g.fill();
        }
        for (const p of glints.list) {
          drawSprite(g, sparkle, p.x, p.y, { size: 8 + p.size * 4, alpha: Math.sin((p.life / p.max) * Math.PI) * 0.8 });
        }
        g.globalCompositeOperation = 'source-over';

        // the far end of the ballroom in shadow (keeps the timer readable)
        const shade = g.createLinearGradient(0, 0, 0, 110);
        shade.addColorStop(0, 'rgba(36,6,16,0.82)');
        shade.addColorStop(1, 'rgba(36,6,16,0)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W, 110);

        // pop-ups
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '900 15px system-ui, sans-serif';
        for (const p of popups) {
          g.globalAlpha = clamp(p.life, 0, 1);
          g.fillStyle = 'rgba(40,6,16,0.8)';
          g.fillText(p.text, p.x + 1, p.y + 1.5);
          g.fillStyle = '#ffe08a';
          g.fillText(p.text, p.x, p.y);
        }
        g.globalAlpha = 1;

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
