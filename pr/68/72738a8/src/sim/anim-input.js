// AnimInput (core/contracts.js): what the rider animation needs from the sim, built from RiderState and the course.
const MOVING_SPEED = 0.5;   // m/s, slower than this the direction of travel is the board heading
const APPROACH_SPEED = 4;   // m/s, slower riders don't crouch for a kicker
const APPROACH_M = 14;      // m before a kicker lip (along s) the rider crouches

/** A new AnimInput (core/contracts.js), all false or 0: the out object for animInput(). */
export function createAnimInput() {
 return {
  wiped: false, grinding: false, braking: false, approach: false,
  speed: 0, travelDir: 0, facing: 0, riderSide: 1, impact: 0, landings: 0, edge: 0, skid: 0, flipRot: 0,
  where: { s: 0, d: 0, tx: 0, ty: 1 }, // scratch: the rider projected on the course
 };
}

// Lined up with a kicker and within APPROACH_M before its lip (s, d: m on the course).
function isApproaching(course, s, d) {
 for (const k of course.kickers) {
  if (Math.abs(d - k.d) < k.halfWidth && s >= k.s - APPROACH_M && s < k.s) return true;
 }
 return false;
}

/**
 * Fills out (from createAnimInput()) from rider (RiderState), session (rig, stance) and course (Course). Reads only;
 * returns out. Positions are the sim's (the view adds the drawn pose and its own smoothing).
 */
export function animInput(rider, session, course, out) {
 const speed = Math.hypot(rider.vx, rider.vy);
 const isGoofyBoard = session.rig === 'board' && session.stance === 'goofy';
 out.wiped = rider.crashTimer > 0;
 out.grinding = !!rider.grind;
 out.braking = rider.isBraking;
 out.speed = speed;
 out.travelDir = speed > MOVING_SPEED ? Math.atan2(rider.vy, rider.vx) : rider.heading;
 // the spec mirrors a goofy snowboarder in z, so the rider faces the other end of the board (- PI: the mirror of the
 // grid's + PI, docs/adr/0005-enu-frame.md, so the default placement keeps its numbers bit for bit)
 out.facing = rider.heading - (isGoofyBoard ? Math.PI : 0);
 out.riderSide = Math.cos(out.facing - out.travelDir) >= 0 ? 1 : -1;
 out.impact = rider.landingSpeed;
 out.landings = rider.landings;
 out.edge = rider.edge;
 out.skid = rider.skid;
 out.flipRot = rider.flipRot;
 const p = course.project(rider.x, rider.y, out.where);
 out.approach = speed > APPROACH_SPEED && isApproaching(course, p.s, p.d); // the view adds "on the snow"
 return out;
}
