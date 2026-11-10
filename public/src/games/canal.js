// Canal Row — row a little wooden rowboat home through the canals of an old city at night. You
// don't steer like a car: every press of ← or → is one oar stroke, and the boat only moves while
// you keep rowing. Alternating ← → → drives you straight ahead; a stroke on one side swings the bow
// towards that side, so two in a row on the same side turn you, and holding a key keeps that oar
// dragging in the water for a sharp pivot that also brakes. A big glass-roofed canal cruise boat
// is coming up behind you and won't wait, so you can't stop to think. Bridge pillars, houseboats,
// sunken bikes, crates, lifebuoys and moored dinghies must all be missed, swans paddle across from
// 9s, and from 18s cruise boats come head-on down one side of the canal, their headlights showing
// first. Over the minute the arches get narrower, the canal busier and the boat behind faster.
// Everything is planned up front from the rng and checked against a reference rower using the
// game's own physics, so there is always a line through.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 520; // where the rowboat sits on screen
const QL = 26; // the quay walls
const QR = 334;
const HL = 17; // half the boat's hit length
const BR = 7; // the boat's hit radius
const STROKE = 0.3; // how long one oar stroke pulls
const READY = 0.08; // the next stroke can start once the last has this long left
const ACC = 300; // forward push while an oar pulls
const YAW = 2.7; // how hard a stroke swings the bow
const PIV = 3.2; // how hard a dragging oar swings the bow
const BRAKE = 1.8; // how hard a dragging oar slows you
const KEEL = 1.2; // the keel slowly straightens the boat
const THMAX = 1.2;
const DEP = 54; // bridge depth along the canal
const CR_W = 23; // cruise boat half width
const CR_LEN = 128;
const CR_V = 70; // oncoming cruise boats' own speed
const CR_AHEAD = 950; // how far ahead an oncoming boat starts
const LEASH = 420; // the boat behind never drops further back than this
const QUAY = { kind: 'quay' };
const CHASE = { kind: 'chase' };

const chaseV = (t) => lerp(70, 160, progress(t, 60, 1.3));

const FOAM = ['#ffffff', '#dff4ff', '#b8dcef', '#8fbfd8'];
const WOOD = ['#8a5a34', '#b07a48', '#6a4226', '#d8b07a'];
const LEAF = ['#d9a52e', '#c97a22', '#e8c04a', '#a8641c'];

function capRect(ax, ay, bx, by, r, x0, y0, x1, y1) {
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    const x = ax + (bx - ax) * u;
    const y = ay + (by - ay) * u;
    const nx = clamp(x, x0, x1);
    const ny = clamp(y, y0, y1);
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const u = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - dx * u, py - ay - dy * u);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------- art ----------

function paintWater(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#04101a');
    base.addColorStop(0.12, '#081d2b');
    base.addColorStop(0.5, '#0e2b3d');
    base.addColorStop(0.88, '#081d2b');
    base.addColorStop(1, '#04101a');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const wrap = (fn) => {
      for (const dy of [-H, 0, H]) {
        g.save();
        g.translate(0, dy);
        fn();
        g.restore();
      }
    };
    // the night sky's glow in the middle of the canal
    for (let i = 0; i < 14; i++) {
      const x = rng.range(110, 250);
      const y = rng.range(0, H);
      const r = rng.range(40, 90);
      wrap(() => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(60,100,140,0.12)');
        gr.addColorStop(1, 'rgba(60,100,140,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, r * 0.7, r, 0, 0, TAU);
        g.fill();
      });
    }
    // ripples
    for (let i = 0; i < 220; i++) {
      const x = rng.range(QL, QR);
      const y = rng.range(0, H);
      const len = rng.range(6, 22);
      const a = rng.range(0.04, 0.13);
      wrap(() => {
        g.strokeStyle = `rgba(150,200,230,${a})`;
        g.lineWidth = rng.range(0.6, 1.3);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y - 1.5, x + len, y);
        g.stroke();
      });
    }
    // reflected windows of the canal houses, wobbling near the quays
    for (let i = 0; i < 70; i++) {
      const left = rng.chance(0.5);
      const x = left ? rng.range(QL + 2, QL + 46) : rng.range(QR - 46, QR - 2);
      const y = rng.range(0, H);
      const warm = rng.chance(0.8);
      const a = rng.range(0.1, 0.28);
      wrap(() => {
        g.fillStyle = warm ? `rgba(255,200,110,${a})` : `rgba(170,220,255,${a * 0.7})`;
        for (let k = 0; k < 4; k++) g.fillRect(x + Math.sin(k * 1.7) * 2, y + k * 3, rng.range(4, 9), 1.2);
      });
    }
    // star specks
    for (let i = 0; i < 40; i++) {
      const x = rng.range(70, 290);
      const y = rng.range(0, H);
      wrap(() => {
        g.fillStyle = `rgba(230,240,255,${rng.range(0.15, 0.4)})`;
        g.fillRect(x, y, 1, 1);
      });
    }
  }, 2);
}

function paintQuays(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : QR;
      const x1 = side < 0 ? QL : W;
      // cobbled street
      g.fillStyle = '#26211d';
      g.fillRect(x0, 0, x1 - x0, H);
      for (let y = 0; y < H; y += 5) {
        for (let x = x0 + ((y / 5) % 2) * 3; x < x1; x += 6) {
          const c = rng.pick(['#3a322b', '#423830', '#332c26', '#4a3f35']);
          g.fillStyle = c;
          g.beginPath();
          g.ellipse(x + 2.5, y + 2.2, 2.4, 1.9, 0, 0, TAU);
          g.fill();
          if (rng.chance(0.25)) {
            g.fillStyle = 'rgba(255,200,130,0.12)';
            g.fillRect(x + 1.5, y + 1, 1.5, 1);
          }
        }
      }
      // a shadow from the street trees and houses on the far side
      const sh = g.createLinearGradient(x0, 0, x1, 0);
      sh.addColorStop(side < 0 ? 0 : 1, 'rgba(0,0,0,0.55)');
      sh.addColorStop(side < 0 ? 1 : 0, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(x0, 0, x1 - x0, H);
      // stone coping along the water
      const cx = side < 0 ? QL - 4 : QR;
      g.fillStyle = '#7d776c';
      g.fillRect(cx, 0, 4, H);
      g.fillStyle = 'rgba(255,240,210,0.25)';
      g.fillRect(side < 0 ? cx : cx + 3, 0, 1, H);
      g.fillStyle = 'rgba(20,16,12,0.7)';
      for (let y = rng.range(0, 14); y < H; y += rng.range(12, 18)) g.fillRect(cx, y, 4, 1);
      // the wall's shadow on the water
      const ws = g.createLinearGradient(side < 0 ? QL : QR, 0, side < 0 ? QL + 9 : QR - 9, 0);
      ws.addColorStop(0, 'rgba(0,0,0,0.5)');
      ws.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ws;
      g.fillRect(side < 0 ? QL : QR - 9, 0, 9, H);
      // bikes parked along the railing and iron bollards
      for (let y = rng.range(10, 40); y < H - 10; y += rng.range(26, 60)) {
        const bx = side < 0 ? QL - 9 : QR + 9;
        if (rng.chance(0.35)) {
          g.fillStyle = '#121010';
          g.beginPath();
          g.arc(bx, y, 2.2, 0, TAU);
          g.fill();
          g.fillStyle = 'rgba(255,220,160,0.4)';
          g.fillRect(bx - 1, y - 1.4, 1, 1);
          continue;
        }
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const yy = y + k * 6;
          const col = rng.pick(['#1a1a1c', '#2c3a52', '#5a2420', '#3a4a30', '#c8c0b0']);
          g.save();
          g.translate(bx, yy);
          g.rotate(side * rng.range(0.15, 0.35));
          g.strokeStyle = col;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(-8, 0);
          g.lineTo(8, 0);
          g.stroke();
          g.strokeStyle = 'rgba(200,200,200,0.5)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(-8, -1.5);
          g.lineTo(-8, 1.5);
          g.moveTo(8, -1.5);
          g.lineTo(8, 1.5);
          g.stroke();
          g.fillStyle = '#0c0a08';
          g.fillRect(-2, -1, 4, 2);
          g.strokeStyle = 'rgba(220,220,220,0.6)';
          g.beginPath();
          g.moveTo(5, -2.5);
          g.lineTo(5, 2.5);
          g.stroke();
          g.restore();
        }
      }
    }
  }, 2);
}

function paintCanopy(rng, r) {
  return makeSprite(r * 2 + 8, r * 2 + 8, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(3, 4, r, 0, TAU);
    g.fill();
    // a big old elm turning for autumn: dark leaf clumps with yellowing patches
    const clumps = [];
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, TAU);
      const d = Math.sqrt(rng.next()) * r * 0.72;
      clumps.push([Math.cos(a) * d, Math.sin(a) * d, rng.range(r * 0.22, r * 0.38)]);
    }
    for (const [x, y, cr] of clumps) {
      g.fillStyle = rng.pick(['#14261a', '#1b3020', '#223a24', '#2e3a1e']);
      g.beginPath();
      g.arc(x, y, cr, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 60; i++) {
      const a = rng.range(0, TAU);
      const d = Math.sqrt(rng.next()) * r * 0.9;
      g.fillStyle = rng.pick(['rgba(200,150,40,0.55)', 'rgba(170,110,30,0.5)', 'rgba(120,140,50,0.5)', 'rgba(230,180,60,0.4)']);
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rng.range(1.5, 3.5), 0, TAU);
      g.fill();
    }
    // lamp light catching the side towards the water
    const hl = g.createRadialGradient(r * 0.3, r * 0.2, 0, r * 0.3, r * 0.2, r);
    hl.addColorStop(0, 'rgba(255,200,110,0.28)');
    hl.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  });
}

function paintRowboat() {
  return makeSprite(30, 54, (g) => {
    const hull = (k) => {
      g.beginPath();
      g.moveTo(0, -25 * k);
      g.bezierCurveTo(9 * k, -20 * k, 13 * k, -6 * k, 12.5 * k, 6 * k);
      g.lineTo(9.5 * k, 23 * k);
      g.lineTo(-9.5 * k, 23 * k);
      g.lineTo(-12.5 * k, 6 * k);
      g.bezierCurveTo(-13 * k, -6 * k, -9 * k, -20 * k, 0, -25 * k);
      g.closePath();
    };
    g.save();
    g.translate(2, 3);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    hull(1);
    g.fill();
    g.restore();
    const outer = g.createLinearGradient(-13, 0, 13, 0);
    outer.addColorStop(0, '#5a3418');
    outer.addColorStop(0.5, '#a8703e');
    outer.addColorStop(1, '#6a4020');
    g.fillStyle = outer;
    hull(1);
    g.fill();
    g.fillStyle = '#e9dcc0';
    hull(0.93);
    g.fill();
    const inner = g.createLinearGradient(-11, 0, 11, 0);
    inner.addColorStop(0, '#6e4422');
    inner.addColorStop(0.5, '#9a6436');
    inner.addColorStop(1, '#6e4422');
    g.fillStyle = inner;
    hull(0.82);
    g.fill();
    // planks
    g.save();
    hull(0.82);
    g.clip();
    g.strokeStyle = 'rgba(40,20,8,0.45)';
    g.lineWidth = 0.6;
    for (let x = -10; x <= 10; x += 3.3) {
      g.beginPath();
      g.moveTo(x, -24);
      g.lineTo(x * 0.85, 24);
      g.stroke();
    }
    g.restore();
    // thwarts
    g.fillStyle = '#c99a62';
    g.fillRect(-11, -9, 22, 4);
    g.fillRect(-9.5, 13, 19, 4);
    g.fillStyle = 'rgba(255,240,200,0.35)';
    g.fillRect(-11, -9, 22, 1);
    g.fillRect(-9.5, 13, 19, 1);
    // the rower: navy peacoat, red beanie with a pom-pom
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(1, 4, 10, 6, 0, 0, TAU);
    g.fill();
    const coat = g.createLinearGradient(0, -3, 0, 9);
    coat.addColorStop(0, '#3a4c74');
    coat.addColorStop(1, '#1c2742');
    g.fillStyle = coat;
    g.beginPath();
    g.ellipse(0, 2.5, 9.5, 5.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#e8c49a';
    g.beginPath();
    g.arc(-9, 0, 2, 0, TAU);
    g.arc(9, 0, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#d8402c';
    g.beginPath();
    g.arc(0, 2, 4.6, 0, TAU);
    g.fill();
    g.fillStyle = '#a82a1c';
    g.beginPath();
    g.arc(0, 2, 4.6, 0.2, Math.PI - 0.2);
    g.fill();
    g.fillStyle = '#fff4e4';
    g.beginPath();
    g.arc(0, 1, 1.8, 0, TAU);
    g.fill();
    // brass lantern on the bow
    g.fillStyle = '#3a2a12';
    g.beginPath();
    g.arc(0, -18.5, 3.4, 0, TAU);
    g.fill();
    g.fillStyle = '#e0b050';
    g.beginPath();
    g.arc(0, -18.5, 2.6, 0, TAU);
    g.fill();
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.arc(0, -18.5, 1.4, 0, TAU);
    g.fill();
    // gunwale shine
    g.strokeStyle = 'rgba(255,230,180,0.5)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-1, -24);
    g.bezierCurveTo(-8, -19, -12, -6, -11.5, 6);
    g.stroke();
  });
}

function paintOar() {
  return makeSprite(34, 8, (g) => {
    // drawn pointing right from the oarlock at x = -17
    g.strokeStyle = '#2a1a0c';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(-17, 0);
    g.lineTo(8, 0);
    g.stroke();
    g.strokeStyle = '#c9a06a';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-17, 0);
    g.lineTo(8, 0);
    g.stroke();
    g.fillStyle = '#2a1a0c';
    g.beginPath();
    g.ellipse(11, 0, 6.5, 3.4, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#e8d2a0';
    g.beginPath();
    g.ellipse(11, 0, 5.8, 2.7, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#c8402c';
    g.beginPath();
    g.ellipse(14.5, 0, 2.2, 2.4, 0, 0, TAU);
    g.fill();
  });
}

function paintCruise() {
  return makeSprite(52, 140, (g) => {
    const hull = () => {
      g.beginPath();
      g.moveTo(-23, -40);
      g.quadraticCurveTo(-22, -64, 0, -69);
      g.quadraticCurveTo(22, -64, 23, -40);
      g.lineTo(23, 60);
      g.quadraticCurveTo(23, 66, 17, 66);
      g.lineTo(-17, 66);
      g.quadraticCurveTo(-23, 66, -23, 60);
      g.closePath();
    };
    g.save();
    g.translate(3, 4);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    hull();
    g.fill();
    g.restore();
    const hg = g.createLinearGradient(-23, 0, 23, 0);
    hg.addColorStop(0, '#0e1626');
    hg.addColorStop(0.5, '#22324e');
    hg.addColorStop(1, '#0e1626');
    g.fillStyle = hg;
    hull();
    g.fill();
    g.strokeStyle = '#dfe6ee';
    g.lineWidth = 1.4;
    hull();
    g.stroke();
    // lit windows along both sides
    for (let y = -34; y < 56; y += 9) {
      for (const sx of [-20.5, 18.5]) {
        g.fillStyle = 'rgba(255,205,120,0.95)';
        g.fillRect(sx, y, 2, 6.5);
      }
    }
    // the long glass roof
    const roof = g.createLinearGradient(-16, 0, 16, 0);
    roof.addColorStop(0, '#20425a');
    roof.addColorStop(0.45, '#5f98b4');
    roof.addColorStop(0.55, '#7ab4cc');
    roof.addColorStop(1, '#20425a');
    g.fillStyle = roof;
    rrect(g, -16.5, -38, 33, 92, 6);
    g.fill();
    g.fillStyle = 'rgba(255,200,120,0.18)';
    rrect(g, -14, -34, 28, 84, 5);
    g.fill();
    g.strokeStyle = 'rgba(10,25,40,0.7)';
    g.lineWidth = 0.9;
    for (let y = -26; y < 54; y += 11) {
      g.beginPath();
      g.moveTo(-16, y);
      g.lineTo(16, y);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, -38);
    g.lineTo(0, 54);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(-9, -34);
    g.lineTo(-9, 50);
    g.stroke();
    // wheelhouse at the bow
    g.fillStyle = '#0a101c';
    rrect(g, -11, -54, 22, 13, 4);
    g.fill();
    g.fillStyle = 'rgba(160,210,240,0.6)';
    g.fillRect(-8, -53, 16, 3);
    // navigation lights
    g.fillStyle = '#ff4a3a';
    g.beginPath();
    g.arc(-17, -50, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#4aff8a';
    g.beginPath();
    g.arc(17, -50, 2, 0, TAU);
    g.fill();
    g.fillStyle = '#fffbe8';
    g.beginPath();
    g.arc(0, -66, 2.2, 0, TAU);
    g.fill();
    // stern deck
    g.fillStyle = '#6a4a2c';
    g.fillRect(-18, 56, 36, 7);
  });
}

function paintBeam() {
  return makeSprite(130, 270, (g) => {
    // a cone of light from an apex at the bottom, opening upwards
    const gr = g.createLinearGradient(0, 135, 0, -135);
    gr.addColorStop(0, 'rgba(255,240,200,0.4)');
    gr.addColorStop(0.5, 'rgba(255,235,190,0.14)');
    gr.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-4, 135);
    g.lineTo(-62, -135);
    g.lineTo(62, -135);
    g.lineTo(4, 135);
    g.closePath();
    g.fill();
  }, 1);
}

function paintSwan() {
  return makeSprite(26, 44, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(2, 9, 10, 14, 0, 0, TAU);
    g.fill();
    // body
    const body = g.createRadialGradient(-3, 2, 1, 0, 6, 15);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.7, '#e6ecf2');
    body.addColorStop(1, '#a8b4c2');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0, -6);
    g.bezierCurveTo(11, -4, 11, 14, 0, 20);
    g.bezierCurveTo(-11, 14, -11, -4, 0, -6);
    g.fill();
    // folded wings
    g.strokeStyle = 'rgba(120,135,155,0.6)';
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(s * 2, -1 + k * 3);
        g.quadraticCurveTo(s * 8, 4 + k * 3, s * 3, 12 + k * 2);
        g.stroke();
      }
    }
    // neck and head
    g.strokeStyle = '#f4f7fa';
    g.lineWidth = 3.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -3);
    g.quadraticCurveTo(1.5, -10, 0, -14);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, -15.5, 3.2, 3.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#f08a24';
    g.beginPath();
    g.moveTo(-1.8, -17.5);
    g.lineTo(0, -22);
    g.lineTo(1.8, -17.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(0, -17.6, 1.2, 0, TAU);
    g.fill();
  });
}

function paintDebris(kind) {
  if (kind === 'bike') {
    return makeSprite(30, 30, (g) => {
      g.fillStyle = 'rgba(0,10,20,0.5)';
      g.beginPath();
      g.ellipse(1, 2, 13, 9, -0.4, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(180,220,240,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(0, 1, 14, 10, -0.4, 0, TAU);
      g.stroke();
      // a half-sunk old bicycle: one wheel up, one under the water
      g.strokeStyle = 'rgba(60,70,75,0.55)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(6, 3, 6.5, 0, TAU);
      g.stroke();
      g.strokeStyle = '#7a4a2a';
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(-6, -3, 6.5, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(200,200,200,0.5)';
      g.lineWidth = 0.6;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        g.beginPath();
        g.moveTo(-6 + Math.cos(a) * 6, -3 + Math.sin(a) * 6);
        g.lineTo(-6 - Math.cos(a) * 6, -3 - Math.sin(a) * 6);
        g.stroke();
      }
      g.strokeStyle = '#b05a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-6, -3);
      g.lineTo(0, -6);
      g.lineTo(6, 3);
      g.lineTo(-1, 2);
      g.closePath();
      g.stroke();
      g.strokeStyle = '#c8c8c8';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(-3, -10);
      g.lineTo(3, -7);
      g.stroke();
      g.fillStyle = '#1a1210';
      g.fillRect(-1.5, -8, 4, 2);
    });
  }
  if (kind === 'crate') {
    return makeSprite(26, 26, (g) => {
      g.rotate(0.35);
      g.fillStyle = 'rgba(0,10,20,0.5)';
      g.fillRect(-8, -7, 18, 18);
      g.fillStyle = '#a87a44';
      g.fillRect(-9, -9, 18, 18);
      g.strokeStyle = '#5a3a1a';
      g.lineWidth = 1;
      for (let y = -9; y <= 9; y += 4.5) {
        g.beginPath();
        g.moveTo(-9, y);
        g.lineTo(9, y);
        g.stroke();
      }
      g.strokeStyle = '#6a4622';
      g.lineWidth = 2;
      g.strokeRect(-9, -9, 18, 18);
      g.beginPath();
      g.moveTo(-9, -9);
      g.lineTo(9, 9);
      g.stroke();
      g.fillStyle = 'rgba(255,230,180,0.25)';
      g.fillRect(-9, -9, 18, 2);
      g.strokeStyle = 'rgba(200,230,250,0.35)';
      g.lineWidth = 1;
      g.strokeRect(-11, -11, 22, 22);
    });
  }
  if (kind === 'ring') {
    return makeSprite(26, 26, (g) => {
      g.fillStyle = 'rgba(0,10,20,0.5)';
      g.beginPath();
      g.arc(1.5, 2, 10, 0, TAU);
      g.fill();
      for (let k = 0; k < 8; k++) {
        g.strokeStyle = k % 2 ? '#f4f0e8' : '#f05a24';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(0, 0, 7.5, (k / 8) * TAU, ((k + 1) / 8) * TAU);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(-0.5, -0.5, 8.5, 3.6, 5.2);
      g.stroke();
      g.strokeStyle = '#d8c8a0';
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(0, 0, 10, 0, TAU);
      g.stroke();
    });
  }
  // a moored grey rubber dinghy
  return makeSprite(32, 38, (g) => {
    g.fillStyle = 'rgba(0,10,20,0.5)';
    g.beginPath();
    g.ellipse(2, 3, 12, 16, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#5a6068';
    g.beginPath();
    g.ellipse(0, 0, 12, 16, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#868e98';
    g.beginPath();
    g.ellipse(-1, -1, 11, 15, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#2a3038';
    g.beginPath();
    g.ellipse(0, 1, 7, 11, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#4a5058';
    g.fillRect(-7, 0, 14, 3);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-6, -6, 2, 5, 0.3, 0, TAU);
    g.fill();
    g.strokeStyle = '#d8c8a0';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -16);
    g.quadraticCurveTo(4, -19, 2, -18);
    g.stroke();
  });
}

const HB_ROOFS = [
  ['#2f5d50', '#3f7563'],
  ['#34466e', '#4a5f8c'],
  ['#7a3b2e', '#94503e'],
  ['#4e4e58', '#66666f'],
];

function paintHouseboat(o) {
  const w = o.x1 - o.x0;
  const h = o.s1 - o.s0;
  const rng = o.rng;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    // hull, with a shadow on the water
    g.fillStyle = 'rgba(0,0,0,0.45)';
    rrect(g, 3, 4, w - 2, h - 2, 8);
    g.fill();
    g.fillStyle = '#121619';
    rrect(g, 0, 0, w, h, 8);
    g.fill();
    g.strokeStyle = '#3a4248';
    g.lineWidth = 1.2;
    rrect(g, 0.6, 0.6, w - 1.2, h - 1.2, 8);
    g.stroke();
    // deck boards round the cabin
    g.fillStyle = '#5a4430';
    rrect(g, 2.5, 2.5, w - 5, h - 5, 6);
    g.fill();
    // cabin roof
    const [r0, r1] = HB_ROOFS[o.v];
    const cy0 = 14;
    const cy1 = h - 12;
    const rg = g.createLinearGradient(5, 0, w - 5, 0);
    rg.addColorStop(0, r0);
    rg.addColorStop(0.5, r1);
    rg.addColorStop(1, r0);
    g.fillStyle = rg;
    g.fillRect(5, cy0, w - 10, cy1 - cy0);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 0.7;
    for (let y = cy0 + 5; y < cy1; y += 5) {
      g.beginPath();
      g.moveTo(5, y);
      g.lineTo(w - 5, y);
      g.stroke();
    }
    // lit windows along the outer edges
    for (let y = cy0 + 4; y < cy1 - 8; y += rng.range(12, 20)) {
      const len = rng.range(6, 11);
      g.fillStyle = rng.chance(0.75) ? 'rgba(255,200,110,0.95)' : 'rgba(120,150,180,0.6)';
      g.fillRect(4, y, 2, len);
      g.fillRect(w - 6, y + 3, 2, len);
    }
    // skylights, solar panels and a chimney
    for (let y = cy0 + 10; y < cy1 - 14; y += rng.range(22, 36)) {
      if (rng.chance(0.5)) {
        g.fillStyle = 'rgba(255,210,130,0.75)';
        g.fillRect(w / 2 - 5, y, 10, 7);
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.strokeRect(w / 2 - 5, y, 10, 7);
      } else {
        g.fillStyle = '#1c2a44';
        g.fillRect(w / 2 - 8, y, 16, 10);
        g.strokeStyle = 'rgba(150,180,220,0.45)';
        g.lineWidth = 0.5;
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(w / 2 - 8 + k * 4, y);
          g.lineTo(w / 2 - 8 + k * 4, y + 10);
          g.stroke();
        }
      }
    }
    g.fillStyle = '#222';
    g.fillRect(w * 0.7 - 2, cy0 + 4, 4, 4);
    // potted plants and a deck chair at the ends
    for (const yy of [6, h - 7]) {
      for (let x = 7; x < w - 6; x += rng.range(7, 12)) {
        if (rng.chance(0.3)) continue;
        g.fillStyle = rng.pick(['#2e6a34', '#3a7a3a', '#245a2c']);
        g.beginPath();
        g.arc(x, yy, rng.range(2.2, 3.6), 0, TAU);
        g.fill();
        if (rng.chance(0.5)) {
          g.fillStyle = rng.pick(['#ff6a8a', '#ffd04a', '#ffffff', '#c86aff']);
          g.beginPath();
          g.arc(x + 0.8, yy - 0.8, 1, 0, TAU);
          g.fill();
        }
      }
    }
    // lamp light from the street catching the roof edge
    const hl = g.createLinearGradient(o.side < 0 ? 0 : w, 0, o.side < 0 ? w : 0, 0);
    hl.addColorStop(0, 'rgba(255,200,120,0.18)');
    hl.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, w, h);
  }, 2);
}

function paintBridge(b, W) {
  const FACE = 20;
  const TOP = DEP - FACE;
  return makeSprite(W, DEP + 10, (g) => {
    g.translate(-W / 2, -(DEP + 10) / 2);
    // shadow on the water past the face
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, DEP, W, 6);
    // deck: brick road with a cobbled verge
    const dg = g.createLinearGradient(0, 0, 0, TOP);
    dg.addColorStop(0, '#3a2c26');
    dg.addColorStop(0.5, '#4a3a32');
    dg.addColorStop(1, '#3a2c26');
    g.fillStyle = dg;
    g.fillRect(0, 0, W, TOP);
    g.strokeStyle = 'rgba(20,12,8,0.5)';
    g.lineWidth = 0.6;
    for (let y = 4; y < TOP; y += 3.5) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = (y * 7) % 9; x < W; x += 9) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 3.5);
        g.stroke();
      }
    }
    // iron railings at both edges
    for (const y of [2, TOP - 2]) {
      g.fillStyle = '#121414';
      g.fillRect(0, y - 1.2, W, 2.4);
      for (let x = 4; x < W; x += 8) g.fillRect(x - 0.8, y - 2, 1.6, 4);
      g.fillStyle = 'rgba(255,220,160,0.25)';
      g.fillRect(0, y - 1.2, W, 0.6);
    }
    // bikes chained to the railing
    for (let x = 14; x < W - 14; x += 9 + ((x * 13) % 11)) {
      if ((x * 7) % 5 < 2) continue;
      const col = ['#1a1a1c', '#2c3a52', '#5a2420', '#c8c0b0', '#3a4a30'][(x * 3) % 5];
      g.strokeStyle = col;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, TOP - 4);
      g.lineTo(x + 2, TOP - 15);
      g.stroke();
      g.fillStyle = '#0c0a08';
      g.fillRect(x - 1, TOP - 11, 3, 2.5);
    }
    // the south face in brick
    const fg = g.createLinearGradient(0, TOP, 0, DEP);
    fg.addColorStop(0, '#7a4430');
    fg.addColorStop(1, '#4e2a1e');
    g.fillStyle = fg;
    g.fillRect(0, TOP, W, FACE);
    g.strokeStyle = 'rgba(30,14,8,0.45)';
    g.lineWidth = 0.5;
    for (let y = TOP + 3; y < DEP; y += 3) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.fillStyle = '#a89a86';
    g.fillRect(0, TOP, W, 2.2);
    // arches
    const bulbs = [];
    for (const [o0, o1] of b.opens) {
      const cx = (o0 + o1) / 2;
      const rx = (o1 - o0) / 2;
      const ry = FACE - 5;
      g.fillStyle = '#03080e';
      g.beginPath();
      g.moveTo(o0, DEP + 1);
      g.lineTo(o0, DEP - 2);
      g.ellipse(cx, DEP - 2, rx, ry, 0, Math.PI, TAU);
      g.lineTo(o1, DEP + 1);
      g.closePath();
      g.fill();
      const inner = g.createLinearGradient(0, DEP - ry, 0, DEP);
      inner.addColorStop(0, 'rgba(255,190,100,0)');
      inner.addColorStop(1, 'rgba(255,190,100,0.22)');
      g.fillStyle = inner;
      g.fill();
      // keystone ring
      g.strokeStyle = '#b8a890';
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(cx, DEP - 2, rx + 1, ry + 1, 0, Math.PI, TAU);
      g.stroke();
      const n = Math.max(6, Math.round((rx * 2.4) / 7));
      for (let k = 0; k <= n; k++) {
        const a = Math.PI + (k / n) * Math.PI;
        bulbs.push([cx + Math.cos(a) * (rx + 3), DEP - 2 + Math.sin(a) * (ry + 3)]);
      }
    }
    // stone pilasters and cutwaters below each pillar
    for (const [p0, p1] of b.pillars) {
      if (p1 - p0 < 6) continue;
      g.fillStyle = 'rgba(200,190,170,0.25)';
      g.fillRect(p0 + 1, TOP + 2, 2, FACE - 2);
      g.fillRect(p1 - 3, TOP + 2, 2, FACE - 2);
      const pts = p0 <= QL + 0.5 ? null : p1 >= QR - 0.5 ? null : 1;
      if (!pts) continue;
      g.fillStyle = '#8a8070';
      g.beginPath();
      g.moveTo(p0, DEP);
      g.lineTo((p0 + p1) / 2, DEP + 7);
      g.lineTo(p1, DEP);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,240,210,0.25)';
      g.beginPath();
      g.moveTo(p0, DEP);
      g.lineTo((p0 + p1) / 2, DEP + 7);
      g.lineTo((p0 + p1) / 2, DEP);
      g.closePath();
      g.fill();
    }
    // the string of bulbs outlining each arch, the way the old bridges are lit at night
    g.globalCompositeOperation = 'lighter';
    for (const [x, y] of bulbs) {
      const gr = g.createRadialGradient(x, y, 0, x, y, 4.5);
      gr.addColorStop(0, 'rgba(255,210,130,0.75)');
      gr.addColorStop(1, 'rgba(255,190,100,0)');
      g.fillStyle = gr;
      g.fillRect(x - 5, y - 5, 10, 10);
    }
    g.globalCompositeOperation = 'source-over';
    for (const [x, y] of bulbs) {
      g.fillStyle = '#fff3cc';
      g.beginPath();
      g.arc(x, y, 0.95, 0, TAU);
      g.fill();
    }
    // bulbs along the cornice too
    for (let x = 5; x < W; x += 9) {
      g.fillStyle = 'rgba(255,230,170,0.9)';
      g.beginPath();
      g.arc(x, TOP + 1, 0.8, 0, TAU);
      g.fill();
    }
  }, 2);
}

export default {
  id: 'canal',
  title: 'Canal Row',
  emoji: '🚣',
  tagline: 'Alternate ← → to row; each side steers. Hit nothing, outrun the boat!',
  colors: { bg: '#0b2233', fg: '#fff4dc', accent: '#ffc35a' },

  music: {
    cps: 128 / 240,
    setup: `
      const kick = note("e2*4").s("sine").decay(0.22).sustain(0).gain(0.8)
      const kick2 = note("e2 e2 e2 [e2 e2]").s("sine").decay(0.2).sustain(0).gain("0.8 0.8 0.8 [0.8 0.55]")
      const hats = s("[~ white]*4").decay(0.03).sustain(0).hpf(7000).gain(0.045)
      const open = s("[~ white]*4").decay(0.12).sustain(0).hpf(7500).gain(0.026)
      const clap = s("~ pink ~ pink").decay(0.09).sustain(0).hpf(1200).lpf(5200).gain(0.12).room(0.3)
      const shaker = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.015 0.03 0.02 0.034]*4")
      const swoosh = s("pink ~ pink ~").attack(0.08).decay(0.22).sustain(0).hpf(500).lpf(1800).gain(0.05).pan(sine.range(0.35, 0.65).slow(2))
      const bass = note("<[~ a2 ~ a2 ~ a2 ~ a3] [~ f#2 ~ f#2 ~ f#2 ~ f#3] [~ d2 ~ d2 ~ d2 ~ d3] [~ e2 ~ e2 ~ e2 ~ e3]>")
        .s("sawtooth").decay(0.14).sustain(0.2).release(0.05).lpf(saw.range(420, 1700).slow(32)).lpq(6).gain(0.34)
      const chords = "<[a3,c#4,e4] [f#3,a3,c#4] [d3,f#3,a3] [e3,g#3,b3]>"
      const stabs = note(chords).struct("[~ x]*4").s("sawtooth").decay(0.1).sustain(0).release(0.04)
        .lpf(saw.range(1000, 2600).slow(32)).gain(0.05).room(0.2).pan(0.42)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.5).lpf(1100).gain(0.04).room(0.5)
      const lead = note("<[a4@4 a4@4 a4@3 b4 c#5@4] [c#5@3 b4 c#5@3 d5 e5@8] [[a5 a5 a5] [e5 e5 e5] [c#5 c#5 c#5] [a4 a4 a4]] [e5@3 d5 c#5@3 b4 a4@8]>").s("square").attack(0.005).decay(0.12).sustain(0.4).release(0.05)
        .lpf(2600).vib(6).vibmod(0.08).gain(0.075).pan(0.55)
      const round2 = note("<[e5@3 d5 c#5@3 b4 a4@8] [a4@4 a4@4 a4@3 b4 c#5@4] [c#5@3 b4 c#5@3 d5 e5@8] [[a5 a5 a5] [e5 e5 e5] [c#5 c#5 c#5] [a4 a4 a4]]>").add(note(12)).s("triangle").attack(0.005).decay(0.18).sustain(0.2).release(0.1)
        .lpf(3800).gain(0.06).delay(0.25).delaytime(0.352).delayfeedback(0.3).pan(0.35)
      const round3 = note("<[[a5 a5 a5] [e5 e5 e5] [c#5 c#5 c#5] [a4 a4 a4]] [e5@3 d5 c#5@3 b4 a4@8] [a4@4 a4@4 a4@3 b4 c#5@4] [c#5@3 b4 c#5@3 d5 e5@8]>").add(note(-12)).s("sawtooth").attack(0.02).decay(0.2).sustain(0.5).release(0.08)
        .lpf(1500).gain(0.06).pan(0.62)
      const round4 = note("<[c#5@3 b4 c#5@3 d5 e5@8] [[a5 a5 a5] [e5 e5 e5] [c#5 c#5 c#5] [a4 a4 a4]] [e5@3 d5 c#5@3 b4 a4@8] [a4@4 a4@4 a4@3 b4 c#5@4]>").s("square").attack(0.01).decay(0.15).sustain(0.35).release(0.06)
        .lpf(2000).gain(0.045).delay(0.2).delaytime(0.264).delayfeedback(0.25).pan(0.45)
      const arp = note("<[a4 c#5 e5 c#5]*4 [f#4 a4 c#5 a4]*4 [d5 f#5 a5 f#5]*4 [e5 g#5 b5 g#5]*4>")
        .s("triangle").decay(0.06).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(8)).gain(saw.range(0, 0.055).slow(8))
    `,
    song: `arrange(
      [8, stack(kick, hats, bass, stabs, lead)],
      [8, stack(kick, clap, hats, swoosh, bass, stabs, lead, round2, pad)],
      [8, stack(kick, clap, hats, shaker, swoosh, bass, stabs, lead, round2, round3, pad, arp)],
      [8, stack(kick2, clap, hats, open, shaker, swoosh, bass, stabs, lead, round2, round3, round4, pad, arp, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');

    // ---- roughly how far along the canal you'll be at time t (only used to pace the layout) ----
    const NT = Math.ceil(130 / STEP);
    const cum = new Float64Array(NT + 1);
    for (let i = 1; i <= NT; i++) cum[i] = cum[i - 1] + (chaseV((i - 0.5) * STEP) + 28) * STEP;
    const cumAt = (t) => {
      const f = clamp(t / STEP, 0, NT - 1e-9);
      const i = Math.floor(f);
      return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
    };
    const tAtS = (s) => {
      let lo = 0;
      let hi = NT;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] < s) lo = m;
        else hi = m;
      }
      return lo * STEP;
    };
    const END_S = 18500;

    // ---- head-on cruise boats come first: the route has to keep clear of their side ----
    const dyn = [];
    const res = []; // lanes kept clear for them
    for (let t = 18; ; t += lerp(9, 5, progress(t, 60, 1)) * plan.range(0.8, 1.2)) {
      const s = cumAt(t);
      if (s > END_S - 1500) break;
      const side = plan.chance(0.5) ? -1 : 1;
      const lane = side < 0 ? 80 : W - 80;
      dyn.push({ kind: 'cruise', trig: s, lane, side });
      res.push({ s0: s - 500, s1: s + 1300, x0: lane - CR_W - 10, x1: lane + CR_W + 10, side });
    }

    // ---- a reference line along the canal ----
    const RES = 4;
    const NS = Math.ceil((END_S + 800) / RES) + 2;
    const route = new Float32Array(NS);
    {
      const pts = [{ s: -300, x: W / 2 }, { s: 520, x: W / 2 }];
      let s = 520;
      let x = W / 2;
      while (s < END_S + 800) {
        const ds = plan.range(180, 300);
        s += ds;
        const step = ds * 0.36;
        let lo = 72;
        let hi = W - 72;
        for (const r of res) {
          if (s > r.s0 - 100 && s < r.s1 - 250) {
            if (r.side < 0) lo = Math.max(lo, r.x1 + 46);
            else hi = Math.min(hi, r.x0 - 46);
          }
        }
        let nx = x + plan.range(-1, 1) * step;
        nx = clamp(nx, Math.max(lo, x - step), Math.min(hi, x + step));
        if (lo > x + step) nx = x + step;
        if (hi < x - step) nx = x - step;
        x = nx;
        pts.push({ s, x });
      }
      let j = 0;
      for (let i = 0; i < NS; i++) {
        const si = i * RES;
        while (j < pts.length - 2 && pts[j + 1].s < si) j++;
        const a = pts[j];
        const b = pts[j + 1];
        const u = clamp((si - a.s) / (b.s - a.s), 0, 1);
        route[i] = lerp(a.x, b.x, u * u * (3 - 2 * u));
      }
    }
    const routeAt = (s) => {
      const f = clamp(s / RES, 0, NS - 1.001);
      const i = Math.floor(f);
      return route[i] + (route[i + 1] - route[i]) * (f - i);
    };
    const routeSpan = (s0, s1) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (let s = s0; s <= s1 + 0.01; s += RES) {
        const x = routeAt(s);
        if (x < mn) mn = x;
        if (x > mx) mx = x;
      }
      return [mn, mx];
    };

    // ---- the canal's obstacles ----
    let statics = [];
    const bridges = [];
    const houseboats = [];
    const debris = [];
    const blocks = [];
    const free = (x0, x1, s0, s1, gap) => {
      for (const b of blocks) if (x0 < b.x1 + gap && x1 > b.x0 - gap && s0 < b.s1 + gap && s1 > b.s0 - gap) return false;
      for (const r of res) if (s0 < r.s1 && s1 > r.s0 && x0 < r.x1 && x1 > r.x0) return false;
      return true;
    };
    const addBridge = (sb, p) => {
      for (const b of blocks) if (b.s0 < sb + DEP + 40 && b.s1 > sb - 40) return false;
      const [mn, mx] = routeSpan(sb - 14, sb + DEP + 14);
      const w = Math.max(lerp(122, 74, p) * plan.range(0.94, 1.06), mx - mn + 40);
      const o0 = clamp(plan.range(mx + 20 - w, mn - 20), QL, QR - w);
      let opens = [[o0, o0 + w]];
      // a head-on cruise boat's lane always gets an arch of its own
      for (const r of res) if (sb + DEP > r.s0 && sb < r.s1) opens.push([r.x0 - 4, r.x1 + 4]);
      const extra = plan.chance(lerp(0.85, 0.4, p)) ? (plan.chance(lerp(0.5, 0.15, p)) ? 2 : 1) : 0;
      for (let k = 0; k < extra; k++) {
        for (let tries = 0; tries < 12; tries++) {
          const w2 = w * plan.range(0.8, 1.05);
          const a = plan.range(QL, QR - w2);
          if (opens.every(([b0, b1]) => a + w2 < b0 - 24 || a > b1 + 24)) {
            opens.push([a, a + w2]);
            break;
          }
        }
      }
      opens.sort((a, b) => a[0] - b[0]);
      // merge arches that overlap or would leave only a sliver of pillar
      const merged = [];
      for (const o of opens) {
        const last = merged.at(-1);
        if (last && o[0] < last[1] + 16) last[1] = Math.max(last[1], o[1]);
        else merged.push([Math.max(QL, o[0]), Math.min(QR, o[1])]);
      }
      opens = merged;
      const pillars = [];
      let x = QL;
      for (const [a, b] of opens) {
        if (a - x > 0.5) pillars.push([x, a]);
        x = b;
      }
      if (QR - x > 0.5) pillars.push([x, QR]);
      const br = { kind: 'bridge', s: sb, opens, pillars, img: null };
      bridges.push(br);
      for (const [a, b] of pillars) statics.push({ shape: 'rect', kind: 'pillar', x0: a, x1: b, s0: sb - 4, s1: sb + DEP, ref: br });
      blocks.push({ x0: 0, x1: W, s0: sb - 30, s1: sb + DEP + 30 });
      return true;
    };
    const addHouseboat = (s0, side, p, C) => {
      const len = plan.range(110, 190);
      const s1 = s0 + len;
      const [mn, mx] = routeSpan(s0 - 24, s1 + 24);
      let w = plan.range(40, 72);
      let x0;
      let x1;
      if (side < 0) {
        w = Math.min(w, mn - C - BR - QL);
        x0 = QL;
        x1 = QL + w;
      } else {
        w = Math.min(w, QR - (mx + C + BR));
        x0 = QR - w;
        x1 = QR;
      }
      if (w < 32) return false;
      if (!free(x0, x1, s0, s1, 16)) return false;
      const o = { kind: 'houseboat', x0, x1, s0, s1, side, v: plan.int(0, 3), rng: art.fork(`hb${houseboats.length}`), img: null };
      houseboats.push(o);
      statics.push({ shape: 'rect', kind: 'houseboat', x0, x1, s0: s0 + 2, s1: s1 - 2, ref: o });
      blocks.push({ x0, x1, s0, s1 });
      return true;
    };
    const DEB = { bike: 11, crate: 9, ring: 9, dinghy: 13 };
    const addDebris = (s, p, C) => {
      const kind = plan.pick(['bike', 'crate', 'ring', 'dinghy', 'bike']);
      const r = DEB[kind];
      for (let tries = 0; tries < 12; tries++) {
        const x = plan.range(QL + r + 6, QR - r - 6);
        let ok = true;
        for (let j = -r - 26; j <= r + 26; j += 8) if (Math.abs(x - routeAt(s + j)) < C + BR + r) ok = false;
        if (!ok || !free(x - r, x + r, s - r, s + r, 12)) continue;
        const o = { kind, x, s, r, rot: plan.range(0, TAU), bob: plan.range(0, TAU) };
        debris.push(o);
        statics.push({ shape: 'circ', kind, x, s, r, s0: s - r, s1: s + r, ref: o });
        blocks.push({ x0: x - r, x1: x + r, s0: s - r, s1: s + r });
        return true;
      }
      return false;
    };
    const addSwan = (s, p) => {
      if (!free(QL, QR, s - 36, s + 36, 0)) return false;
      const side = plan.chance(0.5) ? -1 : 1;
      dyn.push({ kind: 'swan', s, x0: side < 0 ? QL + 4 : QR - 4, vx: -side * plan.range(24, 38) * lerp(1, 1.35, p), trig: s - 640, ph: plan.range(0, TAU) });
      blocks.push({ x0: QL, x1: QR, s0: s - 30, s1: s + 30 });
      return true;
    };

    {
      let s = 640;
      let lastBridge = 150;
      while (s < END_S) {
        const t = tAtS(s);
        const p = progress(t, 60, 1.15);
        const C = lerp(40, 27, p);
        const roll = plan.next();
        if (s - lastBridge > lerp(1250, 720, p) * plan.range(0.85, 1.15) && addBridge(s, p)) {
          lastBridge = s;
          s += DEP;
        } else if (t > 9 && roll < lerp(0.12, 0.24, p) && addSwan(s, p)) {
          // a swan paddles across
        } else if (roll < 0.5) {
          const side = plan.chance(0.5) ? -1 : 1;
          addHouseboat(s, side, p, C);
          if (t > 14 && plan.chance(lerp(0.25, 0.6, p))) addHouseboat(s + plan.range(-40, 60), -side, p, C);
        } else {
          const n = 1 + (t > 6 ? 1 : 0) + (plan.chance(p) ? 1 : 0);
          for (let k = 0; k < n; k++) addDebris(s + plan.range(-50, 50), p, C);
        }
        s += lerp(235, 125, p) * plan.range(0.85, 1.15);
      }
    }
    dyn.sort((a, b) => a.trig - b.trig);

    // ---- the physics, shared by the player and the reference rower ----
    const sortStatics = () => statics.sort((a, b) => a.s0 - b.s0);
    sortStatics();
    const swanX = (o, t0, t) => o.x0 + o.vx * (t - t0);
    const cruiseBow = (o, t0, t) => o.trig + CR_AHEAD - CR_V * (t - t0);

    const newState = () => ({
      px: W / 2, sp: 0, v: 90, th: 0, om: 0, prev: 0, pend: 0, sk: 0, sd: 0, brk: 0,
      c: -260, lo: 0, dlo: 0, t0: new Float64Array(dyn.length).fill(-1), started: 0,
    });
    const stepState = (st, t, dt, dir) => {
      st.started = 0;
      if (dir !== 0 && dir !== st.prev) st.pend = dir;
      st.prev = dir;
      if (st.pend && st.sk <= READY) {
        st.sd = st.pend;
        st.sk = STROKE;
        st.pend = 0;
        st.started = st.sd;
      }
      if (st.sk > 0) {
        st.v += ACC * dt;
        st.om += st.sd * YAW * dt;
        st.sk -= dt;
        st.brk = 0;
      } else if (dir !== 0) {
        st.v *= Math.exp(-BRAKE * dt);
        st.om += dir * PIV * dt;
        st.brk = dir;
      } else st.brk = 0;
      st.v = Math.max(0, st.v - st.v * (0.8 + st.v / 350) * dt);
      st.om *= Math.exp(-4 * dt);
      st.om -= st.th * KEEL * dt;
      st.th += st.om * dt;
      if (st.th > THMAX) {
        st.th = THMAX;
        st.om = Math.min(0, st.om);
      } else if (st.th < -THMAX) {
        st.th = -THMAX;
        st.om = Math.max(0, st.om);
      }
      st.px += st.v * Math.sin(st.th) * dt;
      st.sp += st.v * Math.cos(st.th) * dt;
      st.c = Math.max(st.c + chaseV(t) * dt, st.sp - LEASH);
      while (st.dlo < dyn.length && dyn[st.dlo].trig <= st.sp) st.t0[st.dlo++] = t;

      // collisions
      const hx = Math.sin(st.th) * HL;
      const hs = Math.cos(st.th) * HL;
      const ax = st.px + hx;
      const as = st.sp + hs;
      const bx = st.px - hx;
      const bs = st.sp - hs;
      if (Math.min(ax, bx) < QL + BR - 2 || Math.max(ax, bx) > QR - BR + 2) return QUAY;
      if (st.c >= st.sp - HL - 2) return CHASE;
      while (st.lo < statics.length && statics[st.lo].s1 < st.sp - 80) st.lo++;
      for (let i = st.lo; i < statics.length; i++) {
        const o = statics[i];
        if (o.s0 > st.sp + 40) break;
        if (o.shape === 'rect') {
          if (capRect(ax, as, bx, bs, BR, o.x0, o.s0, o.x1, o.s1)) return o;
        } else if (segDist(o.x, o.s, ax, as, bx, bs) < o.r + BR - 2) return o;
      }
      for (let i = 0; i < st.dlo; i++) {
        const o = dyn[i];
        const t0 = st.t0[i];
        if (o.kind === 'swan') {
          if (Math.abs(o.s - st.sp) > 40) continue;
          if (segDist(swanX(o, t0, t), o.s, ax, as, bx, bs) < 8 + BR - 1) return o;
        } else {
          const bow = cruiseBow(o, t0, t);
          if (bow > st.sp + 40 || bow + CR_LEN < st.sp - 40) continue;
          if (capRect(ax, as, bx, bs, BR - 1, o.lane - CR_W + 2, bow + 6, o.lane + CR_W - 2, bow + CR_LEN)) return o;
        }
      }
      return null;
    };

    // ---- check the layout against a reference rower who follows the line at a steady pace ----
    {
      const sim = () => {
        const st = newState();
        let side = 1;
        let hold = 0;
        let rest = 0;
        let dir = 0;
        for (let i = 0; i * STEP < 61; i++) {
          const t = i * STEP;
          if (hold > 0) {
            hold -= STEP;
            if (hold <= 0) {
              dir = 0;
              rest = 0.21;
            }
          } else if (rest > 0) {
            rest -= STEP;
          } else {
            const look = st.sp + 40 + st.v * 0.45;
            const thd = Math.atan2(routeAt(look + 60) - routeAt(look - 60), 120) + clamp((routeAt(look) - st.px) * 0.006, -0.4, 0.4);
            const e = thd - (st.th + st.om * 0.3);
            side = e > 0.07 ? 1 : e < -0.07 ? -1 : -side;
            hold = 0.12;
            dir = side;
          }
          const hit = stepState(st, t, STEP, dir);
          if (hit) return { hit, t };
        }
        return null;
      };
      for (let iter = 0; iter < 160; iter++) {
        const r = sim();
        if (!r || r.hit === QUAY || r.hit === CHASE) break;
        const ref = r.hit.ref || r.hit;
        if (ref.kind === 'bridge') bridges.splice(bridges.indexOf(ref), 1);
        if (ref.kind === 'houseboat') houseboats.splice(houseboats.indexOf(ref), 1);
        if (debris.includes(ref)) debris.splice(debris.indexOf(ref), 1);
        if (dyn.includes(ref)) dyn.splice(dyn.indexOf(ref), 1);
        statics = statics.filter((o) => o.ref !== ref);
      }
      sortStatics();
    }

    // ---- art ----
    const water = paintWater(W, H, art);
    const quays = paintQuays(W, H, art);
    const canopies = [paintCanopy(art, 24), paintCanopy(art, 29), paintCanopy(art, 21)];
    const boat = paintRowboat();
    const oar = paintOar();
    const cruise = paintCruise();
    const beam = paintBeam();
    const swan = paintSwan();
    const debArt = { bike: paintDebris('bike'), crate: paintDebris('crate'), ring: paintDebris('ring'), dinghy: paintDebris('dinghy') };
    const vignette = vignetteSprite(W, H, 0.62, '2,6,14');
    const lampGlow = glowSprite('rgba(255,190,100,0.9)', 40);
    const warmGlow = glowSprite('rgba(255,210,140,0.8)', 30);
    const redGlow = glowSprite('rgba(255,60,50,0.85)', 40);
    const pool = glowSprite('rgba(255,215,150,0.5)', 60);
    const trees = [];
    for (let s = 0, i = 0; i < 22; i++) {
      s += art.range(70, 150);
      trees.push({ s, side: i % 2 ? 1 : -1, v: art.int(0, 2), dx: art.range(-4, 6) });
    }
    const TREE_SPAN = trees.at(-1).s + 90;
    const LAMP_GAP = 175;

    const st = newState();
    const fx = createParticles();
    const wake = createParticles();
    const leaves = [];
    for (let i = 0; i < 26; i++) leaves.push({ x: QL + Math.random() * (QR - QL), y: Math.random() * H, r: Math.random() * TAU, c: LEAF[(Math.random() * LEAF.length) | 0], s: 1.5 + Math.random() * 1.5 });
    let time = 0;
    let clock = 0;
    let shake = 0;
    let culprit = null;
    let sink = 0;
    let wakeT = 0;
    const oars = [{ a: 0.35 }, { a: 0.35 }]; // left, right
    let lastSp = 0;

    const scrY = (s) => PY - (s - st.sp);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        if (this.dead) return;
        time = t;
        lastSp = st.sp;
        const hit = stepState(st, t, dt, dir);
        if (st.started) {
          // the blade bites: a splash at its tip
          const sd = st.started;
          const ox = st.px + Math.cos(st.th) * sd * 30;
          const oy = PY + Math.sin(st.th) * sd * 30 - 8;
          fx.burst(ox, oy, { count: 7, speed: 60, life: 0.5, size: 2.4, colors: FOAM, round: true, drag: 2.5 });
        }
        this.cosmetics(dt, dir);
        if (hit) {
          culprit = hit;
          const reasons = {
            quay: 'Rowed into the quay wall.',
            chase: 'The cruise boat behind caught up and ran you down.',
            pillar: 'Rammed a bridge pillar.',
            houseboat: 'Crashed into a houseboat.',
            bike: 'Snagged on a sunken bicycle.',
            crate: 'Hit a floating crate.',
            ring: 'Tangled up in a lifebuoy.',
            dinghy: 'Bumped into a moored dinghy.',
            swan: 'Rammed a swan. It hissed you overboard.',
            cruise: 'Collided head-on with a canal cruise boat.',
          };
          this.die(reasons[hit.kind] || 'Crashed.');
        }
      },

      cosmetics(dt, dir) {
        clock += dt;
        const ds = st.sp - lastSp;
        lastSp = st.sp;
        // oars: the stroking one sweeps from forward to back, a dragging one stays square in the water
        for (let k = 0; k < 2; k++) {
          const sd = k === 0 ? -1 : 1;
          let target = 0.4;
          if (!this.dead && st.sk > 0 && st.sd === sd) target = lerp(0.75, -0.6, 1 - st.sk / STROKE);
          else if (!this.dead && st.brk === sd) target = 0.02;
          const o = oars[k];
          o.a += (target - o.a) * Math.min(1, dt * (st.sk > 0 && st.sd === sd ? 30 : 9));
        }
        if (!this.dead && st.brk && Math.random() < 0.5) {
          const sd = st.brk;
          fx.burst(st.px + sd * 28 * Math.cos(st.th), PY + sd * 28 * Math.sin(st.th), { count: 1, speed: 40, life: 0.4, size: 2, colors: FOAM, round: true });
        }
        // wake from the stern
        wakeT -= dt;
        if (!this.dead && wakeT <= 0 && st.v > 30) {
          wakeT = 0.04;
          const sx = st.px - Math.sin(st.th) * 22;
          const sy = PY + Math.cos(st.th) * 22;
          wake.burst(sx + (Math.random() - 0.5) * 6, sy, { count: 1, speed: 18, life: 1.1, size: 3, colors: FOAM, angle: Math.PI / 2 + st.th, spread: 1.4, round: true });
        }
        wake.update(dt, ds / dt || 0);
        fx.update(dt, ds / dt || 0);
        for (const l of leaves) {
          l.y += ds + dt * 4;
          l.x += Math.sin(clock * 0.5 + l.r) * dt * 3;
          l.r += dt * 0.2;
          if (l.y > H + 10) {
            l.y = -10 - Math.random() * 40;
            l.x = QL + 6 + Math.random() * (QR - QL - 12);
          }
        }
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = 0.45;
        const k = culprit.kind;
        const hx = st.px + Math.sin(st.th) * (k === 'chase' ? -20 : 20);
        const hy = PY + Math.cos(st.th) * (k === 'chase' ? 20 : -20);
        fx.burst(hx, hy, { count: 34, speed: 200, life: 0.9, size: 3.5, colors: FOAM, round: true, drag: 2.4 });
        fx.burst(hx, hy, { count: 14, speed: 150, life: 0.9, size: 3, colors: k === 'swan' ? ['#ffffff', '#e6ecf2', '#f08a24'] : WOOD, drag: 2 });
      },

      afterlife(dt) {
        shake = Math.max(0, shake - dt);
        sink = Math.min(1, sink + dt / 1.2);
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        const sp = st.sp;
        const t = time;
        const pulse = 0.5 + 0.5 * Math.sin(clock * 12);

        // water
        const woff = sp % H;
        g.drawImage(water.canvas, 0, woff - H, W, H);
        g.drawImage(water.canvas, 0, woff, W, H);

        // lamp reflections shimmering on the water
        g.globalCompositeOperation = 'lighter';
        const l0 = Math.floor((sp - 200) / LAMP_GAP);
        for (let k = l0; k < l0 + 6; k++) {
          for (const side of [-1, 1]) {
            const s = k * LAMP_GAP + (side > 0 ? LAMP_GAP / 2 : 0);
            const y = scrY(s);
            if (y < -80 || y > H + 80) continue;
            const x = side < 0 ? QL + 11 : QR - 11;
            for (let j = 0; j < 4; j++) {
              const yy = y + 8 + j * 13;
              const wob = Math.sin(clock * 2.4 + j * 1.3 + k) * 2.5;
              drawSprite(g, warmGlow, x + wob, yy, { size: 20 - j * 3, alpha: 0.32 - j * 0.06 });
            }
          }
        }
        g.globalCompositeOperation = 'source-over';
        for (const l of leaves) {
          g.fillStyle = l.c;
          g.globalAlpha = 0.7;
          g.beginPath();
          g.ellipse(l.x, l.y, l.s, l.s * 0.55, l.r, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;

        // houseboats
        for (const o of houseboats) {
          const y1 = scrY(o.s0);
          const y0 = scrY(o.s1);
          if (y1 < -20 || y0 > H + 20) continue;
          o.img ||= paintHouseboat(o);
          const bob = Math.sin(clock * 1.3 + o.s0) * 0.6;
          g.drawImage(o.img.canvas, o.x0, y0 + bob, o.x1 - o.x0, o.s1 - o.s0);
          if (culprit && culprit.ref === o) drawSprite(g, redGlow, (o.x0 + o.x1) / 2, PY - 10, { size: 90, alpha: 0.5 + 0.3 * pulse });
        }

        // floating debris
        for (const o of debris) {
          const y = scrY(o.s);
          if (y < -30 || y > H + 30) continue;
          const bob = Math.sin(clock * 1.8 + o.bob);
          g.strokeStyle = `rgba(190,225,245,${0.12 + 0.06 * bob})`;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(o.x, y, o.r + 5 + bob, (o.r + 5 + bob) * 0.8, 0, 0, TAU);
          g.stroke();
          drawSprite(g, debArt[o.kind], o.x, y + bob * 0.6, { rot: o.rot + Math.sin(clock * 0.7 + o.bob) * 0.08 });
          if (culprit && culprit.ref === o) drawSprite(g, redGlow, o.x, y, { size: o.r * 6, alpha: 0.5 + 0.3 * pulse });
        }

        // swans and head-on cruise boats
        for (let i = 0; i < st.dlo; i++) {
          const o = dyn[i];
          const t0 = st.t0[i];
          if (o.kind === 'swan') {
            const y = scrY(o.s);
            if (y < -40 || y > H + 40) continue;
            const x = swanX(o, t0, t);
            if (x < QL - 16 || x > QR + 16) continue;
            const fade = clamp((t - t0) / 0.6, 0, 1);
            const dirx = Math.sign(o.vx);
            g.strokeStyle = `rgba(200,230,250,${0.22 * fade})`;
            g.lineWidth = 1;
            for (let k = 1; k <= 3; k++) {
              const back = k * 9 + ((clock * 18) % 9);
              g.beginPath();
              g.moveTo(x - dirx * back, y - back * 0.45);
              g.lineTo(x - dirx * 4, y);
              g.lineTo(x - dirx * back, y + back * 0.45);
              g.stroke();
            }
            drawSprite(g, swan, x, y + Math.sin(clock * 2 + o.ph) * 0.6, { rot: dirx * Math.PI / 2, alpha: fade });
            if (culprit === o) drawSprite(g, redGlow, x, y, { size: 70, alpha: 0.5 + 0.3 * pulse });
          } else {
            const bow = cruiseBow(o, t0, t);
            const yb = scrY(bow);
            if (yb < -400 || scrY(bow + CR_LEN) > H + 40) continue;
            // headlight beam ahead of it on the water
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, beam, o.lane, yb + 135, { rot: Math.PI, alpha: 0.9 });
            drawSprite(g, lampGlow, o.lane, yb + 4, { size: 50, alpha: 0.8 });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, cruise, o.lane, yb - 69, { rot: Math.PI });
            if (culprit === o) drawSprite(g, redGlow, o.lane, PY - 20, { size: 110, alpha: 0.5 + 0.3 * pulse });
          }
        }

        // the cruise boat behind you
        {
          const gap = st.sp - st.c;
          const yb = PY + gap;
          if (yb < H + 260) {
            const cx = clamp(st.px * 0.4 + W * 0.3, QL + 30, QR - 30);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, beam, cx, yb - 133, { alpha: 0.8 });
            drawSprite(g, lampGlow, cx, yb - 2, { size: 50, alpha: 0.9 });
            g.globalCompositeOperation = 'source-over';
            drawSprite(g, cruise, cx, yb + 69);
            if (gap < 120 && !this.dead) drawSprite(g, redGlow, cx, yb, { size: 80, alpha: (1 - gap / 120) * (0.4 + 0.4 * pulse) });
          }
        }

        // the rowboat
        wake.render(g);
        {
          const capsized = !!culprit;
          g.save();
          g.translate(st.px, PY + sink * 4);
          g.rotate(st.th + (capsized ? sink * 0.6 * (culprit.kind === 'chase' ? -1 : 1) : 0));
          const sc = 1 - sink * 0.15;
          g.scale(sc, sc);
          g.globalAlpha = 1 - sink * 0.55;
          // the lantern's pool of light on the water ahead
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, pool, 0, -46, { size: 90, alpha: 0.55 + 0.08 * Math.sin(clock * 9) });
          g.globalCompositeOperation = 'source-over';
          for (let k = 0; k < 2; k++) {
            const sd = k === 0 ? -1 : 1;
            const a = oars[k].a;
            g.save();
            g.translate(sd * 11.5, -1);
            g.rotate(sd < 0 ? Math.PI + a : -a);
            g.drawImage(oar.canvas, -1, -oar.h / 2, oar.w, oar.h);
            g.restore();
          }
          g.drawImage(boat.canvas, -boat.w / 2, -boat.h / 2, boat.w, boat.h);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, lampGlow, 0, -18.5, { size: 36, alpha: 0.85 + 0.1 * Math.sin(clock * 11) });
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          g.restore();
        }
        fx.render(g);

        // quays, street lamps and the elms leaning over the water
        const qoff = sp % H;
        g.drawImage(quays.canvas, 0, qoff - H, W, H);
        g.drawImage(quays.canvas, 0, qoff, W, H);
        const toff = sp % TREE_SPAN;
        for (const tr of trees) {
          for (const k of [-1, 0, 1]) {
            const y = PY + 200 + toff - tr.s - k * TREE_SPAN;
            if (y < -40 || y > H + 40) continue;
            drawSprite(g, canopies[tr.v], tr.side < 0 ? 2 + tr.dx : W - 2 - tr.dx, y);
          }
        }
        for (let k = l0; k < l0 + 6; k++) {
          for (const side of [-1, 1]) {
            const s = k * LAMP_GAP + (side > 0 ? LAMP_GAP / 2 : 0);
            const y = scrY(s);
            if (y < -60 || y > H + 60) continue;
            const x = side < 0 ? QL - 8 : QR + 8;
            g.fillStyle = '#141210';
            g.beginPath();
            g.arc(x, y, 3.4, 0, TAU);
            g.fill();
            g.fillStyle = '#fff0c8';
            g.beginPath();
            g.arc(x, y, 1.8, 0, TAU);
            g.fill();
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, lampGlow, x, y, { size: 70, alpha: 0.6 });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // bridges, over everything that passes under them
        for (const b of bridges) {
          const yTop = scrY(b.s + DEP);
          if (yTop > H + 10 || yTop + DEP + 10 < -10) continue;
          b.img ||= paintBridge(b, W);
          g.drawImage(b.img.canvas, 0, yTop, W, DEP + 10);
          g.globalCompositeOperation = 'lighter';
          for (const [o0, o1] of b.opens) drawSprite(g, warmGlow, (o0 + o1) / 2, yTop + DEP - 8, { size: (o1 - o0) * 0.9, alpha: 0.28 });
          for (const x of [8, W - 8]) drawSprite(g, lampGlow, x, yTop + 4, { size: 60, alpha: 0.5 });
          g.globalCompositeOperation = 'source-over';
          if (culprit && culprit.ref === b) drawSprite(g, redGlow, st.px, PY - 16, { size: 90, alpha: 0.5 + 0.3 * pulse });
        }

        // a warning chevron at the top edge before a cruise boat comes into view
        for (let i = 0; i < st.dlo; i++) {
          const o = dyn[i];
          if (o.kind !== 'cruise') continue;
          const yb = scrY(cruiseBow(o, st.t0[i], t));
          if (yb > 30 || yb < -480 || this.dead) continue;
          const a = 0.6 + 0.4 * pulse;
          g.fillStyle = `rgba(255,195,90,${a})`;
          g.beginPath();
          g.moveTo(o.lane - 12, 30);
          g.lineTo(o.lane + 12, 30);
          g.lineTo(o.lane, 44);
          g.closePath();
          g.fill();
          g.fillStyle = `rgba(255,195,90,${a * 0.6})`;
          g.beginPath();
          g.moveTo(o.lane - 9, 46);
          g.lineTo(o.lane + 9, 46);
          g.lineTo(o.lane, 56);
          g.closePath();
          g.fill();
        }
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        // how far back the cruise boat is
        if (!this.dead) {
          const gap = st.sp - st.c;
          const k = clamp(gap / LEASH, 0, 1);
          const bx = W / 2 - 60;
          const by = H - 20;
          g.fillStyle = 'rgba(4,10,18,0.55)';
          rrect(g, bx - 4, by - 4, 128, 12, 6);
          g.fill();
          g.fillStyle = gap > 220 ? '#7fe0a0' : gap > 110 ? '#ffc35a' : `rgba(255,90,70,${0.7 + 0.3 * pulse})`;
          rrect(g, bx, by, Math.max(4, 120 * k), 4, 2);
          g.fill();
          g.font = `600 9px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.fillStyle = 'rgba(255,244,220,0.75)';
          g.fillText('CRUISE BOAT GAP', W / 2, by - 6);
        }
      },
    };
    return game;
  },
};
