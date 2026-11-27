// The baked sun visibility (sun-shadow.js, in the aux texture's alpha) as one lighting path for every GPU object: the
// GLSL chunk the tree and park shaders include, and its pure JS mirror (world xy to the aux texture's uv) for tests.

/**
 * GLSL: sunVisibilityAt(world xy m) -> 0..1 (1 in full sun) from the aux texture's alpha, the same uv as the snow's
 * (grid + 0.5) / uMapSize. Uniforms: uAux, uMapSize (texels), uGridOrigin (world m of grid (0, 0)), uGridU and uGridV
 * (world unit vectors of grid +u, +v). Either stage can include it.
 */
export const SUN_VISIBILITY_GLSL = `
precision highp sampler2D;
uniform sampler2D uAux;
uniform vec2 uMapSize;
uniform vec2 uGridOrigin;
uniform vec2 uGridU;
uniform vec2 uGridV;
float sunVisibilityAt(vec2 world) {
 vec2 d = world - uGridOrigin;
 vec2 grid = vec2(dot(d, uGridU), dot(d, uGridV));
 return texture(uAux, (grid + 0.5) / uMapSize).a;
}
`;

/**
 * GLSL: sunLit(normal, ambient, visibility) -> the light on a surface (0..1 RGB): the ambient (shade) up to the sun's
 * colour as the surface faces the sun, scaled by the visibility. Uniforms: uObjSun (unit vector toward the sun, world),
 * uObjSunLight (the sun's colour over its brightest channel).
 */
export const SUN_LIGHT_GLSL = `
uniform vec3 uObjSun;
uniform vec3 uObjSunLight;
vec3 sunLit(vec3 n, vec3 ambient, float visibility) {
 float facing = clamp(dot(n, uObjSun), 0.0, 1.0);
 return mix(ambient, uObjSunLight, facing * visibility);
}
`;

/**
 * The aux texture's uv (0..1, texel centres at (i + 0.5) / size) of world point (x, y) m on a map grid of nx × ny
 * texels, into out {u, v}: what sunVisibilityAt() computes. frame: the MapFrame. Allocates nothing.
 */
export function sunVisibilityUv(frame, x, y, nx, ny, out) {
 const dx = x - frame.originX;
 const dy = y - frame.originY;
 out.u = ((dx * frame.ux + dy * frame.uy) + 0.5) / nx;
 out.v = ((dx * frame.vx + dy * frame.vy) + 0.5) / ny;
 return out;
}

/**
 * The uniform values the chunk needs from the map: {origin [x, y], gridU [x, y], gridV [x, y]} (world m and unit
 * vectors). Pure.
 */
export function sunVisibilityGrid(frame) {
 return { origin: [frame.originX, frame.originY], gridU: [frame.ux, frame.uy], gridV: [frame.vx, frame.vy] };
}
