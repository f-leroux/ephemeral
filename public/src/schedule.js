// Which game runs on which day. The daily agent adds a module in ./games/ and a line here.
// Days without an entry fall back to rotating through GAMES.

export const GAMES = ['asteroids', 'quiz', 'heatwave', 'tightrope', 'fireflies', 'kite', 'twins', 'storm', 'sealshow', 'amoeba', 'sheepdog', 'lilyleap', 'seam', 'marble', 'ducklings'];

export const SCHEDULE = {
  '2026-09-25': 'asteroids',
  '2026-09-26': 'quiz',
  '2026-09-27': 'heatwave',
  '2026-09-28': 'tightrope',
  '2026-09-29': 'fireflies',
  '2026-09-30': 'kite',
  '2026-10-01': 'twins',
  '2026-10-02': 'storm',
  '2026-10-03': 'sealshow',
  '2026-10-04': 'amoeba',
  '2026-10-05': 'sheepdog',
  '2026-10-06': 'lilyleap',
  '2026-10-07': 'seam',
  '2026-10-08': 'marble',
  '2026-10-09': 'ducklings',
};

export function gameIdFor(day, dayNum) {
  return SCHEDULE[day] ?? GAMES[(((dayNum - 1) % GAMES.length) + GAMES.length) % GAMES.length];
}

export async function loadGame(id) {
  return (await import(`./games/${id}.js`)).default;
}
