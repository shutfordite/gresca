# Real-world data: findings and architecture decisions

How Gresca turns open elevation and piste data into a rideable mountain, what that data can and cannot give us, and
what it changes in `docs/ARCHITECTURE.md` (phases B3 and C). Researched 20 Nov 2026. Licences and coverage change,
so re-check the "verify" items before shipping a map.

## 1. What the data really is

### Elevation
| Source | Resolution | Type | Licence | Notes for Gresca |
|---|---|---|---|---|
| AWS Terrain Tiles (Tilezen/Mapzen), what the current baker uses | Terrarium PNG to z15/16; **source data ~25–30 m** in our area (SRTM, EU-DEM insert) | mostly bare earth | open, attribution required (Tilezen attribution list) | Our z13 bake (~14 m/px) is **oversampled**: there is no real detail below ~25 m. Unmaintained since Mapzen closed. |
| Copernicus DEM GLO-30 | 30 m, global | **Surface model (DSM)**: includes trees and buildings | free licence; notice "produced using Copernicus WorldDEM-30 © DLR e.V. …" when modified | Forest canopy shows up as bumps of roughly tree height. The CDSE *view service* is restricted from 28 Jul 2026; downloads via AWS open data are unaffected (verify). |
| Mapterhorn | Terrarium, z18, 512 px tiles, PMTiles | Copernicus GLO-30 base + national LiDAR where available (France 0.5–2 m, Spain 2–5 m, El Tarter ~30 m per the research) | attribution at mapterhorn.com/attribution (**verify licence and Andorra/Pyrenees coverage**) | Same encoding as our baker, actively maintained, small-area extracts with the `pmtiles` CLI. Best drop-in replacement for AWS tiles. |
| France: IGN RGE ALTI | 1 m | terrain model | Etalab 2.0 (open, attribution) | In the Pyrenees and Alps parts are radar-derived with **~7 m vertical accuracy on steep slopes**, so 1 m pixels ≠ 1 m truth there. Good for French resorts (e.g. Pas de la Casa's French side, Alps). |
| Spain: IGN MDT05 / Catalonia: ICGC 1 m | 5 m / 1 m | terrain model (LiDAR) | Spain IGN: CC BY 4.0 (verify); ICGC: open (verify) | IGN notes its **Andorra map sheets are photogrammetric, not LiDAR**. ICGC covers Catalonia only, not Andorra. |
| Andorra (El Tarter, our first map) | IEA *Model Digital d'Elevacions*, 5 m | terrain model, from 1995 mapping | **check licence** | Corrected after the BeamNG.Earth research: Andorra does publish a 5 m DEM (Institut d'Estudis Andorrans). Mapterhorn appears to have only ~30 m over El Tarter. So: ~30 m by default, 5 m from IEA if its licence allows. |

### Pistes and lifts
- **OpenStreetMap** (current baker, via Overpass): `piste:type=downhill`, `piste:difficulty`, `piste:grooming`, `aerialway=*`. ODbL.
  Pistes are usually **centrelines without width**, sometimes **area polygons** (`area=yes`), and one named run is often
  **split across many ways** that must be joined; ways cross lifts and each other.
- **OpenSkiMap** (built on OSM, ODbL) publishes processed GeoJSON per run and lift, already sanitised, normalised and
  joined into a graph, grouped by ski area. Using its download avoids re-implementing that clean-up and avoids
  depending on public Overpass mirrors at bake time. Download sparingly (it's a volunteer service).

## 2. What this means for the game

1. **The DEM is the mountain's shape, not its surface.** At 25–30 m, a DEM gives the big shapes (pitch, rolls, the
   valley) but none of what a rider feels: piste grooming, side-hill flattening, lips, moguls, the snowpack smoothing
   summer ground. A DSM adds false bumps under forest. So the ridden surface has to be **built on top of** the data,
   not read straight from it.
2. **Piste geometry needs a clean-up step**: join ways into one run, pick a width (from polygons where they exist,
   else a default by difficulty), smooth the centreline so turns are rideable, and cut the run where it crosses lifts
   or other pistes.
3. **Real runs are long.** El Tarter's runs are several km; at 15–20 m/s that is minutes per run. Plan for checkpoints
   or run segments (a product decision, not blocked by architecture, but `Course` should support a start and end `s`).
4. **Licences travel with the map file.** A map JSON containing OSM-derived pistes is a derivative database under
   ODbL: it must keep the attribution and stay ODbL, even though the game code is separately licensed. Elevation
   sources each need their notice. The credits screen must be generated from the map file.
5. **Nothing third-party at runtime, by default.** Fetching tiles or Overpass from the game adds CORS and
   availability failures and makes licences harder, so all fetching happens at bake time unless D0 says otherwise.

## 3. Architecture decisions (changes to the plan)

### R1. Terrain is a stack of layers, sampled through one interface *(changes B3, C4)*
`Terrain.height(x, y)` = **base** + **sculpt** + **features** + **detail**, each a pure function of world ENU metres:

| Layer | Source | What it does |
|---|---|---|
| base | baked DEM (coarse, whole map) | bicubic, never bilinear (bilinear gives slope kinks every cell that physics feels) |
| sculpt | course (`s`, `d`) | grooming: blend the cross-section towards flat inside the piste and ease it at the edges; low-pass the long profile along `s`; clamp crests/compressions to a max curvature; fill DSM tree bumps inside the corridor |
| features | course park layout | kickers, rails, boxes stamped in (`s`, `d`), as today's `bump()` but along the course |
| detail | seeded noise | small amplitude micro-relief off-piste and in powder, so 25 m data doesn't read as plastic |

Physics, camera, renderer, trees and the rider's feet all sample **the same composed function**. The corridor near the
rider is cached in tiles (C4); the far field and backdrop read the base layer only. B3 should define the interface
with layers from the start, even if the procedural map has only one layer.

### R2. Separate *baked* map data from *authored* course data *(changes C3)*
- `maps/<id>.terrain.json`: generated by the baker, never hand-edited: DEM, origin, `cellM`, raw piste and lift
  geometry (ENU), tree areas, horizon profile, sun, provenance, attribution, licence.
- `maps/<id>.course.json`: authored, small, reviewed in PRs: which OSM run(s) form the course, width overrides,
  sculpt strength, park features in (`s`, `d`), checkpoints, start and finish.
- Re-baking terrain (new source, better data) never loses level design. The validator checks a course against its
  terrain (features inside the corridor, start above finish, slope limits).

### R3. The baker is an offline, deterministic "map compiler" with pluggable sources *(changes C3)*
- Node 22 script, run by the owner (the agents' sandbox can't reach tile or OSM hosts). Raw downloads cached in
  `.map-cache/` (git-ignored) so re-runs are offline and reproducible; the output records source URLs, dates and hashes.
- **DEM adapters**: Terrarium tiles (AWS or Mapterhorn) and local GeoTIFF/ASC (for IGN/ICGC national data). Start
  with Mapterhorn-or-AWS Terrarium, since it's the existing decoder.
- **Piste adapters**: OpenSkiMap GeoJSON first, Overpass as a fallback.
- Converts everything to a **local ENU frame** around the map origin at bake time (WGS84 → local tangent plane), so
  the game never sees Mercator pixels or lat/lon.
- Computes what the art spec needs: `meanSlopeDeg` of the chosen run, horizon profile, sun, tree set and treeline.
- Store heights compactly: one block of Uint16 decimetres above a base height, base64 (C3a, ADR 0006; int16 absolute
  decimetres overflow above 3276 m). Budget: one map file under ~2 MB (a 4 × 4 km map at 10 m is 430 KB), so no tiles.

### R4. Course geometry pipeline *(adds to C1)*
`Course.fromRun(ways)`: join the ways into one chain in downhill order → resample at 1–2 m → smooth (e.g. a
curvature-limited spline, with a test that minimum turn radius ≥ a threshold at expected speed) → width from the
polygon or the difficulty default → arc-length `s`. The procedural map's `cx(y)` becomes just another source of a
polyline.

### R5. Steepness and data defects are gameplay rules, not crashes *(adds to C4)*
- Slopes over a limit (say 45°, tunable) off-piste are "no-go": rocks (as the spec already draws over 38°) and a
  wipeout or slide-out rule.
- Voids, spikes and seams in the DEM are fixed at bake time (fill, median filter, tile edge stitching), with a
  validator check: no gradient jump above a threshold anywhere in the corridor.

### R6. Trees and ground from data *(adds to C3, D3)*
Bake a tree-density grid from **Meta/WRI canopy height** (~1.2 m, CC BY 4.0) or **ESA WorldCover** (10 m, CC BY 4.0), with
OSM woods as the simple first step. This also tells the sculpt layer where a DSM has false canopy bumps to remove.

## 3b. Reconciled with "Gresca research: BeamNG Earth and real-mountain terrain" (19 Nov)

The two pieces of research agree on the core: do the geodata work outside the game, give the game a local metric
(ENU) grid, flatten a corridor under the route, credit every source, never query public Overpass per player (its usage
policy counts all of an app's users together), and use OpenSkiMap's processed runs. Where they differ:

| Topic | BeamNG research | This doc | Resolution |
|---|---|---|---|
| Physics vs render surface | separate: smoothed physics field, renderer adds detail on top | one composed function for both | **Same function near the rider** (so the board sits on the snow you see); the renderer may use coarser levels of detail far away and render-only *shading* detail (normals), but never a different *height* within ~200 m. |
| Where the baker runs | a general browser page on the user's computer | a Node CLI | **Write the map compiler as a pure JS core** (no DOM, no Node APIs: fetch, decode, project, sculpt, write), with thin wrappers: a Node CLI for repeatable bakes and tests, the browser page, and later, if allowed, the game itself ("bake at start"). |
| Bring your own mountain | file picker / drag-and-drop in the game | not planned | **Add to C4**: load a baked file through the same loader and validator; built-in maps stay. |
| Horizon | coarse ring (~zoom 10, ~110 m) drawn render-only behind the fog | baked horizon profile | Both: bake a coarse ring, derive the spec's horizon profile from it (D3). |
| Renderer | the CPU raycast can't show km of real ground on a phone; live Gresca needs WebGL2 | keep the raycast, measure in D1 | **D1's frame-time harness decides.** If real-map frames miss budget, a WebGL2 terrain renderer becomes a phase E, behind the same view interface. |
| Runtime fetching | "live Gresca" option (Pages-hosted, bundler, PMTiles streaming) needs an owner decision | off by default | **Owner decision D0, below.** The architecture keeps it possible: the portable compiler core plus the loader is exactly the "bake at start" shortcut. |

### D0. The one strategic decision
The one-file rule is gone (ADR 0001); what is still open is runtime fetching. Keep "nothing third-party fetched at
runtime" (resorts are baked and shipped in `maps/`, or loaded from a file), **or** let the hosted build on GitHub Pages fetch elevation (Mapterhorn) and a Gresca-hosted weekly piste extract at start.
Nothing in phases B and C depends on the answer; it matters from C4 on. Recommendation: keep the rule until El Tarter
rides well from a baked file, then decide with real frame-time and file-size numbers.

## 4. Open questions for the owner
0. D0 above: keep the no-runtime-fetch rule, or allow a hosted live build?
1. Which run is the first real course (OSM id or name in El Tarter)? *Answered 25 Nov: the snow park if mapped, otherwise Àliga.*
2. Are checkpoints or run segments acceptable, or must a course be one continuous run?
3. Is Mapterhorn acceptable as the default DEM source once its licence is verified?
4. Licence of the IEA 5 m Andorran DEM, and whether canopy/WorldCover files can be read by the baker.
5. Licence for the game code itself (the repo is MIT; map files will be ODbL) — confirm that split.

## Sources
- Gresca research: BeamNG Earth and real-mountain terrain (claude.ai doc, 19 Nov): https://claude.ai/artifact/AtvUhbjdn4c6QjNtjLWFpm
- IEA Model Digital d'Elevacions: https://www.iea.ad/model-digital-d-elevacions
- Overpass usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API
- AWS Terrain Tiles: https://registry.opendata.aws/terrain-tiles/ and attribution https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- Copernicus DEM: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- Mapterhorn: https://mapterhorn.com and https://terrain-viewer.iconem.com/docs/features/terrain-sources/
- IGN RGE ALTI: https://geoservices.ign.fr/rgealti and https://developers.google.com/earth-engine/datasets/catalog/IGN_RGE_ALTI_1M_2_0
- IGN Spain MDT: https://datos.gob.es/en/catalogo/e00125901-spaignmdt
- ICGC elevation models: https://www.icgc.cat/en/Geoinformation-and-Maps/Data-and-products/Elevations/Territorial-elevations/Elevation-models
- OpenSkiMap: https://wiki.openstreetmap.org/wiki/OpenSkiMap and https://github.com/russellporter/openskidata-processor
