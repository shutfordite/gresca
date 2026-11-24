// Body twist (S3a): the lower body and equipment keep the equipment heading while the upper body leads toward travel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { animInput, createAnimInput } from '../src/sim/anim-input.js';
import { loadTrace, traceNames } from './traces.js';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const RA = require('../art/gresca-rider-anim.js');

const DT = 1 / 60;
const D2R = Math.PI / 180;
const snow = (o = {}) => Object.assign({ wiped: false, grinding: false, airborne: false, braking: false, approach: false,
  landed: false, impact: 0, speed: 10, pathTurn: 0, riderSide: 1, feetAccelUp: 0, slopeDeg: 17, meanSlopeDeg: 17 }, o);
const run = (s, inp, sec) => { for (let t = 0; t < sec - 1e-9; t += DT) RA.update(s, inp, DT); return s; };
// equipment `off` degrees counter-clockwise (world frame) of the direction of travel
const skid = (off, side = 1) => snow({ travelDir: 0.3, facing: 0.3 + off * D2R + (side < 0 ? Math.PI : 0), riderSide: side });

// The angle (deg, clockwise from the screen's up, modulo 180) of the longest line of the first equipment shape.
function equipAxisDeg(list) {
 const pts = list.find((i) => i.kind === 'equip').shapes[0].pts;
 let best = 0;
 let a = 0;
 for (const p of pts) for (const q of pts) {
  const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (d > best) { best = d; a = Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI; }
 }
 return ((a % 180) + 180) % 180;
}
const angleGap = (a, b) => Math.abs(((a - b + 90) % 180 + 180) % 180 - 90);

test('twist is zero when the equipment points along travel', async (t) => {
 for (const rig of ['ski', 'board']) {
  await t.test(`${rig}: output is bit for bit what it was without the new inputs`, () => {
   const a = RA.create(rig);
   const b = RA.create(rig);
   for (let i = 0; i < 300; i++) {
    const inp = snow({ speed: 12, pathTurn: Math.sin(i / 20) * 1.5, braking: i % 90 > 70, airborne: i % 150 > 130 });
    RA.update(a, inp, DT);
    RA.update(b, { ...inp, facing: 0.7, travelDir: 0.7 }, DT);
    assert.equal(b.twist, 0);
    assert.equal(JSON.stringify(RA.project(b, 33, 37, 'regular')), JSON.stringify(RA.project(a, 33, 37, 'regular')));
   }
  });
 }
 await t.test('riding switch with the equipment exactly backwards is also no twist', () => {
  const s = run(RA.create('ski'), snow({ facing: 1 + Math.PI, travelDir: 1, riderSide: -1 }), 1);
  assert.ok(Math.abs(s.twist) < 1e-9);
 });
});

test('a skid turns the equipment away from the upper body, by the clamped amount, with the right sign', async (t) => {
 for (const rig of ['ski', 'board']) {
  for (const side of [1, -1]) {
   await t.test(`${rig}, riderSide ${side}`, () => {
    const left = run(RA.create(rig), skid(60, side), 2);
    assert.ok(Math.abs(left.twist + RA.tune.twistMax) < 1e-3, 'equipment left of travel: twisted counter-clockwise (-)');
    assert.ok(Math.abs(run(RA.create(rig), skid(-60, side), 2).twist - RA.tune.twistMax) < 1e-3);
    assert.ok(Math.abs(run(RA.create(rig), skid(20, side), 2).twist + 20) < 1e-3, 'below the clamp it is the angle itself');
   });
  }
 }
 await t.test('an equipment heading near +-PI is wrapped, never a spin the long way', () => {
  const s = run(RA.create('ski'), snow({ travelDir: 3.0, facing: -3.0 }), 2); // 0.28 rad apart across +-PI
  assert.ok(s.twist < 0 && s.twist > -20, 'the equipment is 16 deg counter-clockwise of travel: a small - twist');
 });
});

test('on screen the equipment is turned by the twist from the upper body, on both rigs and stances', async (t) => {
 for (const [rig, stance] of [['ski', 'regular'], ['board', 'regular'], ['board', 'goofy']]) {
  await t.test(`${rig} ${stance}`, () => {
   const s = run(RA.create(rig), snow({ travelDir: 0, facing: 0.5 }), 2); // equipment 28.6 deg CCW of travel
   assert.ok(Math.abs(s.twist + 28.65) < 0.1, `the clamp does not bite: ${s.twist}`);
   const opts = { cameraPitchDeg: 89 };
   const upper = 20; // deg, the upper body's heading on screen (yaw)
   const twisted = equipAxisDeg(RA.project(s, upper, null, stance, opts));
   const plain = equipAxisDeg(HANGA.projectRider(rig, '__live', upper, 89, 0, stance, { cameraPitchDeg: 89 }));
   assert.ok(angleGap(twisted - plain, s.twist) < 1.5, `axis turned by ${s.twist}: ${twisted} vs ${plain}`);
  });
 }
});

test('twist eases in with its time constant and out again', () => {
 const s = RA.create('ski');
 run(s, skid(-60), RA.tune.twistSmooth);
 const one = s.twist / RA.tune.twistMax;
 assert.ok(Math.abs(one - (1 - Math.exp(-1))) < 0.08, `after one time constant: ${one}`);
 run(s, skid(-60), 3);
 assert.ok(s.twist > RA.tune.twistMax - 0.1);
 run(s, snow({ facing: 0, travelDir: 0 }), 3);
 assert.ok(Math.abs(s.twist) < 0.1, 'back to no twist');
 const air = run(RA.create('ski'), skid(-60), 2);
 run(air, { ...skid(-60), airborne: true }, 2);
 assert.ok(Math.abs(air.twist) < 0.1, 'no twist in the air');
});

test('no NaN for every pose and yaw', () => {
 for (const rig of ['ski', 'board']) {
  for (const stance of ['regular', 'goofy']) {
   for (let yaw = -180; yaw <= 180; yaw += 30) {
    for (const flags of [{}, { braking: true }, { airborne: true }, { wiped: true }, { grinding: true }, { approach: true },
     { pathTurn: 2 }, { pathTurn: -2 }]) {
     for (const off of [-170, -60, 0, 60, 170]) {
      const s = run(RA.create(rig), { ...skid(off, off > 90 || off < -90 ? -1 : 1), ...flags }, 0.5);
      const bound = flags.braking ? RA.tune.brakeTwistMax : RA.tune.twistMax; // the brake widens the clamp
      assert.ok(Number.isFinite(s.twist) && Math.abs(s.twist) <= bound + 1e-9);
      for (const it of RA.project(s, yaw, null, stance)) {
       for (const p of it.pts || []) assert.ok(p.every(Number.isFinite), `${rig} ${stance} ${yaw} ${it.id}`);
       for (const sh of it.shapes || []) for (const p of sh.pts) assert.ok(p.every(Number.isFinite));
      }
     }
    }
   }
  }
 }
});

test('along the recorded traces the twist stays within the clamp', async (t) => {
 const course = { kickers: [], project: (x, y, out) => Object.assign(out, { s: 0, d: 0 }) };
 for (const name of traceNames()) {
  await t.test(name, () => {
   const tr = loadTrace(name);
   const s = RA.create(tr.rig);
   const a = createAnimInput();
   const session = { rig: tr.rig, stance: 'regular' };
   let max = 0;
   // the clamp is twistMax, and brakeTwistMax along a trace that brakes
   const braked = tr.states.some((st) => st.isBraking);
   const bound = braked ? RA.tune.brakeTwistMax : RA.tune.twistMax;
   for (const st of tr.states) {
    animInput(st, session, course, a);
    const inp = snow({ speed: a.speed, riderSide: a.riderSide, braking: a.braking, airborne: st.z > 0.05,
     facing: a.facing, travelDir: a.travelDir });
    for (let i = 0; i < 3; i++) RA.update(s, inp, tr.dt * tr.every / 3);
    assert.ok(Number.isFinite(s.twist) && Math.abs(s.twist) <= bound + 1e-9);
    max = Math.max(max, Math.abs(s.twist));
   }
   if (name === 'brake') assert.ok(max > 5, `the braking trace skids: max twist ${max}`);
  });
 }
});
