// @areas view
// The GPU terrain (E0, ?renderer=gl): its pure parts in Node (projection, mesh layout, baking, the Look's uniforms,
// the trees' horizon) and, through the façade, its choice and fallback (Node has no WebGL: it always falls back).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './harness.js';
import { FOV, RAY_FAR } from '../src/core/config.js';
import { createProjection, setProjection, projectGl } from '../src/view/gl/gl-projection.js';
import { CLIPMAP, MORPH, levelGrid, levelOrigin, levelSpacing, inHole } from '../src/view/gl/terrain-mesh.js';
import { bakeHeights, bakeSlopes, bakeRelief, bakeAux, bakePaint, trackRows, halfArray, featureWeight,
 reliefByte } from '../src/view/gl/terrain-bake.js';
import { makeDetailTexture, DETAIL_SIZE } from '../src/view/gl/detail-texture.js';
import { snowLook, sunOnGrid, FOG_LUT_SIZE } from '../src/view/gl/snow-material.js';
import { skyLook } from '../src/view/gl/sky-material.js';
import { createFpsMeter, tickFps } from '../src/view/fps-meter.js';
import { createHangaLook } from '../src/view/look/hanga.js';
import { hexRgb } from '../src/view/look/look.js';
import { createMapFrame } from '../src/world/map-frame.js';
import { Terrain } from '../src/world/terrain.js';

const require = createRequire(import.meta.url);
const look = createHangaLook(require('../art/gresca-hanga-spec.js'));

// A seeded 0..1 sequence for test points (an LCG: no Math.random in tests).
function sequence(seed) {
 let x = seed;
 return () => {
  x = (x * 1664525 + 1013904223) >>> 0;
  return x / 4294967296;
 };
}

describe('GL terrain projection', () => {
 it('puts world points on the same canvas pixel as the 2D sprites (within 1 px)', async () => {
  const g = await load();
  const G = g.raw; // world metres
  const rng = sequence(7);
  const p = createProjection();
  const gl = { X: 0, Y: 0, f: 0 };
  let worst = 0;
  let checked = 0;
  for (const [s, d, turn] of [[520, 0, 0], [900, 8, 0.5], [1400, -10, -0.7], [1900, 4, 0.2]]) {
   g.place({ s, d });
   G.set({ heading: G.state().heading + turn, vx: 0, vy: 0 });
   g.frames(30);
   const camera = G.state().camera;
   const screen = G.debug.screen();
   setProjection(p, camera, screen.width, screen.height);
   for (let i = 0; i < 300; i++) {
    const along = 3 + rng() * 430; // m ahead
    const angle = (rng() - 0.5) * FOV;
    const wx = camera.x + Math.cos(camera.heading - angle) * along;
    const wy = camera.y + Math.sin(camera.heading - angle) * along;
    const h = camera.height - 40 + rng() * 60;
    const sprite = G.debug.project(wx, wy, h);
    if (!sprite || !projectGl(p, wx, wy, h, gl)) continue;
    worst = Math.max(worst, Math.abs(gl.X - sprite.X), Math.abs(gl.Y - sprite.Y));
    checked++;
   }
  }
  assert.ok(checked > 1000, 'points checked: ' + checked);
  assert.ok(worst <= 1, 'worst disagreement ' + worst.toFixed(3) + ' px');
 });

 it('clips points behind the near plane', async () => {
  const g = await load();
  g.place({ s: 520 });
  g.frames(2);
  const camera = g.raw.state().camera;
  const p = setProjection(createProjection(), camera, 820, 1180);
  const behind = projectGl(p, camera.x - camera.dirX * 5, camera.y - camera.dirY * 5, camera.height - 10,
   { X: 0, Y: 0, f: 0 });
  assert.equal(behind, false);
 });
});

describe('GL terrain mesh (clipmap)', () => {
 const n = CLIPMAP.cells;

 it('has full level 0 and ringed coarser levels, two triangles per cell', () => {
  const full = levelGrid(n, false);
  const ring = levelGrid(n, true);
  assert.equal(full.positions.length, (n + 1) ** 2 * 3);
  assert.equal(full.index.length, n * n * 6);
  assert.equal(ring.index.length, (n * n - (n / 2) ** 2) * 6);
  for (const k of ring.index) assert.ok(k < (n + 1) ** 2);
 });

 it('reaches past the far end of the render', () => {
  const last = CLIPMAP.levels - 1;
  const half = n / 2 * levelSpacing(last) - CLIPMAP.snapM / 2; // worst case: the camera half a snap off the centre
  assert.ok(half > RAY_FAR, half + ' m');
 });

 it('fits each level\'s hole to the finer level and keeps every vertex on a whole texel', () => {
  const o = { u: 0, v: 0 };
  for (const [camU, camV] of [[500.3, 1203.9], [12.7, 3.2], [999.9, 2449.1]]) {
   for (let level = 1; level < CLIPMAP.levels; level++) {
    const s = levelSpacing(level);
    const outer = levelOrigin(level, camU, camV, o);
    const holeU = outer.u + n / 4 * s;
    const holeV = outer.v + n / 4 * s;
    const inner = levelOrigin(level - 1, camU, camV, { u: 0, v: 0 });
    assert.deepEqual([holeU, holeV], [inner.u, inner.v], 'level ' + level);
    assert.ok(Number.isInteger(outer.u / s) && Number.isInteger(outer.v / s));
   }
  }
  assert.ok(inHole(n / 4, n / 4, n) && !inHole(n / 4 - 1, n / 4, n) && !inHole(3 * n / 4, n / 2, n));
 });

 it('morphs exactly the odd vertices of the outer edge onto the coarser line', () => {
  const { positions } = levelGrid(n, true);
  for (let k = 0; k < positions.length; k += 3) {
   const [i, j, m] = [positions[k], positions[k + 1], positions[k + 2]];
   const onEdgeI = (j === 0 || j === n) && i % 2 === 1;
   const onEdgeJ = (i === 0 || i === n) && j % 2 === 1;
   assert.equal(m, onEdgeI ? MORPH.ALONG_I : onEdgeJ ? MORPH.ALONG_J : MORPH.NONE, i + ',' + j);
  }
 });
});

describe('GL terrain baking', () => {
 // a 40 × 30 m grid, a tilted plane with a 1 m deep pit at (20, 15), placed turned 37 degrees
 const nx = 40;
 const ny = 30;
 const frame = createMapFrame({ originX: 100, originY: 50, rotation: 37 * Math.PI / 180 });
 const data = new Float32Array(nx * ny);
 for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = 0.3 * i - 0.2 * j;
 data[15 * nx + 20] -= 1;
 const terrain = Terrain.create({ base: Terrain.grid(data, nx, ny, 1, frame), groomed: () => 0.5 });

 it('bakes the terrain\'s own height at every grid point, through the map frame', () => {
  const h = bakeHeights(terrain, frame, nx, ny);
  for (let k = 0; k < h.length; k++) assert.ok(Math.abs(h[k] - data[k]) < 1e-4, 'texel ' + k);
 });

 it('bakes slopes on the grid and relief that is + in a hollow', () => {
  const s = bakeSlopes(data, nx, ny);
  const k = 5 * nx + 5;
  assert.ok(Math.abs(s[k * 2] - 0.3) < 1e-6 && Math.abs(s[k * 2 + 1] + 0.2) < 1e-6);
  const r = bakeRelief(data, nx, ny);
  assert.ok(r[15 * nx + 20] > 0.9);
  assert.ok(Math.abs(r[15 * nx + 8]) < 0.01); // a plane has no relief (away from the pit and the edges)
  assert.equal(reliefByte(0), 128);
  assert.ok(reliefByte(1) > reliefByte(0) && reliefByte(-5) === 0 && reliefByte(5) === 255);
 });

 it('bakes groomed, ski tracks and painted features into bytes', () => {
  const aux = bakeAux(new Float32Array(nx * ny), terrain, frame, nx, ny);
  assert.equal(aux[1], 128); // groomed 0.5
  assert.equal(aux[2], 255); // no track
  const col0 = new Uint8ClampedArray(nx * ny * 4).fill(200);
  const col = col0.slice();
  col[(3 * nx + 4) * 4] = 160; // a track darkened texel (4, 3) to 0.8
  trackRows(aux, col, col0, nx, 3, 3);
  assert.equal(aux[(3 * nx + 4) * 4 + 2], 204);
  assert.equal(aux[(3 * nx + 5) * 4 + 2], 255);
  const snow = col0.slice();
  snow[0] = 199;
  snow[4] = 120;
  assert.equal(featureWeight(col0, snow, 0), 0);
  assert.equal(featureWeight(col0, snow, 4), 255);
  const paint = bakePaint(col0, snow);
  assert.deepEqual([paint[3], paint[7], paint[4]], [0, 255, 200]);
  assert.equal(col0[7], 200, 'the colour map is left as it is');
 });

 it('converts to half floats exactly where they can', () => {
  const h = halfArray([0, 1, -2, 0.5, 65504, 1e9, 1e-9, 0.333251953125]);
  assert.deepEqual(Array.from(h), [0, 0x3c00, 0xc000, 0x3800, 0x7bff, 0x7c00, 0, 0x3555]);
 });

 it('makes a tiling detail texture, the same every time', () => {
  const a = makeDetailTexture();
  assert.equal(a.length, DETAIL_SIZE * DETAIL_SIZE * 4);
  assert.deepEqual(a.subarray(0, 64), makeDetailTexture().subarray(0, 64));
  // across the seam the slope changes no more than inside the tile
  const at = (i, j, c) => a[(j * DETAIL_SIZE + i) * 4 + c];
  let inside = 0;
  let seam = 0;
  for (let j = 0; j < DETAIL_SIZE; j++) {
   inside = Math.max(inside, Math.abs(at(100, j, 0) - at(101, j, 0)));
   seam = Math.max(seam, Math.abs(at(DETAIL_SIZE - 1, j, 0) - at(0, j, 0)));
  }
  assert.ok(seam <= inside * 1.5 + 2, seam + ' vs ' + inside);
 });
});

describe('GL terrain colours come from the Look', () => {
 const frame = createMapFrame({ rotation: 0.6 });

 it('takes the snow tones, fog and sun from the Look', () => {
  const s = snowLook(look, frame);
  const tone = (...a) => look.terrainTone(...a, [0, 0, 0]).map((c) => c / 255);
  assert.deepEqual(s.shade, tone(0, 0, 0, 0));
  assert.deepEqual(s.lit, tone(1, 0, 0, 0));
  assert.deepEqual(s.groomLit, tone(1, 1, 0, 0));
  assert.deepEqual(s.rock, tone(0, 0, 0, 1));
  assert.deepEqual(s.fog, look.fog.rgb.map((c) => c / 255));
  assert.equal(s.fogLut.length, FOG_LUT_SIZE);
  assert.equal(s.fogLut[FOG_LUT_SIZE - 1], Math.fround(look.fog.amount(RAY_FAR, RAY_FAR)));
  assert.equal(s.fogLut[20], Math.fround(look.fog.amount(20 / (FOG_LUT_SIZE - 1) * RAY_FAR, RAY_FAR)));
  const sun = hexRgb(look.sky.sun.colour);
  assert.ok(Math.abs(s.sunTint[1] - sun[1] / Math.max(...sun)) < 1e-12);
  assert.ok(s.shade[2] > s.shade[0], 'the shade is bluish (lavender)');
 });

 it('puts the sun at the Look\'s elevation and, turned with the map, at the same place on the grid', () => {
  const s = sunOnGrid(look.sky, frame);
  assert.ok(Math.abs(Math.hypot(...s) - 1) < 1e-12);
  assert.ok(Math.abs(Math.asin(s[2]) * 180 / Math.PI - look.sky.sun.elevationDeg) < 1e-9);
  const t = sunOnGrid(look.sky, createMapFrame({ rotation: -1.1 }));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(s[i] - t[i]) < 1e-12);
 });

 it('takes the sky gradient and sun colour from the Look', () => {
  const s = skyLook(look.sky);
  assert.equal(s.count, look.sky.stops.length);
  look.sky.stops.forEach(([offset, colour], i) => {
   const rgb = hexRgb(colour);
   assert.deepEqual(Array.from(s.stops.subarray(i * 4, i * 4 + 4)),
    [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, offset].map(Math.fround));
  });
 });
});

describe('GL terrain in the game', () => {
 it('fills the trees\' horizon exactly as the CPU raycast does', async () => {
  const g = await load();
  for (const s of [520, 900, 1400]) {
   g.place({ s, d: 6 });
   g.frames(3);
   const cpu = g.debug.occlusion();
   assert.ok(cpu.length > 0);
   assert.deepEqual(g.debug.horizonPass(), cpu, 's ' + s);
  }
 });

 it('draws with the CPU raycaster by default', async () => {
  const g = await load();
  assert.deepEqual(g.raw.debug.renderer(), { name: 'cpu', fallback: null });
 });

 it('falls back to the CPU with a warning when three.js is missing or there is no WebGL2', async () => {
  for (const [THREE, why] of [[undefined, /three\.js/], [{}, /./]]) { // {}: a three.js that cannot draw
   const warnings = [];
   const g = await load({ renderer: 'gl', THREE, warn: (m) => warnings.push(m) });
   const r = g.raw.debug.renderer();
   assert.equal(r.name, 'cpu');
   assert.match(r.fallback, why);
   assert.equal(warnings.length, 1);
   assert.match(warnings[0], /CPU/);
   g.place({ s: 520 });
   g.frames(2);
   assert.ok(g.debug.renderPixels().some((v) => v > 0), 'the CPU raycaster drew');
   assert.deepEqual(Object.values(g.raw.debug.stages), Object.values(g.debug.stages));
  }
 });
});

describe('fps readout', () => {
 it('averages frame time and refreshes its text twice a second', () => {
  const m = createFpsMeter();
  tickFps(m, 1 / 60, 3, 'gl');
  assert.match(m.text, /^gl {2}60 fps {2}16\.7 ms {2}cpu 0\.2 ms$/);
  const text = m.text;
  tickFps(m, 1 / 30, 3, 'gl');
  assert.equal(m.text, text, 'not refreshed within half a second');
  for (let i = 0; i < 200; i++) tickFps(m, 1 / 30, 3, 'gl');
  assert.match(m.text, /^gl {2}30 fps {2}33\.3 ms/);
 });
});
