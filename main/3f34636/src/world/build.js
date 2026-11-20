// The procedural world: createWorld() makes the height and groomed grids and their terrain; buildWorld() fills them.
import { Terrain } from './terrain.js';
import { W0, H0, FIN, KICK, cx, bump } from './course.js';
import { hash, vn, fbmRows } from './noise.js';

const TREE_CELL_M = 6;      // m, one tree candidate per cell of this size
const TREE_KEY_STRIDE = 10000; // the trees map key is gx * TREE_KEY_STRIDE + gy
const LIFT_X_M = 820;       // m, x of the lift line (kept clear of trees)
const TREELINE_M = 2560;    // m of altitude, no trees above it

/**
 * A new, empty procedural world: H (m, float32 heights, 1 m cells), M (0..255 groomed mask), the trees (by grid cell
 * and as a list) and the terrain that samples H and M. Memory: H 9.8 MB, M 2.5 MB. Fill it with buildWorld().
 */
export function createWorld() {
 const H = new Float32Array(W0 * H0);
 const M = new Uint8Array(W0 * H0);
 // The procedural map's terrain (world/terrain.js): one base layer, the H grid (1 m cells, kicker ramps baked in by
 // buildWorld()); sculpt, features and detail are empty. Groomed is the M mask of the cell containing (x,y), 0..1.
 // Everything outside this file reads the ground through `terrain`, never H or M.
 const terrain = Terrain.create({
  base: Terrain.grid(H, W0, H0, 1),
  groomed: (x, y) => M[Math.max(0, Math.min(H0 - 1, y | 0)) * W0 + Math.max(0, Math.min(W0 - 1, x | 0))] / 255,
 });
 return { H, M, trees: new Map(), treeArr: [], terrain };
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
function placeTrees(world) {
 const { H, M, trees, treeArr } = world;
 for (let gy = 0; gy < H0 / TREE_CELL_M; gy++) {
  for (let gx = 0; gx < W0 / TREE_CELL_M; gx++) {
   const x = gx * TREE_CELL_M + hash(gx, gy) * TREE_CELL_M;
   const y = gy * TREE_CELL_M + hash(gy, gx + 9) * TREE_CELL_M;
   const i = (y | 0) * W0 + (x | 0);
   if (y < 20 || y > FIN - 10 || x < 10 || x > W0 - 10 || Math.abs(x - LIFT_X_M) < 10 || M[i] > 0) continue;
   if (Math.abs(x - cx(y)) < 40 || H[i] > TREELINE_M) continue;
   if (vn(x / 60, y / 60) < 0.42 || hash(gx + 5, gy + 3) < 0.35) continue;
   const T = { x, y };
   trees.set(gx * TREE_KEY_STRIDE + gy, T);
   treeArr.push(T);
  }
 }
}
