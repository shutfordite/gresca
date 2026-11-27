// Rails and boxes (K3): getting onto them, grinding along their polylines with physics from their shape, leaving them.
//
// A rail is a polyline in the world: a park feature's world points (ParkRail.world, ADR 0012: x, y in ENU metres, z
// the altitude of its top, measured from the base snow when the world was built), or a course rail (Course.rails, one
// straight segment whose top follows the snow h m above it) until K1 moves the play mountain's park onto features.
// On it the rider moves along the segment's tangent:
// - Gravity along the segment's slope speeds them up on a down rail; friction (GRIND.RAIL_FRICTION on a round rail,
//   GRIND.BOX_FRICTION on a box) and air drag slow them; on a flat box they slow to a stop and step off.
// - At a vertex the speed carries onto the next segment. Over a convex kink (the rail drops away) the rider is thrown
//   up off the rail at speed * sin(change of slope) and flies over it: the steer spins the board, and it must land
//   lined up with the rail (or square across it) to land back on, else it is a crash.
// - A bend in plan needs a lean into it: tan(lean) = speed² * curvature / g. The lean follows the steer; leaning less
//   (too fast for the radius) or more than the bend needs, or the board off its line, drifts the balance (-1..1), which
//   also settles back by itself. At +-1 the rider drops off that side, or crashes when it went fast.
// - The board's angle to the rail picks the grind: lined up a 50-50, square across a boardslide or a lipslide, by the
//   side of approach (the nose crossed over the rail: boardslide; the tail did: lipslide).
// - Getting on: ride on at the start of a feature with an on-ramp (entry 'ramp'; a course rail anywhere), or come down
//   onto it from the air anywhere along it (jump from beside it). Crossing a feature's line below its top (a box side,
//   a rail's legs) is a crash.
// The rider's z stays the height above the snow under them (sim/jump.js): on a feature it is the rail's altitude
// minus the snow's (riderZ below), the one place that turns world altitude into the sim's z.
import { GRAVITY, GRAVITY_GAIN, JUMP_GRAVITY, RIGS, SIM_DT } from '../core/config.js';
import { DEFAULT_COURSE } from '../world/course.js';
import { rnd } from '../core/rng.js';
import { emit } from './particles.js';
import { pushEvent } from './state.js';
import { steerOf } from './edge.js';
import { GRIND } from './tuning.js';

const GRIND_MIN_SPEED = 3;   // m/s, slower riders don't get onto a rail
const GRIND_MAX_ALIGN = 0.6; // rad, travel within this of the rail's line, the board within this of a grind's line
const GRIND_REACH_M = 1.5;   // m, how far to the side of the rail a rider riding on at its start may be
const RAIL_REACH_BEFORE_M = 1; // m before a rail's start the rider may ride on
const RIDE_ON_M = 3;         // m along a rail from its start within which riding on from the snow counts
const LEGACY_TAIL_M = 4;     // m, a course rail can be ridden onto from the snow anywhere but its last LEGACY_TAIL_M
const LAND_REACH_M = 0.5;    // m beside the rail's edge a rider coming down from the air still lands on it
const LAND_BELOW_M = 0.25;   // m below the rail top a falling rider may be and still land on it (one step's fall)
const GRIND_STEP_HEIGHT = 0.6; // m above the rail top the rider may be and still drop onto it
const END_MARGIN_M = 1;      // m before a rail's end a rider can no longer land on it from the air
const SIDE_CLEAR_M = 0.1;    // m, crossing a feature's line lower than this below its top hits it
const SIDE_HIT_SPEED = 1;    // m/s, slower than this a rider bumps a feature without crashing
const AIRBORNE_Z = 0.05;     // m above the snow, higher counts as in the air (as sim/step.js)
const CRASH_TIME = 1.1;      // s of wipeout (as sim/step.js)
const RAIL_WIDTH_M = 0.06;   // m, a course rail's diameter (they have no width field)
const BOX_WIDTH_M = 0.5;     // m, a course box's top
const GRIND_POINTS_PER_M = 3; // points per metre ground
const GRIND_JUMP_SPEED = 6.5; // m/s up, jumping off a rail
const GRIND_DROP_SPEED = 2.5; // m/s up, rolling off the end
const GRIND_DROP_AIR = -0.6; // s, air time starts this far below zero after leaving without a jump (scores nothing)
const SPARK_CHANCE = 0.7;    // chance per step of one spark while grinding
const HALF_PI = Math.PI / 2;

/** A flat snow at altitude 0: the terrain of direct unit calls made without one. */
export const FLAT_SNOW = Object.freeze({
 height: () => 0,
 gradient(x, y, out) {
  out.gx = 0;
  out.gy = 0;
  return out;
 },
});

// rad, angle d wrapped to -PI..PI
const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

// 'rail' or 'box': a feature's profile, or a course rail's type
const kindOf = (r) => r.profile || r.t;

// The number of segments of rail r.
const segCount = (r) => (r.world ? r.world.length - 1 : 1);

// m, the half width of rail r's top.
const halfWidth = (r) => (r.width || (kindOf(r) === 'box' ? BOX_WIDTH_M : RAIL_WIDTH_M)) / 2;

// rad, the turn in plan at vertex i of points p (counter-clockwise +; 0 at the ends).
function turnAt(p, i) {
 if (i <= 0 || i >= p.length - 1) return 0;
 const ax = p[i].x - p[i - 1].x;
 const ay = p[i].y - p[i - 1].y;
 const bx = p[i + 1].x - p[i].x;
 const by = p[i + 1].y - p[i].y;
 return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

/** A scratch segment for segment() (fields as there): one per caller, made once. */
export const newSegment = () => ({ ax: 0, ay: 0, az: 0, ux: 1, uy: 0, len: 1, rise: 0, kappa: 0 });

/**
 * Fills g with segment i of rail r: its start ax, ay (m) and the top's altitude there az (m; course rails: NaN, their
 * top follows the snow), unit plan direction ux, uy, plan length len (m), rise (m up per m along; course rails: 0, see
 * riseOf) and curvature kappa (1/m, + bends left: half the turns at its two ends over its length).
 */
function segment(r, i, g) {
 if (!r.world) {
  g.ax = r.x0;
  g.ay = r.y0;
  g.az = NaN;
  g.ux = r.dx;
  g.uy = r.dy;
  g.len = r.len;
  g.rise = 0;
  g.kappa = 0;
  return g;
 }
 const p = r.world;
 const a = p[i];
 const b = p[i + 1];
 const len = Math.hypot(b.x - a.x, b.y - a.y);
 g.ax = a.x;
 g.ay = a.y;
 g.az = a.z;
 g.ux = (b.x - a.x) / len;
 g.uy = (b.y - a.y) / len;
 g.len = len;
 g.rise = (b.z - a.z) / len;
 g.kappa = (turnAt(p, i) + turnAt(p, i + 1)) / (2 * len);
 return g;
}

// m up per m along the snow under (x, y) in the direction of segment g (grad: a {gx, gy} scratch object).
function snowRise(g, terrain, x, y, grad) {
 terrain.gradient(x, y, grad);
 return grad.gx * g.ux + grad.gy * g.uy;
}

// m, the altitude of rail r's top u m along segment g, over the snow at (x, y).
const topAt = (r, g, u, terrain, x, y) => (r.world ? g.az + g.rise * u : terrain.height(x, y) + r.h);

// m, the sim's z (height above the snow under (x, y)) of a rider at altitude alt (m).
const riderZ = (alt, terrain, x, y) => alt - terrain.height(x, y);

// m of plan length along rail r before segment seg.
function lengthBefore(r, seg, g) {
 let m = 0;
 for (let i = 0; i < seg; i++) m += segment(r, i, g).len;
 return m;
}

/**
 * The grind the board's heading (rad) picks on a rail running along phi (rad), for a rider who came from side (+1
 * left of the line, -1 right) with slack (rad) either way: '5050' lined up (nose or tail first), 'boardslide' square
 * across with the nose over the rail (pointing away from the side of approach), 'lipslide' with the tail over it;
 * null in between.
 */
export function grindStyle(heading, phi, side, slack = GRIND_MAX_ALIGN) {
 const a = wrap(heading - phi);
 const off = Math.min(Math.abs(a), Math.PI - Math.abs(a));
 if (off <= slack) return '5050';
 if (Math.abs(HALF_PI - Math.abs(a)) > slack) return null;
 const nose = a > 0 ? 1 : -1; // + the nose points to the left of the line
 return nose === side ? 'lipslide' : 'boardslide';
}

// rad, the heading the board settles to in grind style on a line along phi: lined up nose or tail first, whichever is
// nearer, or square across with the nose on the side it points to now.
function styleHeading(style, heading, phi) {
 if (style === '5050') return Math.cos(heading - phi) >= 0 ? phi : phi - Math.PI;
 return phi + (Math.sin(heading - phi) >= 0 ? HALF_PI : -HALF_PI);
}

/**
 * A RiderState.grind (core/contracts.js) on rail r from o: {t (m along it, plan), seg, style, balance, side (+1 came
 * from the left), lean (rad), lift (m above the top), liftV (m/s), kinks (count)}, the missing ones 0 ('5050', side
 * +1), with its own scratch objects. Allocates: only when a grind starts (and in the façade's set()).
 */
export function makeGrind(r, o) {
 const geo = newSegment();
 const seg = o.seg || 0;
 return {
  r,
  t: o.t || 0,
  seg,
  style: o.style || '5050',
  balance: o.balance || 0,
  segStart: lengthBefore(r, seg, geo), // m of plan length before seg
  side: o.side || 1,
  lean: o.lean || 0,
  lift: o.lift || 0,
  liftV: o.liftV || 0,
  kinks: o.kinks || 0,
  geo,
  grad: { gx: 0, gy: 0 },
 };
}

/** The index of rail r in its course's list: course.features.rails for a park feature, else course.rails. */
export const railIndex = (course, r) => (r.world ? course.features.rails.indexOf(r) : course.rails.indexOf(r));

/**
 * Starts a grind if the rider rides onto a rail or box at its start, or comes down onto one from the air, travelling
 * along it with the board lined up or square across; or crashes them if they cross a park feature's line below its
 * top. Returns 'grind' (rider.grind set), 'crash' (rider.crashTimer set; the caller counts it and sends the event) or
 * ''. Mutates rider, input.jump and spray. course: the Course whose rails and features count; terrain: the snow under
 * them (heightAt, gradient); dt: s, the step the rider just moved; g: a newSegment() scratch (allocated per call
 * when not given: direct unit calls only).
 */
export function railCheck(rider, input, spray, course = DEFAULT_COURSE, terrain = FLAT_SNOW, dt = SIM_DT,
 g = newSegment()) {
 if (rider.grind || rider.crashTimer > 0) return '';
 if (rider.airTime < 0 && rider.z > AIRBORNE_Z) return ''; // falling off a rail just left
 const speed = Math.hypot(rider.vx, rider.vy);
 const alt = terrain.height(rider.x, rider.y) + rider.z;
 for (const r of course.rails) if (tryRail(rider, input, spray, r, alt, speed, terrain, g)) return 'grind';
 const rails = course.features ? course.features.rails : [];
 for (const r of rails) if (tryRail(rider, input, spray, r, alt, speed, terrain, g)) return 'grind';
 for (const r of rails) {
  if (speed > SIDE_HIT_SPEED && hitsLine(rider, r, alt, dt, g)) {
   rider.x -= rider.vx * dt;
   rider.y -= rider.vy * dt;
   rider.vx = 0;
   rider.vy = 0;
   rider.crashTimer = CRASH_TIME;
   return 'crash';
  }
 }
 return '';
}

// Starts a grind on rail r if the rider (at altitude alt, m, and speed, m/s) gets onto one of its segments; true if so.
// g: a newSegment() scratch.
function tryRail(rider, input, spray, r, alt, speed, terrain, g) {
 if (rider.vz > 0 || speed < GRIND_MIN_SPEED) return false;
 const n = segCount(r);
 const total = lengthBefore(r, n, g);
 const inAir = rider.z > AIRBORNE_Z;
 const rideOn = r.world ? r.entry === 'ramp' : true;
 // m along within which a rider on the snow rides on: a feature's start; a course rail anywhere but its last
 // LEGACY_TAIL_M (as before K3; they go when K1 moves the park onto features)
 const rideOnTo = r.world ? RIDE_ON_M : total - LEGACY_TAIL_M;
 let before = 0;
 for (let i = 0; i < n; i++, before += g.len) {
  segment(r, i, g);
  const ox = rider.x - g.ax;
  const oy = rider.y - g.ay;
  const u = ox * g.ux + oy * g.uy;
  if (u > g.len || u < (i === 0 ? -RAIL_REACH_BEFORE_M : 0)) continue;
  const lat = g.ux * oy - g.uy * ox; // m, + left of the line
  const above = alt - topAt(r, g, Math.max(0, u), terrain, rider.x, rider.y);
  const t = before + u;
  const onStart = rideOn && t <= rideOnTo && Math.abs(lat) <= GRIND_REACH_M && above <= GRIND_STEP_HEIGHT;
  const onLand = inAir && t >= 0 && t <= total - END_MARGIN_M && Math.abs(lat) <= LAND_REACH_M + halfWidth(r) &&
   above >= -LAND_BELOW_M && above <= GRIND_STEP_HEIGHT;
  if (!onStart && !onLand) continue;
  const phi = Math.atan2(g.uy, g.ux);
  if (Math.abs(wrap(Math.atan2(rider.vy, rider.vx) - phi)) > GRIND_MAX_ALIGN) continue;
  const side = approachSide(lat, g.ux * rider.vy - g.uy * rider.vx);
  const style = grindStyle(rider.heading, phi, side);
  if (!style) continue;
  startGrind(rider, input, spray, makeGrind(r, { t: Math.max(0, t), seg: i, style, side }), terrain);
  return true;
 }
 return false;
}

// +1 when the rider came onto the line from its left, -1 from its right: by the side they are on (lat, m), or on the
// line by the way they are moving across it (latV, m/s, + to the left).
function approachSide(lat, latV) {
 if (Math.abs(lat) > 0.05) return lat > 0 ? 1 : -1;
 return latV > 0 ? -1 : 1;
}

// Puts the rider onto grind (makeGrind) at its t: on the rail's top, the vertical motion stopped.
function startGrind(rider, input, spray, grind, terrain) {
 const g = segment(grind.r, grind.seg, grind.geo);
 const u = Math.min(g.len, grind.t - grind.segStart);
 rider.grind = grind;
 rider.grindDist = 0;
 rider.x = g.ax + g.ux * u;
 rider.y = g.ay + g.uy * u;
 rider.z = riderZ(topAt(grind.r, g, u, terrain, rider.x, rider.y), terrain, rider.x, rider.y);
 rider.vz = 0;
 rider.airTime = 0;
 input.jump = 0;
 emit(spray, 8, rider.x, rider.y, rider.z, 2.5, 2, rider.vx * 0.1, rider.vy * 0.1);
}

// True if the rider's last step (dt s, at altitude alt m) crossed a segment of feature r in plan below its top (g: a
// newSegment() scratch).
function hitsLine(rider, r, alt, dt, g) {
 const px = rider.x - rider.vx * dt;
 const py = rider.y - rider.vy * dt;
 for (let i = 0; i < segCount(r); i++) {
  segment(r, i, g);
  const latP = g.ux * (py - g.ay) - g.uy * (px - g.ax);
  const latC = g.ux * (rider.y - g.ay) - g.uy * (rider.x - g.ax);
  if (!(latP * latC < 0)) continue;
  const f = latP / (latP - latC);
  const u = (px - g.ax + (rider.x - px) * f) * g.ux + (py - g.ay + (rider.y - py) * f) * g.uy;
  if (u < 0 || u > g.len) continue;
  if (alt < g.az + g.rise * u - SIDE_CLEAR_M) return true;
 }
 return false;
}

/**
 * One step of dt (s) along the rail: gravity and friction (or the flight over a convex kink), the lean and the
 * balance, the board swinging onto its line, sparks; then a jump off, rolling off the end, stepping off when stalled,
 * dropping off the side or a crash when the balance is lost. Mutates rider, input.jump, session (events grindEnd,
 * score, crash) and spray. course: the Course the rail belongs to (its index in grindEnd); terrain: the snow under it.
 */
export function grindStep(rider, input, session, spray, dt, course = DEFAULT_COURSE, terrain = FLAT_SNOW) {
 const grind = rider.grind;
 const r = grind.r;
 const g = segment(r, grind.seg, grind.geo);
 const rise = r.world ? g.rise : snowRise(g, terrain, rider.x, rider.y, grind.grad);
 let speed = Math.hypot(rider.vx, rider.vy) * Math.hypot(1, rise); // m/s along the rail
 let push = 0; // 1/s, how hard the balance is pushed this step
 if (isLifted(grind)) {
  liftStep(rider, input, grind, RIGS[session.rig], rise, dt);
 } else {
  speed = slide(speed, rise, kindOf(r), dt);
  push = balanceStep(rider, input, grind, g, speed / Math.hypot(1, rise), dt);
 }
 const kinked = advance(rider, grind, speed, dt);
 const g2 = grind.geo;
 const rise2 = r.world ? g2.rise : snowRise(g2, terrain, rider.x, rider.y, grind.grad);
 const along = speed / Math.hypot(1, rise2); // m/s in plan
 const u = Math.min(g2.len, grind.t - grind.segStart);
 rider.x = g2.ax + g2.ux * u;
 rider.y = g2.ay + g2.uy * u;
 rider.vx = g2.ux * along;
 rider.vy = g2.uy * along;
 rider.z = riderZ(topAt(r, g2, u, terrain, rider.x, rider.y) + grind.lift, terrain, rider.x, rider.y);
 rider.vz = 0;
 if (kinked) emit(spray, 4, rider.x, rider.y, rider.z, 2, 1.6, rider.vx * 0.1, rider.vy * 0.1);
 if (rnd(spray.rng) < SPARK_CHANCE) emit(spray, 1, rider.x, rider.y, rider.z, 1.2, 1.2, 0, 0);
 // the vertical speed over the snow the rider leaves with (0 on a course rail, whose top follows the snow)
 const away = along * (rise2 - snowRise(g2, terrain, rider.x, rider.y, grind.grad)) + grind.liftV;
 if (grind.style === null) leave(rider, input, session, course, 'crash', away);
 else if (input.jump && !isLifted(grind)) leave(rider, input, session, course, 'jump', away);
 else if (grind.seg === segCount(r) - 1 && grind.t - grind.segStart >= g2.len) {
  leave(rider, input, session, course, 'end', away);
 } else if (speed < GRIND.STALL_SPEED) leave(rider, input, session, course, 'drop', away);
 else if (Math.abs(grind.balance) >= 1) {
  grind.balance = Math.sign(grind.balance);
  leave(rider, input, session, course, Math.abs(push) > GRIND.CRASH_PUSH ? 'crash' : 'drop', away);
 }
}

// True while the rider is in the air over a convex kink (grind.lift m above the top, rising at grind.liftV m/s).
const isLifted = (grind) => grind.lift > 0 || grind.liftV > 0;

// m/s along the rail after dt (s) of gravity along its slope (rise, m/m), friction of its kind and air drag.
function slide(speed, rise, kind, dt) {
 const cos = 1 / Math.hypot(1, rise);
 const g = GRAVITY * GRAVITY_GAIN;
 const mu = kind === 'box' ? GRIND.BOX_FRICTION : GRIND.RAIL_FRICTION;
 return Math.max(0, speed + (-g * rise * cos - mu * g * cos - GRIND.AIR_DRAG * speed * speed) * dt);
}

// The lean follows the steer; the balance drifts with the lean against what the bend (g.kappa, at along m/s in plan)
// needs and with the board off its line, and settles back; the board swings onto its line. Returns the push (1/s):
// the drift before the settling back, how hard the rider is being tipped off.
function balanceStep(rider, input, grind, g, along, dt) {
 const phi = Math.atan2(g.uy, g.ux);
 const target = -steerOf(input) * GRIND.MAX_LEAN; // rad, + leans left (a right steer leans right)
 const most = GRIND.LEAN_RATE * dt;
 grind.lean += Math.max(-most, Math.min(most, target - grind.lean));
 const need = along * along * g.kappa / GRAVITY; // tan of the lean the bend needs
 const off = wrap(rider.heading - styleHeading(grind.style, rider.heading, phi)); // rad, + counter-clockwise
 const push = GRIND.BALANCE_LEAN * (Math.tan(grind.lean) - need) + GRIND.BALANCE_MISALIGN * off;
 const rate = push - GRIND.BALANCE_RECOVER * grind.balance;
 grind.balance = Math.max(-1, Math.min(1, grind.balance + rate * dt));
 rider.heading -= off * Math.min(1, dt * GRIND.ALIGN_RATE);
 return push;
}

// In the air over a kink: the rider rises and falls (JUMP_GRAVITY, across the rail's slope rise), the steer spins the
// board (rig.spin, rad/s); on touching down the board's angle picks the grind again, or null (a crash) if it is off.
function liftStep(rider, input, grind, rig, rise, dt) {
 input.jump = 0;
 rider.heading -= steerOf(input) * rig.spin * dt;
 grind.liftV -= JUMP_GRAVITY / Math.hypot(1, rise) * dt;
 grind.lift += grind.liftV * dt;
 if (grind.lift > 0) return;
 grind.lift = 0;
 grind.liftV = 0;
 const phi = Math.atan2(grind.geo.uy, grind.geo.ux);
 grind.style = grindStyle(rider.heading, phi, grind.side, GRIND.LAND_ALIGN);
}

// Moves the rider speed (m/s) * dt (s) along the rail, onto the next segments past each vertex: the speed carries,
// the board turns with a bend, a change of slope counts a kink, and a convex one throws the rider up. Leaves grind.geo on the rider's segment.
// Returns true if a kink was ridden over.
function advance(rider, grind, speed, dt) {
 const r = grind.r;
 const g = grind.geo;
 const plan = speed / Math.hypot(1, g.rise) * dt; // m
 grind.t += plan;
 rider.grindDist += speed * dt;
 let kinked = false;
 while (grind.seg < segCount(r) - 1 && grind.t - grind.segStart >= g.len) {
  const pitch = Math.atan(g.rise);
  grind.segStart += g.len;
  grind.seg++;
  // the board turns with the rail at a bend (in the air over a kink too: it turns only what the steer spins it)
  if (!isLifted(grind)) rider.heading += turnAt(r.world, grind.seg);
  segment(r, grind.seg, g);
  const bend = Math.atan(g.rise) - pitch; // rad, - where the rail drops away
  if (Math.abs(bend) < GRIND.KINK_MIN) continue;
  grind.kinks++;
  kinked = true;
  const up = speed * Math.sin(-bend); // m/s off the new segment
  if (up >= GRIND.LIFT_MIN_SPEED && !isLifted(grind)) grind.liftV = up;
 }
 return kinked;
}

// Leaves the rail: how 'jump' (up off it), 'end' (rolled off the end), 'drop' (stepped or fell off the side, to the
// side of the balance) or 'crash'; away: m/s, the vertical speed over the snow the rail gave. Scores the grind unless
// it crashed (events grindEnd, score; crash).
function leave(rider, input, session, course, how, away) {
 const grind = rider.grind;
 const r = grind.r;
 const kind = kindOf(r);
 const style = grind.style || '5050';
 const jumped = how === 'jump';
 pushEvent(session, 'grindEnd', {
  rail: railIndex(course, r),
  kind,
  dist: rider.grindDist,
  jumped,
  style,
  kinks: grind.kinks,
 });
 if (how === 'drop') {
  const side = grind.balance >= 0 ? 1 : -1; // + falls to the left of the line
  rider.vx -= grind.geo.uy * side * GRIND.DROP_SIDE_SPEED;
  rider.vy += grind.geo.ux * side * GRIND.DROP_SIDE_SPEED;
 }
 if (how === 'crash') {
  rider.crashTimer = CRASH_TIME;
  rider.vx = 0;
  rider.vy = 0;
  session.crashes++;
  pushEvent(session, 'crash', { cause: 'rail' });
 } else {
  const pts = Math.round(rider.grindDist * GRIND_POINTS_PER_M);
  session.score += pts;
  pushEvent(session, 'score', {
   points: pts,
   kind,
   degrees: 0,
   flips: 0,
  });
 }
 rider.grind = null;
 rider.grindDist = 0;
 rider.vz = away + (jumped ? GRIND_JUMP_SPEED : how === 'end' ? GRIND_DROP_SPEED : 0);
 rider.airTime = jumped ? 0 : GRIND_DROP_AIR;
 input.jump = 0;
 rider.rotation = 0;
 rider.flipRot = 0;
 rider.fromKicker = false;
}
