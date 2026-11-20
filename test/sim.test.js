// The pure layers on their own (core/, world/, sim/): imported straight into Node with no stubs, no DOM, no art
// modules and no createGame. Plain objects in, plain objects out.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, reseed, rnd } from '../src/core/rng.js';
import { RIGS, SIM_DT } from '../src/core/config.js';
import { KICK, RAILS, cx, bump } from '../src/world/course.js';
import { Terrain } from '../src/world/terrain.js';
import { createRider, createSession } from '../src/sim/state.js';
import { emit, stepParticles } from '../src/sim/particles.js';
import { jumpStep } from '../src/sim/jump.js';
import { railCheck } from '../src/sim/grind.js';
import { step } from '../src/sim/step.js';
import { createTimestep, advance } from '../src/sim/timestep.js';
import { createInput, applyInput, pointerDown, keyDown } from '../src/input/input.js';

const spray = (seed = 1) => ({ particles: [], rng: createRng(seed) });

// A plane falling `slope` m per m down +y, n × n cells of 1 m, with the whole of it groomed.
function plane(slope, n = 64) {
 const data = new Float32Array(n * n);
 for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[y * n + x] = 100 - slope * y;
 return Terrain.create({ base: Terrain.grid(data, n, n, 1), groomed: () => 1 });
}

// Everything step() takes, around a rider at (x, y) on a plane, with no trees, ui or colour map in use.
function simOn(terrain, x, y) {
 const rider = createRider();
 Object.assign(rider, { x, y, heading: Math.PI / 2 });
 const W0 = 1000;
 const col = new Uint8ClampedArray(W0 * 4 * 80);
 return { rider, input: createInput(), session: createSession(), terrain, trees: new Map(), spray: spray(),
  gradient: { gx: 0, gy: 0 }, view: { col, col0: col.slice() }, ui: null };
}

describe('core/rng.js', () => {
 it('is the same sequence from the same seed, and reseed restarts it', () => {
  const a = createRng(7), b = createRng(7);
  const seq = [rnd(a), rnd(a), rnd(a)];
  assert.deepEqual([rnd(b), rnd(b), rnd(b)], seq);
  reseed(a);
  assert.equal(rnd(a), seq[0]);
  assert.notEqual(rnd(createRng(8)), seq[0]);
  for (let i = 0; i < 1000; i++) { const v = rnd(a); assert.ok(v >= 0 && v < 1); }
 });
});

describe('world/course.js', () => {
 it('the rails follow the piste and the kicker ramps sit on it', () => {
  for (const r of RAILS) {
   assert.ok(Math.abs(Math.hypot(r.dx, r.dy) - 1) < 1e-12);
   assert.ok(Math.abs(Math.abs(r.x0 - cx(r.y0)) - 9) < 1e-9, 'a rail sits 9 m off the centreline');
  }
  assert.ok(bump(cx(KICK[0]), KICK[0]) > 1, 'a kicker lip is over a metre up');
  assert.equal(bump(cx(600), 600), 0, 'no ramp in the practice stretch');
  assert.ok(Object.isFrozen(RAILS) && Object.isFrozen(RAILS[0]) && Object.isFrozen(KICK));
 });
});

describe('sim/ on plain objects', () => {
 it('particles: emit draws from the spray rng, stepParticles moves and expires them', () => {
  const a = spray(3), b = spray(3);
  emit(a, 5, 1, 2, 0.1, 2, 1, 0, 0);
  emit(b, 5, 1, 2, 0.1, 2, 1, 0, 0);
  assert.deepEqual(a.particles, b.particles);
  assert.equal(a.particles.length, 5);
  stepParticles(a.particles, 0.1);
  assert.ok(a.particles.every((p) => p.t > 0.09));
  for (let i = 0; i < 20; i++) stepParticles(a.particles, 0.1);
  assert.equal(a.particles.length, 0, 'all spray dies within a second or two');
 });

 it('jumpStep: a jump request takes off, flies and lands with a count and a landing speed', () => {
  const rider = createRider(), input = createInput(), session = createSession(), s = spray();
  Object.assign(rider, { x: cx(600), y: 600, vy: 10, heading: Math.PI / 2 });
  input.jump = 1;
  jumpStep(rider, input, session, s, SIM_DT);
  assert.ok(rider.z > 0 && rider.vz > 0, 'took off');
  assert.equal(input.jump, 0, 'the request is used up');
  let n = 0;
  while (rider.z > 0 && n++ < 1000) jumpStep(rider, input, session, s, SIM_DT);
  assert.equal(rider.landings, 1);
  assert.ok(rider.landingSpeed > 5);
  assert.equal(rider.crashTimer, 0, 'lined up with travel: a clean landing');
  assert.ok(session.score > 0, 'air time scores');
  assert.ok(s.particles.length > 0, 'landing spray');
 });

 it('jumpStep: landing hard and sideways is a crash', () => {
  const rider = createRider(), session = createSession();
  Object.assign(rider, { y: 600, vx: 0, vy: 10, heading: 0, z: 0.01, vz: -9 });
  jumpStep(rider, createInput(), session, spray(), SIM_DT);
  assert.ok(rider.crashTimer > 0);
  assert.equal(session.crashes, 1);
 });

 it('railCheck: riding along a rail starts a grind, across it does not', () => {
  const r = RAILS[0], along = createRider(), across = createRider();
  Object.assign(along, { x: r.x0 + r.dx * 2, y: r.y0 + r.dy * 2, vx: r.dx * 10, vy: r.dy * 10, heading: Math.atan2(r.dy, r.dx) });
  Object.assign(across, { x: along.x, y: along.y, vx: 10, vy: 0, heading: 0 });
  railCheck(along, createInput(), spray());
  railCheck(across, createInput(), spray());
  assert.equal(along.grind && along.grind.r, r);
  assert.equal(along.z, r.h);
  assert.equal(across.grind, null);
 });

 it('step: gravity pulls down the fall line and braking slows the rider', () => {
  const free = simOn(plane(0.3), 32, 20), braked = simOn(plane(0.3), 32, 20);
  braked.input.brake = 1;
  for (let i = 0; i < 120; i++) { step(free, SIM_DT); step(braked, SIM_DT); }
  assert.ok(free.rider.vy > 3, `speed ${free.rider.vy}`);
  assert.ok(braked.rider.vy < free.rider.vy / 2);
  assert.ok(Math.abs(free.session.time - 1) < 1e-9);
  assert.equal(free.rider.x, 32, 'straight down a plane, no drift');
 });

 it('step: skis turn faster than the board for the same input', () => {
  const turned = (rig) => {
   const sim = simOn(plane(0.3), 32, 20);
   sim.session.rig = rig;
   sim.rider.vy = 5;
   sim.input.right = 1;
   for (let i = 0; i < 30; i++) step(sim, SIM_DT);
   return sim.rider.heading - Math.PI / 2;
  };
  assert.ok(turned('ski') > turned('board') && RIGS.ski.turn > RIGS.board.turn);
 });

 it('advance: whole 120 Hz steps only during a run, the rest carried as alpha', () => {
  const sim = simOn(plane(0.3), 32, 20), ts = createTimestep();
  sim.session.phase = 'run';
  const alpha = advance(sim, ts, 2.5 * SIM_DT);
  assert.ok(Math.abs(sim.session.time - 2 * SIM_DT) < 1e-12);
  assert.ok(Math.abs(alpha - 0.5) < 1e-6);
  sim.session.phase = 'ready';
  assert.equal(advance(sim, ts, 1), 1);
  assert.ok(Math.abs(sim.session.time - 2 * SIM_DT) < 1e-12, 'no steps outside a run');
 });
});

describe('input/input.js', () => {
 it('both halves together, or the jump key, request one jump', () => {
  const input = createInput();
  pointerDown(input, 1, 10, 100, 200);
  assert.deepEqual([input.left, input.right, input.jump], [1, 0, 0]);
  pointerDown(input, 2, 300, 100, 200);
  assert.deepEqual([input.left, input.right, input.jump], [1, 1, 1]);
  input.jump = 0;
  applyInput(input);
  assert.equal(input.jump, 0, 'holding both does not repeat the jump');
  const k = createInput();
  keyDown(k, 'w');
  assert.equal(k.jump, 1);
 });
});
