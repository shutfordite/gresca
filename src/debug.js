// The test and debug façade (window.Gresca): the one stable way for tests and a debugging console to read and drive
// a game. Tests never see the state objects, so they can be reorganised by re-pointing this file only.
// Units: metres (m), seconds (s), m/s and radians (rad). Map axes: +x across the map, +y down the run.
// Everything it returns is a copy: changing a returned value changes nothing in the game. Write with set().
// Nothing in the game calls it.
// TODO(B2b): add Gresca.events (land, crash, grind start and end, score) once the simulation emits events.
import { MAX_PARTICLES, CAM_BACK, RIDER_SCALE, SIM_DT, SIM_MAX, MAP_ID, RAY_FAR, RAY_SAMPLES } from './core/config.js';
import { reseed } from './core/rng.js';
import { FIN, KICK, KBIG, RAILS, cx, bump } from './world/course.js';
import { fbm } from './world/noise.js';
import { step } from './sim/step.js';
import { emit, stepParticles } from './sim/particles.js';
import { snapInterpolation } from './sim/timestep.js';
import { resetInput } from './input/input.js';
import { cameraTilt, camCompass } from './view/camera.js';
import { fogAt, sunDisc } from './view/sky.js';
import { project } from './view/sprites.js';
import { riderPose } from './view/draw.js';
import { animTick } from './view/rider-animation.js';

const READ_ONLY = new Set(['speed', 'crashed', 'grinding', 'particles']);
const POSITION = new Set(['x', 'y', 'z']); // writing any of these restarts render interpolation
const PLACE = Object.freeze({ x: null, y: 500, vx: 0, vy: 0, heading: Math.PI / 2, z: 0, vz: 0 });

function cameraSnapshot(camera) {
 return {
  heading: camera.heading,   // rad, direction the camera looks along the ground (same convention as the rider)
  height: camera.height,     // m, camera altitude (absolute, same datum as world.height)
  x: camera.x, y: camera.y,  // m, camera position on the map, CAM_BACK behind the rider
  dirX: camera.dirX, dirY: camera.dirY, // unit view direction on the map
  slope: camera.slope,       // smoothed slope ahead, metres dropped per metre (full-tilt tan)
  tilt: camera.tilt,         // view tilt (tan) after partial slope follow and the rider clamp
  pitchPx: camera.pitchPx,   // view tilt in low-res render pixels (focalPx * tilt)
  focalPx: camera.focalPx,   // low-res render pixels per unit of (height / distance)
  horizonPx: camera.horizonPx, // untilted horizon row, low-res render pixels from the top
  renderW: camera.renderW, renderH: camera.renderH, // low-res terrain render size, pixels
  pixelScale: camera.pixelScale, // screen canvas pixels per low-res render pixel
 };
}

function snapshot(g) {
 const { rider: r, session: s, input } = g;
 return {
  phase: s.phase,        // 'load' | 'ready' | 'run' | 'done'
  x: r.x, y: r.y,        // m, rider position on the map
  vx: r.vx, vy: r.vy,    // m/s, rider velocity on the map
  speed: Math.hypot(r.vx, r.vy), // m/s, read only
  heading: r.heading,    // rad, direction the board points; twin tip, so heading + PI is the same board ridden switch
  z: r.z,                // m above the ground (0 on the snow, the rail height while grinding)
  vz: r.vz,              // m/s, vertical speed (+ up)
  airTime: r.airTime,    // s in the air this jump (briefly negative after dropping off the end of a rail)
  rotation: r.rotation,  // rad turned in the air this jump (+ right, - left)
  fromKicker: r.fromKicker, // true when this jump was launched by a kicker
  crashTimer: r.crashTimer, // s of wipeout left; the rider is crashed while this is > 0
  crashed: r.crashTimer > 0, // read only
  wipeoutSpin: r.wipeoutSpin, // rad, tumble angle while crashed
  crashes: s.crashes,    // count this run
  score: s.score,        // points this run
  time: s.time,          // s since the drop
  grinding: !!r.grind,   // read only
  // rail index into world.rails, m along it, m ground so far
  grind: r.grind ? { rail: RAILS.indexOf(r.grind.r), t: r.grind.t, dist: r.grindDist } : null,
  landings: r.landings,  // count of touchdowns since the page loaded
  landingSpeed: r.landingSpeed, // m/s downward at the last touchdown
  rig: s.rig,            // 'board' | 'ski' (set() writes the state only: no menu, no storage)
  stance: s.stance,      // 'regular' | 'goofy'
  particles: g.spray.particles.length, // live spray particles, read only (see clearParticles, emitParticles)
  popup: { text: s.popup.text, t: s.popup.t }, // trick popup text, s left on screen
  input: { left: input.left, right: input.right, brake: input.brake, jump: input.jump }, // 0 or 1; jump is one-shot
  camera: cameraSnapshot(g.camera),
 };
}

// set() writers by state() name; nested ones take an object of their own fields.
function writers(g) {
 const { rider: r, session: s, input, camera: c } = g;
 const nested = (name, w) => (v) => {
  for (const k in v) {
   if (!(k in w)) throw new Error('Gresca.set: unknown field ' + name + '.' + k);
   w[k](v[k]);
  }
 };
 return {
  phase: (v) => { s.phase = v; }, x: (v) => { r.x = v; }, y: (v) => { r.y = v; }, vx: (v) => { r.vx = v; },
  vy: (v) => { r.vy = v; }, heading: (v) => { r.heading = v; }, z: (v) => { r.z = v; }, vz: (v) => { r.vz = v; },
  airTime: (v) => { r.airTime = v; }, rotation: (v) => { r.rotation = v; }, fromKicker: (v) => { r.fromKicker = v; },
  crashTimer: (v) => { r.crashTimer = v; }, wipeoutSpin: (v) => { r.wipeoutSpin = v; },
  crashes: (v) => { s.crashes = v; }, score: (v) => { s.score = v; }, time: (v) => { s.time = v; },
  landings: (v) => { r.landings = v; }, landingSpeed: (v) => { r.landingSpeed = v; },
  rig: (v) => { s.rig = v; }, stance: (v) => { s.stance = v; },
  grind: (v) => {
   if (v === null) {
    r.grind = null;
    return;
   }
   r.grind = { r: RAILS[v.rail], t: v.t };
   if ('dist' in v) r.grindDist = v.dist;
  },
  popup: nested('popup', { text: (v) => { s.popup.text = v; }, t: (v) => { s.popup.t = v; } }),
  input: nested('input', {
   left: (v) => { input.left = v ? 1 : 0; }, right: (v) => { input.right = v ? 1 : 0; },
   brake: (v) => { input.brake = v ? 1 : 0; }, jump: (v) => { input.jump = v ? 1 : 0; },
  }),
  camera: nested('camera', {
   heading: (v) => { c.heading = v; }, height: (v) => { c.height = v; }, x: (v) => { c.x = v; }, y: (v) => { c.y = v; },
   dirX: (v) => { c.dirX = v; }, dirY: (v) => { c.dirY = v; }, slope: (v) => { c.slope = v; }, tilt: (v) => { c.tilt = v; },
   pitchPx: (v) => { c.pitchPx = v; }, focalPx: (v) => { c.focalPx = v; }, horizonPx: (v) => { c.horizonPx = v; },
   renderW: (v) => { c.renderW = v; }, renderH: (v) => { c.renderH = v; }, pixelScale: (v) => { c.pixelScale = v; },
  }),
 };
}

function worldFacade(world) {
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

// Render internals, for tests of the look. Not game state: expect these to change with the renderer.
function debugFacade(g) {
 const { view, camera, hanga, world } = g;
 const colourOf = (cols, px, py) => {
  const o = ((py | 0) * view.map.width + (px | 0)) * 4;
  return [cols[o], cols[o + 1], cols[o + 2], cols[o + 3]];
 };
 return Object.freeze({
  drawn: () => ({ rails: view.railsDrawn, flags: view.flagsDrawn }), // segments of rail and flags drawn last frame
  project: (wx, wy, h) => { // screen position of a map point, or null
   const P = project(camera, wx, wy, h);
   return P && { ...P };
  },
  cameraTilt: (s, rel, drop) => cameraTilt(hanga, s, rel, drop),
  camCompass: () => camCompass(camera), // camera heading, compass degrees
  sunDisc: () => ({ ...sunDisc(hanga, camera, view.W, view.Hh) }), // {X,Y,r,on}, canvas pixels
  screen: () => ({ width: view.W, height: view.Hh }), // canvas pixels
  mapId: MAP_ID,
  // fog colour, distance of the last terrain sample (m), samples per column
  fog: () => ({ rgb: view.fog.slice(), far: RAY_FAR, samples: RAY_SAMPLES }),
  fogAt: (z) => fogAt(hanga, z),
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

/**
 * The frozen façade for one game. g: the game's state objects and wiring from createGame (rider, session, input,
 * camera, view, world, rng, spray, timestep, sim, scene, hanga, startRun, frame).
 */
export function createFacade(g) {
 const { rider, input, spray, timestep } = g;
 const WRITE = writers(g);
 // Write any of the fields state() reports, by the same names. Read-only fields are ignored, so a snapshot can be
 // written back whole; an unknown name throws. Writing the position restarts render interpolation from there.
 function set(p) {
  let moved = false;
  for (const k in p) {
   if (READ_ONLY.has(k)) continue;
   if (!WRITE[k]) throw new Error('Gresca.set: unknown field ' + k);
   WRITE[k](p[k]);
   if (POSITION.has(k)) moved = true;
  }
  if (moved) snapInterpolation(timestep, rider);
 }
 return Object.freeze({
  state: () => snapshot(g),
  set,
  // New run (start()), then put the rider at {x,y,vx,vy,heading,z,vz}: defaults y 500 (the empty practice
  // stretch), x on the piste centreline, at rest, heading straight down. Clears crashes and all input.
  place(o = {}) {
   for (const k in o) if (!(k in PLACE)) throw new Error('Gresca.place: unknown field ' + k);
   const d = Object.assign({}, PLACE, o);
   g.startRun();
   rider.x = d.x === null ? cx(d.y) : d.x;
   rider.y = d.y;
   rider.vx = d.vx;
   rider.vy = d.vy;
   rider.heading = d.heading;
   rider.z = d.z;
   rider.vz = d.vz;
   rider.crashTimer = 0;
   g.session.crashes = 0;
   input.brake = 0;
   input.left = 0;
   input.right = 0;
   input.jump = 0;
   snapInterpolation(timestep, rider);
  },
  // The seed of the simulation's random numbers (spray today). seed(n) sets it and reseeds now; every start() (and so
  // place()) reseeds from it, so the same seed and the same input give the same run. Returns the seed. Default 1.
  seed(n) {
   if (n !== undefined) {
    g.rng.seed = n >>> 0;
    reseed(g.rng);
   }
   return g.rng.seed;
  },
  // Advance the simulation sec seconds at a fixed timestep dt (physics, then spray, each step).
  // The real game loop steps at config.fixedStep (1/120 s) with the popup timer too; drive it with requestAnimationFrame.
  sim(sec, dt = 1 / 120) {
   const n = Math.round(sec / dt);
   for (let i = 0; i < n; i++) {
    step(g.sim, dt);
    stepParticles(spray.particles, dt);
   }
  },
  step(dt) { step(g.sim, dt); },                          // one physics step only
  stepParticles(dt) { stepParticles(spray.particles, dt); }, // one spray step only
  frame(dt) { g.frame(dt, 1); },        // draw one frame (camera, terrain, rider, HUD), dt in s
  start() { g.startRun(); },            // what the Drop in button does
  input(o) { set({ input: o }); },      // {left,right,brake,jump}, any subset; bypasses touch and keyboard
  resetInput() { resetInput(input); },  // lift every finger and key
  clearParticles() { spray.particles.length = 0; },
  // copies of the live spray: m, m/s, s
  particles() { return spray.particles.map((p) => ({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, t: p.t, life: p.life })); },
  // m, m, m, m/s, m/s, m/s, m/s
  emitParticles(n, px, py, pz, spread, up, dvx, dvy) { emit(spray, n, px, py, pz, spread, up, dvx, dvy); },
  // particle cap; camera m behind the rider; rider draw scale; s per simulation step; steps the loop runs per frame
  config: Object.freeze({ maxParticles: MAX_PARTICLES, camBack: CAM_BACK, riderScale: RIDER_SCALE, fixedStep: SIM_DT,
   maxStepsPerFrame: SIM_MAX }),
  world: worldFacade(g.world),
  debug: debugFacade(g),
 });
}
