// Loose snow on the terrain: how deep the powder lies off the groomed piste, light or deep, from the map's shape.
import { vn } from './noise.js';

/**
 * The powder model's tunables. Depth is the loose snow over the firm base (m). Off the piste it is LIGHT_M of fresh
 * snow, rising to DEEP_M in patches PATCH_M across (where the storm loaded the slope), deeper in hollows and thinner on
 * ridges (the wind moves it), and shed from slopes steeper than SHED_FROM. Grooming packs it: depth * (1 - groomed).
 */
export const POWDER = Object.freeze({
 LIGHT_M: 0.12,       // m, fresh snow off the piste outside the deep patches
 DEEP_M: 0.55,        // m, in the middle of a deep patch
 MAX_M: 0.9,          // m, the deepest anywhere (a loaded hollow)
 MIN_M: 0.04,         // m, the thinnest off the piste (a scoured ridge)
 PATCH_M: 150,        // m, the size of the deep patches (value-noise lattice on the map's grid)
 DETAIL_M: 45,        // m, the smaller noise that breaks their edges
 PATCH_FROM: 0.5,     // 0..1 of the noise where a patch starts
 PATCH_TO: 0.66,      // 0..1 of the noise where it is fully deep
 HOLLOW_R_M: 14,      // m, how far around the snow the hollow test looks
 HOLLOW_GAIN: 0.2,    // m of depth per m the snow lies below its surroundings (a ridge gets as much less)
 HOLLOW_MOST_M: 0.25, // m, the most a hollow adds
 RIDGE_MOST_M: 0.07,  // m, the most a ridge takes away (the wind scours it, it is not bare)
 SHED_FROM: 1,        // m/m (45 degrees), steeper slopes start to shed snow
 SHED_TO: 1.8,        // m/m (61 degrees), and hold only MIN_M
 LIGHT_BELOW: 0.25,   // m, shallower than this is light powder (snowKind)
 DEEP_FROM: 0.35,     // m, deeper than this is deep powder (snowKind)
});

const smooth = (a, b, x) => {
 const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
 return t * t * (3 - 2 * t);
};

/**
 * The powder depth function (x, y) -> m for a terrain: height(x, y) (m) and gradient(x, y, out) of its smooth surface,
 * groomed(x, y) (0..1), and bounds (terrain.js mapBounds), which place the noise on the map's grid so a rotated map
 * has the same snow. Allocates nothing per call. Costs about five height samples.
 */
export function powderDepth(height, gradient, groomed, bounds) {
 const g = { gx: 0, gy: 0 };
 const R = POWDER.HOLLOW_R_M;
 return function powder(x, y) {
  const packed = 1 - groomed(x, y);
  if (packed <= 0) return 0;
  const ex = x - bounds.x0;
  const ey = y - bounds.y0;
  const a = ex * bounds.ax + ey * bounds.ay; // m across the map's grid
  const b = ex * bounds.bx + ey * bounds.by; // m down it
  const n = vn(a / POWDER.PATCH_M, b / POWDER.PATCH_M) * 0.7 + vn(a / POWDER.DETAIL_M + 31, b / POWDER.DETAIL_M) * 0.3;
  let d = POWDER.LIGHT_M + (POWDER.DEEP_M - POWDER.LIGHT_M) * smooth(POWDER.PATCH_FROM, POWDER.PATCH_TO, n);
  const h = height(x, y);
  const ax = bounds.ax * R;
  const ay = bounds.ay * R;
  const bx = bounds.bx * R;
  const by = bounds.by * R;
  const across = height(x + ax, y + ay) + height(x - ax, y - ay);
  const down = height(x + bx, y + by) + height(x - bx, y - by);
  const around = (across + down) / 4;
  d += Math.max(-POWDER.RIDGE_MOST_M, Math.min(POWDER.HOLLOW_MOST_M, POWDER.HOLLOW_GAIN * (around - h)));
  gradient(x, y, g);
  const shed = smooth(POWDER.SHED_FROM, POWDER.SHED_TO, Math.hypot(g.gx, g.gy));
  d = d * (1 - shed) + POWDER.MIN_M * shed;
  return Math.max(POWDER.MIN_M, Math.min(POWDER.MAX_M, d)) * packed;
 };
}

/** 'groomed' (under 2 cm of loose snow), 'light' or 'deep' powder, or 'mid' between them, for a depth (m). */
export function snowKind(depth) {
 if (depth < 0.02) return 'groomed';
 if (depth < POWDER.LIGHT_BELOW) return 'light';
 return depth >= POWDER.DEEP_FROM ? 'deep' : 'mid';
}
