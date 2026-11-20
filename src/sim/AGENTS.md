# src/sim: the simulation (stream S2)

- Pure: no `document`, `window`, canvas, `HANGA` or `RiderAnim`. Every file loads in Node with no stubs and is
  imported directly by `test/sim.test.js`.
- Deterministic: randomness only through `rnd(rng)` (`core/rng.js`), time only through the `dt` the fixed
  120 Hz step (`timestep.js`) passes in. No `Math.random()`, `Date` or `performance`.
- State lives in the objects `state.js` makes (`createRider()`, `createSession()`); add new fields there with a unit
  comment, and expose them in `src/debug.js` if tests need them. No module-level state.
- Talk outwards through returned events (from B2b), not by writing the DOM or the view. Today `step.js` still
  writes the finish screen and paints ski tracks: both are `TODO(B2b)`; don't add more of that.
- No new "+y is downhill": ask the terrain (`terrain.gradient`) and the course. The heading clamp (`CARVE_LIMIT` in `step.js`)
  goes in F6.
- Tunables go in `core/config.js` (later `sim/tuning.js`), each with its unit.
- Keep the empty piste between y 460 and 740 empty: `test/physics.test.js` measures there.
- A feel change says in the PR what changed, measured through the façade at a fixed `dt`, and what to try.
