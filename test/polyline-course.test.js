// The polyline Course (world/polyline-course.js), the run geometry behind Course.fromRun (world/run-geometry.js), and a
// ride along a course that runs north-east and then turns back west, which cx(y) could not describe (C1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCourse } from '../src/core/contracts.js';
import { SIM_DT } from '../src/core/config.js';
import {
 Course, createPolylineCourse, polylineCourseFromWorld, DIFFICULTY_WIDTH_M,
} from '../src/world/polyline-course.js';
import { arcLengths, joinWays, minTurnRadius, resample, smoothRun, toPolyline } from '../src/world/run-geometry.js';
import { createMapFrame } from '../src/world/map-frame.js';
import { Terrain } from '../src/world/terrain.js';
import { NO_TREES } from '../src/world/build.js';
import { createRider, createSession } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { createInput } from '../src/input/input.js';

const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);

// A gentle S: x = 40 sin(t / 60) with t = y going north to south in the world, one point per metre. Radius >= 90 m.
function sCurve(length = 400, x0 = 0, y0 = 0) {
 const points = [];
 for (let t = 0; t <= length; t++) points.push([x0 + 40 * Math.sin(t / 60), y0 - t]);
 return points;
}
const flat = (points) => Float64Array.from(points.flat());

// The distance from (px, py) to the polyline xy by brute force: [s, d] of its nearest point (ends extended).
function bruteProject(xy, px, py) {
 const cum = arcLengths(xy);
 const last = xy.length / 2 - 2;
 let best = null;
 for (let i = 0; i <= last; i++) {
  const dx = xy[2 * i + 2] - xy[2 * i];
  const dy = xy[2 * i + 3] - xy[2 * i + 1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const ox = px - xy[2 * i];
  const oy = py - xy[2 * i + 1];
  const along = ox * ux + oy * uy;
  const clamped = Math.max(0, Math.min(len, along));
  const dist = Math.hypot(ox - ux * clamped, oy - uy * clamped);
  if (best === null || dist < best.dist - 1e-12) {
   let s = cum[i] + clamped;
   if (i === 0) s = cum[i] + Math.min(along, len);
   if (i === last) s = cum[i] + Math.max(along, 0);
   best = { dist, s, d: oy * ux - ox * uy };
  }
 }
 return best;
}

describe('the polyline course', () => {
 const xy = flat(sCurve());
 const course = polylineCourseFromWorld(xy, { width: 30 });

 it('meets the Course contract and is frozen, with arc-length s', () => {
  assert.deepEqual(checkCourse(course), []);
  assert.ok(Object.isFrozen(course) && Object.isFrozen(course.kickers) && Object.isFrozen(course.rails));
  const cum = arcLengths(xy);
  assert.equal(course.length, cum[cum.length - 1]);
  assert.equal(course.startS, 0);
  assert.equal(course.finishS, course.length);
  const c = course.centreline();
  assert.deepEqual([...c.xy], [...xy]);
  c.xy[0] = 99; // a copy: writing to it does not move the course
  assert.equal(course.point(0, 0, {}).x, xy[0]);
 });

 it('point and project are inverses along and across the piste, on both sides', () => {
  const out = { x: 0, y: 0 };
  const back = { s: 0, d: 0, tx: 0, ty: 0 };
  for (let s = 3; s < course.length - 3; s += 7.3) {
   // across the piste the segments' normals fan out by the turn at each vertex (0.017 rad here): up to d times
   // that, so a point 25 m out can come back 0.3 m along
   for (const d of [-25, -6, 0, 2.5, 25]) {
    course.point(s, d, out);
    course.project(out.x, out.y, back);
    near(back.s, s, 0.02 * Math.abs(d) + 1e-6, 's at ' + s + ', d ' + d);
    near(back.d, d, 0.02 * Math.abs(d) + 1e-6, 'd at ' + s + ', d ' + d);
   }
  }
 });

 it('d is positive on the left of the direction of travel, and the tangent is a unit vector', () => {
  const start = course.point(50, 0, {});
  const left = course.point(50, 10, {});
  const t = course.project(start.x, start.y, {});
  near(Math.hypot(t.tx, t.ty), 1, 1e-12);
  const cross = t.tx * (left.y - start.y) - t.ty * (left.x - start.x); // > 0: the offset is counter-clockwise of it
  near(cross, 10, 1e-9);
 });

 it('project finds the nearest segment: it matches a brute-force search, near the piste and far from it', () => {
  let seed = 5;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const out = { s: 0, d: 0, tx: 0, ty: 0 };
  for (let i = 0; i < 400; i++) {
   const reach = i % 4 === 0 ? 900 : 40; // every fourth point is far outside the lookup grid
   const px = (rnd() * 2 - 1) * reach;
   const py = -rnd() * 400 + (rnd() * 2 - 1) * reach * 0.5;
   const want = bruteProject(xy, px, py);
   course.project(px, py, out);
   near(out.s, want.s, 1e-6, 's of (' + px + ', ' + py + ')');
   // across the piste, unless the nearest point is a vertex (then two segments tie and either's d is right)
   if (Math.abs(want.dist - Math.abs(want.d)) < 1e-9) near(out.d, want.d, 1e-6, 'd');
  }
 });

 it('s runs on past both ends along the end segments (project and point agree there)', () => {
  const before = course.point(-20, 4, {});
  const p = course.project(before.x, before.y, {});
  near(p.s, -20, 1e-6);
  near(p.d, 4, 1e-6);
  const after = course.point(course.length + 20, -4, {});
  const q = course.project(after.x, after.y, {});
  near(q.s, course.length + 20, 1e-6);
  near(q.d, -4, 1e-6);
 });

 it('widthAt is the width, or interpolates one width per point', () => {
  assert.equal(course.widthAt(100), 30);
  const n = xy.length / 2;
  const widths = Float64Array.from({ length: n }, (_, i) => 20 + i * 0.05); // 20 m wider every 400 m
  const wide = polylineCourseFromWorld(xy, { width: widths });
  near(wide.widthAt(0), 20, 1e-9);
  near(wide.widthAt(wide.length), widths[n - 1], 1e-9);
  const cum = wide.centreline().s;
  near(wide.widthAt((cum[100] + cum[101]) / 2), 20 + 0.05 * 100.5, 1e-9, 'halfway between two points');
  assert.ok(wide.widthAt(300) > wide.widthAt(100));
 });

 it('refuses a bad centreline, width or start and finish, naming the problem', () => {
  assert.throws(() => polylineCourseFromWorld(Float64Array.from([0, 0]), { width: 30 }), /at least two/);
  assert.throws(() => polylineCourseFromWorld(Float64Array.from([0, 0, NaN, 1]), { width: 30 }), /finite/);
  assert.throws(() => polylineCourseFromWorld(xy, { width: -3 }), /width/);
  assert.throws(() => polylineCourseFromWorld(xy, {}), /width/);
  assert.throws(() => polylineCourseFromWorld(xy, { width: 30, startS: 50, finishS: 20 }), /startS and finishS/);
  assert.throws(() => polylineCourseFromWorld(xy, { width: 30, finishS: 1e6 }), /startS and finishS/);
 });

 it('start, finish, kickers and rails are the ones given', () => {
  const c = polylineCourseFromWorld(xy, {
   width: 30, startS: 20, finishS: 300,
   kickers: [{ s: 100, d: 0, halfWidth: 9, depth: 5, big: false }],
   rails: [{ s0: 150, s1: 170, d: 4, x0: 0, y0: 0, x1: 1, y1: 1, dx: 1, dy: 0, len: 20, h: 0.7, t: 'rail' }],
  });
  assert.deepEqual([c.startS, c.finishS, c.kickers.length, c.rails.length], [20, 300, 1, 1]);
  assert.equal(c.kickerAt(102, 3).s, 100);
  assert.equal(c.kickerAt(106, 3), null);
  assert.ok(Object.isFrozen(c.kickers[0]) && Object.isFrozen(c.rails[0]));
  assert.deepEqual(checkCourse(c), []);
 });

 it('a map frame places a grid centreline in the world, rotated and moved', () => {
  const frame = createMapFrame({ originX: 500, originY: -200, rotation: 0.6 });
  const grid = flat(sCurve().map(([u, y]) => [u + 100, -y])); // grid (u, v): v down the rows
  const placed = createPolylineCourse(grid, { frame, width: 30 });
  const at = frame.toWorld(grid[200], grid[201], {});
  const p = placed.point(arcLengths(grid)[100], 0, {});
  near(p.x, frame.toWorld(grid[200], grid[201], {}).x, 1e-9);
  near(p.y, at.y, 1e-9);
  assert.deepEqual(checkCourse(placed), []);
  near(placed.length, course.length, 1e-6, 'a frame keeps lengths');
 });
});

describe('run geometry', () => {
 const heightAt = (x, y) => 1000 + 0.3 * y; // falls to the south (-y)

 it('joins ways in any order and direction into one chain, downhill', () => {
  const run = sCurve(300);
  const ways = [run.slice(200), run.slice(0, 101).reverse(), run.slice(100, 201).reverse()]; // shuffled, 2 reversed
  const chain = joinWays(ways, heightAt);
  assert.equal(chain.length, run.length);
  chain.forEach((p, i) => assert.deepEqual(p, run[i], 'point ' + i)); // top (y = 0) first, bottom (y = -300) last
 });

 it('joins ways that nearly meet (OSM nodes a metre apart) and drops a repeated end', () => {
  const run = sCurve(200);
  const gapped = run.slice(101).map(([x, y]) => [x + 0.8, y]);
  const chain = joinWays([run.slice(0, 101), gapped], heightAt);
  assert.equal(chain.length, 101 + 100); // the second way's first point is 0.8 m from the first's last: kept
  assert.ok(chain[100][1] === run[100][1] && chain[101][1] === run[101][1]);
  const exact = joinWays([run.slice(0, 101), run.slice(100)], heightAt);
  assert.equal(exact.length, run.length, 'a shared node is not repeated');
 });

 it('names a way that does not join, a missing sampler and bad points', () => {
  const run = sCurve(100);
  const far = run.map(([x, y]) => [x + 500, y]);
  assert.throws(() => joinWays([run, far], heightAt), /way 1 does not join the chain/);
  assert.throws(() => joinWays([run], undefined), /heightAt/);
  assert.throws(() => joinWays([], heightAt), /no ways/);
  assert.throws(() => joinWays([[[0, 0]]], heightAt), /way 0 needs at least two points/);
  assert.throws(() => joinWays([[[0, 0], [1, NaN]]], heightAt), /way 0 point 1/);
 });

 it('resamples at an even spacing and keeps both ends', () => {
  const xy = toPolyline(sCurve(300));
  for (const spacing of [1, 1.5, 2]) {
   const out = resample(xy, spacing);
   assert.deepEqual([out[0], out[1]], [xy[0], xy[1]]);
   assert.deepEqual([out[out.length - 2], out[out.length - 1]], [xy[xy.length - 2], xy[xy.length - 1]]);
   const cum = arcLengths(out);
   let [low, high] = [Infinity, 0];
   for (let i = 1; i < cum.length; i++) {
    low = Math.min(low, cum[i] - cum[i - 1]);
    high = Math.max(high, cum[i] - cum[i - 1]);
   }
   assert.ok(low > spacing * 0.98 && high < spacing * 1.02, `spacing ${spacing}: ${low} to ${high}`);
  }
 });

 it('measures the smallest turn radius', () => {
  const circle = [];
  for (let a = 0; a <= 1.5; a += 0.01) circle.push([50 * Math.cos(a), 50 * Math.sin(a)]);
  near(minTurnRadius(toPolyline(circle)), 50, 1e-6);
  assert.equal(minTurnRadius(toPolyline([[0, 0], [1, 0], [2, 0]])), Infinity);
 });

 it('limits the turn radius at a corner and leaves the rest of the line alone', () => {
  const leg = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i * 2));
  // 100 m south, then a sharp right-angle turn, then 100 m west
  const corner = [...leg(50, (t) => [0, -t]), ...leg(50, (t) => [-t, -100]).slice(1)];
  const raw = toPolyline(corner);
  assert.ok(minTurnRadius(raw) < 3, 'the input has a corner');
  const out = smoothRun(raw, 15, 1.5);
  assert.ok(minTurnRadius(out) >= 15, 'min radius ' + minTurnRadius(out));
  near(out[0], 0, 0, 'the start does not move');
  near(out[1], 0, 0, 'the start does not move');
  const end = [out[out.length - 2], out[out.length - 1]];
  near(end[0], -100, 1e-9);
  near(end[1], -100, 1e-9);
  // 40 m before the corner the line is where it was
  const cum = arcLengths(out);
  const i = cum.findIndex((c) => c >= 40);
  near(out[2 * i], 0, 1e-6, 'x on the straight');
 });

 it('a line that is already gentle is not changed beyond resampling', () => {
  const xy = toPolyline(sCurve(400));
  const out = smoothRun(xy, 15, 1.5);
  const reference = polylineCourseFromWorld(xy, { width: 30 });
  const p = { s: 0, d: 0, tx: 0, ty: 0 };
  for (let i = 0; i < out.length; i += 2) near(reference.project(out[i], out[i + 1], p).d, 0, 2e-3, 'off the line');
 });

 it('refuses a line it cannot smooth by naming the limit', () => {
  const zigzag = toPolyline(Array.from({ length: 40 }, (_, i) => [i % 2 ? 0.5 : 0, -i * 0.5]));
  assert.ok(minTurnRadius(smoothRun(zigzag, 15, 1.5)) >= 15, 'even a zigzag is smoothed');
 });
});

describe('Course.fromRun', () => {
 const heightAt = (x, y) => 1000 + 0.3 * y;
 const run = sCurve(500, 10, 0);
 const ways = [run.slice(300), run.slice(0, 151).reverse(), run.slice(150, 301)]; // out of order, one reversed

 it('joins, resamples, smooths and gives arc-length s from the top to the bottom of the run', () => {
  const course = Course.fromRun(ways, { heightAt, width: 28 });
  assert.deepEqual(checkCourse(course), []);
  const line = course.centreline();
  assert.deepEqual([line.xy[0], line.xy[1]], run[0], 'starts at the top');
  const last = line.xy.length - 2;
  assert.deepEqual([line.xy[last], line.xy[last + 1]], run[run.length - 1], 'ends at the bottom');
  assert.ok(minTurnRadius(line.xy) >= 15, 'min radius');
  near(course.length, arcLengths(toPolyline(run))[run.length - 1], 0.2, 'length');
  const cum = line.s;
  for (let i = 1; i < cum.length; i++) {
   const step = cum[i] - cum[i - 1];
   assert.ok(step > 1.4 && step < 1.6, 'spacing ' + step);
  }
  assert.equal(course.startS, 0);
  assert.equal(course.finishS, course.length);
  assert.equal(course.widthAt(100), 28);
  assert.equal(course.kickers.length + course.rails.length, 0);
  const bottom = course.point(course.length, 0, {});
  assert.ok(bottom.y < course.point(0, 0, {}).y, 's grows downhill (towards -y here)');
 });

 it('takes the width from the difficulty when none is given, and a terrain for the downhill order', () => {
  assert.equal(Course.fromRun(ways, { heightAt, difficulty: 'expert' }).widthAt(0), DIFFICULTY_WIDTH_M.expert);
  assert.equal(Course.fromRun(ways, { heightAt }).widthAt(0), DIFFICULTY_WIDTH_M['']);
  assert.ok(DIFFICULTY_WIDTH_M.novice > DIFFICULTY_WIDTH_M.expert);
  assert.ok(Object.isFrozen(DIFFICULTY_WIDTH_M));
  // with no sampler, the terrain's heights say which way is down: this plane falls to +y, so the run is reversed
  const side = 700;
  const slope = new Float32Array(side * side);
  for (let i = 0; i < slope.length; i++) slope[i] = 900 - 0.3 * Math.floor(i / side);
  const plane = Terrain.create({ base: Terrain.grid(slope, side, side, 1), groomed: () => 1 });
  const course = Course.fromRun([sCurve(500, 300, 650)], { terrain: plane, width: 30 }); // listed from y 650 up to 150
  assert.ok(course.point(0, 0, {}).y < course.point(course.length, 0, {}).y, 'downhill is +y here');
 });

 it('makes start and finish checkpoints from options and refuses bad options', () => {
  const c = Course.fromRun(ways, { heightAt, width: 28, startS: 30, finishS: 400 });
  assert.deepEqual([c.startS, c.finishS], [30, 400]);
  assert.throws(() => Course.fromRun(ways, { heightAt, difficulty: 'steep' }), /width/);
  assert.throws(() => Course.fromRun(ways, { heightAt, width: 28, spacingM: 0.5 }), /spacingM/);
  assert.throws(() => Course.fromRun(ways, { heightAt, width: 28, spacingM: 3 }), /spacingM/);
  assert.throws(() => Course.fromRun(ways, { heightAt, width: 28, minRadiusM: 0 }), /minRadiusM/);
  assert.throws(() => Course.fromRun(ways, { width: 28 }), /heightAt/);
  assert.throws(() => Course.fromRun([ways[0], sCurve(50, 900, 0)], { heightAt, width: 28 }), /does not join/);
 });
});

// A course that runs north-east, turns left through 105 degrees on a 40 m radius, and runs west-north-west: the heading
// goes from 45 to 150 degrees, so x rises and then falls while y keeps rising (impossible as x = cx(y)). The sim keeps
// the board 0.15 rad off straight across the slope (the frame's across axis, until F6): the last leg is not due west.
const TURN_RADIUS = 40; // m
const LEG_HEADING = Math.PI * 5 / 6; // rad, the last leg: west-north-west
function northEastThenWest() {
 const points = [];
 const START = [60, 40]; // m, world
 for (let t = 0; t <= 200; t += 2) points.push([START[0] + t * Math.SQRT1_2, START[1] + t * Math.SQRT1_2]);
 const tip = points[points.length - 1];
 const cx = tip[0] - TURN_RADIUS * Math.SQRT1_2; // the centre of the turn is TURN_RADIUS to the left of the heading
 const cy = tip[1] + TURN_RADIUS * Math.SQRT1_2;
 const sweepEnd = LEG_HEADING - Math.PI / 2; // rad, the angle about the centre where the heading is LEG_HEADING
 for (let a = -Math.PI / 4; a < sweepEnd; a += 2 / TURN_RADIUS) {
  points.push([cx + TURN_RADIUS * Math.cos(a), cy + TURN_RADIUS * Math.sin(a)]);
 }
 points.push([cx + TURN_RADIUS * Math.cos(sweepEnd), cy + TURN_RADIUS * Math.sin(sweepEnd)]);
 const end = points[points.length - 1];
 for (let t = 2; t <= 160; t += 2) {
  points.push([end[0] + t * Math.cos(LEG_HEADING), end[1] + t * Math.sin(LEG_HEADING)]);
 }
 return points;
}

describe('a course that runs north-east, then back west', () => {
 // (the course here is on a plain 400 m square, grid = world)
 const SLOPE = 0.3; // m/m fall along the piste
 const N = 400; // m, the square map
 const points = northEastThenWest();
 const course = polylineCourseFromWorld(toPolyline(points), { width: 40, finishS: 400 });
 // the ground falls along the course: height = 500 - SLOPE * s of the nearest point of the centreline
 const heights = new Float32Array(N * N);
 const where = { s: 0, d: 0, tx: 0, ty: 0 };
 for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) heights[y * N + x] = 500 - SLOPE * course.project(x, y, where).s;
 }
 const terrain = Terrain.create({ base: Terrain.grid(heights, N, N, 1), groomed: () => 1 });
 const world = { terrain, trees: NO_TREES, course };

 it('is not a function of y: its heading turns from north-east to west-north-west', () => {
  const a = course.project(...Object.values(course.point(50, 0, {})), {});
  const b = course.project(...Object.values(course.point(course.length - 50, 0, {})), {});
  near(Math.atan2(a.ty, a.tx), Math.PI / 4, 1e-6);
  near(Math.atan2(b.ty, b.tx), LEG_HEADING, 1e-6);
  const ys = [];
  for (let s = 0; s < course.length; s += 5) ys.push(course.point(s, 0, {}).y);
  assert.ok(ys.some((y, i) => i > 0 && y < ys[i - 1]) === false, 'y never falls: x goes back, y keeps rising');
  const xs = [];
  for (let s = 0; s < course.length; s += 5) xs.push(course.point(s, 0, {}).x);
  assert.ok(Math.max(...xs) > xs[0] + 100 && xs[xs.length - 1] < Math.max(...xs) - 100, 'x rises, then falls');
 });

 it('can be ridden from start to finish: the rider follows it north-east, around the turn and back west', () => {
  const rider = createRider();
  const state = { rider, session: createSession(), spray: { particles: [], rng: { seed: 1, state: 1 } },
   gradient: { gx: 0, gy: 0 }, where: { s: 0, d: 0, tx: 0, ty: 1 } };
  const start = course.point(course.startS, 0, {});
  Object.assign(rider, { x: start.x, y: start.y, heading: Math.PI / 4, vx: 5 * Math.SQRT1_2, vy: 5 * Math.SQRT1_2 });
  const input = createInput();
  const aim = { x: 0, y: 0 };
  const here = { s: 0, d: 0, tx: 0, ty: 0 };
  let maxD = 0;
  let maxX = rider.x;
  let finished = false;
  for (let n = 0; n < 120 * 90 && !finished; n++) {
   course.project(rider.x, rider.y, here);
   course.point(here.s + 12, 0, aim);
   const want = Math.atan2(aim.y - rider.y, aim.x - rider.x);
   const turn = Math.atan2(Math.sin(want - rider.heading), Math.cos(want - rider.heading)); // + is left
   input.left = turn > 0.03 ? 1 : 0;
   input.right = turn < -0.03 ? 1 : 0;
   step(state, input, world, SIM_DT);
   maxD = Math.max(maxD, Math.abs(here.d));
   maxX = Math.max(maxX, rider.x);
   finished = state.session.phase === 'done';
  }
  assert.ok(finished, 'finished at s ' + here.s + ' of ' + course.finishS);
  assert.ok(maxD < course.widthAt(0) / 2, 'stayed on the piste: ' + maxD + ' m off the centreline');
  assert.ok(maxX > start.x + 120, 'went north-east first (x reached ' + maxX + ')');
  assert.ok(rider.x < maxX - 80, 'and came back west (x ' + rider.x + ' after ' + maxX + ')');
  assert.ok(rider.y > start.y + 150, 'the whole way north (y rises)');
  assert.ok(Math.cos(rider.heading) < -0.7, 'heading west: ' + rider.heading);
 });
});
