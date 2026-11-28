// @areas sim
// K2: flight and landing over the snow. The rider flies in world height, leaves the snow where it falls away faster
// than the rider can follow (a lip, a sharp roll: no kicker needed), and lands where the flight meets the snow, with an
// impact that is the speed into the snow's surface: matching the landing slope is soft from any height, the flat
// bottom from the same height is a crash, and a bigger kicker at the same speed throws further. Measured on synthetic
// profiles made here (sim/step.js called directly, fixed dt), so the test slope's relief and K1's park play no part.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SIM_DT } from '../src/core/config.js';
import { createRng } from '../src/core/rng.js';
import { NO_TREES } from '../src/world/build.js';
import { Terrain } from '../src/world/terrain.js';
import { polylineCourseFromWorld } from '../src/world/polyline-course.js';
import { createRider, createSession } from '../src/sim/state.js';
import { step } from '../src/sim/step.js';
import { createSpray } from '../src/sim/particles.js';
import { LANDING } from '../src/sim/tuning.js';

const NX = 30;        // cells (1 m) across: the profiles run along +y, the same at every x
const X = 15;         // m, the rider's line
const BASE = 600;     // m, altitude of the profile's 0
const idle = { left: 0, right: 0, brake: 0, jump: 0, steer: 0, jumpHeld: false, jumpPressed: 0, flip: 0, spin: 0 };

// A world whose snow is BASE + profile(y) (m) for y in 0..ny m, with a straight course down +y and no kickers.
function world(profile, ny) {
 const data = new Float64Array(NX * ny);
 for (let y = 0; y < ny; y++) for (let x = 0; x < NX; x++) data[y * NX + x] = BASE + profile(y);
 const terrain = Terrain.create({ base: Terrain.grid(data, NX, ny, 1), groomed: () => 1 });
 const course = polylineCourseFromWorld(Float64Array.of(X, 0, X, ny - 1), { width: 20, terrain });
 return { terrain, trees: NO_TREES, course };
}

// Rides w from y0 (m) at speed (m/s) down +y for seconds (s) with no input, calling each(rider, terrain) after every
// step. Returns {rider, events (with the rider's y at each), takeoffY (m, first above 5 cm, or null)}.
function ride(w, y0, speed, seconds, each = () => {}) {
 const rider = createRider();
 Object.assign(rider, { x: X, y: y0, heading: Math.PI / 2, vy: speed });
 const session = createSession();
 session.phase = 'run';
 const state = { rider, session, spray: createSpray(createRng(1)), gradient: { gx: 0, gy: 0 } };
 const events = [];
 let takeoffY = null;
 for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
  for (const e of step(state, { ...idle }, w, SIM_DT)) events.push({ ...e, y: rider.y });
  if (takeoffY === null && rider.z > 0.05) takeoffY = rider.y;
  each(rider, w.terrain);
 }
 return { rider, events, takeoffY };
}

const landing = (r) => r.events.find((e) => e.type === 'land');
const crashed = (r) => r.events.some((e) => e.type === 'crash');

// A deck at 0 until LIP, then a cliff that curves away (-CLIFF x², steeper than any flight here) to a floor (m).
const LIP = 20;       // m of y
const CLIFF = 0.15;   // 1/m
const deckAndDrop = (floor) => (y) => (y <= LIP ? 0 : Math.max(floor, -CLIFF * (y - LIP) ** 2));

describe('K2 flight over the snow', () => {
 // Over a deep gap first, recording the flight (m of altitude at each y); then the same deck with a landing shaped
 // for that flight: a straight slope tangent to it where it has dropped DROP m, LOWER m under it, its knuckle
 // KNUCKLE m before the tangent point and a 45-degree back face down to the gap. The flat bottom is the same deck with
 // its floor at the height where the shaped landing was met.
 const SPEED = 24;    // m/s on the deck
 const DROP = 20;     // m below the lip, where the landing is tangent to the flight
 const LOWER = 1;     // m, the landing under the flight at the tangent point
 const KNUCKLE = 2;   // m of y before the tangent point
 const NY = 130;      // m of profile
 const flown = []; // [y (m), altitude above BASE (m)] after every step
 ride(world(deckAndDrop(-60), NY), 8, SPEED, 3, (r, t) => flown.push([r.y, t.height(r.x, r.y) - BASE + r.z]));
 const at = (y) => { // m, the flight's altitude at y (m), between the steps either side
  const i = flown.findIndex((p) => p[0] >= y);
  const [y0, a0] = flown[i - 1];
  const [y1, a1] = flown[i];
  return a0 + (a1 - a0) * (y - y0) / (y1 - y0);
 };
 const yt = Math.ceil(flown.find((p) => p[1] < -DROP)[0]); // m of y where the landing is tangent
 const slope = at(yt + 0.5) - at(yt - 0.5); // m/m, the flight's slope there
 const line = (y) => at(yt) - LOWER + slope * (y - yt);
 const yk = yt - KNUCKLE;
 const shaped = (y) => Math.max(deckAndDrop(-60)(y), y >= yk ? line(y) : line(yk) - (yk - y));

 it('landing on a slope that matches the flight is soft, from 20 m up', () => {
  const r = ride(world(shaped, NY), 8, SPEED, 3);
  const land = landing(r);
  assert.ok(land, 'it lands');
  assert.ok(at(land.y) < -DROP, 'more than 20 m below the lip');
  assert.ok(land.speed < LANDING.SOFT_IMPACT, `impact ${land.speed.toFixed(2)} m/s, soft below ${LANDING.SOFT_IMPACT}`);
  assert.ok(!crashed(r));
  assert.ok(Math.hypot(r.rider.vx, r.rider.vy) > SPEED, 'rides away faster than it took off, down the landing');
 });

 it('the flat bottom from the same height is a crash', () => {
  const matched = landing(ride(world(shaped, NY), 8, SPEED, 3));
  const floor = shaped(matched.y);
  const r = ride(world(deckAndDrop(floor), NY), 8, SPEED, 3);
  const land = landing(r);
  assert.ok(land.speed > LANDING.CRASH_IMPACT, `impact ${land.speed.toFixed(2)} m/s`);
  assert.ok(crashed(r), 'too hard: a crash');
  assert.equal(r.events.find((e) => e.type === 'crash').cause, 'landing');
 });

 it('a bigger kicker at the same speed throws the rider further', () => {
  // kickers on a 15-degree slope: a rise of height m over length m to the lip at y 60, then 3 m back down
  const kicker = (height, length) => (y) => {
   const lip = 60;
   let h = -0.27 * y;
   if (y > lip - length && y <= lip) h += height * ((y - (lip - length)) / length) ** 2;
   else if (y > lip && y < lip + 3) h += height * (1 - (y - lip) / 3);
   return h;
  };
  const jump = (height, length) => {
   const r = ride(world(kicker(height, length), 160), 30, 14, 4);
   return landing(r).y - r.takeoffY;
  };
  const small = jump(0.8, 6); // m, about 15 degrees above the slope at the lip
  const big = jump(2.5, 8);   // m, about 32 degrees
  assert.ok(small > 3, `small ${small.toFixed(1)} m`);
  assert.ok(big > small * 1.5, `big ${big.toFixed(1)} m against small ${small.toFixed(1)} m`);
 });

 it('riding over a convex roll fast lifts off without a kicker; slowly it holds the snow', () => {
  // flat to y 40, then an arc of radius 10 m into a 31-degree slope: off the snow above sqrt(10 * (15 + HOLD)) m/s
  assert.ok(25 > Math.sqrt(10 * (15 + LANDING.HOLD)) && 10 < Math.sqrt(10 * (15 + LANDING.HOLD)), 'speeds either side');
  const R = 10;
  const angle = Math.atan(0.6);
  const end = R * Math.sin(angle);
  const roll = (y) => {
   const x = y - 40;
   if (x <= 0) return 0;
   if (x < end) return -(R - Math.sqrt(R * R - x * x));
   return -(R - R * Math.cos(angle)) - 0.6 * (x - end);
  };
  const w = world(roll, 120);
  const fast = ride(w, 10, 25, 3.5);
  assert.ok(fast.takeoffY > 40 && fast.takeoffY < 40 + end, `lifts off on the roll (y ${fast.takeoffY})`);
  assert.equal(fast.rider.fromKicker, false, 'no kicker');
  assert.ok(landing(fast), 'and lands');
  const slow = ride(w, 10, 10, 2.5);
  assert.equal(slow.takeoffY, null, 'a slow rider stays on the snow');
 });
});
