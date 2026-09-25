// Quiz Highway — each gate asks a question; drive through the lane with the right answer.
// More lanes, less reading time and harder questions as the clock runs. Roadblocks in between.

import {
  createMover,
  createParticles,
  circleRect,
  progress,
  lerp,
  wrapText,
  makeSprite,
  drawSprite,
  glowSprite,
  vignetteSprite,
} from '../engine/kit.js';
import { BODY_FONT } from '../engine/stage.js';

const PLAYER_Y = 548;
const GATE_Y = 175; // gates materialize just below the question banner

// [question, correct, ...wrong]  (answers kept short so four fit side by side)
const EASY = [
  ['Capital of France?', 'Paris', 'Lyon', 'Nice', 'Lille'],
  ['7 × 8 = ?', '56', '54', '64', '48'],
  ['Largest planet?', 'Jupiter', 'Saturn', 'Earth', 'Neptune'],
  ['Fastest land animal?', 'Cheetah', 'Lion', 'Horse', 'Gazelle'],
  ['How many legs does a spider have?', '8', '6', '10', '12'],
  ['Which one is a mammal?', 'Whale', 'Shark', 'Trout', 'Squid'],
  ['Opposite of “ephemeral”?', 'Eternal', 'Brief', 'Fleeting', 'Passing'],
  ['H₂O is…', 'Water', 'Salt', 'Oxygen', 'Sugar'],
  ['√81 = ?', '9', '8', '7', '12'],
  ['Planet closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'],
  ['15 + 27 = ?', '42', '41', '43', '32'],
  ['Days in a leap year?', '366', '365', '364', '360'],
  ['Egypt is in…', 'Africa', 'Asia', 'Europe', 'Oceania'],
  ['A baby cat is a…', 'Kitten', 'Cub', 'Pup', 'Foal'],
  ['How many continents?', '7', '5', '6', '8'],
];

const MEDIUM = [
  ['Capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['Chemical symbol for gold?', 'Au', 'Ag', 'Go', 'Gd'],
  ['13 × 7 = ?', '91', '81', '93', '87'],
  ['Who painted the Mona Lisa?', 'Da Vinci', 'Picasso', 'Monet', 'Van Gogh'],
  ['Smallest prime number?', '2', '1', '3', '0'],
  ['Longest river in Africa?', 'Nile', 'Congo', 'Niger', 'Zambezi'],
  ['Year the Berlin Wall fell?', '1989', '1991', '1985', '1979'],
  ['Largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
  ['2⁸ = ?', '256', '128', '512', '64'],
  ['Who wrote “1984”?', 'Orwell', 'Huxley', 'Kafka', 'Camus'],
  ['Capital of Canada?', 'Ottawa', 'Toronto', 'Montreal', 'Quebec'],
  ['First Moon landing?', '1969', '1967', '1971', '1965'],
  ['1000 in Roman numerals?', 'M', 'D', 'C', 'K'],
  ['1, 1, 2, 3, 5, 8, …?', '13', '11', '12', '16'],
  ['Adult mayflies live about…', 'A day', 'A week', 'A month', 'A year'],
  ['Hardest natural material?', 'Diamond', 'Quartz', 'Iron', 'Granite'],
];

const HARD = [
  ['17 × 23 = ?', '391', '381', '401', '371'],
  ['Capital of Kazakhstan?', 'Astana', 'Almaty', 'Bishkek', 'Tashkent'],
  ['√1369 = ?', '37', '33', '39', '43'],
  ['Largest desert on Earth?', 'Antarctica', 'Sahara', 'Gobi', 'Arabian'],
  ['How many hearts does an octopus have?', '3', '1', '2', '8'],
  ['Element with symbol W?', 'Tungsten', 'Tin', 'Xenon', 'Titanium'],
  ['111 × 111 = ?', '12321', '11111', '12221', '13431'],
  ['Smallest country?', 'Vatican', 'Monaco', 'Malta', 'Nauru'],
  ['3⁵ = ?', '243', '125', '81', '729'],
  ['Who composed “The Four Seasons”?', 'Vivaldi', 'Bach', 'Mozart', 'Handel'],
  ['Capital of Nigeria?', 'Abuja', 'Lagos', 'Accra', 'Kano'],
  ['Which number is prime?', '97', '91', '87', '93'],
  ['Bones in an adult human?', '206', '212', '198', '186'],
  ['Year of the French Revolution?', '1789', '1776', '1799', '1815'],
  ['Most spoken native language?', 'Mandarin', 'English', 'Spanish', 'Hindi'],
  ['Speed of light, km/s?', '300,000', '150,000', '30,000', '3,000'],
];

// ---------- art ----------

const LANE_COLORS = ['255,107,214', '126,224,255', '255,211,107', '157,123,255'];

function paintCar() {
  return makeSprite(36, 60, (g) => {
    // body
    const body = g.createLinearGradient(-15, 0, 15, 0);
    body.addColorStop(0, '#b0217f');
    body.addColorStop(0.3, '#ff5fcf');
    body.addColorStop(0.55, '#ffa3e6');
    body.addColorStop(1, '#a01a72');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(-9, -27);
    g.quadraticCurveTo(0, -30, 9, -27);
    g.quadraticCurveTo(15, -22, 15, -10);
    g.lineTo(15, 18);
    g.quadraticCurveTo(15, 27, 8, 28);
    g.lineTo(-8, 28);
    g.quadraticCurveTo(-15, 27, -15, 18);
    g.lineTo(-15, -10);
    g.quadraticCurveTo(-15, -22, -9, -27);
    g.fill();
    g.strokeStyle = 'rgba(60,0,40,0.6)';
    g.lineWidth = 1;
    g.stroke();
    // windshield, roof, rear window
    const glass = g.createLinearGradient(0, -16, 0, -4);
    glass.addColorStop(0, '#2a1a55');
    glass.addColorStop(1, '#0c0620');
    g.fillStyle = glass;
    g.beginPath();
    g.moveTo(-10, -6);
    g.quadraticCurveTo(0, -20, 10, -6);
    g.lineTo(8, -2);
    g.lineTo(-8, -2);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(160,230,255,0.55)';
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(-2, -13);
    g.lineTo(0, -12);
    g.lineTo(-4, -7);
    g.fill();
    g.fillStyle = '#d93aa6';
    g.fillRect(-8, -2, 16, 12);
    g.fillStyle = '#1a0f36';
    g.fillRect(-8, 10, 16, 6);
    // spoiler, lights
    g.fillStyle = '#6a0f4c';
    g.fillRect(-14, 23, 28, 4);
    g.fillStyle = '#ff2a4a';
    g.fillRect(-13, 26, 7, 2.5);
    g.fillRect(6, 26, 7, 2.5);
    g.fillStyle = '#fffbe0';
    g.fillRect(-11, -27, 6, 3);
    g.fillRect(5, -27, 6, 3);
  });
}

function paintBackground(W, H) {
  return makeSprite(W, H, (g) => {
    g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#241250');
    sky.addColorStop(0.45, '#150c2e');
    sky.addColorStop(1, '#0b0719');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // sidewalk strips with neon kerbs
    for (const x of [0, W - 16]) {
      g.fillStyle = '#0a0616';
      g.fillRect(x, 0, 16, H);
    }
  }, 1);
}

// ---------- the game ----------

export default {
  id: 'quiz',
  title: 'Quiz Highway',
  emoji: '🧠',
  tagline: 'Each gate asks a question. Drive through the right answer — and dodge the roadblocks in between.',
  colors: { bg: '#140e26', fg: '#f6f1ff', accent: '#ff6bd6' },

  create({ rng, W, H, sfx }) {
    const carArt = paintCar();
    const bg = paintBackground(W, H);
    const pinkGlow = glowSprite('rgba(255,90,200,1)', 40);
    const amber = glowSprite('rgba(255,180,80,1)', 14);
    const cyanGlow = glowSprite('rgba(126,224,255,1)', 16);
    const vignette = vignetteSprite(W, H, 0.5, '8,4,20');
    const bokeh = Array.from({ length: 22 }, () => ({
      x: Math.random() < 0.5 ? Math.random() * 14 : W - Math.random() * 14,
      y: Math.random() * H,
      z: 0.4 + Math.random() * 0.8,
      c: Math.random() < 0.5 ? pinkGlow : cyanGlow,
    }));

    const car = createMover({ x: W / 2, minX: 26, maxX: W - 26, speed: 340, accel: 24 });
    const fx = createParticles();
    const trail = createParticles();
    const pools = [rng.shuffle(EASY), rng.shuffle(MEDIUM), rng.shuffle(HARD)];
    const gates = [];
    const blocks = [];
    const popups = [];
    const snd = {
      purr: sfx.loop({ wave: 'triangle', freq: 72, lowpass: 380, volume: 0.28 }),
      appear: sfx.sound({ wave: 'sine', freq: 660, freqEnd: 990, sustain: 0.05, release: 0.15, volume: 0.35 }),
      ding: sfx.sound({ wave: 'triangle', freq: 1046.5, sustain: 0.06, release: 0.35, volume: 0.5 }),
      buzz: sfx.sound({ wave: 'square', freq: 190, freqEnd: 120, sustain: 0.3, release: 0.15, volume: 0.35, lowpass: 1400 }),
      crash: sfx.sound({ wave: 'noise', freq: 1400, freqEnd: 90, sustain: 0.1, release: 0.6, volume: 0.8 }),
      hurry: sfx.sound({ wave: 'square', freq: 1500, sustain: 0.03, release: 0.04, volume: 0.18, lowpass: 4000 }),
    };
    let scroll = 92;
    let dist = 0;
    let gateIn = 0.4;
    let answered = 0;
    let clock = 0;
    let flash = null; // { lane, n, ok, t }

    function nextQuestion(t) {
      const tier = t < 14 ? 0 : t < 34 ? 1 : 2;
      const pool = pools[tier];
      const q = pool.shift();
      pool.push(q);
      return q;
    }

    function spawnGate(t) {
      const n = t < 12 ? 2 : t < 30 ? 3 : 4;
      const [question, correct, ...wrong] = nextQuestion(t);
      const answers = rng.shuffle([correct, ...rng.shuffle(wrong).slice(0, n - 1)]);
      gates.push({ y: GATE_Y, n, question, answers, correct: answers.indexOf(correct), crossed: false, alpha: 0, age: 0, hurried: false });
      sfx.play(snd.appear);
      // roadblocks appear between the new gate and the car: dodge, then pick your lane
      if (t > 14) spawnBlock(rng.range(310, 350), t);
      if (t > 40) spawnBlock(rng.range(410, 440), t);
    }

    function spawnBlock(y, t) {
      const w = rng.range(70, lerp(100, 150, progress(t)));
      blocks.push({ x: rng.range(0, W - w), y, w, h: 22, alpha: 0 });
    }

    function crash(reason, sound) {
      sfx.play(sound);
      if (sound !== snd.crash) sfx.play(snd.crash, { volume: 0.5 });
      game.dead = true;
      game.deathReason = reason;
      fx.burst(car.x, PLAYER_Y, { count: 60, speed: 280, life: 1, size: 4, round: true, drag: 1.5, colors: ['#ff4f6d', '#ffffff', '#ffb36b', '#ff6bd6'] });
    }

    const game = {
      dead: false,
      deathReason: '',

      update(dt, dir, t) {
        clock += dt;
        const p = progress(t, 60, 1.3);
        scroll = lerp(92, 172, p); // reading time per gate: ~4.3s → ~2.3s
        dist += scroll * dt;

        if (!gates.some((gt) => !gt.crossed)) {
          gateIn -= dt;
          if (gateIn <= 0) spawnGate(t);
        }

        car.update(dt, dir);
        snd.purr.set({ pitch: 0.8 + (scroll / 172) * 0.5 + Math.abs(car.lean) * 0.15 });

        for (const gt of gates) {
          gt.y += scroll * dt;
          gt.age += dt;
          if (!gt.crossed && !gt.hurried && (PLAYER_Y - gt.y) / (PLAYER_Y - GATE_Y) < 0.3) {
            gt.hurried = true;
            sfx.play(snd.hurry);
            sfx.play(snd.hurry, { delay: 0.12 });
          }
          if (!gt.crossed && gt.y >= PLAYER_Y) {
            gt.crossed = true;
            gateIn = 0.25;
            const lane = Math.min(gt.n - 1, Math.floor(car.x / (W / gt.n)));
            const ok = lane === gt.correct;
            flash = { lane, n: gt.n, ok, t: 0.5 };
            if (ok) {
              answered++;
              sfx.play(snd.ding);
              sfx.play(snd.ding, { pitch: 1.5, delay: 0.08 });
              popups.push({ x: car.x, y: PLAYER_Y - 40, life: 0.9, text: '✓' });
              fx.burst(car.x, PLAYER_Y - 20, { count: 34, speed: 240, life: 0.7, size: 4, round: true, drag: 2, colors: ['#6bffb8', '#ffffff', '#7ee0ff'] });
            } else {
              crash(`Wrong answer — “${gt.question}” It was ${gt.answers[gt.correct]}.`, snd.buzz);
            }
          }
          if (gt.crossed) gt.alpha -= dt * 2.5;
          else gt.alpha = Math.min(1, gt.alpha + dt * 4);
        }
        for (let i = gates.length - 1; i >= 0; i--) if (gates[i].alpha <= 0) gates.splice(i, 1);

        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          b.y += scroll * dt;
          b.alpha = Math.min(1, b.alpha + dt * 4);
          if (b.y > H) blocks.splice(i, 1);
          else if (!this.dead && circleRect(car.x, PLAYER_Y, 11, b.x, b.y, b.w, b.h)) {
            crash(`Crashed into a roadblock after ${answered} correct answer${answered === 1 ? '' : 's'}.`, snd.crash);
          }
        }

        for (const b of bokeh) {
          b.y += scroll * b.z * dt;
          if (b.y > H + 20) b.y -= H + 40;
        }
        for (const pop of popups) {
          pop.life -= dt;
          pop.y -= 40 * dt;
        }
        if (flash) flash.t -= dt;
        trail.burst(car.x + (Math.random() < 0.5 ? -9 : 9), PLAYER_Y + 28, { count: 1, speed: 20, life: 0.35, size: 3, round: true, angle: Math.PI / 2, spread: 0.3, colors: ['#ff2a4a', '#ff6b8b'] });
        trail.update(dt, scroll);
        fx.update(dt);
      },

      afterlife(dt) {
        clock += dt;
        fx.update(dt);
        trail.update(dt);
        if (flash) flash.t = Math.max(flash.t - dt * 0.3, 0.2);
      },

      render(g) {
        g.drawImage(bg.canvas, 0, 0, W, H);

        // scrolling grid that fades out towards the top
        const spacing = 48;
        for (let y = (dist % spacing) - spacing; y < H; y += spacing) {
          g.fillStyle = `rgba(255,107,214,${0.05 + 0.13 * (y / H)})`;
          g.fillRect(16, y, W - 32, 1.5);
        }
        g.fillStyle = 'rgba(126,224,255,0.07)';
        for (let x = 16 + 41; x < W - 16; x += 41) g.fillRect(x, 0, 1, H);

        // neon kerbs and city lights
        g.globalCompositeOperation = 'lighter';
        for (const b of bokeh) drawSprite(g, b.c, b.x, b.y, { size: 24 * b.z, alpha: 0.45 });
        g.fillStyle = 'rgba(255,107,214,0.9)';
        g.fillRect(15, 0, 2, H);
        g.fillStyle = 'rgba(126,224,255,0.9)';
        g.fillRect(W - 17, 0, 2, H);
        g.fillStyle = 'rgba(255,107,214,0.15)';
        g.fillRect(12, 0, 8, H);
        g.fillStyle = 'rgba(126,224,255,0.15)';
        g.fillRect(W - 20, 0, 8, H);
        g.globalCompositeOperation = 'source-over';

        if (flash && flash.t > 0) {
          const lw = W / flash.n;
          const col = flash.ok ? '107,255,184' : '255,79,109';
          const grad = g.createLinearGradient(0, H, 0, 0);
          grad.addColorStop(0, `rgba(${col},${flash.t * 0.6})`);
          grad.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = grad;
          g.fillRect(flash.lane * lw, 0, lw, H);
        }

        // lane guides from the next gate down to the car
        const active = gates.find((gt) => !gt.crossed);
        if (active) {
          const lw = W / active.n;
          g.fillStyle = `rgba(246,241,255,${0.22 * active.alpha})`;
          for (let i = 1; i < active.n; i++) {
            for (let y = active.y + 30 + ((dist * 1.5) % 36); y < H; y += 36) g.fillRect(i * lw - 1.5, y, 3, 16);
          }
        }

        // roadblocks
        for (const b of blocks) {
          g.globalAlpha = b.alpha;
          g.save();
          g.beginPath();
          g.roundRect(b.x, b.y, b.w, b.h, 5);
          g.clip();
          g.fillStyle = '#ff9a3c';
          g.fillRect(b.x, b.y, b.w, b.h);
          g.fillStyle = '#1b1030';
          for (let x = b.x - 20; x < b.x + b.w; x += 20) {
            g.beginPath();
            g.moveTo(x, b.y + b.h);
            g.lineTo(x + 10, b.y);
            g.lineTo(x + 18, b.y);
            g.lineTo(x + 8, b.y + b.h);
            g.fill();
          }
          const shine = g.createLinearGradient(0, b.y, 0, b.y + b.h);
          shine.addColorStop(0, 'rgba(255,255,255,0.35)');
          shine.addColorStop(0.5, 'rgba(255,255,255,0)');
          shine.addColorStop(1, 'rgba(0,0,0,0.3)');
          g.fillStyle = shine;
          g.fillRect(b.x, b.y, b.w, b.h);
          g.restore();
          const on = Math.sin(clock * 10) > 0;
          g.globalCompositeOperation = 'lighter';
          drawSprite(g, amber, b.x + 6, b.y - 2, { size: on ? 30 : 18 });
          drawSprite(g, amber, b.x + b.w - 6, b.y - 2, { size: on ? 18 : 30 });
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        }

        // gates
        for (const gt of gates) {
          const lw = W / gt.n;
          const a = Math.max(0, gt.alpha);
          const glitch = Math.max(0, 1 - gt.age / 0.4);
          for (let i = 0; i < gt.n; i++) {
            const col = LANE_COLORS[i];
            const x = i * lw + 5 + (glitch ? (Math.random() - 0.5) * 14 * glitch : 0);
            const y = gt.y - 26;
            const w = lw - 10;
            const fill = g.createLinearGradient(0, y, 0, y + 52);
            fill.addColorStop(0, `rgba(${col},${0.34 * a})`);
            fill.addColorStop(1, `rgba(${col},${0.1 * a})`);
            g.fillStyle = fill;
            g.beginPath();
            g.roundRect(x, y, w, 52, 10);
            g.fill();
            g.strokeStyle = `rgba(${col},${0.25 * a})`;
            g.lineWidth = 7;
            g.stroke();
            g.strokeStyle = `rgba(${col},${a})`;
            g.lineWidth = 2;
            g.stroke();

            let size = 18;
            g.font = `800 ${size}px ${BODY_FONT}`;
            while (g.measureText(gt.answers[i]).width > w - 12 && size > 10) {
              size--;
              g.font = `800 ${size}px ${BODY_FONT}`;
            }
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.shadowColor = `rgba(${col},1)`;
            g.shadowBlur = 10;
            g.fillStyle = `rgba(255,255,255,${a})`;
            g.fillText(gt.answers[i], x + w / 2, gt.y + 1);
            g.shadowBlur = 0;
          }
          g.globalCompositeOperation = 'lighter';
          for (let i = 1; i < gt.n; i++) {
            const px = i * lw;
            const pillar = g.createLinearGradient(px - 3, 0, px + 3, 0);
            pillar.addColorStop(0, `rgba(255,255,255,${0.1 * a})`);
            pillar.addColorStop(0.5, `rgba(255,255,255,${0.9 * a})`);
            pillar.addColorStop(1, `rgba(255,255,255,${0.1 * a})`);
            g.fillStyle = pillar;
            g.fillRect(px - 3, gt.y - 62, 6, 90);
            drawSprite(g, pinkGlow, px, gt.y - 62, { size: 34, alpha: a });
          }
          g.globalCompositeOperation = 'source-over';
        }

        trail.render(g, true);
        fx.render(g, true);

        // the car: headlights, underglow, body
        if (!this.dead) {
          g.globalCompositeOperation = 'lighter';
          const beam = g.createLinearGradient(0, PLAYER_Y - 150, 0, PLAYER_Y - 24);
          beam.addColorStop(0, 'rgba(255,250,220,0)');
          beam.addColorStop(1, 'rgba(255,250,220,0.22)');
          g.fillStyle = beam;
          for (const s of [-1, 1]) {
            const hx = car.x + 8 * s;
            g.beginPath();
            g.moveTo(hx - 3, PLAYER_Y - 24);
            g.lineTo(hx + 3, PLAYER_Y - 24);
            g.lineTo(hx + 16 + 8 * s, PLAYER_Y - 150);
            g.lineTo(hx - 16 + 8 * s, PLAYER_Y - 150);
            g.fill();
          }
          drawSprite(g, pinkGlow, car.x, PLAYER_Y + 4, { size: 90, alpha: 0.55 });
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, carArt, car.x, PLAYER_Y, { rot: car.lean * 0.16 });
        }

        for (const pop of popups) {
          if (pop.life <= 0) continue;
          g.globalAlpha = Math.min(1, pop.life * 2);
          g.fillStyle = '#6bffb8';
          g.font = `800 26px ${BODY_FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(pop.text, pop.x, pop.y);
          g.globalAlpha = 1;
        }

        drawSprite(g, vignette, W / 2, H / 2);

        // question banner, with a bar showing how long until the gate arrives
        if (active) {
          g.font = `700 18px ${BODY_FONT}`;
          const lines = wrapText(g, active.question, W - 60);
          const h = 44 + lines.length * 22;
          g.fillStyle = 'rgba(22,12,46,0.9)';
          g.beginPath();
          g.roundRect(16, 46, W - 32, h, 14);
          g.fill();
          const edge = g.createLinearGradient(16, 0, W - 16, 0);
          edge.addColorStop(0, '#ff6bd6');
          edge.addColorStop(1, '#7ee0ff');
          g.strokeStyle = edge;
          g.lineWidth = 1.5;
          g.stroke();

          g.fillStyle = '#ff6bd6';
          g.font = `800 11px ${BODY_FONT}`;
          g.textAlign = 'left';
          g.textBaseline = 'top';
          g.fillText(`QUESTION ${answered + 1}`, 30, 55);
          g.fillStyle = '#fff';
          g.font = `700 18px ${BODY_FONT}`;
          g.textAlign = 'center';
          lines.forEach((line, i) => g.fillText(line, W / 2, 72 + i * 22));

          const left = Math.max(0, (PLAYER_Y - active.y) / (PLAYER_Y - GATE_Y));
          g.fillStyle = 'rgba(255,255,255,0.1)';
          g.fillRect(30, 46 + h - 11, W - 60, 3);
          g.fillStyle = left > 0.3 ? '#7ee0ff' : '#ff4f6d';
          g.fillRect(30, 46 + h - 11, (W - 60) * left, 3);
        }
      },
    };
    return game;
  },
};
