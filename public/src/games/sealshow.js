// Seal Show — a sunny afternoon at the marine park. A sea lion pup juggles beach balls on the tip
// of its nose for a packed grandstand. Where a ball lands on the nose decides where it flies next,
// a new ball is tossed in every so often, and the first one to splash into the pool ends the show.

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

const SEAL_Y = 542;
const NOSE_Y = 482; // where balls touch the nose
const WATER_Y = 556; // the pool's surface
const NOSE_HALF = 19; // half width of the nose's sweet zone (the ball's radius is added)
const MAX_ANGLE = 0.22; // how far an edge hit tips the bounce sideways (radians)
const KEEP_VX = 0.15; // how much sideways speed a ball keeps through a bounce
const WALL = 10; // the pool's side walls, inset from the screen edge
const G = 380;

const RISE = 380; // every bounce climbs this high, so the balls keep a steady juggling rhythm
// each new ball is smaller, so it has to land closer to the middle of the nose
const BALLS = [
  { key: 'beach', name: 'beach ball', r: 19 },
  { key: 'star', name: 'star ball', r: 15 },
  { key: 'spots', name: 'spotty ball', r: 13 },
  { key: 'gold', name: 'golden ball', r: 11 },
];
// when each ball's warning starts; it's dropped in once there's a gap in the rhythm for it
const TOSSES = [0, 6, 19, 37];
const WARN = 1.2;

// ---------- art ----------

function paintArena(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // a hazy summer sky
    const sky = g.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#8fd6ff');
    sky.addColorStop(1, '#dff5ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 200);
    // soft clouds
    for (let i = 0; i < 6; i++) {
      const cx = rng.range(-20, W + 20);
      const cy = rng.range(20, 110);
      for (let k = 0; k < 5; k++) {
        const r = rng.range(14, 30);
        const x = cx + rng.range(-34, 34);
        const y = cy + rng.range(-6, 6);
        const cl = g.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
        cl.addColorStop(0, 'rgba(255,255,255,0.85)');
        cl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cl;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    // the grandstand: a striped canopy, then tiers of seats climbing away from the pool
    const standTop = 150;
    const standBot = 360;
    const roof = g.createLinearGradient(0, standTop - 26, 0, standTop);
    roof.addColorStop(0, '#f2f6fa');
    roof.addColorStop(1, '#b9c7d6');
    g.fillStyle = roof;
    g.fillRect(0, standTop - 26, W, 26);
    for (let x = 0; x < W; x += 24) {
      g.fillStyle = (x / 24) % 2 ? '#ff6f5e' : '#fff6ea';
      g.beginPath();
      g.moveTo(x, standTop - 8);
      g.lineTo(x + 24, standTop - 8);
      g.lineTo(x + 24, standTop + 2);
      g.quadraticCurveTo(x + 12, standTop + 12, x, standTop + 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,70,110,0.25)';
    g.fillRect(0, standTop + 2, W, 10);
    const tiers = 7;
    const th = (standBot - standTop - 12) / tiers;
    for (let i = 0; i < tiers; i++) {
      const y = standTop + 12 + i * th;
      const tier = g.createLinearGradient(0, y, 0, y + th);
      tier.addColorStop(0, i % 2 ? '#3f86b8' : '#2f74a6');
      tier.addColorStop(1, '#1d5583');
      g.fillStyle = tier;
      g.fillRect(0, y, W, th);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, y, W, 1.5);
    }
    // aisles
    for (const x of [72, 288]) {
      g.fillStyle = '#d8e2ea';
      g.fillRect(x - 7, standTop + 12, 14, standBot - standTop - 12);
      g.strokeStyle = 'rgba(80,100,130,0.35)';
      g.lineWidth = 1;
      for (let y = standTop + 12; y < standBot; y += th / 2) {
        g.beginPath();
        g.moveTo(x - 7, y);
        g.lineTo(x + 7, y);
        g.stroke();
      }
    }
    // the big rim of the pool deck
    const deck = g.createLinearGradient(0, standBot, 0, standBot + 26);
    deck.addColorStop(0, '#f4efe4');
    deck.addColorStop(1, '#d8cdb6');
    g.fillStyle = deck;
    g.fillRect(0, standBot, W, 26);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, standBot + 24, W, 3);

    // the glass-fronted back wall of the pool, tiled, with a lifebuoy-blue stripe
    const wallTop = standBot + 26;
    const wall = g.createLinearGradient(0, wallTop, 0, WATER_Y);
    wall.addColorStop(0, '#f7fbff');
    wall.addColorStop(1, '#cfe6f2');
    g.fillStyle = wall;
    g.fillRect(0, wallTop, W, WATER_Y - wallTop);
    g.strokeStyle = 'rgba(120,160,190,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = wallTop; y < WATER_Y; y += 16) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    for (let y = wallTop, row = 0; y < WATER_Y; y += 16, row++) {
      for (let x = (row % 2) * 8; x < W; x += 16) {
        g.moveTo(x, y);
        g.lineTo(x, Math.min(WATER_Y, y + 16));
      }
    }
    g.stroke();
    g.fillStyle = '#2aa7d8';
    g.fillRect(0, wallTop + 40, W, 12);
    g.fillStyle = '#ffffff';
    for (let x = 6; x < W; x += 40) g.fillRect(x, wallTop + 44, 20, 4);
    // the wall's reflection of the sunny water
    const sheen = g.createLinearGradient(0, WATER_Y - 60, 0, WATER_Y);
    sheen.addColorStop(0, 'rgba(90,200,230,0)');
    sheen.addColorStop(1, 'rgba(90,200,230,0.35)');
    g.fillStyle = sheen;
    g.fillRect(0, WATER_Y - 60, W, 60);
  }, 1);
}

// The crowd in two poses (heads up, arms waving) so the stands bounce along with the show.
function paintCrowd(W, rng, frame) {
  const h = 200;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const tiers = 7;
    const th = (360 - 150 - 12) / tiers;
    const shirts = ['#ff6f5e', '#ffd166', '#06d6a0', '#ef476f', '#ffffff', '#ff9f1c', '#8ecae6', '#c77dff', '#f4a261'];
    const skins = ['#f6d2b4', '#e0ac85', '#b9805a', '#8a5a3c', '#5e3b26', '#f1c7a6'];
    for (let i = 0; i < tiers; i++) {
      const base = i * th + th - 2;
      for (let x = 8; x < W; x += rng.range(15, 21)) {
        if (Math.abs(x - 72) < 10 || Math.abs(x - 288) < 10) continue;
        if (rng.chance(0.08)) continue;
        const shirt = rng.pick(shirts);
        const skin = rng.pick(skins);
        const up = rng.chance(0.55); // drawn for both poses, so the two frames show the same people
        const waving = rng.chance(0.25);
        const bob = frame && up ? -2 : 0;
        const wave = frame && waving;
        g.fillStyle = shirt;
        g.beginPath();
        g.ellipse(x, base - 4 + bob, 6.5, 6, 0, Math.PI, 0);
        g.fill();
        if (wave) {
          g.strokeStyle = skin;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x + 4, base - 8 + bob);
          g.lineTo(x + 8, base - 17 + bob);
          g.stroke();
        }
        g.fillStyle = skin;
        g.beginPath();
        g.arc(x, base - 13 + bob, 4.3, 0, Math.PI * 2);
        g.fill();
        if (rng.chance(0.6)) {
          g.fillStyle = rng.chance(0.5) ? '#3a2a1e' : rng.chance(0.5) ? '#e7c46a' : '#1c1c22';
          g.beginPath();
          g.arc(x, base - 14.5 + bob, 4.4, Math.PI, 0);
          g.fill();
        } else if (rng.chance(0.4)) {
          g.fillStyle = shirt;
          g.beginPath();
          g.ellipse(x, base - 16 + bob, 6, 2.2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }, 1.5);
}

function paintWater(W, h, rng) {
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const deep = g.createLinearGradient(0, 0, 0, h);
    deep.addColorStop(0, 'rgba(40,200,220,0.82)');
    deep.addColorStop(0.35, 'rgba(18,150,200,0.9)');
    deep.addColorStop(1, 'rgba(8,70,140,0.97)');
    g.fillStyle = deep;
    g.fillRect(0, 0, W, h);
    // a web of caustics (drawn wrapped so the strip can slide sideways without a seam)
    g.strokeStyle = 'rgba(210,255,255,0.28)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 46; i++) {
      const x0 = rng.range(0, W);
      const y0 = rng.range(6, h);
      const l = rng.range(14, 34);
      const b = rng.range(-8, 8);
      for (const o of [-W, 0, W]) {
        g.beginPath();
        g.moveTo(x0 + o, y0);
        g.quadraticCurveTo(x0 + o + l / 2, y0 + b, x0 + o + l, y0);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(230,255,255,0.18)';
    for (let i = 0; i < 60; i++) {
      const x = rng.range(0, W);
      const y = rng.range(4, h * 0.6);
      g.fillRect(x, y, rng.range(3, 9), 1.2);
    }
  }, 1);
}

function paintSeal() {
  return makeSprite(80, 110, (g) => {
    // body: a sleek upright torso, darker on the back, the belly catching the sun
    const body = g.createLinearGradient(-24, 0, 24, 0);
    body.addColorStop(0, '#6d6a72');
    body.addColorStop(0.45, '#4a4750');
    body.addColorStop(1, '#2a2830');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-20, 55);
    g.bezierCurveTo(-26, 20, -20, -10, -12, -24);
    g.lineTo(12, -24);
    g.bezierCurveTo(20, -10, 26, 20, 20, 55);
    g.closePath();
    g.fill();
    const belly = g.createRadialGradient(-4, 10, 2, 0, 18, 26);
    belly.addColorStop(0, 'rgba(200,190,180,0.75)');
    belly.addColorStop(1, 'rgba(200,190,180,0)');
    g.fillStyle = belly;
    g.beginPath();
    g.ellipse(0, 20, 14, 34, 0, 0, Math.PI * 2);
    g.fill();
    // flippers, held out for balance
    for (const s of [-1, 1]) {
      const fl = g.createLinearGradient(s * 14, 0, s * 36, 18);
      fl.addColorStop(0, '#4e4b55');
      fl.addColorStop(1, '#23212a');
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(s * 15, -2);
      g.quadraticCurveTo(s * 34, 6, s * 37, 22);
      g.quadraticCurveTo(s * 28, 20, s * 17, 14);
      g.closePath();
      g.fill();
    }
    // head, tipped back so the nose points at the sky
    const head = g.createRadialGradient(-7, -36, 2, 0, -30, 20);
    head.addColorStop(0, '#7d7a84');
    head.addColorStop(0.6, '#4d4a53');
    head.addColorStop(1, '#2e2c34');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -31, 17, 15, 0, 0, Math.PI * 2);
    g.fill();
    // muzzle
    const muz = g.createRadialGradient(-3, -46, 1, 0, -43, 11);
    muz.addColorStop(0, '#a29ea6');
    muz.addColorStop(1, '#5d5a63');
    g.fillStyle = muz;
    g.beginPath();
    g.ellipse(0, -43, 10, 9, 0, 0, Math.PI * 2);
    g.fill();
    // nose tip, where the balls bounce
    g.fillStyle = '#1a1820';
    g.beginPath();
    g.ellipse(0, -50, 5, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-1.6, -51.2, 1.8, 1, 0, 0, Math.PI * 2);
    g.fill();
    // whiskers
    g.strokeStyle = 'rgba(245,240,230,0.8)';
    g.lineWidth = 0.7;
    g.beginPath();
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        g.moveTo(s * 6, -42 + k * 2.4);
        g.quadraticCurveTo(s * 13, -44 + k * 3, s * 19, -42 + k * 5);
      }
    }
    g.stroke();
    g.fillStyle = 'rgba(30,28,36,0.6)';
    for (const [x, y] of [[-4, -41], [-6.5, -39], [4, -41], [6.5, -39]]) g.fillRect(x, y, 1, 1);
    // big glossy eyes, looking up at the ball
    for (const s of [-1, 1]) {
      g.fillStyle = '#0d0c12';
      g.beginPath();
      g.ellipse(s * 9, -31, 4, 4.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s * 9 - 1.2, -33, 1.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(s * 9 + 1.3, -30, 0.7, 0, Math.PI * 2);
      g.fill();
    }
    // wet sheen down the left of the body and head
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.ellipse(-12, 4, 3, 22, 0.1, 0, Math.PI * 2);
    g.ellipse(-9, -36, 4, 6, -0.6, 0, Math.PI * 2);
    g.fill();
    // a few darker spots
    g.fillStyle = 'rgba(20,18,26,0.25)';
    for (const [x, y, r] of [[8, -8, 2.4], [12, 6, 1.8], [-10, 26, 2], [14, 30, 2.2], [4, -18, 1.4]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function shadeBall(g, r) {
  const shade = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.35)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,20,50,0.38)');
  g.fillStyle = shade;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(-r * 0.38, -r * 0.45, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
  g.fill();
}

// The ball's pattern spins; the shading is painted on a separate fixed layer so the light
// always comes from the same side.
function paintBall(key, r) {
  return makeSprite(r * 2 + 2, r * 2 + 2, (g) => {
    g.save();
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.clip();
    if (key === 'beach') {
      const cols = ['#ff4d4d', '#ffffff', '#ffd23f', '#ffffff', '#2f8bff', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = cols[i];
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r + 1, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      g.fill();
    } else if (key === 'star') {
      g.fillStyle = '#ffcf33';
      g.fillRect(-r, -r, r * 2, r * 2);
      g.fillStyle = '#ff5a3c';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? r * 0.32 : r * 0.78;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    } else if (key === 'spots') {
      g.fillStyle = '#16c6b0';
      g.fillRect(-r, -r, r * 2, r * 2);
      g.fillStyle = '#ffffff';
      for (const [x, y, s] of [[0, 0, 0.3], [-0.6, -0.5, 0.2], [0.6, -0.4, 0.22], [0.5, 0.6, 0.2], [-0.55, 0.5, 0.24], [0, -0.85, 0.15]]) {
        g.beginPath();
        g.arc(x * r, y * r, s * r, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      const gold = g.createLinearGradient(-r, -r, r, r);
      gold.addColorStop(0, '#fff2a8');
      gold.addColorStop(0.5, '#f5b82e');
      gold.addColorStop(1, '#b8740e');
      g.fillStyle = gold;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.fillStyle = '#ff4fa3';
      g.fillRect(-r, -r * 0.2, r * 2, r * 0.4);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(-r, -r * 0.2, r * 2, r * 0.08);
    }
    g.restore();
    g.strokeStyle = 'rgba(0,30,60,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    g.stroke();
  });
}

function paintBallShade(r) {
  return makeSprite(r * 2 + 2, r * 2 + 2, (g) => shadeBall(g, r));
}

function paintRing() {
  return makeSprite(60, 20, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, 0, 18, 4.5, 0, 0, Math.PI * 2);
    g.stroke();
  });
}

// ---------- game ----------

export default {
  id: 'sealshow',
  title: 'Seal Show',
  emoji: '🦭',
  tagline: "Keep every ball bouncing on the seal's nose: hit one off-centre and it flies that way. A new ball joins the act every so often, and the first one to splash into the pool ends the show.",
  colors: { bg: '#bfeaff', fg: '#0d3a5c', accent: '#ff5a4e' },

  // Nu-disco at 128 BPM in G major: four-on-the-floor with an octave-jumping bass from the first
  // bar, then funky clav stabs and strings, a whistling hook, and a sparkling 16th-note finale.
  // 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5500).gain(0.17).room(0.35).roomsize(3)
      const ohat = s("[~ white]*4").decay(0.07).sustain(0).hpf(6800).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const shaker = s("[~ white ~ white]*2").decay(0.03).sustain(0).hpf(6500).gain(0.03)
      const bass = note("<[g2 g3]*4 [e2 e3]*4 [c2 c3]*4 [d2 d3]*4>").s("sawtooth")
        .decay(0.13).sustain(0.1).release(0.05).lpf(saw.range(500, 1500).slow(32)).lpq(5).gain(0.36)
      const chords = "<[g3,b3,d4,fs4] [e3,g3,b3,d4] [c3,e3,g3,b3] [d3,fs3,a3,c4]>"
      const clav = note(chords).struct("~ x ~ x ~ x x ~ ~ x ~ x ~ x x ~").s("square")
        .decay(0.08).sustain(0).lpf(2400).gain(0.06).pan(0.4)
      const strings = note(chords).s("sawtooth").attack(0.3).release(0.7)
        .lpf(saw.range(700, 2600).slow(32)).gain(0.055).room(0.55).roomsize(5).pan(0.6)
      const hook = note("<[d5 ~ b4 ~ d5 ~ e5 ~ d5 b4 ~ g4 ~ a4 b4 ~] [g5 ~ e5 ~ d5 ~ b4 ~ d5 ~ e5 ~ ~ d5 b4 ~] [e5 ~ g5 ~ e5 ~ c5 ~ b4 ~ c5 ~ e5 ~ ~ ~] [fs5 ~ e5 ~ d5 ~ c5 ~ a4 ~ fs4 ~ a4 ~ d5 ~]>")
        .s("triangle").decay(0.2).sustain(0.35).release(0.15).lpf(3200).gain(0.11).room(0.4)
        .delay(0.25).delaytime(0.352).delayfeedback(0.3)
      const sparkle = note("<[g5 d6 b5 d6]*4 [e5 b5 g5 b5]*4 [c6 g5 e6 g5]*4 [d6 a5 fs6 a5]*4>").s("sine")
        .decay(0.06).sustain(0).gain(0.045).delay(0.3).delaytime(0.176).delayfeedback(0.35)
    `,
    song: `arrange(
      [6, stack(kick, ohat, clap, bass)],
      [8, stack(kick, ohat, clap, bass, clav, strings)],
      [8, stack(kick, ohat, shaker, clap, bass, clav, strings, hook)],
      [10, stack(kick, hats16, shaker, clap, bass, clav, strings, hook, sparkle)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const arena = paintArena(W, H, art);
    const crowd = [paintCrowd(W, rng.fork('crowd'), 0), paintCrowd(W, rng.fork('crowd'), 1)];
    const waterH = H - WATER_Y + 4;
    const water = paintWater(W, waterH, art);
    const sealArt = paintSeal();
    const ballArt = Object.fromEntries(BALLS.map((b) => [b.key, paintBall(b.key, b.r)]));
    const shadeArt = Object.fromEntries(BALLS.map((b) => [b.key, paintBallShade(b.r)]));
    const ring = paintRing();
    const sunGlow = glowSprite('rgba(255,240,190,1)', 90);
    const ballGlow = glowSprite('rgba(255,255,230,1)', 30);
    const coralGlow = glowSprite('rgba(255,90,78,1)', 30);
    const vignette = vignetteSprite(W, H, 0.3, '10,50,90');

    const seal = createMover({ x: W / 2, minX: 34, maxX: W - 34, speed: 340, accel: 24 });
    const fx = createParticles();
    const ripples = []; // cosmetic rings on the water: { x, age, size }

    const gScale = (t) => lerp(1, 1.25, progress(t, 60, 1.3));

    // where each ball will be tossed in from (decided up front, so it never depends on play)
    const tosses = TOSSES.map((T, i) => ({ T, i, x: i === 0 ? W / 2 : rng.range(110, W - 110), at: T + WARN, planned: i === 0, done: false }));
    const balls = []; // { def, x, y, vx, vy, spin, rot, squash }

    let clock = 0;
    let lastT = 0;
    let nod = 0; // the nose's little bob after a bounce
    let cheer = 0;
    let lost = null;
    let splashT = 0;

    function lo(b) {
      return WALL + b.def.r;
    }
    function hi(b) {
      return W - WALL - b.def.r;
    }

    // fold a free x position back between the pool walls, as if it bounced off them
    function fold(x, a, b) {
      const L = b - a;
      let u = (x - a) % (2 * L);
      if (u < 0) u += 2 * L;
      return a + (u > L ? 2 * L - u : u);
    }

    // where and when a falling ball reaches nose height
    function predict(b, t) {
      const g = G * gScale(t);
      const yc = NOSE_Y - b.def.r;
      const dy = yc - b.y;
      const disc = b.vy * b.vy + 2 * g * dy;
      if (disc < 0) return null;
      const T = (-b.vy + Math.sqrt(disc)) / g;
      return { T, x: fold(b.x + b.vx * T, lo(b), hi(b)) };
    }

    function splash(x, y, big) {
      fx.burst(x, y, { count: big ? 60 : 8, speed: big ? 260 : 110, life: big ? 1.1 : 0.5, size: big ? 4 : 2.5, round: true, gravity: 520, angle: -Math.PI / 2, spread: big ? 1.6 : 1.2, colors: ['#ffffff', '#c9f4ff', '#7fdcf0'] });
      ripples.push({ x, age: 0, size: big ? 1.6 : 0.6 });
    }

    const game = {
      dead: false,
      deathReason: '',
      get balls() {
        return balls;
      },
      get seal() {
        return seal;
      },

      update(dt, dir, t) {
        clock += dt;
        lastT = t;
        nod = Math.max(0, nod - dt * 5);
        cheer = Math.max(0, cheer - dt);
        seal.update(dt, dir);

        for (const s of tosses) {
          if (s.done) continue;
          if (!s.planned && t >= s.T + WARN) {
            // time the drop so the new ball comes down in the middle of the biggest gap between
            // the balls already in the air: the juggle stays evenly spaced if you keep it going
            s.planned = true;
            const g = G * gScale(t);
            const P = 2 * Math.sqrt((2 * RISE) / g);
            const fall = Math.sqrt((2 * (NOSE_Y + 6)) / g);
            const ph = balls.map((b) => (t + (predict(b, t)?.T ?? 0)) % P).sort((a, b) => a - b);
            let target = ph[0] + P / 2;
            let gap = 0;
            ph.forEach((a, k) => {
              const next = k + 1 < ph.length ? ph[k + 1] : ph[0] + P;
              if (next - a > gap) {
                gap = next - a;
                target = a + gap / 2;
              }
            });
            s.at = t + ((((target - (t + fall)) % P) + P) % P);
          }
          if (!s.planned || t < s.at) continue;
          s.done = true;
          const def = BALLS[s.i];
          balls.push({ def, x: s.x, y: -def.r - 6, vx: 0, vy: 0, rot: 0, spin: 0, squash: 0, hits: 0 });
          cheer = 1;
        }

        const sx = seal.x;
        for (const b of balls) {
          const g = G * gScale(t);
          const prevBottom = b.y + b.def.r;
          b.vy += g * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < lo(b)) {
            b.x = 2 * lo(b) - b.x;
            b.vx = Math.abs(b.vx);
          } else if (b.x > hi(b)) {
            b.x = 2 * hi(b) - b.x;
            b.vx = -Math.abs(b.vx);
          }
          b.rot += b.spin * dt;
          b.squash = Math.max(0, b.squash - dt * 6);

          const bottom = b.y + b.def.r;
          const reach = NOSE_HALF + b.def.r;
          if (b.vy > 0 && bottom >= NOSE_Y && prevBottom < NOSE_Y + 14 && Math.abs(b.x - sx) < reach) {
            // boop: the offset from the middle of the nose tips the bounce sideways
            const off = clamp((b.x - sx) / reach, -1, 1);
            const a = off * MAX_ANGLE;
            const V = Math.sqrt(2 * g * RISE);
            b.vx = clamp(V * Math.sin(a) + b.vx * KEEP_VX, -260, 260);
            b.vy = -V * Math.cos(a);
            b.y = NOSE_Y - b.def.r;
            b.spin = b.vx * 0.05 + off * 4;
            b.squash = 1;
            b.hits++;
            nod = 1;
            fx.burst(b.x, NOSE_Y, { count: 7, speed: 120, life: 0.4, size: 3, round: true, drag: 3, angle: -Math.PI / 2, spread: 2.2, colors: ['#ffffff', '#fff3a8', b.def.key === 'beach' ? '#ff4d4d' : '#ffcf33'] });
            continue;
          }
          if (bottom >= WATER_Y + 6) {
            this.dead = true;
            lost = b;
            this.deathReason = `The ${b.def.name} splashed into the pool.`;
            splash(b.x, WATER_Y, true);
            break;
          }
        }

        // the seal's wake (cosmetic)
        if (Math.abs(seal.vx) > 120 && Math.random() < 0.5) {
          fx.burst(seal.x - Math.sign(seal.vx) * 20, WATER_Y, { count: 1, speed: 60, life: 0.5, size: 2.5, round: true, gravity: 300, angle: -Math.PI / 2 - Math.sign(seal.vx) * 0.8, spread: 0.6, colors: ['#ffffff', '#c9f4ff'] });
        }
        if (Math.random() < dt * 3) ripples.push({ x: seal.x + (Math.random() - 0.5) * 30, age: 0, size: 0.5 });
        for (let i = ripples.length - 1; i >= 0; i--) {
          ripples[i].age += dt;
          if (ripples[i].age > 1.2) ripples.splice(i, 1);
        }
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        splashT += dt;
        if (lost) {
          lost.y += 30 * dt;
          lost.x += lost.vx * 0.2 * dt;
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          ripples[i].age += dt;
          if (ripples[i].age > 1.2) ripples.splice(i, 1);
        }
        fx.update(dt);
      },

      render(g) {
        drawSprite(g, arena, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.86, 30, { size: 300, alpha: 0.5 });
        g.globalCompositeOperation = 'source-over';
        // the crowd bobs, and jumps up whenever a new ball is tossed in
        const bounce = Math.floor(clock * (2.1 + cheer * 4)) % 2;
        drawSprite(g, crowd[cheer > 0 ? bounce : bounce && Math.sin(clock * 0.7) > 0.3 ? 1 : 0], W / 2, 162 + 100);
        // a sunny haze pushes the stands back so the balls stand out
        g.fillStyle = 'rgba(225,244,255,0.22)';
        g.fillRect(0, 122, W, 240);

        // bunting across the top of the stands
        for (const [y0, sag, n, ph] of [[132, 22, 12, 0], [148, 16, 10, 1.7]]) {
          g.strokeStyle = 'rgba(60,80,110,0.6)';
          g.lineWidth = 1;
          g.beginPath();
          for (let i = 0; i <= 24; i++) {
            const x = (i / 24) * W;
            const y = y0 + Math.sin((i / 24) * Math.PI) * sag + Math.sin(clock * 1.4 + ph) * 2;
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
          const cols = ['#ff5a4e', '#ffd23f', '#2f8bff', '#16c6b0', '#ffffff'];
          for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const x = u * W;
            const y = y0 + Math.sin(u * Math.PI) * sag + Math.sin(clock * 1.4 + ph) * 2;
            const flap = Math.sin(clock * 3 + i * 1.3 + ph) * 2;
            g.fillStyle = cols[(i + (ph ? 2 : 0)) % cols.length];
            g.beginPath();
            g.moveTo(x - 7, y);
            g.lineTo(x + 7, y);
            g.lineTo(x + flap, y + 13);
            g.closePath();
            g.fill();
          }
        }

        // landing rings on the water and a warning for each ball about to be tossed in
        for (const s of tosses) {
          if (s.done || lastT < s.T) continue;
          const k = clamp((lastT - s.T) / WARN, 0, 1);
          const blink = 0.55 + 0.45 * Math.sin(clock * 14);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, coralGlow, s.x, 26, { size: 60, alpha: 0.5 * blink });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(255,90,78,${0.6 + 0.4 * blink})`;
          g.beginPath();
          g.moveTo(s.x - 10, 14);
          g.lineTo(s.x + 10, 14);
          g.lineTo(s.x, 30);
          g.closePath();
          g.fill();
          g.strokeStyle = `rgba(255,255,255,${0.25 * k})`;
          g.setLineDash([4, 8]);
          g.beginPath();
          g.moveTo(s.x, 34);
          g.lineTo(s.x, NOSE_Y - 10);
          g.stroke();
          g.setLineDash([]);
          drawSprite(g, ring, s.x, WATER_Y + 4, { size: 50, alpha: 0.4 + 0.5 * k });
        }

        // the seal (its lower half goes under the water below)
        const lean = seal.lean;
        const bob = Math.sin(clock * 3) * 1.5 + nod * 3;
        drawSprite(g, sealArt, seal.x, SEAL_Y + bob, { rot: lean * 0.16, size: 96 });

        // the pool
        const drift = (clock * 12) % W;
        drawSprite(g, water, W / 2 + drift, WATER_Y + waterH / 2 - 2);
        drawSprite(g, water, W / 2 + drift - W, WATER_Y + waterH / 2 - 2);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const y = WATER_Y + Math.sin(x * 0.05 + clock * 2.5) * 1.6 + Math.sin(x * 0.13 - clock * 3.1) * 0.8;
          if (x) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
        for (const r of ripples) {
          const k = r.age / 1.2;
          g.globalAlpha = (1 - k) * 0.7;
          drawSprite(g, ring, r.x, WATER_Y + 3, { size: 30 + 70 * k * r.size });
        }
        g.globalAlpha = 1;

        // landing marks: brighter and tighter the sooner the ball comes down
        for (const b of balls) {
          if (b === lost || b.vy < -300) continue;
          const p = predict(b, lastT);
          if (!p) continue;
          const k = clamp(1 - p.T / 1.4, 0, 1);
          if (k <= 0) continue;
          drawSprite(g, ring, p.x, WATER_Y + 4, { size: lerp(56, 30, k) * (b.def.r / 15), alpha: 0.2 + 0.7 * k });
        }

        // the balls, with a soft halo so they pop against the stands
        g.globalCompositeOperation = 'lighter';
        for (const b of balls) drawSprite(g, ballGlow, b.x, b.y, { size: b.def.r * 3.4, alpha: 0.22 });
        g.globalCompositeOperation = 'source-over';
        for (const b of balls) {
          const sq = b.squash * 0.22;
          const sp = ballArt[b.def.key];
          const sh = shadeArt[b.def.key];
          g.save();
          g.translate(b.x, b.y + sq * b.def.r * 0.5);
          g.scale(1 + sq, 1 - sq);
          if (b === lost) g.globalAlpha = Math.max(0, 1 - splashT * 1.2);
          drawSprite(g, sp, 0, 0, { rot: b.rot, size: sp.w });
          drawSprite(g, sh, 0, 0, { size: sh.w });
          g.restore();
        }
        g.globalAlpha = 1;

        fx.render(g);
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
