// Storm Rider — a lone motorbike on a forest road at midnight, in a thunderstorm. The headlight
// only reaches a short way; every lightning strike lights up the whole road for a heartbeat, and
// you have to remember where the rocks, fallen logs and startled deer were before the dark comes back.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  circleRect,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const BIKE_Y = 540;
const BIKE_HW = 7; // the bike's hit box: half width and half length
const BIKE_HH = 16;
const ROAD_L = 38; // the tarmac between the two tree lines
const ROAD_R = 322;
const SPEED = 300;
const REACH = 215; // what we assume a player really covers per second when planning the road
const STEP = 1 / 120;
const LOG_LENGTHS = [50, 80, 110, 140, 170, 200, 230];

// ---------- art ----------

function paintRoad(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // everything is also drawn one tile up and down so the scrolling tile has no seam
    const wrap = (y, draw) => [-H, 0, H].forEach((o) => draw(y + o));

    // wet asphalt, a touch brighter down the crown of the road
    const tar = g.createLinearGradient(ROAD_L, 0, ROAD_R, 0);
    tar.addColorStop(0, '#1a2426');
    tar.addColorStop(0.5, '#2a3638');
    tar.addColorStop(1, '#1a2426');
    g.fillStyle = tar;
    g.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.18)';
      const s = rng.range(0.6, 1.8);
      g.fillRect(rng.range(ROAD_L, ROAD_R), rng.range(0, H), s, s);
    }
    // puddles that catch the sky
    for (let i = 0; i < 9; i++) {
      const x = rng.range(ROAD_L + 20, ROAD_R - 20);
      const rx = rng.range(14, 34);
      const ry = rx * rng.range(0.35, 0.6);
      wrap(rng.range(0, H), (y) => {
        const p = g.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
        p.addColorStop(0, 'rgba(120,160,190,0.22)');
        p.addColorStop(0.5, 'rgba(60,90,110,0.12)');
        p.addColorStop(1, 'rgba(150,190,220,0.25)');
        g.fillStyle = p;
        g.beginPath();
        g.ellipse(x, y, rx, ry, rng.range(-0.3, 0.3), 0, Math.PI * 2);
        g.fill();
      });
    }
    // cracks
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      let x = rng.range(ROAD_L + 10, ROAD_R - 10);
      const y0 = rng.range(0, H);
      const pts = [];
      let y = y0;
      for (let k = 0; k < 5; k++) {
        pts.push([x, y]);
        x += rng.range(-8, 8);
        y += rng.range(4, 12);
      }
      wrap(0, (o) => {
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py + o) : g.moveTo(px, py + o)));
        g.stroke();
      });
    }
    // painted edge lines and a dashed centre line (80px period, so it tiles)
    g.fillStyle = 'rgba(225,230,220,0.55)';
    g.fillRect(ROAD_L + 4, 0, 3, H);
    g.fillRect(ROAD_R - 7, 0, 3, H);
    g.fillStyle = 'rgba(255,200,80,0.6)';
    for (let y = 0; y < H; y += 80) g.fillRect(W / 2 - 2, y, 4, 40);

    // verges: soaked grass, then the forest canopy seen from above
    for (const [x0, x1] of [[0, ROAD_L], [ROAD_R, W]]) {
      const grass = g.createLinearGradient(x0, 0, x1, 0);
      grass.addColorStop(0, '#0f1f16');
      grass.addColorStop(1, '#172b1f');
      g.fillStyle = grass;
      g.fillRect(x0, 0, x1 - x0, H);
    }
    for (let i = 0; i < 60; i++) {
      const left = i % 2 === 0;
      const x = left ? rng.range(-26, ROAD_L - 8) : rng.range(ROAD_R + 8, W + 26);
      const r = rng.range(16, 30);
      wrap(rng.range(0, H), (y) => {
        const c = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
        c.addColorStop(0, rng.chance(0.5) ? '#2f5a3c' : '#284e36');
        c.addColorStop(0.7, '#15301f');
        c.addColorStop(1, 'rgba(8,20,12,0.9)');
        g.fillStyle = c;
        g.beginPath();
        for (let k = 0; k <= 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const rr = r * (k % 2 ? 0.86 : 1);
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      });
    }
  }, 1);
}

function paintRock(rng, r) {
  const size = r * 2 + 10;
  return makeSprite(size, size, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(3, 4, r * 1.02, r * 0.86, 0.3, 0, Math.PI * 2);
    g.fill();
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const rr = r * rng.range(0.8, 1);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.9]);
    }
    const body = g.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, '#9aa3a8');
    body.addColorStop(0.5, '#5c6469');
    body.addColorStop(1, '#2c3134');
    g.fillStyle = body;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,24,28,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < n; i += 2) {
      g.moveTo(pts[i][0] * 0.25, pts[i][1] * 0.25);
      g.lineTo(pts[i][0], pts[i][1]);
    }
    g.stroke();
    // moss and a wet sheen
    g.fillStyle = 'rgba(80,120,60,0.55)';
    g.beginPath();
    g.ellipse(r * 0.3, r * 0.35, r * 0.4, r * 0.22, 0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(220,235,255,0.45)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.4, r * 0.35, r * 0.12, -0.6, 0, Math.PI * 2);
    g.fill();
  });
}

// A fallen trunk lying across the road from the left verge; its sawn end points into the road.
function paintLog(rng, L) {
  return makeSprite(L + 10, 28, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.roundRect(-L / 2 + 3, -7, L, 18, 8);
    g.fill();
    const bark = g.createLinearGradient(0, -9, 0, 9);
    bark.addColorStop(0, '#7a5634');
    bark.addColorStop(0.45, '#4d331d');
    bark.addColorStop(1, '#23160b');
    g.fillStyle = bark;
    g.beginPath();
    g.roundRect(-L / 2, -9, L, 18, 8);
    g.fill();
    g.strokeStyle = 'rgba(20,12,4,0.6)';
    g.lineWidth = 1;
    for (let i = 0; i < L / 6; i++) {
      const x = rng.range(-L / 2 + 4, L / 2 - 10);
      const y = rng.range(-7, 7);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(8, 20), y + rng.range(-1, 1));
      g.stroke();
    }
    // knots, broken branch stubs and moss
    for (let i = 0; i < L / 40; i++) {
      const x = rng.range(-L / 2 + 8, L / 2 - 14);
      g.fillStyle = '#2a1a0c';
      g.beginPath();
      g.ellipse(x, rng.range(-4, 4), 3, 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a3d22';
      const up = rng.chance(0.5) ? -1 : 1;
      g.fillRect(x + 4, up < 0 ? -14 : 8, 3, 6);
    }
    g.fillStyle = 'rgba(90,130,60,0.5)';
    for (let i = 0; i < L / 30; i++) {
      g.beginPath();
      g.ellipse(rng.range(-L / 2 + 6, L / 2 - 12), rng.range(-6, -1), rng.range(4, 9), 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(210,230,255,0.25)';
    g.fillRect(-L / 2 + 6, -7, L - 14, 1.6);
    // the sawn end, with its rings
    const ex = L / 2 - 3;
    g.fillStyle = '#c9a06a';
    g.beginPath();
    g.ellipse(ex, 0, 4, 8.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(110,70,30,0.8)';
    g.lineWidth = 0.7;
    for (const k of [0.3, 0.55, 0.8]) {
      g.beginPath();
      g.ellipse(ex, 0, 4 * k, 8.6 * k, 0, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

// A deer frozen in the road, seen from above, facing right, head turned to the headlight.
function paintDeer() {
  return makeSprite(52, 30, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(2, 4, 21, 8, 0, 0, Math.PI * 2);
    g.fill();
    // legs peeking out
    g.fillStyle = '#3d2614';
    for (const [x, y] of [[-12, -8], [-12, 7], [9, -8], [9, 7]]) {
      g.beginPath();
      g.ellipse(x, y, 2, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    const body = g.createLinearGradient(0, -8, 0, 8);
    body.addColorStop(0, '#b27a48');
    body.addColorStop(0.5, '#8e5a30');
    body.addColorStop(1, '#5e3a1c');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(-2, 0, 17, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    // white rump and tail
    g.fillStyle = '#efe4d2';
    g.beginPath();
    g.ellipse(-17, 0, 3.4, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    // spots
    g.fillStyle = 'rgba(245,230,200,0.6)';
    for (const [x, y] of [[-8, -3], [-3, -4], [2, -3], [-6, 1], [4, 0]]) {
      g.beginPath();
      g.arc(x, y, 1, 0, Math.PI * 2);
      g.fill();
    }
    // neck and head, turned down towards the rider
    g.fillStyle = '#8e5a30';
    g.beginPath();
    g.ellipse(15, 2, 5, 4, 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9c6536';
    g.beginPath();
    g.ellipse(19, 6, 4.2, 5.4, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(20, 10.5, 1.5, 0, Math.PI * 2);
    g.fill();
    // ears and small antlers
    g.fillStyle = '#7a4a26';
    g.beginPath();
    g.ellipse(14.5, 3, 2, 4, -0.8, 0, Math.PI * 2);
    g.ellipse(23.5, 3, 2, 4, 0.8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8c8a8';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(17, 2);
    g.lineTo(15, -5);
    g.lineTo(12, -8);
    g.moveTo(15, -5);
    g.lineTo(17, -9);
    g.moveTo(21, 2);
    g.lineTo(23, -5);
    g.lineTo(26, -8);
    g.moveTo(23, -5);
    g.lineTo(21, -9);
    g.stroke();
  });
}

// The rider on a motorbike, seen from above, heading up the screen.
function paintBike() {
  return makeSprite(30, 50, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(2, 3, 9, 22, 0, 0, Math.PI * 2);
    g.fill();
    // tyres
    g.fillStyle = '#111416';
    g.beginPath();
    g.roundRect(-3, 10, 6, 14, 3);
    g.roundRect(-2.5, -23, 5, 12, 2.5);
    g.fill();
    // mudguards and frame
    g.fillStyle = '#b8bec4';
    g.beginPath();
    g.roundRect(-3.2, -20, 6.4, 5, 2);
    g.fill();
    const tank = g.createLinearGradient(-6, 0, 6, 0);
    tank.addColorStop(0, '#8a1414');
    tank.addColorStop(0.45, '#e8402a');
    tank.addColorStop(1, '#7a1010');
    g.fillStyle = tank;
    g.beginPath();
    g.ellipse(0, -8, 5.6, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-2, -10, 1.4, 3.6, 0, 0, Math.PI * 2);
    g.fill();
    // seat and tail
    g.fillStyle = '#2a1a14';
    g.beginPath();
    g.roundRect(-4, 0, 8, 12, 3);
    g.fill();
    g.fillStyle = '#e8402a';
    g.beginPath();
    g.roundRect(-3.5, 12, 7, 5, 2);
    g.fill();
    g.fillStyle = '#ff3030';
    g.fillRect(-2.2, 16.5, 4.4, 1.6);
    // handlebars and mirrors
    g.strokeStyle = '#c9cfd6';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-11, -12);
    g.quadraticCurveTo(0, -15, 11, -12);
    g.stroke();
    g.fillStyle = '#20252a';
    g.beginPath();
    g.arc(-12, -12, 1.8, 0, Math.PI * 2);
    g.arc(12, -12, 1.8, 0, Math.PI * 2);
    g.fill();
    // rider: arms, rain jacket, helmet
    g.fillStyle = '#e8a412';
    g.beginPath();
    g.ellipse(-7.5, -7, 2.4, 5, 0.35, 0, Math.PI * 2);
    g.ellipse(7.5, -7, 2.4, 5, -0.35, 0, Math.PI * 2);
    g.fill();
    const coat = g.createRadialGradient(-2, -2, 1, 0, 0, 10);
    coat.addColorStop(0, '#ffd24a');
    coat.addColorStop(1, '#c47d06');
    g.fillStyle = coat;
    g.beginPath();
    g.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(210,235,255,0.85)';
    g.fillRect(-7.5, 2, 15, 1.6); // reflective stripe
    const helmet = g.createRadialGradient(-1.5, -6.5, 0.5, 0, -5, 5);
    helmet.addColorStop(0, '#ffffff');
    helmet.addColorStop(0.4, '#e9eef2');
    helmet.addColorStop(1, '#8e9aa4');
    g.fillStyle = helmet;
    g.beginPath();
    g.arc(0, -5, 4.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8402a';
    g.fillRect(-0.9, -9.6, 1.8, 9);
    // the lamp
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.arc(0, -17.5, 2.2, 0, Math.PI * 2);
    g.fill();
  });
}

// A pale-blue afterimage of a sprite: a glowing rim and a faint fill.
function ghostOf(sprite) {
  const { w, h } = sprite;
  return makeSprite(w + 4, h + 4, (g) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.drawImage(sprite.canvas, -w / 2 + Math.cos(a) * 1.5, -h / 2 + Math.sin(a) * 1.5, w, h);
    }
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = 'rgba(170,215,255,1)';
    g.fillRect(-w, -h, w * 2, h * 2);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 0.8;
    g.drawImage(sprite.canvas, -w / 2, -h / 2, w, h);
  });
}

// The night: black everywhere except the headlight's cone and a little pool around the bike.
// Twice the screen wide, centred on the bike, so it can slide with it.
function paintDarkness(W, H) {
  return makeSprite(W * 2, H, (g) => {
    g.fillStyle = 'rgb(2,5,8)';
    g.fillRect(-W, -H / 2, W * 2, H);
    g.globalCompositeOperation = 'destination-out';
    const by = BIKE_Y - H / 2;
    const cone = (spread, reach, alpha) => {
      const grad = g.createRadialGradient(0, by - 14, 4, 0, by - 14, reach);
      grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.8})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-7, by - 14);
      g.lineTo(-spread, by - reach);
      g.quadraticCurveTo(0, by - reach - 30, spread, by - reach);
      g.lineTo(7, by - 14);
      g.closePath();
      g.fill();
    };
    cone(95, 270, 0.35);
    cone(78, 255, 0.45);
    cone(62, 240, 0.7);
    const pool = g.createRadialGradient(0, by, 2, 0, by, 58);
    pool.addColorStop(0, 'rgba(0,0,0,0.75)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pool;
    g.fillRect(-60, by - 60, 120, 120);
  }, 1);
}

// ---------- game ----------

export default {
  id: 'storm',
  title: 'Storm Rider',
  emoji: '🌩️',
  tagline: 'Ride a pitch-dark forest road through a thunderstorm and steer around every rock, fallen log and deer. Your headlight barely reaches ahead, so remember what each lightning flash shows you.',
  colors: { bg: '#0a1215', fg: '#e8f2ff', accent: '#ffc24a' },

  // Dark electro / industrial techno at 136 BPM in F minor (Fm – Db – Eb – C): a pounding kick,
  // rolling 16th bass and a brown-noise thunder rumble from the first bar, then stabs, an acid
  // lead and a double-time finish. 34 bars = 60s.
  music: {
    cps: 34 / 60,
    setup: `
      const kick = note("f2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const thunder = s("<brown ~ ~ ~>").attack(0.25).decay(1.6).sustain(0).lpf(380).gain(0.3)
      const bass = note("<f2 db2 eb2 c2>").struct("~ x x x ~ x x x ~ x x x ~ x x x").s("sawtooth")
        .decay(0.1).sustain(0.05).release(0.04).lpf(saw.range(400, 1300).slow(34)).lpq(6).gain(0.34)
      const hats = s("[~ white]*4").decay(0.035).sustain(0).hpf(6800).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const clap = s("~ pink ~ pink").decay(0.14).sustain(0).hpf(1200).lpf(5500).gain(0.16).room(0.45).roomsize(4)
      const chords = "<[f3,ab3,c4] [db3,f3,ab3] [eb3,g3,bb3] [c3,e3,g3]>"
      const stab = note(chords).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ x ~ ~").s("sawtooth")
        .decay(0.16).sustain(0).lpf(saw.range(900, 2400).slow(34)).gain(0.08).room(0.5).roomsize(5)
      const pad = note(chords).s("sawtooth").attack(0.5).release(0.8).lpf(900).gain(0.05).room(0.6).roomsize(6)
      const acid = note("<[f3 f4 c4 ab3 f4 c4 eb4 f3]*2 [db3 db4 ab3 f3 db4 ab3 c4 db3]*2 [eb3 eb4 bb3 g3 eb4 bb3 db4 eb3]*2 [c3 c4 g3 e3 c4 g3 bb3 c3]*2>")
        .s("square").decay(0.09).sustain(0).lpf(sine.range(700, 2200).slow(4)).lpq(8).gain(0.07)
        .delay(0.2).delaytime(0.331).delayfeedback(0.3)
      const lead = note("<[c5 ~ ~ ab4 ~ ~ f4 ~ c5 ~ db5 ~ c5 ~ ~ ~] [ab4 ~ ~ f4 ~ ~ db4 ~ ab4 ~ bb4 ~ ab4 ~ ~ ~] [bb4 ~ ~ g4 ~ ~ eb4 ~ bb4 ~ c5 ~ db5 ~ ~ ~] [c5 ~ ~ e4 ~ ~ g4 ~ bb4 ~ ~ ~ ~ ~ ~ ~]>")
        .s("sawtooth").decay(0.25).sustain(0.3).release(0.2).lpf(2000).gain(0.07).room(0.5)
        .delay(0.3).delaytime(0.662).delayfeedback(0.3)
      const zaps = note("<[f6 c6]*4 [ab5 f5]*4 [bb5 g5]*4 [e6 c6]*4>").s("sine")
        .decay(0.05).sustain(0).gain(0.04).delay(0.35).delaytime(0.165).delayfeedback(0.4)
    `,
    song: `arrange(
      [6, stack(kick, thunder, bass, hats)],
      [10, stack(kick, thunder, bass, hats, clap, stab, pad)],
      [9, stack(kick, thunder, bass, hats, clap, stab, pad, acid)],
      [9, stack(kick, thunder, bass, hats16, clap, stab, pad, acid, lead, zaps)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const sky = rng.fork('sky');
    const road = paintRoad(W, H, art);
    const rocks = [10, 13, 16].map((r) => paintRock(art, r));
    const logs = LOG_LENGTHS.map((L) => paintLog(art, L));
    const deerArt = paintDeer();
    const bikeArt = paintBike();
    const ghosts = new Map([...rocks, ...logs, deerArt].map((s) => [s, ghostOf(s)]));
    const darkness = paintDarkness(W, H);
    const lampGlow = glowSprite('rgba(255,210,120,1)', 60);
    const tailGlow = glowSprite('rgba(255,40,30,1)', 20);
    const eyeGlow = glowSprite('rgba(190,255,150,1)', 10);
    const boltGlow = glowSprite('rgba(170,200,255,1)', 80);
    const vignette = vignetteSprite(W, H, 0.6, '0,0,0');

    // how far the road has scrolled at any moment: depends only on time, so it can be planned ahead
    const speedAt = (t) => lerp(280, 530, progress(t, 60, 1.2));
    const distTable = [0];
    for (let i = 1; i <= 64 * 120; i++) distTable.push(distTable[i - 1] + speedAt((i - 0.5) * STEP) * STEP);
    const distAt = (t) => {
      const f = clamp(t / STEP, 0, distTable.length - 1);
      const i = Math.floor(f);
      return lerp(distTable[i], distTable[Math.min(i + 1, distTable.length - 1)], f - i);
    };

    const bike = createMover({ x: W / 2, minX: ROAD_L + 12, maxX: ROAD_R - 12, speed: SPEED, accel: 20 });
    const fx = createParticles();
    const obstacles = []; // { s, x, hw, hh, kind, sprite, flip, lit }
    const rain = Array.from({ length: 90 }, () => ({ x: Math.random() * (W + 80) - 40, y: Math.random() * H, len: 8 + Math.random() * 14, sp: 700 + Math.random() * 400 }));

    let dist = 0;
    let clock = 0;
    let lastT = 0;
    let lastX = W / 2;
    let heading = rng.chance(0.5) ? 1 : -1;
    let tumble = 0;
    let deathLight = 0;

    // ---- lightning: planned from time alone, often enough that every obstacle gets lit on its way down
    const flashes = [];
    let nextFlash = 0.35;
    let fi = 0;
    let bolt = null; // cosmetic: the jagged line of the latest strike
    function planFlashes(until) {
      while (nextFlash < until) {
        flashes.push(nextFlash);
        const cap = (0.62 * BIKE_Y) / speedAt(nextFlash);
        nextFlash += Math.min(cap, sky.range(1.1, 1.8));
      }
    }
    function flashLevel(t) {
      let level = 0;
      for (let k = Math.max(0, fi - 2); k < fi; k++) {
        const a = t - flashes[k];
        if (a < 0) continue;
        let l = a < 0.05 ? 1 : 0.85 * Math.exp(-(a - 0.05) * 4.5);
        if (a > 0.13 && a < 0.2) l = Math.max(l, 0.8); // the second strike
        level = Math.max(level, l);
      }
      return level;
    }
    function makeBolt() {
      const x0 = Math.random() * W;
      const main = [[x0, -10]];
      let x = x0;
      const end = 120 + Math.random() * 260;
      for (let y = -10; y < end; ) {
        y += 14 + Math.random() * 22;
        x += (Math.random() - 0.5) * 40;
        main.push([x, y]);
      }
      const forks = [];
      for (let k = 0; k < 2; k++) {
        const [fx0, fy0] = main[1 + ((Math.random() * (main.length - 2)) | 0)];
        const f = [[fx0, fy0]];
        let px = fx0;
        let py = fy0;
        const dirx = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 4; i++) {
          px += dirx * (8 + Math.random() * 18);
          py += 10 + Math.random() * 18;
          f.push([px, py]);
        }
        forks.push(f);
      }
      return { lines: [main, ...forks], x: x0, y: end / 2 };
    }

    // ---- the road: a safe line weaves between rows of rocks, logs and deer
    function add(T, o) {
      obstacles.push({ s: distAt(T), lit: -99, flip: false, ...o });
    }
    function addRock(T, x, big) {
      const k = big ? 2 : rng.int(0, 1);
      const r = [10, 13, 16][k];
      add(T, { x, hw: r, hh: r, r, kind: 'rock', sprite: rocks[k] });
    }
    function logFits(maxLen) {
      let best = -1;
      LOG_LENGTHS.forEach((L, k) => L <= maxLen && (best = k));
      return best;
    }
    function addLog(T, side, k) {
      const L = LOG_LENGTHS[k];
      const x = side < 0 ? ROAD_L - 6 + L / 2 : ROAD_R + 6 - L / 2;
      add(T, { x, hw: L / 2, hh: 8, kind: 'log', sprite: logs[k], flip: side > 0 });
    }

    function plan(until) {
      while (lastT < until) {
        const first = lastT === 0;
        const p = progress(lastT, 60, 1.3);
        const dT = first ? 2.6 : lerp(0.68, 0.32, p) * rng.range(0.85, 1.15);
        const T = lastT + dT;
        if (rng.chance(lerp(0.4, 0.6, p))) heading = -heading;
        const ratio = rng.range(lerp(0.25, 0.5, p), lerp(0.65, 0.9, p));
        let X = lastX + heading * ratio * REACH * dT;
        if (X < 72 || X > 288) {
          heading = -heading;
          X = lastX + heading * ratio * REACH * dT;
        }
        X = clamp(X, 72, 288);
        const drift = ratio * REACH * ((BIKE_HH + 12) / speedAt(T));
        const safe = (x, hw) => Math.abs(x - X) > hw + BIKE_HW + 8 + drift && Math.abs(x - lastX) > hw + BIKE_HW + 4;
        const lo = Math.min(X, lastX) - (BIKE_HW + 10 + drift);
        const hi = Math.max(X, lastX) + (BIKE_HW + 10 + drift);

        if (!first) {
          const roll = rng.next();
          if (T > 4 && roll < lerp(0.22, 0.42, p)) {
            // fallen trees: from one verge, or from both late on, leaving the safe line open
            const both = T > 15 && rng.chance(0.55);
            const sides = both ? [-1, 1] : [rng.chance(0.5) ? -1 : 1];
            for (const side of sides) {
              const k = logFits(side < 0 ? lo - (ROAD_L - 6) : ROAD_R + 6 - hi);
              if (k >= 0) addLog(T, side, k);
            }
          } else if (T > 7 && roll < lerp(0.22, 0.42, p) + 0.14) {
            for (let tries = 0; tries < 6; tries++) {
              const x = rng.range(ROAD_L + 24, ROAD_R - 24);
              if (!safe(x, 20)) continue;
              add(T, { x, hw: 18, hh: 8, kind: 'deer', sprite: deerArt, flip: rng.chance(0.5) });
              break;
            }
          } else {
            const n = Math.round(lerp(2, 3.8, p) + rng.range(-0.5, 0.5));
            for (let k = 0, tries = 0; k < n && tries < 12; tries++) {
              const big = rng.chance(0.35);
              const x = rng.range(ROAD_L + 16, ROAD_R - 16);
              if (!safe(x, big ? 16 : 13)) continue;
              addRock(T, x, big);
              k++;
            }
          }
        }
        lastT = T;
        lastX = X;
      }
    }

    plan(6);
    planFlashes(4);

    const yOf = (o) => BIKE_Y - (o.s - dist);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        plan(t + 4);
        planFlashes(t + 3);
        dist += speedAt(t) * dt;
        bike.update(dt, dir);

        // lightning: everything on screen right now is burnt into your eyes for a moment
        while (fi < flashes.length && flashes[fi] <= t) {
          for (const o of obstacles) if (yOf(o) > -40) o.lit = flashes[fi];
          bolt = makeBolt();
          fi++;
        }

        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          const y = yOf(o);
          if (y > H + 60) {
            obstacles.splice(i, 1);
            continue;
          }
          const hit =
            o.kind === 'rock'
              ? circleRect(o.x, y, o.r * 0.9, bike.x - BIKE_HW, BIKE_Y - BIKE_HH, BIKE_HW * 2, BIKE_HH * 2)
              : Math.abs(o.x - bike.x) < o.hw + BIKE_HW - 2 && Math.abs(y - BIKE_Y) < o.hh + BIKE_HH - 2;
          if (hit) {
            this.dead = true;
            this.deathReason =
              o.kind === 'rock' ? 'Hit a rock in the dark.' : o.kind === 'log' ? 'Ran into a fallen tree.' : 'Swerved too late for a startled deer.';
            deathLight = 1;
            fx.burst(bike.x, BIKE_Y - 14, { count: 40, speed: 240, life: 0.9, size: 2.6, drag: 2, colors: ['#ffe08a', '#ffb030', '#ffffff'] });
            fx.burst(bike.x, BIKE_Y, { count: 24, speed: 150, life: 1.1, size: 3.4, drag: 1.5, colors: ['#e8402a', '#ffd24a', '#8e9aa4', '#1a1f24'] });
            break;
          }
        }

        // spray off the back wheel on the wet road (cosmetic)
        if (Math.random() < 0.6) {
          fx.burst(bike.x + (Math.random() - 0.5) * 6, BIKE_Y + 20, { count: 1, speed: 60, life: 0.35, size: 2.4, round: true, drag: 3, angle: Math.PI / 2, spread: 1.2, colors: ['rgba(200,220,240,0.7)'] });
        }
        fx.update(dt, speedAt(t) * 0.4);
      },

      afterlife(dt) {
        clock += dt;
        tumble += dt;
        deathLight = Math.max(0, deathLight - dt * 0.6);
        fx.update(dt, 20);
      },

      render(g) {
        const level = Math.max(flashLevel(clock), deathLight * 0.6);

        // the road, then everything on it (under the dark)
        const off = dist % H;
        drawSprite(g, road, W / 2, H / 2 + off);
        drawSprite(g, road, W / 2, H / 2 + off - H);
        for (const o of obstacles) {
          const y = yOf(o);
          if (y < -40) continue;
          if (o.flip) {
            g.save();
            g.translate(o.x, y);
            g.scale(-1, 1);
            drawSprite(g, o.sprite, 0, 0);
            g.restore();
          } else drawSprite(g, o.sprite, o.x, y);
        }

        const down = this.dead;
        const bx = bike.x + (down ? tumble * 30 * Math.sign(bike.vx || 1) : 0);
        const by = BIKE_Y + (down ? tumble * 20 : 0);
        drawSprite(g, bikeArt, bx, by, { rot: down ? tumble * 5 : bike.lean * 0.22 });

        // the night
        const dark = lerp(0.86, 0.95, progress(Math.min(clock, 60), 60, 1));
        drawSprite(g, darkness, bike.x, H / 2, { alpha: dark * (1 - 0.92 * level) });

        g.globalCompositeOperation = 'lighter';
        if (!down) {
          drawSprite(g, lampGlow, bike.x, BIKE_Y - 110, { size: 230, alpha: 0.13 });
          drawSprite(g, lampGlow, bike.x, BIKE_Y - 18, { size: 40, alpha: 0.7 });
          drawSprite(g, tailGlow, bike.x, BIKE_Y + 18, { size: 30, alpha: 0.6 + 0.15 * Math.sin(clock * 9) });
        }

        // afterimages of what the last flash showed
        for (const o of obstacles) {
          const y = yOf(o);
          if (y < -40) continue;
          const mem = 0.75 * clamp(1 - (clock - o.lit) / lerp(1.5, 0.9, progress(Math.min(clock, 60), 60, 1)), 0, 1);
          if (mem > 0.02) {
            if (o.flip) {
              g.save();
              g.translate(o.x, y);
              g.scale(-1, 1);
              drawSprite(g, ghosts.get(o.sprite), 0, 0, { alpha: mem });
              g.restore();
            } else drawSprite(g, ghosts.get(o.sprite), o.x, y, { alpha: mem });
          }
          // deer eyes shine in any light
          if (o.kind === 'deer') {
            const ex = o.x + (o.flip ? -19 : 19);
            const blink = Math.sin(clock * 2.3 + o.x) > 0.97 ? 0.2 : 1;
            for (const s of [-1.8, 1.8]) drawSprite(g, eyeGlow, ex + s, y + 6, { size: 12, alpha: 0.9 * blink });
          }
        }

        fx.render(g, true);

        // rain, brighter in the headlight and the flashes
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(170,200,230,${0.18 + 0.3 * level})`;
        g.lineWidth = 1;
        g.beginPath();
        for (const r of rain) {
          const y = (r.y + clock * r.sp) % (H + 30) - 15;
          const x = r.x - y * 0.12;
          g.moveTo(x, y);
          g.lineTo(x - r.len * 0.12, y + r.len);
        }
        g.stroke();

        // the lightning itself
        if (level > 0.02) {
          g.fillStyle = `rgba(200,220,255,${0.22 * level})`;
          g.fillRect(0, 0, W, H);
          if (bolt && level > 0.25) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, boltGlow, bolt.x, bolt.y, { size: 300, alpha: 0.35 * level });
            for (const [lw, c] of [[5, `rgba(140,170,255,${0.4 * level})`], [1.8, `rgba(255,255,255,${level})`]]) {
              g.strokeStyle = c;
              g.lineWidth = lw;
              g.beginPath();
              for (const line of bolt.lines) line.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
              g.stroke();
            }
            g.globalCompositeOperation = 'source-over';
          }
        }

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
