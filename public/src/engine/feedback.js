// Builds the link to a ready-made GitHub feedback issue for an upcoming game: title, the
// `feedback` label (the owner can pre-apply labels) and a short template. Used by the preview's
// results screen and by scripts/notify.mjs. The revise routine acts on these issues (REVISE.md).

const NEW_ISSUE = 'https://github.com/f-leroux/ephemeral/issues/new';

export function feedbackUrl({ dayNum, title, date, run = null }) {
  const lines = [`Game: #${dayNum} ${title} (${date})`];
  if (run) lines.push(`My run: ${run.survived ? 'survived all 60s' : `${run.score.toFixed(1)}s — ${run.reason}`}`);
  lines.push('', 'What to change:', '');
  const q = new URLSearchParams({ title: `${title}: `, labels: 'feedback', body: lines.join('\n') });
  return `${NEW_ISSUE}?${q}`;
}
