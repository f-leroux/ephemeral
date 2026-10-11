// Sidewinder — a snake slithering across a desert floor at golden hour. You don't strafe: ← and →
// turn the snake's head, and it never stops moving forward. Its body follows exactly where the head
// has been and grows longer every second, so you have to keep finding open sand without biting your
// own tail. Cacti and the rocky rim are deadly, scorpions dig up out of the sand (a swirl of sand
// warns you first) and, later, tumbleweeds roll across the dunes.

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

// the open sand; the rocky rim around it is a wall (the timer sits on the top ledge)
const AX0 = 18;
const AX1 = 342;
const AY0 = 60;
const AY1 = 622;
const HEAD_R = 8;
const BODY_R = 7.5;
const NECK = 26; // the head can't bite the first stretch of its own neck
const SEG = 3; // a body point every 3 units of travel
const OMEGA = 2.6; // full turn rate, radians per second
const SCORP_WARN = 1.5;
const WEED_WARN = 1.3;

const speedAt = (t) => lerp(125, 172, progress(t, 60, 1.2));
const lengthAt = (t) => 200 + 1450 * progress(t, 60, 1.25);

// ---------- art ----------

function paintDesert(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#f2c27f');
    base.addColorStop(0.5, '#e8ad69');
    base.addColorStop(1, '#d9955a');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // broad dune swells: soft light and shade
    for (let i = 0; i < 9; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(80, 170);
      const light = rng.chance(0.5);
      const grad = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
      grad.addColorStop(0, light ? 'rgba(255,226,170,0.35)' : 'rgba(170,90,40,0.18)');
      grad.addColorStop(1, light ? 'rgba(255,226,170,0)' : 'rgba(170,90,40,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // wind ripples: long wavy ridges, a lit edge and a shadowed edge
    for (let i = 0; i < 70; i++) {
      const y0 = rng.range(-20, H + 20);
      const x0 = rng.range(-60, W);
      const len = rng.range(70, 200);
      const amp = rng.range(2, 5);
      const ph = rng.range(0, 6);
      for (const [dy, color, lw] of [
        [1.6, 'rgba(160,85,35,0.2)', 1.6],
        [0, 'rgba(255,236,196,0.45)', 1.2],
      ]) {
        g.strokeStyle = color;
        g.lineWidth = lw;
        g.beginPath();
        for (let x = 0; x <= len; x += 6) {
          const y = y0 + dy + Math.sin(x * 0.045 + ph) * amp + x * 0.12;
          if (x === 0) g.moveTo(x0 + x, y);
          else g.lineTo(x0 + x, y);
        }
        g.stroke();
      }
    }
    // grains
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(140,70,30,0.2)' : 'rgba(255,245,220,0.35)';
      const s = rng.range(0.5, 1.5);
      g.fillRect(rng.range(0, W), rng.range(0, H), s, s);
    }
    // pebbles with long evening shadows
    for (let i = 0; i < 26; i++) {
      const x = rng.range(AX0 + 8, AX1 - 8);
      const y = rng.range(AY0 + 8, AY1 - 8);
      const r = rng.range(1.5, 3.8);
      g.fillStyle = 'rgba(120,55,25,0.25)';
      g.beginPath();
      g.ellipse(x + r * 1.4, y + r * 0.9, r * 1.6, r * 0.8, 0.5, 0, Math.PI * 2);
      g.fill();
      const pg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
      pg.addColorStop(0, '#e9cfae');
      pg.addColorStop(1, rng.pick(['#9c6b4a', '#7e5a48', '#b07a55']));
      g.fillStyle = pg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // dry grass tufts
    for (let i = 0; i < 14; i++) {
      const x = rng.range(AX0 + 10, AX1 - 10);
      const y = rng.range(AY0 + 10, AY1 - 10);
      g.strokeStyle = 'rgba(150,110,50,0.75)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = rng.range(-Math.PI, 0);
        const l = rng.range(4, 9);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      g.stroke();
    }
    // little bird tracks
    for (let i = 0; i < 3; i++) {
      let x = rng.range(60, W - 60);
      let y = rng.range(120, H - 80);
      const a = rng.range(0, Math.PI * 2);
      g.strokeStyle = 'rgba(130,70,30,0.3)';
      g.lineWidth = 0.9;
      for (let k = 0; k < 7; k++) {
        const side = k % 2 ? 3 : -3;
        const cx = x + Math.cos(a + Math.PI / 2) * side;
        const cy = y + Math.sin(a + Math.PI / 2) * side;
        g.beginPath();
        for (const d of [-0.5, 0, 0.5]) {
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a + d) * 4, cy + Math.sin(a + d) * 4);
        }
        g.stroke();
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
      }
    }

    // the sandstone rim: a ledge across the top, boulders down the sides and along the bottom
    const rock = (x, y, r) => {
      g.fillStyle = 'rgba(70,25,10,0.35)';
      g.beginPath();
      g.ellipse(x + r * 0.35, y + r * 0.3, r * 1.05, r * 0.9, 0, 0, Math.PI * 2);
      g.fill();
      const n = 9;
      const pts = Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2;
        const rr = r * rng.range(0.8, 1.08);
        return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
      });
      const rg = g.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.1, x, y, r * 1.1);
      rg.addColorStop(0, '#e0805a');
      rg.addColorStop(0.55, '#b24f30');
      rg.addColorStop(1, '#6e2a18');
      g.fillStyle = rg;
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fill();
      // strata lines
      g.strokeStyle = 'rgba(90,30,15,0.35)';
      g.lineWidth = 0.8;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(x - r * 0.7, y + k * r * 0.35);
        g.quadraticCurveTo(x, y + k * r * 0.35 + rng.range(-3, 3), x + r * 0.7, y + k * r * 0.35);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,200,160,0.25)';
      g.beginPath();
      g.ellipse(x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.18, -0.5, 0, Math.PI * 2);
      g.fill();
    };
    const ledge = g.createLinearGradient(0, 0, 0, AY0);
    ledge.addColorStop(0, '#5a2014');
    ledge.addColorStop(0.7, '#7c3220');
    ledge.addColorStop(1, '#8e3d24');
    g.fillStyle = ledge;
    g.fillRect(0, 0, W, AY0 - 4);
    g.strokeStyle = 'rgba(40,10,5,0.35)';
    g.lineWidth = 1;
    for (let y = 8; y < AY0 - 6; y += 9) {
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 1.5);
      g.stroke();
    }
    for (let x = 4; x < W; x += rng.range(16, 24)) rock(x, AY0 - 4 + rng.range(-3, 3), rng.range(9, 13));
    for (let y = AY0 + 6; y < H; y += rng.range(15, 22)) {
      rock(AX0 - 9 + rng.range(-3, 2), y, rng.range(9, 13));
      rock(AX1 + 9 + rng.range(-2, 3), y, rng.range(9, 13));
    }
    for (let x = AX0; x < AX1; x += rng.range(16, 22)) rock(x, AY1 + 10 + rng.range(-2, 3), rng.range(9, 13));
  }, 2);
}

function paintHead() {
  // pointing along +x
  return makeSprite(34, 28, (g) => {
    const body = g.createLinearGradient(0, -11, 0, 11);
    body.addColorStop(0, '#4fd6c2');
    body.addColorStop(0.5, '#1f9a8c');
    body.addColorStop(1, '#0f5c55');
    g.fillStyle = '#0a3b37';
    g.beginPath();
    g.moveTo(-12, -8.5);
    g.bezierCurveTo(0, -13, 11, -10, 15, -2);
    g.quadraticCurveTo(16.5, 0, 15, 2);
    g.bezierCurveTo(11, 10, 0, 13, -12, 8.5);
    g.closePath();
    g.fill();
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-11, -7.4);
    g.bezierCurveTo(0, -11.8, 10, -9, 14, -1.8);
    g.quadraticCurveTo(15.3, 0, 14, 1.8);
    g.bezierCurveTo(10, 9, 0, 11.8, -11, 7.4);
    g.closePath();
    g.fill();
    // scale pattern on top of the head
    g.fillStyle = 'rgba(8,50,46,0.75)';
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(1, -4);
    g.lineTo(8, 0);
    g.lineTo(1, 4);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,214,90,0.9)';
    g.beginPath();
    g.moveTo(-3, 0);
    g.lineTo(1, -2);
    g.lineTo(5, 0);
    g.lineTo(1, 2);
    g.closePath();
    g.fill();
    // eyes with slit pupils
    for (const s of [-1, 1]) {
      g.fillStyle = '#0a3b37';
      g.beginPath();
      g.ellipse(6, s * 6.4, 3.6, 2.9, 0, 0, Math.PI * 2);
      g.fill();
      const eye = g.createRadialGradient(6.6, s * 6 - 0.6, 0, 6, s * 6.4, 3);
      eye.addColorStop(0, '#fff7a8');
      eye.addColorStop(1, '#e7a21a');
      g.fillStyle = eye;
      g.beginPath();
      g.ellipse(6, s * 6.4, 2.9, 2.3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.fillRect(5.6, s * 6.4 - 1.9, 0.9, 3.8);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(6.6, s * 6.4 - 1.4, 0.8, 0.8);
    }
    // nostrils and a sheen
    g.fillStyle = '#062a27';
    g.fillRect(12.5, -2, 1, 1);
    g.fillRect(12.5, 1, 1, 1);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(-1, -5, 6, 1.6, -0.15, 0, Math.PI * 2);
    g.fill();
  });
}

function paintDiamond() {
  return makeSprite(12, 12, (g) => {
    g.fillStyle = '#0b4440';
    g.beginPath();
    g.moveTo(-5.5, 0);
    g.lineTo(0, -5);
    g.lineTo(5.5, 0);
    g.lineTo(0, 5);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffcf5a';
    g.beginPath();
    g.moveTo(-2.8, 0);
    g.lineTo(0, -2.4);
    g.lineTo(2.8, 0);
    g.lineTo(0, 2.4);
    g.closePath();
    g.fill();
  });
}

function paintCactus(rng) {
  const R = 16;
  return makeSprite(R * 2 + 8, R * 2 + 8, (g) => {
    const ribs = 12;
    const body = g.createRadialGradient(-R * 0.35, -R * 0.4, 1, 0, 0, R);
    body.addColorStop(0, '#9bd36a');
    body.addColorStop(0.6, '#4f9a3c');
    body.addColorStop(1, '#245a22');
    g.fillStyle = body;
    g.beginPath();
    for (let k = 0; k <= ribs * 2; k++) {
      const a = (k / (ribs * 2)) * Math.PI * 2;
      const r = k % 2 ? R * 0.9 : R;
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.strokeStyle = 'rgba(20,60,20,0.55)';
    g.lineWidth = 0.9;
    for (let k = 0; k < ribs; k++) {
      const a = ((k + 0.5) / ribs) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
      g.stroke();
    }
    // spines along each rib
    g.strokeStyle = 'rgba(255,248,215,0.9)';
    g.lineWidth = 0.6;
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * Math.PI * 2;
      for (const d of [0.45, 0.7, 0.95]) {
        const x = Math.cos(a) * R * d;
        const y = Math.sin(a) * R * d;
        g.beginPath();
        for (const s of [-0.7, 0, 0.7]) {
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a + s) * 3.5, y + Math.sin(a + s) * 3.5);
        }
        g.stroke();
      }
    }
    // a magenta bloom on top
    const petals = 7;
    const hue = rng.pick([['#ff6fb0', '#c22a74'], ['#ffd25a', '#e07a10'], ['#ff8a5a', '#c43a1c']]);
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      const pg = g.createRadialGradient(0, 0, 0, Math.cos(a) * 3, Math.sin(a) * 3, 5);
      pg.addColorStop(0, hue[0]);
      pg.addColorStop(1, hue[1]);
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 3.4, 1.9, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff2a0';
    g.beginPath();
    g.arc(0, 0, 1.8, 0, Math.PI * 2);
    g.fill();
  });
}

function paintScorpion() {
  // facing up (−y), tail curled over its back
  return makeSprite(40, 44, (g) => {
    const dark = '#2b130b';
    const shell = (x, y, rx, ry) => {
      const sg = g.createRadialGradient(x - rx * 0.4, y - ry * 0.4, 0, x, y, Math.max(rx, ry));
      sg.addColorStop(0, '#b0603a');
      sg.addColorStop(0.6, '#5a2a16');
      sg.addColorStop(1, dark);
      g.fillStyle = sg;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    // legs
    g.strokeStyle = dark;
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const y = -2 + k * 3.6;
        g.beginPath();
        g.moveTo(s * 4, y);
        g.lineTo(s * 10, y - 2 + k * 0.6);
        g.lineTo(s * 13, y + 3 + k * 1.2);
        g.stroke();
      }
    }
    // pincers
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 3, -7);
      g.quadraticCurveTo(s * 10, -10, s * 9, -15);
      g.stroke();
      shell(s * 9, -17, 4, 3.6);
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(s * 7, -19);
      g.lineTo(s * 8.5, -23);
      g.lineTo(s * 10, -19.5);
      g.fill();
      g.beginPath();
      g.moveTo(s * 10.5, -19);
      g.lineTo(s * 12.5, -22.5);
      g.lineTo(s * 12.5, -18);
      g.fill();
    }
    // body segments
    shell(0, -6, 4.5, 3.6);
    for (let k = 0; k < 4; k++) shell(0, -1 + k * 3.6, 5.6 - k * 0.3, 2.6);
    // tail arching back over the body
    const tail = [
      [0, 13],
      [0, 16.5],
      [0.5, 19.5],
      [-0.5, 16],
      [-1, 11.5],
      [-1, 7],
    ];
    for (let k = 0; k < tail.length; k++) shell(tail[k][0], tail[k][1], 2.6 - k * 0.15, 2.2);
    // stinger
    g.fillStyle = '#f2a33a';
    g.beginPath();
    g.ellipse(-1, 4.5, 2.2, 2.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a0a05';
    g.beginPath();
    g.moveTo(-2.5, 3.5);
    g.lineTo(-1, -1.5);
    g.lineTo(0.5, 3.5);
    g.fill();
    // glints
    g.fillStyle = 'rgba(255,215,170,0.5)';
    g.beginPath();
    g.ellipse(-1.5, -7, 1.5, 0.8, -0.4, 0, Math.PI * 2);
    g.fill();
  });
}

function paintTumbleweed(rng) {
  const R = 18;
  return makeSprite(R * 2 + 4, R * 2 + 4, (g) => {
    const fill = g.createRadialGradient(-4, -4, 0, 0, 0, R);
    fill.addColorStop(0, 'rgba(170,110,50,0.6)');
    fill.addColorStop(1, 'rgba(90,50,20,0.4)');
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = rng.pick(['#6a3c14', '#8a5420', '#a8722e', '#4e2a0c', '#3a1e08']);
      g.lineWidth = rng.range(0.6, 1.4);
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(R * 0.3, R * 0.95);
      g.beginPath();
      g.arc(rng.range(-4, 4), rng.range(-4, 4), r, a, a + rng.range(0.8, 2.4));
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,225,160,0.6)';
    g.lineWidth = 0.7;
    for (let i = 0; i < 10; i++) {
      const a = rng.range(Math.PI, Math.PI * 1.6);
      g.beginPath();
      g.arc(0, 0, rng.range(R * 0.5, R * 0.9), a, a + 0.6);
      g.stroke();
    }
  });
}

// ---------- the game ----------

export default {
  id: 'sidewinder',
  title: 'Sidewinder',
  emoji: '🐍',
  tagline: '← and → turn the snake; it never stops slithering and grows longer every second. Don’t bite your own body, and keep clear of the rocks, cacti, scorpions and tumbleweeds.',
  colors: { bg: '#7a3420', fg: '#fff3dc', accent: '#3fd1bd' },

  // Desert psytrance in D Phrygian dominant (the "snake charmer" scale: D E♭ F♯ G A B♭ C), 140 BPM:
  // a kick and rolling 16th bass from bar one with darbuka taks and a drone, then a pungi-like
  // charmer tune and hats, then claps and a spiralling 16th arpeggio, and a finale with a second
  // reedy line an octave down and a shaker. 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("d2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const bass = note("<[~ d2 d2 d2]*4 [~ d2 d2 d2]*4 [~ d2 d2 d2]*4 [[~ d2 d2 d2]*3 [~ eb2 eb2 c2]]>")
        .s("sawtooth").decay(0.09).sustain(0).lpf(saw.range(450, 1300).slow(35)).lpq(6).gain(0.36)
      const tak = s("pink").struct("~ x ~ x x ~ x ~ ~ x ~ x x ~ x x").decay(0.04).sustain(0)
        .hpf(2500).lpf(7000).gain("[0.07 0.1]*8").pan(0.6)
      const doum = note("~ ~ ~ ~ ~ ~ d3 ~ ~ ~ ~ ~ ~ ~ ~ ~").s("sine").decay(0.12).sustain(0).gain(0.35)
      const drone = note("[d3,a3]").s("sawtooth").attack(0.4).release(0.6).lpf(700).gain(0.06)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1400).lpf(5500).gain(0.13).room(0.3)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.045]*4")
      const tune = "<[d5 ~ eb5 fs5 g5 ~ fs5 eb5] [fs5 ~ eb5 d5 ~ ~ c5 d5] [a5 ~ bb5 a5 g5 fs5 g5 ~] [fs5 eb5 d5 eb5 d5 ~ ~ ~]>"
      const charmer = note(tune).s("square").decay(0.3).sustain(0.35).release(0.08)
        .lpf(2200).vib(5).vibmod(0.25).gain(0.085).room(0.25).pan(0.45)
        .delay(0.2).delaytime(0.32).delayfeedback(0.25)
      const charmer2 = note("<[d4 ~ eb4 fs4 g4 ~ fs4 eb4] [fs4 ~ eb4 d4 ~ ~ c4 d4] [a4 ~ bb4 a4 g4 fs4 g4 ~] [fs4 eb4 d4 eb4 d4 ~ ~ ~]>").s("sawtooth").decay(0.25).sustain(0.3).release(0.05)
        .lpf(1500).gain(0.05).pan(0.6)
      const arp = note("<[d5 fs5 a5 fs5]*4 [d5 g5 bb5 g5]*4 [c5 eb5 a5 eb5]*4 [d5 fs5 a5 c6]*4>")
        .s("triangle").decay(0.08).sustain(0).lpf(3500).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [8, stack(kick, bass, tak, doum, drone)],
      [8, stack(kick, bass, tak, doum, drone, hats, charmer)],
      [9, stack(kick, bass, tak, doum, drone, hats, clap, charmer, arp)],
      [10, stack(kick, bass, tak, doum, drone, hats, clap, shaker, charmer, charmer2, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const desert = paintDesert(W, H, art);
    const headArt = paintHead();
    const diamond = paintDiamond();
    const cactusArt = [paintCactus(art), paintCactus(art), paintCactus(art)];
    const scorpArt = paintScorpion();
    const weedArt = [paintTumbleweed(art), paintTumbleweed(art)];
    const sunGlow = glowSprite('rgba(255,190,110,1)', 160);
    const amberGlow = glowSprite('rgba(255,150,60,1)', 30);
    const tealGlow = glowSprite('rgba(90,255,220,1)', 24);
    const vignette = vignetteSprite(W, H, 0.5, '70,20,5');
    const fx = createParticles();
    const dust = createParticles();

    // ---- the snake: head plus a trail of points it has passed through ----
    let hx = W / 2;
    let hy = 420;
    let heading = -Math.PI / 2;
    let turn = 0; // smoothed −1..1
    const px = [];
    const py = [];
    const pc = []; // distance travelled when each point was laid
    let start = 0;
    let travelled = 0;
    {
      // the body starts stretched out straight behind the head
      const back = [];
      for (let s = 0; s <= 198; s += SEG) back.push([hx, hy + s]);
      back.reverse();
      back.forEach(([x2, y2], i) => {
        px.push(x2);
        py.push(y2);
        pc.push(i * SEG);
      });
      travelled = (back.length - 1) * SEG;
    }

    // ---- cacti, placed once, away from the opening stretch ----
    const cacti = [];
    for (let tries = 0; cacti.length < 3 && tries < 200; tries++) {
      const x = plan.range(AX0 + 40, AX1 - 40);
      const y = plan.range(AY0 + 50, AY1 - 50);
      if (Math.hypot(x - hx, y - hy) < 260 || (Math.abs(x - hx) < 60 && y > hy - 330)) continue; // clear of the opening seconds
      if (cacti.some((c) => Math.hypot(c.x - x, c.y - y) < 110)) continue;
      cacti.push({ x, y, r: 13, art: cacti.length % cactusArt.length, rot: plan.range(0, 6) });
    }

    // ---- scorpions and tumbleweeds, planned up front ----
    const scorpPlan = [];
    for (let t = 5; t < 58; ) {
      const p = progress(t, 60, 1.1);
      scorpPlan.push({ t, x: plan.range(AX0 + 26, AX1 - 26), y: plan.range(AY0 + 30, AY1 - 26), life: plan.range(lerp(8, 11, p), lerp(10, 14, p)), rot: plan.range(0, Math.PI * 2) });
      t += plan.range(lerp(3.2, 1.5, p), lerp(4.0, 2.0, p));
    }
    const weedPlan = [];
    for (let t = 18; t < 58; ) {
      const p = progress(t, 60, 1.1);
      const dir = plan.chance(0.5) ? 1 : -1;
      weedPlan.push({ t, dir, y: plan.range(AY0 + 40, AY1 - 30), speed: plan.range(lerp(105, 135, p), lerp(135, 170, p)), art: plan.int(0, 1), bob: plan.range(0, 6) });
      t += plan.range(lerp(5.2, 2.4, p), lerp(6.5, 3.2, p));
    }
    let nextScorp = 0;
    let nextWeed = 0;
    const scorps = [];
    const weeds = [];
    let clock = 0;
    let tongue = 0;

    const nearBody = (x, y, r) => {
      for (let i = start; i < px.length; i += 2) {
        const dx = px[i] - x;
        const dy = py[i] - y;
        if (dx * dx + dy * dy < r * r) return true;
      }
      return false;
    };

    const bodyR = (i) => {
      const fromTail = pc[i] - pc[start];
      return BODY_R * (0.35 + 0.65 * Math.min(1, fromTail / 110));
    };

    const die = (game, reason) => {
      game.dead = true;
      game.deathReason = reason;
      fx.burst(hx, hy, { count: 40, speed: 140, life: 1.1, size: 4, round: true, drag: 2.5, colors: ['#f6d29a', '#e3a865', '#c98a4a'] });
      fx.burst(hx, hy, { count: 18, speed: 90, life: 0.8, size: 3, round: true, drag: 2, colors: ['#4fd6c2', '#ffcf5a'] });
    };

    function strokeBody(g, ox, oy, color, extra, k) {
      g.strokeStyle = color;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const step = 6;
      for (let i = start; i < px.length - 1; i += step) {
        const j = Math.min(px.length - 1, i + step);
        g.lineWidth = (bodyR(i) * 2 + extra) * k;
        g.beginPath();
        g.moveTo(px[i] + ox, py[i] + oy);
        for (let m = i + 1; m <= j; m++) g.lineTo(px[m] + ox, py[m] + oy);
        if (j === px.length - 1) g.lineTo(hx + ox, hy + oy);
        g.stroke();
      }
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        tongue -= dt;
        if (tongue < -1.4) tongue = 0.25;
        const v = speedAt(t);
        turn += (dir - turn) * Math.min(1, 14 * dt);
        heading += turn * OMEGA * dt;
        hx += Math.cos(heading) * v * dt;
        hy += Math.sin(heading) * v * dt;
        travelled += v * dt;
        const last = px.length - 1;
        if (Math.hypot(hx - px[last], hy - py[last]) >= SEG) {
          px.push(hx);
          py.push(hy);
          pc.push(travelled);
        }
        const L = lengthAt(t);
        while (start < px.length - 2 && travelled - pc[start + 1] > L) start++;
        if (start > 1500) {
          px.splice(0, start);
          py.splice(0, start);
          pc.splice(0, start);
          start = 0;
        }

        // sand kicked up as it slithers
        if (Math.random() < 0.25 + Math.abs(turn) * 0.3) {
          const side = Math.random() < 0.5 ? -1 : 1;
          dust.burst(hx - Math.cos(heading) * 10 + Math.cos(heading + Math.PI / 2) * side * 7, hy - Math.sin(heading) * 10 + Math.sin(heading + Math.PI / 2) * side * 7, {
            count: 1, speed: 25, life: 0.6, size: 3, round: true, drag: 3, colors: ['rgba(255,226,170,0.8)', 'rgba(220,160,100,0.7)'],
          });
        }

        // scorpions: warned by a sand swirl, then out for a while, then back under
        while (nextScorp < scorpPlan.length && scorpPlan[nextScorp].t <= t) {
          const s = scorpPlan[nextScorp++];
          const tooClose = Math.hypot(s.x - hx, s.y - hy) < 110 || nearBody(s.x, s.y, 26) || cacti.some((c) => Math.hypot(c.x - s.x, c.y - s.y) < 44) || scorps.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 44);
          if (!tooClose) scorps.push({ ...s, age: 0 });
        }
        for (let i = scorps.length - 1; i >= 0; i--) {
          const s = scorps[i];
          const before = s.age;
          s.age += dt;
          if (before < SCORP_WARN && s.age >= SCORP_WARN) {
            fx.burst(s.x, s.y, { count: 22, speed: 110, life: 0.7, size: 3.5, round: true, drag: 3, colors: ['#f6d29a', '#d8a062', '#b9783e'] });
          }
          if (s.age > SCORP_WARN + s.life + 0.7) scorps.splice(i, 1);
          else if (Math.random() < 0.15 && s.age < SCORP_WARN) {
            const a = Math.random() * Math.PI * 2;
            dust.burst(s.x + Math.cos(a) * 24, s.y + Math.sin(a) * 24, { count: 1, speed: 30, angle: a + Math.PI * 0.6, spread: 0.4, life: 0.5, size: 2.5, round: true, colors: ['rgba(255,226,170,0.9)'] });
          }
        }

        // tumbleweeds: an arrow at the edge, then they roll across
        while (nextWeed < weedPlan.length && weedPlan[nextWeed].t <= t) {
          const w = weedPlan[nextWeed++];
          weeds.push({ ...w, age: 0, x: w.dir > 0 ? -24 : W + 24, spin: 0 });
        }
        for (let i = weeds.length - 1; i >= 0; i--) {
          const w = weeds[i];
          w.age += dt;
          if (w.age < WEED_WARN) continue;
          w.x += w.dir * w.speed * dt;
          w.spin += (w.dir * w.speed * dt) / 16;
          if (Math.random() < 0.3) dust.burst(w.x - w.dir * 12, w.y + 12, { count: 1, speed: 20, life: 0.7, size: 4, round: true, drag: 2, colors: ['rgba(240,200,140,0.6)'] });
          if ((w.dir > 0 && w.x > W + 30) || (w.dir < 0 && w.x < -30)) weeds.splice(i, 1);
        }

        fx.update(dt);
        dust.update(dt);

        // ---- what kills you: only ever the head ----
        if (t < 2.2) {
          // a grace period: the rim nudges the snake back instead of stopping it
          const m = HEAD_R + 2;
          if (hx < AX0 + m || hx > AX1 - m) {
            heading = Math.PI - heading;
            hx = clamp(hx, AX0 + m, AX1 - m);
          }
          if (hy < AY0 + m || hy > AY1 - m) {
            heading = -heading;
            hy = clamp(hy, AY0 + m, AY1 - m);
          }
        }
        if (hx < AX0 + HEAD_R * 0.6 || hx > AX1 - HEAD_R * 0.6 || hy < AY0 + HEAD_R * 0.6 || hy > AY1 - HEAD_R * 0.6) {
          return die(this, 'Slithered head first into the rocks.');
        }
        for (let i = start; t >= 2.2 && i < px.length; i++) {
          if (travelled - pc[i] < NECK) break;
          const dx = px[i] - hx;
          const dy = py[i] - hy;
          const r = HEAD_R + bodyR(i) - 4;
          if (dx * dx + dy * dy < r * r) return die(this, 'Bit your own tail.');
        }
        for (const c of cacti) {
          if (Math.hypot(c.x - hx, c.y - hy) < c.r + HEAD_R - 2) return die(this, 'Got a snout full of cactus spines.');
        }
        for (const s of scorps) {
          if (s.age < SCORP_WARN || s.age > SCORP_WARN + s.life) continue;
          if (Math.hypot(s.x - hx, s.y - hy) < 14 + HEAD_R - 2) return die(this, 'Stung by a scorpion.');
        }
        for (const w of weeds) {
          if (w.age < WEED_WARN) continue;
          const wy = w.y + Math.abs(Math.sin(w.age * 6 + w.bob)) * -4;
          if (Math.hypot(w.x - hx, wy - hy) < 16 + HEAD_R - 2) return die(this, 'Bowled over by a tumbleweed.');
        }
      },

      afterlife(dt) {
        clock += dt;
        fx.update(dt);
        dust.update(dt);
      },

      render(g) {
        drawSprite(g, desert, W / 2, H / 2);

        // scorpion holes and sand swirls under everything
        for (const s of scorps) {
          if (s.age < SCORP_WARN) {
            const k = s.age / SCORP_WARN;
            g.fillStyle = `rgba(120,55,20,${0.15 + 0.25 * k})`;
            g.beginPath();
            g.ellipse(s.x, s.y, 6 + 10 * k, 5 + 8 * k, 0, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = `rgba(255,240,205,${0.5 + 0.4 * k})`;
            g.lineWidth = 1.6;
            for (let a = 0; a < 3; a++) {
              const a0 = clock * 5 + (a * Math.PI * 2) / 3;
              g.beginPath();
              g.arc(s.x, s.y, 14 + 6 * (1 - k), a0, a0 + 1.2);
              g.stroke();
            }
            // ring filling up to the moment it comes out
            g.strokeStyle = 'rgba(255,90,40,0.9)';
            g.lineWidth = 2.2;
            g.beginPath();
            g.arc(s.x, s.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
            g.stroke();
          } else {
            g.fillStyle = 'rgba(110,50,18,0.35)';
            g.beginPath();
            g.ellipse(s.x, s.y + 3, 13, 10, 0, 0, Math.PI * 2);
            g.fill();
          }
        }

        // cactus shadows (sun low in the upper left), then the cacti
        for (const c of cacti) {
          g.fillStyle = 'rgba(90,35,10,0.28)';
          g.beginPath();
          g.ellipse(c.x + 12, c.y + 10, c.r * 1.35, c.r * 0.8, 0.65, 0, Math.PI * 2);
          g.fill();
        }
        for (const c of cacti) drawSprite(g, cactusArt[c.art], c.x, c.y, { size: c.r * 2.5, rot: c.rot });

        dust.render(g);

        // the snake: shadow, outline, scales, belly sheen, diamond pattern
        strokeBody(g, 4, 5, 'rgba(90,35,10,0.28)', 0, 1);
        strokeBody(g, 0, 0, '#0a3b37', 2.4, 1);
        strokeBody(g, 0, 0, '#1f9a8c', 0, 1);
        strokeBody(g, -1, -1.2, 'rgba(120,240,215,0.55)', 0, 0.42);
        let nextD = pc[start] + 8;
        for (let i = start + 1; i < px.length; i++) {
          if (pc[i] < nextD) continue;
          if (travelled - pc[i] < 16) break;
          nextD = pc[i] + 14;
          const a = Math.atan2(py[i] - py[i - 1], px[i] - px[i - 1]);
          drawSprite(g, diamond, px[i], py[i], { rot: a, size: 12 * (bodyR(i) / BODY_R) });
        }
        // tongue flick
        if (tongue > 0 && !this.dead) {
          const len = 9 * Math.sin((tongue / 0.25) * Math.PI);
          const cx = hx + Math.cos(heading) * 14;
          const cy = hy + Math.sin(heading) * 14;
          const tx = cx + Math.cos(heading) * len;
          const ty = cy + Math.sin(heading) * len;
          g.strokeStyle = '#e8304a';
          g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(tx, ty);
          for (const s of [-0.5, 0.5]) {
            g.moveTo(tx, ty);
            g.lineTo(tx + Math.cos(heading + s) * 3, ty + Math.sin(heading + s) * 3);
          }
          g.stroke();
        }
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, tealGlow, hx, hy, { size: 48, alpha: 0.25 });
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(90,35,10,0.28)';
        g.beginPath();
        g.ellipse(hx + 4, hy + 5, 12, 9, heading, 0, Math.PI * 2);
        g.fill();
        drawSprite(g, headArt, hx, hy, { rot: heading });

        // scorpions
        for (const s of scorps) {
          if (s.age < SCORP_WARN) continue;
          const out = s.age - SCORP_WARN;
          const rise = Math.min(1, out / 0.25);
          const sink = s.age > SCORP_WARN + s.life ? clamp(1 - (s.age - SCORP_WARN - s.life) / 0.7, 0, 1) : 1;
          const k = rise * sink;
          if (k <= 0) continue;
          const wob = Math.sin(clock * 9 + s.rot * 3) * 0.08;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, amberGlow, s.x, s.y, { size: 64, alpha: 0.34 * k });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(80,30,10,${0.3 * k})`;
          g.beginPath();
          g.ellipse(s.x + 5, s.y + 5, 13 * k, 11 * k, 0, 0, Math.PI * 2);
          g.fill();
          drawSprite(g, scorpArt, s.x, s.y, { rot: s.rot + wob, size: 42 * (0.5 + 0.5 * k), alpha: Math.min(1, k * 1.5) });
        }

        // tumbleweeds and their warnings
        for (const w of weeds) {
          if (w.age < WEED_WARN) {
            const blink = 0.55 + 0.45 * Math.sin(w.age * 16);
            const ex = w.dir > 0 ? AX0 + 6 : AX1 - 6;
            g.fillStyle = `rgba(255,236,190,${0.75 * blink})`;
            for (let k = 0; k < 3; k++) {
              const x = ex + w.dir * k * 9;
              g.beginPath();
              g.moveTo(x, w.y - 7);
              g.lineTo(x + w.dir * 7, w.y);
              g.lineTo(x, w.y + 7);
              g.lineTo(x + w.dir * 2.5, w.y);
              g.closePath();
              g.fill();
            }
            g.strokeStyle = `rgba(255,236,190,${0.18 * blink})`;
            g.lineWidth = 26;
            g.beginPath();
            g.moveTo(AX0, w.y);
            g.lineTo(AX1, w.y);
            g.stroke();
            continue;
          }
          const hop = Math.abs(Math.sin(w.age * 6 + w.bob)) * 4;
          g.fillStyle = 'rgba(90,35,10,0.25)';
          g.beginPath();
          g.ellipse(w.x + 7, w.y + 10, 19, 8, 0, 0, Math.PI * 2);
          g.fill();
          drawSprite(g, weedArt[w.art], w.x, w.y - hop, { rot: w.spin, size: 40 });
        }

        fx.render(g);

        // low golden sun from the upper left
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 10, 40, { size: 520, alpha: 0.22 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
