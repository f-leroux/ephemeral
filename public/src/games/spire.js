// Crystal Spire — build a tower of glowing crystal slabs from a mountain summit up through the
// dawn sky. Each slab appears above the spire and falls; you steer it left and right while it
// drops. Whatever hangs over the edge of the slab below snaps off and shatters, so the spire gets
// narrower with every sloppy landing, and a dead-centre landing grows it back a little. Miss the
// spire (or land only a sliver on it) and the run is over. Slabs fall faster over the minute, and
// from 14s the tall spire starts to sway in the high wind, so you aim at a moving target.

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

const SH = 20; // slab height
const W0 = 136; // the plinth's width, and the widest the spire can grow back to
const TOPY = 468; // where the spire's top surface sits on screen
const SPAWN_Y = 128; // where each new slab appears (its top edge)
const TOL = 4; // within this many units of centre, a landing counts as perfect and snaps
const GROW = 3; // a perfect landing grows the spire back this much
const MIN_OVERLAP = 8; // less than this and the slab topples off
const SKY_H = 1300;
const SPEED = 250;

const fallTime = (t) => lerp(1.7, 0.7, progress(t, 60, 1.1));
const hangTime = (t) => lerp(0.5, 0.24, progress(t, 60, 1.1));
const swayAmp = (t) => (t < 14 ? 0 : lerp(10, 56, Math.pow((t - 14) / 46, 1.1)) * Math.min(1, (t - 14) / 2));
const swayAt = (t) => {
  const a = swayAmp(t);
  if (!a) return 0;
  const w = 1.6 + 0.7 * progress(t, 60, 1);
  let s = Math.sin(w * (t - 14));
  if (t > 38) s = s * 0.8 + 0.35 * Math.min(1, (t - 38) / 3) * Math.sin(w * 2.3 * (t - 38) + 1);
  return a * s;
};

// the jewel colours the spire cycles through as it climbs: [light, mid, deep]
const GEMS = [
  ['#ffd0e0', '#ff7aa8', '#b5306a'],
  ['#ffe0c2', '#ffa04d', '#b8541a'],
  ['#fff3b8', '#ffd447', '#a8810f'],
  ['#d2ffe6', '#4fe0a4', '#178a62'],
  ['#d0f6ff', '#45c8f0', '#1a6f9e'],
  ['#dde2ff', '#7d8cff', '#3640a8'],
  ['#efdcff', '#b77bff', '#6a32b0'],
];
const SPARK = GEMS.map((c) => [c[0], c[1], '#ffffff']);

// ---------- art ----------

function paintSky(W, rng) {
  return makeSprite(W, SKY_H, (g) => {
    g.translate(-W / 2, -SKY_H / 2);
    const grad = g.createLinearGradient(0, SKY_H, 0, 0);
    grad.addColorStop(0, '#ffd2a8');
    grad.addColorStop(0.16, '#ffadb0');
    grad.addColorStop(0.32, '#e59ac8');
    grad.addColorStop(0.5, '#8fa6ea');
    grad.addColorStop(0.7, '#4a6fd0');
    grad.addColorStop(0.86, '#22388f');
    grad.addColorStop(1, '#101a52');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, SKY_H);
    // high, thin streaks of cirrus catching the dawn
    for (let i = 0; i < 26; i++) {
      const y = rng.range(SKY_H * 0.25, SKY_H * 0.85);
      const x = rng.range(-80, W);
      const len = rng.range(90, 220);
      g.strokeStyle = `rgba(255,236,240,${rng.range(0.08, 0.2)})`;
      g.lineWidth = rng.range(1, 3);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - rng.range(-6, 10), x + len, y + rng.range(-4, 4));
      g.stroke();
    }
    // stars, only where the sky is already dark
    for (let i = 0; i < 260; i++) {
      const y = rng.range(0, SKY_H * 0.42);
      const k = 1 - y / (SKY_H * 0.42);
      const r = rng.range(0.4, 1.3);
      g.fillStyle = `rgba(255,255,255,${(0.25 + rng.range(0, 0.7)) * k})`;
      g.beginPath();
      g.arc(rng.range(0, W), y, r, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 12; i++) {
      const y = rng.range(10, SKY_H * 0.3);
      const x = rng.range(10, W - 10);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x - 4, y);
      g.lineTo(x + 4, y);
      g.moveTo(x, y - 4);
      g.lineTo(x, y + 4);
      g.stroke();
    }
  }, 1.5);
}

function paintCloud(w, h, rng, lit = '#fff4f0', shade = '#e7b4c8') {
  return makeSprite(w, h, (g) => {
    const puffs = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const r = h * (0.22 + 0.2 * Math.sin(u * Math.PI)) * rng.range(0.85, 1.15);
      puffs.push([lerp(-w / 2 + r, w / 2 - r, u) + rng.range(-4, 4), h * 0.12 - Math.sin(u * Math.PI) * h * 0.14 + rng.range(-3, 3), r]);
    }
    g.fillStyle = shade;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y + r * 0.25, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y, r] of puffs) {
      const pg = g.createRadialGradient(x + r * 0.25, y - r * 0.4, r * 0.1, x, y, r);
      pg.addColorStop(0, lit);
      pg.addColorStop(1, 'rgba(255,240,240,0)');
      g.fillStyle = pg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

function paintCloudSea(W, rng) {
  const h = 200;
  return makeSprite(W + 80, h, (g) => {
    g.translate(-(W + 80) / 2, -h / 2);
    const base = g.createLinearGradient(0, 30, 0, h);
    base.addColorStop(0, '#ffe6e4');
    base.addColorStop(0.4, '#f1bccb');
    base.addColorStop(1, '#c995b8');
    g.fillStyle = base;
    g.fillRect(0, 50, W + 80, h);
    for (let row = 0; row < 4; row++) {
      const y = 46 + row * 34;
      for (let x = -20; x < W + 100; x += rng.range(26, 40)) {
        const r = rng.range(22, 36) - row * 2;
        const pg = g.createRadialGradient(x + r * 0.3, y - r * 0.45, r * 0.15, x, y, r);
        pg.addColorStop(0, row === 0 ? '#fff8f2' : '#ffe9ea');
        pg.addColorStop(0.7, row === 0 ? '#ffd8dc' : '#efbfd0');
        pg.addColorStop(1, 'rgba(220,160,190,0)');
        g.fillStyle = pg;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 1.5);
}

function paintPeak(rng) {
  // the rocky, snow-dusted summit the spire is founded on, lit by the dawn from the right
  const w = 380;
  const h = 300;
  return makeSprite(w, h, (g) => {
    const pts = [[-190, 150], [-170, 60], [-130, 40], [-110, 10], [-85, -8], [-80, -140], [80, -140], [92, -10], [120, 6], [140, 30], [175, 70], [190, 150]];
    const rock = g.createLinearGradient(-150, 0, 150, 0);
    rock.addColorStop(0, '#3b2f52');
    rock.addColorStop(0.55, '#6b5470');
    rock.addColorStop(1, '#b07a80');
    g.fillStyle = rock;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    // crags: lit faces and shadowed faces
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-150, 150);
      const y = rng.range(-120, 140);
      if (Math.abs(x) > 80 + (y + 140) * 0.45) continue;
      const s = rng.range(10, 26);
      g.fillStyle = x > 0 ? 'rgba(255,190,170,0.28)' : 'rgba(30,20,50,0.3)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + s * 0.6, y + s);
      g.lineTo(x - s * 0.5, y + s * 0.9);
      g.closePath();
      g.fill();
    }
    // snow on the ledges
    g.fillStyle = 'rgba(255,245,250,0.9)';
    for (const [x, y, s] of [[-100, 14, 26], [110, 12, 22], [-150, 48, 30], [150, 40, 26], [-60, 60, 18], [60, 80, 20]]) {
      g.beginPath();
      g.moveTo(x - s, y + 4);
      g.quadraticCurveTo(x, y - 6, x + s, y + 4);
      g.quadraticCurveTo(x, y + 1, x - s, y + 4);
      g.fill();
    }
    // a carved stone plinth at the top, where the first crystal sits
    const plinth = g.createLinearGradient(0, -150, 0, -120);
    plinth.addColorStop(0, '#f4e7ee');
    plinth.addColorStop(1, '#a98fa8');
    g.fillStyle = plinth;
    g.fillRect(-W0 / 2 - 8, -150, W0 + 16, 12);
    g.fillStyle = '#8a7192';
    g.fillRect(-W0 / 2 - 4, -138, W0 + 8, 14);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-W0 / 2 - 8, -150, W0 + 16, 2);
    g.fillStyle = 'rgba(60,30,70,0.35)';
    for (let x = -W0 / 2; x < W0 / 2; x += 18) g.fillRect(x, -136, 2, 10);
  }, 2);
}

// a crystal slab, painted once per colour at full width and drawn in three parts (end caps plus a
// stretched middle) so it can be any width
function paintSlab([light, mid, deep]) {
  return makeSprite(W0, SH, (g) => {
    g.translate(-W0 / 2, -SH / 2);
    // front face
    const face = g.createLinearGradient(0, 5, 0, SH);
    face.addColorStop(0, mid);
    face.addColorStop(0.55, deep);
    face.addColorStop(1, deep);
    g.fillStyle = face;
    g.fillRect(0, 5, W0, SH - 5);
    // the top face, seen from slightly above
    const top = g.createLinearGradient(0, 0, 0, 5);
    top.addColorStop(0, '#ffffff');
    top.addColorStop(1, light);
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(3, 0);
    g.lineTo(W0 - 3, 0);
    g.lineTo(W0, 5);
    g.lineTo(0, 5);
    g.closePath();
    g.fill();
    // inner glow and facets
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(2, 6, W0 - 4, 1.2);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let x = 14; x < W0 - 20; x += 23) {
      g.beginPath();
      g.moveTo(x, 6);
      g.lineTo(x + 9, 6);
      g.lineTo(x + 3, SH - 1);
      g.lineTo(x - 6, SH - 1);
      g.closePath();
      g.fill();
    }
    // end bevels
    const capL = g.createLinearGradient(0, 0, 7, 0);
    capL.addColorStop(0, 'rgba(255,255,255,0.55)');
    capL.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = capL;
    g.fillRect(0, 5, 7, SH - 5);
    const capR = g.createLinearGradient(W0 - 7, 0, W0, 0);
    capR.addColorStop(0, 'rgba(0,0,0,0)');
    capR.addColorStop(1, 'rgba(20,0,40,0.4)');
    g.fillStyle = capR;
    g.fillRect(W0 - 7, 5, 7, SH - 5);
    g.fillStyle = 'rgba(20,0,40,0.35)';
    g.fillRect(0, SH - 1.5, W0, 1.5);
  });
}

function drawSlab(g, spr, x, y, w) {
  const c = spr.canvas;
  const k = c.width / spr.w;
  const cap = Math.min(8, w / 2);
  const left = x - w / 2;
  g.drawImage(c, 0, 0, cap * k, c.height, left, y, cap, SH);
  if (w > cap * 2) g.drawImage(c, cap * k, 0, (spr.w - cap * 2) * k, c.height, left + cap, y, w - cap * 2, SH);
  g.drawImage(c, (spr.w - cap) * k, 0, cap * k, c.height, left + w - cap, y, cap, SH);
}

// ---------- the game ----------

export default {
  id: 'spire',
  title: 'Crystal Spire',
  emoji: '💎',
  tagline: 'Steer each crystal onto the spire. Overhangs snap off; a miss ends it.',
  colors: { bg: '#24346f', fg: '#fff4f6', accent: '#ff8fb6' },

  // Future bass in C minor / E♭ major (Cm – A♭ – E♭ – B♭), 144 BPM: half-time kicks, snare and a
  // syncopated sawtooth bass under sidechain-pumped sawtooth chords from bar one, then a glassy
  // triangle arpeggio, then a bell-like crystal lead with echoes, and a four-on-the-floor finale with
  // claps, a shaker and the lead doubled an octave down. 36 bars = 60s.
  music: {
    cps: 36 / 60,
    setup: `
      const kick = note("c2 ~ ~ ~ ~ ~ c2 ~ ~ ~ c2 ~ ~ ~ ~ ~").s("sine").decay(0.22).sustain(0).gain(0.8)
      const kick4 = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ ~ white ~").decay(0.14).sustain(0).hpf(1500).lpf(6000).gain(0.17).room(0.25)
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1400).lpf(5000).gain(0.12).room(0.3)
      const hats = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.03 0.05]*4")
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.045]*4")
      const bass = note("<c3 ab2 eb3 bb2>").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~")
        .s("sawtooth").decay(0.2).sustain(0.4).release(0.05).lpf(saw.range(500, 1200).slow(36)).gain(0.34)
      const chords = "<[c4,eb4,g4,bb4] [ab3,c4,eb4,g4] [bb3,eb4,g4,bb4] [bb3,d4,f4,a4]>"
      const pump = note(chords).struct("x*8").s("sawtooth").decay(0.2).sustain(0.5).release(0.05)
        .gain("[0.025 0.06 0.08 0.085]*2").lpf(saw.range(900, 2600).slow(36)).pan(0.45)
      const arp = note("<[c5 eb5 g5 bb5]*4 [ab4 c5 eb5 g5]*4 [bb4 eb5 g5 bb5]*4 [bb4 d5 f5 a5]*4>")
        .s("triangle").decay(0.09).sustain(0).lpf(4000).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
        .delay(0.2).delaytime(0.21).delayfeedback(0.3)
      const tune = "<[g5 ~ bb5 ~ c6 ~ bb5 g5] [eb5 ~ ~ f5 g5 ~ ~ ~] [g5 ~ bb5 ~ eb6 ~ d6 bb5] [d6 ~ c6 ~ bb5 ~ ~ ~] [g5 ~ bb5 ~ c6 ~ bb5 g5] [c6 ~ eb6 ~ d6 ~ c6 ~] [bb5 ~ g5 ~ eb5 ~ g5 ~] [f5 ~ ~ ~ a5 ~ bb5 ~]>"
      const lead = note(tune).s("triangle").decay(0.35).sustain(0.15).release(0.1).gain(0.12)
        .room(0.3).delay(0.3).delaytime(0.42).delayfeedback(0.3).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("square").decay(0.25).sustain(0.2).release(0.05)
        .lpf(1800).gain(0.045).pan(0.4)
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, bass, pump)],
      [8, stack(kick, snare, clap, hats, bass, pump, arp)],
      [10, stack(kick, snare, clap, hats, bass, pump, arp, lead)],
      [10, stack(kick4, snare, clap, hats, shaker, bass, pump, arp, lead, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const sky = paintSky(W, art);
    const clouds = [paintCloud(170, 70, art), paintCloud(130, 56, art), paintCloud(200, 80, art, '#ffffff', '#c9cfee')];
    const cloudSea = paintCloudSea(W, art);
    const peak = paintPeak(art);
    const slabs = GEMS.map(paintSlab);
    const sunGlow = glowSprite('rgba(255,220,170,1)', 140);
    const gemGlows = GEMS.map((c) => glowSprite(`rgba(${parseInt(c[1].slice(1, 3), 16)},${parseInt(c[1].slice(3, 5), 16)},${parseInt(c[1].slice(5, 7), 16)},1)`, 40));
    const whiteGlow = glowSprite('rgba(255,255,255,1)', 24);
    const vignette = vignetteSprite(W, H, 0.45, '30,20,70');
    const fx = createParticles();
    const glints = createParticles();

    // drifting clouds at various heights and depths (cosmetic)
    const puffs = [];
    for (let i = 0; i < 16; i++) {
      puffs.push({ y0: art.range(-1200, 380), x: art.range(-60, W + 60), par: art.range(0.35, 0.8), v: art.range(4, 12) * (art.chance(0.5) ? 1 : -1), spr: art.pick(clouds), size: art.range(110, 200), a: art.range(0.5, 0.85) });
    }
    puffs.sort((a, b) => a.par - b.par);

    // the spire: layer 0 is the stone plinth; x is in un-swayed coordinates
    const layers = [{ x: W / 2, w: W0, c: -1 }];
    let camTop = 1; // eases towards layers.length
    let clock = 0;
    let sway = 0;
    let streak = 0;
    const chunks = []; // broken-off overhangs and the slab that missed
    const pops = []; // "PERFECT" labels

    // the falling slab the player steers
    const mover = createMover({ x: W / 2, minX: 0, maxX: W, speed: SPEED, accel: 16 });
    let slab = null;
    let nextAt = 0.6;
    let colorIdx = 0;

    // how much each layer leans with the sway: the base is rooted, the top ~12 layers bend
    const bend = (i, top) => {
      const u = clamp((i - (top - 13)) / 12, 0, 1);
      return u * u * (3 - 2 * u);
    };
    const topIndex = () => layers.length - 1;
    const layerX = (i) => layers[i].x + sway * bend(i, topIndex());
    const surfaceY = () => TOPY + (camTop - layers.length) * SH;

    const spawn = (t) => {
      const p = progress(t, 60, 1.1);
      const top = layers[topIndex()];
      const w = top.w;
      const side = plan.chance(0.5) ? 1 : -1;
      const off = plan.range(lerp(45, 80, p), lerp(100, 165, p));
      const hang = hangTime(t);
      const fall = fallTime(t);
      const minX = w / 2 + 4;
      const maxX = W - w / 2 - 4;
      const tx = layerX(topIndex());
      let x = tx + side * off;
      if (x < minX || x > maxX) x = tx - side * off;
      x = clamp(x, minX, maxX);
      mover.x = x;
      mover.vx = 0;
      mover.minX = minX;
      mover.maxX = maxX;
      slab = { w, c: colorIdx, age: 0, hang, fall, y: SPAWN_Y };
      colorIdx = (colorIdx + 1) % GEMS.length;
    };

    const die = (game, reason) => {
      game.dead = true;
      game.deathReason = reason;
    };

    const land = (game, t) => {
      const ti = topIndex();
      const top = layers[ti];
      const tx = layerX(ti);
      const sx = mover.x;
      const w = slab.w;
      const y = surfaceY() - SH;
      const col = GEMS[slab.c];
      if (Math.abs(sx - tx) <= TOL) {
        // perfect: it snaps into place and the spire grows back a little
        streak++;
        const nw = Math.min(W0, w + GROW);
        layers.push({ x: top.x, w: nw, c: slab.c });
        pops.push({ x: tx, y: y - 8, age: 0, text: streak > 1 ? `PERFECT ×${streak}` : 'PERFECT' });
        fx.burst(tx - nw / 2, y + SH / 2, { count: 10, speed: 120, angle: Math.PI, spread: 1.2, life: 0.6, size: 3, round: true, drag: 2, colors: SPARK[slab.c] });
        fx.burst(tx + nw / 2, y + SH / 2, { count: 10, speed: 120, angle: 0, spread: 1.2, life: 0.6, size: 3, round: true, drag: 2, colors: SPARK[slab.c] });
        glints.burst(tx, y + SH / 2, { count: 16, speed: 80, life: 0.7, size: 3, round: true, drag: 2, colors: ['#ffffff', col[0]] });
        slab = null;
        return;
      }
      streak = 0;
      const l = Math.max(sx - w / 2, tx - top.w / 2);
      const r = Math.min(sx + w / 2, tx + top.w / 2);
      const overlap = r - l;
      if (overlap < MIN_OVERLAP) {
        chunks.push({ x: sx, y, w, c: slab.c, vx: (sx - tx) * 1.2, vy: 40, rot: 0, vr: Math.sign(sx - tx || 1) * 3 });
        fx.burst(clamp(sx, 10, W - 10), y + SH, { count: 18, speed: 140, life: 0.8, size: 3.5, drag: 2, colors: SPARK[slab.c] });
        slab = null;
        return die(game, overlap > 0 ? 'Only a sliver caught the edge, and the crystal toppled off.' : 'Missed the spire. The crystal fell into the clouds.');
      }
      // trim: the overhang snaps off and tumbles away
      const nx = (l + r) / 2;
      layers.push({ x: nx - sway * bend(ti + 1, ti + 1), w: overlap, c: slab.c });
      const cutL = sx - w / 2 < l;
      const ow = w - overlap;
      const ox = cutL ? l - ow / 2 : r + ow / 2;
      const dirn = cutL ? -1 : 1;
      chunks.push({ x: ox, y, w: ow, c: slab.c, vx: dirn * 60, vy: -30, rot: 0, vr: dirn * lerp(1.5, 4, Math.random()) });
      fx.burst(cutL ? l : r, y + SH / 2, { count: 16, speed: 150, angle: cutL ? Math.PI : 0, spread: 1.6, life: 0.7, size: 3, drag: 1.5, gravity: 300, colors: SPARK[slab.c] });
      glints.burst(nx, y + 2, { count: 6, speed: 50, life: 0.5, size: 2.5, round: true, drag: 2, colors: ['#ffffff'] });
      slab = null;
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      camTop += (layers.length - camTop) * Math.min(1, 9 * dt);
      for (let i = chunks.length - 1; i >= 0; i--) {
        const k = chunks[i];
        k.vy += 900 * dt;
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.rot += k.vr * dt;
        if (k.y > H + 60) {
          chunks.splice(i, 1);
        }
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].age += dt;
        if (pops[i].age > 0.9) pops.splice(i, 1);
      }
      for (const p of puffs) {
        p.x += p.v * dt;
        if (p.x < -p.size) p.x = W + p.size;
        if (p.x > W + p.size) p.x = -p.size;
      }
      fx.update(dt);
      glints.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        sway = swayAt(t);
        updateCosmetic(dt);
        if (!slab && t >= nextAt) spawn(t);
        if (slab) {
          slab.age += dt;
          mover.update(dt, dir);
          const u = clamp((slab.age - slab.hang) / slab.fall, 0, 1);
          const dist = TOPY - SH - SPAWN_Y;
          slab.y = SPAWN_Y + dist * (0.45 * u + 0.55 * u * u);
          if (u > 0 && Math.random() < 0.5) {
            glints.burst(mover.x + (Math.random() - 0.5) * slab.w, slab.y, { count: 1, speed: 20, angle: -Math.PI / 2, spread: 0.6, life: 0.5, size: 2.4, round: true, colors: SPARK[slab.c] });
          }
          if (slab.y + SH >= surfaceY()) {
            slab.y = surfaceY() - SH;
            land(this, t);
            if (this.dead) return;
            nextAt = t + 0.12;
          }
        }
        // a glint now and then running up the spire
        if (Math.random() < 0.08) {
          const i = Math.max(1, topIndex() - Math.floor(Math.random() * 12));
          if (layers[i] && layers[i].c >= 0) {
            const y = TOPY + (camTop - i - 1) * SH;
            glints.burst(layerX(i) + (Math.random() - 0.5) * layers[i].w * 0.8, y + 4, { count: 1, speed: 6, life: 0.6, size: 3, round: true, colors: ['#ffffff'] });
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
      },

      render(g) {
        const alt = (camTop - 1) * SH;
        // sky, sliding down slowly as we climb
        g.drawImage(sky.canvas, 0, Math.min(0, H - SKY_H + alt * 0.75), W, SKY_H);
        // sunrise glow from the right horizon, sinking away as we climb
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W - 40, 560 + alt * 0.4, { size: 520, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';
        // far clouds
        for (const p of puffs) {
          const y = p.y0 + alt * p.par;
          if (y < -60 || y > H + 60) continue;
          drawSprite(g, p.spr, p.x, y, { size: p.size * (0.6 + p.par * 0.5), alpha: p.a * (0.5 + p.par * 0.5) });
        }
        // the summit and the sea of clouds around it
        const baseY = TOPY + (camTop - 1) * SH; // the top of the stone plinth
        drawSprite(g, peak, W / 2, baseY + 150);
        drawSprite(g, cloudSea, W / 2 + Math.sin(clock * 0.2) * 20, baseY + 140 - alt * 0.1);

        // the spire
        const ti = topIndex();
        const first = Math.max(1, Math.floor(camTop - (H - TOPY) / SH) - 2);
        for (let i = first; i <= ti; i++) {
          const L = layers[i];
          const y = TOPY + (camTop - i - 1) * SH;
          if (y > H) continue;
          drawSlab(g, slabs[L.c], layerX(i), y, L.w);
        }
        // the top layer glows softly
        if (ti >= 1) {
          const L = layers[ti];
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, gemGlows[L.c], layerX(ti), surfaceY() + SH / 2, { size: L.w + 60, alpha: 0.35 });
          g.globalCompositeOperation = 'source-over';
        }

        // the falling slab, with guides showing where it will land
        if (slab && !this.dead) {
          const x = mover.x;
          const w = slab.w;
          const sy = surfaceY();
          const tx = layerX(ti);
          const tw = layers[ti].w;
          const l = Math.max(x - w / 2, tx - tw / 2);
          const r = Math.min(x + w / 2, tx + tw / 2);
          const perfect = Math.abs(x - tx) <= TOL;
          // edge guides
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.lineWidth = 1;
          g.setLineDash([4, 5]);
          g.beginPath();
          for (const ex of [x - w / 2, x + w / 2]) {
            g.moveTo(ex, slab.y + SH);
            g.lineTo(ex, sy);
          }
          g.stroke();
          g.setLineDash([]);
          // landing strip on the top surface: green where it will stand, red where it'll break off
          if (perfect) {
            g.fillStyle = 'rgba(255,255,255,0.95)';
            g.fillRect(tx - tw / 2, sy - 3, tw, 4);
          } else {
            if (r > l) {
              g.fillStyle = 'rgba(120,255,170,0.9)';
              g.fillRect(l, sy - 3, r - l, 4);
            }
            g.fillStyle = 'rgba(255,60,80,0.9)';
            if (x - w / 2 < l) g.fillRect(x - w / 2, sy - 3, Math.min(w, l - (x - w / 2)), 4);
            if (x + w / 2 > r) g.fillRect(Math.max(x - w / 2, r), sy - 3, Math.min(w, x + w / 2 - r), 4);
          }
          // the slab itself, pulsing while it hangs before dropping
          const hanging = slab.age < slab.hang;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, gemGlows[slab.c], x, slab.y + SH / 2, { size: w + 70, alpha: hanging ? 0.45 + 0.25 * Math.sin(clock * 20) : 0.5 });
          g.globalCompositeOperation = 'source-over';
          drawSlab(g, slabs[slab.c], x, slab.y, w);
          if (perfect) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, whiteGlow, x, slab.y + SH / 2, { size: 50, alpha: 0.5 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // broken pieces tumbling away
        for (const k of chunks) {
          g.save();
          g.translate(k.x, k.y + SH / 2);
          g.rotate(k.rot);
          drawSlab(g, slabs[k.c], 0, -SH / 2, k.w);
          g.restore();
        }

        fx.render(g, true);
        glints.render(g, true);

        for (const p of pops) {
          const k = p.age / 0.9;
          g.globalAlpha = 1 - k * k;
          g.font = '800 17px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = 'rgba(40,20,80,0.5)';
          g.fillText(p.text, p.x + 1, p.y - k * 30 + 1);
          g.fillStyle = '#ffffff';
          g.fillText(p.text, p.x, p.y - k * 30);
          g.globalAlpha = 1;
        }

        // altitude readout
        g.font = '700 13px system-ui, sans-serif';
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText(`${(3200 + (layers.length - 1) * 12).toLocaleString('en-US')} m`, 12, H - 14);

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
