// The home screen's practice strip: a dot you can steer with the same controls as the game,
// with the same "hold left / hold right" hints as the countdown. Returns a stop function.

import { createInput } from './input.js';
import { createMover } from './kit.js';
import { fitCanvas, BODY_FONT } from './stage.js';

const ACCENT = '255,211,107';

export function startPractice(canvas) {
  const input = createInput(canvas);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const trail = [];
  let mover = null;
  let width = 0;
  let raf = 0;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const { g, cw, ch, dpr } = fitCanvas(canvas);
    if (cw < 60) {
      raf = requestAnimationFrame(frame); // not laid out yet
      return;
    }
    const r = 11;
    const minX = r + 6;
    const maxX = cw - r - 6;
    // same feel as the game: crossing the whole strip takes about a second
    if (cw !== width) {
      const at = mover ? (mover.x - r - 6) / (width - 2 * r - 12) : 0.5;
      mover = createMover({ x: minX + at * (maxX - minX), minX, maxX, speed: cw * 0.92, accel: 20 });
      width = cw;
    }
    const dir = input.dir();
    mover.update(dt, dir);
    trail.push(mover.x);
    if (trail.length > 10) trail.shift();

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);

    // the two halves, lit while held
    for (const side of [-1, 1]) {
      const x = side < 0 ? 0 : cw / 2;
      g.fillStyle = dir === side ? `rgba(${ACCENT},0.14)` : 'rgba(255,255,255,0.03)';
      g.fillRect(x, 0, cw / 2, ch);
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 6; y < ch - 6; y += 10) g.fillRect(cw / 2 - 0.5, y, 1, 5);

    // track
    const y = ch * 0.4;
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(minX, y - 1, maxX - minX, 2);

    // the dot, with a short trail and a glow
    trail.forEach((tx, i) => {
      g.globalAlpha = (i / trail.length) * 0.25;
      g.fillStyle = `rgb(${ACCENT})`;
      g.beginPath();
      g.arc(tx, y, r * (0.4 + (0.6 * i) / trail.length), 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;
    const glow = g.createRadialGradient(mover.x, y, 0, mover.x, y, r * 3);
    glow.addColorStop(0, `rgba(${ACCENT},0.45)`);
    glow.addColorStop(1, `rgba(${ACCENT},0)`);
    g.fillStyle = glow;
    g.fillRect(mover.x - r * 3, y - r * 3, r * 6, r * 6);
    g.fillStyle = `rgb(${ACCENT})`;
    g.beginPath();
    g.arc(mover.x, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(mover.x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    g.fill();

    // the same hints as the countdown
    g.font = `500 14px ${BODY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ly = ch - 20;
    if (touch) {
      g.fillStyle = dir < 0 ? '#fff' : 'rgba(255,255,255,0.75)';
      g.fillText('◀  hold left', cw / 4, ly);
      g.fillStyle = dir > 0 ? '#fff' : 'rgba(255,255,255,0.75)';
      g.fillText('hold right  ▶', (cw * 3) / 4, ly);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText('←  →   to move   (or hold either side)', cw / 2, ly);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    input.dispose();
  };
}
