// The sim's façade fields (debug.js state() and set()): the rider, the session and the spray, by their state() names.
import { field, prop } from '../core/facade-fields.js';

/**
 * The sim's fields, in state() order. r: RiderState, s: the session, spray: {particles}, course: the Course (its rails
 * are what grind.rail indexes). Units: m, m/s, s, rad. World axes: +x east, +y north; headings counter-clockwise from
 * east (docs/adr/0005-enu-frame.md).
 */
export function simFields(r, s, spray, course) {
 return {
  phase: prop(s, 'phase'),           // 'load' | 'ready' | 'run' | 'done'
  x: prop(r, 'x', true),             // m, rider position (east, north)
  y: prop(r, 'y', true),
  vx: prop(r, 'vx'),                 // m/s, rider velocity (east, north)
  vy: prop(r, 'vy'),
  speed: field(() => Math.hypot(r.vx, r.vy)), // m/s, read only
  heading: prop(r, 'heading'),       // rad, direction the board points; twin tip: heading + PI is the board switch
  z: prop(r, 'z', true),             // m above the ground (0 on the snow, the rail height while grinding)
  vz: prop(r, 'vz'),                 // m/s, vertical speed (+ up)
  airTime: prop(r, 'airTime'),       // s in the air this jump (briefly negative after dropping off the end of a rail)
  rotation: prop(r, 'rotation'),     // rad turned in the air this jump (+ right, - left)
  fromKicker: prop(r, 'fromKicker'), // true when this jump was launched by a kicker
  crashTimer: prop(r, 'crashTimer'), // s of wipeout left; the rider is crashed while this is > 0
  crashed: field(() => r.crashTimer > 0), // read only
  wipeoutSpin: prop(r, 'wipeoutSpin'), // rad, tumble angle while crashed
  crashes: prop(s, 'crashes'),       // count this run
  score: prop(s, 'score'),           // points this run
  time: prop(s, 'time'),             // s since the drop
  grinding: field(() => !!r.grind),  // read only
  // rail index into world.rails, m along it, m ground so far
  grind: field(() => (r.grind ? { rail: course.rails.indexOf(r.grind.r), t: r.grind.t, dist: r.grindDist } : null),
   (v) => {
   if (v === null) {
    r.grind = null;
    return;
   }
   r.grind = { r: course.rails[v.rail], t: v.t };
   if ('dist' in v) r.grindDist = v.dist;
  }),
  landings: prop(r, 'landings'),     // count of touchdowns since the page loaded
  landingSpeed: prop(r, 'landingSpeed'), // m/s downward at the last touchdown
  rig: prop(s, 'rig'),               // 'board' | 'ski' (set() writes the state only: no menu, no storage)
  stance: prop(s, 'stance'),         // 'regular' | 'goofy'
  particles: field(() => spray.particles.length), // live spray, read only (see clearParticles, emitParticles)
  // RiderState fields derived after each step, read only (core/contracts.js)
  travelHeading: field(() => r.travelHeading), // rad, direction of travel
  boardHeading: field(() => r.boardHeading),   // rad, direction the board points
  edge: field(() => r.edge),         // rad, edge angle: + on the edge that turns left (counter-clockwise), sim/edge.js
  skid: field(() => r.skid),         // m/s, sideways slip on the snow (0 in a clean carve, > 0 in a skid or brake)
  flipRot: field(() => r.flipRot),   // rad, pre-added (0)
  spinRot: field(() => r.spinRot),   // rad, spin this jump
  isSwitch: field(() => r.isSwitch), // riding tail first
  isBraking: field(() => r.isBraking), // the brake was held on the last step
  fallLine: field(() => r.fallLine), // rad, heading of the fall line under the rider
  downhillSide: field(() => r.downhillSide), // +1 fall line counter-clockwise of the board, -1 clockwise, 0 flat
  yawRate: field(() => r.yawRate),   // rad/s, the equipment's turn rate on the snow, counter-clockwise +
  snowDepth: field(() => r.snowDepth), // m of loose snow under the rider (0 on the groomed piste)
  sink: field(() => r.sink),         // m the equipment rides below the snow's surface (deep powder at low speed)
 };
}
