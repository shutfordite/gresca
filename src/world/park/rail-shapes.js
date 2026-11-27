// The park's rail and box shapes (docs/adr/0012-park-features.md): a name and a length to a 3D polyline in (s, d, h),
// the authoring format of a ParkRail. Pure: no DOM, no state. Heights h are metres above the BASE snow, the same
// surface the jump shapes use (park/jump-shape.js), so a rail's contact points and the stamped snow never disagree.
//
// A segment is 'flat' (level in the world, so over a base snow falling `slope` it rises that much relative to the
// snow) or 'down' (falls steeper than the snow). Kinks are where one segment meets the next. A rainbow arches up and
// back; a C-rail bends one way in plan and back, an S-rail bends both ways.
import { PARK_LIMITS } from '../../core/contracts.js';

/** The rail shapes, by name. */
export const RAIL_SHAPES = Object.freeze(['straight', 'down', 'flat-down', 'down-flat-down', 'flat-down-flat',
 'rainbow', 'c-rail', 's-rail']);
/** The box shapes, by name: flat, down, kinked (flat, down, flat) and rainbow. */
export const BOX_SHAPES = Object.freeze(['flat', 'down', 'kinked', 'rainbow']);

const TOP_M = 1.5;               // m, the highest a top may be above the snow (the roadmap: 0.3 to 1.5 m high)
const LOW_M = 0.3;               // m, the lowest
const DOWN_SLOPE = 0.4;          // m/m, how steeply a down segment falls in the world (about 22 degrees)
const DOWN_LEAST_M = 0.15;       // m/m, the least a down segment falls relative to the snow, so it still reads as a kink
const ARCH_M = 0.7;              // m, how high a rainbow rises above its ends
const BEND_SHARE = 0.15;         // the sideways swing of a C or S rail, as a share of its length
const BEND_POINTS = 33;          // points along a bent or arched line (an arc is sampled, not kinked)
const LENGTH_PASSES = 6;         // refinements that bring the 3D length to the one asked for
// Segment runs, as shares of the length, for the shapes made of straight pieces.
const RUNS = Object.freeze({
 straight: [['flat', 1]],
 down: [['down', 1]],
 'flat-down': [['flat', 0.45], ['down', 0.55]],
 'down-flat-down': [['down', 0.3], ['flat', 0.4], ['down', 0.3]],
 'flat-down-flat': [['flat', 0.3], ['down', 0.4], ['flat', 0.3]],
});
const BOX_NAMES = Object.freeze({ flat: 'straight', down: 'down', kinked: 'flat-down-flat', rainbow: 'rainbow' });

// Points {a, t} (m along, relative height before centring) at the ends of a run of straight segments, `extent` m of s
// long, on a base snow falling `slope` m/m.
function runPoints(runs, extent, slope) {
 const points = [{ a: 0, h: 0 }];
 let a = 0;
 let h = 0;
 for (const [kind, share] of runs) {
  const length = extent * share;
  const fall = kind === 'down' ? Math.max(DOWN_SLOPE - slope, DOWN_LEAST_M) : slope; // m/m relative to the snow
  a += length;
  h -= kind === 'down' ? fall * length : -slope * length; // flat rises with the slope, down falls
  points.push({ a, h, lateral: 0 });
 }
 return points;
}

// Points of an arch or a bend: BEND_POINTS along `extent`, h and lateral (m) by shape.
function sampledPoints(shape, extent, slope) {
 const points = [];
 for (let i = 0; i < BEND_POINTS; i++) {
  const t = i / (BEND_POINTS - 1);
  const rise = shape === 'rainbow' ? ARCH_M * Math.sin(Math.PI * t) : 0;
  let lateral = 0;
  if (shape === 'c-rail') lateral = BEND_SHARE * extent * Math.sin(Math.PI * t);
  if (shape === 's-rail') lateral = BEND_SHARE * extent * Math.sin(2 * Math.PI * t);
  points.push({ a: extent * t, h: slope * extent * t + rise, lateral });
 }
 return points;
}

// The points of a shape over `extent` m of s, heights not yet placed in the window.
function rawPoints(shape, extent, slope) {
 return RUNS[shape] ? runPoints(RUNS[shape], extent, slope) : sampledPoints(shape, extent, slope);
}

// Heights shifted (and shrunk about their middle if they span more than the window) to lie between LOW_M and TOP_M.
function placeInWindow(points) {
 let low = Infinity;
 let high = -Infinity;
 for (const p of points) {
  low = Math.min(low, p.h);
  high = Math.max(high, p.h);
 }
 const span = TOP_M - LOW_M;
 const shrink = Math.min(1, span / (high - low || 1));
 const middle = (high + low) / 2;
 const target = (TOP_M + LOW_M) / 2;
 return points.map((p) => ({ a: p.a, lateral: p.lateral || 0, h: target + (p.h - middle) * shrink }));
}

// m, the length of the 3D line through points {a, lateral, h}.
function lengthOf(points) {
 let sum = 0;
 for (let i = 1; i < points.length; i++) {
  sum += Math.hypot(points[i].a - points[i - 1].a, points[i].lateral - points[i - 1].lateral, points[i].h - points[i - 1].h);
 }
 return sum;
}

/**
 * The authored line of a rail or box: {points: [{s, d, h}], profile, width, legs, entry} (core/contracts.js ParkRail,
 * no world points). shape: a RAIL_SHAPES name for a rail, a BOX_SHAPES name for a box (profile 'box'); s, d: m, where
 * it starts; length: m, the 3D length of the line (6 to 20 for the park); slope: m/m, how fast the base snow falls
 * along s there. Tops lie between 0.3 and 1.5 m above the snow.
 */
export function railLine({ shape, profile = 'rail', s, d, length, slope, width, legs = true, entry = 'ramp' }) {
 const name = profile === 'box' ? BOX_NAMES[shape] : RAIL_SHAPES.find((n) => n === shape);
 if (!name) throw new Error('railLine: unknown ' + profile + ' shape ' + shape);
 let extent = length;
 let points = placeInWindow(rawPoints(name, extent, slope));
 for (let i = 0; i < LENGTH_PASSES; i++) {
  extent *= length / lengthOf(points);
  points = placeInWindow(rawPoints(name, extent, slope));
 }
 const count = Math.min(points.length, PARK_LIMITS.railPoints.max);
 return {
  points: points.slice(0, count).map((p) => ({ s: s + p.a, d: d + p.lateral, h: p.h })),
  profile,
  width: width ?? (profile === 'box' ? 0.4 : 0.06),
  legs,
  entry,
 };
}
