# Working on Gresca

Gresca is a browser ski and snowboard game: a static site on GitHub Pages with no build step and nothing to install
(`docs/adr/0001-multi-file-site.md`). The owner tests it on an iPad through the preview link of one round PR.
Where things stand: `docs/STATUS.md`. The order of work: `docs/ROADMAP.md`. Architecture and package definitions:
`docs/ARCHITECTURE.md`. Package IDs look like A1, B2, C3. Coordination method: `.claude/skills/gresca-architect/SKILL.md`.

## Every change
- Run `npm test` (Node 22) before every commit. CI also runs `npm run test:rotated` (the suite on a map turned 37°
  and 300°): run it too when you touch coordinates, headings or the map.
- Never weaken, skip or delete an assertion to make a change pass. If a test has to change, say why in your report.
  The one exception is a QA test-health package, which removes a redundant assertion only by naming the test that
  still covers it (`docs/QUALITY.md`).
- Tests meet `docs/QUALITY.md`: they fail without the change, they're as cheap as they can be (a test over 1 s says
  why), and they keep the suite inside its time budget. The QA agent checks every round against it, and its BLOCK
  stops a package joining the round PR.
- One work package per branch, `s<stream>/<package>` (or `shared/<package>`). **Push the branch; don't open a PR**
  (X3): when every stream in the round has finished, the coordinator joins the branches into one round PR, with what
  changed and what to test. Your report back uses the sections of `.github/pull_request_template.md`.
- Branch from `origin/main`, or from the branch the brief names. Never force-push.
- If the change is visible or changes feel, say in the report what to try in the preview, and whether the owner's
  verdict is needed before more is built on it (feel, input and look are judged on the iPad, not by tests).
  Give the owner links, not paths: the preview URL, and for boards, images or docs
  `https://github.com/shutfordite/gresca/blob/<branch>/<path>` (the owner reviews on an iPad).
- **Don't edit `docs/STATUS.md`** on a stream branch: report what's done, what's left and any debt; the coordinator
  updates STATUS on the round branch (the PR check warns).
- Before reporting back, run `npm run review -- --title "<package id>: <what>" --body-file <report.md>` and fix what
  it flags.

## Code map
Each folder's `AGENTS.md` holds its local rules and its code map ("to change X, edit Y; the tests are Z"). Read the
one for the folder you're editing; add a row there (not here) for a new file. The PR check looks for a new file's
name in the AGENTS.md files above it.

| Area | Code map |
|---|---|
| Sim: riding physics, brake, edge, jumps, flips, grinds, spray, timestep, `AnimInput` (S2) | `src/sim/AGENTS.md` |
| View: camera, renderers, GPU terrain, ski tracks, Look, sky, sprites; rider files (S3) | `src/view/AGENTS.md` |
| Rider animation and the art spec (S3, spec versions S6) | `art/AGENTS.md` |
| Input: bindings, touch and keys (S1) | `src/input/AGENTS.md` |
| UI: HUD, menu, pause, Controls screen, air hints, `styles/` (S1) | `src/ui/AGENTS.md` |
| World: terrain, courses, play mountain, map frame, map files, map loader (S5) | `src/world/AGENTS.md` |
| Tools: golden trace, test areas, traces, shots, GPU smoke, bench, PR check, map compiler and baking | `tools/AGENTS.md` |

Shared files (the coordinator's):

| To change | Edit | Tests |
|---|---|---|
| Tunables (speeds, grip, camera distances, render size) | `src/core/config.js` | `physics`, `camera`, `sim` |
| Seeded randomness | `src/core/rng.js` | `sim`, `timestep` |
| Contracts: InputState, RiderState, SimEvent, Course, AnimInput (always their own PR, merged first) | `src/core/contracts.js` | `contracts`, `events` |
| Camera modes (A classic, B chase, C high: `CAM_MODES` in `config.js`; `gresca-cam`, `?cam=`) | `src/core/camera-modes.js`, `src/app.js` | `camera-modes` |
| Event bus, input recording | `src/core/events.js`, `src/core/input-log.js` | `contracts`, `events` |
| State wiring, boot, frame loop | `src/app.js` | `games`, `facade`, `timestep` |
| What tests can read and set: each area's `fields.js`, composed by the façade | `src/debug.js` | `facade` |
| Named scenes (`Gresca.scene(name)`, `?scene=<name>`) for screenshots | `src/scenes.js` | `scenes` |
| Script loading, no orphan modules, globals | `index.html`, `src/main.js` | `page` |
| Boot load order: three.js import and the real map fetched together (`startLoads`); the `modulepreload` list in `index.html` | `src/core/boot-loads.js`, `src/main.js`, `index.html` | `page` |
| How tests see the façade; the seam lint (no `cx`, `H[`, "+y is downhill" outside the procedural map) | `test/harness.js`, `test/map-view.js`, `test/frame.test.js` | all, `frame` |

Tests are `test/<name>.test.js`; run one with `node --test test/<name>.test.js`, an area with `npm run test:<area>`
(`sim`, `view`, `input`, `ui`, `world`, `shared`, `tools`; from the `// @areas` tag on each test's first line). The
whole suite is the gate. To see the game: `npm run shot` (CPU) or `npm run smoke:gl` (GPU, software WebGL), with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to an installed Chrome; open one or two PNGs from `shots/`.

## Who owns what (from phase 3)
Each stream owns its folders. A branch edits only its stream's folders; anything else (a contract in `src/core/`,
`app.js`, `debug.js`, `index.html`) is its own small `shared/` branch, joined into the round first.

| Stream | Owns |
|---|---|
| S1 controls and UI | `src/input/`, `src/ui/`, `styles/` |
| S2 sim feel | `src/sim/` |
| S3 rider animation | `art/gresca-rider-anim.js`, the rider files in `src/view/` |
| S4 look, camera, render | `src/view/` (with `src/view/look/`) except the rider files, `vendor/` |
| S5 maps | `src/world/`, `tools/`, `maps/` |
| S6 design and visual | `art/gresca-hanga-spec.js` versions and their notes and boards in docs/art (designs and specs; no render code) |
| Shared (coordinator) | `src/core/`, `src/app.js`, `src/debug.js`, `src/main.js`, `index.html`, `docs/`, `test/harness.js` |

If you change who owns a folder, change this table and `OWNERS` in `tools/review/checks.mjs` together.

## Code rules
- Layers: `world/` and `sim/` never touch `document`, `window`, canvas or HANGA colours, and load in Node with no
  stubs. `view/` reads sim state but never writes it. The camera is not advanced inside a draw call.
- **No module-level mutable state** (ADR 0002): modules export functions and frozen constants; state lives in the
  objects `createGame(env)` makes. Only `src/main.js` reads browser globals or `HANGA`/`RiderAnim`; the rest use `env`.
- `index.html` is only HTML (CSS in `styles/`); every `src/` file is reached from `src/main.js` by static imports,
  has a `modulepreload` line in `index.html` (`test/page.test.js` checks the list) and starts with a one-line comment
  saying what it holds. A new folder loaded at runtime goes in `SITE` in
  `.github/workflows/preview.yml`.
- No build step and no runtime npm packages; vendored code is pinned and unmodified in `vendor/`. Changing that, or
  anything costly to undo (a format, a frame or unit convention, the layering), needs an ADR in `docs/adr/`.
- Units: metres, seconds, radians, with the unit in a comment on every tunable. One world frame (ADR 0005): x east,
  y north, z up; headings counter-clockwise from east; compass degrees only at the art spec. Never assume which way
  is downhill: ask the terrain, the course's (s, d) and `world.frame`.
- No `Math.random()` or wall-clock time in the sim. No per-frame allocations in hot loops. Anything map-sized states a
  memory budget in the PR.
- Colours come from the Look (`src/view/look/`, ADR 0007): no hex or `rgb()` literal and no `HANGA` outside it; CSS
  uses `var(--…)` tokens.
- The art spec (`art/gresca-hanga-spec.js`) changes only as a new, additive version (`art/AGENTS.md`).
- The loop draws only when something can change (G3): a change to the picture outside a run, or while paused, calls
  the game's `requestDraw()`.
- Changes must work in Safari on iPad.

## Style
Read `docs/STYLE.md` before writing or substantially changing code. In short: readable over compact, 1-space indent,
single quotes, semicolons, lines under 120 characters, `const` by default, one-line JSDoc with units on exports.
Object literals and calls that several streams extend put one property per line.

## Token budget
- `npm test` is quiet (dots, failures in full). Use `npm run test:verbose` only on one file.
- Never read `art/gresca-hanga-spec.js` (110 KB) or `test/fixtures/hanga-spec-v1.3.0.cjs` whole: use
  `node tools/outline.mjs <file> 2`, then `sed -n` or `grep -n`. Same for any file over about 300 lines.
- Don't open `docs/art/` PNGs unless the package is about how the rider looks.
- Reports are short: what changed, the proof, open questions, debt. No pasted diffs or test logs.

## Tests
- New behaviour comes with a test that fails without it; a bug fix with a test that reproduces it.
- Test through the façade or a module's public functions. Deterministic: fixed seeds and `dt`, no timers or network.

## Commits and docs
- Small commits that each pass `npm test`. Imperative subject under 72 characters; the body says why.
- Update the README, `docs/ARCHITECTURE.md` or the AGENTS.md files in the same PR when your change makes them wrong.

## Do not break
- Tap-to-start, the Snowboard / Skis picker, and the `gresca-rig` / `gresca-stance` storage keys.
- The procedural **test slope** (`map: 'test'`, the map of the harness and every tool) stays as it is, with its empty
  piste between grid y 460 and 740 (s about 470 to 760): the physics tests, golden trace and digests ride it.
- Credits and ODbL attribution for any real map data.
