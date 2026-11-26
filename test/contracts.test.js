// @areas input shared
// The contracts in core/contracts.js (InputState, RiderState, SimEvent), the event bus and the input log, on plain
// objects in Node.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
 INPUT_FIELDS, RIDER_FIELDS, SIM_EVENT_TYPES, checkInputState, checkRiderState, checkSimEvent,
} from '../src/core/contracts.js';
import { createEventBus, on, onStep, publish, afterStep } from '../src/core/events.js';
import { createInputLog, startRecording, stopRecording, recordInput, readInput } from '../src/core/input-log.js';
import { createRider, createSession } from '../src/sim/state.js';
import { createInput, pointerDown, pointerUp, keyDown, keyUp, resetInput } from '../src/input/input.js';
import { jumpStep } from '../src/sim/jump.js';
import { SIM_DT } from '../src/core/config.js';

describe('core/contracts.js', () => {
 it('the field lists are frozen and complete', () => {
  assert.ok(Object.isFrozen(INPUT_FIELDS) && Object.isFrozen(RIDER_FIELDS) && Object.isFrozen(SIM_EVENT_TYPES));
  for (const k of ['steer', 'brake', 'jumpHeld', 'jumpPressed', 'flip', 'spin', 'lookBack']) {
   assert.ok(INPUT_FIELDS.includes(k), k);
  }
  const rider = [...RIDER_FIELDS.number, ...RIDER_FIELDS.boolean, ...RIDER_FIELDS.object];
  for (const k of ['travelHeading', 'boardHeading', 'edge', 'skid', 'flipRot', 'spinRot', 'isSwitch']) {
   assert.ok(rider.includes(k), k);
  }
  assert.deepEqual(Object.keys(createRider()).sort(), rider.sort(), 'createRider() has exactly the RiderState fields');
  assert.deepEqual([...SIM_EVENT_TYPES].sort(), ['brakeEnd', 'brakeStart', 'crash', 'finish', 'flip', 'grindEnd',
   'grindStart', 'land', 'score']);
 });

 it('InputState: createInput() and every control keep to the contract', () => {
  const input = createInput();
  assert.deepEqual(checkInputState(input), []);
  pointerDown(input, 1, 10, 100, 200);
  assert.equal(input.steer, -1);
  pointerDown(input, 2, 300, 100, 200);
  assert.deepEqual([input.steer, input.jumpHeld, input.jump, input.jumpPressed], [0, true, 1, 1]);
  assert.deepEqual(checkInputState(input), []);
  pointerUp(input, 1);
  assert.deepEqual([input.steer, input.jumpHeld], [1, false]);
  keyDown(input, ' ');
  assert.equal(input.jumpHeld, true, 'a held jump key');
  keyUp(input, ' ');
  assert.equal(input.jumpHeld, false);
  resetInput(input);
  assert.deepEqual(checkInputState(input), []);
  const { steer, jump, jumpPressed, flip, spin, lookBack } = input;
  assert.deepEqual([steer, jump, jumpPressed, flip, spin, lookBack], [0, 0, 0, 0, 0, 0]);
  const bads = [{ steer: 2 }, { brake: -0.1 }, { flip: NaN }, { jumpHeld: 1 }, { jump: 0.5 },
   { lookBack: 2 }, { lookBack: -1 }];
  for (const bad of bads) {
   assert.ok(checkInputState({ ...createInput(), ...bad }).length > 0, JSON.stringify(bad));
  }
 });

 it('RiderState: createRider() keeps to the contract, and a bad field is caught', () => {
  assert.deepEqual(checkRiderState(createRider()), []);
  for (const bad of [{ x: NaN }, { isSwitch: 0 }, { grind: 3 }, { skid: undefined }]) {
   assert.ok(checkRiderState({ ...createRider(), ...bad }).length > 0, JSON.stringify(bad));
  }
 });

 it('SimEvent: events from a jump keep to the contract, and a bad event is caught', () => {
  const rider = createRider(), input = createInput(), session = createSession();
  Object.assign(rider, { y: 600, vy: 10, heading: Math.PI / 2 });
  input.jump = 1;
  const seen = [];
  for (let n = 0; n < 200; n++) {
   jumpStep(rider, input, session, { particles: [], rng: { seed: 1, state: 1 } }, SIM_DT);
   seen.push(...session.events.splice(0));
  }
  assert.deepEqual(seen.map((e) => e.type), ['land', 'score']);
  for (const e of seen) assert.deepEqual(checkSimEvent(e), []);
  assert.equal(seen[1].kind, 'air');
  assert.ok(checkSimEvent({ type: 'jump', t: 0 }).length > 0, 'unknown type');
  assert.ok(checkSimEvent({ type: 'land', t: 1 }).length > 0, 'missing fields');
  assert.ok(checkSimEvent({ type: 'brakeStart', t: -1 }).length > 0, 'bad time');
  assert.deepEqual(checkSimEvent({ type: 'flip', t: 0 }), []);
 });
});

describe('core/events.js', () => {
 it('publishes by type and to every-type subscribers, runs step hooks, and unsubscribes', () => {
  const bus = createEventBus(), other = createEventBus();
  const got = [];
  const offLand = on(bus, 'land', (e) => got.push('land ' + e.t));
  on(bus, '*', (e) => got.push('* ' + e.type));
  onStep(bus, (dt) => got.push('step ' + dt));
  on(other, '*', () => got.push('other'));
  publish(bus, [{ type: 'land', t: 1 }, { type: 'score', t: 1 }]);
  afterStep(bus, 0.5);
  assert.deepEqual(got, ['* land', 'land 1', '* score', 'step 0.5']);
  offLand();
  got.length = 0;
  publish(bus, [{ type: 'land', t: 2 }]);
  assert.deepEqual(got, ['* land'], 'unsubscribed, and buses are independent');
 });
});

describe('core/input-log.js', () => {
 it('records the contract fields per step and reads them back', () => {
  const log = createInputLog(), input = createInput();
  recordInput(log, input);
  assert.equal(log.n, 0, 'idle until started');
  startRecording(log, 2);
  input.left = 1;
  input.steer = -1;
  input.jumpHeld = true;
  recordInput(log, input);
  recordInput(log, createInput());
  recordInput(log, input);
  assert.equal(log.n, 2);
  assert.equal(log.on, false, 'a full log stops');
  const out = createInput();
  readInput(log, 0, out);
  assert.deepEqual([out.left, out.steer, out.jumpHeld], [1, -1, true]);
  assert.deepEqual(checkInputState(out), []);
  readInput(log, 1, out);
  assert.deepEqual([out.left, out.steer, out.jumpHeld], [0, 0, false]);
  stopRecording(log);
  assert.equal(log.n, 2);
 });
});
