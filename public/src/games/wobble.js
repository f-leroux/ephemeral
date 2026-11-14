// Wobble Wall — a strawberry jelly on a neon TV game-show stage, and foam walls with holes cut
// in them come sliding down the stage at it. The jelly's shape is set by its speed: standing
// still it's tall and thin, at full tilt it squashes flat and wide (always the same amount of
// jelly). Tall narrow doors need you slow and lined up, low wide slots need you dashing through
// them, and later little windows need you somewhere in between. Holes can sway, walls come
// faster and holes get tighter. Hit the foam anywhere and you splat.

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

const TAU = Math.PI * 2;
const HZ = 168; // horizon (vanishing point height)
const FLOOR = 590; // the floor line at the player's depth
const EYE = FLOOR - HZ; // camera height above the floor, in world units
const FOC = 190; // focal depth
const D0 = 1100; // depth where walls appear
const GONE = FOC * 0.55; // how far past the player a wall travels before vanishing
const CX = 180;
const PMIN = 34;
const PMAX = 326;
const VMAX = 280;
const ACC = 950;
const FRIC = 720;
const WMIN = 34; // jelly width standing still
const WMAX = 92; // jelly width at full speed
const AREA = 34 * 62; // the jelly keeps its volume: height = AREA / width
const SLIM = 0.92; // a jelly squeezes a little: collisions use 92% of its width
const WALL_H = 150;
const WALL_T = 16;
const DOOR_H = 84;

const shapeW = (s) => WMIN + (WMAX - WMIN) * s;
const proj = (d) => FOC / (FOC + d);
const sx = (x, s) => CX + (x - CX) * s;
const sy = (h, s) => HZ + (EYE - h) * s;

const WALL_COLORS = [
  { face: '#24c8f2', low: '#0d7fa8', top: '#a8f0ff', neon: '220,252,255', ink: '#06506b' },
  { face: '#ffd23f', low: '#d18a10', top: '#fff2a8', neon: '255,250,215', ink: '#7a4a00' },
  { face: '#a86bff', low: '#5d2cc4', top: '#dcc4ff', neon: '240,225,255', ink: '#3a1680' },
  { face: '#3ff0a0', low: '#109a5e', top: '#b8ffdc', neon: '220,255,238', ink: '#05613a' },
];

// ---------- art ----------

function makeJelly() {
  return makeSprite(64, 64, (g) => {
    const body = () => {
      g.beginPath();
      g.roundRect(-30, -30, 60, 60, [24, 24, 12, 12]);
    };
    body();
    const gr = g.createLinearGradient(0, -30, 0, 30);
    gr.addColorStop(0, '#ff9ab2');
    gr.addColorStop(0.3, '#ff3d66');
    gr.addColorStop(0.75, '#e0123f');
    gr.addColorStop(1, '#9a0030');
    g.fillStyle = gr;
    g.fill();
    // translucent core
    const core = g.createRadialGradient(-4, 2, 2, 0, 4, 30);
    core.addColorStop(0, 'rgba(255,190,205,0.45)');
    core.addColorStop(1, 'rgba(255,190,205,0)');
    g.fillStyle = core;
    body();
    g.fill();
    // little air bubbles inside
    for (const [x, y, r] of [[-14, 10, 2.4], [12, 16, 1.8], [18, -2, 1.4], [-6, 20, 1.2], [4, 6, 1]]) {
      g.strokeStyle = 'rgba(255,230,236,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(x - r * 0.5, y - r * 0.6, 0.8, 0.8);
    }
    // glowing bottom rim, where light passes through
    const rim = g.createLinearGradient(0, 18, 0, 30);
    rim.addColorStop(0, 'rgba(255,120,150,0)');
    rim.addColorStop(1, 'rgba(255,150,175,0.55)');
    g.fillStyle = rim;
    body();
    g.fill();
    // outline
    body();
    g.strokeStyle = 'rgba(110,0,30,0.85)';
    g.lineWidth = 2;
    g.stroke();
    // glossy highlight
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-14, -19, 9, 4, -0.35, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-22, -6, 2, 6, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(4, -22, 1.6, 0, TAU);
    g.fill();
  });
}

function makeFace(kind) {
  return makeSprite(30, 18, (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (kind === 'calm') {
      for (const ex of [-7, 7]) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(ex, -3, 4, 5, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#2a0610';
        g.beginPath();
        g.arc(ex + 0.8, -2.4, 2.5, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex + 1.8, -3.6, 0.9, 0, TAU);
        g.fill();
      }
      g.strokeStyle = '#4a0716';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(0, 3.5, 3.2, 0.25, Math.PI - 0.25);
      g.stroke();
      g.fillStyle = 'rgba(255,140,170,0.6)';
      for (const ex of [-12, 12]) {
        g.beginPath();
        g.ellipse(ex, 4, 2.6, 1.4, 0, 0, TAU);
        g.fill();
      }
    } else {
      // "wheee!": squeezed-shut happy eyes and a wide open mouth
      g.strokeStyle = '#2a0610';
      g.lineWidth = 2;
      for (const ex of [-7, 7]) {
        g.beginPath();
        g.moveTo(ex - 4, -1);
        g.lineTo(ex, -5);
        g.lineTo(ex + 4, -1);
        g.stroke();
      }
      g.fillStyle = '#4a0716';
      g.beginPath();
      g.moveTo(-5, 2);
      g.quadraticCurveTo(0, 2.5, 5, 2);
      g.quadraticCurveTo(4.5, 9, 0, 9);
      g.quadraticCurveTo(-4.5, 9, -5, 2);
      g.fill();
      g.fillStyle = '#ff7a96';
      g.beginPath();
      g.ellipse(0, 7, 2.6, 1.5, 0, 0, TAU);
      g.fill();
    }
  });
}

function makeCone() {
  return makeSprite(140, 560, (g) => {
    g.translate(0, -280);
    const gr = g.createLinearGradient(0, 0, 0, 560);
    gr.addColorStop(0, 'rgba(255,235,255,0.22)');
    gr.addColorStop(0.6, 'rgba(220,190,255,0.08)');
    gr.addColorStop(1, 'rgba(200,170,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-5, 0);
    g.lineTo(5, 0);
    g.lineTo(70, 560);
    g.lineTo(-70, 560);
    g.closePath();
    g.fill();
  }, 1);
}

function makeAudience(W, rng) {
  return makeSprite(W, 64, (g) => {
    g.translate(-W / 2, -32);
    // two rows of heads and shoulders, with a few hands in the air
    for (const [row, base, col] of [[0, 30, '#1a0f38'], [1, 44, '#0b0620']]) {
      for (let x = -10; x < W + 20; x += rng.range(17, 24)) {
        const r = rng.range(8, 10.5);
        const y = base + rng.range(-3, 3);
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x, y + r * 2.2, r * 1.8, r * 1.4, 0, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        if (rng.chance(row ? 0.25 : 0.18)) {
          const side = rng.chance(0.5) ? -1 : 1;
          g.strokeStyle = col;
          g.lineWidth = 4.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x + side * r * 0.9, y + r * 1.6);
          g.lineTo(x + side * r * 1.6, y - r * 1.4);
          g.stroke();
          g.beginPath();
          g.arc(x + side * r * 1.6, y - r * 1.7, 3.2, 0, TAU);
          g.fillStyle = col;
          g.fill();
        }
        // rim light from the stage
        g.strokeStyle = row ? 'rgba(255,90,170,0.35)' : 'rgba(120,220,255,0.28)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(x, y, r, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    }
  }, 2);
}

function paintBackdrop(W, H, rng, bulbs) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // back wall of the studio
    const wall = g.createLinearGradient(0, 0, 0, HZ);
    wall.addColorStop(0, '#0b0624');
    wall.addColorStop(0.6, '#1e0f4a');
    wall.addColorStop(1, '#341a6e');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, HZ + 2);
    // LED columns
    for (let x = 8; x < W; x += 26) {
      const col = (x / 26) % 2 < 1 ? '255,80,180' : '90,220,255';
      const gr = g.createLinearGradient(0, 30, 0, HZ);
      gr.addColorStop(0, `rgba(${col},0)`);
      gr.addColorStop(0.7, `rgba(${col},0.22)`);
      gr.addColorStop(1, `rgba(${col},0.05)`);
      g.fillStyle = gr;
      g.fillRect(x, 30, 3, HZ - 30);
    }
    // lighting truss
    g.fillStyle = '#2b2440';
    g.fillRect(0, 0, W, 6);
    g.fillRect(0, 14, W, 3);
    g.strokeStyle = '#4a4266';
    g.lineWidth = 1.2;
    for (let x = 0; x < W; x += 12) {
      g.beginPath();
      g.moveTo(x, 6);
      g.lineTo(x + 6, 14);
      g.lineTo(x + 12, 6);
      g.stroke();
    }
    for (const lx of [40, 110, 250, 320]) {
      g.fillStyle = '#16122a';
      g.beginPath();
      g.roundRect(lx - 7, 14, 14, 13, 3);
      g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath();
      g.ellipse(lx, 27, 5, 2, 0, 0, TAU);
      g.fill();
    }
    // the big show screen
    const sx0 = 92;
    const sy0 = 56;
    const sw = 176;
    const sh = 70;
    g.fillStyle = '#0a0520';
    g.beginPath();
    g.roundRect(sx0 - 10, sy0 - 10, sw + 20, sh + 20, 14);
    g.fill();
    const scr = g.createLinearGradient(0, sy0, 0, sy0 + sh);
    scr.addColorStop(0, '#ff3d9a');
    scr.addColorStop(0.55, '#a02bd6');
    scr.addColorStop(1, '#4b1aa8');
    g.fillStyle = scr;
    g.beginPath();
    g.roundRect(sx0, sy0, sw, sh, 8);
    g.fill();
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = sy0; y < sy0 + sh; y += 3) g.fillRect(sx0, y, sw, 1);
    // sunburst behind the logo
    g.save();
    g.beginPath();
    g.roundRect(sx0, sy0, sw, sh, 8);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 16; k += 2) {
      const a0 = (k / 16) * TAU;
      const a1 = ((k + 1) / 16) * TAU;
      g.beginPath();
      g.moveTo(CX, sy0 + sh / 2);
      g.lineTo(CX + Math.cos(a0) * 200, sy0 + sh / 2 + Math.sin(a0) * 200);
      g.lineTo(CX + Math.cos(a1) * 200, sy0 + sh / 2 + Math.sin(a1) * 200);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 26px "Arial Black", Arial, sans-serif';
    for (const [txt, y] of [['WOBBLE', sy0 + 24], ['WALL', sy0 + 50]]) {
      g.lineJoin = 'round';
      g.strokeStyle = '#2a0858';
      g.lineWidth = 6;
      g.strokeText(txt, CX, y + 1);
      g.fillStyle = txt === 'WALL' ? '#ffe14d' : '#ffffff';
      g.fillText(txt, CX, y);
    }
    // marquee bulbs around the screen (lit per frame with chasing glows)
    const per = [];
    const bx0 = sx0 - 6;
    const by0 = sy0 - 6;
    const bw = sw + 12;
    const bh = sh + 12;
    for (let k = 0; k <= 16; k++) per.push([bx0 + (bw * k) / 16, by0]);
    for (let k = 1; k <= 6; k++) per.push([bx0 + bw, by0 + (bh * k) / 6]);
    for (let k = 15; k >= 0; k--) per.push([bx0 + (bw * k) / 16, by0 + bh]);
    for (let k = 5; k >= 1; k--) per.push([bx0, by0 + (bh * k) / 6]);
    for (const [x, y] of per) {
      bulbs.push([x, y]);
      g.fillStyle = '#7a5a3a';
      g.beginPath();
      g.arc(x, y, 2.4, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,230,170,0.6)';
      g.beginPath();
      g.arc(x - 0.5, y - 0.5, 1.1, 0, TAU);
      g.fill();
    }
    // side curtains
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W;
      const cg = g.createLinearGradient(x0, 0, x0 - side * 44, 0);
      cg.addColorStop(0, '#5a0b2e');
      cg.addColorStop(1, '#a3164f');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x0 - side * 46, 0);
      g.quadraticCurveTo(x0 - side * 30, HZ * 0.6, x0 - side * 18, HZ + 6);
      g.lineTo(x0, HZ + 6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30,0,15,0.5)';
      g.lineWidth = 1.5;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(x0 - side * k * 11, 0);
        g.quadraticCurveTo(x0 - side * k * 8, HZ * 0.6, x0 - side * k * 4.5, HZ + 6);
        g.stroke();
      }
    }

    // ---- the stage floor ----
    const fl = g.createLinearGradient(0, HZ, 0, H);
    fl.addColorStop(0, '#120830');
    fl.addColorStop(1, '#070316');
    g.fillStyle = fl;
    g.fillRect(0, HZ, W, H - HZ);
    const sBot = (H - HZ) / EYE;
    const edge = (x, s) => [sx(x, s), HZ + EYE * s];
    g.beginPath();
    g.moveTo(...edge(0, 0.02));
    g.lineTo(...edge(360, 0.02));
    g.lineTo(...edge(360, sBot));
    g.lineTo(...edge(0, sBot));
    g.closePath();
    const st = g.createLinearGradient(0, HZ, 0, H);
    st.addColorStop(0, '#3b1d78');
    st.addColorStop(0.5, '#2a1260');
    st.addColorStop(1, '#3d1670');
    g.fillStyle = st;
    g.fill();
    // glossy reflection of the screen and the lights
    const refl = g.createRadialGradient(CX, HZ + 20, 0, CX, HZ + 20, 120);
    refl.addColorStop(0, 'rgba(255,90,190,0.35)');
    refl.addColorStop(1, 'rgba(255,90,190,0)');
    g.fillStyle = refl;
    g.fillRect(0, HZ, W, 200);
    const shine = g.createRadialGradient(CX, 520, 10, CX, 520, 220);
    shine.addColorStop(0, 'rgba(160,120,255,0.18)');
    shine.addColorStop(1, 'rgba(160,120,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 300, W, H - 300);
    // floor boards converging on the vanishing point
    g.strokeStyle = 'rgba(190,150,255,0.13)';
    g.lineWidth = 1;
    for (let x = 0; x <= 360; x += 40) {
      g.beginPath();
      g.moveTo(...edge(x, 0.02));
      g.lineTo(...edge(x, sBot));
      g.stroke();
    }
    // LED strips along the edges of the stage
    for (const x of [0, 360]) {
      for (const [lw, col] of [[7, 'rgba(80,220,255,0.18)'], [2.5, 'rgba(120,235,255,0.7)'], [1, '#e8fbff']]) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(...edge(x, 0.02));
        g.lineTo(...edge(x, sBot));
        g.stroke();
      }
    }
    // sparkle dust in the gloss
    for (let i = 0; i < 40; i++) {
      const s = rng.range(0.05, sBot);
      const x = sx(rng.range(10, 350), s);
      g.fillStyle = `rgba(255,240,255,${(0.1 + 0.25 * rng.next()).toFixed(2)})`;
      g.fillRect(x, HZ + EYE * s, 1.2, 1.2);
    }
  }, 2);
}

// ---------- music: game-show boogie funk, 128 BPM, E♭ major over E♭–Cm–A♭–B♭ ----------

const music = {
  cps: 128 / 240,
  setup: `
    const kick = note("d2*4").s("sine").decay(0.25).sustain(0).gain(0.8)
    const kick2 = note("d2 d2 d2 [d2 d2]").s("sine").decay(0.23).sustain(0).gain(0.8)
    const clap = s("~ white ~ white").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.08).room(0.3)
    const snare = s("~ pink ~ [pink ~ ~ pink]").decay(0.14).sustain(0).hpf(700).lpf(5200).gain(0.12)
    const open = s("[~ white]*4").decay(0.1).sustain(0).hpf(6800).gain(0.045)
    const hats = s("white*16").decay(0.02).sustain(0).hpf(7200).gain("[0.03 0.014 0.022 0.014]*4")
    const bass = note("<[eb2 ~ eb3 ~ ~ eb2 eb3 ~ eb2 ~ bb2 ~ eb3 ~ db3 eb3] [c2 ~ c3 ~ ~ c2 c3 ~ c2 ~ g2 ~ c3 ~ bb2 c3] [ab2 ~ ab3 ~ ~ ab2 ab3 ~ ab2 ~ eb3 ~ ab3 ~ gb3 ab3] [bb2 ~ bb3 ~ ~ bb2 bb3 ~ bb2 ~ f3 ~ bb3 ~ a3 bb3]>")
      .s("sawtooth").decay(0.13).sustain(0.12).release(0.04).lpf(saw.range(450, 1900).slow(32)).lpq(6).gain(0.32)
    const chords = "<[eb4,g4,bb4] [c4,eb4,g4] [ab3,c4,eb4] [bb3,d4,f4]>"
    const clav = note(chords).struct("~ x ~ x ~ ~ x ~ ~ x ~ x ~ ~ x x").s("square").decay(0.07).sustain(0).lpf(saw.range(1400, 3000).slow(32)).gain(0.045).pan(0.62)
    const brass = note(chords).add(note(12)).struct("x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("sawtooth").attack(0.01).decay(0.2).sustain(0.15).release(0.1)
      .lpf(2400).gain(0.06).room(0.3).pan(0.4)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1100).gain(0.04).room(0.6)
    const tune = "<[bb4@2 g4 bb4 c5@2 bb4 g4] [eb5@3 c5 bb4@2 g4@2] [ab4@2 c5 eb5 f5@2 eb5 c5] [d5@3 f5 bb5@3 ~]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.2).sustain(0.45).release(0.1).lpf(2500).vib(5).vibmod(0.12)
      .gain(0.07).delay(0.22).delaytime(0.352).delayfeedback(0.28).pan(0.5)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1400).gain(0.055)
    const arp = note("<[eb5 g5 bb5 g5]*4 [c5 eb5 g5 eb5]*4 [ab4 c5 eb5 c5]*4 [bb4 d5 f5 d5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3800).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.05).slow(8))
  `,
  song: `arrange(
    [8, stack(kick, clap, open, bass, clav)],
    [8, stack(kick, clap, snare, open, bass, clav, brass, pad)],
    [8, stack(kick, clap, snare, open, hats, bass, clav, brass, pad, lead, arp)],
    [8, stack(kick2, clap, snare, open, hats, bass, clav, brass, pad, lead, leadLow, arp, wash)]
  )`,
};

export default {
  id: 'wobble',
  title: 'Wobble Wall',
  emoji: '🍮',
  tagline: 'Stand still to slim, move to squash flat. Fit through every wall.',
  colors: { bg: '#1b0f3a', fg: '#ffffff', accent: '#ff3d66' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- the whole show, planned up front ----
    const walls = [];
    {
      let ta = 3.4;
      let tx = CX;
      let prevGap = 3.4;
      let prev = '';
      let run = 0;
      let n = 0;
      while (ta < 63) {
        const p = progress(ta, 60, 1.3);
        // fixed draws per wall, whatever happens
        const rType = plan.next();
        const rDist = plan.next();
        const rDir = plan.next();
        const rDouble = plan.next();
        const rOther = plan.next();
        const rMove = plan.next();
        const rAmp = plan.next();
        const rPhase = plan.next();
        const rOmega = plan.next();
        const rGap = plan.next();
        const rColor = plan.next();

        let type;
        if (n === 0) type = 'door';
        else if (ta < 9) type = prev === 'door' ? 'slot' : 'door';
        else {
          const win = ta > 22 ? 0.2 : 0;
          type = rType < win ? 'window' : rType < win + (1 - win) / 2 ? 'door' : 'slot';
          if (type === prev && run >= 2) type = prev === 'slot' ? 'door' : 'slot';
        }
        run = type === prev ? run + 1 : 1;
        prev = type;

        const dims = (ty) =>
          ty === 'door'
            ? { w: lerp(64, 52, p), h: DOOR_H }
            : ty === 'slot'
              ? { w: lerp(170, 118, p), h: lerp(40, 31.5, p) }
              : { w: lerp(92, 80, p), h: lerp(50, 45, p) };
        const main = { type, ...dims(type) };
        const lim = (hw) => [Math.max(hw + 8, PMIN + 6), Math.min(W - hw - 8, PMAX - 6)];

        // where the main hole arrives: a reachable move from the last one
        const reach = VMAX * Math.max(0.3, prevGap - 0.35) * 0.62;
        const minD = n === 0 ? 62 : Math.min(reach * 0.7, lerp(30, 75, p));
        const maxD = n === 0 ? 90 : Math.max(minD, Math.min(reach, 200));
        const dist = lerp(minD, maxD, rDist);
        const [lo, hi] = lim(main.w / 2);
        let nx = tx + (rDir < 0.5 ? -1 : 1) * dist;
        if (nx < lo || nx > hi) nx = tx - (nx - tx);
        nx = clamp(nx, lo, hi);
        main.x = nx;
        main.base = nx;
        main.amp = 0;
        main.omega = 0;
        main.phase = 0;
        // swaying holes from 30s
        if (ta > 30 && rMove < lerp(0, 0.5, p)) {
          main.amp = lerp(26, 60, rAmp);
          main.omega = lerp(1.4, 2.4, rOmega);
          main.phase = rPhase * TAU;
          main.base = nx - main.amp * Math.sin(main.phase);
          // keep the whole sway on stage
          const over = Math.max(lo - (main.base - main.amp), main.base + main.amp - hi, 0);
          if (over > 0) {
            main.amp = Math.max(0, main.amp - over);
            main.base = nx - main.amp * Math.sin(main.phase);
          }
        }
        const holes = [main];

        // from 15s, some walls get a second hole of another kind somewhere else
        if (ta > 15 && rDouble < 0.3) {
          const otype = type === 'door' ? 'slot' : 'door';
          const o = { type: otype, ...dims(otype), amp: 0, omega: 0, phase: 0 };
          const [olo, ohi] = lim(o.w / 2);
          // the free span on either side of the main hole's whole sway range
          const leftHi = main.base - main.amp - main.w / 2 - 26 - o.w / 2;
          const rightLo = main.base + main.amp + main.w / 2 + 26 + o.w / 2;
          const opts = [];
          if (leftHi >= olo) opts.push([olo, leftHi]);
          if (rightLo <= ohi) opts.push([rightLo, ohi]);
          if (opts.length) {
            const [a, b] = opts[rOther < 0.5 || opts.length === 1 ? 0 : 1];
            o.x = o.base = lerp(a, b, (rOther * 7.13) % 1);
            holes.push(o);
          }
        }

        const approach = lerp(2.6, 1.5, p);
        walls.push({
          ta,
          speed: D0 / approach,
          holes,
          col: WALL_COLORS[Math.floor(rColor * WALL_COLORS.length) % WALL_COLORS.length],
          state: 'coming',
        });
        tx = nx;
        prevGap = lerp(2.3, 0.98, p) * (0.9 + 0.2 * rGap);
        ta += prevGap;
        n++;
      }
    }
    const holeX = (h, t, ta) => h.base + h.amp * Math.sin(h.phase + h.omega * (t - ta));

    // ---- art ----
    const bulbs = [];
    const backdrop = paintBackdrop(W, H, art, bulbs);
    const audience = makeAudience(W, art);
    const jelly = makeJelly();
    const faces = { calm: makeFace('calm'), whee: makeFace('whee') };
    const cone = makeCone();
    const glowPink = glowSprite('rgba(255,70,120,0.7)', 40);
    const glowBulb = glowSprite('rgba(255,220,140,0.9)', 8);
    const glowLamp = glowSprite('rgba(255,240,210,0.8)', 26);
    const vignette = vignetteSprite(W, H, 0.6, '8,2,24');
    const fx = createParticles();
    const confetti = createParticles();

    // ---- state ----
    let px = CX;
    let vx = 0;
    let s = 0; // stretch 0 (still, tall) .. 1 (full speed, flat)
    let vs = 0; // the stretch you see, with a wobbly spring on it
    let vsv = 0;
    let now = 0;
    let clock = 0;
    let scroll = 0;
    let shake = 0;
    let cheer = 0;
    let flash = 0;
    let splat = -1;
    let splatWall = null;

    const nextWall = () => walls.find((w) => w.state === 'coming');

    const judge = (wall, t) => {
      const w = shapeW(s);
      const wc = w * SLIM;
      const h = AREA / w;
      for (const ho of wall.holes) {
        const hx = holeX(ho, t, wall.ta);
        if (px - wc / 2 >= hx - ho.w / 2 && px + wc / 2 <= hx + ho.w / 2 && h <= ho.h + 1) return '';
      }
      const ho = wall.holes.find((o) => Math.abs(px - holeX(o, t, wall.ta)) < o.w / 2);
      if (!ho) return 'Splat! You missed the hole.';
      if (h > ho.h + 1) return ho.type === 'slot' ? 'Too tall for the slot. Move to squash flat!' : 'Too tall for the window. Keep moving a bit!';
      if (wc > ho.w) return ho.type === 'door' ? 'Too wide for the door. Slow down to slim!' : 'Too wide for the window. Ease off a bit!';
      return 'Clipped the edge of the hole.';
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.6);
      cheer = Math.max(0, cheer - dt * 2);
      flash = Math.max(0, flash - dt * 2.5);
      // wobbly displayed shape
      vsv += (1500 * (s - vs) - 34 * vsv) * dt;
      vs += vsv * dt;
      fx.update(dt);
      confetti.update(dt);
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { walls, holeX, get px() { return px; }, get vx() { return vx; }, get s() { return s; } },

      update(dt, dir, t) {
        now = t;
        updateCosmetic(dt);

        // a slippery jelly: it speeds up, slides on and slows down
        if (dir) {
          const a = dir * vx < 0 ? ACC + FRIC : ACC;
          vx += dir * a * dt;
        } else {
          const dv = FRIC * dt;
          vx = Math.abs(vx) <= dv ? 0 : vx - Math.sign(vx) * dv;
        }
        vx = clamp(vx, -VMAX, VMAX);
        px += vx * dt;
        if (px < PMIN) {
          px = PMIN;
          if (vx < -60) vsv -= 6;
          vx = 0;
        } else if (px > PMAX) {
          px = PMAX;
          if (vx > 60) vsv -= 6;
          vx = 0;
        }
        s = Math.min(1, Math.abs(vx) / VMAX);

        const nw = nextWall();
        scroll += (nw ? nw.speed : 600) * dt;

        // cosmetic speed droplets
        if (s > 0.45 && Math.random() < dt * 40 * s) {
          const h = AREA / shapeW(s);
          fx.burst(px - Math.sign(vx) * shapeW(s) * 0.45, FLOOR - Math.random() * h * 0.8, { count: 1, speed: 40, life: 0.35, size: 3, round: true, angle: vx > 0 ? Math.PI : 0, spread: 0.6, colors: ['rgba(255,90,130,0.8)', 'rgba(255,170,190,0.7)'] });
        }

        for (const wall of walls) {
          if (wall.state === 'coming' && t >= wall.ta) {
            const why = judge(wall, t);
            if (why) {
              this.dead = true;
              this.deathReason = why;
              splat = 0;
              splatWall = wall;
              shake = 0.6;
              const h = AREA / shapeW(s);
              fx.burst(px, FLOOR - h / 2, { count: 46, speed: 260, life: 1.1, size: 7, round: true, gravity: 520, drag: 0.6, colors: ['#ff3d66', '#ff9ab2', '#e0123f', '#ffd0dc'] });
              return;
            }
            wall.state = 'passed';
            cheer = 1;
            flash = 0.6;
            confetti.burst(px, FLOOR - 70, { count: 26, speed: 230, life: 1.3, size: 4, gravity: 320, drag: 1.2, angle: -Math.PI / 2, spread: 2.4, colors: ['#ffe14d', '#24c8f2', '#ff3d9a', '#a86bff', '#3ff0a0', '#ffffff'] });
          } else if (wall.state === 'passed' && (t - wall.ta) * wall.speed > GONE) {
            wall.state = 'gone';
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (splat >= 0) splat += dt;
      },

      render(g, tRender) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 9 * shake);
        g.drawImage(backdrop.canvas, -4, -4, W + 8, H + 8);

        // moving stage lines
        g.strokeStyle = 'rgba(210,180,255,0.16)';
        g.lineWidth = 1;
        const span = 1260;
        for (let k = 0; k < 14; k++) {
          const z = (((k * 90 - scroll) % span) + span) % span;
          const sc = proj(z);
          const y = HZ + EYE * sc;
          g.globalAlpha = Math.min(1, sc * 1.4);
          g.beginPath();
          g.moveTo(sx(0, sc), y);
          g.lineTo(sx(360, sc), y);
          g.stroke();
        }
        g.globalAlpha = 1;

        // spotlights sweeping the stage, lamps and chasing marquee bulbs
        g.globalCompositeOperation = 'lighter';
        for (const [lx, ph] of [[40, 0], [320, 2.1], [110, 4.2], [250, 1.3]]) {
          const ang = Math.sin(clock * 0.7 + ph) * 0.38 + (lx < CX ? -0.18 : 0.18);
          g.save();
          g.translate(lx, 27);
          g.rotate(ang);
          g.globalAlpha = 0.55 + flash * 0.5;
          g.drawImage(cone.canvas, -70, 0, 140, 560);
          g.restore();
          drawSprite(g, glowLamp, lx, 28, { size: 40, alpha: 0.8 });
        }
        g.globalAlpha = 1;
        const chase = Math.floor(clock * 12);
        for (let i = 0; i < bulbs.length; i++) {
          const on = (i + chase) % 4 === 0 || flash > 0.3;
          drawSprite(g, glowBulb, bulbs[i][0], bulbs[i][1], { size: on ? 15 : 7, alpha: on ? 1 : 0.35 });
        }
        g.globalCompositeOperation = 'source-over';

        // walls still coming, far to near
        const visible = [];
        for (const wall of walls) {
          if (wall.state === 'gone') continue;
          const d = (wall.ta - t) * wall.speed;
          if (d > D0 || d < -GONE) continue;
          visible.push([d, wall]);
        }
        visible.sort((a, b) => b[0] - a[0]);
        for (const [d, wall] of visible) if (d > 0 || wall === splatWall) drawWall(g, wall, d, t);

        // the outline of the next wall's holes, projected round the jelly
        const nw = nextWall();
        if (nw && !game.dead) {
          const d = (nw.ta - t) * nw.speed;
          const a = clamp((620 - d) / 320, 0, 1);
          if (a > 0) {
            g.setLineDash([6, 4]);
            for (const ho of nw.holes) {
              const hx = holeX(ho, t, nw.ta);
              g.strokeStyle = `rgba(${nw.col.neon},${(0.75 * a).toFixed(3)})`;
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(hx - ho.w / 2, FLOOR);
              g.lineTo(hx - ho.w / 2, FLOOR - ho.h);
              g.lineTo(hx + ho.w / 2, FLOOR - ho.h);
              g.lineTo(hx + ho.w / 2, FLOOR);
              g.stroke();
              g.fillStyle = `rgba(${nw.col.neon},${(0.5 * a).toFixed(3)})`;
              g.fillRect(hx - ho.w / 2, FLOOR, ho.w, 4);
            }
            g.setLineDash([]);
          }
        }

        // the jelly
        const dw = shapeW(clamp(vs, -0.15, 1.15));
        const vw = Math.max(20, dw);
        let vh = AREA / vw;
        let bw = vw;
        let alpha = 1;
        if (splat >= 0) {
          const k = Math.min(1, splat / 0.18);
          bw = vw * (1 + 0.9 * k);
          vh = (AREA / vw) * (1 - 0.65 * k);
          alpha = Math.max(0, 1 - splat / 1.1);
        }
        const skew = clamp(-vx / VMAX, -1, 1) * 0.22;
        g.fillStyle = 'rgba(5,0,20,0.45)';
        g.beginPath();
        g.ellipse(px, FLOOR + 2, bw * 0.62, 5, 0, 0, TAU);
        g.fill();
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowPink, px, FLOOR - vh * 0.5, { size: bw * 2.2, alpha: 0.5 * alpha });
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(px, FLOOR);
        g.transform(1, 0, skew, 1, 0, 0);
        g.globalAlpha = alpha;
        g.drawImage(jelly.canvas, -bw / 2, -vh, bw, vh);
        if (splat < 0) {
          const face = s > 0.5 ? faces.whee : faces.calm;
          const fy = -Math.min(vh * 0.62, vh - 10);
          g.drawImage(face.canvas, -15, fy - 9, 30, 18);
        }
        g.restore();
        g.globalAlpha = 1;

        fx.render(g);

        // walls passing over the jelly (it slips through the hole)
        for (const [d, wall] of visible) if (d <= 0 && wall !== splatWall) drawWall(g, wall, d, t, 1 - -d / GONE);

        confetti.render(g);

        // the studio audience
        g.drawImage(audience.canvas, 0, 598 - cheer * 6 + Math.sin(clock * 9) * 1.2, W, 64);

        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };

    function drawWall(g, wall, d, t, fade = 1) {
      const sc = proj(d);
      const far = proj(d + WALL_T);
      const col = wall.col;
      const alpha = clamp((D0 - d) / 160, 0, 1) * clamp(fade, 0, 1);
      if (alpha <= 0) return;
      g.globalAlpha = alpha;
      const L = -4000;
      const R = 4360;
      // top face
      g.fillStyle = col.top;
      g.beginPath();
      g.moveTo(sx(L, far), sy(WALL_H, far));
      g.lineTo(sx(R, far), sy(WALL_H, far));
      g.lineTo(sx(R, sc), sy(WALL_H, sc));
      g.lineTo(sx(L, sc), sy(WALL_H, sc));
      g.closePath();
      g.fill();
      // front face with the holes cut out
      const top = sy(WALL_H, sc);
      const bot = sy(0, sc);
      const gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, col.face);
      gr.addColorStop(1, col.low);
      g.fillStyle = gr;
      g.beginPath();
      g.rect(sx(L, sc), top, sx(R, sc) - sx(L, sc), bot - top);
      for (const ho of wall.holes) {
        const hx = holeX(ho, t, wall.ta);
        const x0 = sx(hx - ho.w / 2, sc);
        const x1 = sx(hx + ho.w / 2, sc);
        g.rect(x0, sy(ho.h, sc), x1 - x0, bot - sy(ho.h, sc));
      }
      g.fill('evenodd');
      // a stripe and foam dimples near the top
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.fillRect(sx(L, sc), sy(WALL_H - 10, sc), sx(R, sc) - sx(L, sc), Math.max(1, 4 * sc));
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(sx(L, sc), sy(WALL_H - 18, sc), sx(R, sc) - sx(L, sc), Math.max(1, 2 * sc));
      // the holes: neon rims, inner depth, and a ghost of the shape that fits
      for (const ho of wall.holes) {
        const hx = holeX(ho, t, wall.ta);
        const x0 = sx(hx - ho.w / 2, sc);
        const x1 = sx(hx + ho.w / 2, sc);
        const y0 = sy(ho.h, sc);
        // the hole's ceiling seen from above
        g.fillStyle = col.ink;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y0);
        g.lineTo(sx(hx + ho.w / 2, far), sy(ho.h, far));
        g.lineTo(sx(hx - ho.w / 2, far), sy(ho.h, far));
        g.closePath();
        g.fill();
        g.lineJoin = 'round';
        for (const [lw, a] of [[6, 0.25], [2, 0.95]]) {
          g.strokeStyle = `rgba(${col.neon},${a})`;
          g.lineWidth = Math.max(1, lw * sc);
          g.beginPath();
          g.moveTo(x0, bot);
          g.lineTo(x0, y0);
          g.lineTo(x1, y0);
          g.lineTo(x1, bot);
          g.stroke();
        }
        // ghost silhouette
        const gh = ho.type === 'door' ? AREA / WMIN : ho.h - 5;
        const gw = AREA / gh;
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = Math.max(1, 1.5 * sc);
        g.beginPath();
        g.roundRect(sx(hx - gw / 2, sc), sy(gh, sc), gw * sc, gh * sc, Math.min(gw, gh) * 0.35 * sc);
        g.fill();
        g.stroke();
        if (ho.type !== 'door') {
          // speed lines: this one wants you moving
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineCap = 'round';
          const n = ho.type === 'slot' ? 3 : 2;
          for (const side of [-1, 1]) {
            for (let k = 0; k < n; k++) {
              const yy = sy(gh * (0.25 + (0.5 * k) / Math.max(1, n - 1)), sc);
              const xa = sx(hx + side * (gw / 2 + 4), sc);
              const xb = sx(hx + side * (gw / 2 + 4 + (ho.type === 'slot' ? 14 : 8)), sc);
              g.beginPath();
              g.moveTo(xa, yy);
              g.lineTo(xb, yy);
              g.stroke();
            }
          }
        }
      }
      g.globalAlpha = 1;
    }

    return game;
  },
};
