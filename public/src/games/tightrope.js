// Tightrope — a high-wire act under the big top. You don't steer, you balance: left/right pushes
// your lean back. Gusts shove you, pigeons land on your pole, knots in the wire kick your feet.

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

const FEET_Y = 548;
const VP_Y = 186; // where the wire meets the far platform on the horizon
const FALL_AT = 0.78; // radians of lean before you go over
const DANGER_AT = 0.48;
const WALK = 6; // wire units per second
const POLE = 118; // half the balance pole's length
const ARM_Y = -44; // pole height above the feet

// ---------- art ----------

function paintTent(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const cx = W / 2;
    // the roof: canvas stripes fanning out from the king pole
    const bg = g.createLinearGradient(0, 0, 0, VP_Y + 40);
    bg.addColorStop(0, '#1c0710');
    bg.addColorStop(1, '#3e1220');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, VP_Y + 40);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * (0.08 + (0.84 * i) / n);
      const a1 = Math.PI * (0.08 + (0.84 * (i + 1)) / n);
      g.fillStyle = i % 2 ? 'rgba(236,214,180,0.16)' : 'rgba(190,34,52,0.42)';
      g.beginPath();
      g.moveTo(cx, -150);
      g.lineTo(cx + Math.cos(a0) * 900, -150 + Math.sin(a0) * 900);
      g.lineTo(cx + Math.cos(a1) * 900, -150 + Math.sin(a1) * 900);
      g.closePath();
      g.fill();
    }
    const roofShade = g.createLinearGradient(0, 0, 0, VP_Y + 40);
    roofShade.addColorStop(0, 'rgba(10,2,6,0.75)');
    roofShade.addColorStop(0.6, 'rgba(10,2,6,0.15)');
    roofShade.addColorStop(1, 'rgba(10,2,6,0.5)');
    g.fillStyle = roofShade;
    g.fillRect(0, 0, W, VP_Y + 40);

    // arena floor far below, seen from the wire
    const floor = g.createLinearGradient(0, VP_Y, 0, H);
    floor.addColorStop(0, '#1a0a12');
    floor.addColorStop(0.5, '#2a1016');
    floor.addColorStop(1, '#12060a');
    g.fillStyle = floor;
    g.fillRect(0, VP_Y + 22, W, H);

    // tiers of spectators around the ring
    for (let row = 0; row < 5; row++) {
      const y = VP_Y + 26 + row * 13;
      g.fillStyle = `rgba(${30 + row * 6},${10 + row * 3},${18 + row * 3},1)`;
      g.fillRect(0, y, W, 14);
      for (let x = -4; x < W + 8; x += rng.range(8, 12)) {
        const hr = rng.range(3.4, 4.8) + row * 0.3;
        const tone = rng.pick(['#0d0408', '#150710', '#1d0a12', '#241018']);
        g.fillStyle = tone;
        g.beginPath();
        g.arc(x, y + 4, hr, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x - hr * 1.3, y + 5, hr * 2.6, 9);
        if (rng.chance(0.12)) {
          g.fillStyle = rng.pick(['rgba(255,210,120,0.5)', 'rgba(255,120,140,0.45)', 'rgba(140,200,255,0.4)']);
          g.fillRect(x - 1, y + 7, 2, 2);
        }
      }
    }
    // the rail in front of the audience
    g.fillStyle = '#7a1b2a';
    g.fillRect(0, VP_Y + 90, W, 7);
    g.fillStyle = 'rgba(255,210,140,0.35)';
    g.fillRect(0, VP_Y + 90, W, 1.5);
    for (let x = 6; x < W; x += 18) {
      g.fillStyle = 'rgba(255,200,90,0.6)';
      g.beginPath();
      g.arc(x, VP_Y + 93.5, 1.6, 0, Math.PI * 2);
      g.fill();
    }

    // the ring: sawdust inside a painted kerb
    const rx = W * 0.62;
    const ry = 150;
    const rcy = VP_Y + 260;
    g.save();
    g.beginPath();
    g.ellipse(cx, rcy, rx, ry, 0, 0, Math.PI * 2);
    g.clip();
    const dust = g.createRadialGradient(cx, rcy - 20, 10, cx, rcy, rx);
    dust.addColorStop(0, '#6b4424');
    dust.addColorStop(0.7, '#4a2c18');
    dust.addColorStop(1, '#2a170d');
    g.fillStyle = dust;
    g.fillRect(0, rcy - ry, W, ry * 2);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,210,150,0.12)' : 'rgba(30,15,5,0.18)';
      const s = rng.range(0.6, 1.8);
      g.fillRect(rng.range(0, W), rng.range(rcy - ry, rcy + ry), s, s);
    }
    // a painted star in the middle of the ring
    g.translate(cx, rcy);
    g.scale(1, ry / rx);
    g.fillStyle = 'rgba(255,196,74,0.22)';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 26 : 64;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.restore();
    g.lineWidth = 9;
    g.strokeStyle = '#9d1f33';
    g.beginPath();
    g.ellipse(cx, rcy, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,220,150,0.5)';
    g.beginPath();
    g.ellipse(cx, rcy - 3, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.fillStyle = k % 2 ? '#f3e2c0' : '#c42a3f';
      g.fillRect(cx + Math.cos(a) * rx - 3, rcy + Math.sin(a) * ry - 2, 6, 4);
    }

    // the safety net stretched between the wire and the ring
    g.strokeStyle = 'rgba(230,220,200,0.12)';
    g.lineWidth = 1;
    for (let k = -12; k <= 12; k++) {
      g.beginPath();
      g.moveTo(cx + k * 14, VP_Y + 120);
      g.lineTo(cx + k * 60, H + 40);
      g.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const y = VP_Y + 120 + Math.pow(k / 11, 1.7) * (H - VP_Y - 80);
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(cx, y + 10 + k * 1.5, W, y);
      g.stroke();
    }
    const fog = g.createLinearGradient(0, VP_Y + 20, 0, H);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(1, 'rgba(8,2,5,0.55)');
    g.fillStyle = fog;
    g.fillRect(0, VP_Y + 20, W, H);
  }, 2);
}

function paintPlatform() {
  return makeSprite(120, 150, (g) => {
    // a little pedestal on a tall mast, with a pennant
    const mast = g.createLinearGradient(-5, 0, 5, 0);
    mast.addColorStop(0, '#6a5a52');
    mast.addColorStop(0.5, '#d9cbb8');
    mast.addColorStop(1, '#4b3d36');
    g.fillStyle = mast;
    g.fillRect(-4, -8, 8, 90);
    g.fillStyle = '#b52238';
    g.beginPath();
    g.moveTo(-40, -6);
    g.lineTo(40, -6);
    g.lineTo(34, 8);
    g.lineTo(-34, 8);
    g.closePath();
    g.fill();
    for (let x = -34; x < 34; x += 10) {
      g.fillStyle = '#f3e2c0';
      g.beginPath();
      g.moveTo(x, 8);
      g.lineTo(x + 10, 8);
      g.lineTo(x + 5, 16);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#ffcf5a';
    g.fillRect(-40, -9, 80, 4);
    g.fillStyle = '#d9cbb8';
    g.fillRect(-1.5, -70, 3, 64);
    g.fillStyle = '#ffc24a';
    g.beginPath();
    g.moveTo(1.5, -70);
    g.lineTo(36, -60);
    g.lineTo(1.5, -50);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, -72, 3, 0, Math.PI * 2);
    g.fill();
  });
}

function paintAcrobat() {
  // torso, arms and head seen from behind; origin at the hips
  return makeSprite(60, 70, (g) => {
    g.translate(0, 25);
    // arms reaching out to the pole
    g.lineCap = 'round';
    g.strokeStyle = '#e8b48f';
    g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(6 * s, -24);
      g.quadraticCurveTo(15 * s, -22, 19 * s, -14);
      g.stroke();
    }
    // leotard
    const body = g.createLinearGradient(-10, 0, 10, 0);
    body.addColorStop(0, '#6e1030');
    body.addColorStop(0.5, '#e0325a');
    body.addColorStop(1, '#7a1234');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-9, -28);
    g.quadraticCurveTo(-11, -12, -8, 2);
    g.lineTo(8, 2);
    g.quadraticCurveTo(11, -12, 9, -28);
    g.quadraticCurveTo(0, -31, -9, -28);
    g.fill();
    // sequins
    g.fillStyle = 'rgba(255,225,140,0.9)';
    for (let i = 0; i < 16; i++) {
      const y = -26 + (i % 8) * 3.6;
      const x = (i < 8 ? -1 : 1) * (2 + ((i * 7) % 5));
      g.fillRect(x, y, 1.3, 1.3);
    }
    g.fillStyle = '#ffcf5a';
    g.fillRect(-8.5, -2, 17, 3);
    // neck and head, hair in a bun
    g.fillStyle = '#d9a07c';
    g.fillRect(-2.5, -34, 5, 6);
    const hair = g.createRadialGradient(-2, -43, 1, 0, -40, 9);
    hair.addColorStop(0, '#6a3a22');
    hair.addColorStop(1, '#2a140c');
    g.fillStyle = hair;
    g.beginPath();
    g.arc(0, -40, 7.5, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, -48.5, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffc24a';
    g.fillRect(-4, -46, 8, 1.8);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(-3, -43, 2.5, 0, Math.PI * 2);
    g.fill();
  });
}

function paintPole() {
  return makeSprite(POLE * 2 + 30, 34, (g) => {
    const shaft = g.createLinearGradient(0, -3, 0, 3);
    shaft.addColorStop(0, '#fff4df');
    shaft.addColorStop(0.5, '#c7ab86');
    shaft.addColorStop(1, '#6d5842');
    g.strokeStyle = shaft;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-POLE, 5);
    g.quadraticCurveTo(0, -4, POLE, 5);
    g.stroke();
    for (const s of [-1, 1]) {
      const cap = g.createRadialGradient(s * POLE - 2, 2, 1, s * POLE, 5, 9);
      cap.addColorStop(0, '#ffe6a0');
      cap.addColorStop(0.5, '#e2a032');
      cap.addColorStop(1, '#7a4a10');
      g.fillStyle = cap;
      g.beginPath();
      g.arc(s * POLE, 5, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(s * POLE - 2.5, 2, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function paintPigeon() {
  return makeSprite(36, 28, (g) => {
    const body = g.createLinearGradient(0, -10, 0, 10);
    body.addColorStop(0, '#c9cfdc');
    body.addColorStop(1, '#6d7488');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 2, 11, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8e95a8';
    g.beginPath();
    g.moveTo(-8, 2);
    g.lineTo(-17, 6);
    g.lineTo(-8, 7);
    g.fill();
    // wing
    g.fillStyle = '#a2a9ba';
    g.beginPath();
    g.ellipse(-2, 2, 8, 5, -0.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,45,60,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-6, 3);
    g.lineTo(2, 4);
    g.moveTo(-5, 5.5);
    g.lineTo(1, 6);
    g.stroke();
    // head with iridescent neck
    g.fillStyle = '#5da48e';
    g.beginPath();
    g.arc(8, -4, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b8bfd0';
    g.beginPath();
    g.arc(10, -7, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e59a3a';
    g.beginPath();
    g.moveTo(13.5, -7.5);
    g.lineTo(17, -6);
    g.lineTo(13.5, -5.5);
    g.fill();
    g.fillStyle = '#ff7a3d';
    g.beginPath();
    g.arc(11, -8, 1.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e07a6a';
    g.fillRect(-2, 9, 1.5, 3);
    g.fillRect(2, 9, 1.5, 3);
  });
}

// ---------- the game ----------

export default {
  id: 'tightrope',
  title: 'Tightrope',
  emoji: '🎪',
  tagline: 'Hold left or right to lean back into balance on the high wire. Tip too far and you fall: brace for gusts, pigeons and knots.',
  colors: { bg: '#2a0d18', fg: '#fff1d6', accent: '#ffc24a' },

  // Circus waltz in F major, 3/4 at 180 BPM: one bar per cycle, 60 bars = the full minute.
  // 8-bar progression: F – C7 – F – C7 – Bb – F – C7 – F.
  music: {
    cps: 1,
    setup: `
      const bass = note("<f2 c2 f2 c2 bb1 f2 c2 f2>").struct("x ~ ~").s("triangle")
        .decay(0.25).sustain(0.1).lpf(700).gain(0.5)
      const pah = note("<[a3,c4] [g3,bb3,e4] [a3,c4] [g3,bb3,e4] [bb3,d4] [a3,c4] [g3,bb3,e4] [a3,c4]>")
        .struct("~ x x").s("square").decay(0.1).sustain(0).lpf(1400).gain(0.07)
      const kick = note("c2 ~ ~").s("sine").decay(0.15).sustain(0).gain(0.7)
      const brush = s("~ pink pink").decay(0.06).sustain(0).hpf(3000).gain(0.07)
      const crash = s("<white ~ ~ ~ ~ ~ ~ ~>").decay(0.7).sustain(0).hpf(5000).gain(0.06)
      const tune = note("<[c5 a4 f4] [e4 g4 c5] [a4 c5 f5] [e5 ~ c5] [d5 bb4 f4] [a4 c5 f5] [e5 d5 bb4] [a4 ~ ~]>")
        .s("triangle").decay(0.3).sustain(0.2).release(0.1).lpf(3200).gain(0.16).room(0.3)
      const harmony = note("<[a4 f4 c4] [c4 e4 g4] [f4 a4 c5] [c5 ~ g4] [bb4 f4 d4] [f4 a4 c5] [c5 bb4 g4] [f4 ~ ~]>")
        .s("triangle").decay(0.3).sustain(0.2).release(0.1).lpf(2600).gain(0.08)
      const runs = note("<[f4 a4 c5 a4 c5 f5] [e4 g4 bb4 g4 bb4 c5] [f4 a4 c5 f5 c5 a4] [e4 g4 bb4 c5 bb4 g4] [d4 f4 bb4 d5 bb4 f4] [f4 a4 c5 f5 c5 a4] [c5 bb4 g4 e4 g4 bb4] [a4 c5 f5 c5 a4 f4]>")
        .s("square").decay(0.08).sustain(0).lpf(2400).gain(0.06)
    `,
    song: `arrange(
      [8, stack(bass, pah)],
      [16, stack(bass, pah, kick, tune)],
      [18, stack(bass, pah, kick, brush, crash, tune, harmony)],
      [18, stack(bass, pah, kick, brush, crash, tune, harmony, runs)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const tent = paintTent(W, H, art);
    const platform = paintPlatform();
    const acrobat = paintAcrobat();
    const pole = paintPole();
    const pigeon = paintPigeon();
    const bulb = glowSprite('rgba(255,200,110,1)', 12);
    const spot = glowSprite('rgba(255,236,190,1)', 90);
    const redGlow = glowSprite('rgba(255,70,80,1)', 30);
    const vignette = vignetteSprite(W, H, 0.7, '10,0,4');
    const bulbs = [];
    for (const [y0, sag, n] of [[36, 26, 13], [92, 20, 11]]) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        bulbs.push({ x: u * W, y: y0 + Math.sin(u * Math.PI) * sag, ph: art.range(0, 6.28), hue: i % 3 });
      }
    }
    const pennants = Array.from({ length: 9 }, (_, i) => ({ x: 20 + i * 40, color: ['#c42a3f', '#ffc24a', '#f3e2c0'][i % 3] }));

    const fx = createParticles();
    const dust = createParticles();
    const gusts = [];
    const birds = [];
    const knots = [];

    let theta = 0;
    let omega = 0;
    let walked = 0;
    let clock = 0;
    let time = 0;
    let wind = 0; // current gust torque, for visuals too
    let danger = false;
    let gustIn = 3.2;
    let birdIn = 13;
    let knotIn = 27;
    let fall = null; // { t, vy, y }
    const cause = { gust: -9, bird: -9, knot: -9 };
    const nudge = rng.chance(0.5) ? 0.015 : -0.015;

    // where the pole's end is on screen, for a side s = -1 | 1
    const poleEnd = (s, th = theta, lift = 0) => {
      const lx = s * POLE;
      const ly = ARM_Y + 3 - lift;
      return [W / 2 + lx * Math.cos(th) - ly * Math.sin(th), FEET_Y + lx * Math.sin(th) + ly * Math.cos(th)];
    };
    const depthY = (d) => VP_Y + (FEET_Y - VP_Y) / d;

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        time = t;
        clock += dt;
        const p = progress(t, 60, 1.35);
        walked += WALK * dt;

        // ---- schedule the day's disturbances (input-independent) ----
        gustIn -= dt;
        if (gustIn <= 0) {
          gustIn = lerp(4.6, 1.9, p) * rng.range(0.8, 1.2);
          const side = rng.chance(0.5) ? -1 : 1; // side it blows *towards*
          const warn = lerp(1.1, 0.7, p);
          gusts.push({ side, warn, max: warn, len: rng.range(0.7, lerp(1.2, 1.7, p)), age: 0, force: lerp(1.4, 2.7, p) * rng.range(0.85, 1.1) });
        }
        birdIn -= dt;
        if (t > 13 && birdIn <= 0) {
          birdIn = lerp(7, 3.4, p) * rng.range(0.8, 1.2);
          const side = rng.chance(0.5) ? -1 : 1;
          if (!birds.some((b) => b.side === side)) {
            birds.push({ side, state: 'in', age: 0, fly: 1.3, sit: rng.range(1.8, 3.2), weight: lerp(1.2, 1.9, p) * rng.range(0.9, 1.1), x: side * (W / 2 + 30) + W / 2, y: rng.range(260, 380) });
          }
        }
        knotIn -= dt;
        if (t > 27 && knotIn <= 0) {
          knotIn = lerp(5, 2.3, p) * rng.range(0.8, 1.2);
          const travel = lerp(1.7, 1.15, p);
          knots.push({ d: 1 + WALK * travel, side: rng.chance(0.5) ? -1 : 1, kick: lerp(1.0, 1.8, p) * rng.range(0.9, 1.1) });
        }

        // ---- forces on the lean ----
        wind = 0;
        for (let i = gusts.length - 1; i >= 0; i--) {
          const gu = gusts[i];
          if (gu.warn > 0) {
            gu.warn -= dt;
            continue;
          }
          gu.age += dt;
          const u = gu.age / gu.len;
          if (u >= 1) {
            gusts.splice(i, 1);
            continue;
          }
          wind += gu.side * gu.force * Math.sin(Math.PI * Math.min(1, u * 1.6) * 0.5 + (u > 0.6 ? (u - 0.6) * 3.9 : 0));
          cause.gust = t;
          if (Math.random() < 0.5) {
            const x = gu.side > 0 ? -10 : W + 10;
            dust.burst(x, 200 + Math.random() * 380, { count: 1, speed: 420, life: 1.2, size: 3.5, angle: gu.side > 0 ? 0 : Math.PI, spread: 0.3, colors: ['#ffc24a', '#f3e2c0', '#e0325a', '#7ee0ff'] });
          }
        }
        let load = 0;
        for (let i = birds.length - 1; i >= 0; i--) {
          const b = birds[i];
          b.age += dt;
          if (b.state === 'in' && b.age >= b.fly) {
            b.state = 'sit';
            b.age = 0;
          } else if (b.state === 'sit' && b.age >= b.sit) {
            b.state = 'out';
            b.age = 0;
            const [ex, ey] = poleEnd(b.side, theta, 12);
            fx.burst(ex, ey, { count: 8, speed: 60, life: 1.4, size: 3.5, gravity: 40, drag: 1.5, colors: ['#c9cfdc', '#a2a9ba', '#ffffff'] });
          } else if (b.state === 'out' && b.age > 1.2) {
            birds.splice(i, 1);
            continue;
          }
          if (b.state === 'sit') {
            load += b.side * b.weight * Math.cos(theta);
            cause.bird = t;
          }
        }
        for (let i = knots.length - 1; i >= 0; i--) {
          const k = knots[i];
          k.d -= WALK * dt;
          if (k.d <= 1) {
            omega += k.side * k.kick;
            cause.knot = t;
            dust.burst(W / 2, FEET_Y, { count: 14, speed: 90, life: 0.6, size: 3, round: true, gravity: 200, colors: ['#e7cfa0', '#b98d5a'] });
            knots.splice(i, 1);
          }
        }

        const G = lerp(2.0, 3.9, p);
        const alpha = G * Math.sin(theta) - 1.25 * omega + 5.4 * dir + wind + load;
        omega += alpha * dt;
        theta += omega * dt;
        if (t < 2 && Math.abs(theta) > 0.6) {
          theta = Math.sign(theta) * 0.6; // a forgiving first couple of seconds
          omega = 0;
        }
        if (t > 1.2 && theta === 0) theta = nudge; // the wire is never perfectly still

        const nowDanger = Math.abs(theta) > DANGER_AT;
        danger = nowDanger;

        if (Math.abs(theta) > FALL_AT) {
          this.dead = true;
          const last = Math.max(cause.gust, cause.bird, cause.knot);
          if (t - last > 1.2) this.deathReason = 'Leaned too far and fell off the wire.';
          else if (last === cause.gust) this.deathReason = 'Blown off the wire by a gust.';
          else if (last === cause.bird) this.deathReason = 'Tipped over by a pigeon.';
          else this.deathReason = 'Tripped on a knot in the wire.';
          fall = { vy: -60, y: 0, spin: omega };
          fx.burst(W / 2, FEET_Y + ARM_Y, { count: 40, speed: 220, life: 1.4, size: 4, gravity: 160, drag: 1.2, colors: ['#ffc24a', '#e0325a', '#f3e2c0', '#7ee0ff'] });
        }

        fx.update(dt);
        dust.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        if (fall) {
          fall.vy += 900 * dt;
          fall.y += fall.vy * dt;
          fall.spin += Math.sign(theta) * 6 * dt;
          theta += fall.spin * dt;
          if (fall.y > 180 && !fall.landed) {
            fall.landed = true;
            fx.burst(W / 2, FEET_Y + 150, { count: 30, speed: 160, life: 1, size: 3, round: true, gravity: 120, colors: ['#f3e2c0', '#ffc24a'] });
          }
        }
        fx.update(dt);
        dust.update(dt);
      },

      render(g) {
        drawSprite(g, tent, W / 2, H / 2);

        // string lights and pennants under the roof
        g.globalCompositeOperation = 'lighter';
        for (const b of bulbs) {
          const tw = 0.55 + 0.45 * Math.sin(clock * 2.2 + b.ph);
          drawSprite(g, bulb, b.x, b.y, { size: 22, alpha: 0.35 + 0.4 * tw });
        }
        g.globalCompositeOperation = 'source-over';
        for (const b of bulbs) {
          g.fillStyle = ['#ffe3a0', '#ffb3b8', '#fff4e0'][b.hue];
          g.beginPath();
          g.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
          g.fill();
        }
        const flutter = clamp(wind / 3, -1, 1);
        for (const pn of pennants) {
          const sway = Math.sin(clock * 3 + pn.x) * 2 + flutter * 10;
          g.fillStyle = pn.color;
          g.beginPath();
          g.moveTo(pn.x - 8, 60);
          g.lineTo(pn.x + 8, 60);
          g.lineTo(pn.x + sway, 80);
          g.closePath();
          g.fill();
        }
        g.strokeStyle = 'rgba(243,226,192,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 60);
        g.lineTo(W, 60);
        g.stroke();

        // spotlights sweeping down onto the performer
        g.globalCompositeOperation = 'lighter';
        for (const s of [-1, 1]) {
          const sx = W / 2 + s * 150;
          const tx = W / 2 + Math.sin(clock * 0.7 + s) * 14;
          const beam = g.createLinearGradient(0, 0, 0, FEET_Y);
          beam.addColorStop(0, 'rgba(255,236,190,0.16)');
          beam.addColorStop(1, 'rgba(255,236,190,0.04)');
          g.fillStyle = beam;
          g.beginPath();
          g.moveTo(sx - 6, 0);
          g.lineTo(sx + 6, 0);
          g.lineTo(tx + 70, FEET_Y + 10);
          g.lineTo(tx - 70, FEET_Y + 10);
          g.closePath();
          g.fill();
        }
        drawSprite(g, spot, W / 2, FEET_Y - 30, { size: 240, alpha: 0.28 });
        g.globalCompositeOperation = 'source-over';

        // the far platform, getting closer over the minute
        const pd = 3 + 1.2 * Math.max(0, 60 - time);
        const pScale = clamp(3.2 / pd, 0.12, 0.85);
        drawSprite(g, platform, W / 2, depthY(pd) - 4 * pScale, { size: 120 * pScale });

        // the wire, with twist marks rushing towards you
        g.strokeStyle = '#d8c6a8';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(W / 2 - 0.5, depthY(pd));
        g.lineTo(W / 2 - 3, FEET_Y + 120);
        g.lineTo(W / 2 + 3, FEET_Y + 120);
        g.lineTo(W / 2 + 0.5, depthY(pd));
        g.fillStyle = '#cbb693';
        g.fill();
        g.strokeStyle = 'rgba(70,40,20,0.7)';
        const off = walked % 0.8;
        for (let d = 0.6 + (0.8 - off); d < 40; d += 0.8) {
          const y = depthY(d);
          const w = 3.4 / d;
          g.lineWidth = Math.max(0.5, 1.6 / d);
          g.beginPath();
          g.moveTo(W / 2 - w, y + w * 0.6);
          g.lineTo(W / 2 + w, y - w * 0.6);
          g.stroke();
        }

        // knots coming down the wire, each with an arrow for the way it will kick you
        for (const k of knots) {
          const y = depthY(k.d);
          const s = clamp(1 / k.d, 0.1, 1);
          const r = 11 * s + 2;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, W / 2, y, { size: r * 5, alpha: 0.5 });
          g.globalCompositeOperation = 'source-over';
          const kg = g.createRadialGradient(W / 2 - r * 0.3, y - r * 0.3, 1, W / 2, y, r);
          kg.addColorStop(0, '#ff9a8a');
          kg.addColorStop(1, '#8a1426');
          g.fillStyle = kg;
          g.beginPath();
          g.ellipse(W / 2, y, r, r * 0.75, 0, 0, Math.PI * 2);
          g.fill();
          const ax = W / 2 + k.side * (r + 10 * s + 4);
          const aw = 12 * s + 4;
          g.fillStyle = '#ffe07a';
          g.beginPath();
          g.moveTo(ax + k.side * aw, y);
          g.lineTo(ax, y - aw * 0.7);
          g.lineTo(ax, y + aw * 0.7);
          g.closePath();
          g.fill();
        }

        dust.render(g);

        // gust warnings: chevrons along the side the wind comes from
        for (const gu of gusts) {
          const from = gu.side > 0 ? 0 : W;
          const blow = gu.warn > 0 ? 1 - gu.warn / gu.max : 1;
          const a = gu.warn > 0 ? 0.45 + 0.45 * Math.abs(Math.sin(clock * 12)) : Math.max(0, 1 - gu.age / gu.len) * 0.6;
          g.fillStyle = `rgba(190,235,255,${a})`;
          for (let k = 0; k < 3; k++) {
            const x = from + gu.side * (18 + k * 16 + blow * 12);
            const y = FEET_Y + ARM_Y - 60;
            g.beginPath();
            g.moveTo(x + gu.side * 10, y);
            g.lineTo(x - gu.side * 2, y - 14);
            g.lineTo(x - gu.side * 6, y - 14);
            g.lineTo(x + gu.side * 4, y);
            g.lineTo(x - gu.side * 6, y + 14);
            g.lineTo(x - gu.side * 2, y + 14);
            g.closePath();
            g.fill();
          }
          if (gu.warn <= 0) {
            g.strokeStyle = `rgba(220,245,255,${a * 0.5})`;
            g.lineWidth = 2;
            for (let k = 0; k < 6; k++) {
              const y = 250 + k * 55 + Math.sin(clock * 4 + k) * 10;
              const x0 = ((clock * 900 + k * 137) % (W + 200)) - 100;
              const x = gu.side > 0 ? x0 : W - x0;
              g.beginPath();
              g.moveTo(x, y);
              g.lineTo(x - gu.side * 70, y + 3);
              g.stroke();
            }
          }
        }

        // the acrobat (pivoting at the feet), legs first
        const fy = fall ? fall.y : 0;
        const k = fall ? Math.max(0.35, 1 - fall.y / 400) : 1;
        g.save();
        g.translate(W / 2, FEET_Y + fy);
        g.scale(k, k);
        g.rotate(theta);
        const step = Math.sin(walked * 1.4);
        g.strokeStyle = '#5a0f28';
        g.lineCap = 'round';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(-3, -20);
        g.lineTo(-2 + step * 1.5, -1 + Math.max(0, step) * -3);
        g.moveTo(3, -20);
        g.lineTo(2 - step * 1.5, -1 + Math.max(0, -step) * -3);
        g.stroke();
        g.fillStyle = '#f3e2c0';
        g.fillRect(-4.5 + step * 1.5, -2 - Math.max(0, step) * 3, 4, 3);
        g.fillRect(0.5 - step * 1.5, -2 - Math.max(0, -step) * 3, 4, 3);
        g.drawImage(pole.canvas, -(POLE + 15), ARM_Y - 17 + 3, POLE * 2 + 30, 34);
        g.drawImage(acrobat.canvas, -30, -20 - 25 - 35, 60, 70);
        if (danger && !fall) {
          const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
          g.globalCompositeOperation = 'lighter';
          const s = Math.sign(theta);
          g.drawImage(redGlow.canvas, s * POLE - 25, ARM_Y + 8 - 25, 50, 50 * (0.6 + 0.4 * pulse));
          g.globalCompositeOperation = 'source-over';
        }
        g.restore();

        // pigeons flying in, perched, or flapping away
        for (const b of birds) {
          const [ex, ey] = poleEnd(b.side, theta, 12);
          let x = ex;
          let y = ey + fy;
          let face = -b.side;
          let wing = 0;
          if (b.state === 'in') {
            const u = Math.min(1, b.age / b.fly);
            const e = 1 - Math.pow(1 - u, 2);
            x = lerp(b.x, ex, e);
            y = lerp(b.y, ey, e) - Math.sin(u * Math.PI) * 40;
            wing = Math.sin(clock * 30);
          } else if (b.state === 'out') {
            const u = b.age;
            x = ex + b.side * u * 260;
            y = ey - u * 220 + fy;
            face = b.side;
            wing = Math.sin(clock * 30);
          } else if (fall) {
            wing = Math.sin(clock * 30);
          }
          g.save();
          g.translate(x, y);
          g.scale(face, 1);
          drawSprite(g, pigeon, 0, 0, { size: 34 });
          if (wing) {
            g.fillStyle = '#b8bfd0';
            g.beginPath();
            g.ellipse(-2, -2 - wing * 8, 10, 3.5, -0.4 * wing, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          if (b.state === 'sit' && !fall) {
            // a small weight badge so it reads as "heavy on this side"
            g.fillStyle = 'rgba(255,194,74,0.9)';
            g.font = 'bold 11px sans-serif';
            g.textAlign = 'center';
            g.fillText('▼', x, y - 20 + Math.sin(clock * 6) * 2);
          }
        }

        fx.render(g, true);

        // balance gauge
        if (!fall) {
          const gy = 610;
          const gw = 150;
          g.fillStyle = 'rgba(10,2,6,0.55)';
          g.beginPath();
          g.roundRect(W / 2 - gw - 8, gy - 9, gw * 2 + 16, 18, 9);
          g.fill();
          const zone = (DANGER_AT / FALL_AT) * gw;
          g.fillStyle = 'rgba(255,194,74,0.25)';
          g.fillRect(W / 2 - zone, gy - 2, zone * 2, 4);
          g.fillStyle = 'rgba(255,70,80,0.55)';
          g.fillRect(W / 2 - gw, gy - 2, gw - zone, 4);
          g.fillRect(W / 2 + zone, gy - 2, gw - zone, 4);
          const bx = W / 2 + clamp(theta / FALL_AT, -1, 1) * gw;
          g.fillStyle = danger ? '#ff5a5a' : '#fff1d6';
          g.beginPath();
          g.arc(bx, gy, 6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,241,214,0.7)';
          g.fillRect(W / 2 - 0.75, gy - 7, 1.5, 14);
        }

        if (danger || fall) {
          g.fillStyle = `rgba(160,0,20,${fall ? 0.12 : 0.05 + 0.05 * Math.sin(clock * 12)})`;
          g.fillRect(0, 0, W, H);
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
