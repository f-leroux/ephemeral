// Whirlpools — run a mossy mountain river in a yellow kayak. The river is full of whirlpools, and
// every one of them pulls: inside its ring of foam arms the water drags the kayak sideways towards
// the dark eye at its centre, harder the closer you get (and its spin shoves you a little across
// the current as you pass). So you don't just dodge: you lean into the paddle to hold your line
// past each one, use the gap between two that spin side by side, and never let one get you so
// close that it wins. Touch an eye and you go down; boulders and, from 22s, floating logs (which
// drift down more slowly than the riverbed) end the run too. Over the minute the river runs
// faster, the whirlpools get stronger, come in pairs and start to wander. Everything is planned
// up front from the rng and checked against a reference paddler using the game's own physics
// with a weaker stroke, so there is always a line through.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 540; // where the kayak sits
const BANK = 28; // the banks down both sides
const XMIN = BANK + 9;
const ACC = 1300; // paddling strength
const DRAG = 4.8; // so the top speed is ACC / DRAG ≈ 270 px/s
const HULL = 17; // half the kayak's hit length
const HULL_R = 5;
const TANG = 0.3; // how much a whirlpool's spin pushes you across, compared with its pull
const LOG_K = 0.55; // logs come down at this share of the riverbed's speed
const ARM_R = 130; // whirlpool sprites are painted at this radius

const speedAt = (t) => lerp(140, 250, progress(t, 60, 1.2)) * lerp(0.7, 1, easeOutCubic(clamp(t / 5, 0, 1)));

const FOAM = ['#ffffff', '#e4fbf6', '#bfeee8', '#9fdcd6'];
const WOOD = ['#8a5a32', '#6a4024', '#b07a48', '#d8b07a'];

function segPoint(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const u = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(ax + dx * u - px, ay + dy * u - py);
}

// ---------- art ----------

function paintWater(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#0c4a52');
    base.addColorStop(0.18, '#147076');
    base.addColorStop(0.5, '#1a8486');
    base.addColorStop(0.82, '#147076');
    base.addColorStop(1, '#0c4a52');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // deep and shallow patches
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(20, 60);
      const dark = rng.chance(0.5);
      wrap(() => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, dark ? 'rgba(4,40,50,0.22)' : 'rgba(80,190,180,0.14)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, r * 0.6, r, 0, 0, TAU);
        g.fill();
      });
    }
    // long flow lines
    for (let i = 0; i < 160; i++) {
      const x = rng.range(BANK - 6, W - BANK + 6);
      const y = rng.range(0, H);
      const len = rng.range(14, 46);
      const wob = rng.range(-4, 4);
      const a = rng.range(0.05, 0.16);
      wrap(() => {
        g.strokeStyle = `rgba(190,245,235,${a})`;
        g.lineWidth = rng.range(0.6, 1.6);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + wob, y + len / 2, x, y + len);
        g.stroke();
      });
    }
    // glints
    for (let i = 0; i < 90; i++) {
      const x = rng.range(BANK, W - BANK);
      const y = rng.range(0, H);
      wrap(() => {
        g.fillStyle = 'rgba(230,255,250,0.25)';
        g.fillRect(x, y, rng.range(1, 3), 1);
      });
    }
  }, 2);
}

function paintBanks(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // the shoreline wobbles, and tiles vertically
    const N = 32;
    const edge = (side) => {
      const pts = [];
      const ph = rng.range(0, TAU);
      const ph2 = rng.range(0, TAU);
      for (let i = 0; i <= N; i++) {
        const y = (i / N) * H;
        const w = BANK + Math.sin((i / N) * TAU * 3 + ph) * 4 + Math.sin((i / N) * TAU * 7 + ph2) * 2.5;
        pts.push([side < 0 ? w : W - w, y]);
      }
      return pts;
    };
    for (const side of [-1, 1]) {
      const pts = edge(side);
      const outer = side < 0 ? 0 : W;
      // shallow sandy margin
      g.fillStyle = 'rgba(150,170,120,0.35)';
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x - side * 7, y);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      // mossy bank
      const grad = g.createLinearGradient(outer, 0, side < 0 ? BANK : W - BANK, 0);
      grad.addColorStop(0, '#1f3a1e');
      grad.addColorStop(0.6, '#325a2a');
      grad.addColorStop(1, '#4a7436');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      // pebbles along the waterline
      for (let i = 0; i < 70; i++) {
        const k = rng.int(0, N - 1);
        const [ex, ey] = pts[k];
        const x = ex + side * rng.range(-2, 6);
        const y = ey + rng.range(0, H / N);
        const r = rng.range(1.2, 3.4);
        const c = rng.pick(['#9aa39c', '#7d8780', '#b8bfb4', '#6b736c']);
        g.fillStyle = 'rgba(10,20,10,0.35)';
        g.beginPath();
        g.ellipse(x + 0.6, y + 0.8, r, r * 0.8, 0, 0, TAU);
        g.fill();
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
        g.fill();
      }
      // moss tufts and ferns
      for (let i = 0; i < 46; i++) {
        const x = side < 0 ? rng.range(0, BANK - 4) : rng.range(W - BANK + 4, W);
        const y = rng.range(0, H);
        const s = rng.range(3, 7);
        g.save();
        g.translate(x, y);
        g.rotate(rng.range(0, TAU));
        for (let k = 0; k < 5; k++) {
          g.rotate(TAU / 5);
          g.fillStyle = k % 2 ? 'rgba(120,170,70,0.55)' : 'rgba(90,140,55,0.55)';
          g.beginPath();
          g.ellipse(0, -s / 2, s * 0.22, s / 2, 0, 0, TAU);
          g.fill();
        }
        g.restore();
      }
      // foam line where the water meets the bank
      g.strokeStyle = 'rgba(235,255,250,0.5)';
      g.lineWidth = 1.4;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x + side * 1.5, y) : g.moveTo(x + side * 1.5, y)));
      g.stroke();
      g.strokeStyle = 'rgba(235,255,250,0.18)';
      g.lineWidth = 3;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x - side * 4, y) : g.moveTo(x - side * 4, y)));
      g.stroke();
    }
  }, 2);
}

function paintCanopy(rng, r) {
  return makeSprite(r * 2 + 8, r * 2 + 8, (g) => {
    // a pine seen from above: layered star-shaped tiers, dark to light
    const tiers = [
      [1, '#16301a'],
      [0.8, '#1f4424'],
      [0.6, '#2b5a2e'],
      [0.4, '#3a7038'],
      [0.2, '#4f8a44'],
    ];
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.arc(2, 3, r, 0, TAU);
    g.fill();
    for (const [k, c] of tiers) {
      const n = 9;
      const rot = rng.range(0, TAU);
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i <= n * 2; i++) {
        const a = rot + (i / (n * 2)) * TAU;
        const rr = r * k * (i % 2 ? 0.72 : 1) * rng.range(0.92, 1.05);
        if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    // sunlit side
    const hl = g.createRadialGradient(-r * 0.4, -r * 0.4, 0, -r * 0.4, -r * 0.4, r);
    hl.addColorStop(0, 'rgba(220,255,160,0.22)');
    hl.addColorStop(1, 'rgba(220,255,160,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  });
}

function paintFunnel() {
  const R = ARM_R;
  return makeSprite(R * 2, R * 2, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, '#01070b');
    gr.addColorStop(0.13, '#031319');
    gr.addColorStop(0.2, '#062630');
    gr.addColorStop(0.36, 'rgba(6,52,62,0.85)');
    gr.addColorStop(0.62, 'rgba(10,82,90,0.45)');
    gr.addColorStop(0.85, 'rgba(14,104,110,0.15)');
    gr.addColorStop(1, 'rgba(14,110,116,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    // terraces of the funnel
    for (const k of [0.22, 0.3, 0.4, 0.52]) {
      g.strokeStyle = `rgba(0,20,30,${0.22 - k * 0.25})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, R * k, 0, TAU);
      g.stroke();
    }
  });
}

function paintArms(rng, arms, twist, alpha) {
  const R = ARM_R;
  return makeSprite(R * 2, R * 2, (g) => {
    g.lineCap = 'round';
    for (let a = 0; a < arms; a++) {
      const th0 = (a / arms) * TAU + rng.range(-0.15, 0.15);
      for (let layer = 0; layer < 3; layer++) {
        const off = layer * 0.09 + rng.range(-0.03, 0.03);
        const wMul = layer === 0 ? 1 : 0.55;
        let prev = null;
        for (let i = 0; i <= 70; i++) {
          const u = i / 70;
          const r = R * (0.15 + 0.85 * u) * (1 + layer * 0.02);
          const th = th0 + off + twist * Math.pow(1 - u, 1.25);
          const x = Math.cos(th) * r;
          const y = Math.sin(th) * r;
          if (prev) {
            const fade = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8);
            g.strokeStyle = `rgba(232,255,250,${alpha * fade * (layer === 0 ? 0.85 : 0.4)})`;
            g.lineWidth = lerp(5, 1, u) * wMul;
            g.beginPath();
            g.moveTo(prev[0], prev[1]);
            g.lineTo(x, y);
            g.stroke();
          }
          prev = [x, y];
        }
      }
      // foam flecks along the arm
      for (let i = 0; i < 26; i++) {
        const u = rng.range(0.05, 0.95);
        const r = R * (0.15 + 0.85 * u);
        const th = th0 + twist * Math.pow(1 - u, 1.25) + rng.range(-0.08, 0.08);
        g.fillStyle = `rgba(240,255,252,${alpha * 0.6 * (1 - u)})`;
        g.beginPath();
        g.arc(Math.cos(th) * r, Math.sin(th) * r, rng.range(0.6, 1.8), 0, TAU);
        g.fill();
      }
    }
    // the bright lip round the eye
    g.strokeStyle = `rgba(220,255,250,${alpha})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, R * 0.15, 0, TAU);
    g.stroke();
  });
}

function paintRock(rng, r) {
  const n = 11;
  const radii = Array.from({ length: n }, () => rng.range(0.82, 1.08));
  return makeSprite(r * 2 + 10, r * 2 + 10, (g) => {
    const path = (s, dx = 0, dy = 0) => {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rr = r * s * radii[i % n];
        const x = Math.cos(a) * rr + dx;
        const y = Math.sin(a) * rr * 0.9 + dy;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
    };
    g.fillStyle = 'rgba(0,25,30,0.4)';
    path(1.04, 2, 3);
    g.fill();
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    gr.addColorStop(0, '#c4cbc6');
    gr.addColorStop(0.5, '#858f8c');
    gr.addColorStop(1, '#3e4746');
    g.fillStyle = gr;
    path(1);
    g.fill();
    // wet lower edge
    g.save();
    path(1);
    g.clip();
    g.fillStyle = 'rgba(20,50,55,0.35)';
    g.beginPath();
    g.ellipse(r * 0.2, r * 0.75, r * 1.1, r * 0.45, 0, 0, TAU);
    g.fill();
    // cracks
    g.strokeStyle = 'rgba(40,45,45,0.55)';
    g.lineWidth = 0.8;
    for (let k = 0; k < 3; k++) {
      let x = rng.range(-r * 0.6, r * 0.6);
      let y = rng.range(-r * 0.6, r * 0.3);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += rng.range(-r * 0.3, r * 0.3);
        y += rng.range(0, r * 0.3);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // moss on top
    for (let k = 0; k < 9; k++) {
      const x = rng.range(-r * 0.7, r * 0.3);
      const y = rng.range(-r * 0.8, -r * 0.1);
      g.fillStyle = rng.pick(['rgba(96,140,58,0.85)', 'rgba(120,165,70,0.8)', 'rgba(70,110,45,0.85)']);
      g.beginPath();
      g.ellipse(x, y, rng.range(2, r * 0.32), rng.range(1.5, r * 0.22), rng.range(0, TAU), 0, TAU);
      g.fill();
    }
    g.restore();
    // wet sheen
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(-r * 0.15, -r * 0.1, r * 0.72, Math.PI * 1.05, Math.PI * 1.45);
    g.stroke();
  });
}

// the pillow of foam where the river piles into a rock (the water flows up the screen, past the riverbed)
function paintPillow(r) {
  return makeSprite(r * 3 + 20, r * 4 + 30, (g) => {
    g.translate(0, -r * 0.4);
    const gr = g.createRadialGradient(0, r * 0.5, r * 0.6, 0, r * 0.5, r * 1.5);
    gr.addColorStop(0, 'rgba(235,255,250,0.75)');
    gr.addColorStop(1, 'rgba(235,255,250,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, r * 0.5, r * 1.5, r * 1.2, 0, 0, Math.PI);
    g.fill();
    // V-wake trailing upstream on screen
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = `rgba(230,255,250,${0.3 - k * 0.08})`;
        g.lineWidth = 2.4 - k * 0.6;
        g.beginPath();
        g.moveTo(s * r * (0.85 + k * 0.2), -r * 0.1);
        g.quadraticCurveTo(s * r * (1.25 + k * 0.3), -r * (0.8 + k * 0.2), s * r * (1.6 + k * 0.35), -r * (1.5 + k * 0.25));
        g.stroke();
      }
    }
  });
}

function paintLog(rng, len) {
  return makeSprite(len + 10, 22, (g) => {
    const L = len / 2;
    g.fillStyle = 'rgba(0,25,30,0.35)';
    g.beginPath();
    g.roundRect(-L + 2, -6, len, 15, 7);
    g.fill();
    const gr = g.createLinearGradient(0, -8, 0, 8);
    gr.addColorStop(0, '#b0784a');
    gr.addColorStop(0.45, '#7e5030');
    gr.addColorStop(1, '#4a2c18');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(-L, -8, len, 15, 7);
    g.fill();
    // bark grooves
    g.strokeStyle = 'rgba(40,20,8,0.5)';
    g.lineWidth = 0.8;
    for (let k = 0; k < 7; k++) {
      const y = rng.range(-6, 5);
      const x = rng.range(-L + 6, L - 20);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(10, 22), y + rng.range(-1, 1));
      g.stroke();
    }
    // cut ends with rings
    for (const s of [-1, 1]) {
      g.fillStyle = '#e2c08a';
      g.beginPath();
      g.ellipse(s * (L - 3), -0.5, 3.2, 7, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(140,90,40,0.7)';
      g.lineWidth = 0.6;
      for (const k of [2.2, 1.2]) {
        g.beginPath();
        g.ellipse(s * (L - 3), -0.5, k * 1.1, k * 2.4, 0, 0, TAU);
        g.stroke();
      }
    }
    // a little moss and a twig
    g.fillStyle = 'rgba(100,150,60,0.8)';
    g.beginPath();
    g.ellipse(rng.range(-L / 2, L / 2), -5, 5, 2, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#5a3a20';
    g.lineWidth = 1.4;
    const tx = rng.range(-L / 3, L / 3);
    g.beginPath();
    g.moveTo(tx, -6);
    g.lineTo(tx + 6, -10);
    g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.25)';
    g.fillRect(-L + 6, -7, len - 14, 2);
  });
}

function paintKayak(capsized) {
  return makeSprite(22, 60, (g) => {
    const hull = () => {
      g.beginPath();
      g.moveTo(0, -27);
      g.bezierCurveTo(8, -16, 8.5, 12, 0, 27);
      g.bezierCurveTo(-8.5, 12, -8, -16, 0, -27);
      g.closePath();
    };
    g.fillStyle = 'rgba(0,30,35,0.35)';
    g.save();
    g.translate(2, 3);
    hull();
    g.fill();
    g.restore();
    const gr = g.createLinearGradient(-8, 0, 8, 0);
    if (capsized) {
      gr.addColorStop(0, '#c2861a');
      gr.addColorStop(0.5, '#f0b42a');
      gr.addColorStop(1, '#a86a12');
    } else {
      gr.addColorStop(0, '#e8a412');
      gr.addColorStop(0.45, '#ffd84a');
      gr.addColorStop(1, '#d48a10');
    }
    g.fillStyle = gr;
    hull();
    g.fill();
    g.strokeStyle = 'rgba(90,50,0,0.6)';
    g.lineWidth = 0.8;
    hull();
    g.stroke();
    if (capsized) {
      g.strokeStyle = 'rgba(90,50,0,0.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -25);
      g.lineTo(0, 25);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(-3, -14, 1.5, 22);
      return;
    }
    // deck ridge, bungees and a bow stripe
    g.strokeStyle = 'rgba(255,250,210,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -25);
    g.lineTo(0, -12);
    g.moveTo(0, 12);
    g.lineTo(0, 25);
    g.stroke();
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 0.7;
    for (const y of [-18, -15, 16, 19]) {
      g.beginPath();
      g.moveTo(-3.5, y);
      g.lineTo(3.5, y + 1.5);
      g.stroke();
    }
    g.fillStyle = '#e04a2a';
    g.beginPath();
    g.moveTo(0, -27);
    g.bezierCurveTo(3, -23, 3.2, -21, 3.4, -20.5);
    g.lineTo(-3.4, -20.5);
    g.bezierCurveTo(-3.2, -21, -3, -23, 0, -27);
    g.fill();
    // cockpit and paddler
    g.fillStyle = '#1a1e24';
    g.beginPath();
    g.ellipse(0, 1, 5.2, 9, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#2a6ad8'; // buoyancy aid
    g.beginPath();
    g.ellipse(0, 1, 6, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.ellipse(-2, -0.5, 2.5, 2, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#e8302a'; // helmet
    g.beginPath();
    g.arc(0, -1, 3.7, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(-1.2, -2.2, 1.3, 0, TAU);
    g.fill();
    // highlight down the hull
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-4, -5, 1, 12, 0.05, 0, TAU);
    g.fill();
  });
}

function paintPaddle() {
  return makeSprite(54, 10, (g) => {
    g.fillStyle = '#222';
    g.fillRect(-21, -0.9, 42, 1.8);
    for (const s of [-1, 1]) {
      g.fillStyle = '#e8302a';
      g.beginPath();
      g.ellipse(s * 23, 0, 5, 3, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(s * 23 - 1, -1, 2.5, 1, 0, 0, TAU);
      g.fill();
    }
  });
}

function paintDapples(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (let i = 0; i < 16; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(30, 80);
      for (const dy of [-H, 0, H]) {
        const gr = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        gr.addColorStop(0, 'rgba(255,250,200,0.16)');
        gr.addColorStop(1, 'rgba(255,250,200,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }
  }, 1);
}

export default {
  id: 'whirlpool',
  title: 'Whirlpools',
  emoji: '🛶',
  tagline: 'Whirlpools pull you in. Paddle clear of their dark eyes, rocks, logs.',
  colors: { bg: '#0d4a52', fg: '#effffa', accent: '#ffd23a' },

  music: {
    cps: 128 / 240,
    setup: `
      const kick = note("f2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
      const kick2 = note("f2 f2 [f2 ~ ~ f2] f2").s("sine").decay(0.2).sustain(0).gain("0.8 0.8 [0.8 0.55] 0.8")
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const open = s("[~ white]*4").decay(0.11).sustain(0).hpf(7500).gain(0.028)
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1200).lpf(5200).gain(0.12).room(0.3)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.016 0.03 0.02 0.034]*4")
      const conga = note("[~ c4] [~ c4] [g3 ~] [c4 g3] [~ c4] [~ ~] [g3 c4] [~ g3]").s("sine").decay(0.1).sustain(0).gain(0.2).pan(0.35)
      const toms = note("<~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ c3 ab2 f2 eb2]>").s("sine").decay(0.16).sustain(0).gain(0.32).pan(0.6)
      const logd = note("<[f2 ~ ~ f3 ~ ~ f2 ~ ~ ~ ab2 ~ c3 ~ ~ ~] [db2 ~ ~ db3 ~ ~ db2 ~ ~ ~ f2 ~ ab2 ~ ~ ~] [eb2 ~ ~ eb3 ~ ~ eb2 ~ ~ ~ g2 ~ bb2 ~ ~ ~] [c2 ~ ~ c3 ~ ~ c2 ~ ~ ~ eb2 ~ g2 ~ ~ ~]>")
        .s("sine").attack(0.005).decay(0.3).sustain(0).gain(0.4)
      const bass = note("<[f2 ~ f2 ~ ~ f2 ~ ab2] [db2 ~ db2 ~ ~ db2 ~ f2] [eb2 ~ eb2 ~ ~ eb2 ~ g2] [c2 ~ c2 ~ ~ c2 ~ eb2]>")
        .s("sawtooth").decay(0.18).sustain(0.2).release(0.05).lpf(saw.range(380, 1500).slow(32)).lpq(5).gain(0.3)
      const kalimba = note("<[f4 ~ c5 ab4 ~ f5 c5 ~] [f4 ~ db5 ab4 ~ f5 db5 ~] [eb4 ~ bb4 g4 ~ eb5 bb4 ~] [c4 ~ g4 eb4 ~ c5 g4 ~]>")
        .s("triangle").decay(0.16).sustain(0).lpf(3400).gain(0.1).delay(0.22).delaytime(0.352).delayfeedback(0.3).pan(0.4)
      const chords = "<[f3,ab3,c4] [db3,f3,ab3] [eb3,g3,bb3] [c3,eb3,g3]>"
      const stabs = note(chords).struct("~ x ~ ~ x ~ x ~").s("sawtooth").decay(0.12).sustain(0.05).release(0.05)
        .lpf(saw.range(900, 2400).slow(32)).gain(0.055).room(0.25).pan(0.58)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1000).gain(0.045).room(0.5)
      const tune = "<[c5 ~ ab4 c5 ~ eb5 db5 c5] [ab4 ~ f4 ab4 ~ c5 bb4 ab4] [g4 ~ bb4 eb5 ~ db5 c5 bb4] [c5 ~ ~ g4 ~ bb4 c5 ~] [f5 ~ eb5 c5 ~ ab4 c5 eb5] [f5 ~ db5 ab4 ~ f5 eb5 db5] [eb5 ~ g5 f5 ~ eb5 db5 bb4] [c5 ~ eb5 ~ g5 ~ ~ ~]>"
      const lead = note(tune).s("square").attack(0.01).decay(0.12).sustain(0.35).release(0.08).lpf(2300).vib(5).vibmod(0.1)
        .gain(0.06).delay(0.25).delaytime(0.352).delayfeedback(0.3).pan(0.6)
      const flute = note(tune).add(note(12)).s("triangle").attack(0.02).decay(0.2).sustain(0.4).release(0.1).lpf(4000).vib(6).vibmod(0.15).gain(0.04).pan(0.66)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.35).release(0.06).lpf(1400).gain(0.055).pan(0.45)
      const arp = note("<[f5 ab5 c6 ab5]*4 [f5 ab5 db6 ab5]*4 [eb5 g5 bb5 g5]*4 [eb5 g5 c6 g5]*4>")
        .s("triangle").decay(0.06).sustain(0).lpf(3800).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.055).slow(8))
    `,
    song: `arrange(
      [8, stack(kick, hats, logd, bass, kalimba)],
      [8, stack(kick, clap, hats, conga, logd, bass, kalimba, stabs, lead)],
      [8, stack(kick, clap, hats, open, shaker, conga, logd, bass, kalimba, stabs, lead, flute, pad, arp)],
      [8, stack(kick2, clap, hats, open, shaker, conga, toms, logd, bass, kalimba, stabs, lead, flute, low, pad, arp, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');
    const XMAX = W - BANK - 9;

    // ---- how far the riverbed has scrolled by time t ----
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
    const END_S = cumAt(61.5) + H;

    // ---- a reference line down the river ----
    const RES = 4;
    const NS = Math.ceil((END_S + 600) / RES) + 4;
    const route = new Float32Array(NS);
    {
      const pts = [{ s: -10, x: W / 2 }, { s: cumAt(3) + 120, x: W / 2 }];
      let s = pts[1].s;
      let x = W / 2;
      while (s < END_S + 600) {
        const t = tAtS(s);
        const ds = plan.range(130, 230);
        const amp = Math.min(130, ((0.5 * ACC) / DRAG / speedAt(t)) * ds);
        let nx = x + plan.range(-1, 1) * amp;
        if (nx < XMIN + 40 || nx > XMAX - 40) nx = 2 * x - nx;
        x = clamp(nx, XMIN + 40, XMAX - 40);
        s += ds;
        pts.push({ s, x });
      }
      let j = 0;
      for (let i = 0; i < NS; i++) {
        const si = i * RES;
        while (j < pts.length - 2 && pts[j + 1].s < si) j++;
        const a = pts[j];
        const b = pts[j + 1];
        const u = clamp((si - a.s) / (b.s - a.s), 0, 1);
        route[i] = lerp(a.x, b.x, u * u * (3 - 2 * u));
      }
    }
    const routeAt = (s) => {
      const f = clamp(s / RES, 0, NS - 1.001);
      const i = Math.floor(f);
      return route[i] + (route[i + 1] - route[i]) * (f - i);
    };
    // how close the reference line comes to (s, x), counting distance along the river too
    const routeDist = (s, x, span) => {
      let m = Infinity;
      for (let j = -span; j <= span; j += 6) m = Math.min(m, Math.hypot(j, x - routeAt(s + j)));
      return m;
    };

    // ---- the river's hazards ----
    let obs = [];
    {
      const clearOf = (kind, s, x, r) => {
        for (const o of obs) {
          if (Math.abs(o.s - s) > 320) continue;
          const d = Math.hypot(o.s - s, o.x - x);
          if (kind === 'whirl' && o.kind === 'whirl' && d < 0.62 * (r + o.R) + o.A) return false;
          if (kind === 'whirl' && o.kind === 'rock' && d < r * 0.15 + o.r + 26) return false;
          if (kind === 'rock' && o.kind === 'whirl' && d < o.E + r + 26 + o.A) return false;
          if (kind === 'rock' && o.kind === 'rock' && d < o.r + r + 16) return false;
        }
        return true;
      };
      const addWhirl = (s, t, p, near, side) => {
        const R = plan.range(88, 122) * lerp(0.95, 1.08, p);
        const A = t > 20 && plan.chance(lerp(0.2, 0.55, p)) ? plan.range(16, 36) : 0;
        const c = 0.5 * R + A + 8;
        for (let tries = 0; tries < 18; tries++) {
          const rx = routeAt(s);
          let x;
          if (near) x = rx + (side || (plan.chance(0.5) ? 1 : -1)) * (c + plan.range(0, 46));
          else x = plan.range(BANK - 14, W - BANK + 14);
          if (x < BANK - 20 || x > W - BANK + 20) continue;
          if (routeDist(s, x, R) < c) continue;
          if (!clearOf('whirl', s, x, R)) continue;
          const o = {
            kind: 'whirl',
            s,
            x,
            R,
            E: R * 0.15,
            S: ACC * lerp(1.45, 2.0, p) * plan.range(0.92, 1.08),
            spin: plan.chance(0.5) ? 1 : -1,
            w: lerp(1.6, 3.2, p) * plan.range(0.85, 1.15),
            A,
            f: plan.range(0.7, 1.4),
            ph: plan.range(0, TAU),
          };
          obs.push(o);
          return o;
        }
        return null;
      };
      const addRock = (s, x0, t) => {
        const r = plan.range(11, 19);
        for (let tries = 0; tries < 14; tries++) {
          const x = x0 ?? plan.range(XMIN + 4, XMAX - 4);
          if (routeDist(s, x, r + 30) < r + 24) {
            x0 = null;
            continue;
          }
          if (!clearOf('rock', s, x, r)) {
            x0 = null;
            continue;
          }
          obs.push({ kind: 'rock', s, x, r, v: plan.int(0, 2) });
          return true;
        }
        return false;
      };
      const addLog = (tm) => {
        // m: the value of LOG_K·cum(t) at which it reaches the kayak's row
        const m = LOG_K * cumAt(tm);
        const sMeet = cumAt(tm);
        const len = plan.range(46, 70);
        const ang = plan.range(-0.35, 0.35);
        for (let tries = 0; tries < 14; tries++) {
          const x = plan.range(XMIN + 10, XMAX - 10);
          const half = (Math.cos(ang) * len) / 2;
          let ok = true;
          for (let j = -60; j <= 60; j += 10) if (Math.abs(x - routeAt(sMeet + j)) < half + 24) ok = false;
          if (!ok) continue;
          obs.push({ kind: 'log', m, s: sMeet, x, len, ang, rot: plan.range(-0.12, 0.12), v: plan.int(0, 1) });
          return;
        }
      };

      let rs = cumAt(3.1) + 30;
      while (rs < END_S) {
        const t = tAtS(rs);
        const p = progress(t, 60, 1.15);
        const roll = plan.next();
        if (t > 13 && roll < lerp(0.12, 0.32, p)) {
          // two whirlpools side by side with the line between them
          const sd = plan.chance(0.5) ? 1 : -1;
          addWhirl(rs, t, p, true, sd);
          addWhirl(rs + plan.range(-30, 30), t, p, true, -sd);
          rs += 50;
        } else if (roll < 0.66) {
          const w = addWhirl(rs, t, p, plan.chance(0.6), 0);
          if (w && t > 7 && plan.chance(lerp(0.3, 0.6, p))) {
            // a boulder next to the whirlpool, for it to drag you into
            const sd = plan.chance(0.5) ? 1 : -1;
            addRock(rs + plan.range(-50, 50), w.x + sd * (w.R * 0.55 + plan.range(10, 30)), t);
          }
        } else {
          const n = 1 + (p > 0.25 ? 1 : 0) + (plan.chance(p) ? 1 : 0);
          for (let k = 0; k < n; k++) addRock(rs + plan.range(-40, 40), null, t);
        }
        rs += lerp(235, 125, p) * plan.range(0.85, 1.15);
      }
      for (let tm = 22; tm < 61; tm += lerp(4.5, 2.2, progress(tm, 60, 1)) * plan.range(0.8, 1.2)) addLog(tm);
    }

    // ---- physics shared by the player and the reference paddler ----
    const whirlX = (o, t) => (o.A ? o.x + o.A * Math.sin(o.ph + o.f * t) : o.x);
    const logPos = (o, t) => [o.x, PY - (o.m - LOG_K * cumAt(t)), o.ang + o.rot * t];
    const sortObs = () => obs.sort((a, b) => a.s - b.s);
    sortObs();

    const newState = () => ({ px: W / 2, vx: 0, ax: 0, pull: 0, lo: 0 });
    const stepState = (st, t, dt, dir, acc = ACC) => {
      const base = cumAt(t);
      let pull = 0;
      let culprit = null;
      while (st.lo < obs.length && obs[st.lo].s < base - 260) st.lo++;
      for (let i = st.lo; i < obs.length; i++) {
        const o = obs[i];
        if (o.s > base + 700) break;
        if (o.kind !== 'whirl') continue;
        const wy = PY - (o.s - base);
        const wx = whirlX(o, t);
        const dx = wx - st.px;
        const ry = PY - wy;
        const d = Math.hypot(dx, ry) || 1;
        if (d >= o.R) continue;
        const k = Math.min(1.2, ((o.R - d) / (o.R - o.E)) ** 2);
        const a = o.S * k;
        pull += a * (dx / d) - o.spin * TANG * a * (ry / d);
      }
      st.pull = pull;
      st.ax = dir * acc + pull;
      st.vx += st.ax * dt;
      st.vx *= Math.exp(-DRAG * dt);
      st.px += st.vx * dt;
      st.bump = 0;
      if (st.px < XMIN) {
        st.bump = st.vx;
        st.px = XMIN;
        st.vx = Math.max(0, st.vx);
      } else if (st.px > XMAX) {
        st.bump = st.vx;
        st.px = XMAX;
        st.vx = Math.min(0, st.vx);
      }
      // collisions
      const b2 = cumAt(t + dt);
      for (let i = st.lo; i < obs.length; i++) {
        const o = obs[i];
        if (o.kind === 'log') {
          const [lx, ly, la] = logPos(o, t + dt);
          if (Math.abs(ly - PY) > 60) continue;
          const hx = (Math.cos(la) * o.len) / 2 - 4;
          const hy = (Math.sin(la) * o.len) / 2;
          for (let k = -1; k <= 1.001; k += 0.25) {
            if (segPoint(lx + hx * k, ly + hy * k, st.px, PY - HULL, st.px, PY + HULL) < HULL_R + 6.5) culprit = o;
          }
          continue;
        }
        if (o.s > b2 + 80) break;
        const y = PY - (o.s - b2);
        if (Math.abs(y - PY) > 60) continue;
        if (o.kind === 'whirl') {
          if (segPoint(whirlX(o, t + dt), y, st.px, PY - HULL, st.px, PY + HULL) < o.E + 3) culprit = o;
        } else if (segPoint(o.x, y, st.px, PY - HULL, st.px, PY + HULL) < o.r + HULL_R - 1) culprit = o;
        if (culprit) break;
      }
      return culprit;
    };

    // ---- check every layout against a reference paddler with a weaker stroke ----
    {
      const sim = () => {
        const st = newState();
        let dir = 0;
        for (let i = 0; i * STEP < 61; i++) {
          const t = i * STEP;
          if (i % 4 === 0) {
            const base = cumAt(t);
            const target = routeAt(base + speedAt(t) * 0.18);
            const err = target - st.px - st.vx * 0.22;
            dir = Math.abs(err) < 3 ? 0 : Math.sign(err);
          }
          const hit = stepState(st, t, STEP, dir, ACC * 0.82);
          if (hit) return hit;
        }
        return null;
      };
      for (let iter = 0; iter < 120; iter++) {
        const hit = sim();
        if (!hit) break;
        obs = obs.filter((o) => o !== hit);
      }
      sortObs();
    }

    // ---- art ----
    const water = paintWater(W, H, art);
    const banks = paintBanks(W, H, art);
    const dapples = paintDapples(W, H, art);
    const funnel = paintFunnel();
    const arms = [paintArms(art, 5, 6.2, 0.8), paintArms(art, 4, 5, 0.5)];
    const rockArt = [14, 17, 20].map((r) => ({ r, img: paintRock(art, r) }));
    const pillows = rockArt.map(({ r }) => paintPillow(r));
    const logArt = [paintLog(art, 60), paintLog(art, 70)];
    const kayak = paintKayak(false);
    const hullUp = paintKayak(true);
    const paddle = paintPaddle();
    const canopies = [paintCanopy(art, 30), paintCanopy(art, 38), paintCanopy(art, 26)];
    const trees = [];
    for (let y = 0, i = 0; i < 18; i++) {
      y += art.range(90, 180);
      const side = i % 2 ? 1 : -1;
      trees.push({ y, x: side < 0 ? art.range(-6, 14) : W - art.range(-6, 14), v: art.int(0, 2) });
    }
    const TREE_SPAN = trees.at(-1).y + 120;
    const vignette = vignetteSprite(W, H, 0.5, '0,20,24');
    const redGlow = glowSprite('rgba(255,60,50,0.8)', 40);
    const sunGlow = glowSprite('rgba(255,245,200,0.5)', 120);
    const eyeGlow = glowSprite('rgba(120,255,235,0.35)', 40);

    const st = newState();
    const fx = createParticles();
    const wake = createParticles();
    const streaks = [];
    for (let i = 0; i < 34; i++) streaks.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 22, a: 0.08 + Math.random() * 0.14 });
    let base = 0;
    let time = 0;
    let clock = 0;
    let shake = 0;
    let stroke = 0;
    let culprit = null;
    let sink = 0;
    let sinkA = 0;
    let sinkD = 0;
    let rot = 0;
    let danger = 0;
    let wakeT = 0;

    const objY = (o) => PY - (o.s - base);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        if (this.dead) return;
        time = t;
        const hit = stepState(st, t, dt, dir);
        base = cumAt(t + dt);
        this.cosmetics(dt, dir);
        if (hit) {
          culprit = hit;
          this.die(hit.kind === 'whirl' ? 'Sucked down into a whirlpool.' : hit.kind === 'rock' ? 'Smashed into a boulder.' : 'Rammed by a floating log.');
        }
      },

      cosmetics(dt, dir) {
        clock += dt;
        const v = this.dead ? 0 : speedAt(time);
        stroke += dt * (dir ? 9 : 3.2);
        rot += (clamp(st.vx / 270, -1, 1) * 0.28 - rot) * Math.min(1, dt * 8);
        // how close the nearest eye is (for the red warning)
        danger = 0;
        for (let i = st.lo; i < obs.length; i++) {
          const o = obs[i];
          if (o.s > base + 300) break;
          if (o.kind !== 'whirl') continue;
          const d = Math.hypot(whirlX(o, time) - st.px, objY(o) - PY);
          o.near = clamp(1 - (d - o.E) / (o.R * 0.55), 0, 1);
          danger = Math.max(danger, o.near);
        }
        // wake off the stern and spray when something is dragging you
        wakeT -= dt;
        if (!this.dead && wakeT <= 0) {
          wakeT = 0.035;
          wake.burst(st.px + (Math.random() - 0.5) * 6, PY + 22, { count: 1, speed: 20, life: 0.9, size: 3, colors: FOAM, angle: Math.PI / 2, spread: 1.2, round: true });
          if (Math.abs(st.pull) > 650) {
            const sd = Math.sign(st.pull);
            fx.burst(st.px - sd * 7, PY - 8, { count: 2, speed: 70, life: 0.4, size: 2.5, colors: FOAM, angle: sd > 0 ? Math.PI : 0, spread: 1, round: true });
          }
        }
        if (Math.abs(st.bump || 0) > 120) fx.burst(st.px - Math.sign(st.bump) * 8, PY, { count: 6, speed: 90, life: 0.5, size: 2.5, colors: FOAM, round: true });
        for (const s of streaks) {
          s.y += (v * 0.45 + 30) * dt;
          if (s.y > H + 30) {
            s.y = -30;
            s.x = BANK + Math.random() * (W - BANK * 2);
          }
        }
        wake.update(dt, v * 0.45);
        fx.update(dt, v * 0.6);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = 0.45;
        if (culprit.kind === 'whirl') {
          const wx = whirlX(culprit, time);
          const wy = objY(culprit);
          sinkA = Math.atan2(PY - wy, st.px - wx);
          sinkD = Math.hypot(PY - wy, st.px - wx);
          fx.burst(st.px, PY, { count: 26, speed: 140, life: 0.8, size: 3.5, colors: FOAM, round: true, drag: 2 });
        } else {
          const y = culprit.kind === 'log' ? logPos(culprit, time)[1] : objY(culprit);
          const x = culprit.x;
          const mx = (x + st.px) / 2;
          const my = (y + PY) / 2;
          fx.burst(mx, my, { count: 36, speed: 220, life: 0.9, size: 4, colors: FOAM, round: true, drag: 2.4 });
          fx.burst(mx, my, { count: 10, speed: 160, life: 0.8, size: 3, colors: culprit.kind === 'log' ? WOOD : ['#ffd84a', '#e8302a', '#9aa39c'], drag: 2 });
        }
      },

      afterlife(dt) {
        shake = Math.max(0, shake - dt);
        sink = Math.min(1, sink + dt / 1.1);
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);

        // the water slides by slower than the riverbed: you're outpacing the current
        const woff = (base * 0.45) % H;
        g.drawImage(water.canvas, 0, woff - H, W, H);
        g.drawImage(water.canvas, 0, woff, W, H);
        g.globalCompositeOperation = 'lighter';
        const doff = (base * 0.3 + clock * 6) % H;
        g.drawImage(dapples.canvas, 0, doff - H, W, H);
        g.drawImage(dapples.canvas, 0, doff, W, H);
        g.globalCompositeOperation = 'source-over';
        g.lineCap = 'round';
        for (const s of streaks) {
          g.strokeStyle = `rgba(225,255,250,${s.a})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(s.x, s.y);
          g.lineTo(s.x + Math.sin(s.y * 0.04) * 2, s.y + s.len);
          g.stroke();
        }

        const pulse = 0.5 + 0.5 * Math.sin(clock * 12);

        // whirlpools
        for (let i = st.lo; i < obs.length; i++) {
          const o = obs[i];
          if (o.kind !== 'whirl') continue;
          const y = objY(o);
          if (y < -o.R - 10) break;
          if (y > H + o.R) continue;
          const x = whirlX(o, time);
          drawSprite(g, funnel, x, y, { size: o.R * 2 });
          g.save();
          g.translate(x, y);
          g.scale(o.spin, 1);
          g.rotate(clock * o.w);
          const s1 = o.R * 2;
          g.drawImage(arms[0].canvas, -s1 / 2, -s1 / 2, s1, s1);
          g.rotate(clock * o.w * 0.7 + 1);
          const s2 = o.R * 1.5;
          g.drawImage(arms[1].canvas, -s2 / 2, -s2 / 2, s2, s2);
          g.restore();
          // the reach of its pull
          g.strokeStyle = `rgba(220,255,250,${0.1 + 0.12 * (o.near || 0)})`;
          g.lineWidth = 1;
          g.setLineDash([3, 7]);
          g.lineDashOffset = -clock * 20 * o.spin;
          g.beginPath();
          g.arc(x, y, o.R - 2, 0, TAU);
          g.stroke();
          g.setLineDash([]);
          // the eye, glowing red when it's close
          if (o.near > 0.05 && !this.dead) {
            drawSprite(g, redGlow, x, y, { size: o.E * 5, alpha: o.near * (0.5 + 0.4 * pulse) });
            g.strokeStyle = `rgba(255,80,60,${o.near * 0.9})`;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, o.E + 1, 0, TAU);
            g.stroke();
          }
          if (culprit === o) drawSprite(g, redGlow, x, y, { size: o.E * 7, alpha: 0.6 + 0.3 * pulse });
        }

        // boulders
        for (let i = st.lo; i < obs.length; i++) {
          const o = obs[i];
          if (o.kind !== 'rock') continue;
          const y = objY(o);
          if (y < -60) break;
          if (y > H + 60) continue;
          const ra = rockArt.reduce((a, b) => (Math.abs(b.r - o.r) < Math.abs(a.r - o.r) ? b : a));
          const k = o.r / ra.r;
          const pi = rockArt.indexOf(ra);
          drawSprite(g, pillows[pi], o.x, y, { size: pillows[pi].w * k, alpha: 0.75 + 0.2 * Math.sin(clock * 5 + o.s) });
          drawSprite(g, ra.img, o.x, y, { size: ra.img.w * k });
          if (culprit === o) drawSprite(g, redGlow, o.x, y, { size: o.r * 5, alpha: 0.5 + 0.3 * pulse });
        }

        // the kayak
        wake.render(g);
        if (culprit && culprit.kind === 'whirl') {
          const wx = whirlX(culprit, time);
          const wy = objY(culprit);
          const a = sinkA + sink * sink * 7 * culprit.spin;
          const d = sinkD * (1 - sink);
          const kx = wx + Math.cos(a) * d;
          const ky = wy + Math.sin(a) * d;
          const sc = 1 - sink * 0.85;
          g.save();
          g.translate(kx, ky);
          g.rotate(rot + sink * sink * 9 * culprit.spin);
          g.scale(sc, sc);
          g.globalAlpha = 1 - sink * 0.7;
          g.drawImage(kayak.canvas, -kayak.w / 2, -kayak.h / 2, kayak.w, kayak.h);
          g.drawImage(paddle.canvas, -paddle.w / 2, -paddle.h / 2 - 1, paddle.w, paddle.h);
          g.globalAlpha = 1;
          g.restore();
        } else {
          const capsized = !!culprit;
          g.save();
          g.translate(st.px, PY);
          g.rotate(rot + (capsized ? 0.5 : 0));
          const k = capsized ? hullUp : kayak;
          g.drawImage(k.canvas, -k.w / 2, -k.h / 2, k.w, k.h);
          if (!capsized) {
            const sw = Math.sin(stroke);
            g.translate(0, -1 + sw * 2.5);
            g.rotate(sw * 0.45);
            g.drawImage(paddle.canvas, -paddle.w / 2, -paddle.h / 2, paddle.w, paddle.h);
          }
          g.restore();
          if (capsized) {
            g.save();
            g.translate(st.px + 20, PY + 14);
            g.rotate(1.1 + clock * 0.6);
            g.drawImage(paddle.canvas, -paddle.w / 2, -paddle.h / 2, paddle.w, paddle.h);
            g.restore();
          }
        }

        // floating logs (on top: they ride the surface)
        for (const o of obs) {
          if (o.kind !== 'log') continue;
          const [x, y, a] = logPos(o, time);
          if (y < -50 || y > H + 50) continue;
          const art2 = logArt[o.v];
          g.save();
          g.translate(x, y + Math.sin(clock * 2 + o.x) * 1.2);
          g.rotate(a);
          g.globalAlpha = 0.45;
          g.fillStyle = '#e8fffa';
          g.beginPath();
          g.ellipse(0, 4, o.len / 2 + 4, 6, 0, 0, Math.PI);
          g.fill();
          g.globalAlpha = 1;
          g.drawImage(art2.canvas, -o.len / 2 - 5, -11, o.len + 10, 22);
          g.restore();
          if (culprit === o) drawSprite(g, redGlow, x, y, { size: 90, alpha: 0.5 + 0.3 * pulse });
        }

        fx.render(g);

        // the banks and the pines leaning over them
        const boff = base % H;
        g.drawImage(banks.canvas, 0, boff - H, W, H);
        g.drawImage(banks.canvas, 0, boff, W, H);
        const toff = (base * 1.12) % TREE_SPAN;
        for (const tr of trees) {
          for (const k of [-1, 0]) {
            const y = tr.y + toff + k * TREE_SPAN - 60;
            if (y < -60 || y > H + 60) continue;
            drawSprite(g, canopies[tr.v], tr.x, y);
          }
        }

        // a cool glow under the kayak when an eye has it, and the sun through the trees
        if (danger > 0.35 && !this.dead) drawSprite(g, eyeGlow, st.px, PY, { size: 70, alpha: (danger - 0.35) * pulse });
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.82, 30, { size: 300, alpha: 0.55 });
        g.globalCompositeOperation = 'source-over';
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        // a tiny "!" over the kayak when it's being dragged hard towards an eye
        if (!this.dead && danger > 0.55) {
          g.fillStyle = '#fff8e8';
          g.beginPath();
          g.arc(st.px, PY - 38, 8, 0, TAU);
          g.fill();
          g.fillStyle = '#e8302a';
          g.font = `bold 12px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('!', st.px, PY - 37.5);
        }
      },
    };
    return game;
  },
};
