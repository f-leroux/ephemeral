// Counting Sheep — a dream in lavender. Two sheep run side by side up a floating meadow in the clouds,
// one per thumb: ← makes the left sheep leap, → the right one. Every fence has to be cleared, and a
// sheep must never leap while a sleepy star dangles over its lane. Each fence cleared is a sheep counted.

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

const LANES = [124, 236];
const FOOT = 548; // where the sheep's hooves touch the grass
const STRIP_L = 52; // the floating meadow
const STRIP_R = 308;

const BPM = 136;
const E = 60 / BPM / 2; // an eighth note: everything arrives on the song's grid
const J = 0.56; // a leap's airtime, always the same
const HJ = 46; // a leap's height
const FENCE_CLEAR = 18; // hooves must be this high while a fence passes under them
const STAR_CLEAR = 12; // and no higher than this while a star passes over
const FENCE_BAND = 9; // half-depth of a fence on the ground
const STAR_BAND = 11; // half-depth of a star's reach
const STAR_HANG = 44; // a star dangles this high: a leap would bump right into it
const BUFFER = 0.12; // a tap this close before landing is kept for the landing

// fraction of the leap spent above each clearance
const S1 = (1 - Math.sqrt(1 - FENCE_CLEAR / HJ)) / 2;
const S2 = 1 - S1;
const R1 = (1 - Math.sqrt(1 - STAR_CLEAR / HJ)) / 2;
const R2 = 1 - R1;

const V0 = 215;
const V1 = 330;
const speedAt = (t) => lerp(V0, V1, progress(clamp(t, 0, 60), 60, 1.2));

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120d33');
    sky.addColorStop(0.5, '#251b57');
    sky.addColorStop(1, '#3a2870');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // a soft nebula of dream-dust
    for (let i = 0; i < 9; i++) {
      const cx = rng.range(0, W);
      const cy = rng.range(0, H);
      const r = rng.range(70, 150);
      const neb = g.createRadialGradient(cx, cy, 2, cx, cy, r);
      const c = rng.pick(['255,150,210', '150,170,255', '200,150,255']);
      neb.addColorStop(0, `rgba(${c},0.13)`);
      neb.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = neb;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }, 1);
}

// Stars far below the meadow, tiled vertically so they can scroll slowly.
function paintStarfield(W, h, rng) {
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, h);
      const s = rng.chance(0.1) ? 2 : rng.range(0.6, 1.4);
      g.fillStyle = `rgba(255,${rng.int(225, 255)},${rng.int(220, 255)},${rng.range(0.35, 0.95)})`;
      g.fillRect(x, y, s, s);
      if (y < 3) g.fillRect(x, y + h, s, s);
      if (y > h - 3) g.fillRect(x, y - h, s, s);
    }
    // a few four-pointed twinkles
    for (let i = 0; i < 10; i++) {
      const x = rng.range(10, W - 10);
      const y = rng.range(10, h - 10);
      const r = rng.range(3, 5);
      g.fillStyle = 'rgba(255,240,220,0.8)';
      g.beginPath();
      g.moveTo(x, y - r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.quadraticCurveTo(x, y, x, y + r);
      g.quadraticCurveTo(x, y, x - r, y);
      g.quadraticCurveTo(x, y, x, y - r);
      g.fill();
    }
  }, 1);
}

// A puffy cloud, used for the drifting clouds beside the meadow.
function paintCloud(rng, w, h) {
  return makeSprite(w, h, (g) => {
    const puffs = [];
    for (let i = 0; i < 9; i++) {
      puffs.push([rng.range(-w * 0.32, w * 0.32), rng.range(-h * 0.12, h * 0.15), rng.range(h * 0.2, h * 0.36)]);
    }
    g.fillStyle = 'rgba(70,50,130,0.35)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x + 3, y + 6, r, 0, Math.PI * 2);
      g.fill();
    }
    const body = g.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, '#f4ecff');
    body.addColorStop(0.6, '#c8b6ee');
    body.addColorStop(1, '#9c86d2');
    g.fillStyle = body;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

// The floating meadow: a seamless vertical tile with two worn tracks, mown stripes and cloud edges.
function paintMeadow(rng, h) {
  const w = STRIP_R - STRIP_L + 40;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const x0 = 20; // where the grass starts inside the tile
    const gw = STRIP_R - STRIP_L;
    const grass = g.createLinearGradient(x0, 0, x0 + gw, 0);
    grass.addColorStop(0, '#2f5f6a');
    grass.addColorStop(0.18, '#4a8a80');
    grass.addColorStop(0.5, '#56998a');
    grass.addColorStop(0.82, '#4a8a80');
    grass.addColorStop(1, '#2f5f6a');
    g.fillStyle = grass;
    g.fillRect(x0, 0, gw, h);
    // mown stripes: they make the speed easy to feel
    for (let y = 0; y < h; y += 80) {
      g.fillStyle = 'rgba(190,255,230,0.07)';
      g.fillRect(x0, y, gw, 40);
    }
    // the two sandy tracks the sheep run on
    for (const lx of LANES) {
      const tx = lx - STRIP_L + x0;
      const track = g.createLinearGradient(tx - 30, 0, tx + 30, 0);
      track.addColorStop(0, 'rgba(214,190,206,0)');
      track.addColorStop(0.25, 'rgba(206,176,200,0.32)');
      track.addColorStop(0.5, 'rgba(226,200,216,0.4)');
      track.addColorStop(0.75, 'rgba(206,176,200,0.32)');
      track.addColorStop(1, 'rgba(214,190,206,0)');
      g.fillStyle = track;
      g.fillRect(tx - 30, 0, 60, h);
      // hoof prints
      g.fillStyle = 'rgba(120,90,130,0.18)';
      for (let y = 0; y < h; y += 14) {
        const side = (y / 14) % 2 ? -1 : 1;
        g.beginPath();
        g.ellipse(tx + side * 7 + rng.range(-2, 2), y + rng.range(-2, 2), 2, 1.4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // grass tufts, drawn wrapped so the tile is seamless
    const tuft = (x, y, len, col) => {
      for (const dy of [0, -h, h]) {
        g.strokeStyle = col;
        g.lineWidth = 1.1;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          g.moveTo(x + k * 2, y + dy);
          g.quadraticCurveTo(x + k * 3, y + dy - len * 0.6, x + k * 4.5, y + dy - len);
        }
        g.stroke();
      }
    };
    for (let i = 0; i < 230; i++) {
      const x = rng.range(x0 + 4, x0 + gw - 4);
      const onTrack = LANES.some((lx) => Math.abs(x - (lx - STRIP_L + x0)) < 26);
      if (onTrack && rng.chance(0.8)) continue;
      tuft(x, rng.range(0, h), rng.range(4, 9), rng.pick(['rgba(140,200,175,0.55)', 'rgba(40,80,85,0.5)', 'rgba(170,220,190,0.4)']));
    }
    // pastel flowers
    const flower = (x, y, col) => {
      for (const dy of [0, -h, h]) {
        g.fillStyle = col;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 2, y + dy + Math.sin(a) * 2, 1.6, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffe28a';
        g.beginPath();
        g.arc(x, y + dy, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    };
    // a line of daisies between the two tracks
    for (let y = 6; y < h; y += 22) flower(180 - STRIP_L + x0 + rng.range(-3, 3), y + rng.range(-3, 3), 'rgba(255,255,255,0.85)');
    for (let i = 0; i < 40; i++) {
      const x = rng.range(x0 + 6, x0 + gw - 6);
      if (LANES.some((lx) => Math.abs(x - (lx - STRIP_L + x0)) < 34)) continue;
      flower(x, rng.range(0, h), rng.pick(['rgba(255,170,215,0.85)', 'rgba(200,180,255,0.85)', 'rgba(255,240,200,0.85)']));
    }
    // fluffy cloud banks along both edges
    for (const edge of [x0, x0 + gw]) {
      for (let y = -10; y < h + 10; y += 13) {
        const r = rng.range(8, 16);
        const x = edge + rng.range(-5, 5) + (edge === x0 ? -4 : 4);
        for (const dy of [0, -h, h]) {
          const c = g.createRadialGradient(x - r * 0.3, y + dy - r * 0.3, 1, x, y + dy, r);
          c.addColorStop(0, '#fbf6ff');
          c.addColorStop(0.65, '#d4c4f2');
          c.addColorStop(1, '#a893d8');
          g.fillStyle = c;
          g.beginPath();
          g.arc(x, y + dy, r, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }, 2);
}

// One sheep seen from behind and above. frame 0/1 = running strides, 2 = leaping.
function paintSheep(bow, frame) {
  return makeSprite(52, 64, (g) => {
    const leg = (x, y0, y1, dx = 0) => {
      g.strokeStyle = '#2d2638';
      g.lineWidth = 4.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + dx, y1);
      g.stroke();
      g.fillStyle = '#16121e';
      g.beginPath();
      g.ellipse(x + dx, y1 + 0.5, 2.6, 1.8, 0, 0, Math.PI * 2);
      g.fill();
    };
    if (frame === 2) {
      // hind legs kicked out behind, front legs tucked away
      leg(-8, 12, 27, -5);
      leg(8, 12, 27, 5);
    } else {
      const a = frame === 0 ? 1 : -1;
      leg(-15, -6, -6 + 9 + a * 2.5);
      leg(15, -6, -6 + 9 - a * 2.5);
      leg(-8, 12, 23 - a * 3);
      leg(8, 12, 23 + a * 3);
    }
    // wool: a ring of puffs around an oval
    const puffs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      puffs.push([Math.cos(a) * 14, 3 + Math.sin(a) * 15, 7.5]);
    }
    g.fillStyle = '#9d8fc4';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(1, 4.5, 15, 16, 0, 0, Math.PI * 2);
    g.fill();
    const wool = g.createRadialGradient(-5, -4, 2, 0, 3, 24);
    wool.addColorStop(0, '#ffffff');
    wool.addColorStop(0.55, '#f1ecfb');
    wool.addColorStop(1, '#c4b8e2');
    g.fillStyle = wool;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(0, 3, 15, 16, 0, 0, Math.PI * 2);
    g.fill();
    // curls
    g.strokeStyle = 'rgba(160,145,200,0.55)';
    g.lineWidth = 0.9;
    for (const [x, y] of [[-6, 0], [5, -3], [-2, 9], [7, 8], [-9, 11], [1, 15], [-4, -7], [9, 1]]) {
      g.beginPath();
      g.arc(x, y, 2.6, 0.4, 4.2);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, r] of [[-7, -5, 4], [-2, -8, 3], [-10, 2, 3]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // stubby tail
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 18.5, 4.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(150,135,195,0.6)';
    g.stroke();
    // ears and the back of the head
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 9.5, -19);
      g.rotate(s * (frame === 2 ? -0.5 : -0.2));
      g.fillStyle = '#2d2638';
      g.beginPath();
      g.ellipse(0, 0, 6, 2.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d98cae';
      g.beginPath();
      g.ellipse(s * 0.8, 0.4, 3.6, 1.3, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    const head = g.createRadialGradient(-2, -23, 1, 0, -20, 9);
    head.addColorStop(0, '#4a4158');
    head.addColorStop(1, '#221c2c');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -20, 6.8, 7.6, 0, 0, Math.PI * 2);
    g.fill();
    // woolly topknot
    g.fillStyle = '#f7f3ff';
    for (const [x, y, r] of [[-2.5, -25, 3.2], [2.5, -25, 3.2], [0, -27.5, 3]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // a ribbon bow and a little bell
    g.fillStyle = bow;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(s * 8, -16);
      g.lineTo(s * 8, -8);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.7;
    g.stroke();
    g.beginPath();
    g.arc(0, -12, 2.4, 0, Math.PI * 2);
    g.fill();
    const bell = g.createRadialGradient(-0.6, -8.6, 0.3, 0, -8, 2.6);
    bell.addColorStop(0, '#fff5c0');
    bell.addColorStop(1, '#d69a28');
    g.fillStyle = bell;
    g.beginPath();
    g.arc(0, -8, 2.3, 0, Math.PI * 2);
    g.fill();
  });
}

function paintFence() {
  return makeSprite(108, 48, (g) => {
    const ground = 14;
    // shadow
    g.fillStyle = 'rgba(25,15,60,0.35)';
    g.beginPath();
    g.moveTo(-52, ground - 1);
    g.lineTo(52, ground - 1);
    g.lineTo(56, ground + 8);
    g.lineTo(-48, ground + 8);
    g.closePath();
    g.fill();
    const wood = (x, y, w, h, light) => {
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, light ? '#f6dcab' : '#e2bb80');
      grad.addColorStop(0.5, light ? '#dcb37a' : '#c99a5c');
      grad.addColorStop(1, '#9a6a3a');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x, y, w, h, 1.5);
      g.fill();
      g.strokeStyle = '#6e4724';
      g.lineWidth = 0.9;
      g.stroke();
    };
    // posts
    for (const x of [-48, 0, 48]) {
      const grad = g.createLinearGradient(x - 4, 0, x + 4, 0);
      grad.addColorStop(0, '#f0d29c');
      grad.addColorStop(0.5, '#c99a5c');
      grad.addColorStop(1, '#8a5c31');
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x - 4, -20, 8, ground + 20, 1.5);
      g.fill();
      g.strokeStyle = '#6e4724';
      g.lineWidth = 0.9;
      g.stroke();
      g.fillStyle = '#7d532c';
      g.beginPath();
      g.ellipse(x, -20, 4, 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // rails, with grain and nails
    for (const [y, light] of [[-15, true], [-3, false]]) {
      wood(-53, y, 106, 6.5, light);
      g.strokeStyle = 'rgba(110,70,36,0.4)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-48, y + 2.6);
      g.bezierCurveTo(-20, y + 1.6, 10, y + 4, 48, y + 3);
      g.stroke();
      g.fillStyle = '#4a3a3a';
      for (const x of [-48, 0, 48]) {
        g.beginPath();
        g.arc(x, y + 3.2, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    // tufts at the foot of each post
    g.strokeStyle = '#8fd0b4';
    g.lineWidth = 1.1;
    for (const x of [-48, 0, 48]) {
      g.beginPath();
      for (let k = -2; k <= 2; k++) {
        g.moveTo(x + k * 2.2, ground);
        g.lineTo(x + k * 3.4, ground - 5 - Math.abs(k));
      }
      g.stroke();
    }
  });
}

function paintStar() {
  return makeSprite(40, 40, (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 7.6 : 16;
      pts.push([Math.cos(a) * r, Math.sin(a) * r + 1]);
    }
    const path = () => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.lineJoin = 'round';
    path();
    const body = g.createRadialGradient(-4, -4, 1, 0, 1, 17);
    body.addColorStop(0, '#fffbe0');
    body.addColorStop(0.45, '#ffdf6e');
    body.addColorStop(1, '#f0a23a');
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = '#b8742a';
    g.lineWidth = 1.3;
    g.stroke();
    // sleepy face
    g.strokeStyle = '#7a4318';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 3.6, 0.5, 2, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 4.6, 1.6, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(255,120,150,0.45)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 6.4, 3.6, 2, 1.3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-3, -7, 1.6, 3, -0.4, 0, Math.PI * 2);
    g.fill();
    // the loop it hangs from
    g.strokeStyle = '#e8d6a8';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, -16.5, 1.8, 0, Math.PI * 2);
    g.stroke();
  });
}

function paintShadow(w, h, a) {
  return makeSprite(w, h, (g) => {
    const grad = g.createRadialGradient(0, 0, 1, 0, 0, w / 2);
    grad.addColorStop(0, `rgba(20,10,50,${a})`);
    grad.addColorStop(1, 'rgba(20,10,50,0)');
    g.fillStyle = grad;
    g.scale(1, h / w);
    g.beginPath();
    g.arc(0, 0, w / 2, 0, Math.PI * 2);
    g.fill();
  }, 2);
}

function paintZ() {
  return makeSprite(20, 20, (g) => {
    g.font = '800 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(230,215,255,0.9)';
    g.fillText('z', 0, 0);
  });
}

// ---------- the game ----------

export default {
  id: 'sheepcount',
  title: 'Counting Sheep',
  emoji: '🐑',
  tagline: 'Tap ← or → to make that sheep leap its fence. Never leap under a star.',
  colors: { bg: '#1d1645', fg: '#fff4d6', accent: '#ffd75e' },

  // 90s dream trance in A♭ major at 136 BPM over I–vi–IV–V (A♭ – Fm – D♭ – E♭): 34 bars = 60s.
  music: {
    cps: BPM / 240,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const kick2 = note("c2*4 [~ ~ ~ c2]").s("sine").decay(0.17).sustain(0).gain(0.8)
      const bass = note("<ab2 f2 db2 eb2>").struct("[~ x x x]*4").s("sawtooth")
        .decay(0.1).sustain(0.05).release(0.04).lpf(saw.range(380, 1250).slow(34)).lpq(4).gain(0.34)
      const hats = s("[~ white]*4").decay(0.05).sustain(0).hpf(7000).gain(0.045)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.015 0.03 0.045 0.03]*4")
      const clap = s("~ pink ~ pink").decay(0.11).sustain(0).hpf(1400).lpf(5500).gain(0.13).room(0.35)
      const piano = note("<[ab4 c5 eb5 c5 ab5 eb5 c5 eb5] [f4 ab4 c5 ab4 f5 c5 ab4 c5] [db4 f4 ab4 f4 db5 ab4 f4 ab4] [eb4 g4 bb4 g4 eb5 bb4 g4 bb4]>")
        .s("triangle").decay(0.22).sustain(0.05).release(0.1).lpf(saw.range(1600, 3400).slow(34)).gain(0.12)
        .delay(0.25).delaytime(0.331).delayfeedback(0.3).pan(sine.range(0.35, 0.65).slow(4))
      const keys = note("<[ab4 c5 eb5 c5 ab5 eb5 c5 eb5] [f4 ab4 c5 ab4 f5 c5 ab4 c5] [db4 f4 ab4 f4 db5 ab4 f4 ab4] [eb4 g4 bb4 g4 eb5 bb4 g4 bb4]>")
        .s("square").decay(0.12).sustain(0).lpf(1800).gain(0.03)
      const chords = "<[ab3,c4,eb4] [f3,ab3,c4] [db3,f3,ab3] [eb3,g3,bb3]>"
      const pad = note(chords).s("sawtooth").attack(0.4).release(0.7).lpf(saw.range(600, 1700).slow(34)).gain(0.06).room(0.6).roomsize(5)
      const stabs = note(chords).add(note(12)).struct("~ x ~ ~ x ~ x ~").s("sawtooth").decay(0.13).sustain(0).lpf(2300).gain(0.05).room(0.3).pan(0.4)
      const tune = "<[eb5 ~ ab5 ~ c6 ~ bb5 ab5] [c6 ~ ~ ab5 f5 ~ ~ ~] [f5 ~ ab5 ~ db6 ~ c6 bb5] [bb5 ~ ~ g5 eb5 ~ ~ ~] [eb5 ~ ab5 ~ c6 ~ eb6 ~] [f6 ~ eb6 c6 ab5 ~ ~ ~] [db6 ~ c6 bb5 ab5 ~ f5 ~] [g5 ~ ab5 bb5 ab5 ~ ~ ~]>"
      const lead = note(tune).s("square").attack(0.01).decay(0.18).sustain(0.35).release(0.12).lpf(2400)
        .vib(5).vibmod(0.1).gain(0.06).room(0.4).delay(0.3).delaytime(0.331).delayfeedback(0.35).pan(0.58)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.35).release(0.08).lpf(1300).gain(0.05).pan(0.44)
      const sparkle = note("<[ab6 eb6 c6 eb6]*4 [f6 c6 ab5 c6]*4 [f6 db6 ab5 db6]*4 [g6 eb6 bb5 eb6]*4>")
        .s("sine").decay(0.05).sustain(0).gain(0.035).delay(0.3).delaytime(0.221).delayfeedback(0.4).pan(sine.range(0.2, 0.8).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(900, 5200).slow(10)).gain(saw.range(0, 0.06).slow(10))
    `,
    song: `arrange(
      [6, stack(kick, bass, hats, piano)],
      [8, stack(kick, bass, hats, clap, piano, pad, stabs)],
      [10, stack(kick, bass, hats16, clap, piano, pad, stabs, lead, sparkle)],
      [10, stack(kick2, bass, hats16, clap, piano, keys, pad, stabs, lead, low, sparkle, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- the world's distance over time (independent of the player) ----
    const STEPS = 120;
    const TMAX = 75;
    const dist = new Float64Array(TMAX * STEPS + 1);
    for (let i = 1; i < dist.length; i++) dist[i] = dist[i - 1] + speedAt((i - 0.5) / STEPS) / STEPS;
    const distAt = (t) => {
      const f = clamp(t, 0, TMAX) * STEPS;
      const i = Math.min(dist.length - 2, Math.floor(f));
      return dist[i] + (dist[i + 1] - dist[i]) * (f - i);
    };

    // ---- the plan: fences (in leap groups) and stars, all decided up front ----
    const groups = []; // { lane, fences: [T...], minWin, a, b }
    const stars = []; // { lane, T }
    const q = (t) => Math.round(t / E) * E;

    // The take-off times that clear every fence of a group without leaping under a star.
    function window(gr, starList) {
      const T1 = gr.fences[0];
      const Tn = gr.fences[gr.fences.length - 1];
      let a = Tn + FENCE_BAND / speedAt(Tn) - S2 * J;
      let b = T1 - FENCE_BAND / speedAt(T1) - S1 * J;
      let pieces = [[a, b]];
      for (const s of starList) {
        if (s.lane !== gr.lane) continue;
        const hs = STAR_BAND / speedAt(s.T);
        const p0 = s.T - hs - R2 * J;
        const p1 = s.T + hs - R1 * J;
        const next = [];
        for (const [x, y] of pieces) {
          if (p1 <= x || p0 >= y) next.push([x, y]);
          else {
            if (p0 > x) next.push([x, p0]);
            if (p1 < y) next.push([p1, y]);
          }
        }
        pieces = next;
      }
      let best = null;
      for (const pc of pieces) if (!best || pc[1] - pc[0] > best[1] - best[0]) best = pc;
      return best;
    }

    // Can a careful player clear all of it, one tap at a time?
    function feasible(gs, ss) {
      const wins = [];
      for (const gr of gs) {
        const w = window(gr, ss);
        if (!w || w[1] - w[0] < gr.minWin) return null;
        wins.push({ gr, a: w[0], b: w[1] });
      }
      wins.sort((x, y) => x.b - y.b);
      // back-to-back leaps in one lane: even a leap taken late in its window leaves time for the next
      const lastB = [-9, -9];
      for (const w of wins) {
        const l = w.gr.lane;
        if (w.b - (lastB[l] + J) < w.gr.minWin * 0.7) return null;
        lastB[l] = w.b;
      }
      let lastAny = -9;
      const lastLane = [-9, -9];
      const taps = [];
      for (const w of wins) {
        const tau = Math.max(w.a, lastAny + 0.18, lastLane[w.gr.lane] + J + 0.04);
        if (tau > w.b - 0.06) return null;
        lastAny = tau;
        lastLane[w.gr.lane] = tau;
        taps.push({ lane: w.gr.lane, t: tau, a: w.a, b: w.b });
      }
      return taps;
    }

    let taps = [];
    {
      let t = 3.4;
      const laneEnd = [0, 0];
      while (t < 63) {
        const p = progress(t, 60, 1.15);
        const free = laneEnd[0] <= laneEnd[1] ? 0 : 1; // usually the sheep that's been waiting longest
        const lane = plan.chance(lerp(0.55, 0.8, p)) ? free : 1 - free;
        const other = 1 - lane;
        const minWin = lerp(0.26, 0.12, p);
        const T0 = q(t);
        const weights = [
          ['fence', 1],
          ['double', t > 13 ? lerp(0.25, 0.6, p) : 0],
          ['star', t > 6 ? 0.32 : 0],
          ['fenceStar', t > 9 ? lerp(0.35, 0.7, p) : 0],
          ['starFence', t > 11 ? lerp(0.35, 0.7, p) : 0],
          ['pair', t > 16 ? lerp(0.25, 0.7, p) : 0],
        ];
        let sum = 0;
        for (const [, w] of weights) sum += w;
        let r = plan.next() * sum;
        let kind = 'fence';
        for (const [k, w] of weights) {
          if ((r -= w) < 0) {
            kind = k;
            break;
          }
        }
        const ng = [];
        const ns = [];
        let end = T0;
        const n = plan.chance(0.5) ? 2 : 3;
        if (kind === 'fence') ng.push({ lane, fences: [T0], minWin });
        else if (kind === 'double') {
          ng.push({ lane, fences: [T0, T0 + E], minWin: minWin * 0.6 });
          end = T0 + E;
        } else if (kind === 'star') ns.push({ lane, T: T0 });
        else if (kind === 'fenceStar') {
          ng.push({ lane, fences: [T0], minWin });
          ns.push({ lane, T: T0 + n * E });
          end = T0 + n * E;
        } else if (kind === 'starFence') {
          ns.push({ lane, T: T0 });
          ng.push({ lane, fences: [T0 + n * E], minWin });
          end = T0 + n * E;
        } else {
          const m = plan.int(1, 2);
          ng.push({ lane, fences: [T0], minWin });
          ng.push({ lane: other, fences: [T0 + m * E], minWin });
          end = T0 + m * E;
        }
        const ok = feasible(groups.concat(ng), stars.concat(ns));
        if (ok) {
          groups.push(...ng);
          stars.push(...ns);
          taps = ok;
          for (const gr of ng) laneEnd[gr.lane] = Math.max(laneEnd[gr.lane], gr.fences[gr.fences.length - 1]);
          for (const st of ns) laneEnd[st.lane] = Math.max(laneEnd[st.lane], st.T);
          t = end + lerp(1.05, 0.12, p) * plan.range(0.85, 1.15);
        } else {
          t += E;
        }
      }
    }

    // turn the plan into things on the ground
    const things = []; // { kind: 'fence'|'star', lane, D, T, group, passed }
    groups.forEach((gr, gi) => {
      for (const T of gr.fences) things.push({ kind: 'fence', lane: gr.lane, T, D: distAt(T), group: gi, passed: false });
    });
    for (const s of stars) things.push({ kind: 'star', lane: s.lane, T: s.T, D: distAt(s.T), passed: false, ph: art.range(0, 6.28) });
    things.sort((a, b) => a.D - b.D);

    // ---- art ----
    const sky = paintSky(W, H, art);
    const STAR_TILE = 480;
    const starfield = paintStarfield(W, STAR_TILE, art);
    const MEADOW_TILE = 480;
    const meadow = paintMeadow(art, MEADOW_TILE);
    const clouds = [0, 1, 2].map((i) => paintCloud(art, 90 + i * 14, 50 + i * 6));
    const sheepArt = [
      [0, 1, 2].map((f) => paintSheep('#ff8fc8', f)),
      [0, 1, 2].map((f) => paintSheep('#7cc4ff', f)),
    ];
    const fenceArt = paintFence();
    const starArt = paintStar();
    const sheepShadow = paintShadow(40, 14, 0.5);
    const starShadow = paintShadow(30, 10, 0.45);
    const starGlow = glowSprite('rgba(255,214,110,1)', 40);
    const pinkGlow = glowSprite('rgba(255,150,210,1)', 40);
    const zArt = paintZ();
    const vignette = vignetteSprite(W, H, 0.62, '10,4,30');

    const sideClouds = Array.from({ length: 7 }, (_, i) => ({
      x: i % 2 ? art.range(W - 40, W + 20) : art.range(-20, 40),
      y: art.range(0, 900),
      k: art.int(0, 2),
      s: art.range(0.35, 0.6),
    }));
    const floaters = []; // drifting z's beside the meadow (cosmetic)

    const fx = createParticles();
    const numbers = []; // floating counts

    const sheep = [0, 1].map((lane) => ({ lane, x: LANES[lane], z: 0, air: -1, buffered: false, stride: 0, squash: 0, dead: false, spin: 0, fall: 0 }));

    let clock = 0;
    let now = 0; // gameplay time
    let cur = 0; // distance travelled
    let slide = 0; // world speed after the end
    let lastDir = 0;
    let count = 0;
    let deadLane = -1;
    let deathKind = '';
    let bump = 0;

    const leap = (s) => {
      s.air = 0;
      s.buffered = false;
      fx.burst(s.x, FOOT + 2, { count: 6, speed: 50, life: 0.35, size: 2.4, round: true, drag: 4, colors: ['#bfe8d6', '#efe2f0', '#ffffff'] });
    };

    const game = {
      dead: false,
      deathReason: '',
      _taps: taps, // the careful plan, used by tests

      update(dt, dir, t) {
        clock += dt;
        now = t + dt;
        cur = distAt(now);

        // a new press on one side makes that sheep leap
        if (dir !== 0 && dir !== lastDir) {
          const s = sheep[dir < 0 ? 0 : 1];
          if (s.air < 0) leap(s);
          else if (J - s.air <= BUFFER) s.buffered = true;
        }
        lastDir = dir;

        for (const s of sheep) {
          s.stride += dt * lerp(9, 12, now / 60);
          if (s.air >= 0) {
            s.air += dt;
            if (s.air >= J) {
              s.air = -1;
              s.z = 0;
              s.squash = 1;
              fx.burst(s.x, FOOT + 2, { count: 8, speed: 70, life: 0.4, size: 2.6, round: true, drag: 4, angle: -Math.PI / 2, spread: 2.6, colors: ['#bfe8d6', '#efe2f0', '#ffffff'] });
              if (s.buffered) leap(s);
            } else {
              const u = s.air / J;
              s.z = HJ * 4 * u * (1 - u);
            }
          }
          s.squash = Math.max(0, s.squash - dt * 6);
        }

        for (const th of things) {
          if (th.passed) continue;
          const y = FOOT - (th.D - cur);
          if (y < FOOT - 60) break;
          const s = sheep[th.lane];
          if (th.kind === 'fence') {
            if (Math.abs(y - FOOT) < FENCE_BAND && s.z < FENCE_CLEAR) {
              this.dead = true;
              deadLane = th.lane;
              deathKind = 'fence';
              th.broken = true;
              this.deathReason = `The ${th.lane ? 'right' : 'left'} sheep clipped a fence — ${count} sheep counted.`;
              fx.burst(s.x, FOOT - 6, { count: 26, speed: 170, life: 0.9, size: 3.4, gravity: 260, colors: ['#e2bb80', '#c99a5c', '#f6dcab', '#8a5c31'] });
              fx.burst(s.x, FOOT - 16, { count: 22, speed: 120, life: 1.1, size: 4, round: true, drag: 2, colors: ['#ffffff', '#f1ecfb', '#d8cdf0'] });
              break;
            }
            if (y > FOOT + FENCE_BAND) {
              th.passed = true;
              count++;
              numbers.push({ x: s.x, y: FOOT - 50 - s.z, n: count, life: 1 });
              fx.burst(s.x, FOOT - 10 - s.z, { count: 7, speed: 60, life: 0.6, size: 2.6, round: true, drag: 2, colors: ['#fff4d6', '#ffd75e', '#ffb8e0'] });
            }
          } else {
            if (Math.abs(y - FOOT) < STAR_BAND && s.z > STAR_CLEAR) {
              this.dead = true;
              deadLane = th.lane;
              deathKind = 'star';
              th.hit = 1;
              this.deathReason = `The ${th.lane ? 'right' : 'left'} sheep leapt into a hanging star — ${count} sheep counted.`;
              fx.burst(s.x, FOOT - STAR_HANG, { count: 30, speed: 160, life: 1, size: 3, round: true, drag: 1.5, colors: ['#fff6c2', '#ffd75e', '#ffffff', '#ffb8e0'] });
              break;
            }
            if (y > FOOT + STAR_BAND) th.passed = true;
          }
        }

        if (this.dead) {
          const s = sheep[deadLane];
          s.dead = true;
          bump = 1;
          slide = speedAt(now);
        }

        for (let i = numbers.length - 1; i >= 0; i--) {
          const n = numbers[i];
          n.life -= dt * 0.9;
          n.y -= 34 * dt;
          if (n.life <= 0) numbers.splice(i, 1);
        }
        this._tickCosmetics(dt, speedAt(now));
        fx.update(dt, speedAt(now));
      },

      _tickCosmetics(dt, v) {
        if (Math.random() < dt * 1.4) {
          const left = Math.random() < 0.5;
          floaters.push({ x: left ? 10 + Math.random() * 30 : W - 40 + Math.random() * 30, y: 640, vx: (Math.random() - 0.5) * 10, life: 1, ph: Math.random() * 6, s: 0.7 + Math.random() * 0.6 });
        }
        for (let i = floaters.length - 1; i >= 0; i--) {
          const f = floaters[i];
          f.y -= (30 + v * 0.1) * dt;
          f.x += Math.sin(clock * 1.5 + f.ph) * 10 * dt;
          f.life -= dt * 0.12;
          if (f.y < -20 || f.life <= 0) floaters.splice(i, 1);
        }
      },

      afterlife(dt) {
        clock += dt;
        slide = Math.max(0, slide - dt * 420);
        cur += slide * dt;
        bump = Math.max(0, bump - dt * 1.2);
        const s = sheep[deadLane];
        if (s) {
          if (deathKind === 'fence') {
            s.spin += dt * 7 * Math.max(0.2, slide / 300);
            s.fall = Math.min(1, s.fall + dt * 2.5);
            s.z = Math.max(0, s.z - dt * 120);
          } else {
            s.z = Math.max(0, s.z - dt * 110);
            s.spin = Math.sin(clock * 9) * 0.2 * bump;
          }
        }
        for (const o of sheep) {
          if (o.dead) continue;
          if (o.air >= 0) {
            o.air += dt;
            if (o.air >= J) (o.air = -1), (o.z = 0);
            else o.z = HJ * 4 * (o.air / J) * (1 - o.air / J);
          }
          o.stride += dt * 9 * (slide / 300);
        }
        for (const th of things) if (th.hit) th.hit = Math.max(0, th.hit - dt * 0.6);
        for (let i = numbers.length - 1; i >= 0; i--) {
          numbers[i].life -= dt;
          numbers[i].y -= 30 * dt;
          if (numbers[i].life <= 0) numbers.splice(i, 1);
        }
        this._tickCosmetics(dt, slide);
        fx.update(dt, slide);
      },

      render(g) {
        drawSprite(g, sky, W / 2, H / 2);
        // starfield below the clouds, slow parallax
        const so = (cur * 0.12) % STAR_TILE;
        for (let y = so - STAR_TILE; y < H + STAR_TILE; y += STAR_TILE) drawSprite(g, starfield, W / 2, y + STAR_TILE / 2);
        // drifting clouds beside the meadow
        for (const c of sideClouds) {
          const y = ((c.y + cur * c.s) % 900) - 130;
          drawSprite(g, clouds[c.k], c.x, y);
        }
        // the meadow
        const mo = cur % MEADOW_TILE;
        const mx = (STRIP_L + STRIP_R) / 2;
        for (let y = mo - MEADOW_TILE; y < H + MEADOW_TILE; y += MEADOW_TILE) drawSprite(g, meadow, mx, y + MEADOW_TILE / 2);

        // dreamy z's rising beside it
        for (const f of floaters) drawSprite(g, zArt, f.x, f.y, { size: 16 * f.s, alpha: 0.5 * f.life });

        // the hop lines: a fence crossing one is the perfect moment to tap
        for (let lane = 0; lane < 2; lane++) {
          const hopY = FOOT - speedAt(now) * J * 0.5;
          let near = 0;
          for (const th of things) {
            if (th.kind !== 'fence' || th.lane !== lane || th.passed) continue;
            const y = FOOT - (th.D - cur);
            near = Math.max(near, 1 - Math.min(1, Math.abs(y - hopY) / 40));
            if (y < hopY - 60) break;
          }
          g.fillStyle = `rgba(255,236,190,${0.16 + 0.4 * near})`;
          for (let k = -4; k <= 4; k++) g.fillRect(LANES[lane] + k * 9 - 2.5, hopY - 1, 5, 2);
        }

        const drawThing = (th) => {
          const y = FOOT - (th.D - cur);
          if (y < -90 || y > H + 70) return;
          const x = LANES[th.lane];
          if (th.kind === 'fence') {
            if (th.broken) {
              drawSprite(g, fenceArt, x - 18, y - 10, { size: 60, rot: -0.5 });
              drawSprite(g, fenceArt, x + 20, y - 6, { size: 56, rot: 0.6 });
            } else drawSprite(g, fenceArt, x, y - 10);
          } else {
            const swing = Math.sin(clock * 1.8 + th.ph) * 0.12 + (th.hit ? Math.sin(clock * 14) * 0.5 * th.hit : 0);
            const sy = y - STAR_HANG;
            const sx = x + Math.sin(swing) * 6;
            drawSprite(g, starShadow, x, y + 2, { size: 30 });
            // the thread it hangs from, fading up into the dark
            const grad = g.createLinearGradient(0, sy - 220, 0, sy);
            grad.addColorStop(0, 'rgba(255,240,210,0)');
            grad.addColorStop(1, 'rgba(255,240,210,0.7)');
            g.strokeStyle = grad;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(x, sy - 220);
            g.lineTo(sx, sy - 16);
            g.stroke();
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, starGlow, sx, sy, { size: 76, alpha: 0.4 + 0.12 * Math.sin(clock * 3 + th.ph) });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, starArt, sx, sy, { size: 36, rot: swing });
          }
        };

        // things behind the sheep, then the sheep, then things in front
        for (const th of things) {
          const y = FOOT - (th.D - cur);
          if (y > FOOT + 3) continue;
          if (y < -90) break;
          drawThing(th);
        }

        for (const s of sheep) {
          const air = s.z / HJ;
          drawSprite(g, sheepShadow, s.x, FOOT + 3, { size: 40 * (1 - air * 0.35), alpha: 1 - air * 0.4 });
          const frame = s.air >= 0 ? 2 : Math.floor(s.stride) % 2;
          const bob = s.air >= 0 ? 0 : Math.abs(Math.sin(s.stride * Math.PI)) * 1.6;
          const scale = 1 + air * 0.16;
          const sx = 1 + s.squash * 0.08;
          const sy = 1 - s.squash * 0.08;
          const art2 = sheepArt[s.lane][frame];
          const cy = FOOT - 22 - s.z - bob + s.fall * 6;
          g.save();
          g.translate(s.x, cy);
          g.rotate(s.spin + (s.air >= 0 ? (s.lane ? 0.05 : -0.05) : 0));
          g.scale(sx * scale, sy * scale);
          g.drawImage(art2.canvas, -26, -32, 52, 64);
          g.restore();
          if (s.dead) {
            // dizzy little stars circling its head
            g.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 3; k++) {
              const a = clock * 5 + (k / 3) * Math.PI * 2;
              drawSprite(g, starGlow, s.x + Math.cos(a) * 16, cy - 26 + Math.sin(a) * 5, { size: 16 });
            }
            g.globalCompositeOperation = 'source-over';
            for (let k = 0; k < 3; k++) {
              const a = clock * 5 + (k / 3) * Math.PI * 2;
              drawSprite(g, starArt, s.x + Math.cos(a) * 16, cy - 26 + Math.sin(a) * 5, { size: 10 });
            }
          }
        }

        for (const th of things) {
          const y = FOOT - (th.D - cur);
          if (y <= FOOT + 3) continue;
          drawThing(th);
        }

        fx.render(g, false);

        // the count, floating up from each cleared fence
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '800 17px system-ui, sans-serif';
        for (const n of numbers) {
          const a = clamp(n.life * 1.6, 0, 1);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, pinkGlow, n.x, n.y, { size: 46, alpha: 0.35 * a });
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = a;
          g.fillStyle = 'rgba(40,20,70,0.7)';
          g.fillText(String(n.n), n.x + 1, n.y + 1.5);
          g.fillStyle = '#fff4d6';
          g.fillText(String(n.n), n.x, n.y);
          g.globalAlpha = 1;
        }

        drawSprite(g, vignette, W / 2, H / 2);

        // the tally in the corner
        g.font = '700 14px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillStyle = 'rgba(20,10,45,0.55)';
        g.beginPath();
        g.roundRect(10, 12, 62, 26, 13);
        g.fill();
        g.fillStyle = '#fff4d6';
        g.fillText(`🐑 ${count}`, 18, 26);
      },
    };
    return game;
  },
};
