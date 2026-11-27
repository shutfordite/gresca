// @areas sim
// H2: the snow contact. The steer builds the edge (a tap barely turns, a held steer carves), the edge is tipped only as
// far as the snow holds, gravity across the equipment is held by the edge, not banked as speed, and loose snow sinks
// the equipment: light powder slows and softens a little, deep powder bogs a slow rider down and planes a fast one.
// Measured on planes made here (sim/step.js called directly, fixed dt), so the map's relief plays no part.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SIM_DT, RIGS } from '../src/core/config.js';
import { createRng } from '../src/core/rng.js';
import { NO_TREES } from '../src/world/build.js';
import { Terrain } from '../src/world/terrain.js';
import { createRider, createSession } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { EDGE } from '../src/sim/tuning.js';
import { sinkFor, edgeHold, powderDrag } from '../src/sim/contact.js';
import { edgeCap } from '../src/sim/edge.js';

const N = 900;        // cells (1 m) each way: room for a long ride
const SLOPE = 0.25;   // m/m down +y (14 degrees, like the test slope's piste)
const DOWN = Math.PI / 2; // rad, the fall line's heading on the plane (+y)
const LIGHT_M = 0.12; // m, light powder (world/snow.js POWDER.LIGHT_M)
const DEEP_M = 0.55;  // m, deep powder (POWDER.DEEP_M)
const idle = { left: 0, right: 0, brake: 0, jump: 0, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0 };

// A plane falling `slope` m per m down +y, with `depth` m of loose snow everywhere (0: groomed).
function plane(depth, slope = SLOPE) {
 const data = new Float32Array(N * N);
 for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) data[y * N + x] = 500 - slope * y;
 return Terrain.create({ base: Terrain.grid(data, N, N, 1), groomed: () => (depth > 0 ? 0 : 1), powder: () => depth });
}

// A rider on terrain at the plane's middle, moving at speed (m/s) along heading (rad), the equipment along it too.
function ride(terrain, { rig = 'board', speed = 10, heading = DOWN } = {}) {
 const rider = createRider();
 Object.assign(rider, { x: N / 2, y: 60, heading, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed });
 const session = createSession();
 session.rig = rig;
 session.phase = 'run';
 const state = { rider, session, spray: { particles: [], rng: createRng(1) }, gradient: { gx: 0, gy: 0 } };
 const world = { terrain, trees: NO_TREES };
 return {
  rider,
  spray: state.spray,
  // runs seconds (s) with input (InputState fields), calling each(rider) after every step
  go(seconds, input = {}, each = () => {}) {
   const inp = { ...idle, ...input };
   for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    step(state, inp, world, SIM_DT);
    each(rider);
   }
   return rider;
  },
 };
}

const speedOf = (r) => Math.hypot(r.vx, r.vy);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

describe('H2 the edge in the snow', () => {
 for (const rig of ['board', 'ski']) {
  it(`${rig}: a tap barely turns, a held steer builds into a turn`, () => {
   const tap = ride(plane(0), { rig, speed: 15 });
   tap.go(0.1, { right: 1 });
   tap.go(0.9);
   const tapped = Math.abs(wrap(tap.rider.heading - DOWN));
   const held = Math.abs(wrap(ride(plane(0), { rig, speed: 15 }).go(1, { right: 1 }).heading - DOWN));
   assert.ok(tapped < 0.12, `a 0.1 s tap turned ${tapped.toFixed(3)} rad`);
   assert.ok(held > 0.8, `a 1 s hold turned only ${held.toFixed(3)} rad`);
  });
 }

 it('the turn rate has inertia: it builds over the swing time, it does not jump', () => {
  const r = ride(plane(0), { speed: 12 });
  let most = 0;
  let prev = 0;
  r.go(1, { right: 1 }, (rider) => {
   most = Math.max(most, Math.abs(rider.yawRate - prev));
   prev = rider.yawRate;
  });
  assert.ok(most < 0.12, `the turn rate changed by up to ${most.toFixed(3)} rad/s in one step`);
 });

 it('at speed a hard steer tips the edge only as far as the snow holds, and carves into the turn', () => {
  const r = ride(plane(0), { speed: 20 });
  let skid = 0;
  // the first 0.4 s, down the fall line: further round, gravity across the slope joins in and it scrubs (edge.test.js)
  r.go(0.4, { right: 1 }, (rider) => {
   skid = Math.max(skid, rider.skid);
  });
  const cap = edgeCap(RIGS.board, 20, RIGS.board.edgeGrip);
  assert.ok(cap < EDGE.MAX_EDGE - 0.3, `cap ${cap.toFixed(2)} rad`);
  assert.ok(Math.abs(r.rider.edge) < EDGE.MAX_EDGE - 0.2, `edge ${r.rider.edge.toFixed(2)} rad at 20 m/s`);
  assert.ok(skid < 1.5, `skid ${skid.toFixed(2)} m/s`);
 });

 it('a traverse holds its line and gravity across the equipment is not banked as speed', () => {
  const across = 0; // heading east, square across the fall line
  const r = ride(plane(0), { speed: 8, heading: across });
  r.go(2);
  const travel = Math.atan2(r.rider.vy, r.rider.vx);
  assert.ok(Math.abs(wrap(travel - across)) < 0.08, `slid ${(wrap(travel - across) * 180 / Math.PI).toFixed(1)} deg`);
  assert.ok(speedOf(r.rider) < 8, `sped up to ${speedOf(r.rider).toFixed(2)} m/s across the slope`);
 });
});

describe('H2 loose snow', () => {
 it('straight down, groomed is fastest, light powder a little slower, deep powder much slower', () => {
  const after = (depth) => speedOf(ride(plane(depth), { speed: 5 }).go(3));
  const groomed = after(0);
  const light = after(LIGHT_M);
  const deep = after(DEEP_M);
  const why = `groomed ${groomed.toFixed(1)}, light ${light.toFixed(1)}, deep ${deep.toFixed(1)} m/s`;
  assert.ok(light < groomed - 0.5 && light > groomed - 4, why);
  assert.ok(deep < light - 3, why);
 });

 it('deep powder bogs a slow rider down on a gentle slope; light powder does not', () => {
  const gentle = 0.12; // m/m, 7 degrees
  const deep = speedOf(ride(plane(DEEP_M, gentle), { speed: 3 }).go(4));
  const light = speedOf(ride(plane(LIGHT_M, gentle), { speed: 3 }).go(4));
  assert.ok(deep < 3.5, `deep: ${deep.toFixed(2)} m/s after 4 s`);
  assert.ok(light > 5, `light: ${light.toFixed(2)} m/s after 4 s`);
 });

 it('the equipment sinks deep when slow and planes up with speed; the board floats sooner than skis', () => {
  const sunk = ride(plane(DEEP_M), { speed: 2 }).go(0.6).sink;
  const planing = ride(plane(DEEP_M, 0.4), { speed: 16 }).go(0.6).sink;
  assert.ok(sunk > 0.35, `sunk ${sunk.toFixed(2)} m at 2 m/s`);
  assert.ok(planing < 0.2, `still ${planing.toFixed(2)} m sunk at 16 m/s`);
  assert.ok(sinkFor(RIGS.board, DEEP_M, 9) < sinkFor(RIGS.ski, DEEP_M, 9) - 0.03, 'board floats better');
  assert.equal(ride(plane(0)).go(0.5).sink, 0, 'no sink on groomed snow');
  assert.ok(ride(plane(DEEP_M)).go(0.1).snowDepth === DEEP_M, 'snowDepth reads terrain.powder');
 });

 it('sunk, the edge holds less and the drag grows', () => {
  assert.ok(edgeHold(RIGS.board, 0.8, 0.3) < edgeHold(RIGS.board, 0.8, 0) * 0.5);
  assert.ok(powderDrag(0.3, 10) > powderDrag(0.05, 10) * 5);
  assert.equal(powderDrag(0, 10), 0);
 });

 it('a brake in deep powder stops shorter than on groomed snow (the snow wall)', () => {
  const stop = (depth) => {
   const r = ride(plane(depth), { speed: 12 });
   const y0 = r.rider.y;
   r.go(5, { brake: 1 });
   return r.rider.y - y0;
  };
  const groomed = stop(0);
  const deep = stop(DEEP_M);
  assert.ok(deep < groomed - 2, `deep ${deep.toFixed(1)} m, groomed ${groomed.toFixed(1)} m`);
 });

 it('powder sprays all the while, bigger puffs in deep powder; running straight on groomed snow throws none', () => {
  const sprayOf = (depth) => {
   const r = ride(plane(depth, 0.4), { speed: 12 });
   let most = 0;
   let size = 0;
   r.go(1, {}, () => {
    most = Math.max(most, r.spray.particles.length);
    for (const p of r.spray.particles) size = Math.max(size, p.r);
   });
   return { most, size };
  };
  assert.equal(sprayOf(0).most, 0);
  const light = sprayOf(LIGHT_M);
  const deep = sprayOf(DEEP_M);
  assert.ok(light.most > 0, 'light powder sprays');
  assert.ok(deep.most > light.most * 2, `deep ${deep.most}, light ${light.most} particles`);
  assert.ok(deep.size > light.size, `deep puffs ${deep.size}, light ${light.size}`);
 });
});
