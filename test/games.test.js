// Several games in one process: the game's modules hold no state (ADR 0002), so each load() (each createGame(env))
// is a game of its own, and driving one changes nothing in another.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const a = await load();
const b = await load();
const snap = (g) => JSON.stringify({ state: g.state(), view: g.debug.view(), parts: g.game.particles(), seed: g.game.seed() });

describe('two games in one process', () => {
 it('start the same', () => {
  assert.equal(snap(a), snap(b));
  assert.notEqual(a.game, b.game);
 });

 it('stepping, drawing and steering one leaves the other exactly as it was', () => {
  a.place({ y: 470, vy: 12 });
  b.place({ y: 470, vy: 12 });
  const before = snap(b);
  const pixelsBefore = b.debug.renderPixels();
  a.input({ left: 1, jump: 1 });
  a.game.seed(9);
  a.sim(1.5);
  a.frames(5);
  a.el('ps').fire('click');
  a.fire('keydown', { key: 'ArrowRight' });
  a.set({ score: 99, camera: { heading: 2 } });
  a.debug.fillColourMap(0);
  assert.notEqual(snap(a), before, 'game a moved');
  assert.equal(snap(b), before, 'game b moved too');
  assert.deepEqual(b.debug.renderPixels(), pixelsBefore);
  assert.equal(b.state().rig, 'board');
  assert.notDeepEqual(b.debug.colourAt(600, 600), [0, 0, 0, 0]);
 });

 it('then run the same when given the same input', () => {
  for (const g of [a, b]) {
   g.resetInput();
   g.el('pb').fire('click');
   g.game.seed(1);
   g.place({ y: 470, vy: 12 });
   g.sim(2);
   g.frames(3);
  }
  // landings and the last popup count up over the page's life (place() keeps them): game a jumped earlier
  const run = (g) => { const s = g.state(); delete s.landings; delete s.landingSpeed; delete s.popup; return JSON.stringify(s); };
  assert.equal(run(a), run(b));
  assert.deepEqual(a.debug.view(), b.debug.view());
 });

 it('each has its own copy of the art modules', () => {
  a.run('HANGA.camera.slopeFollow.tilt=0');
  try {
   assert.equal(b.run('HANGA.camera.slopeFollow.tilt'), 0.55);
  } finally { a.run('HANGA.camera.slopeFollow.tilt=0.55'); }
 });
});
