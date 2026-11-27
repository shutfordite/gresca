# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 27 Nov 2026 (evening), main after PR #96. Only the coordinator edits this file (AGENTS.md).

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
| STATUS after #61, the area test scripts | #63 |
| `AnimInput` gains `edge`, `skid`, `flipRot` | #62 |
| S1 stance picker (Regular / Goofy, `gresca-stance`) | #64 |
| S2/F3 flip physics and scoring (±40° landing window) | #65 |
| S3/F3-draw the flip: `bodyPitchDeg` and the `tuck` pose | #69 |
| S1/F3-touch two-finger flips (owner, 26 Nov) | #68 |
| S3/F6-lean edge-driven lean and unweighting, from `AnimInput.edge` and `skid` | #66 |
| S4/E3b rails, flags and kickers as GPU objects; every GPU object lit by the baked sun visibility | #67 |
| STATUS after #69, X1 in the roadmap; K, a real snow park, planned in the roadmap | #70, #71 |
| X1 conflict-proofing: test areas from `// @areas` tags, golden split into sim and anim hashes, carve scenes, one property per line at the seams | #72 |
| H0 contract: `RiderState.yawRate`, `snowDepth`, `sink`; `AnimInput.sink` | #84 |
| H1–H3 handling rework (owner, 27 Nov): `terrain.powder` light and deep snow (S5); the snow contact: edge builds over half a second and is capped to what the snow holds, turn-rate inertia, kinetic skid, no slip banked as speed, momentum braking, powder sink, plough and drag (S2); the powder look: deep snow pillows, rider sunk with a snow mound, trench, plumes (S4). Merged into the stack, landed on main by #90 | #85, #88, #89, #90 |
| X2 retrospective changes: Bake map workflow, GPU smoke in CI, code map split into folder `AGENTS.md`, STATUS for the coordinator only, feel spikes, the owner loop, Debt table | #73 |
| S6 design and visual stream added (owner, 27 Nov) | #74 |
| El Tarter baked (terrain and Àliga), OpenSkiMap read feature by feature | #75, #77 |
| A course starts at its high point (`topS`) | #78 |
| **C4b** `?map=<id>` loads a real map and rides it: El Tarter / Àliga in the game, chunked load with progress, a 1000 × 2450 m paint window along the run, credits and ODbL in the menu | #79 |
| C4b follow-up: piste edge poles in the run's difficulty colour, honest loading progress (CPU load 11 s → 1.8 s) | #82 |
| V1 art spec v1.5, environment (trees, rocks, sky, Pyrenees backdrop); accepted (decision 5) | #80, #86 |
| Docs: TD time of day, G whole mountains and a lighter frame, U street plan (`docs/STREET.md`) | #81, #93, #96 |
| CV1–CV3 camera modes A classic, B chase, C high (`gresca-cam`, `?cam=`), eased switch, tap the rider or `c` to cycle. Spike #87 closed | #92, #94, #95 |

## In progress
| Stream | Package | Branch |
|---|---|---|
| Shared | **K0** park contract and format (ADR 0012), alone among contract PRs | `shared/k0-park-contract` |
| S2 | **G1** spray pool | `s2/g1-spray-pool` |
| Shared | **G2** load in parallel (`src/main.js`, `index.html`) | `shared/g2-parallel-load` |
| Shared | **G3** idle frames (`src/app.js`) | `shared/g3-idle-frames` |
| S1 | **C4b-menu** pick the map and run in the menu (owner feedback: "choose the run from the menu") | `s1/c4b-run-picker` |

## Next, in order
- **K1** (S5 shape library), **K2** (S2 flight) and **K3** (S2 grinds) in parallel once K0 merges; **K4a/V2** (S6 park
  look in the spec) can start now, docs and spec only; K4 (S4) once K1 and K4a are in; K5 (S3) and K6 (S1) after K3.
- **G4** (owner decision, below), then G5 and G6. **G7** the whole mountain (ADR 0015, S5 and S4) is unblocked now
  that C4b has landed; it starts after G1–G3 merge, with **G8** bakes in a worker alongside.
- S4: **the Look picks the loaded map's sun** (decision 6; `look/hanga.js` reads `MAP_ID`, so El Tarter rides under the
  play mountain's sun), after G2 (it may need `main.js`). Then **V1's environment look in game** (trees, sky, backdrop
  ridge from spec v1.5, decision 5); then F1 rider scale per camera mode (decision 7); then E4 tilt-shift and haze.
- Shared: `flips` (signed whole rotations) on the `score` and `flip` events; then S1 names tricks in the HUD popup,
  moving `trickName` from `sim/jump.js` to `src/ui/` (#65 review). K6 needs it.
- S2: **ollie preload** (a Shared `AnimInput` crouch field first; S1 requests the jump on release). K3's ollie-on
  entry uses it.
- S3: deep powder pose from `AnimInput.sink`, then K5.
- S5: **C4c** R5 slope and data-defect rules (El Tarter's 60° slopes) in `world/`, alongside K1.
- TD (time of day) after K; U (street) after K, G7 and TD0.

## Waiting on the owner
Verdicts and one-tap jobs only; everything else is the agents'. The coordinator raises these in the daily try list.

| What | How | Since |
|---|---|---|
| **Handling feel** (H2): the 27 Nov feedback said steering is too sensitive (before H2 landed). Still? Is the brake's stopping distance right? | Ride the main preview. One number per answer: `RIGS.*.edgeRate` (sensitivity), `BRAKE.SKID_DECEL` (stop) | 27 Nov |
| **Powder look** (H3): do light and deep powder read as different snow; the sunk rider and the plume? | Same ride, off the piste | 27 Nov |
| **Àliga as a ride** (C4b, #79, #82): speed, the view from the start, load time; do the edge poles make it easy to follow (20 m apart)? | Main preview with `?map=el-tarter` | 27 Nov |
| **Camera modes** (CV2, CV3): do B and C frame well; is the rider tap easy to hit with no accidental switches? Which mode is the default? | Main preview, tap the rider | 27 Nov |
| **G4: the CPU renderer's role** (before G5 and G6) | Is a device without WebGL2 still worth drawing for, or is the CPU raycaster a frozen fallback with no new looks? Recommendation: frozen fallback | 27 Nov |

## Debt
Known issues and review notes left for later. Each stream's next package clears one of its rows or says why not in
its PR; the coordinator adds rows from reviews and raises any row older than a week in the try list.

| Item | Stream | From | Trigger |
|---|---|---|---|
| A few very slow frames in Chrome (mean frame time about 6× the median, on main too); likely garbage collection from the spray (about 3.6 MB per 10 s) | S4, S2 | D1 #37 | G1, then re-measure |
| F1 rider scale: one scale for the rider, flags, rails and trees, with the ratio test from the feedback plan (folded into E1/E3 and never closed) | S4 | 20 Nov plan | after the camera-mode verdict (decision 7), per mode if needed |
| Scenes `ride-board` and `ride-ski` never ride straight (scene inputs merge step to step, so "straight" still turns); fixing it changes their shots | S4 | X1 | next S4 package |
| Pose tuning: ski tuck reads as a blob from behind, ski brake legs look short, board toe-side brake looks like kneeling at yaw 90 | S3 | #69, #51 | K5 or sooner |
| Ski lead code allocates two arrays and two closures per frame: use a plain loop | S3 | #66 | next S3 package |
| C2 leftovers: `START_HEADING`/`MENU_HEADING` grid headings on the procedural maps; minimap in grid orientation (north-up for real maps?) | S5, S1 | #26 | G7 (the paint window goes) |
| The view keeps the spec's clockwise sign for `pathTurn` and `riderYaw` (#58); tidy it | S3 | #58 | optional |
| The design canvas copy of the art spec (claude.ai "Gresca Rider Style Prototypes") must be re-synced after every spec version | S6 | #18 | each spec version |
| Deep powder pose: lean back and lower stance from `AnimInput.sink` (H0 added it; nothing reads it yet) | S3 | #84, #89 | next S3 package |
| The CPU colour map has no powder look (only the GPU shader shades light and deep snow); the rider, spray and trench work on both | S4 | #89 | before CPU fallback is shown to players, or E4 |
| Analog steer on touch: the edge now builds with the steer held, but touch sends 0 or 1, so a light touch can't ask for a gentle edge | S1 | #88 | after the handling verdict |
| Golden and `events.test.js` autopilots aim 8 m ahead with bang-bang steering, tuned to H2's edge rate: a sensitivity change can send them off the piste again. A proportional pilot would make them robust | S5 (tools), S2 | #88 | next feel change to `edgeRate` or `yawLag` |
| `rotated.test.js` tolerance raised from 1e-9 to 1e-8 (turn-rate inertia grows rounding faster); a more stable comparison (shorter run, or s/d at checkpoints) could restore 1e-9 | S2 | #88 | next sim package |
| Brake travel in `brake.test.js` is measured only while faster than 5 m/s (the 16 m stop crosses the test slope's bending fall line) | S2 | #88 | if the brake is retuned |
| Real snow data: `terrain.powder` is a shape model (hollows, ridges, steepness, patches); a snow-depth raster at bake time could replace it through `Terrain.create({ powder })` | S5 | #85 | after C4b |
| `course.test.js` fall-line check moved to world metres (`g.raw`): through the map view, grid rounding of 1e-13 m swung it 1.3e-12 rad on a nearly level spot. Other map-view checks with 1e-12 tolerances may be as fragile | Shared (`test/map-view.js`) | #88 | next map-view change |
| Real maps: the menu still says "Real elevation data comes next" and the credits are long | S1 | #79 | C4b-menu |
| Real maps: lifts, village and finish line aren't painted; the start heading is the window's start-to-finish direction, not the run's first bend | S4, S2 | #79 | G5; with C4c |
| El Tarter has 60° slopes the bake warned about | S5 | #79 | C4c |
| Piste pole colours are in the Look's unspecified list (`sprites.pistePole`): needs a spec role; poles on bends are spaced along the centreline | S6, S4 | #82 | V2 |
| Camera modes: `horizonFrac` per mode is the spike's, not tuned; the rider draws smaller in B and C; `Gresca.config.camBack` is mode A's | S4 | #94 | F1 |
| The rider tap box is estimated from the camera (boots to 1.9 m), so it stays at the boots in a jump | S1, S4 | #95 | G6 |

`?rot=<deg>` places the procedural map rotated (debug).

## Decisions on record
In `docs/ROADMAP.md` ("Decisions"), ADRs 0001, 0002, 0004 and 0005 (0003 is reserved for Playwright), and `docs/REAL-WORLD-DATA.md` (R1–R6). **D0**
(runtime fetching) stays open; until the owner decides, C4 follows the recommendation in `docs/REAL-WORLD-DATA.md`:
nothing third-party is fetched at runtime, and the game loads only baked files from its own `maps/` folder or a file
the player picks. Decide with El Tarter's real file size and frame times once it rides.

## How the work is run
The coordinator skill (`.claude/skills/gresca-architect/SKILL.md`) holds the method: briefing agents, feel spikes,
reviewing PRs, merge order, the daily owner loop, and keeping this file current. Only the coordinator edits this
file, in one docs PR per merge batch; stream PRs report in their body. Retrospectives: `docs/RETROSPECTIVES.md`.
