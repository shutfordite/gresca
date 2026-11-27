// @areas input shared
// The contracts in core/contracts.js (InputState, RiderState, SimEvent), the event bus and the input log, on plain
// objects in Node.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
 INPUT_FIELDS, RIDER_FIELDS, SIM_EVENT_TYPES, checkInputState, checkRiderState, checkSimEvent,
 GRIND_STYLES, JUMP_SIZES, RAIL_PROFILES, RAIL_ENTRIES, JUMP_WORLD_POINTS, checkParkFeatures, checkAnimInput,
} from '../src/core/contracts.js';
import { createEventBus, on, onStep, publish, afterStep } from '../src/core/events.js';
import { createInputLog, startRecording, stopRecording, recordInput, readInput } from '../src/core/input-log.js';
import { createRider, createSession } from '../src/sim/state.js';
import { createInput, pointerDown, pointerUp, keyDown, keyUp, resetInput } from '../src/input/input.js';
import { jumpStep } from '../src/sim/jump.js';
import { SIM_DT, JUMP_GRAVITY } from '../src/core/config.js';
import { railCheck } from '../src/sim/grind.js';
import { createSpray } from '../src/sim/particles.js';
import { createAnimInput, animInput } from '../src/sim/anim-input.js';
import { DEFAULT_COURSE } from '../src/world/course.js';
import { parkAt } from './park-fixtures.js';

describe('core/contracts.js', () => {
 it('the field lists are frozen and complete', () => {
  assert.ok(Object.isFrozen(INPUT_FIELDS) && Object.isFrozen(RIDER_FIELDS) && Object.isFrozen(SIM_EVENT_TYPES));
  for (const k of ['steer', 'brake', 'jumpHeld', 'jumpPressed', 'flip', 'spin', 'lookBack']) {
   assert.ok(INPUT_FIELDS.includes(k), k);
  }
  const rider = [...RIDER_FIELDS.number, ...RIDER_FIELDS.boolean, ...RIDER_FIELDS.object];
  for (const k of ['travelHeading', 'boardHeading', 'edge', 'skid', 'flipRot', 'spinRot', 'isSwitch', 'yawRate',
   'snowDepth', 'sink']) {
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
   jumpStep(rider, input, session, createSpray({ seed: 1, state: 1 }), SIM_DT);
   seen.push(...session.events.splice(0));
  }
  assert.deepEqual(seen.map((e) => e.type), ['land', 'score']);
  for (const e of seen) assert.deepEqual(checkSimEvent(e), []);
  assert.equal(seen[1].kind, 'air');
  assert.ok(checkSimEvent({ type: 'jump', t: 0 }).length > 0, 'unknown type');
  assert.ok(checkSimEvent({ type: 'land', t: 1 }).length > 0, 'missing fields');
  assert.ok(checkSimEvent({ type: 'brakeStart', t: -1 }).length > 0, 'bad time');
  assert.deepEqual(checkSimEvent({ type: 'flip', t: 0, flips: -1 }), []);
  assert.ok(checkSimEvent({ type: 'flip', t: 0 }).length > 0, 'a flip event names its flips');
  assert.ok(checkSimEvent({ type: 'score', t: 0, points: 5, kind: 'air', degrees: 0 }).length > 0, 'score has flips');
 });
});

describe('the park contract (docs/adr/0012-park-features.md)', () => {
 it('the park lists are frozen, and the jump gravity is a shared tunable', () => {
  for (const list of [GRIND_STYLES, JUMP_SIZES, RAIL_PROFILES, RAIL_ENTRIES]) assert.ok(Object.isFrozen(list));
  assert.deepEqual([...GRIND_STYLES], ['5050', 'boardslide', 'lipslide']);
  assert.equal(JUMP_WORLD_POINTS, 4);
  assert.equal(JUMP_GRAVITY, 15, 'm/s², the value sim/jump.js always had');
 });

 it('RiderState.grind: a grind starts with seg 0, style 5050 and balance 0, and a bad grind is caught', () => {
  const rider = createRider();
  const input = createInput();
  const r = DEFAULT_COURSE.rails[0];
  const at = DEFAULT_COURSE.point(r.s0 + 1, r.d, {});
  const phi = Math.atan2(r.dy, r.dx);
  Object.assign(rider, { x: at.x, y: at.y, vx: r.dx * 10, vy: r.dy * 10, heading: phi });
  railCheck(rider, input, createSpray({ seed: 1, state: 1 }), DEFAULT_COURSE);
  assert.ok(rider.grind, 'on the rail');
  assert.deepEqual([rider.grind.seg, rider.grind.style, rider.grind.balance], [0, '5050', 0]);
  assert.deepEqual(checkRiderState(rider), []);
  const a = animInput(rider, createSession(), DEFAULT_COURSE, createAnimInput());
  assert.equal(a.grindStyle, '5050');
  assert.deepEqual(checkAnimInput(a), []);
  for (const bad of [{ seg: -1 }, { seg: 0.5 }, { style: 'nosegrind' }, { balance: 2 }, { t: NaN }]) {
   assert.ok(checkRiderState({ ...rider, grind: { ...rider.grind, ...bad } }).length > 0, JSON.stringify(bad));
  }
 });

 it('AnimInput.grindStyle: 5050 off a rail, and a bad style is caught', () => {
  const a = createAnimInput();
  assert.equal(a.grindStyle, '5050');
  assert.deepEqual(checkAnimInput(a), []);
  assert.deepEqual(checkAnimInput({ ...a, grindStyle: 'boardslide' }), []);
  assert.deepEqual(checkAnimInput({ ...a, grindStyle: 3 }), ['grindStyle is not one of 5050, boardslide, lipslide']);
 });

 it('SimEvent grindStart and grindEnd: style and kinks are optional, typed when present', () => {
  const start = { type: 'grindStart', t: 1, rail: 0, kind: 'rail' };
  const end = { type: 'grindEnd', t: 2, rail: 0, kind: 'box', dist: 6, jumped: false };
  assert.deepEqual(checkSimEvent(start), [], 'today\'s events');
  assert.deepEqual(checkSimEvent(end), []);
  assert.deepEqual(checkSimEvent({ ...start, style: 'lipslide' }), []);
  assert.deepEqual(checkSimEvent({ ...end, style: '5050', kinks: 2 }), []);
  for (const bad of [{ style: 'nosegrind' }, { style: 1 }, { kinks: -1 }, { kinks: 1.5 }, { kinks: '2' }]) {
   assert.ok(checkSimEvent({ ...end, ...bad }).length > 0, JSON.stringify(bad));
  }
  assert.ok(checkSimEvent({ ...start, style: 'nosegrind' }).length > 0);
 });

 it('checkParkFeatures: a jump and a kinked rail pass as authored; world points only when resolved', () => {
  assert.deepEqual(checkParkFeatures(parkAt(), false), []);
  assert.deepEqual(checkParkFeatures({ jumps: [], rails: [] }, false), []);
  const authored = parkAt();
  assert.match(checkParkFeatures(authored, true).join('\n'), /jumps\[0\]\.world: must be a frozen list of 4/);
  const resolved = parkAt();
  resolved.jumps[0].world = Object.freeze([0, 1, 2, 3].map((i) => ({ x: i, y: 0, z: 100 })));
  resolved.rails[0].world = Object.freeze(resolved.rails[0].points.map((p) => ({ x: p.s, y: p.d, z: 100 + p.h })));
  assert.deepEqual(checkParkFeatures(resolved, true), []);
  assert.match(checkParkFeatures(resolved, false).join('\n'), /world: is resolved when the world is built/);
 });

 it('checkParkFeatures: bad jumps and rails are caught, naming the field', () => {
  const cases = [
   [(f) => { f.jumps[0].size = 'xxl'; }, /jumps\[0\]\.size: must be one of xs, s, m, l, xl/],
   [(f) => { f.jumps[0].designSpeed = 80; }, /jumps\[0\]\.designSpeed: must be 3\.\.40 m\/s/],
   [(f) => { f.jumps[0].takeoff.angle = 30; }, /jumps\[0\]\.takeoff\.angle: must be 0\.1\.\.0\.7 rad/],
   [(f) => { f.jumps[0].table.gap = 'no'; }, /jumps\[0\]\.table: must be \{length, gap\}/],
   [(f) => { delete f.jumps[0].landing; }, /jumps\[0\]\.landing: must be \{height, angle, length\}/],
   [(f) => { f.jumps[0].s = NaN; }, /jumps\[0\]: s and d must be numbers/],
   [(f) => { f.rails[0].points.length = 1; }, /rails\[0\]\.points: must be 2\.\.64/],
   [(f) => { f.rails[0].points[1].h = 5; }, /rails\[0\]\.points\[1\]\.h: must be 0\.\.3 m/],
   [(f) => { f.rails[0].points[1] = { ...f.rails[0].points[0] }; }, /points\[1\]: closer than 0\.1 m/],
   [(f) => { f.rails[0].width = 0.5; }, /rails\[0\]\.width: must be 0\.03\.\.0\.15 m for a rail/],
   [(f) => { f.rails[0].profile = 'box'; f.rails[0].width = 0.05; }, /width: must be 0\.2\.\.0\.8 m for a box/],
   [(f) => { f.rails[0].profile = 'tube'; }, /rails\[0\]\.profile: must be one of rail, box/],
   [(f) => { f.rails[0].legs = 'yes'; }, /rails\[0\]\.legs: must be true/],
   [(f) => { f.rails[0].entry = 'drop'; }, /rails\[0\]\.entry: must be one of ramp, side/],
   [(f) => { f.rails = {}; }, /features\.rails: must be a list/],
  ];
  for (const [change, why] of cases) {
   const f = parkAt();
   change(f);
   assert.match(checkParkFeatures(f, false).join('\n'), why);
  }
  assert.deepEqual(checkParkFeatures(null), ['features: must be {jumps, rails}']);
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
