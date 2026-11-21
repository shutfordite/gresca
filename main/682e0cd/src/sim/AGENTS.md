# src/sim: the simulation (stream S2)

- Pure: no `document`, `window`, canvas, `HANGA` or `RiderAnim`. Every file loads in Node with no stubs and is
  imported directly by `test/sim.test.js`.
- Deterministic: randomness only through `rnd(rng)` (`core/rng.js`), time only through the `dt` the fixed
  120 Hz step (`timestep.js`) passes in. No `Math.random()`, `Date` or `performance`.
- State lives in the objects `state.js` makes (`createRider()`, `createSession()`); add new fields there with a unit
  comment, and expose them in `src/sim/fields.js` if tests need them. No module-level state.
- Talk outwards only through the SimEvents `step()` returns (`core/contracts.js`, pushed with `pushEvent()`) and the
  RiderState it leaves; `ui/` and `view/` subscribe on the bus (`core/events.js`). Never write the DOM, ui or view.
- World frame (ADR 0005): ENU metres, headings counter-clockwise from east, right turns clockwise. No "+y is
  downhill" and no fixed axes: ask the terrain (`terrain.gradient`), the course and `world.frame`. The heading clamp
  (`CARVE_LIMIT` in `step.js`, measured from the frame's across axis) goes in F6.
- Tunables go in `core/config.js`, or in `sim/tuning.js` for sim feel (the brake so far), each with its unit.
- The brake (F5) is `brake.js`: `input.brake` is analog 0..1; it yaws the board across the fall line (`rider.fallLine`'s
  source, `course.fallLine`) and wears the sideways slip off as speed, so `travelHeading` keeps its direction while
  `boardHeading` turns. There is no fixed brake deceleration and no brake gravity cut.
- Keep the empty piste between s 460 and 740 empty: `test/physics.test.js` measures there.
- A feel change says in the PR what changed, measured through the façade at a fixed `dt`, and what to try.
