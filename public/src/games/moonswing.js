// Moon Swing — a kid in polka-dot pyjamas swings from a sleepy crescent moon over a sleeping town.
// You never move the kid directly: ← and → push the swing. Pushing the way it's already moving
// pumps it higher, pushing against it brakes it, and left alone it slowly dies down. Stars pop
// up along the swing's arc and each one has to be kicked before it fades (swing at least that
// high on its side); bats flutter up from the rooftops and hang on the arc, and touching one ends
// the run (stay lower than them). So every moment asks for a swing height inside a band, and the
// band keeps moving and narrowing.
//
// Two glowing teal ticks on the arc always show how high the current swing will reach. A star's
// ring drains as it fades and turns green once your swing reaches it; a bat's perch is marked by
// a dashed red ring long before it arrives, which flares when your swing is too high for it.
// The whole minute is planned up front as a series of "gates" around a reference swing whose
// height changes at about two thirds of the fastest you can pump or brake. Bats are announced
// early enough to brake down to them even from a full swing.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const PX = 180; // the knot under the moon
const PY = 150;
const LEN = 290; // rope length, pivot to seat
const RH = LEN - 4; // the radius where the kid's body and everything on the arc sit
const W0 = 3.376; // pendulum frequency: one full swing ≈ one bar of the song (128 BPM)
const PUSH = 0.48; // how hard a push is
const DAMP = 0.09; // air drag: an unpushed swing loses about a degree a second
const SOFT = 28; // above this angle the swing gets heavy, so it tops out around 34°
const AMAX = 34;
const KID_R = 12;
const STAR_R = 13;
const BAT_R = 11;
const STAR_M = (KID_R + STAR_R) / RH / DEG; // a swing this much short of a star still kicks it
const BAT_M = (KID_R + BAT_R) / RH / DEG;
const UP = 4.3; // degrees per second a good pumper gains
const DOWN = 6; // and a good braker loses
const A0 = 13; // the swing's height at GO
const JAR_X = 326;
const JAR_Y = 596;

// ---------- the plan: every star and bat, decided up front ----------

function makePlan(rng) {
  const items = [];
  let t = 3.4;
  let R = 22; // the reference swing height at this gate
  let prev = { lo: A0 - 2, hi: AMAX, bat: false };
  let first = true;
  while (t < 61) {
    const p = progress(t, 60, 1.25);
    const w = lerp(13, 5.8, p);
    const lo = R - w / 2;
    const hi = R + w / 2;
    let type = 'star';
    if (!first && t > 6.5) {
      const r = rng.next();
      const pBoth = lerp(0.2, 0.7, p);
      const pBat = lerp(0.42, 0.2, p);
      type = r < pBoth ? 'both' : r < pBoth + pBat ? 'bat' : 'star';
    }
    const top = prev.bat ? prev.hi : AMAX; // the highest a sensible swing can be right now
    if (type !== 'bat') {
      const lead = clamp((lo - prev.lo) / UP + 1.9, 1.9, 3.6);
      const hold = lerp(1.15, 0.95, p);
      const side = rng.chance(0.5) ? 1 : -1;
      items.push({ kind: 'star', side, ang: lo + STAR_M, eff: lo, tIn: t - lead, tOff: t + hold });
      if (!first && rng.chance(lerp(0, 0.4, p))) {
        const e2 = lo + rng.range(0, 0.6);
        items.push({ kind: 'star', side: -side, ang: e2 + STAR_M, eff: e2, tIn: t - lead + rng.range(0, 0.3), tOff: t + hold });
      }
    }
    if (type !== 'star') {
      const pre = 0.6;
      const post = lerp(1.4, 0.95, p);
      const tel = clamp((top - hi) / DOWN + 1.0, 1.5, 4.6);
      const side = rng.chance(0.5) ? 1 : -1;
      items.push({ kind: 'bat', side, ang: hi + BAT_M, eff: hi, tIn: t - pre - tel, tOn: t - pre, tOff: t + post });
      if (rng.chance(lerp(0.1, 0.35, p))) {
        const e2 = hi + rng.range(0, 1.5);
        items.push({ kind: 'bat', side: -side, ang: e2 + BAT_M, eff: e2, tIn: t - pre - tel, tOn: t - pre + rng.range(0, 0.2), tOff: t + post });
      }
    }
    prev = { lo, hi, bat: type !== 'star' };
    first = false;
    // the next gate
    const D = lerp(3.0, 1.85, p) * rng.range(0.94, 1.08);
    const slope = lerp(2.4, 3.0, p);
    const maxD = Math.min(slope * D, w - 0.8);
    const Rmin = w / 2 + 4.5;
    const Rmax = 29.5 - w / 2;
    let dR = rng.range(0.45, 1) * maxD * (rng.chance(0.5) ? 1 : -1);
    if (R + dR > Rmax || R + dR < Rmin) dR = -dR;
    R = clamp(R + dR, Rmin, Rmax);
    t += D;
  }
  items.forEach((it, i) => {
    it.id = i;
    it.state = 'wait';
  });
  return items;
}

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#050820');
    sky.addColorStop(0.35, '#0e1a4a');
    sky.addColorStop(0.68, '#232c6c');
    sky.addColorStop(0.84, '#43357a');
    sky.addColorStop(1, '#5a3c7a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // the milky way: a soft diagonal band dusted with tiny stars
    g.save();
    g.translate(W / 2, H * 0.36);
    g.rotate(-0.55);
    const band = g.createLinearGradient(0, -70, 0, 70);
    band.addColorStop(0, 'rgba(140,150,255,0)');
    band.addColorStop(0.5, 'rgba(170,170,255,0.13)');
    band.addColorStop(1, 'rgba(140,150,255,0)');
    g.fillStyle = band;
    g.fillRect(-420, -70, 840, 140);
    for (let i = 0; i < 700; i++) {
      const x = rng.range(-420, 420);
      const y = (rng.next() + rng.next() + rng.next() - 1.5) * 60;
      g.fillStyle = `rgba(220,225,255,${rng.range(0.1, 0.45).toFixed(3)})`;
      g.fillRect(x, y, 0.8, 0.8);
    }
    g.restore();
    // ordinary stars
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H * 0.82);
      const s = rng.chance(0.85) ? rng.range(0.6, 1.2) : rng.range(1.3, 2);
      g.fillStyle = rng.pick(['#ffffff', '#fff2c8', '#cfd8ff', '#ffe0f0']);
      g.globalAlpha = rng.range(0.25, 0.9) * (1 - y / (H * 1.1));
      g.beginPath();
      g.arc(x, y, s / 2, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // a violet haze over the far hills
    const haze = g.createLinearGradient(0, H * 0.7, 0, H);
    haze.addColorStop(0, 'rgba(255,150,200,0)');
    haze.addColorStop(1, 'rgba(255,150,200,0.16)');
    g.fillStyle = haze;
    g.fillRect(0, H * 0.7, W, H * 0.3);
    // far hills
    g.fillStyle = '#2c2a64';
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, 520);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, 512 + Math.sin(x * 0.018) * 14 + Math.sin(x * 0.051 + 1) * 6);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });
}

function paintTown(W, rng) {
  const top = 470;
  const h = 640 - top;
  return makeSprite(W, h, (g) => {
    g.translate(-W / 2, -h / 2 - top);
    const layer = (base, col, edge, scale, windows) => {
      let x = -10;
      while (x < W + 10) {
        const bw = rng.range(34, 58) * scale;
        const by = base + rng.range(-14, 10) * scale;
        const roof = rng.range(16, 28) * scale;
        g.fillStyle = col;
        g.beginPath();
        if (rng.chance(0.7)) {
          // a gabled roof
          g.moveTo(x, 640);
          g.lineTo(x, by);
          g.lineTo(x + bw / 2, by - roof);
          g.lineTo(x + bw, by);
          g.lineTo(x + bw, 640);
        } else {
          // a flat top with a parapet
          g.moveTo(x, 640);
          g.lineTo(x, by - roof * 0.4);
          g.lineTo(x + bw, by - roof * 0.4);
          g.lineTo(x + bw, 640);
        }
        g.closePath();
        g.fill();
        // moonlight on the roof edge
        g.strokeStyle = edge;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x, by);
        g.lineTo(x + bw / 2, by - roof);
        g.stroke();
        // a chimney
        if (rng.chance(0.55)) {
          const cx = x + bw * rng.range(0.6, 0.78);
          const cy = by - roof * 0.55;
          g.fillStyle = col;
          g.fillRect(cx - 4 * scale, cy - 14 * scale, 8 * scale, 16 * scale);
          g.fillStyle = edge;
          g.fillRect(cx - 5 * scale, cy - 15 * scale, 10 * scale, 2 * scale);
        }
        // windows, most of them asleep
        if (windows) {
          for (let wy = by + 8; wy < 630; wy += 18 * scale) {
            for (let wx = x + 7 * scale; wx < x + bw - 10 * scale; wx += 13 * scale) {
              const lit = rng.chance(0.24);
              if (lit) {
                const gl = g.createRadialGradient(wx + 3, wy + 4, 0, wx + 3, wy + 4, 14);
                gl.addColorStop(0, 'rgba(255,200,110,0.35)');
                gl.addColorStop(1, 'rgba(255,200,110,0)');
                g.fillStyle = gl;
                g.fillRect(wx - 11, wy - 10, 28, 28);
                g.fillStyle = rng.pick(['#ffd88a', '#ffc46a', '#ffe6b0']);
              } else {
                g.fillStyle = 'rgba(120,130,200,0.16)';
              }
              g.fillRect(wx, wy, 6 * scale, 8 * scale);
              if (lit) {
                g.fillStyle = 'rgba(120,60,20,0.6)';
                g.fillRect(wx + 2.7 * scale, wy, 0.8, 8 * scale);
                g.fillRect(wx, wy + 3.6 * scale, 6 * scale, 0.8);
              }
            }
          }
        }
        x += bw + rng.range(-4, 6);
      }
    };
    layer(548, '#1c1f4c', 'rgba(150,160,230,0.35)', 0.85, false);
    // a church spire on the left
    g.fillStyle = '#171a40';
    g.fillRect(36, 500, 26, 140);
    g.beginPath();
    g.moveTo(32, 502);
    g.lineTo(49, 448);
    g.lineTo(66, 502);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(160,170,240,0.45)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(49, 448);
    g.lineTo(66, 502);
    g.stroke();
    g.fillStyle = '#ffd88a';
    g.beginPath();
    g.arc(49, 520, 5, 0, TAU);
    g.fill();
    g.strokeStyle = '#171a40';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(49, 516);
    g.lineTo(49, 520);
    g.lineTo(52, 521);
    g.stroke();
    layer(586, '#0e1030', 'rgba(170,180,255,0.42)', 1, true);
    // a sleeping cat on a ridge, curled into a crescent of its own
    g.fillStyle = '#0a0b22';
    g.beginPath();
    g.ellipse(210, 566, 11, 6, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(201, 562, 5, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(197, 559);
    g.lineTo(198, 553);
    g.lineTo(201, 558);
    g.moveTo(202, 558);
    g.lineTo(205, 553);
    g.lineTo(206, 559);
    g.fill();
    g.strokeStyle = '#0a0b22';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(220, 567);
    g.quadraticCurveTo(228, 574, 216, 573);
    g.stroke();
    // a low mist over the rooftops
    const mist = g.createLinearGradient(0, 560, 0, 640);
    mist.addColorStop(0, 'rgba(120,110,200,0)');
    mist.addColorStop(1, 'rgba(120,110,200,0.25)');
    g.fillStyle = mist;
    g.fillRect(0, 560, W, 80);
  });
}

function makeMoon() {
  // a crescent lying on its back (horns up), with a sleepy face and a nightcap on one horn
  return makeSprite(180, 150, (g) => {
    g.translate(0, -85); // the sprite is drawn centred at y = 85, so this works in world y
    const cx = 0;
    const cy = 80;
    g.save();
    g.beginPath();
    g.arc(cx, cy, 70, 0, TAU);
    g.clip();
    const body = g.createRadialGradient(cx - 20, cy + 40, 6, cx, cy + 20, 90);
    body.addColorStop(0, '#fffbe8');
    body.addColorStop(0.55, '#ffe9a8');
    body.addColorStop(1, '#e8b860');
    g.fillStyle = body;
    g.fillRect(-90, 0, 180, 160);
    // craters
    for (const [x, y, r] of [[-44, 112, 6], [-18, 134, 4.5], [30, 128, 7], [52, 104, 4], [8, 141, 3]]) {
      g.fillStyle = 'rgba(200,150,70,0.28)';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,240,0.35)';
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, TAU);
      g.fill();
    }
    // the shadowed inner rim
    g.strokeStyle = 'rgba(190,130,50,0.45)';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(cx, cy - 30, 70, 0, TAU);
    g.stroke();
    g.restore();
    // carve the crescent out of the disc
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(cx, cy - 30, 70, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // sleepy face on the thick bottom of the crescent
    g.strokeStyle = '#8a5a24';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-15, 124, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    g.moveTo(20, 124);
    g.arc(15, 124, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.beginPath();
    g.arc(0, 132, 5, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(255,140,120,0.35)';
    g.beginPath();
    g.ellipse(-26, 131, 5, 3, 0, 0, TAU);
    g.ellipse(26, 131, 5, 3, 0, 0, TAU);
    g.fill();
    // a nightcap flopped over the left horn
    const capX = -66;
    const capY = 66;
    const cap = g.createLinearGradient(capX - 10, capY - 10, capX + 20, capY + 30);
    cap.addColorStop(0, '#5a6ae8');
    cap.addColorStop(1, '#2a2aa0');
    g.fillStyle = cap;
    g.beginPath();
    g.moveTo(capX - 9, capY + 8);
    g.quadraticCurveTo(capX - 2, capY - 14, capX + 14, capY - 2);
    g.quadraticCurveTo(capX + 8, capY + 18, capX - 9, capY + 8);
    g.fill();
    g.beginPath();
    g.moveTo(capX + 10, capY - 4);
    g.quadraticCurveTo(capX + 30, capY - 2, capX + 26, capY + 24);
    g.lineTo(capX + 20, capY + 22);
    g.quadraticCurveTo(capX + 20, capY + 6, capX + 6, capY + 4);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff6e0';
    for (const [x, y] of [[capX + 2, capY - 2], [capX + 16, capY + 8], [capX - 3, capY + 6]]) {
      g.beginPath();
      g.arc(x, y, 1.3, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#f4f0ff';
    g.beginPath();
    g.ellipse(capX + 2, capY + 9, 12, 3.4, -0.55, 0, TAU);
    g.fill();
    const pom = g.createRadialGradient(capX + 22, capY + 25, 0.5, capX + 23, capY + 26, 6);
    pom.addColorStop(0, '#ffffff');
    pom.addColorStop(1, '#c8c4f0');
    g.fillStyle = pom;
    g.beginPath();
    g.arc(capX + 23, capY + 27, 5.5, 0, TAU);
    g.fill();
    // the rope's knot under the moon
    g.fillStyle = '#c89a5a';
    g.beginPath();
    g.ellipse(0, 148, 4.5, 3.5, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#7a5a2a';
    g.lineWidth = 1;
    g.stroke();
  });
}

function makeCloud(rng, w, h, tint) {
  return makeSprite(w, h, (g) => {
    const puffs = [];
    for (let i = 0; i < 9; i++) puffs.push([rng.range(-w * 0.36, w * 0.36), rng.range(-h * 0.08, h * 0.18), rng.range(h * 0.2, h * 0.36)]);
    const grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, `rgba(${tint},0.5)`);
    grad.addColorStop(1, `rgba(${tint},0.1)`);
    g.fillStyle = grad;
    g.beginPath();
    for (const [x, y, r] of puffs) {
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, TAU);
    }
    g.fill();
    // silver lining on top
    g.strokeStyle = 'rgba(255,245,220,0.28)';
    g.lineWidth = 1.5;
    for (const [x, y, r] of puffs) {
      g.beginPath();
      g.arc(x, y, r - 1, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }
  }, 2);
}

function makeStar() {
  return makeSprite(32, 32, (g) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 5.6 : 13.5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const path = () => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.lineJoin = 'round';
    path();
    g.strokeStyle = '#b8600a';
    g.lineWidth = 3;
    g.stroke();
    const grad = g.createRadialGradient(-2, -3, 1, 0, 0, 14);
    grad.addColorStop(0, '#fffef0');
    grad.addColorStop(0.4, '#ffe066');
    grad.addColorStop(1, '#f39a1a');
    path();
    g.fillStyle = grad;
    g.fill();
    // bevels: light on the upper-left facets
    for (let i = 0; i < 10; i += 2) {
      const [x, y] = pts[i];
      const [x2, y2] = pts[(i + 9) % 10];
      g.fillStyle = 'rgba(255,255,255,0.32)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(x, y);
      g.lineTo(x2, y2);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,230,0.9)';
    g.lineWidth = 1;
    path();
    g.stroke();
    // a sleepy little face
    g.strokeStyle = '#9a4a08';
    g.lineWidth = 1.1;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(-3, 0, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
    g.moveTo(4.6, 0.5);
    g.arc(3, 0, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
    g.stroke();
    g.beginPath();
    g.arc(0, 3, 1.5, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  });
}

function makeBat(up) {
  return makeSprite(52, 30, (g) => {
    const wing = (s) => {
      g.save();
      g.scale(s, 1);
      const grad = g.createLinearGradient(0, -12, 24, 10);
      grad.addColorStop(0, '#6a3a8a');
      grad.addColorStop(1, '#2a1240');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(3, -2);
      if (up) {
        g.lineTo(10, -12);
        g.lineTo(18, -14);
        g.lineTo(25, -9);
        g.quadraticCurveTo(21, -6, 21, -2);
        g.quadraticCurveTo(16, -4, 14, 0);
        g.quadraticCurveTo(9, -2, 7, 3);
      } else {
        g.lineTo(11, 1);
        g.lineTo(20, 4);
        g.lineTo(25, 11);
        g.quadraticCurveTo(20, 10, 17, 13);
        g.quadraticCurveTo(14, 9, 10, 11);
        g.quadraticCurveTo(8, 7, 4, 5);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(255,150,220,0.85)';
      g.lineWidth = 1.2;
      g.stroke();
      // finger bones
      g.strokeStyle = 'rgba(150,90,200,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      if (up) {
        g.moveTo(4, -2);
        g.lineTo(18, -14);
        g.moveTo(8, -6);
        g.lineTo(21, -2);
        g.moveTo(8, -6);
        g.lineTo(14, 0);
      } else {
        g.moveTo(4, 1);
        g.lineTo(25, 11);
        g.moveTo(11, 2);
        g.lineTo(17, 13);
        g.moveTo(11, 2);
        g.lineTo(10, 11);
      }
      g.stroke();
      g.restore();
    };
    wing(1);
    wing(-1);
    // body
    const body = g.createRadialGradient(-1, -2, 1, 0, 0, 8);
    body.addColorStop(0, '#8a5aaa');
    body.addColorStop(1, '#2e1648');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 1, 5.5, 7, 0, 0, TAU);
    g.fill();
    // ears
    g.beginPath();
    g.moveTo(-4.5, -4);
    g.lineTo(-4, -10.5);
    g.lineTo(-1, -5);
    g.moveTo(4.5, -4);
    g.lineTo(4, -10.5);
    g.lineTo(1, -5);
    g.fill();
    g.strokeStyle = 'rgba(220,150,255,0.7)';
    g.lineWidth = 0.9;
    g.beginPath();
    g.ellipse(0, 1, 5.5, 7, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    // glaring eyes and fangs
    g.fillStyle = '#ff4a3a';
    g.beginPath();
    g.ellipse(-2.2, -1.5, 1.6, 1.2, 0.3, 0, TAU);
    g.ellipse(2.2, -1.5, 1.6, 1.2, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = '#ffe0c0';
    g.beginPath();
    g.arc(-2.4, -1.8, 0.5, 0, TAU);
    g.arc(2, -1.8, 0.5, 0, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-1.6, 2.4);
    g.lineTo(-1, 4.2);
    g.lineTo(-0.4, 2.4);
    g.moveTo(0.4, 2.4);
    g.lineTo(1, 4.2);
    g.lineTo(1.6, 2.4);
    g.fill();
  });
}

// The kid, side on, facing right; the seat (hips) is 14 units below the sprite's centre.
function makeKid() {
  return makeSprite(48, 64, (g) => {
    g.translate(0, 14);
    // nightcap tail streaming behind (drawn first, behind the head)
    const capG = g.createLinearGradient(-20, -44, 4, -36);
    capG.addColorStop(0, '#d8243a');
    capG.addColorStop(1, '#ff5a5a');
    g.fillStyle = capG;
    g.beginPath();
    g.moveTo(-5, -42);
    g.quadraticCurveTo(-14, -46, -20, -38);
    g.quadraticCurveTo(-12, -38, -4, -34);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.moveTo(-10, -44);
    g.lineTo(-13, -43.6);
    g.lineTo(-10.5, -37.3);
    g.lineTo(-8, -37);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-16, -42.8);
    g.lineTo(-18, -41.4);
    g.lineTo(-16, -38.2);
    g.lineTo(-14, -38.4);
    g.closePath();
    g.fill();
    const pom = g.createRadialGradient(-21, -39, 0.5, -21, -38, 4);
    pom.addColorStop(0, '#ffffff');
    pom.addColorStop(1, '#ddd6f0');
    g.fillStyle = pom;
    g.beginPath();
    g.arc(-21, -38, 3.6, 0, TAU);
    g.fill();
    // back arm (behind the body)
    g.strokeStyle = '#e0607a';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-1, -21);
    g.lineTo(-2, -30);
    g.stroke();
    // torso: coral pyjamas with white polka dots
    const pj = g.createLinearGradient(-7, -26, 7, 0);
    pj.addColorStop(0, '#ff8a9a');
    pj.addColorStop(1, '#e0506a');
    g.fillStyle = pj;
    g.beginPath();
    g.roundRect(-7, -25, 13, 26, 6);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y] of [[-3, -20], [2, -15], [-2, -9], [3, -4], [-4, -2]]) {
      g.beginPath();
      g.arc(x, y, 1.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.roundRect(-6, -24, 3, 22, 2);
    g.fill();
    // head
    const skin = g.createRadialGradient(3, -36, 1, 2, -34, 9);
    skin.addColorStop(0, '#ffe2c8');
    skin.addColorStop(1, '#f0b890');
    g.fillStyle = skin;
    g.beginPath();
    g.arc(2, -34, 8, 0, TAU);
    g.fill();
    // hair
    g.fillStyle = '#6a3a1e';
    g.beginPath();
    g.arc(0, -36, 8, Math.PI * 0.75, Math.PI * 1.6);
    g.quadraticCurveTo(-6, -30, -6, -28);
    g.closePath();
    g.fill();
    // face, looking ahead
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(6.4, -35, 1.2, 0, TAU);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(6.8, -35.4, 0.45, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,110,110,0.45)';
    g.beginPath();
    g.ellipse(5, -31, 2.2, 1.4, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#a04a3a';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(7, -31.5, 2, 0.1 * Math.PI, 0.7 * Math.PI);
    g.stroke();
    // nightcap on the head
    g.fillStyle = capG;
    g.beginPath();
    g.moveTo(-6, -36);
    g.quadraticCurveTo(-1, -47, 9, -38);
    g.quadraticCurveTo(2, -42, -6, -36);
    g.fill();
    g.beginPath();
    g.arc(1.5, -38.5, 7.6, Math.PI * 1.05, Math.PI * 1.95);
    g.lineTo(-5, -38);
    g.fill();
    g.fillStyle = '#fff4f4';
    g.beginPath();
    g.ellipse(1.6, -37.6, 8.4, 2.1, 0.05, 0, TAU);
    g.fill();
  });
}

function makeSeat() {
  return makeSprite(30, 8, (g) => {
    const wood = g.createLinearGradient(0, -3, 0, 3);
    wood.addColorStop(0, '#d89a5a');
    wood.addColorStop(1, '#8a5428');
    g.fillStyle = wood;
    g.beginPath();
    g.roundRect(-14, -2.5, 28, 5, 2);
    g.fill();
    g.strokeStyle = 'rgba(90,50,20,0.6)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-12, -0.5);
    g.lineTo(11, -0.5);
    g.stroke();
  });
}

function makeJar() {
  return makeSprite(30, 38, (g) => {
    // glass body
    const glass = g.createLinearGradient(-12, 0, 12, 0);
    glass.addColorStop(0, 'rgba(190,220,255,0.35)');
    glass.addColorStop(0.3, 'rgba(255,255,255,0.12)');
    glass.addColorStop(1, 'rgba(160,190,255,0.3)');
    g.fillStyle = glass;
    g.beginPath();
    g.roundRect(-11, -11, 22, 27, 6);
    g.fill();
    g.strokeStyle = 'rgba(220,235,255,0.75)';
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(-8, -8, 2.4, 18);
    // lid and ribbon
    g.fillStyle = '#c89a5a';
    g.beginPath();
    g.roundRect(-9, -16, 18, 6, 2);
    g.fill();
    g.fillStyle = '#5a6ae8';
    g.fillRect(-10, -11.5, 20, 2.5);
    g.beginPath();
    g.moveTo(9, -10);
    g.lineTo(14, -6);
    g.lineTo(11, -5);
    g.closePath();
    g.fill();
  });
}

function makeSparkle() {
  return makeSprite(16, 16, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(0, -8);
    g.quadraticCurveTo(0.8, -0.8, 8, 0);
    g.quadraticCurveTo(0.8, 0.8, 0, 8);
    g.quadraticCurveTo(-0.8, 0.8, -8, 0);
    g.quadraticCurveTo(-0.8, -0.8, 0, -8);
    g.fill();
  });
}

// ---------- music: lullaby electro house, 128 BPM, D♭ major over D♭–A♭–B♭m–G♭ ----------

const music = {
  cps: 128 / 240, // one 4/4 bar per cycle: 32 bars = 60s, and one full swing ≈ one bar
  setup: `
    const kick = note("db2*4").s("sine").decay(0.2).sustain(0).gain(0.8)
    const kick2 = note("db2 db2 db2 [db2 db2]").s("sine").decay(0.18).sustain(0).gain(0.8)
    const clap = s("~ pink ~ pink").decay(0.11).sustain(0).hpf(1200).lpf(6000).gain(0.15).room(0.3)
    const offhat = s("[~ white]*4").decay(0.045).sustain(0).hpf(7000).gain(0.045)
    const hats = s("white*16").decay(0.02).sustain(0).hpf(6800).gain("[0.012 0.025 0.04 0.025]*4")
    const bass = note("<[~ db3]*4 [~ ab2]*4 [~ bb2]*4 [~ gb2]*4>").s("sawtooth").attack(0.004).decay(0.14).sustain(0.25).release(0.05)
      .lpf(saw.range(420, 1500).slow(32)).lpq(5).gain(0.34)
    const sub = note("<db2 ab2 bb2 gb2>").struct("x ~ x ~").s("sine").decay(0.35).sustain(0.3).gain(0.24)
    const chords = "<[db4,f4,ab4] [c4,eb4,ab4] [db4,f4,bb4] [db4,gb4,bb4]>"
    const pad = note(chords).s("sawtooth").attack(0.4).release(0.8).lpf(saw.range(600, 1500).slow(32)).gain(0.045).room(0.6)
    const stab = note(chords).struct("~ x ~ ~ x ~ x ~").s("square").attack(0.003).decay(0.09).sustain(0).lpf(2200).gain(0.05).pan(0.4)
    const boxNotes = "<[db5 ab5 f5 ab5 db6 ab5 f5 ab5] [c5 ab5 eb5 ab5 c6 ab5 eb5 ab5] [bb4 f5 db5 f5 bb5 f5 db5 f5] [bb4 gb5 db5 gb5 bb5 gb5 db5 gb5]>"
    const box = note(boxNotes).s("triangle").attack(0.002).decay(0.22).sustain(0).lpf(4200).gain(0.07)
      .delay(0.3).delaytime(0.3516).delayfeedback(0.3).pan(sine.range(0.3, 0.7).slow(2))
    const sparkle = note(boxNotes).add(note(12)).fast(2).s("sine").attack(0.002).decay(0.1).sustain(0).gain(0.03).pan(0.65)
    const tune = "<[f5 ~ ab5 f5 eb5 db5 ~ ab4] [c5 ~ eb5 c5 ab4 ~ eb5 ~] [db5 ~ f5 db5 bb4 db5 f5 ab5] [gb5 f5 eb5 db5 bb4 ~ ab4 ~] [f5 ~ ab5 bb5 ab5 f5 ~ db5] [eb5 ~ c5 eb5 ab5 ~ eb5 c5] [db5 f5 bb5 ab5 f5 db5 bb4 f5] [gb5 ~ f5 ~ eb5 ~ db5 ~]>"
    const lead = note(tune).s("square").attack(0.01).decay(0.14).sustain(0.45).release(0.1).lpf(2400).vib(5).vibmod(0.08)
      .gain(0.06).room(0.4).delay(0.2).delaytime(0.3516).delayfeedback(0.25).pan(0.55)
    const leadHi = note(tune).add(note(12)).s("triangle").attack(0.01).decay(0.12).sustain(0.4).release(0.08).lpf(3200).gain(0.04).pan(0.42)
    const leadLow = note(tune).add(note(-12)).s("sawtooth").decay(0.14).sustain(0.35).release(0.06).lpf(1300).gain(0.04)
    const riser = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(700, 5200).slow(4)).gain(saw.range(0, 0.05).slow(4))
  `,
  song: `arrange(
    [8, stack(kick, clap, offhat, bass, sub, box)],
    [8, stack(kick, clap, offhat, hats, bass, sub, box, pad, stab)],
    [8, stack(kick, clap, offhat, hats, bass, sub, box, pad, stab, lead, riser)],
    [8, stack(kick2, clap, offhat, hats, bass, sub, box, sparkle, pad, stab, lead, leadHi, leadLow, riser)]
  )`,
};

export default {
  id: 'moonswing',
  title: 'Moon Swing',
  emoji: '🌙',
  tagline: 'Push with the swing to rise, against it to slow. Kick stars, not bats.',
  colors: { bg: '#0a0f2c', fg: '#fff6dc', accent: '#ffc94a' },
  music,

  create({ rng, W, H }) {
    const items = makePlan(rng.fork('plan'));
    const art = rng.fork('art');

    // ---- art ----
    const sky = paintSky(W, H, art);
    const town = paintTown(W, art);
    const moon = makeMoon();
    const clouds = [
      { spr: makeCloud(art, 150, 50, '150,150,230'), x: 60, y: 210, v: 5, a: 0.55 },
      { spr: makeCloud(art, 120, 40, '170,160,240'), x: 290, y: 280, v: 7, a: 0.45 },
      { spr: makeCloud(art, 190, 60, '120,120,210'), x: 200, y: 470, v: 4, a: 0.5 },
      { spr: makeCloud(art, 110, 36, '190,170,240'), x: 20, y: 360, v: 9, a: 0.35 },
    ];
    const starSpr = makeStar();
    const batUp = makeBat(true);
    const batDown = makeBat(false);
    const kidSpr = makeKid();
    const seat = makeSeat();
    const jar = makeJar();
    const sparkle = makeSparkle();
    const glowGold = glowSprite('rgba(255,210,90,0.85)', 32);
    const glowMoon = glowSprite('rgba(255,240,190,0.55)', 90);
    const glowTeal = glowSprite('rgba(90,255,230,0.9)', 16);
    const glowRed = glowSprite('rgba(255,70,90,0.8)', 26);
    const glowBat = glowSprite('rgba(255,90,170,0.6)', 26);
    const glowWarm = glowSprite('rgba(255,200,110,0.7)', 20);
    const vignette = vignetteSprite(W, H, 0.6, '4,4,20');
    const fx = createParticles();
    const dust = createParticles();
    const twinkles = [];
    for (let i = 0; i < 26; i++) twinkles.push({ x: Math.random() * W, y: Math.random() * 360, s: 5 + Math.random() * 7, ph: Math.random() * TAU, sp: 1 + Math.random() * 2 });
    const smoke = [];
    const flyers = []; // caught stars flying to the jar
    const trail = [];
    let shooting = null;

    // ---- state ----
    let th = 0;
    let om = W0 * A0 * DEG; // at GO the swing is passing the bottom, heading right
    let pose = 0; // -1 tucked … 1 legs out, eases towards the push
    let now = 0;
    let clock = 0;
    let shake = 0;
    let caught = 0;
    let jarGlow = 0;
    let fallen = null; // the kid after a bat knocks them off
    let flash = 0;

    const reach = () => Math.acos(clamp(Math.cos(th) - (om * om) / (2 * W0 * W0), -1, 1)) / DEG;
    const onArc = (ang, side) => ({ x: PX + side * Math.sin(ang * DEG) * RH, y: PY + Math.cos(ang * DEG) * RH });
    const kidPos = () => ({ x: PX + Math.sin(th) * RH, y: PY + Math.cos(th) * RH });
    const batPos = (b, t) => {
      const p = onArc(b.ang, b.side);
      const ux = b.side * Math.sin(b.ang * DEG);
      const uy = Math.cos(b.ang * DEG);
      if (t < b.tOn) {
        const fly = Math.min(1.7, b.tOn - b.tIn);
        const f = clamp(1 - (b.tOn - t) / fly, 0, 1);
        const d = (1 - easeOutCubic(f)) * 380;
        const wob = Math.sin(t * 9 + b.id) * 10 * (1 - f);
        return { x: p.x + ux * d - uy * wob, y: p.y + uy * d + ux * wob, vis: f > 0 };
      }
      if (t > b.tOff) {
        const k = t - b.tOff;
        return { x: p.x + ux * k * 260 + b.side * k * 120, y: p.y + uy * k * 120 - k * k * 160, vis: k < 1.6 };
      }
      return { x: p.x + Math.sin(t * 2.3 + b.id) * 2, y: p.y + Math.sin(t * 4.1 + b.id) * 3, vis: true };
    };

    const physics = (dt, dir, drag = 0) => {
      const deg = Math.abs(th) / DEG;
      const ex = Math.max(0, deg - SOFT) / 2.5;
      om += (-W0 * W0 * Math.sin(th) - (DAMP + drag) * om - ex * ex * 2 * om + PUSH * dir) * dt;
      th += om * dt;
    };

    const catchStar = (s) => {
      s.state = 'caught';
      caught++;
      const p = onArc(s.ang, s.side);
      fx.burst(p.x, p.y, { count: 26, speed: 190, life: 0.7, size: 3, colors: ['#fff6c0', '#ffd34a', '#ffffff', '#ffb02a'], drag: 2.4, round: true });
      dust.burst(p.x, p.y, { count: 10, speed: 90, life: 0.9, size: 2, colors: ['#ffffff', '#bff8ff'], drag: 1.5 });
      flyers.push({ x0: p.x, y0: p.y, age: 0, spin: Math.random() * TAU });
      flash = Math.min(1, flash + 0.35);
    };

    const step = (game, live) => {
      const k = kidPos();
      for (const it of items) {
        if (it.state === 'caught' || it.state === 'gone') continue;
        if (it.kind === 'star') {
          if (it.state === 'wait' && now >= it.tIn) it.state = 'on';
          if (it.state !== 'on') continue;
          const p = onArc(it.ang, it.side);
          const dx = k.x - p.x;
          const dy = k.y - p.y;
          if (live && !fallen && dx * dx + dy * dy < (KID_R + STAR_R) ** 2) {
            catchStar(it);
            continue;
          }
          if (now >= it.tOff) {
            it.state = 'gone';
            fx.burst(p.x, p.y, { count: 18, speed: 70, life: 1.1, size: 3, colors: ['#8a8aa8', '#c8c8d8', '#5a5a78'], gravity: 60, drag: 1.2, round: true });
            if (live && !game.dead) {
              game.dead = true;
              game.deathReason = 'A star faded out before you reached it. Pump higher!';
              shake = 0.3;
            }
          }
        } else {
          if (it.state === 'wait' && now >= it.tIn) it.state = 'coming';
          if (it.state === 'coming' && now >= it.tOn) it.state = 'perched';
          if (it.state === 'perched' && now >= it.tOff) it.state = 'leaving';
          if (it.state === 'leaving' && now > it.tOff + 1.6) it.state = 'gone';
          if (it.state === 'perched' && live && !game.dead) {
            const p = onArc(it.ang, it.side);
            const dx = k.x - p.x;
            const dy = k.y - p.y;
            if (dx * dx + dy * dy < (KID_R + BAT_R) ** 2) {
              game.dead = true;
              game.deathReason = 'Swung straight into a bat. Ease off before you reach one!';
              shake = 0.55;
              it.tOff = now; // it flaps off, offended
              it.state = 'leaving';
              fx.burst(k.x, k.y, { count: 30, speed: 220, life: 0.8, size: 3.2, colors: ['#ff8a9a', '#ffffff', '#6a4a8a', '#ffd34a'], drag: 2, round: true });
              const tx = Math.cos(th);
              const ty = -Math.sin(th);
              fallen = { x: k.x, y: k.y - 10, vx: tx * om * LEN * 0.8, vy: ty * om * LEN * 0.8 - 120, rot: -th, vr: -om * 2 - 3 };
            }
          }
        }
      }
    };

    const cosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt * 1.6);
      jarGlow += (Math.min(1, caught / 14) - jarGlow) * Math.min(1, dt * 2);
      fx.update(dt);
      dust.update(dt);
      for (const c of clouds) {
        c.x += c.v * dt;
        if (c.x - c.spr.w / 2 > W + 20) c.x = -c.spr.w / 2 - 20;
      }
      for (const tw of twinkles) tw.ph += dt * tw.sp;
      // chimney smoke
      if (Math.random() < dt * 3) smoke.push({ x: [96, 150, 262, 304][(Math.random() * 4) | 0] + Math.random() * 6, y: 560 + Math.random() * 10, r: 3, a: 0.3, age: 0 });
      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i];
        s.age += dt;
        s.y -= dt * 14;
        s.x += dt * 6;
        s.r += dt * 5;
        if (s.age > 3) smoke.splice(i, 1);
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        flyers[i].age += dt;
        if (flyers[i].age > 0.8) {
          flyers.splice(i, 1);
          dust.burst(JAR_X, JAR_Y - 6, { count: 6, speed: 50, life: 0.5, size: 2, colors: ['#fff6c0', '#ffd34a'], drag: 2 });
        }
      }
      if (!shooting && Math.random() < dt * 0.12) shooting = { x: Math.random() * W, y: 30 + Math.random() * 120, age: 0, dir: Math.random() < 0.5 ? -1 : 1 };
      if (shooting) {
        shooting.age += dt;
        if (shooting.age > 0.9) shooting = null;
      }
      // stardust off the kid's feet on a fast swing
      if (!fallen) {
        const k = kidPos();
        trail.push({ x: k.x, y: k.y + 6 });
        if (trail.length > 14) trail.shift();
        const sp = Math.abs(om);
        if (Math.random() < sp * dt * 14) {
          dust.burst(k.x + Math.cos(th) * 10 * Math.sign(om || 1), k.y + 10, { count: 1, speed: 30, life: 0.7, size: 2.2, colors: ['#fff6c0', '#bff8ff', '#ffffff'], drag: 1 });
        }
      } else if (trail.length) trail.shift();
      if (fallen) {
        fallen.vy += 900 * dt;
        fallen.x += fallen.vx * dt;
        fallen.y += fallen.vy * dt;
        fallen.rot += fallen.vr * dt;
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { items, get th() { return th; }, get om() { return om; }, reach },

      update(dt, dir, t) {
        now = t + dt;
        physics(dt, dir);
        pose += (dir - pose) * Math.min(1, dt * 8);
        cosmetic(dt);
        step(this, true);
      },

      afterlife(dt) {
        now += dt;
        physics(dt, 0, 0.8);
        pose *= 0.96;
        cosmetic(dt);
        step(this, false);
      },

      render(g) {
        const sx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
        g.save();
        g.translate(sx, sy);
        g.fillStyle = '#0a0f2c';
        g.fillRect(-8, -8, W + 16, H + 16);
        g.drawImage(sky.canvas, 0, 0, W, H);

        // twinkling stars and the odd shooting star
        g.globalCompositeOperation = 'lighter';
        for (const tw of twinkles) {
          const a = 0.25 + 0.6 * Math.max(0, Math.sin(tw.ph));
          drawSprite(g, sparkle, tw.x, tw.y, { size: tw.s, alpha: a });
        }
        if (shooting) {
          const k = shooting.age / 0.9;
          const x = shooting.x + shooting.dir * k * 160;
          const y = shooting.y + k * 70;
          const grad = g.createLinearGradient(x, y, x - shooting.dir * 60, y - 26);
          grad.addColorStop(0, `rgba(255,255,255,${(0.9 * (1 - k)).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.strokeStyle = grad;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - shooting.dir * 60, y - 26);
          g.stroke();
        }
        drawSprite(g, glowMoon, PX, 100, { size: 360, alpha: 0.55 + 0.05 * Math.sin(clock * 0.8) });
        g.globalCompositeOperation = 'source-over';

        for (const c of clouds) if (c.y < 400) drawSprite(g, c.spr, c.x, c.y, { alpha: c.a });
        drawSprite(g, moon, PX, 85);

        // the town below, its windows breathing
        g.drawImage(town.canvas, 0, 470, W, 170);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const wx = [70, 128, 196, 250, 318][i];
          const wy = [600, 612, 596, 608, 618][i];
          drawSprite(g, glowWarm, wx, wy, { size: 40, alpha: 0.25 + 0.15 * Math.sin(clock * (0.7 + i * 0.3) + i) });
        }
        g.globalCompositeOperation = 'source-over';
        for (const s of smoke) {
          g.fillStyle = `rgba(180,175,220,${(0.18 * (1 - s.age / 3)).toFixed(3)})`;
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, TAU);
          g.fill();
        }
        for (const c of clouds) if (c.y >= 400) drawSprite(g, c.spr, c.x, c.y, { alpha: c.a });

        // the path of the swing
        g.setLineDash([2, 9]);
        g.strokeStyle = 'rgba(200,210,255,0.22)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(PX, PY, RH, Math.PI / 2 - AMAX * DEG - 0.04, Math.PI / 2 + AMAX * DEG + 0.04);
        g.stroke();
        g.setLineDash([]);

        const A = this.dead ? 0 : Math.min(reach(), AMAX + 2);

        // bats: their perches first (dashed red rings), then the bats themselves
        for (const b of items) {
          if (b.kind !== 'bat' || (b.state !== 'coming' && b.state !== 'perched')) continue;
          const p = onArc(b.ang, b.side);
          const danger = !this.dead && A >= b.eff;
          const soon = b.state === 'perched' ? 1 : clamp(1 - (b.tOn - now) / (b.tOn - b.tIn), 0, 1);
          const pulse = danger ? 0.6 + 0.4 * Math.sin(clock * 16) : 1;
          if (danger) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowRed, p.x, p.y, { size: 70, alpha: 0.5 * pulse });
            g.globalCompositeOperation = 'source-over';
          }
          g.setLineDash([4, 4]);
          g.lineDashOffset = -clock * 12;
          g.strokeStyle = `rgba(255,${danger ? 70 : 110},${danger ? 90 : 130},${((danger ? 0.95 : 0.45) * pulse).toFixed(3)})`;
          g.lineWidth = danger ? 2.6 : 1.8;
          g.beginPath();
          g.arc(p.x, p.y, BAT_R + 7, 0, TAU);
          g.stroke();
          g.setLineDash([]);
          if (b.state === 'coming') {
            // countdown until it lands
            g.strokeStyle = `rgba(255,120,140,${(0.35 + 0.5 * soon).toFixed(3)})`;
            g.lineWidth = 2.5;
            g.beginPath();
            g.arc(p.x, p.y, BAT_R + 11, -Math.PI / 2, -Math.PI / 2 + TAU * soon);
            g.stroke();
            if (!batPos(b, now).vis) {
              g.fillStyle = `rgba(255,140,150,${(0.5 + 0.3 * Math.sin(clock * 6)).toFixed(3)})`;
              g.font = `900 13px ${BODY_FONT}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText('!', p.x, p.y + 1);
            }
          }
        }
        for (const b of items) {
          if (b.kind !== 'bat' || (b.state !== 'coming' && b.state !== 'perched' && b.state !== 'leaving')) continue;
          const q = batPos(b, now);
          if (!q.vis) continue;
          const flap = Math.sin(clock * (b.state === 'perched' ? 14 : 20) + b.id * 1.7) > 0;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowBat, q.x, q.y, { size: 64, alpha: 0.55 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, flap ? batUp : batDown, q.x, q.y, { size: 50 });
        }

        // stars, each with a fading ring
        for (const s of items) {
          if (s.kind !== 'star' || s.state !== 'on') continue;
          const p = onArc(s.ang, s.side);
          const life = clamp((s.tOff - now) / (s.tOff - s.tIn), 0, 1);
          const fadeIn = clamp((now - s.tIn) / 0.3, 0, 1);
          const ok = !this.dead && A >= s.eff;
          const low = life < 0.3;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, ok ? glowTeal : glowGold, p.x, p.y, { size: ok ? 54 : 64, alpha: fadeIn * (0.45 + 0.25 * Math.sin(clock * 5 + s.id)) });
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = 'rgba(255,255,255,0.15)';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(p.x, p.y, STAR_R + 6, 0, TAU);
          g.stroke();
          const col = ok ? '110,255,200' : low ? (Math.sin(clock * 18) > 0 ? '255,110,110' : '255,210,120') : '255,214,100';
          g.strokeStyle = `rgba(${col},${(0.9 * fadeIn).toFixed(3)})`;
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(p.x, p.y, STAR_R + 6, -Math.PI / 2, -Math.PI / 2 + TAU * life);
          g.stroke();
          g.lineCap = 'butt';
          const bob = Math.sin(clock * 3 + s.id) * 1.5;
          const size = 30 * (0.6 + 0.4 * easeOutCubic(fadeIn)) * (low ? 0.9 + 0.1 * life / 0.3 : 1);
          g.globalAlpha = fadeIn * (low ? 0.6 + 0.4 * (life / 0.3) : 1);
          drawSprite(g, starSpr, p.x, p.y + bob, { size, rot: Math.sin(clock * 1.7 + s.id) * 0.18 });
          g.globalAlpha = 1;
        }

        // how high this swing will go: two teal ticks on the arc
        if (!this.dead) {
          for (const side of [-1, 1]) {
            const p = onArc(A, side);
            const nx = side * Math.sin(A * DEG);
            const ny = Math.cos(A * DEG);
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, glowTeal, p.x, p.y, { size: 26, alpha: 0.75 });
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = 'rgba(150,255,240,0.9)';
            g.lineWidth = 2.5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(p.x - nx * 9, p.y - ny * 9);
            g.lineTo(p.x + nx * 9, p.y + ny * 9);
            g.stroke();
            g.lineCap = 'butt';
          }
        }

        // stardust trail behind the kid
        if (trail.length > 2) {
          g.globalCompositeOperation = 'lighter';
          for (let i = 1; i < trail.length; i++) {
            const a = (i / trail.length) * 0.35 * clamp(Math.abs(om) / 1.5, 0, 1);
            g.strokeStyle = `rgba(190,240,255,${a.toFixed(3)})`;
            g.lineWidth = 2 + (i / trail.length) * 5;
            g.beginPath();
            g.moveTo(trail[i - 1].x, trail[i - 1].y);
            g.lineTo(trail[i].x, trail[i].y);
            g.stroke();
          }
          g.globalCompositeOperation = 'source-over';
        }
        dust.render(g, true);

        // rope, seat and kid
        const sxp = PX + Math.sin(th) * LEN;
        const syp = PY + Math.cos(th) * LEN;
        g.strokeStyle = '#a87a44';
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(PX, PY);
        g.lineTo(sxp, syp);
        g.stroke();
        g.strokeStyle = 'rgba(255,230,180,0.45)';
        g.lineWidth = 1;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.moveTo(PX, PY);
        g.lineTo(sxp, syp);
        g.stroke();
        g.setLineDash([]);
        drawSprite(g, seat, sxp, syp + 0.5, { rot: -th });
        if (!fallen) {
          g.save();
          g.translate(sxp, syp - 2);
          g.rotate(-th - 0.2 * pose);
          // legs: out straight on a forward push, tucked under on a back push
          const q = (pose + 1) / 2;
          const thighA = lerp(0.15, -0.18, q);
          const kx = Math.cos(thighA) * 11 + 1;
          const ky = Math.sin(thighA) * 11 - 1;
          const shinA = lerp(1.95, 0.1, q);
          const fx2 = kx + Math.cos(shinA) * 11;
          const fy2 = ky + Math.sin(shinA) * 11;
          g.lineCap = 'round';
          g.strokeStyle = '#e0506a';
          g.lineWidth = 5.5;
          g.beginPath();
          g.moveTo(0, -2);
          g.lineTo(kx, ky);
          g.lineTo(fx2, fy2);
          g.stroke();
          g.fillStyle = '#5a6ae8';
          g.beginPath();
          g.ellipse(fx2 + Math.cos(shinA - 1.4) * 2, fy2 + Math.sin(shinA - 1.4) * 2, 4, 2.6, shinA - 1.5, 0, TAU);
          g.fill();
          g.drawImage(kidSpr.canvas, -kidSpr.w / 2, -kidSpr.h / 2 - 14, kidSpr.w, kidSpr.h);
          g.restore();
          // the near rope runs in front of the kid down to their hands
          const hx = PX + Math.sin(th) * (LEN - 30);
          const hy = PY + Math.cos(th) * (LEN - 30);
          g.strokeStyle = '#c8945a';
          g.lineWidth = 2.6;
          g.beginPath();
          g.moveTo(PX, PY);
          g.lineTo(hx, hy);
          g.stroke();
          g.fillStyle = '#ffd6b8';
          g.beginPath();
          g.arc(hx + Math.cos(th) * 1.5, hy - Math.sin(th) * 1.5, 3.2, 0, TAU);
          g.fill();
        } else {
          g.save();
          g.translate(fallen.x, fallen.y);
          g.rotate(fallen.rot);
          g.strokeStyle = '#e0506a';
          g.lineWidth = 5.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(0, -2);
          g.lineTo(12, -4);
          g.lineTo(20, 4);
          g.stroke();
          g.drawImage(kidSpr.canvas, -kidSpr.w / 2, -kidSpr.h / 2 - 14, kidSpr.w, kidSpr.h);
          g.restore();
        }

        fx.render(g, true);

        // the jar of stars on the rooftop
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowGold, JAR_X, JAR_Y + 2, { size: 30 + 50 * jarGlow, alpha: 0.2 + 0.55 * jarGlow });
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < Math.min(caught, 14); i++) {
          const a = i * 2.4 + clock * 0.6;
          drawSprite(g, starSpr, JAR_X + Math.sin(a) * 6, JAR_Y + 12 - (i % 5) * 4 - Math.floor(i / 5) * 2 + Math.cos(a * 1.3) * 1.5, { size: 8, rot: a });
        }
        drawSprite(g, jar, JAR_X, JAR_Y);
        g.fillStyle = 'rgba(255,240,200,0.9)';
        g.font = `800 12px ${BODY_FONT}`;
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(`★ ${caught}`, JAR_X - 18, JAR_Y + 10);
        for (const f of flyers) {
          const k = easeOutCubic(clamp(f.age / 0.8, 0, 1));
          const cx = lerp(f.x0, JAR_X, k);
          const cy = lerp(f.y0, JAR_Y, k) - Math.sin(k * Math.PI) * 70;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowGold, cx, cy, { size: 30, alpha: 0.7 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, starSpr, cx, cy, { size: lerp(22, 9, k), rot: f.spin + k * 6 });
        }

        if (flash > 0) {
          g.fillStyle = `rgba(255,240,200,${(flash * 0.08).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
        }
        g.drawImage(vignette.canvas, 0, 0, W, H);
        g.restore();
      },
    };
    return game;
  },
};
