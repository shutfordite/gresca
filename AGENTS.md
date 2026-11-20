# Working on Gresca

Gresca is a browser ski and snowboard game. Players get one `index.html` with nothing to build or install.
The plan is in `docs/ARCHITECTURE.md`. Work packages have IDs like A1, B2 and C3.

## Every change
- Run `npm test` (Node 22) before every commit. CI runs the same command.
- Never weaken, skip or delete an assertion just to make a refactor pass. If a test has to change, say why in the PR.
- One work package per PR, on its own branch (`refactor/a1-test-facade`, `design/03-…`).
  PR title: `<package id>: <what>`. In the body, list the behaviour changes (or write "none") and the test changes.
- Rebase on main before asking for review. Don't merge your own PR.

## Files
- `art/gresca-hanga-spec.js` belongs to the art spec. Change it only to sync a new spec version, byte for byte.
- `art/*.js` is embedded into `index.html`. After changing it, run `node tools/embed-art.js`; a test fails if they drift.
- Until B1 lands, the game code is the last `<script>` in `index.html`. After B1, never hand-edit `index.html`:
  edit `src/` or `art/`, then run `node tools/build.js`.
- No npm packages and no build step for players. Changing that needs a decision record in `docs/adr/`.

## Code rules
- Keep the layers apart: `world/` and `sim/` never touch `document`, `window`, canvas or HANGA colours,
  and must load in Node with `require` and no stubs. `view/` reads sim state but never writes it.
  The camera is not advanced inside a draw call.
- Tests use the `window.Gresca` façade (after A1), not game globals.
- Units: metres, seconds and radians internally; compass degrees only where the art spec needs them.
  Put the unit in a comment on every tunable.
- Don't add new code that assumes +y is downhill or indexes the height array directly. Use the terrain
  interface and the course's along/across coordinates (after B3 and C1).
- No `Math.random()` or wall-clock time in the simulation. Use the seeded RNG.
- No per-frame allocations in hot loops. Anything map-sized needs a stated memory budget in the PR.
- Colours come from palette roles and values from `HANGA`, never copied numbers.

## Do not break
- Tap-to-start, the Snowboard / Skis picker, and the `gresca-rig` / `gresca-stance` storage keys.
- The empty stretch of piste between y 460 and 740 on the procedural map (the physics tests use it).
- Credits and ODbL attribution for any real map data.
