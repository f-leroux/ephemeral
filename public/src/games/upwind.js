// Upwind — a little sailing dinghy beats up a channel between Greek islands, straight into the
// wind. A boat can't sail into the wind, so it zigzags: it is always sailing diagonally up-left or
// up-right, and the only thing you choose is when to tack (swing through the wind onto the other
// diagonal). Tacking isn't instant: the boat swings over in a curve. Thread the rocks, channel
// buoys, moored fishing boats and (later) fishing nets, and don't run ashore. From 20s the wind
// shifts back and forth, so one tack slants more sideways than the other.

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

const BOAT_Y = 540;
const X0 = 180; // where the boat starts, already sailing up-right
const K = 6; // how quickly the boat swings onto a new tack
const SHORE = 30; // the narrowest the land at each side gets
const INSET = 34; // how much further the coast can bulge into the channel
const RMIN = 92; // the reference course always stays between these
const RMAX = 268;
const STEP = 1 / 120;
const TILE = 320;
const HULL = [
  [0, -14, 8], // [along, (unused), radius]: the boat's hitbox, three circles along the hull
  [14, 0, 6],
  [-13, 0, 6],
];

const vyAt = (t) => lerp(112, 250, progress(t, 60, 1.15)); // forward speed up the channel
// sideways speed on a tack (the boat gathers way over the first 2.5s)
const latAt = (t) => lerp(108, 204, progress(t, 60, 1.1)) * Math.min(1, 0.25 + 0.3 * t);
const shiftAt = (t, sign) => (t < 20 ? 0 : sign * 0.3 * Math.min(1, (t - 20) / 6) * Math.sin(0.5 * (t - 20)));

const FOAM = ['#ffffff', '#e6f7ff', '#bfe9ff'];

// ---------- art ----------

function paintWater(W, rng) {
  // a vertically tiling layer of wavelets and troughs, drawn over the base colour
  return makeSprite(W, TILE, (g) => {
    g.translate(-W / 2, -TILE / 2);
    const draw = (fn) => {
      for (const dy of [-TILE, 0, TILE]) fn(dy);
    };
    for (let i = 0; i < 70; i++) {
      const x = rng.range(-10, W + 10);
      const y = rng.range(0, TILE);
      const w = rng.range(14, 40);
      const a = rng.range(0.05, 0.13);
      draw((dy) => {
        g.strokeStyle = `rgba(5,25,70,${a * 1.4})`;
        g.lineWidth = rng.range(2, 4);
        g.beginPath();
        g.moveTo(x - w / 2, y + dy + 3);
        g.quadraticCurveTo(x, y + dy + 7, x + w / 2, y + dy + 3);
        g.stroke();
      });
    }
    for (let i = 0; i < 110; i++) {
      const x = rng.range(-10, W + 10);
      const y = rng.range(0, TILE);
      const w = rng.range(8, 26);
      const a = rng.range(0.12, 0.3);
      draw((dy) => {
        g.strokeStyle = `rgba(150,215,255,${a})`;
        g.lineWidth = rng.range(1, 2);
        g.beginPath();
        g.moveTo(x - w / 2, y + dy);
        g.quadraticCurveTo(x, y + dy - 4, x + w / 2, y + dy);
        g.stroke();
      });
    }
  }, 1.5);
}

function paintRock(rng) {
  const R = 26;
  return makeSprite(R * 2 + 16, R * 2 + 16, (g) => {
    const pts = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = R * rng.range(0.78, 1.05);
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.92]);
    }
    const path = (k = 1, dx = 0, dy = 0) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * k + dx, y * k + dy) : g.moveTo(x * k + dx, y * k + dy)));
      g.closePath();
    };
    // seaweed and shallows round the waterline
    g.fillStyle = 'rgba(70,200,190,0.45)';
    path(1.22);
    g.fill();
    g.fillStyle = 'rgba(40,90,60,0.85)';
    path(1.06, 1, 2);
    g.fill();
    // the rock itself, lit from the upper left
    const grad = g.createLinearGradient(-R, -R, R, R);
    grad.addColorStop(0, '#f1dcc0');
    grad.addColorStop(0.35, '#b99c80');
    grad.addColorStop(0.75, '#6d5a50');
    grad.addColorStop(1, '#3a2f35');
    g.fillStyle = grad;
    path(1);
    g.fill();
    // facets and cracks
    for (let i = 0; i < 9; i++) {
      const x = rng.range(-R * 0.6, R * 0.6);
      const y = rng.range(-R * 0.6, R * 0.6);
      const s = rng.range(5, 12);
      g.fillStyle = x + y < 0 ? 'rgba(255,240,215,0.3)' : 'rgba(30,20,30,0.25)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + s, y + s * 0.4);
      g.lineTo(x + s * 0.3, y + s);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(40,25,30,0.45)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const x = rng.range(-R * 0.5, R * 0.5);
      const y = rng.range(-R * 0.5, R * 0.5);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-8, 8), y + rng.range(4, 10));
      g.lineTo(x + rng.range(-8, 8), y + rng.range(10, 16));
      g.stroke();
    }
    // a couple of gull droppings and a bright rim
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 6; i++) g.fillRect(rng.range(-R * 0.5, R * 0.3), rng.range(-R * 0.5, R * 0.2), 1.6, 1.6);
    g.strokeStyle = 'rgba(255,240,220,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 6; i < n + 2; i++) {
      const [x, y] = pts[i % n];
      if (i === 6) g.moveTo(x * 0.96, y * 0.96);
      else g.lineTo(x * 0.96, y * 0.96);
    }
    g.stroke();
  });
}

// the dry hillside of the islands: olive-green scrub, pale stones and terrace walls (tiles vertically)
function paintLand(W, rng) {
  return makeSprite(W, TILE, (g) => {
    g.translate(-W / 2, -TILE / 2);
    g.fillStyle = '#93894f';
    g.fillRect(0, 0, W, TILE);
    for (let i = 0; i < 700; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, TILE);
      const c = rng.pick(['rgba(120,135,70,0.55)', 'rgba(190,170,110,0.5)', 'rgba(80,90,45,0.45)', 'rgba(225,210,170,0.45)']);
      const r = rng.range(1, 3.2);
      for (const dy of [-TILE, 0, TILE]) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    // dry-stone terrace walls
    g.strokeStyle = 'rgba(235,222,190,0.45)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      const y0 = (k + 0.5) * (TILE / 6);
      g.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const y = y0 + Math.sin(x / 40 + k) * 4;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 1);
}

function paintBuoy(red) {
  return makeSprite(26, 26, (g) => {
    g.fillStyle = 'rgba(0,20,60,0.35)';
    g.beginPath();
    g.arc(2, 3, 9, 0, Math.PI * 2);
    g.fill();
    const body = g.createRadialGradient(-3, -3, 1, 0, 0, 9);
    body.addColorStop(0, red ? '#ff9a8a' : '#9af2b0');
    body.addColorStop(0.5, red ? '#e0322a' : '#1fae55');
    body.addColorStop(1, red ? '#7a1010' : '#0b5a2a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.stroke();
    // the top mark: a can (square) for red, a cone (triangle) for green
    g.fillStyle = red ? '#b31b17' : '#11793b';
    if (red) g.fillRect(-3, -3, 6, 6);
    else {
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(4, 3);
      g.lineTo(-4, 3);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(-3, -4, 1.6, 0, Math.PI * 2);
    g.fill();
  });
}

// a Greek fishing caïque seen from above, pointing up
function paintCaique(rng) {
  const w = 26;
  const h = 56;
  const trim = rng.pick(['#1f5fbf', '#2a8fd0', '#c8312a']);
  const band = rng.pick(['#f4c534', '#e9762f', '#36a36b']);
  return makeSprite(w + 8, h + 8, (g) => {
    const hull = () => {
      g.beginPath();
      g.moveTo(0, -h / 2);
      g.bezierCurveTo(w * 0.55, -h * 0.3, w / 2, h * 0.25, w * 0.3, h / 2);
      g.lineTo(-w * 0.3, h / 2);
      g.bezierCurveTo(-w / 2, h * 0.25, -w * 0.55, -h * 0.3, 0, -h / 2);
      g.closePath();
    };
    g.save();
    g.translate(3, 4);
    g.fillStyle = 'rgba(0,20,60,0.35)';
    hull();
    g.fill();
    g.restore();
    const side = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    side.addColorStop(0, '#ffffff');
    side.addColorStop(1, '#c9d4e2');
    g.fillStyle = side;
    hull();
    g.fill();
    g.strokeStyle = trim;
    g.lineWidth = 2.4;
    hull();
    g.stroke();
    // deck planks
    g.save();
    g.scale(0.78, 0.86);
    hull();
    g.clip();
    g.fillStyle = '#b77a45';
    g.fillRect(-w, -h, w * 2, h * 2);
    g.fillStyle = 'rgba(70,35,15,0.35)';
    for (let x = -w; x < w; x += 4) g.fillRect(x, -h, 1, h * 2);
    g.restore();
    g.strokeStyle = band;
    g.lineWidth = 1.4;
    g.save();
    g.scale(0.9, 0.93);
    hull();
    g.stroke();
    g.restore();
    // wheelhouse, nets and a coil of rope
    const wh = g.createLinearGradient(0, 2, 0, 16);
    wh.addColorStop(0, '#ffffff');
    wh.addColorStop(1, '#d6dde8');
    g.fillStyle = wh;
    g.fillRect(-6, 4, 12, 12);
    g.fillStyle = trim;
    g.fillRect(-6, 4, 12, 2.5);
    g.fillStyle = '#8fd0ff';
    g.fillRect(-4, 7, 8, 2);
    g.fillStyle = '#e8b04a';
    g.beginPath();
    g.ellipse(0, -9, 6, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,70,20,0.6)';
    g.lineWidth = 0.6;
    for (let i = -5; i <= 5; i += 2) {
      g.beginPath();
      g.moveTo(i, -14);
      g.lineTo(i, -4);
      g.stroke();
    }
    g.strokeStyle = '#efe2c2';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 21, 3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#5a3a20';
    g.fillRect(-1, -22, 2, 3);
  });
}

// the player's dinghy, pointing up: white hull, teak deck, navy trim
function paintHull(shadow) {
  return makeSprite(30, 54, (g) => {
    const hull = () => {
      g.beginPath();
      g.moveTo(0, -24);
      g.bezierCurveTo(10, -14, 12, 6, 8, 22);
      g.lineTo(-8, 22);
      g.bezierCurveTo(-12, 6, -10, -14, 0, -24);
      g.closePath();
    };
    if (shadow) {
      g.fillStyle = 'rgba(0,18,55,0.4)';
      hull();
      g.fill();
      return;
    }
    const side = g.createLinearGradient(-11, 0, 11, 0);
    side.addColorStop(0, '#ffffff');
    side.addColorStop(0.6, '#eef3fa');
    side.addColorStop(1, '#b9c7da');
    g.fillStyle = side;
    hull();
    g.fill();
    g.strokeStyle = '#173a7a';
    g.lineWidth = 1.6;
    hull();
    g.stroke();
    g.save();
    g.translate(0, 2);
    g.scale(0.72, 0.78);
    hull();
    g.clip();
    g.fillStyle = '#c98c52';
    g.fillRect(-14, -30, 28, 60);
    g.fillStyle = 'rgba(90,45,15,0.35)';
    for (let x = -14; x < 14; x += 3) g.fillRect(x, -30, 0.8, 60);
    g.restore();
    // cockpit and tiller
    g.fillStyle = '#e9eef6';
    g.fillRect(-5, 6, 10, 12);
    g.fillStyle = '#5b3a1c';
    g.fillRect(-0.8, 12, 1.6, 10);
    // a sailor in a red cap
    g.fillStyle = '#f2c094';
    g.beginPath();
    g.arc(0, 9, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0412f';
    g.beginPath();
    g.arc(0, 8.4, 3.2, Math.PI, Math.PI * 2);
    g.fill();
    // bow highlight
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(-3, -14, 1.5, 5, 0.2, 0, Math.PI * 2);
    g.fill();
  });
}

function paintHouse(rng) {
  const dome = rng.chance(0.25);
  return makeSprite(30, 30, (g) => {
    g.fillStyle = 'rgba(60,40,20,0.3)';
    g.fillRect(-9, -7, 20, 18);
    g.fillStyle = '#fbf8f1';
    g.fillRect(-11, -10, 20, 18);
    g.fillStyle = 'rgba(200,190,175,0.6)';
    g.fillRect(-11, 4, 20, 4);
    if (dome) {
      const d = g.createRadialGradient(-3, -4, 1, -1, -1, 8);
      d.addColorStop(0, '#6db3ff');
      d.addColorStop(1, '#1a4fb0');
      g.fillStyle = d;
      g.beginPath();
      g.arc(-1, -1, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(-1.5, -3, 1, 4);
      g.fillRect(-3, -1.5, 4, 1);
    } else {
      g.fillStyle = rng.pick(['#1f5fbf', '#2a8fd0', '#2d6d4a']);
      g.fillRect(-8, 1, 4, 6);
      g.fillRect(2, -6, 4, 3);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(-11, -10, 20, 2);
    }
  });
}

function paintTree(rng, cypress) {
  return makeSprite(24, 24, (g) => {
    g.fillStyle = 'rgba(40,30,10,0.35)';
    g.beginPath();
    g.ellipse(3, 3, cypress ? 5 : 9, cypress ? 5 : 8, 0, 0, Math.PI * 2);
    g.fill();
    const n = cypress ? 1 : 5;
    for (let i = 0; i < n; i++) {
      const x = cypress ? 0 : rng.range(-4, 4);
      const y = cypress ? 0 : rng.range(-4, 4);
      const r = cypress ? 5 : rng.range(4, 6);
      const grad = g.createRadialGradient(x - 2, y - 2, 0.5, x, y, r);
      grad.addColorStop(0, cypress ? '#5f8f4a' : '#b5c68a');
      grad.addColorStop(1, cypress ? '#1e3d22' : '#5e7a45');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function paintWindmill() {
  return makeSprite(34, 34, (g) => {
    g.fillStyle = 'rgba(60,40,20,0.3)';
    g.beginPath();
    g.arc(3, 3, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fbf8f1';
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b5552c';
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
  });
}

// ---------- the game ----------

export default {
  id: 'upwind',
  title: 'Upwind',
  emoji: '⛵',
  tagline: 'You always sail on a slant: tap to tack. Hit anything and it ends.',
  colors: { bg: '#0f3f86', fg: '#ffffff', accent: '#ffb347' },

  // Greek Eurodance / Hi-NRG, 140 BPM, D minor (Dm – B♭ – C – A): four-on-the-floor kick, an
  // octave-jumping sawtooth bass and offbeat hats with syncopated triangle piano stabs from bar one;
  // then claps, a pad and a bouzouki-style square lead in tremolo 16ths (a sirtaki-flavoured tune,
  // C♯ on the A chord); then a 16th arpeggio and shaker; and a finale with the lead doubled an octave
  // down and an open-hat lift. 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("d2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ white]*4").decay(0.14).sustain(0).hpf(6500).gain(0.035)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5000).gain(0.14).room(0.25)
      const bass = note("<[d2 d3]*4 [bb2 bb3]*4 [c2 c3]*4 [a2 a3]*4>").s("sawtooth").decay(0.14).sustain(0.2)
        .release(0.04).lpf(saw.range(500, 1500).slow(35)).lpq(3).gain(0.32)
      const chords = "<[d4,f4,a4] [d4,f4,bb4] [c4,e4,g4] [cs4,e4,a4]>"
      const stab = note(chords).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").s("triangle").decay(0.16).sustain(0)
        .lpf(3200).gain(0.11).pan(0.6)
      const pad = note(chords).s("sawtooth").attack(0.1).decay(0.4).sustain(0.6).release(0.3)
        .lpf(saw.range(700, 2000).slow(35)).gain(0.045).pan(0.4).room(0.3)
      const tune = "<[d5 e5 f5 e5 d5 a4 d5 f5] [f5 g5 f5 e5 d5 ~ bb4 d5] [e5 f5 g5 f5 e5 c5 e5 g5] [a5 g5 f5 e5 cs5 ~ a4 ~] [a5 bb5 a5 f5 d5 f5 a5 d6] [bb5 a5 g5 f5 d5 ~ f5 ~] [g5 a5 g5 e5 c5 e5 g5 c6] [a5 ~ cs6 ~ e6 ~ a5 ~]>"
      const lead = note(tune).ply(2).s("square").decay(0.08).sustain(0).lpf(2600).gain(0.08)
        .room(0.25).delay(0.15).delaytime(0.32).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-12)).ply(2).s("sawtooth").decay(0.08).sustain(0).lpf(1600).gain(0.05).pan(0.4)
      const arp = note("<[d5 f5 a5 f5]*4 [d5 f5 bb5 f5]*4 [c5 e5 g5 e5]*4 [cs5 e5 a5 e5]*4>").s("triangle")
        .decay(0.08).sustain(0).lpf(3800).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, stab)],
      [9, stack(kick, hats, clap, bass, stab, pad, lead)],
      [9, stack(kick, hats, clap, shaker, bass, stab, pad, lead, arp)],
      [9, stack(kick, hats, open, clap, shaker, bass, stab, pad, lead, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const shiftSign = plan.chance(0.5) ? 1 : -1;
    const shift = (t) => shiftAt(t, shiftSign);

    // ---- the coastline: two smooth wiggles, straight at the start ----
    const ph = [plan.range(0, 6.28), plan.range(0, 6.28), plan.range(0, 6.28), plan.range(0, 6.28)];
    const insetAt = (D, a, b) => {
      const ramp = clamp((D - 520) / 700, 0, 1);
      return INSET * ramp * (0.5 + 0.5 * (0.62 * Math.sin(D / 230 + a) + 0.38 * Math.sin(D / 91 + b)));
    };
    const shoreL = (D) => SHORE + insetAt(D, ph[0], ph[1]);
    const shoreR = (D) => W - SHORE - insetAt(D, ph[2], ph[3]);

    // ---- a reference course, sailed with the same physics as the player, that every hazard
    // keeps clear of: so there is always a way through ----
    const refX = [];
    const refD = [];
    {
      let s = 1;
      let vx = 0;
      let x = X0;
      let D = 0;
      let seg = 0;
      const segLen = (t) => plan.range(lerp(0.75, 0.48, progress(t)), lerp(1.7, 1.0, progress(t)));
      let len = segLen(0);
      for (let i = 0, t = 0; t < 61; i++, t += STEP) {
        refX.push(x);
        refD.push(D);
        seg += STEP;
        const minSeg = lerp(0.6, 0.42, progress(t));
        const wall = (s > 0 && x + vx / K > RMAX) || (s < 0 && x + vx / K < RMIN);
        if (wall || (seg >= len && seg >= minSeg)) {
          s = -s;
          seg = 0;
          len = segLen(t);
        }
        const target = s * latAt(t) * (1 + s * shift(t));
        vx += (target - vx) * Math.min(1, K * STEP);
        x += vx * STEP;
        D += vyAt(t) * STEP;
      }
    }
    const findIdx = (D) => {
      let lo = 0;
      let hi = refD.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (refD[m] < D) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const timeAtD = (D) => findIdx(D) * STEP;
    const refXAt = (D) => refX[Math.min(refX.length - 1, findIdx(D))];
    // is a hazard circle at (x, D) with radius r clear of the reference course by `margin`?
    const clear = (x, D, r, margin) => {
      const i0 = findIdx(D - r - 24);
      const i1 = findIdx(D + r + 24);
      for (let i = i0; i <= i1; i++) if (Math.abs(refX[i] - x) < r + 10 + margin) return false;
      return true;
    };

    // ---- hazards, laid out in advance along the channel ----
    const rockArt = [paintRock(art), paintRock(art), paintRock(art), paintRock(art)];
    const caiqueArt = [paintCaique(art), paintCaique(art), paintCaique(art)];
    const hazards = []; // { kind, x, D, r, circles: [{x, D, r}], ... }
    {
      const Dend = refD[refD.length - 1] + 700;
      let D = refD[Math.round(3.4 / STEP)] + 40;
      while (D < Dend) {
        const t = timeAtD(D);
        const p = progress(t, 60, 1);
        const margin = lerp(22, 5, p);
        const squeeze = lerp(0.2, 0.8, p);
        const L = shoreL(D);
        const R = shoreR(D);
        const roll = plan.next();
        const pickX = (r, tries = 8) => {
          for (let k = 0; k < tries; k++) {
            let x;
            if (plan.chance(squeeze)) {
              const side = plan.chance(0.5) ? 1 : -1;
              x = refXAt(D) + side * (r + 10 + margin + plan.range(1, 22));
            } else x = plan.range(L + r - 4, R - r + 4);
            if (x < L - r * 0.3 || x > R + r * 0.3) continue;
            if (clear(x, D, r, margin)) return x;
          }
          return null;
        };
        if (t > 24 && roll < 0.14) {
          // a fishing net strung out from one shore on a line of floats
          const fromLeft = plan.chance(0.5);
          const len = plan.range(110, 190);
          const slope = plan.range(-0.15, 0.15);
          const floats = [];
          let ok = true;
          for (let d = 0; d <= len; d += 13) {
            const x = fromLeft ? L - 6 + d : R + 6 - d;
            const fD = D + d * slope;
            if (!clear(x, fD, 6, margin * 0.7)) {
              ok = false;
              break;
            }
            floats.push({ x, D: fD, r: 6 });
          }
          if (ok && floats.length > 3) hazards.push({ kind: 'net', D, circles: floats, ph: plan.range(0, 6) });
        } else if (t > 7 && roll < 0.36) {
          // a moored caïque, swinging at an angle on its mooring
          const ang = plan.range(-0.45, 0.45);
          const x = pickX(13);
          if (x != null) {
            const ca = [
              { x: x + Math.sin(ang) * 13, D: D + Math.cos(ang) * 13, r: 11 },
              { x: x - Math.sin(ang) * 13, D: D - Math.cos(ang) * 13, r: 11 },
            ];
            if (ca.every((c) => clear(c.x, c.D, c.r, margin))) hazards.push({ kind: 'caique', x, D, ang, art: plan.int(0, 2), circles: ca });
          }
        } else if (roll < 0.58) {
          // a channel buoy (red on the left side of the channel, green on the right)
          const x = pickX(9);
          if (x != null) hazards.push({ kind: 'buoy', x, D, red: x < W / 2, ph: plan.range(0, 6), circles: [{ x, D, r: 9 }] });
        } else {
          // rocks, sometimes a little reef of two
          const r = plan.range(13, lerp(20, 26, p));
          const x = pickX(r);
          if (x != null) {
            hazards.push({ kind: 'rock', x, D, r, art: plan.int(0, 3), rot: plan.range(0, 6.28), circles: [{ x, D, r: r * 0.92 }] });
            if (t > 15 && plan.chance(0.35)) {
              const r2 = plan.range(10, 15);
              const x2 = x + plan.range(-1, 1) * (r + r2);
              const D2 = D + plan.range(r, r + r2 + 10);
              if (x2 > L && x2 < R && clear(x2, D2, r2, margin)) hazards.push({ kind: 'rock', x: x2, D: D2, r: r2, art: plan.int(0, 3), rot: plan.range(0, 6.28), circles: [{ x: x2, D: D2, r: r2 * 0.92 }] });
            }
          }
        }
        D += lerp(160, 66, p) * plan.range(0.75, 1.25);
      }
      hazards.sort((a, b) => a.D - b.D);
    }

    // ---- art ----
    const water = paintWater(W, art);
    const landTile = paintLand(W, art);
    let landPattern = null;
    const hull = paintHull(false);
    const hullShadow = paintHull(true);
    const buoyArt = [paintBuoy(true), paintBuoy(false)];
    const houses = [paintHouse(art), paintHouse(art), paintHouse(art), paintHouse(art)];
    const olives = [paintTree(art, false), paintTree(art, false)];
    const cypress = paintTree(art, true);
    const mill = paintWindmill();
    const sunGlow = glowSprite('rgba(255,235,190,1)', 60);
    const redGlow = glowSprite('rgba(255,90,70,1)', 16);
    const greenGlow = glowSprite('rgba(90,255,140,1)', 16);
    const vignette = vignetteSprite(W, H, 0.42, '0,15,50');
    const fx = createParticles();
    const spray = createParticles();

    // decorations on the land at both sides (cosmetic)
    const decor = [];
    for (const side of [-1, 1]) {
      for (let D = -200; D < 13000; D += art.range(26, 60)) {
        const roll = art.next();
        const spr = roll < 0.35 ? art.pick(houses) : roll < 0.7 ? art.pick(olives) : roll < 0.96 ? cypress : mill;
        decor.push({ side, D, off: art.range(-6, 16), spr, rot: spr === mill ? 0 : art.range(-0.2, 0.2), mill: spr === mill });
      }
    }
    decor.sort((a, b) => a.D - b.D);

    // wind streaks (cosmetic)
    const streaks = [];
    for (let i = 0; i < 22; i++) streaks.push({ x: Math.random() * W, y: Math.random() * H, len: 20 + Math.random() * 40, v: 260 + Math.random() * 160, a: 0.06 + Math.random() * 0.1 });

    // ---- state ----
    let x = X0;
    let vx = 0;
    let s = 1;
    let D = 0;
    let clock = 0;
    let tNow = 0;
    let sink = 0;
    let hit = null;
    const wake = []; // { x, D, age }
    let wakeT = 0;
    let first = 0; // index of the first hazard that can still be on screen

    const heading = () => Math.atan2(vx, vyAt(tNow));
    const hullCircles = () => {
      const h = heading();
      return HULL.map(([along, , r]) => ({ x: x + Math.sin(h) * along, D: D + Math.cos(h) * along, r }));
    };

    const die = (game, reason, at) => {
      game.dead = true;
      game.deathReason = reason;
      hit = at;
      fx.burst(at.x, BOAT_Y - (at.D - D), { count: 30, speed: 160, life: 0.9, size: 4, round: true, drag: 2.5, colors: FOAM });
      spray.burst(x, BOAT_Y, { count: 18, speed: 90, life: 1.2, size: 3, round: true, drag: 1.5, colors: ['#ffffff', '#cfefff'] });
    };

    const updateCosmetic = (dt, moving) => {
      clock += dt;
      const ang = shift(tNow) * 0.9;
      for (const k of streaks) {
        k.x += Math.sin(ang) * k.v * dt;
        k.y += Math.cos(ang) * k.v * dt;
        if (k.y > H + 40 || k.x < -60 || k.x > W + 60) {
          k.y = -40 - Math.random() * 60;
          k.x = Math.random() * (W + 120) - 60;
        }
      }
      for (const w of wake) w.age += dt;
      while (wake.length && wake[0].age > 1.6) wake.shift();
      if (moving) {
        wakeT += dt;
        if (wakeT > 0.035) {
          wakeT = 0;
          const h = heading();
          wake.push({ x: x - Math.sin(h) * 20, D: D - Math.cos(h) * 20, age: 0, h });
        }
        if (Math.random() < 0.6) {
          const h = heading();
          spray.burst(x + Math.sin(h) * 22, BOAT_Y - Math.cos(h) * 22, { count: 1, speed: 50, angle: h + (Math.random() < 0.5 ? 0.5 : Math.PI - 0.5) , spread: 0.6, life: 0.5, size: 2.5, round: true, drag: 2, colors: FOAM });
        }
      }
      fx.update(dt, moving ? vyAt(tNow) : 0);
      spray.update(dt, moving ? vyAt(tNow) : 0);
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        tNow = t;
        if (dir) s = dir;
        const target = s * latAt(t) * (1 + s * shift(t));
        vx += (target - vx) * Math.min(1, K * dt);
        x += vx * dt;
        D += vyAt(t) * dt;
        updateCosmetic(dt, true);

        const circles = hullCircles();
        // the shore
        for (const c of circles) {
          if (c.x - c.r < shoreL(c.D)) return die(this, 'Ran aground on the rocky shore.', { x: shoreL(c.D), D: c.D });
          if (c.x + c.r > shoreR(c.D)) return die(this, 'Ran aground on the rocky shore.', { x: shoreR(c.D), D: c.D });
        }
        // hazards
        while (first < hazards.length && hazards[first].D < D - 260) first++;
        for (let i = first; i < hazards.length; i++) {
          const hz = hazards[i];
          if (hz.D > D + 260) break;
          for (const k of hz.circles) {
            for (const c of circles) {
              const dx = k.x - c.x;
              const dD = k.D - c.D;
              const rr = k.r + c.r;
              if (dx * dx + dD * dD < rr * rr) {
                const reason = {
                  rock: 'Struck a rock and holed the hull.',
                  buoy: 'Clipped a channel buoy.',
                  caique: 'Rammed a moored fishing boat.',
                  net: 'Snagged in a fishing net.',
                }[hz.kind];
                return die(this, reason, { x: (k.x + c.x) / 2, D: (k.D + c.D) / 2 });
              }
            }
          }
        }
      },

      afterlife(dt) {
        sink = Math.min(1, sink + dt * 1.2);
        vx *= Math.max(0, 1 - 4 * dt);
        updateCosmetic(dt, false);
      },

      render(g) {
        landPattern ||= g.createPattern(landTile.canvas, 'repeat');
        const sy = (wd) => BOAT_Y - (wd - D);
        // the sea
        const base = g.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, '#0b347a');
        base.addColorStop(0.5, '#11499a');
        base.addColorStop(1, '#0d3c85');
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
        const off = ((D % TILE) + TILE) % TILE;
        for (let y = off - TILE; y < H; y += TILE) g.drawImage(water.canvas, 0, y, W, TILE);
        // sun on the water, high and to the right
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 250, 170, { size: 380, alpha: 0.18 });
        g.globalCompositeOperation = 'source-over';

        // the coast at each side: shallows, foam, sand and rock, then the hillside
        const shorePath = (fn, side, dx, oy = 0) => {
          g.beginPath();
          const edge = side < 0 ? -2 : W + 2;
          g.moveTo(edge, -10 - oy);
          for (let y = -10; y <= H + 16; y += 16) g.lineTo(fn(D + BOAT_Y - y) + side * -dx, y - oy);
          g.lineTo(edge, H + 16 - oy);
          g.closePath();
        };
        for (const [fn, side] of [[shoreL, -1], [shoreR, 1]]) {
          g.fillStyle = 'rgba(70,205,215,0.22)';
          shorePath(fn, side, 26);
          g.fill();
          g.fillStyle = 'rgba(90,225,220,0.35)';
          shorePath(fn, side, 12);
          g.fill();
          g.fillStyle = '#f2ddb0';
          shorePath(fn, side, 0);
          g.fill();
          g.fillStyle = '#c99a62';
          shorePath(fn, side, -5);
          g.fill();
          // the hillside, textured, scrolling with the sea
          const lo = ((D % TILE) + TILE) % TILE - TILE;
          g.save();
          g.translate(0, lo);
          g.fillStyle = landPattern || '#93894f';
          shorePath(fn, side, -9, lo);
          g.fill();
          g.restore();
          g.strokeStyle = 'rgba(90,70,40,0.5)';
          g.lineWidth = 1.5;
          shorePath(fn, side, -9);
          g.stroke();
          // the foam line
          g.strokeStyle = 'rgba(255,255,255,0.75)';
          g.lineWidth = 2;
          g.beginPath();
          for (let y = -10; y <= H + 16; y += 12) {
            const wd = D + BOAT_Y - y;
            const fxp = fn(wd) - side * (3 + 2 * Math.sin(wd / 13 + clock * 3));
            if (y === -10) g.moveTo(fxp, y);
            else g.lineTo(fxp, y);
          }
          g.stroke();
        }
        // houses, olive trees, cypresses and windmills on the land
        for (const d of decor) {
          const y = sy(d.D);
          if (y > H + 30) continue;
          if (y < -30) break;
          const edge = d.side < 0 ? shoreL(d.D) : shoreR(d.D);
          const land = d.side < 0 ? edge : W - edge;
          const px = d.side < 0 ? land - 12 - d.off : W - land + 12 + d.off;
          if (land < 14) continue;
          drawSprite(g, d.spr, px, y, { rot: d.rot });
          if (d.mill) {
            // turning sails
            g.save();
            g.translate(px, y);
            g.rotate(clock * 1.6);
            g.fillStyle = 'rgba(255,250,240,0.9)';
            for (let k = 0; k < 6; k++) {
              g.rotate(Math.PI / 3);
              g.beginPath();
              g.moveTo(0, -2);
              g.lineTo(14, -4);
              g.lineTo(14, 2);
              g.closePath();
              g.fill();
            }
            g.restore();
          }
        }

        // the wake
        if (wake.length > 1) {
          g.lineCap = 'round';
          for (const side of [-1, 1]) {
            g.beginPath();
            for (let i = 0; i < wake.length; i++) {
              const w = wake[i];
              const spread = 6 + w.age * 26;
              const px = w.x + side * Math.cos(w.h) * spread;
              const py = sy(w.D) + side * Math.sin(w.h) * spread;
              if (i === 0) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
            g.strokeStyle = 'rgba(220,245,255,0.35)';
            g.lineWidth = 2.5;
            g.stroke();
          }
          g.beginPath();
          for (let i = 0; i < wake.length; i++) {
            const w = wake[i];
            if (i === 0) g.moveTo(w.x, sy(w.D));
            else g.lineTo(w.x, sy(w.D));
          }
          g.strokeStyle = 'rgba(200,235,255,0.18)';
          g.lineWidth = 7;
          g.stroke();
        }

        // hazards
        for (let i = first; i < hazards.length; i++) {
          const hz = hazards[i];
          const y = sy(hz.D);
          if (y > H + 60) continue;
          if (y < -260) break;
          if (hz.kind === 'rock') {
            g.strokeStyle = `rgba(255,255,255,${0.4 + 0.2 * Math.sin(clock * 3 + hz.rot)})`;
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(hz.x, y, hz.r * 1.25 + 2 * Math.sin(clock * 2.5 + hz.rot), hz.r * 1.15 + 2 * Math.sin(clock * 2.5 + hz.rot), 0, 0, Math.PI * 2);
            g.stroke();
            drawSprite(g, rockArt[hz.art], hz.x, y, { rot: hz.rot, size: (hz.r / 26) * rockArt[0].w });
          } else if (hz.kind === 'buoy') {
            const bob = Math.sin(clock * 3 + hz.ph);
            g.strokeStyle = 'rgba(255,255,255,0.4)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(hz.x, y, 12 + bob * 1.5, 0, Math.PI * 2);
            g.stroke();
            drawSprite(g, buoyArt[hz.red ? 0 : 1], hz.x, y + bob, { size: 26 + bob });
            if (Math.sin(clock * 4 + hz.ph) > 0.4) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, hz.red ? redGlow : greenGlow, hz.x, y + bob, { size: 34, alpha: 0.8 });
              g.globalCompositeOperation = 'source-over';
            }
          } else if (hz.kind === 'caique') {
            g.strokeStyle = 'rgba(255,255,255,0.3)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.ellipse(hz.x, y, 17, 32, -hz.ang, 0, Math.PI * 2);
            g.stroke();
            drawSprite(g, caiqueArt[hz.art], hz.x, y, { rot: -hz.ang + Math.sin(clock * 0.9 + hz.x) * 0.03 });
          } else {
            const c = hz.circles;
            g.strokeStyle = 'rgba(30,20,10,0.6)';
            g.lineWidth = 1.4;
            g.setLineDash([3, 3]);
            g.beginPath();
            c.forEach((f, k) => (k ? g.lineTo(f.x, sy(f.D)) : g.moveTo(f.x, sy(f.D))));
            g.stroke();
            g.setLineDash([]);
            for (let k = 0; k < c.length; k++) {
              const f = c[k];
              const fy = sy(f.D) + Math.sin(clock * 3 + hz.ph + k * 0.7) * 1.2;
              g.fillStyle = 'rgba(0,20,60,0.35)';
              g.beginPath();
              g.arc(f.x + 1.5, fy + 2, 6, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = k % 2 ? '#ff8a2a' : '#ffd23f';
              g.beginPath();
              g.arc(f.x, fy, 5.5, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = 'rgba(255,255,255,0.75)';
              g.beginPath();
              g.arc(f.x - 1.8, fy - 1.8, 1.6, 0, Math.PI * 2);
              g.fill();
            }
          }
        }

        // the boat: shadow, hull, then the sails
        const h = heading();
        const tilt = (1 - sink) * 1;
        const bx = x;
        const by = BOAT_Y + sink * 6;
        const k = 1 - sink * 0.35;
        g.globalAlpha = 1 - sink * 0.6;
        drawSprite(g, hullShadow, bx + 5, by + 6, { rot: h + sink * 1.2, size: 36 * k });
        drawSprite(g, hull, bx, by, { rot: h + sink * 1.2, size: 36 * k });
        g.save();
        g.translate(bx, by);
        g.rotate(h + sink * 1.2);
        g.scale(k * 1.2, k * 1.2);
        const lat = latAt(tNow);
        const sa = clamp(vx / lat, -1, 1) * tilt;
        let boom = 0.62 * sa;
        const luff = 1 - Math.abs(sa);
        boom += Math.sin(clock * 38) * 0.12 * luff;
        const bxx = Math.sin(boom) * 25;
        const byy = -6 + Math.cos(boom) * 25;
        const belly = 7 * sa + Math.sin(clock * 30) * 2 * luff;
        // mainsail shadow on the water, then the sail
        g.fillStyle = 'rgba(0,18,55,0.25)';
        g.beginPath();
        g.moveTo(5, -1);
        g.quadraticCurveTo(bxx * 0.5 + belly * 1.6 + 5, (byy - 6) / 2 + 5, bxx + 5, byy + 5);
        g.closePath();
        g.fill();
        const sail = g.createLinearGradient(0, -6, bxx, byy);
        sail.addColorStop(0, '#ffffff');
        sail.addColorStop(1, '#dfe8f5');
        g.fillStyle = sail;
        g.beginPath();
        g.moveTo(0, -6);
        g.quadraticCurveTo(bxx * 0.5 + belly * 1.6, (byy - 6) / 2, bxx, byy);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(30,50,100,0.45)';
        g.lineWidth = 0.8;
        g.stroke();
        g.strokeStyle = '#ffb347';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(bxx * 0.45 + belly * 0.7, (byy - 6) * 0.45 - 2);
        g.lineTo(bxx * 0.55 + belly * 0.5, byy * 0.55);
        g.stroke();
        g.strokeStyle = '#6b4a2a';
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(bxx, byy);
        g.stroke();
        // the jib
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath();
        g.moveTo(0, -22);
        g.quadraticCurveTo(belly * 0.9, -14, 7 * sa + Math.sin(clock * 34) * 2 * luff, -7);
        g.lineTo(0, -8);
        g.closePath();
        g.fill();
        g.fillStyle = '#2b2b2b';
        g.beginPath();
        g.arc(0, -6, 1.8, 0, Math.PI * 2);
        g.fill();
        g.restore();
        g.globalAlpha = 1;

        fx.render(g);
        spray.render(g);

        // wind streaks
        g.lineCap = 'round';
        const ang = shift(tNow) * 0.9;
        for (const st of streaks) {
          g.strokeStyle = `rgba(255,255,255,${st.a})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(st.x, st.y);
          g.lineTo(st.x - Math.sin(ang) * st.len, st.y - Math.cos(ang) * st.len);
          g.stroke();
        }

        drawSprite(g, vignette, W / 2, H / 2);

        // a hint at the start
        if (tNow < 2.6 && !this.dead) {
          g.globalAlpha = clamp(2.6 - tNow, 0, 1) * 0.9;
          g.font = '800 15px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = 'rgba(0,20,60,0.5)';
          g.fillText('◀ tack        tack ▶', W / 2 + 1, BOAT_Y + 61);
          g.fillStyle = '#ffffff';
          g.fillText('◀ tack        tack ▶', W / 2, BOAT_Y + 60);
          g.globalAlpha = 1;
        }

        // a wind vane: the arrow swings with the wind shifts
        const vx0 = W - 30;
        const vy0 = H - 34;
        g.fillStyle = 'rgba(0,20,60,0.45)';
        g.beginPath();
        g.arc(vx0, vy0, 18, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 1;
        g.stroke();
        g.save();
        g.translate(vx0, vy0);
        g.rotate(-ang);
        g.fillStyle = '#ffb347';
        g.beginPath();
        g.moveTo(0, 12);
        g.lineTo(6, 2);
        g.lineTo(2, 2);
        g.lineTo(2, -12);
        g.lineTo(-2, -12);
        g.lineTo(-2, 2);
        g.lineTo(-6, 2);
        g.closePath();
        g.fill();
        g.restore();
        g.font = '700 13px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText(`${(D / 1852 * 4).toFixed(2)} nm`, 12, H - 14);
        if (tNow > 19 && tNow < 23.5 && !this.dead) {
          g.globalAlpha = Math.min(1, (tNow - 19) * 2, (23.5 - tNow) * 2);
          g.font = '800 15px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = '#ffffff';
          g.fillText('The wind is shifting', W / 2, 96);
          g.globalAlpha = 1;
        }
        if (hit && this.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, sunGlow, hit.x, sy(hit.D), { size: 60, alpha: 0.4 * (1 - sink) });
          g.globalCompositeOperation = 'source-over';
        }
      },
    };
    return game;
  },
};
