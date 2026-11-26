// @areas input ui
// Pause (S1/F4b): the button, the Escape and P keys, the page-hidden auto-pause, the frozen simulation and camera,
// the pause panel with the Controls screen, and Back to menu. All through the façade and the page's handlers.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const FRAME_MS = 1000 / 60;
const STEP_S = 1 / 120;

// A game on a run: the frame loop has seen one frame, so the next raf(ts) has a real dt.
async function running() {
 const g = await load();
 g.el('go').fire('click');
 g.raf(1000);
 return g;
}

// Runs n real frames (60 Hz) from timestamp t; returns the next timestamp.
function frames(g, n, t) {
 let ts = t;
 for (let i = 0; i < n; i++) {
  ts += FRAME_MS;
  g.raf(ts);
 }
 return ts;
}

describe('pause', () => {
 it('the button pauses a run, and Resume continues it', async () => {
  const g = await running();
  assert.equal(g.el('pz').hidden, false);
  assert.equal(g.state().paused, false);
  g.el('pz').fire('click');
  assert.equal(g.state().paused, true);
  assert.equal(g.el('msg').hidden, false);
  assert.equal(g.el('pausep').hidden, false);
  assert.equal(g.el('menu').hidden, true);
  assert.equal(g.el('pz').hidden, true);
  g.el('pr').fire('click');
  assert.equal(g.state().paused, false);
  assert.equal(g.el('msg').hidden, true);
  assert.equal(g.el('pz').hidden, false);
 });

 it('the pause button is hidden outside a run, and the keys do nothing there', async () => {
  const g = await load();
  g.raf(10);
  assert.equal(g.el('pz').hidden, true);
  g.fire('keydown', { key: 'Escape' });
  assert.equal(g.state().paused, false);
  assert.equal(g.el('menu').hidden, false);
 });

 it('Escape and P toggle the pause; held keys are not repeated', async () => {
  const g = await running();
  for (const key of ['Escape', 'p', 'P']) {
   g.fire('keydown', { key });
   assert.equal(g.state().paused, true, key + ' pauses');
   g.fire('keydown', { key, repeat: true });
   assert.equal(g.state().paused, true, key + ' repeat does nothing');
   g.fire('keydown', { key });
   assert.equal(g.state().paused, false, key + ' resumes');
  }
 });

 it('the pause keys are in the table and on the Controls screen', async () => {
  const g = await load();
  const row = g.state().bindings.find((b) => b.device === 'keyboard' && b.action === 'pause');
  assert.deepEqual(row.keys, ['Escape', 'p']);
  const li = g.el('ctl-body').innerHTML.match(/data-device="keyboard" data-action="pause">(.*?)<\/li>/)[1];
  assert.match(li, /Pause/);
  assert.match(li, /<kbd>Esc<\/kbd>/);
  assert.match(li, /<kbd>P<\/kbd>/);
  const touch = g.el('ctl-body').innerHTML.match(/data-device="touch" data-action="pause">(.*?)<\/li>/)[1];
  assert.match(touch, /Tap the pause button/);
 });

 it('a hidden page pauses the run; coming back leaves it paused', async () => {
  const g = await running();
  g.setHidden(true);
  assert.equal(g.state().paused, true);
  g.setHidden(false);
  assert.equal(g.state().paused, true, 'the player resumes');
 });

 it('freezes the rider, the session time, the camera and the spray; resume continues without a burst', async () => {
  const g = await running();
  let ts = frames(g, 60, 1000);
  ts = frames(g, 20, ts);
  g.el('pz').fire('click');
  const frozen = g.state();
  const camera = JSON.stringify(g.state().camera);
  ts = frames(g, 120, ts);
  const later = g.state();
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'time', 'heading', 'score']) assert.equal(later[key], frozen[key], key);
  assert.equal(JSON.stringify(g.state().camera), camera, 'the camera stands still');
  assert.equal(later.particles, frozen.particles, 'the spray stands still');
  assert.ok(frozen.time > 0);
  ts += 5000; // a long pause
  g.raf(ts);
  g.el('pr').fire('click');
  const before = g.state().time;
  g.raf(ts + FRAME_MS);
  const steps = Math.round((g.state().time - before) / STEP_S);
  assert.ok(steps >= 1 && steps <= 3, 'one frame after resume runs ' + steps + ' steps, not a burst');
 });

 it('Controls opens from the pause panel and Back returns to it', async () => {
  const g = await running();
  g.el('pz').fire('click');
  g.el('pc').fire('click');
  assert.equal(g.el('ctl').hidden, false);
  assert.equal(g.el('pausep').hidden, true);
  assert.equal(g.el('menu').hidden, true);
  g.el('cc').fire('click');
  assert.equal(g.el('ctl').hidden, true);
  assert.equal(g.el('pausep').hidden, false);
  assert.equal(g.el('menu').hidden, true);
  assert.equal(g.state().paused, true);
 });

 it('Resume from the Controls screen with Escape closes it and runs', async () => {
  const g = await running();
  g.el('pz').fire('click');
  g.el('pc').fire('click');
  g.fire('keydown', { key: 'Escape' });
  assert.equal(g.state().paused, false);
  assert.equal(g.el('ctl').hidden, true);
  assert.equal(g.el('msg').hidden, true);
 });

 it('Back to menu ends the run without the finish screen, and Drop in starts a fresh one', async () => {
  const g = await running();
  frames(g, 30, 1000);
  g.el('pz').fire('click');
  g.el('pm').fire('click');
  assert.equal(g.state().paused, false);
  assert.equal(g.state().phase, 'ready');
  assert.equal(g.el('msg').hidden, false);
  assert.equal(g.el('menu').hidden, false);
  assert.equal(g.el('pausep').hidden, true);
  assert.equal(g.el('pz').hidden, true);
  assert.equal(g.el('go').textContent, 'Drop in');
  assert.doesNotMatch(g.el('t').textContent, /Finished/);
  g.el('go').fire('click');
  assert.equal(g.state().phase, 'run');
  assert.equal(g.state().time, 0);
  assert.equal(g.el('msg').hidden, true);
 });

 it('pausing lifts held keys so nothing is stuck on resume', async () => {
  const g = await running();
  g.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(g.state().input.left, 1);
  g.el('pz').fire('click');
  assert.equal(g.state().input.left, 0);
 });

 it('a touch on the pause button is not a steer or a jump', async () => {
  const g = await running();
  g.el('pz').fire('pointerdown', { clientX: 100, clientY: 20 });
  assert.equal(g.state().input.left + g.state().input.right, 0);
 });
});
