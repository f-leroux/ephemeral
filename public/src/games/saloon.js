// Saloon Shuffle — a shady card sharp in a Wild West saloon hides a gold nugget under one of his
// speckled enamel cups and shuffles them across the green felt. Keep your eye on the cup with the
// gold: whenever the cups stop, the one above your gloved finger gets lifted, and an empty cup
// ends it. The shuffles get faster and longer, a fourth cup joins after 10s and a fifth after 26s, and
// the dealer's tricks pile up: long swaps across the row, two pairs at once, fake swaps that turn
// back halfway, the whole row wheeling round, and finally every cup scrambling at once. The whole
// show is laid out in advance from the rng, so it's the same for everyone.

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
import { BODY_FONT } from '../engine/stage.js';

const ROW_Y = 404; // where the cups' mouths rest on the felt
const HAND_Y = 568;
const LIFT = 50; // how high a lifted cup rises
const REVEAL = 0.8; // a lift: up, a look, back down
const RAIL_Y = 244; // back edge of the table

const slotGap = (n) => (n <= 3 ? 98 : n === 4 ? 80 : 66);
const slotX = (n, i) => 180 + (i - (n - 1) / 2) * slotGap(n);
const cupSize = (n) => (n <= 3 ? 64 : n === 4 ? 60 : 54);

const smooth = (u) => u * u * (3 - 2 * u);

// a cup's position along one move: a quadratic curve, or for a fake, out towards the
// partner's place and back again
function pathAt(pa, u) {
  const e = smooth(clamp(u, 0, 1));
  const s = pa.fake ? 0.6 * Math.sin(Math.PI * e) : e;
  const a = 1 - s;
  return [a * a * pa.ax + 2 * a * s * pa.cx + s * s * pa.bx, a * a * pa.ay + 2 * a * s * pa.cy + s * s * pa.by];
}

// how far a lifted cup is up, u seconds into a reveal
function liftCurve(u) {
  if (u < 0 || u > REVEAL) return 0;
  if (u < 0.18) return smooth(u / 0.18);
  if (u < 0.55) return 1;
  return 1 - smooth((u - 0.55) / (REVEAL - 0.55));
}

// ---------- the dealer's whole show, planned up front ----------

function planShow(rng) {
  let n = 3;
  let order = [0, 1, 2]; // order[slot] = cup id
  const gold = rng.int(0, 2);
  const moves = []; // { t0, dur, paths: [{ id, ax, ay, bx, by, cx, cy, fake, drop }], hands: [id, id] }
  const picks = []; // { t0: "pick!" shown, t1: the lift, n, order }

  const pathFor = (id, i, j, lift, fake = false) => {
    const ax = slotX(n, i);
    const bx = slotX(n, j);
    return { id, ax, ay: ROW_Y, bx, by: ROW_Y, cx: (ax + bx) / 2, cy: ROW_Y + lift, fake };
  };
  // a pair of slots, with the gold cup in it more often than not
  const pair = (far) => {
    const g = order.indexOf(gold);
    let i = rng.chance(0.62) ? g : rng.int(0, n - 1);
    let j;
    if (far && n >= 3) {
      const opts = [];
      for (let k = 0; k < n; k++) if (Math.abs(k - i) >= 2) opts.push(k);
      j = opts.length ? rng.pick(opts) : i === 0 ? 1 : i - 1;
    } else {
      j = i === 0 ? 1 : i === n - 1 ? n - 2 : i + (rng.chance(0.5) ? 1 : -1);
    }
    return i < j ? [i, j] : [j, i];
  };
  const swapPaths = (i, j, fake) => {
    const dy = rng.range(66, 92) * (rng.chance(0.5) ? 1 : -1);
    return [pathFor(order[i], i, j, dy, fake), pathFor(order[j], j, i, -dy, fake)];
  };
  const handsFor = (paths) => {
    const two = paths.slice(0, 2).sort((a, b) => a.ax - b.ax);
    return [two[0]?.id ?? -1, two[1]?.id ?? -1];
  };

  function makeMove(t, p) {
    const kinds = [['swap', 3]];
    if (t > 7) kinds.push(['far', 2]);
    if (t > 15 && n >= 4) kinds.push(['double', 2.2]);
    if (t > 20) kinds.push(['fake', 1.3]);
    if (t > 24) kinds.push(['wheel', 1.2]);
    if (t > 36) kinds.push(['scramble', 1.8 + p]);
    let r = rng.range(0, kinds.reduce((a, k) => a + k[1], 0));
    let kind = kinds[0][0];
    for (const [k, w] of kinds) {
      if ((r -= w) < 0) {
        kind = k;
        break;
      }
    }
    const next = order.slice();
    let paths;
    let k = 1;
    if (kind === 'swap' || kind === 'far' || kind === 'fake') {
      const [i, j] = pair(kind === 'far' || (kind === 'fake' && rng.chance(0.4)));
      paths = swapPaths(i, j, kind === 'fake');
      if (kind !== 'fake') [next[i], next[j]] = [next[j], next[i]];
      k = kind === 'far' ? 1.2 : kind === 'fake' ? 1.1 : 1;
    } else if (kind === 'double') {
      const [i, j] = pair(false);
      const rest = [];
      for (let s = 0; s < n; s++) if (s !== i && s !== j) rest.push(s);
      const a = rng.pick(rest);
      const b = rest.filter((s) => s !== a).sort((x, y) => Math.abs(x - a) - Math.abs(y - a))[0];
      paths = [...swapPaths(i, j, false), ...swapPaths(Math.min(a, b), Math.max(a, b), false)];
      [next[i], next[j]] = [next[j], next[i]];
      [next[a], next[b]] = [next[b], next[a]];
      k = 1.15;
    } else if (kind === 'wheel') {
      // everyone steps one place along; the cup at the end sweeps round the back
      const dir = rng.chance(0.5) ? 1 : -1;
      paths = [];
      for (let s = 0; s < n; s++) {
        const to = (s + dir + n) % n;
        next[to] = order[s];
        const wrap = Math.abs(to - s) > 1;
        paths.push(pathFor(order[s], s, to, wrap ? -150 : 34));
      }
      paths.sort((a, b) => a.cy - b.cy); // the dealer's hands go to the wrapping cup first
      k = 1.35;
    } else {
      // everybody at once, each on its own curve
      let perm;
      do perm = rng.shuffle([...Array(n).keys()]);
      while (perm.every((v, s) => v === s));
      paths = [];
      for (let s = 0; s < n; s++) {
        next[perm[s]] = order[s];
        const pa = pathFor(order[s], s, perm[s], rng.range(-110, 110));
        pa.cx += rng.range(-40, 40);
        paths.push(pa);
      }
      k = 1.55;
    }
    order = next;
    return { kind, k, paths, hands: handsFor(paths) };
  }

  let t = 1.75;
  while (t < 62) {
    // a new cup: the dealer sets it down at one end while the others make room
    if (n < 5 && t >= (n === 3 ? 10 : 26)) {
      const fresh = n;
      const nextOrder = rng.chance(0.5) ? [...order, fresh] : [fresh, ...order];
      const paths = nextOrder.map((id, i) => {
        const bx = slotX(n + 1, i);
        const old = order.indexOf(id);
        if (old < 0) return { id, ax: bx, ay: ROW_Y - 190, bx, by: ROW_Y, cx: bx, cy: ROW_Y - 150, drop: true };
        const ax = slotX(n, old);
        return { id, ax, ay: ROW_Y, bx, by: ROW_Y, cx: (ax + bx) / 2, cy: ROW_Y };
      });
      moves.push({ t0: t, dur: 0.75, paths, hands: [fresh, -1], kind: 'add' });
      order = nextOrder;
      n++;
      t += 0.95;
    }
    const p = progress(t, 60, 1.1);
    const dur = lerp(0.6, 0.23, p);
    const gap = lerp(0.1, 0.025, p);
    const count = Math.round(lerp(3, 8, p)) + rng.int(0, 1);
    for (let c = 0; c < count; c++) {
      const m = makeMove(t, p);
      m.t0 = t;
      m.dur = dur * m.k;
      moves.push(m);
      t += m.dur + gap;
    }
    const pick = lerp(1.2, 0.85, p);
    picks.push({ t0: t, t1: t + pick, n, order: order.slice() });
    t += pick + REVEAL + 0.1;
  }
  return { gold, moves, picks };
}

// ---------- art ----------

const FELT = '#1f6a45';
const CREAM = '#f5e6c4';
const RED = '#c8382c';

function paintWall(W, rng) {
  const H = 270;
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // vertical boards
    for (let x = 0, i = 0; x < W; x += 30, i++) {
      const b = g.createLinearGradient(x, 0, x + 30, 0);
      const tone = ['#5a3420', '#64391f', '#553019', '#5e3722'][i % 4];
      b.addColorStop(0, tone);
      b.addColorStop(0.5, '#6e4227');
      b.addColorStop(1, tone);
      g.fillStyle = b;
      g.fillRect(x, 0, 30, H);
      g.strokeStyle = 'rgba(30,14,6,0.25)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const gx = x + rng.range(4, 26);
        g.beginPath();
        g.moveTo(gx, 0);
        g.bezierCurveTo(gx + rng.range(-4, 4), H * 0.3, gx + rng.range(-4, 4), H * 0.7, gx + rng.range(-3, 3), H);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,4,0.65)';
      g.fillRect(x, 0, 2, H);
      g.fillStyle = 'rgba(30,20,12,0.8)';
      for (const ny of [14, 200]) {
        g.beginPath();
        g.arc(x + 8, ny, 1.6, 0, Math.PI * 2);
        g.arc(x + 22, ny, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // wainscot
    g.fillStyle = '#3b2213';
    g.fillRect(0, 206, W, 64);
    g.fillStyle = 'rgba(255,200,140,0.18)';
    g.fillRect(0, 206, W, 3);
    for (let x = 6; x < W; x += 60) {
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.strokeRect(x, 218, 48, 40);
      g.strokeStyle = 'rgba(255,190,130,0.1)';
      g.strokeRect(x + 2, 220, 48, 40);
    }
    // the shelf of bottles
    g.fillStyle = '#2e190d';
    g.fillRect(0, 62, W, 8);
    g.fillStyle = 'rgba(255,200,140,0.25)';
    g.fillRect(0, 62, W, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 70, W, 6);
    const glass = ['rgba(70,120,60,0.9)', 'rgba(120,60,30,0.9)', 'rgba(150,110,40,0.9)', 'rgba(60,70,110,0.9)', 'rgba(170,150,120,0.8)'];
    for (let x = 8; x < W - 8; x += rng.range(16, 26)) {
      if (x > 112 && x < 248) continue; // behind the dealer anyway
      const h = rng.range(26, 44);
      const w = rng.range(9, 14);
      const c = rng.pick(glass);
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(x - w / 2, 62);
      g.lineTo(x - w / 2, 62 - h * 0.62);
      g.quadraticCurveTo(x - w / 2, 62 - h * 0.75, x - 2.5, 62 - h * 0.82);
      g.lineTo(x - 2.5, 62 - h);
      g.lineTo(x + 2.5, 62 - h);
      g.lineTo(x + 2.5, 62 - h * 0.82);
      g.quadraticCurveTo(x + w / 2, 62 - h * 0.75, x + w / 2, 62 - h * 0.62);
      g.lineTo(x + w / 2, 62);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,240,210,0.45)';
      g.fillRect(x - w / 2 + 2, 62 - h * 0.58, 1.6, h * 0.5);
      if (rng.chance(0.6)) {
        g.fillStyle = 'rgba(240,225,190,0.85)';
        g.fillRect(x - w / 2 + 1, 62 - h * 0.42, w - 2, h * 0.2);
      }
      g.fillStyle = '#3a2412';
      g.fillRect(x - 2.5, 62 - h - 3, 5, 4);
    }
    // a wanted poster
    g.save();
    g.translate(56, 150);
    g.rotate(-0.05);
    g.fillStyle = '#e6d2a2';
    g.fillRect(-30, -40, 60, 80);
    g.fillStyle = 'rgba(120,80,30,0.25)';
    g.fillRect(-30, 30, 60, 10);
    g.fillRect(-30, -40, 6, 80);
    g.fillStyle = '#4a2a14';
    g.font = `900 11px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.fillText('WANTED', 0, -26);
    g.strokeStyle = '#4a2a14';
    g.lineWidth = 1.4;
    g.strokeRect(-17, -20, 34, 32);
    g.beginPath();
    g.arc(0, -2, 8, 0, Math.PI * 2);
    g.moveTo(-12, 12);
    g.quadraticCurveTo(0, 4, 12, 12);
    g.moveTo(-9, -9);
    g.lineTo(9, -9);
    g.stroke();
    g.font = `800 8px ${BODY_FONT}`;
    g.fillText('$500', 0, 26);
    g.fillStyle = '#8a8478';
    g.beginPath();
    g.arc(0, -36, 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // a window onto the desert night
    g.save();
    g.translate(306, 146);
    g.fillStyle = '#2a170b';
    g.fillRect(-34, -42, 68, 84);
    const sky = g.createLinearGradient(0, -38, 0, 38);
    sky.addColorStop(0, '#16224a');
    sky.addColorStop(0.7, '#3a3a6a');
    sky.addColorStop(1, '#7a5a6a');
    g.fillStyle = sky;
    g.fillRect(-29, -37, 58, 74);
    g.fillStyle = '#f4ecd0';
    g.beginPath();
    g.arc(12, -20, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 10; k++) g.fillRect(-27 + rng.range(0, 54), -35 + rng.range(0, 30), 1, 1);
    g.fillStyle = '#20142a';
    g.beginPath();
    g.moveTo(-29, 37);
    g.lineTo(-29, 14);
    g.lineTo(-14, 14);
    g.lineTo(-10, 6);
    g.lineTo(4, 6);
    g.lineTo(8, 16);
    g.lineTo(29, 18);
    g.lineTo(29, 37);
    g.closePath();
    g.fill();
    // a saguaro
    g.strokeStyle = '#20142a';
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(18, 37);
    g.lineTo(18, 10);
    g.moveTo(18, 24);
    g.lineTo(24, 24);
    g.lineTo(24, 16);
    g.moveTo(18, 28);
    g.lineTo(13, 28);
    g.lineTo(13, 20);
    g.stroke();
    g.fillStyle = '#2a170b';
    g.fillRect(-2, -37, 4, 74);
    g.fillRect(-29, -2, 58, 4);
    g.restore();
    // two oil lamps on brackets
    for (const lx of [24, 336]) {
      g.strokeStyle = '#2a1a0e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(lx, 112);
      g.lineTo(lx, 104);
      g.stroke();
      const gl = g.createRadialGradient(lx, 92, 1, lx, 92, 10);
      gl.addColorStop(0, '#fff5c8');
      gl.addColorStop(0.5, '#ffc66a');
      gl.addColorStop(1, 'rgba(220,140,60,0.8)');
      g.fillStyle = gl;
      g.beginPath();
      g.ellipse(lx, 92, 7, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a2412';
      g.fillRect(lx - 7, 102, 14, 4);
      g.fillRect(lx - 4, 78, 8, 4);
    }
  }, 1.5);
}

function paintTable(W, H) {
  const top = RAIL_Y;
  const h = H - top;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const felt = g.createRadialGradient(180, 170, 20, 180, 170, 360);
    felt.addColorStop(0, '#3c9a64');
    felt.addColorStop(0.45, '#257850');
    felt.addColorStop(1, '#0f3a26');
    g.fillStyle = felt;
    g.fillRect(0, 0, W, h);
    // nap of the felt
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,30,15,0.12)' : 'rgba(170,240,190,0.06)';
      g.fillRect(Math.random() * W, Math.random() * h, 1, 1 + Math.random() * 1.5);
    }
    // printed arc and lettering
    g.strokeStyle = 'rgba(245,230,196,0.22)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(180, 70, 168, 150, 0, 0.08 * Math.PI, 0.92 * Math.PI);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(180, 70, 158, 140, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(245,230,196,0.2)';
    g.font = `800 10px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.fillText('·  FOLLOW THE GOLD  ·', 180, 236);
    // back rail
    const rail = g.createLinearGradient(0, 0, 0, 16);
    rail.addColorStop(0, '#8a4a26');
    rail.addColorStop(0.4, '#5a2c14');
    rail.addColorStop(1, '#2a1208');
    g.fillStyle = rail;
    g.fillRect(0, 0, W, 16);
    g.fillStyle = 'rgba(255,210,160,0.35)';
    g.fillRect(0, 1, W, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 16, W, 6);
    // front rail
    const fr = g.createLinearGradient(0, h - 22, 0, h);
    fr.addColorStop(0, '#9a5630');
    fr.addColorStop(0.35, '#6a3418');
    fr.addColorStop(1, '#2a1208');
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, h - 28, W, 6);
    g.fillStyle = fr;
    g.fillRect(0, h - 22, W, 22);
    g.fillStyle = 'rgba(255,210,160,0.4)';
    g.fillRect(0, h - 21, W, 2);
    // poker chips and a few cards
    const chip = (x, y, c) => {
      for (let k = 0; k < 4; k++) {
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(x, y - k * 3 + 2, 11, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y - k * 3, 11, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.setLineDash([2.5, 3]);
        g.lineWidth = 1.4;
        g.stroke();
        g.setLineDash([]);
      }
    };
    chip(24, h - 40, '#b8302a');
    chip(42, h - 34, '#24407a');
    chip(330, h - 38, '#e8e0cc');
    const card = (x, y, rot, red) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-11, -15, 24, 32);
      g.fillStyle = '#f6efe0';
      g.fillRect(-12, -16, 24, 32);
      g.fillStyle = red ? '#b8302a' : '#1a1a1a';
      g.font = `900 10px ${BODY_FONT}`;
      g.textAlign = 'left';
      g.fillText('A', -9, -5);
      g.font = `900 14px ${BODY_FONT}`;
      g.textAlign = 'center';
      g.fillText(red ? '♥' : '♠', 0, 9);
      g.restore();
    };
    card(28, 42, -0.3, true);
    card(46, 48, 0.1, false);
  }, 1);
}

function paintDealer() {
  return makeSprite(180, 200, (g) => {
    // shoulders and black coat
    const coat = g.createLinearGradient(-90, 0, 90, 0);
    coat.addColorStop(0, '#14100e');
    coat.addColorStop(0.5, '#2c2420');
    coat.addColorStop(1, '#14100e');
    g.fillStyle = coat;
    g.beginPath();
    g.moveTo(-82, 100);
    g.quadraticCurveTo(-78, 34, -34, 24);
    g.lineTo(34, 24);
    g.quadraticCurveTo(78, 34, 82, 100);
    g.closePath();
    g.fill();
    // shirt and red vest
    g.fillStyle = '#efe6d2';
    g.beginPath();
    g.moveTo(-22, 22);
    g.lineTo(22, 22);
    g.lineTo(10, 100);
    g.lineTo(-10, 100);
    g.closePath();
    g.fill();
    const vest = g.createLinearGradient(-40, 0, 40, 0);
    vest.addColorStop(0, '#5a1414');
    vest.addColorStop(0.5, '#9a2a22');
    vest.addColorStop(1, '#5a1414');
    g.fillStyle = vest;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 40, 28);
      g.lineTo(s * 14, 32);
      g.lineTo(s * 4, 100);
      g.lineTo(s * 44, 100);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e8c060';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(-12, 56 + k * 14, 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // watch chain
    g.strokeStyle = '#e8c060';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-12, 70);
    g.quadraticCurveTo(4, 82, 20, 74);
    g.stroke();
    // string tie
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-8, 26);
    g.quadraticCurveTo(0, 32, 8, 26);
    g.moveTo(-1, 30);
    g.lineTo(-4, 54);
    g.moveTo(1, 30);
    g.lineTo(4, 54);
    g.stroke();
    // neck and face
    g.fillStyle = '#c98a62';
    g.fillRect(-10, 6, 20, 20);
    const face = g.createRadialGradient(-6, -22, 4, 0, -18, 32);
    face.addColorStop(0, '#f0b98e');
    face.addColorStop(1, '#b8764e');
    g.fillStyle = face;
    g.beginPath();
    g.ellipse(0, -18, 23, 28, 0, 0, Math.PI * 2);
    g.fill();
    // ears
    g.beginPath();
    g.ellipse(-23, -16, 4, 7, 0, 0, Math.PI * 2);
    g.ellipse(23, -16, 4, 7, 0, 0, Math.PI * 2);
    g.fill();
    // shadow of the brim
    g.fillStyle = 'rgba(60,20,10,0.35)';
    g.beginPath();
    g.ellipse(0, -36, 24, 10, 0, 0, Math.PI * 2);
    g.fill();
    // narrowed eyes
    g.strokeStyle = '#2a140c';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 5, -24);
      g.lineTo(s * 14, -26);
      g.stroke();
      g.fillStyle = '#f4f0e0';
      g.beginPath();
      g.ellipse(s * 10, -22.5, 3.2, 1.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a0e08';
      g.beginPath();
      g.arc(s * 10 + 1, -22.5, 1.3, 0, Math.PI * 2);
      g.fill();
    }
    // nose
    g.strokeStyle = 'rgba(120,60,30,0.6)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(1, -20);
    g.quadraticCurveTo(5, -10, 0, -8);
    g.stroke();
    // a sly grin
    g.strokeStyle = '#5a1a10';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-9, 0);
    g.quadraticCurveTo(2, 7, 11, -1);
    g.stroke();
    // handlebar moustache
    g.fillStyle = '#2a160c';
    g.beginPath();
    g.moveTo(0, -6);
    g.bezierCurveTo(-10, -9, -18, -3, -24, -10);
    g.bezierCurveTo(-22, -1, -12, 0, 0, -2);
    g.bezierCurveTo(12, 0, 22, -1, 24, -10);
    g.bezierCurveTo(18, -3, 10, -9, 0, -6);
    g.fill();
    // hat: crown and wide flat brim
    const hat = g.createLinearGradient(-30, -90, 30, -40);
    hat.addColorStop(0, '#3a302a');
    hat.addColorStop(1, '#0e0a08');
    g.fillStyle = hat;
    g.beginPath();
    g.moveTo(-24, -42);
    g.lineTo(-22, -78);
    g.quadraticCurveTo(0, -86, 22, -78);
    g.lineTo(24, -42);
    g.closePath();
    g.fill();
    g.fillStyle = '#8a2020';
    g.fillRect(-24, -52, 48, 7);
    g.fillStyle = '#e8c060';
    g.fillRect(14, -52, 4, 7);
    g.fillStyle = '#16100c';
    g.beginPath();
    g.ellipse(0, -42, 52, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,220,180,0.18)';
    g.beginPath();
    g.ellipse(-6, -45, 40, 4, 0, Math.PI, Math.PI * 2);
    g.fill();
  }, 2);
}

// a speckled red enamel cup, upside down: the mouth at the bottom, a navy rim, the handle right
function paintCup(rng) {
  return makeSprite(72, 64, (g) => {
    const bot = 26;
    const top = -24;
    const shape = () => {
      g.beginPath();
      g.moveTo(-27, bot);
      g.lineTo(-21, top + 6);
      g.quadraticCurveTo(-20, top, -12, top);
      g.lineTo(12, top);
      g.quadraticCurveTo(20, top, 21, top + 6);
      g.lineTo(27, bot);
      g.closePath();
    };
    // handle
    g.strokeStyle = '#7a1c16';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(22, -10);
    g.bezierCurveTo(38, -10, 38, 14, 24, 14);
    g.stroke();
    g.strokeStyle = '#d65a48';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(23, -12);
    g.bezierCurveTo(37, -12, 37, 10, 25, 12);
    g.stroke();
    const body = g.createLinearGradient(-27, 0, 27, 0);
    body.addColorStop(0, '#7a1610');
    body.addColorStop(0.32, '#e04a38');
    body.addColorStop(0.5, '#c8382c');
    body.addColorStop(1, '#6a120c');
    g.fillStyle = body;
    shape();
    g.fill();
    // speckles
    g.save();
    shape();
    g.clip();
    for (let k = 0; k < 70; k++) {
      g.fillStyle = `rgba(255,245,230,${rng.range(0.35, 0.85)})`;
      g.beginPath();
      g.arc(rng.range(-27, 27), rng.range(top, bot), rng.range(0.4, 1.2), 0, Math.PI * 2);
      g.fill();
    }
    // a couple of chips showing dark metal
    g.fillStyle = '#2a2224';
    g.beginPath();
    g.ellipse(-13, 10, 2.5, 1.6, 0.4, 0, Math.PI * 2);
    g.ellipse(9, -14, 1.8, 1.2, 0, 0, Math.PI * 2);
    g.fill();
    // shine
    const sh = g.createLinearGradient(-16, 0, -6, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,240,225,0.5)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(-18, top + 4, 12, bot - top - 10);
    g.restore();
    // top (the cup's base) and navy rims
    g.fillStyle = '#1e2a4a';
    g.beginPath();
    g.ellipse(0, top + 1, 13, 2.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1e2a4a';
    g.beginPath();
    g.moveTo(-27.5, bot - 5);
    g.lineTo(27.5, bot - 5);
    g.lineTo(28, bot);
    g.quadraticCurveTo(0, bot + 4, -28, bot);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(160,180,230,0.6)';
    g.fillRect(-25, bot - 4.5, 50, 1.2);
    g.strokeStyle = 'rgba(40,6,4,0.7)';
    g.lineWidth = 1.2;
    shape();
    g.stroke();
  }, 3);
}

function paintNugget() {
  return makeSprite(30, 24, (g) => {
    const grad = g.createRadialGradient(-4, -4, 1, 0, 0, 13);
    grad.addColorStop(0, '#fff6c0');
    grad.addColorStop(0.35, '#ffd24a');
    grad.addColorStop(0.8, '#c8901a');
    grad.addColorStop(1, '#7a5208');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-12, 3);
    g.quadraticCurveTo(-13, -6, -6, -8);
    g.quadraticCurveTo(-1, -12, 5, -8);
    g.quadraticCurveTo(13, -7, 12, 1);
    g.quadraticCurveTo(13, 8, 4, 8);
    g.quadraticCurveTo(-2, 11, -7, 8);
    g.quadraticCurveTo(-13, 8, -12, 3);
    g.fill();
    g.strokeStyle = 'rgba(110,70,10,0.8)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(140,90,10,0.5)';
    for (const [x, y, r] of [[-5, 2, 2], [4, -2, 1.6], [6, 4, 1.3], [-1, -5, 1.2]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,240,0.9)';
    g.beginPath();
    g.ellipse(-5, -5, 3, 1.5, -0.5, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// the player's tan leather glove, index finger pointing up, fringed cuff
function paintGlove() {
  return makeSprite(48, 70, (g) => {
    const leather = g.createLinearGradient(-16, 0, 16, 0);
    leather.addColorStop(0, '#8a5226');
    leather.addColorStop(0.45, '#d89a58');
    leather.addColorStop(1, '#7a4420');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // finger
    g.strokeStyle = '#6a3a18';
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(-2, -2);
    g.lineTo(-2, -30);
    g.stroke();
    g.strokeStyle = '#d08f4e';
    g.lineWidth = 8.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,230,190,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-4.5, -6);
    g.lineTo(-4.5, -27);
    g.stroke();
    // fist
    g.fillStyle = leather;
    g.beginPath();
    g.moveTo(-15, 0);
    g.quadraticCurveTo(-16, -10, -6, -10);
    g.lineTo(12, -8);
    g.quadraticCurveTo(18, -6, 17, 4);
    g.lineTo(15, 18);
    g.lineTo(-13, 18);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(70,35,12,0.8)';
    g.lineWidth = 1.2;
    g.stroke();
    // curled fingers
    for (const y of [-3, 3, 9]) {
      g.beginPath();
      g.moveTo(5, y);
      g.quadraticCurveTo(14, y - 1, 15, y + 4);
      g.stroke();
    }
    // thumb
    g.fillStyle = '#c4823f';
    g.beginPath();
    g.ellipse(-12, 4, 5, 8, -0.3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // stitching
    g.strokeStyle = 'rgba(255,230,180,0.7)';
    g.setLineDash([2, 2]);
    g.beginPath();
    g.moveTo(-8, -7);
    g.lineTo(-8, 14);
    g.stroke();
    g.setLineDash([]);
    // cuff with fringe and a silver concho
    g.fillStyle = '#a8662e';
    g.fillRect(-16, 17, 33, 12);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(-16, 26, 33, 3);
    g.strokeStyle = '#8a5226';
    g.lineWidth = 2;
    for (let x = -15; x <= 16; x += 4) {
      g.beginPath();
      g.moveTo(x, 28);
      g.lineTo(x + 1, 35);
      g.stroke();
    }
    g.fillStyle = '#e4e4ec';
    g.beginPath();
    g.arc(1, 22, 3.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9a9aa8';
    g.beginPath();
    g.arc(1, 22, 1.6, 0, Math.PI * 2);
    g.fill();
  }, 3);
}

// the dealer's white-gloved hand, seen from above, gripping a cup
function paintDealerHand() {
  return makeSprite(34, 30, (g) => {
    const glove = g.createRadialGradient(-3, -4, 1, 0, 0, 16);
    glove.addColorStop(0, '#ffffff');
    glove.addColorStop(1, '#c8c2b4');
    g.fillStyle = glove;
    g.strokeStyle = 'rgba(80,70,60,0.7)';
    g.lineWidth = 1;
    for (const [x, len] of [[-9, 10], [-3, 12], [3, 12], [9, 10]]) {
      g.beginPath();
      g.ellipse(x, 6 + len / 2, 3, len / 2 + 1, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(-13, 4, 4, 7, 0.5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(80,70,60,0.5)';
    for (const x of [-4, 0, 4]) {
      g.beginPath();
      g.moveTo(x, -8);
      g.lineTo(x * 1.4, -1);
      g.stroke();
    }
  }, 3);
}

// ---------- the game ----------

const SPARKS = ['#fff6c0', '#ffd24a', '#ffb02a', '#ffffff'];
const DUST = ['rgba(200,240,210,0.6)', 'rgba(150,200,170,0.5)'];

export default {
  id: 'saloon',
  title: 'Saloon Shuffle',
  emoji: '🤠',
  tagline: 'Follow the cup hiding the gold. Be under it when the cups stop.',
  colors: { bg: '#2a1810', fg: '#f5e6c4', accent: '#ffc23a' },

  // Spaghetti-western breakbeat, 132 BPM, A minor over the Andalusian cadence (Am G F E). A
  // broken kick and whip-crack snare, a galloping sawtooth bass and a twangy triangle guitar with
  // echoes from the first bar; then string pads and mariachi brass stabs; then a whistled lead
  // with vibrato and claps; and a four-on-the-floor finale with a shaker, a noise wash, a 16th
  // arpeggio and the tune doubled an octave down on a reedy harmonica. 33 bars = 60s.
  music: {
    cps: 0.55,
    setup: `
      const kick = note("a2 ~ ~ ~ ~ ~ a2 ~ ~ ~ a2 ~ ~ ~ ~ ~").s("sine").decay(0.26).sustain(0).gain(0.8)
      const four = note("a2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
      const whip = s("~ ~ ~ ~ white ~ ~ ~ ~ ~ ~ ~ white ~ ~ ~").decay(0.13).sustain(0).hpf(1600).lpf(6000).gain(0.2).room(0.3)
      const gallop = s("[white ~ white white]*4").decay(0.03).sustain(0).hpf(6500).gain("[0.045 0.02 0.03 0.035]*4")
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.13).room(0.35)
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(900).lpf(saw.range(900, 5000).slow(9)).gain(saw.range(0, 0.06).slow(9))
      const bass = note("<[a2 ~ a2 a2 a2 ~ a2 a2 e3 ~ e3 e3 a2 ~ g2 g2] [g2 ~ g2 g2 g2 ~ g2 g2 d3 ~ d3 d3 g2 ~ f2 f2] [f2 ~ f2 f2 f2 ~ f2 f2 c3 ~ c3 c3 f2 ~ e2 e2] [e2 ~ e2 e2 e2 ~ e2 e2 b2 ~ b2 b2 e3 ~ gs2 gs2]>")
        .s("sawtooth").decay(0.12).sustain(0.2).release(0.04).lpf(saw.range(420, 1500).slow(33)).lpq(4).gain(0.34)
      const twang = note("<[a3 e4 a4 c5 e5 c5 a4 e4] [g3 d4 g4 b4 d5 b4 g4 d4] [f3 c4 f4 a4 c5 a4 f4 c4] [e3 b3 e4 gs4 b4 gs4 e4 b3]>")
        .s("triangle").decay(0.16).sustain(0).lpf(saw.range(1800, 3400).slow(33)).gain(0.11).pan(0.38)
        .delay(0.25).delaytime(0.341).delayfeedback(0.3)
      const pad = note("<[a3,c4,e4] [g3,b3,d4] [f3,a3,c4] [e3,gs3,b3]>").s("sawtooth")
        .attack(0.3).decay(0.7).sustain(0.6).release(0.5).lpf(1100).gain(0.05).room(0.45)
      const brass = note("<[a3,c4,e4] [g3,b3,d4] [f3,a3,c4] [e3,gs3,b3,d4]>").struct("~ x ~ ~ x ~ x ~").s("sawtooth")
        .decay(0.14).sustain(0).lpf(1700).gain(0.06).pan(0.62)
      const tune = "<[a4 ~ ~ e5 ~ ~ d5 c5 b4 ~ a4 ~ ~ ~ ~ ~] [g4 ~ ~ d5 ~ ~ c5 b4 a4 ~ g4 ~ ~ ~ ~ ~] [f4 ~ ~ c5 ~ ~ a4 c5 f5 ~ e5 ~ d5 ~ c5 ~] [b4 ~ ~ ~ gs4 ~ ~ ~ e4 ~ ~ ~ ~ ~ ~ ~]>"
      const whistle = note(tune).s("sine").attack(0.02).decay(0.3).sustain(0.6).release(0.2).vib(6).vibmod(0.25)
        .gain(0.15).room(0.5).delay(0.25).delaytime(0.341).delayfeedback(0.3).pan(0.55)
      const harp = note(tune).add(note(-12)).s("sawtooth").decay(0.22).sustain(0.35).release(0.1).lpf(1300).vib(5).vibmod(0.1).gain(0.05).pan(0.45)
      const arp = note("<[a4 c5 e5 c5]*4 [g4 b4 d5 b4]*4 [f4 a4 c5 a4]*4 [e4 gs4 b4 gs4]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3800).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, whip, gallop, bass, twang)],
      [8, stack(kick, whip, gallop, bass, twang, pad, brass)],
      [8, stack(kick, whip, clap, gallop, bass, twang, pad, brass, whistle)],
      [9, stack(four, whip, clap, gallop, shaker, wash, bass, twang, pad, brass, whistle, harp, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const { gold, moves, picks } = planShow(rng.fork('show'));

    const wall = paintWall(W, art);
    const table = paintTable(W, H);
    const dealer = paintDealer();
    const cupArt = paintCup(art);
    const nuggetArt = paintNugget();
    const glove = paintGlove();
    const dHand = paintDealerHand();
    const lampGlow = glowSprite('rgba(255,190,100,0.85)', 60);
    const goldGlow = glowSprite('rgba(255,210,90,0.95)', 40);
    const poolGlow = glowSprite('rgba(255,230,170,0.5)', 120);
    const vignette = vignetteSprite(W, H, 0.6, '20,8,2');
    const fx = createParticles();
    const glow = createParticles();

    const cups = [];
    for (let id = 0; id < 5; id++) {
      const x = id < 3 ? slotX(3, id) : 180;
      cups.push({ id, x, y: ROW_Y, rx: x, ry: ROW_Y, vis: id < 3, alpha: id < 3 ? 1 : 0 });
    }
    const hand = createMover({ x: 180, minX: 26, maxX: W - 26, speed: 400, accel: 20 });
    const dealerHands = [
      { x: 118, y: 318, home: [118, 318] },
      { x: 242, y: 318, home: [242, 318] },
    ];
    const motes = [];
    for (let i = 0; i < 26; i++) motes.push({ x: Math.random() * W, y: 120 + Math.random() * 420, s: 0.6 + Math.random() * 1.4, p: Math.random() * 6 });

    let mi = 0;
    let pi = 0;
    let now = 0;
    let active = null;
    let lifts = []; // { id, t0 }
    let streak = 0;
    let deadT = 0;
    let wrongCup = -1;
    let pops = []; // floating "+1" labels
    let flinch = 0; // the dealer's twitch when you find it

    const finish = (m) => {
      for (const pa of m.paths) {
        const c = cups[pa.id];
        c.rx = pa.fake ? pa.ax : pa.bx;
        c.ry = pa.fake ? pa.ay : pa.by;
        if (pa.drop) fx.burst(pa.bx, ROW_Y + 6, { count: 10, speed: 70, angle: 0, spread: Math.PI * 2, life: 0.5, size: 4, drag: 3, round: true, colors: DUST });
      }
    };

    const nearestSlot = (pk) => {
      let best = 0;
      for (let i = 1; i < pk.n; i++) if (Math.abs(slotX(pk.n, i) - hand.x) < Math.abs(slotX(pk.n, best) - hand.x)) best = i;
      return best;
    };
    const nearestCup = () => {
      let best = null;
      for (const c of cups) if (c.vis && (!best || Math.abs(c.x - hand.x) < Math.abs(best.x - hand.x))) best = c;
      return best;
    };
    const liftOf = (id) => {
      let v = 0;
      if (now < 1.4) v = now < 0.95 ? 1 : 1 - smooth((now - 0.95) / 0.45);
      for (const l of lifts) if (l.id === id) v = Math.max(v, liftCurve(now - l.t0));
      return v;
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        now = t;
        hand.update(dt, dir);
        // the dealer's moves
        while (mi < moves.length && moves[mi].t0 + moves[mi].dur <= t) finish(moves[mi++]);
        active = mi < moves.length && moves[mi].t0 <= t ? moves[mi] : null;
        for (const c of cups) {
          c.x = c.rx;
          c.y = c.ry;
        }
        if (active) {
          const u = (t - active.t0) / active.dur;
          for (const pa of active.paths) {
            const c = cups[pa.id];
            [c.x, c.y] = pathAt(pa, u);
            c.vis = true;
          }
        }
        for (const c of cups) if (c.vis) c.alpha = Math.min(1, c.alpha + dt * 5);

        // the lift
        if (pi < picks.length && t >= picks[pi].t1) {
          const pk = picks[pi++];
          const id = pk.order[nearestSlot(pk)];
          lifts.push({ id, t0: t });
          const c = cups[id];
          if (id !== gold) {
            this.dead = true;
            this.deathReason = 'Lifted an empty cup. The gold was under another one.';
            wrongCup = id;
            fx.burst(c.x, c.y - 4, { count: 14, speed: 90, life: 0.6, size: 4, drag: 3, round: true, colors: DUST });
            return;
          }
          streak++;
          flinch = 1;
          glow.burst(c.x, c.y - 6, { count: 26, speed: 170, life: 0.8, size: 3.5, gravity: 160, colors: SPARKS });
          pops.push({ x: c.x, y: c.y - 70, life: 1 });
        }

        // cosmetic
        lifts = lifts.filter((l) => now - l.t0 < REVEAL + 0.1);
        const pairs = active ? active.hands : [-1, -1];
        dealerHands.forEach((dh, k) => {
          const id = pairs[k];
          const c = id >= 0 ? cups[id] : null;
          const tx = c ? c.x : dh.home[0] + Math.sin(now * 2 + k * 2) * 6;
          const ty = c ? c.y - cupSize(5) * 0.72 : dh.home[1] + Math.sin(now * 3 + k) * 3;
          const f = c ? 0.6 : Math.min(1, dt * 8);
          dh.x += (tx - dh.x) * f;
          dh.y += (ty - dh.y) * f;
        });
        for (const p of pops) {
          p.life -= dt;
          p.y -= 40 * dt;
        }
        pops = pops.filter((p) => p.life > 0);
        flinch = Math.max(0, flinch - dt * 2.5);
        fx.update(dt);
        glow.update(dt);
      },

      afterlife(dt) {
        deadT += dt;
        now += dt;
        // the dealer shows you where it really was
        if (deadT > 0.35 && !lifts.some((l) => l.id === gold)) {
          lifts.push({ id: gold, t0: now });
          const c = cups[gold];
          glow.burst(c.x, c.y - 6, { count: 18, speed: 120, life: 0.8, size: 3, gravity: 120, colors: SPARKS });
        }
        // keep the reveal held up
        for (const l of lifts) if (now - l.t0 > 0.3) l.t0 = now - 0.3;
        fx.update(dt);
        glow.update(dt);
      },

      render(g, t) {
        const n = picks[Math.min(pi, picks.length - 1)]?.n ?? 3;
        // the saloon behind
        drawSprite(g, wall, W / 2, 135);
        g.globalCompositeOperation = 'lighter';
        const fl = 0.85 + 0.15 * Math.sin(now * 13) * Math.sin(now * 7.3);
        drawSprite(g, lampGlow, 24, 92, { size: 130, alpha: 0.6 * fl });
        drawSprite(g, lampGlow, 336, 92, { size: 130, alpha: 0.6 * fl });
        g.globalCompositeOperation = 'source-over';

        // the dealer, leaning in
        const lean = Math.sin(now * 1.7) * 2 + (active ? 3 : 0);
        drawSprite(g, dealer, 180 + Math.sin(now * 1.1) * 2, 168 + lean - flinch * 4);
        if (this.dead) {
          // a gold tooth in a wide grin
          g.fillStyle = '#ffd24a';
          g.fillRect(183, 168 + lean - 19, 4, 3);
        }
        // the table
        drawSprite(g, table, W / 2, RAIL_Y + (H - RAIL_Y) / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, poolGlow, 180, 400, { size: 380, alpha: 0.32 });
        g.globalCompositeOperation = 'source-over';
        // his arms reach over the table to his hands
        for (const [k, dh] of dealerHands.entries()) {
          const sx = k === 0 ? 120 : 240;
          const sy = 214 + lean;
          g.strokeStyle = '#1c1612';
          g.lineCap = 'round';
          g.lineWidth = 16;
          g.beginPath();
          g.moveTo(sx, sy);
          g.quadraticCurveTo((sx + dh.x) / 2 + (k === 0 ? -20 : 20), (sy + dh.y) / 2 - 10, dh.x, dh.y - 14);
          g.stroke();
          g.strokeStyle = 'rgba(255,230,200,0.1)';
          g.lineWidth = 3;
          g.stroke();
        }
        // white cuffs on the arms, over the rail
        for (const dh of dealerHands) {
          g.fillStyle = '#f2ece0';
          g.beginPath();
          g.ellipse(dh.x, dh.y - 13, 9, 6, 0, 0, Math.PI * 2);
          g.fill();
        }

        // what the player points at, and the call to pick
        const pk = picks[pi];
        const picking = !this.dead && pk && now >= pk.t0 && now < pk.t1;
        const sel = this.dead ? cups[wrongCup] : picking ? cups[pk.order[nearestSlot(pk)]] : nearestCup();
        if (sel) {
          const sz = cupSize(n);
          g.strokeStyle = picking ? 'rgba(255,240,200,0.95)' : 'rgba(245,230,196,0.35)';
          g.lineWidth = picking ? 3 : 2;
          g.beginPath();
          g.ellipse(sel.x, sel.y + 6, sz * 0.62, sz * 0.16, 0, 0, Math.PI * 2);
          g.stroke();
          if (picking) {
            const u = (now - pk.t0) / (pk.t1 - pk.t0);
            g.strokeStyle = '#ffc23a';
            g.lineWidth = 4;
            g.beginPath();
            g.ellipse(sel.x, sel.y + 6, sz * 0.62 + 5, sz * 0.16 + 5, 0, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
            g.stroke();
          }
          // chalk line from the fingertip
          g.strokeStyle = picking ? 'rgba(255,240,200,0.7)' : 'rgba(245,230,196,0.25)';
          g.lineWidth = 2;
          g.setLineDash([3, 6]);
          g.beginPath();
          g.moveTo(hand.x, HAND_Y - 40);
          g.lineTo(sel.x, sel.y + 16);
          g.stroke();
          g.setLineDash([]);
        }

        // cups, back to front
        const vis = cups.filter((c) => c.vis).sort((a, b) => a.y - b.y);
        const sz = cupSize(n);
        for (const c of vis) {
          const k = 1 + (c.y - ROW_Y) * 0.0018;
          const lift = liftOf(c.id);
          const s = sz * k;
          g.globalAlpha = c.alpha * (0.4 - lift * 0.2);
          g.fillStyle = '#04140a';
          g.beginPath();
          g.ellipse(c.x + 3, c.y + 6, s * (0.5 + lift * 0.15), s * 0.13, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
          if (c.id === gold && lift > 0.02) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, goldGlow, c.x, c.y - 4, { size: 90, alpha: lift * (0.7 + 0.2 * Math.sin(now * 10)) });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, nuggetArt, c.x, c.y - 4, { size: 30 * k });
          }
          const dropY = c.alpha < 1 ? (1 - c.alpha) * -10 : 0;
          drawSprite(g, cupArt, c.x + s * 0.06, c.y - s * 0.32 - lift * LIFT + dropY, { size: s * 1.12, alpha: c.alpha });
        }
        // the dealer's hands grip the moving cups
        for (const dh of dealerHands) drawSprite(g, dHand, dh.x, dh.y, { size: 30 });

        // "pick!"
        if (picking) {
          const u = (now - pk.t0) / (pk.t1 - pk.t0);
          g.save();
          g.translate(180, 300);
          g.scale(1 + 0.08 * Math.sin(u * Math.PI * 6), 1 + 0.08 * Math.sin(u * Math.PI * 6));
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 26px ${BODY_FONT}`;
          g.lineWidth = 5;
          g.strokeStyle = 'rgba(40,16,6,0.85)';
          g.strokeText('PICK A CUP!', 0, 0);
          g.fillStyle = '#ffd24a';
          g.fillText('PICK A CUP!', 0, 0);
          g.restore();
        }

        // dust motes in the lamplight
        g.fillStyle = 'rgba(255,240,200,0.35)';
        for (const m of motes) {
          const x = (m.x + now * 6 * m.s + Math.sin(now * 0.7 + m.p) * 10) % W;
          const y = m.y + Math.sin(now * 0.5 + m.p * 2) * 12;
          g.fillRect(x, y, m.s, m.s);
        }

        // the player's glove
        g.save();
        g.translate(hand.x, HAND_Y);
        g.rotate(hand.lean * 0.18);
        drawSprite(g, glove, 0, 0, { size: 46 });
        g.restore();

        fx.render(g);
        glow.render(g, true);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 18px ${BODY_FONT}`;
        for (const p of pops) {
          g.globalAlpha = clamp(p.life * 1.5, 0, 1);
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(40,16,6,0.8)';
          g.strokeText('GOLD!', p.x, p.y);
          g.fillStyle = '#ffd24a';
          g.fillText('GOLD!', p.x, p.y);
        }
        g.globalAlpha = 1;
        drawSprite(g, vignette, W / 2, H / 2);

        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `800 13px ${BODY_FONT}`;
        g.fillStyle = 'rgba(245,230,196,0.92)';
        g.fillText(`Gold found × ${streak}`, 12, H - 6);
      },
    };
    return game;
  },
};
