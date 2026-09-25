// Talks to the score server. Everything degrades gracefully when it's unreachable.

import { API_BASE } from '../config.js';

export async function submitScore(day, score) {
  try {
    const res = await fetch(`${API_BASE}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, score }),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchStats(day, score) {
  try {
    const res = await fetch(`${API_BASE}/api/stats?day=${encodeURIComponent(day)}&score=${score}`);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return null;
  }
}
