// The map frame (docs/adr/0005-enu-frame.md): where a map's own grid (u across, v down its rows) sits in the world.
// The world is east-north-up metres (x east, y north, z up). A map is authored in its grid frame: u metres along its
// columns and v metres down its rows (on the procedural map, u across the piste and v down it). Rows run down the
// page, so the grid frame is mirrored relative to the world: grid (u, v) is world (u, -v), then rotated by rotation
// (rad, counter-clockwise) and moved to origin. Headings are radians counter-clockwise from east; a grid heading is
// radians clockwise from +u (from +u towards +v, as the map was authored), so heading = rotation - gridHeading.
// The transform is exact at rotation 0 and origin (0, 0): u = x and v = -y with no rounding.

/**
 * A frozen MapFrame: originX, originY (m, world position of grid (0, 0)), rotation (rad, the world heading of grid
 * +u), cos, sin (of rotation), ux, uy and vx, vy (world unit vectors of grid +u and +v), downhill (rad, the world
 * heading of grid +v), and conversions that write into out.
 */
export function createMapFrame({ originX = 0, originY = 0, rotation = 0 } = {}) {
 if (![originX, originY, rotation].every(Number.isFinite)) {
  throw new Error('createMapFrame: originX, originY and rotation must be finite numbers');
 }
 const c = Math.cos(rotation);
 const s = Math.sin(rotation);
 // (u, v m on the grid, out) -> out.x, out.y (m, world)
 function toWorld(u, v, out) {
  out.x = originX + c * u + s * v;
  out.y = originY + s * u - c * v;
  return out;
 }
 // (x, y m in the world, out) -> out.u, out.v (m, grid)
 function toGrid(x, y, out) {
  const dx = x - originX;
  const dy = y - originY;
  out.u = c * dx + s * dy;
  out.v = s * dx - c * dy;
  return out;
 }
 // (du, dv: a grid vector, out) -> out.x, out.y (the same vector in the world; lengths are kept)
 function vecToWorld(du, dv, out) {
  out.x = c * du + s * dv;
  out.y = s * du - c * dv;
  return out;
 }
 // (dx, dy: a world vector, out) -> out.u, out.v (the same vector on the grid)
 function vecToGrid(dx, dy, out) {
  out.u = c * dx + s * dy;
  out.v = s * dx - c * dy;
  return out;
 }
 return Object.freeze({
  originX, originY, rotation, cos: c, sin: s,
  ux: c, uy: s, vx: s, vy: -c, // the world unit vectors of grid +u and grid +v
  downhill: rotation - Math.PI / 2, // rad, world heading of grid +v (down the procedural piste)
  toWorld, toGrid, vecToWorld, vecToGrid,
  headingToWorld: (gridHeading) => rotation - gridHeading, // rad clockwise from +u -> rad counter-clockwise from east
  headingToGrid: (heading) => rotation - heading,          // the inverse (the same formula: it is its own inverse)
 });
}

/** The default placement: grid (0, 0) at the world origin, grid +u east, grid +v (down the piste) south. */
export const DEFAULT_FRAME = createMapFrame();

/** Compass degrees (clockwise from north, 0..360) of a world heading (rad, counter-clockwise from east). */
export const compassDeg = (heading) => ((90 - heading * 180 / Math.PI) % 360 + 360) % 360;
