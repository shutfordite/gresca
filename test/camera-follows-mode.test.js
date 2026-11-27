// @areas view
// CV2: the camera frames the rider with the chosen mode (CAM_MODES), eases between modes and leaves mode A as it was.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { CAM_MODES } from '../src/core/config.js';

const DT = 1 / 60; // s per frame
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// A rider at speed on the empty practice stretch, the camera settled for a second (60 frames), in the mode (id).
async function ridden(id, opts = {}) {
 const h = await load(opts);
 if (id) h.game.setCameraMode(id);
 h.place({ s: 500, vx: 0, vy: 8 });
 h.sim(1);
 h.frames(60, DT);
 return h;
}

describe('mode A is the camera as it was', () => {
 it('gives the same camera numbers as before the change (captured before the camera followed modes)', async () => {
  const h = await load();
  h.place({ s: 500, vx: 0, vy: 8 });
  h.sim(1);
  h.frames(30, DT);
  const c = h.state().camera;
  // the tolerance is only for the rotated-map runs, which pass the numbers through a rotation
  const TOL = 1e-6;
  near(c.heading, 1.5706425099534858, TOL, 'heading');
  near(c.height, 2584.7587344788876, TOL, 'height');
  near(c.x, 597.7712975771643, TOL, 'x');
  near(c.y, 490.77145411553727, TOL, 'y');
  near(c.focalPx, 396, TOL, 'focalPx');
  near(c.horizonPx, 73.92, TOL, 'horizonPx');
  near(c.pitchPx, 173.46064741043995, TOL, 'pitchPx');
  near(c.tilt, 0.4380319379051514, TOL, 'tilt');
  near(c.slope, 0.22196187512797913, TOL, 'slope');
 });
});

describe('the camera follows the mode', () => {
 for (const mode of CAM_MODES) {
  it(`settles on mode ${mode.id}: back, field of view, focal length, horizon, rise`, async () => {
   const h = await ridden(mode.id);
   const c = h.state().camera;
   const r = h.state();
   const renderH = c.renderH;
   assert.equal(c.back, mode.back);
   assert.equal(c.fov, mode.fov);
   near(c.focalPx, renderH * mode.focalFrac, 1e-9, 'focal');
   near(c.horizonPx, renderH * mode.horizonFrac, 1e-9, 'horizon');
   near(Math.hypot(c.x - r.x, c.y - r.y), mode.back, 0.05, 'metres behind the rider (the rider is drawn a step on)');
   assert.ok(c.height - h.world.height(r.x, r.y) >= mode.height - 0.5, 'at least the mode height over the rider');
  });
 }

 it('starts in the saved mode with no ease from A', async () => {
  const h = await load({ store: { 'gresca-cam': 'C' } });
  assert.equal(h.state().camera.back, 20);
  h.start();
  h.frames(1, DT);
  assert.equal(h.state().camera.back, 20);
  assert.equal(h.state().camera.fov, 0.86);
 });

 it('eases to a new mode over about 0.4 s, with no snap', async () => {
  const h = await ridden('A');
  h.game.setCameraMode('B');
  const backs = [];
  for (let i = 0; i < 90; i++) {
   h.frames(1, DT);
   backs.push(h.state().camera.back);
  }
  assert.ok(backs[0] > 10 && backs[0] < 11.5, `the first frame moves a little: ${backs[0]}`);
  for (let i = 1; i < backs.length; i++) assert.ok(backs[i] >= backs[i - 1], 'monotonic');
  assert.ok(backs[24] > 13.8 && backs[24] < 14, `about 0.4 s in: ${backs[24]}`);
  assert.equal(backs[89], 14, 'arrives exactly');
  for (let i = 1; i < backs.length; i++) assert.ok(backs[i] - backs[i - 1] < 1.3, 'no jump between frames');
 });

 it('does not ease while paused (dt 0)', async () => {
  const h = await ridden('A');
  h.game.setCameraMode('C');
  h.frames(5, 0);
  assert.equal(h.state().camera.back, 10);
 });

 it('goes round A, B, C and back to A, ending where A was', async () => {
  const h = await ridden('A');
  const before = h.state().camera.back;
  for (let i = 0; i < 3; i++) {
   h.game.cycleCamera();
   h.frames(60, DT);
  }
  assert.equal(h.state().cameraMode, 'A');
  assert.equal(h.state().camera.back, before);
  assert.equal(h.state().camera.fov, 1.15);
 });

 it('keeps looking back working in every mode: the view turns round and comes home', async () => {
  for (const mode of CAM_MODES) {
   const h = await ridden(mode.id);
   const home = h.state().camera.heading;
   h.input({ lookBack: 1 });
   h.frames(200, DT);
   assert.equal(h.state().camera.look, 1, mode.id + ' looks back');
   h.input({ lookBack: 0 });
   h.frames(200, DT);
   assert.equal(h.state().camera.look, 0, mode.id + ' comes home');
   assert.ok(Math.abs(Math.sin(h.state().camera.heading - home)) < 0.2, mode.id + ' faces down the slope again');
  }
 });

 it('keeps slope follow working in every mode: the view tilts more on a steeper slope', async () => {
  for (const mode of CAM_MODES) {
   const h = await ridden(mode.id);
   const t = (s) => h.debug.cameraTilt(s, mode.height, 0);
   assert.ok(t(0.3) > t(0.1), mode.id);
   assert.ok(Math.abs(t(0) - 0) < 1e-12, mode.id + ' level ground does not tilt');
  }
 });
});
