// Fixed 120 Hz timestep: the accumulator, one simulation tick, and where render interpolation starts.
// The simulation always advances in steps of SIM_DT, whatever the display's frame rate, so jumps, landings, crashes and
// grinds come out the same at 30, 60, 120 or 144 Hz. Each frame adds its real duration to the accumulator and runs as
// many whole steps as fit, at most SIM_MAX in one frame; after a longer stall (background tab, slow device, GC pause)
// the rest is dropped, so the game slows down rather than spiralling. The view shows the rider interpolated between
// the last two steps by the leftover fraction (alpha), so motion stays smooth when frames and steps don't line up.
import { SIM_DT, SIM_MAX, SIM_EPS } from '../core/config.js';
import { step } from './step.js';
import { stepSpray } from './particles.js';
import { publish, afterStep } from '../core/events.js';
import { recordInput } from '../core/input-log.js';

/** A new timestep: acc (s not yet simulated), fromX, fromY, fromZ (m, the rider before the latest step). */
export function createTimestep() {
 return { acc: 0, fromX: 0, fromY: 0, fromZ: 0 };
}

/** Starts interpolation at the rider's current position (no interpolation across a teleport: new run, place). */
export function snapInterpolation(timestep, rider) {
 timestep.fromX = rider.x;
 timestep.fromY = rider.y;
 timestep.fromZ = rider.z;
}

/**
 * One simulation tick of dt (s, SIM_DT in the loop): records the input (if recording), runs the physics, moves the
 * spray, then hands the step's events to their subscribers and runs the per-step hooks (bus, core/events.js).
 * sim: {state (see step()), input, world, bus, inputLog}. Does not touch render interpolation (advance() does).
 */
export function simTick(sim, dt = SIM_DT) {
 recordInput(sim.inputLog, sim.input);
 const events = step(sim.state, sim.input, sim.world, dt);
 stepSpray(sim.state.spray, dt);
 publish(sim.bus, events);
 afterStep(sim.bus, dt);
}

/**
 * Runs the whole steps that fit in dt (s) of real time plus what is left over, while a run is on. Returns alpha,
 * 0..1, how far between the last two steps the view should show the rider (1 outside a run).
 */
export function advance(sim, timestep, dt) {
 const session = sim.state.session;
 let alpha = 1;
 if (session.phase === 'run') {
  timestep.acc += dt;
  let n = 0;
  while (session.phase === 'run' && n < SIM_MAX && timestep.acc >= SIM_DT - SIM_EPS) {
   snapInterpolation(timestep, sim.state.rider);
   simTick(sim);
   timestep.acc -= SIM_DT;
   n++;
  }
  // run ended, or a stall longer than SIM_MAX steps: drop the rest
  if (session.phase !== 'run' || timestep.acc >= SIM_DT) timestep.acc = 0;
  timestep.acc = Math.max(0, timestep.acc);
  if (session.phase === 'run') alpha = timestep.acc / SIM_DT;
 } else {
  timestep.acc = 0;
 }
 return alpha;
}
