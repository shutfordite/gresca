// @areas tools
// The frame-time bench (tools/bench): its statistics, its fixed rider path, and one short run through the real game.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPath, createTimer, summarize, runPath, FRAME_DT } from '../tools/bench/core.mjs';
import { runNode, TRACE_ORDER } from '../tools/bench/node-run.mjs';
import { compareStages } from '../tools/bench/regress.mjs';
import { loadTrace } from './traces.js';

const ROOT = new URL('..', import.meta.url).pathname;
const traces = TRACE_ORDER.map(loadTrace);

describe('bench statistics', () => {
  it('summarises mean, median, p95 and max', () => {
    const s = summarize([5, 1, 3, 2, 4]);
    assert.equal(s.mean, 3);
    assert.equal(s.median, 3);
    assert.equal(s.max, 5);
    assert.equal(summarize([1, 2, 3, 4]).median, 2.5);
    assert.equal(summarize(Array.from({ length: 100 }, (_, i) => i + 1)).p95, 96);
  });

  it('timer laps add up the time since start() per stage', () => {
    let t = 0;
    const timer = createTimer(() => t, ['a', 'b']);
    t = 10;
    timer.start();
    t = 12;
    timer.lap('a');
    t = 17;
    timer.lap('b');
    assert.deepEqual(timer.laps, { a: 2, b: 5 });
    timer.start();
    assert.deepEqual(timer.laps, { a: 0, b: 0 });
  });
});

describe('bench path', () => {
  it('walks every trace in order and wraps', () => {
    const path = createPath(traces);
    assert.ok(path.frames > 4 * 3 / FRAME_DT - 8 && path.frames <= 4 * 3 / FRAME_DT);
    const first = { ...path.at(0).fields };
    assert.equal(path.at(0).seam, true);
    assert.equal(path.at(1).seam, false);
    assert.equal(path.at(0).rig, 'board');
    assert.equal(path.at(path.frames - 1).rig, 'ski');
    assert.deepEqual(path.at(path.frames).fields, first); // wrapped
    assert.equal(first.x, traces[0].states[0].x);
  });

  it('is the same path every time', () => {
    const a = createPath(traces);
    const b = createPath(traces);
    for (let i = 0; i < 50; i++) assert.deepEqual({ ...a.at(i * 13).fields }, { ...b.at(i * 13).fields });
  });
});

describe('bench run', () => {
  it('times every stage of a short run in the real game, deterministically in what it draws', async () => {
    const [r] = await runNode(ROOT, [{ w: 390, h: 844 }], { frames: 40, warmup: 5 });
    for (const name of ['camera', 'raycast', 'sky', 'blit', 'trees', 'sprites', 'rider', 'hud', 'total']) {
      assert.ok(Number.isFinite(r.stages[name].mean) && r.stages[name].mean >= 0, name);
    }
    assert.ok(r.stages.raycast.mean > 0);
    assert.ok(r.stages.total.mean >= r.stages.raycast.mean);
    assert.equal(r.frames + r.skipped, 40);
  });
});

describe('bench regression rule', () => {
  const run = (o) => [o, o, o];
  it('fails a stage more than 25% and 0.05 ms slower than the best base run', () => {
    const [c] = compareStages(run({ raycast: 2 }), [{ raycast: 2.6 }, { raycast: 3 }, { raycast: 2.6 }]);
    assert.equal(c.failed, true);
    assert.equal(c.ratio, 1.3);
  });

  it('passes a stage within 25%, or one too small to measure', () => {
    assert.equal(compareStages(run({ raycast: 2 }), run({ raycast: 2.4 }))[0].failed, false);
    assert.equal(compareStages(run({ sky: 0.01 }), run({ sky: 0.04 }))[0].failed, false); // 4x, but 0.03 ms
  });

  it('takes the best run, so one disturbed run on a busy machine does not fail it', () => {
    const base = [{ total: 3 }, { total: 3 }, { total: 3 }];
    assert.equal(compareStages(base, [{ total: 9 }, { total: 3.1 }, { total: 8 }])[0].failed, false);
  });

  it('compares only the stages both sides have', () => {
    const out = compareStages([{ total: 3 }], [{ total: 3, raycast: 2 }]);
    assert.deepEqual(out.map((c) => c.stage), ['total']);
  });
});
