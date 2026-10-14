# SpyKiller

A browser remake of the 1983 arcade game **Spy Hunter**, built with Phaser 3 as a personal experiment in making games with AI.

The goal is simple: practice building with AI, learn by replicating a favorite arcade game, and have fun along the way. The rules follow the original as closely as memory allows; the animation is allowed to be better.

[Play SpyKiller](https://spy.instituteofmayhem.com/) · [Source](https://github.com/bsharpe/SpyKiller) · [Institute of Mayhem](https://instituteofmayhem.com/) · [How it was made](docs/project-process.md)

## Run

Requires Node 18+. There are no dependencies to install and no build step; Phaser loads from a CDN.

```sh
git clone https://github.com/bsharpe/SpyKiller.git
cd SpyKiller
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

Cloudflare Workers static assets. `.assetsignore` is an allowlist: only `index.html` and `src/` are public. `scripts/smoke.mjs` checks that. To host your own copy, change the Worker name and route in `wrangler.jsonc` first.

## Credits and license

Created by Ben Sharpe as an AI-assisted learning project. Spy Hunter was created by Bally Midway; this is an unofficial fan remake and is not affiliated with or endorsed by the rights holders.

Every texture is painted in code at runtime (`src/art.js`), and every sound is synthesized with Web Audio (`src/audio.js`). The music is an original riff, not the Peter Gunn theme used by the arcade game. Third-party pieces loaded at runtime: [Phaser](https://phaser.io/) (MIT) from jsDelivr and the [Russo One](https://fonts.google.com/specimen/Russo+One) font (SIL Open Font License) from Google Fonts.

Original code written for this project is available under the [MIT license](LICENSE). The license does not grant rights to Spy Hunter's name, artwork, music, or trademarks, or to third-party material.
