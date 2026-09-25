// Which game runs on which day. The daily agent adds a module in ./games/ and a line here.
// Days without an entry fall back to rotating through GAMES.

export const GAMES = ['asteroids', 'quiz', 'heatwave'];

export const SCHEDULE = {
  '2026-09-24': 'asteroids',
  '2026-09-25': 'quiz',
  '2026-09-26': 'heatwave',
};

export function gameIdFor(day, dayNum) {
  return SCHEDULE[day] ?? GAMES[(((dayNum - 1) % GAMES.length) + GAMES.length) % GAMES.length];
}

export async function loadGame(id) {
  return (await import(`./games/${id}.js`)).default;
}
