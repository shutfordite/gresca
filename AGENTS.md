# Working on Gresca

Gresca is a browser ski and snowboard game: a static site on GitHub Pages with no build step and nothing to install
(`docs/adr/0001-multi-file-site.md`). It is tested mainly on an iPad through each PR's preview link.
Where things stand: `docs/STATUS.md`. The order of work: `docs/ROADMAP.md`. The architecture and work-package
definitions: `docs/ARCHITECTURE.md`. Work packages have IDs like A1, B2 and C3. Coordination method:
`.claude/skills/gresca-architect/SKILL.md`.

## Every change
- Run `npm test` (Node 22) before every commit. CI runs it and `npm run test:rotated` (the whole suite with the
  procedural map turned 37°): run that too when you touch coordinates, headings or the map.
- Never weaken, skip or delete an assertion just to make a refactor pass. If a test has to change, say why in the PR.
- One work package per PR, on its own branch (`refactor/a1-test-facade`, `design/03-…`).
  PR title: `<package id>: <what>`. In the body, list the behaviour changes (or write "none") and the test changes.
- Rebase on main before asking for review. Don't merge your own PR.
- Every PR gets a playable preview link in a bot comment. If the change is visible or changes feel, say in the PR body
  what to try in the preview (for example "jump the second big kicker and land switch").

## Files
- `art/gresca-hanga-spec.js` is the art spec, authored in this repo (since v1.4.0). Change it only as a new spec
  version: bump `version` and the header, keep changes additive (old calls give exactly the old result, checked
  against the previous version kept in `test/fixtures/`), and document them in `docs/art/HANGA-v<version>.md`.
- `index.html` is only HTML: its CSS is in `styles/*.css`, linked with `<link rel="stylesheet">` (no inline
  `<style>`). It loads `art/*.js` as classic `<script src>` tags, then the game as one ES
  module, `<script type="module" src="src/main.js">`. Every other file in `src/` is reached from `main.js` through
  static imports (`test/page.test.js` checks there are no orphans), except `src/view/look/lab.js`, which only the
  look lab `lab.html` loads (a dev page: its own small inline style and module entry; `test/lab.test.js`).
- `src/` is laid out by layer: `core/` (tunables, RNG, contracts, event bus), `world/` (terrain, course, build),
  `sim/` (rider state, step, jump, grind, spray, fixed timestep), `input/`, `view/` (camera, raycaster, sprites,
  rider, sky, ski tracks; `view/gl/` the GPU terrain), `ui/` (HUD, menu), `app.js` (`createGame(env)`: state
  objects, wiring, loop), `debug.js` (the façade; each area adds its fields in its own `fields.js`), `main.js` (entry).
  The full list is in `docs/ARCHITECTURE.md` section 4.
- **No module-level mutable state** (ADR 0002). Modules export functions and frozen constants only. All state lives
  in objects that `createGame(env)` makes; put new state there and pass it in.
- Only `src/main.js` reads browser globals (`window`, `document`, `localStorage`, `requestAnimationFrame`, …) or
  `HANGA`/`RiderAnim`. Everything else gets them from `env`.
- Each `src/` file starts with a one-line comment saying what it holds.
- No build step and no runtime npm packages. Changing that needs a decision record in `docs/adr/`. Third-party code
  the page loads is vendored unmodified and pinned in `vendor/` (three.js, ADR 0008).
- Any new folder the game loads at runtime must be added to `SITE` in `.github/workflows/preview.yml`, or previews break.
- Changes must work in Safari on iPad (the main test device): check the preview there for anything visible or touch-related.

## Code map
To change X, edit Y; the tests that cover it are Z. Folders with their own `AGENTS.md` (`src/sim`, `src/view`,
`art`) add local rules: read it before editing there.

| To change | Edit | Tests |
|---|---|---|
| Tunables (speeds, grip, camera distances, render size) | `src/core/config.js` | `physics`, `camera`, `sim` |
| Seeded randomness | `src/core/rng.js` | `sim`, `timestep` |
| Contracts: InputState, RiderState, SimEvent, Course, AnimInput | `src/core/contracts.js` (its own PR in phase 3) | `contracts`, `events` |
| Event bus, input recording | `src/core/events.js`, `src/core/input-log.js` | `contracts`, `events` |
| Terrain heights, layers, sampling | `src/world/terrain.js`, `noise.js` | `terrain`, `build` |
| Course: centreline, finish, kickers, rails of the procedural test slope; `createGridCourse(layout, …)`, the `Course` (s, d) the game asks | `src/world/course.js` (interface in `core/contracts.js`) | `course`, `sim`, `park`, `physics`, `golden` |
| The play mountain (steep, big kickers; the map the game opens on) and which map loads (`?map=test`, `createGame(env).map`, `MAPS` in `build.js`; ADR 0009) | `src/world/play-slope.js`, `src/world/build.js`, `src/main.js` | `play-slope`, `frame`, `terrain` |
| The polyline course (arc-length s, `project`, `point`, widths) and `Course.fromRun(ways)`: join, resample, curvature limit | `src/world/polyline-course.js`, `src/world/run-geometry.js` (ADR 0004, R4) | `polyline-course`, `course` |
| What the rider animation reads from the sim (`AnimInput`) | `src/sim/anim-input.js` | `course`, `rider-anim` |
| The world frame: a map's grid placed in ENU (origin, rotation), compass degrees | `src/world/map-frame.js` (ADR 0005) | `course`, `golden`, `rotated`, all with `npm run test:rotated` |
| The seam lint (no `cx`, park constants, `H[`, "+y is downhill" or the map's old axes outside the procedural map) | `test/frame.test.js` | `frame` |
| How tests see the façade (on the map's grid, through its frame) | `test/map-view.js`, `test/harness.js` | all |
| Building the world (grids, trees) | `src/world/build.js` | `build`, `terrain` |
| Riding physics: steer, grip, trees, finish, events | `src/sim/step.js` | `physics`, `sim`, `events` |
| The brake (yaw across the fall line, skid friction) and its tunables | `src/sim/brake.js`, `src/sim/tuning.js` | `brake`, `physics`, `golden` |
| Jumps, air, landing, crash, air scoring | `src/sim/jump.js` | `physics`, `park`, `sim` |
| Rails and boxes | `src/sim/grind.js` | `park`, `sim` |
| Snow spray | `src/sim/particles.js` | `features`, `sim` |
| Fixed timestep and interpolation | `src/sim/timestep.js` | `timestep`, `facade` |
| Rider and session state fields | `src/sim/state.js` (+ `src/sim/fields.js` to expose them) | `facade`, `sim` |
| Which keys and gestures do what (the one table; also read by the Controls screen) | `src/input/bindings.js` | `bindings`, `controls` |
| Touch and key controls | `src/input/input.js` (logic, reads the table), `bind-input.js` (DOM) | `features`, `sim`, `contracts`, `bindings` |
| Pause: the button, the pause panel, the hidden-page auto-pause (`hud.paused`; the loop in `app.js` honours it) | `src/ui/pause.js`, `styles/hud.css`, `index.html` | `pause` |
| The Controls screen (generated from the table; gesture diagrams) | `src/ui/controls.js`, `styles/menu.css`, `index.html` | `controls` |
| Camera follow, tilt, compass, the swing to look back (`InputState.lookBack`) | `src/view/camera.js` | `camera`, `look` |
| Terrain render, trees, rider placement | `src/view/draw.js` | `features`, `look` |
| Which renderer draws the terrain (the GPU by default, the CPU raycaster with `?renderer=cpu`) and the fallback; the `?fps=1` readout | `src/view/renderer.js`, `src/view/fps-meter.js` (ADR 0008) | `gl-terrain`, `timer` |
| The GPU terrain (E0, three.js in `vendor/three/`): projection matching the sprites, clipmap mesh, baked textures, snow and sky shaders and their Look uniforms, the trees' horizon | `src/view/gl/` (`gl-renderer.js`, `gl-projection.js`, `terrain-mesh.js`, `terrain-bake.js`, `detail-texture.js`, `snow-material.js`, `sky-material.js`, `horizon.js`, `gl-budget.js` texture memory and its budget, `context-loss.js` lost WebGL context, `track-ribbon.js` the ski track's ribbon mesh and groove shader) | `gl-terrain`, `gl-resilience`, `track-trail` (CI cannot run WebGL: check the preview) |
| Ski tracks: what the board or skis cut (T1: a ring of samples per contact line, from `boardHeading`, `travelHeading`, `skid`, braking, the rig) | `src/view/track-trail.js` (pure model); `src/view/ski-tracks.js` (the per-step hook; the CPU raycaster's colour-map track); `src/view/gl/track-ribbon.js` (the GPU ribbon) | `track-trail`, `features`, `games` |
| Every colour, terrain tone, sky and fog value, sprite colour, camera framing value, CSS token, rider projection (the Look) | `src/view/look/look.js` (interface), `src/view/look/hanga.js` (from the spec; the only reader of `HANGA`'s fields) | `look-contract`, `look-lint`, `look` |
| The look lab (every pose, yaw, pitch, tone, sprite and role) | `lab.html`, `src/view/look/lab.js` | `lab` |
| Where snow, rock and park colours are painted (until D2) | `src/view/colour-map.js` (colours from the Look) | `features`, `build` |
| Sky, sun, fog | `src/view/sky.js` | `look` |
| Flags, poles, rails on screen | `src/view/sprites.js` | `park` |
| Rider pose and body motion | `art/gresca-rider-anim.js`, `src/view/rider-animation.js` | `rider-anim` |
| Drawing the rider | `src/view/rider-draw.js` | `rider-anim` |
| Rider shapes, poses, palette (spec) | `art/gresca-hanga-spec.js` (new version only) | `hanga-v14` |
| HUD, popup, minimap | `src/ui/hud.js`, `styles/hud.css` (colours: `var(--…)` from the Look's `ui`) | `facade`, `features`, `events`, `look-lint` |
| Menu, rig and stance picker, finish screen | `src/ui/menu.js`, `styles/menu.css`, `index.html` | `park`, `page`, `events` |
| State wiring, boot, frame loop | `src/app.js` | `games`, `facade`, `timestep` |
| What tests can read and set | each area's `fields.js` (`sim/`, `view/`, `ui/`, `input/`, `world/`); `src/debug.js` composes them | `facade` |
| Named scenes (`Gresca.scene(name)`, `?scene=<name>`): fixed paused states for screenshots | `src/scenes.js` (data), `src/debug.js` | `scenes` |
| Recorded RiderState traces (`node tools/record-trace.mjs` rewrites them) | `tools/record-trace.mjs`, `test/fixtures/traces/`, loader `test/traces.js` | `traces` |
| Screenshots of every scene, board and skis, 820x1180 (`npm run shot` -> `shots/`; Playwright is dev-only, ADR 0003) | `tools/shot.mjs`, `.github/workflows/test.yml` | none (CI `shots` job on `src/view/`, `art/`, `styles/` PRs) |
| Frame time by stage (`npm run bench`, `-- --chrome` for headless Chrome), the recorded baseline, the CI regression check, pixel digests of every scene | `tools/bench/` (`core.mjs` path and stats, `baseline.json`, `compare.mjs`, `digest.mjs`); the stage timer is `view.timer` (`src/view/draw.js`) | `bench`, `timer` (CI `bench` job on PRs) |
| The mechanical PR check (asserts, golden hash, ownership, template, docs and style on new lines, smoke test; `npm run review`, `npm run smoke`); the ownership list mirrors "Who owns what" below | `tools/review/` (`checks.mjs` pure, `run.mjs`, `smoke.mjs`), `.github/workflows/pr-check.yml` | `review` (CI `PR check` job comments on every PR) |
| The baked map file `gresca-map-1` (`maps/<id>.terrain.json`): fields, height encoding, limits | `tools/map-compiler/format.js`, ADR 0006 | `map-compiler`, `map-validate` |
| Map compiler: lat/lon to ENU, resampling, piste clipping, the file | `tools/map-compiler/core.js` (pure) | `map-compiler` |
| DEM and piste sources (Terrarium PNG tiles; OpenSkiMap, Overpass) | `tools/map-compiler/sources/` | `map-compiler` |
| Map validators (pure; the game reuses them in C4): terrain `validateTerrain`, course `validateCourse` | `tools/map-compiler/validate.js` | `map-validate`, `map-course` |
| The course file `gresca-map-1` kind `course` (`maps/<id>.course.json`): constants and limits; the run behind it (piste selection, `Course.fromRun`, mean slope, horizon); `compileCourse` | `tools/map-compiler/course-format.js`, `course-run.js`, `core.js`, ADR 0010 | `map-course` |
| Baking a map: download cache, `--fetch` (run by the owner); `--course` writes the course file offline | `tools/map-compiler/cli.mjs`, `maps/sources/<id>.json` | `map-compiler`, `map-course` |
| Script loading, no orphan modules, globals | `index.html`, `src/main.js` | `page` |

Test names are `test/<name>.test.js`. Run one with `node --test test/<name>.test.js`; the whole suite is the gate.
Per area while working: `npm run test:sim`, `test:view`, `test:input`, `test:world`. To see the game, `npm run shot`
(set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chrome), then open one or two PNGs from `shots/`; or append
`?scene=<name>` to a preview link (names: `Gresca.scenes()`).

## Who owns what (from phase 3)
Each stream in `docs/ROADMAP.md` owns its folders. During phase 3 a PR edits only its stream's folders; anything
else (a contract in `src/core/`, `app.js`, `debug.js`, `index.html`) is its own small PR, merged first.

| Stream | Owns |
|---|---|
| S1 controls and UI | `src/input/`, `src/ui/`, `styles/` |
| S2 sim feel | `src/sim/` |
| S3 rider animation | `art/gresca-rider-anim.js`, the rider files in `src/view/` |
| S4 look, camera, render | `src/view/` (with `src/view/look/`) except the rider files, `art/gresca-hanga-spec.js` versions, `vendor/` |
| S5 maps | `src/world/`, `tools/`, `maps/` |
| Shared (coordinator) | `src/core/`, `src/app.js`, `src/debug.js`, `src/main.js`, `index.html`, `docs/`, `test/harness.js` |

Until then (the freeze, `docs/STATUS.md`), one code PR runs at a time and may touch any folder.

## Code rules
- Keep the layers apart: `world/` and `sim/` never touch `document`, `window`, canvas or HANGA colours,
  and load in Node with no stubs, as ES modules imported directly by tests. `view/` reads sim state but never writes it.
  The camera is not advanced inside a draw call.
- Tests use the `window.Gresca` façade for whole-game behaviour; they may import only the pure modules directly.
- Units: metres, seconds and radians internally; compass degrees only where the art spec needs them.
  Put the unit in a comment on every tunable.
- One world frame (ADR 0005): x east, y north, z up, metres; headings radians counter-clockwise from east; compass
  degrees only at the art spec (sun, `camCompass`). Don't assume which way is downhill or how the map lies: ask the
  terrain, the course's along/across coordinates (s, d) and the map frame (`world.frame`), and never index the height
  array outside the procedural map.
- No `Math.random()` or wall-clock time in the simulation. Use the seeded RNG.
- No per-frame allocations in hot loops. Anything map-sized needs a stated memory budget in the PR.
- Colours come from the Look (`src/view/look/`, ADR 0007), never copied numbers: no hex or `rgb()` literal and no
  `HANGA` outside `src/view/look/`, and CSS uses `var(--…)` tokens (`test/look-lint.test.js`).

## Style and design
Before writing or substantially changing code, read `docs/STYLE.md` (SOLID applied to a small game, readability,
formatting, naming, comments, errors, untrusted data). In short: readable over compact, 1-space indent, single
quotes, semicolons, lines under 120 characters, `const` by default, one-line JSDoc with units on exported functions.

## Token budget
Every agent session pays for what it reads and prints, so keep context small:
- `npm test` prints dots and only the failures in full. Use `npm run test:verbose` only to debug one file
  (`node --test test/<file>.test.js`), never for the whole suite.
- Never read `art/gresca-hanga-spec.js` (110 KB) or `test/fixtures/hanga-spec-v1.3.0.cjs` (89 KB) whole. Run
  `node tools/outline.mjs art/gresca-hanga-spec.js 2` for line ranges, then `sed -n 'START,ENDp'` or `grep -n`.
- Don't open the PNGs in `docs/art/` unless the package is about how the rider looks.
- Prefer `grep -n` and `sed -n` ranges to whole-file reads for any file over about 300 lines, including
  `docs/ARCHITECTURE.md`. Read only the doc sections your package names.
- Keep reports short: what changed, the proof, open questions. Don't paste diffs or test logs back.
- Before opening a PR, run `npm run review -- --title "<title>" --body-file <body.md>` and fix what it flags; the
  same report is posted on the PR by CI, and reviewers read it instead of re-checking by hand. If you change who
  owns a folder, change the table below and `OWNERS` in `tools/review/checks.mjs` together.

## Tests
- New behaviour comes with a test that fails without it. A bug fix comes with a test that reproduces the bug.
- Test behaviour through the façade or a module's public functions, not private details.
- Tests are deterministic: fixed seeds, fixed `dt`, no real timers or network.
- Pure modules (`world/`, `sim/`, `core/`) get direct unit tests; the harness is for whole-game behaviour.

## Commits and docs
- Small commits that each pass `npm test`. Message: imperative subject under 72 characters, body says why.
- Any choice that is costly to undo (a new dependency, a file format, a frame or unit convention, a change to the
  layering) gets a short ADR in `docs/adr/` in the same PR.
- Update the README, `docs/ARCHITECTURE.md` or this file in the same PR when your change makes them wrong.

## Do not break
- Tap-to-start, the Snowboard / Skis picker, and the `gresca-rig` / `gresca-stance` storage keys.
- The empty stretch of piste between grid y 460 and 740 on the procedural **test slope**, s about 470 to 760 now that s
  is arc length (the physics tests use it; `test/course.test.js` guards it). The test slope itself (`map: 'test'`, the
  harness's and every tool's map) stays as it is: the physics tests, the golden trace and the digests ride it.
- Credits and ODbL attribution for any real map data.
