// createGame(env): makes one game's state objects, wires the modules together, runs the boot and the frame loop.
import { SIM_DT, SIM_MAX } from './core/config.js';
import { createRng, reseed } from './core/rng.js';
import { createWorld, buildWorld } from './world/build.js';
import { createEventBus, onStep } from './core/events.js';
import { createInputLog } from './core/input-log.js';
import { createRider, createSession, resetDerived } from './sim/state.js';
import { createTimestep, snapInterpolation, advance } from './sim/timestep.js';
import { createInput } from './input/input.js';
import { bindInput } from './input/bind-input.js';
import { createView, resizeScreen } from './view/view-state.js';
import { createHangaLook } from './view/look/hanga.js';
import { buildColourMap } from './view/colour-map.js';
import { createCamera, resetCamera, menuCamera } from './view/camera.js';
import { updateCamera, draw } from './view/draw.js';
import { chooseRenderer } from './view/renderer.js';
import { createFpsMeter, tickFps, drawFps } from './view/fps-meter.js';
import { markTrack, clearTracks } from './view/ski-tracks.js';
import { getUi, applyUiTokens } from './ui/dom.js';
import { createHud, subscribeHud, updateHud, showGloves } from './ui/hud.js';
import { bindMenu, loadStance, subscribeFinish, MENU_TEXT } from './ui/menu.js';
import { createFacade } from './debug.js';

const START_SPEED = 2;  // m/s down the map at the drop
const MENU_HEADING = 1.57; // rad on the map's grid: just short of straight down
const BOOT_DELAY_MS = 60; // ms, lets the page paint "Building the mountain..." before the build blocks

/**
 * Builds one independent game. env: {document, window (resize and key events), localStorage, devicePixelRatio,
 * requestAnimationFrame, setTimeout, HANGA, RiderAnim, mapRotationRad (optional, rad counter-clockwise: places the
 * procedural map at that heading, for the rotated-map tests; default 0), map (optional: 'test' (default) builds the
 * test slope, 'play' the steep play mountain; world/build.js MAPS), scene (optional name: open that scene after
 * the boot, src/scenes.js), renderer (optional: 'gl' draws the terrain on the GPU, view/renderer.js), THREE (the
 * three.js module, with renderer 'gl'), showFps (optional: the fps readout), now () -> ms (with showFps), warn
 * (optional: message -> nothing)}; localStorage and devicePixelRatio are read at each use.
 * Every piece of state lives in the objects made here; the modules hold none (docs/adr/0002). Returns the frozen
 * test and debug façade (debug.js), which main.js puts on window.Gresca.
 */
export function createGame(env) {
 const look = createHangaLook(env.HANGA, env.RiderAnim); // every colour, tone and style the view draws with
 const world = createWorld({ rotationRad: env.mapRotationRad || 0, map: env.map || 'test' });
 const mapFrame = world.frame; // where the map's grid sits in the world (docs/adr/0005-enu-frame.md)
 const view = createView(env.document, look);
 const ui = getUi(env.document);
 applyUiTokens(env.document, look.ui);
 const resize = () => resizeScreen(view, ui.canvas, env.devicePixelRatio);
 env.window.addEventListener('resize', resize);
 resize();

 const camera = createCamera(mapFrame);
 const rider = createRider();
 const session = createSession();
 const input = createInput();
 const rng = createRng(1);
 const spray = { particles: [], rng };
 const timestep = createTimestep();
 const clock = { lastMs: 0, dt: 0 }; // ms, the last frame's timestamp; s, the last frame's real duration
 const render = { draw }; // the frame drawer: the CPU raycaster until the boot picks (view/renderer.js)
 const fps = env.showFps ? createFpsMeter() : null; // ?fps=1
 const bus = createEventBus(); // SimEvents out of the sim, to ui/, view/ and the façade (core/events.js)
 const hud = createHud();
 const startVelocity = { x: 0, y: 0 }; // m/s, scratch for startRun()
 const inputLog = createInputLog();
 // What simTick() reads and writes (sim/timestep.js): step(state, input, world, dt) and the event bus.
 // gradient (also the fall line's out), where (the rider on the course) and near (trees near the rider): scratch,
 // so no allocation.
 const sim = {
  state: {
   rider, session, spray, gradient: { gx: 0, gy: 0 }, where: { s: 0, d: 0, tx: 0, ty: 1 },
   near: new Array(world.trees.maxNear).fill(null),
  },
  input,
  world: { terrain: world.terrain, trees: world.trees, course: world.course, frame: mapFrame },
  bus,
  inputLog,
 };
 subscribeHud(bus, hud);
 subscribeFinish(bus, ui);
 onStep(bus, () => markTrack(view, rider));
 // What draw() reads (view/draw.js).
 const scene = {
  canvas: ui.canvas, ctx: ui.ctx, camera, rider, session, input, terrain: world.terrain, course: world.course,
  frame: mapFrame,
  treeArr: world.treeArr,
  particles: spray.particles, timestep, look, riderAnim: env.RiderAnim,
 };

 // The rider on the course's centreline at its start (m).
 function placeAtStart() {
  const course = world.course;
  course.point(course.startS, 0, rider);
 }

 // A new run from the top: what the Drop in button does. The rider points and moves straight down the map's grid.
 function startRun() {
  placeAtStart();
  mapFrame.vecToWorld(0, START_SPEED, startVelocity);
  rider.vx = startVelocity.x;
  rider.vy = startVelocity.y;
  rider.heading = mapFrame.downhill;
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  session.score = 0;
  hud.popup.t = 0;
  session.events.length = 0;
  rider.airTime = 0;
  rider.fromKicker = false;
  spray.particles.length = 0;
  rider.z = rider.vz = input.jump = 0;
  rider.rotation = 0;
  input.both = false;
  rider.grind = null;
  rider.grindDist = 0;
  resetDerived(rider);
  reseed(rng);
  clearTracks(view);
  resetCamera(camera, world.terrain.height(rider.x, rider.y), mapFrame);
  session.phase = 'run';
  ui.msg.hidden = true;
  timestep.acc = 0;
  snapInterpolation(timestep, rider);
 }

 // Moves the camera, then draws a frame and the HUD. dt: s since the last frame; alpha: see view/draw.js riderPose().
 function frame(dt, alpha) {
  const t0 = fps ? env.now() : 0;
  updateCamera(view, scene, dt, alpha);
  render.draw(view, scene, dt);
  updateHud(ui, hud, view.drawn, rider, session, world.terrain.bounds, world.course);
  if (fps) {
   tickFps(fps, clock.dt, env.now() - t0, view.renderer.name);
   drawFps(ui.ctx, fps, look, view.Hh);
  }
 }

 function loop(ts) {
  const dt = Math.max(0, (ts - clock.lastMs) / 1000 || 0);
  clock.lastMs = ts;
  clock.dt = dt;
  const alpha = advance(sim, timestep, dt);
  // the camera and animation get the real frame time, capped like the simulation
  if (session.phase !== 'load') frame(Math.min(dt, SIM_MAX * SIM_DT), alpha);
  env.requestAnimationFrame(loop);
 }

 // Builds the mountain, then shows the menu over the top of the run.
 function boot() {
  buildWorld(world);
  buildColourMap(view, world, ui.minimap, look, env.renderer === 'gl');
  render.draw = chooseRenderer({
   want: env.renderer, THREE: env.THREE || null, document: env.document, screen: ui.canvas,
   warn: env.warn || (() => {}),
  }, view, scene);
  session.phase = 'ready';
  placeAtStart();
  rider.vx = rider.vy = 0;
  rider.heading = mapFrame.headingToWorld(MENU_HEADING);
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  menuCamera(camera, world.terrain.height(rider.x, rider.y), mapFrame);
  ui.msgT.textContent = MENU_TEXT;
  ui.go.hidden = false;
  if (env.scene) facade.scene(env.scene); // ?scene=<name> (src/scenes.js): open that scene, paused
 }

 bindInput(ui.canvas, env.window, input, (state) => showGloves(ui, state.left, state.right));
 ui.go.addEventListener('click', startRun);
 bindMenu(ui, session, env);
 loadStance(session, env, look.rider.stanceStorageKey);
 env.setTimeout(boot, BOOT_DELAY_MS);
 env.requestAnimationFrame(loop);

 const facade = createFacade({
  rider, session, input, camera, view, world, rng, spray, timestep, sim, scene, look, hud, bus, inputLog, startRun,
  frame,
 });
 return facade;
}
