// The contracts the streams meet through: InputState, RiderState and SimEvent (typedefs, field lists, validators).
// Units: metres, seconds, radians. Map axes: +x across the map, +y down the run (until C2's ENU frame).
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
 */

/** InputState fields that a recorded step holds, in this order (core/input-log.js). */
export const INPUT_FIELDS = Object.freeze([
 'left', 'right', 'brake', 'jump', 'steer', 'jumpHeld', 'jumpPressed', 'flip', 'spin',
]);

/**
 * The rider as the sim leaves it after each step (sim/state.js createRider()).
 * @typedef {object} RiderState
 * @property {number} x m across the map
 * @property {number} y m down the map
 * @property {number} vx m/s
 * @property {number} vy m/s
 * @property {number} heading rad, the direction the board points (twin tip: heading + PI is the same board switch)
 * @property {number} z m above the ground
 * @property {number} vz m/s, + up
 * @property {number} airTime s in the air this jump
 * @property {number} rotation rad turned in the air this jump
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
 */

/** Every RiderState field, by the type its value has (grind is null or an object). */
export const RIDER_FIELDS = Object.freeze({
 number: Object.freeze(['x', 'y', 'vx', 'vy', 'heading', 'z', 'vz', 'airTime', 'rotation', 'crashTimer',
  'wipeoutSpin', 'grindDist', 'landings', 'landingSpeed', 'travelHeading', 'boardHeading', 'edge', 'skid',
  'flipRot', 'spinRot']),
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

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Problems with an InputState (an empty list when it meets the contract). */
export function checkInputState(input) {
 const bad = [];
 for (const k of ['left', 'right', 'jump', 'jumpPressed']) {
  if (input[k] !== 0 && input[k] !== 1) bad.push(k + ' is not 0 or 1');
 }
 if (!(isNum(input.brake) && input.brake >= 0 && input.brake <= 1)) bad.push('brake is not in 0..1');
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
