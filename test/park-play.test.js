// @areas world
// The play mountain's park (world/park/play-park.js, K1): its layout, that its jumps are snow in the terrain's features
// layer measured from the base snow, that rails and jumps share that surface, and that a rider arrives at each lip at
// the speed the jump was sized for. The test slope has no park and is unchanged.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, buildWorld } from '../src/world/build.js';
import { Terrain } from '../src/world/terrain.js';
import { NO_FEATURES } from '../src/world/park-features.js';
import { touchdownOf } from '../src/world/park/jump-design.js';
import { checkParkFeatures } from '../src/core/contracts.js';
import { MAP_ROTATION_DEG, load } from './harness.js';

const ROTATION_RAD = MAP_ROTATION_DEG * Math.PI / 180;
const GRID_W = 1000; // cells, the play mountain's grid (the same as the test slope's)
const GRID_H = 2450;
const FOOTPRINT_MARGIN_M = 12; // m: a point this far outside a jump's box (s from the drop-in to the foot) is "outside"
const DROP_IN_M = 60;          // m before the lip a mega ramp's drop-in starts, at most
const SPEED_TOL = 1.5;         // m/s: how far the speed at a lip may be from the speed the jump was sized for
const SIDE_LANE_M = 20;        // m: a lane of the jib section is this far from the centre line

const world = createWorld({ rotationRad: ROTATION_RAD, map: 'play' });
buildWorld(world);
const features = world.course.features;
const base = Terrain.grid(world.H, GRID_W, GRID_H, 1, world.frame); // the terrain without its features layer
const at = (s, d) => world.course.point(s, d, { x: 0, y: 0 });

describe('the play mountain\'s park layout', () => {
 const bySize = (size) => features.jumps.filter((j) => j.size === size);

 it('has S, M and L lines of 3 or 4 tables each and one mega ramp, from the top of the mountain down', () => {
  assert.equal(bySize('s').length, 4, 'the S line');
  assert.equal(bySize('m').length, 3, 'the M line');
  assert.equal(bySize('l').length, 3, 'the L line');
  assert.equal(bySize('xl').length, 1, 'the mega ramp');
  assert.ok(features.jumps.every((j) => j.d === 0));
  const order = features.jumps.map((j) => j.s);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in order down the run');
  assert.equal(bySize('xl')[0].table.gap, true, 'a gap');
 });

 it('has steady speeds along each line, and faster ones further down', () => {
  const speeds = (size) => bySize(size).map((j) => j.designSpeed);
  for (const size of ['s', 'm', 'l']) {
   const v = speeds(size);
   assert.ok(Math.max(...v) - Math.min(...v) <= 3, size + ' line speeds ' + v.join(', '));
  }
  assert.ok(Math.max(...speeds('s')) < Math.min(...speeds('m')) + 1.5);
  assert.ok(Math.max(...speeds('m')) < Math.min(...speeds('l')) + 1.5);
  assert.ok(Math.min(...speeds('xl')) > Math.max(...speeds('l')));
 });

 it('has a jib section of 6 to 10 rails and boxes close together, rails and boxes of several shapes', () => {
  const { rails } = features;
  assert.ok(rails.length >= 6 && rails.length <= 10, rails.length + ' rails and boxes');
  assert.ok(rails.some((r) => r.profile === 'box') && rails.some((r) => r.profile === 'rail'));
  const first = Math.min(...rails.map((r) => r.points[0].s));
  const last = Math.max(...rails.map((r) => r.points[r.points.length - 1].s));
  assert.ok(last - first <= 150, 'close together: ' + (last - first).toFixed(0) + ' m from first to last');
  assert.ok(first > features.jumps.at(-1).s === false, 'before the jump lines');
  const lanes = new Set(rails.map((r) => Math.round(r.points[0].d / SIDE_LANE_M)));
  assert.ok(lanes.size >= 3, 'across the piste');
  assert.ok(rails.some((r) => r.points.length > 10), 'a bent or arched one');
 });

 it('is valid, resolved to world points, and the test slope has no park at all', () => {
  assert.deepEqual(checkParkFeatures(features, true), []);
  const test = createWorld({ rotationRad: ROTATION_RAD });
  buildWorld(test);
  assert.equal(test.course.features, NO_FEATURES);
  assert.deepEqual([...test.terrain.layers], ['base'], 'only the base layer');
  assert.deepEqual([...world.terrain.layers], ['base', 'features']);
 });

 it('every jump catches a rider at its design speed between its knuckle and its bottom', () => {
  for (const j of features.jumps) {
   const run = Math.hypot(j.world[3].x - j.world[0].x, j.world[3].y - j.world[0].y);
   const slope = (j.world[0].z - j.world[3].z) / run;
   const x = touchdownOf(j, slope, j.designSpeed);
   assert.ok(x >= j.table.length && x <= j.table.length + j.landing.length,
    j.size + ' at s ' + j.s.toFixed(0) + ' lands at ' + x.toFixed(1) + ' m of ' + j.table.length.toFixed(1) +
    ' to ' + (j.table.length + j.landing.length).toFixed(1));
  }
 });
});

describe('the jumps are snow, measured from the base snow', () => {
 const m = features.jumps.find((j) => j.size === 'm');
 const heightAbove = (s, d) => {
  const p = at(s, d);
  return world.terrain.height(p.x, p.y) - base.height(p.x, p.y);
 };

 it('the lip, the knuckle and the bottom are at the heights the feature says, above the base snow', () => {
  assert.ok(Math.abs(heightAbove(m.s, 0) - m.takeoff.height) < 0.02, 'the lip');
  assert.ok(Math.abs(heightAbove(m.s + m.table.length, 0) - m.landing.height) < 0.02, 'the knuckle');
  assert.ok(heightAbove(m.s + m.table.length + m.landing.length, 0) < 0.02, 'the bottom');
  assert.ok(heightAbove(m.s - m.takeoff.length - 3, 0) < 1e-9, 'before the takeoff');
 });

 it('leaves the base snow unchanged outside every jump\'s footprint', () => {
  let outside = 0;
  const p = { s: 0, d: 0 };
  for (let y = 0; y < GRID_H; y += 5) {
   for (let u = 380; u <= 620; u += 5) {
    const w = world.frame.toWorld(u, y, { x: 0, y: 0 });
    world.course.project(w.x, w.y, p);
    const near = features.jumps.some((j) => p.s > j.s - j.takeoff.length - DROP_IN_M - FOOTPRINT_MARGIN_M &&
     p.s < j.s + j.table.length + j.landing.length + FOOTPRINT_MARGIN_M &&
     Math.abs(p.d - j.d) < j.takeoff.width * 0.65 + FOOTPRINT_MARGIN_M);
    if (near) continue;
    outside++;
    assert.equal(world.terrain.height(w.x, w.y), base.height(w.x, w.y), 'at s ' + p.s.toFixed(0) + ', d ' + p.d.toFixed(0));
   }
  }
  assert.ok(outside > 5000, outside + ' points checked');
 });

 it('is the same surface rails and jumps are measured on: world points are the base snow plus h', () => {
  for (const r of features.rails) {
   r.points.forEach((pt, i) => {
    const w = r.world[i];
    assert.ok(Math.abs(w.z - base.height(w.x, w.y) - pt.h) < 1e-9, 'a rail point is base + h');
   });
  }
  for (const j of features.jumps) {
   const [, lip, knuckle] = j.world;
   assert.ok(Math.abs(lip.z - world.terrain.height(lip.x, lip.y)) < 0.02, 'the stamped snow reaches the lip point');
   assert.ok(Math.abs(knuckle.z - world.terrain.height(knuckle.x, knuckle.y)) < 0.02 || j.table.gap,
    'the stamped snow reaches the knuckle point');
  }
 });

 it('has a gradient that is the derivative of the height on a jump, so the sim\'s normal is the stamped surface', () => {
  const e = 1e-4;
  const p = at(m.s + 5, 1.3);
  const g = world.terrain.gradient(p.x, p.y, { gx: 0, gy: 0 });
  const gx = (world.terrain.height(p.x + e, p.y) - world.terrain.height(p.x - e, p.y)) / (2 * e);
  const gy = (world.terrain.height(p.x, p.y + e) - world.terrain.height(p.x, p.y - e)) / (2 * e);
  assert.ok(Math.abs(g.gx - gx) < 1e-3 && Math.abs(g.gy - gy) < 1e-3, g.gx + ' ' + g.gy + ' against ' + gx + ' ' + gy);
 });
});

describe('riding the park', () => {
 // A fixed-step ride down the centre line with no brake, as test/play-slope.test.js, to the mega ramp's lip. Over 1 s:
 // the speed at the last lip is only there after about 110 s of riding (13,000 steps) and a game load, and no module
 // call gives the rider's speed.
 it('arrives at every lip at the speed that jump was sized for', async () => {
  const g = await load({ map: 'play' });
  const raw = g.raw;
  const course = raw.world.course;
  const lips = features.jumps.map((j) => ({ j, speed: null }));
  raw.start();
  const dt = 1 / 120;
  for (let t = 0; t < 200 && lips.some((l) => l.speed === null); t += dt) {
   const st = raw.state();
   const p = course.project(st.x, st.y);
   raw.set({ heading: Math.atan2(p.ty, p.tx) - Math.max(-0.25, Math.min(0.25, p.d * 0.03)) });
   raw.sim(dt, dt);
   for (const l of lips) if (l.speed === null && p.s >= l.j.s) l.speed = raw.state().speed;
  }
  for (const { j, speed } of lips) {
   assert.ok(Math.abs(speed - j.designSpeed) <= SPEED_TOL,
    j.size + ' at s ' + j.s.toFixed(0) + ': arrives at ' + speed.toFixed(1) + ' m/s, sized for ' + j.designSpeed);
  }
 });
});
