# Gresca roadmap: the work in order

This merges the architecture plan (`docs/ARCHITECTURE.md`), the real-world data decisions (`docs/REAL-WORLD-DATA.md`)
and the 20 Nov feedback plan (project doc `feedback-plan-2026-11-20.md`: P1–P5, S1–S5, F1–F7) into one sequence.
Written 20 Nov 2026 while B2a was open.

## How the order was chosen

1. **Settle every shared seam before work fans out.** The contracts that several streams meet through (state,
   input, events, the course, the look, the world frame) are fixed in one short code freeze. After that, streams
   change only their own folders, and a contract change is its own small PR merged first.
2. **Move code once.** Mechanical moves, reformatting and file splits happen in the PR that already rewrites those
   lines (B2a), never as a second whole-repo diff.
3. **Remove hidden assumptions before building on them.** "Downhill is +y" and "the game is not in ENU" are removed
   *before* braking, carving and fakie work, because those features are defined by the fall line and headings. If
   they came first, they would be rewritten when the frame changes.
4. **Measure before optimising or reshaping the renderer.** D1's frame-time harness comes before player sizing and
   per-pixel shading, which both change render cost.
5. **Tools that let agents see the game come before visual work**, so visual PRs carry screenshots instead of
   relying only on the iPad.

## Phase 0: now (docs only, alongside B2a)
- **R0** (this PR): `CLAUDE.md` (loads `AGENTS.md` for Claude Code), a PR template, and this roadmap.

## Phase 1: the freeze (one code PR at a time, no other `src/` PRs)

| # | Package | What it settles | Why here |
|---|---|---|---|
| 1 | **B2a** ES modules, `createGame(env)`, CSS into `styles/` (open) | file layout by layer, one entry module, no module-level state, readable formatting | everything after edits these files; move and reformat them once |
| 2 | **P1** docs follow-up (docs only, quick) | code map ("to change X edit Y, tests Z"), folder ownership table, `docs/STATUS.md` replacing the status table, per-folder `AGENTS.md`, `docs/STYLE.md` split from `AGENTS.md`, repo docs canonical and project docs as pointers | the code map needs B2a's final layout; agents need it before B2b |
| 3 | **B2b** state contracts and events | `src/core/contracts.js` (JSDoc typedefs plus contract tests) with **the fields the feedback needs added up front**: `InputState` (steer, brake 0..1, jumpHeld/jumpPressed, flip, spin), `RiderState` (travelHeading, boardHeading, edge, skid, flipRot, spinRot, isSwitch), `SimEvent` (land, crash, grindStart/End, flip, brakeStart/End, score, finish); `sim.step(state, input, world, dt) → events`; finish screen, popup, gloves, HUD and minimap become `ui/` subscribers; camera update leaves `draw()`; ski tracks become a buffer owned by `view/`; `Gresca.sim()` uses the loop's `simTick()`; input is recorded per sim step; the façade is split so each area registers its own fields | S1, S2 and S3 meet only through these contracts; fixing them once means no stream edits a shared file |
| 4 | **B2c** world seams | a `Course` interface (`project(x,y) → {s, d, tangent}`, `point(s,d)`, `fallLine(x,y)`, `widthAt`, `finishS`, feature lookup) with the procedural map as its first implementation (wrapping `cx(y)`); `sim/anim-input.js` built from state plus course (no `KICK`, `cx()` or globals); `RiderState.fallLine` and `downhillSide` from `terrain.gradient`; HUD "m to go" from `s`; a lint test that bans "+y is downhill" outside the procedural map | brake (F5), carve (F6) and fakie (F7) are all defined by the fall line; the real-map C1 later swaps the implementation without touching callers |
| 5 | **C2** one world frame (ENU) (open) | the procedural map in east-north-up metres, placed by a `MapFrame` (ADR 0005); plus a **rotated-map test**: the whole suite passes with the procedural map rotated to an arbitrary heading (`npm run test:rotated`, 37°, in CI) | proves no axis assumption is left before streams build on it; doing it later would rewrite stream code |

The freeze is about four PRs (B2a, B2b, B2c and C2), plus the P1 docs PR between B2a and B2b.

## Phase 2: shared tooling (parallel, after the freeze)

| Package | Owner | Notes |
|---|---|---|
| **P4** Look interface (F2) | S4 | `view/look/`: `Look` with roles, tones, sky, fog, sprite styles, camera framing, `rider.project`; `look/hanga.js` is the only file reading `HANGA`; hard-coded hex and CSS variables come from the look's tokens; contract tests; a lint test bans hex literals and `HANGA.` outside `view/look/`; `lab.html` look lab. Send the **art spec v1.4 request** (body twist, head yaw with the face vector, brake, switch-ski and flip-tuck poses) at the same time. |
| **P5** scenes, fixtures, screenshots | shared | `Gresca.scene(name)` and `?scene=`; recorded `RiderState` traces in `test/fixtures/`; `npm run shot` with Playwright (dev-only, **ADR 0003**; 0002 is ES modules) at iPad size; CI attaches shots to PRs touching `view/`, `art/` or `styles/`; per-area test scripts. |
| **P6** mechanical PR check | shared | `tools/review/`: the scriptable half of a review (asserts, golden hash, ownership, template, docs and style on new lines, a headless Chrome smoke test against main) run by the `PR check` workflow, which keeps one report comment per PR; the coordinator skill reads it instead of redoing those steps. Added 21 Nov to save review tokens. |
| **C3a** map compiler, terrain half | S5 | `tools/` only: the pure JS compiler core, DEM and piste adapters, `<id>.terrain.json` plus validator. It touches no `src/`, so it can start as soon as B2c fixes the course schema. |

## Phase 3: streams (parallel; each owns its folders)

| Stream | Owns | Order inside the stream |
|---|---|---|
| **S1** controls and UI | `src/input`, `src/ui`, `styles/` | F4 bindings table → controls screen and pause → F3 flip input and air hints → stance picker |
| **S2** sim feel | `src/sim` (+ `sim/tuning.js`) | F5 brake as a skid across the fall line → F6 edge and carve model, remove the heading clamp, ollie preload → F3 flip physics and scoring → (optional) gravity slope-law A/B |
| **S3** rider animation | `art/gresca-rider-anim.js`, `src/view/rider` | body twist → F5 brake counter-rotation → F6 edge-driven lean and unweighting → F7 fakie look-over-shoulder (goggles wait for spec v1.4) → F3 flip tuck |
| **S4** look, camera, render | `src/view/look`, `src/view/camera`, render | **D1** frame-time harness → **E0** GPU terrain renderer test (three.js, ADR 0008; accepted) → **E1** GPU renderer by default (`?renderer=cpu` as the fallback), lost-context handling, texture memory budget, softer corduroy, the shared ray constants in `core/config.js` → **E2** light: soft sun shadows from the terrain, rider and tree shadows drawn on the GPU (replacing the blocky painted ones) → **E3** trees, rails, flags and kickers as GPU objects → **E4** post: tilt-shift, dawn haze → **TD2** the Look and shadows follow a chosen sun. F1 sizing and D3 data-driven trees fold into E1 and E3; D2 is replaced by E0 |
| **S6** design and visual | `art/gresca-hanga-spec.js` versions, with their notes and boards in `docs/art/` | **V1** art spec v1.5, environment: trees, rocks, bushes, treeline, sky, sun and backdrop peaks for real maps (Pyrenees set first, El Tarter), with boards → **V2** park look in the spec (snow kickers, tables, landings, groomed sidewalls, lip and knuckle dye lines, rail and box materials and colours), before K4 → **V3** visual review: every PR touching `view/` or `art/` gets a check of its screenshots against the spec, findings as spec fixes or S4 issues → **V4** design canvas re-synced to each spec version → **TD1** time-of-day looks (spec v1.6) |
| **S5** maps | `src/world`, `tools/`, `maps/` | **C1** polyline `Course.fromRun` (R4) → C3 course half (`<id>.course.json`) → **C4** map loading, corridor detail, load-your-own file, slope and data-defect rules (R5) |

S2 and S3 meet only through `RiderState`, `AnimInput` and `SimEvent`. S1 and S2 meet only through `InputState`. S4 and
S3 meet through `Look.rider.project`. S6 and S4 meet through the spec and the Look tokens: S6 designs and writes the
numbers in `art/gresca-hanga-spec.js`, S4 renders them and never changes the spec's values itself. All of these are fixed in B2b, B2c and P4.

### X1: conflict-proofing (Shared, owner asked 26 Nov; a short freeze)
On 26 Nov ten PR conflicts needed hand merges. Nine came from one cause, one from the next two:
1. **Hand-kept test lists.** Each per-area script in `package.json` lists its files on one line, so every PR that adds
   a test conflicts with every other one. Fix: each test file names its areas in its first line
   (`// @areas sim view`); `tools/test-area.mjs <area>` runs the files tagged with that area; the scripts in
   `package.json` list no files; a test fails when a test file has no tag or an unknown area. Adding a test never
   touches a shared file again.
2. **One golden hash for sim and animation.** Any animation change re-records the line every sim PR also guards.
   Fix: two hashes on two lines (sim fields, anim fields), plus a carving scene in `src/scenes.js` (#66 review).
3. **Long one-line literals at stream seams.** Two PRs adding a field each to the same line conflict
   (`riderAnimInput` in `src/view/rider-animation.js`, the anim state and the `poseFor` call in
   `art/gresca-rider-anim.js`, `animInput` in `src/sim/anim-input.js`). Fix: one property per line there, and a rule
   in `docs/STYLE.md`: object literals and calls that several streams extend put one property per line.
4. **Process (no code):** no stacked PRs unless a package needs one that is still open; when the base merges, the
   coordinator merges main into the dependent branch at once. The coordinator's merge-order list is posted with every
   review round, and after each merge the coordinator updates the open branches (`update-branch`, or a merge of main
   where it conflicts) before the owner merges the next.
One PR, by the coordinator, behaviour change none (the anim hash is recorded fresh from the same rides; the sim hash
must equal today's sim fields). **Freeze:** merge #66 and #67 first, then no other code PR opens or merges until X1
is in (a few hours). Stream work restarts on top of it.

### X2: retrospective changes (Shared, owner asked 27 Nov)
From the retrospective of 18–27 Nov (`docs/RETROSPECTIVES.md`), all accepted by the owner. One PR, by the
coordinator, behaviour change none:
1. **Bake map workflow** (`.github/workflows/bake-map.yml`): real maps bake on a GitHub runner and arrive as a PR,
   started with one tap; El Tarter stops waiting on a terminal step.
2. **GPU smoke test** (`tools/gl-smoke.mjs`, CI `gl-smoke`): two scenes on `?renderer=gl` in software WebGL must draw a
   real frame with no page error or lost context. Until now CI only ever saw the CPU renderer.
3. **Code map split**: each folder's `AGENTS.md` holds its rows; the root `AGENTS.md` keeps the core rules and an index
   (20 KB to 8 KB, loaded in every agent session). The PR check looks for a new file in the AGENTS.md files above it.
4. **STATUS is the coordinator's**: stream PRs report in their body (template: "Owner verdict needed", "Debt"); the
   PR check warns when a stream PR edits it.
5. **Method** (`.claude/skills/gresca-architect/SKILL.md`): feel spikes before feel packages, the X1 merge rules, a
   daily try list and merge batch for the owner, a Debt table in STATUS cleared one row per stream package, owner
   chores become workflows, lessons go into the skill or AGENTS.md.
6. **Order**: C4b runs alongside K instead of after it; F1 rider scale returns as an S4 package after a framing spike.

### TD: time of day (owner asked 27 Nov; after K and C4b)
Today each map has one fixed sun (`maps[id].sun` in the art spec, the course file's `sun`), the Look reads it once,
and the GPU terrain shadows are baked from it when the map loads. The owner wants the sun to sit in different places
in the sky. Order:
1. **TD0 sun from time and place** (Shared, ADR 0013): the sun is a date and a local time, not fixed angles. A pure
   `sunPosition(latDeg, lonDeg, dateUtc)` in `src/world/` (solar position; compass degrees only at the art spec, an
   ENU unit vector in the world frame). The course file's `sun` may carry `{date, localTime}` beside the angles, which
   stay as an override (ADR 0010 amended). El Tarter defaults to a February morning, which also settles its 110° vs
   76° question with the real sun.
2. **TD1 time-of-day looks** (S6, spec v1.6): presets beyond Hanga Dawn (morning, midday, late afternoon): sky stops,
   snow tones, haze and shadow tint, chosen by sun elevation, with boards per preset.
3. **TD2 the Look and shadows follow the sun** (S4): the Look takes a preset and a sun; the shadow bake reruns at load
   for the chosen sun, with its load time on the iPad measured and budgeted in the PR.
4. **TD3 a time-of-day picker** (S1): in the menu, remembered under a new `gresca-time` storage key.
5. **TD4 a sun that moves during a ride** (S4, optional, its own ADR): needs shadows updated a little each frame or
   computed differently; only if the owner wants it once TD2's bake time is known.

### G: whole mountains and a lighter frame (owner asked 27 Nov; the next items taken)
From an architecture and performance review of main at `f393adf` (27 Nov). Measured in Node 22 on the procedural
maps unless stated; frame costs on the iPad are each package's to measure with the D1 harness and state in the PR.
What the review found:
- **A real map is cut to a 1000 × 2450 m window.** `view/paint-window.js` crops every loaded map to the procedural
  map's grid, because the colour map and the GPU heights are each one map-sized texture: about 40 MB on the GPU and
  the same again as CPU copies for that window (ADR 0008), with grids over about 2000 × 2000 m falling back to the
  CPU renderer. El Tarter is about 7 × 7 km. The comments say "until D2", but D2 was folded into E0 and no package
  lifts the limit. This is the one finding that blocks the game's promise.
- **Two renderers, and the tests ride the one players don't see.** The GPU terrain is the default (E1a), yet the CPU
  raycaster and the painted colour map are still built and extended; in GPU mode `buildColourMap` still paints the
  whole map so `terrain-bake.js` `bakePaint` can diff it against plain snow to find the features. Node tests run the
  CPU path; the GPU path has its bake unit tests and the two-scene `gl-smoke`. Every visual feature is paid twice or
  left behind on the CPU (the powder look, #89).
- **The rider and spray are a second full-screen layer.** They are drawn on a 2D canvas over the WebGL canvas, so the
  iPad composites two full-screen layers every frame, and the rider can never be hidden by a tree, a kicker or a rail.
- **The spray allocates every step.** `sim/particles.js` makes an object per particle and removes dead ones with
  `splice`: about 3.6 MB of garbage per 10 s of riding (sim only, after H3). The likeliest cause of the Debt row "a few
  very slow frames" (garbage collection pauses); it also breaks the "no per-frame allocations" rule.
- **The page loads in series.** `src/main.js` starts the three.js import (r187, about 2.1 MB, about 420 KB gzipped;
  r187 ships no minified build) only after a real map has finished loading, and the 82 modules are found one import
  level at a time. Nothing is cached for a second visit or for offline play from the iPad home screen.
- **Boot bakes block the page.** `bakeHeights` alone is about 95 ms in Node for the 2.45 M texel window (more on the
  iPad), and the bakes grow with the map. They are pure functions over typed arrays, so they move to a worker as is.
- The sim, the contracts and the course lookup (a spatial grid) are in good shape; nothing to change there.

Packages, in order. G1, G2 and G3 are small, touch few files and run now, alongside K and C4b. G4 is a decision.
G5 to G8 follow it; G7 waits for C4b so El Tarter rides in the game first.

| # | Package | Stream | What | Done when |
|---|---|---|---|---|
| G1 | spray pool | S2 | `sim/particles.js` as a fixed pool of typed arrays (struct of arrays, `MAX_PARTICLES` long, a live count, swap-remove on death); the same RNG draws in the same order, so the sim hash is unchanged; view and façade read the pool through one accessor | a test that 10 s of spray-heavy riding allocates no particle objects; sim golden hash unchanged; the D1 harness re-run in Chrome, with the slow-frames Debt row closed or re-measured |
| G2 | load in parallel | Shared (`src/main.js`, `index.html`) | start the three.js import at the top of `main.js`, before the real-map load, and await both; `<link rel="modulepreload">` for three.js and the entry's module tree, kept in step with the imports by `test/page.test.js` | the real-map boot no longer waits for one before starting the other (a page test checks the order); load times before and after on the iPad preview in the PR |
| G3 | idle frames | Shared (`src/app.js`) | the loop draws only when something can change: no redraw while paused or behind the Controls screen; the menu keeps its frame rate only while its camera moves | a façade test counts draws while paused; tap-to-start, pause and resume unchanged on the iPad |
| G4 | the CPU renderer's role (ADR 0014) | Shared, owner decision | the GPU is the game; the CPU raycaster is a fallback that is kept working (the suite still rides it in Node) but gets no new looks. Its Debt rows close as "won't do". Owner: is a device without WebGL2 still worth drawing for at all? | the ADR merged with the owner's answer; `src/view/AGENTS.md` and ADR 0008 amended |
| G5 | features without the colour map | S4 | the lift line, village, finish and piste marks the colour map still paints become GPU meshes or decals from the course and world data, like E3b's rails and kickers; GPU mode stops calling `buildColourMap` and `bakePaint` | no colour map or `col`/`col0`/`colSnow` in GPU mode (a test of `view` after a GPU boot); the GPU memory figure in the PR; shots before and after match on the iPad |
| G6 | the rider and spray on the GPU | S4 (projection, spray), S3 (the rider files) | the rider drawn into the WebGL scene (its 2D drawing rendered to a texture on a quad at the rider's depth, so the Hanga style is kept), the spray as one instanced draw; the 2D canvas keeps only the HUD-like overlays, or goes | one full-screen canvas in GPU mode; the rider hidden behind a tree in a new scene; owner verdict on the look (feel spike first if the quad changes how the rider reads) |
| G7 | the whole mountain (ADR 0015) | S5 (tiles from the map file), S4 (clipmap sampling) | after C4b. Heights as tiles at a few levels of detail (the finest only near the rider and camera, like the corridor), sampled by the existing clipmap rings; slopes from the heights in the shader instead of a baked texture; CPU copies dropped after upload, with a lost context re-baking from the terrain; `paint-window.js` removed. The memory budget for El Tarter at 7 × 7 km stated in the ADR | El Tarter shown edge to edge with no window; GPU memory within the ADR's budget on the iPad; `gl-smoke` gains a real-map scene |
| G8 | bakes off the main thread | S4 and S5, with a Shared prep PR (`env` gains a worker factory) | the terrain bakes and `loadMapSteps` run in a module worker, typed arrays transferred, the progress text kept; Node tests call the same pure functions directly | the page stays responsive while a map loads (no long task over 50 ms in the Chrome trace in the PR) |

Not taken: replacing three.js with plain WebGL2. The game uses only a thin slice of it (raw shader materials, buffers,
textures, one scene), so it could go later for load size, but G2's parallel load and the browser cache cover most of
the cost; revisit if the iPad's first load is still slow after G2. An offline service worker is also left for later:
the per-commit preview folders make its scope and cache names a design of their own (its own ADR if the owner wants
home-screen play).

## Where this differs from the feedback plan, and why
- **The `Course` seam and the ENU frame (C2) move into the freeze.** In the feedback plan they sat in S5. F5, F6 and F7
  need the fall line and headings independent of +y, and flipping the frame later would rewrite stream code.
- **The façade split moves from B2a to B2b**, because B2b changes the state fields anyway.
- **D1 (perf harness) comes first in S4**, before F1 sizing and D2 shading, which both change render cost.
- **The Playwright ADR becomes 0003**, because 0002 records the ES modules and `createGame(env)` convention from B2a.
- **The status table moves to `docs/STATUS.md` in P1**, after B2a (which edits `ARCHITECTURE.md`), so the two don't conflict.

## Decisions (owner, 20 Nov)
1. **Flips:** in the air, drag up = front flip and drag down = backflip, on **either** half of the screen (left or
   right). Holding keeps rotating; flips combine with left and right spins. Keyboard: Up/W and Down/S in the air.
2. **Brake direction:** the equipment turns toward the side it already points.
3. **Art spec v1.4** (body twist, head yaw with the face vector, brake, switch-ski and flip-tuck poses, camera pitch
   for the rider): written by an agent in `art/`, additive and backward compatible, recorded in `docs/art/`.
   The design canvas copy of the spec is synced afterwards.
4. **Playwright** as a dev-only dependency for screenshots: yes by default (ADR 0003). It runs only in tests and CI
   and never ships to players.
5. **Code freeze** for B2b, B2c and C2: yes.
6. **Repo docs are canonical**; the project docs point to them.
7. Still open, from C4 onwards: may the game fetch map data at runtime (D0 in `docs/REAL-WORLD-DATA.md`)?

## Decisions (owner, 21 Nov)
1. **Graphics target:** the snow and light should compete with Grand Mountain Adventure 2. The CPU raycaster cannot
   (its render is about 244 px wide, upscaled, from a 1 px per metre colour map), so the GPU renderer is pulled
   forward from phase E as the test package **E0**, behind `?renderer=gl`; the CPU renderer stays the default until
   E0 wins on the iPad. three.js, vendored and pinned (ADR 0008 in the E0 PR), is the coordinator's choice of library.
2. **E0 accepted** on the iPad (50 to 60 fps, "still a way to go, but a big improvement"): the GPU renderer becomes the
   one renderer the look work builds on (E1 to E4 above).
3. **Ski tracks** (the line left in the snow) need a lot of work: a later workstream of their own, on the GPU renderer
   (tracks pressed into the snow, lit at their edges, fading with time and new snow). Not part of E1 to E4.

## Decisions (owner, 26 Nov)
1. **Flips on touch use both fingers** (replaces 20 Nov item 1 for touch): in the air, a finger on each half of the
   screen, both dragged up = front flip, both dragged down = backflip; holding keeps rotating. A one-finger drag in
   the air does nothing (one finger held still spins). Coordinator's call: on touch, flips and spins combine in
   sequence (two-finger flip, then one finger held to spin); on a keyboard they combine at once (Up/W, Down/S with
   Left/Right).
2. **The snow park comes next** (after X1 and the open #66 and #67): ramps made of snow, rails and boxes with real
   grind physics in many shapes (kinks, bends, boxes), jumps from small kickers to mega ramps, each with a landing.
   It should feel like a real snow park. Planned below as **K**.

## Decisions (owner, 27 Nov)
1. **The retrospective's changes are all accepted** (X2 above).
2. **Real mountains don't wait behind K:** C4b (loading El Tarter in the game) runs alongside K0–K3, as soon as the
   Bake map workflow has produced the files.
3. **A design and visual stream, S6.** It owns art direction and the Hanga spec (moved from S4) and environment art:
   trees, rocks, sky, backdrops and the look of park features. S6 designs, S4 builds: S6 writes specs, boards and the
   spec's data; all render code stays with S4. UI and menu visual design stay with S1; brand and store art are not
   planned yet.
4. **The sun can sit in different places later** (TD above): a date and time of day per course or chosen by the
   player, after K and C4b. Until TD0, El Tarter keeps one fixed sun (V1, #80, asks the owner which).
5. **V1's environment look is accepted** (trees, sky, Pyrenees backdrop, seen in game in spike #83). S4 builds it
   after a camera framing spike: the riding camera shows too little sky for the peaks to be seen.
6. **El Tarter's sun is a winter dawn, compass 110°** (the spec's `maps['el-tarter'].sun`), not the baked 76° (fall
   line + 90°). The art spec's `maps[id].sun` wins for the look; the course file's `sun` is only the default for a map
   the spec doesn't list. Today the Look reads `maps.procedural.sun` on every map (`MAP_ID`), so El Tarter rides
   under the play mountain's sun: a small S4 package makes the Look pick the loaded map's entry. TD0 replaces both
   with the real sun for a date and time.
7. **All three camera framings stay, and tapping the rider switches between them** (spike #87: A classic, B chase,
   C high). CV1 (Shared: `CAM_MODES` in config, game state, `gresca-cam` key, `?cam=`), CV2 (S4: the camera follows
   the mode, eased), CV3 (S1: tap the rider, `c` on keys). The default stays A until the owner picks one; the rider
   scale (F1) is set after, per mode if needed.
8. **Whole mountains and a lighter frame (G above) are the next items taken:** G1 to G3 now, alongside K and C4b;
   the G4 decision on the CPU renderer before G5 and G6; G7 (lifting the 1000 × 2450 m window) right after C4b.

## K: a real snow park (next to take, owner 26 Nov)
Today a kicker is a launch zone (`Course.kickerAt`) with a speed gain, stamped as a bump on the procedural maps only;
the jump is a height above whatever snow is underneath, so there is no landing to aim for and landing on a slope
feels the same as landing on the flat. A rail is a straight line at one height and a grind slides along it with a
fixed drag. K replaces this with park features that are part of the snow and physics that come from their shape.

**What "a real park" means here (acceptance for the whole of K, ridden on the iPad):**
- **Jumps are snow.** Every jump is a takeoff, a table (or a gap) and a landing, shaped into the terrain's
  `features` layer (`docs/REAL-WORLD-DATA.md`, layer stack) so the GPU terrain draws and lights it as snow, with
  groomed sidewalls and the dyed lip and knuckle lines real parks use. Sizes, roughly as in real parks:

  | Size | Lip height | Lip angle | Table or gap | Landing |
  |---|---|---|---|---|
  | XS / S kicker | 0.6–1.5 m | 15–25° | 3–6 m | 25–28°, 10–15 m |
  | M | 1.5–2.5 m | 25–30° | 8–12 m | 28–30°, 15–20 m |
  | L | 2.5–4 m | 28–32° | 14–20 m | 30–32°, 20–28 m |
  | XL / mega ramp | 4–8 m, with a built drop-in | 30–35° | 20–30 m gap | 32–35°, 30–40 m |

  Each jump is designed for a speed (from its run-in); the shape library sizes the landing so a rider at that speed
  lands in the middle of the landing slope. Quarter pipes and hips are later, not part of K.
- **Flight is over the real snow.** The rider flies in world height (not height above the ground), leaves the lip
  because the snow falls away faster than the rider does, and lands where the trajectory meets the snow. Landing
  impact is the speed into the snow's surface (normal to it): matching the landing slope is soft at any height;
  knuckling, casing the table or hitting the flat bottom is hard, and too hard is a crash. Small speed is lost in the
  landing, more in a hard one. No `launchGain` fudge: a bigger jump goes further because it is bigger.
- **Rails and boxes have shapes.** A feature is a 3D polyline with a profile: round rail (tube, 5–10 cm) or box
  (flat top, 0.3–0.6 m wide), on legs or a snow-buried base, with an on-ramp or a side-on entry. The shape library
  has straight, down, flat-down, down-flat-down, flat-down-flat (kinks), rainbow, C-rail and S-rail (bends in plan),
  and flat, down, kinked and rainbow boxes, at 0.3–1.5 m high and 6–20 m long.
- **Grinds follow physics.** On a rail the rider moves along its tangent: gravity along the slope of the segment
  speeds them up on a down rail; friction (rail and box differ) slows them on the flat. At a kink, speed carries
  onto the new segment; going over a convex kink fast lifts the rider off for a moment and they must stay lined up
  to land back on. A bend needs the rider to lean into it (steer): too fast for its radius, or too much lean, and
  they slide off the outside. The board's angle to the rail picks the grind: lined up is a 50-50 (skis or board),
  across it is a boardslide or lipslide (by the side they came from); a balance value drifts with misalignment and
  steer corrects it, and losing balance drops the rider off, or crashes them if they are badly off. Getting on: ride
  on from an on-ramp, or ollie onto it from beside it. Riding into a box side or a rail's legs is a crash.
- **It is laid out as a park.** The play mountain gets a park: a jump line of 3–4 tables at steady speeds in S, M
  and L lines, a jib section of 6–10 rails and boxes close together, and one mega ramp with its drop-in. The course
  file's park layout (ADR 0010) holds the same features for real maps (El Tarter's park, owner 25 Nov). Scores and the
  popup name the trick ("Boardslide to 50-50", "Kink 50-50") once trick names move to `src/ui/`.

**Packages, in order** (one PR each; contracts first, then the streams in parallel where their files allow):

| # | Package | Stream | What |
|---|---|---|---|
| K0 | park contract and format (ADR 0012) | Shared | `Course.features`: jumps `{s, d, size, designSpeed, takeoff, table, landing}` and rails `{points: [{s, d, h}], profile 'rail'│'box', width, legs, entry}` in `core/contracts.js`; the course file's park layout gains the same (an additive format version, old files still load); the jump gravity moves to `core/config.js` so `world/` can size landings with the sim's constant; `SimEvent` `grindStart`/`grindEnd` gain `style` and `kinks`; `RiderState.grind` gains `seg`, `style`, `balance`; `AnimInput` gains `grindStyle` |
| K1 | park shape library | S5 | `src/world/park/`: pure functions from a feature to its snow height (takeoff curve to the lip angle, table, knuckle, landing sized for `designSpeed`, run-out, sidewalls) and its rail polylines; the `features` layer stamps the jumps into the terrain; the play mountain's park layout. The test slope is unchanged (AGENTS.md "Do not break"). Tests: every size's landing catches a rider at its design speed between knuckle and bottom (a pure trajectory check) |
| K2 | flight and landing over the snow | S2 | `sim/jump.js`: world-height flight, takeoff from the lip's shape, landing impact normal to the snow, knuckle and flat-bottom crashes. One flight model for every map: the test slope's physics assertions still pass unchanged; the golden hash is re-recorded once, with the trace differences measured in the PR |
| K3 | grind physics | S2 | `sim/grind.js` on polylines: gravity along the segment, rail and box friction, kinks (carry speed, lift off over convex kinks), bends (lean, slide off the outside), styles from the board angle, balance, ollie-on entry, side and leg crashes. Tests per shape at fixed speeds |
| K4a | park look in the spec | S6 | spec v1.5 (V2): the colours, dye lines and materials K4 draws, with boards; written while K1 to K3 run |
| K4 | park features on screen | S4 | after E3b (#67) and K4a: rails and boxes as GPU meshes from the polylines (tubes bent at kinks and bends, box tops and sides, legs into the snow); jumps drawn as snow with groomed sidewalls and the dyed lip and knuckle lines from the Look; CPU fallback stays simple |
| K5 | grind poses | S3 | 50-50, boardslide and lipslide, and lean into bends from `AnimInput.grindStyle` and the balance (art spec version if poses are new) |
| K6 | trick names for grinds | S1 | after the `trickName` move to `src/ui/`: the popup names grinds and combos from the `grindEnd` fields |

K0 goes first and alone (a contract PR). Then K1, K2 and K3 in parallel (K2 and K3 both touch `src/sim/` but different
files; K3 waits for K1 only for the play mountain layout, and tests on its own fixtures). K4 starts when K1, K4a and #67 are
in; K5 and K6 after K3. Acceptance for K: on the iPad, ride the play mountain's park top to bottom, land every jump
size on its landing at the speed its run-in gives, and grind a down-flat-down rail and a C-rail without falling off.
