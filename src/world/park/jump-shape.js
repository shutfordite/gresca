// The snow shape of a park jump (docs/adr/0012-park-features.md): its height above the base snow at any point, from
// the authored fields. Pure: no DOM, no state; a shape is a frozen record and sample() fills the caller's out.
//
// THE SURFACE (one definition for K1's stamped snow and K3's rail contact): every height here is metres above the
// BASE snow, the terrain without its features layer (`heightAt` of resolveFeatures, ADR 0012). The stamped snow is
// base + this height; a rail's world point is base + its h. Nothing else is added, so nothing counts twice.
//
// Along the jump, x is metres of s from the lip (x < 0 before it). The profile, in order:
//  - drop-in (XL only): a hump the rider climbs onto, a deck, and a steep roll-in down to the base snow;
//  - takeoff: from the base snow (level with it, no slope of its own) curving up to the lip: height h and an exit
//    `angle` above the horizontal, whatever the base slope g (m/m, downhill) is, so the rise is relative to the snow;
//  - table: a straight surface from the lip (h) to the knuckle (landing.height), or a gap: the snow falls to the base
//    snow and rises again in front of the knuckle;
//  - landing: from the knuckle, `landing.angle` below the horizontal at first, flattening smoothly into the base
//    snow at the foot (the bottom); past the foot there is nothing: the run-out is the base snow itself.
// Across, d is metres to the left of the centre line: full height within the jump's half width (the landing widens a
// quarter), then groomed sidewalls fall to the base snow.

const LANDING_WIDEN = 0.25;    // share of the half width the landing is wider than the takeoff and table, at its middle
const GAP_LIP_WALL_M = 1.5;    // m of s over which a gap's snow falls away behind the lip
const GAP_FACE_MIN_M = 1.5;    // m of s, the least a gap's landing face takes to rise to the knuckle
const GAP_FACE_PER_M = 0.35;   // m of s per m of knuckle height: the landing face's run
const SIDEWALL_MIN_M = 1.5;    // m across, the narrowest groomed sidewall
const SIDEWALL_MAX_M = 4.5;    // m across, the widest
const SIDEWALL_BASE_M = 0.9;   // m across, a sidewall's width at no height
const SIDEWALL_PER_M = 0.6;    // m across per m of the jump's peak height
// An XL jump's built drop-in, in m: the hump it rides up onto, a deck, then a steep roll-in down to the takeoff.
export const DROP_IN = Object.freeze({ height: 4.5, rise: 12, deck: 6, drop: 20 });

const smooth = (t) => t * t * (3 - 2 * t);
const smoothSlope = (t) => 6 * t * (1 - t);

// The takeoff's constants: a cubic from the base snow (no height, no slope) to the lip (height h, relative slope m).
function takeoffTerms(takeoff, slope) {
 const m = Math.tan(takeoff.angle) + slope; // m/m, the lip's slope relative to the base snow
 const len = takeoff.length;
 return { len, a: (3 * takeoff.height - m * len) / (len * len), b: (m - 2 * takeoff.height / len) / (len * len) };
}

// Fills out.r (m above the base snow) and out.dr (m/m) of the drop-in at x m from the lip, which starts `end` m of s
// before it: a hump up, a deck, then the roll-in down.
function dropInAt(x, end, out) {
 const dropStart = end - DROP_IN.drop;
 const deckStart = dropStart - DROP_IN.deck;
 const riseStart = deckStart - DROP_IN.rise;
 out.r = 0;
 out.dr = 0;
 if (x <= riseStart || x >= end) return;
 if (x < deckStart) {
  const t = (x - riseStart) / DROP_IN.rise;
  out.r = DROP_IN.height * smooth(t);
  out.dr = DROP_IN.height * smoothSlope(t) / DROP_IN.rise;
 } else if (x < dropStart) {
  out.r = DROP_IN.height;
 } else {
  const t = (x - dropStart) / DROP_IN.drop;
  out.r = DROP_IN.height * (1 - smooth(t));
  out.dr = -DROP_IN.height * smoothSlope(t) / DROP_IN.drop;
 }
}

// The table or gap between the lip and the knuckle at x (0 to T).
function tableAt(x, jump, out) {
 const T = jump.table.length;
 const h = jump.takeoff.height;
 const K = jump.landing.height;
 if (!jump.table.gap) {
  out.r = h + (K - h) * x / T;
  out.dr = (K - h) / T;
  return;
 }
 const lipWall = Math.min(GAP_LIP_WALL_M, T / 2);
 const face = Math.min(Math.max(GAP_FACE_MIN_M, GAP_FACE_PER_M * K), T / 2);
 if (x < lipWall) {
  const t = x / lipWall;
  out.r = h * (1 - smooth(t));
  out.dr = -h * smoothSlope(t) / lipWall;
 } else if (x > T - face) {
  const t = (x - (T - face)) / face;
  out.r = K * smooth(t);
  out.dr = K * smoothSlope(t) / face;
 } else {
  out.r = 0;
  out.dr = 0;
 }
}

// The landing at u = 0..1 along it: a cubic from the knuckle (height K, slope matching `angle` below the horizontal)
// into the base snow (no height, no slope) at the foot. Never below the base snow.
function landingAt(u, jump, slope, out) {
 const K = jump.landing.height;
 const len = jump.landing.length;
 const s0 = (slope - Math.tan(jump.landing.angle)) * len; // m, the knuckle's slope relative to the base, times len
 const r = K * (1 - 3 * u * u + 2 * u * u * u) + s0 * (u - 2 * u * u + u * u * u);
 if (r <= 0) {
  out.r = 0;
  out.dr = 0;
  return;
 }
 out.r = r;
 out.dr = (K * (-6 * u + 6 * u * u) + s0 * (1 - 4 * u + 3 * u * u)) / len;
}

/**
 * A jump's snow shape over a base slope. jump: ParkJump fields (core/contracts.js, no world points needed); slope: m/m,
 * how fast the base snow falls along s at the jump (positive downhill). Returns a frozen shape:
 *  - lengths (m of s): back, the start of the snow before the lip (the takeoff, and the drop-in of an XL), and front,
 *    its end past the lip (the foot of the landing); half, the half width (m) including the sidewalls;
 *  - centre(x, out): fills out.r (m above the base snow) and out.dr (m/m) on the centre line, x m of s from the lip;
 *  - sample(x, d, out): fills out.h (m above the base snow), out.dhdx and out.dhdd (m/m, along s and to the left) at
 *    x m of s from the lip and d m to the left of the centre line (0 outside the footprint).
 */
export function createJumpShape(jump, slope) {
 const takeoff = takeoffTerms(jump.takeoff, slope);
 const T = jump.table.length;
 const len = jump.landing.length;
 const hasDropIn = jump.size === 'xl';
 const dropEnd = -takeoff.len; // m, where the drop-in meets the takeoff
 const halfWidth = jump.takeoff.width / 2;
 const peak = Math.max(jump.takeoff.height, jump.landing.height, hasDropIn ? DROP_IN.height : 0);
 const wall = Math.min(SIDEWALL_MAX_M, Math.max(SIDEWALL_MIN_M, SIDEWALL_BASE_M + SIDEWALL_PER_M * peak));
 const back = takeoff.len + (hasDropIn ? DROP_IN.rise + DROP_IN.deck + DROP_IN.drop : 0);
 const front = T + len;
 const scratch = { r: 0, dr: 0 };
 function centre(x, out) {
  if (x < -back || x >= front) {
   out.r = 0;
   out.dr = 0;
  } else if (x < dropEnd) {
   dropInAt(x, dropEnd, out);
  } else if (x < 0) {
   const u = x + takeoff.len;
   out.r = takeoff.a * u * u + takeoff.b * u * u * u;
   out.dr = 2 * takeoff.a * u + 3 * takeoff.b * u * u;
  } else if (x < T) {
   tableAt(x, jump, out);
  } else {
   landingAt((x - T) / len, jump, slope, out);
  }
  return out;
 }
 const widenFrom = T;
 const widenLen = len / 2;
 function sample(x, d, out) {
  out.h = 0;
  out.dhdx = 0;
  out.dhdd = 0;
  if (x <= -back || x >= front) return out;
  const wide = x > widenFrom ? Math.min(1, (x - widenFrom) / widenLen) : 0;
  const half = halfWidth * (1 + LANDING_WIDEN * wide);
  const over = Math.abs(d) - half;
  if (over >= wall) return out;
  centre(x, scratch);
  const t = over > 0 ? over / wall : 0;
  const side = 1 - smooth(t);
  const dSide = over > 0 ? -smoothSlope(t) / wall : 0; // per m of `over`
  const dHalf = x > widenFrom && x < widenFrom + widenLen ? halfWidth * LANDING_WIDEN / widenLen : 0;
  out.h = scratch.r * side;
  out.dhdx = scratch.dr * side - scratch.r * dSide * dHalf;
  out.dhdd = scratch.r * dSide * (d < 0 ? -1 : 1);
  return out;
 }
 return Object.freeze({
  size: jump.size,
  back,
  front,
  half: halfWidth * (1 + LANDING_WIDEN) + wall,
  centre,
  sample,
 });
}
