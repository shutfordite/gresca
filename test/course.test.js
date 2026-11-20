// The Course interface (core/contracts.js) and the procedural course (world/course.js), the fall line and downhillSide
// in RiderState, and AnimInput (sim/anim-input.js): pure modules in Node, plus the course through the façade.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
 COURSE_FIELDS, ANIM_INPUT_FIELDS, RIDER_FIELDS, checkCourse, checkAnimInput, checkRiderState,
} from '../src/core/contracts.js';
import { SIM_DT } from '../src/core/config.js';
import { FIN, KICK, KBIG, RAILS, cx, createProceduralCourse, DEFAULT_COURSE } from '../src/world/course.js';
import { Terrain } from '../src/world/terrain.js';
import { createRider, createSession } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { createAnimInput, animInput } from '../src/sim/anim-input.js';
import { createInput } from '../src/input/input.js';
import { load } from './harness.js';

// A plane n x n m that falls `fall` m per m in the unit direction (ux, uy).
function tilted(ux, uy, fall, n = 64) {
 const data = new Float32Array(n * n);
 for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[y * n + x] = 100 - fall * (ux * x + uy * y);
 return Terrain.create({ base: Terrain.grid(data, n, n, 1), groomed: () => 1 });
}

// One step of a rider at (32, 32) with the given heading on terrain, through step() with a course on it.
function stepOn(terrain, heading) {
 const rider = createRider();
 Object.assign(rider, { x: 32, y: 32, heading });
 const state = { rider, session: createSession(), spray: { particles: [], rng: { seed: 1, state: 1 } },
  gradient: { gx: 0, gy: 0 }, where: { s: 0, d: 0, tx: 0, ty: 1 } };
 const world = { terrain, trees: new Map(), course: createProceduralCourse(terrain) };
 step(state, createInput(), world, SIM_DT);
 return rider;
}

describe('Course (core/contracts.js)', () => {
 it('the member lists are frozen, and the procedural course meets the contract', () => {
  assert.ok(Object.isFrozen(COURSE_FIELDS) && Object.isFrozen(ANIM_INPUT_FIELDS));
  assert.deepEqual(checkCourse(createProceduralCourse(tilted(0, 1, 0.3))), []);
  assert.deepEqual(checkCourse(DEFAULT_COURSE), []);
  assert.ok(Object.isFrozen(DEFAULT_COURSE) && Object.isFrozen(DEFAULT_COURSE.kickers[0]));
 });

 it('a bad course is caught', () => {
  const bad = { ...DEFAULT_COURSE, finishS: NaN, kickers: [] };
  assert.deepEqual(checkCourse(bad), ['finishS is not a finite number', 'kickers is not a frozen list']);
  const off = { ...DEFAULT_COURSE, point: (s, d, out) => Object.assign(out, { x: d + 1, y: s }) };
  assert.deepEqual(checkCourse(off), ['project(point(s, d)) is not (s, d)']);
 });
});

describe('the procedural course (s = y, d = x - cx(y))', () => {
 const course = DEFAULT_COURSE;
 it('project and point are exact inverses and give today\'s numbers', () => {
  const p = course.project(cx(700) + 5, 700, {});
  assert.equal(p.s, 700);
  assert.equal(p.d, cx(700) + 5 - cx(700));
  assert.ok(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-12 && p.ty > 0, 'unit tangent, down the piste');
  // the tangent follows the centreline: a step along it stays on the centreline to first order
  const q = course.point(700 + p.ty, 0, {});
  assert.ok(Math.abs(q.x - (cx(700) + p.tx)) < 1e-3);
  assert.deepEqual(course.point(60, 0, {}), { x: cx(60), y: 60 });
  assert.equal(course.finishS, FIN);
  assert.equal(course.startS, 60);
  assert.ok(course.length >= FIN && course.widthAt(700) > 0);
 });

 it('kickers and rails are the park, in s and d', () => {
  assert.deepEqual(course.kickers.map((k) => k.s), [...KICK]);
  assert.deepEqual(course.kickers.filter((k) => k.big).map((k) => k.s), [...KBIG]);
  assert.equal(course.rails, RAILS);
  for (const r of course.rails) {
   assert.equal(r.s0, r.y0);
   assert.equal(r.s1, r.y1);
   assert.equal(r.d, r.x0 - cx(r.y0) > 0 ? 9 : -9);
  }
 });

 it('kickerAt: the launch zone is within 9 m across and 5 m past the lip', () => {
  const k = course.kickers[3];
  assert.equal(course.kickerAt(k.s, 0), k);
  assert.equal(course.kickerAt(k.s + 4.9, 8.9), k);
  assert.equal(course.kickerAt(k.s + 5, 0), null);
  assert.equal(course.kickerAt(k.s - 0.01, 0), null);
  assert.equal(course.kickerAt(k.s, -9), null);
  assert.equal(course.kickerAt(600, 0), null, 'no kicker in the practice stretch');
 });

 it('fallLine: straight down a plane, its heading, and the tangent on flat ground', () => {
  const c = createProceduralCourse(tilted(0.6, 0.8, 0.3));
  const f = c.fallLine(32, 32, {});
  // float32 heights: a few parts in a million
  assert.ok(Math.abs(f.fx - 0.6) < 1e-5 && Math.abs(f.fy - 0.8) < 1e-5, JSON.stringify(f));
  assert.ok(Math.abs(f.heading - Math.atan2(0.8, 0.6)) < 1e-5);
  assert.ok(Math.abs(f.slope - 0.3) < 1e-5);
  const flat = createProceduralCourse(tilted(1, 0, 0)).fallLine(32, 32, {});
  const t = c.project(32, 32, {});
  assert.deepEqual([flat.fx, flat.fy, flat.slope], [t.tx, t.ty, 0]);
 });
});

describe('RiderState.fallLine and downhillSide (sim/step.js)', () => {
 it('are RiderState fields', () => {
  assert.ok(RIDER_FIELDS.number.includes('fallLine') && RIDER_FIELDS.number.includes('downhillSide'));
  assert.deepEqual(checkRiderState(createRider()), []);
 });

 it('the fall line under the rider, and which side of the board it is on', () => {
  const plane = tilted(0, 1, 0.3); // falls to +y: fall line heading PI/2
  const across = stepOn(plane, 0.2); // board pointing at heading 0.2: the fall line is counter-clockwise of it
  assert.ok(Math.abs(across.fallLine - Math.PI / 2) < 1e-6);
  assert.equal(across.downhillSide, 1);
  assert.equal(stepOn(plane, Math.PI - 0.2).downhillSide, -1);
  const flat = stepOn(tilted(0, 1, 0), 0.2);
  assert.equal(flat.downhillSide, 0);
  assert.deepEqual(checkRiderState(across), []);
 });
});

describe('AnimInput (sim/anim-input.js)', () => {
 it('createAnimInput() and animInput() keep to the contract', () => {
  const out = createAnimInput();
  assert.deepEqual(checkAnimInput(out), []);
  const rider = createRider();
  Object.assign(rider, { x: cx(KICK[3] - 5), y: KICK[3] - 5, vx: 0, vy: 10, heading: Math.PI / 2, landingSpeed: 3 });
  const session = createSession();
  assert.equal(animInput(rider, session, DEFAULT_COURSE, out), out);
  assert.deepEqual(checkAnimInput(out), []);
  assert.deepEqual([out.speed, out.travelDir, out.riderSide, out.impact, out.approach], [10, Math.PI / 2, 1, 3, true]);
  session.stance = 'goofy';
  animInput(rider, session, DEFAULT_COURSE, out);
  assert.deepEqual([out.facing, out.riderSide], [Math.PI / 2 + Math.PI, -1]);
  rider.x += 10; // off the kicker's line
  assert.equal(animInput(rider, session, DEFAULT_COURSE, out).approach, false);
  assert.deepEqual(checkAnimInput({ ...out, speed: NaN, wiped: 0 }), ['speed is not a finite number',
   'wiped is not a boolean']);
 });
});

describe('the course through the façade (Gresca.world.course)', async () => {
 const g = await load();
 it('reports the course the game rides, in copies, and the old fields agree with it', () => {
  const W = g.world, C = W.course;
  assert.equal(C.finishS, W.finishY);
  assert.deepEqual(C.point(700, 0), { x: W.centre(700), y: 700 });
  assert.equal(C.project(W.centre(700) - 4, 700).d, W.centre(700) - 4 - W.centre(700));
  assert.deepEqual(C.kickers.map((k) => k.s), W.kickers);
  assert.equal(C.kickerAt(W.kickers[0] + 1, 0).s, W.kickers[0]);
  assert.ok(Object.isFrozen(C));
  g.place({ y: 700, vy: 10, heading: 0.3 });
  g.sim(SIM_DT);
  const s = g.state();
  assert.ok(Math.abs(s.fallLine - C.fallLine(s.x, s.y).heading) < 1e-12);
  assert.ok([1, -1].includes(s.downhillSide));
 });
});
