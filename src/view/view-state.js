// The view's state: the screen size, the low-res terrain render, the colour map, the drawn rider pose and animation.
import { RAY_SAMPLES } from '../core/config.js';
import { W0, H0 } from '../world/course.js';

const MAX_RENDER_COLUMNS = 400; // the occlusion buffer has room for this many render columns (draw.js uses <= 360)
const MAX_PIXEL_RATIO = 2;      // device pixels per CSS px, at most (more costs fill rate for nothing visible)

/**
 * A new view: W, Hh (screen canvas px), lo/lx (the low-res terrain render canvas and context), occ (per render
 * column and terrain sample, the screen row the terrain reached: hides trees behind ridges), map/mx (the W0 × H0
 * colour map canvas, one px per m) and col/col0 (its live RGBA, with ski tracks, and as built; set after the build),
 * fog (spec terrain.fog RGB), drawn (the rider pose last drawn: x, y m, z m above the ground, alpha), groundM (m, the
 * ground under it, from updateCamera()), the rider animation (anim, animPrev, riderList, riderYaw deg) and counts of
 * what the last frame drew.
 */
export function createView(doc, hanga) {
 const map = doc.createElement('canvas');
 map.width = W0;
 map.height = H0;
 const lo = doc.createElement('canvas');
 return {
  W: 0,
  Hh: 0,
  map,
  mx: map.getContext('2d'),
  col: null,
  col0: null,
  lo,
  lx: lo.getContext('2d'),
  occ: new Int16Array(MAX_RENDER_COLUMNS * RAY_SAMPLES),
  fog: hanga.terrain.fog.rgb.slice(),
  drawn: { x: 0, y: 0, z: 0, alpha: 1 },
  groundM: 0,
  anim: null,
  animPrev: null,
  riderList: null,
  riderYaw: 0,
  flagsDrawn: 0,
  railsDrawn: 0,
 };
}

/** Sizes the screen canvas to its CSS size times the pixel ratio (at most 2) and records it in view.W, view.Hh. */
export function resizeScreen(view, canvas, pixelRatio) {
 const d = Math.min(MAX_PIXEL_RATIO, pixelRatio || 1);
 canvas.width = canvas.clientWidth * d;
 canvas.height = canvas.clientHeight * d;
 view.W = canvas.width;
 view.Hh = canvas.height;
}
