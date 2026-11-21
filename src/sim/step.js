// One physics step: steering, gravity, grip, friction, braking, jumps, rails, trees, spray and the finish; its events.
import { TAU, RIGS, GRAVITY, GRAVITY_GAIN } from '../core/config.js';
import { DEFAULT_COURSE } from '../world/course.js';
import { DEFAULT_FRAME } from '../world/map-frame.js';
import { emit } from './particles.js';
import { jumpStep } from './jump.js';
import { railCheck, grindStep } from './grind.js';
import { pushEvent } from './state.js';
import { brakeStrength, brakeYaw, skidKept } from './brake.js';

const AIRBORNE_Z = 0.05;     // m above the snow, higher counts as in the air
const WIPEOUT_SPIN_RATE = 14; // rad/s, tumble while crashed
const CARVE_RATE = 2.7;      // rad/s, turn rate when standing still
const CARVE_SPEED_LOSS = 0.045; // rad/s less turn rate per m/s of speed (up to 30 m/s)
const CARVE_SPEED_CAP = 30;  // m/s, faster doesn't turn any slower
const CARVE_LIMIT = 0.15;    // rad, the board stays this far from straight across the slope
const AIR_GRIP = 0.4;        // 1/s, how fast sideways slip dies in the air
const DRAG_PER_SPEED = 0.0035; // 1/m, air drag: fraction of speed lost per second per m/s
const SNOW_FRICTION = 0.02;  // 1/s, fraction of speed lost per second on any snow
const POWDER_FRICTION = 0.18; // 1/s, extra off the groomed piste
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
 * core/contracts.js), frame (the MapFrame, world/map-frame.js)}. Everything is in world metres (east, north) and
 * radians counter-clockwise from east (docs/adr/0005-enu-frame.md). Mutates rider, input.jump (and jumpPressed),
 * session and spray, nothing else. Without a course, frame, where or near (direct unit calls), DEFAULT_COURSE,
 * DEFAULT_FRAME and new scratch objects are used.
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
 const brake = rider.crashTimer <= 0 && rider.z <= AIRBORNE_Z ? brakeStrength(input) : 0; // 0..1, on the snow only
 if (brake > 0) {
  rider.wipeoutSpin = 0;
  brakeYaw(rider, brake, course.fallLine(rider.x, rider.y, state.gradient).heading, dt);
 } else {
  steer(rider, input, RIGS[session.rig], s, dt, (world.frame || DEFAULT_FRAME).rotation);
 }
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
 if (onSnow) spraySnow(rider, input, state.spray, slip);
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

// The wipeout tumble, spinning in the air, or carving on the snow (within forward or switch). Right turns clockwise
// (heading down), left counter-clockwise; rotation counts + to the right. across: rad, the world heading of the map
// frame's across axis (grid +u): the carve limit keeps the board CARVE_LIMIT from it, measured on the map's grid as
// r = across - heading (F6 replaces it with the fall line).
function steer(rider, input, rig, s, dt, across) {
 const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
 if (rider.crashTimer > 0) {
  rider.crashTimer -= dt;
  rider.wipeoutSpin += dt * WIPEOUT_SPIN_RATE;
 } else if (rider.z > AIRBORNE_Z) {
  // in the air, left and right spin the board
  rider.wipeoutSpin = 0;
  const da = turn * dt * rig.spin;
  rider.heading -= da;
  rider.rotation += da;
 } else {
  rider.wipeoutSpin = 0;
  const rate = CARVE_RATE - Math.min(s, CARVE_SPEED_CAP) * CARVE_SPEED_LOSS; // rad/s before the rig's factor
  let a = across - rider.heading + turn * dt * rate * rig.turn;
  a = ((a % TAU) + TAU) % TAU;
  const bs = a >= Math.PI ? Math.PI : 0;
  rider.heading = across - (bs + Math.max(CARVE_LIMIT, Math.min(Math.PI - CARVE_LIMIT, a - bs)));
 }
}

// Gravity along the slope, grip against sideways slip, friction and the brake's skid. brake: 0..1, on the snow only.
// Returns the sideways slip (m/s).
function glide(state, brake, terrain, s, dt) {
 const rider = state.rider;
 const rig = RIGS[state.session.rig];
 const grav = terrain.gradient(rider.x, rider.y, state.gradient);
 const m = terrain.groomed(rider.x, rider.y);
 const air = rider.z > AIRBORNE_Z;
 const gk = (air ? 0 : 1) * GRAVITY * GRAVITY_GAIN;
 let vx = rider.vx - grav.gx * gk * dt;
 let vy = rider.vy - grav.gy * gk * dt;
 const dx = Math.cos(rider.heading);
 const dy = Math.sin(rider.heading);
 let slip;
 if (brake <= 0) {
  const al = vx * dx + vy * dy;
  const sx = vx - al * dx;
  const sy = vy - al * dy;
  const k = Math.exp(-(air ? AIR_GRIP : rig.grip) * dt);
  slip = Math.hypot(sx, sy);
  vx = dx * al + sx * k;
  vy = dy * al + sy * k;
 } else {
  // a skid: the equipment is yawed across the motion and the slip is lost as speed, not as a turn (brake.js)
  slip = Math.abs(vx * dy - vy * dx);
  const kept = skidKept(vx, vy, rider.heading, brake, dt);
  vx *= kept;
  vy *= kept;
 }
 const f = Math.max(0, 1 - (DRAG_PER_SPEED * s + SNOW_FRICTION + (air ? 0 : (1 - m) * POWDER_FRICTION)) * dt);
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

// On the snow: spray when carving hard or braking (slip: sideways slip, m/s). The ski tracks are the view's
// (view/ski-tracks.js), drawn from rider.skid and rider.isBraking after each step.
function spraySnow(rider, input, spray, slip) {
 const sn = Math.hypot(rider.vx, rider.vy);
 if (input.brake && sn > 3) emit(spray, 1, rider.x, rider.y, 0.15, 2.2, 1.6, -rider.vx * 0.15, -rider.vy * 0.15);
 else if (slip > 4) emit(spray, 1, rider.x, rider.y, 0.15, 2.2, 1.4, 0, 0);
}
