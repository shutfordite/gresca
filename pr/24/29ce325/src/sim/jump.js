// Jumps: take-off (the jump button or a kicker lip), flight, and the landing: clean and scored, or a crash.
import { KICK, KBIG, cx } from '../world/course.js';
import { emit } from './particles.js';
import { pushEvent } from './state.js';

const JUMP_GRAVITY = 15;    // m/s², in the air (stronger than real gravity, for snappy game jumps)
const JUMP_SPEED = 6.5;     // m/s up, an ollie from the snow
const TAKEOFF_Z = 0.01;     // m, first height of a jump (so the rider counts as airborne)
const KICKER_HALF_WIDTH = 9; // m either side of the piste centreline a kicker launches the rider
const KICKER_MIN_SPEED = 4; // m/s, slower riders roll over the lip
const KICKER_LIP_DEPTH = 5; // m past the lip (in y) where the launch happens
const KICKER_BIG_GAIN = 1.35; // dimensionless, extra launch speed off a big kicker
const CRASH_TIME = 1.1;     // s of wipeout
const CRASH_LAND_SPEED = -8; // m/s vertical, landing harder than this ...
const CRASH_MISALIGN = 0.6; // rad ... with the board this far off the direction of travel is a crash
const MIN_SCORED_AIR = 0.35; // s, shorter hops score nothing

/**
 * One step of dt (s) of the rider's vertical motion: take-off, flight and landing. Mutates rider, input.jump (the
 * one-shot request it uses up), session (crashes, score, events: land, crash, score) and spray (landing snow).
 */
export function jumpStep(rider, input, session, spray, dt) {
 if (rider.crashTimer > 0) {
  rider.z = 0;
  rider.vz = 0;
  rider.airTime = 0;
  return;
 }
 const s = Math.hypot(rider.vx, rider.vy);
 if (rider.z > 0) input.jump = 0;
 if (rider.z <= 0 && rider.vz <= 0) takeOff(rider, input, s);
 if (rider.z > 0 || rider.vz > 0) {
  rider.airTime += dt;
  rider.vz -= JUMP_GRAVITY * dt;
  rider.z += rider.vz * dt;
  if (rider.z <= 0) land(rider, session, spray);
 }
}

// On the snow: jump if asked, or launch off a kicker lip at speed.
function takeOff(rider, input, s) {
 if (input.jump) {
  rider.z = TAKEOFF_Z;
  rider.vz = JUMP_SPEED;
  input.jump = 0;
  rider.airTime = 0;
  rider.rotation = 0;
  rider.fromKicker = false;
  return;
 }
 const y = rider.y;
 const onLine = Math.abs(rider.x - cx(y)) < KICKER_HALF_WIDTH && s > KICKER_MIN_SPEED;
 const kk = onLine ? KICK.find((k) => y >= k && y < k + KICKER_LIP_DEPTH) : undefined;
 if (kk !== undefined) {
  rider.z = TAKEOFF_Z;
  rider.vz = (2.5 + s * 0.3) * (KBIG.includes(kk) ? KICKER_BIG_GAIN : 1);
  rider.airTime = 0;
  rider.rotation = 0;
  rider.fromKicker = true;
 }
}

// Touchdown (event land), then a crash or a score. Twin tip: the board only has to line up with the direction of
// travel, nose first or tail first.
function land(rider, session, spray) {
 const landV = rider.vz;
 rider.z = 0;
 rider.vz = 0;
 rider.landingSpeed = -landV;
 rider.landings++;
 emit(spray, 12, rider.x, rider.y, 0.1, 3, 2.5, rider.vx * 0.3, rider.vy * 0.3);
 const dv = Math.atan2(rider.vy, rider.vx) - rider.heading;
 const ax = ((dv % Math.PI) + Math.PI) % Math.PI;
 const mis = Math.min(ax, Math.PI - ax);
 const rt = Math.round(Math.abs(rider.rotation) / Math.PI) * 180;
 pushEvent(session, 'land', { speed: rider.landingSpeed, airTime: rider.airTime });
 if (Math.hypot(rider.vx, rider.vy) > 3 && landV < CRASH_LAND_SPEED && mis > CRASH_MISALIGN) {
  rider.crashTimer = CRASH_TIME;
  session.crashes++;
  rider.vx = rider.vy = 0;
  rider.airTime = 0;
  pushEvent(session, 'crash', { cause: 'landing' });
 } else if (rider.airTime > MIN_SCORED_AIR) {
  const pts = Math.round(rider.airTime * 60 + (rider.fromKicker ? 20 : 0) + rt / 180 * 40);
  session.score += pts;
  pushEvent(session, 'score', { points: pts, kind: 'air', degrees: rt });
 }
}
