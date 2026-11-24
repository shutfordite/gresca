// The event bus between the sim and its subscribers (ui/, view/, the façade): SimEvents by type, and per-step hooks.
// One bus per game, made by createGame(env) (docs/adr/0002). Publishing never allocates: the sim's event array is
// reused every step, and subscribers must copy anything they keep.

/** A new bus: byType (type -> handlers), all (handlers for every event), steps (handlers run after each sim step). */
export function createEventBus() {
 return { byType: new Map(), all: [], steps: [] };
}

/** Calls fn(event) for each SimEvent of type ('*' for every type). Returns a function that unsubscribes. */
export function on(bus, type, fn) {
 let list = bus.all;
 if (type !== '*') {
  if (!bus.byType.has(type)) bus.byType.set(type, []);
  list = bus.byType.get(type);
 }
 list.push(fn);
 return () => {
  const i = list.indexOf(fn);
  if (i >= 0) list.splice(i, 1);
 };
}

/** Calls fn(dt) after every sim step (dt: s), once that step's events are published. Returns an unsubscribe. */
export function onStep(bus, fn) {
 bus.steps.push(fn);
 return () => {
  const i = bus.steps.indexOf(fn);
  if (i >= 0) bus.steps.splice(i, 1);
 };
}

/** Hands one step's events (an array of SimEvents, in order) to their subscribers. */
export function publish(bus, events) {
 for (let i = 0; i < events.length; i++) {
  const e = events[i];
  for (let j = 0; j < bus.all.length; j++) bus.all[j](e);
  const list = bus.byType.get(e.type);
  if (list) for (let j = 0; j < list.length; j++) list[j](e);
 }
}

/** Runs the per-step hooks for a step of dt (s). */
export function afterStep(bus, dt) {
 for (let j = 0; j < bus.steps.length; j++) bus.steps[j](dt);
}
