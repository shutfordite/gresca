// The polyline Course (core/contracts.js, docs/adr/0004-course-interface.md): s is arc length along a centreline
// polyline and d the signed perpendicular distance from it, positive on its left. Also Course.fromRun(ways), which
// builds one from a real run's ways (docs/REAL-WORLD-DATA.md R4). Pure: every query writes into the caller's out.
import { DEFAULT_FRAME } from './map-frame.js';
import {
 arcLengths, joinWays, toPolyline, smoothRun, MIN_SPACING_M, MAX_SPACING_M,
} from './run-geometry.js';

const CELL_M = 12;           // m, the side of a lookup cell: project() scans the cells around the point, nearest first
const FLAT_SLOPE = 1e-9;     // m/m, a gradient smaller than this is flat ground (no fall line)
const DEFAULT_SPACING_M = 1.5; // m between centreline points made by fromRun
const MIN_TURN_RADIUS_M = 15;  // m, the tightest turn fromRun keeps: 1.5 g at 15 m/s, about what a carve holds
// m, a run's width by OpenSkiMap difficulty when the caller gives none: wide and gentle for beginners, narrow and
// steep for experts; '' (unknown) is a middling piste.
export const DIFFICULTY_WIDTH_M = Object.freeze({
 '': 30, novice: 40, easy: 36, intermediate: 30, advanced: 24, expert: 20, freeride: 30, extreme: 16,
});

const isPositive = (v) => Number.isFinite(v) && v > 0;
const freezeAll = (list) => Object.freeze(list.map((e) => Object.freeze({ ...e })));

// Segment arrays of the world polyline xy: start (ax, ay), unit direction (ux, uy), length (len), arc length at the
// start (cum; cum[n] is the total), where n is the number of segments.
function segmentsOf(xy) {
 const n = xy.length / 2 - 1;
 const seg = { n, ax: new Float64Array(n), ay: new Float64Array(n), ux: new Float64Array(n),
  uy: new Float64Array(n), len: new Float64Array(n), cum: arcLengths(xy) };
 for (let i = 0; i < n; i++) {
  const dx = xy[2 * i + 2] - xy[2 * i];
  const dy = xy[2 * i + 3] - xy[2 * i + 1];
  seg.len[i] = Math.hypot(dx, dy);
  seg.ax[i] = xy[2 * i];
  seg.ay[i] = xy[2 * i + 1];
  seg.ux[i] = dx / seg.len[i];
  seg.uy[i] = dy / seg.len[i];
 }
 return seg;
}

// A lookup grid over the segments: for cell c, the segments whose bounding box meets it are
// list[start[c] .. start[c + 1]). Memory: 4 bytes per cell and per listing, about 16 bytes per metre of piste.
function gridOf(seg) {
 let x0 = Infinity;
 let y0 = Infinity;
 let x1 = -Infinity;
 let y1 = -Infinity;
 for (let i = 0; i < seg.n; i++) {
  x0 = Math.min(x0, seg.ax[i], seg.ax[i] + seg.ux[i] * seg.len[i]);
  x1 = Math.max(x1, seg.ax[i], seg.ax[i] + seg.ux[i] * seg.len[i]);
  y0 = Math.min(y0, seg.ay[i], seg.ay[i] + seg.uy[i] * seg.len[i]);
  y1 = Math.max(y1, seg.ay[i], seg.ay[i] + seg.uy[i] * seg.len[i]);
 }
 const nx = Math.floor((x1 - x0) / CELL_M) + 1;
 const ny = Math.floor((y1 - y0) / CELL_M) + 1;
 const start = new Int32Array(nx * ny + 1);
 const cells = (i, visit) => {
  const bx = seg.ax[i] + seg.ux[i] * seg.len[i];
  const by = seg.ay[i] + seg.uy[i] * seg.len[i];
  const cx0 = Math.floor((Math.min(seg.ax[i], bx) - x0) / CELL_M);
  const cx1 = Math.floor((Math.max(seg.ax[i], bx) - x0) / CELL_M);
  const cy0 = Math.floor((Math.min(seg.ay[i], by) - y0) / CELL_M);
  const cy1 = Math.floor((Math.max(seg.ay[i], by) - y0) / CELL_M);
  for (let gy = cy0; gy <= cy1; gy++) for (let gx = cx0; gx <= cx1; gx++) visit(gy * nx + gx);
 };
 for (let i = 0; i < seg.n; i++) cells(i, (c) => start[c + 1]++);
 for (let c = 0; c < nx * ny; c++) start[c + 1] += start[c];
 const fill = start.slice(0, nx * ny);
 const list = new Int32Array(start[nx * ny]);
 for (let i = 0; i < seg.n; i++) cells(i, (c) => { list[fill[c]++] = i; });
 return { x0, y0, nx, ny, start, list };
}

// m squared, the distance from (px, py) to segment i, ends included.
function distance2(seg, i, px, py) {
 const ox = px - seg.ax[i];
 const oy = py - seg.ay[i];
 const t = Math.max(0, Math.min(seg.len[i], ox * seg.ux[i] + oy * seg.uy[i]));
 const dx = ox - seg.ux[i] * t;
 const dy = oy - seg.uy[i] * t;
 return dx * dx + dy * dy;
}

// The index of the segment nearest (px, py): the cells around the point are scanned in rings, and the search stops
// once no unseen cell can be closer than the best segment found. The first of equally near segments wins.
function nearestSegment(seg, grid, px, py) {
 const { nx, ny, start, list } = grid;
 const cx = Math.max(0, Math.min(nx - 1, Math.floor((px - grid.x0) / CELL_M)));
 const cy = Math.max(0, Math.min(ny - 1, Math.floor((py - grid.y0) / CELL_M)));
 const maxRing = Math.max(nx, ny);
 let best = Infinity;
 let bestAt = -1;
 for (let ring = 0; ring <= maxRing; ring++) {
  for (let gy = cy - ring; gy <= cy + ring; gy++) {
   if (gy < 0 || gy >= ny) continue;
   const wholeRow = ring === 0 || gy === cy - ring || gy === cy + ring;
   const stride = wholeRow ? 1 : 2 * ring;
   for (let gx = cx - ring; gx <= cx + ring; gx += stride) {
    if (gx < 0 || gx >= nx) continue;
    const c = gy * nx + gx;
    for (let k = start[c]; k < start[c + 1]; k++) {
     const dist = distance2(seg, list[k], px, py);
     if (dist < best || (dist === best && list[k] < bestAt)) {
      best = dist;
      bestAt = list[k];
     }
    }
   }
  }
  const reach = ring * CELL_M;
  if (bestAt >= 0 && best <= reach * reach) break;
 }
 return bestAt;
}

// The index of the segment holding arc length s (m): the first or last one for s outside the polyline.
function segmentAt(cum, n, s) {
 let lo = 0;
 let hi = n - 1;
 while (lo < hi) {
  const mid = (lo + hi + 1) >> 1;
  if (cum[mid] <= s) lo = mid;
  else hi = mid - 1;
 }
 return lo;
}

// widthAt(s) from a constant (m) or one width per vertex (Float64Array, m), interpolated along s.
function widthFn(width, seg) {
 if (!(width instanceof Float64Array)) return () => width;
 return (s) => {
  const i = segmentAt(seg.cum, seg.n, s);
  const t = Math.max(0, Math.min(1, (s - seg.cum[i]) / seg.len[i]));
  return width[i] + t * (width[i + 1] - width[i]);
 };
}

/**
 * A Course over the world polyline xy (flat [x0, y0, x1, y1, ...], world metres, at least two points) with arc-length
 * s and perpendicular d (left positive). opts: width (m, a number, or a Float64Array with one per point), terrain
 * (for fallLine; null: the tangent), startS and finishS (m of s, default the start and the end), kickers and rails
 * (finished Course entries, copied and frozen). Frozen and stateless; centreline() returns copies
 * of its points and their arc lengths.
 */
export function polylineCourseFromWorld(xy, opts = {}) {
 const { width, terrain = null, kickers = [], rails = [] } = opts;
 if (!(xy instanceof Float64Array) || xy.length < 4 || !xy.every(Number.isFinite)) {
  throw new Error('polyline course: the centreline needs at least two finite [x, y] points in metres');
 }
 const seg = segmentsOf(xy);
 const length = seg.cum[seg.n];
 const startS = opts.startS ?? 0;
 const finishS = opts.finishS ?? length;
 if (!(length > 0)) throw new Error('polyline course: the centreline has no length');
 if (!(startS >= 0 && startS < finishS && finishS <= length)) {
  throw new Error('polyline course: startS and finishS must satisfy 0 <= startS < finishS <= ' + length);
 }
 const isWidthOk = width instanceof Float64Array ? width.length === xy.length / 2 && width.every(isPositive)
  : isPositive(width);
 if (!isWidthOk) throw new Error('polyline course: width must be a positive number of metres (or one per point)');
 const grid = gridOf(seg);
 const widthAt = widthFn(width, seg);
 const lastSegment = seg.n - 1;
 // (x, y world m, out) -> out.s (m along), out.d (m across, left positive), out.tx, out.ty (unit tangent)
 function project(px, py, out) {
  const i = nearestSegment(seg, grid, px, py);
  const ox = px - seg.ax[i];
  const oy = py - seg.ay[i];
  let along = ox * seg.ux[i] + oy * seg.uy[i];
  if (i > 0) along = Math.max(0, along);
  if (i < lastSegment) along = Math.min(seg.len[i], along);
  out.s = seg.cum[i] + along;
  out.d = oy * seg.ux[i] - ox * seg.uy[i];
  out.tx = seg.ux[i];
  out.ty = seg.uy[i];
  return out;
 }
 // (s, d m, out) -> out.x, out.y world m
 function point(s, d, out) {
  const i = segmentAt(seg.cum, seg.n, s);
  const along = s - seg.cum[i];
  out.x = seg.ax[i] + seg.ux[i] * along - seg.uy[i] * d;
  out.y = seg.ay[i] + seg.uy[i] * along + seg.ux[i] * d;
  return out;
 }
 function fallLine(x, y, out) {
  let slope = 0;
  if (terrain) {
   terrain.gradient(x, y, out);
   slope = Math.hypot(out.gx, out.gy);
  } else {
   out.gx = 0;
   out.gy = 0;
  }
  if (slope > FLAT_SLOPE) {
   out.fx = -out.gx / slope;
   out.fy = -out.gy / slope;
  } else {
   project(x, y, out);
   out.fx = out.tx;
   out.fy = out.ty;
  }
  out.slope = slope;
  out.heading = Math.atan2(out.fy, out.fx);
  return out;
 }
 const kickerList = freezeAll(kickers);
 function kickerAt(s, d) {
  for (const k of kickerList) {
   if (Math.abs(d - k.d) < k.halfWidth && s >= k.s && s < k.s + k.depth) return k;
  }
  return null;
 }
// A copy of the centreline: {xy: world [x0, y0, ...] m, s: arc length m at each point}.
 const centreline = () => ({ xy: Float64Array.from(xy), s: Float64Array.from(seg.cum) });
 return Object.freeze({
  length, startS, finishS, kickers: kickerList, rails: freezeAll(rails),
  project, point, fallLine, kickerAt, widthAt, centreline,
 });
}

/**
 * A Course over a centreline given on a map's grid (flat [u0, v0, u1, v1, ...], metres), placed in the world by frame
 * (world/map-frame.js, default placement). Options as polylineCourseFromWorld.
 */
export function createPolylineCourse(gridXy, opts = {}) {
 const frame = opts.frame || DEFAULT_FRAME;
 const out = { x: 0, y: 0 };
 const xy = new Float64Array(gridXy.length);
 for (let i = 0; i < gridXy.length; i += 2) {
  frame.toWorld(gridXy[i], gridXy[i + 1], out);
  xy[i] = out.x;
  xy[i + 1] = out.y;
 }
 return polylineCourseFromWorld(xy, opts);
}

/**
 * A Course for a real run: ways are arrays of [x, y] world metres (east, north), the pieces of one run in any order
 * and direction. They are joined into one chain in downhill order (heightAt(x, y) -> m, default terrain.height),
 * resampled every spacingM (1 to 2 m, default 1.5), and smoothed where they turn tighter than minRadiusM (default
 * 15 m). The width is `width` (m) or the default for `difficulty` (DIFFICULTY_WIDTH_M). The course runs from s 0
 * (startS) to its length (finishS); opts startS and finishS (m) move them for checkpoints. Throws an Error naming
 * the problem.
 */
function fromRun(ways, opts = {}) {
 const { terrain = null, spacingM = DEFAULT_SPACING_M, minRadiusM = MIN_TURN_RADIUS_M, difficulty = '' } = opts;
 const heightAt = opts.heightAt || (terrain && ((x, y) => terrain.height(x, y)));
 if (!(spacingM >= MIN_SPACING_M && spacingM <= MAX_SPACING_M)) {
  throw new Error('Course.fromRun: spacingM must be between ' + MIN_SPACING_M + ' and ' + MAX_SPACING_M + ' m');
 }
 if (!isPositive(minRadiusM)) throw new Error('Course.fromRun: minRadiusM must be a positive number of metres');
 const width = opts.width ?? DIFFICULTY_WIDTH_M[difficulty];
 if (!isPositive(width)) {
  throw new Error('Course.fromRun: give a width (m) or a known difficulty, not "' + difficulty + '"');
 }
 const chain = toPolyline(joinWays(ways, heightAt));
 if (chain.length < 4) throw new Error('Course.fromRun: the run is a single point');
 const xy = smoothRun(chain, minRadiusM, spacingM);
 return polylineCourseFromWorld(xy, { ...opts, width, terrain });
}

/** Ways to make a Course other than the procedural map's: Course.fromRun(ways, opts) (docs/REAL-WORLD-DATA.md R4). */
export const Course = Object.freeze({ fromRun });
