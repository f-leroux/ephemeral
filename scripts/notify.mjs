// Sends the owner a phone notification (via ntfy.sh) about an upcoming game, with buttons to
// play it on the private preview and to file feedback. The topic and the preview path are
// secrets: they come from the environment (the routines' private prompts), never from the repo.
//
//   NTFY_TOPIC=… PREVIEW_PATH=… node scripts/notify.mjs new <date>
//   NTFY_TOPIC=… PREVIEW_PATH=… node scripts/notify.mjs revised <date> "what changed"

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { feedbackUrl } from '../public/src/engine/feedback.js';
import { dayNumber } from '../public/src/engine/day.js';

const [kind, date, summary = ''] = process.argv.slice(2);
const { NTFY_TOPIC: topic, PREVIEW_PATH: previewPath } = process.env;
if (!['new', 'revised'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !topic || !previewPath) {
  console.error('usage: NTFY_TOPIC=… PREVIEW_PATH=… node scripts/notify.mjs new|revised <YYYY-MM-DD> ["summary"]');
  process.exit(1);
}

globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };
const { SCHEDULE } = await import(pathToFileURL(path.resolve('public/src/schedule.js')).href);
const id = SCHEDULE[date];
if (!id) {
  console.error(`no game scheduled on ${date}`);
  process.exit(1);
}
const game = (await import(pathToFileURL(path.resolve(`public/src/games/${id}.js`)).href)).default;
const dayNum = dayNumber(date);

// Day D goes live at midnight in UTC+14, i.e. 10:00 UTC on D − 1: that's the feedback deadline.
const deadline = new Date(Date.parse(`${date}T10:00:00Z`) - 86400000);
const paris = (d, opts) => d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', ...opts });
const liveOn = paris(new Date(`${date}T12:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short' });
const until = paris(deadline, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const play = `https://ephemeralgame.com/${previewPath}/?preview=${date}`;
const title = kind === 'new' ? `New Ephemeral to playtest: #${dayNum} ${game.emoji} ${game.title}` : `Revised: #${dayNum} ${game.emoji} ${game.title}`;
const message = [summary || game.tagline, `Live on ${liveOn} · feedback until ${until} (Paris)`].join('\n');

const res = await fetch('https://ntfy.sh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    topic,
    title,
    message,
    tags: ['joystick'],
    click: play,
    actions: [
      { action: 'view', label: 'Play it', url: play },
      { action: 'view', label: 'Give feedback', url: feedbackUrl({ dayNum, title: game.title, date }) },
    ],
  }),
});
if (!res.ok) {
  console.error(`ntfy refused the notification: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`notified: ${title}`);
