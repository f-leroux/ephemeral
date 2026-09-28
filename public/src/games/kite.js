// Kite Flight — a crisp autumn afternoon on a hilltop. You don't fly the kite, you walk its string:
// it swings after you on a springy line, lagging and overshooting. Crows dive, geese pass in Vs,
// and drones climb from the fields below. One touch tears it.

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

const KITE_Y = 318; // where the kite flies
const FLYER_Y = 590; // the kid holding the string
const HANDS_Y = 566;
const K = 16; // string spring
const C = 4.4; // damping: the kite lags and overshoots a little
const KITE_R = 14;

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#174a9c');
    sky.addColorStop(0.35, '#2f78cf');
    sky.addColorStop(0.68, '#8cc6ea');
    sky.addColorStop(0.86, '#d9ecf0');
    sky.addColorStop(1, '#f4e3bd');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // high cirrus streaks
    for (let i = 0; i < 9; i++) {
      const y = rng.range(40, 260);
      const x = rng.range(-60, W);
      const len = rng.range(80, 200);
      const grad = g.createLinearGradient(x, 0, x + len, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${rng.range(0.1, 0.22)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x + len / 2, y, len / 2, rng.range(2, 5), rng.range(-0.08, 0.08), 0, Math.PI * 2);
      g.fill();
    }
  }, 1);
}

function paintCloud(rng, w, h) {
  return makeSprite(w, h, (g) => {
    const puffs = [];
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      puffs.push([lerp(-w * 0.36, w * 0.36, u) + rng.range(-6, 6), h * 0.12 - Math.sin(u * Math.PI) * h * rng.range(0.18, 0.3), rng.range(h * 0.2, h * 0.32)]);
    }
    // soft blue-grey underside first, then the lit tops
    g.fillStyle = 'rgba(170,196,226,0.9)';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y + 4, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y, r] of puffs) {
      const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.7, '#f2f7fc');
      grad.addColorStop(1, 'rgba(226,236,248,0.9)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r * 0.94, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(160,188,222,0.55)';
    g.beginPath();
    g.ellipse(0, h * 0.26, w * 0.4, h * 0.08, 0, 0, Math.PI * 2);
    g.fill();
  }, 1.5);
}

function tree(g, rng, x, y, s) {
  g.fillStyle = '#4a3222';
  g.fillRect(x - 1.5 * s, y - 10 * s, 3 * s, 10 * s);
  const hues = [['#e8792b', '#b4481c'], ['#c9352a', '#8a1f1c'], ['#f0b53a', '#c07a1a'], ['#d9602a', '#9b3718'], ['#7c9a3a', '#4f6a24']];
  const [lit, dark] = rng.pick(hues);
  for (let k = 0; k < 5; k++) {
    const cx = x + rng.range(-5, 5) * s;
    const cy = y - (12 + rng.range(0, 10)) * s;
    const r = rng.range(5, 8) * s;
    const grad = g.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lit);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
}

function paintFarHills(w, h, rng) {
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    // hazy distant ridge
    g.fillStyle = '#9fb7c9';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, 40 + Math.sin(x * 0.011) * 16 + Math.sin(x * 0.029 + 1) * 8);
    g.lineTo(w, h);
    g.fill();
    // a nearer, autumn-wooded hill
    const hill = g.createLinearGradient(0, 60, 0, h);
    hill.addColorStop(0, '#8a9a4a');
    hill.addColorStop(1, '#5b6d30');
    g.fillStyle = hill;
    g.beginPath();
    g.moveTo(0, h);
    const ys = [];
    for (let x = 0; x <= w; x += 6) {
      const y = 82 + Math.sin(x * 0.015 + 2) * 18 + Math.sin(x * 0.04) * 5;
      ys.push([x, y]);
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.fill();
    for (const [x, y] of ys) if (rng.chance(0.45)) tree(g, rng, x + rng.range(-3, 3), y + rng.range(2, 14), rng.range(0.7, 1.05));
    // stripes of field on the lower slope
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? 'rgba(214,176,86,0.28)' : 'rgba(120,140,60,0.25)';
      g.beginPath();
      const y0 = 120 + i * 12;
      g.moveTo(0, y0);
      for (let x = 0; x <= w; x += 12) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 6);
      g.lineTo(w, y0 + 10);
      g.lineTo(0, y0 + 10);
      g.fill();
    }
    // haze
    const haze = g.createLinearGradient(0, 30, 0, 110);
    haze.addColorStop(0, 'rgba(230,238,240,0.35)');
    haze.addColorStop(1, 'rgba(230,238,240,0)');
    g.fillStyle = haze;
    g.fillRect(0, 0, w, h);
  }, 1.5);
}

function paintNearHill(w, h, rng) {
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const grass = g.createLinearGradient(0, 0, 0, h);
    grass.addColorStop(0, '#94b04a');
    grass.addColorStop(0.5, '#6d8c32');
    grass.addColorStop(1, '#3f5a1e');
    g.fillStyle = grass;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, 26 + Math.pow((x - w / 2) / (w / 2), 2) * 22 + Math.sin(x * 0.05) * 2);
    g.lineTo(w, h);
    g.fill();
    for (let i = 0; i < 320; i++) {
      const x = rng.range(0, w);
      const y = rng.range(34, h);
      const len = rng.range(4, 11);
      g.strokeStyle = rng.pick(['rgba(180,200,90,0.8)', 'rgba(70,100,30,0.8)', 'rgba(200,170,80,0.6)']);
      g.lineWidth = rng.range(0.8, 1.6);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + rng.range(-3, 3), y - len * 0.6, x + rng.range(-4, 4), y - len);
      g.stroke();
    }
    // fallen leaves in the grass
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rng.pick(['#e8792b', '#c9352a', '#f0b53a']);
      g.beginPath();
      g.ellipse(rng.range(0, w), rng.range(40, h), 2.4, 1.3, rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

function paintFlyer() {
  return makeSprite(36, 56, (g) => {
    // shadow
    g.fillStyle = 'rgba(30,40,10,0.35)';
    g.beginPath();
    g.ellipse(0, 25, 12, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    // legs and boots
    g.fillStyle = '#2d3b5c';
    g.fillRect(-6, 8, 5, 14);
    g.fillRect(1, 8, 5, 14);
    g.fillStyle = '#5a2e1a';
    g.beginPath();
    g.roundRect(-7, 20, 7, 4, 1.5);
    g.roundRect(0, 20, 7, 4, 1.5);
    g.fill();
    // arms raised to the spool
    g.strokeStyle = '#e0a72a';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-7, -8);
    g.lineTo(-4, -22);
    g.moveTo(7, -8);
    g.lineTo(4, -22);
    g.stroke();
    // mustard raincoat from behind
    const coat = g.createLinearGradient(-10, 0, 10, 0);
    coat.addColorStop(0, '#c98a18');
    coat.addColorStop(0.4, '#f5bf3a');
    coat.addColorStop(1, '#b67a12');
    g.fillStyle = coat;
    g.beginPath();
    g.moveTo(-8, -10);
    g.quadraticCurveTo(-11, 2, -10, 10);
    g.lineTo(10, 10);
    g.quadraticCurveTo(11, 2, 8, -10);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,70,10,0.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(0, 10);
    g.stroke();
    // red scarf, one end flying
    g.fillStyle = '#d8402c';
    g.beginPath();
    g.roundRect(-7, -13, 14, 4, 2);
    g.fill();
    g.beginPath();
    g.moveTo(4, -11);
    g.quadraticCurveTo(12, -8, 15, -3);
    g.lineTo(12, -2);
    g.quadraticCurveTo(10, -6, 3, -8);
    g.fill();
    // head in a teal beanie
    g.fillStyle = '#6b3f22';
    g.beginPath();
    g.arc(0, -17, 5.6, 0, Math.PI * 2);
    g.fill();
    const hat = g.createLinearGradient(-6, -24, 6, -16);
    hat.addColorStop(0, '#3fb3b0');
    hat.addColorStop(1, '#1f6f78');
    g.fillStyle = hat;
    g.beginPath();
    g.arc(0, -18, 6, Math.PI, 0);
    g.fill();
    g.fillRect(-6.4, -18.5, 12.8, 2.5);
    g.fillStyle = '#f2efe6';
    g.beginPath();
    g.arc(0, -24.5, 2.2, 0, Math.PI * 2);
    g.fill();
    // hands and the wooden spool
    g.fillStyle = '#f0c9a0';
    g.beginPath();
    g.arc(-4, -23, 2.1, 0, Math.PI * 2);
    g.arc(4, -23, 2.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a8743e';
    g.fillRect(-5, -26.5, 10, 3.2);
    g.fillStyle = '#f7f3ea';
    g.fillRect(-3, -26.5, 6, 3.2);
  });
}

// Diamond kite with four bright panels, spars and a bridle point.
function paintKite() {
  return makeSprite(60, 80, (g) => {
    const T = [0, -34];
    const R = [25, -8];
    const B = [0, 38];
    const L = [-25, -8];
    const M = [0, -8];
    const panels = [
      [T, R, '#ffd23f', '#f2a516'],
      [R, B, '#2c3fd1', '#1a2690'],
      [B, L, '#1fc2b0', '#0f8076'],
      [L, T, '#ff3d7f', '#c41a57'],
    ];
    for (const [a, b, lit, dark] of panels) {
      const grad = g.createLinearGradient(-20, -30, 20, 30);
      grad.addColorStop(0, lit);
      grad.addColorStop(1, dark);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(M[0], M[1]);
      g.lineTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.closePath();
      g.fill();
    }
    // sunburst motif at the centre
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(0, -8, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff3d7f';
    g.beginPath();
    g.arc(0, -8, 2.6, 0, Math.PI * 2);
    g.fill();
    // stitched hem
    g.strokeStyle = 'rgba(30,20,40,0.9)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(...T);
    g.lineTo(...R);
    g.lineTo(...B);
    g.lineTo(...L);
    g.closePath();
    g.stroke();
    g.setLineDash([1.5, 2]);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0, -30);
    g.lineTo(21, -8);
    g.lineTo(0, 33);
    g.lineTo(-21, -8);
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    // spars
    g.strokeStyle = 'rgba(92,58,28,0.85)';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(0, -33);
    g.lineTo(0, 37);
    g.moveTo(-24, -8);
    g.lineTo(24, -8);
    g.stroke();
    // sheen from the upper left
    const sheen = g.createLinearGradient(-20, -30, 10, 10);
    sheen.addColorStop(0, 'rgba(255,255,255,0.4)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.beginPath();
    g.moveTo(...T);
    g.lineTo(...R);
    g.lineTo(...B);
    g.lineTo(...L);
    g.closePath();
    g.fill();
  });
}

function paintBow(color) {
  return makeSprite(14, 8, (g) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-6, -3.5);
    g.lineTo(-6, 3.5);
    g.closePath();
    g.moveTo(0, 0);
    g.lineTo(6, -3.5);
    g.lineTo(6, 3.5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(0, 0, 1.4, 0, Math.PI * 2);
    g.fill();
  });
}

// A bird seen from above, flying down the screen (head at the bottom). `up` = wings raised.
function paintBird({ body, bodyDark, wing, wingTip, beak, cheek, up, w = 48, h = 34 }) {
  return makeSprite(w, h, (g) => {
    const s = w / 48;
    g.scale(s, s);
    // wings
    for (const side of [-1, 1]) {
      const grad = g.createLinearGradient(0, 0, side * 22, 0);
      grad.addColorStop(0, wing);
      grad.addColorStop(1, wingTip);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(side * 3, -4);
      if (up) {
        g.quadraticCurveTo(side * 14, -14, side * 23, -12);
        g.lineTo(side * 19, -7);
        g.lineTo(side * 21, -4);
        g.lineTo(side * 16, -2);
        g.quadraticCurveTo(side * 9, 0, side * 3, 4);
      } else {
        g.quadraticCurveTo(side * 14, -2, side * 23, 6);
        g.lineTo(side * 18, 8);
        g.lineTo(side * 19, 11);
        g.lineTo(side * 13, 9);
        g.quadraticCurveTo(side * 8, 6, side * 3, 5);
      }
      g.closePath();
      g.fill();
    }
    // tail fan
    g.fillStyle = bodyDark;
    g.beginPath();
    g.moveTo(-3, -6);
    g.lineTo(-6, -15);
    g.lineTo(6, -15);
    g.lineTo(3, -6);
    g.fill();
    // body
    const grad = g.createLinearGradient(-5, 0, 5, 0);
    grad.addColorStop(0, bodyDark);
    grad.addColorStop(0.45, body);
    grad.addColorStop(1, bodyDark);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, 4.8, 9, 0, 0, Math.PI * 2);
    g.fill();
    // head
    g.fillStyle = bodyDark;
    g.beginPath();
    g.arc(0, 9.5, 4, 0, Math.PI * 2);
    g.fill();
    if (cheek) {
      g.fillStyle = cheek;
      g.beginPath();
      g.ellipse(-2, 9.5, 1.3, 2.2, 0.3, 0, Math.PI * 2);
      g.ellipse(2, 9.5, 1.3, 2.2, -0.3, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(-2, 9.8, 0.9, 0, Math.PI * 2);
      g.arc(2, 9.8, 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = beak;
    g.beginPath();
    g.moveTo(-1.8, 12.5);
    g.lineTo(0, 17);
    g.lineTo(1.8, 12.5);
    g.fill();
    // sheen
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(-1.5, -2, 1.2, 5, 0, 0, Math.PI * 2);
    g.fill();
  });
}

// A small quadcopter seen from the side: body, arms, motor pods and a camera. The rotor blur is drawn live.
function paintDrone(shell, trim) {
  return makeSprite(56, 30, (g) => {
    // arms
    g.strokeStyle = '#2b2f38';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-8, -2);
    g.lineTo(-21, -6);
    g.moveTo(8, -2);
    g.lineTo(21, -6);
    g.stroke();
    // motor pods
    for (const x of [-21, 21]) {
      const pod = g.createLinearGradient(x - 3, 0, x + 3, 0);
      pod.addColorStop(0, '#15171c');
      pod.addColorStop(0.5, '#5a606e');
      pod.addColorStop(1, '#15171c');
      g.fillStyle = pod;
      g.beginPath();
      g.roundRect(x - 3, -10, 6, 7, 1.5);
      g.fill();
      g.fillStyle = '#9aa0ad';
      g.fillRect(x - 0.8, -12.5, 1.6, 3);
    }
    // body shell, lit from the upper left
    const body = g.createLinearGradient(0, -8, 0, 6);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, shell);
    body.addColorStop(1, trim);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-11, 2);
    g.quadraticCurveTo(-11, -7, 0, -7);
    g.quadraticCurveTo(11, -7, 11, 2);
    g.quadraticCurveTo(0, 6, -11, 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 0.8;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.ellipse(-4, -4.5, 4, 1.2, -0.1, 0, Math.PI * 2);
    g.fill();
    // gimbal and camera lens
    g.fillStyle = '#20232a';
    g.fillRect(-1.5, 4, 3, 3);
    g.beginPath();
    g.arc(0, 9, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a6cff';
    g.beginPath();
    g.arc(0.6, 9.2, 1.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(1.2, 8.5, 0.6, 0, Math.PI * 2);
    g.fill();
    // landing legs
    g.strokeStyle = '#2b2f38';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-6, 4);
    g.lineTo(-9, 12);
    g.lineTo(-12, 12);
    g.moveTo(6, 4);
    g.lineTo(9, 12);
    g.lineTo(12, 12);
    g.stroke();
  });
}

function paintLeaf(color) {
  return makeSprite(14, 14, (g) => {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + ((i - 2) / 2.3) * 1.3;
      const r = i === 2 ? 6.5 : 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 1);
      g.lineTo(Math.cos(a + 0.28) * 2.4, Math.sin(a + 0.28) * 2.4 + 1);
    }
    g.lineTo(0, 3);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80,30,10,0.6)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0, 6);
    g.lineTo(0, -4);
    g.stroke();
  });
}

// ---------- the game ----------

export default {
  id: 'kite',
  title: 'Kite Flight',
  emoji: '🪁',
  tagline: 'Walk left and right to steer your kite: it swings after you on its string. Keep it clear of crows, geese and drones, because one touch tears it.',
  colors: { bg: '#1b4f9e', fg: '#fff6dc', accent: '#ff3d7f' },

  // Uplifting trance in D major at 140 BPM (D – A – Bm – G): 35 bars of 1.71s = the full minute.
  music: {
    cps: 35 / 60,
    setup: `
      const chords = "<[d3,fs3,a3] [cs3,e3,a3] [d3,fs3,b3] [d3,g3,b3]>"
      const pad = note(chords).s("sawtooth").attack(0.2).release(0.5)
        .lpf(saw.range(600, 2200).slow(12)).gain(0.07).room(0.5).roomsize(4)
      const bass = note("<d2 a2 b2 g2>").struct("[~ x x x]*4").s("sawtooth")
        .decay(0.09).sustain(0).lpf(saw.range(450, 1000).slow(12)).lpq(4).gain(0.34)
      const kick = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(6500).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(6800).gain("[0.02 0.035 0.055 0.035]*4")
      const clap = s("~ pink ~ pink").decay(0.13).sustain(0).hpf(1500).lpf(6000).gain(0.14).room(0.3)
      const fill = s("<~!11 [pink*16]>").decay(0.05).sustain(0).hpf(1800).lpf(5000).gain(saw.range(0.02, 0.13))
      const arp = note("<[d4 fs4 a4 d5]*4 [cs4 e4 a4 cs5]*4 [b3 d4 fs4 b4]*4 [b3 d4 g4 b4]*4>")
        .s("sawtooth").decay(0.1).sustain(0).lpf(saw.range(900, 2800).slow(8)).gain(0.07)
        .delay(0.25).delaytime(0.321).delayfeedback(0.3).pan(sine.range(0.3, 0.7).slow(2))
      const lead = note("<[fs5 ~ a5 ~ fs5 e5 d5 ~] [e5 ~ a5 ~ e5 cs5 a4 ~] [d5 ~ fs5 ~ d5 cs5 b4 ~] [b4 ~ d5 ~ g5 fs5 e5 d5]>")
        .s("square").decay(0.22).sustain(0.3).release(0.15).lpf(2400).gain(0.075).room(0.4)
        .delay(0.3).delaytime(0.428).delayfeedback(0.3)
      const lead2 = note("<[d5 ~ fs5 ~ d5 cs5 a4 ~] [cs5 ~ e5 ~ cs5 a4 e4 ~] [b4 ~ d5 ~ b4 a4 fs4 ~] [g4 ~ b4 ~ d5 d5 cs5 b4]>")
        .s("sawtooth").decay(0.2).sustain(0.25).release(0.15).lpf(1800).gain(0.055)
      const sparkle = note("<[a6 fs6]*4 [a6 e6]*4 [fs6 d6]*4 [g6 d6]*4>").s("sine")
        .decay(0.06).sustain(0).gain(0.04).delay(0.35).delaytime(0.214).delayfeedback(0.4)
    `,
    song: `arrange(
      [4, stack(pad, bass, kick, hats)],
      [8, stack(pad, bass, kick, hats, clap, arp)],
      [12, stack(pad, bass, kick, hats16, clap, arp, lead, fill)],
      [11, stack(pad, bass, kick, hats16, clap, arp, lead, lead2, sparkle)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const sky = paintSky(W, H, art);
    const clouds = [paintCloud(art, 150, 60), paintCloud(art, 110, 46), paintCloud(art, 190, 70), paintCloud(art, 90, 38)];
    const farHills = paintFarHills(W + 80, 190, art);
    const nearHill = paintNearHill(W + 100, 110, art);
    const flyerArt = paintFlyer();
    const kiteArt = paintKite();
    const bows = ['#ff3d7f', '#ffd23f', '#1fc2b0'].map(paintBow);
    const crowArt = [0, 1].map((f) => paintBird({ body: '#2a2d3a', bodyDark: '#111219', wing: '#1c1e28', wingTip: '#0a0a10', beak: '#e0b030', up: f === 0 }));
    const gooseArt = [0, 1].map((f) => paintBird({ body: '#8c8272', bodyDark: '#2a2622', wing: '#a39a8a', wingTip: '#5a524a', beak: '#1c1a18', cheek: '#f4f0e6', up: f === 0, w: 44, h: 32 }));
    const droneArt = [['#eef1f6', '#8c95a8'], ['#4a505e', '#16181e'], ['#ff6a3a', '#a8301a']].map(([a, b]) => paintDrone(a, b));
    const ledGlow = glowSprite('rgba(255,60,50,1)', 10);
    const leafArt = ['#e8792b', '#c9352a', '#f0b53a', '#d9602a'].map(paintLeaf);
    const sunGlow = glowSprite('rgba(255,244,200,1)', 90);
    const kiteGlow = glowSprite('rgba(255,255,255,1)', 40);
    const dangerGlow = glowSprite('rgba(255,60,40,1)', 24);
    const vignette = vignetteSprite(W, H, 0.42, '6,18,48');

    const flyer = createMover({ x: W / 2, minX: 20, maxX: W - 20, speed: 290, accel: 14 });
    const kite = { x: W / 2, vx: 0, y: KITE_Y, vy: 0, rot: 0, spin: 0 };
    const tail = Array.from({ length: 14 }, () => ({ x: W / 2, y: KITE_Y + 38 }));
    const fx = createParticles();
    const threats = [];
    const plan = [];
    const cloudBank = Array.from({ length: 6 }, (_, i) => ({ art: clouds[i % 4], x: art.range(-60, W + 60), y: art.range(60, 380), sp: art.range(5, 14), depth: art.range(0.5, 1) }));
    const streaks = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: 60 + Math.random() * 460, len: 20 + Math.random() * 40, sp: 0.6 + Math.random() * 0.8 }));
    const leaves = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: Math.random() * H, vy: 20 + Math.random() * 30, ph: Math.random() * 6.28, rot: Math.random() * 6, art: (Math.random() * 4) | 0 }));

    let clock = 0;
    let nextT = 3.2; // first arrival at the kite's height: nothing can touch it before
    const windVis = 0; // no gusts: the tail, leaves and streaks just drift in a light breeze

    // Everything is planned by the moment it reaches the kite's height, from the rng only.
    function schedule(until) {
      while (nextT < until) {
        const T = nextT;
        const p = progress(T, 60, 1.35);
        let gap = lerp(1.05, 0.4, p) * rng.range(0.85, 1.15);
        if (T > 14 && rng.chance(lerp(0.1, 0.2, p))) {
          // a V of geese, lead bird lowest; keeps a wide lane free on at least one side
          const X = rng.range(70, W - 70);
          const vy = lerp(170, 230, p) * rng.range(0.92, 1.08);
          const vx = rng.range(-18, 18);
          const n = p > 0.5 && rng.chance(0.5) ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const rank = Math.ceil(i / 2);
            const side = i % 2 ? -1 : 1;
            plan.push({ kind: 'goose', T, X, vx, vy, ox: rank * side * 23, oy: -rank * 19, ph: rng.range(0, 6.28), r: 11 });
          }
          gap += 0.75 + (n === 7 ? 0.25 : 0);
        } else if (T > 5 && rng.chance(lerp(0.2, 0.34, p))) {
          const X = rng.range(28, W - 28);
          plan.push({ kind: 'drone', T, X, vy: lerp(120, 185, p) * rng.range(0.9, 1.1), ph: rng.range(0, 6.28), look: rng.int(0, 2), r: 13 });
        } else {
          const pair = T > 18 && rng.chance(lerp(0.05, 0.35, p));
          const sep = rng.range(96, 140);
          const X = pair ? rng.range(28, W - 28 - sep) : rng.range(28, W - 28);
          const vy = lerp(230, 330, p) * rng.range(0.9, 1.1);
          const vx = rng.range(-1, 1) * lerp(12, 75, p);
          plan.push({ kind: 'crow', T, X, vx, vy, ph: rng.range(0, 6.28), r: 12 });
          if (pair) plan.push({ kind: 'crow', T: T + rng.range(0, 0.12), X: X + sep, vx: vx * rng.range(0.6, 1.2), vy, ph: rng.range(0, 6.28), r: 12 });
        }
        nextT = T + gap;
      }
    }

    function place(o, t) {
      if (o.kind === 'drone') {
        o.y = KITE_Y + o.vy * (o.T - t);
        o.x = o.X + Math.sin(t * 1.7 + o.ph) * 7 * clamp((o.T - t) / 0.8, 0, 1);
      } else {
        o.y = KITE_Y - o.vy * (o.T - t) + (o.oy || 0);
        o.x = o.X + o.vx * (t - o.T) + (o.ox || 0);
      }
    }


    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        schedule(t + 5);

        for (let i = plan.length - 1; i >= 0; i--) {
          const o = plan[i];
          const lead = o.kind === 'drone' ? (H + 50 - KITE_Y) / o.vy : (KITE_Y + 60 - (o.oy || 0)) / o.vy;
          if (t < o.T - lead) continue;
          plan.splice(i, 1);
          threats.push(o);
        }

        flyer.update(dt, dir);
        kite.vx += (K * (flyer.x - kite.x) - C * kite.vx) * dt;
        kite.x += kite.vx * dt;
        if (kite.x < 26 || kite.x > W - 26) {
          kite.x = clamp(kite.x, 26, W - 26);
          kite.vx *= -0.3;
        }
        kite.y = KITE_Y + Math.sin(clock * 1.3) * 5;
        kite.rot = clamp(kite.vx * 0.0022 + (flyer.x - kite.x) * 0.0018, -0.55, 0.55);

        for (let i = threats.length - 1; i >= 0; i--) {
          const o = threats[i];
          place(o, t);
          if (o.y > H + 80 || o.y < -120) {
            threats.splice(i, 1);
            continue;
          }
          const hy = o.y;
          const dx = o.x - kite.x;
          const dy = hy - (kite.y - 4);
          const r = KITE_R + o.r;
          if (dx * dx + dy * dy < r * r) {
            this.dead = true;
            const secs = Math.floor(t);
            if (o.kind === 'crow') this.deathReason = `A crow tore through your kite — aloft for ${secs}s.`;
            else if (o.kind === 'goose') this.deathReason = `Flew into a flock of geese — aloft for ${secs}s.`;
            else this.deathReason = `A drone's propellers shredded your kite — aloft for ${secs}s.`;
            const colors = ['#ffd23f', '#2c3fd1', '#1fc2b0', '#ff3d7f', '#ffffff'];
            fx.burst(kite.x, kite.y, { count: 36, speed: 170, life: 1.3, size: 4, gravity: 120, drag: 1.2, colors });
            if (o.kind === 'drone') fx.burst(o.x, o.y, { count: 26, speed: 200, life: 0.8, size: 3, gravity: 140, drag: 1.5, colors: ['#ffffff', '#ffd27a', '#ff8a3a', '#4a505e'] });
            else fx.burst(o.x, o.y, { count: 14, speed: 110, life: 1.4, size: 3.5, gravity: 60, drag: 1.5, colors: o.kind === 'crow' ? ['#111219', '#2a2d3a', '#3a3f55'] : ['#f4f0e6', '#a39a8a', '#5a524a'] });
            kite.vy = -40;
            kite.spin = (Math.random() - 0.5) * 8;
            break;
          }
        }

        this.stepCosmetic(dt);
      },

      stepCosmetic(dt) {
        // the tail streams down from the kite and lags behind its swings
        tail[0].x = kite.x - Math.sin(kite.rot) * 36;
        tail[0].y = kite.y + Math.cos(kite.rot) * 36;
        for (let i = 1; i < tail.length; i++) {
          const a = tail[i - 1];
          const b = tail[i];
          // hang under gravity, blown by the wind, then keep each link 7px long
          b.y += 160 * dt;
          b.x -= windVis * 90 * dt;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          b.x = a.x + (dx / d) * 7;
          b.y = a.y + (dy / d) * 7;
        }
        for (const c of cloudBank) {
          c.x += (c.sp + windVis * 50) * c.depth * dt;
          if (c.x > W + 120) c.x = -120;
          if (c.x < -120) c.x = W + 120;
        }
        for (const s of streaks) {
          s.x += (windVis * 520 + 8) * s.sp * dt;
          if (s.x > W + 60) s.x = -60;
          if (s.x < -60) s.x = W + 60;
        }
        for (const l of leaves) {
          l.y += l.vy * dt;
          l.x += (Math.sin(clock * 1.2 + l.ph) * 18 + windVis * 160) * dt;
          l.rot += dt * 2;
          if (l.y > H + 10) (l.y = -10), (l.x = Math.random() * W);
          if (l.x > W + 10) l.x = -10;
          if (l.x < -10) l.x = W + 10;
        }
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        kite.vy += 260 * dt;
        kite.y += kite.vy * dt;
        kite.x += kite.vx * dt * 0.3;
        kite.rot += kite.spin * dt;
        for (const o of threats) {
          if (o.kind === 'drone') o.y -= o.vy * dt;
          else (o.y += o.vy * dt), (o.x += (o.vx || 0) * dt);
        }
        if (Math.random() < 0.4) fx.burst(kite.x, kite.y, { count: 1, speed: 30, life: 0.8, size: 3, gravity: 40, colors: ['#ffd23f', '#ff3d7f', '#1fc2b0'] });
        this.stepCosmetic(dt);
      },

      render(g) {
        const pan = flyer.x - W / 2;
        drawSprite(g, sky, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 292 - pan * 0.02, 70, { size: 260, alpha: 0.55 });
        drawSprite(g, sunGlow, 292 - pan * 0.02, 70, { size: 70, alpha: 0.9 });
        g.globalCompositeOperation = 'source-over';

        for (const c of cloudBank) drawSprite(g, c.art, c.x - pan * 0.05 * c.depth, c.y, { size: c.art.w * (0.7 + 0.4 * c.depth), alpha: 0.55 + 0.35 * c.depth });

        // faint wind streaks
        const streakA = 0.05;
        g.strokeStyle = `rgba(255,255,255,${streakA})`;
        g.lineWidth = 1.4;
        g.beginPath();
        for (const s of streaks) {
          g.moveTo(s.x, s.y);
          g.lineTo(s.x - Math.sign(windVis || 1) * s.len * (0.4 + Math.abs(windVis)), s.y);
        }
        g.stroke();

        drawSprite(g, farHills, W / 2 - pan * 0.06, 520);
        drawSprite(g, nearHill, W / 2 - pan * 0.14, 590);

        // drones climb from the fields below: wobbling, rotors a blur, a red light blinking
        for (const o of threats) {
          if (o.kind !== 'drone') continue;
          const rot = Math.sin(clock * 2.3 + o.ph) * 0.07;
          const close = clamp(1 - Math.abs(o.y - kite.y) / 150, 0, 1) * clamp(1 - Math.abs(o.x - kite.x) / 110, 0, 1);
          if (close > 0.05) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, dangerGlow, o.x, o.y, { size: 56, alpha: 0.5 * close });
            g.globalCompositeOperation = 'source-over';
          }
          g.save();
          g.translate(o.x, o.y);
          g.rotate(rot);
          drawSprite(g, droneArt[o.look], 0, 0, { size: 50 });
          for (const side of [-1, 1]) {
            const spin = Math.abs(Math.sin(clock * 40 + o.ph + side));
            g.fillStyle = 'rgba(40,44,54,0.28)';
            g.beginPath();
            g.ellipse(side * 18.8, -11.5, 9 + spin * 3, 1.6, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fillRect(side * 18.8 - (2 + spin * 9), -12, 4 + spin * 18, 0.9);
          }
          if (Math.sin(clock * 9 + o.ph) > 0.2) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, ledGlow, 8, -2, { size: 16 });
            g.globalCompositeOperation = 'source-over';
          }
          g.restore();
        }

        // the string, sagging in the wind
        const hx = flyer.x + flyer.lean * 3;
        const kx = kite.x;
        const ky = kite.y + 2;
        if (!this.dead) {
          g.strokeStyle = 'rgba(255,255,255,0.9)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(hx, HANDS_Y);
          g.quadraticCurveTo((hx + kx) / 2 - windVis * 30 + kite.vx * 0.05, (HANDS_Y + ky) / 2 + 34, kx, ky);
          g.stroke();
        } else {
          // snapped: a loose curl drifting down from the hands
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(hx, HANDS_Y);
          g.bezierCurveTo(hx - 40, HANDS_Y - 90, hx + 30, HANDS_Y - 140, (hx + kx) / 2, Math.min(ky, HANDS_Y) - 30);
          g.stroke();
        }

        // tail and bows
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 1.3;
        g.beginPath();
        for (let i = 0; i < tail.length; i++) {
          const w = Math.sin(clock * 7 - i * 0.8) * i * 0.35;
          if (i === 0) g.moveTo(tail[i].x + w, tail[i].y);
          else g.lineTo(tail[i].x + w, tail[i].y);
        }
        g.stroke();
        for (let i = 2; i < tail.length; i += 3) {
          const w = Math.sin(clock * 7 - i * 0.8) * i * 0.35;
          drawSprite(g, bows[((i / 3) | 0) % 3], tail[i].x + w, tail[i].y, { size: 14, rot: Math.sin(clock * 5 + i) * 0.4 });
        }

        g.globalCompositeOperation = 'lighter';
        drawSprite(g, kiteGlow, kite.x, kite.y - 4, { size: 90, alpha: 0.22 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, kiteArt, kite.x, kite.y, { size: 56, rot: kite.rot });

        // crows and geese, with a warm warning halo once they are close to the kite
        for (const o of threats) {
          if (o.kind === 'drone') continue;
          const close = clamp(1 - Math.abs(o.y - kite.y) / 150, 0, 1) * clamp(1 - Math.abs(o.x - kite.x) / 110, 0, 1);
          if (close > 0.05) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, dangerGlow, o.x, o.y, { size: 50, alpha: 0.5 * close });
            g.globalCompositeOperation = 'source-over';
          }
          const frame = Math.sin(clock * (o.kind === 'crow' ? 16 : 9) + o.ph) > 0 ? 0 : 1;
          const tilt = Math.atan2(-(o.vx || 0), o.vy) * 0.8;
          if (o.kind === 'crow') drawSprite(g, crowArt[frame], o.x, o.y, { size: 46, rot: tilt });
          else drawSprite(g, gooseArt[frame], o.x, o.y, { size: 42, rot: tilt });
        }

        for (const l of leaves) drawSprite(g, leafArt[l.art], l.x, l.y, { size: 11, rot: l.rot, alpha: 0.85 });

        fx.render(g);

        drawSprite(g, flyerArt, flyer.x, FLYER_Y, { size: 36, rot: flyer.lean * 0.1 });

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
