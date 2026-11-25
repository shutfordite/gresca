// The edge and carve (F6): steering tips the equipment on edge, the sidecut turns it, the edge holds or it skids.
//
// The model, per step on the snow:
// - The steer (-1..1, + right) sets a target edge angle, -steer * EDGE.MAX_EDGE; rider.edge (rad, + tips the edge that
//   turns counter-clockwise, to the left) follows it at the rig's edgeRate (rad/s): the response time.
// - Bent onto its sidecut, the equipment carves an arc of radius R = sidecut / sin(edge) (m), so it turns at
//   |along-board speed| / R (rad/s), counter-clockwise for a positive edge, nose first or tail first. Slower than that,
//   the rider pivots at EDGE.PIVOT_RATE * rig.turn * |steer|.
// - The edge holds up to the rig's edgeGrip (m/s²) of sideways acceleration: while the sideways velocity a step asks
//   is within edgeGrip * dt, it is turned into velocity along the equipment at the same speed (a carve loses nothing).
//   More than that and the edge washes out, a skid: the slip stays (rider.skid, m/s) and the sideways friction
//   (rig.grip, step.js, the model every turn used before F6) wears it off as speed, until the edge bites again.
// - So a turn whose lateral demand speed² / R is above edgeGrip skids; in a skid the equipment turns no further than
//   EDGE.MAX_SLIP from the direction of travel.
import { EDGE } from './tuning.js';

const SIN_MAX_SLIP = Math.sin(EDGE.MAX_SLIP);

/** The steer, -1..1 with + to the right: input.steer when it is a number other than 0, else right minus left. */
export function steerOf(input) {
 const analog = +input.steer;
 if (analog > 0 || analog < 0) return Math.max(-1, Math.min(1, analog));
 return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

/** Moves rider.edge (rad) toward the target for steer (-1..1, + right) at rig.edgeRate (rad/s) over dt (s). */
export function followEdge(rider, steer, rig, dt) {
 const target = -steer * EDGE.MAX_EDGE;
 const most = rig.edgeRate * dt;
 rider.edge += Math.max(-most, Math.min(most, target - rider.edge));
}

/** The carve radius (m) of a rig ({sidecut}) at an edge angle (rad): sidecut / |sin(edge)|, Infinity when flat. */
export function carveRadius(rig, edge) {
 const sinEdge = Math.abs(Math.sin(edge));
 return sinEdge > 0 ? rig.sidecut / sinEdge : Infinity;
}

/**
 * How fast (rad/s, counter-clockwise +) the equipment turns on the snow: the carve from rider.edge and the speed along
 * the equipment, or the pivot for steer (-1..1, + right) when that is faster; 0 once a skid has the equipment
 * EDGE.MAX_SLIP from the direction of travel and the turn would take it further. Reads rider only.
 */
export function yawRate(rider, steer, rig) {
 const dx = Math.cos(rider.heading);
 const dy = Math.sin(rider.heading);
 const along = rider.vx * dx + rider.vy * dy;
 const carve = Math.sin(rider.edge) * Math.abs(along) / rig.sidecut;
 const pivot = -steer * EDGE.PIVOT_RATE * rig.turn;
 const rate = Math.abs(pivot) > Math.abs(carve) ? pivot : carve;
 const speed = Math.hypot(rider.vx, rider.vy);
 if (speed <= 0) return rate;
 // sin of the angle from the equipment's leading end (nose, or tail when switch) to the direction of travel
 const sinSlip = (dx * rider.vy - dy * rider.vx) / speed * (along < 0 ? -1 : 1);
 const isWidening = (rate > 0 && sinSlip < -SIN_MAX_SLIP) || (rate < 0 && sinSlip > SIN_MAX_SLIP);
 return isWidening ? 0 : rate;
}

/**
 * The sideways slip (m/s, signed) left after the edge: 0 when it holds all of it (|slip| within hold, m/s: edgeGrip *
 * dt; the caller turns it into speed along the equipment), else all of it: the edge has washed out, a skid, until the
 * sideways friction brings the slip back within hold.
 */
export function slipLeft(slip, hold) {
 return Math.abs(slip) <= hold ? 0 : slip;
}
