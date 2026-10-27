// Halfpipe — a skater rides a vert ramp at a beachside skatepark, pumping on their own from wall to
// wall. Your job is the air: over each wall a card calls the trick (a flip clockwise, a flip
// anticlockwise, a double, or no flip at all) and floats at the height the skater will reach, so you
// see how much air time you'll get. Holding → spins the skater clockwise, ← anticlockwise, and only in
// the air; let go and the spin carries on a little before it stops. Come back down wheels-down on the
// wall with exactly the called number of turns, the right way round, or you slam. A ring round the
// skater in the air shows where wheels-down is and how many turns are done. The first flips are slow,
// floaty learner airs with a lazy spin and a wide landing, so there's time to work it out, and the next
// several ease step by step from those to full speed. Then the calls get harder (doubles, no-flips
// slipped in, switching directions), the airs get just long enough for the trick and the landing gets
// less forgiving. Every air is checked against the same spin physics.

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
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const WMAX = 540 * DEG; // top spin speed
const KUP = 18; // how fast the spin winds up while you hold
const KDN = 20; // how fast it dies down once you let go
const BODY = 23; // the body's centre, this far off the board along the normal

const gAt = (t) => lerp(800, 1000, progress(t, 60, 1.5));
const tolAt = (t) => lerp(46, 28, progress(t, 60, 1.4)) * DEG;
// the first flips are learners: floaty, slow airs, a lazy spin and a generous landing
const EASY = [
  null,
  { g: 430, T: 2.6, wmax: 280 * DEG, tol: 62 * DEG },
  { g: 470, T: 2.4, wmax: 320 * DEG, tol: 58 * DEG },
];
// after them, this many airs ease from LEARN to full speed one step at a time
const RAMP = 8;
const LEARN = { g: 520, wmax: 370 * DEG, tol: 56 * DEG, slack: 0.5 };

// height above the flat bottom at arc length s
const hOf = (s) => {
  const a = Math.abs(s);
  if (a <= HALF) return 0;
  if (a <= EDGE) return R * (1 - Math.cos((a - HALF) / R));
  return R + a - EDGE;
};
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
// the ramp surface's y at screen x (for the bail)
const surfaceY = (x) => {
  const dx = Math.abs(x - CX);
  if (dx <= HALF) return YB;
  if (dx < LIPX) return YB - R + Math.sqrt(Math.max(0, R * R - (dx - HALF) ** 2));
  return YB - R;
};

// gravity only: the skater pumps on their own, so the speed is set at the bottom of each crossing
function physics(st, g, dt) {
  const a = Math.abs(st.s);
  const sg = st.s < 0 ? -1 : 1;
  let sin = 0;
  if (a > EDGE) sin = 1;
  else if (a > HALF) sin = Math.sin((a - HALF) / R);
  st.v += -g * sin * sg * dt;
  st.s += st.v * dt;
}

// one step of the spin: wind up towards top speed while held, die down when let go
function spinStep(sp, dir, dt, wmax = WMAX) {
  if (dir) sp.w += (dir * wmax - sp.w) * Math.min(1, KUP * dt);
  else sp.w -= sp.w * Math.min(1, KDN * dt);
  sp.a += sp.w * dt;
}

// how far off wheels-down a straightforward rider lands a trick of `turns` with `air` seconds of
// air: hold from take-off, let go when the spin would coast onto the target
function refError(turns, air, wmax = WMAX) {
  if (!turns) return 0;
  const goal = Math.abs(turns) * TAU;
  const sp = { a: 0, w: 0 };
  let held = true;
  for (let t = 0; t < air; t += STEP) {
    if (held && sp.a + sp.w / KDN >= goal) held = false;
    spinStep(sp, held ? 1 : 0, STEP, wmax);
  }
  return Math.abs(sp.a - goal);
}

const CONFETTI = ['#ff4fa3', '#ffd23a', '#7cf05a', '#3fd8ff', '#ff8a2a', '#ffffff'];
const CALL_RIGHT = '#ff8a2a';
const CALL_LEFT = '#2fb8ff';

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

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
  tagline: 'Hold ← or → in the air to flip as the card says. Land wheels-down.',
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

    // ---- the airs, one per wall (right first). turns: +clockwise / −anticlockwise, 0 = no flip,
    // null = the warm-up drop-in. a: how high above the lip the skater flies. ----
    const airs = [];
    let lastDir = -1;
    const makeAir = (i, t) => {
      const side = i % 2 ? -1 : 1;
      const g = gAt(t);
      if (i === 0) return { side, g, a: 150, turns: null };
      const p = progress(t, 60, 1.5);
      const prev = airs[i - 1];
      let mag = 1;
      if (i > 2) {
        const pNo = t > 8 && prev.turns !== 0 ? 0.13 : 0;
        const pDouble = t < 16 || i < 6 ? 0 : lerp(0.15, 0.5, clamp((t - 16) / 36, 0, 1));
        const r = plan.next();
        mag = r < pNo ? 0 : r < pNo + pDouble ? 2 : 1;
      }
      let dir = i === 1 ? 1 : i === 2 ? -1 : plan.chance(lerp(0.35, 0.7, p)) ? -lastDir : lastDir;
      if (mag) lastDir = dir;
      let turns = mag * dir;
      const easy = EASY[i];
      if (easy) return { side, g: easy.g, a: (easy.g * easy.T * easy.T) / 8, turns, wmax: easy.wmax, tol: easy.tol };
      // the airs after the learners are part way between them and full speed
      const e = clamp(1 - (i - 2) / RAMP, 0, 1);
      const ge = lerp(g, LEARN.g, e);
      const wmax = lerp(WMAX, LEARN.wmax, e);
      // just enough air for the trick, with less to spare as the minute goes on
      const tol = lerp(tolAt(t + 1.5), LEARN.tol, e);
      let T = mag ? (mag * TAU) / wmax + 0.1 + e * LEARN.slack + plan.range(lerp(0.45, 0.14, p), lerp(0.8, 0.3, p)) : plan.range(0.95, 1.4);
      while (refError(turns, T, wmax) > tol * 0.4) T += 0.03;
      let a = (ge * T * T) / 8;
      if (a > 390) {
        a = 390;
        T = 2 * Math.sqrt((2 * a) / ge);
        if (refError(turns, T, wmax) > tol * 0.4) turns = dir; // no room for a double up there
      }
      if (!e) return { side, g, a: Math.max(90, a), turns };
      return { side, g: ge, a: Math.max(90, a), turns, wmax, tol };
    };
    airs.push(makeAir(0, 0), makeAir(1, 0));

    // ---- art ----
    const backdrop = paintBackdrop(W, H, art);
    const ramp = paintRamp(W, H, art);
    const palms = [paintPalm(art), paintPalm(art)];
    const clouds = [paintCloud(art, 120), paintCloud(art, 90), paintCloud(art, 150)];
    const skater = [paintSkater(0), paintSkater(1), paintSkater(2)];
    const sunGlow = glowSprite('rgba(255,250,215,0.9)', 80);
    const greenGlow = glowSprite('rgba(140,255,160,0.9)', 24);
    const vignette = vignetteSprite(W, H, 0.35, '10,40,60');
    const cloudSet = [
      { x: 40, y: 92, k: 0, v: 6 },
      { x: 250, y: 150, k: 1, v: 4 },
      { x: 150, y: 250, k: 2, v: 3 },
    ];
    const gulls = Array.from({ length: 3 }, (_, i) => ({ x: Math.random() * W, y: 300 + i * 26, v: 12 + Math.random() * 10, ph: Math.random() * 6 }));

    // ---- state ----
    const st = { s: -EDGE, v: 0 };
    const sp = { a: 0, w: 0 }; // the spin in the air
    let k = 0; // the air being flown, or the next one
    let gNow = airs[0].g;
    let inAir = false;
    let settle = 0; // what's left of a landed spin, eased out on the ramp
    let tNow = 0;
    let clock = 0;
    let facing = 1;
    let face = 1;
    let landed = 0;
    let shake = 0;
    let bail = null;
    const fx = createParticles();
    const sparks = createParticles();
    const streaks = [];
    const labels = [];

    const riderPos = () => {
      const q = geo(st.s);
      const nx = -q.sg * Math.sin(q.phi);
      const ny = -Math.cos(q.phi);
      return { x: q.x, y: q.y, bx: q.x + nx * BODY, by: q.y + ny * BODY, rot: -q.sg * q.phi, phi: q.phi, sg: q.sg, nx, ny };
    };

    const die = (game, reason) => {
      game.dead = true;
      game.deathReason = reason;
      shake = 0.7;
      const q = riderPos();
      const vx = st.v * Math.cos(q.phi);
      const vy = -q.sg * Math.sin(q.phi) * st.v;
      bail = {
        x: q.bx,
        y: q.by,
        vx: vx * 0.5 + q.nx * 90,
        vy: vy * 0.5 - 60,
        rot: q.rot + sp.a,
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4),
        bx: q.x,
        by: q.y,
        bvx: q.nx * 60 + (Math.random() - 0.5) * 120,
        bvy: -200 - Math.random() * 80,
        brot: q.rot + sp.a,
        bspin: (Math.random() - 0.5) * 18,
        rest: false,
      };
      fx.burst(q.x, q.y, { count: 18, speed: 110, life: 0.9, size: 4, round: true, drag: 2, colors: ['rgba(255,255,255,0.8)', 'rgba(200,220,230,0.7)'] });
      sparks.burst(q.x, q.y, { count: 14, speed: 160, life: 0.5, size: 2, colors: ['#fff6c0', '#ffd060', '#ffffff'], gravity: 400 });
    };

    // what went wrong on a landing, or '' if it was clean
    const judge = (turns, tol) => {
      const err = sp.a - turns * TAU;
      if (Math.abs(err) <= tol) return '';
      const n = Math.round(sp.a / TAU);
      const off = Math.abs(sp.a - n * TAU);
      if (off > tol) return off > 110 * DEG ? 'Landed on your head.' : 'Landed crooked and slammed.';
      if (turns === 0) return 'Flipped on a no-flip air.';
      if (n === 0) return 'Forgot to flip.';
      if (Math.sign(n) !== Math.sign(turns)) return 'Flipped the wrong way.';
      if (Math.abs(n) < Math.abs(turns)) return 'Only one flip on a double.';
      return 'Over-rotated into an extra flip.';
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 2.5);
      face += (facing - face) * Math.min(1, dt * 14);
      fx.update(dt);
      sparks.update(dt);
      for (const c of cloudSet) c.x = ((c.x + c.v * dt + 100) % (W + 200)) - 100;
      for (const q of gulls) q.x = ((q.x + q.v * dt + 30) % (W + 60)) - 30;
      for (let i = labels.length - 1; i >= 0; i--) {
        labels[i].life -= dt;
        labels[i].y -= 30 * dt;
        if (labels[i].life <= 0) labels.splice(i, 1);
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        streaks[i].life -= dt;
        if (streaks[i].life <= 0) streaks.splice(i, 1);
      }
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        tNow = t;
        const sBefore = st.s;
        physics(st, gNow, dt);
        if (st.v > 1) facing = 1;
        else if (st.v < -1) facing = -1;
        updateCosmetic(dt);
        const air = airs[k];

        // the bottom: the skater pumps for the next air
        if (sBefore * st.s < 0 || (sBefore !== 0 && st.s === 0)) {
          gNow = air.g;
          st.v = Math.sign(st.v) * Math.sqrt(2 * gNow * (R + air.a));
        }

        const was = Math.abs(sBefore) > EDGE;
        const is = Math.abs(st.s) > EDGE;
        if (!was && is) {
          // take-off
          inAir = true;
          sp.a = settle;
          sp.w = 0;
          settle = 0;
          if (Math.abs(st.v) > 150) {
            const side = Math.sign(st.s);
            sparks.burst(CX + side * LIPX, YB - R, { count: 10, speed: 120, life: 0.4, size: 2, colors: ['#fff6c0', '#ffd060', '#ff8a3a', '#ffffff'], angle: Math.PI / 2 - side * 0.3, spread: 1.6, gravity: 400 });
          }
        }
        if (inAir && air.turns !== null) spinStep(sp, dir, dt, air.wmax);
        if (was && !is) {
          // touch-down
          inAir = false;
          if (air.turns !== null) {
            const why = judge(air.turns, air.tol ?? tolAt(t));
            if (why) return die(this, why);
            const q = riderPos();
            if (air.turns) {
              landed++;
              fx.burst(q.bx, q.by, { count: 26, speed: 200, life: 1, size: 4, colors: CONFETTI, drag: 2.2, gravity: 160 });
            }
            labels.push({ x: q.bx - q.sg * 34, y: q.by - 20, life: 0.9, text: air.turns === 0 ? 'CLEAN!' : Math.abs(air.turns) === 2 ? 'DOUBLE!' : 'FLIP!' });
            settle = sp.a - air.turns * TAU;
          }
          sp.a = 0;
          sp.w = 0;
          k++;
          while (airs.length <= k + 1) airs.push(makeAir(airs.length, t));
        }
        if (!inAir) settle -= settle * Math.min(1, dt * 10);

        if (Math.abs(st.v) > 520 && Math.random() < 0.5) {
          const q = riderPos();
          streaks.push({ x: q.x - Math.sin(q.phi) * q.sg * (6 + Math.random() * 30), y: q.y - Math.cos(q.phi) * (6 + Math.random() * 30), phi: q.phi, sg: q.sg, len: 12 + Math.random() * 16, life: 0.25 });
        }
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

        // the trick cards, floating at the height of each air: the coming one bold, the next faint
        for (let j = k + 1; j >= k; j--) {
          const air = airs[j];
          if (!air || air.turns === null) continue;
          const cur = j === k && !this.dead;
          air.seen ??= clock;
          const alpha = (cur ? 1 : 0.45) * clamp((clock - air.seen) / 0.3, 0, 1);
          const y = YB - R - air.a - 6;
          const x = CX + air.side * 34;
          const col = air.turns > 0 ? CALL_RIGHT : air.turns < 0 ? CALL_LEFT : '#7a8a96';
          g.globalAlpha = alpha;
          // a dashed line to the wall at that height
          g.strokeStyle = 'rgba(255,255,255,0.8)';
          g.lineWidth = 1.4;
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(x + air.side * 46, y);
          g.lineTo(CX + air.side * (LIPX - 4), y);
          g.stroke();
          g.setLineDash([]);
          const pulse = cur ? 1 + 0.04 * Math.sin(clock * 8) : 1;
          g.save();
          g.translate(x, y);
          g.scale(pulse, pulse);
          g.fillStyle = 'rgba(20,40,60,0.35)';
          roundRect(g, -44, -20, 92, 44, 9);
          g.fill();
          g.fillStyle = '#fffdf6';
          roundRect(g, -46, -22, 92, 44, 9);
          g.fill();
          g.strokeStyle = col;
          g.lineWidth = 3;
          g.stroke();
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = col;
          g.font = '900 19px system-ui, sans-serif';
          const arrows = air.turns > 0 ? '→'.repeat(air.turns) : air.turns < 0 ? '←'.repeat(-air.turns) : '✋';
          g.fillText(arrows, 0, -8);
          g.fillStyle = '#2a1840';
          g.font = '900 12px system-ui, sans-serif';
          g.fillText(air.turns === 0 ? 'NO FLIP' : Math.abs(air.turns) === 2 ? 'DOUBLE' : 'FLIP', 0, 11);
          g.restore();
          g.globalAlpha = 1;
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
          const air = airs[k];
          const spin = inAir ? sp.a : settle;
          // in the air: a ring showing where wheels-down is and the turns done so far
          if (inAir && air.turns !== null && !this.dead) {
            const base = Math.atan2(q.ny, q.nx);
            const tol = air.tol ?? tolAt(tNow);
            const clean = Math.abs(sp.a - air.turns * TAU) <= tol;
            const col = air.turns > 0 ? CALL_RIGHT : air.turns < 0 ? CALL_LEFT : '#7a8a96';
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(q.bx, q.by, 33, 0, TAU);
            g.stroke();
            if (clean) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, greenGlow, q.bx + Math.cos(base) * 33, q.by + Math.sin(base) * 33, { size: 30, alpha: 0.8 });
              g.globalCompositeOperation = 'source-over';
            }
            g.strokeStyle = clean ? '#7cf05a' : '#ffffff';
            g.lineWidth = 6;
            g.beginPath();
            g.arc(q.bx, q.by, 33, base - tol, base + tol);
            g.stroke();
            // the head's direction
            const ha = base + sp.a;
            g.fillStyle = col;
            g.strokeStyle = '#2a1840';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(q.bx + Math.cos(ha) * 41, q.by + Math.sin(ha) * 41);
            g.lineTo(q.bx + Math.cos(ha + 0.2) * 28, q.by + Math.sin(ha + 0.2) * 28);
            g.lineTo(q.bx + Math.cos(ha - 0.2) * 28, q.by + Math.sin(ha - 0.2) * 28);
            g.closePath();
            g.fill();
            g.stroke();
            // one dot per turn called, filled as each is done
            const need = Math.abs(air.turns);
            const done = air.turns ? Math.floor((Math.sign(air.turns) * sp.a + tol) / TAU) : 0;
            for (let d = 0; d < need; d++) {
              const dx = q.bx + (d - (need - 1) / 2) * 12;
              const dy = q.by + 47;
              g.fillStyle = d < done ? col : 'rgba(255,255,255,0.35)';
              g.strokeStyle = '#ffffff';
              g.lineWidth = 1.5;
              g.beginPath();
              g.arc(dx, dy, 4.2, 0, TAU);
              g.fill();
              g.stroke();
            }
          }
          const nearBottom = Math.abs(st.s) < HALF + 40;
          const pose = inAir ? (Math.abs(sp.w) > 1 ? 1 : 0) : nearBottom ? 1 : 0;
          g.save();
          g.translate(q.bx, q.by);
          g.rotate(q.rot + spin);
          g.scale(face, 1);
          g.drawImage(skater[pose].canvas, -17, -25, 34, 50);
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
        sparks.render(g, true);
        fx.render(g);
        g.font = '900 15px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        for (const p of labels) {
          g.globalAlpha = clamp(p.life / 0.5, 0, 1);
          g.fillStyle = '#2a1840';
          g.fillText(p.text, p.x + 1, p.y + 1);
          g.fillStyle = '#ffffff';
          g.fillText(p.text, p.x, p.y);
        }
        g.globalAlpha = 1;

        drawSprite(g, vignette, W / 2, H / 2);
        g.restore();

        // the trick count
        g.font = '800 14px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillStyle = 'rgba(42,24,64,0.6)';
        g.fillText(`🛹 ${landed}`, W - 11, H - 13);
        g.fillStyle = '#ffffff';
        g.fillText(`🛹 ${landed}`, W - 12, H - 14);

        // a hint at the start
        if (tNow < 4 && !this.dead) {
          g.globalAlpha = clamp(4 - tNow, 0, 1) * 0.95;
          g.textAlign = 'center';
          const lines = [
            ['800 14px system-ui, sans-serif', 'hold → or ← in the air to flip', 500],
            ['700 12px system-ui, sans-serif', 'do what the card says, land wheels-down', 520],
          ];
          for (const [font, msg, y] of lines) {
            g.font = font;
            g.fillStyle = 'rgba(20,50,70,0.55)';
            g.fillText(msg, W / 2 + 1, y + 1);
            g.fillStyle = '#ffffff';
            g.fillText(msg, W / 2, y);
          }
          g.globalAlpha = 1;
        }
      },
    };
    return game;
  },
};
