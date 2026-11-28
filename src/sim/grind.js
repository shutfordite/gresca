// Rails and boxes: getting onto them, grinding along them and leaving them.
import { DEFAULT_COURSE } from '../world/course.js';
import { rnd } from '../core/rng.js';
import { emit } from './particles.js';
import { pushEvent } from './state.js';

const GRIND_MIN_SPEED = 3;   // m/s, slower riders don't get onto a rail, and a grind never slows below this
const GRIND_DRAG = 0.12;     // 1/s, fraction of speed lost per second on the rail
const GRIND_MAX_ALIGN = 0.6; // rad, travel and board must be this close to the rail's line to get on
const GRIND_REACH_M = 1.5;   // m, how far to the side of the rail the rider may be
const RAIL_REACH_BEFORE_M = 1; // m before a rail's start (along s) the rider may get on
const GRIND_STEP_HEIGHT = 0.6; // m above the rail top the rider may be and still drop onto it
const GRIND_TURN_RATE = 10;  // 1/s, how fast the board swings into line with the rail
const GRIND_POINTS_PER_M = 3; // points per metre ground
const GRIND_JUMP_SPEED = 6.5; // m/s up, jumping off a rail
const GRIND_DROP_SPEED = 2.5; // m/s up, rolling off the end
const GRIND_DROP_AIR = -0.6; // s, air time starts this far below zero after rolling off (so the drop scores nothing)

// rad, the size of angle d wrapped to -PI..PI
const wrapAbs = (d) => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));

/**
 * Starts a grind if the rider rides onto a rail or box, or drops onto one from the air, roughly along its length
 * (nose or tail first). Mutates rider, input.jump and spray. course: the Course whose rails count; where: a {s,d,tx,ty}
 * scratch object for it.
 */
export function railCheck(rider, input, spray, course = DEFAULT_COURSE, where = { s: 0, d: 0, tx: 0, ty: 1 }) {
 if (rider.grind || rider.crashTimer > 0 || rider.vz > 0) return;
 const s = Math.hypot(rider.vx, rider.vy);
 if (s < GRIND_MIN_SPEED) return;
 const x = rider.x;
 const y = rider.y;
 const along = course.project(x, y, where).s;
 for (const r of course.rails) {
  if (along < r.s0 - RAIL_REACH_BEFORE_M || along > r.s1 || rider.z > r.h + GRIND_STEP_HEIGHT) continue;
  const ox = x - r.x0;
  const oy = y - r.y0;
  const t = ox * r.dx + oy * r.dy;
  const perp = Math.abs(-ox * r.dy + oy * r.dx);
  if (t < -1 || t > r.len - 4 || perp > GRIND_REACH_M) continue;
  const phi = Math.atan2(r.dy, r.dx);
  const bd = ((rider.heading - phi) % Math.PI + Math.PI) % Math.PI;
  const travelOff = wrapAbs(Math.atan2(rider.vy, rider.vx) - phi);
  if (travelOff > GRIND_MAX_ALIGN || Math.min(bd, Math.PI - bd) > GRIND_MAX_ALIGN) continue;
  rider.grind = {
   r,
   t: Math.max(0, t),
   seg: 0, // a straight rail has one segment (K3: polylines)
   style: '5050', // lined up (K3: from the board's angle to the rail)
   balance: 0, // centred (K3: drifts with misalignment)
  };
  rider.grindDist = 0;
  rider.z = r.h;
  rider.vz = 0;
  rider.airTime = 0;
  input.jump = 0;
  emit(spray, 8, x, y, r.h, 2.5, 2, rider.vx * 0.1, rider.vy * 0.1);
  return;
 }
}

/**
 * One step of dt (s) along the rail: the rider slides, lines up, sprays, and jumps or rolls off the end. course: the
 * Course the rail belongs to (for its index in grindEnd).
 */
export function grindStep(rider, input, session, spray, dt, course = DEFAULT_COURSE) {
 const grind = rider.grind;
 const r = grind.r;
 const spd = Math.max(GRIND_MIN_SPEED, Math.hypot(rider.vx, rider.vy) * (1 - GRIND_DRAG * dt));
 grind.t += spd * dt;
 rider.grindDist += spd * dt;
 const t = Math.min(grind.t, r.len);
 rider.x = r.x0 + r.dx * t;
 rider.y = r.y0 + r.dy * t;
 rider.vx = r.dx * spd;
 rider.vy = r.dy * spd;
 rider.z = r.h;
 rider.vz = 0;
 const a = rider.heading;
 const phi = Math.atan2(r.dy, r.dx);
 // nose or tail along the rail; the tail-first target is written phi - PI (the same direction as phi + PI): in the
 // world frame that is the mirror of the grid's phi + PI, so the default placement keeps its numbers bit for bit
 const tgt = Math.cos(a - phi) >= 0 ? phi : phi - Math.PI;
 rider.heading += Math.atan2(Math.sin(tgt - a), Math.cos(tgt - a)) * Math.min(1, dt * GRIND_TURN_RATE);
 if (rnd(spray.rng) < 0.7) emit(spray, 1, rider.x, rider.y, r.h, 1.2, 1.2, 0, 0);
 if (input.jump) endGrind(rider, input, session, course, true);
 else if (grind.t >= r.len) endGrind(rider, input, session, course, false);
}

// Leaves the rail, jumping (jump true) or rolling off the end, and scores the grind (events grindEnd, score).
function endGrind(rider, input, session, course, jump) {
 const r = rider.grind.r;
 const pts = Math.round(rider.grindDist * GRIND_POINTS_PER_M);
 session.score += pts;
 pushEvent(session, 'grindEnd', { rail: course.rails.indexOf(r), kind: r.t, dist: rider.grindDist, jumped: jump });
 pushEvent(session, 'score', { points: pts, kind: r.t, degrees: 0, flips: 0 });
 rider.grind = null;
 rider.grindDist = 0;
 rider.z = r.h;
 rider.vz = jump ? GRIND_JUMP_SPEED : GRIND_DROP_SPEED;
 input.jump = 0;
 rider.airTime = jump ? 0 : GRIND_DROP_AIR;
 rider.rotation = 0;
 rider.flipRot = 0;
 rider.fromKicker = false;
}
