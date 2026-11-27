// @areas view
// The view exposes the rider's screen box in CSS px (what a tap on the rider has to hit; input pads it).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const WIDTH = 390; // CSS px, the harness canvas
const MIN_TOUCH_PX = 64; // CSS px, the touch minimum input pads the box to

async function ready() {
 const h = await load();
 h.place({ s: 500, vx: 0, vy: 6 });
 h.frames(10);
 return h;
}

describe('the rider box', () => {
 it('is at the bottom centre of the screen, a person-sized box of CSS px', async () => {
  const h = await ready();
  const box = h.debug.riderBox();
  assert.ok(Math.abs(box.x + box.w / 2 - WIDTH / 2) < 1e-6, 'centred');
  assert.ok(box.w > 5 && box.h > box.w, `${box.w} x ${box.h}`);
  assert.ok(box.y > 844 * 0.4 && box.y + box.h < 844, 'in the lower part of the screen');
  assert.ok(box.w < MIN_TOUCH_PX, 'the drawn rider is smaller than the touch minimum');
 });

 it('follows the camera mode: the rider is further away, so smaller, in B', async () => {
  const h = await ready();
  const before = h.debug.riderBox();
  h.game.setCameraMode('B');
  h.frames(60);
  assert.ok(h.debug.riderBox().h < before.h);
 });
});
