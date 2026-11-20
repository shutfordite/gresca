// The test and debug façade (window.Gresca): the one stable way for tests and a debugging console to read and drive
// a game. Tests never see the state objects, so they can be reorganised by re-pointing the field files only.
// Each area registers its own fields: sim/fields.js, ui/fields.js, input/fields.js, view/fields.js (and the world's,
// world/fields.js); this file composes them and adds the actions. Units: metres (m), seconds (s), m/s and radians
// (rad). Map axes: +x across the map, +y down the run.
// Everything it returns is a copy: changing a returned value changes nothing in the game. Write with set().
// Nothing in the game calls it.
import { MAX_PARTICLES, CAM_BACK, RIDER_SCALE, SIM_DT, SIM_MAX } from './core/config.js';
import { reseed } from './core/rng.js';
import { SIM_EVENT_TYPES, INPUT_FIELDS } from './core/contracts.js';
import { on, publish, afterStep } from './core/events.js';
import { startRecording, stopRecording, readInput } from './core/input-log.js';
import { worldFacade } from './world/fields.js';
import { step } from './sim/step.js';
import { emit, stepParticles } from './sim/particles.js';
import { simTick, snapInterpolation } from './sim/timestep.js';
import { simFields } from './sim/fields.js';
import { resetInput } from './input/input.js';
import { inputFields } from './input/fields.js';
import { uiFields } from './ui/fields.js';
import { viewFields, viewDebug } from './view/fields.js';

const PLACE = Object.freeze({ x: null, y: 500, vx: 0, vy: 0, heading: Math.PI / 2, z: 0, vz: 0 });
const EVENT_LOG_MAX = 1000; // events Gresca.events keeps; older ones are dropped

// m, x of the course's centreline (d = 0) level with map y (m): where place() puts the rider by default.
function centreX(course, y) {
 const p = course.project(0, y, {});
 return course.point(p.s, 0, p).x;
}

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
 * camera, view, world, rng, spray, timestep, sim, scene, hanga, hud, bus, inputLog, startRun, frame).
 */
export function createFacade(g) {
 const { rider, input, spray, timestep } = g;
 const FIELDS = Object.freeze({
  ...simFields(rider, g.session, spray, g.world.course),
  ...uiFields(g.hud),
  ...inputFields(input),
  ...viewFields(g.camera),
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
 return Object.freeze({
  state,
  set,
  // New run (start()), then put the rider at {x,y,vx,vy,heading,z,vz}: defaults y 500 (the empty practice
  // stretch), x on the piste centreline, at rest, heading straight down. Clears crashes and all input.
  place(o = {}) {
   for (const k in o) if (!(k in PLACE)) throw new Error('Gresca.place: unknown field ' + k);
   const d = Object.assign({}, PLACE, o);
   g.startRun();
   rider.x = d.x === null ? centreX(g.world.course, d.y) : d.x;
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
  stepParticles(dt) { stepParticles(spray.particles, dt); }, // one spray step only
  frame(dt) { g.frame(dt, 1); },        // move the camera and draw one frame (terrain, rider, HUD), dt in s
  start() { g.startRun(); },            // what the Drop in button does
  input(o) { set({ input: o }); },      // {left,right,brake,jump}, any subset; bypasses touch and keyboard
  resetInput() { resetInput(input); },  // lift every finger and key
  clearParticles() { spray.particles.length = 0; },
  // copies of the live spray: m, m/s, s
  particles() {
   return spray.particles.map((p) => ({ x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, t: p.t, life: p.life }));
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
 });
}
