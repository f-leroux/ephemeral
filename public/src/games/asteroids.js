// Asteroid Run — dodge a thickening debris field. Later: telegraphed comets and walls with one gap.

import {
  createMover,
  createParticles,
  circleCircle,
  progress,
  lerp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const PLAYER_Y = 548;
const PLAYER_R = 9; // forgiving hitbox, smaller than the sprite
const ROCK_ART_R = 40; // radius rocks are painted at; scaled to each rock's size

// ---------- art (built once per run, from a cosmetic rng stream) ----------

function paintNebula(W, H, rng) {
  // Twice the playfield tall; blobs wrap vertically so it tiles while scrolling.
  const tall = H * 2;
  return makeSprite(W, tall, (g) => {
    g.translate(-W / 2, -tall / 2);
    const tints = ['120,70,220', '40,150,210', '220,60,160', '70,90,230'];
    for (let i = 0; i < 16; i++) {
      const x = rng.range(-40, W + 40);
      const y = rng.range(0, tall);
      const r = rng.range(90, 220);
      const tint = rng.pick(tints);
      const a = rng.range(0.07, 0.16);
      for (const dy of [-tall, 0, tall]) {
        const grad = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        grad.addColorStop(0, `rgba(${tint},${a})`);
        grad.addColorStop(1, `rgba(${tint},0)`);
        g.fillStyle = grad;
        g.fillRect(x - r, y + dy - r, r * 2, r * 2);
      }
    }
  }, 1);
}

function paintPlanet() {
  const R = 70;
  return makeSprite(260, 200, (g) => {
    // atmosphere glow
    const halo = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.35);
    halo.addColorStop(0, 'rgba(120,160,255,0.35)');
    halo.addColorStop(1, 'rgba(120,160,255,0)');
    g.fillStyle = halo;
    g.fillRect(-R * 1.4, -R * 1.4, R * 2.8, R * 2.8);

    // back half of the ring
    g.save();
    g.rotate(-0.35);
    g.strokeStyle = 'rgba(200,180,255,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(0, 0, R * 1.75, R * 0.38, 0, Math.PI, Math.PI * 2);
    g.stroke();
    g.restore();

    // body with bands
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.clip();
    const body = g.createLinearGradient(-R, -R, R, R);
    body.addColorStop(0, '#6c5fd6');
    body.addColorStop(0.5, '#3a2f8a');
    body.addColorStop(1, '#120e33');
    g.fillStyle = body;
    g.fillRect(-R, -R, R * 2, R * 2);
    for (let i = -4; i <= 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,190,240,0.08)' : 'rgba(20,10,60,0.12)';
      g.fillRect(-R, i * 16 - 5, R * 2, 9);
    }
    const shade = g.createRadialGradient(-R * 0.4, -R * 0.4, R * 0.2, 0, 0, R * 1.1);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)');
    shade.addColorStop(0.6, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,10,0.55)');
    g.fillStyle = shade;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();

    // front half of the ring
    g.save();
    g.rotate(-0.35);
    g.strokeStyle = 'rgba(220,200,255,0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(0, 0, R * 1.75, R * 0.38, 0, 0, Math.PI);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(0, 0, R * 1.6, R * 0.32, 0, 0, Math.PI);
    g.stroke();
    g.restore();
  }, 2);
}

function paintRock(rng) {
  const R = ROCK_ART_R;
  const n = rng.int(10, 14);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const k = rng.range(0.78, 1.04);
    return [Math.cos(a) * R * k, Math.sin(a) * R * k];
  });
  const craters = Array.from({ length: rng.int(3, 6) }, () => {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, R * 0.55);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.range(4, 11) };
  });
  const specks = Array.from({ length: 26 }, () => [rng.range(-R, R), rng.range(-R, R), rng.range(0.6, 1.6)]);

  return makeSprite(R * 2 + 8, R * 2 + 8, (g) => {
    const outline = () => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.save();
    outline();
    g.clip();
    const body = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
    body.addColorStop(0, '#9aa0c2');
    body.addColorStop(0.45, '#555a7c');
    body.addColorStop(1, '#1b1d30');
    g.fillStyle = body;
    g.fillRect(-R, -R, R * 2, R * 2);
    for (const [x, y, s] of specks) {
      g.fillStyle = 'rgba(15,16,30,0.35)';
      g.fillRect(x, y, s, s);
    }
    for (const c of craters) {
      g.fillStyle = 'rgba(18,19,36,0.55)';
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(190,200,240,0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(c.x, c.y, c.r, -0.2, Math.PI * 0.9);
      g.stroke();
    }
    g.restore();

    outline();
    const rim = g.createLinearGradient(-R, -R, R * 0.4, R * 0.4);
    rim.addColorStop(0, 'rgba(210,225,255,0.85)');
    rim.addColorStop(1, 'rgba(210,225,255,0)');
    g.strokeStyle = rim;
    g.lineWidth = 2;
    g.stroke();
  });
}

function paintShip() {
  return makeSprite(48, 56, (g) => {
    // wings
    const wing = g.createLinearGradient(0, -4, 0, 18);
    wing.addColorStop(0, '#6f7dff');
    wing.addColorStop(1, '#2c3590');
    g.fillStyle = wing;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(6 * s, -4);
      g.lineTo(21 * s, 11);
      g.lineTo(20 * s, 18);
      g.lineTo(7 * s, 14);
      g.closePath();
      g.fill();
      g.fillStyle = '#7ee0ff';
      g.fillRect(s > 0 ? 18 : -21, 11, 3, 7);
      g.fillStyle = wing;
    }
    // hull
    const hull = g.createLinearGradient(-9, 0, 9, 0);
    hull.addColorStop(0, '#9aa6e6');
    hull.addColorStop(0.45, '#ffffff');
    hull.addColorStop(1, '#7e8bd0');
    g.fillStyle = hull;
    g.beginPath();
    g.moveTo(0, -25);
    g.bezierCurveTo(6, -16, 9, -4, 9, 10);
    g.lineTo(4, 17);
    g.lineTo(-4, 17);
    g.lineTo(-9, 10);
    g.bezierCurveTo(-9, -4, -6, -16, 0, -25);
    g.fill();
    g.strokeStyle = 'rgba(20,24,70,0.6)';
    g.lineWidth = 1;
    g.stroke();
    // panel line
    g.strokeStyle = 'rgba(40,50,120,0.35)';
    g.beginPath();
    g.moveTo(-6, 6);
    g.lineTo(6, 6);
    g.stroke();
    // cockpit
    const glass = g.createLinearGradient(0, -14, 0, 2);
    glass.addColorStop(0, '#6ff0ff');
    glass.addColorStop(1, '#0a1f4a');
    g.fillStyle = glass;
    g.beginPath();
    g.ellipse(0, -6, 3.6, 7.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(-1.2, -9, 1, 2.6, -0.2, 0, Math.PI * 2);
    g.fill();
    // engine nozzles
    g.fillStyle = '#23285c';
    g.fillRect(-6, 15, 4, 4);
    g.fillRect(2, 15, 4, 4);
  });
}

// ---------- the game ----------

export default {
  id: 'asteroids',
  title: 'Asteroid Run',
  emoji: '☄️',
  tagline: 'Steer your ship through the debris field. One touch and it’s over. Watch for red warnings: comets.',
  colors: { bg: '#05060f', fg: '#eef1ff', accent: '#7ee0ff' },

  create({ rng, W, H, duration, sfx }) {
    const art = rng.fork('art');
    const nebula = paintNebula(W, H, art);
    const planet = paintPlanet();
    const rockArt = Array.from({ length: 10 }, () => paintRock(art));
    const ship = paintShip();
    const flame = glowSprite('rgba(110,220,255,1)', 24);
    const hot = glowSprite('rgba(255,190,110,1)', 40);
    const starGlow = glowSprite('rgba(200,215,255,1)', 8);
    const vignette = vignetteSprite(W, H, 0.6);
    const stars = [0.25, 0.5, 1].flatMap((z) =>
      Array.from({ length: z === 1 ? 26 : 45 }, () => ({ x: art.range(0, W), y: art.range(0, H), z, tw: art.range(0, 6.28) })),
    );

    const mover = createMover({ x: W / 2, minX: 16, maxX: W - 16, speed: 330, accel: 20 });
    const trail = createParticles();
    const fx = createParticles();
    const rocks = [];
    const comets = [];
    const rings = [];
    const snd = {
      whoosh: sfx.sound({ wave: 'noise', freq: 2500, freqEnd: 700, attack: 0.03, sustain: 0.04, release: 0.2, volume: 0.35, lowpass: 3000 }),
      siren: sfx.sound({ wave: 'square', freq: 880, freqEnd: 640, sustain: 0.1, release: 0.06, volume: 0.22, lowpass: 3200 }),
      streak: sfx.sound({ wave: 'noise', freq: 5000, freqEnd: 400, sustain: 0.08, release: 0.4, volume: 0.55 }),
      rumble: sfx.sound({ wave: 'sine', freq: 70, freqEnd: 45, attack: 0.05, sustain: 0.3, release: 0.4, volume: 0.6, noise: 0.25 }),
      boom: sfx.sound({ wave: 'noise', freq: 900, freqEnd: 50, sustain: 0.15, release: 0.9, volume: 0.9 }),
    };
    const panOf = (x) => (x / W) * 2 - 1;
    let spawnIn = 1.2;
    let cometIn = 20;
    let wallIn = 34;
    let scroll = 210;
    let travelled = 0;
    let clock = 0;
    let time = 0;

    function spawnRock(x, r, vx = 0) {
      rocks.push({ x, y: -r - 10, r, vx, rot: rng.range(0, 6.28), vr: rng.range(-1.2, 1.2), art: rng.int(0, rockArt.length - 1) });
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        time = t;
        clock += dt;
        const p = progress(t);
        scroll = lerp(210, 520, p);
        travelled += scroll * dt;

        spawnIn -= dt;
        if (spawnIn <= 0) {
          spawnIn = lerp(0.62, 0.17, p) * rng.range(0.7, 1.3);
          const r = rng.range(13, lerp(26, 38, p));
          const drift = t > 25 ? rng.range(-70, 70) * p : 0;
          spawnRock(rng.range(r, W - r), r, drift);
        }

        // comets: a red warning column, then a fast streak down it
        cometIn -= dt;
        if (t > 18 && cometIn <= 0) {
          cometIn = lerp(4.5, 1.4, p) * rng.range(0.8, 1.2);
          const x = rng.range(20, W - 20);
          comets.push({ x, warn: 0.75, y: -60 });
          sfx.play(snd.siren, { pan: panOf(x) });
          sfx.play(snd.siren, { pan: panOf(x), delay: 0.28 });
        }

        // walls of rocks with a single gap
        wallIn -= dt;
        if (t > 32 && wallIn <= 0) {
          wallIn = lerp(7, 3.2, p) * rng.range(0.9, 1.1);
          const gap = lerp(120, 78, p);
          const gapX = rng.range(gap / 2 + 10, W - gap / 2 - 10);
          for (let x = 14; x < W; x += 30) {
            if (Math.abs(x - gapX) > gap / 2 + 14) spawnRock(x, 15);
          }
          sfx.play(snd.rumble);
          spawnIn = Math.max(spawnIn, 0.5);
        }

        mover.update(dt, dir);

        for (let i = rocks.length - 1; i >= 0; i--) {
          const r = rocks[i];
          r.y += scroll * dt;
          r.x += r.vx * dt;
          if (r.x < r.r || r.x > W - r.r) r.vx = -r.vx;
          r.rot += r.vr * dt;
          // near miss
          if (!r.passed && r.y > PLAYER_Y) {
            r.passed = true;
            const gap = Math.abs(r.x - mover.x) - r.r;
            if (gap < 34) sfx.play(snd.whoosh, { pan: panOf(r.x), volume: 1 - gap / 40, pitch: 0.8 + r.r / 60 });
          }
          if (r.y - r.r > H) rocks.splice(i, 1);
          else if (circleCircle(mover.x, PLAYER_Y, PLAYER_R, r.x, r.y, r.r * 0.86)) this.die('Hit by an asteroid.');
        }

        for (let i = comets.length - 1; i >= 0; i--) {
          const c = comets[i];
          if (c.warn > 0) {
            c.warn -= dt;
            if (c.warn <= 0) sfx.play(snd.streak, { pan: panOf(c.x) });
          } else {
            c.y += 1500 * dt;
            fx.burst(c.x, c.y - 8, { count: 2, speed: 90, life: 0.5, size: 3, round: true, colors: ['#ffd9a0', '#ff9a5a', '#ffffff'], angle: -Math.PI / 2, spread: 1.2 });
          }
          if (c.y > H + 160) comets.splice(i, 1);
          else if (c.warn <= 0 && circleCircle(mover.x, PLAYER_Y, PLAYER_R, c.x, c.y, 11)) this.die('Struck by a comet.');
        }

        for (const s of stars) {
          s.y += scroll * s.z * 0.3 * dt;
          if (s.y > H) {
            s.y -= H + 10;
            s.x = Math.random() * W;
          }
        }

        trail.burst(mover.x + (Math.random() < 0.5 ? -4 : 4), PLAYER_Y + 18, {
          count: 1, speed: 50, life: 0.45, size: 3.5, round: true, angle: Math.PI / 2, spread: 0.5, colors: ['#7ee0ff', '#b7f3ff', '#6f7dff'],
        });
        trail.update(dt, scroll * 0.35);
        fx.update(dt, scroll * 0.2);
      },

      die(reason) {
        if (this.dead) return;
        this.dead = true;
        this.deathReason = reason;
        sfx.play(snd.boom, { pan: panOf(mover.x) * 0.5 });
        const at = [mover.x, PLAYER_Y];
        fx.burst(...at, { count: 70, speed: 300, life: 1.1, size: 4, round: true, drag: 1.5, colors: ['#ffffff', '#ffe08a', '#ff9a4a', '#ff5a3a'] });
        fx.burst(...at, { count: 22, speed: 180, life: 1.6, size: 5, drag: 0.8, colors: ['#8b93c7', '#c9d0ff', '#4b5390'] });
        rings.push({ x: at[0], y: at[1], r: 6, life: 0.7 });
      },

      afterlife(dt) {
        clock += dt;
        fx.update(dt);
        trail.update(dt);
        for (const r of rocks) r.y += scroll * 0.12 * dt;
        for (const ring of rings) {
          ring.r += 260 * dt;
          ring.life -= dt;
        }
      },

      render(g) {
        g.fillStyle = '#05060f';
        g.fillRect(0, 0, W, H);

        // deep background: nebula and a planet drifting past over the whole minute
        const neb = (travelled * 0.04) % (H * 2);
        g.drawImage(nebula.canvas, 0, neb - H * 2, W, H * 2);
        g.drawImage(nebula.canvas, 0, neb, W, H * 2);
        drawSprite(g, planet, W * 0.8, lerp(-110, H + 120, time / duration));

        // stars; the nearest layer stretches into streaks at speed
        const streak = Math.max(0, (scroll - 330) / 190);
        for (const s of stars) {
          const twinkle = 0.65 + 0.35 * Math.sin(clock * 3 + s.tw);
          g.globalAlpha = s.z * twinkle;
          g.fillStyle = s.z === 1 ? '#ffffff' : '#b9c4ff';
          const size = s.z * 1.8;
          g.fillRect(s.x, s.y, size, size + (s.z === 1 ? streak * 22 : 0));
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'lighter';
        for (const s of stars) if (s.z === 1) drawSprite(g, starGlow, s.x + 1, s.y + 1, { alpha: 0.35 });
        g.globalCompositeOperation = 'source-over';

        // comet warnings
        for (const c of comets) {
          if (c.warn <= 0) continue;
          const blink = 0.5 + 0.5 * Math.sin(c.warn * 28);
          const col = g.createLinearGradient(0, 0, 0, H);
          col.addColorStop(0, `rgba(255,60,70,${0.28 + 0.2 * blink})`);
          col.addColorStop(1, 'rgba(255,60,70,0.03)');
          g.fillStyle = col;
          g.fillRect(c.x - 13, 0, 26, H);
          g.fillStyle = `rgba(255,90,90,${0.6 + 0.4 * blink})`;
          g.beginPath();
          g.arc(c.x, 66, 11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.fillRect(c.x - 1.5, 59, 3, 9);
          g.fillRect(c.x - 1.5, 70, 3, 3);
        }

        for (const r of rocks) drawSprite(g, rockArt[r.art], r.x, r.y, { rot: r.rot, size: (r.r / ROCK_ART_R) * rockArt[r.art].w });

        // comets
        g.globalCompositeOperation = 'lighter';
        for (const c of comets) {
          if (c.warn > 0) continue;
          const tail = g.createLinearGradient(c.x, c.y - 170, c.x, c.y);
          tail.addColorStop(0, 'rgba(255,120,60,0)');
          tail.addColorStop(1, 'rgba(255,210,150,0.85)');
          g.fillStyle = tail;
          g.beginPath();
          g.moveTo(c.x - 2, c.y - 170);
          g.lineTo(c.x + 2, c.y - 170);
          g.lineTo(c.x + 10, c.y);
          g.lineTo(c.x - 10, c.y);
          g.fill();
          drawSprite(g, hot, c.x, c.y, { size: 70 });
        }
        fx.render(g, true);
        trail.render(g, true);

        // the ship
        if (!this.dead) {
          const flicker = 0.8 + Math.random() * 0.4;
          drawSprite(g, flame, mover.x, PLAYER_Y + 20, { size: 30 * flicker });
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.beginPath();
          g.moveTo(mover.x - 4, PLAYER_Y + 17);
          g.lineTo(mover.x + 4, PLAYER_Y + 17);
          g.lineTo(mover.x, PLAYER_Y + 17 + 12 * flicker);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        if (!this.dead) drawSprite(g, ship, mover.x, PLAYER_Y, { rot: mover.lean * 0.3 });

        for (const ring of rings) {
          if (ring.life <= 0) continue;
          g.strokeStyle = `rgba(255,220,160,${ring.life})`;
          g.lineWidth = 3 * ring.life + 1;
          g.beginPath();
          g.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
          g.stroke();
        }

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
