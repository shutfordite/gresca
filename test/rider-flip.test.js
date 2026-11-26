// F3-draw: the sim's flip angle reaches the projection as bodyPitchDeg, and the rider tucks while flipping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const RA = require('../art/gresca-rider-anim.js');

const DT = 1 / 60;
const inp = (o = {}) => Object.assign({ wiped: false, grinding: false, airborne: true, braking: false, approach: false,
  landed: false, impact: 0, speed: 10, pathTurn: 0, riderSide: 1, feetAccelUp: 0, slopeDeg: 17, meanSlopeDeg: 17,
  flipRot: 0 }, o);
// An animation state that has been in the air for 0.5 s with flipRot, then its projection.
function airborne(rig, flipRot, stance = 'regular') {
  const s = RA.create(rig);
  for (let i = 0; i < 30; i++) RA.update(s, inp({ flipRot }), DT);
  return { s, list: RA.project(s, 0, 20, stance) };
}
const key = (list) => JSON.stringify(list);

test('flipRot becomes bodyPitchDeg, unsmoothed, with the spec sign', () => {
  const s = RA.create('ski');
  RA.update(s, inp({ flipRot: Math.PI / 2 }), DT);
  assert.ok(Math.abs(s.bodyPitch - 90) < 1e-9);
  RA.update(s, inp({ flipRot: -Math.PI }), DT);
  assert.ok(Math.abs(s.bodyPitch + 180) < 1e-9);
});

test('bodyPitch is zero on the snow even with a stale flipRot', () => {
  const s = RA.create('ski');
  RA.update(s, inp({ airborne: false, flipRot: 3 }), DT);
  assert.equal(s.bodyPitch, 0);
  assert.equal(s.flipping, false);
});

for (const rig of ['ski', 'board']) {
  for (const stance of ['regular', 'goofy']) {
    test(`${rig} ${stance}: front flip and backflip move the rider the spec's way`, () => {
      const front = airborne(rig, Math.PI / 2, stance).list;
      const back = airborne(rig, -Math.PI / 2, stance).list;
      const level = airborne(rig, 0, stance).list;
      assert.notEqual(key(front), key(level));
      assert.notEqual(key(front), key(back));
      // the spec's own projection of the same pose at the same angle must match what the animation draws
      const sF = airborne(rig, Math.PI / 2, stance).s;
      const direct = HANGA.projectRider(rig, '__live', 0, 20, 0, stance, { bodyPitchDeg: 90 });
      assert.equal(key(RA.project(sF, 0, 20, stance)), key(direct));
      // front flip: the head goes down and forward (toward the heading); backflip: down and back
      const head = (list) => list.find((it) => it.id === 'head');
      assert.ok(head(front).pts[0][1] < head(level).pts[0][1] - 0.3, 'head drops');
      assert.ok(head(back).pts[0][1] < head(level).pts[0][1] - 0.3, 'head drops');
      if (rig === 'ski') {
        assert.ok(head(front).depth > head(level).depth, 'front flip: head toward the heading');
        assert.ok(head(back).depth < head(level).depth, 'backflip: head away from the heading');
      } else { // the board's axis is its long axis: + rolls the head toward the toe edge (+x), in both stances
        assert.ok(head(front).pts[0][0] > head(level).pts[0][0] + 0.3, 'front flip: head to the toe side');
        assert.ok(head(back).pts[0][0] < head(level).pts[0][0] - 0.3, 'backflip: head to the heel side');
      }
      const shadow = (list) => JSON.stringify(list.find((it) => it.id === 'shadow'));
      assert.equal(shadow(front), shadow(level), 'the shadow is not rotated');
    });
  }
}

test('flipRot 0 projects exactly as before (no options)', () => {
  for (const rig of ['ski', 'board']) {
    const { s, list } = airborne(rig, 0);
    assert.equal(s.bodyPitch, 0);
    assert.equal(key(list), key(HANGA.projectRider(rig, '__live', 0, 20, 0, 'regular', undefined)));
  }
});

test('tuck is selected while flipping in the air, not on the snow, and back to air after', () => {
  for (const rig of ['ski', 'board']) {
    const s = RA.create(rig);
    RA.update(s, inp({ flipRot: 0 }), DT);
    assert.equal(s.pose, 'air');
    RA.update(s, inp({ flipRot: 1 }), DT);
    assert.equal(s.pose, 'tuck');
    RA.update(s, inp({ airborne: false, flipRot: 1 }), DT);
    assert.notEqual(s.pose, 'tuck');
    const t = RA.create(rig);
    RA.update(t, inp({ flipRot: 1 }), DT);
    RA.update(t, inp({ flipRot: 0 }), DT);
    assert.equal(t.pose, 'air');
    const g = RA.create(rig);
    RA.update(g, inp({ airborne: false, flipRot: 1 }), DT);
    assert.notEqual(g.pose, 'tuck');
  }
});

test('no NaN at multiples of 2 PI', () => {
  for (const rig of ['ski', 'board']) {
    for (const k of [-2, -1, 0, 1, 2, 3]) {
      const { list } = airborne(rig, k * 2 * Math.PI);
      assert.ok(!/NaN|null/.test(key(list)), `${rig} ${k}`);
    }
  }
});
