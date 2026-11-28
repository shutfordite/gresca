// @areas sim world
// The golden trace (tools/golden-trace.mjs): three fixed-seed, fixed-dt rides through the park, per step, bitwise.
// The hash was recorded on main before B2c moved the game onto the Course interface; a refactor must not change it.
// A deliberate feel change updates the hash in the same PR and says so. C1 re-recorded it on top of F5 and F5-cam:
// the course became a polyline with arc-length s and perpendicular d, so the finish line moved by a fraction of a
// metre (crossed a few steps later) and the rides differ by at most 0.02 m; every ride takes the same kickers and rails.
// F6 re-recorded it: the edge and carve model replaced the turn rate and the heading clamp, so every turn of the pilot
// follows a new line (the same number of events per ride; the second ride finishes 131 steps sooner).
// F6-lean re-recorded it: the rider's lean comes from the edge now, so only the animation field of the rows changed
// (roll, comp: 304 rows; every sim field is bit for bit the same).
// X1 split the one hash in two, from the same rides (the whole trace still hashed to 9a6e6c14…): GOLDEN_SIM_HASH covers
// the ride, its events and the HUD; GOLDEN_ANIM_HASH the rider yaw, pose and draw counts on drawn frames. A feel change
// re-records the sim hash (and usually the anim one); an animation change re-records only the anim hash.
// H2 re-recorded both: the snow contact (the edge builds over half a second, the turn rate has inertia, gravity across
// the equipment is held, not banked as speed, powder off the piste) gives every ride a new line. The pilot now aims
// 8 m ahead (was 15 m): with the slower edge its bang-bang steering swung wide off the piste and stalled in a gully.
// Every ride still jumps, grinds (5 rails) and the park ride finishes; the rotated rides differ by at most 2.4e-8.
// K2 re-recorded both: the flight is in world height and lands where it meets the snow, the impact normal to it, and
// kickers throw by their shape (no launch gain). Every ride's first ollie (step 150) flies up to 1.4 m differently over
// the uneven snow; the landing turns the fall into speed along the slope, so the lines part from step 246-253 and are a
// metre apart by step 330. The park ride from 1960 finishes 928 steps sooner; the ride from the top grinds a rail and
// crashes once (a 32 m/s landing off the piste); the ride from 740 grinds once, then sticks in the trees at y 908 (20
// tree crashes). The rotated rides match to 2e-9 (riding over a roll keeps the motion, so the bumps add no chaos).
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

const GOLDEN_SIM_HASH = '64d129db5817d9c2304494a53c803039143dba87087fe9f1a83cdeddc19f8aa2';
const GOLDEN_ANIM_HASH = '1f34631a131e43cae8ba0e0c3b1dad5ae32d1e79ef2f44111ae317614340da74';
const ROW_FIELDS = ['r', 'e', 'hud', 'dot', 'drawn', 'yaw', 'anim']; // what a row holds: each in one of the two hashes
const ROTATED_DEG = MAP_ROTATION_DEG || 37; // deg, the placement the rotated rides use (npm run test:rotated sets it)
const ROTATED_TOL = 1e-7; // m, m/s, rad, points, px: the most any number in the rotated trace may differ (was 1e-9)

const traces = { zero: goldenTrace({ rotationDeg: 0 }), rotated: goldenTrace({ rotationDeg: ROTATED_DEG }) };

test('the golden trace\'s sim fields (rider, score, events, HUD) are unchanged', async () => {
 const t = await traces.zero;
 const events = t.rides.flatMap((r) => r.rows.filter((x) => x.e).flatMap((x) => x.e));
 assert.ok(events.some((e) => e.includes('"grindStart"')), 'the trace grinds a rail');
 assert.ok(events.some((e) => e.includes('"finish"')), 'the trace reaches the finish');
 assert.ok(t.rides.some((r) => r.rows.some((x) => x.r[11])), 'the trace launches off a kicker');
 assert.equal(t.simHash, GOLDEN_SIM_HASH);
});

test('the golden trace\'s anim fields (rider yaw, pose, draw counts) are unchanged', async () => {
 const t = await traces.zero;
 assert.ok(t.rides.every((r) => r.rows.some((x) => x.anim)), 'every ride draws the rider');
 assert.equal(t.animHash, GOLDEN_ANIM_HASH);
});

test('every field of the trace is in one of the two hashes', async () => {
 const t = await traces.zero;
 for (const r of t.rides) for (const x of r.rows) for (const k of Object.keys(x)) assert.ok(ROW_FIELDS.includes(k), k);
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
