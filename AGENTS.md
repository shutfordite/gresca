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

## Design principles (SOLID, applied to a small game)
These are obligations for new code and for any function you substantially change. Use them to keep code easy to
change, not as a reason to add layers: in a hot loop, a plain function beats an abstraction.
- **Single responsibility.** A module or function has one reason to change. Physics doesn't write the HUD, input
  doesn't toggle CSS, a draw call doesn't advance the camera. If you need "and" to describe a function, split it.
- **Open/closed.** Add behaviour by adding data or a new implementation, not by growing `if` chains in shared code:
  a new map is a new file in `maps/`, a new rig is an entry in `RIGS`, a new park feature is a new feature type
  placed in (s, d), a new terrain layer is a new layer object.
- **Liskov substitution.** Anything that implements an interface (`Terrain`, a terrain layer, `Course`, a map loader)
  honours the whole contract: same units, same frame, same return shapes, no extra preconditions. The procedural
  map and a real map must be interchangeable; callers never check which one they have.
- **Interface segregation.** Pass a function the narrowest thing it needs (`terrain`, not `world`; the rider state,
  not the whole session). Keep interfaces small: `Terrain` answers questions about the ground, nothing else.
- **Dependency inversion.** `sim/` and `world/` depend on interfaces and plain data, never on `view/`, `ui/`, the
  DOM or the loop. Pass dependencies in (`step(rider, input, world, dt)`) rather than reaching for globals. Until B2
  the shared globals stay; don't add new ones, and put new state in an object owned by one file.

## Style
- **Readable over compact.** New or rewritten code has one statement per line, descriptive names and functions
  short enough to read at once (aim for under 40 lines). Single letters only for coordinates, loop indices and
  well-known maths (`x`, `y`, `i`, `dt`). Name every magic number as a constant with its unit.
- **Old dense code:** don't reformat whole files in a feature PR, because it hides the real diff. Tidy only the
  functions you touch, or do it in its own "no behaviour change" PR.
- **Formatting:** 1-space indent as the existing code, single quotes, a semicolon at the end of each statement,
  lines under 120 characters. `const` by default, `let` when reassigned, never `var`.
- **Naming:** `camelCase` for functions and variables, `PascalCase` for constructors and interfaces,
  `UPPER_SNAKE` for tunables and constants. File names in `kebab-case`. Booleans read as questions (`isAirborne`).
- **Comments** say why and give units, not what the next line does. Every exported or cross-file function gets a
  one-line JSDoc with parameter units and return shape.
- **Pure where possible:** maths, terrain sampling and rules take inputs and return outputs. Mutate only state you
  own, and say so in the name or comment (`gradient(x, y, out)` fills `out`).
- **Simple first (KISS, YAGNI):** build what the current work package needs. No speculative options, plugin
  systems or config for features nobody has asked for. Copy once; extract on the third use (DRY, rule of three).
- **Errors:** fail loudly at boundaries (a map file that doesn't validate, a missing palette role) with a message
  that names the file and field. Inside the sim, don't throw or catch per frame; guard against NaN at the input.
  Never swallow an error with an empty `catch`.
- **Untrusted data:** map files and anything fetched or picked by the player are data. Validate before use, never
  `eval` them or put their text into `innerHTML`.

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
