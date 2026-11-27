# ADR 0012: park features (jumps and rails) on the course, resolved to world points

Date: 27 Nov 2026. Status: proposed (K0).

## Context
A kicker today is a launch zone (`Course.kickerAt`) with a speed gain, and a rail is a straight line at one height
above the snow (`Course.rails`, `{s0, s1, d, h, t}`). K (`docs/ROADMAP.md`, "a real snow park") replaces them with
features that are part of the snow (K1), flight over the real snow (K2) and grinds on polylines (K3). K1 to K3 run in
parallel, so the seam between them is settled first, with no behaviour change. Street riding (`docs/STREET.md`, N1)
brings rails that have no course at all, only world points: the sim and the view must not read `(s, d, h)`.

## Decision
**`Course.features`**, frozen, `{jumps: [ParkJump], rails: [ParkRail]}` (`core/contracts.js`). Units: metres, m/s,
radians; lengths are metres of s along the course.

| Jump field | Meaning |
|---|---|
| `s`, `d` | m: s of the lip, d of the jump's centre line |
| `size` | `'xs'`, `'s'`, `'m'`, `'l'`, `'xl'` (the roadmap's size table) |
| `designSpeed` | m/s at the lip; K1 sizes the landing so a rider at this speed lands in its middle |
| `takeoff` | `{length, height, angle, width}`: m of s from the start of the transition to the lip; m, the lip above the base snow; rad above the horizontal at the lip; m across |
| `table` | `{length, gap}`: m of s from the lip to the knuckle; `gap` true when there is no table (open air) |
| `landing` | `{height, angle, length}`: m, the knuckle above the base snow; rad below the horizontal; m of s from the knuckle to the foot |

| Rail field | Meaning |
|---|---|
| `points` | `[{s, d, h}]`, 2 to 64, in riding order: m along, m across, m of the top above the base snow. A kink is a change of slope between segments, a bend a change of direction in plan |
| `profile` | `'rail'` (a round tube) or `'box'` (a flat top) |
| `width` | m: a rail's diameter (0.03 to 0.15) or a box's top (0.2 to 0.8) |
| `legs` | true on legs, false on a snow-buried base |
| `entry` | `'ramp'` (ride on from an on-ramp) or `'side'` (ollie on from beside it) |

The ranges are `PARK_LIMITS`; `checkParkFeatures(features, resolved)` checks them and names the field.

**World points.** When the world is built, `resolveFeatures(features, course, heightAt)` (`world/park-features.js`)
gives every feature `world: [{x, y, z}]`: ENU metres (ADR 0005), z absolute (metres of altitude). A rail has one
point per entry of `points`, at `course.point(s, d)`, z the base snow there plus `h`. A jump has four, on its centre
line: the takeoff's start, the lip, the knuckle and the landing's foot, z the base snow plus 0, `takeoff.height`,
`landing.height` and 0. The base snow is `heightAt`, the terrain without its features layer (the loader passes the
base grid; the corridor's refinements are 0 today), so the world points and K1's stamped snow are measured from the
same surface and never count a jump twice. **`sim/grind.js` and the view read only the world points**; `(s, d, h)` is
the authoring format. A street feature arrives with world points and no course.

**Course file.** ADR 0010's `gresca-map-1` course gains `version` (absent means 1) and, from version 2, `features`
with the fields above and no `world` (it is resolved, never authored). Version 1 files load unchanged; `features` in a
file without `version: 2` is an error. Each feature must lie between start and finish and inside the narrowest piste
width over its s range. `compileCourse({…, features})` writes a version 2 file only when it is given features.

**Contract fields for K3 and K5.** `RiderState.grind` is `{r, t, seg, style, balance}`: seg the index of the rail
segment the rider is on, style one of `GRIND_STYLES` (`'5050'`, `'boardslide'`, `'lipslide'`), balance -1..1 (0
centred). `AnimInput.grindStyle` passes the style on (`'5050'` off a rail). `SimEvent` `grindStart` gains `style` and
`grindEnd` `style` and `kinks` (count), declared optional: absent means `'5050'` and 0.

**Jump gravity** is `JUMP_GRAVITY` in `core/config.js` (15 m/s², as before), so `world/` sizes landings with the
sim's own constant.

## What stays as it is until K1 to K3
- `Course.kickers`, `kickerAt` and the launch gain; `Course.rails` (`{s0, s1, d, h, t}` and their straight world
  geometry) and today's grind on them. The procedural maps (the test slope and the play mountain) keep their kickers
  and rails and have no features (`NO_FEATURES`): expressing them as features would change nothing the sim reads but
  would add a second copy, so K1 moves the play mountain's park and the test slope stays as it is.
- The sim fills the new fields with today's values: seg 0, style `'5050'`, balance 0.
- The grind events do not carry `style` and `kinks` yet: the golden trace hashes each event's JSON, so adding keys
  would re-record it. K3 emits them when it changes the grind and re-records the trace anyway.

## Consequences
- K1 writes `world/park/` (shapes from these fields), K2 reads `JUMP_GRAVITY` and the snow, K3 grinds on
  `features.rails[i].world`, K4 meshes the same points, K5 reads `grindStyle`, K6 names grinds from the events.
- A new feature type is a new list in `features` with its own checks (open/closed); a reader-breaking change is
  course version 3, or `gresca-map-2` for the whole format.
