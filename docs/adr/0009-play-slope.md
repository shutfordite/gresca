# 0009: a second procedural map, the play mountain; the old slope is the test track

Status: accepted (owner, 21 Nov 2026). Context: the test slope (about 15 degrees, small kickers) is boring to play, but
about 40 physics tests, the golden trace and the digests depend on its numbers.

## Decision
- The procedural generator takes a frozen **layout** (`TEST_LAYOUT` in `world/course.js` plus `TEST_MAP` in
  `world/build.js`; `PLAY_LAYOUT` in `world/play-slope.js`): grid size, centreline `cx(y)`, finish, kickers, rails, ramp
  stamp, lift, trees, and how the heights are filled. `createGridCourse(layout, terrain, frame)` and
  `createWorld({ map })` build any of them; the test slope's numbers did not change (golden trace and digests identical).
- `createGame(env)` builds `env.map` (`'test'` by default, so tests and tools are unchanged). Only `src/main.js` reads
  `?map=`: the browser opens on `'play'`, `?map=test` (or a `?scene=`, which is authored on the test slope) builds the test slope.
  Tools that open `index.html` pin `?map=test`.
- A kicker may carry `launchGain` (dimensionless, replaces the big-kicker gain in `sim/jump.js`); only the play mountain sets it.
- Both maps share the 1000 x 2450 m grid (the colour-map canvas and the GPU texture budget stay as they are) and the
  procedural sky and sun (`MAP_ID`).

## Consequences
- Real maps (C3b/C4) arrive through the same `Course` and terrain seams; `layout` is the procedural part only.
- Anything that assumes the test slope's kickers or the empty stretch must run with `map: 'test'` (the default).
- Costly to undo: the layout fields are read by the colour map (`world.layout`).
