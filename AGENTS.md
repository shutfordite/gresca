# Working on Gresca

Gresca is a browser ski and snowboard game: a static site on GitHub Pages with no build step and nothing to install
(`docs/adr/0001-multi-file-site.md`). It is tested mainly on an iPad through each PR's preview link.
The plan is in `docs/ARCHITECTURE.md`. Work packages have IDs like A1, B2 and C3.

## Every change
- Run `npm test` (Node 22) before every commit. CI runs the same command.
- Never weaken, skip or delete an assertion just to make a refactor pass. If a test has to change, say why in the PR.
- One work package per PR, on its own branch (`refactor/a1-test-facade`, `design/03-…`).
  PR title: `<package id>: <what>`. In the body, list the behaviour changes (or write "none") and the test changes.
- Rebase on main before asking for review. Don't merge your own PR.
- Every PR gets a playable preview link in a bot comment. If the change is visible or changes feel, say in the PR body
  what to try in the preview (for example "jump the second big kicker and land switch").

## Files
- `art/gresca-hanga-spec.js` belongs to the art spec. Change it only to sync a new spec version, byte for byte.
- `index.html` is only HTML and CSS. It loads `art/*.js` and then the game's `src/*.js` with plain classic
  `<script src>` tags (no `type="module"`, `defer` or `async` until B2). The files share one set of top-level globals
  and run in page order, so order matters: a file may only use, while it loads, what earlier files declare.
  `test/page.test.js` lists the order; a new file in `art/` or `src/` goes in both places.
- Each `src/` file starts with a one-line comment saying what it holds.
- No build step and no runtime npm packages. Changing that needs a decision record in `docs/adr/`.
- Any new folder the game loads at runtime must be added to `SITE` in `.github/workflows/preview.yml`, or previews break.
- Changes must work in Safari on iPad (the main test device): check the preview there for anything visible or touch-related.

## Code rules
- Keep the layers apart: `world/` and `sim/` never touch `document`, `window`, canvas or HANGA colours,
  and must load in Node with no stubs (after B2, as ES modules imported directly by tests). `view/` reads sim state but never writes it.
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
