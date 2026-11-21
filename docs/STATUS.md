# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 21 Nov 2026, main after PR #25.

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

## Open PRs
- **C2 one world frame (ENU)** (`refactor/c2-enu-frame`, the last freeze package): everything in east-north-up
  metres, headings counter-clockwise from east (ADR 0005); a `MapFrame` places the procedural grid (default: the
  piste runs south, bit for bit as before, golden hash unchanged); the run start, camera start, carve limit, ramp
  flags and `keepOnMap` come from the frame; `npm run test:rotated` (in CI) runs the whole suite at 37°;
  `test/map-view.js` lets tests stay on the map's grid.

## Next, in order
1. Phase 2 once C2 is merged (P4 Look interface, P5 scenes and screenshots with Playwright under ADR 0003, C3a map
   compiler) and the five streams. All are in `docs/ROADMAP.md`.

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
