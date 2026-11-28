// Jumps: take-off (the jump button, or the snow falling away under the rider), flight in world height, and the
// landing where the flight meets the snow: clean and scored, or a crash.
import { DEFAULT_COURSE } from '../world/course.js';
import { emit } from './particles.js';
import { pushEvent } from './state.js';
import { FLIP, LANDING } from './tuning.js';
import { JUMP_GRAVITY } from '../core/config.js';

const JUMP_SPEED = 6.5;     // m/s up, an ollie from the snow
const CRASH_TIME = 1.1;     // s of wipeout
const MISALIGN_MIN_SPEED = 3; // m/s, slower than this a board across the travel still lands
const MIN_SCORED_AIR = 0.35; // s, shorter hops score nothing
const KICKER_REACH_M = 1;   // m before a kicker's launch zone a lift-off is still its own (the lip's crest is rounded)
const FULL_TURN = 2 * Math.PI; // rad

// A {s, d, tx, ty} scratch object for Course.project (m, m, unit tangent).
const newWhere = () => ({ s: 0, d: 0, tx: 0, ty: 1 });

// The snow under unit calls that pass no terrain: flat, at height 0.
const FLAT_SNOW = Object.freeze({
 height: () => 0,
 gradient: (x, y, out) => {
  out.gx = 0;
  out.gy = 0;
  return out;
 },
});

/**
 * One step of dt (s) of the rider's vertical motion: take-off, flight and landing, over terrain (a Terrain,
 * world/terrain.js: height and gradient with every layer, the park's features included; flat at 0 when omitted).
 * Called after the step has moved the rider by (vx, vy)·dt, so the step started at (x - vx·dt, y - vy·dt).
 * The flight is in world height, under JUMP_GRAVITY: rider.z is m above the snow under the rider (its altitude minus
 * the snow's) and rider.vz is m/s up relative to riding along that snow (the world vertical speed minus the snow's
 * gradient times the velocity), so 0 on the snow, and on an even slope the flight is the same as over the flat.
 * On the snow the rider moves along it, holding it over a roll up to LANDING.HOLD more than gravity (absorbing it);
 * where the snow falls away faster than that (a lip, a sharp roll) it leaves the snow at its motion along the snow,
 * and input.jump is an ollie, JUMP_SPEED up on top of it. The take-off model K1 sizes its jumps against
 * (world/park/): designSpeed is the sim's horizontal speed at the lip, and the take-off velocity is that speed along
 * the rider's heading and that speed times tan(lip angle) up (the snow's gradient along the motion at the lip). In
 * the air the horizontal speed keeps losing step.js's air drag. It lands where the flight meets the snow; the impact
 * is the speed into the snow along its normal (LANDING, sim/tuning.js). Mutates rider, input.jump (the one-shot request it
 * uses up), session (crashes, score, events: land, crash, flip, score), spray (landing snow) and grad (a {gx, gy}
 * scratch object). course (a Course; where: a {s,d,tx,ty} scratch for it) only names the take-off: rider.fromKicker
 * is true when the snow threw the rider inside a kicker's launch zone (course.kickerAt); kickers launch by their shape.
 * Flips (F3): in the air input.flip (-1..1, + front flip) turns rider.flipRot at FLIP.RATE (rad/s), held keeps
 * turning, alongside the spin in rider.rotation. One SimEvent 'flip' ({flips}) goes out on each clean landing of
 * one or more whole rotations, before its 'score' (its flips field is the signed count; ui/trick-names.js names it).
 * Landing within FLIP.LAND_WINDOW of a whole number of rotations is clean, otherwise a crash (cause 'landing'). A
 * clean flip scores FLIP.POINTS * n * (n + 1) / 2 on top of the air score; flipRot is 0 on the snow, on a rail and at
 * every take-off.
 */
export function jumpStep(rider, input, session, spray, dt, course = DEFAULT_COURSE, where = newWhere(),
 terrain = FLAT_SNOW, grad = { gx: 0, gy: 0 }) {
 if (rider.crashTimer > 0) {
  rider.z = 0;
  rider.vz = 0;
  rider.airTime = 0;
  rider.flipRot = 0;
  return;
 }
 if (rider.z > 0) input.jump = 0;
 const x0 = rider.x - rider.vx * dt;
 const y0 = rider.y - rider.vy * dt;
 const rise = terrain.height(rider.x, rider.y) - terrain.height(x0, y0); // m the snow rose under the rider
 const alongStart = alongSnowUp(rider, terrain.gradient(x0, y0, grad)); // m/s up, riding along the snow at the start
 if (rider.z <= 0 && rider.vz <= 0 && !takeOff(rider, input, alongStart, rise, dt)) return;
 if (rider.airTime === 0 && rider.fromKicker) rider.fromKicker = isOnKicker(rider, course, where);
 rider.airTime += dt;
 flipStep(rider, input, dt);
 const vzWorld = rider.vz + alongStart; // m/s up
 rider.z += fall(vzWorld, JUMP_GRAVITY, dt) - rise;
 rider.vz = vzWorld - JUMP_GRAVITY * dt - alongSnowUp(rider, terrain.gradient(rider.x, rider.y, grad));
 if (rider.z <= 0) land(rider, session, spray, grad);
}

// m/s up, the vertical speed of riding along snow whose gradient is grad (m/m) at the rider's velocity.
function alongSnowUp(rider, grad) {
 return rider.vx * grad.gx + rider.vy * grad.gy;
}

// m, the height a free flight starting at vz (m/s, + up) gains in dt (s) under gravity g (m/s²).
function fall(vz, g, dt) {
 return vz * dt - 0.5 * g * dt * dt;
}

// On the snow (alongStart: m/s up, riding along it at the step's start; rise: m it rises under this step): takes off
// when asked (an ollie) or when the snow drops away faster than the rider can hold it (a lip, a sharp roll). Returns
// true when the rider leaves the snow this step, with rider.vz its speed up off the snow.
function takeOff(rider, input, alongStart, rise, dt) {
 const isOllie = !!input.jump;
 input.jump = 0;
 if (!isOllie && fall(alongStart, JUMP_GRAVITY + LANDING.HOLD, dt) - rise <= 0) return false;
 rider.vz = isOllie ? JUMP_SPEED : 0;
 rider.airTime = 0;
 rider.rotation = 0;
 rider.flipRot = 0;
 rider.fromKicker = !isOllie; // the snow's shape threw the rider: a lip or a roll (jumpStep names a kicker's)
 return true;
}

// True when the rider is at a kicker's lip on course (where: its scratch): in its launch zone, or up to KICKER_REACH_M
// before it.
function isOnKicker(rider, course, where) {
 const p = course.project(rider.x, rider.y, where);
 return course.kickerAt(p.s + KICKER_REACH_M, p.d) !== null;
}

// Turns the rider about its across axis by input.flip (-1..1) for dt (s).
function flipStep(rider, input, dt) {
 rider.flipRot += input.flip * FLIP.RATE * dt;
}

// Touchdown on the snow whose gradient is grad (m/m): the speed into the snow along its normal is the impact; the
// motion along the snow is kept, less a little (more on a hard landing). Then event land, and a crash or a score.
// Twin tip: the board only has to line up with the direction of travel, nose first or tail first.
function land(rider, session, spray, grad) {
 const flipTurns = Math.round(rider.flipRot / FULL_TURN);
 const flipOff = Math.abs(rider.flipRot - flipTurns * FULL_TURN); // rad from the nearest whole rotation
 const k = 1 / Math.hypot(grad.gx, grad.gy, 1); // the snow's normal is (-gx, -gy, 1) k
 const vz = rider.vz; // m/s up, relative to the snow's slope
 const impact = -vz * k; // m/s into the snow along its normal
 const isRoll = isBump(rider, impact) && flipOff <= FLIP.LAND_WINDOW;
 rider.flipRot = 0;
 rider.z = 0;
 rider.vz = 0;
 if (isRoll) return;
 ontoSnow(rider, grad, impact);
 rider.landingSpeed = -vz; // m/s down onto the snow's slope (RiderState); the impact is along its normal
 rider.landings++;
 emit(spray, 12, rider.x, rider.y, 0.1, 3, 2.5, rider.vx * 0.3, rider.vy * 0.3);
 const dv = Math.atan2(rider.vy, rider.vx) - rider.heading;
 const ax = ((dv % Math.PI) + Math.PI) % Math.PI;
 const mis = Math.min(ax, Math.PI - ax);
 const rt = Math.round(Math.abs(rider.rotation) / Math.PI) * 180;
 pushEvent(session, 'land', { speed: impact, airTime: rider.airTime });
 const across = Math.hypot(rider.vx, rider.vy) > MISALIGN_MIN_SPEED && mis > LANDING.MISALIGN;
 const hardLanding = impact > LANDING.CRASH_IMPACT || (across && impact > LANDING.MISALIGN_IMPACT);
 if (hardLanding || flipOff > FLIP.LAND_WINDOW) {
  rider.crashTimer = CRASH_TIME;
  session.crashes++;
  rider.vx = rider.vy = 0;
  rider.airTime = 0;
  pushEvent(session, 'crash', { cause: 'landing' });
 } else if (rider.airTime > MIN_SCORED_AIR) {
  const n = Math.abs(flipTurns);
  if (n > 0) pushEvent(session, 'flip', { flips: flipTurns });
  const flipPts = FLIP.POINTS * n * (n + 1) / 2;
  const pts = Math.round(rider.airTime * 60 + (rider.fromKicker ? 20 : 0) + rt / 180 * 40 + flipPts);
  session.score += pts;
  pushEvent(session, 'score', { points: pts, kind: 'air', degrees: rt, flips: flipTurns });
 }
}

// True for a touchdown that is only riding over a roll (impact: m/s): the rider was off the snow for too short to
// score (MIN_SCORED_AIR) and meets it softly, so the legs take it: the motion is kept as it is, and there is no
// landing, no spray and no score.
function isBump(rider, impact) {
 const isShortAir = rider.airTime >= 0 && rider.airTime < MIN_SCORED_AIR; // < 0 only after rolling off a rail
 return isShortAir && impact < LANDING.SOFT_IMPACT;
}

// Turns the rider's velocity onto the snow whose gradient is grad (m/m) at impact (m/s into it along its normal): the
// part into the normal is lost and the part along the snow kept, less the landing's speed loss (LANDING). vx, vy are
// the horizontal motion along the snow after.
function ontoSnow(rider, grad, impact) {
 const k = 1 / Math.hypot(grad.gx, grad.gy, 1);
 const hard = Math.max(0, impact - LANDING.SOFT_IMPACT);
 const loss = Math.min(LANDING.MAX_LOSS, LANDING.SOFT_LOSS * Math.max(0, impact) + LANDING.HARD_LOSS * hard);
 const kept = 1 - loss;
 rider.vx = (rider.vx - impact * grad.gx * k) * kept;
 rider.vy = (rider.vy - impact * grad.gy * k) * kept;
}
