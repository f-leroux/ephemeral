// Sushi Train — a bright little kaiten-zushi bar at lunchtime. The chef behind the counter
// tosses pieces of sushi in high lobs down onto the conveyor belt, and every piece has to
// land on a plate of its own colour: salmon on orange, cucumber rolls on green, tuna on
// crimson, tamago on yellow, mackerel on blue. You don't move a catcher: ← and → slide the
// whole belt, so every plate moves at once. The plates repeat in the same order all along the
// belt, so one plate of each colour is always in view; a single piece just needs its colour
// brought under it, but pieces that land together (pairs from 12s, triples from 34s) need the
// one slide that suits them all. From 24s some pieces come wrapped in paper and only show
// what they are at the top of their lob. The chef throws faster, lower and more often.
// A landing ring on the belt and a badge (✓ or ✗) show whether the plate under each piece
// is the right one right now. Every throw is planned up front around a hidden reference belt
// that moves no faster than the player's, so there is always a way.

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

const TAU = Math.PI * 2;
const PLATE = 64; // plate spacing on the belt
const NT = 5; // plate colours, repeating along the belt
const PERIOD = PLATE * NT;
const BELT_Y = 552; // centre line of the plates
const LAND_Y = BELT_Y - 6;
const HAND_Y = 238;
const CHEF_X = 180;
const SPEED = 300; // belt speed at full push
const ACCEL = 14;
const S0 = -20; // starting belt offset: a plate centred under the chef

const mod = (a, n) => ((a % n) + n) % n;
const plateIndexAt = (x, s) => Math.round((x + s - PLATE / 2) / PLATE);
const plateX = (i, s) => i * PLATE + PLATE / 2 - s;

// in belt order: warm and cool colours alternate so neighbouring plates never look alike
const TYPES = [
  { name: 'Salmon', plate: 'salmon', col: '#ff7a2e', hi: '#ffb27a', lo: '#c2470c' },
  { name: 'Cucumber roll', plate: 'cucumber', col: '#35b04a', hi: '#8fe08a', lo: '#16712a' },
  { name: 'Tuna', plate: 'tuna', col: '#d9184c', hi: '#ff6f8e', lo: '#8e0a2c' },
  { name: 'Tamago', plate: 'egg', col: '#ffc81a', hi: '#ffe98a', lo: '#c08a00' },
  { name: 'Mackerel', plate: 'mackerel', col: '#2f78e0', hi: '#86b8ff', lo: '#163f8a' },
];
const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

// ---------- the plan: every throw, decided up front from the rng ----------

function buildPlan(plan) {
  const events = [];
  let T = 2.7;
  let refS = S0;
  let refT = 0;
  let n = 0;
  let lastX = -999;
  while (T < 61.5) {
    const p = progress(T, 60, 1.2);
    let size = 1;
    const r = plan.next();
    if (T > 12 && n > 5) {
      if (T > 34 && r < lerp(0.14, 0.3, p)) size = 3;
      else if (r < lerp(0.32, 0.5, p)) size = 2;
    }
    const mysteryR = plan.next();
    const mystery = size === 1 && T > 24 && mysteryR < lerp(0.2, 0.34, p);
    const F = lerp(1.95, 1.08, p) * (size > 1 ? 1.08 : 1);
    // how far the reference belt may slide before this landing (never faster than ~70% of yours)
    const refV = lerp(118, 195, p);
    let win = T - refT;
    if (mystery) win = Math.min(win, F * 0.5);
    const maxD = Math.min(PERIOD / 2, refV * win * 0.92);
    refS += (plan.next() * 2 - 1) * maxD;

    // plates fully in view at the reference offset
    const lo = Math.ceil((46 + refS - PLATE / 2) / PLATE);
    const hi = Math.floor((314 + refS - PLATE / 2) / PLATE);
    const cands = [];
    for (let i = lo; i <= hi; i++) cands.push(i);
    const order = plan.shuffle(cands);
    const chosen = [];
    for (const gap of [2, 1]) {
      for (const i of order) {
        if (chosen.length >= size) break;
        if (chosen.includes(i)) continue;
        if (chosen.some((c) => Math.abs(c - i) < gap)) continue;
        // a single throw right after another lands somewhere else, so the rings don't overlap
        if (size === 1 && gap === 2 && Math.abs(plateX(i, refS) - lastX) < 50) continue;
        chosen.push(i);
      }
    }
    chosen.sort((a, b) => a - b);
    const group = [];
    chosen.forEach((i, k) => {
      const x1 = plateX(i, refS) + (plan.next() * 2 - 1) * 5;
      let hand = x1 < CHEF_X ? -1 : 1;
      if (chosen.length === 2) hand = k === 0 ? -1 : 1;
      if (chosen.length === 3) hand = k - 1;
      const spin = (plan.next() < 0.5 ? -1 : 1) * (plan.next() < 0.5 ? 1 : 2);
      const e = {
        T,
        F,
        launch: T - F,
        reveal: mystery ? T - F * 0.5 : -1,
        hand,
        x0: CHEF_X + hand * 30,
        x1,
        type: mod(i, NT),
        mystery,
        spin,
        arc: lerp(170, 95, p) * (0.85 + plan.next() * 0.3),
        state: 'wait', // wait → air → landed
        group: n,
      };
      group.push(e);
      events.push(e);
    });
    lastX = group[group.length - 1]?.x1 ?? lastX;
    const gap = lerp(1.6, 0.5, p) * (0.85 + plan.next() * 0.3) * (size === 2 ? 1.3 : size === 3 ? 1.6 : 1);
    refT = T;
    T += gap;
    n++;
  }
  return events;
}

// ---------- art ----------

function riceBase(g, w = 32) {
  const gr = g.createLinearGradient(0, -2, 0, 10);
  gr.addColorStop(0, '#fffdf6');
  gr.addColorStop(1, '#ddd0b8');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(-w / 2, -3, w, 13, 6);
  g.fill();
  g.strokeStyle = 'rgba(150,130,100,0.35)';
  g.lineWidth = 0.6;
  g.stroke();
  // grains
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let k = 0; k < 14; k++) {
    const x = -w / 2 + 3 + ((k * 7.3) % (w - 6));
    const y = 1 + ((k * 3.7) % 7);
    g.beginPath();
    g.ellipse(x, y, 1.8, 0.9, (k % 3) * 0.6, 0, TAU);
    g.fill();
  }
  g.fillStyle = 'rgba(160,140,110,0.3)';
  for (let k = 0; k < 8; k++) {
    g.beginPath();
    g.ellipse(-w / 2 + 5 + ((k * 9.1) % (w - 8)), 3 + ((k * 2.9) % 5), 1.2, 0.5, k, 0, TAU);
    g.fill();
  }
}

function slab(g, c0, c1) {
  g.beginPath();
  g.moveTo(-20, -2);
  g.bezierCurveTo(-20, -12, -10, -13, 0, -12);
  g.bezierCurveTo(12, -12, 21, -11, 20, -2);
  g.bezierCurveTo(19, 3, 10, 4, 0, 3.5);
  g.bezierCurveTo(-10, 4, -20, 3, -20, -2);
  g.closePath();
  const gr = g.createLinearGradient(0, -12, 0, 4);
  gr.addColorStop(0, c0);
  gr.addColorStop(1, c1);
  g.fillStyle = gr;
  g.fill();
}

function shine(g) {
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath();
  g.ellipse(-7, -8.5, 8, 2, -0.12, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.ellipse(-10, -9, 3, 1, -0.12, 0, TAU);
  g.fill();
}

function makePiece(k) {
  return makeSprite(46, 32, (g) => {
    g.translate(0, 2);
    // contact shadow
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(0, 10, 18, 3.5, 0, 0, TAU);
    g.fill();
    if (k === 1) {
      // two cucumber maki rounds
      for (const ox of [-10, 10]) {
        g.save();
        g.translate(ox, 0);
        g.fillStyle = '#16231a';
        g.beginPath();
        g.roundRect(-9, -4, 18, 13, 3);
        g.fill();
        g.fillStyle = 'rgba(120,160,120,0.25)';
        g.fillRect(-7, -2, 2, 10);
        g.fillStyle = '#1d2e22';
        g.beginPath();
        g.ellipse(0, -4, 9, 5, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#fbf7ec';
        g.beginPath();
        g.ellipse(0, -4, 7.4, 4, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#2f8f3a';
        g.beginPath();
        g.ellipse(0, -4, 3.6, 2, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#b9f0a0';
        g.beginPath();
        g.ellipse(0.3, -4.2, 2, 1, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      return;
    }
    riceBase(g);
    if (k === 0) {
      slab(g, '#ffa060', '#f05f22');
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(255,236,214,0.8)';
      g.lineWidth = 2;
      for (let x = -24; x < 26; x += 7) {
        g.beginPath();
        g.moveTo(x, -13);
        g.quadraticCurveTo(x + 4, -5, x + 8, 5);
        g.stroke();
      }
      g.restore();
      shine(g);
    } else if (k === 2) {
      slab(g, '#f0405c', '#a8102e');
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(255,160,175,0.3)';
      g.lineWidth = 1;
      for (let x = -24; x < 26; x += 5) {
        g.beginPath();
        g.moveTo(x, -13);
        g.lineTo(x + 6, 5);
        g.stroke();
      }
      g.restore();
      shine(g);
    } else if (k === 3) {
      // tamago block with a nori belt
      const gr = g.createLinearGradient(0, -13, 0, 3);
      gr.addColorStop(0, '#ffe878');
      gr.addColorStop(1, '#efb020');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(-19, -13, 38, 15, 3);
      g.fill();
      g.strokeStyle = 'rgba(200,130,10,0.5)';
      g.lineWidth = 0.9;
      for (const y of [-9, -5, -1]) {
        g.beginPath();
        g.moveTo(-18, y);
        g.lineTo(18, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-17, -12, 34, 2);
      g.fillStyle = '#17241b';
      g.fillRect(-4.5, -14, 9, 25);
      g.fillStyle = 'rgba(140,180,140,0.3)';
      g.fillRect(-3.5, -13, 1.5, 23);
    } else {
      // mackerel: blue-silver skin with dark wavy stripes, ginger and spring onion on top
      slab(g, '#2d5fa8', '#b8d2ea');
      g.save();
      g.clip();
      g.strokeStyle = '#173a74';
      g.lineWidth = 1.6;
      for (let y = -12; y < -4; y += 3.2) {
        g.beginPath();
        for (let x = -22; x <= 22; x += 4) g.lineTo(x, y + (((x + 22) / 4) % 2 ? 1.6 : -0.6));
        g.stroke();
      }
      g.fillStyle = 'rgba(230,240,255,0.55)';
      g.fillRect(-22, -3, 44, 2);
      g.restore();
      shine(g);
      g.fillStyle = '#f6dc8a';
      g.beginPath();
      g.ellipse(1, -12, 4.5, 2.2, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#5cc04a';
      for (const [x, y] of [[-1.5, -13.5], [2.5, -13], [0.5, -11.5], [4, -11.8]]) {
        g.beginPath();
        g.arc(x, y, 0.9, 0, TAU);
        g.fill();
      }
    }
  });
}

function makeWrapper() {
  return makeSprite(46, 32, (g) => {
    g.translate(0, 2);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(0, 10, 18, 3.5, 0, 0, TAU);
    g.fill();
    const gr = g.createLinearGradient(0, -14, 0, 10);
    gr.addColorStop(0, '#fffaf0');
    gr.addColorStop(1, '#d9ccb2');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(-18, -14, 36, 24, 5);
    g.fill();
    g.strokeStyle = 'rgba(120,90,60,0.45)';
    g.lineWidth = 0.8;
    g.stroke();
    // folded paper creases
    g.strokeStyle = 'rgba(150,120,90,0.35)';
    g.beginPath();
    g.moveTo(-18, -14);
    g.lineTo(0, -2);
    g.lineTo(18, -14);
    g.stroke();
    // red band and a big question mark
    g.fillStyle = '#d6282e';
    g.fillRect(-18, -1, 36, 6);
    g.font = '900 15px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, -3, 8, 0, TAU);
    g.fill();
    g.fillStyle = '#d6282e';
    g.fillText('?', 0, -2.5);
  });
}

function makePlate(k) {
  const t = TYPES[k];
  return makeSprite(62, 30, (g) => {
    g.fillStyle = 'rgba(20,30,40,0.3)';
    g.beginPath();
    g.ellipse(1, 4, 28, 11, 0, 0, TAU);
    g.fill();
    // glazed body
    const gr = g.createRadialGradient(-6, -4, 2, 0, 0, 30);
    gr.addColorStop(0, t.hi);
    gr.addColorStop(0.55, t.col);
    gr.addColorStop(1, t.lo);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 28, 11.5, 0, 0, TAU);
    g.fill();
    // rim and well
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(0, -0.5, 26.5, 10.3, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 0, 28, 11.5, 0, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(0, 0.5, 17, 6.2, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.ellipse(0, 0.5, 17, 6.2, 0, 0, TAU);
    g.stroke();
    // a bright gloss streak
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-14, -5, 6, 1.6, -0.25, 0, TAU);
    g.fill();
  });
}

function makeBeltTile() {
  return makeSprite(32, 50, (g) => {
    g.translate(-16, -25);
    const gr = g.createLinearGradient(0, 0, 0, 50);
    gr.addColorStop(0, '#8d98a4');
    gr.addColorStop(0.2, '#d9e0e6');
    gr.addColorStop(0.55, '#c3ccd4');
    gr.addColorStop(1, '#7c8793');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 50);
    // crescent seam between the steel links
    g.strokeStyle = 'rgba(40,50,60,0.55)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(4, 0);
    g.quadraticCurveTo(20, 25, 4, 50);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(6, 0);
    g.quadraticCurveTo(22, 25, 6, 50);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 12, 32, 4);
  }, 2);
}

function makeLantern() {
  return makeSprite(34, 50, (g) => {
    g.fillStyle = '#1b1414';
    g.fillRect(-9, -25, 18, 5);
    g.fillRect(-9, 20, 18, 5);
    const gr = g.createRadialGradient(-4, -4, 2, 0, 0, 20);
    gr.addColorStop(0, '#ff8a5a');
    gr.addColorStop(0.6, '#e2322a');
    gr.addColorStop(1, '#951612');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 16, 21, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(80,10,10,0.45)';
    g.lineWidth = 0.8;
    for (let y = -16; y <= 16; y += 4) {
      const w = 16 * Math.sqrt(1 - (y / 21) ** 2);
      g.beginPath();
      g.moveTo(-w, y);
      g.quadraticCurveTo(0, y + 2, w, y);
      g.stroke();
    }
    // a white brush-stroke emblem
    g.strokeStyle = 'rgba(255,245,230,0.9)';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-6, -7);
    g.lineTo(6, -7);
    g.moveTo(0, -11);
    g.lineTo(0, 9);
    g.moveTo(-6, 2);
    g.quadraticCurveTo(0, 0, 6, 4);
    g.stroke();
  });
}

function makeChefBody() {
  return makeSprite(96, 100, (g) => {
    // white kappogi jacket, seen from the waist up
    const gr = g.createLinearGradient(-40, 0, 40, 0);
    gr.addColorStop(0, '#d6dde6');
    gr.addColorStop(0.45, '#ffffff');
    gr.addColorStop(1, '#c9d2dc');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-40, 50);
    g.lineTo(-38, -14);
    g.quadraticCurveTo(-34, -34, -14, -38);
    g.lineTo(14, -38);
    g.quadraticCurveTo(34, -34, 38, -14);
    g.lineTo(40, 50);
    g.closePath();
    g.fill();
    // crossed collar over a navy undershirt
    g.fillStyle = '#1f2c5c';
    g.beginPath();
    g.moveTo(-12, -38);
    g.lineTo(0, -16);
    g.lineTo(12, -38);
    g.closePath();
    g.fill();
    g.strokeStyle = '#aab6c4';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-13, -38);
    g.lineTo(6, 2);
    g.moveTo(13, -38);
    g.lineTo(-2, -12);
    g.stroke();
    // apron
    g.fillStyle = '#25336a';
    g.beginPath();
    g.roundRect(-30, 14, 60, 40, 4);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 32, 8, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(-40, 10, 80, 4);
  });
}

function makeChefHead(shocked) {
  return makeSprite(60, 60, (g) => {
    // neck
    g.fillStyle = '#e2ae86';
    g.fillRect(-7, 16, 14, 10);
    // ears
    g.fillStyle = '#efbb92';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 19, 4, 4, 6, 0, 0, TAU);
      g.fill();
    }
    // face
    const gr = g.createRadialGradient(-5, -2, 3, 0, 2, 22);
    gr.addColorStop(0, '#fbd7b4');
    gr.addColorStop(1, '#eab48a');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 3, 19, 20, 0, 0, TAU);
    g.fill();
    // hair and the twisted hachimaki headband
    g.fillStyle = '#1d1a1a';
    g.beginPath();
    g.ellipse(0, -9, 19, 10, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-20, -12, 40, 7, 3);
    g.fill();
    g.strokeStyle = '#d6282e';
    g.lineWidth = 2;
    for (let x = -18; x < 20; x += 6) {
      g.beginPath();
      g.moveTo(x, -5);
      g.lineTo(x + 4, -12);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(21, -9, 4, 3, 0.5, 0, TAU);
    g.fill();
    g.fillStyle = '#d6282e';
    g.beginPath();
    g.moveTo(22, -8);
    g.lineTo(28, -2);
    g.lineTo(24, -1);
    g.closePath();
    g.fill();
    // cheeks
    g.fillStyle = 'rgba(255,120,110,0.35)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 11, 9, 4, 2.5, 0, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#2a1a14';
    g.fillStyle = '#2a1a14';
    g.lineCap = 'round';
    if (shocked) {
      for (const s of [-1, 1]) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(s * 7, 1, 4, 0, TAU);
        g.fill();
        g.fillStyle = '#2a1a14';
        g.beginPath();
        g.arc(s * 7, 1, 2, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.ellipse(0, 13, 3.5, 4.5, 0, 0, TAU);
      g.fill();
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-11, -4);
      g.lineTo(-4, -6);
      g.moveTo(11, -4);
      g.lineTo(4, -6);
      g.stroke();
    } else {
      // happy closed eyes and a big grin
      g.lineWidth = 2;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * 7, 2, 3.4, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
      g.fillStyle = '#7a2a22';
      g.beginPath();
      g.moveTo(-7, 9);
      g.quadraticCurveTo(0, 18, 7, 9);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(-5, 9, 10, 2);
    }
  });
}

function makeCat() {
  return makeSprite(36, 46, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath();
    g.ellipse(0, 20, 14, 3, 0, 0, TAU);
    g.fill();
    const gr = g.createLinearGradient(-14, 0, 14, 0);
    gr.addColorStop(0, '#e6e0d6');
    gr.addColorStop(0.5, '#ffffff');
    gr.addColorStop(1, '#ddd6ca');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 10, 13, 11, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(0, -7, 12, 10, 0, 0, TAU);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(s * 11, -10);
      g.lineTo(s * 9, -21);
      g.lineTo(s * 3, -15);
      g.closePath();
      g.fill();
      g.fillStyle = '#f4a0a8';
      g.beginPath();
      g.moveTo(s * 9.5, -12);
      g.lineTo(s * 8.6, -18.5);
      g.lineTo(s * 5, -15);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#e8a030';
    g.beginPath();
    g.ellipse(-6, -12, 3.5, 2.5, 0.3, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a1a14';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 4.5, -7, 2, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-2, -2);
    g.quadraticCurveTo(0, 0, 2, -2);
    g.stroke();
    // red collar, gold bell and koban coin
    g.fillStyle = '#d6282e';
    g.fillRect(-10, 1, 20, 3);
    g.fillStyle = '#ffd040';
    g.beginPath();
    g.arc(0, 5.5, 2.6, 0, TAU);
    g.fill();
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.ellipse(4, 13, 5, 7, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#b8860b';
    g.lineWidth = 0.7;
    g.stroke();
    // the left paw resting
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-6, 12, 3.5, 5, 0, 0, TAU);
    g.fill();
  });
}

function makePaw() {
  return makeSprite(12, 20, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-4, -8, 8, 16, 4);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.15)';
    g.lineWidth = 0.6;
    g.stroke();
    g.fillStyle = '#f4a0a8';
    g.beginPath();
    g.arc(0, -5, 1.6, 0, TAU);
    g.fill();
  });
}

function makeBackdrop(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // pale hinoki wall with vertical boards
    const wall = g.createLinearGradient(0, 0, 0, 300);
    wall.addColorStop(0, '#f0d9ac');
    wall.addColorStop(1, '#e2c38c');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, 300);
    for (let x = 0; x < W; x += 24) {
      g.fillStyle = 'rgba(150,100,50,0.12)';
      g.fillRect(x, 0, 1.2, 300);
      g.strokeStyle = 'rgba(170,120,60,0.08)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(x + 5 + k * 4, 0);
        g.bezierCurveTo(x + 9 + k * 4, 80, x + 2 + k * 4, 160, x + 7 + k * 4, 300);
        g.stroke();
      }
    }
    // ceiling beam
    const beam = g.createLinearGradient(0, 0, 0, 40);
    beam.addColorStop(0, '#3a2213');
    beam.addColorStop(1, '#5c3a20');
    g.fillStyle = beam;
    g.fillRect(0, 0, W, 40);
    g.fillStyle = 'rgba(255,220,170,0.25)';
    g.fillRect(0, 38, W, 2);

    // a rail of wooden menu tags, brushed with dark strokes and a red price stamp
    g.fillStyle = '#4a2c18';
    g.fillRect(0, 50, W, 4);
    for (let k = 0; k < 11; k++) {
      const x = 8 + k * 32;
      const tg = g.createLinearGradient(x, 0, x + 26, 0);
      tg.addColorStop(0, '#f7e6c2');
      tg.addColorStop(1, '#e3c890');
      g.fillStyle = 'rgba(80,40,10,0.18)';
      g.fillRect(x + 2, 56, 26, 58);
      g.fillStyle = tg;
      g.fillRect(x, 54, 26, 58);
      g.strokeStyle = 'rgba(120,70,30,0.4)';
      g.lineWidth = 0.8;
      g.strokeRect(x + 0.5, 54.5, 25, 57);
      g.strokeStyle = '#2a1a12';
      g.lineCap = 'round';
      g.lineWidth = 2.4;
      for (let j = 0; j < 3; j++) {
        const y = 62 + j * 11;
        const w = 6 + ((k * 5 + j * 3) % 6);
        g.beginPath();
        g.moveTo(x + 13 - w / 2, y);
        g.quadraticCurveTo(x + 13, y + 2 + (j % 2) * 2, x + 13 + w / 2, y + 1);
        if ((k + j) % 2) {
          g.moveTo(x + 13, y - 3);
          g.lineTo(x + 12, y + 5);
        }
        g.stroke();
      }
      g.fillStyle = '#d6282e';
      g.beginPath();
      g.arc(x + 13, 102, 5, 0, TAU);
      g.fill();
      g.fillStyle = '#fff3e0';
      g.fillRect(x + 10, 101, 6, 1.6);
    }

    // indigo noren over the kitchen door on the left
    g.fillStyle = '#3d2615';
    g.fillRect(8, 124, 92, 5);
    for (const [x0, w] of [[12, 41], [55, 41]]) {
      const ng = g.createLinearGradient(0, 128, 0, 214);
      ng.addColorStop(0, '#24357a');
      ng.addColorStop(1, '#1a2760');
      g.fillStyle = ng;
      g.fillRect(x0, 128, w, 84);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x0 + 3, 128, 3, 84);
    }
    g.strokeStyle = '#f6f2e6';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(54, 166, 20, 0, TAU);
    g.stroke();
    // a white fish emblem
    g.fillStyle = '#f6f2e6';
    g.beginPath();
    g.ellipse(51, 166, 10, 5, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(59, 166);
    g.lineTo(67, 160);
    g.lineTo(67, 172);
    g.closePath();
    g.fill();
    g.fillStyle = '#1e2d6c';
    g.beginPath();
    g.arc(46, 165, 1.4, 0, TAU);
    g.fill();
    g.fillStyle = '#24357a';
    g.fillRect(53, 128, 2, 84);

    // a shelf on the right with sake bottles and a teapot (the lucky cat is drawn live)
    g.fillStyle = '#5a361d';
    g.fillRect(250, 204, 110, 6);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(250, 210, 110, 4);
    for (const [x, c, h] of [[262, '#2f5a32', 36], [276, '#5a3418', 30]]) {
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(x - 6, 204 - h, 12, h, 3);
      g.fill();
      g.fillRect(x - 2.5, 204 - h - 8, 5, 10);
      g.fillStyle = '#f6efe0';
      g.fillRect(x - 5, 204 - h * 0.62, 10, h * 0.35);
      g.fillStyle = '#d6282e';
      g.fillRect(x - 1, 204 - h * 0.58, 2, h * 0.25);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x - 4, 204 - h + 3, 2, h - 6);
    }
    g.fillStyle = '#3a4a3a';
    g.beginPath();
    g.ellipse(344, 194, 11, 9, 0, 0, TAU);
    g.fill();
    g.fillRect(340, 182, 8, 4);
    g.strokeStyle = '#3a4a3a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(333, 191);
    g.lineTo(326, 186);
    g.stroke();

    // under the counter: an indigo panel with a seigaiha wave pattern
    const pg = g.createLinearGradient(0, 296, 0, 520);
    pg.addColorStop(0, '#1b2558');
    pg.addColorStop(1, '#141c44');
    g.fillStyle = pg;
    g.fillRect(0, 296, W, 224);
    g.lineWidth = 1.2;
    for (let row = 0; row < 18; row++) {
      const y = 300 + row * 13;
      const off = row % 2 ? 14 : 0;
      for (let x = -28 + off; x < W + 28; x += 28) {
        g.fillStyle = row % 2 ? '#1a2457' : '#1c275c';
        g.beginPath();
        g.arc(x, y, 14, Math.PI, TAU);
        g.fill();
        for (const r of [13, 9.5, 6, 2.5]) {
          g.strokeStyle = `rgba(140,170,240,${(0.12 + (13 - r) * 0.004).toFixed(3)})`;
          g.beginPath();
          g.arc(x, y, r, Math.PI, TAU);
          g.stroke();
        }
      }
    }
    // a gold-and-red trim under the counter, and a big pale wave crest in the corner
    g.fillStyle = '#c8962e';
    g.fillRect(0, 300, W, 3);
    g.fillStyle = '#a3212a';
    g.fillRect(0, 303, W, 5);
    g.fillStyle = '#c8962e';
    g.fillRect(0, 308, W, 1.5);
    for (const [cx, cy, r, a] of [[300, 470, 70, 0.1], [60, 420, 46, 0.07]]) {
      g.strokeStyle = `rgba(200,220,255,${a})`;
      g.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(cx, cy, r - k * 12, Math.PI * 1.05, Math.PI * 1.95);
        g.stroke();
      }
      g.fillStyle = `rgba(200,220,255,${a})`;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(cx - r * 0.7 + k * r * 0.35, cy - r * 0.95 - (k % 2) * 6, 4, 0, TAU);
        g.fill();
      }
    }
    // warm light falling on it from the counter above, darker towards the belt
    const lg = g.createLinearGradient(0, 296, 0, 520);
    lg.addColorStop(0, 'rgba(255,200,130,0.12)');
    lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,0,20,0.3)');
    g.fillStyle = lg;
    g.fillRect(0, 296, W, 224);

    // belt rails: polished steel above and below the moving band
    const rail = (y, h, flip) => {
      const rg = g.createLinearGradient(0, y, 0, y + h);
      rg.addColorStop(0, flip ? '#6c7682' : '#f4f7fa');
      rg.addColorStop(0.5, '#b8c1ca');
      rg.addColorStop(1, flip ? '#e8edf2' : '#5f6975');
      g.fillStyle = rg;
      g.fillRect(0, y, W, h);
    };
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 512, W, 6);
    rail(516, 11, false);
    rail(577, 10, true);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(0, 517, W, 1.2);

    // the diners' counter in front, with tea cups, soy dishes and chopsticks
    const cg = g.createLinearGradient(0, 587, 0, H);
    cg.addColorStop(0, '#f2d7a2');
    cg.addColorStop(1, '#d1a868');
    g.fillStyle = cg;
    g.fillRect(0, 587, W, H - 587);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 587, W, 3);
    g.strokeStyle = 'rgba(160,110,50,0.18)';
    g.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(0, 598 + k * 8);
      g.bezierCurveTo(120, 594 + k * 8, 240, 604 + k * 8, W, 597 + k * 8);
      g.stroke();
    }
    for (const x of [34, 196]) {
      // yunomi tea cup
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(x + 2, 630, 14, 4, 0, 0, TAU);
      g.fill();
      const yg = g.createLinearGradient(x - 12, 0, x + 12, 0);
      yg.addColorStop(0, '#5b7f6a');
      yg.addColorStop(0.5, '#88ab92');
      yg.addColorStop(1, '#4a6a58');
      g.fillStyle = yg;
      g.beginPath();
      g.moveTo(x - 12, 604);
      g.lineTo(x - 10, 628);
      g.quadraticCurveTo(x, 632, x + 10, 628);
      g.lineTo(x + 12, 604);
      g.closePath();
      g.fill();
      g.fillStyle = '#6a9a3a';
      g.beginPath();
      g.ellipse(x, 604, 12, 3.5, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x - 4, 610);
      g.lineTo(x + 4, 610);
      g.moveTo(x, 608);
      g.lineTo(x, 622);
      g.moveTo(x - 5, 616);
      g.lineTo(x + 5, 618);
      g.stroke();
    }
    for (const x of [104, 286]) {
      // soy dish
      g.fillStyle = '#f4f2ee';
      g.beginPath();
      g.ellipse(x, 618, 15, 6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#4a2410';
      g.beginPath();
      g.ellipse(x, 618, 10, 3.6, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.ellipse(x - 4, 617, 3, 1, 0, 0, TAU);
      g.fill();
      // chopsticks on a rest
      g.strokeStyle = '#8a4a22';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x + 22, 606);
      g.lineTo(x + 52, 632);
      g.moveTo(x + 27, 604);
      g.lineTo(x + 56, 628);
      g.stroke();
      g.fillStyle = '#d6282e';
      g.beginPath();
      g.roundRect(x + 28, 613, 8, 4, 2);
      g.fill();
    }
    // pickled ginger
    g.fillStyle = '#f4f2ee';
    g.beginPath();
    g.ellipse(334, 616, 13, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#f7b6b0';
    for (const [dx, dy] of [[-4, -1], [2, -2], [0, 1], [5, 0]]) {
      g.beginPath();
      g.ellipse(334 + dx, 615 + dy, 3.5, 1.6, dx * 0.2, 0, TAU);
      g.fill();
    }
  }, 2);
}

// counters and fish cases drawn in front of the chef
function makeFront(W) {
  return makeSprite(W, 100, (g) => {
    g.translate(-W / 2, -250);
    // glass sushi-neta cases on either side
    for (const [x0, x1] of [[6, 132], [228, 354]]) {
      g.fillStyle = 'rgba(205,235,245,0.28)';
      g.fillRect(x0, 208, x1 - x0, 46);
      // ice
      g.fillStyle = '#e8f4fb';
      g.fillRect(x0 + 2, 238, x1 - x0 - 4, 14);
      g.fillStyle = 'rgba(160,200,230,0.6)';
      for (let x = x0 + 4; x < x1 - 4; x += 7) {
        g.beginPath();
        g.arc(x, 240, 3, 0, TAU);
        g.fill();
      }
      // fish blocks resting on the ice
      const fish = x0 < 100 ? ['#ff8a4a', '#d9244c', '#f2f0e8'] : ['#2f6ac0', '#ffc81a', '#c8404a'];
      fish.forEach((c, k) => {
        const fx = x0 + 10 + k * 38;
        g.fillStyle = c;
        g.beginPath();
        g.roundRect(fx, 226, 32, 13, 3);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(fx + 3, 228, 24, 2);
        if (c === '#ff8a4a') {
          g.strokeStyle = 'rgba(255,235,210,0.8)';
          g.lineWidth = 1.2;
          for (let s = 4; s < 32; s += 6) {
            g.beginPath();
            g.moveTo(fx + s, 226);
            g.lineTo(fx + s + 4, 239);
            g.stroke();
          }
        }
        if (c === '#f2f0e8') {
          g.fillStyle = '#f08a7a';
          g.fillRect(fx, 226, 32, 3);
        }
      });
      // a green bamboo-leaf divider
      g.fillStyle = '#3da24a';
      g.beginPath();
      g.ellipse(x0 + 46, 236, 4, 9, 0.3, 0, TAU);
      g.fill();
      // steel frame and glass reflections
      g.strokeStyle = '#a9b4bf';
      g.lineWidth = 2;
      g.strokeRect(x0, 208, x1 - x0, 46);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(x0 + 12, 208);
      g.lineTo(x0 + 26, 208);
      g.lineTo(x0 + 10, 254);
      g.lineTo(x0 - 4 + 4, 254);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x0 + 2, 210, x1 - x0 - 4, 3);
    }
    // the chef's cutting board
    const bg = g.createLinearGradient(0, 244, 0, 256);
    bg.addColorStop(0, '#f6e4bc');
    bg.addColorStop(1, '#d9b67a');
    g.fillStyle = bg;
    g.fillRect(136, 244, 88, 12);
    // counter top and front
    const top = g.createLinearGradient(0, 252, 0, 262);
    top.addColorStop(0, '#fbe6bb');
    top.addColorStop(1, '#d8b06c');
    g.fillStyle = top;
    g.fillRect(0, 254, W, 8);
    const fr = g.createLinearGradient(0, 262, 0, 300);
    fr.addColorStop(0, '#6a3e22');
    fr.addColorStop(1, '#3e2312');
    g.fillStyle = fr;
    g.fillRect(0, 262, W, 38);
    g.strokeStyle = 'rgba(255,200,140,0.12)';
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(0, 268 + k * 7);
      g.bezierCurveTo(120, 264 + k * 7, 220, 274 + k * 7, W, 266 + k * 7);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 262, W, 2);
  }, 2);
}

// ---------- music: future funk, 136 BPM, E major over the "royal road" A–B–G♯m–C♯m ----------

const music = {
  cps: 136 / 240,
  setup: `
    const kick = note("e2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("e2 e2 e2 [e2 e2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.11).sustain(0).hpf(1100).lpf(6000).gain(0.14).room(0.3)
    const hat = s("[~ white]*4").decay(0.04).sustain(0).hpf(6800).gain(0.05)
    const hat16 = s("white*16").decay(0.025).sustain(0).hpf(7000).gain("[0.012 0.03 0.02 0.03]*4")
    const ohat = s("[~ white]*4").decay(0.18).sustain(0).hpf(6500).gain(0.035)
    const bass = note("<[a2 a3 ~ a2 ~ a3 a2 e3] [b2 b3 ~ b2 ~ b3 b2 f#3] [g#2 g#3 ~ g#2 ~ g#3 g#2 d#3] [c#3 c#4 ~ c#3 ~ c#4 b2 g#2]>")
      .s("sawtooth").decay(0.14).sustain(0.2).release(0.05).lpf(saw.range(400, 1800).slow(34)).lpq(6).gain(0.36)
    const sub = note("<a2 b2 g#2 c#3>").s("sine").decay(0.5).sustain(0.4).gain(0.2)
    const chords = "<[a3,c#4,e4,g#4] [b3,d#4,f#4,a4] [g#3,b3,d#4,f#4] [c#4,e4,g#4,b4]>"
    const stab = note(chords).struct("x ~ x x ~ x ~ x").s("sawtooth").decay(0.12).sustain(0)
      .lpf(saw.range(900, 2600).slow(34)).gain(0.05).room(0.3)
    const keys = note(chords).struct("[~ x]*4").s("triangle").decay(0.25).sustain(0.05).lpf(3000).gain(0.055).room(0.4).pan(0.4)
    const gtr = note(chords).struct("~ x ~ x ~ ~ x ~ ~ x ~ x ~ ~ x ~").s("square").decay(0.05).sustain(0)
      .hpf(600).lpf(2600).gain(0.03).pan(0.65)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.4).lpf(900).gain(0.045).room(0.5)
    const tune = "<[c#6@3 b5 g#5@2 e5 f#5] [g#5@2 f#5 e5 d#5@2 e5 f#5] [b5@3 a5 g#5@2 f#5 e5] [g#5@2 e5 c#5 e5@2 f#5 g#5]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.15).sustain(0.4).release(0.06).lpf(2400).vib(5).vibmod(0.1)
      .gain(0.06).room(0.4).delay(0.22).delaytime(0.331).delayfeedback(0.25).pan(0.58)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.35).release(0.05).lpf(1400).gain(0.045)
    const arp = note("<[a4 c#5 e5 g#5]*4 [b4 d#5 f#5 a5]*4 [g#4 b4 d#5 f#5]*4 [c#5 e5 g#5 b5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.035).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(10)).gain(saw.range(0, 0.05).slow(10))
  `,
  song: `arrange(
    [8, stack(kick, hat, bass, sub, stab)],
    [8, stack(kick, clap, hat, bass, sub, stab, keys, gtr, pad)],
    [8, stack(kick, clap, hat, hat16, bass, sub, stab, keys, pad, lead)],
    [10, stack(kick2, clap, hat16, ohat, bass, sub, stab, keys, gtr, pad, lead, leadLow, arp, wash)]
  )`,
};

export default {
  id: 'sushi',
  title: 'Sushi Train',
  emoji: '🍣',
  tagline: 'Slide the belt so every piece lands on a plate of its own colour.',
  colors: { bg: '#1b2558', fg: '#ffffff', accent: '#ff7a2e' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const events = buildPlan(plan);
    const queue = events.slice().sort((a, b) => a.launch - b.launch);

    // ---- art, rendered once ----
    const backdrop = makeBackdrop(W, H);
    const front = makeFront(W);
    const pieces = TYPES.map((_, k) => makePiece(k));
    const wrapper = makeWrapper();
    const plates = TYPES.map((_, k) => makePlate(k));
    const beltTile = makeBeltTile();
    const lantern = makeLantern();
    const chefBody = makeChefBody();
    const chefHead = makeChefHead(false);
    const chefShock = makeChefHead(true);
    const cat = makeCat();
    const paw = makePaw();
    const glowWarm = glowSprite('rgba(255,150,90,0.55)', 48);
    const glowGood = glowSprite('rgba(120,255,160,0.8)', 24);
    const glowBad = glowSprite('rgba(255,40,60,0.85)', 24);
    const glowSpot = glowSprite('rgba(255,235,200,0.5)', 60);
    const vignette = vignetteSprite(W, H, 0.42, '10,10,40');

    const fx = createParticles();
    const sparks = createParticles();

    let s = S0; // belt offset
    let vb = 0; // belt velocity, screen px/s (positive moves the plates right)
    let clock = 0;
    let qi = 0;
    const air = []; // pieces in flight
    const onPlate = new Map(); // plate index → [{type, age}]
    const bounce = new Map(); // plate index → time since a piece landed on it
    const hands = { '-1': { throwT: 9 }, '0': { throwT: 9 }, '1': { throwT: 9 } };
    let killer = null;
    let killPlate = 0;
    let shockT = 0;
    let chefHop = 0;

    const pieceSprite = (e, t) => (e.mystery && t < e.reveal ? wrapper : pieces[e.type]);
    const piecePos = (e, t) => {
      const u = clamp((t - e.launch) / e.F, 0, 1);
      const y0 = HAND_Y - 6;
      return {
        u,
        x: lerp(e.x0, e.x1, u),
        y: lerp(y0, LAND_Y, u * u * 0.35 + u * 0.65) - e.arc * 4 * u * (1 - u),
        rot: e.spin * TAU * (1 - u) * (1 - u) * 0.5,
      };
    };

    const land = (e, t, game) => {
      e.state = 'landed';
      const i = plateIndexAt(e.x1, s);
      const pt = mod(i, NT);
      if (pt !== e.type) {
        game.dead = true;
        const pn = TYPES[pt].plate;
        game.deathReason = `${TYPES[e.type].name} landed on ${article(pn)} ${pn} plate.`;
        killer = { e, x: e.x1, y: LAND_Y, vx: (e.x1 < 180 ? -1 : 1) * 70, vy: -260, rot: 0, vr: (Math.random() - 0.5) * 14 };
        killPlate = i;
        shockT = 0;
        fx.burst(e.x1, LAND_Y, { count: 18, speed: 160, life: 0.7, size: 3, round: true, gravity: 500, angle: -Math.PI / 2, spread: 2.4, colors: ['#ffffff', '#f4ead6', TYPES[e.type].col] });
        return;
      }
      const list = onPlate.get(i) || [];
      list.push({ type: e.type, age: 0, dx: (Math.random() - 0.5) * 6 });
      if (list.length > 2) list.shift();
      onPlate.set(i, list);
      bounce.set(i, 0);
      fx.burst(e.x1, LAND_Y - 2, { count: 8, speed: 70, life: 0.45, size: 2.4, round: true, gravity: 320, angle: -Math.PI / 2, spread: 2.6, colors: ['#ffffff', '#f4ead6'] });
      sparks.burst(e.x1, LAND_Y - 12, { count: 10, speed: 110, life: 0.55, size: 2.6, gravity: 60, colors: [TYPES[e.type].hi, '#ffffff', '#fff2a8'] });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      fx.update(dt);
      sparks.update(dt);
      for (const h of Object.values(hands)) h.throwT += dt;
      for (const [k, v] of bounce) bounce.set(k, v + dt);
      // plates that have gone off the end of the counter come back empty
      for (const k of [...onPlate.keys()]) {
        const x = plateX(k, s);
        if (x < -60 || x > W + 60) onPlate.delete(k);
      }
      chefHop = Math.max(0, chefHop - dt * 4);
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { events, get s() { return s; }, get vb() { return vb; } },

      update(dt, dir, t) {
        updateCosmetic(dt);
        vb += (dir * SPEED - vb) * Math.min(1, ACCEL * dt);
        s -= vb * dt;

        while (qi < queue.length && queue[qi].launch <= t) {
          const e = queue[qi++];
          e.state = 'air';
          air.push(e);
          hands[e.hand].throwT = 0;
          chefHop = 1;
        }
        for (let k = air.length - 1; k >= 0; k--) {
          const e = air[k];
          if (e.mystery && !e.shown && t >= e.reveal) {
            e.shown = true;
            const p = piecePos(e, t);
            fx.burst(p.x, p.y, { count: 14, speed: 120, life: 0.6, size: 3.2, gravity: 200, colors: ['#ffffff', '#f2e6d0', '#d6282e'] });
          }
          if (t >= e.T) {
            air.splice(k, 1);
            land(e, t, this);
            if (this.dead) return;
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        vb *= Math.max(0, 1 - 6 * dt);
        s -= vb * dt;
        shockT += dt;
        if (killer) {
          killer.vy += 900 * dt;
          killer.x += killer.vx * dt;
          killer.y += killer.vy * dt;
          killer.rot += killer.vr * dt;
        }
      },

      render(g, t) {
        g.drawImage(backdrop.canvas, 0, 0, W, H);

        // lanterns swaying with their warm glow
        for (const [lx, ph] of [[30, 0], [330, 1.9]]) {
          const sway = Math.sin(clock * 1.3 + ph) * 0.06;
          const ly = 84;
          g.strokeStyle = '#2a1a12';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(lx, 40);
          g.lineTo(lx + Math.sin(sway) * 40, ly - 24);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowWarm, lx + Math.sin(sway) * 44, ly, { size: 110, alpha: 0.7 + 0.08 * Math.sin(clock * 6 + ph) });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, lantern, lx + Math.sin(sway) * 44, ly, { size: 32, rot: -sway });
        }

        // the lucky cat on the shelf, beckoning
        drawSprite(g, cat, 304, 182, { size: 36 });
        const pr = -0.4 + Math.sin(clock * 5) * 0.45;
        g.save();
        g.translate(313, 178);
        g.rotate(pr);
        drawSprite(g, paw, 0, -7, { size: 9 });
        g.restore();

        // the chef
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowSpot, CHEF_X, 200, { size: 200, alpha: 0.6 });
        g.globalCompositeOperation = 'source-over';
        const beat = Math.abs(Math.sin(clock * Math.PI * (136 / 60)));
        const bob = beat * 1.6 + chefHop * 2;
        drawSprite(g, chefBody, CHEF_X, 238 + bob * 0.5, { size: 96 });
        // arms: each hand winds down with the next piece, then flicks up as it throws
        for (const hk of [-1, 1]) {
          const h = hands[hk];
          let next = null;
          for (let k = qi; k < queue.length && queue[k].launch < t + 0.4; k++) {
            if (queue[k].hand === hk || (queue[k].hand === 0 && hk === 1)) {
              next = queue[k];
              break;
            }
          }
          const sx = CHEF_X + hk * 30;
          const sy = 212 + bob * 0.5;
          let hx = CHEF_X + hk * 36;
          let hy = HAND_Y + 6;
          if (h.throwT < 0.25 || (hk === 1 && hands[0].throwT < 0.25)) {
            const k = Math.min(h.throwT, hands[0].throwT) / 0.25;
            hx = CHEF_X + hk * lerp(26, 36, k);
            hy = lerp(HAND_Y - 18, HAND_Y + 6, k);
          } else if (next) {
            const k = clamp((next.launch - t) / 0.4, 0, 1);
            hy = HAND_Y + 6 - (1 - k) * 4;
            hx = CHEF_X + hk * (36 - (1 - k) * 6);
          }
          g.strokeStyle = '#eef2f6';
          g.lineCap = 'round';
          g.lineWidth = 12;
          g.beginPath();
          g.moveTo(sx, sy);
          g.quadraticCurveTo(sx + hk * 16, (sy + hy) / 2 + 8, hx, hy - 4);
          g.stroke();
          g.strokeStyle = 'rgba(150,165,185,0.6)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(sx + hk * 5, sy + 4);
          g.quadraticCurveTo(sx + hk * 20, (sy + hy) / 2 + 12, hx + hk * 3, hy - 2);
          g.stroke();
          if (next && next.launch > t) drawSprite(g, pieceSprite(next, t), hx, hy - 8, { size: 28 });
          g.fillStyle = '#efbb92';
          g.beginPath();
          g.arc(hx, hy, 6, 0, TAU);
          g.fill();
        }
        drawSprite(g, this.dead && shockT < 9 ? chefShock : chefHead, CHEF_X, 178 + bob, { size: 60, rot: Math.sin(clock * 2.3) * 0.04 });
        g.drawImage(front.canvas, 0, 200, W, 100);

        // motes of light drifting through the lamplight (cosmetic)
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 10; k++) {
          const mx = (k * 83.7 + Math.sin(clock * 0.4 + k) * 20 + 400) % W;
          const my = 320 + ((k * 57.3 + clock * (6 + k)) % 190);
          drawSprite(g, glowWarm, mx, my, { size: 10 + (k % 3) * 4, alpha: 0.35 });
        }
        g.globalCompositeOperation = 'source-over';

        // the moving belt band
        const off = mod(-s, 32);
        for (let x = off - 32; x < W + 32; x += 32) g.drawImage(beltTile.canvas, x, 527, 32, 50);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(0, 527, W, 3);

        // plates, with a ghost of what belongs on each empty one
        const i0 = Math.floor((s - 40) / PLATE);
        const i1 = Math.ceil((s + W + 40) / PLATE);
        for (let i = i0; i <= i1; i++) {
          const x = plateX(i, s);
          const k = mod(i, NT);
          const bt = bounce.get(i);
          const sq = bt !== undefined && bt < 0.3 ? Math.sin((bt / 0.3) * Math.PI) * 3 : 0;
          drawSprite(g, plates[k], x, BELT_Y + sq * 0.5, { size: 62 - sq });
          const list = onPlate.get(i);
          if (!list || !list.length) {
            drawSprite(g, pieces[k], x, BELT_Y - 4, { size: 30, alpha: 0.28 });
          } else {
            list.forEach((p, j) => drawSprite(g, pieces[p.type], x + p.dx, LAND_Y - j * 7 + sq * 0.6, { size: 42 }));
          }
          if (this.dead && i === killPlate) {
            const pulse = 0.5 + 0.5 * Math.sin(clock * 14);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowBad, x, BELT_Y, { size: 90, alpha: 0.5 + 0.4 * pulse });
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = pulse > 0.5 ? '#ff3a4a' : '#ffd0d4';
            g.lineWidth = 3.5;
            g.beginPath();
            g.ellipse(x, BELT_Y, 33, 16, 0, 0, TAU);
            g.stroke();
            g.lineWidth = 5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(x - 9, 496);
            g.lineTo(x + 9, 514);
            g.moveTo(x + 9, 496);
            g.lineTo(x - 9, 514);
            g.stroke();
          }
        }

        // landing rings, shadows and the ✓ / ✗ badge for every piece in the air
        const tt = t;
        for (const e of air) {
          const p = piecePos(e, tt);
          const hidden = e.mystery && tt < e.reveal;
          const col = hidden ? '#e8e2d6' : TYPES[e.type].col;
          const i = plateIndexAt(e.x1, s);
          const ok = mod(i, NT) === e.type;
          const left = e.T - tt;
          g.fillStyle = `rgba(0,0,0,${(0.12 + 0.3 * p.u).toFixed(3)})`;
          g.beginPath();
          g.ellipse(e.x1, BELT_Y + 5, 6 + 14 * p.u, 2 + 4 * p.u, 0, 0, TAU);
          g.fill();
          g.globalAlpha = 0.95;
          g.lineWidth = 4.5;
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.setLineDash([6, 4]);
          g.beginPath();
          g.ellipse(e.x1, BELT_Y, 33, 16, 0, 0, TAU);
          g.stroke();
          g.lineWidth = 2.4;
          g.strokeStyle = col;
          g.stroke();
          g.setLineDash([]);
          // the solid part fills in as the piece comes down
          g.lineWidth = 6;
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.beginPath();
          g.ellipse(e.x1, BELT_Y, 33, 16, 0, -Math.PI / 2, -Math.PI / 2 + TAU * p.u);
          g.stroke();
          g.lineWidth = 3.4;
          g.strokeStyle = col;
          g.stroke();
          g.globalAlpha = 1;
          // badge on the rail
          const by = 505;
          const urgent = !hidden && !ok && left < 0.55;
          const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
          if (!hidden) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, ok ? glowGood : glowBad, e.x1, by, { size: urgent ? 46 + pulse * 10 : 34, alpha: ok ? 0.5 : 0.6 });
            g.globalCompositeOperation = 'source-over';
          }
          g.fillStyle = hidden ? '#8a8478' : ok ? '#22b65a' : urgent && pulse > 0.5 ? '#ff6070' : '#e0283c';
          g.beginPath();
          g.arc(e.x1, by, 9, 0, TAU);
          g.fill();
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2;
          g.stroke();
          g.lineWidth = 2.6;
          g.lineCap = 'round';
          g.beginPath();
          if (hidden) {
            g.font = '900 12px "Arial Black", Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = '#ffffff';
            g.fillText('?', e.x1, by + 0.5);
          } else if (ok) {
            g.moveTo(e.x1 - 4, by);
            g.lineTo(e.x1 - 1, by + 3.5);
            g.lineTo(e.x1 + 4.5, by - 3.5);
          } else {
            g.moveTo(e.x1 - 3.5, by - 3.5);
            g.lineTo(e.x1 + 3.5, by + 3.5);
            g.moveTo(e.x1 + 3.5, by - 3.5);
            g.lineTo(e.x1 - 3.5, by + 3.5);
          }
          g.stroke();
          // a small swatch of the colour it needs, next to the badge
          if (!hidden && !ok) {
            g.fillStyle = col;
            g.beginPath();
            g.arc(e.x1 + 15, by, 5, 0, TAU);
            g.fill();
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1.4;
            g.stroke();
          }
        }

        // the pieces in the air (on top of everything), with a faint trail
        for (const e of air) {
          for (let k = 1; k <= 4; k++) {
            const q = piecePos(e, tt - k * 0.035);
            if (q.u <= 0) break;
            g.fillStyle = `rgba(255,245,225,${(0.22 - k * 0.045).toFixed(3)})`;
            g.beginPath();
            g.arc(q.x, q.y, 7 - k, 0, TAU);
            g.fill();
          }
          const p = piecePos(e, tt);
          drawSprite(g, pieceSprite(e, tt), p.x, p.y, { size: lerp(30, 42, p.u), rot: p.rot });
        }
        if (killer) {
          drawSprite(g, pieces[killer.e.type], killer.x, killer.y, { size: 42, rot: killer.rot });
        }

        fx.render(g);
        sparks.render(g, true);
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };

    return game;
  },
};
