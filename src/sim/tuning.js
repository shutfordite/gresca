// Sim feel tunables that live next to the sim (core/config.js keeps the shared ones): the brake, the edge and flips, each
// with its unit. The rig-specific edge data (sidecut, edge rate, edge grip) is in RIGS (core/config.js).

/** The brake (F5): a hockey stop or heel-side skid, the equipment yawed across the fall line. */
export const BRAKE = Object.freeze({
 YAW_RATE: 4,         // rad/s, how fast full brake (input.brake 1) turns the equipment toward across the fall line
 TARGET_ANGLE: Math.PI / 2, // rad, angle from the fall line the equipment turns to at full brake (across it)
 SKID_RATE: 2.2,      // 1/s, sideways slip lost per second while skidding (the old BRAKE_GRIP, kept for the feel)
 SKID_DECEL: 14,      // m/s², extra deceleration at full brake with the equipment square across the motion
});

/** The edge and carve (F6, sim/edge.js): steering tips the equipment on edge, the sidecut turns it. */
export const EDGE = Object.freeze({
 MAX_EDGE: 1.1,       // rad (63 degrees), the edge angle at full steer
 PIVOT_RATE: 1,       // rad/s at full steer, the least the equipment turns: a pivot when too slow to carve
 MAX_SLIP: 1,         // rad, in a skid the equipment turns no further than this from the direction of travel
 SPRAY_SKID: 1.5,     // m/s of sideways slip (rider.skid), more than this sprays snow (a clean carve has none)
});

/** Flips (F3, sim/jump.js): InputState.flip turns the rider about its across axis in the air. */
export const FLIP = Object.freeze({
 RATE: 7,             // rad/s at full flip (input.flip 1 or -1), + a front flip: one rotation in about 0.9 s
 LAND_WINDOW: 40 * Math.PI / 180, // rad (40 degrees), a landing this close to a whole rotation is clean, further crashes
 POINTS: 90,          // points for the first rotation; n rotations score POINTS * n * (n + 1) / 2 (90, 270, 540, ...)
});
