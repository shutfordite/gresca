// @areas sim
// F5, H2: the brake yaws the skis or board across the fall line (a hockey stop) and slows the rider by sideways skid
// friction that does not grow with speed (momentum: a fast rider needs room to stop). Measured on the procedural
// map's empty stretch (s 460 to 740), from 15 m/s, through the façade at a fixed
// dt; the numbers are the same on a rotated map (npm run test:rotated runs this file at 37 and 300 degrees too).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { brakeStrength, brakeYaw, skidKept } from '../src/sim/brake.js';

const DT = 1 / 120;      // s, one sim step
const START_SPEED = 15;  // m/s
const STOPPED = 0.5;     // m/s, slower than this counts as stopped
// H2 (owner, 27 Nov: braking must respect momentum): until H2 the skid lost 2.2 /s of the speed on top of 14 m/s², a
// 4.7 g stop from 15 m/s in 7.3 m. Now it is snow friction, 13.5 m/s² across the motion against the slope's pull, and
// the swing across slows at speed: about 16 m and 1.9 s from 15 m/s on the test slope.
const MIN_STOP_M = 11;   // m, a hockey stop from 54 km/h is not instant
const MAX_STOP_M = 20;   // m, but it is a hard stop
const MAX_STOP_S = 2.4;  // s
const MOMENTUM = 2;      // from 25 m/s the stop is at least this many times as long as from 15 m/s (v² gives 2.8)
const ACROSS_TOLERANCE = 20 * Math.PI / 180;  // rad, the equipment ends this near across the fall line
const TRAVEL_TOLERANCE = 15 * Math.PI / 180;  // rad, the direction of travel moves less than this during the stop
// m/s: the travel is measured while faster than this. The stop is now 16 m long and the test slope's fall line bends
// under it, so at a crawl gravity turns the rider down the local fall line (about 19 degrees by the stop).
const TRAVEL_SPEED = 5;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// rad 0..PI/2, how far the equipment's axis is from the fall line's axis (PI/2 is straight across)
const offFallLine = (s) => Math.asin(Math.abs(Math.sin(s.boardHeading - s.fallLine)));
const idle = { left: 0, right: 0, brake: 0, jump: 0, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0 };

// Rides from START_SPEED down the fall line on the empty stretch with brake (0..1) held, for up to `seconds`. The façade's
// input is 0 or 1, so the analog brake goes in through replay(), which sets the input of each step as recorded.
// Returns {dist (m), time (s) when it first slowed below STOPPED (null if it never did), travel (rad, the most the
// direction of travel moved before that, while faster than TRAVEL_SPEED), end (the state at the end)}.
async function brakeRun(brake, { rig = 'board', seconds = 10, rotationDeg, headingOffset, speed = START_SPEED } = {}) {
 const g = await load(rotationDeg === undefined ? {} : { rotationDeg });
 g.start();
 g.set({ rig });
 g.place({ s: 500, d: 0, vy: speed });
 if (headingOffset !== undefined) {
  // the equipment points headingOffset (rad) to one side of the fall line, the rider still moving down it
  const here = g.state();
  const fall = g.world.course.fallLine(here.x, here.y).heading;
  g.place({ s: 500, d: 0, vy: speed, heading: fall + headingOffset });
 }
 const first = g.state();
 let prev = first;
 const out = { dist: 0, time: null, travel: 0 };
 const stepIn = { ...idle, brake };
 for (let i = 0; i < Math.round(seconds / DT); i++) {
  g.raw.replay([stepIn], DT);
  const s = g.state();
  if (out.time === null) {
   out.dist += Math.hypot(s.x - prev.x, s.y - prev.y);
   if (s.speed > TRAVEL_SPEED) out.travel = Math.max(out.travel, Math.abs(wrap(s.travelHeading - first.travelHeading)));
   if (s.speed < STOPPED) out.time = (i + 1) * DT;
  }
  prev = s;
 }
 out.end = prev;
 return out;
}

describe('F5 brake: a skid across the fall line', () => {
 for (const rig of ['board', 'ski']) {
  it(`${rig}: full brake from 15 m/s stops in ${MIN_STOP_M} to ${MAX_STOP_M} m, the equipment across the fall line`,
   async () => {
   const r = await brakeRun(1, { rig });
   assert.ok(r.time !== null && r.time <= MAX_STOP_S, `stopped after ${r.time} s`);
   assert.ok(r.dist >= MIN_STOP_M && r.dist <= MAX_STOP_M, `stopped after ${r.dist.toFixed(2)} m`);
   const off = Math.PI / 2 - offFallLine(r.end);
   assert.ok(off <= ACROSS_TOLERANCE, `ends ${(off * 180 / Math.PI).toFixed(1)} degrees from across the fall line`);
  });
 }

 it('momentum: from 25 m/s the stop takes more than twice the room it takes from 15 m/s', async () => {
  const slow = await brakeRun(1);
  const fast = await brakeRun(1, { speed: 25 });
  assert.ok(fast.time !== null, 'stops from 25 m/s');
  const why = `${fast.dist.toFixed(1)} m from 25 m/s, ${slow.dist.toFixed(1)} m from 15`;
  assert.ok(fast.dist > slow.dist * MOMENTUM, why);
 });

 it('the direction of travel stays put while the equipment turns', async () => {
  const r = await brakeRun(1);
  assert.ok(r.travel < TRAVEL_TOLERANCE, `travelHeading moved ${(r.travel * 180 / Math.PI).toFixed(1)} degrees`);
  assert.ok(offFallLine(r.end) > Math.PI / 4, 'boardHeading did turn');
 });

 it('half brake slows less than full brake and turns the equipment less far', async () => {
  const full = await brakeRun(1, { seconds: 0.6 });
  const half = await brakeRun(0.5, { seconds: 0.6 });
  assert.ok(half.end.speed > full.end.speed + 2, `full ${full.end.speed.toFixed(1)}, half ${half.end.speed.toFixed(1)} m/s`);
  // half brake aims for 45 degrees off the fall line; the fall line itself drifts a little under the moving rider
  const angle = offFallLine(half.end) * 180 / Math.PI;
  assert.ok(angle > 30 && angle < 80, `half brake turned the equipment ${angle.toFixed(1)} degrees off the fall line`);
  assert.ok(offFallLine(half.end) < offFallLine(full.end) - 0.2, 'less far than full brake');
 });

 it('turns toward the side the equipment already points', async () => {
  for (const side of [1, -1]) {
   const r = await brakeRun(1, { headingOffset: side * 0.3 });
   const across = wrap(r.end.boardHeading - r.end.fallLine);
   assert.ok(Math.abs(across - side * Math.PI / 2) < ACROSS_TOLERANCE, `side ${side}: ${across.toFixed(2)} rad from the fall line`);
  }
 });

 for (const rotationDeg of [37, 150]) {
  it(`works with the map rotated ${rotationDeg} degrees, to the same stop`, async () => {
   const ref = await brakeRun(1, { rotationDeg: 0 });
   const r = await brakeRun(1, { rotationDeg });
   assert.ok(Math.abs(r.dist - ref.dist) < 0.05, `${r.dist.toFixed(3)} m against ${ref.dist.toFixed(3)} m`);
   assert.ok(Math.PI / 2 - offFallLine(r.end) <= ACROSS_TOLERANCE, 'across the fall line');
   assert.ok(r.travel < TRAVEL_TOLERANCE);
  });
 }
});

describe('sim/brake.js', () => {
 it('brakeStrength is the analog input, 0..1, and 0 for NaN', () => {
  assert.equal(brakeStrength({ brake: 0.4 }), 0.4);
  assert.equal(brakeStrength({ brake: 7 }), 1);
  assert.equal(brakeStrength({ brake: -1 }), 0);
  assert.equal(brakeStrength({ brake: NaN }), 0);
 });

 it('brakeYaw turns toward across on the pointed side, by at most the yaw rate, and never back toward the fall line', () => {
  const rider = { heading: 0.2 };
  brakeYaw(rider, 1, 0, DT);
  assert.ok(rider.heading > 0.2 && rider.heading < 0.2 + 5 * DT + 1e-12, 'turns counter-clockwise, a step at a time');
  const uphill = { heading: Math.PI - 0.2 };
  brakeYaw(uphill, 1, 0, DT);
  assert.ok(uphill.heading < Math.PI - 0.2, 'pointing uphill counts like pointing downhill');
  const across = { heading: 1.2 };
  brakeYaw(across, 0.5, 0, DT);
  assert.equal(across.heading, 1.2, 'half brake leaves a board already beyond 45 degrees');
  const fast = { heading: 0.2 };
  brakeYaw(fast, 1, 0, DT, 18);
  assert.ok(Math.abs(fast.heading - 0.2 - (rider.heading - 0.2) / 2) < 1e-12, 'half as fast a swing at YAW_SPEED');
 });

 it('skidKept is 1 with no brake or no slip and 0 when the skid would stop the rider', () => {
  assert.equal(skidKept(10, 0, 0, 1, DT), 1, 'moving along the equipment: no slip');
  assert.equal(skidKept(10, 0, Math.PI / 2, 0, DT), 1, 'no brake');
  assert.ok(skidKept(10, 0, Math.PI / 2, 1, DT) < 1, 'square across the motion');
  assert.equal(skidKept(0.001, 0, Math.PI / 2, 1, DT), 0, 'a crawl is held');
  const lost = (v) => v - v * skidKept(v, 0, Math.PI / 2, 1, DT);
  assert.ok(Math.abs(lost(25) - lost(10)) < 1e-9, 'the same deceleration at any speed: momentum, not a damper');
 });
});
