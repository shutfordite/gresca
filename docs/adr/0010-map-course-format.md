# ADR 0010: the gresca-map-1 course file (`maps/<id>.course.json`)

Date: 24 Nov 2026. Status: proposed (C3b).

## Context
R2 splits what the compiler generates (`<id>.terrain.json`, ADR 0006) from what people author (`<id>.course.json`), so
a re-bake never loses level design. ADR 0006 planned the course as `kind: "course"` under the same `gresca-map-1`
format tag; the work package called it `gresca-course-1`. This ADR follows the documented plan: one format tag, two
kinds. C4 loads the pair and builds the course with `Course.fromRun` (ADR 0004, R4). Nothing loads course files yet.

## Decision
A course file is UTF-8 JSON, small and reviewed in PRs. The compiler writes a first version; people then edit the
park, sun, widths and finish by hand. Fields, in this order:

| Field | Meaning |
|---|---|
| `format`, `kind` | `"gresca-map-1"`, `"course"` |
| `id`, `name`, `generator` | the terrain's id (the file is `<id>.course.json`), the course's display name, `"gresca-map-compiler/1"` |
| `licence` | `"ODbL-1.0"`: the run is OpenStreetMap data |
| `terrain` | `{id, heightsFnv1a32}`: the terrain this was authored on; a different checksum (a re-bake) is a warning |
| `sources[]` | `{role, name, url, licence, attribution, retrieved}` copied from the terrain's sources: provenance and the credit lines. A pistes source with an ODbL licence crediting OpenStreetMap is required |
| `run` | `{osm: ["way/1", …], name, difficulty}`: the run by OSM way ids (authoritative when listed) or by `name` (all pistes of that name) |
| `widths` | `[[s, widthM], …]`: stops in s order, the first at s 0, straight lines between, constant past the ends; 4 to 200 m |
| `startS`, `finishS` | m of s: start before finish, at least 50 m apart, finish within the run |
| `meanSlopeDeg` | deg, `atan(drop / (finishS - startS))` of the run, measured on the terrain; within 1 deg or it is rejected |
| `kickers[]` | `{s, d, halfWidth, depth, big, launchGain?}` in the Course contract's units (m; `launchGain` 0.5 to 3, dimensionless), in s order |
| `rails[]` | `{s0, s1, d, h, t}`: `t` is `"rail"` or `"box"`, `h` the top above the snow (m), in s0 order |
| `sun` | `{azimuthDeg, elevationDeg}` in **compass** degrees: the one place this file has them (the art spec's `maps[id].sun`) |
| `treeSet` | `"sugi"` or `"pine"` (the art spec's tree sets) |
| `horizon` | `{stepDeg, source, near: […], far: […]}`: degrees above the horizontal for each compass heading (`near[i]` is heading `i * stepDeg`), as the spec's `mountains.real` reads |

- **s and d** are the course's: `Course.fromRun(ways)` of the terrain's piste parts (joined downhill, resampled,
  curvature-limited), so the file holds no centreline, only which ways make it. The validator rebuilds the course
  with the same code (`tools/` imports the pure `src/world/` modules; they are not moved).
- **Park items** must lie between start and finish and inside the piste: `|d| + halfWidth` (kicker) or `|d|` (rail)
  within half the narrowest width over their s range.
- **Mean slope** is the overall drop over the distance along the run, not the mean of local slopes: stable against
  DEM noise, and what a player feels as "this is a 20 degree run".
- **Horizon.** The compiler measures it from the run's middle point, 2 m up, over the terrain grid (200 m out to the
  grid's edge), 1 degree steps. `far` repeats `near`: the far ring (8 to 40 km, zoom 10) needs a coarse DEM the
  terrain file does not hold. `source` says `terrain-grid` so a later bake can improve it without a format change.
- **Compiler and CLI.** `compileCourse({terrain, run, …})` (`core.js`, pure, deterministic) and `node
  tools/map-compiler/cli.mjs --course --terrain maps/<id>.terrain.json (--run way/1,way/2 | --run-name "<piste>" |
  --config maps/sources/<id>.json)`; the config's `course` block holds the authored input (park, sun, widths). It
  runs offline and refuses to replace an existing course file without `--overwrite`.
- **Validation.** `validateCourse(input, terrain?)` (`validate.js`, pure): schema, units and ranges, size limits,
  prototype keys and non-finite numbers, ODbL attribution; with a terrain also the run exists and joins, lies inside
  the bounds, is long enough, the park fits, and the slope matches. Messages are `<id>.course.json <field>: why`.

## Consequences
- C4 loads the terrain, then the course, runs both validators and builds `Course.fromRun(ways, {width, startS,
  finishS, kickers, rails})`, turning `widths` into a per-point array. The validator imports `src/world/`; if the
  game must import it, C4 moves `tools/map-compiler/{format,validate}.js` or adds `tools/` to the preview's `SITE`.
- Any change that breaks a reader is `gresca-map-2`; new optional fields are additive.
