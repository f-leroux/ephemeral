// App flow: home → intro → countdown + play → results.
//
// URL flags for development:
//   ?dev              unlimited tries, scores go to a separate "dev-" bucket
//   ?dev&game=quiz    force a game module
//   ?dev&date=2026-10-01  pretend it's another day

import { dateKey, dayNumber, prettyDate, msUntilTomorrow, formatCountdown } from './engine/day.js';
import { seedFrom } from './engine/rng.js';
import { runGame } from './engine/loop.js';
import { playIntro, startAmbient } from './engine/intro.js';
import { submitScore, fetchStats } from './engine/api.js';
import { renderResults, shareText } from './engine/results.js';
import { GAMES, gameIdFor, loadGame } from './schedule.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const DAY = (DEV && params.get('date')) || dateKey();
const DAY_NUM = dayNumber(DAY);
const SCORE_DAY = DEV ? `dev-${DAY}` : DAY;
const STORE_KEY = `ephemeral:${DAY}`;

const canvas = $('stage');
let gameId = (DEV && params.get('game')) || gameIdFor(DAY, DAY_NUM);
let game;
let stopAmbient = null;
let lastResult = null;

// ---------- persistence (one try per day) ----------

function loadState() {
  if (DEV) return null;
  try {
    const state = JSON.parse(localStorage.getItem(STORE_KEY));
    // A run saved for a different game (the schedule changed) doesn't count.
    return state?.gameId === gameId ? state : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  if (DEV) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage disabled: the one-try rule just can't be enforced.
  }
}

// ---------- screens ----------

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
}

function ambient(on) {
  if (on && !stopAmbient) stopAmbient = startAmbient(canvas);
  if (!on && stopAmbient) {
    stopAmbient();
    stopAmbient = null;
  }
}

function showHome() {
  const state = loadState();
  $('home-date').textContent = `#${DAY_NUM} · ${prettyDate(DAY)}`;
  const played = state?.status === 'done';
  $('home-fresh').hidden = played;
  $('home-played').hidden = !played;
  if (played) $('played-score').textContent = state.survived ? '60.0s 🏁' : `${state.score.toFixed(1)}s`;
  ambient(true);
  show('home');
}

async function showResults(result, stats) {
  lastResult = result;
  renderResults({
    els: {
      title: $('res-title'),
      score: $('res-score'),
      reason: $('res-reason'),
      squares: $('res-squares'),
      histogram: $('histogram'),
      percentile: $('res-percentile'),
    },
    dayNum: DAY_NUM,
    game,
    result,
    stats,
  });
  ambient(true);
  show('results');
}

// ---------- play ----------

async function play() {
  ambient(false);
  show('intro');
  $('intro-label').textContent = `Ephemeral #${DAY_NUM} · today ${game.emoji}`;
  $('intro-tagline').textContent = game.tagline;
  await playIntro({ canvas, game, labelEl: $('intro-label'), taglineEl: $('intro-tagline') });
  show(null);

  saveState({ status: 'started', t: 0, gameId });
  const result = await runGame({
    canvas,
    game,
    seed: seedFrom(`${DAY}:${game.id}`),
    onProgress: (t) => saveState({ status: 'started', t, gameId }),
  });
  saveState({ status: 'done', gameId, ...result });

  const stats = await submitScore(SCORE_DAY, result.score);
  showResults(result, stats);
}

// A run that was started but never finished (reload, closed tab) counts as over.
function finalizeInterruptedRun() {
  const state = loadState();
  if (state?.status !== 'started') return;
  const result = { score: state.t || 0, survived: false, reason: 'Run interrupted — you left mid-game.' };
  saveState({ status: 'done', gameId: state.gameId, ...result });
  submitScore(SCORE_DAY, result.score);
}

// ---------- share ----------

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 1800);
}

async function share() {
  const text = shareText({ dayNum: DAY_NUM, game, result: lastResult });
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast("Couldn't copy — select and copy manually");
  }
}

// ---------- boot ----------

function buildLogo() {
  const logo = $('logo');
  logo.replaceChildren(
    ...[...'ephemeral'].map((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.style.animationDelay = `${(i * 0.37 + (i % 3) * 1.3).toFixed(2)}s`;
      return span;
    }),
  );
}

function tickCountdowns() {
  if (!DEV && dateKey() !== DAY) return location.reload();
  const text = formatCountdown(msUntilTomorrow());
  for (const el of document.querySelectorAll('[data-countdown]')) el.textContent = text;
}

async function setupDev() {
  if (!DEV) return;
  $('dev-panel').hidden = false;
  const select = $('dev-game');
  select.replaceChildren(
    ...GAMES.map((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      opt.selected = id === gameId;
      return opt;
    }),
  );
  select.addEventListener('change', async () => {
    gameId = select.value;
    game = await loadGame(gameId);
    params.set('game', gameId);
    history.replaceState(null, '', `?${params}`);
  });
}

async function boot() {
  buildLogo();
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  game = await loadGame(gameId);
  finalizeInterruptedRun();
  await setupDev();

  $('play-btn').addEventListener('click', play);
  $('home-btn').addEventListener('click', showHome);
  $('share-btn').addEventListener('click', share);
  $('see-results-btn').addEventListener('click', async () => {
    const state = loadState();
    const result = { score: state.score, survived: state.survived, reason: state.reason };
    showResults(result, await fetchStats(SCORE_DAY, result.score));
  });

  tickCountdowns();
  setInterval(tickCountdowns, 1000);
  showHome();
}

boot();
