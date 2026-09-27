// Background music: each game can have a 60-second song written in Strudel (https://strudel.cc,
// AGPL-3.0-or-later). Strudel is loaded from a CDN only when there is a song to play, and
// everything degrades to silence if it fails to load or the song has an error.
//
// A game's song looks like:
//   music: {
//     cps: 0.5,                         // cycles per second; 0.5 × 60s = 30 cycles
//     setup: `const pad = note("...")`, // Strudel code defining the layers
//     song: `arrange([6, pad], ...)`,   // one expression: the whole 60s, building in intensity
//   }

import { isMuted } from './sound.js';

const STRUDEL_URL = 'https://cdn.jsdelivr.net/npm/@strudel/web@1.3.0/dist/index.mjs';
const MUSIC_KEY = 'ephemeral:music';
const VOLUME = 0.6; // the music sits under the sound effects

let lib = null;
let repl = null;
let loading = null;
let generation = 0; // bumps on every play/stop, so a slow start can't outlive a stop

let enabled = true;
try {
  enabled = localStorage.getItem(MUSIC_KEY) !== '0';
} catch {
  enabled = true;
}

export function musicEnabled() {
  return enabled;
}

export function setMusicEnabled(on) {
  enabled = on;
  try {
    localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  } catch {
    // not remembered, that's all
  }
  if (!on) stopSong();
}

// True when a song can actually play right now (loaded, and not turned off).
export function musicReady() {
  return !!repl && enabled && !isMuted();
}

// Start downloading Strudel early (on the home screen) so it's ready by GO.
export function preloadMusic() {
  loading ||= import(STRUDEL_URL)
    .then(async (m) => {
      lib = m;
      repl = await m.initStrudel();
    })
    .catch((e) => console.warn('Music unavailable:', e));
  return loading;
}

// Call inside the Play tap: browsers only allow audio to start from a user gesture.
export function unlockMusic() {
  try {
    lib?.getAudioContext().resume();
  } catch {
    // no music, no problem
  }
}

// Play `music` from `fromSeconds` into the run (after a pause, it picks up where it left off).
export async function playSong(music, fromSeconds = 0) {
  const gen = ++generation;
  if (!music || !enabled || isMuted()) return;
  if (!repl) await loading;
  if (!repl || gen !== generation) return;
  // explicit semicolons: a line starting with "(" would otherwise continue the line before it
  const code = [
    `setcps(${music.cps});`,
    `${music.setup || ''};`,
    `(${music.song}).early(${(fromSeconds * music.cps).toFixed(3)}).postgain(${VOLUME})`,
  ].join('\n');
  try {
    repl.stop(); // resets the clock to cycle 0, so .early() lines the song up with the game
    await repl.evaluate(code);
    if (gen !== generation) repl.stop();
  } catch (e) {
    console.warn('Song failed:', e);
  }
}

export function stopSong() {
  generation++;
  try {
    repl?.stop();
  } catch {
    // already stopped
  }
}
