// The procedural worlds: createWorld() makes the height and groomed grids and their terrain for one map layout (the
// test slope or the play mountain); buildWorld() fills them.
import { Terrain } from './terrain.js';
import { createMapFrame } from './map-frame.js';
import { W0, H0, cx, TEST_LAYOUT, createGridCourse } from './course.js';
import { PLAY_LAYOUT } from './play-slope.js';
import { hash, vn, fbmRows } from './noise.js';
import { createPark } from './park/park-layer.js';

export const TREE_CELL_M = 6;      // m, one tree candidate per cell of this size
export const TREE_KEY_STRIDE = 10000; // the trees map key is gx * TREE_KEY_STRIDE + gy

const TREE_NEAR_MAX = 9;    // trees near() can return: one per cell of the 3 × 3 around the point

// The test slope's whole layout: the course layout (course.js) plus where its lift runs (m of the grid), its treeline
// (m of altitude), how far trees keep from the centreline (m), and how it fills its heights (below).
const TEST_MAP = Object.freeze({
 ...TEST_LAYOUT,
 lift: Object.freeze({ x: 820, y0: 140, y1: 2290 }),
 treeline: 2560,
 treeClearM: 40,
 ramp: Object.freeze({ back: 11, fwd: 4, half: 11 }), // m, the stamp's extent: before the lip, after it, across
 fill: fillHeights,
});

/** The maps the game can build, by id: 'test' (the test slope: the physics tests, the golden trace) and 'play'. */
export const MAPS = Object.freeze({ test: TEST_MAP, play: PLAY_LAYOUT });

/**
 * A new, empty procedural world: H (m, float32 heights, 1 m cells), M (0..255 groomed mask), the trees (by grid cell
 * in treeCells, as a list in treeArr, and the lookup the sim uses in trees), the frame that places the map's grid in
 * the world (docs/adr/0005-enu-frame.md), the terrain that samples H and M, and the course (Course,
 * core/contracts.js) over it. o.rotationRad (rad, counter-clockwise, default 0) turns the whole map about the world
 * origin; at 0 the piste runs south. map ('test' default, or 'play'): which layout of MAPS; it is kept as
 * world.layout (the colour map and the façade read it). Memory: H 9.8 MB, M 2.5 MB. Fill it with buildWorld().
 */
export function createWorld({ rotationRad = 0, map = 'test' } = {}) {
 const layout = MAPS[map];
 if (!layout) throw new Error('createWorld: unknown map ' + map);
 const { W, H: Hm } = layout;
 const H = new Float32Array(W * Hm);
 const M = new Uint8Array(W * Hm);
 const frame = createMapFrame({ rotation: rotationRad });
 const at = { u: 0, v: 0 }; // scratch for groomed(): world to grid
 // The procedural map's terrain (world/terrain.js): the base layer, the H grid (1 m cells) placed by frame, and for a
 // map with a park (layout.park) the features layer, its jumps stamped on the base by buildWorld() (world/park/);
 // sculpt and detail are empty. Groomed is the M mask of the grid cell containing world (x,y), 0..1. Everything
 // outside this file reads the ground through `terrain`, never H or M.
 const base = Terrain.grid(H, W, Hm, 1, frame);
 const park = layout.park ? createPark(base.height) : null;
 const terrain = Terrain.create({
  base,
  ...(park ? { features: park.layer } : {}),
  groomed: (x, y) => {
   frame.toGrid(x, y, at);
   return M[Math.max(0, Math.min(Hm - 1, at.v | 0)) * W + Math.max(0, Math.min(W - 1, at.u | 0))] / 255;
  },
 });
 const treeCells = new Map();
 return {
  layout, H, M, frame, treeCells, treeArr: [], trees: createTreeLookup(treeCells, frame), terrain, park,
  course: createGridCourse(layout, terrain, frame, park ? () => park.features : undefined),
 };
}

/** A trees lookup with no trees (sim unit tests on a bare plane). */
export const NO_TREES = Object.freeze({ near: () => 0, maxNear: 0 });

/**
 * The trees lookup the sim uses (sim/step.js): near(x, y, out) writes the trees ({x, y}, world m) in the 3 × 3 tree
 * cells around world (x, y) into out (an array with room for TREE_NEAR_MAX) and returns how many. No allocation.
 */
export function createTreeLookup(treeCells, frame) {
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

/** Fills world (from createWorld) in place: heights, the groomed piste, kicker ramps, the park and the trees. */
export function buildWorld(world) {
 world.layout.fill(world.H, world.M);
 addKickerRamps(world.H, world.layout);
 if (world.park) world.park.build(world.layout.park(), world.course);
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
function addKickerRamps(H, { KICK, cx, bump, W, ramp }) {
 for (const k of KICK) {
  for (let yy = k - ramp.back; yy <= k + ramp.fwd; yy++) {
   const c = Math.round(cx(yy));
   for (let xx = c - ramp.half; xx <= c + ramp.half; xx++) H[yy * W + xx] += bump(xx, yy);
  }
 }
}

// One tree per TREE_CELL_M cell where the noise says forest: off the piste, away from the lift, below the treeline.
// Placed on the grid, stored in world metres.
function placeTrees(world) {
 const { H, M, treeCells, treeArr, frame, layout } = world;
 const { W: W0, H: H0, FIN, cx, lift, treeline, treeClearM } = layout;
 for (let gy = 0; gy < H0 / TREE_CELL_M; gy++) {
  for (let gx = 0; gx < W0 / TREE_CELL_M; gx++) {
   const x = gx * TREE_CELL_M + hash(gx, gy) * TREE_CELL_M;
   const y = gy * TREE_CELL_M + hash(gy, gx + 9) * TREE_CELL_M;
   const i = (y | 0) * W0 + (x | 0);
   if (y < 20 || y > FIN - 10 || x < 10 || x > W0 - 10 || Math.abs(x - lift.x) < 10 || M[i] > 0) continue;
   if (Math.abs(x - cx(y)) < treeClearM || H[i] > treeline) continue;
   if (vn(x / 60, y / 60) < 0.42 || hash(gx + 5, gy + 3) < 0.35) continue;
   const T = frame.toWorld(x, y, { x: 0, y: 0 });
   treeCells.set(gx * TREE_KEY_STRIDE + gy, T);
   treeArr.push(T);
  }
 }
}
