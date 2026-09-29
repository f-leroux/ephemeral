# Daily task: make tomorrow's Ephemeral

You are the agent that reinvents Ephemeral every day. Each run adds **one new game, two days ahead**, so the owner has a full day to playtest it on the private preview and send feedback (see `REVISE.md`) before anyone can play it.

**Which date:** take tomorrow and the day after tomorrow (UTC: `date -u -d tomorrow +%F`, `date -u -d '2 days' +%F`). Make the game for the earliest of the two that has no entry in `SCHEDULE`. If both have entries, stop: there's nothing to do. Make at most one game per run.

## What never changes

- The player only moves **left and right**.
- A run lasts **60 seconds** and the score is the time survived.
- The **first mistake ends the run**.
- It **gets harder** over the minute. An average player should survive the full 60s about 1 time in 10.
- The home page, intro, countdown and results screens (the engine in `public/src/engine/`).
- Every game has **its own 60-second song** and **no sound effects**.

Everything else can change: the world, the character, what counts as a mistake, what kind of challenge it is, the art style, the music and the mood.

## Steps

1. **Read** `README.md` (the module contract and rules), **all of `HISTORY.md`** (every past day's concept and music), `public/src/schedule.js`, and at least two existing games in `public/src/games/` to see the expected level of polish and how their songs are built. Run `npm install` once (it installs the tools `check-game` uses to test songs).
2. **Pick tomorrow's concept.** The main goal is a game that's fun, fresh and surprising.
   - **Invent freely.** You're not limited to the kinds of games already made. Any 60-second, left/right, one-mistake game counts, and new kinds of challenge are welcome: momentum or drift, mirrored twins, darkness with lightning flashes, wind, rhythm, gravity flips, catching or collecting, following a path, timing, puzzles, anything you can think of.
   - **Don't repeat yourself.** Check `HISTORY.md`: never repeat a past concept, avoid a setting or palette from the last ~2 weeks, and don't build on the same core mechanic several days in a row. A theme can come back later (a second space game, months on) only with a clearly different mechanic.
   - **Themes are optional and occasional.** Most days need no theme at all. Only if tomorrow has something widely known and fun (a major holiday like Halloween or New Year, a big celebrated event) *and* it naturally suggests a good game, you may theme around it. Don't go searching for obscure observances or force a connection. A great unthemed game always beats a weak themed one. Never theme around tragedies, disasters with victims, or divisive politics.
3. **Write** `public/src/games/<id>.js` (a short lowercase id, unique, never reused).
   - **Rules** (see README): gameplay uses only the given `rng`, deterministic; a clear `deathReason`; nothing can kill you in the first 2s; every threat is visible or telegraphed before it can hit.
   - **Art bar:** it must look at least as good as the existing games. Pre-render detailed sprites once with `makeSprite` (gradients, highlights, shading, texture), then use parallax or animated backgrounds, glows (`glowSprite` with `'lighter'`), particles for movement/impacts/death, and a vignette. It must stay readable on a phone at 360×640, with the player clearly distinct from threats. Keep per-frame work cheap: no `shadowBlur` or `filter` on many objects per frame.
   - **No sound effects.** The game's audio is its song. (The engine plays its own intro, countdown, GO, final-seconds heartbeat, death and fanfare cues; don't add any others.)
   - **Music:** write the game's song in [Strudel](https://strudel.cc) as the `music` field (see the existing games and the top of `public/src/engine/music.js`):
     - **Exactly 60 seconds:** `music.song` is one `arrange([bars, stack(...)], ...)` whose bars add up to `60 × cps`. For example cps `0.55` (132 BPM in 4/4, one bar per cycle) is 33 bars; cps `1` for a 3/4 waltz at 180 BPM is 60 bars.
     - **Intense from the first second, and building:** players found a slow, calm start boring. Start with a real groove (kick + bass at least), then add layers in 3–4 sections, with the last ~15–20 seconds the busiest. Tempo usually 125–150 BPM. Opening filters with `saw.range(a, b).slow(<total bars>)` add a nice rise across the minute.
     - **Fits the game:** pick a genre, key, instruments and mood that match its world (synthwave for a neon road, tropical house for a sunny street, a circus waltz under the big top…). Vary from recent days: check the Music column in `HISTORY.md`.
     - **Only built-in synths:** `sine`, `triangle`, `square`, `sawtooth` for notes and `white`, `pink`, `brown` noise for percussion. No samples (they'd need downloads).
     - **Pleasant on a phone:** keep the high end soft (low-pass bright synths, keep hi-hats quiet with `hpf` around 6000–7000 and gain ≤ 0.06). Put kicks and basses at octave 2 or above (octave 1 is inaudible on phone speakers). Keep gains modest: pads and leads ~0.07–0.15, bass ~0.3–0.5, kick ~0.8.
     - `setup` defines the layers as `const`s; `song` is only the `arrange(...)` expression. Don't use `setcps`, `.play()` or `postgain`: the engine handles tempo, timing and volume.
     - `check-game` evaluates the song and fails it if it errors, isn't exactly 60s, uses samples or doesn't build. It can't hear it, so write carefully.
   - **Tagline:** at most two sentences. It is the only explanation players get, so it must say what to do and what kills you.
   - **Title:** ≤ 16 characters. Emoji: one that fits.
4. **Check it:** `node scripts/check-game.mjs <id>` must pass (no crashes, no early deaths, deterministic, the simple bots mostly die well before 60s, and the song is valid). Then run `node scripts/check-game.mjs` for all games to make sure nothing else broke.
5. **Schedule it:** add `'<id>'` to `GAMES` and `'<date YYYY-MM-DD>': '<id>'` to `SCHEDULE` in `public/src/schedule.js`, and append its row to `HISTORY.md`. The public site only publishes it the day before its date; until then it's only on the private preview.
6. **Commit and push** to `main`, with the message `Day #<n>: <emoji> <title>` (n from `dayNumber` in `public/src/engine/day.js`).

## Don'ts

- Don't edit or delete past games, past schedule entries or past `HISTORY.md` rows.
- Don't change the engine unless the new game truly needs it. If it does, keep the change backwards compatible and re-run the checks for every game.
- Don't add dependencies or a build step (the site itself has none; the dev dependencies are only for `check-game`).
