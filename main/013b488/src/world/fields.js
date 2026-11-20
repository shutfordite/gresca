// The world's façade (Gresca.world, debug.js): the map, the terrain and the course, read only.
import { bump } from './course.js';
import { fbm } from './noise.js';

// m, map y of course point s (m) on the centreline.
const yAt = (course, s) => course.point(s, 0, { x: 0, y: 0 }).y;

// Gresca.world.course: the Course (core/contracts.js), read only; every query returns a new object.
function courseFacade(course) {
 return Object.freeze({
  length: course.length,   // m of s
  startS: course.startS,   // m, s where a run starts
  finishS: course.finishS, // m, s of the finish line
  project: (x, y) => ({ ...course.project(x, y, {}) }), // {s, d, tx, ty}: m along, m across, unit tangent
  point: (s, d) => ({ ...course.point(s, d, {}) }),     // {x, y}, m on the map
  fallLine: (x, y) => ({ ...course.fallLine(x, y, {}) }), // {fx, fy, heading (rad), slope (m/m), gx, gy}
  widthAt: (s) => course.widthAt(s),                    // m
  kickerAt: (s, d) => {
   const k = course.kickerAt(s, d);
   return k && { ...k };
  },
  get kickers() { return course.kickers.map((k) => ({ ...k })); }, // {s, d, halfWidth, depth, big, x, y}
  get rails() { return course.rails.map((r) => ({ ...r })); },     // as Gresca.world.rails
 });
}

/** Gresca.world for a built world {terrain, course, treeArr}: sizes and positions in m, slopes in m/m. */
export function worldFacade(world) {
 const terrain = world.terrain;
 const course = world.course;
 return Object.freeze({
  size: Object.freeze({ x: terrain.bounds.maxX, y: terrain.bounds.maxY }), // m, map extent (one height cell per metre)
  finishY: yAt(course, course.finishS), // m, map y of the finish line
  // m, x of the piste centreline level with map y
  centre: (y) => course.point(course.project(0, y, { s: 0, d: 0, tx: 0, ty: 1 }).s, 0, { x: 0, y: 0 }).x,
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
  // m, kicker ramp height added at (px,py): the procedural map's ramp stamp (C2 moves it into the features layer)
  rampHeight: (px, py) => bump(px, py),
  get kickers() { return course.kickers.map((k) => yAt(course, k.s)); }, // map y of each kicker lip, top to bottom
  get bigKickers() { return course.kickers.filter((k) => k.big).map((k) => yAt(course, k.s)); }, // the big ones
  get rails() { return course.rails.map((r) => ({ ...r })); }, // {y0,y1,x0,x1,len,s0,s1,d,dx,dy,h,t:'rail'|'box'}
  course: courseFacade(course),
  get trees() { return world.treeArr.map((T) => ({ x: T.x, y: T.y })); },
 });
}
