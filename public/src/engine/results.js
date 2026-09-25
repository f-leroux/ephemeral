// Results screen: score, how everyone else did today, and the share text.

import { DURATION } from './loop.js';

const SQUARES = 12; // one square per 5 seconds

export function shareSquares(score, survived) {
  const full = Math.floor(score / (DURATION / SQUARES));
  let out = '';
  for (let i = 0; i < SQUARES; i++) {
    if (survived || i < full) out += '🟩';
    else if (i === full) out += '🟥';
    else out += '⬛';
  }
  return out;
}

export function shareText({ dayNum, game, result }) {
  const time = result.survived ? '60.0s 🏁' : `${result.score.toFixed(1)}s`;
  return [
    `Ephemeral #${dayNum} ${game.emoji} ${game.title}`,
    `⏱️ ${time}`,
    shareSquares(result.score, result.survived),
    location.origin + location.pathname,
  ].join('\n');
}

export function renderResults({ els, dayNum, game, result, stats }) {
  els.title.textContent = `Ephemeral #${dayNum} · ${game.emoji} ${game.title}`;
  els.score.textContent = result.score.toFixed(1);
  els.reason.textContent = result.survived ? '🏁 You survived all sixty seconds.' : result.reason;
  els.squares.textContent = shareSquares(result.score, result.survived);

  const buckets = stats?.buckets ?? new Array(SQUARES + 1).fill(0);
  const yourBucket = result.survived ? SQUARES : Math.min(SQUARES - 1, Math.floor(result.score / (DURATION / SQUARES)));
  if (!stats) buckets[yourBucket] = 1;
  const max = Math.max(1, ...buckets);

  els.histogram.replaceChildren(
    ...buckets.map((count, i) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      if (i === SQUARES) bar.classList.add('finish');
      if (i === yourBucket) bar.classList.add('you');
      bar.style.height = '0%';
      bar.title = i === SQUARES ? `Survived: ${count}` : `${i * 5}–${i * 5 + 5}s: ${count}`;
      requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.height = `${(count / max) * 100}%`)));
      return bar;
    }),
  );

  if (!stats) {
    els.percentile.textContent = "Couldn't reach the server — other players' scores aren't available.";
  } else if (stats.total <= 1) {
    els.percentile.textContent = "You're the first to play today.";
  } else {
    const pct = Math.round((stats.beaten / (stats.total - 1)) * 100);
    const survivors = stats.buckets[SQUARES];
    els.percentile.textContent =
      `You outlasted ${pct}% of ${stats.total.toLocaleString()} players. ` +
      `${survivors} survived (${Math.round((survivors / stats.total) * 100)}%).`;
  }
}
