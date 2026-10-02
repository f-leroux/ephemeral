// Hungry Amoeba — a drop of pond water under the microscope. You're a little green amoeba that
// can swallow anything smaller than itself and gets swallowed by anything bigger. Every meal makes
// you grow, every second without one makes you shrink, and what's "smaller than you" keeps changing.

import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const PLAYER_Y = 540;
const START_R = 15;
const MIN_R = 7; // shrink below this and you're gone
const MAX_R = 30;
const EAT = 0.85; // you can swallow anything with a radius under 85% of yours
const STEP = 1 / 120;
const REACH = 150; // how fast the guaranteed safe lane may drift sideways (px/s)
const CLEAR = 28; // the safe lane's half width, besides each cell's own radius
const ART_R = 28; // cell sprites are painted at this radius, then scaled

// ---------- art ----------

// the light field of the microscope: warm in the middle, amber towards the rim
function paintField(W, H) {
  return makeSprite(W, H, (g) => {
    const f = g.createRadialGradient(0, -40, 30, 0, 0, H * 0.62);
    f.addColorStop(0, '#fbf3dc');
    f.addColorStop(0.55, '#f1dfb4');
    f.addColorStop(1, '#c99a5a');
    g.fillStyle = f;
    g.fillRect(-W / 2, -H / 2, W, H);
  }, 1);
}

// a slide's counting grid, with a few out-of-focus specks stuck to the glass; tiles vertically
function paintGrid(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const wrap = (y, draw) => [-H, 0, H].forEach((o) => draw(y + o));
    g.strokeStyle = 'rgba(120,80,40,0.12)';
    g.lineWidth = 1;
    for (let x = 20; x < W; x += 80) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y < H; y += 80) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(120,80,40,0.06)';
    for (let x = 0; x < W; x += 20) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(110,70,30,0.12)' : 'rgba(255,255,240,0.35)';
      const s = rng.range(0.8, 2.2);
      const x = rng.range(0, W);
      wrap(rng.range(0, H), (y) => g.fillRect(x, y, s, s));
    }
  }, 1);
}

// big blurry blobs floating out of focus above the slide; tiles vertically
function paintBokeh(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (let i = 0; i < 18; i++) {
      const x = rng.range(-20, W + 20);
      const r = rng.range(18, 60);
      const tint = rng.pick(['150,90,170', '90,150,120', '200,140,60', '170,110,150']);
      const y0 = rng.range(0, H);
      for (const o of [-H, 0, H]) {
        const y = y0 + o;
        const b = g.createRadialGradient(x, y, r * 0.2, x, y, r);
        b.addColorStop(0, `rgba(${tint},0.025)`);
        b.addColorStop(0.8, `rgba(${tint},0.05)`);
        b.addColorStop(0.92, `rgba(${tint},0.08)`);
        b.addColorStop(1, `rgba(${tint},0)`);
        g.fillStyle = b;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 1);
}

const S = ART_R * 2 + 12;

// tiny rod bacterium: always a snack
function paintRod(rng) {
  return makeSprite(S, S, (g) => {
    g.rotate(rng.range(0, Math.PI));
    const body = g.createLinearGradient(0, -10, 0, 10);
    body.addColorStop(0, '#f6e27a');
    body.addColorStop(0.5, '#c9a42a');
    body.addColorStop(1, '#7d6312');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-26, -11, 52, 22, 11);
    g.fill();
    g.strokeStyle = 'rgba(90,60,10,0.6)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,230,0.6)';
    g.beginPath();
    g.roundRect(-20, -7, 34, 5, 2.5);
    g.fill();
    // flagellum
    g.strokeStyle = 'rgba(120,90,20,0.5)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(26, 0);
    for (let x = 0; x < 6; x++) g.quadraticCurveTo(30 + x * 1.2, x % 2 ? -5 : 5, 31 + x * 1.2, 0);
    g.stroke();
  });
}

// tiny round coccus pair: a snack too
function paintCoccus() {
  return makeSprite(S, S, (g) => {
    for (const [x, y, r] of [[-9, -6, 15], [10, 7, 13]]) {
      const c = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
      c.addColorStop(0, '#ffd7c2');
      c.addColorStop(0.6, '#f08a6a');
      c.addColorStop(1, '#a8452c');
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.arc(x - r * 0.4, y - r * 0.4, r * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// a stained round cell: violet membrane, grainy cytoplasm and a dark nucleus
function paintCell(rng, hue) {
  return makeSprite(S, S, (g) => {
    const R = ART_R;
    const c = g.createRadialGradient(-6, -6, 2, 0, 0, R);
    c.addColorStop(0, `hsla(${hue},70%,92%,0.95)`);
    c.addColorStop(0.7, `hsla(${hue},55%,74%,0.95)`);
    c.addColorStop(1, `hsla(${hue},50%,52%,1)`);
    g.fillStyle = c;
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const rr = R * (1 + 0.04 * Math.sin(a * 3 + hue));
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.fill();
    g.strokeStyle = `hsla(${hue},55%,32%,0.8)`;
    g.lineWidth = 2.2;
    g.stroke();
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R * 0.85);
      g.fillStyle = `hsla(${hue},45%,${rng.range(35, 60)}%,0.45)`;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rng.range(0.6, 1.6), 0, Math.PI * 2);
      g.fill();
    }
    const nx = rng.range(-6, 6);
    const ny = rng.range(-6, 6);
    const n = g.createRadialGradient(nx - 3, ny - 3, 1, nx, ny, 11);
    n.addColorStop(0, `hsla(${hue + 20},50%,48%,1)`);
    n.addColorStop(1, `hsla(${hue + 20},60%,22%,1)`);
    g.fillStyle = n;
    g.beginPath();
    g.ellipse(nx, ny, 11, 9.5, rng.range(0, 3), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `hsla(${hue + 20},60%,14%,0.9)`;
    g.beginPath();
    g.arc(nx + 2, ny + 1, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-R * 0.45, -R * 0.5, R * 0.22, R * 0.1, -0.7, 0, Math.PI * 2);
    g.fill();
  });
}

// a slipper-shaped ciliate with a fringe of tiny hairs
function paintCiliate(rng) {
  return makeSprite(S, S, (g) => {
    const rx = ART_R;
    const ry = ART_R * 0.62;
    g.strokeStyle = 'rgba(120,60,110,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      g.moveTo(x, y);
      g.lineTo(x * 1.12, y * 1.16);
    }
    g.stroke();
    const c = g.createLinearGradient(0, -ry, 0, ry);
    c.addColorStop(0, '#f6d4ee');
    c.addColorStop(0.5, '#d98ac4');
    c.addColorStop(1, '#94427e');
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(90,30,80,0.7)';
    g.lineWidth = 2;
    g.stroke();
    // oral groove and food vacuoles
    g.strokeStyle = 'rgba(110,40,90,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-rx * 0.1, -ry * 0.75);
    g.quadraticCurveTo(rx * 0.2, 0, -rx * 0.05, ry * 0.2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = rng.pick(['rgba(200,120,60,0.6)', 'rgba(120,60,140,0.55)', 'rgba(250,240,200,0.6)']);
      g.beginPath();
      g.arc(rng.range(-rx * 0.7, rx * 0.7), rng.range(-ry * 0.5, ry * 0.5), rng.range(2, 4), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5a1d50';
    g.beginPath();
    g.ellipse(rx * 0.25, ry * 0.15, 7, 5, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-rx * 0.4, -ry * 0.55, rx * 0.3, 2.5, -0.15, 0, Math.PI * 2);
    g.fill();
  });
}

// a glassy golden diatom with ribbed shell
function paintDiatom() {
  return makeSprite(S, S, (g) => {
    const R = ART_R;
    const c = g.createRadialGradient(-6, -6, 2, 0, 0, R);
    c.addColorStop(0, '#fff6cf');
    c.addColorStop(0.6, '#e6be5c');
    c.addColorStop(1, '#8a6418');
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(100,70,10,0.8)';
    g.lineWidth = 2.4;
    g.stroke();
    g.strokeStyle = 'rgba(110,80,20,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      g.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
      g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
    }
    g.stroke();
    for (const k of [0.3, 0.62]) {
      g.beginPath();
      g.arc(0, 0, R * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(160,110,20,0.7)';
    g.beginPath();
    g.arc(0, 0, R * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-R * 0.4, -R * 0.5, R * 0.3, R * 0.1, -0.7, 0, Math.PI * 2);
    g.fill();
  });
}

// a lobed magenta amoeba, the big hungry kind
function paintBrute(rng) {
  return makeSprite(S, S, (g) => {
    const R = ART_R * 0.92;
    const lobes = [];
    for (let k = 0; k < 7; k++) lobes.push(rng.range(0.85, 1.12));
    const c = g.createRadialGradient(-5, -5, 2, 0, 0, R * 1.1);
    c.addColorStop(0, '#ffd2dc');
    c.addColorStop(0.6, '#e45b84');
    c.addColorStop(1, '#8a1d44');
    g.fillStyle = c;
    g.beginPath();
    for (let k = 0; k <= 56; k++) {
      const a = (k / 56) * Math.PI * 2;
      const f = (a / (Math.PI * 2)) * 7;
      const i = Math.floor(f) % 7;
      const j = (i + 1) % 7;
      const m = f - Math.floor(f);
      const s = lobes[i] + (lobes[j] - lobes[i]) * (0.5 - 0.5 * Math.cos(m * Math.PI));
      g.lineTo(Math.cos(a) * R * s, Math.sin(a) * R * s);
    }
    g.fill();
    g.strokeStyle = 'rgba(100,10,40,0.8)';
    g.lineWidth = 2.4;
    g.stroke();
    for (let i = 0; i < 50; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R * 0.8);
      g.fillStyle = 'rgba(110,20,60,0.35)';
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rng.range(0.6, 1.8), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5a0c2c';
    g.beginPath();
    g.ellipse(3, 2, 9, 7.5, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.ellipse(-R * 0.45, -R * 0.45, R * 0.26, R * 0.1, -0.7, 0, Math.PI * 2);
    g.fill();
  });
}

// the spiky red ring that says "bigger than you"
function paintRing(color, spiky) {
  return makeSprite(S + 16, S + 16, (g) => {
    const R = ART_R + 5;
    g.strokeStyle = color;
    g.lineWidth = spiky ? 4.6 : 2.6;
    if (!spiky) g.setLineDash([5, 4]);
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.stroke();
    if (spiky) {
      g.fillStyle = color;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a - 0.11) * R, Math.sin(a - 0.11) * R);
        g.lineTo(Math.cos(a) * (R + 8), Math.sin(a) * (R + 8));
        g.lineTo(Math.cos(a + 0.11) * R, Math.sin(a + 0.11) * R);
        g.fill();
      }
    }
  });
}

// ---------- game ----------

export default {
  id: 'amoeba',
  title: 'Hungry Amoeba',
  emoji: '🦠',
  tagline: 'Swallow every cell smaller than you and dodge the bigger ones, which glow red and come after you. You shrink when you go hungry, so keep eating.',
  colors: { bg: '#f1dfb4', fg: '#3b1d4a', accent: '#1fbf8f' },

  // Squelchy electro breakbeat at 132 BPM in B♭ minor (B♭m – G♭ – A♭ – F): a broken kick, snare
  // and wobbling square bass from bar one, then a pad and bubbly blips, a call-and-answer lead,
  // and a four-on-the-floor finish with a racing arp. 33 bars = 60s.
  music: {
    cps: 0.55,
    setup: `
      const chords = "<[bb3,db4,f4] [gb3,bb3,db4] [ab3,c4,eb4] [f3,a3,c4]>"
      const kick = note("c2").struct("x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick4 = note("c2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ pink ~ pink").decay(0.15).sustain(0).hpf(900).lpf(5000).gain(0.18).room(0.3)
      const ghost = s("~ ~ ~ ~ ~ ~ ~ pink ~ pink ~ ~ ~ ~ ~ pink").decay(0.06).sustain(0).hpf(1500).lpf(5000).gain(0.07)
      const hats = s("[~ white]*4").decay(0.035).sustain(0).hpf(6800).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const bass = note("<bb2 gb2 ab2 f2>").struct("x ~ x x ~ x ~ x x ~ x ~ x x ~ x").s("square")
        .decay(0.12).sustain(0.1).release(0.05).lpf(sine.range(350, 1500).fast(2)).lpq(9).gain(0.3)
      const pad = note(chords).s("sawtooth").attack(0.4).release(0.7)
        .lpf(saw.range(500, 1800).slow(33)).gain(0.07).room(0.5).roomsize(4)
      const blips = note("<[bb5 ~ f6 ~ db6 ~ ~ ab5] [gb5 ~ db6 ~ bb5 ~ ~ f5] [ab5 ~ eb6 ~ c6 ~ ~ ab5] [a5 ~ f6 ~ c6 ~ ~ a5]>")
        .s("sine").decay(0.07).sustain(0).gain(0.06).delay(0.3).delaytime(0.341).delayfeedback(0.35).pan(sine.range(0.25, 0.75).slow(3))
      const lead = note("<[f4 ~ db5 ~ bb4 ~ ab4 bb4] [~ ~ ~ ~ db5 ~ bb4 ~] [eb5 ~ c5 ~ ab4 ~ c5 eb5] [f5 ~ e5 ~ c5 ~ ~ ~]>")
        .s("square").decay(0.18).sustain(0.25).release(0.12).lpf(2200).gain(0.075).room(0.4)
        .delay(0.25).delaytime(0.455).delayfeedback(0.3)
      const arp = note("<[bb4 db5 f5 db5]*4 [gb4 bb4 db5 bb4]*4 [ab4 c5 eb5 c5]*4 [f4 a4 c5 a4]*4>")
        .s("triangle").decay(0.08).sustain(0).lpf(saw.range(1500, 3500).slow(10)).gain(0.09)
    `,
    song: `arrange(
      [5, stack(kick, snare, hats, bass)],
      [9, stack(kick, snare, hats, bass, pad, blips)],
      [9, stack(kick, snare, ghost, hats, bass, pad, blips, lead)],
      [10, stack(kick4, snare, ghost, hats16, bass, pad, blips, lead, arp)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const field = paintField(W, H);
    const grid = paintGrid(W, H, art);
    const bokeh = paintBokeh(W, H, art);
    const snackArt = [paintRod(art), paintRod(art), paintCoccus()];
    const cellArt = [paintCell(art, 265), paintCell(art, 290), paintCell(art, 320), paintDiatom(), paintCiliate(art)];
    const bruteArt = [paintBrute(art), paintBrute(art)];
    const redRing = paintRing('rgba(205,15,45,1)', true);
    const dangerHalo = glowSprite('rgba(220,20,50,0.6)', 50); // a red stain under everything too big to eat
    // a solid red wash laid over the cell itself, so anything too big to eat turns plainly red
    const dangerTint = makeSprite(S, S, (g) => {
      const f = g.createRadialGradient(0, 0, ART_R * 0.2, 0, 0, ART_R * 1.05);
      f.addColorStop(0, 'rgba(255,60,70,0.55)');
      f.addColorStop(0.75, 'rgba(210,10,40,0.75)');
      f.addColorStop(1, 'rgba(150,0,25,0)');
      g.fillStyle = f;
      g.beginPath();
      g.arc(0, 0, ART_R * 1.05, 0, Math.PI * 2);
      g.fill();
    });
    const meGlow = glowSprite('rgba(60,255,190,1)', 50);
    const vignette = vignetteSprite(W, H, 0.7, '60,30,10');

    // how far the slide has scrolled at any moment: depends only on time, so it can be planned ahead
    const speedAt = (t) => lerp(125, 245, progress(t, 60, 1.25));
    const distTable = [0];
    for (let i = 1; i <= 64 * 120; i++) distTable.push(distTable[i - 1] + speedAt((i - 0.5) * STEP) * STEP);
    const distAt = (t) => {
      const f = clamp(t / STEP, 0, distTable.length - 1);
      const i = Math.floor(f);
      return lerp(distTable[i], distTable[Math.min(i + 1, distTable.length - 1)], f - i);
    };

    const me = { x: W / 2, vx: 0, r: START_R, gulp: 0 };
    const fx = createParticles();
    const cells = []; // { s, x0, x, r, wa, wf, ph, rot, spin, sprite, kind, edible }
    const swallowed = []; // cosmetic: cells being drawn into you
    const motes = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, sp: 0.2 + Math.random() * 0.5 }));

    let dist = 0;
    let clock = 0;
    let lastT = 0;
    let lastX = W / 2;
    let heading = rng.chance(0.5) ? 1 : -1;
    let fade = 0;
    let killer = null;

    function add(T, x, r, kind, sprite) {
      cells.push({
        s: distAt(T),
        x0: x,
        x,
        r,
        kind,
        sprite,
        wa: kind === 'snack' ? rng.range(2, 8) : rng.range(0, 6),
        wf: rng.range(0.8, 2.2),
        ph: rng.range(0, Math.PI * 2),
        rot: rng.range(0, Math.PI * 2),
        spin: rng.range(-0.8, 0.8),
        edible: kind === 'snack',
        ring: 0,
        // how it moves on its own (set when planned, so it's the same for everyone):
        // giants hunt you, some cells swim across the slide, and meals try to get away
        vx: 0,
        hunt: 0,
        flee: 0,
      });
      return cells[cells.length - 1];
    }
    function fits(T, x, r) {
      const s = distAt(T);
      for (let i = cells.length - 1, n = 0; i >= 0 && n < 14; i--, n++) {
        const o = cells[i];
        if (o.kind === 'snack') continue;
        if (Math.hypot(o.x0 - x, o.s - s) < o.r + r + 10) return false;
      }
      return true;
    }

    // rows of cells drift down towards you; a lane wide enough for a mid-sized amoeba always stays
    // open, and it's sprinkled with snacks, so there's always a way through and something to eat
    function plan(until) {
      while (lastT < until) {
        const first = lastT === 0;
        const p = progress(lastT, 60, 1.3);
        const dT = first ? 1.4 : lerp(0.42, 0.26, p) * rng.range(0.85, 1.15);
        const T = lastT + dT;
        if (rng.chance(lerp(0.3, 0.5, p))) heading = -heading;
        const ratio = rng.range(0.3, lerp(0.7, 1, p));
        let X = lastX + heading * ratio * REACH * dT;
        if (X < 60 || X > W - 60) {
          heading = -heading;
          X = lastX + heading * ratio * REACH * dT;
        }
        X = clamp(X, 60, W - 60);

        // snacks along the lane
        const snacks = rng.chance(lerp(0.85, 0.1, p)) ? (p < 0.25 ? rng.int(1, 2) : 1) : 0;
        for (let k = 0; k < snacks; k++) add(T + rng.range(-0.08, 0.08), X + rng.range(-24, 24), rng.range(3.5, 5.5), 'snack', rng.pick(snackArt));
        // and a few more scattered around
        if (rng.chance(lerp(0.4, 0.06, p))) {
          const x = rng.range(20, W - 20);
          add(T, x, rng.range(3.5, 5.5), 'snack', rng.pick(snackArt));
        }

        // from the middle on, the lane alone won't feed you: proper meals sit just beside it,
        // edible only if you've kept your size up (never inside the guaranteed lane itself)
        if (T > 14 && rng.chance(lerp(0.25, 0.6, p))) {
          const r = rng.range(lerp(7, 8.5, p), lerp(9.5, 11.5, p));
          const side = rng.chance(0.5) ? 1 : -1;
          const drift = ratio * REACH * ((r + 24) / speedAt(T));
          for (const sd of [side, -side]) {
            const x = X + sd * (r + CLEAR + 6 + drift + rng.range(0, 14));
            if (x < r + 4 || x > W - r - 4 || !fits(T, x, r)) continue;
            const meal = add(T, x, r, 'cell', rng.pick(cellArt));
            meal.flee = rng.range(lerp(18, 30, p), lerp(30, 55, p));
            break;
          }
        }

        if (T > 3) {
          // fewer and fewer small cells, more and more big ones crowding the path
          const n = Math.round(lerp(1.3, 3.6, p) + rng.range(-0.5, 0.5));
          for (let k = 0, tries = 0; k < n && tries < 18; tries++) {
            const roll = rng.next();
            let r;
            let kind = 'cell';
            if (roll < lerp(0.45, 0.12, p)) r = rng.range(6.5, 11);
            else if (roll < lerp(0.82, 0.5, p)) r = rng.range(11, 19);
            else {
              kind = 'brute';
              r = T > 18 && rng.chance(0.4) ? rng.range(30, 42) : rng.range(19, 30);
            }
            const x = rng.range(r + 4, W - r - 4);
            const drift = ratio * REACH * ((r + 24) / speedAt(T));
            const gap = r + CLEAR + 6 + drift;
            if (Math.abs(x - X) < gap || Math.abs(x - lastX) < gap) continue;
            if (!fits(T, x, r)) continue;
            const o = add(T, x, r, kind, kind === 'brute' ? rng.pick(bruteArt) : rng.pick(cellArt));
            if (kind === 'brute') o.hunt = rng.range(lerp(12, 50, p), lerp(25, 80, p));
            else if (T > 8 && rng.chance(lerp(0.2, 0.6, p))) o.vx = (rng.chance(0.5) ? 1 : -1) * rng.range(lerp(15, 30, p), lerp(30, 65, p));
            if (r < 11) o.flee = rng.chance(lerp(0.3, 0.7, p)) ? rng.range(15, lerp(30, 50, p)) : 0;
            k++;
          }
        }
        lastT = T;
        lastX = X;
      }
    }

    plan(6);
    const yOf = (o) => PLAYER_Y - (o.s - dist);

    // your outline: a wobbling blob that leans into the way you're moving
    function blobPath(g, x, y, r, t) {
      const lean = clamp(me.vx / 260, -1, 1);
      g.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const ca = Math.cos(a);
        let rr = r * (1 + 0.07 * Math.sin(a * 3 + t * 4.1) + 0.05 * Math.sin(a * 5 - t * 3.3));
        rr *= 1 + 0.22 * lean * ca * (ca * lean > 0 ? 1 : 0.4); // a pseudopod reaching ahead
        rr *= 1 + me.gulp * 0.12;
        g.lineTo(x + ca * rr, y + Math.sin(a) * rr * (1 - 0.1 * Math.abs(lean)));
      }
      g.closePath();
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock = t;
        plan(t + 5);
        dist += speedAt(t) * dt;

        // big amoebas are a bit slower and heavier than small ones
        const top = 285 - (me.r - START_R) * 3.2;
        me.vx += (dir * top - me.vx) * Math.min(1, 13 * dt);
        me.x += me.vx * dt;
        const lo = me.r + 4;
        const hi = W - me.r - 4;
        if (me.x < lo || me.x > hi) {
          me.x = clamp(me.x, lo, hi);
          me.vx = 0;
        }

        // hunger: you're always shrinking, faster later and faster when big
        const p = progress(t, 60, 1.2);
        if (t > 0.5) me.r -= (0.18 + 0.05 * me.r) * lerp(1, 1.5, p) * dt;
        me.gulp = Math.max(0, me.gulp - dt * 4);

        for (let i = cells.length - 1; i >= 0; i--) {
          const o = cells[i];
          const y = yOf(o);
          if (y > H + 60) {
            cells.splice(i, 1);
            continue;
          }
          o.edible = o.r < me.r * EAT;
          // cells that swim: drifters cross the slide and bounce off its edges; giants that are
          // too big for you creep towards you, and meals edge away once you could eat them.
          // Nobody steers in the last stretch above you, so the final dodge or bite is fair.
          const steering = y > -20 && y < PLAYER_Y - 130;
          if (o.vx) {
            o.x0 += o.vx * dt;
            if (o.x0 < o.r + 4 || o.x0 > W - o.r - 4) {
              o.x0 = clamp(o.x0, o.r + 4, W - o.r - 4);
              o.vx = -o.vx;
            }
          }
          o.chase = 0;
          if (steering && o.hunt && !o.edible) {
            o.chase = clamp((me.x - o.x0) / 30, -1, 1);
            o.x0 += o.chase * o.hunt * dt;
          } else if (steering && o.flee && o.edible) {
            const away = o.x0 < me.x ? -1 : 1;
            if (Math.abs(o.x0 - me.x) < 140) o.x0 += away * o.flee * dt;
          }
          o.x0 = clamp(o.x0, o.r + 4, W - o.r - 4);
          o.x = o.x0 + o.wa * Math.sin(o.wf * t + o.ph);
          o.ring += ((o.edible ? 0 : 1) - o.ring) * Math.min(1, dt * 10);
          if (y < -60) continue;
          const d = Math.hypot(o.x - me.x, y - PLAYER_Y);
          if (o.edible) {
            if (d < me.r + o.r * 0.6) {
              const area = me.r * me.r + o.r * o.r * 0.6;
              me.r = Math.min(MAX_R, Math.sqrt(area));
              me.gulp = 1;
              swallowed.push({ x: o.x, y, r: o.r, sprite: o.sprite, rot: o.rot + o.spin * t, life: 0.22 });
              fx.burst(o.x, y, { count: o.r > 8 ? 14 : 5, speed: 70, life: 0.45, size: 2.4, round: true, drag: 3, colors: ['#bfffe6', '#ffffff', '#7ef0c6'] });
              cells.splice(i, 1);
            }
          } else if (d < (me.r + o.r) * 0.86) {
            this.dead = true;
            killer = { o, y };
            this.deathReason = o.kind === 'brute' ? 'Engulfed by a giant amoeba.' : 'Swallowed by a bigger cell.';
            fx.burst(me.x, PLAYER_Y, { count: 40, speed: 200, life: 1, size: 3.2, round: true, drag: 2, colors: ['#3fe0b0', '#bfffe6', '#1a8f6c', '#ffffff'] });
            break;
          }
        }

        if (!this.dead && me.r < MIN_R) {
          this.dead = true;
          this.deathReason = 'Starved: shrank down to nothing.';
          fx.burst(me.x, PLAYER_Y, { count: 30, speed: 120, life: 1.2, size: 2.6, round: true, drag: 2, colors: ['#bfffe6', '#ffffff', '#7ef0c6'] });
        }

        for (let i = swallowed.length - 1; i >= 0; i--) {
          const s = swallowed[i];
          s.life -= dt;
          s.x += (me.x - s.x) * Math.min(1, dt * 14);
          s.y += (PLAYER_Y - s.y) * Math.min(1, dt * 14);
          if (s.life <= 0) swallowed.splice(i, 1);
        }

        // a trail of cytoplasm when you stream sideways (cosmetic)
        if (Math.abs(me.vx) > 120 && Math.random() < 0.5) {
          fx.burst(me.x - Math.sign(me.vx) * me.r * 0.8, PLAYER_Y + (Math.random() - 0.5) * me.r, { count: 1, speed: 20, life: 0.5, size: 2.4, round: true, drag: 2, colors: ['rgba(60,210,160,0.6)', 'rgba(190,255,230,0.7)'] });
        }
        fx.update(dt, speedAt(t) * 0.5);
      },

      afterlife(dt) {
        clock += dt;
        fade = Math.min(1, fade + dt * 1.6);
        if (killer) {
          me.x += (killer.o.x - me.x) * Math.min(1, dt * 5);
        }
        fx.update(dt, 20);
      },

      render(g) {
        const t = clock;
        drawSprite(g, field, W / 2, H / 2);
        const off = dist % H;
        drawSprite(g, grid, W / 2, H / 2 + off);
        drawSprite(g, grid, W / 2, H / 2 + off - H);

        // drifting motes in the water
        g.fillStyle = 'rgba(120,80,40,0.25)';
        for (const m of motes) {
          const y = (m.y + dist * m.sp) % (H + 10) - 5;
          g.beginPath();
          g.arc(m.x + Math.sin(t + m.y) * 4, y, m.r, 0, Math.PI * 2);
          g.fill();
        }

        for (const o of cells) {
          const y = yOf(o);
          if (y < -60 || y > H + 60) continue;
          const size = ((S * o.r) / ART_R) * (o.kind === 'snack' ? 1.5 : 1); // snacks are drawn a little larger than they bite
          const pulse = 1 + 0.04 * Math.sin(t * 7 + o.ph);
          if (o.kind !== 'snack') {
            if (o.ring > 0.03) {
              drawSprite(g, dangerHalo, o.x, y, { size: o.r * 4.8 * pulse, alpha: o.ring * 0.85 });
              drawSprite(g, redRing, o.x, y, { size: ((S + 16) * o.r * pulse) / ART_R, alpha: o.ring, rot: t * 0.6 + o.ph });
            }
            // a hunting giant reaches out towards you with a red pseudopod
            if (o.chase && o.ring > 0.5) drawSprite(g, dangerHalo, o.x + o.chase * o.r * 0.9, y + o.r * 0.25, { size: o.r * 2.6 * pulse, alpha: Math.abs(o.chase) * o.ring * 0.8 });
          }
          drawSprite(g, o.sprite, o.x, y, { size, rot: o.rot + o.spin * t });
          // too big to eat: the cell itself turns red, so it reads at a glance; edible ones stay unmarked
          if (o.kind !== 'snack' && o.ring > 0.03) drawSprite(g, dangerTint, o.x, y, { size: ((S * o.r) / ART_R) * pulse, alpha: o.ring });
        }

        for (const s of swallowed) {
          drawSprite(g, s.sprite, s.x, s.y, { size: ((S * s.r) / ART_R) * (s.life / 0.22), rot: s.rot, alpha: clamp(s.life / 0.22, 0, 1) });
        }

        // you: a glowing green amoeba with a nucleus and a couple of vacuoles
        const shrink = 1 - fade;
        if (shrink > 0.01) {
          const r = me.r * (killer ? shrink : 1 + fade * 0.6);
          const starving = clamp((10 - me.r) / 3, 0, 1);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, meGlow, me.x, PLAYER_Y, { size: r * 4.6, alpha: 0.5 * shrink });
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = shrink;
          const body = g.createRadialGradient(me.x - r * 0.3, PLAYER_Y - r * 0.35, 1, me.x, PLAYER_Y, r * 1.15);
          const blink = starving * (0.5 + 0.5 * Math.sin(t * 14));
          body.addColorStop(0, '#e6fff4');
          body.addColorStop(0.55, blink > 0.5 ? '#ffd0c0' : '#6ee8bd');
          body.addColorStop(1, blink > 0.5 ? '#d8604a' : '#139a72');
          g.fillStyle = body;
          blobPath(g, me.x, PLAYER_Y, r, t);
          g.fill();
          g.strokeStyle = blink > 0.5 ? '#9a2a1a' : '#0b6a4e';
          g.lineWidth = 2.2;
          g.stroke();
          // vacuoles, nucleus and a highlight
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.beginPath();
          g.arc(me.x + Math.cos(t * 1.3) * r * 0.45, PLAYER_Y + Math.sin(t * 1.7) * r * 0.35, r * 0.13, 0, Math.PI * 2);
          g.arc(me.x - Math.cos(t * 0.9) * r * 0.4, PLAYER_Y + Math.sin(t * 1.1 + 2) * r * 0.4, r * 0.09, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#0d5a44';
          g.beginPath();
          g.ellipse(me.x + Math.sin(t * 0.7) * r * 0.12, PLAYER_Y + r * 0.08, r * 0.3, r * 0.25, t * 0.3, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#073a2c';
          g.beginPath();
          g.arc(me.x + Math.sin(t * 0.7) * r * 0.12 + r * 0.06, PLAYER_Y + r * 0.1, r * 0.09, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.beginPath();
          g.ellipse(me.x - r * 0.42, PLAYER_Y - r * 0.5, r * 0.26, r * 0.1, -0.6, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }

        fx.render(g);

        // the lens: out-of-focus blobs drifting above the slide, then the dark rim of the eyepiece
        const off2 = (dist * 1.35) % H;
        drawSprite(g, bokeh, W / 2, H / 2 + off2);
        drawSprite(g, bokeh, W / 2, H / 2 + off2 - H);
        drawSprite(g, vignette, W / 2, H / 2);

        // a little scale bar, like on a micrograph
        g.fillStyle = 'rgba(40,20,10,0.55)';
        g.fillRect(18, H - 30, 40, 3);
        g.font = '600 10px system-ui, sans-serif';
        g.fillText('50 µm', 18, H - 36);
      },
    };
    return game;
  },
};
