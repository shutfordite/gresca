// @areas input ui view
// CV3: a tap on the rider switches the camera view; a touch that starts on the rider does not steer; the C key too.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

// The rows of the controls table, read through the façade.
const row = async (device, action) => {
 const bindings = (await load()).state().bindings;
 return bindings.find((b) => b.device === device && b.action === action);
};
const TAP = await row('touch', 'camera');
const RIDER_TAP_MAX_MS = TAP.maxMs;
const RIDER_TAP_MAX_PX = TAP.maxPx;
const RIDER_BOX_MIN_PX = TAP.minBoxPx;
const finger = (h) => h.el('c');
const touch = (id, x, y, t) => ({ pointerId: id, clientX: x, clientY: y, timeStamp: t });
const down = (h, x, y, t = 0, id = 1) => finger(h).fire('pointerdown', touch(id, x, y, t));
const move = (h, x, y, t = 0, id = 1) => finger(h).fire('pointermove', touch(id, x, y, t));
const up = (h, t = 0, id = 1) => finger(h).fire('pointerup', { pointerId: id, timeStamp: t });
const steer = (h) => { const i = h.state().input; return [i.left, i.right, i.brake, i.lookBack]; };

// A game riding on the test slope with the camera settled, and where the rider is on screen (CSS px, its centre).
async function ready(opts) {
 const h = await load(opts);
 h.place({ s: 500, vx: 0, vy: 6 });
 h.frames(10);
 const box = h.debug.riderBox();
 return { h, cx: box.x + box.w / 2, cy: box.y + box.h / 2, box };
}

describe('tap the rider', () => {
 it('a quick tap on the rider cycles A, B, C, A and does not steer', async () => {
  const { h, cx, cy } = await ready();
  const seen = [];
  for (let i = 0; i < 4; i++) {
   down(h, cx, cy, 1000 * i);
   assert.deepEqual(steer(h), [0, 0, 0, 0], 'a finger on the rider does not steer');
   up(h, 1000 * i + 100);
   seen.push(h.state().cameraMode);
  }
  assert.deepEqual(seen, ['B', 'C', 'A', 'B']);
 });

 it('the padded box counts: a touch 30 px from the centre is on the rider, 40 px is not', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx + 30, cy, 0);
  up(h, 50);
  assert.equal(h.state().cameraMode, 'B');
  down(h, cx + 40, cy, 100);
  assert.deepEqual(steer(h), [0, 1, 0, 0], 'beyond the padded box it steers');
  up(h, 150);
  assert.equal(h.state().cameraMode, 'B');
 });

 it('shows the new view\'s name in the label, and the label is not showing before', async () => {
  const { h, cx, cy } = await ready();
  assert.ok(!h.el('cam-label').classList.contains('show'));
  down(h, cx, cy, 0);
  up(h, 80);
  assert.equal(h.el('cam-label').textContent, 'Chase cam');
  assert.ok(h.el('cam-label').classList.contains('show'));
  down(h, cx, cy, 500);
  up(h, 580);
  assert.equal(h.el('cam-label').textContent, 'High cam');
 });

 it('a hold on the rider still does not steer, and lifting it does not cycle', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0);
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
  move(h, cx + 3, cy + 2, 400); // a little jitter
  assert.deepEqual(steer(h), [0, 0, 0, 0], 'still not steering after 400 ms');
  up(h, RIDER_TAP_MAX_MS + 1);
  assert.equal(h.state().cameraMode, 'A', 'a long press is not a tap');
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
 });

 it('lifts within 250 ms count, 251 ms do not', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 1000);
  up(h, 1000 + RIDER_TAP_MAX_MS);
  assert.equal(h.state().cameraMode, 'B');
  down(h, cx, cy, 5000);
  up(h, 5000 + RIDER_TAP_MAX_MS + 1);
  assert.equal(h.state().cameraMode, 'B');
 });

 it('a finger that slips under 12 px still taps; 12 px or more is a gesture, not a tap', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0);
  move(h, cx + 8, cy + 8, 50); // 11.3 px
  up(h, 100);
  assert.equal(h.state().cameraMode, 'B');
  down(h, cx, cy, 1000);
  move(h, cx + RIDER_TAP_MAX_PX, cy, 1050);
  up(h, 1100);
  assert.equal(h.state().cameraMode, 'B');
 });

 it('a swipe down that starts on the rider brakes, as a swipe anywhere does, and does not cycle', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0);
  move(h, cx, cy + 20, 50);
  move(h, cx, cy + 60, 100);
  const onRider = steer(h);
  assert.equal(onRider[2], 1, 'brakes');
  up(h, 150);
  assert.equal(h.state().cameraMode, 'A');
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
  // the same swipe on the right half, away from the rider
  down(h, 330, cy, 1000);
  move(h, 330, cy + 60, 1100);
  assert.deepEqual(steer(h).slice(2), onRider.slice(2));
 });

 it('a swipe up that starts on the rider looks back, and does not cycle', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0);
  move(h, cx, cy - 20, 50);
  move(h, cx, cy - 90, 100);
  assert.equal(h.state().input.lookBack, 1, 'looks back');
  up(h, 150);
  assert.equal(h.state().input.lookBack, 0);
  assert.equal(h.state().cameraMode, 'A');
 });

 it('a cancelled touch is never a tap', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0);
  finger(h).fire('pointercancel', { pointerId: 1, timeStamp: 50 });
  assert.equal(h.state().cameraMode, 'A');
 });

 it('with a finger held on the rider, another on a half still steers', async () => {
  const { h, cx, cy } = await ready();
  down(h, cx, cy, 0, 1);
  down(h, 40, cy - 200, 20, 2);
  assert.deepEqual(steer(h), [1, 0, 0, 0]);
  up(h, 100, 2);
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
 });
});

describe('touches elsewhere are unchanged', () => {
 it('a tap away from the rider steers while held and changes nothing when lifted', async () => {
  const { h, cy } = await ready();
  down(h, 60, cy - 250, 0);
  assert.deepEqual(steer(h), [1, 0, 0, 0]);
  up(h, 100);
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
  down(h, 330, cy - 250, 200);
  assert.deepEqual(steer(h), [0, 1, 0, 0]);
  up(h, 300);
  assert.equal(h.state().cameraMode, 'A');
 });

 it('two fingers, one on each half, still jump', async () => {
  const { h, cy } = await ready();
  down(h, 60, cy - 250, 0, 1);
  down(h, 330, cy - 250, 10, 2);
  assert.equal(h.state().input.jump, 1);
  assert.equal(h.state().cameraMode, 'A');
 });

 it('a touch with no timestamp at all (older callers) never taps the rider', async () => {
  const { h, cy } = await ready();
  down(h, 60, cy - 250, undefined);
  up(h, undefined);
  assert.equal(h.state().cameraMode, 'A');
 });
});

describe('the C key', () => {
 it('cycles the camera, once per press, and drives no input', async () => {
  const h = await load();
  h.fire('keydown', { key: 'c' });
  h.fire('keyup', { key: 'c' });
  assert.equal(h.state().cameraMode, 'B');
  h.fire('keydown', { key: 'C' });
  h.fire('keydown', { key: 'C', repeat: true });
  h.fire('keyup', { key: 'C' });
  assert.equal(h.state().cameraMode, 'C', 'a held key does not repeat');
  assert.deepEqual(steer(h), [0, 0, 0, 0]);
 });
});

describe('the table and the Controls screen', () => {
 it('has a touch row for the tap and a keyboard row on c, with the numbers of the rule', async () => {
  const key = await row('keyboard', 'camera');
  assert.equal(TAP.label, 'Change camera: tap the rider');
  assert.equal(TAP.gesture, 'tap-rider');
  assert.deepEqual([RIDER_TAP_MAX_MS, RIDER_TAP_MAX_PX, RIDER_BOX_MIN_PX], [250, 12, 64]);
  assert.deepEqual(key.keys, ['c']);
  assert.equal(key.slot, undefined, 'not part of the InputState');
 });

 it('lists both on the Controls screen', async () => {
  const h = await load();
  const html = h.el('ctl-body').innerHTML;
  assert.ok(html.includes('data-device="touch" data-action="camera"'));
  assert.ok(html.includes('data-device="keyboard" data-action="camera"'));
  assert.ok(html.includes('Change camera: tap the rider'));
 });
});
