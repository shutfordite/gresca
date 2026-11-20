// SimEvents through the façade (Gresca.events) on a fixed-seed, fixed-dt run, and input recorded per sim step
// (Gresca.record, recording, replay) replaying to the same rider trace.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { checkSimEvent, SIM_EVENT_TYPES } from '../src/core/contracts.js';

const DT = 1 / 120;

// One step's input from a simple autopilot: down the piste, 9 m left of the centre from y 1960 to 2040 (onto the
// rail at y 2020), no steering in the air, braking from 3 s to 3.6 s.
function pilot(s, W) {
 const off = s.y > 1960 && s.y < 2040 ? -9 : 0;
 const ty = s.y + 15;
 const ang = Math.atan2(ty - s.y, W.centre(ty) + off - s.x);
 let left = 0, right = 0;
 if (s.z <= 0.05) {
  if (ang > s.heading + 0.03) right = 1;
  else if (ang < s.heading - 0.03) left = 1;
 }
 return { left, right, brake: s.time > 3 && s.time < 3.6 ? 1 : 0 };
}

// From the kicker at y 1990, over the rail at 2020 and the big kicker at 2150, to the finish at 2330.
async function ride(g, onStep = () => {}) {
 g.game.seed(7);
 g.place({ y: 1960, vy: 15 });
 g.game.events.clear();
 for (let n = 0; g.state().phase === 'run' && n < 120 * 40; n++) {
  g.input(pilot(g.state(), g.world));
  g.sim(DT);
  onStep(g.state());
 }
}

describe('Gresca.events', async () => {
 const g = await load();

 it('a fixed-seed run emits land, grind and finish events in order, each meeting the SimEvent contract', async () => {
  await ride(g);
  const ev = g.game.events.list();
  assert.deepEqual(ev.map((e) => e.type + (e.kind ? ':' + e.kind : '')), [
   'brakeStart', 'land', 'score:air', 'brakeEnd', 'grindStart:rail', 'grindEnd:rail', 'score:rail', 'land', 'land',
   'score:air', 'finish',
  ]);
  for (const e of ev) assert.deepEqual(checkSimEvent(e), [], JSON.stringify(e));
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'events come in time order');
  const s = g.state();
  const fin = ev.at(-1);
  assert.equal(s.phase, 'done');
  assert.equal(fin.time, s.time);
  assert.equal(fin.score, s.score);
  assert.equal(fin.score, ev.filter((e) => e.type === 'score').reduce((a, e) => a + e.points, 0), 'scores add up');
  assert.equal(ev[5].dist > 20, true, 'ground most of the 24 m rail');
  assert.ok(ev.every((e) => SIM_EVENT_TYPES.includes(e.type)));
 });

 it('the UI subscribes: the finish screen and the popup follow the events', async () => {
  await ride(g);
  const fin = g.game.events.list('finish')[0];
  assert.equal(g.el('msg').hidden, false);
  assert.equal(g.el('t').textContent, 'Finished in ' + fin.time.toFixed(1) + ' s with ' + fin.score + ' points and ' +
   fin.crashes + ' crashes.');
  assert.equal(g.el('go').textContent, 'Ride again');
  assert.equal(g.state().popup.text, '+' + g.game.events.list('score').at(-1).points + 'p Air');
 });

 it('returns copies, and on() subscribes and unsubscribes', () => {
  g.place({ vy: 10 });
  g.game.events.clear();
  const seen = [];
  const off = g.game.events.on('land', (e) => seen.push(e.type));
  g.input({ jump: 1 });
  g.sim(1.5);
  off();
  g.input({ jump: 1 });
  g.sim(1.5);
  assert.deepEqual(seen, ['land']);
  assert.equal(g.game.events.list('land').length, 2);
  g.game.events.list()[0].t = -1;
  assert.notEqual(g.game.events.list()[0].t, -1);
  assert.ok(Object.isFrozen(g.game.events));
 });
});

describe('input recorded per sim step', async () => {
 const g = await load();
 const fields = (s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz, s.heading, s.score, s.crashes, s.time, s.grinding];

 it('replays to an identical rider trace', async () => {
  const first = [];
  g.game.record();
  await ride(g, (s) => first.push(fields(s)));
  g.game.record(false);
  const steps = g.game.recording();
  assert.equal(steps.length, first.length, 'one recorded input per sim step');
  assert.ok(steps.some((s) => s.brake) && steps.some((s) => s.left) && steps.some((s) => s.right));
  g.game.seed(7);
  g.place({ y: 1960, vy: 15 });
  const again = [];
  for (const s of steps) {
   g.game.replay([s]);
   again.push(fields(g.state()));
  }
  assert.deepEqual(again, first);
  assert.equal(g.state().phase, 'done');
 });

 it('records a jump request as the step saw it, before the sim used it up', () => {
  g.place({ vy: 10 });
  g.game.record();
  g.input({ jump: 1 });
  g.sim(3 * DT);
  g.game.record(false);
  assert.deepEqual(g.game.recording().map((s) => [s.jump, s.jumpPressed]), [[1, 1], [0, 0], [0, 0]]);
  assert.ok(g.state().z > 0, 'and it jumped');
 });
});
