// createGame(env): makes one game's state objects, wires the modules together, runs the boot and the frame loop.
import { SIM_DT, SIM_MAX, CAM_MODES } from './core/config.js';
import { cameraModeIndex } from './core/camera-modes.js';
import { createRng, reseed } from './core/rng.js';
import { createWorld, buildWorld } from './world/build.js';
import { createEventBus, onStep } from './core/events.js';
import { createInputLog } from './core/input-log.js';
import { createRider, createSession, resetDerived } from './sim/state.js';
import { createTimestep, snapInterpolation, advance } from './sim/timestep.js';
import { createSpray, clearSpray } from './sim/particles.js';
import { createInput } from './input/input.js';
import { bindInput } from './input/bind-input.js';
import { createView, resizeScreen } from './view/view-state.js';
import { createHangaLook } from './view/look/hanga.js';
import { buildColourMap } from './view/colour-map.js';
import { pistePoles } from './view/piste-poles.js';
import { createCamera, resetCamera, menuCamera } from './view/camera.js';
import { updateCamera, draw } from './view/draw.js';
import { riderScreenBox } from './view/touch-box.js';
import { chooseRenderer } from './view/renderer.js';
import { createFpsMeter, tickFps, drawFps } from './view/fps-meter.js';
import { markTrack, clearTracks } from './view/ski-tracks.js';
import { getUi, applyUiTokens } from './ui/dom.js';
import { bindAirControls } from './ui/air-hints.js';
import { createHud, subscribeHud, updateHud, showGloves } from './ui/hud.js';
import { bindPause, updatePauseButton } from './ui/pause.js';
import { showCameraLabel } from './ui/camera-label.js';
import { bindMenu, loadStance, subscribeFinish, MENU_TEXT } from './ui/menu.js';
import { createFacade } from './debug.js';

const START_SPEED = 2;  // m/s down the map at the drop
const MENU_HEADING = 1.57; // rad on the map's grid: just short of straight down
const CAM_KEY = 'gresca-cam'; // localStorage: the id of the camera mode last used
const BOOT_DELAY_MS = 60; // ms, lets the page paint "Building the mountain..." before the build blocks
const DRAW_NONE = 0; // wantsDraw(): skip this tick
const DRAW_FULL = 1; // step the sim, move the camera and draw
const DRAW_STILL = 2; // draw once with no step and dt 0
const MENU_SETTLE_S = 2; // s, how long the start screen keeps drawing after something changed (the camera easing in)

// The menu text on a real map: its run. The credits and ODbL attribution show once, in the map line (ui/menu.js).
function mapMenuText(world) {
 return 'Ride ' + world.name + ' from the top to the finish. Tap Controls to see how to turn, jump, spin and brake.';
}

// The camera mode to start in (an index): the ?cam= id if it names a mode, else the one saved last visit, else 0 (A).
function startCameraMode(env) {
 const fromPage = env.cam ? cameraModeIndex(env.cam) : -1;
 if (fromPage >= 0) return fromPage;
 try {
  return Math.max(0, cameraModeIndex(env.localStorage.getItem(CAM_KEY)));
 } catch (_) {
  return 0; // storage blocked (private browsing): the default
 }
}

// Saves the mode at index where the browser allows it.
function saveCameraMode(env, index) {
 try {
  env.localStorage.setItem(CAM_KEY, CAM_MODES[index].id);
 } catch (_) {
  // storage blocked: the choice lasts this visit only
 }
}

/**
 * Builds one independent game. env: {document, window (resize and key events), localStorage, devicePixelRatio,
 * requestAnimationFrame, setTimeout, cam (optional id: the camera mode to start in, ?cam=), HANGA, RiderAnim,
 * mapRotationRad (optional, rad counter-clockwise: places the procedural map at that heading, for the rotated-map
 * tests; default 0), map (optional: 'test' (default) builds the test slope, 'play' the steep play mountain;
 * world/build.js MAPS), world (optional: a real map's world from world/map-loader.js, which main.js loads before the
 * game; replaces map), scene (optional name: open that scene after the boot, src/scenes.js), renderer (optional:
 * 'gl' draws the terrain on the GPU, view/renderer.js), THREE (the three.js module, with renderer 'gl'), showFps
 * (optional: the fps readout), now () -> ms (with showFps), warn (optional: message -> nothing)}; localStorage and
 * devicePixelRatio are read at each use.
 * Every piece of state lives in the objects made here; the modules hold none (docs/adr/0002). Returns the frozen
 * test and debug façade (debug.js), which main.js puts on window.Gresca.
 */
export function createGame(env) {
 const world = env.world || createWorld({ rotationRad: env.mapRotationRad || 0, map: env.map || 'test' });
 // every colour, tone and style the view draws with; the loaded map's id and course sun pick its sun (ADR 0007)
 const look = createHangaLook(env.HANGA, env.RiderAnim, { id: world.id ?? null, courseSun: world.sky?.sun ?? null });
 const mapFrame = world.frame; // where the map's grid sits in the world (docs/adr/0005-enu-frame.md)
 // Idle frames: what the loop needs to know to skip a draw. draws: frames drawn (the façade's draws); settleS: s the
 // start screen still draws; the last* fields are what the picture depended on at the last tick (a change redraws).
 const idle = {
  draws: 0, settleS: MENU_SETTLE_S,
  wasHidden: false, stillDue: false,
  lastRig: '', lastStance: '', lastCam: -1, lastCssW: 0, lastW: 0, lastH: 0, lastRenderer: null,
 };
 const view = createView(env.document, look);
 const ui = getUi(env.document);
 applyUiTokens(env.document, look.ui);
 const resize = () => {
  resizeScreen(view, ui.canvas, env.devicePixelRatio);
  requestDraw();
 };
 env.window.addEventListener('resize', resize);
 resize();

 const camMode = { index: startCameraMode(env) }; // which CAM_MODES entry the camera frames the rider with
 const camera = createCamera(mapFrame, CAM_MODES[camMode.index]);
 const rider = createRider();
 const session = createSession();
 const input = createInput();
 const rng = createRng(1);
 const spray = createSpray(rng); // snow spray (sim/particles.js)
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
 bindAirControls(bus, ui, input, rider, env); // flips are an air control; the hints teach them
 onStep(bus, () => markTrack(view, rider, session.rig));
 // What draw() reads (view/draw.js).
 const scene = {
  canvas: ui.canvas, ctx: ui.ctx, camera, rider, session, input, terrain: world.terrain, course: world.course,
  frame: mapFrame,
  treeArr: world.treeArr,
  pistePoles: pistePoles(world.course, world.piste?.difficulty), // a real run's edge poles; none on procedural maps
  spray, timestep, look, riderAnim: env.RiderAnim, camMode,
 };

 // Asks for a frame: the start screen draws for MENU_SETTLE_S more seconds. Anything that changes the picture calls it.
 function requestDraw() {
  idle.settleS = MENU_SETTLE_S;
 }

 // What the loop does this tick: DRAW_NONE, DRAW_FULL (step the sim, move the camera, draw) or DRAW_STILL (draw one
 // frame with no step and dt 0). Nothing while paused, hidden or behind the Controls screen, except one still frame
 // when the size or the renderer changed or the page became visible again. On the start screen only while it settles
 // after a change; the run, the finish and the load draw every frame.
 function wantsDraw(dt) {
  if (env.document.hidden) {
   idle.wasHidden = true;
   return DRAW_NONE;
  }
  let changed = idle.wasHidden;
  idle.wasHidden = false;
  if (view.cssW !== idle.lastCssW || view.W !== idle.lastW || view.Hh !== idle.lastH ||
   view.renderer !== idle.lastRenderer) {
   idle.lastCssW = view.cssW;
   idle.lastW = view.W;
   idle.lastH = view.Hh;
   idle.lastRenderer = view.renderer;
   changed = true;
  }
  if (hud.paused || !ui.ctl.hidden) {
   idle.stillDue = idle.stillDue || changed;
   if (!idle.stillDue) return DRAW_NONE;
   idle.stillDue = false;
   return DRAW_STILL;
  }
  if (session.phase !== 'ready') return DRAW_FULL;
  if (changed || session.rig !== idle.lastRig || session.stance !== idle.lastStance || camMode.index !== idle.lastCam) {
   idle.lastRig = session.rig;
   idle.lastStance = session.stance;
   idle.lastCam = camMode.index;
   requestDraw();
  }
  idle.settleS -= dt;
  return idle.settleS > 0 ? DRAW_FULL : DRAW_NONE;
 }

 // Picks the camera mode at index (0 to the last) and remembers it. Returns the mode's id.
 function pickCameraMode(index) {
  camMode.index = index;
  requestDraw();
  saveCameraMode(env, index);
  showCameraLabel(ui, CAM_MODES[index].label);
  return CAM_MODES[index].id;
 }
 // The next camera mode, A to B to C and round to A (what tapping the rider does). Returns the new mode's id.
 const cycleCamera = () => pickCameraMode((camMode.index + 1) % CAM_MODES.length);
 // Picks the camera mode with this id; throws on an unknown id. Returns the id.
 function setCameraMode(id) {
  const index = cameraModeIndex(id);
  if (index < 0) throw new Error('Gresca: unknown camera mode ' + id);
  return pickCameraMode(index);
 }

 // The rider on the course's centreline at its start (m).
 function placeAtStart() {
  const course = world.course;
  course.point(course.startS, 0, rider);
 }

 // A new run from the top: what the Drop in button does. The rider points and moves straight down the map's grid.
 function startRun() {
  placeAtStart();
  // "Down the map" is the colour map's grid (view.mapFrame): the map's own grid on the procedural map, the painted
  // window along the run on a real one (view/paint-window.js).
  view.mapFrame.vecToWorld(0, START_SPEED, startVelocity);
  rider.vx = startVelocity.x;
  rider.vy = startVelocity.y;
  rider.heading = view.mapFrame.downhill;
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  session.score = 0;
  hud.popup.t = 0;
  session.events.length = 0;
  rider.airTime = 0;
  rider.fromKicker = false;
  clearSpray(spray);
  rider.z = rider.vz = input.jump = 0;
  rider.rotation = 0;
  input.both = false;
  rider.grind = null;
  rider.grindDist = 0;
  resetDerived(rider);
  reseed(rng);
  clearTracks(view);
  resetCamera(camera, world.terrain.height(rider.x, rider.y), view.mapFrame, CAM_MODES[camMode.index]);
  session.phase = 'run';
  ui.msg.hidden = true;
  timestep.acc = 0;
  snapInterpolation(timestep, rider);
 }

 // Moves the camera, then draws a frame and the HUD. dt: s since the last frame; alpha: see view/draw.js riderPose().
 function frame(dt, alpha) {
  idle.draws++;
  const t0 = fps ? env.now() : 0;
  updateCamera(view, scene, dt, alpha);
  render.draw(view, scene, dt);
  updateHud(ui, hud, view.drawn, rider, session, view.mapBounds, world.course);
  updatePauseButton(ui, hud, session);
  if (fps) {
   tickFps(fps, clock.dt, env.now() - t0, view.renderer.name);
   drawFps(ui.ctx, fps, look, view.Hh);
  }
 }

 function loop(ts) {
  const dt = Math.max(0, (ts - clock.lastMs) / 1000 || 0);
  clock.lastMs = ts;
  const want = session.phase === 'load' ? DRAW_FULL : wantsDraw(dt);
  if (want === DRAW_NONE) {
   // nothing can change: no step, no draw. lastMs keeps ticking, so resuming starts from one frame's dt, not the
   // whole stop; the step count is capped by advance() anyway
   clock.dt = 0;
   env.requestAnimationFrame(loop);
   return;
  }
  if (want === DRAW_STILL) {
   // a size, renderer or visibility change while paused: the last pose once more, nothing moves
   clock.dt = 0;
   frame(0, timestep.acc / SIM_DT);
   env.requestAnimationFrame(loop);
   return;
  }
  clock.dt = dt;
  // paused: no steps, the accumulator and the camera stand still (dt 0), the last pose is drawn again
  const alpha = hud.paused ? timestep.acc / SIM_DT : advance(sim, timestep, dt);
  // the camera and animation get the real frame time, capped like the simulation
  if (session.phase !== 'load') frame(hud.paused ? 0 : Math.min(dt, SIM_MAX * SIM_DT), alpha);
  env.requestAnimationFrame(loop);
 }

 // Builds the mountain, then shows the menu over the top of the run.
 function boot() {
  if (world.layout) buildWorld(world); // a loaded real map comes built (world/map-loader.js)
  buildColourMap(view, world, ui.minimap, look, env.renderer === 'gl');
  ui.msgT.textContent = 'Preparing the 3D view...';
  env.setTimeout(bootView, BOOT_DELAY_MS); // let the page show it before the renderer's bakes block
 }

 // Picks the renderer (the GPU bakes its textures here), then shows the menu.
 function bootView() {
  render.draw = chooseRenderer({
   want: env.renderer, THREE: env.THREE || null, document: env.document, screen: ui.canvas,
   warn: env.warn || (() => {}),
  }, view, scene);
  showMenu();
  if (env.scene) facade.scene(env.scene); // ?scene=<name> (src/scenes.js): open that scene, paused
 }

 // The start screen over the rider at the top: after the boot, and for Back to menu in the pause panel.
 function showMenu() {
  hud.paused = false;
  session.phase = 'ready';
  placeAtStart();
  rider.vx = rider.vy = 0;
  rider.heading = view.mapFrame.headingToWorld(MENU_HEADING);
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  rider.z = rider.vz = 0;
  rider.grind = null;
  clearSpray(spray);
  requestDraw();
  menuCamera(camera, world.terrain.height(rider.x, rider.y), view.mapFrame, CAM_MODES[camMode.index]);
  ui.msgT.textContent = world.layout ? MENU_TEXT : mapMenuText(world);
  ui.go.textContent = 'Drop in';
  ui.go.hidden = false;
  ui.msg.hidden = false;
 }

 const pause = bindPause(ui, hud, session, input, env, showMenu);
 const riderBox = { x: 0, y: 0, w: 0, h: 0 }; // CSS px, refilled by each touch's riderBox()
 bindInput(ui.canvas, env.window, input, (state) => showGloves(ui, state.left, state.right), pause.toggle, {
  riderBox: () => riderScreenBox(view, camera, riderBox),
  onCamera: cycleCamera,
 });
 ui.go.addEventListener('click', startRun);
 loadStance(session, env, look.rider.stanceStorageKey);
 bindMenu(ui, session, env, hud, look.rider.stanceStorageKey);
 env.setTimeout(boot, BOOT_DELAY_MS);
 env.requestAnimationFrame(loop);

 const facade = createFacade({
  rider, session, input, camera, view, world, rng, spray, timestep, sim, scene, look, hud, bus, inputLog, startRun,
  frame, camMode, cycleCamera, setCameraMode, idle, requestDraw,
 });
 return facade;
}
