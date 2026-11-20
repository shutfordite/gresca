# Gresca architecture audit and refactoring plan

Audit of `shutfordite/gresca` at `main` 9928948 (after PR #3, D1 fog and sky), 20 Nov 2026. PR #4 (D2 camera) has since been merged. The open branch `design/02-camera` (391c3da) was also read. All 146 tests pass on main (`npm test`, about 104 s).

## 0. Status (20 Nov 2026, main a8931c5)

| Package | State |
|---|---|
| A1 test façade | done, PR #6 |
| A2 faster tests | done, PR #7 (suite about 13 s on CI) |
| A3 fixed 120 Hz step, seeded RNG | done, PR #8 |
| PR previews on GitHub Pages | done, PR #9 (not in the original plan) |
| **B1 `src/` + build** | **next** |
| B2, B3, C1–C4, D1–D3 | to do. Phase C and B3 are amended by `docs/REAL-WORLD-DATA.md` (R1–R5) |

Follow-ups from the A reviews, to fold into the package named:
- B1: pin Node with `"engines": {"node": ">=22.8"}` and make the README match (L1, A2 review). Replace the `debug.drawSource()` test (it reads `draw.toString()`) with call-order recording in the harness's ctx stub.
- B2: `Gresca.sim()` should call the same `simTick()` as the loop; `Gresca.set()` must reset interpolation when it writes the position; record input per sim step (for replays and ghosts later).
- B3: rename `world.height` (raw cell) to `world.cellHeight` and add an interpolated `height`.

## 1. Summary

The game works and has strong behaviour tests, but its architecture is a prototype's: one 370-line script full of shared globals, a world defined by the formula `cx(y)`, and a renderer reading a pre-painted 1000 × 2450 colour image. **None of that can take a real mountain.** Gresca's main promise (riding real terrain from elevation and OpenStreetMap data) needs three things the code does not have yet:

1. a terrain interface that is not tied to one array size or to "downhill is +y",
2. a course defined by a real piste polyline, not by a function of y,
3. shading computed per pixel, not painted into a map-sized image.

The art spec (Hanga Dawn v1.3) already assumes all three. The good news is that the test suite is a real safety net, so the refactor can be done in small, behaviour-preserving steps. The one thing blocking that is that **the tests reach into the game by global variable name**, so any rename breaks them. Fixing that seam is step one.

## 2. What is there today

| Part | Where | Notes |
|---|---|---|
| Game | `index.html`, third `<script>` (370 dense lines) | About 60 top-level mutable globals (`x, y, vx, vy, a, jz, jv, L, R, B, JU, crash, grind, score, camA, camH, col, …`). Physics, rules, input, camera, rendering, HUD and DOM all share them. |
| Art spec | `art/gresca-hanga-spec.js` (5,184 lines), embedded as `<script id="hanga-spec">` | Data plus pure helpers, UMD (browser global + `require`). Clean. Mentions `HANGA-INTEGRATION.md`, which is not in the repo. |
| Rider animation | `art/gresca-rider-anim.js` (183 lines), embedded as `<script id="rider-anim">` | Pure maths, state in an object, all tunables in `RiderAnim.tune`. **This is the pattern the rest of the game should follow.** |
| Embed tool | `tools/embed-art.js` | Copies `art/` into `index.html`; a drift test checks it. Its comment points to `test/art-sync.test.js`, which doesn't exist (the check is in `rider-anim.test.js`). |
| Terrain baker | `tools/bake-el-tarter.html` | Browser page. Writes `gresca-terrain-1` JSON: int16 decimetre heights (base64), pistes, lifts and parks as Web-Mercator pixel coordinates at zoom 13 (about 14 m per pixel). Nothing in the game reads it yet. |
| Tests | `test/*.test.js`, `test/harness.js` | Run the real script blocks in a Node `vm` with DOM stubs. Behaviour-level and thorough (physics, park, input, camera, look, anim, autopilot full runs). |
| CI | `.github/workflows/test.yml` | `npm test` on Node 22 for PRs and main. |

## 3. Findings

Severity: **H** blocks the real-terrain milestone or makes refactoring unsafe. **M** costs quality, speed or correctness. **L** is housekeeping.

### H1. Tests are coupled to global identifiers
Tests run strings like `g.run('jz')`, `g.run('x=…;crash=0')`, `g.run('col.fill(0)')`, `draw(dt)`. Counting the main ones: `jz` 32 times, `y` 26, `x` 24, `jv` 24, `a` 24, `score` 21, `cam` 20. Moving any of those into a module or state object breaks dozens of tests at once. The README's "no game code was refactored for testing" was right for getting started, but it now freezes the design.

### H2. The world is a formula, not data
- Size is fixed: `W0=1000, H0=2450`, 1 m cells, index `y*W0+x` everywhere (physics, camera, renderer, trees, rails, flags, `hAt`).
- "Downhill" is +y, and the piste centre is `cx(y)`. Kickers are y values (`KICK`), rails are `[y, length, offset from cx]`, the finish is `y > FIN`, the HUD shows `FIN − y` metres to go, the kicker launch checks `|x − cx(y)| < 9`.
- A real piste (OSM polyline) goes in any direction, turns back on itself in y, forks and crosses lifts. None of this code survives contact with it.
- Frames don't match: the spec uses east-north-up and compass degrees; the game converts through `camCompass()` with "world y = −game y". The spec's per-map sun, horizon and `meanSlopeDeg` all assume ENU.

### H3. Shading is painted into a map-sized image
`build()` paints lighting, corduroy, rock, tree shadows, kickers, rails, the lift line, the village and the finish into a 1000 × 2450 RGBA image (`col`). It keeps a second copy (`col0`) to reset ski tracks, which are written into `col` at runtime. The renderer just reads `col`.
- **Memory:** `H` (Float32) + `col` + `col0` + the `map` canvas comes to about 40 MB for a 2.4 km run.
- **Real maps:** the El Tarter bake covers about 7.4 × 7.3 km. At the spec's 2 m upsample, that's about 13.5 M cells, or roughly 55 MB per Float32 or RGBA layer. You can't paint the whole map.
- **Spec:** v1.1–1.3 ask for tone per render pixel from interpolated normals, relative to the map's mean slope, with corduroy and piste edge computed from distance to the centreline, so that "nothing is painted into col". The current design can't do that.

### H4. Simulation, rules, rendering and DOM are tangled
- `step()` does physics, tree collisions, ski-track painting into the render image, particle spawning and **the finish screen** (`msg.hidden=false`, `go.textContent=…`).
- `jumpStep()` does landing physics, crash rules, scoring and popup text.
- `applyInput()` toggles glove CSS classes.
- `draw()` advances the camera (`camA`, `cam.s`, `camH`), so camera behaviour depends on whether and how often a frame is drawn.

So nothing can be unit-tested, reused or run headless (bot, replay, ghost, server check) without the whole DOM stub.

### M1. The physics depends on frame rate
`loop()` runs `step(dt/2)` twice with a variable `dt` (up to 33 ms). Jump height, landing speed, grind length and crash thresholds therefore vary slightly with device frame rate. The tests use a fixed `dt` (`g.sim`), so they don't see this. Use a fixed-step accumulator (for example 120 Hz) with interpolation for rendering.

### M2. Slow, blocking start-up
`build()` takes about 8.7 s in the Node harness, synchronously, on the main thread (inside a `setTimeout`). On a phone that is a multi-second freeze behind "Building the mountain...". It's also why the test suite takes 104 s: each test file builds the whole world, and some build it more than once.

### M3. Physics samples terrain in 1 m steps
The gravity gradient is a central difference at the integer cell (`H[i±1]`, `H[i±W0]`); only rendering and animation interpolate (`hAt`). On upsampled real data that will show up as stepping and jitter. The gravity scale `15.7 × gradient` is an unexplained constant; it should be stated as g·sinθ in m/s².

### M4. The baker's output doesn't yet match the spec
The spec expects each map to carry `meanSlopeDeg`, a sun azimuth and elevation, a baked `horizon` profile, a `treeSet` and credits. The baker writes none of these, and it doesn't choose a piste. There is no schema version check or validator, and the workflow ends with "send it to Claude", a manual step.

### M5. Rendering is CPU-bound with no budget
The terrain is a voxel-style column raycaster (152 samples × up to 360 columns, about 55k samples per frame), plus `createImageData` **every frame** (allocation churn), plus canvas 2D for trees, rails, flags, particles and the rider. That suits the look, but there is no frame-time measurement. Per-pixel shading (H3) will add cost, so we need a perf harness before D3.

### L1. Housekeeping
- The `embed-art.js` comment names a test file that doesn't exist. `HANGA-INTEGRATION.md` is referenced but missing.
- The README says Node 20+; CI runs 22. Pin one with `engines` in `package.json`.
- There's no `AGENTS.md`/`CLAUDE.md`. Agents working on this repo need its rules written down (section 6).
- `Math.random()` in particles is fine, but a seeded RNG for anything gameplay-related keeps replays and tests deterministic.

### What to keep
- **Nothing to install** for players. ~~One file~~: superseded by ADR 0001 — the game is a static site on GitHub Pages, still with no build step.
- Art as data plus pure helpers (`HANGA`, `RiderAnim`): UMD, testable in Node, tunables in one place.
- Behaviour-level tests that run the real shipped code, and the drift test for embedded modules.
- The column-raycast renderer and low-res upscale. It gives the style cheaply. Change what it samples, not how.
- Small PRs on named branches (`design/0N-…`, `anim/…`) with CI.

## 4. Target architecture

A static site with no build step and no runtime dependencies (ADR 0001): `index.html` loads `art/` and `src/` directly and fetches `maps/`. Source in `src/` starts as ordered classic scripts (B1) and becomes native ES modules in B2.

```
src/
  core/      config.js (all tunables, units in comments), rng.js (seeded), math.js, events.js (tiny emitter)
  world/     terrain.js   Terrain interface + Heightfield (bilinear/bicubic sampling, normals, slope)
             course.js    Course: centreline polyline, arc length s, signed lateral d, corridor, finish
             park.js      kickers / rails / boxes placed in (s, d); queries: kickerAt, railNear
             trees.js     placement from map data (spec trees.placement), spatial hash
             maps/        procedural.js (today's world, re-expressed), loader.js (gresca-map-1 JSON)
  sim/       rider.js     RiderState (plain object) + step(state, input, world, dt) — pure
             rules.js     scoring, landings, crashes, grinds → events
             fixedstep.js accumulator, 120 Hz
  input/     input.js     pointers + keys → InputState {left,right,brake,jumpPressed}; no DOM side-effects
  view/      camera.js    camera state + update(cam, rider, world, dt), spec cameraPitch
             terrainRender.js  raycaster; per-pixel tone from normals (spec terrain.*)
             sprites.js   trees, rails, flags, poles, particles
             rider.js     drawRider (today's), fed by RiderAnim
             sky.js
  ui/        hud.js, menu.js  subscribe to sim events; own all DOM
  app.js     wiring + loop: input → fixed-step sim → camera → render → hud
  debug.js   window.Gresca test/debug façade (see A1)
art/         unchanged (HANGA, RiderAnim)
maps/        procedural.json? / el-tarter.json (gresca-map-1)
tools/       map compiler (pure JS core + Node CLI + bake page), validate-map.js
docs/adr/    one short decision record per choice below
```

Rules the layers keep:
- `world` and `sim` never touch the DOM, canvas or `HANGA` colours. They can be `require`d in Node with no stubs.
- `sim` talks outwards only through returned events (`land`, `crash`, `grindStart`, `grindEnd`, `finish`, `score`). `ui` and `view` subscribe.
- `view` reads sim state and never writes it. The camera is updated in the app loop, not inside `draw()`.
- All positions are ENU metres in one world frame (x east, y north, z up). Headings are radians internally and compass degrees only at the spec boundary.
- The course is the only thing that knows about "along the piste" (s) and "across the piste" (d). Kickers, the finish, the HUD's "m to go", corduroy and the piste edge all ask it.

Decisions to record as ADRs: (1) multi-file static site, no build step (done: `docs/adr/0001-multi-file-site.md`); (2) ENU world frame; (3) course as polyline (s, d); (4) per-pixel shading, no baked colour image; (5) fixed-step sim; (6) the `window.Gresca` test façade.

## 5. Work packages for agents

Each package is one PR. **Every PR keeps `npm test` green and changes no gameplay behaviour unless it says so.** Packages in the same phase marked ∥ can run in parallel; otherwise go in order.

### Before starting
- ~~Merge or close `design/02-camera` first.~~ Done: merged as PR #4 (b60f997). Pause other `design/*` work during A1–B2, about a week of mechanical change, or rebase it after.

### Phase A: make refactoring safe

**A1. Test façade: tests stop reading globals** *(first, alone)*
- Add `window.Gresca = { state(), set(patch), place(o), sim(sec, dt), frame(dt), input(o), world, events }` in a debug block at the end of the game script. It reads and writes today's globals for now.
- Rewrite the tests to use only the façade plus the `HANGA`/`RiderAnim` globals. Replace raw `g.run('jz')` with `g.state().z`, and so on. Keep assertions identical.
- Add a lint test that fails if a test file calls `g.run(` with any identifier not on an allow-list (start the list empty; give it a temporary escape hatch for render internals such as `col`, `occ` and `FAR`, and record each use in the PR).
- Accept when: all 146 tests pass, the test diff only changes *how* state is read, and no assertion is weakened (reviewers diff assertions).

**A2. Faster tests** ∥ after A1
- Let the harness build once per process and reset between tests (`Gresca.reset()`), or cache the built `H`/`M` arrays in a temp file keyed by a hash of the source.
- Target: the full suite under 30 s.

**A3. Fixed timestep and seeded RNG** ∥ after A1 (*behaviour change, small*)
- `fixedstep.js`: 120 Hz accumulator, at most 8 steps per frame, render-interpolated position.
- Seeded RNG for particles and anything gameplay-related.
- New test: the same input script at 30, 60 and 120 fps gives the same rider path within 1 cm and the same score.

### Phase B: split the code without changing behaviour

**B1. `src/` + build tool** *(after A1)*
*Rewritten for ADR 0001 (no single file, no build step).*
- Move the game script into ordered classic scripts under `src/` (for example `config.js`, `world.js`, `park.js`, `sim.js`, `input.js`, `camera.js`, `render.js`, `rider-view.js`, `hud.js`, `app.js`, `debug.js`), cutting along the existing `// ----` sections with **no logic changes**. They share globals exactly as the single script did. `index.html` keeps the HTML and CSS and loads `art/*.js` then `src/*.js` with `<script src>` in order.
- Remove `tools/embed-art.js` and the embedded art blocks. Replace the drift test with one that checks `index.html` loads every `art/` and `src/` file, in the right order, and has no inline game code.
- Harness: load the `<script src>` files in page order into the one vm context (the façade and all tests unchanged).
- Update the README (how to play: the Pages link, or a local static server) and `AGENTS.md`.
- Fold in the follow-ups listed in section 0 for B1.
- Accept when: all tests pass unchanged; the PR's preview plays on the iPad exactly like main.

**B2. State objects and events** *(after B1)*
- Convert `src/` to native ES modules (ADR 0001) as part of this: replace the globals with `rider`, `input`, `session`, `camera` objects and a `world` object. `step()` becomes `sim.step(rider, input, world, dt) → events[]`.
- Move the finish screen, popup and glove classes into `ui/` as event subscribers. Move the camera update out of `draw()` into the loop.
- Ski tracks become a sim event or a sparse track buffer that view owns. Stop writing into `col` from sim.
- The façade (A1) now maps directly onto these objects; the tests should not need to change.
- Accept when: `world/` and `sim/` load in Node with `require` and **no DOM stub**. Add one test that does exactly that.

**B3. Terrain interface** ∥ with B2's UI work, after B1. *Amended by R1: design the interface as a layer stack (base, sculpt, features, detail) from the start, bicubic base.*
- `Terrain { bounds, cellM, height(x,y), normal(x,y), slopeDeg(x,y), surface(x,y) }`, bilinear by default, bicubic option.
- Physics gravity uses the interpolated gradient, written as g·sinθ (M3). If the feel changes, tune it to the existing tests; don't loosen them.
- Every `H[(y|0)*W0+(x|0)]` outside `world/` becomes `terrain.height(x,y)`. Add a grep test that bans `W0`/`H0` outside `world/`.

### Phase C: data-driven maps (the core of the product)

**C1. Course as polyline** *(after B2, B3)*. *Amended by R4: include `Course.fromRun(ways)` (join, resample, curvature-limited smoothing, width) and start/end `s` for checkpoints.*
- `Course` from a centreline polyline: `project(x,y) → {s, d, tangent}`, `point(s, d)`, `widthAt(s)`, `length`, `finishS`.
- Re-express the procedural map: sample `cx(y)` into a polyline; kickers, rails and the finish placed in (s, d). The kicker launch test, "m to go", the autopilot, the minimap and the *460–740 empty stretch* invariant all move to s.
- Accept when: the existing park and physics tests pass against the polyline version, and a new test rides a course that runs **north-east then turns back west** (impossible with `cx(y)`).

**C2. One world frame (ENU)** *(after C1)*
- Flip to x east, y north, z up. Delete `camCompass()`'s special case. The sun comes from `HANGA.maps[id].sun`. The camera heading is compass degrees at the spec boundary only.
- Tests that check the sun on screen and the camera heading must still pass unchanged.

**C3. Map format `gresca-map-1`, validator and baker v2** ∥ with C1. *Amended by R2 and R3: split baked `<id>.terrain.json` from authored `<id>.course.json`; pluggable DEM sources (Terrarium tiles from Mapterhorn or AWS, local GeoTIFF) and pistes from OpenSkiMap GeoJSON with Overpass as fallback; raw-download cache; provenance and per-source attribution in the file; maps are ODbL.*
- Schema: origin (lat/lon), `cellM`, heights (int16 decimetres, base64, or a PNG Terrarium blob), the chosen piste polyline in local ENU metres, `meanSlopeDeg`, sun (az, el), `horizon` profile (spec `mountains.real`), `treeSet`, park layout in (s, d), credits and attribution.
- `tools/validate-map.js` plus a test that every file in `maps/` validates.
- Baker v2 as a Node 22 script (`tools/bake-map.mjs`, built-in `fetch`), keeping the browser page as a fallback. It chooses the piste by OSM id or name, converts Mercator pixels to local ENU metres (not one mid-latitude scale for the whole box), computes `meanSlopeDeg` and the horizon profile, and writes `maps/<id>.json`. Note: the agents' sandbox may block the tile and Overpass hosts; if so, the owner runs the bake and commits the JSON.

**C4. Map loading and corridor-only detail** *(after C1–C3)*. *Amended by R1 and R5: the corridor cache holds the composed layers; slope limits and DEM defect checks become gameplay rules and validator checks.*
- Load one map with `fetch` from `maps/` (or from a file the player picks). Build in chunks with progress, or in a Worker, so the menu never freezes (M2).
- Keep the coarse baked grid (about 14 m) for the whole map, for the backdrop and far field. Upsample to 2 m (bicubic) **only within a corridor** (piste plus about 150 m each side), in tiles made on demand along s. Memory budget: under 60 MB total on El Tarter.
- Accept when: El Tarter loads and is rideable start to finish with the autopilot, and the procedural map still passes everything.

### Phase D: rendering to the spec

**D1. Perf harness** *(before D2)*
- Benchmark script: N frames of `frame()` at 390 × 844 with a fixed rider path; report ms per frame by stage (raycast, sprites, rider, HUD). Record a baseline and fail CI if it regresses by more than 25%.
- Reuse the `ImageData` buffer between frames (M5).

**D2. Per-pixel terrain shading (no colour image)** *(after B3, D1; should coordinate with the art spec owner)*
- In the raycaster, take each sample's normal from `terrain.normal`, compute `HANGA.toneDelta` against the map's `meanSlopeDeg`, and call `HANGA.tone(surface, delta)`. Get corduroy and the piste edge from `course.project(...).d`; drop-edge keylines and valley mist as in spec v1.3.
- Delete `col`/`col0`/the `map` canvas. Keep the minimap as a small, separately rendered image.
- Ski tracks: a ring buffer of track segments in world space, drawn as decals.
- Accept when: the spec's tests pass (flat groomed piste is `pisteLit`, steeper is darker, the edge band is `pisteEdge`, kickers are `kickFace`/`kickSide`), and frame time is within the D1 budget.

**D3. Trees and backdrop from map data** ∥ after C3, D2: spec `trees.placement`, treeline, rocks over 38°, and the backdrop from the baked horizon.

### Phase summary

| Phase | Packages | Unblocks |
|---|---|---|
| A | A1 → (A2 ∥ A3) | Every other change |
| B | B1 → (B2 ∥ B3) | Headless sim, real terrain |
| C | (C1 ∥ C3) → C2 → C4 | **Riding a real mountain** |
| D | D1 → D2 → D3 | Spec v1.1–1.3 look on real maps |

## 6. `AGENTS.md` to add to the repo (A1 should add it)

```
# Working on Gresca
- Run `npm test` before every commit. Never weaken or delete an assertion to make a refactor pass; say why in the PR if a test must change.
- Game code lives in src/ (after B1); art/ is loaded as it is. No build step.
- art/gresca-hanga-spec.js is owned by the art spec; change it only to sync a new spec version, byte-for-byte.
- world/ and sim/ must not touch document, window, canvas or HANGA colours.
- Units: metres, seconds, radians internally; compass degrees only where the spec needs them. Comment units on every tunable.
- One work package per PR. Title: "<package id>: <what>". The body lists behaviour changes (or "none") and test changes.
- Static site, no build step, no runtime npm packages without an ADR (ADR 0001).
```

## 7. Review checklist for PRs

What I'll check on each PR:
1. **Layering:** no DOM in `world/` or `sim/`; no sim writes from `view/`; the camera isn't advanced inside a render call.
2. **Behaviour:** "no behaviour change" PRs change no assertions; behaviour-change PRs say what changed and add a test that pins it.
3. **Units and frames:** new numbers have units; nothing new assumes +y is downhill or indexes `H` directly.
4. **Determinism:** no `Math.random()` or wall-clock time in sim.
5. **Cost:** no per-frame allocation in hot loops; map-sized buffers need a stated memory budget.
6. **Spec fidelity:** colours by palette role, values from `HANGA`, not copied numbers.
