// The world's façade (Gresca.world, debug.js): the map frame, the terrain and the course, read only, in world metres.
import { fbm } from './noise.js';

// Gresca.world.course: the Course (core/contracts.js), read only; every query returns a new object.
function courseFacade(course) {
 return Object.freeze({
  length: course.length,   // m of s
  startS: course.startS,   // m, s where a run starts
  finishS: course.finishS, // m, s of the finish line
  project: (x, y) => ({ ...course.project(x, y, {}) }), // {s, d, tx, ty}: m along, m across, unit tangent
  point: (s, d) => ({ ...course.point(s, d, {}) }),     // {x, y}, world m
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

// Gresca.world.frame: the MapFrame (world/map-frame.js) placing the map's grid in the world; conversions return
// copies.
function frameFacade(frame) {
 return Object.freeze({
  originX: frame.originX,   // m, world position of grid (0, 0)
  originY: frame.originY,
  rotation: frame.rotation, // rad, world heading of grid +u (across the map), counter-clockwise from east
  downhill: frame.downhill, // rad, world heading of grid +v (down the map)
  toWorld: (u, v) => frame.toWorld(u, v, { x: 0, y: 0 }),       // grid m -> {x, y} world m
  toGrid: (x, y) => frame.toGrid(x, y, { u: 0, v: 0 }),         // world m -> {u, v} grid m
  vecToWorld: (du, dv) => frame.vecToWorld(du, dv, { x: 0, y: 0 }), // a grid vector -> {x, y}
  vecToGrid: (dx, dy) => frame.vecToGrid(dx, dy, { u: 0, v: 0 }),   // a world vector -> {u, v}
  headingToWorld: (h) => frame.headingToWorld(h), // rad clockwise from grid +u -> rad counter-clockwise from east
  headingToGrid: (h) => frame.headingToGrid(h),   // the inverse
 });
}

/** Gresca.world for a built world {terrain, course, frame, treeArr}: positions in world m, slopes in m/m. */
export function worldFacade(world) {
 const bump = world.layout.bump;
 const terrain = world.terrain;
 const course = world.course;
 const frame = world.frame;
 const onGrid = (x, y) => frame.toGrid(x, y, { u: 0, v: 0 });
 return Object.freeze({
  map: world.layout.id, // which procedural map is built: 'test' (the test slope) or 'play' (the play mountain)
  frame: frameFacade(frame),
  bounds: terrain.bounds, // the map's rectangle: x0, y0, ax, ay, bx, by, width, length, minX..maxY (m; frozen)
  // The terrain (world/terrain.js) the physics, camera, renderer and rider all sample, kicker ramps included.
  height: (px, py) => terrain.height(px, py),         // m, altitude of the smooth (bicubic) surface at (px,py)
  cellHeight: (px, py) => terrain.cellHeight(px, py), // m, raw height of the cell containing (px,py)
  gradient: (px, py) => {
   const o = terrain.gradient(px, py);
   return { gx: o.gx, gy: o.gy };
  }, // m/m, rise per metre east and north
  slopeDeg: (px, py) => terrain.slopeDeg(px, py),     // degrees from horizontal at (px,py)
  layers: terrain.layers,                             // the terrain layers in use, in stack order (frozen)
  groomed: (px, py) => Math.round(terrain.groomed(px, py) * 255), // 0..255, how groomed (255 = groomed)
  noise: (px, py) => { // 0..1, the terrain's fractal noise (authored on the map's grid)
   const p = onGrid(px, py);
   return fbm(p.u, p.v);
  },
  // m, kicker ramp height added at (px,py): the procedural map's ramp stamp (on its grid; later the features layer)
  rampHeight: (px, py) => {
   const p = onGrid(px, py);
   return bump(p.u, p.v);
  },
  get rails() { return course.rails.map((r) => ({ ...r })); }, // {x0,y0,x1,y1,dx,dy (world),len,s0,s1,d,h,t}
  course: courseFacade(course),
  get trees() { return world.treeArr.map((T) => ({ x: T.x, y: T.y })); }, // world m
 });
}
