# Daily task: make tomorrow's Ephemeral

You are the agent that reinvents Ephemeral every day. Each run adds **one new game for tomorrow's date** (UTC). Players see it when their local midnight arrives, so it must be committed and pushed before the run ends.

## What never changes

- The player only moves **left and right**.
- A run lasts **60 seconds** and the score is the time survived.
- The **first mistake ends the run**.
- It **gets harder** over the minute. An average player should survive the full 60s about 1 time in 10.
- The home page, intro, countdown and results screens (the engine in `public/src/engine/`).

Everything else can change: the world, the character, what counts as a mistake, whether you dodge, choose or stay inside something, the art style and the mood.

## Steps

1. **Read** `README.md` (the module contract and rules), **all of `HISTORY.md`** (every past day's concept), `public/src/schedule.js`, and at least two existing games in `public/src/games/` to see the expected level of polish.
2. **Pick tomorrow's concept.**
   - Look up what tomorrow is: holidays, anniversaries, seasons, notable events, the news. If something fits, theme the game around it (e.g. a pumpkin cart dodging ghosts on Halloween, a marathon runner on a marathon day). Keep it light: no tragedies, disasters with victims, or divisive politics.
   - If nothing fits, invent something fresh. Use `HISTORY.md`: never repeat a past concept, don't repeat a setting or palette from the last ~2 weeks, and don't use the same type (`dodge` / `choose` / `stay` / …) more than two days in a row. Try new twists too: momentum or drift, mirrored twins, darkness with lightning flashes, wind, rhythm, gravity flips, puzzles, a brand-new type.
   - A theme can come back (a second space game, months later) only with a clearly different mechanic.
3. **Write** `public/src/games/<id>.js` (a short lowercase id, unique, never reused).
   - **Rules** (see README): gameplay uses only the given `rng`, deterministic; a clear `deathReason`; nothing can kill you in the first 2s; every threat is visible or telegraphed before it can hit.
   - **Art bar:** it must look at least as good as the existing games. Pre-render detailed sprites once with `makeSprite` (gradients, highlights, shading, texture), then use parallax or animated backgrounds, glows (`glowSprite` with `'lighter'`), particles for movement/impacts/death, and a vignette. It must stay readable on a phone at 360×640, with the player clearly distinct from threats. Keep per-frame work cheap: no `shadowBlur` or `filter` on many objects per frame.
   - **Tagline:** at most two sentences. It is the only explanation players get, so it must say what to do and what kills you.
   - **Title:** ≤ 16 characters. Emoji: one that fits.
4. **Check it:** `node scripts/check-game.mjs <id>` must pass (no crashes, no early deaths, deterministic, and the simple bots should mostly die well before 60s). Then run `node scripts/check-game.mjs` for all games to make sure nothing else broke.
5. **Schedule it:** add `'<id>'` to `GAMES` and `'<tomorrow YYYY-MM-DD>': '<id>'` to `SCHEDULE` in `public/src/schedule.js`, and append tomorrow's row to `HISTORY.md`. If tomorrow already has an entry, stop: it's done.
6. **Commit and push** to `main`, with the message `Day #<n>: <emoji> <title>` (n from `dayNumber` in `public/src/engine/day.js`).

## Don'ts

- Don't edit or delete past games, past schedule entries or past `HISTORY.md` rows.
- Don't change the engine unless the new game truly needs it. If it does, keep the change backwards compatible and re-run the checks for every game.
- Don't add dependencies or a build step.
