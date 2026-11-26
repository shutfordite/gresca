// @areas view
// F5 brake counter-rotation: along the recorded brake trace the upper body and head stay facing down the fall line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { animInput, createAnimInput } from '../src/sim/anim-input.js';
import { loadTrace } from './traces.js';

const require = createRequire(import.meta.url);
const RA = require('../art/gresca-rider-anim.js');

const R2D = 180 / Math.PI;
const FRAME_DT = 1 / 60;
const NEAR_ACROSS_DEG = 60;  // the equipment this far from travel counts as across it
const TORSO_MAX_DEG = 25;    // the upper body stays this close to travel while the equipment is across
const HEAD_MAX_DEG = 5;      // the face stays this close to travel at the end of the settle
const JUMP_MAX_DEG = 8;      // most the twist may change in one 1/60 s frame (the sim yaws at up to 230 deg/s)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const snow = (o) => Object.assign({ wiped: false, grinding: false, airborne: false, braking: false, approach: false,
  landed: false, impact: 0, speed: 10, edge: 0, skid: 0, riderSide: 1,
  feetAccelUp: 0, slopeDeg: 17, meanSlopeDeg: 17 }, o);
const course = { kickers: [], project: (x, y, out) => Object.assign(out, { s: 0, d: 0 }) };

// Replays the brake trace for a rig and side (mirrored for the other side); calls onFrame(s, off, inp, prevTwist).
function replay(rig, mirror, onFrame) {
 const tr = loadTrace('brake');
 const s = RA.create(rig);
 const a = createAnimInput();
 const session = { rig, stance: 'regular' };
 const steps = Math.round(tr.dt * tr.every / FRAME_DT);
 // the game draws every 1/60 s from the interpolated pose, so the rows (20 Hz) are interpolated to frames
 const inputs = tr.states.map((st) => {
  animInput(st, session, course, a);
  return { speed: a.speed, braking: a.braking, travel: a.travelDir, facing: a.facing };
 });
 for (let r = 0; r + 1 < inputs.length; r++) {
  for (let i = 0; i < steps; i++) {
   const u = i / steps;
   const p = inputs[r];
   const q = inputs[r + 1];
   // mirroring the world (angles negated) turns a left brake into a right one
   const travel = mirror * (p.travel + wrap(q.travel - p.travel) * u);
   const facing = mirror * (p.facing + wrap(q.facing - p.facing) * u);
   const off = wrap(facing - travel);
   const inp = snow({ speed: p.speed, riderSide: Math.cos(off) >= 0 ? 1 : -1, braking: p.braking, travelDir: travel,
    facing });
   const prev = s.twist;
   RA.update(s, inp, FRAME_DT);
   onFrame(s, off * R2D, inp, prev);
  }
 }
}

for (const rig of ['ski', 'board']) {
 for (const mirror of [1, -1]) {
  test(`${rig}, brake ${mirror > 0 ? 'left' : 'right'}: upper body and head face the fall line, no pops`, () => {
   let across = 0;
   let worstTorso = 0;
   let worstJump = 0;
   let headErr = null;
   replay(rig, mirror, (s, offDeg, inp, prev) => {
    worstJump = Math.max(worstJump, Math.abs(s.twist - prev));
    // the upper body's heading from travel: the equipment's offset less the twist (twist = equipment - upper body)
    const torso = -offDeg - s.twist;
    const moving = inp.speed >= RA.tune.holdSpeed; // stopped, travel is the heading (AnimInput)
    if (moving && Math.abs(offDeg) > NEAR_ACROSS_DEG && inp.braking) {
     across++;
     worstTorso = Math.max(worstTorso, Math.abs(torso));
    }
    if (moving && inp.braking && s.brakeW > 0.9) headErr = Math.abs(torso + s.headYaw);
   });
   assert.ok(across > 20, `the equipment is across the fall line for a while (${across} frames)`);
   assert.ok(worstTorso <= TORSO_MAX_DEG, `torso ${worstTorso.toFixed(1)} deg off the fall line`);
   assert.ok(headErr !== null && headErr <= HEAD_MAX_DEG, `head ${headErr} deg off the fall line`);
   assert.ok(worstJump <= JUMP_MAX_DEG, `twist jumps ${worstJump.toFixed(2)} deg in one frame`);
  });
 }
}

test('the brake pose has a side for skis, and the heel edge for the board', () => {
 for (const rig of ['ski', 'board']) {
  const s = RA.create(rig);
  const inp = snow({ braking: true, travelDir: 0, facing: 70 / R2D });
  for (let i = 0; i < 60; i++) RA.update(s, inp, FRAME_DT);
  assert.equal(s.pose, rig === 'ski' ? 'brakeL' : 'brakeHeel');
 }
});
