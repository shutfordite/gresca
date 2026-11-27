# Hanga Dawn art spec v1.5.0: the environment

`art/gresca-hanga-spec.js` goes from v1.4.0 to v1.5.0. The change is **additive**: one new top-level `environment`
object, 20 new `palette` keys and new keys on `maps['el-tarter']`. Nothing existing changes value; `projectRider` is the v1.4 function.
`test/hanga-v15.test.js` checks this against `test/fixtures/hanga-spec-v1.4.0.cjs` (every key path and value, the
helper functions' source, and `projectRider` over 1,000+ calls). The game does not read `environment` yet: S4 builds
from it (see "What S4 builds"). Boards: `docs/art/v1.5/` (`trees`, `rocks`, `sky`, `palette` PNGs), drawn by
`docs/art/v1.5/board.html?board=<name>` from the spec's own data. The claude.ai design canvas copy is now v1.3.0 or
older; S6 V4 re-syncs it.

## What is new

| Key | Holds |
|---|---|
| `environment.trees.sets.pine` / `.sugi` | Per species: height range (m), crown width / height ratio, trunk clear height, a reference tree with its right-hand silhouette `profile` in tree-local metres, palette `roles`, `snowLoad` rule, `render` guidance (mesh within 120 m, billboard beyond, `minPxHeight`). Pine set: mountain pine (`uncinata`) plus a sparse `fir` below 1900 m (`mix.firShareByAltM`). `sugi` only describes the existing procedural look. |
| `environment.treeline` | Bands relative to a map's `treelineM` (forest, thinning, open, krummholz, then alpine), trees per hectare per band, aspect shift, exclusion (piste edge + 8 m, 10 m from lifts, nothing over 40 degrees), seeded clustering parameters. |
| `environment.bushes` | `krummholz`, `juniper`, `rhododendron`, `grassTuft`: sizes, altitudes, density, `snowDepthByAltM` (a bush shorter than the snow is buried). |
| `environment.rocks` | `boulder`, `outcrop`, `screeField`, `cliffBand`, and the `snowRule`: slope thresholds and rock share, wind scour, snow cap. |
| `environment.sky` | The dawn gradient as `{elevationDeg, role}` stops, how it follows `maps[id].sun`, sun disc (5 degrees) and glow, alpenglow, haze by distance. |
| `environment.backdrops.pyrenees` | Three layers (near 2-8 km, mid 8-18 km, far 18-60 km), snow cap rule, ridge rule, ten named peaks. |
| `palette` (new keys) | 20 new colour roles, hex, added to the existing palette; v1.4 roles are unchanged. |
| `environment.contrastTargets` | 25 contrast minimums for the new roles (tested). |
| `maps['el-tarter']` | `backdrop`, `treeline` (absolute bands), and data-derived `meanSlopeDegData`, `heightRangeM`, `courseAltitudeM`, `startWorld`, `fallLineCompassDeg`, `sunData`, `dataNote`. |

Conventions: metres, degrees (compass at the art boundary). Every colour is a role, named in a field `role`, `*Role`,
or inside an object `roles`; the test checks each exists. Roles `body` are the mean tone for meshes and hazed
impostors; `lit` and `shade` are the two billboard halves (flip when the sun is on the right).

## The rules in words

- **Trees.** Scale the reference tree uniformly by `height / reference.heightM`. Snow sits on each tier's upper side
  (tip to the next notch), covering `byAltM` of it, thinner on the sun side. Pine at 6-20 m, fir 12-30 m (lower forest
  only). Under `minPxHeight` (6) drop the tree; the forest-mass strip stands for it.
- **Treeline.** For El Tarter the last trees are at 2300 m (art-directed, kept). Forest below 1950, thinning to 2200,
  scattered last trees to 2300, krummholz to 2420, alpine above. North faces shift the line down 60 m, south faces up
  60 m. No tree within 8 m of the piste edge. Patches come from seeded value noise (scale 70 m) with clumps of 2-7.
- **Rock and snow.** Snow holds to 30 degrees; rock begins to show at 32 (5%), is 35% at 38 (the existing rule in
  `trees.placement.rocks`), 75% at 45 and bare at 55, where a cliff band begins. Ridge crests start 8 degrees lower.
  Rocks get a snow cap over faces within 55 degrees of up, thinner on the sun side.
- **Sky.** Stops at 90 (skyTop), 45 (skyMid), the dawn stop (skyDawn), 0 (skyHorizon), -4 (fog). The dawn stop is at
  26 degrees toward the sun, 14 at 90 degrees off it and 8 opposite. The sun disc is at the map's compass azimuth and
  elevation; glow radius 20 degrees. Caps of mid and far layers within 55 degrees of the sun tint toward alpenglow.
- **Backdrop.** Each layer is a profile with a keyline. Each named summit is a triangle, apex `elevDeg` times 2 above
  the horizon, falling to -1 degree at `atan(halfWidthM / distM)` either side. Snow covers a summit from its top down
  `cap.depthM` or to the 1900 m snowline.

## Pyrenees peaks (from the El Tarter course start)

World position of the start: x 35.8, y -2056.5 m from the terrain origin (42.5775 N, 1.655 E), ground 2463.4 m (the course's high point, startS 30).
ENU bearing is counter-clockwise from east (ADR 0005); compass is clockwise from north. `elevDeg` is the angle above
the horizontal from the start, flat earth. All ten clear the terrain-grid horizon from the start
(`horizonAtStartDeg` in the data). Bearings, distances and angles are recomputed from lat/lon in the test.

| Peak | Layer | Alt m | Lat, lon | Compass | ENU | Dist m | Elev deg | Source |
|---|---|---|---|---|---|---|---|---|
| Pic de Casamanya | near | 2740 |42.5841, 1.5655| 290.7 | 159.3 | 7894 | 2.01 | peakbook.org 54931 (UTM converted) |
| Pic de l'Estanyó | near | 2915 |42.6085, 1.5926| 316.9 | 133.1 | 7540 | 3.43 | peakbook.org 78414 (UTM converted) |
| Pic de la Serrera | mid | 2912 |42.626, 1.601| 329.0 | 121.0 | 8682 | 2.96 | GeoNames, highest mountains of Andorra |
| Coma Pedrosa | mid | 2943 |42.59056, 1.44478| 281.5 | 168.5 | 17647 | 1.56 | Wikipedia |
| Pica d'Estats | far | 3143 |42.66722, 1.39722| 299.7 | 150.3 | 24360 | 1.60 | Wikipedia |
| Alt del Griu | near | 2874 |42.526, 1.652| 184.4 | 265.6 | 3675 | 6.37 | GeoNames |
| Pic dels Pessons | near | 2864 |42.508, 1.665| 172.1 | 277.9 | 5718 | 4.01 | GeoNames |
| Pic Negre d'Envalira | near | 2823 |42.51722, 1.72139| 130.6 | 319.4 | 7133 | 2.89 | Wikipedia |
| Pic d'Envalira | near | 2659 |42.51879, 1.72485| 128.0 | 322.0 | 7243 | 1.55 | aroundus.com 4041992 |
| Pic del Maià | near | 2615 |42.55384, 1.71889| 96.2 | 353.8 | 5242 | 1.66 | altitude visitandorra.com; position komoot 3422136 |

GeoNames gives 3 decimals (about 100 m, under 1 degree of bearing here). Maià's position is a map-centre value and its
altitude differs by 5 m between sources. `halfWidthM` (massif width) is art-directed, not measured.

## Data from the baked files

`meanSlopeDegData` 15.06 is the course file's value, atan(drop / length) = atan((2463.4 - 1700.5) / 2834.7) from startS 30. The
terrain height range is 1570.3-2749.1 m. The course starts at 2463 m, above the treeline, and first passes the
krummholz limit at s 235 m, the last-tree line at 599, the thinning limit at 929 and the forest limit at 1989.
The files carry no land cover, so the treeline itself stays art-directed.

## What S4 needs to build (later packages)

1. Tree sets from the spec: draw `profile` as billboards and meshes, snow load, `minPxHeight` culling (with E3).
2. Treeline placement for real maps from `environment.treeline` and the clustering parameters (replacing the
   current `world/map-trees.js` fade; that is S5's file, so a joint package).
3. Bushes and rocks, and rock-through-snow on the terrain shader from `rocks.snowRule`.
4. Sky gradient, sun and glow from `environment.sky` (with E4 dawn haze), following `maps[id].sun`.
5. Backdrop ridge from `backdrops.pyrenees` and the baked `horizon`, three layers with haze and caps.
6. Add the new `palette` roles to the Look tokens.

## Open questions

- **Which sun.** `maps['el-tarter'].sun` is azimuth 110, which is 124 degrees off the fall line (346), outside the
  60-120 rule in `terrain.sun.rule`. The baked course file says 76, which is 90 degrees off. I did not change either (the owner is being asked);
  the boards follow the spec's 110.
- **Tree fatness.** `trees.pine` draws a crown about 0.7 times its height wide; real mountain pine is 0.35-0.5. The
  new data uses 0.5. Owner to judge on the boards.
- **Ridge height.** Real peaks are 1.5-6.5 degrees up, so the ridge is lifted 2x; S4 may tune it.
- **Treeline value.** 2300 m is a regional rule of thumb; real land cover (R6) would replace it.
- El Tarter sun: spec 110 (real winter dawn, ESE) vs baked 76 (fall line + 90); the 60-120 degree side-light rule.

After a rebake, `node docs/art/v1.5/derive.mjs` recomputes every value in this section and the peak geometry in place.
