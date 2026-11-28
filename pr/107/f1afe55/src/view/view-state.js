// The view's state: the screen size, the low-res terrain render, the colour map, the drawn rider pose and animation.
import { RAY_SAMPLES } from '../core/config.js';
import { W0, H0 } from '../world/course.js';
import { createAnimInput } from '../sim/anim-input.js';
import { createProjection } from './sprites.js';
import { cssRgb, cssRgba } from './look/look.js';
import { createTrail } from './track-trail.js';

const MAX_RENDER_COLUMNS = 400; // the occlusion buffer has room for this many render columns (draw.js uses <= 360)
export const TREE_SLICES = 48;  // depth slices the trees are counted into before they are sorted exactly (draw.js)
const TREE_STYLES_MAX = 4096;   // fill styles kept for trees, then the cache starts again (a few hundred are ever used)
const ALPHA_STEPS = 100;        // cssRgba rounds alpha to hundredths: one fill style per hundredth is kept per colour
const MAX_PIXEL_RATIO = 2;      // device pixels per CSS px, at most (more costs fill rate for nothing visible)

/**
 * The stages of a frame the optional timer (view.timer) is told about, in the order they run. The rest of a frame in
 * app.js (the HUD) is whatever a caller measures outside them.
 */
export const STAGE = Object.freeze({
 CAMERA: 'camera',   // updateCamera(): pose, render size, camera follow
 RAYCAST: 'raycast', // the terrain raycast and putting its pixels on the low-res canvas
 SKY: 'sky',         // sky gradient and sun
 BLIT: 'blit',       // scaling the low-res render up onto the screen
 TREES: 'trees',     // trees, far to near
 SPRITES: 'sprites', // rails, flags, spray
 RIDER: 'rider',     // animation step and the rider's drawing
});

/**
 * The stages of a frame with the GPU terrain (?renderer=gl, renderer.js), in the order they run: STAGE's camera,
 * then gl (terrain, sky and the GPU trees) in place of the raycast, sky and blit, then STAGE's trees (empty: the
 * trees are on the GPU), sprites and rider.
 */
export const GL_STAGE = Object.freeze({
 CAMERA: STAGE.CAMERA,
 GL: 'gl',           // the GPU terrain and sky submitted (the GPU's own time is not in it: a flush measures that)
 TREES: STAGE.TREES,
 SPRITES: STAGE.SPRITES,
 RIDER: STAGE.RIDER,
});

/**
 * A new view: W, Hh (screen canvas px), cssW (its CSS width, px, read at resize so a frame never forces a layout), lo/lx (the low-res terrain render canvas and context), occ (per render
 * column and terrain sample, the screen row the terrain reached: hides trees behind ridges), map/mx (the W0 × H0
 * colour map canvas, one px per m of the map's grid) and col/col0 (its live RGBA, with ski tracks, and as built) and
 * mapFrame (where its texels sit in the world; all three set after the build),
 * fog (the Look's fog RGB), drawn (the rider pose last drawn: x, y m, z m above the ground, alpha), groundM (m, the
 * ground under it, from updateCamera()), the rider animation (anim, animPrev, riderList, riderYaw deg) and counts of
 * what the last frame drew, the buffers a frame reuses (loImage, the low-res render's pixels; rayZ and rayFog, the
 * terrain samples' distances and fog; trees, the visible trees; treePos, all trees' x and y; treeStyles; projA, projB, projG and sun, scratch)
 * and timer (null, or {lap(stage)} from a profiler: draw.js calls timer.lap(STAGE.x) as
 * each stage finishes; one branch when it is null), trail (the equipment's track ring, track-trail.js). look: the
 * Look (view/look/look.js).
 */
export function createView(doc, look) {
 const map = doc.createElement('canvas');
 map.width = W0;
 map.height = H0;
 const lo = doc.createElement('canvas');
 return {
  W: 0,
  Hh: 0,
  cssW: 0,
  map,
  mx: map.getContext('2d'),
  col: null,
  col0: null,
  colSnow: null, // with the GPU terrain: the colour map's plain snow, before the features (colour-map.js)
  lo,
  lx: lo.getContext('2d'),
  occ: new Int16Array(MAX_RENDER_COLUMNS * RAY_SAMPLES),
  fog: look.fog.rgb.slice(),
  drawn: { x: 0, y: 0, z: 0, alpha: 1 },
  groundM: 0,
  anim: null,
  animPrev: null,
  riderList: null,
  riderYaw: 0,
  riderView: { yawDeg: 0, pitchDeg: null, stance: 'regular' }, // the Look's RiderView, refilled each drawn frame
  animIn: createAnimInput(), // the sim's AnimInput for the rider animation, refilled each drawn frame
  where: { s: 0, d: 0, tx: 0, ty: 1 }, // scratch: the camera projected on the course (sprites.js)
  point: { x: 0, y: 0 }, // scratch: a course point in the world (sprites.js)
  mapFrame: null, // the MapFrame placing the colour map's texels in the world (set with col, colour-map.js)
  mapBounds: null, // the colour map's rectangle in the world (terrain.js mapBounds shape), for the minimap
  mapFits: true, // false when a real map's run is larger than the painted window (paint-window.js)
  texel: { u: 0, v: 0 }, // scratch: a world point in colour map texels (draw.js, ski-tracks.js)
  rayTexel: { u: 0, v: 0 }, // scratch: a ray direction in texels (draw.js)
  flagsDrawn: 0,
  polesDrawn: 0, // the piste's edge poles drawn last frame (CPU)
  railsDrawn: 0,
  loImage: null, // the low-res render's ImageData, made at its size and refilled every frame (draw.js)
  rayZ: new Float64Array(RAY_SAMPLES), // m, the distance of each terrain sample along a column (draw.js)
  rayFog: new Float64Array(RAY_SAMPLES), // 0..1, the fog at each of them
  rayFogFor: null, // the Look's fog rayFog was made for
  trees: createTreeBuffer(),
  treePos: { src: null, n: 0, x: null, y: null }, // the world's trees as x, y arrays (draw.js)
  alphaStyles: new Map(), // fill style strings by colour (the Look's rgb array) and alpha in hundredths (alphaStyle)
  treeStyles: new Map(), // fill style strings by r, g, b, so a tree's colour is not built again each frame
  projA: createProjection(), projB: createProjection(), projG: createProjection(), // scratch (sprites.js)
  sun: { X: 0, Y: 0, r: 0, on: false }, // scratch: the sun disc (sky.js)
  trackRows: { v0: 0, v1: -1 }, // colour map rows (grid v) the ski tracks changed since the GPU terrain last read them
  trail: createTrail(), // the equipment's track (track-trail.js), drawn as a ribbon by the GPU terrain
  parkGpu: null, // the GPU park's counts (gl/gl-renderer.js), null with the CPU raycaster
  treeGpu: null, // the GPU trees' counts this frame (gl/gl-renderer.js), null with the CPU raycaster
  renderer: { name: 'cpu', fallback: null }, // which terrain renderer draws, and why the GPU one did not (renderer.js)
  timer: null,
 };
}

/** The fill style for a tree of colour (r, g, b: 0..255 integers), made once and kept. */
export function treeStyle(view, r, g, b) {
 if ((r | g | b) & ~255) return cssRgb(r, g, b); // not a colour: no key for it
 const key = (r << 16) | (g << 8) | b;
 const styles = view.treeStyles;
 let style = styles.get(key);
 if (style === undefined) {
  style = cssRgb(r, g, b);
  if (styles.size >= TREE_STYLES_MAX) styles.clear();
  styles.set(key, style);
 }
 return style;
}

/**
 * The fill style of colour rgb (the Look's 0..255 array, the same array each call) at alpha a (0..1), as cssRgba gives
 * it, made once per hundredth of alpha and kept, so spray and powder draw without building a string per puff.
 */
export function alphaStyle(view, rgb, a) {
 let styles = view.alphaStyles.get(rgb);
 if (styles === undefined) {
  styles = new Array(ALPHA_STEPS + 1).fill(null);
  view.alphaStyles.set(rgb, styles);
 }
 const step = Math.max(0, Math.min(ALPHA_STEPS, Math.round(a * ALPHA_STEPS)));
 let style = styles[step];
 if (style === null) {
  style = cssRgba(rgb, step / ALPHA_STEPS);
  styles[step] = style;
 }
 return style;
}

/**
 * The trees in view, far to near: n of them in order[0..n), their screen X, Y (canvas px), f (m along the view) and
 * z (m from the camera) by tree number. grow() makes room for one more.
 */
function createTreeBuffer() {
 const buf = {
  n: 0, cap: 0, X: null, Y: null, f: null, z: null, order: null, counts: new Int32Array(TREE_SLICES + 1),
  grow() {
   if (buf.n < buf.cap) return;
   const cap = Math.max(64, buf.cap * 2);
   for (const k of ['X', 'Y', 'f', 'z']) {
    const bigger = new Float64Array(cap);
    if (buf[k]) bigger.set(buf[k]);
    buf[k] = bigger;
   }
   const order = new Int32Array(cap);
   if (buf.order) order.set(buf.order);
   buf.order = order;
   buf.cap = cap;
  },
 };
 return buf;
}

/** Sizes the screen canvas to its CSS size times the pixel ratio (at most 2) and records it in view.W, Hh and cssW. */
export function resizeScreen(view, canvas, pixelRatio) {
 const d = Math.min(MAX_PIXEL_RATIO, pixelRatio || 1);
 view.cssW = canvas.clientWidth;
 canvas.width = view.cssW * d;
 canvas.height = canvas.clientHeight * d;
 view.W = canvas.width;
 view.Hh = canvas.height;
}
