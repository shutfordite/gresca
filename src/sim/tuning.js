// Sim feel tunables that live next to the sim (core/config.js keeps the shared ones): the brake, the edge, the snow,
// flips; each with its unit. The rig data (sidecut, edge rates, grip, swing, float) is in RIGS (core/config.js).

/**
 * The brake (F5, H2): a hockey stop or heel-side skid, the equipment yawed across the fall line. The slip is worn off
 * by snow friction, a deceleration that does not grow with speed, so a fast rider needs room to stop (about v² / 2a),
 * and the swing across the motion is slower the faster the rider goes (more momentum to turn against).
 */
export const BRAKE = Object.freeze({
 YAW_RATE: 5,         // rad/s, how fast full brake turns the equipment toward across the fall line, at rest
 YAW_SPEED: 18,       // m/s, at this speed the swing is half as fast (YAW_RATE / (1 + speed / YAW_SPEED))
 TARGET_ANGLE: Math.PI / 2, // rad, angle from the fall line the equipment turns to at full brake (across it)
 SKID_DECEL: 13.5,    // m/s², deceleration at full brake with the equipment square across the motion, on firm snow
});

/** The edge and carve (F6, H2; sim/edge.js): steering tips the equipment on edge, the sidecut turns it. */
export const EDGE = Object.freeze({
 MAX_EDGE: 1.1,       // rad (63 degrees), the edge angle at full steer
 PIVOT_RATE: 1,       // rad/s at full steer, standing still: a pivot when too slow to carve
 PIVOT_FADE: 5,       // m/s, the pivot is gone by this speed: faster, the equipment turns only by its edge
 OVERDRIVE: 1.0,     // dimensionless, the rider tips the edge no further than asks this times what the snow holds
 MIN_CAP: 0.35,       // rad, however fast, the steer can always tip the edge this far
 FLAT_BITE: 0.45,     // 0..1 of edgeGrip a flat base holds sideways (the edges still touch the snow)
 FULL_BITE: 0.6,      // rad of edge at which the edge holds all of edgeGrip
 CARVE_DRAG: 0.03,    // dimensionless, speed lost to the snow per m/s² of sideways force the edge holds
 MAX_SLIP: 1,         // rad, in a skid the equipment turns no further than this from the direction of travel
 SPRAY_SKID: 1.5,     // m/s of sideways slip (rider.skid), more than this sprays snow
 SPRAY_CARVE: 14,     // m/s², a carve pulling harder than this throws a thin spray off the edge
 SPRAY_CARVE_RATE: 6, // particles per s per m/s² of pull past SPRAY_CARVE
});

/**
 * Loose snow (H2, sim/contact.js): the equipment sinks into powder (world/snow.js terrain.powder) and planes up out of
 * it with speed. Sunk, it ploughs: drag along the motion, a soft wall against sideways slip, a weaker edge, a slower
 * swing. Light powder (about 10 cm) slows and softens a little; deep powder (half a metre) bogs a slow rider down.
 */
export const SNOW = Object.freeze({
 SINK_MIN: 0.3,       // 0..1 of the depth the equipment stays sunk even when planing
 SINK_TIME: 0.15,     // s, how fast the sink follows (the snow takes time to give or to lift the equipment)
 DRAG: 2.4,           // 1/(m·s): drag deceleration per m sunk per m/s (plus DRAG_SPEED), along the motion
 DRAG_SPEED: 1.5,     // m/s added to the speed in the drag, so a crawl still ploughs
 PLOUGH: 30,          // 1/(m·s): deceleration of sideways slip per m sunk per m/s of slip (the snow wall)
 HOLD_LOSS: 0.6,      // 0..1 of the edge's grip lost when sunk HOLD_SINK or more (the edge has no firm snow)
 HOLD_SINK: 0.25,     // m
 YAW_LAG: 5,          // 1/m, the swing is (1 + YAW_LAG * sink) times slower sunk in the snow
 SPRAY_RATE: 10,      // particles per s per m sunk per m/s, the powder thrown up by the equipment
 SPRAY_TURN: 2.5,     // extra particles per s per rad/s of turn per m sunk per m/s (the plume out of a turn)
 SPRAY_DEEP: 0.35,    // m of loose snow from which the spray is a slow, big plume (as world/snow.js DEEP_FROM)
});

/** Flips (F3, sim/jump.js): InputState.flip turns the rider about its across axis in the air. */
export const FLIP = Object.freeze({
 RATE: 7,             // rad/s at full flip (input.flip 1 or -1), + a front flip: one rotation in about 0.9 s
 LAND_WINDOW: 40 * Math.PI / 180, // rad (40 degrees), within this of a whole rotation is clean, beyond it a crash
 POINTS: 90,          // points for the first rotation; n rotations score POINTS * n * (n + 1) / 2 (90, 270, 540, ...)
});

/**
 * Grinds (K3, sim/grind.js): on a rail or box the rider moves along its polyline. Gravity along the segment's slope and
 * the friction of the surface (a round rail is slicker than a plastic box top) set the speed; the balance (-1..1, off
 * at +-1) drifts with leaning more or less than a bend needs and with the board off its line, and settles back on its
 * own. Gravity along a rail is GRAVITY * GRAVITY_GAIN, as on the snow, so a down rail is as quick as the slope.
 */
export const GRIND = Object.freeze({
 RAIL_FRICTION: 0.06, // dimensionless, friction coefficient of a round rail (deceleration RAIL_FRICTION g on the flat)
 BOX_FRICTION: 0.13,  // dimensionless, of a box top: a flat box slows the rider to a stop in about v / 2 s
 AIR_DRAG: 0.0035,    // 1/m, air drag on the rail: fraction of speed lost per second per m/s (as on the snow)
 STALL_SPEED: 0.6,    // m/s, slower than this the rider steps off the side
 MAX_LEAN: 0.6,       // rad, the lean into a bend at full steer
 LEAN_RATE: 4,        // rad/s, how fast the lean follows the steer
 ALIGN_RATE: 2,       // 1/s, how fast the board swings onto its grind's line (lined up or square across)
 BALANCE_LEAN: 3,     // 1/s of balance per unit of tan(lean) more than the bend needs (leaning left tips it +)
 BALANCE_MISALIGN: 3, // 1/s of balance per rad of the board off its line (counter-clockwise tips it +)
 BALANCE_RECOVER: 1.2, // 1/s, the balance settles back toward 0 at this rate: a lean off by under 0.4 (tan) holds
 CRASH_PUSH: 2.5,     // 1/s, losing balance pushed harder than this (the drift before it settles back) is a crash
 DROP_SIDE_SPEED: 1.5, // m/s, sideways push when the rider drops off the side
 KINK_MIN: 0.05,      // rad, a change of slope at a vertex counts as a kink from this angle
 LIFT_MIN_SPEED: 1,   // m/s, a convex kink throws the rider up off the rail when it would at this speed or more
 LAND_ALIGN: 0.6,     // rad, after a lift the board must land within this of a grind's line (lined up or across)
});
