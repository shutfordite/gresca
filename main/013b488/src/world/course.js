// The procedural course: map size, the piste centreline cx(), the finish, the kickers, rails and boxes, and the
// Course (core/contracts.js) over them that everything outside the procedural map uses (createProceduralCourse()).

export const W0 = 1000; // cells (m) across the map
export const H0 = 2450; // cells (m) down the map
export const FIN = 2330; // m, y of the finish line
const START_Y = 60;      // m, y where a run starts
const PISTE_HALF_WIDTH = 26; // m either side of the centreline where the groomed mask is half (world/build.js)
const KICKER_HALF_WIDTH = 9; // m either side of the centreline a kicker launches the rider
const KICKER_LIP_DEPTH = 5;  // m past the lip (along s) where the launch happens
const FLAT_SLOPE = 1e-9;     // m/m, a gradient smaller than this is flat ground (no fall line)

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

/** m/m, the slope of the centreline, d cx / dy at y (m). */
const cxSlope = (y) => 170 / 350 * Math.cos(y / 350) + 70 / 130 * Math.cos(y / 130 + 1);

/**
 * A rail is a straight chord that follows the piste: x0,y0 to its end, unit direction dx,dy, length len (m); in course
 * coordinates it runs from s0 to s1 (m) at d (m across, its offset from the centreline).
 */
function makeRail([ya, n, off, t]) {
 const yb = ya + n;
 const x0 = cx(ya) + off;
 const x1 = cx(yb) + off;
 const len = Math.hypot(x1 - x0, yb - ya);
 return Object.freeze({
  y0: ya, y1: yb, x0, x1, len, s0: ya, s1: yb, d: off, dx: (x1 - x0) / len, dy: (yb - ya) / len,
  h: t === 'box' ? BOX_HEIGHT_M : RAIL_HEIGHT_M, t,
 });
}

/** The rails and boxes, {y0,y1,x0,x1,len,s0,s1,d,dx,dy,h,t}, in RAIL_DEF order (frozen). */
export const RAILS = Object.freeze(RAIL_DEF.map(makeRail));

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

// The kickers in course coordinates: lip at s (m), centred at d (m across), launching within halfWidth (m) across and
// depth (m) past the lip; x, y (m) is the lip's centre on the map.
const KICKERS = Object.freeze(KICK.map((k) => Object.freeze({
 s: k, d: 0, halfWidth: KICKER_HALF_WIDTH, depth: KICKER_LIP_DEPTH, big: KBIG.includes(k), x: cx(k), y: k,
})));

// Writes the unit tangent of the centreline at s (m) into out.tx, out.ty (down the piste).
function tangentAt(s, out) {
 const c = cxSlope(s);
 const n = Math.hypot(c, 1);
 out.tx = c / n;
 out.ty = 1 / n;
 return out;
}

/**
 * The procedural map's Course (core/contracts.js). To keep today's numbers exactly, s = y and d = x - cx(y) (not arc
 * length and perpendicular distance: C1 swaps those in). terrain: the world's Terrain, for fallLine(); null gives a
 * course whose fall line is always the tangent. Frozen and stateless: every query writes into the caller's out.
 */
export function createProceduralCourse(terrain) {
 function project(x, y, out) {
  out.s = y;
  out.d = x - cx(y);
  return tangentAt(y, out);
 }
 function point(s, d, out) {
  out.x = cx(s) + d;
  out.y = s;
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
   tangentAt(y, out);
   out.fx = out.tx;
   out.fy = out.ty;
  }
  out.slope = slope;
  out.heading = Math.atan2(out.fy, out.fx);
  return out;
 }
 function kickerAt(s, d) {
  for (const k of KICKERS) {
   if (Math.abs(d - k.d) < k.halfWidth && s >= k.s && s < k.s + k.depth) return k;
  }
  return null;
 }
 return Object.freeze({
  length: H0, startS: START_Y, finishS: FIN, kickers: KICKERS, rails: RAILS,
  project, point, fallLine, kickerAt, widthAt: () => 2 * PISTE_HALF_WIDTH,
 });
}

/**
 * The procedural course with no terrain (fall line = tangent), for sim functions called without a course (the sim's
 * unit tests). The game always passes world.course. C1 removes it once those tests build their own course.
 */
export const DEFAULT_COURSE = createProceduralCourse(null);
