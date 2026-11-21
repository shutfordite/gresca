// The procedural test slope: map size, the piste centreline cx(), the finish, the kickers, rails and boxes, and the
// Course (core/contracts.js) over any procedural layout (createGridCourse(layout); createProceduralCourse() is the
// test slope's). A layout (TEST_LAYOUT here, PLAY_LAYOUT in play-slope.js) is the frozen parameter set of one map.
// Everything here is authored on the map's grid (x across, y down the piste: grid u and v); the Course answers in
// world metres (east, north), through the map frame (world/map-frame.js, docs/adr/0005-enu-frame.md).
import { DEFAULT_FRAME } from './map-frame.js';
import { createPolylineCourse } from './polyline-course.js';

export const W0 = 1000; // cells (m) across the map
export const H0 = 2450; // cells (m) down the map
export const FIN = 2330; // m, y of the finish line
const START_Y = 60;      // m, y where a run starts
const PISTE_HALF_WIDTH = 26; // m either side of the centreline where the groomed mask is half (world/build.js)
const KICKER_HALF_WIDTH = 9; // m either side of the centreline a kicker launches the rider
const KICKER_LIP_DEPTH = 5;  // m past the lip (along s) where the launch happens
const LIP_EPS_M = 1e-6;       // m, rounding allowed at the lip edge (the lip's own centre rounds to either side)
const BISECT_STEPS = 100;    // halvings that place the centreline's first vertex (to machine precision)

// Terrain park. Kickers launch fast riders; KBIG ones have taller ramps and give more air. Values are y of the lip, m.
export const KICK = Object.freeze([260, 340, 400, 760, 840, 920, 1060, 1250, 1400, 1560, 1680, 1850, 1990, 2150]);
export const KBIG = Object.freeze([400, 920, 1250, 1680, 2150]);

// Rails and boxes: [start y (m), length (m), offset from the piste centreline (m), type]. They sit between the kickers.
export const RAIL_DEF = Object.freeze([
 [285, 20, -9, 'rail'], [355, 18, 9, 'box'], [775, 22, -9, 'rail'], [855, 18, 9, 'box'], [940, 24, -9, 'rail'],
 [1080, 16, 9, 'box'], [1125, 22, -9, 'rail'], [1275, 20, 9, 'rail'], [1420, 24, -9, 'box'], [1590, 20, 9, 'rail'],
 [1700, 22, -9, 'rail'], [1880, 18, 9, 'box'], [2020, 24, -9, 'rail'],
].map((r) => Object.freeze(r)));

const RAIL_HEIGHT_M = 0.75; // m, top of a rail above the snow
const BOX_HEIGHT_M = 0.55;  // m, top of a box above the snow

/** m, x of the piste centreline at y (m). */
export const cx = (y) => 500 + 170 * Math.sin(y / 350) + 70 * Math.sin(y / 130 + 1);

/**
 * A rail is a straight chord that follows the piste: x0,y0 to its end, unit direction dx,dy, length len (m), on the
 * grid; in course coordinates it runs from s0 to s1 (m) at d (m across, its offset from the centreline).
 */
function makeRail(cx, [ya, n, off, t]) {
 const yb = ya + n;
 const x0 = cx(ya) + off;
 const x1 = cx(yb) + off;
 const len = Math.hypot(x1 - x0, yb - ya);
 return Object.freeze({
  y0: ya, y1: yb, x0, x1, len, s0: ya, s1: yb, d: off, dx: (x1 - x0) / len, dy: (yb - ya) / len,
  h: t === 'box' ? BOX_HEIGHT_M : RAIL_HEIGHT_M, t,
 });
}

/**
 * The rails and boxes on the grid, {y0,y1,x0,x1,len,s0,s1,d,dx,dy,h,t}, for defs [start y, length, offset, type] along
 * the centreline cx(y) (frozen).
 */
export const defineRails = (cx, defs) => Object.freeze(defs.map((r) => makeRail(cx, r)));

/** The test slope's rails and boxes on the grid, in RAIL_DEF order (frozen). */
export const RAILS = defineRails(cx, RAIL_DEF);

/** m, the kicker ramp height added at (px,py): a curved rise up to the lip, then a short drop. */
export function bump(px, py) {
 let h = 0;
 for (const k of KICK) {
  if (py < k - 11 || py > k + 4) continue;
  const d = Math.abs(px - cx(py));
  if (d > 10) continue;
  const hk = KBIG.includes(k) ? 2.2 : 1.3;
  const u = py < k ? Math.pow((py - (k - 11)) / 11, 1.5) : 1 - (py - k) / 4;
  const w = d < 7 ? 1 : 1 - (d - 7) / 3;
  h += hk * u * w;
 }
 return h;
}

// m, the chord length of the sampled centreline from y yFirst (m) to the run start, one vertex per whole metre of y.
function arcToStart(cx, yFirst, startY) {
 let len = 0;
 let px = cx(yFirst);
 let py = yFirst;
 for (let y = Math.floor(yFirst) + 1; y <= startY; y++) {
  len += Math.hypot(cx(y) - px, y - py);
  px = cx(y);
  py = y;
 }
 return len;
}

// The centreline on the grid, flat [u0, v0, ...]: a vertex at every whole metre of y down to the map's end, the first
// one placed so that the arc length from it to the run start is exactly START_Y. That keeps startS = 60 and every
// vertex on a kicker's or rail's y, so they sit where they always did. Returns {xy, first}: first is the whole y of
// the second vertex, minus one (vertex i >= 1 is at y = first + i).
function sampleCentreline(cx, H0, startY) {
 let lo = 0;
 let hi = startY;
 for (let i = 0; i < BISECT_STEPS; i++) {
  const mid = (lo + hi) / 2;
  if (arcToStart(cx, mid, startY) > startY) lo = mid;
  else hi = mid;
 }
 const yFirst = (lo + hi) / 2;
 const first = Math.floor(yFirst);
 const xy = new Float64Array((H0 - first + 1) * 2);
 xy[0] = cx(yFirst);
 xy[1] = yFirst;
 for (let y = first + 1; y <= H0; y++) {
  xy[2 * (y - first)] = cx(y);
  xy[2 * (y - first) + 1] = y;
 }
 return { xy, first };
}

// The kickers in course coordinates: lip at s (m) on the centreline (d 0), lipY (m) its grid y, launching within halfWidth (m across) and
// depth (m along) past the lip; x, y (m) is the lip's centre in the world. sOfY(y): the s of the vertex at grid y.
function makeKickers(layout, frame, sOfY) {
 return layout.KICK.map((k) => {
  const p = frame.toWorld(layout.cx(k), k, { x: 0, y: 0 });
  const big = layout.KBIG.includes(k);
  const kicker = { s: sOfY(k), d: 0, lipY: k, halfWidth: layout.kickerHalfWidth, depth: layout.kickerDepth, big,
   x: p.x, y: p.y };
  if (layout.launchGain) kicker.launchGain = big ? layout.launchGain.big : layout.launchGain.small;
  return kicker;
 });
}

// A grid rail (RAILS) in the world: x0, y0, x1, y1 its ends (m), dx, dy its unit direction, y0 and y1 now world y;
// s0 to s1 (m along) and d (m across, at its middle) from the base course, which has no rails.
function placeRail(r, frame, base) {
 const a = frame.toWorld(r.x0, r.y0, { x: 0, y: 0 });
 const b = frame.toWorld(r.x1, r.y1, { x: 0, y: 0 });
 const dir = frame.vecToWorld(r.dx, r.dy, { x: 0, y: 0 });
 const pa = base.project(a.x, a.y, {});
 const pb = base.project(b.x, b.y, {});
 return { ...r, x0: a.x, y0: a.y, x1: b.x, y1: b.y, dx: dir.x, dy: dir.y, s0: pa.s, s1: pb.s, d: (pa.d + pb.d) / 2 };
}

// The launch zone of a kicker is its ramp's footprint: build.js stamps the ramps in grid rows, so (s, d) is turned
// into the grid and tested there: y from the lip to depth past it, within halfWidth of the centreline across.
function rampZone(frame, cx) {
 const at = { u: 0, v: 0 };
 const world = { x: 0, y: 0 };
 return (k, s, d, point) => {
  point(s, d, world);
  frame.toGrid(world.x, world.y, at);
  return at.v >= k.lipY - LIP_EPS_M && at.v < k.lipY + k.depth && Math.abs(at.u - cx(at.v)) < k.halfWidth;
 };
}

/**
 * The test slope's layout: the parameter set of its map (the numbers above), frozen. W, H: the grid (cells, m); FIN:
 * y of the finish (m); startY (m); pisteHalfWidth (m, where the groomed mask is half); kickerHalfWidth, kickerDepth
 * (m); launchGain (optional {big, small}: dimensionless launch speed gains, sim/jump.js); cx(y), KICK, KBIG,
 * RAIL_DEF, RAILS, bump(u, v): as above; build.js adds the height fill and the trees' placement.
 */
export const TEST_LAYOUT = Object.freeze({
 id: 'test', W: W0, H: H0, FIN, startY: START_Y, pisteHalfWidth: PISTE_HALF_WIDTH,
 kickerHalfWidth: KICKER_HALF_WIDTH, kickerDepth: KICKER_LIP_DEPTH, cx, KICK, KBIG, RAIL_DEF, RAILS, bump,
});

/**
 * The Course (core/contracts.js) of a procedural layout (TEST_LAYOUT, PLAY_LAYOUT), in world metres: a polyline
 * course (world/polyline-course.js) over the centreline cx(y) sampled at every metre of y, so s is arc length and d
 * the perpendicular distance, with the
 * park (kickers, rails) and the finish placed where they always were on the map; a kicker launches over its ramp
 * footprint on the grid, as on main. terrain: the world's Terrain, for
 * fallLine(); null gives a course whose fall line is always the tangent. frame: the MapFrame placing the grid in the
 * world (default: the piste runs south). Frozen and stateless: every query writes into the caller's out.
 */
export function createGridCourse(layout, terrain, frame = DEFAULT_FRAME) {
 const { cx, H: H0, FIN, startY } = layout;
 const { xy, first } = sampleCentreline(cx, H0, startY);
 const width = 2 * layout.pisteHalfWidth;
 const base = createPolylineCourse(xy, { frame, width, terrain });
 const baseS = base.centreline().s;
 const sOfY = (y) => baseS[y - first]; // m, arc length at the vertex on whole grid y
 return createPolylineCourse(xy, {
  frame, width, terrain, startS: startY, finishS: sOfY(FIN), launchZone: rampZone(frame, cx),
  kickers: makeKickers(layout, frame, sOfY),
  rails: layout.RAILS.map((r) => placeRail(r, frame, base)),
 });
}

/** The test slope's Course: createGridCourse(TEST_LAYOUT, terrain, frame). */
export const createProceduralCourse = (terrain, frame = DEFAULT_FRAME) => createGridCourse(TEST_LAYOUT, terrain, frame);

/**
 * The procedural course with no terrain (fall line = tangent) at the default placement, for sim functions called
 * without a course (the sim's unit tests). The game always passes world.course. C1 removes it once those tests
 * build their own course.
 */
export const DEFAULT_COURSE = createProceduralCourse(null);
