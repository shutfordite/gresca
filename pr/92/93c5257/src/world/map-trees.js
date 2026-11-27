// Trees for a loaded real map (R6 later brings real tree areas): a seeded scatter off the piste, inside its corridor.
// Pure: places by the same hash and noise as the procedural map, so a map always gets the same trees.
import { hash, vn } from './noise.js';
import { TREE_CELL_M, TREE_KEY_STRIDE } from './build.js';
import { TILE_M } from './corridor-layer.js';

/** m, trees keep this far from the piste's edge. */
export const TREE_CLEAR_M = 8;
/** deg, no tree grows on a slope steeper than this (rock, as the art spec draws over 38 degrees). */
export const TREE_MAX_SLOPE_DEG = 40;
const EDGE_M = 10; // m, no trees this close to the map's edge
const FOREST_NOISE_M = 60; // m, the size of the forest patches
const FOREST_MIN = 0.42;   // value noise below this is a clearing
const GAP_MIN = 0.35;      // hash below this leaves a gap in the forest

/**
 * Places the trees of corridor tile (iu, iv) (grid tile indices, TILE_M m): one candidate per TREE_CELL_M cell whose
 * corner is in the tile, so each cell is visited once over all tiles. Adds {x, y} (world m) to treeCells (key
 * gx * TREE_KEY_STRIDE + gy) and to treeArr. o: {frame, course, slopeDeg ((x, y) -> deg), width, length (m, the map's
 * grid), corridorM (m, how far past the piste's edge trees may grow)}. Returns how many were placed.
 */
export function placeTreesInTile(iu, iv, o, treeCells, treeArr) {
 const { frame, course, slopeDeg, width, length, corridorM } = o;
 const gx0 = Math.ceil(iu * TILE_M / TREE_CELL_M);
 const gx1 = Math.ceil((iu + 1) * TILE_M / TREE_CELL_M);
 const gy0 = Math.ceil(iv * TILE_M / TREE_CELL_M);
 const gy1 = Math.ceil((iv + 1) * TILE_M / TREE_CELL_M);
 const at = { x: 0, y: 0 };
 const where = { s: 0, d: 0, tx: 0, ty: 0 };
 let placed = 0;
 for (let gx = gx0; gx < gx1; gx++) {
  for (let gy = gy0; gy < gy1; gy++) {
   const u = gx * TREE_CELL_M + hash(gx, gy) * TREE_CELL_M;
   const v = gy * TREE_CELL_M + hash(gy, gx + 9) * TREE_CELL_M;
   if (u < EDGE_M || u > width - EDGE_M || v < EDGE_M || v > length - EDGE_M) continue;
   if (vn(u / FOREST_NOISE_M, v / FOREST_NOISE_M) < FOREST_MIN || hash(gx + 5, gy + 3) < GAP_MIN) continue;
   frame.toWorld(u, v, at);
   course.project(at.x, at.y, where);
   const off = Math.abs(where.d) - course.widthAt(where.s) / 2;
   if (off < TREE_CLEAR_M || off > corridorM) continue;
   if (slopeDeg(at.x, at.y) > TREE_MAX_SLOPE_DEG) continue;
   const tree = { x: at.x, y: at.y };
   treeCells.set(gx * TREE_KEY_STRIDE + gy, tree);
   treeArr.push(tree);
   placed++;
  }
 }
 return placed;
}
