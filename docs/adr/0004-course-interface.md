# ADR 0004: the Course interface (s, d), with the procedural map as s = y

Date: 20 Nov 2026. Status: accepted (B2c).

## Context
Until B2c the sim, sprites, HUD, rider animation, app and façade all imported `cx(y)`, `KICK`, `FIN` and `RAILS` and
treated map y as "distance down the piste". A real map (C1, C4) has a piste that turns, so every one of those would
have to change. Brake, carve and fakie (F5 to F7) need the fall line under the rider, not +y.

## Decision
- **A `Course` interface** (typedef and `checkCourse()` in `src/core/contracts.js`): `project(x, y, out) -> {s, d,
  tx, ty}`, `point(s, d, out) -> {x, y}`, `fallLine(x, y, out) -> {fx, fy, heading, slope}` (from
  `terrain.gradient`; the tangent on flat ground), `widthAt(s)`, `length`, `startS`, `finishS`, the frozen `kickers`
  and `rails` in (s, d), and `kickerAt(s, d)`. Queries write into the caller's `out`: no allocation per call.
- **Sign convention:** s is metres, increasing down the piste; d is metres across, positive on the side of
  heading − π/2 from the tangent (the rider's left facing down the piste; +x on the procedural map). Callers may
  assume nothing else: not that s is arc length, not that d is perpendicular.
- **The procedural course is s = y, d = x − cx(y)** (`createProceduralCourse(terrain)` in `src/world/course.js`), not
  arc length and perpendicular distance, so the kicker launch zone, the finish, "m to go" and every rider trace stay
  bit-identical (`test/golden.test.js`). C1 replaces it with a polyline course with arc length.
- The course lives on the world (`world.course`, made in `createWorld()`) and is passed in; it is frozen and holds no
  state. `DEFAULT_COURSE` (no terrain) exists only so sim functions called without a course (the existing sim unit
  tests) keep working; the game always passes `world.course`.
- Only the procedural map (`world/course.js`, `world/build.js`, `view/colour-map.js` until D2) may use `cx`, the park
  constants or the height array; `test/frame.test.js` enforces that and bans the "+y is downhill" idioms found.

## Consequences
- C1 swaps the implementation without touching callers; the park and physics tests then run against the polyline.
- `RiderState.fallLine` and `downhillSide` come from the course's fall line after each step (unused until F5 to F7).
- Left for later packages, because changing them changes numbers: the run start and `Gresca.place()` still point the
  rider at heading π/2 with speed in +vy; the camera's start heading is 1.57; the big kickers' ramp flags are placed
  8 m up in map y from the lip's x (C1: `point(s − 8, d ± 11)`); `keepOnMap` clamps map y (the map edge, not the piste).
