// Twin Slalom — a sunrise powder run. Two twins ski side by side, one on each half of the slope,
// and they mirror each other: steer one outwards and the other goes outwards too. The pines and
// rocks on the two halves never match, so you're always hunting for the one spread that clears both.

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

const SKI_Y = 540;
const R_SKI = 8; // each skier's hit radius
const DMIN = 16; // closest either twin gets to the centre line
const DMAX = 164;
const SPEED = 250; // how fast each twin moves sideways
const REACH = 205; // what we assume a player really covers per second when planning the run
const STEP = 1 / 120;

// ---------- art ----------

function paintSnow(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0); // horizontal only, so the tile repeats seamlessly
    base.addColorStop(0, '#fbf3f2');
    base.addColorStop(0.5, '#eef3fb');
    base.addColorStop(1, '#dde8f6');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // soft moguls: a blue shadow on the lower right of each, a pink sunlit rim on the upper left
    // (everything is also drawn one tile up and down so the scrolling tile has no seam)
    const wrap = (y, draw) => [-H, 0, H].forEach((o) => draw(y + o));
    for (let i = 0; i < 34; i++) {
      const x = rng.range(-20, W + 20);
      const y0 = rng.range(0, H);
      const r = rng.range(18, 46);
      wrap(y0, (y) => {
        const sh = g.createRadialGradient(x + r * 0.35, y + r * 0.35, 1, x + r * 0.35, y + r * 0.35, r);
        sh.addColorStop(0, 'rgba(120,150,210,0.22)');
        sh.addColorStop(1, 'rgba(120,150,210,0)');
        g.fillStyle = sh;
        g.fillRect(x - r, y - r, r * 2.4, r * 2.4);
        const lit = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x - r * 0.3, y - r * 0.3, r * 0.8);
        lit.addColorStop(0, 'rgba(255,225,220,0.35)');
        lit.addColorStop(1, 'rgba(255,225,220,0)');
        g.fillStyle = lit;
        g.fillRect(x - r * 1.2, y - r * 1.2, r * 2, r * 2);
      });
    }
    // wind ripples
    g.strokeStyle = 'rgba(140,165,215,0.13)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, W);
      const l = rng.range(14, 40);
      const b = rng.range(2, 5);
      const e = rng.range(-2, 2);
      wrap(rng.range(0, H), (y) => {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + l / 2, y - b, x + l, y + e);
        g.stroke();
      });
    }
    // glittering crystals
    for (let i = 0; i < 140; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.9)' : 'rgba(190,210,255,0.7)';
      const s = rng.range(0.6, 1.5);
      g.fillRect(rng.range(0, W), rng.range(0, H), s, s);
    }
  }, 1);
}

function paintPine(rng, size) {
  const r = size / 2;
  return makeSprite(size * 1.5, size * 1.5, (g) => {
    // shadow cast down-right onto the snow
    g.fillStyle = 'rgba(70,95,160,0.28)';
    g.beginPath();
    g.ellipse(r * 0.35, r * 0.45, r * 1.02, r * 0.9, 0.5, 0, Math.PI * 2);
    g.fill();
    // layers of needles, seen from above: a star of boughs, each layer smaller and lighter
    const layers = [
      [1, '#1d4a3a', '#0f2f25'],
      [0.74, '#2a6a4c', '#17432f'],
      [0.48, '#3a8a5c', '#205a3c'],
    ];
    const rot0 = rng.range(0, 1);
    for (const [k, c1, c2] of layers) {
      const R = r * k;
      const pts = 9;
      const grad = g.createRadialGradient(-R * 0.3, -R * 0.3, 1, 0, 0, R);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      g.beginPath();
      for (let i = 0; i <= pts * 2; i++) {
        const a = rot0 + k * 2 + (i / (pts * 2)) * Math.PI * 2;
        const rr = i % 2 ? R * 0.62 : R * rng.range(0.92, 1.05);
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      // snow resting on the sunlit (upper-left) boughs
      g.fillStyle = 'rgba(255,250,248,0.9)';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 1.25 + rng.range(-0.8, 0.8);
        const d = R * rng.range(0.45, 0.8);
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, R * 0.16, R * 0.09, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(-r * 0.05, -r * 0.05, r * 0.1, 0, Math.PI * 2);
    g.fill();
  });
}

function paintRock(rng, size) {
  const r = size / 2;
  return makeSprite(size * 1.5, size * 1.5, (g) => {
    g.fillStyle = 'rgba(70,95,160,0.28)';
    g.beginPath();
    g.ellipse(r * 0.3, r * 0.4, r * 1.0, r * 0.8, 0.4, 0, Math.PI * 2);
    g.fill();
    const pts = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const rr = r * rng.range(0.78, 1);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.88]);
    }
    const grad = g.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#9aa0b4');
    grad.addColorStop(0.55, '#5d6278');
    grad.addColorStop(1, '#383b4e');
    g.fillStyle = grad;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    // facets
    g.strokeStyle = 'rgba(30,32,48,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < n; i += 2) {
      g.moveTo(pts[i][0] * 0.3, pts[i][1] * 0.3);
      g.lineTo(pts[i][0], pts[i][1]);
    }
    g.stroke();
    // a cap of snow on top
    g.fillStyle = 'rgba(255,252,250,0.95)';
    g.beginPath();
    g.ellipse(-r * 0.22, -r * 0.3, r * 0.58, r * 0.36, -0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(200,215,245,0.8)';
    g.beginPath();
    g.ellipse(-r * 0.12, -r * 0.18, r * 0.4, r * 0.12, -0.3, 0, Math.PI);
    g.fill();
  });
}

// A skier seen from behind and above, heading up the screen. Drawn facing slightly right;
// the left twin is the same sprite, mirrored.
function paintSkier(jacket, jacketDark, hat) {
  return makeSprite(30, 44, (g) => {
    // shadow
    g.fillStyle = 'rgba(60,85,150,0.25)';
    g.beginPath();
    g.ellipse(0, 7, 10, 16, 0, 0, Math.PI * 2);
    g.fill();
    // skis
    for (const sx of [-4.5, 4.5]) {
      const sg = g.createLinearGradient(sx - 2, 0, sx + 2, 0);
      sg.addColorStop(0, '#1b2440');
      sg.addColorStop(0.5, '#3b4a78');
      sg.addColorStop(1, '#1b2440');
      g.fillStyle = sg;
      g.beginPath();
      g.roundRect(sx - 1.8, -20, 3.6, 40, 1.8);
      g.fill();
      g.fillStyle = '#ffd23a';
      g.fillRect(sx - 1.8, -19, 3.6, 3);
    }
    // poles
    g.strokeStyle = '#2b2f45';
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(-8, -2);
    g.lineTo(-13, 12);
    g.moveTo(8, -2);
    g.lineTo(13, 12);
    g.stroke();
    g.fillStyle = '#2b2f45';
    g.beginPath();
    g.arc(-13, 12, 1.8, 0, Math.PI * 2);
    g.arc(13, 12, 1.8, 0, Math.PI * 2);
    g.fill();
    // legs
    g.fillStyle = '#26304f';
    g.beginPath();
    g.roundRect(-7, 0, 5, 9, 2);
    g.roundRect(2, 0, 5, 9, 2);
    g.fill();
    // jacket
    const jg = g.createLinearGradient(-8, -10, 8, 6);
    jg.addColorStop(0, jacket);
    jg.addColorStop(1, jacketDark);
    g.fillStyle = jg;
    g.beginPath();
    g.ellipse(0, -2, 8.5, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    // arms
    g.beginPath();
    g.ellipse(-8, -2, 2.6, 4.2, 0.5, 0, Math.PI * 2);
    g.ellipse(8, -2, 2.6, 4.2, -0.5, 0, Math.PI * 2);
    g.fill();
    // a white stripe across the back
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(-7.5, -1, 15, 2.2);
    // highlight
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-3, -6, 4, 2, -0.4, 0, Math.PI * 2);
    g.fill();
    // head: a bobble hat
    g.fillStyle = hat;
    g.beginPath();
    g.arc(0.5, -11, 4.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(-4, -9.5, 9, 1.8);
    g.beginPath();
    g.arc(0.5, -15.6, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.arc(-1, -12.5, 1.6, 0, Math.PI * 2);
    g.fill();
  });
}

function paintMarker() {
  return makeSprite(10, 22, (g) => {
    g.fillStyle = 'rgba(70,95,160,0.25)';
    g.beginPath();
    g.ellipse(3, 8, 2.5, 5, 0.5, 0, Math.PI * 2);
    g.fill();
    const pg = g.createLinearGradient(-2, 0, 2, 0);
    pg.addColorStop(0, '#ff9a3a');
    pg.addColorStop(0.5, '#ffd08a');
    pg.addColorStop(1, '#e8641c');
    g.fillStyle = pg;
    g.beginPath();
    g.roundRect(-2, -9, 4, 18, 2);
    g.fill();
    g.fillStyle = '#1d2340';
    g.fillRect(-2, -3, 4, 2.2);
    g.fillRect(-2, 2, 4, 2.2);
  });
}

// ---------- game ----------

export default {
  id: 'twins',
  title: 'Twin Slalom',
  emoji: '⛷️',
  tagline: 'The twins mirror each other: steer one out and the other goes out too. Keep both of them clear of every pine and rock on their own half of the slope.',
  colors: { bg: '#e9eff9', fg: '#1b2748', accent: '#ff4f7e' },

  // Liquid drum & bass at 168 BPM in D minor: two-step breakbeat and a rolling bass from the
  // first bar, then icy pads and arps, a hook, and a double-time finish. 42 bars = 60s.
  music: {
    cps: 0.7,
    setup: `
      const kick = note("c2 ~ ~ ~ ~ ~ ~ ~ ~ ~ c2 ~ ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const snare = s("~ ~ ~ ~ pink ~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~").decay(0.13).sustain(0).hpf(900).lpf(6500).gain(0.24).room(0.2)
      const body = note("~ ~ ~ ~ d3 ~ ~ ~ ~ ~ ~ ~ d3 ~ ~ ~").s("triangle").decay(0.07).sustain(0).gain(0.28)
      const ghost = s("~ ~ ~ ~ ~ ~ ~ pink ~ pink ~ ~ ~ ~ ~ pink").decay(0.05).sustain(0).hpf(1500).lpf(6000).gain(0.08)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(6800).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.05]*4")
      const bass = note("<d2 as2 f2 c2>").struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").s("sawtooth")
        .decay(0.25).sustain(0.35).release(0.1).lpf(sine.range(350, 950).fast(2)).lpq(4).gain(0.38)
      const sub = note("<d2 as2 f2 c2>").s("sine").sustain(1).gain(0.25)
      const chords = "<[d3,f3,a3,c4] [as2,d3,f3,a3] [f3,a3,c4,e4] [c3,e3,g3,d4]>"
      const pad = note(chords).s("sawtooth").attack(0.4).release(0.8)
        .lpf(saw.range(500, 2000).slow(42)).gain(0.065).room(0.6).roomsize(5)
      const arp = note("<[d4 a4 f4 d5 a4 f4 c5 a4]*2 [as3 f4 d4 as4 f4 d4 a4 f4]*2 [f4 c5 a4 f5 c5 a4 e5 c5]*2 [c4 g4 e4 c5 g4 e4 d5 g4]*2>")
        .s("triangle").decay(0.09).sustain(0).lpf(3000).gain(0.1)
        .delay(0.25).delaytime(0.268).delayfeedback(0.35).pan(sine.range(0.3, 0.7).slow(2))
      const lead = note("<[a4 ~ ~ d5 ~ ~ c5 ~ a4 ~ ~ ~ f4 ~ g4 ~] [f4 ~ ~ as4 ~ ~ a4 ~ f4 ~ ~ ~ d4 ~ ~ ~] [c5 ~ ~ f5 ~ ~ e5 ~ c5 ~ ~ ~ a4 ~ c5 ~] [e5 ~ ~ d5 ~ ~ c5 ~ g4 ~ ~ ~ ~ ~ ~ ~]>")
        .s("square").decay(0.22).sustain(0.3).release(0.2).lpf(2300).gain(0.07).room(0.45)
        .delay(0.3).delaytime(0.536).delayfeedback(0.3)
      const bells = note("<[d6 a5 f6 a5]*2 [as5 f5 d6 f5]*2 [c6 a5 f6 a5]*2 [g5 e5 c6 e5]*2>").s("sine")
        .decay(0.07).sustain(0).gain(0.045).delay(0.35).delaytime(0.179).delayfeedback(0.4)
    `,
    song: `arrange(
      [6, stack(kick, snare, body, hats, bass, sub)],
      [12, stack(kick, snare, body, hats, bass, sub, pad, arp)],
      [12, stack(kick, snare, body, ghost, hats, bass, sub, pad, arp, lead)],
      [12, stack(kick, snare, body, ghost, hats16, bass, sub, pad, arp, lead, bells)]
    )`,
  },

  create({ rng, W, H }) {
    const CX = W / 2;
    const art = rng.fork('art');
    const snow = paintSnow(W, H, art);
    const pines = [paintPine(art, 30), paintPine(art, 36), paintPine(art, 42)];
    const rocks = [paintRock(art, 24), paintRock(art, 30)];
    const skierR = paintSkier('#ff4f7e', '#c2204f', '#ffb12a');
    const skierL = paintSkier('#ff4f7e', '#c2204f', '#ffb12a');
    const marker = paintMarker();
    const sunGlow = glowSprite('rgba(255,170,140,1)', 90);
    const pinkGlow = glowSprite('rgba(255,90,140,1)', 30);
    const vignette = vignetteSprite(W, H, 0.35, '30,45,100');

    // how far the slope has scrolled at any moment: depends only on time, so obstacles can be
    // planned in advance
    const speedAt = (t) => lerp(230, 410, progress(t, 60, 1.25));
    const distTable = [0];
    for (let i = 1; i <= 64 * 120; i++) distTable.push(distTable[i - 1] + speedAt((i - 0.5) * STEP) * STEP);
    const distAt = (t) => {
      const f = clamp(t / STEP, 0, distTable.length - 1);
      const i = Math.floor(f);
      return lerp(distTable[i], distTable[Math.min(i + 1, distTable.length - 1)], f - i);
    };

    const twin = createMover({ x: 70, minX: DMIN, maxX: DMAX, speed: SPEED, accel: 20 }); // x is the spread d
    const fx = createParticles();
    const flurry = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, sp: 30 + Math.random() * 50, ph: Math.random() * 6.28 }));
    const obstacles = []; // { s: world distance, d, side: -1 | 1, r, art, kind }
    const tracks = [[], []]; // ski tracks for the left and right twin: { x, s }

    let dist = 0;
    let clock = 0;
    let lastT = 0;
    let lastD = 70;
    let heading = 1;
    let crashed = 0; // -1 or 1 once a twin has fallen
    let tumble = 0;

    function addObstacle(T, side, d, big, kind) {
      const r = kind === 'rock' ? (big ? 13 : 10) : big ? 15 : 12;
      const sprite = kind === 'rock' ? rocks[big ? 1 : 0] : pines[big ? 2 : rng.int(0, 1)];
      obstacles.push({ s: distAt(T), d, side, r, kind, sprite });
    }

    // The planned safe spread for every row keeps a run always possible; everything else on
    // both halves is fair game for trees and rocks.
    function plan(until) {
      while (lastT < until) {
        const first = lastT === 0;
        const p = progress(lastT, 60, 1.3);
        const dT = first ? 3 : lerp(0.72, 0.36, p) * rng.range(0.85, 1.15);
        const T = lastT + dT;
        if (rng.chance(lerp(0.3, 0.5, p))) heading = -heading;
        const ratio = rng.range(lerp(0.15, 0.4, p), lerp(0.55, 0.78, p));
        let D = lastD + heading * ratio * REACH * dT;
        if (D < 30 || D > 150) {
          heading = -heading;
          D = lastD + heading * ratio * REACH * dT;
        }
        D = clamp(D, 30, 150);
        const v = speedAt(T);
        const drift = ratio * REACH * ((R_SKI + 16) / v);
        const safe = (d, r) => Math.abs(d - D) > r + R_SKI + 7 + drift && Math.abs(d - lastD) > r + R_SKI + 3;

        if (!first) {
          if (T > 8 && rng.chance(lerp(0.08, 0.35, p))) {
            // a fence of pines across one half, with only the planned gap open
            const side = rng.chance(0.5) ? -1 : 1;
            for (let d = 14; d <= 176; d += 24) {
              const dd = d + rng.range(-3, 3);
              if (safe(dd, 13)) addObstacle(T, side, dd, false, 'pine');
            }
            if (rng.chance(0.6)) {
              const dd = rng.range(20, 170);
              if (safe(dd, 15)) addObstacle(T, -side, dd, true, rng.chance(0.5) ? 'rock' : 'pine');
            }
          } else {
            const n = Math.round(lerp(1.4, 3.6, p) + rng.range(-0.5, 0.5));
            for (let k = 0, tries = 0; k < n && tries < 12; tries++) {
              const side = rng.chance(0.5) ? -1 : 1;
              const big = rng.chance(0.4);
              const kind = rng.chance(0.35) ? 'rock' : 'pine';
              const r = kind === 'rock' ? (big ? 13 : 10) : big ? 15 : 12;
              const d = rng.range(18, 172);
              if (!safe(d, r)) continue;
              addObstacle(T, side, d, big, kind);
              k++;
            }
          }
        }
        lastT = T;
        lastD = D;
      }
    }

    plan(6);

    const xOf = (side, d) => CX + side * d;

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        plan(t + 4);
        dist += speedAt(t) * dt;
        twin.update(dt, dir);
        const d = twin.x;

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          const y = SKI_Y - (o.s - dist);
          if (y > H + 50) {
            obstacles.splice(i, 1);
            continue;
          }
          if (Math.abs(y - SKI_Y) < o.r * 0.8 + R_SKI && Math.abs(o.d - d) < o.r + R_SKI) {
            this.dead = true;
            crashed = o.side;
            const who = o.side < 0 ? 'left' : 'right';
            this.deathReason = `The ${who} twin skied into a ${o.kind === 'rock' ? 'rock' : 'pine tree'}.`;
            const x = xOf(o.side, d);
            fx.burst(x, SKI_Y, { count: 60, speed: 220, life: 1.1, size: 4, round: true, drag: 2, colors: ['#ffffff', '#e4ecfb', '#c8d6f5'] });
            fx.burst(x, SKI_Y, { count: 14, speed: 140, life: 0.9, size: 3, drag: 1.5, colors: ['#ff4f7e', '#ffb12a', '#2a6a4c'] });
            break;
          }
        }

        // ski tracks and powder spray (cosmetic)
        for (const [i, side] of [[0, -1], [1, 1]]) {
          const tr = tracks[i];
          if (!tr.length || dist - tr[tr.length - 1].s > 6) tr.push({ x: xOf(side, d), s: dist });
          while (tr.length && dist - tr[0].s > 620) tr.shift();
          const turn = Math.abs(twin.vx) / SPEED;
          if (turn > 0.35 && Math.random() < turn * 0.9) {
            fx.burst(xOf(side, d) - side * Math.sign(twin.vx) * 6, SKI_Y + 14, { count: 1, speed: 70, life: 0.45, size: 3, round: true, drag: 3, angle: Math.PI / 2 - side * Math.sign(twin.vx) * 0.9, spread: 0.8, colors: ['#ffffff', '#dfe8fb'] });
          }
        }
        fx.update(dt, speedAt(t) * 0.5);
      },

      afterlife(dt) {
        clock += dt;
        tumble += dt;
        fx.update(dt, 40);
      },

      render(g) {
        // scrolling snow
        const off = dist % H;
        drawSprite(g, snow, W / 2, H / 2 + off);
        drawSprite(g, snow, W / 2, H / 2 + off - H);

        // sunrise glare from the top
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W * 0.82, -10, { size: 420, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';

        // the centre line: a shimmering mirror seam lined with marker poles
        const seam = g.createLinearGradient(CX - 10, 0, CX + 10, 0);
        seam.addColorStop(0, 'rgba(160,190,255,0)');
        seam.addColorStop(0.5, `rgba(160,190,255,${0.22 + 0.08 * Math.sin(clock * 3)})`);
        seam.addColorStop(1, 'rgba(160,190,255,0)');
        g.fillStyle = seam;
        g.fillRect(CX - 10, 0, 20, H);
        for (let y = (dist % 80) - 80; y < H + 20; y += 80) drawSprite(g, marker, CX, y);

        // ski tracks
        g.strokeStyle = 'rgba(120,145,205,0.35)';
        g.lineWidth = 1.4;
        g.beginPath();
        for (const tr of tracks) {
          for (const off of [-4.5, 4.5]) {
            tr.forEach((p, i) => {
              const y = SKI_Y + 12 + (dist - p.s);
              if (i) g.lineTo(p.x + off, y);
              else g.moveTo(p.x + off, y);
            });
          }
        }
        g.stroke();

        // obstacles (the ones already behind the twins are drawn under them)
        for (const o of obstacles) {
          const y = SKI_Y - (o.s - dist);
          if (y < -40) continue;
          const size = o.r * 2 * 1.5 * (o.kind === 'rock' ? 1.3 : 1.25);
          drawSprite(g, o.sprite, xOf(o.side, o.d), y, { size, });
        }

        // the twins
        const d = twin.x;
        const lean = twin.lean;
        for (const side of [-1, 1]) {
          const x = xOf(side, d);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, pinkGlow, x, SKI_Y, { size: 50, alpha: 0.28 });
          g.globalCompositeOperation = 'source-over';
          const down = this.dead && side === crashed;
          const rot = down ? tumble * 7 : lean * 0.35; // the mirror flips the left twin's lean for us
          g.save();
          g.translate(x, SKI_Y + (down ? tumble * 40 : 0));
          if (side < 0) g.scale(-1, 1);
          drawSprite(g, side < 0 ? skierL : skierR, 0, 0, { size: 34, rot, alpha: down ? Math.max(0, 1 - tumble * 0.7) : 1 });
          g.restore();
        }

        fx.render(g);

        // falling flurries
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (const f of flurry) {
          const y = (f.y + clock * f.sp + dist * 0.15) % (H + 10);
          const x = (f.x + Math.sin(clock + f.ph) * 10 + W) % W;
          g.beginPath();
          g.arc(x, y, f.r, 0, Math.PI * 2);
          g.fill();
        }

        // haze toward the top of the slope
        const haze = g.createLinearGradient(0, 0, 0, 170);
        haze.addColorStop(0, 'rgba(255,236,236,0.55)');
        haze.addColorStop(1, 'rgba(255,236,236,0)');
        g.fillStyle = haze;
        g.fillRect(0, 0, W, 170);

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
