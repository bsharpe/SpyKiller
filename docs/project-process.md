# Building SpyKiller with AI

SpyKiller began with a favorite arcade game and a straightforward goal: practice building with AI, recreate the experience of playing Spy Hunter, and have fun. On the afternoon and evening of October 10, 2026, that idea became a playable browser game, a deployed website, and a private repository. On October 14 the repository was prepared for public release.

[Play the game](https://spy.instituteofmayhem.com/) · [Browse the source](https://github.com/bsharpe/SpyKiller)

This account draws on the original Claude Code session (October 10, about 16:19 to 20:09 Mountain time), the project's Git history, a later Codex conversation that requested this publication work, and the Claude Code session that carried it out. Quoted user prompts are recovered wording. The one assistant-written prompt is identified as such. The game code was committed all at once, so the order of the build milestones comes from the session transcript, not from Git.

## 1. One prompt, a skill, and a short brief

The opening user prompt set the destination and the standard:

> use our phaser game building skill to create a web-based version of the classic arcade game "SpyHunter" -- same rules, better animation, same gameplay

"Our phaser game building skill" is a reusable Claude Code skill for Phaser 3 browser games. It front-loads the parts that are expensive for an AI-built game: a no-cache dev server, hooks for driving the game from a hidden automation tab, a debug panel of tuning sliders, a seeded simulation that a bot can play headless, and a deploy smoke check. SpyKiller's `scripts/dev.mjs`, `src/debug-hooks.js`, and `scripts/smoke.mjs` started from that skill's templates.

There was no separate web-research phase and no saved plan document. The session record shows no web searches. The arcade rules came from the model's knowledge of the game, and the user then corrected them from memory of playing it (section 3).

## 2. The first build

Twenty minutes in, the user added:

> you can use subagents for implementation if you check their work

About 33 minutes after the prompt, the first playable version was reported. Its shape held for the rest of the project:

- **Pure, seeded rules.** `src/logic/` has no Phaser imports. Track generation, the simulation, the bot, and the tuning constants are plain JavaScript on a fixed 1/60 s timestep with a seeded random generator, so the same seed always plays the same game. Node's built-in test runner checks the rules directly.
- **A renderer that only draws.** `src/scenes/Run.js` reads the simulation state each frame and draws it, with particles, camera shake, and pop-ups layered on top. The title screen runs a bot-driven demo underneath.
- **Art and sound in code.** `src/art.js` paints every vehicle, prop, and effect with canvas 2D at startup. `src/audio.js` synthesizes the sound effects, engine drone, and music. The music is an original riff instead of the Peter Gunn theme the arcade machine used. The game was named SpyKiller, after the project directory, because "Spy Hunter" is a trademark.
- **The arcade content.** A LO/HI gear, twin machine guns, the weapons van with oil slick, smoke screen, and missiles, a timer during which crashes are free, spare cars every 10,000 points, a no-score penalty for destroying civilians, the Switchblade, Road Lord, Enforcer, and Mad Bomber helicopter, and forks to a boathouse where the car becomes a boat for the river.

Before reporting, the main session sent the code to a review subagent. The assistant wrote that prompt; it began:

> Review a Phaser 3 browser game in /Users/bsharpe/projects/mediastable/SpyKiller (a Spy Hunter–style arcade clone). Do NOT edit any files; report findings only.

It asked for real bugs ranked by severity, each with a file, line, and concrete failure. The review found seven, including a weapons van that could drive into the river, civilian cars that could stall forever, off-screen explosions that still shook the camera, and enemies that could pin the player against the road edge. The main session confirmed each one in the code, wrote failing tests for the civilian and van bugs, and fixed all seven.

## 3. Corrections from someone who played the original

The model's version of Spy Hunter was close but not right. Within five minutes the user corrected it from memory:

> i don't remember touching the sides of the road made you die
> instead there was a shoulder on roads that you could drive on
> if you went too far into the grass you would die

> the car replacement truck and the weapons truck would pull over to the side of the road and unload you there, where you could start from a standstill

> the civilians were fewer and tended to stay in actual lanes on the road

Each correction became a rule in `src/logic/` and a test that encodes it:

| Correction | What changed |
| --- | --- |
| Drivable shoulder | A gravel shoulder slows the car; past it, a band of grass slows it further. Only going deep into the grass crashes. Enemy cars follow the same rule, so a Road Lord ram now usually knocks the player onto the shoulder. |
| Trucks pull over | The replacement truck and the weapons van pull onto the shoulder, stop, and lower a ramp. The new car, or the newly armed one, leaves from a standstill. |
| Sparse, lane-keeping traffic | Civilians pick a painted lane, look ahead on curves to stay in it, and queue behind slower cars. About half as many spawn. |

A last request followed:

> civilians would occasionally switch lanes

Civilians now signal with amber blinkers for about a second, then change lanes only if the target lane is clear. A test drives 4.5 minutes of traffic and fails if any lane change comes without a signal or into an occupied lane.

These corrections were saved as a project memory for later sessions: match the original's rules, and flag uncertain details instead of inventing them.

## 4. How the work was checked

Three kinds of evidence kept the AI honest:

- **Tests.** 21 logic tests at the first report, 25 after the corrections. They cover determinism, scoring and penalties, the timer and spare-car rules, enemy weaknesses, the trucks, and traffic behavior.
- **Bot balance runs.** `npm run batch` plays the bot across seeds and reports deaths, kills, civilian kills, and causes of death. At the first report the bot lost about 3.4 cars per two minutes. After the corrections it was 2.8 over 10 seeds, and off-road deaths fell from 8 to 2. The session also flagged that drowning deaths had risen from 4 to 7 without tracing whether that was variation between runs.
- **The browser.** The session drove the game in Chrome by stepping frames from a script: title, gameplay, river, bridge, fork, helicopter, game over, restart, and audio, with no console errors. It said plainly that this was not real-speed play, and that how the game feels was for the user to judge.

## 5. Repository, deployment, and the title badge

The rest of the evening was release work, each step a short prompt:

> initialize git; commit all useful parts; create a private repo on my github account and push it

> add a README with controls and how to run it

> publish this on spy.instituteofmayhem.com via cloudflare

The game deployed as Cloudflare Workers static assets. `.assetsignore` is an allowlist, so only `index.html` and `src/` are public. The first deploy's rule was wrong and published only `index.html`. The session fixed it, redeployed, and added `scripts/smoke.mjs` to `npm run deploy` to check which paths return 200 and which return 404.

> can you put a "IoM" icon that links to the instituteofmayhem.com landing page on the title screen when the game is waiting to be played?

The first badge was drawn on the Phaser canvas in the top-left corner, using the window mark from the Institute's favicon. It was checked in Chrome: the badge opened the landing page, and a click elsewhere still started a run. The evening ended with:

> commit; push; deploy

## 6. Going public

On October 14, after the same finishing work on another Institute game, Battle World, the user asked in a Codex conversation:

> can you create a handoff file for another project (spy_killer) that i want to do the same thing with: - add IOM link, - make public repo, add creation documentation

A Claude Code session picked up that handoff. It replaced the canvas badge with the Institute's standard HTML badge: lower-left, 16 pixels from the left and 32 from the bottom, with mobile safe-area insets, keyboard focus, and an accessible name. The badge appears only on the title screen, and pressing Enter on it does not start a run. The session also added the MIT license and a README section on credits and licensing, and wrote this document.

## What this process demonstrates

The user set the goal and knew the original game; AI built, tested, and shipped it. The most productive prompts were short and concrete: a reusable skill to start from, a one-line standard ("same rules, better animation, same gameplay"), and corrections from first-hand memory of the original. Each correction became a test, so later changes could not quietly undo it.

The structure did much of the work. Pure, seeded rules made tests and bot runs cheap. A review subagent caught bugs before the user saw them. Browser checks covered what the tests could not. What the AI could not judge, how the game feels at real speed, it handed back to the person who had played the original.
