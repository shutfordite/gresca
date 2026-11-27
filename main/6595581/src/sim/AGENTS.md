# src/sim: the simulation (stream S2)

- Pure: no `document`, `window`, canvas, `HANGA` or `RiderAnim`. Every file loads in Node with no stubs and is
  imported directly by `test/sim.test.js`.
- Deterministic: randomness only through `rnd(rng)` (`core/rng.js`), time only through the `dt` the fixed
  120 Hz step (`timestep.js`) passes in. No `Math.random()`, `Date` or `performance`.
- State lives in the objects `state.js` makes (`createRider()`, `createSession()`); add new fields there with a unit
  comment, and expose them in `src/sim/fields.js` if tests need them. No module-level state.
- Talk outwards only through the SimEvents `step()` returns (`core/contracts.js`, pushed with `pushEvent()`) and the
  RiderState it leaves; `ui/` and `view/` subscribe on the bus (`core/events.js`). Never write the DOM, ui or view.
- World frame (ADR 0005): ENU metres, headings counter-clockwise from east, right turns clockwise; yaw rates and
  `rider.edge` are counter-clockwise + (a left turn). No "+y is downhill" and no fixed axes: ask the terrain
  (`terrain.gradient`), the course and `world.frame`. There is no heading clamp (gone in F6): measure from the fall line.
- The edge and carve (F6, H2) is `edge.js`: the steer sets a target edge, capped where the carve would ask more than the
  snow holds (`edgeCap`); `rider.edge` tips toward it at the rig's `edgeRate` and flattens at its `releaseRate`, so a
  held steer builds the turn. The carve wants speed / R with R = `sidecut` / sin(edge); `rider.yawRate` follows that
  over the rig's `yawLag` (inertia), slower sunk in powder.
- The snow contact (H2) is `contact.js`: powder ploughs the sideways slip, then the edge holds up to `edgeGrip` times
  `edgeBite(edge)` (less sunk in powder) or slides, taking only `skidGrip` of that. Nothing is turned into speed along
  the equipment: gravity across it is held, not banked. Loose snow (`terrain.powder`, `rider.snowDepth`) sinks the
  equipment (`rider.sink`, planing up toward `rig.float`) and drags it. Rig data is in `RIGS`.
- Tunables go in `core/config.js`, or in `sim/tuning.js` for sim feel (the brake, the edge, the snow), each with its unit.
- The brake (F5, H2) is `brake.js`: `input.brake` is analog 0..1; it yaws the board across the fall line
  (`rider.fallLine`'s source, `course.fallLine`), slower at speed, and wears the sideways slip off at a snow friction
  that does not grow with speed (momentum: about v² / 2a to stop), so `travelHeading` keeps its direction while
  `boardHeading` turns. Powder weakens the edge but adds its wall. No brake gravity cut.
- Keep the empty piste between s 460 and 740 empty: `test/physics.test.js` measures there.
- A feel change says in the PR what changed, measured through the façade at a fixed `dt`, and what to try.

## Code map
| To change | Edit | Tests |
|---|---|---|
| Riding physics: steer, grip, trees, finish, events | `step.js` | `physics`, `sim`, `events` |
| The brake (yaw across the fall line, skid friction) and its tunables | `brake.js`, `tuning.js` | `brake`, `physics`, `golden` |
| The edge and carve (edge angle and its cap, carve radius from the sidecut, turn-rate inertia); rig data in `RIGS` (`core/config.js`) | `edge.js`, `tuning.js` | `edge`, `snow-ride`, `physics`, `park`, `golden` |
| The snow contact: edge hold and skid, powder sink, plough and drag (`SNOW`) | `contact.js`, `tuning.js` | `snow-ride`, `edge`, `brake`, `golden` |
| Jumps, air, landing, crash, air scoring; flips (`flipRot`, the ±40° landing window, trick names); the air's gravity is `JUMP_GRAVITY` in `core/config.js` (world/ sizes landings with it, ADR 0012) | `jump.js`, `tuning.js` (`FLIP`) | `physics`, `park`, `sim`, `flip` |
| Rails and boxes (`rider.grind` is `{r, t, seg, style, balance}`; K3 reads park rails' world points only, ADR 0012) | `grind.js` | `park`, `sim` |
| Snow spray (puff size `r` and life; powder plumes are emitted in `step.js`) | `particles.js` | `features`, `sim`, `snow-ride` |
| Fixed timestep and interpolation | `timestep.js` | `timestep`, `facade` |
| Rider and session state fields (+ `fields.js` to expose them to tests) | `state.js`, `fields.js` | `facade`, `sim` |
| What the rider animation reads from the sim (`AnimInput`) | `anim-input.js` | `course`, `rider-anim` |
