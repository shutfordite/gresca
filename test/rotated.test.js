// The same seeded ride on the procedural map at two placements (docs/adr/0005-enu-frame.md), read through the façade
// in world metres (g.raw) and compared on the course: s, d, speed, heading relative to the map, score and events.
// Not bit for bit: rotating every position, velocity and gradient through cos and sin of an angle that is not a
// multiple of 90 degrees rounds in the last bits. TOL bounds what that rounding may grow to over the ride.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, MAP_ROTATION_DEG } from './harness.js';

const DT = 1 / 120;        // s per sim step
const STEPS = 120 * 25;    // steps, 25 s of riding from s 250 through the first kickers and rails
const START_S = 250;       // m along the course
const START_SPEED = 12;    // m/s straight down the map
const ROTATED_DEG = MAP_ROTATION_DEG || 37; // deg, the second placement
const TOL = 1e-9;          // m, m/s, rad: the most any compared value may differ

// Input by step number only (no feedback, so both rides get exactly the same input): carve left and right in turn,
// jump now and then, a short brake.
function inputAt(n) {
 const phase = n % 170;
 return { left: phase < 60 ? 1 : 0, right: phase >= 85 && phase < 150 ? 1 : 0, jump: n % 310 === 200 ? 1 : 0,
  brake: n % 1400 > 1300 ? 1 : 0 };
}

// One ride at rotationDeg: per step {s, d, speed, rel (rad, heading on the map's grid), score, events}.
async function ride(rotationDeg) {
 const g = await load({ rotationDeg });
 const G = g.raw;
 const F = G.world.frame;
 const v = F.vecToWorld(0, START_SPEED);
 G.seed(5);
 G.place({ s: START_S, d: 0, vx: v.x, vy: v.y });
 G.events.clear();
 const rows = [];
 for (let n = 0; n < STEPS && G.state().phase === 'run'; n++) {
  const seen = G.events.list().length;
  G.input(inputAt(n));
  G.sim(DT, DT);
  const s = G.state();
  const p = G.world.course.project(s.x, s.y);
  rows.push({
   s: p.s, d: p.d, speed: s.speed, rel: F.headingToGrid(s.heading), z: s.z, score: s.score,
   events: G.events.list().slice(seen).map((e) => e.type),
  });
 }
 return rows;
}

test(`the same ride at 0 and ${ROTATED_DEG} degrees: the same s, d, speed, heading, events, score`, async () => {
 const [a, b] = [await ride(0), await ride(ROTATED_DEG)];
 assert.ok(a.length > 1000, 'the ride lasts');
 assert.ok(a.some((r) => r.events.includes('land')) && a.some((r) => r.score > 0), 'the ride jumps and scores');
 assert.equal(b.length, a.length, 'steps');
 a.forEach((r, n) => {
  const q = b[n];
  const dRel = Math.abs(Math.atan2(Math.sin(r.rel - q.rel), Math.cos(r.rel - q.rel)));
  for (const k of ['s', 'd', 'speed', 'z']) assert.ok(Math.abs(r[k] - q[k]) <= TOL, `step ${n} ${k}: ${r[k]} ${q[k]}`);
  assert.ok(dRel <= TOL, `step ${n} heading: ${r.rel} ${q.rel}`);
  assert.equal(q.score, r.score, `step ${n} score`);
  assert.deepEqual(q.events, r.events, `step ${n} events`);
 });
});
