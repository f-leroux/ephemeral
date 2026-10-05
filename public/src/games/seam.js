// Seam Stress — a mint-green vintage sewing machine stitching a patchwork quilt under a warm lamp.
// The needle has to follow the tailor's chalk line: stray outside the seam allowance and the seam is
// ruined. Now and then the chalk splits in two and one branch ends at a pin; later, bits of the chalk
// have been rubbed away and you have to carry the curve across the gap by eye.

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

const NEEDLE_Y = 540;
const X_MIN = 46; // where the seam itself may wander
const X_MAX = 314;
const PATCH = 120; // quilt squares
const DASH = 16; // chalk dash period, in fabric distance
const STITCH = 7; // stitch length
const PATH_SPEED = 205; // sets how fast the chalk seam itself swings sideways (the path stays as playtested)
const MOVE_SPEED = 182; // gentle steering, still faster than the seam's quickest swing (0.78 × PATH_SPEED)
const TABLE_DT = 0.01;

const speedAt = (t) => lerp(150, 265, progress(t, 60, 1.15));
// the seam allowance: a wide funnel to start sewing in, then it narrows over the minute
const tolAt = (t) => lerp(36, 18, progress(t, 60, 1.1)) + Math.max(0, 3.2 - t) * 140;
const smooth = (u) => u * u * (3 - 2 * u);

// ---------- art ----------

const PATTERNS = ['denim', 'gingham', 'polka', 'floral', 'tartan', 'corduroy', 'paisley', 'tweed'];

function paintPatch(kind, rng) {
  const S = PATCH;
  const h = S / 2;
  return makeSprite(S, S, (g) => {
    const base = {
      denim: '#2c4a74',
      gingham: '#7d2630',
      polka: '#a2741e',
      floral: '#24305c',
      tartan: '#2d5a3e',
      corduroy: '#8f4428',
      paisley: '#55305c',
      tweed: '#5c4b3d',
    }[kind];
    g.fillStyle = base;
    g.fillRect(-h, -h, S, S);
    g.save();
    g.beginPath();
    g.rect(-h, -h, S, S);
    g.clip();
    if (kind === 'denim') {
      g.lineWidth = 1.2;
      for (let k = -S; k < S; k += 3) {
        g.strokeStyle = (k / 3) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.14)';
        g.beginPath();
        g.moveTo(k - h, -h);
        g.lineTo(k + S - h, h);
        g.stroke();
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(190,210,235,0.12)';
        g.fillRect(rng.range(-h, h), rng.range(-h, h), rng.range(4, 12), 1);
      }
    } else if (kind === 'gingham') {
      g.fillStyle = 'rgba(255,225,215,0.17)';
      for (let k = -h; k < h; k += 12) {
        g.fillRect(k, -h, 6, S);
        g.fillRect(-h, k, S, 6);
      }
    } else if (kind === 'polka') {
      for (let y = -h, row = 0; y < h + 8; y += 15, row++) {
        for (let x = -h + (row % 2) * 8; x < h + 8; x += 16) {
          g.fillStyle = '#5f3f10';
          g.beginPath();
          g.arc(x, y, 3.4, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,230,170,0.25)';
          g.beginPath();
          g.arc(x - 1, y - 1, 1.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (kind === 'floral') {
      for (let i = 0; i < 16; i++) {
        const x = rng.range(-h, h);
        const y = rng.range(-h, h);
        const a = rng.range(0, 6.28);
        g.fillStyle = '#4c7a46';
        g.beginPath();
        g.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 3.4, 1.6, a, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rng.pick(['#e88aa6', '#f0b6c4', '#d9a6e8']);
        for (let k = 0; k < 5; k++) {
          const b = a + (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(b) * 2.8, y + Math.sin(b) * 2.8, 2.3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#f5d76a';
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'tartan') {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = -h; k < h; k += 40) {
        g.fillRect(k, -h, 14, S);
        g.fillRect(-h, k, S, 14);
      }
      g.lineWidth = 1.5;
      for (let k = -h + 26; k < h; k += 40) {
        g.strokeStyle = 'rgba(200,55,60,0.6)';
        g.beginPath();
        g.moveTo(k, -h);
        g.lineTo(k, h);
        g.moveTo(-h, k);
        g.lineTo(h, k);
        g.stroke();
        g.strokeStyle = 'rgba(240,210,110,0.3)';
        g.beginPath();
        g.moveTo(k + 7, -h);
        g.lineTo(k + 7, h);
        g.moveTo(-h, k + 7);
        g.lineTo(h, k + 7);
        g.stroke();
      }
    } else if (kind === 'corduroy') {
      for (let k = -h; k < h; k += 5) {
        const rib = g.createLinearGradient(k, 0, k + 5, 0);
        rib.addColorStop(0, 'rgba(0,0,0,0.22)');
        rib.addColorStop(0.5, 'rgba(255,200,160,0.12)');
        rib.addColorStop(1, 'rgba(0,0,0,0.22)');
        g.fillStyle = rib;
        g.fillRect(k, -h, 5, S);
      }
    } else if (kind === 'paisley') {
      for (let i = 0; i < 9; i++) {
        const x = rng.range(-h, h);
        const y = rng.range(-h, h);
        const a = rng.range(0, 6.28);
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.fillStyle = 'rgba(214,150,70,0.55)';
        g.beginPath();
        g.arc(0, 0, 6, 0, Math.PI * 2);
        g.moveTo(-6, 0);
        g.quadraticCurveTo(-8, -12, 4, -16);
        g.quadraticCurveTo(0, -8, 6, 0);
        g.fill();
        g.fillStyle = 'rgba(120,200,190,0.6)';
        g.beginPath();
        g.arc(0, 0, 2.6, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    } else if (kind === 'tweed') {
      g.lineWidth = 1.4;
      for (let x = -h, col = 0; x < h; x += 6, col++) {
        for (let y = -h; y < h; y += 5) {
          g.strokeStyle = rng.chance(0.5) ? 'rgba(220,200,170,0.16)' : 'rgba(0,0,0,0.2)';
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (col % 2 ? 6 : -6) * 0.5 + 3, y + 4);
          g.stroke();
        }
      }
    }
    // woven texture
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
      g.fillRect(rng.range(-h, h), rng.range(-h, h), 1, 1);
    }
    // quilted puff: lighter in the middle, sinking into the seams
    const puff = g.createRadialGradient(-10, -14, 6, 0, 0, h * 1.45);
    puff.addColorStop(0, 'rgba(255,240,215,0.14)');
    puff.addColorStop(0.55, 'rgba(0,0,0,0)');
    puff.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = puff;
    g.fillRect(-h, -h, S, S);
    g.restore();
    // the seam between squares, with its quilting stitches just inside
    g.strokeStyle = 'rgba(15,8,5,0.6)';
    g.lineWidth = 2;
    g.strokeRect(-h, -h, S, S);
    g.strokeStyle = 'rgba(250,235,200,0.35)';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.strokeRect(-h + 5, -h + 5, S - 10, S - 10);
    g.setLineDash([]);
  }, 2);
}

// Mint-enamel machine head, reaching up from the bottom of the screen to the needle.
function paintMachine() {
  return makeSprite(72, 130, (g) => {
    // shadow on the quilt
    g.fillStyle = 'rgba(10,5,0,0.35)';
    g.beginPath();
    g.roundRect(-26, -50, 60, 130, 14);
    g.fill();
    const body = g.createLinearGradient(-27, 0, 27, 0);
    body.addColorStop(0, '#5f9c88');
    body.addColorStop(0.35, '#b9e6d4');
    body.addColorStop(0.55, '#d8f4e8');
    body.addColorStop(1, '#4f8775');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-27, -56, 54, 130, 14);
    g.fill();
    g.strokeStyle = 'rgba(30,60,50,0.7)';
    g.lineWidth = 1.5;
    g.stroke();
    // cream band and gold pinstripes
    g.fillStyle = '#f3ead2';
    g.fillRect(-27, 6, 54, 9);
    g.strokeStyle = '#d4a842';
    g.lineWidth = 1;
    for (const y of [4, 17]) {
      g.beginPath();
      g.moveTo(-26, y);
      g.lineTo(26, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(-14, 30);
    g.bezierCurveTo(-6, 22, 6, 38, 14, 30);
    g.moveTo(-14, 36);
    g.bezierCurveTo(-6, 44, 6, 28, 14, 36);
    g.stroke();
    // chrome face plate at the head
    const chrome = g.createLinearGradient(-18, 0, 18, 0);
    chrome.addColorStop(0, '#7d858e');
    chrome.addColorStop(0.4, '#f4f7fa');
    chrome.addColorStop(0.7, '#c3c9d0');
    chrome.addColorStop(1, '#6b737c');
    g.fillStyle = chrome;
    g.beginPath();
    g.roundRect(-17, -60, 34, 22, 7);
    g.fill();
    g.strokeStyle = 'rgba(40,45,50,0.7)';
    g.lineWidth = 1;
    g.stroke();
    // the little lamp under the head
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.ellipse(0, -44, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    // spool of gold thread
    g.fillStyle = '#7a4b25';
    g.beginPath();
    g.ellipse(12, -14, 9, 9, 0, 0, Math.PI * 2);
    g.fill();
    const spool = g.createRadialGradient(9, -17, 1, 12, -14, 8);
    spool.addColorStop(0, '#fff0a6');
    spool.addColorStop(0.6, '#e6b532');
    spool.addColorStop(1, '#9a6c12');
    g.fillStyle = spool;
    g.beginPath();
    g.arc(12, -14, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,80,10,0.5)';
    g.lineWidth = 0.6;
    for (let r = 3; r < 7; r += 1.2) {
      g.beginPath();
      g.arc(12, -14, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#5a3418';
    g.beginPath();
    g.arc(12, -14, 2, 0, Math.PI * 2);
    g.fill();
    // a chrome dial
    const dial = g.createRadialGradient(-13, -20, 1, -12, -18, 6);
    dial.addColorStop(0, '#ffffff');
    dial.addColorStop(1, '#7a828b');
    g.fillStyle = dial;
    g.beginPath();
    g.arc(-12, -18, 5.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3b4248';
    g.beginPath();
    g.moveTo(-12, -18);
    g.lineTo(-12, -22.5);
    g.stroke();
    // highlight down the enamel
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-12, -34, 4, 100);
  });
}

function paintFoot() {
  return makeSprite(36, 32, (g) => {
    g.fillStyle = 'rgba(10,5,0,0.35)';
    g.beginPath();
    g.roundRect(-13, -9, 30, 22, 6);
    g.fill();
    const chrome = g.createLinearGradient(-15, 0, 15, 0);
    chrome.addColorStop(0, '#6d757e');
    chrome.addColorStop(0.35, '#f6f8fb');
    chrome.addColorStop(0.65, '#b9c0c8');
    chrome.addColorStop(1, '#5e666e');
    g.fillStyle = chrome;
    // two toes either side of the needle slot
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 3, 10);
      g.lineTo(s * 3, -10);
      g.quadraticCurveTo(s * 3, -13, s * 7, -13);
      g.quadraticCurveTo(s * 14, -12, s * 14, -4);
      g.lineTo(s * 13, 10);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30,35,40,0.75)';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = chrome;
    g.beginPath();
    g.roundRect(-14, 4, 28, 8, 3);
    g.fill();
    g.stroke();
    // feed dog teeth glinting through the slot
    g.fillStyle = 'rgba(40,40,45,0.8)';
    for (let y = -8; y < 4; y += 3) g.fillRect(-1.5, y, 3, 1.2);
  });
}

function paintPin() {
  return makeSprite(56, 18, (g) => {
    // shadow
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-18, 3);
    g.lineTo(26, 3);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.arc(-19, 3.5, 6, 0, Math.PI * 2);
    g.fill();
    // steel shaft
    const steel = g.createLinearGradient(0, -1.5, 0, 1.5);
    steel.addColorStop(0, '#ffffff');
    steel.addColorStop(0.5, '#c4cad2');
    steel.addColorStop(1, '#6e757e');
    g.fillStyle = steel;
    g.beginPath();
    g.moveTo(-20, -1.3);
    g.lineTo(22, -0.6);
    g.lineTo(26, 0);
    g.lineTo(22, 0.6);
    g.lineTo(-20, 1.3);
    g.closePath();
    g.fill();
    // glass head
    const head = g.createRadialGradient(-23, -3, 0.5, -21, -1, 6.5);
    head.addColorStop(0, '#ffd0d0');
    head.addColorStop(0.3, '#ff4152');
    head.addColorStop(0.8, '#b0141f');
    head.addColorStop(1, '#5e0810');
    g.fillStyle = head;
    g.beginPath();
    g.arc(-21, -1, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(-23, -3.2, 1.4, 0, Math.PI * 2);
    g.fill();
  });
}

// ---------- game ----------

export default {
  id: 'seam',
  title: 'Seam Stress',
  emoji: '🧵',
  tagline: 'Keep the needle on the chalk seam. Where it splits, avoid the pin.',
  colors: { bg: '#2a1c18', fg: '#fbefd6', accent: '#e6b532' },

  // Electro swing: a 1930s ballroom tune on a modern four-on-the-floor, G minor at 128 BPM
  // (i–VI–iv–V). Swung hats and a bouncing octave bass from the first bar, then a clap and offbeat
  // piano-like chord stabs, then a clarinet-ish square-wave melody, then brass hits, a running
  // sewing-machine 16th chatter and a high pizzicato line for the last 15 seconds. 32 bars = 60s.
  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("g2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const hats = s("white*8").swing(4).decay(0.03).sustain(0).hpf(6800).gain("[0.035 0.055]*4")
      const chatter = s("white*16").decay(0.018).sustain(0).hpf(7000).gain("[0.02 0.04 0.03 0.04]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1300).lpf(5200).gain(0.17).room(0.35).roomsize(3)
      const bass = note("<[g2 g3 d3 g3 bb2 g3 d3 f3] [eb2 eb3 bb2 eb3 g2 eb3 bb2 d3] [c3 c4 g3 c4 eb3 c4 g3 bb3] [d2 d3 a2 d3 fs2 d3 a2 c3]>")
        .swing(4).s("sawtooth").decay(0.12).sustain(0.15).release(0.05).lpf(saw.range(500, 1400).slow(32)).lpq(3).gain(0.36)
      const chords = "<[g3,bb3,d4] [eb3,g3,bb3] [c3,eb3,g3] [d3,fs3,a3,c4]>"
      const stabs = note(chords).struct("~ x ~ x ~ x ~ x").swing(4).s("square")
        .decay(0.09).sustain(0).lpf(saw.range(1200, 2400).slow(32)).gain(0.075).pan(0.4)
      const pad = note(chords).s("triangle").attack(0.2).release(0.4).gain(0.08)
      const lead = note("<[d5 ~ bb4 d5 g5 ~ fs5 g5] [g5 ~ f5 eb5 d5 ~ bb4 ~] [c5 ~ eb5 g5 f5 eb5 d5 c5] [d5 ~ fs5 a5 c6 ~ a5 fs5]>")
        .swing(4).s("square").decay(0.16).sustain(0.35).release(0.08).lpf(2200).gain(0.075).pan(0.6)
        .delay(0.18).delaytime(0.352).delayfeedback(0.25)
      const brass = note("<[[g4,bb4,d5] ~ ~ [g4,bb4,d5] ~ ~ [a4,c5,f5] ~] [[g4,bb4,eb5] ~ ~ [g4,bb4,eb5] ~ ~ [f4,bb4,d5] ~] [[g4,c5,eb5] ~ ~ [g4,c5,eb5] ~ ~ [g4,bb4,d5] ~] [[fs4,a4,d5] ~ ~ [fs4,a4,d5] ~ [fs4,a4,c5] ~ ~]>")
        .swing(4).s("sawtooth").decay(0.14).sustain(0.2).release(0.06).lpf(2000).gain(0.06)
      const pizz = note("<[g5 d6 bb5 d6]*2 [g5 eb6 bb5 eb6]*2 [g5 c6 eb6 c6]*2 [fs5 a5 d6 a5]*2>").swing(4).s("triangle")
        .decay(0.06).sustain(0).gain(0.05).delay(0.25).delaytime(0.234).delayfeedback(0.3)
    `,
    song: `arrange(
      [8, stack(kick, hats, bass)],
      [8, stack(kick, hats, clap, bass, stabs, pad)],
      [8, stack(kick, hats, clap, bass, stabs, pad, lead)],
      [8, stack(kick, hats, chatter, clap, bass, stabs, pad, lead, brass, pizz)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const deco = rng.fork('deco');
    const plan = rng.fork('plan');

    // ---- how far the quilt has moved at every moment (it only depends on time) ----
    const dist = [0];
    for (let i = 1; i <= 6600; i++) dist.push(dist[i - 1] + speedAt((i - 0.5) * TABLE_DT) * TABLE_DT);
    const Dat = (t) => {
      const f = Math.max(0, t) / TABLE_DT;
      const i = Math.min(Math.floor(f), dist.length - 2);
      return dist[i] + (dist[i + 1] - dist[i]) * (f - i);
    };
    const tAt = (d) => {
      if (d <= 0) return 0;
      let lo = 0;
      let hi = dist.length - 1;
      if (d >= dist[hi]) return hi * TABLE_DT;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (dist[m] <= d) lo = m;
        else hi = m;
      }
      return (lo + (d - dist[lo]) / (dist[hi] - dist[lo])) * TABLE_DT;
    };

    // ---- the chalk seam: smooth swings between waypoints, wilder and quicker over the minute ----
    const wp = [{ d: -1000, x: W / 2 }, { d: Dat(3), x: W / 2 }];
    {
      let T = 3;
      let x = W / 2;
      let s = plan.chance(0.5) ? 1 : -1;
      while (T < 64) {
        const p = progress(T, 60, 1.2);
        const dur = plan.range(lerp(0.95, 0.5, p), lerp(1.6, 0.85, p));
        const vmax = lerp(0.42, 0.78, p) * PATH_SPEED;
        const amax = lerp(700, 1900, p);
        const dxMax = Math.min((vmax * dur * 2) / Math.PI, (amax * dur * dur * 2) / (Math.PI * Math.PI));
        const dx = plan.range(lerp(0.2, 0.5, p), 1) * dxMax;
        if (plan.chance(lerp(0.55, 0.75, p))) s = -s;
        if (x + s * dx > X_MAX || x + s * dx < X_MIN) s = -s;
        x = clamp(x + s * dx, X_MIN, X_MAX);
        T += dur;
        wp.push({ d: Dat(T), x });
      }
    }
    const mainX = (d) => {
      let lo = 0;
      let hi = wp.length - 1;
      if (d >= wp[hi].d) return wp[hi].x;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (wp[m].d <= d) lo = m;
        else hi = m;
      }
      const a = wp[lo];
      const b = wp[hi];
      const u = (d - a.d) / (b.d - a.d);
      return a.x + (b.x - a.x) * (1 - Math.cos(Math.PI * u)) * 0.5;
    };

    // ---- forks: a second chalk line peels off and stops dead at a pin ----
    const forks = [];
    {
      let T = plan.range(7.5, 9);
      while (T < 57) {
        const p = progress(T, 60, 1.2);
        const split = lerp(0.5, 0.38, p);
        const hold = plan.range(0.45, 0.8);
        const d0 = Dat(T);
        const dS = Dat(T + split);
        const d1 = Dat(T + split + hold);
        let lo = Infinity;
        let hi = -Infinity;
        for (let d = d0; d <= d1; d += 6) {
          const x = mainX(d);
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
        const A = plan.range(84, 104);
        const opts = [];
        if (hi + A <= W - 24) opts.push(1);
        if (lo - A >= 24) opts.push(-1);
        const side = opts.length ? plan.pick(opts) : 0;
        if (side) forks.push({ d0, dS, d1, A, side, rot: deco.range(-0.45, 0.45) + (side > 0 ? Math.PI : 0) });
        T += plan.range(lerp(6.5, 3.4, p), lerp(8.5, 4.8, p));
      }
    }
    const decoyX = (f, d) => mainX(d) + f.side * f.A * smooth(clamp((d - f.d0) / (f.dS - f.d0), 0, 1));

    // ---- rubbed-out chalk: short stretches where you carry the curve by eye ----
    const gaps = [];
    {
      let T = plan.range(21, 24);
      while (T < 58) {
        const p = progress(T, 60, 1.2);
        const len = plan.range(0.28, lerp(0.42, 0.55, p));
        const a = Dat(T - 0.9);
        const b = Dat(T + len + 0.4);
        if (!forks.some((f) => f.d1 > a && f.d0 < b)) {
          const g0 = Dat(T);
          const g1 = Dat(T + len);
          const smudges = Array.from({ length: 5 }, () => {
            const d = deco.range(g0, g1);
            return { d, dx: deco.range(-12, 12), size: deco.range(22, 40), a: deco.range(0.06, 0.12) };
          });
          gaps.push({ g0, g1, smudges });
        }
        T += plan.range(lerp(4.2, 2.3, p), lerp(6, 3.6, p));
      }
    }
    const inGap = (d) => gaps.some((g) => d > g.g0 && d < g.g1);

    // ---- the quilt ----
    const patchArt = PATTERNS.map((k) => paintPatch(k, art));
    const rowsNeeded = Math.ceil(Dat(66) / PATCH) + 10;
    const quilt = [];
    for (let r = 0; r < rowsNeeded; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        let k;
        do k = deco.int(0, PATTERNS.length - 1);
        while (k === row[c - 1] || k === quilt[r - 1]?.[c]);
        row.push(k);
      }
      quilt.push(row);
    }

    const machineArt = paintMachine();
    const footArt = paintFoot();
    const pinArt = paintPin();
    const lamp = glowSprite('rgba(255,210,140,1)', 90);
    const warnGlow = glowSprite('rgba(255,60,50,1)', 30);
    const pinGlow = glowSprite('rgba(255,70,80,1)', 20);
    const smudge = glowSprite('rgba(255,255,250,1)', 20);
    const mote = glowSprite('rgba(255,235,190,1)', 6);
    const vignette = vignetteSprite(W, H, 0.7, '20,8,4');

    const needle = createMover({ x: W / 2, minX: 18, maxX: W - 18, speed: MOVE_SPEED, accel: 10 });
    const fluff = createParticles();
    const sparks = createParticles();
    const motes = Array.from({ length: 16 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 6, ph: Math.random() * 6.28 }));

    let D = 0;
    let lastT = 0;
    let clock = 0;
    let bobPhase = 0;
    let warn = 0;
    let shake = 0;
    let nextStitch = STITCH;
    const stitches = [{ d: 0, x: W / 2 }];

    const yOf = (d) => NEEDLE_Y - (d - D);

    function die(reason, pin) {
      game.dead = true;
      game.deathReason = reason;
      shake = 1;
      const x = needle.x;
      if (pin) {
        sparks.burst(x, NEEDLE_Y, { count: 44, speed: 260, life: 0.7, size: 2.6, colors: ['#ffffff', '#dfe6ee', '#ffe28a', '#ff8a5a'], drag: 2 });
      } else {
        sparks.burst(x, NEEDLE_Y, { count: 16, speed: 150, life: 0.5, size: 2, colors: ['#ffe28a', '#ffffff'], drag: 3 });
      }
      fluff.burst(x, NEEDLE_Y, { count: 30, speed: 120, life: 1.2, size: 3, colors: ['#e6b532', '#f7d778', '#c08a1c', '#fff3c4'], drag: 2.5 });
    }

    const game = {
      dead: false,
      deathReason: '',
      mainX,
      Dat,
      get x() {
        return needle.x;
      },

      update(dt, dir, t) {
        clock += dt;
        lastT = t + dt;
        needle.update(dt, dir);
        const prevD = D;
        D = Dat(t + dt);
        bobPhase += dt * speedAt(t) * 0.9;

        const x = needle.x;
        const tol = tolAt(t + dt);
        let err = Math.abs(x - mainX(D));
        let onDecoy = false;
        for (const f of forks) {
          if (prevD < f.d1 && D >= f.d1 && err > tol) {
            die('Sewed down the wrong branch of the chalk and snapped the needle on a pin.', true);
            return;
          }
          if (D >= f.d0 && D < f.d1) {
            const e = Math.abs(x - decoyX(f, D));
            if (e <= tol) onDecoy = true;
            err = Math.min(err, e);
          }
        }
        if (err > tol && !onDecoy) {
          die('The stitches wandered off the chalk line and ruined the seam.', false);
          return;
        }
        warn = clamp((err / tol - 0.5) / 0.5, 0, 1);

        while (D >= nextStitch) {
          stitches.push({ d: nextStitch, x });
          nextStitch += STITCH;
          if (Math.random() < 0.06) fluff.burst(x, NEEDLE_Y + 4, { count: 1, speed: 30, life: 0.8, size: 2.5, colors: ['rgba(255,240,200,0.7)'], drag: 1 });
        }
        while (stitches.length > 2 && D - stitches[1].d > 130) stitches.shift();
        fluff.update(dt, speedAt(t));
        sparks.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 2.5);
        fluff.update(dt);
        sparks.update(dt);
      },

      render(g) {
        const t = lastT;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

        // the quilt, rolling towards you
        const r0 = Math.max(0, Math.floor((D - 120) / PATCH));
        const r1 = Math.min(quilt.length - 1, Math.floor((D + NEEDLE_Y + 20) / PATCH));
        for (let r = r0; r <= r1; r++) {
          const cy = yOf(r * PATCH + PATCH / 2);
          for (let c = 0; c < 3; c++) drawSprite(g, patchArt[quilt[r][c]], c * PATCH + PATCH / 2, cy, { size: PATCH + 1 });
        }

        const dLo = D - (H - NEEDLE_Y) - 10;
        const dHi = D + NEEDLE_Y + 20;

        // the seam allowance: a pale band around every chalk line
        const band = (xf, a, b, skipGaps) => {
          a = Math.max(a, dLo);
          b = Math.min(b, dHi);
          let run = [];
          const flush = () => {
            if (run.length > 1) {
              g.beginPath();
              for (let i = 0; i < run.length; i++) g.lineTo(run[i][0] - run[i][2], run[i][1]);
              for (let i = run.length - 1; i >= 0; i--) g.lineTo(run[i][0] + run[i][2], run[i][1]);
              g.closePath();
              g.fill();
              g.beginPath();
              for (const side of [-1, 1]) {
                g.moveTo(run[0][0] + side * run[0][2], run[0][1]);
                for (let i = 1; i < run.length; i++) g.lineTo(run[i][0] + side * run[i][2], run[i][1]);
              }
              g.stroke();
            }
            run = [];
          };
          for (let d = a; d <= b + 0.01; d += 9) {
            const dd = Math.min(d, b);
            if (skipGaps && inGap(dd)) {
              flush();
              continue;
            }
            run.push([xf(dd), yOf(dd), Math.min(150, tolAt(tAt(dd)))]);
          }
          flush();
        };
        g.fillStyle = 'rgba(255,248,230,0.12)';
        g.strokeStyle = 'rgba(255,245,220,0.28)';
        g.lineWidth = 1;
        band(mainX, dLo, dHi, true);
        for (const f of forks) if (f.d1 > dLo && f.d0 < dHi) band((d) => decoyX(f, d), f.d0, f.d1, false);

        // smudges where the chalk was rubbed away
        for (const gp of gaps) {
          if (gp.g1 < dLo || gp.g0 > dHi) continue;
          for (const s of gp.smudges) drawSprite(g, smudge, mainX(s.d) + s.dx, yOf(s.d), { size: s.size, alpha: s.a });
        }

        // chalk dashes, pinned to the fabric
        const dashes = (xf, a, b, skipGaps) => {
          const k0 = Math.ceil(Math.max(a, dLo) / DASH);
          const k1 = Math.floor(Math.min(b, dHi) / DASH);
          for (let k = k0; k <= k1; k++) {
            const s0 = k * DASH;
            const s1 = Math.min(s0 + 9, b);
            if (skipGaps && (inGap(s0) || inGap(s1))) continue;
            g.moveTo(xf(s0), yOf(s0));
            g.lineTo(xf(s1), yOf(s1));
          }
        };
        const chalk = () => {
          dashes(mainX, dLo, dHi, true);
          for (const f of forks) if (f.d1 > dLo && f.d0 < dHi) dashes((d) => decoyX(f, d), f.d0 + DASH, f.d1, false);
        };
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(25,12,8,0.45)';
        g.lineWidth = 5;
        g.beginPath();
        chalk();
        g.stroke();
        g.strokeStyle = 'rgba(248,250,255,0.95)';
        g.lineWidth = 2.6;
        g.beginPath();
        chalk();
        g.stroke();

        // the stitches already sewn, in gold thread
        g.lineWidth = 3.4;
        g.strokeStyle = 'rgba(40,20,0,0.6)';
        g.beginPath();
        for (let i = 1; i < stitches.length; i++) {
          const a = stitches[i - 1];
          const b = stitches[i];
          g.moveTo(a.x, yOf(a.d) + 1);
          g.lineTo(b.x, yOf(b.d) + 1);
        }
        g.stroke();
        g.lineWidth = 2;
        g.strokeStyle = '#f2c447';
        g.beginPath();
        for (let i = 1; i < stitches.length; i++) {
          const a = stitches[i - 1];
          const b = stitches[i];
          const ya = yOf(a.d);
          const yb = yOf(b.d);
          g.moveTo(lerp(a.x, b.x, 0.12), lerp(ya, yb, 0.12));
          g.lineTo(lerp(a.x, b.x, 0.88), lerp(ya, yb, 0.88));
        }
        // and the thread still running into the needle
        const last = stitches[stitches.length - 1];
        if (!this.dead) {
          g.moveTo(last.x, yOf(last.d));
          g.lineTo(needle.x, NEEDLE_Y);
        }
        g.stroke();

        // pins at the dead ends
        g.globalCompositeOperation = 'lighter';
        for (const f of forks) {
          const y = yOf(f.d1);
          if (y < -30 || y > H + 30) continue;
          drawSprite(g, pinGlow, decoyX(f, f.d1), y, { size: 56, alpha: 0.35 + 0.15 * Math.sin(clock * 6) });
        }
        g.globalCompositeOperation = 'source-over';
        for (const f of forks) {
          const y = yOf(f.d1);
          if (y < -30 || y > H + 30) continue;
          drawSprite(g, pinArt, decoyX(f, f.d1), y, { rot: f.rot, size: 68 });
        }

        // the lamp's warm pool of light
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, lamp, needle.x, NEEDLE_Y - 30, { size: 320, alpha: 0.2 });
        if (warn > 0 && !this.dead) drawSprite(g, warnGlow, needle.x, NEEDLE_Y, { size: 60, alpha: warn * 0.7 });
        g.globalCompositeOperation = 'source-over';

        // the machine, the presser foot and the needle
        const mx = needle.x;
        const tilt = needle.lean * 0.05;
        drawSprite(g, machineArt, mx, NEEDLE_Y + 64, { rot: tilt });
        drawSprite(g, footArt, mx, NEEDLE_Y + 2);
        const bob = this.dead ? 0 : Math.sin(bobPhase) * 0.5 + 0.5;
        g.lineCap = 'butt';
        if (this.dead && this.deathReason.includes('pin')) {
          g.strokeStyle = '#c8cfd8';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(mx, NEEDLE_Y - 16);
          g.lineTo(mx + 1, NEEDLE_Y - 8);
          g.stroke();
        } else {
          g.strokeStyle = 'rgba(30,30,35,0.8)';
          g.lineWidth = 3.4;
          g.beginPath();
          g.moveTo(mx, NEEDLE_Y - 18);
          g.lineTo(mx, NEEDLE_Y - 2 + bob * 3);
          g.stroke();
          g.strokeStyle = '#eef2f6';
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(mx, NEEDLE_Y - 18);
          g.lineTo(mx, NEEDLE_Y - 2 + bob * 3);
          g.stroke();
        }
        const hub = g.createRadialGradient(mx - 1.5, NEEDLE_Y - 20, 0.5, mx, NEEDLE_Y - 18, 5);
        hub.addColorStop(0, '#ffffff');
        hub.addColorStop(1, '#6f7780');
        g.fillStyle = hub;
        g.beginPath();
        g.arc(mx, NEEDLE_Y - 18, 4.5, 0, Math.PI * 2);
        g.fill();

        fluff.render(g);
        sparks.render(g, true);

        // dust motes floating in the lamplight
        g.globalCompositeOperation = 'lighter';
        for (const m of motes) {
          m.x += m.vx * 0.016;
          m.y += m.vy * 0.016;
          if (m.y < -10) (m.y = H + 10), (m.x = Math.random() * W);
          if (m.x < -10) m.x = W + 10;
          if (m.x > W + 10) m.x = -10;
          const near = clamp(1 - Math.hypot(m.x - mx, m.y - NEEDLE_Y) / 260, 0, 1);
          const a = (0.15 + 0.5 * near) * (0.6 + 0.4 * Math.sin(clock * 2 + m.ph));
          drawSprite(g, mote, m.x, m.y, { size: 8, alpha: a });
        }
        g.globalCompositeOperation = 'source-over';

        drawSprite(g, vignette, W / 2, H / 2);
        g.restore();
      },
    };
    return game;
  },
};
