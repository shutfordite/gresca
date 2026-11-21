// The GPU terrain's hardening (E1b): the lost-context state machine, driven with fake drawers and a fake canvas
// (Node has no WebGL), the texture memory budget, and the softer corduroy's constants.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './harness.js';
import { createContextState, contextLost, contextRestored, contextReport, createContextDrawer, watchContext,
 guardContext }
 from '../src/view/gl/context-loss.js';
import { terrainTextureBytes, fitsTextureBudget, checkTextureBudget, GL_TEXTURE_BUDGET_BYTES, GL_TEXTURE_BUDGET_MB }
 from '../src/view/gl/gl-budget.js';
import { SNOW_FRAGMENT } from '../src/view/gl/snow-material.js';

const MIB = 1048576;

describe('lost WebGL context', () => {
 it('draws with the GL while the context is there, the CPU while it is lost, and the GL again once restored', () => {
  const state = createContextState();
  const calls = [];
  const draw = createContextDrawer(state, () => calls.push('gl'), () => calls.push('cpu'));
  draw(null, null, 0);
  contextLost(state);
  draw(null, null, 0);
  draw(null, null, 0);
  contextRestored(state);
  draw(null, null, 0);
  assert.deepEqual(calls, ['gl', 'cpu', 'cpu', 'gl']);
  assert.equal(state.losses, 1);
  assert.equal(state.restores, 1);
 });

 it('reports the renderer, the bytes and why the CPU draws', () => {
  const state = createContextState();
  const bytes = terrainTextureBytes(100, 100);
  assert.deepEqual(contextReport(state, bytes),
   { name: 'gl', fallback: null, lost: false, losses: 0, restores: 0, ...bytes });
  contextLost(state);
  const lost = contextReport(state, bytes);
  assert.equal(lost.name, 'cpu');
  assert.equal(lost.fallback, 'context lost');
  assert.equal(lost.lost, true);
 });

 it('cancels the lost event (so the browser may restore) and follows the canvas events', () => {
  const canvas = new EventTarget();
  const state = createContextState();
  const seen = [];
  watchContext(canvas, state, (s) => seen.push(s.lost));
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  assert.equal(lost.defaultPrevented, true, 'preventDefault on webglcontextlost');
  assert.equal(state.lost, true);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(state.lost, false);
  assert.deepEqual(seen, [true, false]);
 });

 it('guards a renderer: view.renderer says gl, then cpu with the reason, then gl again; the drawers follow', () => {
  const canvas = new EventTarget();
  const view = { renderer: null };
  const calls = [];
  const bytes = terrainTextureBytes(100, 100);
  const draw = guardContext(canvas, view, bytes, () => calls.push('gl'), () => calls.push('cpu'));
  assert.deepEqual(view.renderer, contextReport(createContextState(), bytes));
  draw(view, null, 0);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(view.renderer.name, 'cpu');
  assert.equal(view.renderer.fallback, 'context lost');
  assert.equal(view.renderer.lost, true);
  assert.equal(view.renderer.gpuBytes, bytes.gpuBytes);
  draw(view, null, 0);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(view.renderer.name, 'gl');
  assert.equal(view.renderer.restores, 1);
  draw(view, null, 0);
  assert.deepEqual(calls, ['gl', 'cpu', 'gl']);
 });
});

describe('GPU texture memory budget', () => {
 it('is in MiB and the procedural map\'s textures are under it', async () => {
  assert.equal(GL_TEXTURE_BUDGET_BYTES, GL_TEXTURE_BUDGET_MB * MIB);
  const g = await load();
  const nx = g.raw.world.bounds.width; // m, one texel per m
  const ny = g.raw.world.bounds.length;
  assert.ok(nx > 0 && ny > 0, 'the procedural map has a grid');
  const bytes = terrainTextureBytes(nx, ny);
  assert.ok(bytes.gpuBytes < GL_TEXTURE_BUDGET_BYTES, bytes.gpuBytes / MIB + ' MiB');
  assert.ok(bytes.gpuBytes > 0.5 * GL_TEXTURE_BUDGET_BYTES, 'the budget is not slack by more than 2x');
  assert.ok(bytes.cpuBytes < bytes.gpuBytes && bytes.cpuBytes > 0.9 * bytes.gpuBytes);
  assert.equal(fitsTextureBudget(nx, ny), true);
 });

 it('counts every texture from its format: 16 B a grid texel, 2 B a piste sample, the mipmapped detail', () => {
  const grid = 1000 * 2450 * (4 + 4 + 4 + 4);
  const piste = (250 + 1) * (613 + 1) * 2;
  const detail = Math.round(256 * 256 * 4 * 4 / 3);
  assert.equal(terrainTextureBytes(1000, 2450).gpuBytes, grid + piste + detail);
 });

 it('refuses an oversized grid: the check throws (the renderer then falls back to the CPU)', () => {
  assert.equal(fitsTextureBudget(4000, 4000), false);
  assert.throws(() => checkTextureBudget(4000, 4000), /over the 64 MiB budget/);
  assert.deepEqual(checkTextureBudget(1000, 2450), terrainTextureBytes(1000, 2450));
 });
});

describe('softer corduroy', () => {
 it('is lower, fades with distance and is broken up by the detail noise', () => {
  const gain = Number(/CORDUROY_GAIN = ([\d.]+);/.exec(SNOW_FRAGMENT)[1]);
  assert.ok(gain <= 0.5, 'the amplitude is under half of what it was (1.0)');
  const near = Number(/CORDUROY_FADE_NEAR_M = ([\d.]+);/.exec(SNOW_FRAGMENT)[1]);
  const far = Number(/CORDUROY_FADE_FAR_M = ([\d.]+);/.exec(SNOW_FRAGMENT)[1]);
  assert.ok(near > 0 && far > near && far <= 60, 'the ribs fade out within 60 m');
  assert.match(SNOW_FRAGMENT, /sin\(phase \+ wobble\)/);
  assert.match(SNOW_FRAGMENT, /broken \* ribs/);
 });
});
