// The 8s "recombination" intro: fragments of every past game swirl around and
// reassemble into today's title, then dissolve into the game.
// Also the gentle ambient fragments behind the home screen.

import { fitCanvas, DISPLAY_FONT } from './stage.js';
import { clamp, lerp } from './kit.js';

const INTRO_BG = [7, 7, 12];
const CHAOS_COLORS = ['#ff6b8b', '#7ee0ff', '#ffd36b', '#9d7bff', '#6bffb8', '#ff9f5a', '#f3f0ea'];
const DURATION = 8;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sampleText(text, cw, ch) {
  const off = document.createElement('canvas');
  off.width = Math.ceil(cw);
  off.height = Math.ceil(ch);
  const og = off.getContext('2d', { willReadFrequently: true });
  let size = Math.min(ch * 0.12, 110);
  og.font = `800 ${size}px ${DISPLAY_FONT}`;
  const width = og.measureText(text).width;
  size = Math.min(size, (size * cw * 0.86) / width);
  og.font = `800 ${size}px ${DISPLAY_FONT}`;
  og.textAlign = 'center';
  og.textBaseline = 'middle';
  og.fillStyle = '#fff';
  og.fillText(text, cw / 2, ch * 0.46);

  const step = Math.max(2, Math.round(size / 18));
  const data = og.getImageData(0, 0, off.width, off.height).data;
  const points = [];
  for (let y = 0; y < off.height; y += step) {
    for (let x = 0; x < off.width; x += step) {
      if (data[(y * off.width + x) * 4 + 3] > 128) points.push([x, y]);
    }
  }
  return { points, step };
}

export function playIntro({ canvas, game, labelEl, taglineEl }) {
  return new Promise((resolve) => {
    const { cw, ch } = fitCanvas(canvas);
    const { points, step } = sampleText(game.title, cw, ch);
    const accent = hexToRgb(game.colors.accent);
    const white = [243, 240, 234];
    const gameBg = hexToRgb(game.colors.bg);
    const cx = cw / 2;
    const cy = ch * 0.46;
    const reach = Math.max(cw, ch) * 0.65;

    const makeParticle = (target) => {
      const color = hexToRgb(CHAOS_COLORS[(Math.random() * CHAOS_COLORS.length) | 0]);
      const mix = target ? clamp(target[0] / cw, 0, 1) : 0;
      return {
        target,
        r: reach * (0.15 + Math.random() * 0.85),
        a0: Math.random() * Math.PI * 2,
        w: (0.35 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1),
        wobble: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        shape: (Math.random() * 3) | 0,
        size: step * (target ? 0.9 : 0.6 + Math.random() * 1.4),
        delay: 0.8 + Math.random() * 0.8 + mix * 0.35,
        rise: 40 + Math.random() * 160,
        from: color,
        to: target ? [lerp(white[0], accent[0], mix), lerp(white[1], accent[1], mix), lerp(white[2], accent[2], mix)] : color,
      };
    };

    const particles = points.map(makeParticle);
    for (let i = 0; i < 260; i++) particles.push(makeParticle(null));

    labelEl.classList.remove('show');
    taglineEl.classList.remove('show');
    const start = performance.now();
    let raf = 0;

    function frame(now) {
      const T = (now - start) / 1000;
      const { g, cw: w, ch: h, dpr } = fitCanvas(canvas);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bgMix = clamp((T - 7.3) / 0.7, 0, 1);
      g.fillStyle = `rgb(${INTRO_BG.map((c, i) => Math.round(lerp(c, gameBg[i], bgMix))).join(',')})`;
      g.fillRect(0, 0, w, h);

      const dissolve = clamp((T - 6.9) / 1.0, 0, 1);
      for (const p of particles) {
        const ang = p.a0 + p.w * T;
        const rr = p.r * (1 + 0.12 * Math.sin(T * 2 + p.wobble));
        let x = cx + Math.cos(ang) * rr;
        let y = cy + Math.sin(ang) * rr * 0.8;
        let e = 0;
        if (p.target) {
          e = easeInOutCubic(clamp((T - p.delay) / 1.1, 0, 1));
          x = lerp(x, p.target[0], e);
          y = lerp(y, p.target[1], e);
        }
        y -= dissolve * dissolve * p.rise;
        const alpha = (p.target ? 1 : 0.55 * (1 - clamp((T - 1.6) / 1.2, 0, 1))) * (1 - dissolve);
        if (alpha <= 0.01) continue;

        const c = [lerp(p.from[0], p.to[0], e), lerp(p.from[1], p.to[1], e), lerp(p.from[2], p.to[2], e)];
        g.globalAlpha = alpha;
        g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        const s = p.size;
        const rot = (1 - e) * p.spin * T;
        g.save();
        g.translate(x, y);
        if (rot) g.rotate(rot);
        if (p.shape === 0 || e > 0.95) g.fillRect(-s / 2, -s / 2, s, s);
        else if (p.shape === 1) {
          g.beginPath();
          g.arc(0, 0, s / 2, 0, Math.PI * 2);
          g.fill();
        } else {
          g.beginPath();
          g.moveTo(0, -s * 0.6);
          g.lineTo(s * 0.55, s * 0.45);
          g.lineTo(-s * 0.55, s * 0.45);
          g.fill();
        }
        g.restore();
      }
      g.globalAlpha = 1;

      if (T > 2.2) labelEl.classList.add('show');
      if (T > 2.5) taglineEl.classList.add('show');
      if (T > 7.4) {
        labelEl.classList.remove('show');
        taglineEl.classList.remove('show');
      }

      if (T >= DURATION) return resolve();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// Slow drifting fragments behind the home and results screens. Returns a stop function.
export function startAmbient(canvas) {
  const bits = Array.from({ length: 46 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vy: 0.004 + Math.random() * 0.012,
    size: 2 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.2 + Math.random() * 0.5,
    color: CHAOS_COLORS[(Math.random() * CHAOS_COLORS.length) | 0],
    shape: (Math.random() * 2) | 0,
  }));
  let raf = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const { g, cw, ch, dpr } = fitCanvas(canvas);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = `rgb(${INTRO_BG.join(',')})`;
    g.fillRect(0, 0, cw, ch);
    for (const b of bits) {
      b.y -= b.vy * dt;
      if (b.y < -0.05) {
        b.y = 1.05;
        b.x = Math.random();
      }
      const alpha = 0.35 * Math.max(0, Math.sin(now / 1000 * b.speed + b.phase));
      if (alpha < 0.01) continue;
      g.globalAlpha = alpha;
      g.fillStyle = b.color;
      const x = b.x * cw;
      const y = b.y * ch;
      if (b.shape) {
        g.beginPath();
        g.arc(x, y, b.size / 2, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(x - b.size / 2, y - b.size / 2, b.size, b.size);
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
