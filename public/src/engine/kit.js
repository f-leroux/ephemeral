// Small toolkit shared by daily game modules: math, collisions, a player controller,
// and a cosmetic particle system.

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInQuad = (t) => t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Difficulty progress from 0 (start) to 1 (60s), with an optional curve exponent > 1
// to keep the early game gentle and the final seconds brutal.
export const progress = (t, duration = 60, curve = 1.6) => Math.pow(clamp(t / duration, 0, 1), curve);

export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

export function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

// Horizontal mover with a little acceleration so it feels responsive but not twitchy.
export function createMover({ x, minX, maxX, speed = 320, accel = 22 }) {
  return {
    x,
    vx: 0,
    update(dt, dir) {
      const target = dir * speed;
      this.vx += (target - this.vx) * Math.min(1, accel * dt);
      this.x += this.vx * dt;
      if (this.x < minX) {
        this.x = minX;
        this.vx = 0;
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = 0;
      }
    },
    // -1..1, handy for tilting sprites
    get lean() {
      return this.vx / speed;
    },
  };
}

// Cosmetic particles. Uses Math.random on purpose: visuals don't need to be deterministic.
export function createParticles() {
  const list = [];
  return {
    list,
    burst(x, y, { count = 20, speed = 160, life = 0.8, size = 3, colors = ['#fff'], gravity = 0, spread = Math.PI * 2, angle = 0, round = false, drag = 0 } = {}) {
      for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.3 + Math.random() * 0.7);
        list.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: life * (0.5 + Math.random() * 0.5),
          max: life,
          size: size * (0.5 + Math.random()),
          color: colors[(Math.random() * colors.length) | 0],
          gravity,
          round,
          drag,
        });
      }
    },
    update(dt, scrollSpeed = 0) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.x += p.vx * dt;
        p.y += (p.vy + scrollSpeed) * dt;
      }
    },
    // additive = true blends light-on-light for sparks, flames and glows
    render(g, additive = false) {
      if (additive) g.globalCompositeOperation = 'lighter';
      for (const p of list) {
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        if (p.round) {
          g.beginPath();
          g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
  };
}

// Wraps text to a max width; returns lines.
export function wrapText(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- art helpers ----------

// Pre-renders detailed art once into an offscreen canvas (at `scale`× for crisp phones),
// so each frame is a cheap drawImage. `draw(g)` works in sprite units, origin at the centre.
export function makeSprite(w, h, draw, scale = 3) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(w / 2, h / 2);
  draw(g);
  return { canvas: c, w, h };
}

// Draws a sprite centred at (x, y), optionally rotated and resized to `size` (its width).
export function drawSprite(g, sprite, x, y, { rot = 0, size = sprite.w, alpha = 1 } = {}) {
  const k = size / sprite.w;
  const w = sprite.w * k;
  const h = sprite.h * k;
  if (alpha !== 1) g.globalAlpha = alpha;
  if (rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.drawImage(sprite.canvas, -w / 2, -h / 2, w, h);
    g.restore();
  } else {
    g.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h);
  }
  if (alpha !== 1) g.globalAlpha = 1;
}

// A soft round glow, e.g. for lights, engine flames and heat. Draw it with 'lighter' for bloom.
export function glowSprite(color, radius = 32) {
  return makeSprite(radius * 2, radius * 2, (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, (a) => `${parseFloat(a) * 0.45})`));
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grad;
    g.fillRect(-radius, -radius, radius * 2, radius * 2);
  }, 1);
}

// Darkened edges, drawn over a whole playfield.
export function vignetteSprite(W, H, strength = 0.55, color = '0,0,0') {
  return makeSprite(W, H, (g) => {
    const grad = g.createRadialGradient(0, -H * 0.05, H * 0.28, 0, 0, H * 0.72);
    grad.addColorStop(0, `rgba(${color},0)`);
    grad.addColorStop(1, `rgba(${color},${strength})`);
    g.fillStyle = grad;
    g.fillRect(-W / 2, -H / 2, W, H);
  }, 1);
}
