// Sanity-checks game modules without a browser: runs full 60s games with simple bots
// against a fake canvas and reports crashes, unfair early deaths and non-determinism.
//
//   node scripts/check-game.mjs            # every game in schedule.js
//   node scripts/check-game.mjs heatwave   # one game
//
// Exits non-zero if any check fails. It does not judge fun or difficulty — play it for that.

import { createRng, seedFrom } from '../public/src/engine/rng.js';
import { GAMES } from '../public/src/schedule.js';
import { createSfx } from '../public/src/engine/sound.js';

const W = 360;
const H = 640;
const DURATION = 60;
const STEP = 1 / 120;

// ---------- a do-nothing canvas that accepts any drawing call ----------

const gradient = { addColorStop() {} };
function fakeContext(canvas) {
  const state = { canvas, font: '10px sans-serif' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 9 });
      if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (prop.startsWith?.('create')) return () => gradient;
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}
function fakeCanvas() {
  const canvas = { width: 300, height: 150 };
  const ctx = fakeContext(canvas);
  canvas.getContext = () => ctx;
  return canvas;
}
globalThis.document = { createElement: () => fakeCanvas() };

// ---------- bots ----------

const bots = {
  idle: () => 0,
  hugLeft: () => -1,
  sweep: (t) => (Math.floor(t / 1.1) % 2 ? -1 : 1),
  jitter: (t, rng) => (rng.next() < 0.5 ? -1 : 1) * (rng.next() < 0.8 ? 1 : 0),
};

function play(game, seed, bot) {
  const inst = game.create({ rng: createRng(seed), W, H, duration: DURATION, sfx: createSfx() }); // silent in Node
  const botRng = createRng(seed ^ 0x9e3779b9);
  const g = fakeCanvas().getContext('2d');
  let t = 0;
  let dir = 0;
  let step = 0;
  while (t < DURATION) {
    if (step % 12 === 0) dir = bot(t, botRng); // bots decide 10×/s
    inst.update(STEP, dir, t);
    t += STEP;
    if (step % 2 === 0) inst.render(g, t);
    step++;
    if (inst.dead) break;
  }
  if (inst.dead) {
    for (let i = 0; i < 120; i++) inst.afterlife?.(STEP);
    inst.render(g, t);
  }
  return { time: Math.min(t, DURATION), dead: inst.dead, reason: inst.deathReason };
}

// ---------- checks ----------

const REQUIRED = ['id', 'title', 'emoji', 'tagline', 'colors', 'create'];

async function check(id) {
  const problems = [];
  const game = (await import(`../public/src/games/${id}.js`)).default;
  for (const key of REQUIRED) if (!game?.[key]) problems.push(`missing "${key}" in the default export`);
  if (game.id !== id) problems.push(`id "${game.id}" doesn't match the file name "${id}"`);
  for (const c of ['bg', 'fg', 'accent']) if (!/^#[0-9a-f]{6}$/i.test(game.colors?.[c] ?? '')) problems.push(`colors.${c} must be a #rrggbb hex`);
  if (game.title?.length > 16) problems.push(`title is ${game.title.length} chars; keep it ≤ 16 so the intro stays legible`);
  if (problems.length) return { id, problems, lines: [] };

  const lines = [];
  for (const [name, bot] of Object.entries(bots)) {
    const times = [];
    const reasons = new Map();
    for (let i = 0; i < 12; i++) {
      const seed = seedFrom(`check-${i}:${id}`);
      let result;
      try {
        result = play(game, seed, bot);
      } catch (e) {
        problems.push(`${name} bot, run ${i}: crashed — ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
        break;
      }
      if (result.dead && !result.reason) problems.push(`${name} bot, run ${i}: died without a deathReason`);
      if (result.dead && result.time < 2) problems.push(`${name} bot, run ${i}: died at ${result.time.toFixed(2)}s — nothing should be able to kill you in the first 2s`);
      times.push(result.time);
      if (result.dead) reasons.set(result.reason.split('—')[0].trim(), (reasons.get(result.reason.split('—')[0].trim()) || 0) + 1);
    }
    if (!times.length) continue;
    times.sort((a, b) => a - b);
    const survived = times.filter((x) => x >= DURATION).length;
    lines.push(
      `  ${name.padEnd(8)} median ${times[times.length >> 1].toFixed(1).padStart(4)}s  best ${times.at(-1).toFixed(1).padStart(4)}s  survived ${survived}/${times.length}` +
        (reasons.size ? `  (${[...reasons].map(([r, n]) => `${n}× ${r}`).join(', ')})` : ''),
    );
    if (name !== 'idle' && survived > times.length / 2) problems.push(`${name} bot survives most runs — the game is probably far too easy`);
  }

  // same seed + same inputs must give the same run
  const seed = seedFrom(`determinism:${id}`);
  const a = play(game, seed, bots.jitter);
  const b = play(game, seed, bots.jitter);
  if (a.time !== b.time || a.reason !== b.reason) problems.push(`not deterministic: same seed and inputs gave ${a.time.toFixed(2)}s vs ${b.time.toFixed(2)}s — gameplay must only use the rng passed to create()`);

  return { id, problems, lines };
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : GAMES;
let failed = false;
for (const id of ids) {
  let res;
  try {
    res = await check(id);
  } catch (e) {
    res = { id, problems: [`failed to load: ${e.message}`], lines: [] };
  }
  console.log(`${res.problems.length ? '✗' : '✓'} ${id}`);
  for (const line of res.lines) console.log(line);
  for (const p of res.problems) console.log(`  ! ${p}`);
  if (res.problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
