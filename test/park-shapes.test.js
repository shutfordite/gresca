// @areas world
// The park shape library (world/park/, K1): jump shapes sized from the sim's own gravity, and rail and box lines.
// Pure functions: no world is built here (the play mountain's park is in test/park-play.test.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JUMP_GRAVITY } from '../src/core/config.js';
import { JUMP_SIZES, PARK_LIMITS, checkParkFeatures } from '../src/core/contracts.js';
import { designJump, nominalSpeed, sizeSpec, touchdownOf } from '../src/world/park/jump-design.js';
import { createJumpShape, DROP_IN } from '../src/world/park/jump-shape.js';
import { railLine, RAIL_SHAPES, BOX_SHAPES } from '../src/world/park/rail-shapes.js';

const DEG = Math.PI / 180;
// The base slope (m/m) each size is designed on: the play mountain's pitch at its line.
const SLOPE = Object.freeze({ xs: 0.18, s: 0.09, m: 0.115, l: 0.14, xl: 0.18 });
const MID_TOL = 0.15; // of the landing's length: how far from its middle a rider at the design speed may touch down

const shapeAt = (j, slope, x, d = 0) => createJumpShape(j, slope).sample(x, d, { h: 0, dhdx: 0, dhdd: 0 });

describe('a jump is sized so a rider at its design speed lands in the middle of its landing', () => {
 for (const size of JUMP_SIZES) {
  it(size + ': lands between the knuckle and the bottom, near the middle', () => {
   const slope = SLOPE[size];
   const speed = nominalSpeed(size, slope);
   const jump = designJump({ size, speed, slope });
   const x = touchdownOf(jump, slope, speed);
   const knuckle = jump.table.length;
   const bottom = knuckle + jump.landing.length;
   assert.ok(x >= knuckle && x <= bottom, size + ' at ' + speed.toFixed(1) + ' m/s lands at ' + x.toFixed(1) +
    ' m, the landing is ' + knuckle.toFixed(1) + ' to ' + bottom.toFixed(1));
   const middle = knuckle + jump.landing.length / 2;
   const off = Math.abs(x - middle);
   assert.ok(off <= MID_TOL * jump.landing.length, 'lands ' + off.toFixed(1) + ' m from the middle');
  });

  it(size + ': its dimensions are the roadmap\'s size table', () => {
   const row = sizeSpec(size);
   const j = designJump({ size, speed: nominalSpeed(size, SLOPE[size]), slope: SLOPE[size] });
   const within = (v, range, tol = 1e-9) => v >= range[0] - tol && v <= range[1] + tol;
   assert.ok(within(j.takeoff.height, row.lip), 'lip height ' + j.takeoff.height);
   assert.ok(within(j.takeoff.angle, row.lipAngle), 'lip angle ' + j.takeoff.angle / DEG);
   assert.ok(within(j.table.length, row.table), 'table ' + j.table.length);
   assert.ok(within(j.landing.angle, row.landAngle), 'landing angle ' + j.landing.angle / DEG);
   assert.ok(within(j.landing.length, row.landing), 'landing length ' + j.landing.length);
   assert.equal(j.table.gap, size === 'xl', 'only the mega ramp is a gap');
   assert.deepEqual(checkParkFeatures({ jumps: [j], rails: [] }, false), [], 'the contract takes it');
  });
 }

 it('a faster rider is given a longer table or landing; a rider beyond the size still lands on the landing', () => {
  const slow = designJump({ size: 'm', speed: 15.5, slope: SLOPE.m });
  const fast = designJump({ size: 'm', speed: 18.5, slope: SLOPE.m });
  assert.ok(fast.table.length + fast.landing.length > slow.table.length + slow.landing.length);
  const x = touchdownOf(fast, SLOPE.m, 18.5);
  assert.ok(x >= fast.table.length && x <= fast.table.length + fast.landing.length);
 });

 it('flight is the sim\'s: on a level table it lands where v² sin(2 angle) / JUMP_GRAVITY says', () => {
  const level = {
   size: 'm', s: 0, d: 0, designSpeed: 15,
   takeoff: { length: 6, height: 2, angle: 0.45, width: 8 },
   table: { length: 40, gap: false },
   landing: { height: 2, angle: 0.5, length: 20 },
  };
  const expected = 15 * 15 * Math.sin(2 * 0.45) / JUMP_GRAVITY;
  assert.ok(Math.abs(touchdownOf(level, 0, 15) - expected) < 0.05, touchdownOf(level, 0, 15) + ' against ' + expected);
 });

 it('refuses an unknown size, and a landing no steeper than the slope', () => {
  assert.throws(() => designJump({ size: 'huge', speed: 15, slope: 0.1 }), /unknown size/);
  assert.throws(() => designJump({ size: 's', speed: 15, slope: 1 }), /not steeper/);
 });
});

describe('the snow of a jump, above the base snow', () => {
 const slope = SLOPE.m;
 const jump = designJump({ size: 'm', speed: 17, slope });
 const shape = createJumpShape(jump, slope);

 it('rises from the base snow to the lip height, with the lip\'s angle above the horizontal', () => {
  assert.equal(shapeAt(jump, slope, -shape.back - 1).h, 0);
  assert.ok(Math.abs(shapeAt(jump, slope, 0).h - jump.takeoff.height) < 1e-9, 'the lip');
  // m/m above the base at the takeoff's end, so the slope in the world is rise - slope
  const rise = shapeAt(jump, slope, -1e-9).dhdx;
  assert.ok(Math.abs(Math.atan(rise - slope) - jump.takeoff.angle) < 1e-6, 'lip angle');
 });

 it('has the knuckle at the landing height and falls to the base snow at the bottom', () => {
  assert.ok(Math.abs(shapeAt(jump, slope, jump.table.length).h - jump.landing.height) < 1e-9, 'the knuckle');
  const bottom = jump.table.length + jump.landing.length;
  assert.ok(shapeAt(jump, slope, bottom - 0.01).h < 0.01, 'the bottom meets the base snow');
  assert.equal(shapeAt(jump, slope, bottom + 5).h, 0, 'nothing past it: the run-out is the base snow');
  const knuckle = jump.table.length + 0.01;
  assert.ok(Math.atan(slope - shapeAt(jump, slope, knuckle).dhdx) / DEG > 0, 'the landing falls');
 });

 it('has groomed sidewalls: full height across the top, gone beyond the walls', () => {
  const half = jump.takeoff.width / 2;
  assert.ok(Math.abs(shapeAt(jump, slope, 0, half - 0.1).h - jump.takeoff.height) < 1e-9);
  assert.ok(shapeAt(jump, slope, 0, half + 0.5).h < jump.takeoff.height);
  assert.equal(shapeAt(jump, slope, 0, shape.half + 0.1).h, 0);
  assert.equal(shapeAt(jump, slope, 0, -shape.half - 0.1).h, 0);
  assert.equal(shapeAt(jump, slope, 0, 1).h, shapeAt(jump, slope, 0, -1).h, 'symmetric');
 });

 it('has a gradient that is the derivative of its height', () => {
  const near = (v, w) => Math.abs(v - w) < 1e-4;
  const e = 1e-5;
  for (const [x, d] of [[-3, 0.5], [4, 1], [jump.table.length + 6, 3], [jump.table.length + 6, half(jump) + 1]]) {
   const at = shapeAt(jump, slope, x, d);
   const fx = (shapeAt(jump, slope, x + e, d).h - shapeAt(jump, slope, x - e, d).h) / (2 * e);
   const fd = (shapeAt(jump, slope, x, d + e).h - shapeAt(jump, slope, x, d - e).h) / (2 * e);
   assert.ok(near(at.dhdx, fx) && near(at.dhdd, fd), `at ${x}, ${d}: ${at.dhdx} ${at.dhdd} against ${fx} ${fd}`);
  }
 });

 it('a gap has no snow between the lip and the knuckle; the mega ramp has its drop-in', () => {
  const gapSlope = SLOPE.xl;
  const mega = designJump({ size: 'xl', speed: 22, slope: gapSlope });
  const mid = mega.table.length / 2;
  assert.equal(shapeAt(mega, gapSlope, mid).h, 0, 'open air');
  const deck = -createJumpShape(mega, gapSlope).back + DROP_IN.rise + DROP_IN.deck / 2;
  assert.ok(Math.abs(shapeAt(mega, gapSlope, deck).h - DROP_IN.height) < 1e-9, 'the deck of the drop-in');
  assert.equal(shapeAt(designJump({ size: 'l', speed: 19, slope: SLOPE.l }), SLOPE.l, -40).h, 0, 'only XL has one');
 });
});

function half(jump) {
 return jump.takeoff.width / 2;
}

// The kinks of a line (vertices where its slope in the profile changes by more than KINK_RAD) and its length.
const KINK_RAD = 5 * DEG; // a kink the eye and the grind both feel; a rainbow's arc turns less per vertex
function profileOf(points) {
 const kinks = [];
 let length = 0;
 let plan = 0;
 for (let i = 1; i < points.length; i++) {
  const a = points[i - 1];
  const b = points[i];
  length += Math.hypot(b.s - a.s, b.d - a.d, b.h - a.h);
  if (i > 1) {
   const p = points[i - 2];
   const before = Math.atan2(a.h - p.h, Math.hypot(a.s - p.s, a.d - p.d));
   const after = Math.atan2(b.h - a.h, Math.hypot(b.s - a.s, b.d - a.d));
   if (Math.abs(after - before) > KINK_RAD) kinks.push(i - 1);
   plan = Math.max(plan, Math.abs(Math.atan2(b.d - a.d, b.s - a.s) - Math.atan2(a.d - p.d, a.s - p.s)));
  }
 }
 const sideways = Math.max(...points.map((p) => Math.abs(p.d - points[0].d)));
 return { length, kinks: kinks.length, sideways, planTurn: plan };
}

const KINKS = Object.freeze({
 straight: 0, down: 0, 'flat-down': 1, 'down-flat-down': 2, 'flat-down-flat': 2, rainbow: 0, 'c-rail': 0, 's-rail': 0,
});

describe('rails and boxes', () => {
 const slope = 0.04; // m/m, the jib section's pitch
 for (const length of [6, 13, 20]) {
  for (const shape of RAIL_SHAPES) {
   it(`${shape} rail, ${length} m: its length, its heights and its kinks`, () => {
    const rail = railLine({ shape, s: 100, d: 0, length, slope });
    const p = profileOf(rail.points);
    assert.ok(Math.abs(p.length - length) < 0.01 * length, 'is ' + p.length.toFixed(2) + ' m long');
    for (const pt of rail.points) assert.ok(pt.h >= 0.3 - 1e-9 && pt.h <= 1.5 + 1e-9, 'a top at ' + pt.h);
    assert.equal(p.kinks, KINKS[shape], shape + ' kinks');
    assert.equal(rail.profile, 'rail');
    assert.deepEqual(checkParkFeatures({ jumps: [], rails: [rail] }, false), []);
   });
  }
 }

 it('boxes: flat, down, kinked and rainbow, with a box top', () => {
  const kinks = { flat: 0, down: 0, kinked: 2, rainbow: 0 };
  for (const shape of BOX_SHAPES) {
   const box = railLine({ shape, profile: 'box', s: 0, d: 0, length: 10, slope });
   assert.equal(profileOf(box.points).kinks, kinks[shape], shape);
   assert.equal(box.profile, 'box');
   assert.ok(box.width >= PARK_LIMITS.boxWidth.min && box.width <= PARK_LIMITS.boxWidth.max);
   assert.deepEqual(checkParkFeatures({ jumps: [], rails: [box] }, false), []);
  }
 });

 it('a down rail falls and a flat rail does not fall relative to the world', () => {
  const down = railLine({ shape: 'down', s: 0, d: 0, length: 12, slope }).points;
  assert.ok(down[1].h < down[0].h, 'the top falls along a down rail');
  const flat = railLine({ shape: 'straight', s: 0, d: 0, length: 12, slope }).points;
  const rising = (flat[1].h - flat[0].h) / 12;
  assert.ok(Math.abs(rising - slope) < 0.01, 'level in the world means rising relative to the snow');
 });

 it('C and S rails bend in plan, a C one way and an S both ways', () => {
  const c = railLine({ shape: 'c-rail', s: 0, d: 5, length: 14, slope }).points;
  const s = railLine({ shape: 's-rail', s: 0, d: 5, length: 14, slope }).points;
  assert.ok(c.every((p) => p.d >= 5 - 1e-9), 'a C stays on one side');
  assert.ok(s.some((p) => p.d > 5 + 0.5) && s.some((p) => p.d < 5 - 0.5), 'an S crosses its line');
  assert.ok(profileOf(c).sideways > 1);
 });

 it('refuses an unknown shape', () => {
  assert.throws(() => railLine({ shape: 'loop', s: 0, d: 0, length: 10, slope }), /unknown rail shape/);
  const asBox = { shape: 'straight', profile: 'box', s: 0, d: 0, length: 10, slope };
  assert.throws(() => railLine(asBox), /unknown box shape/);
 });
});
