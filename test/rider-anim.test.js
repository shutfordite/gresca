// Rider animation: the spec module's version, the pose state machine follows the spec's timing,
// and the body dynamics react to the ground, landings and turns. Pure-module tests first, then the real game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './harness.js';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const RA = require('../art/gresca-rider-anim.js');

const DT = 1 / 60;

// Snow input with sensible defaults; override per test.
const snow = (o = {}) => Object.assign({ wiped: false, grinding: false, airborne: false, braking: false, approach: false,
  landed: false, impact: 0, speed: 10, pathTurn: 0, riderSide: 1, feetAccelUp: 0, slopeDeg: 17, meanSlopeDeg: 17 }, o);
function run(s, inp, sec) { for (let t = 0; t < sec - 1e-9; t += DT) RA.update(s, typeof inp === 'function' ? inp(t) : inp, DT); return s; }
function settled(rig, inp = snow()) { return run(RA.create(rig), inp, 2); }

test('art spec module', async (t) => {
  await t.test('spec module is v1.4.0', () => assert.equal(HANGA.version, '1.4.0'));
});

test('pose state machine follows the spec timing', async (t) => {
  for (const rig of ['ski', 'board']) {
    await t.test(`${rig}: ride, air, land hold, back to ride`, () => {
      const s = settled(rig);
      assert.equal(s.pose, 'ride');
      RA.update(s, snow({ airborne: true }), DT);
      assert.equal(s.pose, 'air');
      run(s, snow({ airborne: true }), 0.5);
      RA.update(s, snow({ landed: true, impact: 6 }), DT);
      assert.equal(s.pose, 'land');
      run(s, snow(), HANGA.rider.timing.hold.land - 2 * DT);
      assert.equal(s.pose, 'land', 'land is held for timing.hold.land');
      run(s, snow(), 4 * DT);
      assert.equal(s.pose, 'ride');
    });
    await t.test(`${rig}: blends over blendTime, and wipeout snaps`, () => {
      const s = settled(rig), ride = RA.poseTarget(rig, 'ride'), air = RA.poseTarget(rig, 'air');
      const j = rig === 'ski' ? 'ankL' : 'ankF', bt = HANGA.blendTime('air');
      RA.update(s, snow({ airborne: true }), bt / 2);
      const mid = s.poseJ[j][1];
      assert.ok(mid > ride[j][1] + 1e-6 && mid < air[j][1] - 1e-6, 'halfway through the blend the joint is in between');
      RA.update(s, snow({ airborne: true }), bt);
      assert.deepEqual(s.poseJ[j], air[j]);
      RA.update(s, snow({ wiped: true }), DT);
      assert.equal(s.pose, 'wipeout');
      assert.deepEqual(s.J, RA.poseTarget(rig, 'wipeout'), 'wipeout snaps in with no blend or body dynamics');
      assert.equal(s.roll, HANGA.rider.poses[rig].wipeout.roll);
    });
    await t.test(`${rig}: grind, brake and kicker approach`, () => {
      assert.equal(RA.update(settled(rig), snow({ grinding: true }), DT).pose, 'grind');
      assert.equal(RA.update(settled(rig), snow({ braking: true }), DT).pose, 'crouch');
      assert.equal(RA.update(settled(rig), snow({ approach: true }), DT).pose, 'crouch');
      assert.equal(RA.update(settled(rig), snow({ braking: true, airborne: true }), DT).pose, 'air', 'no brake crouch in the air');
    });
  }
  await t.test('carve pose follows the turn in the rider frame', () => {
    const turn = (rig, dir, side) => run(RA.create(rig), snow({ pathTurn: dir * 2, riderSide: side }), 0.5).pose;
    assert.equal(turn('ski', -1, 1), 'carveL');
    assert.equal(turn('ski', 1, 1), 'carveR');
    assert.equal(turn('ski', 1, -1), 'carveL', 'riding switch, a right turn is on the rider\'s left');
    assert.equal(turn('board', 1, 1), 'carveToe');
    assert.equal(turn('board', 1, -1), 'carveHeel');
  });
  await t.test('a small wobble does not flicker into a carve', () => {
    const s = settled('ski');
    let changes = 0, last = s.pose;
    run(s, (t) => snow({ pathTurn: 0.5 * Math.sin(t * 40) }), 2);
    run(s, (t) => { if (s.pose !== last) { changes++; last = s.pose; } return snow({ pathTurn: 0.5 * Math.sin(t * 40) }); }, 2);
    assert.equal(changes, 0);
  });
});

test('body dynamics', async (t) => {
  await t.test('lean goes into the turn, with the right sign forward and switch', () => {
    const lean = (side, dir) => run(RA.create('ski'), snow({ speed: 12, pathTurn: dir * 1.5, riderSide: side }), 1.5).roll;
    assert.ok(lean(1, 1) < -5, 'turning right, forward: lean toward +x (negative roll)');
    assert.ok(lean(1, -1) > 5);
    assert.ok(lean(-1, 1) > 5, 'riding switch flips it');
    assert.ok(Math.abs(lean(1, 1)) <= RA.tune.leanMax + 0.5, 'clamped to leanMax');
    assert.ok(Math.abs(run(RA.create('ski'), snow({ speed: 0.2, pathTurn: 1.5 }), 1.5).roll) < 1, 'no lean when nearly stopped');
  });
  await t.test('angulation keeps the shoulders more level than the legs', () => {
    const s = run(RA.create('ski'), snow({ speed: 12, pathTurn: -1.5 }), 1.5); // leaning left, positive roll
    const base = HANGA.poseJoints('ski', s.pose, 'regular');
    assert.ok(s.J.neck[0] > base.neck[0] + 0.02, 'upper body moves toward the outside of the turn');
    assert.ok(s.J.hanR[1] > base.hanR[1] + 0.02, 'outside hand rises');
  });
  await t.test('the legs absorb ground that pushes up, and a hard landing squats deeper than a soft one', () => {
    const rest = settled('board');
    const pushed = run(RA.create('board'), snow({ feetAccelUp: 20 }), 1);
    assert.ok(pushed.J.hipC[1] < rest.J.hipC[1] - 0.04);
    const peak = (impact) => {
      const s = settled('ski');
      RA.update(s, snow({ airborne: true }), DT);
      RA.update(s, snow({ landed: true, impact }), DT);
      run(s, snow(), 0.4);
      return s.compPeak;
    };
    assert.ok(peak(12) > peak(4) + 0.03);
    assert.ok(peak(100) <= RA.tune.compMax + 1e-9, 'never past a full squat');
  });
  await t.test('steeper than the map\'s mean, and faster, means a lower stance', () => {
    const hip = (o) => settled('ski', snow(o)).J.hipC[1];
    assert.ok(hip({ slopeDeg: 30 }) < hip({ slopeDeg: 17 }) - 0.02);
    assert.ok(hip({ slopeDeg: 8 }) > hip({ slopeDeg: 17 }));
    assert.ok(hip({ speed: 25 }) < hip({ speed: 10 }) - 0.03);
  });
  await t.test('a slow frame or noisy input never produces a broken pose', () => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const rig of ['ski', 'board']) {
      const s = RA.create(rig);
      for (let i = 0; i < 2000; i++) {
        RA.update(s, snow({ airborne: rnd() < 0.2, wiped: rnd() < 0.02, grinding: rnd() < 0.05, braking: rnd() < 0.2,
          landed: rnd() < 0.05, impact: rnd() * 40, speed: rnd() * 40, pathTurn: (rnd() - 0.5) * 20, riderSide: rnd() < 0.5 ? 1 : -1,
          feetAccelUp: (rnd() - 0.5) * 400, slopeDeg: rnd() * 50 }), rnd() < 0.05 ? 0.25 : DT);
        for (const k in s.J) assert.ok(s.J[k].every(Number.isFinite), `${rig} ${k} finite`);
        assert.ok(s.comp >= RA.tune.compMin - 1e-9 && s.comp <= RA.tune.compMax + 1e-9);
        assert.ok(Number.isFinite(s.roll) && Math.abs(s.roll) <= 90);
      }
    }
  });
  await t.test('project returns the spec draw list for the live pose', () => {
    for (const rig of ['ski', 'board']) {
      const list = RA.project(settled(rig), 30, null, 'regular');
      assert.equal(list[0].id, 'shadow');
      assert.ok(list.some((i) => i.kind === 'equip') && list.some((i) => i.id === 'head'));
      assert.equal(list.length, HANGA.rider.parts[rig].length + 1);
    }
    assert.ok(!HANGA.rider.poseOrder.board.includes('__live'), 'the live pose stays out of the spec pose list');
  });
});

test('F7: skis ridden switch look over the downhill-side shoulder', async (t) => {
  const sw = (o = {}) => snow(Object.assign({ isSwitch: true, riderSide: -1, downhillSide: 1, fallAngle: 1.2 }, o));
  const settleSw = (o) => run(RA.create('ski'), sw(o), 1.5);
  await t.test('head yaw sign follows downhillSide, 80 to 100 degrees, shoulders open about 35', () => {
    const l = settleSw(), r = settleSw({ downhillSide: -1, fallAngle: -1.2 });
    assert.equal(l.pose, 'switchL');
    assert.equal(r.pose, 'switchR');
    assert.ok(l.headYaw <= -80 && l.headYaw >= -100, 'left shoulder: ' + l.headYaw);
    assert.ok(r.headYaw >= 80 && r.headYaw <= 100, 'right shoulder: ' + r.headYaw);
    assert.ok(Math.abs(Math.abs(l.twist) - 35) < 3 && l.twist > 0 && r.twist < 0, `twist ${l.twist} / ${r.twist}`);
  });
  await t.test('the swap takes about 0.3 s', () => {
    const s = settleSw();
    const timeToSwap = () => {
      for (let i = 1; i < 120; i++) { RA.update(s, sw({ downhillSide: -1, fallAngle: -1.2 }), DT); if (s.headYaw > 85) return i * DT; }
      return Infinity;
    };
    const took = timeToSwap();
    assert.ok(took > 0.25 && took < 0.4, 'swapped in ' + took);
  });
  await t.test('no flip-flop for a heading wobbling 5 degrees around the fall line', () => {
    const s = settleSw();
    const side0 = s.fakieSide;
    let flips = 0, last = side0;
    run(s, (time) => {
      if (s.fakieSide !== last) { flips++; last = s.fakieSide; }
      const a = 5 * Math.PI / 180 * Math.sin(time * 12);
      return sw({ fallAngle: a, downhillSide: a >= 0 ? 1 : -1 });
    }, 3);
    assert.equal(flips, 0);
    assert.equal(s.fakieSide, side0);
    // but a clear 20 degrees past the line swaps it
    run(s, sw({ fallAngle: -0.35, downhillSide: -1 }), 0.1);
    assert.equal(s.fakieSide, -1);
  });
  await t.test('not switch: head yaw as before; boards ignore it', () => {
    const fwd = run(RA.create('ski'), snow({ downhillSide: 1, fallAngle: 1.2 }), 1.5);
    assert.equal(fwd.headYaw, 0);
    assert.equal(fwd.pose, 'ride');
    const board = run(RA.create('board'), sw(), 1.5);
    assert.equal(board.headYaw, 0);
    assert.equal(board.pose, 'ride');
    assert.equal(board.twist, 0);
  });
  await t.test('the head turn reaches the draw options (goggles follow)', () => {
    const s = settleSw();
    RA.project(s, 0, 0, 'regular');
    assert.equal(s.opts.headYawDeg, s.headYaw);
  });
});

test('in the game', async (t) => {
  const g = await load();
  // Advance physics and animation together, as the game loop does (two physics steps per frame).
  const frames = (n) => { for (let i = 0; i < n; i++) { g.step(DT / 2); g.step(DT / 2); g.stepParticles(DT); g.debug.animTick(DT); } };
  const pose = () => g.debug.anim().pose;
  const st = () => g.state();

  await t.test('riding, then a jump: air, land, ride', () => {
    g.place({ y: 470, vy: 12 });
    frames(30);
    assert.equal(pose(), 'ride');
    g.input({ jump: 1 });
    frames(6);
    assert.equal(pose(), 'air');
    const n = st().landings;
    for (let i = 0; i < 120 && st().landings === n; i++) frames(1);
    assert.equal(st().landings, n + 1, 'landed');
    assert.ok(st().landingSpeed > 3, 'landing speed recorded');
    assert.equal(pose(), 'land');
    assert.ok(g.debug.anim().comp > 0.02, 'the landing compresses the legs');
    frames(30);
    assert.equal(pose(), 'ride');
  });
  await t.test('crash snaps to wipeout', () => {
    g.place({ y: 470, vy: 12 });
    frames(10);
    g.set({ crashTimer: 1.1 });
    frames(1);
    assert.equal(pose(), 'wipeout');
  });
  await t.test('holding a side carves and leans into the turn', () => {
    g.place({ y: 470, vy: 12 });
    frames(10);
    g.fire('keydown', { key: 'ArrowRight' }); // the real key handler: kb.R=1, then applyInput()
    frames(25);
    g.fire('keyup', { key: 'ArrowRight' });
    assert.equal(pose(), 'carveToe', 'regular stance turning right is on the toe edge');
    assert.ok(g.debug.anim().roll < -5, 'leaning toward the toe edge');
  });
  await t.test('crouches on the approach to a kicker', () => {
    g.place({ y: 734, vy: 14 }); // the next kicker lip is at 760
    let seen = false;
    for (let i = 0; i < 90 && st().y < 760; i++) { frames(1); if (pose() === 'crouch') seen = true; }
    assert.ok(seen);
  });
  await t.test('grinding a rail uses the grind pose', () => {
    // the rail at y 285 sits 9 m left of the piste centreline
    g.place({ x: g.world.centre(279) - 9, y: 279, vy: 10 });
    let seen = false;
    for (let i = 0; i < 90; i++) { frames(1); if (pose() === 'grind') { seen = true; break; } }
    assert.ok(seen);
  });
  await t.test('skis get the ski rig, and draw() renders the Hanga rider', () => {
    g.el('ps').fire('click'); // the Skis button: setRig('ski')
    g.place({ y: 470, vy: 12 });
    g.frames(5, DT);
    assert.equal(g.debug.anim().rig, 'ski');
    const list = g.debug.riderList();
    assert.ok(list.some((i) => i.id === 'skiL') && list.some((i) => i.id === 'poleR'));
    g.el('pb').fire('click');
  });
  await t.test('gresca-stance is read from storage (spec rider.stance)', async () => {
    assert.equal(st().stance, 'regular');
    const goofy = await load({ store: { 'gresca-stance': 'goofy' } });
    assert.equal(goofy.state().stance, 'goofy');
    const ticks = (n) => { for (let i = 0; i < n; i++) { goofy.step(DT); goofy.debug.animTick(DT); } };
    goofy.place({ y: 470, vy: 12 });
    ticks(10);
    // goofy faces the same way down the hill: the board is turned round because the spec mirrors the rig in z
    assert.ok(Math.abs(Math.abs(goofy.debug.riderYaw()) - 180) < 30);
    goofy.fire('keydown', { key: 'ArrowRight' }); // kb.R=1, then applyInput()
    ticks(25);
    assert.equal(goofy.debug.anim().pose, 'carveHeel', 'goofy turning right is on the heel edge');
  });
});
