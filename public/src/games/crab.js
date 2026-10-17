// Bubble Crab — a little red crab on a kelp-forest reef blows a steady stream of bubbles straight
// up. Jellyfish drift down towards the reef, swaying as they pulse; every bubble that hits one
// wraps it up and floats it away to the surface. The bubbles take time to rise, so you lead the
// swaying jellies, and the order matters: always the lowest first. Let one touch the sand (or the
// crab) and the run is over. Big moon jellies take three bubbles from 13s, fast amber sea nettles
// dart down in bursts from 30s, and from 9s sea urchins sink from the surface (a dark shadow on the
// sand shows where they'll land); they spike the crab and pop any bubble they meet.

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

const SAND = 572; // the reef's sand line: a jellyfish's bell touching it ends the run
const CY = 548; // the crab's centre
const FIRE = 0.3; // seconds between bubbles
const BUBBLE_V = 400; // how fast bubbles rise
const BR = 8; // bubble radius
const URCHIN_R = 13;
const URCHIN_FROM = 9;

const KINDS = {
  pink: { r: 15, hp: 1, v: 1, bell: ['#ffd3e8', '#ff7fb8', '#c43b82'], line: 'rgba(255,170,215,0.6)', glow: 'rgba(255,120,190,1)' },
  moon: { r: 24, hp: 3, v: 0.72, bell: ['#eef4ff', '#a9c3ff', '#5d6fd6'], line: 'rgba(200,215,255,0.55)', glow: 'rgba(150,180,255,1)' },
  amber: { r: 13, hp: 1, v: 1.45, bell: ['#fff0c4', '#ffb347', '#d0581c'], line: 'rgba(255,190,110,0.65)', glow: 'rgba(255,170,60,1)' },
};

const fall = (t) => lerp(50, 112, progress(t, 60, 1.2)); // how fast jellies sink
const gap = (t) => lerp(1.15, 0.36, progress(t, 60, 1.25)); // seconds between jellies

const SAND_PUFF = ['#f3e2bd', '#e2c992', '#cdb07a'];
const POP = ['#ffffff', '#d9fbff', '#a6f0ff'];

// ---------- art ----------

function paintBackground(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#5cc6b4');
    sea.addColorStop(0.18, '#2f9a96');
    sea.addColorStop(0.55, '#14617a');
    sea.addColorStop(1, '#0a3550');
    g.fillStyle = sea;
    g.fillRect(0, 0, W, H);
    // a bright patch where the sun comes through the surface
    const sun = g.createRadialGradient(250, -30, 10, 250, -30, 330);
    sun.addColorStop(0, 'rgba(255,250,205,0.55)');
    sun.addColorStop(0.4, 'rgba(220,255,220,0.18)');
    sun.addColorStop(1, 'rgba(220,255,220,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // distant reef ridges, fading into the blue
    const ridges = [
      { base: 430, col: 'rgba(22,95,110,0.55)', amp: 40 },
      { base: 480, col: 'rgba(15,75,95,0.7)', amp: 34 },
      { base: 525, col: 'rgba(12,58,78,0.85)', amp: 26 },
    ];
    for (const R of ridges) {
      g.fillStyle = R.col;
      g.beginPath();
      g.moveTo(0, H);
      let y = R.base;
      for (let x = 0; x <= W + 10; x += 10) {
        y = clamp(y + rng.range(-9, 9), R.base - R.amp, R.base + 10);
        g.lineTo(x, y);
        if (rng.chance(0.12)) {
          // a little coral tree on the ridge
          const h = rng.range(10, 26);
          g.lineTo(x + 2, y - h);
          g.lineTo(x + 5, y - h * 0.4);
          g.lineTo(x + 7, y - h * 0.8);
          g.lineTo(x + 9, y);
        }
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    }
    // the sand
    const sand = g.createLinearGradient(0, SAND - 6, 0, H);
    sand.addColorStop(0, '#e9d3a2');
    sand.addColorStop(0.3, '#cfb27a');
    sand.addColorStop(1, '#8c7550');
    g.fillStyle = sand;
    g.beginPath();
    g.moveTo(0, SAND + 2);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, SAND + Math.sin(x * 0.045) * 2.5 + rng.range(-1, 1));
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fill();
    // ripples in the sand
    g.strokeStyle = 'rgba(120,95,55,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) {
      const x = rng.range(-20, W);
      const y = rng.range(SAND + 10, H - 4);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 16, y - 3, x + rng.range(26, 44), y);
      g.stroke();
    }
    for (let i = 0; i < 220; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,245,215,0.45)' : 'rgba(110,85,50,0.35)';
      g.fillRect(rng.range(0, W), rng.range(SAND + 2, H), rng.range(0.8, 2), rng.range(0.8, 1.6));
    }
    // shells and a starfish
    for (const [x, y, s] of [[38, 612, 1], [300, 624, 0.8], [210, 630, 0.7]]) {
      g.fillStyle = '#f7e6d8';
      g.beginPath();
      g.moveTo(x - 7 * s, y);
      g.quadraticCurveTo(x, y - 12 * s, x + 7 * s, y);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(190,140,120,0.8)';
      g.lineWidth = 0.8;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(x, y - 1);
        g.lineTo(x + k * 3 * s, y - 8 * s + Math.abs(k) * 2 * s);
        g.stroke();
      }
    }
    const star = (x, y, r, rot) => {
      g.fillStyle = '#ef7a46';
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = rot + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.42 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#ffd2a8';
      for (let k = 0; k < 5; k++) {
        const a = rot + (k * 2 * Math.PI) / 5;
        for (let d = 3; d < r * 0.8; d += 3) {
          g.beginPath();
          g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    star(130, 618, 11, 0.3);
  }, 1.5);
}

// coral and anemones at the two edges of the reef, drawn in front of everything
function paintCoral(W) {
  const h = 150;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const branch = (x, y, len, ang, w, col, depth) => {
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      if (depth > 0) {
        branch(x2, y2, len * 0.72, ang - 0.45, w * 0.72, col, depth - 1);
        branch(x2, y2, len * 0.72, ang + 0.4, w * 0.72, col, depth - 1);
      } else {
        g.fillStyle = 'rgba(255,230,240,0.8)';
        g.beginPath();
        g.arc(x2, y2, w * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    };
    // left: a staghorn coral and a sea fan
    g.save();
    g.globalAlpha = 0.95;
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI / 2 + (i - 9) * 0.08;
      g.strokeStyle = i % 2 ? '#b0347a' : '#d14c8e';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(18, h);
      g.quadraticCurveTo(18 + Math.cos(a) * 30, h - 40, 18 + Math.cos(a) * 70, h + Math.sin(a) * 90);
      g.stroke();
    }
    g.restore();
    branch(44, h + 4, 34, -1.75, 9, '#ff7a59', 3);
    branch(44, h + 4, 34, -1.75, 4, 'rgba(255,190,150,0.6)', 3);
    // right: brain coral and a waving anemone
    const brain = g.createRadialGradient(W - 40, h - 14, 4, W - 34, h - 4, 40);
    brain.addColorStop(0, '#f7d36a');
    brain.addColorStop(1, '#a8781e');
    g.fillStyle = brain;
    g.beginPath();
    g.ellipse(W - 34, h, 42, 30, 0, Math.PI, 0);
    g.fill();
    g.strokeStyle = 'rgba(110,70,10,0.55)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      for (let x = -38; x <= 38; x += 3) {
        const yy = h - 4 - k * 4.5 + Math.sin(x * 0.35 + k) * 2;
        if (Math.abs(x) > Math.sqrt(Math.max(0, 1 - ((h - yy) / 30) ** 2)) * 40) continue;
        g.lineTo(W - 34 + x, yy);
      }
      g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const bx = W - 96 + i * 2.2;
      g.strokeStyle = i % 2 ? '#7ee0c4' : '#b6f5df';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(bx + 6, h);
      g.quadraticCurveTo(bx + (i - 7) * 2, h - 30, bx + (i - 7) * 3.2, h - 44 - (i % 3) * 5);
      g.stroke();
      g.fillStyle = '#ff9fc8';
      g.beginPath();
      g.arc(bx + (i - 7) * 3.2, h - 44 - (i % 3) * 5, 2, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

function paintRays(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const [x0, w, a] of [[150, 30, 0.2], [210, 50, 0.16], [290, 26, 0.18], [60, 40, 0.1], [330, 40, 0.12]]) {
      const grad = g.createLinearGradient(0, 0, 0, H * 0.9);
      grad.addColorStop(0, `rgba(230,255,225,${a})`);
      grad.addColorStop(1, 'rgba(230,255,225,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 + w, 0);
      g.lineTo(x0 + w - 120, H * 0.9);
      g.lineTo(x0 - 170, H * 0.9);
      g.closePath();
      g.fill();
    }
  }, 1);
}

// the wobbly, sunlit underside of the surface at the top of the screen
function paintSurface(W) {
  return makeSprite(W, 70, (g) => {
    g.translate(-W / 2, -35);
    const grad = g.createLinearGradient(0, 0, 0, 70);
    grad.addColorStop(0, 'rgba(235,255,240,0.55)');
    grad.addColorStop(1, 'rgba(235,255,240,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, 70);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, 8 + k * 9 + Math.sin(x * 0.06 + k * 1.7) * 3);
      g.stroke();
    }
  }, 1.5);
}

function paintBell(kind) {
  const K = KINDS[kind];
  return makeSprite(64, 48, (g) => {
    // dome, centre at the origin, rim at y = +10
    const body = g.createRadialGradient(-8, -14, 2, 0, -2, 34);
    body.addColorStop(0, K.bell[0]);
    body.addColorStop(0.5, K.bell[1]);
    body.addColorStop(1, K.bell[2]);
    g.globalAlpha = 0.9;
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-30, 10);
    g.bezierCurveTo(-32, -26, 32, -26, 30, 10);
    // scalloped rim
    for (let k = 0; k < 8; k++) {
      const x0 = 30 - (k * 60) / 8;
      g.quadraticCurveTo(x0 - 3.75, 15, x0 - 7.5, 10);
    }
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
    // inner glow and organs
    if (kind === 'moon') {
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 2.2;
      for (const [x, y] of [[-8, -4], [8, -4], [0, -12], [0, 4]]) {
        g.beginPath();
        g.ellipse(x, y, 4.5, 4.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.2;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(k * 2, -16);
        g.quadraticCurveTo(k * 6, -6, k * 8.5, 10);
        g.stroke();
      }
    }
    // a glassy highlight
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-12, -10, 7, 3.5, -0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(14, -6, 3, 1.5, 0.6, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

function paintBubble(r) {
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    const fill = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    fill.addColorStop(0, 'rgba(255,255,255,0.12)');
    fill.addColorStop(0.75, 'rgba(190,250,255,0.28)');
    fill.addColorStop(1, 'rgba(220,255,255,0.65)');
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    g.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(-r * 0.38, -r * 0.42, r * 0.28, r * 0.16, -0.7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,190,240,0.5)';
    g.lineWidth = Math.max(0.8, r * 0.05);
    g.beginPath();
    g.arc(0, 0, r * 0.82, 0.3, 1.3);
    g.stroke();
  }, 3);
}

function paintUrchin() {
  const s = URCHIN_R * 2 + 18;
  return makeSprite(s, s, (g) => {
    g.lineCap = 'round';
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * Math.PI * 2;
      const len = URCHIN_R + 6 + (k % 3) * 2.5;
      g.strokeStyle = k % 2 ? '#2b0f3a' : '#4a1d5c';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.stroke();
      g.fillStyle = '#c86ad8';
      g.beginPath();
      g.arc(Math.cos(a) * len, Math.sin(a) * len, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    const body = g.createRadialGradient(-3, -4, 1, 0, 0, URCHIN_R * 0.75);
    body.addColorStop(0, '#9b4cb0');
    body.addColorStop(1, '#2a0d36');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, URCHIN_R * 0.72, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// the crab, facing the player, claws up; `step` swaps which legs are lifted
function paintCrab(step) {
  return makeSprite(84, 64, (g) => {
    const shell = '#e2462e';
    const dark = '#9c2216';
    // legs
    g.strokeStyle = dark;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 3.6;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const lift = (k + (s > 0 ? 1 : 0) + step) % 2 ? -3 : 0;
        g.beginPath();
        g.moveTo(s * 14, 8 + k * 3);
        g.lineTo(s * (26 + k * 3), 2 + k * 4 + lift);
        g.lineTo(s * (32 + k * 3), 20 + k * 2 + lift);
        g.stroke();
      }
    }
    // claws (arms, then pincers held up)
    for (const s of [-1, 1]) {
      g.strokeStyle = shell;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(s * 14, -2);
      g.quadraticCurveTo(s * 26, -6, s * 24, -18);
      g.stroke();
      const claw = g.createRadialGradient(s * 22, -26, 1, s * 24, -22, 11);
      claw.addColorStop(0, '#ff9a74');
      claw.addColorStop(1, '#c7321e');
      g.fillStyle = claw;
      g.beginPath();
      g.ellipse(s * 24, -24, 7.5, 9.5, s * 0.25, 0, Math.PI * 2);
      g.fill();
      // the notch between the pincers
      g.fillStyle = '#2f9a96';
      g.beginPath();
      g.moveTo(s * 22, -34);
      g.lineTo(s * 25, -26);
      g.lineTo(s * 29, -33);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.ellipse(s * 21.5, -24, 2, 3.5, 0.2, 0, Math.PI * 2);
      g.fill();
    }
    // shell
    const body = g.createRadialGradient(-6, -2, 2, 0, 6, 26);
    body.addColorStop(0, '#ff8a62');
    body.addColorStop(0.55, shell);
    body.addColorStop(1, '#8e1d12');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 6, 22, 14, 0, 0, Math.PI * 2);
    g.fill();
    // speckles and a shine
    g.fillStyle = 'rgba(255,200,170,0.5)';
    for (const [x, y] of [[-12, 8], [-6, 13], [8, 12], [13, 6], [3, 15]]) {
      g.beginPath();
      g.arc(x, y, 1.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.ellipse(-8, -1, 8, 3.5, -0.2, 0, Math.PI * 2);
    g.fill();
    // eye stalks
    for (const s of [-1, 1]) {
      g.strokeStyle = shell;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s * 6, -4);
      g.lineTo(s * 8, -15);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(s * 8, -17, 4.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1020';
      g.beginPath();
      g.arc(s * 8, -18.5, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(s * 8 - 0.8, -19.5, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // a little smile with pursed lips, ready to blow
    g.fillStyle = '#5a0e08';
    g.beginPath();
    g.ellipse(0, 4, 3, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(90,14,8,0.7)';
    g.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 6, 3, 2.5, s > 0 ? 0.2 : Math.PI - 1.4, s > 0 ? 1.4 : Math.PI - 0.2);
      g.stroke();
    }
  }, 3);
}

function paintFish(col) {
  return makeSprite(26, 14, (g) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(2, 0, 9, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(-12, -5);
    g.lineTo(-12, 5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(0, -3.5, 2, 7);
  }, 2);
}

// ---------- the game ----------

export default {
  id: 'crab',
  title: 'Bubble Crab',
  emoji: '🦀',
  tagline: 'Bubble every jellyfish before it reaches the sand. Dodge the urchins.',
  colors: { bg: '#14617a', fg: '#f4fbf6', accent: '#ff7a59' },

  // Soca / calypso in E major (E – B – C♯m – A), 132 BPM: four-on-the-floor kick, a bouncing
  // sawtooth bass and offbeat steel-pan chords from the first bar, then claps, a tumbling
  // "soca" rhythm, hats and a warm pad, then the steel-pan tune with echoes, and a finale with
  // a 16th pan arpeggio, a shaker, a cowbell and the tune doubled an octave down. 33 bars = 60s.
  music: {
    cps: 0.55,
    setup: `
      const kick = note("e2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.15).room(0.3)
      const tumble = s("pink ~ ~ pink ~ ~ pink ~ ~ ~ pink ~ pink ~ ~ ~").decay(0.06).sustain(0)
        .hpf(2500).lpf(6000).gain(0.07)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.045]*4")
      const bell = note("[~ a5]*4").s("square").decay(0.04).sustain(0).lpf(3000).gain(0.035)
      const bass = note("<[e2 ~ ~ e2 ~ ~ b2 ~ e3 ~ ~ e2 ~ b2 ~ ~] [b2 ~ ~ b2 ~ ~ fs2 ~ b2 ~ ~ b2 ~ ds3 ~ ~] [cs3 ~ ~ cs3 ~ ~ gs2 ~ cs3 ~ ~ cs3 ~ e3 ~ ~] [a2 ~ ~ a2 ~ ~ e2 ~ a2 ~ ~ a2 ~ b2 ~ ~]>")
        .s("sawtooth").decay(0.14).sustain(0.2).release(0.05).lpf(saw.range(500, 1300).slow(33)).lpq(3).gain(0.36)
      const chords = "<[e4,gs4,b4] [ds4,fs4,b4] [cs4,e4,gs4] [cs4,e4,a4]>"
      const pan = note(chords).struct("[~ x]*4").s("triangle").decay(0.18).sustain(0).release(0.05)
        .lpf(saw.range(1600, 3200).slow(33)).gain(0.12).pan(0.45).room(0.2)
      const pad = note("<[e3,b3,gs4] [b2,fs3,ds4] [cs3,gs3,e4] [a2,e3,cs4]>").s("sawtooth")
        .attack(0.25).decay(0.6).sustain(0.6).release(0.4).lpf(1100).gain(0.05).room(0.4)
      const tune = "<[gs5 ~ e5 gs5 b5 ~ gs5 ~] [fs5 ~ ds5 fs5 b5 ~ a5 gs5] [e5 ~ cs5 e5 gs5 ~ fs5 e5] [cs5 e5 ~ fs5 ~ e5 ds5 b4]>"
      const lead = note(tune).s("triangle").decay(0.22).sustain(0.15).release(0.1).lpf(3200).gain(0.13)
        .room(0.35).delay(0.25).delaytime(0.34).delayfeedback(0.3).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("square").decay(0.16).sustain(0.2).release(0.05)
        .lpf(1400).gain(0.05).pan(0.4)
      const arp = note("<[e5 gs5 b5 gs5]*4 [ds5 fs5 b5 fs5]*4 [cs5 e5 gs5 e5]*4 [cs5 e5 a5 e5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3600).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, bass, pan)],
      [8, stack(kick, clap, tumble, hats, bass, pan, pad)],
      [8, stack(kick, clap, tumble, hats, bass, pan, pad, lead)],
      [9, stack(kick, clap, tumble, hats, shaker, bell, bass, pan, pad, lead, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const bg = paintBackground(W, H, art);
    const coral = paintCoral(W);
    const rays = paintRays(W, H);
    const surface = paintSurface(W);
    const bells = { pink: paintBell('pink'), moon: paintBell('moon'), amber: paintBell('amber') };
    const glows = {
      pink: glowSprite(KINDS.pink.glow.replace(',1)', ',0.8)'), 40),
      moon: glowSprite(KINDS.moon.glow.replace(',1)', ',0.8)'), 40),
      amber: glowSprite(KINDS.amber.glow.replace(',1)', ',0.8)'), 40),
    };
    const bubbleArt = paintBubble(BR);
    const bigBubble = paintBubble(30);
    const urchinArt = paintUrchin();
    const crabArt = [paintCrab(0), paintCrab(1)];
    const fishArt = [paintFish('rgba(255,200,90,0.55)'), paintFish('rgba(160,230,255,0.45)')];
    const redGlow = glowSprite('rgba(255,60,40,1)', 40);
    const sunGlow = glowSprite('rgba(240,255,220,1)', 60);
    const vignette = vignetteSprite(W, H, 0.55, '4,24,40');
    const fx = createParticles();
    const motes = createParticles();

    const crab = createMover({ x: W / 2, minX: 30, maxX: W - 30, speed: 255, accel: 16 });

    // ---- everything that will happen, fixed in advance ----
    const spawns = [];
    let st = 0.6;
    while (st < 60) {
      const p = progress(st, 60, 1.2);
      const roll = plan.next();
      let kind = 'pink';
      if (st > 13 && roll < lerp(0.22, 0.36, p)) kind = 'moon';
      else if (st > 27 && roll > 1 - lerp(0.2, 0.32, p)) kind = 'amber';
      const r = KINDS[kind].r;
      const amp = plan.range(8, lerp(28, 62, p));
      const bx = plan.range(28 + r + amp, W - 28 - r - amp);
      spawns.push({ t: st, kind, bx, amp, w: plan.range(0.6, 1.4), ph: plan.range(0, Math.PI * 2), vk: plan.range(0.88, 1.12) });
      // later on, a second jelly sometimes drops in at the same time, far from the first
      if (st > 18 && plan.chance(lerp(0.1, 0.35, p))) {
        const amp2 = plan.range(8, 30);
        const bx2 = bx < W / 2 ? plan.range(W * 0.62, W - 44 - amp2) : plan.range(44 + amp2, W * 0.38);
        spawns.push({ t: st, kind: 'pink', bx: bx2, amp: amp2, w: plan.range(0.6, 1.4), ph: plan.range(0, Math.PI * 2), vk: plan.range(0.88, 1.12) });
      }
      st += gap(st) * plan.range(0.75, 1.25);
    }
    const drops = [];
    let ut = URCHIN_FROM;
    while (ut < 60) {
      drops.push({ t: ut, x: plan.range(30, W - 30), v: plan.range(240, 300) });
      ut += lerp(4.2, 1.7, progress(ut, 60, 1)) * plan.range(0.7, 1.3);
    }

    const jellies = [];
    const bubbles = [];
    const wrapped = []; // bubbled jellies floating away (cosmetic)
    const urchins = [];
    const fish = [];
    let si = 0;
    let ui = 0;
    let fire = 0.3;
    let caught = 0;
    let clock = 0;
    let walked = 0;
    let deathKind = '';
    let deadT = 0;
    let killer = null;

    const jellyX = (j) => j.bx + j.amp * Math.sin(j.age * j.w + j.ph);

    const die = (game, reason, kind, by) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      killer = by;
      fx.burst(crab.x, CY - 6, { count: 30, speed: 220, life: 0.9, size: 4, drag: 2.5, colors: kind === 'reef' ? ['#ff7fb8', '#ffd3e8', '#ffffff'] : ['#ffe27a', '#ffffff', '#ff8a62'] });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      for (let i = wrapped.length - 1; i >= 0; i--) {
        const w = wrapped[i];
        w.vy = Math.max(-260, w.vy - 160 * dt);
        w.y += w.vy * dt;
        w.age += dt;
        if (w.y < 34) {
          fx.burst(w.x, w.y, { count: 14, speed: 120, life: 0.5, size: 3, round: true, drag: 3, colors: POP });
          wrapped.splice(i, 1);
        }
      }
      if (fish.length < 3 && Math.random() < dt * 0.25) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const y = 260 + Math.random() * 180;
        const n = 5 + ((Math.random() * 5) | 0);
        const col = (Math.random() * 2) | 0;
        const school = [];
        for (let k = 0; k < n; k++) school.push({ dx: -dir * k * 14 + Math.random() * 6, dy: (Math.random() - 0.5) * 30 });
        fish.push({ x: dir > 0 ? -60 : W + 60, y, dir, v: 40 + Math.random() * 30, school, col });
      }
      for (let i = fish.length - 1; i >= 0; i--) {
        const f = fish[i];
        f.x += f.dir * f.v * dt;
        if (f.x < -260 || f.x > W + 260) fish.splice(i, 1);
      }
      if (Math.random() < dt * 4) {
        motes.burst(Math.random() * W, H * Math.random(), { count: 1, speed: 6, life: 5, size: 1.6, round: true, colors: ['rgba(230,255,240,0.7)', 'rgba(200,240,255,0.5)'] });
      }
      motes.update(dt);
      fx.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        updateCosmetic(dt);
        const ox = crab.x;
        crab.update(dt, dir);
        walked += Math.abs(crab.x - ox);
        if (dir && Math.random() < dt * 10) {
          fx.burst(crab.x - dir * 22, SAND + 4, { count: 2, speed: 40, angle: -Math.PI / 2 - dir * 0.8, spread: 0.8, life: 0.5, size: 2.5, gravity: 120, colors: SAND_PUFF });
        }

        // new jellies and urchins on schedule
        while (si < spawns.length && spawns[si].t <= t) {
          const s = spawns[si++];
          const K = KINDS[s.kind];
          jellies.push({ ...s, r: K.r, hp: K.hp, age: 0, y: -K.r - 14, flash: 0, x: s.bx });
        }
        while (ui < drops.length && drops[ui].t <= t) {
          const d = drops[ui++];
          urchins.push({ x: d.x, y: -URCHIN_R - 6, v: d.v, rot: Math.random() * 6, landed: 0 });
        }

        // bubbles
        fire -= dt;
        if (fire <= 0) {
          fire += FIRE;
          bubbles.push({ x: crab.x, y: CY - 30, wob: Math.random() * 6 });
        }
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          b.y -= BUBBLE_V * dt;
          if (b.y < -BR) bubbles.splice(i, 1);
        }

        // jellies sink, swaying, pulsing down in little pushes
        const v = fall(t);
        for (const j of jellies) {
          j.age += dt;
          const pulse = 0.55 + 0.9 * Math.max(0, Math.sin(j.age * (j.kind === 'amber' ? 5 : 3.2)));
          j.y += v * KINDS[j.kind].v * j.vk * pulse * dt;
          j.x = jellyX(j);
          j.flash = Math.max(0, j.flash - dt * 5);
        }

        // bubbles hit jellies
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          for (let k = jellies.length - 1; k >= 0; k--) {
            const j = jellies[k];
            const dx = b.x - j.x;
            const dy = b.y - j.y;
            const rr = j.r + BR;
            if (dx * dx + dy * dy > rr * rr) continue;
            bubbles.splice(i, 1);
            j.hp--;
            fx.burst(b.x, b.y, { count: 8, speed: 90, life: 0.4, size: 2.5, round: true, drag: 3, colors: POP });
            if (j.hp <= 0) {
              jellies.splice(k, 1);
              wrapped.push({ x: j.x, y: j.y, vy: -40, age: 0, kind: j.kind, r: j.r });
              caught++;
            } else {
              j.flash = 1;
              j.y -= 9;
            }
            break;
          }
        }

        // urchins sink and pop bubbles in their way
        for (let i = urchins.length - 1; i >= 0; i--) {
          const u = urchins[i];
          if (u.landed) {
            u.landed += dt;
            if (u.landed > 0.7) urchins.splice(i, 1);
            continue;
          }
          u.y += u.v * dt;
          u.rot += dt * 0.8;
          if (u.y >= SAND - URCHIN_R + 4) {
            u.y = SAND - URCHIN_R + 4;
            u.landed = 0.001;
            fx.burst(u.x, SAND, { count: 12, speed: 70, angle: -Math.PI / 2, spread: 2.4, life: 0.6, size: 3, gravity: 160, colors: SAND_PUFF });
          }
          for (let k = bubbles.length - 1; k >= 0; k--) {
            const b = bubbles[k];
            if (Math.abs(b.x - u.x) < URCHIN_R + BR && Math.abs(b.y - u.y) < URCHIN_R + BR) {
              bubbles.splice(k, 1);
              fx.burst(b.x, b.y, { count: 6, speed: 80, life: 0.3, size: 2, round: true, drag: 3, colors: POP });
            }
          }
          if (!u.landed || u.landed < 0.25) {
            const dx = u.x - crab.x;
            const dy = u.y - (CY + 2);
            if (Math.abs(dx) < 15 + URCHIN_R && Math.abs(dy) < 12 + URCHIN_R) {
              return die(this, 'Spiked by a sinking sea urchin.', 'urchin', u);
            }
          }
        }

        // a jelly on the crab, or on the reef
        for (const j of jellies) {
          const dx = j.x - crab.x;
          const reach = j.y + j.r * 1.2;
          if (Math.abs(dx) < 20 + j.r * 0.7 && reach > CY - 20) {
            return die(this, `Stung by a ${j.kind === 'moon' ? 'moon jelly' : j.kind === 'amber' ? 'sea nettle' : 'jellyfish'}.`, 'sting', j);
          }
          if (j.y + j.r * 0.45 >= SAND) {
            return die(this, `A ${j.kind === 'moon' ? 'moon jelly' : j.kind === 'amber' ? 'sea nettle' : 'jellyfish'} drifted down onto the reef.`, 'reef', j);
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        deadT += dt;
        for (const b of bubbles) b.y -= BUBBLE_V * 0.5 * dt;
        if (killer && Math.random() < dt * 14) {
          fx.burst(killer.x + (Math.random() - 0.5) * 30, (killer.y ?? CY) + 10, { count: 1, speed: 40, life: 0.5, size: 3, colors: deathKind === 'urchin' ? ['#c86ad8'] : ['#ffe27a', '#ffffff'] });
        }
      },

      render(g) {
        drawSprite(g, bg, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 250, 0, { size: 300, alpha: 0.35 + 0.05 * Math.sin(clock * 0.8) });
        g.globalAlpha = 0.7 + 0.3 * Math.sin(clock * 0.6);
        g.drawImage(rays.canvas, Math.sin(clock * 0.3) * 12, 0, W, H);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';

        // swaying kelp in the distance
        g.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const x0 = [24, 92, 170, 262, 338][k];
          const h = [300, 210, 170, 250, 320][k];
          g.strokeStyle = k % 2 ? 'rgba(70,110,60,0.55)' : 'rgba(95,130,60,0.5)';
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(x0, SAND + 4);
          for (let s = 1; s <= 6; s++) {
            const u = s / 6;
            g.lineTo(x0 + Math.sin(clock * 0.9 + k * 1.3 + u * 2.4) * 14 * u, SAND + 4 - h * u);
          }
          g.stroke();
          g.fillStyle = g.strokeStyle;
          for (let s = 1; s < 6; s++) {
            const u = s / 6;
            const x = x0 + Math.sin(clock * 0.9 + k * 1.3 + u * 2.4) * 14 * u;
            const y = SAND + 4 - h * u;
            const side = s % 2 ? 1 : -1;
            g.beginPath();
            g.ellipse(x + side * 9, y - 4, 10, 3.5, side * -0.5 + Math.sin(clock + s) * 0.2, 0, Math.PI * 2);
            g.fill();
          }
        }

        drawSprite(g, coral, W / 2, H - 75);

        // fish schools passing far behind
        for (const f of fish) {
          for (const m of f.school) {
            g.save();
            g.translate(f.x + m.dx, f.y + m.dy + Math.sin(clock * 2 + m.dx) * 3);
            g.scale(f.dir, 1);
            drawSprite(g, fishArt[f.col], 0, 0, { size: 18 });
            g.restore();
          }
        }
        motes.render(g);

        // where the urchins will land, and where jellies are about to touch down
        for (const u of urchins) {
          if (u.landed) continue;
          const k = clamp(u.y / SAND, 0, 1);
          g.fillStyle = `rgba(40,10,50,${0.25 + 0.35 * k})`;
          g.beginPath();
          g.ellipse(u.x, SAND + 6, URCHIN_R + 8 - 4 * k, 4, 0, 0, Math.PI * 2);
          g.fill();
        }
        for (const j of jellies) {
          const near = clamp((j.y - (SAND - 170)) / 140, 0, 1);
          if (near <= 0) continue;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, j.x, SAND + 2, { size: 60 + 40 * near + 8 * Math.sin(clock * 14), alpha: 0.25 + 0.45 * near });
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = `rgba(255,90,70,${0.4 + 0.5 * near})`;
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(j.x, SAND + 4, j.r + 4, 4, 0, 0, Math.PI * 2);
          g.stroke();
        }

        // jellies
        for (const j of jellies) {
          const K = KINDS[j.kind];
          const squash = 1 + 0.1 * Math.sin(j.age * (j.kind === 'amber' ? 5 : 3.2) + Math.PI);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glows[j.kind], j.x, j.y, { size: j.r * 4.2, alpha: 0.28 + 0.4 * j.flash });
          g.globalCompositeOperation = 'source-over';
          // tentacles trailing behind as it pushes down
          g.strokeStyle = K.line;
          g.lineWidth = j.kind === 'moon' ? 1.2 : 1.6;
          const n = j.kind === 'moon' ? 7 : 5;
          const len = j.r * (j.kind === 'amber' ? 2.6 : 1.9);
          for (let k = 0; k < n; k++) {
            const sx = j.x + (k - (n - 1) / 2) * ((j.r * 1.5) / n);
            const sy = j.y + j.r * 0.3;
            g.beginPath();
            g.moveTo(sx, sy);
            for (let s = 1; s <= 4; s++) {
              const u = s / 4;
              g.lineTo(sx + Math.sin(j.age * 4 + k * 1.1 - s * 0.9) * 4 * u, sy + len * u);
            }
            g.stroke();
          }
          if (j.kind === 'amber') {
            g.strokeStyle = 'rgba(255,230,190,0.75)';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(j.x, j.y + j.r * 0.3);
            g.quadraticCurveTo(j.x + Math.sin(j.age * 3) * 6, j.y + len * 0.5, j.x - Math.sin(j.age * 3) * 3, j.y + len * 0.8);
            g.stroke();
          }
          g.save();
          g.translate(j.x, j.y);
          g.scale(1 / squash, squash);
          drawSprite(g, bells[j.kind], 0, 0, { size: j.r * 2.6 });
          g.restore();
          if (j.flash > 0) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, bells[j.kind], j.x, j.y, { size: j.r * 2.6, alpha: j.flash * 0.6 });
            g.globalCompositeOperation = 'source-over';
          }
          if (KINDS[j.kind].hp > 1) {
            // pips: how many bubbles it still needs
            for (let k = 0; k < j.hp; k++) {
              g.fillStyle = 'rgba(255,255,255,0.9)';
              g.beginPath();
              g.arc(j.x + (k - (j.hp - 1) / 2) * 9, j.y - j.r - 6, 3, 0, Math.PI * 2);
              g.fill();
            }
          }
        }

        // bubbled jellies floating up to the surface
        for (const w of wrapped) {
          const wx = w.x + Math.sin(w.age * 3) * 5;
          const s = w.r * 1.45 + 4;
          g.save();
          g.translate(wx, w.y);
          g.rotate(Math.sin(w.age * 2) * 0.15);
          drawSprite(g, bells[w.kind], 0, 2, { size: w.r * 1.8, alpha: 0.85 });
          g.restore();
          drawSprite(g, bigBubble, wx, w.y, { size: s * 2 + 4 * Math.sin(w.age * 6) });
        }

        // urchins
        for (const u of urchins) {
          const a = u.landed ? 1 - clamp((u.landed - 0.3) / 0.4, 0, 1) : 1;
          drawSprite(g, urchinArt, u.x, u.y + (u.landed ? u.landed * 10 : 0), { rot: u.rot, alpha: a });
        }

        // bubbles
        for (const b of bubbles) drawSprite(g, bubbleArt, b.x + Math.sin(b.y * 0.05 + b.wob) * 1.5, b.y, { size: BR * 2 + 8 });

        // the crab
        const step = Math.floor(walked / 14) % 2;
        g.save();
        g.translate(crab.x, CY + (step ? -1 : 0));
        if (this.dead) {
          const k = Math.min(1, deadT * 3);
          g.translate(Math.sin(deadT * 40) * 3 * (1 - k), 0);
          g.rotate(Math.sin(deadT * 6) * 0.15 * (1 - k * 0.5));
        } else {
          g.rotate(crab.lean * 0.08);
        }
        drawSprite(g, crabArt[step], 0, 0);
        if (this.dead && deathKind === 'urchin') {
          // dizzy stars
          g.fillStyle = '#ffe27a';
          for (let k = 0; k < 3; k++) {
            const a = deadT * 4 + (k * Math.PI * 2) / 3;
            g.beginPath();
            g.arc(Math.cos(a) * 18, -30 + Math.sin(a) * 5, 2.5, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.restore();

        fx.render(g);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8 + 0.2 * Math.sin(clock * 1.4);
        g.drawImage(surface.canvas, Math.sin(clock * 0.7) * 6 - 6, 0, W + 12, 70);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);

        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = '700 13px system-ui, sans-serif';
        g.fillStyle = 'rgba(255,250,235,0.9)';
        g.fillText(`🫧 ${caught} jell${caught === 1 ? 'y' : 'ies'}`, 12, H - 12);
      },
    };
    return game;
  },
};
