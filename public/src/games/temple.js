// Temple Drop — an explorer is trapped in the shaft of a sunken sandstone temple, and the
// spiked stone ceiling is grinding down after her. The shaft is stacked with stone floors,
// each with a hole in it somewhere. You can't climb or jump, only run left and right and
// drop through the holes, steering while you fall. The ceiling keeps coming (faster and
// faster), so you race it down floor after floor: let a floor carry you up into the
// spikes and the run is over.
// Spike beds wait under some holes (steer towards the next hole while you fall), from 11s
// some floors are rolling logs that carry you along, and from 20s spring-loaded spike traps
// pop up on the way to the hole. Every floor is planned up front around a hidden route, so
// the next hole can always be reached without crossing spikes. The view follows you down,
// so a long drop through several holes in a row is always safe (and buys you time).

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
const WALL_L = 24; // inner faces of the side pillars
const WALL_R = 336;
const CEIL_Y = 66; // screen y of the ceiling's spike tips
const RUN = 215;
const GRAV = 1500;
const FALL_MAX = 640;
const FOOT = 6; // half-width of the feet (what stands on floors)
const BODY = 5; // half-width used against spikes (a little forgiving)
const HEAD = 40; // feet to the top of the helmet
const SLAB = 22; // floor thickness
const SPIKE_H = 12;
const FOLLOW = 440; // the view keeps the explorer's feet above this screen line
const REF = 150; // how fast a good explorer gets down (for planning the floors)

const camSpeed = (t) => lerp(40, 145, progress(t, 60, 1.6));

// ---------- the plan: every floor, decided up front ----------

function buildPlan(rng) {
  // where the ceiling will be at each moment if the explorer never runs ahead of it
  // (a good explorer goes down faster than the ceiling early on, and the view follows them)
  const camAt = [0];
  for (let i = 1; i <= 1500; i++) camAt.push(camAt[i - 1] + Math.max(REF, camSpeed((i - 0.5) * 0.05)) * 0.05);
  const tEst = (y) => {
    const target = y - FOLLOW;
    for (let i = 0; i < camAt.length; i++) if (camAt[i] >= target) return i * 0.05;
    return 75;
  };

  // pass 1: the floors and the hole on the hidden route
  const floors = [];
  let y = 330;
  let G = 180 + (rng.next() < 0.5 ? -1 : 1) * lerp(80, 110, rng.next());
  floors.push({ y, G, w: 82, t: 0 });
  while (y < 20000) {
    const r = [rng.next(), rng.next(), rng.next(), rng.next()];
    const tj = tEst(y + 130);
    const p = progress(tj, 60, 1.25);
    y += lerp(150, 116, p) * lerp(0.88, 1.12, r[0]);
    const w = lerp(80, 46, p) * lerp(0.92, 1.08, r[1]);
    // the first holes are far apart, so nobody drops through two in a row by accident
    const dist = tj < 4 ? 175 : lerp(150, 236, p) * lerp(0.85, 1, r[2]);
    const lo = WALL_L + w / 2 + 6;
    const hi = WALL_R - w / 2 - 6;
    // anywhere along the floor that's far enough but not too far (so holes don't just zigzag wall to wall)
    const maxD = Math.max(dist, 120);
    const minD = Math.max(84, maxD * 0.55);
    const spans = [];
    if (G - minD >= lo) spans.push([Math.max(lo, G - maxD), G - minD]);
    if (G + minD <= hi) spans.push([G + minD, Math.min(hi, G + maxD)]);
    if (!spans.length) spans.push(G - lo > hi - G ? [lo, lo] : [hi, hi]);
    const total = spans.reduce((a, [u, v]) => a + (v - u), 0);
    let k = r[3] * total;
    for (const [u, v] of spans) {
      if (k <= v - u) {
        G = u + k;
        break;
      }
      k -= v - u;
    }
    floors.push({ y, G, w, t: tEst(y) });
  }

  // pass 2: holes, hazards and rollers around that route
  for (const f of floors) {
    f.gaps = [{ l: f.G - f.w / 2, r: f.G + f.w / 2, real: true }];
    f.spikes = [];
    f.traps = [];
    f.roll = 0;
  }
  for (let j = 1; j < floors.length; j++) {
    const f = floors[j];
    const prev = floors[j - 1];
    const r = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
    const p = progress(f.t, 60, 1.25);
    const L = prev.G;
    const side = f.G > L ? 1 : -1;
    const gapNear = f.G - side * (f.w / 2); // the near edge of this floor's hole
    let farBlock = L - side * (prev.w / 2); // how far the hazard-free landing zone reaches backwards

    // a spike bed under the hole above: you have to steer towards this floor's hole as you fall
    if (f.t > 6 && r[0] < lerp(0.3, 0.62, p)) {
      // it reaches from beyond the hole's far side to around its middle, so falling from
      // anywhere in the hole and running towards the next one always clears it
      let off = lerp(-0.5, -0.12, p) * prev.w + lerp(-4, 4, r[1]);
      off = Math.min(off, 69 - prev.w / 2, (gapNear - L) * side - 40);
      if (off > -prev.w / 2 + 6) {
        const near = L + side * off;
        const far = clamp(L - side * (prev.w / 2 + lerp(16, 52, r[2])), WALL_L, WALL_R);
        f.spikes.push({ l: Math.min(near, far), r: Math.max(near, far), kind: 'bed' });
        farBlock = far;
      }
    }

    // rolling logs that carry you along
    if (f.t > 11 && r[7] < 0.3) {
      f.roll = (r[8] < 0.5 ? -1 : 1) * lerp(48, 92, p);
    } else if (f.t > 20 && r[7] < 0.3 + lerp(0.35, 0.6, p)) {
      // a spring-loaded spike trap on the way to the hole
      const tw = lerp(24, 34, r[8]);
      const a = (side > 0 ? Math.max(L + prev.w / 2, f.spikes.length ? Math.max(...f.spikes.map((s) => s.r)) : -1e9) : Math.min(L - prev.w / 2, f.spikes.length ? Math.min(...f.spikes.map((s) => s.l)) : 1e9)) + side * 60;
      const b = gapNear - side * 20;
      const span = (b - a) * side - tw;
      if (span > 0) {
        const c0 = a + side * (span * r[9]);
        const l = side > 0 ? c0 : c0 - tw;
        const period = lerp(2.5, 1.95, p);
        f.traps.push({ l, r: l + tw, period, up: 0.7, phase: r[9] * 7.31 % 1 * period });
      }
    }
  }
  for (const f of floors) {
    f.gaps.sort((a, b) => a.l - b.l);
    // the solid stretches between holes, for drawing
    f.solid = [];
    let x = 0;
    for (const gp of f.gaps) {
      f.solid.push([x, gp.l]);
      x = gp.r;
    }
    f.solid.push([x, 360]);
  }
  return floors;
}

// trap state at time t: 0 = down, (0,1) = warning, 1 = up
function trapState(tr, t) {
  const c = (((t + tr.phase) % tr.period) + tr.period) % tr.period;
  const warn = 0.8;
  const start = tr.period - tr.up;
  if (c >= start) return 1;
  if (c >= start - warn) return (c - (start - warn)) / warn * 0.99;
  return 0;
}

// ---------- art ----------

function sandstone(g, x, y, w, h, base, rngv) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, base[0]);
  gr.addColorStop(1, base[1]);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  // grain
  for (let i = 0; i < (w * h) / 40; i++) {
    g.fillStyle = rngv() < 0.5 ? 'rgba(255,230,170,0.10)' : 'rgba(80,40,10,0.10)';
    g.fillRect(x + rngv() * w, y + rngv() * h, 1 + rngv() * 1.5, 1);
  }
}

function paintWallTile(rng) {
  const TW = 360;
  const TH = 300;
  return makeSprite(TW, TH, (g) => {
    g.translate(-TW / 2, -TH / 2);
    const rv = () => rng.next();
    const tones = [
      ['#5e3a22', '#4a2c18'],
      ['#664029', '#4f301b'],
      ['#563420', '#422714'],
      ['#6b452a', '#52331d'],
    ];
    for (let row = 0; row < 10; row++) {
      const y = row * 30;
      let x = -rv() * 60;
      while (x < TW) {
        const bw = 44 + rv() * 46;
        sandstone(g, x, y, bw, 30, tones[Math.floor(rv() * tones.length)], rv);
        // bevel
        g.fillStyle = 'rgba(255,215,150,0.1)';
        g.fillRect(x, y, bw, 2);
        g.fillRect(x, y, 2, 30);
        g.fillStyle = 'rgba(40,18,6,0.45)';
        g.fillRect(x, y + 28, bw, 2);
        g.fillRect(x + bw - 2, y, 2, 30);
        // carved reliefs on some blocks
        const k = rv();
        const cx = x + bw / 2;
        const cy = y + 15;
        g.strokeStyle = 'rgba(28,12,4,0.6)';
        g.fillStyle = 'rgba(28,12,4,0.5)';
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        if (k < 0.12) {
          // a sun with rays
          g.beginPath();
          g.arc(cx, cy, 5, 0, TAU);
          g.stroke();
          for (let a = 0; a < 8; a++) {
            const an = (a / 8) * TAU;
            g.beginPath();
            g.moveTo(cx + Math.cos(an) * 7.5, cy + Math.sin(an) * 7.5);
            g.lineTo(cx + Math.cos(an) * 10.5, cy + Math.sin(an) * 10.5);
            g.stroke();
          }
        } else if (k < 0.22) {
          // an eye
          g.beginPath();
          g.moveTo(cx - 11, cy);
          g.quadraticCurveTo(cx, cy - 9, cx + 11, cy);
          g.quadraticCurveTo(cx, cy + 9, cx - 11, cy);
          g.stroke();
          g.beginPath();
          g.arc(cx, cy, 3, 0, TAU);
          g.fill();
        } else if (k < 0.32) {
          // water waves
          for (const dy of [-5, 0, 5]) {
            g.beginPath();
            for (let i = 0; i <= 4; i++) {
              const px = cx - 12 + i * 6;
              g[i ? 'lineTo' : 'moveTo'](px, cy + dy + (i % 2 ? -2 : 2));
            }
            g.stroke();
          }
        } else if (k < 0.4) {
          // a bird
          g.beginPath();
          g.moveTo(cx - 10, cy + 2);
          g.quadraticCurveTo(cx - 4, cy - 7, cx, cy + 1);
          g.quadraticCurveTo(cx + 4, cy - 7, cx + 10, cy + 2);
          g.stroke();
        } else if (k < 0.47) {
          // zigzag band
          g.beginPath();
          for (let i = 0; i <= 6; i++) g[i ? 'lineTo' : 'moveTo'](x + 6 + (i * (bw - 12)) / 6, cy + (i % 2 ? -5 : 5));
          g.stroke();
        } else if (k < 0.52) {
          // a crack
          g.strokeStyle = 'rgba(30,12,4,0.5)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x + bw * 0.2, y + 2);
          g.lineTo(x + bw * 0.35, y + 11);
          g.lineTo(x + bw * 0.3, y + 19);
          g.lineTo(x + bw * 0.45, y + 28);
          g.stroke();
        }
        x += bw;
      }
    }
  }, 1.5);
}

function paintPillar(rng) {
  return makeSprite(26, 200, (g) => {
    g.translate(-13, -100);
    const gr = g.createLinearGradient(0, 0, 26, 0);
    gr.addColorStop(0, '#5a3517');
    gr.addColorStop(0.35, '#c08a4c');
    gr.addColorStop(0.6, '#a87336');
    gr.addColorStop(1, '#4a2a10');
    g.fillStyle = gr;
    g.fillRect(0, 0, 26, 200);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,230,170,0.12)' : 'rgba(60,30,8,0.15)';
      g.fillRect(rng.next() * 26, rng.next() * 200, 1.5, 1);
    }
    // carved rings and a lapis band
    for (const y of [0, 100]) {
      g.fillStyle = 'rgba(40,18,4,0.55)';
      g.fillRect(0, y + 2, 26, 3);
      g.fillStyle = 'rgba(255,220,150,0.3)';
      g.fillRect(0, y + 5, 26, 1);
      g.fillStyle = '#1f5f8f';
      g.fillRect(0, y + 10, 26, 6);
      g.fillStyle = '#e8b84a';
      for (let x = 2; x < 26; x += 6) g.fillRect(x, y + 12, 2, 2);
      g.fillStyle = 'rgba(40,18,4,0.55)';
      g.fillRect(0, y + 16, 26, 2);
    }
    // vertical fluting
    g.fillStyle = 'rgba(40,18,4,0.25)';
    for (const x of [6, 13, 20]) g.fillRect(x, 20, 1.5, 78);
    for (const x of [6, 13, 20]) g.fillRect(x, 120, 1.5, 78);
  }, 2);
}

function paintSlab(rng) {
  return makeSprite(360, SLAB + 6, (g) => {
    g.translate(-180, -(SLAB + 6) / 2);
    const gr = g.createLinearGradient(0, 0, 0, SLAB);
    gr.addColorStop(0, '#f2c77e');
    gr.addColorStop(0.18, '#d7a35c');
    gr.addColorStop(0.7, '#b07b3c');
    gr.addColorStop(1, '#7c4f22');
    g.fillStyle = gr;
    g.fillRect(0, 0, 360, SLAB);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,240,190,0.16)' : 'rgba(90,50,15,0.16)';
      g.fillRect(rng.next() * 360, 3 + rng.next() * (SLAB - 4), 1 + rng.next() * 2, 1);
    }
    // top lip
    g.fillStyle = '#ffe2a6';
    g.fillRect(0, 0, 360, 2);
    g.fillStyle = 'rgba(120,70,25,0.5)';
    g.fillRect(0, 4, 360, 1);
    // carved meander band
    g.strokeStyle = 'rgba(90,48,14,0.6)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let x = 0; x < 360; x += 12) {
      g.moveTo(x, 15);
      g.lineTo(x, 9);
      g.lineTo(x + 8, 9);
      g.lineTo(x + 8, 13);
      g.lineTo(x + 4, 13);
    }
    g.stroke();
    // block joints
    let x = rng.next() * 50;
    while (x < 360) {
      g.fillStyle = 'rgba(70,35,10,0.55)';
      g.fillRect(x, 5, 1.5, SLAB - 5);
      g.fillStyle = 'rgba(255,225,160,0.25)';
      g.fillRect(x + 1.5, 5, 1, SLAB - 5);
      x += 50 + rng.next() * 40;
    }
    g.fillStyle = '#4a2a0e';
    g.fillRect(0, SLAB - 1.5, 360, 1.5);
    // shadow cast below
    const sh = g.createLinearGradient(0, SLAB, 0, SLAB + 6);
    sh.addColorStop(0, 'rgba(20,8,2,0.55)');
    sh.addColorStop(1, 'rgba(20,8,2,0)');
    g.fillStyle = sh;
    g.fillRect(0, SLAB, 360, 6);
  }, 2);
}

function paintSpike() {
  return makeSprite(10, SPIKE_H + 2, (g) => {
    g.translate(0, (SPIKE_H + 2) / 2);
    const gr = g.createLinearGradient(-5, 0, 5, 0);
    gr.addColorStop(0, '#8a5a10');
    gr.addColorStop(0.4, '#ffe58a');
    gr.addColorStop(0.55, '#f4b832');
    gr.addColorStop(1, '#7a4a06');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-4.6, 0);
    g.lineTo(0, -SPIKE_H);
    g.lineTo(4.6, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(70,35,0,0.7)';
    g.lineWidth = 0.6;
    g.stroke();
    g.fillStyle = 'rgba(255,255,230,0.9)';
    g.fillRect(-0.6, -SPIKE_H + 2, 1, 4);
  }, 4);
}

function paintCeiling(rng) {
  const H0 = CEIL_Y + 4;
  return makeSprite(360, H0, (g) => {
    g.translate(-180, -H0 / 2);
    const base = CEIL_Y - 18;
    const gr = g.createLinearGradient(0, 0, 0, base);
    gr.addColorStop(0, '#3a2210');
    gr.addColorStop(0.5, '#6e4724');
    gr.addColorStop(1, '#8c5c2e');
    g.fillStyle = gr;
    g.fillRect(0, 0, 360, base);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = rng.next() < 0.5 ? 'rgba(255,220,160,0.12)' : 'rgba(30,12,2,0.2)';
      g.fillRect(rng.next() * 360, rng.next() * base, 1.5, 1);
    }
    // carved frieze of skull-less, friendly-ish faces: just eyes and teeth slots
    g.fillStyle = '#1d6f6a';
    g.fillRect(0, base - 12, 360, 5);
    g.fillStyle = 'rgba(140,255,230,0.35)';
    g.fillRect(0, base - 12, 360, 1);
    for (let x = 10; x < 360; x += 40) {
      g.fillStyle = 'rgba(30,12,2,0.6)';
      g.beginPath();
      g.moveTo(x, 6);
      g.lineTo(x + 20, 6);
      g.lineTo(x + 10, 26);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8b84a';
      g.beginPath();
      g.arc(x + 10, 13, 2.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#c99550';
    g.fillRect(0, base - 3, 360, 3);
    g.fillStyle = '#ffe0a0';
    g.fillRect(0, base - 3, 360, 1);
    // big golden spikes
    for (let x = 0; x < 362; x += 15) {
      const sg = g.createLinearGradient(x - 7, 0, x + 7, 0);
      sg.addColorStop(0, '#6e4206');
      sg.addColorStop(0.45, '#ffe58a');
      sg.addColorStop(0.6, '#e9a92a');
      sg.addColorStop(1, '#5e3804');
      g.fillStyle = sg;
      g.beginPath();
      g.moveTo(x - 7, base);
      g.lineTo(x, CEIL_Y);
      g.lineTo(x + 7, base);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(60,30,0,0.6)';
      g.lineWidth = 0.7;
      g.stroke();
    }
  }, 2);
}

// the explorer, facing right; pose: 0 stand, 1 & 2 run, 3 fall
function paintExplorer(pose) {
  return makeSprite(30, 40, (g) => {
    g.translate(0, 20); // origin at the feet
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const skin = '#c98a5a';
    const leg = (x0, ang, col) => {
      g.save();
      g.translate(x0, -13);
      g.rotate(ang);
      g.fillStyle = '#6b4a2a';
      g.fillRect(-2.4, 0, 4.8, 8);
      g.fillStyle = skin;
      g.fillRect(-2, 7, 4, 2);
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(-2.6, 8.5, 7, 4.5, 1.5);
      g.fill();
      g.restore();
    };
    const legs = [[[-1.5, 0.05], [1.5, -0.05]], [[-1.5, 0.6], [1.5, -0.55]], [[-1.5, -0.55], [1.5, 0.6]], [[-2, 0.35], [2, -0.3]]][pose];
    leg(legs[0][0], legs[0][1], '#3a2412');
    // backpack
    g.fillStyle = '#7a3b1c';
    g.beginPath();
    g.roundRect(-11, -26, 7, 12, 2.5);
    g.fill();
    g.fillStyle = '#a3542a';
    g.fillRect(-11, -24, 7, 2);
    // body (khaki shirt)
    const sh = g.createLinearGradient(-6, 0, 6, 0);
    sh.addColorStop(0, '#9a8650');
    sh.addColorStop(0.5, '#d9c48a');
    sh.addColorStop(1, '#a6925a');
    g.fillStyle = sh;
    g.beginPath();
    g.roundRect(-6, -27, 12, 15, 3);
    g.fill();
    // belt and satchel strap
    g.fillStyle = '#4a2a12';
    g.fillRect(-6, -15, 12, 2.4);
    g.fillStyle = '#e8b84a';
    g.fillRect(-1, -15, 2, 2.4);
    g.strokeStyle = '#5a3216';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-5, -26);
    g.lineTo(5, -14);
    g.stroke();
    leg(legs[1][0], legs[1][1], '#4a2e16');
    // arms
    const arm = (ang, front) => {
      g.save();
      g.translate(front ? 2 : -2, -25);
      g.rotate(ang);
      g.fillStyle = front ? '#cdb87e' : '#a8935c';
      g.fillRect(-1.8, 0, 3.6, 6);
      g.fillStyle = skin;
      g.fillRect(-1.6, 5.5, 3.2, 4.5);
      g.restore();
    };
    const arms = [[0.25, -0.2], [0.9, -0.8], [-0.8, 0.9], [2.6, -2.5]][pose];
    arm(arms[0], false);
    // red neckerchief
    g.fillStyle = '#d6332a';
    g.beginPath();
    g.moveTo(-4, -28);
    g.lineTo(4, -28);
    g.lineTo(0, -23);
    g.closePath();
    g.fill();
    // head
    g.fillStyle = skin;
    g.beginPath();
    g.arc(1, -31, 5.2, 0, TAU);
    g.fill();
    g.fillStyle = '#5a2e14';
    g.beginPath();
    g.ellipse(-3, -30, 2.4, 3.6, 0.3, 0, TAU);
    g.fill(); // hair at the back
    g.fillStyle = '#2a1408';
    g.beginPath();
    g.arc(3.4, -31.3, 0.9, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(220,90,70,0.5)';
    g.beginPath();
    g.arc(3, -29, 1.2, 0, TAU);
    g.fill();
    // pith helmet
    const hg = g.createLinearGradient(0, -41, 0, -33);
    hg.addColorStop(0, '#fff5d6');
    hg.addColorStop(1, '#d9c28c');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(1, -34.5, 7.5, 6, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = '#c4a96c';
    g.beginPath();
    g.ellipse(1, -34, 9.5, 1.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#7a3b1c';
    g.fillRect(-5.8, -36.6, 13.6, 1.6);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(-1.5, -38.5, 2.5, 1.2, -0.3, 0, TAU);
    g.fill();
    arm(arms[1], true);
  }, 3);
}

function paintHelmet() {
  return makeSprite(22, 12, (g) => {
    const hg = g.createLinearGradient(0, -6, 0, 3);
    hg.addColorStop(0, '#fff5d6');
    hg.addColorStop(1, '#d9c28c');
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(0, 2, 7.5, 6, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = '#c4a96c';
    g.beginPath();
    g.ellipse(0, 2.5, 9.5, 1.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#7a3b1c';
    g.fillRect(-6.8, -0.1, 13.6, 1.6);
  }, 3);
}

function paintFlame() {
  return makeSprite(16, 26, (g) => {
    g.translate(0, 6);
    const gr = g.createRadialGradient(0, 0, 1, 0, -4, 14);
    gr.addColorStop(0, '#fffbe0');
    gr.addColorStop(0.3, '#ffd24a');
    gr.addColorStop(0.7, '#ff7a1a');
    gr.addColorStop(1, 'rgba(200,40,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -18);
    g.quadraticCurveTo(7, -6, 5, 2);
    g.quadraticCurveTo(0, 7, -5, 2);
    g.quadraticCurveTo(-7, -6, 0, -18);
    g.fill();
  }, 3);
}

function paintTorch() {
  return makeSprite(14, 22, (g) => {
    g.fillStyle = '#4a2a10';
    g.beginPath();
    g.moveTo(-5, -9);
    g.lineTo(5, -9);
    g.lineTo(2, 10);
    g.lineTo(-2, 10);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8952e';
    g.fillRect(-6, -10, 12, 3);
    g.fillRect(-3, 2, 6, 2);
    g.fillStyle = '#ffe28a';
    g.fillRect(-6, -10, 12, 1);
  }, 3);
}

// ---------- music: big-beat adventure breaks, 132 BPM, A minor, Andalusian cadence Am–G–F–E ----------

const music = {
  cps: 132 / 240,
  setup: `
    const kick = note("a2 ~ ~ ~ ~ ~ ~ a2 ~ ~ a2 ~ ~ ~ ~ ~").s("sine").decay(0.24).sustain(0).gain(0.8)
    const kick2 = note("a2 ~ ~ a2 ~ ~ ~ a2 ~ ~ a2 ~ ~ ~ a2 a2").s("sine").decay(0.22).sustain(0).gain(0.8)
    const snare = s("~ ~ ~ ~ pink ~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~").decay(0.16).sustain(0).hpf(600).lpf(5500).gain(0.15).room(0.25)
    const ghost = s("~ ~ ~ ~ ~ ~ ~ ~ ~ pink ~ ~ ~ ~ ~ pink").decay(0.06).sustain(0).hpf(900).lpf(5000).gain(0.05)
    const hats = s("white*8").decay(0.04).sustain(0).hpf(6800).gain("[0.045 0.025]*4")
    const hat16 = s("white*16").decay(0.025).sustain(0).hpf(7200).gain("[0.012 0.03 0.02 0.03]*4")
    const shaker = s("[~ white ~ white]*4").decay(0.05).sustain(0).hpf(5200).lpf(9000).gain(0.025).pan(0.65)
    const acid = note("<[a2 a2 a3 a2 ~ a2 g3 ~ a2 ~ a3 a2 e3 a2 c3 e3] [g2 g2 g3 g2 ~ g2 f3 ~ g2 ~ g3 g2 d3 g2 b2 d3] [f2 f2 f3 f2 ~ f2 e3 ~ f2 ~ f3 f2 c3 f2 a2 c3] [e2 e2 e3 e2 ~ e2 d3 ~ e2 ~ e3 e2 b2 g#2 b2 d3]>")
      .s("sawtooth").decay(0.12).sustain(0.05).release(0.03).lpf(saw.range(320, 2400).slow(33)).lpq(12).gain(0.26)
    const sub = note("<a2 g2 f2 e2>").s("sine").decay(0.5).sustain(0.5).gain(0.22)
    const chords = "<[a3,c4,e4] [g3,b3,d4] [f3,a3,c4] [e3,g#3,b3]>"
    const stab = note(chords).add(note(12)).struct("x ~ ~ x ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~").s("sawtooth").attack(0.005).decay(0.16).sustain(0.1).release(0.08)
      .lpf(saw.range(1200, 2800).slow(33)).gain(0.055).room(0.3).pan(0.42)
    const pad = note(chords).s("sawtooth").attack(0.35).release(0.6).lpf(1000).gain(0.045).room(0.6)
    const tune = "<[a4@2 c5 e5 a5@2 g5 e5] [g5@2 f5 d5 b4@2 d5 g5] [f5@2 e5 c5 a4@2 c5 f5] [e5@3 g#5 b5@2 g#5 e5]>"
    const horn = note(tune).s("square").attack(0.01).decay(0.2).sustain(0.45).release(0.1).lpf(2300).vib(5).vibmod(0.12)
      .gain(0.065).delay(0.22).delaytime(0.341).delayfeedback(0.28).pan(0.56)
    const hornLow = note(tune).add(note(-12)).s("sawtooth").attack(0.02).decay(0.25).sustain(0.5).release(0.1).lpf(1300).gain(0.05)
    const arp = note("<[a4 c5 e5 c5]*4 [g4 b4 d5 b4]*4 [f4 a4 c5 a4]*4 [e4 g#4 b4 g#4]*4>")
      .s("triangle").decay(0.07).sustain(0).lpf(3600).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    const toms = note("<~ ~ ~ [~ ~ ~ ~ ~ ~ ~ ~ e3 e3 c3 c3 a2 a2 a2 a2]>").s("sine").decay(0.12).sustain(0).gain(0.4)
    const rumble = s("brown*4").decay(0.4).sustain(0).lpf(300).gain(0.08)
    const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5000).slow(9)).gain(saw.range(0, 0.05).slow(9))
  `,
  song: `arrange(
    [8, stack(kick, snare, hats, acid, sub, stab, rumble)],
    [8, stack(kick, snare, ghost, hats, shaker, acid, sub, stab, pad, toms)],
    [8, stack(kick, snare, ghost, hats, hat16, shaker, acid, sub, stab, pad, horn, toms)],
    [9, stack(kick2, snare, ghost, hat16, shaker, acid, sub, stab, pad, horn, hornLow, arp, toms, rumble, wash)]
  )`,
};

export default {
  id: 'temple',
  title: 'Temple Drop',
  emoji: '🏺',
  tagline: 'The spiked ceiling is coming down! Drop through holes, avoid spikes.',
  colors: { bg: '#2a170b', fg: '#fff2d6', accent: '#ffcf4a' },
  music,

  create({ rng, W, H }) {
    const floors = buildPlan(rng.fork('plan'));
    const art = rng.fork('art');

    // ---- art ----
    const wallTile = paintWallTile(art);
    const pillar = paintPillar(art);
    const slab = paintSlab(art);
    const spike = paintSpike();
    const ceiling = paintCeiling(art);
    const poses = [0, 1, 2, 3].map(paintExplorer);
    const helmet = paintHelmet();
    const flame = paintFlame();
    const torch = paintTorch();
    const glowFire = glowSprite('rgba(255,160,60,0.55)', 60);
    const glowRed = glowSprite('rgba(255,50,30,0.7)', 30);
    const glowGold = glowSprite('rgba(255,215,110,0.8)', 12);
    const vignette = vignetteSprite(W, H, 0.7, '16,6,2');
    const fx = createParticles();
    const motes = [];
    for (let i = 0; i < 26; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 14, ph: Math.random() * TAU, z: 0.4 + Math.random() * 0.6 });

    // ---- state ----
    let px = 180;
    let py = floors[0].y;
    let vx = 0;
    let vy = 0;
    let onFloor = floors[0];
    let cam = 0;
    let now = 0;
    let clock = 0;
    let face = 1;
    let runPhase = 0;
    let shake = 0;
    let dying = -1;
    let hat = null; // the helmet flying off on death
    let landFlash = 0;
    let depthBest = 0;

    const floorIndexBelow = (y) => {
      // first floor whose top is at or below y
      let lo = 0;
      let hi = floors.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (floors[mid].y < y) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const inGap = (f, x) => f.gaps.some((gp) => x - FOOT >= gp.l && x + FOOT <= gp.r);
    const onSpikes = (f, x, t) => {
      for (const s of f.spikes) if (x + BODY > s.l && x - BODY < s.r) return s;
      for (const tr of f.traps) if (trapState(tr, t) >= 1 && x + BODY > tr.l && x - BODY < tr.r) return tr;
      return null;
    };

    const die = (why) => {
      game.dead = true;
      game.deathReason = why;
      dying = 0;
      shake = 0.6;
      const sy = py - cam;
      fx.burst(px, sy - 16, { count: 40, speed: 240, life: 1, size: 5, gravity: 600, drag: 0.5, colors: ['#ffe58a', '#f4b832', '#d6332a', '#fff2d6', '#c98a5a'] });
      hat = { x: px, y: sy - 34, vx: (Math.random() - 0.5) * 160, vy: -260, rot: 0, vr: (Math.random() - 0.5) * 12 };
    };

    const updateCosmetic = (dt) => {
      clock += dt;
      shake = Math.max(0, shake - dt * 1.5);
      landFlash = Math.max(0, landFlash - dt * 3);
      fx.update(dt);
      for (const m of motes) {
        m.y -= m.v * dt;
        m.x += Math.sin(clock * 0.8 + m.ph) * 6 * dt;
        if (m.y < -10) {
          m.y = H + 10;
          m.x = Math.random() * W;
        }
      }
      if (hat) {
        hat.vy += 900 * dt;
        hat.x += hat.vx * dt;
        hat.y += hat.vy * dt;
        hat.rot += hat.vr * dt;
      }
    };

    const game = {
      dead: false,
      deathReason: '',
      // read by test bots only
      _debug: { floors, trapState, get px() { return px; }, get py() { return py; }, get cam() { return cam; }, get onFloor() { return onFloor; }, get vy() { return vy; } },

      update(dt, dir, t) {
        now = t;
        updateCosmetic(dt);

        // the ceiling grinds down
        cam += camSpeed(t) * dt;

        // running and steering (the same on the ground and in the air)
        const target = dir * RUN;
        vx += (target - vx) * Math.min(1, 18 * dt);
        if (dir) face = dir;
        let gx = vx;
        if (onFloor && onFloor.roll) gx += onFloor.roll;
        px = clamp(px + gx * dt, WALL_L + 8, WALL_R - 8);

        if (onFloor) {
          runPhase += Math.abs(vx) * dt * 0.06;
          if (Math.abs(vx) > 60 && Math.random() < dt * 14) {
            fx.burst(px - face * 6, py - cam - 1, { count: 1, speed: 30, life: 0.4, size: 3, round: true, angle: -Math.PI / 2 - face * 0.8, spread: 0.6, colors: ['rgba(230,190,120,0.7)'] });
          }
          if (inGap(onFloor, px)) {
            onFloor = null;
            vy = 0;
          } else {
            const hit = onSpikes(onFloor, px, t);
            if (hit) return die(hit.period ? 'A spike trap sprang up under you.' : 'Ran onto a bed of spikes.');
          }
        }
        if (!onFloor) {
          const y0 = py;
          vy = Math.min(FALL_MAX, vy + GRAV * dt);
          py += vy * dt;
          // landing on the first floor crossed whose stone is under the feet
          for (let i = floorIndexBelow(y0 + 0.001); i < floors.length && floors[i].y <= py; i++) {
            const f = floors[i];
            if (!inGap(f, px)) {
              py = f.y;
              onFloor = f;
              landFlash = Math.min(1, vy / 500);
              fx.burst(px, f.y - cam, { count: 10, speed: 70 + vy * 0.1, life: 0.5, size: 3.5, round: true, angle: -Math.PI / 2, spread: 2.6, gravity: 200, drag: 2, colors: ['rgba(240,205,140,0.8)', 'rgba(200,150,90,0.7)'] });
              vy = 0;
              const hit = onSpikes(f, px, t);
              if (hit) return die(hit.period ? 'Landed on a spike trap.' : 'Landed on a bed of spikes.');
              break;
            }
          }
        }

        // the view follows you down when you get low, so a long drop is always safe
        cam = Math.max(cam, py - FOLLOW);
        depthBest = Math.max(depthBest, py);
      
        // dust trickling from the ceiling
        if (Math.random() < dt * 9) fx.burst(20 + Math.random() * 320, CEIL_Y - 4, { count: 1, speed: 20, life: 1.2, size: 2, angle: Math.PI / 2, spread: 0.4, gravity: 160, colors: ['rgba(200,160,100,0.7)'] });

        if (py - HEAD < cam + CEIL_Y) return die('Caught by the spiked ceiling.');
      },

      afterlife(dt) {
        updateCosmetic(dt);
        if (dying >= 0) dying += dt;
      },

      render(g) {
        const t = now;
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

        // back wall, slower than the floors
        const off = (((cam * 0.55) % 300) + 300) % 300;
        for (let y = -off; y < H; y += 300) g.drawImage(wallTile.canvas, -2, y, W + 4, 300);
        // depth makes it darker
        g.fillStyle = `rgba(16,6,2,${Math.min(0.4, 0.1 + cam / 30000).toFixed(3)})`;
        g.fillRect(0, 0, W, H);

        // torches on the pillars
        const tsp = 260;
        const t0 = Math.floor((cam - 40) / tsp);
        const torches = [];
        for (let k = t0; k * tsp - cam < H + 40; k++) {
          const sx = k % 2 ? 40 : 320;
          torches.push([sx, k * tsp + 130 - cam, k]);
        }
        g.globalCompositeOperation = 'lighter';
        for (const [sx, sy, k] of torches) {
          const fl = 0.85 + 0.15 * Math.sin(clock * 11 + k * 1.7) + 0.08 * Math.sin(clock * 23 + k);
          drawSprite(g, glowFire, sx, sy - 12, { size: 190 * fl, alpha: 0.75 });
        }
        g.globalCompositeOperation = 'source-over';
        for (const [sx, sy, k] of torches) {
          drawSprite(g, torch, sx, sy);
          const fl = 1 + 0.12 * Math.sin(clock * 13 + k * 2.3);
          g.save();
          g.translate(sx, sy - 12);
          g.scale(fl * (1 + 0.06 * Math.sin(clock * 17 + k)), fl);
          g.drawImage(flame.canvas, -8, -19, 16, 26);
          g.restore();
        }

        // floating gold dust
        g.globalCompositeOperation = 'lighter';
        for (const m of motes) {
          g.globalAlpha = 0.25 + 0.25 * Math.sin(clock * 2 + m.ph);
          g.fillStyle = '#ffd890';
          g.fillRect(m.x, m.y, 1.6 * m.z, 1.6 * m.z);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';

        // floors
        const i0 = floorIndexBelow(cam - 40);
        for (let i = i0; i < floors.length && floors[i].y - cam < H + 30; i++) drawFloor(g, floors[i], floors[i].y - cam, t);

        // where you'll land while falling
        if (!onFloor && !game.dead) {
          const fi = floorIndexBelow(py + 0.001);
          for (let i = fi; i < floors.length && floors[i].y - cam < H + 10; i++) {
            const f = floors[i];
            if (inGap(f, px)) continue;
            const bad = onSpikes(f, px, t + Math.sqrt(Math.max(0, 2 * (f.y - py) / GRAV)));
            const sy = f.y - cam;
            g.fillStyle = bad ? 'rgba(255,60,40,0.85)' : 'rgba(255,240,190,0.6)';
            g.beginPath();
            g.ellipse(px, sy + 1, 10, 3, 0, 0, TAU);
            g.fill();
            if (bad) {
              g.strokeStyle = 'rgba(255,80,60,0.9)';
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(px - 5, sy - 22);
              g.lineTo(px + 5, sy - 12);
              g.moveTo(px + 5, sy - 22);
              g.lineTo(px - 5, sy - 12);
              g.stroke();
            }
            break;
          }
        }

        // the explorer
        const sy = py - cam;
        if (dying < 0 || dying < 0.15) {
          let pose = 0;
          if (!onFloor) pose = 3;
          else if (Math.abs(vx) > 40) pose = 1 + (Math.floor(runPhase) % 2);
          g.fillStyle = 'rgba(20,8,2,0.4)';
          if (onFloor) {
            g.beginPath();
            g.ellipse(px, sy + 1, 9, 2.5, 0, 0, TAU);
            g.fill();
          }
          g.save();
          g.translate(px, sy);
          if (face < 0) g.scale(-1, 1);
          if (onFloor && landFlash > 0) g.scale(1 + landFlash * 0.12, 1 - landFlash * 0.12);
          g.drawImage(poses[pose].canvas, -17, -45.3, 34, 45.3);
          g.restore();
        }

        // danger: the ceiling is close
        const gapToCeil = sy - HEAD - CEIL_Y;
        if (!game.dead && gapToCeil < 110) {
          const a = 1 - gapToCeil / 110;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, px, CEIL_Y - 6, { size: 160, alpha: a * (0.6 + 0.4 * Math.sin(clock * 16)) });
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = `rgba(255,${a > 0.5 ? 70 : 210},60,${(0.5 + a * 0.5).toFixed(2)})`;
          g.font = '900 20px "Arial Black", Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(40,10,0,0.8)';
          g.strokeText('!', px, sy - HEAD - 14 + Math.sin(clock * 20) * 1.5);
          g.fillText('!', px, sy - HEAD - 14 + Math.sin(clock * 20) * 1.5);
        }

        fx.render(g);

        if (hat) {
          drawSprite(g, helmet, hat.x, hat.y, { rot: hat.rot, size: 22 });
        }

        // the side pillars
        const poff = ((cam % 200) + 200) % 200;
        for (let y = -poff; y < H; y += 200) {
          g.drawImage(pillar.canvas, 0, y, 26, 200);
          g.drawImage(pillar.canvas, W - 26, y, 26, 200);
        }
        for (const [sx, sy2] of torches) {
          // torch light on the pillar faces
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowFire, sx < 180 ? 14 : W - 14, sy2 - 10, { size: 70, alpha: 0.45 });
          g.globalCompositeOperation = 'source-over';
        }

        // the spiked ceiling
        const quake = Math.sin(clock * 40) * 0.8;
        g.drawImage(ceiling.canvas, 0, quake, W, CEIL_Y + 4);
        const cg = g.createLinearGradient(0, CEIL_Y - 4, 0, CEIL_Y + 30);
        cg.addColorStop(0, 'rgba(20,8,2,0.45)');
        cg.addColorStop(1, 'rgba(20,8,2,0)');
        g.fillStyle = cg;
        g.fillRect(0, CEIL_Y - 4 + quake, W, 34);

        // how deep we've got
        g.font = '700 11px system-ui, sans-serif';
        g.textAlign = 'right';
        g.textBaseline = 'alphabetic';
        g.fillStyle = 'rgba(255,230,180,0.7)';
        g.fillText(`${Math.max(0, Math.round((depthBest - floors[0].y) / 40))} m deep`, W - 32, H - 12);

        g.restore();
        g.drawImage(vignette.canvas, 0, 0, W, H);
      },
    };

    function drawFloor(g, f, sy, t) {
      // stone between the holes
      for (const [a, b] of f.solid) {
        if (b - a < 0.5) continue;
        g.drawImage(slab.canvas, a * 2, 0, (b - a) * 2, (SLAB + 6) * 2, a, sy, b - a, SLAB + 6);
        // broken edges at the holes
        g.fillStyle = 'rgba(60,28,8,0.75)';
        if (a > 1) g.fillRect(a, sy, 2, SLAB);
        if (b < 359) g.fillRect(b - 2, sy, 2, SLAB);
        g.fillStyle = 'rgba(255,230,170,0.5)';
        if (a > 1) g.fillRect(a + 2, sy, 1, SLAB - 4);
      }
      // holes: a dark lip so they read as openings
      for (const gp of f.gaps) {
        g.fillStyle = 'rgba(10,4,0,0.35)';
        g.fillRect(gp.l, sy + SLAB, gp.r - gp.l, 3);
      }
      // rolling logs
      if (f.roll) {
        const dirn = Math.sign(f.roll);
        const rot = (t * f.roll) / 6;
        for (const [a, b] of f.solid) {
          for (let x = Math.ceil(a / 14) * 14 + 7; x < b - 5; x += 14) {
            g.fillStyle = '#7a4a22';
            g.beginPath();
            g.arc(x, sy - 1, 6.5, 0, TAU);
            g.fill();
            g.fillStyle = '#b07a42';
            g.beginPath();
            g.arc(x, sy - 1, 4.5, 0, TAU);
            g.fill();
            g.strokeStyle = '#5a3416';
            g.lineWidth = 1.4;
            g.beginPath();
            g.moveTo(x + Math.cos(rot) * 4.5, sy - 1 + Math.sin(rot) * 4.5);
            g.lineTo(x - Math.cos(rot) * 4.5, sy - 1 - Math.sin(rot) * 4.5);
            g.stroke();
          }
          // chevrons on the slab face
          g.fillStyle = 'rgba(255,225,140,0.55)';
          for (let x = a + 12; x < b - 12; x += 30) {
            const cx = x;
            g.beginPath();
            g.moveTo(cx - dirn * 4, sy + 9);
            g.lineTo(cx + dirn * 3, sy + 13);
            g.lineTo(cx - dirn * 4, sy + 17);
            g.closePath();
            g.fill();
          }
        }
      }
      // spike beds
      for (const s of f.spikes) {
        g.globalCompositeOperation = 'lighter';
        const mid = (s.l + s.r) / 2;
        drawSprite(g, glowRed, mid, sy - 4, { size: Math.max(40, (s.r - s.l) * 1.2), alpha: 0.35 + 0.1 * Math.sin(clock * 4 + s.l) });
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#5a3008';
        g.fillRect(s.l, sy - 2, s.r - s.l, 3);
        for (let x = s.l + 4; x <= s.r - 3; x += 8) g.drawImage(spike.canvas, x - 5, sy - SPIKE_H - 1, 10, SPIKE_H + 2);
      }
      // spring traps
      for (const tr of f.traps) {
        const st = trapState(tr, t);
        const mid = (tr.l + tr.r) / 2;
        if (st > 0) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, glowRed, mid, sy - 2, { size: 70, alpha: st >= 1 ? 0.7 : 0.25 + 0.5 * Math.abs(Math.sin(clock * 18)) });
          g.globalCompositeOperation = 'source-over';
        }
        const rise = st >= 1 ? 1 : st > 0 ? 0.22 : 0;
        if (rise > 0) {
          g.save();
          g.beginPath();
          g.rect(tr.l - 2, sy - SPIKE_H - 2, tr.r - tr.l + 4, SPIKE_H + 2);
          g.clip();
          for (let x = tr.l + 4; x <= tr.r - 3; x += 7) g.drawImage(spike.canvas, x - 5, sy - SPIKE_H * rise - 1, 10, SPIKE_H + 2);
          g.restore();
        }
        // bronze plate with holes
        const pg = g.createLinearGradient(0, sy - 3, 0, sy + 3);
        pg.addColorStop(0, '#e0a24a');
        pg.addColorStop(1, '#7a4a14');
        g.fillStyle = pg;
        g.fillRect(tr.l, sy - 2.5, tr.r - tr.l, 5);
        g.fillStyle = st > 0 ? '#ff5a3a' : '#2a1404';
        for (let x = tr.l + 4; x <= tr.r - 3; x += 7) g.fillRect(x - 1, sy - 1.5, 2, 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, glowGold, tr.l + 2, sy, { size: 10, alpha: 0.6 });
        drawSprite(g, glowGold, tr.r - 2, sy, { size: 10, alpha: 0.6 });
        g.globalCompositeOperation = 'source-over';
      }
    }

    return game;
  },
};
