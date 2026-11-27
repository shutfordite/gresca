// @areas view
// E3a: the GPU trees' pure parts in Node: instance placement from the tree data, culling, the model, the Look's
// colours and the memory. (CI cannot run WebGL: the drawing is checked in the preview.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { TREE_MESH, INSTANCE_STRIDE, treeVariation, buildTreeInstances, cullTrees, treeGeometry, treeModelHeightM,
 treeLook, treeMeshBytes, TREE_FAR_M, TREE_HEIGHT_M } from '../src/view/gl/tree-mesh.js';
import { SUN_SHADOW } from '../src/view/gl/sun-shadow.js';
import { sunOnGrid } from '../src/view/gl/snow-material.js';
import { addGpuBytes, terrainTextureBytes, GL_TEXTURE_BUDGET_BYTES } from '../src/view/gl/gl-budget.js';
import { createHangaLook } from '../src/view/look/hanga.js';
import { createMapFrame } from '../src/world/map-frame.js';
import { FOV } from '../src/core/config.js';

const require = createRequire(import.meta.url);
const look = createHangaLook(require('../art/gresca-hanga-spec.js'));
const flat = { height: (x, y) => 100 + 0.01 * x + 0.02 * y }; // a Terrain stand-in: a gentle plane

// A seeded 0..1 sequence (an LCG: no Math.random in tests).
function sequence(seed) {
 let x = seed;
 return () => {
  x = (x * 1664525 + 1013904223) >>> 0;
  return x / 4294967296;
 };
}
function scatter(n, size) {
 const r = sequence(7);
 return Array.from({ length: n }, () => ({ x: r() * size, y: r() * size }));
}

describe('tree instances', () => {
 const trees = scatter(500, 400);
 const inst = buildTreeInstances(trees, flat);

 it('places every tree at its position, on the ground, from the tree data', () => {
  assert.equal(inst.length, trees.length * INSTANCE_STRIDE);
  trees.forEach((t, n) => {
   const o = n * INSTANCE_STRIDE;
   assert.ok(Math.abs(inst[o] - t.x) < 1e-3 && Math.abs(inst[o + 1] - t.y) < 1e-3, 'xy of tree ' + n);
   assert.ok(Math.abs(inst[o + 2] - flat.height(t.x, t.y)) < 1e-3, 'ground of tree ' + n);
  });
 });

 it('varies scale, yaw and tone within the tunables, the same every time, without Math.random', () => {
  const again = buildTreeInstances(trees, flat);
  assert.deepEqual(Array.from(again), Array.from(inst));
  const T = TREE_MESH;
  let scaleSpread = 0;
  let toneSpread = 0;
  for (let o = 0; o < inst.length; o += INSTANCE_STRIDE) {
   assert.ok(inst[o + 3] >= T.SCALE_MIN - 1e-6 && inst[o + 3] <= T.SCALE_MAX + 1e-6, 'scale');
   assert.ok(inst[o + 4] >= 0 && inst[o + 4] < 2 * Math.PI + 1e-6, 'yaw');
   assert.ok(inst[o + 5] >= T.TONE_MIN - 1e-6 && inst[o + 5] <= T.TONE_MAX + 1e-6, 'tone');
   scaleSpread = Math.max(scaleSpread, Math.abs(inst[o + 3] - inst[3]));
   toneSpread = Math.max(toneSpread, Math.abs(inst[o + 5] - inst[5]));
  }
  assert.ok(scaleSpread > 0.05 && toneSpread > 0.1, 'the trees differ');
  assert.deepEqual(treeVariation(12.34, 56.78), treeVariation(12.34, 56.78));
 });

 it('does not use Math.random', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random called'); };
  try {
   buildTreeInstances(trees, flat);
  } finally {
   Math.random = real;
  }
 });
});

describe('tree culling', () => {
 const camera = { x: 0, y: 0, dirX: 1, dirY: 0, fov: FOV };
 const mk = (pts) => buildTreeInstances(pts.map(([x, y]) => ({ x, y })), flat);
 const run = (inst) => {
  const outTree = new Float32Array(inst.length / INSTANCE_STRIDE * 4);
  const outStyle = new Float32Array(inst.length / INSTANCE_STRIDE * 2);
  const n = cullTrees(inst, camera, outTree, outStyle);
  return { n, outTree, outStyle };
 };

 it('keeps trees ahead within TREE_FAR_M and drops those behind or past it', () => {
  const inst = mk([[50, 0], [TREE_FAR_M - 1, 0], [TREE_FAR_M + 1, 0], [-30, 0], [-200, 5]]);
  const { n, outTree } = run(inst);
  assert.equal(n, 2);
  assert.ok(Math.abs(outTree[0] - 50) < 1e-3 && Math.abs(outTree[4] - (TREE_FAR_M - 1)) < 1e-3);
 });

 it('drops trees outside the field of view across, keeping those whose crown reaches in', () => {
  const f = 100;
  const edge = f * Math.tan(FOV / 2);
  const inst = mk([[f, edge + TREE_MESH.RADIUS_M - 0.5], [f, edge + TREE_MESH.RADIUS_M + 0.5], [f, -edge - 40]]);
  assert.equal(run(inst).n, 1);
 });

 it('copies the packed instance data (x, y, ground, scale; yaw, tone) of the trees it keeps', () => {
  const inst = mk([[-40, 0], [60, 3]]);
  const { n, outTree, outStyle } = run(inst);
  assert.equal(n, 1);
  assert.deepEqual(Array.from(outTree.subarray(0, 4)), Array.from(inst.subarray(INSTANCE_STRIDE, INSTANCE_STRIDE + 4)));
  const style = inst.subarray(INSTANCE_STRIDE + 4, INSTANCE_STRIDE + 6);
  assert.deepEqual(Array.from(outStyle.subarray(0, 2)), Array.from(style));
 });

 it('handles a camera turned any way (headings are world headings)', () => {
  const inst = mk([[0, 80], [0, -80], [80, 0], [-80, 0]]);
  const cam = { x: 0, y: 0, dirX: 0, dirY: 1, fov: FOV };
  const out = new Float32Array(16);
  const style = new Float32Array(8);
  assert.equal(cullTrees(inst, cam, out, style), 1);
  assert.ok(Math.abs(out[1] - 80) < 1e-3);
 });

 it('allocates nothing: the outputs are the caller buffers', () => {
  const inst = mk([[50, 0], [60, 1]]);
  const outTree = new Float32Array(8);
  const outStyle = new Float32Array(4);
  cullTrees(inst, camera, outTree, outStyle);
  assert.equal(outTree.length, 8);
  assert.equal(outStyle.length, 4);
 });
});

describe('tree model', () => {
 const g = treeGeometry();

 it('is a low-poly conifer as tall as the sprite and the baked shadow assume', () => {
  assert.equal(treeModelHeightM(), TREE_HEIGHT_M);
  assert.equal(SUN_SHADOW.TREE_HEIGHT_M, TREE_HEIGHT_M);
  let top = -Infinity;
  for (let i = 2; i < g.positions.length; i += 3) top = Math.max(top, g.positions[i]);
  assert.equal(top, TREE_HEIGHT_M);
  assert.ok(g.triangles >= 20 && g.triangles <= 60, 'triangles ' + g.triangles);
  assert.equal(g.positions.length, g.triangles * 9);
  assert.equal(g.normals.length, g.positions.length);
  assert.equal(g.parts.length, g.triangles * 3);
 });

 it('has unit normals, and the trunk starts below the ground and the crown is wider than the shadow root', () => {
  for (let i = 0; i < g.normals.length; i += 3) {
   assert.ok(Math.abs(Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2]) - 1) < 1e-5, 'normal ' + i / 3);
  }
  let bottom = Infinity;
  let widest = 0;
  for (let i = 0; i < g.positions.length; i += 3) {
   bottom = Math.min(bottom, g.positions[i + 2]);
   widest = Math.max(widest, Math.hypot(g.positions[i], g.positions[i + 1]));
  }
  assert.ok(bottom < 0);
  assert.ok(widest >= SUN_SHADOW.TREE_ROOT_HALF_WIDTH_M && widest <= TREE_MESH.RADIUS_M);
 });

 it('winds every face counter-clockwise seen from outside (its normal points away from the tree)', () => {
  for (let t = 0; t < g.triangles; t++) {
   const o = t * 9;
   const p = (k) => [g.positions[o + k * 3], g.positions[o + k * 3 + 1], g.positions[o + k * 3 + 2]];
   const [a, b, c] = [p(0), p(1), p(2)];
   const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
   const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
   const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
   const n = [g.normals[o], g.normals[o + 1], g.normals[o + 2]];
   assert.ok(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0, 'triangle ' + t);
  }
 });
});

describe('tree colours and light', () => {
 for (const rotation of [0, 0.65]) {
  const frame = createMapFrame({ rotation });
  const L = treeLook(look, frame);

  it('resolve from the Look, in range (map turned ' + rotation + ' rad)', () => {
   for (const key of ['crown', 'ambient', 'sunLight', 'sun', 'fog']) {
    assert.equal(L[key].length, 3, key);
    for (const c of L[key]) assert.ok(Number.isFinite(c), key);
   }
   for (const c of [...L.crown, ...L.ambient, ...L.sunLight]) assert.ok(c >= 0 && c <= 1.0001, 'colour ' + c);
   assert.deepEqual(L.crown, look.sprites.tree.rgb.map((c) => c / 255));
   assert.ok(Math.abs(Math.hypot(...L.sun) - 1) < 1e-9);
   assert.ok(L.sun[2] > 0, 'the sun is above the horizon');
  });

  it('light from the same sun as the baked shadows (map turned ' + rotation + ' rad)', () => {
   const grid = frame.vecToGrid(L.sun[0], L.sun[1], { u: 0, v: 0 });
   const baked = sunOnGrid(look.sky, frame);
   assert.ok(Math.abs(grid.u - baked[0]) < 1e-9 && Math.abs(grid.v - baked[1]) < 1e-9, 'across');
   assert.ok(Math.abs(L.sun[2] - baked[2]) < 1e-9, 'up');
  });
 }
});

describe('tree memory', () => {
 it('is small beside the terrain textures and counted in the same budget', () => {
  const trees = treeMeshBytes(15000);
  assert.ok(trees.gpuBytes < 1.5 * 1048576, 'GPU bytes ' + trees.gpuBytes);
  const tex = terrainTextureBytes(1000, 2450);
  const sum = addGpuBytes(tex, trees);
  assert.equal(sum.gpuBytes, tex.gpuBytes + trees.gpuBytes);
  assert.equal(sum.cpuBytes, tex.cpuBytes + trees.cpuBytes);
 });

 it('throws when the trees push the total over the budget', () => {
  const full = { gpuBytes: GL_TEXTURE_BUDGET_BYTES - 10, cpuBytes: 0 };
  assert.throws(() => addGpuBytes(full, { gpuBytes: 11, cpuBytes: 0 }), /budget/);
 });
});
