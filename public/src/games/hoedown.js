// Hay Scramble — musical chairs at a barn dance. A pig in a straw hat dances with a hen, a sheep,
// a cow and a goat while a scarecrow plays the fiddle. Every round the farmer up in the loft
// pushes hay bales to the edge (their shadows mark where they'll land), one bale fewer than
// dancers, and when the fiddle stops they drop and everyone scrambles for a seat. Each animal
// runs for the bale nearest to it (a coloured trail and its face under that bale show which), so
// you read the floor: take a bale nobody is going for, or beat a slow animal to its own. Whoever
// reaches a bale first sits on it; if you're left standing, you're out.
//
// Pressure over the minute: the bales come down sooner (2s of warning → about 1.1s), the animals
// get quicker off the mark and faster, a fourth dancer joins at 13s and a fifth at 30s, and later
// there's often no free bale at all, so you have to steal one. Every round is checked so that,
// from anywhere on the floor, some bale can be reached in time with a human reaction.
// The animals never react to you: they only ever do what their trails show.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, createMover, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const FEET = 576; // where everyone's feet touch the floor
const BALE_W = 48;
const BALE_H = 30;
const BALE_Y = FEET - BALE_H / 2 + 2; // a landed bale's centre
const LOFT_Y = 138; // a bale waiting on the loft edge
const ZONE = 20; // how close to a bale's centre counts as "at" it
const GAP = 54; // minimum distance between bale centres
const PLAYER_SPEED = 255;
const BOT_SPEED = 232; // what the fairness check assumes you can manage (acceleration included)
const BADGE_Y = 616;

const TYPES = {
  hen: { name: 'hen', speed: 205, delay: -0.03, legs: '#f0a020', legW: 2.2 },
  sheep: { name: 'sheep', speed: 150, delay: 0.02, legs: '#2a2420', legW: 3.4 },
  cow: { name: 'cow', speed: 118, delay: 0.06, legs: '#efe6dc', legW: 4.6 },
  goat: { name: 'goat', speed: 172, delay: 0, legs: '#6a5844', legW: 3 },
};
const ROSTER = [
  { type: 'hen', col: '#ff5a5a' },
  { type: 'sheep', col: '#46c4ff' },
  { type: 'cow', col: '#ffd23f' },
  { type: 'goat', col: '#c77dff' },
  { type: 'hen', col: '#4fe08a' },
];

const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// ---------- art ----------

function scarf(g, col, y) {
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(-10.5, y, 21, 5.5, 2.5);
  g.fill();
  g.beginPath();
  g.moveTo(4, y + 4);
  g.lineTo(10, y + 13);
  g.lineTo(5, y + 13.5);
  g.lineTo(1, y + 5);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(-9, y + 1, 18, 1.2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(-9, y + 4, 18, 1.2);
}

function eyes(g, x, y, r = 1.8, gap = 4.2) {
  g.fillStyle = '#1a1008';
  g.beginPath();
  g.ellipse(x - gap, y, r * 0.8, r, 0, 0, TAU);
  g.ellipse(x + gap, y, r * 0.8, r, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x - gap + 0.5, y - 0.7, r * 0.33, 0, TAU);
  g.arc(x + gap + 0.5, y - 0.7, r * 0.33, 0, TAU);
  g.fill();
}

// Each animal: front view, body bottom at `bottom` (legs are drawn per frame below it).
function makeAnimal(type, col) {
  const bottom = 24;
  const spr = makeSprite(48, 56, (g) => {
    if (type === 'hen') {
      // tail feathers
      g.fillStyle = '#e8e2d6';
      for (const [a, l] of [[-0.5, 13], [-0.15, 15], [0.2, 12]]) {
        g.save();
        g.translate(10, 8);
        g.rotate(a - 0.6);
        g.beginPath();
        g.ellipse(0, -l / 2, 3.4, l / 2, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      const body = g.createRadialGradient(-5, 4, 2, 0, 9, 18);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.7, '#f1ece2');
      body.addColorStop(1, '#c9bfae');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 10, 13, 14, 0, 0, TAU);
      g.fill();
      // wings
      g.fillStyle = '#ded6c6';
      g.beginPath();
      g.ellipse(-11, 11, 4.5, 8, 0.25, 0, TAU);
      g.ellipse(11, 11, 4.5, 8, -0.25, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(120,100,80,0.35)';
      g.lineWidth = 0.8;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 11, 7);
        g.quadraticCurveTo(s * 13, 12, s * 11, 17);
        g.stroke();
      }
      scarf(g, col, -2);
      // head
      const head = g.createRadialGradient(-3, -13, 1, 0, -10, 10);
      head.addColorStop(0, '#ffffff');
      head.addColorStop(1, '#ddd5c6');
      g.fillStyle = head;
      g.beginPath();
      g.arc(0, -10, 8.5, 0, TAU);
      g.fill();
      // comb
      g.fillStyle = '#e8283c';
      for (const [x, y, r] of [[-3.5, -18, 3], [0, -20, 3.4], [3.5, -18.5, 2.8]]) {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
      eyes(g, 0, -11, 1.7, 3.8);
      // beak and wattle
      g.fillStyle = '#ffae1a';
      g.beginPath();
      g.moveTo(-3, -7.5);
      g.lineTo(3, -7.5);
      g.lineTo(0, -3);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8283c';
      g.beginPath();
      g.ellipse(0, -1.5, 2, 3, 0, 0, TAU);
      g.fill();
    } else if (type === 'sheep') {
      const wool = (x, y, r) => {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        gr.addColorStop(0, '#fffaf0');
        gr.addColorStop(1, '#d8cdb8');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      };
      for (const [x, y, r] of [[-10, 14, 8], [10, 14, 8], [0, 17, 8], [-12, 4, 7], [12, 4, 7], [0, 8, 11], [-6, 0, 7], [6, 0, 7]]) wool(x, y, r);
      scarf(g, col, -2);
      // ears
      g.fillStyle = '#2e2620';
      g.beginPath();
      g.ellipse(-11, -10, 5, 2.4, -0.3, 0, TAU);
      g.ellipse(11, -10, 5, 2.4, 0.3, 0, TAU);
      g.fill();
      // face
      const face = g.createRadialGradient(-2, -11, 1, 0, -8, 11);
      face.addColorStop(0, '#5a4c42');
      face.addColorStop(1, '#2a221c');
      g.fillStyle = face;
      g.beginPath();
      g.ellipse(0, -8, 7.5, 10, 0, 0, TAU);
      g.fill();
      // wool tuft on top
      for (const [x, y, r] of [[-4, -18, 4.5], [0, -20, 5], [4, -18, 4.5]]) wool(x, y, r);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(-3.4, -9, 2.2, 2.4, 0, 0, TAU);
      g.ellipse(3.4, -9, 2.2, 2.4, 0, 0, TAU);
      g.fill();
      eyes(g, 0, -8.6, 1.4, 3.4);
      g.strokeStyle = '#120c08';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-2, -1.5);
      g.quadraticCurveTo(0, 0, 2, -1.5);
      g.stroke();
    } else if (type === 'cow') {
      const body = g.createRadialGradient(-5, 6, 2, 0, 11, 20);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(1, '#d8d0c8');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 11, 16, 13.5, 0, 0, TAU);
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#26201e';
      g.beginPath();
      g.ellipse(-10, 8, 7, 6, 0.4, 0, TAU);
      g.ellipse(9, 17, 8, 5, -0.3, 0, TAU);
      g.ellipse(14, 3, 4, 4, 0, 0, TAU);
      g.fill();
      g.restore();
      scarf(g, col, -1);
      // bell
      const bell = g.createLinearGradient(-4, 0, 4, 0);
      bell.addColorStop(0, '#b8860b');
      bell.addColorStop(0.5, '#ffe27a');
      bell.addColorStop(1, '#a87400');
      g.fillStyle = bell;
      g.beginPath();
      g.moveTo(-3.5, 4);
      g.lineTo(3.5, 4);
      g.lineTo(5, 11);
      g.lineTo(-5, 11);
      g.closePath();
      g.fill();
      // horns and ears
      g.fillStyle = '#f2e4c4';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 6, -17);
        g.quadraticCurveTo(s * 13, -19, s * 13, -25);
        g.quadraticCurveTo(s * 9, -20, s * 4, -19);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(-14, -12, 6, 3, -0.3, 0, TAU);
      g.ellipse(14, -12, 6, 3, 0.3, 0, TAU);
      g.fill();
      g.fillStyle = '#f4a6b8';
      g.beginPath();
      g.ellipse(-14, -12, 3.6, 1.5, -0.3, 0, TAU);
      g.ellipse(14, -12, 3.6, 1.5, 0.3, 0, TAU);
      g.fill();
      // head
      const head = g.createRadialGradient(-3, -12, 1, 0, -9, 12);
      head.addColorStop(0, '#ffffff');
      head.addColorStop(1, '#ddd6ce');
      g.fillStyle = head;
      g.beginPath();
      g.ellipse(0, -9, 10, 11, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#26201e';
      g.beginPath();
      g.ellipse(-5, -13, 4.5, 4, 0.3, 0, TAU);
      g.fill();
      eyes(g, 0, -11, 1.7, 4.4);
      // muzzle
      const mz = g.createLinearGradient(0, -5, 0, 2);
      mz.addColorStop(0, '#ffc2d0');
      mz.addColorStop(1, '#e88aa2');
      g.fillStyle = mz;
      g.beginPath();
      g.ellipse(0, -2.5, 8, 5, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#8a3a4c';
      g.beginPath();
      g.ellipse(-3, -2.5, 1.2, 1.6, 0, 0, TAU);
      g.ellipse(3, -2.5, 1.2, 1.6, 0, 0, TAU);
      g.fill();
    } else {
      // goat
      const body = g.createRadialGradient(-5, 6, 2, 0, 11, 18);
      body.addColorStop(0, '#f4ecdc');
      body.addColorStop(1, '#b8a68a');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 11, 13.5, 13.5, 0, 0, TAU);
      g.fill();
      scarf(g, col, -1);
      // horns sweeping back
      g.strokeStyle = '#5a5048';
      g.lineWidth = 3;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 3, -18);
        g.quadraticCurveTo(s * 9, -27, s * 13, -20);
        g.stroke();
      }
      g.lineCap = 'butt';
      // ears sticking out
      g.fillStyle = '#d8c8aa';
      g.beginPath();
      g.ellipse(-12, -11, 6, 2.6, 0.35, 0, TAU);
      g.ellipse(12, -11, 6, 2.6, -0.35, 0, TAU);
      g.fill();
      // long face
      const head = g.createRadialGradient(-2, -13, 1, 0, -8, 13);
      head.addColorStop(0, '#fbf5ea');
      head.addColorStop(1, '#cdbb9c');
      g.fillStyle = head;
      g.beginPath();
      g.ellipse(0, -8, 7.5, 12, 0, 0, TAU);
      g.fill();
      // eyes with sideways pupils
      for (const s of [-1, 1]) {
        g.fillStyle = '#f2c84a';
        g.beginPath();
        g.ellipse(s * 4, -11, 2.4, 2.1, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#1a1008';
        g.fillRect(s * 4 - 1.8, -11.6, 3.6, 1.2);
      }
      g.fillStyle = '#8a6e5a';
      g.beginPath();
      g.ellipse(-1.6, -1.5, 0.9, 1.3, 0, 0, TAU);
      g.ellipse(1.6, -1.5, 0.9, 1.3, 0, 0, TAU);
      g.fill();
      // beard
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(-3, 2);
      g.lineTo(3, 2);
      g.lineTo(0, 10);
      g.closePath();
      g.fill();
    }
  });
  return { spr, bottom };
}

function makePig() {
  const bottom = 26;
  const spr = makeSprite(52, 60, (g) => {
    // curly tail peeking out
    g.strokeStyle = '#e57c9c';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(16, 12, 3, Math.PI, Math.PI * 2.6);
    g.stroke();
    const body = g.createRadialGradient(-6, 6, 3, 0, 12, 21);
    body.addColorStop(0, '#ffd6e0');
    body.addColorStop(0.6, '#ffa3ba');
    body.addColorStop(1, '#de6c90');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 12, 15.5, 14, 0, 0, TAU);
    g.fill();
    // bandana
    g.fillStyle = '#d8203a';
    g.beginPath();
    g.moveTo(-11, 1);
    g.lineTo(11, 1);
    g.lineTo(0, 13);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y] of [[-6, 3], [0, 4], [6, 3], [-3, 7], [3, 7], [0, 10]]) {
      g.beginPath();
      g.arc(x, y, 0.9, 0, TAU);
      g.fill();
    }
    // ears
    g.fillStyle = '#f48aa8';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 6, -16);
      g.lineTo(s * 15, -20);
      g.lineTo(s * 13, -9);
      g.closePath();
      g.fill();
    }
    // head
    const head = g.createRadialGradient(-5, -11, 2, 0, -7, 15);
    head.addColorStop(0, '#ffdbe4');
    head.addColorStop(0.7, '#ffa8be');
    head.addColorStop(1, '#e8789a');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -7, 13.5, 12, 0, 0, TAU);
    g.fill();
    // cheeks
    g.fillStyle = 'rgba(255,90,130,0.4)';
    g.beginPath();
    g.ellipse(-9, -3, 2.8, 1.8, 0, 0, TAU);
    g.ellipse(9, -3, 2.8, 1.8, 0, 0, TAU);
    g.fill();
    eyes(g, 0, -9, 1.9, 5.2);
    // snout
    const sn = g.createLinearGradient(0, -6, 0, 2);
    sn.addColorStop(0, '#ffbccd');
    sn.addColorStop(1, '#f07896');
    g.fillStyle = sn;
    g.beginPath();
    g.ellipse(0, -2.5, 6.5, 4.6, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(160,40,80,0.5)';
    g.lineWidth = 0.8;
    g.stroke();
    g.fillStyle = '#a8345a';
    g.beginPath();
    g.ellipse(-2.3, -2.5, 1.1, 1.7, 0, 0, TAU);
    g.ellipse(2.3, -2.5, 1.1, 1.7, 0, 0, TAU);
    g.fill();
    // straw hat
    const straw = g.createLinearGradient(-20, 0, 20, 0);
    straw.addColorStop(0, '#c8902e');
    straw.addColorStop(0.45, '#ffd978');
    straw.addColorStop(1, '#b87c22');
    g.fillStyle = straw;
    g.beginPath();
    g.ellipse(0, -18, 20, 4.6, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(-10, -18);
    g.quadraticCurveTo(-10, -29, 0, -29);
    g.quadraticCurveTo(10, -29, 10, -18);
    g.closePath();
    g.fill();
    g.fillStyle = '#d8203a';
    g.fillRect(-10, -22, 20, 3.2);
    g.strokeStyle = 'rgba(120,70,10,0.45)';
    g.lineWidth = 0.6;
    for (let x = -17; x <= 17; x += 3) {
      g.beginPath();
      g.moveTo(x, -19.5);
      g.lineTo(x * 1.05, -16.5);
      g.stroke();
    }
  });
  return { spr, bottom };
}

function makeBale(rng) {
  return makeSprite(BALE_W + 4, BALE_H + 6, (g) => {
    const w = BALE_W;
    const h = BALE_H;
    const body = g.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, '#ffe08a');
    body.addColorStop(0.35, '#e8b84a');
    body.addColorStop(1, '#a8741e');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 5);
    g.fill();
    g.save();
    g.clip();
    // straw texture
    for (let i = 0; i < 120; i++) {
      const x = rng.range(-w / 2, w / 2);
      const y = rng.range(-h / 2, h / 2);
      const l = rng.range(3, 8);
      const a = rng.range(-0.5, 0.5);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,240,170,0.55)' : 'rgba(130,80,20,0.4)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    // top face lighter
    g.fillStyle = 'rgba(255,250,200,0.28)';
    g.fillRect(-w / 2, -h / 2, w, 6);
    g.restore();
    // twine
    for (const tx of [-w / 4, w / 4]) {
      g.fillStyle = '#7a4a1c';
      g.fillRect(tx - 1.6, -h / 2, 3.2, h);
      g.fillStyle = 'rgba(255,220,150,0.35)';
      g.fillRect(tx - 1.6, -h / 2, 1, h);
    }
    g.strokeStyle = 'rgba(90,50,10,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 5);
    g.stroke();
    // stray straws poking out
    g.strokeStyle = '#ffe08a';
    g.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) {
      const x = rng.range(-w / 2 + 2, w / 2 - 2);
      g.beginPath();
      g.moveTo(x, -h / 2 + 1);
      g.lineTo(x + rng.range(-3, 3), -h / 2 - rng.range(2, 4));
      g.stroke();
    }
  });
}

function makeFiddler() {
  return makeSprite(60, 96, (g) => {
    // straw legs and boots, on a little bale stack (drawn in the scene)
    g.fillStyle = '#3a4a7a';
    g.fillRect(-9, 18, 7, 22);
    g.fillRect(2, 18, 7, 22);
    g.fillStyle = '#2a1a10';
    g.fillRect(-11, 38, 10, 5);
    g.fillRect(1, 38, 10, 5);
    // plaid shirt
    g.fillStyle = '#b8322a';
    g.beginPath();
    g.moveTo(-13, -12);
    g.lineTo(13, -12);
    g.lineTo(11, 20);
    g.lineTo(-11, 20);
    g.closePath();
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = -14; x < 14; x += 6) g.fillRect(x, -14, 2, 36);
    for (let y = -12; y < 22; y += 6) g.fillRect(-14, y, 28, 2);
    g.fillStyle = 'rgba(255,220,120,0.25)';
    for (let x = -12; x < 14; x += 6) g.fillRect(x, -14, 0.8, 36);
    g.restore();
    // patch and rope belt
    g.fillStyle = '#3a6a3a';
    g.fillRect(3, 4, 6, 6);
    g.fillStyle = '#c8a050';
    g.fillRect(-12, 16, 24, 3);
    // straw sticking out
    g.strokeStyle = '#f2c860';
    g.lineWidth = 1;
    for (const [x, y, dx, dy] of [[-11, 20, -3, 4], [-8, 20, 0, 5], [9, 20, 3, 4], [-13, -10, -5, 2], [13, -10, 5, 2], [-2, -14, -1, -3], [2, -14, 2, -3]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
    }
    // sack head
    const head = g.createRadialGradient(-3, -24, 1, 0, -22, 12);
    head.addColorStop(0, '#e8d0a0');
    head.addColorStop(1, '#b8945a');
    g.fillStyle = head;
    g.beginPath();
    g.ellipse(0, -23, 10, 11, 0, 0, TAU);
    g.fill();
    // stitched face
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(-4, -25, 1.8, 0, TAU);
    g.arc(4, -25, 1.8, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, -21, 5, 0.3, Math.PI - 0.3);
    g.stroke();
    for (let i = -3; i <= 3; i += 2) {
      g.beginPath();
      g.moveTo(i, -17.5);
      g.lineTo(i, -15.5);
      g.stroke();
    }
    // floppy hat
    g.fillStyle = '#6a4a2a';
    g.beginPath();
    g.ellipse(0, -32, 16, 4, -0.08, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(-8, -32);
    g.quadraticCurveTo(-7, -44, 1, -43);
    g.quadraticCurveTo(9, -42, 8, -32);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8a050';
    g.fillRect(-8, -35, 16, 2.2);
    // fiddle under the chin (to the viewer's right)
    g.save();
    g.translate(9, -9);
    g.rotate(0.6);
    const wood = g.createLinearGradient(-5, 0, 5, 0);
    wood.addColorStop(0, '#7a2e0a');
    wood.addColorStop(0.5, '#d8761e');
    wood.addColorStop(1, '#6a2408');
    g.fillStyle = wood;
    g.beginPath();
    g.ellipse(0, 4, 5.5, 7, 0, 0, TAU);
    g.ellipse(0, -5, 4.5, 5.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#1a0c06';
    g.fillRect(-1, -16, 2, 16);
    g.fillRect(-1.6, -19, 3.2, 4);
    g.restore();
    // left arm holding the neck
    g.strokeStyle = '#b8322a';
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(10, -9);
    g.lineTo(20, -18);
    g.stroke();
    g.fillStyle = '#f2c860';
    g.beginPath();
    g.arc(20, -18.5, 2.4, 0, TAU);
    g.fill();
    g.lineCap = 'butt';
  });
}

function paintScene(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // back wall: dark red planks
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#2a0e0c');
    wall.addColorStop(0.5, '#4a1a14');
    wall.addColorStop(1, '#5a2418');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 18) {
      g.fillStyle = `rgba(${rng.chance(0.5) ? '255,150,110' : '0,0,0'},${rng.range(0.03, 0.09).toFixed(3)})`;
      g.fillRect(x, 0, 18, H);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, 0, 1.2, H);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = 'rgba(20,6,4,0.35)';
        g.beginPath();
        g.ellipse(x + rng.range(5, 13), rng.range(170, 540), 1.6, 3, 0, 0, TAU);
        g.fill();
      }
    }
    // roof rafters
    g.fillStyle = '#1a0806';
    g.fillRect(0, 0, W, 54);
    g.strokeStyle = '#3a1a0e';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-20, 60);
    g.lineTo(W / 2, -10);
    g.lineTo(W + 20, 60);
    g.stroke();
    g.lineWidth = 6;
    for (const x of [60, 180, 300]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 70);
      g.stroke();
    }
    // the hayloft: piled hay behind the loft edge
    const loftBack = g.createLinearGradient(0, 60, 0, 150);
    loftBack.addColorStop(0, '#24100a');
    loftBack.addColorStop(1, '#3a1e10');
    g.fillStyle = loftBack;
    g.fillRect(0, 60, W, 92);
    for (let i = 0; i < 9; i++) {
      const cx = rng.range(0, W);
      const hay = g.createRadialGradient(cx, 150, 4, cx, 150, 60);
      hay.addColorStop(0, '#7a5420');
      hay.addColorStop(1, '#3a200c');
      g.fillStyle = hay;
      g.beginPath();
      g.ellipse(cx, 152, rng.range(40, 70), rng.range(26, 46), 0, Math.PI, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,210,120,0.16)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 160; i++) {
      const x = rng.range(0, W);
      const y = rng.range(118, 152);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-5, 5), y - rng.range(2, 6));
      g.stroke();
    }
    // loft edge beam
    const beam = g.createLinearGradient(0, 152, 0, 168);
    beam.addColorStop(0, '#8a5228');
    beam.addColorStop(0.4, '#6a3a1a');
    beam.addColorStop(1, '#3a1e0c');
    g.fillStyle = beam;
    g.fillRect(0, 152, W, 16);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, 168, W, 6);
    for (let x = 14; x < W; x += 48) {
      g.fillStyle = '#2a1408';
      g.beginPath();
      g.arc(x, 160, 1.6, 0, TAU);
      g.fill();
    }
    // a sign over the doors
    g.fillStyle = '#e8d8b0';
    g.beginPath();
    g.roundRect(118, 196, 124, 26, 4);
    g.fill();
    g.strokeStyle = '#5a3418';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#8a2418';
    g.font = `900 15px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BARN DANCE', 180, 210);
    // open double doors: the night outside
    const dx0 = 112;
    const dx1 = 248;
    const dy0 = 238;
    const sky = g.createLinearGradient(0, dy0, 0, 540);
    sky.addColorStop(0, '#0a1430');
    sky.addColorStop(0.7, '#1e3060');
    sky.addColorStop(1, '#3a4a78');
    g.fillStyle = sky;
    g.fillRect(dx0, dy0, dx1 - dx0, 540 - dy0);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 22; i++) g.fillRect(dx0 + rng.range(2, 134), dy0 + rng.range(2, 160), 1.1, 1.1);
    // moon
    g.fillStyle = '#fff4d0';
    g.beginPath();
    g.arc(212, 286, 15, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(200,180,140,0.35)';
    g.beginPath();
    g.arc(207, 282, 3.5, 0, TAU);
    g.arc(218, 292, 2.5, 0, TAU);
    g.fill();
    // hills, field and fence
    g.fillStyle = '#16244a';
    g.beginPath();
    g.moveTo(dx0, 440);
    g.quadraticCurveTo(150, 400, 190, 430);
    g.quadraticCurveTo(220, 405, dx1, 425);
    g.lineTo(dx1, 540);
    g.lineTo(dx0, 540);
    g.fill();
    g.fillStyle = '#0e1a36';
    g.fillRect(dx0, 470, dx1 - dx0, 70);
    g.fillStyle = '#0a1228';
    for (let x = dx0 + 6; x < dx1; x += 22) g.fillRect(x, 452, 3, 26);
    g.fillRect(dx0, 458, dx1 - dx0, 2.5);
    g.fillRect(dx0, 468, dx1 - dx0, 2.5);
    // a windmill on the hill
    g.fillStyle = '#0a1228';
    g.fillRect(150, 395, 3, 40);
    g.save();
    g.translate(151.5, 395);
    for (let i = 0; i < 4; i++) {
      g.rotate(TAU / 4);
      g.fillRect(-1, 0, 2, 15);
    }
    g.restore();
    // door frame and the opened door panels (red with white braces)
    g.strokeStyle = '#2a1008';
    g.lineWidth = 6;
    g.strokeRect(dx0, dy0, dx1 - dx0, 540 - dy0);
    for (const [x0, x1] of [[70, 108], [252, 290]]) {
      g.fillStyle = '#9a2a1e';
      g.fillRect(x0, dy0 + 4, x1 - x0, 540 - dy0 - 4);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let x = x0; x < x1; x += 9) g.fillRect(x, dy0 + 4, 1, 540 - dy0);
      g.strokeStyle = '#efe4cc';
      g.lineWidth = 4;
      g.strokeRect(x0 + 2, dy0 + 6, x1 - x0 - 4, 540 - dy0 - 8);
      g.beginPath();
      g.moveTo(x0 + 3, dy0 + 7);
      g.lineTo(x1 - 3, 538);
      g.moveTo(x1 - 3, dy0 + 7);
      g.lineTo(x0 + 3, 538);
      g.stroke();
    }
    // the scarecrow's bale stack at the left
    for (const [x, y] of [[22, 528], [64, 528], [43, 500]]) {
      const hay = g.createLinearGradient(0, y - 14, 0, y + 14);
      hay.addColorStop(0, '#e8c060');
      hay.addColorStop(1, '#8a5a18');
      g.fillStyle = hay;
      g.beginPath();
      g.roundRect(x - 21, y - 14, 42, 28, 4);
      g.fill();
      g.fillStyle = '#6a3a14';
      g.fillRect(x - 11, y - 14, 2.4, 28);
      g.fillRect(x + 9, y - 14, 2.4, 28);
    }
    // a washtub bass and a pitchfork on the right
    g.strokeStyle = '#8a8a8a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(330, 540);
    g.lineTo(312, 330);
    g.stroke();
    g.strokeStyle = '#b8b8b8';
    g.lineWidth = 1.6;
    for (const dx of [-5, 0, 5]) {
      g.beginPath();
      g.moveTo(312 + dx, 332);
      g.lineTo(311 + dx * 1.1, 310);
      g.stroke();
    }
    const tub = g.createLinearGradient(296, 0, 346, 0);
    tub.addColorStop(0, '#5a6a7a');
    tub.addColorStop(0.5, '#c8d4dc');
    tub.addColorStop(1, '#4a5868');
    g.fillStyle = tub;
    g.beginPath();
    g.moveTo(298, 540);
    g.lineTo(344, 540);
    g.lineTo(338, 512);
    g.lineTo(304, 512);
    g.closePath();
    g.fill();
    g.fillStyle = '#6a3a1a';
    g.fillRect(319, 430, 4, 84);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(321, 432);
    g.lineTo(321, 512);
    g.stroke();
    // floor
    const floor = g.createLinearGradient(0, 540, 0, H);
    floor.addColorStop(0, '#7a4a24');
    floor.addColorStop(1, '#3a200e');
    g.fillStyle = floor;
    g.fillRect(0, 540, W, H - 540);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 540, W, 3);
    for (let y = 548, h = 8; y < H; y += h, h *= 1.18) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, y, W, 1);
      let x = rng.range(-60, 0);
      while (x < W) {
        const len = rng.range(50, 100);
        g.fillStyle = `rgba(${rng.chance(0.5) ? '255,200,140' : '0,0,0'},${rng.range(0.02, 0.07).toFixed(3)})`;
        g.fillRect(x, y + 1, len, h - 1);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y, 1, h);
        x += len;
      }
    }
    // straw scattered on the floor
    for (let i = 0; i < 110; i++) {
      const x = rng.range(0, W);
      const y = rng.range(544, H);
      const a = rng.range(0, Math.PI);
      const l = rng.range(3, 8);
      g.strokeStyle = rng.chance(0.6) ? 'rgba(255,215,110,0.55)' : 'rgba(200,150,60,0.45)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4);
      g.stroke();
    }
  });
}

// ---------- music: electro bluegrass hoedown, 140 BPM, G major over G–C–G–D–G–C–D–G ----------

const music = {
  cps: 140 / 240, // one 4/4 bar per cycle: 35 bars = 60s
  setup: `
    const kick = note("c2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
    const stomp = note("c2 c2 c2 [c2 c2]").s("sine").decay(0.2).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1200).lpf(6000).gain(0.15).room(0.25)
    const board = s("white*16").decay(0.025).sustain(0).hpf(6500).gain("[0.015 0.03 0.045 0.03]*4")
    const shaker = s("[~ white]*4").decay(0.05).sustain(0).hpf(7000).gain(0.04)
    const roll = s("<~ ~ ~ [pink*8 pink*16]>").decay(0.05).sustain(0).hpf(1400).lpf(6000).gain(saw.range(0.02, 0.09))
    const bassline = "<[g2 d3 g2 d3] [c3 g2 c3 g2] [g2 d3 g2 d3] [d3 a2 d3 a2] [g2 d3 g2 d3] [c3 g2 c3 g2] [d3 a2 d3 fs2] [g2 d3 g2 b2]>"
    const bass = note(bassline).s("sawtooth").attack(0.004).decay(0.16).sustain(0.2).release(0.05)
      .lpf(saw.range(450, 1600).slow(35)).lpq(4).gain(0.32)
    const sub = note("<g2 c3 g2 d3 g2 c3 d3 g2>").s("sine").decay(0.5).sustain(0.4).gain(0.2)
    const chords = "<[g3,b3,d4] [g3,c4,e4] [g3,b3,d4] [fs3,a3,d4] [g3,b3,d4] [g3,c4,e4] [fs3,a3,d4] [g3,b3,d4]>"
    const chop = note(chords).struct("[~ x]*4").s("square").attack(0.003).decay(0.07).sustain(0).lpf(saw.range(1200, 2800).slow(35)).gain(0.06)
    const pad = note(chords).s("sawtooth").attack(0.3).release(0.6).lpf(1000).gain(0.04).room(0.5)
    const rolls = "<[g4 b4 d5 g5 d5 b4 g4 d5]*2 [g4 c5 e5 g5 e5 c5 g4 e5]*2 [g4 b4 d5 g5 d5 b4 g4 d5]*2 [fs4 a4 d5 fs5 d5 a4 fs4 d5]*2 [g4 b4 d5 g5 d5 b4 g4 d5]*2 [g4 c5 e5 g5 e5 c5 g4 e5]*2 [fs4 a4 d5 fs5 d5 a4 fs4 d5]*2 [g4 b4 d5 g5 b5 g5 d5 b4]*2>"
    const banjo = note(rolls).s("triangle").attack(0.002).decay(0.09).sustain(0).lpf(3600).gain(0.06).pan(sine.range(0.35, 0.65).slow(2))
    const banjoTwang = note(rolls).s("square").attack(0.002).decay(0.05).sustain(0).lpf(2200).gain(0.025).pan(0.6)
    const tune = "<[g4 a4 b4 d5 e5 d5 b4 g4] [e5 g5 e5 d5 c5 e5 d5 c5] [b4 d5 g5 d5 b4 a4 g4 b4] [a4 b4 a4 fs4 d4 fs4 a4 c5] [b4 a4 b4 d5 g5 fs5 g5 d5] [e5 d5 c5 e5 g5 e5 c5 a4] [d5 c5 b4 a4 fs4 a4 d5 fs5] [g5 d5 b4 d5 g4 ~ ~ ~]>"
    const fiddle = note(tune).s("sawtooth").attack(0.02).decay(0.12).sustain(0.5).release(0.08).lpf(2400).vib(6).vibmod(0.12)
      .gain(0.065).room(0.35).delay(0.18).delaytime(0.3214).delayfeedback(0.25).pan(0.42)
    const fiddleHi = note(tune).add(note(12)).s("square").attack(0.015).decay(0.1).sustain(0.4).release(0.06).lpf(3000).vib(6).vibmod(0.1)
      .gain(0.035).pan(0.6)
    const fiddleLow = note(tune).add(note(-12)).s("sawtooth").decay(0.12).sustain(0.35).release(0.05).lpf(1300).gain(0.04)
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, clap, shaker, bass, sub, chop, banjo)],
    [9, stack(kick, clap, shaker, board, bass, sub, chop, banjo, fiddle)],
    [9, stack(kick, clap, board, roll, bass, sub, chop, pad, banjo, banjoTwang, fiddle, fiddleLow)],
    [9, stack(stomp, clap, shaker, board, roll, bass, sub, chop, pad, banjo, banjoTwang, fiddle, fiddleHi, fiddleLow, wash)]
  )`,
};

// ---------- the rounds ----------

// Where a rival is `tau` seconds into a scramble. It runs for its first bale; if it loses that
// race it stops for a moment ("!") and then runs for the nearest bale nobody else is going for.
const SWITCH_PAUSE = 0.12;
function legPos(from, to, v, dt) {
  const d = to - from;
  const move = v * Math.max(0, dt);
  return Math.abs(d) <= move ? to : from + Math.sign(d) * move;
}
function rivalPos(r, tau) {
  if (tau <= r.rd) return r.xd;
  if (tau < r.tsw) return legPos(r.xd, r.tgtX, r.v, tau - r.rd);
  return legPos(r.xs2, r.tgt2X, r.v, tau - r.tsw - SWITCH_PAUSE);
}
const arriveAt = (from, to, v, t0) => t0 + Math.max(0, Math.abs(to - from) - ZONE) / v;
// the bale a rival is heading for at `tau`
const rivalTarget = (r, tau) => (tau < r.tsw ? r.tgt : r.tgt2);

function planRounds(rng) {
  const rounds = [];
  const prevX = ROSTER.map((_, i) => (i % 2 ? 390 : -30));
  const joined = ROSTER.map(() => false);
  let t0 = 0;
  while (t0 < 64) {
    const p = progress(t0, 60, 1.1);
    const n = t0 < 13 ? 3 : t0 < 30 ? 4 : 5;
    const D = rounds.length === 0 ? 0.45 : lerp(0.8, 0.45, p);
    let Wn = lerp(1.95, 1.02, p);
    const S = lerp(0.62, 0.42, p);
    const react = lerp(0.52, 0.34, p);
    const margin = 0.06;
    const speedK = lerp(1, 1.3, p);
    const delayBase = lerp(0.3, 0.13, p);
    // more and more rounds with no free bale at all: then you have to beat a slow animal to its own
    let steal = t0 > 16 && rng.chance(clamp(0.25 + p * 0.9, 0, 0.8));
    let found = null;
    for (let attempt = 0; attempt < 1500 && !found; attempt++) {
      if (attempt === 600) steal = false;
      if (attempt > 600 && attempt % 300 === 0) Wn += 0.12;
      // bales
      const xs = [];
      let guard = 0;
      while (xs.length < n && guard++ < 200) {
        const x = rng.range(34, 326);
        if (xs.every((o) => Math.abs(o - x) >= GAP)) xs.push(x);
      }
      if (xs.length < n) continue;
      xs.sort((a, b) => a - b);
      // dancers' positions when the shadows appear, and the bale each one goes for
      const rivals = [];
      for (let i = 0; i < n; i++) {
        const ty = TYPES[ROSTER[i].type];
        const from = joined[i] ? prevX[i] : rng.range(40, 320);
        const xd = clamp(from + rng.range(-120, 120), 18, 342);
        let best = 0;
        for (let b = 1; b < n; b++) if (Math.abs(xs[b] - xd) < Math.abs(xs[best] - xd)) best = b;
        const v = ty.speed * speedK * rng.range(0.94, 1.06);
        const rd = Math.max(0.06, delayBase + ty.delay + rng.range(0, 0.08));
        rivals.push({ i, xd, tgt: best, tgtX: xs[best], v, rd, a1: arriveAt(xd, xs[best], v, rd), tsw: Infinity, tgt2: -1, tgt2X: 0, xs2: 0, arrive: Infinity, final: best });
      }
      // each first race: the quickest wins; the others notice when it gets there and re-route
      const claim = xs.map(() => Infinity);
      const taken = new Set(rivals.map((r) => r.tgt));
      const losers = [];
      for (let b = 0; b < n; b++) {
        const racers = rivals.filter((r) => r.tgt === b).sort((a, c) => a.a1 - c.a1);
        if (!racers.length) continue;
        racers[0].arrive = racers[0].a1;
        for (const l of racers.slice(1)) {
          l.tsw = racers[0].a1 + 0.1;
          losers.push(l);
        }
      }
      losers.sort((a, c) => a.tsw - c.tsw);
      for (const l of losers) {
        l.xs2 = legPos(l.xd, l.tgtX, l.v, l.tsw - l.rd);
        let best = -1;
        for (let b = 0; b < n; b++) if (!taken.has(b) && (best < 0 || Math.abs(xs[b] - l.xs2) < Math.abs(xs[best] - l.xs2))) best = b;
        if (best < 0) {
          // nowhere left to go: it just stands there
          l.tgt2 = l.tgt;
          l.tgt2X = l.xs2;
          l.final = -1;
          continue;
        }
        taken.add(best);
        l.tgt2 = best;
        l.tgt2X = xs[best];
        l.final = best;
        l.arrive = arriveAt(l.xs2, xs[best], l.v, l.tsw + SWITCH_PAUSE);
      }
      for (const r of rivals) if (r.final >= 0 && r.arrive <= Wn) claim[r.final] = Math.min(claim[r.final], r.arrive);
      const free = claim.filter((c) => c === Infinity).length;
      const open0 = n - new Set(rivals.map((r) => r.tgt)).size; // bales nobody runs for at first
      if (t0 < 24 && open0 < 1) continue;
      if (steal && free > 0) continue;
      // fairness: from anywhere on the floor, some bale can be won with a human reaction
      let ok = true;
      for (let x = 16; x <= 344 && ok; x += 6) {
        ok = xs.some((bx, b) => react + Math.max(0, Math.abs(x - bx) - ZONE + 4) / BOT_SPEED + margin <= Math.min(claim[b], Wn));
      }
      if (!ok) continue;
      found = { xs, rivals, claim, free };
    }
    const R = { t0, tw: t0 + D, tl: t0 + D + Wn, te: t0 + D + Wn + S, W: Wn, n, ...found };
    for (const r of R.rivals) {
      joined[r.i] = true;
      prevX[r.i] = rivalPos(r, Wn);
    }
    rounds.push(R);
    t0 = R.te;
  }
  return rounds;
}

export default {
  id: 'hoedown',
  title: 'Hay Scramble',
  emoji: '🌾',
  tagline: 'When the fiddle stops, sit on a hay bale before an animal takes it.',
  colors: { bg: '#2a0e0c', fg: '#ffffff', accent: '#ffd23f' },
  music,

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');
    const rounds = planRounds(plan);

    // ---- art ----
    const scene = paintScene(W, H, art);
    const baleSpr = makeBale(art);
    const pig = makePig();
    const animals = ROSTER.map((ro) => makeAnimal(ro.type, ro.col));
    const fiddler = makeFiddler();
    const glowWarm = glowSprite('rgba(255,190,90,0.9)', 20);
    const glowLamp = glowSprite('rgba(255,170,70,0.8)', 70);
    const glowMoon = glowSprite('rgba(200,220,255,0.7)', 40);
    const glowGreen = glowSprite('rgba(90,255,140,0.9)', 30);
    const glowRed = glowSprite('rgba(255,60,60,0.9)', 40);
    const glowPink = glowSprite('rgba(255,150,190,0.8)', 30);
    const vignette = vignetteSprite(W, H, 0.6, '20,4,2');
    const bulbs = [];
    for (let i = 0; i < 14; i++) {
      const x = 6 + i * 27;
      const u = x / W;
      bulbs.push({ x, y: 178 + 4 * u * (1 - u) * 22, c: i % 3 });
    }
    const motes = [];
    for (let i = 0; i < 30; i++) motes.push({ x: Math.random() * W, y: 180 + Math.random() * 380, vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 5, s: 1 + Math.random() * 1.5, ph: Math.random() * TAU });
    const flies = [];
    for (let i = 0; i < 7; i++) flies.push({ x: 120 + Math.random() * 120, y: 420 + Math.random() * 100, ph: Math.random() * TAU });

    const fx = createParticles();
    const sparks = createParticles();
    const notes = []; // little music notes from the fiddle
    const texts = [];

    // ---- state ----
    const mover = createMover({ x: W / 2, minX: 16, maxX: W - 16, speed: PLAYER_SPEED, accel: 20 });
    let walk = 0;
    let ri = 0;
    let landed = false; // has the current round's scramble been resolved
    let curB = -1; // bale you're at
    let enterT = 0; // when you got there (seconds into the scramble)
    let seatX = 0;
    let seated = false;
    let won = 0;
    let flash = 0;
    let shake = 0;
    let hay = 0; // the HAY! pop
    let noteT = 0;
    let lostBale = -1;
    let clock = 0;
    const rivalState = ROSTER.map(() => ({ seated: false, sulk: false, x: -40, from: -40 }));
    for (let i = 0; i < ROSTER.length; i++) rivalState[i].x = rivalState[i].from = i % 2 ? 390 : -30;

    const round = () => rounds[Math.min(ri, rounds.length - 1)];

    function startRound() {
      const R = round();
      landed = false;
      curB = -1;
      seated = false;
      for (const rs of rivalState) {
        rs.from = rs.x;
        rs.seated = false;
        rs.sulk = false;
      }
      // last round's bales burst into straw
      const prev = rounds[ri - 1];
      if (prev) {
        for (const bx of prev.xs) fx.burst(bx, BALE_Y, { count: 14, speed: 150, life: 0.7, size: 3, colors: ['#ffe08a', '#e8b84a', '#c88a2a'], gravity: 400, spread: Math.PI, angle: -Math.PI / 2 });
      }
      void R;
    }
    startRound();

    function resolve(R) {
      landed = true;
      // who's at which bale
      const wins = R.xs.map(() => null);
      for (let b = 0; b < R.xs.length; b++) {
        const takers = R.rivals.filter((r) => r.final === b && r.arrive <= R.W).sort((a, c) => a.arrive - c.arrive);
        wins[b] = takers.length ? takers[0] : null;
      }
      let youWin = false;
      if (curB >= 0 && enterT <= R.claim[curB]) {
        youWin = true;
        wins[curB] = 'you';
      }
      for (const r of R.rivals) {
        const rs = rivalState[r.i];
        rs.x = rivalPos(r, R.W);
        if (r.final >= 0 && wins[r.final] === r) {
          rs.seated = true;
          rs.x = R.xs[r.final];
        } else {
          rs.sulk = true;
        }
      }
      for (const bx of R.xs) fx.burst(bx, FEET, { count: 12, speed: 120, life: 0.6, size: 3.5, colors: ['rgba(255,230,170,0.8)', 'rgba(200,160,100,0.7)'], gravity: -30, spread: Math.PI, angle: -Math.PI / 2, round: true, drag: 3 });
      hay = 1;
      shake = 0.35;
      if (youWin) {
        seated = true;
        seatX = R.xs[curB];
        won++;
        sparks.burst(seatX, BALE_Y - 20, { count: 18, speed: 160, life: 0.6, size: 3, colors: ['#ffe680', '#ffffff', '#5dff9a'], gravity: 200 });
        texts.push({ text: won % 5 === 0 ? `${won} in a row!` : 'Yeehaw!', x: seatX, y: BALE_Y - 64, life: 0.9, c: '#ffe680' });
      } else {
        this_.dead = true;
        flash = 1;
        if (curB >= 0) {
          lostBale = curB;
          const r = wins[curB];
          this_.deathReason = r && r !== 'you' ? `The ${TYPES[ROSTER[r.i].type].name} got to that bale first.` : 'Left standing when the fiddle stopped.';
        } else {
          this_.deathReason = 'Left standing when the fiddle stopped.';
        }
        texts.push({ text: 'OUT!', x: mover.x, y: FEET - 80, life: 1.4, c: '#ff5a5a' });
      }
    }

    // where a rival is drawn right now
    function rivalNow(r, R, t) {
      const rs = rivalState[r.i];
      if (t < R.tw) {
        const k = clamp((t - R.t0) / (R.tw - R.t0), 0, 1);
        return lerp(rs.from, r.xd, easeInOut(k));
      }
      if (!landed) return rivalPos(r, t - R.tw);
      return rs.x;
    }

    const this_ = {
      dead: false,
      deathReason: '',
      __rounds: rounds,

      update(dt, dir, t) {
        clock = t;
        flash = Math.max(0, flash - dt * 1.5);
        shake = Math.max(0, shake - dt * 2);
        hay = Math.max(0, hay - dt * 1.6);
        let R = round();
        if (t >= R.te && ri < rounds.length - 1) {
          ri++;
          startRound();
          R = round();
        }
        if (!landed && t >= R.tl) {
          resolve(R);
          if (this_.dead) return;
        }
        if (seated && landed) {
          mover.x += (seatX - mover.x) * Math.min(1, 20 * dt);
          mover.vx = 0;
        } else {
          mover.update(dt, dir);
          walk += Math.abs(mover.vx) * dt * 0.12;
        }
        // keep track of the bale you're at during the scramble
        if (t >= R.tw && !landed) {
          const tau = t - R.tw;
          let b = -1;
          for (let k = 0; k < R.xs.length; k++) if (Math.abs(mover.x - R.xs[k]) <= ZONE) b = k;
          if (b !== curB) {
            curB = b;
            enterT = tau;
          }
        }
        for (const r of R.rivals) rivalState[r.i].x = rivalNow(r, R, t);
      },

      afterlife(dt) {
        flash = Math.max(0, flash - dt * 1.2);
        shake = Math.max(0, shake - dt * 2);
        hay = Math.max(0, hay - dt * 1.6);
        fx.update(dt);
        sparks.update(dt);
        for (const tx of texts) tx.life -= dt * 0.5;
      },

      render(g, t) {
        const dt = 1 / 60;
        if (!this_.dead) {
          fx.update(dt);
          sparks.update(dt);
        }
        const R = round();
        const now = t;
        const tau = t - R.tw;
        const inWindow = t >= R.tw && !landed;
        const playing = !landed; // the fiddle plays until the bales drop

        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 6);
        drawSprite(g, scene, W / 2, H / 2);

        // lights: moon, lanterns, string lights
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowMoon, 212, 286, { size: 90, alpha: 0.6 });
        for (const lx of [24, 336]) {
          const fl = 0.85 + 0.15 * Math.sin(now * 7 + lx) * Math.sin(now * 3.1);
          drawSprite(g, glowLamp, lx, 300, { size: 220, alpha: 0.32 * fl });
        }
        for (const bl of bulbs) {
          const tw = 0.55 + 0.45 * Math.sin(now * 2.6 + bl.x * 0.13);
          drawSprite(g, glowWarm, bl.x, bl.y, { size: 22 + tw * 8, alpha: 0.45 + tw * 0.4 });
        }
        for (const f of flies) {
          const a = 0.5 + 0.5 * Math.sin(now * 2 + f.ph * 3);
          drawSprite(g, glowGreen, f.x + Math.sin(now * 0.7 + f.ph) * 10, f.y + Math.cos(now * 0.9 + f.ph) * 6, { size: 10, alpha: a * 0.7 });
        }
        g.globalCompositeOperation = 'source-over';
        // lantern bodies
        for (const lx of [24, 336]) {
          g.strokeStyle = '#1a0a04';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(lx, 262);
          g.lineTo(lx, 286);
          g.stroke();
          g.fillStyle = '#2a1a10';
          g.fillRect(lx - 7, 286, 14, 4);
          g.fillStyle = '#ffd27a';
          g.beginPath();
          g.roundRect(lx - 5.5, 290, 11, 15, 3);
          g.fill();
          g.fillStyle = '#fff4c8';
          g.beginPath();
          g.ellipse(lx, 298, 2, 3.5, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#2a1a10';
          g.fillRect(lx - 7, 305, 14, 3);
        }
        g.strokeStyle = 'rgba(20,8,4,0.9)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 176);
        for (const bl of bulbs) g.lineTo(bl.x, bl.y - 3);
        g.lineTo(W, 176);
        g.stroke();
        for (const bl of bulbs) {
          g.fillStyle = ['#ffe9a8', '#ffb3a0', '#fff6d8'][bl.c];
          g.beginPath();
          g.ellipse(bl.x, bl.y, 2.3, 3.3, 0, 0, TAU);
          g.fill();
        }
        // dust motes in the light
        for (const m of motes) {
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.y < 175) {
            m.y = 560;
            m.x = Math.random() * W;
          }
          g.fillStyle = `rgba(255,220,160,${0.18 + 0.12 * Math.sin(now * 2 + m.ph)})`;
          g.fillRect(m.x, m.y, m.s, m.s);
        }

        // the scarecrow fiddler: bow saws while the music plays, lifts when it stops
        const fxp = 44;
        const fyp = 444;
        drawSprite(g, fiddler, fxp, fyp, { size: 60 });
        g.save();
        g.translate(fxp, fyp);
        const saw = playing ? Math.sin(now * 14) : 0;
        g.strokeStyle = '#b8322a';
        g.lineWidth = 4.5;
        g.lineCap = 'round';
        const hx = -14 + saw * 5;
        const hy = playing ? -2 + saw * 2 : -22;
        g.beginPath();
        g.moveTo(-10, -8);
        g.lineTo(hx, hy);
        g.stroke();
        g.lineCap = 'butt';
        g.strokeStyle = '#e8d8b0';
        g.lineWidth = 1.4;
        g.beginPath();
        if (playing) {
          g.moveTo(hx - 4, hy + 6);
          g.lineTo(hx + 26, hy - 10);
        } else {
          g.moveTo(hx, hy);
          g.lineTo(hx - 6, hy - 24);
        }
        g.stroke();
        g.restore();
        if (playing && !this_.dead) {
          noteT -= dt;
          if (noteT <= 0) {
            noteT = 0.32;
            notes.push({ x: fxp + 14, y: fyp - 28, life: 1.4, ph: Math.random() * TAU, ch: Math.random() < 0.5 ? '♪' : '♫' });
          }
        }
        g.font = `700 13px ${BODY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = notes.length - 1; i >= 0; i--) {
          const nt = notes[i];
          nt.life -= dt;
          if (nt.life <= 0) {
            notes.splice(i, 1);
            continue;
          }
          nt.y -= 22 * dt;
          nt.x += Math.sin(now * 3 + nt.ph) * 0.4;
          g.fillStyle = `rgba(255,236,180,${Math.min(1, nt.life) * 0.8})`;
          g.fillText(nt.ch, nt.x, nt.y);
        }

        // ---- bales ----
        const FALL = Math.min(0.42, R.W * 0.38);
        if (t >= R.tw) {
          // shadows on the floor
          for (let b = 0; b < R.xs.length; b++) {
            const bx = R.xs[b];
            const k = landed ? 1 : clamp(tau / R.W, 0, 1);
            if (!landed) {
              g.fillStyle = `rgba(0,0,0,${0.15 + 0.3 * k})`;
              g.beginPath();
              g.ellipse(bx, FEET + 1, BALE_W * (0.35 + 0.2 * k), 6 + 2 * k, 0, 0, TAU);
              g.fill();
              // countdown ring on the floor
              g.strokeStyle = 'rgba(255,240,200,0.25)';
              g.lineWidth = 2;
              g.setLineDash([4, 4]);
              g.beginPath();
              g.ellipse(bx, FEET + 1, BALE_W * 0.62, 10, 0, 0, TAU);
              g.stroke();
              g.setLineDash([]);
              g.strokeStyle = k > 0.75 ? '#ffe680' : 'rgba(255,240,200,0.8)';
              g.lineWidth = 2.5;
              g.beginPath();
              g.ellipse(bx, FEET + 1, BALE_W * 0.62, 10, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k);
              g.stroke();
            }
          }
          // bales on the loft edge, then falling
          for (let b = 0; b < R.xs.length; b++) {
            const bx = R.xs[b];
            let y;
            let rot = 0;
            if (landed) y = BALE_Y;
            else if (tau < R.W - FALL) {
              const appear = clamp(tau / 0.18, 0, 1);
              const wob = clamp((tau - (R.W - FALL) + 0.6) / 0.6, 0, 1);
              y = LOFT_Y - (1 - appear) * 30;
              rot = Math.sin(now * 30 + b) * 0.06 * wob;
            } else {
              const k = (tau - (R.W - FALL)) / FALL;
              y = LOFT_Y + (BALE_Y - LOFT_Y) * k * k;
              rot = (1 - k) * 0.1 * (b % 2 ? 1 : -1);
            }
            if (!landed) {
              // a faint drop line from the bale to where it will land
              g.strokeStyle = 'rgba(255,230,160,0.18)';
              g.lineWidth = 1.5;
              g.setLineDash([2, 6]);
              g.beginPath();
              g.moveTo(bx, y + BALE_H / 2 + 2);
              g.lineTo(bx, FEET - 4);
              g.stroke();
              g.setLineDash([]);
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowWarm, bx, y, { size: 90, alpha: 0.35 });
              g.globalCompositeOperation = 'source-over';
            }
            drawSprite(g, baleSpr, bx, y, { rot });
          }
        }

        // ---- who's heading where ----
        if (inWindow) {
          // trails on the floor from each animal to its bale
          for (const r of R.rivals) {
            const x = rivalState[r.i].x;
            if (tau >= r.arrive || r.final < 0 && tau >= r.tsw) continue;
            const tx = tau < r.tsw ? r.tgtX : r.tgt2X;
            const y = FEET + 10 + r.i * 2.5;
            g.strokeStyle = ROSTER[r.i].col;
            g.globalAlpha = 0.75;
            g.lineWidth = 2.2;
            g.setLineDash([3, 4]);
            g.lineDashOffset = -now * 30 * Math.sign(tx - x);
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(tx, y);
            g.stroke();
            g.setLineDash([]);
            const s = Math.sign(tx - x) || 1;
            if (Math.abs(tx - x) > 8) {
              g.beginPath();
              g.moveTo(tx, y);
              g.lineTo(tx - s * 5, y - 3.5);
              g.lineTo(tx - s * 5, y + 3.5);
              g.closePath();
              g.fillStyle = ROSTER[r.i].col;
              g.fill();
            }
            g.globalAlpha = 1;
          }
          // under each bale: the faces of the animals going for it, or FREE
          for (let b = 0; b < R.xs.length; b++) {
            const bx = R.xs[b];
            const takers = R.rivals
              .filter((r) => rivalTarget(r, tau) === b && !(r.final < 0 && tau >= r.tsw))
              .sort((a, c) => (tau < a.tsw ? a.a1 : a.arrive) - (tau < c.tsw ? c.a1 : c.arrive));
            if (!takers.length) {
              const pulse = 0.5 + 0.5 * Math.sin(now * 8);
              g.globalCompositeOperation = 'lighter';
              drawSprite(g, glowGreen, bx, BADGE_Y, { size: 50, alpha: 0.35 + pulse * 0.25 });
              g.globalCompositeOperation = 'source-over';
              g.fillStyle = '#2ecc6a';
              g.beginPath();
              g.roundRect(bx - 20, BADGE_Y - 9, 40, 18, 9);
              g.fill();
              g.fillStyle = '#ffffff';
              g.font = `900 11px ${BODY_FONT}`;
              g.fillText('FREE', bx, BADGE_Y + 0.5);
            } else {
              takers.forEach((r, j) => {
                const ax = bx + (j - (takers.length - 1) / 2) * 20;
                const arrived = tau >= r.arrive && r.final === b;
                g.fillStyle = 'rgba(20,8,4,0.75)';
                g.beginPath();
                g.arc(ax, BADGE_Y, 10.5, 0, TAU);
                g.fill();
                g.strokeStyle = ROSTER[r.i].col;
                g.lineWidth = arrived ? 3 : 2;
                g.beginPath();
                g.arc(ax, BADGE_Y, 10.5, 0, TAU);
                g.stroke();
                drawSprite(g, animals[r.i].spr, ax, BADGE_Y + 2, { size: 24, alpha: j === 0 ? 1 : 0.55 });
              });
            }
          }
        }

        // ---- the dancers ----
        const drawAnimal = (sprite, bottom, x, legsCol, legW, mode, phase, lean, scale = 1) => {
          // mode: 'stand' | 'run' | 'sit' | 'sulk'
          const sz = sprite.w * scale;
          const k = sz / sprite.w;
          if (mode === 'sit') {
            const by = BALE_Y - BALE_H / 2 + 5;
            g.fillStyle = legsCol;
            for (const s of [-1, 1]) {
              g.beginPath();
              g.roundRect(x + s * 6 - legW / 2, by - 2, legW, 10 + Math.sin(now * 6 + phase + s) * 1.5, legW / 2);
              g.fill();
            }
            drawSprite(g, sprite, x, by - bottom * k, { size: sz, rot: Math.sin(now * 3 + phase) * 0.04 });
            return;
          }
          const moving = mode === 'run';
          const hop = mode === 'stand' ? Math.abs(Math.sin(now * 7.3 + phase)) * 4 : moving ? Math.abs(Math.sin(phase)) * 3 : 0;
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.ellipse(x, FEET + 1, 14 * k, 4, 0, 0, TAU);
          g.fill();
          g.fillStyle = legsCol;
          const sw = moving ? Math.sin(phase) : 0;
          for (const s of [-1, 1]) {
            const lx = x + s * 6 * k + sw * s * 3;
            g.beginPath();
            g.roundRect(lx - legW / 2, FEET - 10 - hop, legW, 10 + hop * 0.6 - Math.abs(sw) * (s > 0 ? 1.5 : 0), legW / 2);
            g.fill();
          }
          const droop = mode === 'sulk' ? 3 : 0;
          drawSprite(g, sprite, x, FEET - 9 - hop + droop - bottom * k, { size: sz, rot: lean * 0.12 + (mode === 'sulk' ? 0.12 * Math.sin(now * 2 + phase) : 0) });
          if (mode === 'sulk') {
            g.fillStyle = 'rgba(140,200,255,0.9)';
            g.beginPath();
            g.ellipse(x + 11, FEET - 50 + ((now * 20 + phase * 10) % 8), 1.8, 2.6, 0, 0, TAU);
            g.fill();
          }
        };

        const order = [...R.rivals].sort((a, c) => rivalState[a.i].x - rivalState[c.i].x);
        for (const r of order) {
          const rs = rivalState[r.i];
          const ty = TYPES[ROSTER[r.i].type];
          let mode = 'stand';
          let lean = 0;
          if (landed) mode = rs.seated ? 'sit' : 'sulk';
          else if (t >= R.tw && tau > r.rd && Math.abs(rs.x - (tau < r.tsw ? r.tgtX : r.tgt2X)) > 1) {
            mode = 'run';
            lean = Math.sign((tau < r.tsw ? r.tgtX : r.tgt2X) - rs.x);
          } else if (t < R.tw) lean = Math.sign(r.xd - rs.from) * 0.4;
          const ph = mode === 'run' ? now * 16 + r.i : r.i * 1.7;
          drawAnimal(animals[r.i].spr, animals[r.i].bottom, rs.x, ty.legs, ty.legW, mode, ph, lean);
          // beaten to its first bale: a "!" as it turns for another
          if (!landed && t >= R.tw && tau >= r.tsw && tau < r.tsw + 0.6) {
            const k = (tau - r.tsw) / 0.6;
            g.globalAlpha = 1 - k * k;
            g.fillStyle = ROSTER[r.i].col;
            g.beginPath();
            g.arc(rs.x, FEET - 66 - k * 6, 8, 0, TAU);
            g.fill();
            g.fillStyle = '#1a0a04';
            g.font = `900 12px ${BODY_FONT}`;
            g.fillText('!', rs.x, FEET - 65.5 - k * 6);
            g.globalAlpha = 1;
          }
        }

        // you, the pig
        const px = mover.x;
        const pmode = this_.dead ? 'sulk' : seated && landed ? 'sit' : Math.abs(mover.vx) > 20 ? 'run' : 'stand';
        if (!seated || !landed) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowPink, px, FEET - 4, { size: 70, alpha: 0.35 });
          g.globalCompositeOperation = 'source-over';
        }
        drawAnimal(pig.spr, pig.bottom, px, '#f48aa8', 4.4, pmode, pmode === 'run' ? walk : 0.5, mover.lean);
        if (t < 3.5 && !this_.dead) {
          const a = clamp(3.5 - t, 0, 1);
          g.globalAlpha = a;
          g.fillStyle = '#ffffff';
          g.font = `900 12px ${BODY_FONT}`;
          g.fillText('YOU', px, FEET - 78 + Math.sin(now * 6) * 2);
          g.beginPath();
          g.moveTo(px - 5, FEET - 70);
          g.lineTo(px + 5, FEET - 70);
          g.lineTo(px, FEET - 64);
          g.closePath();
          g.fill();
          g.globalAlpha = 1;
        }

        // your bale: green while you've got it, red if someone beat you there
        if (inWindow && curB >= 0) {
          const bx = R.xs[curB];
          const mine = enterT <= R.claim[curB];
          const c = mine ? '#5dff9a' : '#ff5a5a';
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, mine ? glowGreen : glowRed, bx, FEET, { size: 80, alpha: 0.45 });
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = c;
          g.lineWidth = 3;
          g.beginPath();
          g.ellipse(bx, FEET + 1, BALE_W * 0.62, 10, 0, 0, TAU);
          g.stroke();
          if (!mine) {
            g.font = `900 16px ${BODY_FONT}`;
            g.fillStyle = c;
            g.fillText('✗', px, FEET - 74);
          }
        }
        if (lostBale >= 0 && this_.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, mover.x, FEET - 20, { size: 140, alpha: 0.5 + 0.3 * Math.sin(now * 16) });
          g.globalCompositeOperation = 'source-over';
        }

        fx.render(g);
        sparks.render(g, true);

        // HAY!
        if (hay > 0) {
          const k = 1 - hay;
          g.globalAlpha = Math.min(1, hay * 2.5);
          g.font = `900 ${Math.round(40 + k * 14)}px ${BODY_FONT}`;
          g.fillStyle = 'rgba(40,10,0,0.55)';
          g.fillText('HAY!', W / 2 + 2, 330 - k * 20 + 2);
          g.fillStyle = '#ffd23f';
          g.fillText('HAY!', W / 2, 330 - k * 20);
          g.globalAlpha = 1;
        }
        // first-round hint
        if (ri === 0 && inWindow && !this_.dead) {
          g.font = `800 14px ${BODY_FONT}`;
          g.fillStyle = 'rgba(20,8,4,0.7)';
          g.beginPath();
          g.roundRect(W / 2 - 128, 359, 256, 26, 13);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.fillText('Reach a bale before any animal does!', W / 2, 372.5);
        }

        // floating texts
        for (let i = texts.length - 1; i >= 0; i--) {
          const tx = texts[i];
          if (!this_.dead) tx.life -= dt;
          if (tx.life <= 0) {
            texts.splice(i, 1);
            continue;
          }
          g.globalAlpha = Math.min(1, tx.life * 3);
          g.font = `900 18px ${BODY_FONT}`;
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillText(tx.text, tx.x + 1.5, tx.y - (1 - tx.life) * 26 + 1.5);
          g.fillStyle = tx.c;
          g.fillText(tx.text, tx.x, tx.y - (1 - tx.life) * 26);
          g.globalAlpha = 1;
        }

        // seats won
        g.font = `800 13px ${BODY_FONT}`;
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255,240,210,0.8)';
        g.fillText(`🌾 ${won}`, 10, 70);
        g.textAlign = 'center';

        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);
        if (flash > 0) {
          g.fillStyle = `rgba(255,40,40,${0.25 * flash})`;
          g.fillRect(0, 0, W, H);
        }
        void clock;
      },
    };
    return this_;
  },
};
