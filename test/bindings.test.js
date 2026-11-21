// The bindings table (src/input/bindings.js) is the one source of the controls: the keys input.js reacts to and the
// swipe distance it uses are the table's, so the Controls screen's help cannot drift from the code.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { SWIPE_PX } from '../src/core/config.js';

// The table, the keys and the swipe go through the façade (state().bindings) and the page's real event handlers.
const g = await load();
const BINDINGS = g.state().bindings;
const bindingsFor = (device) => BINDINGS.filter((b) => b.device === device);
const binding = (device, action) => BINDINGS.find((b) => b.device === device && b.action === action);
const down = (px, py, id = 1) => g.el('c').fire('pointerdown', { pointerId: id, clientX: px, clientY: py });
const move = (px, py) => g.el('c').fire('pointermove', { pointerId: 1, clientX: px, clientY: py });

// Keys that make the game do something: pressed on a fresh input, the key turns, brakes or jumps.
function reactsTo(key) {
 g.resetInput();
 g.fire('keydown', { key });
 const i = g.state().input;
 const reacts = i.left + i.right + i.brake + i.jump + i.lookBack > 0;
 g.fire('keyup', { key });
 g.resetInput();
 return reacts;
}

describe('bindings table', () => {
 it('is frozen, deeply (the façade hands out the table itself)', () => {
  assert.ok(Object.isFrozen(BINDINGS));
  assert.ok(BINDINGS.every((b) => Object.isFrozen(b) && (!b.keys || Object.isFrozen(b.keys))));
 });

 it('has a touch and a keyboard row for steer, jump, brake and spin; every row has a label', () => {
  for (const device of ['touch', 'keyboard']) {
   const actions = bindingsFor(device).map((b) => b.action);
   for (const a of ['steer-left', 'steer-right', 'jump', 'brake', 'spin-left', 'spin-right', 'look-back']) {
    assert.ok(actions.includes(a), device + ' has ' + a);
   }
  }
  assert.ok(BINDINGS.every((b) => typeof b.label === 'string' && b.label.length > 0));
 });

 it('the keys the game reacts to are exactly the table\'s slot keys', () => {
  const tableKeys = new Set(BINDINGS.filter((b) => b.slot).flatMap((b) => b.keys));
  const candidates = [
   ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split(''),
   'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Shift', 'Tab', 'Backspace',
  ];
  assert.deepEqual(new Set(candidates.filter(reactsTo)), tableKeys);
 });

 it('the combined rows (spin in the air) use keys that steer', () => {
  for (const b of bindingsFor('keyboard').filter((r) => r.slot === null)) {
   const steer = binding('keyboard', b.action.replace('spin', 'steer'));
   assert.deepEqual(b.keys, steer.keys, b.action);
  }
 });

 it('each key does its row\'s job while held and stops on release', () => {
  const field = { L: 'left', R: 'right', B: 'brake', J: 'jump', K: 'lookBack' };
  for (const row of BINDINGS.filter((b) => b.slot && b.slot !== 'J')) {
   for (const key of row.keys) {
    g.resetInput();
    g.fire('keydown', { key });
    assert.equal(g.state().input[field[row.slot]], 1, key);
    g.fire('keyup', { key });
    assert.equal(g.state().input[field[row.slot]], 0, key);
   }
  }
  for (const key of binding('keyboard', 'jump').keys) {
   g.resetInput();
   g.fire('keydown', { key });
   assert.equal(g.state().input.jump, 1, key);
  }
  g.resetInput();
 });

 it('the touch brake row\'s distance is the config\'s SWIPE_PX, and a finger brakes just past it', () => {
  const swipe = binding('touch', 'brake').minPx;
  assert.equal(swipe, SWIPE_PX);
  g.resetInput();
  down(100, 100);
  move(100, 100 + swipe);
  assert.equal(g.state().input.brake, 0, 'exactly the distance does not brake');
  move(100, 100 + swipe + 1);
  assert.equal(g.state().input.brake, 1);
  g.el('c').fire('pointerup', { pointerId: 1 });
 });

 it('a finger swiped up past the look-back distance sets lookBack while it stays down, and does not steer', () => {
  const swipe = binding('touch', 'look-back').minPx;
  assert.ok(swipe > SWIPE_PX, 'further than the brake swipe');
  g.resetInput();
  down(100, 500);
  move(100, 500 - swipe);
  assert.equal(g.state().input.lookBack, 0, 'exactly the distance does not look back');
  move(100, 500 - swipe - 1);
  const held = g.state().input;
  assert.deepEqual([held.lookBack, held.left, held.right, held.brake], [1, 0, 0, 0],
   'looks back without steering or braking');
  down(700, 500, 2);
  const both = g.state().input;
  assert.deepEqual([both.lookBack, both.right, both.left, both.jump], [1, 1, 0, 0],
   'another finger steers while looking back, and the two are not a jump');
  g.el('c').fire('pointerup', { pointerId: 2 });
  move(100, 500 - 5);
  assert.equal(g.state().input.lookBack, 0, 'sliding back down lets go');
  move(100, 500 - swipe - 1);
  assert.equal(g.state().input.lookBack, 1);
  g.el('c').fire('pointerup', { pointerId: 1 });
  assert.equal(g.state().input.lookBack, 0, 'lifting the finger lets go');
  g.resetInput();
 });

 it('swiping down never looks back, and swiping up never brakes', () => {
  g.resetInput();
  down(100, 300);
  move(100, 300 + 200);
  assert.deepEqual([g.state().input.lookBack, g.state().input.brake], [0, 1]);
  move(100, 300 - 200);
  assert.deepEqual([g.state().input.lookBack, g.state().input.brake], [1, 0]);
  g.el('c').fire('pointerup', { pointerId: 1 });
  g.resetInput();
 });

 it('lookBack is 0 for a plain ride: no control touched, and a held look-back key does not touch the others', () => {
  g.resetInput();
  assert.equal(g.state().input.lookBack, 0);
  g.fire('keydown', { key: 'b' });
  const i = g.state().input;
  assert.deepEqual([i.lookBack, i.left, i.right, i.brake, i.jump], [1, 0, 0, 0, 0]);
  g.fire('keyup', { key: 'b' });
  assert.equal(g.state().input.lookBack, 0);
 });

});
