// Sheepdog Trial — a misty morning on a heather moor. You're the collie, running back and forth
// behind a little flock. Sheep shy away from whichever side you come from, so you steer them
// from behind, and every sheep has to file through the gate in each dry-stone wall that comes
// down the hill. One sheep against the stones and the trial's over.

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

const DOG_Y = 552;
const SHEEP_R = 12;
const SIG = 46; // how close the dog has to be: sheep feel it most at this sideways distance
const PUSH = 650; // how hard a sheep shies away from the dog (px/s²)
const DAMP = 2.6; // sheep slow down quickly once the dog stops pressing them
const COHESION = 3.5; // pull towards the rest of the flock
const MAX_VX = 210;
const SX_MIN = 32; // sheep stay inside these…
const SX_MAX_PAD = 32;
const WALL_H = 22;
const HOMES = [420, 382, 458, 402, 440, 364]; // where each sheep likes to walk, in the order they join
const JOINS = [11, 24, 38]; // strays that join the flock
const JOIN_WARN = 1.1;
const BOLT_WARN = 0.75; // a sheep shivers this long before it bolts
const BOLT_LEN = 0.42;

// ---------- art ----------

// The moor, painted once as a tile that wraps top to bottom so it can scroll forever.
function paintMoor(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    g.fillStyle = '#65803f';
    g.fillRect(0, 0, W, H);
    const wrap = (y, r, fn) => {
      fn(y);
      if (y - r < 0) fn(y + H);
      if (y + r > H) fn(y - H);
    };
    // soft patches of paler and darker grass
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(0, H);
      const r = rng.range(30, 80);
      const tone = rng.pick(['rgba(140,160,80,0.25)', 'rgba(60,90,40,0.28)', 'rgba(150,140,90,0.18)', 'rgba(90,120,60,0.25)']);
      wrap(y, r, (yy) => {
        const p = g.createRadialGradient(x, yy, 1, x, yy, r);
        p.addColorStop(0, tone);
        p.addColorStop(1, tone.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = p;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      });
    }
    // a worn sheep track snaking up the hill
    g.strokeStyle = 'rgba(170,160,110,0.22)';
    g.lineWidth = 26;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = -20; y <= H + 20; y += 10) {
      const x = W / 2 + Math.sin((y / H) * Math.PI * 2) * 70 + Math.sin((y / H) * Math.PI * 6) * 14;
      if (y === -20) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // grass tufts
    for (let i = 0; i < 520; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const c = rng.pick(['#86a052', '#4d6a2e', '#9db562', '#59773a', '#a9ad6a']);
      g.strokeStyle = c;
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + rng.range(-0.6, 0.6);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      }
      g.stroke();
    }
    // heather clumps: dark stems under purple and pink flowers
    for (let i = 0; i < 24; i++) {
      const x = rng.range(-10, W + 10);
      const y = rng.range(0, H);
      const r = rng.range(8, 17);
      wrap(y, r + 4, (yy) => {
        g.fillStyle = 'rgba(40,40,30,0.25)';
        g.beginPath();
        g.ellipse(x + 3, yy + 4, r, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4d4a33';
        g.beginPath();
        g.ellipse(x, yy, r, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        const n = Math.floor(r * 3);
        for (let k = 0; k < n; k++) {
          const a = rng.range(0, Math.PI * 2);
          const d = Math.sqrt(rng.next()) * r * 0.95;
          g.fillStyle = rng.pick(['#8a5590', '#9c63a0', '#734479', '#a877a8', '#7f4c82']);
          g.beginPath();
          g.arc(x + Math.cos(a) * d, yy + Math.sin(a) * d * 0.75, rng.range(1.4, 2.6), 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    // gorse bushes with yellow flowers
    for (let i = 0; i < 6; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(10, 15);
      wrap(y, r + 4, (yy) => {
        g.fillStyle = 'rgba(30,40,20,0.3)';
        g.beginPath();
        g.ellipse(x + 4, yy + 5, r, r * 0.8, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3b5524';
        g.beginPath();
        g.arc(x, yy, r, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < 26; k++) {
          const a = rng.range(0, Math.PI * 2);
          const d = Math.sqrt(rng.next()) * r * 0.9;
          g.fillStyle = rng.pick(['#f2c230', '#ffd84a', '#e0a91c']);
          g.fillRect(x + Math.cos(a) * d - 1, yy + Math.sin(a) * d - 1, 2.2, 2.2);
        }
      });
    }
    // lichen-spotted rocks
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(4, 11);
      wrap(y, r + 4, (yy) => {
        g.fillStyle = 'rgba(30,35,20,0.35)';
        g.beginPath();
        g.ellipse(x + 2, yy + 3, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
        g.fill();
        const rock = g.createRadialGradient(x - r * 0.4, yy - r * 0.4, 1, x, yy, r * 1.2);
        rock.addColorStop(0, '#c9c5b6');
        rock.addColorStop(1, '#7c786c');
        g.fillStyle = rock;
        g.beginPath();
        g.ellipse(x, yy, r * 1.1, r * 0.8, rng.range(0, 3), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(210,200,120,0.6)';
        g.beginPath();
        g.arc(x + r * 0.3, yy - r * 0.1, r * 0.25, 0, Math.PI * 2);
        g.fill();
      });
    }
  }, 1);
}

// A long run of dry-stone wall, drawn from above: rows of grey stones with a capstone ridge.
function paintWall(W, rng) {
  const h = WALL_H + 8;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    g.fillStyle = 'rgba(25,30,15,0.35)';
    g.fillRect(0, 9, W, WALL_H);
    g.fillStyle = '#5d5a52';
    g.fillRect(0, 3, W, WALL_H);
    for (let row = 0; row < 3; row++) {
      let x = -rng.range(0, 10);
      const y = 3 + row * (WALL_H / 3);
      while (x < W) {
        const w = rng.range(8, 16);
        const shade = rng.range(0.75, 1.1);
        const c = (v) => Math.round(clamp(v * shade, 0, 255));
        const st = g.createLinearGradient(0, y, 0, y + WALL_H / 3);
        st.addColorStop(0, `rgb(${c(196)},${c(192)},${c(180)})`);
        st.addColorStop(1, `rgb(${c(128)},${c(124)},${c(114)})`);
        g.fillStyle = st;
        g.beginPath();
        g.ellipse(x + w / 2, y + WALL_H / 6, w / 2 - 0.6, WALL_H / 6 - 0.3, 0, 0, Math.PI * 2);
        g.fill();
        if (rng.chance(0.25)) {
          g.fillStyle = 'rgba(160,180,90,0.55)';
          g.beginPath();
          g.arc(x + w * rng.range(0.3, 0.7), y + 2, rng.range(1, 2.4), 0, Math.PI * 2);
          g.fill();
        }
        x += w;
      }
    }
    g.fillStyle = 'rgba(255,255,240,0.18)';
    g.fillRect(0, 3, W, 2);
  }, 2);
}

function paintPost() {
  return makeSprite(16, 30, (g) => {
    g.fillStyle = 'rgba(25,30,15,0.4)';
    g.fillRect(-5, -6, 12, 18);
    const wood = g.createLinearGradient(-6, 0, 6, 0);
    wood.addColorStop(0, '#a77a4c');
    wood.addColorStop(1, '#5c3b1f');
    g.fillStyle = wood;
    g.fillRect(-6, -10, 12, 16);
    g.fillStyle = '#c4986a';
    g.fillRect(-6, -10, 12, 3);
    g.strokeStyle = 'rgba(60,35,15,0.5)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.arc(0, -2, 3.5, 0, Math.PI * 2);
    g.stroke();
  });
}

// A five-bar gate, swung open, seen from above.
function paintGate() {
  return makeSprite(12, 52, (g) => {
    g.fillStyle = 'rgba(25,30,15,0.3)';
    g.fillRect(-2, -24, 7, 50);
    g.fillStyle = '#8c6338';
    g.fillRect(-3, -25, 5, 50);
    g.fillStyle = '#b7894f';
    g.fillRect(-3, -25, 2, 50);
    g.fillStyle = '#6b4824';
    for (let y = -22; y < 24; y += 11) g.fillRect(-3.5, y, 6, 1.5);
  });
}

function paintSheep(rng, dark) {
  return makeSprite(34, 42, (g) => {
    // shadow
    g.fillStyle = 'rgba(20,30,10,0.3)';
    g.beginPath();
    g.ellipse(3, 6, 13, 16, 0, 0, Math.PI * 2);
    g.fill();
    // little dark legs peeking out
    g.fillStyle = '#2b2622';
    for (const [x, y] of [[-8, -8], [8, -8], [-8, 12], [8, 12]]) {
      g.beginPath();
      g.ellipse(x, y, 2.4, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    // the fleece: lots of overlapping curls, lit from the top left
    const wool = dark ? ['#8d8178', '#a39890', '#776b62'] : ['#f7f2e6', '#ece4d2', '#ddd3bd'];
    const body = g.createRadialGradient(-4, -2, 2, 0, 3, 16);
    body.addColorStop(0, wool[0]);
    body.addColorStop(1, wool[2]);
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 3, 12, 14.5, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next());
      const x = Math.cos(a) * d * 10;
      const y = 3 + Math.sin(a) * d * 12.5;
      const r = rng.range(2.6, 4.2);
      const lit = clamp(0.6 - (x + y) / 30, 0, 1);
      g.fillStyle = lit > 0.55 ? wool[0] : lit > 0.3 ? wool[1] : wool[2];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = dark ? 'rgba(60,50,45,0.35)' : 'rgba(170,155,130,0.45)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(x, y, r * 0.6, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    // head, facing up the hill
    const head = g.createRadialGradient(-1.5, -16, 0.5, 0, -14, 7);
    head.addColorStop(0, '#4a423c');
    head.addColorStop(1, '#1d1916');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -14, 5, 6.6, 0, 0, Math.PI * 2);
    g.fill();
    // ears
    for (const s of [-1, 1]) {
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.ellipse(s * 6, -12, 3.6, 1.7, s * 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(220,150,140,0.5)';
      g.beginPath();
      g.ellipse(s * 6.3, -12, 2, 0.8, s * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // a woolly topknot
    g.fillStyle = wool[0];
    g.beginPath();
    g.arc(0, -10, 3.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-1.5, -18, 1.4, 1.8, 0, 0, Math.PI * 2);
    g.fill();
  });
}

// The collie from above, in two running poses.
function paintDog(frame) {
  return makeSprite(36, 58, (g) => {
    const s = frame ? 1 : -1;
    g.fillStyle = 'rgba(20,30,10,0.32)';
    g.beginPath();
    g.ellipse(3, 6, 11, 22, 0, 0, Math.PI * 2);
    g.fill();
    // legs, mid stride
    g.fillStyle = '#f4f0e6';
    for (const [x, y] of [[-6, -10 + s * 3], [6, -10 - s * 3], [-6, 12 - s * 3], [6, 12 + s * 3]]) {
      g.beginPath();
      g.ellipse(x, y, 2.4, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // tail: a black brush with a white tip
    g.strokeStyle = '#1a1714';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 16);
    g.quadraticCurveTo(s * 7, 22, s * 3, 28);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(s * 3, 28, 2.8, 0, Math.PI * 2);
    g.fill();
    // body
    const body = g.createLinearGradient(-9, 0, 9, 0);
    body.addColorStop(0, '#3a3530');
    body.addColorStop(0.4, '#1d1a17');
    body.addColorStop(1, '#0d0b0a');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 3, 8.5, 15, 0, 0, Math.PI * 2);
    g.fill();
    // white collar and blaze
    g.fillStyle = '#f7f3ea';
    g.beginPath();
    g.ellipse(0, -9, 8.6, 4.4, 0, 0, Math.PI * 2);
    g.fill();
    // head
    const head = g.createRadialGradient(-2, -17, 1, 0, -15, 8);
    head.addColorStop(0, '#3d3833');
    head.addColorStop(1, '#100e0c');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -16, 6.2, 6.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f3ea';
    g.beginPath();
    g.moveTo(-1.3, -12);
    g.lineTo(1.3, -12);
    g.lineTo(2.4, -23);
    g.lineTo(-2.4, -23);
    g.closePath();
    g.fill();
    // snout and nose
    g.fillStyle = '#efe8dc';
    g.beginPath();
    g.ellipse(0, -23, 3, 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.ellipse(0, -26, 1.6, 1.1, 0, 0, Math.PI * 2);
    g.fill();
    // ears, half pricked
    for (const e of [-1, 1]) {
      g.fillStyle = '#14110f';
      g.beginPath();
      g.moveTo(e * 3, -19);
      g.lineTo(e * 8.5, -15);
      g.lineTo(e * 5, -12);
      g.closePath();
      g.fill();
    }
    // sheen on the back
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.ellipse(-3.5, 2, 2, 9, 0, 0, Math.PI * 2);
    g.fill();
    // a red collar
    g.strokeStyle = '#d63a2f';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(0, -10.5, 6.5, 2.4, 0, Math.PI * 0.05, Math.PI * 0.95);
    g.stroke();
  });
}

function paintMist(rng, w, h) {
  return makeSprite(w, h, (g) => {
    for (let i = 0; i < 8; i++) {
      const x = rng.range(-w * 0.35, w * 0.35);
      const y = rng.range(-h * 0.2, h * 0.2);
      const r = rng.range(h * 0.25, h * 0.45);
      const m = g.createRadialGradient(x, y, 1, x, y, r);
      m.addColorStop(0, 'rgba(240,244,246,0.5)');
      m.addColorStop(1, 'rgba(240,244,246,0)');
      g.fillStyle = m;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 1);
}

// ---------- game ----------

export default {
  id: 'sheepdog',
  title: 'Sheepdog Trial',
  emoji: '🐑',
  tagline: 'You are the collie: sheep shy away from the side you run up on, so herd every one through the gate in each stone wall. One sheep hits the wall and the trial is over.',
  colors: { bg: '#4f6b35', fg: '#fbf6e8', accent: '#c98bc6' },

  // Celtic folktronica: a galloping jig in D Mixolydian at 140 BPM, four-on-the-floor kick and a
  // triplet bass from the first bar, a bagpipe-style drone and bodhrán, then a fiddle jig, then a
  // tin whistle soaring over it all for the last stretch. 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("d2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const bodhran = s("[brown ~ brown]*4").decay(0.12).sustain(0).lpf(700).gain("[0.5 0 0.3]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5200).gain(0.15).room(0.4).roomsize(3)
      const hats = s("[~ white white]*4").decay(0.025).sustain(0).hpf(7000).gain("[0 0.03 0.045]*4")
      const hats12 = s("white*12").decay(0.02).sustain(0).hpf(7000).gain("[0.05 0.025 0.035]*4")
      const bass = note("<[d2 d3 a2]*4 [c2 c3 g2]*4 [g2 g3 d3]*4 [a2 a3 e3]*4>").s("sawtooth")
        .decay(0.12).sustain(0.08).release(0.04).lpf(saw.range(450, 1400).slow(35)).lpq(4).gain(0.36)
      const drone = note("[d3,a3]").s("sawtooth").attack(0.4).release(0.5)
        .lpf(saw.range(500, 1300).slow(35)).gain(0.05).room(0.4).roomsize(4)
      const chords = "<[d4,fs4,a4] [c4,e4,g4] [b3,d4,g4] [a3,c4,e4]>"
      const stabs = note(chords).struct("[~ x ~]*4").s("square")
        .decay(0.09).sustain(0).lpf(1900).gain(0.05).pan(0.38)
      const fiddle = note("<[[a4 d5 d5] [fs5 d5 d5] [a5 fs5 d5] [e5 fs5 g5]] [[g5 e5 c5] [e5 c5 c5] [g5 e5 c5] [d5 e5 g5]] [[b5 g5 d5] [g5 d5 b4] [d5 g5 b5] [a5 g5 fs5]] [[e5 a5 a5] [c6 a5 e5] [g5 e5 c5] [d5 e5 fs5]]>")
        .s("sawtooth").decay(0.14).sustain(0.3).release(0.08).lpf(2600).gain(0.075).room(0.35).pan(0.6)
      const whistle = note("<[fs6 ~ ~ e6 ~ d6 a5 ~ ~ d6 ~ e6] [g6 ~ ~ e6 ~ c6 g5 ~ ~ c6 ~ e6] [d6 ~ ~ b5 ~ g5 d6 ~ g6 fs6 ~ e6] [e6 ~ ~ c6 ~ a5 e6 ~ g6 fs6 ~ ~]>")
        .s("triangle").decay(0.22).sustain(0.4).release(0.15).lpf(3600).gain(0.08).room(0.45)
        .delay(0.25).delaytime(0.321).delayfeedback(0.3)
    `,
    song: `arrange(
      [8, stack(kick, bodhran, bass, drone)],
      [9, stack(kick, bodhran, clap, hats, bass, drone, stabs)],
      [9, stack(kick, bodhran, clap, hats, bass, drone, stabs, fiddle)],
      [9, stack(kick, bodhran, clap, hats12, bass, drone, stabs, fiddle, whistle)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const moor = paintMoor(W, H, art);
    const wallArt = paintWall(W, art);
    const post = paintPost();
    const gateArt = paintGate();
    const sheepArt = [paintSheep(art, false), paintSheep(art, false), paintSheep(art, false), paintSheep(art, true)];
    const dogArt = [paintDog(0), paintDog(1)];
    const mists = [paintMist(art, 260, 120), paintMist(art, 220, 100), paintMist(art, 300, 140)];
    const sunGlow = glowSprite('rgba(255,236,190,1)', 120);
    const laneGlow = glowSprite('rgba(255,240,170,1)', 40);
    const redGlow = glowSprite('rgba(255,70,60,1)', 24);
    const vignette = vignetteSprite(W, H, 0.5, '20,30,15');

    const dog = createMover({ x: W / 2, minX: 14, maxX: W - 14, speed: 330, accel: 20 });
    const fx = createParticles();
    const sxMax = W - SX_MAX_PAD;

    // ---- the plan for the whole run, fixed up front so it never depends on how you play ----
    const plan = rng.fork('plan');
    const speedAt = (t) => lerp(82, 128, progress(t, 60, 1.2));
    const walls = []; // { y, prevY, gx, gw, hit }
    let nextWall = 1.6;
    let lastGap = W / 2;
    const wander = HOMES.map(() => ({ a: plan.range(0, 6.28), b: plan.range(0, 6.28), fa: plan.range(0.5, 0.9), fb: plan.range(1.1, 1.6) }));
    const joinSide = JOINS.map(() => (plan.chance(0.5) ? -1 : 1));
    // bolts: a sheep suddenly darts sideways (after a clear shiver)
    const bolts = [];
    for (let T = 15 + plan.range(0, 2); T < 58; T += lerp(6.5, 3.2, progress(T, 60, 1)) + plan.range(-0.8, 0.8)) {
      bolts.push({ T, pick: plan.next(), dir: plan.chance(0.5) ? -1 : 1, done: false });
    }

    const sheep = [];
    function addSheep(i, x, side = 0) {
      sheep.push({
        i,
        x,
        y: HOMES[i] + 8,
        vx: side ? -side * 150 : 0,
        entering: side,
        art: sheepArt[i === 4 ? 3 : i % 3],
        step: Math.random() * 6,
        shiver: 0,
        bolt: 0,
        boltDir: 0,
        dead: false,
      });
    }
    // the flock starts off to one side of the dog, so the first nudge moves it as one
    const start = W / 2 + (plan.chance(0.5) ? -1 : 1) * 58;
    addSheep(0, start - 30);
    addSheep(1, start + 2);
    addSheep(2, start + 32);
    const joins = JOINS.map((T, k) => ({ T, side: joinSide[k], done: false }));

    let clock = 0;
    let lastT = 0;
    let scroll = 0;
    let hop = 0; // the dog's leap over a wall (cosmetic)

    let deadT = 0;

    function gapOk(s, w) {
      return s.x - SHEEP_R * 0.55 >= w.gx - w.gw / 2 && s.x + SHEEP_R * 0.55 <= w.gx + w.gw / 2;
    }

    const game = {
      dead: false,
      deathReason: '',
      get sheep() {
        return sheep;
      },
      get dog() {
        return dog;
      },
      get walls() {
        return walls;
      },

      update(dt, dir, t) {
        clock += dt;
        lastT = t;
        dog.update(dt, dir);
        const v = speedAt(t);
        scroll += v * dt;
        hop = Math.max(0, hop - dt);

        // walls roll down the hill
        if (t >= nextWall) {
          const p = progress(t, 60, 1.15);
          const gw = lerp(186, 110, p);
          const maxShift = lerp(70, 170, p);
          const lo = gw / 2 + 26;
          const hi = W - gw / 2 - 26;
          let gx = lastGap + (plan.chance(0.5) ? -1 : 1) * plan.range(0.35, 1) * maxShift;
          if (gx < lo || gx > hi) gx = lastGap - (gx - lastGap); // bounce the other way instead
          gx = clamp(gx, lo, hi);
          lastGap = gx;
          walls.push({ y: -WALL_H, prevY: -WALL_H, gx, gw, hit: false, swing: 0 });
          nextWall = t + lerp(4.8, 3.0, progress(t, 60, 1.25)) + plan.range(-0.25, 0.25);
          // keep a lull around each stray's arrival: no wall reaches the flock just as it joins
          for (const J of JOINS) {
            const reach = 410 / speedAt(J);
            if (nextWall > J - reach - 0.7 && nextWall < J - reach + 2.6) nextWall = J - reach + 2.6;
          }
        }
        for (const w of walls) {
          w.prevY = w.y;
          w.y += v * dt;
          if (w.prevY < DOG_Y && w.y >= DOG_Y && Math.abs(dog.x - w.gx) > w.gw / 2 - 8) hop = 0.35;
        }
        while (walls.length && walls[0].y > H + 40) walls.shift();

        // strays join on schedule, from the side, in a lull between two walls
        for (const j of joins) {
          if (j.done || t < j.T) continue;
          j.done = true;
          addSheep(sheep.length, j.side < 0 ? -20 : W + 20, j.side);
        }

        // bolts, assigned to whoever is in the flock at the time
        // (only just after a wall has gone by, so there's time to round it up before the next)
        const passed = walls.some((w) => w.prevY < 472 && w.y >= 472);
        for (const b of bolts) {
          if (b.done || t < b.T || !passed) continue;
          b.done = true;
          const s = sheep[Math.floor(b.pick * sheep.length)];
          if (s && !s.entering) {
            s.shiver = BOLT_WARN;
            s.boltDir = b.dir;
          }
        }

        // the flock
        let mean = 0;
        for (const s of sheep) mean += s.x;
        mean /= sheep.length;
        const amp = lerp(20, 65, progress(t, 60, 1.1));
        for (const s of sheep) {
          let ax = 0;
          if (s.entering) {
            ax += -s.entering * 260;
            if (s.x > 50 && s.x < W - 50) s.entering = 0;
          } else {
            const dx = s.x - dog.x;
            const near = clamp(1.3 - (DOG_Y - s.y) / 220, 0.45, 1);
            const u = dx / SIG;
            ax += PUSH * 1.6487 * u * Math.exp(-0.5 * u * u) * near;
            const wd = wander[s.i];
            ax += amp * (Math.sin(clock * wd.fa + wd.a) + 0.6 * Math.sin(clock * wd.fb + wd.b));
            ax += COHESION * (mean - s.x);
            if (s.x < 56) ax += (56 - s.x) * 7;
            if (s.x > W - 56) ax -= (s.x - (W - 56)) * 7;
          }
          if (s.shiver > 0) {
            s.shiver -= dt;
            if (s.shiver <= 0) s.bolt = BOLT_LEN;
          } else if (s.bolt > 0) {
            s.bolt -= dt;
            ax += s.boltDir * 720;
          }
          // personal space
          let ay = 0;
          for (const o of sheep) {
            if (o === s) continue;
            const ddx = s.x - o.x;
            const ddy = s.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < 26 * 26 && d2 > 0.01) {
              const d = Math.sqrt(d2);
              ax += (ddx / d) * (26 - d) * 14;
              ay += (ddy / d) * (26 - d) * 3;
            }
          }
          s.vx += ax * dt;
          s.vx *= Math.exp(-DAMP * dt);
          s.vx = clamp(s.vx, -MAX_VX, MAX_VX);
          const px = s.x;
          s.x += s.vx * dt;
          if (!s.entering) {
            if (s.x < SX_MIN) (s.x = SX_MIN), (s.vx = Math.max(0, s.vx));
            if (s.x > sxMax) (s.x = sxMax), (s.vx = Math.min(0, s.vx));
          }
          const home = HOMES[s.i] + Math.sin(clock * 0.9 + s.i * 1.7) * 6;
          s.y += ((home - s.y) * 2 + ay) * dt;
          s.step += dt * (6 + Math.abs(s.x - px) / dt / 30);

          // the walls
          for (const w of walls) {
            if (w.prevY < s.y && w.y >= s.y && !s.entering) {
              if (!gapOk(s, w)) {
                this.dead = true;
                s.dead = true;

                w.hit = true;
                this.deathReason = 'A sheep missed the gate and ran into the dry-stone wall.';
                fx.burst(s.x, s.y - 8, { count: 50, speed: 190, life: 1, size: 4.5, round: true, drag: 2.5, colors: ['#ffffff', '#f3ecdc', '#e2d8c2'] });
                fx.burst(s.x, s.y - 12, { count: 14, speed: 120, life: 0.8, size: 3, gravity: 200, colors: ['#9a978c', '#c9c5b6', '#6f6b60'] });
                return;
              }
              w.swing = 1;
              fx.burst(s.x, s.y + 8, { count: 4, speed: 60, life: 0.5, size: 2.5, angle: Math.PI / 2, spread: 1.6, colors: ['#9db562', '#c2c47a', '#6f8a46'] });
            }
          }
        }
        for (const w of walls) w.swing = Math.max(0, w.swing - dt * 2);

        // the dog kicks up grass as it runs
        if (Math.abs(dog.vx) > 150 && Math.random() < 0.5) {
          fx.burst(dog.x - Math.sign(dog.vx) * 8, DOG_Y + 14, { count: 1, speed: 70, life: 0.45, size: 2.5, angle: Math.PI / 2 - Math.sign(dog.vx) * 0.9, spread: 0.8, colors: ['#9db562', '#6f8a46', '#c2c47a'] });
        }
        fx.update(dt, v);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        fx.update(dt);
      },

      render(g) {
        // the moor scrolls down: you're climbing the hill behind the flock
        const off = scroll % H;
        drawSprite(g, moor, W / 2, H / 2 + off);
        drawSprite(g, moor, W / 2, H / 2 + off - H);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.82, -10, { size: 420, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';

        // a warm lane of light below each gate shows where the flock has to be
        for (const w of walls) {
          if (w.y > 500 || w.hit) continue;
          const k = clamp((w.y + 40) / 260, 0, 1);
          const top = w.y + WALL_H / 2;
          const bot = 492;
          if (bot <= top) continue;
          const lane = g.createLinearGradient(0, top, 0, bot);
          lane.addColorStop(0, `rgba(255,240,170,${0.32 * k})`);
          lane.addColorStop(1, 'rgba(255,240,170,0)');
          g.fillStyle = lane;
          g.fillRect(w.gx - w.gw / 2, top, w.gw, bot - top);
          g.strokeStyle = `rgba(255,245,200,${0.35 * k})`;
          g.setLineDash([5, 7]);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(w.gx - w.gw / 2, top);
          g.lineTo(w.gx - w.gw / 2, bot);
          g.moveTo(w.gx + w.gw / 2, top);
          g.lineTo(w.gx + w.gw / 2, bot);
          g.stroke();
          g.setLineDash([]);
        }

        // the dog's reach: a soft glow on the grass where sheep will feel it
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, laneGlow, dog.x, DOG_Y - 70, { size: SIG * 4.5, alpha: 0.12 });
        g.globalCompositeOperation = 'source-over';

        // walls with their gateways
        for (const w of walls) {
          const L = w.gx - w.gw / 2;
          const R = w.gx + w.gw / 2;
          const sc = wallArt.canvas.width / W;
          const y = w.y - (WALL_H + 8) / 2;
          if (L > 0) g.drawImage(wallArt.canvas, 0, 0, L * sc, wallArt.canvas.height, 0, y, L, WALL_H + 8);
          if (R < W) g.drawImage(wallArt.canvas, R * sc, 0, (W - R) * sc, wallArt.canvas.height, R, y, W - R, WALL_H + 8);
          drawSprite(g, gateArt, L - 1, w.y - 26 - w.swing * 2, { rot: -0.18 - w.swing * 0.1 });
          drawSprite(g, post, L - 2, w.y);
          drawSprite(g, post, R + 2, w.y);
        }

        // warn about any sheep that's outside the next gate as it closes in
        for (const s of sheep) {
          const w = walls.find((ww) => ww.y < s.y && !ww.hit);
          if (!w || s.entering || s.dead) continue;
          const eta = (s.y - w.y) / speedAt(lastT);
          if (eta > 2.2 || gapOk(s, w)) continue;
          const blink = 0.5 + 0.5 * Math.sin(clock * 16);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, s.x, s.y, { size: 54, alpha: (0.25 + 0.35 * blink) * clamp(1.4 - eta / 2.2, 0, 1) });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(255,70,60,${0.7 + 0.3 * blink})`;
          g.beginPath();
          g.moveTo(s.x, s.y - 34);
          g.lineTo(s.x - 5, s.y - 25);
          g.lineTo(s.x + 5, s.y - 25);
          g.closePath();
          g.fill();
          g.fillStyle = '#fff';
          g.fillRect(s.x - 0.8, s.y - 31, 1.6, 3.5);
          g.fillRect(s.x - 0.8, s.y - 27, 1.6, 1.4);
        }

        // strays about to join the flock
        for (const j of joins) {
          if (j.done || lastT < j.T - JOIN_WARN) continue;
          const blink = 0.5 + 0.5 * Math.sin(clock * 12);
          const x = j.side < 0 ? 16 : W - 16;
          const y = HOMES[sheep.length] ?? 400;
          g.fillStyle = `rgba(255,248,225,${0.6 + 0.4 * blink})`;
          g.beginPath();
          g.moveTo(x - j.side * 8, y - 9);
          g.lineTo(x + j.side * 4, y);
          g.lineTo(x - j.side * 8, y + 9);
          g.closePath();
          g.fill();
        }

        // the flock
        for (const s of sheep) {
          let x = s.x;
          let rot = clamp(s.vx / 500, -0.45, 0.45);
          if (s.shiver > 0) x += Math.sin(clock * 70) * 2.2;
          if (s.bolt > 0) rot = s.boltDir * 0.5;
          const bob = Math.sin(s.step) * 1.2;
          let alpha = 1;
          if (s.dead) {
            rot += Math.sin(deadT * 30) * 0.15 * Math.max(0, 1 - deadT);
            alpha = 1;
          }
          drawSprite(g, s.art, x, s.y + bob, { rot, size: 34, alpha });
          if (s.shiver > 0) {
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 1.5;
            for (const e of [-1, 1]) {
              g.beginPath();
              g.moveTo(x + e * 16, s.y - 6);
              g.lineTo(x + e * 20, s.y - 10);
              g.moveTo(x + e * 17, s.y);
              g.lineTo(x + e * 22, s.y);
              g.stroke();
            }
          }
        }

        // the collie
        const frame = Math.floor(clock * (Math.abs(dog.vx) > 40 ? 12 : 3)) % 2;
        const leap = hop > 0 ? Math.sin((1 - hop / 0.35) * Math.PI) : 0;
        drawSprite(g, dogArt[frame], dog.x, DOG_Y - leap * 6, { rot: dog.lean * 0.35, size: 40 * (1 + leap * 0.18) });

        fx.render(g);

        // morning mist drifting over the moor
        for (let i = 0; i < 3; i++) {
          const m = mists[i];
          const y = ((scroll * (0.5 + i * 0.25) + i * 240) % (H + 200)) - 100;
          const x = W / 2 + Math.sin(clock * 0.15 + i * 2) * 60 + (i - 1) * 90;
          drawSprite(g, m, x, y, { alpha: 0.55 });
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
