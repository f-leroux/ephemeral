// King's Walk — a lone ivory king marches up an endless marble chessboard through the black
// army. You only move left and right; the board rolls on beneath you one rank at a time. Every
// black piece attacks squares by its own chess move (pawns on their two forward diagonals, knights
// on their L-jumps, bishops and rooks along their lines for up to three squares, queens both ways),
// and lines are blocked by any piece standing in the way — your own ivory pawns included. Stand on
// an attacked square (they glow red) or walk into a piece and it's check, and the game is over.
// From 15s pieces start to move on the beat of the song: a ghost shows where each one is going,
// with its new attacks outlined, a moment before it goes. The board rolls faster and the army
// gets thicker and stronger over the minute. Every layout is built around a hidden walk that the
// king can always make at its own speed, so there's always a way through.

import { BODY_FONT, DISPLAY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const FILES = 8;
const S = 40; // one square
const X0 = 20; // the board's left edge (a carved frame either side)
const KY = 540; // centre of the king's square on screen
const KSPEED = 235;
const REACH = 3; // how far bishops, rooks and queens see
const BEAT = 60 / 128;
const ANIM = 0.24; // how long a move takes
const LETTERS = 'abcdefgh';

const speedAt = (t) => lerp(56, 130, progress(t, 60, 1.15)) * lerp(0.62, 1, easeOutCubic(clamp(t / 4, 0, 1)));
const warnAt = (t) => lerp(1.35, 0.95, progress(t, 60, 1));
const fileX = (f) => X0 + f * S + S / 2;

const NAMES = { pawn: 'pawn', knight: 'knight', bishop: 'bishop', rook: 'rook', queen: 'queen', ally: 'pawn' };
const CHECK = {
  pawn: 'Check! A pawn had you on its diagonal.',
  knight: 'Check! You stepped where a knight could jump.',
  bishop: 'Check! The bishop had you on its diagonal.',
  rook: 'Check! The rook had you on its line.',
  queen: 'Check! The queen saw you coming.',
};
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ORTHO = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const DIAG = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

// ---------- art ----------

const OBSIDIAN = { stops: ['#1c2130', '#66739a', '#262c3e', '#06070b'], line: 'rgba(150,175,230,0.55)', dark: '#05060a', accent: '#e0364f', accent2: '#ff8a9a' };
const IVORY = { stops: ['#c3ab82', '#fffaf0', '#efe1c2', '#8f7552'], line: 'rgba(255,255,255,0.7)', dark: '#6e5638', accent: '#e8b43c', accent2: '#fff0a8' };

function shade(g, m, w = 15) {
  const gr = g.createLinearGradient(-w, 0, w, 0);
  gr.addColorStop(0, m.stops[0]);
  gr.addColorStop(0.3, m.stops[1]);
  gr.addColorStop(0.52, m.stops[2]);
  gr.addColorStop(1, m.stops[3]);
  return gr;
}

function lathe(g, prof) {
  g.beginPath();
  g.moveTo(-prof[0][0], prof[0][1]);
  for (const [w, y] of prof) g.lineTo(-w, y);
  for (let i = prof.length - 1; i >= 0; i--) g.lineTo(prof[i][0], prof[i][1]);
  g.closePath();
}

function ball(g, m, x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
  gr.addColorStop(0, m.stops[1]);
  gr.addColorStop(0.55, m.stops[2]);
  gr.addColorStop(1, m.stops[3]);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

const BASE = [[14, 30], [14, 27], [12.5, 25.5], [12.5, 23.5], [10, 22]];

// Pieces stand in a 40×70 sprite with the bottom of their base at y = 30.
function paintPiece(type, m) {
  return makeSprite(40, 70, (g) => {
    // shadow on the board
    g.fillStyle = 'rgba(10,20,20,0.35)';
    g.beginPath();
    g.ellipse(3, 29.5, 16, 4.5, 0, 0, TAU);
    g.fill();
    const body = (prof) => {
      lathe(g, prof);
      g.fillStyle = shade(g, m);
      g.fill();
    };
    if (type === 'pawn') {
      body([...BASE, [8, 20], [6, 14], [5, 8], [4.6, 5], [8, 3.5], [8, 1.5], [4.2, 0.5]]);
      ball(g, m, 0, -6, 6.8);
    } else if (type === 'rook') {
      body([...BASE, [10, 20], [8.5, 18], [8, 2], [9.5, 0], [11, -2], [11, -12]]);
      g.fillStyle = shade(g, m, 12);
      for (const [a, b] of [[-11, -6.5], [-2.4, 2.4], [6.5, 11]]) g.fillRect(a, -17, b - a, 5.5);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-11, -2.6, 22, 1.4);
      g.fillRect(-11, -12.6, 22, 1);
    } else if (type === 'bishop') {
      body([...BASE, [8.5, 20], [6.5, 12], [4.5, 4], [4, 1], [8, -0.5], [8, -2.5], [4, -3.5]]);
      g.fillStyle = shade(g, m, 9);
      g.beginPath();
      g.moveTo(-4.5, -3.5);
      g.bezierCurveTo(-9, -8, -7.5, -17, 0, -22);
      g.bezierCurveTo(7.5, -17, 9, -8, 4.5, -3.5);
      g.closePath();
      g.fill();
      g.strokeStyle = m.dark;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-2.5, -16);
      g.lineTo(4, -9.5);
      g.stroke();
      ball(g, m, 0, -24.5, 2.6);
    } else if (type === 'queen') {
      body([...BASE, [9, 20], [7, 12], [5, 2], [4.2, -4], [8.5, -6], [8.5, -8], [4.6, -9], [6.5, -13], [9.5, -18]]);
      g.fillStyle = shade(g, m, 10);
      g.beginPath();
      g.moveTo(-9.5, -18);
      const tips = [-9.5, -4.75, 0, 4.75, 9.5];
      for (let i = 0; i < tips.length; i++) {
        g.lineTo(tips[i], -24);
        if (i < tips.length - 1) g.lineTo((tips[i] + tips[i + 1]) / 2, -20);
      }
      g.lineTo(9.5, -18);
      g.closePath();
      g.fill();
      for (const x of tips) ball(g, m, x, -24.5, 1.7);
      ball(g, m, 0, -28, 2.8);
    } else if (type === 'king') {
      body([...BASE, [9, 20], [7, 12], [5.2, 2], [4.6, -5], [9, -7], [9, -9], [5, -10], [7, -16], [8, -19]]);
      g.fillStyle = shade(g, m, 10);
      g.beginPath();
      g.moveTo(-8, -19);
      g.quadraticCurveTo(0, -27, 8, -19);
      g.closePath();
      g.fill();
      g.fillStyle = m.accent;
      g.fillRect(-1.6, -34, 3.2, 10);
      g.fillRect(-4.4, -31, 8.8, 2.8);
      g.fillStyle = m.accent2;
      g.fillRect(-1.6, -34, 1.2, 10);
      // a gold band round the crown
      g.fillStyle = m.accent;
      g.fillRect(-8.6, -19.5, 17.2, 2);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(-8.6, -19.5, 17.2, 0.6);
    } else if (type === 'knight') {
      lathe(g, [...BASE, [10, 20]]);
      g.fillStyle = shade(g, m);
      g.fill();
      g.fillStyle = shade(g, m, 13);
      g.beginPath();
      g.moveTo(-9, 21);
      g.lineTo(-7, 12);
      g.quadraticCurveTo(-5, 7, -8, 4);
      g.lineTo(-15, -1);
      g.quadraticCurveTo(-18.5, -3, -16.8, -7.5);
      g.lineTo(-15, -10);
      g.lineTo(-6, -17);
      g.quadraticCurveTo(-4, -19, -3.5, -20);
      g.lineTo(-4.5, -27);
      g.lineTo(0.8, -20.5);
      g.quadraticCurveTo(9, -18, 10.5, -6);
      g.quadraticCurveTo(11.5, 8, 9.5, 21);
      g.closePath();
      g.fill();
      // a light blaze down the nose and a line for the mouth
      g.strokeStyle = m.line;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(-5.5, -17.5);
      g.lineTo(-14.5, -9.5);
      g.stroke();
      g.strokeStyle = m.dark;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-17, -4.5);
      g.lineTo(-12.5, -3.5);
      g.stroke();
      // mane
      g.strokeStyle = m.dark;
      g.lineWidth = 1;
      g.globalAlpha = 0.6;
      for (let i = 0; i < 6; i++) {
        const y = -17 + i * 5;
        g.beginPath();
        g.moveTo(4 + i * 0.6, y);
        g.quadraticCurveTo(8 + i * 0.4, y + 1, 9.5 + i * 0.3, y + 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = m.dark;
      g.beginPath();
      g.arc(-15, -7.5, 1, 0, TAU);
      g.fill();
      g.fillStyle = m === OBSIDIAN ? m.accent : m.dark;
      g.beginPath();
      g.ellipse(-7, -13, 2, 1.4, -0.4, 0, TAU);
      g.fill();
    }
    // a thin rim of light down the left edge, and the coloured collar every piece wears
    g.strokeStyle = m.line;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-12, 27);
    g.lineTo(-12, 24);
    g.stroke();
    g.fillStyle = m.accent;
    g.beginPath();
    g.ellipse(0, 22.5, 10.5, 1.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = m.accent2;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.ellipse(-3, 22, 4, 0.6, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }, 3);
}

function paintBoard(rng) {
  // eight ranks of marble that tile seamlessly up the screen
  const BW = FILES * S;
  const BH = 8 * S;
  return makeSprite(BW, BH, (g) => {
    g.translate(-BW / 2, -BH / 2);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < FILES; f++) {
        // the tile's bottom row is rank 0, which starts dark on the a-file
        const dark = (f + r) % 2 === 0;
        const y = BH - (r + 1) * S;
        const x = f * S;
        const gr = g.createLinearGradient(x, y, x + S, y + S);
        if (dark) {
          gr.addColorStop(0, '#6b9c92');
          gr.addColorStop(1, '#4a7a72');
        } else {
          gr.addColorStop(0, '#f6ecd6');
          gr.addColorStop(1, '#e2d2b0');
        }
        g.fillStyle = gr;
        g.fillRect(x, y, S, S);
      }
    }
    // veins running through the marble
    const wrap = (fn) => {
      for (const dy of [-BH, 0, BH]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-20, BW + 20);
      const y = rng.range(0, BH);
      const len = rng.range(60, 180);
      const a = rng.range(-0.9, 0.9) + (rng.chance(0.5) ? 0 : Math.PI);
      const light = rng.chance(0.55);
      const lw = rng.range(0.4, 1.4);
      const bend = rng.range(-30, 30);
      wrap(() => {
        g.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(30,50,45,0.13)';
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + bend, y + Math.sin(a) * len * 0.5 - bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      });
    }
    for (let i = 0; i < 300; i++) {
      const x = rng.range(0, BW);
      const y = rng.range(0, BH);
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(20,40,35,0.08)';
      g.fillRect(x, y, rng.range(0.6, 1.8), rng.range(0.6, 1.8));
    }
    // fine inlay between squares
    g.fillStyle = 'rgba(40,50,40,0.18)';
    for (let f = 1; f < FILES; f++) g.fillRect(f * S - 0.5, 0, 1, BH);
    for (let r = 0; r < 8; r++) g.fillRect(0, r * S - 0.5, BW, 1);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let r = 0; r < 8; r++) g.fillRect(0, r * S + 0.5, BW, 0.6);
  }, 2);
}

function paintFrame(H, rng) {
  // carved walnut either side of the board, with a gold inlay
  return makeSprite(X0, H, (g) => {
    g.translate(-X0 / 2, -H / 2);
    const gr = g.createLinearGradient(0, 0, X0, 0);
    gr.addColorStop(0, '#1e120b');
    gr.addColorStop(0.45, '#4a2c1a');
    gr.addColorStop(1, '#2a1810');
    g.fillStyle = gr;
    g.fillRect(0, 0, X0, H);
    for (let i = 0; i < 70; i++) {
      const x = rng.range(1, X0 - 1);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(120,70,40,0.35)' : 'rgba(10,5,2,0.35)';
      g.lineWidth = rng.range(0.3, 1);
      g.beginPath();
      g.moveTo(x, rng.range(-40, H));
      g.lineTo(x + rng.range(-1.5, 1.5), rng.range(0, H + 40));
      g.stroke();
    }
    g.fillStyle = 'rgba(255,220,160,0.12)';
    g.fillRect(4, 0, 1.2, H);
  }, 2);
}

export default {
  id: 'kingwalk',
  title: "King's Walk",
  emoji: '♟️',
  tagline: 'March your king up the board. Never step on a square under attack.',
  colors: { bg: '#1f3a37', fg: '#f6ecd6', accent: '#e8b43c' },

  music: {
    cps: 32 / 60,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick2 = note("c2 c2 c2 [c2 c2]").s("sine").decay(0.2).sustain(0).gain("0.8 0.8 0.8 [0.8 0.55]")
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1200).lpf(5200).gain(0.12).room(0.3)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.016 0.03 0.02 0.036]*4")
      const drag = s("~ ~ ~ ~ ~ ~ ~ [pink pink pink pink]").decay(0.05).sustain(0).hpf(1500).lpf(4500).gain("[0.03 0.05 0.07 0.1]").room(0.2)
      const bass = note("<[bb2 ~ ~ bb2 f2 ~ bb2 ~ bb2 ~ ~ bb2 f2 ~ db3 ~] [gb2 ~ ~ gb2 db3 ~ gb2 ~ gb2 ~ ~ gb2 db3 ~ bb2 ~] [eb2 ~ ~ eb2 bb2 ~ eb2 ~ eb2 ~ ~ eb2 bb2 ~ gb2 ~] [f2 ~ ~ f2 c3 ~ f2 ~ f2 ~ ~ f2 c3 ~ a2 ~]>")
        .s("sawtooth").decay(0.18).sustain(0.2).release(0.05).lpf(saw.range(380, 1500).slow(32)).lpq(5).gain(0.42)
      const chords = "<[bb3,db4,f4] [gb3,bb3,db4] [gb3,bb3,eb4] [f3,a3,c4,eb4]>"
      const marcato = note(chords).struct("x ~ x ~ x ~ x ~").s("sawtooth").decay(0.09).sustain(0).lpf(saw.range(1200, 2600).slow(32)).gain(0.085).pan(0.42)
      const piano = note(chords).add(note(12)).struct("x ~ ~ x ~ ~ x ~").s("triangle").decay(0.18).sustain(0.05).release(0.08).gain(0.11).room(0.25).pan(0.58)
      const bando = note(chords).struct("~ x ~ x ~ x x ~").s("square").attack(0.01).decay(0.15).sustain(0.3).release(0.08)
        .lpf(1600).vib(5).vibmod(0.1).gain(0.04).pan(0.35)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1000).gain(0.04).room(0.4)
      const tune = "<[bb4@2 db5 f5@2 bb5 a5 bb5] [db6@2 bb5 gb5@2 f5 gb5 bb5] [eb6@2 db6 bb5@2 gb5 f5 eb5] [f5@2 a5 c6@2 eb6 db6 c6] [db6@2 c6 bb5@3 f5 db5] [gb5@2 f5 db5@2 bb4 db5 f5] [gb5@2 f5 eb5@2 db5 eb5 gb5] [f5 e5 f5 a5 c6@4]>"
      const violin = note(tune).s("sawtooth").attack(0.03).decay(0.2).sustain(0.5).release(0.12).lpf(2600).vib(6).vibmod(0.15)
        .gain(0.075).room(0.35).delay(0.2).delaytime(0.352).delayfeedback(0.25).pan(0.6)
      const cello = note(tune).add(note(-12)).s("sawtooth").attack(0.03).decay(0.2).sustain(0.5).release(0.1).lpf(1200).vib(5).vibmod(0.1).gain(0.06).pan(0.45)
      const arp = note("<[bb4 db5 f5 db5]*4 [gb4 bb4 db5 bb4]*4 [eb4 gb4 bb4 gb4]*4 [f4 a4 c5 a4]*4>")
        .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(900, 5000).slow(8)).gain(saw.range(0, 0.05).slow(8))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, marcato, piano, bando)],
      [8, stack(kick, clap, hats, bass, marcato, piano, bando, violin)],
      [8, stack(kick, clap, hats, shaker, drag, bass, marcato, piano, bando, violin, pad)],
      [8, stack(kick2, clap, hats, shaker, drag, bass, marcato, piano, bando, violin, cello, arp, pad, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- how far the board has rolled by time t ----
    const N = Math.ceil(70 / STEP);
    const cum = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + speedAt((i - 0.5) * STEP) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, N - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };
    const tAtS = (s) => {
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] < s) lo = m;
        else hi = m;
      }
      return lo * STEP;
    };
    // the king's square centre sits at board height S/2 + distance; rank r begins when that reaches r·S
    const rankStart = (r) => tAtS(r * S - S / 2);
    const rankAtT = (t) => Math.floor((S / 2 + cumAt(t)) / S);
    const NR = Math.ceil((cumAt(66) + H) / S) + 6;

    // ---- the hidden walk: a file for every rank that the king can always reach in time ----
    const route = new Int8Array(NR + 1);
    {
      let f = 4;
      let still = 0;
      for (let r = 0; r <= NR; r++) {
        route[r] = f;
        const rt = rankStart(r + 1) - rankStart(r);
        const k = Math.max(1, Math.floor((0.6 * rt * KSPEED) / S));
        if (r < 3) continue;
        if (still < 2 && plan.chance(0.38)) {
          still++;
          continue;
        }
        still = 0;
        let d = plan.int(1, k) * (plan.chance(0.5) ? 1 : -1);
        if (f + d < 0 || f + d > FILES - 1) d = -d;
        // drift back towards the middle now and then, so the walk uses the whole board
        if ((f <= 1 && d < 0) || (f >= 6 && d > 0)) d = -d;
        f = clamp(f + d, 0, FILES - 1);
      }
    }
    const corridor = new Uint8Array(NR + 1);
    for (let r = 0; r < NR; r++) {
      const a = Math.min(route[r], route[r + 1]);
      const b = Math.max(route[r], route[r + 1]);
      for (let f = a; f <= b; f++) corridor[r] |= 1 << f;
    }
    const inCorr = (f, r) => r >= 0 && r <= NR && (corridor[r] >> f) & 1;
    const key = (f, r) => r * FILES + f;
    const onBoard = (f, r) => f >= 0 && f < FILES && r >= 0;

    // ---- the black army ----
    const occ = new Map(); // squares held by pieces that never move (they block lines)
    const reserved = new Set(); // squares a moving piece will use
    const pieces = [];
    const forAttacks = (type, pf, pr, cb) => {
      if (type === 'pawn') {
        cb(pf - 1, pr - 1, -1);
        cb(pf + 1, pr - 1, -1);
      } else if (type === 'knight') {
        for (const [df, dr] of KNIGHT) cb(pf + df, pr + dr, -1);
      } else if (type === 'bishop' || type === 'rook' || type === 'queen') {
        const dirs = type === 'bishop' ? DIAG : type === 'rook' ? ORTHO : [...ORTHO, ...DIAG];
        for (let d = 0; d < dirs.length; d++) {
          const [df, dr] = dirs[d];
          for (let i = 1; i <= REACH; i++) {
            const f = pf + df * i;
            const r = pr + dr * i;
            if (!onBoard(f, r) || occ.has(key(f, r))) break;
            cb(f, r, d);
          }
        }
      }
    };
    const safeRank = rankAtT(2.7);
    const attacksClean = (type, f, r) => {
      let ok = true;
      forAttacks(type, f, r, (ff, rr) => {
        if (!onBoard(ff, rr)) return;
        if (rr <= safeRank || inCorr(ff, rr)) ok = false;
      });
      return ok;
    };
    const freeSquare = (f, r) => onBoard(f, r) && r > safeRank && r < NR && !inCorr(f, r) && !occ.has(key(f, r)) && !reserved.has(key(f, r));

    const pickType = (t) => {
      const opts = [['pawn', 3]];
      if (t > 3) opts.push(['knight', 2.2]);
      if (t > 6) opts.push(['bishop', 1.8]);
      if (t > 7) opts.push(['ally', 0.7]);
      if (t > 11) opts.push(['rook', lerp(1, 1.8, clamp((t - 11) / 30, 0, 1))]);
      if (t > 24) opts.push(['queen', lerp(0.4, 1, clamp((t - 24) / 30, 0, 1))]);
      let sum = 0;
      for (const o of opts) sum += o[1];
      let x = plan.next() * sum;
      for (const o of opts) {
        x -= o[1];
        if (x <= 0) return o[0];
      }
      return 'pawn';
    };

    const moveOptions = (type, f, r) => {
      const out = [];
      if (type === 'pawn') out.push({ f, r: r - 1, path: [] });
      else if (type === 'knight') for (const [df, dr] of KNIGHT) out.push({ f: f + df, r: r + dr, path: [] });
      else if (type === 'rook' || type === 'bishop') {
        const dirs = type === 'rook' ? [[1, 0], [-1, 0]] : DIAG;
        for (const [df, dr] of dirs) {
          const path = [];
          for (let i = 1; i <= (type === 'rook' ? 3 : 2); i++) {
            out.push({ f: f + df * i, r: r + dr * i, path: path.slice() });
            path.push([f + df * i, r + dr * i]);
          }
        }
      }
      return out;
    };

    for (let r = safeRank + 1; r < NR - 4; r++) {
      const t = rankStart(r);
      const p = progress(t, 60, 1.1);
      const want = lerp(1.0, 3.8, p);
      const tries = Math.floor(want) + (plan.chance(want % 1) ? 1 : 0);
      for (let k = 0; k < tries; k++) {
        const type = pickType(t);
        for (let a = 0; a < 7; a++) {
          const f = plan.int(0, FILES - 1);
          if (!freeSquare(f, r)) continue;
          if (type === 'ally') {
            occ.set(key(f, r), true);
            pieces.push({ type, f, r });
            break;
          }
          if (!attacksClean(type, f, r)) continue;
          const canMove = type !== 'queen' && t > 15 && plan.chance(lerp(0.22, 0.5, p));
          if (canMove) {
            const opts = plan.shuffle(moveOptions(type, f, r));
            let chosen = null;
            for (const o of opts) {
              if (!freeSquare(o.f, o.r)) continue;
              if (o.path.some(([pf, pr]) => !freeSquare(pf, pr))) continue;
              if (!attacksClean(type, o.f, o.r)) continue;
              chosen = o;
              break;
            }
            if (chosen) {
              const d = plan.int(4, 7);
              let tm = rankStart(r - d) + plan.range(0, 0.4);
              tm = Math.round(tm / BEAT) * BEAT;
              if (tm > 15) {
                const pc = { type, f, r, mv: { f: chosen.f, r: chosen.r, path: chosen.path, t: tm, warn: warnAt(tm) } };
                reserved.add(key(f, r));
                reserved.add(key(chosen.f, chosen.r));
                for (const [pf, pr] of chosen.path) reserved.add(key(pf, pr));
                pieces.push(pc);
                break;
              }
            }
          }
          occ.set(key(f, r), true);
          pieces.push({ type, f, r });
          break;
        }
      }
    }
    pieces.sort((a, b) => a.r - b.r);
    for (const pc of pieces) {
      pc.landed = false;
      pc.minR = pc.mv ? Math.min(pc.r, pc.mv.r) : pc.r;
    }

    // where a piece stands (and attacks from) at time t
    const spots = (pc, t) => {
      if (!pc.mv || t < pc.mv.t) return [[pc.f, pc.r]];
      if (t < pc.mv.t + ANIM) return [[pc.f, pc.r], [pc.mv.f, pc.mv.r]];
      return [[pc.mv.f, pc.mv.r]];
    };

    // ---- art ----
    const board = paintBoard(art);
    const frame = paintFrame(H, art);
    const sprites = {};
    for (const type of ['pawn', 'knight', 'bishop', 'rook', 'queen']) sprites[type] = paintPiece(type, OBSIDIAN);
    sprites.ally = paintPiece('pawn', IVORY);
    const kingArt = paintPiece('king', IVORY);
    const goldGlow = glowSprite('rgba(255,210,110,0.55)', 40);
    const redGlow = glowSprite('rgba(255,50,70,0.7)', 30);
    const lampGlow = glowSprite('rgba(255,225,170,0.35)', 120);
    const vignette = vignetteSprite(W, H, 0.6, '8,18,20');
    const light = makeSprite(W, H, (g) => {
      g.translate(-W / 2, -H / 2);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,214,150,0.16)');
      gr.addColorStop(0.5, 'rgba(255,214,150,0)');
      gr.addColorStop(1, 'rgba(20,40,60,0.2)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }, 1);

    // ---- run state ----
    const fx = createParticles();
    const motes = createParticles();
    let time = 0;
    let clock = 0;
    let dist = 0;
    let kx = fileX(4);
    let kvx = 0;
    let lo = 0;
    let culprit = null; // { pc, f, r, kind: 'check' | 'bump' }
    let shake = 0;
    let fallen = 0;
    let deadClock = 0;
    let stepTick = 0;

    const kingB = () => S / 2 + dist;
    const rankY = (r) => KY - ((r + 0.5) * S - kingB());
    const kingSquare = () => [clamp(Math.floor((kx - X0) / S), 0, FILES - 1), Math.floor(kingB() / S)];

    const threat = (f, r, t) => {
      while (lo < pieces.length && pieces[lo].r < r - 8) lo++;
      for (let i = lo; i < pieces.length && pieces[i].r <= r + 7; i++) {
        const pc = pieces[i];
        for (const [sf, sr] of spots(pc, t)) {
          if (sf === f && sr === r) return { pc, f: sf, r: sr, kind: 'bump' };
          let hit = false;
          forAttacks(pc.type, sf, sr, (af, ar) => {
            if (af === f && ar === r) hit = true;
          });
          if (hit) return { pc, f: sf, r: sr, kind: 'check' };
        }
      }
      return null;
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir) {
        if (this.dead) return;
        time += dt;
        clock += dt;
        // slide across the board; let go and the king settles in the middle of its square
        let target;
        if (dir) target = dir * KSPEED;
        else {
          const c = fileX(clamp(Math.round((kx - X0 - S / 2) / S), 0, FILES - 1));
          target = clamp((c - kx) * 10, -KSPEED * 0.7, KSPEED * 0.7);
        }
        kvx += (target - kvx) * Math.min(1, 24 * dt);
        kx += kvx * dt;
        if (kx < fileX(0)) {
          kx = fileX(0);
          kvx = 0;
        } else if (kx > fileX(FILES - 1)) {
          kx = fileX(FILES - 1);
          kvx = 0;
        }
        dist = cumAt(time);

        const [f, r] = kingSquare();
        const hit = threat(f, r, time);
        if (hit) {
          culprit = hit;
          const name = NAMES[hit.pc.type];
          if (hit.kind === 'bump') {
            if (hit.pc.type === 'ally') this.die('Walked into one of your own pawns.');
            else if (hit.pc.mv && time >= hit.pc.mv.t) this.die(`Captured! The ${name} took your square.`);
            else this.die(`Walked straight into a ${name}.`);
          } else this.die(CHECK[hit.pc.type]);
          return;
        }

        // pieces landing after a move kick up marble dust
        for (let i = lo; i < pieces.length && pieces[i].r <= r + 18; i++) {
          const pc = pieces[i];
          if (pc.mv && !pc.landed && time >= pc.mv.t + ANIM) {
            pc.landed = true;
            fx.burst(fileX(pc.mv.f), rankY(pc.mv.r) + 10, { count: 12, speed: 70, life: 0.5, size: 3, colors: ['#f6ecd6', '#d8c8a8', '#9fc0b8'], drag: 3 });
          }
        }
        stepTick += dt;
        if (Math.abs(kvx) > 120 && stepTick > 0.05) {
          stepTick = 0;
          fx.burst(kx - Math.sign(kvx) * 10, KY + 10, { count: 2, speed: 40, life: 0.4, size: 2.4, colors: ['#fff6dc', '#e8d8b0'], drag: 3, angle: Math.PI / 2, spread: 2 });
        }
        this.cosmetics(dt, speedAt(time));
      },

      cosmetics(dt, v) {
        if (Math.random() < dt * 5) {
          motes.burst(X0 + Math.random() * S * FILES, Math.random() * H, { count: 1, speed: 8, life: 2.2, size: 2.2, colors: ['rgba(255,236,190,0.8)', 'rgba(255,250,220,0.7)'], round: true });
        }
        fx.update(dt, v);
        motes.update(dt, v * 0.4);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = 0.35;
        fx.burst(kx, KY - 10, { count: 26, speed: 190, life: 0.9, size: 3.6, colors: ['#ff5468', '#ffd0d6', '#e8b43c', '#fff6dc'], drag: 2.4 });
        fx.burst(kx, KY + 8, { count: 14, speed: 90, life: 0.7, size: 3, colors: ['#f6ecd6', '#d8c8a8'], drag: 3 });
      },

      afterlife(dt) {
        clock += dt;
        deadClock += dt;
        shake = Math.max(0, shake - dt);
        fallen = Math.min(1, fallen + dt / 0.45);
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        g.fillStyle = '#1f3a37';
        g.fillRect(0, 0, W, H);

        const pulse = 0.5 + 0.5 * Math.sin(clock * 9);
        const [kf, kr] = kingSquare();
        const rTop = kr + Math.ceil((KY + S) / S) + 1;
        const rBot = kr - 2;

        // the marble board, one eight-rank tile at a time
        const BH = 8 * S;
        for (let k = Math.floor(rBot / 8) - 1; k < Math.floor(rTop / 8) + 2; k++) {
          const bottom = rankY(8 * k) + S / 2;
          if (bottom < 0 || bottom - BH > H) continue;
          g.drawImage(board.canvas, X0, bottom - BH, FILES * S, BH);
        }

        // gather what's on screen: attacked squares, threatened-next squares, pieces
        const rows = rTop - rBot + 1;
        const atk = new Array(rows * FILES).fill(null);
        const warn = new Uint8Array(rows * FILES);
        const lines = [];
        const vis = [];
        for (let i = Math.max(0, lo - 4); i < pieces.length && pieces[i].r <= rTop + 6; i++) {
          const pc = pieces[i];
          const top = pc.mv ? Math.max(pc.r, pc.mv.r) : pc.r;
          if (top < rBot - 4) continue;
          vis.push(pc);
          if (pc.type === 'ally') continue;
          for (const [sf, sr] of spots(pc, time)) {
            const ends = [];
            forAttacks(pc.type, sf, sr, (af, ar, d) => {
              if (af < 0 || af >= FILES || ar < rBot || ar > rTop) {
                if (d >= 0) ends[d] = [af, ar];
                return;
              }
              const idx = (ar - rBot) * FILES + af;
              if (!atk[idx]) atk[idx] = pc;
              if (d >= 0) ends[d] = [af, ar];
            });
            if (ends.length) lines.push({ sf, sr, ends });
          }
          if (pc.mv && time < pc.mv.t && time > pc.mv.t - pc.mv.warn) {
            forAttacks(pc.type, pc.mv.f, pc.mv.r, (af, ar) => {
              if (af < 0 || af >= FILES || ar < rBot || ar > rTop) return;
              warn[(ar - rBot) * FILES + af] = 1;
            });
            if (pc.mv.r >= rBot && pc.mv.r <= rTop) warn[(pc.mv.r - rBot) * FILES + pc.mv.f] = 2;
          }
        }

        // attacked squares glow red, brighter the closer they are
        for (let r = rBot; r <= rTop; r++) {
          const y = rankY(r) - S / 2;
          if (y > H || y < -S) continue;
          const near = clamp(1 - (r - kr) / 6, 0, 1);
          for (let f = 0; f < FILES; f++) {
            const idx = (r - rBot) * FILES + f;
            const x = X0 + f * S;
            if (atk[idx]) {
              // a strong, saturated red that reads clearly on both the cream and the teal squares
              g.fillStyle = `rgba(200,16,42,${0.6 + 0.15 * near})`;
              g.fillRect(x, y, S, S);
              g.strokeStyle = `rgba(255,150,160,${0.75 + 0.25 * near})`;
              g.lineWidth = 2.4;
              g.strokeRect(x + 3, y + 3, S - 6, S - 6);
              // a pale cross in the middle, so it isn't down to colour alone
              const c = S * 0.13;
              g.strokeStyle = `rgba(255,215,220,${0.7 + 0.3 * near})`;
              g.lineWidth = 2.2;
              g.lineCap = 'round';
              g.beginPath();
              g.moveTo(x + S / 2 - c, y + S / 2 - c);
              g.lineTo(x + S / 2 + c, y + S / 2 + c);
              g.moveTo(x + S / 2 + c, y + S / 2 - c);
              g.lineTo(x + S / 2 - c, y + S / 2 + c);
              g.stroke();
            }
            if (warn[idx] === 1) {
              g.strokeStyle = `rgba(255,70,95,${0.5 + 0.45 * pulse})`;
              g.lineWidth = 2;
              g.setLineDash([5, 4]);
              g.strokeRect(x + 4, y + 4, S - 8, S - 8);
              g.setLineDash([]);
              g.fillStyle = `rgba(200,16,42,${0.14 + 0.14 * pulse})`;
              g.fillRect(x, y, S, S);
            }
          }
        }
        // lines of fire from bishops, rooks and queens
        g.lineCap = 'round';
        for (const { sf, sr, ends } of lines) {
          const x0 = fileX(sf);
          const yy0 = rankY(sr);
          for (const e of ends) {
            if (!e) continue;
            g.strokeStyle = 'rgba(255,80,105,0.5)';
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(x0, yy0);
            g.lineTo(fileX(e[0]), rankY(e[1]));
            g.stroke();
          }
        }

        // where pieces are about to move: a dashed path and a fuse ring
        for (const pc of vis) {
          if (!pc.mv || time >= pc.mv.t || time < pc.mv.t - pc.mv.warn) continue;
          const u = clamp((pc.mv.t - time) / pc.mv.warn, 0, 1);
          const ax = fileX(pc.f);
          const ay = rankY(pc.r);
          const bx = fileX(pc.mv.f);
          const by = rankY(pc.mv.r);
          g.strokeStyle = `rgba(255,220,120,${0.6 + 0.35 * pulse})`;
          g.lineWidth = 2.4;
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(ax, ay);
          if (pc.type === 'knight') {
            // knights go round the corner of their L
            if (Math.abs(pc.mv.r - pc.r) === 2) g.lineTo(ax, by);
            else g.lineTo(bx, ay);
          }
          g.lineTo(bx, by);
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = `rgba(255,90,110,0.9)`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(ax, ay + 10, 15, -Math.PI / 2, -Math.PI / 2 + TAU * u);
          g.stroke();
        }

        // the king's own square
        {
          const y = rankY(kr) - S / 2;
          const x = X0 + kf * S;
          g.fillStyle = 'rgba(255,214,120,0.18)';
          g.fillRect(x, y, S, S);
          g.strokeStyle = this.dead ? `rgba(255,80,100,${0.6 + 0.4 * pulse})` : 'rgba(255,214,120,0.95)';
          g.lineWidth = 2.2;
          g.strokeRect(x + 2, y + 2, S - 4, S - 4);
        }

        // the frame, with rank numbers rolling past
        g.drawImage(frame.canvas, 0, 0, X0, H);
        g.save();
        g.translate(W, 0);
        g.scale(-1, 1);
        g.drawImage(frame.canvas, 0, 0, X0, H);
        g.restore();
        g.fillStyle = 'rgba(255,220,150,0.55)';
        g.fillRect(X0 - 1, 0, 1, H);
        g.fillRect(W - X0, 0, 1, H);
        g.font = `600 10px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let r = rBot; r <= rTop; r++) {
          const y = rankY(r);
          if (r < 0 || y < -10 || y > H + 10) continue;
          g.fillStyle = r === kr ? '#ffd27a' : 'rgba(240,215,170,0.6)';
          g.fillText(String(r + 1), X0 / 2 + 1, y);
          g.fillText(String(r + 1), W - X0 / 2 - 1, y);
        }

        // pieces and the king, back to front
        const items = [];
        for (const pc of vis) {
          let x;
          let y;
          let hop = 0;
          if (pc.mv && time >= pc.mv.t) {
            const u = clamp((time - pc.mv.t) / ANIM, 0, 1);
            const e = u * u * (3 - 2 * u);
            x = lerp(fileX(pc.f), fileX(pc.mv.f), e);
            y = lerp(rankY(pc.r), rankY(pc.mv.r), e);
            if (pc.type === 'knight') hop = Math.sin(u * Math.PI) * 18;
          } else {
            x = fileX(pc.f);
            y = rankY(pc.r);
          }
          if (y < -40 || y > H + 60) continue;
          items.push({ y, x, hop, pc });
          if (pc.mv && time < pc.mv.t && time > pc.mv.t - pc.mv.warn) items.push({ y: rankY(pc.mv.r), x: fileX(pc.mv.f), hop: 0, pc, ghost: true });
        }
        items.push({ y: KY, x: kx, king: true });
        items.sort((a, b) => a.y - b.y);
        for (const it of items) {
          if (it.king) {
            const tilt = clamp(kvx / KSPEED, -1, 1) * 0.08;
            const side = culprit && culprit.f > kf ? -1 : 1;
            const fall = easeOutCubic(fallen);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, goldGlow, kx, KY - 6, { size: 70, alpha: this.dead ? 0.3 : 0.55 + 0.1 * Math.sin(clock * 3) });
            g.globalCompositeOperation = 'source-over';
            g.save();
            g.translate(kx, KY + 12);
            g.rotate(tilt + side * fall * 1.45);
            g.drawImage(kingArt.canvas, -20, -65, 40, 70);
            g.restore();
            continue;
          }
          const { pc } = it;
          const spr = sprites[pc.type];
          const isCulprit = culprit && culprit.pc === pc;
          if (isCulprit) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, it.x, it.y - 4, { size: 74, alpha: 0.6 + 0.4 * pulse });
            g.globalCompositeOperation = 'source-over';
          }
          const sz = pc.type === 'pawn' || pc.type === 'ally' ? 29 : 33;
          const k = sz / 40;
          const dy = it.y + 12 - 30 * k - it.hop;
          if (it.ghost) {
            g.globalAlpha = 0.28 + 0.2 * pulse;
            g.drawImage(spr.canvas, it.x - sz / 2, dy - 35 * k, sz, 70 * k);
            g.globalAlpha = 1;
          } else g.drawImage(spr.canvas, it.x - sz / 2, dy - 35 * k, sz, 70 * k);
        }

        // the line that gave check
        if (culprit && culprit.kind === 'check') {
          g.strokeStyle = `rgba(255,70,95,${0.7 + 0.3 * pulse})`;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(fileX(culprit.f), rankY(culprit.r));
          g.lineTo(kx, KY);
          g.stroke();
        }

        fx.render(g);
        g.globalCompositeOperation = 'lighter';
        motes.render(g, true);
        drawSprite(g, lampGlow, W * 0.62, 40, { size: 300, alpha: 0.7 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, light, W / 2, H / 2);

        // file letters along the bottom
        g.fillStyle = 'rgba(24,14,8,0.82)';
        g.fillRect(0, H - 18, W, 18);
        g.fillStyle = 'rgba(255,220,150,0.5)';
        g.fillRect(0, H - 18, W, 1);
        g.font = `600 11px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let f = 0; f < FILES; f++) {
          g.fillStyle = f === kf ? '#ffd27a' : 'rgba(240,215,170,0.6)';
          g.fillText(LETTERS[f], fileX(f), H - 8.5);
        }

        if (this.dead) {
          const a = clamp(deadClock / 0.25, 0, 1);
          g.globalAlpha = a;
          g.font = `800 ${Math.round(34 + 8 * (1 - a))}px ${DISPLAY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = 'rgba(30,5,10,0.6)';
          g.fillText('CHECK!', kx < W / 2 ? kx + 72 : kx - 72, KY - 72 + 2);
          g.fillStyle = '#ff5a70';
          g.fillText('CHECK!', kx < W / 2 ? kx + 70 : kx - 70, KY - 72);
          g.globalAlpha = 1;
        }
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
