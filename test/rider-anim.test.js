'use strict';
// Rider animation: the art modules are embedded verbatim, the pose state machine follows the spec's timing,
// and the body dynamics react to the ground, landings and turns. Pure-module tests first, then the real game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { load } = require('./harness');
const { BLOCKS, embed } = require('../tools/embed-art');
const HANGA = require('../art/gresca-hanga-spec.js');
const RA = require('../art/gresca-rider-anim.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const DT = 1 / 60;

// Snow input with sensible defaults; override per test.
const snow = (o = {}) => Object.assign({ wiped: false, grinding: false, airborne: false, braking: false, approach: false,
  landed: false, impact: 0, speed: 10, pathTurn: 0, riderSide: 1, feetAccelUp: 0, slopeDeg: 17, meanSlopeDeg: 17 }, o);
function run(s, inp, sec) { for (let t = 0; t < sec - 1e-9; t += DT) RA.update(s, typeof inp === 'function' ? inp(t) : inp, DT); return s; }
function settled(rig, inp = snow()) { return run(RA.create(rig), inp, 2); }

test('art modules are embedded verbatim', async (t) => {
  for (const b of BLOCKS) {
    await t.test(b.file, () => {
      const src = fs.readFileSync(path.join(ROOT, b.file), 'utf8');
      assert.ok(html.includes(`<script id="${b.id}">\n${src}</script>\n`), `run node tools/embed-art.js (${b.file} drifted)`);
    });
  }
  await t.test('re-embedding changes nothing', () => assert.equal(embed(html), html));
  await t.test('spec module is v1.3.0', () => assert.equal(HANGA.version, '1.3.0'));
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

test('in the game', async (t) => {
  const g = load();
  // Advance physics and animation together, as the game loop does (two physics steps per frame).
  const frames = (n) => g.run(`for(let i=0;i<${n};i++){step(${DT / 2});step(${DT / 2});stepParts(${DT});animTick(${DT})}`);
  const pose = () => g.run('anim.pose');

  await t.test('riding, then a jump: air, land, ride', () => {
    g.place({ y: 470, vy: 12 });
    frames(30);
    assert.equal(pose(), 'ride');
    g.run('JU=1');
    frames(6);
    assert.equal(pose(), 'air');
    const n = g.run('landN');
    for (let i = 0; i < 120 && g.run('landN') === n; i++) frames(1);
    assert.equal(g.run('landN'), n + 1, 'landed');
    assert.ok(g.run('landV') > 3, 'landing speed recorded');
    assert.equal(pose(), 'land');
    assert.ok(g.run('anim.comp') > 0.02, 'the landing compresses the legs');
    frames(30);
    assert.equal(pose(), 'ride');
  });
  await t.test('crash snaps to wipeout', () => {
    g.place({ y: 470, vy: 12 });
    frames(10);
    g.run('crash=1.1');
    frames(1);
    assert.equal(pose(), 'wipeout');
  });
  await t.test('holding a side carves and leans into the turn', () => {
    g.place({ y: 470, vy: 12 });
    frames(10);
    g.run('kb.R=1;applyInput()');
    frames(25);
    g.run('kb.R=0;applyInput()');
    assert.equal(pose(), 'carveToe', 'regular stance turning right is on the toe edge');
    assert.ok(g.run('anim.roll') < -5, 'leaning toward the toe edge');
  });
  await t.test('crouches on the approach to a kicker', () => {
    g.place({ y: 734, vy: 14 }); // the next kicker lip is at 760
    let seen = false;
    for (let i = 0; i < 90 && g.run('y') < 760; i++) { frames(1); if (pose() === 'crouch') seen = true; }
    assert.ok(seen);
  });
  await t.test('grinding a rail uses the grind pose', () => {
    // the rail at y 285 sits 9 m left of the piste centreline
    g.place({ x: 'cx(279)-9', y: 279, vy: 10 });
    let seen = false;
    for (let i = 0; i < 90; i++) { frames(1); if (pose() === 'grind') { seen = true; break; } }
    assert.ok(seen);
  });
  await t.test('skis get the ski rig, and draw() renders the Hanga rider', () => {
    g.run("setRig('ski')");
    g.place({ y: 470, vy: 12 });
    g.run(`for(let i=0;i<5;i++)draw(${DT})`);
    assert.equal(g.run('anim.rig'), 'ski');
    assert.ok(g.run("riderList.some(i=>i.id==='skiL')&&riderList.some(i=>i.id==='poleR')"));
    g.run("setRig('board')");
  });
  await t.test('gresca-stance is read from storage (spec rider.stance)', () => {
    assert.equal(g.run('stance'), 'regular');
    const goofy = load({ store: { 'gresca-stance': 'goofy' } });
    assert.equal(goofy.run('stance'), 'goofy');
    goofy.place({ y: 470, vy: 12 });
    goofy.run(`for(let i=0;i<10;i++){step(${DT});animTick(${DT})}`);
    // goofy faces the same way down the hill: the board is turned round because the spec mirrors the rig in z
    assert.ok(Math.abs(Math.abs(goofy.run('riderYaw')) - 180) < 30);
    goofy.run('kb.R=1;applyInput()');
    goofy.run(`for(let i=0;i<25;i++){step(${DT});animTick(${DT})}`);
    assert.equal(goofy.run('anim.pose'), 'carveHeel', 'goofy turning right is on the heel edge');
  });
});
