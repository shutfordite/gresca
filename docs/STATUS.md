# Gresca status and handover

The one place to find where the work stands. Read this first in a new thread, then `docs/ROADMAP.md` for the
order and `AGENTS.md` for the rules. Repo docs are canonical; the claude.ai project docs only point here.
Updated 20 Nov 2026, main after PR #17.

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
| Docs: AGENTS standards, roadmap, CLAUDE.md, PR template | #15, #16 |

## Open PRs
- **#18 art spec v1.4** (twist, head yaw, body pitch, camera pitch, brake/switch/tuck poses). Additive: the game draws
  exactly as before until S3/S4 opt in. Board flips rotate about the board's long axis (owner: "most realistic").
- **#19** records the owner's decisions in `docs/ROADMAP.md`.

## Next, in order (the freeze: one code PR at a time)
1. **P1 docs:** code map in `AGENTS.md` ("to change X edit Y, tests Z"), folder ownership table (streams S1–S5 in
   the roadmap), per-folder `AGENTS.md` for `src/sim`, `src/view`, `art/`, move the Style section to `docs/STYLE.md`.
2. **B2b state contracts and events:** see the roadmap, phase 1 row 3. Pre-add the fields the streams need.
   Also: `Gresca.sim()` uses the loop's `simTick()`; record input per sim step; split the façade so each area
   registers its own fields; resolve the four `TODO(B2b)` markers in `src/`.
3. **B2c world seams:** the `Course` interface (procedural implementation first), the fall line, `sim/anim-input.js`,
   and a ban on "+y is downhill".
4. **C2 ENU frame**, proven by the whole suite passing on a rotated procedural map.
5. Then phase 2 (P4 Look interface, P5 scenes and screenshots with Playwright under ADR 0003, C3a map compiler)
   and the five streams. All are in `docs/ROADMAP.md`.

## Known issues (not yet fixed)
- **Camera flips at low speed** when the board is across the slope and slides tail-first: the camera follows the
  equipment heading (`back ? a+π : a`). This is fixed by F5 (the camera follows `travelHeading`, added in B2b).
- **A few very slow frames in Chrome** (the mean frame time is about 6× the median, on main too). Look at this first
  in D1.
- **The design canvas copy of the art spec** (claude.ai design "Gresca Rider Style Prototypes") is behind the repo
  after #18. Re-sync it from `art/gresca-hanga-spec.js`.
- **Pose tuning for S3:** the ski tuck reads as a blob from straight behind, the ski brake legs look short, and the
  board's toe-side brake looks like kneeling at yaw 90.

## Decisions on record
In `docs/ROADMAP.md` ("Decisions"), ADRs 0001–0002, and `docs/REAL-WORLD-DATA.md` (R1–R6). Still open:
**D0** (may the game fetch map data at runtime; matters from C4).

## How the work is run
The coordinator skill (`.claude/skills/gresca-architect/SKILL.md`) holds the method: briefing agents, reviewing PRs,
checking in a browser, and keeping this file current. Update this file in every PR that finishes or opens a package.
