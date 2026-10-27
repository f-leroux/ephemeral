// Halfpipe — a skater rides a vert ramp at a beachside skatepark. You never walk: you pump. Holding
// the way you're rolling pushes you along (more speed, so you fly higher up the next wall); holding
// against it brakes you (lower). The push only bites on the ramp, not in the air, so every height is
// set during the half a second you spend crossing the bottom. On each wall in turn, a balloon floats
// at one height and a camera drone hovers above it: fly high enough to pop the balloon, but not so
// high that you hit the drone. The windows narrow, swing from low to high and back, the swings get
// quicker (gravity creeps up), and after 26s balloons and drones bob up and down. A marker on the
// wall you're heading for shows how high you'd fly if you let go now. Every window is planned around
// a hidden reference ride with the skater's own physics, so there's always a way through.

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

const CX = 180; // the ramp's centre
const YB = 574; // the flat bottom's surface
const HALF = 42; // half the flat bottom
const R = 96; // transition radius: the lips sit R above the bottom
const ARC = (Math.PI * R) / 2;
const EDGE = HALF + ARC; // arc length from the centre to a lip
const LIPX = HALF + R; // a lip's distance from the centre
const STEP = 1 / 120;
const PUMP = 0.56; // push strength, as a fraction of gravity
const DRAG = 0.045;
const FREE = 4; // the first swings have no balloons: time to get going
const BALLOON_UP = 9; // a balloon is drawn this far above the height that pops it
const DRONE_UP = 12; // a drone is drawn this far above the height that hits it

const gAt = (t) => lerp(820, 1180, progress(t, 60, 1.1));

// height above the flat bottom at arc length s
const hOf = (s) => {
  const a = Math.abs(s);
  if (a <= HALF) return 0;
  if (a <= EDGE) return R * (1 - Math.cos((a - HALF) / R));
  return R + a - EDGE;
};
// arc length (on one side, positive) at height h
const sOfH = (h) => (h <= 0 ? HALF : h <= R ? HALF + R * Math.acos(1 - h / R) : EDGE + h - R);
// screen position, slope angle (0 flat … π/2 vertical) and side
const geo = (s) => {
  const a = Math.abs(s);
  const sg = s < 0 ? -1 : 1;
  if (a <= HALF) return { x: CX + s, y: YB, phi: 0, sg };
  if (a <= EDGE) {
    const phi = (a - HALF) / R;
    return { x: CX + sg * (HALF + R * Math.sin(phi)), y: YB - R * (1 - Math.cos(phi)), phi, sg };
  }
  return { x: CX + sg * LIPX, y: YB - R - (a - EDGE), phi: Math.PI / 2, sg };
};
// a point at height h on one side, pushed `off` along the normal (positive = into the open ramp)
const wallPoint = (side, h, off) => {
  const q = geo(side * sOfH(h));
  return { x: q.x - q.sg * Math.sin(q.phi) * off, y: q.y - Math.cos(q.phi) * off, phi: q.phi };
};
// the ramp surface's y at screen x (for the bail)
const surfaceY = (x) => {
  const dx = Math.abs(x - CX);
  if (dx <= HALF) return YB;
  if (dx < LIPX) return YB - R + Math.sqrt(Math.max(0, R * R - (dx - HALF) ** 2));
  return YB - R;
};

function physics(st, dir, g, dt) {
  const a = Math.abs(st.s);
  const sg = st.s < 0 ? -1 : 1;
  let sin = 0;
  let cos = 1;
  if (a > EDGE) {
    sin = 1;
    cos = 0;
  } else if (a > HALF) {
    const phi = (a - HALF) / R;
    sin = Math.sin(phi);
    cos = Math.cos(phi);
  }
  st.v += (-g * sin * sg + dir * PUMP * g * cos - DRAG * st.v) * dt;
  st.s += st.v * dt;
}

// how high the skater will fly at the next turnaround if they let go now
function predict(st, g) {
  const q = { s: st.s, v: st.v };
  const v0 = q.v;
  if (v0 === 0) return { h: hOf(q.s), side: Math.sign(q.s) };
  for (let i = 0; i < 400; i++) {
    const a = Math.abs(q.s);
    if (a > EDGE && Math.sign(q.v) === Math.sign(q.s)) {
      // flying straight up: no need to step it out
      return { h: hOf(q.s) + (q.v * q.v) / (2 * g) * 0.97, side: Math.sign(q.s) };
    }
    physics(q, 0, g, 1 / 60);
    if (q.v * v0 <= 0) break;
  }
  return { h: hOf(q.s), side: Math.sign(q.s) };
}

// the next turnaround from a standstill at height h, pushing `dir` the whole way
function apexFrom(h, side, dir, g) {
  const q = { s: side * sOfH(h), v: 0 };
  physics(q, dir, g, STEP);
  const v0 = q.v;
  for (let i = 0; i < 800; i++) {
    physics(q, Math.abs(q.s) > EDGE ? 0 : dir, g, STEP);
    if (q.v * v0 <= 0) break;
  }
  return { h: hOf(q.s), side: Math.sign(q.s) };
}

const CONFETTI = ['#ff4fa3', '#ffd23a', '#7cf05a', '#3fd8ff', '#ff8a2a', '#ffffff'];
const SPARKS = ['#fff6c0', '#ffd060', '#ff8a3a', '#ffffff'];
const BALLOON_COLORS = [
  ['#ff6fb8', '#d81b74', '#7a0a3e'],
  ['#ffe36a', '#f0b400', '#8a5a00'],
  ['#9cf56c', '#3fbf2a', '#1a6010'],
  ['#ffab5a', '#ff6a1a', '#8a2a00'],
  ['#b39cff', '#7a4ff0', '#35188a'],
];

// ---------- art ----------

function paintSkater(pose) {
  // facing right, the board's wheels at the bottom (y = 24); pose: 0 stand, 1 crouch (pumping), 2 lean back (braking)
  return makeSprite(34, 50, (g) => {
    const hipY = pose === 1 ? 9 : 3;
    const lean = pose === 1 ? 4 : pose === 2 ? -4 : 1;
    const knee = pose === 1 ? 6 : 3;
    // board
    g.fillStyle = '#ffd23a';
    for (const x of [-8.5, 8.5]) {
      g.beginPath();
      g.arc(x, 22.4, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#8a8f98';
    g.fillRect(-10, 19.6, 3.5, 1.6);
    g.fillRect(6.5, 19.6, 3.5, 1.6);
    const deck = g.createLinearGradient(0, 17, 0, 20);
    deck.addColorStop(0, '#ff8a2a');
    deck.addColorStop(1, '#c2410c');
    g.fillStyle = deck;
    g.beginPath();
    g.moveTo(-15, 16.2);
    g.quadraticCurveTo(-13, 19.4, -10, 19.4);
    g.lineTo(10, 19.4);
    g.quadraticCurveTo(13, 19.4, 15, 16.2);
    g.lineTo(13.6, 16.6);
    g.quadraticCurveTo(12, 17.8, 10, 17.8);
    g.lineTo(-10, 17.8);
    g.quadraticCurveTo(-12, 17.8, -13.6, 16.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#2a2a30';
    g.fillRect(-10, 17.2, 20, 0.9);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // legs: jeans and sneakers
    const shoulderX = lean;
    const hipX = lean * 0.4;
    g.strokeStyle = '#2f5aa8';
    g.lineWidth = 4.2;
    for (const [fx, kd] of [[-5.5, -1], [5.5, 1]]) {
      g.beginPath();
      g.moveTo(fx, 16);
      g.lineTo((fx + hipX) / 2 + kd * knee * 0.6 + knee * 0.5, (16 + hipY) / 2);
      g.lineTo(hipX + kd * 1.6, hipY);
      g.stroke();
    }
    g.strokeStyle = 'rgba(160,200,255,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(5.5 + 0.8, 15.5);
    g.lineTo((5.5 + hipX) / 2 + knee * 1.1 + 0.8, (16 + hipY) / 2);
    g.stroke();
    for (const fx of [-5.5, 5.5]) {
      g.fillStyle = '#f4f4f8';
      g.beginPath();
      g.ellipse(fx + 1, 16.3, 3.6, 1.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8402a';
      g.fillRect(fx - 1.6, 16.6, 5.2, 0.9);
    }
    // torso: a white tee with a red stripe
    const tY = hipY - 13;
    g.fillStyle = '#f7f7f2';
    g.beginPath();
    g.moveTo(hipX - 4.6, hipY + 1);
    g.lineTo(shoulderX - 5, tY + 1);
    g.quadraticCurveTo(shoulderX, tY - 2, shoulderX + 5, tY + 1);
    g.lineTo(hipX + 4.6, hipY + 1);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(120,130,150,0.35)';
    g.beginPath();
    g.moveTo(hipX - 4.6, hipY + 1);
    g.lineTo(shoulderX - 5, tY + 1);
    g.lineTo(shoulderX - 2.5, tY + 1);
    g.lineTo(hipX - 2, hipY + 1);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8402a';
    g.fillRect(Math.min(hipX, shoulderX) - 5, tY + 5, 10, 2);
    // arms out for balance
    g.strokeStyle = '#e8b48a';
    g.lineWidth = 2.6;
    const armUp = pose === 2 ? -3 : pose === 1 ? 3 : 0;
    g.beginPath();
    g.moveTo(shoulderX + 3.5, tY + 2);
    g.lineTo(shoulderX + 9, tY + 5 + armUp);
    g.lineTo(shoulderX + 13.5, tY + 3 + armUp);
    g.moveTo(shoulderX - 3.5, tY + 2);
    g.lineTo(shoulderX - 9, tY + 6 - armUp);
    g.lineTo(shoulderX - 13, tY + 9 - armUp);
    g.stroke();
    g.strokeStyle = '#f7f7f2';
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(shoulderX + 3, tY + 1.8);
    g.lineTo(shoulderX + 5.5, tY + 3.2 + armUp * 0.4);
    g.moveTo(shoulderX - 3, tY + 1.8);
    g.lineTo(shoulderX - 5.5, tY + 3.6 - armUp * 0.4);
    g.stroke();
    // head, red cap with the peak forward
    const hx = shoulderX + 0.8;
    const hy = tY - 5;
    g.fillStyle = '#e8b48a';
    g.beginPath();
    g.arc(hx, hy, 4.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a3418';
    g.beginPath();
    g.arc(hx - 1.6, hy + 0.6, 3.6, Math.PI * 0.55, Math.PI * 1.25);
    g.fill();
    const cap = g.createLinearGradient(hx, hy - 6, hx, hy);
    cap.addColorStop(0, '#ff5a3a');
    cap.addColorStop(1, '#c0201a');
    g.fillStyle = cap;
    g.beginPath();
    g.arc(hx, hy - 0.8, 4.9, Math.PI, Math.PI * 2);
    g.closePath();
    g.fill();
    g.fillRect(hx + 2, hy - 1.6, 5.5, 1.6);
    g.fillStyle = '#ffffff';
    g.fillRect(hx - 1.2, hy - 4.6, 2.4, 1.4);
    g.fillStyle = '#2a1a10';
    g.fillRect(hx + 2.4, hy + 0.4, 1.1, 1.3);
  });
}

function paintBalloon([hi, mid, dark]) {
  return makeSprite(26, 34, (g) => {
    const body = g.createRadialGradient(-3.5, -9, 1, 0, -4, 14);
    body.addColorStop(0, hi);
    body.addColorStop(0.55, mid);
    body.addColorStop(1, dark);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, 9);
    g.bezierCurveTo(-7, 6, -11, -1, -11, -6);
    g.bezierCurveTo(-11, -13, -6, -17, 0, -17);
    g.bezierCurveTo(6, -17, 11, -13, 11, -6);
    g.bezierCurveTo(11, -1, 7, 6, 0, 9);
    g.closePath();
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(-2, 11.5);
    g.lineTo(2, 11.5);
    g.lineTo(0.6, 8.5);
    g.lineTo(-0.6, 8.5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-4.5, -9.5, 2.2, 4, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.arc(-1.5, -4.5, 1.1, 0, Math.PI * 2);
    g.fill();
  });
}

function paintDrone() {
  // a camera quadcopter seen from the side; the rotors are drawn live
  return makeSprite(44, 22, (g) => {
    g.strokeStyle = '#3a3e48';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-6, -1);
    g.lineTo(-15, -4);
    g.moveTo(6, -1);
    g.lineTo(15, -4);
    g.stroke();
    for (const x of [-15, 15]) {
      g.fillStyle = '#22252c';
      g.fillRect(x - 2, -7, 4, 4);
      g.fillStyle = '#5a606c';
      g.fillRect(x - 0.6, -9, 1.2, 2.5);
    }
    const body = g.createLinearGradient(0, -5, 0, 4);
    body.addColorStop(0, '#5c6370');
    body.addColorStop(0.5, '#2c3038');
    body.addColorStop(1, '#16181d');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-9, 2);
    g.quadraticCurveTo(-10, -4, -4, -4.5);
    g.lineTo(4, -4.5);
    g.quadraticCurveTo(10, -4, 9, 2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-5, -3.8, 9, 1);
    // the gimbal and camera
    g.fillStyle = '#1a1c22';
    g.fillRect(-1, 2, 2, 2.5);
    g.beginPath();
    g.arc(0, 6.5, 3.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3fd8ff';
    g.beginPath();
    g.arc(1.2, 6.3, 1.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(1.2, 5.4, 0.7, 0.7);
    // skids
    g.strokeStyle = '#22252c';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-6, 2);
    g.lineTo(-8, 9);
    g.lineTo(-3, 9);
    g.moveTo(6, 2);
    g.lineTo(8, 9);
    g.lineTo(3, 9);
    g.stroke();
  });
}

function paintPalm(rng) {
  return makeSprite(110, 200, (g) => {
    // a hazy palm silhouette: curved trunk, then fronds from the crown at the top
    g.translate(0, -100);
    const col = 'rgba(46,120,128,0.55)';
    g.strokeStyle = col;
    g.lineCap = 'round';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(8, 200);
    g.quadraticCurveTo(-6, 110, 2, 28);
    g.stroke();
    g.strokeStyle = 'rgba(30,90,100,0.35)';
    g.lineWidth = 1;
    for (let y = 40; y < 196; y += 7) {
      const x = 2 + ((y - 28) / 172) * 4 - Math.sin(((y - 28) / 172) * Math.PI) * 6;
      g.beginPath();
      g.moveTo(x - 3, y);
      g.lineTo(x + 3, y + 2);
      g.stroke();
    }
    g.fillStyle = col;
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * 0.42 + rng.range(-0.1, 0.1);
      const len = rng.range(38, 52);
      const tipX = 2 + Math.cos(a) * len;
      const tipY = 28 + Math.sin(a) * len * 0.55 + len * 0.45;
      g.beginPath();
      g.moveTo(2, 26);
      g.quadraticCurveTo(2 + Math.cos(a) * len * 0.5, 28 + Math.sin(a) * len * 0.7 - 6, tipX, tipY);
      g.quadraticCurveTo(2 + Math.cos(a) * len * 0.55, 28 + Math.sin(a) * len * 0.55 + 4, 2, 30);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(40,90,70,0.6)';
    g.beginPath();
    g.arc(0, 32, 3, 0, Math.PI * 2);
    g.arc(5, 33, 3, 0, Math.PI * 2);
    g.fill();
  }, 2);
}

function paintCloud(rng, w) {
  return makeSprite(w, w * 0.4, (g) => {
    const puffs = [];
    for (let i = 0; i < 7; i++) puffs.push([rng.range(-w * 0.32, w * 0.32), rng.range(-w * 0.06, w * 0.05), rng.range(w * 0.1, w * 0.17)]);
    g.fillStyle = 'rgba(160,215,225,0.55)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y + 4, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,1)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

function paintBackdrop(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, 410);
    sky.addColorStop(0, '#1fb3cf');
    sky.addColorStop(0.45, '#6fd6df');
    sky.addColorStop(0.8, '#c9f1e4');
    sky.addColorStop(1, '#fff1cf');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, 410);
    // the sea, with a glittering path under the sun
    const sea = g.createLinearGradient(0, 398, 0, 432);
    sea.addColorStop(0, '#3aa8c4');
    sea.addColorStop(1, '#1f7f9c');
    g.fillStyle = sea;
    g.fillRect(0, 398, W, 40);
    for (let i = 0; i < 70; i++) {
      const y = rng.range(400, 430);
      const x = 180 + rng.range(-1, 1) * (30 + (y - 400) * 2.2);
      g.fillStyle = `rgba(255,255,230,${rng.range(0.3, 0.8)})`;
      g.fillRect(x, y, rng.range(3, 9), 1);
    }
    // a distant headland
    g.fillStyle = 'rgba(70,140,150,0.55)';
    g.beginPath();
    g.moveTo(0, 400);
    g.quadraticCurveTo(30, 380, 70, 386);
    g.quadraticCurveTo(100, 390, 120, 400);
    g.closePath();
    g.fill();
    // the pier and its Ferris wheel (the wheel's spokes turn live)
    g.fillStyle = 'rgba(60,110,125,0.7)';
    g.fillRect(230, 396, 130, 4);
    for (let x = 234; x < 360; x += 9) g.fillRect(x, 400, 1.6, 10);
    // the sand and boardwalk
    const sand = g.createLinearGradient(0, 430, 0, 460);
    sand.addColorStop(0, '#f6dfa8');
    sand.addColorStop(1, '#e9c88a');
    g.fillStyle = sand;
    g.fillRect(0, 430, W, 40);
    // bleachers with a crowd behind the ramp
    g.fillStyle = '#8fb4bd';
    g.fillRect(0, 446, W, 140);
    for (let r = 0; r < 6; r++) {
      const y = 452 + r * 13;
      g.fillStyle = r % 2 ? '#a9c9cf' : '#9bbfc6';
      g.fillRect(0, y + 8, W, 5);
      for (let x = rng.range(0, 8); x < W; x += rng.range(7, 11)) {
        g.fillStyle = rng.pick(['#e7737a', '#f2b04a', '#6aa8d8', '#7cc08a', '#f3f0e6', '#b48ad0', '#ef8c5a']);
        g.globalAlpha = 0.7;
        g.fillRect(x - 3, y + 1, 6, 7);
        g.fillStyle = rng.pick(['#f0c8a0', '#c8946a', '#8a5a3a', '#f5d6b8']);
        g.beginPath();
        g.arc(x, y - 1, 2.6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }
    // haze so the crowd sits back
    const haze = g.createLinearGradient(0, 440, 0, 600);
    haze.addColorStop(0, 'rgba(220,245,240,0.55)');
    haze.addColorStop(1, 'rgba(200,235,235,0.25)');
    g.fillStyle = haze;
    g.fillRect(0, 440, W, 160);
    // a chain-link fence along the top of the bleachers
    g.strokeStyle = 'rgba(90,110,120,0.35)';
    g.lineWidth = 0.6;
    for (let x = -30; x < W + 30; x += 6) {
      g.beginPath();
      g.moveTo(x, 424);
      g.lineTo(x + 22, 446);
      g.moveTo(x + 22, 424);
      g.lineTo(x, 446);
      g.stroke();
    }
    g.fillStyle = 'rgba(80,100,110,0.6)';
    g.fillRect(0, 423, W, 1.4);
    for (let x = 10; x < W; x += 58) g.fillRect(x, 423, 1.6, 24);
  }, 1.5);
}

function rampPath(g, W) {
  g.moveTo(-6, YB - R);
  g.lineTo(CX - LIPX, YB - R);
  g.arc(CX - HALF, YB - R, R, Math.PI, Math.PI / 2, true);
  g.lineTo(CX + HALF, YB);
  g.arc(CX + HALF, YB - R, R, Math.PI / 2, 0, true);
  g.lineTo(W + 6, YB - R);
}

function paintRamp(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the plywood side panel
    g.save();
    g.beginPath();
    rampPath(g, W);
    g.lineTo(W + 6, H + 6);
    g.lineTo(-6, H + 6);
    g.closePath();
    const ply = g.createLinearGradient(0, YB - R, 0, H);
    ply.addColorStop(0, '#e6b878');
    ply.addColorStop(1, '#c48d4e');
    g.fillStyle = ply;
    g.fill();
    g.clip();
    // grain
    for (let i = 0; i < 90; i++) {
      const y = rng.range(YB - R, H);
      const x = rng.range(-20, W);
      g.strokeStyle = `rgba(140,80,30,${rng.range(0.08, 0.2)})`;
      g.lineWidth = rng.range(0.5, 1.2);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 30, y + rng.range(-3, 3), x + rng.range(50, 90), y + rng.range(-2, 2));
      g.stroke();
    }
    // sheet seams and screws
    g.strokeStyle = 'rgba(110,60,20,0.35)';
    g.lineWidth = 1;
    for (const x of [42, 110, 180, 250, 318]) {
      g.beginPath();
      g.moveTo(x, YB - R - 10);
      g.lineTo(x, H);
      g.stroke();
      g.fillStyle = 'rgba(90,70,60,0.6)';
      for (let y = 494; y < H; y += 22) g.fillRect(x - 3.5, y, 1.5, 1.5);
    }
    // the deck braces
    g.strokeStyle = 'rgba(120,70,30,0.45)';
    g.lineWidth = 3;
    for (const x0 of [6, W - 6]) {
      const x1 = x0 < CX ? 38 : W - 38;
      g.beginPath();
      g.moveTo(x0, YB - R + 6);
      g.lineTo(x1, H);
      g.moveTo(x1, YB - R + 6);
      g.lineTo(x0, H);
      g.stroke();
    }
    // graffiti: tags, drips and a big bubble-letter piece under the bottom
    const tag = (x, y, col, s) => {
      g.strokeStyle = col;
      g.lineWidth = 2.2 * s;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) g.quadraticCurveTo(x + (k + 0.5) * 7 * s, y + rng.range(-12, 12) * s, x + (k + 1) * 7 * s, y + rng.range(-5, 5) * s);
      g.stroke();
      for (let k = 0; k < 3; k++) {
        const dx = x + rng.range(4, 45) * s;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(dx, y + 3);
        g.lineTo(dx, y + rng.range(8, 16));
        g.stroke();
      }
    };
    tag(56, 520, 'rgba(40,40,60,0.55)', 0.8);
    tag(262, 524, 'rgba(220,40,120,0.6)', 0.75);
    tag(16, 600, 'rgba(40,140,220,0.6)', 0.6);
    tag(300, 608, 'rgba(40,40,60,0.5)', 0.6);
    // a star and a crown
    g.fillStyle = 'rgba(255,214,58,0.85)';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 4 : 10;
      g.lineTo(98 + Math.cos(a) * r, 556 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,30,50,0.7)';
    g.lineWidth = 1.5;
    g.stroke();
    g.beginPath();
    g.moveTo(244, 562);
    g.lineTo(247, 550);
    g.lineTo(252, 557);
    g.lineTo(256, 547);
    g.lineTo(260, 557);
    g.lineTo(265, 550);
    g.lineTo(268, 562);
    g.closePath();
    g.stroke();
    // the piece
    g.font = '900 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#2a1840';
    g.lineWidth = 9;
    g.strokeText('RAD!', CX + 2, 614);
    const fill = g.createLinearGradient(0, 600, 0, 628);
    fill.addColorStop(0, '#ff5fae');
    fill.addColorStop(0.5, '#ff8a3a');
    fill.addColorStop(1, '#ffd23a');
    g.fillStyle = fill;
    g.fillText('RAD!', CX + 2, 614);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(CX - 38, 603, 18, 2);
    g.fillStyle = '#3fd8ff';
    for (const [x, y] of [[CX - 46, 600], [CX + 50, 626], [CX + 46, 598]]) {
      g.beginPath();
      g.arc(x, y, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // shade near the top edge
    g.restore();
    // the riding surface (skatelite) and its sheen
    g.save();
    g.beginPath();
    rampPath(g, W);
    g.strokeStyle = '#3a3f4c';
    g.lineWidth = 9;
    g.stroke();
    g.translate(0, -3.4);
    g.beginPath();
    rampPath(g, W);
    g.strokeStyle = '#6b7484';
    g.lineWidth = 2.4;
    g.stroke();
    g.restore();
    // the decks' guard rails
    for (const x of [5, W - 5]) {
      g.fillStyle = '#c9d0d8';
      g.fillRect(x - 1.5, YB - R - 34, 3, 34);
    }
    g.fillStyle = '#e0e6ec';
    g.fillRect(0, YB - R - 35, 22, 3);
    g.fillRect(W - 22, YB - R - 35, 22, 3);
    // steel coping at the lips
    for (const x of [CX - LIPX, CX + LIPX]) {
      const cp = g.createRadialGradient(x - 1.2, YB - R - 1.5, 0.5, x, YB - R, 5);
      cp.addColorStop(0, '#ffffff');
      cp.addColorStop(0.5, '#b8c0c8');
      cp.addColorStop(1, '#5a6270');
      g.fillStyle = cp;
      g.beginPath();
      g.arc(x, YB - R, 4.6, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

// ---------- the game ----------

export default {
  id: 'halfpipe',
  title: 'Halfpipe',
  emoji: '🛹',
  tagline: 'Push the way you roll to fly higher. Pop balloons, never hit a drone.',
  colors: { bg: '#1fb3cf', fg: '#ffffff', accent: '#ff5fae' },

  // Skate punk, 176 BPM, E major (E – B – C♯m – A). A punk rock beat, driving eighth-note sawtooth
  // bass with its filter opening across the whole minute and palm-muted power chords from bar one;
  // then crashes and a square verse tune; then the fast "polka" skate-punk beat, open power chords,
  // snare-roll fills and a big "whoa-oh" hook; and a finale with ride, the hook doubled an octave
  // down by a sawtooth and a 16th arpeggio on top. 44 bars = 60s.
  music: {
    cps: 44 / 60,
    setup: `
      const kick = note("e2 ~ ~ ~ e2 e2 ~ ~").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ ~ pink ~ ~ ~ pink ~").decay(0.14).sustain(0).hpf(500).lpf(5500).gain(0.24).room(0.2)
      const pkick = note("e2 ~ e2 ~ e2 ~ e2 ~").s("sine").decay(0.15).sustain(0).gain(0.8)
      const psnare = s("~ pink ~ pink ~ pink ~ pink").decay(0.11).sustain(0).hpf(500).lpf(5500).gain(0.2).room(0.2)
      const fill = s("<~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ pink pink pink pink pink pink pink pink]>").decay(0.08).sustain(0)
        .hpf(600).lpf(5000).gain("[0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24]").room(0.2)
      const hats = s("white*8").decay(0.03).sustain(0).hpf(7000).gain("[0.05 0.03]*4")
      const ride = s("white*8").decay(0.12).sustain(0).hpf(6500).gain("[0.045 0.03]*4")
      const crash = s("<white ~ ~ ~>").decay(0.8).sustain(0).hpf(5000).gain(0.05)
      const bass = note("<[e2*8] [b2*8] [cs3*8] [a2*8]>").s("sawtooth").decay(0.1).sustain(0.3).release(0.04)
        .lpf(saw.range(500, 1500).slow(44)).lpq(3).gain(0.36)
      const mute = note("<[e3,b3]*8 [b2,fs3]*8 [cs3,gs3]*8 [a2,e3]*8>").s("sawtooth").decay(0.07).sustain(0)
        .lpf(saw.range(1100, 1900).slow(44)).gain(0.075).pan(0.38)
      const power = note("<[e3,b3,e4] [b2,fs3,b3] [cs3,gs3,cs4] [a2,e3,a3]>").struct("x ~ ~ x ~ ~ x ~").s("sawtooth")
        .decay(0.5).sustain(0.35).release(0.1).lpf(saw.range(1500, 2400).slow(44)).gain(0.065).pan(0.62)
      const verse = "<[gs4 ~ gs4 b4 ~ gs4 fs4 e4] [fs4 ~ fs4 b4 ~ ds5 cs5 b4] [e4 ~ e4 gs4 ~ cs5 b4 gs4] [a4 ~ cs5 e5 ~ cs5 b4 a4]>"
      const hook = "<[b4 ~ ~ gs4 b4 ~ cs5 ~] [b4 ~ ~ fs4 ~ ~ ds5 ~] [cs5 ~ ~ b4 cs5 ~ e5 ~] [e5 ~ ds5 ~ cs5 ~ b4 ~]>"
      const leadA = note(verse).s("square").decay(0.2).sustain(0.3).release(0.08).lpf(2200).vib(5).vibmod(0.1)
        .gain(0.075).room(0.3).delay(0.15).delaytime(0.255).delayfeedback(0.2).pan(0.55)
      const leadB = note(hook).add(note(12)).s("square").decay(0.3).sustain(0.4).release(0.1).lpf(2400).vib(5).vibmod(0.15)
        .gain(0.075).room(0.35).delay(0.18).delaytime(0.255).delayfeedback(0.25).pan(0.5)
      const lead2 = note(hook).s("sawtooth").decay(0.3).sustain(0.4).release(0.1).lpf(1500).gain(0.055).pan(0.42)
      const arp = note("<[e5 gs5 b5 gs5]*4 [ds5 fs5 b5 fs5]*4 [e5 gs5 cs6 gs5]*4 [e5 a5 cs6 a5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, bass, mute)],
      [12, stack(kick, snare, hats, crash, bass, mute, leadA)],
      [12, stack(pkick, psnare, fill, hats, crash, bass, power, leadB)],
      [12, stack(pkick, psnare, fill, ride, crash, bass, power, mute, leadB, lead2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');

    // ---- the windows: one per turnaround, alternating walls (right first). Each has a balloon you
    // must reach (lo) and a drone you must stay under (hi), both possibly bobbing by A. ----
    const wins = [];
    for (let i = 0; i < FREE; i++) wins.push({ side: i % 2 ? -1 : 1, free: true });
    let lastJump = -1;
    const makeWin = (prev, t) => {
      const side = -prev.side;
      const p = Math.pow(clamp(t / 58, 0, 1), 1.1);
      const g = gAt(t);
      const A = t > 26 && plan.chance(lerp(0.35, 0.75, clamp((t - 26) / 30, 0, 1))) ? plan.range(10, lerp(14, 22, p)) : 0;
      const band = plan.range(lerp(170, 66, p), lerp(210, 88, p)); // the clear band between the bobs
      if (prev.free) {
        const lo = plan.range(108, 128);
        return { side, lo, hi: lo + band + 60, A: 0, w: 0, p1: 0, p2: 0, color: plan.int(0, BALLOON_COLORS.length - 1) };
      }
      const pLo = prev.lo + prev.A;
      const pHi = prev.hi - prev.A;
      const c = lerp(0.45, 0.82, p);
      const up = apexFrom(pLo, prev.side, side, g).h - pLo;
      const dn = apexFrom(pHi, prev.side, -side, g);
      const down = pHi - (dn.side === side ? dn.h : 0);
      const loMin = Math.max(38, 140 - band);
      const hiMax = 462;
      // centre of the clear band: keep each wall reachable from anywhere in the last one
      let mMin = Math.max(loMin + band / 2, pHi - c * down - band / 2);
      let mMax = Math.min(hiMax - band / 2, pLo + c * up + band / 2);
      if (mMin > mMax) mMin = mMax = (mMin + mMax) / 2;
      const pm = (pLo + pHi) / 2;
      let jump = plan.chance(0.75) ? -lastJump : lastJump;
      if (pm + jump * 40 > mMax) jump = -1;
      if (pm + jump * 40 < mMin) jump = 1;
      lastJump = jump;
      const reach = jump > 0 ? mMax - pm : pm - mMin;
      const m = clamp(pm + jump * plan.range(0.45, 1) * Math.max(0, reach), mMin, mMax);
      return {
        side,
        lo: m - band / 2 - A,
        hi: m + band / 2 + A,
        A,
        w: plan.range(3, 5),
        p1: plan.range(0, 6.28),
        p2: plan.range(0, 6.28),
        color: plan.int(0, BALLOON_COLORS.length - 1),
      };
    };
    const balloonH = (w, t) => w.lo + w.A * Math.sin(w.w * t + w.p1);
    const droneH = (w, t) => w.hi + w.A * Math.sin(w.w * t + w.p2);

    // a reference ride with the same physics that every window is built around
    const steer = (st, w, g) => {
      const hd = st.v > 0 ? 1 : st.v < 0 ? -1 : -Math.sign(st.s) || 1;
      if (w.free || w.side !== hd) return w.free && hd === w.side && predict(st, g).h > 150 ? 0 : hd;
      const aim = (w.lo + w.hi) / 2;
      const pr = predict(st, g).h;
      return pr < aim - 5 ? hd : pr > aim + 5 ? -hd : 0;
    };
    {
      const ref = { s: -EDGE, v: 0 };
      let k = 0;
      let vPrev = 0;
      let d = 0;
      for (let i = 0; i * STEP < 63; i++) {
        const t = i * STEP;
        while (wins.length <= k + 2) wins.push(makeWin(wins[wins.length - 1], t));
        const w = wins[k];
        const g = gAt(t);
        if (i % 4 === 0) d = steer(ref, w, g);
        physics(ref, d, g, STEP);
        if (vPrev !== 0 && ref.v * vPrev <= 0) {
          const side = Math.sign(ref.s);
          const h = hOf(ref.s);
          if (w.free) {
            if (side === w.side) k++;
          } else {
            // a safety net: keep the reference ride possible no matter what
            if (h < w.lo + w.A + 4) w.lo = h - w.A - 4;
            if (h > w.hi - w.A - 4) w.hi = h + w.A + 4;
            k++;
          }
        }
        vPrev = ref.v;
      }
    }

    // ---- art ----
    const backdrop = paintBackdrop(W, H, art);
    const ramp = paintRamp(W, H, art);
    const palms = [paintPalm(art), paintPalm(art)];
    const clouds = [paintCloud(art, 120), paintCloud(art, 90), paintCloud(art, 150)];
    const skater = [paintSkater(0), paintSkater(1), paintSkater(2)];
    const balloons = BALLOON_COLORS.map(paintBalloon);
    const drone = paintDrone();
    const sunGlow = glowSprite('rgba(255,250,215,0.9)', 80);
    const redGlow = glowSprite('rgba(255,60,60,0.9)', 24);
    const greenGlow = glowSprite('rgba(140,255,160,0.9)', 24);
    const whiteGlow = glowSprite('rgba(255,255,255,0.9)', 24);
    const vignette = vignetteSprite(W, H, 0.35, '10,40,60');
    const cloudSet = [
      { x: 40, y: 92, k: 0, v: 6 },
      { x: 250, y: 150, k: 1, v: 4 },
      { x: 150, y: 250, k: 2, v: 3 },
    ];
    const gulls = Array.from({ length: 3 }, (_, i) => ({ x: Math.random() * W, y: 300 + i * 26, v: 12 + Math.random() * 10, ph: Math.random() * 6 }));

    // ---- state ----
    const st = { s: -EDGE, v: 0 };
    let k = 0;
    let vPrev = 0;
    let lastAdvance = 0;
    let tNow = 0;
    let clock = 0;
    let input = 0;
    let facing = 1;
    let face = 1; // eased, for the turn at the top
    let popped = 0;
    let gNow = gAt(0);
    let shake = 0;
    let bail = null;
    const fx = createParticles();
    const sparks = createParticles();
    const streaks = [];
    const flyers = []; // drones knocked out of the sky
    const pops = []; // "POP!" labels

    const riderPos = () => {
      const q = geo(st.s);
      return { x: q.x, y: q.y, rot: -q.sg * q.phi, phi: q.phi, sg: q.sg };
    };

    const die = (game, reason, kind) => {
      game.dead = true;
      game.deathReason = reason;
      shake = kind === 'drone' ? 1 : 0.5;
      const q = riderPos();
      const nx = -q.sg * Math.sin(q.phi);
      const ny = -Math.cos(q.phi);
      // the board's velocity along the ramp, on screen
      const vx = st.v * Math.cos(q.phi);
      const vy = -q.sg * Math.sin(q.phi) * st.v;
      // body centre is about 18 along the normal from the board
      bail = {
        x: q.x + nx * 18,
        y: q.y + ny * 18,
        vx: vx * 0.8 + nx * 60,
        vy: vy * 0.8 + ny * 40 - (kind === 'drone' ? 80 : 0),
        rot: q.rot,
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4),
        bx: q.x,
        by: q.y,
        bvx: nx * -40 + (Math.random() - 0.5) * 120,
        bvy: -160 - Math.random() * 80,
        brot: q.rot,
        bspin: (Math.random() - 0.5) * 18,
        rest: false,
      };
      if (kind === 'drone') {
        sparks.burst(bail.x, bail.y - 6, { count: 34, speed: 220, life: 0.8, size: 3, colors: SPARKS, drag: 1.5, gravity: 200 });
        fx.burst(bail.x, bail.y - 6, { count: 14, speed: 120, life: 1.2, size: 4, colors: ['#2c3038', '#5c6370', '#16181d'], gravity: 500 });
      } else {
        fx.burst(q.x, q.y, { count: 16, speed: 90, life: 0.9, size: 4, round: true, drag: 2, colors: ['rgba(255,255,255,0.8)', 'rgba(200,220,230,0.7)'] });
      }
    };

    const popBalloon = (w, t) => {
      w.popped = true;
      popped++;
      const p = wallPoint(w.side, balloonH(w, t) + BALLOON_UP, 17);
      const col = BALLOON_COLORS[w.color];
      fx.burst(p.x, p.y, { count: 30, speed: 210, life: 1, size: 4, colors: CONFETTI, drag: 2.2, gravity: 160 });
      fx.burst(p.x, p.y, { count: 8, speed: 140, life: 0.6, size: 5, colors: [col[1], col[2]], drag: 3, gravity: 300 });
      pops.push({ x: p.x - w.side * 10, y: p.y - 6, life: 0.8 });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 2.5);
      face += (facing - face) * Math.min(1, dt * 14);
      fx.update(dt);
      sparks.update(dt);
      for (const c of cloudSet) c.x = ((c.x + c.v * dt + 100) % (W + 200)) - 100;
      for (const q of gulls) q.x = ((q.x + q.v * dt + 30) % (W + 60)) - 30;
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].life -= dt;
        pops[i].y -= 30 * dt;
        if (pops[i].life <= 0) pops.splice(i, 1);
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        streaks[i].life -= dt;
        if (streaks[i].life <= 0) streaks.splice(i, 1);
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        f.vy += 300 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.spin * dt;
        if (f.y > H + 40 || f.x < -60 || f.x > W + 60) flyers.splice(i, 1);
      }
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        tNow = t;
        input = dir;
        gNow = gAt(t);
        const sBefore = st.s;
        physics(st, dir, gNow, dt);
        if (st.v > 1) facing = 1;
        else if (st.v < -1) facing = -1;
        updateCosmetic(dt);

        const side = Math.sign(st.s);
        const h = hOf(st.s);
        const w = wins[k];

        // cosmetic: sparks off the coping when you fly out over it, speed streaks
        if (Math.abs(st.s) > EDGE && Math.abs(sBefore) <= EDGE && Math.abs(st.v) > 150) {
          sparks.burst(CX + side * LIPX, YB - R, { count: 10, speed: 120, life: 0.4, size: 2, colors: SPARKS, angle: Math.PI / 2 - side * 0.3, spread: 1.6, gravity: 400 });
        }
        if (Math.abs(st.v) > 380 && Math.random() < 0.5) {
          const q = riderPos();
          streaks.push({ x: q.x - Math.sin(q.phi) * q.sg * (6 + Math.random() * 30), y: q.y - Math.cos(q.phi) * (6 + Math.random() * 30), phi: q.phi, sg: q.sg, len: 12 + Math.random() * 16, life: 0.25 });
        }

        if (!w.free && side === w.side) {
          if (!w.popped && h >= balloonH(w, t)) popBalloon(w, t);
          if (h >= droneH(w, t)) {
            const p = wallPoint(w.side, droneH(w, t) + DRONE_UP, 20);
            flyers.push({ x: p.x, y: p.y, vx: -w.side * 90, vy: -160, rot: 0, spin: -w.side * 9 });
            w.hit = true;
            return die(this, 'Crashed into a camera drone.', 'drone');
          }
        }

        // the turnaround at the top of each wall
        if (vPrev !== 0 && st.v * vPrev <= 0) {
          if (w.free) {
            if (side === w.side) {
              k++;
              lastAdvance = t;
            }
          } else {
            if (side !== w.side) return die(this, "Didn't make it up the other wall.", 'bail');
            if (!w.popped) return die(this, 'Turned back without popping the balloon.', 'bail');
            w.doneAt = clock;
            k++;
            lastAdvance = t;
          }
        }
        vPrev = st.v;
        if (t > 2.5 && t - lastAdvance > 4.2) return die(this, 'Ran out of speed and stalled.', 'bail');
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (!bail) return;
        const b = bail;
        if (!b.rest) {
          b.vy += 1000 * dt;
          b.x = clamp(b.x + b.vx * dt, 10, W - 10);
          b.y += b.vy * dt;
          b.rot += b.spin * dt;
          const sy = surfaceY(b.x) - 8;
          if (b.y > sy) {
            b.y = sy;
            if (b.vy > 160) {
              fx.burst(b.x, sy + 6, { count: 6, speed: 60, life: 0.5, size: 3, round: true, colors: ['rgba(255,255,255,0.7)'] });
              b.vy *= -0.3;
              b.vx *= 0.6;
              b.spin *= 0.5;
            } else {
              b.rest = true;
            }
          }
        }
        b.bvy += 1000 * dt;
        b.bx += b.bvx * dt;
        b.by += b.bvy * dt;
        b.brot += b.bspin * dt;
        const sb = surfaceY(clamp(b.bx, 0, W)) - 3;
        if (b.by > sb) {
          b.by = sb;
          b.bvy *= -0.35;
          b.bvx *= 0.7;
          b.bspin *= 0.6;
        }
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
        g.save();
        g.translate(sx, sy);

        // sky, sun, clouds, the beach and the crowd
        drawSprite(g, backdrop, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 180, 190, { size: 260, alpha: 0.5 });
        drawSprite(g, sunGlow, 180, 190, { size: 80, alpha: 0.95 });
        g.globalCompositeOperation = 'source-over';
        for (const c of cloudSet) drawSprite(g, clouds[c.k], c.x, c.y);
        g.strokeStyle = 'rgba(40,80,100,0.6)';
        g.lineWidth = 1.2;
        for (const q of gulls) {
          const f = Math.sin(clock * 6 + q.ph) * 2;
          g.beginPath();
          g.moveTo(q.x - 5, q.y - f);
          g.quadraticCurveTo(q.x - 2, q.y - 3, q.x, q.y);
          g.quadraticCurveTo(q.x + 2, q.y - 3, q.x + 5, q.y - f);
          g.stroke();
        }
        // the Ferris wheel turning on the pier
        {
          const wx = 300;
          const wy = 362;
          g.strokeStyle = 'rgba(60,110,125,0.65)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(wx, wy, 30, 0, Math.PI * 2);
          g.moveTo(wx - 14, 398);
          g.lineTo(wx, wy);
          g.lineTo(wx + 14, 398);
          for (let i = 0; i < 8; i++) {
            const a = clock * 0.25 + (i * Math.PI) / 4;
            g.moveTo(wx, wy);
            g.lineTo(wx + Math.cos(a) * 30, wy + Math.sin(a) * 30);
          }
          g.stroke();
          g.fillStyle = 'rgba(255,110,140,0.6)';
          for (let i = 0; i < 8; i++) {
            const a = clock * 0.25 + (i * Math.PI) / 4;
            g.fillRect(wx + Math.cos(a) * 30 - 2, wy + Math.sin(a) * 30, 4, 4);
          }
        }
        for (const [i, x] of [[0, 112], [1, 246]]) {
          g.save();
          g.translate(x, 470);
          g.rotate(Math.sin(clock * 0.9 + i * 2) * 0.025);
          g.drawImage(palms[i].canvas, -55, -200, 110, 200);
          g.restore();
        }

        // the ramp
        drawSprite(g, ramp, W / 2, H / 2);

        // the walls' windows: the current one bold, the next one faint
        for (let j = k + 1; j >= k; j--) {
          const w = wins[j];
          if (!w || w.free) continue;
          const cur = j === k && !this.dead;
          w.seen ??= clock;
          const alpha = (cur ? 1 : 0.42) * clamp((clock - w.seen) / 0.3, 0, 1);
          const bh = balloonH(w, tNow);
          const dh = droneH(w, tNow);
          // a band on the wall between the balloon and the drone
          g.globalAlpha = alpha * (cur ? 0.75 : 0.5);
          g.strokeStyle = cur ? '#7cf05a' : '#e8fff0';
          g.lineWidth = 4;
          g.beginPath();
          for (let hh = bh; hh <= dh + 0.1; hh += Math.max(4, (dh - bh) / 30)) {
            const p = wallPoint(w.side, Math.min(hh, dh), -6);
            if (hh === bh) g.moveTo(p.x, p.y);
            else g.lineTo(p.x, p.y);
          }
          g.stroke();
          g.globalAlpha = alpha;
          // the drone with its no-fly line
          if (!w.hit) {
            const p = wallPoint(w.side, dh + DRONE_UP, 22);
            const q = wallPoint(w.side, dh, 0);
            g.strokeStyle = cur ? 'rgba(255,60,70,0.85)' : 'rgba(255,90,90,0.6)';
            g.lineWidth = 1.6;
            g.setLineDash([4, 3]);
            g.beginPath();
            g.moveTo(q.x - w.side * -4, q.y);
            g.lineTo(q.x - w.side * 48, q.y);
            g.stroke();
            g.setLineDash([]);
            const bobY = Math.sin(clock * 5 + j) * 1.2;
            drawSprite(g, drone, p.x, p.y + bobY, { rot: Math.sin(clock * 2 + j) * 0.05 });
            // spinning rotors
            g.fillStyle = 'rgba(40,44,52,0.5)';
            for (const dx of [-15, 15]) {
              const r = 7 + Math.abs(Math.sin(clock * 40 + dx)) * 3;
              g.beginPath();
              g.ellipse(p.x + dx, p.y + bobY - 9, r, 1.3, 0, 0, Math.PI * 2);
              g.fill();
            }
            if (cur && Math.sin(clock * 8) > 0) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, redGlow, p.x - 6, p.y + bobY - 2, { size: 16 });
              g.globalCompositeOperation = 'source-over';
              g.fillStyle = '#ff4040';
              g.fillRect(p.x - 7, p.y + bobY - 3, 2, 2);
            }
          }
          // the balloon on its string
          if (!w.popped) {
            const p = wallPoint(w.side, bh + BALLOON_UP, 17);
            const sway = Math.sin(clock * 2.2 + j) * 0.12;
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 0.9;
            g.beginPath();
            g.moveTo(p.x, p.y + 11);
            g.quadraticCurveTo(p.x + Math.sin(clock * 3 + j) * 4, p.y + 20, p.x + Math.sin(clock * 2 + j) * 2, p.y + 28);
            g.stroke();
            if (cur) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, whiteGlow, p.x, p.y - 3, { size: 38, alpha: 0.35 + 0.15 * Math.sin(clock * 6) });
              g.globalCompositeOperation = 'source-over';
            }
            drawSprite(g, balloons[w.color], p.x, p.y, { rot: sway });
          }
          g.globalAlpha = 1;
        }

        // where you'd turn around if you let go now
        if (!this.dead && Math.abs(st.v) > 20) {
          const pr = predict(st, gNow);
          const w = wins[k];
          if (pr.side && pr.h > 6) {
            const ok = w.free || (pr.side === w.side && pr.h >= balloonH(w, tNow) && pr.h < droneH(w, tNow));
            const p = wallPoint(pr.side, pr.h, -6);
            const s = pr.side;
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, ok ? greenGlow : redGlow, p.x, p.y, { size: 26, alpha: 0.6 });
            g.globalCompositeOperation = 'source-over';
            g.fillStyle = ok ? '#eaffd8' : '#ffd0c8';
            g.strokeStyle = 'rgba(20,40,50,0.7)';
            g.lineWidth = 1.2;
            g.save();
            g.translate(p.x, p.y);
            g.rotate(Math.atan2(-Math.cos(p.phi), -s * Math.sin(p.phi)));
            g.beginPath();
            g.moveTo(3, 0);
            g.lineTo(-8, -5.5);
            g.lineTo(-8, 5.5);
            g.closePath();
            g.fill();
            g.stroke();
            g.restore();
          }
        }

        // streaks and the skater
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (const s of streaks) {
          const tx = Math.cos(s.phi) * facing;
          const ty = -s.sg * Math.sin(s.phi) * facing;
          g.moveTo(s.x, s.y);
          g.lineTo(s.x - tx * s.len * (s.life / 0.25), s.y - ty * s.len * (s.life / 0.25));
        }
        g.stroke();
        if (!bail) {
          const q = riderPos();
          const onRamp = Math.abs(st.s) <= EDGE;
          const moving = st.v > 0 ? 1 : st.v < 0 ? -1 : 0;
          const pose = onRamp && input && moving ? (input === moving ? 1 : 2) : 0;
          g.save();
          g.translate(q.x, q.y);
          g.rotate(q.rot);
          g.scale(face, 1);
          g.drawImage(skater[pose].canvas, -17, -48, 34, 50);
          g.restore();
        } else {
          const b = bail;
          g.save();
          g.translate(b.bx, b.by);
          g.rotate(b.brot);
          g.fillStyle = '#ff8a2a';
          g.fillRect(-14, -1.5, 28, 3);
          g.fillStyle = '#ffd23a';
          g.beginPath();
          g.arc(-8.5, 3, 2.2, 0, Math.PI * 2);
          g.arc(8.5, 3, 2.2, 0, Math.PI * 2);
          g.fill();
          g.restore();
          g.save();
          g.translate(b.x, b.y);
          g.rotate(b.rot);
          // the skater without the board (the sprite's board area is clipped off)
          g.beginPath();
          g.rect(-17, -26, 34, 40);
          g.clip();
          g.drawImage(skater[0].canvas, -17, -26, 34, 50);
          g.restore();
        }
        for (const f of flyers) {
          g.save();
          g.translate(f.x, f.y);
          g.rotate(f.rot);
          drawSprite(g, drone, 0, 0);
          g.restore();
          if (Math.random() < 0.5) fx.burst(f.x, f.y, { count: 1, speed: 20, life: 0.6, size: 5, round: true, colors: ['rgba(60,60,70,0.5)'] });
        }
        sparks.render(g, true);
        fx.render(g);
        g.font = '900 15px system-ui, sans-serif';
        g.textAlign = 'center';
        for (const p of pops) {
          g.globalAlpha = clamp(p.life / 0.5, 0, 1);
          g.fillStyle = '#2a1840';
          g.fillText('POP!', p.x + 1, p.y + 1);
          g.fillStyle = '#ffffff';
          g.fillText('POP!', p.x, p.y);
        }
        g.globalAlpha = 1;

        drawSprite(g, vignette, W / 2, H / 2);
        g.restore();

        // the balloon count
        g.font = '800 14px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillStyle = 'rgba(42,24,64,0.6)';
        g.fillText(`🎈 ${popped}`, W - 11, H - 13);
        g.fillStyle = '#ffffff';
        g.fillText(`🎈 ${popped}`, W - 12, H - 14);

        // a hint at the start
        if (tNow < 3.6 && !this.dead) {
          g.globalAlpha = clamp(3.6 - tNow, 0, 1) * 0.95;
          g.font = '800 14px system-ui, sans-serif';
          g.textAlign = 'center';
          const msg = 'hold the way you roll to pump';
          g.fillStyle = 'rgba(20,50,70,0.55)';
          g.fillText(msg, W / 2 + 1, 341);
          g.fillStyle = '#ffffff';
          g.fillText(msg, W / 2, 340);
          g.font = '700 12px system-ui, sans-serif';
          const msg2 = 'the arrow shows how high you will fly';
          g.fillStyle = 'rgba(20,50,70,0.55)';
          g.fillText(msg2, W / 2 + 1, 361);
          g.fillStyle = '#ffffff';
          g.fillText(msg2, W / 2, 360);
          g.globalAlpha = 1;
        }
      },
    };
    return game;
  },
};
