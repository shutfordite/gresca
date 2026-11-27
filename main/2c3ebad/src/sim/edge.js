// The edge and carve (F6, H2): steering tips the equipment on edge, the sidecut turns it, the edge holds or it skids.
//
// The model, per step on the snow:
// - The steer (-1..1, + right) sets a target edge angle, -steer * EDGE.MAX_EDGE, no further than the snow can hold at
//   this speed (edgeCap: a rider leans only as far as the edge will carry). rider.edge (rad, + tips the edge that turns
//   counter-clockwise, to the left) tips toward it at the rig's edgeRate and flattens or rolls over at its releaseRate:
//   holding the steer builds the turn, a tap barely starts one.
// - Bent onto its sidecut, the equipment carves an arc of radius R = sidecut / sin(edge) (m), so it wants to turn at
//   |along-board speed| / R (rad/s), counter-clockwise for a positive edge, nose first or tail first. Below
//   EDGE.PIVOT_FADE it can also pivot, at most EDGE.PIVOT_RATE * rig.turn * |steer| standing still.
// - The turn rate has inertia (rider.yawRate follows the wanted rate over the rig's yawLag, slower sunk in powder).
// - What the edge holds sideways, and what happens past it, is the snow contact (sim/contact.js).
import { EDGE } from './tuning.js';

const SIN_MAX_SLIP = Math.sin(EDGE.MAX_SLIP);

/** The steer, -1..1 with + to the right: input.steer when it is a number other than 0, else right minus left. */
export function steerOf(input) {
 const analog = +input.steer;
 if (analog > 0 || analog < 0) return Math.max(-1, Math.min(1, analog));
 return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

/**
 * Moves rider.edge (rad) toward the target for steer (-1..1, + right), -steer * MAX_EDGE but no more than cap (rad,
 * default MAX_EDGE): tipping further onto the same edge at rig.edgeRate, flattening or rolling to the other edge at
 * rig.releaseRate (rad/s), over dt (s).
 */
export function followEdge(rider, steer, rig, dt, cap = EDGE.MAX_EDGE) {
 const most = Math.min(EDGE.MAX_EDGE, cap);
 const target = Math.max(-most, Math.min(most, -steer * EDGE.MAX_EDGE));
 const isTipping = Math.abs(target) > Math.abs(rider.edge) && target * rider.edge >= 0;
 const step = (isTipping ? rig.edgeRate : rig.releaseRate) * dt;
 rider.edge += Math.max(-step, Math.min(step, target - rider.edge));
}

/**
 * The most edge (rad) worth tipping at speed (m/s) when a fully tipped edge holds hold (m/s²): where the carve's
 * sideways demand, speed² sin(edge) / sidecut, is EDGE.OVERDRIVE times what the edge holds at that angle (hold times
 * edgeBite), never below EDGE.MIN_CAP. A hard steer at speed then carves as tight as the snow allows instead of
 * washing out.
 */
export function edgeCap(rig, speed, hold) {
 const v2 = speed * speed;
 if (v2 <= 0) return EDGE.MAX_EDGE;
 let cap = EDGE.MAX_EDGE;
 for (let k = 0; k < 3; k++) { // the bite depends on the angle: three passes settle it
  const sinCap = EDGE.OVERDRIVE * hold * edgeBite(cap) * rig.sidecut / v2;
  cap = sinCap >= 1 ? EDGE.MAX_EDGE : Math.asin(sinCap);
 }
 return Math.max(EDGE.MIN_CAP, cap);
}

/** The carve radius (m) of a rig ({sidecut}) at an edge angle (rad): sidecut / |sin(edge)|, Infinity when flat. */
export function carveRadius(rig, edge) {
 const sinEdge = Math.abs(Math.sin(edge));
 return sinEdge > 0 ? rig.sidecut / sinEdge : Infinity;
}

/**
 * How fast (rad/s, counter-clockwise +) the equipment wants to turn on the snow: the carve from rider.edge and the
 * speed along the equipment, or the pivot for steer (-1..1, + right) when that is faster (fading out by
 * EDGE.PIVOT_FADE); 0 once a skid has the equipment EDGE.MAX_SLIP from the direction of travel and the turn would take
 * it further. Reads rider only.
 */
export function yawRate(rider, steer, rig) {
 const dx = Math.cos(rider.heading);
 const dy = Math.sin(rider.heading);
 const along = rider.vx * dx + rider.vy * dy;
 const carve = Math.sin(rider.edge) * Math.abs(along) / rig.sidecut;
 const speed = Math.hypot(rider.vx, rider.vy);
 const pivot = -steer * EDGE.PIVOT_RATE * rig.turn * Math.max(0, 1 - speed / EDGE.PIVOT_FADE);
 const rate = Math.abs(pivot) > Math.abs(carve) ? pivot : carve;
 if (speed <= 0) return rate;
 // sin of the angle from the equipment's leading end (nose, or tail when switch) to the direction of travel
 const sinSlip = (dx * rider.vy - dy * rider.vx) / speed * (along < 0 ? -1 : 1);
 const isWidening = (rate > 0 && sinSlip < -SIN_MAX_SLIP) || (rate < 0 && sinSlip > SIN_MAX_SLIP);
 return isWidening ? 0 : rate;
}

/**
 * Moves rider.yawRate (rad/s) toward want (rad/s) with time constant lag (s) over dt (s), and returns it: the
 * equipment's swing weight, so a turn builds and unwinds instead of snapping.
 */
export function followYaw(rider, want, lag, dt) {
 rider.yawRate += (want - rider.yawRate) * (lag > 0 ? 1 - Math.exp(-dt / lag) : 1);
 return rider.yawRate;
}

/** The share 0..1 of the rig's edgeGrip an edge angle (rad) holds: EDGE.FLAT_BITE flat, all of it from FULL_BITE. */
export function edgeBite(edge) {
 const t = Math.min(1, Math.abs(edge) / EDGE.FULL_BITE);
 return EDGE.FLAT_BITE + (1 - EDGE.FLAT_BITE) * t * (2 - t);
}
