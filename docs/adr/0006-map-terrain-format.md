# ADR 0006: the gresca-map-1 terrain file (`maps/<id>.terrain.json`)

Date: 21 Nov 2026. Status: proposed (C3a).

## Context
Real maps (Phase C) need a baked file the game can load with no third-party fetch at runtime (D0 is still open, so
the default holds). R2 splits what the compiler generates (`<id>.terrain.json`) from what people author
(`<id>.course.json`, C3b), so a re-bake never loses level design. The old baker (`tools/bake-el-tarter.html`,
`gresca-terrain-1`) wrote Web Mercator pixels at one zoom, absolute int16 decimetres (which overflow above 3276 m) and
one attribution string. ADR 0005 fixed the world frame (x east, y north, z up, metres) and the `MapFrame`.

## Decision
A terrain file is UTF-8 JSON, written by `tools/map-compiler/` and never edited by hand. Fields, in this order:

| Field | Meaning |
|---|---|
| `format` | `"gresca-map-1"` |
| `kind` | `"terrain"` (C3b adds `"course"` under the same format tag) |
| `id`, `name` | kebab-case id (the file is `<id>.terrain.json`), display name |
| `generator` | `"gresca-map-compiler/1"` |
| `licence` | the file's own licence: `"ODbL-1.0"` whenever it holds OSM-derived pistes or lifts (a derivative database) |
| `sources[]` | per source: `role` (`elevation`, `pistes`, `lifts`), `name`, `url` (or tile template), `licence`, `attribution` (the credit line to show), `retrieved` (date), `files`, `sha256` (of the raw download, or of the sorted tile hashes); the elevation source also has `fixes: {voids, spikes}` |
| `origin` | `{lat, lon}` (deg, WGS84): the ENU origin, world (0, 0) |
| `projection` | `"wgs84-tangent-plane"` (below) |
| `frame` | `{originX, originY, rotation: 0}`: a `MapFrame` (ADR 0005); `createMapFrame(file.frame)` places the grid |
| `grid` | `{nx, ny, cellM}`: samples across (west to east) and down (north to south), spacing in m |
| `bounds` | `{minX, minY, maxX, maxY}` (m, ENU): the grid's outer samples, derivable from `frame` and `grid` |
| `latLonBounds` | `{south, west, north, east}` (deg): the grid's edge, for credits and re-fetching |
| `heights` | `{encoding: "u16le-base64", baseM, scaleM: 0.1, minM, maxM, fnv1a32, data}` |
| `pistes[]` | `{id, part, osm: ["way/1", …], name, difficulty, grooming, area, points: [[x, y], …]}` |
| `lifts[]` | `{id, part, osm, name, kind, points}` |

- **Grid and frame.** Sample (i, j) is at world (originX + i·cellM, originY − j·cellM), row 0 north: exactly the
  mirrored grid of ADR 0005 at rotation 0, so `Terrain.grid(decodeHeights(file), nx, ny, cellM,
  createMapFrame(file.frame))` samples it with no conversion (a test checks this). The grid is centred on `origin`.
  Rotation is always 0: north is up; a course runs any way it likes in (s, d).
- **Projection.** Lat/lon goes onto the plane tangent to the WGS84 ellipsoid at `origin`: the east and north parts of
  the ENU vector (via Earth-centred coordinates at height 0). It is orthographic, so a distance d from the origin is
  shortened by about d³/(6R²): **0.5 mm at 5 km**, far below the DEM's error. Heights stay the DEM's heights: the
  plane is not bent down by the Earth's curvature (about 2 m at 5 km), because the game's world is flat with z up.
- **Heights.** Little-endian Uint16 samples, base64: height m = `baseM + sample · scaleM`, with `baseM` the whole
  metre at or below the lowest point and `scaleM` 0.1 m (half a decimetre of rounding, against metres of DEM error).
  The span is 6553.5 m, so the Alps fit (int16 absolute decimetres stop at 3276.7 m). `fnv1a32` (hex) of the bytes
  catches truncation and edits; it is not a security check. No void value: voids are filled and spikes replaced by the
  median of their neighbours at bake time (R5), and the counts are recorded in `sources[].fixes`. Base64 rather than
  a JSON array: 2.67 characters per sample instead of about 5, and one pass to decode; rather than an embedded PNG:
  no PNG decoder in the game and no colour-space surprises in Safari.
- **Pistes and lifts** are the source's raw polylines (OpenSkiMap runs and lifts, or OSM ways from Overpass) in ENU
  metres rounded to 0.1 m, clipped to `bounds` (a line that leaves and comes back becomes two `part`s), sorted by id.
  Polygon runs keep their outer ring with `area: true`. Joining, smoothing and widths are the course's job (C1, R4).
- **Deterministic.** The compiler has no clock, I/O or randomness; key order is fixed, numbers are rounded, the
  text is 1-space-indented JSON with points on one line. Re-running from the download cache (`.map-cache/`, with a
  manifest of URL, date and sha256) gives the same bytes.
- **Validation.** `validateTerrain()` (`tools/map-compiler/validate.js`, pure, no Node APIs) checks the schema, that
  sizes and bounds agree, the checksum, heights within −450..8900 m, points inside the bounds, attribution (an
  elevation source; ODbL and an OpenStreetMap credit when there are pistes or lifts), and limits sizes before
  decoding (24 M characters, 2048 × 2048 samples, 2 M points); it rejects prototype keys, non-plain objects and
  non-finite numbers. It warns about remaining spikes and pits, slopes over 60° and unknown fields, and reports
  slope statistics. The compiler refuses to write a file that fails it.

## Size and memory budget
For a 4 × 4 km map: at **10 m** (the default; the data is ~25–30 m, R1 upsamples near the piste in C4) 401 × 401 =
160,801 samples: **430 KB** on disk (base64), 643 KB as a Float32Array in memory. At 5 m: 801 × 801, **1.71 MB** on
disk, 2.6 MB in memory. El Tarter's 7 × 7 km box at 10 m is about 1.3 MB on disk and 2 MB in memory. All within R3's
2 MB file and C4's 60 MB budget, so the heights are one block, not tiles (tiling can be a new encoding later).

## Not in this file (deferred)
The course (C3b: chosen runs, widths, park, start and finish), `meanSlopeDeg` of the run (needs the course), the sun,
the horizon profile, tree areas (R6) and snow parks. They are new optional fields or the course file, added
additively; any change that breaks a reader is `gresca-map-2`.

## Consequences
- C4's loader: `validateTerrain(text)` then `decodeHeights(file)` and `createMapFrame(file.frame)`. To import the
  validator from `src/world/`, C4 either moves `format.js` and `validate.js` there or adds `tools/` to the preview's
  `SITE`.
- The credits screen is built from `sources[].attribution`, so attribution cannot get lost on a re-bake.
- `gresca-terrain-1` files from the old baker are not read by the game; the browser baker stays as a fallback.
