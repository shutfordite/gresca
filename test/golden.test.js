// The golden trace (tools/golden-trace.mjs): three fixed-seed, fixed-dt rides through the park, per step, bitwise.
// The hash was recorded on main before B2c moved the game onto the Course interface; a refactor must not change it.
// A deliberate feel change updates GOLDEN_HASH in the same PR and says so. C1 re-recorded it on top of F5 and F5-cam:
// the course became a polyline with arc-length s and perpendicular d, so the finish line moved by a fraction of a
// metre (crossed a few steps later) and the rides differ by at most 0.02 m; every ride takes the same kickers and rails.
// F6 re-recorded it: the edge and carve model replaced the turn rate and the heading clamp, so every turn of the pilot
// follows a new line (the same number of events per ride; the second ride finishes 131 steps sooner).
// F6-lean re-recorded it: the rider's lean comes from the edge now, so only the animation field of the rows changed
// (roll, comp: 304 rows; every sim field is bit for bit the same).
// The same rides with the map rotated (docs/adr/0005-enu-frame.md) must match it step for step, within ROTATED_TOL:
// not bit for bit, because turning every position, velocity and gradient through cos and sin of an angle that is not a
// multiple of 90 degrees rounds in the last bits, and those differences carry along the ride. Since F6 they grow
// faster: a carve turns at speed / radius, so a rounding difference in speed becomes one in heading, and the brake
// snaps the equipment to the fall line's rounding; the worst is about 1e-8 after 30 s at 37, 150 and 300 degrees.
// ROTATED_TOL keeps ten times that: an axis assumption left in the code differs by metres, not by 1e-7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goldenTrace } from '../tools/golden-trace.mjs';
import { MAP_ROTATION_DEG } from './harness.js';

const GOLDEN_HASH = '9a6e6c144f7266626832205c88bed22dcc86ee9b5dd7b7aee686fd8ab752d139';
const ROTATED_DEG = MAP_ROTATION_DEG || 37; // deg, the placement the rotated rides use (npm run test:rotated sets it)
const ROTATED_TOL = 1e-7; // m, m/s, rad, points, px: the most any number in the rotated trace may differ (was 1e-9)

const traces = { zero: goldenTrace({ rotationDeg: 0 }), rotated: goldenTrace({ rotationDeg: ROTATED_DEG }) };

test('the golden trace (rider, score, events, HUD, flags, rails, animation) is unchanged', async () => {
 const t = await traces.zero;
 const events = t.rides.flatMap((r) => r.rows.filter((x) => x.e).flatMap((x) => x.e));
 assert.ok(events.some((e) => e.includes('"grindStart"')), 'the trace grinds a rail');
 assert.ok(events.some((e) => e.includes('"finish"')), 'the trace reaches the finish');
 assert.ok(t.rides.some((r) => r.rows.some((x) => x.r[11])), 'the trace launches off a kicker');
 assert.equal(t.hash, GOLDEN_HASH);
});

// The worst difference between two values of the trace (numbers within a tolerance, everything else equal), or
// Infinity where they differ in kind, length or text. JSON strings in the trace (events, animation) are compared
// field by field; the minimap dot's 'Apx,Bpx' as its two numbers.
function worst(a, b) {
 if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : Math.abs(a - b);
 if (typeof a === 'string' && typeof b === 'string') {
  if (a === b) return 0;
  if (/^[[{]/.test(a)) return worst(JSON.parse(a), JSON.parse(b));
  const na = a.split(/px,?/).filter(Boolean).map(Number);
  const nb = b.split(/px,?/).filter(Boolean).map(Number);
  if (a.endsWith('px') && na.length === nb.length && na.every(Number.isFinite)) return worst(na, nb);
  return Infinity;
 }
 if (a && b && typeof a === 'object' && typeof b === 'object') {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return Infinity;
  return Math.max(0, ...ka.map((k) => (k in b ? worst(a[k], b[k]) : Infinity)));
 }
 return a === b ? 0 : Infinity;
}

test(`the same rides with the map rotated ${ROTATED_DEG} degrees match it step for step`, async () => {
 const [t0, t1] = [await traces.zero, await traces.rotated];
 t0.rides.forEach((ride, i) => {
  const rows = t1.rides[i].rows;
  assert.equal(rows.length, ride.rows.length, ride.name + ': steps');
  let max = 0;
  ride.rows.forEach((row, n) => {
   const d = worst(row, rows[n]);
   const why = `${ride.name}, step ${n}: differs by ${d}\n${JSON.stringify(row)}\n${JSON.stringify(rows[n])}`;
   assert.ok(d <= ROTATED_TOL, why);
   max = Math.max(max, d);
  });
 });
});
