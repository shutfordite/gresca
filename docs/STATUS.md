# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 26 Nov 2026, main after PR #61.

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
| F5-anim brake counter-rotation: the upper body stays on the fall line | #51 |
| F4b pause button, pause panel, hidden-page auto-pause, the Controls screen in game | #52 |
| C3b the course file `<id>.course.json` (ADR 0010) and `validateCourse` | #53 |
| E2 soft sun shadows from the terrain, rider and tree shadows on the GPU | #54 |
| F7 ski fakie: the head looks over the downhill-side shoulder | #56 |
| C4a map loader in `world/` (ADR 0011): terrain and course file to a world, corridor-only 2 m detail; synthetic map | #57 |
| F6 edge and carve model, no heading clamp, sim yaw counter-clockwise (golden hash `958814d0…`) | #58 |
| E3a trees as one instanced GPU mesh | #59 |
| F3-input flip input in the air (drag up/down, `W`/`S`), air hints for the first 3 jumps | #60 |
| CI: the preview comment links both maps | #61 |

## In progress (phase 3, the five streams; parallel, each in its own folders)
| Stream | Package | Branch |
|---|---|---|
| Shared | `AnimInput` gains `edge`, `skid`, `flipRot` (for F6-lean and the F3 tuck) | `core/anim-input-edge` (#62) |
| Shared | This file after #61; `edge`, `map-loader`, `gl-trees`, `air-controls`, `track-trail` in the per-area test scripts | `docs/status-after-61` |
| S1 controls and UI | **Stance picker**: regular / goofy for the snowboard, on the menu, saved under `gresca-stance` | `ui/s1-stance-picker` |
| S2 sim feel | **F3** flip physics and scoring: `InputState.flip` turns `flipRot`, the `flip` event, landing a flip, flip and spin combos in the score | `sim/f3-flip-physics` |
| S3 rider animation | **F6-lean** edge-driven lean and unweighting, from `AnimInput.edge` and `skid` (draft on #62) | `anim/f6-lean` |
| S4 look, camera, render | **E3b** rails, flags and kickers as GPU objects; every GPU object (trees too) lit by the baked sun visibility | `view/e3b-gpu-features` |
| S5 maps | **C4b** waits for the owner's El Tarter bake (below) | none |

## Next, in order
- S1: C4b menu entry for real maps (with S5's C4b).
- S2: **ollie preload** (moved out of F6, #58, and out of F3 to keep F3 small): pop on jump release needs S1 to request
  the jump on release, and the crouch needs an `AnimInput` field (a Shared contract PR first). Then (optional) the
  gravity slope-law A/B.
- S3: F3 flip tuck (after S2's F3; `AnimInput.flipRot` is ready from #62).
- S4: E4 tilt-shift and haze. The camera framing on the play mountain's 30° slopes (looks flat, #48) is its own
  small package after E3b.
- Ski tracks: T1 is done; pressing them into the snow, lit edges and fading are the later tracks workstream.
- S5: **C4b** loading a map in the game: `fetch` from `maps/` through `env` (same origin), a file the player picks,
  chunked build with progress (`loadMapSteps`), `createGame` taking a loaded world (a Shared prep PR first: `app.js`),
  a real-map branch for `world.H`/`M`/`layout` until D2, the rider start from the course tangent at `startS` (replacing
  `START_HEADING`/`MENU_HEADING`), credits from `world.credits`, kickers without ramps until the features layer, the
  course's sun from the Look's dawn setting, and removing `PENDING_ROOTS` from `test/page.test.js` (#57). Its
  acceptance ride is El Tarter start to finish. **C4c** R5 slope and data-defect rules can run alongside, in `world/`.

## Owner to do
- **Bake El Tarter** (the agents' sandbox blocks the tile and piste hosts): `node tools/map-compiler/cli.mjs --config
  maps/sources/el-tarter.json --fetch`, then list the piste names the file holds with
  `node -e "const t=require('./maps/el-tarter.terrain.json');console.log([...new Set(t.pistes.map(p=>p.name))].join('\n'))"`,
  and write the course with `--course --terrain maps/el-tarter.terrain.json --run-name "<name>"` (the name must match
  exactly, accents included). Commit `maps/el-tarter.terrain.json` and `maps/el-tarter.course.json`. C4b's acceptance
  (El Tarter rideable start to finish) waits on it.
- **The first real course (owner, 25 Nov):** El Tarter's snow park if OpenSkiMap maps it as a piste; otherwise Àliga.
  The snow park's kickers and rails go in the course file's park layout (ADR 0010) until real park features are mapped.

## Known issues (not yet fixed)
- **A few very slow frames in Chrome** (the mean frame time is about 6× the median, on main too). Look at this first
  in D1.
- **C2 leftovers, for later packages:** `START_HEADING`/`MENU_HEADING` (1.57, `view/camera.js` and `app.js`) are grid
  headings turned through the frame until C4b starts the rider on the course tangent; the minimap still draws in grid
  orientation, so S1/C4b decide whether a rotated or real map gets a north-up minimap. The view keeps the spec's
  clockwise sign for `pathTurn` and `riderYaw` on purpose (#58); S3 may tidy it. `?rot=<deg>` in the URL places the
  procedural map rotated (debug). (F6 removed `CARVE_LIMIT` and made the sim's yaw counter-clockwise.)
- **The design canvas copy of the art spec** (claude.ai design "Gresca Rider Style Prototypes",
  `project/data/gresca-hanga-spec.js`) is synced from the repo; re-sync it after every spec version.
- **Pose tuning for S3:** the ski tuck reads as a blob from straight behind, the ski brake legs look short, and the
  board's toe-side brake looks like kneeling at yaw 90.

## Decisions on record
In `docs/ROADMAP.md` ("Decisions"), ADRs 0001, 0002, 0004 and 0005 (0003 is reserved for Playwright), and `docs/REAL-WORLD-DATA.md` (R1–R6). **D0**
(runtime fetching) stays open; until the owner decides, C4 follows the recommendation in `docs/REAL-WORLD-DATA.md`:
nothing third-party is fetched at runtime, and the game loads only baked files from its own `maps/` folder or a file
the player picks. Decide with El Tarter's real file size and frame times once it rides.

## How the work is run
The coordinator skill (`.claude/skills/gresca-architect/SKILL.md`) holds the method: briefing agents, reviewing PRs,
checking in a browser, and keeping this file current. Update this file in every PR that finishes or opens a package.
