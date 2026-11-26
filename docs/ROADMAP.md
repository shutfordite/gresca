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
| **S4** look, camera, render | `src/view/look`, `src/view/camera`, render | **D1** frame-time harness → **E0** GPU terrain renderer test (three.js, ADR 0008; accepted) → **E1** GPU renderer by default (`?renderer=cpu` as the fallback), lost-context handling, texture memory budget, softer corduroy, the shared ray constants in `core/config.js` → **E2** light: soft sun shadows from the terrain, rider and tree shadows drawn on the GPU (replacing the blocky painted ones) → **E3** trees, rails, flags and kickers as GPU objects → **E4** post: tilt-shift, dawn haze. F1 sizing and D3 data-driven trees fold into E1 and E3; D2 is replaced by E0 |
| **S5** maps | `src/world`, `tools/`, `maps/` | **C1** polyline `Course.fromRun` (R4) → C3 course half (`<id>.course.json`) → **C4** map loading, corridor detail, load-your-own file, slope and data-defect rules (R5) |

S2 and S3 meet only through `RiderState`, `AnimInput` and `SimEvent`. S1 and S2 meet only through `InputState`. S4 and
S3 meet through `Look.rider.project`. All of these are fixed in B2b, B2c and P4.

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
