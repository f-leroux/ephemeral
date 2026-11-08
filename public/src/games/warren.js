// Rabbit Run — a wild rabbit dashes up a golden stubble field on a late-summer morning, and the
// field is crossed by hedgerows that no rabbit can get through. The only way past each hedge is
// underground: run into a burrow and you dive down it, follow the tunnel under the hedge and pop
// out of the hole at its other end, which is usually somewhere else entirely, because the tunnels
// cross and tangle under the hedge. Each tunnel has its own colour (a ring round both holes and a
// dotted trail of turned earth between them), and some exits have a fox sitting by them, waiting.
// So before every hedge you read which entrance leads to a safe exit and get to it in time, while
// dodging brambles on the surface; from 11s foxes also dash across the field. Over
// the minute the field speeds up, hedges come closer together, there are more tunnels with more
// foxes at their ends, and the gaps fill with more brambles. Everything is planned up front from
// the rng around a reference run (always one good tunnel within reach), and checked against a
// reference rabbit with a slower hand, so there is always a way through.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 540; // where the rabbit runs
const EDGE = 16; // wildflower verges down both sides
const PR = 9; // the rabbit's hit radius
const HB = 44; // hedge thickness
const IN = 28; // burrow distance from the hedge
const CAP = 20; // how close to a burrow you must be to dive in
const SPEED = 300;
const ACCEL = 20;

const speedAt = (t) => lerp(150, 238, progress(t, 60, 1.2)) * lerp(0.72, 1, easeOutCubic(clamp(t / 4, 0, 1)));
const smooth = (u) => u * u * (3 - 2 * u);

const TUNNEL_COLS = ['#3aa8ff', '#ff4f9a', '#8f6bff', '#16cfae', '#ffffff'];
const SOIL = ['#6b4528', '#8a5c35', '#4a2f1b', '#a87a4a'];
const STRAW = ['#f3d27a', '#e6bb5a', '#fff0b8', '#c9973e'];
const FUR = ['#9a7b5a', '#c8ab88', '#6e553d', '#ffffff'];

// ---------- art ----------

function paintField(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#cf9438');
    base.addColorStop(0.3, '#dfac4c');
    base.addColorStop(0.6, '#e5b456');
    base.addColorStop(1, '#cc9035');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // the combine's rows run up the field
    for (let x = 0, i = 0; x < W; x += 30, i++) {
      g.fillStyle = i % 2 ? 'rgba(255,235,170,0.10)' : 'rgba(150,95,30,0.08)';
      g.fillRect(x, 0, 30, H);
    }
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // soft blotches of lighter and darker straw
    for (let i = 0; i < 24; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(30, 70);
      const light = rng.chance(0.5);
      wrap(() => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, light ? 'rgba(255,240,190,0.22)' : 'rgba(160,100,40,0.16)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, r * 0.7, r, 0, 0, TAU);
        g.fill();
      });
    }
    // stubble: short cut stalks in rows, with their little shadows
    g.lineCap = 'round';
    for (let x = 8; x < W; x += 10) {
      for (let y = rng.range(0, 8); y < H; y += rng.range(7, 12)) {
        const xx = x + rng.range(-3, 3);
        const yy = y;
        const l = rng.range(2, 4.5);
        const c = rng.pick(['#f6dc8c', '#fbe7a6', '#e9c76c', '#d8ad55']);
        wrap(() => {
          g.strokeStyle = 'rgba(110,70,20,0.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(xx + 0.8, yy + 0.8);
          g.lineTo(xx + 2.2, yy + l + 0.8);
          g.stroke();
          g.strokeStyle = c;
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(xx, yy);
          g.lineTo(xx + 0.4, yy + l * 0.6);
          g.stroke();
        });
      }
    }
    // loose straw
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const a = rng.range(0, TAU);
      const l = rng.range(4, 10);
      const c = rng.pick(['rgba(255,238,175,0.8)', 'rgba(240,205,120,0.8)', 'rgba(200,150,70,0.6)']);
      wrap(() => {
        g.strokeStyle = c;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      });
    }
    // a few weeds and poppies
    for (let i = 0; i < 26; i++) {
      const x = rng.range(10, W - 10);
      const y = rng.range(0, H);
      const poppy = rng.chance(0.35);
      wrap(() => {
        g.fillStyle = 'rgba(90,120,40,0.75)';
        for (let k = 0; k < 4; k++) {
          const a = rng.range(0, TAU);
          g.beginPath();
          g.ellipse(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 3, 1.3, a, 0, TAU);
          g.fill();
        }
        if (poppy) {
          g.fillStyle = '#e8322b';
          g.beginPath();
          g.arc(x, y, 2.6, 0, TAU);
          g.fill();
          g.fillStyle = '#2a1410';
          g.beginPath();
          g.arc(x, y, 0.9, 0, TAU);
          g.fill();
        }
      });
    }
  }, 2);
}

function paintVerges(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const side of [-1, 1]) {
      const outer = side < 0 ? 0 : W;
      const N = 40;
      const pts = [];
      const ph = rng.range(0, TAU);
      for (let i = 0; i <= N; i++) {
        const y = (i / N) * H;
        const w = EDGE + 3 + Math.sin((i / N) * TAU * 4 + ph) * 3 + Math.sin((i / N) * TAU * 11) * 1.5;
        pts.push([side < 0 ? w : W - w, y]);
      }
      g.fillStyle = 'rgba(90,60,20,0.25)';
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x - side * 5, y + 2);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      const grad = g.createLinearGradient(outer, 0, side < 0 ? EDGE + 6 : W - EDGE - 6, 0);
      grad.addColorStop(0, '#3f6b2a');
      grad.addColorStop(1, '#6f9a3a');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      // grass blades and wild flowers
      g.lineCap = 'round';
      for (let i = 0; i < 140; i++) {
        const x = side < 0 ? rng.range(0, EDGE + 3) : rng.range(W - EDGE - 3, W);
        const y = rng.range(0, H);
        const a = -Math.PI / 2 + rng.range(-0.8, 0.8) + (side < 0 ? 0.3 : -0.3);
        const l = rng.range(4, 9);
        const c = rng.pick(['#8dbb4a', '#5d8a30', '#a9c95c', '#4a7526']);
        for (const dy of [-H, 0, H]) {
          g.strokeStyle = c;
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(x, y + dy);
          g.lineTo(x + Math.cos(a) * l, y + dy + Math.sin(a) * l);
          g.stroke();
        }
      }
      for (let i = 0; i < 26; i++) {
        const x = side < 0 ? rng.range(2, EDGE) : rng.range(W - EDGE, W - 2);
        const y = rng.range(0, H);
        const c = rng.pick(['#ffffff', '#ffd84a', '#c48bff', '#ff6d8a', '#7ec8ff']);
        for (const dy of [-H, 0, H]) {
          g.fillStyle = c;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * TAU;
            g.beginPath();
            g.arc(x + Math.cos(a) * 1.7, y + dy + Math.sin(a) * 1.7, 1.3, 0, TAU);
            g.fill();
          }
          g.fillStyle = '#f4b52a';
          g.beginPath();
          g.arc(x, y + dy, 0.9, 0, TAU);
          g.fill();
        }
      }
    }
  }, 2);
}

function paintHedge(W, rng) {
  const Hh = 76;
  return makeSprite(W, Hh, (g) => {
    g.translate(-W / 2, -Hh / 2);
    const mid = Hh / 2;
    // shadow thrown down the field
    const sh = g.createLinearGradient(0, mid, 0, mid + HB / 2 + 16);
    sh.addColorStop(0, 'rgba(70,40,10,0.45)');
    sh.addColorStop(1, 'rgba(70,40,10,0)');
    g.fillStyle = sh;
    g.fillRect(0, mid, W, HB / 2 + 16);
    // dark core
    g.fillStyle = '#1f3b17';
    g.beginPath();
    g.roundRect(-10, mid - HB / 2 + 4, W + 20, HB - 6, 14);
    g.fill();
    // leafy clumps, darkest first
    const layers = [
      ['#24451a', '#16300f', 26],
      ['#2f5a20', '#1e3c15', 22],
      ['#3e7228', '#28501b', 18],
      ['#558a33', '#386a22', 12],
    ];
    for (const [c0, c1, r] of layers) {
      for (let x = -10; x < W + 10; x += r * 0.8) {
        const xx = x + rng.range(-4, 4);
        const yy = mid + rng.range(-HB / 2 + r * 0.5, HB / 2 - r * 0.6) - 2;
        const rr = r * rng.range(0.6, 0.95);
        const gr = g.createRadialGradient(xx - rr * 0.35, yy - rr * 0.4, 0, xx, yy, rr);
        gr.addColorStop(0, c0);
        gr.addColorStop(1, c1);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(xx, yy, rr, 0, TAU);
        g.fill();
      }
    }
    // individual leaves catching the light
    for (let i = 0; i < 260; i++) {
      const x = rng.range(-4, W + 4);
      const y = mid + rng.range(-HB / 2, HB / 2 - 4);
      const a = rng.range(0, TAU);
      g.fillStyle = rng.pick(['rgba(140,190,80,0.7)', 'rgba(100,150,60,0.7)', 'rgba(190,220,120,0.55)', 'rgba(30,60,20,0.5)']);
      g.beginPath();
      g.ellipse(x, y, 3, 1.5, a, 0, TAU);
      g.fill();
    }
    // hawthorn berries and a few late blossoms
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const y = mid + rng.range(-HB / 2 + 4, HB / 2 - 6);
      if (rng.chance(0.7)) {
        g.fillStyle = '#b3141c';
        g.beginPath();
        g.arc(x, y, 1.8, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,160,150,0.8)';
        g.beginPath();
        g.arc(x - 0.6, y - 0.6, 0.6, 0, TAU);
        g.fill();
      } else {
        g.fillStyle = 'rgba(255,250,240,0.9)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          g.beginPath();
          g.arc(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 1.1, 0, TAU);
          g.fill();
        }
      }
    }
    // sunlit top edge
    g.strokeStyle = 'rgba(230,240,150,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = -4; x <= W + 4; x += 6) {
      const y = mid - HB / 2 + 3 + Math.sin(x * 0.21) * 2 + Math.sin(x * 0.07) * 2;
      if (x < 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }, 2);
}

function paintHole() {
  return makeSprite(40, 34, (g) => {
    // fan of dug-out earth, mostly on the far side
    const mg = g.createRadialGradient(0, -4, 2, 0, -2, 18);
    mg.addColorStop(0, '#8a5c35');
    mg.addColorStop(0.7, '#6e4628');
    mg.addColorStop(1, 'rgba(110,70,40,0)');
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(0, -3, 18, 14, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const r = 9 + Math.random() * 7;
      g.fillStyle = ['#a87a4a', '#5a3a20', '#8a5c35'][i % 3];
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r * 0.8 - 3, 0.6 + Math.random() * 1.4, 0, TAU);
      g.fill();
    }
    // the hole
    const hg = g.createRadialGradient(0, 1, 1, 0, 0, 10);
    hg.addColorStop(0, '#0c0604');
    hg.addColorStop(0.75, '#22140a');
    hg.addColorStop(1, '#4a2f1b');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(0, 0, 10, 8, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(200,150,90,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 0.5, 10, 8, 0, 0.1, Math.PI - 0.1);
    g.stroke();
  }, 3);
}

function paintRabbit(frame) {
  return makeSprite(30, 44, (g) => {
    const stretch = frame ? 1.1 : 0.94;
    g.save();
    g.scale(1, stretch);
    // back legs (big hind feet) tucked under or kicked out
    g.fillStyle = '#6e553d';
    const fy = frame ? 15 : 10;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 7, fy, 3.5, 6.5, s * 0.2, 0, TAU);
      g.fill();
    }
    // body
    const bg = g.createRadialGradient(-3, -2, 1, 0, 3, 13);
    bg.addColorStop(0, '#c8ab88');
    bg.addColorStop(0.55, '#9a7b5a');
    bg.addColorStop(1, '#6a5038');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 3, 9.5, 12, 0, 0, TAU);
    g.fill();
    // fur ticking
    g.strokeStyle = 'rgba(60,40,25,0.35)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 18; i++) {
      const x = -7 + (i % 6) * 2.8;
      const y = -4 + Math.floor(i / 6) * 5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 0.6, y + 2);
      g.stroke();
    }
    // tail
    const tg = g.createRadialGradient(-1, 14, 0, 0, 15, 4.5);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(1, '#e6ddd0');
    g.fillStyle = tg;
    g.beginPath();
    g.arc(0, 15, 4.2, 0, TAU);
    g.fill();
    // head
    const hg = g.createRadialGradient(-2, -12, 0, 0, -10, 8);
    hg.addColorStop(0, '#d2b693');
    hg.addColorStop(1, '#8a6c4d');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(0, -10, 6.5, 7, 0, 0, TAU);
    g.fill();
    // ears laid back along the body
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 3, -7);
      g.rotate(s * (frame ? 0.22 : 0.12));
      g.fillStyle = '#7d6146';
      g.beginPath();
      g.ellipse(0, 6, 2.6, 8, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#e8b9a4';
      g.beginPath();
      g.ellipse(0, 6, 1.2, 6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#3b2a1c';
      g.beginPath();
      g.ellipse(0, 13, 1.8, 1.4, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    // eyes on the sides of the head and a pink nose
    for (const s of [-1, 1]) {
      g.fillStyle = '#1a1008';
      g.beginPath();
      g.ellipse(s * 5, -11.5, 1.5, 2, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(s * 5 - 0.4, -12.2, 0.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#e88a8a';
    g.beginPath();
    g.arc(0, -16.5, 1.3, 0, TAU);
    g.fill();
    // whiskers
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 0.4;
    for (const s of [-1, 1]) {
      for (const a of [-0.25, 0.1]) {
        g.beginPath();
        g.moveTo(s * 1.5, -15.5);
        g.lineTo(s * 9, -15.5 + a * 10);
        g.stroke();
      }
    }
    // front paws reaching forward
    g.fillStyle = '#b39472';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 4.5, frame ? -18 : -14, 1.8, 2.8, 0, 0, TAU);
      g.fill();
    }
    g.restore();
  }, 3);
}

function paintFoxSit() {
  return makeSprite(40, 44, (g) => {
    // tail wrapped round the front
    g.fillStyle = '#c4561c';
    g.beginPath();
    g.ellipse(-4, 12, 14, 6, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = '#fff6ea';
    g.beginPath();
    g.ellipse(-15, 15, 4.5, 3.5, -0.3, 0, TAU);
    g.fill();
    // body
    const bg = g.createRadialGradient(-3, -2, 1, 0, 2, 14);
    bg.addColorStop(0, '#ff9a4a');
    bg.addColorStop(0.6, '#e8701f');
    bg.addColorStop(1, '#a8460f');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 2, 10, 12, 0, 0, TAU);
    g.fill();
    // white chest
    g.fillStyle = '#fff3e3';
    g.beginPath();
    g.ellipse(0, 6, 5, 6, 0, 0, TAU);
    g.fill();
    // black socks
    g.fillStyle = '#2a1a12';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 4, 13, 2.2, 2.8, 0, 0, TAU);
      g.fill();
    }
    // head, looking down at the hole
    const hg = g.createRadialGradient(-2, -10, 0, 0, -9, 9);
    hg.addColorStop(0, '#ffa255');
    hg.addColorStop(1, '#d4621a');
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(-8, -10);
    g.quadraticCurveTo(0, -18, 8, -10);
    g.quadraticCurveTo(4, 2, 0, 4);
    g.quadraticCurveTo(-4, 2, -8, -10);
    g.fill();
    // ears
    for (const s of [-1, 1]) {
      g.fillStyle = '#2a1a12';
      g.beginPath();
      g.moveTo(s * 3, -13);
      g.lineTo(s * 9, -20);
      g.lineTo(s * 8, -9);
      g.closePath();
      g.fill();
      g.fillStyle = '#d4621a';
      g.beginPath();
      g.moveTo(s * 4, -12.5);
      g.lineTo(s * 8.2, -17.5);
      g.lineTo(s * 7.5, -10);
      g.closePath();
      g.fill();
    }
    // white cheeks, eyes and nose
    g.fillStyle = '#fff3e3';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 3.2, -2, 2.6, 3.4, s * 0.4, 0, TAU);
      g.fill();
    }
    for (const s of [-1, 1]) {
      g.fillStyle = '#f4d23c';
      g.beginPath();
      g.ellipse(s * 3.6, -8, 1.8, 1.2, s * 0.3, 0, TAU);
      g.fill();
      g.fillStyle = '#1a0e08';
      g.beginPath();
      g.ellipse(s * 3.6, -8, 0.6, 1.1, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#1a0e08';
    g.beginPath();
    g.arc(0, 3.2, 1.5, 0, TAU);
    g.fill();
  }, 3);
}

function paintFoxRun(frame) {
  // facing right; flipped when running left
  return makeSprite(60, 30, (g) => {
    // tail streaming behind
    const tg = g.createLinearGradient(-30, 0, -8, 0);
    tg.addColorStop(0, '#fff6ea');
    tg.addColorStop(0.2, '#fff6ea');
    tg.addColorStop(0.25, '#c4561c');
    tg.addColorStop(1, '#e8701f');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(-8, -2);
    g.quadraticCurveTo(-20, frame ? -9 : -4, -29, frame ? -5 : 1);
    g.quadraticCurveTo(-22, frame ? 2 : 6, -8, 4);
    g.closePath();
    g.fill();
    // legs, stretched or gathered
    g.fillStyle = '#2a1a12';
    const legs = frame ? [[-10, -9, -0.9], [-8, 9, -0.6], [10, -9, 0.8], [12, 9, 0.6]] : [[-4, -9, 0.3], [-3, 9, 0.2], [5, -9, -0.3], [6, 9, -0.2]];
    for (const [x, y, a] of legs) {
      g.save();
      g.translate(x, y * 0.6);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, Math.sign(y) * 3.5, 1.8, 4.2, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    // body
    const bg = g.createLinearGradient(0, -7, 0, 7);
    bg.addColorStop(0, '#ff9a4a');
    bg.addColorStop(0.6, '#e8701f');
    bg.addColorStop(1, '#a8460f');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(1, 0, 13, 6.5, 0, 0, TAU);
    g.fill();
    // head and snout
    g.fillStyle = '#e8701f';
    g.beginPath();
    g.ellipse(15, 0, 5.5, 5, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(17, -3);
    g.lineTo(25, 0);
    g.lineTo(17, 3);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff3e3';
    g.beginPath();
    g.moveTo(18, -1.6);
    g.lineTo(24, 0);
    g.lineTo(18, 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#1a0e08';
    g.beginPath();
    g.arc(25, 0, 1.2, 0, TAU);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = '#2a1a12';
      g.beginPath();
      g.moveTo(13, s * 2);
      g.lineTo(10, s * 7.5);
      g.lineTo(15.5, s * 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#f4d23c';
      g.beginPath();
      g.arc(18, s * 2.3, 0.9, 0, TAU);
      g.fill();
    }
  }, 3);
}

// A bramble clump: the only thing to avoid in the open field. A near-black tangle of thorny stems
// with long pale thorns and a few red berries, drawn dark and outlined so it stands out sharply
// against the straw gold. Its dark core is the size of what you can bump into.
function paintBramble(rng) {
  return makeSprite(48, 48, (g) => {
    const R = 14;
    // a faint warning halo of trampled dark earth
    const halo = g.createRadialGradient(0, 0, R * 0.6, 0, 0, R + 9);
    halo.addColorStop(0, 'rgba(40,10,10,0.45)');
    halo.addColorStop(1, 'rgba(40,10,10,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R + 9, 0, TAU);
    g.fill();
    // long thorns radiating out
    const n = 16;
    const rot = rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU + rng.range(-0.08, 0.08);
      const len = R + (i % 2 ? 4.5 : 7) * rng.range(0.85, 1.1);
      g.save();
      g.rotate(a);
      g.fillStyle = '#1c0d10';
      g.beginPath();
      g.moveTo(R - 4, -2.6);
      g.lineTo(len, 0);
      g.lineTo(R - 4, 2.6);
      g.closePath();
      g.fill();
      g.fillStyle = '#f4ead2';
      g.beginPath();
      g.moveTo(len - 3.6, -0.9);
      g.lineTo(len + 0.6, 0);
      g.lineTo(len - 3.6, 0.9);
      g.closePath();
      g.fill();
      g.restore();
    }
    // the dark woody core
    const core = g.createRadialGradient(-4, -4, 1, 0, 0, R);
    core.addColorStop(0, '#4a2230');
    core.addColorStop(0.7, '#2a1018');
    core.addColorStop(1, '#14070b');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    g.strokeStyle = '#0c0406';
    g.lineWidth = 1.6;
    g.stroke();
    // tangled stems with little thorns
    for (let k = 0; k < 7; k++) {
      const a0 = rng.range(0, TAU);
      const a1 = a0 + rng.range(1.6, 3.2);
      const r0 = rng.range(0.25, 0.85) * R;
      g.strokeStyle = k % 2 ? '#6a2f40' : '#57263a';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      g.quadraticCurveTo(rng.range(-4, 4), rng.range(-4, 4), Math.cos(a1) * R * 0.85, Math.sin(a1) * R * 0.85);
      g.stroke();
    }
    g.strokeStyle = 'rgba(244,234,210,0.85)';
    g.lineWidth = 0.8;
    for (let k = 0; k < 14; k++) {
      const a = rng.range(0, TAU);
      const rr = rng.range(0.2, 0.9) * R;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      const b = rng.range(0, TAU);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(b) * 2.4, y + Math.sin(b) * 2.4);
      g.stroke();
    }
    // red berries
    for (let k = 0; k < 4; k++) {
      const a = rng.range(0, TAU);
      const rr = rng.range(0.2, 0.7) * R;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      g.fillStyle = '#e0202c';
      g.beginPath();
      g.arc(x, y, 2.2, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,220,220,0.85)';
      g.beginPath();
      g.arc(x - 0.7, y - 0.7, 0.7, 0, TAU);
      g.fill();
    }
    // a pale rim catching the morning light
    g.strokeStyle = 'rgba(255,230,210,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, R - 1.2, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
  }, 3);
}

function paintShadow(w, h) {
  return makeSprite(w, h, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    gr.addColorStop(0, 'rgba(80,45,10,0.4)');
    gr.addColorStop(0.6, 'rgba(80,45,10,0.22)');
    gr.addColorStop(1, 'rgba(80,45,10,0)');
    g.fillStyle = gr;
    g.scale(1, h / w);
    g.beginPath();
    g.arc(0, 0, w / 2, 0, TAU);
    g.fill();
  }, 1);
}

function paintLight(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const gr = g.createLinearGradient(W, 0, W * 0.5, H);
    gr.addColorStop(0, 'rgba(255,236,170,0.32)');
    gr.addColorStop(0.4, 'rgba(255,220,150,0.08)');
    gr.addColorStop(1, 'rgba(120,70,40,0.12)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, 1);
}

// ---------- the game ----------

export default {
  id: 'warren',
  title: 'Rabbit Run',
  emoji: '🐇',
  tagline: 'Dive down a burrow to get past each hedge. Never pop out by a fox.',
  colors: { bg: '#e6b85c', fg: '#3a2410', accent: '#ff4f9a' },

  music: {
    cps: 0.6,
    setup: `
      const kick = note("f2*4").s("sine").decay(0.2).sustain(0).gain(0.82)
      const kick2 = note("f2 f2 f2 [f2 f2]").s("sine").decay(0.18).sustain(0).gain("0.82 0.82 0.82 [0.82 0.6]")
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1300).lpf(5200).gain(0.12).room(0.3)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.016 0.03 0.02 0.034]*4")
      const roots = "<f2 c3 f2 c3 f2 bb2 c3 f2>"
      const gallop = note(roots).struct("[x ~ x x]*4").s("sawtooth").decay(0.1).sustain(0.15).release(0.03)
        .lpf(saw.range(380, 1500).slow(36)).lpq(5).gain(0.36)
      const chords = "<[f3,a3,c4] [e3,g3,bb3,c4] [f3,a3,c4] [e3,g3,bb3,c4] [f3,a3,c4] [f3,bb3,d4] [e3,g3,bb3,c4] [f3,a3,c4]>"
      const pah = note(chords).struct("[~ x]*4").s("triangle").decay(0.12).sustain(0.05).release(0.05).gain(0.13).room(0.2)
      const brass = note(chords).add(note(12)).struct("[x ~ ~ x] [~ ~ x ~] [x ~ ~ x] [~ x ~ ~]").s("sawtooth")
        .decay(0.12).sustain(0.15).release(0.05).lpf(saw.range(1100, 2600).slow(36)).gain(0.045).pan(0.4)
      const pad = note(chords).s("sawtooth").attack(0.25).release(0.5).lpf(1200).gain(0.045).room(0.45)
      const call = note("<[c4 ~ f4 ~ a4 ~ c5 ~] ~ [c4 ~ f4 ~ a4 c5 a4 f4] ~ [c4 ~ f4 ~ a4 ~ c5 ~] ~ [c5 ~ a4 ~ c5 ~ f5 ~] ~>")
        .s("square").decay(0.15).sustain(0.3).release(0.08).lpf(1800).gain(0.06).room(0.35).pan(0.6)
      const tune = "<[c5 ~ f5 ~ a5 ~ f5 c5] [bb4 ~ e5 ~ g5 ~ e5 c5] [a4 c5 f5 a5 c6 ~ a5 f5] [g5 ~ e5 c5 bb4 ~ g4 ~] [c5 ~ f5 ~ a5 ~ c6 ~] [d6 ~ bb5 ~ f5 ~ d5 ~] [c6 bb5 a5 g5 e5 g5 bb5 g5] [f5 ~ c5 ~ f5 ~ ~ ~]>"
      const horn = note(tune).s("sawtooth").attack(0.01).decay(0.18).sustain(0.45).release(0.08).lpf(2200)
        .gain(0.07).room(0.35).delay(0.2).delaytime(0.3125).delayfeedback(0.25).pan(0.55)
      const low = note(tune).add(note(-12)).s("square").decay(0.14).sustain(0.3).release(0.06).lpf(1300).gain(0.045).pan(0.45)
      const piccolo = note("<[f5 a5 c6 a5]*4 [e5 g5 c6 g5]*4 [f5 a5 c6 a5]*4 [e5 bb5 c6 bb5]*4 [f5 a5 c6 f6]*4 [f5 bb5 d6 bb5]*4 [e5 g5 bb5 c6]*4 [f5 c6 a5 c6]*4>")
        .s("triangle").decay(0.07).sustain(0).lpf(4200).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(10)).gain(saw.range(0, 0.055).slow(10))
    `,
    song: `arrange(
      [8, stack(kick, hats, gallop, pah, call)],
      [8, stack(kick, clap, hats, gallop, pah, horn, pad)],
      [10, stack(kick, clap, hats, shaker, gallop, pah, brass, horn, low, pad)],
      [10, stack(kick2, clap, hats, shaker, gallop, pah, brass, horn, low, piccolo, pad, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');
    const XMIN = EDGE + PR;
    const XMAX = W - EDGE - PR;
    const HX0 = EDGE + 24; // burrows sit between these
    const HX1 = W - EDGE - 24;

    // ---- how far the field has scrolled by time t ----
    const N = Math.ceil(72 / STEP);
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + speedAt((i - 0.5) * STEP) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, N - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };
    const tAtS = (s) => {
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] < s) lo = m;
        else hi = m;
      }
      return lo * STEP;
    };

    // ---- hedges and their tunnels, around a reference run ----
    const wps = [
      { t: 0, x: W / 2 },
      { t: 1.5, x: W / 2 },
    ];
    const hedges = [];
    const gaps = []; // stretches of open field between hedges: { t0, t1 }
    {
      let t = 3.7;
      let prevX = W / 2;
      let prevT = 1.5;
      let idx = 0;
      while (t < 62) {
        const p = progress(t, 60, 1.1);
        const s = cumAt(t);
        const si = s - HB / 2 - IN;
        const so = s + HB / 2 + IN;
        const ti = tAtS(si);
        const to = tAtS(so);
        let K = idx === 0 ? 2 : t < 9 ? 3 : 3 + (plan.chance(lerp(0.3, 0.9, p)) ? 1 : 0) + (t > 34 && plan.chance(p * 0.7) ? 1 : 0);
        K = Math.min(K, 5);
        const nBad = idx === 0 ? 0 : t < 12 ? 1 : Math.min(K - 1, 1 + (plan.chance(lerp(0.25, 0.85, p)) ? 1 : 0) + (K >= 4 && plan.chance(p) ? 1 : 0));
        const lim = lerp(100, 125, p);
        let best = null;
        for (let tries = 0; tries < 40; tries++) {
          const slots = (n) => {
            const w = (HX1 - HX0) / n;
            return Array.from({ length: n }, (_, i) => HX0 + w * (i + 0.5) + plan.range(-0.22, 0.22) * w);
          };
          const xin = slots(K);
          let xout = plan.shuffle(slots(K));
          // tangle them: with three or more, at least one pair has to cross
          if (K >= 3 && idx > 0) {
            let crosses = 0;
            for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) if (xout[a] > xout[b]) crosses++;
            if (crosses === 0) continue;
          }
          const bad = new Set(plan.shuffle([...Array(K).keys()]).slice(0, nBad));
          const colours = plan.shuffle(TUNNEL_COLS).slice(0, K);
          const tunnels = xin.map((xi, i) => ({ xi, xo: xout[i], si, so, good: !bad.has(i), col: colours[i] }));
          let pick = null;
          let need = Infinity;
          for (const tn of tunnels) {
            if (!tn.good) continue;
            const v = Math.abs(tn.xi - prevX) / Math.max(0.05, ti - 0.2 - prevT);
            if (v < need) {
              need = v;
              pick = tn;
            }
          }
          // keep the layout that asks least of the hand, but don't always make it the nearest hole
          const score = need + plan.range(0, 25);
          if (!best || score < best.score) best = { tunnels, pick, score, need };
          if (need < lim && plan.chance(0.5)) break;
        }
        const h = { s, T: t, si, so, ti, to, tunnels: best.tunnels, v: plan.int(0, 2) };
        hedges.push(h);
        gaps.push({ t0: prevT, t1: ti - 0.2 });
        const pk = best.pick;
        wps.push({ t: Math.max(prevT + 0.05, ti - 0.28), x: pk.xi }, { t: ti, x: pk.xi }, { t: to, x: pk.xo }, { t: to + 0.12, x: pk.xo });
        prevX = pk.xo;
        prevT = to + 0.12;
        idx++;
        // the open field before the next hedge, shorter over the minute
        const gap = lerp(2.25, 1.35, p) * plan.range(0.9, 1.12);
        t = to + gap + (t - ti);
      }
      wps.push({ t: 90, x: prevX });
    }
    let wpi = 0;
    const route = (t) => {
      if (t <= 0) return wps[0].x;
      if (wpi >= wps.length - 1 || wps[wpi].t > t) wpi = 0;
      while (wpi < wps.length - 2 && wps[wpi + 1].t <= t) wpi++;
      const a = wps[wpi];
      const b = wps[wpi + 1];
      const u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
      return lerp(a.x, b.x, smooth(u));
    };

    // ---- brambles and running foxes in the open field ----
    let obs = [];
    let foxes = [];
    {
      const clearRoute = (s, x, r) => {
        const t0 = tAtS(s);
        for (let tt = Math.max(0, t0 - 0.4); tt <= t0 + 0.4; tt += 0.02) {
          const dy = cumAt(tt) - s;
          if (Math.abs(dy) > r + 40) continue;
          if (Math.hypot(dy, x - route(tt)) < r + PR + lerp(26, 14, progress(t0))) return false;
        }
        return true;
      };
      const clearStuff = (s, x, r) => {
        for (const h of hedges) {
          if (s > h.si - r - 34 && s < h.so + r + 10) return false;
          for (const tn of h.tunnels) {
            // never right in front of a hole you might come out of
            if (s > h.so && s < h.so + 90 && Math.abs(x - tn.xo) < r + 30) return false;
            if (s < h.si && s > h.si - 70 && Math.abs(x - tn.xi) < r + 16) return false;
          }
        }
        for (const o of obs) if (Math.abs(o.s - s) < 70 && Math.hypot(o.s - s, o.x - x) < r + o.r + 14) return false;
        return true;
      };
      for (const gp of gaps) {
        if (gp.t1 - gp.t0 < 0.4) continue;
        for (let tc = Math.max(2.8, gp.t0 + 0.15); tc < gp.t1; ) {
          const p = progress(tc, 60, 1.1);
          const n = 1 + (plan.chance(lerp(0.2, 0.7, p)) ? 1 : 0) + (plan.chance(lerp(0, 0.3, p)) ? 1 : 0);
          for (let k = 0; k < n; k++) {
            for (let tries = 0; tries < 10; tries++) {
              const kind = 'bramble';
              const r = plan.range(12, 14.5);
              const x = plan.range(XMIN, XMAX);
              const s = cumAt(tc) + plan.range(-16, 16);
              if (!clearRoute(s, x, r) || !clearStuff(s, x, r)) continue;
              obs.push({ kind, s, x, r, v: plan.int(0, 2), rot: plan.range(0, TAU) });
              break;
            }
          }
          tc += lerp(0.5, 0.26, p) * plan.range(0.75, 1.25);
        }
        // a fox dashing across the field
        const mid = (gp.t0 + gp.t1) / 2;
        const p = progress(mid, 60, 1.1);
        if (mid > 11 && gp.t1 - gp.t0 > 0.9 && plan.chance(lerp(0.45, 0.9, p))) {
          const Tf = mid + plan.range(-0.15, 0.15) * (gp.t1 - gp.t0);
          const sf = cumAt(Tf);
          const rx = route(Tf);
          for (let tries = 0; tries < 10; tries++) {
            const xf = plan.range(XMIN + 6, XMAX - 6);
            if (Math.abs(xf - rx) < 64) continue;
            const dir = plan.chance(0.5) ? 1 : -1;
            const v = lerp(150, 225, p) * plan.range(0.9, 1.1);
            const x0 = dir > 0 ? -30 : W + 30;
            const tEnter = Tf - Math.abs(xf - x0) / v;
            foxes.push({ s: sf, Tf, xf, dir, v, x0, tEnter });
            break;
          }
        }
      }
      obs.sort((a, b) => a.s - b.s);
    }
    const foxX = (f, t) => f.x0 + f.dir * f.v * (t - f.tEnter);

    // ---- the rabbit, shared by the player and the reference run ----
    const tunnelX = (tn, s) => lerp(tn.xi, tn.xo, smooth(clamp((s - tn.si) / (tn.so - tn.si), 0, 1)));
    const newRabbit = () => ({ px: W / 2, vx: 0, under: null, hi: 0, lo: 0, prevBase: 0 });
    const stepRabbit = (st, t, dt, dir, k = 1) => {
      const base = cumAt(t + dt);
      const prev = st.prevBase;
      st.prevBase = base;
      while (st.hi < hedges.length && hedges[st.hi].so < prev - 1) st.hi++;
      const h = hedges[st.hi];
      if (st.under) {
        const tn = st.under;
        st.px = tunnelX(tn, base);
        st.vx = 0;
        if (base >= tn.so) {
          st.under = null;
          st.px = tn.xo;
          st.hi++;
          return tn.good ? { kind: 'out', tn } : { kind: 'den', tn };
        }
        return null;
      }
      st.vx += (dir * SPEED * k - st.vx) * Math.min(1, ACCEL * dt);
      st.px += st.vx * dt;
      if (st.px < XMIN) {
        st.px = XMIN;
        st.vx = Math.max(0, st.vx);
      } else if (st.px > XMAX) {
        st.px = XMAX;
        st.vx = Math.min(0, st.vx);
      }
      if (h) {
        if (prev < h.si && base >= h.si) {
          let best = null;
          let bd = CAP;
          for (const tn of h.tunnels) {
            const d = Math.abs(tn.xi - st.px);
            if (d < bd) {
              bd = d;
              best = tn;
            }
          }
          if (best) {
            st.under = best;
            return { kind: 'in', tn: best };
          }
        }
        if (base > h.s - HB / 2 - PR + 2 && base < h.s + HB / 2) return { kind: 'hedge', h };
      }
      while (st.lo < obs.length && obs[st.lo].s < base - 60) st.lo++;
      for (let i = st.lo; i < obs.length; i++) {
        const o = obs[i];
        if (o.s > base + 60) break;
        const dy = o.s - base;
        const dx = o.x - st.px;
        const r = PR + o.r * 0.82;
        if (dx * dx + dy * dy < r * r) return { kind: o.kind, o };
      }
      for (const f of foxes) {
        if (Math.abs(f.s - base) > 26) continue;
        const dx = foxX(f, t + dt) - st.px;
        const dy = f.s - base;
        if (dx * dx + dy * dy < (PR + 12) ** 2) return { kind: 'fox', f };
      }
      return null;
    };

    // ---- check every layout against a reference rabbit with a slower hand ----
    {
      const sim = () => {
        const st = newRabbit();
        let dir = 0;
        for (let i = 0; i * STEP < 61; i++) {
          const t = i * STEP;
          if (i % 3 === 0) {
            const err = route(t + 0.1) - st.px - st.vx * 0.08;
            dir = Math.abs(err) < 3 ? 0 : Math.sign(err);
          }
          const ev = stepRabbit(st, t, STEP, dir, 0.8);
          if (ev && ev.kind !== 'in' && ev.kind !== 'out') return ev;
        }
        return null;
      };
      for (let iter = 0; iter < 200; iter++) {
        const hit = sim();
        if (!hit) break;
        if (hit.kind === 'bramble') obs = obs.filter((o) => o !== hit.o);
        else if (hit.kind === 'fox') foxes = foxes.filter((f) => f !== hit.f);
        else if (hit.kind === 'den') hit.tn.good = true;
        else if (hit.kind === 'hedge') {
          // the reference rabbit couldn't reach a good hole in time: make the nearest hole safe
          const st = hit.h;
          let bestT = null;
          let bd = Infinity;
          for (const tn of st.tunnels) {
            const d = Math.abs(tn.xi - route(st.ti));
            if (d < bd) {
              bd = d;
              bestT = tn;
            }
          }
          if (bestT && !bestT.good) bestT.good = true;
          else if (bestT) bestT.xi = route(st.ti);
          else break;
        } else break;
      }
    }
    for (const h of hedges) h.tunnels.sort((a, b) => a.xi - b.xi);

    // ---- art ----
    const field = paintField(W, H, art);
    const verges = paintVerges(W, H, art);
    const hedgeArt = [paintHedge(W, art), paintHedge(W, art), paintHedge(W, art)];
    const hole = paintHole();
    const rabbit = [paintRabbit(0), paintRabbit(1)];
    const foxSit = paintFoxSit();
    const foxRun = [paintFoxRun(0), paintFoxRun(1)];
    const brambles = [paintBramble(art), paintBramble(art), paintBramble(art)];
    const shadow = paintShadow(60, 30);
    const light = paintLight(W, H);
    const vignette = vignetteSprite(W, H, 0.42, '70,35,10');
    const sunGlow = glowSprite('rgba(255,230,160,0.55)', 120);
    const ringGlows = {};
    for (const c of TUNNEL_COLS) {
      const n = parseInt(c.slice(1), 16);
      ringGlows[c] = glowSprite(`rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.75)`, 24);
    }
    const redGlow = glowSprite('rgba(255,60,40,0.8)', 40);
    const halo = glowSprite('rgba(255,252,240,0.8)', 30);

    const st = newRabbit();
    const fx = createParticles();
    const dust = createParticles();
    const chaff = [];
    for (let i = 0; i < 30; i++) chaff.push({ x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 1.6, ph: Math.random() * TAU, v: 10 + Math.random() * 20 });
    const butterflies = [];
    for (let i = 0; i < 3; i++) butterflies.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, c: ['#ffffff', '#ffb43a', '#a8d8ff'][i] });
    let base = 0;
    let time = 0;
    let clock = 0;
    let shake = 0;
    let hop = 0;
    let culprit = null;
    let deadT = 0;
    let popT = 9; // time since popping out of a hole
    let diveT = 9;
    let soilT = 0;

    const objY = (s) => PY - (s - base);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        if (this.dead) return;
        time = t;
        const ev = stepRabbit(st, t, dt, dir);
        base = cumAt(t + dt);
        if (ev) {
          if (ev.kind === 'in') {
            diveT = 0;
            fx.burst(st.px, PY - 4, { count: 22, speed: 110, life: 0.6, size: 3, colors: SOIL, drag: 2.5 });
          } else if (ev.kind === 'out') {
            popT = 0;
            fx.burst(st.px, PY - 4, { count: 26, speed: 130, life: 0.7, size: 3, colors: SOIL, drag: 2.5 });
            dust.burst(st.px, PY, { count: 10, speed: 70, life: 0.6, size: 5, colors: ['rgba(220,190,140,0.7)'], round: true, drag: 2 });
          } else {
            culprit = ev;
            if (ev.kind === 'den') this.die('Popped up right under a fox’s nose.');
            else if (ev.kind === 'hedge') this.die('Ran headfirst into the hedgerow.');
            else if (ev.kind === 'fox') this.die('Caught by a running fox.');
            else this.die('Got snagged in a bramble.');
          }
        }
        this.cosmetics(dt, dir);
      },

      cosmetics(dt, dir) {
        clock += dt;
        const v = this.dead ? 0 : speedAt(time);
        popT += dt;
        diveT += dt;
        if (!this.dead) {
          hop = (hop + dt * lerp(3.2, 4.6, v / 240)) % 1;
          if (st.under) {
            soilT -= dt;
            if (soilT <= 0) {
              soilT = 0.03;
              fx.burst(st.px + (Math.random() - 0.5) * 10, PY - 2, { count: 2, speed: 50, life: 0.5, size: 2.6, colors: SOIL, drag: 2 });
            }
          } else if (hop < dt * 4.6) {
            dust.burst(st.px, PY + 12, { count: 3, speed: 40, life: 0.5, size: 4, colors: ['rgba(230,200,140,0.6)', 'rgba(200,160,100,0.5)'], round: true, drag: 3 });
            if (Math.abs(st.vx) > 120) fx.burst(st.px, PY + 10, { count: 2, speed: 60, life: 0.4, size: 2.4, colors: STRAW, drag: 3, angle: Math.PI / 2, spread: 1.4 });
          }
        }
        for (const c of chaff) {
          c.y += (c.v + v * 0.3) * dt;
          c.x += Math.sin(clock * 0.9 + c.ph) * 12 * dt + 8 * dt;
          if (c.y > H + 6) {
            c.y = -6;
            c.x = Math.random() * W;
          }
          if (c.x > W + 6) c.x = -6;
        }
        for (const b of butterflies) {
          b.ph += dt;
          b.x += Math.sin(b.ph * 0.7) * 40 * dt;
          b.y += (v * 0.85 + Math.cos(b.ph * 0.9) * 30) * dt;
          if (b.y > H + 20) {
            b.y = -20;
            b.x = 30 + Math.random() * (W - 60);
          }
        }
        fx.update(dt, v);
        dust.update(dt, v);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = 0.4;
        fx.burst(st.px, PY, { count: 26, speed: 160, life: 0.9, size: 3, colors: FUR, drag: 2.2 });
        if (culprit.kind === 'den') fx.burst(st.px, PY - 6, { count: 30, speed: 150, life: 0.8, size: 3, colors: SOIL, drag: 2.5 });
        if (culprit.kind === 'hedge') fx.burst(st.px, PY - 14, { count: 20, speed: 120, life: 0.9, size: 3, colors: ['#3e7228', '#558a33', '#24451a', '#b3141c'], drag: 2 });
        if (culprit.kind === 'bramble') fx.burst(st.px, PY - 6, { count: 22, speed: 130, life: 0.85, size: 2.8, colors: ['#2a1018', '#57263a', '#e0202c', '#f4ead2'], drag: 2 });
      },

      afterlife(dt) {
        shake = Math.max(0, shake - dt);
        deadT += dt;
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        const pulse = 0.5 + 0.5 * Math.sin(clock * 10);

        // the field
        const off = base % H;
        g.drawImage(field.canvas, 0, off - H, W, H);
        g.drawImage(field.canvas, 0, off, W, H);

        // which hole is the rabbit lined up with?
        let aimed = null;
        if (!this.dead && !st.under) {
          const h = hedges[st.hi];
          if (h && h.si - base < 240 && h.si > base) {
            for (const tn of h.tunnels) if (Math.abs(tn.xi - st.px) < CAP) aimed = tn;
          }
        }
        const current = st.under || aimed;

        // shadows of the brambles
        for (let i = st.lo; i < obs.length; i++) {
          const o = obs[i];
          const y = objY(o.s);
          if (y < -50) break;
          if (y > H + 50) continue;
          drawSprite(g, shadow, o.x - o.r * 0.5, y + o.r * 0.55, { size: o.r * 3 });
        }

        // tunnels: a ridge of turned earth and a dotted trail of the tunnel's colour
        for (const h of hedges) {
          const y0 = objY(h.so);
          const y1 = objY(h.si);
          if (y1 < -30) break;
          if (y0 > H + 30) continue;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const tn of h.tunnels) {
            const pts = [];
            for (let i = 0; i <= 14; i++) {
              const s = tn.si + ((tn.so - tn.si) * i) / 14;
              pts.push([tunnelX(tn, s), objY(s)]);
            }
            const line = () => {
              g.beginPath();
              pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            };
            line();
            g.strokeStyle = 'rgba(90,55,25,0.55)';
            g.lineWidth = 11;
            g.stroke();
            line();
            g.strokeStyle = 'rgba(170,120,70,0.6)';
            g.lineWidth = 5;
            g.stroke();
            const hot = tn === current;
            g.setLineDash([3, 6]);
            g.lineDashOffset = -clock * 20;
            line();
            g.strokeStyle = tn.col;
            g.globalAlpha = hot ? 1 : 0.85;
            g.lineWidth = hot ? 3.4 : 2.2;
            g.stroke();
            g.setLineDash([]);
            g.globalAlpha = 1;
          }
          // the holes at both ends, ringed in the tunnel's colour
          for (const tn of h.tunnels) {
            for (const [x, y] of [
              [tn.xi, y1],
              [tn.xo, y0],
            ]) {
              if (y < -30 || y > H + 30) continue;
              const hot = tn === current;
              if (hot) {
                g.globalCompositeOperation = 'lighter';
                drawSprite(g, ringGlows[tn.col], x, y, { size: 56 + pulse * 10, alpha: 0.8 });
                g.globalCompositeOperation = 'source-over';
              }
              drawSprite(g, hole, x, y);
              g.strokeStyle = 'rgba(40,25,10,0.65)';
              g.lineWidth = 5;
              g.beginPath();
              g.ellipse(x, y, 14, 11.5, 0, 0, TAU);
              g.stroke();
              g.strokeStyle = tn.col;
              g.lineWidth = hot ? 3.4 : 2.6;
              g.beginPath();
              g.ellipse(x, y, 14, 11.5, 0, 0, TAU);
              g.stroke();
            }
          }
        }

        // the mound of earth moving along under the rabbit's tunnel
        if (st.under && !this.dead) {
          drawSprite(g, shadow, st.px, PY + 4, { size: 30 });
          g.fillStyle = '#8a5c35';
          g.beginPath();
          g.ellipse(st.px, PY, 9 + Math.sin(clock * 30) * 1.2, 7, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#a87a4a';
          g.beginPath();
          g.ellipse(st.px - 2, PY - 2, 5, 3.4, 0, 0, TAU);
          g.fill();
        }

        // hedgerows
        for (const h of hedges) {
          const y = objY(h.s);
          if (y < -50) break;
          if (y > H + 50) continue;
          g.drawImage(hedgeArt[h.v].canvas, 0, y - 38, W, 76);
          if (culprit && culprit.h === h) drawSprite(g, redGlow, st.px, y, { size: 90, alpha: 0.4 + 0.3 * pulse });
          // the tunnel you're lined up with shows through the hedge, so you see where you'll come out
          if (current && h.tunnels.includes(current)) {
            const tn = current;
            g.setLineDash([3, 6]);
            g.lineDashOffset = -clock * 20;
            g.strokeStyle = tn.col;
            g.globalAlpha = 0.8;
            g.lineWidth = 3;
            g.lineCap = 'round';
            g.beginPath();
            for (let i = 0; i <= 14; i++) {
              const s = tn.si + ((tn.so - tn.si) * i) / 14;
              if (i) g.lineTo(tunnelX(tn, s), objY(s));
              else g.moveTo(tunnelX(tn, s), objY(s));
            }
            g.stroke();
            g.setLineDash([]);
            g.globalAlpha = 1;
          }
        }

        // brambles
        for (let i = st.lo; i < obs.length; i++) {
          const o = obs[i];
          const y = objY(o.s);
          if (y < -40) break;
          if (y > H + 40) continue;
          drawSprite(g, brambles[o.v], o.x, y, { size: o.r * 3.4, rot: o.rot });
          if (culprit && culprit.o === o) drawSprite(g, redGlow, o.x, y, { size: o.r * 5, alpha: 0.5 + 0.3 * pulse });
        }

        // foxes waiting at the bad exits
        for (const h of hedges) {
          const y = objY(h.so);
          if (y < -50) break;
          if (y > H + 60) continue;
          for (const tn of h.tunnels) {
            if (tn.good) continue;
            const bob = Math.sin(clock * 3 + tn.xo) * 0.8;
            drawSprite(g, shadow, tn.xo + 4, y - 14, { size: 40 });
            drawSprite(g, foxSit, tn.xo, y - 16 + bob, { size: 34 });
            if (culprit && culprit.tn === tn) drawSprite(g, redGlow, tn.xo, y - 8, { size: 90, alpha: 0.5 + 0.3 * pulse });
          }
        }

        // the rabbit
        const showRabbit = !st.under || this.dead;
        if (showRabbit) {
          const pop = clamp(popT / 0.25, 0, 1);
          const sc = this.dead ? Math.max(0, 1 - deadT * 3) : lerp(0.4, 1, easeOutCubic(pop));
          const air = this.dead ? 0 : Math.sin(hop * Math.PI) * 5 * pop;
          drawSprite(g, shadow, st.px, PY + 9, { size: 34 * sc, alpha: 0.9 });
          if (sc > 0.01) {
            const frame = hop < 0.5 ? 1 : 0;
            drawSprite(g, halo, st.px, PY - air, { size: 64 * sc, alpha: 0.55 });
            drawSprite(g, rabbit[frame], st.px, PY - air, { size: 30 * sc, rot: clamp(st.vx / SPEED, -1, 1) * 0.35 });
          }
        }

        // foxes running across
        for (const f of foxes) {
          const y = objY(f.s);
          if (y < -40 || y > H + 40) continue;
          const x = foxX(f, time);
          if (x < -40 || x > W + 40) continue;
          const frame = Math.floor(clock * 12) % 2;
          drawSprite(g, shadow, x, y + 8, { size: 54 });
          g.save();
          g.translate(x, y);
          if (f.dir < 0) g.scale(-1, 1);
          drawSprite(g, foxRun[frame], 0, 0, { size: 60 });
          g.restore();
          if (culprit && culprit.f === f) drawSprite(g, redGlow, x, y, { size: 90, alpha: 0.5 + 0.3 * pulse });
        }

        dust.render(g);
        fx.render(g);

        // verges down both sides
        g.drawImage(verges.canvas, 0, off - H, W, H);
        g.drawImage(verges.canvas, 0, off, W, H);

        // butterflies and drifting chaff in the morning sun
        for (const b of butterflies) {
          const flap = Math.abs(Math.sin(clock * 14 + b.ph));
          g.fillStyle = b.c;
          g.globalAlpha = 0.85;
          for (const s of [-1, 1]) {
            g.beginPath();
            g.ellipse(b.x + s * 3 * flap, b.y, 3 * flap + 0.6, 2.6, 0, 0, TAU);
            g.fill();
          }
          g.globalAlpha = 1;
        }
        g.fillStyle = 'rgba(255,245,210,0.8)';
        for (const c of chaff) {
          g.globalAlpha = 0.4 + 0.4 * Math.sin(clock * 2 + c.ph);
          g.fillRect(c.x, c.y, c.s * 2, c.s * 0.7);
        }
        g.globalAlpha = 1;
        g.drawImage(light.canvas, 0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W - 10, 0, { size: 380, alpha: 0.5 });
        g.globalCompositeOperation = 'source-over';
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        // "!" at the edge where a fox is about to dash in
        if (!this.dead) {
          g.font = `bold 13px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (const f of foxes) {
            const lead = f.tEnter - time;
            const x = foxX(f, time);
            if (lead > 1.1 || x > 0 && x < W) continue;
            if ((f.dir > 0 && x > W) || (f.dir < 0 && x < 0)) continue;
            const y = objY(f.s);
            if (y < 10 || y > H - 10) continue;
            const ex = f.dir > 0 ? 14 : W - 14;
            g.globalAlpha = 0.6 + 0.4 * pulse;
            g.fillStyle = '#fff8ec';
            g.beginPath();
            g.arc(ex, y, 9, 0, TAU);
            g.fill();
            g.fillStyle = '#e8501f';
            g.fillText('!', ex, y + 0.5);
            g.globalAlpha = 1;
          }
        }
      },
    };
    return game;
  },
};
