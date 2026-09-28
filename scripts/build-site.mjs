// Deploy build. Produces the public site and, if PREVIEW_PATH is set, a private preview copy
// inside it at /<PREVIEW_PATH>/ (an unlisted address kept in a GitHub secret).
//
//   node scripts/build-site.mjs <out-dir> <version>
//
// The public copy only contains games up to tomorrow (UTC), so upcoming games can't be played
// early; a scheduled daily deploy adds each new day in time for the earliest time zones.
// The preview copy contains everything and allows ?preview and ?dev.
// Both get ?v=<version> on every local import: GitHub Pages lets browsers cache files for
// 10 minutes, and without this a returning player could run a mix of old and new modules.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir, version] = process.argv.slice(2);
if (!outDir || !version) {
  console.error('usage: node scripts/build-site.mjs <out-dir> <version>   (env: PREVIEW_PATH)');
  process.exit(1);
}

// Game modules need a `document` only when a game is created, but stub it just in case.
globalThis.document ??= { createElement: () => ({ getContext: () => ({}) }) };

// BUILD_DATE=YYYY-MM-DD pretends the build runs on another (UTC) day, for testing.
const now = process.env.BUILD_DATE ? Date.parse(`${process.env.BUILD_DATE}T12:00:00Z`) : Date.now();
const utcDate = (offsetDays) => new Date(now + offsetDays * 86400000).toISOString().slice(0, 10);
const CUTOFF = utcDate(1); // tomorrow in UTC: already "today" in UTC+14 from 10:00 UTC

const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*)(['"`])(\.{1,2}\/[^'"`]*?\.js)\2/g;

async function build(dir, channel) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync('public', dir, { recursive: true });
  const { SCHEDULE, GAMES } = await import(pathToFileURL(path.resolve('public/src/schedule.js')).href);

  // which days this copy knows about
  const days = Object.entries(SCHEDULE).filter(([date]) => channel === 'preview' || date <= CUTOFF);
  const kept = new Set(days.map(([, id]) => id));
  const scheduledLater = new Set(Object.values(SCHEDULE).filter((id) => !kept.has(id)));
  const games = GAMES.filter((id) => !scheduledLater.has(id));

  if (channel === 'public') {
    const schedulePath = path.join(dir, 'src/schedule.js');
    let src = fs.readFileSync(schedulePath, 'utf8');
    src = src.replace(/export const GAMES = \[[^\]]*\];/, `export const GAMES = ${JSON.stringify(games).replaceAll('"', "'").replaceAll(',', ', ')};`);
    src = src.replace(/export const SCHEDULE = \{[^}]*\};/, `export const SCHEDULE = {\n${days.map(([d, id]) => `  '${d}': '${id}',`).join('\n')}\n};`);
    fs.writeFileSync(schedulePath, src);
    for (const id of scheduledLater) fs.rmSync(path.join(dir, `src/games/${id}.js`), { force: true });
  }

  fs.writeFileSync(path.join(dir, 'src/build.js'), `export const CHANNEL = '${channel}';\n`);

  // the archive list: titles without loading every game in the browser
  const archive = [];
  for (const [date, id] of days) {
    const g = (await import(pathToFileURL(path.resolve(`public/src/games/${id}.js`)).href)).default;
    archive.push({ date, id, title: g.title, emoji: g.emoji });
  }
  fs.writeFileSync(path.join(dir, 'archive.json'), JSON.stringify(archive));

  let count = 0;
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const full = path.join(dir, file);
    const out = fs.readFileSync(full, 'utf8').replace(IMPORT, (_, lead, q, spec) => {
      count++;
      return `${lead}${q}${spec}?v=${version}${q}`;
    });
    fs.writeFileSync(full, out);
  }

  const indexPath = path.join(dir, 'index.html');
  let html = fs
    .readFileSync(indexPath, 'utf8')
    .replace('href="style.css"', `href="style.css?v=${version}"`)
    .replace('src="src/main.js"', `src="src/main.js?v=${version}"`);
  if (channel === 'preview') html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow" />');
  fs.writeFileSync(indexPath, html);

  console.log(`${channel}: ${days.length} days, ${games.length} games, ${count} imports stamped`);
}

await build(outDir, 'public');

const previewPath = process.env.PREVIEW_PATH;
if (previewPath) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(previewPath)) {
    console.error('PREVIEW_PATH must be at least 16 letters, digits, - or _');
    process.exit(1);
  }
  // built to a temp folder first: building inside outDir would copy the public copy into itself
  const tmp = `${outDir}.preview`;
  await build(tmp, 'preview');
  fs.renameSync(tmp, path.join(outDir, previewPath));
}
