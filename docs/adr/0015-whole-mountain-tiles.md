# ADR 0015: the whole mountain as height tiles at a few levels of detail

Date: 27 Nov 2026. Status: proposed (G7a).

## Context
A real map is cut to a 1000 × 2450 m window (`view/paint-window.js`), because the GPU terrain holds every texture at
1 m over the whole window with a CPU copy of each (ADR 0008: about 40 MB on the GPU and as much again on the CPU, a
64 MiB cap, grids over about 2000 × 2000 m fall back to the CPU). El Tarter is 7 × 7 km (701 × 701 samples at 10 m):
at 1 m that is 49 M texels, 196 MB of heights alone. The clipmap mesh (`gl/terrain-mesh.js`, `CLIPMAP`) already
draws only four nested rings, 1 to 8 m, around the camera; only the textures under it are map-sized. G7 (ROADMAP)
splits into G7a (this ADR and the pure `world/` half) and G7b (S4: the clipmap sampling, `paint-window.js` removed).

## Decision
- **Levels.** Five levels of detail, level L spaced 2^L m: **1, 2, 4, 8, 16 m**. Levels 0 to 3 are the clipmap's
  rings (±64, 128, 256, 512 m); level 4 (±1024 m) carries the view past 512 m out to `FAR_M` (600 m) and is the
  coarsest anything draws. Texels sit on whole multiples of the level's spacing on the map's grid (u, v from the
  `MapFrame` origin), where the clipmap's vertices already sit, so a vertex reads its texel exactly.
- **Tiles.** A tile is **64 × 64 texels** of one level (64, 128, 256, 512, 1024 m a side), on one lattice per level
  from the grid origin. Tile (L, ti, tj) texel (a, b) is grid (u, v) = ((64 ti + a) 2^L, (64 tj + b) 2^L).
- **Resident set: a ring of 4 × 4 tiles per level**, centred on the camera (`round(u / tileM) − 2` up to `+ 2`), so
  the camera is always at least 1.5 tiles (96 texels) from the ring's edge: the level's 64 texels each way, one more
  for the slopes, the 8 m snap of the clipmap's centre (4 texels at level 0) and slack before the ring moves. Tiles
  off the map are not built (they are clipped to the grid's extent); the horizon shows past the map's edge. When the
  camera crosses a tile edge, one row or column of four tiles per level is rebuilt; the finest level moves most
  often (every 64 m), level 4 every 1 km. This is the corridor's rule (ADR 0011) applied to the view: the finest
  detail only near the rider and camera.
- **Built from the loaded terrain, at run time; no new file format.** A tile's texels are `terrain.height(x, y)` of the
  world the loader built from the `gresca-map-1` file (ADR 0006: bicubic base plus the corridor detail), at the
  texel's world point. That is the surface the rider rides, so what is drawn is what is ridden at every level
  (point-sampled; the clipmap's morph hides the level seams as today). A pre-baked pyramid would only save the
  `height()` calls (about 330,000 for the whole resident set: 50 ms in Node 22 for El Tarter's 80 tiles) at the cost of 4 to 50 MB more file and a
  second source of truth that a corridor refinement would contradict, so it is not worth a `gresca-map-2`.
- **GPU sampling (G7b).** One R32F **2D texture array of 256 × 256 × 5** (a 4 × 4-tile ring per layer), addressed
  toroidally: texel (a, b) of level L lives at (a mod 256, b mod 256) of layer L, so moving the ring re-uploads only the
  new tiles (`texSubImage3D` of 64 × 64) and nothing shifts. The vertex shader reads heights with `texelFetch` (no
  float filtering, as ADR 0008); **slopes come from the heights in the shader** (central differences of the four
  neighbour texels at the level's spacing), so the RG16F slope texture and its bake go. The other per-texel data
  (relief, groomed, sun visibility, the piste's across coordinate) follows the same tile and ring layout in G7b or
  G5, sized as below.
- **No CPU copies.** A tile is built into one reused 64 × 64 Float32 scratch, uploaded and forgotten: three.js gets
  no kept `DataTexture` image for the tiles. On a **lost context** (ADR 0008, E1b) the restored context re-bakes the
  resident rings from the terrain (the same pure function), instead of re-uploading copies.
- **The pure half** is `src/world/height-tiles.js`: the levels, `createHeightTiles({terrain, frame})` with
  `tileHeights(level, ti, tj, out)` (fills a scratch) and `ringTiles(level, x, y, out)` (the rectangle of tile indices
  the ring around world (x, y) needs, clipped to the map), and `tileBytes()` (the budget below, computed).

## Memory budget: El Tarter, 7 × 7 km, on the iPad
| | Today (1000 × 2450 m window) | With tiles (whole map) |
|---|---|---|
| GPU heights | 9.3 MiB (R32F, 1 m) | **1.25 MiB** (5 × 256² × 4 B) |
| GPU slopes | 9.3 MiB (RG16F) | 0 (in the shader) |
| GPU aux, piste, paint | 19 MiB | ≤ 2.5 MiB (aux and piste in the same rings; paint goes in G5) |
| GPU detail, trees, tracks, park | about 1.5 MiB | about 2 MiB (23,000 trees) |
| **GPU total** | about 38 MiB | **under 6 MiB; budget 16 MiB** (the 64 MiB cap of ADR 0008 stays) |
| CPU, terrain (heights 2 MB, corridor ≤ 2 MB, trees 1 MB) | about 6 MB | about 6 MB |
| CPU, GL copies and the paint window | about 50 MB | **16 KiB** (one tile scratch) |
| **CPU total held** | about 56 MB | **under 8 MB; budget 10 MB** |

The tile memory does not grow with the map: a 20 × 20 km map costs the same GPU bytes as El Tarter (only the
terrain file's own heights grow, 4 B a sample, capped by ADR 0006's 2048 × 2048). `test/height-tiles.test.js` checks
the computed figure for a synthetic 7 × 7 km map against the heights' 2 MiB share of this budget.

## Assumption on G4 (owner decision pending)
G4 is assumed to make the CPU raycaster a **frozen fallback**: it keeps today's 1000 × 2450 m window and colour map,
built only when it draws (no WebGL2, `?renderer=cpu`, or a lost context), and gets no whole mountain. G7b moves the
window's code under the CPU path; the GPU path never builds it. If the owner chooses otherwise:
- **No CPU renderer at all:** the window and colour map go entirely; a lost context shows the last frame until the
  context returns; the Node suite keeps riding the sim and the view's pure parts, and loses the CPU picture checks.
- **A CPU renderer kept equal:** it would need the colour map tiled the same way (1 m colour over 7 × 7 km is 196 MB),
  which is a new ADR and its own package, not G7.

## Consequences
- G7b: the texture array, ring updates on tile crossings, slopes in the shader, `paint-window.js` removed from the
  GPU path, `gl-budget.js` computing from the rings, and a real-map `gl-smoke` scene (ROADMAP G7, "done when").
- A ring move costs up to 4 tiles per level (16,384 `height()` calls, about 2.5 ms in Node, at level 0); spread
  over frames if the iPad shows a hitch, or in G8's worker. A lost context's re-bake is the 50 ms above.
- Until G7b samples it, `height-tiles.js` is a pending root in `test/page.test.js` (not reached from `main.js`).
- The CPU fallback still draws only the window; riding off it in CPU mode shows the horizon, as now.
