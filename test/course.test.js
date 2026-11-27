// @areas world
// The Course interface (core/contracts.js) and the procedural course (world/course.js), the fall line and downhillSide
// in RiderState, and AnimInput (sim/anim-input.js): pure modules in Node, plus the course through the façade.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
 COURSE_FIELDS, ANIM_INPUT_FIELDS, RIDER_FIELDS, checkCourse, checkAnimInput, checkRiderState,
} from '../src/core/contracts.js';
import { SIM_DT } from '../src/core/config.js';
import { FIN, bump, KICK, KBIG, RAILS, cx, createProceduralCourse, DEFAULT_COURSE } from '../src/world/course.js';
import { Terrain } from '../src/world/terrain.js';
import { DEFAULT_FRAME } from '../src/world/map-frame.js';
import { NO_TREES } from '../src/world/build.js';
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
 const world = { terrain, trees: NO_TREES, course: createProceduralCourse(terrain) };
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

describe('the procedural course (a polyline over cx(y): s is arc length, d perpendicular distance)', () => {
 const course = DEFAULT_COURSE;
 // the map's grid (x across, y down the piste) in the world, at the default placement (docs/adr/0005-enu-frame.md)
 const F = DEFAULT_FRAME;
 const world = (x, y) => F.toWorld(x, y, {});
 const grid = (x, y) => F.toGrid(x, y, {});
 const TIGHT = 1e-9; // m: the centreline vertices sit exactly on cx(y) at whole metres of y
 // m, s of the centreline where it is level with grid y (a whole number)
 const sOfY = (y) => {
  const w = world(cx(y), y);
  return course.project(w.x, w.y, {}).s;
 };
 // m, the arc length of cx between y0 and y1, by the trapezoid rule at 0.01 m
 const arc = (y0, y1) => {
  let len = 0;
  for (let y = y0; y < y1; y += 0.01) len += Math.hypot(cx(y + 0.01) - cx(y), 0.01);
  return len;
 };
 it('project and point are exact inverses, and s is arc length and d perpendicular', () => {
  const w = world(cx(700), 700);
  const s700 = sOfY(700);
  assert.ok(Math.abs(s700 - course.startS - arc(60, 700)) < 0.05, 's is arc length from the start');
  const left = course.point(s700, 5, {});
  const p = course.project(left.x, left.y, {});
  // (off the centreline the nearest segment can be a neighbour's: well under a millimetre on a smooth piste)
  assert.ok(Math.abs(p.s - s700) < 1e-3 && Math.abs(p.d - 5) < 1e-3, JSON.stringify(p));
  const centre = course.point(s700, 0, {});
  assert.ok(Math.abs(centre.x - w.x) < TIGHT && Math.abs(centre.y - w.y) < TIGHT);
  const t = F.vecToGrid(p.tx, p.ty, {}); // the tangent on the grid
  assert.ok(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-12 && t.v > 0, 'unit tangent, down the piste');
  // positive d is the rider's left facing down the piste: +x on the procedural map
  assert.ok(grid(left.x, left.y).u > cx(700) - 1, 'left is across, towards +x');
  const q = course.point(s700 + 1, 0, {});
  assert.ok(Math.abs(Math.hypot(q.x - centre.x, q.y - centre.y) - 1) < 1e-3, 'one metre of s is one metre of piste');
 });

 it('the start and the finish are where they were (60 and FIN on the grid)', () => {
  assert.equal(course.startS, 60);
  const a = grid(...Object.values(course.point(course.startS, 0, {})));
  assert.ok(Math.abs(a.u - cx(60)) < TIGHT && Math.abs(a.v - 60) < TIGHT);
  const b = grid(...Object.values(course.point(course.finishS, 0, {})));
  assert.ok(Math.abs(b.u - cx(FIN)) < TIGHT && Math.abs(b.v - FIN) < TIGHT);
  assert.ok(course.length > course.finishS && course.widthAt(700) > 0);
 });

 it('kickers and rails are the park, in s and d', () => {
  assert.deepEqual(course.kickers.map((k) => k.s), KICK.map(sOfY));
  assert.deepEqual(course.kickers.filter((k) => k.big).map((k) => grid(k.x, k.y).v), [...KBIG]);
  assert.deepEqual(course.kickers.map((k) => grid(k.x, k.y).v), [...KICK]);
  assert.equal(course.rails.length, RAILS.length);
  course.rails.forEach((r, i) => {
   const R = RAILS[i]; // the rail as authored on the grid
   assert.deepEqual([grid(r.x0, r.y0), grid(r.x1, r.y1)], [{ u: R.x0, v: R.y0 }, { u: R.x1, v: R.y1 }]);
   assert.deepEqual(F.vecToGrid(r.dx, r.dy, {}), { u: R.dx, v: R.dy });
   assert.ok(r.s0 < r.s1 && Math.abs(r.s0 - sOfY(R.y0)) < 7 && Math.abs(r.s1 - sOfY(R.y1)) < 7, 'along the rail');
   // 9 m off the centreline across the grid is 6 to 9 m across the piste (it leans up to 45 degrees), same side
   assert.equal(Math.sign(r.d), R.x0 - cx(R.y0) > 0 ? 1 : -1);
   assert.ok(Math.abs(r.d) > 6 && Math.abs(r.d) <= 9, 'd ' + r.d);
  });
  assert.ok(Object.isFrozen(course.rails) && Object.isFrozen(course.rails[0]));
 });

 it('kickerAt: the launch zone is the ramp\'s footprint, within 9 m across and 5 m past the lip, on the grid', () => {
  const k = course.kickers[3];
  const lip = KICK[3];
  // (across m, down m on the grid) -> the course coordinates of that point
  const at = (across, y) => {
   const w = world(cx(y) + across, y);
   return course.project(w.x, w.y, {});
  };
  assert.equal(course.kickerAt(k.s, 0), k);
  for (const side of [1, -1]) {
   const edge = at(8.9 * side, lip + 4);
   assert.equal(course.kickerAt(edge.s, edge.d), k, 'inside the width');
   const out = at(9.1 * side, lip + 4);
   assert.equal(course.kickerAt(out.s, out.d), null, 'outside the width');
  }
  const past = at(0, lip + 5);
  assert.equal(course.kickerAt(past.s, past.d), null, 'past the depth');
  const before = at(0, lip - 0.01);
  assert.equal(course.kickerAt(before.s, before.d), null, 'before the lip');
  assert.equal(course.kickerAt(sOfY(600), 0), null, 'no kicker in the practice stretch');
 });

 it('a kicker launches over its ramp: kickerAt agrees with the ramp across its width, on turned stretches too', () => {
  const SPAN = 12; // m either side of the centreline: past the ramp's own edge
  for (const k of course.kickers) {
   for (const along of [0.5, 2.5, 4.5]) { // m past the lip, along s
    for (let d = -SPAN; d <= SPAN; d += 0.25) {
     const w = course.point(k.s + along, d, {});
     const g = grid(w.x, w.y);
     const ramp = bump(g.u, g.v);
     const launches = course.kickerAt(k.s + along, d) === k;
     // launching needs a ramp under the rider; a ramp at full height under the rider (within 7 m of the centreline
     // across the grid, before its drop) launches
     if (launches) assert.ok(g.v > k.lipY - 1e-6 && g.v < k.lipY + k.depth, `launches off the ramp's rows: y ${g.v}`);
     if (launches && g.v < k.lipY + 4) assert.ok(ramp > 0, `no ramp at s ${k.s}, along ${along}, d ${d}: launches on bare snow`);
     const onFullRamp = Math.abs(g.u - cx(g.v)) < 7 && g.v >= k.lipY && g.v < k.lipY + 4;
     if (onFullRamp) assert.ok(launches, `ramp at s ${k.s}, along ${along}, d ${d}: no launch`);
    }
   }
  }
 });

 it('the practice stretch (grid y 460 to 740) has no kicker zone and no rail', () => {
  const [from, to] = [sOfY(460), sOfY(740)];
  for (const k of course.kickers) assert.ok(k.s + k.depth < from || k.s > to, 'kicker at s ' + k.s);
  for (const r of course.rails) assert.ok(r.s1 < from || r.s0 > to, 'rail at s ' + r.s0);
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
  // on the grid: (cx(KICK[3] - 5), KICK[3] - 5), 10 m/s straight down the piste; in the world, through the frame
  const F = DEFAULT_FRAME;
  const p = F.toWorld(cx(KICK[3] - 5), KICK[3] - 5, {});
  const v = F.vecToWorld(0, 10, {});
  Object.assign(rider, { x: p.x, y: p.y, vx: v.x, vy: v.y, heading: F.downhill, landingSpeed: 3 });
  const session = createSession();
  assert.equal(animInput(rider, session, DEFAULT_COURSE, out), out);
  assert.deepEqual(checkAnimInput(out), []);
  assert.deepEqual([out.speed, out.travelDir, out.riderSide, out.impact, out.approach], [10, F.downhill, 1, 3, true]);
  Object.assign(rider, { edge: 0.4, skid: 1.5, flipRot: -2 });
  animInput(rider, session, DEFAULT_COURSE, out);
  assert.deepEqual([out.edge, out.skid, out.flipRot], [0.4, 1.5, -2]); // passed through as the sim has them
  session.stance = 'goofy';
  animInput(rider, session, DEFAULT_COURSE, out);
  assert.deepEqual([out.facing, out.riderSide], [F.downhill - Math.PI, -1]);
  const off = F.vecToWorld(10, 0, {}); // off the kicker's line: 10 m across
  rider.x += off.x;
  rider.y += off.y;
  assert.equal(animInput(rider, session, DEFAULT_COURSE, out).approach, false);
  assert.deepEqual(checkAnimInput({ ...out, speed: NaN, wiped: 0 }), ['speed is not a finite number',
   'wiped is not a boolean']);
 });
});

describe('the course through the façade (Gresca.world.course)', async () => {
 const g = await load();
 it('reports the course the game rides, in copies, and it agrees with the procedural map', () => {
  // in world metres, through the map frame (the façade itself, g.raw): exact at any placement
  const R = g.raw.world, C = R.course, F = R.frame;
  const fin = C.point(C.finishS, 0);
  assert.ok(Math.abs(fin.x - F.toWorld(cx(FIN), FIN).x) < 1e-9 && Math.abs(fin.y - F.toWorld(cx(FIN), FIN).y) < 1e-9);
  const w700 = F.toWorld(cx(700), 700);
  const at700 = C.point(C.project(w700.x, w700.y).s, 0);
  assert.ok(Math.abs(at700.x - w700.x) < 1e-9 && Math.abs(at700.y - w700.y) < 1e-9, 'the centreline at grid y 700');
  const o = C.project(F.originX, F.originY); // grid (0, 0): level with the top, 400 m or so to the left of the piste
  assert.ok(o.d < -300 && o.d > -600 && o.s < C.startS, JSON.stringify(o));
  const lips = C.kickers.map((k) => F.toGrid(k.x, k.y).v);
  lips.forEach((v, i) => assert.ok(Math.abs(v - KICK[i]) < 1e-9, 'lip ' + i + ' at grid y ' + v)); // rotated: rounding
  assert.equal(C.kickerAt(C.kickers[0].s + 1, 0).s, C.kickers[0].s);
  assert.ok(Object.isFrozen(C));
  g.place({ y: 700, vy: 10, heading: 0.3 });
  g.sim(SIM_DT);
  // in world metres (g.raw): through the map view the position rounds by about 1e-13 m, and where the piste is nearly
  // level across (here after H2's step) the fall line turns by about 10 rad per m, past 1e-12 at 300 degrees
  const s = g.raw.state();
  assert.ok(Math.abs(s.fallLine - g.raw.world.course.fallLine(s.x, s.y).heading) < 1e-12);
  assert.ok([1, -1].includes(s.downhillSide));
 });
});
