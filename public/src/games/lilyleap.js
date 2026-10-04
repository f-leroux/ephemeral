// Lily Leap — a little green frog crossing a lotus pond, one hop on every other beat of the song.
// The frog is always in the air between beats, so you steer it while it flies; when the beat lands,
// it had better be over a lily pad. Withered pads sink before you get there, and later the pads
// sway on the current, so you have to aim for where they'll be when you come down.

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

const FROG_Y = 540;
const ROW_D = 108; // distance between two rows of pads = one hop
const PERIOD = 60 / 70; // one hop every other beat at 140 BPM
const SCROLL = ROW_D / PERIOD;
const PAD_ART_R = 50;
const X_MIN = 34;
const X_MAX_PAD = 34;
const SINK_START = 2.3; // withered pads start sinking this long before their row lands…
const SINK_END = 0.55; // …and are gone this long before it

// ---------- art ----------

function paintWater(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const wrap = (y, r, fn) => {
      fn(y);
      if (y - r < 0) fn(y + H);
      if (y + r > H) fn(y - H);
    };
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#123a35');
    base.addColorStop(0.5, '#1d5249');
    base.addColorStop(1, '#123a35');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // deep and shallow patches
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(0, H);
      const r = rng.range(40, 110);
      const tone = rng.pick(['rgba(8,30,28,0.35)', 'rgba(40,110,90,0.18)', 'rgba(70,120,80,0.14)', 'rgba(10,40,45,0.3)']);
      wrap(y, r, (yy) => {
        const c = g.createRadialGradient(x, yy, 1, x, yy, r);
        c.addColorStop(0, tone);
        c.addColorStop(1, tone.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = c;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
    // waterweed swaying on the bottom
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const len = rng.range(18, 46);
      const bend = rng.range(-12, 12);
      g.strokeStyle = rng.pick(['rgba(30,80,50,0.45)', 'rgba(50,100,55,0.35)', 'rgba(20,60,45,0.5)']);
      g.lineWidth = rng.range(1.5, 3);
      wrap(y, len, (yy) => {
        g.beginPath();
        g.moveTo(x, yy);
        g.quadraticCurveTo(x + bend, yy - len * 0.5, x + bend * 0.4, yy - len);
        g.stroke();
      });
    }
    // pebbles on the bottom, seen through the water
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(1.5, 4.5);
      g.fillStyle = rng.pick(['rgba(120,130,100,0.18)', 'rgba(70,80,60,0.22)', 'rgba(160,150,110,0.14)']);
      wrap(y, r, (yy) => {
        g.beginPath();
        g.ellipse(x, yy, r * 1.3, r, rng.range(0, 3), 0, Math.PI * 2);
        g.fill();
      });
    }
    // muddy banks on both sides, with grass and reeds
    for (const side of [0, 1]) {
      const x0 = side ? W - 26 : 0;
      const bank = g.createLinearGradient(side ? W : 0, 0, side ? W - 26 : 26, 0);
      bank.addColorStop(0, '#2d3b1c');
      bank.addColorStop(0.6, 'rgba(45,62,28,0.85)');
      bank.addColorStop(1, 'rgba(45,62,28,0)');
      g.fillStyle = bank;
      g.fillRect(x0, 0, 26, H);
      for (let i = 0; i < 60; i++) {
        const bx = side ? rng.range(W - 18, W + 4) : rng.range(-4, 18);
        const by = rng.range(0, H);
        const r = rng.range(5, 12);
        wrap(by, r, (yy) => {
          const c = g.createRadialGradient(bx - r * 0.3, yy - r * 0.3, 1, bx, yy, r);
          c.addColorStop(0, rng.chance(0.5) ? '#6f8f3a' : '#56782f');
          c.addColorStop(1, 'rgba(30,50,20,0)');
          g.fillStyle = c;
          g.beginPath();
          g.arc(bx, yy, r, 0, Math.PI * 2);
          g.fill();
        });
      }
    }
  }, 1);
}

function paintReeds(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    g.lineCap = 'round';
    const wrap = (y, fn) => [-H, 0, H].forEach((o) => fn(y + o));
    for (let i = 0; i < 46; i++) {
      const left = i % 2 === 0;
      const x = left ? rng.range(-2, 16) : rng.range(W - 16, W + 2);
      const y = rng.range(0, H);
      const lean = (left ? 1 : -1) * rng.range(4, 16);
      const len = rng.range(30, 60);
      const col = rng.pick(['#8aa845', '#6d8f35', '#a3b955', '#5b7d2c']);
      wrap(y, (yy) => {
        g.strokeStyle = col;
        g.lineWidth = rng.range(2, 3.4);
        g.beginPath();
        g.moveTo(x, yy + len * 0.5);
        g.quadraticCurveTo(x + lean * 0.3, yy, x + lean, yy - len * 0.5);
        g.stroke();
        if (rng.chance(0.3)) {
          // a cattail
          g.fillStyle = '#6b4424';
          g.beginPath();
          g.ellipse(x + lean, yy - len * 0.5 - 5, 2.6, 7, lean * 0.03, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,220,170,0.35)';
          g.fillRect(x + lean - 1.6, yy - len * 0.5 - 10, 1.2, 8);
        }
      });
    }
  }, 2);
}

function paintPad(rng, withered) {
  const R = PAD_ART_R;
  const s = R * 2 + 12;
  return makeSprite(s, s, (g) => {
    // its shadow on the water
    g.fillStyle = 'rgba(0,15,10,0.35)';
    g.beginPath();
    g.arc(4, 5, R, 0, Math.PI * 2);
    g.fill();
    // the notch
    const notch = rng.range(0.32, 0.46);
    const a0 = -Math.PI / 2 + notch / 2;
    const a1 = -Math.PI / 2 - notch / 2 + Math.PI * 2;
    const body = g.createRadialGradient(-R * 0.3, -R * 0.35, 2, 0, 0, R);
    if (withered) {
      body.addColorStop(0, '#c9b45a');
      body.addColorStop(0.6, '#9a7f36');
      body.addColorStop(1, '#5e4a1f');
    } else {
      body.addColorStop(0, '#9fd065');
      body.addColorStop(0.6, '#5b9a3c');
      body.addColorStop(1, '#2f6526');
    }
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, 0);
    for (let k = 0; k <= 40; k++) {
      const a = a0 + ((a1 - a0) * k) / 40;
      const rr = R * (withered ? 0.92 + 0.08 * Math.sin(k * 2.3) : 1);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    // rim
    g.strokeStyle = withered ? 'rgba(70,50,20,0.7)' : 'rgba(30,80,30,0.6)';
    g.lineWidth = 2;
    g.stroke();
    // veins
    g.strokeStyle = withered ? 'rgba(90,65,25,0.55)' : 'rgba(200,240,150,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k < 13; k++) {
      const a = a0 + ((a1 - a0) * (k + 0.5)) / 13;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(Math.cos(a + 0.08) * R * 0.5, Math.sin(a + 0.08) * R * 0.5, Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93);
      g.stroke();
    }
    // a glossy highlight
    const hi = g.createRadialGradient(-R * 0.35, -R * 0.4, 1, -R * 0.35, -R * 0.4, R * 0.6);
    hi.addColorStop(0, 'rgba(255,255,230,0.35)');
    hi.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = hi;
    g.beginPath();
    g.arc(0, 0, R * 0.95, 0, Math.PI * 2);
    g.fill();
    if (withered) {
      // holes and brown blotches
      for (let k = 0; k < 7; k++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(R * 0.2, R * 0.75);
        g.fillStyle = k < 3 ? 'rgba(18,58,53,1)' : 'rgba(80,50,20,0.5)';
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, rng.range(3, 8), rng.range(2.5, 6), a, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // water drops beading on the leaf
      for (let k = 0; k < 4; k++) {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(R * 0.25, R * 0.75);
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        g.fillStyle = 'rgba(220,255,240,0.45)';
        g.beginPath();
        g.arc(x, y, rng.range(1.5, 3), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillRect(x - 0.8, y - 1.2, 1, 1);
      }
    }
  });
}

function paintLotus() {
  return makeSprite(40, 40, (g) => {
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 6 : 8;
      const len = ring ? 10 : 15;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.4;
        g.save();
        g.rotate(a);
        const p = g.createLinearGradient(0, 0, 0, -len);
        p.addColorStop(0, ring ? '#fff4f6' : '#f7c9d6');
        p.addColorStop(1, ring ? '#f59ab5' : '#e2658e');
        g.fillStyle = p;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(len * 0.45, -len * 0.55, 0, -len);
        g.quadraticCurveTo(-len * 0.45, -len * 0.55, 0, 0);
        g.fill();
        g.restore();
      }
    }
    const c = g.createRadialGradient(0, 0, 0, 0, 0, 4);
    c.addColorStop(0, '#fff3a0');
    c.addColorStop(1, '#e8b830');
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
  });
}

// The frog from above, facing up the pond. `leap` 0 = sitting, 1 = legs stretched out mid-jump.
function paintFrog(leap) {
  return makeSprite(44, 56, (g) => {
    const skin = '#58b844';
    const dark = '#2f7a2a';
    const leg = (side) => {
      g.save();
      g.scale(side, 1);
      g.fillStyle = dark;
      g.strokeStyle = '#24561f';
      g.lineWidth = 1;
      if (leap) {
        // hind legs kicked straight back
        g.beginPath();
        g.moveTo(6, 8);
        g.quadraticCurveTo(12, 18, 9, 26);
        g.lineTo(13, 27);
        g.quadraticCurveTo(16, 18, 10, 6);
        g.closePath();
        g.fill();
        g.fillStyle = skin;
        for (const dx of [7, 10, 13]) {
          g.beginPath();
          g.ellipse(dx, 27, 1.6, 2.4, 0, 0, Math.PI * 2);
          g.fill();
        }
        // front legs reaching forward
        g.fillStyle = dark;
        g.beginPath();
        g.moveTo(7, -6);
        g.quadraticCurveTo(13, -14, 11, -22);
        g.lineTo(8, -21);
        g.quadraticCurveTo(9, -14, 5, -8);
        g.closePath();
        g.fill();
      } else {
        // hind legs folded at the sides
        g.beginPath();
        g.ellipse(13, 9, 6, 10, -0.4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = skin;
        for (const [dx, dy] of [[17, 16], [20, 13], [14, 19]]) {
          g.beginPath();
          g.ellipse(dx, dy, 1.8, 2.4, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = dark;
        g.beginPath();
        g.ellipse(11, -7, 3, 6, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = skin;
        g.beginPath();
        g.arc(13, -12, 2, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    leg(-1);
    leg(1);
    // body
    const b = g.createRadialGradient(-3, -6, 1, 0, 0, 14);
    b.addColorStop(0, '#9be36b');
    b.addColorStop(0.6, skin);
    b.addColorStop(1, '#2f7a2a');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 0, 10.5, 13.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(25,70,20,0.7)';
    g.lineWidth = 1;
    g.stroke();
    // spots and a pale stripe down the back
    g.fillStyle = 'rgba(30,90,30,0.55)';
    for (const [x, y, r] of [[-5, 4, 2.2], [4, 6, 1.8], [-2, 9, 1.4], [5, -1, 1.4]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(220,255,170,0.35)';
    g.beginPath();
    g.ellipse(0, 1, 1.8, 9, 0, 0, Math.PI * 2);
    g.fill();
    // big eyes
    for (const s of [-1, 1]) {
      g.fillStyle = '#4fa83c';
      g.beginPath();
      g.arc(s * 6.5, -10, 4.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd94a';
      g.beginPath();
      g.arc(s * 6.5, -10.5, 3.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.ellipse(s * 6.5, -10.5, 2.2, 1.3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(s * 6.5 - 1.5, -12, 1.2, 1.2);
    }
  });
}

function paintKoi(rng) {
  const coat = rng.pick([
    ['#ff8a2a', '#fff6ea'],
    ['#ffffff', '#e8452c'],
    ['#f2b134', '#ffffff'],
  ]);
  return makeSprite(26, 70, (g) => {
    // tail
    g.fillStyle = coat[0];
    g.globalAlpha = 0.8;
    g.beginPath();
    g.moveTo(0, 18);
    g.quadraticCurveTo(10, 30, 8, 34);
    g.quadraticCurveTo(0, 28, -8, 34);
    g.quadraticCurveTo(-10, 30, 0, 18);
    g.fill();
    g.globalAlpha = 1;
    // body
    const b = g.createLinearGradient(-8, 0, 8, 0);
    b.addColorStop(0, coat[0]);
    b.addColorStop(0.5, coat[1]);
    b.addColorStop(1, coat[0]);
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, -2, 7.5, 22, 0, 0, Math.PI * 2);
    g.fill();
    // patches
    g.fillStyle = coat[0] === '#ffffff' ? '#e8452c' : coat[0];
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.ellipse(rng.range(-3, 3), rng.range(-16, 12), rng.range(2.5, 5), rng.range(3, 7), 0, 0, Math.PI * 2);
      g.fill();
    }
    // fins
    g.fillStyle = 'rgba(255,240,220,0.6)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 9, -8, 5, 2.5, s * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------- game ----------

export default {
  id: 'lilyleap',
  title: 'Lily Leap',
  emoji: '🐸',
  tagline: 'The frog hops on every other beat: steer it in the air so it lands on a lily pad. Miss, or trust a withered pad, and it’s a splash.',
  colors: { bg: '#174540', fg: '#fdf4d8', accent: '#f2a0b8' },

  // Chiptune / bitpop: an arcade-bright tune in A major at 140 BPM. Kick on every beat (the frog
  // lands on every other one), a square-wave octave bass from the first bar, then a noise snare
  // and a running 16th arpeggio, then the pulse lead, then a sparkling echo line for the finale.
  // 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.16).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.05 0.025 0.035 0.025]*4")
      const snare = s("~ white ~ white").decay(0.11).sustain(0).hpf(1500).lpf(5500).gain(0.16)
      const bass = note("<[a2 a3]*4 [e2 e3]*4 [fs2 fs3]*4 [d2 d3]*4>").s("square")
        .decay(0.1).sustain(0.2).release(0.04).lpf(saw.range(600, 1500).slow(35)).gain(0.26)
      const tri = note("<a2 e2 fs2 d2>").s("triangle").gain(0.32)
      const arp = note("<[a4 cs5 e5 a5]*4 [gs4 b4 e5 gs5]*4 [fs4 a4 cs5 fs5]*4 [fs4 a4 d5 fs5]*4>")
        .s("square").decay(0.07).sustain(0).lpf(saw.range(1400, 3200).slow(35)).gain(0.055).pan(0.4)
      const lead = note("<[e5 ~ cs5 e5 a5 ~ gs5 e5] [b4 ~ e5 gs5 b5 ~ a5 gs5] [a5 ~ fs5 cs5 e5 ~ fs5 a5] [fs5 ~ e5 d5 e5 ~ cs5 b4]>")
        .s("square").decay(0.15).sustain(0.35).release(0.08).lpf(2800).gain(0.075).pan(0.6)
        .delay(0.2).delaytime(0.321).delayfeedback(0.25)
      const sparkle = note("<[a6 e6 cs6 e6]*4 [b6 gs6 e6 gs6]*4 [a6 fs6 cs6 fs6]*4 [a6 fs6 d6 fs6]*4>").s("triangle")
        .decay(0.05).sustain(0).gain(0.045).delay(0.3).delaytime(0.214).delayfeedback(0.35)
      const harmony = note("<[cs5 ~ a4 cs5 e5 ~ e5 cs5] [gs4 ~ b4 e5 gs5 ~ e5 e5] [fs5 ~ cs5 a4 cs5 ~ cs5 fs5] [d5 ~ cs5 a4 cs5 ~ a4 gs4]>")
        .s("triangle").decay(0.15).sustain(0.3).release(0.08).gain(0.08)
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, tri)],
      [9, stack(kick, hats, snare, bass, tri, arp)],
      [9, stack(kick, hats, snare, bass, tri, arp, lead)],
      [9, stack(kick, hats16, snare, bass, tri, arp, lead, harmony, sparkle)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const water = paintWater(W, H, art);
    const reeds = paintReeds(W, H, art);
    const padArt = [paintPad(art, false), paintPad(art, false), paintPad(art, false)];
    const witherArt = [paintPad(art, true), paintPad(art, true)];
    const lotus = paintLotus();
    const frogArt = [paintFrog(0), paintFrog(1)];
    const koiArt = [paintKoi(art), paintKoi(art), paintKoi(art)];
    const sunGlow = glowSprite('rgba(255,226,150,1)', 120);
    const glint = glowSprite('rgba(230,255,240,1)', 10);
    const vignette = vignetteSprite(W, H, 0.55, '4,20,18');

    const frog = createMover({ x: W / 2, minX: 16, maxX: W - 16, speed: 300, accel: 22 });
    const fx = createParticles();
    const xMax = W - X_MAX_PAD;

    // ---- the whole pond, laid out up front so it never depends on how you play ----
    const plan = rng.fork('plan');
    const deco = rng.fork('deco');
    const rows = [];
    let px = W / 2;
    for (let k = 0; k * PERIOD < 62; k++) {
      const T = k * PERIOD;
      const p = progress(T, 60, 1.3);
      const r = k < 3 ? 58 : lerp(42, 21, p);
      let sway = 0;
      let w = 0;
      let ph = 0;
      if (T > 18 && plan.chance(lerp(0.2, 0.7, p))) {
        sway = plan.range(18, lerp(26, 58, p));
        w = plan.range(1.7, 2.8);
        ph = plan.chance(0.5) ? 0 : Math.PI;
      }
      if (k >= 3) {
        const maxOff = lerp(70, 215, p);
        const minOff = lerp(0, 95, p);
        const lo = X_MIN + r + sway;
        const hi = xMax - r - sway;
        let x = px + (plan.chance(0.5) ? -1 : 1) * plan.range(minOff, maxOff);
        if (x < lo || x > hi) x = px - (x - px); // bounce off the bank instead
        px = clamp(x, lo, hi);
      }
      const pads = [{ x: px, r, sway, w, ph, withered: false, art: padArt[k % 3], rot: deco.range(0, 6.28), flower: deco.chance(0.3) }];
      // the first hops land on a raft of big pads right across the pond, wherever you are
      if (k < 3) for (const x of [70, W - 70]) pads.push({ x, r: 58, sway: 0, w: 0, ph: 0, withered: false, art: padArt[(k + 1) % 3], rot: deco.range(0, 6.28), flower: deco.chance(0.4) });
      rows.push({ k, T, pads });
    }
    // extra pads and withered decoys, now that every row's main pad is known
    for (const row of rows) {
      if (row.k < 3) continue;
      const p = progress(row.T, 60, 1.3);
      const main = row.pads[0];
      const next = rows[row.k + 1]?.pads[0];
      const free = (x, r) => x - r >= X_MIN - 6 && x + r <= xMax + 6 && row.pads.every((o) => Math.abs(o.x - x) > o.r + r + o.sway + 14);
      // a withered pad, often right where you'd lazily land
      if (row.T > 9 && plan.chance(lerp(0.35, 0.75, p))) {
        const r = plan.range(24, 36);
        const prev = rows[row.k - 1].pads[0].x;
        let x = plan.chance(0.6) ? prev + plan.range(-20, 20) : plan.range(X_MIN + r, xMax - r);
        if (!free(x, r)) x = plan.range(X_MIN + r, xMax - r);
        if (free(x, r)) row.pads.push({ x, r, sway: 0, w: 0, ph: 0, withered: true, art: witherArt[row.k % 2], rot: deco.range(0, 6.28) });
      }
      // a spare good pad now and then (fewer as the pond gets wilder), always with a way on
      if (plan.chance(lerp(0.55, 0.12, p))) {
        const r = lerp(36, 22, p);
        const x = plan.range(X_MIN + r, xMax - r);
        if (free(x, r) && next && Math.abs(x - next.x) < lerp(150, 190, p)) {
          row.pads.push({ x, r, sway: 0, w: 0, ph: 0, withered: false, art: padArt[(row.k + 1) % 3], rot: deco.range(0, 6.28), flower: deco.chance(0.3) });
        }
      }
    }

    const padX = (pad, row, t) => pad.x + pad.sway * Math.sin(pad.w * (t - row.T) + pad.ph) - pad.sway * Math.sin(pad.ph);
    const sinkOf = (row, t) => clamp((t - (row.T - SINK_START)) / (SINK_START - SINK_END), 0, 1);
    const rowY = (row, t) => FROG_Y - ((row.T - t) / PERIOD) * ROW_D;

    const koi = Array.from({ length: 3 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, a: Math.random() * 6.28, sp: 25 + Math.random() * 25, art: koiArt[i], ph: Math.random() * 6 }));
    const glints = Array.from({ length: 22 }, () => ({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6.28, s: 0.6 + Math.random() }));
    const petals = Array.from({ length: 9 }, () => ({ x: Math.random() * W, y: Math.random() * H, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 8 }));
    const ripples = [];

    let clock = 0;
    let lastT = 0;
    let scroll = 0;
    let nextLand = 1; // index of the row the frog comes down on next
    let landed = 0; // squash timer
    let deadT = 0;
    let sinkY = 0;

    function ripple(x, y, max = 46, a = 0.6) {
      ripples.push({ x, y, r: 6, max, a });
    }

    const game = {
      dead: false,
      deathReason: '',
      get rows() {
        return rows;
      },
      get frog() {
        return frog;
      },
      padX,

      update(dt, dir, t) {
        clock += dt;
        lastT = t;
        frog.update(dt, dir);
        scroll += SCROLL * dt;
        landed = Math.max(0, landed - dt);

        const row = rows[nextLand];
        if (row && t + dt >= row.T) {
          nextLand++;
          let pad = null;
          for (const pd of row.pads) {
            if (pd.withered && sinkOf(row, row.T) >= 1) continue;
            if (Math.abs(frog.x - padX(pd, row, row.T)) < pd.r * 0.92 + 4) pad = pd;
          }
          if (!pad) {
            const sunk = row.pads.some((pd) => pd.withered && Math.abs(frog.x - pd.x) < pd.r + 6);
            this.dead = true;
            this.deathReason = sunk ? 'Jumped for a withered lily pad, but it had already sunk.' : 'Splash! Missed the lily pad and fell into the pond.';
            fx.burst(frog.x, FROG_Y, { count: 46, speed: 200, life: 0.9, size: 4, round: true, gravity: 380, angle: -Math.PI / 2, spread: 2.6, colors: ['#e6fbff', '#bfe9e6', '#ffffff', '#8fd0c8'] });
            ripple(frog.x, FROG_Y, 70, 0.8);
            ripple(frog.x, FROG_Y, 40, 0.6);
            return;
          }
          landed = 0.14;
          pad.bob = 1;
          ripple(padX(pad, row, row.T), FROG_Y, pad.r + 26, 0.45);
          fx.burst(frog.x, FROG_Y + 4, { count: 8, speed: 80, life: 0.45, size: 2.5, round: true, gravity: 200, colors: ['#e6fbff', '#c8f0e8'] });
        }

        // bubbles rising around sinking pads (cosmetic)
        for (let i = Math.max(1, nextLand - 1); i < Math.min(rows.length, nextLand + 6); i++) {
          const rw = rows[i];
          for (const pd of rw.pads) {
            if (!pd.withered || Math.random() > 0.12) continue;
            const y = rowY(rw, t);
            if (y < -40) continue;
            const a = Math.random() * 6.28;
            fx.burst(pd.x + Math.cos(a) * pd.r * 0.7, y + Math.sin(a) * pd.r * 0.7, { count: 1, speed: 8, life: 0.7, size: 3, round: true, colors: ['rgba(220,255,245,0.7)'] });
            const s = sinkOf(rw, t);
            if (s > 0 && s < 1 && Math.random() < 0.4) ripple(pd.x, y, pd.r + 14, 0.35);
          }
          for (const pd of rw.pads) if (pd.bob) pd.bob = Math.max(0, pd.bob - dt * 3);
        }

        for (const rp of ripples) {
          rp.r += 60 * dt;
          rp.a -= dt * 0.8;
        }
        for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].a <= 0 || ripples[i].r > ripples[i].max) ripples.splice(i, 1);
        for (const rp of ripples) rp.y += SCROLL * dt;
        fx.update(dt, SCROLL);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        sinkY += dt;
        for (const rp of ripples) {
          rp.r += 50 * dt;
          rp.a -= dt * 0.6;
        }
        if (Math.random() < 0.3) fx.burst(frog.x + (Math.random() - 0.5) * 10, FROG_Y, { count: 1, speed: 10, life: 0.8, size: 3, round: true, colors: ['rgba(220,255,245,0.7)'] });
        fx.update(dt);
      },

      render(g) {
        const t = lastT;
        const off = scroll % H;
        drawSprite(g, water, W / 2, H / 2 + off);
        drawSprite(g, water, W / 2, H / 2 + off - H);

        // koi gliding under the surface
        for (const k of koi) {
          k.a += Math.sin(clock * 0.5 + k.ph) * 0.006;
          k.x += Math.sin(k.a) * k.sp * 0.008;
          k.y += (-Math.cos(k.a) * k.sp + SCROLL * 0.6) * 0.008;
          if (k.x < -40) k.x = W + 40;
          if (k.x > W + 40) k.x = -40;
          if (k.y > H + 50) (k.y = -50), (k.x = Math.random() * W);
          if (k.y < -60) k.y = H + 40;
          drawSprite(g, k.art, k.x, k.y, { rot: k.a + Math.sin(clock * 4 + k.ph) * 0.08, size: 22, alpha: 0.55 });
        }

        // sunlight glinting on the water
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.15, -20, { size: 460, alpha: 0.3 });
        for (const s of glints) {
          const y = (s.y + scroll) % H;
          const a = Math.max(0, Math.sin(clock * 2 * s.s + s.ph)) * 0.35;
          if (a > 0.02) drawSprite(g, glint, s.x, y, { size: 14 * s.s, alpha: a });
        }
        g.globalCompositeOperation = 'source-over';

        // ripples
        g.lineWidth = 1.5;
        for (const rp of ripples) {
          g.strokeStyle = `rgba(220,250,240,${Math.max(0, rp.a)})`;
          g.beginPath();
          g.ellipse(rp.x, rp.y, rp.r, rp.r * 0.8, 0, 0, Math.PI * 2);
          g.stroke();
        }

        // pads, from the far end of the pond down
        const lo = Math.max(0, nextLand - 2);
        const hi = Math.min(rows.length, nextLand + 6);
        for (let i = hi - 1; i >= lo; i--) {
          const row = rows[i];
          const y = rowY(row, t);
          if (y < -70 || y > H + 70) continue;
          for (const pd of row.pads) {
            const x = padX(pd, row, t);
            let size = pd.r * 2 * (1 + 12 / PAD_ART_R / 2) * (1 + (pd.bob || 0) * 0.04);
            let alpha = 1;
            if (pd.withered) {
              const s = sinkOf(row, t);
              size *= 1 - s * 0.3;
              alpha = 1 - s;
              if (alpha <= 0.01) continue;
            }
            const rot = pd.rot + (pd.sway ? Math.sin(pd.w * (t - row.T) + pd.ph) * 0.2 : 0);
            drawSprite(g, pd.art, x, y + (pd.bob || 0) * 2, { rot, size, alpha });
            if (pd.flower) drawSprite(g, lotus, x + Math.cos(pd.rot) * pd.r * 0.45, y + Math.sin(pd.rot) * pd.r * 0.45, { size: Math.min(30, pd.r * 0.8), rot: pd.rot });
          }
        }

        // the frog: its shadow marks where it will land, and a ring closes in on the beat
        const prev = rows[nextLand - 1];
        const phase = this.dead ? 1 : clamp((t - (prev?.T ?? 0)) / PERIOD, 0, 1);
        const air = this.dead ? 0 : Math.sin(Math.PI * phase);
        if (!this.dead) {
          g.fillStyle = 'rgba(0,20,15,0.32)';
          g.beginPath();
          g.ellipse(frog.x + 3 + air * 6, FROG_Y + 4 + air * 6, 11 - air * 3, 13 - air * 3, 0, 0, Math.PI * 2);
          g.fill();
          if (t > 0.2) {
            const rr = lerp(30, 9, phase);
            g.strokeStyle = `rgba(255,248,215,${0.15 + 0.5 * phase})`;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(frog.x, FROG_Y, rr, 0, Math.PI * 2);
            g.stroke();
          }
          const squash = landed > 0 ? Math.sin((landed / 0.14) * Math.PI) * 0.12 : 0;
          const size = 34 * (1 + air * 0.32) * (1 + squash);
          drawSprite(g, frogArt[air > 0.25 ? 1 : 0], frog.x, FROG_Y - air * 18, { size, rot: frog.lean * 0.3 });
        } else {
          const k = clamp(1 - deadT * 1.2, 0, 1);
          if (k > 0) drawSprite(g, frogArt[1], frog.x, FROG_Y + sinkY * 6, { size: 34 * (0.7 + 0.3 * k), alpha: k * 0.8, rot: Math.sin(deadT * 8) * 0.3 });
        }

        fx.render(g);

        // petals drifting on the surface, and reeds on the banks
        for (const pt of petals) {
          pt.rot += pt.vr * 0.016;
          pt.x += pt.vx * 0.016;
          const y = (pt.y + scroll) % H;
          g.save();
          g.translate(pt.x, y);
          g.rotate(pt.rot);
          g.fillStyle = 'rgba(250,200,215,0.85)';
          g.beginPath();
          g.ellipse(0, 0, 4, 2.4, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
          if (pt.x < -10) pt.x = W + 10;
          if (pt.x > W + 10) pt.x = -10;
        }
        const roff = (scroll * 1.0) % H;
        drawSprite(g, reeds, W / 2, H / 2 + roff);
        drawSprite(g, reeds, W / 2, H / 2 + roff - H);
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
