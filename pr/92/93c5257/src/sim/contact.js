// The snow contact (H2): what the edge holds sideways, the skid past it, and loose snow (sink, plough, drag).
//
// Per step on the snow, with the equipment's sideways slip `side` (m/s, the velocity across it after gravity and the
// turn):
// - Sunk in powder, the snow ploughs the slip away first (a soft wall: SNOW.PLOUGH per m sunk), without turning it into
//   speed along the equipment.
// - The edge then holds up to `hold` m/s² (the rig's edgeGrip times edgeBite(edge), less when sunk with no firm snow
//   under the edge). Within that the slip is gone this step: the edge is locked in its groove. Beyond it the edge
//   breaks loose and slides, and the snow takes only skidGrip of hold off the slip each second until it bites again.
//   Neither turns slip into speed: what gravity pushes across the equipment is lost, not banked, so traversing and
//   skidding slow the rider and a fast rider takes room to scrub speed off.
// - A held carve costs a little speed for the sideways force (EDGE.CARVE_DRAG).
// Each step is plough(), then edgeSlip(), then carveDrag() (sim/step.js glide).
import { SNOW, EDGE } from './tuning.js';
import { edgeBite } from './edge.js';

/** m, the equipment's sink for depth (m of loose snow) at speed (m/s): it planes up toward SINK_MIN by rig.float. */
export function sinkFor(rig, depth, speed) {
 const ploughing = 1 - Math.min(1, speed / rig.float);
 return depth * (SNOW.SINK_MIN + (1 - SNOW.SINK_MIN) * ploughing * ploughing);
}

/**
 * Reads the loose snow under the rider (terrain.powder, m) into rider.snowDepth and eases rider.sink (m) toward
 * sinkFor() over SNOW.SINK_TIME. dt: s. Returns rider.sink.
 */
export function settle(rider, terrain, rig, speed, dt) {
 rider.snowDepth = terrain.powder ? terrain.powder(rider.x, rider.y) : 0;
 const want = sinkFor(rig, rider.snowDepth, speed);
 rider.sink += (want - rider.sink) * (1 - Math.exp(-dt / SNOW.SINK_TIME));
 return rider.sink;
}

/** 0..1, the share of the edge's grip left sunk sink (m) in loose snow. */
export function sinkGrip(sink) {
 return 1 - SNOW.HOLD_LOSS * Math.min(1, sink / SNOW.HOLD_SINK);
}

/** m/s², the most sideways acceleration the edge holds: rig.edgeGrip at edge (rad), sunk sink (m). */
export function edgeHold(rig, edge, sink) {
 return rig.edgeGrip * edgeBite(edge) * sinkGrip(sink);
}

/** m/s², the powder's drag along the motion at speed (m/s), sunk sink (m). */
export function powderDrag(sink, speed) {
 return SNOW.DRAG * sink * (speed + SNOW.DRAG_SPEED);
}

/** m/s, the sideways slip side (m/s) after one step (dt: s) of the plough, sunk sink (m): never more than all of it. */
export function plough(side, sink, dt) {
 return side * (1 - Math.min(1, SNOW.PLOUGH * sink * dt));
}

/**
 * m/s, the sideways slip side (m/s, signed) after the edge for one step (dt: s): 0 when the edge holds it all (within
 * hold * dt, hold: m/s², edgeHold), else less by what the sliding edge takes (hold * rig.skidGrip * dt). Nothing is
 * turned into speed along the equipment: what the edge takes is lost.
 */
export function edgeSlip(rig, side, hold, dt) {
 if (Math.abs(side) <= hold * dt) return 0;
 return side - Math.sign(side) * hold * rig.skidGrip * dt;
}

/** m/s, the speed along the equipment, along (m/s, signed), after a carve's drag for held (m/s²) of edge force (dt: s). */
export function carveDrag(along, held, dt) {
 const drag = EDGE.CARVE_DRAG * held * dt;
 return along > 0 ? Math.max(0, along - drag) : Math.min(0, along + drag);
}
