# ephemeral

https://ephemeralgame.com

A daily 60-second game. You move left and right, and you die on your first mistake. The score is how long you survived. Everyone gets one try per day, and the game is reimagined every day: the controls, the timer and the one-try rule stay the same, and everything else can change.

## Run it

```sh
node server.js          # http://localhost:5173
```

No dependencies and no build step. The server serves `public/` and stores scores in `data/scores.json`.

Development flags:

| URL                          | Effect                                                |
| ---------------------------- | ----------------------------------------------------- |
| `/?day=2026-09-25`           | a past game from the archive: same run as that day, unlimited tries, not recorded (works on the public site too) |
| `/?preview`                  | the newest upcoming game (`?preview=<date>` for another), unlimited tries, not recorded |
| `/?dev`                      | unlimited tries, game picker, scores go to a `dev-` bucket |
| `/?dev&game=heatwave`        | force a specific game module                          |
| `/?dev&date=2026-10-01`      | pretend it's another day (changes the seed and number) |

To test on a phone on the same Wi-Fi, open `http://<your-computer-ip>:5173/?dev`.

## Deployment

- **Game:** https://ephemeralgame.com, on GitHub Pages (DNS on Cloudflare, records set to DNS only). Every push to `main`, and a daily run at 08:00 UTC, checks every game (`scripts/check-game.mjs`) and builds the site with `scripts/build-site.mjs`:
  - the **public copy** only includes games up to tomorrow (UTC) and ignores `?preview` / `?dev`, so nobody can play upcoming games early;
  - the **private preview** (everything, `?preview` and `?dev` enabled) sits at `https://ephemeralgame.com/<PREVIEW_PATH>/`, an unlisted address stored in the `PREVIEW_PATH` repo secret;
  - every local import gets `?v=<version>`, because Pages lets browsers cache files for 10 minutes.
- **Daily games:** a Claude cloud routine follows [`DAILY.md`](DAILY.md) every morning, two days ahead. Playtest feedback goes in GitHub issues labelled `feedback` (by the owner); a second routine applies it following [`REVISE.md`](REVISE.md).
- **Scores:** a Cloudflare Worker with a D1 database, in `worker/`. `public/src/config.js` points the game at it (and at `server.js` when running locally). To redeploy it: `cd worker && npx wrangler deploy`.

## Layout

```
server.js                 local dev server: static files + /api/score, /api/stats
worker/                   the same score API for production (Cloudflare Worker + D1)
public/index.html         home, intro, results screens
public/src/main.js        flow: home → intro → play → results, one-try enforcement
public/src/schedule.js    which game runs on which date
public/src/config.js      where the score API lives
public/src/engine/        the parts that never change
  loop.js                 fixed-step 60s runner, countdown, HUD, death/survive
  intro.js                8s "recombination" intro + home ambient
  input.js                hold left/right half of screen, or ← → / A D
  rng.js                  seeded RNG (seed = date + game id)
  kit.js                  helpers for game modules (collisions, mover, particles, sprites…)
  sound.js                engine sounds (intro, countdown, GO, ticks, death, fanfare) + mute
  music.js                plays each game's Strudel song, loaded from a CDN; music on/off
  results.js, api.js      results screen, histogram, share text
public/src/games/         one file per daily game
scripts/check-game.mjs    headless sanity checks for game modules
```

## Adding a day (for the daily agent)

1. Create `public/src/games/<id>.js`. Its default export is:

   ```js
   export default {
     id: 'heatwave',            // same as the file name
     title: 'Heatwave',         // short: it gets drawn in particles during the intro
     emoji: '🧊',
     tagline: 'One or two sentences. This is the only explanation players get.',
     colors: { bg, fg, accent }, // fg is used for the timer, so it must contrast with bg
     music: { cps, setup, song },  // the 60s Strudel song, see DAILY.md and engine/music.js
     create({ rng, W, H, duration }) {
       return {
         dead: false,
         deathReason: '',       // shown on the results screen, e.g. 'Melted into a puddle.'
         update(dt, dir, t) {}, // fixed 1/120s steps; dir is -1, 0 or 1; t is seconds elapsed
         render(g, t) {},       // canvas 2D, in world units: W × H = 360 × 640
         afterlife(dt) {},      // optional: keep effects moving during the death animation
       };
     },
   };
   ```

2. Add `'<date>': '<id>'` to `SCHEDULE` and `'<id>'` to `GAMES` in `public/src/schedule.js`.

Rules for game modules:

- **Same run for everyone.** Anything that affects gameplay must use `rng`, never `Math.random`, and must not consume `rng` in a way that depends on the player's input. `Math.random` is fine for cosmetic effects.
- **Die on the first mistake.** Set `dead = true` with a clear `deathReason`.
- **Getting harder over 60s.** `progress(t)` from `kit.js` is a good difficulty curve. The aim is for an average player to survive all 60 seconds about 1 time in 10.
- **Fair.** Every threat must be visible or announced before it can kill you. Don't put anything dangerous near the player during the first ~2 seconds.
- **The player sits near the bottom** (y ≈ 540) and the world scrolls down towards them.
- Check it with `node scripts/check-game.mjs <id>` (crashes, early deaths, determinism), then play it with `/?dev&game=<id>`.

The daily routine follows [`DAILY.md`](DAILY.md).

## License

Ephemeral is free software under the [GNU Affero General Public License v3.0 or later](LICENSE). Its music runs on [Strudel](https://strudel.cc), which is AGPL-3.0-or-later too. Because players use the game over the network, the site links to this source code from the Past games screen, as the AGPL requires.
