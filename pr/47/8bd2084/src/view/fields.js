// The view's façade fields (debug.js): the camera in state() and set(), and Gresca.debug, the render internals.
import { MAP_ID, RAY_FAR, RAY_SAMPLES } from '../core/config.js';
import { nested, prop } from '../core/facade-fields.js';
import { cameraTilt, camCompass } from './camera.js';
import { fogAt, sunDisc, sunAzimuthDeg } from './sky.js';
import { project } from './sprites.js';
import { riderPose } from './draw.js';
import { animTick } from './rider-animation.js';
import { STAGE, GL_STAGE } from './view-state.js';
import { fillHorizon, horizonSamples } from './gl/horizon.js';

/** The view's state() fields: camera {...}, all writable (see the comments for units). */
export function viewFields(c) {
 return {
  camera: nested('camera', {
   heading: prop(c, 'heading'),     // rad, direction the camera looks along the ground (counter-clockwise from east)
   height: prop(c, 'height'),       // m, camera altitude (absolute, same datum as world.height)
   x: prop(c, 'x'), y: prop(c, 'y'), // m, camera position (east, north), CAM_BACK behind the rider
   dirX: prop(c, 'dirX'), dirY: prop(c, 'dirY'), // unit view direction (east, north)
   slope: prop(c, 'slope'),         // smoothed slope ahead, metres dropped per metre (full-tilt tan)
   tilt: prop(c, 'tilt'),           // view tilt (tan) after partial slope follow and the rider clamp
   pitchPx: prop(c, 'pitchPx'),     // view tilt in low-res render pixels (focalPx * tilt)
   focalPx: prop(c, 'focalPx'),     // low-res render pixels per unit of (height / distance)
   horizonPx: prop(c, 'horizonPx'), // untilted horizon row, low-res render pixels from the top
   renderW: prop(c, 'renderW'), renderH: prop(c, 'renderH'), // low-res terrain render size, pixels
   pixelScale: prop(c, 'pixelScale'), // screen canvas pixels per low-res render pixel
  }),
 };
}

/**
 * Gresca.debug: render internals, for tests of the look. Not game state: expect these to change with the renderer.
 * g: {view, camera, look, world, rider, timestep, scene} from createGame.
 */
export function viewDebug(g) {
 const { view, camera, look, world } = g;
 const colourOf = (cols, px, py) => { // the colour map texel under world point (px, py)
  const at = world.frame.toGrid(px, py, { u: 0, v: 0 });
  const o = ((at.v | 0) * view.map.width + (at.u | 0)) * 4;
  return [cols[o], cols[o + 1], cols[o + 2], cols[o + 3]];
 };
 return Object.freeze({
  drawn: () => ({ rails: view.railsDrawn, flags: view.flagsDrawn }), // segments of rail and flags drawn last frame
  project: (wx, wy, h) => { // screen position of a world point, or null
   const P = project(camera, wx, wy, h);
   return P && { ...P };
  },
  cameraTilt: (s, rel, drop) => cameraTilt(look.camera, s, rel, drop),
  camCompass: () => camCompass(camera), // camera heading, compass degrees
  sunDisc: () => ({ ...sunDisc(look.sky, camera, view.W, view.Hh, world.frame) }), // {X,Y,r,on}, canvas pixels
  sunAzimuthDeg: () => sunAzimuthDeg(look.sky, world.frame), // compass deg, the sun in the world (turned with the map)
  // Installs a frame-time profiler, {lap(stage)} (view-state.js STAGE), or null to remove it (tools/bench).
  // the frame stages a timer is told about, in the order they run, for the renderer drawing (view-state.js)
  get stages() { return view.renderer.name === 'gl' ? GL_STAGE : STAGE; },
  setTimer: (timer) => { view.timer = timer; },
  screen: () => ({ width: view.W, height: view.Hh }), // canvas pixels
  renderer: () => ({ ...view.renderer }), // {name: 'cpu' | 'gl', fallback: null or why the GPU terrain is off}
  // the terrain horizon the trees hide behind (render px per column and sample) from the last frame, and the same
  // computed again by the GPU terrain's horizon pass (gl/horizon.js) for the current camera
  occlusion: () => Array.from(view.occ.subarray(0, view.lo.width * RAY_SAMPLES)),
  horizonPass: () => {
   fillHorizon(view, camera, world.terrain, horizonSamples());
   return Array.from(view.occ.subarray(0, view.lo.width * RAY_SAMPLES));
  },
  mapId: MAP_ID,
  // fog colour, distance of the last terrain sample (m), samples per column
  fog: () => ({ rgb: view.fog.slice(), far: RAY_FAR, samples: RAY_SAMPLES }),
  fogAt: (z) => fogAt(look.fog, z),
  heightFast: (px, py) => world.terrain.heightFast(px, py), // m, the raycaster's fast terrain height (bilinear)
  renderPixels: () => view.lx.getImageData(0, 0, view.lo.width, view.lo.height).data, // RGBA of the last terrain render
  colourAt: (px, py) => colourOf(view.col, px, py),      // live colour map (with tracks)
  baseColourAt: (px, py) => colourOf(view.col0, px, py), // as built
  fillColourMap: (v) => { view.col.fill(v); }, // until the next start()
  anim: () => view.anim && { rig: view.anim.rig, pose: view.anim.pose, comp: view.anim.comp, roll: view.anim.roll },
  animTick: (dt) => { // advance the rider animation one frame without drawing (current pose)
   riderPose(view, g.rider, g.timestep, 1);
   animTick(view, g.scene, dt);
  },
  // The rider pose the last frame drew (m; z above the ground), the alpha it was blended with, and the physics state
  // before the latest step it was blended from (the current state is the other end).
  view: () => ({
   x: view.drawn.x, y: view.drawn.y, z: view.drawn.z, alpha: view.drawn.alpha,
   from: { x: g.timestep.fromX, y: g.timestep.fromY, z: g.timestep.fromZ },
  }),
  riderList: () => view.riderList && JSON.parse(JSON.stringify(view.riderList)), // last rider draw list
  riderYaw: () => view.riderYaw, // deg, rider facing relative to the camera
 });
}
