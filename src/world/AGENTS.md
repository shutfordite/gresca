# src/world: terrain, courses and maps (stream S5)

- Pure: no `document`, `window`, canvas or `HANGA`; loads in Node with no stubs. No `fetch` here (ADR 0011): files
  reach the world through `env`.
- One world frame (ADR 0005). Index the height array (`H[…]`) only inside the procedural map; everything else asks the
  terrain, the `Course` (s, d) and `world.frame` (`test/frame.test.js` lints this).
- The procedural **test slope** stays as it is (root `AGENTS.md`, "Do not break"); `test/course.test.js` guards it.
- Real map data keeps its credits and ODbL attribution (`world.credits`). Map-sized structures state a memory budget.

## Code map
| To change | Edit | Tests |
|---|---|---|
| Terrain heights, layers, sampling | `terrain.js`, `noise.js` | `terrain`, `build` |
| The procedural test slope's course (centreline, finish, kickers, rails); `createGridCourse`, the `Course` (s, d) | `course.js` (interface in `core/contracts.js`) | `course`, `sim`, `park`, `physics`, `golden` |
| The play mountain (the map the game opens on) and which map loads (`?map=test`, `MAPS`; ADR 0009): pitches per park line, straight centreline through the park, no kickers | `play-slope.js`, `build.js`, `src/main.js` | `play-slope`, `frame`, `terrain` |
| **The park (K1, ADR 0012)**: jump snow shapes (takeoff cubic to the lip angle, table or gap, knuckle, landing parabola into the base snow, run-out, groomed sidewalls, the mega ramp's drop-in) | `park/jump-shape.js` | `park-shapes`, `park-play` |
| Sizing a jump from its size, lip speed and slope: the landing catches a rider at `designSpeed` (horizontal speed at the lip) in its middle third, flown with the sim take-off model of K2; the roadmap's size table (`sizeSpec`) | `park/jump-design.js` | `park-shapes` |
| Rail and box lines (straight, down, flat-down, down-flat-down, flat-down-flat, rainbow, C, S; flat, down, kinked, rainbow boxes) as `{s, d, h}` polylines, 0.3 to 1.5 m high | `park/rail-shapes.js` | `park-shapes` |
| The terrain's `features` layer and the resolved park of one world (`createPark`, built by `buildWorld`; `course.features` reads it) | `park/park-layer.js`, `build.js`, `polyline-course.js` | `park-play`, `park-features` |
| The play mountain's park layout: S, M and L jump lines with the speed at each lip, the jib section, the mega ramp | `park/play-park.js`, `play-slope.js` (`PITCH`) | `park-play` |
| **The park surface (one definition, K1 and K3)**: every feature height is above the BASE snow, the terrain without its `features` layer (`createPark(baseHeight)`). Stamped snow = base + `jump-shape`; a rail's world point = base + `h`; nothing else is added, so the two never differ or count a jump twice. K3 grinds on `course.features.rails[i].world`. | `park/park-layer.js` | `park-play` |
| The polyline course and `Course.fromRun(ways)` (ADR 0004, R4) | `polyline-course.js`, `run-geometry.js` | `polyline-course`, `course` |
| The world frame: a map's grid placed in ENU, compass degrees | `map-frame.js` (ADR 0005) | `course`, `golden`, `rotated` (`npm run test:rotated`) |
| Loose snow: powder depth off the piste, light or deep (`terrain.powder`, `POWDER`, `snowKind`) | `snow.js` | `snow`, `terrain` |
| Building the world (grids, trees) | `build.js` | `build`, `terrain` |
| The baked terrain file `gresca-map-1` (fields, height encoding, limits; ADR 0006) | `map-file/format.js` | `map-compiler`, `map-validate` |
| Map validators (terrain and course) | `map-file/validate.js` | `map-validate`, `map-course` |
| Park features (ADR 0012): a course's jumps and rails resolved to world points (`resolveFeatures`, `NO_FEATURES`); the checks are `checkParkFeatures` in `core/contracts.js` | `park-features.js`, `map-loader.js` | `park-features`, `map-loader`, `contracts` |
| The course file (ADR 0010; version 2 adds `features`, ADR 0012) and the run behind it | `map-file/course-format.js`, `map-file/course-run.js` | `map-course` |
| Loading a real map (C4a, ADR 0011): files to a world, progress per chunk (`loadMapSteps`) | `map-loader.js`, `map-trees.js` | `map-loader` |
| The corridor detail layer (2 m tiles within 150 m of the piste, LRU, 60 MB budget) | `corridor-layer.js` | `map-loader` |
| What tests can read of the world | `fields.js` | `facade` |
