# ADR 0011: the map loader and the corridor detail layer

Date: 25 Nov 2026. Status: accepted (C4a).

## Context
C4 loads a baked terrain file and its course file (ADR 0006, 0010) into the world the sim, camera and renderer already
use for the procedural maps. C4a is the pure half (no fetch, no UI, nothing registered in `MAPS`); C4b wires it in.
`test/page.test.js` lets `src/` import only `src/`, and both ADRs left open where the validators live.

## Decision
- **The format, validators and run code move to `src/world/map-file/`** (`format.js`, `course-format.js`,
  `course-run.js`, `validate.js`; they were pure and imported `src/world/` already). The old paths in
  `tools/map-compiler/` are one-line re-exports, so the compiler, the CLI and the tests are unchanged.
- **`loadMapSteps(terrain, course, opts)`** (`src/world/map-loader.js`) is a generator: it validates both files first
  (a clear error naming file and field), then builds in chunks, yielding `{phase, fraction}` after each; the caller
  decides when to resume (no timers here). `loadMap` runs it whole. The validators are one chunk (about 0.2 s at
  701 x 701 samples); a Worker could take them later.
- **The world** has the procedural world's `frame`, `terrain`, `course`, `trees`, `treeArr`, `treeCells`, plus `id`,
  `name`, `sky` (`sun` in compass degrees, `horizon`, `treeSet`), `credits`, `licence`, `warnings` and `corridor`
  (`contains`, `prefetch`, `stats`). It has no `H`, `M` or `layout`: the colour map and the façade read those until D2.
- **Terrain layers:** `base` is the coarse grid (Catmull-Rom bicubic, C1), `detail` is the corridor layer. The corridor
  layer adds to the base, so it is 0 outside the corridor and the far field reads the base alone. It holds 2 m tiles
  of 64 m (35 x 35 Float32 nodes with the pad Catmull-Rom needs, 4.9 KB), made on demand from the composed
  refinements (`opts.refiners`: grooming, features and micro-relief plug in here; none yet), in an LRU cache of at most
  400 tiles (2 MB). A tile is in the corridor when it touches a disc of half the piste width plus 150 m about the
  centreline. Tiles share one global lattice, so height and gradient are continuous across tile edges. `heightFast`
  reads cached tiles only, so drawing never builds one. Refinements must fade to 0 by the corridor's edge.
- **Course:** `Course.fromRun` makes the centreline; the file's widths become one width per point, then
  `polylineCourseFromWorld` adds start, finish, kickers and rails (rails get their world geometry). Kickers have no
  ramp yet: the features layer stamps ramps (R1) in a later package.
- **Trees:** a seeded scatter (the procedural map's hash and noise) on 6 m cells, only in the corridor, at least 8 m
  off the piste's edge and not on slopes over 40 degrees. R6 replaces it with real tree areas.

## Consequences
- Memory for El Tarter (7 x 7 km at 10 m, a 6.5 km run): about 5.6 MB held (measured on a synthetic map of that size),
  the heights 2 MB, tiles at most 2 MB, trees 23,000 at about 1 MB; under C4's 60 MB with room for the colour map.
- C4b needs `fetch` of the two files from `env`, a menu entry, `MAPS`-like registration, and an `app.js` that builds
  from a loaded world (see the PR).
- `test/page.test.js` lists the loader as a pending root until C4b imports it from `main.js`.
