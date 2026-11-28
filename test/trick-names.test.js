// @areas ui
// Trick names (ui/trick-names.js) in the score popup, through the façade: a landing with the flip rotation and spin
// set shows the name. The names test moved here from flip.test.js (it called trickName directly; tests may not import
// ui/, so each name is read from the popup), with the same names and cases. Deterministic: fixed dt.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();
const FULL_TURN = 2 * Math.PI; // rad
const GRAVITY = 15; // m/s², JUMP_GRAVITY
const PLAIN_AIR = 0.8; // s of air for a jump with no flip

// Flies a jump with `turns` whole flip rotations (+ front, - back) and `spinDeg` of spin already turned, lands clean,
// and returns the popup text without its points. K2: the flight is over the real snow, so the 3.6 to 4.5 s of air a
// held quad or 5x flip needs (26 to 37 m above the slope) lands at 26 to 33 m/s into it, a crash; holding the flip is
// flip.test.js's, so here the rotations are turned before a plain air and only the name is read.
function popupAfter(turns, spinDeg = 0) {
 g.place({ vy: 12 });
 g.set({
  airTime: 0, z: 0.01, vz: GRAVITY * PLAIN_AIR / 2, score: 0, fromKicker: true, rotation: spinDeg * Math.PI / 180,
  flipRot: turns * FULL_TURN, popup: { t: 0, text: '' },
 });
 for (let n = 0; (g.state().z > 0 || g.state().vz > 0) && n < 3000; n++) g.sim(1 / 120);
 assert.equal(g.state().crashes, 0, 'a clean landing');
 return g.state().popup.text.replace(/^\+\d+p /, '');
}

describe('the score popup names the trick', () => {
 it('names: flips alone, doubles, and combined with the spin', () => {
  assert.equal(popupAfter(1), 'Front flip');
  assert.equal(popupAfter(-1), 'Backflip');
  assert.equal(popupAfter(2), 'Double front flip');
  assert.equal(popupAfter(-2), 'Double backflip');
  assert.equal(popupAfter(-3), 'Triple backflip');
  assert.equal(popupAfter(4), 'Quad front flip');
  assert.equal(popupAfter(5), '5x front flip');
  assert.equal(popupAfter(-1, 360), 'Backflip 360');
  assert.equal(popupAfter(1, 180), 'Front flip 180');
  assert.equal(popupAfter(-2, 540), 'Double backflip 540');
 });

 it('a plain air and a plain spin keep their own names, and the popup shows the points', () => {
  assert.equal(popupAfter(0), 'Air');
  assert.equal(popupAfter(0, 360), '360 Air');
  assert.match(g.state().popup.text, /^\+\d+p 360 Air$/);
 });
});
