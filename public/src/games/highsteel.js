// High Steel — an ironworker on a steel girder that hangs from a crane cable, high above a 1930s
// city. The girder swings on its slings like a set of scales, and you are the counterweight: cranes
// lower loads onto it and hook them off again, and you walk the beam to keep it level. Walk uphill
// and it comes back. Tip it too far and you slide off; stand under a load as it comes down and
// you're flattened. Later on, gusts of wind lean on one end of the beam.

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

const PX = 180; // the girder's centre, where it hangs from the crane
const PY = 516;
const HALF = 156; // half the girder's length
const BEAM_T = 16;
const TOP = -BEAM_T / 2; // the girder's top surface, in its own frame
const MP = 4; // the worker weighs as much as an iron safe
const K = 520; // moment that holds the girder at one radian of tilt (the slings pulling it back)
const W0 = 1.7; // how fast it swings
const ZETA = 0.45; // and how quickly the swing dies down
const SLIP = 0.28; // past this, loads start sliding downhill
const TIP = 0.5; // past this (about 29°) you lose your footing
const WALK = 190;
const EDGE = HALF - 10; // furthest you can walk out
const LIMIT = 110; // the planner keeps the balance point within this of the centre
const JIB_Y = 72; // the crane jib across the top of the sky
const HEAD = 46; // the worker's height above the steel
const BODY = 8; // half the worker's width

const descAt = (p) => lerp(2.7, 1.65, p); // how long a hook takes to come down

const KINDS = [
  { m: 1, key: 'toolbox', the: 'a toolbox', w: 26, h: 17 },
  { m: 1, key: 'keg', the: 'a keg of rivets', w: 20, h: 23 },
  { m: 2, key: 'crate', the: 'a crate', w: 30, h: 28 },
  { m: 2, key: 'sacks', the: 'a stack of cement sacks', w: 36, h: 22 },
  { m: 3, key: 'bricks', the: 'a pallet of bricks', w: 38, h: 28 },
  { m: 3, key: 'drums', the: 'two steel drums', w: 38, h: 30 },
  { m: 4, key: 'safe', the: 'an iron safe', w: 34, h: 38 },
  { m: 4, key: 'girders', the: 'a bundle of girders', w: 52, h: 21 },
];

// ---------- the plan: every delivery, pick-up and gust, fixed before the run starts ----------

function makePlan(r) {
  const drops = [];
  const lifts = [];
  const sim = [];
  let uid = 0;
  const mom = () => sim.reduce((a, l) => a + l.m * l.s, 0);
  let t = 3.6;
  while (t < 58.6) {
    const p = progress(t, 60, 1.2);
    const bal0 = -mom() / MP;
    const maxLoads = Math.round(lerp(3, 6, p));
    let done = false;
    if (t > 8.5 && sim.length >= 2 && (sim.length >= maxLoads || r.chance(lerp(0.3, 0.45, p)))) {
      let best = null;
      let bestShift = -1;
      for (const l of sim) {
        if (t - l.t < 2.4) continue;
        const nb = -(mom() - l.m * l.s) / MP;
        if (Math.abs(nb) > LIMIT) continue;
        const shift = Math.abs(nb - bal0) + r.range(0, 30);
        if (shift > bestShift) {
          best = l;
          bestShift = shift;
        }
      }
      if (best) {
        lifts.push({ t, id: best.id, p });
        sim.splice(sim.indexOf(best), 1);
        done = true;
      }
    }
    if (!done) {
      const pool = p < 0.1 ? [1, 1, 2] : p < 0.3 ? [1, 2, 2, 3] : p < 0.6 ? [2, 2, 3, 3, 4] : [2, 3, 3, 4, 4];
      const m = r.pick(pool);
      const kind = r.pick(KINDS.filter((k) => k.m === m));
      const want = lerp(25, 58, p);
      let best = null;
      let bestShift = -1;
      for (let i = 0; i < 40; i++) {
        const s = r.range(-HALF + kind.w / 2 + 6, HALF - kind.w / 2 - 6);
        if (sim.some((o) => Math.abs(o.s - s) < (o.w + kind.w) / 2 + 6)) continue;
        if (Math.abs(s - bal0) < kind.w / 2 + 40) continue; // never right where you should be standing
        const nb = -(mom() + m * s) / MP;
        if (Math.abs(nb) > LIMIT) continue;
        const shift = Math.abs(nb - bal0);
        if (shift > want + 22) continue; // never a lurch you can't walk in time
        if (shift >= want) {
          best = s;
          break;
        }
        if (shift > bestShift) {
          best = s;
          bestShift = shift;
        }
      }
      if (best !== null) {
        const l = { id: uid++, t, s: best, m, w: kind.w, kind, p };
        sim.push(l);
        drops.push(l);
        done = true;
      }
    }
    t += done ? r.range(0.85, 1.15) * lerp(2.5, 1.0, p) : 0.4;
  }
  const gusts = [];
  for (let g = 25 + r.range(0, 3); g < 56; g += r.range(5, 7.5)) {
    gusts.push({ t: g, dir: r.chance(0.5) ? 1 : -1, mag: lerp(70, 120, progress(g, 60, 1)), dur: r.range(2, 3) });
  }
  return { drops, lifts, gusts };
}

// ---------- art ----------

function cloudSprite(r, w, h, tint) {
  return makeSprite(w, h, (g) => {
    const blobs = [];
    for (let i = 0; i < 14; i++) {
      const x = r.range(-w * 0.36, w * 0.36);
      const rr = r.range(h * 0.18, h * 0.36) * (1 - Math.abs(x) / w);
      blobs.push([x, r.range(-h * 0.08, h * 0.12) - rr * 0.3, rr + h * 0.08]);
    }
    for (const [x, y, rr] of blobs) {
      g.fillStyle = `rgba(${tint.shade},0.55)`;
      g.beginPath();
      g.arc(x, y + rr * 0.25, rr, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y, rr] of blobs) {
      const cg = g.createRadialGradient(x - rr * 0.3, y - rr * 0.4, rr * 0.1, x, y, rr);
      cg.addColorStop(0, `rgba(${tint.lit},1)`);
      cg.addColorStop(1, `rgba(${tint.mid},0.9)`);
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, rr * 0.92, 0, Math.PI * 2);
      g.fill();
    }
  }, 1.5);
}

function paintSky(W, H, r) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const HZ = 392; // the horizon, far below and away
    const sky = g.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, '#4f9db6');
    sky.addColorStop(0.45, '#8cc6cf');
    sky.addColorStop(0.85, '#e9e2c4');
    sky.addColorStop(1, '#f6dcb0');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, HZ);
    // the sun, low and warm
    const sun = g.createRadialGradient(286, 236, 0, 286, 236, 170);
    sun.addColorStop(0, 'rgba(255,248,220,1)');
    sun.addColorStop(0.08, 'rgba(255,240,200,0.95)');
    sun.addColorStop(0.3, 'rgba(255,214,160,0.35)');
    sun.addColorStop(1, 'rgba(255,214,160,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // faint high streaks of cirrus
    for (let i = 0; i < 9; i++) {
      const y = r.range(30, 220);
      const x = r.range(-60, W);
      const l = r.range(80, 200);
      const cg = g.createLinearGradient(x, 0, x + l, 0);
      cg.addColorStop(0, 'rgba(255,255,255,0)');
      cg.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.fillRect(x, y, l, r.range(1.5, 4));
    }
    // distant hills on the horizon
    for (const [col, amp, off] of [
      ['rgba(140,170,180,0.7)', 14, 0],
      ['rgba(120,150,160,0.8)', 9, 6],
    ]) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, HZ + 4);
      for (let x = 0; x <= W; x += 10) g.lineTo(x, HZ - off - amp * (0.5 + 0.5 * Math.sin(x * 0.021 + off) * Math.sin(x * 0.007 + 1)));
      g.lineTo(W, HZ + 4);
      g.closePath();
      g.fill();
    }
    // the city far below: hazy streets and rooftops, a river winding through
    const ground = g.createLinearGradient(0, HZ, 0, H);
    ground.addColorStop(0, '#b9c3b8');
    ground.addColorStop(0.4, '#a3a596');
    ground.addColorStop(1, '#8a8573');
    g.fillStyle = ground;
    g.fillRect(0, HZ, W, H - HZ);
    for (let row = 0; row < 40; row++) {
      const y = HZ + 3 + Math.pow(row / 40, 1.6) * (H - HZ);
      const k = (y - HZ) / (H - HZ);
      const bh = lerp(1.5, 9, k);
      for (let x = r.range(-10, 0); x < W; x += lerp(4, 18, k) * r.range(0.7, 1.4)) {
        const bw = lerp(3, 14, k) * r.range(0.6, 1.2);
        const c = r.pick(['164,120,96', '188,170,140', '130,126,120', '200,190,170', '150,104,82']);
        g.fillStyle = `rgba(${c},${lerp(0.25, 0.75, k)})`;
        g.fillRect(x, y, bw, bh);
        g.fillStyle = `rgba(255,240,210,${lerp(0.1, 0.35, k)})`;
        g.fillRect(x, y, bw, Math.max(1, bh * 0.2));
      }
    }
    g.strokeStyle = 'rgba(150,200,205,0.85)';
    g.lineCap = 'round';
    g.beginPath();
    for (let y = HZ; y <= H; y += 6) {
      const k = (y - HZ) / (H - HZ);
      const x = 70 + Math.sin(k * 5.5) * 60 + k * 120;
      g.lineWidth = lerp(2, 26, k);
      if (y === HZ) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    // haze sitting over the city
    const haze = g.createLinearGradient(0, HZ - 30, 0, H);
    haze.addColorStop(0, 'rgba(246,226,190,0.85)');
    haze.addColorStop(0.35, 'rgba(230,220,200,0.35)');
    haze.addColorStop(1, 'rgba(210,205,190,0.15)');
    g.fillStyle = haze;
    g.fillRect(0, HZ - 30, W, H - HZ + 30);

    // Art Deco towers rising up out of the haze around you
    const tower = (cx, topY, w, steps, spire, lit) => {
      let y = topY;
      let ww = w * 0.32;
      const levels = [];
      for (let i = 0; i < steps; i++) {
        levels.push([ww, y]);
        y += 34 + i * 6;
        ww = w * (0.32 + (0.68 * (i + 1)) / steps);
      }
      const shadeCol = lit ? 'rgba(150,120,110,1)' : 'rgba(120,112,120,1)';
      for (let i = levels.length - 1; i >= 0; i--) {
        const [lw, ly] = levels[i];
        const bottom = H + 10;
        const bg = g.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
        bg.addColorStop(0, lit ? '#e8d3b4' : '#b9aea8');
        bg.addColorStop(0.55, lit ? '#d9bf9c' : '#a69a96');
        bg.addColorStop(0.56, shadeCol);
        bg.addColorStop(1, lit ? '#a88e7d' : '#8f8690');
        g.fillStyle = bg;
        g.fillRect(cx - lw / 2, ly, lw, bottom - ly);
        // windows in vertical bands
        for (let x = cx - lw / 2 + 3; x < cx + lw / 2 - 3; x += 5) {
          g.fillStyle = 'rgba(70,70,90,0.35)';
          g.fillRect(x, ly + 6, 2.2, bottom - ly);
        }
        for (let wy = ly + 8; wy < bottom; wy += 7) {
          g.fillStyle = 'rgba(255,240,215,0.25)';
          g.fillRect(cx - lw / 2, wy, lw, 1);
        }
        // a gold cornice at each setback
        g.fillStyle = 'rgba(214,170,90,0.9)';
        g.fillRect(cx - lw / 2 - 1, ly, lw + 2, 2.5);
      }
      if (spire) {
        const [lw, ly] = levels[0];
        // stacked sunburst arches, like the famous crown
        for (let i = 0; i < 4; i++) {
          const rw = lw / 2 - i * 4;
          const yy = ly - i * 13;
          g.fillStyle = i % 2 ? '#cfd8dc' : '#e7edf0';
          g.beginPath();
          g.moveTo(cx - rw, yy + 2);
          g.arc(cx, yy + 2, rw, Math.PI, 0);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(60,70,90,0.5)';
          g.lineWidth = 0.8;
          for (let k = 0; k < 5; k++) {
            g.beginPath();
            g.arc(cx - rw + (k + 0.5) * (rw * 2) / 5, yy + 2, 1.6, Math.PI, 0);
            g.stroke();
          }
        }
        g.fillStyle = '#eef3f5';
        g.beginPath();
        g.moveTo(cx - 4, ly - 50);
        g.lineTo(cx, ly - 110);
        g.lineTo(cx + 4, ly - 50);
        g.closePath();
        g.fill();
      } else {
        const [lw, ly] = levels[0];
        g.fillStyle = '#c9c2bc';
        g.fillRect(cx - lw * 0.3, ly - 26, lw * 0.6, 26);
        g.fillStyle = '#9f9690';
        g.fillRect(cx - 2, ly - 74, 4, 50);
        g.fillStyle = '#e04a3a';
        g.beginPath();
        g.arc(cx, ly - 76, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    };
    g.globalAlpha = 0.55;
    tower(318, 360, 66, 4, false, false);
    g.globalAlpha = 0.75;
    tower(46, 300, 80, 5, true, true);
    g.globalAlpha = 1;
  }, 2);
}

function paintJib(W) {
  // a yellow tower-crane jib running across the top of the sky
  return makeSprite(W + 20, 30, (g) => {
    g.translate(-(W + 20) / 2, -15);
    const yT = 5;
    const yB = 23;
    g.strokeStyle = '#7a5a10';
    g.lineWidth = 2;
    for (let x = 0; x < W + 20; x += 14) {
      g.beginPath();
      g.moveTo(x, yB);
      g.lineTo(x + 7, yT);
      g.lineTo(x + 14, yB);
      g.stroke();
    }
    for (const [y, h] of [
      [yT - 2, 4],
      [yB - 2, 5],
    ]) {
      const cg = g.createLinearGradient(0, y, 0, y + h);
      cg.addColorStop(0, '#ffe07a');
      cg.addColorStop(0.5, '#f0b42a');
      cg.addColorStop(1, '#a8720c');
      g.fillStyle = cg;
      g.fillRect(0, y, W + 20, h);
    }
    // rail the trolleys run on
    g.fillStyle = '#3d3a36';
    g.fillRect(0, yB + 3, W + 20, 2);
  });
}

function paintBeam() {
  const L = HALF * 2 + 6;
  return makeSprite(L, BEAM_T + 2, (g) => {
    const x0 = -L / 2;
    const t = -BEAM_T / 2;
    // web
    const web = g.createLinearGradient(0, t, 0, -t);
    web.addColorStop(0, '#9c3a24');
    web.addColorStop(0.5, '#b8492c');
    web.addColorStop(1, '#7a2a1a');
    g.fillStyle = web;
    g.fillRect(x0, t + 3, L, BEAM_T - 6);
    // flanges
    for (const [y, top] of [
      [t, true],
      [-t - 3.5, false],
    ]) {
      const fg = g.createLinearGradient(0, y, 0, y + 3.5);
      fg.addColorStop(0, top ? '#f08e62' : '#a8432a');
      fg.addColorStop(1, top ? '#b34a2c' : '#5e1f12');
      g.fillStyle = fg;
      g.fillRect(x0, y, L, 3.5);
    }
    // rivets and holes along the web
    for (let x = x0 + 6; x < -x0 - 4; x += 9) {
      for (const y of [-2.2, 2.2]) {
        g.fillStyle = '#5a1c10';
        g.beginPath();
        g.arc(x, y, 1.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,190,150,0.6)';
        g.beginPath();
        g.arc(x - 0.4, y - 0.4, 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    // rust streaks and scuffs
    for (let i = 0; i < 26; i++) {
      const x = x0 + ((i * 53) % L);
      g.fillStyle = i % 3 ? 'rgba(80,25,10,0.25)' : 'rgba(255,200,160,0.18)';
      g.fillRect(x, t + 3, 1 + (i % 4), BEAM_T - 6);
    }
    // end plates
    for (const ex of [x0, -x0 - 3]) {
      g.fillStyle = '#6a2416';
      g.fillRect(ex, t, 3, BEAM_T);
    }
    // stencilled number
    g.fillStyle = 'rgba(255,240,220,0.55)';
    g.font = 'bold 7px sans-serif';
    g.fillText('No. 27', x0 + 22, 2.6);
    g.fillText('No. 27', -x0 - 50, 2.6);
  });
}

function paintHook() {
  return makeSprite(22, 36, (g) => {
    // pulley block with hazard stripes
    g.fillStyle = '#2b2a28';
    g.fillRect(-8, -18, 16, 15);
    g.save();
    g.beginPath();
    g.rect(-7, -17, 14, 13);
    g.clip();
    for (let i = -3; i < 4; i++) {
      g.fillStyle = i % 2 ? '#f2c230' : '#2b2a28';
      g.beginPath();
      g.moveTo(-8 + i * 6, -17);
      g.lineTo(-2 + i * 6, -17);
      g.lineTo(-8 + i * 6 + 13, -4);
      g.lineTo(-14 + i * 6 + 13, -4);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-7, -17, 14, 2);
    // the hook
    g.strokeStyle = '#8f969c';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -3);
    g.lineTo(0, 6);
    g.arc(-4, 8, 4, 0, Math.PI * 0.95);
    g.stroke();
    g.strokeStyle = '#d7dde2';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-0.8, -3);
    g.lineTo(-0.8, 6);
    g.stroke();
  });
}

function badge(g, x, y, m) {
  g.fillStyle = '#1e1c1a';
  g.beginPath();
  g.roundRect ? g.roundRect(x - 6, y - 5.5, 12, 11, 2.5) : g.rect(x - 6, y - 5.5, 12, 11);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.roundRect ? g.roundRect(x - 5, y - 4.5, 10, 9, 2) : g.rect(x - 5, y - 4.5, 10, 9);
  g.fill();
  g.fillStyle = '#1e1c1a';
  g.font = 'bold 8px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(m), x, y + 0.5);
}

function paintLoad(kind) {
  const { w, h, m, key } = kind;
  return makeSprite(w + 4, h + 4, (g) => {
    const x0 = -w / 2;
    const y0 = -h / 2;
    if (key === 'toolbox') {
      g.strokeStyle = '#333';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-6, y0 + 4);
      g.lineTo(-6, y0);
      g.lineTo(6, y0);
      g.lineTo(6, y0 + 4);
      g.stroke();
      const bg = g.createLinearGradient(0, y0 + 4, 0, -y0);
      bg.addColorStop(0, '#e2524a');
      bg.addColorStop(1, '#8e231e');
      g.fillStyle = bg;
      g.fillRect(x0, y0 + 4, w, h - 4);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x0, y0 + 8, w, 1.5);
      g.fillStyle = '#c9ced2';
      g.fillRect(-2, y0 + 7, 4, 4);
      badge(g, x0 + 8, 3, m);
    } else if (key === 'keg') {
      const bg = g.createLinearGradient(x0, 0, -x0, 0);
      bg.addColorStop(0, '#6a3d1c');
      bg.addColorStop(0.4, '#c98a4a');
      bg.addColorStop(1, '#5a3014');
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(x0 + 2, y0);
      g.quadraticCurveTo(x0 - 2, 0, x0 + 2, -y0);
      g.lineTo(-x0 - 2, -y0);
      g.quadraticCurveTo(-x0 + 2, 0, -x0 - 2, y0);
      g.closePath();
      g.fill();
      g.strokeStyle = '#3a3634';
      g.lineWidth = 1.6;
      for (const y of [y0 + 4, -y0 - 4]) {
        g.beginPath();
        g.moveTo(x0 + 0.5, y);
        g.lineTo(-x0 - 0.5, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(60,30,10,0.5)';
      g.lineWidth = 0.7;
      for (let x = x0 + 5; x < -x0 - 2; x += 4) {
        g.beginPath();
        g.moveTo(x, y0 + 1);
        g.lineTo(x, -y0 - 1);
        g.stroke();
      }
      badge(g, 0, 0, m);
    } else if (key === 'crate') {
      g.fillStyle = '#7a4e22';
      g.fillRect(x0, y0, w, h);
      const bg = g.createLinearGradient(0, y0, 0, -y0);
      bg.addColorStop(0, '#e2b06e');
      bg.addColorStop(1, '#a8743a');
      g.fillStyle = bg;
      g.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
      g.strokeStyle = 'rgba(110,70,30,0.6)';
      g.lineWidth = 0.8;
      for (let y = y0 + 7; y < -y0; y += 6) {
        g.beginPath();
        g.moveTo(x0 + 2, y);
        g.lineTo(-x0 - 2, y);
        g.stroke();
      }
      g.strokeStyle = '#7a4e22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0 + 3, -y0 - 3);
      g.lineTo(-x0 - 3, y0 + 3);
      g.stroke();
      g.fillStyle = 'rgba(40,30,20,0.55)';
      g.font = 'bold 5px sans-serif';
      g.textAlign = 'center';
      g.fillText('THIS SIDE UP', 0, y0 + 7);
      badge(g, 7, 6, m);
    } else if (key === 'sacks') {
      const sack = (x, y, sw, sh) => {
        const sg = g.createLinearGradient(0, y - sh / 2, 0, y + sh / 2);
        sg.addColorStop(0, '#f1e8d6');
        sg.addColorStop(1, '#b9ab90');
        g.fillStyle = sg;
        g.beginPath();
        g.ellipse(x, y, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(120,100,70,0.6)';
        g.lineWidth = 0.7;
        g.stroke();
        g.fillStyle = 'rgba(60,90,140,0.7)';
        g.fillRect(x - 3, y - 1, 6, 2);
      };
      sack(-9, 5.5, 18, 11);
      sack(9, 5.5, 18, 11);
      sack(0, -5, 20, 11);
      badge(g, 0, 5, m);
    } else if (key === 'bricks') {
      g.fillStyle = '#9a7040';
      g.fillRect(x0, -y0 - 5, w, 5);
      g.fillStyle = '#5a3e1e';
      for (const x of [x0 + 3, -2, -x0 - 7]) g.fillRect(x, -y0 - 4, 4, 3);
      for (let row = 0; row < 4; row++) {
        const y = y0 + row * 5.6;
        for (let k = 0; k < 6; k++) {
          const off = row % 2 ? 3.2 : 0;
          const x = x0 + k * 6.4 - off;
          if (x < x0 - 1 || x + 6 > -x0 + 1) continue;
          g.fillStyle = (row + k) % 3 ? '#b8452c' : '#9c3622';
          g.fillRect(x + 0.4, y + 0.4, 5.6, 4.8);
          g.fillStyle = 'rgba(255,190,150,0.35)';
          g.fillRect(x + 0.4, y + 0.4, 5.6, 1);
        }
      }
      g.fillStyle = 'rgba(230,220,200,0.6)';
      g.fillRect(x0, y0 + 10.5, w, 0.8);
      badge(g, 0, -1, m);
    } else if (key === 'drums') {
      for (const cx of [-9.5, 9.5]) {
        const dg = g.createLinearGradient(cx - 9, 0, cx + 9, 0);
        dg.addColorStop(0, '#1f4f7a');
        dg.addColorStop(0.35, '#5f9ccc');
        dg.addColorStop(1, '#173a5c');
        g.fillStyle = dg;
        g.fillRect(cx - 9, y0, 18, h);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        for (const y of [y0 + h * 0.33, y0 + h * 0.66]) g.fillRect(cx - 9, y, 18, 1.5);
        g.fillStyle = '#123050';
        g.fillRect(cx - 9.5, y0, 19, 2);
        g.fillRect(cx - 9.5, -y0 - 2, 19, 2);
      }
      badge(g, 0, 0, m);
    } else if (key === 'safe') {
      const sg = g.createLinearGradient(x0, y0, -x0, -y0);
      sg.addColorStop(0, '#3f6b55');
      sg.addColorStop(1, '#1d3a2c');
      g.fillStyle = '#132a20';
      g.fillRect(x0, y0, w, h);
      g.fillStyle = sg;
      g.fillRect(x0 + 2, y0 + 2, w - 4, h - 6);
      g.strokeStyle = '#d4a94a';
      g.lineWidth = 1;
      g.strokeRect(x0 + 5, y0 + 5, w - 10, h - 13);
      g.fillStyle = '#c9ccc4';
      g.beginPath();
      g.arc(-4, -2, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a5e58';
      g.beginPath();
      g.arc(-4, -2, 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d4a94a';
      g.fillRect(6, -6, 2, 9);
      g.fillStyle = '#111';
      g.fillRect(x0 + 3, -y0 - 4, 5, 4);
      g.fillRect(-x0 - 8, -y0 - 4, 5, 4);
      badge(g, 8, y0 + 10, m);
    } else {
      // a strapped bundle of short girders, ends on
      for (let row = 0; row < 3; row++) {
        const y = y0 + row * 7;
        const bg = g.createLinearGradient(0, y, 0, y + 7);
        bg.addColorStop(0, '#d9643f');
        bg.addColorStop(1, '#7c2a18');
        g.fillStyle = bg;
        g.fillRect(x0, y, w, 6.6);
        g.fillStyle = '#5a1c10';
        g.fillRect(x0, y + 3, w, 0.8);
      }
      g.fillStyle = '#2b2a28';
      for (const x of [x0 + 9, -x0 - 12]) g.fillRect(x, y0 - 0.5, 3, h + 1);
      badge(g, 0, 0, m);
    }
  });
}

function paintWorker(phase, moving) {
  // feet at y = 25, facing right
  return makeSprite(32, 54, (g) => {
    const legA = moving ? Math.sin(phase) * 0.55 : 0;
    const armA = moving ? -Math.sin(phase) * 0.6 : 0.1;
    const bob = moving ? Math.abs(Math.cos(phase)) * 1.2 : 0;
    const hip = 6 - bob;
    const leg = (a, col) => {
      g.save();
      g.translate(0, hip);
      g.rotate(a);
      g.fillStyle = col;
      g.fillRect(-2.6, 0, 5.2, 16);
      g.fillStyle = '#2a1f18';
      g.beginPath();
      g.ellipse(1.6, 17.5, 4.4, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    leg(-legA, '#2d3442');
    // back arm
    const arm = (a, front) => {
      g.save();
      g.translate(0, -9 - bob);
      g.rotate(a);
      g.fillStyle = front ? '#f4efe4' : '#d8d2c4';
      g.fillRect(-2.2, 0, 4.4, 9);
      g.fillStyle = '#d9a07a';
      g.fillRect(-1.8, 9, 3.6, 5);
      g.restore();
    };
    arm(-armA, false);
    leg(legA, '#3a4356');
    // torso: white shirt, braces, belt
    const shirt = g.createLinearGradient(-6, 0, 6, 0);
    shirt.addColorStop(0, '#d6d0c2');
    shirt.addColorStop(0.5, '#fbf7ee');
    shirt.addColorStop(1, '#cfc8b8');
    g.fillStyle = shirt;
    g.beginPath();
    g.moveTo(-5.5, -10 - bob);
    g.lineTo(5.5, -10 - bob);
    g.lineTo(5, hip + 1);
    g.lineTo(-5, hip + 1);
    g.closePath();
    g.fill();
    g.fillStyle = '#7a2a22';
    g.fillRect(-3.5, -10 - bob, 1.6, hip + 10 + bob);
    g.fillRect(2, -10 - bob, 1.6, hip + 10 + bob);
    g.fillStyle = '#3a2a1e';
    g.fillRect(-5.2, hip - 1, 10.4, 2.2);
    g.fillStyle = '#c9a24a';
    g.fillRect(-1, hip - 1, 2, 2.2);
    // head
    g.fillStyle = '#d9a07a';
    g.fillRect(-1.6, -13 - bob, 3.2, 3);
    const face = g.createRadialGradient(1, -18 - bob, 0.5, 0, -17 - bob, 6);
    face.addColorStop(0, '#f2c39e');
    face.addColorStop(1, '#c98a62');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0.5, -17.5 - bob, 4.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.fillRect(3, -18.5 - bob, 1.1, 1.3);
    g.fillStyle = '#b0705a';
    g.fillRect(4.6, -17 - bob, 1, 1.4);
    // flat cap
    g.fillStyle = '#5b5248';
    g.beginPath();
    g.ellipse(0, -21 - bob, 5.6, 2.8, 0, Math.PI, 0);
    g.fill();
    g.fillRect(-5.6, -21.2 - bob, 11.2, 1.6);
    g.fillStyle = '#3e3832';
    g.beginPath();
    g.ellipse(5.4, -20 - bob, 3.4, 1.1, 0.1, 0, Math.PI * 2);
    g.fill();
    arm(armA, true);
  });
}

// ---------- the game ----------

export default {
  id: 'highsteel',
  title: 'High Steel',
  emoji: '🏗️',
  tagline: 'You’re the counterweight on a girder hanging from a crane: walk uphill to keep it level as loads are lowered on and hooked off. Tip it too far and you slide off, and never stand where a load is coming down.',
  colors: { bg: '#1f4e5f', fg: '#fff4dc', accent: '#e0532f' },

  // A spy-thriller cue in 5/4 (3+3+2+2 eighths), 150 BPM, G minor: a kick, snare and staccato
  // string ostinato over a prowling bass from bar one; then timpani, brass stabs and a muted-trumpet
  // style lead; then claps, a shaker and a high glockenspiel arpeggio; and a finale with the lead
  // doubled an octave down and the kick on every group. One 5/4 bar per cycle: 30 bars = 60s.
  music: {
    cps: 0.5,
    setup: `
      const kick = note("g2 ~ ~ g2 ~ ~ ~ ~ ~ ~").s("sine").decay(0.2).sustain(0).gain(0.8)
      const kick2 = note("g2 ~ ~ g2 ~ ~ g2 ~ g2 ~").s("sine").decay(0.18).sustain(0).gain(0.8)
      const snare = s("~ ~ ~ ~ ~ ~ white ~ white ~").decay(0.12).sustain(0).hpf(1500).lpf(6000).gain(0.15)
      const hats = s("white*10").decay(0.03).sustain(0).hpf(7000).gain("0.05 0.025 0.025 0.05 0.025 0.025 0.05 0.025 0.05 0.025")
      const bass = note("<[g2 ~ g2 bb2 ~ c3 g2 ~ f2 ~] [g2 ~ g2 bb2 ~ c3 d3 ~ c3 bb2] [eb2 ~ eb2 g2 ~ bb2 eb2 ~ d2 ~] [d2 ~ d2 fs2 ~ a2 d3 ~ c3 a2]>")
        .s("sawtooth").decay(0.14).sustain(0.2).release(0.04).lpf(saw.range(500, 1500).slow(30)).lpq(4).gain(0.36)
      const strings = note("<[g4 d5 g4 d5 bb4 d5 g4 d5 a4 d5] [g4 d5 g4 d5 bb4 d5 c5 d5 a4 d5] [g4 eb5 g4 eb5 bb4 eb5 g4 eb5 bb4 eb5] [fs4 d5 fs4 d5 a4 d5 fs4 d5 a4 c5]>")
        .s("sawtooth").decay(0.09).sustain(0).lpf(saw.range(1200, 2600).slow(30)).gain(0.06).pan(0.4)
      const timp = note("<g2 g2 eb2 d2>").struct("x ~ ~ ~ ~ ~ ~ ~ x x").s("sine").decay(0.35).sustain(0).gain(0.4)
      const stabs = note("<[g3,bb3,d4] [g3,bb3,d4] [g3,bb3,eb4] [fs3,a3,d4]>").struct("x ~ ~ x ~ ~ ~ ~ x ~")
        .s("sawtooth").decay(0.16).sustain(0).lpf(1500).gain(0.075).room(0.25)
      const tune = "<[g5 ~ ~ bb5 ~ a5 ~ g5 ~ d5] [f5 ~ ~ g5 ~ a5 ~ bb5 ~ ~] [eb6 ~ ~ d6 ~ bb5 ~ g5 ~ bb5] [a5 ~ ~ fs5 ~ d5 ~ ~ ~ ~] [g5 ~ ~ bb5 ~ d6 ~ c6 ~ bb5] [a5 ~ ~ bb5 ~ c6 ~ d6 ~ ~] [eb6 ~ d6 ~ c6 ~ bb5 ~ g5 ~] [fs5 ~ a5 ~ d6 ~ c6 ~ a5 ~]>"
      const lead = note(tune).s("square").decay(0.3).sustain(0.3).release(0.08).lpf(2000)
        .vib(5).vibmod(0.15).gain(0.08).pan(0.55).delay(0.2).delaytime(0.3).delayfeedback(0.25)
      const lead2 = note(tune).transpose(-12).s("sawtooth").decay(0.25).sustain(0.3).release(0.05).lpf(1400).gain(0.055).pan(0.45)
      const clap = s("~ ~ ~ ~ ~ ~ pink ~ ~ ~").decay(0.1).sustain(0).hpf(1400).lpf(5000).gain(0.12).room(0.3)
      const shaker = s("white*20").decay(0.02).sustain(0).hpf(7000).gain("[0.02 0.04]*10")
      const glock = note("<[g6 d6 bb5 d6 g6 d6 a5 d6 bb5 d6] [g6 d6 bb5 d6 g6 d6 c6 d6 a5 d6] [g6 eb6 bb5 eb6 g6 eb6 bb5 eb6 g6 eb6] [fs6 d6 a5 d6 fs6 d6 a5 d6 c6 a5]>")
        .s("triangle").decay(0.08).sustain(0).lpf(4000).gain(0.04).pan(sine.range(0.3, 0.7).slow(2))
    `,
    song: `arrange(
      [6, stack(kick, snare, hats, bass, strings)],
      [8, stack(kick, snare, hats, bass, strings, timp, stabs, lead)],
      [8, stack(kick, snare, clap, hats, shaker, bass, strings, timp, stabs, lead, glock)],
      [8, stack(kick2, snare, clap, hats, shaker, bass, strings, timp, stabs, lead, lead2, glock)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const { drops, lifts, gusts } = makePlan(rng.fork('plan'));
    const sky = paintSky(W, H, art);
    const clouds = [
      { y: 150, speed: 5, size: 120, alpha: 0.75, x: 40 },
      { y: 250, speed: 8, size: 150, alpha: 0.8, x: 260 },
      { y: 330, speed: 11, size: 110, alpha: 0.7, x: 150 },
      { y: 600, speed: 18, size: 220, alpha: 0.9, x: 60 },
      { y: 620, speed: 22, size: 200, alpha: 0.85, x: 300 },
      { y: 575, speed: 14, size: 160, alpha: 0.6, x: 200 },
    ].map((c, i) => ({ ...c, spr: cloudSprite(art, 160, 70, i < 3 ? { lit: '255,252,244', mid: '236,232,222', shade: '170,180,190' } : { lit: '255,248,236', mid: '238,228,214', shade: '190,180,170' }) }));
    const jib = paintJib(W);
    const beamArt = paintBeam();
    const hookArt = paintHook();
    const loadArt = new Map(KINDS.map((k) => [k.key, paintLoad(k)]));
    const walkFrames = Array.from({ length: 8 }, (_, i) => paintWorker((i / 8) * Math.PI * 2, true));
    const standFrame = paintWorker(0, false);
    const sunGlow = glowSprite('rgba(255,236,190,1)', 120);
    const redGlow = glowSprite('rgba(255,50,30,1)', 40);
    const amberGlow = glowSprite('rgba(255,190,60,1)', 30);
    const vignette = vignetteSprite(W, H, 0.45, '20,40,50');
    const dust = createParticles();
    const fx = createParticles();
    const streaks = [];

    // the run's state
    let theta = 0;
    let omega = 0;
    let ps = 0; // where the worker stands along the girder
    let pv = 0;
    let face = 1;
    let walked = 0;
    let clock = 0;
    let gustNow = 0;
    let creak = 0;
    let tag = 1; // the tag line steadying the girder at the start, let go at 2–3.5s
    const loads = []; // on the girder, hanging from a hook, or falling
    const hooks = [];
    const byId = new Map();
    const queue = [
      ...drops.map((d) => ({ at: d.t - descAt(d.p), type: 'drop', d })),
      ...lifts.map((l) => ({ at: l.t - descAt(l.p), type: 'lift', l })),
    ].sort((a, b) => a.at - b.at);
    let qi = 0;
    let fallen = null; // the worker, once they come off

    const cosT = () => Math.cos(theta);
    const sinT = () => Math.sin(theta);
    const toWorld = (s, y) => [PX + s * cosT() - y * sinT(), PY + s * sinT() + y * cosT()];
    const gustAt = (t) => {
      let m = 0;
      for (const gu of gusts) {
        const u = t - gu.t;
        if (u < 0 || u > gu.dur + 0.6) continue;
        const k = u < 0.4 ? u / 0.4 : u > gu.dur ? 1 - (u - gu.dur) / 0.6 : 1;
        m += gu.dir * gu.mag * k;
      }
      return m;
    };
    const gustWarn = (t) => gusts.find((gu) => t > gu.t - 1.6 && t < gu.t + gu.dur + 0.6);

    function step(dt, withWorker) {
      // the girder: swings towards the tilt its loads ask for, held back by its slings (and, for the
      // first seconds, steadied by a tag line from below)
      let tau = gustNow;
      for (const l of loads) if (l.state === 'rest') tau += l.m * l.s;
      if (withWorker) tau += MP * ps;
      const stiff = 1 + 5 * tag;
      omega += (W0 * W0 * stiff * (tau / (K * stiff) - theta) - 2 * ZETA * W0 * Math.sqrt(stiff) * omega) * dt;
      theta += omega * dt;
      theta = clamp(theta, -0.7, 0.7);

      // loads slide downhill once it's steep enough, and drop off the end
      const steep = Math.abs(theta) > SLIP;
      for (const l of loads) {
        if (l.state === 'rest') {
          if (steep) l.vs += Math.sign(theta) * 1300 * (Math.abs(Math.sin(theta)) - Math.tan(SLIP) * Math.cos(theta)) * dt;
          else l.vs *= Math.max(0, 1 - 10 * dt);
          l.s += l.vs * dt;
          if (Math.abs(l.vs) > 20 && Math.random() < 0.3) {
            const [x, y] = toWorld(l.s - Math.sign(l.vs) * l.w * 0.4, TOP);
            dust.burst(x, y, { count: 1, speed: 30, life: 0.5, size: 2.5, round: true, colors: ['rgba(230,200,170,0.8)'] });
          }
          if (Math.abs(l.s) > HALF + l.w * 0.1) {
            const [x, y] = toWorld(l.s, TOP - l.h / 2);
            Object.assign(l, { state: 'fall', x, y, rot: theta, vx: l.vs * cosT(), vy: l.vs * sinT(), vr: Math.sign(l.vs) * 2.5 });
          }
        } else if (l.state === 'fall') {
          l.vy += 900 * dt;
          l.x += l.vx * dt;
          l.y += l.vy * dt;
          l.rot += l.vr * dt;
        }
      }
      for (let i = loads.length - 1; i >= 0; i--) if (loads[i].state === 'gone' || (loads[i].state === 'fall' && loads[i].y > H + 80)) loads.splice(i, 1);
    }

    function updateHooks(dt, game, alive) {
      for (let i = hooks.length - 1; i >= 0; i--) {
        const hk = hooks[i];
        if (hk.state === 'up') {
          hk.y -= 320 * dt;
          if (hk.load) {
            hk.load.x = hk.x;
            hk.load.y = hk.y + 16 + hk.load.h / 2;
          }
          if (hk.y < -90) {
            if (hk.load) hk.load.state = 'gone';
            hooks.splice(i, 1);
          }
          continue;
        }
        if (hk.type === 'drop') {
          const l = hk.load;
          hk.y += hk.speed * dt;
          l.x = hk.x;
          l.y = hk.y + 16 + l.h / 2;
          const s = (hk.x - PX + TOP * sinT()) / cosT();
          const surf = PY + s * sinT() + TOP * cosT();
          const bottom = hk.y + 16 + l.h;
          hk.s = s;
          hk.near = clamp(1 - (surf - bottom) / 160, 0, 1);
          if (alive && bottom > surf - HEAD && Math.abs(s - ps) < l.w / 2 + BODY - 1) {
            game.dead = true;
            game.deathReason = `Flattened by ${l.kind.the}.`;
            fx.burst(PX + ps, surf - 10, { count: 30, speed: 140, life: 0.9, size: 3, round: true, drag: 2, colors: ['#f4efe4', '#e2b06e', '#d9a07a'] });
            fallen = { x: toWorld(ps, TOP)[0], y: toWorld(ps, TOP)[1] - 25, vx: Math.sign(ps - s || 1) * 120, vy: -160, rot: 0, vr: Math.sign(ps - s || 1) * 5, hatY: 0 };
          }
          if (bottom >= surf) {
            Object.assign(l, { state: 'rest', s, vs: 0 });
            omega += (l.m * s) * 0.0006;
            const [x, y] = toWorld(s, TOP);
            dust.burst(x, y, { count: 14 + l.m * 4, speed: 70 + l.m * 15, angle: -Math.PI / 2, spread: Math.PI * 1.2, life: 0.6, size: 3, round: true, drag: 3, colors: ['rgba(235,215,190,0.9)', 'rgba(200,180,160,0.8)'] });
            hk.load = null;
            hk.state = 'up';
          }
        } else {
          const l = hk.target;
          if (l.state !== 'rest') {
            hk.state = 'up';
            continue;
          }
          const [cx, cy] = toWorld(l.s, TOP - l.h / 2);
          hk.x = cx;
          const top = cy - l.h / 2;
          if (hk.state === 'down') {
            hk.y = Math.min(hk.y + hk.speed * dt, top - 16);
            if (hk.y >= top - 16) {
              hk.state = 'hold';
              hk.hold = 0.22;
            }
          } else {
            hk.y = top - 16;
            hk.hold -= dt;
            if (hk.hold <= 0) {
              Object.assign(l, { state: 'hang', x: cx, y: cy });
              omega -= (l.m * l.s) * 0.0004;
              hk.load = l;
              hk.state = 'up';
              const [x, y] = toWorld(l.s, TOP);
              dust.burst(x, y, { count: 8, speed: 50, angle: -Math.PI / 2, spread: 2, life: 0.5, size: 2.5, round: true, drag: 3, colors: ['rgba(235,215,190,0.8)'] });
            }
          }
        }
      }
    }

    function spawn(t) {
      while (qi < queue.length && queue[qi].at <= t) {
        const ev = queue[qi++];
        if (ev.type === 'drop') {
          const d = ev.d;
          const l = { id: d.id, kind: d.kind, m: d.m, w: d.w, h: d.kind.h, s: d.s, vs: 0, state: 'hang', x: PX + d.s, y: -60, rot: 0 };
          loads.push(l);
          byId.set(d.id, l);
          const y0 = -50 - l.h;
          const surf = PY + TOP;
          hooks.push({ type: 'drop', x: PX + d.s, y: y0, speed: (surf - (y0 + 16 + l.h)) / descAt(d.p), load: l, state: 'down', s: d.s, near: 0, sway: Math.random() * 6 });
        } else {
          const l = byId.get(ev.l.id);
          if (!l || l.state !== 'rest') continue;
          const [, cy] = toWorld(l.s, TOP - l.h / 2);
          const y0 = -60;
          l.marked = true;
          hooks.push({ type: 'lift', x: toWorld(l.s, 0)[0], y: y0, speed: (cy - l.h / 2 - 16 - y0) / descAt(ev.l.p), target: l, state: 'down', sway: Math.random() * 6 });
        }
      }
    }

    function updateCosmetic(dt, t) {
      clock += dt;
      for (const c of clouds) {
        c.x += c.speed * dt;
        if (c.x - c.size / 2 > W + 20) c.x = -c.size / 2 - 20;
      }
      const warn = gustWarn(t);
      if (warn && Math.random() < (t > warn.t ? 0.6 : 0.25)) {
        const dir = warn.dir;
        streaks.push({ x: dir > 0 ? -60 : W + 60, y: 120 + Math.random() * 480, vx: dir * (420 + Math.random() * 200), len: 30 + Math.random() * 50, life: 1.4 });
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const s = streaks[i];
        s.x += s.vx * dt;
        s.life -= dt;
        if (s.life <= 0) streaks.splice(i, 1);
      }
      dust.update(dt);
      fx.update(dt);
    }

    function updateFallen(dt) {
      if (!fallen) return;
      fallen.vy += 900 * dt;
      fallen.x += fallen.vx * dt;
      fallen.y += fallen.vy * dt;
      fallen.rot += fallen.vr * dt;
      fallen.hatY += dt;
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        updateCosmetic(dt, t);
        spawn(t);
        const was = tag;
        tag = clamp(1 - (t - 2) / 1.5, 0, 1);
        if (was > 0 && tag === 0) {
          const [x, y] = toWorld(-HALF + 4, BEAM_T / 2);
          dust.burst(x, y, { count: 10, speed: 60, life: 0.6, size: 2.5, round: true, drag: 2, colors: ['#e9dcc0', '#c9b48a'] });
        }
        gustNow = gustAt(t);

        // walk the girder
        pv += (dir * WALK - pv) * Math.min(1, 16 * dt);
        ps += pv * dt;
        if (ps < -EDGE) (ps = -EDGE), (pv = 0);
        if (ps > EDGE) (ps = EDGE), (pv = 0);
        if (dir) face = dir;
        walked += Math.abs(pv) * dt;

        step(dt, true);
        updateHooks(dt, this, true);
        if (this.dead) return;

        if (Math.abs(theta) > SLIP) {
          creak -= dt;
          if (creak <= 0) {
            creak = 0.12;
            const [x, y] = toWorld(Math.sign(theta) * HALF, BEAM_T / 2);
            dust.burst(x, y, { count: 2, speed: 40, angle: Math.PI / 2, spread: 1, life: 0.8, size: 2, gravity: 300, colors: ['#b8492c', '#e08a5a'] });
          }
        }
        if (Math.abs(theta) > TIP) {
          this.dead = true;
          this.deathReason = 'The girder tipped and you slid off.';
          const [x, y] = toWorld(ps, TOP);
          const down = Math.sign(theta);
          fallen = { x, y: y - 25, vx: down * 150, vy: -60, rot: theta, vr: down * 4, hatY: 0 };
          fx.burst(x, y, { count: 18, speed: 90, life: 0.7, size: 2.5, round: true, drag: 2, colors: ['#f4efe4', '#e08a5a'] });
        }
      },

      afterlife(dt) {
        updateCosmetic(dt, 999);
        gustNow = 0;
        step(dt, false);
        updateHooks(dt, this, false);
        updateFallen(dt);
      },

      render(g) {
        drawSprite(g, sky, W / 2, H / 2);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 286, 236, { size: 300, alpha: 0.35 + 0.05 * Math.sin(clock * 0.8) });
        g.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 3; i++) {
          const c = clouds[i];
          drawSprite(g, c.spr, c.x, c.y, { size: c.size, alpha: c.alpha });
        }

        // the main cable and slings holding the girder
        const hookY = PY - 108;
        g.strokeStyle = '#2d2c2a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(PX, JIB_Y + 10);
        g.lineTo(PX, hookY);
        g.stroke();
        g.strokeStyle = '#4a4744';
        g.lineWidth = 1.6;
        for (const sx of [-74, 74]) {
          const [x, y] = toWorld(sx, TOP);
          g.beginPath();
          g.moveTo(PX, hookY + 14);
          g.lineTo(x, y);
          g.stroke();
        }
        drawSprite(g, hookArt, PX, hookY);

        // the tag line: a rope from the girder's end down to the street, slack once it's let go
        if (tag > 0) {
          const [x, y] = toWorld(-HALF + 4, BEAM_T / 2);
          g.strokeStyle = `rgba(214,190,140,${0.4 + 0.6 * tag})`;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x - 10, y + 60 + (1 - tag) * 40, x - 26, H + 10);
          g.stroke();
        }

        // falling loads go behind the girder
        for (const l of loads) if (l.state === 'fall') drawSprite(g, loadArt.get(l.kind.key), l.x, l.y, { rot: l.rot });

        // the girder and everything on it
        const danger = clamp((Math.abs(theta) - SLIP * 0.7) / (TIP - SLIP * 0.7), 0, 1);
        g.save();
        g.translate(PX, PY);
        g.rotate(theta);
        g.fillStyle = 'rgba(30,40,50,0.18)';
        g.fillRect(-HALF, BEAM_T / 2, HALF * 2, 4);
        drawSprite(g, beamArt, 0, 0);
        // landing marks for loads on their way down
        for (const hk of hooks) {
          if (hk.type !== 'drop' || hk.state !== 'down') continue;
          const hw = hk.load.w / 2;
          const a = 0.35 + 0.65 * hk.near;
          g.fillStyle = `rgba(255,${Math.round(lerp(190, 60, hk.near))},40,${0.25 * a})`;
          g.fillRect(hk.s - hw, TOP - 3, hw * 2, 3);
          g.strokeStyle = `rgba(255,${Math.round(lerp(190, 60, hk.near))},40,${a})`;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(hk.s - hw, TOP - 7);
          g.lineTo(hk.s - hw, TOP);
          g.lineTo(hk.s + hw, TOP);
          g.lineTo(hk.s + hw, TOP - 7);
          g.stroke();
        }
        for (const l of loads) {
          if (l.state !== 'rest') continue;
          drawSprite(g, loadArt.get(l.kind.key), l.s, TOP - l.h / 2);
          if (l.marked) {
            // about to be hooked off: green chevrons pointing up
            const bob = (clock * 2) % 1;
            const y = TOP - l.h - 8 - bob * 10;
            g.lineCap = 'round';
            g.lineJoin = 'round';
            for (const [col, lw] of [
              [`rgba(20,60,30,${0.8 - bob * 0.5})`, 5],
              [`rgba(130,255,170,${1 - bob * 0.6})`, 2.4],
            ]) {
              g.strokeStyle = col;
              g.lineWidth = lw;
              g.beginPath();
              g.moveTo(l.s - 7, y + 5);
              g.lineTo(l.s, y - 2);
              g.lineTo(l.s + 7, y + 5);
              g.stroke();
            }
          }
        }
        // the spirit level on the girder's face: the bubble runs to the high end
        {
          const lx = 0;
          g.fillStyle = '#2b2a28';
          g.fillRect(lx - 22, -4.5, 44, 9);
          g.fillStyle = danger > 0.5 ? '#ffb0a0' : '#d8f2a0';
          g.fillRect(lx - 20, -3, 40, 6);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(lx - 4.5, -3, 1, 6);
          g.fillRect(lx + 3.5, -3, 1, 6);
          const bx = lx - clamp(theta / TIP, -1, 1) * 15;
          g.fillStyle = danger > 0.5 ? '#ff4030' : '#ffffff';
          g.beginPath();
          g.ellipse(bx, 0, 4, 2.2, 0, 0, Math.PI * 2);
          g.fill();
        }
        // the worker, standing upright against the tilt
        if (!fallen) {
          g.save();
          g.translate(ps, TOP);
          g.rotate(-theta * 0.8 + clamp(pv / WALK, -1, 1) * 0.08);
          if (face < 0) g.scale(-1, 1);
          const moving = Math.abs(pv) > 25;
          const spr = moving ? walkFrames[Math.floor(walked / 6) % 8] : standFrame;
          // a little wobble when it gets steep
          const wob = danger * Math.sin(clock * 22) * 0.06;
          g.rotate(wob);
          drawSprite(g, spr, 0, -25);
          g.restore();
        }
        g.restore();

        if (danger > 0) {
          const [x, y] = toWorld(Math.sign(theta) * HALF, 0);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, x, y, { size: 120, alpha: danger * (0.5 + 0.3 * Math.sin(clock * 14)) });
          g.globalCompositeOperation = 'source-over';
        }

        // hooks, cables and hanging loads
        for (const hk of hooks) {
          const sway = Math.sin(clock * 1.7 + hk.sway) * 1.5;
          const x = hk.x + sway;
          g.fillStyle = '#3d3a36';
          g.fillRect(x - 8, JIB_Y + 6, 16, 7);
          g.fillStyle = '#1c1b1a';
          g.beginPath();
          g.arc(x - 4, JIB_Y + 14, 2, 0, Math.PI * 2);
          g.arc(x + 4, JIB_Y + 14, 2, 0, Math.PI * 2);
          g.fill();
          if (hk.y > JIB_Y + 10) {
            g.strokeStyle = '#2d2c2a';
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(x, JIB_Y + 12);
            g.lineTo(x, hk.y - 12);
            g.stroke();
          }
          const l = hk.load;
          if (l) {
            g.strokeStyle = '#5a5754';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x, hk.y + 10);
            g.lineTo(x - l.w / 2 + 3, hk.y + 16);
            g.moveTo(x, hk.y + 10);
            g.lineTo(x + l.w / 2 - 3, hk.y + 16);
            g.stroke();
            drawSprite(g, loadArt.get(l.kind.key), x, hk.y + 16 + l.h / 2);
            if (hk.type === 'drop' && hk.state === 'down') {
              // plumb line down to where it'll land
              const [mx, my] = toWorld(hk.s, TOP);
              const by = hk.y + 16 + l.h;
              if (my > by + 4) {
                g.strokeStyle = `rgba(255,${Math.round(lerp(210, 70, hk.near))},60,${0.45 + 0.4 * hk.near})`;
                g.lineWidth = 1.2;
                g.setLineDash([4, 5]);
                g.lineDashOffset = -clock * 30;
                g.beginPath();
                g.moveTo(mx, by + 2);
                g.lineTo(mx, my - 2);
                g.stroke();
                g.setLineDash([]);
              }
              if (hk.near > 0.6) {
                g.globalCompositeOperation = 'lighter';
                drawSprite(g, amberGlow, mx, my, { size: l.w * 2, alpha: (hk.near - 0.6) * 1.2 });
                g.globalCompositeOperation = 'source-over';
              }
            }
          }
          drawSprite(g, hookArt, x, hk.y);
        }
        drawSprite(g, jib, W / 2, JIB_Y);

        // the worker falling away
        if (fallen) {
          g.save();
          g.translate(fallen.x, fallen.y);
          g.rotate(fallen.rot);
          drawSprite(g, walkFrames[2], 0, 0);
          g.restore();
        }

        dust.render(g);
        fx.render(g);

        // low cloud drifting far below, wind streaks in front of everything
        for (let i = 3; i < clouds.length; i++) {
          const c = clouds[i];
          drawSprite(g, c.spr, c.x, c.y, { size: c.size, alpha: c.alpha });
        }
        if (streaks.length) {
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineWidth = 1.4;
          g.beginPath();
          for (const s of streaks) {
            g.moveTo(s.x, s.y);
            g.lineTo(s.x - Math.sign(s.vx) * s.len, s.y);
          }
          g.stroke();
        }
        // a wind sign when a gust is coming
        const warn = gustWarn(clock);
        if (warn && !this.dead) {
          const a = clock < warn.t ? 0.5 + 0.5 * Math.sin(clock * 16) : 0.8;
          const x = warn.dir > 0 ? 34 : W - 34;
          g.fillStyle = `rgba(20,50,60,${0.55 * a})`;
          g.beginPath();
          g.arc(x, 420, 20, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.font = 'bold 30px sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(warn.dir > 0 ? '»' : '«', x, 418);
        }

        if (danger > 0.3) {
          g.fillStyle = `rgba(200,30,20,${(danger - 0.3) * 0.25 * (0.6 + 0.4 * Math.sin(clock * 12))})`;
          g.fillRect(0, 0, W, H);
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
