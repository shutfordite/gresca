# ADR 0005: one world frame (ENU), with each map placed in it by a MapFrame

Date: 21 Nov 2026. Status: accepted (C2).

## Context
Until C2 every coordinate was the procedural map's own: x across the map, y down the run, headings from +x towards
+y. The art spec (`HANGA.frame`) and real map data (C1, C4) use east-north-up, and the game converted only for the
camera's compass (`camCompass()`, "world y = −game y"). ADR 0004 left axis assumptions behind on purpose: the run
start and `Gresca.place()` at heading π/2 with speed in +vy, the camera's start heading 1.57, the big kickers' ramp
flags 8 m up map y, and `keepOnMap` clamping map y. A real map, or the same map lying another way, would break them.

## Decision
- **The world frame is east-north-up metres:** x east, y north, z up. The sim, the view, the UI and the façade use
  it for every position, velocity, gradient and direction.
- **Headings are radians counter-clockwise from east** (the maths angle from +x). Compass degrees are
  `(90 − deg(heading)) mod 360` (`compassDeg()` in `world/map-frame.js`), and appear only at the art spec's boundary:
  the camera's compass (`camCompass()`) and the sun. Turning right is clockwise, so it lowers the heading; the air
  spin count `rotation` keeps "+ to the right", as the animation and scoring read it.
- **Each map is authored on its own grid and placed by a frozen `MapFrame`** (`createMapFrame({originX, originY,
  rotation})`): grid u runs along the columns and v down the rows (on the procedural map: u across the piste, v down
  it, today's game x and y). Rows run down the page, so the grid is mirrored against the world: grid (u, v) is world
  (u, −v), turned by `rotation` (rad, counter-clockwise) and moved to the origin. A grid heading (clockwise from +u)
  is `rotation − heading`. `Terrain.grid(data, nx, ny, cellM, frame)` samples through the frame; the course, the
  trees lookup, the colour map texture and the minimap are placed by the same frame. A grid with no frame (unit-test
  planes) is grid = world.
- **Default placement:** origin (0, 0), rotation 0, so the procedural piste runs downhill to the south (v → −y),
  as the spec's note "world x = game x, world y = −game y" said. At the default placement every conversion is exact
  (x = u, y = −v with no rounding), and the trace is bit for bit what it was (`test/golden.test.js`, unchanged hash).
- **What replaced the assumptions:** the run start, `place()`'s default heading and the camera's start come from the
  frame (`frame.downhill`, the world heading of grid +v; the start speed is the grid vector (0, 2 m/s) turned into
  the world); the carve limit is measured from the frame's across axis (`frame.rotation`; F6 moves it to the fall
  line); the ramp flags are offset along the frame's axes; `keepOnMap` clamps to the map's rectangle
  (`terrain.bounds`: corner, unit axes, width and length). `test/frame.test.js` bans the old idioms.
- **The sun:** its azimuth comes from `HANGA.maps[id].sun`. The procedural map is fictional, so its sun is fixed to
  the map: the azimuth turns with the frame (`azimuthDeg − deg(rotation)`), and the sun sits where it always did
  relative to the piste at any placement. A real map (C4) has rotation 0 and its true azimuth.
- **Proof that no axis assumption is left:** `createGame(env)` takes `env.mapRotationRad`, and `npm run test:rotated`
  (CI runs it next to `npm test`) runs the whole suite with the procedural map turned 37°. Tests are written on the
  map's grid and read the façade through its frame (`test/map-view.js`). The golden rides and a seeded ride
  (`test/rotated.test.js`) match the default placement step for step within 1e-9; not bit for bit, because cos and
  sin of 37° round in the last bits. In a browser, `?rot=<degrees>` places the map the same way (read in `main.js`).

## Consequences
- C1 builds its polyline course in grid metres and places it with the same frame; C4 places a real DEM with its
  own origin and rotation 0 (rows north to south are the same mirrored grid).
- A few expressions are written as the mirror of the old ones so the default placement stays bit for bit: the
  tail-first rail and switch-camera targets use `− π` rather than `+ π` (the same direction), and the rider yaw and
  path turn rate are measured clockwise.
- Values that only round-trip exactly at the default placement (writing a grid position and reading it back) are
  checked in world metres through `Gresca` itself (`g.raw` in the harness).
