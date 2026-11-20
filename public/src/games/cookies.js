// Cookie Cutter — a sheet of vanilla sugar-cookie dough rolls out from under a big wooden
// rolling pin and slides down a teal baking mat, and you hold a copper cookie cutter over it.
// The cutter stamps down on its own, in time with the song (you can hear every stamp: it's a
// layer of the music, playing exactly the same rhythm), and every cookie you cut is lifted
// out, leaving a hole. The only rule: every stamp must land on whole dough. Over a hole (one
// you've just cut, or a heart, star, flower or gingerbread man the head baker cut earlier, or a
// tear in the dough) or over the edge of the sheet, and the cookie breaks.
// The rhythm starts in steady quarter notes, where the dough moves far enough between stamps
// that you could stay put; from 15s pairs of eighth notes come in, so you have to step aside
// for the second stamp of each pair, then it gets busier until the last bars stamp every
// eighth note, while the sheet gets narrower and more holey. Everything is planned up front
// around a hidden reference cutter that moves well under your top speed, so there's always
// a clean spot within reach. A dashed outline shows where the next stamp would land right now
// (green: dough, red: hole), with a ring closing in on it, and a ticker at the bottom shows
// the rhythm coming up.

import {
  createParticles,
  createMover,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const TAU = Math.PI * 2;
const CY = 470; // screen y of the cutter
const R_VIS = 25; // the cutter's (and every cookie's) drawn radius
const R_HIT = 21; // two cookies may overlap a little: centres closer than 2 × this break the cookie
const R_EDGE = 22; // how close the cutter's centre may get to the dough's edge
const X_MIN = 28;
const X_MAX = 332;
const SPEED = 320;
const REF_SPEED = 205; // the hidden reference cutter (~68% of your speed)
const BPM = 128;
const E8 = 60 / BPM / 2; // one eighth note

// The cutter's rhythm, one string of eight eighth-notes per bar: 32 bars = 60s at 128 BPM.
// The song plays the same pattern, so you hear every stamp coming.
const BARS = [
  // 0–15s: quarter notes (the dough moves a cookie's width between stamps), first pair in bar 8
  '........', '..x.x.x.', 'x.x.x.x.', 'x.x.x.x.', 'x.x.x.x.', 'x.x.x.x.', 'x.x.x.x.', 'x.x.x.xx',
  // 15–30s: pairs of eighths: step aside for the second stamp
  'x.x.x.xx', 'x.x.x.x.', 'x.xx.x.x', 'x.x.x.xx', 'x.x.x.xx', 'x.xx.xx.', 'x.x.x.xx', 'x.xx.xx.',
  // 30–45s: runs of three and four
  'x.xxx.xx', 'x.xx.xxx', 'xx.xx.xx', 'x.xxx.xx', 'x.xxx.xx', 'xx.xxx.x', 'x.xxxxx.', 'xx.xx.xx',
  // 45–60s: nearly every eighth note
  'xxxxxxx.', 'xxx.xxxx', 'xxxxxxx.', 'xxxxxxxx', 'xxxxxxx.', 'xxx.xxxx', 'xxxxxxxx', 'xxxxxxxx',
];

// how fast the dough slides down (px/s): ~1 cookie per quarter note at first
const speedAt = (t) => lerp(125, 160, progress(t, 60, 1.3));

// ---------- hole shapes: drawing primitives + collision circles (sprite units, y down) ----------

function scallopPts(r, n = 12, depth = 0.075) {
  const pts = [];
  for (let i = 0; i < n * 6; i++) {
    const a = (i / (n * 6)) * TAU;
    pts.push([Math.cos(a) * r * (1 - depth + depth * Math.abs(Math.cos((a * n) / 2))), Math.sin(a) * r * (1 - depth + depth * Math.abs(Math.cos((a * n) / 2)))]);
  }
  return pts;
}

function starPts(ro, ri) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? ri : ro;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

const SHAPES = {
  cut: {
    name: 'a hole you’d just cut',
    prims: [{ poly: scallopPts(R_VIS) }],
    circles: [[0, 0, R_HIT]],
    br: R_VIS,
  },
  flower: {
    name: 'a flower-shaped hole',
    prims: [...Array.from({ length: 6 }, (_, i) => ({ c: [Math.cos((i / 6) * TAU) * 8, Math.sin((i / 6) * TAU) * 8, 6.5] })), { c: [0, 0, 8.5] }],
    circles: [[0, 0, 13.5]],
    br: 15,
  },
  heart: {
    name: 'a heart-shaped hole',
    prims: [{ c: [-7, -3, 9.5] }, { c: [7, -3, 9.5] }, { poly: [[-16, 0.5], [16, 0.5], [0, 17.5]], round: 3 }],
    circles: [[-7, -3, 9.5], [7, -3, 9.5], [0, 6, 8], [0, 12.5, 4]],
    br: 19,
  },
  star: {
    name: 'a star-shaped hole',
    prims: [{ poly: starPts(23, 10.5), round: 3 }],
    circles: [[0, 0, 14], ...Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 5) * TAU;
      return [Math.cos(a) * 17.5, Math.sin(a) * 17.5, 4.5];
    })],
    br: 24,
  },
  man: {
    name: 'a gingerbread-man hole',
    prims: [
      { c: [0, -14, 8.5] },
      { c: [0, 3, 10] },
      { cap: [-15, -4, 15, -4, 9] },
      { cap: [-1, 6, -8, 18, 9.5] },
      { cap: [1, 6, 8, 18, 9.5] },
    ],
    circles: [[0, -14, 8.5], [0, 3, 10], [-11, -4, 5], [11, -4, 5], [-15, -4, 4.5], [15, -4, 4.5], [-5, 13, 5], [5, 13, 5], [-8, 18, 4.75], [8, 18, 4.75]],
    br: 24,
  },
};

function drawPrims(g, prims, grow, color) {
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const p of prims) {
    if (p.c) {
      g.beginPath();
      g.arc(p.c[0], p.c[1], p.c[2] + grow, 0, TAU);
      g.fill();
    } else if (p.cap) {
      g.lineWidth = p.cap[4] + grow * 2;
      g.beginPath();
      g.moveTo(p.cap[0], p.cap[1]);
      g.lineTo(p.cap[2], p.cap[3]);
      g.stroke();
    } else if (p.poly) {
      g.beginPath();
      p.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
      const w = (p.round || 0) + grow * 2;
      if (w > 0) {
        g.lineWidth = w;
        g.stroke();
      }
    }
  }
}

// a hole through the dough: a pale lip, the cut wall of dough on the far side, the mat below
function paintHole(prims) {
  return makeSprite(64, 64, (g) => {
    drawPrims(g, prims, 2.6, 'rgba(255,249,232,0.92)');
    drawPrims(g, prims, 1.1, '#b5844c');
    drawPrims(g, prims, 0, '#d9a868');
    g.globalCompositeOperation = 'source-atop';
    g.translate(0, 3.4);
    drawPrims(g, prims, 0, '#0a2a32');
    g.translate(0, 4);
    drawPrims(g, prims, 0, 'rgba(36,104,116,0.45)');
    g.translate(0, -7.4);
    g.globalCompositeOperation = 'source-over';
  }, 3);
}

function tearPrims(rng, r) {
  const pts = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.next() * 0.2;
    const rr = r * (0.84 + rng.next() * 0.26);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.92]);
  }
  return [{ poly: pts, round: 4 }];
}

// ---------- art ----------

function paintDough(rng) {
  const TW = 360;
  const TH = 400;
  return makeSprite(TW, TH, (g) => {
    g.translate(-TW / 2, -TH / 2);
    const base = g.createLinearGradient(0, 0, TW, 0);
    base.addColorStop(0, '#efd29c');
    base.addColorStop(0.5, '#f7e2b6');
    base.addColorStop(1, '#efd29c');
    g.fillStyle = base;
    g.fillRect(0, 0, TW, TH);
    const wrap = (fn, y) => {
      fn(y);
      fn(y - TH);
      fn(y + TH);
    };
    // soft mottling
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * TW;
      const y = rng.next() * TH;
      const r = 20 + rng.next() * 60;
      const light = rng.next() < 0.55;
      wrap((yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, r);
        gr.addColorStop(0, light ? 'rgba(255,246,222,0.35)' : 'rgba(222,178,112,0.18)');
        gr.addColorStop(1, light ? 'rgba(255,246,222,0)' : 'rgba(222,178,112,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, yy - r, r * 2, r * 2);
      }, y);
    }
    // rolling streaks
    for (let i = 0; i < 16; i++) {
      const y = rng.next() * TH;
      const x = rng.next() * TW * 0.5;
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,250,235,0.1)' : 'rgba(200,150,90,0.04)';
      g.fillRect(x, y, TW * (0.3 + rng.next() * 0.5), 1 + rng.next() * 2);
    }
    // flour and vanilla seeds
    for (let i = 0; i < 900; i++) {
      const x = rng.next() * TW;
      const y = rng.next() * TH;
      g.fillStyle = `rgba(255,255,255,${(0.25 + rng.next() * 0.5).toFixed(2)})`;
      g.fillRect(x, y, 1 + rng.next() * 1.2, 1 + rng.next() * 1.2);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(80,48,20,${(0.3 + rng.next() * 0.4).toFixed(2)})`;
      g.fillRect(rng.next() * TW, rng.next() * TH, 0.8 + rng.next() * 0.6, 0.8);
    }
  }, 1.5);
}

function paintMat() {
  const TW = 360;
  const TH = 240;
  return makeSprite(TW, TH, (g) => {
    g.translate(-TW / 2, -TH / 2);
    const gr = g.createLinearGradient(0, 0, TW, 0);
    gr.addColorStop(0, '#0f3b45');
    gr.addColorStop(0.5, '#155060');
    gr.addColorStop(1, '#0f3b45');
    g.fillStyle = gr;
    g.fillRect(0, 0, TW, TH);
    for (let x = 0; x <= TW; x += 30) {
      g.fillStyle = x % 120 === 0 ? 'rgba(120,210,220,0.22)' : 'rgba(120,210,220,0.1)';
      g.fillRect(x, 0, 1, TH);
    }
    for (let y = 0; y < TH; y += 30) {
      g.fillStyle = y % 120 === 0 ? 'rgba(120,210,220,0.22)' : 'rgba(120,210,220,0.1)';
      g.fillRect(0, y, TW, 1);
    }
    // printed cookie guides
    g.strokeStyle = 'rgba(200,245,250,0.13)';
    g.lineWidth = 1.2;
    for (let y = 60; y < TH; y += 120) {
      for (let x = 60; x < TW; x += 120) {
        g.beginPath();
        g.arc(x, y, 24, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(x, y, 14, 0, TAU);
        g.stroke();
      }
    }
  }, 1);
}

function paintCutter() {
  return makeSprite(66, 66, (g) => {
    const outer = scallopPts(R_VIS + 3.2);
    const inner = scallopPts(R_VIS - 2.2);
    const path = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    const gr = g.createLinearGradient(-28, -28, 28, 28);
    gr.addColorStop(0, '#ffd7a8');
    gr.addColorStop(0.3, '#e8955a');
    gr.addColorStop(0.55, '#b5582a');
    gr.addColorStop(0.8, '#f0a46a');
    gr.addColorStop(1, '#7a3416');
    path(outer);
    g.fillStyle = gr;
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    path(inner);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // rolled rim: bright top-left, dark inner edge
    path(scallopPts(R_VIS + 0.6));
    g.strokeStyle = 'rgba(255,236,205,0.85)';
    g.lineWidth = 1.2;
    g.stroke();
    path(outer);
    g.strokeStyle = '#5a240c';
    g.lineWidth = 1;
    g.stroke();
    path(inner);
    g.strokeStyle = 'rgba(70,25,6,0.9)';
    g.lineWidth = 1.1;
    g.stroke();
    // glints
    g.fillStyle = 'rgba(255,255,240,0.95)';
    g.beginPath();
    g.ellipse(-15, -18, 4, 1.4, -0.7, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(18, 14, 2.5, 1, -0.7, 0, TAU);
    g.fill();
  }, 3);
}

function paintCutterShadow() {
  return makeSprite(80, 80, (g) => {
    const pts = scallopPts(R_VIS + 3);
    g.shadowColor = 'rgba(60,30,10,0.55)';
    g.shadowBlur = 6;
    g.strokeStyle = 'rgba(60,30,10,0.5)';
    g.lineWidth = 5;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
  }, 2);
}

function paintCookie(rng) {
  return makeSprite(60, 60, (g) => {
    const pts = scallopPts(R_VIS - 0.5);
    const path = () => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    const gr = g.createRadialGradient(-6, -8, 2, 0, 0, 28);
    gr.addColorStop(0, '#fff1d2');
    gr.addColorStop(0.7, '#f3d6a0');
    gr.addColorStop(1, '#dcae6c');
    path();
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#b98a50';
    g.lineWidth = 1.4;
    g.stroke();
    g.strokeStyle = 'rgba(190,140,80,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, 16, 0, TAU);
    g.stroke();
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * TAU;
      const r = rng.next() * 19;
      g.fillStyle = rng.next() < 0.7 ? 'rgba(255,255,255,0.9)' : 'rgba(255,220,240,0.9)';
      g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 1.4, 1.4);
    }
  }, 3);
}

function paintPin(W) {
  return makeSprite(W, 54, (g) => {
    g.translate(-W / 2, -27);
    const gr = g.createLinearGradient(0, 4, 0, 46);
    gr.addColorStop(0, '#5e3218');
    gr.addColorStop(0.18, '#c98a50');
    gr.addColorStop(0.42, '#f2c18a');
    gr.addColorStop(0.7, '#b8743e');
    gr.addColorStop(1, '#4a2410');
    g.fillStyle = gr;
    g.fillRect(0, 4, W, 42);
    g.fillStyle = 'rgba(255,240,215,0.35)';
    g.fillRect(0, 15, W, 2);
    // wood grain
    for (let i = 0; i < 40; i++) {
      const y = 8 + Math.random() * 34;
      const x = Math.random() * W;
      g.fillStyle = `rgba(80,38,12,${(0.12 + Math.random() * 0.15).toFixed(2)})`;
      g.fillRect(x, y, 30 + Math.random() * 120, 0.8);
    }
    // flour clinging to the pin
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${(0.2 + Math.random() * 0.4).toFixed(2)})`;
      g.fillRect(Math.random() * W, 30 + Math.random() * 14, 1.4, 1.2);
    }
    // shadow cast on the dough
    const sh = g.createLinearGradient(0, 46, 0, 54);
    sh.addColorStop(0, 'rgba(90,50,20,0.5)');
    sh.addColorStop(1, 'rgba(90,50,20,0)');
    g.fillStyle = sh;
    g.fillRect(0, 46, W, 8);
  }, 2);
}

// ---------- music: 90s piano house, 128 BPM, B♭ major over B♭–Gm–E♭–F ----------

const stampLayer = (from, to, kind) => {
  const bars = BARS.slice(from, to).map((b) => `[${[...b].map((c) => (c === 'x' ? (kind === 'n' ? 'f3' : 'pink') : '~')).join(' ')}]`);
  return `<${bars.join(' ')}>`;
};
const stampDefs = [0, 1, 2, 3]
  .map((k) => `
    const thock${k} = note("${stampLayer(k * 8, k * 8 + 8, 'n')}").s("triangle").attack(0.002).decay(0.08).sustain(0).lpf(1600).gain(0.3)
    const slap${k} = s("${stampLayer(k * 8, k * 8 + 8, 's')}").decay(0.035).sustain(0).hpf(700).lpf(3800).gain(0.09)`)
  .join('');

const music = {
  cps: BPM / 240,
  setup: `
    const kick = note("as2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("as2 as2 as2 [as2 as2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.13).sustain(0).hpf(1100).lpf(6000).gain(0.14).room(0.25)
    const ohat = s("[~ white]*4").decay(0.08).sustain(0).hpf(7000).gain(0.05)
    const hat16 = s("white*16").decay(0.022).sustain(0).hpf(7200).gain("[0.012 0.028 0.018 0.028]*4")
    const shaker = s("[~ white ~ white]*4").decay(0.045).sustain(0).hpf(5200).lpf(9000).gain(0.022).pan(0.62)
    const bass = note("<[as2 ~ ~ as2 ~ ~ as3 ~ ~ as2 ~ as2 ~ ~ as3 ~] [g2 ~ ~ g2 ~ ~ g3 ~ ~ g2 ~ g2 ~ ~ g3 ~] [ds2 ~ ~ ds2 ~ ~ ds3 ~ ~ ds2 ~ ds2 ~ ~ ds3 ~] [f2 ~ ~ f2 ~ ~ f3 ~ ~ f2 ~ f2 ~ ~ a2 c3]>")
      .s("square").decay(0.16).sustain(0.25).release(0.05).lpf(saw.range(420, 1500).slow(32)).gain(0.2)
    const sub = note("<as2 g2 ds2 f2>").s("sine").decay(0.6).sustain(0.5).gain(0.22)
    const chords = "<[as3,d4,f4,as4] [g3,as3,d4,g4] [ds3,g3,as3,ds4] [f3,a3,c4,f4]>"
    const piano = note(chords).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").s("triangle").attack(0.003).decay(0.32).sustain(0.04).release(0.1)
      .lpf(saw.range(1500, 3200).slow(32)).gain(0.1).room(0.2)
    const pianoTop = note(chords).add(note(12)).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~").s("sawtooth").attack(0.003).decay(0.14).sustain(0)
      .lpf(2600).gain(0.035).pan(0.42)
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.6).lpf(900).gain(0.04).room(0.6)
    const tune = "<[d5@2 f5 as5 a5@2 f5 d5] [d5@2 as4 d5 g5@2 f5 d5] [ds5@2 g5 as5 c6@2 as5 g5] [a5@3 c6 a5@2 g5 f5]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.2).sustain(0.45).release(0.12).lpf(2400).vib(5).vibmod(0.12)
      .gain(0.065).delay(0.24).delaytime(0.3516).delayfeedback(0.3).pan(0.58)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1300).gain(0.045)
    const arp = note("<[as4 d5 f5 d5]*4 [g4 as4 d5 as4]*4 [ds5 g5 as5 g5]*4 [f4 a4 c5 a4]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.05).slow(8))
    ${stampDefs}
  `,
  song: `arrange(
    [8, stack(kick, ohat, bass, sub, piano, thock0, slap0)],
    [8, stack(kick, clap, ohat, bass, sub, piano, pianoTop, pad, thock1, slap1)],
    [8, stack(kick, clap, ohat, hat16, shaker, bass, sub, piano, pianoTop, pad, lead, thock2, slap2)],
    [8, stack(kick2, clap, ohat, hat16, shaker, bass, sub, piano, pianoTop, pad, lead, leadLow, arp, wash, thock3, slap3)]
  )`,
};

// ---------- the plan: scroll, dough edges, stamps, reference route, holes ----------

function buildPlan(rng) {
  // scroll distance S(t) (dough coordinate u under the cutter at time t)
  const DT = 0.01;
  const Ss = [0];
  for (let i = 1; i <= 6600; i++) Ss.push(Ss[i - 1] + speedAt((i - 0.5) * DT) * DT);
  const S = (t) => {
    const f = clamp(t / DT, 0, Ss.length - 1.001);
    const i = Math.floor(f);
    return Ss[i] + (Ss[i + 1] - Ss[i]) * (f - i);
  };
  const tOfU = (u) => {
    if (u <= 0) return u / 110;
    let lo = 0;
    let hi = Ss.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Ss[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo * DT;
  };

  // the dough sheet's edges: full width at first, narrowing and wandering later
  const U0 = -800;
  const STEPU = 4;
  const uEnd = S(66) + 900;
  const Ls = [];
  const Rs = [];
  const ph = [rng.next() * TAU, rng.next() * TAU, rng.next() * TAU, rng.next() * TAU, rng.next() * TAU];
  for (let u = U0; u <= uEnd; u += STEPU) {
    const tu = Math.max(0, tOfU(u));
    const hw = lerp(215, 106, Math.pow(clamp((tu - 4) / 52, 0, 1), 0.8));
    const amp = lerp(0, 40, clamp((tu - 10) / 40, 0, 1));
    const c = 180 + amp * (0.6 * Math.sin(u / 170 + ph[0]) + 0.4 * Math.sin(u / 71 + ph[1]));
    Ls.push(c - hw + 2.2 * Math.sin(u / 13 + ph[2]) + 1.2 * Math.sin(u / 5.3 + ph[3]));
    Rs.push(c + hw + 2.2 * Math.sin(u / 11 + ph[4]) + 1.2 * Math.sin(u / 6.1 + ph[2]));
  }
  const edge = (arr, u) => {
    const f = clamp((u - U0) / STEPU, 0, arr.length - 1.001);
    const i = Math.floor(f);
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  };
  const edgeL = (u) => edge(Ls, u);
  const edgeR = (u) => edge(Rs, u);

  // stamps
  const stamps = [];
  BARS.forEach((bar, b) => {
    [...bar].forEach((c, k) => {
      if (c !== 'x') return;
      const t = (b * 8 + k) * E8;
      stamps.push({ t, u: S(t), x: 0, eighth: false });
    });
  });
  for (let i = 1; i < stamps.length; i++) stamps[i].eighth = stamps[i].t - stamps[i - 1].t < E8 * 1.5;

  // the hidden reference cutter: always within reach, always on whole dough
  let px = 180;
  let pt = 0;
  let target = 180;
  let nextTarget = 0;
  let forced = 0;
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];
    const lo = Math.max(X_MIN + 2, Math.max(edgeL(s.u - 14), edgeL(s.u), edgeL(s.u + 14)) + R_EDGE + 8);
    const hi = Math.min(X_MAX - 2, Math.min(edgeR(s.u - 14), edgeR(s.u), edgeR(s.u + 14)) - R_EDGE - 8);
    const reach = i === 0 ? 999 : REF_SPEED * (s.t - pt);
    if (s.t >= nextTarget) {
      target = lerp(lo, hi, rng.next());
      nextTarget = s.t + 0.9 + rng.next() * 1.4;
    }
    const ok = (x) => {
      for (let j = i - 1; j >= 0 && s.u - stamps[j].u < 60; j--) {
        if (Math.hypot(x - stamps[j].x, s.u - stamps[j].u) < 2 * R_HIT + 4) return false;
      }
      return true;
    };
    let best = null;
    let bestScore = Infinity;
    for (let x = Math.max(lo, px - reach); x <= Math.min(hi, px + reach); x += 2) {
      if (!ok(x)) continue;
      const score = Math.abs(x - target) + rng.next() * 26;
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    if (best === null) {
      forced++;
      best = clamp(px, lo, hi);
    }
    s.x = best;
    px = best;
    pt = s.t;
  }

  // holes the head baker already cut (and tears), kept clear of the reference route
  const holes = [];
  const typesAt = (t) => (t < 8 ? ['flower', 'heart'] : t < 14 ? ['flower', 'heart', 'star'] : t < 18 ? ['flower', 'heart', 'star', 'man'] : ['flower', 'heart', 'star', 'man', 'tear', 'tear']);
  const tryHole = (x, u, type, t) => {
    const sc = lerp(0.88, 1.12, rng.next());
    const rot = type === 'star' ? rng.next() * TAU : type === 'tear' ? 0 : (rng.next() - 0.5) * 0.7;
    let prims = null;
    let local;
    let br;
    if (type === 'tear') {
      const r = lerp(14, 21, rng.next());
      prims = tearPrims(rng, r);
      local = [[0, 0, r * 0.97]];
      br = r * 1.12;
    } else {
      local = SHAPES[type].circles;
      br = SHAPES[type].br * sc;
    }
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const k = type === 'tear' ? 1 : sc;
    const circles = local.map(([dx, dy, r]) => {
      const rx = (dx * cs - dy * sn) * k;
      const ry = (dx * sn + dy * cs) * k;
      return [x + rx, u - ry, r * k];
    });
    // on the sheet (at least partly), off the route, not on another hole
    if (x + br < edgeL(u) + 6 || x - br > edgeR(u) - 6) return false;
    for (const s of stamps) {
      if (Math.abs(s.u - u) > 70) continue;
      for (const [cx, cu, r] of circles) if (Math.hypot(cx - s.x, cu - s.u) < r + R_HIT + 5) return false;
    }
    for (const h of holes) {
      if (Math.abs(h.u - u) > 60) continue;
      if (Math.hypot(h.x - x, h.u - u) < h.br + br + 3) return false;
    }
    holes.push({ x, u, type, rot, sc: k, circles, br, prims, t });
    return true;
  };
  // hugging the route, so the clean spots are narrow choices
  for (const s of stamps) {
    if (s.t < 4.5) continue;
    const p = progress(s.t, 60, 1);
    if (rng.next() > lerp(0.15, 0.55, p)) continue;
    const types = typesAt(s.t);
    const type = types[Math.floor(rng.next() * types.length)];
    const side = rng.next() < 0.5 ? -1 : 1;
    const r0 = type === 'tear' ? 18 : SHAPES[type].br;
    tryHole(s.x + side * (R_HIT + r0 + lerp(4, 18, rng.next())), s.u + lerp(-24, 24, rng.next()), type, s.t);
  }
  // and scattered over the sheet
  for (let u = S(3.2); u < uEnd; u += 10) {
    const t = tOfU(u);
    const p = progress(Math.min(t, 60), 60, 1);
    if (rng.next() > lerp(0.07, 0.15, p)) continue;
    const types = typesAt(t);
    const type = types[Math.floor(rng.next() * types.length)];
    tryHole(lerp(edgeL(u) - 8, edgeR(u) + 8, rng.next()), u, type, t);
  }
  holes.sort((a, b) => a.u - b.u);
  return { S, edgeL, edgeR, stamps, holes, forced };
}

export default {
  id: 'cookies',
  title: 'Cookie Cutter',
  emoji: '🍪',
  tagline: 'The cutter stamps to the beat: keep it on dough, never over a hole.',
  colors: { bg: '#123f49', fg: '#fff4e0', accent: '#ec9a5e' },
  music,

  create({ rng, W, H }) {
    const plan = buildPlan(rng.fork('plan'));
    const { S, edgeL, edgeR, stamps, holes } = plan;
    const art = rng.fork('art');

    // ---- art ----
    const dough = paintDough(art);
    const mat = paintMat();
    const holeArt = {};
    for (const k of Object.keys(SHAPES)) holeArt[k] = paintHole(SHAPES[k].prims);
    for (const h of holes) if (h.prims) h.art = paintHole(h.prims);
    const cutter = paintCutter();
    const cutterShadow = paintCutterShadow();
    const cookieArt = [paintCookie(art), paintCookie(art), paintCookie(art)];
    const pin = paintPin(W);
    const glowWarm = glowSprite('rgba(255,170,90,0.6)', 40);
    const glowRed = glowSprite('rgba(255,50,40,0.75)', 40);
    const glowGreen = glowSprite('rgba(120,255,170,0.5)', 40);
    const vignette = vignetteSprite(W, H, 0.5, '6,24,30');
    const fx = createParticles();
    const dust = [];
    for (let i = 0; i < 18; i++) dust.push({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * TAU, z: 0.5 + Math.random() * 0.5 });

    // ---- state ----
    const mover = createMover({ x: 180, minX: X_MIN, maxX: X_MAX, speed: SPEED, accel: 26 });
    let si = 0; // next stamp
    let now = 0;
    let clock = 0;
    let lastStamp = -1;
    let shake = 0;
    let count = 0;
    let crack = null;
    const cuts = []; // { x, u, t, art }
    let h0 = 0; // first hole that might still be on screen

    const holeHit = (x, u) => {
      // over the edge of the sheet
      for (const du of [-15, 0, 15]) {
        if (x - R_EDGE < edgeL(u + du) || x + R_EDGE > edgeR(u + du)) return 'Cut off the edge of the dough.';
      }
      for (let i = h0; i < holes.length && holes[i].u < u + 70; i++) {
        const h = holes[i];
        if (h.u < u - 70) continue;
        for (const [cx, cu, r] of h.circles) {
          if (Math.hypot(cx - x, cu - u) < r + R_HIT) return h.type === 'tear' ? 'Cut into a tear in the dough.' : `Cut into ${SHAPES[h.type].name}.`;
        }
      }
      for (const c of cuts) {
        if (Math.abs(c.u - u) < 2 * R_HIT && Math.hypot(c.x - x, c.u - u) < 2 * R_HIT) return 'Cut into a hole you’d just cut.';
      }
      return '';
    };

    const die = (why) => {
      game.dead = true;
      game.deathReason = why;
      shake = 0.6;
      crack = { x: mover.x, t: clock };
      fx.burst(mover.x, CY, { count: 46, speed: 230, life: 1.1, size: 5, gravity: 520, drag: 0.6, round: true, colors: ['#f5dfb3', '#e8c38a', '#d9a868', '#fff4e0', '#b5844c'] });
      fx.burst(mover.x, CY, { count: 10, speed: 120, life: 0.7, size: 6, drag: 2, round: true, colors: ['rgba(255,255,255,0.35)'] });
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.6);
      fx.update(dt);
      for (const d of dust) {
        d.y += (14 + 10 * d.z) * dt;
        d.x += Math.sin(clock * 0.7 + d.ph) * 5 * dt;
        if (d.y > H + 6) {
          d.y = -6;
          d.x = Math.random() * W;
        }
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { plan, holeHit, get x() { return mover.x; }, get si() { return si; } },

      update(dt, dir, t) {
        updateCosmetic(dt);
        now = t + dt;
        mover.update(dt, dir);
        while (si < stamps.length && stamps[si].t <= now) {
          const s = stamps[si++];
          lastStamp = s.t;
          const why = holeHit(mover.x, s.u);
          if (why) return die(why);
          cuts.push({ x: mover.x, u: s.u, t: s.t, art: cookieArt[count % cookieArt.length], rot: Math.random() * TAU, flyTo: Math.random() < 0.5 ? -1 : 1 });
          count++;
          fx.burst(mover.x, CY, { count: 12, speed: 70, life: 0.5, size: 4, drag: 3, round: true, colors: ['rgba(255,255,255,0.75)', 'rgba(255,246,225,0.6)'] });
        }
        // forget what has slid off the bottom
        const sNow = S(now);
        while (cuts.length && CY + sNow - cuts[0].u > H + 40 && now - cuts[0].t > 1) cuts.shift();
        while (h0 < holes.length && CY + sNow - holes[h0].u > H + 40) h0++;
      },

      afterlife(dt) {
        updateCosmetic(dt);
      },

      render(g) {
        const t = now;
        const sNow = S(t);
        const sy = (u) => CY + sNow - u;
        const px = mover.x;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

        // the baking mat (it slides with the dough)
        const moff = sNow % 240;
        for (let y = moff - 240; y < H; y += 240) g.drawImage(mat.canvas, 0, y, W, 240);

        // the dough sheet
        const ys = [];
        for (let y = -8; y <= H + 8; y += 8) ys.push(y);
        const edgePath = () => {
          g.beginPath();
          ys.forEach((y, i) => (i ? g.lineTo(edgeL(CY + sNow - y), y) : g.moveTo(edgeL(CY + sNow - y), y)));
          for (let i = ys.length - 1; i >= 0; i--) g.lineTo(edgeR(CY + sNow - ys[i]), ys[i]);
          g.closePath();
        };
        // its shadow on the mat
        g.save();
        g.translate(3, 4);
        edgePath();
        g.fillStyle = 'rgba(2,16,20,0.45)';
        g.fill();
        g.restore();
        g.save();
        edgePath();
        g.clip();
        const doff = sNow % 400;
        for (let y = doff - 400; y < H; y += 400) g.drawImage(dough.canvas, 0, y, W, 400);
        // holes cut earlier by the head baker, and tears
        for (let i = h0; i < holes.length; i++) {
          const h = holes[i];
          const y = sy(h.u);
          if (y < -40) break;
          if (y > H + 40) continue;
          const a = h.art || holeArt[h.type];
          drawSprite(g, a, h.x, y, { rot: h.rot, size: 64 * h.sc });
        }
        // the holes you've cut
        for (const c of cuts) {
          const y = sy(c.u);
          if (y < -40 || y > H + 40) continue;
          drawSprite(g, holeArt.cut, c.x, y, { size: 64 });
        }
        g.restore();
        // the rolled edge: a pale lip and a darker underside
        g.lineJoin = 'round';
        for (const side of [edgeL, edgeR]) {
          g.beginPath();
          ys.forEach((y, i) => (i ? g.lineTo(side(CY + sNow - y), y) : g.moveTo(side(CY + sNow - y), y)));
          g.strokeStyle = '#c8955a';
          g.lineWidth = 3;
          g.stroke();
          g.strokeStyle = 'rgba(255,248,230,0.85)';
          g.lineWidth = 1.2;
          g.stroke();
        }

        // freshly cut cookies sit in their holes for a moment
        for (const c of cuts) {
          const age = t - c.t;
          if (age < 0.16) drawSprite(g, c.art, c.x, sy(c.u), { size: 60 * (0.98 + age * 0.2), rot: c.rot });
        }

        // where the next stamp would land right now
        const next = stamps[si];
        const live = !game.dead && next;
        let bad = false;
        if (live && next.t - t < 1.3) {
          bad = !!holeHit(px, next.u);
          const k = clamp((next.t - t) / 0.45, 0, 1);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, bad ? glowRed : glowGreen, px, CY, { size: 110, alpha: bad ? 0.55 + 0.25 * Math.sin(clock * 22) : 0.35 });
          g.globalCompositeOperation = 'source-over';
          // dashed landing outline
          g.save();
          g.setLineDash([5, 4]);
          g.lineDashOffset = -clock * 30;
          g.strokeStyle = bad ? 'rgba(255,70,50,0.95)' : 'rgba(40,150,80,0.9)';
          g.lineWidth = 2.2;
          g.beginPath();
          scallopPts(R_VIS + 1, 12, 0.075).forEach(([x, y], i) => (i ? g.lineTo(px + x, CY + y) : g.moveTo(px + x, CY + y)));
          g.closePath();
          g.stroke();
          g.restore();
          // a ring closing in on the stamp
          if (k < 1) {
            g.strokeStyle = bad ? `rgba(255,90,60,${(0.9 - k * 0.6).toFixed(2)})` : `rgba(255,236,200,${(0.9 - k * 0.6).toFixed(2)})`;
            g.lineWidth = 2.5;
            g.beginPath();
            g.arc(px, CY, R_VIS + 4 + k * 34, 0, TAU);
            g.stroke();
          }
        }

        // the cutter: lifts between stamps, presses down on each one
        const up = clamp((t - lastStamp) / 0.09, 0, 1);
        const down = next && !game.dead ? clamp((next.t - t) / 0.09, 0, 1) : 1;
        const hgt = game.dead ? 0 : 8 * Math.min(up, down);
        g.globalCompositeOperation = 'lighter';
        if (!crack) drawSprite(g, glowWarm, px, CY - hgt, { size: 100, alpha: 0.3 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, cutterShadow, px + 2 + hgt * 0.5, CY + 2 + hgt * 0.8, { size: 80 * (1 + hgt * 0.01), alpha: 0.7 - hgt * 0.04 });
        if (crack) {
          // the cookie under it breaks in two
          const age = clock - crack.t;
          const sp = Math.min(1, age * 3);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, px, CY, { size: 130, alpha: Math.max(0, 0.45 - age * 0.4) });
          g.globalCompositeOperation = 'source-over';
          for (const side of [-1, 1]) {
            g.save();
            g.translate(px + side * (4 + sp * 9), CY + sp * 6);
            g.rotate(side * sp * 0.25);
            g.beginPath();
            g.moveTo(0, -30);
            for (let k = 0; k <= 6; k++) g.lineTo((k % 2 ? 3 : -3), -30 + k * 10);
            g.lineTo(side * 32, 30);
            g.lineTo(side * 32, -30);
            g.closePath();
            g.clip();
            drawSprite(g, cookieArt[0], 0, 0, { size: 60 });
            g.restore();
          }
          drawSprite(g, cutter, px + 22 * sp, CY - 30 * sp, { size: 66, rot: Math.sin((clock - crack.t) * 30) * 0.12 * Math.max(0, 1 - (clock - crack.t) * 2) + 0.08 });
        } else {
          drawSprite(g, cutter, px, CY - hgt, { size: 66 * (1 + hgt * 0.012) * (up < 1 && t - lastStamp < 0.05 ? 0.96 : 1) });
        }
        if (bad && next && next.t - t < 0.6) {
          g.font = '900 20px "Arial Black", Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(60,10,0,0.8)';
          g.fillStyle = '#ff5a3c';
          const by = CY - 44 + Math.sin(clock * 20) * 1.5;
          g.strokeText('!', px, by);
          g.fillText('!', px, by);
        }

        // cookies lifted off to the cooling racks
        for (const c of cuts) {
          const q = (t - c.t - 0.16) / 0.55;
          if (q < 0 || q > 1) continue;
          const y0 = sy(c.u) + (t - c.t) * 0;
          const tx = c.flyTo < 0 ? -30 : W + 30;
          const x = lerp(c.x, tx, q * q);
          const y = lerp(y0, y0 - 150, q) - Math.sin(q * Math.PI) * 40;
          const s = 1 + Math.sin(q * Math.PI) * 0.25;
          g.fillStyle = 'rgba(40,20,5,0.25)';
          g.beginPath();
          g.ellipse(x + 8 + q * 14, y + 10 + q * 22, 22 * s, 20 * s, 0, 0, TAU);
          g.fill();
          drawSprite(g, c.art, x, y, { size: 60 * s, rot: c.rot + q * c.flyTo * 2 });
        }

        fx.render(g);

        // flour dust in the air
        for (const d of dust) {
          g.globalAlpha = 0.25 + 0.2 * Math.sin(clock * 1.7 + d.ph);
          g.fillStyle = '#ffffff';
          g.fillRect(d.x, d.y, 1.8 * d.z, 1.8 * d.z);
        }
        g.globalAlpha = 1;

        // the rolling pin, turning as the dough comes out from under it
        g.drawImage(pin.canvas, 0, -4, W, 54);
        g.save();
        g.beginPath();
        g.rect(0, 0, W, 42);
        g.clip();
        for (let k = 0; k < 7; k++) {
          const a = (sNow / 21 + k * (TAU / 7)) % TAU;
          const c = Math.cos(a);
          if (c < 0) continue;
          const y = 21 + Math.sin(a) * 21;
          g.fillStyle = `rgba(90,45,15,${(0.2 * c).toFixed(3)})`;
          g.fillRect(0, y, W, 1.5);
        }
        g.restore();

        // the rhythm coming up
        g.fillStyle = 'rgba(6,26,32,0.55)';
        g.beginPath();
        g.roundRect ? g.roundRect(24, 604, W - 48, 26, 13) : g.rect(24, 604, W - 48, 26);
        g.fill();
        const PX = 52;
        const SP = 21;
        const beat0 = Math.ceil(t / (E8 * 2));
        for (let b = beat0; (b * E8 * 2 - t) / E8 * SP + PX < W - 30; b++) {
          const x = PX + ((b * E8 * 2 - t) / E8) * SP;
          g.fillStyle = b % 4 === 0 ? 'rgba(200,240,245,0.35)' : 'rgba(200,240,245,0.15)';
          g.fillRect(x - 0.5, 609, 1, 16);
        }
        for (let i = Math.max(0, si - 1); i < stamps.length; i++) {
          const s = stamps[i];
          const x = PX + ((s.t - t) / E8) * SP;
          if (x > W - 32) break;
          if (x < PX - 8) continue;
          const near = clamp(1 - (s.t - t) / 0.25, 0, 1);
          g.fillStyle = i < si ? 'rgba(236,154,94,0.4)' : '#ec9a5e';
          g.beginPath();
          g.arc(x, 617, 5 + near * 2, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(255,230,200,0.8)';
          g.lineWidth = 1;
          g.stroke();
        }
        g.fillStyle = '#fff4e0';
        g.fillRect(PX - 1, 606, 2, 22);

        // cookies so far
        g.font = '700 12px system-ui, sans-serif';
        g.textAlign = 'right';
        g.textBaseline = 'alphabetic';
        g.fillStyle = 'rgba(6,26,32,0.6)';
        g.fillText(`${count} cookies`, W - 27, 597);
        g.fillStyle = '#fff4e0';
        g.fillText(`${count} cookies`, W - 28, 596);

        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };
    return game;
  },
};
