// Snow spray: emit() adds particles drawn from the seeded RNG, stepParticles() moves them and lets them die.
import { MAX_PARTICLES } from '../core/config.js';
import { rnd } from '../core/rng.js';

const SPRAY_GRAVITY = 6;  // m/s², spray falls slower than the rider (it is light and drifts)
const SPRAY_DRAG = 0.96;  // dimensionless, horizontal speed kept per step
const SPRAY_FLOOR_M = -0.2; // m, a particle this far below the snow is gone

/**
 * Adds up to n particles to spray.particles (at most MAX_PARTICLES alive) at (px,py) (m), pz m above the ground,
 * with random horizontal speed up to spread/2 (m/s) around (dvx,dvy) and upward speed up to `up` (m/s); size and life
 * (default 1) scale the puff's drawn size (each particle's r) and how long it lives. Draws from spray.rng.
 */
export function emit(spray, n, px, py, pz, spread, up, dvx, dvy, size = 1, life = 1) {
 const parts = spray.particles;
 const rng = spray.rng;
 for (let k = 0; k < n && parts.length < MAX_PARTICLES; k++) {
  parts.push({
   x: px, y: py, z: pz,
   vx: dvx + (rnd(rng) - 0.5) * spread,
   vy: dvy + (rnd(rng) - 0.5) * spread,
   vz: up * (0.4 + rnd(rng) * 0.6),
   t: 0,
   life: (0.45 + rnd(rng) * 0.4) * life,
   r: size, // dimensionless, the drawn size, times a plain puff's
  });
 }
}

/** Advances every particle in parts by dt (s) and removes the dead ones (mutates parts). */
export function stepParticles(parts, dt) {
 for (let k = parts.length - 1; k >= 0; k--) {
  const p = parts[k];
  p.t += dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.vz -= SPRAY_GRAVITY * dt;
  p.vx *= SPRAY_DRAG;
  p.vy *= SPRAY_DRAG;
  if (p.t > p.life || p.z < SPRAY_FLOOR_M) parts.splice(k, 1);
 }
}
