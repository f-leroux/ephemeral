// Runaway Cart — an explorer grabs the golden idol and flees a lost temple in a mine cart, with a
// giant stone boulder rolling down the rails behind. You can't steer: right pumps the cart faster,
// left hauls on the brake. Ahead, the corridor is full of traps that work on their own clockwork:
// pendulum blades swing across the rails, carved stone blocks slam down from the ceiling, and fire
// jets roar out of dragon heads in the walls. You choose *when* to arrive at each one, braking to
// let a blade pass or pumping to beat a block, without letting the boulder catch you. From 14s the
// rails break off over chasms, and you need enough speed on the ramp to jump them (the ramp lamps
// and the speed gauge turn green when you're fast enough). Every layout is built around a hidden
// reference ride with the cart's own physics, so there is always a way through.

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

const CX = 180; // the rails' centre line
const WL = 70; // the corridor's inner wall edges
const WR = 290;
const CY = 520; // the cart's centre on screen
const HL = 26; // the cart's half-length along the rails
const VMAX = 340;
const ACC = 230; // pumping
const BRK = 430; // braking
const DRAG = 12; // coasting
const V0 = 150;
const BR = 104; // boulder radius
const GAP0 = 340; // how far behind the boulder starts
const TILE = 320;
const FIRST = 760; // where the first trap sits along the rails
const GAPS_FROM = 14; // chasms appear from this time on

const boulderV = (t) => lerp(118, 212, progress(t, 60, 1.05));

const CRUSH = { warn: 0.45, fall: 0.1, dwell: 0.35, rise: 0.45 };
const FIRE = { warn: 0.55 };

const SPARKS = ['#fff3c0', '#ffc35a', '#ff8a2a'];
const DUST = ['#8a7d70', '#a39482', '#6d6258'];
const EMBERS = ['#fff1a8', '#ffb43c', '#ff6a1f', '#e8401a'];
const GOLD = ['#fff6c8', '#ffd75e', '#e8a22a'];

// ---------- art ----------

function paintTile(rng) {
  return makeSprite(360, TILE, (g) => {
    g.translate(-180, -TILE / 2);
    // floor flagstones
    g.fillStyle = '#4a4550';
    g.fillRect(WL, 0, WR - WL, TILE);
    for (let row = 0; row < TILE / 64; row++) {
      const y = row * 64;
      const off = row % 2 ? 0 : 55;
      for (let x = WL - 110 + off; x < WR; x += 110) {
        const x0 = Math.max(WL, x + 2);
        const x1 = Math.min(WR, x + 108);
        if (x1 <= x0) continue;
        const sg = g.createLinearGradient(0, y, 0, y + 62);
        const l = rng.range(-8, 8);
        sg.addColorStop(0, `rgb(${92 + l},${86 + l},${96 + l})`);
        sg.addColorStop(1, `rgb(${70 + l},${65 + l},${76 + l})`);
        g.fillStyle = sg;
        g.fillRect(x0, y + 2, x1 - x0, 60);
        g.fillStyle = 'rgba(255,240,220,0.08)';
        g.fillRect(x0, y + 2, x1 - x0, 2);
        // cracks
        g.strokeStyle = 'rgba(25,20,30,0.45)';
        g.lineWidth = 1;
        for (let k = 0; k < 2; k++) {
          if (!rng.chance(0.6)) continue;
          let cx = rng.range(x0 + 6, x1 - 6);
          let cy = y + rng.range(8, 54);
          g.beginPath();
          g.moveTo(cx, cy);
          for (let j = 0; j < 4; j++) {
            cx = clamp(cx + rng.range(-9, 9), x0 + 2, x1 - 2);
            cy = clamp(cy + rng.range(-8, 8), y + 4, y + 60);
            g.lineTo(cx, cy);
          }
          g.stroke();
        }
      }
    }
    // grit and moss tufts on the floor
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,230,200,0.08)' : 'rgba(10,5,15,0.25)';
      g.fillRect(rng.range(WL, WR), rng.range(0, TILE), rng.range(0.8, 2.2), rng.range(0.8, 2));
    }
    for (let i = 0; i < 8; i++) {
      const x = rng.chance(0.5) ? rng.range(WL + 2, WL + 30) : rng.range(WR - 30, WR - 2);
      const y = rng.range(10, TILE - 10);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `rgba(${rng.range(70, 110)},${rng.range(120, 160)},${rng.range(50, 70)},0.55)`;
        g.beginPath();
        g.arc(x + rng.range(-7, 7), y + rng.range(-5, 5), rng.range(1.2, 3), 0, Math.PI * 2);
        g.fill();
      }
    }
    // sleepers and rails
    for (let y = 8; y < TILE; y += 32) {
      const wg = g.createLinearGradient(0, y, 0, y + 12);
      wg.addColorStop(0, '#7a5434');
      wg.addColorStop(1, '#4b3020');
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(CX - 40, y + 3, 82, 12);
      g.fillStyle = wg;
      g.fillRect(CX - 42, y, 84, 11);
      g.strokeStyle = 'rgba(30,15,5,0.4)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(CX - 40, y + 4);
      g.lineTo(CX + 40, y + 4 + rng.range(-1, 1));
      g.moveTo(CX - 36, y + 8);
      g.lineTo(CX + 38, y + 7);
      g.stroke();
    }
    for (const rx of [CX - 22, CX + 22]) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(rx - 2, 0, 7, TILE);
      const rg = g.createLinearGradient(rx - 3, 0, rx + 3, 0);
      rg.addColorStop(0, '#5b5960');
      rg.addColorStop(0.45, '#d8d4d8');
      rg.addColorStop(1, '#6a666e');
      g.fillStyle = rg;
      g.fillRect(rx - 3, 0, 6, TILE);
    }
    // the walls: big carved blocks seen from above
    for (const [x0, x1] of [[0, WL], [WR, 360]]) {
      g.fillStyle = '#2a2530';
      g.fillRect(x0, 0, x1 - x0, TILE);
      for (let y = 0; y < TILE; y += 80) {
        const bg = g.createLinearGradient(x0, 0, x1, 0);
        const inner = x0 === 0 ? 1 : 0;
        bg.addColorStop(inner ? 0 : 1, '#3a3442');
        bg.addColorStop(inner ? 1 : 0, '#5a5262');
        g.fillStyle = bg;
        g.fillRect(x0 + 3, y + 3, x1 - x0 - 6, 74);
        g.fillStyle = 'rgba(255,235,210,0.08)';
        g.fillRect(x0 + 3, y + 3, x1 - x0 - 6, 2);
        // carved border
        g.strokeStyle = 'rgba(15,10,20,0.45)';
        g.lineWidth = 1.5;
        g.strokeRect(x0 + 10, y + 12, x1 - x0 - 20, 56);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = rng.chance(0.5) ? 'rgba(255,230,210,0.06)' : 'rgba(0,0,0,0.18)';
          g.fillRect(rng.range(x0 + 4, x1 - 4), rng.range(y + 4, y + 76), rng.range(1, 3), rng.range(1, 3));
        }
      }
      // the lip where the wall meets the floor
      const lx = x0 === 0 ? WL : WR;
      const lg = g.createLinearGradient(lx - 8, 0, lx + 8, 0);
      if (x0 === 0) {
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(0.5, 'rgba(255,220,180,0.15)');
        lg.addColorStop(0.55, 'rgba(10,5,15,0.6)');
        lg.addColorStop(1, 'rgba(10,5,15,0)');
      } else {
        lg.addColorStop(0, 'rgba(10,5,15,0)');
        lg.addColorStop(0.45, 'rgba(10,5,15,0.6)');
        lg.addColorStop(0.5, 'rgba(255,220,180,0.15)');
        lg.addColorStop(1, 'rgba(0,0,0,0)');
      }
      g.fillStyle = lg;
      g.fillRect(lx - 8, 0, 16, TILE);
    }
  }, 2);
}

function paintCart(charred) {
  return makeSprite(48, 64, (g) => {
    // wheels poking out at the sides
    for (const [x, y] of [[-23, -18], [19, -18], [-23, 14], [19, 14]]) {
      g.fillStyle = '#1d1a1f';
      g.fillRect(x, y, 4, 12);
      g.fillStyle = '#6a6470';
      g.fillRect(x + 1, y + 1, 2, 10);
    }
    // the body, a little wider at the top rim
    const body = g.createLinearGradient(-20, 0, 20, 0);
    body.addColorStop(0, charred ? '#2a201a' : '#6b4022');
    body.addColorStop(0.5, charred ? '#3d2c22' : '#a5683a');
    body.addColorStop(1, charred ? '#211812' : '#5a341c');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-20, -29, 40, 58, 5);
    g.fill();
    // planks
    g.strokeStyle = 'rgba(40,20,8,0.5)';
    g.lineWidth = 1;
    for (const x of [-10, 0, 10]) {
      g.beginPath();
      g.moveTo(x, -28);
      g.lineTo(x, 28);
      g.stroke();
    }
    // iron bands and rivets
    for (const y of [-26, 24]) {
      const ig = g.createLinearGradient(0, y, 0, y + 4);
      ig.addColorStop(0, '#c4c0c6');
      ig.addColorStop(1, '#55515a');
      g.fillStyle = ig;
      g.fillRect(-21, y, 42, 4);
      g.fillStyle = '#e8e4ea';
      for (const x of [-17, -6, 6, 17]) g.fillRect(x - 0.8, y + 1, 1.6, 1.6);
    }
    // the dark inside
    const inside = g.createLinearGradient(0, -20, 0, 22);
    inside.addColorStop(0, '#1b120c');
    inside.addColorStop(1, '#2f1e12');
    g.fillStyle = inside;
    g.beginPath();
    g.roundRect(-15, -21, 30, 44, 3);
    g.fill();
    // the golden idol at the front, glinting
    const idol = g.createRadialGradient(-2, -15, 1, 0, -12, 8);
    idol.addColorStop(0, '#fff7c8');
    idol.addColorStop(0.5, '#ffcf4a');
    idol.addColorStop(1, '#a8680f');
    g.fillStyle = idol;
    g.beginPath();
    g.ellipse(0, -12, 7, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a5208';
    g.fillRect(-3, -13, 2, 1.5);
    g.fillRect(1, -13, 2, 1.5);
    // the explorer: khaki shoulders, a satchel strap, and the fedora seen from above
    const sh = g.createLinearGradient(-13, 0, 13, 0);
    sh.addColorStop(0, '#8a7448');
    sh.addColorStop(0.5, '#c8ad72');
    sh.addColorStop(1, '#7a6440');
    g.fillStyle = sh;
    g.beginPath();
    g.ellipse(0, 8, 13, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#5a3a1c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-9, 4);
    g.lineTo(8, 12);
    g.stroke();
    // arms reaching forward to the rim
    g.fillStyle = '#c8ad72';
    g.fillRect(-14, -6, 5, 12);
    g.fillRect(9, -6, 5, 12);
    g.fillStyle = '#e2b48a';
    g.beginPath();
    g.arc(-11.5, -7, 2.6, 0, Math.PI * 2);
    g.arc(11.5, -7, 2.6, 0, Math.PI * 2);
    g.fill();
    const brim = g.createRadialGradient(-2, 2, 2, 0, 4, 11);
    brim.addColorStop(0, '#8a5a2e');
    brim.addColorStop(1, '#4e3016');
    g.fillStyle = brim;
    g.beginPath();
    g.ellipse(0, 4, 11, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1a0e';
    g.beginPath();
    g.ellipse(0, 4, 7.4, 6.6, 0, 0, Math.PI * 2);
    g.fill();
    const crown = g.createRadialGradient(-2, 2, 1, 0, 4, 7);
    crown.addColorStop(0, '#b07a42');
    crown.addColorStop(1, '#6a4320');
    g.fillStyle = crown;
    g.beginPath();
    g.ellipse(0, 4, 6.4, 5.6, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(30,15,5,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(0, 9);
    g.stroke();
    if (charred) {
      g.fillStyle = 'rgba(20,12,10,0.55)';
      g.fillRect(-24, -32, 48, 64);
    }
  });
}

function paintBoulder() {
  return makeSprite(BR * 2 + 8, BR * 2 + 8, (g) => {
    const sg = g.createRadialGradient(-BR * 0.35, -BR * 0.4, BR * 0.1, 0, 0, BR);
    sg.addColorStop(0, '#b3a48e');
    sg.addColorStop(0.5, '#7d6e5e');
    sg.addColorStop(0.85, '#4d4239');
    sg.addColorStop(1, '#2c241f');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(0, 0, BR, 0, Math.PI * 2);
    g.fill();
    // pits and lichen
    for (let i = 0; i < 70; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const r = Math.sqrt((i * 37) % 97 / 97) * BR * 0.92;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      g.fillStyle = i % 3 ? 'rgba(40,30,25,0.25)' : 'rgba(120,150,90,0.25)';
      g.beginPath();
      g.arc(x, y, 1.5 + ((i * 13) % 7) * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    // rim light from the torches
    g.strokeStyle = 'rgba(255,190,120,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, BR - 2, Math.PI * 1.05, Math.PI * 1.7);
    g.stroke();
  }, 2);
}

function paintBlade() {
  return makeSprite(70, 28, (g) => {
    // a crescent axe head with a bright honed edge (the edge faces forward, up the screen)
    const bg = g.createLinearGradient(0, -12, 0, 12);
    bg.addColorStop(0, '#f4f6fa');
    bg.addColorStop(0.35, '#a9b0bc');
    bg.addColorStop(1, '#4a4f5a');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(-33, -2);
    g.quadraticCurveTo(0, -18, 33, -2);
    g.quadraticCurveTo(0, 2, -33, -2);
    g.lineTo(-30, 6);
    g.quadraticCurveTo(0, -2, 30, 6);
    g.lineTo(33, -2);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-31, -3);
    g.quadraticCurveTo(0, -17, 31, -3);
    g.stroke();
    // the hub
    const hg = g.createRadialGradient(-1, 4, 1, 0, 5, 7);
    hg.addColorStop(0, '#d8b46a');
    hg.addColorStop(1, '#6a4a1c');
    g.fillStyle = hg;
    g.beginPath();
    g.arc(0, 5, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a1e10';
    g.beginPath();
    g.arc(0, 5, 2, 0, Math.PI * 2);
    g.fill();
  });
}

function paintBeam() {
  return makeSprite(250, 22, (g) => {
    const wg = g.createLinearGradient(0, -9, 0, 9);
    wg.addColorStop(0, '#8b6038');
    wg.addColorStop(0.5, '#6a4426');
    wg.addColorStop(1, '#3e2614');
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-122, -4, 248, 16);
    g.fillStyle = wg;
    g.fillRect(-125, -9, 250, 16);
    g.strokeStyle = 'rgba(30,15,5,0.45)';
    g.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(-122, -6 + k * 3.5);
      g.bezierCurveTo(-40, -7 + k * 3.5, 40, -4 + k * 3.5, 122, -6 + k * 3.5);
      g.stroke();
    }
    for (const x of [-110, -6, 6, 110]) {
      g.fillStyle = '#2e2a30';
      g.fillRect(x - 5, -9, 10, 16);
      g.fillStyle = '#a8a2aa';
      g.fillRect(x - 1.5, -5, 3, 3);
      g.fillRect(x - 1.5, 1, 3, 3);
    }
  });
}

function paintBlock() {
  return makeSprite(136, 62, (g) => {
    const sg = g.createLinearGradient(0, -31, 0, 31);
    sg.addColorStop(0, '#9a8e88');
    sg.addColorStop(0.5, '#6d635f');
    sg.addColorStop(1, '#433b3a');
    g.fillStyle = sg;
    g.beginPath();
    g.roundRect(-68, -31, 136, 62, 4);
    g.fill();
    g.fillStyle = 'rgba(255,240,225,0.15)';
    g.fillRect(-66, -29, 132, 3);
    // a carved stern face
    g.strokeStyle = 'rgba(25,18,20,0.6)';
    g.lineWidth = 2.5;
    g.strokeRect(-58, -23, 116, 46);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-30, -10);
    g.lineTo(-12, -6);
    g.moveTo(30, -10);
    g.lineTo(12, -6);
    g.moveTo(-18, 12);
    g.lineTo(18, 12);
    g.moveTo(-18, 12);
    g.lineTo(-22, 6);
    g.moveTo(18, 12);
    g.lineTo(22, 6);
    g.stroke();
    // eye sockets (the glow is drawn per frame)
    g.fillStyle = '#1e1618';
    for (const x of [-21, 21]) {
      g.beginPath();
      g.ellipse(x, 0, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,240,230,0.08)' : 'rgba(0,0,0,0.2)';
      g.fillRect(((i * 53) % 128) - 64, ((i * 29) % 56) - 28, 2, 2);
    }
  });
}

function paintPlate() {
  return makeSprite(150, 66, (g) => {
    g.fillStyle = 'rgba(20,14,18,0.55)';
    g.fillRect(-75, -33, 150, 66);
    g.strokeStyle = 'rgba(120,40,30,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(-72, -30, 144, 60);
    // scrape marks and a dark stain where things got flattened before
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = -60 + i * 15;
      g.beginPath();
      g.moveTo(x, -26);
      g.lineTo(x + 6, 26);
      g.stroke();
    }
    const st = g.createRadialGradient(20, 6, 2, 20, 6, 26);
    st.addColorStop(0, 'rgba(90,20,15,0.4)');
    st.addColorStop(1, 'rgba(90,20,15,0)');
    g.fillStyle = st;
    g.fillRect(-10, -24, 60, 56);
  });
}

function paintDragon() {
  // a bronze dragon head set into the left wall, mouth facing right (mirrored for the right wall)
  return makeSprite(40, 36, (g) => {
    const bg = g.createLinearGradient(-20, -14, 20, 14);
    bg.addColorStop(0, '#d9a54e');
    bg.addColorStop(0.5, '#8f5f24');
    bg.addColorStop(1, '#4a2e10');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(-20, -15);
    g.quadraticCurveTo(4, -18, 18, -6);
    g.lineTo(12, -2);
    g.lineTo(18, 3);
    g.quadraticCurveTo(4, 18, -20, 15);
    g.closePath();
    g.fill();
    // horns and an eye
    g.fillStyle = '#e8c272';
    g.beginPath();
    g.moveTo(-14, -14);
    g.lineTo(-20, -18);
    g.lineTo(-8, -14);
    g.fill();
    g.fillStyle = '#ff4a1a';
    g.beginPath();
    g.arc(2, -8, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c0d06';
    g.beginPath();
    g.moveTo(18, -6);
    g.lineTo(8, -1);
    g.lineTo(18, 3);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,20,5,0.5)';
    g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(-12 + k * 6, 6, 3, 0, Math.PI);
      g.stroke();
    }
  });
}

function paintChasm() {
  return makeSprite(WR - WL, 100, (g) => {
    const w = WR - WL;
    const pit = g.createLinearGradient(0, -50, 0, 50);
    pit.addColorStop(0, '#05030a');
    pit.addColorStop(0.5, '#0c0812');
    pit.addColorStop(1, '#1a1220');
    g.fillStyle = pit;
    g.beginPath();
    g.moveTo(-w / 2, -50);
    for (let x = -w / 2; x <= w / 2; x += 11) g.lineTo(x, -50 + ((x * 7919) % 5 + 5) % 5);
    g.lineTo(w / 2, 50);
    for (let x = w / 2; x >= -w / 2; x -= 13) g.lineTo(x, 50 - ((x * 104729) % 6 + 6) % 6);
    g.closePath();
    g.fill();
    // the far wall of the pit catches a little light
    const far = g.createLinearGradient(0, 30, 0, 50);
    far.addColorStop(0, 'rgba(120,90,110,0)');
    far.addColorStop(1, 'rgba(120,90,110,0.35)');
    g.fillStyle = far;
    g.fillRect(-w / 2, 30, w, 20);
    // a faint red glow from deep below
    const deep = g.createRadialGradient(0, 0, 4, 0, 0, w / 2);
    deep.addColorStop(0, 'rgba(160,40,20,0.28)');
    deep.addColorStop(1, 'rgba(160,40,20,0)');
    g.fillStyle = deep;
    g.fillRect(-w / 2, -50, w, 100);
  });
}

function paintRamp() {
  return makeSprite(96, 34, (g) => {
    const wg = g.createLinearGradient(0, 17, 0, -17);
    wg.addColorStop(0, '#5a3a20');
    wg.addColorStop(1, '#a8743f');
    g.fillStyle = wg;
    g.beginPath();
    g.moveTo(-40, 17);
    g.lineTo(40, 17);
    g.lineTo(44, -17);
    g.lineTo(-44, -17);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(40,20,8,0.5)';
    g.lineWidth = 1;
    for (let y = -12; y < 17; y += 7) {
      g.beginPath();
      g.moveTo(-42, y);
      g.lineTo(42, y);
      g.stroke();
    }
    for (const x of [-22, 22]) {
      const rg = g.createLinearGradient(x - 3, 0, x + 3, 0);
      rg.addColorStop(0, '#5b5960');
      rg.addColorStop(0.45, '#e8e4e8');
      rg.addColorStop(1, '#6a666e');
      g.fillStyle = rg;
      g.fillRect(x - 3, -17, 6, 34);
    }
  });
}

function paintTorch() {
  return makeSprite(18, 22, (g) => {
    g.fillStyle = '#3a2c22';
    g.fillRect(-7, 4, 14, 6);
    g.fillStyle = '#6a4a30';
    g.beginPath();
    g.moveTo(-5, -4);
    g.lineTo(5, -4);
    g.lineTo(3, 8);
    g.lineTo(-3, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8a050';
    g.fillRect(-5, -5, 10, 2.5);
  });
}

function paintVine(rng) {
  return makeSprite(34, 90, (g) => {
    g.strokeStyle = '#3e5a26';
    g.lineWidth = 2;
    for (let s = 0; s < 3; s++) {
      let x = rng.range(-10, 10);
      g.beginPath();
      g.moveTo(x, -45);
      for (let y = -45; y < rng.range(10, 44); y += 6) {
        x += rng.range(-3, 3);
        g.lineTo(x, y);
        if (rng.chance(0.7)) {
          g.save();
          g.fillStyle = rng.chance(0.5) ? '#5f8a34' : '#7aa842';
          g.translate(x, y);
          g.rotate(rng.range(-1.2, 1.2));
          g.beginPath();
          g.ellipse(4, 0, 5, 2.4, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
      g.stroke();
    }
  });
}

function paintGlyph(rng) {
  return makeSprite(44, 64, (g) => {
    g.fillStyle = 'rgba(20,14,24,0.35)';
    g.fillRect(-18, -28, 36, 56);
    g.strokeStyle = 'rgba(255,200,110,0.32)';
    g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const y = -18 + k * 18;
      const kind = rng.int(0, 3);
      g.beginPath();
      if (kind === 0) {
        g.arc(0, y, 6, 0, Math.PI * 2);
        g.moveTo(-8, y);
        g.lineTo(8, y);
      } else if (kind === 1) {
        g.moveTo(-8, y + 6);
        g.lineTo(0, y - 6);
        g.lineTo(8, y + 6);
        g.closePath();
      } else if (kind === 2) {
        g.moveTo(-8, y - 5);
        g.lineTo(8, y - 5);
        g.moveTo(0, y - 5);
        g.lineTo(0, y + 6);
        g.arc(0, y + 2, 4, 0, Math.PI);
      } else {
        g.moveTo(-7, y - 6);
        g.quadraticCurveTo(8, y, -7, y + 6);
        g.moveTo(4, y - 6);
        g.lineTo(4, y + 6);
      }
      g.stroke();
    }
  });
}

// ---------- the game ----------

export default {
  id: 'cart',
  title: 'Runaway Cart',
  emoji: '🛤️',
  tagline: 'Right speeds up, left brakes. Time every trap; outrun the boulder.',
  colors: { bg: '#1e1a24', fg: '#ffe9c4', accent: '#ffb347' },

  // Tribal techno in A Phrygian, 140 BPM: four-on-the-floor kick, rolling floor toms and a rolling
  // offbeat sawtooth bass from bar one, then claps, a marimba-like triangle riff and adventure brass
  // stabs, then a triangle "pan flute" tune with vibrato and echoes over a shaker, and a finale with
  // 16th-note toms, a 16th marimba arpeggio and the tune doubled an octave down. 35 bars = 60s.
  music: {
    cps: 35 / 60,
    setup: `
      const kick = note("c2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
      const toms = note("~ ~ a2 ~ ~ e3 ~ ~ a2 ~ ~ ~ c3 ~ a2 e2").s("sine").decay(0.16).sustain(0).gain(0.36)
      const toms16 = note("a2 e3 a2 c3 a2 e3 g3 e3 a2 e3 a2 c3 g3 e3 c3 a2").s("sine").decay(0.11).sustain(0)
        .gain("[0.4 0.22 0.3 0.22]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(5000).gain(0.15).room(0.35)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(7000).gain(0.05)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.045 0.03 0.04]*4")
      const bass = note("<a2 a2 bb2 g2>").struct("[~ x x x]*4").s("sawtooth").decay(0.1).sustain(0.15).release(0.04)
        .lpf(saw.range(450, 1300).slow(35)).lpq(5).gain("[0 0.42 0.3 0.36]*4")
      const riff = "<[a4 ~ c5 a4 ~ e5 ~ a4 ~ c5 ~ d5 e5 ~ c5 ~] [a4 ~ c5 a4 ~ e5 ~ a4 ~ f5 ~ e5 d5 ~ c5 ~] [bb4 ~ d5 bb4 ~ f5 ~ bb4 ~ d5 ~ e5 f5 ~ d5 ~] [g4 ~ bb4 g4 ~ d5 ~ g4 ~ c5 ~ bb4 a4 ~ g4 ~]>"
      const marimba = note(riff).s("triangle").decay(0.12).sustain(0).lpf(3200).gain(0.1).pan(0.4)
      const arp = note("<[a5 e5 c5 e5]*4 [a5 e5 c5 e5]*4 [bb5 f5 d5 f5]*4 [g5 d5 bb4 d5]*4>").s("triangle")
        .decay(0.07).sustain(0).lpf(3600).gain(0.045).pan(sine.range(0.3, 0.7).slow(2))
      const brass = note("<[a3,c4,e4] [a3,c4,e4] [bb3,d4,f4] [g3,c4,e4]>").struct("x ~ ~ x ~ ~ x ~ ~ ~ ~ ~ ~ ~ ~ ~")
        .s("sawtooth").decay(0.25).sustain(0.2).release(0.08).lpf(saw.range(1000, 2200).slow(35)).gain(0.08).room(0.3)
      const tune = "<[e5 ~ f5 e5 d5 ~ c5 ~] [d5 ~ e5 f5 e5 ~ ~ ~] [f5 ~ g5 f5 e5 ~ d5 c5] [d5 ~ bb4 ~ a4 ~ ~ ~]>"
      const lead = note(tune).s("triangle").decay(0.3).sustain(0.3).release(0.1).lpf(3000).vib(5).vibmod(0.25)
        .gain(0.13).room(0.35).delay(0.25).delaytime(0.32).delayfeedback(0.3).pan(0.55)
      const lead2 = note(tune).add(note(-12)).s("square").decay(0.2).sustain(0.25).release(0.05)
        .lpf(1500).gain(0.045).pan(0.4)
    `,
    song: `arrange(
      [8, stack(kick, toms, hats, bass)],
      [9, stack(kick, toms, clap, hats, bass, marimba, brass)],
      [9, stack(kick, toms, clap, hats, shaker, bass, marimba, brass, lead)],
      [9, stack(kick, toms16, clap, hats, shaker, bass, marimba, arp, brass, lead, lead2)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const plan = rng.fork('plan');
    const tiles = [paintTile(art), paintTile(art)];
    const cartArt = paintCart(false);
    const charredArt = paintCart(true);
    const boulderArt = paintBoulder();
    const bladeArt = paintBlade();
    const beamArt = paintBeam();
    const blockArt = paintBlock();
    const plateArt = paintPlate();
    const dragonArt = paintDragon();
    const chasmArt = paintChasm();
    const rampArt = paintRamp();
    const torchArt = paintTorch();
    const vines = [paintVine(art), paintVine(art), paintVine(art)];
    const glyphs = [paintGlyph(art), paintGlyph(art), paintGlyph(art)];
    const torchGlow = glowSprite('rgba(255,160,70,1)', 60);
    const fireGlow = glowSprite('rgba(255,120,30,1)', 30);
    const hotGlow = glowSprite('rgba(255,230,140,1)', 20);
    const redGlow = glowSprite('rgba(255,40,30,1)', 40);
    const greenGlow = glowSprite('rgba(90,255,120,1)', 20);
    const goldGlow = glowSprite('rgba(255,210,90,1)', 30);
    const lampGlow = glowSprite('rgba(255,200,130,1)', 90);
    const shade = makeSprite(W, H, (g) => {
      g.translate(-W / 2, -H / 2);
      const sg = g.createLinearGradient(0, 0, 0, H);
      sg.addColorStop(0, 'rgba(8,4,14,0.5)');
      sg.addColorStop(0.35, 'rgba(8,4,14,0.22)');
      sg.addColorStop(0.75, 'rgba(8,4,14,0.08)');
      sg.addColorStop(1, 'rgba(8,4,14,0.35)');
      g.fillStyle = sg;
      g.fillRect(0, 0, W, H);
    }, 1);
    const vignette = vignetteSprite(W, H, 0.6, '10,4,16');
    const fx = createParticles(); // additive: sparks, embers, glints
    const dust = createParticles(); // normal: dust, rubble

    // ---- the hidden reference ride: the cart's own physics chasing a changing target speed ----
    // Every trap is timed so this ride passes through it in an open moment, and every chasm is
    // only kept if this ride reaches it fast enough, so there's always a way through.
    const RDT = 1 / 120;
    const RN = Math.ceil(64 / RDT);
    const segs = [];
    for (let i = 0; i < 60; i++) segs.push({ u: plan.next(), d: plan.range(1.6, 3.2) });
    const ride = (gaps) => {
      const S = new Float32Array(RN + 1);
      const V = new Float32Array(RN + 1);
      const kept = [];
      let s = 0;
      let v = V0;
      let sb = -GAP0;
      let tgt = 175;
      let segEnd = 3;
      let si = 0;
      let gi = 0;
      let air = null;
      for (let i = 0; i <= RN; i++) {
        const t = i * RDT;
        S[i] = s;
        V[i] = v;
        if (t >= segEnd) {
          const gap = s - HL - sb;
          const vb = boulderV(t);
          const lo = Math.max(120, gap > 300 ? vb - 50 : gap > 200 ? vb + 5 : vb + 70);
          const seg = segs[Math.min(si++, segs.length - 1)];
          tgt = lerp(lo, VMAX - 15, seg.u);
          segEnd = t + seg.d;
        }
        if (s - HL - sb < 130) tgt = VMAX - 10; // never let the boulder get close
        if (air) {
          if (s >= air.e) air = null;
        } else if (v < tgt) v = Math.min(tgt, v + ACC * RDT);
        else v = Math.max(tgt, v - BRK * RDT);
        const ps = s;
        s += v * RDT;
        sb += boulderV(t) * RDT;
        while (gi < gaps.length && gaps[gi].s <= s) {
          const c = gaps[gi++];
          if (air || c.s <= ps - 1) continue;
          // keep it only if this ride arrives comfortably fast; ask for a little less than that
          if (v >= 190) {
            c.vreq = clamp(v - plan.range(18, 34), 165, 290);
            kept.push(c);
            air = c;
          }
        }
      }
      return { S, V, kept };
    };
    const timeIn = (S, s) => {
      let lo = 0;
      let hi = RN;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (S[mid] < s) lo = mid + 1;
        else hi = mid;
      }
      return lo * RDT;
    };

    // first pass, without chasms: lay out the slots along the rails
    const first = ride([]);
    const slots = [];
    {
      let hs = FIRST;
      let n = 0;
      let lastGap = -1e9;
      const sEnd = first.S[RN] - 200;
      while (hs < sEnd) {
        const ta = timeIn(first.S, hs);
        if (ta > 61) break;
        const p = progress(ta, 60, 1.1);
        let kind;
        if (n === 0) kind = 'blade';
        else if (ta > GAPS_FROM && first.V[Math.round(ta / RDT)] >= 215 && hs - lastGap > 600 && plan.chance(0.4)) kind = 'gap';
        else {
          const r = plan.next();
          kind = r < 0.38 ? 'blade' : r < 0.72 ? 'crusher' : 'fire';
          if (ta < 6 && kind === 'fire') kind = 'crusher';
        }
        const slot = { kind, s: hs, p };
        if (kind === 'gap') {
          slot.L = plan.range(lerp(60, 85, p), lerp(80, 115, p));
          slot.e = hs + slot.L;
          lastGap = slot.e;
          hs = slot.e;
        }
        slots.push(slot);
        n++;
        let step = lerp(400, 205, p) * plan.range(0.8, 1.2);
        if (ta > 28 && kind !== 'gap' && plan.chance(lerp(0.1, 0.35, p))) step = plan.range(120, 150); // a back-to-back pair
        hs += step;
      }
    }
    // second pass, flying over the chasms (and dropping any it can't jump)
    const gapSlots = slots.filter((x) => x.kind === 'gap');
    const { S: refS, V: refV, kept: chasms } = ride(gapSlots);
    const refTime = (s) => timeIn(refS, s);

    // the traps, each timed so the reference ride passes through an open moment
    const traps = [];
    for (const slot of slots) {
      if (slot.kind === 'gap') continue;
      const { kind, s: hs, p } = slot;
      const hl = kind === 'blade' ? 10 : kind === 'crusher' ? 50 : 24;
      const tin = refTime(hs - hl / 2 - HL);
      const tout = refTime(hs + hl / 2 + HL);
      const occ = tout - tin;
      const tm = (tin + tout) / 2;
      const trap = { kind, s: hs, hl, slam: -1 };
      if (kind === 'blade') {
        trap.A = 118;
        trap.P = plan.range(lerp(2.6, 1.7, p), lerp(3.1, 2.1, p));
        // open while |sin| ≥ 30/A; aim the ride's midpoint at a swing's far end, with a little slack
        const open = (trap.P / 2) * (1 - (2 * Math.asin(30 / trap.A)) / Math.PI);
        const slack = Math.max(0, open - occ - 0.12) / 2;
        const tc = tm + plan.range(-slack, slack);
        trap.ph = Math.PI / 2 - (2 * Math.PI * tc) / trap.P + (plan.chance(0.5) ? Math.PI : 0);
      } else if (kind === 'crusher') {
        const O = Math.max(occ + lerp(0.75, 0.32, p), 0.6) + plan.range(0, 0.3);
        trap.O = O;
        trap.P = CRUSH.rise + O + CRUSH.warn + CRUSH.fall + CRUSH.dwell;
        const slack = Math.max(0, O - occ - 0.1) / 2;
        trap.t0 = tm + plan.range(-slack, slack) - (CRUSH.rise + O / 2);
      } else {
        const O = Math.max(occ + lerp(0.7, 0.3, p), 0.55) + plan.range(0, 0.3);
        trap.O = O;
        trap.D = plan.range(lerp(0.6, 0.85, p), lerp(0.8, 1.15, p));
        trap.P = O + FIRE.warn + trap.D;
        const slack = Math.max(0, O - occ - 0.1) / 2;
        trap.t0 = tm + plan.range(-slack, slack) - O / 2;
      }
      traps.push(trap);
    }

    const frac = (x) => x - Math.floor(x);
    const bladeX = (tr, t) => tr.A * Math.sin((2 * Math.PI * t) / tr.P + tr.ph);
    // 1 = fully raised, 0 = slammed down; and how far into its warning shake it is
    const crusherState = (tr, t) => {
      const c = frac((t - tr.t0) / tr.P) * tr.P;
      const { rise, warn, fall } = CRUSH;
      if (c < rise) return { h: c / rise, warn: 0, c };
      if (c < rise + tr.O) return { h: 1, warn: 0, c };
      if (c < rise + tr.O + warn) return { h: 1, warn: (c - rise - tr.O) / warn, c };
      if (c < rise + tr.O + warn + fall) return { h: 1 - (c - rise - tr.O - warn) / fall, warn: 1, c };
      return { h: 0, warn: 1, c };
    };
    // 0 = off, 0..1 = sputtering warning, 2 = roaring
    const fireState = (tr, t) => {
      const c = frac((t - tr.t0) / tr.P) * tr.P;
      if (c < tr.O) return 0;
      if (c < tr.O + FIRE.warn) return (c - tr.O) / FIRE.warn;
      return 2;
    };
    const deadly = (tr, t) => {
      if (tr.kind === 'blade') return Math.abs(bladeX(tr, t)) < 30;
      if (tr.kind === 'crusher') return crusherState(tr, t).h < 0.6;
      return fireState(tr, t) === 2;
    };

    // ---- wall decoration along the corridor (cosmetic) ----
    const decor = [];
    for (let s = 120, side = 1; s < refS[RN] + 1200; s += art.range(70, 130), side = -side) {
      const r = art.next();
      decor.push({ s, side, kind: r < 0.45 ? 'torch' : r < 0.75 ? 'glyph' : 'vine', i: art.int(0, 2), fl: art.range(0, 6) });
    }

    // ---- state ----
    const cart = { s: 0, v: V0, air: null, pump: 0 };
    let sb = -GAP0;
    let roll = 0;
    let clock = 0;
    let shake = 0;
    let deathKind = '';
    let deathT = 0;
    let fallK = 0;
    let gapAhead = null;
    let ti0 = 0; // first trap that might still matter
    let ci0 = 0;

    const screenY = (s) => CY - (s - cart.s);

    const die = (game, kind, reason) => {
      game.dead = true;
      game.deathReason = reason;
      deathKind = kind;
      deathT = 0;
      if (kind === 'blade') {
        fx.burst(CX, CY - 6, { count: 34, speed: 260, life: 0.7, size: 3, drag: 2, colors: ['#ffffff', '#dfe6f0', ...SPARKS] });
        dust.burst(CX, CY, { count: 16, speed: 160, life: 0.9, size: 4, drag: 2.5, colors: ['#a5683a', '#6b4022', '#c8ad72'] });
      } else if (kind === 'crusher') {
        dust.burst(CX, CY, { count: 46, speed: 230, life: 1.1, size: 6, drag: 2.5, colors: DUST });
        shake = 0.5;
      } else if (kind === 'fire') {
        fx.burst(CX, CY, { count: 50, speed: 180, life: 1.1, size: 4, drag: 1.5, gravity: -80, colors: EMBERS });
      } else if (kind === 'boulder') {
        dust.burst(CX, CY + 10, { count: 50, speed: 260, life: 1.1, size: 6, drag: 2.2, colors: [...DUST, '#a5683a'] });
        fx.burst(CX, CY - 10, { count: 20, speed: 200, life: 0.9, size: 3, round: true, drag: 2, colors: GOLD });
        shake = 0.6;
      } else {
        fx.burst(CX, CY - 12, { count: 14, speed: 120, life: 0.8, size: 3, round: true, drag: 2, colors: GOLD });
      }
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      fx.update(dt);
      dust.update(dt);
      // torch embers drifting up the screen as the corridor slides by
      if (Math.random() < dt * 6) {
        const x = Math.random() < 0.5 ? WL - 8 : WR + 8;
        fx.burst(x, Math.random() * H * 0.85, { count: 1, speed: 20, angle: -Math.PI / 2, spread: 1, life: 1.2, size: 2, round: true, colors: EMBERS });
      }
    };

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        updateCosmetic(dt);
        const vb = boulderV(t);
        const prevS = cart.s;
        if (cart.air) {
          cart.s += cart.v * dt;
          if (cart.s >= cart.air.e) {
            cart.air = null;
            fx.burst(CX, CY + 20, { count: 18, speed: 180, life: 0.5, size: 2.5, drag: 2, colors: SPARKS });
            shake = Math.max(shake, 0.18);
          }
        } else {
          if (dir > 0) cart.v = Math.min(VMAX, cart.v + ACC * dt);
          else if (dir < 0) cart.v = Math.max(0, cart.v - BRK * dt);
          else cart.v = Math.max(0, cart.v - DRAG * dt);
          cart.s += cart.v * dt;
          if (dir > 0) cart.pump += dt * 9;
          if (dir < 0 && cart.v > 20 && Math.random() < dt * 40) {
            for (const x of [CX - 22, CX + 22]) {
              fx.burst(x, CY + 26, { count: 1, speed: 120, angle: Math.PI / 2, spread: 0.9, life: 0.35, size: 2.2, colors: SPARKS });
            }
          }
        }
        if (cart.v > 230 && Math.random() < dt * 20) {
          dust.burst(CX + (Math.random() - 0.5) * 50, CY + 30, { count: 1, speed: 40, angle: Math.PI / 2, spread: 1, life: 0.5, size: 3, drag: 1, colors: DUST });
        }
        roll += (vb * dt) / BR;
        sb += vb * dt;

        // chasms: jump if fast enough at the lip, otherwise fall in
        while (ci0 < chasms.length && chasms[ci0].e < cart.s - 40) ci0++;
        gapAhead = null;
        for (let i = ci0; i < chasms.length; i++) {
          const c = chasms[i];
          if (c.s - cart.s > 720) break;
          if (c.s > cart.s - 1) {
            gapAhead = c;
            break;
          }
        }
        for (let i = ci0; i < chasms.length && !cart.air; i++) {
          const c = chasms[i];
          if (c.s > cart.s) break;
          if (c.s > prevS && c.s <= cart.s) {
            if (cart.v >= c.vreq) {
              cart.air = { s: c.s, e: c.e, v: cart.v };
              dust.burst(CX, CY + 20, { count: 10, speed: 120, angle: Math.PI / 2, spread: 1.4, life: 0.5, size: 3, drag: 2, colors: DUST });
            } else {
              cart.fall = c;
              return die(this, 'gap', 'Too slow for the jump. The cart dropped into the chasm.');
            }
          }
        }

        if (sb > cart.s - HL) return die(this, 'boulder', 'The boulder caught up and rolled right over you.');

        while (ti0 < traps.length && traps[ti0].s + traps[ti0].hl / 2 + HL < cart.s) ti0++;
        for (let i = ti0; i < traps.length; i++) {
          const tr = traps[i];
          if (tr.s - tr.hl / 2 - HL > cart.s) break;
          if (deadly(tr, t)) {
            if (tr.kind === 'blade') return die(this, 'blade', 'Sliced by a swinging blade.');
            if (tr.kind === 'crusher') return die(this, 'crusher', 'Flattened by a falling stone block.');
            return die(this, 'fire', 'Roasted by the fire jets.');
          }
        }

        // block slams and fire roars throw out dust and embers (cosmetic, only near the screen)
        for (let i = ti0; i < traps.length; i++) {
          const tr = traps[i];
          const y = screenY(tr.s);
          if (y < -80) break;
          if (tr.kind === 'crusher') {
            const st = crusherState(tr, t);
            const down = st.h === 0;
            if (down && tr.slam !== Math.floor((t - tr.t0) / tr.P)) {
              tr.slam = Math.floor((t - tr.t0) / tr.P);
              dust.burst(CX - 60, y, { count: 8, speed: 110, angle: Math.PI, spread: 1.4, life: 0.6, size: 4, drag: 2.5, colors: DUST });
              dust.burst(CX + 60, y, { count: 8, speed: 110, angle: 0, spread: 1.4, life: 0.6, size: 4, drag: 2.5, colors: DUST });
              if (Math.abs(y - CY) < 260) shake = Math.max(shake, 0.12);
            }
            if (st.warn > 0 && st.h === 1 && Math.random() < dt * 30) {
              dust.burst(CX + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 40, { count: 1, speed: 30, angle: Math.PI / 2, spread: 0.5, life: 0.5, size: 2.5, colors: DUST });
            }
          } else if (tr.kind === 'fire') {
            const st = fireState(tr, t);
            if (st === 2 && Math.random() < dt * 50) {
              const x = WL + Math.random() * (WR - WL);
              fx.burst(x, y + (Math.random() - 0.5) * 14, { count: 1, speed: 60, angle: -Math.PI / 2, spread: 2, life: 0.5, size: 3, round: true, colors: EMBERS });
            } else if (st > 0 && st < 1 && Math.random() < dt * 14) {
              for (const x of [WL + 6, WR - 6]) fx.burst(x, y, { count: 1, speed: 50, angle: x < CX ? 0 : Math.PI, spread: 0.8, life: 0.3, size: 2, round: true, colors: EMBERS });
            }
          }
        }
      },

      afterlife(dt) {
        updateCosmetic(dt);
        deathT += dt;
        if (deathKind === 'boulder') {
          sb += boulderV(60) * dt * Math.max(0, 1 - deathT);
          roll += (boulderV(60) * dt * Math.max(0, 1 - deathT)) / BR;
        }
        if (deathKind === 'gap') fallK = Math.min(1, fallK + dt * 1.6);
        if (deathKind === 'fire' && Math.random() < dt * 30) {
          fx.burst(CX + (Math.random() - 0.5) * 30, CY, { count: 1, speed: 40, angle: -Math.PI / 2, spread: 1, life: 0.8, size: 3, round: true, colors: EMBERS });
          dust.burst(CX, CY - 10, { count: 1, speed: 30, angle: -Math.PI / 2, spread: 0.8, life: 1.2, size: 6, colors: ['rgba(40,30,30,0.6)', 'rgba(70,60,60,0.5)'] });
        }
      },

      render(g, t) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.fillStyle = '#1e1a24';
        g.fillRect(-10, -10, W + 20, H + 20);

        // the corridor floor, scrolling past
        const k0 = Math.floor((cart.s - (H - CY) - 40) / TILE);
        for (let k = k0; k <= k0 + Math.ceil((H + 80) / TILE) + 1; k++) {
          const y = CY - (k * TILE + TILE - cart.s);
          if (y > H + 10 || y + TILE < -10) continue;
          g.drawImage(tiles[((k % 2) + 2) % 2].canvas, 0, y, 360, TILE);
        }

        // chasms and their ramps
        for (let i = ci0; i < chasms.length; i++) {
          const c = chasms[i];
          const yTop = screenY(c.e);
          const yBot = screenY(c.s);
          if (yBot < -40) break;
          if (yTop > H + 40) continue;
          g.drawImage(chasmArt.canvas, WL, yTop, WR - WL, yBot - yTop);
          // broken rail stubs hanging over the edges
          g.fillStyle = '#b8b4ba';
          for (const x of [CX - 25, CX + 19]) {
            g.fillRect(x, yBot - 8, 6, 8);
            g.fillRect(x, yTop, 6, 6);
          }
          drawSprite(g, rampArt, CX, yBot + 17);
          const ok = cart.v >= c.vreq || (cart.air && cart.air.s === c.s);
          const lamp = ok ? greenGlow : redGlow;
          g.globalCompositeOperation = 'lighter';
          for (const x of [CX - 52, CX + 52]) drawSprite(g, lamp, x, yBot + 8, { size: 34, alpha: 0.75 + 0.25 * Math.sin(clock * 12) });
          g.globalCompositeOperation = 'source-over';
          for (const x of [CX - 52, CX + 52]) {
            g.fillStyle = ok ? '#c8ffd0' : '#ffd0c8';
            g.beginPath();
            g.arc(x, yBot + 8, 3.5, 0, Math.PI * 2);
            g.fill();
          }
          // chevrons painted on the ramp approach
          g.strokeStyle = ok ? 'rgba(140,255,160,0.7)' : 'rgba(255,190,60,0.75)';
          g.lineWidth = 3;
          for (let j = 0; j < 3; j++) {
            const y = yBot + 52 + j * 18;
            g.beginPath();
            g.moveTo(CX - 14, y + 7);
            g.lineTo(CX, y);
            g.lineTo(CX + 14, y + 7);
            g.stroke();
          }
        }

        // floor plates under the crushers
        for (let i = ti0; i < traps.length; i++) {
          const tr = traps[i];
          const y = screenY(tr.s);
          if (y < -80) break;
          if (tr.kind === 'crusher' && y < H + 60) drawSprite(g, plateArt, CX, y);
        }

        // wall decoration
        const sTop = cart.s + CY + 60;
        const sBot = cart.s - (H - CY) - 60;
        for (const d of decor) {
          if (d.s < sBot) continue;
          if (d.s > sTop) break;
          const y = screenY(d.s);
          const x = d.side < 0 ? WL - 12 : WR + 12;
          if (d.kind === 'glyph') drawSprite(g, glyphs[d.i], d.side < 0 ? 36 : W - 36, y);
          else if (d.kind === 'vine') drawSprite(g, vines[d.i], d.side < 0 ? WL - 4 : WR + 4, y);
          else drawSprite(g, torchArt, x, y);
        }

        // traps below the cart's height: fire nozzles (the jets come later, over everything)
        for (let i = ti0; i < traps.length; i++) {
          const tr = traps[i];
          const y = screenY(tr.s);
          if (y < -80) break;
          if (y > H + 80) continue;
          if (tr.kind === 'fire') {
            drawSprite(g, dragonArt, WL + 6, y);
            g.save();
            g.translate(WR - 6, y);
            g.scale(-1, 1);
            drawSprite(g, dragonArt, 0, 0);
            g.restore();
            // scorch marks across the floor
            g.fillStyle = 'rgba(20,10,8,0.28)';
            g.fillRect(WL + 20, y - 9, WR - WL - 40, 18);
          }
          if (tr.kind === 'blade') {
            // the shadow of the swinging blade on the floor
            const bx = bladeX(tr, t);
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.beginPath();
            g.ellipse(CX + bx + 6, y + 10, 32, 6, 0, 0, Math.PI * 2);
            g.fill();
          }
        }

        // the cart
        let scale = 1;
        let cy = CY;
        if (cart.air) {
          const u = clamp((cart.s - cart.air.s) / (cart.air.e - cart.air.s), 0, 1);
          scale = 1 + 0.3 * Math.sin(Math.PI * u);
        }
        if (deathKind === 'gap') {
          scale = 1 - 0.75 * fallK;
          cy = CY - 20 * fallK;
        }
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.ellipse(CX + 4 + (scale - 1) * 30, CY + 6 + (scale - 1) * 40, 24, 32, 0, 0, Math.PI * 2);
        if (deathKind !== 'gap') g.fill();
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, lampGlow, CX, CY - 70, { size: 230, alpha: 0.22 });
        drawSprite(g, goldGlow, CX, cy - 12 * scale, { size: 40 * scale, alpha: 0.35 + 0.15 * Math.sin(clock * 5) });
        g.globalCompositeOperation = 'source-over';
        const crushed = deathKind === 'crusher' || deathKind === 'boulder';
        if (crushed) {
          g.save();
          g.translate(CX, cy);
          g.scale(1.25, 0.45);
          drawSprite(g, cartArt, 0, 0);
          g.restore();
        } else {
          const bob = cart.air || this.dead ? 0 : Math.sin(clock * 30) * Math.min(1, cart.v / 300) * 0.6;
          drawSprite(g, deathKind === 'fire' ? charredArt : cartArt, CX + bob, cy, { size: 48 * scale, alpha: deathKind === 'gap' ? 1 - fallK * 0.8 : 1 });
        }

        // overhead traps: crushing blocks, blades and their beams, fire jets
        for (let i = ti0; i < traps.length; i++) {
          const tr = traps[i];
          const y = screenY(tr.s);
          if (y < -90) break;
          if (y > H + 90) continue;
          if (tr.kind === 'crusher') {
            const st = crusherState(tr, t);
            const jig = st.warn > 0 && st.h === 1 ? Math.sin(clock * 70) * 2.2 : 0;
            const k = 1 + st.h * 0.28;
            g.fillStyle = `rgba(0,0,0,${0.5 - st.h * 0.25})`;
            g.fillRect(CX - 66, y - 28, 132, 56);
            drawSprite(g, blockArt, CX + jig + st.h * 8, y - st.h * 26, { size: 136 * k });
            const eye = st.warn > 0 ? 0.6 + 0.4 * st.warn : 0.18;
            g.globalCompositeOperation = 'lighter';
            for (const ex of [-21, 21]) drawSprite(g, redGlow, CX + jig + st.h * 8 + ex * k, y - st.h * 26, { size: 26 * k, alpha: eye });
            g.globalCompositeOperation = 'source-over';
          } else if (tr.kind === 'blade') {
            const bx = bladeX(tr, t);
            drawSprite(g, beamArt, CX, y - 26);
            // chain from the beam down to the blade
            g.strokeStyle = '#8f8a94';
            g.lineWidth = 2;
            g.setLineDash([3, 2]);
            g.beginPath();
            g.moveTo(CX, y - 26);
            g.lineTo(CX + bx, y - 4);
            g.stroke();
            g.setLineDash([]);
            const swing = Math.cos((2 * Math.PI * t) / tr.P + tr.ph);
            // a faint motion trail when it's moving fast through the middle
            if (Math.abs(bx) < 60) {
              g.fillStyle = 'rgba(220,230,255,0.12)';
              g.fillRect(CX + bx - (swing > 0 ? 40 : 0), y - 10, 40, 10);
            }
            drawSprite(g, bladeArt, CX + bx, y - 4, { rot: -bx / 700 });
          } else if (tr.kind === 'fire') {
            const st = fireState(tr, t);
            g.globalCompositeOperation = 'lighter';
            if (st > 0 && st < 2) {
              for (const x of [WL + 18, WR - 18]) drawSprite(g, fireGlow, x, y, { size: 22 + 26 * st, alpha: 0.4 + 0.5 * st * (0.6 + 0.4 * Math.random()) });
            } else if (st === 2) {
              for (let j = 0; j <= 10; j++) {
                const u = j / 10;
                const x = lerp(WL + 14, WR - 14, u);
                const fl = 0.75 + 0.25 * Math.random();
                drawSprite(g, fireGlow, x, y + (Math.random() - 0.5) * 6, { size: (66 - Math.abs(u - 0.5) * 30) * fl, alpha: 0.9 });
                if (j % 2 === 0) drawSprite(g, hotGlow, x, y, { size: 34 * fl, alpha: 0.85 });
              }
              drawSprite(g, torchGlow, CX, y, { size: 300, alpha: 0.35 });
            }
            g.globalCompositeOperation = 'source-over';
          }
        }

        // the boulder, rolling down the rails behind
        const by = CY + (cart.s - sb) + BR - HL * 0;
        if (by - BR < H + 10) {
          g.fillStyle = 'rgba(0,0,0,0.45)';
          g.beginPath();
          g.ellipse(CX + 8, by + 10, BR, BR * 0.92, 0, 0, Math.PI * 2);
          g.fill();
          drawSprite(g, boulderArt, CX, by);
          // rolling: carved grooves sweep over its face
          g.save();
          g.beginPath();
          g.arc(CX, by, BR - 1, 0, Math.PI * 2);
          g.clip();
          g.strokeStyle = 'rgba(40,30,25,0.45)';
          g.lineWidth = 3;
          for (let k = 0; k < 6; k++) {
            const a = roll + (k * Math.PI) / 3;
            if (Math.sin(a) <= 0) continue;
            const yy = -BR * Math.cos(a);
            const hw = Math.sqrt(Math.max(0, BR * BR - yy * yy));
            g.beginPath();
            g.ellipse(CX, by + yy, hw, 6 * Math.sin(a) + 1, 0, 0, Math.PI);
            g.stroke();
          }
          g.restore();
        }
        if (!this.dead && Math.random() < 0.3 && by - BR < H) {
          dust.burst(CX + (Math.random() - 0.5) * BR * 1.8, by - BR * 0.6, { count: 1, speed: 60, life: 0.6, size: 4, drag: 2, colors: DUST });
        }

        dust.render(g);
        fx.render(g, true);

        // torchlight and darkness
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, shade, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        for (const d of decor) {
          if (d.kind !== 'torch' || d.s < sBot) continue;
          if (d.s > sTop) break;
          const y = screenY(d.s);
          const x = d.side < 0 ? WL - 12 : WR + 12;
          const fl = 0.85 + 0.15 * Math.sin(clock * 13 + d.fl) * Math.sin(clock * 7.3 + d.fl * 2);
          drawSprite(g, torchGlow, x, y - 6, { size: 170 * fl, alpha: 0.3 });
          drawSprite(g, fireGlow, x, y - 8, { size: 26 * fl, alpha: 0.9 });
          drawSprite(g, hotGlow, x, y - 7, { size: 10 * fl, alpha: 0.9 });
        }
        g.globalCompositeOperation = 'source-over';

        // the boulder's rumble: a red warning glow rising from the bottom as it closes in
        const gap = cart.s - HL - sb;
        const close = clamp(1 - (gap - 30) / 280, 0, 1) * 0.6;
        if (close > 0 && !this.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, CX, H + 20, { size: 420, alpha: close * (0.35 + 0.15 * Math.sin(clock * 14)) });
          g.globalCompositeOperation = 'source-over';
        }
        g.restore();

        drawSprite(g, vignette, W / 2, H / 2);

        // the speed gauge
        const gx = 46;
        const gy = H - 44;
        const a0 = Math.PI * 0.8;
        const a1 = Math.PI * 2.2;
        const ang = (v) => lerp(a0, a1, clamp(v / VMAX, 0, 1));
        g.fillStyle = 'rgba(20,14,24,0.75)';
        g.beginPath();
        g.arc(gx, gy, 32, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#c8a050';
        g.lineWidth = 2;
        g.stroke();
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(255,233,196,0.18)';
        g.beginPath();
        g.arc(gx, gy, 24, a0, a1);
        g.stroke();
        const ok = gapAhead && cart.v >= gapAhead.vreq;
        if (gapAhead) {
          g.strokeStyle = 'rgba(90,255,120,0.85)';
          g.beginPath();
          g.arc(gx, gy, 24, ang(gapAhead.vreq), a1);
          g.stroke();
        }
        g.strokeStyle = gapAhead ? (ok ? '#7dff96' : '#ff6a4a') : '#ffb347';
        g.beginPath();
        g.arc(gx, gy, 24, a0, ang(cart.v));
        g.stroke();
        const na = ang(cart.v);
        g.strokeStyle = '#fff4e0';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(gx, gy);
        g.lineTo(gx + Math.cos(na) * 20, gy + Math.sin(na) * 20);
        g.stroke();
        g.fillStyle = '#c8a050';
        g.beginPath();
        g.arc(gx, gy, 4, 0, Math.PI * 2);
        g.fill();
        g.font = '700 10px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = gapAhead ? (ok ? '#a8ffb8' : '#ffb0a0') : 'rgba(255,233,196,0.7)';
        g.fillText(gapAhead ? (ok ? 'JUMP OK' : 'FASTER!') : 'SPEED', gx, gy + 19);

        // the chase meter: how far behind the boulder is, the cart at the top, the boulder below
        const mx = W - 24;
        const my0 = H - 214;
        const my1 = H - 30;
        const near = clamp(1 - gap / 400, 0, 1);
        const by2 = lerp(my1, my0 + 22, this.dead && deathKind === 'boulder' ? 1 : near);
        g.fillStyle = 'rgba(20,14,24,0.75)';
        g.beginPath();
        g.roundRect(mx - 15, my0 - 18, 30, my1 - my0 + 44, 15);
        g.fill();
        g.strokeStyle = '#c8a050';
        g.lineWidth = 2;
        g.stroke();
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(255,233,196,0.18)';
        g.beginPath();
        g.moveTo(mx, my0);
        g.lineTo(mx, my1);
        g.stroke();
        const danger = near > 0.72 ? '#ff4a3a' : near > 0.45 ? '#ffb347' : '#7dff96';
        g.strokeStyle = danger;
        g.beginPath();
        g.moveTo(mx, my0 + 10);
        g.lineTo(mx, by2);
        g.stroke();
        if (near > 0.72 && !this.dead) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, mx, by2, { size: 44, alpha: 0.5 + 0.4 * Math.sin(clock * 14) });
          g.globalCompositeOperation = 'source-over';
        }
        drawSprite(g, goldGlow, mx, my0, { size: 22, alpha: 0.6 });
        drawSprite(g, cartArt, mx, my0, { size: 14 });
        drawSprite(g, boulderArt, mx, by2, { size: 22 });
        g.fillStyle = danger;
        g.fillText(`${Math.max(0, Math.round(gap / 20))}m`, mx, my1 + 18);
      },
    };
    return game;
  },
};
