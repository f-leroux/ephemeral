// Disco Pinball — a 70s disco pinball table. Left and right work the two flippers (only one can be
// up at a time, and a flipper held up too long overheats and drops, so you can't just cradle the
// ball). Pop bumpers, slingshots and a mirror ball send the ball flying; let any ball slip between
// the flippers and the run is over. The table gets steeper (stronger gravity) over the minute, a
// second ball joins at 21s and a third at 43s (the kickout hole flashes "MULTIBALL" first), and
// from 26s the mirror ball glides from side to side.

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

const R = 9; // ball radius
const SUB = 4; // physics substeps per update
const FL = 66; // flipper length
const FR0 = 10; // flipper radius at the pivot
const FR1 = 6; // ... and at the tip
const REST = 0.52; // flipper angle at rest (down towards the drain)
const UP = -0.44; // ... and raised
const MAX_HOLD = 1.1; // a flipper held longer than this overheats and drops
const SAVE = 4; // the ball saver closes the drain for the first seconds
const HOLE = { x: 180, y: 66 };
const MIRROR = { x: 180, y: 166, r: 24 };
const BUMPERS = [
  { x: 116, y: 256, r: 20 },
  { x: 244, y: 256, r: 20 },
  { x: 180, y: 326, r: 20 },
];
const PIVOTS = [
  { x: 106, y: 560, side: -1 },
  { x: 254, y: 560, side: 1 },
];
const EJECTS = [0.5, 21, 43]; // when each ball comes out of the kickout hole
const WARN = 2.2; // the hole flashes this long before a new ball

const gravity = (t) => lerp(600, 1000, progress(t, 60, 1.2));
const VMAX = 1500;

const PINK = '#ff4fb8';
const GOLD = '#ffc94a';
const TEAL = '#3fe0d0';
const VIOLET = '#9b6bff';
const SPARKS = ['#ffffff', '#ffe08a', '#ff8fd6', '#9ff5ec'];

// ---------- the table outline ----------

function arcPts(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// the playfield's edge, from the left flipper's pivot round the top to the right one
// (the inlanes meet the top of each pivot, so a ball can't wedge itself there)
const OUTLINE = [
  [112, 552],
  [16, 478],
  [16, 124],
  ...arcPts(124, 124, 108, Math.PI, Math.PI * 1.5, 10).slice(1),
  ...arcPts(236, 124, 108, Math.PI * 1.5, Math.PI * 2, 10),
  [344, 478],
  [248, 552],
];

// slingshots above the flippers: the long inner edge kicks
const SLINGS = [
  [[48, 414], [48, 476], [88, 510]],
  [[312, 414], [312, 476], [272, 510]],
];

const WALLS = [];
for (let i = 0; i < OUTLINE.length - 1; i++) WALLS.push({ a: OUTLINE[i], b: OUTLINE[i + 1], e: 0.5, kick: 0 });
for (const [A, B, C] of SLINGS) {
  WALLS.push({ a: A, b: C, e: 0.6, kick: 430, sling: true });
  WALLS.push({ a: A, b: B, e: 0.5, kick: 0 });
  WALLS.push({ a: B, b: C, e: 0.5, kick: 0 });
}
// the apron's edges under the flippers, so a ball can't sneak out beneath a pivot
WALLS.push({ a: [112, 552], b: [104, 572], e: 0.4, kick: 0 });
WALLS.push({ a: [104, 572], b: [132, 640], e: 0.4, kick: 0 });
WALLS.push({ a: [248, 552], b: [256, 572], e: 0.4, kick: 0 });
WALLS.push({ a: [256, 572], b: [228, 640], e: 0.4, kick: 0 });
// short guide posts either side of the kickout hole
WALLS.push({ a: [150, 44], b: [150, 74], e: 0.5, kick: 0 });
WALLS.push({ a: [210, 44], b: [210, 74], e: 0.5, kick: 0 });
const SAVER = { a: [112, 606], b: [248, 606], e: 0.5, kick: 620 };

// ---------- art ----------

function tracePath(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
}

function paintTable(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the cabinet's wooden side rails, outside the playfield
    const wood = g.createLinearGradient(0, 0, W, 0);
    wood.addColorStop(0, '#2a0f22');
    wood.addColorStop(0.5, '#4a1a38');
    wood.addColorStop(1, '#2a0f22');
    g.fillStyle = wood;
    g.fillRect(0, 0, W, H);

    // the playfield
    g.save();
    tracePath(g, [...OUTLINE, [254, 640], [106, 640]]);
    g.closePath();
    g.clip();
    const pf = g.createLinearGradient(0, 0, 0, H);
    pf.addColorStop(0, '#3a0f55');
    pf.addColorStop(0.45, '#25093f');
    pf.addColorStop(1, '#12041f');
    g.fillStyle = pf;
    g.fillRect(0, 0, W, H);
    // a sunburst from the mirror ball
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * Math.PI * 2;
      const a1 = a0 + Math.PI / 28;
      g.fillStyle = i % 2 ? 'rgba(255,79,184,0.07)' : 'rgba(255,201,74,0.06)';
      g.beginPath();
      g.moveTo(MIRROR.x, MIRROR.y);
      g.lineTo(MIRROR.x + Math.cos(a0) * 700, MIRROR.y + Math.sin(a0) * 700);
      g.lineTo(MIRROR.x + Math.cos(a1) * 700, MIRROR.y + Math.sin(a1) * 700);
      g.closePath();
      g.fill();
    }
    const halo = g.createRadialGradient(MIRROR.x, MIRROR.y, 10, MIRROR.x, MIRROR.y, 180);
    halo.addColorStop(0, 'rgba(255,170,230,0.35)');
    halo.addColorStop(1, 'rgba(255,170,230,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    // a light-up dance floor in the middle of the table
    const cols = ['#ff4fb8', '#ffc94a', '#3fe0d0', '#9b6bff'];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const x = 96 + c * 28;
        const y = 380 + r * 24;
        g.fillStyle = cols[(r + c * 3) % 4];
        g.globalAlpha = 0.16;
        g.fillRect(x + 1, y + 1, 26, 22);
        g.globalAlpha = 0.3;
        g.fillRect(x + 1, y + 1, 26, 2);
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.strokeRect(96, 380, 168, 120);
    // painted stars and glitter
    for (let i = 0; i < 160; i++) {
      g.fillStyle = rng.pick(['rgba(255,255,255,0.5)', 'rgba(255,200,240,0.45)', 'rgba(255,220,120,0.4)']);
      g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(0.8, 2), rng.range(0.8, 2));
    }
    const star = (x, y, s, col) => {
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 ? s * 0.28 : s;
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    for (const [x, y, s] of [[44, 160, 9], [316, 168, 8], [60, 330, 7], [300, 338, 9], [180, 222, 6], [90, 196, 5], [270, 204, 5]]) {
      star(x, y, s, 'rgba(255,230,160,0.55)');
    }
    // lamp inserts: arrows pointing up the table at the bumpers
    for (const [x, y, rot] of [[70, 370, -0.35], [290, 370, 0.35]]) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(255,201,74,0.22)';
      g.strokeStyle = 'rgba(255,230,160,0.4)';
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(11, 0);
      g.lineTo(4, 0);
      g.lineTo(4, 12);
      g.lineTo(-4, 12);
      g.lineTo(-4, 0);
      g.lineTo(-11, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    // the D·I·S·C·O inserts, one lights every 12 seconds
    for (let i = 0; i < 5; i++) {
      const x = 108 + i * 36;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x, 536 - Math.abs(i - 2) * -6 - 18, 12, 0, Math.PI * 2);
      g.fill();
    }
    // the kickout hole
    const hole = g.createRadialGradient(HOLE.x, HOLE.y, 2, HOLE.x, HOLE.y, 16);
    hole.addColorStop(0, '#000');
    hole.addColorStop(0.7, '#0a0210');
    hole.addColorStop(1, 'rgba(255,201,74,0.9)');
    g.fillStyle = hole;
    g.beginPath();
    g.arc(HOLE.x, HOLE.y, 15, 0, Math.PI * 2);
    g.fill();
    // inlane shading
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const s of [-1, 1]) {
      g.beginPath();
      const x0 = s < 0 ? 16 : 344;
      g.moveTo(x0, 478);
      g.lineTo(x0 + s * -32, 478 + 26);
      g.lineTo(s < 0 ? 112 : 248, 552);
      g.closePath();
      g.fill();
    }
    g.restore();

    // chrome rails along the edge
    const chrome = (pts, w) => {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = '#3b3550';
      g.lineWidth = w + 3;
      tracePath(g, pts);
      g.stroke();
      g.strokeStyle = '#c9c4dc';
      g.lineWidth = w;
      tracePath(g, pts);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = w * 0.3;
      tracePath(g, pts.map(([x, y]) => [x - 0.8, y - 0.8]));
      g.stroke();
    };
    chrome(OUTLINE, 6);
    chrome([[150, 44], [150, 74]], 5);
    chrome([[210, 44], [210, 74]], 5);

    // slingshot plastics with white rubber on the kicking edge
    for (const [A, B, C] of SLINGS) {
      const grd = g.createLinearGradient(A[0], A[1], C[0], C[1]);
      grd.addColorStop(0, '#ff6fc6');
      grd.addColorStop(1, '#b0237a');
      g.fillStyle = grd;
      tracePath(g, [A, B, C]);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1.5;
      g.stroke();
      g.strokeStyle = '#f4eefa';
      g.lineWidth = 5;
      g.lineCap = 'round';
      tracePath(g, [A, C]);
      g.stroke();
      g.fillStyle = '#ffd86a';
      for (const P of [A, B, C]) {
        g.beginPath();
        g.arc(P[0], P[1], 3.4, 0, Math.PI * 2);
        g.fill();
      }
      // a little star on the plastic
      const cx = (A[0] + B[0] + C[0]) / 3;
      const cy = (A[1] + B[1] + C[1]) / 3;
      star(cx, cy, 7, 'rgba(255,240,200,0.8)');
    }

    // the apron at the bottom
    g.fillStyle = '#1b0a26';
    for (const s of [-1, 1]) {
      g.beginPath();
      if (s < 0) {
        g.moveTo(0, 478);
        g.lineTo(16, 478);
        g.lineTo(112, 552);
        g.lineTo(104, 572);
        g.lineTo(132, 640);
        g.lineTo(0, 640);
      } else {
        g.moveTo(W, 478);
        g.lineTo(344, 478);
        g.lineTo(248, 552);
        g.lineTo(256, 572);
        g.lineTo(228, 640);
        g.lineTo(W, 640);
      }
      g.closePath();
      const ap = g.createLinearGradient(0, 478, 0, 640);
      ap.addColorStop(0, '#6a3a86');
      ap.addColorStop(1, '#2a1238');
      g.fillStyle = ap;
      g.fill();
      g.strokeStyle = 'rgba(255,220,250,0.35)';
      g.lineWidth = 1.5;
      g.stroke();
    }
    // the drain
    const drain = g.createLinearGradient(0, 590, 0, 640);
    drain.addColorStop(0, 'rgba(0,0,0,0)');
    drain.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = drain;
    g.fillRect(106, 590, 148, 50);
    g.font = '800 9px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,220,250,0.55)';
    g.fillText('BALL SAVE', 180, 626);
  }, 1.5);
}

function paintBumper(lit) {
  return makeSprite(48, 48, (g) => {
    // skirt
    g.fillStyle = lit ? '#ffd9f0' : '#5a1446';
    g.beginPath();
    g.arc(0, 1, 22, 0, Math.PI * 2);
    g.fill();
    const body = g.createRadialGradient(-5, -5, 2, 0, 0, 20);
    body.addColorStop(0, lit ? '#ffffff' : '#ffe6a0');
    body.addColorStop(0.5, lit ? '#ffb3e3' : GOLD);
    body.addColorStop(1, lit ? '#ff4fb8' : '#a8641a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, 19, 0, Math.PI * 2);
    g.fill();
    const cap = g.createRadialGradient(-4, -5, 1, 0, 0, 13);
    cap.addColorStop(0, '#ffffff');
    cap.addColorStop(0.6, lit ? '#ffd0ef' : '#ff8fd6');
    cap.addColorStop(1, lit ? '#ff6fc6' : '#c2318c');
    g.fillStyle = cap;
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff6d6';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? 2.6 : 7;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, 17, Math.PI * 1.1, Math.PI * 1.55);
    g.stroke();
  }, 3);
}

function paintMirror() {
  const r = MIRROR.r;
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    const base = g.createRadialGradient(-8, -9, 2, 0, 0, r);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.35, '#d6d2e8');
    base.addColorStop(0.8, '#6f6890');
    base.addColorStop(1, '#2c2640');
    g.fillStyle = base;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.clip();
    // facets: rows of little mirror tiles curving round the sphere
    for (let la = -5; la <= 5; la++) {
      const y = (la / 5.5) * r;
      const w = Math.sqrt(Math.max(0, r * r - y * y));
      const n = Math.max(3, Math.round(w / 3.4));
      for (let i = 0; i < n; i++) {
        const x = -w + ((i + 0.5) / n) * w * 2;
        const lum = 0.35 + 0.65 * Math.max(0, 1 - Math.hypot(x + 8, y + 9) / (r * 1.4));
        g.fillStyle = `rgba(${Math.round(255 * lum)},${Math.round(240 * lum)},${Math.round(255 * lum)},0.55)`;
        g.fillRect(x - 1.5, y - 1.8, 3, 3.6);
      }
      g.strokeStyle = 'rgba(30,20,50,0.5)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-w, y + 2.2);
      g.lineTo(w, y + 2.2);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    g.stroke();
  }, 3);
}

function paintBall() {
  return makeSprite(R * 2 + 2, R * 2 + 2, (g) => {
    const b = g.createRadialGradient(-3, -3.5, 0.5, 0, 0, R);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(0.3, '#e4e2ee');
    b.addColorStop(0.75, '#8a86a0');
    b.addColorStop(1, '#3a3650');
    g.fillStyle = b;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    // the table's pink reflected in the bottom of the ball
    g.fillStyle = 'rgba(255,90,190,0.35)';
    g.beginPath();
    g.ellipse(1, 5, 5.5, 2.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(-3, -3.8, 2.6, 1.6, -0.6, 0, Math.PI * 2);
    g.fill();
  }, 4);
}

// a flipper pointing right from its pivot (the pivot sits 12 units in from the sprite's left edge)
function paintFlipper() {
  return makeSprite(FL + 24, 26, (g) => {
    g.translate(-(FL + 24) / 2 + 12, 0);
    const shape = () => {
      g.beginPath();
      g.arc(0, 0, FR0, Math.PI / 2, Math.PI * 1.5);
      g.lineTo(FL, -FR1);
      g.arc(FL, 0, FR1, -Math.PI / 2, Math.PI / 2);
      g.closePath();
    };
    g.fillStyle = '#d42a5e';
    shape();
    g.fill();
    g.save();
    g.scale(0.84, 0.72);
    const body = g.createLinearGradient(0, -10, 0, 10);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.6, '#ece6f4');
    body.addColorStop(1, '#a89cc0');
    g.fillStyle = body;
    shape();
    g.fill();
    g.restore();
    g.fillStyle = '#ffc94a';
    g.beginPath();
    g.arc(0, 0, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a4a10';
    g.beginPath();
    g.arc(0, 0, 1.4, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

function paintBulb(on) {
  return makeSprite(12, 12, (g) => {
    const b = g.createRadialGradient(-1, -1, 0.5, 0, 0, 5);
    b.addColorStop(0, on ? '#ffffff' : '#7a5a40');
    b.addColorStop(0.5, on ? '#ffe28a' : '#4a3020');
    b.addColorStop(1, on ? '#ff9a2a' : '#2a1810');
    g.fillStyle = b;
    g.beginPath();
    g.arc(0, 0, 4.5, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// ---------- the game ----------

export default {
  id: 'pinball',
  title: 'Disco Pinball',
  emoji: '🪩',
  tagline: 'Left and right work the flippers. Let one ball drain and it’s over.',
  colors: { bg: '#25093f', fg: '#fff2fb', accent: '#ff4fb8' },

  // French filter house in B minor (Bm7 – Gmaj7 – Em7 – F♯7), 128 BPM: four-on-the-floor kick,
  // offbeat hats, a syncopated disco octave bass and pumping sawtooth chords from the first bar,
  // with the classic filter opening all the way across the minute; then claps, open hats and a
  // string pad, then a square "vocoder" hook with echoes, and a finale with a shaker, a triangle
  // 16th arpeggio and the hook doubled an octave down. 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("b1*4").add(note(12)).s("sine").decay(0.2).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ white]*4").decay(0.16).sustain(0).hpf(6500).gain(0.03)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5000).gain(0.15).room(0.3)
      const bass = note("<b2 g2 e2 fs2>").struct("x x ~ x ~ x x ~ x x ~ x ~ x ~ x")
        .add(note("<[0 12 0 12 0 12 0 12]>")).s("sawtooth").decay(0.12).sustain(0.2).release(0.04)
        .lpf(saw.range(600, 1600).slow(32)).lpq(4).gain(0.32)
      const chords = "<[b3,d4,fs4,a4] [g3,b3,d4,fs4] [e3,g3,b3,d4] [fs3,as3,cs4,e4]>"
      const pump = note(chords).struct("[~ x]*4").s("sawtooth").decay(0.22).sustain(0.4).release(0.05)
        .gain("[0.06 0.09]*4").lpf(saw.range(500, 3400).slow(32)).lpq(6).pan(0.45).room(0.2)
      const strings = note(chords).add(note(12)).s("triangle").attack(0.3).decay(0.5).sustain(0.7).release(0.4)
        .lpf(3000).gain(0.06).pan(0.6).room(0.4)
      const tune = "<[fs5 ~ fs5 a5 ~ b5 ~ a5] [g5 ~ fs5 ~ d5 ~ b4 ~] [e5 ~ g5 ~ b5 ~ a5 g5] [fs5 ~ e5 ~ cs5 ~ as4 ~]>"
      const lead = note(tune).s("square").decay(0.18).sustain(0.25).release(0.06).lpf(2200).gain(0.07)
        .room(0.3).delay(0.3).delaytime(0.35).delayfeedback(0.3).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.2).release(0.05)
        .lpf(1500).gain(0.05).pan(0.4)
      const arp = note("<[b4 d5 fs5 a5]*4 [g4 b4 d5 fs5]*4 [e4 g4 b4 d5]*4 [fs4 as4 cs5 e5]*4>").s("triangle")
        .decay(0.08).sustain(0).lpf(3800).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, pump)],
      [8, stack(kick, hats, open, clap, bass, pump, strings)],
      [8, stack(kick, hats, open, clap, bass, pump, strings, lead)],
      [8, stack(kick, hats, open, clap, shaker, bass, pump, strings, lead, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const table = paintTable(W, H, art);
    const bumperArt = paintBumper(false);
    const bumperLit = paintBumper(true);
    const mirrorArt = paintMirror();
    const ballArt = paintBall();
    const flipperArt = paintFlipper();
    const bulbOn = paintBulb(true);
    const bulbOff = paintBulb(false);
    const pinkGlow = glowSprite('rgba(255,80,190,1)', 40);
    const goldGlow = glowSprite('rgba(255,200,90,1)', 40);
    const tealGlow = glowSprite('rgba(70,230,215,1)', 40);
    const whiteGlow = glowSprite('rgba(255,250,255,1)', 30);
    const redGlow = glowSprite('rgba(255,40,40,1)', 40);
    const vignette = vignetteSprite(W, H, 0.55, '10,0,20');
    const fx = createParticles();
    const trail = createParticles();

    // every ball's way out of the kickout hole is fixed in advance
    const ejects = EJECTS.map((at) => {
      const s = plan.chance(0.5) ? -1 : 1;
      return { at, vx: s * plan.range(170, 260), vy: plan.range(40, 120), done: false };
    });

    const balls = [];
    const flippers = PIVOTS.map((p) => ({ ...p, a: REST, prev: 0, w: 0, up: false, held: 0, locked: false }));
    const bumperFlash = BUMPERS.map(() => 0);
    const slingFlash = [0, 0];
    let mirrorX = MIRROR.x;
    let mirrorVx = 0;
    let clock = 0;
    let saverFlash = 0;
    let deadAt = null;
    let flicker = 0;

    // light spots thrown round the table by the mirror ball
    const spots = [];
    for (let i = 0; i < 9; i++) spots.push({ a: (i / 9) * Math.PI * 2, d: 60 + (i % 3) * 90, glow: [pinkGlow, goldGlow, tealGlow][i % 3] });

    // the geometric angle of a flipper (right-hand ones are mirrored)
    const theta = (f) => (f.side < 0 ? f.a : Math.PI - f.a);

    const hitSegment = (b, ax, ay, bx, by, e, kick) => {
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy;
      const u = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / L2, 0, 1);
      const cx = ax + dx * u;
      const cy = ay + dy * u;
      let nx = b.x - cx;
      let ny = b.y - cy;
      const d = Math.hypot(nx, ny);
      if (d >= R || d === 0) return false;
      nx /= d;
      ny /= d;
      b.x = cx + nx * R;
      b.y = cy + ny * R;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= (1 + e) * vn * nx;
        b.vy -= (1 + e) * vn * ny;
        if (kick && vn < -60) {
          b.vx += nx * kick;
          b.vy += ny * kick;
          return 'kick';
        }
      }
      return true;
    };

    const hitCircle = (b, cx, cy, r, kick, cvx = 0) => {
      let nx = b.x - cx;
      let ny = b.y - cy;
      const d = Math.hypot(nx, ny);
      if (d >= r + R || d === 0) return false;
      nx /= d;
      ny /= d;
      b.x = cx + nx * (r + R);
      b.y = cy + ny * (r + R);
      const rvx = b.vx - cvx;
      const vn = rvx * nx + b.vy * ny;
      if (vn < 0) {
        const out = Math.max(kick, -vn * 0.7);
        b.vx += (out - vn) * nx;
        b.vy += (out - vn) * ny;
      }
      return true;
    };

    const hitFlipper = (b, f) => {
      const th = theta(f);
      const tx = f.x + Math.cos(th) * FL;
      const ty = f.y + Math.sin(th) * FL;
      const dx = tx - f.x;
      const dy = ty - f.y;
      const u = clamp(((b.x - f.x) * dx + (b.y - f.y) * dy) / (FL * FL), 0, 1);
      const cx = f.x + dx * u;
      const cy = f.y + dy * u;
      const rr = lerp(FR0, FR1, u) + R;
      let nx = b.x - cx;
      let ny = b.y - cy;
      const d = Math.hypot(nx, ny);
      if (d >= rr || d === 0) return;
      nx /= d;
      ny /= d;
      b.x = cx + nx * rr;
      b.y = cy + ny * rr;
      // the flipper's surface moves with it
      const svx = -f.w * (cy - f.y);
      const svy = f.w * (cx - f.x);
      const rvx = b.vx - svx;
      const rvy = b.vy - svy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = 0.35;
        b.vx = rvx - (1 + e) * vn * nx + svx;
        b.vy = rvy - (1 + e) * vn * ny + svy;
        if (Math.abs(f.w) > 5 && Math.random() < 0.6) {
          fx.burst(cx + nx * FR1, cy + ny * FR1, { count: 4, speed: 120, life: 0.35, size: 2.5, colors: SPARKS });
        }
      }
    };

    const step = (dt, t, game) => {
      const gv = gravity(t);
      // the mirror ball starts gliding from side to side at 26s
      const nx = t < 26 ? MIRROR.x : MIRROR.x + 66 * Math.sin((t - 26) * 1.15) * Math.min(1, (t - 26) / 3);
      mirrorVx = (nx - mirrorX) / dt;
      mirrorX = nx;
      for (const f of flippers) {
        const target = f.up ? UP : REST;
        const sp = (f.up ? 34 : 24) * dt;
        f.a = f.a > target ? Math.max(target, f.a - sp) : Math.min(target, f.a + sp);
        const th = theta(f);
        f.w = (th - f.prev) / dt;
        f.prev = th;
      }
      for (const b of balls) {
        b.vy += gv * dt;
        const v = Math.hypot(b.vx, b.vy);
        if (v > VMAX) {
          b.vx *= VMAX / v;
          b.vy *= VMAX / v;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        for (const wl of WALLS) {
          const hit = hitSegment(b, wl.a[0], wl.a[1], wl.b[0], wl.b[1], wl.e, wl.kick);
          if (hit === 'kick') {
            const k = SLINGS.findIndex((s) => s[0] === wl.a);
            slingFlash[k] = 1;
            fx.burst(b.x, b.y, { count: 10, speed: 200, life: 0.5, size: 3, colors: SPARKS });
          }
        }
        if (t < SAVE && hitSegment(b, SAVER.a[0], SAVER.a[1], SAVER.b[0], SAVER.b[1], SAVER.e, SAVER.kick)) saverFlash = 1;
        BUMPERS.forEach((bp, i) => {
          if (hitCircle(b, bp.x, bp.y, bp.r, 520)) {
            if (bumperFlash[i] < 0.6) fx.burst(b.x, b.y, { count: 12, speed: 220, life: 0.5, size: 3, colors: SPARKS });
            bumperFlash[i] = 1;
          }
        });
        if (hitCircle(b, mirrorX, MIRROR.y, MIRROR.r, 260, mirrorVx)) b.mirror = 1;
        for (const f of flippers) hitFlipper(b, f);
        // never let a squeeze push a ball through the cabinet's sides
        if (b.x < 16 + R) {
          b.x = 16 + R;
          b.vx = Math.abs(b.vx) * 0.5;
        } else if (b.x > 344 - R) {
          b.x = 344 - R;
          b.vx = -Math.abs(b.vx) * 0.5;
        }
        if (b.y < 16 + R) {
          b.y = 16 + R;
          b.vy = Math.abs(b.vy) * 0.5;
        }
      }
      // balls knock into each other
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const c = balls[j];
          let nx2 = c.x - a.x;
          let ny2 = c.y - a.y;
          const d = Math.hypot(nx2, ny2);
          if (d >= R * 2 || d === 0) continue;
          nx2 /= d;
          ny2 /= d;
          const push = (R * 2 - d) / 2;
          a.x -= nx2 * push;
          a.y -= ny2 * push;
          c.x += nx2 * push;
          c.y += ny2 * push;
          const rel = (c.vx - a.vx) * nx2 + (c.vy - a.vy) * ny2;
          if (rel < 0) {
            a.vx += rel * nx2 * 0.95;
            a.vy += rel * ny2 * 0.95;
            c.vx -= rel * nx2 * 0.95;
            c.vy -= rel * ny2 * 0.95;
          }
        }
      }
      for (const b of balls) {
        if (b.y > H + 22) {
          game.dead = true;
          game.deathReason = balls.length > 1 ? 'One of the balls slipped down the drain.' : 'The ball slipped between the flippers.';
          deadAt = { x: clamp(b.x, 120, 240), y: H - 20 };
          fx.burst(deadAt.x, deadAt.y, { count: 30, speed: 260, life: 0.9, size: 3.5, gravity: 300, colors: ['#ff4f6a', '#ffffff', '#ffc94a'] });
          return;
        }
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      for (let i = 0; i < bumperFlash.length; i++) bumperFlash[i] = Math.max(0, bumperFlash[i] - dt * 5);
      for (let i = 0; i < 2; i++) slingFlash[i] = Math.max(0, slingFlash[i] - dt * 6);
      saverFlash = Math.max(0, saverFlash - dt * 4);
      for (const s of spots) s.a += dt * 0.6;
      fx.update(dt);
      trail.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',
      balls,

      update(dt, dir, t) {
        updateCosmetic(dt);
        for (const e of ejects) {
          if (!e.done && t >= e.at) {
            e.done = true;
            balls.push({ x: HOLE.x, y: HOLE.y + 4, vx: e.vx, vy: e.vy, mirror: 0 });
            fx.burst(HOLE.x, HOLE.y, { count: 22, speed: 200, life: 0.7, size: 3, colors: SPARKS });
          }
        }
        for (const f of flippers) {
          const want = dir === f.side;
          if (!want) {
            f.held = 0;
            f.locked = false;
          } else {
            f.held += dt;
            if (f.held > MAX_HOLD) f.locked = true;
          }
          f.up = want && !f.locked;
        }
        const h = dt / SUB;
        for (let i = 0; i < SUB && !this.dead; i++) step(h, t + i * h, this);
        for (const b of balls) {
          if (Math.hypot(b.vx, b.vy) > 650 && Math.random() < dt * 40) {
            trail.burst(b.x, b.y, { count: 1, speed: 10, life: 0.25, size: 5, round: true, colors: ['rgba(255,150,220,0.5)', 'rgba(255,220,140,0.45)'] });
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        flicker += dt;
        if (deadAt && Math.random() < dt * 8) {
          fx.burst(deadAt.x, deadAt.y, { count: 2, speed: 80, life: 0.6, size: 3, colors: ['#ff4f6a', '#ffc94a'] });
        }
      },

      render(g, t) {
        drawSprite(g, table, W / 2, H / 2);
        const off = this.dead ? Math.sin(flicker * 40) > 0.2 || flicker > 0.6 : false;
        const lights = off ? 0.25 : 1;

        // light spots from the mirror ball sweeping the table, and the dance floor lighting up
        g.globalCompositeOperation = 'lighter';
        for (const s of spots) {
          drawSprite(g, s.glow, mirrorX + Math.cos(s.a) * s.d * 1.1, MIRROR.y + 140 + Math.sin(s.a) * s.d * 0.9, { size: 44, alpha: 0.22 * lights });
        }
        const beat = Math.floor(clock * (128 / 60));
        const cols = [pinkGlow, goldGlow, tealGlow];
        for (let k = 0; k < 4; k++) {
          const c = (beat * 7 + k * 11) % 6;
          const r = (beat * 3 + k * 5) % 5;
          drawSprite(g, cols[(beat + k) % 3], 96 + c * 28 + 14, 380 + r * 24 + 12, { size: 56, alpha: 0.32 * lights });
        }
        g.globalCompositeOperation = 'source-over';

        // chase lights round the top arch
        for (let i = 0; i < 15; i++) {
          const a = Math.PI * 1.08 + (i / 14) * Math.PI * 0.84;
          const x = 180 + Math.cos(a) * 150;
          const y = 150 + Math.sin(a) * 118;
          const on = !off && (i + Math.floor(clock * 10)) % 3 === 0;
          drawSprite(g, on ? bulbOn : bulbOff, x, y);
          if (on) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, goldGlow, x, y, { size: 22, alpha: 0.6 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // D·I·S·C·O letters: one more lights every 12 seconds
        g.font = '900 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = 0; i < 5; i++) {
          const x = 108 + i * 36;
          const y = 518 + Math.abs(i - 2) * 6;
          const lit = !off && t >= (i + 1) * 12 - 0.01;
          const next = !lit && t >= i * 12 && t < (i + 1) * 12;
          if (lit || (next && Math.sin(clock * 8) > 0)) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, i % 2 ? tealGlow : pinkGlow, x, y, { size: 40, alpha: lit ? 0.75 : 0.35 });
            g.globalCompositeOperation = 'source-over';
          }
          g.fillStyle = lit ? '#ffffff' : 'rgba(255,220,250,0.45)';
          g.fillText('DISCO'[i], x, y + 0.5);
        }

        // the kickout hole flashes before each new ball
        for (const e of ejects) {
          if (e.done || e.at < 1 || t < e.at - WARN) continue;
          const k = 0.5 + 0.5 * Math.sin(clock * 22);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, goldGlow, HOLE.x, HOLE.y, { size: 70 + 20 * k, alpha: 0.5 + 0.4 * k });
          g.globalCompositeOperation = 'source-over';
          g.font = '900 15px system-ui, sans-serif';
          g.fillStyle = 'rgba(40,0,40,0.6)';
          g.fillText('MULTIBALL!', HOLE.x + 1, HOLE.y + 33);
          g.fillStyle = k > 0.5 ? '#fff2a8' : '#ff8fd6';
          g.fillText('MULTIBALL!', HOLE.x, HOLE.y + 32);
        }

        // slingshot flashes
        SLINGS.forEach(([A, , C], i) => {
          if (!slingFlash[i]) return;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, pinkGlow, (A[0] + C[0]) / 2, (A[1] + C[1]) / 2, { size: 90, alpha: slingFlash[i] * 0.8 });
          g.globalCompositeOperation = 'source-over';
        });

        // the ball saver bar
        if (t < SAVE && !this.dead) {
          const a = 0.55 + 0.35 * Math.sin(clock * 12) + saverFlash * 0.3;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, tealGlow, 180, SAVER.a[1], { size: 120, alpha: 0.35 * a });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(150,255,240,${clamp(a, 0, 1)})`;
          g.fillRect(SAVER.a[0], SAVER.a[1] - 2, SAVER.b[0] - SAVER.a[0], 4);
        }

        // pop bumpers
        BUMPERS.forEach((bp, i) => {
          const f = bumperFlash[i];
          if (f > 0) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, pinkGlow, bp.x, bp.y, { size: 110, alpha: f * 0.9 });
            g.globalCompositeOperation = 'source-over';
          }
          drawSprite(g, f > 0.3 ? bumperLit : bumperArt, bp.x, bp.y, { size: 48 * (1 + f * 0.08) });
        });

        // the mirror ball on its stalk
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(mirrorX + 4, MIRROR.y + 6, MIRROR.r, MIRROR.r * 0.9, 0, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, pinkGlow, mirrorX, MIRROR.y, { size: 120, alpha: 0.3 * lights });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, mirrorArt, mirrorX, MIRROR.y);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const a = clock * 1.7 + i * 1.9;
          const gx = mirrorX + Math.cos(a) * MIRROR.r * 0.6;
          const gy = MIRROR.y + Math.sin(a * 1.3) * MIRROR.r * 0.55;
          const tw = Math.max(0, Math.sin(clock * 5 + i * 2.3));
          drawSprite(g, whiteGlow, gx, gy, { size: 18 * tw + 2, alpha: 0.9 * tw });
        }
        g.globalCompositeOperation = 'source-over';

        // flippers, glowing red as they overheat
        for (const f of flippers) {
          const heat = clamp(f.held / MAX_HOLD, 0, 1);
          if (f.up && heat > 0.45) {
            const th = theta(f);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, f.x + Math.cos(th) * FL * 0.5, f.y + Math.sin(th) * FL * 0.5, { size: 90, alpha: (heat - 0.45) * 1.4 });
            g.globalCompositeOperation = 'source-over';
          }
          g.save();
          g.translate(f.x, f.y);
          if (f.side > 0) g.scale(-1, 1);
          g.rotate(f.a);
          g.drawImage(flipperArt.canvas, -12, -13, FL + 24, 26);
          g.restore();
        }

        // balls
        trail.render(g, true);
        g.globalCompositeOperation = 'lighter';
        for (const b of balls) drawSprite(g, whiteGlow, b.x, b.y, { size: 40, alpha: 0.3 });
        g.globalCompositeOperation = 'source-over';
        for (const b of balls) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.ellipse(b.x + 3, b.y + 4, R, R * 0.85, 0, 0, Math.PI * 2);
          g.fill();
          drawSprite(g, ballArt, b.x, b.y);
        }
        fx.render(g, true);

        if (this.dead && deadAt) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, deadAt.x, deadAt.y, { size: 160, alpha: 0.6 });
          g.globalCompositeOperation = 'source-over';
        }

        // balls in play, on the apron
        g.font = '800 12px system-ui, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = 'rgba(255,230,250,0.85)';
        g.fillText(`BALLS ${balls.length}`, 14, H - 14);

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
