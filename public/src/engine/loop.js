// Runs one 60-second attempt of a daily game module.
//
// A game module's default export looks like:
//   {
//     id, title, emoji, tagline,           // tagline: one or two sentences shown before playing
//     colors: { bg, fg, accent },
//     create({ rng, W, H, duration }) => instance
//   }
// and an instance:
//   {
//     dead: false, deathReason: '',        // set dead = true on the first mistake
//     update(dt, dir, t),                  // fixed 1/120s steps; dir is -1 | 0 | 1
//     render(g, t),                        // draw in world units: W x H = 360 x 640
//     afterlife?(dt),                      // optional: keep cosmetic effects moving after death
//   }
//
// The world is a fixed 9:16 playfield so every screen sees the same amount of the run.

import { createRng } from './rng.js';
import { createInput } from './input.js';
import { fitCanvas, DISPLAY_FONT, BODY_FONT } from './stage.js';
import { createParticles, wrapText, easeOutCubic } from './kit.js';

export const W = 360;
export const H = 640;
export const DURATION = 60;
const STEP = 1 / 120;
const COUNTDOWN = 3;

// Sets the largest font (up to `size`) at which `text` fits within `maxWidth`.
function fitFont(g, text, weight, size, family, maxWidth) {
  g.font = `${weight} ${size}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxWidth) g.font = `${weight} ${Math.floor((size * maxWidth) / w)}px ${family}`;
}

export function runGame({ canvas, game, seed, onProgress }) {
  return new Promise((resolve) => {
    const rng = createRng(seed);
    const inst = game.create({ rng, W, H, duration: DURATION });
    const input = createInput(window);
    const confetti = createParticles();
    const touch = window.matchMedia('(pointer: coarse)').matches;

    let phase = 'countdown'; // countdown | play | dying | survived
    let countdown = COUNTDOWN;
    let resumeLabel = null;
    let t = 0;
    let acc = 0;
    let endTimer = 0;
    let lastSaved = -1;
    let last = performance.now();
    let raf = 0;

    const onVisibility = () => {
      if (document.hidden && phase === 'play') {
        phase = 'countdown';
        countdown = COUNTDOWN;
        resumeLabel = 'Paused — get ready';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    function finish() {
      cancelAnimationFrame(raf);
      input.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      const survived = phase === 'survived';
      resolve({
        score: survived ? DURATION : Math.floor(t * 10) / 10,
        survived,
        reason: survived ? '' : inst.deathReason || 'Game over',
      });
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (phase === 'countdown') {
        countdown -= dt;
        if (countdown <= 0) {
          phase = 'play';
          acc = 0;
        }
      } else if (phase === 'play') {
        acc += dt;
        const dir = input.dir();
        while (acc >= STEP) {
          acc -= STEP;
          inst.update(STEP, dir, t);
          t += STEP;
          if (inst.dead) {
            phase = 'dying';
            break;
          }
          if (t >= DURATION) {
            t = DURATION;
            phase = 'survived';
            confetti.burst(W / 2, H * 0.42, {
              count: 140,
              speed: 420,
              life: 1.8,
              size: 5,
              gravity: 380,
              colors: [game.colors.accent, game.colors.fg, '#ffd36b', '#ff6b8b', '#7ee0ff'],
            });
            break;
          }
        }
        if (onProgress && t - lastSaved >= 0.25) {
          lastSaved = t;
          onProgress(Math.floor(t * 10) / 10);
        }
      } else {
        endTimer += dt;
        if (phase === 'dying') inst.afterlife?.(dt);
        confetti.update(dt);
        if (endTimer >= (phase === 'dying' ? 1.6 : 2.2)) return finish();
      }

      draw();
      raf = requestAnimationFrame(frame);
    }

    function draw() {
      const { g, cw, ch, dpr } = fitCanvas(canvas);
      const s = Math.min(cw / W, ch / H);
      const ox = (cw - W * s) / 2;
      const oy = (ch - H * s) / 2;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = game.colors.bg;
      g.fillRect(0, 0, cw, ch);

      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.clip();
      g.save();
      const shake = phase === 'dying' ? Math.max(0, 1 - endTimer / 0.45) * 7 : 0;
      if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      inst.render(g, t);
      g.restore();
      drawHud(g);
      g.restore();

      // Frame the playfield when there is letterboxing (desktop / tablets).
      if (ox > 1 || oy > 1) {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth = 1 / s;
        g.strokeRect(0, 0, W, H);
      }
    }

    function drawHud(g) {
      const fg = game.colors.fg;
      // progress bar
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, 0, W, 4);
      g.fillStyle = game.colors.accent;
      g.fillRect(0, 0, (W * t) / DURATION, 4);

      // timer
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.font = `800 30px ${BODY_FONT}`;
      const clock = (Math.floor(t * 10) / 10).toFixed(1);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillText(clock, W / 2 + 1, 15);
      g.fillStyle = fg;
      g.fillText(clock, W / 2, 14);

      if (phase === 'countdown') drawCountdown(g);
      else if (phase === 'play' && t < 0.6) drawGo(g);
      else if (phase === 'dying') drawDeath(g);
      else if (phase === 'survived') drawSurvived(g);
    }

    function drawCountdown(g) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, W, H);

      // hold zones
      if (touch) {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(0, H * 0.62, W / 2 - 1, H * 0.38);
        g.fillRect(W / 2 + 1, H * 0.62, W / 2 - 1, H * 0.38);
      }
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = `500 14px ${BODY_FONT}`;
      g.textBaseline = 'middle';
      if (touch) {
        g.textAlign = 'center';
        g.fillText('◀  hold left', W / 4, H * 0.81);
        g.fillText('hold right  ▶', (W * 3) / 4, H * 0.81);
      } else {
        g.textAlign = 'center';
        g.fillText('←  →   to move', W / 2, H * 0.81);
      }

      const n = Math.ceil(countdown);
      const f = countdown - Math.floor(countdown) || 1; // 1 → 0 within each second
      const scale = 1 + 0.35 * f * f * f;
      g.save();
      g.translate(W / 2, H * 0.4);
      g.scale(scale, scale);
      g.globalAlpha = 0.35 + 0.65 * f;
      g.fillStyle = game.colors.accent;
      g.font = `800 120px ${BODY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), 0, 0);
      g.restore();

      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      if (resumeLabel) {
        g.font = `700 16px ${BODY_FONT}`;
        g.fillText(resumeLabel, W / 2, H * 0.22);
      }
      g.font = `500 15px ${BODY_FONT}`;
      const lines = wrapText(g, game.tagline, W - 56);
      lines.forEach((line, i) => g.fillText(line, W / 2, H * 0.53 + i * 21));
    }

    function drawGo(g) {
      const k = t / 0.6;
      g.save();
      g.globalAlpha = 1 - k;
      g.translate(W / 2, H * 0.4);
      g.scale(1 + k * 0.6, 1 + k * 0.6);
      g.fillStyle = game.colors.accent;
      g.font = `800 96px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GO', 0, 0);
      g.restore();
    }

    function drawDeath(g) {
      const flash = Math.max(0, 1 - endTimer / 0.18);
      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash * 0.8})`;
        g.fillRect(0, 0, W, H);
      }
      const veil = Math.min(1, endTimer / 1.2);
      g.fillStyle = `rgba(0,0,0,${veil * 0.55})`;
      g.fillRect(0, 0, W, H);
      if (endTimer > 0.35) {
        const k = easeOutCubic(Math.min(1, (endTimer - 0.35) / 0.4));
        g.globalAlpha = k;
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `800 64px ${BODY_FONT}`;
        g.fillText(`${(Math.floor(t * 10) / 10).toFixed(1)}s`, W / 2, H * 0.42 + (1 - k) * 20);
        g.globalAlpha = 1;
      }
    }

    function drawSurvived(g) {
      g.fillStyle = `rgba(0,0,0,${Math.min(0.45, endTimer * 0.5)})`;
      g.fillRect(0, 0, W, H);
      confetti.render(g);
      const k = easeOutCubic(Math.min(1, endTimer / 0.5));
      g.save();
      g.translate(W / 2, H * 0.42);
      g.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
      g.globalAlpha = k;
      g.fillStyle = game.colors.accent;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitFont(g, 'SURVIVED', 800, 54, DISPLAY_FONT, W - 48);
      g.fillText('SURVIVED', 0, 0);
      g.font = `600 18px ${BODY_FONT}`;
      g.fillStyle = '#fff';
      g.fillText('all 60 seconds', 0, 44);
      g.restore();
    }

    raf = requestAnimationFrame(frame);
  });
}
