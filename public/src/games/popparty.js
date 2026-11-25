// Pop Party — a birthday party where every balloon you let go floats up and sticks under the
// ceiling. The kid walks left and right and lets go of the balloon in their hand on a steady
// beat; it rises straight up and joins the bottom of that column. Three or more of one colour
// touching pop (and anything that floats up into the gap can pop in a chain). The stacks grow
// down towards the floor: let a balloon go under a column that's already full and the party's
// over.
//
// Pressure over the minute: the kid lets go more and more often (every 1.15s → 0.5s), guests
// let go of their own balloons from 7s (each telegraphed under its column for about a second,
// with a ghost where it will stick), silver foil stars from 20s that never match (they only
// burst when a group pops next to them), and a fifth colour from 28s.
// Guests never fill a column to the line: only your own balloon can end the run.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, createMover, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const COLS = 6;
const CW = 52;
const GX = (360 - COLS * CW) / 2; // 24
const CEIL = 86; // underside of the ceiling
const RH = 45; // row height
const ROWS = 9; // a column may hold this many; one more and it's over
const LIMIT = CEIL + ROWS * RH; // the line the stacks must not cross (491)
const KID_Y = 592; // the kid's centre
const HOLD_Y = 528; // centre of the balloon in hand
const STAR = -1;

const colX = (c) => GX + CW * (c + 0.5);
const cellY = (r) => CEIL + RH * (r + 0.5);
const colOf = (x) => clamp(Math.round((x - GX) / CW - 0.5), 0, COLS - 1);

const PALETTE = [
  { name: 'red', base: '#ff3f57', light: '#ff9aa6', dark: '#a8122a', glow: 'rgba(255,80,100,0.8)' },
  { name: 'yellow', base: '#ffc928', light: '#fff1a6', dark: '#b07800', glow: 'rgba(255,210,60,0.8)' },
  { name: 'blue', base: '#2f9bff', light: '#a8dcff', dark: '#0a4aa8', glow: 'rgba(60,160,255,0.8)' },
  { name: 'green', base: '#35d06a', light: '#b4f5c8', dark: '#0d7a36', glow: 'rgba(70,220,120,0.8)' },
  { name: 'purple', base: '#b066ff', light: '#e0c4ff', dark: '#5a1ea8', glow: 'rgba(180,110,255,0.8)' },
];
const STAR_COL = { base: '#d8dde8', light: '#ffffff', dark: '#7a8296', glow: 'rgba(230,235,255,0.8)' };

// ---------- art ----------

function makeBalloon(p, k) {
  return makeSprite(46, 56, (g) => {
    // knot
    g.fillStyle = p.dark;
    g.beginPath();
    g.moveTo(0, 20);
    g.lineTo(-4, 26);
    g.lineTo(4, 26);
    g.closePath();
    g.fill();
    // body
    const body = g.createRadialGradient(-7, -10, 2, 0, -1, 26);
    body.addColorStop(0, p.light);
    body.addColorStop(0.35, p.base);
    body.addColorStop(1, p.dark);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, 21);
    g.bezierCurveTo(-14, 17, -21, 4, -21, -5);
    g.bezierCurveTo(-21, -17, -11, -24, 0, -24);
    g.bezierCurveTo(11, -24, 21, -17, 21, -5);
    g.bezierCurveTo(21, 4, 14, 17, 0, 21);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 1.1;
    g.stroke();
    // printed motif (also tells the colours apart without colour)
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.78)';
    g.strokeStyle = 'rgba(255,255,255,0.78)';
    if (k === 0) {
      // heart
      g.beginPath();
      g.moveTo(0, 7);
      g.bezierCurveTo(-11, -1, -8, -11, 0, -6);
      g.bezierCurveTo(8, -11, 11, -1, 0, 7);
      g.fill();
    } else if (k === 1) {
      // polka dots
      for (const [x, y, r] of [[-8, -8, 3], [6, -10, 2.4], [0, 2, 3.4], [-10, 6, 2.2], [11, 3, 2.6], [4, 13, 2]]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    } else if (k === 2) {
      // a wavy band
      g.lineWidth = 4;
      for (const dy of [-6, 4]) {
        g.beginPath();
        for (let x = -22; x <= 22; x += 2) {
          const y = dy + Math.sin(x * 0.35) * 2.4;
          if (x === -22) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    } else if (k === 3) {
      // diamond
      g.beginPath();
      g.moveTo(0, -11);
      g.lineTo(8, -1);
      g.lineTo(0, 9);
      g.lineTo(-8, -1);
      g.closePath();
      g.fill();
    } else if (k === 4) {
      // crescent moon
      g.beginPath();
      g.arc(0, -1, 9, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(5, -4, 8, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // repaint what destination-out ate from the body
      g.fillStyle = p.base;
      g.globalAlpha = 0.95;
      g.beginPath();
      g.arc(5, -4, 8, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.78)';
    }
    g.restore();
    // shine
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(-9, -12, 3.4, 6.5, 0.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.arc(-4, -19, 1.8, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(0, -3, 17, 0.2, 1.1);
    g.stroke();
  });
}

function makeStar() {
  return makeSprite(50, 56, (g) => {
    g.fillStyle = '#7a8296';
    g.beginPath();
    g.moveTo(0, 18);
    g.lineTo(-3, 26);
    g.lineTo(3, 26);
    g.closePath();
    g.fill();
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 10 : 23;
      pts.push([Math.cos(a) * r, Math.sin(a) * r - 1]);
    }
    const foil = g.createLinearGradient(-20, -22, 20, 20);
    foil.addColorStop(0, '#ffffff');
    foil.addColorStop(0.3, '#b9c1d4');
    foil.addColorStop(0.5, '#f4f6fb');
    foil.addColorStop(0.7, '#8d96ab');
    foil.addColorStop(1, '#e6eaf3');
    g.fillStyle = foil;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.strokeStyle = '#5d667a';
    g.lineWidth = 1.3;
    g.stroke();
    // crimped seam and facets
    g.strokeStyle = 'rgba(90,100,125,0.45)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 10; i += 2) {
      g.beginPath();
      g.moveTo(0, -1);
      g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-6, -9, 2.4, 5, 0.6, 0, TAU);
    g.fill();
  });
}

function makeKid() {
  return makeSprite(48, 80, (g) => {
    // legs drawn per frame; this is the body, arm down on the left, head and hat
    // shorts
    g.fillStyle = '#2a3e7a';
    g.beginPath();
    g.roundRect(-10, 12, 20, 10, 3);
    g.fill();
    // t-shirt with stripes
    const shirt = g.createLinearGradient(-12, 0, 12, 0);
    shirt.addColorStop(0, '#e8e2d4');
    shirt.addColorStop(0.4, '#ffffff');
    shirt.addColorStop(1, '#d6cfbf');
    g.fillStyle = shirt;
    g.beginPath();
    g.moveTo(-12, -6);
    g.quadraticCurveTo(-12, -10, -7, -10);
    g.lineTo(7, -10);
    g.quadraticCurveTo(12, -10, 12, -6);
    g.lineTo(11, 14);
    g.lineTo(-11, 14);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#ff7a3d';
    for (let y = -6; y < 14; y += 6) g.fillRect(-13, y, 26, 2.6);
    g.restore();
    g.strokeStyle = 'rgba(60,40,30,0.5)';
    g.lineWidth = 1;
    g.stroke();
    // left arm, down
    g.fillStyle = '#f2c094';
    g.beginPath();
    g.roundRect(-15.5, -7, 5, 16, 2.5);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-16, -9, 6, 6, 2);
    g.fill();
    // neck and head
    g.fillStyle = '#e3ad80';
    g.fillRect(-3, -13, 6, 4);
    const skin = g.createRadialGradient(-3, -23, 2, 0, -20, 12);
    skin.addColorStop(0, '#ffdcb8');
    skin.addColorStop(1, '#e8a878');
    g.fillStyle = skin;
    g.beginPath();
    g.arc(0, -21, 10, 0, TAU);
    g.fill();
    // hair
    g.fillStyle = '#4a2a14';
    g.beginPath();
    g.arc(0, -23, 10.4, Math.PI * 1.02, Math.PI * 1.98);
    g.quadraticCurveTo(6, -24, 0, -25);
    g.quadraticCurveTo(-6, -24, -10.2, -22);
    g.fill();
    // face: eyes looking up at the balloon, rosy cheeks, smile
    g.fillStyle = '#2a1608';
    g.beginPath();
    g.ellipse(-3.6, -22, 1.3, 1.7, 0, 0, TAU);
    g.ellipse(3.6, -22, 1.3, 1.7, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(-3.2, -22.8, 0.5, 0, TAU);
    g.arc(4, -22.8, 0.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,110,110,0.45)';
    g.beginPath();
    g.ellipse(-6.5, -17.5, 2.4, 1.5, 0, 0, TAU);
    g.ellipse(6.5, -17.5, 2.4, 1.5, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#8a3a20';
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(0, -17.5, 3, 0.2, Math.PI - 0.2);
    g.stroke();
    // party hat
    const hat = g.createLinearGradient(-7, 0, 7, 0);
    hat.addColorStop(0, '#1fa89a');
    hat.addColorStop(0.5, '#4ff0d8');
    hat.addColorStop(1, '#138074');
    g.fillStyle = hat;
    g.beginPath();
    g.moveTo(-7.5, -30);
    g.lineTo(1.5, -48);
    g.lineTo(8, -29);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2;
    for (let y = -46; y < -28; y += 5) {
      g.beginPath();
      g.moveTo(-10, y + 4);
      g.lineTo(10, y - 2);
      g.stroke();
    }
    g.restore();
    g.fillStyle = '#ff4d8b';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      g.beginPath();
      g.arc(1.5 + Math.cos(a) * 2.4, -48.5 + Math.sin(a) * 2.4, 1.8, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-7, -28);
    g.quadraticCurveTo(-4, -16, -9, -10);
    g.stroke();
  });
}

function paintScene(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // wallpaper
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#1d1240');
    wall.addColorStop(0.55, '#2b1a5c');
    wall.addColorStop(1, '#3a2266');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    // stripes with little gold diamonds
    for (let x = 0; x < W; x += 26) {
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(x, 0, 13, H);
      g.fillStyle = 'rgba(255,210,120,0.08)';
      g.fillRect(x + 12.5, 0, 1, H);
      for (let y = 100 + ((x / 26) % 2) * 20; y < 560; y += 40) {
        g.fillStyle = 'rgba(255,210,120,0.11)';
        g.beginPath();
        g.moveTo(x + 13, y - 4);
        g.lineTo(x + 16, y);
        g.lineTo(x + 13, y + 4);
        g.lineTo(x + 10, y);
        g.closePath();
        g.fill();
      }
    }
    // a window with a night sky on each side
    for (const wx of [4, 290]) {
      const wy = 270;
      const sky = g.createLinearGradient(0, wy, 0, wy + 150);
      sky.addColorStop(0, '#08102a');
      sky.addColorStop(1, '#1b2a5a');
      g.fillStyle = sky;
      g.fillRect(wx, wy, 66, 150);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 9; i++) g.fillRect(wx + rng.range(4, 62), wy + rng.range(4, 90), 1.2, 1.2);
      // rooftops and lit windows outside
      g.fillStyle = '#0b0f22';
      g.fillRect(wx, wy + 110, 66, 40);
      g.fillRect(wx + 8, wy + 96, 20, 20);
      g.fillRect(wx + 40, wy + 102, 18, 10);
      g.fillStyle = 'rgba(255,200,110,0.8)';
      for (let i = 0; i < 6; i++) g.fillRect(wx + rng.range(4, 60), wy + rng.range(114, 140), 3, 4);
      g.strokeStyle = '#f2e6d0';
      g.lineWidth = 4;
      g.strokeRect(wx, wy, 66, 150);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(wx + 33, wy);
      g.lineTo(wx + 33, wy + 150);
      g.moveTo(wx, wy + 75);
      g.lineTo(wx + 66, wy + 75);
      g.stroke();
      // curtains
      g.fillStyle = '#c2304e';
      for (const side of [-1, 1]) {
        const cx = side < 0 ? wx - 2 : wx + 68;
        g.beginPath();
        g.moveTo(cx - 9, wy - 8);
        g.lineTo(cx + 9, wy - 8);
        g.quadraticCurveTo(cx + side * -4, wy + 80, cx + 10, wy + 160);
        g.lineTo(cx - 10, wy + 160);
        g.quadraticCurveTo(cx + side * 4, wy + 80, cx - 9, wy - 8);
        g.fill();
      }
    }
    // the ceiling
    const ceil = g.createLinearGradient(0, 0, 0, CEIL);
    ceil.addColorStop(0, '#120a2a');
    ceil.addColorStop(0.7, '#2a1c4e');
    ceil.addColorStop(1, '#3d2a6a');
    g.fillStyle = ceil;
    g.fillRect(0, 0, W, CEIL);
    // crown moulding
    g.fillStyle = '#f2e6d0';
    g.fillRect(0, CEIL - 6, W, 4);
    g.fillStyle = '#c9b89a';
    g.fillRect(0, CEIL - 2, W, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, CEIL, W, 5);
    // "HAPPY BIRTHDAY" letters hung on a string under the ceiling, behind the balloons
    const word = 'HAPPY BIRTHDAY';
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, CEIL + 4);
    g.quadraticCurveTo(W / 2, CEIL + 26, W, CEIL + 4);
    g.stroke();
    const cols = ['#ff3f57', '#ffc928', '#2f9bff', '#35d06a', '#b066ff', '#ff7a3d'];
    g.font = `900 13px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < word.length; i++) {
      if (word[i] === ' ') continue;
      const x = 30 + (i * (W - 60)) / (word.length - 1);
      const u = x / W;
      const y = CEIL + 4 + 4 * u * (1 - u) * 22 + 10;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.moveTo(x - 9, y - 9);
      g.lineTo(x + 9, y - 9);
      g.lineTo(x, y + 12);
      g.closePath();
      g.fill();
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.55;
      g.beginPath();
      g.moveTo(x - 9, y - 10);
      g.lineTo(x + 9, y - 10);
      g.lineTo(x, y + 11);
      g.closePath();
      g.fill();
      g.globalAlpha = 0.6;
      g.fillStyle = '#ffffff';
      g.fillText(word[i], x, y - 3);
      g.globalAlpha = 1;
    }
    // skirting board and the floor
    const floorY = 548;
    g.fillStyle = '#f2e6d0';
    g.fillRect(0, floorY - 8, W, 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, floorY - 1, W, 2);
    const floor = g.createLinearGradient(0, floorY, 0, H);
    floor.addColorStop(0, '#6a3a22');
    floor.addColorStop(1, '#3e2012');
    g.fillStyle = floor;
    g.fillRect(0, floorY, W, H - floorY);
    for (let y = floorY; y < H; y += 12) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, y, W, 1);
      let x = rng.range(-60, 0);
      while (x < W) {
        g.fillStyle = `rgba(${rng.chance(0.5) ? '255,200,150' : '0,0,0'},${rng.range(0.03, 0.08).toFixed(3)})`;
        const len = rng.range(50, 90);
        g.fillRect(x, y + 1, len, 11);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y, 1, 12);
        x += len;
      }
    }
    // a round rug under the kid
    const rug = g.createRadialGradient(W / 2, 615, 10, W / 2, 615, 170);
    rug.addColorStop(0, 'rgba(255,90,140,0.35)');
    rug.addColorStop(0.7, 'rgba(255,90,140,0.22)');
    rug.addColorStop(1, 'rgba(255,90,140,0)');
    g.fillStyle = rug;
    g.beginPath();
    g.ellipse(W / 2, 615, 175, 38, 0, 0, TAU);
    g.fill();
    // presents in the corners
    const present = (x, y, w, h, c1, c2) => {
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, c1);
      gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(x + w / 2 - 2, y, 4, h);
      g.fillRect(x, y + h / 2 - 2, w, 4);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(x + w / 2 - 5, y - 3, 5, 3, -0.4, 0, TAU);
      g.ellipse(x + w / 2 + 5, y - 3, 5, 3, 0.4, 0, TAU);
      g.stroke();
    };
    present(4, 600, 30, 26, '#2f9bff', '#1a4fa8');
    present(26, 618, 24, 20, '#ffc928', '#c08a00');
    present(322, 596, 32, 30, '#35d06a', '#137a3a');
    present(306, 618, 22, 20, '#ff3f57', '#a8122a');
  });
}

// ---------- music: big-room party electro house, 132 BPM, B major over B–F♯–G♯m–E ----------

const music = {
  cps: 132 / 240, // one 4/4 bar per cycle: 33 bars = 60s
  setup: `
    const kick = note("e2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
    const kick2 = note("e2 e2 e2 [e2 e2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1200).lpf(6000).gain(0.15).room(0.25)
    const ohat = s("[~ white]*4").decay(0.06).sustain(0).hpf(7000).gain(0.045)
    const hat16 = s("white*16").decay(0.02).sustain(0).hpf(7200).gain("[0.01 0.025 0.015 0.03]*4")
    const roll = s("<~ ~ ~ [pink*8 pink*16]>").decay(0.05).sustain(0).hpf(1400).lpf(6000).gain(saw.range(0.02, 0.1))
    const sub = note("<b2 fs2 gs2 e2>").s("sine").attack(0.01).decay(0.3).sustain(0.5).release(0.1).gain(0.22)
    const bass = note("<b2 fs2 gs2 e2>").struct("[~ x]*4").s("sawtooth").attack(0.004).decay(0.12).sustain(0.3).release(0.05)
      .lpf(saw.range(400, 1700).slow(33)).lpq(4).gain(0.3)
    const chords = "<[ds4,fs4,b4] [cs4,fs4,as4] [ds4,gs4,b4] [e4,gs4,b4]>"
    const stabs = note(chords).struct("[~ x ~ ~] [x ~ ~ x] [~ ~ x ~] [~ x ~ ~]").s("sawtooth").attack(0.005).decay(0.14).sustain(0.1).release(0.05)
      .lpf(saw.range(900, 2600).slow(33)).gain(0.07).room(0.3)
    const pad = note(chords).s("sawtooth").attack(0.35).release(0.7).lpf(1100).gain(0.04).room(0.5)
    const arp = note("<[b4 ds5 fs5 ds5]*4 [as4 cs5 fs5 cs5]*4 [b4 ds5 gs5 ds5]*4 [b4 e5 gs5 e5]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3800).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
    const tune = "<[fs4 ~ ds4 fs4 ~ b4 ~ as4 gs4 ~ fs4 ~ ds4 ~ ~ ~] [fs4 ~ cs4 fs4 ~ as4 ~ gs4 fs4 ~ e4 ~ cs4 ~ ~ ~] [gs4 ~ ds4 gs4 ~ b4 ~ as4 gs4 ~ fs4 ~ ds4 ~ ~ ~] [e4 ~ gs4 b4 ~ cs5 ~ b4 gs4 ~ fs4 ~ ds4 ~ e4 fs4]>"
    const lead = note(tune).add(note(12)).s("square").attack(0.01).decay(0.15).sustain(0.45).release(0.1).lpf(2400).vib(5).vibmod(0.08)
      .gain(0.06).delay(0.22).delaytime(0.3409).delayfeedback(0.3).pan(0.56)
    const leadLow = note(tune).s("sawtooth").attack(0.015).decay(0.2).sustain(0.5).release(0.1).lpf(1500).gain(0.05).pan(0.44)
    const horn = note("<[b4,ds5] [as4,cs5] [b4,ds5] [b4,e5]>").struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ x ~ ~ ~").s("sawtooth").attack(0.02).decay(0.2).sustain(0.2).release(0.1)
      .lpf(2000).gain(0.045)
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, clap, ohat, sub, bass, stabs)],
    [8, stack(kick, clap, ohat, hat16, sub, bass, stabs, pad, arp)],
    [8, stack(kick, clap, ohat, hat16, roll, sub, bass, stabs, pad, arp, lead)],
    [9, stack(kick2, clap, ohat, hat16, roll, sub, bass, stabs, pad, arp, lead, leadLow, horn, wash)]
  )`,
};

export default {
  id: 'popparty',
  title: 'Pop Party',
  emoji: '🎉',
  tagline: 'Match balloons in threes to pop them. Don’t let any column overflow.',
  colors: { bg: '#1d1240', fg: '#ffffff', accent: '#ff4d8b' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- art ----
    const scene = paintScene(W, H, art);
    const sprites = PALETTE.map((p, k) => makeBalloon(p, k));
    const starSpr = makeStar();
    const kidSpr = makeKid();
    const glows = PALETTE.map((p) => glowSprite(p.glow, 34));
    const glowStar = glowSprite(STAR_COL.glow, 34);
    const glowWarm = glowSprite('rgba(255,200,120,0.9)', 14);
    const glowRed = glowSprite('rgba(255,50,70,0.9)', 40);
    const spotCols = ['rgba(255,80,160,0.5)', 'rgba(80,200,255,0.5)', 'rgba(255,210,80,0.5)'].map((c) => glowSprite(c, 90));
    const vignette = vignetteSprite(W, H, 0.55, '10,4,30');
    const sprOf = (k) => (k === STAR ? starSpr : sprites[k]);
    const colOfK = (k) => (k === STAR ? STAR_COL : PALETTE[k]);
    const glowOf = (k) => (k === STAR ? glowStar : glows[k]);

    const fx = createParticles();
    const sparks = createParticles();
    const pops = []; // expanding rings
    const texts = [];
    const drift = [];
    for (let i = 0; i < 26; i++) drift.push({ x: Math.random() * W, y: Math.random() * H, vy: 8 + Math.random() * 14, s: 2 + Math.random() * 2.5, r: Math.random() * TAU, c: ['#ff4d8b', '#ffd23f', '#4ff0d8', '#ffffff', '#b066ff'][i % 5] });
    const bulbs = [];
    for (let i = 0; i < 13; i++) {
      const x = 10 + i * 28;
      const u = x / W;
      bulbs.push({ x, y: 10 + 4 * u * (1 - u) * 26 + 22, c: i % 3 });
    }

    // ---- state ----
    const mover = createMover({ x: colX(2) + CW / 2, minX: colX(0) - 8, maxX: colX(COLS - 1) + 8, speed: 330, accel: 24 });
    const grid = Array.from({ length: COLS }, () => []);
    const rising = [];
    const guests = [];
    const colourCount = (t) => (t < 24 ? 4 : 5);
    const drawColour = (t) => Math.floor(plan.next() * colourCount(t));

    // the starting balloons: two or three per column, no group of three already touching
    for (let c = 0; c < COLS; c++) {
      const h = plan.int(2, 3);
      for (let r = 0; r < h; r++) grid[c].push({ k: 0, y: cellY(r), ph: plan.next() * TAU, pulse: 0 });
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < grid[c].length; r++) {
        for (let tries = 0; tries < 12; tries++) {
          grid[c][r].k = Math.floor(plan.next() * 4);
          if (groupAt(c, r).length < 3) break;
        }
      }
    }

    let hand = drawColour(0);
    let next = drawColour(0);
    let lastRelease = 0;
    let nextRelease = 1.15;
    let nextGuest = 7;
    let push = null; // the next row coming in under the ceiling
    let nextPushAt = 15;
    let pushShow = 0;
    let popped = 0;
    let chainShow = 0;
    let walk = 0;
    let deadCol = -1;
    let flash = 0;
    let shake = 0;
    let handBob = 0;
    let clock = 0;

    function groupAt(c, r) {
      const k = grid[c][r].k;
      if (k === STAR) return [];
      const seen = new Set();
      const out = [];
      const stack = [[c, r]];
      while (stack.length) {
        const [x, y] = stack.pop();
        const key = x * 32 + y;
        if (seen.has(key)) continue;
        seen.add(key);
        if (x < 0 || x >= COLS || y < 0 || y >= grid[x].length || grid[x][y].k !== k) continue;
        out.push([x, y]);
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      return out;
    }

    const burst = (b, x, y, big) => {
      const p = colOfK(b.k);
      fx.burst(x, y, { count: big ? 16 : 10, speed: 220, life: 0.7, size: 4, colors: [p.base, p.light, p.dark], gravity: 300, drag: 1.5 });
      sparks.burst(x, y, { count: 10, speed: 260, life: 0.9, size: 3.5, colors: ['#ff4d8b', '#ffd23f', '#4ff0d8', '#ffffff', '#b066ff'], gravity: 160, drag: 2 });
      pops.push({ x, y, r: 6, life: 0.3, c: p.light });
    };

    // pop every group of 3+, and stars beside them; let the rest float up; repeat for chains
    const resolve = () => {
      let chain = 0;
      for (;;) {
        const kill = new Set();
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < grid[c].length; r++) {
            if (kill.has(c * 32 + r)) continue;
            const grp = groupAt(c, r);
            if (grp.length >= 3) for (const [x, y] of grp) kill.add(x * 32 + y);
          }
        }
        if (!kill.size) break;
        chain++;
        const stars = [];
        for (const key of kill) {
          const c = key >> 5;
          const r = key & 31;
          for (const [x, y] of [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]) {
            if (x >= 0 && x < COLS && y >= 0 && y < grid[x].length && grid[x][y].k === STAR) stars.push(x * 32 + y);
          }
        }
        for (const s of stars) kill.add(s);
        let sx = 0;
        let sy = 0;
        for (const key of kill) {
          const c = key >> 5;
          const r = key & 31;
          const b = grid[c][r];
          burst(b, colX(c), b.y, chain > 1);
          sx += colX(c);
          sy += b.y;
          b.dead = true;
        }
        popped += kill.size;
        if (chain > 1) texts.push({ x: sx / kill.size, y: sy / kill.size, text: `CHAIN ×${chain}`, life: 1.1, c: '#ffd23f' });
        else if (kill.size >= 5) texts.push({ x: sx / kill.size, y: sy / kill.size, text: `${kill.size} POP!`, life: 0.9, c: '#ffffff' });
        for (let c = 0; c < COLS; c++) grid[c] = grid[c].filter((b) => !b.dead);
      }
      if (chain > 1) chainShow = 0.6;
      return chain;
    };

    const landingRow = (c) => grid[c].length + rising.filter((b) => b.c === c).length;

    // would this colour pop if it joined column c right now?
    const wouldPop = (c, k) => {
      if (k === STAR) return null;
      const r = grid[c].length;
      grid[c].push({ k, y: 0 });
      const grp = groupAt(c, r);
      grid[c].pop();
      return grp.length >= 3 ? grp.filter(([x, y]) => !(x === c && y === r)) : null;
    };

    const release = () => {
      const c = colOf(mover.x);
      rising.push({ c, k: hand, x: mover.x + 12, y: HOLD_Y, vy: 0, guest: false, ph: Math.random() * TAU });
      hand = next;
      next = drawColour(clock);
      handBob = 1;
    };

    const attach = (b) => {
      const col = grid[b.c];
      if (b.guest && col.length >= ROWS - 1) {
        // no room for a guest's balloon: it bumps into the stack and bursts
        burst(b, colX(b.c), b.y, false);
        return;
      }
      col.push({ k: b.k, y: b.y, ph: b.ph, pulse: 1 });
      resolve();
      if (col.length > ROWS && !this_.dead) {
        this_.dead = true;
        this_.deathReason = 'That column was full: the balloons piled down to the floor.';
        deadCol = b.c;
        flash = 1;
        shake = 1;
      }
    };

    const scheduleGuest = (t) => {
      const p = progress(t, 60, 1.1);
      const r1 = plan.next();
      const r2 = plan.next();
      const r3 = plan.next();
      const r4 = plan.next();
      const lead = lerp(1.25, 0.85, p);
      const k = t > 20 && r2 < lerp(0.25, 0.45, p) ? STAR : Math.floor(r3 * colourCount(t));
      // never into a column that is (or will be) close to the line
      const ok = [];
      for (let c = 0; c < COLS; c++) {
        const pending = guests.filter((q) => q.c === c).length;
        if (landingRow(c) + pending <= ROWS - 3) ok.push(c);
      }
      if (ok.length) guests.push({ c: ok[Math.floor(r1 * ok.length)], k, t0: t, t1: t + lead, ph: r4 * TAU });
      nextGuest = t + lerp(3.8, 1.0, p) * lerp(0.8, 1.2, r4);
    };

    // a new row of balloons is tied on under the ceiling, pushing every column down one
    const schedulePush = (t) => {
      const p = progress(t, 60, 1.1);
      const ks = [];
      for (let c = 0; c < COLS; c++) ks.push(Math.floor(plan.next() * colourCount(t)));
      push = { t0: t, t1: t + 2.6, ks };
      nextPushAt = push.t1 + lerp(10, 5, p);
    };
    const doPush = () => {
      for (let c = 0; c < COLS; c++) grid[c].unshift({ k: push.ks[c], y: CEIL - 30, ph: Math.random() * TAU, pulse: 1 });
      for (const b of rising) b.y = Math.max(b.y, cellY(1));
      push = null;
      pushShow = 1;
      resolve();
      for (let c = 0; c < COLS; c++) {
        if (grid[c].length > ROWS) {
          this_.dead = true;
          this_.deathReason = 'A new row came in and a full column overflowed.';
          deadCol = c;
          flash = 1;
          return;
        }
      }
    };

    const this_ = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock = t;
        mover.update(dt, dir);
        walk += Math.abs(mover.vx) * dt * 0.09;
        handBob = Math.max(0, handBob - dt * 4);
        chainShow = Math.max(0, chainShow - dt);
        flash = Math.max(0, flash - dt * 1.5);
        shake = Math.max(0, shake - dt * 2);

        if (t >= nextRelease) {
          lastRelease = nextRelease;
          release();
          nextRelease += lerp(1.1, 0.4, progress(t, 60, 1.2));
        }
        if (t >= nextGuest) scheduleGuest(t);
        pushShow = Math.max(0, pushShow - dt * 2);
        if (!push && t >= nextPushAt - 2.6) schedulePush(t);
        if (push && t >= push.t1) {
          doPush();
          if (this_.dead) return;
        }
        for (let i = guests.length - 1; i >= 0; i--) {
          const q = guests[i];
          if (t >= q.t1) {
            guests.splice(i, 1);
            rising.push({ c: q.c, k: q.k, x: colX(q.c), y: H + 30, vy: 0, guest: true, ph: q.ph });
          }
        }

        // rising balloons: shoot up, ease into their column, stick under the stack
        for (let i = 0; i < rising.length; i++) {
          const b = rising[i];
          b.vy = Math.min(b.vy + 5200 * dt, b.guest ? 1250 : 1500);
          b.y -= b.vy * dt;
          b.x += (colX(b.c) - b.x) * Math.min(1, 16 * dt);
          const ahead = rising.filter((o, j) => j < i && o.c === b.c).length;
          const target = cellY(grid[b.c].length + ahead);
          if (b.y <= target && ahead === 0) {
            b.y = target;
            rising.splice(i, 1);
            i--;
            attach(b);
            if (this_.dead) return;
          } else if (b.y < target) {
            b.y = target;
          }
        }

        // the stacks settle (balloons float up into gaps)
        for (let c = 0; c < COLS; c++) {
          const col = grid[c];
          for (let r = 0; r < col.length; r++) {
            const b = col[r];
            b.y += (cellY(r) - b.y) * Math.min(1, 12 * dt);
            b.pulse = Math.max(0, (b.pulse || 0) - dt * 3);
          }
        }
      },

      afterlife(dt) {
        flash = Math.max(0, flash - dt * 1.2);
        shake = Math.max(0, shake - dt * 2);
        fx.update(dt);
        sparks.update(dt);
        for (const p of pops) p.life -= dt;
        for (const tx of texts) tx.life -= dt;
        for (let c = 0; c < COLS; c++) for (const b of grid[c]) b.y += (Math.min(cellY(grid[c].indexOf(b)), LIMIT + 60) - b.y) * Math.min(1, 6 * dt);
      },

      render(g, t) {
        const dt = 1 / 60;
        if (!this_.dead) {
          fx.update(dt);
          sparks.update(dt);
        }
        const now = t;

        drawSprite(g, scene, W / 2, H / 2);

        // sweeping party lights on the wall
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const a = now * (0.5 + i * 0.17) + i * 2.1;
          drawSprite(g, spotCols[i], W / 2 + Math.sin(a) * 150, 300 + Math.cos(a * 0.8) * 140, { size: 220, alpha: 0.16 });
        }
        // string lights along the ceiling
        for (const bl of bulbs) {
          const tw = 0.55 + 0.45 * Math.sin(now * 3 + bl.x * 0.1);
          drawSprite(g, glowWarm, bl.x, bl.y, { size: 26 + tw * 8, alpha: 0.5 + tw * 0.4 });
        }
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(30,20,10,0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 32);
        for (const bl of bulbs) g.lineTo(bl.x, bl.y - 3);
        g.lineTo(W, 32);
        g.stroke();
        for (const bl of bulbs) {
          g.fillStyle = ['#ffe9a8', '#ffb3d0', '#b8f4ff'][bl.c];
          g.beginPath();
          g.ellipse(bl.x, bl.y, 2.4, 3.4, 0, 0, TAU);
          g.fill();
        }

        // confetti drifting in the air (cosmetic)
        for (const d of drift) {
          d.y += d.vy * dt;
          d.r += dt * 2;
          if (d.y > H) {
            d.y = -10;
            d.x = Math.random() * W;
          }
          g.fillStyle = d.c;
          g.globalAlpha = 0.35;
          g.save();
          g.translate(d.x + Math.sin(d.r) * 6, d.y);
          g.rotate(d.r);
          g.fillRect(-d.s / 2, -d.s / 4, d.s, d.s / 2);
          g.restore();
        }
        g.globalAlpha = 1;

        const kc = colOf(mover.x);

        // a soft beam up the column you're under
        const lane = g.createLinearGradient(0, LIMIT + 40, 0, CEIL);
        lane.addColorStop(0, 'rgba(255,255,255,0.10)');
        lane.addColorStop(1, 'rgba(255,255,255,0.02)');
        g.fillStyle = lane;
        g.fillRect(colX(kc) - CW / 2 + 2, CEIL, CW - 4, LIMIT - CEIL + 40);

        // the line the balloons must not cross
        g.strokeStyle = 'rgba(255,90,120,0.55)';
        g.lineWidth = 2;
        g.setLineDash([7, 6]);
        g.lineDashOffset = -now * 12;
        g.beginPath();
        g.moveTo(GX, LIMIT);
        g.lineTo(GX + COLS * CW, LIMIT);
        g.stroke();
        g.setLineDash([]);

        // column warnings
        for (let c = 0; c < COLS; c++) {
          const h = grid[c].length;
          if (h >= ROWS - 1) {
            const full = h >= ROWS;
            const pulse = 0.5 + 0.5 * Math.sin(now * (full ? 12 : 6));
            g.fillStyle = full ? `rgba(255,40,70,${0.18 + pulse * 0.2})` : `rgba(255,170,40,${0.08 + pulse * 0.08})`;
            g.fillRect(colX(c) - CW / 2 + 2, CEIL, CW - 4, LIMIT - CEIL);
            if (full) {
              g.font = `900 12px ${BODY_FONT}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = '#ff4d6a';
              g.beginPath();
              g.roundRect(colX(c) - 19, LIMIT + 6, 38, 17, 8);
              g.fill();
              g.fillStyle = '#ffffff';
              g.fillText('FULL', colX(c), LIMIT + 15);
            }
          }
        }

        // strings, then balloons
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1;
        for (let c = 0; c < COLS; c++) {
          const col = grid[c];
          if (!col.length) continue;
          const b = col[col.length - 1];
          const x = colX(c) + Math.sin(now * 1.6 + b.ph) * 1.5;
          g.beginPath();
          g.moveTo(x, b.y + 24);
          for (let s = 1; s <= 6; s++) g.lineTo(x + Math.sin(now * 2.2 + b.ph + s * 1.1) * 3, b.y + 24 + s * 6);
          g.stroke();
        }
        for (let c = 0; c < COLS; c++) {
          const col = grid[c];
          for (let r = 0; r < col.length; r++) {
            const b = col[r];
            const x = colX(c) + Math.sin(now * 1.6 + b.ph) * 1.5;
            const sz = 46 * (1 + (b.pulse || 0) * 0.12);
            if (b.pulse > 0) {
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowOf(b.k), x, b.y, { size: 70, alpha: b.pulse * 0.7 });
              g.globalCompositeOperation = 'source-over';
            }
            drawSprite(g, sprOf(b.k), x, b.y + 4, { size: sz, rot: Math.sin(now * 1.3 + b.ph) * 0.04 });
          }
        }

        // a new row on its way in: it peeks down from the ceiling while a bar fills
        if (push) {
          const k = clamp((t - push.t0) / (push.t1 - push.t0), 0, 1);
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.beginPath();
          g.roundRect(GX, CEIL - 9, COLS * CW, 7, 3.5);
          g.fill();
          g.fillStyle = k > 0.7 ? `rgba(255,${120 + 80 * Math.sin(now * 16)},120,1)` : '#ff4d8b';
          g.beginPath();
          g.roundRect(GX, CEIL - 9, COLS * CW * k, 7, 3.5);
          g.fill();
          for (let c = 0; c < COLS; c++) {
            const y = CEIL - 34 + k * 12 + Math.sin(now * 3 + c) * 1.5;
            drawSprite(g, sprOf(push.ks[c]), colX(c), y, { size: 34, alpha: 0.9 });
          }
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.font = `800 10px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (let c = 0; c < COLS; c++) {
            if (grid[c].length >= ROWS) {
              g.fillStyle = '#ff4d6a';
              g.fillText('▼ FULL', colX(c), CEIL + 4 + Math.sin(now * 12) * 2);
            }
          }
        }
        if (pushShow > 0) {
          g.fillStyle = `rgba(255,255,255,${pushShow * 0.12})`;
          g.fillRect(GX, CEIL, COLS * CW, RH * 1.5);
        }

        // guests about to let go: a marker under the column and a ghost where it will stick
        for (const q of guests) {
          const k = clamp((t - q.t0) / (q.t1 - q.t0), 0, 1);
          const x = colX(q.c);
          const lr = landingRow(q.c) + guests.filter((o) => o.c === q.c && o.t1 < q.t1).length;
          const ly = cellY(Math.min(lr, ROWS - 1));
          const fits = lr < ROWS - 1; // otherwise it just bursts against the stack
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.lineWidth = 1.5;
          g.setLineDash([3, 6]);
          g.beginPath();
          g.moveTo(x, H - 30);
          g.lineTo(x, ly + 26);
          g.stroke();
          g.setLineDash([]);
          if (fits) drawSprite(g, sprOf(q.k), x, ly + 4, { size: 46, alpha: 0.28 + 0.15 * Math.sin(now * 10) });
          // the balloon peeking up from the bottom edge
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowOf(q.k), x, H - 14, { size: 60, alpha: 0.5 + k * 0.4 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, sprOf(q.k), x, H + 14 - k * 22, { size: 40 });
          g.strokeStyle = '#ffffff';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, H - 44, 11, -Math.PI / 2, -Math.PI / 2 + TAU * k);
          g.stroke();
          g.fillStyle = '#ffffff';
          g.font = `900 13px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('!', x, H - 43);
        }

        // where the balloon in hand will go
        if (!this_.dead) {
          const lr = landingRow(kc);
          const x = colX(kc);
          const grp = wouldPop(kc, hand);
          if (lr >= ROWS) {
            g.strokeStyle = '#ff4d6a';
            g.lineWidth = 3;
            const y = LIMIT + 24;
            g.beginPath();
            g.moveTo(x - 9, y - 9);
            g.lineTo(x + 9, y + 9);
            g.moveTo(x + 9, y - 9);
            g.lineTo(x - 9, y + 9);
            g.stroke();
          } else {
            const ly = cellY(lr);
            g.strokeStyle = grp ? 'rgba(255,230,120,0.7)' : 'rgba(255,255,255,0.35)';
            g.lineWidth = 1.5;
            g.setLineDash([4, 5]);
            g.lineDashOffset = now * 20;
            g.beginPath();
            g.moveTo(x, HOLD_Y - 26);
            g.lineTo(x, ly + 24);
            g.stroke();
            g.setLineDash([]);
            drawSprite(g, sprOf(hand), x, ly + 4, { size: 46, alpha: 0.35 });
            g.strokeStyle = grp ? '#ffe680' : 'rgba(255,255,255,0.6)';
            g.lineWidth = 2;
            g.setLineDash([5, 4]);
            g.beginPath();
            g.ellipse(x, ly + 1, 23, 25, 0, 0, TAU);
            g.stroke();
            g.setLineDash([]);
            if (grp) {
              // light up the balloons it would pop with
              g.globalCompositeOperation = 'lighter';
              for (const [cx, cy] of grp) drawSprite(g, glowOf(hand), colX(cx), grid[cx][cy].y, { size: 64, alpha: 0.45 + 0.2 * Math.sin(now * 12) });
              g.globalCompositeOperation = 'source-over';
            }
          }
        }

        // rising balloons with their strings
        for (const b of rising) {
          g.strokeStyle = 'rgba(255,255,255,0.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(b.x, b.y + 24);
          g.quadraticCurveTo(b.x + 4, b.y + 40, b.x - 2, b.y + 60);
          g.stroke();
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowOf(b.k), b.x, b.y, { size: 60, alpha: 0.4 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, sprOf(b.k), b.x, b.y + 4, { size: 46 });
        }

        // the kid
        const kx = mover.x;
        const lean = mover.lean;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(kx, KID_Y + 34, 18, 5, 0, 0, TAU);
        g.fill();
        // legs
        const sw = Math.sin(walk) * Math.min(1, Math.abs(lean) * 1.5);
        g.fillStyle = '#f2c094';
        for (const s of [-1, 1]) {
          const lx = kx + s * 5 + sw * s * 3;
          g.fillRect(lx - 2.5, KID_Y + 21, 5, 9 - Math.abs(sw) * s * 1.5);
          g.fillStyle = '#ff4d8b';
          g.beginPath();
          g.roundRect(lx - 4.5, KID_Y + 29 - Math.max(0, sw * s) * 2, 9, 5, 2);
          g.fill();
          g.fillStyle = '#f2c094';
        }
        drawSprite(g, kidSpr, kx, KID_Y, { rot: lean * 0.08 });
        // raised arm holding the string
        const hx = kx + 13;
        const hy = KID_Y - 26 + handBob * 3;
        g.strokeStyle = '#f2c094';
        g.lineWidth = 4.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(kx + 10, KID_Y - 6);
        g.lineTo(hx, hy);
        g.stroke();
        g.lineCap = 'butt';
        // the next balloon, tied to the kid's waist
        const nx = kx - 22 - lean * 6;
        const ny = KID_Y - 40 + Math.sin(now * 2.4) * 2;
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(kx - 8, KID_Y + 10);
        g.quadraticCurveTo(nx + 4, ny + 30, nx, ny + 14);
        g.stroke();
        drawSprite(g, sprOf(next), nx, ny + 3, { size: 28, alpha: 0.95 });
        g.font = `800 9px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText('NEXT', nx, ny + 26);
        // the balloon in hand, appearing after each release
        const since = t - lastRelease;
        const grow = clamp(since / 0.18, 0, 1);
        const bx = kx + 12 - lean * 8;
        const by = HOLD_Y + (1 - grow) * 20 + Math.sin(now * 2) * 1.5;
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(hx, hy);
        g.quadraticCurveTo(bx + 3, by + 34, bx, by + 24);
        g.stroke();
        if (!this_.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowOf(hand), bx, by, { size: 62, alpha: 0.35 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, sprOf(hand), bx, by + 4, { size: 46 * (0.5 + 0.5 * grow), rot: -lean * 0.15 });
          // time until the kid lets go
          const span = Math.max(0.01, nextRelease - lastRelease);
          const k = clamp((t - lastRelease) / span, 0, 1);
          g.strokeStyle = 'rgba(0,0,0,0.35)';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(bx, by + 1, 28, 0, TAU);
          g.stroke();
          g.strokeStyle = k > 0.75 ? '#ffe680' : 'rgba(255,255,255,0.85)';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(bx, by + 1, 28, -Math.PI / 2, -Math.PI / 2 + TAU * k);
          g.stroke();
        }

        // pops and confetti
        g.lineWidth = 2;
        for (let i = pops.length - 1; i >= 0; i--) {
          const p = pops[i];
          if (!this_.dead) p.life -= dt;
          if (p.life <= 0) {
            pops.splice(i, 1);
            continue;
          }
          const k = 1 - p.life / 0.3;
          g.strokeStyle = p.c;
          g.globalAlpha = 1 - k;
          g.beginPath();
          g.arc(p.x, p.y, 6 + k * 26, 0, TAU);
          g.stroke();
          g.globalAlpha = 1;
        }
        fx.render(g);
        sparks.render(g, true);

        // chain and big-pop texts
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = texts.length - 1; i >= 0; i--) {
          const tx = texts[i];
          if (!this_.dead) tx.life -= dt;
          if (tx.life <= 0) {
            texts.splice(i, 1);
            continue;
          }
          g.globalAlpha = Math.min(1, tx.life * 3);
          g.font = `900 20px ${BODY_FONT}`;
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillText(tx.text, tx.x + 1.5, tx.y - (1.1 - tx.life) * 30 + 1.5);
          g.fillStyle = tx.c;
          g.fillText(tx.text, tx.x, tx.y - (1.1 - tx.life) * 30);
          g.globalAlpha = 1;
        }

        // balloons popped so far
        g.font = `800 13px ${BODY_FONT}`;
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText(`${popped} popped`, 10, 568);

        drawSprite(g, vignette, W / 2, H / 2);

        if (deadCol >= 0) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, colX(deadCol), LIMIT, { size: 160, alpha: 0.6 + 0.4 * Math.sin(now * 20) });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(255,40,70,${0.25 * flash})`;
          g.fillRect(0, 0, W, H);
        }
      },
    };
    return this_;
  },
};
