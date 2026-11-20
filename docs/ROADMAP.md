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
| 5 | **C2** one world frame (ENU) | the procedural map in east-north-up metres; plus a **rotated-map test**: the whole suite passes with the procedural map rotated to an arbitrary heading | proves no axis assumption is left before streams build on it; doing it later would rewrite stream code |

The freeze is about four PRs (B2a, B2b, B2c and C2), plus the P1 docs PR between B2a and B2b.

## Phase 2: shared tooling (parallel, after the freeze)

| Package | Owner | Notes |
|---|---|---|
| **P4** Look interface (F2) | S4 | `view/look/`: `Look` with roles, tones, sky, fog, sprite styles, camera framing, `rider.project`; `look/hanga.js` is the only file reading `HANGA`; hard-coded hex and CSS variables come from the look's tokens; contract tests; a lint test bans hex literals and `HANGA.` outside `view/look/`; `lab.html` look lab. Send the **art spec v1.4 request** (body twist, head yaw with the face vector, brake, switch-ski and flip-tuck poses) at the same time. |
| **P5** scenes, fixtures, screenshots | shared | `Gresca.scene(name)` and `?scene=`; recorded `RiderState` traces in `test/fixtures/`; `npm run shot` with Playwright (dev-only, **ADR 0003**; 0002 is ES modules) at iPad size; CI attaches shots to PRs touching `view/`, `art/` or `styles/`; per-area test scripts. |
| **C3a** map compiler, terrain half | S5 | `tools/` only: the pure JS compiler core, DEM and piste adapters, `<id>.terrain.json` plus validator. It touches no `src/`, so it can start as soon as B2c fixes the course schema. |

## Phase 3: streams (parallel; each owns its folders)

| Stream | Owns | Order inside the stream |
|---|---|---|
| **S1** controls and UI | `src/input`, `src/ui`, `styles/` | F4 bindings table → controls screen and pause → F3 flip input and air hints → stance picker |
| **S2** sim feel | `src/sim` (+ `sim/tuning.js`) | F5 brake as a skid across the fall line → F6 edge and carve model, remove the heading clamp, ollie preload → F3 flip physics and scoring → (optional) gravity slope-law A/B |
| **S3** rider animation | `art/gresca-rider-anim.js`, `src/view/rider` | body twist → F5 brake counter-rotation → F6 edge-driven lean and unweighting → F7 fakie look-over-shoulder (goggles wait for spec v1.4) → F3 flip tuck |
| **S4** look, camera, render | `src/view/look`, `src/view/camera`, render | **D1** frame-time harness → F1 scale test and sizing (one scale, real camera pitch) → **D2** per-pixel shading through the Look → **D3** trees and backdrop from data → (if D1 says so on real maps) WebGL2 renderer as a phase E behind the same view interface |
| **S5** maps | `src/world`, `tools/`, `maps/` | **C1** polyline `Course.fromRun` (R4) → C3 course half (`<id>.course.json`) → **C4** map loading, corridor detail, load-your-own file, slope and data-defect rules (R5) |

S2 and S3 meet only through `RiderState`, `AnimInput` and `SimEvent`. S1 and S2 meet only through `InputState`. S4 and
S3 meet through `Look.rider.project`. All of these are fixed in B2b, B2c and P4.

## Where this differs from the feedback plan, and why
- **The `Course` seam and the ENU frame (C2) move into the freeze.** In the feedback plan they sat in S5. F5, F6 and F7
  need the fall line and headings independent of +y, and flipping the frame later would rewrite stream code.
- **The façade split moves from B2a to B2b**, because B2b changes the state fields anyway.
- **D1 (perf harness) comes first in S4**, before F1 sizing and D2 shading, which both change render cost.
- **The Playwright ADR becomes 0003**, because 0002 records the ES modules and `createGame(env)` convention from B2a.
- **The status table moves to `docs/STATUS.md` in P1**, after B2a (which edits `ARCHITECTURE.md`), so the two don't conflict.

## Decisions needed
1. Flip controls: drag up and down in the air (recommended), or another scheme?
2. Brake direction: toward the side the equipment already points (recommended), or always heel-side for a board?
3. Who updates the art spec to v1.4 (twist, head yaw, new poses)?
4. Is Playwright OK as a dev-only dependency for screenshots (ADR 0003)?
5. Is a code freeze OK for B2b, B2c and C2, one PR at a time?
6. Repo docs canonical, project docs as pointers? (Recommended.)
7. Later, from C4 onwards: may the game fetch map data at runtime (D0 in `docs/REAL-WORLD-DATA.md`)?
