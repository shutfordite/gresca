// Run geometry for Course.fromRun (docs/REAL-WORLD-DATA.md R4): join a run's ways into one chain in downhill order,
// resample it at an even spacing, limit its curvature, and measure it. Pure functions on polylines; no I/O.
// A polyline is a flat Float64Array [x0, y0, x1, y1, ...] in metres; a "way" is an array of [x, y] points.

export const JOIN_TOLERANCE_M = 5;  // m, two way ends this close are the same junction (OSM ways meet at shared nodes)
export const MIN_SPACING_M = 1;     // m, the finest resample spacing fromRun accepts
export const MAX_SPACING_M = 2;     // m, the coarsest
const SAME_POINT_M = 1e-9;          // m, points this close are one point
const RADIUS_MARGIN = 1.1;          // smooth to this many times the limit, so resampling cannot break it afterwards
const MASK_VERTICES = 4;            // vertices either side of a too-sharp vertex that one smoothing pass moves
const PULL = 0.5;                   // 0..1, how far a smoothed vertex moves towards the midpoint of its neighbours
const MAX_PASSES = 20000;           // smoothing passes before giving up
const MAX_ROUNDS = 6;               // smooth-then-resample rounds before giving up
const NO_CURVATURE = 0;             // 1/m, the curvature of three points in a line (or two that are one point)

/** Cumulative arc length (m) at every vertex of the polyline xy: a Float64Array, first element 0. */
export function arcLengths(xy) {
 const n = xy.length / 2;
 const cum = new Float64Array(n);
 for (let i = 1; i < n; i++) {
  cum[i] = cum[i - 1] + Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
 }
 return cum;
}

// 1/m, the curvature of the circle through three points (Menger): 0 for a straight line.
function curvature(ax, ay, bx, by, cx, cy) {
 const abx = bx - ax;
 const aby = by - ay;
 const bcx = cx - bx;
 const bcy = cy - by;
 const denom = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(cx - ax, cy - ay);
 if (denom < SAME_POINT_M) return NO_CURVATURE;
 return 2 * Math.abs(abx * bcy - aby * bcx) / denom;
}

/** m, the smallest turn radius at an interior vertex of the polyline xy (Infinity for a straight line). */
export function minTurnRadius(xy) {
 let worst = NO_CURVATURE;
 for (let i = 1; i < xy.length / 2 - 1; i++) {
  const k = curvature(xy[2 * i - 2], xy[2 * i - 1], xy[2 * i], xy[2 * i + 1], xy[2 * i + 2], xy[2 * i + 3]);
  if (k > worst) worst = k;
 }
 return worst === NO_CURVATURE ? Infinity : 1 / worst;
}

// Throws unless way is an array of at least two [x, y] pairs of finite numbers; i is its index for the message.
function checkWay(way, i) {
 if (!Array.isArray(way) || way.length < 2) throw new Error('joinWays: way ' + i + ' needs at least two points');
 way.forEach((p, j) => {
  if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
   throw new Error('joinWays: way ' + i + ' point ' + j + ' is not [x, y] metres');
  }
 });
}

// The way ends (way index and which end) as flat arrays, so the search below allocates once.
function endpoints(ways) {
 const ends = [];
 ways.forEach((way, i) => {
  ends.push({ way: i, atEnd: false, p: way[0] }, { way: i, atEnd: true, p: way[way.length - 1] });
 });
 return ends;
}

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The start of the chain: the highest way end that no other way meets (any end when the ways form a loop).
function pickStart(ends, heightAt, tolM) {
 const free = ends.filter((e) => ends.every((o) => o.way === e.way || gap(o.p, e.p) > tolM));
 const pool = free.length ? free : ends;
 let best = pool[0];
 for (const e of pool) if (heightAt(e.p[0], e.p[1]) > heightAt(best.p[0], best.p[1])) best = e;
 return best;
}

// The points of a way, from its start or from its end.
const oriented = (way, fromEnd) => (fromEnd ? way.slice().reverse() : way.slice());

/**
 * Joins ways (arrays of [x, y] metres) of one run into one chain of [x, y] points in downhill order. The chain starts
 * at the highest free end (heightAt(x, y) -> m) and takes, from each end, the nearest unused way end within tolM; a way
 * is reversed when it is met by its last point. Ways that do not join the chain, or a point that is not [x, y] metres,
 * throw an Error that names the way.
 */
export function joinWays(ways, heightAt, tolM = JOIN_TOLERANCE_M) {
 if (!Array.isArray(ways) || ways.length === 0) throw new Error('joinWays: no ways');
 if (typeof heightAt !== 'function') throw new Error('joinWays: heightAt (x, y -> m) is needed to find downhill');
 ways.forEach(checkWay);
 const ends = endpoints(ways);
 const used = new Array(ways.length).fill(false);
 const first = pickStart(ends, heightAt, tolM);
 let chain = oriented(ways[first.way], first.atEnd);
 used[first.way] = true;
 for (;;) {
  const tip = chain[chain.length - 1];
  let next = null;
  let nextGap = tolM;
  for (const e of ends) {
   const g = used[e.way] ? Infinity : gap(e.p, tip);
   if (g <= nextGap && (next === null || g < nextGap)) {
    next = e;
    nextGap = g;
   }
  }
  if (next === null) break;
  used[next.way] = true;
  const part = oriented(ways[next.way], next.atEnd);
  chain = chain.concat(gap(part[0], tip) < SAME_POINT_M ? part.slice(1) : part);
 }
 const lost = used.indexOf(false);
 if (lost >= 0) throw new Error('joinWays: way ' + lost + ' does not join the chain (gap over ' + tolM + ' m)');
 const top = chain[0];
 const bottom = chain[chain.length - 1];
 return heightAt(top[0], top[1]) < heightAt(bottom[0], bottom[1]) ? chain.reverse() : chain;
}

/** A flat polyline from [x, y] points, dropping repeated points. */
export function toPolyline(points) {
 const kept = points.filter((p, i) => i === 0 || gap(p, points[i - 1]) > SAME_POINT_M);
 const xy = new Float64Array(kept.length * 2);
 kept.forEach((p, i) => {
  xy[2 * i] = p[0];
  xy[2 * i + 1] = p[1];
 });
 return xy;
}

/**
 * The polyline xy resampled at an even spacing (m) along its length: the same ends, spacing as close to spacingM as
 * a whole number of steps allows. Returns a new Float64Array.
 */
export function resample(xy, spacingM) {
 const cum = arcLengths(xy);
 const total = cum[cum.length - 1];
 const steps = Math.max(1, Math.round(total / spacingM));
 const step = total / steps;
 const out = new Float64Array((steps + 1) * 2);
 let seg = 0; // the segment holding the distance walked
 for (let k = 0; k <= steps; k++) {
  const at = k === steps ? total : k * step;
  while (seg < cum.length - 2 && cum[seg + 1] < at) seg++;
  const len = cum[seg + 1] - cum[seg];
  const t = len > 0 ? (at - cum[seg]) / len : 0;
  out[2 * k] = xy[2 * seg] + t * (xy[2 * seg + 2] - xy[2 * seg]);
  out[2 * k + 1] = xy[2 * seg + 1] + t * (xy[2 * seg + 3] - xy[2 * seg + 1]);
 }
 return out;
}

// Marks, in `mask`, the interior vertices within MASK_VERTICES of one whose turn radius is under radiusM. Returns how
// many vertices are too sharp.
function markSharp(xy, radiusM, mask) {
 const n = xy.length / 2;
 const limit = 1 / radiusM;
 mask.fill(0);
 let sharp = 0;
 for (let i = 1; i < n - 1; i++) {
  const k = curvature(xy[2 * i - 2], xy[2 * i - 1], xy[2 * i], xy[2 * i + 1], xy[2 * i + 2], xy[2 * i + 3]);
  if (k <= limit) continue;
  sharp++;
  const lo = Math.max(1, i - MASK_VERTICES);
  const hi = Math.min(n - 2, i + MASK_VERTICES);
  for (let j = lo; j <= hi; j++) mask[j] = 1;
 }
 return sharp;
}

// One smoothing pass: each masked vertex moves PULL of the way to the midpoint of its neighbours (read from `from`,
// written to `to`, both Float64Arrays of the polyline's size).
function smoothPass(from, to, mask) {
 to.set(from);
 for (let i = 1; i < mask.length - 1; i++) {
  if (!mask[i]) continue;
  to[2 * i] = from[2 * i] + PULL * ((from[2 * i - 2] + from[2 * i + 2]) / 2 - from[2 * i]);
  to[2 * i + 1] = from[2 * i + 1] + PULL * ((from[2 * i - 1] + from[2 * i + 3]) / 2 - from[2 * i + 1]);
 }
}

// Smooths xy (not modified) until no vertex turns tighter than radiusM; returns a new polyline of the same size.
function relax(xy, radiusM) {
 let from = Float64Array.from(xy);
 let to = new Float64Array(xy.length);
 const mask = new Uint8Array(xy.length / 2);
 for (let pass = 0; pass < MAX_PASSES; pass++) {
  if (markSharp(from, radiusM, mask) === 0) return from;
  smoothPass(from, to, mask);
  [from, to] = [to, from];
 }
 throw new Error('smoothRun: could not reach a ' + radiusM + ' m turn radius in ' + MAX_PASSES + ' passes');
}

/**
 * The polyline xy with its curvature limited: no interior vertex turns tighter than minRadiusM, and the points are
 * spaced spacingM apart (see resample). Only the sharp stretches are smoothed, so the rest keeps the surveyed line; the
 * two ends do not move. Throws an Error when the limit cannot be reached. Returns a new Float64Array.
 */
export function smoothRun(xy, minRadiusM, spacingM) {
 let line = resample(xy, spacingM);
 for (let round = 0; round < MAX_ROUNDS; round++) {
  if (minTurnRadius(line) >= minRadiusM) return line;
  line = resample(relax(line, minRadiusM * RADIUS_MARGIN), spacingM);
 }
 if (minTurnRadius(line) >= minRadiusM) return line;
 throw new Error('smoothRun: the run still turns tighter than ' + minRadiusM + ' m after ' + MAX_ROUNDS + ' rounds');
}
