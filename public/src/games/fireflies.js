// Firefly Jar — a summer meadow at dusk. Fireflies drift down out of the sky and you hold the jar:
// catch every single one as it reaches you. Miss one and the night is over. Later, wasps join the swarm.

import {
  createMover,
  createParticles,
  progress,
  lerp,
  clamp,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';

const PLAYER_Y = 540;
const CATCH_Y = 522; // the jar's mouth
const MOUTH = 23; // half-width of the catching window
const SPEED = 300;
const REACH = 272; // what we assume a player can really cover per second when planning the swarm

// ---------- art ----------

function paintSky(W, H, rng) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, 470);
    sky.addColorStop(0, '#0b0820');
    sky.addColorStop(0.45, '#241a4d');
    sky.addColorStop(0.75, '#5b2f68');
    sky.addColorStop(0.92, '#b4566b');
    sky.addColorStop(1, '#e98a5e');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // stars, denser and brighter towards the top
    for (let i = 0; i < 220; i++) {
      const y = Math.pow(rng.next(), 1.8) * 380;
      const a = lerp(0.9, 0.1, y / 380) * rng.range(0.4, 1);
      g.fillStyle = `rgba(255,${rng.int(230, 255)},${rng.int(200, 255)},${a})`;
      const s = rng.chance(0.08) ? 1.8 : rng.range(0.6, 1.2);
      g.fillRect(rng.range(0, W), y, s, s);
    }
    // a thin wash of cloud across the afterglow
    for (let i = 0; i < 7; i++) {
      const cy = rng.range(330, 420);
      const cx = rng.range(-40, W + 40);
      const cloud = g.createRadialGradient(cx, cy, 2, cx, cy, rng.range(60, 120));
      cloud.addColorStop(0, 'rgba(255,170,150,0.16)');
      cloud.addColorStop(1, 'rgba(255,170,150,0)');
      g.save();
      g.translate(cx, cy);
      g.scale(1, 0.18);
      g.translate(-cx, -cy);
      g.fillStyle = cloud;
      g.fillRect(cx - 130, cy - 130, 260, 260);
      g.restore();
    }
  }, 1);
}

function paintMoon() {
  return makeSprite(44, 44, (g) => {
    const disc = g.createRadialGradient(-5, -5, 2, 0, 0, 18);
    disc.addColorStop(0, '#fffbe8');
    disc.addColorStop(0.7, '#f3e6c0');
    disc.addColorStop(1, '#cdb98e');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(150,130,100,0.28)';
    for (const [x, y, r] of [[-6, 4, 4], [5, -6, 3], [7, 7, 2.4], [-2, -9, 1.8], [-9, -3, 1.6]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// A strip of silhouetted hills and trees, wider than the screen so it can slide for parallax.
function paintTreeline(w, h, rng, color, rim, treeChance, scale) {
  return makeSprite(w, h, (g) => {
    g.translate(-w / 2, -h / 2);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    const base = h * 0.55;
    const pts = [];
    for (let x = 0; x <= w; x += 6) {
      const y = base + Math.sin(x * 0.012 + rng.range(0, 0.05)) * h * 0.12 + Math.sin(x * 0.031) * h * 0.05;
      pts.push([x, y]);
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    // trees: stacked round crowns or pointy pines
    for (const [x, y] of pts) {
      if (!rng.chance(treeChance)) continue;
      const th = rng.range(18, 44) * scale;
      if (rng.chance(0.5)) {
        g.beginPath();
        g.moveTo(x - th * 0.32, y + 2);
        g.lineTo(x, y - th);
        g.lineTo(x + th * 0.32, y + 2);
        g.fill();
      } else {
        g.fillRect(x - 1.5 * scale, y - th * 0.5, 3 * scale, th * 0.5 + 2);
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + rng.range(-th * 0.25, th * 0.25), y - th * 0.55 - rng.range(0, th * 0.3), th * rng.range(0.22, 0.34), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // the last of the sunset catches the ridge
    const glow = g.createLinearGradient(0, base - h * 0.2, 0, base + h * 0.2);
    glow.addColorStop(0, rim);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  }, 1.5);
}

function paintMeadow(W, rng) {
  const h = 150;
  return makeSprite(W + 80, h, (g) => {
    g.translate(-(W + 80) / 2, -h / 2);
    const ground = g.createLinearGradient(0, 20, 0, h);
    ground.addColorStop(0, '#1b1a38');
    ground.addColorStop(1, '#0a0a18');
    g.fillStyle = ground;
    g.beginPath();
    g.moveTo(0, 30);
    for (let x = 0; x <= W + 80; x += 10) g.lineTo(x, 26 + Math.sin(x * 0.02) * 8);
    g.lineTo(W + 80, h);
    g.lineTo(0, h);
    g.fill();
    // tufts of grass and a few wildflowers
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, W + 80);
      const y = rng.range(26, h);
      const len = rng.range(6, 18) * lerp(0.7, 1.3, y / h);
      g.strokeStyle = rng.pick(['rgba(40,52,90,0.9)', 'rgba(30,40,70,0.9)', 'rgba(62,70,120,0.7)']);
      g.lineWidth = rng.range(0.8, 1.8);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + rng.range(-4, 4), y - len * 0.6, x + rng.range(-6, 6), y - len);
      g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, W + 80);
      const y = rng.range(40, h - 10);
      g.fillStyle = rng.pick(['rgba(230,200,255,0.5)', 'rgba(255,240,200,0.45)', 'rgba(200,230,255,0.45)']);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,220,120,0.7)';
      g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
  }, 2);
}

function paintJar() {
  return makeSprite(52, 66, (g) => {
    // shadow on the grass
    g.fillStyle = 'rgba(0,0,10,0.45)';
    g.beginPath();
    g.ellipse(2, 28, 22, 5, 0, 0, Math.PI * 2);
    g.fill();
    // glass body
    const body = g.createLinearGradient(-20, 0, 20, 0);
    body.addColorStop(0, 'rgba(190,230,255,0.38)');
    body.addColorStop(0.3, 'rgba(140,190,230,0.12)');
    body.addColorStop(0.75, 'rgba(120,170,220,0.1)');
    body.addColorStop(1, 'rgba(190,230,255,0.34)');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-15, -20);
    g.quadraticCurveTo(-21, -16, -21, -6);
    g.lineTo(-21, 20);
    g.quadraticCurveTo(-21, 28, -13, 28);
    g.lineTo(13, 28);
    g.quadraticCurveTo(21, 28, 21, 20);
    g.lineTo(21, -6);
    g.quadraticCurveTo(21, -16, 15, -20);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(210,240,255,0.75)';
    g.lineWidth = 1.4;
    g.stroke();
    // thick base of the glass
    g.fillStyle = 'rgba(200,235,255,0.25)';
    g.beginPath();
    g.roundRect(-18, 23, 36, 4, 2);
    g.fill();
    // neck and rim
    g.fillStyle = 'rgba(180,220,250,0.3)';
    g.fillRect(-15, -26, 30, 7);
    g.strokeStyle = 'rgba(230,248,255,0.85)';
    g.lineWidth = 1.2;
    g.strokeRect(-15, -26, 30, 7);
    // twine wrapped around the neck, with a loop to carry it
    g.strokeStyle = '#c7a26a';
    g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(-15.5, -24 + k * 2.2);
      g.lineTo(15.5, -23 + k * 2.2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(199,162,106,0.8)';
    g.beginPath();
    g.moveTo(-15, -23);
    g.bezierCurveTo(-20, -36, 20, -36, 15, -23);
    g.stroke();
    // highlights
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.roundRect(-16, -12, 3.5, 30, 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.roundRect(12, -8, 2, 18, 1);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(-14, -15, 1.6, 0, Math.PI * 2);
    g.fill();
  });
}

function paintFirefly() {
  return makeSprite(22, 22, (g) => {
    // wings
    g.fillStyle = 'rgba(210,225,255,0.45)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 5, -3, 5.5, 2.6, s * -0.5, 0, Math.PI * 2);
      g.fill();
    }
    // glowing tail
    const tail = g.createRadialGradient(0, 4, 0.5, 0, 4, 5);
    tail.addColorStop(0, '#ffffe0');
    tail.addColorStop(0.5, '#e4ff6a');
    tail.addColorStop(1, '#88c428');
    g.fillStyle = tail;
    g.beginPath();
    g.ellipse(0, 4, 3.4, 4.6, 0, 0, Math.PI * 2);
    g.fill();
    // thorax and head
    g.fillStyle = '#3a2a1e';
    g.beginPath();
    g.ellipse(0, -2.5, 2.8, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d0503a';
    g.beginPath();
    g.arc(0, -5.8, 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2a1e';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-1, -7);
    g.lineTo(-3, -10);
    g.moveTo(1, -7);
    g.lineTo(3, -10);
    g.stroke();
  });
}

function paintWasp() {
  return makeSprite(40, 40, (g) => {
    // wings, cloudy grey
    g.fillStyle = 'rgba(200,210,230,0.5)';
    g.strokeStyle = 'rgba(40,40,60,0.6)';
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 9, -6, 9, 4, s * -0.45, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // striped abdomen, pointing down (it's diving at you)
    g.save();
    g.beginPath();
    g.ellipse(0, 6, 6.5, 10, 0, 0, Math.PI * 2);
    g.clip();
    const abd = g.createLinearGradient(-6, 0, 6, 0);
    abd.addColorStop(0, '#c98600');
    abd.addColorStop(0.4, '#ffd21f');
    abd.addColorStop(1, '#a86a00');
    g.fillStyle = abd;
    g.fillRect(-7, -4, 14, 22);
    g.fillStyle = '#1a1208';
    for (let y = -1; y < 18; y += 5) g.fillRect(-7, y, 14, 2.4);
    g.restore();
    g.strokeStyle = '#1a1208';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 6, 6.5, 10, 0, 0, Math.PI * 2);
    g.stroke();
    // stinger
    g.fillStyle = '#1a1208';
    g.beginPath();
    g.moveTo(-1.6, 15);
    g.lineTo(0, 20);
    g.lineTo(1.6, 15);
    g.fill();
    // thorax, head and angry eyes
    g.fillStyle = '#2a1c0a';
    g.beginPath();
    g.ellipse(0, -5, 4.6, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8b416';
    g.beginPath();
    g.arc(0, -11, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b3160c';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 2.4, -11.5, 1.6, 2.4, s * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#1a1208';
    g.lineWidth = 1;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 1.5, -14.5);
      g.quadraticCurveTo(s * 4, -19, s * 6.5, -18);
      g.stroke();
      // legs
      g.beginPath();
      g.moveTo(s * 3.5, -3);
      g.lineTo(s * 8, 1);
      g.lineTo(s * 8.5, 5);
      g.stroke();
    }
  });
}

// ---------- the game ----------

export default {
  id: 'fireflies',
  title: 'Firefly Jar',
  emoji: '✨',
  tagline: 'Catch every firefly in your jar as it drifts down to you: let a single one slip past and the night is over. Never scoop up a wasp.',
  colors: { bg: '#161232', fg: '#fff3c4', accent: '#d8ff5a' },

  // Melodic house in E minor at 132 BPM (Em – C – G – D): 33 bars of 1.82s = the full minute.
  music: {
    cps: 0.55,
    setup: `
      const chords = "<[e3,g3,b3] [c3,e3,g3] [g3,b3,d4] [d3,fs3,a3]>"
      const pad = note(chords).s("sawtooth").attack(0.3).release(0.6)
        .lpf(saw.range(500, 1800).slow(33)).gain(0.07).room(0.5).roomsize(4)
      const bass = note("<e2 c2 g2 d2>").struct("~ x ~ x ~ x ~ x").s("sawtooth")
        .decay(0.14).sustain(0.1).release(0.05).lpf(saw.range(500, 1100).slow(33)).lpq(3).gain(0.36)
      const kick = note("c2*4").s("sine").decay(0.17).sustain(0).gain(0.8)
      const hats = s("[~ white]*4").decay(0.04).sustain(0).hpf(6500).gain(0.05)
      const hats16 = s("white*16").decay(0.02).sustain(0).hpf(6800).gain("[0.02 0.035 0.05 0.035]*4")
      const clap = s("~ pink ~ pink").decay(0.12).sustain(0).hpf(1400).lpf(6000).gain(0.14).room(0.35)
      const pluck = note("<[e4 b4 g4 e5 b4 g4 e5 b4] [c4 g4 e4 c5 g4 e4 c5 g4] [g4 d5 b4 g5 d5 b4 g5 d5] [d4 a4 fs4 d5 a4 fs4 d5 a4]>")
        .s("triangle").decay(0.11).sustain(0).lpf(3200).gain(0.12)
        .delay(0.3).delaytime(0.341).delayfeedback(0.35).pan(sine.range(0.3, 0.7).slow(2))
      const lead = note("<[b4 ~ ~ e5 ~ d5 b4 ~] [g4 ~ ~ c5 ~ b4 g4 ~] [d5 ~ ~ g5 ~ fs5 d5 ~] [a4 ~ ~ d5 ~ e5 fs5 ~]>")
        .s("square").decay(0.2).sustain(0.25).release(0.15).lpf(2200).gain(0.075).room(0.4)
        .delay(0.25).delaytime(0.455).delayfeedback(0.3)
      const sparkle = note("<[e6 b5]*4 [g6 e6]*4 [d6 b5]*4 [fs6 a5]*4>").s("sine")
        .decay(0.06).sustain(0).gain(0.045).delay(0.35).delaytime(0.227).delayfeedback(0.4)
    `,
    song: `arrange(
      [5, stack(pad, bass, kick, hats)],
      [8, stack(pad, bass, kick, hats, clap, pluck)],
      [10, stack(pad, bass, kick, hats16, clap, pluck, lead)],
      [10, stack(pad, bass, kick, hats16, clap, pluck, lead, sparkle)]
    )`,
  },

  create({ rng, W, H }) {
    const art = rng.fork('art');
    const sky = paintSky(W, H, art);
    const moon = paintMoon();
    const far = paintTreeline(W + 60, 190, art, '#2c1f4c', 'rgba(255,140,120,0.35)', 0.08, 0.8);
    const near = paintTreeline(W + 120, 190, art, '#15132c', 'rgba(255,120,110,0.18)', 0.12, 1.3);
    const meadow = paintMeadow(W, art);
    const jarArt = paintJar();
    const flyArt = paintFirefly();
    const waspArt = paintWasp();
    const flyGlow = glowSprite('rgba(216,255,90,1)', 26);
    const jarGlow = glowSprite('rgba(210,255,120,1)', 70);
    const moonGlow = glowSprite('rgba(255,236,200,1)', 60);
    const redGlow = glowSprite('rgba(255,70,40,1)', 22);
    const vignette = vignetteSprite(W, H, 0.6, '4,2,14');

    const jar = createMover({ x: W / 2, minX: 24, maxX: W - 24, speed: SPEED, accel: 18 });
    const fx = createParticles();
    const trails = createParticles();
    const flies = [];
    const wasps = [];
    const plan = []; // upcoming arrivals, generated ahead of time from the rng only
    const inJar = []; // cosmetic fireflies bumbling around inside the glass
    const blades = Array.from({ length: 46 }, (_, i) => ({ x: (i / 45) * W + art.range(-4, 4), h: art.range(14, 30), ph: art.range(0, 6.28), y: art.range(598, 640) }));
    const ambient = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: 300 + Math.random() * 230, ph: Math.random() * 6.28, sp: 0.5 + Math.random() }));

    let caught = 0;
    let clock = 0;
    let night = 0;
    let lastT = 0;
    let lastX = W / 2;
    let flash = 0;
    let escapee = null;

    function schedule(until) {
      while (lastT < until) {
        const first = lastT === 0;
        const p = progress(lastT, 60, 1.3);
        const dT = first ? 2.7 : lerp(1.15, 0.46, p) * rng.range(0.82, 1.2);
        const ratio = rng.range(lerp(0.12, 0.45, p), lerp(0.55, 0.88, p));
        const T = lastT + dT;
        let dx = first ? rng.range(-60, 60) : ratio * REACH * dT * (rng.chance(0.5) ? -1 : 1);
        let X = lastX + dx;
        if (X < 30 || X > W - 30) X = lastX - dx; // bounce off the edge instead of shrinking the move
        X = clamp(X, 30, W - 30);
        const vy = lerp(150, 290, p) * rng.range(0.9, 1.1);
        const amp = rng.range(12, lerp(28, 60, p));
        plan.push({ kind: 'fly', T, X, vy, amp, w: rng.range(1.4, 2.8), ph: rng.range(0, 6.28) });

        // a wasp arriving between this firefly and the next, always well off the direct path
        if (!first && lastT > 7 && rng.chance(lerp(0.2, 0.75, p))) {
          plan.push({ kind: 'wasp', after: { T, X }, before: { T: lastT, X: lastX }, vy: vy * rng.range(1.05, 1.2), pick: rng.next(), ph: rng.range(0, 6.28) });
        }
        lastT = T;
        lastX = X;
      }
    }

    // Wasps are placed once both neighbours are known: outside the span the jar must sweep.
    function placeWasp(wp) {
      const a = wp.before;
      const b = wp.after;
      const lo = Math.min(a.X, b.X) - 64;
      const hi = Math.max(a.X, b.X) + 64;
      const left = Math.max(0, lo - 26);
      const right = Math.max(0, W - 26 - hi);
      if (left + right < 1) return null;
      const u = wp.pick * (left + right);
      const X = u < left ? 26 + u : hi + (u - left);
      const T = lerp(a.T, b.T, 0.5);
      return { T, X, vy: wp.vy, ph: wp.ph };
    }

    schedule(6);

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        night = clamp(t / 60, 0, 1);
        schedule(t + 5);

        // launch whatever needs to enter the screen now
        for (let i = plan.length - 1; i >= 0; i--) {
          const e = plan[i];
          const T = e.kind === 'fly' ? e.T : lerp(e.before.T, e.after.T, 0.5);
          if (t < T - (CATCH_Y + 40) / e.vy) continue;
          plan.splice(i, 1);
          if (e.kind === 'fly') flies.push({ ...e, x: e.X, y: -40, blink: Math.random() * 6 });
          else {
            const w = placeWasp(e);
            if (w) wasps.push({ ...w, x: w.X, y: -40 });
          }
        }

        jar.update(dt, dir);

        for (let i = flies.length - 1; i >= 0; i--) {
          const f = flies[i];
          const left = f.T - t;
          f.y = CATCH_Y - f.vy * left;
          // wander on the way down, settling onto its line as it nears the jar
          f.x = clamp(f.X + f.amp * Math.sin(f.w * left + f.ph) * clamp(left / 1.1, 0, 1), 12, W - 12);
          if (Math.random() < 0.25) trails.burst(f.x, f.y + 3, { count: 1, speed: 6, life: 0.5, size: 2.2, round: true, colors: ['rgba(216,255,90,0.9)', 'rgba(255,255,200,0.8)'] });
          if (f.y >= CATCH_Y - 14 && f.y <= CATCH_Y + 16 && Math.abs(f.x - jar.x) <= MOUTH) {
            flies.splice(i, 1);
            caught++;
            flash = 1;
            if (inJar.length < 30) inJar.push({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, ph: Math.random() * 6 });
            fx.burst(f.x, CATCH_Y, { count: 14, speed: 90, life: 0.5, size: 2.6, round: true, drag: 3, colors: ['#e4ff6a', '#ffffff', '#fff3a0'] });
          } else if (f.y > CATCH_Y + 16) {
            this.dead = true;
            this.deathReason = `A firefly slipped past the jar — ${caught} caught.`;
            escapee = f;
            flies.splice(i, 1);
          }
        }

        for (let i = wasps.length - 1; i >= 0; i--) {
          const w = wasps[i];
          w.y = CATCH_Y - w.vy * (w.T - t);
          w.x = w.X + Math.sin(clock * 22 + w.ph) * 2.5;
          if (w.y > H + 40) wasps.splice(i, 1);
          else if (Math.abs(w.y - (PLAYER_Y - 4)) < 30 && Math.abs(w.x - jar.x) < MOUTH + 9) {
            this.dead = true;
            this.deathReason = `Scooped up a wasp. Ouch — ${caught} fireflies caught.`;
            fx.burst(jar.x, PLAYER_Y, { count: 40, speed: 190, life: 1, size: 3, drag: 1.5, colors: ['#d8f0ff', '#ffffff', '#9ad0ff'] });
            fx.burst(w.x, w.y, { count: 20, speed: 120, life: 0.8, size: 3, colors: ['#ffd21f', '#1a1208', '#ff5a3a'] });
          }
        }

        if (this.dead) {
          // everyone in the jar gets out
          for (const b of inJar) fx.burst(jar.x + b.x, PLAYER_Y + b.y, { count: 2, speed: 140, life: 1.6, size: 3, round: true, angle: -Math.PI / 2, spread: 2.4, colors: ['#e4ff6a', '#fff3a0'] });
          inJar.length = 0;
        }

        for (const b of inJar) {
          b.vx += (Math.random() - 0.5) * 200 * dt;
          b.vy += (Math.random() - 0.5) * 200 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (Math.abs(b.x) > 14) (b.x = Math.sign(b.x) * 14), (b.vx *= -0.6);
          if (b.y < -12 || b.y > 20) (b.y = clamp(b.y, -12, 20)), (b.vy *= -0.6);
        }
        flash = Math.max(0, flash - dt * 4);
        fx.update(dt);
        trails.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        if (escapee) {
          escapee.y += escapee.vy * dt * 0.4;
          escapee.x += Math.sin(clock * 3) * 40 * dt;
          if (Math.random() < 0.5) trails.burst(escapee.x, escapee.y, { count: 1, speed: 6, life: 0.6, size: 2.4, round: true, colors: ['#e4ff6a'] });
        }
        for (const w of wasps) w.y += w.vy * dt * 0.5;
        fx.update(dt, -20);
        trails.update(dt);
      },

      render(g) {
        const pan = jar.x - W / 2;
        drawSprite(g, sky, W / 2, H / 2);
        // night falls over the minute
        g.fillStyle = `rgba(6,4,20,${0.45 * night})`;
        g.fillRect(0, 0, W, 480);
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, moonGlow, 70 - pan * 0.03, 96, { size: 150, alpha: 0.25 + 0.2 * night });
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, moon, 70 - pan * 0.03, 96, { size: 38 });
        drawSprite(g, far, W / 2 - pan * 0.08, 415);
        // distant fireflies twinkling over the fields
        g.globalCompositeOperation = 'lighter';
        for (const a of ambient) {
          const k = Math.max(0, Math.sin(clock * a.sp * 2 + a.ph));
          if (k < 0.1) continue;
          drawSprite(g, flyGlow, a.x - pan * 0.12 + Math.sin(clock * 0.4 + a.ph) * 12, a.y + Math.cos(clock * 0.5 + a.ph) * 6, { size: 10, alpha: 0.5 * k });
        }
        g.globalCompositeOperation = 'source-over';
        drawSprite(g, near, W / 2 - pan * 0.16, 475);
        drawSprite(g, meadow, W / 2 - pan * 0.25, 575);

        // the jar's light on the grass
        const glow = Math.min(1, 0.25 + caught * 0.03) + flash * 0.4;
        g.globalCompositeOperation = 'lighter';
        drawSprite(g, jarGlow, jar.x, PLAYER_Y + 4, { size: 150 + caught * 2, alpha: 0.18 * glow });
        g.globalCompositeOperation = 'source-over';

        // wasps: a faint red warning halo so they never read as fireflies
        for (const w of wasps) {
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, redGlow, w.x, w.y, { size: 54, alpha: 0.45 + 0.15 * Math.sin(clock * 10 + w.ph) });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, waspArt, w.x, w.y, { size: 38, rot: Math.sin(clock * 16 + w.ph) * 0.08 });
        }

        trails.render(g, true);

        // fireflies, with a little marker on the grass showing where each one will come down
        const all = escapee ? [...flies, escapee] : flies;
        g.globalCompositeOperation = 'lighter';
        for (const f of flies) {
          const near = clamp(1 - (f.T - clock) / 2.5, 0, 1);
          if (near > 0) drawSprite(g, flyGlow, f.X, CATCH_Y + 34, { size: 26, alpha: 0.35 * near });
        }
        for (const f of all) {
          const pulse = 0.75 + 0.25 * Math.sin(clock * 7 + f.blink);
          drawSprite(g, flyGlow, f.x, f.y + 3, { size: 56 * pulse, alpha: 0.85 });
        }
        g.globalCompositeOperation = 'source-over';
        for (const f of all) drawSprite(g, flyArt, f.x, f.y, { size: 26, rot: Math.sin(clock * 5 + f.blink) * 0.25 });

        // swaying grass behind the jar
        g.strokeStyle = 'rgba(20,22,48,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        for (const b of blades) {
          if (b.y > 612) continue;
          const sway = Math.sin(clock * 1.6 + b.ph) * 4;
          g.moveTo(b.x, b.y);
          g.quadraticCurveTo(b.x + sway * 0.4, b.y - b.h * 0.5, b.x + sway, b.y - b.h);
        }
        g.stroke();

        // the jar and its catch
        if (!this.dead || escapee) {
          g.globalCompositeOperation = 'lighter';
          for (const b of inJar) {
            const k = 0.6 + 0.4 * Math.sin(clock * 6 + b.ph);
            drawSprite(g, flyGlow, jar.x + b.x, PLAYER_Y + b.y, { size: 16 * k, alpha: 0.9 });
          }
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, jarArt, jar.x, PLAYER_Y, { size: 52, rot: jar.lean * 0.12 });
        }

        fx.render(g, true);

        // grass in front
        g.strokeStyle = 'rgba(10,10,26,1)';
        g.lineWidth = 2.4;
        g.beginPath();
        for (const b of blades) {
          if (b.y <= 612) continue;
          const sway = Math.sin(clock * 1.6 + b.ph) * 5;
          g.moveTo(b.x, b.y);
          g.quadraticCurveTo(b.x + sway * 0.4, b.y - b.h * 0.5, b.x + sway, b.y - b.h);
        }
        g.stroke();

        drawSprite(g, vignette, W / 2, H / 2);
      },
    };
    return game;
  },
};
