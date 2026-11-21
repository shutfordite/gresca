// The snow's detail texture, made at boot with no image file: wind ripples and crust, tiling, as RGBA bytes.
// r, g: the detail surface's slope across and along the tile (128 = flat, scaled so the steepest texel fills the
// byte; the shader sets the strength), b: crust brightness grain (128 = mean), a: a per-texel random for sparkle.
// Every wave and noise lattice has a whole number of periods per tile, so the tile repeats with no seam.
import { hash } from '../../world/noise.js';

export const DETAIL_SIZE = 256;   // texels per side (a power of two: mipmapped)
const RIPPLES = Object.freeze([   // [periods across, periods along, amplitude, warp]: long wind ripples, mostly one way
 [2, 11, 1.0, 0.9], [-1, 14, 0.6, 0.7], [3, 19, 0.35, 0.5], [1, 27, 0.2, 0.4],
].map(Object.freeze));
const WARP_CELLS = 4;             // lattice cells per tile of the noise that bends the ripples
const WARP_RAD = 2.2;             // rad, how far the noise bends a ripple's phase
const CRUST_CELLS = Object.freeze([32, 64]);     // lattice cells per tile of the crust's two noise octaves
const CRUST_AMP = Object.freeze([0.12, 0.06]);   // their height, relative to the main ripple
const GRAIN_CELLS = 48;           // lattice cells per tile of the brightness grain

// Periodic value noise 0..1 at (x, y) (tile fractions 0..1) on a lattice of n cells per tile, seed s.
function valueNoise(x, y, n, s) {
 const fx = x * n;
 const fy = y * n;
 const ix = Math.floor(fx);
 const iy = Math.floor(fy);
 const tx = fx - ix;
 const ty = fy - iy;
 const sx = tx * tx * (3 - 2 * tx);
 const sy = ty * ty * (3 - 2 * ty);
 const at = (a, b) => hash(((a % n) + n) % n + s * 977, ((b % n) + n) % n + s * 613);
 const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
 const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
 return top + (bottom - top) * sy;
}

// The detail surface's height at tile fractions (x, y): warped ripples plus crust.
function detailHeight(x, y) {
 const warp = (valueNoise(x, y, WARP_CELLS, 1) - 0.5) * 2 * WARP_RAD;
 let h = 0;
 for (const [a, b, amp, w] of RIPPLES) {
  const phase = 2 * Math.PI * (a * x + b * y) + warp * w;
  // a ripple has a steep lee side and a gentle windward one
  const s = Math.sin(phase);
  h += amp * (s + 0.35 * Math.sin(2 * phase)) * (0.6 + 0.8 * valueNoise(x, y, WARP_CELLS * 2, 3 + a));
 }
 for (let o = 0; o < CRUST_CELLS.length; o++) h += CRUST_AMP[o] * (valueNoise(x, y, CRUST_CELLS[o], 7 + o) - 0.5);
 return h;
}

/** The detail texture: Uint8Array DETAIL_SIZE² × 4 (RGBA, rows of y). Pure and deterministic. */
export function makeDetailTexture() {
 const n = DETAIL_SIZE;
 const height = new Float32Array(n * n);
 for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) height[j * n + i] = detailHeight(i / n, j / n);
 const slope = new Float32Array(n * n * 2);
 let steepest = 1e-6;
 for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
   const k = j * n + i;
   const du = (height[j * n + (i + 1) % n] - height[j * n + (i + n - 1) % n]) / 2;
   const dv = (height[((j + 1) % n) * n + i] - height[((j + n - 1) % n) * n + i]) / 2;
   slope[k * 2] = du;
   slope[k * 2 + 1] = dv;
   steepest = Math.max(steepest, Math.abs(du), Math.abs(dv));
  }
 }
 const out = new Uint8Array(n * n * 4);
 for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
   const k = j * n + i;
   out[k * 4] = Math.round(128 + slope[k * 2] / steepest * 127);
   out[k * 4 + 1] = Math.round(128 + slope[k * 2 + 1] / steepest * 127);
   out[k * 4 + 2] = Math.round(255 * valueNoise(i / n, j / n, GRAIN_CELLS, 11));
   out[k * 4 + 3] = Math.floor(hash(i + 4099, j + 8191) * 256) & 255;
  }
 }
 return out;
}
