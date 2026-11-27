// The simulation's state objects: the rider (position, motion, air, grind, crash) and the session (phase, score, rig).
// The fields are the RiderState contract (core/contracts.js); SimEvents go into session.events.

/**
 * A new rider state (RiderState, core/contracts.js), all in map units: x, y (m), vx, vy (m/s), heading (rad, the
 * direction the board points; twin tip, so heading + PI is the same board ridden switch), z (m above the ground),
 * vz (m/s, + up), airTime (s), rotation (rad turned in the air this jump), fromKicker, crashTimer (s of wipeout left),
 * wipeoutSpin (rad), grind (null or {r: rail, t: m along it}), grindDist (m ground this grind), landings (count),
 * landingSpeed (m/s); derived after each step: travelHeading, boardHeading (rad), skid (m/s), spinRot (rad), isSwitch,
 * isBraking, fallLine (rad), downhillSide (+1, -1, 0); edge (rad, + turns left, sim/edge.js); pre-added for S2 (0):
 * flipRot (rad), yawRate (rad/s, counter-clockwise +), snowDepth (m of loose snow under the rider), sink (m the equipment rides below the snow's surface).
 * Values before the first run are placeholders (0); the boot and start() set them.
 */
export function createRider() {
 return {
  x: 0, y: 0, vx: 0, vy: 0, heading: 0, z: 0, vz: 0, airTime: 0, rotation: 0, fromKicker: false,
  crashTimer: 0, wipeoutSpin: 0, grind: null, grindDist: 0, landings: 0, landingSpeed: 0,
  travelHeading: 0, boardHeading: 0, edge: 0, skid: 0, flipRot: 0, spinRot: 0, isSwitch: false, isBraking: false,
  fallLine: 0, downhillSide: 0, yawRate: 0, snowDepth: 0, sink: 0,
 };
}

/** Resets the derived and pre-added RiderState fields for a new run (heading: rad, the board's direction). */
export function resetDerived(rider) {
 rider.travelHeading = rider.heading;
 rider.boardHeading = rider.heading;
 rider.edge = 0;
 rider.skid = 0;
 rider.flipRot = 0;
 rider.spinRot = 0;
 rider.isSwitch = false;
 rider.isBraking = false;
 rider.fallLine = rider.heading; // until the first step measures it
 rider.downhillSide = 0;
 rider.yawRate = 0;
 rider.snowDepth = 0;
 rider.sink = 0;
}

/**
 * A new session: phase ('load' | 'ready' | 'run' | 'done'), score (points), time (s since the drop), crashes (count),
 * rig ('board' | 'ski'), stance ('regular' | 'goofy') and events (the SimEvents of the latest step; the array is
 * reused, so subscribers copy what they keep).
 */
export function createSession() {
 return { phase: 'load', score: 0, time: 0, crashes: 0, rig: 'board', stance: 'regular', events: [] };
}

/** Records a SimEvent {type, t: session time (s), ...fields} for this step. Events are rare: a few per second. */
export function pushEvent(session, type, fields) {
 session.events.push(Object.assign({ type, t: session.time }, fields));
}
