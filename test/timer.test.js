// @areas view
// The frame timer hook (view.timer, Gresca.debug.setTimer): each stage of a frame reports once, in order, and a timer
// changes nothing that is drawn.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();
const recorder = () => {
  const laps = [];
  return { laps, lap: (stage) => laps.push(stage) };
};

describe('frame timer', () => {
  it('is told each stage once per frame, in the order they run', () => {
    g.place({ s: 540 });
    const t = recorder();
    g.debug.setTimer(t);
    g.frames(2);
    g.debug.setTimer(null);
    const order = Object.values(g.debug.stages);
    assert.deepEqual(t.laps, [...order, ...order]);
  });

  it('stops being called once removed', () => {
    const t = recorder();
    g.debug.setTimer(t);
    g.debug.setTimer(null);
    g.frames(1);
    assert.deepEqual(t.laps, []);
  });

  it('does not change a pixel of the terrain render', () => {
    const drawn = () => {
      g.place({ s: 540 });
      g.set({ rig: 'board' });
      g.frames(3);
      return Buffer.from(g.debug.renderPixels());
    };
    const plain = drawn();
    g.debug.setTimer(recorder());
    const timed = drawn();
    g.debug.setTimer(null);
    assert.ok(plain.equals(timed));
  });
});
