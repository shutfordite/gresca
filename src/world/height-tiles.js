// Whole-mountain height tiles (G7a, docs/adr/0015-whole-mountain-tiles.md): the terrain's heights at five levels of
// detail (1 to 16 m), in 64 x 64 texel tiles on the map's grid, and the ring of tiles each level needs around the
// camera. Pure: tiles are made from a loaded Terrain on demand into the caller's scratch, so nothing map-sized is kept
// (the GPU half, G7b, uploads each tile and forgets it). Units: metres; (u, v) are grid metres of the map's MapFrame.
// Memory: no arrays of its own; the GPU's rings are 1.25 MiB whatever the map's size (tileBytes).

/** Texels per side of a tile, at every level. */
export const TILE_TEXELS = 64;
/** Tiles per side of the ring a level keeps around the camera. */
export const RING_TILES = 4;
/** Levels of detail: level L is spaced 2^L m (1, 2, 4, 8, 16 m). */
export const TILE_LEVELS = 5;
/** Bytes of one tile's heights: R32F, one 32-bit float a texel. */
export const TILE_BYTES = TILE_TEXELS * TILE_TEXELS * 4;
const HALF_RING = RING_TILES / 2;

/** m, the spacing of level L's texels. */
export const levelSpacingM = (level) => 2 ** level;
/** m, the side of one tile of level L. */
export const tileSizeM = (level) => TILE_TEXELS * levelSpacingM(level);

/**
 * Height tiles of a loaded world's terrain ({terrain, frame}: a Terrain and the MapFrame placing its grid). Returns
 * {tilesAcross(level) -> {nu, nv}, tileHeights(level, ti, tj, out) (fills out, a Float32Array of TILE_TEXELS^2 m,
 * rows of v; texel (a, b) is grid (64 ti + a, 64 tj + b) times the level's spacing), ringTiles(level, x, y, out)
 * (the ring around world (x, y) m, clipped to the map: out.ti0..ti1, tj0..tj1 inclusive and out.count), tileBytes()
 * ({gpuBytes, cpuBytes}: the GPU's ring array and one CPU tile scratch)}.
 */
export function createHeightTiles({ terrain, frame }) {
 const widthM = terrain.bounds.width;   // m along grid u
 const lengthM = terrain.bounds.length; // m along grid v
 const at = { x: 0, y: 0 };
 const grid = { u: 0, v: 0 };

 function checkLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level >= TILE_LEVELS) {
   throw new Error('height-tiles: level ' + level + ' is not 0..' + (TILE_LEVELS - 1));
  }
 }

 function tilesAcross(level) {
  checkLevel(level);
  const size = tileSizeM(level);
  return { nu: Math.ceil(widthM / size), nv: Math.ceil(lengthM / size) };
 }

 function tileHeights(level, ti, tj, out) {
  const { nu, nv } = tilesAcross(level);
  if (!(ti >= 0 && ti < nu && tj >= 0 && tj < nv) || !Number.isInteger(ti) || !Number.isInteger(tj)) {
   throw new Error('height-tiles: tile (' + ti + ', ' + tj + ') is off the map at level ' + level);
  }
  if (!(out instanceof Float32Array) || out.length !== TILE_TEXELS * TILE_TEXELS) {
   throw new Error('height-tiles: out must be a Float32Array of ' + TILE_TEXELS * TILE_TEXELS + ' heights');
  }
  const step = levelSpacingM(level);
  const u0 = ti * TILE_TEXELS * step;
  const v0 = tj * TILE_TEXELS * step;
  for (let b = 0; b < TILE_TEXELS; b++) {
   for (let a = 0; a < TILE_TEXELS; a++) {
    frame.toWorld(u0 + a * step, v0 + b * step, at);
    out[b * TILE_TEXELS + a] = terrain.height(at.x, at.y);
   }
  }
  return out;
 }

 // The ring is the RING_TILES tiles whose block centre is the tile corner nearest the camera, so the camera stays at
 // least 1.5 tiles from the ring's edge (ADR 0015).
 function ringTiles(level, x, y, out) {
  const { nu, nv } = tilesAcross(level);
  const size = tileSizeM(level);
  frame.toGrid(x, y, grid);
  const cu = Math.round(grid.u / size);
  const cv = Math.round(grid.v / size);
  out.ti0 = Math.max(0, cu - HALF_RING);
  out.ti1 = Math.min(nu - 1, cu + HALF_RING - 1);
  out.tj0 = Math.max(0, cv - HALF_RING);
  out.tj1 = Math.min(nv - 1, cv + HALF_RING - 1);
  out.count = Math.max(0, out.ti1 - out.ti0 + 1) * Math.max(0, out.tj1 - out.tj0 + 1);
  return out;
 }

 // One texture array, a layer a level, as wide as the largest ring the map can hold (a map smaller than a ring
 // gets a smaller array); and one tile of scratch on the CPU.
 function tileBytes() {
  const { nu, nv } = tilesAcross(0);
  const side = Math.min(RING_TILES, Math.max(nu, nv)) * TILE_TEXELS;
  return { gpuBytes: TILE_LEVELS * side * side * 4, cpuBytes: TILE_BYTES };
 }

 return Object.freeze({ tilesAcross, tileHeights, ringTiles, tileBytes });
}
