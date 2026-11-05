// Hose Down! — a gardener stands in the middle of a summer veg patch with a garden hose, and the
// local wildlife wants the lettuces. ← and → swing the hose round; you never walk. Every critter has
// to be soaked for a moment before it gives up and bolts, and any critter that reaches the veg ends
// the run. Rabbits hop in under the fence and through the hedges from the start, crows swoop in fast
// from 11s, squirrels dart in zigzags from 21s and gophers pop out of molehills right in the lawn from
// 33s. Two round shrubs in the lawn stop the jet, so anything behind one is safe until it comes out.
// It's an attention game: a single jet against more and more critters, always soaking whichever
// will get there first.

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

const GX = 180; // the gardener (and the hose nozzle's pivot)
const GY = 588;
const R_PATCH = 128; // a critter this close to the gardener is in the veg
const REACH = 640; // the jet reaches every corner of the garden
const HALF = 0.05; // half-width of the jet, in radians
const MAX_AIM = 1.36; // how far round the gardener can swing the hose (≈78°)
const AIM_SPEED = 2.1; // rad/s
const WARN = 0.7; // seconds of rustling before a critter comes through the fence or hedge
const MOUND = 1.0; // seconds a molehill heaves before its gopher pops out

const TYPES = {
  rabbit: { r: 13, need: 0.65, name: 'A rabbit', reason: 'A rabbit hopped into the lettuces.' },
  crow: { r: 15, need: 0.45, name: 'A crow', reason: 'A crow landed in the veg patch.' },
  squirrel: { r: 12, need: 0.55, name: 'A squirrel', reason: 'A squirrel dug up the carrots.' },
  gopher: { r: 12, need: 0.7, name: 'A gopher', reason: 'A gopher got into the cabbages.' },
};

const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const bearingOf = (x, y) => Math.atan2(x - GX, GY - y);
const ease = (u) => u * u * (3 - 2 * u);

// ---------- art ----------

function paintGarden(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    // lawn with mowing stripes
    const lawn = g.createLinearGradient(0, 0, 0, H);
    lawn.addColorStop(0, '#5f9e3c');
    lawn.addColorStop(0.6, '#6dad44');
    lawn.addColorStop(1, '#5a9638');
    g.fillStyle = lawn;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-0.18);
    for (let i = -12; i < 12; i += 2) {
      g.fillStyle = 'rgba(210,255,150,0.075)';
      g.fillRect(i * 34, -H, 34, H * 2);
    }
    g.restore();
    // grass texture: little blades
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(40,90,25,0.22)' : 'rgba(190,240,130,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-1.5, 1.5), y - rng.range(2, 5));
      g.stroke();
    }
    // daisies and dandelions
    for (let i = 0; i < 46; i++) {
      const x = rng.range(16, W - 16);
      const y = rng.range(40, 440);
      if (rng.chance(0.65)) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.beginPath();
          g.ellipse(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.6, 0.9, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#ffd33d';
        g.beginPath();
        g.arc(x, y, 1.2, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = '#ffc928';
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,240,160,0.8)';
        g.beginPath();
        g.arc(x - 0.6, y - 0.6, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    // sun-dappled patches
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H * 0.75);
      const r = rng.range(30, 70);
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, 'rgba(255,250,190,0.12)');
      d.addColorStop(1, 'rgba(255,250,190,0)');
      g.fillStyle = d;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // the patio round the gardener's feet, and the veg bed in a horseshoe around it
    const bedIn = 64;
    const bedOut = R_PATCH - 4;
    const a0 = -Math.PI / 2 - 1.75;
    const a1 = -Math.PI / 2 + 1.75;
    // timber edging just outside the bed
    g.strokeStyle = '#8a5a2c';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(GX, GY, bedOut + 4, a0, a1);
    g.stroke();
    g.strokeStyle = 'rgba(255,220,160,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(GX, GY, bedOut + 6, a0, a1);
    g.stroke();
    // soil
    const soil = g.createRadialGradient(GX, GY, bedIn, GX, GY, bedOut);
    soil.addColorStop(0, '#5b3a22');
    soil.addColorStop(1, '#6e4628');
    g.fillStyle = soil;
    g.beginPath();
    g.arc(GX, GY, bedOut, a0, a1);
    g.arc(GX, GY, bedIn, a1, a0, true);
    g.closePath();
    g.fill();
    // tilled furrows
    for (let r = bedIn + 8; r < bedOut; r += 9) {
      g.strokeStyle = 'rgba(40,22,10,0.45)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(GX, GY, r, a0 + 0.04, a1 - 0.04);
      g.stroke();
      g.strokeStyle = 'rgba(160,110,70,0.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(GX, GY, r - 2, a0 + 0.04, a1 - 0.04);
      g.stroke();
    }
    // veg, row by row
    const rows = [
      { r: 78, kind: 'lettuce', step: 0.2 },
      { r: 96, kind: 'carrot', step: 0.13 },
      { r: 113, kind: 'cabbage', step: 0.17 },
    ];
    for (const row of rows) {
      for (let a = a0 + 0.12; a < a1 - 0.08; a += row.step * (100 / row.r)) {
        const x = GX + Math.cos(a) * row.r + rng.range(-1.5, 1.5);
        const y = GY + Math.sin(a) * row.r + rng.range(-1.5, 1.5);
        if (y > H + 4) continue;
        paintVeg(g, row.kind, x, y, rng);
      }
    }
    // tomatoes on canes at the two ends
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const a = -Math.PI / 2 + s * (1.62 - k * 0.16);
        paintVeg(g, 'tomato', GX + Math.cos(a) * 95, GY + Math.sin(a) * 95, rng);
      }
    }
    // patio stones
    const pat = g.createRadialGradient(GX, GY - 8, 6, GX, GY, bedIn - 4);
    pat.addColorStop(0, '#d9cdb6');
    pat.addColorStop(1, '#b9aa8f');
    g.fillStyle = pat;
    g.beginPath();
    g.arc(GX, GY, bedIn - 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(110,95,70,0.5)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(GX + Math.cos(a) * 22, GY + Math.sin(a) * 22);
      g.lineTo(GX + Math.cos(a) * (bedIn - 5), GY + Math.sin(a) * (bedIn - 5));
      g.stroke();
    }
    g.beginPath();
    g.arc(GX, GY, 22, 0, Math.PI * 2);
    g.stroke();

    // the outdoor tap on a little post at the bottom right, where the hose comes from
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(312, 616, 22, 26);
    g.fillStyle = '#8b6a48';
    g.fillRect(308, 612, 22, 30);
    g.fillStyle = '#a8865f';
    g.fillRect(308, 612, 22, 4);
    const brass = g.createLinearGradient(312, 614, 326, 626);
    brass.addColorStop(0, '#fff0b0');
    brass.addColorStop(1, '#b98a2a');
    g.fillStyle = brass;
    g.beginPath();
    g.arc(319, 622, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d33a2a';
    g.fillRect(313, 616, 12, 3);

    // side hedges
    for (const side of [0, 1]) {
      const x0 = side ? W - 14 : 0;
      const hg = g.createLinearGradient(x0, 0, x0 + 14, 0);
      hg.addColorStop(side ? 1 : 0, '#1f4a1c');
      hg.addColorStop(side ? 0 : 1, '#2f6a28');
      g.fillStyle = hg;
      g.fillRect(x0, 0, 14, H);
      for (let y = 0; y < H; y += 7) {
        const cx = side ? W - 14 + rng.range(-3, 2) : 14 + rng.range(-2, 3);
        g.fillStyle = rng.pick(['#2c6326', '#367530', '#24561f', '#3f8236']);
        g.beginPath();
        g.arc(cx, y, rng.range(5, 9), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(190,240,140,0.25)';
        g.beginPath();
        g.arc(cx + (side ? -2 : 2), y - 2, rng.range(1.5, 3), 0, Math.PI * 2);
        g.fill();
      }
    }

    // the white picket fence along the top, with flowers in front of it
    g.fillStyle = 'rgba(30,60,20,0.35)';
    g.fillRect(0, 34, W, 8);
    g.fillStyle = '#ece6d6';
    g.fillRect(0, 12, W, 5);
    g.fillRect(0, 26, W, 5);
    for (let x = 2; x < W; x += 13) {
      const pk = g.createLinearGradient(x, 0, x + 9, 0);
      pk.addColorStop(0, '#ffffff');
      pk.addColorStop(1, '#d3cbb8');
      g.fillStyle = pk;
      g.beginPath();
      g.moveTo(x, 38);
      g.lineTo(x, 5);
      g.lineTo(x + 4.5, 0);
      g.lineTo(x + 9, 5);
      g.lineTo(x + 9, 38);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(120,100,70,0.35)';
      g.fillRect(x + 7.5, 5, 1.5, 33);
    }
    for (let x = 16; x < W - 10; x += rng.range(6, 12)) {
      const y = rng.range(38, 50);
      g.fillStyle = 'rgba(40,100,30,0.9)';
      g.beginPath();
      g.arc(x, y, rng.range(3, 5), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rng.pick(['#ff6f91', '#ffd33d', '#b37bff', '#ff9f43', '#ffffff', '#ff5a5a']);
      g.beginPath();
      g.arc(x + rng.range(-2, 2), y - rng.range(1, 4), rng.range(1.8, 3), 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

function paintVeg(g, kind, x, y, rng) {
  if (kind === 'lettuce') {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng.range(0, 0.6);
      g.fillStyle = k % 2 ? '#8fd45a' : '#a8e46e';
      g.beginPath();
      g.ellipse(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 4.6, 3.2, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d6f7a4';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'carrot') {
    g.fillStyle = '#ff8a1f';
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#4fa83a';
    g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.45 + rng.range(-0.1, 0.1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
      g.stroke();
    }
  } else if (kind === 'cabbage') {
    const c = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 7);
    c.addColorStop(0, '#d8f0d0');
    c.addColorStop(0.5, '#86b98a');
    c.addColorStop(1, '#4d7f63');
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, 6.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(60,100,80,0.6)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(x, y, 4, 0.5, 2.6);
    g.stroke();
  } else if (kind === 'tomato') {
    g.fillStyle = '#3f7f2e';
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5aa33f';
    g.beginPath();
    g.arc(x - 2, y - 2, 5, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 4; k++) {
      const tx = x + rng.range(-5, 5);
      const ty = y + rng.range(-5, 5);
      g.fillStyle = '#e8352a';
      g.beginPath();
      g.arc(tx, ty, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,220,200,0.8)';
      g.beginPath();
      g.arc(tx - 0.8, ty - 0.8, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c9a26a';
    g.beginPath();
    g.arc(x, y, 1.6, 0, Math.PI * 2);
    g.fill();
  }
}

function paintShrub(rng, R) {
  const s = R * 2 + 12;
  return makeSprite(s, s, (g) => {
    const puffs = [];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rng.range(-0.2, 0.2);
      puffs.push([Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, R * rng.range(0.42, 0.55)]);
    }
    puffs.push([0, 0, R * 0.6]);
    g.fillStyle = '#1f4d1d';
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y, r + 1.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y, r] of puffs) {
      const lg = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
      lg.addColorStop(0, '#8ed160');
      lg.addColorStop(0.55, '#3f8a34');
      lg.addColorStop(1, '#265e22');
      g.fillStyle = lg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    // leaf flecks and a few pink blossoms
    for (let k = 0; k < 40; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R * 0.95);
      g.fillStyle = rng.chance(0.5) ? 'rgba(200,250,150,0.35)' : 'rgba(10,50,10,0.3)';
      g.beginPath();
      g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 2.2, 1.2, a, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 7; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(R * 0.2, R * 0.85);
      g.fillStyle = '#ff9ec4';
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff2a0';
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.7, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// all critters face up (-y) in their sprites; they're rotated to their heading when drawn
function paintRabbit(fur, dark) {
  return makeSprite(30, 46, (g) => {
    // tail
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 15, 4.5, 0, Math.PI * 2);
    g.fill();
    // body
    const b = g.createRadialGradient(-3, 0, 2, 0, 4, 14);
    b.addColorStop(0, fur);
    b.addColorStop(1, dark);
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 4, 9.5, 12, 0, 0, Math.PI * 2);
    g.fill();
    // haunches
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(-7, 9, 3.5, 6, 0.2, 0, Math.PI * 2);
    g.ellipse(7, 9, 3.5, 6, -0.2, 0, Math.PI * 2);
    g.fill();
    // ears, laid back along the body
    for (const s of [-1, 1]) {
      g.fillStyle = dark;
      g.beginPath();
      g.ellipse(s * 4, -3, 2.8, 9, s * 0.18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f2b7b0';
      g.beginPath();
      g.ellipse(s * 4, -3, 1.3, 6.5, s * 0.18, 0, Math.PI * 2);
      g.fill();
    }
    // head
    const h = g.createRadialGradient(-2, -14, 1, 0, -11, 8);
    h.addColorStop(0, fur);
    h.addColorStop(1, dark);
    g.fillStyle = h;
    g.beginPath();
    g.ellipse(0, -11, 6.5, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1210';
    g.beginPath();
    g.arc(-4.6, -12, 1.3, 0, Math.PI * 2);
    g.arc(4.6, -12, 1.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f08a96';
    g.beginPath();
    g.arc(0, -18, 1.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-2, -2, 3, 6, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintCrow(up) {
  return makeSprite(64, 44, (g) => {
    const span = up ? 30 : 22;
    const sweep = up ? -2 : 6;
    for (const s of [-1, 1]) {
      g.fillStyle = '#16141c';
      g.beginPath();
      g.moveTo(s * 4, -4);
      g.quadraticCurveTo(s * span * 0.6, -8 + sweep, s * span, 2 + sweep);
      g.lineTo(s * (span - 4), 6 + sweep);
      g.lineTo(s * (span - 9), 4 + sweep);
      g.lineTo(s * (span - 13), 8 + sweep);
      g.lineTo(s * (span - 18), 6 + sweep);
      g.quadraticCurveTo(s * 10, 6, s * 4, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(120,140,220,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(s * 6, -2);
      g.quadraticCurveTo(s * span * 0.6, -6 + sweep, s * (span - 2), 2 + sweep);
      g.stroke();
    }
    // tail fan
    g.fillStyle = '#1d1a24';
    g.beginPath();
    g.moveTo(-3, 8);
    g.lineTo(-7, 20);
    g.lineTo(7, 20);
    g.lineTo(3, 8);
    g.closePath();
    g.fill();
    // body and head
    const b = g.createLinearGradient(-6, 0, 6, 0);
    b.addColorStop(0, '#2a2733');
    b.addColorStop(0.5, '#3c3a4c');
    b.addColorStop(1, '#1b1922');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 1, 6, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, -11, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8e8a7c';
    g.beginPath();
    g.moveTo(-2, -15);
    g.lineTo(0, -21);
    g.lineTo(2, -15);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(-2.8, -12, 0.9, 0, Math.PI * 2);
    g.arc(2.8, -12, 0.9, 0, Math.PI * 2);
    g.fill();
  });
}

function paintSquirrel() {
  return makeSprite(30, 52, (g) => {
    // bushy tail curling behind
    const t = g.createLinearGradient(0, 6, 0, 26);
    t.addColorStop(0, '#d9692a');
    t.addColorStop(1, '#f2a35e');
    g.fillStyle = t;
    g.beginPath();
    g.moveTo(-4, 6);
    g.bezierCurveTo(-14, 14, 8, 18, -2, 25);
    g.bezierCurveTo(10, 28, 14, 14, 5, 6);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,220,180,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 8);
    g.bezierCurveTo(-6, 14, 8, 18, 1, 23);
    g.stroke();
    // body
    const b = g.createRadialGradient(-2, -2, 1, 0, 0, 10);
    b.addColorStop(0, '#e58a45');
    b.addColorStop(1, '#a24a1c');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 0, 6.5, 9.5, 0, 0, Math.PI * 2);
    g.fill();
    // head and ear tufts
    g.beginPath();
    g.ellipse(0, -11, 5, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a3412';
    g.beginPath();
    g.moveTo(-4.5, -14);
    g.lineTo(-3.5, -19);
    g.lineTo(-1.5, -14);
    g.moveTo(4.5, -14);
    g.lineTo(3.5, -19);
    g.lineTo(1.5, -14);
    g.fill();
    g.fillStyle = '#140c08';
    g.beginPath();
    g.arc(-3.3, -12, 1.1, 0, Math.PI * 2);
    g.arc(3.3, -12, 1.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,240,220,0.45)';
    g.beginPath();
    g.ellipse(0, -1, 2.5, 5, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintGopher() {
  return makeSprite(30, 38, (g) => {
    const b = g.createRadialGradient(-3, 0, 1, 0, 3, 13);
    b.addColorStop(0, '#c9a072');
    b.addColorStop(1, '#7c5530');
    g.fillStyle = b;
    g.beginPath();
    g.ellipse(0, 3, 10, 12.5, 0, 0, Math.PI * 2);
    g.fill();
    // chubby cheeks and head
    g.beginPath();
    g.ellipse(0, -9, 8.5, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c9a0';
    g.beginPath();
    g.ellipse(0, -13, 4.5, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(-1.8, -16.5, 1.6, 3);
    g.fillRect(0.2, -16.5, 1.6, 3);
    g.fillStyle = '#2a170c';
    g.beginPath();
    g.arc(-0, -16, 1.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(-4.8, -10.5, 1.3, 0, Math.PI * 2);
    g.arc(4.8, -10.5, 1.3, 0, Math.PI * 2);
    g.fill();
    // little digging claws
    g.fillStyle = '#5a3a1e';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 8.5, -3, 2.5, 3.5, s * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.ellipse(-3, -1, 3, 6, 0.1, 0, Math.PI * 2);
    g.fill();
  });
}

function paintMound(rng) {
  return makeSprite(44, 34, (g) => {
    const m = g.createRadialGradient(-4, -5, 2, 0, 0, 18);
    m.addColorStop(0, '#9b6a3e');
    m.addColorStop(0.7, '#6b4426');
    m.addColorStop(1, 'rgba(80,50,25,0)');
    g.fillStyle = m;
    g.beginPath();
    g.ellipse(0, 0, 19, 14, 0, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 16; k++) {
      g.fillStyle = rng.chance(0.5) ? '#5a371c' : '#a87848';
      g.beginPath();
      g.arc(rng.range(-14, 14), rng.range(-9, 9), rng.range(1, 2.6), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#2a170a';
    g.beginPath();
    g.ellipse(0, 0, 6, 4.5, 0, 0, Math.PI * 2);
    g.fill();
  });
}

function paintGardener() {
  return makeSprite(60, 60, (g) => {
    // arms reaching forward to the nozzle
    for (const s of [-1, 1]) {
      g.strokeStyle = '#2f5fa8';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s * 11, -1);
      g.quadraticCurveTo(s * 9, -12, s * 2.5, -17);
      g.stroke();
      g.fillStyle = '#f0c193';
      g.beginPath();
      g.arc(s * 2.5, -18, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    // the brass nozzle
    const n = g.createLinearGradient(-2, 0, 2, 0);
    n.addColorStop(0, '#fff2b8');
    n.addColorStop(1, '#a8781e');
    g.fillStyle = n;
    g.fillRect(-2, -28, 4, 10);
    g.fillStyle = '#d33a2a';
    g.fillRect(-3, -20, 6, 3);
    // shoulders: blue dungarees over a red check shirt
    const sh = g.createLinearGradient(-15, 0, 15, 0);
    sh.addColorStop(0, '#b8322a');
    sh.addColorStop(0.5, '#e05343');
    sh.addColorStop(1, '#a52b24');
    g.fillStyle = sh;
    g.beginPath();
    g.ellipse(0, 2, 15, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f5fa8';
    g.fillRect(-8, -3, 4, 12);
    g.fillRect(4, -3, 4, 12);
    // big straw sun hat
    const h = g.createRadialGradient(-3, -3, 2, 0, 1, 15);
    h.addColorStop(0, '#fff1b8');
    h.addColorStop(0.7, '#e8c46a');
    h.addColorStop(1, '#b98d3a');
    g.fillStyle = h;
    g.beginPath();
    g.arc(0, 1, 15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(140,100,40,0.45)';
    g.lineWidth = 0.8;
    for (let r = 4; r < 15; r += 2.2) {
      g.beginPath();
      g.arc(0, 1, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = '#d6453a';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(0, 1, 8.5, 0, Math.PI * 2);
    g.stroke();
    const c = g.createRadialGradient(-2, -2, 1, 0, 1, 8);
    c.addColorStop(0, '#fff8d4');
    c.addColorStop(1, '#e2bd62');
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 1, 7, 0, Math.PI * 2);
    g.fill();
  });
}

// ---------- the game ----------

export default {
  id: 'hose',
  title: 'Hose Down!',
  emoji: '💦',
  tagline: 'Swing the hose and soak every critter before it reaches your veg.',
  colors: { bg: '#3f7a32', fg: '#fffbe8', accent: '#5fd0ff' },

  // Bluegrass hoedown stomp, 144 BPM, G major over G – C – G – D: from bar one a stomping kick on one
  // and three, a brushed "train beat" snare, a boom-chick root–fifth bass with its filter opening over
  // the minute, offbeat guitar chops and a rolling square-wave banjo; then hand claps and a sawtooth
  // fiddle reel; then a shaker, a harmonica-like square pad and the fiddle doubled an octave up; and a
  // four-on-the-floor finale with offbeat hats, a walking bass and a low fiddle line. 36 bars = 60s.
  music: {
    cps: 144 / 240,
    setup: `
      const kick = note("g2 ~ g2 ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick4 = note("g2*4").s("sine").decay(0.18).sustain(0).gain(0.8)
      const train = s("white*8").decay(0.05).sustain(0).hpf(2200).lpf(6500).gain("[0.03 0.02 0.11 0.02]*2")
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1300).lpf(5000).gain(0.12).room(0.25)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.016 0.03 0.02 0.034]*4")
      const open = s("[~ white]*4").decay(0.1).sustain(0).hpf(7000).gain(0.03)
      const bass = note("<[g2 ~ d3 ~] [c3 ~ g2 ~] [g2 ~ d3 ~] [d3 ~ a2 ~]>")
        .s("sawtooth").decay(0.22).sustain(0.15).release(0.05).lpf(saw.range(450, 1300).slow(36)).gain(0.38)
      const walk = note("<[g2 b2 d3 e3] [c3 e3 g3 e3] [g2 b2 d3 b2] [d3 f#3 a3 c3]>")
        .s("sawtooth").decay(0.18).sustain(0.2).release(0.05).lpf(saw.range(600, 1400).slow(36)).gain(0.32)
      const chords = "<[g3,b3,d4] [c4,e4,g4] [g3,b3,d4] [d4,f#4,a4]>"
      const chop = note(chords).struct("~ x ~ x").s("square").decay(0.07).sustain(0).lpf(2200).gain(0.06).pan(0.4)
      const banjo = note("<[g4 b4 d5 g4 b4 d5 g5 d5] [g4 c5 e5 g4 c5 e5 g5 e5] [g4 b4 d5 g4 b4 d5 g5 b4] [f#4 a4 d5 f#4 a4 d5 f#5 a4]>")
        .s("square").decay(0.09).sustain(0).lpf(saw.range(1800, 3600).slow(36)).gain(0.055).pan(0.62)
      const tune = "<[d5 e5 g5 a5 b5 a5 g5 e5] [g5 ~ e5 g5 c6 b5 a5 g5] [b5 a5 g5 e5 d5 e5 g5 ~] [a5 b5 a5 f#5 d5 ~ e5 f#5] [g5 a5 b5 d6 b5 a5 g5 a5] [c6 b5 a5 g5 e5 g5 a5 ~] [b5 d6 b5 a5 g5 e5 d5 e5] [f#5 a5 d5 f#5 g5 ~ ~ ~]>"
      const fiddle = note(tune).s("sawtooth").attack(0.015).decay(0.12).sustain(0.4).release(0.06)
        .lpf(2400).vib(5.5).vibmod(0.12).gain(0.06).room(0.2).pan(0.55)
      const high = note(tune).add(note(12)).s("triangle").attack(0.01).decay(0.1).sustain(0.3).release(0.05)
        .lpf(3800).gain(0.035).pan(0.7)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.12).sustain(0.3).release(0.05).lpf(1500).gain(0.05).pan(0.38)
      const harp = note(chords).s("square").attack(0.05).decay(0.3).sustain(0.5).release(0.1).lpf(1300).vib(4).vibmod(0.08)
        .struct("x ~ x x").gain(0.04).pan(0.45)
    `,
    song: `arrange(
      [8, stack(kick, train, bass, chop, banjo)],
      [8, stack(kick, train, clap, bass, chop, banjo, fiddle)],
      [10, stack(kick, train, clap, shaker, bass, chop, banjo, fiddle, high, harp)],
      [10, stack(kick4, train, clap, shaker, open, walk, chop, banjo, fiddle, high, low, harp)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- shrubs in the lawn (they stop the jet) ----
    const shrubs = [
      { x: plan.range(78, 112), y: plan.range(270, 330), R: 23 },
      { x: plan.range(248, 282), y: plan.range(210, 270), R: 23 },
    ];
    if (plan.chance(0.5)) {
      for (const s of shrubs) s.x = W - s.x;
    }

    // ---- the critters, all planned up front ----
    const segClear = (ax, ay, bx, by, pad) => {
      for (const s of shrubs) {
        const dx = bx - ax;
        const dy = by - ay;
        const L2 = dx * dx + dy * dy || 1;
        const u = clamp(((s.x - ax) * dx + (s.y - ay) * dy) / L2, 0, 1);
        const px = ax + dx * u - s.x;
        const py = ay + dy * u - s.y;
        if (px * px + py * py < (s.R + pad) * (s.R + pad)) return false;
      }
      return true;
    };
    const pathClear = (pts, pad) => {
      for (let i = 1; i < pts.length; i++) if (!segClear(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pad)) return false;
      return true;
    };
    const ringPoint = (b) => [GX + Math.sin(b) * R_PATCH, GY - Math.cos(b) * R_PATCH];

    const critters = [];
    let side = plan.chance(0.5) ? 1 : -1;
    const makeCritter = (type, at) => {
      const p = progress(at, 60, 1.15);
      for (let tries = 0; tries < 24; tries++) {
        let pts;
        let entry;
        let speed;
        const c = { type, at, soak: 0, state: 'wait', r: TYPES[type].r, need: TYPES[type].need, frame: Math.random() * 10 };
        side = plan.chance(0.6) ? -side : side;
        if (type === 'crow') {
          const x0 = side < 0 ? plan.range(-20, 140) : plan.range(220, 380);
          const start = [x0, -30];
          const tb = clamp(bearingOf(x0, 120) + plan.range(-0.5, 0.5), -1.2, 1.2);
          const end = ringPoint(tb);
          const mid = [lerp(start[0], end[0], 0.5) + plan.range(-50, 50), lerp(start[1], end[1], 0.5)];
          pts = [start, mid, end];
          entry = [clamp(x0, 12, W - 12), 6];
          speed = lerp(95, 160, p);
        } else if (type === 'gopher') {
          const b = plan.range(-1.0, 1.0);
          const d = plan.range(255, 330);
          const start = [GX + Math.sin(b) * d, GY - Math.cos(b) * d];
          if (start[0] < 30 || start[0] > W - 30 || start[1] < 70) continue;
          const end = ringPoint(clamp(b + plan.range(-0.35, 0.35), -1.25, 1.25));
          pts = [start, end];
          entry = start;
          speed = lerp(40, 62, p);
        } else {
          const fromTop = plan.chance(0.55);
          let start;
          if (fromTop) {
            start = [side < 0 ? plan.range(28, 170) : plan.range(190, 332), 30];
            entry = [start[0], 34];
          } else {
            start = [side < 0 ? 8 : W - 8, plan.range(100, 320)];
            entry = start;
          }
          const sb = bearingOf(start[0], start[1]);
          const end = ringPoint(clamp(sb * 1.6 + plan.range(-0.4, 0.4), -1.25, 1.25));
          if (type === 'squirrel') {
            // zigzag: a few waypoints swinging either side of the straight line
            pts = [start];
            const n = 4;
            let zig = plan.chance(0.5) ? 1 : -1;
            for (let k = 1; k < n; k++) {
              const u = k / n;
              const x = lerp(start[0], end[0], u);
              const y = lerp(start[1], end[1], u);
              const dx = end[0] - start[0];
              const dy = end[1] - start[1];
              const L = Math.hypot(dx, dy) || 1;
              const off = zig * plan.range(30, 55);
              pts.push([clamp(x + (-dy / L) * off, 22, W - 22), y + (dx / L) * off]);
              zig = -zig;
            }
            pts.push(end);
            speed = lerp(62, 105, p);
          } else {
            pts = [start, end];
            speed = lerp(36, 78, p);
          }
        }
        if (!pathClear(pts, type === 'crow' ? -100 : 14)) continue;
        // lengths along the path
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        c.pts = pts;
        c.cum = cum;
        c.len = cum[cum.length - 1];
        c.speed = speed;
        c.entry = entry;
        if (type === 'rabbit') {
          c.period = lerp(0.6, 0.46, p);
          c.hop = c.period * 0.55;
        } else if (type === 'squirrel') {
          c.period = lerp(0.62, 0.5, p);
          c.hop = c.period * 0.6;
        }
        c.coat = art.pick([
          ['#b8a089', '#6f5a48'],
          ['#a9a29a', '#5f5852'],
          ['#d2b48c', '#8a6a44'],
        ]);
        c.x = pts[0][0];
        c.y = pts[0][1];
        c.hd = Math.atan2(pts[1][0] - pts[0][0], -(pts[1][1] - pts[0][1]));
        return c;
      }
      return null;
    };

    const interval = (t) => lerp(1.9, 0.47, progress(t, 60, 1.1));
    {
      let t = 0.4;
      while (t < 64) {
        const pool = ['rabbit', 'rabbit'];
        if (t > 11) pool.push('crow', 'crow');
        if (t > 21) pool.push('squirrel', 'squirrel');
        if (t > 33) pool.push('gopher', 'gopher');
        let type = plan.pick(pool);
        if (t > 11 && t < 13) type = 'crow';
        if (t > 21 && t < 23) type = 'squirrel';
        if (t > 33 && t < 35) type = 'gopher';
        const c = makeCritter(type, t);
        if (c) critters.push(c);
        // from 26s, a second critter sometimes comes in at the same moment on the other side
        if (t > 26 && plan.chance(lerp(0.15, 0.4, (t - 26) / 34))) {
          side = -side;
          const c2 = makeCritter(plan.pick(pool), t + 0.15);
          if (c2) critters.push(c2);
        }
        t += interval(t) * plan.range(0.8, 1.2);
      }
    }

    // distance travelled along the path after `age` seconds of moving
    const travelled = (c, age) => {
      if (c.type === 'rabbit' || c.type === 'squirrel') {
        const step = c.speed * c.period;
        const k = Math.floor(age / c.period);
        const f = clamp((age - k * c.period) / c.hop, 0, 1);
        return k * step + step * ease(f);
      }
      return age * c.speed;
    };
    const place = (c, d) => {
      d = Math.min(d, c.len);
      let i = 1;
      while (i < c.cum.length - 1 && c.cum[i] < d) i++;
      const a = c.pts[i - 1];
      const b = c.pts[i];
      const seg = c.cum[i] - c.cum[i - 1] || 1;
      const u = (d - c.cum[i - 1]) / seg;
      c.x = lerp(a[0], b[0], u);
      c.y = lerp(a[1], b[1], u);
      const hd = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
      c.hd += angDiff(hd, c.hd) * 0.25;
    };

    // ---- art ----
    const garden = paintGarden(W, H, art);
    const shrubSpr = shrubs.map((s) => paintShrub(art, s.R));
    const rabbitSprs = [
      paintRabbit('#b8a089', '#6f5a48'),
      paintRabbit('#a9a29a', '#5f5852'),
      paintRabbit('#d2b48c', '#8a6a44'),
    ];
    const coatIdx = (c) => (c.coat[0] === '#b8a089' ? 0 : c.coat[0] === '#a9a29a' ? 1 : 2);
    const crowUp = paintCrow(true);
    const crowDown = paintCrow(false);
    const squirrelSpr = paintSquirrel();
    const gopherSpr = paintGopher();
    const moundSpr = paintMound(art);
    const gardenerSpr = paintGardener();
    const sunGlow = glowSprite('rgba(255,236,170,1)', 160);
    const waterGlow = glowSprite('rgba(150,220,255,1)', 24);
    const redGlow = glowSprite('rgba(255,70,50,1)', 24);
    const vignette = vignetteSprite(W, H, 0.42, '20,40,10');
    const spray = createParticles();
    const fx = createParticles();
    const leaves = createParticles();

    // cosmetic butterflies
    const flies = [];
    for (let i = 0; i < 3; i++) {
      flies.push({ x: Math.random() * W, y: 80 + Math.random() * 300, a: Math.random() * 6, v: 26 + Math.random() * 16, ph: Math.random() * 6, col: ['#ffffff', '#ffd33d', '#9fd4ff'][i] });
    }

    const aim = createMover({ x: 0, minX: -MAX_AIM, maxX: MAX_AIM, speed: AIM_SPEED, accel: 15 });
    let next = 0; // next critter in the plan to bring on
    const live = [];
    let clock = 0;
    let jetLen = REACH;
    let jetHit = null; // what the jet is splashing on: 'shrub' | 'ground'
    let killer = null;

    const jetLength = (theta) => {
      const ux = Math.sin(theta);
      const uy = -Math.cos(theta);
      let best = REACH;
      jetHit = 'ground';
      for (const s of shrubs) {
        const cx = s.x - GX;
        const cy = s.y - GY;
        const t = cx * ux + cy * uy;
        if (t <= 0) continue;
        const px = cx - ux * t;
        const py = cy - uy * t;
        const d2 = px * px + py * py;
        const R = s.R - 3;
        if (d2 < R * R) {
          const hit = t - Math.sqrt(R * R - d2);
          if (hit < best) {
            best = hit;
            jetHit = 'shrub';
          }
        }
      }
      // the jet also runs out at the edge of the screen
      const tx = ux > 0 ? (W - GX) / ux : ux < 0 ? -GX / ux : Infinity;
      const ty = uy < 0 ? -GY / uy : Infinity;
      const edge = Math.min(tx, ty) + 20;
      if (edge < best) {
        best = edge;
        jetHit = 'edge';
      }
      return best;
    };

    const timeLeft = (c) => {
      // rough seconds until this critter reaches the veg (for warnings)
      if (c.state === 'mound') return MOUND - c.age + (c.len / c.speed);
      return Math.max(0, (c.len - c.dist) / c.speed);
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      spray.update(dt);
      fx.update(dt);
      leaves.update(dt);
      for (const f of flies) {
        f.a += (Math.random() - 0.5) * 3 * dt;
        f.x += Math.cos(f.a) * f.v * dt;
        f.y += Math.sin(f.a) * f.v * dt;
        if (f.x < 20 || f.x > W - 20) f.a = Math.PI - f.a;
        if (f.y < 50 || f.y > 420) f.a = -f.a;
        f.x = clamp(f.x, 20, W - 20);
        f.y = clamp(f.y, 50, 420);
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const c = live[i];
        if (c.state !== 'flee') continue;
        c.age += dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.type === 'crow') c.vy -= 120 * dt;
        if (Math.random() < 0.3) fx.burst(c.x, c.y, { count: 1, speed: 40, life: 0.4, size: 2.5, round: true, colors: ['#bfe8ff', '#ffffff'] });
        if (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) live.splice(i, 1);
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { live, aim, timeLeft },

      update(dt, dir, t) {
        updateCosmetic(dt);
        aim.update(dt, dir);
        const theta = aim.x;
        jetLen = jetLength(theta);

        // bring on the critters whose time has come (their entry is telegraphed WARN seconds before)
        while (next < critters.length && critters[next].at - WARN <= t) {
          const c = critters[next++];
          c.state = c.type === 'gopher' ? 'mound' : 'warn';
          c.age = 0;
          c.dist = 0;
          live.push(c);
        }

        const ux = Math.sin(theta);
        const uy = -Math.cos(theta);
        for (const c of live) {
          if (c.state === 'flee') continue;
          c.frame += dt;
          if (c.state === 'warn') {
            if (t >= c.at) {
              c.state = 'go';
              c.age = 0;
            } else {
              if (Math.random() < 0.25) leaves.burst(c.entry[0], c.entry[1], { count: 1, speed: 50, life: 0.5, size: 3, colors: ['#3f8236', '#8ed160', '#2c6326'], gravity: 60 });
              continue;
            }
          }
          c.age += dt;
          if (c.state === 'mound') {
            if (Math.random() < 0.35) fx.burst(c.x, c.y, { count: 1, speed: 50, life: 0.45, size: 2.6, colors: ['#6b4426', '#9b6a3e'], gravity: 160, angle: -Math.PI / 2, spread: 2 });
            if (c.age >= MOUND) {
              c.state = 'go';
              c.age = 0;
              fx.burst(c.x, c.y, { count: 14, speed: 90, life: 0.5, size: 3, colors: ['#6b4426', '#9b6a3e', '#5a371c'], gravity: 200 });
            }
            continue;
          }
          // moving
          c.dist = travelled(c, c.age);
          place(c, c.dist);
          // the jet
          const dx = c.x - GX;
          const dy = c.y - GY;
          const d = Math.hypot(dx, dy);
          const along = dx * ux + dy * uy;
          const perp = Math.abs(dx * uy - dy * ux);
          const inJet = along > 0 && along < jetLen + c.r * 0.6 && perp < c.r + along * HALF;
          if (inJet) {
            c.soak += dt / c.need;
            c.wet = 0.15;
            if (Math.random() < 0.5) spray.burst(c.x, c.y, { count: 2, speed: 90, life: 0.35, size: 2.6, round: true, colors: ['#e6f7ff', '#9fdcff', '#ffffff'], angle: Math.atan2(uy, ux), spread: 2.2 });
            if (c.soak >= 1) {
              c.state = 'flee';
              c.age = 0;
              const k = c.type === 'crow' ? 260 : 230;
              const ax = dx / (d || 1);
              const ay = dy / (d || 1);
              c.vx = ax * k + ux * 60;
              c.vy = ay * k + uy * 60;
              c.hd = Math.atan2(c.vx, -c.vy);
              fx.burst(c.x, c.y, { count: 16, speed: 140, life: 0.6, size: 3, round: true, drag: 2, colors: ['#ffffff', '#bfe8ff', '#7fd0ff'] });
              continue;
            }
          } else {
            c.wet = Math.max(0, (c.wet || 0) - dt);
          }
          if (c.dist >= c.len && !this.dead) {
            this.dead = true;
            this.deathReason = TYPES[c.type].reason;
            killer = c;
            leaves.burst(c.x, c.y, { count: 26, speed: 120, life: 0.9, size: 3.5, colors: ['#8fd45a', '#a8e46e', '#ff8a1f', '#4fa83a'], gravity: 120, drag: 1 });
          }
        }

        // water spray along the jet and a mist where it lands (cosmetic)
        const n = 3;
        for (let k = 0; k < n; k++) {
          const u = Math.random();
          const along = 26 + u * (jetLen - 26);
          spray.burst(GX + ux * along, GY + uy * along, { count: 1, speed: 25, life: 0.3, size: 2, round: true, colors: ['#e6f7ff', '#bfe8ff'] });
        }
        if (jetHit !== 'edge') {
          spray.burst(GX + ux * jetLen, GY + uy * jetLen, { count: 2, speed: 80, life: 0.45, size: 2.6, round: true, drag: 2, colors: jetHit === 'shrub' ? ['#e6f7ff', '#8ed160'] : ['#e6f7ff', '#bfe8ff', '#ffffff'] });
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (killer && Math.random() < 0.4) leaves.burst(killer.x, killer.y, { count: 1, speed: 60, life: 0.6, size: 3, colors: ['#8fd45a', '#ff8a1f'], gravity: 100 });
      },

      render(g) {
        g.drawImage(garden.canvas, 0, 0, W, H);

        // shrub shadows
        g.fillStyle = 'rgba(15,40,10,0.28)';
        for (const s of shrubs) {
          g.beginPath();
          g.ellipse(s.x + 6, s.y + 8, s.R + 2, s.R * 0.9, 0, 0, Math.PI * 2);
          g.fill();
        }

        // entry rustles and molehills
        for (const c of live) {
          if (c.state === 'warn') {
            const k = 1 - (c.at - clock) / WARN;
            const pulse = 0.5 + 0.5 * Math.sin(clock * 18);
            g.fillStyle = `rgba(255,236,120,${0.35 + 0.4 * pulse})`;
            const [ex, ey] = c.entry;
            const ang = Math.atan2(GX - ex, -(GY - ey));
            g.save();
            g.translate(ex, ey);
            g.rotate(ang);
            g.beginPath();
            g.moveTo(0, -4 - 8 * k);
            g.lineTo(7, 6 - 8 * k);
            g.lineTo(-7, 6 - 8 * k);
            g.closePath();
            g.fill();
            g.restore();
          } else if (c.state === 'mound') {
            const k = clamp(c.age / MOUND, 0, 1);
            const shake = Math.sin(clock * 40) * 1.5 * k;
            drawSprite(g, moundSpr, c.x + shake, c.y, { size: 24 + 20 * k });
          }
        }
        // spent molehills stay as holes
        for (const c of live) {
          if (c.type === 'gopher' && c.state !== 'mound') drawSprite(g, moundSpr, c.pts[0][0], c.pts[0][1], { size: 38, alpha: 0.85 });
        }

        // ground critters
        const drawCritter = (c) => {
          const shiver = c.wet > 0 ? (Math.random() - 0.5) * 2.4 : 0;
          let x = c.x + shiver;
          let y = c.y;
          if (c.type === 'rabbit') {
            const ph = c.state === 'go' ? ((c.age % c.period) / c.hop) : 1;
            const lift = ph < 1 ? Math.sin(ph * Math.PI) * 5 : 0;
            g.fillStyle = 'rgba(20,50,10,0.3)';
            g.beginPath();
            g.ellipse(x + 3, y + 4, 9, 11, 0, 0, Math.PI * 2);
            g.fill();
            drawSprite(g, rabbitSprs[coatIdx(c)], x, y - lift, { rot: c.hd, size: 30 + lift * 0.8 });
          } else if (c.type === 'squirrel') {
            g.fillStyle = 'rgba(20,50,10,0.3)';
            g.beginPath();
            g.ellipse(x + 3, y + 4, 7, 10, 0, 0, Math.PI * 2);
            g.fill();
            drawSprite(g, squirrelSpr, x, y, { rot: c.hd, size: 28 });
          } else if (c.type === 'gopher') {
            g.fillStyle = 'rgba(20,50,10,0.3)';
            g.beginPath();
            g.ellipse(x + 3, y + 4, 9, 10, 0, 0, Math.PI * 2);
            g.fill();
            drawSprite(g, gopherSpr, x, y + Math.sin(c.frame * 22) * 0.8, { rot: c.hd, size: 27 });
          }
        };
        for (const c of live) {
          if (c.type === 'crow' || c.state === 'warn' || c.state === 'mound') continue;
          drawCritter(c);
        }

        // shrubs on top of the ground layer
        shrubs.forEach((s, i) => drawSprite(g, shrubSpr[i], s.x, s.y, { size: (s.R * 2 + 12) * (1 + 0.02 * Math.sin(clock * 2 + i)) }));

        // the hose from the tap to the gardener's back
        const theta = aim.x;
        const ux = Math.sin(theta);
        const uy = -Math.cos(theta);
        const bx = GX - ux * 12;
        const by = GY - uy * 12;
        g.strokeStyle = '#1d5e2a';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(320, 628);
        g.bezierCurveTo(280, 650, 230, 606, bx + 10, by + 22);
        g.quadraticCurveTo(bx, by + 6, bx, by);
        g.stroke();
        g.strokeStyle = '#3fa356';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(320, 627);
        g.bezierCurveTo(280, 648, 230, 604, bx + 10, by + 21);
        g.quadraticCurveTo(bx, by + 5, bx, by);
        g.stroke();

        // the jet of water
        const nx = GX + ux * 27;
        const ny = GY + uy * 27;
        const ex = GX + ux * jetLen;
        const ey = GY + uy * jetLen;
        const px = -uy;
        const py = ux;
        const spreadEnd = Math.min(24, jetLen * HALF * 0.8);
        g.globalCompositeOperation = 'lighter';
        const jg = g.createLinearGradient(nx, ny, ex, ey);
        jg.addColorStop(0, 'rgba(170,225,255,0.45)');
        jg.addColorStop(1, 'rgba(150,215,255,0.18)');
        g.fillStyle = jg;
        g.beginPath();
        g.moveTo(nx + px * 2, ny + py * 2);
        g.lineTo(ex + px * spreadEnd, ey + py * spreadEnd);
        g.lineTo(ex - px * spreadEnd, ey - py * spreadEnd);
        g.lineTo(nx - px * 2, ny - py * 2);
        g.closePath();
        g.fill();
        g.globalCompositeOperation = 'source-over';
        // the bright core of the stream, wobbling a little
        g.strokeStyle = 'rgba(235,250,255,0.85)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(nx, ny);
        for (let k = 1; k <= 8; k++) {
          const u = k / 8;
          const w = Math.sin(clock * 30 + k * 1.7) * 1.4 * u;
          g.lineTo(lerp(nx, ex, u) + px * w, lerp(ny, ey, u) + py * w);
        }
        g.stroke();
        if (jetHit !== 'edge') {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, waterGlow, ex, ey, { size: 40 + Math.sin(clock * 25) * 4, alpha: 0.5 });
          // a little rainbow in the mist
          const bands = ['rgba(255,90,90,0.13)', 'rgba(255,200,80,0.13)', 'rgba(120,230,120,0.12)', 'rgba(90,160,255,0.12)', 'rgba(170,110,240,0.11)'];
          g.lineWidth = 2;
          bands.forEach((col, i) => {
            g.strokeStyle = col;
            g.beginPath();
            g.arc(ex, ey + 6, 22 - i * 2, Math.PI * 1.1, Math.PI * 1.9);
            g.stroke();
          });
          g.globalCompositeOperation = 'source-over';
        }

        // the gardener
        g.fillStyle = 'rgba(20,40,10,0.3)';
        g.beginPath();
        g.ellipse(GX + 4, GY + 5, 17, 15, 0, 0, Math.PI * 2);
        g.fill();
        drawSprite(g, gardenerSpr, GX, GY, { rot: theta });

        spray.render(g);
        fx.render(g);

        // butterflies
        for (const f of flies) {
          const flap = Math.abs(Math.sin(clock * 16 + f.ph));
          g.fillStyle = f.col;
          g.beginPath();
          g.ellipse(f.x - 2.5 * flap, f.y, 2.6 * flap + 0.4, 2.2, 0, 0, Math.PI * 2);
          g.ellipse(f.x + 2.5 * flap, f.y, 2.6 * flap + 0.4, 2.2, 0, 0, Math.PI * 2);
          g.fill();
        }

        // crows fly above everything, with their shadows on the lawn
        for (const c of live) {
          if (c.type !== 'crow' || c.state === 'warn') continue;
          const alt = c.state === 'flee' ? 30 + c.age * 60 : 24 * clamp((c.len - c.dist) / 120, 0.15, 1);
          g.fillStyle = 'rgba(15,35,10,0.28)';
          g.beginPath();
          g.ellipse(c.x + alt * 0.5, c.y + alt * 0.8, 13, 9, 0, 0, Math.PI * 2);
          g.fill();
          const up = Math.sin(c.frame * (c.state === 'flee' ? 26 : 16)) > 0;
          const shiver = c.wet > 0 ? (Math.random() - 0.5) * 2.4 : 0;
          drawSprite(g, up ? crowUp : crowDown, c.x + shiver, c.y, { rot: c.hd, size: 52 });
        }

        // fleeing critters (ground ones draw here too, so they run over the shrubs' edges)
        for (const c of live) {
          if (c.state !== 'flee' || c.type === 'crow') continue;
          drawCritter(c);
        }

        // soak rings, and red warnings on whoever's about to reach the veg
        for (const c of live) {
          if (c.state !== 'go') continue;
          const tl = timeLeft(c);
          const rr = c.r + 7;
          if (tl < 1.4) {
            const pulse = 0.5 + 0.5 * Math.sin(clock * 20);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, c.x, c.y, { size: rr * 3.2, alpha: 0.35 + 0.35 * pulse });
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = `rgba(255,70,60,${0.6 + 0.4 * pulse})`;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(c.x, c.y, rr + 2, 0, Math.PI * 2);
            g.stroke();
          }
          if (c.soak > 0) {
            g.strokeStyle = 'rgba(255,255,255,0.35)';
            g.lineWidth = 3.5;
            g.beginPath();
            g.arc(c.x, c.y, rr, 0, Math.PI * 2);
            g.stroke();
            g.strokeStyle = '#5fd0ff';
            g.beginPath();
            g.arc(c.x, c.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(c.soak, 0, 1));
            g.stroke();
          }
        }

        leaves.render(g);

        // warm sunlight from the top left
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 20, 10, { size: 420, alpha: 0.22 });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
