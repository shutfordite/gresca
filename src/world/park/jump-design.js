// Designing a park jump (docs/adr/0012-park-features.md, K1): from a size, the speed the rider has at the lip and the
// base slope, the takeoff, table (or gap) and landing, with the landing sized so a rider at that speed comes down in
// the middle of it. Pure: the flight is the sim's own gravity (JUMP_GRAVITY) over the jump's shape.
import { JUMP_GRAVITY } from '../../core/config.js';
import { PARK_LIMITS } from '../../core/contracts.js';
import { createJumpShape, landingHeight } from './jump-shape.js';

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
const LIP_TRIES = Object.freeze([1, 0.5, 0]); // 0..1, where in its ranges the lip height and angle are tried
const TABLE_SHORT = 0.8;           // share of the table range's least a design may go down to ...
const TABLE_LONG = 1.5;            // ... and times its most it may go up to
const LANDING_LONG = 1.3;          // times the landing range's most
const OFF_SIZE_WEIGHT = 0.5;       // m/s of impact one metre outside the size's table or landing range costs
const TAKEOFF_RUN = 2.5;           // takeoff length as a multiple of 2h / m: a cubic that stays above the snow
const FLIGHT_DT = 1 / 240;         // s, the trajectory's step
const FLIGHT_STEP_M = 0.1;         // m of s between the tabulated points of a free flight
const TABLE_STEP_M = 1.5;           // m, the table lengths tried
const LANDING_STEP_M = 2;          // m, the landing lengths tried
const ANGLE_STEP = 2 * DEG;        // rad, the landing angles tried
const REFINE_PASSES = 3;           // halvings of the search steps around the best design
const MIDDLE_WEIGHT = 4;           // m/s of impact one landing length off the middle costs
const LANDING_SHORT = 0.7;         // a landing may be this share of its range's least (the knuckle stays within limits)
const MIN_STEEPER = 0.05;          // rad, the least a landing is steeper than the slope it ends on
const CLEAR_M = 0.5;               // m past the lip before the flight can touch the snow (the crest's own rounding)
const CLEAR_FROM_M = 2;            // m past the lip from which that clearance is asked
const CLEARANCE_M = 0.3;           // m the flight keeps above the table and the knuckle (a slow rider clears)
const TOUCH_M = 0.03;              // m below the snow before the flight counts as down (the crest's rounding)
const LIFT_OFF_M = 0.4;            // m before the lip where the sim lifts the rider off a rounded crest
const DRAG_PER_SPEED = 0.0035;     // 1/m, the air drag of sim/step.js (it is not exported): fraction lost per s per m/s
const SNOW_FRICTION = 0.02;        // 1/s, and the friction it also applies in the air
const FLIGHT_MAX_M = 150;          // m of s, flights longer than this count as off the end

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

// The jump with the given table length (m), landing length (m) and landing angle (rad), the lip at `at` (0..1 of its
// ranges).
function jumpWith(size, slope, tableM, landingM, landAngle, at, s, d, speed) {
 const row = SIZE_TABLE[size];
 const height = lerp(row.lip, at);
 const lipAngle = lerp(row.lipAngle, at);
 if (!(Math.tan(landAngle) > slope)) {
  const land = (landAngle / DEG).toFixed(0);
  throw new Error('jump ' + size + ': a ' + land + ' degree landing is not steeper than the ' + slope + ' m/m slope');
 }
 const lipSlope = Math.tan(lipAngle) + slope; // m/m, the lip's slope relative to the base snow
 return {
  s,
  d,
  size,
  designSpeed: speed,
  takeoff: { length: TAKEOFF_RUN * height / lipSlope, height, angle: lipAngle, width: row.width },
  table: { length: tableM, gap: row.isGap },
  landing: { height: landingHeight(landingM, landAngle, slope), angle: landAngle, length: landingM },
 };
}

/**
 * The sim's take-off model (sim/jump.js): the rider leaves the snow LIFT_OFF_M before the lip at `speed` m/s horizontal
 * (designSpeed), vertical speed that times the tangent of the snow's slope there, then flies under JUMP_GRAVITY while
 * the horizontal speed loses the air drag of sim/step.js. Over a base snow falling `slope` m/m it first meets the
 * snow at x m of s from the lip. Returns {x, descent (rad below the horizontal), impact (m/s into the snow along its
 * normal)}; x is Infinity when the flight passes FLIGHT_MAX_M.
 */
export function touchdownOf(jump, slope, speed) {
 const shape = createJumpShape(jump, slope);
 const out = { r: 0, dr: 0 };
 const surface = (x) => -slope * x + shape.centre(x, out).r; // m, the snow's altitude over the base at the lip
 let x = -LIFT_OFF_M;
 let z = jump.takeoff.height - LIFT_OFF_M * Math.tan(jump.takeoff.angle);
 let vx = speed;
 let vz = speed * Math.tan(jump.takeoff.angle);
 let nowAbove = 0;
 let before = 0;
 for (let t = 0; x < FLIGHT_MAX_M; t += FLIGHT_DT) {
  before = z - surface(x);
  vx -= (DRAG_PER_SPEED * vx + SNOW_FRICTION) * vx * FLIGHT_DT;
  x += vx * FLIGHT_DT;
  vz -= JUMP_GRAVITY * FLIGHT_DT;
  z += vz * FLIGHT_DT;
  nowAbove = z - surface(x);
  if (x > CLEAR_M && nowAbove <= -TOUCH_M) {
   const share = before / (before - nowAbove);
   const hit = x - vx * FLIGHT_DT * (1 - share);
   shape.centre(hit, out);
   const gradient = out.dr - slope; // m/m, the snow's slope at the touchdown
   const normal = Math.sqrt(1 + gradient * gradient);
   return { x: hit, descent: Math.atan(-vz / vx), impact: (gradient * vx - vz) / normal };
  }
 }
 return { x: Infinity, descent: 0, impact: Infinity };
}

// The free flight of a rider off a lip (the sim's take-off model, see touchdownOf),
// tabulated every FLIGHT_STEP_M of s from the lip to FLIGHT_MAX_M: z (m, altitude over the base snow's level at the
// lip), vx (m/s, horizontal) and descent (rad below the horizontal).
function freeFlight(lipHeight, lipAngle, speed) {
 const count = Math.ceil(FLIGHT_MAX_M / FLIGHT_STEP_M) + 1;
 const z = new Float64Array(count);
 const vxs = new Float64Array(count);
 const descent = new Float64Array(count);
 let x = -LIFT_OFF_M;
 let height = lipHeight - LIFT_OFF_M * Math.tan(lipAngle); // m, the altitude (over the base at the lip) at lift-off
 let vx = speed;
 let vz = speed * Math.tan(lipAngle);
 for (let i = 0; i < count; i++) {
  const target = i * FLIGHT_STEP_M;
  while (x < target) {
   vx -= (DRAG_PER_SPEED * vx + SNOW_FRICTION) * vx * FLIGHT_DT;
   x += vx * FLIGHT_DT;
   vz -= JUMP_GRAVITY * FLIGHT_DT;
   height += vz * FLIGHT_DT;
  }
  z[i] = height;
  vxs[i] = vx;
  descent[i] = Math.atan2(-vz, vx);
 }
 return { z, vx: vxs, descent };
}

// Where the flight (a freeFlight table) first meets the snow of `jump` over a base falling `slope` m/m: {x (m of s from
// the lip), impact (m/s into the snow along its normal)}, or null when it stays clear to the table's end.
function meetSnow(flight, jump, slope) {
 const shape = createJumpShape(jump, slope);
 const out = { r: 0, dr: 0 };
 const speedAt = (x) => flight.vx[Math.round(x / FLIGHT_STEP_M)];
 for (let i = Math.ceil(CLEAR_M / FLIGHT_STEP_M); i < flight.z.length; i++) {
  const x = i * FLIGHT_STEP_M;
  shape.centre(x, out);
  const clearance = flight.z[i] - (out.r - slope * x);
  const keepsClear = x > CLEAR_FROM_M && x < jump.table.length; // over the table the flight keeps clear of the snow
  const margin = keepsClear ? CLEARANCE_M : -TOUCH_M;
  if (clearance > margin) continue;
  const gradient = out.dr - slope; // m/m, the snow's slope there
  const v = speedAt(x);
  const impact = (gradient * v + v * Math.tan(flight.descent[i])) / Math.sqrt(1 + gradient * gradient);
  return { x, impact };
 }
 return null;
}

/**
 * The authored jump (core/contracts.js ParkJump, without world points) of a size, at lip speed `speed` (m/s,
 * horizontal: the sim's take-off model, see touchdownOf) over a base snow falling `slope` m/m along s, with its lip
 * at s and its
 * centre line d m to the left. The lip's height and angle, the table (or gap) and the landing's length are searched
 * within the size's ranges (a little beyond for the table and the landing, which cost impact to leave), and the
 * landing's angle and so its knuckle freely (within the contract's), for the flight that comes down in the middle
 * third of the landing with the least impact into the snow, so the landing there is about the slope the rider meets.
 */
export function designJump({ size, speed, slope, s = 0, d = 0 }) {
 const row = SIZE_TABLE[size];
 if (!row) throw new Error('designJump: unknown size ' + size);
 const floor = Math.atan(slope) + MIN_STEEPER;
 let best = null;
 // costOf(lipAt, flight, angle, landingM, tableM) -> {cost, jump}, or null unless the flight comes down mid-landing
 const costOf = (lipAt, flight, angle, landingM, tableM) => {
  if (angle < floor || angle > PARK_LIMITS.landingAngle.max || tableM <= 0 || landingM <= 0) return null;
  if (landingHeight(landingM, angle, slope) > PARK_LIMITS.landingHeight.max) return null;
  const jump = jumpWith(size, slope, tableM, landingM, angle, lipAt, s, d, speed);
  const hit = meetSnow(flight, jump, slope);
  if (!hit || hit.x < tableM + landingM / 3 || hit.x > tableM + 2 * landingM / 3) return null;
  const cost = Math.abs(hit.impact) + MIDDLE_WEIGHT * Math.abs(hit.x - tableM - landingM / 2) / landingM +
   OFF_SIZE_WEIGHT * (Math.max(0, row.table[0] - tableM) + Math.max(0, tableM - row.table[1]) +
   Math.max(0, row.landing[0] - landingM) + Math.max(0, landingM - row.landing[1]));
  return { cost, jump };
 };
 for (const lipAt of LIP_TRIES) {
  const flight = freeFlight(lerp(row.lip, lipAt), lerp(row.lipAngle, lipAt), speed);
  for (let angle = floor; angle <= PARK_LIMITS.landingAngle.max; angle += ANGLE_STEP) {
   const landingFrom = row.landing[0] * LANDING_SHORT;
   for (let landingM = landingFrom; landingM <= row.landing[1] * LANDING_LONG; landingM += LANDING_STEP_M) {
    for (let tableM = row.table[0] * TABLE_SHORT; tableM <= row.table[1] * TABLE_LONG; tableM += TABLE_STEP_M) {
     const found = costOf(lipAt, flight, angle, landingM, tableM);
     if (found && (!best || found.cost < best.cost)) best = { ...found, lipAt, flight, angle, landingM, tableM };
    }
   }
  }
 }
 if (!best) {
  throw new Error('designJump: no ' + size + ' jump lands a rider at ' + speed + ' m/s on a ' + slope + ' m/m slope');
 }
 // Refine around the best with finer steps, a few times.
 for (let pass = 0; pass < REFINE_PASSES; pass++) {
  const { lipAt, flight, angle, landingM, tableM } = best;
  for (let da = -1; da <= 1; da++) for (let dl = -1; dl <= 1; dl++) for (let dt = -1; dt <= 1; dt++) {
   const found = costOf(lipAt, flight, angle + da * ANGLE_STEP / 2 ** (pass + 1),
    landingM + dl * LANDING_STEP_M / 2 ** (pass + 1), tableM + dt * TABLE_STEP_M / 2 ** (pass + 1));
   if (found && found.cost < best.cost) {
    best = { ...found, lipAt, flight, angle: angle + da * ANGLE_STEP / 2 ** (pass + 1),
     landingM: landingM + dl * LANDING_STEP_M / 2 ** (pass + 1), tableM: tableM + dt * TABLE_STEP_M / 2 ** (pass + 1) };
   }
  }
 }
 return best.jump;
}

/** The size table's row for a size: {lip, lipAngle, table, landAngle, landing, width, isGap}; ranges [least, most]. */
export const sizeSpec = (size) => SIZE_TABLE[size];
