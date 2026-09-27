// Deploy step: copies public/ to a build folder and adds ?v=<version> to every local file
// reference (module imports, the stylesheet, main.js). GitHub Pages lets browsers cache files
// for 10 minutes, so without this a returning player could run a mix of old and new modules.
//
//   node scripts/stamp-version.mjs <out-dir> <version>

import fs from 'node:fs';
import path from 'node:path';

const [outDir, version] = process.argv.slice(2);
if (!outDir || !version) {
  console.error('usage: node scripts/stamp-version.mjs <out-dir> <version>');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync('public', outDir, { recursive: true });

// `from './x.js'`, `import('./x.js')` and `import(`./games/${id}.js`)`; absolute URLs are left alone
const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*)(['"`])(\.{1,2}\/[^'"`]*?\.js)\2/g;
let count = 0;

for (const file of fs.readdirSync(outDir, { recursive: true })) {
  const full = path.join(outDir, file);
  if (!file.endsWith('.js')) continue;
  const src = fs.readFileSync(full, 'utf8');
  const out = src.replace(IMPORT, (_, lead, q, spec) => {
    count++;
    return `${lead}${q}${spec}?v=${version}${q}`;
  });
  fs.writeFileSync(full, out);
}

const indexPath = path.join(outDir, 'index.html');
const html = fs
  .readFileSync(indexPath, 'utf8')
  .replace('href="style.css"', `href="style.css?v=${version}"`)
  .replace('src="src/main.js"', `src="src/main.js?v=${version}"`);
fs.writeFileSync(indexPath, html);

console.log(`stamped ${count} imports with v=${version}`);
