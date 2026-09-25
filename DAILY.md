# Daily task: make tomorrow's Ephemeral

You are the agent that reinvents Ephemeral every day. Each run adds **one new game for tomorrow's date** (UTC). Players see it when their local midnight arrives, so it must be committed and pushed before the run ends.

## What never changes

- The player only moves **left and right**.
- A run lasts **60 seconds** and the score is the time survived.
- The **first mistake ends the run**.
- It **gets harder** over the minute. An average player should survive the full 60s about 1 time in 10.
- The home page, intro, countdown and results screens (the engine in `public/src/engine/`).

Everything else can change: the world, the character, what counts as a mistake, what kind of challenge it is, the art style and the mood.

## Steps

1. **Read** `README.md` (the module contract and rules), **all of `HISTORY.md`** (every past day's concept), `public/src/schedule.js`, and at least two existing games in `public/src/games/` to see the expected level of polish.
2. **Pick tomorrow's concept.** The main goal is a game that's fun, fresh and surprising.
   - **Invent freely.** You're not limited to the kinds of games already made. Any 60-second, left/right, one-mistake game counts, and new kinds of challenge are welcome: momentum or drift, mirrored twins, darkness with lightning flashes, wind, rhythm, gravity flips, catching or collecting, following a path, timing, puzzles, anything you can think of.
   - **Don't repeat yourself.** Check `HISTORY.md`: never repeat a past concept, avoid a setting or palette from the last ~2 weeks, and don't build on the same core mechanic several days in a row. A theme can come back later (a second space game, months on) only with a clearly different mechanic.
   - **Themes are optional and occasional.** Most days need no theme at all. Only if tomorrow has something widely known and fun (a major holiday like Halloween or New Year, a big celebrated event) *and* it naturally suggests a good game, you may theme around it. Don't go searching for obscure observances or force a connection. A great unthemed game always beats a weak themed one. Never theme around tragedies, disasters with victims, or divisive politics.
3. **Write** `public/src/games/<id>.js` (a short lowercase id, unique, never reused).
   - **Rules** (see README): gameplay uses only the given `rng`, deterministic; a clear `deathReason`; nothing can kill you in the first 2s; every threat is visible or telegraphed before it can hit.
   - **Art bar:** it must look at least as good as the existing games. Pre-render detailed sprites once with `makeSprite` (gradients, highlights, shading, texture), then use parallax or animated backgrounds, glows (`glowSprite` with `'lighter'`), particles for movement/impacts/death, and a vignette. It must stay readable on a phone at 360×640, with the player clearly distinct from threats. Keep per-frame work cheap: no `shadowBlur` or `filter` on many objects per frame.
   - **Sound:** give the game its own sound design with the `sfx` kit passed to `create()` (see the top of `public/src/engine/sound.js` and how the existing games use it). Include feedback for the core action (a near miss, a correct pick, entering safety…), a telegraph for each new threat, and a distinct death sound. **No continuous sounds:** no background hums, drones, ambiences or long loops. Players found them annoying. Use short one-shot sounds tied to events. Keep them short, soft and pleasant (avoid harsh, very high-pitched tones), don't fire a sound every frame, and never let sound depend on the gameplay `rng`. The engine already handles the countdown, GO, the last-10-seconds ticks, the death thud and the survival fanfare.
   - **Tagline:** at most two sentences. It is the only explanation players get, so it must say what to do and what kills you.
   - **Title:** ≤ 16 characters. Emoji: one that fits.
4. **Check it:** `node scripts/check-game.mjs <id>` must pass (no crashes, no early deaths, deterministic, and the simple bots should mostly die well before 60s). Then run `node scripts/check-game.mjs` for all games to make sure nothing else broke.
5. **Schedule it:** add `'<id>'` to `GAMES` and `'<tomorrow YYYY-MM-DD>': '<id>'` to `SCHEDULE` in `public/src/schedule.js`, and append tomorrow's row to `HISTORY.md`. If tomorrow already has an entry, stop: it's done.
6. **Commit and push** to `main`, with the message `Day #<n>: <emoji> <title>` (n from `dayNumber` in `public/src/engine/day.js`).

## Don'ts

- Don't edit or delete past games, past schedule entries or past `HISTORY.md` rows.
- Don't change the engine unless the new game truly needs it. If it does, keep the change backwards compatible and re-run the checks for every game.
- Don't add dependencies or a build step.
