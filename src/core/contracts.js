// The contracts the streams meet through: InputState, RiderState, SimEvent, Course and AnimInput (typedefs, field
// lists, validators).
// Units: metres, seconds, radians. World axes (docs/adr/0005-enu-frame.md): +x east, +y north, z up; headings are
// radians counter-clockwise from east. Nothing here assumes which way is downhill: ask the Course.
// Fields marked "pre-added" are set to sensible values today but nothing reads them yet: the phase-3 streams start
// using them without editing this file (docs/ROADMAP.md, phase 1 row 3).

/**
 * What the player asks for, made by input/input.js and read by the sim at each step.
 * @typedef {object} InputState
 * @property {number} left 0 or 1, turn (or spin in the air) left: read by the sim today
 * @property {number} right 0 or 1, turn right: read by the sim today
 * @property {number} brake 0..1, brake (0 or 1 today): read by the sim today
 * @property {number} jump 0 or 1, a one-shot jump request the sim clears when it uses it: read by the sim today
 * @property {boolean} both true while both screen halves are held (touch bookkeeping)
 * @property {number} steer -1..1, right minus left (pre-added)
 * @property {boolean} jumpHeld true while a jump control is held (pre-added)
 * @property {number} jumpPressed 0 or 1, set with each new jump request (pre-added; the sim still reads jump)
 * @property {number} flip -1..1, + is a front flip (pre-added, 0 until S1)
 * @property {number} spin -1..1, + spins right (pre-added, 0 until S1)
 * @property {number} lookBack 0..1, how far the player asks the camera to look back uphill (a view request: the sim
 *  ignores it; recorded with the input so replays carry it)
 */

/** InputState fields that a recorded step holds, in this order (core/input-log.js). */
export const INPUT_FIELDS = Object.freeze([
 'left', 'right', 'brake', 'jump', 'steer', 'jumpHeld', 'jumpPressed', 'flip', 'spin', 'lookBack',
]);

/**
 * The rider as the sim leaves it after each step (sim/state.js createRider()).
 * @typedef {object} RiderState
 * @property {number} x m east
 * @property {number} y m north
 * @property {number} vx m/s east
 * @property {number} vy m/s north
 * @property {number} heading rad counter-clockwise from east, the direction the board points (twin tip: heading + PI
 *  is the same board switch)
 * @property {number} z m above the ground
 * @property {number} vz m/s, + up
 * @property {number} airTime s in the air this jump
 * @property {number} rotation rad turned in the air this jump, + to the right (clockwise)
 * @property {boolean} fromKicker this jump was launched by a kicker
 * @property {number} crashTimer s of wipeout left
 * @property {number} wipeoutSpin rad, tumble angle while crashed
 * @property {?object} grind null or {r: rail, t: m along it}
 * @property {number} grindDist m ground this grind
 * @property {number} landings count of touchdowns
 * @property {number} landingSpeed m/s downward at the last touchdown
 * @property {number} travelHeading rad, direction of travel (kept while at rest)
 * @property {number} boardHeading rad, direction the board points (heading today)
 * @property {number} edge rad, edge angle (pre-added, 0 until S2)
 * @property {number} skid m/s, sideways slip on the snow this step (0 in the air, crashed or grinding)
 * @property {number} flipRot rad, flip rotation this jump (pre-added, 0 until S2)
 * @property {number} spinRot rad, spin rotation this jump (rotation today)
 * @property {boolean} isSwitch riding backwards (tail first) faster than 1.5 m/s
 * @property {boolean} isBraking the brake was held on the last step
 * @property {number} fallLine rad, heading of the fall line (steepest way down) under the rider; the course tangent on
 *  flat ground
 * @property {number} downhillSide +1 when the fall line is counter-clockwise from boardHeading (by less than PI), -1
 *  when clockwise, 0 on flat ground (a board pointing straight down the fall line counts as +1)
 */

/** Every RiderState field, by the type its value has (grind is null or an object). */
export const RIDER_FIELDS = Object.freeze({
 number: Object.freeze(['x', 'y', 'vx', 'vy', 'heading', 'z', 'vz', 'airTime', 'rotation', 'crashTimer',
  'wipeoutSpin', 'grindDist', 'landings', 'landingSpeed', 'travelHeading', 'boardHeading', 'edge', 'skid',
  'flipRot', 'spinRot', 'fallLine', 'downhillSide']),
 boolean: Object.freeze(['fromKicker', 'isSwitch', 'isBraking']),
 object: Object.freeze(['grind']),
});

/**
 * Something that happened in one sim step. t: s, session time of the step. Other fields by type:
 * land {speed m/s down, airTime s}; crash {cause 'tree' | 'landing'}; grindStart {rail (index), kind 'rail' | 'box'};
 * grindEnd {rail, kind, dist m, jumped}; flip {} (declared, not emitted yet); brakeStart {}; brakeEnd {};
 * score {points, kind 'air' | 'rail' | 'box', degrees (air: spin rounded to 180)}; finish {time s, score, crashes}.
 * @typedef {{type: string, t: number}} SimEvent
 */

/** The SimEvent types, in the order a run usually meets them. */
export const SIM_EVENT_TYPES = Object.freeze([
 'land', 'crash', 'grindStart', 'grindEnd', 'flip', 'brakeStart', 'brakeEnd', 'score', 'finish',
]);

// The extra fields each SimEvent type carries, and their value types.
const EVENT_FIELDS = Object.freeze({
 land: { speed: 'number', airTime: 'number' },
 crash: { cause: 'string' },
 grindStart: { rail: 'number', kind: 'string' },
 grindEnd: { rail: 'number', kind: 'string', dist: 'number', jumped: 'boolean' },
 flip: {},
 brakeStart: {},
 brakeEnd: {},
 score: { points: 'number', kind: 'string', degrees: 'number' },
 finish: { time: 'number', score: 'number', crashes: 'number' },
});

/**
 * The piste the rider follows, in along (s) and across (d) coordinates. Everything outside the map's own files asks the
 * course, never cx(), the finish y or "+y is downhill". Callers may assume only that s is metres increasing down the
 * piste and d is metres across it, positive on the side of heading + PI/2 from the tangent (counter-clockwise: the
 * rider's left facing down the piste; grid +x on the procedural map). Positions and directions are world metres. The
 * procedural course is a polyline over cx(y) (C1): s is arc length and d perpendicular distance.
 * Every query writes into the caller's out (no allocation) and returns it.
 * @typedef {object} Course
 * @property {function(number, number, object): {s: number, d: number, tx: number, ty: number}} project
 *  (x, y m, out) -> s m along, d m across, tx, ty the unit tangent (down the piste) at s
 * @property {function(number, number, object): {x: number, y: number}} point (s, d m, out) -> x, y world m
 * @property {function(number, number, object): {fx: number, fy: number, heading: number, slope: number}} fallLine
 *  (x, y m, out) -> unit horizontal downhill direction fx, fy, its heading (rad), slope (m/m; 0 on flat ground, where
 *  the direction is the course tangent); out also gets gx, gy (m/m), the gradient it came from
 * @property {function(number): number} widthAt (s m) -> m, the piste's width at s
 * @property {number} length m of s the course covers (from 0)
 * @property {number} startS m, s where a run starts
 * @property {number} finishS m, s of the finish line (riding past it finishes the run)
 * @property {ReadonlyArray<{s: number, d: number, halfWidth: number, depth: number, big: boolean, launchGain?: number}>}
 *  kickers frozen, in s order: lip at s, centred at d, launching within halfWidth across and depth past the lip (m);
 *  launchGain (optional, dimensionless) multiplies the launch speed up, replacing the big-kicker gain (sim/jump.js)
 * @property {ReadonlyArray<{s0: number, s1: number, d: number, x0: number, y0: number, x1: number, y1: number,
 *  dx: number, dy: number, len: number, h: number, t: string}>} rails frozen rails and boxes: s0..s1 at d (m), and
 *  their world geometry (m, unit direction, length m, top height m, 'rail' | 'box')
 * @property {function(number, number): ?object} kickerAt (s, d m) -> the kicker whose launch zone holds (s, d), or null
 */

/** The Course members, by the type their value has. */
export const COURSE_FIELDS = Object.freeze({
 function: Object.freeze(['project', 'point', 'fallLine', 'widthAt', 'kickerAt']),
 number: Object.freeze(['length', 'startS', 'finishS']),
 list: Object.freeze(['kickers', 'rails']),
});

/**
 * What the rider animation needs from the sim each frame (sim/anim-input.js animInput()), on top of the drawn pose.
 * @typedef {object} AnimInput
 * @property {boolean} wiped crashed
 * @property {boolean} grinding on a rail or box
 * @property {boolean} braking the brake was held on the last step
 * @property {number} speed m/s over the snow
 * @property {number} travelDir rad, direction of travel (the board heading below 0.5 m/s)
 * @property {number} facing rad, the way the rider faces (board heading, turned by PI for a goofy snowboarder)
 * @property {number} riderSide +1 when the rider faces the way of travel, -1 when backwards
 * @property {number} impact m/s downward at the last touchdown
 * @property {number} landings count of touchdowns
 * @property {boolean} approach fast, lined up with a kicker and within its approach run (the view adds "on the snow")
 */

/** Every AnimInput field, by the type its value has. */
export const ANIM_INPUT_FIELDS = Object.freeze({
 number: Object.freeze(['speed', 'travelDir', 'facing', 'riderSide', 'impact', 'landings']),
 boolean: Object.freeze(['wiped', 'grinding', 'braking', 'approach']),
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Problems with an InputState (an empty list when it meets the contract). */
export function checkInputState(input) {
 const bad = [];
 for (const k of ['left', 'right', 'jump', 'jumpPressed']) {
  if (input[k] !== 0 && input[k] !== 1) bad.push(k + ' is not 0 or 1');
 }
 for (const k of ['brake', 'lookBack']) {
  if (!(isNum(input[k]) && input[k] >= 0 && input[k] <= 1)) bad.push(k + ' is not in 0..1');
 }
 for (const k of ['steer', 'flip', 'spin']) {
  if (!(isNum(input[k]) && input[k] >= -1 && input[k] <= 1)) bad.push(k + ' is not in -1..1');
 }
 for (const k of ['both', 'jumpHeld']) if (typeof input[k] !== 'boolean') bad.push(k + ' is not a boolean');
 return bad;
}

/** Problems with a RiderState (an empty list when it meets the contract). */
export function checkRiderState(rider) {
 const bad = [];
 for (const k of RIDER_FIELDS.number) if (!isNum(rider[k])) bad.push(k + ' is not a finite number');
 for (const k of RIDER_FIELDS.boolean) if (typeof rider[k] !== 'boolean') bad.push(k + ' is not a boolean');
 if (rider.grind !== null && typeof rider.grind !== 'object') bad.push('grind is not null or an object');
 return bad;
}

/** Problems with a SimEvent (an empty list when it meets the contract). */
export function checkSimEvent(event) {
 const fields = EVENT_FIELDS[event.type];
 if (!fields) return ['unknown type ' + event.type];
 const bad = [];
 if (!isNum(event.t) || event.t < 0) bad.push(event.type + '.t is not a time');
 for (const k in fields) {
  const v = event[k];
  const ok = fields[k] === 'number' ? isNum(v) : typeof v === fields[k];
  if (!ok) bad.push(event.type + '.' + k + ' is not a ' + fields[k]);
 }
 return bad;
}

/** Problems with a Course (an empty list when it meets the contract): members, frozen lists, a round trip. */
export function checkCourse(course) {
 const bad = [];
 for (const k of COURSE_FIELDS.function) if (typeof course[k] !== 'function') bad.push(k + ' is not a function');
 for (const k of COURSE_FIELDS.number) if (!isNum(course[k])) bad.push(k + ' is not a finite number');
 for (const k of COURSE_FIELDS.list) {
  if (!Array.isArray(course[k]) || !Object.isFrozen(course[k])) bad.push(k + ' is not a frozen list');
 }
 if (bad.length) return bad;
 if (!(course.startS >= 0 && course.startS < course.finishS && course.finishS <= course.length)) {
  bad.push('startS, finishS and length are out of order');
 }
 for (const k of course.kickers) {
  if (!['s', 'd', 'halfWidth', 'depth'].every((f) => isNum(k[f])) || typeof k.big !== 'boolean') {
   bad.push('a kicker is not {s, d, halfWidth, depth, big}');
  }
 }
 for (const r of course.rails) {
  if (!['s0', 's1', 'd', 'x0', 'y0', 'len'].every((f) => isNum(r[f]))) bad.push('a rail has no s0, s1, d');
 }
 const p = course.project(0, 0, {});
 const q = course.point(course.startS, 0, {});
 const back = course.project(q.x, q.y, {});
 const isRoundTrip = Math.abs(back.s - course.startS) < 1e-6 && Math.abs(back.d) < 1e-6;
 if (!isRoundTrip) bad.push('project(point(s, d)) is not (s, d)');
 if (!(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-9)) bad.push('the tangent is not a unit vector');
 if (!isNum(course.widthAt(course.startS))) bad.push('widthAt is not a number');
 return bad;
}

/** Problems with an AnimInput (an empty list when it meets the contract). */
export function checkAnimInput(a) {
 const bad = [];
 for (const k of ANIM_INPUT_FIELDS.number) if (!isNum(a[k])) bad.push(k + ' is not a finite number');
 for (const k of ANIM_INPUT_FIELDS.boolean) if (typeof a[k] !== 'boolean') bad.push(k + ' is not a boolean');
 return bad;
}
