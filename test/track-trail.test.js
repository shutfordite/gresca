// The equipment's track trail (view/track-trail.js): what the snow shows of the board or skis, sample by sample.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
 createTrail, clearTrail, recordTrail, swathHalfWidth, EQUIPMENT, TRAIL_CAPACITY, SAMPLE_FLOATS, SPACING_M,
 MAX_HALF_WIDTH_M, DEPTH_CARVE, DEPTH_DEEP, MAX_GAP_M,
} from '../src/view/track-trail.js';
import { ribbonLook, createTrackRibbon } from '../src/view/gl/track-ribbon.js';

// A rider on the snow heading east (boardHeading = travelHeading = 0) unless fields say otherwise.
const rider = (o = {}) => ({
 x: 0, y: 0, z: 0, boardHeading: 0, travelHeading: 0, skid: 0, isBraking: false, edge: 0, grind: null, crashTimer: 0,
 ...o,
});
const STEP_M = 0.3; // m ridden per step in these tests (more than SPACING_M)
const X = 0, Y = 1, PX = 2, PY = 3, HW = 4, PHW = 5, DEPTH = 6, SMEAR = 7;
const slot = (trail, i, field) => trail.data[(i % TRAIL_CAPACITY) * SAMPLE_FLOATS + field];

// Rides n steps east along y = 0 from x0, recording each.
function ride(trail, rig, n, o = {}, x0 = 0) {
 for (let i = 0; i < n; i++) recordTrail(trail, rider({ x: x0 + i * STEP_M, ...o }), rig);
}

describe('track trail', () => {
 it('a straight carve on a board is one line of narrow samples along the path', () => {
  const t = createTrail();
  ride(t, 'board', 11);
  assert.equal(t.written, 10); // the first point only starts the segment
  for (let i = 0; i < t.written; i++) {
   assert.ok(Math.abs(slot(t, i, X) - (i + 1) * STEP_M) < 1e-5);
   assert.ok(Math.abs(slot(t, i, PX) - i * STEP_M) < 1e-5);
   assert.equal(slot(t, i, Y), 0);
   assert.ok(Math.abs(slot(t, i, HW) - EQUIPMENT.board.widthM / 2) < 1e-6, 'a carve is as wide as the board');
   assert.equal(slot(t, i, SMEAR), 0);
   assert.equal(slot(t, i, DEPTH), Math.fround(DEPTH_CARVE));
  }
 });

 it('does not add a sample until the rider has moved a spacing', () => {
  const t = createTrail();
  recordTrail(t, rider(), 'board');
  recordTrail(t, rider({ x: SPACING_M / 2 }), 'board');
  assert.equal(t.written, 0);
  recordTrail(t, rider({ x: SPACING_M * 1.1 }), 'board');
  assert.equal(t.written, 1);
 });

 it('skis leave two lines a ski spacing apart across the board heading', () => {
  const t = createTrail();
  const heading = Math.PI / 6; // riding along the board, 30 degrees counter-clockwise from east
  for (let i = 0; i < 6; i++) {
   const x = i * STEP_M * Math.cos(heading);
   const y = i * STEP_M * Math.sin(heading);
   recordTrail(t, rider({ x, y, boardHeading: heading, travelHeading: heading }), 'ski');
  }
  assert.equal(t.written, 10); // 5 steps on each of 2 lines
  for (let i = 0; i < t.written; i += 2) {
   const dx = slot(t, i, X) - slot(t, i + 1, X);
   const dy = slot(t, i, Y) - slot(t, i + 1, Y);
   assert.ok(Math.abs(Math.hypot(dx, dy) - EQUIPMENT.ski.centreSpacingM) < 1e-5);
   // the offset is perpendicular to the board
   assert.ok(Math.abs(dx * Math.cos(heading) + dy * Math.sin(heading)) < 1e-5);
   assert.ok(Math.abs(slot(t, i, HW) - EQUIPMENT.ski.widthM / 2) < 1e-6);
  }
 });

 it('a board turned across the direction of travel sweeps its length', () => {
  const t = createTrail();
  ride(t, 'board', 4, { boardHeading: Math.PI / 2 }); // pointing north, moving east
  const expected = EQUIPMENT.board.widthM / 2 + EQUIPMENT.board.lengthM / 2;
  assert.ok(Math.abs(slot(t, 0, HW) - expected) < 1e-5);
  assert.ok(Math.abs(slot(t, 0, SMEAR) - 1) < 1e-6);
  assert.ok(2 * slot(t, 0, HW) >= EQUIPMENT.board.lengthM, 'the swath is at least the board long');
  const half = swathHalfWidth(EQUIPMENT.board, 0.2);
  assert.ok(half > EQUIPMENT.board.widthM / 2 && half < expected);
  assert.equal(swathHalfWidth({ lengthM: 30, widthM: 1 }, Math.PI / 2), MAX_HALF_WIDTH_M);
 });

 it('braking or skidding cuts deeper than carving', () => {
  const plain = createTrail();
  const brake = createTrail();
  const skid = createTrail();
  ride(plain, 'board', 3);
  ride(brake, 'board', 3, { isBraking: true });
  ride(skid, 'board', 3, { skid: 5 });
  assert.ok(slot(brake, 0, DEPTH) > slot(plain, 0, DEPTH));
  assert.equal(slot(skid, 0, DEPTH), Math.fround(DEPTH_DEEP));
 });

 it('the edge angle cuts deeper (it is 0 until the sim sets it)', () => {
  const flat = createTrail();
  const edged = createTrail();
  ride(flat, 'board', 3);
  ride(edged, 'board', 3, { edge: 0.8 });
  assert.ok(slot(edged, 0, DEPTH) > slot(flat, 0, DEPTH));
 });

 it('leaving the snow, crashing or grinding starts a new segment: no ribbon bridges the gap', () => {
  for (const off of [{ z: 1 }, { crashTimer: 1 }, { grind: { r: {}, t: 0 } }]) {
   const t = createTrail();
   ride(t, 'board', 3);
   assert.equal(t.written, 2);
   recordTrail(t, rider({ x: 0.9, ...off }), 'board');
   // landing: the first point back only starts a segment, whatever distance was covered
   recordTrail(t, rider({ x: 1.2 }), 'board');
   assert.equal(t.written, 2, 'the landing point adds no quad from before the gap');
   recordTrail(t, rider({ x: 1.5 }), 'board');
   assert.equal(t.written, 3);
   assert.ok(Math.abs(slot(t, 2, PX) - 1.2) < 1e-5, 'the next quad starts at the landing point');
  }
 });

 it('a teleport (a restart) does not draw a ribbon across the map', () => {
  const t = createTrail();
  ride(t, 'board', 3);
  recordTrail(t, rider({ x: 500, y: 300 }), 'board');
  assert.equal(t.written, 2);
  recordTrail(t, rider({ x: 500 + STEP_M, y: 300 }), 'board');
  assert.equal(t.written, 3);
  assert.ok(slot(t, 2, PX) >= 500 && MAX_GAP_M < 500);
 });

 it('the ring wraps over its oldest samples without allocating', () => {
  const t = createTrail();
  const data = t.data;
  ride(t, 'board', TRAIL_CAPACITY + 11);
  assert.equal(t.data, data, 'the same array');
  assert.equal(t.data.length, TRAIL_CAPACITY * SAMPLE_FLOATS);
  assert.equal(t.written, TRAIL_CAPACITY + 10);
  // the newest sample is in slot 9 and the oldest left is the one after it
  assert.ok(Math.abs(slot(t, TRAIL_CAPACITY + 9, X) - (TRAIL_CAPACITY + 10) * STEP_M) < 0.05);
 });

 it('clearTrail empties it and starts a new epoch', () => {
  const t = createTrail();
  ride(t, 'ski', 5);
  const epoch = t.epoch;
  clearTrail(t);
  assert.equal(t.written, 0);
  assert.equal(t.epoch, epoch + 1);
  assert.ok(t.data.every((v) => v === 0));
  recordTrail(t, rider({ x: 10 }), 'ski');
  assert.equal(t.written, 0, 'the first point after a clear only starts a segment');
 });
});

describe('track ribbon (no GL)', () => {
 it('the groove floor is the Look\'s shade over its lit snow, at most 1', () => {
  const look = ribbonLook([0.5, 0.6, 0.8], [1, 0.9, 0.85]);
  assert.deepEqual(look.floor.map((v) => +v.toFixed(3)), [0.5, 0.667, 0.941]);
  assert.equal(ribbonLook([1, 1, 1], [0.5, 0.5, 0.5]).floor[0], 1);
 });

 // A stand-in for three.js: records what the ribbon asks of its buffer.
 const fakeThree = () => {
  const calls = { ranges: [], needsUpdate: 0, cleared: 0 };
  class Any { constructor() { this.uniforms = {}; } setAttribute() {} setIndex() {} setUsage() {} }
  class Buffer extends Any {
   addUpdateRange(start, count) { calls.ranges.push([start, count]); }
   clearUpdateRanges() { calls.cleared++; calls.ranges.length = 0; }
   set needsUpdate(v) { if (v) calls.needsUpdate++; }
  }
  class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
  const THREE = new Proxy({
   InstancedBufferGeometry: Any, BufferAttribute: Any, InterleavedBufferAttribute: Any, RawShaderMaterial: Any,
   Mesh: class extends Any { constructor(geometry) { super(); this.geometry = geometry; } },
   InstancedInterleavedBuffer: Buffer, Vector3: Vec3,
  }, { get: (target, key) => (key in target ? target[key] : key) });
  const glScene = { add() {} };
  return { THREE, glScene, calls };
 };

 it('uploads only the samples appended since the last frame, in two ranges where the ring wraps, all after a clear',
  () => {
   const { THREE, glScene, calls } = fakeThree();
   const t = createTrail();
   const shared = {};
   const ribbon = createTrackRibbon(THREE, glScene, shared, t, { floor: [1, 1, 1] });
   ride(t, 'board', 6);
   ribbon.update(t);
   assert.deepEqual(calls.ranges, [[0, 5 * SAMPLE_FLOATS]]);
   ribbon.update(t);
   assert.equal(calls.needsUpdate, 1, 'nothing new, nothing uploaded');
   ride(t, 'board', TRAIL_CAPACITY - 8, {}, 10); // the ring is nearly full
   ribbon.update(t);
   ride(t, 'board', 10, {}, 5000);
   ribbon.update(t);
   assert.equal(calls.ranges.length, 2, 'the new samples straddle the end of the ring');
   assert.equal(calls.ranges[1][0], 0);
   assert.equal(calls.ranges[0][0] + calls.ranges[0][1], TRAIL_CAPACITY * SAMPLE_FLOATS, 'to the ring end');
   clearTrail(t);
   ribbon.update(t);
   assert.equal(calls.ranges.length, 0, 'after a clear no range means the whole buffer');
  });
});
