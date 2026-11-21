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
const down = (px, py) => g.el('c').fire('pointerdown', { pointerId: 1, clientX: px, clientY: py });
const move = (px, py) => g.el('c').fire('pointermove', { pointerId: 1, clientX: px, clientY: py });

// Keys that make the game do something: pressed on a fresh input, the key turns, brakes or jumps.
function reactsTo(key) {
 g.resetInput();
 g.fire('keydown', { key });
 const i = g.state().input;
 const reacts = i.left + i.right + i.brake + i.jump > 0;
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
   for (const a of ['steer-left', 'steer-right', 'jump', 'brake', 'spin-left', 'spin-right']) {
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
  const field = { L: 'left', R: 'right', B: 'brake', J: 'jump' };
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

});
