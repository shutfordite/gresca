// @areas view
// Art spec v1.5: the environment data (trees, treeline, bushes, rocks, sky, backdrop peaks) and the new El Tarter
// keys.
// Everything in v1.4.0 must be unchanged, and projectRider must give exactly the v1.4 result.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createProjection } from '../tools/map-compiler/core.js';
import { selectParts, runCourse, terrainLayer, computeHorizon } from '../src/world/map-file/course-run.js';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const V14 = require('./fixtures/hanga-spec-v1.4.0.cjs');
const ENV = HANGA.environment;
const TARTER = HANGA.maps['el-tarter'];
const readJson = (name) => JSON.parse(fs.readFileSync(new URL('../maps/' + name, import.meta.url), 'utf8'));
const TERRAIN = readJson('el-tarter.terrain.json');
const COURSE = readJson('el-tarter.course.json');

const RAD_TO_DEG = 180 / Math.PI;
const NEW_MAP_KEYS = ['backdrop', 'treeline', 'meanSlopeDegData', 'heightRangeM', 'courseAltitudeM', 'startWorld',
 'fallLineCompassDeg', 'sunData', 'dataNote'];
const NEW_ROLES = ['pineLit', 'fir', 'firS', 'firLit', 'snowLoad', 'snowLoadS', 'krummholz', 'krummholzS', 'scrub',
 'scrubS', 'rhodo', 'rockLit', 'scree', 'screeS', 'cliff', 'mtnMid', 'mtnMidS', 'mtnMidCap', 'alpenglow', 'sunGlow'];
const HEX = /^#[0-9A-F]{6}$/i;
const BEARING_TOL_DEG = 0.1;
const DIST_TOL_M = 1;

const isObject = (v) => v !== null && typeof v === 'object';
const hasRole = (role) => role in HANGA.palette;
const inRange = (v, lo, hi, msg) => assert.ok(Number.isFinite(v) && v >= lo && v <= hi, `${msg}: ${v}`);

const asLeaf = (v) => (typeof v === 'function' ? v.toString() : v);
// Every [path, value] leaf of a value; functions are leaves compared by their source.
function leaves(value, path = '', out = []) {
 if (isObject(value) && Object.keys(value).length > 0) {
  for (const [key, child] of Object.entries(value)) leaves(child, path + '/' + key, out);
 } else {
  out.push([path, asLeaf(value)]);
 }
 return out;
}
function valueAt(root, path) {
 return path.split('/').slice(1).reduce((node, key) => (isObject(node) ? node[key] : undefined), root);
}
// Every number in a value, for NaN checks.
const numbers = (v) => (typeof v === 'number' ? [v] : isObject(v) ? Object.values(v).flatMap(numbers) : []);
// Every role named in the environment: fields called role or *Role, objects called roles, and contrast pairs.
function roleRefs(value, key = '', out = []) {
 if (typeof value === 'string') {
  if (key === 'role' || key.endsWith('Role') || key === 'a' || key === 'b') out.push(value);
 } else if (isObject(value) && !Array.isArray(value)) {
  for (const [k, child] of Object.entries(value)) {
   if (key === 'roles' && typeof child === 'string') out.push(child);
   else roleRefs(child, k, out);
  }
 } else if (Array.isArray(value)) {
  value.forEach((child) => roleRefs(child, key, out));
 }
 return out;
}

test('v1.5 is additive over v1.4.0', async (t) => {
 await t.test('every key path and value of v1.4.0 is unchanged, apart from version', () => {
  const was = leaves(V14).filter(([path]) => path !== '/version');
  assert.ok(was.length > 3000, `${was.length} leaves checked`);
  for (const [path, value] of was) assert.deepEqual(asLeaf(valueAt(HANGA, path)), value, path);
 });
 await t.test('what is new: the environment section and El Tarter keys only', () => {
  assert.equal(HANGA.version, '1.5.0');
  assert.deepEqual(Object.keys(HANGA).filter((k) => !(k in V14)), ['environment']);
  assert.deepEqual(Object.keys(HANGA.maps['el-tarter']).filter((k) => !(k in V14.maps['el-tarter'])), NEW_MAP_KEYS);
  assert.deepEqual(Object.keys(HANGA.maps.procedural), Object.keys(V14.maps.procedural));
  const added = Object.keys(HANGA.palette).filter((k) => !(k in V14.palette));
  assert.deepEqual(added, NEW_ROLES, 'palette gains exactly the new roles');
 });
 await t.test('projectRider gives the v1.4 draw list for a spread of rigs, poses, yaws and options', () => {
  const optionSets = [undefined, {}, { cameraPitchDeg: 37 }, { twistDeg: 15, headYawDeg: -25 },
   { cameraPitchDeg: 30, twistDeg: -20, headYawDeg: 40, bodyPitchDeg: 120 }];
  let count = 0;
  for (const rig of ['ski', 'board']) {
   for (const pose of V14.rider.poseOrder[rig]) {
    for (const stance of ['regular', 'goofy']) {
     for (const yaw of [-135, -30, 0, 45, 90, 180]) {
      for (const options of optionSets) {
       const want = JSON.stringify(V14.projectRider(rig, pose, yaw, 25, 4, stance, options));
       const got = JSON.stringify(HANGA.projectRider(rig, pose, yaw, 25, 4, stance, options));
       assert.equal(got, want, `${rig} ${pose}`);
       count++;
      }
     }
    }
   }
  }
  assert.ok(count > 1000, `${count} calls compared`);
 });
 await t.test('the helper functions are the same code as v1.4', () => {
  for (const name of Object.keys(V14).filter((k) => typeof V14[k] === 'function')) {
   assert.equal(HANGA[name].toString(), V14[name].toString(), name);
  }
 });
});

test('environment: structure, roles and numbers', async (t) => {
 await t.test('required sections and sets exist', () => {
  for (const key of ['trees', 'treeline', 'bushes', 'rocks', 'sky', 'backdrops', 'contrastTargets']) {
   assert.ok(isObject(ENV[key]), key);
  }
  assert.deepEqual(Object.keys(ENV.trees.sets), ['pine', 'sugi']);
  assert.deepEqual(Object.keys(ENV.trees.sets.pine.species), ['uncinata', 'fir']);
  assert.deepEqual(Object.keys(ENV.bushes.kinds), ['krummholz', 'juniper', 'rhododendron', 'grassTuft']);
  assert.deepEqual(Object.keys(ENV.rocks.kinds), ['boulder', 'outcrop', 'screeField', 'cliffBand']);
  assert.deepEqual(ENV.backdrops.pyrenees.layers.map((l) => l.id), ['near', 'mid', 'far']);
  assert.equal(TARTER.treeSet, 'pine');
  assert.ok(ENV.trees.sets[TARTER.treeSet] && ENV.backdrops[TARTER.backdrop], 'El Tarter finds its sets');
  assert.equal(HANGA.maps.procedural.treeSet in ENV.trees.sets, true);
 });
 await t.test('every number is finite and no colour is a raw hex', () => {
  numbers(ENV).forEach((n) => assert.ok(Number.isFinite(n)));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(JSON.stringify(ENV)), 'no raw hex');
  for (const role of NEW_ROLES) assert.match(HANGA.palette[role], HEX, role);
 });
 await t.test('every role the environment names exists', () => {
  const refs = roleRefs(ENV);
  assert.ok(refs.length > 90, `${refs.length} references`);
  for (const role of new Set(refs)) assert.ok(hasRole(role), `role ${role}`);
  for (const role of NEW_ROLES) assert.ok(refs.includes(role), `${role} is used`);
 });
 await t.test('contrast targets hold', () => {
  const contrast = (a, b) => {
   const lum = (role) => {
    const hex = HANGA.palette[role];
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
     .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
     .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
   };
   const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
   return (hi + 0.05) / (lo + 0.05);
  };
  assert.ok(ENV.contrastTargets.length >= 20);
  for (const { a, b, min, why } of ENV.contrastTargets) {
   assert.ok(contrast(a, b) >= min, `${why}: ${a} on ${b} is ${contrast(a, b).toFixed(2)}, needs ${min}`);
  }
 });
});

test('environment: trees, treeline, bushes and rocks', async (t) => {
 await t.test('tree species: ranges, profiles and snow load', () => {
  for (const [setId, set] of Object.entries(ENV.trees.sets)) {
   for (const [id, tree] of Object.entries(set.species)) {
    const name = `${setId}.${id}`;
    const { heightM, crownRatio, trunkClearM, reference, profile, render } = tree;
    for (const range of [heightM, crownRatio, trunkClearM]) {
     assert.ok(range.min > 0 && range.min <= range.typical && range.typical <= range.max, name);
    }
    inRange(heightM.max, 3, 45, name);
    inRange(crownRatio.max, 0.1, 1, name);
    assert.ok(trunkClearM.typical < reference.heightM * 0.4, `${name}: trunk under the crown`);
    assert.ok(reference.heightM >= heightM.min && reference.heightM <= heightM.max, name);
    assert.equal(profile[0][1], 0, 'starts at the foot');
    assert.equal(profile.at(-1)[0], 0, 'ends on the axis');
    assert.equal(profile.at(-1)[1], reference.heightM, `${name}: the apex is the reference height`);
    assert.ok(profile.every((p, i) => i === 0 || p[1] >= profile[i - 1][1]), `${name}: heights never fall`);
    const widest = Math.max(...profile.map((p) => p[0]));
    assert.ok(Math.abs(widest * 2 - reference.crownWidthM) < 0.01, `${name}: crown width`);
    inRange(reference.crownWidthM / reference.heightM, crownRatio.min, crownRatio.max, `${name} ratio`);
    const alt = tree.snowLoad.byAltM.map((p) => p[0]);
    assert.deepEqual(alt, [...alt].sort((x, y) => x - y), `${name}: snow load altitudes ascend`);
    tree.snowLoad.byAltM.forEach(([, frac]) => inRange(frac, 0, 1, name));
    assert.ok(render.minPxHeight >= 2 && render.mesh.withinM === render.billboard.fromM, name);
   }
  }
  const mix = ENV.trees.sets.pine.mix.firShareByAltM;
  const fades = mix.every((p, i) => i === 0 || (p[0] > mix[i - 1][0] && p[1] <= mix[i - 1][1]));
  assert.ok(fades, 'fir fades with altitude');
 });
 await t.test('treeline bands are ordered and thin out upward', () => {
  const bands = ENV.treeline.defaults.bandsRelativeToTreelineM;
  assert.deepEqual(bands.map((b) => b.id), ['forest', 'thinning', 'open', 'krummholz']);
  bands.forEach((b, i) => {
   if (i > 0) assert.ok(b.upToOffsetM > bands[i - 1].upToOffsetM && b.densityPerHa <= bands[i - 1].densityPerHa, b.id);
   inRange(b.densityPerHa, 0, 2000, b.id);
   inRange(b.heightScale, 0.05, 1, b.id);
  });
  assert.equal(bands.find((b) => b.id === 'open').upToOffsetM, 0, 'open ends at the last trees');
  const x = ENV.treeline.defaults.exclusion;
  inRange(x.pisteMarginM, 1, 50, 'piste margin');
  inRange(x.maxSlopeDeg, 20, 60, 'tree slope');
  const c = ENV.treeline.defaults.clustering;
  assert.ok(c.patchThreshold.forest < c.patchThreshold.thinning && c.patchThreshold.thinning < c.patchThreshold.open);
  assert.ok(c.clumpTrees.min <= c.clumpTrees.max && c.minSpacingM > 0 && c.patchScaleM > 0);
 });
 await t.test('El Tarter treeline: absolute bands follow the defaults, and the course crosses them in order', () => {
  const tl = TARTER.treeline;
  const bands = ENV.treeline.defaults.bandsRelativeToTreelineM;
  assert.equal(tl.treelineM, TARTER.treelineM, 'the art-directed treeline is kept');
  for (const b of bands) assert.equal(tl.bandUpToM[b.id], tl.treelineM + b.upToOffsetM, b.id);
  const shift = ENV.treeline.defaults.aspectShiftM;
  for (const side of ['north', 'east', 'south', 'west']) assert.equal(tl.aspectShiftM[side], shift[side]);
  const starts = tl.courseBandStartS;
  const order = ['krummholz', 'open', 'thinning', 'forest'].map((id) => starts[id]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'down the run: krummholz, open, thinning, forest');
  assert.ok(order[0] > COURSE.startS && order[3] < COURSE.finishS);
 });
 await t.test('bushes and rocks: sizes, slopes and the snow rule', () => {
  const depth = ENV.bushes.snowDepthByAltM;
  assert.ok(depth.every((p, i) => i === 0 || p[0] > depth[i - 1][0]), 'depth altitudes ascend');
  for (const [id, k] of Object.entries(ENV.bushes.kinds)) {
   assert.ok(k.heightM.min > 0 && k.heightM.min <= k.heightM.max && k.heightM.max <= 4, id);
   assert.ok(k.widthM.min > 0 && k.widthM.min <= k.widthM.max, id);
   inRange(k.snowCover, 0, 1, id);
   assert.ok(k.minPxHeight >= 1, id);
   for (const n of Object.values(k.densityPerHa)) inRange(n, 0, 1000, id);
  }
  for (const [id, k] of Object.entries(ENV.rocks.kinds)) {
   const size = k.sizeM || k.widthM || k.lengthM;
   assert.ok(size.min > 0 && size.min <= size.max, id);
   if (k.slopeDeg) assert.ok(k.slopeDeg.min >= 0 && k.slopeDeg.min < k.slopeDeg.max && k.slopeDeg.max <= 90, id);
  }
  const s = ENV.rocks.snowRule.slopeDeg;
  assert.ok(s.snowFull <= s.patchy && s.patchy < s.rockShows && s.rockShows < s.mostlyRock && s.mostlyRock < s.bare);
  assert.equal(s.rockShows, 38, 'the existing rule: rock over 38 degrees (trees.placement.rocks)');
  assert.equal(ENV.rocks.kinds.cliffBand.slopeDeg.min, s.bare, 'a cliff band starts where the ground is bare');
  const share = ENV.rocks.snowRule.rockShareAt;
  assert.ok(share.every((p, i) => i === 0 || (p[0] > share[i - 1][0] && p[1] > share[i - 1][1])), 'rock share rises');
  assert.deepEqual([share[0][1], share.at(-1)[1]], [0, 1]);
  assert.ok(ENV.rocks.snowCap.depthM.min < ENV.rocks.snowCap.depthM.max);
 });
});

test('environment: sky and backdrop layers', async (t) => {
 await t.test('the sky gradient runs from zenith to haze, and the haze rises with distance', () => {
  const stops = ENV.sky.stops;
  stops.forEach((s, i) => {
   inRange(s.elevationDeg, -90, 90, 'sky stop');
   if (i > 0) assert.ok(s.elevationDeg < stops[i - 1].elevationDeg, 'stops run downward');
  });
  assert.equal(stops[0].elevationDeg, 90);
  assert.equal(stops[0].role, 'skyTop');
  const haze = ENV.sky.haze.stops;
  haze.forEach((s, i) => {
   inRange(s.mix, 0, 1, 'haze mix');
   if (i > 0) assert.ok(s.distM > haze[i - 1].distM && s.mix >= haze[i - 1].mix, 'haze distance and mix ascend');
  });
  assert.equal(haze[1].distM, HANGA.terrain.fog.start, 'haze starts where terrain.fog starts');
  const sun = ENV.sky.sun;
  inRange(sun.discDiameterDeg, 0.5, 15, 'sun disc');
  assert.ok(sun.glow.radiusDeg > sun.discDiameterDeg);
  inRange(sun.glow.alphaCentre, 0, 1, 'glow');
  assert.ok(ENV.sky.followsSun.warmSide.dawnStopElevationDeg > ENV.sky.followsSun.coolSide.dawnStopElevationDeg);
 });
 await t.test('backdrop layers are contiguous bands of distance, hazier with range', () => {
  const layers = ENV.backdrops.pyrenees.layers;
  layers.forEach((l, i) => {
   assert.ok(l.minM > 0 && l.minM < l.maxM, l.id);
   inRange(l.hazeMix, 0, 1, l.id);
   inRange(l.parallax, 0, 1, l.id);
   if (i > 0) {
    assert.equal(l.minM, layers[i - 1].maxM, `${l.id} starts where ${layers[i - 1].id} ends`);
    assert.ok(l.hazeMix > layers[i - 1].hazeMix && l.parallax < layers[i - 1].parallax, l.id);
   }
  });
  const ridge = ENV.backdrops.pyrenees.ridge;
  inRange(ridge.floorElevDeg, -5, 0, 'floor');
  assert.equal(ridge.profile, 'triangle');
  inRange(ridge.verticalExaggeration, 1, 4, 'exaggeration');
 });
});

test('Pyrenees peaks: stored bearings and distances match a recompute from lat/lon', async (t) => {
 const projection = createProjection(TERRAIN.origin.lat, TERRAIN.origin.lon);
 const layer = terrainLayer(TERRAIN);
 const course = runCourse(TERRAIN, selectParts(TERRAIN, COURSE.run).parts, layer);
 const start = course.point(COURSE.startS, 0, {});
 const peaks = ENV.backdrops.pyrenees.peaks;
 await t.test('the start is the course start', () => {
  assert.ok(Math.abs(TARTER.startWorld.x - start.x) < 0.1 && Math.abs(TARTER.startWorld.y - start.y) < 0.1);
 });
 await t.test('between 6 and 10 peaks, each with a source, in range', () => {
  assert.ok(peaks.length >= 6 && peaks.length <= 10, `${peaks.length} peaks`);
  assert.equal(new Set(peaks.map((p) => p.id)).size, peaks.length);
  const layers = ENV.backdrops.pyrenees.layers;
  for (const p of peaks) {
   inRange(p.lat, 42, 43, p.id);
   inRange(p.lon, 1, 2, p.id);
   inRange(p.altM, 2000, 3500, p.id);
   inRange(p.bearingEnuDeg, 0, 359.99, p.id);
   inRange(p.bearingCompassDeg, 0, 359.99, p.id);
   inRange(p.distM, 1000, 60000, p.id);
   assert.ok(p.halfWidthM > 0 && p.source.length > 5, p.id);
   const own = layers.find((l) => l.id === p.layer);
   assert.ok(p.distM >= own.minM && p.distM < own.maxM, `${p.id} is in the ${p.layer} layer`);
  }
 });
 await t.test('bearing (ENU, counter-clockwise from east), compass bearing, distance and elevation angle', () => {
  const at = {};
  for (const p of peaks) {
   projection.toEnu(p.lat, p.lon, at);
   const dx = at.x - start.x;
   const dy = at.y - start.y;
   const enu = (Math.atan2(dy, dx) * RAD_TO_DEG + 360) % 360;
   const compass = (90 - enu + 360) % 360;
   const angleBetween = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
   assert.ok(angleBetween(p.bearingEnuDeg, enu) <= BEARING_TOL_DEG, `${p.id} ENU ${p.bearingEnuDeg} vs ${enu}`);
   assert.ok(angleBetween(p.bearingCompassDeg, compass) <= BEARING_TOL_DEG, `${p.id} compass`);
   assert.ok(Math.abs(p.distM - Math.hypot(dx, dy)) <= DIST_TOL_M, `${p.id} distance`);
   const elev = Math.atan2(p.altM - layer.height(start.x, start.y), Math.hypot(dx, dy)) * RAD_TO_DEG;
   assert.ok(Math.abs(p.elevDeg - elev) <= 0.02, `${p.id} elevation angle`);
  }
 });
 await t.test('the terrain-grid horizon from the start, and every peak above it', () => {
  const horizon = computeHorizon(TERRAIN, layer, start.x, start.y, 1);
  for (const p of peaks) {
   const there = horizon[Math.round(p.bearingCompassDeg) % 360];
   assert.ok(Math.abs(p.horizonAtStartDeg - there) <= 0.15, `${p.id} horizon ${p.horizonAtStartDeg} vs ${there}`);
   assert.ok(p.elevDeg > p.horizonAtStartDeg, `${p.id} is visible from the start`);
  }
 });
});

test('El Tarter: the data-derived keys match the baked files', async (t) => {
 const layer = terrainLayer(TERRAIN);
 const course = runCourse(TERRAIN, selectParts(TERRAIN, COURSE.run).parts, layer);
 const heightAt = (s) => {
  const p = course.point(s, 0, {});
  return layer.height(p.x, p.y);
 };
 await t.test('slope, height range, start and finish altitude', () => {
  assert.equal(TARTER.meanSlopeDegData, COURSE.meanSlopeDeg);
  const drop = heightAt(COURSE.startS) - heightAt(COURSE.finishS);
  const slope = Math.atan(drop / (COURSE.finishS - COURSE.startS)) * RAD_TO_DEG;
  assert.ok(Math.abs(slope - TARTER.meanSlopeDegData) < 0.01, 'atan(drop / length)');
  assert.deepEqual(TARTER.heightRangeM, { min: TERRAIN.heights.minM, max: TERRAIN.heights.maxM });
  assert.ok(Math.abs(heightAt(COURSE.startS) - TARTER.courseAltitudeM.start) < 0.1);
  assert.ok(Math.abs(heightAt(COURSE.finishS) - TARTER.courseAltitudeM.finish) < 0.1);
  assert.equal(TARTER.meanSlopeDeg, 16.5, 'the art-directed value is kept');
  assert.deepEqual(TARTER.sunData, { azimuthDeg: COURSE.sun.azimuthDeg, elevationDeg: COURSE.sun.elevationDeg });
 });
 await t.test('fall line bearing and the altitude where the course passes each band limit', () => {
  const end = course.point(COURSE.finishS, 0, {});
  const start = course.point(COURSE.startS, 0, {});
  const bearing = (Math.atan2(end.x - start.x, end.y - start.y) * RAD_TO_DEG + 360) % 360;
  assert.ok(Math.abs(bearing - TARTER.fallLineCompassDeg) < 0.5, `fall line ${bearing}`);
  const tl = TARTER.treeline;
  for (const id of ['krummholz', 'open', 'thinning', 'forest']) {
   const level = id === 'forest' ? tl.bandUpToM.forest : id === 'thinning' ? tl.bandUpToM.thinning
    : id === 'open' ? tl.bandUpToM.open : tl.bandUpToM.krummholz;
   const height = heightAt(tl.courseBandStartS[id]);
   assert.ok(Math.abs(height - level) < 4, `${id}: ${height} vs ${level}`);
  }
 });
});
