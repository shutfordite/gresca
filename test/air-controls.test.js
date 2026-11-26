// Flip input and air hints (S1/F3): in the air a finger on each half dragged up is a front flip, both dragged down a
// backflip, Up/W and Down/S the same on keys; one finger never flips; on the ground flip is 0 and a drag brakes or
// looks back. The hints teach it for 3 jumps.
// All through the façade and the page's real handlers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { SWIPE_PX } from '../src/core/config.js';

const DEAD = SWIPE_PX;      // CSS px of drag before a flip starts (the touch flip rows' minPx)
const FULL = SWIPE_PX * 3.5; // CSS px of drag for the full rate

// A game on a run, still on the snow.
async function onSnow(store) {
 const g = await load({ store });
 g.start();
 return g;
}

// Takes off with the jump request and steps until the rider is in the air.
function jumpUp(g) {
 g.input({ jump: 1 });
 g.step(0.05);
 assert.ok(g.state().z > 0, 'in the air');
}

// Steps until the rider is back on the snow.
function land(g) {
 for (let i = 0; i < 40 && g.state().z > 0; i++) g.step(0.1);
 assert.equal(g.state().z, 0, 'landed');
}

const flip = (g) => g.state().input.flip;
const LEFT_X = 100;  // a finger on the left half (the harness canvas is 390 px wide)
const RIGHT_X = 300; // and one on the right half
const finger = (g, type, y, id = 1, x = LEFT_X) => g.el('c').fire(type, { pointerId: id, clientX: x, clientY: y });
// Both thumbs: the left finger is pointer 1, the right one pointer 2.
const both = (g, type, yLeft, yRight = yLeft) => {
 finger(g, type, yLeft, 1, LEFT_X);
 finger(g, type, yRight, 2, RIGHT_X);
};
const hintsShown = (g) => !g.el('air-hints').hidden;
const saved = (g) => g.run("localStorage.getItem('gresca-hints')");

describe('flip input', () => {
 it('both fingers dragged up in the air are a front flip, analog with the distance, and holding keeps it', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 500);
  both(g, 'pointermove', 500 - DEAD);
  assert.equal(flip(g), 0, 'inside the dead zone');
  both(g, 'pointermove', 500 - (DEAD + FULL) / 2);
  assert.ok(Math.abs(flip(g) - 0.5) < 1e-9, 'half way is half the rate: ' + flip(g));
  both(g, 'pointermove', 500 - 3 * FULL);
  g.step(0.05);
  assert.equal(flip(g), 1, 'capped at 1, and kept while the fingers are held and the rider flies');
  assert.equal(g.state().input.lookBack, 0, 'swipe up in the air does not look back');
  finger(g, 'pointerup', 500 - 3 * FULL, 1, LEFT_X);
  assert.equal(flip(g), 0, 'lifting one finger stops it');
 });

 it('both fingers dragged down in the air are a backflip and do not brake', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 300);
  both(g, 'pointermove', 300 + 3 * FULL);
  assert.deepEqual([flip(g), g.state().input.brake], [-1, 0]);
 });

 it('the rate follows the smaller of the two drags, so both fingers must move', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 500);
  both(g, 'pointermove', 500 - 3 * FULL, 500);
  assert.equal(flip(g), 0, 'right finger still');
  both(g, 'pointermove', 500 - 3 * FULL, 500 - (DEAD + FULL) / 2);
  assert.ok(Math.abs(flip(g) - 0.5) < 1e-9, 'the smaller drag sets the rate: ' + flip(g));
 });

 it('one finger dragged in the air does not flip, whichever way; held still it spins', async () => {
  for (const [x, dir] of [[LEFT_X, -1], [LEFT_X, 1], [RIGHT_X, -1], [RIGHT_X, 1]]) {
   const g = await onSnow();
   jumpUp(g);
   finger(g, 'pointerdown', 500, 1, x);
   finger(g, 'pointermove', 500 + dir * 3 * FULL, 1, x);
   const i = g.state().input;
   assert.equal(flip(g), 0, 'x ' + x + ' dir ' + dir);
   assert.deepEqual([i.left, i.right], x === LEFT_X ? [1, 0] : [0, 1], 'it still spins');
  }
 });

 it('fingers dragged in opposite directions do not flip', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 500);
  both(g, 'pointermove', 500 - 3 * FULL, 500 + 3 * FULL);
  assert.equal(flip(g), 0);
  both(g, 'pointermove', 500 + 3 * FULL, 500 - 3 * FULL);
  assert.equal(flip(g), 0);
 });

 it('two fingers on the same half do not flip', async () => {
  const g = await onSnow();
  jumpUp(g);
  finger(g, 'pointerdown', 500, 1, LEFT_X);
  finger(g, 'pointerdown', 500, 2, LEFT_X + 20);
  finger(g, 'pointermove', 500 - 3 * FULL, 1, LEFT_X);
  finger(g, 'pointermove', 500 - 3 * FULL, 2, LEFT_X + 20);
  assert.equal(flip(g), 0);
 });

 it('while both fingers flip there is no spin and no jump request; one finger held afterwards spins', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 500);
  both(g, 'pointermove', 500 - FULL);
  const i = g.state().input;
  assert.deepEqual([i.flip, i.left, i.right, i.jump], [1, 0, 0, 0]);
  finger(g, 'pointerup', 500 - FULL, 2, RIGHT_X);
  const after = g.state().input;
  assert.deepEqual([after.flip, after.left, after.right], [0, 1, 0], 'left finger held: spin, no flip');
  land(g);
  assert.equal(g.state().input.jump, 0, 'no jump request at landing');
 });

 it('both fingers held still in the air are not a flip', async () => {
  const g = await onSnow();
  jumpUp(g);
  both(g, 'pointerdown', 500);
  assert.equal(flip(g), 0);
 });

 it('on the ground flip is 0, a drag down brakes and a drag up looks back, as before', async () => {
  const g = await onSnow();
  finger(g, 'pointerdown', 300);
  finger(g, 'pointermove', 300 + 3 * FULL);
  assert.deepEqual([flip(g), g.state().input.brake, g.state().input.lookBack], [0, 1, 0]);
  finger(g, 'pointermove', 300 - 3 * FULL);
  assert.deepEqual([flip(g), g.state().input.brake, g.state().input.lookBack], [0, 0, 1]);
  g.fire('keydown', { key: 'ArrowUp' });
  g.fire('keydown', { key: 's' });
  assert.equal(flip(g), 0, 'keys on the ground');
 });

 it('a drag made on the ground does not flip at take-off, and an air drag does not look back at landing', async () => {
  const g = await onSnow();
  finger(g, 'pointerdown', 300);
  finger(g, 'pointermove', 300 + 200); // braking
  jumpUp(g);
  assert.deepEqual([flip(g), g.state().input.brake], [0, 0], 'the brake swipe is not a backflip');
  finger(g, 'pointermove', 300 + 200 - 3 * FULL);
  finger(g, 'pointerdown', 300 + 200, 2, RIGHT_X);
  finger(g, 'pointermove', 300 + 200 - 3 * FULL, 2, RIGHT_X);
  finger(g, 'pointermove', 300 + 200 - 3 * FULL, 1);
  assert.equal(flip(g), 1);
  land(g);
  assert.deepEqual([flip(g), g.state().input.lookBack, g.state().input.brake], [0, 0, 0]);
 });

 it('Up and W flip forward, Down and S back, only in the air', async () => {
  for (const [key, want] of [['ArrowUp', 1], ['w', 1], ['ArrowDown', -1], ['s', -1]]) {
   const g = await onSnow();
   g.input({ jump: 1 });
   g.step(0.05);
   g.fire('keydown', { key });
   assert.equal(flip(g), want, key + ' in the air');
   assert.equal(g.state().input.brake, 0, key + ' does not brake in the air');
   g.fire('keyup', { key });
   assert.equal(flip(g), 0, key + ' released');
   g.fire('keydown', { key });
   land(g);
   assert.equal(flip(g), 0, key + ' held through the landing is not a flip');
  }
 });

 it('Down and S still brake on the ground, B looks back, and Space jumps', async () => {
  const g = await onSnow();
  g.fire('keydown', { key: 's' });
  assert.equal(g.state().input.brake, 1);
  g.fire('keyup', { key: 's' });
  g.fire('keydown', { key: 'b' });
  assert.equal(g.state().input.lookBack, 1);
  g.fire('keydown', { key: ' ' });
  assert.equal(g.state().input.jump, 1);
 });
});

describe('air hints', () => {
 it('are hidden on the ground and show in the air for the first 3 jumps only, saving the count', async () => {
  const g = await onSnow();
  assert.equal(hintsShown(g), false);
  const shown = [];
  for (let jump = 1; jump <= 5; jump++) {
   jumpUp(g);
   shown.push(hintsShown(g));
   land(g);
   assert.equal(hintsShown(g), false, 'hidden after landing ' + jump);
  }
  assert.deepEqual(shown, [true, true, true, false, false]);
  assert.equal(saved(g), '3');
  assert.match(g.el('air-hints').innerHTML, /front flip/);
  assert.match(g.el('air-hints').innerHTML, /backflip/);
  assert.match(g.el('air-hints').innerHTML, /spin/);
 });

 it('continue from the saved profile', async () => {
  const done = await onSnow({ 'gresca-hints': '3' });
  jumpUp(done);
  assert.equal(hintsShown(done), false);
  const two = await onSnow({ 'gresca-hints': '2' });
  jumpUp(two);
  assert.equal(hintsShown(two), true);
  land(two);
  jumpUp(two);
  assert.equal(hintsShown(two), false);
 });
});

describe('Controls screen', () => {
 it('lists the flips, the pause row and the hint arrows', async () => {
  const g = await load();
  const html = g.el('ctl-body').innerHTML;
  for (const device of ['touch', 'keyboard']) {
   for (const action of ['flip-front', 'flip-back']) {
    assert.ok(html.includes('data-device="' + device + '" data-action="' + action + '"'), device + ' ' + action);
   }
  }
  assert.ok(html.includes('data-device="touch" data-action="pause"'));
  assert.match(html, /front flip/);
  assert.match(html, /backflip/);
 });

 it('the flip rows follow the table: keys, and the drag distances against the swipes', async () => {
  const g = await load();
  const row = (device, action) => g.state().bindings.find((b) => b.device === device && b.action === action);
  assert.deepEqual(row('keyboard', 'flip-front').keys, ['ArrowUp', 'w']);
  assert.deepEqual(row('keyboard', 'flip-back').keys, ['ArrowDown', 's']);
  assert.equal(row('touch', 'flip-front').minPx, SWIPE_PX);
  assert.match(row('touch', 'flip-front').label, /both fingers drag up/);
  assert.match(row('touch', 'flip-back').label, /both fingers drag down/);
  assert.ok(row('touch', 'flip-front').fullPx > SWIPE_PX);
 });
});
