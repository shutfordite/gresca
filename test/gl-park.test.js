// @areas view
// E3b: the GPU park's pure parts in Node: the kickers, rails and flags the mesh is built from (counts and positions on
// the test slope and the play mountain, any map rotation), that it sits on the snow, the culling, the memory, and the
// sun-visibility lookup every GPU object shares. (CI cannot run WebGL: the drawing is checked in the preview.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PARK, KICKER_FLAG_D, KICKER_RAMP_M, FEATURE_KIND, FEATURE_STRIDE, PARK_FAR_M, buildParkMesh, flagPlacements,
 cullPark, parkLook, parkMeshBytes, createParkMesh } from '../src/view/gl/park-mesh.js';
import { SUN_VISIBILITY_GLSL, SUN_LIGHT_GLSL, sunVisibilityUv, sunVisibilityGrid }
 from '../src/view/gl/sun-visibility.js';
import { addGpuBytes, terrainTextureBytes } from '../src/view/gl/gl-budget.js';
import { createHangaLook } from '../src/view/look/hanga.js';
import { TREE_MESH } from '../src/view/gl/tree-mesh.js';
import { SUN_SHADOW } from '../src/view/gl/sun-shadow.js';
import { createMapFrame } from '../src/world/map-frame.js';
import { FOV } from '../src/core/config.js';
import { createWorld, buildWorld } from '../src/world/build.js';
import { MAP_ROTATION_DEG } from './harness.js';

const require = createRequire(import.meta.url);
const look = createHangaLook(require('../art/gresca-hanga-spec.js'));
// Both procedural maps, built and placed as the game does (turned by GRESCA_MAP_ROTATION_DEG under test:rotated).
function makeWorld(map) {
 const world = createWorld({ rotationRad: MAP_ROTATION_DEG * Math.PI / 180, map });
 buildWorld(world);
 return world;
}
const maps = { 'test slope': makeWorld('test'), 'play mountain': makeWorld('play') };
const worldOf = (w) => ({ course: w.course, terrain: w.terrain, frame: w.frame });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a + ' vs ' + b);

for (const [name, g] of Object.entries(maps)) {
 const { course, terrain, frame } = worldOf(g);
 const mesh = buildParkMesh(course, terrain, look, frame);
 const features = (kind) => {
  const out = [];
  for (let o = 0; o < mesh.features.length; o += FEATURE_STRIDE) {
   if (mesh.features[o + 5] === kind) out.push(Array.from(mesh.features.subarray(o, o + FEATURE_STRIDE)));
  }
  return out;
 };

 describe('park features, ' + name, () => {
  it('has one feature per kicker, rail and flag of the course', () => {
   const bigs = course.kickers.filter((k) => k.big).length;
   assert.equal(features(FEATURE_KIND.KICKER).length, course.kickers.length);
   assert.equal(features(FEATURE_KIND.RAIL).length, course.rails.length);
   assert.equal(features(FEATURE_KIND.FLAG).length, 2 * course.kickers.length + 2 * bigs + course.rails.length);
   assert.deepEqual(mesh.counts, { kickers: course.kickers.length, rails: course.rails.length,
    flags: 2 * course.kickers.length + 2 * bigs + course.rails.length });
   assert.ok(course.rails.length > 0);
   // the play mountain's jumps are snow in the terrain (K1), not kicker features: only the test slope has kickers
   assert.equal(course.kickers.length > 0, name === 'test slope');
  });

  it('centres each kicker on its lip and each rail on its middle', () => {
   const p = { x: 0, y: 0 };
   features(FEATURE_KIND.KICKER).forEach((f, n) => {
    const k = course.kickers[n];
    course.point(k.s, k.d, p);
    near(f[0], p.x, 1e-3, 'kicker x');
    near(f[1], p.y, 1e-3, 'kicker y');
   });
   features(FEATURE_KIND.RAIL).forEach((f, n) => {
    const r = course.rails[n];
    near(f[0], (r.x0 + r.x1) / 2, 1e-2, 'rail x');
    near(f[1], (r.y0 + r.y1) / 2, 1e-2, 'rail y');
   });
  });

  it('puts the flags where the sprites put them: beside each lip, up the big ramps, at each rail start', () => {
   const flags = flagPlacements(course, frame);
   const p = { x: 0, y: 0 };
   let n = 0;
   for (const k of course.kickers) {
    for (const side of [-1, 1]) {
     course.point(k.s, k.d + side * KICKER_FLAG_D, p);
     near(flags[n].x, p.x, 1e-9, 'kicker flag x');
     near(flags[n].y, p.y, 1e-9, 'kicker flag y');
     near(flags[n].height, k.big ? PARK.BIG_KICKER_FLAG_HEIGHT_M : PARK.KICKER_FLAG_HEIGHT_M, 1e-9, 'height');
     n++;
    }
    if (k.big) n += 2;
   }
   const fs = features(FEATURE_KIND.FLAG);
   assert.equal(fs.length, flags.length);
   fs.forEach((f, i) => {
    near(f[0], flags[i].x, 1e-3, 'flag feature x');
    near(f[1], flags[i].y, 1e-3, 'flag feature y');
   });
   for (const f of flags) near(Math.hypot(f.dirX, f.dirY), 1, 0.1, 'the pennant has a direction');
  });

  it('covers the sim\'s launch zone: run-up to launch depth, across the launch width', () => {
   const where = { s: 0, d: 0, tx: 0, ty: 0 };
   const kickerFeatures = features(FEATURE_KIND.KICKER);
   kickerFeatures.forEach((f, n) => {
    const k = course.kickers[n];
    let sMin = Infinity;
    let sMax = -Infinity;
    let dMax = 0;
    const first = f[3];
    for (let i = 0; i < f[4]; i++) {
     const v = mesh.indices[first + i];
     course.project(mesh.positions[v * 3], mesh.positions[v * 3 + 1], where);
     if (Math.abs(where.d - k.d) > k.halfWidth + 1) continue; // a flag or bar of another feature: not this one
     sMin = Math.min(sMin, where.s);
     sMax = Math.max(sMax, where.s);
     dMax = Math.max(dMax, Math.abs(where.d - k.d));
    }
    assert.ok(sMin <= k.s - KICKER_RAMP_M + 0.5, 'run-up starts at ' + sMin);
    assert.ok(sMax >= k.s + k.depth - 0.5, 'reaches the launch depth: ' + sMax);
    assert.ok(dMax >= k.halfWidth - 0.5, 'spans the launch width: ' + dMax);
    assert.ok(course.kickerAt(k.s + 0.5, k.d) !== null, 'the zone the mesh covers launches');
   });
  });
 });

 describe('park geometry, ' + name, () => {
  it('sits on the snow: the ramp surface a hand\'s width above it, posts and bars only a little buried', () => {
   const above = (v) => mesh.positions[v * 3 + 2] - terrain.height(mesh.positions[v * 3], mesh.positions[v * 3 + 1]);
   const padIndices = PARK.PAD_ALONG * PARK.PAD_ACROSS * 6; // the ramp surface is the first thing a kicker builds
   for (const f of features(FEATURE_KIND.KICKER)) {
    for (let i = 0; i < padIndices; i++) near(above(mesh.indices[f[3] + i]), PARK.LIFT_M, 1e-3, 'the ramp\'s lift');
   }
   for (const kind of [FEATURE_KIND.RAIL, FEATURE_KIND.FLAG]) {
    for (const f of features(kind)) {
     let lowest = Infinity;
     for (let i = 0; i < f[4]; i++) lowest = Math.min(lowest, above(mesh.indices[f[3] + i]));
     assert.ok(lowest > -0.35 && lowest < 0, 'a foot ' + lowest + ' m from the snow');
    }
   }
  });

  it('winds every triangle counter-clockwise seen from its normal, with unit normals', () => {
   for (let v = 0; v < mesh.normals.length; v += 3) {
    near(Math.hypot(mesh.normals[v], mesh.normals[v + 1], mesh.normals[v + 2]), 1, 1e-5, 'normal length');
   }
   const at = (i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
   for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [at(mesh.indices[t]), at(mesh.indices[t + 1]), at(mesh.indices[t + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const n = mesh.indices[t] * 3;
    const dot = cr[0] * mesh.normals[n] + cr[1] * mesh.normals[n + 1] + cr[2] * mesh.normals[n + 2];
    assert.ok(dot >= -1e-9, 'triangle ' + t / 3 + ' faces away (' + dot + ')');
   }
  });

  it('takes its colours from the Look, and the big kickers\' lip has its own', () => {
   const L = parkLook(look);
   const seen = new Set();
   for (let v = 0; v < mesh.colours.length; v += 3) {
    seen.add(Array.from(mesh.colours.subarray(v, v + 3)).map((c) => c.toFixed(4)).join());
   }
   const known = new Set(Object.values(L).map((c) => c.map((x) => Math.fround(x).toFixed(4)).join()));
   for (const c of seen) assert.ok(known.has(c), 'a colour not in the Look: ' + c);
   assert.ok(course.kickers.some((k) => k.big) === seen.has(L.bigLip.map((x) => Math.fround(x).toFixed(4)).join()));
   for (const c of Object.values(L)) assert.ok(c.every((x) => x >= 0 && x <= 1), 'in range');
  });

  it('stays small: counted in the same budget as the textures', () => {
   const bytes = parkMeshBytes(mesh);
   assert.ok(bytes.gpuBytes < 2 * 1048576, 'GPU bytes ' + bytes.gpuBytes);
   const sum = addGpuBytes(terrainTextureBytes(1000, 2450), bytes);
   assert.equal(sum.gpuBytes, terrainTextureBytes(1000, 2450).gpuBytes + bytes.gpuBytes);
  });

  it('is the same every time and uses no Math.random', () => {
   const real = Math.random;
   Math.random = () => { throw new Error('Math.random called'); };
   try {
    const again = buildParkMesh(course, terrain, look, frame);
    assert.deepEqual(Array.from(again.positions), Array.from(mesh.positions));
   } finally {
    Math.random = real;
   }
  });
 });

 describe('park culling, ' + name, () => {
  const out = new Uint32Array(mesh.indices.length);
  const brute = (camera) => {
   const half = [];
   for (let o = 0; o < mesh.features.length; o += FEATURE_STRIDE) {
    const dx = mesh.features[o] - camera.x;
    const dy = mesh.features[o + 1] - camera.y;
    const f = dx * camera.dirX + dy * camera.dirY;
    if (f > 0 && f < PARK_FAR_M - 5 && Math.abs(dx * camera.dirY - dy * camera.dirX) < f * 0.3) half.push(o);
   }
   return half;
  };

  it('keeps every feature clearly in view and drops those behind the camera', () => {
   const k = course.kickers[1] || { s: course.rails[4].s0 + 60 }; // a kicker, or on the play mountain the middle row of the jib (the camera 60 m before it)
   const p = { x: 0, y: 0 };
   course.point(k.s - 60, 0, p);
   const t = { x: 0, y: 0 };
   course.point(k.s - 59, 0, t);
   const len = Math.hypot(t.x - p.x, t.y - p.y);
   const camera = { x: p.x, y: p.y, dirX: (t.x - p.x) / len, dirY: (t.y - p.y) / len, fov: FOV };
   const n = cullPark(mesh.features, mesh.indices, camera, out);
   assert.ok(n > 0 && n < mesh.indices.length, 'some, not all: ' + n);
   const drawn = new Set(Array.from(out.subarray(0, n)));
   for (const o of brute(camera)) {
    for (let i = 0; i < mesh.features[o + 4]; i++) {
     assert.ok(drawn.has(mesh.indices[mesh.features[o + 3] + i]), 'a feature in view is missing');
    }
   }
   const behind = { ...camera, dirX: -camera.dirX, dirY: -camera.dirY };
   const m = cullPark(mesh.features, mesh.indices, behind, out);
   assert.notEqual(m, n, 'a camera turned round sees other features');
  });

  it('copies whole triangles and allocates nothing: the output is the caller\'s buffer', () => {
   const camera = { x: 0, y: 0, dirX: 1, dirY: 0, fov: FOV };
   const before = out.buffer;
   const n = cullPark(mesh.features, mesh.indices, camera, out);
   assert.equal(n % 3, 0);
   assert.equal(out.buffer, before);
  });
 });
}

// A stand-in for three.js: records what createParkMesh builds, to check it builds the buffers once.
function fakeThree() {
 const vec = function (...v) { this.v = v; };
 class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.ranges = []; this.updates = 0; }
  setUsage() {}
  clearUpdateRanges() { this.ranges = []; }
  addUpdateRange(start, count) { this.ranges.push([start, count]); }
  set needsUpdate(on) { if (on) this.updates++; }
 }
 class BufferGeometry {
  constructor() { this.attributes = {}; this.drawRange = { start: 0, count: Infinity }; }
  setAttribute(n, a) { this.attributes[n] = a; }
  setIndex(a) { this.index = a; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
 }
 const added = [];
 return { added, THREE: { Vector2: vec, Vector3: vec, BufferAttribute, BufferGeometry, DynamicDrawUsage: 35048,
  GLSL3: '300 es', FrontSide: 0, RawShaderMaterial: function (o) { Object.assign(this, o); },
  Mesh: function (geometry, material) { this.geometry = geometry; this.material = material; } } };
}

describe('park mesh on the GPU', () => {
 const { course, terrain, frame } = worldOf(maps['play mountain']);
 const shared = Object.fromEntries(['uCam', 'uDir', 'uScreen', 'uClip', 'uFar', 'uFogLut', 'uFog', 'uAux', 'uMapSize',
  'uGridOrigin', 'uGridU', 'uGridV', 'uObjSun', 'uObjSunLight'].map((n) => [n, { value: null }]));

 it('makes its buffers once: updates fill the same index buffer and the draw range, nothing else', () => {
  const { THREE } = fakeThree();
  const scene = { add: () => {} };
  const park = createParkMesh(THREE, scene, shared, course, terrain, look, frame);
  assert.equal(park.drawCalls, 1);
  assert.deepEqual(park.counts, { kickers: course.kickers.length, rails: course.rails.length,
   flags: flagPlacements(course, frame).length });
  let mesh = null;
  const glScene = { add: (m) => { mesh = m; } };
  const again = createParkMesh(THREE, glScene, shared, course, terrain, look, frame);
  const attrs = { ...mesh.geometry.attributes };
  const indexArray = mesh.geometry.index.array;
  const p = { x: 0, y: 0 };
  course.point((course.kickers[2] || { s: course.rails[2].s0 }).s - 50, 0, p);
  const down = frame.vecToWorld(0, 1, { x: 0, y: 0 }); // down the piste
  const camera = { x: p.x, y: p.y, dirX: down.x, dirY: down.y, fov: FOV };
  const first = again.update(camera);
  for (let i = 0; i < 20; i++) again.update({ ...camera, x: camera.x + i });
  assert.ok(first > 0);
  assert.equal(mesh.geometry.index.array, indexArray, 'the index buffer is the same');
  for (const [n, a] of Object.entries(attrs)) assert.equal(mesh.geometry.attributes[n], a, n + ' is the same');
  assert.equal(mesh.geometry.drawRange.count % 3, 0);
 });

 it('draws nothing when nothing is in view', () => {
  const { THREE } = fakeThree();
  let mesh = null;
  const park = createParkMesh(THREE, { add: (m) => { mesh = m; } }, shared, course, terrain, look, frame);
  assert.equal(park.update({ x: 1e6, y: 1e6, dirX: 1, dirY: 0, fov: FOV }), 0);
  assert.equal(mesh.geometry.drawRange.count, 0);
 });
});

describe('sun visibility for GPU objects', () => {
 const nx = 64;
 const ny = 96;
 for (const rotation of [0, 37 * Math.PI / 180, 300 * Math.PI / 180]) {
  const frame = createMapFrame({ originX: 1234.5, originY: -678.25, rotation });
  it('maps world xy to the aux texture\'s texel centres (map turned ' + rotation + ' rad)', () => {
   const uv = { u: 0, v: 0 };
   const world = { x: 0, y: 0 };
   const grid = { u: 0, v: 0 };
   for (const [gu, gv] of [[0.5, 0.5], [10.5, 20.5], [63.5, 95.5], [31.25, 47.75]]) {
    frame.toWorld(gu, gv, world);
    sunVisibilityUv(frame, world.x, world.y, nx, ny, uv);
    near(uv.u * nx, gu + 0.5, 1e-6, 'u');
    near(uv.v * ny, gv + 0.5, 1e-6, 'v');
    frame.toGrid(world.x, world.y, grid);
    near(uv.u, (grid.u + 0.5) / nx, 1e-9, 'the snow\'s uv (vGrid + 0.5) / size');
   }
  });

  it('reads the texel the baked visibility of that place is in (map turned ' + rotation + ' rad)', () => {
   const vis = new Uint8Array(nx * ny);
   for (let k = 0; k < vis.length; k++) vis[k] = (k * 7) % 251;
   const uv = { u: 0, v: 0 };
   const world = { x: 0, y: 0 };
   for (const [i, j] of [[3, 4], [40, 70], [63, 95], [0, 0]]) {
    frame.toWorld(i, j, world); // the snow samples (grid + 0.5) / size: grid i is texel i's centre
    sunVisibilityUv(frame, world.x, world.y, nx, ny, uv);
    const texel = Math.floor(uv.v * ny) * nx + Math.floor(uv.u * nx);
    assert.equal(vis[texel], vis[j * nx + i], 'texel (' + i + ', ' + j + ')');
   }
  });

  it('hands the shader the frame\'s origin and axes', () => {
   const g = sunVisibilityGrid(frame);
   assert.deepEqual(g.origin, [frame.originX, frame.originY]);
   assert.deepEqual(g.gridU, [frame.ux, frame.uy]);
   assert.deepEqual(g.gridV, [frame.vx, frame.vy]);
  });
 }

 it('reads a tree\'s visibility past its own baked shadow, toward the sun', () => {
  const S = SUN_SHADOW;
  assert.ok(TREE_MESH.SUN_SAMPLE_M > S.TREE_ROOT_HALF_WIDTH_M + 3 * S.TREE_SOFT_ROOT_M);
 });

 it('has one GLSL lookup, with the snow\'s uv and the light chunk', () => {
  assert.match(SUN_VISIBILITY_GLSL, /sunVisibilityAt\(vec2 world\)/);
  assert.match(SUN_VISIBILITY_GLSL, /\(grid \+ 0\.5\) \/ uMapSize/);
  assert.match(SUN_VISIBILITY_GLSL, /\)\.a;/);
  assert.match(SUN_LIGHT_GLSL, /sunLit\(vec3 n, vec3 ambient, float visibility\)/);
 });
});
