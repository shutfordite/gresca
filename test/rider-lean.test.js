// Edge-driven lean (F6): the body tips by the sim's edge angle, rises as the edge flips between turns, reads a skid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './harness.js';
import { loadTrace } from './traces.js';
import { animInput, createAnimInput } from '../src/sim/anim-input.js';

const require = createRequire(import.meta.url);
const RA = require('../art/gresca-rider-anim.js');
const DT = 1 / 60;

const snow = (o = {}) => Object.assign({ wiped: false, grinding: false, airborne: false, braking: false,
  approach: false, landed: false, impact: 0, speed: 12, edge: 0, skid: 0, riderSide: 1, feetAccelUp: 0,
  slopeDeg: 17, meanSlopeDeg: 17 }, o);
function run(s, inp, sec) {
  for (let t = 0; t < sec - 1e-9; t += DT) RA.update(s, typeof inp === 'function' ? inp(t) : inp, DT);
  return s;
}

test('lean follows the edge', async (t) => {
  for (const rig of ['ski', 'board']) {
    await t.test(`${rig}: lean sign follows the edge sign, forward and switch`, () => {
      const roll = (edge, side) => run(RA.create(rig), snow({ edge, riderSide: side }), 1.5).roll;
      assert.ok(roll(0.7, 1) > 5, 'left-turn edge, rider facing travel: leans to the left (+ roll)');
      assert.ok(roll(-0.7, 1) < -5);
      assert.ok(roll(0.7, -1) < -5, 'riding the other way round flips the roll, not the turn');
      assert.ok(Math.abs(roll(1.1, 1)) <= RA.tune.leanMax + 0.5, 'clamped to leanMax');
    });
    await t.test(`${rig}: no lean at edge 0, whatever the speed`, () => {
      for (const speed of [0, 6, 20]) assert.ok(Math.abs(run(RA.create(rig), snow({ speed }), 1.5).roll) < 1e-6);
    });
  }
  await t.test('goofy and regular boards: the roll is mirrored for the same turn (riderSide)', async () => {
    const lean = async (stance) => {
      const g = await load({ store: { 'gresca-stance': stance } });
      g.place({ y: 470, vy: 12 });
      for (let i = 0; i < 10; i++) { g.step(DT); g.debug.animTick(DT); }
      g.fire('keydown', { key: 'ArrowLeft' });
      for (let i = 0; i < 40; i++) { g.step(DT); g.debug.animTick(DT); }
      return { roll: g.debug.anim().roll, edge: g.state().edge };
    };
    const reg = await lean('regular');
    const goofy = await lean('goofy');
    assert.ok(reg.edge > 0.3 && goofy.edge > 0.3, 'a left turn tips onto the + edge');
    assert.ok(reg.roll > 5, 'regular leans left (+ roll, rider +x on the right of travel)');
    assert.ok(goofy.roll < -5, 'goofy faces backwards along the heading (riderSide -1): the roll is mirrored');
  });
  await t.test('a path turn with edge 0 does not lean (the lean has no other source)', () => {
    const s = run(RA.create('ski'), snow({ pathTurn: 2, travelDir: 1 }), 1.5);
    assert.equal(s.roll, 0);
    assert.equal(s.pose, 'ride');
  });
  await t.test('the recorded carve trace: lean follows its edge', () => {
    const trace = loadTrace('carve');
    const s = RA.create(trace.rig === 'ski' ? 'ski' : 'board');
    let checked = 0;
    for (const st of trace.states) {
      RA.update(s, snow({ edge: st.edge, skid: st.skid, speed: Math.hypot(st.vx, st.vy) }), trace.dt * trace.every);
      if (Math.abs(st.edge) > 0.5 && Math.hypot(st.vx, st.vy) > 5) {
        assert.ok(Math.abs(s.rollTarget) > 3 && Math.sign(s.rollTarget) === Math.sign(st.edge));
        checked++;
      }
    }
    assert.ok(checked > 0, 'the trace has carving rows');
  });
  await t.test('the AnimInput the view reads carries the sim\'s edge and skid', () => {
    const out = createAnimInput();
    const rider = { vx: 0, vy: -10, heading: -Math.PI / 2, crashTimer: 0, grind: null, isBraking: false,
      landingSpeed: 0, landings: 0, edge: 0.4, skid: 3, flipRot: 0, x: 0, y: 0 };
    const course = { kickers: [], project: (x, y, o) => Object.assign(o, { s: 0, d: 0 }) };
    animInput(rider, { rig: 'ski', stance: 'regular' }, course, out);
    assert.equal(out.edge, 0.4);
    assert.equal(out.skid, 3);
  });
});

test('unweighting between turns', async (t) => {
  await t.test('the body rises as the edge crosses flat, then settles into the new turn', () => {
    for (const rig of ['ski', 'board']) {
      const s = run(RA.create(rig), snow({ edge: 0.8 }), 1.5);
      assert.equal(s.rise, 0, 'no rise while holding a turn');
      let peak = 0;
      for (let k = 0; k < 60; k++) {
        RA.update(s, snow({ edge: -0.8 }), DT);
        peak = Math.max(peak, s.rise);
      }
      assert.ok(peak > RA.tune.unweightHeight * 0.95, `${rig}: rises about unweightHeight, got ${peak}`);
      assert.ok(peak <= RA.tune.unweightHeight + 1e-9);
      run(s, snow({ edge: -0.8 }), 1);
      assert.equal(s.rise, 0, 'settled again');
    }
  });
  await t.test('the rise lifts the hips above a rider who was already in the new turn, and ends level with it', () => {
    const flipped = run(RA.create('board'), snow({ edge: 0.8 }), 1.5);
    const steady = run(RA.create('board'), snow({ edge: -0.8 }), 1.5);
    let lift = -Infinity;
    for (let k = 0; k < 40; k++) {
      RA.update(flipped, snow({ edge: -0.8 }), DT);
      RA.update(steady, snow({ edge: -0.8 }), DT);
      lift = Math.max(lift, flipped.J.hipC[1] - steady.J.hipC[1]);
    }
    assert.ok(lift > 0.02, 'hips rose');
    run(flipped, snow({ edge: -0.8 }), 1.5);
    run(steady, snow({ edge: -0.8 }), 1.5);
    assert.ok(Math.abs(flipped.J.hipC[1] - steady.J.hipC[1]) < 1e-3, 'back at the carve height');
  });
  await t.test('no rise on a straight run, from a straight into a turn, or in the air', () => {
    const s = run(RA.create('ski'), snow(), 1);
    let peak = 0;
    for (let k = 0; k < 120; k++) { RA.update(s, snow({ edge: 0.8 }), DT); peak = Math.max(peak, s.rise); }
    assert.equal(peak, 0, 'edge from 0 into a turn');
    const a = run(RA.create('ski'), snow({ edge: 0.8 }), 1);
    for (let k = 0; k < 60; k++) {
      RA.update(a, snow({ edge: -0.8, airborne: true }), DT);
      peak = Math.max(peak, a.rise);
    }
    assert.equal(peak, 0, 'edge flip in the air');
  });
  await t.test('a small wobble around flat does not unweight', () => {
    const s = run(RA.create('ski'), snow(), 1);
    let peak = 0;
    for (let k = 0; k < 240; k++) {
      RA.update(s, snow({ edge: 0.1 * Math.sin(k / 3) }), DT);
      peak = Math.max(peak, s.rise);
    }
    assert.equal(peak, 0);
  });
});

test('skid and rig specifics', async (t) => {
  await t.test('a hard skid sits lower and gives up a little lean; a grip-held carve does not', () => {
    for (const rig of ['ski', 'board']) {
      const grip = run(RA.create(rig), snow({ edge: 0.8 }), 1.5);
      const slide = run(RA.create(rig), snow({ edge: 0.8, skid: 8 }), 1.5);
      assert.ok(slide.comp > grip.comp + RA.tune.skidSit * 0.8, `${rig}: sits lower`);
      assert.ok(Math.abs(slide.roll) < Math.abs(grip.roll), `${rig}: leans a little less`);
      assert.ok(Math.abs(slide.roll) > Math.abs(grip.roll) * 0.5, `${rig}: only a little`);
    }
  });
  await t.test('skis: the inside ski runs ahead', () => {
    const left = run(RA.create('ski'), snow({ edge: 0.8 }), 1.5);
    const right = run(RA.create('ski'), snow({ edge: -0.8 }), 1.5);
    assert.ok(left.J.ankL[2] - left.J.ankR[2] > right.J.ankL[2] - right.J.ankR[2] + 0.05);
  });
  await t.test('board: the shoulders lead into the turn, not when edge is 0', () => {
    for (const side of [1, -1]) {
      const lead = (edge) => {
        const s = run(RA.create('board'), snow({ edge, riderSide: side }), 1.5);
        const f = side > 0 ? 'shF' : 'shB';
        const b = side > 0 ? 'shB' : 'shF';
        return (s.J[f][0] - s.J[b][0]) - (s.poseJ[f][0] - s.poseJ[b][0]);
      };
      // a left turn (edge +) with +x on the right of travel moves the leading shoulder toward -x
      assert.ok(side * lead(0.6) < -0.02 * 1 && side * lead(-0.6) > 0.02, `riderSide ${side}`);
    }
    const flat = run(RA.create('board'), snow(), 1.5);
    assert.equal(flat.J.shF[0], flat.poseJ.shF[0]);
  });
});
