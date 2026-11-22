// The GPU terrain's texture memory: the bytes of every texture it makes, from the grid's size and formats, and the
// budget they must fit (docs/adr/0008-three-js-gpu-renderer.md). Pure: numbers in, numbers out.
import { DETAIL_SIZE } from './detail-texture.js';
import { PISTE_STEP_M } from './terrain-bake.js';

const MIB = 1048576; // bytes in one MiB
/** The most GPU texture memory the terrain may use, MiB (1 MiB = 1048576 B): the procedural map takes about 38. */
export const GL_TEXTURE_BUDGET_MB = 64;
export const GL_TEXTURE_BUDGET_BYTES = GL_TEXTURE_BUDGET_MB * MIB; // bytes

// Bytes per texel of each texture (gl-renderer.js makeTextures): the format's size, and the CPU copy kept for it.
const HEIGHT_BYTES = 4;  // R32F, one 32-bit float
const SLOPE_BYTES = 4;   // RG16F, two half floats
const AUX_BYTES = 4;     // RGBA8: relief, groomed, ski tracks, unused
const PAINT_BYTES = 4;   // RGBA8: the colour map and its feature weight
const PISTE_BYTES = 2;   // R16F, one half float, on a PISTE_STEP_M grid
const DETAIL_BYTES = 4;  // RGBA8, with a mipmap chain
const MIPMAP_CHAIN = 4 / 3; // a full mipmap chain adds a third

/**
 * The texture memory (bytes) of the GPU terrain for a map grid of nx × ny texels: {gpuBytes (all textures on the GPU,
 * the detail texture with its mipmaps), cpuBytes (the arrays kept on the CPU to rebuild them after a lost context)}.
 */
export function terrainTextureBytes(nx, ny) {
 const texels = nx * ny;
 const pisteTexels = (Math.ceil(nx / PISTE_STEP_M) + 1) * (Math.ceil(ny / PISTE_STEP_M) + 1);
 const detailTexels = DETAIL_SIZE * DETAIL_SIZE;
 const grid = texels * (HEIGHT_BYTES + SLOPE_BYTES + AUX_BYTES + PAINT_BYTES);
 const piste = pisteTexels * PISTE_BYTES;
 return {
  gpuBytes: grid + piste + Math.round(detailTexels * DETAIL_BYTES * MIPMAP_CHAIN),
  cpuBytes: grid + piste + detailTexels * DETAIL_BYTES,
 };
}

/** True if a map grid of nx × ny texels fits GL_TEXTURE_BUDGET_MB. */
export function fitsTextureBudget(nx, ny) {
 return terrainTextureBytes(nx, ny).gpuBytes <= GL_TEXTURE_BUDGET_BYTES;
}

/** Throws if a map grid of nx × ny texels needs more GPU texture memory than the budget; else returns its bytes. */
export function checkTextureBudget(nx, ny) {
 const bytes = terrainTextureBytes(nx, ny);
 if (bytes.gpuBytes > GL_TEXTURE_BUDGET_BYTES) {
  const mib = Math.ceil(bytes.gpuBytes / MIB);
  throw new Error('GL terrain: textures need ' + mib + ' MiB, over the ' + GL_TEXTURE_BUDGET_MB + ' MiB budget');
 }
 return bytes;
}
