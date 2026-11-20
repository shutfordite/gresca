// createGame(env): makes one game's state objects, wires the modules together, runs the boot and the frame loop.
import { SIM_DT, SIM_MAX } from './core/config.js';
import { createRng, reseed } from './core/rng.js';
import { cx } from './world/course.js';
import { createWorld, buildWorld } from './world/build.js';
import { createRider, createSession } from './sim/state.js';
import { createTimestep, snapInterpolation, advance } from './sim/timestep.js';
import { createInput } from './input/input.js';
import { bindInput } from './input/bind-input.js';
import { createView, resizeScreen } from './view/view-state.js';
import { buildColourMap } from './view/colour-map.js';
import { createCamera, resetCamera, menuCamera } from './view/camera.js';
import { draw } from './view/draw.js';
import { getUi } from './ui/dom.js';
import { updateHud, showGloves } from './ui/hud.js';
import { bindMenu, loadStance, MENU_TEXT } from './ui/menu.js';
import { createFacade } from './debug.js';

const START_Y = 60;     // m, where a run starts, down from the top of the map
const START_SPEED = 2;  // m/s down the slope at the drop
const MENU_HEADING = 1.57; // rad, straight down the map
const BOOT_DELAY_MS = 60; // ms, lets the page paint "Building the mountain..." before the build blocks

/**
 * Builds one independent game. env: {document, window (resize and key events), localStorage, devicePixelRatio,
 * requestAnimationFrame, setTimeout, HANGA, RiderAnim}; localStorage and devicePixelRatio are read at each use.
 * Every piece of state lives in the objects made here; the modules hold none (docs/adr/0002). Returns the frozen
 * test and debug façade (debug.js), which main.js puts on window.Gresca.
 */
export function createGame(env) {
 const hanga = env.HANGA;
 const world = createWorld();
 const view = createView(env.document, hanga);
 const ui = getUi(env.document);
 const resize = () => resizeScreen(view, ui.canvas, env.devicePixelRatio);
 env.window.addEventListener('resize', resize);
 resize();

 const camera = createCamera();
 const rider = createRider();
 const session = createSession();
 const input = createInput();
 const rng = createRng(1);
 const spray = { particles: [], rng };
 const timestep = createTimestep();
 const clock = { lastMs: 0 }; // ms, the last frame's timestamp
 // What step() reads and writes (sim/step.js). gradient: scratch for the slope under the rider, so no allocation.
 const sim = { rider, input, session, terrain: world.terrain, trees: world.trees, spray, gradient: { gx: 0, gy: 0 }, view, ui };
 // What draw() reads (view/draw.js).
 const scene = {
  canvas: ui.canvas, ctx: ui.ctx, camera, rider, session, input, terrain: world.terrain, treeArr: world.treeArr,
  particles: spray.particles, timestep, hanga, riderAnim: env.RiderAnim,
 };

 // A new run from the top: what the Drop in button does.
 function startRun() {
  rider.x = cx(START_Y);
  rider.y = START_Y;
  rider.vx = 0;
  rider.vy = START_SPEED;
  rider.heading = Math.PI / 2;
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  session.score = 0;
  session.popup.t = 0;
  rider.airTime = 0;
  rider.fromKicker = false;
  spray.particles.length = 0;
  rider.z = rider.vz = input.jump = 0;
  rider.rotation = 0;
  input.both = false;
  rider.grind = null;
  rider.grindDist = 0;
  reseed(rng);
  view.col.set(view.col0); // wipe the ski tracks
  resetCamera(camera, world.terrain.height(rider.x, START_Y));
  session.phase = 'run';
  ui.msg.hidden = true;
  timestep.acc = 0;
  snapInterpolation(timestep, rider);
 }

 // Draws one frame and the HUD. dt: s since the last frame; alpha: see view/draw.js riderPose().
 function frame(dt, alpha) {
  draw(view, scene, dt, alpha);
  updateHud(ui, view.drawn, rider, session, world.terrain.bounds);
 }

 function loop(ts) {
  const dt = Math.max(0, (ts - clock.lastMs) / 1000 || 0);
  clock.lastMs = ts;
  const alpha = advance(sim, timestep, dt);
  // the camera and animation get the real frame time, capped like the simulation
  if (session.phase !== 'load') frame(Math.min(dt, SIM_MAX * SIM_DT), alpha);
  env.requestAnimationFrame(loop);
 }

 // Builds the mountain, then shows the menu over the top of the run.
 function boot() {
  buildWorld(world);
  buildColourMap(view, world, ui.minimap);
  session.phase = 'ready';
  rider.x = cx(START_Y);
  rider.y = START_Y;
  rider.vx = rider.vy = 0;
  rider.heading = MENU_HEADING;
  rider.crashTimer = 0;
  session.crashes = 0;
  session.time = 0;
  rider.wipeoutSpin = 0;
  menuCamera(camera, world.terrain.height(rider.x, START_Y));
  ui.msgT.textContent = MENU_TEXT;
  ui.go.hidden = false;
 }

 bindInput(ui.canvas, env.window, input, (state) => showGloves(ui, state.left, state.right));
 ui.go.addEventListener('click', startRun);
 bindMenu(ui, session, env);
 loadStance(session, env, hanga);
 env.setTimeout(boot, BOOT_DELAY_MS);
 env.requestAnimationFrame(loop);

 return createFacade({ rider, session, input, camera, view, world, rng, spray, timestep, sim, scene, hanga, startRun, frame });
}
