# SpyKiller

A browser remake of the arcade game Spy Hunter, built with Phaser 3. No build step.

## Run

Requires Node 18+. There are no dependencies to install; Phaser loads from a CDN.

```sh
npm run dev      # http://localhost:8080  (PORT=xxxx to change)
```

## Controls

| Key | Action |
|---|---|
| ↑ / W | Gas |
| ↓ / S | Brake |
| ← → / A D | Steer |
| Shift | Gear LO / HI |
| Space / Z | Machine guns |
| X | Oil slick |
| C | Smoke screen |
| V | Missiles (helicopters only) |
| P | Pause |
| M | Music on/off |
| Enter | Start / restart after game over |
| Esc | Back to title (paused or game over) |

Oil, smoke and missiles come from the weapons van: drive up its ramp when it pulls over.

## Rules

- Score comes from distance driven and from destroying enemy cars.
- While the timer runs, crashes are free. After it runs out, each crash uses a spare car. You earn a spare every 10,000 points.
- Destroying a civilian car stops scoring for a few seconds.
- The shoulder is drivable but slow. Going deep into the grass crashes you.
- Take the boathouse fork to become a boat for the river section.

## URL options

- `?debug=1`: tuning sliders, plus automation hooks (`__game.stepFrames`, `__game.stepUntil`)
- `?bot=1`: the bot plays
- `?seed=N`: fixed track and traffic seed

## Development

```sh
npm test                    # node --test
npm run batch -- 10 120 1   # bot balance run: seeds, seconds per run, route (default 1)
```

Game rules live in `src/logic/`. It has no Phaser imports and is deterministic for a given seed. `src/scenes/` renders that state, and `src/art.js` paints every texture at runtime.

## Deploy

```sh
npm run deploy   # tests, wrangler deploy, then smoke check of https://spy.instituteofmayhem.com
```

Cloudflare Workers static assets. `.assetsignore` is an allowlist: only `index.html` and `src/` are public. `scripts/smoke.mjs` checks that.
