// The world that build() makes, pinned bit for bit. Speed-ups to build() (M2, A2) must not change a single value.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { load, MAP_ROTATION_DEG } from './harness.js';

// Reference digests of the world built by main at 280d796 (before A2 touched build()). Produced by running this
// file against that version's game: `git show 280d796:index.html > /tmp/main.html` then
// `GAME_FILE=/tmp/main.html node --test test/build.test.js`; the failure messages print the actual digests. (B2a dropped
// GAME_FILE: to compare against an older version now, run that version's own tests.)
// The digest code below reads only the façade, so it runs unchanged against that version. Checked with both the
// old (contextified) harness and the A2 one: same digests.
// The colour digest changed once on purpose since: the snow's relief shading and grain (PR "S4: smoother, more
// natural snow"); heights, groomed mask and trees are untouched.
const WANT = {
  height: 'a7a0676864ff94b3b409a019a072205c18e9b3b6711296d60ffa0fa68043a919',
  groomed: 'cc7d95ec273eda34727a800f3334f82d4600d1f8c1c2b0afe592490496cf83ad',
  colour: 'df231ba85501c69732d56abec734fb9db3d1d7919179be821b2d8b2b1ebfd882',
  trees: '342e6a4470bdd839a927d085bd5e0d8953115495fc8e24f57a8846c0861618f1',
};

const g = await load();
const W = g.world, D = g.debug;
const { x: NX, y: NY } = W.size;
// The raw cell heights. Before B3 the façade called this world.height, so fall back to it for older versions.
const cellHeight = W.cellHeight || W.height;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
// Each cell is read at its centre (x + C, y + C), so no rounding in the map frame (docs/adr/0005-enu-frame.md) picks
// a neighbour: the same cells as reading at their corner on an unrotated map.
const C = 0.5;
// Trees are stored in world metres, so on a rotated map their grid positions round in the last bits: the digest is of
// the map at the default placement, and the rotated map's trees must match it to TREE_TOL.
const g0 = MAP_ROTATION_DEG === 0 ? g : await load({ rotationDeg: 0 });
const TREE_TOL = 1e-9; // m

describe('build()', () => {
  it('makes the same height field as before', () => {
    const h = new Float32Array(NX * NY); // the game stores heights as float32, so this keeps every bit
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) h[y * NX + x] = cellHeight(x + C, y + C);
    assert.equal(sha(new Uint8Array(h.buffer)), WANT.height);
  });

  it('makes the same groomed mask as before', () => {
    const m = new Uint8Array(NX * NY);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) m[y * NX + x] = W.groomed(x + C, y + C);
    assert.equal(sha(m), WANT.groomed);
  });

  it('paints the same colour map as before', () => {
    const c = new Uint8Array(NX * NY * 4);
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) c.set(D.baseColourAt(x + C, y + C), (y * NX + x) * 4);
    assert.equal(sha(c), WANT.colour);
  });

  it('paints hollows darker than ridges in the powder (relief shading)', () => {
    const R = 4; // m, the colour map's relief radius
    const sum = { hollow: [0, 0], ridge: [0, 0] };
    for (let y = R + 20; y < NY - R - 20; y += 7) for (let x = R + 20; x < NX - R - 20; x += 7) {
      if (W.groomed(x + C, y + C) > 0) continue;
      const h = (dx, dy) => cellHeight(x + dx + C, y + dy + C);
      if (Math.abs(h(1, 0) - h(-1, 0)) + Math.abs(h(0, 1) - h(0, -1)) > 0.6) continue; // steep: rock or sun decides
      const relief = (h(-R, 0) + h(R, 0) + h(0, -R) + h(0, R)) / 4 - h(0, 0);
      const kind = relief > 0.5 ? 'hollow' : relief < -0.5 ? 'ridge' : null;
      if (!kind) continue;
      const c = D.baseColourAt(x + C, y + C);
      sum[kind][0] += c[0] + c[1] + c[2];
      sum[kind][1]++;
    }
    assert.ok(sum.hollow[1] > 20 && sum.ridge[1] > 20, `enough cells: ${sum.hollow[1]} hollows, ${sum.ridge[1]} ridges`);
    const mean = (k) => sum[k][0] / sum[k][1];
    assert.ok(mean('hollow') < mean('ridge') - 15, `hollows ${mean('hollow')} vs ridges ${mean('ridge')}`);
  });

  it('plants the same trees as before', () => {
    const t = g0.world.trees, f = new Float64Array(t.length * 2);
    t.forEach((T, k) => { f[2 * k] = T.x; f[2 * k + 1] = T.y; });
    assert.equal(sha(new Uint8Array(f.buffer)), WANT.trees);
    const here = W.trees;
    assert.equal(here.length, t.length);
    here.forEach((T, k) => assert.ok(Math.hypot(T.x - t[k].x, T.y - t[k].y) <= TREE_TOL, `tree ${k}`));
  });
});
