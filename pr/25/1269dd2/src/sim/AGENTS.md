# src/sim: the simulation (stream S2)

- Pure: no `document`, `window`, canvas, `HANGA` or `RiderAnim`. Every file loads in Node with no stubs and is
  imported directly by `test/sim.test.js`.
- Deterministic: randomness only through `rnd(rng)` (`core/rng.js`), time only through the `dt` the fixed
  120 Hz step (`timestep.js`) passes in. No `Math.random()`, `Date` or `performance`.
- State lives in the objects `state.js` makes (`createRider()`, `createSession()`); add new fields there with a unit
  comment, and expose them in `src/sim/fields.js` if tests need them. No module-level state.
- Talk outwards only through the SimEvents `step()` returns (`core/contracts.js`, pushed with `pushEvent()`) and the
  RiderState it leaves; `ui/` and `view/` subscribe on the bus (`core/events.js`). Never write the DOM, ui or view.
- No new "+y is downhill": ask the terrain (`terrain.gradient`) and the course. The heading clamp (`CARVE_LIMIT` in `step.js`)
  goes in F6.
- Tunables go in `core/config.js` (later `sim/tuning.js`), each with its unit.
- Keep the empty piste between y 460 and 740 empty: `test/physics.test.js` measures there.
- A feel change says in the PR what changed, measured through the façade at a fixed `dt`, and what to try.
