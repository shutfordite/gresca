// @areas sim
// K3: grinds on park features' polylines (world points, ADR 0012), one shape at a time at fixed speeds and dt: gravity
// along the segment, rail and box friction, kinks (speed carries, a convex kink lifts the rider), bends (lean or slide
// off the outside), styles from the board's angle, balance, getting on from the air, and hitting a box side or legs.
// The fixtures are made here over flat snow at altitude 0 (z of a point is its height), not K1's park.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SIM_DT } from '../src/core/config.js';
import { createRng } from '../src/core/rng.js';
import { NO_TREES } from '../src/world/build.js';
import { DEFAULT_COURSE } from '../src/world/course.js';
import { Terrain } from '../src/world/terrain.js';
import { createRider, createSession } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { railCheck, grindStep, grindStyle, FLAT_SNOW } from '../src/sim/grind.js';
import { createSpray, sprayCount } from '../src/sim/particles.js';
import { checkRiderState, checkSimEvent } from '../src/core/contracts.js';

const idle = { left: 0, right: 0, brake: 0, jump: 0, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0 };

// A park rail or box with world points pts ([x, y, z] m), as K0 resolves them.
function feature(pts, { profile = 'rail', width = profile === 'box' ? 0.5 : 0.06, legs = true, entry = 'ramp' } = {}) {
 return { profile, width, legs, entry, world: pts.map(([x, y, z]) => ({ x, y, z })) };
}

// A course with only these park rails: the default course's queries, no course rails and no kickers.
const courseOf = (...rails) => ({
 ...DEFAULT_COURSE,
 rails: [],
 kickerAt: () => null,
 features: { jumps: [], rails },
});

// The C-rail: a 90 degree left bend of radius R m in n chords, 0.8 m up, starting at the origin heading east.
function cRail(R = 6, n = 12) {
 const pts = [];
 for (let i = 0; i <= n; i++) {
  const a = (i / n) * Math.PI / 2;
  pts.push([R * Math.sin(a), R * (1 - Math.cos(a)), 0.8]);
 }
 return feature(pts);
}

// Rides rail (its first segment along heading phi) from 0.5 m along at speed (m/s), the board at phi + boardOff, with
// input (or input(rider) per step), for at most seconds. Returns {rider, session, events, start, top: the most
// speed, lifted: whether a kink threw the rider up, balance: the last on the rail, onFor: s on the rail, spray}.
function grindOn(rail, speed, { boardOff = 0, input = {}, seconds = 8, z = 0 } = {}) {
 const course = courseOf(rail);
 const a = rail.world[0];
 const b = rail.world[1];
 const len = Math.hypot(b.x - a.x, b.y - a.y);
 const ux = (b.x - a.x) / len;
 const uy = (b.y - a.y) / len;
 const phi = Math.atan2(uy, ux);
 const rider = createRider();
 Object.assign(rider, { x: a.x + ux * 0.5, y: a.y + uy * 0.5, z, vx: ux * speed, vy: uy * speed });
 rider.heading = phi + boardOff;
 const session = createSession();
 session.phase = 'run';
 const spray = createSpray(createRng(3));
 const inp = { ...idle };
 const events = [];
 assert.equal(railCheck(rider, inp, spray, course, FLAT_SNOW, SIM_DT), 'grind', 'rides on at the start');
 const out = { rider, session, events, spray, start: { ...rider.grind }, top: speed, lifted: false, onFor: 0 };
 for (let i = 0; i < Math.round(seconds / SIM_DT) && rider.grind; i++) {
  Object.assign(inp, idle, typeof input === 'function' ? input(rider) : input);
  session.events.length = 0;
  grindStep(rider, inp, session, spray, SIM_DT, course, FLAT_SNOW);
  events.push(...session.events);
  out.onFor += SIM_DT;
  out.top = Math.max(out.top, Math.hypot(rider.vx, rider.vy));
  if (rider.grind) {
   out.lifted ||= rider.grind.lift > 0;
   out.balance = rider.grind.balance;
   assert.deepEqual(checkRiderState(rider), []);
  }
 }
 for (const e of events) assert.deepEqual(checkSimEvent({ t: 0, ...e }), [], JSON.stringify(e));
 out.end = events.find((e) => e.type === 'grindEnd');
 return out;
}

describe('grinds follow the shape of the rail', () => {
 it('a down rail speeds the rider up and rolls them off the end', () => {
  const run = grindOn(feature([[0, 0, 1.6], [12, 0, 0.4]]), 5); // 5.7 degrees down
  assert.ok(run.top > 6, `top speed ${run.top.toFixed(2)} m/s`);
  assert.equal(run.end.jumped, false);
  assert.equal(run.end.kinks, 0);
  assert.ok(run.end.dist > 11, `ground ${run.end.dist.toFixed(1)} m`);
  assert.ok(run.rider.vz > 0 && run.rider.airTime < 0, 'pops off the end, the drop scoring nothing');
 });

 it('a flat box slows the rider to a stop, sooner than a flat rail', () => {
  const box = grindOn(feature([[0, 0, 0.5], [20, 0, 0.5]], { profile: 'box' }), 5);
  assert.ok(box.end && box.end.dist < 10, `box: stopped after ${box.end.dist.toFixed(1)} m of 20`);
  assert.equal(box.end.kind, 'box');
  assert.equal(box.session.crashes, 0, 'stepping off a stalled box is no crash');
  const rail = grindOn(feature([[0, 0, 0.5], [40, 0, 0.5]]), 5);
  assert.ok(rail.end.dist > 1.8 * box.end.dist, `rail ${rail.end.dist.toFixed(1)} m, box ${box.end.dist.toFixed(1)} m`);
 });

 it('a down-flat-down rail carries the speed through both kinks, lifting over the convex one', () => {
  const dfd = feature([[0, 0, 2], [5, 0, 1.2], [11, 0, 1.2], [16, 0, 0.4]]);
  const run = grindOn(dfd, 8);
  assert.ok(run.lifted, 'thrown up off the rail at the flat-to-down kink');
  assert.equal(run.end.kinks, 2);
  assert.equal(run.end.jumped, false);
  assert.ok(run.end.dist > 15.5, 'rides to the end');
  assert.equal(run.session.crashes, 0);
  assert.ok(Math.hypot(run.rider.vx, run.rider.vy) > 6, 'still fast at the end');
  // spinning the board while lifted off the kink, to 0.8 rad off the rail (neither lined up nor across): a crash
  const offLine = (r) => Math.abs(Math.atan2(Math.sin(r.heading), Math.cos(r.heading)));
  const spun = grindOn(dfd, 8, { input: (r) => ({ right: r.grind.lift > 0 && offLine(r) < 0.8 ? 1 : 0 }) });
  assert.equal(spun.session.crashes, 1);
  assert.ok(spun.events.some((e) => e.type === 'crash' && e.cause === 'rail'));
  // spun on to square across, it lands back on as a slide ("50-50 to boardslide")
  const slid = grindOn(dfd, 8, { input: (r) => ({ right: r.grind.lift > 0 && offLine(r) < 1.5 ? 1 : 0 }) });
  assert.equal(slid.session.crashes, 0);
  assert.equal(slid.start.style, '5050');
  assert.match(slid.end.style, /^(boardslide|lipslide)$/);
 });

 it('a C-rail held with the right lean completes; no lean or too fast slides off the outside', () => {
  const R = 6;
  // the lean the bend needs, tan(lean) = v² / (R g), as a steer (left is -; GRIND.MAX_LEAN 0.6 rad at full steer)
  const right = (r) => ({ steer: -Math.atan(Math.hypot(r.vx, r.vy) ** 2 / (R * 9.81)) / 0.6 });
  const held = grindOn(cRail(R), 6.5, { input: right });
  assert.equal(held.session.crashes, 0);
  assert.ok(held.end.dist > 8.5, `held: ground ${held.end.dist.toFixed(1)} m of the 8.9 from 0.5 m in`);
  assert.ok(held.rider.vz > 0, 'rolled off the end (a drop off the side has no pop)');
  const none = grindOn(cRail(R), 6.5);
  assert.ok(none.end.dist < 8, `no lean: off after ${none.end.dist.toFixed(1)} m`);
  const fast = grindOn(cRail(R), 11, { input: { left: 1 } });
  assert.ok(fast.end.dist < 8, `too fast: off after ${fast.end.dist.toFixed(1)} m`);
  // off the outside of the left bend: the balance tipped right (-), and the rider who dropped moves off to the right
  // of the rail's direction where it left (the fast one went so hard it crashed)
  assert.ok(none.balance < -0.9 && fast.balance < -0.9, `${none.balance}, ${fast.balance}`);
  assert.equal(none.session.crashes, 0);
  assert.equal(fast.session.crashes, 1);
  const t = (none.end.dist + 0.5) / R; // rad round the bend
  const across = Math.cos(t) * none.rider.vy - Math.sin(t) * none.rider.vx; // m/s, + to the left of the tangent
  assert.ok(across < 0, `left to the outside (${across.toFixed(2)} m/s)`);
 });

 it('lined up is a 50-50, across is a boardslide or a lipslide by the side of approach', () => {
  assert.equal(grindStyle(0.3, 0, 1), '5050');
  assert.equal(grindStyle(Math.PI - 0.2, 0, -1), '5050', 'tail first');
  assert.equal(grindStyle(Math.PI / 2, 0, -1), 'boardslide', 'from the right, the nose crossed over to the left');
  assert.equal(grindStyle(Math.PI / 2, 0, 1), 'lipslide', 'from the left, the tail crossed over');
  assert.equal(grindStyle(0.8, 0, 1), null, 'neither');
  const run = grindOn(feature([[0, 0, 0.5], [10, 0, 0.5]], { profile: 'box' }), 7, { boardOff: Math.PI / 2 + 0.2 });
  assert.match(run.start.style, /^(boardslide|lipslide)$/);
  assert.equal(run.end.style, run.start.style);
  assert.ok(sprayCount(run.spray) > 8, 'sparks and snow off the box');
 });

 it('the board off its line drifts the balance and the steer corrects it; badly off is a crash', () => {
  const straight = () => feature([[0, 0, 0.6], [30, 0, 0.6]]);
  let most = 0;
  const off = grindOn(straight(), 9, { boardOff: 0.45, seconds: 0.4, input: (r) => {
   most = Math.max(most, r.grind.balance);
   return {};
  } });
  assert.ok(most > 0.15, `off its line: balance to ${most.toFixed(2)}`);
  let fixed = 0;
  grindOn(straight(), 9, { boardOff: 0.45, seconds: 0.4, input: (r) => {
   fixed = Math.max(fixed, r.grind.balance);
   return { right: 1 };
  } });
  assert.ok(fixed < most / 2, `steered against it: ${fixed.toFixed(2)}`);
  assert.equal(off.session.crashes, 0);
  const lean = grindOn(straight(), 9, { input: { left: 1 } });
  assert.ok(lean.end && !lean.end.jumped && lean.session.crashes === 0, 'too much lean drops off the side');
  const bad = grindOn(straight(), 9, { boardOff: 0.58, input: { left: 1 } });
  assert.equal(bad.session.crashes, 1, 'off its line and leaning the same way: falls fast, a crash');
 });
});

describe('getting on and hitting the side', () => {
 // A flat snow grid at 100 m altitude, 200 m square, groomed.
 const N = 200;
 const ALT = 100;
 const terrain = Terrain.create({ base: Terrain.grid(new Float32Array(N * N).fill(ALT), N, N, 1), groomed: () => 1 });
 const at = (pts) => pts.map(([x, y, z]) => [x, y, ALT + z]);

 // Rides over the grid with input per step for seconds; returns the rider and every event.
 function ride(course, rider, seconds, input = () => ({})) {
  const session = createSession();
  session.phase = 'run';
  const state = { rider, session, spray: createSpray(createRng(5)), gradient: { gx: 0, gy: 0 } };
  const events = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
   events.push(...step(state, { ...idle, ...input(rider, i) }, { terrain, trees: NO_TREES, course }, SIM_DT));
  }
  return { events, session };
 }

 it('an ollie from beside a side-entry box lands on it', () => {
  const box = feature(at([[60, 100, 0.5], [80, 100, 0.5]]), { profile: 'box', entry: 'side' });
  const rider = createRider();
  const a = 0.12; // rad toward the box
  Object.assign(rider, { x: 58, y: 99.1, heading: a, vx: 8 * Math.cos(a), vy: 8 * Math.sin(a) });
  const run = ride(courseOf(box), rider, 1.2, (r, i) => ({ jump: i === 6 ? 1 : 0 }));
  const start = run.events.find((e) => e.type === 'grindStart');
  assert.ok(start, 'grinding');
  assert.equal(start.kind, 'box');
  assert.equal(start.style, '5050');
  assert.equal(run.session.crashes, 0);
 });

 it('riding into a rail on legs or a box side is a crash; ollieing over it is not', () => {
  for (const f of [
   feature(at([[60, 100, 0.7], [80, 100, 0.7]])),
   feature(at([[60, 100, 0.5], [80, 100, 0.5]]), { profile: 'box', legs: false }),
  ]) {
   const rider = createRider();
   Object.assign(rider, { x: 70, y: 97, heading: Math.PI / 2, vx: 0, vy: 8 });
   const run = ride(courseOf(f), rider, 0.6);
   assert.equal(run.session.crashes, 1, f.profile);
   assert.ok(run.events.some((e) => e.type === 'crash' && e.cause === 'rail'));
   assert.ok(rider.y < 100, 'stopped on the near side');
   const over = createRider();
   Object.assign(over, { x: 70, y: 96, heading: Math.PI / 2, vx: 0, vy: 8 });
   const jumped = ride(courseOf(f), over, 0.8, (r, i) => ({ jump: i === 0 ? 1 : 0 }));
   assert.equal(jumped.session.crashes, 0, 'ollied over the ' + f.profile);
   assert.ok(over.y > 100);
  }
 });
});
