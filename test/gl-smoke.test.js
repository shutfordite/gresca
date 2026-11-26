// @areas tools view
// The GPU smoke test's judgement (tools/gl-smoke-check.mjs): a blank, flat or unlit frame fails; a drawn one passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeFrame, judgeScene } from '../tools/gl-smoke-check.mjs';

// RGBA pixels from a function of the pixel index.
function frame(n, colour) {
 const px = new Uint8Array(n * 4);
 for (let i = 0; i < n; i++) px.set([...colour(i), 255], i * 4);
 return px;
}

const drawn = frame(4096, (i) => [(i * 7) % 256, (i * 13) % 256, 120 + (i % 120)]);

test('a blank or flat frame fails, a drawn one passes', () => {
 assert.equal(judgeFrame(frame(4096, () => [0, 0, 0])).ok, false);
 assert.equal(judgeFrame(frame(4096, (i) => (i % 2 ? [255, 255, 255] : [250, 250, 250]))).ok, false);
 assert.match(judgeFrame(frame(4096, (i) => [200 + (i % 40), 200, 200 + ((i >> 6) % 40)])).problem, /brightness/);
 assert.equal(judgeFrame(new Uint8Array(0)).ok, false);
 const good = judgeFrame(drawn);
 assert.equal(good.ok, true, good.problem);
});

test('a scene fails on a CPU fallback, a lost context or a page error', () => {
 const gl = { name: 'gl', fallback: null, losses: 0 };
 assert.deepEqual(judgeScene({ renderer: gl, errors: [], pixels: drawn }), []);
 assert.match(judgeScene({ renderer: { name: 'cpu', fallback: 'no WebGL2' }, errors: [], pixels: [] })[0],
  /not the GPU \(no WebGL2\)/);
 assert.match(judgeScene({ renderer: { ...gl, losses: 1 }, errors: [], pixels: drawn })[0], /lost the WebGL context/);
 assert.match(judgeScene({ renderer: gl, errors: ['boom'], pixels: drawn })[0], /page error: boom/);
});
