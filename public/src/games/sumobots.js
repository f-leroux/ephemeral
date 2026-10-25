// Sumo Bots — a robot sumo bout under the stadium lights. Your little amber wedge bot is locked
// nose to nose with an opponent on a black steel ring, and it leans on you the whole time, so you
// hold → just to keep your ground. Every few beats it shows its next move on a badge: when it RAMS,
// push back hard; when it GRABS you with its claw, reverse or it yanks you off your wheels; when it
// DODGES, ease off, because pushing into thin air gets you flipped. Shove it off the edge and the
// next, bigger bot drops in. Moves land on the beat of the song and come faster, with feints that
// change their badge halfway, flurries of rams and traps at the end of them. Every move is planned
// up front from the rng, so it's the same bout for everyone.

import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';
import { BODY_FONT } from '../engine/stage.js';

const BEAT = 60 / 140; // the song's beat: every move lands on it
const HB = BEAT / 2;
const GROUND = 514; // where the wheels touch the ring
const ACX = 180; // the ring's top ellipse
const ACY = 506;
const ARX = 174;
const ARY = 46;
const EDGE_L = 12; // a bot whose centre passes these falls off
const EDGE_R = 348;
const K = 130; // how fast the pair slides per unit of force difference
const SAFE_T = 2.2; // nobody falls off before this
const DODGE_WIN = 0.24; // pushing this soon after a dodge flips you
const GRAB_GRACE = 0.12; // how long you can fail to reverse in a grab

const MOVES = {
  shove: { label: 'RAM', hint: 'PUSH  ▶', color: '#ff5240', rgb: '255,82,64' },
  grab: { label: 'GRAB', hint: '◀  REVERSE', color: '#c98bff', rgb: '201,139,255' },
  dodge: { label: 'DODGE', hint: 'LET GO', color: '#45e8ff', rgb: '69,232,255' },
};

const pressure = (t) => lerp(0.76, 0.97, progress(t, 60, 1.2)) * clamp((t - 0.4) / 1, 0, 1);
const shoveForce = (t) => lerp(1.45, 1.85, progress(t, 60, 1.2));

const PLAYER = { name: 'SPARKY', kind: 'wedge', w: 66, h: 70, main: '#ffb21e', dark: '#8f4c00', light: '#ffe596', eye: '#6ff6ff', r: 13 };
const ROSTER = [
  { name: 'RAMROD', kind: 'ram', w: 70, h: 74, main: '#e0335e', dark: '#6e1029', light: '#ff8fab', eye: '#ffd2dc', r: 13 },
  { name: 'VOLTA', kind: 'dome', w: 72, h: 92, main: '#8b5cf6', dark: '#35198a', light: '#cdb8ff', eye: '#a8fbff', r: 12 },
  { name: 'TREADZILLA', kind: 'tank', w: 80, h: 70, main: '#7cc23a', dark: '#2a520f', light: '#cff593', eye: '#fff07a', r: 12 },
  { name: 'OBSIDIAN', kind: 'spiky', w: 76, h: 80, main: '#3e4254', dark: '#121319', light: '#959bb8', eye: '#ff7af4', r: 13 },
  { name: 'MEGATON', kind: 'heavy', w: 88, h: 96, main: '#4f86c6', dark: '#1a3760', light: '#b2d4f8', eye: '#ffc56a', r: 15 },
];

// ---------- the opponent's whole show, planned up front ----------

function planMoves(rng) {
  const moves = [];
  let h = 10; // in half-beats: the first badge goes up at ~2.1s
  let last = '';
  let run = 0;
  const others = (type) => ['shove', 'grab', 'dodge'].filter((k) => k !== type);
  const add = (type, tellH, extra = {}) => {
    const m = { type, tell0: h * HB, act: (h + tellH) * HB, spent: type === 'shove' ? BEAT : 0, ...extra };
    m.end = m.act + BEAT + m.spent;
    moves.push(m);
    h += tellH + 2 + (m.spent ? 2 : 0);
    return m;
  };
  while (h * HB < 59) {
    const t = h * HB;
    const p = progress(t, 60, 1.15);
    const kinds = [['shove', 3]];
    if (t > 6) kinds.push(['grab', 2.2]);
    if (t > 10) kinds.push(['dodge', 2.5]);
    if (t > 22) kinds.push(['feint', 1.6]);
    if (t > 30) kinds.push(['flurry', 1.2]);
    let kind;
    for (let tries = 0; tries < 3; tries++) {
      let r = rng.range(0, kinds.reduce((a, k) => a + k[1], 0));
      kind = kinds[0][0];
      for (const [k, wt] of kinds) {
        if ((r -= wt) < 0) {
          kind = k;
          break;
        }
      }
      if (!(kind === last && run >= 2)) break;
    }
    run = kind === last ? run + 1 : 1;
    last = kind;
    const tellH = t < 14 ? 4 : t < 28 ? 3 : t < 44 ? (rng.chance(0.5) ? 2 : 3) : 2;
    if (kind === 'flurry') {
      // a run of quick rams: keep pushing through them all
      const n = rng.int(3, t > 45 ? 5 : 4);
      for (let i = 0; i < n; i++) {
        const m = add('shove', 2, { flurry: true });
        if (i < n - 1) {
          m.spent = 0;
          m.end = m.act + BEAT;
          h -= 2;
        }
      }
      // and sometimes a trap straight after it
      if (rng.chance(0.55)) {
        h += 1;
        add(rng.pick(['dodge', 'grab']), 3);
      }
    } else if (kind === 'feint') {
      // the badge shows one move, then flips to another
      const fake = rng.pick(['shove', 'grab', 'dodge']);
      const real = rng.pick(others(fake));
      const m = add(real, 2 + Math.max(2, tellH - 1), { fake });
      m.switchT = m.tell0 + 2 * HB;
    } else {
      add(kind, tellH);
    }
    h += Math.round(lerp(5, 1, p)) + rng.int(0, 1);
  }
  return moves;
}

// ---------- art ----------

function paintWheel(r) {
  return makeSprite(r * 2 + 2, r * 2 + 2, (g) => {
    const tyre = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    tyre.addColorStop(0, '#3a3d45');
    tyre.addColorStop(1, '#0d0e12');
    g.fillStyle = tyre;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    // tread blocks round the rim
    g.fillStyle = '#05060a';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.fillRect(r - 2.6, -1.4, 2.6, 2.8);
      g.restore();
    }
    const rim = g.createLinearGradient(-r, -r, r, r);
    rim.addColorStop(0, '#f1f4f8');
    rim.addColorStop(0.5, '#8d96a6');
    rim.addColorStop(1, '#4b5260');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(0, 0, r * 0.58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2e37';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, r * 0.11, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d7dce4';
    g.beginPath();
    g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r - 1.2, Math.PI * 1.05, Math.PI * 1.55);
    g.stroke();
  });
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function steel(g, x0, y0, x1, y1) {
  const s = g.createLinearGradient(x0, y0, x1, y1);
  s.addColorStop(0, '#f4f6f9');
  s.addColorStop(0.45, '#a7afbd');
  s.addColorStop(1, '#4c5361');
  return s;
}

// A robot in side view, facing right (+x), with the ground line at y = 0. Wheels and eyes are drawn
// live on top; this paints everything that never changes.
function paintBot(d) {
  const { w, h, r, kind } = d;
  const SW = w + 44;
  const SH = h + 44;
  const x0 = -w / 2;
  const x1 = w / 2;
  const top = -Math.round(h * (kind === 'dome' ? 0.5 : kind === 'heavy' ? 0.56 : 0.58));
  const bot = -r * 0.55;
  let cab = null;
  let visor;
  if (kind === 'wedge') cab = { x: x0 + 6, y: -h, w: w - 32, h: h + top };
  else if (kind === 'ram') cab = { x: x0 + 4, y: -h, w: w - 24, h: h + top };
  else if (kind === 'tank') cab = { x: x0 + 10, y: -h, w: w - 28, h: h + top };
  else if (kind === 'spiky') cab = { x: x0 + 4, y: -h, w: w - 22, h: h + top };
  else if (kind === 'heavy') cab = { x: x0 + 2, y: -h, w: w - 12, h: h + top };
  const domeR = w * 0.36;
  if (cab) {
    const vw = kind === 'heavy' ? 32 : kind === 'spiky' ? 28 : 24;
    const vh = kind === 'spiky' ? 10 : kind === 'heavy' ? 20 : Math.min(18, cab.h - 12);
    visor = { x: cab.x + cab.w - vw - 4, y: cab.y + (kind === 'spiky' ? 10 : 7), w: vw, h: vh };
  } else {
    visor = { x: 2, y: top - domeR * 0.66, w: domeR * 0.86, h: 13 };
  }
  const wheels = kind === 'tank' ? [] : [x0 + r + 4, x1 - r - 4];

  const spr = makeSprite(SW, SH, (g) => {
    g.translate(0, SH / 2 - 10);
    g.lineJoin = 'round';

    // tank treads: the band behind the lugs drawn live
    if (kind === 'tank') {
      rrect(g, x0 - 3, -2 * r - 2, w + 6, 2 * r + 2, r + 1);
      g.fillStyle = '#16181d';
      g.fill();
      g.fillStyle = '#3b3f48';
      for (const wx of [x0 + r, 0, x1 - r]) {
        g.beginPath();
        g.arc(wx, -r - 1, r * 0.62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#7d8593';
        g.beginPath();
        g.arc(wx, -r - 1, r * 0.22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3b3f48';
      }
    }

    // the dome sits behind the chassis
    if (kind === 'dome') {
      const dg = g.createRadialGradient(-domeR * 0.2, top - domeR * 0.6, domeR * 0.1, 0, top, domeR * 1.1);
      dg.addColorStop(0, d.light);
      dg.addColorStop(0.5, d.main);
      dg.addColorStop(1, d.dark);
      g.fillStyle = dg;
      g.beginPath();
      g.arc(-2, top + 2, domeR, Math.PI, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 1.5;
      g.stroke();
      // the tesla coil on top
      g.fillStyle = steel(g, -6, 0, 6, 0);
      g.fillRect(-4, -h + 10, 5, top - domeR - (-h + 10) + 4);
      g.strokeStyle = '#d98b3a';
      g.lineWidth = 2;
      for (let y = -h + 16; y < top - domeR + 2; y += 4) {
        g.beginPath();
        g.moveTo(-7, y);
        g.lineTo(4, y + 1.5);
        g.stroke();
      }
      const sg = g.createRadialGradient(-3, -h + 6, 1, -1.5, -h + 9, 7);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#8a92a3');
      g.fillStyle = sg;
      g.beginPath();
      g.arc(-1.5, -h + 9, 6.5, 0, Math.PI * 2);
      g.fill();
      // panel seams on the dome
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(-2, top + 2, domeR * 0.7, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }

    // heavy: an exhaust stack at the back
    if (kind === 'heavy') {
      g.fillStyle = steel(g, x0, 0, x0 + 10, 0);
      g.fillRect(x0 + 4, -h - 10, 8, 24);
      g.fillStyle = '#20232b';
      g.fillRect(x0 + 4, -h - 12, 8, 3);
    }

    // chassis
    const cg = g.createLinearGradient(0, top, 0, bot);
    cg.addColorStop(0, d.light);
    cg.addColorStop(0.25, d.main);
    cg.addColorStop(1, d.dark);
    rrect(g, x0, top, w, bot - top, 6);
    g.fillStyle = cg;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x0 + 5, top + 2, w - 10, 1.6);
    // seams and rivets
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x0 + 4, (top + bot) / 2 + 2);
    g.lineTo(x1 - 4, (top + bot) / 2 + 2);
    for (const sx of [x0 + w * 0.34, x0 + w * 0.67]) {
      g.moveTo(sx, top + 4);
      g.lineTo(sx, bot - 3);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = x0 + 6; x < x1 - 4; x += 9) {
      g.beginPath();
      g.arc(x, top + 6, 1.1, 0, Math.PI * 2);
      g.fill();
    }

    // the cab with its visor
    if (cab) {
      const kg = g.createLinearGradient(cab.x, cab.y, cab.x + cab.w, cab.y + cab.h);
      kg.addColorStop(0, d.light);
      kg.addColorStop(0.4, d.main);
      kg.addColorStop(1, d.dark);
      rrect(g, cab.x, cab.y, cab.w, cab.h + 4, kind === 'heavy' ? 5 : 8);
      g.fillStyle = kg;
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(cab.x + 6, cab.y + 2, cab.w - 14, 1.5);
    }
    // visor glass
    const vg = g.createLinearGradient(0, visor.y, 0, visor.y + visor.h);
    vg.addColorStop(0, '#1e2a3a');
    vg.addColorStop(1, '#04070c');
    rrect(g, visor.x, visor.y, visor.w, visor.h, Math.min(5, visor.h / 2));
    g.fillStyle = vg;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.lineWidth = 1.2;
    g.stroke();

    if (kind === 'wedge') {
      // the steel scoop at the front
      g.fillStyle = steel(g, x1 - 20, top, x1 + 10, 0);
      g.beginPath();
      g.moveTo(x1 - 16, top + 1);
      g.lineTo(x1 - 2, top + 1);
      g.lineTo(x1 + 12, -2);
      g.lineTo(x1 - 6, -2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.moveTo(x1 - 2, top + 2);
      g.lineTo(x1 + 10, -3);
      g.stroke();
      // hazard stripes along the skirt
      g.save();
      g.beginPath();
      g.rect(x0 + 3, bot - 7, w - 18, 5);
      g.clip();
      g.fillStyle = '#16120a';
      g.fillRect(x0, bot - 7, w, 5);
      g.fillStyle = '#ffd23a';
      for (let x = x0 - 6; x < x1; x += 8) {
        g.beginPath();
        g.moveTo(x, bot - 2);
        g.lineTo(x + 4, bot - 7);
        g.lineTo(x + 8, bot - 7);
        g.lineTo(x + 4, bot - 2);
        g.fill();
      }
      g.restore();
      // racing number
      g.fillStyle = 'rgba(40,20,0,0.75)';
      g.font = `900 13px ${BODY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('07', x0 + w * 0.32, (top + bot) / 2 - 3);
      // antenna
      g.strokeStyle = '#5b606b';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(cab.x + 8, cab.y + 2);
      g.lineTo(cab.x + 4, cab.y - 13);
      g.stroke();
    } else if (kind === 'ram') {
      // a battering plate bolted to the front
      g.fillStyle = steel(g, x1 - 6, 0, x1 + 10, 0);
      rrect(g, x1 - 6, -h * 0.74, 13, h * 0.74 - 3, 3);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.stroke();
      g.fillStyle = '#3a3f4a';
      for (let y = -h * 0.66; y < -8; y += 11) {
        g.beginPath();
        g.arc(x1 + 0.5, y, 1.7, 0, Math.PI * 2);
        g.fill();
      }
      // white racing stripes
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(x0 + 4, (top + bot) / 2 - 7, w - 16, 3);
      g.fillRect(x0 + 4, (top + bot) / 2 - 2, w - 16, 1.5);
    } else if (kind === 'spiky') {
      g.fillStyle = steel(g, 0, -h, 0, 0);
      for (let y = top + 4; y < bot - 2; y += 9) {
        g.beginPath();
        g.moveTo(x1 - 1, y);
        g.lineTo(x1 + 11, y + 4);
        g.lineTo(x1 - 1, y + 8);
        g.closePath();
        g.fill();
      }
      for (let x = cab.x + 6; x < cab.x + cab.w - 4; x += 11) {
        g.beginPath();
        g.moveTo(x, cab.y + 1);
        g.lineTo(x + 4.5, cab.y - 9);
        g.lineTo(x + 9, cab.y + 1);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = 'rgba(255,122,244,0.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0 + 4, bot - 5);
      g.lineTo(x1 - 4, bot - 5);
      g.stroke();
    } else if (kind === 'heavy') {
      // shoulder armour and rivet rows
      g.fillStyle = steel(g, 0, top - 8, 0, top + 10);
      rrect(g, x0 - 3, top - 6, w * 0.42, 14, 6);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = x0 + 8; x < x1 - 6; x += 8) {
        g.beginPath();
        g.arc(x, bot - 6, 1.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffd23a';
      g.fillRect(x1 - 5, top + 6, 3, bot - top - 12);
    } else if (kind === 'tank') {
      // camo blotches
      g.fillStyle = 'rgba(30,60,10,0.35)';
      for (const [bx, by, br] of [[x0 + 14, top + 12, 6], [x0 + 30, (top + bot) / 2, 5], [x0 + 48, top + 9, 4], [x1 - 22, bot - 10, 5]]) {
        g.beginPath();
        g.ellipse(bx, by, br * 1.6, br, 0.3, 0, Math.PI * 2);
        g.fill();
      }
      // a small front scoop
      g.fillStyle = steel(g, x1, top, x1 + 8, 0);
      g.beginPath();
      g.moveTo(x1 - 2, top + 4);
      g.lineTo(x1 + 7, -2 * r - 1);
      g.lineTo(x1 - 2, -2 * r - 1);
      g.closePath();
      g.fill();
    }
  });
  return { d, spr, SW, SH, visor, wheels, wheel: paintWheel(r), top, cab, domeR };
}

function paintBackdrop(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // back wall of the hall
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#0d0f14');
    wall.addColorStop(0.35, '#181c25');
    wall.addColorStop(0.7, '#20252f');
    wall.addColorStop(1, '#0a0b0f');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    // steel roof girders far back
    g.strokeStyle = 'rgba(120,135,160,0.12)';
    g.lineWidth = 2;
    for (let x = -40; x < W + 40; x += 60) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 30, 120);
      g.lineTo(x + 60, 0);
      g.stroke();
    }
    // the stands: tiers of fans in the half-light
    for (let row = 0; row < 15; row++) {
      const y = 168 + row * 18;
      const lit = 0.35 + row * 0.04;
      const tier = g.createLinearGradient(0, y, 0, y + 18);
      tier.addColorStop(0, `rgba(48,54,68,${lit})`);
      tier.addColorStop(1, `rgba(18,20,27,${lit})`);
      g.fillStyle = tier;
      g.fillRect(0, y + 8, W, 10);
      const off = (row % 2) * 6;
      for (let x = -6 + off; x < W + 10; x += 12 + rng.range(-1, 2)) {
        if (rng.chance(0.08)) continue;
        const hx = x + rng.range(-1.5, 1.5);
        const hy = y + rng.range(-1, 1.5);
        const shirt = rng.pick(['#c0392b', '#2471a3', '#d4ac0d', '#7d3c98', '#16a085', '#e67e22', '#566573', '#ecf0f1', '#cb4335']);
        g.globalAlpha = 0.25 + lit * 0.55;
        g.fillStyle = shirt;
        g.beginPath();
        g.roundRect(hx - 5.5, hy + 4, 11, 10, 4);
        g.fill();
        g.fillStyle = rng.pick(['#8d5b3e', '#c68b62', '#e0b48f', '#5b3a29', '#a8704f']);
        g.beginPath();
        g.arc(hx, hy + 1, 4, 0, Math.PI * 2);
        g.fill();
        if (rng.chance(0.25)) {
          g.fillStyle = rng.pick(['#2b1a12', '#111', '#5a3a1a', '#d9c27a']);
          g.beginPath();
          g.arc(hx, hy - 0.5, 4.2, Math.PI, 0);
          g.fill();
        }
        // a raised arm with a phone light, or a foam finger
        if (rng.chance(0.05)) {
          g.fillStyle = '#ffffff';
          g.globalAlpha = 0.8;
          g.fillRect(hx + 4, hy - 9, 2.4, 3.6);
        } else if (rng.chance(0.03)) {
          g.fillStyle = '#ffb21e';
          g.fillRect(hx + 3, hy - 12, 4, 11);
        }
        g.globalAlpha = 1;
      }
      // a few banners hung on the tier fronts
      if (row === 4 || row === 9) {
        for (let i = 0; i < 2; i++) {
          const bx = rng.range(20, W - 90);
          g.fillStyle = rng.pick(['#ffb21e', '#e0335e', '#45e8ff', '#8b5cf6']);
          g.globalAlpha = 0.5;
          g.fillRect(bx, y + 9, 64, 11);
          g.globalAlpha = 0.9;
          g.fillStyle = '#0d0f14';
          g.font = `900 8px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(rng.pick(['GO SPARKY!', 'PUSH IT!', '07 ♥', 'BOT SUMO']), bx + 32, y + 15);
          g.globalAlpha = 1;
        }
      }
    }
    // keep the crowd in the half-dark so the ring stands out
    const dim = g.createLinearGradient(0, 160, 0, 430);
    dim.addColorStop(0, 'rgba(10,11,15,0.62)');
    dim.addColorStop(1, 'rgba(10,11,15,0.45)');
    g.fillStyle = dim;
    g.fillRect(0, 160, W, 270);
    // the hall darkens towards the roof
    const fade = g.createLinearGradient(0, 120, 0, 260);
    fade.addColorStop(0, 'rgba(10,11,15,0.95)');
    fade.addColorStop(1, 'rgba(10,11,15,0)');
    g.fillStyle = fade;
    g.fillRect(0, 120, W, 140);

    // lighting truss
    g.fillStyle = '#3d434f';
    g.fillRect(0, 124, W, 3);
    g.fillRect(0, 136, W, 3);
    g.strokeStyle = '#555c6a';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = 0; x < W; x += 12) {
      g.moveTo(x, 127);
      g.lineTo(x + 6, 136);
      g.lineTo(x + 12, 127);
    }
    g.stroke();
    for (const lx of [50, 130, 230, 310]) {
      g.fillStyle = '#23272f';
      g.beginPath();
      g.roundRect(lx - 9, 139, 18, 14, 3);
      g.fill();
      g.fillStyle = '#fffbe8';
      g.beginPath();
      g.ellipse(lx, 153, 7, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    // scoreboard cables
    g.strokeStyle = '#2c313b';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(60, 0);
    g.lineTo(60, 54);
    g.moveTo(300, 0);
    g.lineTo(300, 54);
    g.stroke();

    // LED ad boards along the barrier
    g.fillStyle = '#07080b';
    g.fillRect(0, 430, W, 24);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < W; x += 3) for (let y = 432; y < 452; y += 3) g.fillRect(x, y, 1.4, 1.4);
    g.fillStyle = '#2c313b';
    g.fillRect(0, 428, W, 2);
    g.fillRect(0, 454, W, 2);

    // floor of the hall
    const floor = g.createLinearGradient(0, 456, 0, H);
    floor.addColorStop(0, '#15181f');
    floor.addColorStop(1, '#07080b');
    g.fillStyle = floor;
    g.fillRect(0, 456, W, H - 456);
    g.strokeStyle = 'rgba(69,232,255,0.07)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = -8; i <= 8; i++) {
      g.moveTo(180 + i * 30, 470);
      g.lineTo(180 + i * 90, H);
    }
    for (let y = 580; y < H; y += 18) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();

    // the ring: a steel drum with a black top and a white edge line
    const sideTop = ACY;
    const sideBot = ACY + 54;
    const side = g.createLinearGradient(ACX - ARX, 0, ACX + ARX, 0);
    side.addColorStop(0, '#16181e');
    side.addColorStop(0.3, '#4a505d');
    side.addColorStop(0.55, '#6c7383');
    side.addColorStop(1, '#1b1e25');
    g.fillStyle = side;
    g.beginPath();
    g.moveTo(ACX - ARX, sideTop);
    g.lineTo(ACX - ARX, sideBot);
    g.ellipse(ACX, sideBot, ARX, ARY, 0, Math.PI, 0, true);
    g.lineTo(ACX + ARX, sideTop);
    g.closePath();
    g.fill();
    // hazard band round the lip
    g.save();
    g.beginPath();
    g.moveTo(ACX - ARX, sideTop);
    g.ellipse(ACX, sideTop, ARX, ARY, 0, Math.PI, 0, true);
    g.lineTo(ACX + ARX, sideTop + 10);
    g.ellipse(ACX, sideTop + 10, ARX, ARY, 0, 0, Math.PI, false);
    g.closePath();
    g.clip();
    g.fillStyle = '#16120a';
    g.fillRect(0, sideTop, W, ARY + 12);
    g.fillStyle = '#ffd23a';
    for (let x = -30; x < W + 30; x += 14) {
      g.beginPath();
      g.moveTo(x, sideTop + ARY + 12);
      g.lineTo(x + 7, sideTop);
      g.lineTo(x + 14, sideTop);
      g.lineTo(x + 7, sideTop + ARY + 12);
      g.fill();
    }
    g.restore();
    // bolts on the drum
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 1; i < 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      const bx = ACX + Math.cos(a) * ARX * 0.98;
      const by = sideTop + 32 + Math.sin(a) * ARY;
      g.beginPath();
      g.arc(bx, by, 1.5, 0, Math.PI * 2);
      g.fill();
    }
    // top surface
    const topg = g.createRadialGradient(ACX - 30, ACY - 16, 10, ACX, ACY, ARX);
    topg.addColorStop(0, '#2a2e38');
    topg.addColorStop(0.6, '#121419');
    topg.addColorStop(1, '#07080b');
    g.fillStyle = topg;
    g.beginPath();
    g.ellipse(ACX, ACY, ARX, ARY, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f2f2f0';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(ACX, ACY, ARX - 8, ARY - 4, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(ACX, ACY, ARX - 1, ARY - 0.5, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    // the two brown start lines
    g.strokeStyle = '#8a4b2a';
    g.lineWidth = 3;
    g.beginPath();
    for (const sx of [ACX - 24, ACX + 24]) {
      g.moveTo(sx, ACY - 22);
      g.lineTo(sx, ACY - 2);
    }
    g.stroke();
  }, 2);
}

function paintCone() {
  return makeSprite(150, 440, (g) => {
    g.translate(0, -220);
    const grad = g.createLinearGradient(0, 0, 0, 440);
    grad.addColorStop(0, 'rgba(255,246,220,0.32)');
    grad.addColorStop(0.6, 'rgba(255,240,210,0.1)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-7, 0);
    g.lineTo(7, 0);
    g.lineTo(75, 440);
    g.lineTo(-75, 440);
    g.closePath();
    g.fill();
  }, 1);
}

function drawEyes(g, v, mood, col, look, blink) {
  const cx = v.x + v.w / 2 + look * v.w * 0.1;
  const cy = v.y + v.h / 2;
  const sp = v.w * 0.24;
  const eh = Math.min(v.h * 0.64, 11) * (blink && mood === 'calm' ? 0.18 : 1);
  const ew = Math.max(2.4, v.w * 0.12);
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  for (const e of [-1, 1]) {
    const x = cx + e * sp;
    g.beginPath();
    if (mood === 'angry') {
      const drop = eh * 0.55;
      g.moveTo(x - ew, cy - eh / 2 + (e < 0 ? 0 : drop));
      g.lineTo(x + ew, cy - eh / 2 + (e < 0 ? drop : 0));
      g.lineTo(x + ew, cy + eh / 2);
      g.lineTo(x - ew, cy + eh / 2);
      g.closePath();
      g.fill();
    } else if (mood === 'strain') {
      const s = Math.min(ew * 1.3, eh * 0.5);
      g.moveTo(x - e * s, cy - s);
      g.lineTo(x + e * s, cy);
      g.lineTo(x - e * s, cy + s);
      g.stroke();
    } else if (mood === 'shifty') {
      g.roundRect(x - ew * 1.1 - v.w * 0.08, cy - eh * 0.45, ew * 2.2, eh * 0.42, 1.5);
      g.fill();
    } else if (mood === 'grab') {
      g.roundRect(x - ew * 1.2, cy - eh / 2, ew * 2.4, eh, 1);
      g.fill();
    } else if (mood === 'shock') {
      g.lineWidth = 1.6;
      g.arc(x, cy, Math.min(ew * 1.2, eh * 0.45), 0, Math.PI * 2);
      g.stroke();
    } else {
      g.roundRect(x - ew, cy - eh / 2, ew * 2, eh, ew);
      g.fill();
    }
  }
}

function drawBadge(g, x, y, type, u, k, flipT) {
  const m = MOVES[type];
  const pulse = 1 + 0.06 * Math.sin(u * Math.PI * 6) + (flipT > 0 ? flipT * 0.3 : 0);
  g.save();
  g.translate(x, y);
  g.scale(pulse * k, pulse * k);
  g.fillStyle = 'rgba(8,10,15,0.88)';
  g.strokeStyle = m.color;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(-52, -28, 104, 54, 12);
  g.fill();
  g.stroke();
  // a pointer down to the bot
  g.fillStyle = m.color;
  g.beginPath();
  g.moveTo(-7, 26);
  g.lineTo(7, 26);
  g.lineTo(0, 34);
  g.closePath();
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 22px ${BODY_FONT}`;
  g.fillStyle = m.color;
  g.fillText(m.label, 0, -9);
  g.font = `800 11px ${BODY_FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText(m.hint, 0, 10);
  // the fuse: burns down to the move
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(-42, 18, 84, 3);
  g.fillStyle = m.color;
  g.fillRect(-42, 18, 84 * (1 - u), 3);
  g.restore();
}

// ---------- the game ----------

export default {
  id: 'sumobots',
  title: 'Sumo Bots',
  emoji: '🤖',
  tagline: 'Push back when it rams, reverse when it grabs, never push a dodge.',
  colors: { bg: '#15181f', fg: '#ffffff', accent: '#ffb21e' },

  // Robot dubstep in C♯ minor (C♯m – A – E – B), 140 BPM half-time: kick, snare, hats and a stepped
  // sawtooth wobble bass from the first bar; then claps, square chord stabs and a laser arpeggio;
  // then a busier kick and a sawtooth lead with vibrato and echoes; the finale doubles the wobble
  // speed and adds a shaker, a noise riser and the lead an octave down. 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("cs2 ~ ~ ~ ~ ~ ~ ~ ~ ~ cs2 ~ ~ ~ ~ ~").s("sine").decay(0.32).sustain(0).gain(0.8)
      const kick2 = note("cs2 ~ ~ cs2 ~ ~ ~ ~ ~ ~ cs2 ~ ~ ~ cs2 cs2").s("sine").decay(0.28).sustain(0).gain(0.8)
      const snare = s("~ ~ white ~").decay(0.18).sustain(0).hpf(1200).lpf(5500).gain(0.22).room(0.3)
      const clap = s("~ ~ pink ~").decay(0.14).sustain(0).hpf(1500).lpf(5000).gain(0.12).room(0.35)
      const hats = s("~ white ~ white ~ white ~ white").decay(0.03).sustain(0).hpf(6800).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const riser = s("pink*8").decay(0.1).sustain(0).hpf(800).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.06).slow(9))
      const roots = "<cs2 a2 e2 b2>"
      const wob = note(roots).struct("x*8").s("sawtooth").decay(0.2).sustain(0.7).release(0.03)
        .lpf(sine.range(260, 1400).fast(2)).lpq(9).gain(0.3)
      const wob2 = note(roots).struct("x*16").s("sawtooth").decay(0.1).sustain(0.7).release(0.02)
        .lpf(sine.range(280, 1900).fast(4)).lpq(10).gain(0.28)
      const stabs = note("<[cs4,e4,gs4] [a3,cs4,e4] [b3,e4,gs4] [b3,ds4,fs4]>").struct("~ x ~ ~ ~ ~ x ~").s("square")
        .decay(0.12).sustain(0).lpf(saw.range(1200, 3000).slow(35)).gain(0.07).room(0.3)
      const arp = note("<[cs5 e5 gs5 e5]*4 [a4 cs5 e5 cs5]*4 [e5 gs5 b5 gs5]*4 [b4 ds5 fs5 ds5]*4>").s("square")
        .decay(0.06).sustain(0).lpf(2600).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
        .delay(0.2).delaytime(0.321).delayfeedback(0.3)
      const tune = "<[cs5 ~ e5 ~ gs5 ~ fs5 e5] [e5 ~ cs5 ~ b4 ~ cs5 ~] [gs4 ~ b4 ~ e5 ~ fs5 gs5] [fs5 ~ ds5 ~ b4 ~ ~ ~]>"
      const lead = note(tune).s("sawtooth").decay(0.25).sustain(0.4).release(0.1).lpf(2200).vib(5).vibmod(0.15).gain(0.09)
        .room(0.3).delay(0.25).delaytime(0.321).delayfeedback(0.3).pan(0.56)
      const lead2 = note(tune).add(note(-12)).s("square").decay(0.2).sustain(0.3).release(0.05).lpf(1500).gain(0.05).pan(0.42)
    `,
    song: `arrange(
      [8, stack(kick, snare, hats, wob)],
      [9, stack(kick, snare, clap, hats, wob, stabs, arp)],
      [9, stack(kick2, snare, clap, hats, wob, stabs, arp, lead)],
      [9, stack(kick2, snare, clap, hats, shaker, riser, wob2, stabs, arp, lead, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const moves = planMoves(rng.fork('moves'));

    const backdrop = paintBackdrop(W, H, art);
    const cone = paintCone();
    const me = paintBot(PLAYER);
    const roster = ROSTER.map(paintBot);
    const lampGlow = glowSprite('rgba(255,244,214,0.9)', 30);
    const flashGlow = glowSprite('rgba(255,255,255,0.9)', 14);
    const edgeGlow = glowSprite('rgba(255,60,40,0.9)', 50);
    const antennaGlow = glowSprite('rgba(255,90,60,1)', 10);
    const glows = {};
    const glowFor = (col) => (glows[col] ||= glowSprite(`rgba(${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)},1)`, 22));
    const vignette = vignetteSprite(W, H, 0.6, '0,0,0');
    const smoke = createParticles();
    const sparks = createParticles();

    let x = 180; // where the two bots meet
    let vel = 0;
    let wins = 0;
    let bout = 0;
    let opp = roster[0];
    let mi = 0;
    let now = 0;
    let breakUntil = 0;
    let dropStart = -10;
    let landed = true;
    let fallen = null; // the bot you just shoved off
    let pl = null; // your bot tumbling, once it's over
    let lean = 0;
    let myWheel = 0;
    let oppWheel = 0;
    let tread = 0;
    let shake = 0;
    let lastDir = 0;
    let lastFo = 0;
    let lastShown = '';
    let flipT = 0;
    let state = { m: null, phase: '', shown: '', u: 0, a: 0 };
    const pops = [];
    const flashes = [];
    const blinkAt = [2.3, 2.3];

    const oppCx = () => x + opp.d.w / 2;

    const die = (game, kind) => {
      game.dead = true;
      game.deathReason =
        kind === 'out'
          ? 'Shoved off the edge of the ring.'
          : kind === 'dodge'
            ? 'Pushed into a dodge, lunged past it and got flipped.'
            : 'Got grabbed and yanked off your wheels.';
      const cx = x - PLAYER.w / 2;
      pl = {
        x: cx,
        y: 0,
        rot: lean,
        vx: kind === 'out' ? -110 : kind === 'dodge' ? 210 : 250,
        vy: kind === 'out' ? -80 : -300,
        vr: kind === 'out' ? -3.2 : kind === 'dodge' ? 7.5 : 5.5,
        bounced: false,
      };
      shake = 8;
      sparks.burst(kind === 'out' ? cx - 20 : x, GROUND - 26, { count: 34, speed: 260, life: 0.8, size: 3, drag: 1.5, gravity: 500, colors: ['#ffd23a', '#ff8a3a', '#ffffff'] });
      smoke.burst(cx, GROUND - 10, { count: 14, speed: 60, life: 1.1, size: 12, round: true, drag: 1.5, gravity: -40, colors: ['rgba(120,124,135,0.5)', 'rgba(80,84,94,0.5)'] });
    };

    const win = (t) => {
      wins++;
      fallen = { a: opp, x: oppCx(), y: 0, vx: 150, vy: -170, rot: 0, vr: 3 };
      sparks.burst(EDGE_R - 6, GROUND - 24, { count: 30, speed: 240, life: 0.8, size: 3, drag: 1.5, gravity: 500, colors: ['#ffd23a', '#ffffff', MOVES.shove.color] });
      pops.push({ text: wins > 1 ? `OUT!  ×${wins}` : 'OUT!', x: 230, y: 380, age: 0, color: '#ffb21e' });
      bout++;
      opp = roster[bout % roster.length];
      breakUntil = t + 1.7;
      dropStart = t + 0.8;
      landed = false;
      while (mi < moves.length && moves[mi].tell0 < breakUntil) mi++;
      shake = 5;
    };

    const updateCosmetic = (dt) => {
      smoke.update(dt);
      sparks.update(dt);
      shake = Math.max(0, shake - dt * 22);
      flipT = Math.max(0, flipT - dt * 4);
      for (let i = pops.length - 1; i >= 0; i--) {
        pops[i].age += dt;
        if (pops[i].age > 1.1) pops.splice(i, 1);
      }
      if (Math.random() < 0.05) flashes.push({ x: Math.random() * W, y: 180 + Math.random() * 230, life: 0.12 });
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life -= dt;
        if (flashes[i].life <= 0) flashes.splice(i, 1);
      }
      if (fallen) {
        fallen.vy += 1100 * dt;
        fallen.x += fallen.vx * dt;
        fallen.y += fallen.vy * dt;
        fallen.rot += fallen.vr * dt;
        if (fallen.y > 260) fallen = null;
      }
      if (pl) {
        pl.vy += 1100 * dt;
        pl.x += pl.vx * dt;
        pl.y += pl.vy * dt;
        pl.rot += pl.vr * dt;
        if (!pl.bounced && pl.y > 0 && pl.x > EDGE_L && pl.x < EDGE_R) {
          pl.bounced = true;
          pl.y = 0;
          pl.vy = -220;
          pl.vr *= 0.7;
          shake = 6;
          sparks.burst(pl.x, GROUND - 6, { count: 18, speed: 200, life: 0.6, size: 2.6, drag: 1.5, gravity: 500, colors: ['#ffd23a', '#ffffff'] });
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      cue: null, // the move on the badge right now (handy for testing bots)

      update(dt, dir, t) {
        now = t;
        updateCosmetic(dt);
        lastDir = dir;
        lean += (dir * 0.06 - lean) * Math.min(1, 10 * dt);
        myWheel += (vel / PLAYER.r + dir * 9) * dt;
        state = { m: null, phase: '', shown: '', u: 0, a: 0 };
        this.cue = null;

        // between bouts: everyone rolls back to the start lines and the next bot drops in
        if (t < breakUntil) {
          x += (180 - x) * Math.min(1, 3 * dt);
          vel = 0;
          lastFo = 0;
          if (!landed && t > dropStart + 0.55) {
            landed = true;
            shake = 6;
            smoke.burst(oppCx(), GROUND - 4, { count: 16, speed: 90, life: 0.9, size: 10, round: true, drag: 2, gravity: -30, colors: ['rgba(140,146,160,0.45)', 'rgba(90,96,108,0.45)'] });
          }
          return;
        }

        while (mi < moves.length && moves[mi].end <= t) mi++;
        const m = mi < moves.length && moves[mi].tell0 <= t ? moves[mi] : null;
        const pr = pressure(t) + Math.min(0.1, bout * 0.025); // later bots are heavier
        let Fo = pr;
        let contact = true;
        let frozen = false;
        if (m) {
          const shown = m.fake && t < m.switchT ? m.fake : m.type;
          if (shown !== lastShown && m.fake && t >= m.switchT) flipT = 1;
          lastShown = shown;
          if (t < m.act) {
            state = { m, phase: 'tell', shown, u: (t - m.tell0) / (m.act - m.tell0), a: 0 };
            this.cue = { type: shown, act: m.act };
            if (shown === 'dodge') Fo = Math.min(pr, 0.3);
            else if (shown === 'shove') Fo = pr * 0.85;
          } else if (t < m.act + BEAT) {
            const a = t - m.act;
            state = { m, phase: 'act', shown: m.type, u: 1, a };
            if (m.type === 'shove') {
              Fo = m.flurry ? pr + 0.35 : shoveForce(t);
              if (!m.hit) {
                m.hit = true;
                shake = m.flurry ? 2.5 : 4;
                sparks.burst(x, GROUND - 30, { count: 16, speed: 220, life: 0.5, size: 2.6, drag: 2, gravity: 400, colors: ['#ffd23a', '#ff8a3a', '#ffffff'] });
              }
            } else if (m.type === 'dodge') {
              contact = false;
              if (!m.hit) {
                m.hit = true;
                for (let i = 0; i < 6; i++) smoke.burst(oppCx() + 10, GROUND - 6 - i * 8, { count: 1, speed: 120, angle: 0, spread: 0.3, life: 0.4, size: 5, round: true, colors: ['rgba(69,232,255,0.5)'] });
              }
              if (a < DODGE_WIN && dir > 0) return die(this, 'dodge');
            } else {
              frozen = true;
              if (!m.hit) {
                m.hit = true;
                m.off = 0;
                sparks.burst(x - 18, GROUND - 52, { count: 12, speed: 140, life: 0.4, size: 2.4, drag: 2, colors: ['#e5c4ff', MOVES.grab.color, '#ffffff'] });
              }
              if (dir >= 0) {
                m.off += dt;
                if (m.off > GRAB_GRACE) return die(this, 'grab');
              }
            }
          } else {
            state = { m, phase: 'spent', shown: m.type, u: 1, a: t - m.act };
            Fo = 0.32;
          }
        } else lastShown = '';
        lastFo = contact && !frozen ? Fo : 0;

        const Fp = dir > 0 ? 1 : dir < 0 ? -0.45 : 0;
        const target = frozen || !contact ? 0 : K * (Fp - Fo);
        vel += (target - vel) * Math.min(1, 12 * dt);
        x += vel * dt;
        if (t < SAFE_T) x = Math.max(x, EDGE_L + PLAYER.w / 2 + 10);

        oppWheel += (-vel / opp.d.r + Fo * 8) * dt;
        tread += (-vel + Fo * 60) * dt;

        // grinding sparks and tyre smoke while the two strain against each other
        if (contact && !frozen && dir > 0 && Fo > 0.3 && Math.random() < 0.12) {
          sparks.burst(x, GROUND - 20 - Math.random() * 30, { count: 2, speed: 150, angle: -Math.PI / 2, spread: 2.2, life: 0.35, size: 2, drag: 2, gravity: 500, colors: ['#ffd23a', '#ffb066', '#ffffff'] });
        }
        if (dir !== 0 && Math.random() < 0.08) {
          smoke.burst(x - PLAYER.w + 6, GROUND - 4, { count: 1, speed: 30, angle: Math.PI + 0.4, spread: 0.8, life: 0.9, size: 9, round: true, drag: 1, gravity: -40, colors: ['rgba(150,154,165,0.32)'] });
        }

        if (t >= SAFE_T && x - PLAYER.w / 2 < EDGE_L) return die(this, 'out');
        if (oppCx() > EDGE_R) win(t);
      },

      afterlife(dt) {
        updateCosmetic(dt);
      },

      render(g, t) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        g.drawImage(backdrop.canvas, 0, 0, W, H);

        // spotlights sweeping the ring
        g.globalCompositeOperation = 'lighter';
        const lamps = [50, 130, 230, 310];
        lamps.forEach((lx, i) => {
          const aim = 180 + Math.sin(now * 0.7 + i * 1.7) * 60 + (i - 1.5) * 20;
          const a = -Math.atan2(aim - lx, ACY - 153);
          g.save();
          g.translate(lx, 153);
          g.rotate(a);
          g.globalAlpha = 0.5;
          g.drawImage(cone.canvas, -75, 0, 150, 440);
          g.restore();
          drawSprite(g, lampGlow, lx, 153, { size: 46, alpha: 0.9 });
        });
        g.globalAlpha = 1;
        for (const f of flashes) drawSprite(g, flashGlow, f.x, f.y, { size: 22, alpha: f.life / 0.12 });
        g.globalCompositeOperation = 'source-over';

        // LED boards
        g.save();
        g.beginPath();
        g.rect(0, 431, W, 22);
        g.clip();
        g.font = `900 13px ${BODY_FONT}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        const msg = '★ ROBO SUMO GRAND PRIX ★ PUSH THEM OFF THE EDGE ★ SPARKY #07 ★ ';
        const mw = g.measureText(msg).width;
        const off = -((now * 60) % mw);
        g.fillStyle = 'rgba(255,178,30,0.85)';
        g.fillText(msg, off, 442);
        g.fillText(msg, off + mw, 442);
        g.restore();

        // the edge glows red when you're close to it
        const px = x - PLAYER.w / 2;
        const danger = this.dead ? 0 : clamp(1 - (px - EDGE_L) / 70, 0, 1);
        if (danger > 0) {
          g.strokeStyle = `rgba(255,60,40,${danger * (0.6 + 0.4 * Math.sin(now * 18))})`;
          g.lineWidth = 5;
          g.beginPath();
          g.ellipse(ACX, ACY, ARX - 8, ARY - 4, 0, Math.PI * 0.72, Math.PI * 1.28);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, edgeGlow, EDGE_L + 10, ACY, { size: 130, alpha: danger * 0.6 });
          g.globalCompositeOperation = 'source-over';
        }

        // ---- the opponent ----
        const { m, phase, shown, u, a } = state;
        let ox = oppCx();
        let oy = 0;
        let os = 1;
        let orot = 0;
        let omood = 'calm';
        let ocol = opp.d.eye;
        if (phase === 'tell') {
          if (shown === 'shove') {
            ox += 5 * u + (Math.random() - 0.5) * 2;
            orot = 0.05 * u;
            omood = 'angry';
            ocol = MOVES.shove.color;
          } else if (shown === 'dodge') {
            omood = 'shifty';
            ocol = MOVES.dodge.color;
            orot = -0.02;
          } else {
            omood = 'grab';
            ocol = MOVES.grab.color;
          }
        } else if (phase === 'act') {
          if (m.type === 'dodge') {
            const s = Math.sin(Math.PI * clamp(a / BEAT, 0, 1));
            ox += 22 * s;
            oy = -26 * s;
            os = 1 - 0.12 * s;
            omood = 'shifty';
            ocol = MOVES.dodge.color;
          } else if (m.type === 'shove') {
            orot = -0.06;
            omood = 'angry';
            ocol = MOVES.shove.color;
          } else {
            orot = 0.08;
            omood = 'grab';
            ocol = MOVES.grab.color;
          }
        } else if (phase === 'spent') {
          omood = 'shock';
          orot = 0.03;
        }
        let dropOff = 0;
        if (now < breakUntil) {
          const du = clamp((now - dropStart) / 0.55, 0, 1);
          dropOff = du < 1 ? -460 * (1 - du * du) : -Math.abs(Math.sin((now - dropStart - 0.55) * 12)) * 8 * Math.max(0, 1 - (now - dropStart - 0.55) * 3);
        }

        // shadows
        g.fillStyle = 'rgba(0,0,0,0.45)';
        if (!pl) {
          g.beginPath();
          g.ellipse(px, GROUND + 2, PLAYER.w * 0.6, 7, 0, 0, Math.PI * 2);
          g.fill();
        }
        if (dropOff > -440) {
          g.globalAlpha = clamp(1 + dropOff / 460, 0.2, 1);
          g.beginPath();
          g.ellipse(ox, GROUND + 2 + oy * 0.3, opp.d.w * 0.6 * os, 7, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }

        const blink = (who) => {
          if (now > blinkAt[who]) blinkAt[who] = now + 1.8 + Math.random() * 2.5;
          return blinkAt[who] - now < 0.1;
        };

        const drawBot = (b, cx, gy, { rot = 0, flip = false, scale = 1, wheelA = 0, mood = 'calm', col, look = 0, blinking = false }) => {
          g.save();
          g.translate(cx, gy);
          if (rot) g.rotate(rot);
          if (scale !== 1) g.scale(scale, scale);
          if (flip) g.scale(-1, 1);
          g.drawImage(b.spr.canvas, -b.SW / 2, -(b.SH - 10), b.SW, b.SH);
          const r = b.d.r;
          if (b.d.kind === 'tank') {
            g.fillStyle = '#4a4f5a';
            const len = b.d.w + 6;
            const step = 8;
            const o = ((tread % step) + step) % step;
            for (let i = -1; i < len / step; i++) {
              const tx = -b.d.w / 2 - 3 + i * step + o;
              if (tx < -b.d.w / 2 - 2 || tx > b.d.w / 2 + 1) continue;
              g.fillRect(tx, -2 * r - 2, 3, 2.5);
              g.fillRect(tx, -2.5, 3, 2.5);
            }
          } else {
            for (const wx of b.wheels) drawSprite(g, b.wheel, wx, -r, { rot: wheelA });
          }
          drawEyes(g, b.visor, mood, col, look, blinking);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowFor(col), b.visor.x + b.visor.w / 2, b.visor.y + b.visor.h / 2, { size: b.visor.w * 2.2, alpha: 0.45 });
          if (b.d.kind === 'wedge') drawSprite(g, antennaGlow, b.cab.x + 4, b.cab.y - 14, { size: 16, alpha: 0.5 + 0.5 * Math.sin(now * 6) });
          if (b.d.kind === 'dome') drawSprite(g, glowFor('#a8fbff'), -1.5, -b.d.h + 9, { size: 26 + Math.random() * 10, alpha: 0.7 });
          g.globalCompositeOperation = 'source-over';
          g.restore();
        };

        // the bot you shoved off, tumbling away
        if (fallen) drawBot(fallen.a, fallen.x, GROUND + fallen.y, { rot: fallen.rot, flip: true, mood: 'shock', col: fallen.a.d.eye });

        if (dropOff > -460) {
          drawBot(opp, ox, GROUND + oy + dropOff, { rot: orot, flip: true, scale: os, wheelA: oppWheel, mood: omood, col: ocol, look: phase === 'tell' && shown === 'dodge' ? -1 : 0.6, blinking: blink(1) });
        }

        // ---- your bot ----
        const strain = !this.dead && lastDir > 0 && lastFo > 0.5;
        const myMood = this.dead ? 'shock' : strain ? 'strain' : 'calm';
        if (pl) drawBot(me, pl.x, GROUND + pl.y, { rot: pl.rot, wheelA: myWheel, mood: 'shock', col: PLAYER.eye });
        else drawBot(me, px, GROUND, { rot: lean, wheelA: myWheel, mood: myMood, col: PLAYER.eye, look: 0.6, blinking: blink(0) });

        // the grabbing claw reaches over your bot
        if (m && m.type === 'grab' && (phase === 'act' || (phase === 'tell' && shown === 'grab')) && !pl) {
          const reach = phase === 'act' ? 1 : clamp(u * 1.4, 0, 1);
          const ax = ox - opp.d.w / 2 + 6;
          const ay = GROUND - opp.d.h * 0.62;
          const tx = lerp(ax, x - 26, reach);
          const ty = lerp(ay, GROUND - PLAYER.h * 0.72, reach);
          g.strokeStyle = '#2a2e37';
          g.lineWidth = 7;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(tx, ty);
          g.stroke();
          g.strokeStyle = '#b4bccb';
          g.lineWidth = 4;
          g.stroke();
          const open = phase === 'act' ? 0.15 : 0.6;
          g.strokeStyle = MOVES.grab.color;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(tx - 9, ty - 9 * open - 3);
          g.lineTo(tx - 13, ty - 2);
          g.moveTo(tx, ty);
          g.lineTo(tx - 9, ty + 9 * open + 3);
          g.lineTo(tx - 13, ty + 2);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowFor(MOVES.grab.color), tx - 6, ty, { size: 34, alpha: phase === 'act' ? 0.8 : 0.4 });
          g.globalCompositeOperation = 'source-over';
        }

        smoke.render(g);
        sparks.render(g, true);

        // the scoreboard
        g.fillStyle = 'rgba(6,7,10,0.92)';
        g.strokeStyle = '#3a404c';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(30, 52, 300, 58, 8);
        g.fill();
        g.stroke();
        g.textBaseline = 'middle';
        g.font = `900 15px ${BODY_FONT}`;
        g.textAlign = 'left';
        g.fillStyle = PLAYER.main;
        g.fillText(PLAYER.name, 42, 70);
        g.textAlign = 'right';
        const dropping = now < breakUntil && now < dropStart;
        g.fillStyle = dropping ? 'rgba(255,255,255,0.35)' : opp.d.light;
        g.fillText(dropping ? '· · ·' : bout >= roster.length ? `${opp.d.name} II` : opp.d.name, 318, 70);
        g.textAlign = 'center';
        g.font = `800 11px ${BODY_FONT}`;
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillText('VS', 180, 70);
        const lampsN = Math.max(6, wins + 1);
        for (let i = 0; i < lampsN && i < 12; i++) {
          const lx = 180 + (i - (Math.min(12, lampsN) - 1) / 2) * 16;
          g.fillStyle = i < wins ? '#ffb21e' : 'rgba(255,255,255,0.12)';
          g.beginPath();
          g.arc(lx, 94, 4.5, 0, Math.PI * 2);
          g.fill();
        }


        // the badge announcing the next move
        if (m && !this.dead && (phase === 'tell' || (phase === 'act' && a < 0.18))) {
          const bx = clamp(ox, 70, W - 64);
          const by = GROUND - opp.d.h - 70;
          const k = phase === 'tell' ? Math.min(1, u * 6) : 1 - a / 0.18;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowFor(MOVES[shown].color), bx, by, { size: 170, alpha: 0.35 * k });
          g.globalCompositeOperation = 'source-over';
          drawBadge(g, bx, by, shown, phase === 'tell' ? u : 1, 0.6 + 0.4 * k, flipT);
        }

        for (const p of pops) {
          const k = p.age / 1.1;
          g.globalAlpha = 1 - k * k;
          g.font = `900 30px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.strokeStyle = 'rgba(0,0,0,0.75)';
          g.lineWidth = 6;
          g.lineJoin = 'round';
          g.strokeText(p.text, p.x, p.y - k * 40);
          g.fillStyle = p.color;
          g.fillText(p.text, p.x, p.y - k * 40);
          g.globalAlpha = 1;
        }

        drawSprite(g, vignette, W / 2, H / 2);
        g.restore();
      },
    };
    return game;
  },
};
