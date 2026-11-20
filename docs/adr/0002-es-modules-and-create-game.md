# ADR 0002: ES modules with no state; one game is made by createGame(env)

Date: 20 Nov 2026. Status: accepted (B2a).

## Context
After B1 the game was 16 classic scripts sharing about 140 top-level globals, in page order. That blocked everything
phase B and C need: the simulation could not be imported or run on its own, two games (a replay, a ghost, a test)
could not exist in one page or process, and any rename broke files far away. ADR 0001 already chose native ES modules
with no build step; this records how state and the browser reach those modules, because undoing it later would touch
every file.

## Decision
- Every file in `src/` is a native ES module, organised by layer (`core/`, `world/`, `sim/`, `input/`, `view/`,
  `ui/`, plus `app.js`, `debug.js`, `main.js`; layout in `docs/ARCHITECTURE.md` section 4). No bundler.
- **No module-level mutable state.** Modules export functions and frozen constants only. No top-level `let`/`var`,
  no top-level arrays, maps or objects that are not frozen.
- **`createGame(env)` (src/app.js) makes all of one game's state** as plain objects (`world`, `rider`, `session`,
  `input`, `rng`, `spray`, `timestep`, `camera`, `view`, `ui`) and passes each function the narrowest objects it needs.
  It returns the `window.Gresca` façade for that game.
- **The browser is injected.** `env` carries `document`, `window` (the event target), `localStorage`,
  `devicePixelRatio`, `requestAnimationFrame`, `setTimeout`, `HANGA` and `RiderAnim`. Only `src/main.js` reads
  browser globals and the art modules' globals, to build `env`. `localStorage` and `devicePixelRatio` are getters, so
  they are read at each use, as before (the ratio can change; touching storage can throw).
- `art/*.js` stay UMD classic scripts loaded before the entry; `main.js` passes them on through `env`.
- `src/package.json` (`{"type": "module"}`) tells Node the files are ES modules; the browser ignores it.

## Consequences
- Tests import the modules straight into Node: the pure layers with no stubs at all, and whole games through
  `createGame(env)` with stub `env`s. Games in one process are independent (`test/games.test.js`).
- `test/page.test.js` enforces the rules: one module entry, every module reachable from it, no browser globals
  outside `main.js`, no module-level state, every export a function or deeply frozen.
- A new piece of state goes in one of the state objects (or a new one made in `createGame`), never in a module.
- ES modules need http(s): `file://` was already unsupported (ADR 0001).
