// @areas world
// The whole-mountain height tiles (G7a, world/height-tiles.js, ADR 0015): tiles at five levels hold the terrain's
// heights, the levels nest, the ring around the camera covers what the clipmap draws, and the memory stays in budget.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/world/terrain.js';
import { createMapFrame } from '../src/world/map-frame.js';
import {
 createHeightTiles, TILE_TEXELS, TILE_LEVELS, TILE_BYTES, RING_TILES, levelSpacingM, tileSizeM,
} from '../src/world/height-tiles.js';
import { CLIPMAP, levelSpacing } from '../src/view/gl/terrain-mesh.js';
import { FAR_M } from '../src/view/gl/gl-projection.js';
import { MAP_ROTATION_DEG } from './harness.js';

const MIB = 1048576; // bytes
// m: a texel is a Float32, so it rounds the height by half a unit in the last place: 1.2e-4 m below 4096 m.
const FLOAT32_TOL_M = 2.5e-4;
const ADR_GPU_HEIGHTS_BUDGET = 2 * MIB; // bytes, ADR 0015: the heights' share of the 16 MiB GPU budget
const ADR_CPU_SCRATCH = 16 * 1024;      // bytes, ADR 0015: one tile of scratch, no CPU copies

// A synthetic mountain of side widthM at cellM (m), its grid's corner at the NW of a box centred on the origin, placed
// with the rotated runs' angle: a slope with ridges, so every level sees different heights.
function mountain(widthM, cellM) {
 const n = Math.round(widthM / cellM) + 1;
 const data = new Float32Array(n * n);
 for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
   const u = i * cellM;
   const v = j * cellM;
   data[j * n + i] = 2700 - 0.15 * v + 40 * Math.sin(u / 310) * Math.cos(v / 170) + 6 * Math.sin(u / 23 + v / 37);
  }
 }
 const rotation = MAP_ROTATION_DEG * Math.PI / 180;
 const frame = createMapFrame({ originX: -widthM / 2, originY: widthM / 2, rotation });
 const terrain = Terrain.create({ base: Terrain.grid(data, n, n, cellM, frame) });
 return { terrain, frame, tiles: createHeightTiles({ terrain, frame }) };
}

const EL_TARTER = mountain(7000, 10); // 701 x 701 samples, as maps/el-tarter.terrain.json
const at = { x: 0, y: 0 };

// The largest |tile texel - terrain.height| over one tile (m).
function tileError({ terrain, frame, tiles }, level, ti, tj) {
 const out = tiles.tileHeights(level, ti, tj, new Float32Array(TILE_TEXELS * TILE_TEXELS));
 const step = levelSpacingM(level);
 let worst = 0;
 for (let b = 0; b < TILE_TEXELS; b++) {
  for (let a = 0; a < TILE_TEXELS; a++) {
   frame.toWorld((ti * TILE_TEXELS + a) * step, (tj * TILE_TEXELS + b) * step, at);
   worst = Math.max(worst, Math.abs(out[b * TILE_TEXELS + a] - terrain.height(at.x, at.y)));
  }
 }
 return worst;
}

describe('height tiles', () => {
 it('hold the terrain\'s height at every texel, at every level, in the middle and at the map\'s far corner', () => {
  for (let level = 0; level < TILE_LEVELS; level++) {
   const { nu, nv } = EL_TARTER.tiles.tilesAcross(level);
   for (const [ti, tj] of [[Math.floor(nu / 2), Math.floor(nv / 3)], [nu - 1, nv - 1]]) {
    const err = tileError(EL_TARTER, level, ti, tj);
    assert.ok(err <= FLOAT32_TOL_M, 'level ' + level + ' tile (' + ti + ', ' + tj + '): off by ' + err + ' m');
   }
  }
 });

 it('nest: every other texel of a level is the finer level\'s texel at the same grid point', () => {
  const coarse = new Float32Array(TILE_TEXELS * TILE_TEXELS);
  const fine = new Float32Array(TILE_TEXELS * TILE_TEXELS);
  const half = TILE_TEXELS / 2;
  for (let level = 1; level < TILE_LEVELS; level++) {
   const ti = 2;
   const tj = 3;
   EL_TARTER.tiles.tileHeights(level, ti, tj, coarse);
   // The coarse tile's first half-row of texels lies in fine tile (2 ti, 2 tj), at even texels.
   EL_TARTER.tiles.tileHeights(level - 1, 2 * ti, 2 * tj, fine);
   for (let b = 0; b < half; b++) {
    for (let a = 0; a < half; a++) {
     assert.equal(coarse[b * TILE_TEXELS + a], fine[2 * b * TILE_TEXELS + 2 * a], 'level ' + level + ' texel ' + a +
      ', ' + b);
    }
   }
  }
 });

 it('refuse a level, a tile off the map or a scratch of the wrong size, naming it', () => {
  const out = new Float32Array(TILE_TEXELS * TILE_TEXELS);
  const { nu } = EL_TARTER.tiles.tilesAcross(0);
  assert.throws(() => EL_TARTER.tiles.tileHeights(TILE_LEVELS, 0, 0, out), /level 5/);
  assert.throws(() => EL_TARTER.tiles.tileHeights(0, nu, 0, out), /off the map/);
  assert.throws(() => EL_TARTER.tiles.tileHeights(0, -1, 0, out), /off the map/);
  assert.throws(() => EL_TARTER.tiles.tileHeights(0, 0, 0, new Float32Array(10)), /Float32Array of 4096/);
 });
});

// The ring of a level at world (x, y), in grid metres: [u0, u1] x [v0, v1], the first and last texel it holds.
function ringExtent(tiles, level, x, y) {
 const r = tiles.ringTiles(level, x, y, {});
 const size = tileSizeM(level);
 const last = size - levelSpacingM(level);
 return { count: r.count, u0: r.ti0 * size, u1: r.ti1 * size + last, v0: r.tj0 * size, v1: r.tj1 * size + last };
}

// True if the square of half side halfM around grid (u, v), clipped to the map, is inside the ring's texels.
function covers(ring, u, v, halfM, widthM) {
 const clip = (m) => Math.min(widthM, Math.max(0, m));
 return ring.u0 <= clip(u - halfM) && ring.u1 >= clip(u + halfM) && ring.v0 <= clip(v - halfM) &&
  ring.v1 >= clip(v + halfM);
}

describe('the ring around the camera', () => {
 const { tiles, frame, terrain } = EL_TARTER;
 const widthM = terrain.bounds.width;
 // Camera spots in grid m: the middle, a tile corner, just off a tile edge, the map's corners and edges.
 const SPOTS = [[3500, 3500], [3072, 2048], [3135.9, 1983.1], [5, 5], [6990, 6990], [10, 4000], [6000, 7005]];

 it('uses the clipmap\'s spacings and has a level for the view past the clipmap\'s rings', () => {
  for (let level = 0; level < CLIPMAP.levels; level++) assert.equal(levelSpacingM(level), levelSpacing(level));
  assert.ok(TILE_LEVELS > CLIPMAP.levels, TILE_LEVELS + ' levels for ' + CLIPMAP.levels + ' clipmap rings');
 });

 it('holds every texel each clipmap ring draws, its slope neighbours and the centre\'s snap', () => {
  for (const [u, v] of SPOTS) {
   const p = frame.toWorld(u, v, { x: 0, y: 0 });
   for (let level = 0; level < CLIPMAP.levels; level++) {
    const step = levelSpacing(level);
    const halfM = CLIPMAP.cells / 2 * step + step + CLIPMAP.snapM / 2; // the ring, a slope texel, half a snap
    const ring = ringExtent(tiles, level, p.x, p.y);
    assert.ok(ring.count <= RING_TILES * RING_TILES, 'level ' + level + ': ' + ring.count + ' tiles');
    assert.ok(covers(ring, u, v, halfM, widthM), 'level ' + level + ' at (' + u + ', ' + v + '): ' +
     JSON.stringify(ring) + ' misses ±' + halfM + ' m');
   }
  }
 });

 it('reaches the view\'s far end at the coarsest level, in every direction', () => {
  const top = TILE_LEVELS - 1;
  for (const [u, v] of SPOTS) {
   const p = frame.toWorld(u, v, { x: 0, y: 0 });
   const ring = ringExtent(tiles, top, p.x, p.y);
   assert.ok(covers(ring, u, v, FAR_M + levelSpacingM(top), widthM), 'at (' + u + ', ' + v + '): ' +
    JSON.stringify(ring) + ' misses the ' + FAR_M + ' m view');
  }
 });

 it('is a full 4 x 4 tiles away from the map\'s edges', () => {
  const p = frame.toWorld(3500, 3500, { x: 0, y: 0 });
  for (let level = 0; level < TILE_LEVELS; level++) {
   assert.equal(tiles.ringTiles(level, p.x, p.y, {}).count, RING_TILES * RING_TILES, 'level ' + level);
  }
 });
});

describe('the tiles\' memory (ADR 0015)', () => {
 it('fits the budget for El Tarter\'s 7 x 7 km: the GPU rings and one CPU tile, nothing per texel of the map', () => {
  const bytes = EL_TARTER.tiles.tileBytes();
  assert.equal(bytes.gpuBytes, TILE_LEVELS * (RING_TILES * TILE_TEXELS) ** 2 * 4, '5 layers of 256 x 256 R32F');
  assert.ok(bytes.gpuBytes <= ADR_GPU_HEIGHTS_BUDGET, (bytes.gpuBytes / MIB) + ' MiB on the GPU');
  assert.ok(bytes.cpuBytes <= ADR_CPU_SCRATCH && bytes.cpuBytes === TILE_BYTES, bytes.cpuBytes + ' B on the CPU');
 });

 it('does not grow with the map: 20 x 20 km costs what El Tarter costs', () => {
  const big = mountain(20000, 100); // coarse samples: only the extent matters here
  assert.deepEqual(big.tiles.tileBytes(), EL_TARTER.tiles.tileBytes());
 });
});
