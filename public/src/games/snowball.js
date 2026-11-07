// Snowball — a snowball rolls down an alpine slope at sunset, and its size is the whole game.
// Rolling over snow packs more snow on, so it keeps growing (powder drifts make it grow fast);
// rolling over bare ground or across a gritted road scrapes snow off, so it shrinks. Every fence
// across the slope has one gap, and the ball has to be small enough to squeeze through it (a ring
// in the gap shows the biggest ball that fits, green when you fit and red when you don't), while
// every road has to be crossed without being worn away to nothing (a dashed ring round the ball
// shows how big you need to be). So you steer for bare patches before a fence, for powder before
// a road, and round the pines and boulders in between. Over the minute the slope gets faster,
// the gaps narrower, the roads wider, and fences come in pairs or straight after a road.
// Everything is planned up front from the rng along a reference line, with a bare patch or a
// powder drift placed on that line wherever it's needed, and checked against a reference roller
// with a slower hand, so there is always a way down.

import { BODY_FONT } from '../engine/stage.js';
import { createParticles, progress, lerp, clamp, easeOutCubic, circleCircle, circleRect, makeSprite, drawSprite, glowSprite, vignetteSprite } from '../engine/kit.js';

const STEP = 1 / 120;
const TAU = Math.PI * 2;
const PY = 540; // where the snowball rolls
const EDGE = 18; // snowdrifts down both sides
const R0 = 18; // starting radius
const RMIN = 8; // worn away below this
const RMAX = 40; // it stops growing here
const SH = 18; // px of radius lost per second on bare ground
const GP = 24; // px of radius gained per second in powder
const FIT = 0.88; // a ball squeezes through a gap up to w / 2 / FIT in radius
const ACCEL = 13;
const DT = 1 / 60; // planner resolution

const speedAt = (t) => lerp(150, 255, progress(t, 60, 1.2)) * lerp(0.7, 1, easeOutCubic(clamp(t / 4, 0, 1)));
const growAt = (t) => lerp(4.6, 6.4, clamp(t / 60, 0, 1));
const maxV = (r) => lerp(300, 215, clamp((r - 10) / 30, 0, 1));
const smooth = (u) => u * u * (3 - 2 * u);

const SNOW = ['#ffffff', '#f2f6ff', '#dde7f8', '#c9d7ef'];
const DIRT = ['#6b4a33', '#8a6544', '#4d3424', '#a88a5c', '#ffffff'];
const GLITTER = ['#ffffff', '#fff2c8', '#dceaff', '#ffd9e8'];

// a squircle (rounded-rectangle-ish blob): inside when (|dx|/a)^4 + (|dy|/b)^4 ≤ 1
const inSquircle = (dx, dy, a, b) => {
  const u = (dx / a) ** 2;
  const v = (dy / b) ** 2;
  return u * u + v * v <= 1;
};

// ---------- art ----------

function paintSnow(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const base = g.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, '#d5e0f2');
    base.addColorStop(0.2, '#e8eefa');
    base.addColorStop(0.55, '#f1f5fd');
    base.addColorStop(0.85, '#e6ecf8');
    base.addColorStop(1, '#d2ddf0');
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
    // soft dunes with blue shadows on their lower-right side
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(30, 80);
      wrap(() => {
        const gr = g.createRadialGradient(x + r * 0.25, y + r * 0.2, 0, x + r * 0.25, y + r * 0.2, r);
        gr.addColorStop(0, 'rgba(120,145,205,0.16)');
        gr.addColorStop(1, 'rgba(120,145,205,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x + r * 0.25, y + r * 0.2, r, r * 0.7, 0.4, 0, TAU);
        g.fill();
        const hl = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x - r * 0.2, y - r * 0.2, r * 0.7);
        hl.addColorStop(0, 'rgba(255,248,240,0.5)');
        hl.addColorStop(1, 'rgba(255,248,240,0)');
        g.fillStyle = hl;
        g.beginPath();
        g.ellipse(x - r * 0.2, y - r * 0.2, r * 0.7, r * 0.5, 0.4, 0, TAU);
        g.fill();
      });
    }
    // wind ripples
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const len = rng.range(14, 40);
      const a = rng.range(0.1, 0.24);
      const bend = rng.range(-5, 5);
      wrap(() => {
        g.strokeStyle = `rgba(150,170,215,${a})`;
        g.lineWidth = rng.range(0.8, 1.6);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y + bend, x + len, y + rng.range(-2, 2));
        g.stroke();
        g.strokeStyle = `rgba(255,255,255,${a * 2})`;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y - 1.2);
        g.quadraticCurveTo(x + len / 2, y + bend - 1.2, x + len, y - 1.2);
        g.stroke();
      });
    }
    // old ski tracks
    for (let i = 0; i < 3; i++) {
      const x0 = rng.range(50, W - 50);
      const amp = rng.range(10, 30);
      const ph = rng.range(0, TAU);
      for (const off of [-4, 4]) {
        g.strokeStyle = 'rgba(140,160,210,0.16)';
        g.lineWidth = 1.6;
        g.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const x = x0 + off + Math.sin((y / H) * TAU * 2 + ph) * amp;
          if (y) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    // sparkle
    for (let i = 0; i < 220; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      g.fillStyle = rng.chance(0.3) ? 'rgba(255,230,190,0.7)' : rng.chance(0.5) ? 'rgba(255,255,255,0.9)' : 'rgba(170,190,235,0.45)';
      g.fillRect(x, y, rng.range(0.8, 1.8), rng.range(0.8, 1.6));
    }
  }, 2);
}

function paintDrifts(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const N = 40;
    for (const side of [-1, 1]) {
      const outer = side < 0 ? 0 : W;
      const ph = rng.range(0, TAU);
      const ph2 = rng.range(0, TAU);
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const y = (i / N) * H;
        const w = EDGE + 4 + Math.sin((i / N) * TAU * 3 + ph) * 5 + Math.sin((i / N) * TAU * 8 + ph2) * 2.5;
        pts.push([side < 0 ? w : W - w, y]);
      }
      // blue shadow along the inner edge
      g.fillStyle = 'rgba(110,135,200,0.22)';
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x - side * 6, y + 3);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      const grad = g.createLinearGradient(outer, 0, side < 0 ? EDGE + 8 : W - EDGE - 8, 0);
      grad.addColorStop(0, '#c7d4ee');
      grad.addColorStop(0.55, '#f4f7ff');
      grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(outer, 0);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(outer, H);
      g.closePath();
      g.fill();
      // lumps
      for (let i = 0; i < 40; i++) {
        const x = side < 0 ? rng.range(0, EDGE) : rng.range(W - EDGE, W);
        const y = rng.range(0, H);
        const r = rng.range(4, 10);
        for (const dy of [-H, 0, H]) {
          const gr = g.createRadialGradient(x - r * 0.3, y + dy - r * 0.3, 0, x, y + dy, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.9)');
          gr.addColorStop(0.7, 'rgba(235,240,252,0.6)');
          gr.addColorStop(1, 'rgba(160,180,225,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(x, y + dy, r, 0, TAU);
          g.fill();
        }
      }
      // a warm sunset rim along the crest
      g.strokeStyle = 'rgba(255,200,170,0.45)';
      g.lineWidth = 1.2;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }, 2);
}

function paintPine(rng, r) {
  return makeSprite(r * 2 + 8, r * 2 + 8, (g) => {
    const tiers = [
      [1, '#173328'],
      [0.8, '#1f4634'],
      [0.6, '#2a5a40'],
      [0.4, '#36704c'],
      [0.2, '#468556'],
    ];
    for (const [k, c] of tiers) {
      const n = 8;
      const rot = rng.range(0, TAU);
      const pts = [];
      g.fillStyle = c;
      g.beginPath();
      for (let i = 0; i <= n * 2; i++) {
        const a = rot + (i / (n * 2)) * TAU;
        const rr = r * k * (i % 2 ? 0.7 : 1) * rng.range(0.92, 1.05);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        if (i) g.lineTo(pts[i][0], pts[i][1]);
        else g.moveTo(pts[i][0], pts[i][1]);
      }
      g.closePath();
      g.fill();
      // snow resting on the boughs, on the upper-left (sunny) side
      for (let i = 0; i < n * 2; i += 2) {
        const [x, y] = pts[i];
        if (x + y > r * k * 0.5) continue;
        g.fillStyle = 'rgba(250,252,255,0.92)';
        g.beginPath();
        g.ellipse(x * 0.82, y * 0.82, r * k * 0.18, r * k * 0.1, Math.atan2(y, x), 0, TAU);
        g.fill();
      }
    }
    g.fillStyle = '#fbfdff';
    g.beginPath();
    g.arc(-1, -1, r * 0.12, 0, TAU);
    g.fill();
    const hl = g.createRadialGradient(-r * 0.4, -r * 0.4, 0, -r * 0.4, -r * 0.4, r);
    hl.addColorStop(0, 'rgba(255,210,170,0.22)');
    hl.addColorStop(1, 'rgba(255,210,170,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
  });
}

function paintRock(rng, r) {
  const n = 11;
  const radii = Array.from({ length: n }, () => rng.range(0.82, 1.08));
  return makeSprite(r * 2 + 8, r * 2 + 8, (g) => {
    const path = (s, dx = 0, dy = 0) => {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rr = r * s * radii[i % n];
        const x = Math.cos(a) * rr + dx;
        const y = Math.sin(a) * rr * 0.92 + dy;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.closePath();
    };
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.35, 0, 0, 0, r * 1.1);
    gr.addColorStop(0, '#a9a6ae');
    gr.addColorStop(0.6, '#77737f');
    gr.addColorStop(1, '#4b4856');
    g.fillStyle = gr;
    path(1);
    g.fill();
    g.strokeStyle = 'rgba(40,36,52,0.6)';
    g.lineWidth = 1;
    g.stroke();
    // cracks
    g.strokeStyle = 'rgba(40,36,52,0.4)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, TAU);
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
      g.lineTo(Math.cos(a + 0.3) * r * 0.75, Math.sin(a + 0.3) * r * 0.7);
      g.stroke();
    }
    // a cap of snow
    g.save();
    path(1);
    g.clip();
    g.fillStyle = 'rgba(250,252,255,0.95)';
    g.beginPath();
    g.ellipse(-r * 0.25, -r * 0.3, r * 0.75, r * 0.55, -0.4, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(180,195,230,0.5)';
    g.beginPath();
    g.ellipse(-r * 0.05, -r * 0.05, r * 0.5, r * 0.2, -0.4, 0, Math.PI);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,215,180,0.35)';
    g.beginPath();
    g.ellipse(-r * 0.4, -r * 0.5, r * 0.3, r * 0.15, -0.5, 0, TAU);
    g.fill();
  });
}

function paintShadow(w, h) {
  return makeSprite(w, h, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    gr.addColorStop(0, 'rgba(70,90,160,0.34)');
    gr.addColorStop(0.6, 'rgba(70,90,160,0.2)');
    gr.addColorStop(1, 'rgba(70,90,160,0)');
    g.fillStyle = gr;
    g.scale(1, h / w);
    g.beginPath();
    g.arc(0, 0, w / 2, 0, TAU);
    g.fill();
  }, 1);
}

function paintDirt(rng) {
  const S = 128;
  return makeSprite(S, S, (g) => {
    g.translate(-S / 2, -S / 2);
    g.fillStyle = '#6a4a34';
    g.fillRect(0, 0, S, S);
    const wrap = (x, y, fn) => {
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(x + dx, y + dy);
    };
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(8, 22);
      const c = rng.pick(['rgba(90,62,42,0.5)', 'rgba(120,88,60,0.4)', 'rgba(70,48,34,0.5)']);
      wrap(x, y, (X, Y) => {
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(X, Y, r, r * 0.7, rng.range(0, 3), 0, TAU);
        g.fill();
      });
    }
    // dead grass tufts
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const c = rng.pick(['#b59a5a', '#9c8048', '#c9b070', '#8a8a4a']);
      wrap(x, y, (X, Y) => {
        g.strokeStyle = c;
        g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + rng.range(-0.9, 0.9);
          const l = rng.range(3, 7);
          g.beginPath();
          g.moveTo(X, Y);
          g.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l);
          g.stroke();
        }
      });
    }
    // pebbles
    for (let i = 0; i < 50; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const r = rng.range(0.8, 2.4);
      const c = rng.pick(['#9a9088', '#7c7068', '#b8aca0', '#5a5048']);
      wrap(x, y, (X, Y) => {
        g.fillStyle = 'rgba(30,20,10,0.4)';
        g.beginPath();
        g.arc(X + 0.5, Y + 0.6, r, 0, TAU);
        g.fill();
        g.fillStyle = c;
        g.beginPath();
        g.arc(X, Y, r, 0, TAU);
        g.fill();
      });
    }
    // wet shine and leftover snow crumbs
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, S);
      const y = rng.range(0, S);
      const snow = rng.chance(0.5);
      wrap(x, y, (X, Y) => {
        g.fillStyle = snow ? 'rgba(245,248,255,0.75)' : 'rgba(255,220,190,0.25)';
        g.beginPath();
        g.ellipse(X, Y, snow ? 1.6 : 4, snow ? 1.2 : 1.2, 0, 0, TAU);
        g.fill();
      });
    }
  }, 1);
}

function paintRoad(W, rng) {
  const S = 64;
  return makeSprite(W, S, (g) => {
    g.translate(-W / 2, -S / 2);
    g.fillStyle = '#4e4a54';
    g.fillRect(0, 0, W, S);
    // grit and slush
    for (let i = 0; i < 500; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, S);
      g.fillStyle = rng.pick(['rgba(130,120,120,0.5)', 'rgba(40,36,44,0.5)', 'rgba(160,110,80,0.45)', 'rgba(220,225,240,0.35)']);
      for (const dy of [-S, 0, S]) g.fillRect(x, y + dy, rng.range(0.8, 2), rng.range(0.8, 2));
    }
    // tyre tracks of dark wet tarmac
    for (const cx of [W * 0.3, W * 0.42, W * 0.6, W * 0.72]) {
      g.fillStyle = 'rgba(30,28,36,0.35)';
      g.fillRect(cx - 7, 0, 14, S);
      g.strokeStyle = 'rgba(255,215,190,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - 6, 0);
      g.lineTo(cx - 6, S);
      g.stroke();
    }
    // slush between the tracks
    for (let i = 0; i < 18; i++) {
      const x = rng.pick([rng.range(0, W * 0.27), rng.range(W * 0.46, W * 0.56), rng.range(W * 0.76, W)]);
      const y = rng.range(0, S);
      const r = rng.range(4, 10);
      for (const dy of [-S, 0, S]) {
        g.fillStyle = 'rgba(190,195,215,0.35)';
        g.beginPath();
        g.ellipse(x, y + dy, r, r * 0.6, 0, 0, TAU);
        g.fill();
      }
    }
  }, 1);
}

function paintBerm(W, rng) {
  // the ridge of ploughed snow along a road's edge
  return makeSprite(W, 16, (g) => {
    g.translate(-W / 2, -8);
    g.fillStyle = 'rgba(90,100,150,0.35)';
    g.fillRect(0, 10, W, 4);
    for (let x = -6; x < W + 6; x += rng.range(5, 9)) {
      const r = rng.range(4, 7);
      const gr = g.createRadialGradient(x - r * 0.3, 7 - r * 0.4, 0, x, 8, r);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.7, '#e4ebf8');
      gr.addColorStop(1, '#b6c4e2');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, 8, r, 0, TAU);
      g.fill();
    }
  }, 2);
}

function paintPowder(rng) {
  const w = 120;
  const h = 120;
  return makeSprite(w + 12, h + 12, (g) => {
    const a = w / 2 - 10;
    const b = h / 2 - 10;
    // fluffy lumps round a squircle, with blue shade on their lower-right sides
    const lumps = [];
    for (let i = 0; i < 30; i++) {
      const th = (i / 30) * TAU + rng.range(-0.08, 0.08);
      const c = Math.cos(th);
      const sn = Math.sin(th);
      lumps.push([Math.sign(c) * Math.sqrt(Math.abs(c)) * a, Math.sign(sn) * Math.sqrt(Math.abs(sn)) * b, rng.range(10, 13)]);
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-a, a) * 0.72;
      const y = rng.range(-b, b) * 0.72;
      lumps.push([x, y, rng.range(14, 20)]);
    }
    g.fillStyle = 'rgba(80,95,190,0.32)';
    for (const [x, y, r] of lumps) {
      g.beginPath();
      g.arc(x + 3, y + 5, r, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#e6ebfc';
    g.beginPath();
    g.ellipse(0, 0, a + 2, b + 2, 0, 0, TAU);
    g.fill();
    for (const [x, y, r] of lumps) {
      g.fillStyle = '#d0d8f6';
      g.beginPath();
      g.arc(x + 1.2, y + 1.6, r, 0, TAU);
      g.fill();
      const lg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
      lg.addColorStop(0, '#ffffff');
      lg.addColorStop(0.6, '#f7f8ff');
      lg.addColorStop(1, '#e4e8fb');
      g.fillStyle = lg;
      g.beginPath();
      g.arc(x, y, r * 0.94, 0, TAU);
      g.fill();
    }
    // glitter
    for (let i = 0; i < 80; i++) {
      const x = rng.range(-a - 6, a + 6);
      const y = rng.range(-b - 6, b + 6);
      if (!inSquircle(x, y, a + 4, b + 4)) continue;
      g.fillStyle = rng.pick(['#ffffff', '#ffd98a', '#9fc2ff', '#ff9fc8']);
      g.fillRect(x, y, 1.4, 1.4);
    }
  }, 2);
}

function paintBallBase() {
  const R = 50;
  return makeSprite(R * 2, R * 2, (g) => {
    const gr = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.05, 0, 0, R);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.55, '#f1f5fd');
    gr.addColorStop(0.85, '#d3def3');
    gr.addColorStop(1, '#aebfe2');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
  }, 2);
}

function paintBallTexture(rng) {
  // tiles both ways; scrolled inside the ball to make it roll
  const w = 100;
  const h = 200;
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    const wrap = (x, y, fn) => {
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy);
    };
    for (let i = 0; i < 46; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const r = rng.range(5, 13);
      const dark = rng.chance(0.5);
      wrap(x, y, (X, Y) => {
        g.fillStyle = dark ? 'rgba(150,170,215,0.28)' : 'rgba(255,255,255,0.65)';
        g.beginPath();
        g.ellipse(X, Y, r, r * 0.7, rng.range(0, 3), 0, TAU);
        g.fill();
      });
    }
    // packed-in bits: twigs, pine needles, a leaf, grit
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const kind = rng.int(0, 3);
      const a = rng.range(0, TAU);
      wrap(x, y, (X, Y) => {
        if (kind === 0) {
          g.strokeStyle = 'rgba(110,75,45,0.8)';
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(X, Y);
          g.lineTo(X + Math.cos(a) * 8, Y + Math.sin(a) * 8);
          g.lineTo(X + Math.cos(a) * 11 + 2, Y + Math.sin(a) * 11 - 1);
          g.stroke();
        } else if (kind === 1) {
          g.strokeStyle = 'rgba(50,95,60,0.75)';
          g.lineWidth = 1;
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.moveTo(X, Y);
            g.lineTo(X + Math.cos(a + k * 0.4) * 6, Y + Math.sin(a + k * 0.4) * 6);
            g.stroke();
          }
        } else if (kind === 2) {
          g.fillStyle = 'rgba(200,110,50,0.75)';
          g.beginPath();
          g.ellipse(X, Y, 4, 2, a, 0, TAU);
          g.fill();
        } else {
          g.fillStyle = 'rgba(110,100,95,0.6)';
          g.fillRect(X, Y, 1.5, 1.5);
          g.fillRect(X + 3, Y + 1, 1.2, 1.2);
        }
      });
    }
  }, 2);
}

function paintBallShade() {
  const R = 50;
  return makeSprite(R * 2 + 4, R * 2 + 4, (g) => {
    const gr = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.3, 0, 0, R);
    gr.addColorStop(0, 'rgba(90,110,180,0)');
    gr.addColorStop(0.7, 'rgba(90,110,180,0.16)');
    gr.addColorStop(1, 'rgba(60,80,160,0.58)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    const hl = g.createRadialGradient(-R * 0.38, -R * 0.42, 0, -R * 0.38, -R * 0.42, R * 0.42);
    hl.addColorStop(0, 'rgba(255,255,255,0.85)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    // warm sunset rim light on the upper left
    g.strokeStyle = 'rgba(255,190,150,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, R - 1.5, Math.PI * 0.95, Math.PI * 1.6);
    g.stroke();
    g.strokeStyle = 'rgba(40,55,120,0.75)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.arc(0, 0, R - 1, Math.PI * 1.6, Math.PI * 2.95);
    g.stroke();
    g.strokeStyle = 'rgba(40,55,120,0.4)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(0, 0, R - 0.7, 0, TAU);
    g.stroke();
  }, 2);
}

function paintPost(r, cap) {
  return makeSprite(r * 2 + 4, r * 2 + 4, (g) => {
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    if (cap) {
      gr.addColorStop(0, '#ff8a7a');
      gr.addColorStop(1, '#c8202c');
    } else {
      gr.addColorStop(0, '#a87650');
      gr.addColorStop(1, '#5e3a22');
    }
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    if (cap) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = r * 0.35;
      g.beginPath();
      g.arc(0, 0, r * 0.55, 0, TAU);
      g.stroke();
    } else {
      g.strokeStyle = 'rgba(60,35,20,0.5)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(0, 0, r * 0.55, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(250,252,255,0.95)';
      g.beginPath();
      g.ellipse(-r * 0.15, -r * 0.2, r * 0.7, r * 0.5, -0.3, 0, TAU);
      g.fill();
    }
  }, 3);
}

function paintLight(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const gr = g.createLinearGradient(0, 0, W * 0.4, H);
    gr.addColorStop(0, 'rgba(255,170,140,0.32)');
    gr.addColorStop(0.35, 'rgba(255,200,170,0.1)');
    gr.addColorStop(0.7, 'rgba(160,150,230,0.04)');
    gr.addColorStop(1, 'rgba(90,100,200,0.14)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, 1);
}

// ---------- the game ----------

export default {
  id: 'snowball',
  title: 'Snowball',
  emoji: '❄️',
  tagline: 'Snow grows you, bare ground shrinks you. Fit every gap, never vanish.',
  colors: { bg: '#dbe4f3', fg: '#1c2a4f', accent: '#ff6f61' },

  music: {
    cps: 152 / 240,
    setup: `
      const kick = note("eb2*4").s("sine").decay(0.2).sustain(0).gain(0.82)
      const kick2 = note("eb2 eb2 eb2 [eb2 ~ ~ eb2]").s("sine").decay(0.18).sustain(0).gain(0.82)
      const tail = note("<eb2 b2 gb2 db2>").struct("[~ x x ~]*4").s("sawtooth")
        .decay(0.09).sustain(0.12).release(0.03).lpf(saw.range(320, 1250).slow(38)).lpq(6).gain(0.32)
      const bells = s("white*8").decay(0.035).sustain(0).hpf(7500).gain("[0.03 0.05]*4")
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(7000).gain("[0.014 0.028 0.04 0.028]*4")
      const clap = s("~ pink ~ pink").decay(0.1).sustain(0).hpf(1300).lpf(5200).gain(0.13).room(0.3)
      const chords = "<[eb3,gb3,bb3] [b2,eb3,gb3] [gb3,bb3,db4] [db3,f3,ab3]>"
      const pluck = note(chords).add(note(12)).struct("[~ x]*4").s("sawtooth").decay(0.1).sustain(0)
        .lpf(saw.range(1100, 2600).slow(38)).gain(0.05).room(0.25).pan(0.42)
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.6).lpf(1400).gain(0.05).room(0.5)
      const tune = "<[bb4 ~ bb4 db5 ~ eb5 db5 bb4] [b4 ~ b4 eb5 ~ gb5 eb5 b4] [db5 ~ db5 gb5 ~ bb5 ab5 gb5] [f5 ~ eb5 db5 ~ ab4 bb4 ~] [eb5 ~ gb5 ~ bb5 ~ ab5 gb5] [gb5 ~ f5 eb5 ~ b4 eb5 ~] [db5 ~ eb5 gb5 ~ ab5 bb5 ~] [ab5 ~ gb5 f5 ~ db5 eb5 ~]>"
      const lead = note(tune).s("sawtooth").attack(0.01).decay(0.2).sustain(0.4).release(0.1).lpf(2600)
        .gain(0.06).room(0.4).delay(0.25).delaytime(0.296).delayfeedback(0.3).pan(0.56)
      const lead2 = note(tune).add(note(0.12)).s("sawtooth").attack(0.01).decay(0.2).sustain(0.4).release(0.1).lpf(2300)
        .gain(0.04).pan(0.44)
      const low = note(tune).add(note(-12)).s("square").decay(0.15).sustain(0.3).release(0.06).lpf(1300).gain(0.045)
      const glock = note("<[eb6 bb5 gb6 bb5]*2 [eb6 b5 gb6 b5]*2 [db6 bb5 gb6 bb5]*2 [f6 db6 ab5 db6]*2>")
        .s("triangle").decay(0.08).sustain(0).lpf(5000).gain(0.05).delay(0.25).delaytime(0.296).delayfeedback(0.3)
        .pan(sine.range(0.3, 0.7).slow(2))
      const wash = s("pink*8").decay(0.1).sustain(0).hpf(1000).lpf(saw.range(800, 5200).slow(38)).gain(saw.range(0, 0.06).slow(38))
    `,
    song: `arrange(
      [8, stack(kick, tail, bells, pluck)],
      [8, stack(kick, tail, bells, clap, pluck, pad, lead)],
      [10, stack(kick, tail, hats16, bells, clap, pluck, pad, lead, lead2, glock)],
      [12, stack(kick2, tail, hats16, bells, clap, pluck, pad, lead, lead2, low, glock, wash)]
    )`,
  },

  create({ rng, W, H }) {
    const plan = rng.fork('plan');
    const art = rng.fork('art');
    const XMIN = EDGE;
    const XMAX = W - EDGE;
    const LANE_L = XMIN + 54;
    const LANE_R = XMAX - 54;

    // ---- how far the slope has scrolled by time t ----
    const N = Math.ceil(72 / STEP);
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

    // ---- a reference line down the slope, and the fences and roads on it ----
    const wps = [
      { t: 0, x: W / 2 },
      { t: 2.6, x: W / 2 },
    ];
    const LIM = 100; // average px/s along a leg (the smoothstep peaks at 1.5×)
    const addWp = (t, x) => {
      const pr = wps[wps.length - 1];
      const m = LIM * Math.max(0, t - pr.t);
      x = clamp(clamp(x, pr.x - m, pr.x + m), LANE_L, LANE_R);
      wps.push({ t, x });
      return x;
    };
    const events = [];
    {
      let t = 4.4;
      while (t < 60.6) {
        const p = progress(t, 60, 1.1);
        const pr = wps[wps.length - 1];
        if (t - 0.3 - pr.t > 1.5) addWp(pr.t + (t - 0.3 - pr.t) * plan.range(0.35, 0.65), plan.range(LANE_L, LANE_R));
        // the first few gaps are extra wide, so the opening fences are a gentle introduction
        const gw = () => (lerp(74, 44, p) + lerp(34, 0, clamp((t - 4) / 14, 0, 1))) * plan.range(0.92, 1.08);
        const gate = (T, dx) => {
          const last = wps[wps.length - 1];
          const gx = addWp(T - 0.3, dx != null ? last.x + dx : plan.range(LANE_L, LANE_R));
          addWp(T + 0.12, gx);
          events.push({ kind: 'gate', T, gx, w: gw(), p });
        };
        const pRoad = t < 7.5 ? 0 : lerp(0.26, 0.32, p);
        const pDouble = t > 17 ? lerp(0.14, 0.26, p) : 0;
        const pRG = t > 23 ? lerp(0.12, 0.22, p) : 0;
        const roll = plan.next();
        let end;
        if (roll < pRoad) {
          const dur = lerp(0.34, 0.7, p) * plan.range(0.9, 1.1);
          events.push({ kind: 'road', T: t, dur, p });
          end = t + dur;
        } else if (roll < pRoad + pDouble) {
          gate(t);
          const t2 = t + plan.range(0.75, 1.0);
          gate(t2, (plan.chance(0.5) ? 1 : -1) * plan.range(40, 80));
          end = t2;
        } else if (roll < pRoad + pDouble + pRG) {
          const dur = lerp(0.3, 0.55, p) * plan.range(0.9, 1.1);
          events.push({ kind: 'road', T: t, dur, p });
          const t2 = t + dur + plan.range(0.45, 0.7);
          gate(t2);
          end = t2;
        } else {
          gate(t);
          end = t;
        }
        t = end + lerp(2.9, 1.6, p) * plan.range(0.85, 1.15);
      }
      wps.push({ t: 80, x: wps[wps.length - 1].x });
    }
    let wpi = 0;
    const route = (t) => {
      if (t <= 0) return wps[0].x;
      if (wpi >= wps.length - 1 || wps[wpi].t > t) wpi = 0;
      while (wpi < wps.length - 2 && wps[wpi + 1].t <= t) wpi++;
      const a = wps[wpi];
      const b = wps[wpi + 1];
      const u = clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
      return lerp(a.x, b.x, smooth(u));
    };

    // ---- size along the line: add a bare patch before a fence, powder before a road ----
    const onRoute = []; // { a, b, kind }
    const rateRef = (t) => {
      for (const iv of onRoute) if (t >= iv.a && t < iv.b) return iv.kind === 'powder' ? GP : -SH;
      return growAt(t);
    };
    const integ = (a, b, r) => {
      for (let tt = a; tt < b - 1e-9; tt += DT) {
        const h = Math.min(DT, b - tt);
        r = clamp(r + rateRef(tt + h / 2) * h, 0, RMAX);
      }
      return r;
    };
    {
      let r = R0;
      let a = 0;
      for (const ev of events) {
        if (ev.kind === 'gate') {
          // leave real room either side of the ball in the gap (lots early, less later)
          const clr = lerp(14, 6, ev.p);
          const rT = (ev.w / 2 - clr) / FIT;
          if (integ(a, ev.T, r) > rT) {
            const e = ev.T - plan.range(0.22, lerp(0.3, 0.75, ev.p));
            const dmax = e - a - 0.15;
            let ok = false;
            if (dmax >= 0.1) {
              const iv = { a: e, b: e, kind: 'bare' };
              onRoute.push(iv);
              for (let d = 0.1; d <= dmax; d += 0.02) {
                iv.a = e - d;
                if (integ(a, ev.T, r) <= rT) {
                  ok = true;
                  break;
                }
              }
            }
            if (!ok) ev.w = 2 * (FIT * integ(a, ev.T, r) + clr);
          }
          r = integ(a, ev.T, r);
          a = ev.T;
        } else {
          const need = () => RMIN + SH * ev.dur + 3;
          if (integ(a, ev.T, r) < need()) {
            const e = ev.T - plan.range(0.2, 0.4);
            const dmax = e - a - 0.15;
            let ok = false;
            if (dmax >= 0.1) {
              const iv = { a: e, b: e, kind: 'powder' };
              onRoute.push(iv);
              for (let d = 0.1; d <= dmax; d += 0.02) {
                iv.a = e - d;
                if (integ(a, ev.T, r) >= need()) {
                  ok = true;
                  break;
                }
              }
            }
            if (!ok) {
              ev.dur = (integ(a, ev.T, r) - RMIN - 3) / SH;
              if (ev.dur < 0.15) ev.dead = true;
            }
          }
          r = integ(a, ev.T, r);
          a = ev.T;
          if (!ev.dead) {
            onRoute.push({ a: ev.T, b: ev.T + ev.dur, kind: 'road' });
            r = integ(ev.T, ev.T + ev.dur, r);
            a = ev.T + ev.dur;
          }
        }
      }
    }

    // ---- turn the plan into things on the slope ----
    const fences = [];
    const roads = [];
    const zones = []; // bare patches and powder drifts, as squircles
    for (const ev of events) {
      if (ev.dead) continue;
      if (ev.kind === 'gate') fences.push({ s: cumAt(ev.T), T: ev.T, gx: ev.gx, w: ev.w });
      else roads.push({ s0: cumAt(ev.T), s1: cumAt(ev.T + ev.dur), T: ev.T, dur: ev.dur });
    }
    const makeZone = (kind, s0, s1, x0, x1) => {
      const a = (x1 - x0) / 2;
      const b = ((s1 - s0) / 2) * 1.12 + 4;
      const n = 28;
      const poly = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const wob = art.range(-2, 2);
        poly.push([Math.sign(c) * Math.sqrt(Math.abs(c)) * (a + wob), Math.sign(sn) * Math.sqrt(Math.abs(sn)) * (b + wob)]);
      }
      const glints = [];
      for (let i = 0; i < 6; i++) glints.push([art.range(-0.8, 0.8) * a, art.range(-0.8, 0.8) * b, art.range(0, TAU)]);
      return { kind, cs: (s0 + s1) / 2, cx: (x0 + x1) / 2, a, b, poly, glints };
    };
    for (const iv of onRoute) {
      if (iv.kind === 'road') continue;
      let mn = Infinity;
      let mx = -Infinity;
      for (let tt = iv.a - 0.06; tt <= iv.b + 0.06; tt += 0.02) {
        const x = route(tt);
        mn = Math.min(mn, x);
        mx = Math.max(mx, x);
      }
      const half = plan.range(30, 44);
      zones.push(makeZone(iv.kind, cumAt(iv.a), cumAt(iv.b), Math.max(XMIN + 2, mn - half), Math.min(XMAX - 2, mx + half)));
    }
    const zoneHit = (z, s, x, pad = 0) => inSquircle(x - z.cx, s - z.cs, z.a + pad, z.b + pad);
    const zoneNear = (z, s, x, pad) => Math.abs(s - z.cs) < z.b + pad && Math.abs(x - z.cx) < z.a + pad;
    // more patches and drifts off the line, as options (and traps)
    for (let tc = 3.4; tc < 61; tc += plan.range(0.8, 1.6)) {
      if (!plan.chance(0.6)) continue;
      const dd = plan.range(0.3, 0.65);
      const kind = plan.chance(0.55) ? 'bare' : 'powder';
      const s0 = cumAt(tc);
      const s1 = cumAt(tc + dd);
      const wd = plan.range(64, 104);
      for (let tries = 0; tries < 8; tries++) {
        const x0 = plan.range(XMIN + 2, XMAX - 2 - wd);
        const x1 = x0 + wd;
        let ok = true;
        for (let tt = tc - 0.15; tt <= tc + dd + 0.15 && ok; tt += 0.02) {
          const rx = route(tt);
          if (rx > x0 - 18 && rx < x1 + 18) ok = false;
        }
        const z = makeZone(kind, s0, s1, x0, x1);
        for (const o of zones) if (Math.abs(o.cs - z.cs) < o.b + z.b + 20 && Math.abs(o.cx - z.cx) < o.a + z.a + 16) ok = false;
        for (const f of fences) if (Math.abs(f.s - z.cs) < z.b + 30) ok = false;
        for (const rd of roads) if (z.cs + z.b > rd.s0 - 30 && z.cs - z.b < rd.s1 + 30) ok = false;
        if (!ok) continue;
        zones.push(z);
        break;
      }
    }
    zones.sort((a, b) => a.cs - b.cs);

    // ---- terrain and collisions, shared by the player and the reference roller ----
    const terrainAt = (s, x) => {
      for (const rd of roads) if (s >= rd.s0 && s <= rd.s1) return 'road';
      for (const z of zones) {
        if (z.cs - z.b > s) break;
        if (z.cs + z.b < s) continue;
        if (zoneHit(z, s, x)) return z.kind;
      }
      return 'snow';
    };

    // the reference roller's size over time (for keeping trees clear of it)
    const NR = Math.ceil(62 / DT);
    const rRef = new Float32Array(NR + 1);
    {
      let r = R0;
      for (let i = 0; i <= NR; i++) {
        rRef[i] = r;
        const t = i * DT;
        const ter = terrainAt(cumAt(t), route(t));
        r = clamp(r + (ter === 'snow' ? growAt(t) : ter === 'powder' ? GP : -SH) * DT, 0, RMAX);
      }
    }
    const rRefAt = (t) => rRef[clamp(Math.round(t / DT), 0, NR)];

    let obs = [];
    {
      const clearRoute = (s, x, or) => {
        const t0 = tAtS(s);
        for (let tt = Math.max(0, t0 - 0.4); tt <= t0 + 0.4; tt += 0.025) {
          const dy = cumAt(tt) - s;
          const rr = rRefAt(tt);
          if (Math.abs(dy) > or + rr + 24) continue;
          if (Math.hypot(dy, x - route(tt)) < or + rr * 0.85 + 18) return false;
        }
        return true;
      };
      const clearStuff = (s, x, or) => {
        for (const f of fences) if (Math.abs(s - f.s) < or + 34) return false;
        for (const rd of roads) if (s > rd.s0 - or - 22 && s < rd.s1 + or + 22) return false;
        for (const z of zones) if (zoneNear(z, s, x, or + 8)) return false;
        for (const o of obs) if (Math.abs(o.s - s) < 60 && Math.hypot(o.s - s, o.x - x) < or + o.r + 12) return false;
        return true;
      };
      let tc = 2.9;
      while (tc < 61.5) {
        const p = progress(tc, 60, 1.1);
        const n = 1 + (plan.chance(lerp(0.25, 0.75, p)) ? 1 : 0) + (plan.chance(lerp(0, 0.3, p)) ? 1 : 0);
        for (let k = 0; k < n; k++) {
          for (let tries = 0; tries < 8; tries++) {
            const kind = plan.chance(0.65) ? 'tree' : 'rock';
            const or = kind === 'tree' ? plan.range(12, 16) : plan.range(9, 13);
            const x = plan.range(XMIN + 6, XMAX - 6);
            const s = cumAt(tc) + plan.range(-20, 20);
            if (!clearRoute(s, x, or) || !clearStuff(s, x, or)) continue;
            obs.push({ kind, s, x, r: or, v: plan.int(0, 2) });
            break;
          }
        }
        tc += lerp(0.48, 0.22, p) * plan.range(0.7, 1.3);
      }
      obs.sort((a, b) => a.s - b.s);
    }

    const newBall = () => ({ px: W / 2, vx: 0, r: R0, ter: 'snow', lo: 0 });
    const stepBall = (st, t, dt, dir, k = 1) => {
      const base = cumAt(t + dt);
      const mv = maxV(st.r) * k;
      st.vx += (dir * mv - st.vx) * Math.min(1, ACCEL * dt);
      st.px += st.vx * dt;
      const lim = st.r * 0.7;
      if (st.px < XMIN + lim) {
        st.px = XMIN + lim;
        st.vx = Math.max(0, st.vx);
      } else if (st.px > XMAX - lim) {
        st.px = XMAX - lim;
        st.vx = Math.min(0, st.vx);
      }
      const ter = terrainAt(base, st.px);
      st.ter = ter;
      const rate = ter === 'snow' ? growAt(t) : ter === 'powder' ? GP : -SH;
      st.r = Math.min(RMAX, st.r + rate * dt);
      if (st.r < RMIN) return { kind: 'crumble', ter, s: base, x: st.px };
      for (const f of fences) {
        if (Math.abs(f.s - base) > 12 + st.r) continue;
        const y = PY - (f.s - base);
        const cr = st.r * FIT;
        if (circleRect(st.px, PY, cr, -60, y - 4, f.gx - f.w / 2 + 60, 8) || circleRect(st.px, PY, cr, f.gx + f.w / 2, y - 4, W + 60 - f.gx - f.w / 2, 8)) {
          return { kind: 'fence', o: f, big: cr > f.w / 2 };
        }
      }
      while (st.lo < obs.length && obs[st.lo].s < base - 80) st.lo++;
      for (let i = st.lo; i < obs.length; i++) {
        const o = obs[i];
        if (o.s > base + 80) break;
        if (circleCircle(st.px, PY, st.r * 0.8, o.x, PY - (o.s - base), o.r)) return { kind: o.kind, o };
      }
      return null;
    };

    // ---- check every layout against a reference roller with a slower hand ----
    {
      const sim = () => {
        const st = newBall();
        let dir = 0;
        for (let i = 0; i * STEP < 61; i++) {
          const t = i * STEP;
          if (i % 3 === 0) {
            const err = route(t + 0.12) - st.px - st.vx * 0.1;
            dir = Math.abs(err) < 2 ? 0 : Math.sign(err);
          }
          const hit = stepBall(st, t, STEP, dir, 0.75);
          if (hit) return hit;
        }
        return null;
      };
      for (let iter = 0; iter < 150; iter++) {
        const hit = sim();
        if (!hit) break;
        if (hit.kind === 'tree' || hit.kind === 'rock') obs = obs.filter((o) => o !== hit.o);
        else if (hit.kind === 'fence') hit.o.w += 6;
        else if (hit.ter === 'road') {
          const rd = roads.find((q) => hit.s >= q.s0 && hit.s <= q.s1);
          if (rd) rd.s1 = rd.s0 + (rd.s1 - rd.s0) * 0.7;
        } else {
          const z = zones.find((q) => zoneHit(q, hit.s, hit.x));
          if (z) zones.splice(zones.indexOf(z), 1);
          else break;
        }
      }
    }
    for (const rd of roads) rd.dur = rd.s1 > rd.s0 ? tAtS(rd.s1) - tAtS(rd.s0) : 0;

    // ---- art ----
    const snow = paintSnow(W, H, art);
    const drifts = paintDrifts(W, H, art);
    const pines = [paintPine(art, 16), paintPine(art, 18), paintPine(art, 15)];
    const sidePines = [paintPine(art, 30), paintPine(art, 36), paintPine(art, 26)];
    const rocks = [paintRock(art, 12), paintRock(art, 13), paintRock(art, 11)];
    const longShadow = paintShadow(80, 40);
    const ballShadow = paintShadow(60, 60);
    const dirtTile = paintDirt(art);
    const roadTile = paintRoad(W, art);
    const berm = paintBerm(W, art);
    const powderArt = paintPowder(art);
    const ballBase = paintBallBase();
    const ballTex = paintBallTexture(art);
    const ballShade = paintBallShade();
    const post = paintPost(4.5, false);
    const flagPost = paintPost(5.5, true);
    const light = paintLight(W, H);
    const vignette = vignetteSprite(W, H, 0.45, '40,50,110');
    const sunGlow = glowSprite('rgba(255,190,150,0.55)', 120);
    const sparkGlow = glowSprite('rgba(255,250,230,0.9)', 12);
    const redGlow = glowSprite('rgba(255,70,60,0.8)', 40);
    const sideTrees = [];
    for (let y = 0, i = 0; i < 18; i++) {
      y += art.range(80, 160);
      const side = i % 2 ? 1 : -1;
      sideTrees.push({ y, x: side < 0 ? art.range(-14, 4) : W - art.range(-14, 4), v: art.int(0, 2) });
    }
    const TREE_SPAN = sideTrees[sideTrees.length - 1].y + 120;
    let dirtPat = null;
    let roadPat = null;

    const st = newBall();
    const fx = createParticles();
    const glitter = createParticles();
    const flakes = [];
    for (let i = 0; i < 46; i++) flakes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 2, ph: Math.random() * TAU, v: 20 + Math.random() * 30 });
    const trail = [];
    let base = 0;
    let time = 0;
    let clock = 0;
    let shake = 0;
    let rollX = 0;
    let puffT = 0;
    let culprit = null;
    let deadT = 0;
    let squish = 0;
    let lastBase = 0;

    const objY = (s) => PY - (s - base);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        if (this.dead) return;
        time = t;
        const prevBase = cumAt(t);
        const hit = stepBall(st, t, dt, dir);
        base = cumAt(t + dt);
        // squeezing through a gap: a little sparkle and a squish
        for (const f of fences) {
          if (f.s > prevBase && f.s <= base) {
            squish = 1;
            glitter.burst(f.gx, PY, { count: 16, speed: 120, life: 0.6, size: 2.5, colors: GLITTER, round: true, drag: 2 });
          }
        }
        this.cosmetics(dt, dir);
        if (hit) {
          culprit = hit;
          if (hit.kind === 'crumble') this.die(hit.ter === 'road' ? 'Worn away to nothing crossing a road.' : 'Worn away to nothing on bare ground.');
          else if (hit.kind === 'fence') this.die(hit.big ? 'Too big to squeeze through the fence.' : 'Rolled into the fence.');
          else if (hit.kind === 'tree') this.die('Burst against a pine tree.');
          else this.die('Smashed on a boulder.');
        }
      },

      cosmetics(dt, dir) {
        clock += dt;
        const v = this.dead ? 0 : speedAt(time);
        squish = Math.max(0, squish - dt * 4);
        if (!this.dead) {
          rollX += st.vx * dt;
          // the groove it leaves in the snow
          if (base - lastBase > 5) {
            lastBase = base;
            trail.push({ s: base, x: st.px, r: st.r, snow: st.ter === 'snow' || st.ter === 'powder' });
            if (trail.length > 90) trail.shift();
          }
          puffT -= dt;
          if (puffT <= 0) {
            puffT = 0.04;
            const R = st.r;
            if (st.ter === 'bare' || st.ter === 'road') {
              fx.burst(st.px + (Math.random() - 0.5) * R, PY + R * 0.6, { count: 2, speed: 70, life: 0.5, size: 2.6, colors: DIRT, angle: Math.PI / 2, spread: 1.6, drag: 2 });
              fx.burst(st.px + (Math.random() - 0.5) * R * 1.4, PY + (Math.random() - 0.3) * R, { count: 1, speed: 40, life: 0.6, size: 4, colors: SNOW, round: true, drag: 3 });
            } else if (st.ter === 'powder') {
              glitter.burst(st.px + (Math.random() - 0.5) * R * 1.6, PY - R * 0.2, { count: 2, speed: 60, life: 0.5, size: 2, colors: GLITTER, round: true, drag: 2 });
              fx.burst(st.px, PY - R * 0.8, { count: 1, speed: 40, life: 0.5, size: 5, colors: SNOW, round: true, drag: 3, angle: -Math.PI / 2, spread: 2 });
            } else if (Math.abs(st.vx) > 120 || dir) {
              const sd = Math.sign(st.vx) || dir;
              fx.burst(st.px - sd * R * 0.7, PY + R * 0.3, { count: 1, speed: 60, life: 0.45, size: 3, colors: SNOW, round: true, angle: sd > 0 ? Math.PI * 0.8 : Math.PI * 0.2, spread: 0.8, drag: 3 });
            }
          }
        }
        for (const f of flakes) {
          f.y += (f.v + v * 0.25) * dt;
          f.x += Math.sin(clock * 0.8 + f.ph) * 10 * dt - 6 * dt;
          if (f.y > H + 6) {
            f.y = -6;
            f.x = Math.random() * W;
          }
          if (f.x < -6) f.x = W + 6;
        }
        fx.update(dt, v);
        glitter.update(dt, v);
      },

      die(reason) {
        this.dead = true;
        this.deathReason = reason;
        shake = culprit.kind === 'crumble' ? 0.15 : 0.45;
        const R = Math.max(st.r, 6);
        if (culprit.kind === 'crumble') {
          fx.burst(st.px, PY, { count: 30, speed: 90, life: 0.9, size: 3, colors: SNOW, round: true, drag: 2 });
          fx.burst(st.px, PY, { count: 14, speed: 70, life: 0.8, size: 2.5, colors: DIRT, drag: 2 });
        } else {
          let hx = st.px;
          let hy = PY - R * 0.7;
          if (culprit.o && culprit.kind !== 'fence') {
            hx = (st.px + culprit.o.x) / 2;
            hy = (PY + objY(culprit.o.s)) / 2;
          }
          fx.burst(st.px, PY, { count: 50, speed: 60 + R * 5, life: 1.0, size: 3 + R * 0.12, colors: SNOW, round: true, drag: 2.2 });
          fx.burst(hx, hy, { count: 24, speed: 220, life: 0.8, size: 3, colors: SNOW, round: true, drag: 2.5 });
          glitter.burst(hx, hy, { count: 18, speed: 160, life: 0.7, size: 2.5, colors: GLITTER, round: true, drag: 2 });
          if (culprit.kind === 'tree') fx.burst(hx, hy, { count: 10, speed: 120, life: 0.8, size: 3, colors: ['#1f4634', '#36704c', '#6b4a33'], drag: 2 });
        }
      },

      afterlife(dt) {
        shake = Math.max(0, shake - dt);
        deadT += dt;
        this.cosmetics(dt, 0);
      },

      render(g) {
        g.save();
        if (shake > 0) g.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
        const pulse = 0.5 + 0.5 * Math.sin(clock * 12);

        // the slope
        const off = base % H;
        g.drawImage(snow.canvas, 0, off - H, W, H);
        g.drawImage(snow.canvas, 0, off, W, H);

        // roads
        roadPat ||= g.createPattern(roadTile.canvas, 'repeat');
        for (const rd of roads) {
          if (rd.s1 <= rd.s0) continue;
          const y0 = objY(rd.s1);
          const y1 = objY(rd.s0);
          if (y1 < -20 || y0 > H + 20) continue;
          g.save();
          const oy = base % 64;
          g.translate(0, oy);
          g.fillStyle = roadPat;
          g.fillRect(0, y0 - oy, W, y1 - y0);
          g.restore();
          g.drawImage(berm.canvas, 0, y0 - 11, W, 16);
          g.save();
          g.translate(0, y1 + 3);
          g.scale(1, -1);
          g.drawImage(berm.canvas, 0, -8, W, 16);
          g.restore();
          // orange marker poles at the roadside
          for (const x of [EDGE + 6, W - EDGE - 6]) {
            for (const y of [y0 - 8, y1 + 8]) {
              drawSprite(g, longShadow, x + 8, y + 4, { size: 22, alpha: 0.6 });
              g.fillStyle = '#ff7a1a';
              g.beginPath();
              g.arc(x, y, 3.2, 0, TAU);
              g.fill();
              g.fillStyle = '#1c1c28';
              g.beginPath();
              g.arc(x, y, 1.4, 0, TAU);
              g.fill();
            }
          }
        }

        // bare patches and powder drifts
        dirtPat ||= g.createPattern(dirtTile.canvas, 'repeat');
        for (const z of zones) {
          const y = objY(z.cs);
          if (y + z.b < -20) break;
          if (y - z.b > H + 20) continue;
          if (z.kind === 'bare') {
            const path = () => {
              g.beginPath();
              z.poly.forEach(([dx, dy], i) => (i ? g.lineTo(z.cx + dx, y + dy) : g.moveTo(z.cx + dx, y + dy)));
              g.closePath();
            };
            g.lineJoin = 'round';
            path();
            g.strokeStyle = 'rgba(150,140,140,0.45)';
            g.lineWidth = 9;
            g.stroke();
            // the dirt texture is anchored to the slope, so it scrolls with it
            const oy = base % 128;
            g.save();
            g.translate(0, oy);
            g.fillStyle = dirtPat;
            g.beginPath();
            z.poly.forEach(([dx, dy], i) => (i ? g.lineTo(z.cx + dx, y + dy - oy) : g.moveTo(z.cx + dx, y + dy - oy)));
            g.closePath();
            g.fill();
            g.restore();
            path();
            g.strokeStyle = 'rgba(248,250,255,0.95)';
            g.lineWidth = 3;
            g.stroke();
            g.strokeStyle = 'rgba(60,40,28,0.35)';
            g.lineWidth = 1;
            g.stroke();
          } else {
            g.drawImage(powderArt.canvas, z.cx - z.a * 1.22, y - z.b * 1.22, z.a * 2.44, z.b * 2.44);
          }
        }
        g.globalCompositeOperation = 'lighter';
        for (const z of zones) {
          if (z.kind !== 'powder') continue;
          const y = objY(z.cs);
          if (y + z.b < -20) break;
          if (y - z.b > H + 20) continue;
          for (const [dx, dy, ph] of z.glints) {
            const a = Math.max(0, Math.sin(clock * 3 + ph));
            if (a > 0.05) drawSprite(g, sparkGlow, z.cx + dx, y + dy, { size: 10 + a * 8, alpha: a * 0.9 });
          }
        }
        g.globalCompositeOperation = 'source-over';

        // the groove left behind
        g.lineCap = 'round';
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1];
          const b = trail[i];
          if (!a.snow || !b.snow) continue;
          const ya = objY(a.s);
          const yb = objY(b.s);
          if (ya > H + 40) continue;
          g.strokeStyle = 'rgba(140,165,220,0.3)';
          g.lineWidth = b.r * 1.1;
          g.beginPath();
          g.moveTo(a.x, ya);
          g.lineTo(b.x, yb);
          g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.lineWidth = b.r * 0.35;
          g.beginPath();
          g.moveTo(a.x - b.r * 0.25, ya);
          g.lineTo(b.x - b.r * 0.25, yb);
          g.stroke();
        }

        // shadows of everything standing up
        for (let i = 0; i < obs.length; i++) {
          const o = obs[i];
          const y = objY(o.s);
          if (y < -80) break;
          if (y > H + 60) continue;
          drawSprite(g, longShadow, o.x + o.r * 1.1, y + o.r * 0.6, { size: o.r * (o.kind === 'tree' ? 4.4 : 3.2) });
        }

        // fences, with the biggest ball that fits shown in each gap
        for (const f of fences) {
          const y = objY(f.s);
          if (y < -30 || y > H + 30) continue;
          const gl = f.gx - f.w / 2;
          const gr = f.gx + f.w / 2;
          g.fillStyle = 'rgba(70,90,160,0.25)';
          g.fillRect(-5, y + 3, gl + 5, 6);
          g.fillRect(gr, y + 3, W - gr + 5, 6);
          for (const [x0, x1] of [
            [-5, gl],
            [gr, W + 5],
          ]) {
            g.fillStyle = '#6e4428';
            g.fillRect(x0, y - 3, x1 - x0, 6);
            g.fillStyle = '#a5744a';
            g.fillRect(x0, y - 3, x1 - x0, 1.6);
            g.fillStyle = 'rgba(250,252,255,0.95)';
            g.fillRect(x0, y - 3.6, x1 - x0, 1.6);
          }
          for (let x = XMIN - 6; x < W; x += 30) {
            if (x > gl - 10 && x < gr + 10) continue;
            drawSprite(g, post, x, y);
          }
          drawSprite(g, flagPost, gl, y);
          drawSprite(g, flagPost, gr, y);
          if (!this.dead && y < PY + 10) {
            const maxR = f.w / 2 / FIT;
            const fits = st.r <= maxR - 1;
            g.setLineDash([4, 4]);
            g.lineDashOffset = -clock * 12;
            g.lineWidth = 2;
            g.strokeStyle = fits ? 'rgba(40,190,110,0.85)' : `rgba(240,50,60,${0.6 + 0.35 * pulse})`;
            g.beginPath();
            g.arc(f.gx, y, maxR, 0, TAU);
            g.stroke();
            g.setLineDash([]);
          }
          if (culprit && culprit.o === f) drawSprite(g, redGlow, clamp(st.px, gl - 30, gr + 30), y, { size: 90, alpha: 0.4 + 0.3 * pulse });
        }

        // rocks and pines
        for (let i = 0; i < obs.length; i++) {
          const o = obs[i];
          const y = objY(o.s);
          if (y < -40) break;
          if (y > H + 40) continue;
          if (o.kind === 'rock') drawSprite(g, rocks[o.v], o.x, y, { size: rocks[o.v].w * (o.r / 12) });
          else drawSprite(g, pines[o.v], o.x, y, { size: o.r * 2.5 + 8 });
          if (culprit && culprit.o === o) drawSprite(g, redGlow, o.x, y, { size: o.r * 5, alpha: 0.5 + 0.3 * pulse });
        }

        // the snowball
        const crumbling = culprit && culprit.kind === 'crumble';
        const sc = this.dead ? Math.max(0, 1 - deadT * (crumbling ? 2.2 : 6)) : 1;
        const R = st.r * sc;
        if (R > 0.5) {
          drawSprite(g, ballShadow, st.px + R * 0.35, PY + R * 0.4, { size: R * 2.6 });
          g.save();
          g.translate(st.px, PY);
          const sq = squish * 0.12;
          g.scale(1 - sq, 1 + sq * 0.6);
          g.drawImage(ballBase.canvas, -R, -R, R * 2, R * 2);
          g.save();
          g.beginPath();
          g.arc(0, 0, R * 0.97, 0, TAU);
          g.clip();
          const k = R / 50;
          const tw = 100 * k;
          const th = 200 * k;
          const oy = ((base % th) + th) % th;
          const ox = (((rollX * 0.8) % tw) + tw) % tw;
          for (let ix = -1; ix <= 0; ix++) for (let iy = -1; iy <= 0; iy++) g.drawImage(ballTex.canvas, -R + ox + ix * tw, -R - oy + (iy + 1) * th, tw, th);
          g.restore();
          g.drawImage(ballShade.canvas, -R - 2 * k, -R - 2 * k, R * 2 + 4 * k, R * 2 + 4 * k);
          g.restore();
          // getting dangerously small on bare ground
          if (!this.dead && (st.ter === 'bare' || st.ter === 'road') && st.r < RMIN + 6) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, redGlow, st.px, PY, { size: R * 4, alpha: (0.3 + 0.4 * pulse) * (1 - (st.r - RMIN) / 6) });
            g.globalCompositeOperation = 'source-over';
          }
        }

        // a dashed ring round the ball: how big you need to be to get across the next road
        if (!this.dead) {
          let need = 0;
          for (const rd of roads) {
            if (rd.s1 <= base || rd.s1 <= rd.s0) continue;
            if (rd.s0 > base + PY + 20) break;
            const rem = base >= rd.s0 ? (rd.s1 - base) / speedAt(time) : rd.dur;
            need = RMIN + SH * rem;
            break;
          }
          if (need > 0) {
            const short = st.r < need + 0.5;
            g.setLineDash([5, 4]);
            g.lineDashOffset = clock * 14;
            g.lineWidth = 2;
            g.strokeStyle = short ? `rgba(240,50,60,${0.6 + 0.35 * pulse})` : 'rgba(60,90,180,0.45)';
            g.beginPath();
            g.arc(st.px, PY, need, 0, TAU);
            g.stroke();
            g.setLineDash([]);
          }
        }

        fx.render(g);
        glitter.render(g, true);

        // drifts and pines down both sides
        const boff = base % H;
        g.drawImage(drifts.canvas, 0, boff - H, W, H);
        g.drawImage(drifts.canvas, 0, boff, W, H);
        const toff = (base * 1.1) % TREE_SPAN;
        for (const tr of sideTrees) {
          for (const kk of [-1, 0]) {
            const y = tr.y + toff + kk * TREE_SPAN - 60;
            if (y < -70 || y > H + 70) continue;
            drawSprite(g, longShadow, tr.x + 26, y + 16, { size: 120, alpha: 0.8 });
            drawSprite(g, sidePines[tr.v], tr.x, y);
          }
        }

        // falling snow and the low sunset light
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (const f of flakes) {
          g.globalAlpha = 0.5 + 0.4 * Math.sin(clock * 2 + f.ph);
          g.beginPath();
          g.arc(f.x, f.y, f.s, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        g.drawImage(light.canvas, 0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, 10, 10, { size: 360, alpha: 0.5 });
        g.globalCompositeOperation = 'source-over';
        g.restore();
        drawSprite(g, vignette, W / 2, H / 2);

        // "!" when too big for the fence coming up, or too small for the road
        if (!this.dead) {
          let warn = false;
          for (const f of fences) {
            const y = objY(f.s);
            if (y > PY) continue;
            if (y < PY - 300) break;
            if (st.r > f.w / 2 / FIT - 1) warn = true;
            break;
          }
          if ((st.ter === 'bare' || st.ter === 'road') && st.r < RMIN + 4) warn = true;
          if (warn) {
            const yy = PY - st.r - 16;
            g.fillStyle = '#fff8f0';
            g.beginPath();
            g.arc(st.px, yy, 8, 0, TAU);
            g.fill();
            g.fillStyle = '#e8302a';
            g.font = `bold 12px ${BODY_FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('!', st.px, yy + 0.5);
          }
        }
      },
    };
    return game;
  },
};
