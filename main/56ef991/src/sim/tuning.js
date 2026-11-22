// Sim feel tunables that live next to the sim (core/config.js keeps the shared ones): the brake, each with its unit.

/** The brake (F5): a hockey stop or heel-side skid, the equipment yawed across the fall line. */
export const BRAKE = Object.freeze({
 YAW_RATE: 4,         // rad/s, how fast full brake (input.brake 1) turns the equipment toward across the fall line
 TARGET_ANGLE: Math.PI / 2, // rad, angle from the fall line the equipment turns to at full brake (across it)
 SKID_RATE: 2.2,      // 1/s, sideways slip lost per second while skidding (the old BRAKE_GRIP, kept for the feel)
 SKID_DECEL: 14,      // m/s², extra deceleration at full brake with the equipment square across the motion
});
