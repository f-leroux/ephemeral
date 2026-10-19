// Prepares the engine's recorded sounds: sounds-src/<name>.mp3 → public/sounds/<cue>.mp3.
// Each one is brought to a target loudness (matched to the synthesized cue it replaces, so it
// sits with the music the same way), peaks are kept below clipping, and the last few
// milliseconds fade out so it can't click. Needs ffmpeg.
//
//   node scripts/prepare-sounds.mjs
//
// A cue without a file here keeps its synthesized sound (see CUES in public/src/engine/sound.js).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// cue name → source file and target integrated loudness (LUFS)
const SOUNDS = {
  swell: { src: 'intro_swell', lufs: -28.8 },
  chord: { src: 'title_chord', lufs: -18.3 },
  beep: { src: 'countdown', lufs: -20.7 },
  death: { src: 'death', lufs: -23.9 },
  fanfare: { src: 'victory', lufs: -21.2 },
};

// ffmpeg reports on stderr
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
}

function measure(file) {
  // padding lets very short sounds fill a full 400ms measurement block
  const out = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'apad=pad_dur=0.5,ebur128', '-f', 'null', '-']);
  const m = [...out.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
  if (!m) throw new Error(`couldn't measure ${file}`);
  return Number(m[1]);
}

const duration = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));

fs.mkdirSync('public/sounds', { recursive: true });
for (const [cue, { src, lufs }] of Object.entries(SOUNDS)) {
  const input = `sounds-src/${src}.mp3`;
  if (!fs.existsSync(input)) {
    console.log(`- ${cue}: no ${input}, keeps its synthesized sound`);
    continue;
  }
  const gain = lufs - measure(input);
  const fade = Math.min(0.08, duration(input) / 4);
  const fadeStart = Math.max(0, duration(input) - fade);
  const output = `public/sounds/${cue}.mp3`;
  run('ffmpeg', [
    '-hide_banner', '-y', '-i', input,
    '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=1:release=50:level=false,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fade.toFixed(3)}`,
    '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k', output,
  ]);
  console.log(`✓ ${cue}: ${input} ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB → ${output} (${measure(output).toFixed(1)} LUFS)`);
}
