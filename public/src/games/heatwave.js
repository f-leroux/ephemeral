// Heatwave — you're an ice cube sliding down a sunny street. The sun melts you, shade refreezes you.
// Hop from shadow to shadow; the shade gets sparser and the sun harsher. Later: hot grates.

import {
  createMover,
  createParticles,
  circleCircle,
  pointInRect,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const PLAYER_Y = 540;
const TILE = 240;
const SHADE_RES = 3; // the shadow layer is drawn at 1/3 resolution and upscaled: free soft edges
const AWNING_COLORS = [
  ['#e8505b', '#fff3e2'],
  ['#2f8f83', '#fff3e2'],
  ['#3d5a98', '#fff3e2'],
  ['#f39c33', '#fff3e2'],
];

// ---------- art ----------

function paintPavement(rng) {
  return makeSprite(TILE, TILE, (g) => {
    g.translate(-TILE / 2, -TILE / 2);
    const tones = ['#f2c882', '#eec07a', '#f5cd8a', '#ebbd76'];
    for (let y = 0; y < TILE; y += 60) {
      for (let x = 0; x < TILE; x += 60) {
        g.fillStyle = rng.pick(tones);
        g.fillRect(x, y, 60, 60);
        const shade = g.createLinearGradient(x, y, x + 60, y + 60);
        shade.addColorStop(0, 'rgba(255,245,220,0.25)');
        shade.addColorStop(1, 'rgba(150,90,30,0.12)');
        g.fillStyle = shade;
        g.fillRect(x, y, 60, 60);
      }
    }
    for (let i = 0; i < 1000; i++) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(140,90,40,0.18)' : 'rgba(255,250,235,0.25)';
      const s = rng.range(0.6, 1.8);
      g.fillRect(rng.range(0, TILE), rng.range(0, TILE), s, s);
    }
    // a few hairline cracks and worn patches, placed differently on every slab
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = 'rgba(120,75,35,0.3)';
      g.lineWidth = 0.8;
      g.beginPath();
      let cx = rng.range(0, TILE);
      let cy = rng.range(0, TILE);
      g.moveTo(cx, cy);
      for (let k = 0; k < rng.int(3, 6); k++) {
        cx += rng.range(-9, 9);
        cy += rng.range(3, 9);
        g.lineTo(cx, cy);
      }
      g.stroke();
      const wx = rng.range(0, TILE);
      const wy = rng.range(0, TILE);
      const wear = g.createRadialGradient(wx, wy, 0, wx, wy, 22);
      wear.addColorStop(0, 'rgba(180,120,60,0.12)');
      wear.addColorStop(1, 'rgba(180,120,60,0)');
      g.fillStyle = wear;
      g.fillRect(wx - 22, wy - 22, 44, 44);
    }
    // joints
    for (let k = 0; k < TILE; k += 60) {
      g.fillStyle = 'rgba(130,80,30,0.35)';
      g.fillRect(0, k, TILE, 1.5);
      g.fillRect(k, 0, 1.5, TILE);
      g.fillStyle = 'rgba(255,245,225,0.35)';
      g.fillRect(0, k + 1.5, TILE, 1);
      g.fillRect(k + 1.5, 0, 1, TILE);
    }
  }, 2);
}

function paintCanopy(rng) {
  const R = 60;
  return makeSprite(R * 2 + 10, R * 2 + 10, (g) => {
    const blobs = Array.from({ length: 22 }, () => {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, R * 0.62);
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.range(R * 0.28, R * 0.42) };
    });
    g.fillStyle = 'rgba(30,60,20,0.35)';
    for (const b of blobs) {
      g.beginPath();
      g.arc(b.x - 2, b.y + 3, b.r, 0, Math.PI * 2);
      g.fill();
    }
    for (const [dx, dy, color] of [
      [0, 0, '#3f7a2e'],
      [2, -2, '#4f9138'],
      [4, -4, '#66a846'],
    ]) {
      g.fillStyle = color;
      for (const b of blobs) {
        const k = color === '#66a846' ? 0.55 : color === '#4f9138' ? 0.8 : 1;
        if (color !== '#3f7a2e' && b.x - b.y < -R * 0.3) continue; // lit from the upper right
        g.beginPath();
        g.arc(b.x + dx, b.y + dy, b.r * k, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = 'rgba(200,240,150,0.5)';
    for (let i = 0; i < 18; i++) {
      const a = rng.range(-Math.PI * 0.9, Math.PI * 0.1);
      const d = rng.range(R * 0.2, R * 0.75);
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, rng.range(1.5, 3.5), 0, Math.PI * 2);
      g.fill();
    }
  });
}

function paintGrate() {
  const R = 20;
  return makeSprite(R * 2 + 4, R * 2 + 4, (g) => {
    const core = g.createRadialGradient(0, 0, 2, 0, 0, R);
    core.addColorStop(0, '#ffd27a');
    core.addColorStop(0.5, '#ff6a2a');
    core.addColorStop(1, '#8a2410');
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(0, 0, R - 3, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#3a2a24';
    for (let y = -R; y < R; y += 6) g.fillRect(-R, y, R * 2, 3);
    g.restore();
    const rim = g.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, '#8d7a70');
    rim.addColorStop(1, '#2b201c');
    g.strokeStyle = rim;
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(0, 0, R - 1.5, 0, Math.PI * 2);
    g.stroke();
  });
}

function paintCube() {
  const S = 30;
  return makeSprite(S + 6, S + 6, (g) => {
    const h = S / 2;
    g.fillStyle = 'rgba(40,60,110,0.25)';
    g.beginPath();
    g.roundRect(-h - 2, -h + 3, S, S, 7);
    g.fill();
    const body = g.createLinearGradient(-h, -h, h, h);
    body.addColorStop(0, '#f4fcff');
    body.addColorStop(0.5, '#bfe6fb');
    body.addColorStop(1, '#8cc9ee');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-h, -h, S, S, 7);
    g.fill();
    g.strokeStyle = 'rgba(90,160,210,0.9)';
    g.lineWidth = 1.2;
    g.stroke();
    // bevel
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(-h + 4, -h + 4, S - 8, S - 8, 4);
    g.stroke();
    // specular streak and bubbles
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(-h + 6, -h + 13);
    g.lineTo(-h + 13, -h + 6);
    g.lineTo(-h + 16, -h + 6);
    g.lineTo(-h + 6, -h + 16);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y, r] of [[5, 4, 1.6], [2, 8, 1], [8, -2, 1.1]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------- the game ----------

export default {
  id: 'heatwave',
  title: 'Heatwave',
  emoji: '🧊',
  tagline: 'You’re an ice cube on a scorching street. Sunlight melts you — stay in the shade to refreeze. Avoid the hot grates.',
  colors: { bg: '#f0c77a', fg: '#3b2412', accent: '#ff7a3d' },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const pavement = paintPavement(art);
    const canopies = Array.from({ length: 4 }, () => paintCanopy(art));
    const grateArt = paintGrate();
    const cubeArt = paintCube();
    const heatGlow = glowSprite('rgba(255,110,40,1)', 30);
    const sunGlow = glowSprite('rgba(255,250,215,1)', 150);
    const frost = glowSprite('rgba(170,230,255,1)', 10);
    const vignette = vignetteSprite(W, H, 0.35, '120,50,0');
    const shadeLayer = document.createElement('canvas');
    shadeLayer.width = Math.ceil(W / SHADE_RES);
    shadeLayer.height = Math.ceil(H / SHADE_RES);
    const sg = shadeLayer.getContext('2d');

    const cube = createMover({ x: W / 2, minX: 14, maxX: W - 14, speed: 300, accel: 18 });
    const fx = createParticles();
    const puddles = createParticles();
    const shades = [];
    const grates = [];
    let ice = 1; // 1 = solid, 0 = puddle
    let inShade = true;
    let scroll = 150;
    let dist = 0;
    let heat = 0;
    let clock = 0;
    let lastTop = PLAYER_Y + 90;
    let lastX = W / 2;
    let grateIn = 20;

    function addPatch(bottom, p, t) {
      const shift = lerp(90, 175, p);
      const x = clamp(lastX + rng.range(-shift, shift), 50, W - 50);
      const roll = rng.next();
      let top;
      if (t > 14 && roll < 0.22) {
        const cy = bottom - 60;
        const parts = Array.from({ length: 3 }, (_, i) => ({ dx: (i - 1) * 38 + rng.range(-8, 8), dy: rng.range(-18, 18), r: rng.range(34, lerp(50, 40, p)) }));
        shades.push({ kind: 'cloud', x, y: cy, vx: rng.range(35, 70) * (rng.chance(0.5) ? -1 : 1) * (0.6 + p), parts });
        top = cy - 60;
      } else if (roll < 0.6) {
        const r = rng.range(lerp(62, 40, p), lerp(82, 52, p));
        shades.push({ kind: 'tree', x, y: bottom - r, r, art: art.int(0, canopies.length - 1) });
        top = bottom - 2 * r;
      } else {
        const left = x < W / 2;
        const reach = rng.range(30, 60);
        const w = left ? x + reach : W - x + reach;
        const h = rng.range(lerp(170, 90, p), lerp(260, 140, p));
        shades.push({ kind: 'awning', x: left ? 0 : W - w, y: bottom - h, w, h, left, colors: rng.pick(AWNING_COLORS) });
        top = bottom - h;
      }
      lastX = x;
      lastTop = top;

      // a spare tree off the main path, more common early on
      if (rng.chance(lerp(0.55, 0.12, p))) {
        const r = rng.range(36, 60);
        shades.push({ kind: 'tree', x: rng.range(r, W - r), y: bottom - rng.range(r, 2 * r), r, art: art.int(0, canopies.length - 1) });
      }
    }

    function shadeAt(px, py) {
      for (const s of shades) {
        if (s.kind === 'tree' && circleCircle(px, py, 0, s.x, s.y, s.r)) return true;
        if (s.kind === 'awning' && pointInRect(px, py, s.x, s.y, s.w, s.h)) return true;
        if (s.kind === 'cloud' && s.parts.some((c) => circleCircle(px, py, 0, s.x + c.dx, s.y + c.dy, c.r))) return true;
      }
      return false;
    }

    // start under a generous tree, with the first stretch of street already laid out
    shades.push({ kind: 'tree', x: W / 2, y: PLAYER_Y, r: 90, art: 0 });
    while (lastTop > -120) addPatch(lastTop - rng.range(10, 40), 0, 0);

    function drawAwning(g, s) {
      const depth = 26;
      const ax = s.left ? 0 : W - depth;
      const edge = s.left ? depth : W - depth;
      const stripe = 13;
      for (let yy = 0; yy < s.h; yy += stripe) {
        g.fillStyle = (yy / stripe) % 2 ? s.colors[1] : s.colors[0];
        g.fillRect(ax, s.y + yy, depth, Math.min(stripe, s.h - yy));
      }
      // scalloped hem along the street side
      for (let yy = 0; yy < s.h; yy += stripe) {
        g.fillStyle = (yy / stripe) % 2 ? s.colors[1] : s.colors[0];
        g.beginPath();
        g.arc(edge, s.y + yy + stripe / 2, stripe / 2, s.left ? -Math.PI / 2 : Math.PI / 2, s.left ? Math.PI / 2 : Math.PI * 1.5);
        g.fill();
      }
      const fold = g.createLinearGradient(ax, 0, ax + depth, 0);
      fold.addColorStop(s.left ? 0 : 1, 'rgba(60,20,10,0.35)');
      fold.addColorStop(s.left ? 1 : 0, 'rgba(255,255,255,0.12)');
      g.fillStyle = fold;
      g.fillRect(ax, s.y, depth, s.h);
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        const p = progress(t, 60, 1.4);
        heat = p;
        scroll = lerp(150, 300, p);
        const move = scroll * dt;
        dist += move;

        lastTop += move;
        while (lastTop > -120) addPatch(lastTop - rng.range(lerp(15, 45, p), lerp(60, 150, p)), p, t);

        grateIn -= dt;
        if (grateIn <= 0) {
          grateIn = lerp(2.4, 0.9, p) * rng.range(0.8, 1.2);
          let x = rng.range(24, W - 24);
          if (Math.abs(x - lastX) < 60) x = x < lastX ? Math.max(24, lastX - 90) : Math.min(W - 24, lastX + 90);
          grates.push({ x, y: -30, r: 17 });
        }

        cube.update(dt, dir);

        for (let i = shades.length - 1; i >= 0; i--) {
          const s = shades[i];
          s.y += move;
          if (s.kind === 'cloud') {
            s.x += s.vx * dt;
            if (s.x < 40 || s.x > W - 40) s.vx = -s.vx;
          }
          if (s.y - 200 > H) shades.splice(i, 1);
        }

        inShade = shadeAt(cube.x, PLAYER_Y);
        const melt = lerp(0.42, 1.05, p);
        ice = clamp(ice + (inShade ? 0.38 : -melt) * dt, 0, 1);
        const size = lerp(8, 26, ice);

        if (!inShade && Math.random() < 0.35) {
          puddles.burst(cube.x + (Math.random() - 0.5) * size * 0.6, PLAYER_Y + size * 0.4, { count: 1, speed: 0, life: 1.4, size: 4 + Math.random() * 5, round: true, colors: ['rgba(110,180,235,0.55)'] });
        }
        if (inShade && ice < 1 && Math.random() < 0.3) {
          fx.burst(cube.x + (Math.random() - 0.5) * size, PLAYER_Y + (Math.random() - 0.5) * size, { count: 1, speed: 15, life: 0.6, size: 2.5, round: true, colors: ['#ffffff', '#bdf0ff'] });
        }
        puddles.update(dt, scroll);
        fx.update(dt, scroll * 0.5);

        for (let i = grates.length - 1; i >= 0; i--) {
          const gr = grates[i];
          gr.y += move;
          if (gr.y - gr.r > H) grates.splice(i, 1);
          else if (circleCircle(cube.x, PLAYER_Y, size * 0.45, gr.x, gr.y, gr.r * 0.8)) {
            this.dead = true;
            this.deathReason = 'Sizzled on a hot grate.';
          }
        }

        if (ice <= 0) {
          this.dead = true;
          this.deathReason = 'Melted into a puddle.';
        }
        if (this.dead) {
          fx.burst(cube.x, PLAYER_Y, { count: 50, speed: 160, life: 1.2, size: 4, round: true, drag: 2, colors: ['#9ad6ff', '#ffffff', '#cdeeff'] });
          puddles.burst(cube.x, PLAYER_Y, { count: 8, speed: 30, life: 2.5, size: 16, round: true, colors: ['rgba(110,180,235,0.5)'] });
        }
      },

      afterlife(dt) {
        clock += dt;
        fx.update(dt, 20);
        puddles.update(dt);
      },

      render(g) {
        // paving
        const off = dist % TILE;
        for (let y = off - TILE; y < H; y += TILE) {
          for (let x = 0; x < W; x += TILE) g.drawImage(pavement.canvas, x, y, TILE, TILE);
        }

        // hot grates sit on the ground, under the shadows
        for (const gr of grates) {
          const pulse = 0.6 + 0.4 * Math.sin(clock * 5 + gr.x);
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, heatGlow, gr.x, gr.y, { size: 76, alpha: 0.35 + 0.35 * pulse });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, grateArt, gr.x, gr.y, { size: gr.r * 2.5 });
          // shimmer rising off the grate
          g.strokeStyle = `rgba(255,140,60,${0.25 * pulse})`;
          g.lineWidth = 1.5;
          for (let k = -1; k <= 1; k++) {
            g.beginPath();
            for (let yy = 0; yy < 40; yy += 4) {
              const xx = gr.x + k * 8 + Math.sin(clock * 8 + yy * 0.3 + k) * 3;
              if (yy === 0) g.moveTo(xx, gr.y - 18);
              else g.lineTo(xx, gr.y - 18 - yy);
            }
            g.stroke();
          }
        }

        puddles.render(g);

        // all shadows drawn solid into a low-res layer, then blended once: soft edges, no overlap darkening
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, shadeLayer.width, shadeLayer.height);
        sg.setTransform(1 / SHADE_RES, 0, 0, 1 / SHADE_RES, 0, 0);
        sg.fillStyle = '#26306b';
        sg.beginPath();
        for (const s of shades) {
          if (s.kind === 'tree') {
            sg.moveTo(s.x + s.r, s.y);
            sg.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          } else if (s.kind === 'awning') sg.rect(s.x, s.y, s.w, s.h);
          else {
            for (const c of s.parts) {
              sg.moveTo(s.x + c.dx + c.r, s.y + c.dy);
              sg.arc(s.x + c.dx, s.y + c.dy, c.r, 0, Math.PI * 2);
            }
          }
        }
        sg.fill('nonzero');
        g.globalAlpha = 0.36;
        g.imageSmoothingEnabled = true;
        g.drawImage(shadeLayer, 0, 0, W, H);
        g.globalAlpha = 1;

        fx.render(g, true);

        // the ice cube
        if (!this.dead) {
          const size = lerp(8, 26, ice);
          if (inShade) {
            g.globalCompositeOperation = 'lighter';
            drawSprite(g, frost, cube.x, PLAYER_Y, { size: size * 2.4, alpha: 0.35 });
            g.globalCompositeOperation = 'source-over';
          }
          drawSprite(g, cubeArt, cube.x, PLAYER_Y, { size: size * (36 / 30), rot: cube.lean * 0.25 });

          // melt meter
          const w = 40;
          g.fillStyle = 'rgba(59,36,18,0.25)';
          g.beginPath();
          g.roundRect(cube.x - w / 2, PLAYER_Y + 24, w, 6, 3);
          g.fill();
          g.fillStyle = ice > 0.35 ? '#4aa8f0' : '#ff5a3a';
          g.beginPath();
          g.roundRect(cube.x - w / 2, PLAYER_Y + 24, Math.max(6, w * ice), 6, 3);
          g.fill();
        }

        // canopies and awnings (the sun is up and to the right, so shadows fall down-left)
        for (const s of shades) {
          if (s.kind === 'tree') drawSprite(g, canopies[s.art], s.x + s.r * 0.3, s.y - s.r * 0.38, { size: s.r * 1.5 });
          else if (s.kind === 'awning') drawAwning(g, s);
        }

        // the sun, and heat building over the minute
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, sunGlow, W - 10, -20, { size: 420, alpha: 0.35 + 0.35 * heat });
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = `rgba(255,110,30,${0.1 * heat})`;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = `rgba(255,255,255,${0.04 + 0.06 * heat})`;
        g.lineWidth = 6;
        for (let k = 0; k < 4; k++) {
          const base = ((clock * 60 + k * 170) % (H + 60)) - 30;
          g.beginPath();
          for (let x = 0; x <= W; x += 12) {
            const y = H - base + Math.sin(x * 0.04 + clock * 3 + k) * 5;
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
