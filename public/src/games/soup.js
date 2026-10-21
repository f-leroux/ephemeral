// Alphabet Soup — pasta letters float down a steaming bowl of tomato soup towards your spoon.
// Spoon them up in order to spell each word on the card: the next letter you need has to be
// caught (let it float past and that's it), and every other letter has to be dodged (slurp a
// wrong one and that's it too). Words get longer, the soup flows faster and thicker with
// letters, then it starts to swirl the letters sideways, throws in look-alikes (O for Q, P for
// R…) and finally sets them twirling. Every layout is built around a hidden route through every
// letter you need, so there is always a way.

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
const SPAWN_Y = 126; // letters surface just below the word card
const SPOON_Y = 532; // centre of the spoon's bowl
const CATCH_Y = SPOON_Y - 4;
const CATCH_R = 17;
const TILE_R = 13;
const TOUCH = CATCH_R + TILE_R;
const PASS_Y = CATCH_Y + 36; // a needed letter this far down has floated past
const SPOON_SPEED = 300;
const RIM = 14;
const TILE = 40; // letter sprite size
const SLOT = 30; // letter spacing on the word card
const CARD_Y = 54;
const CARD_H = 56;

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// letters that are easy to mistake for each other at a glance
const LOOKS = {
  A: 'RHV', B: 'PRDE', C: 'GOE', D: 'OBP', E: 'FBL', F: 'EPT', G: 'COQ', H: 'NMK', I: 'LTJ',
  J: 'IUL', K: 'XRH', L: 'IEJ', M: 'NWH', N: 'MHZ', O: 'QCGD', P: 'RBF', Q: 'OG', R: 'PBK',
  S: 'ZCG', T: 'IFY', U: 'VOJ', V: 'UYW', W: 'MVN', X: 'KYZ', Y: 'VTX', Z: 'NSX',
};

const WORDS = [
  ['PEA', 'HAM', 'BUN', 'PIE', 'JAM', 'FIG', 'EGG', 'YAM', 'OAT', 'SOUP', 'RICE', 'LEEK', 'KALE', 'BEAN', 'CORN', 'TOFU', 'LIME', 'PLUM', 'PEAR', 'TACO', 'MINT', 'SAGE', 'DILL', 'KIWI'],
  ['PASTA', 'BASIL', 'ONION', 'LEMON', 'MANGO', 'BREAD', 'CREAM', 'HONEY', 'CHILI', 'SALAD', 'PIZZA', 'OLIVE', 'THYME', 'CURRY', 'GRAVY', 'SPOON', 'BROTH', 'MELON', 'PEACH', 'TOAST'],
  ['TOMATO', 'CARROT', 'PEPPER', 'GARLIC', 'CELERY', 'POTATO', 'BUTTER', 'CHEESE', 'NOODLE', 'GINGER', 'LENTIL', 'SESAME', 'RADISH', 'TURNIP', 'FENNEL', 'NUTMEG', 'WAFFLE', 'MUFFIN'],
  ['PARSLEY', 'PUMPKIN', 'NOODLES', 'OREGANO', 'PAPRIKA', 'CABBAGE', 'SPINACH', 'LASAGNA', 'RAVIOLI', 'CROUTON', 'CHICKEN', 'PRETZEL', 'AVOCADO', 'BROWNIE'],
];
const YUMS = ['YUM!', 'SLURP!', 'TASTY!', 'MMM!', 'DELISH!'];

const speedAt = (t) => lerp(135, 250, progress(t, 60, 1.25));
const driftAt = (s) => 22 * clamp((s - 22) / 24, 0, 1); // the soup starts to swirl after 22s
const twirlAt = (s) => 0.45 * clamp((s - 34) / 20, 0, 1); // and the letters to twirl after 34s

// ---------- art ----------

function paintSoup(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#b3321a');
    base.addColorStop(0.5, '#d2491f');
    base.addColorStop(1, '#b3321a');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // everything is drawn three times, a texture height apart, so the texture tiles vertically
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // mottled, simmering colour
    for (let i = 0; i < 46; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(20, 60);
      const c = rng.pick(['rgba(240,110,50,0.22)', 'rgba(150,30,15,0.2)', 'rgba(250,140,60,0.16)']);
      wrap(() => {
        const gr = g.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, c);
        gr.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    // swirls of cream
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = rng.range(40, W - 40);
      const y = rng.range(0, H);
      const r = rng.range(18, 34);
      const a0 = rng.range(0, TAU);
      wrap(() => {
        for (const [lw, c] of [[7, 'rgba(255,235,210,0.12)'], [3, 'rgba(255,245,230,0.28)']]) {
          g.strokeStyle = c;
          g.lineWidth = lw;
          g.beginPath();
          for (let k = 0; k <= 40; k++) {
            const a = a0 + (k / 40) * TAU * 1.6;
            const rr = r * (1 - k / 52);
            const px = x + Math.cos(a) * rr;
            const py = y + Math.sin(a) * rr * 0.8;
            if (k) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          g.stroke();
        }
      });
    }
    // little golden pools of olive oil
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(1.5, 5);
      wrap(() => {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r);
        gr.addColorStop(0, 'rgba(255,230,140,0.75)');
        gr.addColorStop(0.7, 'rgba(240,160,50,0.45)');
        gr.addColorStop(1, 'rgba(240,160,50,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      });
    }
    // herb flecks and cracked pepper
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const herb = rng.chance(0.65);
      const c = herb ? rng.pick(['rgba(60,120,40,0.75)', 'rgba(90,150,50,0.7)', 'rgba(40,90,30,0.7)']) : 'rgba(40,20,15,0.6)';
      const w = herb ? rng.range(1.2, 3) : rng.range(0.8, 1.6);
      const h = herb ? rng.range(0.8, 1.6) : w;
      const a = rng.range(0, TAU);
      wrap(() => {
        g.fillStyle = c;
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.restore();
      });
    }
  }, 1);
}

// The glazed rim of the bowl down each side, with a blue band of little flowers.
function paintRim(H, side) {
  return makeSprite(RIM + 8, H, (g) => {
    g.translate(-(RIM + 8) / 2, -H / 2);
    if (side > 0) {
      g.translate(RIM + 8, 0);
      g.scale(-1, 1);
    }
    // its shadow on the soup
    const sh = g.createLinearGradient(RIM, 0, RIM + 8, 0);
    sh.addColorStop(0, 'rgba(70,10,0,0.45)');
    sh.addColorStop(1, 'rgba(70,10,0,0)');
    g.fillStyle = sh;
    g.fillRect(RIM, 0, 8, H);
    const glaze = g.createLinearGradient(0, 0, RIM, 0);
    glaze.addColorStop(0, '#d9cbb5');
    glaze.addColorStop(0.35, '#fffaf0');
    glaze.addColorStop(0.75, '#f1e7d6');
    glaze.addColorStop(1, '#bfae95');
    g.fillStyle = glaze;
    g.fillRect(0, 0, RIM, H);
    g.fillStyle = '#2f5fa8';
    g.fillRect(RIM * 0.3, 0, 2.2, H);
    g.fillStyle = 'rgba(47,95,168,0.5)';
    g.fillRect(RIM * 0.3 + 4, 0, 1, H);
    for (let y = 10; y < H; y += 26) {
      g.fillStyle = '#2f5fa8';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        g.beginPath();
        g.ellipse(RIM * 0.62 + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.7, 1.1, a, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#f2c04d';
      g.beginPath();
      g.arc(RIM * 0.62, y, 0.9, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(RIM * 0.42, 0, 1, H);
  }, 2);
}

// A pasta letter: golden semolina with a toasted edge, a soft highlight and a few specks.
function paintLetter(ch, rng) {
  const font = `900 31px ${BODY_FONT}`;
  const glyph = makeSprite(TILE, TILE, (g) => {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.strokeStyle = '#8f5216';
    g.lineWidth = 6.5;
    g.strokeText(ch, 0, 11);
    g.strokeStyle = '#d6953a';
    g.lineWidth = 3.2;
    g.strokeText(ch, 0, 11);
    const fill = g.createLinearGradient(0, -12, 0, 12);
    fill.addColorStop(0, '#fff5cc');
    fill.addColorStop(0.5, '#f5cd6c');
    fill.addColorStop(1, '#e3a64a');
    g.fillStyle = fill;
    g.fillText(ch, 0, 11);
    g.globalCompositeOperation = 'source-atop';
    const hl = g.createLinearGradient(-14, -14, 6, 6);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(-20, -20, 40, 40);
    g.fillStyle = 'rgba(160,95,30,0.35)';
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.arc(rng.range(-14, 14), rng.range(-14, 14), rng.range(0.4, 0.9), 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  });
  const shadow = makeSprite(TILE, TILE, (g) => {
    g.font = font;
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.strokeStyle = g.fillStyle = 'rgba(80,12,0,0.38)';
    g.lineWidth = 6.5;
    g.strokeText(ch, 0, 11);
    g.fillText(ch, 0, 11);
  }, 1.5);
  return { glyph, shadow };
}

function paintSpoon() {
  return makeSprite(64, 168, (g) => {
    const by = -52;
    // shadow on the soup
    g.fillStyle = 'rgba(70,10,0,0.3)';
    g.beginPath();
    g.ellipse(5, by + 7, 22, 28, 0, 0, TAU);
    g.fill();
    g.fillRect(-1, by + 30, 13, 120);
    // handle
    const hg = g.createLinearGradient(-8, 0, 8, 0);
    hg.addColorStop(0, '#7d8793');
    hg.addColorStop(0.3, '#eef2f5');
    hg.addColorStop(0.55, '#b9c1ca');
    hg.addColorStop(1, '#6f7985');
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(-3.5, by + 24);
    g.quadraticCurveTo(-3, by + 50, -7.5, 84);
    g.lineTo(7.5, 84);
    g.quadraticCurveTo(3, by + 50, 3.5, by + 24);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-1.5, by + 30);
    g.quadraticCurveTo(-1.2, by + 52, -3.6, 84);
    g.stroke();
    // engraved line along the handle
    g.strokeStyle = 'rgba(70,80,92,0.45)';
    g.beginPath();
    g.moveTo(-4, 40);
    g.lineTo(4, 40);
    g.moveTo(-4.3, 44);
    g.lineTo(4.3, 44);
    g.stroke();
    // the bowl
    const outer = g.createRadialGradient(-8, by - 10, 2, 0, by, 30);
    outer.addColorStop(0, '#ffffff');
    outer.addColorStop(0.45, '#c5ccd4');
    outer.addColorStop(1, '#68727e');
    g.fillStyle = outer;
    g.beginPath();
    g.ellipse(0, by, 21, 27, 0, 0, TAU);
    g.fill();
    const inner = g.createLinearGradient(0, by - 24, 0, by + 24);
    inner.addColorStop(0, '#5f6974');
    inner.addColorStop(0.5, '#a9b2bc');
    inner.addColorStop(1, '#e8ecf0');
    g.fillStyle = inner;
    g.beginPath();
    g.ellipse(0, by + 0.5, 17.5, 23.5, 0, 0, TAU);
    g.fill();
    // a little broth pooled in it
    const broth = g.createRadialGradient(0, by + 6, 2, 0, by + 6, 18);
    broth.addColorStop(0, 'rgba(225,95,45,0.75)');
    broth.addColorStop(1, 'rgba(170,45,20,0.6)');
    g.fillStyle = broth;
    g.beginPath();
    g.ellipse(0, by + 6, 14.5, 16, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,220,150,0.6)';
    g.beginPath();
    g.ellipse(-5, by + 1, 4, 2, -0.4, 0, TAU);
    g.fill();
    // shine
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(-11, by - 10, 2.6, 9, 0.25, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, by, 20.5, 26.5, 0, Math.PI * 1.05, Math.PI * 1.7);
    g.stroke();
  });
}

function paintGarnish() {
  const basil = makeSprite(26, 18, (g) => {
    const gr = g.createLinearGradient(-12, -6, 12, 6);
    gr.addColorStop(0, '#5fae45');
    gr.addColorStop(1, '#23602a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-12, 0);
    g.quadraticCurveTo(-2, -10, 12, 0);
    g.quadraticCurveTo(-2, 10, -12, 0);
    g.fill();
    g.strokeStyle = 'rgba(190,240,160,0.6)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-11, 0);
    g.lineTo(11, 0);
    for (const x of [-5, 0, 5]) {
      g.moveTo(x, 0);
      g.lineTo(x + 3, -4);
      g.moveTo(x, 0);
      g.lineTo(x + 3, 4);
    }
    g.stroke();
  });
  const crouton = makeSprite(18, 18, (g) => {
    g.fillStyle = 'rgba(80,15,0,0.3)';
    g.fillRect(-5, -4, 13, 12);
    const gr = g.createLinearGradient(-6, -6, 6, 6);
    gr.addColorStop(0, '#f6d692');
    gr.addColorStop(1, '#b8752e');
    g.fillStyle = gr;
    g.fillRect(-6.5, -6.5, 12, 12);
    g.strokeStyle = '#8c5420';
    g.lineWidth = 1.4;
    g.strokeRect(-6.5, -6.5, 12, 12);
    g.fillStyle = 'rgba(120,70,20,0.5)';
    for (const [x, y] of [[-3, -2], [2, 1], [-1, 3], [3, -4]]) g.fillRect(x, y, 1.3, 1.3);
  });
  const pea = makeSprite(12, 12, (g) => {
    const gr = g.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 5);
    gr.addColorStop(0, '#c4ef84');
    gr.addColorStop(1, '#3f8a2a');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 4.6, 0, TAU);
    g.fill();
  });
  const carrot = makeSprite(18, 18, (g) => {
    const gr = g.createRadialGradient(-2, -2, 1, 0, 0, 8);
    gr.addColorStop(0, '#ffb257');
    gr.addColorStop(1, '#e06a12');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 7.5, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,215,150,0.75)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 4, 0, TAU);
    g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5);
      g.lineTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5);
      g.stroke();
    }
  });
  return [basil, crouton, pea, carrot, pea, basil];
}

export default {
  id: 'soup',
  title: 'Alphabet Soup',
  emoji: '🥣',
  tagline: "Spoon up the word's letters in order. Never miss or slurp a wrong one.",
  colors: { bg: '#b8361a', fg: '#fff1d6', accent: '#ffc845' },

  // Happy hardcore at 160 BPM in F major: four-on-the-floor, offbeat bass, rave piano.
  music: {
    cps: 40 / 60,
    setup: `
      const kick = note("f2*4").s("sine").decay(0.17).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ white]*4").decay(0.14).sustain(0).hpf(6500).gain(0.032)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5000).gain(0.14).room(0.2)
      const roll = s("pink*8").decay(0.05).sustain(0).hpf(1800).lpf(5000).gain("[0.03 0.04 0.05 0.06 0.07 0.08 0.09 0.1]")
      const bass = note("<[~ f2]*4 [~ c3]*4 [~ d3]*4 [~ bb2]*4>").s("sawtooth").decay(0.12).sustain(0.15).release(0.04)
        .lpf(saw.range(500, 1700).slow(40)).lpq(4).gain(0.36)
      const chords = "<[f4,a4,c5] [e4,g4,c5] [d4,f4,a4] [d4,f4,bb4]>"
      const piano = note(chords).struct("x ~ ~ x ~ ~ x ~").s("triangle").decay(0.3).sustain(0.05).release(0.1).gain(0.13).room(0.3)
      const piano2 = note(chords).add(note(12)).struct("x ~ ~ x ~ ~ x ~").s("square").decay(0.18).sustain(0).lpf(2600).gain(0.035).pan(0.6)
      const stabs = note(chords).struct("[~ x]*4").s("sawtooth").decay(0.1).sustain(0.15).release(0.04)
        .lpf(saw.range(900, 2600).slow(40)).gain(0.055).pan(0.4)
      const tune = "<[c5 f5 a5 c6 a5 f5 g5 a5] [g5 ~ e5 c5 e5 g5 c6 g5] [a5 f5 d5 f5 a5 d6 c6 a5] [bb5 a5 g5 f5 d5 f5 g5 ~] [f5 a5 c6 f6 e6 c6 a5 c6] [e6 ~ d6 c6 g5 c6 e6 g6] [f6 e6 d6 a5 f5 a5 d6 f6] [d6 c6 bb5 g5 a5 ~ c6 ~]>"
      const lead = note(tune).s("square").decay(0.15).sustain(0.3).release(0.08).lpf(2500)
        .gain(0.075).room(0.25).delay(0.2).delaytime(0.28).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.14).sustain(0.25).release(0.05).lpf(1600).gain(0.05).pan(0.45)
      const arp = note("<[f5 a5 c6 a5]*4 [e5 g5 c6 g5]*4 [d5 f5 a5 f5]*4 [d5 f5 bb5 f5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(4000).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, piano, stabs)],
      [10, stack(kick, hats, clap, bass, piano, stabs, lead)],
      [10, stack(kick, hats, clap, shaker, bass, piano, piano2, stabs, lead, arp)],
      [12, stack(kick, hats, open, clap, shaker, roll, bass, piano, piano2, stabs, lead, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- how far the soup has flowed by time t, so every letter's height is exact ----
    const N = Math.ceil(80 / STEP);
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + speedAt((i - 0.5) * STEP) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, N - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };
    const arrival = (s) => {
      const goal = cumAt(s) + (CATCH_Y - SPAWN_Y);
      let lo = s;
      let hi = 80;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (cumAt(m) < goal) lo = m;
        else hi = m;
      }
      return hi;
    };
    const xAt = (o, t) => o.x0 + o.amp * Math.sin(o.om * (t - o.s) + o.ph);

    // ---- the words, getting longer, and every letter of them in order ----
    const pools = WORDS.map((l) => plan.shuffle(l));
    const used = [0, 0, 0, 0];
    const words = [];
    const letters = [];
    let s = 0.6;
    for (let w = 0; s < 62; w++) {
      const tier = w < 2 ? 0 : w < 5 ? 1 : w < 9 ? 2 : 3;
      const word = pools[tier][used[tier]++ % pools[tier].length];
      words.push({ word, start: letters.length });
      for (let i = 0; i < word.length; i++) {
        letters.push({ ch: word[i], s, w, i });
        s += lerp(1.0, 0.52, progress(s, 60, 1.1));
      }
      s += 1.5; // a breather between words, to read the next one before its letters arrive
    }

    // ---- the needed letters, each within easy reach of the last: that's the hidden route ----
    const tiles = [];
    const lane = [{ A: 0, x: W / 2 }];
    {
      let px = W / 2;
      let pA = 0;
      letters.forEach((L, idx) => {
        const A = arrival(L.s);
        const amp = driftAt(L.s);
        const om = plan.range(1.4, 2.2);
        const ph = plan.range(0, TAU);
        const maxDx = Math.min(190, 0.55 * SPOON_SPEED * (A - pA));
        const mag = plan.range(0.35, 1) * maxDx;
        const d = plan.chance(0.5) ? -1 : 1;
        let x = px + d * mag;
        if (x < 46 || x > W - 46) x = px - d * mag;
        x = clamp(x, 46, W - 46);
        const x0 = clamp(x - amp * Math.sin(om * (A - L.s) + ph), 24 + amp, W - 24 - amp);
        const o = { ch: L.ch, s: L.s, A, x0, amp, om, ph, rotA: twirlAt(L.s), rph: plan.range(0, TAU), target: true, idx };
        tiles.push(o);
        px = xAt(o, A);
        pA = A;
        lane.push({ A, x: px });
      });
    }
    const laneX = (t) => {
      let lo = 0;
      let hi = lane.length - 1;
      if (t >= lane[hi].A) return lane[hi].x;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (lane[m].A <= t) lo = m;
        else hi = m;
      }
      const a = lane[lo];
      const b = lane[hi];
      return lerp(a.x, b.x, (t - a.A) / (b.A - a.A));
    };

    // ---- the wrong letters, never on the route and never the letter you need at the time ----
    for (const o of tiles) o.cs = cumAt(o.s);
    {
      let ds = 0.25;
      while (ds < 62) {
        const p = progress(ds, 60, 1.1);
        const n = 1 + (plan.chance(lerp(0.45, 0.95, p)) ? 1 : 0) + (plan.chance(lerp(-0.1, 0.55, p)) ? 1 : 0);
        const A = arrival(ds);
        const cs = cumAt(ds);
        const hunted = tiles.find((o) => o.target && o.A >= A - 0.2);
        const banned = new Set(tiles.filter((o) => o.target && o.A > A - 0.7 && o.A < A + 2.4).map((o) => o.ch));
        const amp = driftAt(ds);
        for (let k = 0; k < n; k++) {
          const om = plan.range(1.4, 2.2);
          const ph = plan.range(0, TAU);
          let ch;
          const looks = hunted ? [...LOOKS[hunted.ch]].filter((c) => !banned.has(c)) : [];
          if (looks.length && plan.chance(lerp(0.2, 0.65, p))) ch = plan.pick(looks);
          else {
            const pool = [...ALPHA].filter((c) => !banned.has(c));
            ch = plan.pick(pool);
          }
          for (let tries = 0; tries < 10; tries++) {
            const o = { ch, s: ds, A, cs, x0: plan.range(24 + amp, W - 24 - amp), amp, om, ph, rotA: twirlAt(ds), rph: plan.range(0, TAU), target: false };
            let ok = true;
            for (let j = -6; j <= 6 && ok; j++) {
              const t = A + j * 0.04;
              if (Math.abs(xAt(o, t) - laneX(t)) < 42) ok = false;
            }
            for (const q of tiles) {
              if (!ok) break;
              if (Math.abs(q.cs - cs) < 36 && Math.abs(q.x0 - o.x0) < 36) ok = false;
            }
            if (ok) {
              tiles.push(o);
              break;
            }
          }
        }
        ds += lerp(0.68, 0.36, p);
      }
    }
    tiles.sort((a, b) => a.s - b.s);

    // ---- art ----
    const soup = paintSoup(W, H, art);
    const rims = [paintRim(H, -1), paintRim(H, 1)];
    const pasta = {};
    for (const c of ALPHA) pasta[c] = paintLetter(c, art);
    const spoonArt = paintSpoon();
    const garnishArt = paintGarnish();
    const vignette = vignetteSprite(W, H, 0.5, '60,8,0');
    const steamArt = glowSprite('rgba(255,248,240,0.5)', 40);
    const oilGlow = glowSprite('rgba(255,200,90,0.6)', 10);
    const goldGlow = glowSprite('rgba(255,210,90,0.8)', 26);
    const redGlow = glowSprite('rgba(255,60,40,0.85)', 30);

    // ---- cosmetic state (Math.random is fine here) ----
    const garnish = [];
    for (let i = 0; i < 14; i++) {
      garnish.push({
        art: garnishArt[i % garnishArt.length],
        x: RIM + 10 + Math.random() * (W - 2 * RIM - 20),
        y: Math.random() * H,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 0.6,
        k: 0.85 + Math.random() * 0.3,
      });
    }
    const oils = [];
    for (let i = 0; i < 10; i++) oils.push({ x: RIM + Math.random() * (W - 2 * RIM), y: Math.random() * H, ph: Math.random() * TAU });
    const steam = [];
    for (let i = 0; i < 7; i++) steam.push({ x: Math.random() * W, y: 200 + Math.random() * 440, v: 18 + Math.random() * 16, size: 90 + Math.random() * 70, ph: Math.random() * TAU });
    const splash = createParticles();
    const sparks = createParticles();
    const flies = [];
    const pops = [];
    const landed = new Set();

    // ---- run state ----
    const spoon = createMover({ x: W / 2, minX: RIM + 12, maxX: W - RIM - 12, speed: SPOON_SPEED, accel: 20 });
    const live = [];
    let next = 0;
    let time = 0;
    let clock = 0;
    let flow = 0; // soup speed right now, for the cosmetics
    let needIdx = 0;
    let doneWord = -1;
    let doneAt = -9;
    let culprit = null;

    const slotX = (len, i) => W / 2 + (i - (len - 1) / 2) * SLOT;

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir) {
        if (this.dead) return;
        time += dt;
        clock += dt;
        flow = speedAt(time);
        spoon.update(dt, dir);
        while (next < tiles.length && tiles[next].s <= time) live.push({ ...tiles[next++] });

        const base = cumAt(time);
        const sx = spoon.x;
        for (let i = live.length - 1; i >= 0; i--) {
          const o = live[i];
          o.y = SPAWN_Y + base - o.cs;
          o.x = xAt(o, time);
          if (o.y > H + 40) {
            live.splice(i, 1);
            continue;
          }
          if (o.gone) continue;
          const dx = o.x - sx;
          const dy = o.y - CATCH_Y;
          const need = letters[needIdx];
          if (dx * dx + dy * dy < TOUCH * TOUCH) {
            if (need && o.ch === need.ch) {
              o.gone = true;
              flies.push({ ch: o.ch, x: o.x, y: o.y, w: need.w, i: need.i, idx: needIdx, t: 0 });
              splash.burst(o.x, o.y + 4, { count: 10, speed: 110, life: 0.45, size: 3.2, colors: ['#e2582a', '#f08a45', '#ffd08a'], gravity: 260, round: true, angle: -Math.PI / 2, spread: 2.4 });
              needIdx++;
              const wd = words[need.w];
              if (needIdx === wd.start + wd.word.length) {
                doneWord = need.w;
                doneAt = clock;
                pops.push({ text: YUMS[need.w % YUMS.length], x: W / 2, y: CARD_Y + CARD_H + 34, t: 0 });
              }
            } else {
              culprit = o;
              this.dead = true;
              this.deathReason = need
                ? `Slurped ${aAn(o.ch)} ${o.ch}, but ${words[need.w].word} needed ${aAn(need.ch)} ${need.ch}.`
                : `Slurped ${aAn(o.ch)} ${o.ch}.`;
              splash.burst(o.x, o.y, { count: 30, speed: 200, life: 0.8, size: 4, colors: ['#e2582a', '#f08a45', '#ffd08a', '#fff3cf'], gravity: 300, round: true });
              return;
            }
          } else if (o.target && o.idx === needIdx && o.y > PASS_Y) {
            culprit = o;
            this.dead = true;
            this.deathReason = `The ${o.ch} of ${words[need.w].word} floated past the spoon.`;
            splash.burst(o.x, o.y, { count: 14, speed: 90, life: 0.6, size: 3, colors: ['#e2582a', '#ffd08a'], gravity: 120, round: true });
            return;
          }
        }

        // a little wake behind the spoon as it cuts through the soup
        if (Math.abs(spoon.vx) > 80 && Math.random() < dt * 30) {
          splash.burst(sx - Math.sign(spoon.vx) * 18, SPOON_Y + 8, { count: 1, speed: 30, life: 0.5, size: 2.4, colors: ['#f08a45', '#ffc98a'], round: true, angle: Math.PI / 2, spread: 1 });
        }
        this.cosmetics(dt);
      },

      cosmetics(dt) {
        for (const gnh of garnish) {
          gnh.y += flow * gnh.k * dt;
          gnh.rot += gnh.vr * dt;
          if (gnh.y > H + 20) {
            gnh.y = -20;
            gnh.x = RIM + 10 + Math.random() * (W - 2 * RIM - 20);
          }
        }
        for (const o of oils) {
          o.y += flow * dt;
          if (o.y > H + 10) {
            o.y = -10;
            o.x = RIM + Math.random() * (W - 2 * RIM);
          }
        }
        for (const st of steam) {
          st.y -= st.v * dt;
          if (st.y < 120) {
            st.y = H + 40;
            st.x = Math.random() * W;
          }
        }
        for (let i = flies.length - 1; i >= 0; i--) {
          const f = flies[i];
          f.t += dt / 0.34;
          if (f.t >= 1) {
            landed.add(f.idx);
            const wd = words[f.w].word;
            sparks.burst(slotX(wd.length, f.i), CARD_Y + 36, { count: 10, speed: 90, life: 0.45, size: 2.5, colors: ['#fff3b0', '#ffc845', '#ffffff'], round: true });
            flies.splice(i, 1);
          }
        }
        for (let i = pops.length - 1; i >= 0; i--) {
          pops[i].t += dt;
          if (pops[i].t > 0.9) pops.splice(i, 1);
        }
        splash.update(dt, flow * 0.6);
        sparks.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        flow *= Math.max(0, 1 - 2.5 * dt);
        this.cosmetics(dt);
      },

      render(g) {
        // the soup, flowing towards the spoon
        const off = cumAt(time) % H;
        g.drawImage(soup.canvas, 0, off - H, W, H);
        g.drawImage(soup.canvas, 0, off, W, H);
        g.globalCompositeOperation = 'lighter';
        for (const o of oils) drawSprite(g, oilGlow, o.x, o.y, { alpha: 0.35 + 0.25 * Math.sin(clock * 2 + o.ph) });
        g.globalCompositeOperation = 'source-over';
        for (const gnh of garnish) drawSprite(g, gnh.art, gnh.x, gnh.y, { rot: gnh.rot });

        // pasta letters
        for (const o of live) {
          if (o.gone) continue;
          const age = time - o.s;
          const k = clamp(age / 0.3, 0, 1);
          const size = TILE * (0.55 + 0.45 * easeOutCubic(k));
          const rot = o.rotA * Math.sin(1.1 * age + o.rph);
          if (k < 1) {
            g.strokeStyle = `rgba(255,220,180,${0.5 * (1 - k)})`;
            g.lineWidth = 1.5;
            g.beginPath();
            g.ellipse(o.x, o.y + 2, 10 + 22 * k, 5 + 9 * k, 0, 0, TAU);
            g.stroke();
          }
          const art = pasta[o.ch];
          drawSprite(g, art.shadow, o.x + 2.5, o.y + 3.5, { size, rot, alpha: k });
          drawSprite(g, art.glyph, o.x, o.y, { size, rot, alpha: 0.3 + 0.7 * k });
        }
        if (culprit) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, culprit.x, culprit.y, { size: 70 + 8 * Math.sin(clock * 14) });
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = 'rgba(255,70,50,0.9)';
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(culprit.x, culprit.y, 22, 0, TAU);
          g.stroke();
          if (!culprit.gone) drawSprite(g, pasta[culprit.ch].glyph, culprit.x, culprit.y, { size: TILE * 1.1 });
        }

        // the spoon, with the letter it's after engraved in the bowl
        const sx = spoon.x;
        const lean = spoon.lean;
        g.save();
        g.translate(sx, SPOON_Y);
        g.rotate(lean * 0.1);
        if (Math.abs(lean) > 0.25) {
          g.strokeStyle = `rgba(255,215,170,${0.25 * Math.abs(lean)})`;
          g.lineWidth = 1.5;
          for (const r of [26, 33]) {
            g.beginPath();
            if (lean > 0) g.ellipse(0, 4, r, r * 1.15, 0, Math.PI * 0.6, Math.PI * 1.4);
            else g.ellipse(0, 4, r, r * 1.15, 0, -Math.PI * 0.4, Math.PI * 0.4);
            g.stroke();
          }
        }
        drawSprite(g, spoonArt, 0, 52);
        const need = letters[needIdx];
        if (need && !this.dead) {
          g.font = `800 17px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(90,20,5,0.55)';
          g.strokeText(need.ch, 0, 3);
          g.fillStyle = 'rgba(255,244,225,0.85)';
          g.fillText(need.ch, 0, 3);
        }
        g.restore();

        splash.render(g);

        // steam rising off the bowl
        for (const st of steam) {
          const a = 0.08 * clamp((H + 40 - st.y) / 120, 0, 1) * clamp((st.y - 120) / 160, 0, 1);
          drawSprite(g, steamArt, st.x + Math.sin(clock * 0.7 + st.ph) * 16, st.y, { size: st.size, alpha: a });
        }

        drawSprite(g, rims[0], (RIM + 8) / 2, H / 2);
        drawSprite(g, rims[1], W - (RIM + 8) / 2, H / 2);
        drawSprite(g, vignette, W / 2, H / 2);

        // the word card
        const showDone = doneWord >= 0 && clock - doneAt < 0.45;
        const wIdx = showDone ? doneWord : need ? need.w : words.length - 1;
        const wd = words[wIdx];
        const len = wd.word.length;
        const cw = Math.max(170, len * SLOT + 36);
        g.fillStyle = 'rgba(70,10,0,0.35)';
        g.beginPath();
        g.roundRect(W / 2 - cw / 2 + 2, CARD_Y + 3, cw, CARD_H, 12);
        g.fill();
        const card = g.createLinearGradient(0, CARD_Y, 0, CARD_Y + CARD_H);
        card.addColorStop(0, '#fffaf0');
        card.addColorStop(1, '#f3e4c8');
        g.fillStyle = card;
        g.beginPath();
        g.roundRect(W / 2 - cw / 2, CARD_Y, cw, CARD_H, 12);
        g.fill();
        g.strokeStyle = '#2f5fa8';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(W / 2 - cw / 2 + 4, CARD_Y + 4, cw - 8, CARD_H - 8, 9);
        g.stroke();
        g.font = `800 9px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#2f5fa8';
        g.fillText(`WORD ${wIdx + 1}`, W / 2, CARD_Y + 13);
        if (showDone) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, goldGlow, W / 2, CARD_Y + 36, { size: cw * 1.1, alpha: 0.5 * (1 - (clock - doneAt) / 0.45) });
          g.globalCompositeOperation = 'source-over';
        }
        for (let i = 0; i < len; i++) {
          const gi = wd.start + i;
          const x = slotX(len, i);
          const y = CARD_Y + 36;
          const art = pasta[wd.word[i]];
          if (landed.has(gi)) {
            drawSprite(g, art.glyph, x, y, { size: 31 });
          } else if (gi === needIdx && !showDone) {
            const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
            g.fillStyle = `rgba(255,200,69,${0.25 + 0.2 * pulse})`;
            g.strokeStyle = '#d2491f';
            g.lineWidth = 2;
            g.beginPath();
            g.roundRect(x - 13, y - 15, 26, 30, 6);
            g.fill();
            g.stroke();
            g.fillStyle = '#7a2a10';
            g.font = `900 22px ${BODY_FONT}`;
            g.fillText(wd.word[i], x, y + 1);
            g.fillStyle = '#d2491f';
            g.beginPath();
            g.moveTo(x - 4, y + 19 + pulse * 1.5);
            g.lineTo(x + 4, y + 19 + pulse * 1.5);
            g.lineTo(x, y + 15 + pulse * 1.5);
            g.closePath();
            g.fill();
          } else {
            g.fillStyle = 'rgba(122,42,16,0.35)';
            g.font = `900 22px ${BODY_FONT}`;
            g.fillText(wd.word[i], x, y + 1);
          }
        }

        // caught letters flying up to their place on the card
        for (const f of flies) {
          const fw = words[f.w].word;
          const e = easeOutCubic(clamp(f.t, 0, 1));
          const tx = slotX(fw.length, f.i);
          const x = lerp(f.x, tx, e);
          const y = lerp(f.y, CARD_Y + 36, e) - Math.sin(e * Math.PI) * 30;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, goldGlow, x, y, { size: 44, alpha: 0.6 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, pasta[f.ch].glyph, x, y, { size: lerp(TILE, 31, e), rot: (1 - e) * 0.6 });
        }
        sparks.render(g, true);

        for (const p of pops) {
          const k = p.t / 0.9;
          const sc = 0.7 + 0.5 * easeOutCubic(Math.min(1, p.t / 0.2));
          g.save();
          g.translate(p.x, p.y - k * 24);
          g.scale(sc, sc);
          g.globalAlpha = 1 - k * k;
          g.font = `900 30px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.lineWidth = 6;
          g.strokeStyle = '#7a2a10';
          g.strokeText(p.text, 0, 0);
          g.fillStyle = '#ffd35a';
          g.fillText(p.text, 0, 0);
          g.restore();
        }
        g.globalAlpha = 1;
      },
    };
    return game;
  },
};

function aAn(ch) {
  return 'AEFHILMNORSX'.includes(ch) ? 'an' : 'a';
}
