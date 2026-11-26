// @areas world
// The play mountain (world/play-slope.js): a steep procedural map with big kickers, beside the unchanged test slope.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const DT = 1 / 120; // s, fixed step
const STEER_GAIN = 0.03; // rad per m of offset from the centreline
const STEER_MAX = 0.25;  // rad
const RIDE_MAX_S = 200;  // s, a ride is cut off here

const test = await load();
const play = await load({ map: 'play' });

// The façade in world metres (the harness's g.world is on the map's grid): the course and the terrain.
const course = (g) => g.raw.world.course;
const slopeDeg = (g, s) => {
 const p = course(g).point(s, 0);
 return g.raw.world.slopeDeg(p.x, p.y);
};

// Slope (deg) along the centreline every 5 m of s, from the start to the finish, sorted.
function centreSlopes(g) {
 const c = course(g);
 const out = [];
 for (let s = c.startS; s < c.finishS; s += 5) out.push(slopeDeg(g, s));
 return out.sort((a, b) => a - b);
}

// Rides the course from the start, steering along the centreline with no brake, and returns the air of every
// kicker jump {s (m, take-off), airTime (s), distance (m), landSlope (deg), crashed}, the top speed (m/s), and the
// time (s) to the finish.
function ride(g) {
 const raw = g.raw;
 const c = course(g);
 raw.start();
 const jumps = [];
 let cur = null;
 let top = 0;
 let t = 0;
 for (; t < RIDE_MAX_S; t += DT) {
  const st = raw.state();
  const p = c.project(st.x, st.y);
  if (p.s >= c.finishS) break;
  const steer = -Math.max(-STEER_MAX, Math.min(STEER_MAX, p.d * STEER_GAIN)); // world d > 0 is to the right
  raw.set({ heading: Math.atan2(p.ty, p.tx) + steer });
  raw.sim(DT, DT);
  const now = raw.state();
  top = Math.max(top, now.speed);
  if (now.z > 0 && !cur) cur = { s: p.s, x: now.x, y: now.y, t0: t, fromKicker: now.fromKicker };
  if (now.z <= 0 && cur) {
   if (cur.fromKicker) {
    jumps.push({
     s: cur.s, airTime: t - cur.t0, distance: Math.hypot(now.x - cur.x, now.y - cur.y),
     landSlope: raw.world.slopeDeg(now.x, now.y), crashed: now.crashTimer > 0,
    });
   }
   cur = null;
  }
 }
 return { jumps, top, time: t };
}

const biggest = (jumps) => jumps.reduce((a, b) => (b.airTime > a.airTime ? b : a));

describe('which map is built', () => {
 it('the test slope is the default and the play mountain is asked for by name', () => {
  assert.equal(test.raw.world.map, 'test');
  assert.equal(play.raw.world.map, 'play');
 });

 it('an unknown map is refused', async () => {
  await assert.rejects(() => load({ map: 'nowhere' }), /unknown map/);
 });

 it('the play mountain has the same grid as the test slope (the same texture budget)', () => {
  const a = test.raw.world.bounds;
  const b = play.raw.world.bounds;
  assert.equal(b.width, a.width);
  assert.equal(b.length, a.length);
 });
});

describe('the play mountain course', () => {
 const c = course(play);

 it('is continuous from the start to a finish, and the piste is wide and groomed', () => {
  assert.ok(c.finishS > c.startS + 2000, 'a long run');
  let prev = c.point(c.startS, 0);
  for (let s = c.startS + 1; s <= c.finishS; s++) {
   const p = c.point(s, 0);
   const step = Math.hypot(p.x - prev.x, p.y - prev.y);
   assert.ok(step > 0.9 && step < 1.1, `a gap of ${step} m at s ${s}`);
   prev = p;
  }
  assert.ok(c.widthAt(c.startS + 500) >= 70, 'wider than the test slope (52 m)');
  const mid = c.point(c.startS + 500, 0);
  assert.equal(play.raw.world.groomed(mid.x, mid.y), 255);
 });

 it('has big and small kickers, and rails and boxes, in order down the run', () => {
  const k = c.kickers;
  assert.ok(k.length >= 8, k.length + ' kickers');
  assert.ok(k.filter((x) => x.big).length >= 4, 'at least four big kickers');
  for (let i = 1; i < k.length; i++) assert.ok(k[i].s - k[i - 1].s >= 80, 'room to land after kicker ' + (i - 1));
  assert.ok(play.raw.world.rails.length >= 5);
  assert.ok(play.raw.world.rails.some((r) => r.t === 'box') && play.raw.world.rails.some((r) => r.t === 'rail'));
 });

 it('has kicker ramps in the terrain, taller than the test slope\'s', () => {
  const k = c.kickers.find((x) => x.big);
  const lip = play.raw.world.rampHeight(k.x, k.y);
  assert.ok(lip >= 3.5, 'a big ramp is only ' + lip + ' m at the lip');
 });
});

describe('steepness', () => {
 it('the play mountain is steep: most of the run is 28 to 36 degrees, with flatter run-outs', () => {
  const sl = centreSlopes(play);
  const median = sl[sl.length >> 1];
  assert.ok(median >= 28 && median <= 35, 'median ' + median.toFixed(1));
  assert.ok(sl[Math.floor(sl.length * 0.9)] <= 38, 'the 90th percentile is not a cliff');
  assert.ok(sl[Math.floor(sl.length * 0.1)] <= 24, 'some flatter run-outs');
 });

 it('the test slope stays gentle (about 15 degrees)', () => {
  const sl = centreSlopes(test);
  assert.ok(sl[sl.length >> 1] < 18);
 });
});

describe('riding the play mountain', () => {
 const a = ride(test);
 const b = ride(play);

 it('is faster than the test slope and reaches the finish', () => {
  assert.ok(b.top > a.top * 1.3, `top speed ${b.top.toFixed(1)} against ${a.top.toFixed(1)} m/s`);
  assert.ok(b.time < RIDE_MAX_S);
 });

 it('every kicker launches the rider, and the big ones give twice the airtime of the test slope\'s biggest', () => {
  assert.equal(b.jumps.length, play.raw.world.course.kickers.length);
  const ref = biggest(a.jumps);
  const big = biggest(b.jumps);
  assert.ok(big.airTime >= 2 * ref.airTime, `${big.airTime.toFixed(2)} s against ${ref.airTime.toFixed(2)} s`);
  assert.ok(big.distance >= 2 * ref.distance, `${big.distance.toFixed(0)} m against ${ref.distance.toFixed(0)} m`);
 });

 it('lands every kicker on a downslope, without a crash', () => {
  for (const j of b.jumps) {
   assert.ok(j.landSlope >= 15, `the jump at s ${j.s.toFixed(0)} lands on ${j.landSlope.toFixed(0)} degrees`);
   assert.ok(!j.crashed, `the jump at s ${j.s.toFixed(0)} crashes`);
  }
 });
});
