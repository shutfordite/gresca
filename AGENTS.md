# Working on Gresca

Gresca is a browser ski and snowboard game: a static site on GitHub Pages with no build step and nothing to install
(`docs/adr/0001-multi-file-site.md`). It is tested mainly on an iPad through each PR's preview link.
Where things stand: `docs/STATUS.md`. The order of work: `docs/ROADMAP.md`. The architecture and work-package
definitions: `docs/ARCHITECTURE.md`. Work packages have IDs like A1, B2 and C3. Coordination method:
`.claude/skills/gresca-architect/SKILL.md`.

## Every change
- Run `npm test` (Node 22) before every commit. CI runs the same command.
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
  static imports (`test/page.test.js` checks there are no orphans).
- `src/` is laid out by layer: `core/` (tunables, RNG), `world/` (terrain, course, build), `sim/` (rider state,
  step, jump, grind, spray, fixed timestep), `input/`, `view/` (camera, raycaster, sprites, rider, sky), `ui/` (HUD,
  menu), `app.js` (`createGame(env)`: state objects, wiring, loop), `debug.js` (the façade), `main.js` (entry).
  The full list is in `docs/ARCHITECTURE.md` section 4.
- **No module-level mutable state** (ADR 0002). Modules export functions and frozen constants only. All state lives
  in objects that `createGame(env)` makes; put new state there and pass it in.
- Only `src/main.js` reads browser globals (`window`, `document`, `localStorage`, `requestAnimationFrame`, …) or
  `HANGA`/`RiderAnim`. Everything else gets them from `env`.
- Each `src/` file starts with a one-line comment saying what it holds.
- No build step and no runtime npm packages. Changing that needs a decision record in `docs/adr/`.
- Any new folder the game loads at runtime must be added to `SITE` in `.github/workflows/preview.yml`, or previews break.
- Changes must work in Safari on iPad (the main test device): check the preview there for anything visible or touch-related.

## Code rules
- Keep the layers apart: `world/` and `sim/` never touch `document`, `window`, canvas or HANGA colours,
  and load in Node with no stubs, as ES modules imported directly by tests. `view/` reads sim state but never writes it.
  The camera is not advanced inside a draw call.
- Tests use the `window.Gresca` façade for whole-game behaviour; they may import only the pure modules directly.
- Units: metres, seconds and radians internally; compass degrees only where the art spec needs them.
  Put the unit in a comment on every tunable.
- Don't add new code that assumes +y is downhill or indexes the height array directly. Use the terrain
  interface and the course's along/across coordinates (after B3 and C1).
- No `Math.random()` or wall-clock time in the simulation. Use the seeded RNG.
- No per-frame allocations in hot loops. Anything map-sized needs a stated memory budget in the PR.
- Colours come from palette roles and values from `HANGA`, never copied numbers.

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
- The empty stretch of piste between y 460 and 740 on the procedural map (the physics tests use it).
- Credits and ODbL attribution for any real map data.
