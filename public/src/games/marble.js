// Marble Maze — a steel ball rolling up an old wooden tilt labyrinth. You never push the ball: you tilt
// the board, and the ball picks up speed and keeps it, so every move has to be started early and
// caught again before it carries you too far. Rows of holes leave a single gap, wooden rails split
// the board into lanes, and later whole stretches of the board are warped and pull the ball sideways.

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

const BALL_Y = 540;
const R = 11; // ball radius
const FRAME = 16; // walnut frame on each side
const TOP = 40; // far wall of the box (behind the timer)
const FRONT = 598; // near wall of the box, with the tilt knob
const ACCEL = 760; // full tilt
const FRICTION = 1.3; // rolling friction, per second
const VMAX = 520;
const BOUNCE = 0.45;
const SPACING = 28; // hole spacing in a perforated row
const LINE_R = 13.5;
const TABLE_DT = 0.01;
const MAX_ANGLE = 0.17; // how far the box visibly rolls on full tilt (radians, ~10°)
const CAMERA = 520; // camera distance for the perspective of the tilted box
const STRIPS = 48; // vertical slices used to draw the box in perspective
const BOX_DEPTH = 30; // height of the box's outer side, seen when that side dips

const speedAt = (t) => lerp(150, 330, progress(t, 60, 1.2));
const smooth = (u) => u * u * (3 - 2 * u);

// ---------- art ----------

function paintBoard(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#d9b17a');
    base.addColorStop(0.5, '#e6c38f');
    base.addColorStop(1, '#d4a96f');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // broad bands of darker and lighter wood
    for (let i = 0; i < 9; i++) {
      const x = rng.range(FRAME, W - FRAME);
      const w = rng.range(14, 50);
      g.fillStyle = rng.chance(0.5) ? 'rgba(160,100,50,0.08)' : 'rgba(255,235,200,0.1)';
      g.fillRect(x - w / 2, 0, w, H);
    }
    // grain: wavy lines that repeat exactly every H, so the board tiles seamlessly
    for (let i = 0; i < 90; i++) {
      const x0 = rng.range(0, W);
      const a = rng.range(1, 9);
      const k = rng.int(1, 3);
      const b = rng.range(0, 3);
      const m = rng.int(4, 9);
      const ph = rng.range(0, 6.28);
      const ph2 = rng.range(0, 6.28);
      g.strokeStyle = `rgba(${rng.pick(['140,85,40', '120,70,30', '170,110,55'])},${rng.range(0.07, 0.24)})`;
      g.lineWidth = rng.range(0.5, 1.8);
      g.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const x = x0 + a * Math.sin((Math.PI * 2 * k * y) / H + ph) + b * Math.sin((Math.PI * 2 * m * y) / H + ph2);
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // a couple of knots, with rings of grain wrapped around them
    for (let i = 0; i < 3; i++) {
      const x = rng.range(60, W - 60);
      const y = rng.range(0, H);
      for (const yy of [y - H, y, y + H]) {
        for (let r = 22; r > 2; r -= 3.5) {
          g.strokeStyle = `rgba(120,70,30,${0.08 + (22 - r) * 0.012})`;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(x, yy, r * 0.55, r * 1.3, 0, 0, Math.PI * 2);
          g.stroke();
        }
        const c = g.createRadialGradient(x, yy, 0, x, yy, 5);
        c.addColorStop(0, 'rgba(90,50,20,0.7)');
        c.addColorStop(1, 'rgba(90,50,20,0)');
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, yy, 4, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // pencil scuffs and tiny dents
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(90,55,25,${rng.range(0.05, 0.15)})`;
      g.fillRect(rng.range(FRAME, W - FRAME), rng.range(0, H), rng.range(1, 3), rng.range(1, 2));
    }
    // the walnut frame on both sides, with brass screws
    for (const side of [0, 1]) {
      const x0 = side ? W - FRAME : 0;
      const f = g.createLinearGradient(x0, 0, x0 + FRAME, 0);
      if (side) {
        f.addColorStop(0, '#8a5a34');
        f.addColorStop(0.2, '#5e3720');
        f.addColorStop(1, '#2e180c');
      } else {
        f.addColorStop(0, '#2e180c');
        f.addColorStop(0.8, '#5e3720');
        f.addColorStop(1, '#8a5a34');
      }
      g.fillStyle = f;
      g.fillRect(x0, 0, FRAME, H);
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = 'rgba(20,8,2,0.35)';
        g.lineWidth = 0.8;
        const gx = x0 + rng.range(2, FRAME - 2);
        g.beginPath();
        g.moveTo(gx, 0);
        g.lineTo(gx, H);
        g.stroke();
      }
      // the shadow the frame casts on the board
      const s = g.createLinearGradient(side ? W - FRAME : FRAME, 0, side ? W - FRAME - 12 : FRAME + 12, 0);
      s.addColorStop(0, 'rgba(60,30,10,0.4)');
      s.addColorStop(1, 'rgba(60,30,10,0)');
      g.fillStyle = s;
      g.fillRect(side ? W - FRAME - 12 : FRAME, 0, 12, H);
      for (let y = 40; y < H; y += 160) {
        const cx = x0 + FRAME / 2;
        const sc = g.createRadialGradient(cx - 1, y - 1, 0, cx, y, 3.5);
        sc.addColorStop(0, '#fff2c0');
        sc.addColorStop(0.5, '#c9a24a');
        sc.addColorStop(1, '#6e5220');
        g.fillStyle = sc;
        g.beginPath();
        g.arc(cx, y, 3.5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(60,40,10,0.8)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx - 2.4, y - 1);
        g.lineTo(cx + 2.4, y + 1);
        g.stroke();
      }
    }
  }, 1.5);
}

function paintHole() {
  const r = 20;
  return makeSprite(r * 2 + 10, r * 2 + 10, (g) => {
    // a thin painted ring around the hole, like on the old wooden games
    g.strokeStyle = 'rgba(40,20,10,0.6)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(0, 0, r + 2.5, 0, Math.PI * 2);
    g.stroke();
    // bevelled edge: lit on the far side, in shadow on the near side
    const rim = g.createLinearGradient(0, -r, 0, r);
    rim.addColorStop(0, '#7a4a24');
    rim.addColorStop(1, '#f2d4a0');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    // the dark pit
    const pit = g.createRadialGradient(0, 3, 1, 0, 1, r - 2);
    pit.addColorStop(0, '#050201');
    pit.addColorStop(0.7, '#140904');
    pit.addColorStop(1, '#3a1f0e');
    g.fillStyle = pit;
    g.beginPath();
    g.arc(0, 1.2, r - 2, 0, Math.PI * 2);
    g.fill();
  });
}

function paintBall() {
  return makeSprite(30, 30, (g) => {
    const r = R;
    const body = g.createRadialGradient(-4, -5, 1, 0, 0, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.18, '#e8eef4');
    body.addColorStop(0.55, '#8d99a6');
    body.addColorStop(0.85, '#3f4852');
    body.addColorStop(1, '#1d232a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    // the room reflected in the steel: a warm floor, a dark horizon, a pale sky
    g.save();
    g.beginPath();
    g.arc(0, 0, r - 0.4, 0, Math.PI * 2);
    g.clip();
    const floor = g.createLinearGradient(0, 1, 0, r);
    floor.addColorStop(0, 'rgba(120,70,30,0.0)');
    floor.addColorStop(0.3, 'rgba(200,140,70,0.45)');
    floor.addColorStop(1, 'rgba(110,60,25,0.55)');
    g.fillStyle = floor;
    g.fillRect(-r, 1.5, r * 2, r);
    g.fillStyle = 'rgba(30,35,45,0.55)';
    g.beginPath();
    g.ellipse(0, 1.8, r, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    // a window
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(-6.5, -7.5, 3, 3.6);
    g.fillRect(-2.8, -7.5, 3, 3.6);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(-4.3, -5.2, 1.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(10,12,16,0.6)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.arc(0, 0, r - 0.3, 0, Math.PI * 2);
    g.stroke();
  });
}

function paintRail(len) {
  return makeSprite(14, len + 8, (g) => {
    // shadow on the board
    g.fillStyle = 'rgba(60,30,10,0.35)';
    g.beginPath();
    g.roundRect(-4 + 3, -len / 2 + 3, 9, len, 4);
    g.fill();
    const w = g.createLinearGradient(-4.5, 0, 4.5, 0);
    w.addColorStop(0, '#f4d8a8');
    w.addColorStop(0.35, '#c99a5e');
    w.addColorStop(1, '#7a4c26');
    g.fillStyle = w;
    g.beginPath();
    g.roundRect(-4.5, -len / 2, 9, len, 4);
    g.fill();
    g.strokeStyle = 'rgba(80,45,20,0.7)';
    g.lineWidth = 0.8;
    g.stroke();
    // grain along the rail
    g.strokeStyle = 'rgba(120,70,30,0.3)';
    g.lineWidth = 0.6;
    for (const x of [-1.5, 1, 2.8]) {
      g.beginPath();
      g.moveTo(x, -len / 2 + 4);
      g.lineTo(x + 0.4, len / 2 - 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,245,220,0.5)';
    g.fillRect(-3.4, -len / 2 + 3, 1.2, len - 6);
  });
}

function paintChevron() {
  return makeSprite(30, 22, (g) => {
    g.strokeStyle = 'rgba(170,50,30,0.55)';
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const dx of [-6, 4]) {
      g.beginPath();
      g.moveTo(dx - 4, -7);
      g.lineTo(dx + 4, 0);
      g.lineTo(dx - 4, 7);
      g.stroke();
    }
  });
}

function paintKnob() {
  return makeSprite(46, 46, (g) => {
    const r = 19;
    // knurled edge
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.fillStyle = k % 2 ? '#5b3b12' : '#a77a2e';
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r + 2, a, a + (Math.PI * 2) / 28);
      g.closePath();
      g.fill();
    }
    const face = g.createRadialGradient(-5, -6, 1, 0, 0, r);
    face.addColorStop(0, '#fff1bf');
    face.addColorStop(0.4, '#d8ad4e');
    face.addColorStop(1, '#7a5518');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, 0, r - 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(70,45,10,0.6)';
    g.lineWidth = 1;
    for (let rr = 5; rr < r - 2; rr += 3.5) {
      g.beginPath();
      g.arc(0, 0, rr, 0, Math.PI * 2);
      g.stroke();
    }
    // the pointer notch
    g.fillStyle = '#3a2208';
    g.beginPath();
    g.roundRect(-1.8, -r + 2, 3.6, 9, 1.5);
    g.fill();
  });
}

function paintWall(W, h, near) {
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const f = g.createLinearGradient(0, 0, 0, h);
    if (near) {
      f.addColorStop(0, '#9a6638');
      f.addColorStop(0.12, '#5e3720');
      f.addColorStop(1, '#24120a');
    } else {
      f.addColorStop(0, '#1f0f07');
      f.addColorStop(0.85, '#4f2e1a');
      f.addColorStop(1, '#8a5a34');
    }
    g.fillStyle = f;
    g.fillRect(0, 0, W, h);
    g.strokeStyle = 'rgba(15,6,2,0.35)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 18; i++) {
      const y = 3 + Math.random() * (h - 6);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + 2, W * 0.6, y - 2, W, y + 1);
      g.stroke();
    }
    // its shadow on the board
    const s = near ? g.createLinearGradient(0, 0, 0, -10) : g.createLinearGradient(0, h, 0, h + 14);
    s.addColorStop(0, 'rgba(50,25,8,0.4)');
    s.addColorStop(1, 'rgba(50,25,8,0)');
    g.fillStyle = s;
    if (!near) g.fillRect(0, h, W, 14);
  }, 1.5);
}

function paintTable(W, H) {
  // the dark tabletop the box sits on, glimpsed around it when it tilts
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const f = g.createRadialGradient(W * 0.3, H * 0.25, 20, W / 2, H / 2, H * 0.8);
    f.addColorStop(0, '#4a2a16');
    f.addColorStop(1, '#170b05');
    g.fillStyle = f;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * H;
      g.strokeStyle = `rgba(10,4,1,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 0.6 + Math.random();
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + 4, W * 0.7, y - 4, W, y + 2);
      g.stroke();
    }
  }, 1);
}

// ---------- game ----------

export default {
  id: 'marble',
  title: 'Marble Maze',
  emoji: '🔘',
  tagline: 'Tilt the board to roll the steel ball: it keeps its speed, so start turning early and catch it in time. Roll into a single hole and it’s over.',
  colors: { bg: '#2e180c', fg: '#fbe9cf', accent: '#d8432f' },

  // Acid house in F♯ minor at 132 BPM: a squelchy sawtooth "303" line with a resonant filter that
  // opens across the whole minute (like the knob tilting the board), four-on-the-floor from bar one,
  // then claps and rave stabs, then a hook lead, then a second acid line an octave up for the finale.
  // 33 bars = 60s.
  music: {
    cps: 33 / 60,
    setup: `
      const kick = note("fs2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.045 0.035]*4")
      const clap = s("~ pink ~ pink").decay(0.13).sustain(0).hpf(1400).lpf(5200).gain(0.17).room(0.3).roomsize(2)
      const acid = note("<[fs2 fs3 fs2 a2 fs2 cs3 fs3 fs2 e3 fs2 a2 fs2 b2 fs2 cs3 a2] [d2 d3 d2 fs2 d2 a2 d3 d2 cs3 d2 fs2 d2 a2 d2 e3 fs2] [e2 e3 e2 gs2 e2 b2 e3 e2 d3 e2 gs2 e2 b2 e2 cs3 b2] [cs2 cs3 cs2 e2 cs2 gs2 cs3 cs2 b2 cs2 e2 cs2 gs2 cs2 b2 gs2]>")
        .s("sawtooth").decay(0.11).sustain(0.1).release(0.03)
        .lpf(sine.range(350, 1100).slow(4).add(saw.range(150, 1300).slow(33))).lpq(11).gain(0.3)
      const sub = note("<fs2 d2 e2 cs2>").s("triangle").struct("x ~ x ~ x ~ x ~").decay(0.2).sustain(0.3).gain(0.3)
      const chords = "<[fs3,a3,cs4,e4] [d3,fs3,a3,cs4] [e3,gs3,b3,d4] [cs3,e3,gs3,b3]>"
      const stabs = note(chords).struct("~ x ~ ~ ~ x ~ x").s("square")
        .decay(0.1).sustain(0).lpf(saw.range(1100, 2500).slow(33)).gain(0.07).pan(0.4)
        .delay(0.2).delaytime(0.341).delayfeedback(0.3)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(900).gain(0.06)
      const lead = note("<[cs5 ~ a4 cs5 fs5 ~ e5 cs5] [d5 ~ fs5 a5 fs5 ~ e5 d5] [e5 ~ gs5 b5 gs5 e5 ~ b4] [cs5 ~ e5 gs5 fs5 ~ e5 cs5]>")
        .s("square").decay(0.15).sustain(0.3).release(0.08).lpf(2400).gain(0.075).pan(0.6)
        .delay(0.22).delaytime(0.341).delayfeedback(0.28)
      const acid2 = note("<[fs4 ~ fs4 a4 ~ cs5 ~ e5]*2 [d4 ~ d4 fs4 ~ a4 ~ cs5]*2 [e4 ~ e4 gs4 ~ b4 ~ d5]*2 [cs4 ~ cs4 e4 ~ gs4 ~ b4]*2>")
        .s("sawtooth").decay(0.08).sustain(0).lpf(sine.range(800, 2600).slow(2)).lpq(9).gain(0.06).pan(0.3)
    `,
    song: `arrange(
      [8, stack(kick, hats, acid, sub)],
      [8, stack(kick, hats, clap, acid, sub, stabs, pad)],
      [8, stack(kick, hats, shaker, clap, acid, sub, stabs, pad, lead)],
      [9, stack(kick, hats, shaker, clap, acid, sub, stabs, pad, lead, acid2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const board = paintBoard(W, H, art);
    const holeArt = paintHole();
    const ballArt = paintBall();
    const railArt = { 120: paintRail(120), 180: paintRail(180), 240: paintRail(240) };
    const chevron = paintChevron();
    const knob = paintKnob();
    const farWall = paintWall(W, TOP, false);
    const nearWall = paintWall(W, H - FRONT, true);
    const lamp = glowSprite('rgba(255,214,150,1)', 140);
    const shine = glowSprite('rgba(255,250,235,1)', 16);
    const vignette = vignetteSprite(W, H, 0.5, '30,12,4');
    const table = paintTable(W, H);
    // the whole box is drawn flat into this layer, then projected onto the screen as a tilted plane
    const scene = document.createElement('canvas');
    const sg = scene.getContext('2d');
    let sceneK = 0;
    const fx = createParticles();
    const xMin = FRAME + R;
    const xMax = W - FRAME - R;

    // ---- how far the board has rolled under the ball at every moment (it only depends on time) ----
    const dist = [0];
    for (let i = 1; i <= 6800; i++) dist.push(dist[i - 1] + speedAt((i - 0.5) * TABLE_DT) * TABLE_DT);
    const Dat = (t) => {
      const f = Math.max(0, t) / TABLE_DT;
      const i = Math.min(Math.floor(f), dist.length - 2);
      return dist[i] + (dist[i + 1] - dist[i]) * (f - i);
    };

    // ---- a guaranteed route first, then holes, rails and warps placed around it ----
    const segs = []; // { d0, d1, x0, x1 }
    const holes = []; // { x, d, r }
    const rails = []; // { x, d0, d1, art }
    const warps = []; // { d0, d1, push }
    const labels = []; // painted numbers by each row's gap
    const routeX = (d) => {
      for (const s of segs) if (d >= s.d0 && d <= s.d1) return s.x0 + (s.x1 - s.x0) * smooth((d - s.d0) / (s.d1 - s.d0));
      return d < (segs[0]?.d0 ?? 0) ? W / 2 : segs.at(-1).x1;
    };
    const clearOf = (x, d, r, gapPad = 24) => holes.every((h) => (h.x - x) ** 2 + (h.d - d) ** 2 > (h.r + r + gapPad) ** 2);
    const addLine = (d, gx, gw) => {
      const span = W - 2 * FRAME - 24;
      const n = Math.ceil(span / SPACING) + 1;
      for (let i = 0; i < n; i++) {
        const x = FRAME + 12 + (span * i) / (n - 1);
        if (Math.abs(x - gx) < gw / 2 + LINE_R + 1) continue;
        holes.push({ x, d, r: LINE_R });
      }
      labels.push({ x: gx, d: d - 30, n: labels.length + 1 });
    };
    {
      let T = 3;
      let x = W / 2;
      let last = '';
      let lastLine = false;
      while (T < 63) {
        const p = progress(T, 60, 1.2);
        const corr = lerp(46, 30, p);
        if (T > 17 && last !== 'warp' && plan.chance(lerp(0.2, 0.4, p))) {
          // a warped stretch of board that pulls the ball one way: hold your line against it
          const dur = plan.range(1.5, 2.2);
          const push = (plan.chance(0.5) ? -1 : 1) * lerp(250, 380, p);
          const x1 = clamp(x - Math.sign(push) * plan.range(0, 40), 70, W - 70);
          const s = { d0: Dat(T), d1: Dat(T + dur), x0: x, x1 };
          segs.push(s);
          warps.push({ d0: Dat(T + 0.15), d1: Dat(T + dur - 0.1), push });
          // holes waiting on the downhill side
          const n = Math.round(lerp(2, 4, p));
          for (let i = 0; i < n; i++) {
            const d = lerp(s.d0 + 60, s.d1 - 30, (i + plan.range(0.2, 0.8)) / n);
            const r = plan.range(15, 21);
            const hx = routeX(d) + Math.sign(push) * (corr + r + plan.range(6, 46));
            if (hx > FRAME + 6 && hx < W - FRAME - 6 && clearOf(hx, d, r)) holes.push({ x: hx, d, r });
          }
          addLine(s.d1, x1, lerp(64, 34, p));
          x = x1;
          T += dur;
          last = 'warp';
          lastLine = true;
          continue;
        }
        const dur = plan.range(lerp(1.3, 0.8, p), lerp(1.8, 1.05, p));
        const maxShift = Math.min(lerp(62, 88, p) * dur * dur, 250);
        const minShift = lerp(15, 0.55 * maxShift, p);
        let s1 = plan.chance(0.5) ? -1 : 1;
        let shift = plan.range(Math.min(minShift, maxShift), maxShift);
        if (x + s1 * shift < 50 || x + s1 * shift > W - 50) s1 = -s1;
        const x1 = clamp(x + s1 * shift, 50, W - 50);
        const s = { d0: Dat(T), d1: Dat(T + dur), x0: x, x1 };
        segs.push(s);
        const line = !lastLine || plan.chance(lerp(0.5, 0.7, p));
        if (line) {
          const gw = lerp(72, 32, p);
          addLine(s.d1, x1, gw);
          // a rail to split the board into lanes, so you have to pick your side well before the row
          if (T > 9 && plan.chance(lerp(0.25, 0.5, p))) {
            const len = plan.pick([120, 180, 240]);
            const d1 = s.d1 - plan.range(46, 70);
            const d0 = d1 - len;
            const side = x1 < W / 2 ? 1 : -1;
            const rx = x1 + side * (gw / 2 + plan.range(28, 60));
            let ok = rx > FRAME + 2 * R + 14 && rx < W - FRAME - 2 * R - 14;
            for (let d = d0; ok && d <= d1; d += 10) if (Math.abs(routeX(d) - rx) < R + 22) ok = false;
            if (ok) rails.push({ x: rx, d0, d1, art: railArt[len] });
          }
        }
        // loose holes scattered off the route
        if (!line || plan.chance(lerp(0.15, 0.7, p))) {
          const n = plan.int(line ? 1 : 2, line ? 2 : Math.round(lerp(3, 5, p)));
          for (let i = 0; i < n; i++) {
            const d = lerp(s.d0 + 50, s.d1 - (line ? 70 : 20), plan.next());
            const r = plan.range(15, 23);
            const hx = plan.range(FRAME + 8, W - FRAME - 8);
            if (Math.abs(hx - routeX(d)) < corr + r) continue;
            if (rails.some((rl) => d > rl.d0 - r - 30 && d < rl.d1 + r + 30 && Math.abs(rl.x - hx) < r + 34)) continue;
            if (clearOf(hx, d, r)) holes.push({ x: hx, d, r });
          }
        }
        x = x1;
        T += dur;
        last = 'move';
        lastLine = line;
      }
    }
    holes.sort((a, b) => a.d - b.d);

    // ---- cosmetic bits ----
    const motes = Array.from({ length: 18 }, () => ({ x: Math.random() * W, y: Math.random() * H, ph: Math.random() * 6.28, s: 0.5 + Math.random() }));

    const ball = { x: W / 2, vx: 0 };
    let tilt = 0;
    let lastT = 0;
    let clock = 0;
    let deadT = 0;
    let fallInto = null;
    let lastBump = -1;

    const yOf = (d, t) => BALL_Y - (d - Dat(t));

    const game = {
      dead: false,
      deathReason: '',
      get ball() {
        return ball;
      },
      holes,
      routeX,
      Dat,

      update(dt, dir, t) {
        lastT = t;
        clock += dt;
        tilt += (dir - tilt) * Math.min(1, 12 * dt);
        const D = Dat(t);
        let push = 0;
        for (const w of warps) if (D >= w.d0 && D <= w.d1) push = w.push;
        ball.vx += (tilt * ACCEL + push) * dt;
        ball.vx *= Math.exp(-FRICTION * dt);
        ball.vx = clamp(ball.vx, -VMAX, VMAX);
        ball.x += ball.vx * dt;

        // the frame and the rails bounce the ball back
        let bump = 0;
        if (ball.x < xMin) {
          ball.x = xMin;
          bump = Math.abs(ball.vx);
          ball.vx = Math.abs(ball.vx) * BOUNCE;
        } else if (ball.x > xMax) {
          ball.x = xMax;
          bump = Math.abs(ball.vx);
          ball.vx = -Math.abs(ball.vx) * BOUNCE;
        }
        for (const rl of rails) {
          if (D < rl.d0 - R || D > rl.d1 + R) continue;
          const ny = clamp(D, rl.d0, rl.d1);
          const dx = ball.x - rl.x;
          const dy = D - ny;
          const reach = R + 4.5;
          if (dx * dx + dy * dy >= reach * reach) continue;
          const side = dx >= 0 ? 1 : -1;
          const target = rl.x + side * Math.sqrt(Math.max(0, reach * reach - dy * dy));
          ball.x += (target - ball.x) * (dy ? 0.35 : 1);
          if (ball.vx * side < 0) {
            bump = Math.abs(ball.vx);
            ball.vx = -ball.vx * BOUNCE;
          }
          ball.vx = side * Math.max(Math.abs(ball.vx), 30);
        }
        if (bump > 120 && clock - lastBump > 0.15) {
          lastBump = clock;
          fx.burst(ball.x, BALL_Y, { count: 7, speed: 70, life: 0.4, size: 2.5, colors: ['#f2d4a0', '#c99a5e', '#fff2d8'], drag: 3 });
        }

        // holes
        for (const h of holes) {
          if (h.d < D - 40) continue;
          if (h.d > D + 40) break;
          const dx = ball.x - h.x;
          const dy = D - h.d;
          if (dx * dx + dy * dy < (h.r + 1) ** 2) {
            this.dead = true;
            fallInto = h;
            this.deathReason = push ? 'The warped board pulled the ball into a hole.' : 'The ball rolled into a hole.';
            fx.burst(h.x, yOf(h.d, t), { count: 22, speed: 90, life: 0.6, size: 2.5, colors: ['#f2d4a0', '#c99a5e', '#8a5a34', '#ffffff'], drag: 2 });
            return;
          }
        }

        // a little sawdust kicked up when the ball is really moving
        if (Math.abs(ball.vx) > 260 && Math.random() < 0.25) {
          fx.burst(ball.x - Math.sign(ball.vx) * R, BALL_Y + 4, { count: 1, speed: 20, life: 0.5, size: 2, colors: ['rgba(255,240,210,0.8)'] });
        }
        fx.update(dt, speedAt(t));
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        if (fallInto) {
          const k = Math.min(1, dt * 9);
          ball.x += (fallInto.x - ball.x) * k;
        }
        fx.update(dt);
      },

      render(g) {
        const k = clamp(g.getTransform?.()?.a || 2, 1, 2.5);
        if (k !== sceneK) {
          sceneK = k;
          scene.width = Math.ceil(W * k);
          scene.height = Math.ceil(H * k);
        }
        sg.setTransform(k, 0, 0, k, 0, 0);
        sg.clearRect(0, 0, W, H);
        drawBox(sg, game.dead);
        project(g);

        // warm lamp light and dust floating in it, in the room rather than on the board
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, lamp, W * 0.2, H * 0.22, { size: 520, alpha: 0.16 });
        for (const m of motes) {
          m.y -= 0.12 * m.s;
          m.x += Math.sin(clock * 0.6 + m.ph) * 0.1;
          if (m.y < 0) m.y = H;
          const a = 0.25 + 0.2 * Math.sin(clock * 1.3 + m.ph);
          g.fillStyle = `rgba(255,236,200,${a * 0.5})`;
          g.fillRect(m.x, m.y, 1.6 * m.s, 1.6 * m.s);
        }
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };

    // ---- the box rolls about its long axis: the dipping side sinks away from the camera and
    // shrinks, the rising side comes closer and grows, and the table shows around the edges ----
    function project(g) {
      const th = tilt * MAX_ANGLE;
      const cx = W / 2;
      const cy = H / 2;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const sAt = (x) => CAMERA / (CAMERA + (x - cx) * sin);
      const X = (x) => cx + (x - cx) * cos * sAt(x);
      drawSprite(g, table, W / 2, H / 2);
      // the box's shadow on the table, thrown towards the low side
      const sL = sAt(0);
      const sR = sAt(W);
      const lean = tilt * 7;
      g.fillStyle = 'rgba(5,2,0,0.5)';
      g.beginPath();
      g.moveTo(X(0) + lean + 3, cy - cy * sL + 8);
      g.lineTo(X(W) + lean + 3, cy - cy * sR + 8);
      g.lineTo(X(W) + lean + 3, cy + (H - cy) * sR + 8);
      g.lineTo(X(0) + lean + 3, cy + (H - cy) * sL + 8);
      g.fill();
      if (Math.abs(th) < 0.002) {
        g.drawImage(scene, 0, 0, W, H);
        return;
      }
      // the outer side of the box on the low side comes into view
      const lowX = th > 0 ? W : 0;
      const sl = sAt(lowX);
      const xl = X(lowX);
      const dd = Math.sign(th) * BOX_DEPTH * Math.abs(sin) * sl;
      const yt = cy - cy * sl;
      const yb = cy + (H - cy) * sl;
      const side = g.createLinearGradient(xl, 0, xl + dd, 0);
      side.addColorStop(0, '#5e3720');
      side.addColorStop(1, '#24120a');
      g.fillStyle = side;
      g.beginPath();
      g.moveTo(xl, yt);
      g.lineTo(xl + dd, yt + 2);
      g.lineTo(xl + dd, yb - 2);
      g.lineTo(xl, yb);
      g.fill();
      // the board itself, slice by slice
      const sw = W / STRIPS;
      const kx = scene.width / W;
      for (let i = 0; i < STRIPS; i++) {
        const x0 = i * sw;
        const x1 = x0 + sw;
        const s = sAt(x0 + sw / 2);
        const dx0 = X(x0);
        const dx1 = X(x1);
        g.drawImage(scene, x0 * kx, 0, sw * kx, scene.height, Math.min(dx0, dx1) - 0.3, cy - cy * s, Math.abs(dx1 - dx0) + 0.6, H * s);
      }
    }

    function drawBox(g, dead) {
      const t = lastT;
      const D = Dat(t);
      const off = D % H;
      drawSprite(g, board, W / 2, H / 2 + off);
      drawSprite(g, board, W / 2, H / 2 + off - H);

      // painted start mark
      const sy = yOf(-10, t);
      if (sy < H + 30) {
        g.strokeStyle = 'rgba(170,50,30,0.6)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(W / 2, sy, 20, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(170,50,30,0.65)';
        g.font = '800 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('START', W / 2, sy + 36);
      }

      // warped stretches: shaded like a slope, with arrows painted along them
      for (const w of warps) {
        const y0 = yOf(w.d1, t);
        const y1 = yOf(w.d0, t);
        if (y1 < 0 || y0 > H) continue;
        const dn = Math.sign(w.push);
        const grad = g.createLinearGradient(dn > 0 ? FRAME : W - FRAME, 0, dn > 0 ? W - FRAME : FRAME, 0);
        grad.addColorStop(0, 'rgba(255,240,210,0.16)');
        grad.addColorStop(1, 'rgba(90,40,10,0.24)');
        g.fillStyle = grad;
        g.fillRect(FRAME, y0, W - 2 * FRAME, y1 - y0);
        g.fillStyle = 'rgba(90,40,10,0.3)';
        g.fillRect(FRAME, y0, W - 2 * FRAME, 2);
        g.fillRect(FRAME, y1 - 2, W - 2 * FRAME, 2);
        for (let d = w.d0 + 30; d < w.d1 - 20; d += 70) {
          const y = yOf(d, t);
          if (y < -20 || y > H + 20) continue;
          for (const cx of [W * 0.3, W * 0.7]) drawSprite(g, chevron, cx, y, { rot: dn > 0 ? 0 : Math.PI });
        }
      }

      // painted numbers by each row's gap, like on the old wooden games
      g.font = '800 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const lb of labels) {
        const y = yOf(lb.d, t);
        if (y < TOP - 20 || y > FRONT + 20) continue;
        g.fillStyle = 'rgba(170,50,30,0.22)';
        g.beginPath();
        g.arc(lb.x, y, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(150,40,25,0.75)';
        g.fillText(String(lb.n), lb.x, y + 0.5);
      }

      // holes
      for (const h of holes) {
        const y = yOf(h.d, t);
        if (y > H + 30) continue;
        if (y < -30) break;
        drawSprite(g, holeArt, h.x, y, { size: ((holeArt.w * h.r) / 20) });
      }

      // rails
      for (const rl of rails) {
        const y0 = yOf(rl.d1, t);
        const y1 = yOf(rl.d0, t);
        if (y1 < -10 || y0 > H + 10) continue;
        drawSprite(g, rl.art, rl.x + 1, (y0 + y1) / 2 + 2);
      }

      // the ball, its shadow leaning with the board
      if (!dead) {
        g.fillStyle = 'rgba(50,25,8,0.35)';
        g.beginPath();
        g.ellipse(ball.x + 3 - tilt * 2, BALL_Y + 4, R + 1, R * 0.85, 0, 0, Math.PI * 2);
        g.fill();
        drawSprite(g, ballArt, ball.x, BALL_Y);
      } else if (fallInto) {
        const k = clamp(1 - deadT * 2.2, 0, 1);
        if (k > 0) {
          const y = yOf(fallInto.d, t);
          drawSprite(g, ballArt, ball.x, lerp(y, BALL_Y, k * k), { size: ballArt.w * (0.55 + 0.45 * k), alpha: 0.35 + 0.65 * k });
          g.fillStyle = `rgba(5,2,1,${(1 - k) * 0.8})`;
          g.beginPath();
          g.arc(fallInto.x, y + 1, fallInto.r - 2, 0, Math.PI * 2);
          g.fill();
        }
      }
      fx.render(g);

      if (!dead) {
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, shine, ball.x - 4, BALL_Y - 5, { size: 18, alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';
      }

      // the board darkens on the side it's tilted down to
      if (Math.abs(tilt) > 0.02) {
        const grad = g.createLinearGradient(0, 0, W, 0);
        const a = Math.abs(tilt) * 0.14;
        grad.addColorStop(0, tilt < 0 ? `rgba(40,15,0,${a})` : `rgba(255,240,210,${a * 0.6})`);
        grad.addColorStop(1, tilt > 0 ? `rgba(40,15,0,${a})` : `rgba(255,240,210,${a * 0.6})`);
        g.fillStyle = grad;
        g.fillRect(0, TOP, W, FRONT - TOP);
      }

      // the walls of the box, and the brass knob that tilts it
      drawSprite(g, farWall, W / 2, TOP / 2);
      drawSprite(g, nearWall, W / 2, (FRONT + H) / 2);
      drawSprite(g, knob, W / 2, FRONT + 21, { rot: tilt * 1.1, size: 40 });
      g.fillStyle = 'rgba(255,230,190,0.35)';
      g.font = '700 9px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('◀ TILT', W / 2 - 52, FRONT + 22);
      g.fillText('TILT ▶', W / 2 + 52, FRONT + 22);
    }
    return game;
  },
};
