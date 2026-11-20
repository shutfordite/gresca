// The world that build() makes, pinned bit for bit. Speed-ups to build() (M2, A2) must not change a single value.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { load } from './harness.js';

// Reference digests of the world built by main at 280d796 (before A2 touched build()). Produced by running this
// file against that version's game: `git show 280d796:index.html > /tmp/main.html` then
// `GAME_FILE=/tmp/main.html node --test test/build.test.js`; the failure messages print the actual digests. (B2a dropped
// GAME_FILE: to compare against an older version now, run that version's own tests.)
// The digest code below reads only the façade, so it runs unchanged against that version. Checked with both the
// old (contextified) harness and the A2 one: same digests.
const WANT = {
  height: 'a7a0676864ff94b3b409a019a072205c18e9b3b6711296d60ffa0fa68043a919',
  groomed: 'cc7d95ec273eda34727a800f3334f82d4600d1f8c1c2b0afe592490496cf83ad',
  colour: '5b169b8e2b1c95c8bcbe1eef325b67bb00b7c73935b411169259ca4f97b55094',
  trees: '342e6a4470bdd839a927d085bd5e0d8953115495fc8e24f57a8846c0861618f1',
};

const g = await load();
const W = g.world, D = g.debug;
const { x: NX, y: NY } = W.size;
// The raw cell heights. Before B3 the façade called this world.height, so fall back to it for older versions.
const cellHeight = W.cellHeight || W.height;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('build()', () => {
  it('makes the same height field as before', () => {
    const h = new Float32Array(NX * NY); // the game stores heights as float32, so this keeps every bit
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) h[y * NX + x] = cellHeight(x, y);
    assert.equal(sha(new Uint8Array(h.buffer)), WANT.height);
  });

  it('makes the same groomed mask as before', () => {
    const m = new Uint8Array(NX * NY);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) m[y * NX + x] = W.groomed(x, y);
    assert.equal(sha(m), WANT.groomed);
  });

  it('paints the same colour map as before', () => {
    const c = new Uint8Array(NX * NY * 4);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) c.set(D.baseColourAt(x, y), (y * NX + x) * 4);
    assert.equal(sha(c), WANT.colour);
  });

  it('plants the same trees as before', () => {
    const t = W.trees, f = new Float64Array(t.length * 2);
    t.forEach((T, k) => { f[2 * k] = T.x; f[2 * k + 1] = T.y; });
    assert.equal(sha(new Uint8Array(f.buffer)), WANT.trees);
  });
});
