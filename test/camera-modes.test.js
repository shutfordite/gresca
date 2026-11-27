// @areas shared
// The camera modes (CV1): A classic, B chase, C high; cycled by the game, saved under gresca-cam, picked by ?cam=.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { CAM_MODES, CAM_BACK, CAM_HEIGHT, FOV, HORIZON_FRAC } from '../src/core/config.js';

const saved = (h) => h.run("localStorage.getItem('gresca-cam')");

describe('camera modes as data', () => {
 it('lists A, B and C with the spike numbers, frozen', () => {
  assert.deepEqual(CAM_MODES.map((m) => m.id), ['A', 'B', 'C']);
  const numbers = CAM_MODES.map((m) => [m.back, m.height, m.fov, m.focalFrac]);
  assert.deepEqual(numbers, [[10, 7.6, 1.15, 0.75], [14, 2.5, 1.43, 0.6], [20, 3, 0.86, 1.0]]);
  assert.ok(Object.isFrozen(CAM_MODES) && CAM_MODES.every((m) => Object.isFrozen(m)));
 });

 it('keeps the old constants at mode A', () => {
  const a = CAM_MODES[0];
  assert.deepEqual([CAM_BACK, CAM_HEIGHT, FOV, HORIZON_FRAC], [a.back, a.height, a.fov, a.horizonFrac]);
  assert.deepEqual([CAM_BACK, CAM_HEIGHT, FOV, HORIZON_FRAC], [10, 7.6, 1.15, 0.14]);
 });
});

describe('camera mode in the game', () => {
 it('starts on A and cycles A, B, C, A, saving each under gresca-cam', async () => {
  const h = await load();
  assert.equal(h.state().cameraMode, 'A');
  assert.equal(saved(h), null);
  const seen = [];
  for (let i = 0; i < 4; i++) {
   seen.push(h.game.cycleCamera());
   assert.equal(h.state().cameraMode, seen[i]);
   assert.equal(saved(h), seen[i]);
  }
  assert.deepEqual(seen, ['B', 'C', 'A', 'B']);
 });

 it('setCameraMode picks by id, throws on an unknown id, and set() writes the field', async () => {
  const h = await load();
  assert.equal(h.game.setCameraMode('C'), 'C');
  assert.equal(saved(h), 'C');
  assert.throws(() => h.game.setCameraMode('Z'), /unknown camera mode/);
  assert.equal(h.state().cameraMode, 'C');
  h.set({ cameraMode: 'B' });
  assert.equal(saved(h), 'B');
 });

 it('restores the saved mode, and falls back to A on an unknown value', async () => {
  assert.equal((await load({ store: { 'gresca-cam': 'C' } })).state().cameraMode, 'C');
  assert.equal((await load({ store: { 'gresca-cam': 'nope' } })).state().cameraMode, 'A');
 });

 it('survives a storage that throws: still cycles for the visit', async () => {
  const h = await load({ blockedStorage: true });
  assert.equal(h.state().cameraMode, 'A');
  assert.equal(h.game.cycleCamera(), 'B');
  assert.equal(h.state().cameraMode, 'B');
 });

 it('?cam= picks a mode over the saved one, in any case; an unknown id is ignored', async () => {
  assert.equal((await load({ cam: 'B' })).state().cameraMode, 'B');
  assert.equal((await load({ cam: 'c', store: { 'gresca-cam': 'B' } })).state().cameraMode, 'C');
  assert.equal((await load({ cam: 'x', store: { 'gresca-cam': 'B' } })).state().cameraMode, 'B');
 });

 it('leaves the rig and stance keys alone', async () => {
  const h = await load({ store: { 'gresca-rig': 'ski', 'gresca-stance': 'goofy' } });
  h.game.cycleCamera();
  assert.equal(h.run("localStorage.getItem('gresca-rig')"), 'ski');
  assert.equal(h.state().stance, 'goofy');
 });
});
