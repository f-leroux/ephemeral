// Hickory Dock — a little clockwork mouse runs up the inside of an old clock tower at night. It can't
// climb: it hooks its tail round brass pegs and swings. Hold ← or → and it whirls round the peg it's
// holding (anticlockwise or clockwise); let go and it flies off along the tangent, arcing under
// gravity, and its tail grabs the first peg it passes close enough to. So every hop is a release
// timed to the right moment of the spin. A dotted line shows where letting go right now would send
// you, turning green when it ends on a peg. The tower's gears keep grinding upwards from below, so
// you have to keep climbing. Spinning steel cogs and swinging pendulums fill the shaft, some pegs
// slide on rails, and rusty pegs snap if you hang on them too long. Fall into the gears, or touch a
// cog or a pendulum, and the run is over.

import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const R = 56; // the tail's reach: radius of the whirl round a peg
const MR = 11; // the mouse's collision radius
const GRAV = 420;
const SPIN = 5; // rad/s while a key is held
const WALL = 16;
const PX0 = WALL + MR + R + 2; // pegs stay far enough from the walls to whirl freely
const FLOOR_Y = 604; // top of the grinding gears, on screen
const START_X = 180;
const START_Y = 286;
const FOLLOW_Y = 290; // the view climbs with you above this line
const BOB = 15; // pendulum bob radius
const NET_T = 2.6; // a safety net covers the gears for the first moments

const diffAt = (h) => clamp(h / 6200, 0, 1);
const baseScroll = (t) => lerp(8, 44, progress(t, 60, 1.3));

// ---------- the shared flight model (used by the game, the preview and the level planner) ----------

function stepFlight(p, dt, W) {
  p.vy += GRAV * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.x < WALL + MR) {
    p.x = WALL + MR;
    p.vx = Math.abs(p.vx) * 0.55;
  } else if (p.x > W - WALL - MR) {
    p.x = W - WALL - MR;
    p.vx = -Math.abs(p.vx) * 0.55;
  }
}

const hitCog = (x, y, cogs) => {
  for (const c of cogs) {
    const r = c.r * 0.86 + MR;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy < r * r) return c;
  }
  return null;
};

// ---------- art ----------

const INK = '#22121f';

function brassGrad(g, r, light = '#fff0b8', mid = '#e0a83e', dark = '#7a4a12') {
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  gr.addColorStop(0, light);
  gr.addColorStop(0.45, mid);
  gr.addColorStop(1, dark);
  return gr;
}

function gearPath(g, r, teeth, depth, hole = 0) {
  g.beginPath();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = i % 4;
    const rr = k === 0 || k === 1 ? r : r - depth;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  if (hole) {
    g.moveTo(hole, 0);
    g.arc(0, 0, hole, 0, TAU, true);
  }
}

function makeMouse(mood) {
  return makeSprite(48, 36, (g) => {
    // wind-up key on its back
    g.fillStyle = '#7a4a12';
    g.fillRect(-7.5, -16, 3, 7);
    g.lineWidth = 2.2;
    g.strokeStyle = '#8a5a18';
    g.fillStyle = brassGrad(g, 5);
    for (const kx of [-10.5, -1.5]) {
      g.beginPath();
      g.ellipse(kx, -18, 4.2, 3, 0, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(40,20,10,0.55)';
      g.beginPath();
      g.ellipse(kx, -18, 1.6, 1, 0, 0, TAU);
      g.fill();
      g.fillStyle = brassGrad(g, 5);
    }
    // feet
    g.fillStyle = '#ff9ab6';
    for (const [fx, fy] of [[-9, 11], [5, 11]]) {
      g.beginPath();
      g.ellipse(fx, fy, 4, 2.4, 0, 0, TAU);
      g.fill();
    }
    // body
    const body = g.createRadialGradient(-4, -6, 2, -2, 1, 18);
    body.addColorStop(0, '#eceaf3');
    body.addColorStop(0.5, '#b2adc2');
    body.addColorStop(1, '#6f6884');
    g.fillStyle = body;
    g.strokeStyle = '#3a3248';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(-3, 1, 15.5, 10.5, 0, 0, TAU);
    g.fill();
    g.stroke();
    // belly
    g.fillStyle = 'rgba(255,248,252,0.75)';
    g.beginPath();
    g.ellipse(-2, 6, 10, 3.6, 0, 0, TAU);
    g.fill();
    // head
    const head = g.createRadialGradient(10, -5, 1, 11, -1, 12);
    head.addColorStop(0, '#f2f0f7');
    head.addColorStop(0.6, '#b9b4c8');
    head.addColorStop(1, '#78718c');
    g.fillStyle = head;
    g.beginPath();
    g.moveTo(3, -8);
    g.quadraticCurveTo(17, -10, 22, 1);
    g.quadraticCurveTo(15, 8.5, 3, 7.5);
    g.closePath();
    g.fill();
    g.stroke();
    // ear
    g.fillStyle = '#b6b0c6';
    g.beginPath();
    g.arc(6, -10, 6.5, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffadc4';
    g.beginPath();
    g.arc(6.4, -10, 4, 0, TAU);
    g.fill();
    // eye
    if (mood === 'ouch') {
      g.strokeStyle = '#1a1020';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(11, -5);
      g.lineTo(15, -1);
      g.moveTo(15, -5);
      g.lineTo(11, -1);
      g.stroke();
    } else {
      g.fillStyle = '#140c18';
      g.beginPath();
      g.ellipse(13.5, -2.6, 2.4, 2.9, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(14.3, -3.6, 0.95, 0, TAU);
      g.fill();
    }
    // nose and cheek
    g.fillStyle = '#ff6f98';
    g.beginPath();
    g.arc(22, 1, 2.3, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,140,170,0.5)';
    g.beginPath();
    g.ellipse(14, 3.5, 2.8, 1.6, 0, 0, TAU);
    g.fill();
    // whiskers
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 0.7;
    for (const [ex, ey] of [[29, -3], [30, 2], [28, 6]]) {
      g.beginPath();
      g.moveTo(19, 2);
      g.lineTo(ex, ey);
      g.stroke();
    }
    // gloss
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-7, -6, 6, 2.2, -0.2, 0, TAU);
    g.fill();
  });
}

function makePeg(rusty) {
  return makeSprite(34, 34, (g) => {
    // little bracket plate behind the knob
    g.fillStyle = rusty ? '#3d2214' : '#3a2410';
    g.beginPath();
    g.roundRect(-14, -5, 28, 10, 4);
    g.fill();
    g.fillStyle = rusty ? '#6b3a1c' : '#6a4518';
    for (const bx of [-10, 10]) {
      g.beginPath();
      g.arc(bx, 0, 1.8, 0, TAU);
      g.fill();
    }
    // the knob
    g.fillStyle = rusty ? '#2a160c' : '#3d2508';
    g.beginPath();
    g.arc(0, 0, 11.5, 0, TAU);
    g.fill();
    g.fillStyle = rusty ? brassGrad(g, 10, '#f0b58a', '#a8582a', '#4a2010') : brassGrad(g, 10);
    g.beginPath();
    g.arc(0, 0, 10, 0, TAU);
    g.fill();
    // groove ring
    g.strokeStyle = rusty ? 'rgba(60,20,8,0.6)' : 'rgba(110,60,10,0.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, 6.5, 0, TAU);
    g.stroke();
    if (rusty) {
      // rust blotches
      for (const [x, y, r] of [[-4, 3, 2.6], [3, -4, 2], [5, 4, 1.6], [-2, -6, 1.3]]) {
        g.fillStyle = 'rgba(120,45,15,0.7)';
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    }
    // highlight
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-3.5, -4.5, 3.5, 2, -0.5, 0, TAU);
    g.fill();
  });
}

function makeCog() {
  const r = 26;
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    gearPath(g, r, 10, 6);
    const gr = g.createRadialGradient(-8, -9, 2, 0, 0, r);
    gr.addColorStop(0, '#b8c4d2');
    gr.addColorStop(0.5, '#5d6a7c');
    gr.addColorStop(1, '#232934');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#ff4b5c';
    g.lineWidth = 1.8;
    g.stroke();
    // hot teeth edge
    g.strokeStyle = 'rgba(255,140,120,0.5)';
    g.lineWidth = 0.8;
    g.stroke();
    // web with holes
    g.fillStyle = 'rgba(15,10,20,0.65)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.beginPath();
      g.arc(Math.cos(a) * 11, Math.sin(a) * 11, 3.6, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, r - 9, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
    // hub
    g.fillStyle = '#1b1f27';
    g.beginPath();
    g.arc(0, 0, 6.5, 0, TAU);
    g.fill();
    g.fillStyle = '#ff3d55';
    g.beginPath();
    g.arc(0, 0, 3.4, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,220,220,0.8)';
    g.beginPath();
    g.arc(-1, -1, 1.1, 0, TAU);
    g.fill();
  });
}

function makeBob() {
  return makeSprite(42, 42, (g) => {
    g.fillStyle = '#2a1608';
    g.beginPath();
    g.arc(0, 0, 17.5, 0, TAU);
    g.fill();
    g.fillStyle = brassGrad(g, 16, '#fff6cf', '#e8b347', '#6e3f0c');
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    g.fill();
    // crimson enamel ring: marks it as dangerous
    g.strokeStyle = '#d91f3d';
    g.lineWidth = 3.2;
    g.beginPath();
    g.arc(0, 0, 11, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,170,170,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 11, Math.PI * 1.1, Math.PI * 1.5);
    g.stroke();
    // engraved sun
    g.strokeStyle = 'rgba(120,70,10,0.7)';
    g.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      g.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      g.stroke();
    }
    g.fillStyle = brassGrad(g, 3.5);
    g.beginPath();
    g.arc(0, 0, 3.2, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-6, -8, 5, 2.4, -0.6, 0, TAU);
    g.fill();
  });
}

function makeDecoGear(r, teeth, spokes, tone) {
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    gearPath(g, r, teeth, Math.max(5, r * 0.12));
    g.fillStyle = tone;
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * TAU + 0.22;
      const a1 = ((i + 1) / spokes) * TAU - 0.22;
      g.beginPath();
      g.arc(0, 0, r * 0.72, a0, a1);
      g.arc(0, 0, r * 0.3, a1, a0, true);
      g.closePath();
      g.fill();
    }
    g.beginPath();
    g.arc(0, 0, r * 0.09, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(255,210,150,0.10)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r * 0.82, Math.PI * 1.05, Math.PI * 1.55);
    g.stroke();
  }, 1.5);
}

function makeBackdrop(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1b0f26');
    gr.addColorStop(0.45, '#2d1632');
    gr.addColorStop(0.8, '#3a1a2c');
    gr.addColorStop(1, '#2a0f18');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, 1);
}

// tall wooden panelling of the tower's inner wall, tiled vertically
function makePanels(W, art) {
  const TH = 480;
  return makeSprite(W, TH, (g) => {
    g.translate(-W / 2, -TH / 2);
    const cols = [0, 92, 180, 268, W];
    for (let i = 0; i < cols.length - 1; i++) {
      const x0 = cols[i];
      const x1 = cols[i + 1];
      for (const [y0, y1] of [[0, 230], [240, 470]]) {
        const pg = g.createLinearGradient(x0, 0, x1, 0);
        pg.addColorStop(0, 'rgba(90,40,60,0.10)');
        pg.addColorStop(0.5, 'rgba(120,60,80,0.06)');
        pg.addColorStop(1, 'rgba(20,5,20,0.16)');
        g.fillStyle = pg;
        g.fillRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
        g.strokeStyle = 'rgba(255,190,150,0.05)';
        g.lineWidth = 1;
        g.strokeRect(x0 + 6.5, y0 + 6.5, x1 - x0 - 13, y1 - y0 - 13);
        g.strokeStyle = 'rgba(0,0,0,0.18)';
        g.strokeRect(x0 + 9.5, y0 + 9.5, x1 - x0 - 19, y1 - y0 - 19);
      }
      // wood grain
      g.strokeStyle = 'rgba(0,0,0,0.07)';
      for (let k = 0; k < 6; k++) {
        const gx = x0 + 12 + art.next() * (x1 - x0 - 24);
        g.beginPath();
        g.moveTo(gx, 10);
        g.bezierCurveTo(gx + 4, 120, gx - 4, 300, gx + 2, TH - 10);
        g.stroke();
      }
    }
    // beam between panels
    g.fillStyle = 'rgba(10,2,10,0.3)';
    g.fillRect(0, 232, W, 8);
    g.fillStyle = 'rgba(255,200,160,0.05)';
    g.fillRect(0, 232, W, 1.5);
    g.fillRect(0, 470, W, 1.5);
    g.fillStyle = 'rgba(10,2,10,0.3)';
    g.fillRect(0, 472, W, 8);
  }, 1);
}

function makeClockWindow(r) {
  return makeSprite(r * 2 + 20, r * 2 + 20, (g) => {
    // stone frame
    g.fillStyle = '#251425';
    g.beginPath();
    g.arc(0, 0, r + 9, 0, TAU);
    g.fill();
    // backlit glass
    const gl = g.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
    gl.addColorStop(0, '#fff8e2');
    gl.addColorStop(0.6, '#ffe7b0');
    gl.addColorStop(1, '#f2b866');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    // mullions & ticks (seen from inside, so mirrored numerals are just bars)
    g.strokeStyle = '#3a2030';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(0, 0, r * 0.78, 0, TAU);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.lineWidth = i % 3 === 0 ? 4 : 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      g.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
      g.stroke();
    }
    g.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
      g.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, r * 0.2, 0, TAU);
    g.stroke();
    // big hands, silhouetted
    g.fillStyle = '#2a1424';
    g.save();
    g.rotate(-2.2);
    g.fillRect(-2.5, -r * 0.55, 5, r * 0.65);
    g.restore();
    g.save();
    g.rotate(0.9);
    g.fillRect(-1.8, -r * 0.82, 3.6, r * 0.92);
    g.restore();
    g.beginPath();
    g.arc(0, 0, 5, 0, TAU);
    g.fill();
  }, 2);
}

function makePillar(H) {
  return makeSprite(WALL + 6, H, (g) => {
    g.translate(-(WALL + 6) / 2, -H / 2);
    const gr = g.createLinearGradient(0, 0, WALL, 0);
    gr.addColorStop(0, '#1a0c14');
    gr.addColorStop(0.5, '#4a2a2a');
    gr.addColorStop(0.85, '#6e4430');
    gr.addColorStop(1, '#2a1410');
    g.fillStyle = gr;
    g.fillRect(0, 0, WALL, H);
    // brass strip and rivets
    g.fillStyle = '#b07a2a';
    g.fillRect(WALL - 3, 0, 2, H);
    g.fillStyle = 'rgba(255,230,160,0.5)';
    g.fillRect(WALL - 3, 0, 0.8, H);
    for (let y = 10; y < H; y += 40) {
      g.fillStyle = brassGrad(g, 2.5);
      g.save();
      g.translate(WALL * 0.45, y);
      g.beginPath();
      g.arc(0, 0, 2.4, 0, TAU);
      g.fill();
      g.restore();
    }
    // shadow cast onto the shaft
    const sg = g.createLinearGradient(WALL, 0, WALL + 6, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.35)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.fillRect(WALL, 0, 6, H);
  }, 2);
}

function makeShade(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const top = g.createLinearGradient(0, 0, 0, 120);
    top.addColorStop(0, 'rgba(14,6,20,0.7)');
    top.addColorStop(1, 'rgba(14,6,20,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 120);
    // the furnace-warm glow of the gears below
    const bot = g.createLinearGradient(0, H - 190, 0, H);
    bot.addColorStop(0, 'rgba(255,90,40,0)');
    bot.addColorStop(1, 'rgba(255,90,40,0.16)');
    g.fillStyle = bot;
    g.fillRect(0, H - 190, W, 190);
  }, 1);
}

// ---------- music: baroque clockwork techno, 132 BPM, C minor over Cm–B♭–A♭–G ----------

const music = {
  cps: 132 / 240,
  setup: `
    const kick = note("c2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("c2 c2 c2 [c2 c2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const tick = note("[g5 d5]*4").s("triangle").decay(0.03).sustain(0).gain(0.07).pan("[0.35 0.65]*4")
    const clap = s("~ pink ~ pink").decay(0.11).sustain(0).hpf(1100).lpf(6000).gain(0.14).room(0.3)
    const hat = s("[~ white]*4").decay(0.04).sustain(0).hpf(6800).gain(0.05)
    const hat16 = s("white*16").decay(0.025).sustain(0).hpf(7000).gain("[0.012 0.03 0.02 0.03]*4")
    const ohat = s("[~ white]*4").decay(0.18).sustain(0).hpf(6500).gain(0.035)
    const bass = note("<[~ c3 c3 c4]*4 [~ bb2 bb2 bb3]*4 [~ ab2 ab2 ab3]*4 [~ g2 g2 g3]*4>")
      .s("sawtooth").decay(0.1).sustain(0).lpf(saw.range(380, 1600).slow(33)).lpq(6).gain(0.32)
    const sub = note("<c3 bb2 ab2 g2>").s("sine").decay(0.6).sustain(0.4).gain(0.2)
    const prelude = "<[c4 eb4 g4 c5 g4 eb4 g4 eb4]*2 [bb3 d4 f4 bb4 f4 d4 f4 d4]*2 [ab3 c4 eb4 ab4 eb4 c4 eb4 c4]*2 [g3 b3 d4 g4 d4 b3 f4 d4]*2>"
    const harp = note(prelude).s("sawtooth").decay(0.09).sustain(0).lpf(saw.range(900, 2600).slow(33)).gain(0.065).room(0.3).pan(0.45)
    const harpHi = note(prelude).add(note(12)).s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const chords = "<[c3,eb3,g3] [bb2,d3,f3] [ab2,c3,eb3] [g2,b2,d3]>"
    const pad = note(chords).add(note(12)).s("sawtooth").attack(0.3).release(0.5).lpf(1000).gain(0.05).room(0.5)
    const bell = note("<c6 bb5 ab5 g5>").s("triangle").decay(1.2).sustain(0).gain(0.06).room(0.6).delay(0.3).delaytime(0.341).delayfeedback(0.3)
    const tune = "<[g5@2 ab5 g5 f5@2 eb5 d5] [f5@2 g5 f5 eb5@2 d5 c5] [eb5@2 f5 eb5 d5@2 c5 bb4] [b4@2 c5 d5 g5@2 f5 d5]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.15).sustain(0.4).release(0.06).lpf(2200).vib(5).vibmod(0.1)
      .gain(0.06).room(0.45).delay(0.22).delaytime(0.341).delayfeedback(0.25).pan(0.58)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.35).release(0.05).lpf(1400).gain(0.045)
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, tick, bass, sub, harp)],
    [8, stack(kick, tick, clap, hat, bass, sub, harp, pad, bell)],
    [8, stack(kick, tick, clap, hat, hat16, bass, sub, harp, pad, lead)],
    [9, stack(kick2, tick, clap, hat16, ohat, bass, sub, harp, harpHi, pad, bell, lead, leadLow, wash)]
  )`,
};

export default {
  id: 'hickory',
  title: 'Hickory Dock',
  emoji: '🐭',
  tagline: 'Hold ← or → to whirl round a peg, let go to fling up. Don’t fall!',
  colors: { bg: '#2d1632', fg: '#ffffff', accent: '#f2b84b' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---------- the level, planned upwards as it's needed (only from `plan`, never from input) ----------
    const pegs = [];
    const cogs = [];
    const pends = [];
    const route = [];
    let extras = []; // alternative pegs beside the last route peg

    const newPeg = (x, y, h, opts = {}) => {
      const d = diffAt(h);
      const p = {
        x,
        y,
        cx: x,
        vx: 0,
        h,
        grab: lerp(50, 38, d),
        amp: 0,
        w: 0,
        ph: 0,
        rusty: false,
        life: lerp(2.6, 1.6, d),
        load: 0,
        broken: false,
        brokenT: 0,
        ...opts,
      };
      return p;
    };
    const pegAt = (p, t) => (p.amp ? p.cx + p.amp * Math.sin(p.w * t + p.ph) : p.cx);

    const nearPegs = (y0, y1) => pegs.filter((p) => !p.broken && !p.gone && p.y > y0 && p.y < y1);
    const nearCogs = (y0, y1) => cogs.filter((c) => c.y > y0 && c.y < y1);

    // how many release angles (out of 240) carry the mouse from peg P onto peg Q
    function reach(P, Q, need) {
      const cs = nearCogs(Q.y - 260, P.y + 220);
      const others = nearPegs(Q.y - 260, P.y + 220).filter((p) => p !== Q);
      const g2 = (Q.grab * 0.8) ** 2;
      const DT = 1 / 60;
      const f = { x: 0, y: 0, vx: 0, vy: 0 };
      let n = 0;
      for (const s of [1, -1]) {
        for (let k = 0; k < 120; k++) {
          const a = (k / 120) * TAU;
          f.x = P.cx + R * Math.cos(a);
          f.y = P.y + R * Math.sin(a);
          f.vx = -Math.sin(a) * SPIN * R * s;
          f.vy = Math.cos(a) * SPIN * R * s;
          for (let i = 0; i < 90; i++) {
            stepFlight(f, DT, W);
            if (hitCog(f.x, f.y, cs)) break;
            const dx = f.x - Q.cx;
            const dy = f.y - Q.y;
            if (dx * dx + dy * dy < g2) {
              n++;
              break;
            }
            if (i > 12) {
              let other = false;
              for (const o of others) {
                const ox = f.x - o.cx;
                const oy = f.y - o.y;
                if (ox * ox + oy * oy < o.grab * o.grab) {
                  other = true;
                  break;
                }
              }
              if (other) break;
            }
            if (f.y > P.y + 160) break;
          }
          if (n >= need) return n;
        }
      }
      return n;
    }

    const pegClear = (p) => {
      for (const c of cogs) {
        if (Math.hypot(p.cx - c.x, p.y - c.y) - p.amp < R + c.r + MR + 6) return false;
      }
      for (const q of pegs) {
        if (q.gone) continue;
        if (Math.abs(q.y - p.y) > 200) continue;
        if (Math.hypot(p.cx - q.cx, p.y - q.y) - p.amp - q.amp < 78) return false;
      }
      for (const pd of pends) if (!pendClearOf(pd, p)) return false;
      return true;
    };
    const bobPos = (pd, th) => [pd.x + pd.L * Math.sin(th), pd.y + pd.L * Math.cos(th)];
    function pendClearOf(pd, p) {
      for (let i = 0; i <= 16; i++) {
        const th = -pd.A + (2 * pd.A * i) / 16;
        const [bx, by] = bobPos(pd, th);
        if (Math.hypot(bx - p.cx, by - p.y) - p.amp < R + BOB + MR + 5) return false;
      }
      return true;
    }

    const start = newPeg(START_X, START_Y, 0, { start: true });
    pegs.push(start);
    route.push(start);

    function genNext() {
      const P = route[route.length - 1];
      const prev = route[route.length - 2];
      const h = START_Y - P.y;
      const d = diffAt(h);
      const need = Math.round(lerp(16, 10, d));
      let Q = null;
      for (let tries = 0; tries < 40 && !Q; tries++) {
        const easy = tries > 28;
        const span = easy ? 70 : lerp(110, 170, d);
        const dx = plan.range(-span, span);
        const dy = easy ? plan.range(60, 75) : plan.range(lerp(66, 84, d), lerp(96, 116, d));
        const y = P.y - dy;
        const hq = START_Y - y;
        const dq = diffAt(hq);
        const rMove = plan.next();
        const rRust = plan.next();
        const rAmp = plan.next();
        const rW = plan.next();
        const rPh = plan.next();
        const opts = {};
        if (!easy && hq > 1100 && rMove < lerp(0.18, 0.36, dq)) {
          opts.amp = lerp(22, 40, rAmp);
          opts.w = TAU / lerp(3.6, 2.6, rW);
          opts.ph = rPh * TAU;
        }
        if (!easy && hq > 1700 && rRust < lerp(0.18, 0.4, dq)) opts.rusty = true;
        const amp = opts.amp || 0;
        const x = clamp(P.cx + dx, PX0 + amp, W - PX0 - amp);
        const cand = newPeg(x, y, hq, opts);
        if (!pegClear(cand)) continue;
        pegs.push(cand);
        const ok = reach(P, cand, need) >= need;
        pegs.pop();
        if (ok) Q = cand;
      }
      if (!Q) {
        // a sure, plain hop: clear whatever is in the way (all of this is still far above the view)
        const x = clamp(P.cx + (P.cx < W / 2 ? 50 : -50), PX0, W - PX0);
        Q = newPeg(x, P.y - 62, START_Y - (P.y - 62));
        for (let i = cogs.length - 1; i >= 0; i--) {
          const c = cogs[i];
          if (c.y < P.y + 120 && c.y > Q.y - 140) cogs.splice(i, 1);
        }
        for (let i = pends.length - 1; i >= 0; i--) if (!pendClearOf(pends[i], Q)) pends.splice(i, 1);
        for (const p of pegs) if (!p.start && p.y < P.y + 1 && p !== P && Math.hypot(p.cx - Q.cx, p.y - Q.y) < 78) p.gone = true;
      }
      // alternatives from the last layer that can't reach the new peg are dropped (still out of view)
      for (const e of extras) if (reach(e, Q, 3) < 3) e.gone = true;
      pegs.push(Q);
      route.push(Q);

      const hq = START_Y - Q.y;
      const dq = diffAt(hq);
      // spinning cogs between the pegs
      if (hq > 420 && plan.next() < lerp(0.45, 0.9, dq)) {
        const count = dq > 0.45 && plan.next() < 0.55 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          for (let tries = 0; tries < 10; tries++) {
            const c = {
              x: plan.range(WALL + 12, W - WALL - 12),
              y: plan.range(Q.y - 50, P.y + 20),
              r: plan.range(15, 22) + dq * 5,
              spin: (plan.next() < 0.5 ? -1 : 1) * plan.range(1.6, 3),
              ph: plan.next() * TAU,
            };
            let clear = true;
            for (const p of nearPegs(c.y - 260, c.y + 260)) {
              if (Math.hypot(p.cx - c.x, p.y - c.y) - p.amp < R + c.r + MR + 6) clear = false;
            }
            for (const o of cogs) if (Math.hypot(o.x - c.x, o.y - c.y) < o.r + c.r + 8) clear = false;
            for (const pd of pends) {
              for (let i = 0; i <= 8 && clear; i++) {
                const [bx, by] = bobPos(pd, -pd.A + (2 * pd.A * i) / 8);
                if (Math.hypot(bx - c.x, by - c.y) < BOB + c.r + 4) clear = false;
              }
            }
            if (!clear) continue;
            cogs.push(c);
            const need = Math.round(lerp(16, 10, dq));
            const ok = reach(P, Q, need) >= need && (!prev || reach(prev, P, need) >= need);
            if (ok) break;
            cogs.pop();
          }
        }
      }
      // a swinging pendulum now and then
      const lastPend = pends[pends.length - 1];
      if (hq > 1300 && (!lastPend || lastPend.y - Q.y > 300) && plan.next() < lerp(0.2, 0.42, dq)) {
        for (let tries = 0; tries < 10; tries++) {
          const pd = {
            x: plan.range(70, W - 70),
            y: Q.y - plan.range(70, 140),
            L: plan.range(90, 135),
            A: plan.range(0.6, 0.95),
            w: TAU / (plan.range(2.5, 3.2) - 0.5 * dq),
            ph: plan.next() * TAU,
          };
          let clear = true;
          for (const p of nearPegs(pd.y - 300, pd.y + 400)) if (!pendClearOf(pd, p)) clear = false;
          for (const c of nearCogs(pd.y - 100, pd.y + 300)) {
            for (let i = 0; i <= 8 && clear; i++) {
              const [bx, by] = bobPos(pd, -pd.A + (2 * pd.A * i) / 8);
              if (Math.hypot(bx - c.x, by - c.y) < BOB + c.r + 4) clear = false;
            }
          }
          if (clear) {
            pends.push(pd);
            break;
          }
        }
      }
      // an alternative peg beside the route one
      extras = [];
      if (hq > 250 && plan.next() < lerp(0.5, 0.3, dq)) {
        for (let tries = 0; tries < 6; tries++) {
          const e = newPeg(plan.range(PX0, W - PX0), Q.y + plan.range(-25, 25), hq);
          if (Math.abs(e.cx - Q.cx) < 110 || !pegClear(e)) continue;
          pegs.push(e);
          extras.push(e);
          break;
        }
      }
    }

    // ---------- art ----------
    const sprites = {
      mouse: makeMouse('calm'),
      ouch: makeMouse('ouch'),
      peg: makePeg(false),
      rust: makePeg(true),
      cog: makeCog(),
      bob: makeBob(),
    };
    const backdrop = makeBackdrop(W, H);
    const panels = makePanels(W, art);
    const clockWin = makeClockWindow(62);
    const pillar = makePillar(H + 80);
    const shade = makeShade(W, H);
    const bigGear = makeDecoGear(54, 18, 6, '#c27a38');
    const decoGears = [
      makeDecoGear(90, 26, 6, 'rgba(120,60,50,0.4)'),
      makeDecoGear(60, 18, 5, 'rgba(140,80,50,0.36)'),
      makeDecoGear(40, 12, 4, 'rgba(150,90,60,0.36)'),
    ];
    const farGears = [];
    for (let i = 0; i < 9; i++) {
      farGears.push({
        x: art.range(-20, W + 20),
        y: i * 150 + art.range(-30, 30),
        k: i % 3,
        spin: (i % 2 ? 1 : -1) * art.range(0.15, 0.4),
      });
    }
    const rods = [art.range(60, 110), art.range(240, 300)];
    const glowWarm = glowSprite('rgba(255,190,90,0.6)', 40);
    const glowRed = glowSprite('rgba(255,50,70,0.75)', 24);
    const glowGreen = glowSprite('rgba(110,255,160,0.8)', 20);
    const glowMoon = glowSprite('rgba(255,230,170,0.5)', 80);
    const vignette = vignetteSprite(W, H, 0.55, '10,2,14');
    const fx = createParticles();
    const sparks = createParticles();
    const dust = [];
    for (let i = 0; i < 26; i++) dust.push({ x: art.range(0, W), y: art.range(0, H), s: art.range(0.6, 1.8), v: art.range(4, 14), ph: art.range(0, TAU) });

    // ---------- state ----------
    const m = {
      x: START_X,
      y: START_Y + R,
      vx: 0,
      vy: 0,
      peg: start,
      a: Math.PI / 2,
      w: 0,
      len: R,
      motor: false,
      last: null,
      since: 1,
      face: 1,
      squash: 0,
    };
    let cam = 0; // screen y = world y + cam
    let now = 0;
    let clock = 0;
    let shake = 0;
    let deathKind = '';
    let deathT = -1;
    let rot = 0;
    let spinVis = 0;
    let trail = [];

    const sy = (y) => y + cam;

    const ensureWorld = () => {
      while (sy(route[route.length - 1].y) > -520) genNext();
      // forget what's far below
      if (pegs.length > 60) {
        for (let i = pegs.length - 1; i >= 0; i--) if (sy(pegs[i].y) > H + 300 && pegs[i] !== m.peg) pegs.splice(i, 1);
        for (let i = cogs.length - 1; i >= 0; i--) if (sy(cogs[i].y) > H + 300) cogs.splice(i, 1);
        for (let i = pends.length - 1; i >= 0; i--) if (sy(pends[i].y) > H + 500) pends.splice(i, 1);
        while (route.length > 4 && sy(route[0].y) > H + 300) route.shift();
      }
    };

    const latch = (p, dir) => {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      m.peg = p;
      m.a = Math.atan2(dy, dx);
      m.len = Math.max(18, Math.hypot(dx, dy));
      const rvx = m.vx - p.vx;
      const vt = -Math.sin(m.a) * rvx + Math.cos(m.a) * m.vy;
      m.w = vt / m.len;
      m.motor = dir !== 0;
      m.squash = 1;
      fx.burst(p.x, sy(p.y), { count: 10, speed: 90, life: 0.45, size: 2.5, colors: ['#ffe39a', '#f2b84b', '#fff6d8'] });
    };

    const release = () => {
      const p = m.peg;
      m.vx = -Math.sin(m.a) * m.w * m.len + p.vx;
      m.vy = Math.cos(m.a) * m.w * m.len;
      m.last = p;
      m.peg = null;
      m.since = 0;
      m.motor = false;
      fx.burst(m.x, sy(m.y), { count: 6, speed: 50, life: 0.4, size: 2, colors: ['rgba(255,255,255,0.7)', 'rgba(255,220,180,0.6)'] });
    };

    const die = (kind, reason) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      deathT = 0;
      shake = kind === 'fall' ? 0.9 : 0.6;
      const x = m.x;
      const y = sy(m.y);
      if (kind === 'fall') {
        sparks.burst(x, FLOOR_Y, { count: 50, speed: 340, life: 0.9, size: 3, gravity: 600, angle: -Math.PI / 2, spread: 2.2, colors: ['#ffd27a', '#ff9a3c', '#fff1c0'] });
        fx.burst(x, FLOOR_Y - 4, { count: 22, speed: 160, life: 1.2, size: 4, gravity: 200, drag: 1.5, colors: ['#b2adc2', '#e9e6f0', '#ffadc4'] });
      } else {
        sparks.burst(x, y, { count: 30, speed: 260, life: 0.7, size: 3, colors: ['#ffe39a', '#ff6a5a', '#ffffff'] });
        fx.burst(x, y, { count: 18, speed: 150, life: 1, size: 4, gravity: 260, drag: 1.2, colors: ['#b2adc2', '#e9e6f0', '#ffadc4'] });
        m.vx = (m.vx || 0) * 0.3 + (Math.random() - 0.5) * 160;
        m.vy = -220;
        m.peg = null;
      }
    };

    const updateCosmetic = (dt, scrollV) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.6);
      m.squash = Math.max(0, m.squash - dt * 4);
      fx.update(dt, scrollV);
      sparks.update(dt, scrollV);
      for (const p of pegs) if (p.broken) p.brokenT += dt;
      // sparks from the grinding gears
      if (Math.random() < dt * 9) {
        sparks.burst(Math.random() * W, FLOOR_Y + 6, { count: 3, speed: 160, life: 0.5, size: 2, gravity: 500, angle: -Math.PI / 2, spread: 1.2, colors: ['#ffd27a', '#ff9a3c'] });
      }
    };

    // where letting go right now would send the mouse (for the preview line)
    const predict = () => {
      if (!m.peg) return null;
      const p = m.peg;
      const f = {
        x: m.x,
        y: m.y,
        vx: -Math.sin(m.a) * m.w * m.len + p.vx,
        vy: Math.cos(m.a) * m.w * m.len,
      };
      const pts = [];
      const DT = 1 / 40;
      let hit = null;
      let bad = false;
      for (let i = 0; i < 44; i++) {
        stepFlight(f, DT, W);
        pts.push(f.x, f.y);
        if (hitCog(f.x, f.y, cogs)) {
          bad = true;
          break;
        }
        if (i > 3) {
          for (const q of pegs) {
            if (q.broken || q.gone || (q === p && i < 12)) continue;
            const dx = f.x - (q.amp ? pegAt(q, now + (i + 1) * DT) : q.x);
            const dy = f.y - q.y;
            if (dx * dx + dy * dy < q.grab * q.grab) {
              hit = q;
              break;
            }
          }
          if (hit) break;
        }
        if (sy(f.y) > FLOOR_Y) break;
      }
      return { pts, hit, bad };
    };

    const game = {
      dead: false,
      deathReason: '',
      _debug: { m, pegs, route, predict, get cam() { return cam; } },

      update(dt, dir, t) {
        now = t;
        // the view keeps climbing, and climbs faster when you're high up
        const follow = Math.max(0, FOLLOW_Y - sy(m.y)) * 3;
        const sv = baseScroll(t) + follow;
        cam += sv * dt;
        updateCosmetic(dt, sv);
        ensureWorld();

        for (const p of pegs) {
          if (!p.amp) continue;
          const nx = pegAt(p, t + dt);
          p.vx = (nx - p.x) / dt;
          p.x = nx;
        }

        if (m.peg) {
          const p = m.peg;
          if (dir !== 0) {
            m.motor = true;
            m.w += (dir * SPIN - m.w) * Math.min(1, dt * 12);
            m.face = dir;
          } else if (m.motor) {
            release();
          } else {
            // dangling: a damped pendulum
            m.w += ((GRAV / m.len) * Math.cos(m.a) - m.w * 1.4) * dt;
          }
          if (m.peg) {
            m.len += (R - m.len) * Math.min(1, dt * 14);
            m.a += m.w * dt;
            m.x = p.x + m.len * Math.cos(m.a);
            m.y = p.y + m.len * Math.sin(m.a);
            if (p.rusty) {
              p.load += dt;
              if (p.load >= p.life) {
                p.broken = true;
                fx.burst(p.x, sy(p.y), { count: 22, speed: 120, life: 0.9, size: 3.5, gravity: 400, colors: ['#a8582a', '#6e2f12', '#f0b58a'] });
                release();
              }
            }
          }
        } else {
          stepFlight(m, dt, W);
          m.since += dt;
          if (t < NET_T && sy(m.y) > FLOOR_Y - 18 && m.vy > 0) {
            // the safety net bounces you back up
            m.vy = -Math.max(330, m.vy * 0.85);
            m.y = FLOOR_Y - 18 - cam;
            fx.burst(m.x, FLOOR_Y - 10, { count: 8, speed: 60, life: 0.4, size: 2, colors: ['#f3e2c0'] });
          }
          let best = null;
          let bestD = Infinity;
          for (const p of pegs) {
            if (p.broken || p.gone) continue;
            if (p === m.last ? m.since < 0.3 : m.since < 0.08) continue;
            const dd = Math.hypot(m.x - p.x, m.y - p.y);
            if (dd < p.grab && dd < bestD) {
              best = p;
              bestD = dd;
            }
          }
          if (best) latch(best, dir);
        }

        // trail (cosmetic)
        trail.push(m.x, m.y);
        if (trail.length > 16) trail.splice(0, 2);

        // hazards
        const c = hitCog(m.x, m.y, cogs);
        if (c) {
          die('hit', 'Caught in the teeth of a spinning cog.');
          return;
        }
        for (const pd of pends) {
          const th = pd.A * Math.sin(pd.w * t + pd.ph);
          const [bx, by] = bobPos(pd, th);
          if (Math.hypot(m.x - bx, m.y - by) < BOB + MR - 2) {
            die('hit', 'Bonked by a swinging pendulum.');
            return;
          }
        }
        if (sy(m.y) > FLOOR_Y - MR + 4) {
          die('fall', m.peg ? 'The gears caught up with you.' : 'Fell into the clockwork.');
        }
      },

      afterlife(dt) {
        updateCosmetic(dt, 0);
        if (deathT >= 0) deathT += dt;
        if (deathKind === 'hit') {
          m.vy += GRAV * 1.4 * dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
        }
      },

      render(g) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 9 * shake);

        // ---- the tower ----
        g.drawImage(backdrop.canvas, 0, 0, W, H);
        {
          const per = panels.h;
          const off = (((cam * 0.5) % per) + per) % per;
          for (let y = off - per; y < H; y += per) g.drawImage(panels.canvas, 0, y, W, per);
        }
        // the clock face window, backlit by the moon, with light shafts
        {
          const per = 1500;
          const wy = ((((cam * 0.12 + 150) % per) + per) % per) - 200;
          const wx = 236;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowMoon, wx, wy, { size: 300, alpha: 0.45 });
          g.fillStyle = 'rgba(255,225,160,0.05)';
          for (const [o, w] of [[-40, 34], [6, 22], [36, 30]]) {
            g.beginPath();
            g.moveTo(wx + o, wy);
            g.lineTo(wx + o + w, wy);
            g.lineTo(wx + o + w - 220, wy + 620);
            g.lineTo(wx + o - 220, wy + 620);
            g.closePath();
            g.fill();
          }
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, clockWin, wx, wy, { size: clockWin.w, alpha: 0.78 });
        }
        // far gears turning in the gloom
        {
          const per = 1350;
          for (const fg of farGears) {
            const y = ((((fg.y + cam * 0.35) % per) + per) % per) - 120;
            const sp = decoGears[fg.k];
            drawSprite(g, sp, fg.x, y, { rot: clock * fg.spin, size: sp.w });
          }
        }
        // brass rods and chains
        for (const [i, rx] of rods.entries()) {
          g.fillStyle = 'rgba(190,120,60,0.22)';
          g.fillRect(rx - 2, 0, 4, H);
          g.fillStyle = 'rgba(255,220,160,0.12)';
          g.fillRect(rx - 1.5, 0, 1, H);
          // chain links running along it
          g.strokeStyle = 'rgba(200,150,90,0.25)';
          g.lineWidth = 1.4;
          const cy0 = ((cam * 0.6 + clock * (i ? 14 : -10)) % 14 + 14) % 14;
          for (let y = cy0 - 14; y < H; y += 14) {
            g.beginPath();
            g.ellipse(rx + 9, y, 2.5, 5, 0, 0, TAU);
            g.stroke();
          }
        }
        // drifting dust in the moonlight
        g.fillStyle = 'rgba(255,235,200,0.35)';
        for (const d of dust) {
          const y = (((d.y - clock * d.v + cam * 0.2) % H) + H) % H;
          const x = d.x + Math.sin(clock * 0.6 + d.ph) * 8;
          g.fillRect(x, y, d.s, d.s);
        }

        // ---- pendulums ----
        for (const pd of pends) {
          const py = sy(pd.y);
          if (py > H + 160 || py + pd.L < -60) continue;
          const th = pd.A * Math.sin(pd.w * t + pd.ph);
          const [bx, by0] = bobPos(pd, th);
          const by = sy(by0);
          // the swing's reach, faintly
          g.strokeStyle = 'rgba(255,90,100,0.13)';
          g.lineWidth = 2;
          g.setLineDash([3, 6]);
          g.beginPath();
          g.arc(pd.x, py, pd.L, Math.PI / 2 - pd.A, Math.PI / 2 + pd.A);
          g.stroke();
          g.setLineDash([]);
          // rod
          g.strokeStyle = '#4a2a10';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(pd.x, py);
          g.lineTo(bx, by);
          g.stroke();
          g.strokeStyle = '#d29a45';
          g.lineWidth = 1.6;
          g.stroke();
          // pivot bracket
          // iron pivot bracket (not a peg: it's dark steel, not brass)
          g.fillStyle = '#14101a';
          g.fillRect(pd.x - 14, py - 5, 28, 9);
          g.fillStyle = '#4a4f5c';
          g.beginPath();
          g.arc(pd.x, py, 5, 0, TAU);
          g.fill();
          g.fillStyle = '#9aa2b2';
          g.beginPath();
          g.arc(pd.x - 1.2, py - 1.2, 1.6, 0, TAU);
          g.fill();
          // ghost of motion
          const th2 = pd.A * Math.sin(pd.w * (t - 0.05) + pd.ph);
          const [gx, gy] = bobPos(pd, th2);
          drawSprite(g, sprites.bob, gx, sy(gy), { size: 40, alpha: 0.25 });
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, bx, by, { size: 64, alpha: 0.45 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, sprites.bob, bx, by, { size: 40 });
        }

        // ---- cogs ----
        for (const c of cogs) {
          const y = sy(c.y);
          if (y < -40 || y > H + 40) continue;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, c.x, y, { size: c.r * 3.4, alpha: 0.3 + 0.1 * Math.sin(clock * 5 + c.ph) });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, sprites.cog, c.x, y, { rot: c.ph + clock * c.spin, size: (sprites.cog.w * c.r) / 26 });
        }

        // ---- pegs ----
        const pv = !game.dead && m.peg && m.motor ? predict() : null;
        for (const p of pegs) {
          if (p.gone) continue;
          const y = sy(p.y);
          if (y < -40 || y > H + 40) continue;
          if (p.amp) {
            // rail it slides on
            g.strokeStyle = 'rgba(10,4,10,0.55)';
            g.lineWidth = 7;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(p.cx - p.amp, y);
            g.lineTo(p.cx + p.amp, y);
            g.stroke();
            g.strokeStyle = 'rgba(210,150,80,0.45)';
            g.lineWidth = 1.2;
            g.stroke();
            g.lineCap = 'butt';
          }
          if (p.broken) {
            if (p.brokenT < 1) {
              drawSprite(g, sprites.rust, p.x, y + p.brokenT * p.brokenT * 300, { rot: p.brokenT * 6, size: 30, alpha: 1 - p.brokenT });
            }
            continue;
          }
          const isTarget = pv && pv.hit === p;
          const isMine = m.peg === p;
          // grab zone
          g.strokeStyle = isTarget ? 'rgba(120,255,170,0.9)' : 'rgba(255,220,150,0.16)';
          g.lineWidth = isTarget ? 2 : 1;
          g.setLineDash(isTarget ? [] : [3, 5]);
          g.beginPath();
          g.arc(p.x, y, p.grab, 0, TAU);
          g.stroke();
          g.setLineDash([]);
          g.globalCompositeOperation = 'lighter';
          if (isTarget) drawSprite(g, glowGreen, p.x, y, { size: 60, alpha: 0.6 + 0.2 * Math.sin(clock * 12) });
          else drawSprite(g, glowWarm, p.x, y, { size: 44, alpha: isMine ? 0.5 : 0.28 });
          g.globalCompositeOperation = 'source-over';
          let px = p.x;
          if (p.rusty && isMine) px += (Math.random() - 0.5) * 2.4 * (p.load / p.life);
          drawSprite(g, p.rusty ? sprites.rust : sprites.peg, px, y, { size: 30 });
          if (p.rusty) {
            // cracks, then a countdown ring while you hang on it
            const k = p.load / p.life;
            g.strokeStyle = 'rgba(30,8,4,0.85)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(px - 2, y - 9);
            g.lineTo(px + 1, y - 3);
            g.lineTo(px - 3, y + 2);
            if (k > 0.4) {
              g.moveTo(px + 1, y - 3);
              g.lineTo(px + 7, y + 1);
            }
            if (k > 0.7) {
              g.moveTo(px - 3, y + 2);
              g.lineTo(px + 2, y + 8);
            }
            g.stroke();
            if (isMine) {
              g.strokeStyle = k > 0.65 ? `rgba(255,60,60,${0.7 + 0.3 * Math.sin(clock * 20)})` : 'rgba(255,170,90,0.9)';
              g.lineWidth = 3;
              g.beginPath();
              g.arc(px, y, 19, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
              g.stroke();
            }
          }
        }

        // ---- the release preview ----
        if (pv) {
          const n = pv.pts.length / 2;
          const col = pv.hit ? '130,255,170' : pv.bad ? '255,80,90' : '255,240,210';
          for (let i = 1; i < n; i += 1) {
            const u = 1 - i / (n + 4);
            g.fillStyle = `rgba(${col},${(pv.hit ? 0.9 : 0.45) * u})`;
            g.beginPath();
            g.arc(pv.pts[i * 2], sy(pv.pts[i * 2 + 1]), pv.hit ? 2.4 : 1.8, 0, TAU);
            g.fill();
          }
          if (pv.bad && n > 0) {
            const ex = pv.pts[n * 2 - 2];
            const ey = sy(pv.pts[n * 2 - 1]);
            g.strokeStyle = 'rgba(255,80,90,0.95)';
            g.lineWidth = 2.2;
            g.beginPath();
            g.moveTo(ex - 5, ey - 5);
            g.lineTo(ex + 5, ey + 5);
            g.moveTo(ex + 5, ey - 5);
            g.lineTo(ex - 5, ey + 5);
            g.stroke();
          }
        }

        // ---- the mouse ----
        const mx = m.x;
        const my = sy(m.y);
        const hidden = deathKind === 'fall' && deathT > 0.15;
        if (!hidden) {
          // velocity for the pose
          let vx;
          let vy;
          if (m.peg) {
            vx = -Math.sin(m.a) * m.w * m.len;
            vy = Math.cos(m.a) * m.w * m.len;
          } else {
            vx = m.vx;
            vy = m.vy;
          }
          const sp = Math.hypot(vx, vy);
          let target;
          let flip;
          if (deathKind === 'hit') {
            spinVis += 0.25;
            target = spinVis;
            flip = m.face < 0;
          } else if (m.peg && sp < 60) {
            // dangling: hang upright and look around
            target = Math.sin(clock * 2) * 0.12;
            flip = m.face < 0;
          } else {
            const ang = Math.atan2(vy, vx);
            flip = Math.cos(ang) < 0;
            target = flip ? ang - Math.PI : ang;
            if (target < -Math.PI) target += TAU;
            if (target > Math.PI) target -= TAU;
            target = clamp(target, -1.2, 1.2);
          }
          let dr = target - rot;
          while (dr > Math.PI) dr -= TAU;
          while (dr < -Math.PI) dr += TAU;
          rot += dr * (deathKind === 'hit' ? 1 : 0.25);

          // trail of speed
          if (!m.peg && !game.dead) {
            for (let i = 2; i < trail.length; i += 2) {
              const u = i / trail.length;
              g.strokeStyle = `rgba(255,230,190,${u * 0.35})`;
              g.lineWidth = u * 6;
              g.beginPath();
              g.moveTo(trail[i - 2], sy(trail[i - 1]));
              g.lineTo(trail[i], sy(trail[i + 1]));
              g.stroke();
            }
          }

          // the tail: wrapped round the peg while holding on, streaming behind in flight
          const back = flip ? 1 : -1;
          const tx = mx + Math.cos(rot) * back * 14;
          const ty = my + Math.sin(rot) * back * 14 + 4;
          g.lineCap = 'round';
          if (m.peg && !game.dead) {
            const px = m.peg.x;
            const py = sy(m.peg.y);
            const mxm = (tx + px) / 2 + Math.sin(clock * 9) * 3;
            const mym = (ty + py) / 2 + 6;
            for (const [cl, lw] of [['#5a2a3c', 4.2], ['#ff9ab6', 2.4]]) {
              g.strokeStyle = cl;
              g.lineWidth = lw;
              g.beginPath();
              g.moveTo(tx, ty);
              g.quadraticCurveTo(mxm, mym, px, py);
              g.stroke();
            }
            // coiled round the peg
            g.strokeStyle = '#ff9ab6';
            g.lineWidth = 2.2;
            g.beginPath();
            g.arc(px, py, 9, m.a, m.a + TAU * 0.8);
            g.stroke();
          } else {
            const ex = tx + Math.cos(rot) * back * 16;
            const ey = ty + Math.sin(rot) * back * 16 + Math.sin(clock * 14) * 4;
            for (const [cl, lw] of [['#5a2a3c', 3.8], ['#ff9ab6', 2.2]]) {
              g.strokeStyle = cl;
              g.lineWidth = lw;
              g.beginPath();
              g.moveTo(tx, ty);
              g.quadraticCurveTo((tx + ex) / 2, (ty + ey) / 2 - 8, ex, ey);
              g.stroke();
            }
          }
          g.lineCap = 'butt';

          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowWarm, mx, my, { size: 70, alpha: 0.3 });
          g.globalCompositeOperation = 'source-over';
          g.save();
          g.translate(mx, my);
          g.rotate(rot);
          const sq = Math.sin(m.squash * Math.PI) * 0.12;
          g.scale((flip ? -1 : 1) * (1 + sq), 1 - sq);
          const spr = game.dead ? sprites.ouch : sprites.mouse;
          const fall = deathKind === 'fall' ? Math.max(0, 1 - deathT / 0.15) : 1;
          g.globalAlpha = fall;
          g.drawImage(spr.canvas, -28, -21, 56, 42);
          g.globalAlpha = 1;
          g.restore();
        }

        fx.render(g);
        sparks.render(g, true);

        // ---- the grinding gears below ----
        {
          const bg = g.createLinearGradient(0, FLOOR_Y - 20, 0, H);
          bg.addColorStop(0, 'rgba(20,6,10,0)');
          bg.addColorStop(0.4, 'rgba(20,6,10,0.85)');
          bg.addColorStop(1, '#12040a');
          g.fillStyle = bg;
          g.fillRect(0, FLOOR_Y - 20, W, H - FLOOR_Y + 20);
          for (let i = 0; i < 5; i++) {
            const gx = 4 + i * 88;
            drawSprite(g, bigGear, gx, FLOOR_Y + 46, { rot: (i % 2 ? 1 : -1) * clock * 1.3 + i * 0.2, size: bigGear.w });
          }
          g.globalCompositeOperation = 'lighter';
          const danger = clamp((sy(m.y) - 430) / 150, 0, 1);
          for (let i = 0; i < 4; i++) drawSprite(g, glowWarm, 45 + i * 90, FLOOR_Y + 18, { size: 160, alpha: 0.18 + danger * 0.25 * (0.6 + 0.4 * Math.sin(clock * 10)) });
          g.globalCompositeOperation = 'source-over';
          // the safety net, rolled away after the start
          if (t < NET_T + 0.6) {
            const k = clamp((t - (NET_T - 0.4)) / 1, 0, 1);
            const half = (W / 2 - WALL) * (1 - k);
            if (half > 1) {
              g.strokeStyle = 'rgba(245,228,190,0.8)';
              g.lineWidth = 1.2;
              const ny = FLOOR_Y - 10;
              for (const side of [-1, 1]) {
                const x0 = side < 0 ? WALL : W - WALL;
                const x1 = x0 - side * half;
                g.beginPath();
                g.moveTo(x0, ny);
                g.lineTo(x1, ny + 2);
                g.moveTo(x0, ny + 8);
                g.lineTo(x1, ny + 9);
                g.stroke();
                for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x += 12) {
                  g.beginPath();
                  g.moveTo(x, ny);
                  g.lineTo(x + 6, ny + 9);
                  g.moveTo(x + 6, ny);
                  g.lineTo(x, ny + 9);
                  g.stroke();
                }
              }
            }
          }
        }

        // ---- pillars, shade and warnings ----
        g.drawImage(pillar.canvas, 0, (((cam % 40) + 40) % 40) - 40, pillar.w, pillar.h);
        g.save();
        g.translate(W, 0);
        g.scale(-1, 1);
        g.drawImage(pillar.canvas, 0, (((cam % 40) + 40) % 40) - 40, pillar.w, pillar.h);
        g.restore();
        g.drawImage(shade.canvas, 0, 0, W, H);

        // "!" over the mouse when the gears are close, or its rusty peg is about to go
        if (!game.dead) {
          const low = sy(m.y) > FLOOR_Y - 120;
          const rust = m.peg && m.peg.rusty && m.peg.load / m.peg.life > 0.6;
          if (low || rust) {
            g.font = '900 20px "Arial Black", Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineJoin = 'round';
            g.lineWidth = 4;
            g.strokeStyle = 'rgba(30,6,12,0.9)';
            const by = my - 30 - Math.abs(Math.sin(clock * 10)) * 3;
            g.strokeText('!', mx, by);
            g.fillStyle = '#ff4a4a';
            g.fillText('!', mx, by);
          }
        }
        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };

    ensureWorld();
    return game;
  },
};
