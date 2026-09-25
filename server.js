// Ephemeral server: serves the static game and stores one score list per day.
// Zero dependencies — run with `node server.js`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'scores.json');
const PORT = Number(process.env.PORT) || 5173;
const DURATION = 60;
const BUCKET = 5; // seconds per histogram bucket; one extra bucket for "survived"

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

let scores = {};
try {
  scores = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {
  scores = {};
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(scores));
  }, 500);
}

function stats(day, score) {
  const list = scores[day] || [];
  const buckets = new Array(DURATION / BUCKET + 1).fill(0);
  let beaten = 0;
  for (const s of list) {
    buckets[s >= DURATION ? buckets.length - 1 : Math.floor(s / BUCKET)]++;
    if (score != null && s < score) beaten++;
  }
  return { day, total: list.length, buckets, beaten };
}

const DAY_RE = /^(dev-)?\d{4}-\d{2}-\d{2}$/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e4) reject(new Error('too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handleApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/score') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'bad json' });
    }
    const { day, score } = payload;
    if (!DAY_RE.test(day) || typeof score !== 'number' || !(score >= 0 && score <= DURATION)) {
      return sendJson(res, 400, { error: 'invalid score' });
    }
    const rounded = Math.round(score * 10) / 10;
    (scores[day] ||= []).push(rounded);
    scheduleSave();
    return sendJson(res, 200, stats(day, rounded));
  }
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    const day = url.searchParams.get('day') || '';
    if (!DAY_RE.test(day)) return sendJson(res, 400, { error: 'invalid day' });
    const s = url.searchParams.get('score');
    return sendJson(res, 200, stats(day, s == null ? null : Number(s)));
  }
  return sendJson(res, 404, { error: 'not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch(() => sendJson(res, 500, { error: 'server error' }));
    } else {
      serveStatic(req, res, url);
    }
  })
  .listen(PORT, () => console.log(`Ephemeral running at http://localhost:${PORT}`));
