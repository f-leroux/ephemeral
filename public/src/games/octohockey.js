// Octo Hockey — you guard the goal at your end of an air-hockey table, and a smug octopus at the
// other end keeps shooting. It has eight arms and plenty of pucks: every tentacle sets a puck down
// on the far side, pulls back and flicks it at your goal, straight or banked off the rails (once,
// then twice later on), faster and faster, often with two or three in the air at once. Your mallet
// only slides left and right along your goal line, and every puck has to touch it. From 12s the
// octopus mixes in blobs of ink: those you must never touch (they splash harmlessly into your
// goal), and they're aimed where you just were or where you're about to go. A dotted line shows
// the first leg of every shot as the tentacle winds up; reading the banks is the game.
// Every shot is planned up front from the rng on a fixed timeline, so the run is the same whatever
// you do; blocked pucks fly back up and the octopus catches them.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, createMover, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const XL = 20; // inner faces of the side rails
const XR = 340;
const TOP = 116; // inner face of the far rail
const GOAL = 604; // a puck past this line is in your goal
const MY = 548; // your mallet's line
const SY = 172; // where the octopus sets pucks down
const PR = 10; // puck radius
const IR = 11; // ink blob radius
const MR = 24; // mallet radius
const MS = 400; // mallet top speed
const A = XL + PR; // where a puck's centre bounces
const C = XR - PR;
const L = C - A;
const XMIN = XL + MR + 4;
const XMAX = XR - MR - 4;

// fold an unrolled x back between the rails (mirror images = bank shots)
const fold = (u) => {
  let m = (u - A) % (2 * L);
  if (m < 0) m += 2 * L;
  return m <= L ? A + m : A + 2 * L - m;
};
const segOf = (u) => Math.floor((u - A) / L);

// ---------- art ----------

function paintScene(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the arcade wall behind the far end
    const wall = g.createLinearGradient(0, 0, 0, 130);
    wall.addColorStop(0, '#120b2c');
    wall.addColorStop(1, '#2d1758');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, 130);
    // wallpaper: faint diamonds
    g.strokeStyle = 'rgba(160,120,255,0.08)';
    g.lineWidth = 1;
    for (let x = -20; x < W + 20; x += 24) {
      for (let y = 0; y < 120; y += 24) {
        g.beginPath();
        g.moveTo(x, y + 12);
        g.lineTo(x + 12, y);
        g.lineTo(x + 24, y + 12);
        g.lineTo(x + 12, y + 24);
        g.closePath();
        g.stroke();
      }
    }
    // neon tubes, glowing (pre-rendered once, so blur is fine here)
    const neon = (col, draw, w = 3) => {
      g.save();
      g.shadowColor = col;
      g.shadowBlur = 14;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      draw();
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = w * 0.35;
      draw();
      g.stroke();
      g.restore();
    };
    // right: a neon puck and mallet, and a zigzag
    neon('#3df5ff', () => {
      g.beginPath();
      g.arc(300, 38, 14, 0, TAU);
    });
    neon('#3df5ff', () => {
      g.beginPath();
      g.arc(300, 38, 6, 0, TAU);
    }, 2);
    neon('#ff4fd8', () => {
      g.beginPath();
      g.moveTo(258, 70);
      for (let i = 0; i < 8; i++) g.lineTo(266 + i * 10, i % 2 ? 70 : 60);
    });
    // left: the LED scoreboard
    g.fillStyle = '#07040f';
    g.strokeStyle = '#7a5cff';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(14, 22, 92, 50, 8);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,90,120,0.18)';
    for (let x = 22; x < 100; x += 4) for (let y = 46; y < 68; y += 4) g.fillRect(x, y, 2, 2);
    g.font = `800 10px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.fillStyle = '#c9b8ff';
    g.fillText('SAVES', 60, 38);
    // bulb sockets along the top of the far rail
    // side rails
    const rail = (x, w) => {
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#0f1f55');
      gr.addColorStop(0.45, '#2a4bb0');
      gr.addColorStop(0.55, '#3f66d6');
      gr.addColorStop(1, '#14286a');
      g.fillStyle = gr;
      g.fillRect(x, 100, w, 530);
    };
    rail(0, XL);
    rail(XR, W - XR);
    // chrome edge strips facing the table
    for (const [x, d] of [[XL - 4, 1], [XR, -1]]) {
      const gr = g.createLinearGradient(x, 0, x + 4, 0);
      gr.addColorStop(d > 0 ? 0 : 1, '#8a96b8');
      gr.addColorStop(0.5, '#ffffff');
      gr.addColorStop(d > 0 ? 1 : 0, '#b8c2dc');
      g.fillStyle = gr;
      g.fillRect(x, 112, 4, 500);
    }
    // bolts
    for (let y = 140; y < 600; y += 70) {
      for (const x of [10, W - 10]) {
        g.fillStyle = '#c8d2ee';
        g.beginPath();
        g.arc(x, y, 2.6, 0, TAU);
        g.fill();
        g.fillStyle = '#5a6a9a';
        g.fillRect(x - 1.8, y - 0.4, 3.6, 0.8);
      }
    }
    // the table surface
    const surf = g.createLinearGradient(0, TOP, 0, GOAL);
    surf.addColorStop(0, '#d6eeff');
    surf.addColorStop(0.5, '#eef8ff');
    surf.addColorStop(1, '#cfe9ff');
    g.fillStyle = surf;
    g.fillRect(XL, TOP, XR - XL, GOAL - TOP);
    // overhead lamp pools
    for (const [x, y, r] of [[120, 260, 180], [250, 470, 200]]) {
      const lp = g.createRadialGradient(x, y, 0, x, y, r);
      lp.addColorStop(0, 'rgba(255,255,255,0.55)');
      lp.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lp;
      g.fillRect(XL, TOP, XR - XL, GOAL - TOP);
    }
    // air holes
    g.fillStyle = 'rgba(40,90,150,0.22)';
    for (let y = TOP + 9; y < GOAL - 4; y += 13) {
      for (let x = XL + 9 + ((y / 13) % 2) * 6.5; x < XR - 4; x += 13) {
        g.beginPath();
        g.arc(x, y, 1.1, 0, TAU);
        g.fill();
      }
    }
    // markings
    const mid = (TOP + GOAL) / 2;
    g.fillStyle = 'rgba(230,40,60,0.55)';
    g.fillRect(XL, mid - 2, XR - XL, 4);
    g.strokeStyle = 'rgba(40,90,220,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(W / 2, mid, 46, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(230,40,60,0.6)';
    g.beginPath();
    g.arc(W / 2, mid, 5, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(40,90,220,0.5)';
    for (const [y, a0, a1] of [[GOAL, Math.PI, TAU], [TOP, 0, Math.PI]]) {
      g.beginPath();
      g.arc(W / 2, y, 78, a0, a1);
      g.stroke();
    }
    g.strokeStyle = 'rgba(40,90,220,0.3)';
    g.lineWidth = 2;
    for (const y of [mid - 120, mid + 120]) {
      g.beginPath();
      g.moveTo(XL, y);
      g.lineTo(XR, y);
      g.stroke();
    }
    // a glossy sheen across the surface
    const sh = g.createLinearGradient(XL, TOP, XR, GOAL);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.42, 'rgba(255,255,255,0)');
    sh.addColorStop(0.47, 'rgba(255,255,255,0.28)');
    sh.addColorStop(0.53, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(XL, TOP, XR - XL, GOAL - TOP);
    // the wide goal slot at your end
    const slot = g.createLinearGradient(0, GOAL, 0, GOAL + 14);
    slot.addColorStop(0, '#05030c');
    slot.addColorStop(1, '#1c1438');
    g.fillStyle = slot;
    g.fillRect(XL, GOAL, XR - XL, 14);
    g.fillStyle = 'rgba(255,60,80,0.5)';
    for (let x = XL + 10; x < XR; x += 20) g.fillRect(x, GOAL + 10, 8, 2);
    // the near rail and its chrome lip
    const nr = g.createLinearGradient(0, GOAL + 14, 0, GOAL + 26);
    nr.addColorStop(0, '#ffffff');
    nr.addColorStop(0.3, '#9aa6c8');
    nr.addColorStop(1, '#14286a');
    g.fillStyle = nr;
    g.fillRect(0, GOAL + 14, W, 12);
    // arcade carpet
    g.fillStyle = '#0d0820';
    g.fillRect(0, GOAL + 26, W, H - GOAL - 26);
    const cols = ['#ff4fd8', '#3df5ff', '#ffe14d', '#7cff6b'];
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, W);
      const y = rng.range(GOAL + 28, H);
      g.strokeStyle = cols[i % 4];
      g.lineWidth = 1.5;
      g.beginPath();
      if (i % 3 === 0) g.arc(x, y, 3, 0, TAU);
      else {
        g.moveTo(x - 5, y);
        g.quadraticCurveTo(x, y - 5, x + 5, y);
      }
      g.stroke();
    }
  });
}

function paintFarRail(W) {
  return makeSprite(W, 22, (g) => {
    g.translate(-W / 2, -11);
    const gr = g.createLinearGradient(0, 0, 0, 22);
    gr.addColorStop(0, '#5f7fe6');
    gr.addColorStop(0.25, '#2a4bb0');
    gr.addColorStop(1, '#0f1f55');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, 22);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(0, 1, W, 1.5);
    const ch = g.createLinearGradient(0, 16, 0, 22);
    ch.addColorStop(0, '#ffffff');
    ch.addColorStop(1, '#8a96b8');
    g.fillStyle = ch;
    g.fillRect(XL - 4, 16, XR - XL + 8, 6);
    for (const x of [10, W - 10]) {
      g.fillStyle = '#c8d2ee';
      g.beginPath();
      g.arc(x, 9, 2.6, 0, TAU);
      g.fill();
    }
  });
}

function makeOcto() {
  const shape = (g) => {
    g.beginPath();
    g.moveTo(-46, 30);
    g.bezierCurveTo(-52, 0, -44, -42, 0, -44);
    g.bezierCurveTo(44, -42, 52, 0, 46, 30);
    g.quadraticCurveTo(0, 40, -46, 30);
    g.closePath();
  };
  const body = makeSprite(110, 92, (g) => {
    shape(g);
    const gr = g.createRadialGradient(-14, -22, 4, 0, 0, 60);
    gr.addColorStop(0, '#f2a6ff');
    gr.addColorStop(0.35, '#c055e8');
    gr.addColorStop(0.8, '#8226b4');
    gr.addColorStop(1, '#5c1784');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#3e0d5c';
    g.lineWidth = 2.2;
    g.stroke();
    // spots
    const spots = [[-28, -20, 4], [-34, -4, 2.6], [24, -28, 3.4], [32, -12, 2.4], [-14, -34, 2.2], [36, 6, 3], [-38, 12, 2.4], [10, -38, 1.8]];
    for (const [x, y, r] of spots) {
      g.fillStyle = 'rgba(255,190,255,0.45)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(80,10,110,0.35)';
      g.lineWidth = 0.8;
      g.stroke();
    }
    // shine
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-18, -30, 11, 5, -0.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-30, -16, 4, 2.4, -0.9, 0, TAU);
    g.fill();
  });
  const flush = makeSprite(110, 92, (g) => {
    shape(g);
    g.fillStyle = 'rgba(255,40,40,0.75)';
    g.fill();
  });
  return { body, flush };
}

function makeMallet() {
  return makeSprite(56, 56, (g) => {
    g.beginPath();
    g.arc(0, 0, 25, 0, TAU);
    const rim = g.createRadialGradient(-6, -8, 4, 0, 0, 26);
    rim.addColorStop(0, '#9dffbf');
    rim.addColorStop(0.6, '#22c463');
    rim.addColorStop(1, '#0b6a33');
    g.fillStyle = rim;
    g.fill();
    g.strokeStyle = '#064222';
    g.lineWidth = 2;
    g.stroke();
    // inner bowl
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    const bowl = g.createRadialGradient(4, 5, 2, 0, 0, 17);
    bowl.addColorStop(0, '#53f08f');
    bowl.addColorStop(1, '#138a45');
    g.fillStyle = bowl;
    g.fill();
    g.strokeStyle = 'rgba(4,60,28,0.7)';
    g.lineWidth = 1.4;
    g.stroke();
    // knob
    g.beginPath();
    g.arc(0, 0, 9, 0, TAU);
    const knob = g.createRadialGradient(-3, -3, 1, 0, 0, 10);
    knob.addColorStop(0, '#ffffff');
    knob.addColorStop(0.4, '#c8ffd9');
    knob.addColorStop(1, '#2fbf68');
    g.fillStyle = knob;
    g.fill();
    g.strokeStyle = '#0b6a33';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(-10, -14, 7, 3, -0.6, 0, TAU);
    g.fill();
  });
}

function makePuck() {
  return makeSprite(24, 24, (g) => {
    g.beginPath();
    g.arc(0, 0, 10, 0, TAU);
    const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 11);
    gr.addColorStop(0, '#ff8a6e');
    gr.addColorStop(0.55, '#f0302a');
    gr.addColorStop(1, '#9a0f16');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#5c0610';
    g.lineWidth = 1.4;
    g.stroke();
    g.strokeStyle = 'rgba(255,240,230,0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, 5.5, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-4, -5, 3.4, 1.6, -0.6, 0, TAU);
    g.fill();
  });
}

function makeInk(seed) {
  return makeSprite(30, 30, (g) => {
    g.beginPath();
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU;
      const r = 11 + Math.sin(a * 3 + seed) * 1.6 + Math.cos(a * 2 + seed * 2) * 1.1;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    const gr = g.createRadialGradient(-3, -4, 1, 0, 0, 13);
    gr.addColorStop(0, '#5a3a7a');
    gr.addColorStop(0.5, '#22123a');
    gr.addColorStop(1, '#07030f');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(180,120,255,0.65)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(230,210,255,0.75)';
    g.beginPath();
    g.ellipse(-4, -5, 3.6, 1.8, -0.6, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(230,210,255,0.4)';
    g.beginPath();
    g.arc(4, 4, 1.4, 0, TAU);
    g.fill();
  });
}

function makeSplat() {
  return makeSprite(70, 70, (g) => {
    g.fillStyle = 'rgba(14,6,26,0.92)';
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * TAU;
      const r = k % 2 ? 16 : 26 + (k % 3) * 4;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    for (const [x, y, r] of [[-30, -10, 4], [28, 14, 3.5], [10, -31, 3], [-16, 28, 3.5], [31, -20, 2.5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(200,170,255,0.35)';
    g.beginPath();
    g.ellipse(-6, -8, 7, 3, -0.6, 0, TAU);
    g.fill();
  });
}

// ---------- music: Eurobeat, 156 BPM, E minor over Em–C–D–B ----------

const music = {
  cps: 156 / 240,
  setup: `
    const kick = note("e2*4").s("sine").decay(0.26).sustain(0).gain(0.8)
    const kick2 = note("e2 e2 e2 [e2 e2]").s("sine").decay(0.24).sustain(0).gain(0.8)
    const clap = s("~ white ~ white").decay(0.11).sustain(0).hpf(1500).lpf(5200).gain(0.075).room(0.3)
    const snare = s("~ pink ~ pink").decay(0.15).sustain(0).hpf(800).lpf(5500).gain(0.13)
    const open = s("[~ white]*4").decay(0.09).sustain(0).hpf(7000).gain(0.04)
    const hats = s("white*16").decay(0.02).sustain(0).hpf(7500).gain("[0.03 0.016]*8")
    const bass = note("<[e2 e3]*4 [c3 c4]*4 [d3 d4]*4 [b2 b3]*4>").s("sawtooth").decay(0.14).sustain(0.2).release(0.05)
      .lpf(saw.range(500, 2200).slow(39)).lpq(4).gain(0.3)
    const chords = "<[e4,g4,b4] [e4,g4,c5] [f#4,a4,d5] [d#4,f#4,b4]>"
    const stabs = note(chords).struct("[~ x]*4").s("sawtooth").decay(0.12).sustain(0).lpf(saw.range(1200, 3200).slow(39)).gain(0.06).pan(0.6)
    const riff = note("<[e5 b4 g4 b4 e5 b4 g5 f#5 e5 b4 g4 b4 d5 c5 b4 a4] [e5 c5 g4 c5 e5 c5 g5 f#5 e5 c5 g4 c5 d5 e5 f#5 g5] [f#5 d5 a4 d5 f#5 d5 a5 g5 f#5 d5 a4 d5 e5 f#5 g5 a5] [f#5 d#5 b4 d#5 f#5 d#5 b5 a5 f#5 d#5 b4 d#5 a5 g5 f#5 d#5]>")
      .s("square").decay(0.09).sustain(0).lpf(3000).gain(0.05).delay(0.2).delaytime(0.288).delayfeedback(0.3).pan(0.4)
    const tune = "<[b5@2 a5 g5 f#5@2 e5 f#5] [g5@3 e5 c5@2 e5 g5] [a5@3 f#5 d5@2 e5 f#5] [d#5@4 f#5 a5 b5@2]>"
    const lead = note(tune).s("sawtooth").attack(0.01).decay(0.2).sustain(0.5).release(0.1).lpf(2600).vib(5).vibmod(0.1)
      .gain(0.065).delay(0.22).delaytime(0.288).delayfeedback(0.28).pan(0.55)
    const leadLow = note(tune).add(note(-12)).s("square").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1500).gain(0.05)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1000).gain(0.04).room(0.6)
    const arp = note("<[e6 b5 g5 e5]*4 [e6 c6 g5 e5]*4 [f#6 d6 a5 f#5]*4 [f#6 d#6 b5 f#5]*4>")
      .s("triangle").decay(0.06).sustain(0).lpf(4200).gain(0.032).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(11)).gain(saw.range(0, 0.05).slow(11))
  `,
  song: `arrange(
    [8, stack(kick, clap, open, bass, stabs, riff)],
    [10, stack(kick, clap, snare, open, bass, stabs, riff, lead, pad)],
    [10, stack(kick, clap, snare, open, hats, bass, stabs, riff, lead, pad, arp)],
    [11, stack(kick2, clap, snare, open, hats, bass, stabs, riff, lead, leadLow, pad, arp, wash)]
  )`,
};

export default {
  id: 'octohockey',
  title: 'Octo Hockey',
  emoji: '🐙',
  tagline: 'Block every puck the octopus shoots. Never touch its ink.',
  colors: { bg: '#170e33', fg: '#ffffff', accent: '#2ed573' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- the whole match, planned up front ----
    const pucks = [];
    {
      let ta = 3.0;
      let tx = W / 2 + (plan.chance(0.5) ? -1 : 1) * plan.range(55, 85);
      while (ta < 62) {
        pucks.push({ ta, tx });
        const p = progress(ta, 60, 1.35);
        const gap = lerp(1.35, 0.6, p) * plan.range(0.88, 1.12);
        const reach = MS * Math.max(0, gap - 0.14) * lerp(0.55, 0.82, p);
        const minD = Math.min(reach * 0.8, lerp(45, 80, p));
        const d = plan.range(minD, Math.max(minD, reach));
        const dir = plan.chance(0.5) ? -1 : 1;
        let nx = tx + dir * d;
        if (nx < XMIN || nx > XMAX) nx = tx - dir * d;
        tx = clamp(nx, XMIN, XMAX);
        ta += gap;
      }
    }
    const shots = [];
    const addShot = (kind, ta, tx, early) => {
      const p = progress(ta, 60, 1.35);
      let T = lerp(1.3, 0.74, p) * plan.range(0.92, 1.08);
      const r = plan.next();
      const r2 = plan.next();
      let b = 0;
      if (!early && kind === 'puck') {
        if (r < lerp(0.3, 0.5, p)) b = 1;
        else if (ta > 24 && r > 1 - lerp(0, 0.3, p)) b = 2;
      }
      if (b === 2) T *= 1.18;
      // ink is lobbed fairly straight, so you can read where it lands
      const x0 = kind === 'ink' ? clamp(tx + (r2 - 0.5) * 120, A + 24, C - 24) : plan.range(A + 24, C - 24);
      let U = tx;
      if (b === 1) {
        const c1 = 2 * C - tx;
        const c2 = 2 * A - tx;
        const near = Math.abs(c1 - x0) < Math.abs(c2 - x0) ? c1 : c2;
        U = r2 < 0.7 ? near : near === c1 ? c2 : c1;
      } else if (b === 2) {
        U = Math.abs(tx + 2 * L - x0) < Math.abs(tx - 2 * L - x0) ? tx + 2 * L : tx - 2 * L;
      }
      const tl = ta - T;
      const wind = lerp(0.62, 0.44, p);
      shots.push({ kind, ta, tx, T, b, x0, U, tl, tw: tl - wind, vx: (U - x0) / T, vy: (MY - SY) / T });
    };
    pucks.forEach((pk, i) => addShot('puck', pk.ta, pk.tx, i < 4));
    // ink: aimed where you just blocked, or where you're about to go
    for (let k = 0; k + 1 < pucks.length; k++) {
      const a = pucks[k];
      const b = pucks[k + 1];
      const p = progress(a.ta, 60, 1.35);
      const q = plan.next();
      const mode = plan.next();
      if (a.ta < 12 || q > lerp(0.25, 0.5, p)) continue;
      const gap = b.ta - a.ta;
      const dist = Math.abs(b.tx - a.tx);
      let ink = null;
      if (mode < 0.5 && dist >= 80 && gap >= 0.62) ink = { ta: a.ta + clamp(gap * 0.45, 0.3, 0.5), tx: a.tx, ref: k };
      else if (dist >= 90 && gap >= 0.86) ink = { ta: b.ta - clamp(gap * 0.5, 0.42, 0.6), tx: b.tx, ref: k + 1 };
      if (!ink) continue;
      const clash = pucks.some((o, j) => j !== ink.ref && Math.abs(o.ta - ink.ta) < 0.4 && Math.abs(o.tx - ink.tx) < 80) ||
        shots.some((o) => o.kind === 'ink' && Math.abs(o.ta - ink.ta) < 0.8);
      if (!clash) addShot('ink', ink.ta, ink.tx, false);
    }
    shots.sort((s1, s2) => s1.tw - s2.tw);

    // ---- art ----
    const scene = paintScene(W, H, art);
    const farRail = paintFarRail(W);
    const octo = makeOcto();
    const malletSpr = makeMallet();
    const puckSpr = makePuck();
    const inkSpr = [makeInk(0.3), makeInk(2.1)];
    const splatSpr = makeSplat();
    const glowGreen = glowSprite('rgba(80,255,150,0.75)', 40);
    const glowRed = glowSprite('rgba(255,70,60,0.8)', 24);
    const glowViolet = glowSprite('rgba(170,90,255,0.7)', 24);
    const glowWhite = glowSprite('rgba(255,255,255,0.9)', 30);
    const glowBulb = glowSprite('rgba(255,220,120,0.9)', 10);
    const vignette = vignetteSprite(W, H, 0.5, '20,8,50');

    const fx = createParticles();
    const sparks = createParticles();
    const rings = [];
    const drips = [];

    // ---- state ----
    const mover = createMover({ x: W / 2, minX: XL + MR, maxX: XR - MR, speed: MS, accel: 24 });
    const live = [];
    let nextShot = 0;
    let now = 0;
    let clock = 0;
    let saves = 0;
    let shake = 0;
    let squash = 0;
    let angry = 0;
    let blink = 2;
    let goalFlash = 0;
    let deathKind = '';
    let deathX = W / 2;
    let malletVx = 0;

    const posOf = (o, at) => {
      const s = at - o.shot.tl;
      const u = o.shot.x0 + o.shot.vx * s;
      return { x: fold(u), y: SY + o.shot.vy * s, u };
    };

    const baseOf = (x0) => lerp(128, 232, (x0 - A) / L);

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      squash = Math.max(0, squash - dt * 4);
      angry = Math.max(0, angry - dt);
      goalFlash = Math.max(0, goalFlash - dt * 0.8);
      blink -= dt;
      if (blink < -0.12) blink = 1.5 + Math.random() * 2.5;
      fx.update(dt);
      sparks.update(dt);
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].age += dt;
        if (rings[i].age > rings[i].max) rings.splice(i, 1);
      }
      for (let i = drips.length - 1; i >= 0; i--) {
        drips[i].age += dt;
        if (drips[i].age > 1.4) drips.splice(i, 1);
      }
    };

    // moves every shot along; `play` = collisions count
    const stepShots = (dt, play, game) => {
      while (nextShot < shots.length && shots[nextShot].tw <= now) {
        const sh = shots[nextShot++];
        live.push({ shot: sh, state: 'wind', x: sh.x0, y: SY, vx: 0, vy: 0, seg: segOf(sh.x0), trail: [] });
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const o = live[i];
        const sh = o.shot;
        if (o.state === 'wind') {
          if (now >= sh.tl) {
            o.state = 'fly';
            sparks.burst(sh.x0, SY, { count: 8, speed: 120, life: 0.3, size: 2.5, angle: Math.atan2(-sh.vy, -sh.vx), spread: 1.4, colors: sh.kind === 'ink' ? ['#b48cff', '#6a3fb0'] : ['#ffffff', '#ffd0c0'] });
          }
          continue;
        }
        if (o.state === 'fly') {
          const ps = posOf(o, now);
          o.x = ps.x;
          o.y = ps.y;
          const seg = segOf(ps.u);
          if (seg !== o.seg) {
            o.seg = seg;
            const wx = Math.abs(o.x - A) < Math.abs(o.x - C) ? XL : XR;
            sparks.burst(wx, o.y, { count: 10, speed: 140, life: 0.35, size: 2.5, angle: wx === XL ? 0 : Math.PI, spread: 2, colors: ['#ffffff', '#bfe6ff', '#ffe14d'] });
            rings.push({ x: wx, y: o.y, age: 0, max: 0.3, r0: 4, r1: 22, col: '255,255,255' });
          }
          if (sh.kind === 'ink' && Math.random() < 0.5) drips.push({ x: o.x + (Math.random() - 0.5) * 8, y: o.y + (Math.random() - 0.5) * 8, age: 0, r: 1.5 + Math.random() * 2.5 });
          o.trail.push(o.x, o.y);
          if (o.trail.length > 12) o.trail.splice(0, 2);
          const rad = sh.kind === 'ink' ? IR : PR;
          if (play && !game.dead && o.y > MY - 40 && o.y < MY + 24) {
            const dx = o.x - mover.x;
            const dy = o.y - MY;
            if (dx * dx + dy * dy < (rad + MR) * (rad + MR)) {
              if (sh.kind === 'ink') {
                game.dead = true;
                game.deathReason = "You touched the octopus's ink.";
                deathKind = 'ink';
                deathX = mover.x;
                fx.burst(mover.x, MY, { count: 40, speed: 220, life: 0.9, size: 5, round: true, drag: 2, colors: ['#1a0d2e', '#2e1850', '#07030f', '#5a3a7a'] });
                live.splice(i, 1);
                shake = 0.4;
                continue;
              }
              // save!
              saves++;
              o.state = 'back';
              o.vx = clamp((dx / (PR + MR)) * 380 + mover.vx * 0.35, -420, 420);
              o.vy = -600;
              o.trail.length = 0;
              squash = 1;
              angry = 0.7;
              shake = Math.max(shake, 0.12);
              const cx = mover.x + dx * 0.6;
              const cy = MY + dy * 0.6;
              sparks.burst(cx, cy, { count: 18, speed: 240, life: 0.4, size: 3, angle: -Math.PI / 2, spread: 2.4, colors: ['#ffffff', '#fff3a0', '#9dffbf'] });
              rings.push({ x: cx, y: cy, age: 0, max: 0.35, r0: 8, r1: 40, col: '160,255,190' });
              continue;
            }
          }
          if (o.y > GOAL) {
            if (sh.kind === 'ink') {
              fx.burst(o.x, GOAL + 4, { count: 16, speed: 120, life: 0.6, size: 4, round: true, angle: -Math.PI / 2, spread: 1.8, drag: 2, colors: ['#1a0d2e', '#3b2163', '#07030f'] });
            } else {
              sparks.burst(o.x, GOAL + 4, { count: 30, speed: 260, life: 0.7, size: 3.5, angle: -Math.PI / 2, spread: 2.2, colors: ['#ff4a3d', '#ffffff', '#ffe14d'] });
              if (play && !game.dead) {
                game.dead = true;
                game.deathReason = 'A puck got past you into your goal.';
                deathKind = 'goal';
                deathX = o.x;
                goalFlash = 1;
                shake = 0.5;
              }
            }
            live.splice(i, 1);
          }
          continue;
        }
        if (o.state === 'back') {
          o.x += o.vx * dt;
          o.y += o.vy * dt;
          if (o.x < A) {
            o.x = 2 * A - o.x;
            o.vx = -o.vx;
          } else if (o.x > C) {
            o.x = 2 * C - o.x;
            o.vx = -o.vx;
          }
          o.trail.push(o.x, o.y);
          if (o.trail.length > 12) o.trail.splice(0, 2);
          if (o.y < TOP + 34) {
            fx.burst(o.x, o.y, { count: 12, speed: 90, life: 0.5, size: 3, round: true, drag: 2, colors: ['#e9c6ff', '#c055e8', '#ffffff'] });
            live.splice(i, 1);
          }
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { shots, mover },

      update(dt, dir, t) {
        now = t + dt;
        updateCosmetic(dt);
        const before = mover.x;
        mover.update(dt, dir);
        malletVx = (mover.x - before) / dt;
        stepShots(dt, true, this);
      },

      afterlife(dt) {
        now += dt * 0.5;
        updateCosmetic(dt);
        stepShots(dt * 0.5, false, this);
        if (deathKind === 'goal' && Math.random() < 0.3) {
          fx.burst(Math.random() * W, 130 + Math.random() * 40, { count: 3, speed: 120, life: 1, size: 4, gravity: 200, colors: ['#ff4fd8', '#3df5ff', '#ffe14d', '#7cff6b'] });
        }
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.fillStyle = '#0d0820';
        g.fillRect(-8, -8, W + 16, H + 16);
        g.drawImage(scene.canvas, 0, 0, W, H);

        // saves on the scoreboard
        g.font = `800 20px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#ff5a78';
        g.fillText(String(saves).padStart(3, '0'), 60, 58);

        // marquee bulbs chasing along the wall
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 18; i++) {
          const x = 10 + i * 20;
          const on = (Math.floor(clock * 6) + i) % 3 === 0;
          drawSprite(g, glowBulb, x, 92, { size: on ? 18 : 10, alpha: on ? 0.95 : 0.35 });
        }
        g.globalCompositeOperation = 'source-over';

        // the octopus peeking over the far rail
        const cheer = deathKind === 'goal';
        const bob = Math.sin(clock * 2.2) * 2 + (cheer ? Math.abs(Math.sin(clock * 9)) * -6 : 0);
        const ox = W / 2;
        const oy = 74 + bob;
        drawSprite(g, octo.body, ox, oy);
        if (angry > 0) drawSprite(g, octo.flush, ox, oy, { alpha: Math.min(1, angry * 1.6) * 0.6 });
        // eyes follow the most urgent puck
        let look = null;
        let best = 1e9;
        for (const o of live) {
          if (o.state === 'back') continue;
          const left = o.shot.ta - now;
          if (left < best) {
            best = left;
            look = o;
          }
        }
        for (const ex of [ox - 16, ox + 16]) {
          const ey = oy + 6;
          if (cheer) {
            g.strokeStyle = '#2a0640';
            g.lineWidth = 2.6;
            g.beginPath();
            g.arc(ex, ey + 3, 7, Math.PI * 1.15, Math.PI * 1.85);
            g.stroke();
            continue;
          }
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.ellipse(ex, ey, 9, blink < 0 ? 1.5 : 10, 0, 0, TAU);
          g.fill();
          g.strokeStyle = '#3e0d5c';
          g.lineWidth = 1.5;
          g.stroke();
          if (blink >= 0) {
            let px = 0;
            let py = 3;
            if (look) {
              const dx = look.x - ex;
              const dy = look.y - ey;
              const d = Math.hypot(dx, dy) || 1;
              px = (dx / d) * 4;
              py = (dy / d) * 4.5;
            }
            g.fillStyle = '#1a0628';
            g.beginPath();
            g.ellipse(ex + px, ey + py, 4.2, 5, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#ffffff';
            g.beginPath();
            g.arc(ex + px - 1.4, ey + py - 2, 1.4, 0, TAU);
            g.fill();
          }
          // brows: smug, or furious after a save
          const tilt = angry > 0 ? 0.5 : -0.15;
          const side = ex < ox ? 1 : -1;
          g.strokeStyle = '#3e0d5c';
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(ex - 8 * side, ey - 13 - tilt * 6);
          g.lineTo(ex + 6 * side, ey - 13 + tilt * 6);
          g.stroke();
        }

        // mouth: a smirk, a scowl after a save, a big grin when it scores
        g.strokeStyle = '#3e0d5c';
        g.lineWidth = 2.4;
        g.lineCap = 'round';
        g.beginPath();
        if (cheer) {
          g.fillStyle = '#5a0f3a';
          g.ellipse(ox, oy + 21, 9, 6, 0, 0, Math.PI);
          g.fill();
          g.stroke();
        } else if (angry > 0) {
          g.moveTo(ox - 7, oy + 24);
          g.quadraticCurveTo(ox, oy + 18, ox + 7, oy + 24);
          g.stroke();
        } else {
          g.moveTo(ox - 8, oy + 20);
          g.quadraticCurveTo(ox + 1, oy + 26, ox + 9, oy + 18);
          g.stroke();
        }
        g.drawImage(farRail.canvas, 0, 100, W, 22);

        // ink drips left on the table
        for (const d of drips) {
          g.globalAlpha = Math.max(0, 1 - d.age / 1.4) * 0.6;
          g.fillStyle = '#1a0d2e';
          g.beginPath();
          g.arc(d.x, d.y, d.r, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;

        // tentacles: two lazing on the rail, plus one for every shot being set up
        const tentacle = (bx, by, tx, ty, bend, w0) => {
          const cx = bx + (tx - bx) * 0.25 + bend;
          const cy = (by + ty) / 2 + 6;
          const N = 9;
          const pts = [];
          for (let k = 0; k <= N; k++) {
            const u = k / N;
            const m = 1 - u;
            pts.push([m * m * bx + 2 * m * u * cx + u * u * tx, m * m * by + 2 * m * u * cy + u * u * ty]);
          }
          g.lineCap = 'round';
          for (const pass of [0, 1]) {
            g.strokeStyle = pass ? '#b04ee0' : '#4a1170';
            for (let k = 0; k < N; k++) {
              g.lineWidth = lerp(w0, 4, k / N) + (pass ? 0 : 3);
              g.beginPath();
              g.moveTo(pts[k][0], pts[k][1]);
              g.lineTo(pts[k + 1][0], pts[k + 1][1]);
              g.stroke();
            }
          }
          g.fillStyle = '#f6d2ff';
          for (let k = 2; k < N; k += 2) {
            const [x0, y0] = pts[k];
            const [x1, y1] = pts[k + 1];
            const nx = -(y1 - y0);
            const ny = x1 - x0;
            const nd = Math.hypot(nx, ny) || 1;
            const off = lerp(w0, 4, k / N) * 0.3;
            g.beginPath();
            g.arc(x0 + (nx / nd) * off, y0 + (ny / nd) * off, lerp(2.2, 1, k / N), 0, TAU);
            g.fill();
          }
        };
        const wave = cheer ? 30 : 6;
        tentacle(118, 108, 92 + Math.sin(clock * 1.7) * wave * 0.5, 138 - (cheer ? 30 + Math.sin(clock * 8) * 10 : 0), -12, 12);
        tentacle(242, 108, 268 + Math.sin(clock * 1.5 + 1) * wave * 0.5, 140 - (cheer ? 30 + Math.cos(clock * 8) * 10 : 0), 12, 12);

        for (const o of live) {
          const sh = o.shot;
          const bx = baseOf(sh.x0);
          const rest = [bx, 132];
          const n = Math.hypot(sh.vx, sh.vy);
          const nx = sh.vx / n;
          const ny = sh.vy / n;
          if (o.state === 'wind') {
            const k = clamp((now - sh.tw) / (sh.tl - sh.tw), 0, 1);
            let tipX;
            let tipY;
            let px = sh.x0;
            let py = SY;
            if (k < 0.35) {
              const u = k / 0.35;
              const e = 1 - (1 - u) * (1 - u);
              px = lerp(rest[0], sh.x0, e);
              py = lerp(rest[1] - 6, SY, e);
              tipX = px - nx * (PR + 4);
              tipY = py - ny * (PR + 4);
            } else {
              const u = (k - 0.35) / 0.65;
              const back = PR + 6 + 18 * Math.sin(u * Math.PI * 0.5);
              tipX = sh.x0 - nx * back;
              tipY = SY - ny * back;
            }
            tentacle(bx, 110, tipX, tipY, (sh.x0 - bx) * 0.15, 13);
            // the aim: a dotted line along the first part of the shot
            if (k >= 0.35) {
              const u = (k - 0.35) / 0.65;
              const len = 150;
              const steps = 12;
              const isInk = sh.kind === 'ink';
              for (let j = 1; j <= steps; j++) {
                const s = ((j / steps) * len) / n;
                const ax = fold(sh.x0 + sh.vx * s);
                const ay = SY + sh.vy * s;
                g.fillStyle = isInk ? `rgba(110,50,190,${(0.75 * (1 - j / (steps + 2)) * Math.min(1, u * 2.5)).toFixed(3)})` : `rgba(230,40,50,${(0.75 * (1 - j / (steps + 2)) * Math.min(1, u * 2.5)).toFixed(3)})`;
                g.beginPath();
                g.arc(ax, ay, 2.4, 0, TAU);
                g.fill();
              }
              const pulse = 0.5 + 0.5 * Math.sin(clock * 20);
              g.strokeStyle = isInk ? `rgba(140,70,230,${(0.4 + 0.5 * pulse).toFixed(3)})` : `rgba(255,60,60,${(0.4 + 0.5 * pulse).toFixed(3)})`;
              g.lineWidth = 2;
              g.beginPath();
              g.arc(sh.x0, SY, PR + 6 + 4 * (1 - u), 0, TAU);
              g.stroke();
            }
            if (sh.kind === 'ink') drawSprite(g, inkSpr[sh.x0 > 180 ? 1 : 0], px, py, { size: 30 * (0.4 + 0.6 * Math.min(1, k * 2)), rot: clock * 2 });
            else drawSprite(g, puckSpr, px, py, { size: 24 });
          } else if (o.state === 'fly') {
            const s = now - sh.tl;
            if (s < 0.32) {
              const u = s / 0.32;
              tentacle(bx, 110, lerp(sh.x0 + nx * 6, rest[0], u * u), lerp(SY + ny * 6, rest[1], u * u), (sh.x0 - bx) * 0.15 * (1 - u), 13);
            }
          }
        }

        // pucks and ink in play: shadow, streak, body
        for (const o of live) {
          if (o.state === 'wind') continue;
          const isInk = o.shot.kind === 'ink';
          const tr = o.trail;
          for (let j = 0; j + 1 < tr.length; j += 2) {
            const k = (j + 2) / tr.length;
            g.fillStyle = isInk ? `rgba(40,16,70,${(0.25 * k).toFixed(3)})` : o.state === 'back' ? `rgba(120,255,170,${(0.3 * k).toFixed(3)})` : `rgba(255,70,60,${(0.3 * k).toFixed(3)})`;
            g.beginPath();
            g.arc(tr[j], tr[j + 1], (isInk ? IR : PR) * (0.4 + 0.6 * k), 0, TAU);
            g.fill();
          }
          g.fillStyle = 'rgba(20,40,80,0.22)';
          g.beginPath();
          g.ellipse(o.x + 2, o.y + 3, 10, 9, 0, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, isInk ? glowViolet : glowRed, o.x, o.y, { size: 46, alpha: 0.5 });
          g.globalCompositeOperation = 'source-over';
          if (isInk) drawSprite(g, inkSpr[o.shot.x0 > 180 ? 1 : 0], o.x, o.y, { size: 30, rot: clock * 3 });
          else drawSprite(g, puckSpr, o.x, o.y, { size: 24, rot: clock * 4 });
        }

        // your mallet
        {
          const mx = mover.x;
          g.fillStyle = 'rgba(20,40,80,0.28)';
          g.beginPath();
          g.ellipse(mx + 3, MY + 5, 26, 24, 0, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowGreen, mx, MY, { size: 92 + squash * 20, alpha: 0.45 + squash * 0.4 });
          g.globalCompositeOperation = 'source-over';
          const sq = 1 + squash * 0.12;
          g.save();
          g.translate(mx, MY);
          g.scale(sq, 2 - sq);
          g.drawImage(malletSpr.canvas, -28, -28, 56, 56);
          g.restore();
          if (deathKind === 'ink') drawSprite(g, splatSpr, deathX, MY, { size: 72 });
          // a hint of the mallet's motion
          if (Math.abs(malletVx) > 120 && !this.dead) {
            g.fillStyle = 'rgba(80,255,150,0.18)';
            g.beginPath();
            g.ellipse(mx - Math.sign(malletVx) * 18, MY, 22, 20, 0, 0, TAU);
            g.fill();
          }
        }

        // rings and sparks
        for (const r of rings) {
          const k = r.age / r.max;
          g.strokeStyle = `rgba(${r.col},${(1 - k).toFixed(3)})`;
          g.lineWidth = 3 * (1 - k) + 1;
          g.beginPath();
          g.arc(r.x, r.y, lerp(r.r0, r.r1, k), 0, TAU);
          g.stroke();
        }
        fx.render(g);
        sparks.render(g, true);

        // goal!
        if (goalFlash > 0) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowWhite, deathX, GOAL + 6, { size: 160, alpha: goalFlash });
          g.fillStyle = `rgba(255,40,60,${(goalFlash * 0.35).toFixed(3)})`;
          g.fillRect(0, GOAL - 30, W, 60);
          g.globalCompositeOperation = 'source-over';
          g.font = `900 34px ${BODY_FONT}`;
          g.fillStyle = `rgba(255,255,255,${Math.min(1, goalFlash * 1.5).toFixed(3)})`;
          g.strokeStyle = `rgba(160,0,30,${Math.min(1, goalFlash * 1.5).toFixed(3)})`;
          g.lineWidth = 5;
          g.strokeText('GOAL!', W / 2, 420);
          g.fillText('GOAL!', W / 2, 420);
        }
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };
    return game;
  },
};
