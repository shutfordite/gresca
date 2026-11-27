// One physics step: steering, gravity, the snow contact, braking, jumps, rails, trees, spray, the finish; its events.
import { RIGS, GRAVITY, GRAVITY_GAIN } from '../core/config.js';
import { DEFAULT_COURSE } from '../world/course.js';
import { emit } from './particles.js';
import { jumpStep } from './jump.js';
import { railCheck, grindStep } from './grind.js';
import { pushEvent } from './state.js';
import { brakeStrength, brakeYaw, skidKept } from './brake.js';
import { steerOf, followEdge, edgeCap, yawRate, followYaw } from './edge.js';
import { settle, sinkGrip, edgeHold, powderDrag, plough, edgeSlip, carveDrag } from './contact.js';
import { EDGE, BRAKE, SNOW } from './tuning.js';
import { rnd } from '../core/rng.js';

const AIRBORNE_Z = 0.05;     // m above the snow, higher counts as in the air
const WIPEOUT_SPIN_RATE = 14; // rad/s, tumble while crashed
const AIR_GRIP = 0.4;        // 1/s, how fast sideways slip dies in the air
const DRAG_PER_SPEED = 0.0035; // 1/m, air drag: fraction of speed lost per second per m/s
const SNOW_FRICTION = 0.02;  // 1/s, fraction of speed lost per second on any snow (loose snow adds sim/contact.js)
const MAX_BRAKE_PLOUGH = 12; // m/s², the most deep powder adds to a full brake (the snow wall a skid digs into)
const EDGE_M = 6;            // m, the rider stays this far inside the map
const TREE_RADIUS_M = 2.4;   // m, closer to a trunk than this is a crash
const TREE_TOP_M = 1.5;      // m above the snow, higher jumps clear the trees
const TREE_BOUNCE_S = 0.12;  // s of motion undone when hitting a tree
const CRASH_TIME = 1.1;      // s of wipeout
const SWITCH_SPEED = -1.5;    // m/s along the board, riding backwards faster than this is switch (as view/camera.js)
const FLAT_SLOPE = 1e-9;     // m/m, flatter than this the rider has no downhill side

/**
 * One step of dt (s): step(state, input, world, dt) -> the step's SimEvents (core/contracts.js; the array is reused
 * every step, copy what you keep). state: {rider, session, spray, gradient (a {gx,gy} scratch object, also the fall
 * line's), where (a {s,d,tx,ty} scratch object), near (an array, scratch for the trees near the rider)}; input: the
 * InputState; world: {terrain, trees ({near(x, y, out) -> count}, world/build.js), course (Course,
 * core/contracts.js)}. Everything is in world metres (east, north) and radians counter-clockwise from east
 * (docs/adr/0005-enu-frame.md). Mutates rider, input.jump (and jumpPressed), session and spray, nothing else. Without a
 * course, where or near (direct unit calls), DEFAULT_COURSE and new scratch objects are used.
 */
export function step(state, input, world, dt) {
 const rider = state.rider;
 const session = state.session;
 const course = world.course || DEFAULT_COURSE;
 const where = state.where || { s: 0, d: 0, tx: 0, ty: 1 };
 session.events.length = 0;
 session.time += dt;
 brakeEvents(rider, input, session);
 if (rider.grind) {
  grindStep(rider, input, session, state.spray, dt, course);
  rider.skid = 0;
  rider.edge = 0;
 } else {
  ride(state, input, world, dt, course, where);
 }
 deriveRider(rider, course.fallLine(rider.x, rider.y, state.gradient));
 if (!input.jump) input.jumpPressed = 0; // the pre-added one-shot follows jump until S1 switches the sim to it
 return session.events;
}

// One step on the snow or in the air: steer, glide, jumps, rails, trees, spray and the finish line (course: Course,
// where: its scratch).
function ride(state, input, world, dt, course, where) {
 const rider = state.rider;
 const session = state.session;
 const s = Math.hypot(rider.vx, rider.vy);
 const rig = RIGS[session.rig];
 const grounded = rider.crashTimer <= 0 && rider.z <= AIRBORNE_Z;
 if (grounded) settle(rider, world.terrain, rig, s, dt);
 else rider.sink = 0;
 const brake = grounded ? brakeStrength(input) : 0; // 0..1, on the snow only
 if (brake > 0) {
  rider.wipeoutSpin = 0;
  const before = rider.heading;
  brakeYaw(rider, brake, course.fallLine(rider.x, rider.y, state.gradient).heading, dt, s);
  rider.yawRate = (rider.heading - before) / dt;
 }
 steer(rider, input, rig, brake, s, dt);
 const slip = rider.crashTimer > 0 ? 0 : glide(state, brake, world.terrain, s, dt);
 rider.x += rider.vx * dt;
 rider.y += rider.vy * dt;
 jumpStep(rider, input, session, state.spray, dt, course, where);
 railCheck(rider, input, state.spray, course, where);
 if (rider.grind) {
  pushEvent(session, 'grindStart', { rail: course.rails.indexOf(rider.grind.r), kind: rider.grind.r.t });
 }
 keepOnMap(rider, world.terrain.bounds);
 if (rider.crashTimer <= 0 && rider.z < TREE_TOP_M) hitTrees(rider, session, world.trees, state.near || [], s);
 const onSnow = rider.crashTimer <= 0 && rider.z <= AIRBORNE_Z;
 rider.skid = onSnow ? slip : 0;
 if (onSnow) spraySnow(rider, input, state.spray, slip, dt);
 if (course.project(rider.x, rider.y, where).s > course.finishS) {
  if (session.phase !== 'done') {
   pushEvent(session, 'finish', { time: session.time, score: session.score, crashes: session.crashes });
  }
  session.phase = 'done';
 }
}

// brakeStart and brakeEnd when the brake is pressed or let go; rider.isBraking remembers it between steps.
function brakeEvents(rider, input, session) {
 const isBraking = !!input.brake;
 if (isBraking === rider.isBraking) return;
 rider.isBraking = isBraking;
 pushEvent(session, isBraking ? 'brakeStart' : 'brakeEnd', {});
}

// The RiderState fields derived from the rest (core/contracts.js), fall: the course's fall line under the rider.
// Nothing in the physics reads them.
function deriveRider(rider, fall) {
 if (rider.vx !== 0 || rider.vy !== 0) rider.travelHeading = Math.atan2(rider.vy, rider.vx);
 rider.boardHeading = rider.heading;
 rider.spinRot = rider.rotation;
 rider.isSwitch = rider.vx * Math.cos(rider.heading) + rider.vy * Math.sin(rider.heading) < SWITCH_SPEED;
 rider.fallLine = fall.heading;
 // the sign of sin(fallLine - boardHeading): + when the fall line is counter-clockwise from the board
 const cross = Math.cos(rider.boardHeading) * fall.fy - Math.sin(rider.boardHeading) * fall.fx;
 rider.downhillSide = fall.slope > FLAT_SLOPE ? (cross >= 0 ? 1 : -1) : 0;
}

// The wipeout tumble, spinning in the air, or the edge and carve on the snow (edge.js); while braking (brake: 0..1)
// the brake turns the equipment and the edge goes flat. s: speed (m/s). Yaw is counter-clockwise +: left turns
// counter-clockwise, right clockwise; rider.rotation counts + to the right (core/contracts.js), so it takes the yaw
// with a minus.
function steer(rider, input, rig, brake, s, dt) {
 const turn = steerOf(input);
 if (rider.crashTimer > 0) {
  rider.crashTimer -= dt;
  rider.wipeoutSpin += dt * WIPEOUT_SPIN_RATE;
  rider.edge = 0;
  rider.yawRate = 0;
  return;
 }
 rider.wipeoutSpin = 0;
 const onSnow = rider.z <= AIRBORNE_Z;
 const cap = onSnow ? edgeCap(rig, s, rig.edgeGrip * sinkGrip(rider.sink)) : EDGE.MAX_EDGE;
 followEdge(rider, onSnow && brake <= 0 ? turn : 0, rig, dt, cap);
 if (!onSnow) {
  // in the air, left and right spin the board
  rider.yawRate = -turn * rig.spin; // rad/s, counter-clockwise +
  rider.heading += rider.yawRate * dt;
  rider.rotation -= rider.yawRate * dt;
 } else if (brake <= 0) {
  const lag = rig.yawLag * (1 + SNOW.YAW_LAG * rider.sink);
  rider.heading += followYaw(rider, yawRate(rider, turn, rig), lag, dt) * dt;
 }
}

// Gravity along the slope, the snow contact (contact.js) against sideways slip, friction and the brake's skid. brake:
// 0..1, on the snow only; s: speed (m/s) at the start of the step. Returns the sideways slip (m/s).
function glide(state, brake, terrain, s, dt) {
 const rider = state.rider;
 const rig = RIGS[state.session.rig];
 const grav = terrain.gradient(rider.x, rider.y, state.gradient);
 const air = rider.z > AIRBORNE_Z;
 const sink = air ? 0 : rider.sink;
 const gk = (air ? 0 : 1) * GRAVITY * GRAVITY_GAIN;
 let vx = rider.vx - grav.gx * gk * dt;
 let vy = rider.vy - grav.gy * gk * dt;
 const dx = Math.cos(rider.heading);
 const dy = Math.sin(rider.heading);
 let slip;
 if (brake <= 0) {
  let al = vx * dx + vy * dy; // m/s along the equipment
  let side = vy * dx - vx * dy; // m/s across it, + to its left
  if (air) {
   side *= Math.exp(-AIR_GRIP * dt);
  } else {
   side = plough(side, sink, dt);
   const edged = edgeSlip(rig, side, edgeHold(rig, rider.edge, sink), dt);
   al = carveDrag(al, (Math.abs(side) - Math.abs(edged)) / dt, dt);
   side = edged;
  }
  slip = Math.abs(side);
  vx = dx * al - dy * side;
  vy = dy * al + dx * side;
 } else {
  // a skid: the equipment is yawed across the motion and the slip is lost as speed, not as a turn (brake.js); a
  // weaker edge where it has no firm snow, but powder's wall on top
  slip = Math.abs(vx * dy - vy * dx);
  const wall = Math.min(MAX_BRAKE_PLOUGH, SNOW.PLOUGH * sink * slip);
  const decel = BRAKE.SKID_DECEL * sinkGrip(sink) + wall;
  const kept = skidKept(vx, vy, rider.heading, brake, dt, decel);
  vx *= kept;
  vy *= kept;
 }
 const snowLoss = air ? 0 : powderDrag(sink, s) * dt; // m/s
 const sn = Math.hypot(vx, vy);
 const f = Math.max(0, 1 - (DRAG_PER_SPEED * s + SNOW_FRICTION) * dt - (sn > 0 ? snowLoss / sn : 0));
 rider.vx = vx * f;
 rider.vy = vy * f;
 return slip;
}

// Keeps the rider EDGE_M inside the map's rectangle (bounds: terrain.bounds, world/terrain.js) across it (a) and at
// its top edge (b, where runs start), stopping the motion into the edge. Position and speed change only when clamped.
function keepOnMap(rider, bounds) {
 const ex = rider.x - bounds.x0;
 const ey = rider.y - bounds.y0;
 const a = ex * bounds.ax + ey * bounds.ay;
 const b = ex * bounds.bx + ey * bounds.by;
 const a1 = Math.max(EDGE_M, Math.min(bounds.width - EDGE_M, a));
 if (a1 !== a) {
  const va = rider.vx * bounds.ax + rider.vy * bounds.ay;
  rider.vx -= va * bounds.ax;
  rider.vy -= va * bounds.ay;
 }
 const b1 = Math.max(EDGE_M, b);
 if (b1 !== b) {
  const vb = rider.vx * bounds.bx + rider.vy * bounds.by;
  rider.vx -= vb * bounds.bx;
  rider.vy -= vb * bounds.by;
 }
 if (a1 !== a || b1 !== b) {
  rider.x = bounds.x0 + a1 * bounds.ax + b1 * bounds.bx;
  rider.y = bounds.y0 + a1 * bounds.ay + b1 * bounds.by;
 }
}

// A crash for each tree trunk near the rider (trees.near(), into the scratch array near) that it is moving into
// (s: speed, m/s).
function hitTrees(rider, session, trees, near, s) {
 const n = trees.near(rider.x, rider.y, near);
 for (let i = 0; i < n; i++) {
  const T = near[i];
  if (Math.hypot(T.x - rider.x, T.y - rider.y) < TREE_RADIUS_M && s > 1) {
   rider.crashTimer = CRASH_TIME;
   session.crashes++;
   rider.x -= rider.vx * TREE_BOUNCE_S;
   rider.y -= rider.vy * TREE_BOUNCE_S;
   rider.vx = rider.vy = 0;
   pushEvent(session, 'crash', { cause: 'tree' });
  }
 }
}

// On the snow: spray when skidding or braking (slip: sideways slip, m/s), a thin spray off the edge of a hard carve,
// and in powder all the while: the equipment throws up snow for how deep it is sunk, how fast it goes and how hard it
// turns, out of the turn; a slow, big plume in deep powder, a light dust in light powder. The ski tracks are the view's
// (view/ski-tracks.js), drawn from rider.skid, rider.edge, rider.sink and rider.isBraking after each step. dt: s.
function spraySnow(rider, input, spray, slip, dt) {
 const sn = Math.hypot(rider.vx, rider.vy);
 const deep = rider.snowDepth >= SNOW.SPRAY_DEEP;
 const puff = deep ? 1.6 : 1.1; // size, times the old puffs
 const life = deep ? 2.4 : 1.3; // life, times the old puffs
 if (input.brake && sn > 3) {
  emit(spray, 1, rider.x, rider.y, 0.15, 2.2, 1.6, -rider.vx * 0.15, -rider.vy * 0.15, rider.sink > 0.05 ? puff : 1);
 } else if (slip > EDGE.SPRAY_SKID) {
  emit(spray, 1, rider.x, rider.y, 0.15, 2.2, 1.4, 0, 0, rider.sink > 0.05 ? puff : 1);
 } else {
  const pull = Math.abs(rider.yawRate) * sn - EDGE.SPRAY_CARVE; // m/s² past the carve's spray
  if (pull > 0 && rnd(spray.rng) < pull * EDGE.SPRAY_CARVE_RATE * dt) {
   emit(spray, 1, rider.x, rider.y, 0.1, 1.2, 1, -rider.vx * 0.1, -rider.vy * 0.1, 0.6);
  }
 }
 if (rider.sink <= 0.01 || sn < 1) return;
 const turn = Math.abs(rider.yawRate);
 const rate = rider.sink * sn * (SNOW.SPRAY_RATE + SNOW.SPRAY_TURN * turn); // particles per s
 if (rnd(spray.rng) >= rate * dt) return;
 // out of the turn (a left turn throws snow to the right of the motion), back along the track
 const side = rider.yawRate > 0 ? -1 : 1;
 const ux = rider.vx / sn;
 const uy = rider.vy / sn;
 const throwM = Math.min(4, turn * 1.5); // m/s sideways
 const dvx = -ux * sn * 0.12 - uy * side * throwM;
 const dvy = -uy * sn * 0.12 + ux * side * throwM;
 emit(spray, 1, rider.x, rider.y, 0.05, 1.6, deep ? 2.6 : 1.3, dvx, dvy, puff, life);
}
