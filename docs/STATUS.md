# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 22 Nov 2026, main after PR #49.

## Done
| Package | PR |
|---|---|
| A1 test façade (`window.Gresca`) | #6 |
| A2 fast tests (~14 s) | #7 |
| A3 fixed 120 Hz step, seeded RNG | #8 |
| PR previews on GitHub Pages, one folder per commit | #9, #11 |
| B1 game split out of `index.html` (ADR 0001, no build step) | #12 |
| Fix: ski tracks no longer turn black | #13 |
| B3 terrain interface: layer stack, smooth physics surface | #14 |
| B2a ES modules, all state made by `createGame(env)`, CSS in `styles/` (ADR 0002) | #17 |
| Docs: AGENTS standards, roadmap, CLAUDE.md, PR template, decisions | #15, #16, #19 |
| Art spec v1.4: twist, head yaw, body pitch (board flips about its long axis), camera pitch, brake/switch/tuck poses; additive, unused by the game until S3/S4 | #18 |
| Coordinator skill (`.claude/skills/gresca-architect`) and this file | #20 |
| P0 token budget: quiet `npm test`, `tools/outline.mjs`, `docs/STYLE.md`, token rules | #22 |
| P1 docs: code map and stream ownership in `AGENTS.md`, per-folder `AGENTS.md` in `src/sim`, `src/view`, `art` | #23 |
| B2b state contracts (InputState, RiderState, SimEvent), `step() -> events` on a bus, input recording, façade per area | #24 |
| B2c world seams: the `Course` interface (ADR 0004), `RiderState.fallLine`/`downhillSide`, `AnimInput`, the course seam lint, the golden trace | #25 |
| C2 one world frame (ENU, ADR 0005): `MapFrame`, headings counter-clockwise from east, `npm run test:rotated` in CI, `test/map-view.js`. Ends the freeze | #26 |
| C3a map compiler, terrain half: `tools/map-compiler/`, `gresca-map-1` terrain file (ADR 0006), validator | #29 |
| P5 scenes (`Gresca.scene()`, `?scene=`), `RiderState` traces, `npm run shot` with Playwright (ADR 0003), per-area test scripts | #28 |
| P4 Look interface (`src/view/look/`, ADR 0007), the Hanga look as the only `HANGA` reader, look lint, `lab.html` | #30 |
| S3a body twist: the lower body follows the equipment | #32 |
| F4a bindings table and a generated Controls screen | #33 |
| F5 brake as a skid across the fall line | #34 |
| C1 polyline `Course` and `Course.fromRun` | #35 |
| D1 frame-time harness by stage, baseline, `ImageData` reuse | #37 |
| F5-cam the camera follows the direction of travel | #38 |
| P6 mechanical PR check (`tools/review/`, `PR check` workflow posting one report comment per PR) | #39 |
| S4 quick win: smoother snow on the CPU raycaster (spans shaded as gradients, relief and grain) | #40 |
| Docs: GPU renderer pulled forward as E0, S4 order | #41 |
| E0 GPU terrain renderer (three.js, ADR 0008). Accepted on the iPad (50 to 60 fps) | #42 |
| E1a GPU renderer by default (`?renderer=cpu` fallback), play link in the README | #43 |
| E1-prep ray constants (`RAY_START_M`, `RAY_SPREAD`) in `core/config.js` | #44 |
| E1b GPU renderer hardening: lost WebGL context, texture memory budget, softer corduroy | #45 |
| T1 ski tracks cut by the equipment (`track-trail.js`, the GPU ribbon) | #46 |
| M1 the play mountain (steep, big kickers), the map the game opens on; `?map=test` for the test slope (ADR 0009) | #48 |
| L1 hold to look back: `InputState.lookBack` (L1a), swipe up and hold or `B`, the camera swings uphill (L1b) | #47, #49 |

## In progress (phase 3, the five streams; parallel, each in its own folders)
| Stream | Package | Branch |
|---|---|---|
| Shared | This file after #49 | `docs/status-after-49` |
| S1 controls and UI | **F4b** pause button and the Controls screen in game | `ui/f4b-pause` |
| S2 sim feel | **F6** edge and carve model, no heading clamp, yaw counter-clockwise | `sim/f6-edge-carve` |
| S3 rider animation | **F5-anim** brake counter-rotation: the upper body stays on the fall line | `anim/f5-counter-rotation` |
| S4 look, camera, render | **E2** soft sun shadows from the terrain; rider and tree shadows on the GPU | `view/e2-shadows` |
| S5 maps | **C3b** the course file `<id>.course.json` and its validator | `maps/c3b-course-file` |

## Next, in order
- S1: F3 flip input and air hints → stance picker.
- S2: F3 flip physics and scoring (ollie preload if F6 leaves it out).
- S3: F6 edge-driven lean → F7 fakie look → F3 flip tuck.
- S4: E3 GPU trees and park objects → E4 tilt-shift and haze (`docs/ROADMAP.md`). The camera framing on the play
  mountain's 30° slopes (looks flat, #48) folds into E3 or its own small package.
- Ski tracks: T1 is done; pressing them into the snow, lit edges and fading are the later tracks workstream.
- S5: C4 map loading (needs D0).

## Known issues (not yet fixed)
- **A few very slow frames in Chrome** (the mean frame time is about 6× the median, on main too). Look at this first
  in D1.
- **C2 leftovers, for later packages:** the carve limit (`CARVE_LIMIT`) is measured from the map frame's across axis
  until F6 moves it to the fall line; `START_HEADING`/`MENU_HEADING` (1.57, camera and menu) are grid headings turned
  through the frame until C1 gives the course a start direction; the rider yaw and path turn rate are clockwise-positive
  (the mirror of main, to keep the golden trace bit for bit): F6 should flip them to counter-clockwise when it changes
  feel anyway and update the golden hash then; the minimap still draws in grid orientation, so S1/C4 decide whether a
  rotated or real map gets a north-up minimap. `?rot=<deg>` in the URL places the procedural map rotated (debug).
- **The design canvas copy of the art spec** (claude.ai design "Gresca Rider Style Prototypes",
  `project/data/gresca-hanga-spec.js`) is synced from the repo; re-sync it after every spec version.
- **Pose tuning for S3:** the ski tuck reads as a blob from straight behind, the ski brake legs look short, and the
  board's toe-side brake looks like kneeling at yaw 90.

## Decisions on record
In `docs/ROADMAP.md` ("Decisions"), ADRs 0001, 0002, 0004 and 0005 (0003 is reserved for Playwright), and `docs/REAL-WORLD-DATA.md` (R1–R6). Still open:
**D0** (may the game fetch map data at runtime; matters from C4).

## How the work is run
The coordinator skill (`.claude/skills/gresca-architect/SKILL.md`) holds the method: briefing agents, reviewing PRs,
checking in a browser, and keeping this file current. Update this file in every PR that finishes or opens a package.
