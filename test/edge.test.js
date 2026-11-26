// @areas sim
// F6: steering sets an edge angle, the sidecut sets the carve radius (R = sidecut / sin(edge)), a turn that asks more
// than the edge's grip skids, and there is no heading clamp: a held turn goes through the fall line and uphill to a
// stop. Measured on the procedural map's empty stretch (s 460 to 760) through the façade at a fixed dt; radii, speeds
// and angles from the fall line are the same on a rotated map (npm run test:rotated runs this file at 37 and 300 too).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { RIGS } from '../src/core/config.js';
import { EDGE } from '../src/sim/tuning.js';
import { steerOf, followEdge, carveRadius, yawRate, slipLeft } from '../src/sim/edge.js';

const DT = 1 / 120;          // s, one sim step
const START_S = 480;         // m along the course: the empty stretch
const SETTLE_S = 0.4;        // s, the edge has reached its target by then (0.55 rad at 5 rad/s takes 0.11 s)
const RADIUS_TOLERANCE = 0.15; // fraction, the measured carve radius is this near the sidecut formula
const idle = { left: 0, right: 0, brake: 0, jump: 0, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0 };

const g = await load();
const unwrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// rad 0..PI, how far the direction of travel is from straight down the fall line (PI/2 across, PI straight uphill)
const offFall = (s) => Math.abs(unwrap(s.travelHeading - s.fallLine));

// Rides from `speed` (m/s) down the fall line at START_S with steer (-1..1) held for `seconds`, calling each(state, t)
// after every step. The façade's input is 0 or 1, so the analog steer goes in through replay().
function hold(rig, speed, steer, seconds, each) {
 g.start();
 g.set({ rig });
 g.place({ s: START_S, d: 0, vy: speed });
 const here = g.state();
 const fall = g.world.course.fallLine(here.x, here.y).heading;
 g.place({ s: START_S, d: 0, vx: Math.cos(fall) * speed, vy: Math.sin(fall) * speed, heading: fall });
 const stepIn = { ...idle, steer };
 for (let i = 1; i <= Math.round(seconds / DT); i++) {
  g.raw.replay([stepIn], DT);
  if (each(g.state(), i * DT) === false) return;
 }
}

// The path's radius (m) from SETTLE_S to SETTLE_S + 0.6 s of a held turn: distance travelled / heading turned. Also
// the most skid (m/s) and the edge (rad) at the end.
function carve(rig, speed, steer) {
 let prev = null;
 let dist = 0;
 let turned = 0;
 let skid = 0;
 let edge = 0;
 hold(rig, speed, steer, SETTLE_S + 0.6, (s, t) => {
  if (t > SETTLE_S && prev) {
   dist += Math.hypot(s.x - prev.x, s.y - prev.y);
   turned += unwrap(s.travelHeading - prev.travelHeading);
   skid = Math.max(skid, s.skid);
   edge = s.edge;
  }
  prev = s;
 });
 return { radius: dist / Math.abs(turned), skid, edge };
}

// Holds steer from `speed` until the direction of travel is `angle` (rad) from the fall line; the speed then (m/s)
// and the most skid on the way (m/s).
function turnTo(speed, steer, angle) {
 const out = { speed: NaN, skid: 0 };
 hold('board', speed, steer, 4, (s) => {
  out.skid = Math.max(out.skid, s.skid);
  if (offFall(s) < angle) return true;
  out.speed = s.speed;
  return false;
 });
 return out;
}

describe('F6 edge and carve', () => {
 for (const rig of ['board', 'ski']) {
  it(`${rig}: a held half turn carves the sidecut radius, sidecut / sin(edge), without skidding`, () => {
   const r = carve(rig, 9, 0.5);
   const want = carveRadius(RIGS[rig], r.edge);
   assert.ok(Math.abs(r.edge) > 0.5 && Math.abs(r.edge) < 0.6, `edge ${r.edge.toFixed(3)} rad`);
   const off = Math.abs(r.radius - want) / want;
   const why = `radius ${r.radius.toFixed(2)} m against ${want.toFixed(2)} m from the sidecut`;
   assert.ok(off < RADIUS_TOLERANCE, why);
   assert.ok(r.skid < 0.05, `skid ${r.skid.toFixed(3)} m/s in a carve`);
  });
 }

 it('skis and board carve different radii at the same edge (RIGS sidecut)', () => {
  const board = carve('board', 9, 0.5).radius;
  const ski = carve('ski', 9, 0.5).radius;
  assert.ok(ski > board * 1.1, `ski ${ski.toFixed(2)} m, board ${board.toFixed(2)} m`);
 });

 it('a hard turn at speed skids and loses more speed than a carve turning as far (to across the slope)', () => {
  const hard = turnTo(20, 1, Math.PI / 2);
  const gentle = turnTo(20, 0.25, Math.PI / 2);
  assert.ok(hard.skid > 2, `hard turn skid ${hard.skid.toFixed(2)} m/s`);
  assert.ok(gentle.skid < 0.5, `carve skid ${gentle.skid.toFixed(2)} m/s`);
  const why = `hard ${hard.speed.toFixed(1)} m/s, carve ${gentle.speed.toFixed(1)} m/s`;
  assert.ok(hard.speed < gentle.speed - 3, why);
 });

 it('a held turn goes through the fall line and uphill to a near stop (no heading clamp)', () => {
  for (const steer of [0.5, -0.5]) {
   let most = 0;
   let slowest = Infinity;
   hold('board', 10, steer, 5, (s) => {
    most = Math.max(most, offFall(s));
    if (offFall(s) > Math.PI / 2) slowest = Math.min(slowest, s.speed);
    if (s.speed < 1) return false;
   });
   assert.ok(most > Math.PI * 0.6, `steer ${steer}: travel turned only ${(most * 180 / Math.PI).toFixed(0)} deg`);
   assert.ok(slowest < 1, `steer ${steer}: slowest uphill ${slowest.toFixed(2)} m/s`);
  }
 });

 it('right turns clockwise and left counter-clockwise; the edge is + for a left turn', () => {
  hold('board', 10, 1, 0.3, () => {});
  const right = g.raw.state();
  assert.ok(right.edge < -0.5, `edge ${right.edge}`);
  hold('board', 10, -1, 0.3, () => {});
  const left = g.raw.state();
  assert.ok(left.edge > 0.5, `edge ${left.edge}`);
  // world headings (counter-clockwise from east) through the raw façade
  assert.ok(unwrap(left.heading - right.heading) > 0.5, 'left ends counter-clockwise of right');
 });
});

describe('sim/edge.js', () => {
 it('steerOf takes input.steer when set, else right minus left, clamped, NaN as none', () => {
  assert.equal(steerOf({ steer: 0.3, left: 1, right: 0 }), 0.3);
  assert.equal(steerOf({ steer: 0, left: 1, right: 0 }), -1);
  assert.equal(steerOf({ steer: NaN, left: 0, right: 1 }), 1);
  assert.equal(steerOf({ steer: -4 }), -1);
 });

 it('followEdge moves the edge toward -steer * MAX_EDGE at the rig edge rate', () => {
  const rider = { edge: 0 };
  followEdge(rider, 1, RIGS.board, DT);
  assert.equal(rider.edge, -RIGS.board.edgeRate * DT);
  for (let i = 0; i < 200; i++) followEdge(rider, 1, RIGS.board, DT);
  assert.equal(rider.edge, -EDGE.MAX_EDGE);
 });

 it('carveRadius is sidecut / sin(edge), and a flat base does not turn', () => {
  assert.equal(carveRadius(RIGS.board, Math.PI / 2), RIGS.board.sidecut);
  assert.ok(Math.abs(carveRadius(RIGS.ski, -0.5) - RIGS.ski.sidecut / Math.sin(0.5)) < 1e-12);
  assert.equal(carveRadius(RIGS.board, 0), Infinity);
  assert.equal(yawRate({ heading: 0, vx: 10, vy: 0, edge: 0 }, 0, RIGS.board), 0);
 });

 it('yawRate is the carve speed / R, counter-clockwise for a positive edge, nose or tail first', () => {
  const rate = 10 * Math.sin(0.5) / RIGS.board.sidecut;
  assert.ok(Math.abs(yawRate({ heading: 0, vx: 10, vy: 0, edge: 0.5 }, -0.1, RIGS.board) - rate) < 1e-12);
  assert.ok(Math.abs(yawRate({ heading: Math.PI, vx: 10, vy: 0, edge: 0.5 }, -0.1, RIGS.board) - rate) < 1e-12);
  assert.ok(yawRate({ heading: 0, vx: 0, vy: 0, edge: 0 }, 1, RIGS.board) < 0, 'pivots right when standing still');
 });

 it('slipLeft is 0 within the hold and all of the slip beyond it (a washout)', () => {
  assert.equal(slipLeft(0.1, 0.2), 0);
  assert.equal(slipLeft(-0.1, 0.2), 0);
  assert.equal(slipLeft(1, 0.2), 1);
  assert.equal(slipLeft(-1, 0.2), -1);
 });
});
