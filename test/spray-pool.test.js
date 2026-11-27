// @areas sim
// G1: the spray is a fixed pool of typed arrays. Ten seconds of spray-heavy riding at a fixed dt makes no particle
// objects (the arrays and the pool are the same objects, the same length, before and after), and a full pool drops
// new particles.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { MAX_PARTICLES, SIM_DT } from '../src/core/config.js';
import { Terrain } from '../src/world/terrain.js';
import { NO_TREES } from '../src/world/build.js';
import { createRider, createSession } from '../src/sim/state.js';
import { createInput } from '../src/input/input.js';
import { step } from '../src/sim/step.js';
import { createSpray, emit, sprayCount, sprayPool, stepSpray, clearSpray } from '../src/sim/particles.js';

const N = 400; // grid cells each way, 1 m apart
const POWDER_M = 0.6; // m of loose snow: the plume that throws the most spray
const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 't', 'life', 'r'];

// A slope 0.4 m per m with powder everywhere, and a rider on it with a spray (sim only, the same loop as the game's).
function ride() {
 const data = new Float32Array(N * N);
 for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) data[y * N + x] = 500 - 0.4 * y;
 const terrain = Terrain.create({ base: Terrain.grid(data, N, N, 1), groomed: () => 0, powder: () => POWDER_M });
 const rider = createRider();
 Object.assign(rider, { x: N / 2, y: 20, heading: -Math.PI / 2, vx: 0, vy: 12 });
 const session = createSession();
 session.phase = 'run';
 const spray = createSpray(createRng(1));
 const state = { rider, session, spray, gradient: { gx: 0, gy: 0 } };
 return { rider, session, spray, state, world: { terrain, trees: NO_TREES }, input: createInput() };
}

describe('G1 spray pool', () => {
 it('10 s of hard riding allocates no particle objects: the pool and its arrays stay the same', () => {
  const r = ride();
  const pool = sprayPool(r.spray);
  const arrays = FIELDS.map((k) => pool[k]);
  let most = 0;
  for (let i = 0; i < Math.round(10 / SIM_DT); i++) {
   r.input.left = i % 240 < 120 ? 1 : 0; // alternating carves, then a brake
   r.input.right = 1 - r.input.left;
   r.input.brake = i % 360 > 300 ? 1 : 0;
   if (r.rider.y > N - 20) r.rider.y = 20;
   step(r.state, r.input, r.world, SIM_DT);
   r.session.events.length = 0;
   stepSpray(r.spray, SIM_DT);
   most = Math.max(most, sprayCount(r.spray));
  }
  assert.ok(most > 20, `the ride throws spray (peak ${most})`);
  assert.ok(most <= MAX_PARTICLES);
  assert.equal(sprayPool(r.spray), pool, 'the same pool');
  FIELDS.forEach((k, j) => {
   assert.equal(pool[k], arrays[j], `${k} is the same array`);
   assert.equal(pool[k].length, MAX_PARTICLES, `${k} keeps its length`);
  });
 });

 it('a full pool drops the new particles, keeps the live ones in place and draws nothing from the rng', () => {
  const spray = createSpray(createRng(5));
  emit(spray, MAX_PARTICLES, 1, 2, 0.1, 2, 1, 0, 0);
  assert.equal(sprayCount(spray), MAX_PARTICLES);
  const pool = sprayPool(spray);
  const first = pool.x[0];
  const rng = { ...spray.rng };
  emit(spray, 50, 9, 9, 0.1, 2, 1, 0, 0);
  assert.equal(sprayCount(spray), MAX_PARTICLES, 'never more than MAX_PARTICLES');
  assert.equal(pool.x[0], first, 'the oldest keep their place');
  assert.ok(pool.x.every((x) => x === 1), 'none of the dropped puffs got in');
  assert.deepEqual({ ...spray.rng }, rng, 'a full pool draws no random numbers');
  clearSpray(spray);
  assert.equal(sprayCount(spray), 0);
  assert.equal(sprayPool(spray), pool);
 });

 it('dead particles are compacted out in order, so the survivors keep their order', () => {
  const spray = createSpray(createRng(2));
  emit(spray, 3, 0, 0, 0.1, 0, 1, 0, 0, 1, 1);   // low: they fall into the snow
  emit(spray, 3, 5, 0, 50, 0, 1, 0, 0, 1, 10);  // long-lived and high: nothing ends them within 1 s
  emit(spray, 3, 9, 0, 0.1, 0, 1, 0, 0, 1, 1);
  for (let i = 0; i < 100; i++) stepSpray(spray, 0.01); // 1 s: the short-lived ones are gone
  const pool = sprayPool(spray);
  assert.equal(sprayCount(spray), 3);
  assert.ok([0, 1, 2].every((i) => pool.x[i] > 4 && pool.x[i] < 6), 'the long-lived three, in their place');
 });
});
