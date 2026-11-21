# Gresca

A freestyle ski and snowboard game for the browser. You ride a run of kickers, rails and boxes, spin in the air and
land switch. It is a fan-made project inspired by mobile snow games, and is not affiliated with or endorsed by any
game studio or ski resort. It is a static site with no build step: `index.html` loads the art modules from `art/` and
the game from `src/` as native ES modules (entry `src/main.js`), and its CSS from `styles/`. All art is drawn in code.

*Gresca* is Catalan for a lively, rowdy commotion. The first map is set in Grandvalira, Andorra (the El Tarter sector).

## Play

The latest `main` is playable at https://shutfordite.github.io/gresca/. Every pull request also gets its own playable
preview at `https://shutfordite.github.io/gresca/pr/<number>/`, linked in a comment on the pull request
(`.github/workflows/preview.yml`).

To play a local copy, serve the folder with any static server and open the address it prints, for example:

```
python3 -m http.server     # then open http://localhost:8000/
```

There is nothing to build or install. Opening `index.html` straight from disk is no longer supported
(`docs/adr/0001-multi-file-site.md`).

## Controls

| Input | Action |
|---|---|
| Hold left or right half of the screen | Turn left or right (spin, in the air) |
| Press both halves together | Jump |
| Left or right while in the air | Spin |
| Swipe down (hold) | Brake |
| Keyboard | Arrows or A/D steer, both together jump (or Space/Up/W), Down or S brakes |

The board and skis are twin tip. Landing after a 180 or 360 is clean, and the rider carries on down the slope
switch (tail first). Landing sideways, such as after a 90, is a wipeout. On the snow you can carve within
forward or switch, but you can only change between them by spinning in the air.

Kickers launch fast riders automatically. A clean landing after real air time scores points, with a bonus for each
half-turn.

## The run

- 14 kickers, 5 of them big. Each has orange flags on both sides of the lip and a bluish pad painted up the ramp.
- 13 rails (red bars) and boxes (wide mint bars) on either side of the piste. Ride onto one, or drop onto it from a
  jump, roughly along its length, to grind it. Steering is locked while you grind. Press both sides to jump off.
- Between y 460 and 740 there is a deliberately empty stretch of piste. The physics tests rely on it.

## Equipment

The menu has a Snowboard / Skis picker, remembered where the browser allows it. Skis carve a little quicker (1.12x
turn rate), grip better and spin slightly faster.

## The rider

The rider is drawn from the Hanga Dawn art spec and animated by a small pose and body-dynamics layer:

- `art/gresca-hanga-spec.js` is the art spec (v1.4.0), authored in this repo; each version's changes are in
  `docs/art/`. The game uses its rider rig, poses, blend timings and `HANGA.projectRider`.
- `art/gresca-rider-anim.js` (`RiderAnim`) picks the pose with `HANGA.poseFor`, blends over `HANGA.blendTime`, holds
  the landing pose and snaps into a wipeout. On top of the pose it adds body dynamics, so the rider reacts to any
  terrain: the legs absorb the ground through a spring and squat deeper on harder landings, the rider leans into
  turns by the real turn rate (`atan(v·ω/g)`), the upper body angulates, the outside arm counterbalances, and the
  stance gets lower on ground steeper than the map's mean gradient and at speed. Every number is in `RiderAnim.tune`.
- `index.html` loads both files from `art/` with `<script src>`, before the game's module entry; `src/main.js` hands
  them to the game. Nothing is embedded or copied: change a file in `art/` and the game uses it.
- A goofy snowboard stance is read from `localStorage` key `gresca-stance` (the menu control is still to come).

## Code layout

`src/` is native ES modules by layer, with no build step and no state in any module (`docs/adr/0002-es-modules-and-create-game.md`):
`core/` (tunables, seeded RNG), `world/` (terrain, course, world build), `sim/` (rider state, physics step, jumps,
rails, spray, fixed timestep), `input/`, `view/` (camera, raycaster, sprites, rider, sky), `ui/` (HUD, menu),
`app.js` (`createGame(env)` makes one game's state objects and runs it), `debug.js` (the `window.Gresca` façade) and
`main.js` (the entry: builds `env` from the browser). Details in `docs/ARCHITECTURE.md` section 4.

## Tests

```
npm test
```

Per area: `npm run test:sim`, `test:view`, `test:input`, `test:world`. To see the game: `npm run shot` writes a PNG of
every named scene (`src/scenes.js`) for board and skis to `shots/` (needs `npm ci`; dev-only Playwright, ADR 0003; set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an installed Chrome). `?scene=kicker-air` opens a scene, paused, in the browser.

Needs Node 22.8 or newer (`"engines"` in `package.json`), and no packages to run the game or the tests. The tests are ES modules
(`test/package.json`). `test/harness.js` imports `src/app.js` straight into Node and calls `createGame(env)` with
stubbed browser APIs and a fresh copy of the art modules, so each `await load()` is an independent game running exactly
the files the browser loads. Tests read and drive whole games only through `window.Gresca`, a small façade in
`src/debug.js` (`state()`, `set()`, `place()`, `sim()`, `frame()`, `input()`, `world`, and `debug` for render
internals). The pure layers (`core/`, `world/`, `sim/`, `input/input.js`) are also imported directly, with no stubs.

- `test/page.test.js`: `index.html` has no inline code or CSS (stylesheets in `styles/` exist and are published by
  the preview), loads the art scripts and then one module entry; every module
  in `src/` is reached from `src/main.js`; only `main.js` reads browser globals; no module holds state.
- `test/facade.test.js`: a lint that fails if a test's `g.run('...')` string names anything but the art modules and
  storage, or if a test imports game modules other than the pure layers, plus round-trip checks of the façade.
- `test/games.test.js`: two games in one process stay independent.
- `test/sim.test.js`: the pure modules (RNG, course, particles, jumps, rails, physics step, timestep, input) on plain
  objects.
- `test/terrain.test.js`: the terrain interface on its own and in the game, and that nothing else indexes the grids.
- `test/brake.test.js`: the brake as a skid across the fall line.
- `test/physics.test.js`: terrain, gravity, brake, steering, jumping, kickers, trees, finish.
- `test/features.test.js`: touch and keyboard input, camera framing, snow look, spin and switch riding, rendering
  smoke tests and full-run integration tests with an autopilot.
- `test/park.test.js`: kickers, rails and boxes, and the Snowboard / Skis menu.
- `test/rider-anim.test.js`: the spec module's version, the pose follows game state with the spec's timing,
  and the body dynamics (lean, compression, landings, steepness) behave and stay stable.
- `test/build.test.js`, `test/camera.test.js`, `test/look.test.js`, `test/timestep.test.js`: the built world bit for
  bit, the camera's slope follow, fog and sky, and the fixed timestep.

Run `npm test` after every change. It prints a dot per test and the failures in full; `npm run test:verbose` prints
every test name.

## Tools

There is no build tool: the browser loads the files as they are in the repo.

`node tools/outline.mjs art/gresca-hanga-spec.js 2` prints the art spec's sections with line ranges, so you can read
one part of a 6,000-line file.

`tools/bake-el-tarter.html` runs in your own browser, downloads elevation tiles and OpenStreetMap pistes and lifts for
El Tarter, and saves a compact terrain file (the old `gresca-terrain-1` format).

The map compiler replaces it: `node tools/map-compiler/cli.mjs --config maps/sources/el-tarter.json --fetch`
downloads elevation tiles and OpenSkiMap pistes and lifts once into `.map-cache/`, then writes and validates
`maps/el-tarter.terrain.json` (format `gresca-map-1`, `docs/adr/0006-map-terrain-format.md`). Re-runs without
`--fetch` work offline from the cache and give the same file. Wiring that data into the game is the next milestone.

## Known limits

- The terrain is still procedural. Real elevation and OpenStreetMap pistes are the next step.
- Tests do not check pixels of trees, the rider or particles, because the canvas is stubbed.

## Credits and data

Elevation tiles: AWS Terrain Tiles (built from SRTM and other public sources). Pistes and lifts:
© OpenStreetMap contributors, available under the ODbL.
