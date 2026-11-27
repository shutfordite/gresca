// @areas shared
// Idle frames (G3): the loop draws only when something can change. Not while paused, the page is hidden or the
// Controls screen is open; the start screen only while it settles after a change; resuming never catches up.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

// A game on the browser clock, a narrow canvas to keep the draws quick.
async function game() {
 const g = await load();
 g.el('c').clientWidth = 40;
 let clock = 1000; // ms
 g.tick = (n, ms = 16) => { for (let i = 0; i < n; i++) { clock += ms; g.raf(clock); } };
 g.tick(5); // the start screen settles
 return g;
}
const draws = (g) => g.game.draws();

describe('idle frames', () => {
 it('the start screen stops drawing once it has settled', async () => {
  const g = await game();
  g.tick(200); // 3 s, longer than the settle time
  const n = draws(g);
  g.tick(100);
  assert.equal(draws(g), n);
 });

 it('the start screen redraws when the rig, the stance or the camera mode is picked', async () => {
  const g = await game();
  g.tick(200);
  for (const change of [
   () => g.el('ps').fire('click'),
   () => g.el('pb').fire('click'),
   () => g.el('sg').fire('click'),
   () => g.game.setCameraMode('B'),
  ]) {
   const n = draws(g);
   change();
   g.tick(5);
   assert.ok(draws(g) > n, 'a change draws');
   g.tick(200);
   const settled = draws(g);
   g.tick(50);
   assert.equal(draws(g), settled, 'and settles again');
  }
 });

 it('the start screen redraws on a resize', async () => {
  const g = await game();
  g.tick(200);
  const n = draws(g);
  g.el('c').clientWidth = 60;
  g.fire('resize');
  g.tick(3);
  assert.ok(draws(g) > n);
 });

 it('a run draws every frame', async () => {
  const g = await game();
  g.el('go').fire('click');
  const n = draws(g);
  g.tick(30);
  assert.equal(draws(g), n + 30);
 });

 it('draws stay constant while paused and resume afterwards, without a catch-up step', async () => {
  const g = await game();
  g.el('go').fire('click');
  g.tick(30);
  g.el('pz').fire('click');
  g.tick(2);
  const n = draws(g);
  const t = g.state().time;
  g.tick(100, 1000); // seconds-long frames: still nothing
  assert.equal(draws(g), n);
  assert.equal(g.state().time, t);
  g.el('pr').fire('click');
  g.tick(1);
  assert.equal(draws(g), n + 1);
  assert.ok(g.state().time - t < 0.05, 'no catch-up after the pause');
 });

 it('draws stay constant behind the Controls screen and resume when it closes', async () => {
  const g = await game();
  g.el('go').fire('click');
  g.tick(10);
  g.el('pz').fire('click');
  g.el('pc').fire('click');
  g.tick(2);
  const n = draws(g);
  g.tick(50);
  assert.equal(draws(g), n);
  g.el('cc').fire('click');
  g.el('pr').fire('click');
  g.tick(3);
  assert.ok(draws(g) > n);
  // and from the menu
  g.el('pm').fire('click');
  g.tick(200);
  g.el('cb').fire('click');
  const m = draws(g);
  g.tick(50);
  assert.equal(draws(g), m);
 });

 it('draws stay constant while the page is hidden', async () => {
  const g = await game();
  g.el('go').fire('click');
  g.tick(10);
  g.setHidden(true);
  g.tick(2);
  const n = draws(g);
  g.tick(50);
  assert.equal(draws(g), n);
  g.setHidden(false);
  g.el('pr').fire('click');
  g.tick(3);
  assert.ok(draws(g) > n);
 });
 it('paused: a resize, the page becoming visible or a renderer swap draws one still frame, then idles', async () => {
  const g = await game();
  g.el('go').fire('click');
  g.tick(30);
  g.el('pz').fire('click');
  g.tick(3);
  const rest = JSON.stringify([g.state().x, g.state().y, g.state().time]);
  const still = (change, label) => {
   const n = draws(g);
   change();
   g.tick(20);
   assert.equal(draws(g), n + 1, label + ' draws exactly one frame');
   assert.equal(JSON.stringify([g.state().x, g.state().y, g.state().time]), rest, label + ' moves nothing');
  };
  still(() => { g.el('c').clientWidth = 60; g.fire('resize'); }, 'a resize');
  still(() => { g.setHidden(true); g.tick(5); g.setHidden(false); }, 'hidden then visible');
  still(() => g.game.reportRenderer({ name: 'cpu', fallback: 'context lost', lost: true }), 'a renderer swap');
  // while hidden nothing is drawn, even for a change
  g.setHidden(true);
  const n = draws(g);
  g.el('c').clientWidth = 80;
  g.fire('resize');
  g.tick(20);
  assert.equal(draws(g), n);
  g.setHidden(false);
  g.tick(5);
  assert.equal(draws(g), n + 1);
 });
});
