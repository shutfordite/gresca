// The test and debug façade (window.Gresca): the one stable way for tests and a debugging console to read and drive
// a game. Tests never see the state objects, so they can be reorganised by re-pointing the field files only.
// Each area registers its own fields: sim/fields.js, ui/fields.js, input/fields.js, view/fields.js (and the world's,
// world/fields.js); this file composes them and adds the actions. Units: metres (m), seconds (s), m/s and radians
// (rad). World axes (docs/adr/0005-enu-frame.md): +x east, +y north, z up; headings counter-clockwise from east.
// Gresca.world.frame converts to and from the map's own grid (u across, v down the piste).
// Everything it returns is a copy: changing a returned value changes nothing in the game. Write with set().
// Nothing in the game calls it.
import { MAX_PARTICLES, CAM_MODES, CAM_BACK, RIDER_SCALE, SIM_DT, SIM_MAX } from './core/config.js';
import { field } from './core/facade-fields.js';
import { reseed } from './core/rng.js';
import { SIM_EVENT_TYPES, INPUT_FIELDS } from './core/contracts.js';
import { on, publish, afterStep } from './core/events.js';
import { startRecording, stopRecording, readInput } from './core/input-log.js';
import { worldFacade } from './world/fields.js';
import { step } from './sim/step.js';
import { emit, stepSpray, clearSpray, sprayCopies } from './sim/particles.js';
import { simTick, snapInterpolation } from './sim/timestep.js';
import { applyScene, SCENES } from './scenes.js';
import { simFields } from './sim/fields.js';
import { resetInput } from './input/input.js';
import { inputFields } from './input/fields.js';
import { uiFields } from './ui/fields.js';
import { viewFields, viewDebug } from './view/fields.js';

// place() defaults: s 500 m (the empty practice stretch), d 0 (the centreline), at rest; heading null: down the map.
const PLACE = Object.freeze({ x: null, y: null, s: 500, d: 0, vx: 0, vy: 0, heading: null, z: 0, vz: 0 });
const EVENT_LOG_MAX = 1000; // events Gresca.events keeps; older ones are dropped

// Gresca.events: a copy of every SimEvent the game publishes, oldest first, for tests and the console.
function eventsFacade(bus) {
 const log = [];
 on(bus, '*', (e) => {
  if (log.length >= EVENT_LOG_MAX) log.shift();
  log.push({ ...e });
 });
 return Object.freeze({
  types: SIM_EVENT_TYPES,
  list: (type) => log.filter((e) => type === undefined || e.type === type).map((e) => ({ ...e })), // copies
  clear() { log.length = 0; },
  // Calls fn(copy of the event) for each new event of type ('*' for all); returns an unsubscribe function.
  on: (type, fn) => on(bus, type, (e) => fn({ ...e })),
 });
}

// Gresca.record / recording / replay: the input as each sim step saw it (core/input-log.js).
function recorderFacade(g) {
 const { inputLog, input } = g;
 return {
  // Start recording the input of every sim step (the loop's and sim()'s), from empty; record(false) stops.
  record(on = true) {
   if (on) startRecording(inputLog);
   else stopRecording(inputLog);
  },
  // The recorded steps: one {left, right, brake, jump, steer, jumpHeld, jumpPressed, flip, spin} per step.
  recording() {
   const out = [];
   for (let i = 0; i < inputLog.n; i++) {
    const o = {};
    for (const k of INPUT_FIELDS) o[k] = input[k];
    readInput(inputLog, i, o);
    out.push(o);
   }
   return out;
  },
  // Runs one sim step per recorded step, with exactly that step's input (dt: s per step).
  replay(steps, dt = SIM_DT) {
   for (const s of steps) {
    for (const k of INPUT_FIELDS) input[k] = s[k];
    simTick(g.sim, dt);
   }
  },
 };
}

/**
 * The frozen façade for one game. g: the game's state objects and wiring from createGame (rider, session, input,
 * camera, view, world, rng, spray, timestep, sim, scene, look, hud, bus, inputLog, startRun, frame).
 */
export function createFacade(g) {
 const { rider, input, spray, timestep } = g;
 const FIELDS = Object.freeze({
  ...simFields(rider, g.session, spray, g.world.course),
  ...uiFields(g.hud),
  ...inputFields(input),
  ...viewFields(g.camera),
  // the camera mode's id ('A', 'B', 'C'); writing it picks and saves the mode like Gresca.setCameraMode(id)
  cameraMode: field(() => CAM_MODES[g.camMode.index].id, (id) => g.setCameraMode(id)),
 });
 const state = () => {
  const o = {};
  for (const k in FIELDS) o[k] = FIELDS[k].get();
  return o;
 };
 // Write any of the fields state() reports, by the same names. Read-only fields are ignored, so a snapshot can be
 // written back whole; an unknown name throws. Writing the position restarts render interpolation from there.
 function set(p) {
  let moved = false;
  for (const k in p) {
   const f = FIELDS[k];
   if (!f) throw new Error('Gresca.set: unknown field ' + k);
   if (!f.set) continue;
   f.set(p[k]);
   if (f.moves) moved = true;
  }
  if (moved) snapInterpolation(timestep, rider);
 }
 const facade = {
  state,
  set,
  // New run (start()), then put the rider at {x, y (world m) or s, d (course m), vx, vy (m/s), heading (rad), z, vz}:
  // defaults s 500 (the empty practice stretch), d 0 (the piste centreline), at rest, heading straight down the map
  // (Gresca.world.frame.downhill). Clears crashes and all input.
  place(o = {}) {
   for (const k in o) if (!(k in PLACE)) throw new Error('Gresca.place: unknown field ' + k);
   if (('x' in o) !== ('y' in o)) throw new Error('Gresca.place: give both x and y, or s and d');
   const d = Object.assign({}, PLACE, o);
   g.startRun();
   if (d.x === null) g.world.course.point(d.s, d.d, rider);
   else {
    rider.x = d.x;
    rider.y = d.y;
   }
   rider.vx = d.vx;
   rider.vy = d.vy;
   rider.heading = d.heading === null ? g.world.frame.downhill : d.heading;
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
  // Advance the simulation sec seconds in steps of dt: each is the loop's simTick() (input recording, physics, spray,
  // events to the HUD, finish screen and ski tracks, the popup timer). Render interpolation is left alone.
  sim(sec, dt = SIM_DT) {
   const n = Math.round(sec / dt);
   for (let i = 0; i < n; i++) simTick(g.sim, dt);
  },
  // One physics step, its events published and the per-step hooks run (ski tracks, popup timer); no spray step.
  step(dt) {
   publish(g.bus, step(g.sim.state, input, g.sim.world, dt));
   afterStep(g.bus, dt);
  },
  stepParticles(dt) { stepSpray(spray, dt); }, // one spray step only
  cycleCamera: () => g.cycleCamera(),   // the next camera mode (A, B, C, A); returns its id, saved under gresca-cam
  setCameraMode: (id) => g.setCameraMode(id), // pick the camera mode by id; throws on an unknown id
  frame(dt) { g.frame(dt, 1); },        // move the camera and draw one frame (terrain, rider, HUD), dt in s
  start() { g.startRun(); },            // what the Drop in button does
  input(o) { set({ input: o }); },      // {left,right,brake,jump}, any subset; bypasses touch and keyboard
  resetInput() { resetInput(input); },  // lift every finger and key
  clearParticles() { clearSpray(spray); },
  // copies of the live spray: m, m/s, s
  particles() {
   return sprayCopies(spray);
  },
  // m, m, m, m/s, m/s, m/s, m/s
  emitParticles(n, px, py, pz, spread, up, dvx, dvy) { emit(spray, n, px, py, pz, spread, up, dvx, dvy); },
  ...recorderFacade(g),
  events: eventsFacade(g.bus),
  // particle cap; camera m behind the rider; rider draw scale; s per simulation step; steps the loop runs per frame
  config: Object.freeze({ maxParticles: MAX_PARTICLES, camBack: CAM_BACK, riderScale: RIDER_SCALE, fixedStep: SIM_DT,
   maxStepsPerFrame: SIM_MAX }),
  world: worldFacade(g.world),
  debug: viewDebug(g),
  // Opens a named scene (src/scenes.js) and pauses the game there (phase 'ready'): a fixed rig, place, speed and pose
  // for screenshots and for looking at one thing. Throws on an unknown name; returns the scene's note.
  scenes: () => Object.keys(SCENES).map((name) => ({ name, note: SCENES[name].note })), // the scene names and notes
  scene(name) {
   const api = {
    place: facade.place, set, input: facade.input, sim: facade.sim, state, frame: facade.frame,
    course: g.world.course,
   };
   return applyScene(name, api);
  },
 };
 return Object.freeze(facade);
}
