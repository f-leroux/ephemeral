// Hot Air — a hot-air balloon drifts east over Provence at sunset, low over the lavender fields.
// You never steer sideways: the wind carries you. You only choose how hot the air in the envelope
// is. Hold right to fire the burner, hold left to pull the vent; let go and the air slowly cools so
// the balloon sinks. Heat takes a moment to turn into lift, and lift a moment to turn into climb,
// so every move has to be started early and caught again. Clear the bell towers, cypresses, power
// lines (from 5s), skeins of geese (flagged at the edge before they fly in, often right over a
// tower or a power line so you have to thread between them), other balloons bobbing up and down
// (from 13s) and wind turbines (from 17s). The safe route keeps climbing and diving, so no height
// stays safe for long. A thunderstorm's crackling cloud base lowers over the minute and flares red
// as you get close. Landing ends the run too.

import {
  createParticles,
  progress,
  lerp,
  clamp,
  circleCircle,
  circleRect,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const BX = 74; // the balloon's screen x: the land scrolls past from the right
const Y0 = 300; // starting height of the envelope's centre
const STEP = 1 / 120;
const ENV_R = 19; // envelope hitbox
const BASKET_DY = 34; // basket centre below the envelope centre
const BASKET_R = 8;
const HEAT_UP = 0.95; // per second with the burner on
const HEAT_DOWN = 1.4; // per second with the vent open
const REST = 0.36; // the air cools towards this (below 0.5: the balloon sinks)
const COOL = 0.3;
const LIFT = 280; // vertical acceleration per unit of heat away from neutral (0.5)
const DRAG = 1.5;
const TILE = 160;

const speedAt = (t) => lerp(64, 122, progress(t, 60, 1.2)); // the wind, carrying you east
const ceilAt = (t) => lerp(14, 185, Math.pow(clamp((t - 3) / 57, 0, 1), 0.9)); // the storm's cloud base

function physics(s, dir, dt) {
  if (dir > 0) s.h = Math.min(1, s.h + HEAT_UP * dt);
  else if (dir < 0) s.h = Math.max(0, s.h - HEAT_DOWN * dt);
  else s.h += (REST - s.h) * COOL * dt;
  s.vy += (-(s.h - 0.5) * LIFT - DRAG * s.vy) * dt;
  s.y += s.vy * dt;
}

const DUST = ['#f3d9a8', '#c9a4d8', '#8f6aa8'];
const FEATHERS = ['#ffffff', '#d8d2c8', '#6b6158'];

// ---------- art ----------

// half-width of a balloon envelope at height y (0 = equator, -28 crown, 22 mouth)
const envHalf = (y) => (y < 0 ? 23 * Math.sqrt(Math.max(0, 1 - (y / 28) ** 2)) : 7 + 16 * (1 - Math.pow(y / 22, 1.6)));

function paintBalloon(colors, band) {
  return makeSprite(56, 92, (g) => {
    const outline = () => {
      g.beginPath();
      for (let y = -28; y <= 22; y += 1) g.lineTo(-envHalf(y), y);
      for (let y = 22; y >= -28; y -= 1) g.lineTo(envHalf(y), y);
      g.closePath();
    };
    // ropes to the basket
    g.strokeStyle = 'rgba(60,40,30,0.9)';
    g.lineWidth = 0.8;
    for (const [a, b] of [[-7, -6], [-3, -2.5], [3, 2.5], [7, 6]]) {
      g.beginPath();
      g.moveTo(a, 22);
      g.lineTo(b, 29);
      g.stroke();
    }
    // the burner frame
    g.fillStyle = '#5a5560';
    g.fillRect(-4, 26, 8, 3);
    // the gores: curved vertical panels in alternating colours
    g.save();
    outline();
    g.clip();
    const n = 10;
    for (let i = 0; i < n; i++) {
      const s0 = -1 + (2 * i) / n;
      const s1 = -1 + (2 * (i + 1)) / n;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      for (let y = -29; y <= 23; y += 1) g.lineTo(Math.sin((s0 * Math.PI) / 2) * envHalf(y), y);
      for (let y = 23; y >= -29; y -= 1) g.lineTo(Math.sin((s1 * Math.PI) / 2) * envHalf(y), y);
      g.closePath();
      g.fill();
    }
    // a band round the middle with a zigzag
    g.fillStyle = band[0];
    g.fillRect(-26, 4, 52, 7);
    g.strokeStyle = band[1];
    g.lineWidth = 1.2;
    g.beginPath();
    for (let x = -26; x <= 26; x += 4) g.lineTo(x, x % 8 === 0 ? 5.5 : 9.5);
    g.stroke();
    // round shading: lit from the low sun on the right, darker on the left
    const sh = g.createRadialGradient(9, -12, 2, 2, -2, 34);
    sh.addColorStop(0, 'rgba(255,240,200,0.55)');
    sh.addColorStop(0.4, 'rgba(255,220,180,0.08)');
    sh.addColorStop(1, 'rgba(40,10,50,0.55)');
    g.fillStyle = sh;
    g.fillRect(-30, -30, 60, 55);
    // the crown
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(0, -27, 7, 2.2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(50,20,40,0.6)';
    g.lineWidth = 1;
    outline();
    g.stroke();
    // the skirt at the mouth
    g.fillStyle = '#3a2a3a';
    g.beginPath();
    g.moveTo(-7.5, 21);
    g.lineTo(7.5, 21);
    g.lineTo(5.5, 25);
    g.lineTo(-5.5, 25);
    g.closePath();
    g.fill();
    // the wicker basket
    const bk = g.createLinearGradient(-8, 0, 8, 0);
    bk.addColorStop(0, '#7a4a22');
    bk.addColorStop(0.45, '#c48a4a');
    bk.addColorStop(1, '#6a3d1a');
    g.fillStyle = bk;
    g.beginPath();
    g.moveTo(-8, 30);
    g.lineTo(8, 30);
    g.lineTo(7, 42);
    g.lineTo(-7, 42);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,30,10,0.55)';
    g.lineWidth = 0.6;
    for (let y = 32; y < 42; y += 2.2) {
      g.beginPath();
      g.moveTo(-7.8, y);
      g.lineTo(7.8, y);
      g.stroke();
    }
    for (let x = -6; x <= 6; x += 3) {
      g.beginPath();
      g.moveTo(x, 30);
      g.lineTo(x * 0.9, 42);
      g.stroke();
    }
    g.fillStyle = '#5a3416';
    g.fillRect(-9, 29, 18, 2.4);
  });
}

// the pilot's head and scarf, drawn separately so they can peek over the rim
function paintPilot() {
  return makeSprite(14, 14, (g) => {
    g.fillStyle = '#f2c094';
    g.beginPath();
    g.arc(0, 0, 3.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2b2b4a';
    g.beginPath();
    g.ellipse(0, -2.2, 3.8, 1.8, -0.2, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(-0.6, -5, 1.2, 1.4);
    g.fillStyle = '#e0412f';
    g.fillRect(-3.2, 2.6, 6.4, 2);
    g.fillRect(-4.6, 3.2, 2, 3.5);
  });
}

function paintSky(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3a2e5e');
    sky.addColorStop(0.28, '#7a4f8f');
    sky.addColorStop(0.5, '#d07a8c');
    sky.addColorStop(0.68, '#f6a27a');
    sky.addColorStop(0.82, '#ffd28a');
    sky.addColorStop(1, '#ffe2a0');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // thin streaks of high cloud lit pink by the sun
    for (let i = 0; i < 9; i++) {
      const y = 250 + i * 26 + Math.sin(i * 2.1) * 10;
      const x = ((i * 97) % W) - 40;
      g.fillStyle = `rgba(255,${190 + i * 5},${190 - i * 6},${0.18 + 0.03 * (i % 3)})`;
      g.beginPath();
      g.ellipse(x + 90, y, 110 + (i % 4) * 25, 3 + (i % 3), 0, 0, Math.PI * 2);
      g.fill();
    }
  }, 1);
}

// a horizontally tiling silhouette layer of hills (with villages, cypresses and Mont Ventoux)
function paintRidge(w, h, rng, { base, amp, fill, top, village, peak }) {
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const ph = [rng.range(0, 6), rng.range(0, 6)];
    const yAt = (x) => {
      const u = (x / w) * Math.PI * 2;
      let y = base - amp * (0.5 + 0.3 * Math.sin(u * 2 + ph[0]) + 0.2 * Math.sin(u * 5 + ph[1]));
      if (peak) y -= peak * Math.exp(-(((x - w * 0.35) / (w * 0.13)) ** 2));
      return y;
    };
    const grad = g.createLinearGradient(0, base - amp - (peak || 0), 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, fill);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, yAt(x));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    if (peak) {
      // Ventoux's bare, pale summit
      g.fillStyle = 'rgba(255,235,240,0.35)';
      g.beginPath();
      for (let x = w * 0.27; x <= w * 0.43; x += 2) g.lineTo(x, yAt(x) + 0.5);
      g.lineTo(w * 0.35, yAt(w * 0.35) + 16);
      g.closePath();
      g.fill();
    }
    if (village) {
      // hilltop villages: houses with terracotta roofs, a church tower, and cypresses
      for (let v = 0; v < 3; v++) {
        const cx = (v + 0.3 + rng.range(0, 0.4)) * (w / 3);
        for (let k = 0; k < 9; k++) {
          const x = cx + rng.range(-26, 26);
          const y = yAt(x) + 4;
          const hw = rng.range(5, 9);
          const hh = rng.range(5, 9);
          g.fillStyle = rng.pick(['#c89c94', '#d6a8a0', '#b88c8c']);
          g.fillRect(x - hw, y - hh, hw * 2, hh + 4);
          g.fillStyle = rng.pick(['#b4584a', '#c8664e', '#a04a44']);
          g.beginPath();
          g.moveTo(x - hw - 1, y - hh);
          g.lineTo(x, y - hh - 4);
          g.lineTo(x + hw + 1, y - hh);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(70,40,70,0.5)';
          g.fillRect(x - hw + 2, y - hh + 3, 1.6, 2);
        }
        g.fillStyle = '#c4988e';
        g.fillRect(cx - 3, yAt(cx) - 26, 6, 26);
        g.strokeStyle = '#6a4a5a';
        g.lineWidth = 0.8;
        g.strokeRect(cx - 3.5, yAt(cx) - 33, 7, 7);
      }
      for (let k = 0; k < 16; k++) {
        const x = rng.range(0, w);
        const y = yAt(x) + 3;
        const ch = rng.range(10, 20);
        g.fillStyle = 'rgba(70,50,80,0.75)';
        g.beginPath();
        g.moveTo(x - 2.5, y);
        g.quadraticCurveTo(x - 3, y - ch * 0.6, x, y - ch);
        g.quadraticCurveTo(x + 3, y - ch * 0.6, x + 2.5, y);
        g.closePath();
        g.fill();
      }
    }
  }, 1.5);
}

// rows of lavender seen from the side (tiles horizontally and vertically)
function paintLavender(rng) {
  return makeSprite(TILE, 117, (g) => {
    g.translate(-TILE / 2, -58.5);
    const soil = g.createLinearGradient(0, 0, 0, 117);
    soil.addColorStop(0, '#4a3260');
    soil.addColorStop(1, '#3c2a4c');
    g.fillStyle = soil;
    g.fillRect(0, 0, TILE, 117);
    for (let r = 0; r < 9; r++) {
      const y = 8 + r * 13;
      const off = (r % 2) * 6;
      const shade = 1 - r * 0.06;
      for (let x = -12 + off; x < TILE + 12; x += 12) {
        for (const dx of [0, TILE, -TILE]) {
          const cx = x + dx;
          g.fillStyle = '#4c6a3a';
          g.beginPath();
          g.ellipse(cx, y + 2, 6, 2.2, 0, 0, Math.PI * 2);
          g.fill();
          const dome = g.createRadialGradient(cx + 1.5, y - 4, 0.5, cx, y - 1, 7);
          dome.addColorStop(0, `rgba(${210 * shade | 0},${168 * shade | 0},255,1)`);
          dome.addColorStop(0.5, `rgba(${154 * shade | 0},${106 * shade | 0},${216 * shade | 0},1)`);
          dome.addColorStop(1, '#4e3086');
          g.fillStyle = dome;
          g.beginPath();
          g.ellipse(cx, y - 1, 6, 5, 0, Math.PI, Math.PI * 2);
          g.lineTo(cx + 6, y + 1);
          g.lineTo(cx - 6, y + 1);
          g.closePath();
          g.fill();
        }
      }
      // flower spikes catching the light
      for (let k = 0; k < 40; k++) {
        const x = rng.range(0, TILE);
        g.fillStyle = rng.pick(['rgba(235,205,255,0.7)', 'rgba(255,220,240,0.55)', 'rgba(170,120,230,0.8)']);
        g.fillRect(x, y - rng.range(2, 7), 1, 2);
      }
    }
  }, 2);
}

// the thunderstorm's base: dark, bumpy and lit pink from below by the setting sun (tiles horizontally)
function paintStorm(w, h, rng) {
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const bumps = [];
    for (let x = 0; x < w; x += rng.range(16, 28)) bumps.push([x, h - rng.range(10, 22), rng.range(14, 24)]);
    const draw = (fill, dy = 0, k = 1) => {
      g.fillStyle = fill;
      g.fillRect(0, 0, w, h - 30 + dy);
      for (const [x, y, r] of bumps) {
        for (const dx of [-w, 0, w]) {
          g.beginPath();
          g.arc(x + dx, y + dy - 12, r * k, 0, Math.PI * 2);
          g.fill();
        }
      }
    };
    draw('rgba(255,150,140,0.55)', 3, 1.02); // the pink underside rim
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1c1630');
    grad.addColorStop(0.6, '#32284e');
    grad.addColorStop(1, '#55406e');
    draw(grad);
    // lumps and shading inside the cloud
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, w);
      const y = rng.range(20, h - 30);
      const r = rng.range(10, 26);
      g.fillStyle = rng.chance(0.5) ? 'rgba(110,90,140,0.12)' : 'rgba(15,10,30,0.15)';
      for (const dx of [-w, 0, w]) {
        g.beginPath();
        g.arc(x + dx, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 1.5);
}

function paintBelfry() {
  // a Provençal stone bell tower with a wrought-iron bell cage on top; drawn cropped to its height
  const w = 30;
  const h = 330;
  return makeSprite(w, h, (g) => {
    g.translate(0, -h / 2);
    // the iron cage and bell
    g.strokeStyle = '#2a2230';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-8, 22);
    g.bezierCurveTo(-9, 8, -3, 2, 0, 1);
    g.bezierCurveTo(3, 2, 9, 8, 8, 22);
    g.moveTo(-4, 22);
    g.quadraticCurveTo(-4, 8, 0, 3);
    g.quadraticCurveTo(4, 8, 4, 22);
    g.stroke();
    g.fillStyle = '#2a2230';
    g.fillRect(-0.7, -5, 1.4, 7);
    g.fillRect(-2.5, -3, 5, 1.2);
    const bell = g.createLinearGradient(-4, 0, 4, 0);
    bell.addColorStop(0, '#7a5a20');
    bell.addColorStop(0.5, '#f0c860');
    bell.addColorStop(1, '#8a6224');
    g.fillStyle = bell;
    g.beginPath();
    g.moveTo(-2, 11);
    g.quadraticCurveTo(-2.4, 16, -4, 19);
    g.lineTo(4, 19);
    g.quadraticCurveTo(2.4, 16, 2, 11);
    g.closePath();
    g.fill();
    // the stone tower
    const stone = g.createLinearGradient(-12, 0, 12, 0);
    stone.addColorStop(0, '#9a7a6a');
    stone.addColorStop(0.55, '#e8c9a0');
    stone.addColorStop(1, '#f6dcb4');
    g.fillStyle = stone;
    g.fillRect(-11, 22, 22, h - 22);
    g.fillStyle = '#c8a07e';
    g.fillRect(-13, 21, 26, 4);
    // ashlar courses
    g.strokeStyle = 'rgba(110,80,70,0.35)';
    g.lineWidth = 0.6;
    for (let y = 30, r = 0; y < h; y += 6, r++) {
      g.beginPath();
      g.moveTo(-11, y);
      g.lineTo(11, y);
      g.stroke();
      for (let x = -11 + (r % 2) * 5; x < 11; x += 10) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 6);
        g.stroke();
      }
    }
    // the bell chamber arch, a clock and slit windows
    g.fillStyle = '#3a2838';
    g.beginPath();
    g.moveTo(-5, 44);
    g.lineTo(-5, 34);
    g.arc(0, 34, 5, Math.PI, 0);
    g.lineTo(5, 44);
    g.closePath();
    g.fill();
    g.fillStyle = '#fbf3e0';
    g.beginPath();
    g.arc(0, 56, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a2230';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(0, 56);
    g.lineTo(0, 52.5);
    g.moveTo(0, 56);
    g.lineTo(2.6, 57);
    g.stroke();
    g.fillStyle = '#3a2838';
    for (let y = 80; y < h; y += 46) g.fillRect(-1.2, y, 2.4, 9);
  });
}

function paintCypress(poplar) {
  const w = poplar ? 24 : 18;
  const h = 120;
  return makeSprite(w, h, (g) => {
    g.translate(0, -h / 2);
    const hw = w / 2 - 1;
    const shape = () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(hw * 0.7, h * 0.18, hw, h * 0.55, hw * 0.75, h - 6);
      g.lineTo(-hw * 0.75, h - 6);
      g.bezierCurveTo(-hw, h * 0.55, -hw * 0.7, h * 0.18, 0, 0);
      g.closePath();
    };
    const grad = g.createLinearGradient(-hw, 0, hw, 0);
    grad.addColorStop(0, poplar ? '#2e4a2a' : '#13281c');
    grad.addColorStop(0.6, poplar ? '#6f9a48' : '#2f5a36');
    grad.addColorStop(1, poplar ? '#b8c870' : '#5e8a4a');
    g.fillStyle = grad;
    shape();
    g.fill();
    // tufts of foliage
    g.save();
    shape();
    g.clip();
    for (let i = 0; i < 70; i++) {
      const y = (i / 70) * h;
      const x = Math.sin(i * 2.7) * hw * 0.8;
      g.fillStyle = x > 0 ? (poplar ? 'rgba(230,230,140,0.35)' : 'rgba(140,190,110,0.3)') : 'rgba(5,20,10,0.3)';
      g.beginPath();
      g.ellipse(x, y, 3, 2, 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.fillStyle = '#4a3020';
    g.fillRect(-1.5, h - 7, 3, 7);
  });
}

function paintGoose(up) {
  return makeSprite(32, 22, (g) => {
    // a greylag goose flying left, seen from the side
    g.fillStyle = '#5a5048';
    g.beginPath();
    if (up) {
      g.moveTo(-2, -1);
      g.quadraticCurveTo(2, -10, 8, -10);
      g.lineTo(5, -1);
    } else {
      g.moveTo(-2, 1);
      g.quadraticCurveTo(2, 9, 8, 10);
      g.lineTo(5, 1);
    }
    g.closePath();
    g.fill();
    const body = g.createLinearGradient(0, -4, 0, 4);
    body.addColorStop(0, '#b8aea0');
    body.addColorStop(1, '#6e645a');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(2, 0, 8, 3.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2ece2';
    g.beginPath();
    g.ellipse(7, 1.5, 3, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a2420';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-4, -0.5);
    g.lineTo(-10, -1.5);
    g.stroke();
    g.fillStyle = '#2a2420';
    g.beginPath();
    g.arc(-11, -1.6, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff9a3a';
    g.beginPath();
    g.moveTo(-12.5, -2.4);
    g.lineTo(-15.5, -1.2);
    g.lineTo(-12.5, -0.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(-10.6, -0.6, 1.6, 1.1);
    // the far wing
    g.fillStyle = 'rgba(70,60,55,0.85)';
    g.beginPath();
    if (up) {
      g.moveTo(1, -2);
      g.quadraticCurveTo(4, -8, 10, -8);
      g.lineTo(6, -2);
    } else {
      g.moveTo(1, 2);
      g.quadraticCurveTo(4, 7, 10, 7);
      g.lineTo(6, 2);
    }
    g.closePath();
    g.fill();
  });
}

// ---------- the game ----------

export default {
  id: 'balloon',
  title: 'Hot Air',
  emoji: '🎈',
  tagline: 'Hold → to burn, ← to vent. Touch nothing, not even storm or ground.',
  colors: { bg: '#3a2e5e', fg: '#ffffff', accent: '#ffc83a' },

  // Musette house, 128 BPM, D major (D – Bm – G – A): a French accordion dance over a house beat.
  // Four-on-the-floor kick, a bouncing offbeat octave bass with its filter opening across the whole
  // minute, offbeat hats and "oom-pah" accordion chords from bar one; then claps, a warm pad and the
  // accordion tune (a square lead with vibrato and echoes); then a 16th glockenspiel arpeggio and a
  // shaker; and a finale with the tune doubled an octave down by a reedy sawtooth and an open-hat
  // lift. 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("d2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const open = s("[~ white]*4").decay(0.15).sustain(0).hpf(6500).gain(0.035)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.025 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5000).gain(0.14).room(0.25)
      const bass = note("<[~ d2 ~ d3 ~ d2 ~ a2] [~ b2 ~ b3 ~ b2 ~ fs2] [~ g2 ~ g3 ~ g2 ~ d3] [~ a2 ~ a3 ~ a2 ~ e3]>")
        .s("sawtooth").decay(0.15).sustain(0.2).release(0.05).lpf(saw.range(450, 1500).slow(32)).lpq(3).gain(0.36)
      const chords = "<[d4,fs4,a4] [d4,fs4,b4] [d4,g4,b4] [cs4,e4,a4]>"
      const squeeze = note(chords).struct("~ x ~ x ~ x ~ x").s("sawtooth").decay(0.14).sustain(0.1).release(0.04)
        .lpf(saw.range(1200, 2400).slow(32)).vib(6).vibmod(0.08).gain(0.07).pan(0.6)
      const oom = note("<d3 b2 g2 a2>").struct("x ~ x ~ x ~ x ~").s("triangle").decay(0.12).sustain(0).gain(0.12).pan(0.4)
      const pad = note("<[d3,a3,fs4] [b2,fs3,d4] [g2,d3,b3] [a2,e3,cs4]>").s("sawtooth")
        .attack(0.2).decay(0.5).sustain(0.6).release(0.4).lpf(1000).gain(0.05).room(0.4)
      const tune = "<[a4 d5 fs5 a5 g5 fs5 e5 d5] [fs5 ~ e5 d5 b4 ~ d5 fs5] [g5 fs5 g5 b5 a5 g5 fs5 e5] [e5 fs5 e5 cs5 a4 ~ cs5 e5] [d6 a5 fs5 a5 d6 ~ cs6 b5] [b5 fs5 d5 fs5 b5 ~ a5 g5] [g5 b5 d6 b5 g5 a5 b5 g5] [a5 ~ cs6 ~ e6 ~ a5 ~]>"
      const lead = note(tune).s("square").decay(0.18).sustain(0.25).release(0.08).lpf(2400).vib(6).vibmod(0.15)
        .gain(0.08).room(0.3).delay(0.18).delaytime(0.35).delayfeedback(0.25).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("sawtooth").decay(0.15).sustain(0.2).release(0.05)
        .lpf(1500).vib(6).vibmod(0.1).gain(0.05).pan(0.42)
      const glock = note("<[d6 fs6 a6 fs6]*4 [b5 d6 fs6 d6]*4 [g5 b5 d6 b5]*4 [a5 cs6 e6 cs6]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(4000).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, squeeze, oom)],
      [8, stack(kick, hats, clap, bass, squeeze, oom, pad, lead)],
      [8, stack(kick, hats, clap, shaker, bass, squeeze, oom, pad, lead, glock)],
      [8, stack(kick, hats, open, clap, shaker, bass, squeeze, oom, pad, lead, lead2, glock)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');

    // ---- the ground: gentle rolling fields ----
    const gph = [plan.range(0, 6.28), plan.range(0, 6.28)];
    const groundAt = (X) => 596 - 22 * (0.5 + 0.5 * Math.sin(X / 210 + gph[0])) - 12 * (0.5 + 0.5 * Math.sin(X / 77 + gph[1]));
    const GROUND_TOP = 562; // the highest the fields ever rise

    // ---- a reference flight, flown with the same physics as the player, that every hazard keeps
    // clear of: so there is always a way through ----
    const refX = [];
    const refY = [];
    {
      const s = { y: Y0, vy: 0, h: 0.5 };
      let X = 0;
      let tgt = Y0;
      let seg = 0;
      let len = 2.6;
      let up = true; // the reference alternates between climbing and diving, so it keeps changing height
      for (let t = 0; t < 62; t += STEP) {
        refX.push(X);
        refY.push(s.y);
        const p = progress(t, 60, 1);
        seg += STEP;
        const lo = ceilAt(t + 2) + 22 + lerp(48, 40, p);
        const hi = GROUND_TOP - BASKET_DY - BASKET_R - 52;
        if (seg >= len) {
          seg = 0;
          len = plan.range(lerp(2.0, 1.3, p), lerp(3.0, 2.0, p));
          const reach = lerp(180, 280, p);
          up = !up;
          if ((up ? s.y - lo : hi - s.y) < 90) up = !up;
          tgt = clamp(s.y + (up ? -1 : 1) * plan.range(0.65, 1) * reach, lo, hi);
        }
        tgt = Math.max(tgt, lo);
        const vyDes = clamp((tgt - s.y) * 1.1, -72, 72);
        const ayDes = (vyDes - s.vy) * 2.5;
        const hDes = 0.5 - (ayDes + DRAG * s.vy) / LIFT;
        physics(s, hDes > s.h + 0.04 ? 1 : hDes < s.h - 0.04 ? -1 : 0, STEP);
        X += speedAt(t) * STEP;
      }
    }
    const N = refX.length;
    const findIdx = (X) => {
      let lo = 0;
      let hi = N - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (refX[m] < X) lo = m + 1;
        else hi = m;
      }
      return lo;
    };
    const timeAtX = (X) => findIdx(X) * STEP;
    // does a shape touch the reference balloon (grown by margin m) at reference step i?
    const hitsRef = (i, c, m) => {
      const x = refX[i];
      const y = refY[i];
      if (c.r != null) return circleCircle(x, y, ENV_R + m, c.x, c.y, c.r) || circleCircle(x, y + BASKET_DY, BASKET_R + m, c.x, c.y, c.r);
      return circleRect(x, y, ENV_R + m, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0) || circleRect(x, y + BASKET_DY, BASKET_R + m, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    };
    const clearStatic = (shapes, m) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const c of shapes) {
        x0 = Math.min(x0, c.r != null ? c.x - c.r : c.x0);
        x1 = Math.max(x1, c.r != null ? c.x + c.r : c.x1);
      }
      const i1 = findIdx(x1 + ENV_R + m + 4);
      for (let i = findIdx(x0 - ENV_R - m - 4); i <= i1; i++) for (const c of shapes) if (hitsRef(i, c, m)) return false;
      return true;
    };
    const clearMoving = (tm, shapesAt, m) => {
      const i0 = Math.max(0, Math.round((tm - 4) / STEP));
      const i1 = Math.min(N - 1, Math.round((tm + 4) / STEP));
      for (let i = i0; i <= i1; i += 2) for (const c of shapesAt(i * STEP)) if (hitsRef(i, c, m)) return false;
      return true;
    };
    // the lowest point of the reference balloon over a stretch of land
    const refBottom = (x0, x1) => {
      let b = -Infinity;
      const i1 = findIdx(x1 + ENV_R);
      for (let i = findIdx(x0 - ENV_R); i <= i1; i++) b = Math.max(b, refY[i] + BASKET_DY + BASKET_R);
      return b;
    };

    // ---- hazards, laid out in advance along the route ----
    const hazards = [];
    const towerShapes = (o) => {
      if (o.kind === 'belfry') return [{ x0: o.X - 11, y0: o.top + 2, x1: o.X + 11, y1: 700 }];
      const hw = o.kind === 'poplar' ? 9 : 6.5;
      return [{ x0: o.X - hw, y0: o.top + 8, x1: o.X + hw, y1: 700 }, { x: o.X, y: o.top + 10, r: hw * 0.6 }];
    };
    const wireY = (o, X) => {
      const u = (X - o.X) / o.span;
      return o.top + o.sag * (1 - (2 * u - 1) ** 2);
    };
    const wireShapes = (o) => {
      const out = [
        { x0: o.X - 6, y0: o.top - 6, x1: o.X + 6, y1: 700 },
        { x0: o.X + o.span - 6, y0: o.top - 6, x1: o.X + o.span + 6, y1: 700 },
      ];
      for (let d = 0; d <= o.span; d += 6) out.push({ x: o.X + d, y: wireY(o, o.X + d), r: 2.5 });
      return out;
    };
    const flockX = (o, t) => o.X - o.gv * (t - o.tm);
    const flockShapes = (o, t) => o.geese.map((q) => ({ x: flockX(o, t) + q.dx, y: o.y + q.dy, r: 7 }));
    const otherY = (o, t) => o.y + o.A * Math.sin(o.w * t + o.ph);
    const otherShapes = (o, t) => [{ x: o.X, y: otherY(o, t), r: 21 }, { x: o.X, y: otherY(o, t) + BASKET_DY * 1.1, r: 9 }];
    const bladeShapes = (o, t) => {
      const out = [{ x: o.X, y: o.hub, r: 5 }, { x0: o.X - 4, y0: o.hub, x1: o.X + 4, y1: 700 }];
      for (let b = 0; b < 3; b++) {
        const a = o.rot0 + o.spin * t + (b * Math.PI * 2) / 3;
        for (const [d, r] of [[10, 4], [19, 3.5], [28, 3], [36, 2.5]]) out.push({ x: o.X + Math.cos(a) * d, y: o.hub + Math.sin(a) * d, r });
      }
      return out;
    };

    {
      let X = refX[Math.round(3.2 / STEP)];
      const Xend = refX[N - 1] + 300;
      let lastFlock = -10;
      while (X < Xend) {
        const t = timeAtX(X);
        const p = progress(t, 60, 1);
        const m = lerp(17, 5, p);
        const slack = lerp(40, 6, p);
        const roll = plan.next();
        const ry = refY[findIdx(X)];
        const addTower = () => {
          const kind = plan.pick(['belfry', 'cypress', 'cypress', 'poplar', 'poplar']);
          const hw = kind === 'belfry' ? 12 : kind === 'poplar' ? 10 : 8;
          const top = refBottom(X - hw - 2, X + hw + 2) + m + plan.range(2, slack);
          if (top > groundAt(X) - 34) return false;
          const o = { kind, X, top, tm: t };
          if (!clearStatic(towerShapes(o), m * 0.8)) return false;
          o.shapes = towerShapes(o);
          o.flip = plan.chance(0.5);
          hazards.push(o);
          return true;
        };
        const addFlock = (tm, onlyAbove = false) => {
          const Xm = refX[Math.round(tm / STEP)];
          const yr = refY[Math.round(tm / STEP)];
          const gv = plan.range(25, lerp(40, 70, p));
          const n = plan.int(4, Math.round(lerp(5, 8, p)));
          const geese = [];
          for (let k = 0; k < n; k++) {
            const rank = Math.ceil(k / 2);
            geese.push({ dx: rank * 15, dy: (k % 2 ? -1 : 1) * rank * 8, ph: plan.range(0, 6.28) });
          }
          const spread = Math.ceil((n - 1) / 2) * 8;
          let above = onlyAbove || plan.chance(0.6);
          for (let k = 0; k < 4; k++) {
            const off = plan.range(lerp(65, 42, p), lerp(95, 62, p)) + k * 18;
            let y = above ? yr - ENV_R - off - spread : yr + BASKET_DY + off + spread;
            if (y - spread < ceilAt(tm) + 12 || y + spread > GROUND_TOP - 40) {
              if (onlyAbove) return false;
              above = !above;
              continue;
            }
            const o = { kind: 'geese', X: Xm, tm, y, gv, geese, flap: plan.range(0, 6) };
            if (clearMoving(tm, (tt) => flockShapes(o, tt), m)) {
              hazards.push(o);
              return true;
            }
          }
          return false;
        };
        let step = lerp(120, 84, p) * plan.range(0.8, 1.25);
        if (t > 17 && roll < 0.14) {
          // a wind turbine: pass over the rotor (or, if you dare, through its turning blades)
          const R = 38;
          const hub = refBottom(X - R - 4, X + R + 4) + m + R + 3 + plan.range(0, slack);
          if (hub < groundAt(X) - R - 22) {
            const o = { kind: 'turbine', X, hub, R, tm: t, rot0: plan.range(0, 6.28), spin: plan.range(1.1, 1.9) * (plan.chance(0.5) ? 1 : -1) };
            if (clearStatic([{ x: X, y: hub, r: R + 3 }, { x0: X - 4, y0: hub, x1: X + 4, y1: 700 }], m)) hazards.push(o);
          }
          step += 40;
        } else if (t > 9 && roll < 0.32 && t - lastFlock > 2.2) {
          if (addFlock(t)) lastFlock = t;
        } else if (t > 13 && roll < 0.45) {
          // another balloon, bobbing up and down on the same wind
          const A = plan.range(12, lerp(22, 34, p));
          const w = plan.range(0.6, 1.1);
          const ph = plan.range(0, 6.28);
          let above = plan.chance(0.5);
          for (let k = 0; k < 3; k++) {
            const off = plan.range(lerp(58, 38, p), lerp(90, 58, p)) + k * 16;
            const y = above ? ry - off - BASKET_DY - 30 - A : ry + BASKET_DY + off + 24 + A;
            const ok = above ? y - A - 28 > ceilAt(t) + 10 : y + A + BASKET_DY + 18 < GROUND_TOP - 20;
            if (!ok) {
              above = !above;
              continue;
            }
            const o = { kind: 'other', X, y, A, w, ph, tm: t, look: plan.int(0, 2) };
            if (clearMoving(t, (tt) => otherShapes(o, tt), m)) {
              hazards.push(o);
              break;
            }
          }
        } else if (t > 5 && roll < 0.6) {
          // a power line on two pylons: stay above the wire all the way across
          const span = plan.range(110, 170);
          const sag = plan.range(12, 22);
          let top = -Infinity;
          for (let d = 0; d <= span; d += 8) {
            const u = d / span;
            top = Math.max(top, refBottom(X + d - 8, X + d + 8) + m + 3 - sag * (1 - (2 * u - 1) ** 2));
          }
          top = Math.max(top, refBottom(X - 8, X + 8) + m + 8, refBottom(X + span - 8, X + span + 8) + m + 8);
          top += plan.range(0, slack * 0.6);
          if (top < Math.min(groundAt(X), groundAt(X + span)) - 40) {
            const o = { kind: 'wire', X, span, sag, top, tm: t };
            if (clearStatic(wireShapes(o), m * 0.8)) {
              o.shapes = wireShapes(o);
              hazards.push(o);
              // and geese over the middle of the span, so you can't just float high above it
              const tMid = timeAtX(X + span / 2);
              if (t > 6 && plan.chance(lerp(0.4, 0.7, p)) && tMid - lastFlock > 1.6 && addFlock(tMid, true)) lastFlock = tMid;
            }
          }
          step += span;
        } else {
          // often a skein of geese flies over the tower too, so you have to thread between them
          if (addTower() && t > 5 && plan.chance(lerp(0.55, 0.8, p)) && t - lastFlock > 1.6 && addFlock(t, true)) lastFlock = t;
        }
        X += step;
      }
      hazards.sort((a, b) => a.tm - b.tm);
    }

    // ---- art ----
    const sky = paintSky(W, H);
    const far = paintRidge(720, 220, art, { base: 190, amp: 40, peak: 70, fill: '#b48aa8', top: '#9a78b0' });
    const mid = paintRidge(720, 200, art, { base: 150, amp: 46, village: true, fill: '#7a5a88', top: '#8a6a9a' });
    const storm = paintStorm(480, 220, art);
    const lavender = paintLavender(art);
    let lavPattern = null;
    const player = paintBalloon(['#ffc83a', '#d8323a'], ['#1f4fa8', '#ffe9a8']);
    const others = [
      paintBalloon(['#e9e2f6', '#8a6ad0'], ['#3a8a5a', '#ffffff']),
      paintBalloon(['#7fd0b0', '#f2f2e8'], ['#d8604a', '#ffffff']),
      paintBalloon(['#f29ab8', '#5a7ad8'], ['#ffd34a', '#3a2a5a']),
    ];
    const pilot = paintPilot();
    const belfry = paintBelfry();
    const cypress = paintCypress(false);
    const poplar = paintCypress(true);
    const goose = [paintGoose(true), paintGoose(false)];
    const flameGlow = glowSprite('rgba(255,170,60,1)', 30);
    const sunGlow = glowSprite('rgba(255,215,140,1)', 80);
    const flashGlow = glowSprite('rgba(220,210,255,1)', 60);
    const redGlow = glowSprite('rgba(255,70,70,1)', 30);
    const vignette = vignetteSprite(W, H, 0.45, '30,10,40');
    const fx = createParticles();
    const embers = createParticles();
    const puffs = createParticles();

    // tiny far-off balloons drifting over the hills (cosmetic)
    const farBalloons = [];
    for (let i = 0; i < 5; i++) farBalloons.push({ x: art.range(0, 720), y: art.range(330, 430), c: art.pick(['#ffd060', '#ff8a7a', '#9adfc0', '#c8b0ff']), s: art.range(4, 7), ph: art.range(0, 6) });

    // ---- state ----
    const s = { y: Y0, vy: 0, h: 0.5 };
    let X = 0;
    let tNow = 0;
    let clock = 0;
    let burning = false;
    let venting = false;
    let fallV = 0;
    let tilt = 0;
    let first = 0;
    let flash = 0;
    let bolt = null;
    let nextBolt = 1.5;
    let dying = 0;
    let hit = null;

    const die = (game, reason, at, struck = false) => {
      game.dead = true;
      game.deathReason = reason;
      hit = at;
      burning = venting = false;
      if (struck) flash = 1;
      fx.burst(at.x, at.y, { count: 26, speed: 140, life: 0.9, size: 4, round: true, drag: 2, colors: reason.includes('geese') ? FEATHERS : DUST });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      flash = Math.max(0, flash - dt * 2.5);
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 1.2 + Math.random() * 2.8;
        const bx = 20 + Math.random() * (W - 40);
        const pts = [[bx, -10]];
        let y = -10;
        let x = bx;
        const base = ceilAt(tNow) - 14;
        while (y < base) {
          y += 10 + Math.random() * 12;
          x += (Math.random() - 0.5) * 22;
          pts.push([x, Math.min(y, base)]);
        }
        bolt = { pts, life: 0.25 };
        flash = Math.max(flash, 0.35);
      }
      if (bolt && (bolt.life -= dt) <= 0) bolt = null;
      const sx = BX;
      const sy = s.y;
      if (burning && Math.random() < 0.7) embers.burst(sx, sy + 24, { count: 1, speed: 40, angle: -Math.PI / 2, spread: 0.8, life: 0.4, size: 2, colors: ['#ffd27a', '#ff9a3a', '#fff0b0'] });
      if (venting && Math.random() < 0.5) puffs.burst(sx + 2, sy - 27, { count: 1, speed: 30, angle: -Math.PI / 2 - 0.6, spread: 0.6, life: 0.9, size: 7, round: true, drag: 1, colors: ['rgba(255,240,235,0.6)', 'rgba(240,220,230,0.5)'] });
      fx.update(dt);
      embers.update(dt);
      puffs.update(dt);
      for (const p of puffs.list) p.x -= speedAt(tNow) * 0.6 * dt;
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        tNow = t;
        burning = dir > 0;
        venting = dir < 0;
        physics(s, dir, dt);
        X += speedAt(t) * dt;
        tilt += (clamp(-s.vy / 300, -0.12, 0.12) + 0.04 - tilt) * Math.min(1, 4 * dt);
        updateCosmetic(dt);

        const by = s.y + BASKET_DY;
        // the ground and the storm
        if (by + BASKET_R > groundAt(X)) return die(this, 'Bumped down in a lavender field.', { x: BX, y: by + BASKET_R });
        if (s.y - ENV_R - 3 < ceilAt(t)) return die(this, 'Swallowed by the thunderclouds.', { x: BX, y: s.y - ENV_R }, true);
        // hazards
        while (first < hazards.length && hazards[first].tm < t - 6) first++;
        for (let i = first; i < hazards.length; i++) {
          const o = hazards[i];
          if (o.tm > t + 5) break;
          const shapes = o.shapes || (o.kind === 'geese' ? flockShapes(o, t) : o.kind === 'other' ? otherShapes(o, t) : bladeShapes(o, t));
          for (const c of shapes) {
            const onEnv = c.r != null ? circleCircle(X, s.y, ENV_R, c.x, c.y, c.r) : circleRect(X, s.y, ENV_R, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
            const onBasket = c.r != null ? circleCircle(X, by, BASKET_R, c.x, c.y, c.r) : circleRect(X, by, BASKET_R, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
            if (onEnv || onBasket) {
              const reason = {
                belfry: 'Snagged on a church bell tower.',
                cypress: 'Crashed into a cypress tree.',
                poplar: 'Tangled in a row of poplars.',
                wire: 'Caught on the power lines.',
                turbine: 'Clipped by a wind turbine.',
                geese: 'Flew into a skein of geese.',
                other: 'Bumped into another balloon.',
              }[o.kind];
              return die(this, reason, { x: BX, y: onEnv ? s.y : by }, o.kind === 'wire');
            }
          }
        }
      },

      afterlife(dt) {
        dying += dt;
        fallV += 260 * dt;
        s.y = Math.min(s.y + fallV * dt * 0.5, groundAt(X) - BASKET_DY - BASKET_R + 2);
        tilt += (0.5 - tilt) * Math.min(1, 2 * dt);
        if (Math.random() < 0.4) puffs.burst(BX, s.y - 10, { count: 1, speed: 30, angle: -Math.PI / 2, spread: 1.4, life: 0.8, size: 6, round: true, drag: 1, colors: ['rgba(90,70,90,0.5)'] });
        updateCosmetic(dt);
      },

      render(g) {
        lavPattern ||= g.createPattern(lavender.canvas, 'repeat');
        const sx = (wx) => BX + (wx - X);
        const ceil = ceilAt(tNow);

        // sky, low sun, far mountains, nearer hills with villages
        drawSprite(g, sky, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 290, 470, { size: 300, alpha: 0.55 });
        drawSprite(g, sunGlow, 290, 470, { size: 70, alpha: 0.9 });
        g.globalCompositeOperation = 'source-over';
        const farOff = -((X * 0.08) % 720);
        for (let k = 0; k < 2; k++) g.drawImage(far.canvas, farOff + k * 720, 330, 720, 220);
        for (const b of farBalloons) {
          const x = (((b.x - X * 0.12) % 720) + 720) % 720 - 40;
          const y = b.y + Math.sin(clock * 0.5 + b.ph) * 4;
          g.fillStyle = b.c;
          g.globalAlpha = 0.55;
          g.beginPath();
          g.arc(x, y, b.s, 0, Math.PI * 2);
          g.fill();
          g.fillRect(x - 1, y + b.s + 2, 2, 2);
          g.globalAlpha = 1;
        }
        const midOff = -((X * 0.25) % 720);
        for (let k = 0; k < 2; k++) g.drawImage(mid.canvas, midOff + k * 720, 400, 720, 200);

        // hazards
        const L = X - BX - 60;
        const R = X - BX + W + 60;
        for (let i = first; i < hazards.length; i++) {
          const o = hazards[i];
          if (o.tm > tNow + 5) break;
          if (o.kind === 'belfry' || o.kind === 'cypress' || o.kind === 'poplar') {
            if (o.X < L || o.X > R) continue;
            const x = sx(o.X);
            const gy = groundAt(o.X) + 12;
            if (o.kind === 'belfry') {
              const h = gy - o.top;
              const sc = belfry.canvas.width / belfry.w;
              g.drawImage(belfry.canvas, 0, 0, belfry.canvas.width, Math.min(belfry.h, h) * sc, x - belfry.w / 2, o.top - 1, belfry.w, Math.min(belfry.h, h));
            } else {
              const spr = o.kind === 'poplar' ? poplar : cypress;
              const sway = Math.sin(clock * 1.3 + o.X) * 0.015;
              g.save();
              g.translate(x, gy);
              g.rotate(sway);
              g.drawImage(spr.canvas, -spr.w / 2, -(gy - o.top), spr.w, gy - o.top);
              if (o.kind === 'poplar') {
                // a second, shorter poplar beside it
                g.globalAlpha = 0.85;
                g.drawImage(spr.canvas, (o.flip ? -1 : 1) * 10 - spr.w / 2, -(gy - o.top) * 0.82, spr.w * 0.9, (gy - o.top) * 0.82);
                g.globalAlpha = 1;
              }
              g.restore();
            }
          } else if (o.kind === 'wire') {
            if (o.X + o.span < L || o.X > R) continue;
            for (const px of [o.X, o.X + o.span]) {
              const x = sx(px);
              const gy = groundAt(px) + 10;
              // a lattice pylon
              g.strokeStyle = '#3a3050';
              g.lineWidth = 1.4;
              g.beginPath();
              g.moveTo(x - 6, gy);
              g.lineTo(x - 2, o.top);
              g.moveTo(x + 6, gy);
              g.lineTo(x + 2, o.top);
              g.stroke();
              g.lineWidth = 0.8;
              g.beginPath();
              for (let y = o.top + 8, k = 0; y < gy; y += 10, k++) {
                const u0 = (y - o.top) / (gy - o.top);
                const u1 = Math.min(1, (y + 10 - o.top) / (gy - o.top));
                const w0 = 2 + 4 * u0;
                const w1 = 2 + 4 * u1;
                g.moveTo(x - w0, y);
                g.lineTo(x + w1, y + 10);
                g.moveTo(x + w0, y);
                g.lineTo(x - w1, y + 10);
              }
              g.stroke();
              g.fillStyle = '#3a3050';
              g.fillRect(x - 9, o.top - 2, 18, 2.5);
              g.fillStyle = '#d8e8f0';
              g.fillRect(x - 8, o.top, 2, 4);
              g.fillRect(x + 6, o.top, 2, 4);
            }
            for (const [dy, a] of [[0, 0.95], [7, 0.6]]) {
              g.strokeStyle = `rgba(40,30,50,${a})`;
              g.lineWidth = 1.3;
              g.beginPath();
              for (let d = 0; d <= o.span; d += 6) {
                const y = wireY(o, o.X + d) + dy * (1 - 0.3 * Math.sin((d / o.span) * Math.PI));
                if (d === 0) g.moveTo(sx(o.X + d), y + 2);
                else g.lineTo(sx(o.X + d), y + 2);
              }
              g.stroke();
            }
            // orange and white aviation marker balls
            for (const u of [0.33, 0.66]) {
              const wx = o.X + u * o.span;
              g.fillStyle = u < 0.5 ? '#ff7a2a' : '#ffffff';
              g.beginPath();
              g.arc(sx(wx), wireY(o, wx) + 2, 3.6, 0, Math.PI * 2);
              g.fill();
            }
          } else if (o.kind === 'turbine') {
            if (o.X < L || o.X > R) continue;
            const x = sx(o.X);
            const gy = groundAt(o.X) + 10;
            const tw = g.createLinearGradient(x - 4, 0, x + 4, 0);
            tw.addColorStop(0, '#b8a8c8');
            tw.addColorStop(0.6, '#fff6f0');
            tw.addColorStop(1, '#e0d0d8');
            g.fillStyle = tw;
            g.beginPath();
            g.moveTo(x - 2.2, o.hub);
            g.lineTo(x + 2.2, o.hub);
            g.lineTo(x + 4.5, gy);
            g.lineTo(x - 4.5, gy);
            g.closePath();
            g.fill();
            g.fillStyle = '#f2ecf2';
            g.fillRect(x - 3, o.hub - 4, 11, 7);
            const a0 = o.rot0 + o.spin * tNow;
            for (let b = 0; b < 3; b++) {
              const a = a0 + (b * Math.PI * 2) / 3;
              g.save();
              g.translate(x, o.hub);
              g.rotate(a);
              g.fillStyle = '#fbf6fa';
              g.beginPath();
              g.moveTo(0, -2.5);
              g.quadraticCurveTo(14, -4.5, o.R, -1);
              g.lineTo(o.R, 1);
              g.quadraticCurveTo(14, 2, 0, 2.5);
              g.closePath();
              g.fill();
              g.fillStyle = '#e0403a';
              g.fillRect(o.R - 6, -1.5, 6, 3);
              g.restore();
            }
            g.fillStyle = '#d8ccd8';
            g.beginPath();
            g.arc(x, o.hub, 3.5, 0, Math.PI * 2);
            g.fill();
          } else if (o.kind === 'other') {
            if (o.X < L || o.X > R) continue;
            const x = sx(o.X);
            const y = otherY(o, tNow);
            g.strokeStyle = `rgba(255,80,80,${0.45 + 0.25 * Math.sin(clock * 5)})`;
            g.lineWidth = 1.6;
            g.setLineDash([4, 4]);
            g.beginPath();
            g.ellipse(x, y + 8, 31, 44, 0, 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
            drawSprite(g, others[o.look], x, y, { size: 56 * 1.1, rot: Math.sin(clock * 0.8 + o.ph) * 0.04 });
          } else if (o.kind === 'geese') {
            const fx0 = sx(flockX(o, tNow));
            if (fx0 < -160) continue;
            // flag a skein that's about to fly in from the right
            const eta = (fx0 - W + 12) / (speedAt(tNow) + o.gv);
            if (eta < 1.3 && fx0 > W - 30) {
              const a = 0.6 + 0.4 * Math.sin(clock * 12);
              g.fillStyle = `rgba(255,80,70,${a})`;
              g.beginPath();
              g.moveTo(W - 22, o.y);
              g.lineTo(W - 8, o.y - 9);
              g.lineTo(W - 8, o.y + 9);
              g.closePath();
              g.fill();
            }
            if (fx0 > W + 20) continue;
            for (const q of o.geese) {
              const x = fx0 + q.dx;
              if (x < -20 || x > W + 20) continue;
              const flap = Math.sin(clock * 9 + q.ph) > 0;
              drawSprite(g, goose[flap ? 0 : 1], x, o.y + q.dy + Math.sin(clock * 3 + q.ph) * 1.2);
            }
          }
        }

        // the lavender fields
        g.save();
        g.beginPath();
        g.moveTo(-2, H);
        for (let x = -2; x <= W + 8; x += 8) g.lineTo(x, groundAt(X - BX + x));
        g.lineTo(W + 8, H);
        g.closePath();
        g.translate(-(((X % TILE) + TILE) % TILE), 0);
        g.fillStyle = lavPattern || '#5a3f6a';
        g.fill();
        g.restore();
        // the sunlit front row of bushes along the crest
        for (let x = -((X % 12 + 12) % 12) - 6; x < W + 12; x += 12) {
          const y = groundAt(X - BX + x);
          g.fillStyle = '#6b4aa8';
          g.beginPath();
          g.ellipse(x, y + 1, 7, 5, 0, Math.PI, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,200,170,0.5)';
          g.fillRect(x + 1, y - 4, 4, 1.4);
        }
        // the balloon's shadow, long and soft in the low sun
        const gyB = groundAt(X);
        const alt = clamp((gyB - s.y) / 400, 0, 1);
        g.fillStyle = `rgba(30,10,50,${0.35 - alt * 0.22})`;
        g.beginPath();
        g.ellipse(BX - 18 - alt * 30, gyB + 4, 16 + alt * 18, 3, 0, 0, Math.PI * 2);
        g.fill();

        // the storm's cloud base, lowering, with lightning
        const stOff = -((X * 0.5) % 480);
        if (bolt) {
          g.strokeStyle = 'rgba(240,235,255,0.95)';
          g.lineWidth = 2;
          g.beginPath();
          bolt.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
        for (let k = 0; k < 2; k++) g.drawImage(storm.canvas, stOff + k * 480, ceil - 205, 480, 220);
        if (flash > 0) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, flashGlow, bolt ? bolt.pts[0][0] : W / 2, ceil - 40, { size: 260, alpha: flash * 0.6 });
          g.globalCompositeOperation = 'source-over';
        }
        // a few drops of rain falling from the base
        g.strokeStyle = 'rgba(200,190,240,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k < 14; k++) {
          const x = ((k * 53 + clock * 30) % (W + 20)) - 10;
          const y = ceil + 4 + ((k * 37 + clock * 160) % 26);
          g.moveTo(x, y);
          g.lineTo(x - 2, y + 5);
        }
        g.stroke();
        // the deadly edge of the storm: a charged, crackling line that flares red as you get close
        const edge = ceil + 3;
        const near = this.dead ? 0 : clamp(1 - (s.y - ENV_R - edge) / 110, 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
        const band = g.createLinearGradient(0, edge - 4, 0, edge + 28);
        band.addColorStop(0, `rgba(255,60,110,${0.3 + 0.1 * pulse + 0.45 * near})`);
        band.addColorStop(1, 'rgba(255,60,110,0)');
        g.fillStyle = band;
        g.fillRect(0, edge - 4, W, 32);
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(255,${210 - 120 * near},${255 - 100 * near},${0.5 + 0.2 * pulse + 0.3 * near})`;
        g.lineWidth = 1.5 + near;
        g.beginPath();
        for (let x = -4; x <= W + 12; x += 10) {
          const y = edge + (Math.random() - 0.5) * (2.5 + 5 * near);
          if (x < 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        if (near > 0.2) {
          drawSprite(g, redGlow, BX, edge, { size: 60 + 90 * near, alpha: 0.2 + 0.6 * near });
          if (Math.random() < near * 0.7) {
            // a spark reaching down for the balloon
            let x = BX + (Math.random() - 0.5) * 50;
            let y = edge;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x, y);
            for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 10), (y += 3 + near * 7));
            g.stroke();
          }
        }
        g.globalCompositeOperation = 'source-over';
        if (tNow < 4.5 && !this.dead) {
          g.globalAlpha = clamp(4.5 - tNow, 0, 1) * (0.75 + 0.25 * pulse);
          g.font = '800 12px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = '#ffd0dc';
          g.fillText('⚡ the storm clouds are deadly ⚡', W / 2, edge + 52);
          g.globalAlpha = 1;
        }

        // the player's balloon
        puffs.render(g);
        if (burning) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, flameGlow, BX, s.y + 18, { size: 70, alpha: 0.75 + Math.random() * 0.2 });
          g.globalCompositeOperation = 'source-over';
        }
        g.save();
        g.translate(BX, s.y + BASKET_DY);
        g.rotate(tilt * 0.6);
        g.translate(0, -BASKET_DY);
        drawSprite(g, pilot, 2, BASKET_DY - 6);
        drawSprite(g, player, 0, 0);
        if (burning) {
          const fl = 6 + Math.random() * 5;
          const grad = g.createLinearGradient(0, 27, 0, 27 - fl - 6);
          grad.addColorStop(0, '#fff6c0');
          grad.addColorStop(0.5, '#ffb030');
          grad.addColorStop(1, 'rgba(255,80,30,0)');
          g.fillStyle = grad;
          g.beginPath();
          g.moveTo(-3, 27);
          g.quadraticCurveTo(-1, 22 - fl * 0.4, 0, 21 - fl);
          g.quadraticCurveTo(1, 22 - fl * 0.4, 3, 27);
          g.closePath();
          g.fill();
        }
        if (venting) {
          // the parachute vent at the crown pulled open
          g.fillStyle = 'rgba(255,230,220,0.8)';
          g.beginPath();
          g.ellipse(0, -30, 6, 2.5, 0, Math.PI, Math.PI * 2);
          g.fill();
        }
        g.restore();
        embers.render(g, true);
        fx.render(g);

        drawSprite(g, vignette, W / 2, H / 2);

        // the heat gauge: a thermometer by the left edge, with the hover mark
        const gx = 16;
        const gy0 = 250;
        const gh = 120;
        g.fillStyle = 'rgba(30,15,45,0.5)';
        g.fillRect(gx - 6, gy0 - 6, 12, gh + 12);
        const hf = g.createLinearGradient(0, gy0 + gh, 0, gy0);
        hf.addColorStop(0, '#5aa8ff');
        hf.addColorStop(0.5, '#ffd060');
        hf.addColorStop(1, '#ff4a3a');
        g.fillStyle = hf;
        g.fillRect(gx - 3, gy0 + gh * (1 - s.h), 6, gh * s.h);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(gx - 7, gy0 + gh * 0.5 - 0.75, 14, 1.5);
        // which way you're heading
        const rate = clamp(-s.vy / 90, -1, 1);
        if (Math.abs(rate) > 0.08) {
          const ay = gy0 + gh + 22;
          g.fillStyle = rate > 0 ? 'rgba(255,220,120,0.9)' : 'rgba(150,200,255,0.9)';
          g.beginPath();
          g.moveTo(gx, ay - 8 * Math.sign(rate) * (0.5 + Math.abs(rate) / 2));
          g.lineTo(gx + 6, ay);
          g.lineTo(gx - 6, ay);
          g.closePath();
          g.fill();
        }

        g.font = '700 13px system-ui, sans-serif';
        g.textAlign = 'right';
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillText(`${(X / 250).toFixed(1)} km`, W - 12, H - 14);

        // a hint at the start
        if (tNow < 2.6 && !this.dead) {
          g.globalAlpha = clamp(2.6 - tNow, 0, 1) * 0.9;
          g.font = '800 15px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillStyle = 'rgba(30,10,40,0.5)';
          g.fillText('◀ vent        burner ▶', W / 2 + 1, 471);
          g.fillStyle = '#ffffff';
          g.fillText('◀ vent        burner ▶', W / 2, 470);
          g.globalAlpha = 1;
        }
        if (hit && this.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, hit.x, hit.y, { size: 70, alpha: Math.max(0, 0.5 - dying * 0.4) });
          if (flash > 0) {
            g.globalAlpha = flash * 0.35;
            g.fillStyle = '#d8d0ff';
            g.fillRect(0, 0, W, H);
            g.globalAlpha = 1;
          }
          g.globalCompositeOperation = 'source-over';
        }
      },
    };
    return game;
  },
};
