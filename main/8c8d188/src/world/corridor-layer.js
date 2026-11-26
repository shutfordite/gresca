// The corridor detail layer (docs/REAL-WORLD-DATA.md R1, C4): 2 m tiles of the composed refinements (grooming,
// features, micro-relief), made on demand only where the piste corridor passes, kept in an LRU cache.
// Units: metres. The layer is a Terrain layer ({height, gradient, heightFast}) that ADDS to the coarse base, so it is
// 0 outside the corridor and the far field reads the base alone. Pure: no DOM, no timers; the cache is state owned by
// the object this makes (ADR 0002).
import { Terrain } from './terrain.js';

/** m, the side of a tile on the map's grid. */
export const TILE_M = 64;
/** m, the node spacing inside a tile: the corridor's detail resolution. */
export const DETAIL_CELL_M = 2;
const TILE_CELLS = TILE_M / DETAIL_CELL_M;
// Nodes per side: the tile's cells plus one node before and two after, which is what Catmull-Rom needs to be exact
// (and continuous with the next tile, whose nodes are the same lattice points) right up to the tile's edge.
const NODES = TILE_CELLS + 3;
/** bytes, one cached tile: NODES * NODES Float32 samples. */
export const TILE_BYTES = NODES * NODES * 4;
/** The most tiles kept: 400 * 4.9 KB = 2 MB, enough for the camera's whole view of the corridor around the rider. */
export const DEFAULT_MAX_TILES = 400;
const KEY_OFFSET = 1 << 15;
const KEY_STRIDE = 1 << 16;

const tileKey = (iu, iv) => (iu + KEY_OFFSET) * KEY_STRIDE + (iv + KEY_OFFSET);

/**
 * A corridor layer for a map placed by frame (world/map-frame.js). o: {frame, refiners (optional list of (x, y) -> m,
 * the refinements the tiles hold: each must fade to 0 by the corridor's edge, because outside the tiles the layer is
 * 0), maxTiles (default DEFAULT_MAX_TILES)}. Returns {layer, markDisc(x, y, r), contains(x, y), prefetch(x, y),
 * memberTiles(), stats()}: `layer` goes into Terrain.create({detail: layer}); the rest is for the loader.
 * Memory: maxTiles * TILE_BYTES at most, plus 8 bytes per tile of the corridor for its key.
 */
export function createCorridorLayer({ frame, refiners = [], maxTiles = DEFAULT_MAX_TILES }) {
 const members = new Set(); // keys of the tiles the corridor touches
 const cache = new Map();   // key -> tile, oldest first: the LRU order
 const counts = { built: 0, evicted: 0 };
 const at = { x: 0, y: 0 };
 // The tile index along the grid axis (ax, ay) of world (x, y).
 const tileIndex = (x, y, ax, ay) => Math.floor((ax * (x - frame.originX) + ay * (y - frame.originY)) / TILE_M);
 let lastKey = NaN;
 let lastTile = null;

 // The grid layer (Terrain.grid) of tile (iu, iv): its node (0, 0) is the lattice point one cell before the tile.
 function buildTile(iu, iv) {
  const u0 = iu * TILE_M - DETAIL_CELL_M;
  const v0 = iv * TILE_M - DETAIL_CELL_M;
  const data = new Float32Array(NODES * NODES);
  for (let j = 0; j < NODES; j++) {
   for (let i = 0; i < NODES; i++) {
    frame.toWorld(u0 + i * DETAIL_CELL_M, v0 + j * DETAIL_CELL_M, at);
    let sum = 0;
    for (const refine of refiners) sum += refine(at.x, at.y);
    data[j * NODES + i] = sum;
   }
  }
  frame.toWorld(u0, v0, at);
  const placement = { originX: at.x, originY: at.y, ux: frame.ux, uy: frame.uy, vx: frame.vx, vy: frame.vy };
  counts.built++;
  return Terrain.grid(data, NODES, NODES, DETAIL_CELL_M, placement);
 }

 // The tile holding world (x, y): null outside the corridor, and (when build is false) for a tile not cached.
 function tileAt(x, y, build) {
  const iu = tileIndex(x, y, frame.ux, frame.uy);
  const iv = tileIndex(x, y, frame.vx, frame.vy);
  const key = tileKey(iu, iv);
  if (key === lastKey && (lastTile || !build)) return lastTile;
  if (!members.has(key)) return remember(key, null);
  let tile = cache.get(key) || null;
  if (tile) {
   cache.delete(key); // move to the newest end
   cache.set(key, tile);
  } else if (build) {
   tile = buildTile(iu, iv);
   cache.set(key, tile);
   if (cache.size > maxTiles) {
    cache.delete(cache.keys().next().value);
    counts.evicted++;
   }
  }
  return remember(key, tile);
 }

 function remember(key, tile) {
  lastKey = key;
  lastTile = tile;
  return tile;
 }

 const layer = Object.freeze({
  height(x, y) {
   const tile = tileAt(x, y, true);
   return tile ? tile.height(x, y) : 0;
  },
  gradient(x, y, out) {
   const tile = tileAt(x, y, true);
   if (tile) tile.gradient(x, y, out);
   return out;
  },
  // The renderer's path never builds a tile: it reads the cached ones, so drawing cannot cost a build.
  heightFast(x, y) {
   const tile = tileAt(x, y, false);
   return tile ? tile.height(x, y) : 0;
  },
 });

 return Object.freeze({
  layer,
  /** Marks every tile that a disc of radius r (m) about world (x, y) touches as part of the corridor. */
  markDisc(x, y, r) {
   const ex = x - frame.originX;
   const ey = y - frame.originY;
   const u = frame.ux * ex + frame.uy * ey;
   const v = frame.vx * ex + frame.vy * ey;
   for (let iu = Math.floor((u - r) / TILE_M); iu <= Math.floor((u + r) / TILE_M); iu++) {
    for (let iv = Math.floor((v - r) / TILE_M); iv <= Math.floor((v + r) / TILE_M); iv++) {
     const du = Math.max(iu * TILE_M - u, 0, u - (iu + 1) * TILE_M);
     const dv = Math.max(iv * TILE_M - v, 0, v - (iv + 1) * TILE_M);
     if (du * du + dv * dv <= r * r) members.add(tileKey(iu, iv));
    }
   }
  },
  /** True when world (x, y) is in a corridor tile (where the detail applies). */
  contains(x, y) {
   return members.has(tileKey(tileIndex(x, y, frame.ux, frame.uy), tileIndex(x, y, frame.vx, frame.vy)));
  },
  /** Builds the tile holding world (x, y) now if it is in the corridor (call it a little ahead of the rider). */
  prefetch(x, y) {
   tileAt(x, y, true);
  },
  /** The corridor's tiles, sorted by key: [{iu, iv}] (grid tile indices, TILE_M m each). */
  memberTiles() {
   return [...members].sort((a, b) => a - b).map((k) => ({
    iu: Math.floor(k / KEY_STRIDE) - KEY_OFFSET, iv: (k % KEY_STRIDE) - KEY_OFFSET,
   }));
  },
  /** {members, cached, built, evicted, bytes}: tiles in the corridor, cached, made and dropped so far; bytes held. */
  stats: () => ({ members: members.size, cached: cache.size, ...counts, bytes: cache.size * TILE_BYTES }),
 });
}
