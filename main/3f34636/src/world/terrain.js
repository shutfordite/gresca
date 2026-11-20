// Terrain interface: a stack of height layers (base, sculpt, features, detail) sampled as one smooth surface.
// ---- terrain ----
// Everything that needs the ground (physics, camera, renderer, sprites, the rider's feet, the façade) asks a Terrain,
// never the height array (docs/REAL-WORLD-DATA.md R1). Pure: no DOM, canvas or HANGA colours, so it loads in Node
// as it is. Units: x and y are map metres (m), the same frame as the rider; heights are metres of altitude (m);
// gradients are metres of rise per metre (m/m); angles are degrees only where the name says so (slopeDeg).
//
// height(x,y) = base + sculpt + features + detail. Each layer is a pure function of map metres:
//   { height(x,y) -> m, gradient(x,y,out) -> adds d(height)/dx and d(height)/dy to out.gx, out.gy (m/m) }
// A layer may also have heightFast(x,y) (a cheaper approximation, see heightFast below); without it, height is used.
//   base      the height grid (procedural build or a baked DEM), Catmull-Rom bicubic: see Terrain.grid
//   sculpt    grooming along the course (C1/C4): none yet
//   features  kickers, rails and boxes stamped along the course (C2): none yet; today's kicker ramps are still
//             baked into the procedural base grid by build()
//   detail    seeded micro-relief: none yet
const LAYERS = Object.freeze(['base', 'sculpt', 'features', 'detail']);

/**
 * Catmull-Rom weights for the four samples around a point a fraction t (0..1) of the way from sample 1 to sample 2,
 * and their derivatives with respect to t. Writes w[0..3] and d[0..3].
 */
function crWeights(t, w, d) {
 const t2 = t * t;
 const t3 = t2 * t;
 w[0] = (-t3 + 2 * t2 - t) * 0.5;
 w[1] = (3 * t3 - 5 * t2 + 2) * 0.5;
 w[2] = (-3 * t3 + 4 * t2 + t) * 0.5;
 w[3] = (t3 - t2) * 0.5;
 d[0] = (-3 * t2 + 4 * t - 1) * 0.5;
 d[1] = (9 * t2 - 10 * t) * 0.5;
 d[2] = (-9 * t2 + 8 * t + 1) * 0.5;
 d[3] = (3 * t2 - 2 * t) * 0.5;
}

/**
 * The base layer for a height grid: data[iy*nx+ix] (m) is the height at map point (ix*cellM, iy*cellM).
 * height() is Catmull-Rom bicubic: it passes through every sample and its gradient is continuous (C1), so physics
 * feels no slope kink at cell edges (bilinear has one at every edge). gradient() is the exact derivative of height().
 * Outside the samples it holds the edge value (gradient 0 across the edge). Memory: the grid itself, nothing more.
 */
function grid(data, nx, ny, cellM = 1) {
 if (data.length !== nx * ny) {
  throw new Error('Terrain.grid: data has ' + data.length + ' samples, expected ' + nx * ny);
 }
 const X1 = nx - 1;
 const Y1 = ny - 1;
 const wx = new Float64Array(4);
 const dx = new Float64Array(4);
 const wy = new Float64Array(4);
 const dy = new Float64Array(4);
 const ci = new Int32Array(4);
 const rj = new Int32Array(4);
 const inv = 1 / cellM;
 // Sets wx,dx,wy,dy, the column indices ci and row offsets rj for the sample cell around (x,y); returns a bit mask:
 // 1 if x is outside the grid, 2 if y is (that component of the gradient is then 0).
 function setup(x, y) {
  let u = x * inv;
  let v = y * inv;
  let out = 0;
  if (!(u > 0)) {
   u = 0;
   out |= x < 0 ? 1 : 0;
  } else if (u > X1) {
   u = X1;
   out |= 1;
  }
  if (!(v > 0)) {
   v = 0;
   out |= y < 0 ? 2 : 0;
  } else if (v > Y1) {
   v = Y1;
   out |= 2;
  }
  const ix = Math.min(u | 0, X1 - 1);
  const iy = Math.min(v | 0, Y1 - 1);
  crWeights(u - ix, wx, dx);
  crWeights(v - iy, wy, dy);
  ci[0] = ix > 0 ? ix - 1 : 0;
  ci[1] = ix;
  ci[2] = ix + 1;
  ci[3] = ix + 2 < X1 ? ix + 2 : X1;
  rj[0] = (iy > 0 ? iy - 1 : 0) * nx;
  rj[1] = iy * nx;
  rj[2] = (iy + 1) * nx;
  rj[3] = (iy + 2 < Y1 ? iy + 2 : Y1) * nx;
  return out;
 }
 return {
  nx,
  ny,
  cellM,
  // m, the raw sample nearest below-left of (x,y): the cell (x|0, y|0) at 1 m cells. For tests and the build.
  cell(x, y) {
   const ix = Math.max(0, Math.min(X1, Math.floor(x * inv)));
   const iy = Math.max(0, Math.min(Y1, Math.floor(y * inv)));
   return data[iy * nx + ix];
  },
  height(x, y) {
   setup(x, y);
   let h = 0;
   for (let j = 0; j < 4; j++) {
    const r = rj[j];
    const row = wx[0] * data[r + ci[0]] + wx[1] * data[r + ci[1]] + wx[2] * data[r + ci[2]] + wx[3] * data[r + ci[3]];
    h += wy[j] * row;
   }
   return h;
  },
  gradient(x, y, o) {
   const out = setup(x, y);
   let gx = 0;
   let gy = 0;
   for (let j = 0; j < 4; j++) {
    const r = rj[j];
    const a = data[r + ci[0]];
    const b = data[r + ci[1]];
    const c = data[r + ci[2]];
    const d = data[r + ci[3]];
    gx += wy[j] * (dx[0] * a + dx[1] * b + dx[2] * c + dx[3] * d);
    gy += dy[j] * (wx[0] * a + wx[1] * b + wx[2] * c + wx[3] * d);
   }
   if (!(out & 1)) o.gx += gx * inv;
   if (!(out & 2)) o.gy += gy * inv;
   return o;
  },
  // m, bilinear between the four samples around (x,y). The renderer's fast path: about a quarter of the work of
  // height(), and within a few cm of it on the procedural map (test/terrain.test.js bounds the difference).
  heightFast(x, y) {
   let u = x * inv;
   let v = y * inv;
   u = u > 0 ? (u < X1 ? u : X1) : 0;
   v = v > 0 ? (v < Y1 ? v : Y1) : 0;
   const ix = Math.min(u | 0, X1 - 1);
   const iy = Math.min(v | 0, Y1 - 1);
   const fx = u - ix;
   const fy = v - iy;
   const i = iy * nx + ix;
   return data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) + data[i + nx] * (1 - fx) * fy +
    data[i + nx + 1] * fx * fy;
  },
 };
}

/**
 * A Terrain from a layer stack. o: {base (required, usually Terrain.grid), sculpt, features, detail (optional
 * layers), groomed (optional: (x,y) -> 0..1)}. bounds are the base grid's extent in map metres.
 */
function create(o) {
 const base = o.base;
 if (!base || typeof base.cell !== 'function') throw new Error('Terrain.create: base must be a Terrain.grid');
 for (const k in o) if (!LAYERS.includes(k) && k !== 'groomed') throw new Error('Terrain.create: unknown layer ' + k);
 const extra = LAYERS.slice(1).map((k) => o[k]).filter(Boolean);
 const n = extra.length;
 const g0 = { gx: 0, gy: 0 };
 const groomed = o.groomed || (() => 0);
 function height(x, y) {
  let h = base.height(x, y);
  for (let k = 0; k < n; k++) h += extra[k].height(x, y);
  return h;
 }
 // {gx,gy} in m/m: how fast height() rises per metre east (+x) and per metre down the map (+y). Writes into out if
 // given (no allocation: use this form in per-step and per-pixel code), else returns a new object.
 function gradient(x, y, out) {
  const o2 = out || { gx: 0, gy: 0 };
  o2.gx = 0;
  o2.gy = 0;
  base.gradient(x, y, o2);
  for (let k = 0; k < n; k++) extra[k].gradient(x, y, o2);
  return o2;
 }
 return Object.freeze({
  layers: Object.freeze(LAYERS.filter((k) => o[k])), // names of the layers in use, in stack order
  bounds: Object.freeze({ minX: 0, minY: 0, maxX: base.nx * base.cellM, maxY: base.ny * base.cellM }), // m
  cellM: base.cellM,   // m, spacing of the base grid's samples
  height,              // (x,y) -> m, altitude of the composed surface; smooth (C1) for physics and the camera
  gradient,            // (x,y,out?) -> {gx,gy}, m/m, the exact derivative of height()
  // (x,y) -> {x,y,z}, unit upward surface normal (z up, x and y in the map frame). Allocates: not for hot loops.
  normal(x, y) {
   gradient(x, y, g0);
   const k = 1 / Math.hypot(g0.gx, g0.gy, 1);
   return { x: -g0.gx * k, y: -g0.gy * k, z: k };
  },
  // (x,y) -> degrees, the angle between the surface and the horizontal (0 flat, 45 for 1 m drop per m).
  slopeDeg(x, y) {
   gradient(x, y, g0);
   return Math.atan(Math.hypot(g0.gx, g0.gy)) * 180 / Math.PI;
  },
  // (x,y) -> m, the raw base sample of the cell containing (x,y) (no interpolation, no other layers). For tests,
  // the build and anything that must reproduce the old cell-by-cell values exactly.
  cellHeight: (x, y) => base.cell(x, y),
  // (x,y) -> m, the renderer's fast path: the base layer bilinear plus the other layers' (fast) height. Within a few
  // cm of height() on the procedural map, so the board still sits on the snow you see. Only the raycaster should
  // use it; everything that touches the rider uses height().
  heightFast(x, y) {
   let h = base.heightFast(x, y);
   for (let k = 0; k < n; k++) {
    const L = extra[k];
    h += L.heightFast ? L.heightFast(x, y) : L.height(x, y);
   }
   return h;
  },
  // (x,y) -> 0..1, surface: how groomed the snow is (1 = groomed piste, 0 = off-piste powder). Not a height layer.
  groomed,
 });
}

/** The terrain interface: LAYERS (stack order), grid() (a bicubic base layer), create() (a Terrain), crWeights(). */
export const Terrain = Object.freeze({ LAYERS: Object.freeze(LAYERS.slice()), grid, create, crWeights });
