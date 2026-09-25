// Score API for Ephemeral on Cloudflare Workers + D1. Same endpoints as ../server.js:
//   POST /api/score  { day, score }  → stats for that day
//   GET  /api/stats?day=&score=      → stats for that day

const DURATION = 60;
const BUCKET = 5; // seconds per histogram bucket; one extra bucket for "survived"
const DAY_RE = /^(dev-)?\d{4}-\d{2}-\d{2}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });
}

async function stats(db, day, score) {
  const buckets = new Array(DURATION / BUCKET + 1).fill(0);
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN score >= ?2 THEN ?3 ELSE CAST(score / ?4 AS INTEGER) END AS b, COUNT(*) AS n
       FROM scores WHERE day = ?1 GROUP BY b`,
    )
    .bind(day, DURATION, buckets.length - 1, BUCKET)
    .all();
  let total = 0;
  for (const { b, n } of results) {
    buckets[b] = n;
    total += n;
  }
  let beaten = 0;
  if (score != null) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE day = ?1 AND score < ?2').bind(day, score).first();
    beaten = row.n;
  }
  return { day, total, buckets, beaten };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (request.method === 'POST' && url.pathname === '/api/score') {
        let payload;
        try {
          payload = await request.json();
        } catch {
          return json(400, { error: 'bad json' });
        }
        const { day, score } = payload ?? {};
        if (!DAY_RE.test(day) || typeof score !== 'number' || !(score >= 0 && score <= DURATION)) {
          return json(400, { error: 'invalid score' });
        }
        const rounded = Math.round(score * 10) / 10;
        await env.DB.prepare('INSERT INTO scores (day, score) VALUES (?1, ?2)').bind(day, rounded).run();
        return json(200, await stats(env.DB, day, rounded));
      }

      if (request.method === 'GET' && url.pathname === '/api/stats') {
        const day = url.searchParams.get('day') || '';
        if (!DAY_RE.test(day)) return json(400, { error: 'invalid day' });
        const s = url.searchParams.get('score');
        return json(200, await stats(env.DB, day, s == null ? null : Number(s)));
      }

      return json(404, { error: 'not found' });
    } catch {
      return json(500, { error: 'server error' });
    }
  },
};
