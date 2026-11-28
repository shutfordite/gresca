// The park of one world: its jumps stamped into the terrain's `features` layer, and its resolved features
// (docs/adr/0012-park-features.md). One per world, made by createWorld() (state lives in the object, ADR 0002) and
// filled by build() once the base heights exist.
//
// THE SURFACE: `baseHeight` is the terrain WITHOUT this layer (the base grid). resolveFeatures() measures every world
// point from it, and the jump shapes (park/jump-shape.js) add their snow on top of it; so a jump's snow is
// baseHeight + shape, a rail's contact point is baseHeight + h, and K3's rail contact and K1's stamped snow are the
// same surface. The layer never reads the terrain it is part of.
import { resolveFeatures, NO_FEATURES } from '../park-features.js';
import { createJumpShape } from './jump-shape.js';

const EDGE_M = 1; // m, margin on a jump's bounding circle

// A jump placed in the world: its shape, the lip's position (x, y m), the unit direction of s in the world (ux, uy)
// and the squared radius (m²) outside which the jump has no snow.
function placeJump(jump) {
 const [start, lip, , foot] = jump.world;
 const run = Math.hypot(foot.x - start.x, foot.y - start.y);
 const ux = (foot.x - start.x) / run;
 const uy = (foot.y - start.y) / run;
 const slope = (start.z - foot.z) / run; // m/m: the base snow's fall along s, from the world points
 const shape = createJumpShape(jump, slope);
 const reach = Math.hypot(Math.max(shape.back, shape.front), shape.half) + EDGE_M;
 return { shape, x: lip.x, y: lip.y, ux, uy, reach2: reach * reach };
}

/**
 * A park for one world. baseHeight(x, y) -> m is the terrain without the features layer. Returns {layer, features,
 * build}: layer is a terrain layer (world/terrain.js: height(x, y) m and gradient(x, y, out) m/m, both 0 until
 * build()); features is the ParkFeatures (NO_FEATURES until build()); build(authored, course) resolves authored
 * {jumps, rails} on the course over baseHeight and stamps the jumps.
 */
export function createPark(baseHeight) {
 let placed = [];
 let resolved = NO_FEATURES;
 const at = { h: 0, dhdx: 0, dhdd: 0 };
 const layer = Object.freeze({
  height(x, y) {
   let sum = 0;
   for (const p of placed) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy > p.reach2) continue;
    sum += p.shape.sample(dx * p.ux + dy * p.uy, dy * p.ux - dx * p.uy, at).h;
   }
   return sum;
  },
  gradient(x, y, out) {
   for (const p of placed) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy > p.reach2) continue;
    p.shape.sample(dx * p.ux + dy * p.uy, dy * p.ux - dx * p.uy, at);
    out.gx += at.dhdx * p.ux - at.dhdd * p.uy;
    out.gy += at.dhdx * p.uy + at.dhdd * p.ux;
   }
   return out;
  },
 });
 return Object.freeze({
  layer,
  get features() {
   return resolved;
  },
  build(authored, course) {
   resolved = resolveFeatures(authored, course, baseHeight);
   placed = resolved.jumps.map(placeJump);
  },
 });
}
