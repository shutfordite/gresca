# Street: riding real city streets (expansion U)

Proposal, 27 Nov 2026, not yet scheduled (main at #93). Owner idea: street skiing in real cities (Helsinki: hand
rails, stairs, park jumps), and a map search that takes you to a place, such as a snowy city in Japan. This doc says
how it fits the current roadmap, which hidden assumptions it breaks, and how it splits into isolated streams. Package
IDs start with **U**. It follows `docs/ROADMAP.md`'s rules: settle the seams first, remove hidden assumptions before
building on them, measure before reshaping the renderer, and feel first.

## 1. When, relative to the current plan

The core promise comes first: El Tarter rides (Bake map, C4b), then K (the real park), G7 (the whole mountain in
tiles) and TD0 (the sun from time and place). Street starts after those, and reuses each of them:

| Planned work | What street takes from it |
|---|---|
| **K0–K3** park contract, shape library, flight and grinds | rails and boxes as 3D polylines with profiles, kinks and bends; grind styles and balance; **flight in world height** (K2), which is exactly what dropping off a ledge or a stair set needs |
| **K4** park features as GPU meshes | the tube, box and leg meshes for street rails, ledges and benches |
| **G5** features without the colour map, **G6** the rider in the WebGL scene | buildings and props as meshes, not paint; a rider that railings and walls can hide |
| **G7** the whole mountain in tiles (ADR 0015) | a city zone loads in the same tiles and levels of detail |
| **G8** bakes in a worker | building the solids for a zone at load without blocking the page |
| **TD0** `sunPosition(lat, lon, date)` | the real low winter sun over Helsinki or Sapporo, for free |
| **CV1–CV3** camera modes | camera occlusion (below) has to work in every mode |
| **Bake map** workflow (X2) | a city is baked by the same one-tap workflow on a GitHub runner |

**Three things worth doing now, at almost no cost**, so current work doesn't close doors:

| # | Now | Why |
|---|---|---|
| N1 | **K0: rails and boxes are resolved to world points.** K0's rails are `{points: [{s, d, h}]}` on the course, and that stays the authoring format. When the world is built, each feature also gets `world: [{x, y, z}]` (ENU metres, z absolute), and `sim/grind.js` and the view read only the world points. Applied to the K0 row in `docs/ROADMAP.md` with this doc. | Street rails have no course: they come with world points directly. If the grind and the meshes read `(s, d, h)`, street rewrites them. |
| N2 | **Bake map gets a `kind` input** (`mountain` now; `street` later), and the compiler's adapters stay pluggable (C3a already does this). | A city bake is then a new adapter, not a new workflow. |
| N3 | **Record in D0** (`docs/REAL-WORLD-DATA.md`) that "search anywhere" depends on runtime fetching. | D0 is still open; street is the strongest argument for a yes, so decide it with that in view. |

## 2. Assumptions street breaks

Like "+y is downhill" before C2, these go before any stream builds on them.

1. **The ground isn't one smooth surface.** R1's composed bicubic heightfield is right for snow, but stairs, kerbs,
   ledges, walls and buildings are vertical steps. Bicubic smoothing turns a 1 m ledge into a 4 m bump. Keep the
   heightfield for the ground and add a separate **Solids** layer: 2.5D prisms (footprint polygon, base z, top z,
   top slope, kind) that physics, the camera and the renderer query. Stairs are a sloped solid with a `steps` surface.
2. **There may be no course.** The sim, the HUD ("m to go"), the minimap, the autopilot and the rider's start all
   assume a `Course` with a finish (and C4b starts the rider on the course tangent). Street is free roam inside a
   **Zone**: bounds, spawn points, roll-ins, optional challenge lines. The course becomes optional.
3. **There may be no fall line.** City ground is mostly flat, and `FLAT_SLOPE` already means "no fall line". Speed
   has to come from roll-in ramps, a winch or tow (how real street skiing is filmed), or pushing.
4. **Surfaces vary.** Snow, packed snow, ice, bare concrete, metal. `terrain.surface()` gives `groomed` (0..1) and H1
   added `terrain.powder`; street needs a surface *kind* that grip, the snow contact (H2), spray and bails read.
5. **The camera can end up inside a wall.** On a mountain nothing occludes the chase camera; in a street, buildings
   do. Each camera mode (CV1) needs occlusion handling (pull in, or fade the occluder).
6. **Features don't come from the data.** OSM tags `highway=steps` with `step_count`, `incline` and
   `handrail` / `handrail:left|right|center`, but coverage is patchy. Most rails and ledges are *inferred*
   (steps of N+ steps get rail candidates; `barrier=wall` and building edges become ledge candidates) and then
   curated. That matches R2's split between baked data and authored design.

## 3. Data and files

Same split as R2 and ADRs 0006 and 0010, plus one baked file and a catalog:

| File | Made by | Holds |
|---|---|---|
| `maps/<id>.terrain.json` | baker (unchanged format, ADR 0006) | ground DEM, origin, frame, provenance |
| `maps/<id>.city.json` | baker, **new** | solids (buildings, walls, steps), feature candidates flagged `inferred` or `tagged`, props (benches, lamps, trees), surface areas (road, pavement, park), licences per source. Budget ≤ 2 MB per zone (about 1 km²). |
| `maps/<id>.spots.json` | authored, reviewed in PRs | zone bounds, spawns, roll-ins, accepted, edited or deleted feature candidates (in K0's feature format, with world points), challenges |
| `maps/index.json` | generated from `maps/` | catalog: id, name, country, lat/lon, kind (`mountain` or `street`), snow tag, thumbnail. This is what the map search reads. |

**Sources, in order:**
1. **OSM** (ODbL) through Overpass at bake time on the GitHub runner, never per player. This works for every city,
   so the pipeline doesn't depend on one city's data.
2. **Helsinki**: the city publishes LOD1 3D buildings for the whole city, a ground surface model, and a CityGML city
   information model, all CC BY 4.0. That gives real building heights instead of OSM's patchy `building:levels`.
3. **Japan**: Project PLATEAU CityGML 3D city models (Sapporo has a dataset), multi-licensed CC BY 4.0, ODC-BY or
   ODbL. Check which cities have the road, furniture and stairs detail before choosing the Japan zone.

The credits come from the map file (R2), so a third file type only adds rows.

## 4. Map search ("take me to a snowy city in Japan")

Two levels, and only the second depends on D0:

- **U-S1 Catalog search (works if D0 is no).** A world picker with text search over `maps/index.json`, filtered by
  kind and snow; mountains are in the same catalog. The globe or map background is a small shipped asset (for
  example public-domain Natural Earth coastlines), not live tiles, which would count as a runtime fetch too.
  Choosing a result loads the baked files, like a mountain.
- **U-S2 Any place (needs D0 yes and a service).** Geocoding can't call the public Nominatim server from the client:
  its policy forbids client-side autocomplete and caps traffic per application. It needs a hosted geocoder (Photon,
  or a paid one). After geocoding, either (a) the owner taps "bake this place", which dispatches Bake map with
  `kind=street` and opens a PR (minutes, curated), or (b) the portable compiler core bakes in the browser from a
  Gresca-hosted extract ("bake at start", already anticipated in REAL-WORLD-DATA 3b).
  **Recommendation:** ship U-S1 plus (a) first, and decide (b) with D0 once street zones have real file sizes and
  frame times.

"Snowy" is mostly a look, not data: an urban winter look (S6 designs it, S4 builds it) puts snow on roofs, banks
along roads and ploughed paths in any city. The catalog's snow tag is curated.

## 5. Streams

### U0, the seam packages (Shared, coordinator, one PR at a time, ADR 0016)
A short freeze like B2b, B2c and C2. Nothing else edits `src/core/` while it runs.
- **U0a `Zone` and an optional course:** `world.zone` (bounds, spawns, roll-ins); `world.course` may be null. The sim,
  HUD, minimap, autopilot and rider start ask the zone or the course, and never assume a course. A lint like the
  seam lint in `test/frame.test.js`: no `course.` access outside modules that check for it.
- **U0b `Solids` interface** in `src/world/solids.js`: `topAt(x, y, z) → {z, normal, kind} | null`,
  `hit(segment) → contact`, `near(x, y, r)` for culling. Pure, ENU metres, in G7's tiles. The procedural maps have no
  solids, so the sim and anim golden hashes are unchanged.
- **U0c surface kinds:** `terrain.surface(x, y)` returns a kind beside `groomed` and `powder`; tunables per kind in
  `sim/tuning.js`.
- **Proof:** golden hashes unchanged, and a new procedural **test block** (`?map=street-test`, a map of its own: the
  test slope stays exactly as it is) with stairs and a down rail, a ledge, a gap and a snow bank on flat ground,
  ridden by a test in CI, as `test:rotated` does for frames.

### After U0, in parallel (each stream keeps the folders it owns today)

| Stream | Owns (unchanged) | Street packages, in order |
|---|---|---|
| **S2** sim feel | `src/sim/` | **U-F feel spike** on the test block first, before any real data (the biggest risk is that it doesn't feel good) → solids contact: land on and drop off ledges, wall bails, stair chatter → street grinds on K3's polylines (stair down rails, ledges, rail to rail) → speed sources: roll-in, winch, push → bails on concrete and ice |
| **S3** rider animation | `art/gresca-rider-anim.js`, rider view files | push and skate stride, winch hold, ledge pop, drop-in, on top of K5's grind poses |
| **S6** design and visual | spec versions, `docs/art/` | the urban winter look in a spec version after v1.6: building massing and facade tones (generic, no signs or brands), snow on roofs and banks, street props, concrete, ice, with boards |
| **S4** look, camera, render | `src/view/` (not the rider), `vendor/` | solids as GPU meshes (instanced extruded footprints with levels of detail, in G7's tiles) → **camera occlusion** in every CV mode → the urban look from S6's spec → props from K4's meshes → bench check with a 1 km² zone on the iPad |
| **S5** maps | `src/world/`, `tools/`, `maps/` | **U-D1** OSM urban adapter and feature inference (`tools/` only; can start as soon as U0b fixes the schema) → **U-D2** `city.json` and `spots.json` with validators (an ADR for the format) → **U-D3** zone loader with tiled solids → **U-D4** Helsinki LOD1 and PLATEAU adapters → the `maps/index.json` generator |
| **S1** controls and UI | `src/input/`, `src/ui/`, `styles/` | **U-S1** world picker and catalog search → free-roam HUD (spots, challenge prompts, no "m to go") → winch and push input → U-S2 if D0 allows |

The streams meet only through contracts: S2 and S5 through `Solids`, `Zone` and K0's features; S2 and S3 through
`RiderState`, `AnimInput` and new `SimEvent`s (`ledgeDrop`, `winchStart` and `winchEnd`, `push`), each a contract PR
merged first; S4 reads `Solids` read-only. **No new stream is needed:** street maps onto S1–S6 and one Shared seam
package.

### Order and the first milestones

```
K0 (with N1) → K1–K3 ┐
C4b → G7 → G8 ───────┼─> U0a → U0b → U0c ─┬─> U-F spike (S2) ─> S2 street packages
TD0 ─────────────────┘                     ├─> U-D1 → U-D2 → U-D3 (S5)
                                           ├─> S6 urban look ─> S4 solids, occlusion, look
                                           └─> U-S1 world picker (S1)
                                                     all ─> U-α: one Helsinki block rides on the iPad
```

**U-α acceptance:** one baked Helsinki zone (about 500 × 500 m, chosen by the owner) loads from the catalog search,
holds the frame budget on the iPad, and has at least one stair rail you can grind and one ledge you can drop.
**U-β:** a Japanese city (Sapporo, if PLATEAU's detail is good enough there) through the same pipeline with only a
new adapter config and no game code changes. That proves the pipeline is general.

## 6. Risks
- **Feel:** the test-block spike comes before the data work, and U-F needs the owner's verdict.
- **Sparse features:** inference plus curation, with feature candidates shown in `lab.html` for review.
- **iPad cost of buildings:** instanced boxes, zone size capped by the bench gate, far buildings as a baked skyline
  (like the mountain backdrop).
- **Real places:** generic facades, with no shop signs or brand names; credits per source come from the file.
- **Scope creep:** street reuses the rigs, the snow contact, scoring, flips, K's grinds and the Look. It doesn't get
  its own physics model.

## 7. Owner decisions
1. **D0**, now with street in view: catalog only, or "any place" with a hosted geocoder and baking?
2. **First Helsinki zone**, and whether a Japan zone comes in the same milestone.
3. **Speed on flat ground:** roll-ins only, a winch, pushing, or all three?
4. **When:** after K, C4b, G7 and TD0 as above, or earlier at the cost of something on the list?

## Sources
- OSM steps tagging: https://wiki.openstreetmap.org/wiki/Tag:highway%3Dsteps, https://wiki.openstreetmap.org/wiki/Key:step_count
- Helsinki 3D models (CC BY 4.0): https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d, https://hri.fi/data/en/dataset/helsingin-3d-rakennukset
- PLATEAU licence and the Sapporo dataset: https://wiki.openstreetmap.org/wiki/MLIT_PLATEAU, https://www.geospatial.jp/ckan/dataset/plateau-01100-sapporo-shi-2020
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
