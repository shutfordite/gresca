// The procedural world: createWorld() makes the height and groomed grids and their terrain; buildWorld() fills them.
import { Terrain } from './terrain.js';
import { createMapFrame } from './map-frame.js';
import { W0, H0, FIN, KICK, cx, bump, createProceduralCourse } from './course.js';
import { hash, vn, fbmRows } from './noise.js';

const TREE_CELL_M = 6;      // m, one tree candidate per cell of this size
const TREE_KEY_STRIDE = 10000; // the trees map key is gx * TREE_KEY_STRIDE + gy
const LIFT_X_M = 820;       // m, x of the lift line (kept clear of trees)
const TREELINE_M = 2560;    // m of altitude, no trees above it

const TREE_NEAR_MAX = 9;    // trees near() can return: one per cell of the 3 × 3 around the point

/**
 * A new, empty procedural world: H (m, float32 heights, 1 m cells), M (0..255 groomed mask), the trees (by grid cell
 * in treeCells, as a list in treeArr, and the lookup the sim uses in trees), the frame that places the map's grid in
 * the world (docs/adr/0005-enu-frame.md), the terrain that samples H and M, and the course (Course,
 * core/contracts.js) over it. o.rotationRad (rad, counter-clockwise, default 0) turns the whole map about the world
 * origin; at 0 the piste runs south. Memory: H 9.8 MB, M 2.5 MB. Fill it with buildWorld().
 */
export function createWorld({ rotationRad = 0 } = {}) {
 const H = new Float32Array(W0 * H0);
 const M = new Uint8Array(W0 * H0);
 const frame = createMapFrame({ rotation: rotationRad });
 const at = { u: 0, v: 0 }; // scratch for groomed(): world to grid
 // The procedural map's terrain (world/terrain.js): one base layer, the H grid (1 m cells, kicker ramps baked in by
 // buildWorld()) placed by frame; sculpt, features and detail are empty. Groomed is the M mask of the grid cell
 // containing world (x,y), 0..1. Everything outside this file reads the ground through `terrain`, never H or M.
 const terrain = Terrain.create({
  base: Terrain.grid(H, W0, H0, 1, frame),
  groomed: (x, y) => {
   frame.toGrid(x, y, at);
   return M[Math.max(0, Math.min(H0 - 1, at.v | 0)) * W0 + Math.max(0, Math.min(W0 - 1, at.u | 0))] / 255;
  },
 });
 const treeCells = new Map();
 return {
  H, M, frame, treeCells, treeArr: [], trees: createTreeLookup(treeCells, frame), terrain,
  course: createProceduralCourse(terrain, frame),
 };
}

/** A trees lookup with no trees (sim unit tests on a bare plane). */
export const NO_TREES = Object.freeze({ near: () => 0, maxNear: 0 });

/**
 * The trees lookup the sim uses (sim/step.js): near(x, y, out) writes the trees ({x, y}, world m) in the 3 × 3 tree
 * cells around world (x, y) into out (an array with room for TREE_NEAR_MAX) and returns how many. No allocation.
 */
function createTreeLookup(treeCells, frame) {
 const at = { u: 0, v: 0 };
 function near(x, y, out) {
  frame.toGrid(x, y, at);
  const gx0 = (at.u / TREE_CELL_M) | 0;
  const gy0 = (at.v / TREE_CELL_M) | 0;
  let n = 0;
  for (let du = -1; du <= 1; du++) {
   for (let dv = -1; dv <= 1; dv++) {
    const T = treeCells.get((gx0 + du) * TREE_KEY_STRIDE + gy0 + dv);
    if (T) out[n++] = T;
   }
  }
  return n;
 }
 return Object.freeze({ near, maxNear: TREE_NEAR_MAX });
}

/** Fills world (from createWorld) in place: heights, the groomed piste, kicker ramps and the trees. */
export function buildWorld(world) {
 fillHeights(world.H, world.M);
 addKickerRamps(world.H);
 placeTrees(world);
}

// Heights (m) and the groomed mask: a ridge falling 0.26 m per m down the map, fractal noise flattened on the piste.
function fillHeights(H, M) {
 const row = fbmRows(W0, H0);
 const F = new Float64Array(W0);
 for (let y = 0; y < H0; y++) {
  const c = cx(y);
  const hy = 2700 - y * 0.26;
  row(y, F);
  for (let x = 0; x < W0; x++) {
   const d = Math.abs(x - c);
   const t = Math.max(0, Math.min(1, (d - 18) / 16));
   const m = 1 - t * t * (3 - 2 * t);
   const i = y * W0 + x;
   M[i] = m * 255;
   H[i] = hy + (F[x] - 0.5) * 110 * (1 - m * 0.92) + Math.min(d, 260) * 0.16;
  }
 }
}

// Kicker ramps are real terrain, so they show up in the shading and in the 3D view.
function addKickerRamps(H) {
 for (const k of KICK) {
  for (let yy = k - 11; yy <= k + 4; yy++) {
   const c = Math.round(cx(yy));
   for (let xx = c - 11; xx <= c + 11; xx++) H[yy * W0 + xx] += bump(xx, yy);
  }
 }
}

// One tree per TREE_CELL_M cell where the noise says forest: off the piste, away from the lift, below the treeline.
// Placed on the grid, stored in world metres.
function placeTrees(world) {
 const { H, M, treeCells, treeArr, frame } = world;
 for (let gy = 0; gy < H0 / TREE_CELL_M; gy++) {
  for (let gx = 0; gx < W0 / TREE_CELL_M; gx++) {
   const x = gx * TREE_CELL_M + hash(gx, gy) * TREE_CELL_M;
   const y = gy * TREE_CELL_M + hash(gy, gx + 9) * TREE_CELL_M;
   const i = (y | 0) * W0 + (x | 0);
   if (y < 20 || y > FIN - 10 || x < 10 || x > W0 - 10 || Math.abs(x - LIFT_X_M) < 10 || M[i] > 0) continue;
   if (Math.abs(x - cx(y)) < 40 || H[i] > TREELINE_M) continue;
   if (vn(x / 60, y / 60) < 0.42 || hash(gx + 5, gy + 3) < 0.35) continue;
   const T = frame.toWorld(x, y, { x: 0, y: 0 });
   treeCells.set(gx * TREE_KEY_STRIDE + gy, T);
   treeArr.push(T);
  }
 }
}
