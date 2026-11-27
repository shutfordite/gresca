// Snow spray as a fixed pool of typed arrays (nothing allocated after createSpray()): emit() adds particles drawn from
// the seeded RNG, stepParticles() moves them and compacts the dead ones out; clearSpray(), sprayCount() and
// sprayCopies() are how the game and the façade reach it, sprayPool() how the view draws it.
import { MAX_PARTICLES } from '../core/config.js';
import { rnd } from '../core/rng.js';

const SPRAY_GRAVITY = 6;  // m/s², spray falls slower than the rider (it is light and drifts)
const SPRAY_DRAG = 0.96;  // dimensionless, horizontal speed kept per step
const SPRAY_FLOOR_M = -0.2; // m, a particle this far below the snow is gone

/**
 * The pool (spray.particles): `count` live particles at index 0 to count - 1, oldest first, each one value at that
 * index in every array. Float64Array, not Float32Array, so every value is bit for bit what a plain number gave.
 * Arrays and units: x, y, z (m, z above the ground), vx, vy, vz (m/s), t (s of age), life (s), r (dimensionless: the
 * drawn size, times a plain puff's). The arrays are never replaced and count never exceeds MAX_PARTICLES (360: the
 * measured peak is about 76 in 10 s of hard riding in deep powder, plus landing and rail bursts of 8 to 12).
 * @typedef {{count: number, x: Float64Array, y: Float64Array, z: Float64Array, vx: Float64Array, vy: Float64Array,
 *   vz: Float64Array, t: Float64Array, life: Float64Array, r: Float64Array}} ParticlePool
 */

/**
 * Adds up to n particles to spray.particles (at most MAX_PARTICLES alive) at (px,py) (m), pz m above the ground,
 * with random horizontal speed up to spread/2 (m/s) around (dvx,dvy) and upward speed up to `up` (m/s); size and life
 * (default 1) scale the puff's drawn size (each particle's r) and how long it lives. Draws from spray.rng.
 * When the pool is full the new particles are dropped (the live ones keep their place) and draw nothing from the rng.
 */
export function emit(spray, n, px, py, pz, spread, up, dvx, dvy, size = 1, life = 1) {
 const p = spray.particles;
 const rng = spray.rng;
 for (let k = 0; k < n && p.count < MAX_PARTICLES; k++) {
  const i = p.count++;
  p.x[i] = px;
  p.y[i] = py;
  p.z[i] = pz;
  p.vx[i] = dvx + (rnd(rng) - 0.5) * spread;
  p.vy[i] = dvy + (rnd(rng) - 0.5) * spread;
  p.vz[i] = up * (0.4 + rnd(rng) * 0.6);
  p.t[i] = 0;
  p.life[i] = (0.45 + rnd(rng) * 0.4) * life;
  p.r[i] = size; // dimensionless, the drawn size, times a plain puff's
 }
}

/**
 * Advances every particle in the pool p by dt (s) and removes the dead ones (mutates p). The survivors are compacted
 * in order, not swapped into the gaps, so the oldest stay first and are drawn first, as before.
 */
export function stepParticles(p, dt) {
 let n = 0;
 for (let i = 0; i < p.count; i++) {
  const t = p.t[i] + dt;
  const z = p.z[i] + p.vz[i] * dt;
  if (t > p.life[i] || z < SPRAY_FLOOR_M) continue; // dies: the next survivor overwrites its slot
  p.x[n] = p.x[i] + p.vx[i] * dt;
  p.y[n] = p.y[i] + p.vy[i] * dt;
  p.z[n] = z;
  p.vz[n] = p.vz[i] - SPRAY_GRAVITY * dt;
  p.vx[n] = p.vx[i] * SPRAY_DRAG;
  p.vy[n] = p.vy[i] * SPRAY_DRAG;
  p.t[n] = t;
  p.life[n] = p.life[i];
  p.r[n] = p.r[i];
  n++;
 }
 p.count = n;
}

/** Advances spray by dt (s): stepParticles() on its live particles (mutates spray). */
export function stepSpray(spray, dt) {
 stepParticles(spray.particles, dt);
}

/** A new, empty spray drawing from rng (core/rng.js): the one allocation, MAX_PARTICLES long. */
export function createSpray(rng) {
 const a = () => new Float64Array(MAX_PARTICLES);
 return { particles: { count: 0, x: a(), y: a(), z: a(), vx: a(), vy: a(), vz: a(), t: a(), life: a(), r: a() }, rng };
}

/** Removes every live particle from spray (mutates it); draws nothing from its RNG. */
export function clearSpray(spray) {
 spray.particles.count = 0;
}

/** The number of live particles in spray. */
export function sprayCount(spray) {
 return spray.particles.count;
}

/** The ParticlePool of spray, for the view to read: loop i < pool.count over its arrays (read only). */
export function sprayPool(spray) {
 return spray.particles;
}

/** Copies of spray's live particles, oldest first: {x, y, z (m), vx, vy, vz (m/s), t, life (s)}. Façade only. */
export function sprayCopies(spray) {
 const p = spray.particles;
 return Array.from({ length: p.count }, (_, i) => (
  { x: p.x[i], y: p.y[i], z: p.z[i], vx: p.vx[i], vy: p.vy[i], vz: p.vz[i], t: p.t[i], life: p.life[i] }));
}
