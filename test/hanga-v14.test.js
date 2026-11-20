// Art spec v1.4: the new projectRider options (camera pitch, twist, head yaw, body pitch), the brake, switch and tuck
// poses and poseFor's new state fields. Calls that use none of them must give exactly the v1.3 result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const V13 = require('./fixtures/hanga-spec-v1.3.0.cjs');

const RIGS = ['ski', 'board'];
const STANCES = ['regular', 'goofy'];
const YAWS = [-180, -135, -90, -45, -10, 0, 10, 30, 45, 90, 135, 170, 180, 270];
const NEW_POSES = { ski: ['brakeL', 'brakeR', 'switchL', 'switchR', 'tuck'], board: ['brakeHeel', 'brakeToe', 'tuck'] };
const LOWER = HANGA.rider.rotations.twist.lower;
const EPS = 1e-9;

const project = (rig, pose, yaw, stance, options, pitch = null, roll = 0) =>
  HANGA.projectRider(rig, pose, yaw, pitch, roll, stance, options);
const byId = (list, id) => list.find((it) => it.id === id);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);
const ptsClose = (a, b, msg) => a.forEach((p, i) => { close(p[0], b[i][0], msg); close(p[1], b[i][1], msg); });
// Every number in a draw list, for NaN checks.
const numbers = (v) => (typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(numbers) : []);
// The draw lists equal to 1e-9 m, ignoring fields that are not geometry or style.
function listsClose(a, b, msg) {
  assert.equal(a.length, b.length, msg);
  assert.deepEqual(a.map((it) => it.id), b.map((it) => it.id), msg);
  const na = numbers(a);
  const nb = numbers(b);
  assert.equal(na.length, nb.length, msg);
  na.forEach((v, i) => assert.ok(Math.abs(v - nb[i]) < EPS, `${msg}: number ${i}`));
}

test('v1.4 metadata', async (t) => {
  await t.test('version, poses in poseOrder, blend timings', () => {
    assert.equal(HANGA.version, '1.4.0');
    for (const rig of RIGS) {
      assert.deepEqual(HANGA.rider.poseOrder[rig], V13.rider.poseOrder[rig].concat(NEW_POSES[rig]), 'old order kept, new appended');
      for (const pose of NEW_POSES[rig]) {
        assert.ok(HANGA.rider.poses[rig][pose], `${rig} ${pose}`);
        assert.ok(pose in HANGA.rider.timing.into, `${pose} has a blend time`);
        assert.ok(HANGA.blendTime(pose) > 0);
      }
    }
    assert.equal(HANGA.rider.scale.drawScale, 1, 'the rider is drawn at true scale');
  });
  await t.test('v1.3 data is unchanged', () => {
    for (const rig of RIGS) {
      for (const pose of V13.rider.poseOrder[rig]) assert.deepEqual(HANGA.rider.poses[rig][pose], V13.rider.poses[rig][pose]);
      assert.deepEqual(HANGA.rider.joints[rig], V13.rider.joints[rig]);
      assert.deepEqual(HANGA.rider.parts[rig], V13.rider.parts[rig]);
      assert.deepEqual(HANGA.rider.equipment[rig].shapes, V13.rider.equipment[rig].shapes);
    }
    assert.deepEqual(HANGA.rider.widths, V13.rider.widths);
    assert.deepEqual(HANGA.palette, V13.palette, 'palette roles unchanged');
    assert.equal(HANGA.camera.chasePitchDeg, V13.camera.chasePitchDeg);
  });
  await t.test('new geometry uses palette roles only, and the file stays safe to inline', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../art/gresca-hanga-spec.js', import.meta.url), 'utf8');
    assert.ok(!src.includes('</script'), 'no </script in the file');
    const json = JSON.stringify([NEW_POSES.ski.map((p) => HANGA.rider.poses.ski[p]),
      NEW_POSES.board.map((p) => HANGA.rider.poses.board[p]), HANGA.rider.rotations, HANGA.rider.scale]);
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(json), 'no raw hex in the new data');
  });
});

test('backward compatibility with v1.3', async (t) => {
  await t.test('no options: byte-for-byte the v1.3 draw list for every rig, pose, stance and yaw', () => {
    let n = 0;
    for (const rig of RIGS) {
      for (const pose of V13.rider.poseOrder[rig]) {
        for (const stance of STANCES) {
          for (const yaw of YAWS) {
            for (const [pitch, roll] of [[null, 0], [37, 0], [6, 12]]) {
              const want = JSON.stringify(V13.projectRider(rig, pose, yaw, pitch, roll, stance));
              assert.equal(JSON.stringify(project(rig, pose, yaw, stance, undefined, pitch, roll)), want, `${rig} ${pose} ${stance} ${yaw}`);
              assert.equal(JSON.stringify(project(rig, pose, yaw, stance, {}, pitch, roll)), want, 'an empty options object too');
              n++;
            }
          }
        }
      }
    }
    assert.equal(n, 2 * 8 * 2 * YAWS.length * 3);
  });
  await t.test('zero angles and cameraPitchDeg 20 give exactly v1.3', () => {
    const zero = { cameraPitchDeg: 20, twistDeg: 0, headYawDeg: 0, bodyPitchDeg: 0 };
    for (const rig of RIGS) {
      for (const pose of V13.rider.poseOrder[rig]) {
        for (const yaw of [0, 45, 90, 135, 180]) {
          assert.equal(JSON.stringify(project(rig, pose, yaw, 'regular', zero)),
            JSON.stringify(V13.projectRider(rig, pose, yaw, null, 0, 'regular')), `${rig} ${pose} ${yaw}`);
        }
      }
    }
  });
});

test('new poses project cleanly', async (t) => {
  for (const rig of RIGS) {
    await t.test(`${rig}: every new pose, stance and yaw`, () => {
      const widths = Object.fromEntries(V13.projectRider(rig, 'ride', 0).map((it) => [it.id, it.width]));
      for (const pose of NEW_POSES[rig]) {
        for (const stance of STANCES) {
          for (const yaw of YAWS) {
            for (const cameraPitchDeg of [20, 37]) {
              const list = project(rig, pose, yaw, stance, { cameraPitchDeg });
              const msg = `${rig} ${pose} ${stance} ${yaw} ${cameraPitchDeg}`;
              assert.ok(numbers(list).every(Number.isFinite), `${msg}: finite`);
              assert.equal(list.length, HANGA.rider.parts[rig].length + 1, msg);
              assert.equal(list[0].id, 'shadow');
              const eq = list.filter((it) => it.kind === 'equip');
              const body = list.slice(1 + eq.length);
              assert.ok(list.slice(1, 1 + eq.length).every((it) => it.kind === 'equip'), `${msg}: equipment under the body`);
              for (const group of [eq, body]) {
                for (let i = 1; i < group.length; i++) assert.ok(group[i - 1].depth >= group[i].depth - EPS, `${msg}: back to front`);
              }
              for (const it of list) if (it.width !== undefined) assert.equal(it.width, widths[it.id], `${msg}: ${it.id} width as v1.3`);
              const head = byId(list, 'head');
              assert.ok(head.goggles || head.strap, `${msg}: the head has goggles or a strap`);
            }
          }
        }
      }
    });
  }
  await t.test('equipment keylines are as v1.3', () => {
    for (const rig of RIGS) {
      const old = V13.projectRider(rig, 'ride', 30).filter((it) => it.kind === 'equip')[0].shapes;
      for (const pose of NEW_POSES[rig]) {
        const shapes = project(rig, pose, 30, 'regular').filter((it) => it.kind === 'equip')[0].shapes;
        assert.deepEqual(shapes.map((s) => [s.id, s.keyline, s.width, s.colour]), old.map((s) => [s.id, s.keyline, s.width, s.colour]));
      }
    }
  });
  await t.test('the brake poses turn the equipment across, the switch poses open the shoulders', () => {
    assert.ok(HANGA.rider.poses.ski.brakeL.twistDeg < -60 && HANGA.rider.poses.ski.brakeR.twistDeg > 60);
    for (const p of ['brakeL', 'brakeR']) assert.ok(HANGA.rider.poses.ski[p].move.hipC[1] < -0.15, 'hips low');
    assert.ok(HANGA.rider.poses.board.brakeHeel.roll > 0 && HANGA.rider.poses.board.brakeToe.roll < 0, 'heel and toe edges');
    assert.equal(Math.abs(HANGA.rider.poses.ski.switchR.twistDeg), 35);
    assert.ok(HANGA.rider.poses.ski.switchR.headYawDeg >= 80 && HANGA.rider.poses.ski.switchL.headYawDeg <= -80);
    // The ski tips of brakeL point to the rider's left: seen from behind (yaw 0) the ski runs across the screen.
    const ski = byId(project('ski', 'brakeL', 0, 'regular'), 'skiL').shapes[0].pts;
    const xs = ski.map((p) => p[0]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 1.4, 'the ski lies across the screen');
  });
  await t.test('tuck: knees up to the chest', () => {
    for (const rig of RIGS) {
      const J = HANGA.poseJoints(rig, 'tuck', 'regular');
      const knee = rig === 'ski' ? J.kneeL : J.kneeF;
      assert.ok(knee[1] > J.hipC[1] + 0.2, `${rig}: knees above the hips`);
      assert.ok(J.neck[1] - knee[1] < 0.3, `${rig}: knees near the chest`);
    }
  });
});

test('head yaw turns the goggles', async (t) => {
  for (const rig of RIGS) {
    await t.test(`${rig}: goggles follow the sign of head yaw, and 0 is v1.3`, () => {
      // The yaw at which the face looks straight away from a chase camera (the board's face is turned toward its nose).
      const face = HANGA.rider.face[rig];
      const away = -Math.atan2(face[0], face[2]) * 180 / Math.PI;
      const goggleX = (headYawDeg) => {
        const g = byId(project(rig, 'ride', away, 'regular', { headYawDeg }), 'head').goggles;
        assert.ok(g, `${rig} head ${headYawDeg}: goggles seen`);
        return (g.frame.pts[0][0] + g.frame.pts[1][0]) / 2 - byId(project(rig, 'ride', away, 'regular'), 'head').pts[0][0];
      };
      assert.ok(goggleX(90) > 0.02, 'head turned right: goggles on the screen right (chase view)');
      assert.ok(goggleX(-90) < -0.02, 'head turned left: goggles on the screen left');
      assert.deepEqual(project(rig, 'ride', 0, 'regular', { headYawDeg: 0 }), V13.projectRider(rig, 'ride', 0));
    });
  }
  await t.test('ski: facing the camera, a positive head yaw moves the goggles to screen left', () => {
    const at = (h) => byId(project('ski', 'ride', 180, 'regular', { headYawDeg: h }), 'head').goggles.frame.pts[0][0];
    assert.ok(at(60) < at(0) - 0.02 && at(-60) > at(0) + 0.02);
  });
  await t.test('head yaw moves only the head', () => {
    for (const rig of RIGS) {
      const a = project(rig, 'ride', 30, 'regular');
      const b = project(rig, 'ride', 30, 'regular', { headYawDeg: 70 });
      for (const it of a) if (it.id !== 'head' && it.kind !== 'equip' && it.kind !== 'ellipse') ptsClose(byId(b, it.id).pts, it.pts, it.id);
    }
  });
  await t.test('the pose headYawDeg is a default that options replace', () => {
    const own = project('ski', 'switchR', 0, 'regular');
    const replaced = project('ski', 'switchR', 0, 'regular', { headYawDeg: 0 });
    assert.notDeepEqual(byId(own, 'head'), byId(replaced, 'head'));
    assert.deepEqual(project('ski', 'switchR', 0, 'regular', { headYawDeg: 90 }), own);
  });
});

test('twist turns the lower body and equipment only', async (t) => {
  const lowerParts = { ski: ['skiL', 'skiR', 'bootL', 'bootR'], board: ['board', 'bootF', 'bootB'] };
  const upperParts = { ski: ['torso', 'armL', 'armR', 'gloveL', 'gloveR', 'poleL', 'poleR', 'head'],
    board: ['torso', 'armF', 'armB', 'gloveF', 'gloveB', 'head'] };
  for (const rig of RIGS) {
    await t.test(`${rig}: twist = the lower body seen at yaw + twist`, () => {
      for (const [yaw, twist] of [[0, 40], [30, -80], [-90, 90], [150, 25]]) {
        const twisted = project(rig, 'ride', yaw, 'regular', { twistDeg: twist });
        const plain = project(rig, 'ride', yaw, 'regular');
        const turned = project(rig, 'ride', yaw + twist, 'regular');
        for (const id of upperParts[rig]) ptsClose(byId(twisted, id).pts, byId(plain, id).pts, `${id} stays`);
        for (const id of lowerParts[rig]) {
          const a = byId(twisted, id);
          const b = byId(turned, id);
          if (a.kind === 'equip') a.shapes.forEach((s, i) => ptsClose(s.pts, b.shapes[i].pts, `${id} turns`));
          else ptsClose(a.pts, b.pts, `${id} turns`);
        }
        // Legs: the hip ends are lower-body joints too (hipC stays with the torso).
        const leg = rig === 'ski' ? 'legL' : 'legF';
        ptsClose(byId(twisted, leg).pts, byId(turned, leg).pts, `${leg} turns`);
      }
    });
  }
  await t.test('every lower-body joint is a real joint, and the torso joints are not in it', () => {
    for (const rig of RIGS) {
      for (const j of LOWER[rig]) assert.ok(j in HANGA.rider.joints[rig], `${rig} ${j}`);
      for (const j of ['hipC', 'neck', 'head']) assert.ok(!LOWER[rig].includes(j));
    }
  });
  await t.test('goofy: the same twist turns the mirrored board the same way relative to its nose', () => {
    const nose = (stance, twistDeg) => {
      const J = HANGA.poseJoints('board', 'ride', stance);
      const list = project('board', 'ride', 0, stance, { twistDeg, cameraPitchDeg: 90 }); // straight down: screen = plan
      const top = byId(list, 'board').shapes[1].pts;
      return [top, J];
    };
    const [reg] = nose('regular', 30);
    const [goofy] = nose('goofy', 30);
    // Mirrored in z (screen y when looking straight down): the goofy outline is the regular one reflected.
    const flip = (pts) => pts.map((p) => [p[0], -p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    ptsClose(flip(goofy), reg.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), 'mirror image');
  });
});

test('body pitch flips the whole rider', async (t) => {
  for (const rig of RIGS) {
    await t.test(`${rig}: 180 puts the head below the feet, 360 equals 0`, () => {
      for (const pose of ['air', 'tuck']) {
        for (const yaw of [0, 60, 90, 180]) {
          const list = project(rig, pose, yaw, 'regular', { bodyPitchDeg: 180 });
          const head = byId(list, 'head').pts[0][1];
          const boots = list.filter((it) => it.id.startsWith('boot')).map((it) => it.pts[0][1]);
          assert.ok(head < Math.min(...boots) - 0.3, `${pose} ${yaw}: head below feet`);
          assert.deepEqual(project(rig, pose, yaw, 'regular', { bodyPitchDeg: 360 }), project(rig, pose, yaw, 'regular'));
          assert.deepEqual(project(rig, pose, yaw, 'regular', { bodyPitchDeg: -90 }),
            project(rig, pose, yaw, 'regular', { bodyPitchDeg: 270 }), 'wraps modulo 360');
        }
      }
    });
  }
  await t.test('+ is a front flip: at 90 the head goes toward the heading (away from a chase camera)', () => {
    for (const rig of RIGS) {
      const head = byId(project(rig, 'air', 0, 'regular', { bodyPitchDeg: 90 }), 'head');
      const torso = byId(project(rig, 'air', 0, 'regular'), 'torso');
      assert.ok(head.depth > torso.depth + 0.4, `${rig}: the head is farther from the camera`);
    }
  });
  await t.test('the shadow does not pitch', () => {
    assert.deepEqual(project('ski', 'tuck', 30, 'regular', { bodyPitchDeg: 123 })[0], project('ski', 'tuck', 30, 'regular')[0]);
  });
  await t.test('mid-flip, equipment nearer the camera than the torso is drawn over the body', () => {
    for (const rig of RIGS) {
      const list = project(rig, 'tuck', 0, 'regular', { bodyPitchDeg: 90 });
      assert.equal(list[list.length - 1].kind, 'equip', `${rig}: equipment last`);
      assert.ok(list.every((it) => numbers(it).every(Number.isFinite)));
    }
  });
});

test('camera pitch', async (t) => {
  for (const rig of RIGS) {
    await t.test(`${rig}: 20 is v1.3, 37 shortens the legs on screen`, () => {
      for (const pose of HANGA.rider.poseOrder[rig].filter((p) => p in V13.rider.poses[rig])) {
        for (const yaw of [0, 45, 90, 135, 180]) {
          assert.equal(JSON.stringify(project(rig, pose, yaw, 'regular', { cameraPitchDeg: 20 })),
            JSON.stringify(V13.projectRider(rig, pose, yaw, 20, 0, 'regular')));
        }
      }
      // Seen with the legs across the screen: from behind for skis, from the toe side for a board.
      const across = rig === 'ski' ? 0 : 90;
      const legHeight = (cameraPitchDeg) => {
        const list = project(rig, 'ride', across, 'regular', { cameraPitchDeg });
        const ys = list.filter((it) => it.id.startsWith('leg')).flatMap((it) => it.pts.map((p) => p[1]));
        return Math.max(...ys) - Math.min(...ys);
      };
      assert.ok(legHeight(37) < legHeight(20) - 0.05, `${legHeight(37)} < ${legHeight(20)}`);
    });
  }
  await t.test('cameraPitchDeg replaces the positional pitch', () => {
    listsClose(HANGA.projectRider('ski', 'ride', 30, 6, 0, 'regular', { cameraPitchDeg: 37 }),
      V13.projectRider('ski', 'ride', 30, 37, 0, 'regular'), 'option wins');
  });
});

test('poseFor', async (t) => {
  // A grid of v1.3 inputs: the pose must be what v1.3 picks.
  const grid = [];
  for (const rig of [undefined, 'ski', 'board']) for (const wiped of [false, true]) for (const grinding of [false, true])
    for (const airborne of [false, true]) for (const landedAgo of [undefined, 0.1, 0.5]) for (const braking of [false, true])
      for (const approach of [false, true]) for (const turn of [undefined, -1, -0.3, 0, 0.2, 0.6]) for (const goofy of [false, true])
        grid.push({ rig, wiped, grinding, airborne, landedAgo, braking, approach, turn, goofy });
  await t.test(`unchanged for ${grid.length} v1.3 inputs`, () => {
    for (const st of grid) assert.equal(HANGA.poseFor(st), V13.poseFor(st), JSON.stringify(st));
  });
  await t.test('new fields pick the new poses', () => {
    const snow = { wiped: false, grinding: false, airborne: false, approach: false, turn: 0 };
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', airborne: true, flipping: true }), 'tuck');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'board', airborne: true, flipping: true }), 'tuck');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', flipping: true }), 'ride', 'flipping only counts in the air');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', braking: true, brakeSide: 'left' }), 'brakeL');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', braking: true, brakeSide: 'right' }), 'brakeR');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'board', braking: true, brakeSide: 'heel' }), 'brakeHeel');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'board', braking: true, brakeSide: 'toe' }), 'brakeToe');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'board', braking: true, brakeSide: 'left' }), 'crouch', 'not a board side');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', brakeSide: 'left' }), 'ride', 'brakeSide alone does nothing');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', isSwitch: true }), 'switchR');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', isSwitch: true, lookSide: 'left', turn: 0.8 }), 'switchL');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'board', isSwitch: true }), 'ride', 'boards ride switch as the other stance');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', isSwitch: true, airborne: true }), 'air');
    assert.equal(HANGA.poseFor({ ...snow, rig: 'ski', isSwitch: true, landedAgo: 0.1 }), 'land');
  });
});

