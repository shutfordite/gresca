// @areas view
// Art spec v1.6: the park look (jump snow, dyed lines, rails and boxes with legs and bases, piste pole colours).
// Everything in v1.5.0 must be unchanged; the new data is a top-level `park` and new palette roles only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HANGA = require('../art/gresca-hanga-spec.js');
const V15 = require('./fixtures/hanga-spec-v1.5.0.cjs');
const PARK = HANGA.park;

const NEW_ROLES = ['parkTakeLit', 'parkTakeMid', 'parkTakeShade', 'parkTableLit', 'parkTableMid', 'parkTableShade',
 'parkLandLit', 'parkLandMid', 'parkLandShade', 'parkWallLit', 'parkWallMid', 'parkWallShade', 'dyeLip', 'dyeLipS',
 'dyeKnuckle', 'dyeKnuckleS', 'railSteel', 'railSteelS', 'railTape', 'boxTop', 'boxEdge', 'boxSide', 'boxSideS',
 'boxEnd', 'legMetal', 'legMetalS', 'baseWood', 'baseWoodS', 'poleGreen', 'poleBlue', 'poleRed', 'poleBlack',
 'poleYellow', 'poleTop'];
const CLASSES = ['S', 'M', 'L', 'XL'];
const HEX = /^#[0-9A-F]{6}$/i;

const isObject = (v) => v !== null && typeof v === 'object';
const asLeaf = (v) => (typeof v === 'function' ? v.toString() : v);
function leaves(value, path = '', out = []) {
 if (isObject(value) && Object.keys(value).length > 0) {
  for (const [key, child] of Object.entries(value)) leaves(child, path + '/' + key, out);
 } else {
  out.push([path, asLeaf(value)]);
 }
 return out;
}
const valueAt = (root, path) => path.split('/').slice(1).reduce((node, key) => (isObject(node) ? node[key] : undefined), root);
const numbers = (v) => (typeof v === 'number' ? [v] : isObject(v) ? Object.values(v).flatMap(numbers) : []);
// Every palette role a value names: fields role, *Role (a string), lit, mid, shade, and the values of `roles`.
function roleRefs(value, key = '', out = []) {
 if (typeof value === 'string') {
  if (key === 'role' || key.endsWith('Role') || key === 'a' || key === 'b' || ['lit', 'mid', 'shade'].includes(key)) {
   out.push(value);
  }
 } else if (isObject(value) && !Array.isArray(value)) {
  for (const [k, child] of Object.entries(value)) {
   if (key === 'roles' && typeof child === 'string') out.push(child);
   else roleRefs(child, k, out);
  }
 }
 return out;
}
function contrast(a, b) {
 const lum = (role) => [1, 3, 5].map((i) => parseInt(HANGA.palette[role].slice(i, i + 2), 16) / 255)
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
 const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
 return (hi + 0.05) / (lo + 0.05);
}

test('v1.6 is additive over v1.5.0', async (t) => {
 await t.test('every key path and value of v1.5.0 is unchanged, apart from version', () => {
  const was = leaves(V15).filter(([path]) => path !== '/version');
  assert.ok(was.length > 4000, `${was.length} leaves checked`);
  for (const [path, value] of was) assert.deepEqual(asLeaf(valueAt(HANGA, path)), value, path);
 });
 await t.test('what is new: the park section and its palette roles only', () => {
  assert.equal(HANGA.version, '1.6.0');
  assert.deepEqual(Object.keys(HANGA).filter((k) => !(k in V15)), ['park']);
  assert.deepEqual(Object.keys(HANGA.palette).filter((k) => !(k in V15.palette)), NEW_ROLES);
  assert.deepEqual(Object.keys(HANGA.maps), Object.keys(V15.maps));
 });
 await t.test('projectRider gives the v1.5 draw list', () => {
  for (const rig of ['ski', 'board']) {
   for (const pose of V15.rider.poseOrder[rig]) {
    const want = JSON.stringify(V15.projectRider(rig, pose, 45, 25, 4, 'regular', { twistDeg: 10 }));
    assert.equal(JSON.stringify(HANGA.projectRider(rig, pose, 45, 25, 4, 'regular', { twistDeg: 10 })), want, pose);
   }
  }
 });
});

test('park: structure, roles and numbers', async (t) => {
 await t.test('every number is finite and positive, and no colour is a raw hex', () => {
  const all = numbers(PARK);
  assert.ok(all.length > 60, `${all.length} numbers`);
  all.forEach((n) => assert.ok(Number.isFinite(n) && n >= 0));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(JSON.stringify(PARK)), 'no raw hex');
  for (const role of NEW_ROLES) assert.match(HANGA.palette[role], HEX, role);
 });
 await t.test('every role the park names exists, and every new role is used', () => {
  const refs = roleRefs(PARK);
  assert.ok(refs.length > 40, `${refs.length} references`);
  for (const role of new Set(refs)) assert.ok(role in HANGA.palette, `role ${role}`);
  for (const role of NEW_ROLES) assert.ok(refs.includes(role), `${role} is used`);
 });
 await t.test('contrast targets hold', () => {
  const targets = [...PARK.jumps.contrastTargets, ...PARK.pistePoles.contrastTargets];
  assert.ok(targets.length >= 15);
  for (const { a, b, min, why } of targets) {
   assert.ok(contrast(a, b) >= min, `${why}: ${a} on ${b} is ${contrast(a, b).toFixed(2)}, needs ${min}`);
  }
 });
});

test('park: jumps', async (t) => {
 await t.test('the four surfaces each have a lit, mid and shade role that darken in that order', () => {
  const lum = (role) => contrast(role, 'key');
  for (const name of ['takeoff', 'table', 'landing', 'sidewall']) {
   const s = PARK.jumps.surfaces[name];
   assert.ok(['corduroy', 'packed', 'groomed'].includes(s.finish), name);
   assert.ok(lum(s.lit) > lum(s.mid) && lum(s.mid) > lum(s.shade), `${name} lit > mid > shade`);
  }
  assert.ok(PARK.jumps.surfaces.takeoff.cordPeriodM > 0);
 });
 await t.test('the takeoff is a warm tint of the piste and the landing a cool one (a hue change)', () => {
  const rgb = (role) => HANGA.palette[role].slice(1).match(/../g).map((h) => parseInt(h, 16));
  const [tr, , tb] = rgb(PARK.jumps.surfaces.takeoff.lit);
  const [lr, , lb] = rgb(PARK.jumps.surfaces.landing.lit);
  assert.ok(tr - tb > 15, 'takeoff leans warm');
  assert.ok(lb - lr > 10, 'landing leans cool');
 });
 await t.test('dye widths grow with the class, lip line narrower than knuckle line, both in metres under 1', () => {
  for (const line of ['lip', 'knuckle']) {
   const w = CLASSES.map((c) => PARK.jumps.dyeLines[line].widthByClassM[c]);
   assert.ok(w.every((v, i) => v > 0 && v < 1 && (i === 0 || v > w[i - 1])), `${line} ${w}`);
  }
  for (const c of CLASSES) {
   assert.ok(PARK.jumps.dyeLines.lip.widthByClassM[c] < PARK.jumps.dyeLines.knuckle.widthByClassM[c], c);
  }
  assert.notEqual(PARK.jumps.dyeLines.lip.role, PARK.jumps.dyeLines.knuckle.role);
 });
 await t.test('sidewalls grow with the class and are steep and groomed', () => {
  const sw = PARK.jumps.sidewalls;
  assert.ok(sw.slopeDeg >= 40 && sw.slopeDeg <= 70);
  for (const key of ['topWidthM', 'heightOverTableM']) {
   const v = CLASSES.map((c) => sw.byClass[c][key]);
   assert.ok(v.every((x, i) => i === 0 || x > v[i - 1]), `${key} ${v}`);
  }
 });
 await t.test('the reference profiles sit inside the K sizing table', () => {
  const k = {
   S: { lip: [0.6, 1.5], angle: [15, 25], table: [3, 6], land: [25, 28], len: [10, 15] },
   M: { lip: [1.5, 2.5], angle: [25, 30], table: [8, 12], land: [28, 30], len: [15, 20] },
   L: { lip: [2.5, 4], angle: [28, 32], table: [14, 20], land: [30, 32], len: [20, 28] },
   XL: { lip: [4, 8], angle: [30, 35], table: [20, 30], land: [32, 35], len: [30, 40] },
  };
  for (const c of CLASSES) {
   const s = PARK.sizes[c];
   const within = (v, [lo, hi], what) => assert.ok(v >= lo && v <= hi, `${c} ${what} ${v}`);
   within(s.lipHeightM, k[c].lip, 'lip');
   within(s.lipAngleDeg, k[c].angle, 'angle');
   within(s.tableM, k[c].table, 'table');
   within(s.landingDeg, k[c].land, 'landing');
   within(s.landingLengthM, k[c].len, 'landing length');
  }
 });
});

test('park: rails, boxes, legs, bases and poles', async (t) => {
 await t.test('rail tube 5 to 10 cm, box width 0.3 to 0.6 m, as K says', () => {
  const d = PARK.rails.tube.diameterM;
  assert.equal(d.min, 0.05);
  assert.equal(d.max, 0.1);
  assert.ok(d.standard >= d.min && d.standard <= d.max);
  const w = PARK.boxes.widthM;
  assert.equal(w.min, 0.3);
  assert.equal(w.max, 0.6);
  assert.ok(w.standard >= w.min && w.standard <= w.max);
 });
 await t.test('the tube, box deck and sides read against lit snow and snow in shade', () => {
  for (const role of [PARK.rails.tube.role, PARK.boxes.top.role, PARK.boxes.sides.role, PARK.rails.legs.role]) {
   assert.ok(contrast(role, 'pisteLit') >= 2.5 && contrast(role, 'pisteShade') >= 2.2, role);
  }
  assert.ok(contrast(PARK.boxes.top.edgeRole, PARK.boxes.top.role) >= 3, 'edge strip on the deck');
 });
 await t.test('legs and bases are thinner or lower than what they carry', () => {
  assert.ok(PARK.rails.legs.diameterM <= PARK.rails.tube.diameterM.standard, 'leg no fatter than the tube');
  assert.ok(PARK.rails.legs.everyM > 0 && PARK.boxes.legs.everyM > 0);
  assert.ok(PARK.rails.base.buriedM > 0 && PARK.rails.base.buriedM < PARK.rails.base.heightM, 'base mostly buried');
  assert.ok(PARK.boxes.base.buriedM < PARK.boxes.base.heightM);
 });
 await t.test('piste poles: the Look\'s six colour keys each have a role, and every difficulty a colour', () => {
  assert.deepEqual(Object.keys(PARK.pistePoles.roles), ['green', 'blue', 'red', 'black', 'yellow', 'rightTop']);
  for (const tone of Object.values(PARK.pistePoles.difficultyTone)) assert.ok(tone in PARK.pistePoles.roles, tone);
  assert.deepEqual(Object.keys(PARK.pistePoles.difficultyTone),
   ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'extreme', 'freeride']);
  assert.equal(PARK.pistePoles.heightM, 2.3);
 });
});
