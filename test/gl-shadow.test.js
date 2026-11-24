// E2: the GPU terrain's soft sun shadows, in Node: the baked ridge and tree shadows, the rider's shadow, the texture
// budget and the painted shadows the GPU path leaves out. (CI cannot run WebGL: the shader is checked in the preview.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bakeSunVisibility, castTreeShadows, treeShadowCover, SUN_SHADOW } from '../src/view/gl/sun-shadow.js';
import { riderShadow } from '../src/view/gl/rider-shadow.js';
import { bakeAux, AUX_CHANNELS } from '../src/view/gl/terrain-bake.js';
import { sunOnGrid, snowLook, SNOW_FRAGMENT } from '../src/view/gl/snow-material.js';
import { terrainTextureBytes, shadowBakeScratchBytes } from '../src/view/gl/gl-budget.js';
import { createHangaLook } from '../src/view/look/hanga.js';
import { createMapFrame } from '../src/world/map-frame.js';
import { paintTrees } from '../src/view/colour-map.js';

const require = createRequire(import.meta.url);
const look = createHangaLook(require('../art/gresca-hanga-spec.js'));
const DEG = Math.PI / 180;

// A flat grid with a triangular ridge (peak height m, 30 m half-width) along the column RIDGE_U, for a sun along +u.
const NX = 160;
const NY = 8;
const RIDGE_U = 80;
const RIDGE_HALF_WIDTH = 30; // m
function ridgeGrid(height) {
 const h = new Float32Array(NX * NY);
 for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX; i++) h[j * NX + i] = Math.max(0, height * (1 - Math.abs(i - RIDGE_U) / RIDGE_HALF_WIDTH));
 }
 return h;
}
const sunAlong = (elevationDeg, sign = 1) => [sign * Math.cos(elevationDeg * DEG), 0, Math.sin(elevationDeg * DEG)];

describe('terrain shadow bake', () => {
 const sun = sunAlong(20); // the sun is at +u: light travels toward -u, so the shadow falls at u < RIDGE_U
 const vis = bakeSunVisibility(ridgeGrid(20), NX, NY, sun);
 const row = (i) => vis[4 * NX + i];

 it('shades the side of a ridge away from the sun and not the sunny side', () => {
  const shadowLength = 20 / Math.tan(20 * DEG); // about 55 m
  for (let i = RIDGE_U + 1; i < NX - 1; i++) assert.equal(row(i), 255, 'sunny side, u ' + i);
  assert.ok(row(RIDGE_U - 20) < 20, 'deep in the shadow');
  assert.ok(row(Math.round(RIDGE_U - shadowLength * 0.5)) < 20);
  assert.equal(row(RIDGE_U - Math.round(shadowLength * 1.6)), 255, 'far past the shadow it is sunny again');
 });

 it('has a penumbra: visibility only rises with distance behind the ridge (monotonic), through the mid-greys', () => {
  let deepest = RIDGE_U;
  for (let i = RIDGE_U; i >= 3; i--) if (row(i) < row(deepest)) deepest = i;
  let last = -1;
  let grey = 0;
  for (let i = deepest; i >= 3; i--) { // from the darkest point out
   const v = row(i);
   assert.ok(v >= last, 'u ' + i + ': ' + v + ' < ' + last);
   last = v;
   if (v > 20 && v < 235) grey++;
  }
  assert.ok(grey >= 4, 'a soft edge, not a step: ' + grey + ' grey texels');
 });

 it('is lit everywhere on flat ground, and with the sun straight overhead', () => {
  assert.ok(bakeSunVisibility(new Float32Array(NX * NY), NX, NY, sun).every((v) => v === 255));
  assert.ok(bakeSunVisibility(ridgeGrid(20), NX, NY, [0, 0, 1]).every((v) => v === 255));
 });

 it('moves the shadow to the other side when the sun does', () => {
  const other = bakeSunVisibility(ridgeGrid(20), NX, NY, sunAlong(20, -1));
  assert.ok(other[4 * NX + RIDGE_U + 20] < 20);
  assert.equal(other[4 * NX + RIDGE_U - 20], 255);
 });

 it('makes a longer shadow of a taller ridge and of a lower sun', () => {
  const length = (v) => v.reduce((n, x, k) => n + (x < 128 && k < RIDGE_U ? 1 : 0), 0);
  const lowSun = bakeSunVisibility(ridgeGrid(20), NX, NY, sunAlong(12));
  assert.ok(length(lowSun) > length(vis));
  assert.ok(length(bakeSunVisibility(ridgeGrid(40), NX, NY, sun)) > length(vis));
 });

 it('blocks more the higher the ridge stands over the sun\'s ray', () => {
  const rays = [10, 14, 18, 24, 36].map((height) => bakeSunVisibility(ridgeGrid(height), NX, NY, sun)[4 * NX + 60]);
  for (let n = 1; n < rays.length; n++) assert.ok(rays[n] <= rays[n - 1]);
 });
});

// The compass bearing (deg, clockwise from north) of a grid vector (u, v) seen from the world.
function bearingOf(frame, du, dv) {
 const w = frame.vecToWorld(du, dv, { x: 0, y: 0 });
 return (Math.atan2(w.x, w.y) / DEG + 360) % 360;
}

describe('tree shadows', () => {
 const size = 120;
 const tree = new Float32Array([60, 60]);

 // The centroid direction (grid u, v) of the sun taken away around a lone tree.
 function shadowDirection(sun) {
  const vis = new Uint8Array(size * size).fill(255);
  castTreeShadows(vis, size, size, tree, sun);
  let su = 0;
  let sv = 0;
  for (let v = 0; v < size; v++) {
   for (let u = 0; u < size; u++) {
    const taken = 255 - vis[v * size + u];
    su += taken * (u + 0.5 - 60);
    sv += taken * (v + 0.5 - 60);
   }
  }
  return [su, sv];
 }

 for (const rotation of [0, 37 * DEG, 300 * DEG, -1.1]) {
  it('falls away from the sun azimuth through the map frame (rotation ' + Math.round(rotation / DEG) + ' deg)', () => {
   const frame = createMapFrame({ rotation });
   const [du, dv] = shadowDirection(sunOnGrid(look.sky, frame));
   const want = (look.sky.sun.azimuthDeg - frame.rotation / DEG + 180) % 360;
   const got = bearingOf(frame, du, dv);
   const off = Math.abs(((got - want + 540) % 360) - 180);
   assert.ok(off < 3, 'shadow bearing ' + got.toFixed(1) + ' vs ' + want.toFixed(1));
  });
 }

 it('is soft, tapered, at most as long as allowed, and never sunnier than before', () => {
  const sun = sunOnGrid(look.sky, createMapFrame());
  const vis = new Uint8Array(size * size).fill(255);
  castTreeShadows(vis, size, size, tree, sun);
  assert.ok(vis.every((v) => v >= 255 * (1 - SUN_SHADOW.TREE_STRENGTH) - 1));
  const mids = vis.filter((v) => v > 130 && v < 250).length;
  assert.ok(mids > 20, 'soft edges');
  const flat = Math.hypot(sun[0], sun[1]);
  const length = Math.min(SUN_SHADOW.TREE_MAX_LENGTH_M, SUN_SHADOW.TREE_HEIGHT_M * flat / sun[2]);
  assert.equal(treeShadowCover(length * 1.5 + 5, 0, length), 0);
  assert.ok(treeShadowCover(0, 0, length) > 0.99);
  assert.ok(treeShadowCover(length * 0.5, 0, length) < treeShadowCover(0, 0, length));
  assert.ok(treeShadowCover(2, 0.8, length) > treeShadowCover(2, 1.8, length));
 });
});

describe('rider shadow', () => {
 const sun = sunAlong(22);
 const out = { du: 0, dv: 0, axisU: 0, axisV: 0, along: 0, across: 0, strength: 0, soft: 0 };
 const at = (air) => ({ ...riderShadow(air, sun, out) });

 it('lies under the rider on the ground and slides away from the sun in the air', () => {
  const ground = at(0);
  assert.equal(Math.abs(ground.du), 0);
  assert.equal(Math.abs(ground.dv), 0);
  const air = at(3);
  assert.ok(air.du < 0, 'away from the sun (+u)');
  assert.ok(Math.abs(air.du - -3 / Math.tan(22 * DEG)) < 1e-9);
  assert.ok(ground.axisU < 0 && Math.abs(Math.hypot(ground.axisU, ground.axisV) - 1) < 1e-12);
 });

 it('grows softer, lighter and bigger with air height', () => {
  const heights = [0, 0.5, 1, 2, 4, 8];
  for (let n = 1; n < heights.length; n++) {
   const a = at(heights[n - 1]);
   const b = at(heights[n]);
   assert.ok(b.soft >= a.soft && b.strength < a.strength && b.along > a.along && b.across > a.across);
  }
  assert.ok(at(100).soft <= 1);
 });

 it('writes into the object it is given and returns it', () => {
  assert.equal(riderShadow(1, sun, out), out);
  assert.equal(Math.abs(riderShadow(-2, sun, out).du), 0, 'below the ground counts as on it');
 });
});

describe('the snow shader', () => {
 it('uses no GLSL ES 3.0 reserved word as a name (a compile error the Node tests cannot see)', () => {
  const reserved = ['cast', 'common', 'partition', 'active', 'filter', 'input', 'output', 'sample', 'superp',
   'namespace', 'using', 'template', 'this', 'resource', 'subroutine', 'inline', 'noinline', 'public', 'external',
   'interface',
   'long', 'short', 'half', 'fixed', 'unsigned', 'hvec2', 'fvec2', 'sizeof', 'goto', 'enum', 'typedef', 'union',
   'asm', 'class', 'volatile', 'static', 'extern'];
  for (const word of reserved) {
   assert.ok(!new RegExp('\\b(float|vec[234]|int|bool)\\s+' + word + '\\b').test(SNOW_FRAGMENT), word);
  }
  assert.match(SNOW_FRAGMENT, /uRiderShadow/);
 });
});

describe('shadow texture memory and the GPU path', () => {
 it('costs no texture: the sun visibility is the aux texture\'s alpha', () => {
  assert.deepEqual(AUX_CHANNELS, ['relief', 'groomed', 'track', 'sunVisibility']);
  assert.equal(AUX_CHANNELS.length, 4);
  const nx = 1000;
  const ny = 2450;
  const before = 38 * 1048576; // E1: about 38 MiB for the procedural map
  const bytes = terrainTextureBytes(nx, ny);
  assert.ok(Math.abs(bytes.gpuBytes - before) < 1.5 * 1048576, 'gpu ' + bytes.gpuBytes);
  assert.equal(shadowBakeScratchBytes(nx, ny), nx * ny, 'the bake\'s scratch is one byte a texel, dropped at boot');
 });

 it('writes the visibility into aux alpha (255 without one) and keeps the other channels', () => {
  const frame = createMapFrame();
  const terrain = { groomed: () => 0.5 };
  const relief = new Float32Array(4);
  const plain = bakeAux(relief, terrain, frame, 2, 2);
  const shaded = bakeAux(relief, terrain, frame, 2, 2, Uint8Array.from([0, 64, 128, 255]));
  assert.deepEqual([3, 7, 11, 15].map((o) => plain[o]), [255, 255, 255, 255]);
  assert.deepEqual([3, 7, 11, 15].map((o) => shaded[o]), [0, 64, 128, 255]);
  assert.deepEqual(Array.from(shaded.filter((_, o) => o % 4 !== 3)), Array.from(plain.filter((_, o) => o % 4 !== 3)));
 });

 it('takes the shadow colour from the Look', () => {
  const t = snowLook(look, createMapFrame()).shadowTint;
  const hex = look.colour('powderShade');
  assert.deepEqual(t.map((x) => Math.round(x * 255)), [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)));
 });

 it('paints the tree shadows into the colour map for the CPU raycaster only', () => {
  const frame = createMapFrame();
  const fills = [];
  const ctx = {
   fillStyle: '', beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
   fill() { fills.push(this.fillStyle); },
  };
  const trees = [{ x: 10, y: -10 }, { x: 20, y: -30 }];
  paintTrees(ctx, trees, frame, look.colour, true);
  assert.deepEqual(fills, ['mapTreeShadow', 'treeCrown', 'mapTreeShadow', 'treeCrown'].map(look.colour));
  fills.length = 0;
  paintTrees(ctx, trees, frame, look.colour, false);
  assert.deepEqual(fills, ['treeCrown', 'treeCrown'].map(look.colour), 'the GPU bakes its own soft shadows');
 });
});
