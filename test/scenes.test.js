// @areas sim
// Named scenes (src/scenes.js): every one loads through the façade at any map placement, lands in its state, is
// paused and deterministic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const NAMES = ['ride-board', 'ride-ski', 'carve-board', 'carve-ski', 'brake',
 'switch-ski-left', 'switch-ski-right', 'kicker-air', 'flip', 'grind'];
const ROTATIONS = [0, 37]; // deg: the default placement and an arbitrary one (always checked, with npm test alone)

// What each scene must show, as a check of the façade's state().
const EXPECT = {
 'ride-board': (s) => s.rig === 'board' && s.speed > 3 && s.z === 0,
 'ride-ski': (s) => s.rig === 'ski' && s.speed > 3 && s.z === 0,
 'carve-board': (s) => s.rig === 'board' && s.edge < -0.8 && s.skid === 0 && s.speed > 5 && s.z === 0,
 'carve-ski': (s) => s.rig === 'ski' && s.edge > 0.8 && s.skid === 0 && s.speed > 5 && s.z === 0,
 'brake': (s) => s.isBraking && s.speed > 3,
 'switch-ski-left': (s) => s.rig === 'ski' && s.isSwitch,
 'switch-ski-right': (s) => s.rig === 'ski' && s.isSwitch,
 'kicker-air': (s) => s.z >= 1 && s.fromKicker,
 'flip': (s) => s.z >= 2 && s.fromKicker,
 'grind': (s) => s.grinding,
};

describe('scenes', () => {
 it('the scene list is the documented one', async () => {
  const g = await load();
  assert.deepEqual(g.raw.scenes().map((x) => x.name), NAMES);
  for (const x of g.raw.scenes()) assert.ok(x.note.length > 0, x.name + ' has a note');
 });

 for (const deg of ROTATIONS) {
  for (const name of NAMES) {
   it(`${name} loads at map rotation ${deg} deg, paused, in its state`, async () => {
    const g = await load({ rotationDeg: deg });
    const note = g.raw.scene(name);
    const s = g.state();
    assert.equal(note, g.raw.scenes().find((x) => x.name === name).note);
    assert.equal(s.phase, 'ready', 'paused');
    assert.ok(!s.crashed, 'not crashed');
    assert.ok(EXPECT[name](s), name + ' state: ' + JSON.stringify(s));
    g.frames(2);
    g.raf(1000);
    g.raf(2000); // a real browser frame two seconds on: a paused scene does not move
    assert.deepEqual(g.state().x, s.x);
    assert.deepEqual(g.state().y, s.y);
   });
  }
 }

 it('the same scene gives the same state every time', async () => {
  const a = await load();
  const b = await load();
  for (const name of NAMES) {
   a.raw.scene(name);
   b.raw.scene(name);
   assert.deepEqual(a.state(), b.state(), name);
  }
 });

 it('env.scene (the ?scene= parameter) opens the scene when the game boots', async () => {
  const g = await load({ scene: 'kicker-air' });
  assert.ok(EXPECT['kicker-air'](g.state()));
  assert.equal(g.state().phase, 'ready');
 });

 it('without a scene the boot is the normal menu', async () => {
  const g = await load();
  assert.equal(g.state().speed, 0);
  assert.equal(g.state().z, 0);
 });

 it('an unknown scene throws and names the known ones', async () => {
  const g = await load();
  assert.throws(() => g.raw.scene('nope'), /unknown scene nope.*ride-board/);
 });
});
