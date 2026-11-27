// The sun's cast shadows on the GL terrain, baked once at boot into the aux texture's alpha (no extra texture): a soft
// horizon term from the height grid (a ridge shades the snow behind it) and a soft elongated shadow per tree, both
// along the Look's sun on the map's grid. Pure: typed arrays in, typed arrays out, no GL, no frame knowledge (the sun
// comes in as a unit vector toward it on the grid, snow-material.js sunOnGrid).
// Visibility is a byte per grid texel: 255 in full sun, 0 in full shadow.

/** Tunables of the baked shadows. Slopes are m/m (rise over run); lengths and widths are metres on the grid. */
export const SUN_SHADOW = Object.freeze({
 SUN_RAYS: 7,             // rays across the sun's soft disc: each is one sweep of the grid (more: smoother edges)
 PENUMBRA_SLOPE: 0.12,    // m/m, the angular width of the soft edge (the sun is a soft lamp, not a point): +-3.4 deg
 DEPTH_SOFT_M: 1.5,       // m of depth under a ray's plane over which that ray's shadow fades in (0 on it, 1 below)
 TREE_HEIGHT_M: 9,        // m, a tree's height (the same as the sprite, draw.js TREE_HEIGHT_M)
 TREE_MAX_LENGTH_M: 22,   // m, a tree's shadow is never longer than this (the sun is low: a forest stays readable)
 TREE_ROOT_HALF_WIDTH_M: 1.5, // m, half the shadow's width at the trunk (the crown's radius)
 TREE_TIP_HALF_WIDTH_M: 0.3,  // m, half the shadow's width at its tip
 TREE_SOFT_ROOT_M: 0.3,   // m, half the soft edge's width at the trunk
 TREE_SOFT_PER_M: 0.12,   // m of soft edge per m along the shadow (the tree's top is further up, so blurrier)
 TREE_STRENGTH: 0.55,     // 0..1, how much sun one tree's shadow takes away at its root
 TREE_TIP_FADE_FROM: 0.4, // 0..1 of the length where the shadow starts to fade out toward the tip
});

const BYTE = 255;
const NO_RAY_M = -1e9; // m, a plane no ray has reached (finite: it is multiplied by 0 in the blend)

// The horizontal unit vector toward the sun and the slope of the sun's rays (up / horizontal), or null for a sun
// straight overhead (nothing is shaded).
function sunRays(sun) {
 const flat = Math.hypot(sun[0], sun[1]);
 if (flat < 1e-6) return null;
 return { du: sun[0] / flat, dv: sun[1] / flat, tan: sun[2] / flat };
}

// One sweep of the shadow plane toward the sun for one sun slope: plane[j] along the line of texels at the sweep's
// current step is the highest sun ray (m) passing over that texel, from every height nearer the sun (incoming: the
// same without the texel's own height, the plane that shades it). The next line's
// plane is read where the ray toward the sun crosses it (linear between two texels), lowered by the ray's fall.
// The sweep runs in the grid direction the sun is mostly in: u when |du| >= |dv|, else v.
function sweepLine(heightRow, prev, next, incoming, count, shift, fall) {
 for (let t = 0; t < count; t++) {
  const at = t + shift;
  const lo = Math.floor(at);
  const frac = at - lo;
  let plane = NO_RAY_M;
  if (lo >= 0 && lo + 1 < count) plane = prev[lo] * (1 - frac) + prev[lo + 1] * frac - fall;
  else if (lo === count - 1 && frac === 0) plane = prev[lo] - fall;
  incoming[t] = plane;
  next[t] = Math.max(heightRow[t], plane);
 }
}

/**
 * The sun visibility of every grid point of heights (m, nx × ny): 255 lit, 0 shadowed, soft between. sun: the unit
 * vector toward the sun on the grid [u, v, up]. The sun is not a point: its rays are spread over PENUMBRA_SLOPE of
 * slope (SUN_RAYS rays), each casts a hard shadow (a plane that falls away from every height toward the sun, swept
 * once across the grid in O(texels)), and the visibility is the share of rays that reach the texel, each softened
 * by DEPTH_SOFT_M of depth. So a shadow's edge is wider the further it lies from what casts it. out (optional): a
 * Uint8Array nx × ny to fill. Returns it.
 */
export function bakeSunVisibility(heights, nx, ny, sun, out = new Uint8Array(nx * ny)) {
 out.fill(BYTE);
 const rays = sunRays(sun);
 if (rays === null) return out;
 const S = SUN_SHADOW;
 const alongU = Math.abs(rays.du) >= Math.abs(rays.dv); // the sweep's axis: lines are columns (u) or rows (v)
 const lines = alongU ? nx : ny;
 const count = alongU ? ny : nx;
 const toward = alongU ? Math.sign(rays.du) : Math.sign(rays.dv);
 const main = Math.abs(alongU ? rays.du : rays.dv);
 const shift = (alongU ? rays.dv : rays.du) / main; // texels sideways per line step toward the sun
 const fallPerSlope = 1 / main; // m of horizontal run per line step
 const row = new Float32Array(count);
 const incoming = new Float32Array(count);
 const blocked = new Float32Array(count);
 const slopes = [];
 const prev = [];
 const next = [];
 for (let ray = 0; ray < S.SUN_RAYS; ray++) {
  slopes.push(Math.max(0.01, rays.tan + S.PENUMBRA_SLOPE * (ray / (S.SUN_RAYS - 1) - 0.5)));
  prev.push(new Float32Array(count).fill(NO_RAY_M));
  next.push(new Float32Array(count));
 }
 for (let n = 0; n < lines; n++) {
  const line = toward > 0 ? lines - 1 - n : n;
  for (let t = 0; t < count; t++) row[t] = heights[alongU ? t * nx + line : line * nx + t];
  blocked.fill(0);
  for (let ray = 0; ray < S.SUN_RAYS; ray++) {
   sweepLine(row, prev[ray], next[ray], incoming, count, shift, slopes[ray] * fallPerSlope);
   for (let t = 0; t < count; t++) blocked[t] += Math.max(0, Math.min(1, (incoming[t] - row[t]) / S.DEPTH_SOFT_M));
   const done = prev[ray];
   prev[ray] = next[ray];
   next[ray] = done;
  }
  for (let t = 0; t < count; t++) {
   out[alongU ? t * nx + line : line * nx + t] = Math.round((1 - blocked[t] / S.SUN_RAYS) * BYTE);
  }
 }
 return out;
}

// One tree's soft shadow at grid (tu, tv): takes sun away from the texels in vis along the ray away from the sun.
function castOneTree(vis, nx, ny, tu, tv, rays, length) {
 const S = SUN_SHADOW;
 const awayU = -rays.du;
 const awayV = -rays.dv;
 const pad = S.TREE_ROOT_HALF_WIDTH_M + S.TREE_SOFT_ROOT_M + S.TREE_SOFT_PER_M * length + 1;
 const u0 = Math.max(0, Math.floor(Math.min(tu, tu + awayU * length) - pad));
 const u1 = Math.min(nx - 1, Math.ceil(Math.max(tu, tu + awayU * length) + pad));
 const v0 = Math.max(0, Math.floor(Math.min(tv, tv + awayV * length) - pad));
 const v1 = Math.min(ny - 1, Math.ceil(Math.max(tv, tv + awayV * length) + pad));
 for (let v = v0; v <= v1; v++) {
  for (let u = u0; u <= u1; u++) {
   const du = u + 0.5 - tu;
   const dv = v + 0.5 - tv;
   const along = du * awayU + dv * awayV;
   const across = -du * awayV + dv * awayU;
   const cover = treeShadowCover(along, across, length);
   if (cover <= 0) continue;
   const k = v * nx + u;
   vis[k] = Math.round(vis[k] * (1 - S.TREE_STRENGTH * cover));
  }
 }
}

/**
 * How much of a tree's shadow covers the point `along` m away from the trunk (away from the sun) and `across` m to the
 * side, 0..1; length (m) is the shadow's length. 1 at the trunk, tapering and fading to the tip, soft at the edges
 * (wider soft edge further out), 0 past the tip. Pure.
 */
export function treeShadowCover(along, across, length) {
 const S = SUN_SHADOW;
 if (along > length + S.TREE_SOFT_ROOT_M + S.TREE_SOFT_PER_M * length) return 0;
 const t = Math.max(0, Math.min(1, along / length));
 const halfWidth = S.TREE_ROOT_HALF_WIDTH_M + (S.TREE_TIP_HALF_WIDTH_M - S.TREE_ROOT_HALF_WIDTH_M) * t;
 const soft = S.TREE_SOFT_ROOT_M + S.TREE_SOFT_PER_M * Math.max(0, along);
 const behind = Math.min(0, along); // behind the trunk the shadow is a rounded end
 const sideways = Math.hypot(across, behind);
 const edge = Math.max(0, Math.min(1, 0.5 + (halfWidth - sideways) / (2 * soft)));
 const fadeT = Math.max(0, Math.min(1, (t - S.TREE_TIP_FADE_FROM) / (1 - S.TREE_TIP_FADE_FROM)));
 return edge * (1 - fadeT * fadeT * (3 - 2 * fadeT));
}

/**
 * Casts a soft shadow from every tree onto vis (the sun visibility, nx × ny bytes, changed in place) along the sun's
 * ray: away from the sun, as long as the tree's height over the sun's slope (at most TREE_MAX_LENGTH_M). trees: grid
 * positions u, v (m) interleaved, in any order. sun: the unit vector toward the sun on the grid [u, v, up].
 */
export function castTreeShadows(vis, nx, ny, trees, sun) {
 const rays = sunRays(sun);
 if (rays === null) return vis;
 const length = Math.min(SUN_SHADOW.TREE_MAX_LENGTH_M, SUN_SHADOW.TREE_HEIGHT_M / rays.tan);
 for (let n = 0; n + 1 < trees.length; n += 2) castOneTree(vis, nx, ny, trees[n], trees[n + 1], rays, length);
 return vis;
}
