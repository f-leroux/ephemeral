// App flow: home → intro → countdown + play → results.
//
// Modes, from the URL:
//   (none)                today's game: one try, score recorded
//   ?day=2026-09-25       a past game from the archive: same run as on its day, unlimited tries, not recorded
//   ?preview              the newest game that isn't live yet (?preview=2026-10-01 for a specific one):
//                         unlimited tries, not recorded — for playtesting before release
//   ?dev                  unlimited tries, scores go to a separate "dev-" bucket
//   ?dev&game=quiz        force a game module
//   ?dev&date=2026-10-01  pretend it's another day
// ?preview and ?dev only work locally and on the private preview copy, never on the public site.

import { dateKey, dayNumber, prettyDate, msUntilTomorrow, formatCountdown } from './engine/day.js';
import { seedFrom } from './engine/rng.js';
import { runGame } from './engine/loop.js';
import { playIntro, startAmbient } from './engine/intro.js';
import { submitScore, fetchStats } from './engine/api.js';
import { renderResults, shareText } from './engine/results.js';
import { GAMES, SCHEDULE, gameIdFor, loadGame } from './schedule.js';
import { unlockAudio, isMuted, setMuted } from './engine/sound.js';
import { startPractice } from './engine/practice.js';
import { preloadMusic, unlockMusic, musicEnabled, setMusicEnabled, stopSong } from './engine/music.js';
import { CHANNEL } from './build.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TODAY = dateKey();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
const upcoming = Object.keys(SCHEDULE).filter((d) => d > TODAY).sort();

const TESTING = CHANNEL !== 'public';
const MODE = TESTING && params.has('dev')
  ? 'dev'
  : isDate(params.get('day')) && params.get('day') < TODAY
    ? 'archive'
    : TESTING && params.has('preview')
      ? 'preview'
      : 'today';
const DAY = {
  dev: isDate(params.get('date')) ? params.get('date') : TODAY,
  archive: params.get('day'),
  preview: isDate(params.get('preview')) ? params.get('preview') : (upcoming.at(-1) ?? TODAY),
  today: TODAY,
}[MODE];
const DAY_NUM = dayNumber(DAY);
const STORE_KEY = `ephemeral:${DAY}`;

const canvas = $('stage');
let gameId = (MODE === 'dev' && params.get('game')) || gameIdFor(DAY, DAY_NUM);
let game;
let stopAmbient = null;
let stopPractice = null;
let lastResult = null;

// ---------- persistence (one try per day, today's game only) ----------

function loadState() {
  if (MODE !== 'today') return null;
  try {
    const state = JSON.parse(localStorage.getItem(STORE_KEY));
    // A run saved for a different game (the schedule changed) doesn't count.
    return state?.gameId === gameId ? state : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  if (MODE !== 'today') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage disabled: the one-try rule just can't be enforced.
  }
}

// Records the run (today and dev) or just looks up that day's players (archive).
async function recordAndCompare(score) {
  if (MODE === 'today') return submitScore(DAY, score);
  if (MODE === 'dev') return submitScore(`dev-${DAY}`, score);
  if (MODE === 'archive') return fetchStats(DAY, score);
  return null;
}

// ---------- screens ----------

function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  // the practice strip only runs while the home screen shows it
  const practising = id === 'home' && !$('home-fresh').hidden;
  if (practising && !stopPractice) stopPractice = startPractice($('practice'));
  if (!practising && stopPractice) {
    stopPractice();
    stopPractice = null;
  }
}

function ambient(on) {
  if (on && !stopAmbient) stopAmbient = startAmbient(canvas);
  if (!on && stopAmbient) {
    stopAmbient();
    stopAmbient = null;
  }
}

function setBanner() {
  const banner = $('mode-banner');
  banner.hidden = MODE === 'today';
  if (MODE === 'archive') {
    banner.textContent = `From the archive: ${game.emoji} ${game.title}. Play as often as you like; runs don't count.`;
  } else if (MODE === 'preview') {
    const others = upcoming.filter((d) => d !== DAY);
    banner.replaceChildren(`Preview: ${game.emoji} ${game.title}, not live yet. Runs aren't recorded.`);
    for (const d of others) {
      const a = document.createElement('a');
      a.href = `?preview=${d}`;
      a.textContent = `#${dayNumber(d)}`;
      banner.append(' Also upcoming: ', a);
    }
  } else if (MODE === 'dev') {
    banner.textContent = 'Dev mode: unlimited tries, separate score bucket.';
  }
}

function showHome() {
  const state = loadState();
  $('home-date').textContent = `#${DAY_NUM} · ${prettyDate(DAY)}`;
  const played = state?.status === 'done';
  $('home-fresh').hidden = played;
  $('home-played').hidden = !played;
  if (played) $('played-score').textContent = state.survived ? '60.0s 🏁' : `${state.score.toFixed(1)}s`;
  $('play-btn').textContent = MODE === 'today' ? "Play today's game" : 'Play';
  $('today-link').hidden = MODE === 'today';
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
      distLabel: $('res-dist-label'),
    },
    dayNum: DAY_NUM,
    game,
    result,
    stats,
    mode: MODE,
  });
  const replayable = MODE !== 'today';
  $('again-btn').hidden = !replayable;
  $('share-btn').hidden = MODE === 'archive' || MODE === 'preview';
  $('res-footnote').hidden = replayable;
  ambient(true);
  show('results');
}

// ---------- archive ----------

// The list of every scheduled game, built at deploy time (archive.json). Locally, where there's
// no build, it falls back to loading each game module for its title.
async function archiveEntries() {
  try {
    const res = await fetch('archive.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    // fall through
  }
  return Promise.all(
    Object.entries(SCHEDULE).map(async ([date, id]) => {
      const g = await loadGame(id);
      return { date, id, title: g.title, emoji: g.emoji };
    }),
  );
}

async function showArchive() {
  const list = $('archive-list');
  list.replaceChildren();
  ambient(true);
  show('archive');
  const past = (await archiveEntries()).filter((e) => e.date < TODAY).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!past.length) {
    const li = document.createElement('li');
    li.className = 'archive-empty';
    li.textContent = 'No past games yet. Come back tomorrow.';
    list.append(li);
    return;
  }
  list.replaceChildren(
    ...past.map((e) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `?day=${e.date}`;
      const cell = (cls, text) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        return span;
      };
      const [y, m, d] = e.date.split('-').map(Number);
      const short = new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      a.append(cell('num', `#${dayNumber(e.date)}`), cell('emoji', e.emoji), cell('name', e.title), cell('date', short));
      li.append(a);
      return li;
    }),
  );
}

// ---------- play ----------

const songFor = (g) => g.music ?? null;

async function play() {
  unlockAudio(); // must happen inside the tap
  unlockMusic();
  ambient(false);
  show('intro');
  const when = { today: 'today', dev: 'dev', archive: 'from the archive', preview: 'preview' }[MODE];
  $('intro-label').textContent = `Ephemeral #${DAY_NUM} · ${when} ${game.emoji}`;
  $('intro-tagline').textContent = game.tagline;
  await playIntro({ canvas, game, labelEl: $('intro-label'), taglineEl: $('intro-tagline') });
  show(null);

  saveState({ status: 'started', t: 0, gameId });
  const result = await runGame({
    canvas,
    game,
    seed: seedFrom(`${DAY}:${game.id}`), // the archive replays exactly the run of that day
    onProgress: (t) => saveState({ status: 'started', t, gameId }),
    music: songFor(game),
  });
  saveState({ status: 'done', gameId, ...result });

  showResults(result, await recordAndCompare(result.score));
}

// A run that was started but never finished (reload, closed tab) counts as over.
function finalizeInterruptedRun() {
  const state = loadState();
  if (state?.status !== 'started') return;
  const result = { score: state.t || 0, survived: false, reason: 'Run interrupted — you left mid-game.' };
  saveState({ status: 'done', gameId: state.gameId, ...result });
  submitScore(DAY, result.score);
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

function setupMute() {
  const btn = $('mute-btn');
  const render = () => {
    btn.classList.toggle('muted', isMuted());
    btn.setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound');
  };
  const toggle = () => {
    setMuted(!isMuted());
    if (isMuted()) stopSong();
    render();
  };
  btn.addEventListener('click', (e) => {
    toggle();
    btn.blur();
    e.stopPropagation();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') toggle();
  });
  render();
}

function setupMusic() {
  const btn = $('music-btn');
  btn.hidden = !songFor(game);
  if (btn.hidden) return;
  preloadMusic(); // download it while the player is on the home screen
  const render = () => {
    btn.classList.toggle('muted', !musicEnabled());
    btn.setAttribute('aria-label', musicEnabled() ? 'Turn music off' : 'Turn music on');
  };
  btn.addEventListener('click', (e) => {
    setMusicEnabled(!musicEnabled());
    render();
    btn.blur();
    e.stopPropagation();
  });
  render();
}

function tickCountdowns() {
  if (MODE === 'today' && dateKey() !== DAY) return location.reload();
  const text = formatCountdown(msUntilTomorrow());
  for (const el of document.querySelectorAll('[data-countdown]')) el.textContent = text;
}

async function setupDev() {
  if (MODE !== 'dev') return;
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
  // a future ?day= isn't in the archive yet: show today's game instead
  if (params.has('day') && MODE !== 'archive') history.replaceState(null, '', location.pathname);
  buildLogo();
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  game = await loadGame(gameId);
  finalizeInterruptedRun();
  await setupDev();
  setupMute();
  setupMusic();
  setBanner();

  $('play-btn').addEventListener('click', play);
  $('again-btn').addEventListener('click', play);
  $('home-btn').addEventListener('click', showHome);
  $('share-btn').addEventListener('click', share);
  $('archive-btn').addEventListener('click', showArchive);
  $('res-archive-btn').addEventListener('click', showArchive);
  $('archive-back').addEventListener('click', showHome);
  $('see-results-btn').addEventListener('click', async () => {
    const state = loadState();
    const result = { score: state.score, survived: state.survived, reason: state.reason };
    showResults(result, await fetchStats(DAY, result.score));
  });

  tickCountdowns();
  setInterval(tickCountdowns, 1000);
  if (params.has('archive')) showArchive();
  else showHome();
}

boot();
