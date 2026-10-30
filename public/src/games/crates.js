// Crate Escape — a stormy evening on the docks. A gantry crane is unloading a cargo ship in a
// hurry, dropping crates all over the quay, and the tide is coming in fast. The ship's cat (in a
// little yellow sou'wester) has to stay dry: climb the growing pile one crate at a time (a cat can
// hop up one crate, never two), keep out from under every crate coming down, and stay above the
// rising water. Every drop is announced: the crate hangs from the crane over its column and a
// marker shows the exact slot it will land in, with red hazard stripes down its whole path that
// flash hard (and a "!" over the cat) whenever the cat stands in it. The whole pile is planned up
// front from the rng (crates mostly fill the lowest columns), so it's the same quay for everyone,
// and the water follows the pile's average height a few seconds late, so the low spots flood.

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

const N = 9; // columns of crates across the quay
const CW = 40; // a crate's size
const PY = 540; // where the camera keeps the cat's feet
const PW = 10; // the cat's half-width for standing and walls
const HW = 7; // its half-width for being hit
const PH = 24; // its height for being hit
const SPEED = 180;
const ACCEL = 16;
const CAT_G = 1900;
const G = 2400; // crates fall faster than the cat
const DROP = 420; // crates hang this far above the slot they'll land in
const FALL = Math.sqrt((2 * DROP) / G);
const CHEST = 15; // water this far up the cat is the end
const BEAM = 22; // the crane's girder across the top of the screen

const KINDS = ['wood', 'fragile', 'red', 'teal', 'banana', 'fish'];
const DUST = ['#b9a58a', '#8f7c66', '#d8c8ae', '#6f604f'];
const SPLASH = ['#e8fbff', '#b6e6f2', '#7cc6dc', '#ffffff'];
const FUR = ['#ff9a3c', '#ffc27a', '#ffffff', '#ffd23a'];

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sg = g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, '#111a30');
    sg.addColorStop(0.35, '#26365a');
    sg.addColorStop(0.52, '#4d4f72');
    sg.addColorStop(0.6, '#a8676a');
    sg.addColorStop(0.66, '#e79a5c');
    sg.addColorStop(0.72, '#5d4a62');
    sg.addColorStop(1, '#1b2238');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    // heavy storm clouds, lit from below by the sunset
    for (let i = 0; i < 46; i++) {
      const x = rng.range(-40, W + 40);
      const y = rng.range(10, H * 0.55);
      const r = rng.range(30, 80);
      const cg = g.createRadialGradient(x, y - r * 0.2, 2, x, y, r);
      const lit = y > H * 0.38;
      cg.addColorStop(0, lit ? 'rgba(120,96,120,0.5)' : 'rgba(46,58,92,0.55)');
      cg.addColorStop(0.7, lit ? 'rgba(80,70,100,0.25)' : 'rgba(30,40,70,0.3)');
      cg.addColorStop(1, 'rgba(30,40,70,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    // warm rims along the lowest cloud bank
    for (let i = 0; i < 18; i++) {
      const x = rng.range(0, W);
      const y = rng.range(H * 0.5, H * 0.58);
      g.strokeStyle = 'rgba(255,170,110,0.25)';
      g.lineWidth = rng.range(1, 2.5);
      g.beginPath();
      g.ellipse(x, y, rng.range(30, 70), rng.range(5, 10), 0, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  }, 1);
}

// the far harbour: container cranes, warehouses, a lighthouse on the point and the open sea
function paintSkyline(W, rng) {
  const h = 170;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2);
    const sea = h - 46;
    // distant headland
    g.fillStyle = '#2a2a44';
    g.beginPath();
    g.moveTo(W * 0.55, sea);
    g.quadraticCurveTo(W * 0.78, sea - 26, W + 10, sea - 30);
    g.lineTo(W + 10, sea);
    g.closePath();
    g.fill();
    // lighthouse
    const lx = W * 0.86;
    const ly = sea - 30;
    g.fillStyle = '#e8e0d6';
    g.beginPath();
    g.moveTo(lx - 5, ly);
    g.lineTo(lx - 3.5, ly - 34);
    g.lineTo(lx + 3.5, ly - 34);
    g.lineTo(lx + 5, ly);
    g.closePath();
    g.fill();
    g.fillStyle = '#c4423a';
    for (const y of [-8, -20]) g.fillRect(lx - 4.6 - y * 0.02, ly + y - 5, 9.2 + y * 0.04, 5);
    g.fillStyle = '#1e1e30';
    g.fillRect(lx - 4.5, ly - 37, 9, 3);
    g.fillStyle = '#fff4c0';
    g.fillRect(lx - 3, ly - 43, 6, 6);
    g.fillStyle = '#1e1e30';
    g.beginPath();
    g.moveTo(lx - 5, ly - 43);
    g.lineTo(lx, ly - 48);
    g.lineTo(lx + 5, ly - 43);
    g.closePath();
    g.fill();
    // warehouses and container stacks
    let x = -10;
    while (x < W * 0.62) {
      const w = rng.range(26, 60);
      const bh = rng.range(14, 40);
      g.fillStyle = rng.pick(['#232741', '#1d2138', '#282c48']);
      g.fillRect(x, sea - bh, w, bh);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.moveTo(x - 2, sea - bh);
      g.lineTo(x + w / 2, sea - bh - 6);
      g.lineTo(x + w + 2, sea - bh);
      g.closePath();
      g.fill();
      for (let k = 0; k < w / 8; k++) {
        if (rng.chance(0.35)) {
          g.fillStyle = rng.chance(0.7) ? 'rgba(255,214,140,0.85)' : 'rgba(180,220,255,0.7)';
          g.fillRect(x + 3 + k * 8, sea - bh + rng.range(5, bh - 6), 3, 2.5);
        }
      }
      x += w + rng.range(-4, 8);
    }
    for (let i = 0; i < 14; i++) {
      const cx = rng.range(0, W * 0.6);
      const rows = rng.int(1, 3);
      for (let r = 0; r < rows; r++) {
        g.fillStyle = rng.pick(['#4a2e3a', '#2e4050', '#4a4030', '#33304e']);
        g.fillRect(cx, sea - 6 - r * 6, 16, 5.5);
      }
    }
    // ship-to-shore cranes, legs and booms
    for (const [cx, s] of [[W * 0.18, 1], [W * 0.42, 0.85]]) {
      g.strokeStyle = '#141828';
      g.lineWidth = 3 * s;
      g.beginPath();
      g.moveTo(cx - 12 * s, sea);
      g.lineTo(cx - 10 * s, sea - 70 * s);
      g.moveTo(cx + 12 * s, sea);
      g.lineTo(cx + 10 * s, sea - 70 * s);
      g.moveTo(cx - 12 * s, sea - 40 * s);
      g.lineTo(cx + 12 * s, sea - 40 * s);
      g.moveTo(cx - 40 * s, sea - 70 * s);
      g.lineTo(cx + 46 * s, sea - 70 * s);
      g.stroke();
      g.lineWidth = 1.2 * s;
      g.beginPath();
      g.moveTo(cx - 10 * s, sea - 70 * s);
      g.lineTo(cx, sea - 92 * s);
      g.lineTo(cx + 10 * s, sea - 70 * s);
      g.moveTo(cx, sea - 92 * s);
      g.lineTo(cx - 40 * s, sea - 70 * s);
      g.moveTo(cx, sea - 92 * s);
      g.lineTo(cx + 46 * s, sea - 70 * s);
      for (let k = -38; k < 44; k += 8) {
        g.moveTo(cx + k * s, sea - 70 * s);
        g.lineTo(cx + (k + 4) * s, sea - 74 * s);
      }
      g.stroke();
      g.fillStyle = '#ff4a3a';
      g.beginPath();
      g.arc(cx, sea - 93 * s, 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // the sea, with the sunset glinting on it
    const wg = g.createLinearGradient(0, sea, 0, h);
    wg.addColorStop(0, '#5a4a66');
    wg.addColorStop(0.15, '#2c3a58');
    wg.addColorStop(1, '#16223a');
    g.fillStyle = wg;
    g.fillRect(0, sea, W, h - sea);
    for (let i = 0; i < 70; i++) {
      const y = sea + rng.range(1, h - sea);
      const near = (y - sea) / (h - sea);
      g.fillStyle = `rgba(255,${rng.int(150, 200)},120,${0.5 * (1 - near)})`;
      g.fillRect(rng.range(W * 0.2, W * 0.8), y, rng.range(4, 16) * (0.5 + near), 1);
    }
  }, 2);
}

// a cargo ship moored behind the quay (the one being unloaded)
function paintShip(rng) {
  const w = 300;
  const h = 170;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    // stacked containers on deck
    for (let i = 0; i < 9; i++) {
      const rows = rng.int(2, 4);
      for (let r = 0; r < rows; r++) {
        const c = rng.pick(['#7a3c3c', '#2f5a6e', '#7a6a3a', '#4a4a72', '#3a6a52', '#8a5230']);
        g.fillStyle = c;
        g.fillRect(16 + i * 24, 92 - r * 14, 23, 13);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let k = 0; k < 6; k++) g.fillRect(18 + i * 24 + k * 3.6, 93 - r * 14, 1, 11);
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.fillRect(16 + i * 24, 92 - r * 14, 23, 1.5);
      }
    }
    // the bridge tower at the stern
    g.fillStyle = '#d8d4cc';
    g.fillRect(236, 38, 44, 68);
    g.fillStyle = '#b8b2a8';
    g.fillRect(232, 36, 52, 6);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 5; k++) {
        g.fillStyle = rng.chance(0.6) ? '#ffd890' : '#3a4258';
        g.fillRect(240 + k * 8, 46 + r * 14, 5, 6);
      }
    }
    g.fillStyle = '#c4423a';
    g.fillRect(262, 16, 12, 22);
    g.fillStyle = '#1a1a26';
    g.fillRect(262, 14, 12, 4);
    // the hull
    const hg = g.createLinearGradient(0, 106, 0, 170);
    hg.addColorStop(0, '#a63a32');
    hg.addColorStop(0.5, '#7a2824');
    hg.addColorStop(1, '#3a1416');
    g.fillStyle = hg;
    g.beginPath();
    g.moveTo(0, 104);
    g.lineTo(300, 104);
    g.lineTo(290, 170);
    g.lineTo(20, 170);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8e0d0';
    g.fillRect(0, 104, 300, 3);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '700 13px Georgia, serif';
    g.textBaseline = 'middle';
    g.fillText('MARIE-GALANTE', 40, 128);
    for (let k = 0; k < 9; k++) {
      g.fillStyle = 'rgba(30,8,8,0.6)';
      g.beginPath();
      g.arc(170 + k * 13, 124, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 12; k++) g.fillRect(k * 26, 108, 1, 62);
  }, 2);
}

// the crane's yellow girder across the top of the screen
function paintGirder(W) {
  return makeSprite(W, BEAM + 6, (g) => {
    g.translate(-W / 2, -(BEAM + 6) / 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, BEAM, W, 6);
    const yg = g.createLinearGradient(0, 0, 0, BEAM);
    yg.addColorStop(0, '#ffd84a');
    yg.addColorStop(0.5, '#f0b020');
    yg.addColorStop(1, '#a87010');
    g.fillStyle = yg;
    g.fillRect(0, 0, W, 4);
    g.fillRect(0, BEAM - 5, W, 5);
    g.strokeStyle = '#e8a818';
    g.lineWidth = 2.4;
    g.beginPath();
    for (let x = 0; x < W + 20; x += 20) {
      g.moveTo(x, 4);
      g.lineTo(x + 10, BEAM - 5);
      g.lineTo(x + 20, 4);
    }
    g.stroke();
    g.strokeStyle = 'rgba(80,50,0,0.6)';
    g.lineWidth = 0.8;
    g.stroke();
    g.fillStyle = '#5a3a08';
    for (let x = 5; x < W; x += 10) {
      g.beginPath();
      g.arc(x, 2, 0.8, 0, Math.PI * 2);
      g.arc(x, BEAM - 2.5, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(0, 0, W, 1);
  }, 2);
}

function paintTrolley() {
  return makeSprite(34, 14, (g) => {
    g.fillStyle = '#2a2e3a';
    g.fillRect(-15, -5, 30, 9);
    g.fillStyle = '#4a5064';
    g.fillRect(-15, -5, 30, 2);
    g.fillStyle = '#ffb020';
    for (let k = -12; k < 13; k += 6) g.fillRect(k, -1, 3, 4);
    g.fillStyle = '#12141c';
    for (const x of [-10, 10]) {
      g.beginPath();
      g.arc(x, -6, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function paintHook() {
  return makeSprite(14, 18, (g) => {
    g.strokeStyle = '#30343e';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(0, 0);
    g.arc(-2, 2, 4, 0, Math.PI * 0.9);
    g.stroke();
    g.fillStyle = '#ffb020';
    g.fillRect(-4, -9, 8, 5);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-3, -8.5);
    g.lineTo(3, -8.5);
    g.stroke();
  });
}

const CRATE = {
  wood: { light: '#e2bf86', mid: '#c49456', dark: '#8a6232', frame: '#9a6c38' },
  fragile: { light: '#d8b47c', mid: '#b88a50', dark: '#7e582e', frame: '#8e6232' },
  red: { light: '#e0624e', mid: '#b83a30', dark: '#7a2220', frame: '#5a2220' },
  teal: { light: '#5cc2b8', mid: '#2f8a86', dark: '#1c5658', frame: '#1c3e44' },
  banana: { light: '#efe08a', mid: '#cdb44c', dark: '#8e7a26', frame: '#7a8a2a' },
  fish: { light: '#e8dcc4', mid: '#c8b896', dark: '#8e7e62', frame: '#7a8aa0' },
};

function paintCrate(kind, rng) {
  return makeSprite(CW, CW, (g) => {
    g.translate(-CW / 2, -CW / 2);
    const C = CRATE[kind];
    const bg = g.createLinearGradient(0, 0, CW, CW);
    bg.addColorStop(0, C.light);
    bg.addColorStop(0.55, C.mid);
    bg.addColorStop(1, C.dark);
    g.fillStyle = bg;
    g.fillRect(0.5, 0.5, CW - 1, CW - 1);
    // slats with grain
    g.strokeStyle = 'rgba(40,20,6,0.35)';
    g.lineWidth = 0.8;
    for (let y = 5; y < CW - 4; y += 7.5) {
      g.beginPath();
      g.moveTo(4, y);
      g.lineTo(CW - 4, y);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,240,210,0.12)' : 'rgba(60,30,8,0.14)';
      g.lineWidth = 0.5;
      const y = rng.range(4, CW - 4);
      const x = rng.range(4, CW - 14);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 5, y + rng.range(-1, 1), x + rng.range(6, 12), y);
      g.stroke();
    }
    // frame boards
    g.fillStyle = C.frame;
    g.fillRect(0, 0, CW, 4.5);
    g.fillRect(0, CW - 4.5, CW, 4.5);
    g.fillRect(0, 0, 4.5, CW);
    g.fillRect(CW - 4.5, 0, 4.5, CW);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(0, 0, CW, 1.2);
    g.fillRect(0, 0, 1.2, CW);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, CW - 1.5, CW, 1.5);
    g.fillRect(CW - 1.5, 0, 1.5, CW);
    // the brace and the markings
    if (kind === 'wood' || kind === 'banana') {
      g.strokeStyle = C.frame;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(5, CW - 5);
      g.lineTo(CW - 5, 5);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(5, CW - 7);
      g.lineTo(CW - 7, 5);
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'fragile') {
      g.save();
      g.translate(CW / 2, CW / 2);
      g.rotate(-0.12);
      g.strokeStyle = 'rgba(190,30,30,0.85)';
      g.lineWidth = 1;
      g.strokeRect(-15, -5, 30, 10);
      g.fillStyle = 'rgba(190,30,30,0.9)';
      g.font = '900 7px system-ui, sans-serif';
      g.fillText('FRAGILE', 0, 0.5);
      g.restore();
      g.strokeStyle = 'rgba(190,30,30,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(CW / 2 - 3, 9);
      g.lineTo(CW / 2 + 3, 9);
      g.lineTo(CW / 2 + 2, 13);
      g.lineTo(CW / 2 - 2, 13);
      g.closePath();
      g.moveTo(CW / 2, 13);
      g.lineTo(CW / 2, 15);
      g.stroke();
    } else if (kind === 'red') {
      g.fillStyle = 'rgba(255,235,210,0.85)';
      g.font = '900 11px Georgia, serif';
      g.fillText('Nº7', CW / 2, CW / 2 + 1);
      g.fillStyle = '#d8d0c0';
      for (const [x, y] of [[2, 2], [CW - 8, 2], [2, CW - 8], [CW - 8, CW - 8]]) g.fillRect(x, y, 6, 6);
    } else if (kind === 'teal') {
      g.strokeStyle = 'rgba(240,255,250,0.85)';
      g.fillStyle = 'rgba(240,255,250,0.85)';
      g.lineWidth = 2;
      for (const x of [CW / 2 - 6, CW / 2 + 6]) {
        g.beginPath();
        g.moveTo(x, CW / 2 + 8);
        g.lineTo(x, CW / 2 - 3);
        g.stroke();
        g.beginPath();
        g.moveTo(x - 4, CW / 2 - 2);
        g.lineTo(x, CW / 2 - 9);
        g.lineTo(x + 4, CW / 2 - 2);
        g.closePath();
        g.fill();
      }
    } else if (kind === 'banana') {
      g.fillStyle = 'rgba(60,90,30,0.85)';
      g.fillRect(8, CW / 2 - 6, CW - 16, 9);
      g.fillStyle = '#ffe14a';
      g.font = '900 6px system-ui, sans-serif';
      g.fillText('BANANAS', CW / 2, CW / 2 - 1.2);
    } else if (kind === 'fish') {
      g.fillStyle = 'rgba(40,80,140,0.85)';
      g.beginPath();
      g.ellipse(CW / 2 - 2, CW / 2 - 2, 8, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(CW / 2 + 5, CW / 2 - 2);
      g.lineTo(CW / 2 + 11, CW / 2 - 7);
      g.lineTo(CW / 2 + 11, CW / 2 + 3);
      g.closePath();
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(CW / 2 - 7, CW / 2 - 3, 1.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(40,80,140,0.85)';
      g.font = '900 6px system-ui, sans-serif';
      g.fillText('FRESH FISH', CW / 2, CW / 2 + 9);
    }
    // nails
    g.fillStyle = 'rgba(40,30,20,0.8)';
    for (const [x, y] of [[2.3, 2.3], [CW - 2.3, 2.3], [2.3, CW - 2.3], [CW - 2.3, CW - 2.3], [CW / 2, 2.3], [CW / 2, CW - 2.3]]) {
      g.beginPath();
      g.arc(x, y, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(20,10,0,0.75)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, CW - 1, CW - 1);
  });
}

// the ship's cat, side view facing right: a ginger tabby in a yellow sou'wester.
// poses: 0/1 walking strides, 2 standing, 3 hopping (legs tucked, tail up)
function paintCat(pose) {
  return makeSprite(44, 40, (g) => {
    const out = '#3a1c0a';
    // tail
    g.lineCap = 'round';
    g.strokeStyle = out;
    g.lineWidth = 6.4;
    g.beginPath();
    const tailUp = pose === 3 ? -6 : pose === 1 ? 2 : 0;
    g.moveTo(-10, 6);
    g.quadraticCurveTo(-20, 2 + tailUp, -17, -10 + tailUp);
    g.stroke();
    g.strokeStyle = '#f08a2c';
    g.lineWidth = 4.4;
    g.stroke();
    g.strokeStyle = '#b8541a';
    g.lineWidth = 4.4;
    g.setLineDash([2, 3]);
    g.stroke();
    g.setLineDash([]);
    // legs
    const legs = pose === 0 ? [[-7, 3], [-3, -2], [5, -2], [9, 3]] : pose === 1 ? [[-7, -2], [-3, 3], [5, 3], [9, -2]] : pose === 3 ? [[-9, -3], [-5, -3], [7, -3], [10, -3]] : [[-7, 0], [-3, 0], [5, 0], [9, 0]];
    for (const [x, sw] of legs) {
      const up = pose === 3 ? -3 : 0;
      g.fillStyle = out;
      g.beginPath();
      g.ellipse(x + sw * 0.4, 13 + up, 2.9, 5.6, sw * 0.08, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = x > 0 ? '#ffffff' : '#f6a050';
      g.beginPath();
      g.ellipse(x + sw * 0.4, 13 + up, 2, 4.7, sw * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    // body
    const bg = g.createLinearGradient(0, -2, 0, 14);
    bg.addColorStop(0, '#ffb45e');
    bg.addColorStop(0.6, '#f0822a');
    bg.addColorStop(1, '#c45a18');
    g.fillStyle = bg;
    g.strokeStyle = out;
    g.lineWidth = 1.3;
    g.beginPath();
    g.ellipse(0, 5, 13, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // tabby stripes
    g.strokeStyle = 'rgba(160,70,16,0.75)';
    g.lineWidth = 1.6;
    for (const x of [-8, -4, 0, 4]) {
      g.beginPath();
      g.moveTo(x, -2);
      g.quadraticCurveTo(x + 1.5, 2, x, 5);
      g.stroke();
    }
    // white chest
    g.fillStyle = '#fff6ea';
    g.beginPath();
    g.ellipse(9, 7, 4.5, 5, 0.3, 0, Math.PI * 2);
    g.fill();
    // head
    const hx = 12;
    const hy = -4;
    g.fillStyle = '#f39038';
    g.strokeStyle = out;
    g.lineWidth = 1.3;
    for (const [ex, dir] of [[-4.5, -1], [3.5, 1]]) {
      g.beginPath();
      g.moveTo(hx + ex - 2.5, hy - 4);
      g.lineTo(hx + ex + dir * 1.5, hy - 12);
      g.lineTo(hx + ex + 3, hy - 4);
      g.closePath();
      g.fill();
      g.stroke();
    }
    const hg = g.createRadialGradient(hx - 2, hy - 2, 1, hx, hy, 8.5);
    hg.addColorStop(0, '#ffc07a');
    hg.addColorStop(1, '#ec7e26');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(hx, hy, 8.2, 7.4, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff6ea';
    g.beginPath();
    g.ellipse(hx + 4.5, hy + 3, 4, 3, 0, 0, Math.PI * 2);
    g.fill();
    // eye, nose, whiskers
    g.fillStyle = '#7ad04a';
    g.beginPath();
    g.ellipse(hx + 3, hy - 1.5, 2.1, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#10140a';
    g.beginPath();
    g.ellipse(hx + 3.4, hy - 1.4, 0.8, 2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(hx + 2.4, hy - 3, 0.9, 0.9);
    g.fillStyle = '#ff7a8a';
    g.beginPath();
    g.moveTo(hx + 7.4, hy + 1.2);
    g.lineTo(hx + 9, hy + 1.2);
    g.lineTo(hx + 8.2, hy + 2.4);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(hx + 7, hy + 3);
    g.lineTo(hx + 14, hy + 2);
    g.moveTo(hx + 7, hy + 3.6);
    g.lineTo(hx + 14, hy + 4.4);
    g.stroke();
    // the sou'wester: a wide yellow brim, longer at the back
    const yg = g.createLinearGradient(0, hy - 14, 0, hy - 4);
    yg.addColorStop(0, '#fff07a');
    yg.addColorStop(1, '#f2b40c');
    g.fillStyle = yg;
    g.strokeStyle = '#7a5400';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(hx - 1, hy - 8, 6.5, 5.2, 0, Math.PI, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(hx - 12, hy - 4);
    g.quadraticCurveTo(hx - 1, hy - 10.5, hx + 9.5, hy - 7.5);
    g.quadraticCurveTo(hx, hy - 6, hx - 12, hy - 1.5);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.ellipse(hx - 3, hy - 11, 2.4, 1.1, -0.3, 0, Math.PI * 2);
    g.fill();
  });
}

function paintBeamLight() {
  return makeSprite(240, 40, (g) => {
    const bg = g.createLinearGradient(-120, 0, 120, 0);
    bg.addColorStop(0, 'rgba(255,240,190,0.9)');
    bg.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(-120, -1.5);
    g.lineTo(120, -20);
    g.lineTo(120, 20);
    g.lineTo(-120, 1.5);
    g.closePath();
    g.fill();
  }, 1);
}

function paintCloud(w, h, rng) {
  return makeSprite(w, h, (g) => {
    for (let i = 0; i < 9; i++) {
      const x = rng.range(-w * 0.35, w * 0.35);
      const y = rng.range(-h * 0.15, h * 0.15);
      const r = rng.range(h * 0.25, h * 0.48);
      const cg = g.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
      cg.addColorStop(0, 'rgba(70,80,116,0.7)');
      cg.addColorStop(1, 'rgba(36,44,74,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 1);
}

// ---------- game ----------

export default {
  id: 'crates',
  title: 'Crate Escape',
  emoji: '📦',
  tagline: 'Climb the crates to keep above the tide. Never stand under a drop!',
  colors: { bg: '#1d2a44', fg: '#f6f1e6', accent: '#ffc22e' },

  // A sea-shanty folk-rave at 140 BPM in D Dorian: a four-on-the-floor kick, a galloping octave
  // sawtooth bass and offbeat accordion chords under the accordion playing "What Shall We Do with
  // the Drunken Sailor" from the first bar, then claps and bodhrán, then a tambourine, a fiddle
  // an octave up with echoes and a 16th arpeggio, and a finale with a busier kick, the tune doubled
  // an octave down and a rising noise wash. One bar per cycle: 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("d2*4").s("sine").decay(0.24).sustain(0).gain(0.8)
      const kick2 = note("d2 d2 d2 [d2 d2]").s("sine").decay(0.22).sustain(0).gain("0.8 0.8 0.8 [0.8 0.55]")
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1100).lpf(5000).gain(0.12).room(0.4)
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const tamb = s("white*16").decay(0.025).sustain(0).hpf(7000).gain("[0.02 0.035 0.05 0.035]*4")
      const bodhran = note("a2 [~ a2] a2 [a2 a2]").s("sine").decay(0.11).sustain(0).gain("0.32 [0 0.22] 0.3 [0.22 0.26]")
      const bass = note("<[d2 ~ d3 d2 ~ d2 d3 d2] [d2 ~ d3 d2 ~ d2 d3 d2] [c2 ~ c3 c2 ~ c2 c3 c2] [c2 ~ c3 c2 ~ c2 c3 c2] [d2 ~ d3 d2 ~ d2 d3 d2] [d2 ~ d3 d2 ~ d2 d3 d2] [c2 ~ c3 c2 ~ c2 c3 c2] [d2 ~ d3 d2 ~ d2 d3 d2]>")
        .s("sawtooth").decay(0.15).sustain(0.3).release(0.05).lpf(saw.range(450, 1500).slow(35)).lpq(4).gain(0.36)
      const chords = "<[d4,f4,a4] [d4,f4,a4] [c4,e4,g4] [c4,e4,g4] [d4,f4,a4] [d4,f4,a4] [c4,e4,g4] [d4,f4,a4]>"
      const squeeze = note(chords).struct("[~ x]*4").s("square").decay(0.12).sustain(0.25).release(0.05)
        .vib(6).vibmod(0.1).lpf(saw.range(1100, 2000).slow(35)).gain(0.05).pan(0.4)
      const tune = "<[a4 [a4 a4] a4 [a4 a4]] [a4 d4 f4 a4] [g4 [g4 g4] g4 [g4 g4]] [g4 c4 e4 g4] [a4 [a4 a4] a4 [a4 a4]] [a4 b4 c5 d5] [c5 a4 g4 e4] [d4 ~ d4 ~] [a4@2 a4 a4] [a4 d4 f4 a4] [g4@2 g4 g4] [g4 c4 e4 g4] [a4@2 a4 a4] [a4 b4 c5 d5] [c5 a4 g4 e4] [d4 ~ d4 ~]>"
      const accordion = note(tune).s("square").attack(0.01).decay(0.15).sustain(0.55).release(0.08)
        .vib(6).vibmod(0.12).lpf(2400).gain(0.085).room(0.3).pan(0.55)
      const fiddle = note(tune).add(note(12)).s("sawtooth").attack(0.03).decay(0.2).sustain(0.6).release(0.1)
        .vib(5.5).vibmod(0.2).lpf(2800).gain(0.04).delay(0.22).delaytime(0.321).delayfeedback(0.28).pan(0.62)
      const low = note(tune).add(note(-12)).s("sawtooth").decay(0.2).sustain(0.5).release(0.08).lpf(1300).gain(0.07)
      const arp = note("<[d5 f5 a5 f5]*4 [d5 f5 a5 f5]*4 [c5 e5 g5 e5]*4 [c5 e5 g5 e5]*4 [d5 f5 a5 f5]*4 [d5 f5 a5 f5]*4 [c5 e5 g5 e5]*4 [d5 f5 a5 d6]*4>")
        .s("triangle").decay(0.07).sustain(0).lpf(3400).gain(0.05).pan(sine.range(0.3, 0.7).slow(2))
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1200).gain(0.04).room(0.5)
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(900).lpf(saw.range(800, 5000).slow(35)).gain(saw.range(0, 0.06).slow(35))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, squeeze, accordion)],
      [8, stack(kick, clap, hats, bodhran, bass, squeeze, accordion, pad)],
      [8, stack(kick, clap, hats, tamb, bodhran, bass, squeeze, accordion, fiddle, arp, pad)],
      [11, stack(kick2, clap, hats, tamb, bodhran, bass, squeeze, accordion, fiddle, low, arp, pad, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const look = rng.fork('look');

    const sky = paintSky(W, H, art);
    const skyline = paintSkyline(W, art);
    const ship = paintShip(art);
    const girder = paintGirder(W);
    const trolley = paintTrolley();
    const hook = paintHook();
    const crateArt = {};
    for (const k of KINDS) crateArt[k] = [paintCrate(k, art), paintCrate(k, art)];
    const cat = [0, 1, 2, 3].map(paintCat);
    const beamLight = paintBeamLight();
    const clouds = [paintCloud(220, 80, art), paintCloud(180, 70, art), paintCloud(260, 90, art)];
    const warmGlow = glowSprite('rgba(255,190,110,1)', 40);
    const lampGlow = glowSprite('rgba(255,200,120,1)', 60);
    const redGlow = glowSprite('rgba(255,80,50,1)', 30);
    const vignette = vignetteSprite(W, H, 0.6, '8,10,24');
    // the danger column under a hanging crate: red hazard stripes from the crane down to its slot
    const hazard = makeSprite(CW - 6, H + 16, (g) => {
      g.translate(-(CW - 6) / 2, -(H + 16) / 2);
      g.fillStyle = 'rgba(255,60,40,0.22)';
      g.fillRect(0, 0, CW - 6, H + 16);
      g.fillStyle = 'rgba(255,70,40,0.6)';
      for (let y = -CW; y < H + 16 + CW; y += 16) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(CW - 6, y - (CW - 6));
        g.lineTo(CW - 6, y - (CW - 6) + 7);
        g.lineTo(0, y + 7);
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(255,110,70,0.95)';
      g.fillRect(0, 0, 2, H + 16);
      g.fillRect(CW - 8, 0, 2, H + 16);
    }, 1);

    // ---- the whole unloading, planned up front ----
    const hp = new Array(N).fill(0);
    const lastAt = new Array(N).fill(-9);
    const drops = [];
    const pickCol = (T) => {
      const minH = Math.min(...hp);
      const ws = hp.map((hc, c) => {
        let w = 0.1 + 1 / (1 + hc - minH) ** 1.5;
        if (T < 5.5 && Math.abs(c - 4) <= 1) w = 0; // leave the cat room to start
        if (T - lastAt[c] < 0.6) w *= 0.2;
        return w;
      });
      let r = plan.next() * ws.reduce((a, b) => a + b, 0);
      for (let c = 0; c < N; c++) {
        r -= ws[c];
        if (r <= 0) return c;
      }
      return N - 1;
    };
    let T = 2.9;
    while (T < 64) {
      const p = progress(T, 60, 1.15);
      const n = T > 16 && plan.chance(lerp(0.08, 0.4, p)) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const c = pickCol(T);
        const at = T + k * plan.range(0.1, 0.3);
        drops.push({ col: c, level: hp[c], at, warn: lerp(1.25, 0.72, p), kind: look.pick(KINDS), v: look.int(0, 1), done: false });
        hp[c]++;
        lastAt[c] = at;
      }
      T += lerp(1.0, 0.4, p) * plan.range(0.8, 1.2) * (n === 2 ? 1.5 : 1);
    }
    drops.sort((a, b) => a.at - b.at);

    // the tide follows the pile's average height, four seconds late
    const tide = [];
    {
      let landed = 0;
      let di = 0;
      let wl = -50;
      for (let i = 0; i <= 700; i++) {
        const t = i * 0.1;
        while (di < drops.length && drops[di].at <= t - 4) {
          landed++;
          di++;
        }
        const target = Math.max(-50, (landed / N) * CW - 32);
        wl = Math.max(wl, Math.min(target, wl + 3));
        tide.push(wl);
      }
    }
    const tideAt = (t) => {
      const f = clamp(t / 0.1, 0, tide.length - 1);
      const i = Math.floor(f);
      return lerp(tide[i], tide[Math.min(i + 1, tide.length - 1)], f - i);
    };

    // ---- state ----
    const hRun = new Array(N).fill(0);
    const stacks = Array.from({ length: N }, () => []);
    const kitty = { x: W / 2, vx: 0, f: 0, vy: 0, vf: 0, face: 1, step: 0 };
    let cam = 0;
    let time = 0;
    let clock = 0;
    let li = 0; // next drop to land
    let deadT = 0;
    let death = '';
    let shake = 0;
    let flash = 0;
    let nextFlash = 4 + Math.random() * 4;
    let bolt = null;
    const fx = createParticles();
    const spray = createParticles();
    const rain = Array.from({ length: 80 }, () => ({ x: Math.random() * (W + 120), y: Math.random() * H, l: 8 + Math.random() * 10, v: 520 + Math.random() * 260, a: 0.12 + Math.random() * 0.22 }));
    const cloudsLive = [0, 1, 2, 3].map((i) => ({ x: Math.random() * W, y: 40 + i * 55, sp: 6 + Math.random() * 8, k: i % 3 }));

    const colOf = (x) => clamp(Math.floor(x / CW), 0, N - 1);
    const support = (x) => {
      let s = 0;
      for (let c = colOf(x - PW); c <= colOf(x + PW - 0.01); c++) s = Math.max(s, hRun[c] * CW);
      return s;
    };
    const sy = (wy) => PY - (wy - cam);
    const crateY = (d, t) => d.level * CW + 0.5 * G * clamp(d.at - t, 0, FALL) ** 2; // the bottom of a hanging or falling crate

    function die(why) {
      game.dead = true;
      death = why;
      game.deathReason = why === 'crate' ? 'Flattened by a falling crate.' : 'Washed off the quay by the tide.';
      const y = sy(kitty.f) - 10;
      if (why === 'crate') {
        fx.burst(kitty.x, y, { count: 30, speed: 220, life: 0.9, size: 4, gravity: 500, drag: 1, colors: FUR });
        fx.burst(kitty.x, y + 8, { count: 24, speed: 160, life: 0.8, size: 3, gravity: 300, colors: DUST });
        shake = 0.35;
      } else {
        spray.burst(kitty.x, sy(tideAt(time)), { count: 50, speed: 260, life: 1, size: 4, gravity: 700, round: true, colors: SPLASH, angle: -Math.PI / 2, spread: 2.2 });
      }
    }

    function land(d, live) {
      d.done = true;
      d.landedAt = time;
      hRun[d.col] = d.level + 1;
      stacks[d.col].push(d);
      const x = d.col * CW + CW / 2;
      const y = sy(d.level * CW);
      if (d.level * CW < tideAt(time) - 6) {
        spray.burst(x, sy(tideAt(time)), { count: 22, speed: 200, life: 0.8, size: 3.5, gravity: 600, round: true, colors: SPLASH, angle: -Math.PI / 2, spread: 1.6 });
      } else {
        for (const sd of [-1, 1]) fx.burst(x + sd * 18, y - 3, { count: 7, speed: 90, life: 0.6, size: 3.5, gravity: 120, drag: 2, colors: DUST, angle: sd < 0 ? Math.PI : 0, spread: 0.9 });
        fx.burst(x, y - 4, { count: 4, speed: 140, life: 0.5, size: 2, gravity: 500, colors: ['#e2bf86', '#8a6232'], angle: -Math.PI / 2, spread: 2.4 });
      }
      if (live && Math.abs(d.level * CW - kitty.f) < 200) shake = Math.max(shake, 0.08);
      // a crate landing right beside the cat nudges it off the edge of that column
      if (live && colOf(kitty.x - PW) <= d.col && d.col <= colOf(kitty.x + PW - 0.01) && hRun[d.col] * CW > kitty.f + 0.5) {
        kitty.x = d.col * CW + CW / 2 > kitty.x ? d.col * CW - PW : (d.col + 1) * CW + PW;
      }
    }

    function moveCat(dt, dir) {
      const k = kitty;
      k.vx += (dir * SPEED - k.vx) * Math.min(1, ACCEL * dt);
      if (dir) k.face = dir;
      let nx = clamp(k.x + k.vx * dt, PW, W - PW);
      if (nx > k.x) {
        const c = colOf(nx + PW - 0.01);
        if (c !== colOf(k.x + PW - 0.01)) {
          const top = hRun[c] * CW;
          if (top > k.f + CW + 1) {
            nx = c * CW - PW;
            k.vx = 0;
          } else if (top > k.f + 0.5) {
            k.f = top;
            k.vy = 0;
          }
        }
      } else if (nx < k.x) {
        const c = colOf(nx - PW);
        if (c !== colOf(k.x - PW)) {
          const top = hRun[c] * CW;
          if (top > k.f + CW + 1) {
            nx = (c + 1) * CW + PW;
            k.vx = 0;
          } else if (top > k.f + 0.5) {
            k.f = top;
            k.vy = 0;
          }
        }
      }
      k.step += Math.abs(nx - k.x);
      k.x = nx;
      const s = support(k.x);
      if (k.f > s + 0.01) {
        k.vy -= CAT_G * dt;
        k.f += k.vy * dt;
        if (k.f <= s) {
          if (k.vy < -350) fx.burst(k.x, sy(s) - 2, { count: 8, speed: 70, life: 0.4, size: 3, drag: 3, colors: DUST, angle: -Math.PI / 2, spread: 3 });
          k.f = s;
          k.vy = 0;
        }
      } else {
        k.f = s;
        k.vy = 0;
      }
      // the drawn cat hops up a step over a moment instead of teleporting
      k.vf = k.f > k.vf ? Math.min(k.f, k.vf + 320 * dt) : k.f;
    }

    function cosmetic(dt, rate) {
      for (const r of rain) {
        r.y += r.v * dt * rate;
        r.x -= r.v * 0.25 * dt * rate;
        if (r.y > H + 20 || r.x < -20) {
          r.y = -20 - Math.random() * 40;
          r.x = Math.random() * (W + 120);
        }
      }
      for (const c of cloudsLive) c.x = ((c.x + c.sp * dt + 260) % (W + 520)) - 260;
      nextFlash -= dt;
      if (nextFlash <= 0) {
        flash = 1;
        nextFlash = 6 + Math.random() * 7;
        const pts = [[40 + Math.random() * (W - 80), 0]];
        while (pts.at(-1)[1] < 230) pts.push([pts.at(-1)[0] + (Math.random() - 0.5) * 40, pts.at(-1)[1] + 15 + Math.random() * 25]);
        bolt = pts;
      }
      flash = Math.max(0, flash - dt * 2.6);
      shake = Math.max(0, shake - dt);
      fx.update(dt * rate, 0);
      spray.update(dt * rate, 0);
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        time = t + dt;

        moveCat(dt, dir);

        // ---- under a crate? ----
        const k = kitty;
        for (let i = li; i < drops.length; i++) {
          const d = drops[i];
          if (d.at - FALL > time) break;
          if (d.done) continue;
          const cx = d.col * CW + CW / 2;
          if (Math.abs(cx - k.x) >= CW / 2 - 2 + HW) continue;
          const yb = crateY(d, time);
          if (yb < k.f + PH && yb + CW - 4 > k.f) {
            die('crate');
            k.f = d.level * CW;
            return;
          }
        }
        while (li < drops.length && drops[li].at <= time) land(drops[li++], true);

        // ---- the tide ----
        if (tideAt(time) > k.f + CHEST) {
          die('tide');
          return;
        }

        if (Math.random() < dt * 6) {
          const c = (Math.random() * N) | 0;
          fx.burst(c * CW + Math.random() * CW, sy(hRun[c] * CW) - 1, { count: 2, speed: 40, life: 0.3, size: 1.6, gravity: 300, colors: ['#cfe6ff', '#9fc2e8'], angle: -Math.PI / 2, spread: 2 });
        }
        cam += (kitty.vf - cam) * Math.min(1, 3 * dt);
        cosmetic(dt, 1);
      },

      afterlife(dt) {
        clock += dt;
        deadT += dt;
        time += dt * 0.3;
        while (li < drops.length && drops[li].at <= time) land(drops[li++], false);
        if (death === 'tide') kitty.f = Math.max(kitty.f - 30 * dt, tideAt(time) - 40);
        cosmetic(dt, 0.4);
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
        const syk = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
        g.save();
        g.translate(sx, syk);

        // ---- sky, storm and the far harbour ----
        drawSprite(g, sky, W / 2, H / 2);
        if (flash > 0) {
          g.fillStyle = `rgba(200,210,255,${0.22 * flash})`;
          g.fillRect(-10, -10, W + 20, H + 20);
          if (bolt && flash > 0.5) {
            g.strokeStyle = `rgba(240,245,255,${flash})`;
            g.lineWidth = 2;
            g.beginPath();
            bolt.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
          }
        }
        for (const c of cloudsLive) drawSprite(g, clouds[c.k], c.x, c.y + cam * 0.02, { alpha: 0.8 });
        const horizon = 330 + Math.min(cam, 900) * 0.08;
        drawSprite(g, skyline, W / 2, horizon);
        const bay = g.createLinearGradient(0, horizon + 84, 0, H);
        bay.addColorStop(0, '#16223a');
        bay.addColorStop(1, '#0c1426');
        g.fillStyle = bay;
        g.fillRect(0, horizon + 84, W, H - horizon - 84);
        g.fillStyle = 'rgba(255,190,130,0.12)';
        for (let i = 0; i < 10; i++) g.fillRect((i * 67 + clock * 6) % (W + 30) - 30, horizon + 92 + i * 9, 18 + (i % 3) * 8, 1);
        // the lighthouse sweep
        const lx = W * 0.86;
        const ly = horizon - 31;
        const a = clock * 1.4;
        g.globalCompositeOperation = 'lighter';
        g.save();
        g.translate(lx, ly);
        g.scale(Math.cos(a), 1);
        g.globalAlpha = 0.35 * Math.abs(Math.cos(a)) + 0.05;
        g.drawImage(beamLight.canvas, 0, -20, 240, 40);
        g.restore();
        g.globalAlpha = 1;
        drawSprite(g, lampGlow, lx, ly, { size: 40 + 20 * Math.abs(Math.sin(a)), alpha: 0.7 });
        g.globalCompositeOperation = 'source-over';

        // the ship being unloaded, behind the quay
        drawSprite(g, ship, W * 0.7, PY - 40 + cam * 0.35, { size: 360, alpha: 0.55 });
        const haze = g.createLinearGradient(0, 300, 0, H);
        haze.addColorStop(0, 'rgba(30,36,60,0)');
        haze.addColorStop(1, 'rgba(20,26,46,0.55)');
        g.fillStyle = haze;
        g.fillRect(0, 300, W, H - 300);

        // ---- the quay ----
        const qy = sy(0);
        if (qy < H + 10) {
          for (let x = 10; x < W; x += 46) {
            const pg = g.createLinearGradient(x - 5, 0, x + 5, 0);
            pg.addColorStop(0, '#3a2a1c');
            pg.addColorStop(0.5, '#5a4430');
            pg.addColorStop(1, '#2a1c12');
            g.fillStyle = pg;
            g.fillRect(x - 5, qy + 10, 10, H - qy);
          }
          g.fillStyle = '#6a5034';
          g.fillRect(0, qy, W, 12);
          g.fillStyle = '#8a6a44';
          g.fillRect(0, qy, W, 2.5);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          for (let x = 0; x < W; x += 24) g.fillRect(x, qy, 1, 12);
          g.fillStyle = '#2a1c12';
          g.fillRect(0, qy + 12, W, 3);
        }

        // ---- the stacks ----
        if (death === 'crate') drawCat(); // squashed under the crate that got it
        for (let c = 0; c < N; c++) {
          for (const d of stacks[c]) {
            const top = sy((d.level + 1) * CW);
            if (top > H + 4 || top < -CW) continue;
            const sq = clamp((time - d.landedAt) / 0.14, 0, 1);
            const hh = CW * (sq < 1 ? 0.9 + 0.1 * sq : 1);
            g.drawImage(crateArt[d.kind][d.v].canvas, d.col * CW, top + (CW - hh), CW, hh);
          }
        }

        // ---- what's coming: slot markers, hanging and falling crates ----
        const pending = [];
        for (let i = li; i < drops.length; i++) {
          const d = drops[i];
          if (d.at - FALL - d.warn > time) break;
          if (!d.done) pending.push(d);
        }
        // is the cat standing in the path of one of them?
        const under = (d) => Math.abs(d.col * CW + CW / 2 - kitty.x) < CW / 2 - 2 + HW && crateY(d, time) > kitty.f;
        const threatened = !game.dead && pending.some(under);
        for (const d of pending) {
          const x0 = d.col * CW;
          const top = sy((d.level + 1) * CW);
          const k = clamp((time - (d.at - FALL - d.warn)) / (d.warn + FALL), 0, 1);
          // the whole drop path flashes red, faster as the release gets closer, hardest over the cat
          const colH = Math.min(H, Math.max(0, top + CW - BEAM));
          if (colH > 0) {
            const pulse = 0.5 + 0.5 * Math.sin(clock * (7 + 12 * k));
            let a = (0.25 + 0.45 * k) * (0.7 + 0.3 * pulse);
            if (!game.dead && under(d)) a = 0.7 + 0.3 * pulse;
            g.globalAlpha = a;
            g.drawImage(hazard.canvas, 0, (clock * 24) % 16, CW - 6, colH, x0 + 3, BEAM, CW - 6, colH);
            g.globalAlpha = 1;
          }
          // its shadow on the slot grows as it comes down
          if (top + CW > BEAM + 8 && top + CW < H + 10) {
            const near = clamp(1 - (crateY(d, time) - d.level * CW) / (DROP + CW), 0, 1);
            g.fillStyle = `rgba(10,6,16,${0.25 + 0.4 * near})`;
            g.beginPath();
            g.ellipse(x0 + CW / 2, top + CW - 2, 8 + 12 * Math.max(k, near), 3 + 2 * near, 0, 0, Math.PI * 2);
            g.fill();
          }
          if (top + CW > BEAM + 8) {
            g.fillStyle = `rgba(255,${Math.round(150 - 90 * k)},50,${0.18 + 0.2 * k})`;
            g.fillRect(x0 + 3, top + 3 + (CW - 6) * (1 - k), CW - 6, (CW - 6) * k);
            g.setLineDash([5, 4]);
            g.lineDashOffset = -clock * 30;
            g.strokeStyle = `rgba(255,${Math.round(220 - 140 * k)},70,${0.55 + 0.45 * k})`;
            g.lineWidth = 2;
            g.strokeRect(x0 + 3, top + 3, CW - 6, CW - 6);
            g.setLineDash([]);
            g.lineDashOffset = 0;
            g.fillStyle = `rgba(255,${Math.round(220 - 140 * k)},70,${0.6 + 0.4 * k})`;
            g.font = '900 16px system-ui, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('▼', x0 + CW / 2, top + CW / 2 + 1);
          }
        }
        // cables first, then the crates on them
        for (const d of pending) {
          const cx = d.col * CW + CW / 2;
          const released = time >= d.at - FALL;
          const swing = released ? 0 : Math.sin(clock * 3 + d.col) * 2.5;
          const top = sy(crateY(d, time) + CW);
          if (!released && top > BEAM) {
            g.strokeStyle = '#1a1c24';
            g.lineWidth = 1.6;
            g.beginPath();
            g.moveTo(cx, BEAM);
            g.lineTo(cx + swing, top - 6);
            g.stroke();
            drawSprite(g, hook, cx + swing, top - 5, { size: 12 });
          }
          if (top < H && top > -CW) {
            drawSprite(g, crateArt[d.kind][d.v], cx + swing, top + CW / 2, { rot: swing * 0.01 });
            if (released) {
              g.fillStyle = 'rgba(220,230,255,0.25)';
              g.fillRect(cx - 14, top - 26, 2, 22);
              g.fillRect(cx + 12, top - 20, 2, 16);
            }
          }
        }

        // ---- the cat ----
        if (death !== 'crate') drawCat();
        if (threatened) {
          // a crate is coming down on the cat: a red glow and a big "!" over its head
          const fy = sy(kitty.vf);
          const blink = 0.6 + 0.4 * Math.sin(clock * 18);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, kitty.x, fy - 16, { size: 80, alpha: 0.6 * blink });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(200,20,20,${0.85 * blink + 0.15})`;
          g.beginPath();
          g.arc(kitty.x, fy - 52, 10, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.font = '900 15px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('!', kitty.x, fy - 51);
        }

        function drawCat() {
          const k = kitty;
          const fy = sy(k.vf);
          if (death === 'crate') {
            g.save();
            g.translate(k.x, fy);
            g.scale(k.face * 1.35, 0.3);
            g.drawImage(cat[2].canvas, -22, -40, 44, 40);
            g.restore();
            for (let i = 0; i < 4; i++) {
              const ang = clock * 3 + (i * Math.PI) / 2;
              g.fillStyle = '#ffe14a';
              g.font = '900 11px system-ui, sans-serif';
              g.textAlign = 'center';
              g.fillText('★', k.x + Math.cos(ang) * 18, fy - CW - 8 + Math.sin(ang) * 5);
            }
            return;
          }
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, warmGlow, k.x, fy - 10, { size: 70, alpha: 0.22 });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = 'rgba(10,8,20,0.35)';
          g.beginPath();
          g.ellipse(k.x, sy(k.f) - 1, 13, 3, 0, 0, Math.PI * 2);
          g.fill();
          const air = k.f > support(k.x) + 1 || k.vf < k.f - 1;
          const pose = death === 'tide' ? 3 : air ? 3 : Math.abs(k.vx) > 25 ? Math.floor(k.step / 9) % 2 : 2;
          const bob = death === 'tide' ? Math.sin(clock * 5) * 3 : 0;
          g.save();
          g.translate(k.x, fy - 18 + bob);
          g.scale(k.face, 1);
          g.rotate(death === 'tide' ? Math.sin(clock * 3) * 0.3 : k.vx * k.face * 0.0006);
          g.drawImage(cat[pose].canvas, -22, -20, 44, 40);
          g.restore();
        }

        // ---- the tide ----
        const wl = tideAt(time);
        const wy = sy(wl);
        if (wy < H + 10) {
          const wg = g.createLinearGradient(0, wy - 6, 0, Math.max(wy + 200, H));
          wg.addColorStop(0, 'rgba(70,140,160,0.62)');
          wg.addColorStop(0.15, 'rgba(30,80,110,0.8)');
          wg.addColorStop(1, 'rgba(8,24,44,0.95)');
          g.fillStyle = wg;
          g.beginPath();
          g.moveTo(-10, H + 10);
          for (let x = -10; x <= W + 10; x += 10) g.lineTo(x, wy + Math.sin(x * 0.045 + clock * 2.2) * 3 + Math.sin(x * 0.11 - clock * 3.1) * 1.5);
          g.lineTo(W + 10, H + 10);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(210,245,255,0.7)';
          g.lineWidth = 2;
          g.beginPath();
          for (let x = -10; x <= W + 10; x += 10) {
            const y = wy + Math.sin(x * 0.045 + clock * 2.2) * 3 + Math.sin(x * 0.11 - clock * 3.1) * 1.5;
            if (x === -10) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          // foam and the sunset on the swell
          g.fillStyle = 'rgba(240,250,255,0.5)';
          for (let i = 0; i < 14; i++) {
            const x = (i * 31 + clock * (18 + (i % 3) * 7)) % (W + 20) - 10;
            g.fillRect(x, wy + 3 + (i % 4) * 5, 6 + (i % 3) * 4, 1.5);
          }
          g.fillStyle = 'rgba(255,190,120,0.25)';
          for (let i = 0; i < 8; i++) {
            const x = (i * 53 + clock * 11) % W;
            g.fillRect(x, wy + 12 + i * 7, 14, 1.2);
          }
          // warning glow when it's close to the cat
          const near = clamp(1 - (kitty.f + CHEST - wl) / 60, 0, 1);
          if (near > 0 && !game.dead) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, kitty.x, wy, { size: 90, alpha: 0.5 * near * (0.6 + 0.4 * Math.sin(clock * 12)) });
            g.globalCompositeOperation = 'source-over';
          }
        }

        fx.render(g, false);
        spray.render(g, false);

        // ---- the crane over everything ----
        drawSprite(g, girder, W / 2, (BEAM + 6) / 2);
        for (const d of pending) {
          const cx = d.col * CW + CW / 2;
          drawSprite(g, trolley, cx, BEAM - 2, { size: 30 });
          // a drop whose slot is above the screen: an arrow under the crane
          const top = sy((d.level + 1) * CW);
          if (top + CW <= BEAM + 8) {
            const k = clamp((time - (d.at - FALL - d.warn)) / (d.warn + FALL), 0, 1);
            g.fillStyle = `rgba(255,${Math.round(200 - 120 * k)},60,${0.6 + 0.4 * k})`;
            g.font = '900 13px system-ui, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('▲', cx, BEAM + 12);
          }
        }

        // rain
        g.strokeStyle = 'rgba(190,210,240,0.28)';
        g.lineWidth = 1;
        g.beginPath();
        for (const r of rain) {
          g.moveTo(r.x, r.y);
          g.lineTo(r.x + r.l * 0.25, r.y - r.l);
        }
        g.stroke();

        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        if (game.dead) {
          const word = death === 'crate' ? 'THUD!' : 'SPLASH!';
          const a = clamp(deadT * 3, 0, 1);
          g.font = '900 30px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const tx = clamp(kitty.x, 70, W - 70);
          const ty = clamp(sy(kitty.f) - 80, 80, H - 60);
          g.fillStyle = `rgba(10,14,30,${0.8 * a})`;
          g.fillText(word, tx + 2, ty + 2);
          g.fillStyle = `rgba(255,214,70,${a})`;
          g.fillText(word, tx, ty);
        }
      },
    };
    return game;
  },
};
