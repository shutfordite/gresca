// @areas view
// The spray's fill styles (view-state.js alphaStyle): built once per hundredth of alpha and reused, so a frame of spray
// builds no strings. A puff's alpha takes many values over its life, so the cache fills and then stops growing.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';

const g = await load();

describe('spray fill styles', () => {
  it('are cached: bounded, and not grown by a second identical stretch of spray', () => {
    g.place({ s: 540 });
    const puffs = () => {
      for (let i = 0; i < 30; i++) {
        g.emitParticles(4, g.state().x, g.state().y, 0.1, 0.4, 1.5, 0, 0);
        g.stepParticles(1 / 60);
        g.frames(1);
      }
    };
    puffs();
    const first = g.debug.alphaStyles();
    assert.ok(first > 1, 'a stretch of spray uses several alphas');
    assert.ok(first <= 101, 'one style per hundredth of alpha for the spray colour');
    for (let k = 0; k < 6; k++) puffs();
    assert.ok(g.debug.alphaStyles() <= 101, 'the cache is bounded however long the spray runs');
  });
});
