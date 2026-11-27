// The terrain horizon the trees are hidden behind when the GPU draws the terrain: view.occ, as the raycaster fills it.
// The same columns, samples and heights as draw.js raycast(), with no pixels: for each render column and terrain
// sample, the screen row (render px) the nearer terrain has already reached.
import { RAY_SAMPLES, RAY_EXACT_M, RAY_START_M, RAY_SPREAD } from '../../core/config.js';

/** The samples' distances (m) along a column: a Float64Array RAY_SAMPLES long (made once, kept by the renderer). */
export function horizonSamples() {
 const z = new Float64Array(RAY_SAMPLES);
 let d = RAY_START_M;
 for (let k = 0; k < RAY_SAMPLES; k++) {
  z[k] = d;
  d += 1 + d * RAY_SPREAD;
 }
 return z;
}

/**
 * Fills view.occ for the camera (view/camera.js) over the render size view.lo (RW × RH render px): occ[c * NS + k] is
 * the row the terrain nearer than sample k reached in column c. rayZ: horizonSamples(). Reads terrain, writes occ only;
 * allocates nothing. Once a column reaches the top of the render, the rest of it is 0.
 */
export function fillHorizon(view, camera, terrain, rayZ) {
 const NS = RAY_SAMPLES;
 const occ = view.occ;
 const frame = view.mapFrame;
 const RW = view.lo.width;
 const RH = view.lo.height;
 const U1 = view.map.width - 2;
 const V1 = view.map.height - 2;
 const cam = frame.toGrid(camera.x, camera.y, view.texel);
 const pu = cam.u;
 const pv = cam.v;
 const ray = view.rayTexel;
 for (let c = 0; c < RW; c++) {
  const ph = (c / RW - 0.5) * camera.fov;
  const cs = Math.cos(ph);
  const rx = Math.cos(camera.heading - ph);
  const ry = Math.sin(camera.heading - ph);
  frame.vecToGrid(rx, ry, ray);
  let ym = RH;
  let k = 0;
  for (; k < NS && ym > 0; k++) {
   const z = rayZ[k];
   occ[c * NS + k] = ym;
   const uu = pu + ray.u * z;
   const vv = pv + ray.v * z;
   if (uu < 1 || uu >= U1 || vv < 1 || vv >= V1) continue;
   const xx = camera.x + rx * z;
   const yy = camera.y + ry * z;
   const h = z < RAY_EXACT_M ? terrain.height(xx, yy) : terrain.heightFast(xx, yy);
   const ys = Math.floor((camera.height - h) / (z * cs) * camera.focalPx + camera.horizonPx - camera.pitchPx);
   if (ys < ym) ym = Math.max(0, ys);
  }
  for (; k < NS; k++) occ[c * NS + k] = 0;
 }
}
