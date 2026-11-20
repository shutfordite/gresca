// The world's façade (Gresca.world, debug.js): the map, the terrain and the course, read only.
import { FIN, KICK, KBIG, RAILS, cx, bump } from './course.js';
import { fbm } from './noise.js';

/** Gresca.world for a built world {terrain, treeArr}: sizes and positions in m, slopes in m/m. */
export function worldFacade(world) {
 const terrain = world.terrain;
 return Object.freeze({
  size: Object.freeze({ x: terrain.bounds.maxX, y: terrain.bounds.maxY }), // m, map extent (one height cell per metre)
  finishY: FIN,                   // m, the finish line
  centre: (y) => cx(y),           // m, x of the piste centreline at y
  // The terrain (world/terrain.js) the physics, camera, renderer and rider all sample, kicker ramps included.
  height: (px, py) => terrain.height(px, py),         // m, altitude of the smooth (bicubic) surface at (px,py)
  cellHeight: (px, py) => terrain.cellHeight(px, py), // m, raw height of the cell containing (px,py)
  gradient: (px, py) => {
   const o = terrain.gradient(px, py);
   return { gx: o.gx, gy: o.gy };
  }, // m/m, rise per metre in +x and +y
  slopeDeg: (px, py) => terrain.slopeDeg(px, py),     // degrees from horizontal at (px,py)
  layers: terrain.layers,                             // the terrain layers in use, in stack order (frozen)
  groomed: (px, py) => Math.round(terrain.groomed(px, py) * 255), // 0..255, how groomed (255 = groomed)
  noise: (px, py) => fbm(px, py),     // 0..1, the terrain's fractal noise
  rampHeight: (px, py) => bump(px, py), // m, kicker ramp height added at (px,py)
  get kickers() { return KICK.slice(); },    // y of each kicker lip, top to bottom
  get bigKickers() { return [...KBIG]; },    // the subset of kickers that are big
  get rails() { return RAILS.map((r) => ({ ...r })); }, // {y0,y1,x0,x1,len,dx,dy,h,t:'rail'|'box'}
  get trees() { return world.treeArr.map((T) => ({ x: T.x, y: T.y })); },
 });
}
