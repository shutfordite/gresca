// The brake: yaws the skis or board across the fall line and slows the rider by sideways skid friction (F5, H2).
import { TAU } from '../core/config.js';
import { BRAKE } from './tuning.js';

const HALF_PI = Math.PI / 2;

/** The brake strength 0..1 from input.brake (analog; 0 or 1 from today's controls). NaN and out-of-range give 0 or 1. */
export function brakeStrength(input) {
 const b = +input.brake;
 return b > 0 ? Math.min(1, b) : 0;
}

// An angle (rad) wrapped to (-PI, PI].
function wrapAngle(a) {
 const w = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
 return w === -Math.PI ? Math.PI : w;
}

/**
 * Turns the equipment (rider.heading, rad) toward across the fall line (fall: rad, the fall line's heading), on the
 * side it already points (the nearest of the two across directions). The equipment is a line, so pointing uphill counts
 * like pointing downhill. At brake strength b (0..1, > 0) it stops at b * TARGET_ANGLE from the fall line and never
 * turns back toward it. The swing is slower at speed (m/s, default 0): YAW_RATE / (1 + speed / YAW_SPEED). Changes
 * rider.heading only. dt: s.
 */
export function brakeYaw(rider, brake, fall, dt, speed = 0) {
 const rel = wrapAngle(rider.heading - fall);
 const side = rel >= 0 ? 1 : -1;
 const fromAxis = Math.abs(rel) <= HALF_PI ? Math.abs(rel) : Math.PI - Math.abs(rel); // rad, 0 (down) to PI/2 (across)
 const goal = brake * BRAKE.TARGET_ANGLE;
 if (fromAxis >= goal) return;
 const rate = BRAKE.YAW_RATE / (1 + speed / BRAKE.YAW_SPEED); // rad/s
 const turn = Math.min(rate * brake * dt, goal - fromAxis);
 // |rel| grows toward PI/2 from below (pointing downhill) and shrinks toward it from above (pointing uphill)
 const growth = Math.abs(rel) <= HALF_PI ? 1 : -1;
 rider.heading += side * growth * turn;
}

/**
 * Skid friction at brake strength b on the velocity (vx, vy) m/s, the equipment pointing at heading (rad). The sideways
 * slip (the share of the velocity across the equipment, sin of the angle between them) is worn away at decel (m/s²,
 * default BRAKE.SKID_DECEL: firm snow; less where the edge has no firm snow, more where powder ploughs), taken off the
 * speed along the direction of travel: the rider slides on, not turned along the board. The deceleration does not grow
 * with speed, so stopping takes about speed² / (2 decel). Returns the factor 0..1 to multiply the velocity by. dt: s.
 */
export function skidKept(vx, vy, heading, brake, dt, decel = BRAKE.SKID_DECEL) {
 const speed = Math.hypot(vx, vy);
 if (speed <= 0) return 0;
 const slipFraction = Math.abs(vx * Math.sin(heading) - vy * Math.cos(heading)) / speed;
 const loss = decel * slipFraction * brake * dt; // m/s
 return speed <= loss ? 0 : (speed - loss) / speed;
}
