// Designing a park jump (docs/adr/0012-park-features.md, K1): from a size, the speed the rider has at the lip and the
// base slope, the takeoff, table (or gap) and landing, with the landing sized so a rider at that speed comes down in
// the middle of it. Pure: the flight is the sim's own gravity (JUMP_GRAVITY) over the jump's shape.
import { JUMP_GRAVITY } from '../../core/config.js';
import { createJumpShape } from './jump-shape.js';

const DEG = Math.PI / 180;
// The roadmap's size table (docs/ROADMAP.md, K), split so XS and S each have their own row. Ranges are [least, most]:
// lip height (m above the base snow), lip angle (rad above the horizontal), table or gap (m of s), landing angle (rad
// below the horizontal at the knuckle) and landing length (m of s); width: m across the takeoff.
const SIZE_TABLE = Object.freeze({
 xs: spec([0.6, 1.0], [15, 20], [3, 4.5], [25, 26.5], [10, 12], 5, false),
 s: spec([1.0, 1.5], [20, 25], [4.5, 6], [26.5, 28], [12, 15], 6, false),
 m: spec([1.5, 2.5], [25, 30], [8, 12], [28, 30], [15, 20], 8, false),
 l: spec([2.5, 4], [28, 32], [14, 20], [30, 32], [20, 28], 10, false),
 xl: spec([4, 8], [30, 35], [20, 30], [32, 35], [30, 40], 14, true),
});
const MID = 0.5;                   // 0..1, where in each range the size's nominal speed is worked out
const LIP_AT = 0.8;                // 0..1, where in its range a jump's lip height and angle sit by default: a tall,
                                   // steep lip ...
const LAND_AT = 0.2;               // ... over a landing angle (so a knuckle height) near the low end
const TAKEOFF_RUN = 2.5;           // takeoff length as a multiple of 2h / m: the gentlest cubic that stays above the snow
const SEARCH_STEPS = 40;           // bisection halvings (to far below a millimetre)
const FLIGHT_STEP_M = 0.02;        // m of s, the trajectory's marching step
const FLIGHT_MAX_M = 120;          // m of s, flights longer than this count as off the end
const SPEED_RANGE = Object.freeze({ min: 4, max: 40 }); // m/s, the speeds nominalSpeed searches

function spec(lip, lipDeg, table, landDeg, landing, width, isGap) {
 return Object.freeze({
  lip: Object.freeze(lip),
  lipAngle: Object.freeze(lipDeg.map((d) => d * DEG)),
  table: Object.freeze(table),
  landAngle: Object.freeze(landDeg.map((d) => d * DEG)),
  landing: Object.freeze(landing),
  width,
  isGap,
 });
}

const lerp = (range, t) => range[0] + (range[1] - range[0]) * t;

// The jump with the given table length (m) and landing length (m), the other dimensions at `at` ({lip, land}: 0..1 of
// their ranges).
function jumpWith(size, slope, tableM, landingM, at, s, d, speed) {
 const row = SIZE_TABLE[size];
 const height = lerp(row.lip, at.lip);
 const lipAngle = lerp(row.lipAngle, at.lip);
 const landAngle = lerp(row.landAngle, at.land);
 const drop = Math.tan(landAngle) - slope; // m/m, how much steeper than the base snow the knuckle falls
 if (!(drop > 0)) throw new Error('jump ' + size + ': a ' + (landAngle / DEG).toFixed(0) + ' degree landing is not steeper than a ' + (Math.atan(slope) / DEG).toFixed(0) + ' degree slope');
 const lipSlope = Math.tan(lipAngle) + slope; // m/m, the lip's slope relative to the base snow
 return {
  s,
  d,
  size,
  designSpeed: speed,
  takeoff: { length: TAKEOFF_RUN * height / lipSlope, height, angle: lipAngle, width: row.width },
  table: { length: tableM, gap: row.isGap },
  // A landing that is a parabola into the base snow stands drop * length / 2 above it at the knuckle.
  landing: { height: drop * landingM / 2, angle: landAngle, length: landingM },
 };
}

/**
 * Where a rider leaving the lip at `speed` (m/s, along the takeoff's exit direction) first meets the snow, in m of s
 * from the lip, over a base snow falling `slope` m/m: JUMP_GRAVITY flight over the jump's own shape. Infinity if the
 * flight goes past the end of the landing's foot by FLIGHT_MAX_M.
 */
export function touchdownOf(jump, slope, speed) {
 const shape = createJumpShape(jump, slope);
 const out = { r: 0, dr: 0 };
 const tan = Math.tan(jump.takeoff.angle);
 const cos = Math.cos(jump.takeoff.angle);
 const curve = JUMP_GRAVITY / (2 * speed * speed * cos * cos); // 1/m, how fast the path bends down
 const above = (x) => jump.takeoff.height + tan * x - curve * x * x - (-slope * x + shape.centre(x, out).r);
 let x = FLIGHT_STEP_M;
 let before = above(0);
 while (x < FLIGHT_MAX_M) {
  const now = above(x);
  if (now <= 0) return x - FLIGHT_STEP_M + FLIGHT_STEP_M * before / (before - now);
  before = now;
  x += FLIGHT_STEP_M;
 }
 return Infinity;
}

// A root of f on [lo, hi] for a decreasing f, or the end it is closest to when f has the same sign all through.
function solveDecreasing(f, lo, hi) {
 if (f(lo) <= 0) return lo;
 if (f(hi) >= 0) return hi;
 let a = lo;
 let b = hi;
 for (let i = 0; i < SEARCH_STEPS; i++) {
  const mid = (a + b) / 2;
  if (f(mid) > 0) a = mid;
  else b = mid;
 }
 return (a + b) / 2;
}

// How far past the middle of the landing the rider comes down (m): positive when the landing is too short.
function pastMiddle(size, slope, tableM, landingM, at, speed) {
 const jump = jumpWith(size, slope, tableM, landingM, at, 0, 0, speed);
 const x = touchdownOf(jump, slope, speed);
 return (Number.isFinite(x) ? x : FLIGHT_MAX_M) - (tableM + landingM / 2);
}

/**
 * The authored jump (core/contracts.js ParkJump, without world points) of a size, at lip speed `speed` (m/s) over a
 * base snow falling `slope` m/m along s, with its lip at s and its centre line d m to the left. The table (or gap) is
 * set within the size's range to put the rider's touchdown in the middle of the landing; if the size's range cannot,
 * the landing's length is set within its range; at its limits the touchdown simply lands where it lands.
 */
export function designJump({ size, speed, slope, s = 0, d = 0, at = { lip: LIP_AT, land: LAND_AT } }) {
 const row = SIZE_TABLE[size];
 if (!row) throw new Error('designJump: unknown size ' + size);
 const midLanding = lerp(row.landing, MID);
 const tableM = solveDecreasing((t) => pastMiddle(size, slope, t, midLanding, at, speed), row.table[0], row.table[1]);
 const landingM = solveDecreasing((l) => pastMiddle(size, slope, tableM, l, at, speed), row.landing[0], row.landing[1]);
 return jumpWith(size, slope, tableM, landingM, at, s, d, speed);
}

/**
 * The lip speed (m/s) at which a jump of `size` on a base snow falling `slope` m/m has a middle table (or gap) and a
 * middle landing: the speed the size is built for.
 */
export function nominalSpeed(size, slope) {
 const row = SIZE_TABLE[size];
 const tableM = lerp(row.table, MID);
 const landingM = lerp(row.landing, MID);
 const f = (v) => -pastMiddle(size, slope, tableM, landingM, { lip: MID, land: MID }, v);
 return solveDecreasing(f, SPEED_RANGE.min, SPEED_RANGE.max);
}

/** The size table's row for a size: {lip, lipAngle, table, landAngle, landing, width, isGap}, ranges as [least, most]. */
export const sizeSpec = (size) => SIZE_TABLE[size];
