// Flip input and air hints (S1/F3): in the air a drag up is a front flip, a drag down a backflip, Up/W and Down/S the
// same on keys; on the ground flip is 0 and the same drag brakes or looks back. The hints teach it for 3 jumps.
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
const finger = (g, type, y, id = 1) => g.el('c').fire(type, { pointerId: id, clientX: 100, clientY: y });
const hintsShown = (g) => !g.el('air-hints').hidden;
const saved = (g) => g.run("localStorage.getItem('gresca-hints')");

describe('flip input', () => {
 it('a drag up in the air is a front flip, analog with the distance, and holding keeps it', async () => {
  const g = await onSnow();
  jumpUp(g);
  finger(g, 'pointerdown', 500);
  finger(g, 'pointermove', 500 - DEAD);
  assert.equal(flip(g), 0, 'inside the dead zone');
  finger(g, 'pointermove', 500 - (DEAD + FULL) / 2);
  assert.ok(Math.abs(flip(g) - 0.5) < 1e-9, 'half way is half the rate: ' + flip(g));
  finger(g, 'pointermove', 500 - 3 * FULL);
  g.step(0.05);
  assert.equal(flip(g), 1, 'capped at 1, and kept while the finger is held and the rider flies');
  assert.equal(g.state().input.lookBack, 0, 'swipe up in the air does not look back');
  finger(g, 'pointerup', 500 - 3 * FULL);
  assert.equal(flip(g), 0, 'lifting the finger stops it');
 });

 it('a drag down in the air is a backflip and does not brake', async () => {
  const g = await onSnow();
  jumpUp(g);
  finger(g, 'pointerdown', 300);
  finger(g, 'pointermove', 300 + 3 * FULL);
  assert.deepEqual([flip(g), g.state().input.brake], [-1, 0]);
 });

 it('flips combine with the spin', async () => {
  const g = await onSnow();
  jumpUp(g);
  finger(g, 'pointerdown', 500);
  finger(g, 'pointermove', 500 - FULL);
  const i = g.state().input;
  assert.deepEqual([i.flip, i.left, i.right], [1, 1, 0]);
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
  assert.ok(row('touch', 'flip-front').fullPx > SWIPE_PX);
 });
});
