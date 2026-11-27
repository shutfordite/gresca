// The rider's soft shadow on the GL terrain: where it falls, how big, how dark and how soft, from the rider's height
// above the ground and the sun. The snow shader draws it per pixel (snow-material.js); this is the pure part.

/** Tunables of the rider's shadow. Lengths are metres on the ground, air is the rider's height above it. */
export const RIDER_SHADOW = Object.freeze({
 ALONG_M: 0.95,          // m, the shadow's half-length along the sun's ray on the ground
 ACROSS_M: 0.5,          // m, its half-width across it
 STRENGTH: 0.5,          // 0..1, how much sun it takes away on the ground (the CPU renderer's ellipse is 0.55)
 SOFT_GROUND: 0.2,       // 0..1 of the radius, half the soft edge's width on the ground
 SOFT_PER_M: 0.18,       // more soft edge per m of air
 SOFT_MAX: 1,            // 0..1, the softest edge (the whole radius: a haze)
 GROW_PER_M: 0.12,       // the radii grow by this share per m of air (a higher body throws a bigger, blurrier one)
 FADE_PER_M: 0.3,        // strength is divided by 1 + this per m of air
});

/**
 * Fills out with the rider's shadow for the sun and the rider air m above the ground (air >= 0): {du, dv (m on the
 * grid, from the rider's ground point to the shadow's centre: away from the sun by air over the sun's slope),
 * axisU, axisV (unit, the shadow's long axis on the grid, away from the sun), along, across (m, radii), strength
 * (0..1), soft (0..1 of the radius)}. sun: the unit vector toward the sun on the grid [u, v, up]. Allocates nothing.
 */
export function riderShadow(air, sun, out) {
 const R = RIDER_SHADOW;
 const flat = Math.hypot(sun[0], sun[1]);
 const h = Math.max(0, air);
 const lean = flat < 1e-6 ? 0 : h / (sun[2] / flat); // m on the ground the shadow slides away from the rider
 out.axisU = flat < 1e-6 ? 1 : -sun[0] / flat;
 out.axisV = flat < 1e-6 ? 0 : -sun[1] / flat;
 out.du = out.axisU * lean;
 out.dv = out.axisV * lean;
 const grow = 1 + R.GROW_PER_M * h;
 out.along = R.ALONG_M * grow;
 out.across = R.ACROSS_M * grow;
 out.strength = R.STRENGTH / (1 + R.FADE_PER_M * h);
 out.soft = Math.min(R.SOFT_MAX, R.SOFT_GROUND + R.SOFT_PER_M * h);
 return out;
}
