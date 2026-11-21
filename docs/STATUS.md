# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 21 Nov 2026, main after PR #30.

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
| P6 mechanical PR check (`tools/review/`, `PR check` workflow posting one report comment per PR) | this PR |

## In progress (phase 3, the five streams, started 21 Nov; parallel, each in its own folders)
| Stream | Package | Branch |
|---|---|---|
| S1 controls and UI | **F4a** bindings table (`src/input/bindings.js`) and a Controls screen generated from it, reachable from the menu | `ui/f4a-controls` |
| S2 sim feel | **F5** brake as a skid across the fall line, analog strength, no fixed deceleration | `sim/f5-brake` |
| S3 rider animation | **S3a** body twist: lower body and equipment follow `boardHeading`, upper body `travelHeading`/fall line (spec `twistDeg`) | `anim/s3a-twist` |
| S4 look, camera, render | **D1** frame-time harness by stage, baseline, `ImageData` reuse, the slow-frame spikes | `perf/d1-harness` |
| S5 maps | **C1** polyline `Course` and `Course.fromRun` (R4); the procedural map as one polyline source | `maps/c1-polyline` |
These PRs don't edit this file. F5 and C1 may both re-record the golden trace: the second to merge merges
`origin/main` and re-records, explaining the diff. The D1 bench lives in `tools/bench/` (agreed exception to S5
owning `tools/`).

## Next, in order
- S1: F4b pause button and in-game controls → F3 flip input and air hints → stance picker.
- S2: F6 edge and carve model (removes the heading clamp; flip yaw/turn rate to counter-clockwise) → F3 flip physics.
- S3: F5 brake counter-rotation → F6 edge-driven lean → F7 fakie look → F3 flip tuck.
- S4: **F5-cam** camera follows `travelHeading` (small; fixes the low-speed flip) → F1 sizing → D2 → D3.
- S5: C3b course file → C4 map loading (needs D0).

## Known issues (not yet fixed)
- **Camera flips at low speed** when the board is across the slope and slides tail-first: the camera follows the
  equipment heading (`back ? a+π : a`). This is fixed by F5 (the camera follows `travelHeading`, added in B2b).
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
