// Sidewinder — a snake slithering across a desert floor at golden hour. You don't strafe: ← and →
// turn the snake's head, and it never stops moving forward. Its body follows exactly where the head
// has been and grows longer every second, so you have to keep finding open sand without biting your
// own tail. The only obstacle is fire: flames flare up out of cracks in the scorching sand (smoke,
// sparks and a filling red ring warn you first), burn for a while and die down. The rocky rim just
// bounces the snake back.

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
const FIRE_WARN = 1.5;
const FIRE_R = 17; // burn radius, drawn as the red danger ring

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

function paintScorch() {
  // the charred, cracked patch of sand a fire burns on
  return makeSprite(56, 56, (g) => {
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    sg.addColorStop(0, 'rgba(40,14,6,0.95)');
    sg.addColorStop(0.55, 'rgba(70,26,10,0.75)');
    sg.addColorStop(1, 'rgba(110,50,20,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(0, 0, 26, 0, Math.PI * 2);
    g.fill();
    // glowing cracks
    g.strokeStyle = '#ff7a1a';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      g.lineTo(Math.cos(a + 0.25) * 10, Math.sin(a + 0.25) * 10);
      g.lineTo(Math.cos(a - 0.1) * 17, Math.sin(a - 0.1) * 17);
      g.stroke();
    }
    // embers
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const r = 4 + (k % 4) * 3.5;
      g.fillStyle = k % 2 ? '#ffb23a' : '#e8401c';
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 1.4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// one licking tongue of flame, base at (x, y), drawn fresh each frame so it flickers
function flameTongue(g, x, y, w, h, sway, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - w, y);
  g.bezierCurveTo(x - w * 1.1, y - h * 0.45, x + sway * 0.4 - w * 0.5, y - h * 0.7, x + sway, y - h);
  g.bezierCurveTo(x + sway * 0.4 + w * 0.5, y - h * 0.7, x + w * 1.1, y - h * 0.45, x + w, y);
  g.quadraticCurveTo(x, y + w * 0.55, x - w, y);
  g.fill();
}

function drawFire(g, x, y, k, clock, seed) {
  // three overlapping tongues, each a red / orange / yellow stack
  const tongues = [
    [-6, 0.75, 0],
    [6, 0.8, 1.7],
    [0, 1, 3.1],
  ];
  for (const [dx, hk, ph] of tongues) {
    const f = Math.sin(clock * 11 + seed + ph) * 0.5 + Math.sin(clock * 17 + seed * 2 + ph) * 0.5;
    const h = (30 + 6 * f) * hk * k;
    const sway = Math.sin(clock * 6 + seed + ph) * 4 * k;
    const bx = x + dx * k;
    const by = y + 6 * k;
    flameTongue(g, bx, by, 9 * k, h, sway, '#d8301a');
    flameTongue(g, bx, by, 6.5 * k, h * 0.72, sway * 0.8, '#ff8c1a');
    flameTongue(g, bx, by, 3.8 * k, h * 0.45, sway * 0.6, '#ffe46a');
  }
}

// ---------- the game ----------

export default {
  id: 'sidewinder',
  title: 'Sidewinder',
  emoji: '🐍',
  tagline: '← and → turn the snake; it never stops slithering, grows longer every second and bounces off the rocks. Don’t bite your own body, and keep out of the flames that flare up from the sand.',
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
    const scorch = paintScorch();
    const sunGlow = glowSprite('rgba(255,190,110,1)', 160);
    const dangerGlow = glowSprite('rgba(255,40,30,1)', 30);
    const tealGlow = glowSprite('rgba(90,255,220,1)', 24);
    const vignette = vignetteSprite(W, H, 0.5, '70,20,5');
    const fx = createParticles();
    const dust = createParticles();
    const sparks = createParticles();

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

    // ---- fires, planned up front ----
    const firePlan = [];
    for (let t = 5; t < 58; ) {
      const p = progress(t, 60, 1.1);
      firePlan.push({ t, x: plan.range(AX0 + 28, AX1 - 28), y: plan.range(AY0 + 30, AY1 - 28), life: plan.range(lerp(8, 11, p), lerp(10, 14, p)), rot: plan.range(0, Math.PI * 2) });
      t += plan.range(lerp(2.6, 1.1, p), lerp(3.4, 1.5, p));
    }
    let nextFire = 0;
    const fires = [];
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

        // fires: warned by smoke and sparks from a glowing crack, then they burn a while and die down
        while (nextFire < firePlan.length && firePlan[nextFire].t <= t) {
          const s = firePlan[nextFire++];
          const tooClose = Math.hypot(s.x - hx, s.y - hy) < 110 || nearBody(s.x, s.y, 28) || fires.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 50);
          if (!tooClose) fires.push({ ...s, age: 0 });
        }
        for (let i = fires.length - 1; i >= 0; i--) {
          const s = fires[i];
          const before = s.age;
          s.age += dt;
          if (before < FIRE_WARN && s.age >= FIRE_WARN) {
            sparks.burst(s.x, s.y, { count: 26, speed: 120, angle: -Math.PI / 2, spread: 2.4, life: 0.8, size: 3, round: true, drag: 2.5, gravity: -40, colors: ['#ffe46a', '#ff8c1a', '#ff5a1a'] });
          }
          const burning = s.age >= FIRE_WARN && s.age <= FIRE_WARN + s.life;
          if (s.age > FIRE_WARN + s.life + 0.7) fires.splice(i, 1);
          else if (s.age < FIRE_WARN ? Math.random() < 0.12 + 0.2 * (s.age / FIRE_WARN) : burning && Math.random() < 0.35) {
            sparks.burst(s.x + (Math.random() - 0.5) * 14, s.y - (burning ? 14 : 0), { count: 1, speed: 45, angle: -Math.PI / 2, spread: 0.9, life: 0.9, size: 2.2, round: true, gravity: -30, colors: ['#ffd04a', '#ff7a1a'] });
          }
          if (s.age < FIRE_WARN + s.life + 0.7 && Math.random() < (burning ? 0.12 : 0.18)) {
            dust.burst(s.x + (Math.random() - 0.5) * 10, s.y - (burning ? 26 : 2), { count: 1, speed: 22, angle: -Math.PI / 2, spread: 0.6, life: 1.1, size: 6, round: true, drag: 1, colors: ['rgba(90,70,60,0.45)', 'rgba(130,110,95,0.35)'] });
          }
        }

        fx.update(dt);
        dust.update(dt);
        sparks.update(dt);

        // ---- what kills you: only ever the head ----
        // the rocky rim is harmless: the snake glances off it like a ball off a wall
        const m = HEAD_R + 2;
        let bounced = false;
        if (hx < AX0 + m || hx > AX1 - m) {
          heading = Math.PI - heading;
          hx = clamp(hx, AX0 + m, AX1 - m);
          bounced = true;
        }
        if (hy < AY0 + m || hy > AY1 - m) {
          heading = -heading;
          hy = clamp(hy, AY0 + m, AY1 - m);
          bounced = true;
        }
        if (bounced) {
          // a head-on hit glances off at an angle (towards the roomier side) instead of doubling back
          // straight onto the body
          const nx = hx < AX0 + m + 0.5 ? 1 : hx > AX1 - m - 0.5 ? -1 : 0;
          const ny = hy < AY0 + m + 0.5 ? 1 : hy > AY1 - m - 0.5 ? -1 : 0;
          const na = Math.atan2(ny, nx);
          let off = Math.atan2(Math.sin(heading - na), Math.cos(heading - na));
          if (Math.abs(off) < 1.1) {
            const side = Math.abs(off) > 0.02 ? Math.sign(off) : nx ? (hy < (AY0 + AY1) / 2 ? 1 : -1) * nx : (hx < (AX0 + AX1) / 2 ? -1 : 1) * ny;
            heading = na + side * 1.1;
          }
          fx.burst(hx, hy, { count: 8, speed: 70, life: 0.5, size: 3, round: true, drag: 3, colors: ['#f6d29a', '#d8a062'] });
        }
        for (let i = start; t >= 2.2 && i < px.length; i++) {
          if (travelled - pc[i] < NECK) break;
          const dx = px[i] - hx;
          const dy = py[i] - hy;
          const r = HEAD_R + bodyR(i) - 4;
          if (dx * dx + dy * dy < r * r) return die(this, 'Bit your own tail.');
        }
        for (const s of fires) {
          if (s.age < FIRE_WARN || s.age > FIRE_WARN + s.life) continue;
          if (Math.hypot(s.x - hx, s.y - hy) < FIRE_R + HEAD_R - 3) return die(this, 'Slithered into the fire.');
        }
      },

      afterlife(dt) {
        clock += dt;
        fx.update(dt);
        dust.update(dt);
        sparks.update(dt);
      },

      render(g) {
        drawSprite(g, desert, W / 2, H / 2);

        // scorched ground and the warning under everything
        for (const s of fires) {
          if (s.age < FIRE_WARN) {
            const k = s.age / FIRE_WARN;
            drawSprite(g, scorch, s.x, s.y, { size: 56 * (0.4 + 0.6 * k), alpha: 0.3 + 0.7 * k });
            // ring filling up to the moment it catches
            g.strokeStyle = 'rgba(255,60,30,0.95)';
            g.lineWidth = 2.4;
            g.beginPath();
            g.arc(s.x, s.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
            g.stroke();
          } else {
            const end = s.age - FIRE_WARN - s.life;
            drawSprite(g, scorch, s.x, s.y, { size: 56, alpha: end > 0 ? clamp(1 - end / 0.7, 0, 1) : 1 });
          }
        }

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

        // fires
        for (const s of fires) {
          if (s.age < FIRE_WARN) continue;
          const out = s.age - FIRE_WARN;
          const rise = Math.min(1, out / 0.25);
          const sink = s.age > FIRE_WARN + s.life ? clamp(1 - (s.age - FIRE_WARN - s.life) / 0.7, 0, 1) : 1;
          const k = rise * sink;
          if (k <= 0) continue;
          const pulse = 0.75 + 0.25 * Math.sin(clock * 9 + s.rot);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, dangerGlow, s.x, s.y - 6, { size: 96, alpha: 0.6 * k * pulse });
          g.globalCompositeOperation = 'source-over';
          // the danger ring marks exactly how close is too close
          g.strokeStyle = `rgba(255,50,30,${0.85 * k * pulse})`;
          g.lineWidth = 2.4;
          g.setLineDash([5, 4]);
          g.lineDashOffset = -clock * 12;
          g.beginPath();
          g.arc(s.x, s.y, FIRE_R + 4, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          drawFire(g, s.x, s.y, k, clock, s.rot * 3);
        }
        sparks.render(g, true);

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
