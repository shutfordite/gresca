// Flips (S2/F3): the rotation about the across axis, the landing window, the scoring and the trick names, through
// jumpStep and trickName on their own. Deterministic: fixed dt, no randomness beyond a seeded spray.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/config.js';
import { createRider, createSession } from '../src/sim/state.js';
import { jumpStep, trickName } from '../src/sim/jump.js';
import { FLIP } from '../src/sim/tuning.js';
import { createInput } from '../src/input/input.js';

const GRAVITY = 15;    // m/s², JUMP_GRAVITY in jump.js
const FULL_TURN = 2 * Math.PI; // rad
const DEG = Math.PI / 180;

// A rider in the air facing the way it travels (clean landing as far as the board goes), with the air time to
// make `turns` rotations at the full flip rate: vz = g t / 2.
function airborne(turns) {
 const rider = createRider();
 const airTime = turns * FULL_TURN / FLIP.RATE; // s
 Object.assign(rider, { x: 0, y: 600, vx: 0, vy: 10, heading: Math.PI / 2, z: 0.01, vz: GRAVITY * airTime / 2,
  fromKicker: true });
 return rider;
}

// Holds `flip` until touchdown; returns what the landing left: { rider, session, events }.
function fly(rider, flip) {
 const session = createSession();
 const input = createInput();
 const spray = { particles: [], rng: createRng(1) };
 input.flip = flip;
 let steps = 0;
 while ((rider.z > 0 || rider.vz > 0) && steps++ < 5000) jumpStep(rider, input, session, spray, SIM_DT);
 return { rider, session, events: session.events.map((e) => e.type) };
}

// Lands from just above the snow with flipRot already at `flipRot` rad: the landing alone.
function landWith(flipRot, rotation = 0) {
 const rider = createRider();
 Object.assign(rider, { x: 0, y: 600, vx: 0, vy: 10, heading: Math.PI / 2, z: 0.01, vz: -1, airTime: 1,
  flipRot, rotation, fromKicker: true });
 return fly(rider, 0);
}

describe('flips', () => {
 it('a held front flip turns flipRot + at the tuned rate and lands clean after one rotation', () => {
  const { rider, session, events } = fly(airborne(1), 1);
  assert.equal(rider.crashTimer, 0);
  assert.equal(session.crashes, 0);
  assert.equal(events.filter((e) => e === 'flip').length, 1, 'one flip event for the landed flip');
  const score = session.events.find((e) => e.type === 'score');
  assert.ok(score.points > FLIP.POINTS, 'the flip adds its points to the air score');
 });

 it('flipRot grows with the held flip, + front and - back', () => {
  const front = airborne(1);
  const back = airborne(1);
  const input = createInput();
  const spray = { particles: [], rng: createRng(1) };
  input.flip = 1;
  for (let i = 0; i < 60; i++) jumpStep(front, input, createSession(), spray, SIM_DT);
  input.flip = -1;
  for (let i = 0; i < 60; i++) jumpStep(back, input, createSession(), spray, SIM_DT);
  assert.ok(Math.abs(front.flipRot - FLIP.RATE * 60 * SIM_DT) < 1e-9);
  assert.ok(Math.abs(back.flipRot + FLIP.RATE * 60 * SIM_DT) < 1e-9);
 });

 it('a backflip lands clean and is a flip event too', () => {
  const { rider, session, events } = fly(airborne(1), -1);
  assert.equal(rider.crashTimer, 0);
  assert.equal(session.crashes, 0);
  assert.equal(events.filter((e) => e === 'flip').length, 1);
 });

 it('a double flip lands clean, scores more, and emits one flip event', () => {
  const single = fly(airborne(1), 1);
  const double = fly(airborne(2), 1);
  assert.equal(double.rider.crashTimer, 0);
  assert.equal(double.events.filter((e) => e === 'flip').length, 1, 'once per landed flip trick');
  const points = (r) => r.session.events.find((e) => e.type === 'score').points;
  assert.ok(points(double) > points(single) + FLIP.POINTS, 'two rotations score more than twice one');
 });

 it('a half flip crashes (the landing path: a crash event, a wipeout, no score)', () => {
  const { rider, session, events } = fly(airborne(0.5), 1);
  assert.ok(rider.crashTimer > 0);
  assert.equal(session.crashes, 1);
  assert.ok(events.includes('crash'));
  assert.ok(!events.includes('score'));
  assert.ok(!events.includes('flip'), 'a crashed flip is not a landed flip');
  assert.equal(session.events.find((e) => e.type === 'crash').cause, 'landing');
 });

 it('the landing window is +-40 degrees of a whole rotation, either way and for any count', () => {
  assert.equal(FLIP.LAND_WINDOW, 40 * DEG);
  for (const turns of [0, 1, -1, 2, -2]) {
   for (const off of [0, 39.9, -39.9]) {
    assert.equal(landWith(turns * FULL_TURN + off * DEG).rider.crashTimer, 0, turns + ' turns ' + off + ' deg');
   }
   for (const off of [40.1, -40.1, 90, 180]) {
    const { rider } = landWith(turns * FULL_TURN + off * DEG);
    assert.ok(rider.crashTimer > 0, turns + ' turns ' + off + ' deg crashes');
   }
  }
 });

 it('flipRot starts at 0 each take-off and is 0 again on the snow', () => {
  const landed = fly(airborne(1), 1).rider;
  assert.equal(landed.flipRot, 0, 'reset at the landing');
  landed.flipRot = 3;
  const input = createInput();
  input.jump = 1;
  jumpStep(landed, input, createSession(), { particles: [], rng: createRng(1) }, SIM_DT);
  assert.ok(landed.z > 0);
  assert.equal(landed.flipRot, 0, 'reset at the take-off');
 });

 it('flip on the snow does nothing', () => {
  const rider = createRider();
  const input = createInput();
  input.flip = 1;
  for (let i = 0; i < 20; i++) jumpStep(rider, input, createSession(), { particles: [], rng: createRng(1) }, SIM_DT);
  assert.equal(rider.flipRot, 0);
 });

 it('names: flips alone, doubles, and combined with the spin', () => {
  assert.equal(trickName(1, 0), 'Front flip');
  assert.equal(trickName(-1, 0), 'Backflip');
  assert.equal(trickName(2, 0), 'Double front flip');
  assert.equal(trickName(-2, 0), 'Double backflip');
  assert.equal(trickName(-3, 0), 'Triple backflip');
  assert.equal(trickName(4, 0), 'Quad front flip');
  assert.equal(trickName(5, 0), '5x front flip');
  assert.equal(trickName(-1, 360), 'Backflip 360');
  assert.equal(trickName(1, 180), 'Front flip 180');
  assert.equal(trickName(-2, 540), 'Double backflip 540');
  assert.equal(trickName(0, 360), '', 'a plain spin keeps its own name');
 });

 it('a flip with a spin scores both and reports the spin degrees', () => {
  const flipOnly = landWith(FULL_TURN, 0);
  const combo = landWith(FULL_TURN, FULL_TURN);
  const get = (r) => r.session.events.find((e) => e.type === 'score');
  assert.equal(get(combo).degrees, 360);
  assert.equal(get(flipOnly).degrees, 0);
  assert.equal(get(combo).points - get(flipOnly).points, 80, 'a 360 is worth 2 x 40');
 });

 it('flip 0 scores exactly the air score it always did', () => {
  const { rider, session, events } = landWith(0, 2 * Math.PI);
  assert.equal(rider.crashTimer, 0);
  assert.ok(!events.includes('flip'));
  const score = session.events.find((e) => e.type === 'score');
  assert.equal(score.points, Math.round(rider.airTime * 60 + 20 + 360 / 180 * 40), 'air time, kicker bonus and the spin');
 });
});
