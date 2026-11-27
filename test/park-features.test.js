// @areas world shared
// Park features resolved to world points (docs/adr/0012-park-features.md, world/park-features.js): on the test slope
// and on the same map rotated (npm run test:rotated sets the angle), a rail's points come out in ENU metres with an
// absolute z, at the same place on the map's grid whatever its placement. The test slope itself has no features.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, buildWorld } from '../src/world/build.js';
import { resolveFeatures, NO_FEATURES } from '../src/world/park-features.js';
import { checkParkFeatures } from '../src/core/contracts.js';
import { MAP_ROTATION_DEG } from './harness.js';
import { parkAt } from './park-fixtures.js';

const ROTATED_DEG = MAP_ROTATION_DEG || 37; // deg, the rotated placement
const TOL_M = 1e-6; // m, rounding through cos and sin of the rotation
const PARK_S = 300; // m of s: a stretch of the test slope with no kickers or rails of its own

// The test slope at rotationDeg (deg) and the fixture park resolved on it.
function parkedAt(rotationDeg) {
 const world = createWorld({ rotationRad: rotationDeg * Math.PI / 180 });
 buildWorld(world);
 const features = resolveFeatures(parkAt(PARK_S), world.course, (x, y) => world.terrain.height(x, y));
 return { world, features };
}

describe('park features in the world', () => {
 const flat = parkedAt(0);
 const turned = parkedAt(ROTATED_DEG);

 it('the test slope has no features: its kickers and rails stay as they are', () => {
  assert.equal(flat.world.course.features, NO_FEATURES);
  assert.deepEqual(checkParkFeatures(flat.features, true), []);
 });

 it('puts a rail\'s points on the course at (s, d), z the snow there plus h, on both placements', () => {
  for (const { world, features } of [flat, turned]) {
   const rail = features.rails[0];
   rail.points.forEach((p, i) => {
    const at = world.course.point(p.s, p.d, {});
    const w = rail.world[i];
    assert.ok(Math.hypot(w.x - at.x, w.y - at.y) < 1e-9);
    assert.ok(Math.abs(w.z - world.terrain.height(w.x, w.y) - p.h) < 1e-9, 'z is the snow plus h');
    assert.ok(w.z > 2000, 'z is absolute altitude (m), not height above the snow');
   });
  }
 });

 it('rotated, the points turn with the map: the same grid places and heights, other ENU coordinates', () => {
  const gridOf = (world, w) => world.frame.toGrid(w.x, w.y, { u: 0, v: 0 });
  const a = flat.features.rails[0].world;
  const b = turned.features.rails[0].world;
  let moved = 0;
  a.forEach((p, i) => {
   const ga = gridOf(flat.world, p);
   const gb = gridOf(turned.world, b[i]);
   assert.ok(Math.abs(ga.u - gb.u) < TOL_M && Math.abs(ga.v - gb.v) < TOL_M, 'the same place on the grid');
   assert.ok(Math.abs(p.z - b[i].z) < TOL_M, 'the same height');
   moved = Math.max(moved, Math.hypot(p.x - b[i].x, p.y - b[i].y));
  });
  assert.ok(moved > 1, 'the world points moved with the rotation (' + moved + ' m)');
  const dir = (w) => Math.atan2(w[3].y - w[0].y, w[3].x - w[0].x);
  const axis = (world) => {
   const e = world.frame.vecToWorld(1, 0, { x: 0, y: 0 });
   return Math.atan2(e.y, e.x);
  };
  const wrap = (r) => Math.atan2(Math.sin(r), Math.cos(r));
  const turn = wrap(dir(b) - dir(a));
  assert.ok(Math.abs(turn) > 0.1, 'the rail points another way in ENU');
  assert.ok(Math.abs(wrap(turn - (axis(turned.world) - axis(flat.world)))) < 1e-6, 'turned as the map\'s axes');
 });

 it('refuses features that do not validate, naming the field', () => {
  const bad = parkAt(PARK_S);
  bad.rails[0].profile = 'tube';
  assert.throws(() => resolveFeatures(bad, flat.world.course, () => 0), /park features: rails\[0\]\.profile/);
 });
});
