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

 it('has no kickers: its jumps are snow in the features layer (K1), and its rails and boxes are the jib section', () => {
  assert.equal(c.kickers.length, 0);
  assert.equal(play.raw.world.rampHeight(c.point(900, 0).x, c.point(900, 0).y), 0);
  assert.ok(play.raw.world.rails.length >= 5);
  assert.ok(play.raw.world.rails.some((r) => r.t === 'box') && play.raw.world.rails.some((r) => r.t === 'rail'));
  assert.deepEqual([...play.raw.world.layers], ['base', 'features']);
 });
});

describe('steepness', () => {
 // The park is ridden at steady speeds on gentle pitches (docs/ROADMAP.md K1; world/play-slope.js PITCH); the finish
 // run below it is the steep part. Slope (deg) of the piste at grid row y.
 const rowSlope = (g, y) => {
  const p = g.raw.world.frame.toWorld(500, y);
  return g.raw.world.slopeDeg(p.x, p.y);
 };

 it('the park pitches are gentle, 3 to 11 degrees, and the finish run is steep: 28 to 36 degrees', () => {
  const park = [];
  for (let y = 360; y <= 2000; y += 4) park.push(rowSlope(play, y));
  park.sort((a, b) => a - b);
  // the median row is the pitch itself; the rows on a jump's takeoff and landing are steeper, so only the median is held
  assert.ok(park[park.length >> 1] >= 3 && park[park.length >> 1] <= 11, 'median ' + park[park.length >> 1].toFixed(1));
  const finish = [];
  for (let y = 2150; y <= 2230; y += 4) finish.push(rowSlope(play, y));
  finish.sort((a, b) => a - b);
  const median = finish[finish.length >> 1];
  assert.ok(median >= 28 && median <= 36, 'the finish run is ' + median.toFixed(1));
 });

 it('has no cliff on the whole run', () => {
  const sl = centreSlopes(play);
  assert.ok(sl[Math.floor(sl.length * 0.9)] <= 38, 'the 90th percentile is not a cliff');
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
});
