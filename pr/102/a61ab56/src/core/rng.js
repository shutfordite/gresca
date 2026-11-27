// Seeded random numbers (mulberry32): everything random in the simulation draws from rnd(rng), never Math.random(),
// so a run replays exactly from its seed.

const MULBERRY_INCREMENT = 0x6D2B79F5;
const TWO_POW_32 = 4294967296;

/** A new generator {seed, state}: 32 bits of state, reseeded from seed by reseed(). */
export function createRng(seed = 1) {
 return { seed: seed >>> 0, state: seed >>> 0 };
}

/** Restarts rng from its seed (writes rng.state). */
export function reseed(rng) {
 rng.state = rng.seed >>> 0;
}

/** 0..1 (1 excluded), the next number from rng; advances rng.state. */
export function rnd(rng) {
 let t = rng.state = (rng.state + MULBERRY_INCREMENT) | 0;
 t = Math.imul(t ^ (t >>> 15), t | 1);
 t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
 return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
}
