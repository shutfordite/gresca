// Terrain interface: a stack of height layers (base, sculpt, features, detail) sampled as one smooth surface.
import { powderDepth } from './snow.js';
// ---- terrain ----
// Everything that needs the ground (physics, camera, renderer, sprites, the rider's feet, the façade) asks a Terrain,
// never the height array (docs/REAL-WORLD-DATA.md R1). Pure: no DOM, canvas or HANGA colours, so it loads in Node
// as it is. Units: x and y are world metres (m, east and north: docs/adr/0005-enu-frame.md), the same frame as the
// rider; heights are metres of altitude (m); gradients are metres of rise per metre east and north (m/m); angles are
// degrees only where the name says so (slopeDeg). A grid layer is placed in the world by its MapFrame.
//
// height(x,y) = base + sculpt + features + detail. Each layer is a pure function of map metres:
//   { height(x,y) -> m, gradient(x,y,out) -> adds d(height)/dx and d(height)/dy to out.gx, out.gy (m/m) }
// with x, y world metres.
// A layer may also have heightFast(x,y) (a cheaper approximation, see heightFast below); without it, height is used.
//   base      the height grid (procedural build or a baked DEM), Catmull-Rom bicubic: see Terrain.grid
//   sculpt    grooming along the course (C1/C4): none yet
//   features  kickers, rails and boxes stamped along the course (C2): none yet; today's kicker ramps are still
//             baked into the procedural base grid by build()
//   detail    seeded micro-relief: none yet
const LAYERS = Object.freeze(['base', 'sculpt', 'features', 'detail']);

// A grid's placement when none is given: grid (u, v) is world (u, v), rows running north (test planes). A map's grid
// is placed by its MapFrame (world/map-frame.js), which has the same fields.
const UNPLACED = Object.freeze({ originX: 0, originY: 0, ux: 1, uy: 0, vx: 0, vy: 1 });

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
 * The base layer for a height grid: data[iy*nx+ix] (m) is the height at grid point (u, v) = (ix*cellM, iy*cellM),
 * which frame places in the world (a MapFrame, world/map-frame.js: originX, originY, and ux, uy, vx, vy the world
 * unit vectors of grid +u and +v; default: grid = world). Queries take world x, y.
 * height() is Catmull-Rom bicubic: it passes through every sample and its gradient is continuous (C1), so physics
 * feels no slope kink at cell edges (bilinear has one at every edge). gradient() is the exact derivative of height().
 * Outside the samples it holds the edge value (gradient 0 across the edge). Memory: the grid itself, nothing more.
 */
function grid(data, nx, ny, cellM = 1, frame = UNPLACED) {
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
 const ox = frame.originX;
 const oy = frame.originY;
 const ux = frame.ux;
 const uy = frame.uy;
 const vx = frame.vx;
 const vy = frame.vy;
 // Sets wx,dx,wy,dy, the column indices ci and row offsets rj for the sample cell around world (x,y); returns a bit
 // mask: 1 if it is outside the grid's columns, 2 if outside its rows (that grid component of the gradient is 0).
 // The grid position is the frame's toGrid() inlined (no call, no out object): exact at the default placement.
 function setup(x, y) {
  const ex = x - ox;
  const ey = y - oy;
  const gu = ux * ex + uy * ey;
  const gv = vx * ex + vy * ey;
  let u = gu * inv;
  let v = gv * inv;
  let out = 0;
  if (!(u > 0)) {
   u = 0;
   out |= gu < 0 ? 1 : 0;
  } else if (u > X1) {
   u = X1;
   out |= 1;
  }
  if (!(v > 0)) {
   v = 0;
   out |= gv < 0 ? 2 : 0;
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
  frame,
  // m, the raw sample of the grid cell containing world (x,y): the cell (u|0, v|0) at 1 m cells. For tests and the
  // build.
  cell(x, y) {
   const ex = x - ox;
   const ey = y - oy;
   const ix = Math.max(0, Math.min(X1, Math.floor((ux * ex + uy * ey) * inv)));
   const iy = Math.max(0, Math.min(Y1, Math.floor((vx * ex + vy * ey) * inv)));
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
   // per metre of u and v, then turned into the world (the frame's vecToWorld, inlined)
   const du = out & 1 ? 0 : gx * inv;
   const dv = out & 2 ? 0 : gy * inv;
   o.gx += ux * du + vx * dv;
   o.gy += uy * du + vy * dv;
   return o;
  },
  // m, bilinear between the four samples around (x,y). The renderer's fast path: about a quarter of the work of
  // height(), and within a few cm of it on the procedural map (test/terrain.test.js bounds the difference).
  heightFast(x, y) {
   const ex = x - ox;
   const ey = y - oy;
   let u = (ux * ex + uy * ey) * inv;
   let v = (vx * ex + vy * ey) * inv;
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
 * layers), groomed (optional: (x,y) -> 0..1), powder (optional: (x,y) -> m; by default world/snow.js powderDepth
 * from this terrain's shape and groomed)}. bounds are the base grid's extent in the world (see mapBounds).
 */
function create(o) {
 const base = o.base;
 if (!base || typeof base.cell !== 'function') throw new Error('Terrain.create: base must be a Terrain.grid');
 for (const k in o) if (!LAYERS.includes(k) && k !== 'groomed' && k !== 'powder') throw new Error('Terrain.create: unknown layer ' + k);
 const extra = LAYERS.slice(1).map((k) => o[k]).filter(Boolean);
 const n = extra.length;
 const g0 = { gx: 0, gy: 0 };
 const groomed = o.groomed || (() => 0);
 function height(x, y) {
  let h = base.height(x, y);
  for (let k = 0; k < n; k++) h += extra[k].height(x, y);
  return h;
 }
 // {gx,gy} in m/m: how fast height() rises per metre east (+x) and per metre north (+y). Writes into out if
 // given (no allocation: use this form in per-step and per-pixel code), else returns a new object.
 function gradient(x, y, out) {
  const o2 = out || { gx: 0, gy: 0 };
  o2.gx = 0;
  o2.gy = 0;
  base.gradient(x, y, o2);
  for (let k = 0; k < n; k++) extra[k].gradient(x, y, o2);
  return o2;
 }
 const bounds = mapBounds(base.frame, base.nx * base.cellM, base.ny * base.cellM);
 const powder = o.powder || powderDepth(height, gradient, groomed, bounds);
 return Object.freeze({
  layers: Object.freeze(LAYERS.filter((k) => o[k])), // names of the layers in use, in stack order
  bounds,             // the base grid's rectangle (m), mapBounds
  cellM: base.cellM,   // m, spacing of the base grid's samples
  height,              // (x,y) -> m, altitude of the composed surface; smooth (C1) for physics and the camera
  gradient,            // (x,y,out?) -> {gx,gy}, m/m, the exact derivative of height()
  // (x,y) -> {x,y,z}, unit upward surface normal (east, north, up). Allocates: not for hot loops.
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
  // (x,y) -> m, surface: loose snow over the firm base, 0 on the groomed piste; light powder under
  // POWDER.LIGHT_BELOW, deep from POWDER.DEEP_FROM (world/snow.js). Not a height layer: the rider sinks into it.
  powder,
 });
}

/**
 * The world rectangle of a width × length m grid placed by frame: x0, y0 (m, the world position of grid (0, 0)),
 * ax, ay (unit world vector along the grid's columns, +u), bx, by (unit world vector down its rows, +v), width,
 * length (m), and the world-axis box around it, minX..maxY (m). Frozen.
 */
export function mapBounds(frame, width, length) {
 const a = { x: frame.ux, y: frame.uy };
 const b = { x: frame.vx, y: frame.vy };
 const xs = [0, a.x * width, b.x * length, a.x * width + b.x * length].map((v) => frame.originX + v);
 const ys = [0, a.y * width, b.y * length, a.y * width + b.y * length].map((v) => frame.originY + v);
 return Object.freeze({
  x0: frame.originX, y0: frame.originY, ax: a.x, ay: a.y, bx: b.x, by: b.y, width, length,
  minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys),
 });
}

/** The terrain interface: LAYERS (stack order), grid() (a bicubic base layer), create() (a Terrain), crWeights(). */
export const Terrain = Object.freeze({ LAYERS: Object.freeze(LAYERS.slice()), grid, create, crWeights, mapBounds });
