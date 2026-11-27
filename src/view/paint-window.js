// The paint window of a real map (C4b): the colour map's rectangle (width × length m), at 1 m per texel, that the colour map, the GPU
// terrain and the minimap cover, placed along the course. A real map is far bigger than the procedural one (El Tarter
// is 7 × 7 km), so until D2 the view draws the window around the run; outside it is the sky's horizon.
import { createMapFrame } from '../world/map-frame.js';
import { mapBounds } from '../world/terrain.js';

const SAMPLE_STEP_M = 10; // m of s between the course points that set the window

/**
 * The width × length m window (the colour map's size, 1 m per texel) over a loaded world ({terrain, course}): frame (a MapFrame whose grid +v runs from the course's start
 * towards its finish, centred on the run), bounds (terrain.js mapBounds shape), heights (Float32Array, m, at each
 * texel's centre), groomed (Uint8Array, 0..255), cx (row -> the corduroy's reference column), fits (false when
 * the run is longer or wider than the window: the rest is cut off). Memory: 12.3 MB at 1000 × 2450, as the procedural map.
 */
export function paintWindow(world, width, length) {
 const { terrain, course } = world;
 const p = { x: 0, y: 0 };
 course.point(course.startS, 0, p);
 const sx = p.x;
 const sy = p.y;
 course.point(course.finishS, 0, p);
 const rotation = Math.atan2(p.y - sy, p.x - sx) + Math.PI / 2; // grid +v (heading rotation - PI/2) start to finish
 const unplaced = createMapFrame({ rotation });
 const g = { u: 0, v: 0 };
 let u0 = Infinity;
 let u1 = -Infinity;
 let v0 = Infinity;
 let v1 = -Infinity;
 for (let s = course.startS; s <= course.finishS + SAMPLE_STEP_M; s += SAMPLE_STEP_M) {
  course.point(Math.min(s, course.finishS), 0, p);
  unplaced.toGrid(p.x, p.y, g);
  u0 = Math.min(u0, g.u);
  u1 = Math.max(u1, g.u);
  v0 = Math.min(v0, g.v);
  v1 = Math.max(v1, g.v);
 }
 const corner = unplaced.toWorld((u0 + u1 - width) / 2, (v0 + v1 - length) / 2, { x: 0, y: 0 });
 const frame = createMapFrame({ originX: corner.x, originY: corner.y, rotation });
 const heights = new Float32Array(width * length);
 const groomed = new Uint8Array(width * length);
 const w = { x: 0, y: 0 };
 const b = terrain.bounds;
 for (let v = 0; v < length; v++) {
  for (let u = 0; u < width; u++) {
   frame.toWorld(u + 0.5, v + 0.5, w);
   const x = Math.min(b.maxX, Math.max(b.minX, w.x));
   const y = Math.min(b.maxY, Math.max(b.minY, w.y));
   const i = v * width + u;
   heights[i] = terrain.height(x, y);
   groomed[i] = Math.round(terrain.groomed(x, y) * 255);
  }
 }
 return {
  frame, bounds: mapBounds(frame, width, length), heights, groomed, cx: () => width / 2,
  fits: u1 - u0 <= width && v1 - v0 <= length,
 };
}
