// The simulation's state objects: the rider (position, motion, air, grind, crash) and the session (phase, score, rig).

/**
 * A new rider state, all in map units: x, y (m), vx, vy (m/s), heading (rad, the direction the board points; twin
 * tip, so heading + PI is the same board ridden switch), z (m above the ground), vz (m/s, + up), airTime (s),
 * rotation (rad turned in the air this jump), fromKicker, crashTimer (s of wipeout left), wipeoutSpin (rad),
 * grind (null or {r: rail, t: m along it}), grindDist (m ground this grind), landings (count), landingSpeed (m/s).
 * Values before the first run are placeholders (0); the boot and start() set them.
 */
export function createRider() {
 return {
  x: 0, y: 0, vx: 0, vy: 0, heading: 0, z: 0, vz: 0, airTime: 0, rotation: 0, fromKicker: false,
  crashTimer: 0, wipeoutSpin: 0, grind: null, grindDist: 0, landings: 0, landingSpeed: 0,
 };
}

/**
 * A new session: phase ('load' | 'ready' | 'run' | 'done'), score (points), time (s since the drop), crashes (count),
 * popup ({text, t: s left on screen}), rig ('board' | 'ski') and stance ('regular' | 'goofy').
 */
export function createSession() {
 return { phase: 'load', score: 0, time: 0, crashes: 0, popup: { text: '', t: 0 }, rig: 'board', stance: 'regular' };
}
